/**
 * Tests for the suggestions[] field on every typed error class.
 *
 * Every service-layer throw populates 1-3 concrete recovery
 * suggestions. CLI prints them as a bulleted list; MCP returns them
 * in the error.data payload. This file verifies the data flow at
 * the error-class layer (CLI output + MCP response are tested in
 * the CLI / MCP smoke tests).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  InvalidTransition,
  InvalidEvidence,
  IncompleteEvidence,
  IncompletePhases,
  OutOfRange,
  InvalidFieldType,
  NotFound,
} from '../src/ops/validate.js';
import { InvalidFieldValue, IncompletePhase } from '../src/core/errors.js';
import { createOps } from '../src/core/factory.js';
import { readConfig } from '../src/core/config.js';
import type { TaskOps } from '../src/core/factory.js';

// ─────────────────────────────────────────────────────────────────────
// Direct error-class construction — suggestions field present
// ─────────────────────────────────────────────────────────────────────

describe('error classes expose suggestions: string[]', () => {
  it('InvalidTransition has suggestions array', () => {
    const err = new InvalidTransition('test', ['suggestion one', 'suggestion two']);
    expect(err.suggestions).toEqual(['suggestion one', 'suggestion two']);
  });

  it('IncompleteEvidence has suggestions array', () => {
    const err = new IncompleteEvidence('test', ['fill it in']);
    expect(err.suggestions).toEqual(['fill it in']);
  });

  it('IncompletePhases has suggestions array', () => {
    const err = new IncompletePhases('test', ['finish phases first']);
    expect(err.suggestions).toEqual(['finish phases first']);
  });

  it('InvalidEvidence has suggestions array', () => {
    const err = new InvalidEvidence('test', ['use a real reference']);
    expect(err.suggestions).toEqual(['use a real reference']);
  });

  it('NotFound has suggestions array', () => {
    const err = new NotFound('test', ['create the file first']);
    expect(err.suggestions).toEqual(['create the file first']);
  });

  it('OutOfRange has suggestions array', () => {
    const err = new OutOfRange('test', ['use a valid index']);
    expect(err.suggestions).toEqual(['use a valid index']);
  });

  it('InvalidFieldType has suggestions array', () => {
    const err = new InvalidFieldType('test', ['fix the type']);
    expect(err.suggestions).toEqual(['fix the type']);
  });

  it('InvalidFieldValue has suggestions array', () => {
    const err = new InvalidFieldValue('test', ['declare it first']);
    expect(err.suggestions).toEqual(['declare it first']);
  });

  it('suggestions default to empty array when omitted', () => {
    const err = new InvalidTransition('test');
    expect(err.suggestions).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Throw-site population — every service-layer throw populates >0
// ─────────────────────────────────────────────────────────────────────

const SAMPLE_TASK = `schema_version: 2
slug: t
status: build
created: 2026-05-26
title: T
context:
  intro: t.
phases:
  - name: P
    slug: p
    status: pending
    acceptance_criteria:
      - text: a
        status: pending
      - text: b
        status: pending
`;

const ANCHORED_YML = `task:
  phase:
    fields:
      - name: commit
        type: string
plan: {}
refine: {}
build: {}
wrap: {}
`;

let projectRoot: string;

async function setup(taskSlug = 't', customYml?: string): Promise<TaskOps> {
  await mkdir(join(projectRoot, '.claude', 'tasks'), { recursive: true });
  await writeFile(
    join(projectRoot, '.claude', 'tasks', `${taskSlug}.yml`),
    SAMPLE_TASK,
    'utf-8',
  );
  await writeFile(join(projectRoot, 'anchored.yml'), customYml ?? ANCHORED_YML, 'utf-8');
  const config = await readConfig(projectRoot);
  return createOps(config, projectRoot);
}

beforeEach(async () => {
  projectRoot = await mkdtemp(join(tmpdir(), 'anchored-err-rec-'));
});

afterEach(async () => {
  if (projectRoot) await rm(projectRoot, { recursive: true, force: true });
});

describe('throw-sites populate suggestions with actionable content', () => {
  it('task.status.set illegal transition populates suggestions', async () => {
    const ops = await setup();
    try {
      await ops.task.status.set('t', 'done');
      expect.fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidTransition);
      const e = err as InvalidTransition;
      expect(e.suggestions.length).toBeGreaterThan(0);
      // At least one suggestion mentions a legal next state
      expect(e.suggestions.some((s) => /wrap|build|drafted/i.test(s))).toBe(true);
    }
  });

  it('task.status.set wrap-with-pending populates suggestions referring to incomplete phases', async () => {
    const ops = await setup();
    try {
      await ops.task.status.set('t', 'wrap');
      expect.fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(IncompletePhases);
      const e = err as IncompletePhases;
      expect(e.suggestions.length).toBeGreaterThan(0);
      // At least one suggestion should mention finishing or transitioning phases
      const text = e.suggestions.join(' ').toLowerCase();
      expect(/phase|status|deferred|blocked|build/.test(text)).toBe(true);
    }
  });

  it('phase.status.set done-without-evidence populates suggestions with fix paths', async () => {
    const ops = await setup();
    await ops.task.phase.status.set('t', 'p', 'in-progress');
    try {
      await ops.task.phase.status.set('t', 'p', 'done');
      expect.fail('expected throw');
    } catch (err) {
      // Factory's phase.status.set('done') gate throws IncompletePhase
      // (factory-layer error listing offending AC indices).
      expect(err).toBeInstanceOf(IncompletePhase);
      const e = err as IncompletePhase;
      expect(e.suggestions.length).toBeGreaterThan(0);
      // Should mention evidence or blocked/deferred
      const text = e.suggestions.join(' ').toLowerCase();
      expect(/evidence|blocked|deferred/.test(text)).toBe(true);
    }
  });

  it('ac.evidence.set empty-evidence populates suggestions', async () => {
    const ops = await setup();
    try {
      await ops.task.phase.ac.evidence.set('t', 'p', 0, []);
      expect.fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidEvidence);
      const e = err as InvalidEvidence;
      expect(e.suggestions.length).toBeGreaterThan(0);
    }
  });

  it('ac.evidence.set with em-dash sentinel populates suggestions referring to real reference', async () => {
    const ops = await setup();
    try {
      await ops.task.phase.ac.evidence.set('t', 'p', 0, ['—']);
      expect.fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidEvidence);
      const e = err as InvalidEvidence;
      expect(e.suggestions.length).toBeGreaterThan(0);
      const text = e.suggestions.join(' ').toLowerCase();
      expect(/real reference|file:line|placeholder|concrete/.test(text)).toBe(true);
    }
  });

  it('ac.evidence.set out-of-range index populates suggestions', async () => {
    const ops = await setup();
    try {
      await ops.task.phase.ac.evidence.set('t', 'p', 99, ['something']);
      expect.fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(OutOfRange);
      const e = err as OutOfRange;
      expect(e.suggestions.length).toBeGreaterThan(0);
      const text = e.suggestions.join(' ').toLowerCase();
      expect(/index|list|ac/.test(text)).toBe(true);
    }
  });

  it('phase.field.set undeclared field populates suggestions', async () => {
    const ops = await setup();
    try {
      await ops.task.phase.field.set('t', 'p', 'not_declared', 'x');
      expect.fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidFieldValue);
      const e = err as InvalidFieldValue;
      expect(e.suggestions.length).toBeGreaterThan(0);
      const text = e.suggestions.join(' ').toLowerCase();
      expect(/anchored\.yml|declare|field/.test(text)).toBe(true);
    }
  });

  it('phase.field.set wrong-type populates suggestions referring to expected type', async () => {
    const customYml = `task:
  phase:
    fields:
      - name: coverage_pct
        type: number
plan: {}
build: {}
wrap: {}
`;
    const ops = await setup('t', customYml);
    try {
      await ops.task.phase.field.set('t', 'p', 'coverage_pct', 'not-a-number');
      expect.fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidFieldType);
      const e = err as InvalidFieldType;
      expect(e.suggestions.length).toBeGreaterThan(0);
    }
  });

  it('task.read non-existent populates suggestions', async () => {
    // setup empty project — no task-file
    await mkdir(join(projectRoot, '.claude', 'tasks'), { recursive: true });
    await writeFile(join(projectRoot, 'anchored.yml'), ANCHORED_YML, 'utf-8');
    const config = await readConfig(projectRoot);
    const ops = createOps(config, projectRoot);
    try {
      await ops.task.status.set('nonexistent', 'build');
      expect.fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(NotFound);
      const e = err as NotFound;
      expect(e.suggestions.length).toBeGreaterThan(0);
      const text = e.suggestions.join(' ').toLowerCase();
      expect(/create|impl-plan|file|exist/.test(text)).toBe(true);
    }
  });
});
