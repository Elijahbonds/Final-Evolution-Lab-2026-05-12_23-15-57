/**
 * lib/anim/state-machine.ts
 * =========================
 * M7a — the ONE animation state machine for all modes.
 *
 * Two layers:
 *  1. resolve() / combatActionClip() / dunkStyleClip()
 *     Direct ports of the donor `CharacterAnimStateMachine`
 *     (gameplay__character_anim_state.{h,cpp}). Pure/stateless: given a
 *     (modeId, phase, lastAction) triad they return an AnimClip. Never T-pose
 *     — the default fallback is always idle_stand.
 *
 *  2. AnimDirectorFSM
 *     A thin stateful layer on top that enforces the M7a invariants the donor
 *     header calls out as "the T-pose fix":
 *       • Idle is ALWAYS playing when stationary, rotating through resting
 *         variants (weight shift / look-around) so it never looks frozen.
 *       • velocity > 0 ⇒ a LOCOMOTION clip is playing (idle→walk→run by speed).
 *         The karate "waddle" (sliding on a stationary clip) is impossible.
 *       • Action clips (dunk / strike / juke / swing) run as a proper
 *         windup→active→recovery sequence, then blend back to locomotion/idle.
 *         They never snap or T-pose.
 *
 * Pure logic, no THREE / DOM. The avatar driver consumes AnimDecision.
 */

import { CLIPS, isLoopClip } from './clip-registry';
import {
  locomotionBlend,
  strideSyncTimeScale,
  type LocoWeights,
} from '@/lib/loco/locomotion';

export interface AnimClip {
  name: string;
  blendWeight: number;
  loop: boolean;
  speedScale: number;
}

const clip = (name: string, loop: boolean, speedScale = 1.0, blendWeight = 1.0): AnimClip =>
  ({ name, blendWeight, loop, speedScale });

/* ════════════════════════════════════════════════════════════════════════
 * LAYER 1 — pure port of CharacterAnimStateMachine
 * ════════════════════════════════════════════════════════════════════════ */
