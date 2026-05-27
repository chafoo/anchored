/**
 * Agent frontmatter contract — guards against the silent-failure mode
 * where an agent's prompt instructs it to call MCP tools that aren't
 * listed in its `tools:` declaration. Claude Code only exposes
 * tools listed in the frontmatter; mismatches lead to runtime
 * "tool not available" errors and orchestrator workarounds.
 *
 * This caught us once during dogfood run #4: the implement agent's
 * prompt told it to use mcp__task__set_evidence, but its
 * frontmatter only listed Read/Write/Edit/Bash/Glob/Grep — so it
 * silently failed and the orchestrator had to do all MCP calls
 * itself, hollowing out the agent's contract.
 *
 * These tests scan each agent.md and assert that every MCP tool
 * mentioned in the prompt body is also declared in `tools:`.
 */

import { describe, it, expect } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AGENTS_DIR = join(__dirname, '..', '..', 'plugin', 'agents');

interface ParsedAgent {
  name: string;
  filePath: string;
  raw: string;
  frontmatter: {
    name: string;
    tools?: string;
    model?: string;
  };
  body: string;
}

async function listAgents(): Promise<ParsedAgent[]> {
  const entries = await readdir(AGENTS_DIR, { withFileTypes: true });
  const mdFiles = entries
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => e.name);

  return Promise.all(
    mdFiles.map(async (name) => {
      const filePath = join(AGENTS_DIR, name);
      const raw = await readFile(filePath, 'utf-8');
      const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
      if (!match) {
        throw new Error(`agent ${name} has no frontmatter`);
      }
      const frontmatter = parseYaml(match[1]!) as ParsedAgent['frontmatter'];
      const body = match[2]!;
      return { name: name.replace(/\.md$/, ''), filePath, raw, frontmatter, body };
    }),
  );
}

function declaredTools(agent: ParsedAgent): Set<string> {
  if (!agent.frontmatter.tools) return new Set();
  return new Set(
    agent.frontmatter.tools.split(',').map((s) => s.trim()).filter(Boolean),
  );
}

function mentionedMcpTools(agent: ParsedAgent): Set<string> {
  // Match `mcp__<server>__<tool>` references where <tool> is an actual
  // identifier (starts with a letter, contains word chars).
  //
  // Explicitly EXCLUDES wildcard references like `mcp__task__*`
  // that appear in documentation prose ("all mcp__task__* tools...")
  // — those aren't tool invocations, they're patterns describing the
  // namespace.
  const matches =
    agent.body.match(/\bmcp__[a-zA-Z][a-zA-Z0-9_]*__[a-zA-Z][a-zA-Z0-9_]*\b/g) ?? [];
  return new Set(matches);
}

describe('agent frontmatter — declared tools cover what prompt uses', () => {
  it('finds at least one agent to validate (smoke)', async () => {
    const agents = await listAgents();
    expect(agents.length).toBeGreaterThan(0);
  });

  it('every agent declares a name matching its filename', async () => {
    const agents = await listAgents();
    for (const a of agents) {
      expect(a.frontmatter.name).toBe(a.name);
    }
  });

  it('every MCP tool referenced in an agent prompt is in its tools list', async () => {
    const agents = await listAgents();
    const errors: string[] = [];

    for (const a of agents) {
      const declared = declaredTools(a);
      const mentioned = mentionedMcpTools(a);
      const missing = [...mentioned].filter((m) => !declared.has(m));
      if (missing.length > 0) {
        errors.push(
          `${a.name}.md: prompt mentions MCP tools not in frontmatter:\n  ` +
            missing.map((m) => `- ${m}`).join('\n  '),
        );
      }
    }

    if (errors.length > 0) {
      throw new Error(
        'Agent frontmatter / prompt mismatch detected:\n\n' +
          errors.join('\n\n') +
          '\n\nFix by adding the missing tools to the agent\'s frontmatter ' +
          '`tools:` line. This prevents the "tool not available" runtime ' +
          'failure mode where the orchestrator has to do MCP work the ' +
          'agent should have done.',
      );
    }
  });

  it('every agent that lists MCP tools also includes mcp__task__read (for state inspection)', async () => {
    const agents = await listAgents();
    for (const a of agents) {
      const declared = declaredTools(a);
      const mcpTools = [...declared].filter((t) => t.startsWith('mcp__task__'));
      if (mcpTools.length > 0) {
        // any agent doing MCP work should be able to read the task-file
        // (otherwise they're mutating blind)
        expect(
          mcpTools.includes('mcp__task__read'),
          `${a.name}.md declares MCP tools but is missing mcp__task__read — ` +
            `agents that mutate without first reading the file are doing ` +
            `blind writes against the service-layer`,
        ).toBe(true);
      }
    }
  });
});

