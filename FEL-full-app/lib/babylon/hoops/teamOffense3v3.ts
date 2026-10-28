// teamOffense3v3 — the other 3v3 team RUNS AN OFFENCE (1v1 / 3v3 ten-phase pass, phase 3 "rivals that play basketball").
//
// Before this their possession was ONE drive: a random man of the three, his root written along a lerp from where he stood to the
// rim in 0.8–1.6 s (ThreeVThreeMode `driveSec`), at most one swing pass off a cut-off (PRO 1). Measured: a median possession of
// 1.4–1.5 s (HOOPS-GOAL-GAP [H2]), no screens, no dribble moves, nobody else touching the ball.
//
// Now the man with the ball is a BODY (the mode moves him by this planner's wished velocity through his AiMover, the hero's accel and
// brake), and the possession is a little half-court offence:
//   SET     — the catch (or the check): a beat in triple threat.
//   CLEAR   — a fresh possession takes it back beyond the arc first (TAKE_BACK_M), as half-court streetball does.
//   PROBE   — at the top he sizes his man up: the 1v1 kit's moves (hoops/rivalOffense, by tier), each a wish shape, not a roll. A move
//             that clears his man's body out of the lane is an attack, now.
//   then one of: CALL A SCREEN (a team-mate comes to set it: the mode gives that body the TeammateBrain's 'screen' job), SWING it to
//             an open man (the release's kick read: open, far enough, a clear lane), or ATTACK.
//   SCREEN  — he waits for the screener to plant (a jab, a hold); USE — he comes off the screener's hip, and the screener's body is
//             what the defender has to get round (the bodies' contact — geometry, not a roll). The roll man is a pass when he is open.
//   ATTACK  — downhill on his body at the drive pace, bending round the man in the way (core/DriveLine); cut off with an open man, the
//             kick; held in front, a pull-up from inside the arc; at the rim, the gather.
//   GATHER  — the tell (GATHER_TELL_SEC: the block's window), then the mode's finish: the release's make chance, untouched.
// Possessions stay inside a budget (the tier's, × the knob): past it the handler attacks at once, so a possession never hangs.
//
// The TIERS differ in what the team does: ROOKIE probes briefly, rarely screens and swings once; ELITE screens, rejects a screen his
// man cheats over, hits the roll man, swings twice. Pure: positions in, a step out (teamOffense3v3.test.ts, the headless sim).
import { feel } from '../../feel-panel/feel';
import { profileFor, type Tier, type TierProfile } from '../core/Difficulty';
import { driveLateral, type DriveIntent } from '../core/DriveLine';
import { cutOff, kickTarget, laneClear, openness, KICK_OPEN_M, KICK_READ_FROM_K, KICK_READ_TO_K, type XZ } from '../modes/threevthreeRules';
import { Vector3 } from '@babylonjs/core';
import { KIT_WEIGHTS, KIT_CROSSES, moveFrame, pickWeighted, intoBody, type KitMove, type RivalAction } from './rivalOffense';

// ── THE NUMBERS (feel knobs, group "Hoops · rival offense") ──────────────────────────────────────────────────────────────────
/** 1 = the team offence on bodies; 0 = the release's one lerped drive exactly (the A/B). Knob `hoops.teamOffenseOn`. */
export const TEAM_OFFENSE_ON = true;
/** A fresh possession is taken back beyond this (m from the rim) before the offence starts. Knob `hoops.rivalTakeBackM`. */
export const RIVAL_TAKE_BACK_M = 6.9;
/** The handler's pace off the drive: clearing, probing, waiting on the screen (m/s). Knob `hoops.rivalHandlerMps`. */
export const RIVAL_HANDLER_MPS = 3.4;
/** The probe at the top, before he picks (s; × the tier's PROBE_K, ±30 %). Knob `hoops.rivalProbeSec`. */
export const RIVAL_PROBE_SEC = 1.6;
/** The longest he waits for the screener to plant (s). Knob `hoops.rivalScreenWaitSec`. */
export const RIVAL_SCREEN_WAIT_SEC = 2.4;
/** The possession budget (s; × the tier's BUDGET_K): past it he attacks now. Knob `hoops.rivalBudgetSec`. */
export const RIVAL_BUDGET_SEC = 10;
/** Held in front this long on the attack, he pulls up (inside the arc). Knob `hoops.rivalAttackPullUpSec`. */
export const RIVAL_ATTACK_PULLUP_SEC = 0.8;
/** The off-the-dribble pull-up is only taken inside this (m): the release's jumper base has no range term, so a pull-up three would be
 *  a free point. Knob `hoops.rivalPullUpMaxM`. */
