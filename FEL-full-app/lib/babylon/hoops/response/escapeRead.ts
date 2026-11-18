// hoops-gather G3 (owner 2026-11-12: "We need good escape moves"; docs/HOOPS-GATHER-ESCAPE-PLAN.md §5 G3): AN ESCAPE READS THE DEFENDERS.
//
// Measured at phase A (the gather probe): no escape bought anything against a set man — the 1v1 defender mirrors every step-back to the
// centimetre at his 1.10 m stand-off — and in a 3v3 double team no escape moved the handler off either man (−0.09 to +0.07 m). The
// step-back read nobody at all (`present: false`), and a crossing move in a trap read only the nearest man, as if the second were not there.
//
//   THE STEP-BACK / HOP-BACK — beats a man who BIT on the drive: on his heels, giving ground toward the rim faster than moveLeanMps
//     (the backpedal that cuts the drive off), or off balance (in his jump, in his reach). He is late by escapeLateSec: he brakes where the
//     drive had him going (away from the hop) and stands, then recovers at his own speed — the hop's travel plus his slide is the space.
//     A set man is not beaten (he mirrors, as today, and the ball is safe), and nor is a man coming AT you: a hop back from a hard
//     closeout only hands him the ground (measured: a man closing at 4.3 m/s braked 1.4 m onto the hop and stood at 1.10 m 0.8 s later,
//     late or not) — that one is beaten going by him, the moves' own read.
//   THE TRAP (3v3, a double team on the ball) — a crossing escape goes one of three ways, by the two men's geometry, never a roll:
//     SPLIT: the two bodies are far enough apart for the handler's body to pass (2.2 m: the stand-off each side, + trapGapMinM): the cross
//       attacks the gap and both men are late.
//     STRIPPED: the gap is shut and a trapper stands on the side the ball goes, inside his reach (escapeStripReachM) — the owner's rule
//       (2026-11-12, OWNER-DECISIONS): an escape thrown into the closed side of a trap is a steal.
//     OPEN: nobody on that side: the near man is read like any man (late if he bit).
//
// Every number is a knob; hoops.escapeReadOn 0 and hoops.trapReadOn 0 are today exactly (the modes skip all of it). Pure: no Babylon.
import { feel } from '../../../feel-panel/feel';
import { readTheMan, moveLeanMps, type ManRead, type ReadVerdict } from '../rulebook';
import type { DefReaction } from '../../core/DefenderReact';

/** The step-back reads the defender (1) / today's step-back (0). Knob `hoops.escapeReadOn`. ON (measured, FLAGGED). 1v1 only: in 3v3 a
 *  late man (stunSec) is frozen on the spot — the backpedal he was in stops dead, so the read cost space there (measured +0.58-0.62 m
 *  against +0.17-1.01 m without it) — and the 3v3 hop-back is left as it was until its "late" lets the backpedal run on. */
export const ESCAPE_READ_ON = 1;
/** A crossing escape in a trap reads both men (1) / as today (0). Knob `hoops.trapReadOn`. ON since the owner's answer (2026-11-17: the
 *  trap works both ways — a split when there is room, a steal on the closed side), with the squeeze below; FLAGGED. */
export const TRAP_READ_ON = 1;
/** THE SQUEEZE (owner 2026-11-17: "let the handler slip between two defenders when they are out of position, ~1.6 m apart"): for the
 *  split's SQUEEZE_SEC the handler's body meets the two trappers at SQUEEZE_STANDOFF_M instead of the game's 1.10 m stand-off — a
 *  shoulder through the gap — so two men 2 × SQUEEZE_STANDOFF_M apart can be split (1) / the 1.10 m stand-off holds, 2.2 m (0).
 *  Knob `hoops.trapSqueezeOn`. */
export const TRAP_SQUEEZE_ON = 1;
/** The handler-to-trapper stand-off through a squeeze (m, centre to centre; the owner's ~1.6 m apart / 2). Knob `hoops.trapSqueezeM`. */
export const SQUEEZE_STANDOFF_M = 0.8;
/** How long the squeeze lasts from the cross (s): long enough to get the hips through at a drive. Knob `hoops.trapSqueezeSec`. */
export const SQUEEZE_SEC = 0.6;
/** How late a beaten man is (s): he brakes where the escape left him and stands for this long — the same as a man a move SHOOK
 *  (BasketballCore ANKLE_BREAK_STUN_SEC 0.7). Measured (1v1, a step-back off a drive he was backpedalling from, the stick let go): 0.45
 *  bought nothing over no read (0.66-0.77 m vs 0.60-0.81), 0.7 bought 1.72-1.80 m in 0.8 s (2.82-2.90 m from him vs 1.77-1.91 with no
 *  read). Knob `hoops.escapeLateSec`. */
export const ESCAPE_LATE_SEC = 0.7;
/** The room a split needs between two trappers (m), beyond PASS_APART_M — at 0 the handler's body just fits between them. Knob
 *  `hoops.trapGapMinM`. */
export const TRAP_GAP_MIN_M = 0;
/** A trapper this close (planar m) on the side the ball goes strips it. Knob `hoops.escapeStripReachM`. */
export const ESCAPE_STRIP_REACH_M = 1.5;
/** Two men must be this far apart (centre to centre, m) for a body to pass between them: one stand-off each side (BasketballCore
 *  BODY_STANDOFF 1.10 × 2; geometry, not a feel number). */
