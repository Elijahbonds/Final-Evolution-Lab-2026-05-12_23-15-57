// MIRROR-FIRST P1 (2026-10-07): the Mirror's camera life on a propped-up phone, the pure halves (lib/mirror/liveCamera.ts).
// The mounted harness is driven in tests/mirror-first/harness-live.test.ts.
import { describe, expect, it, vi } from 'vitest';
import type { SessionSummary } from '@/lib/babylon/nexus/neuro-mirror/render/overlay-compositor';
import {
  FrameView, HUD_HZ, IN_SHOT_HOLD_MS, InShotLine, MirrorWakeLock, NOMINAL_FRAME_MS, PoseClock, cameraErrorLine,
  mergeSummaries, wakeLockLine, type WakeSentinelLike,
} from './liveCamera';
import { framingLine } from './framing';

/** A clock and a timer queue the test advances by hand. */
function fakeClock() {
  let t = 0;
  let timers: { at: number; fn: () => void; id: number }[] = [];
  let nextId = 1;
  return {
    now: () => t,
    setTimer: (fn: () => void, ms: number) => { const id = nextId++; timers.push({ at: t + ms, fn, id }); return id; },
    clearTimer: (id: unknown) => { timers = timers.filter((x) => x.id !== id); },
    advance(ms: number) {
      const end = t + ms;
      for (;;) {
        const due = timers.filter((x) => x.at <= end).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        timers = timers.filter((x) => x !== due);
        t = due.at;
        due.fn();
      }
      t = end;
    },
  };
}

describe('FrameView: written every frame, published at most HUD_HZ a second', () => {
  it(`30 frames a second for 3 s publish at most ${HUD_HZ} times a second (it was one render per frame: 90)`, () => {
    const clock = fakeClock();
    const view = new FrameView({ phase: 'hold', n: 0 }, HUD_HZ, clock);
    let renders = 0;
    view.subscribe(() => { renders += 1; });
    for (let i = 1; i <= 90; i++) {
      clock.advance(1000 / 30);
      // several writes a frame, as the harness makes them
      view.set({ phase: i % 2 ? 'pull' : 'press' });
      view.set({ n: i });
    }
    expect(renders).toBeGreaterThanOrEqual(25);            // still live: about ten a second
    expect(renders).toBeLessThanOrEqual(3 * HUD_HZ + 1);
    expect(view.publishes).toBe(renders);
  });

  it('the last value written is shown even when the frames stop (the trailing publish)', () => {
    const clock = fakeClock();
    const view = new FrameView({ n: 0 }, HUD_HZ, clock);
    view.set({ n: 1 });                                      // publishes at once (nothing published yet)
    expect(view.shown().n).toBe(1);
    clock.advance(10);
    view.set({ n: 2 });                                      // inside the interval: waits
    expect(view.shown().n).toBe(1);
    clock.advance(1000 / HUD_HZ);
    expect(view.shown().n).toBe(2);
  });

  it('{ now: true } publishes at once; the snapshot is stable between publishes', () => {
    const clock = fakeClock();
    const view = new FrameView({ n: 0, s: 'a' }, HUD_HZ, clock);
    view.set({ n: 1 });
    const a = view.shown();
    clock.advance(5);
    view.set({ n: 2 });
    expect(view.shown()).toBe(a);                            // same object: useSyncExternalStore sees no change
    view.set({ s: 'b' }, { now: true });
    expect(view.shown()).toEqual({ n: 2, s: 'b' });
    expect(view.shown()).not.toBe(a);
  });
});

