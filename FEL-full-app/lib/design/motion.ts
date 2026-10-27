// MOTION TOKENS (lane/premium-ui, 2026-10-27; docs/PLAN-UI-10PHASE.md P1).
//
// "No motion or feel — static, no transitions, janky loads" was the owner's fourth reason. Motion here is three
// durations and two curves, in app/theme.css as --fel-dur-* / --fel-ease-*, and every premium class reads them. They
// collapse to zero when motion is reduced, from EITHER source:
//   - the device: @media (prefers-reduced-motion: reduce), unless the player chose Full in the app;
//   - the app's own Motion setting (lib/a11y/reducedMotion.ts, Account → Accessibility), carried onto <html> as
//     data-fel-motion="reduce" | "full" by useMotionAttr (components/ui/fel/use-motion-attr.ts).
// Only opacity and transform animate (compositor-only: no layout, no paint storms on an iPhone).
import { MOTION_PREFS, resolveReducedMotion, type MotionPref } from '@/lib/a11y/reducedMotion';

/** Durations (ms). */
export const DURATION = { fast: 140, base: 240, slow: 420 } as const;

/** Curves. `out` is a soft expo-out (things arrive and settle); `pop` overshoots a touch (a press, a ring filling). */
export const EASE = { out: 'cubic-bezier(0.16, 1, 0.3, 1)', pop: 'cubic-bezier(0.2, 1.4, 0.4, 1)' } as const;

/** The scale a pressed control drops to. */
export const PRESS_SCALE = 0.97;

/** The attribute on <html> that carries the app's Motion setting to CSS. */
export const MOTION_ATTR = 'data-fel-motion';

/** PURE: the attribute's value for a stored choice — 'system' leaves the device's setting in charge (no attribute). */
export function motionAttrValue(pref: MotionPref): 'reduce' | 'full' | null {
  return pref === 'system' ? null : pref;
}

/** PURE: does a duration apply, given the choice and the device? Reduced motion = 0 ms. */
export function durationFor(ms: number, pref: MotionPref, osReduces: boolean): number {
  return resolveReducedMotion(pref, osReduces) ? 0 : ms;
}

export { MOTION_PREFS };
