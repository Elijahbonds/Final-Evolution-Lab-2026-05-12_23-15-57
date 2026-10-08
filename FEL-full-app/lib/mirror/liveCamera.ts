// liveCamera — the Mirror's camera on a propped-up phone (MIRROR-FIRST P1, 2026-10-07; plan Phase 1, "a first session
// that survives a propped-up phone"). The pure halves of app/play/mirror/_components/use-mirror-camera.ts, kept here so
// node tests can drive them with stand-ins (no React, no DOM, no camera):
//
//   FrameView      per-camera-frame values the stage shows (the phase word, the rep count, the zone rows, the pacer's
//                  seconds…) are WRITTEN every frame and PUBLISHED at most HUD_HZ times a second. The harness used to
//                  call four setStates on every pose frame (and more per pattern), so a phone re-rendered the whole
//                  1,700-line page ~30 times a second beside the pose model. The graders and the cues still run on every
//                  frame, from refs; only what is painted waits for the next publish.
//   MirrorWakeLock the screen stays on while the camera is live (owner decision 7, 2026-10-07: always on, no setting),
//                  and the lock is asked for again when the page is visible again — a browser drops it on every hide and
//                  never gives it back by itself (the same lesson as lib/controller-link/presence.ts).
//   PoseClock      the session clock the graders read runs only while the camera is on: a set paused by the tab going
//                  to the background resumes one frame after it stopped, so the breath pacer does not "finish" during a
//                  phone call and a cue's escalation timer does not fire on the first frame back.
//   mergeSummaries one session across a pause: each camera stretch has its own runtime (the camera is OFF while the
//                  tab is hidden, owner decision 7), and End reports them as one.
//   InShotLine     framing's one line (lib/mirror/framing.ts — the same rules the games' space check builds its body
//                  rule on) for the in-shot problems only, shown once the problem has held for a moment.
//
// Nothing here sends or stores anything.
import type { SessionSummary } from '@/lib/babylon/nexus/neuro-mirror/render/overlay-compositor';
import { framingLine, type FramingCheck, type FramingIssue } from './framing';

/** How often the stage repaints its per-frame readouts. TUNE(elijah): 10 Hz reads as live for a count and a phase word,
 *  and leaves a mid-range phone's frame budget to the pose model. */
export const HUD_HZ = 10;
/** The pose clock's step across a pause: one camera frame at the 30 Hz cap (lib/pose/PoseService.ts). */
export const NOMINAL_FRAME_MS = 1000 / 30;
/** An in-shot problem is shown once it has held this long, so a single dropped frame never flashes a line. TUNE(elijah) */
export const IN_SHOT_HOLD_MS = 1000;

// ── FrameView ────────────────────────────────────────────────────────────────────────────────────────────────────

export interface FrameViewDeps {
  now(): number;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(id: unknown): void;
}

/**
 * A small store: `set` takes this frame's values, `shown` is what the page paints. A publish happens at most `hz` times a
 * second; between publishes one trailing timer makes sure the last value written is shown even when frames stop.
 * `{ now: true }` publishes at once — for a user's own action (Start, Resume) and a change the page acts on (a screen
 * station finishing), never for a plain frame.
 */
export class FrameView<T extends object> {
  private pending: T;
  private current: T;
  private dirty = false;
  private lastPublishMs = -Infinity;
  private timer: unknown = null;
  private readonly listeners = new Set<() => void>();
  private readonly intervalMs: number;
  /** How many times the view has been published (a test reads it; each one is one React render of the page). */
  publishes = 0;

  constructor(initial: T, hz: number, private readonly deps: FrameViewDeps) {
    this.current = initial;
    this.pending = { ...initial };
    this.intervalMs = 1000 / Math.max(1, hz);
  }

