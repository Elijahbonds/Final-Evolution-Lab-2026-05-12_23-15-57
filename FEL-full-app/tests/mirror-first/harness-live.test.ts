// MIRROR-FIRST P1 (2026-10-07): the real Mirror harness, MOUNTED (tests/helpers/hookRuntime.ts), with the camera, the pose
// runtime, navigator.wakeLock and the page's visibility faked. What the plan's Phase 1 asks of a propped-up phone:
//
//   - while live the page re-renders at most ~10 times a second, for every pattern (it was once per pose frame);
//   - the screen is kept awake while the camera is on, and not while it is off;
//   - a hidden tab turns the camera off (every track stopped: the light goes off) and pauses the session; Resume brings it
//     back with the set where it was — the press/row count carried, the squat's breath not "finished" by the time away;
//   - a minor's path (canSaveScan false: page.tsx's canSaveScanNumbers is false under 18) sends nothing, paused or not.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react', async (importOriginal) => (await import('@/tests/helpers/hookRuntime')).hookedReact(await importOriginal()));

const rig = vi.hoisted(() => ({
  sessions: [] as {
    opts: { analysis?: string; onReady?: () => void; onFrame?: (info: unknown) => void };
    disposed: boolean;
    reps: number;
  }[],
}));
// The pose runtime (Babylon + MediaPipe) stood in for: it hands the harness frames when the test says so.
vi.mock('@/lib/babylon/nexus/neuro-mirror', () => {
  const zero = () => ({ posterior_chain: 0, lat_rhomboid: 0, upper_traps: 0, rib_thoracic: 0, lumbo_pelvic: 0 });
  return {
    NeuroMirror: {
      async session(opts: { onReady?: () => void; onFrame?: (info: unknown) => void }) {
        const s = { opts, disposed: false, reps: 0 };
        rig.sessions.push(s);
        queueMicrotask(() => opts.onReady?.());
        return {
          ready: () => true,
          summary: () => ({
            patternId: 'split_stance_press_row', startedAtMs: 0, durationMs: 1000, timeInStableMs: zero(), faultCounts: zero(),
            avgFrameMs: 10, reps: s.reps, avgTempo: null,
          }),
          dispose: () => { s.disposed = true; },
        };
      },
    },
  };
});

import { MirrorHarness } from '@/app/play/mirror/_components/mirror-harness';
import { mount, type Mounted } from '@/tests/helpers/hookRuntime';
import { button, findAll, textOf } from '@/tests/helpers/driveRender';

/** The plan's budget: the page re-renders at most ~10 times a second while live — a fixed number, NOT HUD_HZ, so turning
 *  the throttle up fails here (measured control: unthrottled, the same 90 frames render the page 90 times). */
const BUDGET_HZ = 10;
import { isValidElement, type ReactNode } from 'react';

// ── the fake world ──────────────────────────────────────────────────────────────────────────────────────────────

interface FakeTrack { stop: ReturnType<typeof vi.fn>; stopped: boolean }
let tracks: FakeTrack[] = [];
let getUserMedia: ReturnType<typeof vi.fn>;
let wakeRequests: ReturnType<typeof vi.fn>;
let sentinels: { released: boolean; fire(): void }[] = [];
let visListeners: Set<() => void>;
let doc: { visibilityState: 'visible' | 'hidden'; addEventListener: (t: string, f: () => void) => void; removeEventListener: (t: string, f: () => void) => void };
let fetchSpy: ReturnType<typeof vi.fn>;

function setVisibility(v: 'visible' | 'hidden') {
  doc.visibilityState = v;
  if (v === 'hidden') sentinels.forEach((s) => s.fire());       // a browser drops a screen wake lock on every hide
  [...visListeners].forEach((f) => f());
}
const locksHeld = () => sentinels.filter((s) => !s.released).length;
const cameraLightOn = () => tracks.some((t) => !t.stopped);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] });
  rig.sessions = [];
  tracks = [];
  sentinels = [];
  visListeners = new Set();
  getUserMedia = vi.fn(async () => {
    const t: FakeTrack = { stopped: false, stop: vi.fn(() => { t.stopped = true; }) };
    tracks.push(t);
    return { getTracks: () => [t] };
  });
  wakeRequests = vi.fn(async () => {
    const onRelease: (() => void)[] = [];
    const s = {
      released: false,
      fire() { if (!s.released) { s.released = true; onRelease.forEach((f) => f()); } },
      release: async () => { s.fire(); },
      addEventListener: (_t: string, f: () => void) => { onRelease.push(f); },
    };
    sentinels.push(s);
    return s;
  });
  doc = {
    visibilityState: 'visible',
    addEventListener: (t, f) => { if (t === 'visibilitychange') visListeners.add(f); },
    removeEventListener: (t, f) => { if (t === 'visibilitychange') visListeners.delete(f); },
  };
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia }, wakeLock: { request: wakeRequests } });
  vi.stubGlobal('document', doc);
  fetchSpy = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
  vi.stubGlobal('fetch', fetchSpy);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Let promise chains (the camera, the dynamic import, the batched re-render) run. */
