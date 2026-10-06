// difficultySim — the combat difficulty harness, trimmed for the regression test (COMBAT DIFFICULTY, 2026-10-06).
//
// A player bot — a virtual PAD (stick, A/B/Y, X press/hold/tap, L1, R1, SELECT, R2) driven by a profile — against each
// duel mode's REAL rival brain, strike/defense resolution, movement, arena geometry, round rules and rival power, frame by
// frame at 60 Hz in 2D. Two engines mirror the modes' own update loops:
//   K (Karate VS, Mixed Combat): swings on hit-beat timers, FightCore.resolveStrike/applyHit, the book (HordeDynamics) for
//     the player, routes (FighterStyle), Storm dash / roll, Matrix Focus, knock slides on the arena (Mixed: ring-outs and
//     the vertical-line step via the committed yaw).
//   S (Showdown, Duel): StrikeController + DefenseController + applyDefenseOutcome for both, CombatMovement, the Storm X
//     (flick press = guard impact, hold = block after DASH.tapSec, tap = dash), Showdown's chakra/ultimate/assist/
//     substitution, Duel's chi/critical edge/counter-picked weapon/edge hold.
// NOT modelled: animation-clip settle times (approximated from the movesets' frame data), hit-stop, the body (camera)
// input path, the wall run, fire pits, the Showdown gate. The modes' loops are MIRRORED here, not imported (a mode file
// mounts a Babylon scene): a change to a mode's fight loop must be mirrored too, or this measures the old loop.
// The full harness (tables, sweeps, the before / after) is the session scratchpad's combat-difficulty/fightSim.ts.
// Pure: no scene, no DOM. Math.random is the seeded stream for a match's duration (the brains roll it).

import { Vector3 } from '@babylonjs/core';
import {
  FighterState, KARATE_ATTACKS, STAFF_ATTACKS, SPECIAL_ATTACK, CHI_MAX, RivalFightBrain, resolveStrike, applyHit,
  guardPressMs, rivalDifficulty, rivalPower, RIVAL_POWER_BASE, PARRY_STAGGER_SEC, STEP_CHI_GAIN, type AttackDef, type RivalPower,
} from '../core/FightCore';
import { RivalCombatBrain, threatLandsIn, type RivalResource } from '../core/RivalCombatBrain';
import { StrikeController, karateMoveset, staffMoveset, bladeMoveset, bookMoveset, stringRule, MIN_STARTUP_SEC, type CombatMove } from '../core/StrikeSystem';
import { DefenseController, applyDefenseOutcome, SUBSTITUTION_CHI_COST } from '../core/DefenseSystem';
import { ResourceMeter, CHAKRA } from '../core/ResourceMeter';
import { CombatMovement } from '../core/CombatMovement';
import { EvadeMoves } from '../core/EvadeMoves';
import { StringBook, attackFromMove, STRIKE_TIMING, DASH_ATTACK_SEC, type HordeMove, type StrikeBtn, type StickDir } from '../core/HordeDynamics';
import { DASH, stormDashReady } from '../core/StormCombat';
import { dodgeReward, dashSecToImpact, tickCounter, counterMult } from '../core/DodgeRead';
import { FocusMeter, FOCUS } from '../core/MatrixFocus';
import { KnockSlides } from '../core/FightKit';
import { BASELINE_RATINGS, hasFightMove, routeFor, cancelWindowSec, damageScale, type RouteStrike } from '../core/FighterStyle';
import { COMBAT_ARENAS, arenasFor, arenaClamp, knockTo, offEdge, insideBy, type CombatArena, type CombatModeId } from './arenas';
import { styleMoveset, styleAttacks } from './loadout';
import { weaponById } from './arsenal';
import { blendTraits, PURE } from './schools';
import { SHOWDOWN, attackerChakraGain, ultimateReaches, ultLungeStep, UltimateArm } from '../modes/showdownRules';
import { DUEL, chiForOutcome, rivalWeaponFor, holdFromEdge, safeSubstitutionSpot, type DuelWeapon } from '../modes/duelRules';
import { dragonLicensed, RIVAL_POWER_BY_LOADOUT } from '../modes/mixedRules';

export type SimMode = 'kvs' | 'showdown' | 'duel' | 'mixed';
export type SimTier = 'rookie' | 'pro' | 'elite';
export type ProfileId = 'decent' | 'new' | 'masher' | 'passive' | 'mirror' | 'attackOnly' | 'defendOnly';
export type SimWeapon = 'fists' | 'staff' | 'blade';

const DT = 1 / 60;
/** The rival's power as the mode applies it (FightCore.rivalPower × the pick's matchup factor). */
type Pw = RivalPower;
const POWER_KEY = { kvs: 'karateVs', showdown: 'showdown', duel: 'duel', mixed: 'mixedcombat' } as const;
export function powerFor(mode: SimMode, tier: SimTier, base?: number, weapon: SimWeapon = 'fists'): Pw {
  return rivalPower((base ?? RIVAL_POWER_BASE[POWER_KEY[mode]]) * pickFactor(mode, weapon), tier);
}
/** The pick's matchup factor (duelRules / mixedRules), as the modes apply it. */
function pickFactor(mode: SimMode, weapon: SimWeapon): number {
  if (mode === 'duel') return DUEL.rivalPowerByWeapon[weapon];
  if (mode === 'mixed') return weapon === 'staff' ? RIVAL_POWER_BY_LOADOUT.staff : RIVAL_POWER_BY_LOADOUT.fists;
  return 1;
}
/** The brains say setStepping(false) in the modes without the line grammar, as the modes do. */
const noStep = (b: { setStepping(ok: boolean): void }, mode: SimMode): void => { if (mode !== 'mixed') b.setStepping(false); };
/** Duel tells its brain the player's weapon reach, as the mode does. */
const foeReach = (b: { setFoeReach(m: number): void }, m: number): void => { b.setFoeReach(m); };
const UNIT: Pw = { p: 1, hp: 1, dmg: 1, guardTaken: 1 };
const ARENA_MODE: Record<SimMode, CombatModeId> = { kvs: 'karate_vs', showdown: 'showdown', duel: 'duel', mixed: 'mixedcombat' };
/** The modes' own base dials (PRO). */
export const BASE_DIFF: Record<SimMode, number> = { kvs: 0.72, showdown: 0.72, duel: 0.72, mixed: 0.68 };

// ── RNG ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── PLAYER PROFILES ─────────────────────────────────────────────────────────────────────────────────────────────────
type DefKind = 'block' | 'parry' | 'dodge' | 'back' | 'sub';
export interface Profile {
  id: ProfileId;
  /** reaction to a wind-up he did not anticipate (ms) */
  rtMs: [number, number];
  /** chance a rival swing is READ (anticipated: the answer can be timed freely) */
  read: number;
  defends: boolean;
  defMix: Record<DefKind, number>;
  /** timing noise on a timed press (ms, sd) */
  timingSd: number;
  /** offence */
  strings: StrikeBtn[][];
  gapMs: [number, number];          // between presses inside a string
  neutralMs: [number, number];      // between string openers in neutral
  hitConfirm: number;               // a link that did not land ends the string with this chance
  punish: number;                   // chance to punish an opening (rival staggered / stunned / recovering)
  dash: number;                     // chance to dash in when far
  focus: number;                    // chance to hold Focus through a string (meter ≥ 60)
  circle: number;                   // lateral stick while spacing (0..1)
  edgeAware: boolean;
  special: number;                  // ultimate / DRAGON / assist use when available
  masher: boolean;
}

export const PROFILES: Record<ProfileId, Profile> = {
  // a decent player: reacts in 250–350 ms, reads ~70 % of swings, blocks / parries / dodges, spaces and circles, runs
  // short strings and stops a blocked one, dashes in and uses Focus and the specials sometimes
  decent: {
    id: 'decent', rtMs: [250, 350], read: 0.7, defends: true,
    defMix: { block: 0.45, parry: 0.25, dodge: 0.18, back: 0.12, sub: 0 }, timingSd: 45,
    strings: [['A', 'A', 'B'], ['A', 'A', 'A'], ['A', 'B', 'Y'], ['B', 'B', 'Y'], ['Y'], ['A', 'Y'], ['A', 'A'], ['B', 'A']],
    gapMs: [130, 220], neutralMs: [500, 1200], hitConfirm: 0.7, punish: 0.8, dash: 0.35, focus: 0.25, circle: 0.6,
    edgeAware: true, special: 0.9, masher: false,
  },
  // a new player: slower, reads a third of the swings, mostly holds block, single presses and short pairs
  new: {
    id: 'new', rtMs: [380, 520], read: 0.3, defends: true,
    defMix: { block: 0.8, parry: 0.05, dodge: 0.1, back: 0.05, sub: 0 }, timingSd: 90,
    strings: [['A'], ['B'], ['Y'], ['A', 'A'], ['A', 'B'], ['B']],
    gapMs: [250, 450], neutralMs: [700, 1600], hitConfirm: 0, punish: 0.3, dash: 0.05, focus: 0, circle: 0,
    edgeAware: false, special: 0.5, masher: false,
  },
  // a masher: walks in, presses a button every 110–200 ms in reach, never guards
  masher: {
    id: 'masher', rtMs: [999, 999], read: 0, defends: false,
    defMix: { block: 1, parry: 0, dodge: 0, back: 0, sub: 0 }, timingSd: 0,
    strings: [], gapMs: [110, 200], neutralMs: [0, 0], hitConfirm: 0, punish: 0, dash: 0, focus: 0, circle: 0,
    edgeAware: false, special: 1, masher: true,
  },
  // controls: the decent player with no guard at all / who never attacks
  attackOnly: undefined as unknown as Profile,
  defendOnly: undefined as unknown as Profile,
  // control: the player is the rival's own brain with the rival's own moveset (the engine must come out even)
  mirror: undefined as unknown as Profile,
  // control: stands, never presses
  passive: {
    id: 'passive', rtMs: [999, 999], read: 0, defends: false,
    defMix: { block: 1, parry: 0, dodge: 0, back: 0, sub: 0 }, timingSd: 0,
    strings: [], gapMs: [0, 0], neutralMs: [1e9, 1e9], hitConfirm: 0, punish: 0, dash: 0, focus: 0, circle: 0,
    edgeAware: false, special: 0, masher: false,
  },
};

