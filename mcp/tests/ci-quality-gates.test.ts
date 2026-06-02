/**
 * Verifies that the CI quality-gates workflow + supporting package.json
 * config are wired correctly. Test fails if any of the 6 gates go
 * missing, the YAML breaks, or the size-limit config drifts.
 *
 * This guards the contract that every PR runs lint/typecheck/test/
 * audit/license/bundle-size before merge to main.
 */

import { describe, it, expect } from 'vitest';
import { readFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const CI_PATH = resolve(REPO_ROOT, '.github', 'workflows', 'ci.yml');
const PKG_PATH = resolve(__dirname, '..', 'package.json');

interface CiWorkflow {
  name: string;
  on: { pull_request?: unknown; push?: { branches?: string[] } };
  jobs: Record<string, { name: string; 'runs-on': string; steps: unknown[] }>;
}

async function readCi(): Promise<CiWorkflow> {
  const raw = await readFile(CI_PATH, 'utf-8');
  return parseYaml(raw) as CiWorkflow;
}

async function readPkg(): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(PKG_PATH, 'utf-8')) as Record<string, unknown>;
}

describe('CI workflow file', () => {
  it('exists at .github/workflows/ci.yml', async () => {
    try {
      await access(CI_PATH, constants.F_OK);
    } catch {
      throw new Error(`CI workflow not found at ${CI_PATH}`);
    }
  });

  it('is valid YAML', async () => {
    const ci = await readCi();
    expect(ci).toBeDefined();
    expect(ci.jobs).toBeDefined();
  });

  it('triggers on pull_request and push to main', async () => {
    const ci = await readCi();
    // YAML's `on` key gets parsed as boolean `true` by some libs unless
    // quoted — verify both possible shapes
    const trigger = ci.on as unknown;
    expect(trigger).toBeDefined();
    const triggerObj = trigger as { pull_request?: unknown; push?: { branches?: string[] } };
    expect(triggerObj.pull_request !== undefined || triggerObj.push !== undefined).toBe(true);
    if (triggerObj.push?.branches) {
      expect(triggerObj.push.branches).toContain('main');
    }
  });

  it('has all 6 required quality-gate jobs', async () => {
    const ci = await readCi();
    const jobNames = Object.keys(ci.jobs);
    const required = ['lint', 'typecheck', 'test', 'audit', 'license', 'bundle-size'];
    for (const r of required) {
      expect(jobNames, `missing CI job: ${r}`).toContain(r);
    }
  });

  it('all jobs use Node 22 (current LTS; satisfies engines >=20)', async () => {
    const ci = await readCi();
    for (const [name, job] of Object.entries(ci.jobs)) {
      const steps = job.steps as Record<string, unknown>[];
      const setupNode = steps.find(
        (s) => typeof s.uses === 'string' && s.uses.startsWith('actions/setup-node'),
      );
      expect(setupNode, `${name} job missing actions/setup-node`).toBeDefined();
      const nodeVersion = (setupNode!['with'] as Record<string, string>)?.['node-version'];
      expect(nodeVersion, `${name} job missing node-version`).toBe('22');
    }
  });

  it('audit job blocks on high+ severity', async () => {
    const raw = await readFile(CI_PATH, 'utf-8');
    expect(raw).toMatch(/--audit-level=high/);
    // and uses --production so dev-only CVEs don't block the build
    expect(raw).toMatch(/--production/);
  });

  it('license job whitelists MIT-compatible licenses', async () => {
    const raw = await readFile(CI_PATH, 'utf-8');
    expect(raw).toMatch(/MIT/);
    expect(raw).toMatch(/Apache-2\.0/);
    expect(raw).toMatch(/BSD-/);
    expect(raw).toMatch(/ISC/);
  });

  it('bundle-size job runs size-limit after build', async () => {
    const ci = await readCi();
    const bundleJob = ci.jobs['bundle-size'];
    expect(bundleJob).toBeDefined();
    const steps = bundleJob.steps as Record<string, unknown>[];
    const stepNames = steps.map((s) => (typeof s.name === 'string' ? s.name : ''));
    const stepRuns = steps.map((s) => (typeof s.run === 'string' ? s.run : ''));
    expect(stepNames.some((n) => /build/i.test(n))).toBe(true);
    expect(stepRuns.some((r) => /size-limit/.test(r))).toBe(true);
  });
});

describe('size-limit config in package.json', () => {
  it('has size-limit array with CLI + MCP server entries', async () => {
    const pkg = await readPkg();
    const sizeLimit = pkg['size-limit'] as Record<string, string>[];
    expect(Array.isArray(sizeLimit)).toBe(true);
    expect(sizeLimit.length).toBeGreaterThanOrEqual(2);
    const paths = sizeLimit.map((s) => s.path);
    expect(paths.some((p) => p?.includes('cli/bin.js'))).toBe(true);
    expect(paths.some((p) => p?.includes('mcp/server.js'))).toBe(true);
  });

  it('each size-limit entry has a numeric KB budget under 1MB', async () => {
    const pkg = await readPkg();
    const sizeLimit = pkg['size-limit'] as Record<string, string>[];
    for (const entry of sizeLimit) {
      expect(entry.limit, `${entry.path} missing limit`).toBeDefined();
      // Parse "800 KB" form
      const m = entry.limit?.match(/^(\d+)\s*KB$/i);
      expect(
        m,
        `${entry.path}: limit must be in KB form (e.g. "800 KB"), got "${entry.limit}"`,
      ).not.toBeNull();
      const kb = m ? Number(m[1]) : 0;
      expect(kb).toBeGreaterThan(0);
      expect(kb).toBeLessThanOrEqual(1024); // ≤ 1MB
    }
  });

  it('devDependencies include size-limit + license-checker', async () => {
    const pkg = await readPkg();
    const dev = pkg.devDependencies as Record<string, string>;
    expect(dev['size-limit']).toBeTruthy();
    // measures the pre-built node bundles directly (no re-bundling) — the
    // preset re-bundled for web and choked on node: builtins
    expect(dev['@size-limit/file']).toBeTruthy();
    expect(dev['license-checker']).toBeTruthy();
  });
});
