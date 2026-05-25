/**
 * Line-based parser for anchored task-files.
 *
 * Reads a Markdown document and returns the typed TaskFile structure
 * defined in `schema/task-file.ts`. Round-trip safe — anything the
 * renderer can handle, the parser can read back.
 *
 * Strategy: scan once, tracking which structural region each line
 * belongs to (frontmatter / heading / phase block / etc.). Heading
 * boundaries demarcate regions. Within phase blocks we use a small
 * sub-parser for the bullet-key-value structure.
 *
 * Why line-based instead of an MD AST: predictability + simplicity.
 * AST libraries normalize whitespace in ways that break round-trip;
 * line-based code controls exactly what's preserved.
 */

import { parse as parseYaml } from 'yaml';

import {
  type TaskFile,
  type Phase,
  type AcceptanceCriterion,
  type PhaseRule,
  TaskStatus,
  PhaseStatus,
  parseTaskFile,
} from '../schema/task-file.js';

// ─────────────────────────────────────────────────────────────────────
// public API
// ─────────────────────────────────────────────────────────────────────

/**
 * Parse a raw task-file (string) into a typed TaskFile.
 * Throws on schema violation; the orchestrator catches and surfaces.
 */
export function parse(input: string): TaskFile {
  const lines = input.split('\n');

  // 1. Split frontmatter
  const fmEnd = findFrontmatterEnd(lines);
  if (fmEnd === -1) {
    throw new ParseError('missing frontmatter (--- block) at top of file');
  }
  const fmRaw = lines.slice(1, fmEnd).join('\n');
  const bodyLines = lines.slice(fmEnd + 1);

  // 2. Parse frontmatter YAML
  const fmObj = parseYaml(fmRaw) as Record<string, unknown> | null;
  if (!fmObj || typeof fmObj !== 'object') {
    throw new ParseError('frontmatter is empty or not an object');
  }
  const frontmatter = extractFrontmatter(fmObj);

  // 3. Locate H1 title
  let titleIdx = -1;
  for (let i = 0; i < bodyLines.length; i++) {
    const m = bodyLines[i]?.match(/^# (.+)$/);
    if (m) {
      titleIdx = i;
      break;
    }
  }
  if (titleIdx === -1) throw new ParseError('missing H1 title');
  const title = bodyLines[titleIdx]!.replace(/^# /, '').trim();

  // 4. Build section index from the body after the H1
  const afterTitle = bodyLines.slice(titleIdx + 1);
  const sections = indexSections(afterTitle);

  // 5. Extract ## Context with its sub-sections
  const contextRaw = sliceSection(afterTitle, sections.context);
  const context = parseContextSection(contextRaw);

  // 6. Extract ## Phases
  const phasesRaw = sliceSection(afterTitle, sections.phases);
  const phases = parsePhasesSection(phasesRaw);

  // 7. Custom H2 sections (anything else)
  const customSections: Record<string, string> = {};
  for (const [name, range] of Object.entries(sections.customH2)) {
    customSections[name] = sliceSection(afterTitle, range).join('\n').trim();
  }

  return parseTaskFile({
    frontmatter,
    title,
    context,
    phases,
    customSections,
  });
}

// ─────────────────────────────────────────────────────────────────────
// frontmatter
// ─────────────────────────────────────────────────────────────────────

function findFrontmatterEnd(lines: string[]): number {
  if (lines[0]?.trim() !== '---') return -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === '---') return i;
  }
  return -1;
}

function extractFrontmatter(obj: Record<string, unknown>): TaskFile['frontmatter'] {
  const KNOWN = new Set(['slug', 'status', 'created']);
  const extensions: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!KNOWN.has(k)) extensions[k] = v;
  }
  // Coerce to schema types — Zod will validate downstream
  return {
    slug: String(obj['slug'] ?? ''),
    status: TaskStatus.parse(obj['status']),
    created: String(obj['created'] ?? ''),
    extensions,
  };
}

// ─────────────────────────────────────────────────────────────────────
// section index
// ─────────────────────────────────────────────────────────────────────

interface SectionRange {
  start: number; // first line index AFTER the heading
  end: number;   // exclusive; line index of next H2 or end-of-body
}

interface SectionIndex {
  context: SectionRange;
  phases: SectionRange;
  customH2: Record<string, SectionRange>;
}

