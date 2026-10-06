// PerfGovernor — "cool + smooth" on phones (owner, 2026-10-06: "Make sure it's not gonna lag or overheat people's phone").
//
// The owner picked: cap phones at a steady 30–60 fps, lower resolution and effects automatically when the phone heats up
// or a frame runs slow, and stop rendering behind menus; visuals may drop a little under load. Target: a 3–4-year-old
// phone (an iPhone 12, a 2021 mid-range Android).
//
// THIS FILE IS THE POLICY, AND IT IS PURE. Three small machines, each testable without a GPU (PerfGovernor.test.ts):
//
//   FramePacer   — which animation frames render. A phone's rAF runs at the panel's rate (60, 90, 120 Hz) and Babylon
//                  renders every one of them: a 120 Hz phone draws the game twice as often as anyone can use, and that
//                  is pure heat. The pacer renders every Nth vsync, N chosen so the rate is the cap or just under it
//                  (60 Hz → 60 or 30, 90 Hz → 45 or 30, 120 Hz → 60 or 30), so frames are EVENLY spaced instead of
//                  Babylon's own maxFPS accumulator, which jitters at an exact divisor (two 16.66 ms ticks sum to just
//                  under 33.33 and the frame slips a whole vsync).
//   GovernorCore — the quality ladder. Watches 2 s windows of rendered frames (interval, JS work) and steps the level
//                  down after sustained slowness, up after sustained headroom, with a cooldown that doubles when it
//                  oscillates. It owns the cap too: 60 while the phone holds it, 30 when it cannot.
//   ThermalWatch — the throttling signature. A fixed slice of JS arithmetic, timed every few seconds: a phone that heats
//                  up drops its clocks and the SAME work takes longer, whatever the game is drawing. Frame time alone
//                  cannot tell a hot phone from a busy scene (the karate horde grows by design); the benchmark can.
//                  Once it trips, the governor steps down and stays down for the session.
//
// The Babylon side (applying the levels, the paced frame requester, idling behind menus and hidden tabs) is perfGuard.ts.
// Nothing here toggles a post-process pass: a runtime toggle compiles a shader mid-play (ImpactFrame.ts says why), so
// every lever in LEVELS is a number on something that already exists.

/** The phone caps. 60 while the phone holds it; 30 is the floor the owner asked for ("a steady 30–60"). */
export type FpsCap = 30 | 60;

// ── FramePacer ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** run = paced to the cap; low = a slow refresh behind a menu; stop = nothing at all (a hidden tab). */
export type PaceMode = 'run' | 'low' | 'stop';

/** TUNED: the refresh behind a pause or an end card — 2 fps keeps a rotated phone from showing a stale or cleared canvas
 *  for more than half a second, and is ~1/30 of the work of rendering a scene nobody can see. */
export const IDLE_FRAME_MS = 500;
/** Raw rAF deltas kept to estimate the panel's vsync. */
const VSYNC_SAMPLES = 32;

/** Render every Nth vsync so the rate is the cap or just under it. ε absorbs a 59.94 Hz panel. */
export function vsyncDivisor(capFps: number, vsyncMs: number): number {
  if (!(capFps > 0) || !(vsyncMs > 0)) return 1;
  return Math.max(1, Math.ceil((1000 / capFps) / vsyncMs - 0.08));
}

/** The q-quantile of a list (nearest rank). Pure helper shared by the machines below. */
export function quantile(values: readonly number[], q: number): number {
  if (!values.length) return NaN;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))];
}

export class FramePacer {
  /** null = uncapped: every vsync renders (a desktop, or a tier the guard does not pace) — the idle modes still apply. */
  private cap: FpsCap | null = 60;
  private _mode: PaceMode = 'run';
  private lastTick = NaN;
  private lastRender = NaN;
  private deltas: number[] = [];
  private sinceEstimate = 0;
  private _vsync = 1000 / 60;
  private _resumed = false;
  private wasIdle = false;

  get mode(): PaceMode { return this._mode; }
  get capFps(): FpsCap | null { return this.cap; }
  /** The panel's refresh interval as measured: a low quantile of the raw rAF deltas, so the frames a busy main thread
   *  stretched do not read as a slow panel (the skipped ticks are cheap and land on the real vsync). */
  get vsyncMs(): number { return this._vsync; }
  get divisor(): number { return this.cap ? vsyncDivisor(this.cap, this._vsync) : 1; }
  /** The interval a rendered frame is aiming for — what "late" is measured against. */
  get targetMs(): number { return this.divisor * this._vsync; }

