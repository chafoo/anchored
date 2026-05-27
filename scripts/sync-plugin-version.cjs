#!/usr/bin/env node
/**
 * Sync plugin.json version from mcp/package.json.
 *
 * Run from mcp/ (npm version hook calls this with cwd=mcp/).
 * After npm version bumps mcp/package.json, this script reads the
 * new version and writes it to plugin/.claude-plugin/plugin.json so
 * both stay in lockstep (the publish workflow asserts this match).
 */

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const pkgPath = path.join(repoRoot, 'mcp', 'package.json');
const pluginPath = path.join(repoRoot, 'plugin', '.claude-plugin', 'plugin.json');

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
const plugin = JSON.parse(fs.readFileSync(pluginPath, 'utf-8'));

if (plugin.version === pkg.version) {
  console.log(`plugin.json already at ${pkg.version} — no change`);
  process.exit(0);
}

const before = plugin.version;
plugin.version = pkg.version;
fs.writeFileSync(pluginPath, JSON.stringify(plugin, null, 2) + '\n');
console.log(`plugin.json: ${before} → ${pkg.version}`);
