/**
 * lib/feel/cores/story-core.ts
 * ============================
 * M9 Step 17 — Board/Story archetype core (6th feel family).
 *
 * A faithful, headless, deterministic TypeScript port of the engineering-line
 * StoryMode (reference__StoryMode.js, itself from the C++ story_mode.h): a
 * token hops around a looping board (BOARD_SPACES), landing on spaces that
 * grant shards, cost HP, or trigger a zone boss fight. Defeat all four zone
 * bosses to complete the story.
 *
 * This is the ARCHETYPE for the Board/Story family — a turn-based board runner
 * whose motion is an ArcDrive hop and whose lifecycle is a StateMachine. It is
 * built entirely on ALREADY-PORTED shared systems (ArcDrive, StateMachine,
 * SensoryBus); it forks no other core and edits no other mode.
 *
 * DONOR FIDELITY: the board layout + boss roster live in story-board-data.ts
 * and are preserved verbatim (donor values, NOT tunables). The feel numbers
 * that dress the board (hop arc, damage ranges, cooldowns, HP) live in
 * story-constants.ts and are every one // TUNE(elijah).
 *
 * DETERMINISM: all randomness (d6 rolls, strike/boss damage) flows through an
 * injected `rng: () => number` (default Math.random) so the harness can seed a
 * PRNG and assert identical runs.
 *
 * UNITS: tick(dtSec) takes SECONDS, matching the donor _fixedUpdate and the
 * ArcDrive / StateMachine time base (both advance in seconds).
 */

import {
  StateMachine,
  ArcDrive,
  SensoryBus,
  type Vec3,
  type SensoryEvent,
} from '../index';
import {
  BOARD_SPACES,
  ZONE_BOSSES,
  TOTAL_BOSSES,
  type BoardSpace,
  type Zone,
} from './story-board-data';

// ---- Phases -------------------------------------------------------------

/** Story lifecycle phases (donor StoryPhase). */
export type StoryPhase =
  | 'traversal' // waiting for a roll
  | 'moving' // token is hopping between spaces
  | 'boss' // a zone boss fight is active
  | 'defeated' // a boss was just cleared (brief hold before traversal)
  | 'complete'; // all bosses defeated — story won

// ---- Sensory ------------------------------------------------------------

export type StorySensoryEvent =
  | 'roll' // dice rolled
  | 'hop' // one board hop begins
  | 'land' // landed on a plain scoring space (rail/flight)
  | 'bonus' // landed on a shard-bonus space
  | 'carnival' // landed on a carnival space (bonus + extra roll)
  | 'obstacle' // landed on an obstacle (HP damage)
  | 'bossEncounter' // stepped onto a live boss tile
  | 'strike' // player struck the boss
  | 'bossDamage' // boss attacked the player
  | 'retreat' // player HP hit zero — retreat to start
  | 'bossDefeated' // a zone boss was cleared
  | 'complete'; // final boss cleared — story complete

// ---- Tuning -------------------------------------------------------------

/**
 * Board/Story feel knobs. The donor kept these in `feelConfig.story`, which was
 * NOT among the ported feel systems, so every value is fresh scaffolding for
 * Elijah. All // TUNE(elijah) — see story-constants.ts.
 */
export interface StoryTuning {
  startHp: number;
  retreatHp: number;
  hopApexBonus: number; // extra apex height above the taller of start/target (m)
  hopDurationMs: number; // per-hop arc duration
  bossFirstAttackS: number; // grace before a boss's first swing
  bossAttackBaseS: number; // base cadence between boss swings (÷ aggression)
  bossDmgMin: number;
  bossDmgMax: number;
  strikeCooldownS: number; // min seconds between player strikes
  strikeMin: number;
  strikeMax: number;
  bossShardBonus: number; // shards awarded for clearing a boss
  defeatedHoldMs: number; // pause on the DEFEATED screen before traversal
}

// ---- Skin ---------------------------------------------------------------

export interface StoryBossInfo {
  name: string;
  hp: number;
  maxHp: number;
  zone: Zone;
  aggression: number;
  final: boolean;
}

export interface StorySkin {
  tuning: StoryTuning;
  /** SFX/shake presets per story event. */
  sensory?: Partial<Record<StorySensoryEvent, SensoryEvent>>;
  onSensory?: (
    evt: StorySensoryEvent,
    info: { pos: Vec3; space?: BoardSpace; boss?: StoryBossInfo | null; roll?: number },
  ) => void;
  onPhase?: (from: StoryPhase, to: StoryPhase) => void;
  onSpace?: (space: BoardSpace, index: number) => void;
  onBoss?: (boss: StoryBossInfo | null) => void;
  onComplete?: (state: StoryState) => void;
}