describe('agent frontmatter — known anchored agents are wired correctly', () => {
  it('implement agent has the write-path MCP tools it needs', async () => {
    const agents = await listAgents();
    const impl = agents.find((a) => a.name === 'implement');
    expect(impl, 'implement.md exists').toBeDefined();
    const declared = declaredTools(impl!);
    const required = [
      'mcp__task__read',
      'mcp__task__set_evidence',
      'mcp__task__set_phase_status',
      'mcp__task__append_build_section',
    ];
    for (const t of required) {
      expect(declared.has(t), `implement.md missing required tool: ${t}`).toBe(true);
    }
  });

  it('task-validate agent can write failures + rollup via MCP', async () => {
    const agents = await listAgents();
    const tv = agents.find((a) => a.name === 'task-validate');
    expect(tv, 'task-validate.md exists').toBeDefined();
    const declared = declaredTools(tv!);
    expect(declared.has('mcp__task__set_failures')).toBe(true);
    expect(declared.has('mcp__task__append_build_section')).toBe(true);
  });

  it('code-validate agent can write failures + rollup via MCP', async () => {
    const agents = await listAgents();
    const cv = agents.find((a) => a.name === 'code-validate');
    expect(cv, 'code-validate.md exists').toBeDefined();
    const declared = declaredTools(cv!);
    expect(declared.has('mcp__task__set_failures')).toBe(true);
    expect(declared.has('mcp__task__append_build_section')).toBe(true);
  });

  it('plan agent creates the task-file via MCP, not Write', async () => {
    const agents = await listAgents();
    const plan = agents.find((a) => a.name === 'plan');
    expect(plan, 'plan.md exists').toBeDefined();
    const declared = declaredTools(plan!);
    expect(declared.has('mcp__task__read')).toBe(true);
    expect(declared.has('mcp__task__create')).toBe(true);
  });

  it('the legacy task-check and code-check files no longer exist', async () => {
    const agents = await listAgents();
    const names = agents.map((a) => a.name);
    expect(names).not.toContain('task-check');
    expect(names).not.toContain('code-check');
  });

  it('plan-check agent has the refinement-gate MCP tools it needs', async () => {
    const agents = await listAgents();
    const pc = agents.find((a) => a.name === 'plan-check');
    expect(pc, 'plan-check.md exists').toBeDefined();
    const declared = declaredTools(pc!);

    // Auto-fix surface: path patches + rule additions + info-note
    // appends + structured questions (priority-tagged). Plan-check
    // NEVER resolves questions (that's /impl-refine stage 3) — so
    // question_resolve is NOT required. It MAY call question_retag
    // to re-prioritize plan-agent's questions.
    const required = [
      'mcp__task__read',
      'mcp__task__set_phase_rules',
      'mcp__task__set_phase_context',
      'mcp__task__append_plan',
      'mcp__task__question_add',
    ];
    for (const t of required) {
      expect(declared.has(t), `plan-check.md missing required tool: ${t}`).toBe(true);
    }
  });

  it('plan-check agent is FORBIDDEN from intent-losing ops + Write/Edit', async () => {
    // plan-check's whole contract is: auto-fix only additive /
    // non-semantic items, surface everything else as a question.
    // Intent-bearing mutations (rewording an AC, removing an AC,
    // removing or moving a phase) must come from the user via the
    // Q&A loop or from /impl-plan, never from plan-check silently.
    // The frontmatter is the enforcement boundary — if these tools
    // aren't declared, the runtime simply can't call them.
    const agents = await listAgents();
    const pc = agents.find((a) => a.name === 'plan-check');
    expect(pc, 'plan-check.md exists').toBeDefined();
    const declared = declaredTools(pc!);

    const forbidden = [
      'Write',
      'Edit',
      'mcp__task__set_ac_text',
      'mcp__task__remove_ac',
      'mcp__task__remove_phase',
      'mcp__task__move_phase',
    ];
    for (const t of forbidden) {
      expect(
        declared.has(t),
        `plan-check.md must NOT declare ${t} — it's an intent-losing op ` +
          `(or a direct task-file Write/Edit). Anything intent-bearing has ` +
          `to surface as a question via append_plan, not be silently applied.`,
      ).toBe(false);
    }
  });
});

describe('agent frontmatter — bootstrap exception retirement (P6)', () => {
  // V0.2 retired every direct Write/Edit on the task-file from agent
  // prompts. plan-agent used to author via Write; the orchestrator's
  // Q&A loop used to Edit `→ ?` markers in place. Both are now driven
  // through MCP factory ops (`task__create`, `task__append_plan`,
  // `task__add_phase`, `task__resolve_question`). This test enforces
  // the no-bootstrap-exceptions design at the frontmatter level —
  // any agent that lists Write or Edit fails CI.
  it('no agent in plugin/agents/* declares Write or Edit in tools:', async () => {
    const agents = await listAgents();
    const violations: string[] = [];
    for (const a of agents) {
      const declared = declaredTools(a);
      if (declared.has('Write')) {
        violations.push(`${a.name}.md still declares Write — drop it (V0.2 bootstrap exception retired)`);
      }
      if (declared.has('Edit')) {
        violations.push(`${a.name}.md still declares Edit — drop it (V0.2 bootstrap exception retired)`);
      }
    }
    expect(violations, violations.join('\n')).toEqual([]);
  });
});
