// RELEASE — pin, then move, ordered through the centre of mass (2026-09-12).
//
// Release, re-pattern, retest. This is the first step: pin a spot with a ball or a roller, then take the joint slowly
// through range so the spot glides under the pin, rather than rolling back and forth and calling it done.
//
// ORDERED THROUGH THE CENTRE OF MASS, deliberately. Load transfers through the middle, so work centre-out: the areas
// nearest the middle first, then the chain either side. (COM_ORDER keeps a rank for every zone the Mirror names, the
// two middle zones included, though neither has a release any more — see below.)
//
// The point is the retest. Every protocol here ends by sending the athlete back to the Mirror, because the next set is
// the only honest answer to whether the release did anything.
//
// SCOPE. Same discipline as the rest of neuro-mirror: ESTIMATED movement signals, never a diagnosis, never measured
// tissue state. General self-care coaching, with nerve and bone avoidance carried on every entry rather than in a
// footer.
//
// MIRROR-COACH P9 (2026-09-30) — MOUNTED, MINUS TWO PINS, OFF FOR ANYONE NOT A KNOWN ADULT (PLAN item 9, rule (e); owner
// decision #6: "no pin-and-stretch" under 18; decision #20: a blank birth year is youth rules).
//   · THE ABDOMINAL AND PSOAS PINS ARE GONE. The rib_thoracic entry hooked fingertips "under the lower ribs" and the
//     lumbo_pelvic entry pressed a ball "just inside the front of the hip bone" — pressure into the abdomen and the front
//     of the hip, where the big vessels run, with no caution for either (the crossref's safety finding [1].safety[5] and
//     matrix row 13: "needs guardrails before it is ever connected"). The phase rule removes them rather than guarding
//     them; the owner's own Playbook says the same of the hip front ("Don't stretch the psoas — strengthen the
//     stabilizers", playbook.data.json ch4). Nothing replaces them: the two middle zones get no release (RELEASE_ZONES).
//   · ONE RELEASE PER CAMERA SIGNAL, ON TARGET. The press/row reads three signals (rnt-breath.ts ZONE_SIGNAL), and two
//     zones share each of the first two, so a single elbow-path number used to earn a lat release AND a glute release.
//     The session's release now follows the signal: the elbow path → the side of the ribcage under the arm (the row's
//     own reach), the shoulder riding up → where the neck meets the shoulder, the sideways trunk drift → none (its two
//     pins were the ones removed). The back-of-the-hip release stays for the Movement Screen's knee-window flag, which
//     reads it by zone (releaseProtocol; lib/mirror/correctives.ts SCREEN_CORRECTIVE).
//   · THE YOUTH GATE FAILS CLOSED. P5 (2026-09-29) added `isMinor = false` as a DEFAULT — so a caller that forgot the
//     argument handed out pins. That was harmless while nothing called this; it is mounted now, so only an explicit
//     `false` (a birth year on file that reads as an adult: lib/mirror/youth.ts isMinorForMirror, the one age truth)
//     unlocks it. `undefined`, `true` or anything else returns []. A guardian's consent is never an input — the guardian
//     allowance is gone (TEEN-WRITE-BLOCK), so a 17-year-old with a consent on file is still a minor here.
//   · FEL'S WORDS. Where to pin is said by place ("where the neck meets the shoulder"), not by muscle, and the retest
//     line asks whether the FLAGS dropped (the press/row has no score).

import type { ZoneId } from '../patterns/split-stance-press-row';
import { MIRROR_SIGNAL_READ, ZONE_SIGNAL, type MirrorSessionLike, type MirrorSignal } from './rnt-breath';

/** Distance from the centre of mass. Lower releases first. */
export const COM_ORDER: Record<ZoneId, number> = {
  rib_thoracic: 0,     // the breathing middle — no release any more (P9: the abdominal pin was removed)
  lumbo_pelvic: 1,     // the pelvis — no release any more (P9: the pin at the front of the hip was removed)
  posterior_chain: 2,  // the back of the hip, driving the middle
  lat_rhomboid: 3,     // the side of the ribcage under the arm, which crosses from the pelvis to the arm
  upper_traps: 4,      // furthest from the centre
};

export interface PinAndStretch {
  zone: ZoneId;
  /** Release order: 0 is closest to the centre of mass. */
  comOrder: number;
  /** Where on the body, in plain words (a place, never a muscle). The field keeps its 2026-09-12 name. */
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
  /** Why this one, for this athlete, right now — what the camera read, labelled estimated. */
  because: string;
}

export const AVOID_DEFAULT = 'Stay off bone, joints and anywhere that tingles or refers down a limb — that is nerve. Uncomfortable is fine; sharp, numb or radiating is a stop.';

/** The zones that have a release. The two middle zones do not (MIRROR-COACH P9: their pins pressed into the abdomen and
 *  the front of the hip, and were removed). */
export const RELEASE_ZONES = ['posterior_chain', 'lat_rhomboid', 'upper_traps'] as const;
export type ReleaseZone = (typeof RELEASE_ZONES)[number];

/** The zones whose pins were removed, and why — kept as data so the test and the report can name them. */
export const REMOVED_PINS: Readonly<Record<Exclude<ZoneId, ReleaseZone>, string>> = {
  rib_thoracic: 'Fingertips hooked under the lower ribs: pressure into the abdomen.',
  lumbo_pelvic: 'A ball pressed just inside the front of the hip bone: pressure into the front of the hip.',
};