  setCap(cap: FpsCap | null): void { this.cap = cap; }

  setMode(m: PaceMode): void {
    if (m === this._mode) return;
    if (m !== 'run') this.wasIdle = true;
    this._mode = m;
  }

  /**
   * True on the first rendered frame after the loop idled ('low' or 'stop'): the caller resets the frame clock so the
   * game, the animations and the physics do not see the whole pause as one giant step. Read once; it clears.
   */
  takeResumed(): boolean { const r = this._resumed; this._resumed = false; return r; }

  /** One animation-frame tick at time t (ms, the rAF timestamp). Render on this tick? */
  tick(t: number): boolean {
    if (Number.isFinite(this.lastTick)) {
      const d = t - this.lastTick;
      if (d > 2 && d < 100) {
        this.deltas.push(d);
        if (this.deltas.length > VSYNC_SAMPLES) this.deltas.shift();
        if (++this.sinceEstimate >= 8 || this.deltas.length < 8) {
          this.sinceEstimate = 0;
          this._vsync = Math.min(50, Math.max(4, quantile(this.deltas, 0.2)));
        }
      }
    }
    this.lastTick = t;
    if (this._mode === 'stop') return false;
    const elapsed = t - this.lastRender;
    const need = this._mode === 'low' ? IDLE_FRAME_MS : (this.divisor - 0.5) * this._vsync;
    if (!Number.isFinite(this.lastRender) || elapsed >= need || elapsed < 0) {
      this.lastRender = t;
      if (this._mode === 'run' && this.wasIdle) { this.wasIdle = false; this._resumed = true; }
      else if (this._mode === 'low') this._resumed = true;   // every idle frame is its own step: never one 500 ms jump
      return true;
    }
    return false;
  }
}

// ── The quality ladder ───────────────────────────────────────────────────────────────────────────────────────────────

/** What one governor level does. Every lever is a value on something that already exists: no pass is added or removed. */
export interface PerfLevel {
  /** Backing resolution as a fraction of the canvas fit's (never below 1:1 CSS pixels — see renderScaleFloor). */
  renderScale: number;
  /** The shadow map renders every Nth frame (1 = every frame). Characters' shadows trail a frame at 2. */
  shadowEvery: number;
  /** Particle emit rates and burst counts scale by this. */
  particles: number;
  /** Ambient life (petals, snow, moths, gulls): off at the bottom of the ladder. */
  ambient: boolean;
  /** Onlooker crowds: 'full' idles and breathes, 'still' holds them in their idle pose. */
  crowd: 'full' | 'still';
}

/**
 * TUNED: the ladder, cheapest-to-notice first. Resolution is first because on a phone the GPU's cost is fill (canvasFit's
 * header: fill rate dominates) and 0.85 of a DPR-2 buffer is invisible at arm's length; the shadow map's refresh next
 * (a one-frame shadow trail at 30 fps); then the particles, then the ambient life and the crowd's idle.
 */
export const LEVELS: readonly PerfLevel[] = [
  { renderScale: 1, shadowEvery: 1, particles: 1, ambient: true, crowd: 'full' },
  { renderScale: 0.85, shadowEvery: 1, particles: 1, ambient: true, crowd: 'full' },
  { renderScale: 0.75, shadowEvery: 2, particles: 1, ambient: true, crowd: 'full' },
  { renderScale: 0.67, shadowEvery: 2, particles: 0.6, ambient: true, crowd: 'still' },
  { renderScale: 0.6, shadowEvery: 3, particles: 0.35, ambient: false, crowd: 'still' },
];
export const MAX_LEVEL = LEVELS.length - 1;

/** TUNED: the resolution floor. Never below one backing pixel per CSS pixel (canvasFit's rule: "a blurry game is worse
 *  than a slow one"); on a DPR-2 fit that is a scale of 0.5, so the ladder's 0.6 binds first. */
export function renderScaleFloor(fitEffectiveDpr: number): number {
  return fitEffectiveDpr > 1 ? 1 / fitEffectiveDpr : 1;
}

/** The hardware scaling level for a fit's base level and a governor scale, floored at 1:1. */
export function scaledHardwareLevel(baseLevel: number, renderScale: number): number {
  const base = baseLevel > 0 && Number.isFinite(baseLevel) ? baseLevel : 1;
  const floor = renderScaleFloor(1 / base);
  const s = Math.min(1, Math.max(floor, renderScale));
  return base / s;
}

// ── GovernorCore ─────────────────────────────────────────────────────────────────────────────────────────────────────

