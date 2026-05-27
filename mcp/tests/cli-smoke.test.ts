/**
 * CLI smoke tests — verify the V0.2 command tree (33 subcommands)
 * loads cleanly and end-to-end mutations land on disk.
 *
 * Two layers:
 *   1. Help-output sanity: every command + subgroup loads without
 *      crashing (would have caught the duplicate-status-command bug).
 *   2. End-to-end: spawn the binary against a tmpdir, run a sequence
 *      (create → phase add → ac add → ac evidence set) and assert the
 *      resulting .yml file parses + has the expected state.
 *
 * Tests assume the CLI dist bundle exists; first run triggers
 * `npm run build` via beforeAll if dist/cli/bin.js is absent.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync, execSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTaskFileYAML } from '../src/parser/parse.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, '..', 'dist/cli/bin.js');

function run(args: string[], cwd?: string): string {
  return execFileSync('node', [CLI, ...args], {
    encoding: 'utf-8',
    timeout: 10_000,
    stdio: ['ignore', 'pipe', 'pipe'],
    ...(cwd ? { cwd } : {}),
  });
}

beforeAll(() => {
  if (!existsSync(CLI)) {
    execSync('npm run build', { cwd: join(__dirname, '..'), stdio: 'inherit' });
  }
}, 60_000);

// ─────────────────────────────────────────────────────────────────────
// Top-level + help-output sanity
// ─────────────────────────────────────────────────────────────────────

describe('top-level CLI', () => {
  it('--version prints semver', () => {
    expect(run(['--version']).trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('--help lists all five domain commands', () => {
    const out = run(['--help']);
    expect(out).toContain('task');
    expect(out).toContain('phase');
    expect(out).toContain('ac');
    expect(out).toContain('context');
    expect(out).toContain('field');
  });

  it('--help does NOT mention migrate (command removed in V0.2)', () => {
    const out = run(['--help']);
    expect(out).not.toMatch(/\bmigrate\b/);
  });
});

describe('task subcommands load', () => {
  it.each([
    ['task', '--help'],
    ['task', 'create', '--help'],
    ['task', 'read', '--help'],
    ['task', 'status', 'set', '--help'],
    ['task', 'title', 'set', '--help'],
    // V0.3
    ['task', 'autonomy', '--help'],
    ['task', 'autonomy', 'set', '--help'],
    ['task', 'question', '--help'],
    ['task', 'question', 'add', '--help'],
    ['task', 'question', 'list', '--help'],
    ['task', 'question', 'resolve', '--help'],
    ['task', 'question', 'retag', '--help'],
  ])('%s %s %s loads', (...args) => {
    expect(run(args.filter(Boolean))).toContain('Usage:');
  });
});

describe('V0.3 task question + autonomy end-to-end', () => {
  let tmpRoot: string;
  beforeAll(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'anchored-cli-v03-'));
    mkdirSync(join(tmpRoot, '.claude', 'tasks'), { recursive: true });
    writeFileSync(
      join(tmpRoot, 'anchored.yml'),
      'task:\n  phase:\n    fields: []\nplan: {}\nrefine: {}\nbuild: {}\nwrap: {}\n',
      'utf-8',
    );
    run(['task', 'create', 'cli-demo', '--title', 'CLI V0.3 Demo'], tmpRoot);
  });

  it('autonomy set persists and shows up in re-read', () => {
    run(['task', 'autonomy', 'set', 'cli-demo', 'ask_high_only'], tmpRoot);
    const yml = readFileSync(
      join(tmpRoot, '.claude/tasks/cli-demo.yml'),
      'utf-8',
    );
    const parsed = parseTaskFileYAML(yml);
    expect(parsed.autonomy).toBe('ask_high_only');
    expect(parsed.context.plan).toContain('autonomy set to');
  });

  it('question add → list → resolve flow lands on disk', () => {
    run(
      [
        'task', 'question', 'add', 'cli-demo',
        '--text', 'Is delete-task in scope?',
        '--priority', 'high',
        '--origin', 'plan-agent',
      ],
      tmpRoot,
    );
    const listOut = run(
      ['task', 'question', 'list', 'cli-demo', '--status', 'open'],
      tmpRoot,
    );
    const list = JSON.parse(listOut);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('q1');
    expect(list[0].priority).toBe('high');

    run(
      [
        'task', 'question', 'resolve', 'cli-demo', 'q1',
        '--answer', 'yes, in scope',
        '--source', 'user',
      ],
      tmpRoot,
    );
    const yml = readFileSync(
      join(tmpRoot, '.claude/tasks/cli-demo.yml'),
      'utf-8',
    );
    const parsed = parseTaskFileYAML(yml);
    expect(parsed.questions).toHaveLength(1);
    expect(parsed.questions![0]!.status).toBe('resolved');
    expect(parsed.questions![0]!.answer).toBe('yes, in scope');
    expect(parsed.questions![0]!.source).toBe('user');
  });

  it('retag changes priority', () => {
    run(
      ['task', 'question', 'retag', 'cli-demo', 'q1', 'medium'],
      tmpRoot,
    );
    const yml = readFileSync(
      join(tmpRoot, '.claude/tasks/cli-demo.yml'),
      'utf-8',
    );
    const parsed = parseTaskFileYAML(yml);
    expect(parsed.questions![0]!.priority).toBe('medium');
  });
});

describe('context subcommands load', () => {
  it.each([
    ['context', '--help'],
    ['context', 'intro', 'set', '--help'],
    ['context', 'plan', 'append', '--help'],
    ['context', 'plan', 'resolve', '--help'],
    ['context', 'build', 'append', '--help'],
    ['context', 'build', 'set', '--help'],
    ['context', 'wrap', 'intro', 'set', '--help'],
    ['context', 'wrap', 'append', '--help'],
    ['context', 'wrap', 'set', '--help'],
  ])('%s %s %s loads', (...args) => {
    expect(run(args.filter(Boolean))).toContain('Usage:');
  });
});

describe('phase subcommands load', () => {
  it.each([
    ['phase', '--help'],
    ['phase', 'list', '--help'],
    ['phase', 'next', '--help'],
    ['phase', 'add', '--help'],
    ['phase', 'remove', '--help'],
    ['phase', 'move', '--help'],
    ['phase', 'status', 'set', '--help'],
    ['phase', 'name', 'set', '--help'],
    ['phase', 'context', 'set', '--help'],
    ['phase', 'rules', 'set', '--help'],
    ['phase', 'retry', 'increment', '--help'],
  ])('%s %s %s loads', (...args) => {
    expect(run(args.filter(Boolean))).toContain('Usage:');
  });
});

describe('ac subcommands load', () => {
  it.each([
    ['ac', '--help'],
    ['ac', 'add', '--help'],
    ['ac', 'remove', '--help'],
    ['ac', 'text', 'set', '--help'],
    ['ac', 'evidence', 'set', '--help'],
    ['ac', 'evidence', 'add', '--help'],
    ['ac', 'failures', 'set', '--help'],
    ['ac', 'failures', 'clear', '--help'],
    ['ac', 'status', 'set', '--help'],
  ])('%s %s %s loads', (...args) => {
    expect(run(args.filter(Boolean))).toContain('Usage:');
  });
});

describe('field subcommands load', () => {
  it.each([
    ['field', '--help'],
    ['field', 'list', '--help'],
    ['field', 'set', '--help'],
    ['field', 'get', '--help'],
  ])('%s %s loads', (...args) => {
    expect(run(args.filter(Boolean))).toContain('Usage:');
  });
});

describe('migrate command is gone', () => {
  it('rejects `anchored migrate` as unknown command', () => {
    let exited = false;
    try {
      run(['migrate']);
    } catch (err) {
      exited = true;
      const e = err as { status?: number; stderr?: Buffer };
      expect(e.status).not.toBe(0);
      const stderr = e.stderr?.toString() ?? '';
      expect(stderr.toLowerCase()).toMatch(/unknown command|migrate/);
    }
    expect(exited).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────
// End-to-end: spawn binary, mutate task-file, verify on disk
// ─────────────────────────────────────────────────────────────────────

describe('end-to-end command sequence', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'anchored-cli-smoke-'));
    mkdirSync(join(projectRoot, '.claude', 'tasks'), { recursive: true });
    // Minimal valid anchored.yml — empty {} parses since every top-level
    // key has defaults. Field ops require the file to exist on disk.
    writeFileSync(join(projectRoot, 'anchored.yml'), '{}\n');
  });

  afterEach(() => {
    if (projectRoot) rmSync(projectRoot, { recursive: true, force: true });
  });

  it('full create → phase → ac → evidence flow lands on disk', () => {
    // 1. Create task
    const createOut = run(
      ['task', 'create', 'demo-cli', '--title', 'Demo task'],
      projectRoot,
    );
    expect(createOut).toContain('Updated: demo-cli');
    const taskPath = join(projectRoot, '.claude', 'tasks', 'demo-cli.yml');
    expect(existsSync(taskPath)).toBe(true);

    // File parses
    const initial = parseTaskFileYAML(readFileSync(taskPath, 'utf-8'));
    expect(initial.slug).toBe('demo-cli');
    expect(initial.title).toBe('Demo task');
    expect(initial.status).toBe('plan');
    expect(initial.phases).toEqual([]);

    // 2. Phase add
    run(
      ['phase', 'add', 'demo-cli', '--name', 'Setup', '--slug', 'setup'],
      projectRoot,
    );
    const afterPhase = parseTaskFileYAML(readFileSync(taskPath, 'utf-8'));
    expect(afterPhase.phases).toHaveLength(1);
    expect(afterPhase.phases[0]!.slug).toBe('setup');
    expect(afterPhase.phases[0]!.name).toBe('Setup');

    // 3. AC add (replaces the placeholder TBD AC by appending — phases
    //    start with one auto-placeholder, so this becomes index 1).
    run(
      ['ac', 'add', 'demo-cli', 'setup', '--text', 'First criterion'],
      projectRoot,
    );
    const afterAc = parseTaskFileYAML(readFileSync(taskPath, 'utf-8'));
    expect(afterAc.phases[0]!.acceptance_criteria.length).toBeGreaterThanOrEqual(2);
    const acTexts = afterAc.phases[0]!.acceptance_criteria.map((a) => a.text);
    expect(acTexts).toContain('First criterion');

    // 4. AC evidence set on the "First criterion" AC — find its index
    const acIdx = acTexts.indexOf('First criterion');
    run(
      [
        'ac',
        'evidence',
        'set',
        'demo-cli',
        'setup',
        String(acIdx),
        'src/foo.ts:14 — handler in place',
      ],
      projectRoot,
    );
    const final = parseTaskFileYAML(readFileSync(taskPath, 'utf-8'));
    const targetAc = final.phases[0]!.acceptance_criteria[acIdx]!;
    expect(targetAc.status).toBe('done');
    expect(targetAc.evidence).toEqual(['src/foo.ts:14 — handler in place']);
  });

  it('phase list and phase next return useful output', () => {
    run(['task', 'create', 'flow-test', '--title', 'Flow'], projectRoot);
    run(
      ['phase', 'add', 'flow-test', '--name', 'First', '--slug', 'first'],
      projectRoot,
    );
    run(
      ['phase', 'add', 'flow-test', '--name', 'Second', '--slug', 'second'],
      projectRoot,
    );

    const listOut = run(['phase', 'list', 'flow-test'], projectRoot);
    expect(listOut).toContain('first');
    expect(listOut).toContain('second');
    expect(listOut).toContain('pending');

    const nextOut = run(['phase', 'next', 'flow-test'], projectRoot);
    expect(nextOut.trim()).toBe('first');
  });
});

import { beforeEach, afterEach } from 'vitest';