const PROTOCOLS: Record<ReleaseZone, Omit<PinAndStretch, 'zone' | 'comOrder' | 'because'>> = {
  posterior_chain: {
    tissue: 'The back of the hip — the fleshy part you sit on',
    tool: 'Ball, seated on the floor or a bench',
    pin: 'Sit on the ball in the fleshy middle of one side of your seat — not the sit bone itself',
    stretch: 'Pinned, slowly straighten and bend that knee, then cross that ankle over the other knee and lean toward the floor',
    holdSec: 45, reps: 6,
    breath: 'A long breath out as you lean onto the ball',
    avoid: AVOID_DEFAULT,
  },
  lat_rhomboid: {
    tissue: 'The side of the ribcage, just below the armpit',
    tool: 'Roller or ball, lying on your side',
    pin: 'Side-lying, arm reaching overhead along the floor, roller under the side of your ribcage just below the armpit',
    stretch: 'Pinned, slowly turn the palm to the ceiling and back to the floor, then reach further along the floor overhead. Breathe all the way out at the far end.',
    holdSec: 30, reps: 6,
    breath: 'Breathe in, then breathe out to reach further along the floor',
    avoid: AVOID_DEFAULT + ' The armpit itself holds nerves and lymph — stay on the ribcage below it.',
  },
  upper_traps: {
    tissue: 'Where the neck meets the shoulder',
    tool: 'Ball against a wall',
    pin: 'Lean the ball into the wall on the soft top of the shoulder, between the side of the neck and the shoulder tip',
    stretch: 'Pinned, slowly tip your ear toward the far shoulder, then turn your nose down toward the floor',
    holdSec: 30, reps: 5,
    breath: 'Breathe out through each tip and turn, and let the ball sink a little further into the wall',
    avoid: AVOID_DEFAULT + ' Never pin the front or side of the neck.',
  },
};

/** Which release answers each camera signal in a press/row set (null: none — the sideways trunk drift's two pins were
 *  removed). */
export const SIGNAL_RELEASE: Record<MirrorSignal, ReleaseZone | null> = {
  trunkShift: null,
  elbowPath: 'lat_rhomboid',
  shoulderRise: 'upper_traps',
};

/** A zone's release, as written — for a caller that picks by zone (the Movement Screen's flags). Null for a zone with
 *  none. Carries no `because`: the caller says what was read. */
export function releaseProtocol(zone: ZoneId): Omit<PinAndStretch, 'because'> | null {
  if (!(RELEASE_ZONES as readonly string[]).includes(zone)) return null;
  const z = zone as ReleaseZone;
  return { zone: z, comOrder: COM_ORDER[z], ...PROTOCOLS[z] };
}

/**
 * The release sequence this session earns, ordered centre-out — for a KNOWN ADULT only.
 *
 * Takes the same drift signals the band drills read, so an athlete gets ONE coherent plan — release, then the band
 * drill — rather than two tools disagreeing about what is wrong.
 *
 * `isMinor` is lib/mirror/youth.ts isMinorForMirror(User.dobYear): true under 18 AND with no birth year on file. Only an
 * explicit `false` returns anything (MIRROR-COACH P9: fail closed — see the header).
 */
export function prescribePinAndStretch(s: MirrorSessionLike, isMinor: boolean, max = 3): PinAndStretch[] {
  if (isMinor !== false) return [];
  const minutes = Math.max(s.durationMs, 1) / 60_000;
  const zones = Object.keys(ZONE_SIGNAL) as ZoneId[];

  // the need per SIGNAL: the worst of the zones that read it
  const bySignal = new Map<MirrorSignal, { faultsPerMin: number; stableShare: number; need: number }>();
  for (const zone of zones) {
    const faultsPerMin = Math.max(0, finite(s.faultCounts[zone])) / minutes;
    const stableShare = Math.min(1, Math.max(0, finite(s.timeInStableMs[zone]) / Math.max(s.durationMs, 1)));
    const need = faultsPerMin * (1 - stableShare);
    const signal = ZONE_SIGNAL[zone];
    const had = bySignal.get(signal);
    if (!had || need > had.need) bySignal.set(signal, { faultsPerMin, stableShare, need });
  }

  const scored: { signal: MirrorSignal; release: ReleaseZone; faultsPerMin: number; stableShare: number; need: number }[] = [];
  for (const [signal, v] of bySignal) {
    const release = SIGNAL_RELEASE[signal];
    if (release && v.need > 0.3) scored.push({ signal, release, ...v });
  }

  // pick by need, then RE-SORT centre-out so the sequence is performed in the order that holds
  return scored
    .sort((a, b) => b.need - a.need)
    .slice(0, max)
    .sort((a, b) => COM_ORDER[a.release] - COM_ORDER[b.release])
    .map(({ signal, release, faultsPerMin, stableShare }) => ({
      zone: release,
      comOrder: COM_ORDER[release],
      ...PROTOCOLS[release],
      because: `The camera read ${MIRROR_SIGNAL_READ[signal]}: held ${Math.round(stableShare * 100)}% of the set, flagged ${faultsPerMin.toFixed(1)}×/min. Release here, then run the band drill.`,
    }));
}

/** The closing instruction. The retest is the product: without it this is just stretching. */
export function retestPrompt(order: PinAndStretch[]): string {
  if (!order.length) return 'Nothing to release from that set — go straight back in.';
  const zones = order.length === 1 ? 'that spot' : `those ${order.length} spots`;
  return `Release ${zones} in this order, run the band drills, then repeat the same set in the Mirror. If the flags do not drop, the release was not what the set needed — change one thing, not three.`;
}

const finite = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
