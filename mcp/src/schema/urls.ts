/**
 * Canonical URLs for the published JSON Schema files.
 *
 * Used by:
 *   - plan-agent to bake a `# yaml-language-server: $schema=...` header
 *     into every generated task-file
 *   - `anchored init` (when it lands) to bake the same header into the
 *     default anchored.yml
 *   - README documentation
 *
 * The URL points at the raw github-content path under the versioned
 * plugin tree. Build copies the schemas from mcp/dist/schema/ to
 * plugin/references/schema/ so they land in git and ship in the
 * marketplace plugin payload. Path is part of the contract — moving
 * the schema files breaks IDE validation for existing users.
 */

const RAW_GITHUB = 'https://raw.githubusercontent.com';
const REPO = 'chafoo/anchored';
const REF = 'main';
const BASE = `${RAW_GITHUB}/${REPO}/${REF}/plugin/references/schema`;

// Note: the URL filename stays `task-file-v2.schema.json` for IDE-cache
// stability. Existing user `# yaml-language-server: $schema=...` headers
// resolve against this exact path — moving the schema file would invalidate
// every published task-file's validation. Internal symbols drop the legacy
// suffix; the URL artifact intentionally does not.
export const SCHEMA_URL_TASK_FILE = `${BASE}/task-file-v2.schema.json`;
export const SCHEMA_URL_ANCHORED_YML = `${BASE}/anchored-yml.schema.json`;

/**
 * Returns the `yaml-language-server` directive line to bake into a
 * generated file. Includes the trailing newline so callers can
 * concatenate it directly with the file body.
 */
export function languageServerDirective(schemaUrl: string): string {
  return `# yaml-language-server: $schema=${schemaUrl}\n`;
}
