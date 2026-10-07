// MIRROR-PROGRESS (2026-10-07; plan Phase 4, "progress you can see"): the real Mirror harness, MOUNTED (Phase 1's rig,
// tests/helpers/hookRuntime.ts), with the camera, the pose runtime and the voice faked, and a memory localStorage:
//
//   - an opted-in adult's squat End posts the set with its per-check values and asks for the last 3; the review says how
//     the set sits against them ("vs your last 3"), from the server — and nothing is kept on the phone;
//   - a minor, no birth year, or an adult who has not opted in: ZERO requests; the number is kept on this phone only,
//     compared there, labelled so, and wipeable (owner decision 1);
//   - the hinge and push-up keep theirs on the phone for everyone (those tabs send nothing for anyone);
//   - too few reps: nothing compared, nothing kept, nothing extra sent; the press/row and the lunge carry their own ids.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react', async (importOriginal) => (await import('@/tests/helpers/hookRuntime')).hookedReact(await importOriginal()));

const rig = vi.hoisted(() => ({
  sessions: [] as { opts: { analysis?: string; onReady?: () => void; onFrame?: (info: unknown) => void }; disposed: boolean }[],
  summaryReps: 0,
  summaryFaults: 0,
}));
vi.mock('@/lib/babylon/nexus/neuro-mirror', () => {
  const zero = () => ({ posterior_chain: 0, lat_rhomboid: 0, upper_traps: 0, rib_thoracic: 0, lumbo_pelvic: 0 });
  return {
    NeuroMirror: {
      async session(opts: { onReady?: () => void; onFrame?: (info: unknown) => void }) {
        const s = { opts, disposed: false };
        rig.sessions.push(s);
        queueMicrotask(() => opts.onReady?.());
        return {
          ready: () => true,
          summary: () => ({
            patternId: 'split-stance-press-row', startedAtMs: 0, durationMs: 60_000, timeInStableMs: zero(),
            faultCounts: { ...zero(), lat_rhomboid: rig.summaryFaults }, avgFrameMs: 10, reps: rig.summaryReps, avgTempo: null,
          }),
          dispose: () => { s.disposed = true; },
        };
      },
    },
  };
});
vi.mock('@/lib/babylon/audio/voice/speakNatural', () => ({
  speakNatural: (_text: string, opts?: { onend?: () => void }) => { opts?.onend?.(); },
}));

import { isValidElement, type ReactNode } from 'react';
import { MirrorHarness } from '@/app/play/mirror/_components/mirror-harness';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { FORGET_LABEL, FORGOTTEN_LINE, ProgressLine } from '@/app/play/mirror/_components/progress-line';
import { mount, type Mounted } from '@/tests/helpers/hookRuntime';
import { button, findAll, textOf } from '@/tests/helpers/driveRender';
import { adapterFromPose, toAdapterFrames } from '@/lib/mirror/fixtures';
import { readFixture } from '@/lib/mirror/fixtures/load';
import { hingeSet } from '@/lib/mirror/fixtures/sideRepBuild';
import { DEVICE_PROGRESS_KEY } from '@/lib/mirror/deviceProgress';
import { FIRST_LINE, TOO_FEW_LINE, WHERE_DEVICE, WHERE_SERVER } from '@/lib/mirror/progressReading';
import { BREATH_CYCLE_MS, BREATH_CYCLES } from '@/lib/mirror/squatStage';
import type { PoseFrame } from '@/lib/babylon/nexus/neuro-mirror/pose/mediapipe-adapter';