export const PASS_APART_M = 2.2;
/** A man is ON a side when he is this far across the handler's centre line (m; geometry). */
export const SIDE_MIN_M = 0.15;

/** hoops-items (2026-11-18): THE 3V3 HOP-BACK READS HIM TOO (1) / the 3v3 step-back reads nobody, as before (0). The same read as
 *  1v1 (stepBackRead: off balance, or on his heels), the same escapeLateSec — but the man is NOT frozen: a 3v3 stun stops a body dead
 *  (its velocity zeroed, the reason the earlier try cost space), so the beaten man gets a LATE REACTION instead (lateRunOn): no wish for
 *  escapeLateSec, his own mover braking from the backpedal he was in at its own brake cap, so the backpedal runs on and THEN he stands
 *  and recovers — what the 1v1 man does. Knob `hoops.escapeRead3v3On`. */
export const ESCAPE_READ_3V3_ON = 1;
export const escapeRead3v3On = (): boolean => feel('hoops.escapeRead3v3On', ESCAPE_READ_3V3_ON) >= 0.5;
export const escapeReadOn = (): boolean => feel('hoops.escapeReadOn', ESCAPE_READ_ON) >= 0.5;
export const escapeLateSec = (): number => feel('hoops.escapeLateSec', ESCAPE_LATE_SEC);
export const trapReadOn = (): boolean => feel('hoops.trapReadOn', TRAP_READ_ON) >= 0.5;
export const trapSqueezeOn = (): boolean => feel('hoops.trapSqueezeOn', TRAP_SQUEEZE_ON) >= 0.5;
export const squeezeStandoffM = (): number => feel('hoops.trapSqueezeM', SQUEEZE_STANDOFF_M);
export const squeezeSec = (): number => feel('hoops.trapSqueezeSec', SQUEEZE_SEC);
/** How far apart two trappers must be (centre to centre, m) for a body to pass between: one stand-off each side — the squeeze's when it
 *  is on, else the game's (PASS_APART_M). */
export const passApartM = (): number => (trapSqueezeOn() ? 2 * squeezeStandoffM() : PASS_APART_M);

/** The step-back / hop-back against one man: off balance, or giving ground (moving away from the handler faster than the lean line). */
export function stepBackRead(man: ManRead): ReadVerdict {
  if (man.offBalance) return { beat: true, why: 'offBalance' };
  if (-man.closingMps >= moveLeanMps() * (man.leanScale ?? 1)) return { beat: true, why: 'wrongWay' };
  return { beat: false, why: 'set' };
}

export interface XZ { x: number; z: number }
export interface TrapMan { at: XZ; read: ManRead }
export type TrapVerdict = { kind: 'split' } | { kind: 'strip'; by: number } | { kind: 'open'; beat: number[] };

/** A crossing escape inside a double team, going to `side` (the side the ball ends on, the athlete's), from `handler` facing `yaw`. */
export function trapEscape(handler: XZ, yaw: number, side: 'left' | 'right', men: readonly TrapMan[],
  k: { gapMinM?: number; reachM?: number; passApartM?: number } = {}): TrapVerdict {
  const gapMin = k.gapMinM ?? feel('hoops.trapGapMinM', TRAP_GAP_MIN_M), reach = k.reachM ?? feel('hoops.escapeStripReachM', ESCAPE_STRIP_REACH_M);
  const apartMin = k.passApartM ?? passApartM();
  const rx = Math.cos(yaw), rz = -Math.sin(yaw), s = side === 'right' ? 1 : -1;   // anim/athleteSide.athleteRight
  const lat = (p: XZ): number => (p.x - handler.x) * rx + (p.z - handler.z) * rz;
  const dist = (p: XZ): number => Math.hypot(p.x - handler.x, p.z - handler.z);
  if (men.length >= 2) {
    const [a, b] = men;
    const gap = Math.hypot(a.at.x - b.at.x, a.at.z - b.at.z) - apartMin;
    if (gap >= gapMin) return { kind: 'split' };
  }
  let by = -1, best = Infinity;
  men.forEach((m, i) => { const d = dist(m.at); if (lat(m.at) * s >= SIDE_MIN_M && d <= reach && d < best) { best = d; by = i; } });
  if (by >= 0) return { kind: 'strip', by };
  const beat: number[] = [];
  men.forEach((m, i) => { if (readTheMan({ ...m.read, moveSide: side }).beat) beat.push(i); });
  return { kind: 'open', beat };
}

/** hoops-items: THE LATE THAT LETS HIS BACKPEDAL RUN ON (3v3). A reaction that owns the beaten man's feet for `lateSec` and wishes for
 *  nothing: the defenders' loop then steps his mover toward a standstill from the velocity he really had, at the mover's own brake cap —
 *  he carries the backpedal, stops where it takes him and stands — instead of the stun's freeze (velocity zeroed in the frame). Shaped
 *  like the stand-up (DefenderReact: no distance, no direction), only longer. Pure. */
export function lateRunOn(lateSec: number): DefReaction {
  return { kind: 'standup', dir: { x: 0, z: 0 }, left: Math.max(0, lateSec), togo: 0, tune: { sec: Math.max(0, lateSec), dist: 0, maxMps: 0 } };
}
