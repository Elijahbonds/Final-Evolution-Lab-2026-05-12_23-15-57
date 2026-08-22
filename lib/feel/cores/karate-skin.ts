/**
 * lib/feel/cores/karate-skin.ts
 * =============================
 * M9 Step 3 — karate family (karate, karate-vs) skinned onto the Court/free-3D
 * core.
 *
 * Per the M9 archetype map, karate rides the SAME Court core as the basketball
 * family: the core provides grounded footwork (fixing waddle/idle via the
 * shared locomotion + FSM), camera and the SensoryBus. The SKIN adds the
 * combat layer the spec calls for — FSM states guard/strike/dodge/stagger,
 * ArcDrive unused, SensoryBus = hits / KO (0.3s hit-stop) / Dragon Strike
 * (crimson + slow-mo), camera = two-fighter frame + storm cam. It composes the
 * shared StateMachine + InputBuffer + SensoryBus primitives; it does NOT fork
 * or edit CourtCore.
 *
 * Headless + deterministic (internal ms clock, no Date.now). Pure logic, no
 * THREE / DOM. Proven by scripts/karate-skin-tests.ts. The live
 * components/games/karate-3d.tsx is unchanged (migration is playtest-gated).
 */

import { StateMachine, SensoryBus, feelConfig, type FeelConfig } from '../index';
import { CourtCore } from './court-core';
import type { LocoInput } from '../../loco/movement';
import {
  STRIKE_DAMAGE,
  STRIKE_TIMING_MS,
  DODGE_IFRAME_MS,
  BLOCK_WINDOW_MS,
  HIT_STUN_MS,
  SPECIAL_CHAIN_REQ,
  MAX_HP,
  LOW_HP_THRESHOLD,
  PRQ_DELTAS,
  KARATE_SENSORY,
  KARATE_SFX,
  KARATE_ARENA,
  type StrikeType,
} from './karate-constants';

/** Combat phases the karate skin declares on top of the Court core. */
export type CombatPhase = 'Neutral' | 'Guard' | 'Strike' | 'Dodge' | 'Stagger';

/** What a resolved strike did — surfaced to HUD + tests. */
export type StrikeOutcome = 'hit' | 'blocked' | 'whiff' | 'ko';

export interface KarateSensoryHook {
  (evt: keyof typeof KARATE_SENSORY, info: { attacker: number; defender: number; type: StrikeType; outcome: StrikeOutcome }): void;
}

interface PendingStrike {
  type: StrikeType;
  contactAtMs: number;
  endAtMs: number;
  resolved: boolean;
}

/** One fighter's combat + footwork state. */
export class KarateFighter {
  readonly id: number;
  readonly loco: CourtCore;
  readonly fsm: StateMachine<{ f: KarateFighter }>;

  hp = MAX_HP;
  combo = 0;
  prq = 50; // TUNE(elijah) — matches reference starting PRQ

  /** Absolute ms deadlines on the bout clock. */
  blockUntilMs = 0;
  iframeUntilMs = 0;
  stunUntilMs = 0;
  pending: PendingStrike | null = null;

  constructor(id: number, feel: FeelConfig, start: { x: number; z: number }) {
    this.id = id;
    this.loco = new CourtCore(
      { feel, bounds: KARATE_ARENA, resolveLockOn: () => null }, // ArcDrive unused
      start,
    );
    this.fsm = new StateMachine<{ f: KarateFighter }>({
      initial: 'Neutral',
      ctx: { f: this },
      states: { Neutral: {}, Guard: {}, Strike: {}, Dodge: {}, Stagger: {} },
    });
  }

  get phase(): CombatPhase {
    return this.fsm.current as CombatPhase;
  }
  get alive(): boolean {
    return this.hp > 0;
  }
  get lowHp(): boolean {
    return this.hp <= LOW_HP_THRESHOLD;
  }
  get pos() {
    return this.loco.state.pos;
  }

