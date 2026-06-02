/**
 * Verifies that the JSON Schema publishing pipeline lands schemas
 * at the canonical, versioned path under `plugin/references/schema/`.
 * That path is the stable contract — IDEs / yaml-language-server
 * resolve `$schema=...` against this URL, so moving or renaming
 * breaks validation for installed users.
 */

import { describe, it, expect } from 'vitest';
import { readFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SCHEMA_URL_TASK_FILE,
  SCHEMA_URL_ANCHORED_YML,
  languageServerDirective,
} from '../src/schema/urls.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_SCHEMA_DIR = resolve(__dirname, '..', '..', 'plugin', 'references', 'schema');

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

describe('schema publishing — plugin/references/schema/', () => {
  it('task-file-v2.schema.json is present in plugin tree after build', async () => {
    const path = join(PLUGIN_SCHEMA_DIR, 'task-file-v2.schema.json');
    expect(await exists(path), `schema must be published at ${path}`).toBe(true);
  });

  it('anchored-yml.schema.json is present in plugin tree after build', async () => {
    const path = join(PLUGIN_SCHEMA_DIR, 'anchored-yml.schema.json');
    expect(await exists(path), `schema must be published at ${path}`).toBe(true);
  });

  it('published task-file-v2 schema is parseable JSON with expected shape', async () => {
    const raw = await readFile(join(PLUGIN_SCHEMA_DIR, 'task-file-v2.schema.json'), 'utf-8');
    const obj = JSON.parse(raw);
    expect(obj.title).toBe('Anchored Task-File (v2)');
    // The schema_version field should be a const literal 2
    expect(JSON.stringify(obj)).toContain('"const":2');
  });

  it('published anchored-yml schema is parseable JSON with expected shape', async () => {
    const raw = await readFile(join(PLUGIN_SCHEMA_DIR, 'anchored-yml.schema.json'), 'utf-8');
    const obj = JSON.parse(raw);
    expect(obj.title).toContain('Anchored');
  });
});

describe('canonical schema URLs', () => {
  it('SCHEMA_URL_TASK_FILE points at raw.githubusercontent.com plugin path', () => {
    expect(SCHEMA_URL_TASK_FILE).toMatch(
      /^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[^/]+\/plugin\/references\/schema\/task-file-v2\.schema\.json$/,
    );
  });

  it('SCHEMA_URL_ANCHORED_YML points at raw.githubusercontent.com plugin path', () => {
    expect(SCHEMA_URL_ANCHORED_YML).toMatch(
      /^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[^/]+\/plugin\/references\/schema\/anchored-yml\.schema\.json$/,
    );
  });

  it('URL path segment matches actual published file location', () => {
    // The URL contract: path AFTER ref/branch must be exactly
    // "plugin/references/schema/<name>.schema.json" (matching where
    // build.mjs copies the files). If they drift, IDE validation breaks.
    expect(
      SCHEMA_URL_TASK_FILE.endsWith('/plugin/references/schema/task-file-v2.schema.json'),
    ).toBe(true);
    expect(
      SCHEMA_URL_ANCHORED_YML.endsWith('/plugin/references/schema/anchored-yml.schema.json'),
    ).toBe(true);
  });

  it('languageServerDirective formats the yaml-language-server comment line', () => {
    const line = languageServerDirective(SCHEMA_URL_TASK_FILE);
    expect(line.startsWith('# yaml-language-server: $schema=')).toBe(true);
    expect(line).toContain('task-file-v2.schema.json');
    expect(line.endsWith('\n')).toBe(true);
  });
});
