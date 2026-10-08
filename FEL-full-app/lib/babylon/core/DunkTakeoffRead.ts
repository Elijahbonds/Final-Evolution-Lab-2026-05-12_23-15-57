// DunkTakeoffRead — THE LIVE TAKE-OFF READ (dunk-next phase 7, 2026-10-06).
//
// Owner, 2026-10-06: "a live take-off read — while running up, show where you'll leave the floor and on which foot (a marker on the
// floor + a small HUD read: ONE-FOOT / TWO-FOOT, FROM THE STRIPE / INSIDE / BASELINE), using the existing DunkApproach maths so the
// read matches what the judges will see."
//
// The judges already read three things off the take-off (core/DunkApproach): the FOOT (one off a real run, two off a gather or a
// walk), the RANGE (how far out the feet left the floor — the stripe is the iconic one) and the SIDE (head-on, the wing, the
// baseline). The player saw them only AFTER the jump, as the launch banner. On the run they were a guess.
//
// THE READ IS THE TAKE-OFF YOU WOULD GET IF YOU WENT UP NOW. On the run the jump is yours at any instant (A on the run, or letting go
// of RUN), and it leaves from where the feet are; held to the line, the line is "now" when you get there. So the read is computed
// from the runner's own spot every frame with the SAME function the take-off uses (DunkMode.launchDunk calls takeoffRead too):
// what the chip says is, by construction, what the card gets. It changes as you cross the stripe, the elbow and the paint, and as
// the run crosses the one-foot speed or GATHER is held.
//
// Pure: no Babylon. The mode passes positions and the run's numbers.

import { approachAngle, approachBonus, rangeLabel, takeoffFor, type ApproachRead, type Takeoff } from './DunkApproach';

export interface TakeoffInputs {
  /** the runner's feet (world x, z) */
  x: number;
  z: number;
  rimX: number;
  rimZ: number;
  /** the J's own lateral offset at this spot (DunkMode.curveOffset): the mode's bend, not the player's angle — 0 on a straight run */
  jOffsetX: number;
  /** the run-up's peak speed so far (m/s) and GATHER held: the foot (DunkApproach.takeoffFor) */
  runUpPeak: number;
  gatherHeld: boolean;
  /** the prop forces a two-foot take-off (the Dubble Up) */
  forceTwo?: boolean;
}

/** The floor's zones, in the judges' words (DunkApproach.rangeLabel): the stripe, the elbow, the paint, under the rim. */
export type TakeoffZone = 'stripe' | 'elbow' | 'paint' | 'rim';
const ZONE_OF: Readonly<Record<string, TakeoffZone>> = {
  'FROM THE STRIPE': 'stripe', 'FROM THE ELBOW': 'elbow', 'IN THE PAINT': 'paint', 'UNDER THE RIM': 'rim',
};

export interface TakeoffRead {
  /** exactly what the judges get for a take-off here (DunkApproach.approachBonus) */
  read: ApproachRead;
  foot: Takeoff;
  /** metres, rim centre to the feet (XZ) */
  rangeM: number;
  zone: TakeoffZone;
  /** the chip: the foot, then where (the range, then the side when it is not head-on) — every word is the judges' own */
  chip: string;
}

const FOOT_WORD: Readonly<Record<Takeoff, string>> = { one: 'ONE-FOOT', two: 'TWO-FOOT' };

/** The take-off the runner would get going up from here, now. */
export function takeoffRead(i: TakeoffInputs): TakeoffRead {
  const rangeM = Math.hypot(i.x - i.rimX, i.z - i.rimZ);
  const foot: Takeoff = i.forceTwo ? 'two' : takeoffFor(i.runUpPeak, i.gatherHeld);
  const read = approachBonus(approachAngle(i.x - (Number.isFinite(i.jOffsetX) ? i.jOffsetX : 0), i.z, i.rimX, i.rimZ), foot, rangeM);
  const where = Number.isFinite(rangeM) ? rangeLabel(rangeM) : 'UNDER THE RIM';
  const side = read.label.split(' · ')[0];
  const chip = [FOOT_WORD[foot], where, side !== 'HEAD-ON' ? side : ''].filter(Boolean).join(' · ');
  return { read, foot, rangeM, zone: ZONE_OF[where] ?? 'rim', chip };
}

/** The marker's colour per zone (the HUD chip uses the same): the stripe gold, the elbow cyan, the paint white, under the rim grey. */
export const ZONE_HEX: Readonly<Record<TakeoffZone, string>> = { stripe: '#ffd75e', elbow: '#5ee7ff', paint: '#ffffff', rim: '#9aa3ad' };
/** TUNED (presentation, dunk-next phase 7): the take-off mark on the floor — a bar across the run, like a long-jump board (the player
 *  ring is already a ring at the feet): width × depth in metres, how far above the floor it sits (clear of z-fighting) and its alpha. */
export const MARK_W = 0.9, MARK_D = 0.14, MARK_Y = 0.012, MARK_ALPHA = 0.85;

/** The HUD wire: `zone|chip` ('' clears it). One string, sent on change only. */
export function encodeTakeoff(r: Pick<TakeoffRead, 'zone' | 'chip'> | null): string {
  return r ? `${r.zone}|${r.chip.replace(/\|/g, '')}` : '';
}
export function decodeTakeoff(v: unknown): { zone: TakeoffZone; chip: string } | null {
  if (typeof v !== 'string' || !v.includes('|')) return null;
  const [z, chip] = v.split('|');
  const zone: TakeoffZone = z === 'stripe' || z === 'elbow' || z === 'paint' ? z : 'rim';
  return chip ? { zone, chip } : null;
}
