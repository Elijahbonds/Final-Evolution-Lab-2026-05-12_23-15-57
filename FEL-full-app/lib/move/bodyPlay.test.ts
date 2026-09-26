import { describe, it, expect, afterEach, vi } from 'vitest';
import { createBodyPlay, LUMA_EVERY_MS, type BodyPlayDeps } from './bodyPlay';
import { SpaceCheck, SAFETY_NOTE, type LumaSample } from './spaceCheck';
import { BODY_PLAY_KEY_PREFIX } from './bodyPlayChoice';
import { sessionStore, type SessionWriter } from '@/lib/babylon/core/sessionStore';
import { bodySeamFor } from '@/lib/babylon/core/bodySeam';
import type { PoseSourceSnapshot, PoseSourceState } from '@/lib/input/poseSource';
import type { PoseStatus } from '@/lib/pose/PoseService';
import type { Calibration } from '@/lib/pose/calibrate';
import type { ModePhase } from '@/lib/babylon/core/ModeHarness';
import { synthesize, restPose, moveJoints, type Joints } from '@/lib/pose/synth';
import { spaceSession, script, hold } from '@/lib/pose/streamKit';
import type { PoseFrame } from '@/lib/pose/landmarks';

// MOVEMENT PLAY P4 (2026-09-25): the READY screen's body play, with the page taken out — a source, a camera service,
// storage and a voice that record what they are asked, and the real sessionStore (the harness's writer moves the
// phase). What is pinned: the camera starts only on a tap; the check sees the frames only while it is needed; the
// source gets the check's rulers exactly once, when it passes, and is re-centred when the check drops back; the
// shortcut's actions; and the samples and the voice run only while the check does.

const PLAY = { distance: 3.6, heightM: 1.2 };
const frames = (seed = 11, clip = spaceSession()) => synthesize(clip, { camera: PLAY, seed }).frames;
const later = (fs: PoseFrame[], t0: number) => fs.map((f) => ({ ...f, t: f.t + t0, arrive: (f.arrive ?? f.t) + t0 }));

function rig(o: { start?: boolean; bank?: string[] } = {}) {
  const calls: string[] = [];
  const store = new Map<string, string>();
  const frameCbs = new Set<(f: PoseFrame) => void>();
  const statusCbs = new Set<(s: PoseStatus) => void>();
  const sourceCbs = new Set<(s: PoseSourceSnapshot) => void>();
  const hiddenCbs = new Set<() => void>();
  const cals: Calibration[] = [];
  const said: [string, string][] = [];
  const samples: number[] = [];
  let clock = 0;
  let snapshot: PoseSourceSnapshot = { state: 'idle', detail: '', body: false };
  const setSource = (state: PoseSourceState, detail = '') => { snapshot = { state, detail, body: false }; for (const cb of [...sourceCbs]) cb(snapshot); };
  const service = {
    status: { state: 'idle', why: null, source: null, model: null, modelWhy: null, camera: null } as PoseStatus,
    onFrame: (cb: (f: PoseFrame) => void) => { frameCbs.add(cb); return () => { frameCbs.delete(cb); }; },
    onStatus: (cb: (s: PoseStatus) => void) => { statusCbs.add(cb); return () => { statusCbs.delete(cb); }; },
  };
  const setStatus = (s: Partial<PoseStatus>) => { service.status = { ...service.status, ...s }; for (const cb of [...statusCbs]) cb(service.status); };
  const deps: BodyPlayDeps = {
    source: {
      get snapshot() { return snapshot; },
      start: async () => {
        calls.push('start');
        if (o.start === false) { setSource('error', 'Camera access was refused. Allow the camera for this site and try again.'); return false; }
        setStatus({ state: 'live', source: 'camera', camera: { width: 640, height: 480, frameRate: 30, facingMode: 'user', portrait: false } });
        setSource('calibrating');
        return true;
      },
      stop: () => { calls.push('stop'); setSource('idle'); },
      listen: (fn) => { sourceCbs.add(fn); return () => { sourceCbs.delete(fn); }; },
      setCalibration: (cal) => { calls.push('setCalibration'); cals.push(cal); setSource('live'); },
      recalibrate: () => { calls.push('recalibrate'); setSource('calibrating'); },
    },
    service,
    session: sessionStore,
    storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => { store.set(k, v); } },
    unlockAudio: () => calls.push('unlock'),
    voice: { load: () => calls.push('voice.load'), play: (clip, caption) => said.push([clip, caption]), bank: () => new Set(o.bank ?? []) },
    sampleLuma: (image): LumaSample | null => { samples.push(clock); return image ? { frame: [0, 0, 0, 0, 10, 10, 10, 10] } : null; },
    pauseGame: () => { calls.push('pause'); writer?.setPhase('paused'); },
    onPageHidden: (fn) => { hiddenCbs.add(fn); },
    now: () => clock,
  };
  const bp = createBodyPlay(deps);
  /** Frames through the camera service, the clock following their arrival. */
  const push = (fs: PoseFrame[]) => { for (const f of fs) { clock = f.arrive ?? f.t; for (const cb of [...frameCbs]) cb(f); } };
  /** The page went to the background (another tab, the app switcher). */
  const hide = () => { for (const cb of [...hiddenCbs]) cb(); };
  return { bp, calls, store, cals, said, samples, push, setStatus, setSource, hide };
}

