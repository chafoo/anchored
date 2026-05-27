/**
 * Read + parse anchored.yml from a project root.
 *
 * The MCP transport layer (and the CLI in P4) calls this to load the
 * user's config before constructing the TaskOps factory. Missing config
 * is NOT an error — we fall back to the schema defaults (empty fields
 * list, etc.) so anchored works out-of-the-box with no config file.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { parseAnchoredYml, type AnchoredYml } from '../schema/anchored-yml.js';
import { parseYamlSafe } from './parser.js';

/**
 * Reads anchored.yml (or anchored.yaml) from `root`. Returns a fully
 * parsed config — defaults are filled in by the zod schema. If neither
 * filename exists, returns the empty-defaults config.
 */
export async function readConfig(root: string): Promise<AnchoredYml> {
  const candidates = ['anchored.yml', 'anchored.yaml'];
  for (const name of candidates) {
    try {
      const raw = await fs.readFile(path.join(root, name), 'utf8');
      return parseAnchoredYml(parseYamlSafe(raw));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }
  return parseAnchoredYml({});
}
