// Prove It, leaving while the tracker loads (MOVEMENT PLAY P2, 2026-09-24).
//
// The pose model holds a wasm heap, and Prove It used to leak one per visit. stopAll() now frees the adapter, but
// the model is still downloading while LOADING THE TRACKER shows, and an adapter that cannot cancel a load in flight
// (HEAD's could not) has nothing to close yet when stopAll() runs. It keeps the model when it lands, after its owner
// has gone. startCamera's stale check after init() is the last place anyone holds that adapter, so it disposes it
// there (review finding A1).
//
// app/ has no DOM runner (vitest.config.ts), so the page runs here as a plain function over a stand-in for the four
// hooks it uses: one render, its effects run as the mount, and their cleanups as the unmount. What runs is the page's
// own startCamera and stopAll, not a copy of them.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface FakeLandmarker { close: () => void; detectForVideo: () => object }

const h = vi.hoisted(() => {
  const state = {
    /** Every value the page passed to a state setter, in order. Stage names only ever appear as stages. */
    sets: [] as unknown[],
    effects: [] as Array<() => void | (() => void)>,
    /** close() calls on landmarkers the test handed out. */
    closed: 0,
    /** Set while a model is downloading: calling it makes the model land. */
    land: null as null | (() => void),
    /** Which adapter the page gets: null for the real one this tree ships, or a stand-in class. */
    impl: null as null | (new () => unknown),
    /** A model download the test finishes by calling land(). */
    modelArrives(): Promise<FakeLandmarker> {
      return new Promise((resolve) => {
        state.land = () => {
          state.land = null;
          resolve({ close: () => { state.closed++; }, detectForVideo: () => ({}) });
        };
      });
    },
  };
  return state;
});

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  const hooks = {
    useRef: <T>(v: T) => ({ current: v }),
    useState: <T>(v: T) => [v, (next: T) => { h.sets.push(next); }] as const,
    useCallback: <F>(f: F) => f,
    useEffect: (fx: () => void | (() => void)) => { h.effects.push(fx); },
  };
  return { ...actual, ...hooks, default: { ...actual, ...hooks } };
});

// The real landmarker comes from here; the download is the test's to finish.
vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: { forVisionTasks: async () => ({}) },
  PoseLandmarker: { createFromOptions: () => h.modelArrives() },
}));

vi.mock('@/lib/babylon/nexus/neuro-mirror/pose/mediapipe-adapter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/babylon/nexus/neuro-mirror/pose/mediapipe-adapter')>();
  // A constructor that returns an object hands `new` that object, so the page gets whichever adapter the test picked.
  function MediaPipePoseAdapter() { return new (h.impl ?? actual.MediaPipePoseAdapter)(); }
  return { ...actual, MediaPipePoseAdapter };
});

import ProveIt from '@/app/play/dunkduel/_components/prove-it';

/** HEAD's adapter (252548be) in miniature: dispose() closes only a landmarker it has, and init() keeps whatever lands. */
class LateLandingAdapter {
  private landmarker: FakeLandmarker | null = null;
  async init(): Promise<void> {
    if (this.landmarker) return;
    this.landmarker = await h.modelArrives();
  }
  get ready(): boolean { return !!this.landmarker; }
  detect(): object { return { landmarks: [], timestampMs: 0, present: false }; }
  dispose(): void {
    try { this.landmarker?.close(); } catch { /* noop */ }
    this.landmarker = null;
  }
}

interface El { type?: unknown; ref?: unknown; props?: Record<string, unknown> }

function find(node: unknown, hit: (el: El) => boolean): El | null {
  if (Array.isArray(node)) {
    for (const n of node) { const f = find(n, hit); if (f) return f; }
    return null;
  }
  if (!node || typeof node !== 'object' || !('props' in node)) return null;
  const el = node as El;
  return hit(el) ? el : find(el.props?.children, hit);
}

function mountPage() {
  h.sets.length = 0;
  h.effects.length = 0;
  const tree = ProveIt();
  const cleanups = h.effects.map((fx) => fx()).filter((c): c is () => void => typeof c === 'function');
  const gate = find(tree, (el) => el.props?.cta === 'SET UP THE CAMERA');
  const video = find(tree, (el) => el.type === 'video');
  if (!gate || !video) throw new Error('the consent gate or the <video> is missing from the first paint');
  return {
    setUp: gate.props!.onClick as () => Promise<void>,
    videoRef: video.ref as { current: unknown },
    unmount: () => cleanups.forEach((c) => c()),
  };
}

let getUserMedia: ReturnType<typeof vi.fn>;
let trackStopped: number;

beforeEach(() => {
  h.closed = 0;
  h.land = null;
  h.impl = null;
  trackStopped = 0;
  getUserMedia = vi.fn(async () => ({ getTracks: () => [{ stop: () => { trackStopped++; } }] }));
  // /api/profile and the pose-asset HEAD probe: no profile, and our own copy of the model is there.
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 200, json: async () => null })));
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});
afterEach(() => { vi.unstubAllGlobals(); });

/**
 * Tap SET UP THE CAMERA and wait until the model is actually downloading. The page's promise comes back boxed: an
 * async function returning it bare would wait for it, and it cannot settle until the test lands the model.
 */
async function startLoading(page: ReturnType<typeof mountPage>): Promise<{ started: Promise<void> }> {
  const started = page.setUp();
  await vi.waitFor(() => { if (!h.land) throw new Error('the model download has not started'); });
  expect(h.sets).toContain('loading-model');
  return { started };
}

describe('Prove It, leaving while the tracker loads', () => {
  it('closes a model that lands after the page was left, on an adapter that cannot cancel the load (HEAD\'s)', async () => {
    h.impl = LateLandingAdapter;
    const page = mountPage();
    const { started } = await startLoading(page);
    page.unmount();        // navigate away while LOADING THE TRACKER shows
    h.land!();             // the model arrives anyway
    await started;
    expect(h.closed).toBe(1);                       // was 0: its wasm heap leaked once per mid-download leave
    expect(getUserMedia).not.toHaveBeenCalled();    // and no camera switched on for nobody
    expect(h.sets).not.toContain('prop-phone');
    expect(h.sets).not.toContain('camera-off');     // a left page shows no error either
  });

  it('closes it exactly once with the adapter this tree ships', async () => {
    const page = mountPage();
    const { started } = await startLoading(page);
    page.unmount();
    h.land!();
    await started;
    expect(h.closed).toBe(1);   // not 0 (leaked), not 2 (the adapter's own close plus the page's)
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(h.sets).not.toContain('prop-phone');
    expect(h.sets).not.toContain('camera-off');
  });

  it('keeps a model that lands while the page is up, and frees it and the camera on leave', async () => {
    h.impl = LateLandingAdapter;
    const page = mountPage();
    page.videoRef.current = { srcObject: null, play: async () => {} };
    const { started } = await startLoading(page);
    h.land!();
    await started;
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(h.sets).toContain('prop-phone');
    expect(h.closed).toBe(0);   // the stale-only dispose never touches a live page's tracker
    page.unmount();
    expect(h.closed).toBe(1);
    expect(trackStopped).toBe(1);
  });
});