let writer: SessionWriter | null = null;
function game(key = 'skateboard', phase: ModePhase = 'ready') {
  writer?.unmount();
  const modeId = key === 'dunk' ? 'dunk' : key;
  writer = sessionStore.mount(bodySeamFor({ modeId }).card);
  writer.setPhase(phase);
  return writer;
}
afterEach(() => { writer?.unmount(); writer = null; });

describe('the camera starts only on a tap', () => {
  it('a remembered choice pre-selects, and starts nothing', () => {
    game();
    const r = rig();
    r.store.set(`${BODY_PLAY_KEY_PREFIX}skateboard`, '1');
    expect(r.bp.remembered('skateboard')).toBe(true);
    expect(r.bp.remembered('surf')).toBe(false);
    expect(r.calls).toEqual([]);
    expect(r.bp.view().stage).toBe('off');
  });

  it('begin: the sound unlocks, the choice is remembered, the Coach loads once, the source starts, the check runs', async () => {
    game();
    const r = rig();
    expect(await r.bp.begin('skateboard')).toBe(true);
    expect(r.calls).toEqual(['unlock', 'voice.load', 'start']);
    expect(r.store.get(`${BODY_PLAY_KEY_PREFIX}skateboard`)).toBe('1');
    expect(r.bp.view()).toMatchObject({ key: 'skateboard', stage: 'checking', checking: true });
    r.bp.end('skateboard');
    await r.bp.begin('skateboard');
    expect(r.calls.filter((c) => c === 'voice.load')).toHaveLength(1);
  });

  it('a refused camera: the stage says why, and the controller still works (nothing else happens)', async () => {
    game();
    const r = rig({ start: false });
    expect(await r.bp.begin('skateboard')).toBe(false);
    expect(r.bp.view().stage).toBe('error');
    expect(r.bp.view().camera.why).toMatch(/refused/);
    r.push(frames().slice(0, 30));
    expect(r.bp.view().space).toBeNull();
  });
});

