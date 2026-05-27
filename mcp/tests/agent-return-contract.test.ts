/**
 * Agent return-contract — every shipped agent must declare a "Return
 * contract" section that REQUIRES a partner-voice summary line in its
 * return payload. The orchestrator extracts that line and relays it
 * verbatim to the user; without the field, the chat surface
 * regresses to either nothing or machinery-voice gibberish.
 *
 * Three assertions per agent:
 *   1. A "Return contract" (or "Return Contract") section is present.
 *   2. The body mentions `partner_voice_summary` (or one of the
 *      acceptable variants: "partner-voice summary", "partner voice").
 *   3. The body links/references plugin/references/communication-style.md
 *      so future readers know where the voice principle lives.
 *
 * These are doc-shape tests, not behavioral tests — but the doc
 * shape IS the contract for every Claude Code agent invocation.
 */

import { describe, it, expect } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AGENTS_DIR = join(__dirname, '..', '..', 'plugin', 'agents');

async function listAgentFiles(): Promise<string[]> {
  const entries = await readdir(AGENTS_DIR, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => join(AGENTS_DIR, e.name));
}

describe('agent return-contract — partner-voice summary is required', () => {
  it('finds at least one agent file to validate (smoke)', async () => {
    const files = await listAgentFiles();
    expect(files.length, 'expected ≥1 agent file in plugin/agents/').toBeGreaterThan(0);
  });

  it('every agent.md has a "Return contract" (or "Return Contract") section', async () => {
    const files = await listAgentFiles();
    for (const f of files) {
      const body = await readFile(f, 'utf-8');
      expect(
        /^##\s+Return [Cc]ontract/m.test(body),
        `${f} is missing a "## Return contract" section — every agent must declare what it returns to the orchestrator`,
      ).toBe(true);
    }
  });

  it('every agent.md requires a partner_voice_summary (or equivalent) field', async () => {
    const files = await listAgentFiles();
    for (const f of files) {
      const body = await readFile(f, 'utf-8');
      const hasField =
        /partner_voice_summary/.test(body) ||
        /partner-voice summary/i.test(body) ||
        /partner voice/i.test(body);
      expect(
        hasField,
        `${f} does not mention partner_voice_summary / partner-voice summary — the orchestrator needs this field to relay to the user`,
      ).toBe(true);
    }
  });

  it('every agent.md references plugin/references/communication-style.md', async () => {
    const files = await listAgentFiles();
    for (const f of files) {
      const body = await readFile(f, 'utf-8');
      expect(
        body.includes('communication-style.md'),
        `${f} does not link plugin/references/communication-style.md — the partner-voice contract must point at its canonical guide`,
      ).toBe(true);
    }
  });
});
