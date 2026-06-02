/**
 * Build output validation tests — catch regressions in the bundled
 * artifacts. These tests would have caught the bugs we hit during
 * first dogfood: double-shebang and missing exec-bit.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CLI_DIST = join(ROOT, 'dist/cli/bin.js');
const MCP_DIST = join(ROOT, 'dist/mcp/server.js');

beforeAll(() => {
  if (!existsSync(CLI_DIST) || !existsSync(MCP_DIST)) {
    execSync('npm run build', { cwd: ROOT, stdio: 'inherit' });
  }
}, 60_000);

describe('CLI bundle (dist/cli/bin.js)', () => {
  it('has exactly one shebang on line 1', async () => {
    const content = await readFile(CLI_DIST, 'utf-8');
    const lines = content.split('\n');
    expect(lines[0], 'line 1 must be shebang').toMatch(/^#!\/usr\/bin\/env node$/);
    expect(lines[1], 'line 2 must NOT be a second shebang (regression check)').not.toMatch(/^#!/);
  });

  it('has user-execute bit set', async () => {
    const stats = await stat(CLI_DIST);
    expect(
      stats.mode & 0o100,
      'CLI bundle must be executable (regression: chmod missing from build)',
    ).toBeGreaterThan(0);
  });

  it('is parseable JavaScript (loads without SyntaxError)', () => {
    const out = execSync(`node ${CLI_DIST} --version`, {
      encoding: 'utf-8',
      timeout: 5_000,
    });
    expect(out.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe('MCP server bundle (dist/mcp/server.js)', () => {
  it('has exactly one shebang on line 1', async () => {
    const content = await readFile(MCP_DIST, 'utf-8');
    const lines = content.split('\n');
    expect(lines[0], 'line 1 must be shebang').toMatch(/^#!\/usr\/bin\/env node$/);
    expect(lines[1], 'line 2 must NOT be a second shebang (regression check)').not.toMatch(/^#!/);
  });

  it('has user-execute bit set', async () => {
    const stats = await stat(MCP_DIST);
    expect(
      stats.mode & 0o100,
      'MCP server bundle must be executable (regression: chmod missing from build)',
    ).toBeGreaterThan(0);
  });
});

describe('JSON Schema export (dist/schema/)', () => {
  const SCHEMA_PATH = join(__dirname, '..', 'dist', 'schema', 'task-file-v2.schema.json');

  it('task-file-v2.schema.json exists after build', async () => {
    const stats = await stat(SCHEMA_PATH);
    expect(stats.isFile(), 'schema file must be present in dist/').toBe(true);
  });

  it('task-file-v2 schema is valid JSON and has expected structure', async () => {
    const raw = await readFile(SCHEMA_PATH, 'utf-8');
    const schema = JSON.parse(raw);
    expect(schema.title).toBe('Anchored Task-File (v2)');
    expect(schema.description).toContain('v2 YAML format');
    // top-level shape matches a JSON Schema document
    expect(schema.$ref || schema.type || schema.properties).toBeDefined();
  });

  it('schema enforces schema_version: 2 literal', async () => {
    const raw = await readFile(SCHEMA_PATH, 'utf-8');
    // The literal value should appear somewhere as a const constraint
    expect(raw).toContain('"const": 2');
  });

  it('schema enforces kebab-case slug pattern', async () => {
    const raw = await readFile(SCHEMA_PATH, 'utf-8');
    expect(raw).toContain('"pattern": "^[a-z][a-z0-9-]*$"');
  });
});
