/**
 * scripts/brand-tokens.ts
 *
 * Builds the CSS variables file and the Tailwind theme extension from
 * docs/brand/tokens.json, and refreshes the contrast table in
 * docs/design-system.md.
 *
 *   bun run brand:tokens         write the generated files
 *   bun run brand:check          fail if a generated file is stale or a
 *                                contrast pair is below its WCAG AA minimum
 */

import fs from 'node:fs';
import path from 'node:path';

type Mode = 'light' | 'dark';
type Palette = Record<string, string>;

interface ContrastPair {
  fg: string;
  bg: string;
  min: number;
  use: string;
}

interface Tokens {
  version: string;
  color: Record<Mode, Palette>;
  contrast: ContrastPair[];
  font: Record<string, string>;
  fontSize: Record<string, { size: string; lineHeight: string; weight: number; tracking: string }>;
  spacing: Record<string, string>;
  radius: Record<string, string>;
  borderWidth: Record<string, string>;
  shadow: Record<Mode, Record<string, string>>;
  motion: { duration: Record<string, string>; easing: Record<string, string> };
  breakpoint: Record<string, string>;
  layout: Record<string, string>;
}

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const TOKENS_PATH = path.join(ROOT, 'docs', 'brand', 'tokens.json');
const CSS_PATH = path.join(ROOT, 'docs', 'brand', 'tokens.css');
const TAILWIND_PATH = path.join(ROOT, 'docs', 'brand', 'tailwind.tokens.js');
const DESIGN_SYSTEM_PATH = path.join(ROOT, 'docs', 'design-system.md');

const TABLE_START = '<!-- contrast:start -->';
const TABLE_END = '<!-- contrast:end -->';
const MODES: Mode[] = ['light', 'dark'];

const tokens = JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf-8')) as Tokens;

// ─── WCAG 2.x contrast ───────────────────────────────────────────────────────

function channels(hex: string): [number, number, number] {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) throw new Error(`not a 6 digit hex color: ${hex}`);
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

function color(mode: Mode, name: string): string {
  const value = tokens.color[mode][name];
  if (!value) throw new Error(`unknown color token "${name}" in ${mode}`);
  return value;
}

// Round down to two decimals so a 4.499 never displays as a passing 4.50.
function ratioText(ratio: number): string {
  return (Math.floor(ratio * 100) / 100).toFixed(2);
}

function contrastFailures(): string[] {
  const failures: string[] = [];
  for (const mode of MODES) {
    for (const pair of tokens.contrast) {
      const ratio = contrastRatio(color(mode, pair.fg), color(mode, pair.bg));
      if (ratio < pair.min) {
        failures.push(`${mode}: ${pair.fg} on ${pair.bg} is ${ratioText(ratio)}, needs ${pair.min} (${pair.use})`);
      }
    }
  }
  const lightNames = Object.keys(tokens.color.light).sort().join(',');
  const darkNames = Object.keys(tokens.color.dark).sort().join(',');
  if (lightNames !== darkNames) failures.push('light and dark define different color token names');
  return failures;
}

function contrastTable(): string {
  const rows = tokens.contrast.map((pair) => {
    const cells = MODES.map((mode) => ratioText(contrastRatio(color(mode, pair.fg), color(mode, pair.bg))));
    return `| \`${pair.fg}\` on \`${pair.bg}\` | ${pair.use} | ${pair.min} | ${cells[0]} | ${cells[1]} |`;
  });
  return [
    '| Foreground on background | Used for | Needs | Light | Dark |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
  ].join('\n');
}

// ─── Generators ──────────────────────────────────────────────────────────────

function rgbTriplet(hex: string): string {
  return channels(hex).join(' ');
}

function colorVars(mode: Mode, indent: string): string {
  const lines = Object.entries(tokens.color[mode]).map(
    ([name, hex]) => `${indent}--color-${name}: ${rgbTriplet(hex)}; /* ${hex} */`,
  );
  for (const [name, value] of Object.entries(tokens.shadow[mode])) lines.push(`${indent}--shadow-${name}: ${value};`);
  lines.push(`${indent}color-scheme: ${mode};`);
  return lines.join('\n');
}

