// loadPlan — play sooner, stream the rest (PERF-LOAD PRF-04, 2026-10-25).
//
// Owner, 2026-10-20 (QUALITY / SMOOTHNESS): "Loading: play sooner, stream the rest ... for every mode." Owner, 2026-10-20
// (DOCS AUDIT): the load budget is 8 s to playable and 20 s to full on a mid-range phone (docs/LAUNCH-CHECKLIST.md B4).
// The first dunk on /try showed the shape (FIRST-DUNK-BUDGET 6abc52c2): the court, the hoop, the ball and you load; the prop
// set, the rival's bench, the onlookers and the voice audio come after. This file is that shape for every mode.
//
// A MOUNT'S LOAD PLAN. The harness makes one per mount. While the mode's load() runs, anything handed to it is HELD:
//   * ctx.stream(label, job): a mode's own extra (props, crowd, dressing) — work no rule and no score reads;
//   * streamWhileLoading(label, job): the same, for shared visual code that runs inside a load without a ctx (VenueProps'
//     CC0 prop sets, which every venue and board world mounts with `void`, so a later start is invisible to its callers).
// Held jobs start once the first frame after READY has been drawn (READY is the first playable frame: the player can start),
// one at a time with a frame between them, so the main-thread work of a prop set lands between frames, not in one of them.
// Each job's new meshes are asked for their shaders right away (mesh.isReady), so the compile starts in the job's own frame.
//
// WHAT MAY STREAM: only what nothing in the game's rules reads — the scenery, the crowd, the dressing. The player, the ball,
// the target, the rivals and every collider stay in load(). A stream job must never feed a score, a timer or a random draw
// the game reads (the scripted-run test in loadPlan.test.ts holds the planned and unplanned loads to the same trace).
//
// THE HOOPS MODES ARE NOT PLANNED HERE: their files belong to hoops-round2, which adopts this later (the dunk already streams
// its contest set its own way). `planStreams(modeId)` is false for them, so their loads are exactly as before.
//
// The plan is reported on the dev handle (`__FEL_DEV__.stream()`): held, done, failed, when the first job started and the last
// finished — the "full" time the owner's 20 s budget is measured against.

/** A deferred piece of work. Its result is the caller's; a throw is logged and counted, never thrown at the game. */
export type StreamJob = () => unknown | Promise<unknown>;

/** A held job that never ran: its mount went first. */
export class DroppedError extends Error {
  constructor(label: string) { super(`stream "${label}" dropped: the mount went first`); this.name = 'DroppedError'; }
}

/**
 * Frames of play the plan waits before it runs (or goes on running) its extras (new, 2026-10-25). READY is the first playable
 * frame and the extras start there, while the player reads the start card; the START press would otherwise land the next job's
 * main-thread work (a GLB parse, a body's spawn) in the countdown or the first frame of play. Half a second at 60 fps.
 */
export const STREAM_HOLD_FRAMES = 30;

/** Modes whose loads stay as they were (hoops-round2 adopts the plan for them; the dunk streams its own contest set). */
export const HOOPS_LATER: ReadonlySet<string> = new Set(['dunk', 'dunkduel', 'onevone', 'threepoint', 'threevthree', 'carnival']);

/** Does this mode's mount hold its extras for after READY? Every mode but the hoops family. */
export function planStreams(modeId: string): boolean {
  return !HOOPS_LATER.has(modeId);
}

export interface StreamState {
  /** Jobs held so far (all of them, run or not). */
  held: number;
  done: number;
  failed: number;
  /** ms (the plan's clock) when the first job started, and when the last one ended; null until then. */
  startedAt: number | null;
  doneAt: number | null;
  labels: string[];
}

export interface LoadPlanDeps {
  now(): number;
  /** Resolves after the next rendered frame (the harness: the scene's next onAfterRender). */
  nextFrame(): Promise<void>;
  /** Start the shaders of what a job built (the harness: isReady on the meshes the job added). */
  warm?(before: number): void;
  /** A count the job's warm step diffs against (the harness: scene.meshes.length). */
  mark?(): number;
  log?(msg: string): void;
}

export class LoadPlan {
  private queue: Array<{ label: string; job: StreamJob; resolve: (v: unknown) => void; reject: (e: unknown) => void }> = [];
  private running = false;
  private open = false;
  private holdLeft = 0;
  private disposed = false;
  private s: StreamState = { held: 0, done: 0, failed: 0, startedAt: null, doneAt: null, labels: [] };