describe('the check and the source', () => {
  it('the source gets the check\'s rulers exactly once, when it passes', async () => {
    game();
    const r = rig();
    await r.bp.begin('skateboard');
    const fs = frames();
    r.push(fs);
    expect(r.calls.filter((c) => c === 'setCalibration')).toHaveLength(1);
    // the same rulers a check of its own takes on the same frames
    const own = new SpaceCheck();
    const ready = fs.map((f) => own.push(f)).find((s) => s.ready)!;
    expect(r.cals[0]).toEqual(ready.calibration);
    expect(r.bp.view().stage).toBe('set');
    expect(r.bp.view().space!.stage).toBe('ready');
    expect(r.bp.view().space!.safety).toEqual(SAFETY_NOTE);
    expect(r.bp.view().space!.overlay.floorY).toBe(ready.calibration!.floorY.line);
  });

  it('nothing is handed over before the check passes: the whole reach is uncalibrated', async () => {
    game();
    const r = rig();
    await r.bp.begin('skateboard');
    const fs = frames();
    const own = new SpaceCheck();
    const readyAt = fs.findIndex((f) => own.push(f).ready);
    r.push(fs.slice(0, readyAt));
    expect(r.calls).not.toContain('setCalibration');
    r.push(fs.slice(readyAt, readyAt + 1));
    expect(r.calls).toContain('setCalibration');
  });

  it('at READY, a check that drops back from ready (the player walked off) re-centres the source: the game lets go', async () => {
    game();
    const r = rig();
    await r.bp.begin('skateboard');
    const fs = frames();
    r.push(fs);
    const t0 = fs[fs.length - 1].t + 33;
    r.push(Array.from({ length: 20 }, (_, k) => ({ t: t0 + k * 33, present: false, image: [], arrive: t0 + k * 33 + 66 })));
    expect(r.calls.filter((c) => c === 'recalibrate')).toHaveLength(1);
    expect(r.bp.view().stage).toBe('checking');
    // back, and ready again: the rulers handed over a second time
    r.push(later(frames(12, script([hold(restPose(), 3)], 30)), t0 + 1000));
    expect(r.calls.filter((c) => c === 'setCalibration')).toHaveLength(2);
  });

  it('in play the check sees nothing once set (the reader owns the body); a check still running when a tap started the game keeps going', async () => {
    const w = game();
    const r = rig();
    await r.bp.begin('skateboard');
    const fs = frames();
    r.push(fs.slice(0, 20));
    w.setPhase('playing');                          // a tap started it before the check was done
    expect(r.bp.view().checking).toBe(true);
    r.push(fs.slice(20));
    expect(r.bp.view().stage).toBe('set');          // the body joins when it is set
    expect(r.bp.view().checking).toBe(false);
    const t = r.bp.view().space!.t;
    r.push(later(frames(13), fs[fs.length - 1].t + 33));
    expect(r.bp.view().space!.t).toBe(t);           // nothing more read in play
    w.setPhase('ready');                            // GO AGAIN: READY keeps watching
    expect(r.bp.view().checking).toBe(true);
  });

  it('GO AGAIN: the first frame the check reads after play takes the stand again (a shorter player stood where the last one did)', async () => {
    const w = game();
    const r = rig();
    await r.bp.begin('skateboard');
    const fs = frames();
    r.push(fs);
    expect(r.bp.view().stage).toBe('set');
    w.setPhase('countdown');
    w.setPhase('playing');
    const t1 = fs[fs.length - 1].t + 33;
    r.push(later(frames(13), t1));                  // play: the reader's frames, not the check's
    w.setPhase('ended');
    w.setPhase('ready');                            // GO AGAIN
    const before = r.calls.filter((c) => c === 'recalibrate').length;
    // the next player, 0.9× as tall, stands on the same spot: no framing rule breaks, so only a new stand can tell
    const shorter = Object.fromEntries(Object.entries(restPose()).map(([k, p]) => [k, p.map((v) => v * 0.9)])) as Joints;
    const next = later(synthesize(spaceSession({ body: shorter, end: 6 }), { camera: PLAY, seed: 16 }).frames, t1 + 40_000);
    r.push(next.slice(0, 1));
    expect(r.calls.filter((c) => c === 'recalibrate')).toHaveLength(before + 1);
    expect(r.bp.view().stage).toBe('checking');
    expect(r.bp.view().space!.stage).toBe('frame');
    expect(r.bp.view().jumpHeight).toBeNull();      // the rate across the gap is unknown, never "slow"
    r.push(next.slice(1));
    expect(r.bp.view().stage).toBe('set');
    expect(r.cals).toHaveLength(2);
    expect(r.cals[1].legLength).toBeLessThan(r.cals[0].legLength * 0.95);   // the new player's own rulers
  });

  it('READY that keeps reading keeps its rulers; a second with no frames takes the stand again', async () => {
    game();
    const r = rig();
    await r.bp.begin('skateboard');
    const fs = frames();
    r.push(fs);
    const more = later(frames(17, script([hold(restPose(), 2)], 30)), fs[fs.length - 1].t + 33);
    r.push(more);
    expect(r.calls).not.toContain('recalibrate');
    expect(r.bp.view().stage).toBe('set');
    r.push(later(frames(18, script([hold(restPose(), 1)], 30)), more[more.length - 1].t + 1500));
    expect(r.calls.filter((c) => c === 'recalibrate')).toHaveLength(1);
  });

  it('a pause feeds the check only when a check was asked for over it', async () => {
    const w = game();
    const r = rig();
    await r.bp.begin('skateboard');
    r.push(frames());
    w.setPhase('playing');
    w.setPhase('paused');                           // the body walked off: P3's lost pause, no re-check
    expect(r.bp.view().checking).toBe(false);
    w.setPhase('playing');
    r.bp.again();                                   // "Check my space again" mid-play: paused first, then the check
    expect(r.calls.slice(-2)).toEqual(['pause', 'recalibrate']);
    expect(sessionStore.view().phase).toBe('paused');
    expect(r.bp.view()).toMatchObject({ stage: 'checking', checking: true });
    w.setPhase('playing');                          // resumed: the ask is over
    expect(r.bp.view().checking).toBe(true);        // …but the check has not passed yet, so it still runs
  });

  it('handOver(): a new body — the whole check again (the safety note, the reach), the source re-centred', async () => {
    game();
    const r = rig();
    await r.bp.begin('skateboard');
    const fs = frames();
    r.push(fs);
    r.bp.handOver();
    expect(r.calls.at(-1)).toBe('recalibrate');
    expect(r.bp.view().stage).toBe('checking');
    r.push(later(frames(14, script([hold(restPose(), 3)], 30)), fs[fs.length - 1].t + 33));
    expect(r.bp.view().space!.stage).toBe('arms');   // the reach is asked for again
  });

  it('the feed taking the camera\'s place is a new body', async () => {
    game();
    const r = rig();
    await r.bp.begin('skateboard');
    r.push(frames());
    expect(r.bp.view().stage).toBe('set');
    r.setStatus({ source: 'feed', camera: null });
    expect(r.bp.view().stage).toBe('checking');
    expect(r.calls.at(-1)).toBe('recalibrate');
  });

  it('the camera stopped under it (the shell unmounted, the feed ended): off; and end() remembers off', async () => {
    game();
    const r = rig();
    await r.bp.begin('skateboard');
    r.setSource('idle');
    expect(r.bp.view().stage).toBe('off');
    await r.bp.begin('skateboard');
    r.bp.end('skateboard');
    expect(r.calls.at(-1)).toBe('stop');
    expect(r.store.get(`${BODY_PLAY_KEY_PREFIX}skateboard`)).toBe('0');
    expect(r.bp.view()).toMatchObject({ stage: 'off', space: null, checking: false });
  });

  it('the page going to the background turns the camera off; the choice stays remembered', async () => {
    game();
    const r = rig();
    await r.bp.begin('skateboard');
    r.push(frames());
    r.hide();
    expect(r.calls.at(-1)).toBe('stop');
    expect(r.bp.view()).toMatchObject({ stage: 'off', space: null, checking: false });
    expect(r.store.get(`${BODY_PLAY_KEY_PREFIX}skateboard`)).toBe('1');
    const n = r.calls.length;
    r.hide();                                       // already off: nothing more
    expect(r.calls).toHaveLength(n);
    // hidden while the camera prompt is still up: stopped too, and the pending start comes back false
    const p = r.bp.begin('skateboard');
    r.hide();
    expect(r.bp.view().stage).toBe('off');
    await p;
    expect(r.bp.view().stage).toBe('off');
  });

  it('the picture\'s shape follows the camera (a phone turned on its side)', async () => {
    game();
    const r = rig();
    await r.bp.begin('skateboard');
    expect(r.bp.view().camera.aspect).toBeCloseTo(4 / 3, 9);
    r.setStatus({ camera: { width: 720, height: 1280, frameRate: 30, facingMode: 'user', portrait: true } });
    expect(r.bp.view().camera).toMatchObject({ aspect: 720 / 1280, portrait: true });
  });
});

