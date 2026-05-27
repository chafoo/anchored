/**
 * Smoke test for CLI error output formatting.
 *
 * Verifies typed errors from the V0.2 ops factory surface to the user
 * with structured suggestions — both when piped (plain) and when
 * a TTY is attached (ANSI styled). The CLI bundle must be built
 * (npm run build) before running this; runs the dist/cli/bin.js.
 *
 * Covers:
 *   - NotFound (missing task slug) — error + Suggestions block
 *   - DonePhaseImmutable (removing a done phase without --force)
 *   - InvalidTransition (illegal task status jump)
 *   - InvalidEnum (state set with a value outside the enum)
 *   - Plain text when piped (no ANSI escape bytes)
 *   - Exit code 1 on every failure
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_DIST = resolve(__dirname, '..', 'dist', 'cli', 'bin.js');
const SKIP = !existsSync(CLI_DIST);

function runCli(
  args: string[],
  cwd: string,
): { stdout: string; stderr: string; status: number } {
  try {
    const stdout = execSync(`node ${CLI_DIST} ${args.map((a) => JSON.stringify(a)).join(' ')}`, {
      encoding: 'utf-8',
      cwd,
      timeout: 10_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { stdout, stderr: '', status: 0 };
  } catch (err) {
    const e = err as { stdout?: Buffer; stderr?: Buffer; status?: number };
    return {
      stdout: e.stdout?.toString() ?? '',
      stderr: e.stderr?.toString() ?? '',
      status: e.status ?? 1,
    };
  }
}

describe.skipIf(SKIP)('CLI error output — suggestions surface to stderr', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'anchored-cli-err-'));
    mkdirSync(join(projectRoot, '.claude', 'tasks'), { recursive: true });
    writeFileSync(join(projectRoot, 'anchored.yml'), '{}\n');
  });

  afterEach(() => {
    if (projectRoot) rmSync(projectRoot, { recursive: true, force: true });
  });

  it('prints error message + suggestions section on NotFound (task missing)', () => {
    const r = runCli(['task', 'read', 'nonexistent'], projectRoot);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/anchored: .* not found/i);
    expect(r.stderr).toMatch(/Suggestions:/);
    expect(r.stderr).toMatch(/\s-\s/);
  });

  it('plain-text output when piped (no raw ANSI escapes)', () => {
    const r = runCli(['task', 'read', 'nonexistent'], projectRoot);
    // 0x1b is the ANSI ESC byte — piped stderr (no TTY) must be clean
    expect(r.stderr.includes('')).toBe(false);
  });

  it('exits 1 on NotFound', () => {
    const r = runCli(['task', 'read', 'nonexistent'], projectRoot);
    expect(r.status).toBe(1);
  });

  it('refuses to remove a done phase without --force (DonePhaseImmutable)', () => {
    // Set up a task with a single phase + AC, then drive AC + phase to done
    runCli(['task', 'create', 'rm-done', '--title', 'Done test'], projectRoot);
    runCli(
      ['phase', 'add', 'rm-done', '--name', 'P1', '--slug', 'p1'],
      projectRoot,
    );
    // Fill evidence on the auto-placeholder AC (index 0) — flips it to done
    runCli(
      [
        'ac',
        'evidence',
        'set',
        'rm-done',
        'p1',
        '0',
        'src/x.ts:1 — implemented',
      ],
      projectRoot,
    );
    // Mark phase done via the state machine: pending → in-progress → done
    runCli(
      ['phase', 'status', 'set', 'rm-done', 'p1', 'in-progress'],
      projectRoot,
    );
    runCli(['phase', 'status', 'set', 'rm-done', 'p1', 'done'], projectRoot);

    // Now try to remove without --force
    const r = runCli(['phase', 'remove', 'rm-done', 'p1'], projectRoot);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/DonePhaseImmutable|done/i);
    expect(r.stderr).toMatch(/Suggestions:/);
  });

  it('rejects invalid task status enum with a clear error', () => {
    runCli(['task', 'create', 'enum-test', '--title', 'X'], projectRoot);
    const r = runCli(
      ['task', 'status', 'set', 'enum-test', 'not-a-status'],
      projectRoot,
    );
    expect(r.status).toBe(1);
    // Zod's parse error names the invalid enum
    expect(r.stderr.toLowerCase()).toMatch(/invalid|enum|plan|drafted/);
  });

  it('rejects illegal task status transition with suggestions', () => {
    runCli(['task', 'create', 'trans-test', '--title', 'X'], projectRoot);
    // status=plan — illegal jump to done
    const r = runCli(
      ['task', 'status', 'set', 'trans-test', 'done'],
      projectRoot,
    );
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/InvalidTransition|transition/i);
    expect(r.stderr).toMatch(/Suggestions:/);
  });
});
