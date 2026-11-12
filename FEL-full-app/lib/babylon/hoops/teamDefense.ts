// 3V3 TEAM DEFENCE: THE SWITCH ON A SCREEN AND THE DOUBLE TEAM (lane/hoops-round2, HOP-03; owner 2026-10-20, HOOPS DEFENSE:
// "player switch + double in 3v3").
//
// What the AI defence already had: man-to-man marks (DefenderBrain.markIndex), the low man's help on a drive, and the SCRAM switch
// (core/Matchups: a defender BEATEN 3.2 m by his man swaps with a teammate clearly closer). What it lacked, measured by the backlog's
// grep: any answer to a SCREEN on the ball other than fighting through it (the on-ball man navigates over / under while the handler
// walks off the pick), and any DOUBLE TEAM — a handler holding the ball deep in the paint (a post-up, a stopped drive) was guarded by
// one man however long he stayed there.
//
//   SWITCH — a teammate of the handler plants within SCREEN_BODY_M of the on-ball defender (the pick) and the screener's own defender
//            is within switchHelpM of the handler and closer to him than the screened man: they SWITCH — the screener's man takes the
//            ball, the screened man takes the screener (a swap, so nobody is ever unmarked). One per switchCooldownSec.
//   DOUBLE — the ball has been inside doublePaintM of the rim for doubleAfterSec: the nearest other defender leaves his man and
//            goes to the ball too (his mark becomes the handler: both play him on-ball, DefenderBrain's spacing sets them side by
//            side — the trap). It ends when the ball leaves the handler (the pass out is the read: the doubler's man is open), when
//            the handler leaves the paint, or after doubleMaxSec; then the doubler recovers to his man, and no new double for
//            doubleCooldownSec.
//
// Every number is a feel knob (new; the owner felt none of them yet) with 0/1 A/B switches, so the owner can play the release's
// defence (both off) on the phone. Ranked / staked / head-to-head runs read the defaults (feel()). Pure: no Babylon.
import { feel } from '../../feel-panel/feel';   // feel-panel knobs hoops.double* / hoops.switch* (lib/feel-panel/knobs.ts)

export interface XZ { x: number; z: number }
const dist = (a: XZ, b: XZ): number => Math.hypot(a.x - b.x, a.z - b.z);

/** The double team is on (1) or off (0, the release's defence). */
export const DOUBLE_TEAM_ON = 1;
/** The ball this close to the rim (planar m) … */
export const DOUBLE_PAINT_M = 3.0;
/** … for this long (s) brings the double. */
export const DOUBLE_AFTER_SEC = 0.45;
/** A double lasts at most this long (s). */
export const DOUBLE_MAX_SEC = 2.0;
/** No new double for this long after one ends (s). */
export const DOUBLE_COOLDOWN_SEC = 4.0;
/** The switch on a screen is on (1) or off (0). */
export const SWITCH_ON_SCREEN_ON = 1;
/** The screener's defender takes the ball only from this close to the handler (planar m). */
export const SWITCH_HELP_M = 2.6;
/** One switch per this long (s) — marks never flicker. */
export const SWITCH_COOLDOWN_SEC = 1.5;
/** An attacker this close to the on-ball defender is a body in his way: a pick (planar m; geometry, not a feel number). */
export const SCREEN_BODY_M = 1.0;

export interface TeamDTune { doubleOn: boolean; paintM: number; afterSec: number; maxSec: number; coolSec: number; switchOn: boolean; helpM: number; switchCoolSec: number }
export function teamDTune(): TeamDTune {
  return {
    doubleOn: feel('hoops.doubleTeamOn', DOUBLE_TEAM_ON) >= 0.5,
    paintM: feel('hoops.doublePaintM', DOUBLE_PAINT_M),
    afterSec: feel('hoops.doubleAfterSec', DOUBLE_AFTER_SEC),
    maxSec: feel('hoops.doubleMaxSec', DOUBLE_MAX_SEC),
    coolSec: feel('hoops.doubleCooldownSec', DOUBLE_COOLDOWN_SEC),
    switchOn: feel('hoops.switchOnScreenOn', SWITCH_ON_SCREEN_ON) >= 0.5,
    helpM: feel('hoops.switchHelpM', SWITCH_HELP_M),
    switchCoolSec: feel('hoops.switchCooldownSec', SWITCH_COOLDOWN_SEC),
  };
}