describe('the samples and the voice run only while the check does', () => {
  it('the brightness is sampled at most every LUMA_EVERY_MS, and not at all once the check has stopped reading', async () => {
    const w = game();
    const r = rig();
    await r.bp.begin('skateboard');
    const fs = frames();
    r.push(fs);
    expect(r.samples.length).toBeGreaterThan(10);
    for (let i = 1; i < r.samples.length; i++) expect(r.samples[i] - r.samples[i - 1]).toBeGreaterThanOrEqual(LUMA_EVERY_MS);
    const n = r.samples.length;
    w.setPhase('playing');
    r.push(later(frames(15), fs[fs.length - 1].t + 33));
    expect(r.samples).toHaveLength(n);
  });

  it('the Coach says the check\'s lines (the takes the bank holds), with the words as the caption', async () => {
    game();
    const bank = ['coach/coach.space.intro.01', 'coach/coach.space.arms.01', 'coach/coach.space.still.01', 'coach/coach.space.ready.01'];
    const r = rig({ bank });
    await r.bp.begin('skateboard');
    // a player who waits for the line: the reach at 3.5 s, after the Coach has asked for it (3.1 s: the opening line
    // at 0.6 s, then SAY_GAP_MS)
    r.push(frames(11, spaceSession({ up: 3.5, down: 4.9, end: 10 })));
    expect(r.said.map(([c]) => c)).toEqual(['coach/coach.space.intro.01', 'coach/coach.space.arms.01', 'coach/coach.space.still.01', 'coach/coach.space.ready.01']);
    expect(r.said[0][1]).toMatch(/whole body/);
    const quiet = rig({ bank: [] });
    await quiet.bp.begin('skateboard');
    quiet.push(frames());
    expect(quiet.said).toEqual([]);
  });

  it('a slow camera: jump height is "unread", for the game to carry (absence, never 0)', async () => {
    game();
    const r = rig();
    await r.bp.begin('skateboard');
    expect(r.bp.view().jumpHeight).toBeNull();
    r.push(synthesize(spaceSession({ end: 8 }), { camera: PLAY, seed: 11, fps: 15 }).frames);
    expect(r.bp.view().poseHz!).toBeLessThan(24);
    expect(r.bp.view().jumpHeight).toBe('unread');
  });
});