export function resolve(modeId: string, phase: string, lastAction: string): AnimClip {
  // ── Dunk Contest ──
  if (modeId === 'basketball_dunk') {
    if (phase === 'charging') return clip(CLIPS.dunkCharge, true, 1.0);
    if (phase === 'launch') return clip(CLIPS.dunkLaunch, false, 1.0);
    if (phase === 'airborne') {
      if (lastAction === '360_scoop') return clip(CLIPS.dunk360Scoop, false, 0.85);
      if (lastAction === '360_eastbay') return clip(CLIPS.dunk360Eastbay, false, 0.85);
      if (lastAction === '360_fake_eastbay') return clip(CLIPS.dunk360FakeEastbay, false, 0.9);
      if (lastAction === 'off_board_windmill') return clip(CLIPS.dunkOffBoardWindmill, false, 0.8);
      return clip(CLIPS.dunkAirborne, true, 1.0);
    }
    if (phase === 'scored') return clip(CLIPS.dunkScore, false, 1.0);
    if (phase === 'match_won') return clip(CLIPS.dunkScore, false, 0.7);
    return clip(CLIPS.dunkApproach, true, 1.0);
  }

  // ── Karate ──
  if (modeId === 'karate_endless' || modeId === 'karate_kata') {
    if (phase === 'victory') return clip(CLIPS.karateWin, false, 1.0);
    if (phase === 'defeat') return clip(CLIPS.karateDown, false, 1.0);
    if (phase === 'intermission') return clip(CLIPS.karateIdle, true, 0.6);
    if (lastAction === 'light_strike') return clip(CLIPS.karateLightP, false, 1.1);
    if (lastAction === 'heavy_strike') return clip(CLIPS.karateHeavyP, false, 0.9);
    if (lastAction === 'kick') return clip(CLIPS.karateKick, false, 1.0);
    if (lastAction === 'block') return clip(CLIPS.karateBlock, false, 1.2);
    if (lastAction === 'dodge') return clip(CLIPS.karateDodge, false, 1.1);
    if (lastAction === 'counter') return clip(CLIPS.karateCounter, false, 0.85);
    if (lastAction === 'hit') return clip(CLIPS.karateHit, false, 1.0);
    return clip(CLIPS.karateIdle, true, 1.0);
  }

  // ── Basketball pickup / 3v3 ──
  if (modeId === 'basketball_h2h' || modeId === 'venice_pickup' || modeId === 'basketball_3v3') {
    if (lastAction === 'shoot') return clip(CLIPS.bballShoot, false, 1.0);
    if (lastAction === 'score') return clip(CLIPS.bballScore, false, 1.0);
    if (lastAction === 'block') return clip(CLIPS.bballBlock, false, 1.1);
    if (lastAction === 'defend') return clip(CLIPS.bballDefend, true, 1.0);
    return clip(CLIPS.bballDribble, true, 1.0);
  }

  // ── Soccer ──
  if (modeId === 'soccer') {
    if (lastAction === 'shoot') return clip(CLIPS.soccerShoot, false, 1.0);
    if (lastAction === 'pass') return clip(CLIPS.soccerPass, false, 1.1);
    if (lastAction === 'tackle') return clip(CLIPS.soccerTackle, false, 0.9);
    if (lastAction === 'goal' || phase === 'goal') return clip(CLIPS.soccerCeleb, false, 0.85);
    if (lastAction === 'header') return clip(CLIPS.soccerHeader, false, 1.0);
    return clip(CLIPS.soccerDribble, true, 1.0);
  }

  // ── Football kick return ──
  if (modeId === 'football') {
    if (phase === 'touchdown') return clip(CLIPS.fbTouchdown, false, 0.85);
    if (phase === 'tackled') return clip(CLIPS.fbTackled, false, 1.0);
    if (lastAction === 'juke_left') return clip(CLIPS.fbJukeLeft, false, 1.2);
    if (lastAction === 'juke_right') return clip(CLIPS.fbJukeRight, false, 1.2);
    if (lastAction === 'spin') return clip(CLIPS.fbSpin, false, 1.0);
    if (lastAction === 'stiff_arm') return clip(CLIPS.fbStiffArm, false, 1.1);
    return clip(CLIPS.fbSprint, true, 1.0);
  }

  // ── Golf ── TUNE(elijah)
  if (modeId === 'golf') {
    if (lastAction === 'swing') return clip(CLIPS.golfSwing, false, 1.0);
    if (lastAction === 'putt') return clip(CLIPS.golfPutt, false, 1.0);
    if (phase === 'holed' || lastAction === 'celebrate') return clip(CLIPS.golfCeleb, false, 0.9);
    return clip(CLIPS.golfIdle, true, 1.0);
  }

  // ── Baseball ── TUNE(elijah)
  if (modeId === 'baseball') {
    if (lastAction === 'swing' || lastAction === 'bat') return clip(CLIPS.baseballSwing, false, 1.0);
    if (lastAction === 'contact') return clip(CLIPS.baseballContact, false, 1.0);
    if (phase === 'homer' || lastAction === 'celebrate') return clip(CLIPS.baseballCeleb, false, 0.9);
    return clip(CLIPS.baseballStance, true, 1.0);
  }

  // ── Board sports ──
  if (modeId === 'skateboarding') {
    if (lastAction === 'bail') return clip(CLIPS.skateBail, false, 1.0);
    if (lastAction === 'kickflip') return clip(CLIPS.skateKickflip, false, 1.0);
    if (lastAction === 'heelflip') return clip(CLIPS.skateHeelflip, false, 1.0);
    if (lastAction === 'treflip' || lastAction === '360flip') return clip(CLIPS.skateTreflip, false, 0.9);
    return clip(CLIPS.skateIdle, true, 1.0);
  }
  if (modeId === 'snowboarding') {
    if (lastAction === 'jump') return clip(CLIPS.snowJump, false, 1.0);
    if (lastAction === 'grab') return clip(CLIPS.snowGrab, false, 1.0);
    return clip(CLIPS.snowCarve, true, 1.0);
  }
  if (modeId === 'surfing') {
    if (lastAction === 'aerial') return clip(CLIPS.surfAerial, false, 1.0);
    if (lastAction === 'tube_ride') return clip(CLIPS.surfTube, true, 1.0);
    return clip(CLIPS.surfCarve, true, 1.0);
  }

  // ── Default fallback (never T-pose) ──
  return clip(CLIPS.idle, true, 1.0);
}

/** CombatAction int (0=light,1=heavy,2=block,3=dodge,4=counter) → karate clip. */
export function combatActionClip(actionInt: number): AnimClip {
  switch (actionInt) {
    case 0: return clip(CLIPS.karateLightP, false, 1.1);
    case 1: return clip(CLIPS.karateHeavyP, false, 0.9);
    case 2: return clip(CLIPS.karateBlock, false, 1.2);
    case 3: return clip(CLIPS.karateDodge, false, 1.1);
    case 4: return clip(CLIPS.karateCounter, false, 0.85);
    default: return clip(CLIPS.karateIdle, true, 1.0);
  }
}

