/**
 * Shared test fixtures for the src/core factory ops.
 *
 * Provides a `createFixture` helper that:
 *   - creates a fresh tmp project root
 *   - seeds .claude/tasks/<slug>.yml and anchored.yml
 *   - returns { root, config, cleanup } for the test to consume
 *
 * Tests own their cleanup via the returned `cleanup()` thunk —
 * avoiding the implicit "afterEach forgets to run" failure mode.
 */

import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as yamlParse } from 'yaml';

import { parseAnchoredYml, type AnchoredYml } from '../../src/schema/anchored-yml.js';
import { parseTaskFileYAML } from '../../src/parser/parse.js';
import type { TaskFile } from '../../src/schema/task-file.js';

export const SAMPLE_TASK_YML = `schema_version: 2
slug: sample
status: build
created: 2026-05-26
title: Sample Task
context:
  intro: A sample task for core ops tests.
phases:
  - name: First Phase
    slug: first
    status: pending
    acceptance_criteria:
      - text: implement the thing
        status: pending
      - text: test the thing
        status: pending
  - name: Second Phase
    slug: second
    status: pending
    acceptance_criteria:
      - text: do part two
        status: pending
`;

export const SAMPLE_ANCHORED_YML = `task:
  phase:
    fields:
      - name: commit
        type: string
      - name: coverage_pct
        type: number
      - name: pr_ready
        type: boolean
      - name: env
        type: enum
        values:
          - dev
          - staging
          - prod
plan: {}
refine: {}
build: {}
wrap: {}
`;

export interface Fixture {
  root: string;
  config: AnchoredYml;
  /** Read the task-file from disk. */
  readTaskRaw: (slug?: string) => Promise<TaskFile>;
  cleanup: () => Promise<void>;
}

export async function createFixture(opts: {
  /** Slug for the seeded task-file. Defaults to "sample". */
  slug?: string;
  /** Override the seeded task-file body. */
  taskYml?: string;
  /** Override the seeded anchored.yml body. */
  anchoredYml?: string;
  /** Skip seeding the task-file (e.g. for task.create tests). */
  noTaskFile?: boolean;
} = {}): Promise<Fixture> {
  const slug = opts.slug ?? 'sample';
  const root = await mkdtemp(join(tmpdir(), 'anchored-core-test-'));
  await mkdir(join(root, '.claude', 'tasks'), { recursive: true });
  const anchored = opts.anchoredYml ?? SAMPLE_ANCHORED_YML;
  await writeFile(join(root, 'anchored.yml'), anchored, 'utf-8');
  if (!opts.noTaskFile) {
    const yml = opts.taskYml ?? SAMPLE_TASK_YML;
    await writeFile(
      join(root, '.claude', 'tasks', `${slug}.yml`),
      yml,
      'utf-8',
    );
  }
  const config = parseAnchoredYml(yamlParse(anchored));
  return {
    root,
    config,
    async readTaskRaw(readSlug?: string): Promise<TaskFile> {
      const s = readSlug ?? slug;
      const raw = await readFile(
        join(root, '.claude', 'tasks', `${s}.yml`),
        'utf-8',
      );
      return parseTaskFileYAML(raw);
    },
    async cleanup() {
      await rm(root, { recursive: true, force: true });
    },
  };
}