function indexSections(lines: string[]): SectionIndex {
  const h2s: { name: string; lineIdx: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i]?.match(/^## (.+)$/);
    if (m && m[1]) h2s.push({ name: m[1].trim(), lineIdx: i });
  }

  let context: SectionRange | null = null;
  let phases: SectionRange | null = null;
  const customH2: Record<string, SectionRange> = {};

  for (let i = 0; i < h2s.length; i++) {
    const h = h2s[i]!;
    const next = h2s[i + 1];
    const range: SectionRange = {
      start: h.lineIdx + 1,
      end: next ? next.lineIdx : lines.length,
    };
    if (h.name === 'Context') context = range;
    else if (h.name === 'Phases') phases = range;
    else customH2[h.name] = range;
  }

  if (!context) throw new ParseError('missing ## Context section');
  if (!phases) throw new ParseError('missing ## Phases section');

  return { context, phases, customH2 };
}

function sliceSection(lines: string[], range: SectionRange): string[] {
  return lines.slice(range.start, range.end);
}

// ─────────────────────────────────────────────────────────────────────
// Context section parsing (H3 sub-sections + H4 sub-sub-sections)
// ─────────────────────────────────────────────────────────────────────

function parseContextSection(lines: string[]): TaskFile['context'] {
  // First chunk (before any ### heading) = intro prose
  let firstH3 = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]?.match(/^### /)) {
      firstH3 = i;
      break;
    }
  }
  const intro = lines.slice(0, firstH3).join('\n').trim();

  // Index H3 sub-sections
  interface H3Range {
    name: string;
    start: number;
    end: number;
  }
  const h3s: H3Range[] = [];
  for (let i = firstH3; i < lines.length; i++) {
    const m = lines[i]?.match(/^### (.+)$/);
    if (m && m[1]) {
      // Find next H3 or end
      let end = lines.length;
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j]?.match(/^### /)) {
          end = j;
          break;
        }
      }
      h3s.push({ name: m[1].trim(), start: i + 1, end });
      i = end - 1; // outer loop will increment
    }
  }

  let plan: string | undefined;
  const build: Record<string, string> = {};
  let wrap: TaskFile['context']['wrap'];

  for (const h3 of h3s) {
    const chunk = lines.slice(h3.start, h3.end);
    if (h3.name === 'Plan') {
      plan = chunk.join('\n').trim();
    } else if (h3.name === 'Build') {
      Object.assign(build, parseH4Subsections(chunk));
    } else if (h3.name === 'Wrap') {
      wrap = parseWrapSection(chunk);
    }
    // Unknown H3 silently dropped — V0.3 may preserve as customH3
  }

  return {
    intro,
    plan,
    build,
    wrap,
  };
}

/** Parse H4 sub-sections from a chunk under an H3 heading. */
function parseH4Subsections(lines: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  let i = 0;
  while (i < lines.length) {
    const m = lines[i]?.match(/^#### (.+)$/);
    if (m && m[1]) {
      const name = m[1].trim();
      let end = lines.length;
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j]?.match(/^#### /)) {
          end = j;
          break;
        }
      }
      out[name] = lines.slice(i + 1, end).join('\n').trim();
      i = end;
    } else {
      i++;
    }
  }
  return out;
}

/** Parse the ### Wrap chunk into intro + H4 subsections. */
function parseWrapSection(lines: string[]): TaskFile['context']['wrap'] {
  let firstH4 = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]?.match(/^#### /)) {
      firstH4 = i;
      break;
    }
  }
  const intro = lines.slice(0, firstH4).join('\n').trim();
  const subsections = parseH4Subsections(lines.slice(firstH4));
  return {
    intro: intro || undefined,
    subsections,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Phases section parsing
// ─────────────────────────────────────────────────────────────────────

function parsePhasesSection(lines: string[]): Phase[] {
  // Index H3 phase headings
  interface PhaseRange {
    name: string;
    start: number; // line after H3
    end: number;
  }
  const phases: PhaseRange[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i]?.match(/^### (.+)$/);
    if (m && m[1]) {
      let end = lines.length;
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j]?.match(/^### /)) {
          end = j;
          break;
        }
      }
      phases.push({ name: m[1].trim(), start: i + 1, end });
      i = end - 1;
    }
  }

  return phases.map((p) => parsePhaseBlock(p.name, lines.slice(p.start, p.end)));
}