export const RIVAL_PULLUP_MAX_M = 6.0;

export const teamOffenseOn = (): boolean => feel('hoops.teamOffenseOn', TEAM_OFFENSE_ON ? 1 : 0) >= 0.5;
const takeBackM = (): number => feel('hoops.rivalTakeBackM', RIVAL_TAKE_BACK_M);
const handlerMps = (): number => feel('hoops.rivalHandlerMps', RIVAL_HANDLER_MPS);
const probeSec = (): number => feel('hoops.rivalProbeSec', RIVAL_PROBE_SEC);
const screenWaitSec = (): number => feel('hoops.rivalScreenWaitSec', RIVAL_SCREEN_WAIT_SEC);
const budgetSec = (): number => feel('hoops.rivalBudgetSec', RIVAL_BUDGET_SEC);
const attackPullUpSec = (): number => feel('hoops.rivalAttackPullUpSec', RIVAL_ATTACK_PULLUP_SEC);
const pullUpMaxM = (): number => feel('hoops.rivalPullUpMaxM', RIVAL_PULLUP_MAX_M);

/** What a tier's team does (not how often it goes in): its probe length and budget as shares of the knobs, how often a probe ends in a
 *  screen and in a swing, how many passes a possession can hold, whether it reads the screen (reject / hit the roll man). */
export interface TeamTier { probeK: number; budgetK: number; screenChance: number; swingChance: number; passes: number; readsScreen: boolean; movesPerProbe: number }
export const TEAM_TIER: Readonly<Record<Tier, TeamTier>> = {
  rookie: { probeK: 0.9, budgetK: 0.9, screenChance: 0.3, swingChance: 0.35, passes: 1, readsScreen: false, movesPerProbe: 1 },
  pro: { probeK: 1, budgetK: 1, screenChance: 0.65, swingChance: 0.5, passes: 2, readsScreen: true, movesPerProbe: 2 },
  elite: { probeK: 1.1, budgetK: 1.05, screenChance: 0.75, swingChance: 0.6, passes: 3, readsScreen: true, movesPerProbe: 2 },
};
/** The tell before every release (s): the mode's GATHER_TELL_SEC (the block's window), unchanged. */
export const TEAM_GATHER_TELL_SEC = 0.35;
/** Screens are not set this close to the rim (the paint is for the finish): HoopsOffball's SCREEN_MIN_RIM_DIST. */
export const TEAM_SCREEN_MIN_RIM_M = 4.0;
/** The attack ends at this point past the rim's front (the release's driveEnd: RIM + 0.9 m in z). */
export const ATTACK_END_DZ = 0.9;

