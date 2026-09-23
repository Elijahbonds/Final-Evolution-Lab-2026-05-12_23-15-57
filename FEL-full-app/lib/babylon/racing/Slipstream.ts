// Slipstream — sit in a rival's wake and it pays (racing pass, 2026-09-23).
//
// THE GAP: the championship header lists "slipstream" among what the racing library has; neither the kart nor the plane
// had one. Mario Kart's is the model: tuck in behind a rival, in their lane, and wind lines build; hold it for about a
// second and you are SLINGSHOT past with a burst of speed. It is the counter to a leader the rubber band cannot catch
// for you, and it makes the rival AHEAD a resource instead of only an obstacle.
//
// Rules (pure — distances along the course, lanes across it):
//   · a rival is DRAFTABLE when it is 1.5–14 m ahead and within 1.8 m of your lane
//   · the charge fills over 1.1 s behind the same rival, and drains twice as fast when you pull out
//   · full → SLINGSHOT: the charge empties and the caller grants the burst (a zip) — once per tow
//   · speed matters: below 8 m/s there is no wake to sit in
import { alongGap } from './RaceContact';

export const DRAFT = { behindMin: 1.5, behindMax: 14, lateral: 1.8, chargeSec: 1.1, drain: 2, minSpeed: 8, burstSec: 0.8 } as const;

export interface DraftState { charge: number; target: string | null }
export const noDraft = (): DraftState => ({ charge: 0, target: null });

export interface DraftStep { state: DraftState; event: 'slingshot' | null; from: string | null; towing: boolean }

export function stepDraft(
  s: DraftState,
  me: { dist: number; lane: number; speed: number },
  rivals: readonly { name: string; dist: number; lane: number }[],
  lapLength: number,
  dt: number,
): DraftStep {
  let lead: { name: string; gap: number } | null = null;
  if (me.speed >= DRAFT.minSpeed) {
    for (const r of rivals) {
      const gap = alongGap(me.dist, r.dist, lapLength);   // positive = the rival is ahead
      if (gap < DRAFT.behindMin || gap > DRAFT.behindMax || Math.abs(r.lane - me.lane) > DRAFT.lateral) continue;
      if (!lead || gap < lead.gap) lead = { name: r.name, gap };
    }
  }
  const step = Math.max(0, dt) / DRAFT.chargeSec;
  if (!lead) return { state: { charge: Math.max(0, s.charge - step * DRAFT.drain), target: s.charge - step * DRAFT.drain > 0 ? s.target : null }, event: null, from: null, towing: false };
  // a different rival starts the tow again (half kept: you are still in dirty air)
  const base = s.target === lead.name ? s.charge : s.charge * 0.5;
  const charge = base + step;
  if (charge >= 1) return { state: { charge: 0, target: null }, event: 'slingshot', from: lead.name, towing: true };
  return { state: { charge, target: lead.name }, event: null, from: null, towing: true };
}