PROFILES.attackOnly = { ...PROFILES.decent, id: 'attackOnly', defends: false };
PROFILES.defendOnly = { ...PROFILES.decent, id: 'defendOnly', strings: [], neutralMs: [1e9, 1e9], punish: 0, special: 0 };
PROFILES.mirror = { ...PROFILES.passive, id: 'mirror' };

// ── THE PAD ─────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface Pad {
  /** stick, WORLD frame (|w| ≤ 1) */
  wx: number; wz: number;
  press: StrikeBtn | null;
  xDown: boolean; xUp: boolean; flick: boolean;
  l1: boolean; r1: boolean; select: boolean; focus: boolean;
}
export interface Obs {
  now: number;
  me: { x: number; z: number }; foe: { x: number; z: number };
  dist: number;
  myReach: number;
  /** the rival swing in its startup: id (rises per swing), real ms to impact, its reach */
  foeSwingId: number; foeImpactIn: number; foeSwingRange: number;
  foeOpen: boolean; foeBlocking: boolean;
  /** my own swing: committed = startup/active; busy = any phase */
  myCommitted: boolean; myBusy: boolean; myCanAct: boolean;
  /** outcome of my last resolved swing, and its sequence number */
  myOutSeq: number; myOut: string;
  mySwingSeq: number;
  arena: CombatArena;
  focusValue: number;
  specialReady: boolean;   // Showdown ultimate (chakra full) / Mixed DRAGON (chi full)
  specialReach: number;
  assistReady: boolean;
  subReady: boolean;
  dashKind: 'storm' | 'combat';
  canRoll: boolean;
}

export class Agent {
  private def: null | { id: number; kind: DefKind; notBefore: number; lead: number; done: boolean; flick: boolean } = null;
  private lastSwingId = 0;
  private str: null | { seq: StrikeBtn[]; i: number; nextAt: number; waitSeq: number; waitSince: number } = null;
  private attackAt = 0;
  private circleDir = 1;
  private circleFlipAt = 0;
  private xHeld = false;
  private xReleaseAt = 0;
  private backUntil = 0;
  private focusUntil = 0;
  private lastOpenAt = -1;
  private wasOpen = false;
  private dashSide = 1;
  readonly pad: Pad = { wx: 0, wz: 0, press: null, xDown: false, xUp: false, flick: false, l1: false, r1: false, select: false, focus: false };
  constructor(readonly p: Profile, private rng: () => number, private sMode: boolean) {}
  private u(a: number, b: number): number { return a + (b - a) * this.rng(); }
  private gauss(sd: number): number { const u = 1 - this.rng(), v = this.rng(); return sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  reset(): void { this.def = null; this.str = null; this.xHeld = false; this.backUntil = 0; this.focusUntil = 0; this.attackAt = 0; }

  frame(o: Obs): Pad {
    const pad = this.pad, p = this.p;
    pad.press = null; pad.xDown = false; pad.xUp = false; pad.flick = false; pad.l1 = false; pad.r1 = false; pad.select = false;
    pad.focus = o.now < this.focusUntil;
    const dx = o.dist > 1e-3 ? (o.foe.x - o.me.x) / o.dist : 0, dz = o.dist > 1e-3 ? (o.foe.z - o.me.z) / o.dist : 1;
    let fwd = 0, side = 0;
    if (p.id === 'passive') { pad.wx = 0; pad.wz = 0; return pad; }

    // ── the X release a held press is waiting for ──
    if (this.xHeld && o.now >= this.xReleaseAt) { pad.xUp = true; this.xHeld = false; }

    // ── DEFENCE: one plan per rival swing ──
    if (p.defends && o.foeSwingId !== this.lastSwingId && o.foeSwingId > 0) {
      this.lastSwingId = o.foeSwingId;
      if (o.dist <= o.foeSwingRange + 0.6 && !o.myCommitted) {
        const read = this.rng() < p.read;
        const notBefore = o.now + (read ? 0 : this.u(p.rtMs[0], p.rtMs[1]));
        let kind = this.pick(p.defMix);
        if (kind === 'sub' && !o.subReady) kind = 'block';
        if (kind === 'dodge' && !o.canRoll && o.dashKind === 'storm' && false) kind = 'block';
        let lead: number, flick = false;
        switch (kind) {
          case 'block': lead = this.sMode ? this.u(320, 480) : this.u(220, 400); break;
          // a parry is a press timed to land inside the window before the impact (S modes: the flick — a guard impact
          // inside 90 ms, a parry inside 160)
          case 'parry': lead = this.sMode ? 55 + this.gauss(p.timingSd) : 85 + this.gauss(p.timingSd); flick = this.sMode; break;
          case 'dodge': lead = (this.sMode ? 110 : 150) + this.gauss(p.timingSd); break;
          case 'back': lead = 400; break;
          case 'sub': lead = 120 + this.gauss(p.timingSd); break;
        }
        this.def = { id: o.foeSwingId, kind, notBefore, lead: Math.max(0, lead), done: false, flick };
      }
    }
    const d = this.def;
    if (d && !d.done) {
      if (o.foeImpactIn < 0 || o.foeSwingId !== d.id) d.done = true;
      else if (o.now >= d.notBefore && o.foeImpactIn <= d.lead && o.myCanAct && !o.myCommitted) {
        d.done = true;
        this.str = null;   // a defended swing breaks my string
        switch (d.kind) {
          case 'block': case 'parry':
            if (!this.xHeld) { pad.xDown = true; pad.flick = d.flick; this.xHeld = true; }
            this.xReleaseAt = o.now + Math.max(o.foeImpactIn + this.u(90, 180), d.kind === 'parry' ? this.u(220, 320) : 250);
            break;
          case 'dodge':
            if (!this.sMode && o.canRoll && this.rng() < 0.5) { pad.l1 = true; }
            else if (!this.xHeld) { pad.xDown = true; this.xHeld = true; this.xReleaseAt = o.now + this.u(50, 100); this.dashSide = this.rng() < 0.5 ? -1 : 1; }
            break;
          case 'back': this.backUntil = o.now + o.foeImpactIn + 150; break;
          case 'sub': pad.r1 = true; break;
        }
      }
    }

    // ── OFFENCE ──
    const defending = this.xHeld || o.now < this.backUntil;
    if (!defending && o.myCanAct) {
      // an opening is read once (its rising edge)
      const openEdge = o.foeOpen && !this.wasOpen;
      if (p.masher) {
        if (o.dist <= o.myReach + 0.3 && o.now >= this.attackAt) {
          pad.press = (['A', 'B', 'Y'] as StrikeBtn[])[Math.floor(this.rng() * 3)];
          if (pad.press === 'Y' && o.specialReady && p.special === 0) pad.press = 'B';
          this.attackAt = o.now + this.u(p.gapMs[0], p.gapMs[1]);
        }
        if (o.specialReady && o.dist <= o.specialReach && p.special > 0) pad.press = 'Y';
        if (o.assistReady && this.rng() < 0.02) pad.select = true;
      } else if (this.str) {
        const s = this.str;
        if (o.now >= s.nextAt) {
          // hit-confirm: wait (briefly) for the last link's outcome; a link that did not land ends the string, sometimes
          const known = o.myOutSeq >= s.waitSeq;
          if (s.i > 0 && !known && o.now - s.waitSince < 260) { /* wait for the read */ }
          else if (s.i > 0 && known && o.myOut !== 'hit' && this.rng() < p.hitConfirm) { this.str = null; this.attackAt = o.now + this.u(300, 700); this.backUntil = o.now + this.u(150, 350); }
          else {
            pad.press = s.seq[s.i]; s.i++;
            s.waitSeq = o.mySwingSeq + 1; s.waitSince = o.now;
            s.nextAt = o.now + this.u(p.gapMs[0], p.gapMs[1]);
            if (s.i >= s.seq.length) { this.str = null; this.attackAt = o.now + this.u(p.neutralMs[0], p.neutralMs[1]); }
          }
        }
      } else if (o.specialReady && o.dist <= o.specialReach && this.rng() < p.special * 0.2) {
        pad.press = 'Y';
      } else if (o.dist <= o.myReach - 0.05 && !o.myBusy && p.strings.length) {
        const punish = openEdge && this.rng() < p.punish;
        if (punish || o.now >= this.attackAt) {
          const seq = p.strings[Math.floor(this.rng() * p.strings.length)];
          this.str = { seq, i: 0, nextAt: o.now, waitSeq: 0, waitSince: o.now };
          if (o.focusValue >= 60 && this.rng() < p.focus) this.focusUntil = o.now + this.u(700, 1200);
          if (!punish) this.attackAt = o.now + this.u(p.neutralMs[0], p.neutralMs[1]);
        }
      }
      if (o.assistReady && !p.masher && o.dist < 3 && this.rng() < p.special * 0.01) pad.select = true;
      this.wasOpen = o.foeOpen;
    }

    // ── MOVEMENT ──
    if (o.now >= this.circleFlipAt) { this.circleDir = -this.circleDir; this.circleFlipAt = o.now + this.u(1200, 2800); }
    const engage = o.myReach - 0.15;
    if (o.now < this.backUntil) { fwd = -1; side = this.circleDir * 0.4; }
    else if (p.masher || p.id === 'new') { fwd = o.dist > engage ? 1 : 0; }
    else if (this.str || o.foeOpen) { fwd = o.dist > engage ? 1 : 0; }
    else if (o.dist > engage + 0.5) {
      fwd = 1; side = this.circleDir * p.circle * 0.4;
      if (o.dist > 3.6 && !this.xHeld && this.rng() < p.dash * 0.05) { pad.xDown = true; this.xHeld = true; this.xReleaseAt = o.now + this.u(50, 100); this.dashSide = 0; }
    } else { fwd = o.dist < 1.25 ? -0.6 : o.dist > engage ? 0.5 : 0; side = this.circleDir * p.circle; }
    let wx = dx * fwd + -dz * side, wz = dz * fwd + dx * side;
    // a dodge's dash goes back / to a side, not into him
    if (this.xHeld && this.dashSide !== 0 && this.xReleaseAt - o.now < 120 && (d?.kind === 'dodge')) { wx = -dx * 0.5 + -dz * this.dashSide; wz = -dz * 0.5 + dx * this.dashSide; }
    // edge awareness on a drop arena: never step toward a near edge; lean back to the middle
    if (p.edgeAware && o.arena.edge === 'drop') {
      const inside = insideBy(o.me, o.arena.shape);
      if (inside < 2.2) {
        const cl = Math.hypot(o.me.x, o.me.z) || 1, cx = -o.me.x / cl, cz = -o.me.z / cl;
        const outward = -(wx * cx + wz * cz);
        if (outward > 0) { wx += cx * outward; wz += cz * outward; }
        const k = (2.2 - inside) / 2.2;
        wx += cx * k; wz += cz * k;
      }
    }
    const wl = Math.hypot(wx, wz);
    if (wl > 1) { wx /= wl; wz /= wl; }
    pad.wx = wx; pad.wz = wz;
    return pad;
  }

  private pick(mix: Record<DefKind, number>): DefKind {
    let total = 0; for (const k in mix) total += mix[k as DefKind];
    let r = this.rng() * total;
    for (const k in mix) { r -= mix[k as DefKind]; if (r < 0) return k as DefKind; }
    return 'block';
  }
}

// ── SHARED BITS ─────────────────────────────────────────────────────────────────────────────────────────────────────
export interface RoundStat { won: boolean; how: 'ko' | 'ringout' | 'time'; secs: number; myHp: number; foeHp: number }
export interface MatchResult { won: boolean; myWins: number; foeWins: number; rounds: RoundStat[] }
export interface MatchCfg {
  mode: SimMode; tier: SimTier; profile: ProfileId; seed: number;
  weapon?: SimWeapon; arenaId?: string;
  /** optional: the raw dial (else rivalDifficulty for the tier), the mode's base power (else RIVAL_POWER_BASE) */
  difficulty?: number;
  powerBase?: number;
}

class Timers {
  private list: { at: number; fn: () => void }[] = [];
  t = 0;
  after(sec: number, fn: () => void): void { this.list.push({ at: this.t + sec, fn }); }
  tick(dt: number): void {
    if (!(dt > 0)) return;
    this.t += dt;
    if (!this.list.length) return;
    const due = this.list.filter((e) => e.at <= this.t);
    if (!due.length) return;
    this.list = this.list.filter((e) => e.at > this.t);
    for (const e of due) e.fn();
  }
  clear(): void { this.list = []; }
}

const yawTo = (a: { x: number; z: number }, b: { x: number; z: number }): number => Math.atan2(b.x - a.x, b.z - a.z);
function slew(cur: number, want: number, rate: number, dt: number): number {
  let d = want - cur; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
  const step = rate * dt;
  return Math.abs(d) <= step ? want : cur + Math.sign(d) * step;
}
const TURN_RATE = 9.0;   // CombatPosture.COMBAT_TURN_RATE
const BTN_KEY: Record<StrikeBtn, 'jab' | 'kick' | 'heavy'> = { A: 'jab', B: 'kick', Y: 'heavy' };
const KEY_BTN: Record<'jab' | 'kick' | 'heavy', StrikeBtn> = { jab: 'A', kick: 'B', heavy: 'Y' };
/** the clip's settle after the cancel point, by weight (bookMoveset's recovery tail) — assumption: the tree settles there */
const SETTLE_TAIL: Record<string, number> = { light: 0.12, medium: 0.12, heavy: 0.22, finisher: 0.3 };
/** the rival's swing, start to settle (karateMoveset / staffMoveset frame data) */
const FOE_SWING_SEC = { fists: { jab: 0.42, kick: 0.58, heavy: 0.8 }, staff: { jab: 0.6, kick: 0.74, heavy: 0.98 } } as const;

function arenaFor(mode: SimMode, id?: string): CombatArena {
  const list = arenasFor(ARENA_MODE[mode]);
  return (id && COMBAT_ARENAS.find((a) => a.id === id)) || list[0];
}

// ── ENGINE K: Karate VS, Mixed Combat ───────────────────────────────────────────────────────────────────────────────
interface KFighter {
  p: { x: number; z: number }; yaw: number; st: FighterState;
  striking: boolean; strikeEnd: number; cancelFrom: number | null; impactAt: number | null;
  landed: RouteStrike[];
}

class KMatch {
  readonly arena: CombatArena;
  private rng: () => number;
  private agent: Agent;
  private me!: KFighter; private foe!: KFighter;
  private now = 10_000;
  private knock = new KnockSlides();
  private meT = new Timers(); private foeT = new Timers();
  private book = new StringBook();
  private evade = new EvadeMoves();
  private focus = new FocusMeter();
  private brainC: RivalCombatBrain | null = null;
  private brainF: RivalFightBrain | null = null;
  private myAttacks: Record<'jab' | 'kick' | 'heavy', AttackDef>;
  private foeAttacks: Record<'jab' | 'kick' | 'heavy', AttackDef>;
  private foeSet: 'fists' | 'staff';
  private foeRes: RivalResource = { value: 0, max: Infinity, dashCost: 12, subCost: Infinity, subReady: false };
  private queued: { key: 'jab' | 'kick' | 'heavy'; at: number } | null = null;
  private meDash: { dx: number; dz: number; left: number; homing: boolean } | null = null;
  private meDashIframe = 0; private lastDashSec = -1e9;
  private foeDash: { dx: number; dz: number; left: number } | null = null;
  private meCounter = 0; private slowmo = 0;
  private foeLaunched = 0;
  private roundOver: null | { won: boolean; how: RoundStat['how'] } = null;
  private xDownAt = -1; private lastTapAt = -1e9;
  private foeSwingId = 0; private foeImpactAt: number | null = null; private foeRange = 1.8; private foeSwingEnd = 0;
  private mySwingSeq = 0; private myOutSeq = 0; private myOut = '';
  private obs!: Obs;
  private readonly mirror: boolean;
  private mirrorBrain: RivalFightBrain | null = null;
  private pw: Pw;
  constructor(readonly mode: 'kvs' | 'mixed', readonly cfg: MatchCfg) {
    this.arena = arenaFor(mode, cfg.arenaId);
    this.rng = mulberry32(cfg.seed * 7919 + 17);
    this.agent = new Agent(PROFILES[cfg.profile], mulberry32(cfg.seed * 104729 + 3), false);
    this.mirror = cfg.profile === 'mirror';
    const myLo = mode === 'mixed' && cfg.weapon === 'staff' && !this.mirror ? 'staff' : 'fists';
    this.myAttacks = styleAttacks(myLo === 'staff' ? STAFF_ATTACKS : KARATE_ATTACKS, blendTraits(PURE), MIN_STARTUP_SEC * 1000);
    this.foeSet = mode === 'mixed' && myLo === 'fists' && !this.mirror ? 'staff' : 'fists';
    if (this.mirror) this.myAttacks = KARATE_ATTACKS;
    this.foeAttacks = this.foeSet === 'staff' ? STAFF_ATTACKS : KARATE_ATTACKS;
    this.pw = this.mirror ? UNIT : powerFor(mode, cfg.tier, cfg.powerBase, myLo);
    if (mode === 'kvs') this.brainC = new RivalCombatBrain({ difficulty: BASE_DIFF.kvs, canSpecial: hasFightMove('dragon', BASELINE_RATINGS) });
  }

