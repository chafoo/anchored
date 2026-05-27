#!/usr/bin/env node
/**
 * Export Zod schemas to JSON Schema files for IDE validation.
 *
 * Produces:
 *   dist/schema/task-file-v2.schema.json
 *   dist/schema/anchored-yml.schema.json  (if exposed by anchored-yml.ts)
 *
 * Wired into `npm run build` via build.mjs so the exports stay in
 * sync with the Zod definitions.
 *
 * Users can reference these via a `# yaml-language-server: $schema=...`
 * comment at the top of their task-files / anchored.yml for live
 * IDE validation (see ticket: json-schema-ide-validation).
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { TaskFile } from '../dist-schemas/task-file.js';
import { AnchoredYml } from '../dist-schemas/anchored-yml.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'dist', 'schema');

const schemas = [
  {
    name: 'task-file-v2',
    zod: TaskFile,
    title: 'Anchored Task-File (v2)',
    description:
      'Schema for anchored task-files (v2 YAML format). Validates the ' +
      'parsed YAML structure: frontmatter, context sections, phases ' +
      'with acceptance criteria, and any user-declared extension fields.',
  },
  {
    name: 'anchored-yml',
    zod: AnchoredYml,
    title: 'Anchored project configuration (anchored.yml)',
    description:
      'Schema for the project-level anchored.yml file. Validates the ' +
      'task.phase.fields declarations and the plan/build/wrap pipeline ' +
      'configuration.',
  },
];

await mkdir(OUT_DIR, { recursive: true });

for (const { name, zod, title, description } of schemas) {
  const jsonSchema = zodToJsonSchema(zod, {
    name,
    $refStrategy: 'none', // inline everything — simpler for IDE consumption
  });
  // top-level title + description for nicer IDE tooltips
  jsonSchema.title = title;
  jsonSchema.description = description;

  const outPath = join(OUT_DIR, `${name}.schema.json`);
  await writeFile(outPath, JSON.stringify(jsonSchema, null, 2) + '\n', 'utf-8');
  console.log(`  ✓ ${name} → dist/schema/${name}.schema.json`);
}

console.log('JSON Schema export complete.');