let fetchSpy: ReturnType<typeof vi.fn>;
let store: Map<string, string>;
let recentAnswer: unknown;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] });
  rig.sessions = [];
  rig.summaryReps = 0;
  rig.summaryFaults = 0;
  store = new Map();
  recentAnswer = { values: [0.5, 0.5, 0.5] };
  const track = { stop: vi.fn() };
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(async () => ({ getTracks: () => [track] })) } });
  vi.stubGlobal('document', { visibilityState: 'visible', addEventListener: () => {}, removeEventListener: () => {} });
  vi.stubGlobal('speechSynthesis', { cancel: vi.fn() });
  vi.stubGlobal('window', {
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms), clearTimeout: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
    addEventListener: () => {}, removeEventListener: () => {},
    localStorage: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => { store.set(k, String(v)); },
      removeItem: (k: string) => { store.delete(k); },
    },
  });
  fetchSpy = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ id: 'ms-new', saved: true, recent: recentAnswer }) }));
  vi.stubGlobal('fetch', fetchSpy);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function settle(rounds = 6) {
  for (let i = 0; i < rounds; i++) {
    await vi.dynamicImportSettled();
    await new Promise((r) => setImmediate(r));
  }
}
const fakeVideo = { srcObject: null as unknown, play: async () => {}, videoWidth: 960, videoHeight: 720 };
const fakeCanvas = { getContext: () => null, width: 0, height: 0, clientWidth: 0, clientHeight: 0 };
function attachRefs(node: ReactNode) {
  if (Array.isArray(node)) { node.forEach(attachRefs); return; }
  if (!isValidElement(node)) return;
  const ref = (node as unknown as { ref?: { current: unknown } | null }).ref;
  if (ref && typeof ref === 'object' && 'current' in ref && ref.current == null) ref.current = node.type === 'canvas' ? fakeCanvas : fakeVideo;
  attachRefs((node.props as { children?: ReactNode }).children);
}
const ZONES = { posterior_chain: 'stable', lat_rhomboid: 'stable', upper_traps: 'stable', rib_thoracic: 'stable', lumbo_pelvic: 'stable' };
const session = () => rig.sessions[rig.sessions.length - 1];
async function start(m: Mounted) {
  attachRefs(m.tree as ReactNode);
  button(m.tree as ReactNode, /^Start session$/).props.onClick();
  await settle();
}
async function end(m: Mounted) {
  button(m.tree as ReactNode, /^End session$/).props.onClick();
  await settle();
}
const text = (m: Mounted) => textOf(m.tree as ReactNode);
// the block is a child component: found by type, and drawn with React's own server render to read what it says
const progressBlocks = (m: Mounted) => findAll(m.tree as ReactNode, (el) => el.type === ProgressLine);
const progressHtml = (m: Mounted) => progressBlocks(m).map((b) => renderToStaticMarkup(createElement(ProgressLine, b.props as never))).join('');
const said = (m: Mounted) => progressHtml(m).replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');
const kept = () => (store.has(DEVICE_PROGRESS_KEY) ? JSON.parse(store.get(DEVICE_PROGRESS_KEY)!).byMovement : null);
const posts = () => fetchSpy.mock.calls.map(([url, init]) => ({ url, body: JSON.parse((init as RequestInit).body as string) }));

/** A standing body, square to the camera, whole in the shot (the landmarks the framing line reads). */
function standing(t: number): PoseFrame {
  const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.95 }));
  const put = (i: number, x: number, y: number) => { lm[i] = { x, y, z: 0, visibility: 0.95 }; };
  put(0, 0.5, 0.12); put(2, 0.48, 0.1); put(5, 0.52, 0.1);
  put(11, 0.42, 0.25); put(12, 0.58, 0.25); put(13, 0.4, 0.38); put(14, 0.6, 0.38); put(15, 0.4, 0.5); put(16, 0.6, 0.5);
  put(23, 0.45, 0.5); put(24, 0.55, 0.5); put(25, 0.45, 0.7); put(26, 0.55, 0.7);
  put(27, 0.45, 0.9); put(28, 0.55, 0.9); put(31, 0.45, 0.93); put(32, 0.55, 0.93);
  return { landmarks: lm, timestampMs: t, present: true } as unknown as PoseFrame;
}
let clock = 1000;
/** One squat camera frame: the audit's read handed on with the pose (the runtime's `squat`), on the pose clock. */
async function squatFrame(read: { phase: string; hipDrop: number; faults?: string[] }, stepMs = 1000 / 30) {
  clock += stepMs;
  vi.advanceTimersByTime(1000 / 30);
  session().opts.onFrame?.({
    phase: 'hold', frameMs: 9, zones: ZONES, reps: { reps: 0, last: null, avg: null, phase: 'hold' }, pose: standing(clock),
    squat: { present: true, phase: read.phase, depth01: 0, hipDrop: read.hipDrop, faults: read.faults ?? [], valgusRatio: 0, lateralDrift: 0, square: true },
  });
  await settle(1);
}
/** The guided squat: the breath (on the pose clock), the 3-rep check, then `work` work-set reps, each with its faults. */
async function squatSet(work: string[][]) {
  await squatFrame({ phase: 'standing', hipDrop: 0 });
  await squatFrame({ phase: 'standing', hipDrop: 0 }, BREATH_CYCLES * BREATH_CYCLE_MS + 100);
  const rep = async (faults: string[] = []) => {
    for (let i = 0; i < 3; i++) await squatFrame({ phase: 'bottom', hipDrop: 0.35, faults });
    await squatFrame({ phase: 'standing', hipDrop: 0 });
  };
  for (let i = 0; i < 3; i++) await rep();
  for (const f of work) await rep(f);
  vi.advanceTimersByTime(300);
  await settle();
}
const EIGHT = [[], ['heelRise'], [], [], ['heelRise'], [], [], []];   // 6 of 8 clean: 75%

