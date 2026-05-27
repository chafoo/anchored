/**
 * Task-file renderer — thin wrapper over `yaml.stringify`.
 *
 * Configured to:
 *   - emit block scalars (|) for multi-line strings → no escape soup
 *   - preserve the user's key insertion order (no alphabetic sorting)
 *   - use 2-space indent (idiomatic for YAML)
 *   - flush trailing newline at EOF (POSIX text-file convention)
 *
 * The renderer is intentionally configuration-only. There's no
 * custom logic — anything that would require special handling lives
 * in the parser (validation) or the service-layer (mutation).
 */

import { stringify as yamlStringify } from 'yaml';
import type { TaskFile } from '../schema/task-file.js';

export function renderTaskFileYAML(file: TaskFile): string {
  const out = yamlStringify(file, {
    indent: 2,
    lineWidth: 100,
    // PLAIN/QUOTE_DOUBLE for short strings; the yaml lib auto-picks
    // BLOCK_LITERAL (|) for multi-line strings — exactly what we want
    // to avoid the newline-corruption bug-class.
    defaultStringType: 'PLAIN',
    defaultKeyType: 'PLAIN',
  });
  // Ensure trailing newline for POSIX-friendly output
  return out.endsWith('\n') ? out : out + '\n';
}
