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
  const mdFiles = entries.filter((e) => e.isFile() && e.name.endsWith('.md')).map((e) => e.name);

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
    agent.frontmatter.tools
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

// V0.2-era helper kept for potential future use. Currently unused in
// V0.3.1 because agents no longer declare MCP tools at all — see the
// "no plugin agent has mcp__task__* tools" test below.
function _mentionedMcpTools(agent: ParsedAgent): Set<string> {
  const matches = agent.body.match(/\bmcp__[a-zA-Z][a-zA-Z0-9_]*__[a-zA-Z][a-zA-Z0-9_]*\b/g) ?? [];
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

  it('no plugin agent has mcp__task__* tools (V0.3.1 — SKILLs own MCP)', async () => {
    // V0.3.1 architectural invariant: custom plugin subagents can't
    // access MCP tools due to bug #13605/#21560/#33689 (plugin-
    // subagent-MCP-unavailable). All plugin-defined agents in
    // plugin/agents/ are pure thinkers that return structured
    // output; the SKILL applies it via MCP. So no agent should
    // declare mcp__task__* tools in its frontmatter.
    const agents = await listAgents();
    const errors: string[] = [];

    for (const a of agents) {
      const declared = declaredTools(a);
      const mcpTaskTools = [...declared].filter((t) => t.startsWith('mcp__task__'));
      if (mcpTaskTools.length > 0) {
        errors.push(
          `${a.name}.md: declares mcp__task__* tools in frontmatter (forbidden in V0.3.1):\n  ` +
            mcpTaskTools.map((t) => `- ${t}`).join('\n  '),
        );
      }
    }

    if (errors.length > 0) {
      throw new Error(
        'V0.3.1 invariant violation — plugin agents may not declare mcp__task__* tools:\n\n' +
          errors.join('\n\n') +
          '\n\nPlugin-defined custom subagents cannot access MCP tools ' +
          '(bug #13605). Remove the mcp__task__* tools from the ' +
          'agent frontmatter; the agent should return structured output ' +
          'and the SKILL applies it via MCP.',
      );
    }
  });
});

describe('agent frontmatter — V0.3.1 architecture (skills own MCP, agents return structured output)', () => {
  // V0.3.1 background: Anthropic bugs #13605, #21560, #33689, #15810
  // confirm that custom plugin subagents cannot access MCP tools
  // regardless of how MCP is configured (project, user, plugin
  // scope — all fail). So all plugin/agents/* files in anchored are
  // pure thinkers that return structured output; the SKILLs (running
  // in the main session) apply the output via MCP. Each agent has
  // ONLY the read/inspect tools it needs for its specific job.

  it('plan agent: Read/Glob/Grep only (pure brainstorm thinker)', async () => {
    const agents = await listAgents();
    const a = agents.find((x) => x.name === 'plan');
    expect(a, 'plan.md exists').toBeDefined();
    const declared = declaredTools(a!);
    expect(declared.has('Read')).toBe(true);
    expect(declared.has('Glob')).toBe(true);
    expect(declared.has('Grep')).toBe(true);
    expect(declared.has('Write'), 'plan must NOT have Write').toBe(false);
    expect(declared.has('Edit'), 'plan must NOT have Edit').toBe(false);
  });

  it('plan-check agent: Read/Glob/Grep only (pure inspector)', async () => {
    const agents = await listAgents();
    const a = agents.find((x) => x.name === 'plan-check');
    expect(a, 'plan-check.md exists').toBeDefined();
    const declared = declaredTools(a!);
    expect(declared.has('Read')).toBe(true);
    expect(declared.has('Glob')).toBe(true);
    expect(declared.has('Grep')).toBe(true);
    expect(declared.has('Write'), 'plan-check must NOT have Write').toBe(false);
    expect(declared.has('Edit'), 'plan-check must NOT have Edit').toBe(false);
  });

  it('rules-check agent: Read/Glob/Grep only (pure inspector)', async () => {
    const agents = await listAgents();
    const a = agents.find((x) => x.name === 'rules-check');
    expect(a, 'rules-check.md exists').toBeDefined();
    const declared = declaredTools(a!);
    expect(declared.has('Read')).toBe(true);
    expect(declared.has('Glob')).toBe(true);
    expect(declared.has('Grep')).toBe(true);
    expect(declared.has('Write'), 'rules-check must NOT have Write').toBe(false);
    expect(declared.has('Edit'), 'rules-check must NOT have Edit').toBe(false);
  });

  it('rules agent: Read/Glob/Grep only (pure rules scanner)', async () => {
    const agents = await listAgents();
    const a = agents.find((x) => x.name === 'rules');
    expect(a, 'rules.md exists').toBeDefined();
    const declared = declaredTools(a!);
    expect(declared.has('Read')).toBe(true);
    expect(declared.has('Glob')).toBe(true);
    expect(declared.has('Grep')).toBe(true);
    expect(declared.has('Write'), 'rules must NOT have Write').toBe(false);
    expect(declared.has('Edit'), 'rules must NOT have Edit').toBe(false);
  });

  it('implement agent: Read/Write/Edit/Bash/Glob/Grep (writes source code)', async () => {
    // implement is the ONE agent that legitimately needs Write/Edit —
    // it writes source code, which is NOT an MCP operation. Source-code
    // mutations via Write/Edit work fine in plugin subagents (the bug
    // only affects mcp__* tools). The /impl-build SKILL applies the
    // evidence-recording side via MCP based on implement's return.
    const agents = await listAgents();
    const a = agents.find((x) => x.name === 'implement');
    expect(a, 'implement.md exists').toBeDefined();
    const declared = declaredTools(a!);
    expect(declared.has('Read')).toBe(true);
    expect(declared.has('Write'), 'implement needs Write to create source files').toBe(true);
    expect(declared.has('Edit'), 'implement needs Edit to modify source files').toBe(true);
    expect(declared.has('Bash'), 'implement needs Bash for running tests/lints').toBe(true);
  });

  it('task-validate agent: Read/Glob/Grep/Bash (runs commands to verify)', async () => {
    const agents = await listAgents();
    const a = agents.find((x) => x.name === 'task-validate');
    expect(a, 'task-validate.md exists').toBeDefined();
    const declared = declaredTools(a!);
    expect(declared.has('Read')).toBe(true);
    expect(declared.has('Bash'), 'task-validate needs Bash for command-based verification').toBe(
      true,
    );
    expect(declared.has('Write'), 'task-validate is pure inspector — no Write').toBe(false);
    expect(declared.has('Edit'), 'task-validate is pure inspector — no Edit').toBe(false);
  });

  it('code-validate agent: Read/Glob/Grep/Bash (runs commands to verify)', async () => {
    const agents = await listAgents();
    const a = agents.find((x) => x.name === 'code-validate');
    expect(a, 'code-validate.md exists').toBeDefined();
    const declared = declaredTools(a!);
    expect(declared.has('Read')).toBe(true);
    expect(declared.has('Bash'), 'code-validate needs Bash for command-based verification').toBe(
      true,
    );
    expect(declared.has('Write'), 'code-validate is pure inspector — no Write').toBe(false);
    expect(declared.has('Edit'), 'code-validate is pure inspector — no Edit').toBe(false);
  });

  it('the legacy task-check and code-check files no longer exist', async () => {
    const agents = await listAgents();
    const names = agents.map((a) => a.name);
    expect(names).not.toContain('task-check');
    expect(names).not.toContain('code-check');
  });
});
