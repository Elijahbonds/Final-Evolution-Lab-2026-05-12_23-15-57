// PossessionSwap — THEIR POSSESSION PLAYS BOTH ENDS (lane/h3-aware, owner decision 2026-10-24: port PR #313's H3c to current release).
//
// The 3v3 builds every AI body's brain once, for MY possession: my teammates a TeammateBrain (space, screen, cut), their three a
// DefenderBrain (each marking one of mine). On THEIR ball every body kept that brain, so my teammates ran their offence on defence —
// spacing, screening and cutting at the rim they were meant to protect — and their men off the ball kept "defending" my players,
// parked in the paint under their own driver (#313's measure: their off-ball men 0.9–1.3 m from the rim on every still frame).
//
// In their possession, with the swap on: each of my teammates guards one of their two men off the ball (a DefenderBrain of his own:
// deny, and the low man's help when the ball drives; the driver is mine to guard), and their men off the ball space the floor (a
// TeammateBrain each, at the wings and the top). A box-out or a loose ball stays with the body's own brain — the mode drives those.
//
// Also here: HAS_BALL_M, the DefenderBrain's "my man has the ball" radius (release 1.8 m → 1.0 m). At 1.8 m a screener beside the
// handler read as the handler, and his defender left him to close out on the ball too (two or more defenders on the ball in 11 % of
// the frames someone had it, #313). The brains themselves live with the 3v3's adapter (modes/threevthreeAware.ts); this file is
// pure (BasketballCore reads HAS_BALL_M from here, so nothing here imports it). Every number is a feel knob (group "Hoops · 3v3 awareness").
import type { Vector3 } from '@babylonjs/core';
import { feel } from '../../feel-panel/feel';

/** The swap on (1) / off (0). Off: every body keeps its own brain on their ball, exactly as release. TUNED (new). */
export const POSSESSION_SWAP_ON = 1;
/** Their spacers' lanes, as a share of π either side of the top (the wings at ±0.3π, the top at 0). TUNED (new; #313 FOE_SPACE_ANGLES). */
export const FOE_SPACE_ANGLE_K = 0.3;
/** A defender's man HAS the ball inside this (m, his root to the ball, flat). TUNED: 1.8 → 1.0 (#313 HAS_BALL_M). A ball in the hands or
 *  on the dribble is inside ~0.7 m of the root. */
export const HAS_BALL_M = 1.0;

export const possessionSwapOn = (): boolean => feel('hoops.possessionSwapOn', POSSESSION_SWAP_ON) >= 0.5;
/** The live HAS_BALL_M (DefenderBrain reads it every decide). */
export const hasBallM = (): number => feel('hoops.hasBallM', HAS_BALL_M);
/** Their spacer `i`'s lane angle (rad): the wings and the top. */
export function foeSpaceAngle(i: number): number {
  const k = feel('hoops.foeSpaceAngleK', FOE_SPACE_ANGLE_K) * Math.PI;
  return [k, 0, -k][i] ?? 0;
}

const flat = (a: Vector3, b: Vector3): number => Math.hypot(a.x - b.x, a.z - b.z);
/**
 * Who each of my teammates guards on their ball: the driver is mine, so each teammate takes one of the others, the nearer first
 * (in the teammates' order). Returns, per teammate, an index into `foes` — or null when there is nobody left for him.
 */
export function assignMateMarks(mates: readonly Vector3[], foes: readonly Vector3[], driverIndex: number): (number | null)[] {
  const open = foes.map((_, i) => i).filter((i) => i !== driverIndex);
  return mates.map((m) => {
    if (!open.length) return null;
    let best = 0;
    for (let k = 1; k < open.length; k++) if (flat(foes[open[k]], m) < flat(foes[open[best]], m)) best = k;
    return open.splice(best, 1)[0];
  });
}
