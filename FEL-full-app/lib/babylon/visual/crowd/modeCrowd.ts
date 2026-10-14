// modeCrowd — a mode's one-line opt-in to the stands (w3-crowds, A9.9).
//
//   crowd = mountModeCrowd(ctx, 'football');      // in load(), after the venue is built
//   crowd?.dispose();                             // in dispose()
//
// The crowd then LISTENS rather than being told: every play a mode already reports to the shared Game-Breaker meter
// (`ctx.momentum.report`) reaches it through `MomentumBus.onReport` — a make or a clean hit is a cheer sized by its weight,
// a miss or a blunder a groan — and the meter's rise to ON FIRE stands the seated crowd up for a few seconds. When the match
// ends (`ctx.phase()` reaches 'ended') the whole crowd rises and applauds, and stays up until the mode is torn down.
// A mode whose plays never reach the meter (it would change the meter's stings and the commentary to start reporting now)
// calls `crowd.react('cheer' | 'groan', strength)` at the moment itself; a mode with a real win calls `react('finish', 1)`
// first and the crowd jumps instead of applauding.
//
// Reduced motion is read at every reaction (motionPolicy): small reactions only (crowdReact).
// Presentation only: nothing here reads or writes a score, a timer or a tuned number; it only hears the meter.

import type { ModeContext } from '../../core/ModeHarness';
import type { MomentumEvent, MomentumTier } from '../../core/MomentumBus';
import { motionPolicy } from '../../../a11y/reducedMotion';
import { mountCrowd, type CrowdHandle, type CrowdOptions } from './crowdStands';
import { crowdVenue, type CrowdVenueKey } from './crowdVenues';
import type { CrowdVenue } from './crowdLayout';
import type { ReactionKind } from './crowdReact';

/** The meter's default weight per kind (MomentumBus.WEIGHT, which is private): only the SIGN and the SIZE matter here. */
export const EVENT_WEIGHT: Record<MomentumEvent['kind'], number> = {
  posterize: 22, ankle_break: 12, block: 15, steal: 10, highlight_dunk: 16,
  big_make: 8, contest_50: 25, contest_low: -10, miss: -6, turnover: -14,
  clean_hit: 9, chain: 7, near_miss: 6, overtake: 15, clean_run: 18, blunder: -12,
};

/** What the stands do for one reported play: null = nothing (a play too small to move a crowd). Pure. */
export function reactionFor(e: MomentumEvent): { kind: ReactionKind; strength: number } | null {
  const w = e.weight ?? EVENT_WEIGHT[e.kind];
  if (!Number.isFinite(w)) return null;
  if (w >= 6) return { kind: 'cheer', strength: Math.min(1, w / 20) };
  if (w <= -6) return { kind: 'groan', strength: Math.min(1, -w / 14) };
  return null;
}

/** A tier change the stands answer: the rise to ON FIRE stands them up. Pure. */
export function reactionForTier(next: MomentumTier, prev: MomentumTier): { kind: ReactionKind; strength: number } | null {
  return next === 'on_fire' && prev !== 'on_fire' ? { kind: 'stand', strength: 0.8 } : null;
}

export interface ModeCrowd extends CrowdHandle {}

export function mountModeCrowd(ctx: Pick<ModeContext, 'scene' | 'momentum' | 'phase'>, key: CrowdVenueKey | 'velocitykart', opts: CrowdOptions & { variant?: string; venue?: CrowdVenue } = {}): ModeCrowd | null {
  // a venue laid out at runtime (the kart's circuit) is handed in; the others are crowdVenues' tables
  const venue = opts.venue ?? (key === 'velocitykart' ? null : crowdVenue(key, opts.variant));
  if (!venue || venue.stands.length === 0) return null;
  const crowd = mountCrowd(ctx.scene, venue, { reduced: () => motionPolicy().reduced, ...opts });
  const offReport = ctx.momentum.onReport((e) => { const r = reactionFor(e); if (r) crowd.react(r.kind, r.strength); });
  const offTier = ctx.momentum.onTierChange((next, prev) => { const r = reactionForTier(next, prev); if (r) crowd.react(r.kind, r.strength); });
  const watch = ctx.scene.onBeforeRenderObservable.add(() => {
    if (ctx.phase() !== 'ended') return;
    crowd.react('finish', 0.5);   // applause; a mode that called react('finish', 1) on its win already has them jumping
    ctx.scene.onBeforeRenderObservable.remove(watch);
  });
  if (process.env.NODE_ENV === 'development') (ctx.scene.metadata ??= {}).felCrowd = crowd;   // the capture rig stages reactions through it
  const dispose = crowd.dispose.bind(crowd);
  return Object.assign(crowd, {
    dispose(): void {
      offReport(); offTier();
      ctx.scene.onBeforeRenderObservable.remove(watch);
      dispose();
    },
  });
}
