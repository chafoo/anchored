/**
 * Spec-adherence meta-test — catches drift between plugin docs and
 * the actual MCP service-layer.
 *
 * Specifically: every `mcp__task__<tool>` reference in the plugin's
 * SKILL.md and agents/*.md must be a tool the MCP server actually
 * exposes. Would have caught `phase_create` (referenced in
 * impl-plan/SKILL.md but never built).
 */

import { describe, it, expect } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = join(__dirname, '../../plugin');
const TOOLS_DIR = join(__dirname, '../src/mcp/tools');

async function walkMarkdownFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkMarkdownFiles(full)));
    } else if (entry.name.endsWith('.md')) {
      files.push(full);
    }
  }
  return files;
}

async function getRegisteredToolNames(): Promise<string[]> {
  const entries = await readdir(TOOLS_DIR);
  const names: string[] = [];
  for (const entry of entries) {
    if (entry === 'index.ts' || entry === '_shared.ts' || !entry.endsWith('.ts'))
      continue;
    const content = await readFile(join(TOOLS_DIR, entry), 'utf-8');
    // Match `name: 'foo_bar'` or `name: 'task__foo_bar'` declarations
    const match = content.match(/name:\s*['"]([a-z_]+)['"]/);
    if (match && match[1]) names.push(match[1]);
  }
  return names.sort();
}

/**
 * Strip the `task__` namespace prefix from a registered tool name so
 * it lines up with the bare-name format used in plugin docs after
 * `mcp__task__`. Idempotent for already-bare names.
 */
function stripNamespacePrefix(name: string): string {
  return name.startsWith('task__') ? name.slice('task__'.length) : name;
}

async function getReferencedTools(): Promise<Map<string, string[]>> {
  const files = await walkMarkdownFiles(PLUGIN_DIR);
  const refs = new Map<string, string[]>(); // tool → files that reference it
  for (const file of files) {
    const content = await readFile(file, 'utf-8');
    const matches = content.matchAll(/mcp__task__([a-z_]+)/g);
    for (const m of matches) {
      const tool = m[1]!;
      const list = refs.get(tool) ?? [];
      list.push(file.replace(PLUGIN_DIR + '/', ''));
      refs.set(tool, list);
    }
  }
  return refs;
}

describe('plugin spec adherence', () => {
  it('every referenced mcp__task__* tool exists in the MCP server', async () => {
    const registered = new Set(
      (await getRegisteredToolNames()).map(stripNamespacePrefix),
    );
    const referenced = await getReferencedTools();

    const orphans: { tool: string; files: string[] }[] = [];
    for (const [tool, files] of referenced.entries()) {
      if (!registered.has(tool)) {
        orphans.push({ tool, files });
      }
    }

    if (orphans.length > 0) {
      const detail = orphans
        .map(
          (o) =>
            `  - mcp__task__${o.tool} (referenced in ${o.files.length} file(s): ${o.files.join(', ')})`,
        )
        .join('\n');
      const msg = `Spec drift — these MCP tools are referenced in plugin docs but NOT registered in mcp/src/mcp/tools/:\n${detail}\n\nFix: either implement the tool or update the doc to use an existing one.\n\nRegistered tools: [${[...registered].join(', ')}]`;
      expect.fail(msg);
    }
  });

  it('every registered MCP tool follows snake_case naming with optional namespace prefix', async () => {
    const tools = await getRegisteredToolNames();
    // Tool names are either bare snake_case ("read") or
    // namespace-prefixed via the double-underscore separator
    // ("task__add_ac"). Matches Claude Code's MCP tool-naming
    // convention: mcp__<namespace>__<tool>.
    const pattern = /^([a-z]+__)?[a-z]+(_[a-z]+)*$/;
    for (const tool of tools) {
      expect(tool, `tool name "${tool}" should be snake_case`).toMatch(pattern);
    }
  });

  it('there is at least one registered tool (sanity)', async () => {
    const tools = await getRegisteredToolNames();
    expect(tools.length).toBeGreaterThan(0);
  });
});