  /** What the page shows now. The same object until the next publish (a stable snapshot for useSyncExternalStore). */
  shown = (): T => this.current;

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  };

  set = (patch: Partial<T>, opts: { now?: boolean } = {}): void => {
    Object.assign(this.pending, patch);
    this.dirty = true;
    if (opts.now) { this.publish(); return; }
    const t = this.deps.now();
    const due = this.lastPublishMs + this.intervalMs;
    if (t >= due) { this.publish(); return; }
    if (this.timer === null) {
      this.timer = this.deps.setTimer(() => { this.timer = null; if (this.dirty) this.publish(); }, due - t);
    }
  };

  /** Publish whatever is pending now. */
  flush = (): void => { if (this.dirty) this.publish(); };

  /** Drop the trailing timer (unmount). Listeners stay: React unsubscribes its own. */
  dispose(): void {
    if (this.timer !== null) { this.deps.clearTimer(this.timer); this.timer = null; }
  }

  private publish(): void {
    if (this.timer !== null) { this.deps.clearTimer(this.timer); this.timer = null; }
    this.dirty = false;
    this.lastPublishMs = this.deps.now();
    this.current = this.pending;
    this.pending = { ...this.current };
    this.publishes += 1;
    for (const fn of this.listeners) fn();
  }
}

// ── MirrorWakeLock ───────────────────────────────────────────────────────────────────────────────────────────────

/** 'held' the screen is kept on · 'unsupported' this browser has no Screen Wake Lock (iOS before 16.4, most desktop
 *  Safari) · 'refused' the browser said no (battery saver, a policy) · 'off' not asked for, or dropped while hidden. */
export type WakeLockState = 'off' | 'held' | 'unsupported' | 'refused';

export interface WakeSentinelLike {
  release(): Promise<void>;
  addEventListener(type: 'release', fn: () => void): void;
}
export interface WakeLockApiLike { request(type: 'screen'): Promise<WakeSentinelLike> }
export interface VisibilityDocLike {
  visibilityState: string;
  addEventListener(type: 'visibilitychange', fn: () => void): void;
  removeEventListener(type: 'visibilitychange', fn: () => void): void;
}

export class MirrorWakeLock {
  private want = false;
  private sentinel: WakeSentinelLike | null = null;
  private asking = false;
  state: WakeLockState = 'off';

  constructor(
    private readonly api: WakeLockApiLike | null | undefined,
    private readonly doc: VisibilityDocLike | null | undefined,
    private readonly onChange: (s: WakeLockState) => void = () => {},
  ) {
    doc?.addEventListener('visibilitychange', this.onVisibility);
  }

  /** Keep the screen on from now until release(). Safe to call again while held. */
  hold(): Promise<void> {
    this.want = true;
    return this.acquire();
  }

  /** Let the screen sleep again. Safe to call when nothing is held. */
  async release(): Promise<void> {
    this.want = false;
    const s = this.sentinel;
    this.sentinel = null;
    if (this.state === 'held') this.set('off');
    try { await s?.release(); } catch { /* already gone */ }
  }

  dispose(): void {
    this.doc?.removeEventListener('visibilitychange', this.onVisibility);
    void this.release();
  }

  get holding(): boolean { return this.sentinel !== null; }

  // THE RE-ACQUIRE. A browser releases the lock on every hide and does not restore it: back on the page while the camera
  // is live, ask again (lib/controller-link/presence.ts, the same lesson for a TV host).
  private onVisibility = (): void => {
    if (this.doc?.visibilityState === 'visible' && this.want && !this.sentinel) void this.acquire();
  };

  private async acquire(): Promise<void> {
    if (!this.api) { this.set('unsupported'); return; }
    if (this.sentinel || this.asking) return;
    // a hidden page cannot hold one (the request rejects): the visibility handler asks when it is shown again
    if (this.doc && this.doc.visibilityState !== 'visible') return;
    this.asking = true;
    try {
      const s = await this.api.request('screen');
      this.asking = false;
      if (!this.want) { try { await s.release(); } catch { /* fine */ } return; }
      this.sentinel = s;
      s.addEventListener('release', () => {
        if (this.sentinel !== s) return;
        this.sentinel = null;
        this.set('off');
      });
      this.set('held');
    } catch {
      this.asking = false;
      this.set('refused');
    }
  }

  private set(s: WakeLockState): void {
    if (this.state === s) return;
    this.state = s;
    this.onChange(s);
  }
}

/** The one line the stage says when the screen may lock mid-set; nothing while it is held or not asked for. */
export function wakeLockLine(s: WakeLockState): string | null {
  if (s === 'unsupported') return 'This browser cannot keep the screen on — turn auto-lock off for this set.';
  if (s === 'refused') return 'The screen could not be kept on (battery saver?) — turn auto-lock off for this set.';
  return null;
}