function kebab(name: string): string {
  return name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

function buildCss(): string {
  const staticVars: string[] = [];
  for (const [name, value] of Object.entries(tokens.font)) staticVars.push(`  --font-${name}: ${value};`);
  for (const [name, t] of Object.entries(tokens.fontSize)) {
    staticVars.push(`  --text-${name}: ${t.size};`, `  --leading-${name}: ${t.lineHeight};`);
  }
  for (const [name, value] of Object.entries(tokens.spacing)) staticVars.push(`  --space-${name.replace('.', '_')}: ${value};`);
  for (const [name, value] of Object.entries(tokens.radius)) staticVars.push(`  --radius-${name}: ${value};`);
  for (const [name, value] of Object.entries(tokens.borderWidth)) staticVars.push(`  --border-${name}: ${value};`);
  for (const [name, value] of Object.entries(tokens.motion.easing)) staticVars.push(`  --ease-${kebab(name)}: ${value};`);
  for (const [name, value] of Object.entries(tokens.layout)) staticVars.push(`  --layout-${kebab(name)}: ${value};`);
  const durations = Object.entries(tokens.motion.duration).map(([name, value]) => `  --duration-${name}: ${value};`);

  return [
    '/* Generated by scripts/brand-tokens.ts from docs/brand/tokens.json. Do not edit by hand. */',
    '/* Color values are space separated RGB channels so Tailwind can apply opacity: rgb(var(--color-ink) / 0.5). */',
    '',
    ':root {',
    colorVars('light', '  '),
    '',
    ...staticVars,
    '',
    ...durations,
    '}',
    '',
    '@media (prefers-color-scheme: dark) {',
    '  :root:not([data-theme="light"]) {',
    colorVars('dark', '    '),
    '  }',
    '}',
    '',
    ':root[data-theme="dark"] {',
    colorVars('dark', '  '),
    '}',
    '',
    '@media (prefers-reduced-motion: reduce) {',
    '  :root {',
    ...Object.keys(tokens.motion.duration).map((name) => `    --duration-${name}: 0.01ms;`),
    '  }',
    '}',
    '',
  ].join('\n');
}

function buildTailwind(): string {
  const colors = Object.fromEntries(
    Object.keys(tokens.color.light).map((name) => [name, `rgb(var(--color-${name}) / <alpha-value>)`]),
  );
  const fontSize = Object.fromEntries(
    Object.entries(tokens.fontSize).map(([name, t]) => [
      name,
      [t.size, { lineHeight: t.lineHeight, letterSpacing: t.tracking, fontWeight: String(t.weight) }],
    ]),
  );
  const transitionDuration = Object.fromEntries(
    Object.keys(tokens.motion.duration).map((name) => [name, `var(--duration-${name})`]),
  );
  const boxShadow = Object.fromEntries(Object.keys(tokens.shadow.light).map((name) => [name, `var(--shadow-${name})`]));
  const theme = {
    colors,
    fontFamily: { sans: [tokens.font.sans], mono: [tokens.font.mono] },
    fontSize,
    spacing: tokens.spacing,
    borderRadius: tokens.radius,
    borderWidth: { DEFAULT: tokens.borderWidth.hairline, ...tokens.borderWidth },
    boxShadow,
    transitionDuration,
    transitionTimingFunction: tokens.motion.easing,
    screens: tokens.breakpoint,
    minHeight: { touch: tokens.layout.touchTarget },
    minWidth: { touch: tokens.layout.touchTarget },
    maxWidth: { reading: tokens.layout.readingMax, content: tokens.layout.contentMax },
  };
  return [
    '// Generated by scripts/brand-tokens.ts from docs/brand/tokens.json. Do not edit by hand.',
    '// Use as: theme: { extend: brandTheme } in tailwind.config.js, and import tokens.css once.',
    '// Colors reference CSS variables, so light and dark switch without dark: prefixes.',
    `const brandTheme = ${JSON.stringify(theme, null, 2)};`,
    '',
    'export default brandTheme;',
    '',
  ].join('\n');
}

function refreshDesignSystem(current: string): string {
  const start = current.indexOf(TABLE_START);
  const end = current.indexOf(TABLE_END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`docs/design-system.md needs ${TABLE_START} and ${TABLE_END} markers`);
  }
  return `${current.slice(0, start + TABLE_START.length)}\n\n${contrastTable()}\n\n${current.slice(end)}`;
}

// ─── Main ────────────────────────────────────────────────────────────────────

const failures = contrastFailures();
const designSystem = fs.existsSync(DESIGN_SYSTEM_PATH) ? fs.readFileSync(DESIGN_SYSTEM_PATH, 'utf-8') : null;
const outputs: Array<[string, string]> = [
  [CSS_PATH, buildCss()],
  [TAILWIND_PATH, buildTailwind()],
];
if (designSystem !== null) outputs.push([DESIGN_SYSTEM_PATH, refreshDesignSystem(designSystem)]);

if (process.argv.includes('--check')) {
  for (const [file, expected] of outputs) {
    const actual = fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : '';
    if (actual !== expected) failures.push(`${path.relative(ROOT, file)} is stale, run: bun run brand:tokens`);
  }
  if (failures.length > 0) {
    for (const failure of failures) console.error(`brand-tokens: ${failure}`);
    process.exit(1);
  }
  console.log(`brand-tokens: ok, ${tokens.contrast.length} pairs x 2 modes pass, generated files are current`);
} else {
  if (failures.length > 0) {
    for (const failure of failures) console.error(`brand-tokens: ${failure}`);
    process.exit(1);
  }
  for (const [file, content] of outputs) {
    fs.writeFileSync(file, content);
    console.log(`wrote ${path.relative(ROOT, file)}`);
  }
}
