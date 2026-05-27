#!/usr/bin/env node
// esbuild config — produces single-file bundles for the CLI and MCP binaries.
// Run via `npm run build`.

import { build } from 'esbuild';
import { rm, chmod } from 'node:fs/promises';

const shared = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  // Mark Node built-ins as external so esbuild doesn't try to bundle them
  external: ['node:*'],
  // Source maps for stack traces in production
  sourcemap: true,
  // Keep names so error stacks are readable
  keepNames: true,
  // ESM in Node needs explicit handling — banner adds module-mode shims
  banner: {
    js: [
      "import { createRequire as __anchoredCR } from 'node:module';",
      "const require = __anchoredCR(import.meta.url);"
    ].join('\n'),
  },
};

// Clean dist/ before build
await rm('dist', { recursive: true, force: true });

// CLI binary
await build({
  ...shared,
  entryPoints: ['src/cli/bin.ts'],
  outfile: 'dist/cli/bin.js',
  banner: {
    js: '#!/usr/bin/env node\n' + shared.banner.js,
  },
});

// MCP server binary
await build({
  ...shared,
  entryPoints: ['src/mcp/server.ts'],
  outfile: 'dist/mcp/server.js',
  banner: {
    js: '#!/usr/bin/env node\n' + shared.banner.js,
  },
});

// Both outputs are bin entries — must be executable
await chmod('dist/cli/bin.js', 0o755);
await chmod('dist/mcp/server.js', 0o755);

// Export JSON Schemas for IDE validation.
// We bundle the schema modules separately (un-minified, ESM) so the
// export script can import them via `node` without tsx. This keeps the
// schema → JSON Schema pipeline a pure Node call, no extra runtime deps.
await build({
  ...shared,
  entryPoints: ['src/schema/task-file.ts', 'src/schema/anchored-yml.ts'],
  outdir: 'dist-schemas',
  // schemas import each other and zod; bundle for self-containment
  bundle: true,
});

// Now run the export script
const { spawn } = await import('node:child_process');
await new Promise((resolve, reject) => {
  const child = spawn('node', ['scripts/export-schemas.mjs'], {
    stdio: 'inherit',
  });
  child.on('exit', (code) =>
    code === 0 ? resolve() : reject(new Error(`export-schemas exited ${code}`)),
  );
});

// Clean up the intermediate schema bundles — only the JSON Schema files
// in dist/schema/ are the user-facing artifact
await rm('dist-schemas', { recursive: true, force: true });

// Mirror the JSON Schema files into the versioned plugin tree so they
// land in git AND ship with the marketplace plugin. The stable URL
// `https://raw.githubusercontent.com/<owner>/<repo>/<ref>/plugin/references/schema/<name>.schema.json`
// then resolves to a known-version artifact — IDEs cache it,
// yaml-language-server validates against it, no per-install setup.
import { mkdir as mkdirP, copyFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const SCHEMA_SRC = 'dist/schema';
const SCHEMA_PUBLISH = '../plugin/references/schema';

await mkdirP(SCHEMA_PUBLISH, { recursive: true });
const schemaFiles = await readdir(SCHEMA_SRC);
for (const f of schemaFiles) {
  if (!f.endsWith('.json')) continue;
  await copyFile(join(SCHEMA_SRC, f), join(SCHEMA_PUBLISH, f));
  console.log(`  ✓ published → plugin/references/schema/${f}`);
}

console.log(
  'Build complete: dist/cli/bin.js + dist/mcp/server.js + dist/schema/*.schema.json + plugin/references/schema/*.schema.json',
);
