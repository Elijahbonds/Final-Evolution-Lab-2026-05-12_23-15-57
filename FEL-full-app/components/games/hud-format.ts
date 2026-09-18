// Shared HUD value coercion for Babylon host bezels. The mode->HUD contract
// (HudValue) was widened at M47 so a judged contest can push booleans, a
// cleared field (null) and a 3-judge scorecard array. Bezels that only render
// scalar fields use hnode() to coerce a value to something React can render.
import type { HudValue } from '@/lib/babylon';

/** Coerce a widened HUD value to a renderable scalar (string|number). Non-
 * scalar values (boolean flags, null, scorecard arrays) fall back to `d`. */
export function hnode(v: HudValue | undefined, d: string | number = ''): string | number {
  return typeof v === 'string' || typeof v === 'number' ? v : d;
}

/** Numeric read of a HUD field (for meters/among math). */
export function hnum(v: HudValue | undefined, d = 0): number {
  return typeof v === 'number' ? v : d;
}