async function settle(rounds = 6) {
  for (let i = 0; i < rounds; i++) {
    await vi.dynamicImportSettled();
    await new Promise((r) => setImmediate(r));
  }
}

const fakeVideo = { srcObject: null as unknown, play: async () => {}, videoWidth: 960, videoHeight: 720 };
const fakeCanvas = { getContext: () => null, width: 0, height: 0, clientWidth: 0, clientHeight: 0 };
/** React attaches refs to the DOM; here they are attached to stand-ins, once (the ref objects live between renders). */
function attachRefs(node: ReactNode) {
  if (Array.isArray(node)) { node.forEach(attachRefs); return; }
  if (!isValidElement(node)) return;
  const ref = (node as unknown as { ref?: { current: unknown } | null }).ref;
  if (ref && typeof ref === 'object' && 'current' in ref && ref.current == null) {
    ref.current = node.type === 'canvas' ? fakeCanvas : fakeVideo;
  }
  attachRefs((node.props as { children?: ReactNode }).children);
}

/** A standing body, square to the camera, whole in the shot (image landmarks 0..1, MediaPipe indices). */
function standing(t: number, opts: { feetOut?: boolean } = {}) {
  const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.95 }));
  const put = (i: number, x: number, y: number, v = 0.95) => { lm[i] = { x, y, z: 0, visibility: v }; };
  put(0, 0.5, 0.12); put(2, 0.48, 0.1); put(5, 0.52, 0.1);
  put(11, 0.42, 0.25); put(12, 0.58, 0.25); put(13, 0.4, 0.38); put(14, 0.6, 0.38); put(15, 0.4, 0.5); put(16, 0.6, 0.5);
  put(23, 0.45, 0.5); put(24, 0.55, 0.5); put(25, 0.45, 0.7); put(26, 0.55, 0.7);
  const fv = opts.feetOut ? 0.05 : 0.95;
  put(27, 0.45, 0.9, fv); put(28, 0.55, 0.9, fv); put(31, 0.45, 0.93, fv); put(32, 0.55, 0.93, fv);
  return { landmarks: lm, timestampMs: t, present: true };
}
const ZONES = { posterior_chain: 'stable', lat_rhomboid: 'stable', upper_traps: 'stable', rib_thoracic: 'stable', lumbo_pelvic: 'stable' };
let frameNo = 0;
/** One camera frame, the way the compositor hands it on: the clock moves a frame, then onFrame. */
async function frame(opts: { reps?: number; feetOut?: boolean; phase?: string } = {}) {
  vi.advanceTimersByTime(1000 / 30);
  const s = rig.sessions[rig.sessions.length - 1];
  const t = performance.now();
  frameNo += 1;
  s.opts.onFrame?.({
    phase: opts.phase ?? (frameNo % 20 < 10 ? 'pull' : 'press'),
    frameMs: 8 + (frameNo % 5),                               // a new number every frame, as the real one is
    zones: ZONES,
    reps: { reps: opts.reps ?? 0, last: null, avg: null, phase: 'hold' },
    pose: standing(t, opts),
    squat: s.opts.analysis === 'squat'
      ? { present: true, phase: 'standing', depth01: 0, hipDrop: 0, faults: [], valgusRatio: 0, lateralDrift: 0, square: true }
      : undefined,
  });
  await settle(1);
}

async function startMirror(m: Mounted, tab?: RegExp) {
  attachRefs(m.tree as ReactNode);
  if (tab) { button(m.tree as ReactNode, tab).props.onClick(); await settle(); }
  button(m.tree as ReactNode, /^Start session$/).props.onClick();
  await settle();
}
const text = (m: Mounted) => textOf(m.tree as ReactNode);

// ── the frame budget ────────────────────────────────────────────────────────────────────────────────────────────

