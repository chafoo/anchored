/**
 * Tests that generated artifacts include the
 * `# yaml-language-server: $schema=...` directive at file top.
 *
 * This is what gives users free IDE validation — VSCode / JetBrains /
 * Neovim / etc. all auto-resolve the directive when present. Without
 * it, users would need to manually configure their editor to find
 * the schema. With it, validation is free out of the box.
 */

import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SCHEMA_URL_TASK_FILE,
  SCHEMA_URL_ANCHORED_YML,
} from '../src/schema/urls.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

describe('auto-comment: yaml-language-server directives', () => {
  it('plan-agent prompt teaches the task-file schema URL', async () => {
    const planPrompt = await readFile(
      resolve(REPO_ROOT, 'plugin', 'agents', 'plan.md'),
      'utf-8',
    );
    expect(planPrompt).toContain('yaml-language-server: $schema=');
    expect(planPrompt).toContain('task-file-v2.schema.json');
    // The exact URL constant must appear (not just any URL — IDEs match
    // on the exact string)
    expect(planPrompt).toContain(SCHEMA_URL_TASK_FILE);
  });

  it('default anchored.yml ships with anchored-yml schema directive on line 1', async () => {
    const defaultConfig = await readFile(
      resolve(REPO_ROOT, 'plugin', 'references', 'default-config.yml'),
      'utf-8',
    );
    const firstLine = defaultConfig.split('\n')[0];
    expect(firstLine).toMatch(/^# yaml-language-server: \$schema=/);
    expect(firstLine).toContain('anchored-yml.schema.json');
    // Must use the canonical URL (drift would silently break IDE validation)
    expect(firstLine).toContain(SCHEMA_URL_ANCHORED_YML);
  });

  it('default anchored.yml is still parseable YAML after the directive', async () => {
    const yamlPkg = await import('yaml');
    const defaultConfig = await readFile(
      resolve(REPO_ROOT, 'plugin', 'references', 'default-config.yml'),
      'utf-8',
    );
    // The directive is a YAML comment — must NOT break parsing.
    // The file ships tsconfig-style (everything commented out), so the
    // parsed document is null/empty. That's the design — the file is a
    // template the user uncomments + edits.
    const parsed = yamlPkg.parse(defaultConfig);
    // No parse exception thrown is the contract. Either null (fully empty
    // doc) or a mapping object is fine.
    expect(parsed === null || typeof parsed === 'object').toBe(true);
  });
});
