/**
 * lib/feel/football/football-core.ts
 * ==================================
 * M10 Row A — Street Football (SYNTH APPROXIMATION) gameplay core.
 *
 * Reuses the Court/free-3D archetype WITHOUT forking it: FootballRun COMPOSES
 * a CourtCore instance for the grounded run (LocomotionController + the shared
 * variable-gravity jump, which doubles as a hurdle) and layers an ORIGINAL,
 * deterministic abstracted-tackler + juke/spin/stiff-arm evade system on top.
 * No CourtCore/skin/shared-system source is edited by this file.
 *
 * Signature moment (lineup spec): "juke rotation broke 80yd for a TD vs live
 * tackles" — sprint downfield, dodge live tacklers with jukes/spins/stiff-arms/
 * hurdles, reach the end zone for the touchdown.
 *
 * PURE LOGIC: no THREE / no DOM. Deterministic given a seed (tackler field is
 * seeded via mulberry32). Every claim is proven by
 * scripts/football-retrofit-tests.ts driving input at 60Hz.
 */

import { CourtCore } from '../cores/court-core';
import { makeFootballSkin } from './football-skin';
import { FOOTBALL_TUNING, type FootballTuning } from './football-constants';

export type FootballPhase = 'Ready' | 'Running' | 'Juking' | 'Spin' | 'StiffArm' | 'Tackled' | 'Touchdown';
export type JukeSide = 'L' | 'R';

/** One abstracted defender on the field. */
export interface Tackler {
  /** Downfield yard (world -Z magnitude) where the defender sits. */
  yd: number;
  /** Lateral world X of the defender. */
  x: number;
  /** True once the runner has evaded (or passed) this defender. */
  cleared: boolean;
}

export interface FootballState {
  phase: FootballPhase;
  pos: { x: number; z: number; y: number };
  /** Downfield yards gained from the line of scrimmage. */
  yards: number;
  /** Yards remaining to the end zone. */
  yardsToGo: number;
  /** Normalized planar speed 0..1 (from the composed locomotion). */
  speed01: number;
  score: number;
  jukesUsed: number;
  tacklersEvaded: number;
  tackled: boolean;
  touchdown: boolean;
  finished: boolean;
}

export interface FootballInput {
  /** Lateral steer, -1 (left) .. +1 (right). */
  steerX: number;
  /** Hold to sprint downfield (auto-forward). Defaults true while Running. */
  sprint?: boolean;
}

export interface FootballOpts {
  tuning?: FootballTuning;
  /** Deterministic RNG for the tackler field. Defaults to mulberry32(seed). */
  rng?: () => number;
  seed?: number;
  onEvade?: (kind: 'juke' | 'spin' | 'stiffArm' | 'hurdle', t: Tackler) => void;
  onTackled?: (t: Tackler) => void;
  onTouchdown?: (score: number) => void;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Street Football run. Drive step(dt, input) at a fixed 1/60s. Downfield is -Z;
 * yards gained = -pos.z. Reaching fieldLengthYd is a touchdown; contacting an
 * un-evaded tackler ends the run.
 */
export class FootballRun {
  readonly tuning: FootballTuning;
  readonly court: CourtCore;
  readonly tacklers: Tackler[];
  state: FootballState;

  private _opts: FootballOpts;
  private _evadeT = 0;
  private _evadeKind: 'juke' | 'spin' | 'stiffArm' | null = null;
  private _jukeDir = 0;
  private _airForward = 0;

  constructor(opts: FootballOpts = {}) {
    this._opts = opts;
    this.tuning = opts.tuning ?? FOOTBALL_TUNING;
    const rng = opts.rng ?? mulberry32(opts.seed ?? 1);

    const t = this.tuning;
    this.court = new CourtCore(
      makeFootballSkin({ tuning: t }),
      { x: 0, z: 0 },
    );

    // Seed the abstracted tackler field: evenly spaced downfield, random lateral.
    this.tacklers = [];
    const span = t.lastTacklerYd - t.firstTacklerYd;
    for (let i = 0; i < t.tacklerCount; i++) {
      const frac = t.tacklerCount > 1 ? i / (t.tacklerCount - 1) : 0;
      const yd = t.firstTacklerYd + frac * span;
      const x = (rng() * 2 - 1) * (t.laneHalfWidth - 1.5);
      this.tacklers.push({ yd, x, cleared: false });
    }

    this.state = {
      phase: 'Ready',
      pos: { x: 0, z: 0, y: 0 },
      yards: 0,
      yardsToGo: t.fieldLengthYd,
      speed01: 0,
      score: 0,
      jukesUsed: 0,
      tacklersEvaded: 0,
      tackled: false,
      touchdown: false,
      finished: false,
    };
  }

  get phase(): FootballPhase {
    return this.state.phase;
  }

  /** Buffer a lateral juke-dash evade (reuses the shared InputBuffer). */
  juke(side: JukeSide): void {
    if (this.state.finished) return;
    this.court.input.press('juke');
    this._jukeDir = side === 'L' ? -1 : 1;
  }

  /** Buffer a spin (brief pass-through-a-defender evade). */
  spin(): void {
    if (this.state.finished) return;
    this.court.input.press('spin');
  }

  /** Buffer a stiff-arm (short close-range single-tackle negation). */
  stiffArm(): void {
    if (this.state.finished) return;
    this.court.input.press('stiffArm');
  }

  /** Hurdle: reuses the Court/free-3D jump — airborne frames clear ground tackles. */
  hurdle(): void {
    if (this.state.finished) return;
    this.court.pressJump();
  }