describe.each([
  ['Press / Row', undefined],
  ['Squat (the breathe stage: the pacer\'s seconds change every frame)', /^Squat$/],
  ['Lunge', /^Lunge$/],
  ['Jump', /^Jump$/],
  ['Screen (the runner\'s countdown changes every frame)', /^Screen$/],
] as const)('%s, live', (_name, tab) => {
  it(`3 s of 30 Hz camera frames re-render the page at most ~${BUDGET_HZ} times a second (it was every frame: 90)`, async () => {
    const m = mount(() => MirrorHarness({ youth: 'adult', canSaveScan: false }));
    await startMirror(m, tab ?? undefined);
    expect(text(m)).toContain('Live');
    for (let i = 0; i < 5; i++) await frame();               // the first frames' one-off changes (a stage, a station)
    const before = m.renders;
    for (let i = 0; i < 90; i++) await frame();
    const renders = m.renders - before;
    // ten a second, plus the odd event a frame produces (a screen station changing phase is painted at once)
    expect(renders).toBeLessThanOrEqual(3 * BUDGET_HZ + 4);
    expect(renders).toBeGreaterThanOrEqual(3 * BUDGET_HZ - 6); // and it still repaints: the readouts are live
    m.unmount();
  });
});

// ── wake lock, hide, resume ─────────────────────────────────────────────────────────────────────────────────────

describe('a propped-up phone: the screen stays on, a hidden tab turns the camera off, Resume carries on', () => {
  it('the wake lock is held while the camera is on — not before Start, not while paused — and taken again on Resume', async () => {
    const m = mount(() => MirrorHarness({ youth: 'adult', canSaveScan: false }));
    await settle();
    expect(wakeRequests).not.toHaveBeenCalled();             // idle: the phone may sleep
    await startMirror(m);
    expect(locksHeld()).toBe(1);
    expect(cameraLightOn()).toBe(true);

    setVisibility('hidden');
    await settle();
    expect(cameraLightOn()).toBe(false);                      // every track stopped: the camera light is off
    expect(rig.sessions[0].disposed).toBe(true);
    expect(locksHeld()).toBe(0);
    expect(text(m)).toContain('Paused — the camera is off');

    setVisibility('visible');
    await settle();
    expect(getUserMedia).toHaveBeenCalledTimes(1);            // the camera never turns itself back on
    expect(locksHeld()).toBe(0);                              // nor does the lock: the camera is off
    expect(text(m)).toContain('Resume');

    button(m.tree as ReactNode, /^Resume$/).props.onClick();
    await settle();
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(cameraLightOn()).toBe(true);
    expect(locksHeld()).toBe(1);                              // re-acquired with the camera
    expect(wakeRequests).toHaveBeenCalledTimes(2);
    expect(text(m)).toContain('Live');

    button(m.tree as ReactNode, /^End session$/).props.onClick();
    await settle();
    expect(cameraLightOn()).toBe(false);
    expect(locksHeld()).toBe(0);
    m.unmount();
  });

  it('a hide while the model is still loading leaves no camera on behind the page', async () => {
    const m = mount(() => MirrorHarness({ youth: 'adult', canSaveScan: false }));
    attachRefs(m.tree as ReactNode);
    button(m.tree as ReactNode, /^Start session$/).props.onClick();
    setVisibility('hidden');                                  // before getUserMedia even resolved
    await settle();
    expect(cameraLightOn()).toBe(false);
    expect(rig.sessions.every((s) => s.disposed)).toBe(true);
    expect(text(m)).toContain('Paused');
    m.unmount();
  });

  it('Resume carries the set: the press/row count goes on from where it stopped', async () => {
    const m = mount(() => MirrorHarness({ youth: 'adult', canSaveScan: true }));
    await startMirror(m);
    rig.sessions[0].reps = 3;
    for (let i = 0; i < 6; i++) await frame({ reps: 3 });
    setVisibility('hidden');
    await settle();
    setVisibility('visible');
    button(m.tree as ReactNode, /^Resume$/).props.onClick();
    await settle();
    rig.sessions[1].reps = 1;
    for (let i = 0; i < 6; i++) await frame({ reps: 1 });     // the new runtime counts from 0: its first rep
    vi.advanceTimersByTime(200);
    await settle();
    const counts = findAll(m.tree as ReactNode, (el) => el.type === 'p' && /text-\[40px\]/.test(String(el.props.className)));
    expect(counts.map((c) => textOf(c.props.children))).toContain('4');
    // End reports the whole session: both stretches' reps, one post (the adult who opted in)
    button(m.tree as ReactNode, /^End session$/).props.onClick();
    await settle();
    const posts = fetchSpy.mock.calls.filter(([url]) => url === '/api/mirror/sessions');
    expect(posts).toHaveLength(1);
    expect(JSON.parse(String((posts[0][1] as { body: string }).body)).reps).toBe(4);
    m.unmount();
  });

  it('the squat\'s breath is not "finished" by the time away: the pose clock stops while the camera is off', async () => {
    const m = mount(() => MirrorHarness({ youth: 'adult', canSaveScan: false }));
    await startMirror(m, /^Squat$/);
    for (let i = 0; i < 30; i++) await frame();               // a second into the 36 s breathe stage
    expect(text(m)).toContain('Breathe first.');
    setVisibility('hidden');
    await settle();
    vi.advanceTimersByTime(60_000);                           // a minute on a phone call
    setVisibility('visible');
    button(m.tree as ReactNode, /^Resume$/).props.onClick();
    await settle();
    for (let i = 0; i < 10; i++) await frame();
    vi.advanceTimersByTime(200);
    await settle();
    expect(text(m)).toContain('Breathe first.');              // still breathing, where it left off
    expect(text(m)).not.toContain('The movement check.');
    m.unmount();
  });
});