export type HandlerPhase = 'set' | 'clear' | 'probe' | 'screen' | 'use' | 'attack' | 'gather' | 'done';
export interface ScreenView { idx: number; phase: 'approach' | 'set' | 'roll' | 'pop' | 'done'; at: XZ }
/** What the planner reads each frame. Indices into `mates` are the handler's two team-mates, in the mode's order. */
export interface TeamView {
  handler: XZ;
  handlerVel: XZ;
  mates: readonly XZ[];
  /** My team's bodies (the defence), live ones only. */
  defenders: readonly XZ[];
  rim: XZ;
  /** The called screen's state, when there is one. */
  screen: ScreenView | null;
}
export interface HandlerStep {
  /** The wished planar velocity (m/s, world x / z) for the handler's mover. */
  wish: XZ;
  phase: HandlerPhase;
  /** An action that started this frame (the gate's vocabulary), or null. */
  action: RivalAction | null;
  /** A kit move that started this frame (the mode renders it), and the side its ball ends on (world lateral sign). */
  move: KitMove | null;
  moveSide: 1 | -1;
  /** Call a screen now: the mate index (−1 = none). */
  callScreen: number;
  /** Pass now: the mate index (−1 = none). */
  pass: number;
  /** The gather started this frame: the finish it is for ('rim' = the mode's layup / dunk read; 'pullup' = a jumper where he is). */
  gather: 'rim' | 'pullup' | null;
  /** The tell is over: release now. */
  release: boolean;
  /** 0..1, the possession's progress as the mode's driveK reads it (the gather is the last GATHER_TELL_SEC of it). */
  k: number;
  /** 0..1, how exposed his ball is to a poke this frame (the move's window; a straight run is the 1v1 drive's protected 0.25) — the mode's
   *  poke reads it (hoops/steals driveStrip `brainExposure01`) instead of his lateral speed, as the 1v1 rival's brain does. */
  exposure: number;
}

const len = (x: number, z: number): number => Math.hypot(x, z);
const ZERO: XZ = { x: 0, z: 0 };

/** The rival team's offence for one possession (a swing starts a new touch on the same possession). */
export class TeamOffense3v3 {
  readonly tt: TeamTier;
  readonly profile: TierProfile;
  // the possession
  elapsed = 0; passes = 0; screens = 0; actions: RivalAction[] = [];
  // the touch
  private phase: HandlerPhase = 'set'; private phaseT = 0; private fresh = true;
  private probeFor = 0; private movesLeft = 0; private move: KitMove | null = null; private moveT = 0; private moveSide: 1 | -1 = 1; private nextMoveAt = 0;
  private screenMate = -1; private useSide: 1 | -1 = 1; private containedT = 0; private kickRead = false; private gatherKind: 'rim' | 'pullup' = 'rim';
  private attackMoves = 0; private intent: DriveIntent = 'around'; private attackFrom: XZ = ZERO; private attackLen = 1; private tellT = 0;
  constructor(readonly tier: Tier, private rng: () => number = Math.random) { this.tt = TEAM_TIER[tier]; this.profile = profileFor(tier); }

  /** A new possession (their ball from the check / a make / a board). */
  beginPossession(): void { this.elapsed = 0; this.passes = 0; this.screens = 0; this.actions = []; }
  /** A touch: the possession's first (`fresh`), or a pass's catch. `intent` is the release's drive read (core/DriveLine). */
  beginTouch(o: { fresh: boolean; intent: DriveIntent }): void {
    this.fresh = o.fresh; this.intent = o.intent;
    this.phase = 'set'; this.phaseT = 0; this.move = null; this.moveT = 0; this.screenMate = -1; this.containedT = 0; this.kickRead = false; this.tellT = 0;
    this.probeFor = probeSec() * this.tt.probeK * (0.7 + 0.6 * this.rng()) * (o.fresh ? 1 : 0.6);
    this.movesLeft = this.tt.movesPerProbe; this.nextMoveAt = 0.25 + 0.4 * this.rng();
  }
  get phaseNow(): HandlerPhase { return this.phase; }
  get budget(): number { return budgetSec() * this.tt.budgetK; }
  /** A pass was thrown (the mode's swing): counted against the tier's passes. */
  notePass(): void { this.passes++; this.say('swing_pass'); }
  /** The passes this possession may still throw. */
  get passesLeft(): number { return Math.max(0, this.tt.passes - this.passes); }
  private say(a: RivalAction): RivalAction { this.actions.push(a); return a; }
  private go(p: HandlerPhase): void { this.phase = p; this.phaseT = 0; }