describe('an adult who opted in (canSaveScan true): the squat compares against the server', () => {
  it('End posts the squat under its own id, with its per-check values and the ask for the last 3; the review says how it sits', async () => {
    const m = mount(() => MirrorHarness({ youth: null, canSaveScan: true, initialPattern: 'squat' }));
    await start(m);
    await squatSet(EIGHT);
    expect(text(m)).toContain('What the camera measured');          // the review is up
    await end(m);
    expect(posts()).toHaveLength(1);
    const { url, body } = posts()[0];
    expect(url).toBe('/api/mirror/sessions');
    expect(body.patternId).toBe('squat');
    expect(body.checkValues).toEqual({ cleanShare: 0.75, heelRise: 0.25, reps: 8 });
    expect(body.recent).toBe(true);
    expect(progressBlocks(m)).toHaveLength(1);
    expect(progressHtml(m)).toContain('data-progress-source="server"');
    expect(said(m)).toContain('Clean reps 75% — your last 3 averaged 50%. Better than your last 3.');
    expect(said(m)).toContain(WHERE_SERVER);
    expect(said(m)).not.toContain(FORGET_LABEL);
    expect(store.size).toBe(0);                                        // nothing kept on the phone for a saver
    m.unmount();
  });

  it('the server could not answer: the review says so, and still keeps nothing on the phone', async () => {
    recentAnswer = null;
    const m = mount(() => MirrorHarness({ youth: null, canSaveScan: true, initialPattern: 'squat' }));
    await start(m);
    await squatSet(EIGHT);
    await end(m);
    expect(said(m)).toContain('Your saved sessions could not be read just now');
    expect(store.size).toBe(0);
    m.unmount();
  });

  it('too few work-set reps: the session posts as before — no checkValues, no "recent" — and the review says too few', async () => {
    const m = mount(() => MirrorHarness({ youth: null, canSaveScan: true, initialPattern: 'squat' }));
    await start(m);
    await squatSet([[], []]);
    await end(m);
    expect(posts()).toHaveLength(1);
    expect(posts()[0].body.checkValues).toBeUndefined();
    expect(posts()[0].body.recent).toBeUndefined();
    expect(said(m)).toContain(TOO_FEW_LINE);
    m.unmount();
  });

  it('the press/row posts under the id the correctives read, asks for the last 3, and sends no checkValues', async () => {
    rig.summaryReps = 10;
    rig.summaryFaults = 5;
    recentAnswer = { values: [1, 1, 1] };
    const m = mount(() => MirrorHarness({ youth: null, canSaveScan: true, initialPattern: 'pressRow' }));
    await start(m);
    await end(m);
    const { body } = posts()[0];
    expect(body.patternId).toBe('split-stance-press-row');
    expect(body.recent).toBe(true);
    expect(body.checkValues).toBeUndefined();
    expect(said(m)).toContain('Zone faults per rep 0.5 — your last 3 averaged 1.0. Better than your last 3.');
    m.unmount();
  });

  it('the lunge posts under its own id, with its per-check values', async () => {
    const m = mount(() => MirrorHarness({ youth: null, canSaveScan: true, initialPattern: 'lunge' }));
    await start(m);
    const fx = readFixture('lunge_left_front');
    const one = toAdapterFrames(fx);
    const span = fx.frames[fx.frames.length - 1].t + 1000 / 30;
    const frames = Array.from({ length: 5 }, (_, i) => one.map((f) => ({ ...f, timestampMs: f.timestampMs + 1000 + i * span }))).flat();
    for (let i = 0; i < frames.length; i++) {
      vi.advanceTimersByTime(1000 / 30);
      session().opts.onFrame?.({ phase: 'hold', frameMs: 9, zones: ZONES, reps: { reps: 0, last: null, avg: null, phase: 'hold' }, pose: frames[i] });
      if (i % 10 === 0) await settle(1);
    }
    await settle();
    await end(m);
    const { body } = posts()[0];
    expect(body.patternId).toBe('lunge');
    expect(body.recent).toBe(true);
    expect(body.checkValues.reps).toBeGreaterThanOrEqual(3);
    expect(typeof body.checkValues.cleanShare).toBe('number');
    expect(typeof body.checkValues['left.cleanShare']).toBe('number');
    m.unmount();
  });
});