// ---- State --------------------------------------------------------------

export interface StoryState {
  phase: StoryPhase;
  shards: number;
  hp: number;
  tokenIndex: number;
  tokenPos: Vec3;
  hopsLeft: number;
  lastRoll: number;
  extraRoll: boolean; // a carnival landing grants one more roll
  boss: StoryBossInfo | null;
  bossesDefeated: number;
  bossesTotal: number;
  clearedZones: Zone[];
  lastSpace: BoardSpace | null;
  finished: boolean;
}

function cloneVec(v: { x: number; y: number; z: number }): Vec3 {
  return { x: v.x, y: v.y, z: v.z };
}

// ---- Core ---------------------------------------------------------------

export class StoryCore {
  readonly skin: StorySkin;
  readonly t: StoryTuning;
  readonly bus: SensoryBus;
  readonly hop: ArcDrive;
  readonly fsm: StateMachine<{ core: StoryCore }>;

  state: StoryState;

  private readonly _rng: () => number;
  private _strikeCooldown = 0;
  private _bossNextIn = 0;
  private readonly _cleared = new Set<Zone>();

  constructor(skin: StorySkin, opts: { bus?: SensoryBus; rng?: () => number } = {}) {
    this.skin = skin;
    this.t = skin.tuning;
    this.bus = opts.bus ?? new SensoryBus();
    this._rng = opts.rng ?? Math.random;
    this.hop = new ArcDrive();

    this.state = {
      phase: 'traversal',
      shards: 0,
      hp: this.t.startHp,
      tokenIndex: 0,
      tokenPos: cloneVec(BOARD_SPACES[0].pos),
      hopsLeft: 0,
      lastRoll: 0,
      extraRoll: false,
      boss: null,
      bossesDefeated: 0,
      bossesTotal: TOTAL_BOSSES,
      clearedZones: [],
      lastSpace: null,
      finished: false,
    };

    this.fsm = new StateMachine<{ core: StoryCore }>({
      initial: 'traversal',
      ctx: { core: this },
      states: {
        traversal: {},
        moving: {},
        boss: {},
        defeated: {},
        complete: {},
      },
      onTransition: (from, to) => {
        this.state.phase = to as StoryPhase;
        this.skin.onPhase?.(from as StoryPhase, to as StoryPhase);
      },
    });
  }

  /** Current lifecycle phase (mirrors the FSM). */
  get phase(): StoryPhase {
    return this.fsm.current as StoryPhase;
  }

  private _emit(
    evt: StorySensoryEvent,
    info: { space?: BoardSpace; boss?: StoryBossInfo | null; roll?: number } = {},
  ): void {
    const fx = this.skin.sensory?.[evt];
    if (fx) this.bus.emit(fx);
    this.skin.onSensory?.(evt, { pos: cloneVec(this.state.tokenPos), ...info });
  }

  // ---- Discrete inputs (phase-guarded, like the donor) ------------------

  /** Roll the d6 and start hopping. Traversal phase only. */
  roll(): number | null {
    if (this.fsm.current !== 'traversal') return null;
    const roll = 1 + Math.floor(this._rng() * 6);
    this.state.lastRoll = roll;
    this.state.hopsLeft = roll;
    this.state.extraRoll = false;
    this._emit('roll', { roll });
    this.fsm.transition('moving');
    this._beginNextHop();
    return roll;
  }

  /** Strike the active boss. Boss phase only; gated by the strike cooldown. */
  strike(): boolean {
    if (this.fsm.current !== 'boss' || !this.state.boss) return false;
    if (this._strikeCooldown > 0) return false;
    this._strikeCooldown = this.t.strikeCooldownS;
    const dmg = this.t.strikeMin + this._rng() * (this.t.strikeMax - this.t.strikeMin);
    const boss = this.state.boss;
    boss.hp = Math.max(0, boss.hp - dmg);
    this._emit('strike', { boss });
    if (boss.hp <= 0) this._defeatBoss(boss);
    return true;
  }

  // ---- Fixed-step update (seconds) --------------------------------------