  step(dt: number, v: TeamView): HandlerStep {
    this.elapsed += dt; this.phaseT += dt;
    const out: HandlerStep = { wish: ZERO, phase: this.phase, action: null, move: null, moveSide: 1, callScreen: -1, pass: -1, gather: null, release: false, k: 0.05, exposure: DRIVE_EXPOSURE };
    const tx = v.rim.x - v.handler.x, tz = v.rim.z - v.handler.z, rimDist = len(tx, tz) || 1;
    const dir = { x: tx / rimDist, z: tz / rimDist }, perp = { x: -dir.z, z: dir.x };
    // his man: the nearest of my team
    let man: XZ | null = null, manD = Infinity;
    for (const d of v.defenders) { const dd = len(d.x - v.handler.x, d.z - v.handler.z); if (dd < manD) { manD = dd; man = d; } }
    const along = man ? (man.x - v.handler.x) * dir.x + (man.z - v.handler.z) * dir.z : -1;
    const across = man ? (man.x - v.handler.x) * perp.x + (man.z - v.handler.z) * perp.z : 0;
    const inLane = !!man && manD < 1.5 && along > 0 && along / Math.max(manD, 1e-4) > 0.45;
    const overBudget = this.elapsed >= this.budget;
    const vec = (f: number, l: number, side = 1): XZ => ({ x: dir.x * f + perp.x * l * side, z: dir.z * f + perp.z * l * side });

    switch (this.phase) {
      case 'set': {
        out.wish = ZERO;
        // a catch inside the screen's range (the roll man, a cutter) attacks at once; a fresh possession in the paint is taken back first
        if (this.phaseT >= SET_SEC) { if (!this.fresh && rimDist < TEAM_SCREEN_MIN_RIM_M + 0.5) { this.startAttack(v); out.action = this.say('drive'); } else this.go(this.fresh && rimDist < takeBackM() ? 'clear' : 'probe'); }
        break;
      }
      case 'clear': {
        // take it back: out along his own angle from the rim to beyond the arc (the court's top and sides clamp the spot)
        const ox = v.handler.x - v.rim.x, oz = v.handler.z - v.rim.z, ol = len(ox, oz) || 1;
        const want = takeBackM() + 0.5;
        let sx = v.rim.x + ox / ol * want, sz = v.rim.z + Math.max(0.3, oz / ol) * want;   // never out behind the baseline
        sx = Math.max(-6.5, Math.min(6.5, sx)); sz = Math.min(9.5, sz);
        const ex = sx - v.handler.x, ez = sz - v.handler.z, el = len(ex, ez);
        const sp = Math.min(handlerMps(), el * 3);
        out.wish = el > 1e-3 ? { x: ex / el * sp, z: ez / el * sp } : ZERO;
        if (rimDist >= takeBackM() || this.phaseT > CLEAR_MAX_SEC) this.go('probe');
        break;
      }
      case 'probe': {
        // size him up: the kit's moves, by tier; a move that clears his body out of the lane is an attack now
        if (this.move) {
          this.moveT += dt;
          const f = moveFrame(this.move, this.moveT);
          out.wish = vec(f.fwd * PROBE_FWD_K, f.lat * PROBE_LAT_K, this.moveSide); out.exposure = KIT_CROSSES[this.move] ? f.exposure : Math.min(f.exposure, DRIVE_EXPOSURE);   // a size-up at the top is not a commit: only a ball that changes hands is out where a hand gets it
          if (f.done) { this.move = null; this.moveT = 0; if (!inLane && along < 0.4 && man) { this.startAttack(v); out.action = this.say('drive'); } }
          break;
        }
        // hold the slot: drift back to it if he has come in; face up
        const back = rimDist < takeBackM() - 0.6 ? -1.2 : 0;
        out.wish = vec(back, 0);
        if (this.movesLeft > 0 && this.phaseT >= this.nextMoveAt) {
          const w: Record<KitMove, number> = { ...KIT_WEIGHTS[this.tier] };
          w.post_up = 0; w.shuffle *= 0.5; if (manD > 1.6) w.spin = 0;
          const m = pickWeighted(w, this.rng());
          if (m) {
            this.move = m; this.moveT = 0; this.movesLeft--; this.nextMoveAt = this.phaseT + 0.9 + 0.6 * this.rng();
            this.moveSide = Math.abs(across) < 0.15 ? (this.rng() < 0.5 ? -1 : 1) : across > 0 ? -1 : 1;
            out.move = m; out.moveSide = this.moveSide;
            if (m !== 'shuffle') out.action = this.say(m);
          }
        }
        if (this.phaseT >= this.probeFor || overBudget) this.decide(v, rimDist, out);
        break;
      }
      case 'screen': {
        // the screener is coming: hold, a jab now and then; when he is planted, come off him
        out.wish = vec(rimDist < takeBackM() - 0.6 ? -1 : 0, Math.sin(this.phaseT * 5) * 0.5);
        const s = v.screen;
        if (s && s.phase === 'set') {
          // which hip: the screener's side of my line to the rim
          const sAcross = (s.at.x - v.handler.x) * perp.x + (s.at.z - v.handler.z) * perp.z;
          this.useSide = sAcross >= 0 ? 1 : -1;
          // ELITE / PRO read: his man has cheated over to the screen's side already — REJECT it (go the other way)
          if (this.tt.readsScreen && man && Math.sign(across) === this.useSide && Math.abs(across) > 0.45 && this.rng() < this.profile.punishRate) {
            this.useSide = this.useSide === 1 ? -1 : 1;
            out.move = 'crossover'; out.moveSide = this.useSide; out.action = this.say('crossover');
            this.startAttack(v);
            break;
          }
          this.go('use');
        } else if (!s || s.phase === 'done' || s.phase === 'pop' || s.phase === 'roll' || this.phaseT > screenWaitSec() || overBudget) {
          this.decide(v, rimDist, out, true);
        }
        break;
      }
      case 'use': {
        // off the screener's hip and downhill; past him, the attack
        const s = v.screen;
        const sp = ATTACK_MPS_USE;
        if (s) {
          const px = s.at.x + perp.x * this.useSide * 0.9 + dir.x * 0.8, pz = s.at.z + perp.z * this.useSide * 0.9 + dir.z * 0.8;
          const ex = px - v.handler.x, ez = pz - v.handler.z, el = len(ex, ez) || 1;
          out.wish = { x: ex / el * sp, z: ez / el * sp };
          const passed = len(v.handler.x - v.rim.x, v.handler.z - v.rim.z) < len(s.at.x - v.rim.x, s.at.z - v.rim.z) - 0.3;
          // the roll man, open, with a clear lane: hit him (PRO+), when the defence went with the ball
          const mate = v.mates[this.screenMate];
          if (this.tt.readsScreen && s.phase === 'roll' && mate && this.passesLeft > 0 && inLane && openness(mate, v.defenders) >= KICK_OPEN_M && laneClear(v.handler, mate, v.defenders)) {
            out.pass = this.screenMate; break;
          }
          if (passed || this.phaseT > USE_MAX_SEC) this.startAttack(v);
        } else this.startAttack(v);
        break;
      }
      case 'attack': {
        const ax = v.handler.x - this.attackFrom.x, az = v.handler.z - this.attackFrom.z;
        const k = Math.min(1, len(ax, az) / this.attackLen);
        const end = { x: v.rim.x, z: v.rim.z + ATTACK_END_DZ };
        const ex = end.x - v.handler.x, ez = end.z - v.handler.z, el = len(ex, ez) || 1;
        const ed = { x: ex / el, z: ez / el }, ep = { x: -ed.z, z: ed.x };
        const sp = attackMps(this.tier);
        this.containedT = inLane ? this.containedT + dt : Math.max(0, this.containedT - dt * 0.5);
        if (this.move) {
          // a move to beat the man in front (the 1v1 kit's shape, full size): it works if his body leaves the lane
          this.moveT += dt;
          const f = moveFrame(this.move, this.moveT);
          out.wish = { x: ed.x * f.fwd + ep.x * f.lat * this.moveSide, z: ed.z * f.fwd + ep.z * f.lat * this.moveSide }; out.exposure = f.exposure;
          if (f.done) { this.move = null; this.moveT = 0; }
        } else {
          const bend = driveLateral({ at: v.handler, defender: man, dir: ed, k, intent: this.intent });
          // the bend is a lateral wish toward the bent line (DriveLine's metres → a steer of up to BEND_GAIN m/s)
          const bx = ed.z * bend, bz = -ed.x * bend;
          out.wish = { x: ed.x * sp + bx * BEND_GAIN, z: ed.z * sp + bz * BEND_GAIN };
          const ws = len(out.wish.x, out.wish.z); if (ws > sp) { out.wish = { x: out.wish.x / ws * sp, z: out.wish.z / ws * sp }; }
          // held up in front: a move (the tier's kit), while he has moves left
          if (inLane && this.containedT >= ATTACK_MOVE_AFTER_SEC && this.attackMoves > 0) {
            const w: Record<KitMove, number> = { ...KIT_WEIGHTS[this.tier] }; w.post_up = 0; w.shuffle *= 0.3; if (manD > 1.4) w.spin *= 0.3;
            const m = pickWeighted(w, this.rng());
            if (m) {
              this.move = m; this.moveT = 0; this.attackMoves--; this.containedT = 0;
              const acr = man ? (man.x - v.handler.x) * ep.x + (man.z - v.handler.z) * ep.z : 0;
              this.moveSide = Math.abs(acr) < 0.15 ? (this.rng() < 0.5 ? -1 : 1) : acr > 0 ? -1 : 1;
              out.move = m; out.moveSide = this.moveSide;
              if (m !== 'shuffle') out.action = this.say(m);
            }
          }
        }
        // the kick read: once, cut off inside the read window with an open man
        if (!this.move && !this.kickRead && k >= KICK_READ_FROM_K && k <= KICK_READ_TO_K && cutOff(v.handler, ed, v.defenders)) {
          this.kickRead = true;
          const pick = kickTarget(v.handler, v.mates, v.defenders);
          if (pick >= 0 && this.passesLeft > 0 && this.rng() < this.tt.swingChance + 0.2) { out.pass = pick; break; }
        }
        // still held in front with no moves left: the pull-up (inside the arc), the kick-out, or — late in the budget — a forced shot
        const stuck = !this.move && this.containedT >= attackPullUpSec() && (this.attackMoves === 0 || this.containedT >= attackPullUpSec() * 2);
        if (stuck && rimDist <= pullUpMaxM() && rimDist > 2.4) { this.gatherKind = 'pullup'; this.go('gather'); out.gather = 'pullup'; break; }
        if (stuck && this.passesLeft > 0) { const pick = kickTarget(v.handler, v.mates, v.defenders); if (pick >= 0) { out.pass = pick; break; } }
        if (stuck && this.elapsed >= this.budget + FORCED_AFTER_SEC) { this.gatherKind = 'pullup'; this.go('gather'); out.gather = 'pullup'; break; }
        if (el <= sp * TEAM_GATHER_TELL_SEC + 0.05) { this.move = null; this.gatherKind = 'rim'; this.go('gather'); out.gather = 'rim'; }
        out.k = Math.min(1 - (TEAM_GATHER_TELL_SEC + 0.01), 0.1 + 0.8 * k);
        break;
      }
      case 'gather': {
        this.tellT += dt;
        if (this.gatherKind === 'rim') {
          const end = { x: v.rim.x, z: v.rim.z + ATTACK_END_DZ };
          const ex = end.x - v.handler.x, ez = end.z - v.handler.z, el = len(ex, ez);
          const sp = Math.min(attackMps(this.tier), el / Math.max(0.05, TEAM_GATHER_TELL_SEC - this.tellT));
          out.wish = el > 0.05 ? { x: ex / el * sp, z: ez / el * sp } : ZERO;
        } else out.wish = ZERO;
        if (this.tellT >= TEAM_GATHER_TELL_SEC) { this.go('done'); out.release = true; }
        break;
      }
      case 'done': out.wish = ZERO; break;
    }
    out.phase = this.phase;
    if (this.phase === 'gather' || this.phase === 'done') out.k = Math.min(1, 1 - (TEAM_GATHER_TELL_SEC - Math.min(TEAM_GATHER_TELL_SEC, this.tellT)));
    else if (this.phase !== 'attack') out.k = 0.05;
    if (out.pass >= 0) out.wish = ZERO;
    else if (man && out.wish !== ZERO) { const w = intoBody(new Vector3(out.wish.x, 0, out.wish.z), v.handler, man, 0); out.wish = { x: w.x, z: w.z }; }   // touch his chest, do not run through it
    if (this.phase === 'gather' || this.phase === 'done' || this.phase === 'set') out.exposure = 0;
    return out;
  }
  /** The finish this gather is for. */
  get gatherFor(): 'rim' | 'pullup' { return this.gatherKind; }

