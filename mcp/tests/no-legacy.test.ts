/**
 * Architecture-as-test: asserts the V0.2 cleanup landed.
 *
 * After Phase 13 of the V0.2 refactor:
 *   - no `*-v2.ts` files in src/
 *   - no `src/migrate/` directory
 *   - no `migrate` CLI command file
 *   - no `EvidenceV2` / `EVIDENCE_PLACEHOLDER` references in src/
 *   - no `task_check` / `code_check` (or hyphenated) references in src/
 *   - no `migrate` / `migration` references in src/
 *   - no remaining `V2`-suffixed identifiers in src/ (the URL
 *     filename `task-file-v2.schema.json` is intentionally preserved
 *     for IDE-cache stability and lives only in comments + strings,
 *     which the regex tolerates)
 *
 * These tests are coarse greps but they catch the kind of misses that
 * a stricter typecheck would not — comment debris, partial renames,
 * forgotten allow-list entries, etc.
 */

import { describe, it, expect } from 'vitest';
import { stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MCP_ROOT = join(__dirname, '..');
const SRC_DIR = join(MCP_ROOT, 'src');
const PLUGIN_ROOT = join(MCP_ROOT, '..', 'plugin');

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function grepLines(pattern: string, paths: string): string[] {
  try {
    const result = execSync(
      `grep -rn "${pattern}" ${paths} 2>/dev/null || true`,
      { encoding: 'utf8' },
    );
    return result
      .trim()
      .split('\n')
      .filter(Boolean);
  } catch {
    return [];
  }
}

describe('no-legacy — V0.2 cleanup landed', () => {
  it('no -v2.ts files in src/', () => {
    const result = execSync(
      `find ${SRC_DIR} -name "*-v2.ts" 2>/dev/null || true`,
      { encoding: 'utf8' },
    );
    expect(result.trim()).toBe('');
  });

  it('migrate dir does not exist', async () => {
    expect(await fileExists(join(SRC_DIR, 'migrate'))).toBe(false);
  });

  it('migrate CLI command does not exist', async () => {
    expect(await fileExists(join(SRC_DIR, 'cli', 'commands', 'migrate.ts'))).toBe(
      false,
    );
  });

  it('no EvidenceV2 / EVIDENCE_PLACEHOLDER references in src/', () => {
    const offenders = grepLines('EvidenceV2\\|EVIDENCE_PLACEHOLDER', SRC_DIR);
    expect(offenders).toEqual([]);
  });

  it('no task_check / code_check references in src/', () => {
    const offenders = grepLines('task_check\\|code_check', SRC_DIR);
    expect(offenders).toEqual([]);
  });

  it('no task-check / code-check references in src/', () => {
    const offenders = grepLines('task-check\\|code-check', SRC_DIR);
    expect(offenders).toEqual([]);
  });

  it('no migrate / migration references in src/', () => {
    const offenders = grepLines('migrate\\|migration', SRC_DIR);
    expect(offenders).toEqual([]);
  });

  it('no task-check / code-check refs in plugin/', () => {
    const offenders = grepLines('task-check\\|code-check', PLUGIN_ROOT);
    expect(offenders).toEqual([]);
  });

  it('no V2-suffixed symbol identifiers in src/', () => {
    // Match a V2 token that's:
    //   - preceded by an identifier character (letter, digit, underscore)
    //   - followed by a non-identifier boundary
    //
    // This catches `TaskFileV2`, `ParseV2`, `SCHEMA_VERSION_V2` etc.
    // The URL string `task-file-v2.schema.json` is lowercase + has a
    // hyphen-v, NOT identifier-V2, so it's untouched.
    const result = execSync(
      `grep -rEn "[A-Za-z0-9_]V2\\b" ${SRC_DIR} 2>/dev/null || true`,
      { encoding: 'utf8' },
    );
    const offenders = result.trim().split('\n').filter(Boolean);
    expect(offenders).toEqual([]);
  });

  it('no stale -v2 path fragments in src/ imports', () => {
    // Catch import paths like `from '../schema/task-file-v2.js'`.
    // Allow the URL-stable schema filename `task-file-v2.schema.json`
    // (still referenced by `src/schema/urls.ts` — but that's a string
    // literal, not an import path, so it does NOT match `.js`/`.ts`).
    // Use single-quoted grep pattern so we don't need to escape the
    // double-quotes that appear in TypeScript import statements.
    const result = execSync(
      `grep -rEn 'from[[:space:]]+["\\x27][^"\\x27]*-v2\\.(js|ts)["\\x27]' ${SRC_DIR} 2>/dev/null || true`,
      { encoding: 'utf8' },
    );
    const offenders = result.trim().split('\n').filter(Boolean);
    expect(offenders).toEqual([]);
  });
});