  run(): MatchResult {
    let myWins = 0, foeWins = 0, round = 1;
    const rounds: RoundStat[] = [];
    this.me = { p: { x: 0, z: 2.2 }, yaw: Math.PI, st: new FighterState(100), striking: false, strikeEnd: 0, cancelFrom: null, impactAt: null, landed: [] };
    this.foe = { p: { x: 0, z: -2.2 }, yaw: 0, st: new FighterState(100), striking: false, strikeEnd: 0, cancelFrom: null, impactAt: null, landed: [] };
    while (myWins < 2 && foeWins < 2) {
      const r = this.round(round, myWins, foeWins);
      rounds.push(r);
      if (r.won) myWins++; else foeWins++;
      round++;
    }
    return { won: myWins > foeWins, myWins, foeWins, rounds };
  }

  private diff(): number { return this.cfg.difficulty ?? rivalDifficulty(BASE_DIFF[this.mode], this.cfg.tier); }

  private round(round: number, myWins: number, foeWins: number): RoundStat {
    const me = this.me, foe = this.foe;
    foe.st.maxHp = Math.round(100 * this.pw.hp); foe.st.guardTaken = this.pw.guardTaken;
    me.st.resetRound(); foe.st.resetRound();
    me.p.x = 0; me.p.z = 2.2; foe.p.x = 0; foe.p.z = -2.2; me.yaw = Math.PI; foe.yaw = 0;
    me.striking = foe.striking = false; me.landed = []; foe.landed = []; me.impactAt = null; foe.impactAt = null;
    this.knock.clear(); this.meT.clear(); this.foeT.clear(); this.book.reset(); this.queued = null; this.meDash = null; this.meDashIframe = 0;
    this.foeDash = null; this.meCounter = 0; this.slowmo = 0; this.foeLaunched = 0; this.roundOver = null; this.xDownAt = -1;
    this.foeImpactAt = null; this.agent.reset();
    if (this.mirror) { const b = new RivalFightBrain(BASE_DIFF[this.mode], KARATE_ATTACKS); b.setRound(round); b.setStanding(myWins, foeWins, 2); b.setDifficulty(this.diff()); b.setCanSpecial(this.mode === 'mixed' ? dragonLicensed(BASELINE_RATINGS) : hasFightMove('dragon', BASELINE_RATINGS)); b.setEdge((x, z) => insideBy({ x, z }, this.arena.shape)); this.mirrorBrain = b; }
    if (this.mode === 'kvs') {
      const b = this.brainC!;
      b.setRound(round); b.setStanding(foeWins, myWins, 2); b.setDifficulty(this.diff()); b.setCanSpecial(hasFightMove('dragon', BASELINE_RATINGS));
      if (!this.mirror) noStep(b, 'kvs');
      this.foeRes.max = hasFightMove('dragon', BASELINE_RATINGS) ? CHI_MAX : Infinity;
    } else {
      // Mixed rebuilds its brain every round (applyLoadouts)
      const b = new RivalFightBrain(BASE_DIFF.mixed, this.foeAttacks);
      b.setRound(round); b.setStanding(foeWins, myWins, 2); b.setDifficulty(this.diff());
      b.setCanSpecial(dragonLicensed(BASELINE_RATINGS));
      b.setEdge((x, z) => insideBy({ x, z }, this.arena.shape));
      this.brainF = b;
    }
    // KVS: the 0.9 s READY beat (nothing moves); Mixed starts fighting at once (the loadout phase precedes it)
    let t = 0;
    const limit = 120;
    while (t < limit && !this.roundOver) { this.step(); t += DT; }
    // a KO's knock slide finishes before Mixed checks the ring (its onDone): let pending slides land
    for (let i = 0; i < 40 && !this.roundOver && this.knock.active; i++) { this.knock.tick(DT); }
    const ro = this.roundOver ?? { won: me.st.hp >= foe.st.hp, how: 'time' as const };
    return { won: ro.won, how: ro.how, secs: t, myHp: me.st.hp, foeHp: foe.st.hp };
  }