export interface GovernorConfig {
  /** One verdict per window of rendered frames. */
  windowMs: number;
  /** A frame is LATE past target × this (PerfMonitor's LONG_FRAME_HEADROOM: a dropped vsync, not a rounding error). */
  lateFactor: number;
  /** A window is SLOW when more than this share of its frames were late… */
  slowMissRate: number;
  /** …or when JS alone took this share of the frame (p90). */
  slowWorkShare: number;
  /** A window has HEADROOM when fewer than this share were late and JS p90 stayed under fastWorkShare of the frame. */
  fastMissRate: number;
  fastWorkShare: number;
  /** Consecutive slow windows before a step down; consecutive headroom windows before a step up. */
  slowWindows: number;
  fastWindows: number;
  /** After a step down, no step up for this long; doubles each time a step up is followed by a quick step down. */
  cooldownMs: number;
  maxCooldownMs: number;
  /** A step up and a step down this close together is an oscillation. */
  oscillationMs: number;
  /** At 30 fps with headroom, try 60 again only if JS p90 is under this (ms), and at most this many times a session. */
  promoteWorkMs: number;
  maxPromotions: number;
  /** At 60 fps, the levels it may spend before giving up 60 for 30. */
  levelsBeforeCap30: number;
  /** False where nothing paces the frames (the cap is not the guard's to move): only the levels step. */
  allowCap30: boolean;
  /** Frame-time trend at a fixed level (the in-game throttling signature): rise factor, and the time at one level first. */
  trendRise: number;
  trendMinMs: number;
}

/** TUNED: every number here is a first cut for a 3–4-year-old phone; the real-phone test in the report checks them. */
export const DEFAULT_GOVERNOR: GovernorConfig = {
  windowMs: 2000,
  lateFactor: 1.35,
  slowMissRate: 0.12,
  slowWorkShare: 0.9,
  fastMissRate: 0.03,
  fastWorkShare: 0.55,
  slowWindows: 2,
  fastWindows: 5,
  cooldownMs: 20_000,
  maxCooldownMs: 120_000,
  oscillationMs: 15_000,
  promoteWorkMs: 9,
  maxPromotions: 3,
  levelsBeforeCap30: 2,
  allowCap30: true,
  trendRise: 1.35,
  trendMinMs: 120_000,
};

export interface GovernorState {
  level: number;
  cap: FpsCap;
  /** Thermal lock: the phone heated up; the level never climbs back above `floor` and 60 is not retried. */
  thermal: boolean;
  /** The best (lowest) level allowed — 0 until a thermal lock. */
  floor: number;
  /** Why the last change happened, for the HUD and the console. */
  reason: string;
}

export interface WindowStats { frames: number; missRate: number; workP50: number; workP90: number; targetMs: number }

export type Verdict = 'slow' | 'fast' | 'ok';

export function judgeWindow(w: WindowStats, cfg: GovernorConfig = DEFAULT_GOVERNOR): Verdict {
  if (w.frames < 5) return 'ok';   // an idle or paused window says nothing
  if (w.missRate > cfg.slowMissRate || w.workP90 > w.targetMs * cfg.slowWorkShare) return 'slow';
  if (w.missRate < cfg.fastMissRate && w.workP90 < w.targetMs * cfg.fastWorkShare) return 'fast';
  return 'ok';
}

export class GovernorCore {
  readonly cfg: GovernorConfig;
  private s: GovernorState;
  private winStart = NaN;
  private intervals: number[] = [];
  private works: number[] = [];
  private winTarget = 1000 / 60;
  private slowStreak = 0;
  private fastStreak = 0;
  private upBlockedUntil = 0;
  private cooldown: number;
  private lastUpAt = -Infinity;
  private lastChangeAt = 0;
  private promotions = 0;
  private settleUntil = 0;
  /** workP50 of each window since the last change, for the trend check. */
  private trend: Array<{ t: number; p50: number; miss: number }> = [];
  private _last: WindowStats | null = null;

  constructor(cfg: Partial<GovernorConfig> = {}, cap: FpsCap = 60) {
    this.cfg = { ...DEFAULT_GOVERNOR, ...cfg };
    this.cooldown = this.cfg.cooldownMs;
    this.s = { level: 0, cap, thermal: false, floor: 0, reason: 'start' };
  }

  get state(): Readonly<GovernorState> { return this.s; }
  get lastWindow(): WindowStats | null { return this._last; }

