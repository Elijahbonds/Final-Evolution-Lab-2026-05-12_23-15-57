// MOMENTUM WAS A NUMBER NOBODY COULD HEAR (2026-09-14).
//
// `MomentumBus` opens with a promise in its own header: highlight plays become a SYSTEM that "notifies
// subscribers (HUD flames, crowd escalation, commentary stingers) on tier CHANGES — the visible momentum
// shift the directive asks for".
//
// AUDIT of what was actually subscribed, across the whole game:
//
//   · `onTierChange` — ONE caller. OneVOneMode, line 566.
//   · `multiplier()` — ONE caller. OneVOneMode, line 1876.
//   · eight modes `report()` events into a bus; most then push `momentum:` into setHud and stop there.
//   · and `momentum` only draws if that mode's host component happens to render it. There are twenty-one
//     separate Babylon host components. Most do not.
//
// So in seven of the eight modes that feed it, going ON FIRE changed a number that nothing displayed. The
// bus worked perfectly and was inaudible.
//
// THE RESPONSE BELONGS IN THE WORLD, NOT THE HUD. A crowd that gets louder as you heat up, and a sting on
// the frame you cross a tier, need no host changes at all and are felt in every mode including the
// nineteen whose HUD never had a momentum meter.
//
// THE NUMBERS ARE OneVOne's, NOT NEW ONES. OneVOneMode already did `setAmbientLevel(0.3 + score01 * 0.7)`
// and it is the mode people have actually played. Extracting the working mode's curve rather than
// inventing a second one is the same discipline the handle/stance/ref extractions used: the shared module
// has to be provably the thing that already felt right before anything else adopts it.
//
// FALLS ARE SILENT, AND THAT IS DELIBERATE. Momentum decays on a timer (DECAY_PER_SEC), so a player parked
// just above a tier line crosses it downward on their own every few seconds. Sounding those would produce
// a groan every four seconds for doing nothing, and the groans would land on the exact moments the player
// is trying to concentrate. Only RISES sting. Cooling is felt through the crowd bed going quiet, which is
// continuous and cannot oscillate.
//
// Pure: no Babylon, no audio, no bus. It decides WHAT SHOULD HAPPEN; ModeHarness plays it.

import type { MomentumTier } from './MomentumBus';

/** The crowd bed at cold. Not zero: an empty-sounding venue reads as a bug, not as calm. */
export const CROWD_FLOOR = 0.30;
/** The bed at ON FIRE. */
export const CROWD_CEIL = 1.0;

/** Loudness of the ambient crowd for a momentum level. OneVOne's own curve, extracted. */
export function crowdLevel(score01: number): number {
  const k = Math.max(0, Math.min(1, score01));
  return CROWD_FLOOR + (CROWD_CEIL - CROWD_FLOOR) * k;
}

export interface TierSting {
  /** A SoundKit sfx name. */
  sfx: 'crowdCheer' | 'powerUp';
  volume: number;
  /** Whether the light rig should pulse its exposure — reserved for the top of the ladder. */
  flash: boolean;
}

const RANK: Record<MomentumTier, number> = { cold: 0, warming: 1, hot: 2, on_fire: 3 };

/**
 * What crossing from `prev` to `next` should sound like.
 *
 * `null` means say nothing — which covers every downward crossing and any no-op. See the header: decay
 * makes downward crossings routine and unearned, so they must not be events.
 */
export function tierSting(next: MomentumTier, prev: MomentumTier): TierSting | null {
  if (RANK[next] <= RANK[prev]) return null;
  // Warming is the first rung and happens often; it gets an acknowledgement, not a fanfare. The flash is
  // reserved for the top so that it still means something when it fires.
  if (next === 'warming') return { sfx: 'crowdCheer', volume: 0.35, flash: false };
  if (next === 'hot') return { sfx: 'crowdCheer', volume: 0.6, flash: true };
  return { sfx: 'powerUp', volume: 0.75, flash: true };
}

/**
 * Strength to hand `ctx.feel.impact` for a tier rise, or 0 for none.
 *
 * Going ON FIRE is a hit the player landed on the game; it earns the same shake and frame the mode's own
 * big moments get. Deliberately below a real collision so a tier change never out-punches a posterize.
 */
export function tierImpact(next: MomentumTier, prev: MomentumTier): number {
  if (RANK[next] <= RANK[prev]) return 0;
  return next === 'on_fire' ? 0.45 : next === 'hot' ? 0.25 : 0;
}