  constructor(private readonly deps: LoadPlanDeps) {}

  /** Hold `job` until start() (or run it after the ones already held, once the plan is open). Resolves with its result. */
  defer<T>(label: string, job: () => T | Promise<T>): Promise<T> {
    if (this.disposed) return Promise.reject(new DroppedError(label));
    this.s.held++; this.s.labels.push(label);
    const p = new Promise<T>((resolve, reject) => {
      this.queue.push({ label, job, resolve: resolve as (v: unknown) => void, reject });
    });
    if (this.open) void this.pump();
    return p;
  }

  /** Open the plan: run what is held, one job a frame. Idempotent. */
  start(): void {
    if (this.open || this.disposed) return;
    this.open = true;
    void this.pump();
  }

  get isOpen(): boolean { return this.open; }

  /** Run nothing new for the next `frames` rendered frames (a job already running finishes). The harness holds the plan as
   *  play begins (STREAM_HOLD_FRAMES), so the first frames of play are the game's alone. A later hold restarts the count. */
  hold(frames: number): void { this.holdLeft = Math.max(0, Math.floor(frames)); }

  private async pump(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length && !this.disposed) {
        while (this.holdLeft > 0 && !this.disposed) { this.holdLeft--; await this.deps.nextFrame(); }
        if (this.disposed || !this.queue.length) break;
        const item = this.queue.shift()!;
        if (this.s.startedAt === null) this.s.startedAt = this.deps.now();
        const before = this.deps.mark?.() ?? 0;
        try {
          const v = await item.job();
          this.s.done++;
          if (!this.disposed) this.deps.warm?.(before);
          item.resolve(v);
        } catch (e) {
          this.s.failed++;
          this.deps.log?.(`[FEL-PERF] stream "${item.label}" failed: ${String((e as Error)?.message ?? e).slice(0, 160)}`);
          item.reject(e);
        }
        if (this.queue.length && !this.disposed) await this.deps.nextFrame();
      }
      if (!this.disposed && this.s.held > 0 && this.s.done + this.s.failed === this.s.held) {
        this.s.doneAt = this.deps.now();
        this.deps.log?.(`[FEL-PERF] streamed ${this.s.done} extra${this.s.done === 1 ? '' : 's'} after READY in ${Math.round(this.s.doneAt - (this.s.startedAt ?? this.s.doneAt))} ms${this.s.failed ? ` (${this.s.failed} failed)` : ''}`);
      }
    } finally {
      this.running = false;
    }
  }

  state(): StreamState { return { ...this.s, labels: [...this.s.labels] }; }

  /** The mount is going: nothing held runs (each held promise rejects with a DroppedError; a job already running finishes). */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const q of this.queue.splice(0)) q.reject(new DroppedError(q.label));
    if (activePlan === this) activePlan = null;
  }

  /** While load() runs, shared code reaches this plan through streamWhileLoading(). */
  enterLoad(): void { if (!this.disposed) setActivePlan(this); }
  exitLoad(): void { if (activePlan === this) activePlan = null; }
}

/** The plan whose mode's load() is running right now, if any (one load runs at a time per page). */
let activePlan: LoadPlan | null = null;
function setActivePlan(p: LoadPlan | null): void { activePlan = p; }

/**
 * For shared visual code that runs inside a mode's load(): hold `job` for after READY when a planned load is running, run it
 * now otherwise (a hoops load, a test, the studio editor, any call after READY). The caller treats the result as async either
 * way, so a later start changes when the work happens, never what it does.
 */
export function streamWhileLoading<T>(label: string, job: () => T | Promise<T>, dropped: T): Promise<T> {
  const plan = activePlan;
  if (!plan || plan.isOpen) return Promise.resolve().then(job);
  // held: a job that runs and fails rejects as it would have; one the mount dropped (it went first) resolves to `dropped`
  return plan.defer(label, job).catch((e: unknown) => (e instanceof DroppedError ? dropped : Promise.reject(e)));
}

/** For a mode: hand an extra to the harness's plan (ctx.stream) when it has one; run it now otherwise (a test's fake ctx). */
export function streamExtra(ctx: { stream?: (label: string, job: StreamJob) => void }, label: string, job: StreamJob): void {
  if (ctx.stream) { ctx.stream(label, job); return; }
  void Promise.resolve().then(job).catch((e) => console.warn(`[FEL-PERF] extra "${label}" failed`, e));
}

/** Tests only. */
export function _activePlan(): LoadPlan | null { return activePlan; }