  /** True while a dodge's i-frames are active at bout time `now`. */
  isInvincible(now: number): boolean {
    return now < this.iframeUntilMs;
  }
  /** True while a guard window is active at bout time `now`. */
  isBlocking(now: number): boolean {
    return this.fsm.is('Guard') && now < this.blockUntilMs;
  }
  isStunned(now: number): boolean {
    return now < this.stunUntilMs;
  }
  /** A fighter can act only when neutral/guard and not mid-strike or stunned. */
  private canAct(now: number): boolean {
    return this.alive && !this.isStunned(now) && this.pending === null && !this.fsm.is('Dodge');
  }
}

export interface KarateCameraFrame {
  /** Midpoint X of the two fighters (two-fighter frame). */
  midX: number;
  targetY: number;
  /** Storm cam engages during Dragon Strike / KO slow-mo. */
  stormCam: boolean;
}

export interface KarateBoutOpts {
  feel?: FeelConfig;
  /** Wire to render-layer camera/loop for real shake + hit-stop. Omit headless. */
  sensory?: SensoryBus;
  onSensory?: KarateSensoryHook;
  /** Fighter spawn positions. // TUNE(elijah) */
  spawnA?: { x: number; z: number };
  spawnB?: { x: number; z: number };
}

/**
 * A two-fighter karate bout on the Court core. Drive with a FixedStepLoop at
 * 1/60s. Actions are issued per fighter; strikes resolve on their contact
 * frame against the opponent's live guard/dodge windows.
 */
export class KarateBout {
  readonly feel: FeelConfig;
  readonly a: KarateFighter;
  readonly b: KarateFighter;
  readonly bus: SensoryBus;
  private readonly onSensory?: KarateSensoryHook;

  /** Internal monotonic bout clock (ms) — deterministic, no Date.now. */
  private nowMs = 0;
  private stormUntilMs = 0;
  winner: number | null = null;

  camera: KarateCameraFrame = { midX: 0, targetY: 0, stormCam: false };

  constructor(opts: KarateBoutOpts = {}) {
    this.feel = opts.feel ?? feelConfig;
    this.a = new KarateFighter(0, this.feel, opts.spawnA ?? { x: -2, z: 0 });
    this.b = new KarateFighter(1, this.feel, opts.spawnB ?? { x: 2, z: 0 });
    this.bus = opts.sensory ?? new SensoryBus({ sfx: KARATE_SFX });
    this.onSensory = opts.onSensory;
  }

  private other(f: KarateFighter): KarateFighter {
    return f === this.a ? this.b : this.a;
  }

  /** Queue a strike for a fighter. Returns false if illegal (e.g. locked special). */
  strike(f: KarateFighter, type: StrikeType): boolean {
    if (this.winner !== null) return false;
    if (!f.alive || f.isStunned(this.nowMs) || f.pending || f.fsm.is('Dodge')) return false;
    if (type === 'special' && f.combo < SPECIAL_CHAIN_REQ) return false; // combo-locked Dragon Strike
    const t = STRIKE_TIMING_MS[type];
    f.pending = {
      type,
      contactAtMs: this.nowMs + t.windup,
      endAtMs: this.nowMs + t.windup + t.active + t.recovery,
      resolved: false,
    };
    f.fsm.transition('Strike');
    return true;
  }

  /** Dodge: grants i-frames for DODGE_IFRAME_MS. */
  dodge(f: KarateFighter): boolean {
    if (this.winner !== null || !f.alive || f.isStunned(this.nowMs) || f.pending) return false;
    f.iframeUntilMs = this.nowMs + DODGE_IFRAME_MS;
    f.prq = Math.min(100, f.prq + PRQ_DELTAS.dodge);
    f.fsm.transition('Dodge');
    return true;
  }

  /** Hold/release guard. Holding opens an 800ms perfect-guard window. */
  setBlock(f: KarateFighter, held: boolean): void {
    if (this.winner !== null || !f.alive || f.isStunned(this.nowMs) || f.pending) return;
    if (held) {
      f.blockUntilMs = this.nowMs + BLOCK_WINDOW_MS;
      f.fsm.transition('Guard');
    } else if (f.fsm.is('Guard')) {
      f.fsm.transition('Neutral');
    }
  }