  /** The read at the end of a probe (or a screen that came to nothing): a screen, a swing, or the attack. */
  private decide(v: TeamView, rimDist: number, out: HandlerStep, afterScreen = false): void {
    const over = this.elapsed >= this.budget;
    if (!over && !afterScreen && this.screens < 1 && rimDist >= TEAM_SCREEN_MIN_RIM_M && v.mates.length && this.rng() < this.tt.screenChance) {
      // the screener: the team-mate nearer the handler (he gets there sooner)
      let best = -1, bd = Infinity;
      v.mates.forEach((m, i) => { const d = len(m.x - v.handler.x, m.z - v.handler.z); if (d < bd) { bd = d; best = i; } });
      if (best >= 0) { this.screenMate = best; this.screens++; out.callScreen = best; out.action = this.say('screen'); this.go('screen'); return; }
    }
    if (!over && this.passesLeft > 0) {
      const pick = kickTarget(v.handler, v.mates, v.defenders);
      if (pick >= 0 && this.rng() < this.tt.swingChance) { out.pass = pick; return; }
    }
    this.startAttack(v); out.action = out.action ?? this.say('drive');
  }
  private startAttack(v: TeamView): void {
    this.attackFrom = { x: v.handler.x, z: v.handler.z };
    this.attackLen = Math.max(1, len(v.rim.x - v.handler.x, v.rim.z + ATTACK_END_DZ - v.handler.z));
    this.containedT = 0; this.kickRead = false; this.move = null; this.moveT = 0; this.attackMoves = this.tt.movesPerProbe; this.go('attack');
  }
}
/** On the attack, held in front this long before a move (s); past the budget by this, a shot is forced from anywhere (s). */
export const ATTACK_MOVE_AFTER_SEC = 0.3, FORCED_AFTER_SEC = 2.5;
/** A run with no move: the ball rides the hand away from the man (the 1v1 blow-by's protected 0.25; a poke needs a move's window). */
export const DRIVE_EXPOSURE = 0.25;
/** The triple-threat beat at a catch (s). */
export const SET_SEC = 0.3;
/** The take-back gives up after this (s): a body in the way. */
export const CLEAR_MAX_SEC = 3.0;
/** A probe move is smaller than the 1v1's (the handler is setting his man up at the top, not beating him at the elbow). */
export const PROBE_FWD_K = 0.35, PROBE_LAT_K = 0.7;
/** Coming off the screen (m/s), and the longest he spends getting past the screener (s). */
export const ATTACK_MPS_USE = 4.6, USE_MAX_SEC = 1.4;
/** The attack's pace (m/s): the release's DRIVE_MPS 5.4, the sprint drive, for every tier. */
export const attackMps = (_tier: Tier): number => 5.4;
/** DriveLine's bend (metres off the line) → a lateral steer (m/s per metre). */
export const BEND_GAIN = 2.2;
/** Was the release's "the ball changes hands" (the mode's carry path) — for the mode's render. */
export const crossesHand = (m: KitMove): boolean => KIT_CROSSES[m];