  private end(won: boolean, how: RoundStat['how']): void { if (!this.roundOver) this.roundOver = { won, how }; }

  private swingSec(mine: boolean, key: 'jab' | 'kick' | 'heavy', move: HordeMove | null, special: boolean): number {
    if (special) return 0.9;
    if (mine && move) return STRIKE_TIMING[move.weight].cancelAt / move.speed + SETTLE_TAIL[move.weight];
    if (mine && this.mirror) return FOE_SWING_SEC.fists[key];
    return FOE_SWING_SEC[this.foeSet][key];
  }

  private stickDir(pad: Pad): StickDir {
    const tx = this.foe.p.x - this.me.p.x, tz = this.foe.p.z - this.me.p.z, l = Math.hypot(tx, tz), wl = Math.hypot(pad.wx, pad.wz);
    if (wl < 0.35 || l < 1e-3) return 'n';
    const c = (pad.wx * tx + pad.wz * tz) / (l * wl);
    return c > 0.4 ? 'f' : c < -0.4 ? 'b' : 'n';
  }

  private swing(mine: boolean, key: 'jab' | 'kick' | 'heavy', pad?: Pad): void {
    const A = mine ? this.me : this.foe, D = mine ? this.foe : this.me;
    if (!A.st.controllable || (!mine && A.striking) || this.roundOver) return;
    if (mine && A.striking) {
      if (A.cancelFrom !== null && this.now >= A.cancelFrom) this.endStrike(true);
      else { this.queued = { key, at: this.now }; return; }
    }
    const licensed = this.mode === 'mixed' ? dragonLicensed(BASELINE_RATINGS) : hasFightMove('dragon', BASELINE_RATINGS);
    const special = key === 'heavy' && A.st.chi >= CHI_MAX && licensed;
    const baseAtk = (mine ? this.myAttacks : this.foeAttacks)[key];
    const dist = Math.hypot(D.p.x - A.p.x, D.p.z - A.p.z);
    const move = mine && !special && !this.mirror ? this.book.press(KEY_BTN[key], pad ? this.stickDir(pad) : 'n', this.now / 1000, { air: this.foeLaunched > 0, afterDash: this.now / 1000 - this.lastDashSec < DASH_ATTACK_SEC, airborne: false, close: dist < 1.35 }) : null;
    const atk0: AttackDef = special ? SPECIAL_ATTACK : move ? attackFromMove(move, baseAtk) : baseAtk;
    const atk: AttackDef = mine || this.pw.dmg === 1 ? atk0 : { ...atk0, dmg: atk0.dmg * this.pw.dmg };
    A.striking = true;
    if (special) A.st.chi = 0;
    const hitDelay = atk.startupMs;
    const swungAt = this.now;
    const committedYaw = A.yaw;
    if (mine) { A.impactAt = this.now + hitDelay; A.cancelFrom = move ? this.now + (STRIKE_TIMING[move.weight].cancelAt / move.speed) * 1000 : null; A.strikeEnd = this.now + this.swingSec(true, key, move, special) * 1000; this.mySwingSeq++; }
    else { this.foeSwingId++; this.foeRange = atk.range; this.foeImpactAt = this.now + atk.startupMs / this.focus.worldScale; A.strikeEnd = this.foeT.t + this.swingSec(false, key, null, special); A.impactAt = this.foeImpactAt; }
    const seq = this.mySwingSeq;
    const onHit = (): void => {
      if (this.roundOver) { this.endStrike(mine); return; }
      const d = Math.hypot(D.p.x - A.p.x, D.p.z - A.p.z);
      if (!mine) this.foeImpactAt = null;
      let lateral: number | undefined;
      if (this.mode === 'mixed') { const tx = D.p.x - A.p.x, tz = D.p.z - A.p.z; lateral = Math.abs(tx * -Math.cos(committedYaw) + tz * Math.sin(committedYaw)); }
      let out = resolveStrike(atk, d, D.st, this.now, lateral);
      if (!mine && (this.meDashIframe > 0 || this.evade.rollIFrames)) out = 'whiff';
      if (!mine && out === 'whiff' && this.meDashIframe > 0) {
        const r = dodgeReward(dashSecToImpact(this.lastDashSec * 1000, swungAt, this.now));
        if (r.perfect) { this.meCounter = r.counterSec; this.focus.gain(FOCUS.dodgeGain); }
      }
      if (mine) { this.myOutSeq = seq; this.myOut = out; }
      switch (out) {
        case 'stepped': D.st.chi = Math.min(CHI_MAX, D.st.chi + STEP_CHI_GAIN); break;
        case 'parried':
          A.st.staggerSec = PARRY_STAGGER_SEC; D.st.chi = Math.min(CHI_MAX, D.st.chi + 15); this.slowmo = 0.5;
          this.endStrike(mine);
          break;
        case 'guardBreak': this.endStrike(!mine); break;
        case 'hit': {
          const counter = mine ? counterMult(this.meCounter) : 1;
          const base = applyHit(A.st, D.st, atk);
          if (this.mode === 'kvs') {
            const dealt = Math.round(base * counter * (mine && this.focus.active ? FOCUS.damageMult : 1));
            if (mine && counter > 1) this.meCounter = 0;
            if (counter > 1) D.st.hp = Math.max(0, D.st.hp - (dealt - base));
            if (mine) this.focus.gain(FOCUS.hitGain);
            A.st.comboTimer = cancelWindowSec(BASELINE_RATINGS);
            A.landed.push(key); if (A.landed.length > 6) A.landed.shift();
            const route = routeFor(A.landed, BASELINE_RATINGS);
            if (route) { const bonus = Math.max(1, Math.round(dealt * (route.payoff - 1) * damageScale(BASELINE_RATINGS))); D.st.hp = Math.max(0, D.st.hp - bonus); A.landed.length = 0; }
          } else {
            if (counter > 1) { this.meCounter = 0; D.st.hp = Math.max(0, D.st.hp - (Math.round(base * counter) - base)); }
            if (mine && this.focus.active) D.st.hp = Math.max(0, D.st.hp - Math.round(atk.dmg * (FOCUS.damageMult - 1)));
            if (mine) this.focus.gain(FOCUS.hitGain);
            A.st.comboTimer = cancelWindowSec(BASELINE_RATINGS);
            A.landed.push(key); if (A.landed.length > 6) A.landed.shift();
            const route = routeFor(A.landed, BASELINE_RATINGS);
            if (route) { const bonus = Math.max(1, Math.round(atk.dmg * (route.payoff - 1) * damageScale(BASELINE_RATINGS))); D.st.hp = Math.max(0, D.st.hp - bonus); A.landed.length = 0; }
          }
          this.endStrike(!mine);   // beatHit ends the defender's swing
          if (mine && move?.launch) this.foeLaunched = 0.9; else if (mine && move?.air && !move.slam) this.foeLaunched = Math.max(this.foeLaunched, 0.5); else if (mine && move?.slam) this.foeLaunched = 0;
          // knockback (KVS: no ring check; Mixed: the slide's end checks the ring, then the KO)
          const kx = D.p.x - A.p.x, kz = D.p.z - A.p.z, kl = Math.hypot(kx, kz);
          const done = (): void => {
            if (this.mode === 'mixed' && offEdge(D.p, this.arena)) { this.end(mine, 'ringout'); return; }
            if (this.mode === 'mixed' && D.st.hp <= 0) this.end(mine, 'ko');
          };
          if (kl > 1e-3) {
            const kt = knockTo(D.p, { x: D.p.x + (kx / kl) * atk.knockback, z: D.p.z + (kz / kl) * atk.knockback }, this.arena);
            this.knock.start(D.p, kt.x, kt.z, this.mode === 'mixed' ? done : undefined);
          } else if (this.mode === 'mixed') done();
          if (this.mode === 'kvs' && D.st.hp <= 0) this.end(mine, 'ko');
          break;
        }
        default: break;
      }
    };
    if (mine) this.meT.after(hitDelay / 1000, onHit); else this.foeT.after(atk.startupMs / 1000, onHit);
  }

  private endStrike(mine: boolean): void {
    const f = mine ? this.me : this.foe;
    f.striking = false; f.impactAt = null; f.cancelFrom = null;
    if (!mine) this.foeImpactAt = null;
  }

  private tryDash(homing: boolean, pad: Pad): void {
    if (!this.me.st.controllable || !this.evade.canAct) return;
    if (this.meDash && !(homing && !this.meDash.homing)) return;
    if (!stormDashReady(this.lastDashSec, this.now / 1000, homing)) return;
    if (this.me.striking) { if (this.me.cancelFrom !== null && this.now < this.me.cancelFrom) return; this.endStrike(true); }
    const tx = this.foe.p.x - this.me.p.x, tz = this.foe.p.z - this.me.p.z, tl = Math.hypot(tx, tz) || 1;
    const wl = Math.hypot(pad.wx, pad.wz);
    const [dx, dz] = homing || wl < 0.25 ? [tx / tl, tz / tl] : [pad.wx / wl, pad.wz / wl];
    this.meDash = { dx, dz, left: homing ? DASH.homingMaxSec : DASH.sec, homing };
    this.meDashIframe = DASH.iframes; this.lastDashSec = this.now / 1000;
  }

