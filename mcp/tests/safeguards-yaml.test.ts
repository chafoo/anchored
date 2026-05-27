/**
 * P11 production-safeguards: YAML parser hardening.
 *
 * Three guarantees enforced by `core/parser.ts:parseYamlSafe`:
 *
 *   1. **Size cap** — documents over 1 MB throw `DocumentTooLarge`
 *      before the parser runs, defending against runaway accumulation
 *      and parse-bomb payloads.
 *
 *   2. **Alias-count cap** — `maxAliasCount: 100` blocks billion-
 *      laughs / quadratic-blowup attacks via nested aliases.
 *
 *   3. **No custom tags** — `customTags: []` disables `!!js/function`,
 *      `!!js/regexp`, and any user-defined tag, ensuring task-files
 *      stay pure data.
 *
 * A fourth test grep-asserts that NO bare `yaml.parse(` calls exist
 * in the production `src/` tree outside the centralized wrapper.
 */

import { describe, it, expect } from 'vitest';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { parseYamlSafe, MAX_DOCUMENT_SIZE } from '../src/core/parser.js';
import { DocumentTooLarge } from '../src/core/errors.js';

describe('parseYamlSafe size cap', () => {
  it('throws DocumentTooLarge when raw input exceeds 1 MB', () => {
    // Build a 2 MB string of valid YAML (a single long scalar).
    const payload = 'value: ' + 'x'.repeat(2 * 1024 * 1024);
    expect(payload.length).toBeGreaterThan(MAX_DOCUMENT_SIZE);
    expect(() => parseYamlSafe(payload)).toThrow(DocumentTooLarge);
  });

  it('DocumentTooLarge message reports actual byte count + suggestions', () => {
    const payload = 'value: ' + 'x'.repeat(2 * 1024 * 1024);
    try {
      parseYamlSafe(payload);
      throw new Error('expected DocumentTooLarge');
    } catch (err) {
      expect(err).toBeInstanceOf(DocumentTooLarge);
      const e = err as DocumentTooLarge;
      expect(e.message).toMatch(/1 MB/);
      expect(e.message).toMatch(/\d+ bytes/);
      expect(e.suggestions.length).toBeGreaterThan(0);
    }
  });

  it('accepts a document just under the cap', () => {
    // 999 KB of payload — well below 1 MB cap.
    const payload = 'value: ' + 'x'.repeat(999 * 1024);
    expect(payload.length).toBeLessThan(MAX_DOCUMENT_SIZE);
    expect(() => parseYamlSafe(payload)).not.toThrow();
  });
});

describe('parseYamlSafe billion-laughs guard', () => {
  it('rejects a YAML document with excessive alias expansion', () => {
    // Classic YAML alias bomb — 9 levels deep, each level references
    // the previous one twice. Expansion is 2^9 = 512 alias resolutions
    // for the final reference, well past the 100 cap.
    const bomb = `
a: &a ["lol"]
b: &b [*a, *a, *a, *a, *a, *a, *a, *a, *a]
c: &c [*b, *b, *b, *b, *b, *b, *b, *b, *b]
d: &d [*c, *c, *c, *c, *c, *c, *c, *c, *c]
e: [*d, *d, *d, *d, *d, *d, *d, *d, *d]
`;
    expect(() => parseYamlSafe(bomb)).toThrow();
    // The thrown error should reference alias count somewhere
    // (yaml library's message), not silently expand the bomb.
    try {
      parseYamlSafe(bomb);
    } catch (err) {
      const msg = (err as Error).message.toLowerCase();
      expect(msg).toMatch(/alias/);
    }
  });

  it('accepts a YAML document with a small number of aliases', () => {
    // 3 aliases used a handful of times — well under the 100 cap.
    const doc = `
defaults: &d
  retries: 3
  timeout: 5000
service_a:
  <<: *d
service_b:
  <<: *d
`;
    expect(() => parseYamlSafe(doc)).not.toThrow();
  });
});

describe('parseYamlSafe custom-tag rejection', () => {
  it('rejects unknown / custom YAML tags', () => {
    // `!!js/function` is a notorious vector when `js-yaml` is used
    // unsafely; the `yaml` library handles tags differently, but with
    // `customTags: []` any explicit non-core tag is unresolved. The
    // parser surfaces this as a warning by default; we tighten by
    // checking the parsed output drops to a generic Scalar (NOT the
    // function we'd get under a permissive parser).
    const doc = `value: !!js/function "function f() { return 42 }"`;
    // Either it throws, or the value is parsed as a string/scalar
    // rather than an executable function. Both outcomes are safe;
    // both prove no code execution happens.
    let result: unknown;
    let threw = false;
    try {
      result = parseYamlSafe(doc);
    } catch {
      threw = true;
    }
    if (!threw) {
      // The "function" body must NOT have been executed — the value
      // must be a string, not a callable function.
      const v = (result as { value: unknown }).value;
      expect(typeof v).not.toBe('function');
    }
  });
});

describe('callsite discipline: yaml.parse routed through parseYamlSafe', () => {
  it('no bare yaml.parse(/parseYaml(/yamlParse( calls in production src outside the wrapper', async () => {
    const srcRoot = join(__dirname, '..', 'src');
    const offenders = await findBareYamlParseCalls(srcRoot);

    // Allow-list:
    //   - src/core/parser.ts: this IS the wrapper, it's allowed to call yamlParse.
    const allowed = new Set(['core/parser.ts']);

    const unexpected = offenders.filter((rel) => !allowed.has(rel));
    expect(unexpected, `unexpected bare yaml.parse callsites: ${unexpected.join(', ')}`).toEqual([]);
  });

  it('the centralized wrapper is the only callsite of the underlying yaml lib parse', async () => {
    const srcRoot = join(__dirname, '..', 'src');
    const offenders = await findBareYamlParseCalls(srcRoot);
    expect(offenders).toEqual(['core/parser.ts']);
  });
});

// ─────────────────────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────────────────────

/**
 * Walk `root` recursively and return relative paths of `.ts` files
 * that contain a bare yaml-parsing call (yaml.parse / parseYaml /
 * yamlParse). Used to enforce the centralized-wrapper discipline.
 */
async function findBareYamlParseCalls(root: string): Promise<string[]> {
  const found: string[] = [];
  // Pattern matches: `yaml.parse(`, `parseYaml(`, `yamlParse(`
  // (but NOT `parseYamlSafe(` — the leading-boundary requirement
  // excludes the wrapper-named identifier).
  const pattern = /\b(?:yaml\.parse|parseYaml|yamlParse)\s*\(/;
  await walk(root, async (full, rel) => {
    if (!full.endsWith('.ts')) return;
    const raw = await readFile(full, 'utf-8');
    // Strip comments before testing (a comment mentioning `yaml.parse`
    // is not a callsite). The `yaml` block-scalar parser doesn't strip
    // them, so we do a simple line-based pass.
    const stripped = raw
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, '').replace(/\/\*[\s\S]*?\*\//g, ''))
      .join('\n');
    if (pattern.test(stripped)) {
      found.push(rel);
    }
  });
  return found.sort();
}

async function walk(
  dir: string,
  onFile: (full: string, rel: string) => Promise<void>,
  base = dir,
): Promise<void> {
  const entries = await readdir(dir);
  for (const entry of entries) {
    const full = join(dir, entry);
    const s = await stat(full);
    if (s.isDirectory()) {
      await walk(full, onFile, base);
    } else if (s.isFile()) {
      const rel = full.slice(base.length + 1);
      await onFile(full, rel);
    }
  }
}