  /**
   * One rendered frame: its interval since the last rendered frame, the JS work inside it, the time, and the interval
   * the pacer was aiming for. Returns the new state when this frame closed a window that changed it, else null.
   */
  frame(intervalMs: number, workMs: number, t: number, targetMs: number): GovernorState | null {
    if (!Number.isFinite(this.winStart)) { this.winStart = t; this.lastChangeAt = t; }
    if (Number.isFinite(intervalMs) && intervalMs > 0 && intervalMs < 1000) this.intervals.push(intervalMs);
    if (Number.isFinite(workMs) && workMs >= 0) this.works.push(workMs);
    this.winTarget = targetMs > 0 ? targetMs : this.winTarget;
    if (t - this.winStart < this.cfg.windowMs) return null;
    const w = this.closeWindow();
    this.winStart = t;
    if (t < this.settleUntil) return null;   // the window a change landed in carries its hitch
    return this.judge(w, t);
  }

  /** The page left the run (a menu, a hidden tab): the next window starts fresh and the streaks do not carry over. */
  interrupt(t: number): void {
    this.intervals = []; this.works = []; this.winStart = t;
    this.slowStreak = 0; this.fastStreak = 0;
    this.settleUntil = t + this.cfg.windowMs;
    this.trend = [];
  }

  /** ThermalWatch tripped: step down and stay down. */
  thermal(t: number, why = 'thermal: the phone slowed down'): GovernorState {
    if (this.s.cap === 60 && this.cfg.allowCap30) this.s = { ...this.s, cap: 30 };
    else this.s = { ...this.s, level: Math.min(MAX_LEVEL, this.s.level + 1) };
    this.s = { ...this.s, thermal: true, floor: this.s.level, reason: why };
    this.changed(t);
    return this.s;
  }

  /** Dev/probe: pin a level (clamped to the thermal floor). */
  force(level: number, t: number, cap?: FpsCap): GovernorState {
    const l = Math.max(this.s.floor, Math.min(MAX_LEVEL, Math.round(level)));
    this.s = { ...this.s, level: l, cap: cap ?? this.s.cap, reason: 'forced' };
    this.changed(t);
    return this.s;
  }

  private closeWindow(): WindowStats {
    const late = this.winTarget * this.cfg.lateFactor;
    const n = this.intervals.length;
    const w: WindowStats = {
      frames: n,
      missRate: n ? this.intervals.filter((x) => x > late).length / n : 0,
      workP50: this.works.length ? quantile(this.works, 0.5) : 0,
      workP90: this.works.length ? quantile(this.works, 0.9) : 0,
      targetMs: this.winTarget,
    };
    this.intervals = []; this.works = [];
    this._last = w;
    return w;
  }

  private changed(t: number): void {
    this.lastChangeAt = t;
    this.slowStreak = 0; this.fastStreak = 0;
    this.settleUntil = t + this.cfg.windowMs;
    this.trend = [];
  }

  private stepDown(t: number, why: string): GovernorState {
    const c = this.cfg;
    if (t - this.lastUpAt < c.oscillationMs) this.cooldown = Math.min(c.maxCooldownMs, this.cooldown * 2);
    const can30 = c.allowCap30 && this.s.cap === 60;
    if (can30 && this.s.level >= c.levelsBeforeCap30) this.s = { ...this.s, cap: 30, reason: `${why} → 30 fps` };
    else if (this.s.level < MAX_LEVEL) this.s = { ...this.s, level: this.s.level + 1, reason: `${why} → level ${this.s.level + 1}` };
    else if (can30) this.s = { ...this.s, cap: 30, reason: `${why} → 30 fps` };
    else return this.s;   // already at the bottom: nothing left to give
    this.upBlockedUntil = t + this.cooldown;
    this.changed(t);
    return this.s;
  }

  private stepUp(t: number, w: WindowStats): GovernorState | null {
    const c = this.cfg;
    if (t < this.upBlockedUntil) return null;
    if (t - this.lastChangeAt > c.maxCooldownMs) this.cooldown = c.cooldownMs;   // calm for a while: forgive
    if (this.s.level > this.s.floor) {
      this.s = { ...this.s, level: this.s.level - 1, reason: `headroom → level ${this.s.level - 1}` };
    } else if (this.s.cap === 30 && !this.s.thermal && this.promotions < c.maxPromotions && w.workP90 < c.promoteWorkMs) {
      this.promotions++;
      this.s = { ...this.s, cap: 60, reason: `headroom → try 60 fps (${this.promotions}/${c.maxPromotions})` };
    } else return null;
    this.lastUpAt = t;
    this.changed(t);
    return this.s;
  }

