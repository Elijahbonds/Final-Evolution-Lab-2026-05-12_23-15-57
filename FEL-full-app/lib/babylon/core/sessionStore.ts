// sessionStore — the one place the running game's body session is written down (movement play P3, 2026-09-24).
//
// The harness writes it; the UI reads it through useSyncExternalStore (BootSplash's READY line and PausedLayer's
// subline, BodyControl's card, and — step 5 — GameShell's "did this run count"). Three things:
//   the view    which mode is mounted and what its card says (the profile's lines, whether the body drives it at all,
//               its later phase), whether a body is in frame, the hands-up ring's progress, and why the game paused;
//   the record  the run's play evidence: "input the game received" (owner call 4) — presses and crossings from every
//               source while playing, and the body's claimed verbs. It survives teardown until the next run begins,
//               because the shell asks at handleEnd, after the harness has gone. runId only ever grows, so the shell
//               can tell THIS run's record from the one before (a run that never woke leaves the last one standing).
//   EvidenceCounter  the crossing rules for what counts as one input, shared with the gate replay.
//
// A module singleton on purpose: one game runs at a time, and the readers are React components that cannot be handed
// the harness. Writers replace the view object (never mutate it), so a snapshot changes identity exactly when it
// changes. Pure: no DOM.
//
// MOVEMENT PLAY P3 (2026-09-24, the step-2 review): one game at a time is not one HARNESS at a time. runMode hands its
// disposer back only after the load, so a harness torn down while loading (StrictMode's double effect, a quick
// remount) runs its teardown after the next one has mounted — and a bare sessionStore.unmount() there would blank the
// live card and pause line. So the writers belong to the mount: mount() returns this harness's SessionWriter, and every
// writer on it does nothing once another mount has taken over (or after its own unmount).
//
// MOVEMENT PLAY P4 (2026-09-25): the view carries the game's PHASE too (the harness's setPhase writes it). The body-play
// store feeds the space check only at READY (or over a pause it was asked for), and the header's Body button — which
// lives in the shell and cannot see the host's phase — pauses a game that is playing before it runs the check.
//
// MOVEMENT PLAY P3 step 5 (2026-09-26): the shell reads the record at handleEnd through markRun / countedSince — a mark
// taken when its game mounts (and on REPLAY), and the inputs counted after it.
import type { FelInput } from './InputBus';
import type { ModePhase } from './ModeHarness';
import type { BodyProfile } from '@/lib/input/bodyProfiles';

export type BodyPresence = 'off' | 'calibrating' | 'present' | 'absent';
export type PauseReason = 'input' | 'body-lost' | 'stall';
export interface CardLine { move: string; verb: string }          // "Jump" → "POP"
export interface SessionView {
  modeId: string | null; key: string | null;
  lines: readonly CardLine[]; drives: boolean; later: BodyProfile['later'];
  body: BodyPresence; handsUp01: number;                           // hold-ring progress in READY / PAUSED
  pause: PauseReason | null;
  /** The game's phase, as the harness last set it (null: no game mounted). */
  phase: ModePhase | null;
}
export interface RunRecord { runId: number; modeId: string; inputs: number; bodyInputs: number }

/** Where a reader started watching the run record: the run current then (0 = none yet) and how much it had counted. */
export interface RunMark { runId: number; counted: number }

/** MOVEMENT PLAY P3 step 5 (2026-09-26): mark the record as it stands, so a later read can tell what came after. */
export function markRun(rec: RunRecord | null): RunMark {
  return { runId: rec?.runId ?? 0, counted: rec ? rec.inputs + rec.bodyInputs : 0 };
}

/**
 * The inputs the game received since `mark` (GameShell's `played`, owner call 4). A run begun after the mark counts in
 * full: runId only grows, so the run before it — another page's game, the last match — is never read as this one. The
 * run the mark saw counts only what came after it: a continuous host's in-place REPLAY (Brain Brawl) starts the next
 * match inside the same harness run — no wake, no new record — so its rematch is the presses counted since REPLAY.
 */
export function countedSince(rec: RunRecord | null, mark: RunMark): number {
  if (!rec || rec.runId < mark.runId) return 0;
  const total = rec.inputs + rec.bodyInputs;
  return rec.runId > mark.runId ? total : Math.max(0, total - mark.counted);
}

/** One harness's hold on the store: every writer is a no-op once `live` is false. */
export interface SessionWriter {
  /** This mount is still the current one (no later mount, not unmounted). */
  live(): boolean;
  /** Every body packet writes this: only a change is a new snapshot (a steady 30 Hz of the same presence is not). */
  setBody(body: BodyPresence, handsUp01: number): void;
  setPause(r: PauseReason | null): void;
  /** The harness's setPhase: only a change is a new snapshot. */
  setPhase(p: ModePhase): void;
  /** At wake(): a new run, a new record (the one before it is replaced only now). */
  beginRun(modeId: string): void;
  /** One counted input (EvidenceCounter's verdict, or a claimed onBody verb) into the current run's record. */
  count(src: 'body' | 'external'): void;
  /** The mode is gone: no card, no body line. The run's record is kept (see the header). */
  unmount(): void;
}

