/**
 * public-build.test.ts
 *
 * Verifies that a production Vite build contains NO Studio tracing or
 * console-capture code when VITE_ARC_STUDIO_PREVIEW is unset, and that it
 * DOES contain those markers when VITE_ARC_STUDIO_PREVIEW=true.
 *
 * Uses the Vite programmatic JS API (vite.build) with build.write=false so
 * nothing is emitted to disk. The result type is narrowed properly — no `any`.
 */

import { expect, test } from 'bun:test';
import { build } from 'vite';
import type { RollupOutput, OutputChunk, OutputAsset } from 'rollup';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

// Markers that must be absent from a clean production build and present when
// VITE_ARC_STUDIO_PREVIEW=true.
const TRACING_MARKERS: string[] = ['studio-trace-event', 'studio-console-log', '[studio-trace]'];

/** Collect all code strings from a RollupOutput. */
function collectCode(output: RollupOutput): string[] {
  return output.output.map((item: OutputChunk | OutputAsset): string => {
    if (item.type === 'chunk') return (item).code;
    const src = (item).source;
    return typeof src === 'string' ? src : '';
  });
}

/** Collect all module id keys from a RollupOutput. */
function collectModuleIds(output: RollupOutput): string[] {
  return output.output.flatMap((item: OutputChunk | OutputAsset): string[] => {
    if (item.type === 'chunk') return Object.keys((item).modules);
    return [];
  });
}

/**
 * Narrow the Vite build result to RollupOutput[].
 * vite.build() returns Promise<RollupOutput | RollupOutput[] | RollupWatcher>.
 * We never pass `watch`, so RollupWatcher is only a compile-time possibility.
 * Narrow by checking for `output` (present on RollupOutput, absent on RollupWatcher).
 */
function toOutputs(result: RollupOutput | RollupOutput[] | { close(): Promise<void> }): RollupOutput[] {
  if (Array.isArray(result)) return result;
  if ('output' in result) return [result];
  throw new Error('Unexpected RollupWatcher returned from vite.build (watch option was not set)');
}

// ─────────────────────────────────────────────────────────────────────────────
// Case 1: clean production build — tracing markers must be ABSENT
// ─────────────────────────────────────────────────────────────────────────────

test('production build: no Studio tracing in bundle', async () => {
  // Under bun test NODE_ENV defaults to "test", which Vite treats as dev.
  // Override it for the duration of the build.
  const prevNodeEnv = process.env['NODE_ENV'];
  const prevPreview  = process.env['VITE_ARC_STUDIO_PREVIEW'];

  process.env['NODE_ENV'] = 'production';
  delete process.env['VITE_ARC_STUDIO_PREVIEW'];

  let outputs: RollupOutput[];
  try {
    const result = await build({
      root: ROOT,
      mode: 'production',
      logLevel: 'silent',
      build: { write: false },
    });
    outputs = toOutputs(result);
  } finally {
    if (prevNodeEnv !== undefined) {
      process.env['NODE_ENV'] = prevNodeEnv;
    } else {
      delete process.env['NODE_ENV'];
    }
    if (prevPreview !== undefined) {
      process.env['VITE_ARC_STUDIO_PREVIEW'] = prevPreview;
    }
  }

  const allCode = outputs.flatMap(collectCode).join('\n');
  for (const marker of TRACING_MARKERS) {
    expect(allCode).not.toContain(marker);
  }

  const allModuleIds = outputs.flatMap(collectModuleIds).join('\n');
  expect(allModuleIds).not.toContain('src/tracing');
  expect(allModuleIds).not.toContain('src/console-capture');
}, 90_000);

// ─────────────────────────────────────────────────────────────────────────────
// Case 2: VITE_ARC_STUDIO_PREVIEW=true — tracing markers MUST be present.
// This case proves Case 1 is capable of failing.
// ─────────────────────────────────────────────────────────────────────────────

test('production build with VITE_ARC_STUDIO_PREVIEW=true: Studio tracing present', async () => {
  const prevNodeEnv = process.env['NODE_ENV'];
  const prevPreview  = process.env['VITE_ARC_STUDIO_PREVIEW'];

  process.env['NODE_ENV'] = 'production';
  process.env['VITE_ARC_STUDIO_PREVIEW'] = 'true';

  let outputs: RollupOutput[];
  try {
    const result = await build({
      root: ROOT,
      mode: 'production',
      logLevel: 'silent',
      build: { write: false },
    });
    outputs = toOutputs(result);
  } finally {
    if (prevNodeEnv !== undefined) {
      process.env['NODE_ENV'] = prevNodeEnv;
    } else {
      delete process.env['NODE_ENV'];
    }
    if (prevPreview !== undefined) {
      process.env['VITE_ARC_STUDIO_PREVIEW'] = prevPreview;
    } else {
      delete process.env['VITE_ARC_STUDIO_PREVIEW'];
    }
  }

  const allCode = outputs.flatMap(collectCode).join('\n');
  const found = TRACING_MARKERS.some((m) => allCode.includes(m));
  expect(found).toBe(true);
}, 90_000);