  private step(): void {
    const me = this.me, foe = this.foe;
    this.now += DT * 1000;
    // the parry slow-mo scales the mode's clock; Matrix Focus splits it
    this.slowmo = Math.max(0, this.slowmo - DT);
    const sdt = this.slowmo > 0 ? DT * 0.3 : DT;
    const pad0 = this.agent.pad;
    if (pad0.focus && !this.focus.active) this.focus.start(); else if (!pad0.focus && this.focus.active) this.focus.stop();
    this.focus.tick(DT);
    const sdtRoom = sdt * this.focus.worldScale, sdtHero = sdt * this.focus.heroScale;
    this.knock.tick(sdtRoom);
    this.meT.tick(sdtHero); this.foeT.tick(sdtRoom);
    if (this.roundOver) return;
    me.st.tick(sdtHero); foe.st.tick(sdtRoom);
    if (me.st.combo === 0 && me.landed.length) me.landed = [];
    if (foe.st.combo === 0 && foe.landed.length) foe.landed = [];
    // swings settle (the tree's settle)
    if (me.striking && this.now >= me.strikeEnd) this.endStrike(true);
    if (foe.striking && this.foeT.t >= foe.strikeEnd) this.endStrike(false);

    // ── the player's pad ──
    const dist = Math.hypot(foe.p.x - me.p.x, foe.p.z - me.p.z);
    if (this.mirror) { this.mirrorStep(sdtHero); if (this.roundOver) return; }
    const o = this.observe(dist);
    const pad = this.mirror ? this.agent.pad : this.agent.frame(o);
    if (pad.xDown && me.st.controllable) { me.st.pressBlock(this.now); this.xDownAt = this.now; }
    if (pad.xUp && this.xDownAt >= 0) {
      const held = this.now - this.xDownAt; this.xDownAt = -1;
      me.st.releaseBlock();
      if (held < DASH.tapSec * 1000) { const dbl = this.now - this.lastTapAt <= DASH.doubleSec * 1000; this.lastTapAt = dbl ? -1e9 : this.now; this.tryDash(dbl, pad); }
    }
    if (pad.l1 && me.st.controllable) {
      const tx = me.p.x - foe.p.x, tz = me.p.z - foe.p.z, l = Math.hypot(tx, tz) || 1;
      const wl = Math.hypot(pad.wx, pad.wz);
      const [rx, rz] = wl > 0.2 ? [pad.wx / wl, pad.wz / wl] : [tx / l, tz / l];
      if (this.evade.roll(rx, rz)) {
        const secRaw = this.foeImpactAt === null ? null : (this.foeImpactAt - this.now) / 1000;
        const gate = threatLandsIn(dist, this.foeRange, secRaw);
        const r = dodgeReward(gate < 0 ? null : gate);
        if (r.perfect) { this.focus.gain(FOCUS.dodgeGain); this.meCounter = r.counterSec; }
      }
    }
    if (pad.press && me.st.controllable) this.swing(true, BTN_KEY[pad.press], pad);

    // ── my movement ──
    const SPEED = this.mode === 'kvs' ? 3.4 : 3.3;
    const rollVel = this.evade.update(sdtHero);
    this.meCounter = tickCounter(this.meCounter, sdtHero);
    if (this.meDash) {
      const d = this.meDash;
      if (d.homing) { const tx = foe.p.x - me.p.x, tz = foe.p.z - me.p.z, l = Math.hypot(tx, tz); if (l <= DASH.homingStopM) d.left = 0; else { d.dx = tx / l; d.dz = tz / l; } }
      const k = (d.homing ? DASH.homingSpeed : DASH.speed) * sdtHero;
      me.p.x += d.dx * k; me.p.z += d.dz * k; arenaClamp(me.p, this.arena);
      if (this.mode === 'mixed' && offEdge(me.p, this.arena)) { this.end(false, 'ringout'); return; }
      d.left -= sdtHero; if (d.left <= 0) this.meDash = null;
    } else if (rollVel) {
      me.p.x += rollVel.x * sdtHero; me.p.z += rollVel.z * sdtHero; arenaClamp(me.p, this.arena);
      if (this.mode === 'mixed' && offEdge(me.p, this.arena)) { this.end(false, 'ringout'); return; }
    } else if (me.st.controllable && !me.striking && !me.st.blockHeld) {
      const sp = this.mirror ? (this.mode === 'kvs' ? 3.4 * 0.92 : 3.3 * 0.9) : SPEED;
      me.p.x += pad.wx * sp * sdtHero; me.p.z += pad.wz * sp * sdtHero; arenaClamp(me.p, this.arena);
      if (this.mode === 'mixed' && offEdge(me.p, this.arena)) { this.end(false, 'ringout'); return; }
    }
    this.meDashIframe = Math.max(0, this.meDashIframe - sdtHero);
    if (this.queued) {
      if (this.now - this.queued.at > 400) this.queued = null;
      else if (!me.striking || (me.cancelFrom !== null && this.now >= me.cancelFrom)) { const k = this.queued.key; this.queued = null; this.swing(true, k, pad); }
    }
    if (this.foeLaunched > 0) this.foeLaunched = Math.max(0, this.foeLaunched - sdtRoom);

    // ── the rival ──
    const meOpen = !!this.meDash || this.evade.rolling || (me.striking && me.impactAt !== null && this.now > me.impactAt);
    let ax: number, ay: number, attack: 'jab' | 'kick' | 'heavy' | null, block: boolean, guard: ReturnType<RivalFightBrain['decide']>['guard'], spend: string | null = null;
    if (this.brainC) {
      this.foeRes.value = foe.st.chi;
      const a = this.brainC.decide(sdtRoom, foe.p, me.p, foe.st, me.striking, this.mirror ? undefined : this.foeRes, -1, meOpen);
      ax = a.moveX; ay = a.moveY; attack = a.attack; block = a.block; guard = a.guard; spend = a.spend;
    } else {
      const a = this.brainF!.decide(sdtRoom, foe.p, me.p, foe.st, me.striking, meOpen);
      ax = a.moveX; ay = a.moveY; attack = a.attack; block = a.block; guard = a.guard ?? null;
    }
    if (block && !foe.st.blockHeld) foe.st.pressBlock(guardPressMs(this.now, guard, me.impactAt !== null ? me.impactAt - this.now : null));
    if (!block && foe.st.blockHeld) foe.st.releaseBlock();
    if (attack) this.swing(false, attack);
    if (this.roundOver) return;
    if (spend === 'dash' && !this.foeDash && foe.st.controllable && !foe.striking && foe.st.chi >= 12) {
      const tx = me.p.x - foe.p.x, tz = me.p.z - foe.p.z, l = Math.hypot(tx, tz);
      if (l > 1e-3) { foe.st.chi -= 12; this.foeDash = { dx: tx / l, dz: tz / l, left: DASH.sec }; }
    }
    const FSPEED = this.mode === 'kvs' ? 3.4 * 0.92 : 3.3 * 0.9;
    if (this.foeDash) {
      const st = DASH.speed * sdtRoom;
      foe.p.x += this.foeDash.dx * st; foe.p.z += this.foeDash.dz * st; arenaClamp(foe.p, this.arena);
      this.foeDash.left -= sdtRoom;
      if (this.foeDash.left <= 0 || Math.hypot(me.p.x - foe.p.x, me.p.z - foe.p.z) <= DASH.homingStopM || !foe.st.controllable) this.foeDash = null;
    } else if (foe.st.controllable && !foe.striking && !foe.st.blockHeld) {
      foe.p.x += ax * FSPEED * sdtRoom; foe.p.z += -ay * FSPEED * sdtRoom;
      arenaClamp(foe.p, this.arena);
      if (this.mode === 'mixed' && this.arena.edge === 'drop' && insideBy(foe.p, this.arena.shape) < 0.3) {
        const sh = this.arena.shape;
        if (sh.kind === 'disc') { const r = Math.hypot(foe.p.x, foe.p.z) || 1; foe.p.x *= (sh.radius - 0.3) / r; foe.p.z *= (sh.radius - 0.3) / r; }
        else { foe.p.x = Math.max(-(sh.halfX - 0.3), Math.min(sh.halfX - 0.3, foe.p.x)); foe.p.z = Math.max(-(sh.halfZ - 0.3), Math.min(sh.halfZ - 0.3, foe.p.z)); }
      }
    }
    // bodies do not overlap (the rigs' capsules)
    const sx = foe.p.x - me.p.x, sz = foe.p.z - me.p.z, sl = Math.hypot(sx, sz);
    if (sl < 0.6 && !this.knock.sliding(foe.p) && !this.knock.sliding(me.p)) {
      const ux = sl > 1e-3 ? sx / sl : 0, uz = sl > 1e-3 ? sz / sl : 1, push = (0.6 - sl) / 2;
      foe.p.x += ux * push; foe.p.z += uz * push; me.p.x -= ux * push; me.p.z -= uz * push;
    }
    // facing: a striker is committed (Mixed G1); otherwise the lock-on turns
    if (!me.striking) me.yaw = slew(me.yaw, yawTo(me.p, foe.p), TURN_RATE, DT);
    if (!foe.striking) foe.yaw = slew(foe.yaw, yawTo(foe.p, me.p), TURN_RATE, DT);
  }

  /** the MIRROR control: the player is the rival's brain (its guard stamped as the rival's is) */
  private mirrorStep(sdt: number): void {
    const me = this.me, foe = this.foe;
    const foeOpen = !!this.foeDash || (foe.striking && foe.impactAt !== null && this.now > foe.impactAt);
    const a = this.mirrorBrain!.decide(sdt, me.p, foe.p, me.st, foe.striking, foeOpen);
    if (a.block && !me.st.blockHeld) me.st.pressBlock(guardPressMs(this.now, a.guard, this.foeImpactAt !== null ? this.foeImpactAt - this.now : null));
    if (!a.block && me.st.blockHeld) me.st.releaseBlock();
    const pad = this.agent.pad;
    pad.wx = a.moveX; pad.wz = -a.moveY; pad.press = null; pad.xDown = false; pad.xUp = false; pad.l1 = false; pad.focus = false;
    if (a.attack && !me.striking) this.swing(true, a.attack);
  }