describe('the header Body button (the shortcut)', () => {
  it('on a game where body play is coming: the card only — never a camera', async () => {
    game('dunk');
    const r = rig();
    expect(await r.bp.button()).toBe('coming');
    expect(r.calls).toEqual([]);
  });

  it('mid-play: the game pauses first, then the check runs over the pause', async () => {
    game('skateboard', 'playing');
    const r = rig();
    expect(await r.bp.button()).toBe('begin-paused');
    expect(r.calls.slice(0, 3)).toEqual(['pause', 'unlock', 'voice.load']);
    expect(r.calls).toContain('start');
    expect(sessionStore.view().phase).toBe('paused');
    expect(r.bp.view().checking).toBe(true);
  });

  it('at READY it begins; pressed again with the camera on, it turns it off and remembers off', async () => {
    game();
    const r = rig();
    expect(await r.bp.button()).toBe('begin');
    expect(r.bp.view().stage).toBe('checking');
    expect(await r.bp.button()).toBe('end');
    expect(r.calls.at(-1)).toBe('stop');
    expect(r.store.get(`${BODY_PLAY_KEY_PREFIX}skateboard`)).toBe('0');
  });

  it('a second body stepping in at READY: the check drops back, and the source lets go', async () => {
    game();
    const r = rig();
    await r.bp.begin('skateboard');
    const fs = frames();
    r.push(fs);
    const other = later(synthesize(script([hold(moveJoints(restPose(), [0.6, 0, 0]), 1)], 30), { camera: PLAY, seed: 3 }).frames, fs[fs.length - 1].t + 33);
    r.push(other.slice(0, 3));
    expect(r.bp.view().space!.issue).toBe('swap');
    expect(r.calls.at(-1)).toBe('recalibrate');
  });
});

describe('the probe hook', () => {
  const g = globalThis as unknown as Record<string, unknown>;
  const env = process.env as Record<string, string | undefined>;
  const nodeEnv = env.NODE_ENV;
  afterEach(() => { env.NODE_ENV = nodeEnv; delete g.window; vi.resetModules(); });

  async function load(mode: string, hostname: string, search = ''): Promise<Record<string, unknown> | undefined> {
    vi.resetModules();
    env.NODE_ENV = mode;
    const kept = new Map<string, string>();
    const win: Record<string, unknown> = {
      location: { hostname, search },
      sessionStorage: { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => { kept.set(k, v); }, removeItem: (k: string) => { kept.delete(k); } },
    };
    g.window = win;
    await import('./bodyPlay');
    return win.__FEL_SPACE__ as Record<string, unknown> | undefined;
  }

  it('__FEL_SPACE__ stays behind the feed\'s gate: development, or a production build on this machine with ?agent=1', async () => {
    expect(await load('production', 'finalevolution.us')).toBeUndefined();
    expect(await load('production', 'finalevolution.us', '?agent=1')).toBeUndefined();
    expect(await load('production', 'localhost')).toBeUndefined();
    expect(Object.keys((await load('production', 'localhost', '?agent=1')) ?? {}).sort())
      .toEqual(['again', 'begin', 'end', 'handOver', 'session', 'shortcut', 'view']);
    expect(typeof (await load('development', 'fel.example'))?.shortcut).toBe('function');
  });
});