describe('everyone else — under 18, no birth year, an adult who has not opted in: on this phone only, nothing sent', () => {
  it.each([['minor'], ['unknownAge'], [null]] as const)('youth %s, canSaveScan false: two squat sets → zero requests; compared on the phone; forgettable', async (youth) => {
    const m = mount(() => MirrorHarness({ youth, canSaveScan: false, initialPattern: 'squat' }));
    await start(m);
    await squatSet(EIGHT);
    await end(m);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(kept()).toEqual({ squat: [{ at: expect.any(Number), value: 0.75 }] });
    expect(progressHtml(m)).toContain('data-progress-source="device"');
    expect(said(m)).toContain(FIRST_LINE);
    expect(said(m)).toContain(WHERE_DEVICE);
    expect(said(m)).toContain(FORGET_LABEL);

    // the next set compares with the one kept on the phone
    await start(m);
    expect(progressBlocks(m)).toHaveLength(0);                        // a new set clears the last one's line
    await squatSet([[], [], [], [], [], [], [], []]);
    await end(m);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(kept().squat.map((e: { value: number }) => e.value)).toEqual([0.75, 1]);
    expect(said(m)).toContain('Clean reps 100% — your last set 75%. Better than your last set.');

    // Forget: the key is gone from this phone, and the review says so
    (progressBlocks(m)[0].props as { onForget: () => void }).onForget();
    await settle();
    expect(store.has(DEVICE_PROGRESS_KEY)).toBe(false);
    expect(said(m)).toContain(FORGOTTEN_LINE);
    expect(said(m)).not.toContain(FORGET_LABEL);
    expect(fetchSpy).not.toHaveBeenCalled();
    m.unmount();
  });

  it('a minor\'s set too short to read: nothing kept, nothing sent', async () => {
    const m = mount(() => MirrorHarness({ youth: 'minor', canSaveScan: false, initialPattern: 'squat' }));
    await start(m);
    await squatSet([[]]);
    await end(m);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(store.size).toBe(0);
    expect(said(m)).toContain(TOO_FEW_LINE);
    m.unmount();
  });

  it('no storage on this phone (private browsing): the review says so, and nothing is sent instead', async () => {
    vi.stubGlobal('window', { setTimeout, clearTimeout, addEventListener: () => {}, removeEventListener: () => {}, get localStorage() { throw new Error('SecurityError'); } });
    const m = mount(() => MirrorHarness({ youth: 'minor', canSaveScan: false, initialPattern: 'squat' }));
    await start(m);
    await squatSet(EIGHT);
    await end(m);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(said(m)).toContain('This phone is not keeping a history');
    m.unmount();
  });
});

describe('the hinge and the push-up: on the phone for everyone (those tabs send nothing for anyone)', () => {
  it('an adult who opted in: zero requests, the hinge kept on the phone', async () => {
    const m = mount(() => MirrorHarness({ youth: null, canSaveScan: true, initialPattern: 'hinge' }));
    await start(m);
    const frames = adapterFromPose(hingeSet({ reps: 11 }), 1000);
    for (let i = 0; i < frames.length; i++) {
      vi.advanceTimersByTime(1000 / 30);
      session().opts.onFrame?.({ phase: 'hold', frameMs: 9, zones: ZONES, reps: { reps: 0, last: null, avg: null, phase: 'hold' }, pose: frames[i] });
      if (i % 10 === 0) await settle(1);
    }
    await settle();
    await end(m);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(kept().hinge).toHaveLength(1);
    expect(progressHtml(m)).toContain('data-progress-source="device"');
    m.unmount();
  });
});

describe('the line belongs to its own tab', () => {
  it('a squat\'s line is not shown on another tab', async () => {
    const m = mount(() => MirrorHarness({ youth: 'minor', canSaveScan: false, initialPattern: 'squat' }));
    await start(m);
    await squatSet(EIGHT);
    await end(m);
    expect(progressBlocks(m)).toHaveLength(1);
    findAll(m.tree as ReactNode, (el) => el.props.role === 'tab' && textOf(el.props.children) === 'Lunge')[0].props.onClick();
    await settle();
    expect(progressBlocks(m)).toHaveLength(0);
    m.unmount();
  });
});