  /** Advance one fixed step. inputs drive each fighter's footwork locomotion. */
  step(dt: number, inA: LocoInput, inB: LocoInput): void {
    this.nowMs += dt * 1000;

    // Footwork on the shared Court core (fixes waddle/idle).
    this.a.loco.step(dt, inA);
    this.b.loco.step(dt, inB);

    this._advanceFighter(this.a, dt);
    this._advanceFighter(this.b, dt);

    // Recover expired transient states back to Neutral.
    this._settle(this.a);
    this._settle(this.b);

    // Camera: two-fighter frame + storm cam during slow-mo windows.
    this.camera.midX = (this.a.pos.x + this.b.pos.x) / 2;
    this.camera.targetY = this.feel.camera.baseTargetY;
    this.camera.stormCam = this.nowMs < this.stormUntilMs;
  }

  private _advanceFighter(f: KarateFighter, _dt: number): void {
    if (!f.pending) return;
    const p = f.pending;
    if (!p.resolved && this.nowMs >= p.contactAtMs) {
      p.resolved = true;
      this._resolveStrike(f, p.type);
    }
    if (this.nowMs >= p.endAtMs) {
      f.pending = null;
      if (f.fsm.is('Strike')) f.fsm.transition('Neutral');
    }
  }

  private _settle(f: KarateFighter): void {
    if (f.fsm.is('Dodge') && this.nowMs >= f.iframeUntilMs) f.fsm.transition('Neutral');
    if (f.fsm.is('Guard') && this.nowMs >= f.blockUntilMs) f.fsm.transition('Neutral');
    if (f.fsm.is('Stagger') && this.nowMs >= f.stunUntilMs) f.fsm.transition('Neutral');
  }

  private _resolveStrike(attacker: KarateFighter, type: StrikeType): void {
    const defender = this.other(attacker);
    const dmg = STRIKE_DAMAGE[type];

    // Dodge i-frames beat everything.
    if (defender.isInvincible(this.nowMs)) {
      attacker.combo = 0; // whiff breaks the chain
      this._fire('lightHit', attacker, defender, type, 'whiff', /*emit*/ false);
      return;
    }
    // Perfect guard: chip nothing, reward defender PRQ.
    if (defender.isBlocking(this.nowMs)) {
      defender.prq = Math.min(100, defender.prq + PRQ_DELTAS.block);
      attacker.combo = 0;
      this._fire('block', attacker, defender, type, 'blocked', true);
      return;
    }

    // Clean hit.
    defender.hp = Math.max(0, defender.hp - dmg);
    attacker.combo += 1;
    attacker.prq = Math.min(100, attacker.prq + PRQ_DELTAS.strikePerHit(dmg));
    defender.prq = Math.max(0, defender.prq + PRQ_DELTAS.takeHit(dmg));
    defender.stunUntilMs = this.nowMs + HIT_STUN_MS;
    defender.fsm.transition('Stagger');

    if (defender.hp <= 0) {
      this.winner = attacker.id;
      this.stormUntilMs = this.nowMs + HIT_STUN_MS;
      this._fire('ko', attacker, defender, type, 'ko', true);
      return;
    }
    if (type === 'special') {
      attacker.combo = 0; // spend the chain on the Dragon Strike
      this.stormUntilMs = this.nowMs + HIT_STUN_MS; // crimson + slow-mo window
      this._fire('dragonStrike', attacker, defender, type, 'hit', true);
      return;
    }
    const preset = type === 'light' ? 'lightHit' : 'heavyHit';
    this._fire(preset, attacker, defender, type, 'hit', true);
  }

  private _fire(
    evt: keyof typeof KARATE_SENSORY,
    attacker: KarateFighter,
    defender: KarateFighter,
    type: StrikeType,
    outcome: StrikeOutcome,
    emit: boolean,
  ): void {
    if (emit) this.bus.emit(KARATE_SENSORY[evt]);
    this.onSensory?.(evt, { attacker: attacker.id, defender: defender.id, type, outcome });
  }

  /** Seconds elapsed on the bout clock (for match-timer HUD). */
  get elapsedSeconds(): number {
    return this.nowMs / 1000;
  }
}

export default KarateBout;
