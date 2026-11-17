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

/** The step-back reads the defender (1) / today's step-back (0). Knob `hoops.escapeReadOn`. ON (measured, FLAGGED). 1v1 only: in 3v3 a
 *  late man (stunSec) is frozen on the spot — the backpedal he was in stops dead, so the read cost space there (measured +0.58-0.62 m
 *  against +0.17-1.01 m without it) — and the 3v3 hop-back is left as it was until its "late" lets the backpedal run on. */
export const ESCAPE_READ_ON = 1;
/** A crossing escape in a trap reads both men (1) / as today (0). Knob `hoops.trapReadOn`. OFF: not measured well — the split never
 *  bought space on the rig (the bodies' 1.10 m stand-off: the handler cannot pass between two men closer than 2.2 m, so he carried them
 *  with him at 1.10 m), and with the gap counted for that body the closed-side strip had not been exercised yet. */
export const TRAP_READ_ON = 0;
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

export const escapeReadOn = (): boolean => feel('hoops.escapeReadOn', ESCAPE_READ_ON) >= 0.5;
export const escapeLateSec = (): number => feel('hoops.escapeLateSec', ESCAPE_LATE_SEC);
export const trapReadOn = (): boolean => feel('hoops.trapReadOn', TRAP_READ_ON) >= 0.5;

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
  k: { gapMinM?: number; reachM?: number } = {}): TrapVerdict {
  const gapMin = k.gapMinM ?? feel('hoops.trapGapMinM', TRAP_GAP_MIN_M), reach = k.reachM ?? feel('hoops.escapeStripReachM', ESCAPE_STRIP_REACH_M);
  const rx = Math.cos(yaw), rz = -Math.sin(yaw), s = side === 'right' ? 1 : -1;   // anim/athleteSide.athleteRight
  const lat = (p: XZ): number => (p.x - handler.x) * rx + (p.z - handler.z) * rz;
  const dist = (p: XZ): number => Math.hypot(p.x - handler.x, p.z - handler.z);
  if (men.length >= 2) {
    const [a, b] = men;
    const gap = Math.hypot(a.at.x - b.at.x, a.at.z - b.at.z) - PASS_APART_M;
    if (gap >= gapMin) return { kind: 'split' };
  }
  let by = -1, best = Infinity;
  men.forEach((m, i) => { const d = dist(m.at); if (lat(m.at) * s >= SIDE_MIN_M && d <= reach && d < best) { best = d; by = i; } });
  if (by >= 0) return { kind: 'strip', by };
  const beat: number[] = [];
  men.forEach((m, i) => { if (readTheMan({ ...m.read, moveSide: side }).beat) beat.push(i); });
  return { kind: 'open', beat };
}
