#!/usr/bin/env node
/**
 * Generates assets/og-image.svg — a Minecraft / pixel-voxel styled
 * social-preview card (1280x640) for the anchored repo.
 *
 *   node scripts/make-og.mjs
 *
 * Then render to PNG (committed alongside the svg):
 *   npx -y sharp-cli@latest -i assets/og-image.svg -o assets/og-image.png resize 1280 640
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const W = 1280;
const H = 640;
const out = [];
const push = (s) => out.push(s);

// ── palette ───────────────────────────────────────────────
const TEAL = '#2DD4BF';
const TEAL_HI = '#5EEAD4';
const TEAL_SH = '#0E7C71';
const TEAL_LINE = '#0B3B38';
const INK = '#06121F'; // hard drop-shadow / pixel outline
const WHITE = '#F5FAF9';
const GRAY = '#8FA3B0';

// ── helpers ───────────────────────────────────────────────
// a single minecraft-ish block: base + top highlight strip + outline
function block(x, y, s, base, hi, line = TEAL_LINE) {
  return (
    `<rect x="${x}" y="${y}" width="${s}" height="${s}" fill="${base}" stroke="${line}" stroke-width="2"/>` +
    `<rect x="${x + 2}" y="${y + 2}" width="${s - 4}" height="${Math.round(s * 0.28)}" fill="${hi}" opacity="0.9"/>`
  );
}

// pixel text with a hard, offset drop shadow (the Minecraft look)
function pixelText(x, y, str, size, fill, shadow = INK, weight = 700, anchor = 'start') {
  const off = Math.max(3, Math.round(size * 0.07));
  const f = `font-family="'DejaVu Sans Mono','Menlo',monospace" font-size="${size}" font-weight="${weight}" letter-spacing="1" text-anchor="${anchor}"`;
  return (
    `<text x="${x + off}" y="${y + off}" ${f} fill="${shadow}">${str}</text>` +
    `<text x="${x}" y="${y}" ${f} fill="${fill}">${str}</text>`
  );
}

// ── background ────────────────────────────────────────────
push(`<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`);
push(`<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#070C18"/>
    <stop offset="0.6" stop-color="#0A1A2A"/>
    <stop offset="1" stop-color="#0B2738"/>
  </linearGradient>
  <radialGradient id="glow" cx="0.28" cy="0.42" r="0.5">
    <stop offset="0" stop-color="#2DD4BF" stop-opacity="0.20"/>
    <stop offset="1" stop-color="#2DD4BF" stop-opacity="0"/>
  </radialGradient>
</defs>`);
push(`<rect width="${W}" height="${H}" fill="url(#sky)"/>`);
push(`<rect width="${W}" height="${H}" fill="url(#glow)"/>`);

// pixel stars (hardcoded scatter so output is deterministic)
const stars = [
  [180, 70], [310, 48], [520, 64], [690, 40], [880, 70], [1010, 52],
  [1140, 90], [1200, 200], [70, 180], [430, 96], [770, 100], [960, 150],
  [1180, 320], [60, 300], [1230, 440],
];
for (const [sx, sy] of stars) {
  push(`<rect x="${sx}" y="${sy}" width="5" height="5" fill="#9FE9DF" opacity="0.55"/>`);
}

// ── pixel-art anchor sprite ───────────────────────────────
const MAP = [
  '00011111000',
  '00110001100',
  '00110001100',
  '00011111000',
  '00000100000',
  '11111111111',
  '00000100000',
  '00000100000',
  '10000100001',
  '10000100001',
  '10000100001',
  '11000100011',
  '01100100110',
  '00111111100',
  '00010101000',
];
const S = 26;
const ax = 104;
const ay = 132;
// soft drop shadow under the sprite
push(`<ellipse cx="${ax + 5.5 * S}" cy="${ay + 15.4 * S}" rx="150" ry="22" fill="#000000" opacity="0.28"/>`);
push(`<g>`);
for (let r = 0; r < MAP.length; r++) {
  for (let c = 0; c < MAP[r].length; c++) {
    if (MAP[r][c] === '1') {
      push(block(ax + c * S, ay + r * S, S, TEAL, TEAL_HI));
    }
  }
}
push(`</g>`);

// ── wordmark + headline (pixel drop-shadow text) ──────────
const TX = 470;
push(pixelText(TX, 232, 'anchored', 88, TEAL, TEAL_SH));
push(pixelText(TX, 332, 'Long autonomous AI', 46, WHITE));
push(pixelText(TX, 388, 'coding runs you can', 46, WHITE));
push(pixelText(TX, 444, 'actually trust.', 46, TEAL, TEAL_SH));
push(
  `<text x="${TX + 3}" y="${495}" font-family="'DejaVu Sans Mono',monospace" font-size="22" fill="${INK}">Every claim has proof. Every step configurable.</text>` +
  `<text x="${TX}" y="${492}" font-family="'DejaVu Sans Mono',monospace" font-size="22" fill="${GRAY}">Every claim has proof. Every step configurable.</text>`
);

// ── lifecycle blocks (textured minecraft cubes) ───────────
const cubes = [
  { label: '/plan', base: '#5BA83E', hi: '#86D45F', line: '#2E5E1E', noise: '#4A8E32' }, // grass
  { label: '/refine', base: '#8C6239', hi: '#B5854F', line: '#4E3620', noise: '#6E4B2B' }, // dirt
  { label: '/build', base: '#8A929B', hi: '#B9C1C8', line: '#4C5258', noise: '#717981' }, // stone
  { label: '/wrap', base: '#E0B53B', hi: '#F6D766', line: '#8A6A14', noise: '#C49A2C' }, // gold
];
const cs = 70;
let cx = TX;
const cy = 536;
for (const cube of cubes) {
  push(`<rect x="${cx}" y="${cy}" width="${cs}" height="${cs}" fill="${cube.base}" stroke="${cube.line}" stroke-width="3"/>`);
  push(`<rect x="${cx + 3}" y="${cy + 3}" width="${cs - 6}" height="16" fill="${cube.hi}"/>`);
  // texture noise pixels
  const np = [[14, 30], [46, 24], [30, 48], [52, 50], [18, 54]];
  for (const [nx, ny] of np) {
    push(`<rect x="${cx + nx}" y="${cy + ny}" width="9" height="9" fill="${cube.noise}"/>`);
  }
  push(pixelText(cx + cs / 2, cy + cs + 30, cube.label, 22, WHITE, INK, 700, 'middle'));
  cx += cs + 38;
}

// ── corner tag ────────────────────────────────────────────
push(pixelText(W - 40, H - 28, '// Claude Code plugin', 22, TEAL_HI, INK, 700, 'end'));

push(`</svg>`);

mkdirSync(join(root, 'assets'), { recursive: true });
writeFileSync(join(root, 'assets', 'og-image.svg'), out.join('\n'));
console.log('wrote assets/og-image.svg');