  private observe(dist: number): Obs {
    const me = this.me, foe = this.foe;
    const o = this.obs ?? (this.obs = {} as Obs);
    o.now = this.now; o.me = me.p; o.foe = foe.p; o.dist = dist;
    o.myReach = 1.55;
    o.foeSwingId = this.foeSwingId;
    o.foeImpactIn = this.foeImpactAt !== null ? this.foeImpactAt - this.now : -1;
    o.foeSwingRange = this.foeRange;
    o.foeOpen = !foe.st.controllable || (foe.striking && foe.impactAt !== null && this.now > foe.impactAt);
    o.foeBlocking = foe.st.blockHeld;
    o.myCommitted = me.striking && me.impactAt !== null && this.now < me.impactAt;
    o.myBusy = me.striking; o.myCanAct = me.st.controllable && this.evade.canAct && !this.meDash;
    o.myOutSeq = this.myOutSeq; o.myOut = this.myOut; o.mySwingSeq = this.mySwingSeq;
    o.arena = this.arena; o.focusValue = this.focus.value;
    o.specialReady = this.mode === 'mixed' && me.st.chi >= CHI_MAX; o.specialReach = SPECIAL_ATTACK.range - 0.1;
    o.assistReady = false; o.subReady = false; o.dashKind = 'storm'; o.canRoll = this.evade.rollReady;
    return o;
  }
}

// ── ENGINE S: Showdown, Duel ────────────────────────────────────────────────────────────────────────────────────────
const RIVAL_SET: Record<SimWeapon, () => Record<string, CombatMove>> = {
  fists: () => karateMoveset(KARATE_ATTACKS), staff: () => staffMoveset(STAFF_ATTACKS), blade: () => bladeMoveset(),
};
const MY_SET: Record<SimWeapon, () => Record<string, CombatMove>> = {
  fists: () => bookMoveset(KARATE_ATTACKS), staff: () => staffMoveset(STAFF_ATTACKS), blade: () => stringRule(bladeMoveset()),
};
const brainMoves = (set: Record<string, CombatMove>) => Object.entries(set).map(([id, m]) => ({ id, kind: m.weight === 'light' ? 'jab' as const : m.weight === 'medium' ? 'kick' as const : 'heavy' as const, range: m.atk.range }));

class SMatch {
  readonly arena: CombatArena;
  private agent: Agent;
  private now = 10_000;
  private me = new Vector3(0, 0, 4); private foe = new Vector3(0, 0, -4);
  private meSt = new FighterState(100); private foeSt = new FighterState(100);
  private meStrike!: StrikeController; private foeStrike!: StrikeController;
  private meDef = new DefenseController(); private foeDef = new DefenseController();
  private meMove = new CombatMovement(); private foeMove = new CombatMovement();
  private brain!: RivalCombatBrain;
  private knock = new KnockSlides();
  private focus = new FocusMeter();
  private book = new StringBook();
  private chakra = new ResourceMeter(CHAKRA); private foeChakra = new ResourceMeter(CHAKRA);
  private foeUlt = new UltimateArm();
  private myMoves!: Record<string, CombatMove>; private myIds: string[] = [];
  private myWeapon: SimWeapon; private foeWeapon: SimWeapon | null = null;
  private foeGuardUntil = 0; private guardUp = false; private xDownAt = -1; private lastTapAt = -1e9;
  private foeSubstituted = 0; private meSubstituted = 0;
  private ult: null | { by: 'me' | 'foe'; t: number } = null;
  private assistCd = 0; private assistHitAt = -1;
  private foeLaunched = 0;
  private roundOver: null | { won: boolean; how: RoundStat['how'] } = null;
  private foeSwingId = 0; private lastFoeCur: unknown = null;
  private mySwingSeq = 0; private myOutSeq = 0; private myOut = ''; private lastMyCur: unknown = null;
  private obs!: Obs;
  private foeRes: RivalResource = { value: 0, max: CHI_MAX, dashCost: 12, subCost: SUBSTITUTION_CHI_COST, subReady: true };
  private readonly mirror: boolean;
  private mirrorBrain: RivalCombatBrain | null = null;
  private meGuardUntil = 0;
  constructor(readonly mode: 'showdown' | 'duel', readonly cfg: MatchCfg) {
    this.arena = arenaFor(mode, cfg.arenaId);
    this.agent = new Agent(PROFILES[cfg.profile], mulberry32(cfg.seed * 104729 + 3), true);
    this.mirror = cfg.profile === 'mirror';
    this.myWeapon = mode === 'duel' && !this.mirror ? cfg.weapon ?? 'fists' : 'fists';
    this.myMoves = this.mirror ? karateMoveset(KARATE_ATTACKS) : styleMoveset(MY_SET[this.myWeapon](), blendTraits(PURE), MIN_STARTUP_SEC);
    if (this.mirror) this.mirrorBrain = new RivalCombatBrain({ difficulty: 0.72, canSpecial: false, moves: brainMoves(karateMoveset(KARATE_ATTACKS)) });
    this.myIds = Object.keys(this.myMoves);
    this.meStrike = new StrikeController(this.myMoves);
    if (mode === 'showdown') { this.foeStrike = new StrikeController(this.foeSet('fists')); this.brain = new RivalCombatBrain({ difficulty: 0.72, canSpecial: false, moves: brainMoves(karateMoveset(KARATE_ATTACKS)) }); }
    this.meMove.moveMode = mode === 'duel' ? 'eightWay' : 'free'; this.foeMove.moveMode = this.meMove.moveMode;
    if (mode === 'duel') { this.meMove.lockTarget = this.foe; this.foeMove.lockTarget = this.me; }
  }
  private diff(): number { return this.cfg.difficulty ?? rivalDifficulty(0.72, this.cfg.tier); }
  private foeSet(w: SimWeapon): Record<string, CombatMove> { return RIVAL_SET[w](); }
  private pw: Pw = UNIT;
  private edgeIn = (x: number, z: number): number => insideBy({ x, z }, this.arena.shape);

  run(): MatchResult {
    let myWins = 0, foeWins = 0, round = 1, rivalWonLast = false; let lastFoe: SimWeapon | null = null;
    const rounds: RoundStat[] = [];
    while (myWins < 2 && foeWins < 2) {
      if (this.mode === 'duel') {
        const fw: SimWeapon = this.mirror ? 'fists' : rivalWeaponFor(round, this.myWeapon as DuelWeapon, lastFoe as DuelWeapon | null, rivalWonLast) as SimWeapon;
        if (fw !== this.foeWeapon) { this.foeWeapon = fw; this.foeStrike = new StrikeController(this.foeSet(fw)); this.brain = new RivalCombatBrain({ difficulty: 0.72, canSpecial: false, moves: brainMoves(RIVAL_SET[fw]()) }); }
        lastFoe = fw;
      }
      const r = this.round(myWins, foeWins);
      rounds.push(r);
      if (r.won) myWins++; else foeWins++;
      rivalWonLast = !r.won; round++;
    }
    return { won: myWins > foeWins, myWins, foeWins, rounds };
  }

  private round(myWins: number, foeWins: number): RoundStat {
    this.meSt.resetRound(); this.foeSt.resetRound();
    const sz = this.mode === 'duel' ? 2.4 : 4;
    this.me.set(0, 0, sz); this.foe.set(0, 0, -sz);
    this.meMove.vel.setAll(0); this.foeMove.vel.setAll(0);
    this.meDef.releaseBlock(); this.foeDef.releaseBlock(); this.guardUp = false; this.xDownAt = -1;
    this.book.reset(); this.focus.stop(); this.foeUlt.clear(); this.foeSubstituted = 0; this.meSubstituted = 0;
    this.ult = null; this.foeLaunched = 0; this.roundOver = null; this.knock.clear(); this.agent.reset(); this.assistHitAt = -1;
    this.meStrike.swapMoveset(this.myMoves); this.foeStrike.swapMoveset(this.foeSet(this.mode === 'duel' ? this.foeWeapon! : 'fists'));
    this.pw = this.mirror ? UNIT : powerFor(this.mode, this.cfg.tier, this.cfg.powerBase, this.myWeapon);
    this.foeSt.maxHp = Math.round(100 * this.pw.hp); this.foeSt.guardTaken = this.pw.guardTaken; this.foeSt.hp = this.foeSt.maxHp;
    this.brain.setStanding(foeWins, myWins, 2);
    this.brain.setDifficulty(this.diff());
    if (!this.mirror) noStep(this.brain, this.mode);
    if (this.mode === 'duel' && !this.mirror) foeReach(this.brain, weaponById(this.myWeapon).reach);
    if (this.mode === 'duel') this.brain.setEdge(this.edgeIn);
    if (this.mirrorBrain) { this.mirrorBrain.setStanding(myWins, foeWins, 2); this.mirrorBrain.setDifficulty(this.diff()); if (this.mode === 'duel') this.mirrorBrain.setEdge(this.edgeIn); }
    const limit = this.mode === 'duel' ? DUEL.roundSec : 150;
    let t = 0;
    while (t < limit && !this.roundOver) { this.step(); t += DT; }
    const ro = this.roundOver ?? { won: this.meSt.hp >= this.foeSt.hp, how: 'time' as const };
    return { won: ro.won, how: ro.how, secs: t, myHp: this.meSt.hp, foeHp: this.foeSt.hp };
  }
  private end(won: boolean, how: RoundStat['how']): void { if (!this.roundOver) this.roundOver = { won, how }; }

  private ringOut(): boolean {
    if (this.mode !== 'duel') return false;
    arenaClamp(this.me, this.arena); arenaClamp(this.foe, this.arena);
    if (offEdge(this.foe, this.arena)) { this.end(true, 'ringout'); return true; }
    if (offEdge(this.me, this.arena)) { this.end(false, 'ringout'); return true; }
    return false;
  }

  private resolve(mine: boolean): void {
    const A = mine ? this.me : this.foe, D = mine ? this.foe : this.me;
    const aSt = mine ? this.meSt : this.foeSt, dSt = mine ? this.foeSt : this.meSt;
    const dCtrl = mine ? this.foeDef : this.meDef;
    const sc = mine ? this.meStrike : this.foeStrike;
    if (!sc.current || !sc.current.hitLive) return;
    const move = sc.current.move;
    const ult = !mine ? this.foeUlt.take(sc.current) : false;
    sc.current.consumeHit();
    const dist = Vector3.Distance(A, D);
    if (!mine && this.meMove.dashIFrames) { this.foeSt.staggerSec = Math.max(this.foeSt.staggerSec, 0.45); return; }
    const action = dCtrl.resolve(move.atk, dist, dSt.blockHeld, this.now);
    const out = applyDefenseOutcome(action, aSt, dSt, move.atk);
    if (mine) { this.myOutSeq = this.mySwingSeq; this.myOut = out; }
    if (this.mode === 'showdown') {
      const g = attackerChakraGain(out); if (g) (mine ? this.chakra : this.foeChakra).gain(g);
      if (out === 'parried') { (mine ? this.foeChakra : this.chakra).gain('parry'); if (!mine) this.focus.gain(FOCUS.dodgeGain); }
      if (out === 'guardImpacted') { (mine ? this.foeChakra : this.chakra).gain('guardImpact'); if (!mine) this.focus.gain(FOCUS.dodgeGain); }
    } else {
      const g = chiForOutcome(out, move.atk.chiGain); if (g) aSt.chi = Math.min(CHI_MAX, aSt.chi + g);
      if ((out === 'parried' || out === 'guardImpacted') && !mine) this.focus.gain(FOCUS.dodgeGain);
    }
    if (out !== 'hit') return;
    if (this.mode === 'showdown' && ult) { this.ult = { by: 'foe', t: 0 }; return; }
    const crit = this.mode === 'duel' && ult ? DUEL.critMult : 1;
    const scale = Math.max(0.4, 1 - 0.12 * aSt.combo);
    const dealt = Math.round(move.atk.dmg * scale * crit * (mine ? 1 : this.pw.dmg) * (mine && this.focus.active ? FOCUS.damageMult : 1) * dCtrl.counterMult(this.now));
    if (mine) this.focus.gain(FOCUS.hitGain);
    dSt.hp = Math.max(0, dSt.hp - dealt);
    dSt.stunSec = Math.max(dSt.stunSec, move.atk.stunSec);
    aSt.combo += 1; aSt.comboTimer = 1.1;
    const kx = D.x - A.x, kz = D.z - A.z, kl = Math.hypot(kx, kz);
    if (kl > 1e-3) { const kt = knockTo(D, { x: D.x + (kx / kl) * move.atk.knockback * crit, z: D.z + (kz / kl) * move.atk.knockback * crit }, this.arena); this.knock.start(D, kt.x, kt.z); }
    if (mine && move.launch) this.foeLaunched = 0.9; else if (mine && move.air && !move.slam) this.foeLaunched = Math.max(this.foeLaunched, 0.5); else if (mine && move.slam) this.foeLaunched = 0;
    if (this.ringOut()) return;
    if (dSt.hp <= 0) this.end(mine, 'ko');
  }