  private judge(w: WindowStats, t: number): GovernorState | null {
    const c = this.cfg;
    const v = judgeWindow(w, c);
    if (w.frames >= 5) this.trend.push({ t, p50: w.workP50, miss: w.missRate });
    if (v === 'slow') { this.slowStreak++; this.fastStreak = 0; }
    else if (v === 'fast') { this.fastStreak++; this.slowStreak = 0; }
    else { this.slowStreak = 0; this.fastStreak = 0; }

    // THE IN-GAME THROTTLING SIGNATURE: at one unchanged level for minutes, the same work getting slower AND frames now
    // missing. Rising work with every frame still on time is a busier scene, not a hot phone: no lock for that.
    if (!this.s.thermal && t - this.lastChangeAt >= c.trendMinMs && v === 'slow') {
      const base = this.trend.filter((x) => x.t - this.lastChangeAt <= 40_000).map((x) => x.p50);
      const recent = this.trend.filter((x) => t - x.t <= 30_000).map((x) => x.p50);
      const b = quantile(base, 0.5), r = quantile(recent, 0.5);
      if (base.length >= 5 && recent.length >= 5 && b > 0.5 && r >= b * c.trendRise) {
        return this.thermal(t, `thermal: frame work ${b.toFixed(1)} → ${r.toFixed(1)} ms at one level`);
      }
    }
    if (this.slowStreak >= c.slowWindows) return this.stepDown(t, `slow (${Math.round(w.missRate * 100)}% late, JS p90 ${w.workP90.toFixed(1)} ms)`);
    if (this.fastStreak >= c.fastWindows) return this.stepUp(t, w);
    return null;
  }
}

// ── ThermalWatch ─────────────────────────────────────────────────────────────────────────────────────────────────────

export interface ThermalConfig {
  /** Ignore the first samples: the JIT is still warming and the page is still loading assets. */
  warmupMs: number;
  /** Samples in the baseline (the median of the first N after warm-up) and in the rolling median compared with it. */
  baselineSamples: number;
  rollingSamples: number;
  /** Trip when the rolling median reaches baseline × this. */
  rise: number;
  /** Below this the timer cannot resolve the benchmark (Safari clamps performance.now to 1 ms): never trip. */
  minBaselineMs: number;
}

/** TUNED: phones throttle in steps of 20–50 % of clock; 1.4× sustained over five samples is past any scheduler noise. */
export const DEFAULT_THERMAL: ThermalConfig = {
  warmupMs: 20_000,
  baselineSamples: 5,
  rollingSamples: 5,
  rise: 1.4,
  minBaselineMs: 0.5,
};

export class ThermalWatch {
  readonly cfg: ThermalConfig;
  private start = NaN;
  private base: number[] = [];
  private recent: number[] = [];
  private _baseline = NaN;
  private _tripped = false;

  constructor(cfg: Partial<ThermalConfig> = {}) { this.cfg = { ...DEFAULT_THERMAL, ...cfg }; }

  get baseline(): number { return this._baseline; }
  get tripped(): boolean { return this._tripped; }
  get rolling(): number { return quantile(this.recent, 0.5); }

  /** One timed run of the fixed benchmark. True exactly once: the sample that trips the lock. */
  sample(ms: number, t: number): boolean {
    if (this._tripped || !Number.isFinite(ms) || ms < 0) return false;
    if (!Number.isFinite(this.start)) this.start = t;
    if (t - this.start < this.cfg.warmupMs) return false;
    if (!Number.isFinite(this._baseline)) {
      this.base.push(ms);
      if (this.base.length >= this.cfg.baselineSamples) this._baseline = quantile(this.base, 0.5);
      return false;
    }
    this.recent.push(ms);
    if (this.recent.length > this.cfg.rollingSamples) this.recent.shift();
    if (this.recent.length < this.cfg.rollingSamples || this._baseline < this.cfg.minBaselineMs) return false;
    if (this.rolling >= this._baseline * this.cfg.rise) { this._tripped = true; return true; }
    return false;
  }
}

/**
 * The fixed benchmark: the same arithmetic every time, so its duration moves only with the CPU's clock. `n` iterations;
 * the caller calibrates n once so a run takes ~2 ms. Returns a value so the JIT cannot delete the loop.
 */
export function thermalBench(n: number): number {
  let a = 1.0001, b = 0;
  for (let i = 0; i < n; i++) { a = a * 1.0000001 + Math.sqrt(i & 1023); b ^= (i * 2654435761) >>> 0; }
  return a + b;
}