  tick(dtSec: number): void {
    this.fsm.update(dtSec);
    if (this._strikeCooldown > 0) this._strikeCooldown = Math.max(0, this._strikeCooldown - dtSec);

    switch (this.fsm.current) {
      case 'moving': {
        const done = this.hop.advance(dtSec, this.state.tokenPos);
        if (done) {
          if (this.state.hopsLeft > 0) this._beginNextHop();
          else this._resolveSpaceLanding();
        }
        break;
      }
      case 'boss': {
        const boss = this.state.boss;
        if (!boss) break;
        this._bossNextIn -= dtSec;
        if (this._bossNextIn <= 0) {
          const dmg = this.t.bossDmgMin + this._rng() * (this.t.bossDmgMax - this.t.bossDmgMin);
          this.state.hp = Math.max(0, this.state.hp - dmg);
          this._emit('bossDamage', { boss });
          this._bossNextIn = this.t.bossAttackBaseS / Math.max(0.01, boss.aggression);
          if (this.state.hp <= 0) this._retreat();
        }
        break;
      }
      case 'defeated': {
        if (this.fsm.timeInState * 1000 >= this.t.defeatedHoldMs) {
          this.fsm.transition('traversal');
        }
        break;
      }
      default:
        break;
    }
  }

  // ---- Internals -------------------------------------------------------

  private _beginNextHop(): void {
    const next = (this.state.tokenIndex + 1) % BOARD_SPACES.length;
    const start = this.state.tokenPos;
    const target = BOARD_SPACES[next].pos;
    this.hop.begin({
      start: cloneVec(start),
      target: cloneVec(target),
      apexY: Math.max(start.y, target.y) + this.t.hopApexBonus,
      durationMs: this.t.hopDurationMs,
    });
    this.state.tokenIndex = next;
    this.state.hopsLeft -= 1;
    this._emit('hop');
  }

  private _resolveSpaceLanding(): void {
    const idx = this.state.tokenIndex;
    const space = BOARD_SPACES[idx];
    this.state.lastSpace = space;
    this.skin.onSpace?.(space, idx);
    let extraRoll = false;

    switch (space.type) {
      case 'bonus':
        this.state.shards += space.bonus;
        this._emit('bonus', { space });
        break;
      case 'carnival':
        this.state.shards += space.bonus;
        extraRoll = true;
        this._emit('carnival', { space });
        break;
      case 'rail':
      case 'flight':
        this.state.shards += space.bonus;
        this._emit('land', { space });
        break;
      case 'obstacle':
        this.state.hp = Math.max(0, this.state.hp - space.bonus);
        this._emit('obstacle', { space });
        if (this.state.hp <= 0) {
          this._retreat();
          return;
        }
        break;
      case 'boss': {
        const zone = space.zone;
        if (!this._cleared.has(zone)) {
          const cfg = ZONE_BOSSES[zone];
          if (cfg) {
            const boss: StoryBossInfo = {
              name: cfg.name,
              hp: cfg.maxHp,
              maxHp: cfg.maxHp,
              zone,
              aggression: cfg.aggression,
              final: cfg.final ?? false,
            };
            this.state.boss = boss;
            this._bossNextIn = this.t.bossFirstAttackS;
            this.skin.onBoss?.(boss);
            this._emit('bossEncounter', { boss });
            this.fsm.transition('boss');
            return; // stay in the fight; no extra-roll handling
          }
        }
        break;
      }
    }

    this.state.extraRoll = extraRoll;
    this.fsm.transition('traversal');
  }

  private _defeatBoss(boss: StoryBossInfo): void {
    this._cleared.add(boss.zone);
    this.state.clearedZones = Array.from(this._cleared);
    this.state.bossesDefeated = this._cleared.size;
    this.state.shards += this.t.bossShardBonus;
    this.state.boss = null;
    this.skin.onBoss?.(null);
    this._emit('bossDefeated', { boss });
    const finished = this.state.bossesDefeated >= TOTAL_BOSSES;
    this.state.finished = finished;
    if (finished) {
      this.fsm.transition('complete');
      this._emit('complete');
      this.skin.onComplete?.(this.state);
    } else {
      this.fsm.transition('defeated');
    }
  }

  private _retreat(): void {
    this.state.hp = this.t.retreatHp;
    this.state.boss = null;
    this.state.tokenIndex = 0;
    this.state.tokenPos = cloneVec(BOARD_SPACES[0].pos);
    this.hop.cancel();
    this.skin.onBoss?.(null);
    this._emit('retreat');
    this.fsm.transition('traversal');
  }
}

export default StoryCore;