  private resolveUlt(): void {
    const mine = this.ult!.by === 'me';
    const A = mine ? this.me : this.foe, D = mine ? this.foe : this.me, dSt = mine ? this.foeSt : this.meSt;
    this.ult = null;
    if (ultimateReaches(Vector3.Distance(A, D))) {
      dSt.hp = Math.max(0, dSt.hp - Math.round(SHOWDOWN.ultDmg * (mine ? 1 : this.pw.dmg))); dSt.staggerSec = 1.6;
      const kx = D.x - A.x, kz = D.z - A.z, kl = Math.hypot(kx, kz) || 1;
      const kt = knockTo(D, { x: D.x + (kx / kl) * SHOWDOWN.ultLaunchM, z: D.z + (kz / kl) * SHOWDOWN.ultLaunchM }, this.arena);
      this.knock.start(D, kt.x, kt.z, undefined, SHOWDOWN.ultLaunchMps);
      if (dSt.hp <= 0) this.end(mine, 'ko');
    }
  }

  private step(): void {
    this.now += DT * 1000;
    const pad0 = this.agent.pad;
    if (pad0.focus && !this.focus.active && !this.ult) this.focus.start(); else if (!pad0.focus && this.focus.active) this.focus.stop();
    this.focus.tick(DT);
    const sdtRoom = DT * this.focus.worldScale, sdtHero = DT * this.focus.heroScale;
    this.knock.tick(sdtRoom);
    if (this.mode === 'showdown') { this.chakra.update(DT); this.foeChakra.update(DT); this.assistCd = Math.max(0, this.assistCd - DT); }
    // the X hold raises the guard (Storm X)
    if (this.xDownAt >= 0 && !this.guardUp && this.now - this.xDownAt >= DASH.tapSec * 1000 && this.meSt.controllable) { this.guardUp = true; this.meDef.pressBlock(this.now, false); this.meSt.pressBlock(this.now); }
    this.meSt.tick(sdtHero); this.foeSt.tick(sdtRoom);
    if (this.ult) {
      this.ult.t += DT;
      const a = this.ult.by === 'me' ? this.me : this.foe, b = this.ult.by === 'me' ? this.foe : this.me;
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), st = ultLungeStep(d, DT);
      if (st > 0) { a.x += (dx / d) * st; a.z += (dz / d) * st; }
      if (this.ult.t > SHOWDOWN.ultCutSec) this.resolveUlt();
      return;
    }
    if (this.assistHitAt > 0 && this.now >= this.assistHitAt) {
      this.assistHitAt = -1;
      if (this.foeSt.controllable) { this.foeSt.hp = Math.max(0, this.foeSt.hp - 8); this.foeSt.stunSec = Math.max(this.foeSt.stunSec, 0.5); this.meSt.combo += 1; this.meSt.comboTimer = 1.1; this.chakra.gain('hitLanded'); if (this.foeSt.hp <= 0) { this.end(true, 'ko'); return; } }
    }

    // ── the player's pad ──
    const dist = Vector3.Distance(this.me, this.foe);
    if (this.mirror) this.mirrorStep(dist);
    const o = this.observe(dist);
    const pad = this.mirror ? this.agent.pad : this.agent.frame(o);
    const ctl = this.meSt.controllable && !this.mirror;
    if (pad.xDown && ctl) {
      this.xDownAt = this.now;
      if (pad.flick) { this.meDef.pressBlock(this.now, true); this.meSt.pressBlock(this.now); this.guardUp = true; }
    }
    if (pad.xUp && this.xDownAt >= 0) {
      const held = this.now - this.xDownAt; this.xDownAt = -1;
      if (this.guardUp || held >= DASH.tapSec * 1000) { this.meDef.releaseBlock(); this.meSt.releaseBlock(); this.guardUp = false; }
      if (held < DASH.tapSec * 1000) {
        const dbl = this.now - this.lastTapAt <= DASH.doubleSec * 1000; this.lastTapAt = dbl ? -1e9 : this.now;
        const wl = Math.hypot(pad.wx, pad.wz), tx = this.foe.x - this.me.x, tz = this.foe.z - this.me.z;
        const [ddx, ddz] = !dbl && wl > 0.25 ? [pad.wx, pad.wz] : [tx, tz];
        if (this.meSt.controllable) this.meMove.dash(ddx, ddz, dbl);
      }
    }
    if (ctl && pad.press) {
      if (this.mode === 'showdown' && pad.press === 'Y' && this.chakra.full) {
        if (ultimateReaches(dist) && this.chakra.spendUltimate()) { this.ult = { by: 'me', t: 0 }; return; }
      } else if (this.myWeapon === 'fists') {
        const mv = this.book.press(pad.press, this.stickDir(pad), this.now / 1000, { afterDash: this.meMove.dashing, air: this.foeLaunched > 0 });
        if (this.meStrike.request(mv.id, this.now)) { /* thrown */ }
      } else {
        this.meStrike.request(this.myIds[pad.press === 'A' ? 0 : pad.press === 'B' ? 1 : 2], this.now);
      }
    }
    if (ctl && pad.r1 && this.mode === 'showdown') {
      const fs = this.foeStrike.current && this.foeStrike.current.phase !== 'done';
      if (fs && dist <= 3 && this.meDef.canSubstitute(this.chakra.value, this.now)) {
        this.chakra.spend(SUBSTITUTION_CHI_COST); this.meDef.spendSubstitution(this.now); this.meSubstituted = this.now + 400;
        const spot = DefenseController.substitutionSpot(this.foe, yawTo(this.foe, this.me));
        this.me.copyFrom(spot); arenaClamp(this.me, this.arena);
      }
    }
    if (pad.select && this.mode === 'showdown' && this.assistCd <= 0) { this.assistCd = 9; this.assistHitAt = this.now + 350; }

    // ── my movement ──
    if (this.mirror) { /* mirrorStep moved me */ }
    else if (this.mode === 'showdown') {
      if (this.meSt.controllable && !this.meStrike.busy) this.meMove.update(DT, pad.wx, -pad.wz, false); else this.meMove.update(DT, 0, 0, false);
    } else {
      if (this.meSt.controllable && !this.meStrike.busy && !this.meDef.blocking) this.meMove.updateWithSelf(DT, 0, 0, false, this.me, new Vector3(pad.wx, 0, pad.wz));
      else this.meMove.updateWithSelf(DT, 0, 0, false, this.me);
    }
    this.me.x += this.meMove.vel.x * DT; this.me.z += this.meMove.vel.z * DT;
    if (this.mode === 'showdown') arenaClamp(this.me, this.arena);

    // ── the rival ──
    this.rival(sdtRoom, dist);
    if (this.roundOver) return;

    // ── strikes ──
    if (this.meStrike.current !== this.lastMyCur) { this.lastMyCur = this.meStrike.current; if (this.meStrike.current) this.mySwingSeq++; }
    if (this.meStrike.update(DT, this.now).startedActive) {
      if (this.now < this.foeSubstituted) this.meStrike.current?.consumeHit();
      else this.resolve(true);
    }
    if (this.roundOver) return;
    if (this.foeStrike.update(sdtRoom, this.now).startedActive) {
      if (this.now < this.meSubstituted) this.foeStrike.current?.consumeHit();
      else this.resolve(false);
    }
    this.foeUlt.sync(this.foeStrike.current);
    if (this.foeStrike.current !== this.lastFoeCur) { this.lastFoeCur = this.foeStrike.current; if (this.foeStrike.current) this.foeSwingId++; }
    if (this.foeLaunched > 0) this.foeLaunched = Math.max(0, this.foeLaunched - DT);
    if (!this.roundOver) this.ringOut();
  }

  private stickDir(pad: Pad): StickDir {
    const tx = this.foe.x - this.me.x, tz = this.foe.z - this.me.z, l = Math.hypot(tx, tz), wl = Math.hypot(pad.wx, pad.wz);
    if (wl < 0.35 || l < 1e-3) return 'n';
    const c = (pad.wx * tx + pad.wz * tz) / (l * wl);
    return c > 0.4 ? 'f' : c < -0.4 ? 'b' : 'n';
  }