/** navigator.wakeLock and document's visibility, faked: the browser releases the lock on every hide. */
function fakeWakeWorld(opts: { refuse?: boolean } = {}) {
  const listeners = new Set<() => void>();
  const doc = {
    visibilityState: 'visible' as 'visible' | 'hidden',
    addEventListener: (_t: 'visibilitychange', fn: () => void) => { listeners.add(fn); },
    removeEventListener: (_t: 'visibilitychange', fn: () => void) => { listeners.delete(fn); },
  };
  const held: { released: boolean; fire(): void }[] = [];
  const api = {
    request: vi.fn(async (_type: 'screen'): Promise<WakeSentinelLike> => {
      if (opts.refuse) throw Object.assign(new Error('nope'), { name: 'NotAllowedError' });
      const onRelease: (() => void)[] = [];
      const s = {
        released: false,
        fire() { if (!s.released) { s.released = true; onRelease.forEach((f) => f()); } },
        release: async () => { s.fire(); },
        addEventListener: (_t: 'release', fn: () => void) => { onRelease.push(fn); },
      };
      held.push(s);
      return s;
    }),
  };
  const setVisibility = (v: 'visible' | 'hidden') => {
    doc.visibilityState = v;
    if (v === 'hidden') held.forEach((s) => s.fire());     // what a browser does to a screen wake lock on hide
    listeners.forEach((f) => f());
  };
  const live = () => held.filter((s) => !s.released).length;
  return { doc, api, setVisibility, live, listeners };
}
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('MirrorWakeLock: on while the camera is, and asked for again when the page is back', () => {
  it('holds, is dropped by the browser on hide, and is RE-ACQUIRED when the page is visible again', async () => {
    const w = fakeWakeWorld();
    const states: string[] = [];
    const lock = new MirrorWakeLock(w.api, w.doc, (s) => states.push(s));
    await lock.hold();
    expect(lock.state).toBe('held');
    expect(w.live()).toBe(1);
    w.setVisibility('hidden');
    expect(lock.state).toBe('off');
    expect(w.live()).toBe(0);
    w.setVisibility('visible');
    await settle();
    expect(w.api.request).toHaveBeenCalledTimes(2);
    expect(lock.state).toBe('held');
    expect(w.live()).toBe(1);
    expect(states).toEqual(['held', 'off', 'held']);
  });

  it('after release() a visible page does NOT take it again (the camera is off: the phone may sleep)', async () => {
    const w = fakeWakeWorld();
    const lock = new MirrorWakeLock(w.api, w.doc);
    await lock.hold();
    await lock.release();
    expect(w.live()).toBe(0);
    w.setVisibility('hidden');
    w.setVisibility('visible');
    await settle();
    expect(w.api.request).toHaveBeenCalledTimes(1);
    expect(lock.state).toBe('off');
  });

  it('asked while hidden: nothing is requested until the page is visible', async () => {
    const w = fakeWakeWorld();
    w.doc.visibilityState = 'hidden';
    const lock = new MirrorWakeLock(w.api, w.doc);
    await lock.hold();
    expect(w.api.request).not.toHaveBeenCalled();
    w.setVisibility('visible');
    await settle();
    expect(lock.state).toBe('held');
  });

  it('a lock that arrives after release() is let go at once', async () => {
    const w = fakeWakeWorld();
    const lock = new MirrorWakeLock(w.api, w.doc);
    const p = lock.hold();
    void lock.release();
    await p;
    expect(w.live()).toBe(0);
    expect(lock.holding).toBe(false);
  });

  it('no API: unsupported, and the stage says to turn auto-lock off; a refusal says so too; held says nothing', async () => {
    const none = new MirrorWakeLock(null, fakeWakeWorld().doc);
    await none.hold();
    expect(none.state).toBe('unsupported');
    expect(wakeLockLine('unsupported')).toMatch(/auto-lock/);
    const w = fakeWakeWorld({ refuse: true });
    const refused = new MirrorWakeLock(w.api, w.doc);
    await refused.hold();
    expect(refused.state).toBe('refused');
    expect(wakeLockLine('refused')).toMatch(/auto-lock/);
    expect(wakeLockLine('held')).toBeNull();
    expect(wakeLockLine('off')).toBeNull();
  });

  it('dispose() stops listening and lets go', async () => {
    const w = fakeWakeWorld();
    const lock = new MirrorWakeLock(w.api, w.doc);
    await lock.hold();
    lock.dispose();
    await settle();
    expect(w.listeners.size).toBe(0);
    expect(w.live()).toBe(0);
  });
});

describe('PoseClock: the session clock runs only while the camera is on', () => {
  it('untouched until the first pause (an uninterrupted session is exactly what it was)', () => {
    const c = new PoseClock();
    for (const t of [1000, 1033.3, 1066.7, 5000]) expect(c.stamp(t)).toBe(t);
  });

  it('after a pause the next frame is one frame on, and the frames after keep that step', () => {
    const c = new PoseClock();
    c.stamp(1000); c.stamp(1033);
    c.pause();
    expect(c.stamp(61_000)).toBeCloseTo(1033 + NOMINAL_FRAME_MS, 6);    // a minute away is one frame to the graders
    expect(c.stamp(61_033)).toBeCloseTo(1033 + NOMINAL_FRAME_MS + 33, 6);
    c.pause();
    expect(c.stamp(200_000)).toBeCloseTo(1033 + NOMINAL_FRAME_MS + 33 + NOMINAL_FRAME_MS, 6);
  });
});