const EMPTY: SessionView = { modeId: null, key: null, lines: [], drives: false, later: null, body: 'off', handsUp01: 0, pause: null, phase: null };

let view: SessionView = EMPTY;
let record: RunRecord | null = null;
let runSeq = 0;
/** The current mount's number (0 = none): a writer whose number is not this one is stale. */
let owner = 0;
let mountSeq = 0;
const listeners = new Set<() => void>();
const notify = (): void => { listeners.forEach((fn) => fn()); };

export const sessionStore = {
  view(): SessionView { return view; },
  record(): RunRecord | null { return record; },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },

  // ── the harness's writer ──
  /** A mode mounted: its card, and this harness's writer. The body line and the pause start clear (the harness writes
   *  them as they happen). A later mount makes this writer stale. */
  mount(m: Pick<SessionView, 'modeId' | 'key' | 'lines' | 'drives' | 'later'>): SessionWriter {
    const me = ++mountSeq;
    owner = me;
    view = { ...EMPTY, modeId: m.modeId, key: m.key, lines: m.lines, drives: m.drives, later: m.later };
    notify();
    const live = (): boolean => owner === me;
    return {
      live,
      setBody(body, handsUp01) {
        if (!live() || (view.body === body && view.handsUp01 === handsUp01)) return;
        view = { ...view, body, handsUp01 };
        notify();
      },
      setPause(r) {
        if (!live() || view.pause === r) return;
        view = { ...view, pause: r };
        notify();
      },
      setPhase(p) {
        if (!live() || view.phase === p) return;
        view = { ...view, phase: p };
        notify();
      },
      beginRun(modeId) {
        if (!live()) return;
        record = { runId: ++runSeq, modeId, inputs: 0, bodyInputs: 0 };
        notify();
      },
      count(src) {
        if (!live() || !record) return;
        record = src === 'body' ? { ...record, bodyInputs: record.bodyInputs + 1 } : { ...record, inputs: record.inputs + 1 };
        notify();
      },
      unmount() {
        if (!live()) return;
        owner = 0;
        view = EMPTY;
        notify();
      },
    };
  },
};

/** A stick counts once per push past this (|v|, the vector's length)… */
export const EVIDENCE_STICK_ON = 0.5;
/** …and is re-armed only once it is back under this: a thumb wobbling at 0.5 is one push, not thirty. */
export const EVIDENCE_STICK_OFF = 0.3;
/** A trigger counts crossing this upward (the harness's qaTrig rule, ModeHarness :523-525)… */
export const EVIDENCE_TRIGGER = 0.5;
/** …no sooner than this after the last one it counted (ms): a flickering trigger (two emitters, a noisy pad) is one pull. */
export const EVIDENCE_TRIGGER_MS = 120;

/**
 * "Input the game received": a press, a d-pad press, a stick crossing |v| ≥ 0.5 (re-armed under 0.3), a trigger crossing
 * 0.5 (re-armed under 0.5 for 120 ms, the qaTrig rule). Returns the source counted, or null. A release, a stick at
 * rest, a trigger held steady are not inputs. The source is the event's tag: `src: 'body'` is the body's (the floor's
 * output, or a hand's event carrying the body's value — lib/input/arbiter.ts), anything else is a hand's.
 */
export class EvidenceCounter {
  private stickArmed: Record<'L' | 'R', boolean> = { L: true, R: true };
  private trig: Record<'L' | 'R', number> = { L: 0, R: 0 };
  private trigAt: Record<'L' | 'R', number> = { L: -Infinity, R: -Infinity };

  count(e: FelInput, now: number): 'body' | 'external' | null {
    const src = e.src === 'body' ? 'body' : 'external';
    switch (e.t) {
      case 'button':
      case 'dpad':
        return e.pressed ? src : null;
      case 'stick': {
        const m = Math.hypot(e.x, e.y);
        if (m < EVIDENCE_STICK_OFF) { this.stickArmed[e.side] = true; return null; }
        if (m >= EVIDENCE_STICK_ON && this.stickArmed[e.side]) { this.stickArmed[e.side] = false; return src; }
        return null;
      }
      case 'trigger': {
        const was = this.trig[e.side];
        this.trig[e.side] = e.value;
        if (was < EVIDENCE_TRIGGER && e.value >= EVIDENCE_TRIGGER && now - this.trigAt[e.side] > EVIDENCE_TRIGGER_MS) {
          this.trigAt[e.side] = now;
          return src;
        }
        return null;
      }
    }
  }

  reset(): void {
    this.stickArmed = { L: true, R: true };
    this.trig = { L: 0, R: 0 };
    this.trigAt = { L: -Infinity, R: -Infinity };
  }
}