/** DunkStyle int (4..7 = signature) → dunk clip; ground state = approach run. */
export function dunkStyleClip(styleInt: number, airborne: boolean): AnimClip {
  if (!airborne) return clip(CLIPS.dunkApproach, true, 1.0);
  switch (styleInt) {
    case 4: return clip(CLIPS.dunk360Scoop, false, 0.85);
    case 5: return clip(CLIPS.dunk360Eastbay, false, 0.85);
    case 6: return clip(CLIPS.dunk360FakeEastbay, false, 0.9);
    case 7: return clip(CLIPS.dunkOffBoardWindmill, false, 0.8);
    default: return clip(CLIPS.dunkAirborne, true, 1.0);
  }
}

/* ════════════════════════════════════════════════════════════════════════
 * LAYER 2 — AnimDirectorFSM (stateful invariant enforcement)
 * ════════════════════════════════════════════════════════════════════════ */

export type LocoBand = 'idle' | 'walk' | 'run' | 'sprint';
export type ActionPhase = 'windup' | 'active' | 'recovery';

/** Speed thresholds (normalized 0..1) that pick the locomotion band. // TUNE(elijah) */
export const LOCO_BANDS = {
  idleMax: 0.04, // below this = stationary → idle
  walkMax: 0.35, // below this = walk
  runMax: 0.78, // below this = run, above = sprint
} as const;

/** Action sequence timing in seconds. // TUNE(elijah) */
export const ACTION_TIMING = {
  windup: 0.10,
  active: 0.24,
  recovery: 0.18,
} as const;

/**
 * Idle animation constants. // TUNE(elijah)
 *
 * M7-QA1: Rebuilt idle to be a calm standing-idle (subtle breathing/weight-
 * shift) rather than the dynamic guard clip at full speed. The `guard` clip
 * in elijah-hero.glb plays at a dramatically reduced timeScale so it reads
 * as gentle weight shifting, not combat lunging.
 */
export const IDLE_SPEED_SCALE = 0.18; // TUNE(elijah) — barely-perceptible
export const IDLE_VARIANT_PERIOD = 10; // TUNE(elijah) — seconds between resting variants
export const IDLE_VARIANTS = ['idle_stand', 'idle_weight_shift', 'idle_look_around'] as const;

export function bandForSpeed(speed01: number): LocoBand {
  if (speed01 <= LOCO_BANDS.idleMax) return 'idle';
  if (speed01 <= LOCO_BANDS.walkMax) return 'walk';
  if (speed01 <= LOCO_BANDS.runMax) return 'run';
  return 'sprint';
}

/**
 * The locomotion clip for a band. `speedScale` is now STRIDE-SYNCED: because the
 * hero walk/run clips are authored in-place (zero root motion, measured), the
 * clip is played at a rate proportional to ground speed so foot cadence matches
 * velocity and the feet stop skating (the "penguin walk" fix). See
 * lib/loco/locomotion.ts. // TUNE(elijah) constants live there.
 */
export function locomotionClip(band: LocoBand, speed01: number): AnimClip {
  switch (band) {
    case 'walk': return clip(CLIPS.walk, true, strideSyncTimeScale(speed01, 'walk'));
    case 'run': return clip(CLIPS.run, true, strideSyncTimeScale(speed01, 'run'));
    case 'sprint': return clip(CLIPS.sprint, true, strideSyncTimeScale(speed01, 'sprint'));
    case 'idle':
    default: return clip(CLIPS.idle, true, 1.0);
  }
}

export interface DirectorInput {
  modeId: string;
  /** Normalized planar speed 0..1 from the movement system. */
  speed01: number;
  /** Mode phase (e.g. 'combat','airborne','victory'). Empty for free roam. */
  phase?: string;
  /** Set for exactly one tick when an action event fires (e.g. 'kick'). */
  actionEvent?: string;
}

export interface AnimDecision {
  clip: AnimClip;
  /** What kind of state produced this clip. */
  kind: 'idle' | 'locomotion' | 'action' | 'phase';
  band: LocoBand;
  actionPhase: ActionPhase | null;
  /** Which idle resting variant is active (only meaningful when kind==='idle'). */
  idleVariant: string | null;
  /**
   * Continuous locomotion blend-tree weights (idle/walk/run/sprint, sum=1) for
   * this frame's speed. Present for idle+locomotion decisions; the dominant
   * weight is the clip the driver plays, the rest let the dev harness (and any
   * future true multi-clip blend) show the crossfade. Null while an action or
   * mode-phase sequence overrides locomotion.
   */
  blend: LocoWeights | null;
}