  /** the MIRROR control: the player is the rival's brain on the rival's plain moveset (no resource for either side) */
  private mirrorStep(dist: number): void {
    const ms = this.meSt;
    if (this.mode === 'duel' && !(ms.controllable && !this.meStrike.busy)) { this.meMove.updateWithSelf(DT, 0, 0, false, this.me); return; }
    if (!ms.controllable) { if (this.mode === 'showdown') this.meMove.update(DT, 0, 0, false); return; }
    const winding = !!this.foeStrike.current && this.foeStrike.current.phase === 'startup';
    const incoming = winding && this.foeStrike.current ? this.foeStrike.current.secToActive : -1;
    const open = this.foeStrike.current?.phase === 'recovery' || this.foeMove.dashing;
    const dec = this.mirrorBrain!.decide(DT, this.me, this.foe, ms, winding, undefined, threatLandsIn(dist, this.foeStrike.current?.move.atk.range ?? 1.8, incoming < 0 ? null : incoming), open);
    if (this.mode === 'showdown') {
      if (!this.meStrike.busy) { this.meMove.update(DT, dec.moveX, dec.moveY, false); if (dec.attackId) this.meStrike.request(dec.attackId, this.now); }
      else this.meMove.update(DT, 0, 0, false);
    } else {
      const tx = this.foe.x - this.me.x, tz = this.foe.z - this.me.z, td = Math.hypot(tx, tz);
      const dx = td > 0.05 ? tx / td : 0, dz = td > 0.05 ? tz / td : 1;
      const wx = dec.moveX, wz = -dec.moveY;
      this.meMove.updateWithSelf(DT, wx * -dz + wz * dx, wx * dx + wz * dz, false, this.me);
      if (dec.attackId) this.meStrike.request(dec.attackId, this.now);
    }
    if (dec.block && !ms.blockHeld) { const at = guardPressMs(this.now, dec.guard, incoming >= 0 ? incoming * 1000 : null); this.meDef.pressBlock(at, dec.guard === 'impact'); ms.pressBlock(at); this.meGuardUntil = this.now + 600; }
    if (!dec.block && ms.blockHeld && this.now > this.meGuardUntil) { this.meDef.releaseBlock(); ms.releaseBlock(); }
  }

  private rival(sdtRoom: number, dist: number): void {
    const fs = this.foeSt;
    const meWinding = !!this.meStrike.current && this.meStrike.current.phase === 'startup';
    const incoming = meWinding && this.meStrike.current ? this.meStrike.current.secToActive : -1;
    const meOpen = this.meStrike.current?.phase === 'recovery' || this.meMove.dashing || this.meMove.rolling;
    if (this.mode === 'showdown') {
      if (!fs.controllable) return;
      const reach = this.meStrike.current?.move.atk.range ?? 1.8;
      const dec = this.brain.decide(sdtRoom, this.foe, this.me, fs, meWinding,
        this.mirror ? undefined : { value: this.foeChakra.value, max: CHAKRA.max, dashCost: 12, subCost: SUBSTITUTION_CHI_COST, subReady: this.foeDef.canSubstitute(this.foeChakra.value, this.now) },
        threatLandsIn(dist, reach, incoming < 0 ? null : incoming), meOpen);
      let thrown = false;
      if (!this.foeStrike.busy) {
        this.foeMove.update(sdtRoom, dec.moveX, dec.moveY, dist > 6 && dec.spend !== 'dash');
        if (dec.attackId) thrown = this.foeStrike.request(dec.attackId, this.now);
      } else this.foeMove.update(sdtRoom, 0, 0, false);
      if (dec.spend === 'dash' && this.foeChakra.spend(12)) { const tx = this.me.x - this.foe.x, tz = this.me.z - this.foe.z; if (Math.hypot(tx, tz) > 0.2) this.foeMove.dash(tx, tz); }
      if (dec.spend === 'ultimate' && thrown && this.foeStrike.current && this.foeChakra.spendUltimate()) this.foeUlt.arm(this.foeStrike.current);
      if (dec.spend === 'substitution' && this.foeChakra.spend(SUBSTITUTION_CHI_COST)) {
        this.foeDef.spendSubstitution(this.now);
        const spot = DefenseController.substitutionSpot(this.me, yawTo(this.me, this.foe));
        this.foe.copyFrom(spot); this.foeSubstituted = this.now + SHOWDOWN.subWhiffMs;
      }
      if (dec.block && !fs.blockHeld) { const at = guardPressMs(this.now, dec.guard, incoming >= 0 ? incoming * 1000 : null); this.foeDef.pressBlock(at, dec.guard === 'impact'); fs.pressBlock(at); this.foeGuardUntil = this.now + 600; }
      if (!dec.block && fs.blockHeld && this.now > this.foeGuardUntil) { this.foeDef.releaseBlock(); fs.releaseBlock(); }
      this.foe.x += this.foeMove.vel.x * sdtRoom; this.foe.z += this.foeMove.vel.z * sdtRoom;
      arenaClamp(this.foe, this.arena);
      return;
    }
    // Duel: rivalTurn
    if (!(fs.controllable && !this.foeStrike.busy)) { this.foeMove.updateWithSelf(sdtRoom, 0, 0, false, this.foe); }
    else {
      const reach = this.meStrike.current?.move.atk.range ?? 2.6;
      this.foeRes.value = fs.chi; this.foeRes.subReady = this.foeDef.canSubstitute(fs.chi, this.now);
      const dec = this.brain.decide(sdtRoom, this.foe, this.me, fs, meWinding, this.mirror ? undefined : this.foeRes, threatLandsIn(dist, reach, incoming < 0 ? null : incoming), meOpen);
      const tx = this.me.x - this.foe.x, tz = this.me.z - this.foe.z, td = Math.hypot(tx, tz);
      const dx = td > 0.05 ? tx / td : 0, dz = td > 0.05 ? tz / td : 1;
      const wx = dec.moveX, wz = -dec.moveY;
      const radial = wx * dx + wz * dz, orbit = wx * -dz + wz * dx;
      this.foeMove.updateWithSelf(sdtRoom, orbit, radial, false, this.foe);
      if (dec.spend === 'dash' && fs.chi >= DUEL.rivalDashChi && this.foeMove.dash(dx, dz)) fs.chi -= DUEL.rivalDashChi;
      const thrown = dec.attackId ? this.foeStrike.request(dec.attackId, this.now) : false;
      if (dec.spend === 'ultimate' && thrown && this.foeStrike.current && fs.chi >= CHI_MAX) { fs.chi = 0; this.foeUlt.arm(this.foeStrike.current); }
      if (dec.spend === 'substitution' && fs.chi >= SUBSTITUTION_CHI_COST) {
        const spot = safeSubstitutionSpot(this.me.x, this.me.z, yawTo(this.me, this.foe), this.edgeIn);
        if (spot) { fs.chi -= SUBSTITUTION_CHI_COST; this.foeDef.spendSubstitution(this.now); this.knock.cancel(this.foe); this.foe.x = spot.x; this.foe.z = spot.z; this.foeSubstituted = this.now + DUEL.subWhiffMs; }
      }
      if (dec.block && !fs.blockHeld) { const at = guardPressMs(this.now, dec.guard, incoming >= 0 ? incoming * 1000 : null); this.foeDef.pressBlock(at, dec.guard === 'impact'); fs.pressBlock(at); this.foeGuardUntil = this.now + 600; }
      if (!dec.block && fs.blockHeld && this.now > this.foeGuardUntil) { this.foeDef.releaseBlock(); fs.releaseBlock(); }
    }
    const before = this.arena.edge === 'drop' ? insideBy(this.foe, this.arena.shape) : Infinity;
    this.foe.x += this.foeMove.vel.x * sdtRoom; this.foe.z += this.foeMove.vel.z * sdtRoom;
    if (this.arena.edge === 'drop' && holdFromEdge(this.foe, before, this.arena.shape)) this.foeMove.vel.setAll(0);
  }

  private observe(dist: number): Obs {
    const o = this.obs ?? (this.obs = {} as Obs);
    o.now = this.now; o.me = this.me; o.foe = this.foe; o.dist = dist;
    o.myReach = this.myWeapon === 'fists' ? 1.55 : Math.min(...Object.values(this.myMoves).map((m) => m.atk.range));
    const c = this.foeStrike.current;
    o.foeSwingId = this.foeSwingId + (c && c !== this.lastFoeCur ? 1 : 0);
    o.foeImpactIn = c && c.phase === 'startup' ? (c.secToActive * 1000) / this.focus.worldScale : -1;
    o.foeSwingRange = c ? c.move.atk.range : 1.8;
    o.foeOpen = !this.foeSt.controllable || c?.phase === 'recovery';
    o.foeBlocking = this.foeSt.blockHeld;
    const mc = this.meStrike.current;
    o.myCommitted = !!mc && (mc.phase === 'startup' || mc.phase === 'active');
    o.myBusy = this.meStrike.busy; o.myCanAct = this.meSt.controllable && this.meMove.canAct;
    o.myOutSeq = this.myOutSeq; o.myOut = this.myOut; o.mySwingSeq = this.mySwingSeq;
    o.arena = this.arena; o.focusValue = this.focus.value;
    o.specialReady = this.mode === 'showdown' && this.chakra.full; o.specialReach = SHOWDOWN.ultReachM - 0.2;
    o.assistReady = this.mode === 'showdown' && this.assistCd <= 0;
    o.subReady = this.mode === 'showdown' && this.meDef.canSubstitute(this.chakra.value, this.now);
    o.dashKind = 'combat'; o.canRoll = false;
    return o;
  }
}

// ── RUN ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** One match, deterministic for its seed: Math.random (the brains' own rolls) is the seeded stream for its duration. */
export function runMatch(cfg: MatchCfg): MatchResult {
  const prev = Math.random;
  Math.random = mulberry32(cfg.seed * 2654435761 + 1);
  try {
    const r = cfg.mode === 'kvs' || cfg.mode === 'mixed' ? new KMatch(cfg.mode, cfg).run() : new SMatch(cfg.mode, cfg).run();
    return r;
  } finally { Math.random = prev; }
}

export interface CellStats { n: number; winRate: number; roundWinRate: number; ringOutShare: number; timeShare: number; avgRoundSec: number; avgMyHpOnWin: number }
export function runCell(base: Omit<MatchCfg, 'seed'>, n: number, seed0 = 1): CellStats {
  let w = 0, rw = 0, rr = 0, ro = 0, to = 0, secs = 0, hpWin = 0, nWinR = 0;
  for (let i = 0; i < n; i++) {
    const m = runMatch({ ...base, seed: seed0 + i * 31 });
    if (m.won) w++;
    for (const r of m.rounds) { rr++; if (r.won) { rw++; hpWin += r.myHp; nWinR++; } if (r.how === 'ringout') ro++; if (r.how === 'time') to++; secs += r.secs; }
  }
  return { n, winRate: w / n, roundWinRate: rw / rr, ringOutShare: ro / rr, timeShare: to / rr, avgRoundSec: secs / rr, avgMyHpOnWin: nWinR ? hpWin / nWinR : 0 };
}