// ── PoseClock ────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The camera frame's time as the graders read it. Until the first pause it is the frame's own time, unchanged (offset
 * 0: the uninterrupted session is exactly what it was). After `pause()`, the next frame is stamped one nominal frame after
 * the last one before it, and every frame after keeps that offset: the time the camera was off never happened, to the
 * session.
 */
export class PoseClock {
  private offset = 0;
  private last: number | null = null;
  private resumeNext = false;

  pause(): void { this.resumeNext = true; }

  stamp(rawMs: number): number {
    if (this.resumeNext && this.last !== null) this.offset = rawMs - (this.last + NOMINAL_FRAME_MS);
    this.resumeNext = false;
    const t = rawMs - this.offset;
    this.last = t;
    return t;
  }
}

// ── mergeSummaries ───────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Two camera stretches of one session as one summary. Counts and times add; the per-frame cost is weighted by time on
 * camera and the tempo by reps. `durationMs` is time with the camera ON (a pause is not part of the set).
 */
export function mergeSummaries(a: SessionSummary | null, b: SessionSummary | null): SessionSummary | null {
  if (!a) return b;
  if (!b) return a;
  const add = <K extends string>(x: Record<K, number>, y: Record<K, number>): Record<K, number> => {
    const out = { ...x };
    for (const k of Object.keys(y) as K[]) out[k] = (x[k] ?? 0) + (y[k] ?? 0);
    return out;
  };
  const dur = a.durationMs + b.durationMs;
  const reps = a.reps + b.reps;
  const tempo = (() => {
    if (!a.avgTempo) return b.avgTempo;
    if (!b.avgTempo) return a.avgTempo;
    const wa = a.reps, wb = b.reps;
    if (wa + wb === 0) return b.avgTempo;
    return {
      pullSec: (a.avgTempo.pullSec * wa + b.avgTempo.pullSec * wb) / (wa + wb),
      pressSec: (a.avgTempo.pressSec * wa + b.avgTempo.pressSec * wb) / (wa + wb),
    };
  })();
  return {
    patternId: a.patternId,
    startedAtMs: a.startedAtMs,
    durationMs: dur,
    timeInStableMs: add(a.timeInStableMs, b.timeInStableMs),
    faultCounts: add(a.faultCounts, b.faultCounts),
    avgFrameMs: dur > 0 ? (a.avgFrameMs * a.durationMs + b.avgFrameMs * b.durationMs) / dur : 0,
    reps,
    avgTempo: tempo,
  };
}

// ── the camera's honest errors ───────────────────────────────────────────────────────────────────────────────────

/** A denied camera, a missing camera and a dead 3D overlay are three different problems (measured: a WebGL-less
 *  environment hit the overlay path and the page blamed the camera). Moved unchanged from mirror-harness.tsx. */
export function cameraErrorLine(e: unknown): string {
  const name = (e as { name?: unknown } | null)?.name;
  return name === 'NotAllowedError'
    ? 'Camera permission denied. Allow camera access and try again.'
    : name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'NotReadableError'
      ? 'Camera unavailable in this browser/environment.'
      : 'The coaching overlay failed to start (3D renderer). Try a WebGL-capable browser.';
}

// ── InShotLine ───────────────────────────────────────────────────────────────────────────────────────────────────

/** The problems that mean the camera cannot see the body at all, whatever the movement's view: the ones a propped phone
 *  gets wrong first. ('turned', 'offCentre', 'dim' are the movement's own business — the squat's square-up line, the
 *  lunge's turn line, the screen's runner.) */
export const IN_SHOT_ISSUES: readonly FramingIssue[] = ['noBody', 'cutOffBottom', 'cutOffTop'];

/** framing's line for an in-shot problem that has held IN_SHOT_HOLD_MS on the pose clock; null otherwise. */
export class InShotLine {
  private issue: FramingIssue | null = null;
  private sinceMs = 0;

  step(check: Pick<FramingCheck, 'issues'>, nowMs: number): string | null {
    const issue = IN_SHOT_ISSUES.find((i) => check.issues.includes(i)) ?? null;
    if (issue !== this.issue) { this.issue = issue; this.sinceMs = nowMs; }
    return issue && nowMs - this.sinceMs >= IN_SHOT_HOLD_MS ? framingLine(issue) : null;
  }

  reset(): void { this.issue = null; this.sinceMs = 0; }
}