export interface TeamDView {
  /** Defender i's base mark (attacker index) — what scramSwitch keeps. */
  marks: readonly number[];
  defenders: readonly XZ[];
  attackers: readonly XZ[];
  /** The attacker with the ball, or null (their ball, a pass in the air, a loose ball, a shot up). */
  handler: number | null;
  rim: XZ;
}
export type TeamDEvent = { kind: 'switch'; a: number; b: number } | { kind: 'double'; by: number; on: number } | { kind: 'release'; by: number; why: 'pass' | 'out' | 'time' } | null;
export interface TeamDStep {
  /** The base marks after this step (a switch swaps two). The same array when nothing changed. */
  marks: readonly number[];
  /** The mark each brain plays this frame: the base marks, with the doubler's set to the handler. */
  play: readonly number[];
  doubler: number | null;
  event: TeamDEvent;
}

export class TeamDefense {
  doubler: number | null = null;
  private doubledOn: number | null = null;
  private paintSec = 0; private doubleSec = 0; private coolDouble = 0; private coolSwitch = 0;
  private play: number[] = [];
  reset(): void { this.doubler = null; this.doubledOn = null; this.paintSec = 0; this.doubleSec = 0; this.coolDouble = 0; this.coolSwitch = 0; }
  step(dt: number, v: TeamDView, t: TeamDTune = teamDTune()): TeamDStep {
    this.coolDouble = Math.max(0, this.coolDouble - dt); this.coolSwitch = Math.max(0, this.coolSwitch - dt);
    let marks = v.marks; let event: TeamDEvent = null;
    const h = v.handler;
    const hp = h !== null ? v.attackers[h] : null;
    // ── the double: release first, then maybe start one ──
    if (this.doubler !== null) {
      this.doubleSec += dt;
      const why = h === null || h !== this.doubledOn ? 'pass' : !hp || dist(hp, v.rim) > t.paintM + 1.0 ? 'out' : this.doubleSec >= t.maxSec || !t.doubleOn ? 'time' : null;
      if (why) { event = { kind: 'release', by: this.doubler, why }; this.doubler = null; this.doubledOn = null; this.coolDouble = t.coolSec; this.paintSec = 0; }
    }
    this.paintSec = hp && dist(hp, v.rim) < t.paintM ? this.paintSec + dt : 0;
    // ── the switch on a screen (never while a double is on: the trap owns the ball) ──
    if (t.switchOn && this.doubler === null && hp && h !== null && this.coolSwitch === 0) {
      const i = marks.indexOf(h);
      if (i >= 0) {
        const di = v.defenders[i];
        // the pick: a teammate of the handler planted on the on-ball defender
        let screener = -1, best = SCREEN_BODY_M;
        for (let a = 0; a < v.attackers.length; a++) { if (a === h) continue; const g = dist(v.attackers[a], di); if (g < best) { best = g; screener = a; } }
        const j = screener >= 0 ? marks.indexOf(screener) : -1;
        if (j >= 0 && j !== i) {
          const gj = dist(v.defenders[j], hp), gi = dist(di, hp);
          if (gj <= t.helpM && gj < gi) {
            const next = [...marks]; next[i] = marks[j]; next[j] = marks[i]; marks = next;
            this.coolSwitch = t.switchCoolSec; event = { kind: 'switch', a: i, b: j };
          }
        }
      }
    }
    if (t.doubleOn && this.doubler === null && h !== null && hp && this.coolDouble === 0 && this.paintSec >= t.afterSec && !event) {
      const onBall = marks.indexOf(h);
      let by = -1, bestG = Infinity;
      for (let k = 0; k < v.defenders.length; k++) { if (k === onBall) continue; const g = dist(v.defenders[k], hp); if (g < bestG) { bestG = g; by = k; } }
      if (by >= 0) { this.doubler = by; this.doubledOn = h; this.doubleSec = 0; event = { kind: 'double', by, on: h }; }
    }
    const play = this.play; play.length = marks.length;
    for (let k = 0; k < marks.length; k++) play[k] = k === this.doubler && this.doubledOn !== null ? this.doubledOn : marks[k];
    return { marks, play, doubler: this.doubler, event };
  }
}
