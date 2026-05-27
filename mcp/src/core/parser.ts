/**
 * Centralized YAML parser with safety hardening.
 *
 * Every YAML read in the production code path (factory ops, MCP
 * tools, CLI commands, config loader) routes through `parseYamlSafe`
 * instead of calling `yaml.parse` directly. The wrapper bolts on
 * three production-readiness guards:
 *
 *   1. **Size cap (1 MB).** A task-file legitimately tops out around
 *      tens of KB; documents over 1 MB are either runaway growth
 *      bugs (audit history accumulating without bound) or active
 *      parse-bomb attacks. Throws `DocumentTooLarge` before invoking
 *      the parser at all — avoids spending CPU on hostile input.
 *
 *   2. **Billion-laughs guard (maxAliasCount: 100).** The `yaml`
 *      library lets a single alias expand exponentially via nested
 *      references (`&a [ *b, *b ]; &b [ *c, *c ]; ...`). 100 alias
 *      resolutions is well above any legitimate document and well
 *      below the threshold that consumes meaningful RAM.
 *
 *   3. **No custom tags.** `customTags: []` disables `!!js/function`,
 *      `!!js/regexp`, and any user-defined tag handlers. Task-files
 *      are pure data — there's no legitimate reason for them to
 *      carry executable payloads or implementation-defined types.
 *
 * The parser is the single point through which untrusted YAML can
 * enter the process; tests assert no other `yaml.parse(` callsites
 * exist in `src/core/`, `src/cli/`, `src/mcp/`, `src/parser/parse.ts`.
 */

import { parse as yamlParse } from 'yaml';

import { DocumentTooLarge } from './errors.js';

/** 1 MB hard cap on raw YAML input. See module docstring. */
export const MAX_DOCUMENT_SIZE = 1024 * 1024;

/**
 * Parse a raw YAML string into a plain JS structure. Schema validation
 * is the caller's responsibility — this wrapper only handles the
 * untrusted-bytes → JS-value transition.
 *
 * Throws `DocumentTooLarge` if `raw.length > MAX_DOCUMENT_SIZE`, or
 * the underlying `yaml` library's error if the document violates the
 * alias-count or custom-tag guards (or is malformed YAML).
 */
export function parseYamlSafe(raw: string): unknown {
  if (raw.length > MAX_DOCUMENT_SIZE) {
    throw new DocumentTooLarge(
      `YAML document exceeds 1 MB limit (got ${raw.length} bytes). ` +
        `Documents this large indicate either runaway accumulation ` +
        `(audit history growing without bound) or a parse-bomb payload.`,
      [
        'Trim accumulated context/build/wrap history if the file grew organically.',
        'If you did not expect a file this size, inspect it manually for anomalies before continuing.',
        'The 1 MB cap is a defense-in-depth guard — legitimate task-files top out around tens of KB.',
      ],
    );
  }
  return yamlParse(raw, {
    // Disable custom YAML tags — no `!!js/function`, no user-defined
    // type handlers. Task-files are pure data.
    customTags: [],
    // Billion-laughs guard: cap alias resolutions per parse.
    maxAliasCount: 100,
    // Better error messages with line/column context.
    prettyErrors: true,
  });
}
