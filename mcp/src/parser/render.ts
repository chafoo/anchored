/**
 * Task-file renderer — thin wrapper over `yaml.stringify`.
 *
 * Configured to:
 *   - emit block scalars (|) for multi-line strings → no escape soup
 *   - preserve the user's key insertion order (no alphabetic sorting)
 *   - use 2-space indent (idiomatic for YAML)
 *   - flush trailing newline at EOF (POSIX text-file convention)
 *   - prepend the `yaml-language-server: $schema=...` directive on
 *     line 1 so IDEs auto-pick up schema validation. YAML comments
 *     don't round-trip through the parser, so the renderer is the
 *     single canonical injection point — every MCP write of a
 *     task-file emits the directive, regardless of what the prior
 *     file looked like on disk.
 *
 * The renderer is intentionally configuration-only otherwise. There's
 * no other custom logic — anything that would require special
 * handling lives in the parser (validation) or the service-layer
 * (mutation).
 */

import { stringify as yamlStringify } from 'yaml';
import type { TaskFile } from '../schema/task-file.js';
import { SCHEMA_URL_TASK_FILE } from '../schema/urls.js';

/**
 * The yaml-language-server directive that VS Code / JetBrains / Neovim
 * (and any other LSP-aware editor) auto-detects on line 1 to enable
 * inline schema validation. Single source of truth.
 */
export const SCHEMA_DIRECTIVE = `# yaml-language-server: $schema=${SCHEMA_URL_TASK_FILE}`;

export function renderTaskFileYAML(file: TaskFile): string {
  const body = yamlStringify(file, {
    indent: 2,
    lineWidth: 100,
    // PLAIN/QUOTE_DOUBLE for short strings; the yaml lib auto-picks
    // BLOCK_LITERAL (|) for multi-line strings — exactly what we want
    // to avoid the newline-corruption bug-class.
    defaultStringType: 'PLAIN',
    defaultKeyType: 'PLAIN',
  });
  // Prepend schema directive (line 1) + ensure trailing newline.
  const withDirective = `${SCHEMA_DIRECTIVE}\n${body}`;
  return withDirective.endsWith('\n') ? withDirective : withDirective + '\n';
}