const sum = (o: Partial<SessionSummary>): SessionSummary => ({
  patternId: 'split_stance_press_row', startedAtMs: 0, durationMs: 0, avgFrameMs: 0, reps: 0, avgTempo: null,
  timeInStableMs: { posterior_chain: 0, lat_rhomboid: 0, upper_traps: 0, rib_thoracic: 0, lumbo_pelvic: 0 },
  faultCounts: { posterior_chain: 0, lat_rhomboid: 0, upper_traps: 0, rib_thoracic: 0, lumbo_pelvic: 0 },
  ...o,
});

describe('mergeSummaries: one session across a pause', () => {
  it('counts and times add; frame cost by time on camera; tempo by reps', () => {
    const a = sum({ startedAtMs: 10, durationMs: 30_000, avgFrameMs: 20, reps: 3, avgTempo: { pullSec: 1, pressSec: 2 },
      timeInStableMs: { posterior_chain: 1000, lat_rhomboid: 0, upper_traps: 0, rib_thoracic: 0, lumbo_pelvic: 0 },
      faultCounts: { posterior_chain: 1, lat_rhomboid: 0, upper_traps: 2, rib_thoracic: 0, lumbo_pelvic: 0 } });
    const b = sum({ startedAtMs: 99_000, durationMs: 10_000, avgFrameMs: 40, reps: 1, avgTempo: { pullSec: 3, pressSec: 2 },
      timeInStableMs: { posterior_chain: 500, lat_rhomboid: 0, upper_traps: 0, rib_thoracic: 0, lumbo_pelvic: 0 },
      faultCounts: { posterior_chain: 0, lat_rhomboid: 0, upper_traps: 1, rib_thoracic: 0, lumbo_pelvic: 0 } });
    const m = mergeSummaries(a, b)!;
    expect(m.startedAtMs).toBe(10);
    expect(m.durationMs).toBe(40_000);                                  // camera-on time: the pause is not the set
    expect(m.reps).toBe(4);
    expect(m.avgFrameMs).toBeCloseTo(25, 6);
    expect(m.avgTempo).toEqual({ pullSec: 1.5, pressSec: 2 });
    expect(m.timeInStableMs.posterior_chain).toBe(1500);
    expect(m.faultCounts.upper_traps).toBe(3);
  });

  it('nothing to merge returns the other side; nothing at all is null', () => {
    const a = sum({ reps: 2 });
    expect(mergeSummaries(null, a)).toBe(a);
    expect(mergeSummaries(a, null)).toBe(a);
    expect(mergeSummaries(null, null)).toBeNull();
  });
});

describe('the camera errors say which problem it is', () => {
  it('denied, missing, and a dead overlay are three lines', () => {
    expect(cameraErrorLine({ name: 'NotAllowedError' })).toMatch(/permission denied/);
    for (const name of ['NotFoundError', 'OverconstrainedError', 'NotReadableError']) expect(cameraErrorLine({ name })).toMatch(/unavailable/);
    expect(cameraErrorLine(new Error('webgl'))).toMatch(/3D renderer/);
    expect(cameraErrorLine(null)).toMatch(/3D renderer/);
  });
});

describe('InShotLine: framing\'s line for a body the camera cannot see whole, once it has held', () => {
  it('feet out of shot for IN_SHOT_HOLD_MS says framing\'s feet line; a good shot clears it at once', () => {
    const l = new InShotLine();
    expect(l.step({ issues: ['cutOffBottom'] }, 0)).toBeNull();
    expect(l.step({ issues: ['cutOffBottom', 'tooClose'] }, IN_SHOT_HOLD_MS - 1)).toBeNull();
    expect(l.step({ issues: ['cutOffBottom'] }, IN_SHOT_HOLD_MS)).toBe(framingLine('cutOffBottom'));
    expect(l.step({ issues: [] }, IN_SHOT_HOLD_MS + 33)).toBeNull();
  });

  it('only the in-shot problems: a turned or off-centre body is the movement\'s own business', () => {
    const l = new InShotLine();
    l.step({ issues: ['turned', 'offCentre', 'dim'] }, 0);
    expect(l.step({ issues: ['turned', 'offCentre', 'dim'] }, 5_000)).toBeNull();
  });

  it('a different problem starts its own hold', () => {
    const l = new InShotLine();
    l.step({ issues: ['noBody'] }, 0);
    expect(l.step({ issues: ['noBody'] }, 2_000)).toBe(framingLine('noBody'));
    expect(l.step({ issues: ['cutOffTop'] }, 2_033)).toBeNull();
    expect(l.step({ issues: ['cutOffTop'] }, 2_033 + IN_SHOT_HOLD_MS)).toBe(framingLine('cutOffTop'));
  });
});