function parsePhaseBlock(name: string, body: string[]): Phase {
  // First, extract slug from <!-- id: ... -->
  let slug = '';
  for (const line of body) {
    const m = line.match(/^<!--\s*id:\s*([a-z][a-z0-9-]*)\s*-->/);
    if (m && m[1]) {
      slug = m[1];
      break;
    }
  }
  if (!slug) {
    // Derive from name if HTML comment missing — defensive
    slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  // Parse bullet-key-value pairs
  // Top-level bullets: `- key: value` or `- key:` (list-valued)
  // Sub-bullets indented under list-valued keys
  const top: Map<string, { rawValue: string; subLines: string[] }> = new Map();

  let i = 0;
  while (i < body.length) {
    const line = body[i] ?? '';
    const m = line.match(/^- ([a-z_][a-z0-9_]*): ?(.*)$/);
    if (m && m[1]) {
      const key = m[1];
      const rawValue = (m[2] ?? '').trim();
      // Collect indented sub-lines (2+ spaces or tab) below
      const subLines: string[] = [];
      let j = i + 1;
      while (j < body.length) {
        const next = body[j] ?? '';
        if (next.match(/^- [a-z_]/)) break; // next top-level bullet
        if (next.trim() === '') {
          subLines.push(next);
          j++;
          continue;
        }
        if (next.match(/^  /) || next.match(/^\t/)) {
          subLines.push(next);
          j++;
        } else {
          break;
        }
      }
      top.set(key, { rawValue, subLines });
      i = j;
    } else {
      i++;
    }
  }

  // Extract known fields
  const statusRaw = top.get('status')?.rawValue ?? 'pending';
  const status = PhaseStatus.parse(statusRaw);
  const context = top.get('context')?.rawValue || undefined;

  // rules: list of { path, why }
  let rules: PhaseRule[] | undefined;
  const rulesBlock = top.get('rules');
  if (rulesBlock) {
    rules = parseRulesSubList(rulesBlock.subLines);
    if (rules.length === 0) rules = undefined;
  }

  // acceptance_criteria: list of { text, evidence }
  const acBlock = top.get('acceptance_criteria');
  if (!acBlock) {
    throw new ParseError(`phase "${name}" missing acceptance_criteria`);
  }
  const acceptanceCriteria = parseAcceptanceCriteriaSubList(acBlock.subLines);

  // Anything else = user extension (preserve raw scalar value)
  const KNOWN = new Set(['status', 'context', 'rules', 'acceptance_criteria']);
  const extensions: Record<string, unknown> = {};
  for (const [key, val] of top.entries()) {
    if (!KNOWN.has(key) && val.rawValue !== '') {
      extensions[key] = coerceScalar(val.rawValue);
    }
  }

  const phase: Phase = {
    name,
    slug,
    status,
    acceptanceCriteria,
    extensions,
  };
  if (context) phase.context = context;
  if (rules) phase.rules = rules;
  return phase;
}

function parseRulesSubList(subLines: string[]): PhaseRule[] {
  // Each rule is two indented sub-bullets:
  //   - path: <path>
  //     why: <reason>
  const rules: PhaseRule[] = [];
  let current: Partial<PhaseRule> = {};
  for (const line of subLines) {
    const pathM = line.match(/^\s+-\s+path:\s*(.+)$/);
    const whyM = line.match(/^\s+why:\s*(.+)$/);
    if (pathM && pathM[1]) {
      // Flush previous if complete
      if (current.path && current.why) {
        rules.push({ path: current.path, why: current.why });
      }
      current = { path: pathM[1].trim() };
    } else if (whyM && whyM[1]) {
      current.why = whyM[1].trim();
    }
  }
  if (current.path && current.why) {
    rules.push({ path: current.path, why: current.why });
  }
  return rules;
}

function parseAcceptanceCriteriaSubList(subLines: string[]): AcceptanceCriterion[] {
  // Each AC is:
  //   - <criterion text>
  //     evidence: <string>
  const acs: AcceptanceCriterion[] = [];
  let currentText: string | null = null;
  for (const line of subLines) {
    const itemM = line.match(/^\s+-\s+(.+)$/);
    const evM = line.match(/^\s+evidence:\s*(.*)$/);
    if (itemM && itemM[1] && !evM) {
      // Flush previous if it had no evidence (defensive)
      if (currentText !== null) {
        acs.push({ text: currentText, evidence: '—' });
      }
      currentText = itemM[1].trim();
    } else if (evM) {
      const evidence = evM[1]?.trim() || '—';
      if (currentText !== null) {
        acs.push({ text: currentText, evidence });
        currentText = null;
      }
    }
  }
  if (currentText !== null) {
    acs.push({ text: currentText, evidence: '—' });
  }
  return acs;
}

// ─────────────────────────────────────────────────────────────────────
// utility
// ─────────────────────────────────────────────────────────────────────

function coerceScalar(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed === '—' || trimmed === '') return null;
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

export class ParseError extends Error {
  constructor(message: string) {
    super(`anchored parser: ${message}`);
    this.name = 'ParseError';
  }
}
