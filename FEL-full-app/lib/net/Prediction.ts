// FEL NETPLAY — client-side prediction and reconciliation (2026-09-12).
//
// THE PROBLEM THIS SOLVES. Without prediction a client's own body moves only when the snapshot
// carrying its input comes back, so the player feels their full round trip on their own thumbstick.
// That is the single worst thing about naive netplay and no amount of interpolation hides it.
//
// THE SHAPE. The client applies its own input IMMEDIATELY and keeps every (tick, input, result) it
// produced. When the authority's snapshot for tick T arrives, we compare what we predicted at T
// against what actually happened. Matching (the common case) costs nothing. Diverging means we
// were wrong at T, so we take the authority's state as truth and REPLAY every input since — which
// re-derives the present from a corrected past instead of yanking the body to a stale position.
//
// The simulation step is injected. This file has no Babylon in it and no opinion about what a
// state is, so it is testable to the frame and can drive a capsule, a kart or a ragdoll equally.

/** Re-simulate one tick. MUST be pure: same state + input + dt gives the same result, or replay
 *  produces a different answer than the original run and corrections will never settle. */
export type StepFn<S, I> = (state: S, input: I, dt: number) => S;

/** How far apart two states must be before a correction is worth making. */
export type DistanceFn<S> = (a: S, b: S) => number;

export interface PredictorOptions<S, I> {
  step: StepFn<S, I>;
  distance: DistanceFn<S>;
  /** Divergence below this is ignored — floating point noise is not a correction. */
  tolerance?: number;
  /** Ticks of history kept. Older than this and a late snapshot is simply too late to use. */
  history?: number;
  dt: number;
}

interface Frame<S, I> { tick: number; input: I; after: S }

export interface ReconcileResult {
  /** True when the authority disagreed enough to matter. */
  corrected: boolean;
  /** How wrong we were, in whatever unit `distance` returns. */
  error: number;
  /** Inputs re-simulated to rebuild the present. */
  replayed: number;
}

export class Predictor<S, I> {
  private frames: Frame<S, I>[] = [];
  private _state: S;
  private readonly tolerance: number;
  private readonly history: number;

  constructor(initial: S, private opts: PredictorOptions<S, I>) {
    this._state = initial;
    this.tolerance = opts.tolerance ?? 0.05;
    this.history = opts.history ?? 120;
  }

  /** The predicted present — what the player should see right now. */
  get state(): S { return this._state; }
  get pending(): number { return this.frames.length; }

  /** Apply local input for `tick` immediately, and remember it for a possible replay. */
  predict(tick: number, input: I): S {
    this._state = this.opts.step(this._state, input, this.opts.dt);
    this.frames.push({ tick, input, after: this._state });
    while (this.frames.length > this.history) this.frames.shift();
    return this._state;
  }

  /**
   * The authority has spoken for `tick`. Accept it, and rebuild the present from there.
   *
   * Everything at or before `tick` is now settled and is dropped: it can never be corrected again.
   */
  reconcile(tick: number, authoritative: S): ReconcileResult {
    const idx = this.frames.findIndex((f) => f.tick === tick);
    if (idx === -1) {
      // A snapshot older than our history, or for a tick we never predicted (we just joined).
      // Trust the authority outright rather than inventing a past to compare against.
      const error = this.frames.length ? this.opts.distance(this._state, authoritative) : 0;
      this._state = authoritative;
      this.frames = [];
      return { corrected: true, error, replayed: 0 };
    }

    const predicted = this.frames[idx].after;
    const error = this.opts.distance(predicted, authoritative);
    const after = this.frames.slice(idx + 1);

    if (error <= this.tolerance) {
      // We were right. Keep our own present — replacing it with a re-derived identical value would
      // only add float drift — and forget the settled past.
      this.frames = after;
      return { corrected: false, error, replayed: 0 };
    }

    // We were wrong. Truth at `tick`, then re-apply everything the player has done since.
    let s = authoritative;
    for (const f of after) { s = this.opts.step(s, f.input, this.opts.dt); f.after = s; }
    this._state = s;
    this.frames = after;
    return { corrected: true, error, replayed: after.length };
  }

  /** Joining, respawning, or a teleport the server ordered: drop the past entirely. */
  reset(state: S): void { this._state = state; this.frames = []; }
}

/**
 * Smooths a correction so the player sees a body that closes a gap over a few frames rather than
 * one that teleports. The SIMULATION keeps the corrected value — only the drawn position lags —
 * because rendering a lie is fine but simulating one compounds.
 */
export class CorrectionSmoother {
  private offX = 0; private offY = 0; private offZ = 0;

  /** Called when a correction lands: remember how far the body just jumped. */
  absorb(fromX: number, fromY: number, fromZ: number, toX: number, toY: number, toZ: number): void {
    this.offX += fromX - toX; this.offY += fromY - toY; this.offZ += fromZ - toZ;
  }

  /** Decay toward zero. `rate` is the fraction of the remaining error removed per second. */
  update(dt: number, rate = 8): void {
    const k = Math.max(0, 1 - rate * dt);
    this.offX *= k; this.offY *= k; this.offZ *= k;
  }

  /** Visual offset to add to the simulated position this frame. */
  get offset(): { x: number; y: number; z: number } { return { x: this.offX, y: this.offY, z: this.offZ }; }
  get magnitude(): number { return Math.hypot(this.offX, this.offY, this.offZ); }
}
