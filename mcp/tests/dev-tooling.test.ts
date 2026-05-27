/**
 * Verifies that the dev-tooling configuration files are wired up
 * correctly. Catches config drift (forgot to commit a config, broke
 * package.json structure, removed a script) at test time so it
 * doesn't show up as failed CI later.
 */

import { describe, it, expect } from 'vitest';
import { readFile, stat, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MCP_ROOT = resolve(__dirname, '..');

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readJson(p: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(p, 'utf-8')) as Record<string, unknown>;
}

describe('dev-tooling config files exist', () => {
  it('eslint.config.js exists at mcp/ root', async () => {
    expect(await fileExists(resolve(MCP_ROOT, 'eslint.config.js'))).toBe(true);
  });

  it('.prettierrc.json exists at mcp/ root + is valid JSON', async () => {
    const path = resolve(MCP_ROOT, '.prettierrc.json');
    expect(await fileExists(path)).toBe(true);
    const obj = await readJson(path);
    expect(obj.semi).toBe(true);
    expect(obj.singleQuote).toBe(true);
    expect(obj.printWidth).toBe(100);
  });

  it('.prettierignore exists', async () => {
    expect(await fileExists(resolve(MCP_ROOT, '.prettierignore'))).toBe(true);
  });

  it('.husky/pre-commit hook exists + is executable', async () => {
    const path = resolve(MCP_ROOT, '.husky', 'pre-commit');
    expect(await fileExists(path)).toBe(true);
    const stats = await stat(path);
    // owner-execute bit (0o100 in octal mode) must be set
    expect((stats.mode & 0o100) !== 0).toBe(true);
  });
});

describe('package.json scripts + lint-staged config', () => {
  let pkg: Record<string, unknown>;
  let scripts: Record<string, string>;
  let lintStaged: Record<string, unknown>;

  beforeAll(async () => {
    pkg = await readJson(resolve(MCP_ROOT, 'package.json'));
    scripts = pkg.scripts as Record<string, string>;
    lintStaged = pkg['lint-staged'] as Record<string, unknown>;
  });

  it('exposes lint + format + type-coverage scripts', () => {
    expect(scripts.lint).toBeTruthy();
    expect(scripts['lint:fix']).toBeTruthy();
    expect(scripts.format).toBeTruthy();
    expect(scripts['format:check']).toBeTruthy();
    expect(scripts['type-coverage']).toBeTruthy();
  });

  it('type-coverage script enforces ≥ 95% threshold', () => {
    expect(scripts['type-coverage']).toContain('--at-least 95');
    expect(scripts['type-coverage']).toContain('--strict');
  });

  it('prepublishOnly runs lint + tests + build before publishing', () => {
    expect(scripts.prepublishOnly).toContain('lint');
    expect(scripts.prepublishOnly).toContain('test');
    expect(scripts.prepublishOnly).toContain('build');
  });

  it('lint-staged is configured for TS + format-only file types', () => {
    expect(lintStaged).toBeDefined();
    expect(lintStaged['*.{ts,js,mjs}']).toBeDefined();
    expect(lintStaged['*.{json,md,yml,yaml}']).toBeDefined();
  });

  it('lint-staged runs Prettier + ESLint on .ts files', () => {
    const tsRules = lintStaged['*.{ts,js,mjs}'] as string[];
    expect(tsRules.some((r) => r.includes('prettier'))).toBe(true);
    expect(tsRules.some((r) => r.includes('eslint'))).toBe(true);
  });

  it('dev dependencies include eslint + prettier + husky + lint-staged + type-coverage', () => {
    const dev = pkg.devDependencies as Record<string, string>;
    expect(dev.eslint).toBeTruthy();
    expect(dev.prettier).toBeTruthy();
    expect(dev.husky).toBeTruthy();
    expect(dev['lint-staged']).toBeTruthy();
    expect(dev['type-coverage']).toBeTruthy();
    expect(dev['typescript-eslint']).toBeTruthy();
    expect(dev['@eslint/js']).toBeTruthy();
  });
});

import { beforeAll } from 'vitest';