// ── the minor's path ────────────────────────────────────────────────────────────────────────────────────────────

describe('a minor (canSaveScan false: canSaveScanNumbers is false under 18) sends nothing, paused or not', () => {
  it('start → frames → hide → resume → frames → End: zero requests; the summary still shows on the page', async () => {
    const m = mount(() => MirrorHarness({ youth: 'minor', canSaveScan: false }));
    await startMirror(m);
    for (let i = 0; i < 10; i++) await frame({ reps: 2 });
    setVisibility('hidden');
    await settle();
    setVisibility('visible');
    button(m.tree as ReactNode, /^Resume$/).props.onClick();
    await settle();
    for (let i = 0; i < 10; i++) await frame();
    button(m.tree as ReactNode, /^End session$/).props.onClick();
    await settle();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(text(m)).toContain('Session summary');
    m.unmount();
  });

  it('a pause alone never posts, even for an adult who opted in (only End does)', async () => {
    const m = mount(() => MirrorHarness({ youth: 'adult', canSaveScan: true }));
    await startMirror(m);
    for (let i = 0; i < 5; i++) await frame();
    setVisibility('hidden');
    await settle();
    expect(fetchSpy).not.toHaveBeenCalled();
    m.unmount();
  });
});

// ── the Quick Screen, from the picker ───────────────────────────────────────────────────────────────────────────

describe('the Mirror picker offers the Quick Screen at its front door', () => {
  it.each(['minor', 'adult', 'unknownAge'] as const)('%s: idle shows one link to /screen (its own age step first); live and paused do not', async (youth) => {
    const m = mount(() => MirrorHarness({ youth, canSaveScan: false }));
    const links = () => findAll(m.tree as ReactNode, (el) => el.props['data-quick-screen'] !== undefined);
    expect(links()).toHaveLength(1);
    expect(links()[0].props.href).toBe('/screen');
    await startMirror(m);
    expect(links()).toHaveLength(0);                          // leaving mid-set would end it
    setVisibility('hidden');
    await settle();
    expect(links()).toHaveLength(0);
    m.unmount();
  });
});

// ── the in-shot line ────────────────────────────────────────────────────────────────────────────────────────────

describe('a body the camera cannot see whole is told so on the stage (framing\'s own line)', () => {
  it('feet out of shot for a second: the feet line; back in shot: gone', async () => {
    const m = mount(() => MirrorHarness({ youth: 'adult', canSaveScan: false }));
    await startMirror(m, /^Squat$/);
    for (let i = 0; i < 40; i++) await frame({ feetOut: true });
    vi.advanceTimersByTime(200);
    await settle();
    const line = () => findAll(m.tree as ReactNode, (el) => el.props['data-in-shot'] !== undefined).map((e) => textOf(e.props.children));
    expect(line()).toEqual(['Your feet are out of shot. Tilt the phone down or step back.']);
    for (let i = 0; i < 5; i++) await frame();
    vi.advanceTimersByTime(200);
    await settle();
    expect(line()).toEqual([]);
    m.unmount();
  });
});
