// SMR — pin-and-stretch, ordered through the centre of mass (2026-09-12).
//
// Release, re-pattern, retest. This is the first step: self-myofascial release with PIN AND
// STRETCH — pin the tissue, then take the joint through range so the tissue glides under the pin,
// rather than rolling back and forth and calling it done. Rolling desensitises; pin-and-stretch
// changes what the tissue will allow.
//
// ORDERED THROUGH THE CENTRE OF MASS, deliberately. Load transfers through the middle, so a
// restricted diaphragm or hip flexor changes what the shoulder and ankle have to do. Releasing the
// far end first means releasing something that was only compensating, and the restriction returns
// by the next set. Work centre-out: breathing apparatus and pelvis, then the chain either side.
//
// The point is the retest. Every protocol here ends by sending the athlete back to the Mirror,
// because the score is the only honest answer to whether the release did anything.
//
// SCOPE. Same discipline as the rest of neuro-mirror: ESTIMATED movement-quality signals, never a
// diagnosis, never measured tissue state. General self-care coaching, with nerve and bone avoidance
// carried on every entry rather than in a footer.

import type { ZoneId } from '../patterns/split-stance-press-row';
import type { MirrorSessionLike } from './rnt-breath';

/** Distance from the centre of mass. Lower releases first. */
export const COM_ORDER: Record<ZoneId, number> = {
  rib_thoracic: 0,     // the diaphragm sits on the centre of mass; it goes first or nothing holds
  lumbo_pelvic: 1,     // pelvis — the other half of the canister
  posterior_chain: 2,  // hips and hamstrings, driving the middle
  lat_rhomboid: 3,     // the lat crosses from pelvis to arm; released after the middle it serves
  upper_traps: 4,      // furthest from the centre, and usually the loudest compensator
};

export interface PinAndStretch {
  zone: ZoneId;
  /** Release order: 0 is closest to the centre of mass. */
  comOrder: number;
  tissue: string;
  tool: string;
  /** Where to pin, in plain language an athlete can find on themselves. */
  pin: string;
  /** The movement taken under the pin — this is the half people skip. */
  stretch: string;
  /** Seconds under the pin per side. */
  holdSec: number;
  /** Slow passes through range, per side. */
  reps: number;
  breath: string;
  avoid: string;
  /** Why this one, for this athlete, right now. */
  because: string;
}

const AVOID_DEFAULT = 'Stay off bone, joints and anywhere that tingles or refers down a limb — that is nerve, not fascia. Uncomfortable is fine; sharp, numb or radiating is a stop.';

const PROTOCOLS: Record<ZoneId, Omit<PinAndStretch, 'zone' | 'comOrder' | 'because'>> = {
  rib_thoracic: {
    tissue: 'Diaphragm attachment and the lower intercostals',
    tool: 'Soft ball, or fingertips under the rib margin',
    pin: 'Lying face up, knees bent: hook fingertips just under the lower ribs on one side, gently and only as deep as the tissue allows',
    stretch: 'Take a slow 360° inhale INTO the pin, then a long exhale letting the ribs slide down past it. The breath is the stretch.',
    holdSec: 30, reps: 5,
    breath: 'Inhale 4s wide into the pin, exhale 6s to empty',
    avoid: AVOID_DEFAULT,
  },
  lumbo_pelvic: {
    tissue: 'Hip flexor / psoas region and the anterior pelvis',
    tool: 'Ball or roller edge',
    pin: 'Face down, ball just inside the front of the hip bone, weight eased on gradually',
    stretch: 'With the ball pinned, slowly bend and straighten the knee on that side, then rotate the leg in and out. The tissue glides under the pin.',
    holdSec: 30, reps: 6,
    breath: 'Exhale on each knee bend; never hold your breath under the pin',
    avoid: AVOID_DEFAULT,
  },
  posterior_chain: {
    tissue: 'Glute and proximal hamstring',
    tool: 'Ball, seated',
    pin: 'Seated on the ball at the meat of the glute — not the sit bone itself',
    stretch: 'Pinned, slowly straighten and bend the knee to floss the hamstring, then cross the ankle over the opposite knee and lean in',
    holdSec: 45, reps: 6,
    breath: 'Long exhale as you lean into the pin',
    avoid: AVOID_DEFAULT,
  },
  lat_rhomboid: {
    tissue: 'Lat, from the armpit down the side of the ribcage',
    tool: 'Roller or ball, side-lying',
    pin: 'Side-lying, arm overhead, roller in the armpit region below the shoulder joint',
    stretch: 'Pinned, slowly rotate the palm up and down, then reach the arm further overhead. Add a full exhale at end range.',
    holdSec: 30, reps: 6,
    breath: 'Inhale into the ribs under the pin, exhale to reach further',
    avoid: AVOID_DEFAULT + ' The armpit itself holds nerves and lymph — stay on the muscle below it.',
  },
  upper_traps: {
    tissue: 'Upper trap and levator, where the neck meets the shoulder',
    tool: 'Ball against a wall',
    pin: 'Ball between the wall and the muscle between neck and shoulder tip — muscle only',
    stretch: 'Pinned, slowly tip the ear toward the opposite shoulder, then turn the chin down toward the armpit',
    holdSec: 30, reps: 5,
    breath: 'Exhale through each tip and turn; let the shoulder drop on the exhale',
    avoid: AVOID_DEFAULT + ' Never pin the front or side of the neck.',
  },
};

/**
 * The release sequence this session earns, ordered centre-out.
 *
 * Takes the same drift signals RNT reads, so an athlete gets ONE coherent plan — release the
 * restriction, then re-pattern it — rather than two tools disagreeing about what is wrong.
 */
export function prescribePinAndStretch(s: MirrorSessionLike, max = 3): PinAndStretch[] {
  const minutes = Math.max(s.durationMs, 1) / 60_000;
  const zones = Object.keys(PROTOCOLS) as ZoneId[];

  const scored = zones.map((zone) => {
    const faultsPerMin = Math.max(0, s.faultCounts[zone] ?? 0) / minutes;
    const stableShare = Math.min(1, Math.max(0, (s.timeInStableMs[zone] ?? 0) / Math.max(s.durationMs, 1)));
    return { zone, faultsPerMin, stableShare, need: faultsPerMin * (1 - stableShare) };
  }).filter((z) => z.need > 0.3);

  // pick by need, then RE-SORT centre-out so the sequence is performed in the order that holds
  return scored
    .sort((a, b) => b.need - a.need)
    .slice(0, max)
    .sort((a, b) => COM_ORDER[a.zone] - COM_ORDER[b.zone])
    .map(({ zone, faultsPerMin, stableShare }) => ({
      zone,
      comOrder: COM_ORDER[zone],
      ...PROTOCOLS[zone],
      because: `Held ${Math.round(stableShare * 100)}% of the set and drifted ${faultsPerMin.toFixed(1)}×/min — release here before re-patterning it.`,
    }));
}

/** The closing instruction. The retest is the product: without it this is just stretching. */
export function retestPrompt(order: PinAndStretch[]): string {
  if (!order.length) return 'Nothing to release from that set — go straight back in.';
  const zones = order.length === 1 ? 'that area' : `those ${order.length} areas`;
  return `Release ${zones} centre-out, run the correctives, then repeat the same pattern in the Mirror. If the score does not move, the restriction was not the limiter — change one thing, not three.`;
}