/**
 * Stateful director. Call `update(dt, input)` once per frame; it returns the
 * single clip that MUST be playing this frame. Guarantees:
 *   - stationary  → idle clip (rotating variants)
 *   - moving      → locomotion clip matching speed band
 *   - action fired→ windup→active→recovery sequence, then blends back
 * A one-shot mode phase (victory/defeat/scored/touchdown…) also latches as an
 * action-style sequence so it plays through instead of snapping.
 */
export class AnimDirectorFSM {
  private actionClip: AnimClip | null = null;
  private actionPhase: ActionPhase | null = null;
  private actionT = 0;
  private idleT = 0;
  private lastBand: LocoBand = 'idle';

  reset(): void {
    this.actionClip = null;
    this.actionPhase = null;
    this.actionT = 0;
    this.idleT = 0;
    this.lastBand = 'idle';
  }

  /** True while an action / phase sequence is playing (locomotion is suppressed). */
  get inAction(): boolean {
    return this.actionClip != null;
  }

  private startAction(c: AnimClip): void {
    this.actionClip = c;
    this.actionPhase = 'windup';
    this.actionT = 0;
  }

  update(dt: number, input: DirectorInput): AnimDecision {
    const { modeId, speed01, phase = '', actionEvent } = input;

    // 1) A new action event always (re)starts a sequence — events win.
    if (actionEvent) {
      const resolved = resolve(modeId, phase, actionEvent);
      if (!resolved.loop) this.startAction(resolved);
    }

    // 2) A one-shot mode phase (victory/defeat/scored/touchdown/tackled) latches
    //    as a sequence too, so it never snaps.
    const ONE_SHOT_PHASES = new Set(['victory', 'defeat', 'scored', 'match_won', 'touchdown', 'tackled', 'goal']);
    if (!this.inAction && ONE_SHOT_PHASES.has(phase)) {
      const resolved = resolve(modeId, phase, '');
      if (!resolved.loop) this.startAction(resolved);
    }

    // 3) Advance an in-flight action sequence.
    if (this.actionClip) {
      this.actionT += dt;
      const { windup, active, recovery } = ACTION_TIMING;
      if (this.actionT < windup) this.actionPhase = 'windup';
      else if (this.actionT < windup + active) this.actionPhase = 'active';
      else if (this.actionT < windup + active + recovery) this.actionPhase = 'recovery';
      else {
        // Sequence complete → blend back to locomotion/idle next.
        this.actionClip = null;
        this.actionPhase = null;
        this.actionT = 0;
      }
      if (this.actionClip) {
        return {
          clip: this.actionClip,
          kind: 'action',
          band: bandForSpeed(speed01),
          actionPhase: this.actionPhase,
          idleVariant: null,
          blend: null,
        };
      }
    }

    // 4) No action → locomotion invariant. velocity>0 ⇒ loco clip.
    const band = bandForSpeed(speed01);
    this.lastBand = band;
    if (band === 'idle') {
      this.idleT += dt;
      const idx = Math.floor(this.idleT / IDLE_VARIANT_PERIOD) % IDLE_VARIANTS.length;
      const variant = IDLE_VARIANTS[idx];
      return {
        clip: clip(CLIPS.idle, true, IDLE_SPEED_SCALE),
        kind: 'idle',
        band,
        actionPhase: null,
        idleVariant: variant,
        blend: locomotionBlend(speed01),
      };
    }
    this.idleT = 0;
    return {
      clip: locomotionClip(band, speed01),
      kind: 'locomotion',
      band,
      actionPhase: null,
      idleVariant: null,
      blend: locomotionBlend(speed01),
    };
  }
}

/** Assertion helper used by tests: a decision must never be a T-pose (empty). */
export function isValidDecision(d: AnimDecision): boolean {
  return !!d.clip && typeof d.clip.name === 'string' && d.clip.name.length > 0;
}

/** Invariant check: velocity>0 must not yield an idle clip. */
export function locomotionInvariantHolds(speed01: number, d: AnimDecision): boolean {
  if (d.kind === 'action' || d.kind === 'phase') return true; // action overrides loco
  if (speed01 > LOCO_BANDS.idleMax) {
    return d.kind === 'locomotion' && isLoopClip(d.clip.name);
  }
  return d.kind === 'idle';
}
