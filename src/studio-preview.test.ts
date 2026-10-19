/**
 * Tests for src/studio-preview.ts
 * All four combinations of buildAllows x inFrame.
 */

import { expect, test } from 'bun:test';
import { shouldLoadStudioInstrumentation } from './studio-preview.js';

test('studio-preview: buildAllows=true, inFrame=true => load', () => {
  expect(shouldLoadStudioInstrumentation({ buildAllows: true, inFrame: true })).toBe(true);
});

test('studio-preview: buildAllows=true, inFrame=false => skip (not in a frame)', () => {
  expect(shouldLoadStudioInstrumentation({ buildAllows: true, inFrame: false })).toBe(false);
});

test('studio-preview: buildAllows=false, inFrame=true => skip (production build)', () => {
  expect(shouldLoadStudioInstrumentation({ buildAllows: false, inFrame: true })).toBe(false);
});

test('studio-preview: buildAllows=false, inFrame=false => skip', () => {
  expect(shouldLoadStudioInstrumentation({ buildAllows: false, inFrame: false })).toBe(false);
});