  /** Advance one fixed step (dt in SECONDS). */
  step(dt: number, input: FootballInput): FootballState {
    const s = this.state;
    const t = this.tuning;
    if (s.finished) return s;

    if (s.phase === 'Ready') s.phase = 'Running';

    // ---- Consume buffered evade actions ---------------------------------
    if (this.court.input.consume('juke')) {
      this._evadeKind = 'juke';
      this._evadeT = t.jukeWindowS;
      s.jukesUsed++;
    } else if (this.court.input.consume('spin')) {
      this._evadeKind = 'spin';
      this._evadeT = t.spinWindowS;
      s.jukesUsed++;
    } else if (this.court.input.consume('stiffArm')) {
      this._evadeKind = 'stiffArm';
      this._evadeT = t.stiffArmWindowS;
      s.jukesUsed++;
    }

    const evadeActive = this._evadeT > 0;
    if (evadeActive) {
      this._evadeT -= dt;
      if (this._evadeT <= 0) {
        this._evadeT = 0;
        this._evadeKind = null;
        this._jukeDir = 0;
      }
    }

    // ---- Drive the composed Court locomotion ----------------------------
    // Auto-sprint downfield (-Z => moveY = -1). During a juke the lateral
    // steer is forced toward the juke direction for the dash window.
    const sprint = input.sprint ?? true;
    let steerX = clamp(input.steerX, -1, 1);
    if (this._evadeKind === 'juke' && this._evadeT > 0) {
      steerX = this._jukeDir * t.jukeSteer;
    }
    const moveY = sprint ? -1 : 0;
    // Capture the grounded downfield speed so a hurdle can carry it (see below).
    if (!this.court.state.airborne) {
      this._airForward = this.court.loco.effectiveMaxSpeed * this.court.state.speed01;
    }
    this.court.step(dt, { moveX: steerX, moveY, camYaw: 0 });

    // CourtCore's jump is a VERTICAL (dunk) jump — it freezes planar motion
    // mid-air. A football hurdle is a BROAD jump, so carry the pre-takeoff
    // downfield momentum forward while airborne. This is layered on top of the
    // shared core (FootballRun owns it); the core itself is never forked.
    if (this.court.state.airborne) {
      let z = this.court.state.pos.z - this._airForward * dt;
      const minZ = -(t.fieldLengthYd + t.endZoneMargin);
      if (z < minZ) z = minZ;
      this.court.state.pos.z = z;
      this.court.loco.state.pos.z = z;
    }

    // Mirror kinematics off the composed core.
    s.pos.x = this.court.state.pos.x;
    s.pos.z = this.court.state.pos.z;
    s.pos.y = this.court.state.pos.y;
    s.speed01 = this.court.state.speed01;
    s.yards = clamp(-s.pos.z, 0, t.fieldLengthYd);
    s.yardsToGo = Math.max(0, t.fieldLengthYd - s.yards);

    // Running-phase label reflects the active evade.
    if (this._evadeKind === 'juke' && this._evadeT > 0) s.phase = 'Juking';
    else if (this._evadeKind === 'spin' && this._evadeT > 0) s.phase = 'Spin';
    else if (this._evadeKind === 'stiffArm' && this._evadeT > 0) s.phase = 'StiffArm';
    else s.phase = 'Running';

    // ---- Tackle resolution ---------------------------------------------
    // Airborne (mid-hurdle) clears ground contact entirely.
    const airborne = this.court.state.airborne && s.pos.y > 0.15;
    if (!airborne) {
      for (const tk of this.tacklers) {
        if (tk.cleared) continue;
        const dz = tk.yd + s.pos.z; // downfield gap: tackler yd minus runner yd (yards = -z)
        const dx = s.pos.x - tk.x;
        const dist = Math.hypot(dx, dz);
        if (evadeActive && dist <= t.evadeReach) {
          // Active evade window (juke/spin/stiff-arm): juke past this defender.
          tk.cleared = true;
          s.tacklersEvaded++;
          this._opts.onEvade?.(this._evadeKind ?? 'juke', tk);
        } else if (!evadeActive && dist <= t.tackleRadius) {
          // Bare contact with no evade window: brought down.
          tk.cleared = true;
          s.tackled = true;
          s.finished = true;
          s.phase = 'Tackled';
          this._score();
          this._opts.onTackled?.(tk);
          return s;
        } else if (dz < -t.tackleRadius) {
          // Runner has passed this defender without contact — count as beaten.
          tk.cleared = true;
        }
      }
    } else {
      // Hurdle clears any defender whose downfield yard we are passing over.
      for (const tk of this.tacklers) {
        if (tk.cleared) continue;
        const dz = tk.yd + s.pos.z;
        if (Math.abs(dz) <= t.tackleRadius && Math.abs(s.pos.x - tk.x) <= t.tackleRadius) {
          tk.cleared = true;
          s.tacklersEvaded++;
          this._opts.onEvade?.('hurdle', tk);
        } else if (dz < -t.tackleRadius) {
          tk.cleared = true;
        }
      }
    }

    // ---- Touchdown ------------------------------------------------------
    if (s.yards >= t.fieldLengthYd) {
      s.touchdown = true;
      s.finished = true;
      s.phase = 'Touchdown';
      this._score();
      this._opts.onTouchdown?.(s.score);
    }

    return s;
  }

  private _score(): void {
    const s = this.state;
    const t = this.tuning;
    s.score =
      Math.round(s.yards) * t.pointsPerYard +
      s.tacklersEvaded * t.pointsPerEvade +
      (s.touchdown ? t.touchdownBonus : 0);
  }
}

/** Convenience ctor mirroring the other cores' make* helpers. */
export function makeFootballRun(opts: FootballOpts = {}): FootballRun {
  return new FootballRun(opts);
}

export { FOOTBALL_TUNING } from './football-constants';
export default FootballRun;
