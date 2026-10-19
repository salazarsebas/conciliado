/**
 * src/studio-preview.ts
 *
 * Pure function that decides whether to load Arc Studio tracing and console
 * capture instrumentation. Keeping the decision in one place makes it easy
 * to test without a DOM.
 *
 * The two conditions that must BOTH be true:
 *   buildAllows: the build-time flag is on (DEV mode or VITE_ARC_STUDIO_PREVIEW=true).
 *   inFrame: the page is running inside a parent frame (window.parent !== window).
 */

export interface ShouldLoadArgs {
  /** True when import.meta.env.DEV || import.meta.env.VITE_ARC_STUDIO_PREVIEW === 'true' */
  buildAllows: boolean;
  /** True when window.parent !== window */
  inFrame: boolean;
}

/**
 * Returns true only when BOTH conditions hold: the build permits it AND the
 * page is running inside a parent frame. If either is false, the modules are
 * never imported and are dropped from the production bundle by tree shaking.
 */
export function shouldLoadStudioInstrumentation({ buildAllows, inFrame }: ShouldLoadArgs): boolean {
  return buildAllows && inFrame;
}
