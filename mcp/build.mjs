#!/usr/bin/env node
// esbuild config — produces single-file bundles for the CLI and MCP binaries.
// Run via `npm run build`.

import { build } from 'esbuild';
import { rm } from 'node:fs/promises';

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

console.log('Build complete: dist/cli/bin.js + dist/mcp/server.js');
