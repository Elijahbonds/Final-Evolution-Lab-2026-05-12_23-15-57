// PRQ SETS THE CEILING; THE EDITOR SPENDS UNDERNEATH IT (owner decision, 2026-09-14).
//
// The spec adds ~45 attributes on 0–99 and `lib/prq.ts` already defines 8 measured axes on 0–100 that the
// platform documents as *the* gating primitive — "other systems read it; they do not duplicate its logic".
// Several rows are the same quantity under two names (Speed, Strength, Stamina, Agility, Vertical). Two
// numbers describing one athlete is exactly the failure the shared-profile rule exists to prevent, and it
// has bitten this project before.
//
// The resolution, and why it is the right one for THIS platform:
//
//   Training in the real world raises what a body attribute CAN reach. The editor decides how the points
//   are spent underneath that. So real work moves the number — which is the entire pitch — and a slider in
//   a character creator can never claim you got faster, which would make the fitness score meaningless.
//
// THE FLOOR IS THE OTHER HALF, and it matters more than the cap. A player with no PRQ at all — a guest, a
// new account, anyone who has not done a body scan — must not be handed a worse athlete than the person
// beside them. No PRQ means NO CEILING: the full 0–99 range is open, exactly as it would be in a game with
// no fitness layer at all. PRQ is upside for those who have it, never a tax on those who do not. This is
// the same rule PrqVitals holds for combat, for the same reason.
//
// Pure: no Babylon, no fetch, no storage.

import type { RatedRow, PrqAxisId } from './types';

/** Attribute cap when the athlete has no PRQ. The whole range: absence is never a penalty. */
export const NO_PRQ_CAP = 99;

/**
 * Headroom above the measured axis, in attribute points.
 *
 * A PRQ of 60 does not mean a hard 60 on Speed. The measured axis is a floor-of-the-ceiling: it says what
 * the body has demonstrated, and the game grants room above it, because a rating is not a lab result and a
 * player should never feel their build is being audited. Generous on purpose.
 */
export const PRQ_HEADROOM = 22;

/** Nobody's ceiling drops below this, whatever a scan said. A build has to be playable. */
export const MIN_CEILING = 55;

/**
 * The cap for one attribute, given the athlete's PRQ axes.
 *
 * `axes` is the measured profile (0–100 per axis) or null/empty when there is none.
 */
export function ceilingFor(row: Pick<RatedRow, 'prqAxis' | 'max'>, axes?: Partial<Record<PrqAxisId, number>> | null): number {
  if (!row.prqAxis) return row.max;                       // skill is free — see the header
  const measured = axes?.[row.prqAxis];
  if (!Number.isFinite(measured as number)) return NO_PRQ_CAP;   // no scan, no ceiling
  const v = Math.max(0, Math.min(100, measured as number));
  return Math.max(MIN_CEILING, Math.min(row.max, Math.round(v + PRQ_HEADROOM)));
}

/** Is this value legal for this row? */
export function withinCeiling(row: Pick<RatedRow, 'prqAxis' | 'max' | 'min'>, value: number, axes?: Partial<Record<PrqAxisId, number>> | null): boolean {
  if (!Number.isFinite(value)) return false;
  return value >= row.min && value <= ceilingFor(row, axes);
}

/** Clamp a value into its legal band — what the stepper uses so it cannot walk past the cap. */
export function clampToCeiling(row: Pick<RatedRow, 'prqAxis' | 'max' | 'min'>, value: number, axes?: Partial<Record<PrqAxisId, number>> | null): number {
  if (!Number.isFinite(value)) return row.min;
  return Math.max(row.min, Math.min(ceilingFor(row, axes), Math.round(value)));
}

/** The one line the editor prints under a capped row, or '' when nothing caps it. */
export function ceilingNote(row: Pick<RatedRow, 'prqAxis' | 'max'>, axes?: Partial<Record<PrqAxisId, number>> | null): string {
  if (!row.prqAxis) return '';
  const measured = axes?.[row.prqAxis];
  if (!Number.isFinite(measured as number)) return '';
  return `CEILING ${ceilingFor(row, axes)} · raise it by training ${row.prqAxis}`;
}
