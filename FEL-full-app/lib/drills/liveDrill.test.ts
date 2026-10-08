import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createBodyPlay, type BodyPlay, type BodyPlayDeps } from '../move/bodyPlay';
import { bodyPlayNeedsGrownUp, type BodyPlayAge } from '../move/bodyPlayGrownUp';
import { sessionStore } from '../babylon/core/sessionStore';
import { START_HOLD_MS } from '../babylon/core/BodySession';
import type { BodyPacket } from '../babylon/core/InputBus';
import { MirrorWakeLock, type WakeSentinelLike } from '../mirror/liveCamera';
import type { PoseSourceSnapshot, PoseSourceState } from '../input/poseSource';
import type { PoseStatus } from '../pose/PoseService';
import type { PoseFrame } from '../pose/landmarks';
import { BodyReader } from '../pose/BodyReader';
import { ChannelReader } from '../pose/bodyChannels';
import { synthesize, type PoseFixture } from '../pose/synth';
import { spaceSession, holdStill } from '../pose/streamKit';
import { createLiveDrill, DrillClock, DRILLS_BODY_KEY, PACKET_STALE_MS, type LiveDrill } from './liveDrill';
import { DRILL_ABANDON_MS, RESTART_PHASE_MS } from './DrillRunner';
import type { CoachPrompt, Drill, DrillTarget } from './chart';

// Mirror & coaching plan Phase 6 (2026-10-07): a drill run on the camera, end to end, with the page taken out. Body play
// is the REAL createBodyPlay (the games' space check, over a fake source and camera service, as lib/move/bodyPlay.test
// drives it), the session store is the real one, the wake lock is the REAL MirrorWakeLock (Phase 1's) over a fake
// navigator.wakeLock and visibility, and the body's packets are a real BodyReader + ChannelReader over recorded and
// synthesized pose streams. What is pinned: the drill scores the owner's recorded jumps through the whole chain; the
// camera goes off and the drill pauses on a hide, keeps its place across a gap longer than the drill's own abandon rule,
// and carries on from the beat it stopped on; the screen is kept awake exactly while the camera is on; START is the
// games' hands-up hold only once the space is set; and an under-18 meets the grown-up step before any camera.

const PLAY = { distance: 3.6, heightM: 1.2 };
const TICK = 1000 / 60;
const fixture = (name: string) =>
  JSON.parse(readFileSync(join(__dirname, '..', 'pose', '__fixtures__', `${name}.json`), 'utf8')) as PoseFixture;
const shiftFrames = (fs: readonly PoseFrame[], dt: number): PoseFrame[] =>
  fs.map((f) => ({ ...f, t: f.t + dt, arrive: (f.arrive ?? f.t + 66) + dt }));

/** The space check's own stream (stand, reach, lower, stand still), from `t0`. */
const checkFrames = (t0: number, seed = 11) => shiftFrames(synthesize(spaceSession(), { camera: PLAY, seed }).frames, t0);

/** A stream through a fresh reader (what a freshly started pose source publishes), as bus packets with their frames. */
function packetsOf(fs: readonly PoseFrame[]): { frame: PoseFrame; packet: BodyPacket }[] {
  const reader = new BodyReader();
  const channels = new ChannelReader({ calibration: () => reader.calibration });
  return fs.map((f) => {
    const { read, events } = reader.read(f);
    return { frame: f, packet: { read, events, channels: channels.step(read, events, f), arrivedAt: f.arrive ?? f.t } };
  });
}

/** navigator.wakeLock and the page's visibility, faked (lib/mirror/liveCamera.test's): the browser drops it on hide. */
function fakeWakeWorld() {
  const listeners = new Set<() => void>();
  const doc = {
    visibilityState: 'visible' as 'visible' | 'hidden',
    addEventListener: (_t: 'visibilitychange', fn: () => void) => { listeners.add(fn); },
    removeEventListener: (_t: 'visibilitychange', fn: () => void) => { listeners.delete(fn); },
  };
  const held: { released: boolean; fire(): void }[] = [];
  const api = {
    request: vi.fn(async (): Promise<WakeSentinelLike> => {
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
    if (v === 'hidden') held.forEach((s) => s.fire());
    listeners.forEach((f) => f());
  };
  return { doc, api, setVisibility, live: () => held.filter((s) => !s.released).length };
}
const settle = () => new Promise((r) => setTimeout(r, 0));

let live: LiveDrill | null = null;
afterEach(() => { live?.dispose(); live = null; });

function rig(o: { age?: BodyPlayAge } = {}) {
  const calls: string[] = [];
  let clock = 0;
  // ── the camera service and the shared pose source, faked as lib/move/bodyPlay.test does ──
  const serviceFrames = new Set<(f: PoseFrame) => void>();
  const statusCbs = new Set<(s: PoseStatus) => void>();
  const sourceCbs = new Set<(s: PoseSourceSnapshot) => void>();
  const hiddenCbs = new Set<() => void>();
  let snapshot: PoseSourceSnapshot = { state: 'idle', detail: '', body: false };
  const setSource = (state: PoseSourceState) => { snapshot = { state, detail: '', body: false }; for (const cb of [...sourceCbs]) cb(snapshot); };
  const service = {
    status: { state: 'idle', why: null, source: null, model: null, modelWhy: null, camera: null } as PoseStatus,
    onFrame: (cb: (f: PoseFrame) => void) => { serviceFrames.add(cb); return () => { serviceFrames.delete(cb); }; },
    onStatus: (cb: (s: PoseStatus) => void) => { statusCbs.add(cb); return () => { statusCbs.delete(cb); }; },
  };
  const setStatus = (s: Partial<PoseStatus>) => { service.status = { ...service.status, ...s }; for (const cb of [...statusCbs]) cb(service.status); };
  const store = new Map<string, string>();
  const bpDeps: BodyPlayDeps = {
    source: {
      get snapshot() { return snapshot; },
      start: async () => {
        calls.push('camera.start');
        setStatus({ state: 'live', source: 'camera', camera: { width: 640, height: 480, frameRate: 30, facingMode: 'user', portrait: false } });
        setSource('calibrating');
        return true;
      },
      stop: () => { calls.push('camera.stop'); setStatus({ state: 'idle', source: null, camera: null }); setSource('idle'); },
      listen: (fn) => { sourceCbs.add(fn); return () => { sourceCbs.delete(fn); }; },
      setCalibration: () => { calls.push('setCalibration'); setSource('live'); },
      recalibrate: () => { calls.push('recalibrate'); setSource('calibrating'); },
    },
    service,
    session: sessionStore,
    storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => { store.set(k, v); } },
    unlockAudio: () => {},
    voice: { load: () => {}, play: () => {}, bank: () => new Set() },
    sampleLuma: () => null,
    pauseGame: () => {},
    onPageHidden: (fn) => { hiddenCbs.add(fn); },
    now: () => clock,
    needsGrownUp: () => bodyPlayNeedsGrownUp(o.age ?? { band: '18+' }, new Date('2026-10-07')),
  };
  const bodyPlay: BodyPlay = createBodyPlay(bpDeps);
  // ── the page's bus, the frames' world landmarks, the wake lock, the voice ──
  const busCbs = new Set<(p: BodyPacket) => void>();
  let busOn = false;
  const worldCbs = new Set<(f: { t: number; world?: PoseFrame['world'] }) => void>();
  const wakeWorld = fakeWakeWorld();
  const wake = new MirrorWakeLock(wakeWorld.api, wakeWorld.doc);
  const said: CoachPrompt[] = [];
  const timers: (() => void)[] = [];
  live = createLiveDrill({
    bodyPlay,
    session: sessionStore,
    bus: {
      start: () => { busOn = true; calls.push('bus.start'); },
      stop: () => { busOn = false; calls.push('bus.stop'); },
      onBody: (fn) => { busCbs.add(fn); return () => { busCbs.delete(fn); }; },
    },
    frames: { onFrame: (fn) => { worldCbs.add(fn); return () => { worldCbs.delete(fn); }; } },
    wake,
    onPageHidden: (fn) => { hiddenCbs.add(fn); return () => { hiddenCbs.delete(fn); }; },
    voice: { say: (p, show) => { said.push(p); show(`said ${p}`); }, stop: () => { calls.push('voice.stop'); } },
    now: () => clock,
    timers: { setTimer: (fn) => { timers.push(fn); return timers.length; }, clearTimer: () => {} },
  });
  const ld = live;

  type Action = { at: number; run: () => void };
  /**
   * Play a timeline on the page's clocks: check frames go to the camera service (the space check reads them), drill
   * packets to the bus (with their frame's world landmarks first, as PoseService delivers them), calls at their time,
   * and a display tick every 1/60 s, up to `until` (what comes after it is not played). Packets are delivered only while
   * the bus runs and the camera is on.
   */
  function play(o2: { check?: PoseFrame[]; packets?: { frame: PoseFrame; packet: BodyPacket }[]; calls?: Action[]; until: number; from?: number }) {
    const acts: Action[] = [
      ...(o2.check ?? []).map((f) => ({ at: f.arrive ?? f.t, run: () => { if (service.status.state === 'live') for (const cb of [...serviceFrames]) cb(f); } })),
      ...(o2.packets ?? []).map((x) => ({
        at: x.packet.arrivedAt,
        run: () => {
          if (!busOn || service.status.state !== 'live') return;
          for (const cb of [...worldCbs]) cb(x.frame);
          for (const cb of [...busCbs]) cb(x.packet);
        },
      })),
      ...(o2.calls ?? []),
    ].sort((a, b) => a.at - b.at);
    let i = 0;
    for (let now = o2.from ?? clock; now <= o2.until; now += TICK) {
      while (i < acts.length && acts[i].at <= now) { clock = Math.max(clock, acts[i].at); acts[i++].run(); }
      clock = now;
      ld.tick(now);
    }
  }
  const hide = () => {
    wakeWorld.setVisibility('hidden');
    for (const cb of [...hiddenCbs]) cb();
  };
  const show = () => wakeWorld.setVisibility('visible');
  const flush = () => { const t = timers.splice(0); t.forEach((f) => f()); };
  return {
    live: ld, bodyPlay, calls, said, store, play, hide, show, flush, wakeWorld, setClock: (t: number) => { clock = t; },
    get clock() { return clock; },
  };
}

const mini = (targets: DrillTarget[], durationSec = 12): Drill => ({
  id: 'mini-jumps', name: 'Mini', blurb: '', checks: [],
  source: { book: 'playbook', chapter: 6, section: 'Drill 3: The Safe Landing Check' },
  phases: [{
    id: 'p', name: 'Jumps', durationSec, presence: 'required', cue: 'Jump on the beat.', targets,
    prompts: [{ t: 0, id: 'coach.drill.intro' }, { t: durationSec - 1, id: 'coach.drill.done' }],
  }],
});

// ── the owner's recorded jumps, through the whole chain ─────────────────────────────────────────────────────────────

/**
 * The owner's four low two-foot jumps (fixture jump_two_foot_low, as recorded), arranged on the drill's clock: the space
 * check passes on a synthesized player, START is pressed at `go`, and the recording follows a still stand so its first
 * take-off lands at FIRST (s) on the chart. The chart's jump targets are the recording's own take-offs.
 */
const FIRST = 6;
function jumpSession(go: number) {
  const f = fixture('jump_two_foot_low');
  const offs = f.gt.jumps.map((j) => j.takeoff.t);
  // the drill clock starts at the first tick at or after START with the body in frame: `go` itself (the stand is there)
  const shift = go + FIRST * 1000 - offs[0];
  const rec = shiftFrames(f.frames, shift);
  const firstPresent = rec.find((x) => x.present)!;
  const standFrom = go - 2000;
  const stand = holdStill(firstPresent, { sec: (rec[0].t - standFrom) / 1000, fps: 30, beforeT: rec[0].t })
    .map((x) => ({ ...x, arrive: x.t + 66 }));
  // …and a still stand after it, to the drill's end (the recording is 3.3 s)
  const lastPresent = [...rec].reverse().find((x) => x.present)!;
  const end = rec[rec.length - 1].t;
  const after = holdStill(lastPresent, { sec: 6, fps: 30, beforeT: end + 6000 + 1000 / 30, seed: 12 })
    .map((x) => ({ ...x, arrive: x.t + 66 }));
  const chart = mini(offs.map((t) => ({ t: FIRST + (t - offs[0]) / 1000, move: 'jump' as const, limb: 'feet' as const, label: 'JUMP' })));
  return { chart, stand, rec: [...rec, ...after], offs: offs.map((t) => t + shift) };
}

describe('a drill on the camera: the space check, START, the owner\'s recorded jumps, the result', () => {
  it('scores the recording through the real reader; the camera goes off and the screen may sleep when it ends', async () => {
    const r = rig();
    const GO = 5200;
    const s = jumpSession(GO);
    await r.live.open(s.chart);
    expect(r.calls).toContain('camera.start');
    expect(sessionStore.view()).toMatchObject({ key: DRILLS_BODY_KEY, phase: 'ready' });
    await settle();
    expect(r.wakeWorld.live()).toBe(1);                          // the screen is kept awake once the camera is on
    r.play({ check: checkFrames(0), packets: packetsOf([...s.stand, ...s.rec]), until: GO - TICK, from: 0 });
    expect(r.bodyPlay.view().stage).toBe('set');                  // the games' space check passed
    expect(r.live.view().phase).toBe('setup');
    r.play({ calls: [{ at: GO, run: () => r.live.go() }], until: GO + 1 });
    expect(r.live.view().phase).toBe('playing');
    expect(sessionStore.view().phase).toBe('playing');
    r.play({ packets: packetsOf([...s.stand, ...s.rec]).filter((x) => x.packet.arrivedAt > GO), until: GO + 13_000 });
    const res = r.live.view().result!;
    expect(res.status).toBe('complete');
    const c = res.phases[0].counts;
    // measured 2026-10-07: all four take-offs answered through BodyReader, four PERFECT (mean timing −12 ms)
    expect(c.MISS).toBe(0);
    expect(c.PERFECT + c.GREAT + c.GOOD).toBe(4);
    expect(c.PERFECT + c.GREAT).toBeGreaterThanOrEqual(3);
    expect(r.said).toEqual(['coach.drill.intro', 'coach.drill.done']);
    expect(r.live.view().phase).toBe('done');
    expect(r.calls).toContain('camera.stop');
    await settle();
    expect(r.wakeWorld.live()).toBe(0);
  });

  it('a hide mid-drill: the camera off, the drill paused where it was; 90 s later (past the drill\'s own one-minute '
    + 'abandon rule) a tap, the check again, RESUME — and the rest of the jumps land on their own beats', async () => {
    const r = rig();
    const GO = 5200;
    const s = jumpSession(GO);
    const all = packetsOf([...s.stand, ...s.rec]);
    await r.live.open(s.chart);
    r.play({ check: checkFrames(0), packets: all, until: GO - TICK, from: 0 });
    r.play({ calls: [{ at: GO, run: () => r.live.go() }], until: GO + 1 });
    // play to between the second and third jump (the first two landed), then the tab is hidden
    const H = s.offs[2] - 300;
    r.play({ packets: all.filter((x) => x.packet.arrivedAt > GO && x.frame.t < H), until: H });
    const before = r.live.runner()!.result().phases[0].counts;
    expect(before.PERFECT + before.GREAT + before.GOOD).toBe(2);
    r.hide();
    expect(r.live.view().phase).toBe('paused');
    expect(sessionStore.view().phase).toBe('paused');
    expect(r.calls.filter((c) => c === 'camera.stop')).toHaveLength(1);    // the camera is OFF while hidden
    expect(r.calls).toContain('voice.stop');
    await settle();
    expect(r.wakeWorld.live()).toBe(0);
    // a long gap, longer than DRILL_ABANDON_MS (and RESTART_PHASE_MS): nothing ticks a hidden page
    const GAP = 90_000;
    expect(GAP).toBeGreaterThan(DRILL_ABANDON_MS);
    expect(GAP).toBeGreaterThan(RESTART_PHASE_MS);
    const R = H + GAP;
    r.show();
    r.setClock(R - 6000);
    await settle();
    expect(r.wakeWorld.live()).toBe(0);                           // back on the page, the camera still off: no lock
    expect(r.calls.filter((c) => c === 'camera.start')).toHaveLength(1);  // the camera never restarts by itself
    await r.live.cameraBack();
    await settle();
    expect(r.wakeWorld.live()).toBe(1);
    // the check runs again on whoever stands there; a fresh source reads the stand, then the rest of the recording
    const rest = s.rec.filter((f) => f.t >= H).map((f) => ({ ...f, t: f.t + GAP, arrive: (f.arrive ?? f.t) + GAP }));
    const stand2 = holdStill(rest.find((f) => f.present)!, { sec: 4, fps: 30, beforeT: rest[0].t }).map((x) => ({ ...x, arrive: x.t + 66 }));
    const after = packetsOf([...stand2, ...rest]);
    r.play({ check: checkFrames(R - 5600), packets: after, from: R - 5600, until: R - TICK });
    expect(r.bodyPlay.view().stage).toBe('set');
    expect(r.live.view().phase).toBe('paused');                   // a passed check alone resumes nothing
    r.play({ calls: [{ at: R, run: () => r.live.go() }], packets: after.filter((x) => x.packet.arrivedAt >= R), from: R, until: R + 10_000 });
    const res = r.live.view().result!;
    expect(res.status).toBe('complete');
    expect(res.phases[0].attempts).toBe(1);                       // the phase was never restarted
    const c = res.phases[0].counts;
    // measured 2026-10-07: the same four PERFECTs as the uninterrupted run (mean timing −15 ms against −12 ms)
    expect(c.MISS).toBe(0);
    expect(c.PERFECT + c.GREAT + c.GOOD).toBe(4);
    expect(c.PERFECT + c.GREAT).toBeGreaterThanOrEqual(3);
  });
});

// ── START, the space check, the screen ───────────────────────────────────────────────────────────────────────────────

/** Hand-made packets: a calibrated body standing, both hands up from `upFrom` (capture ms), 30 fps. */
function standingPackets(from: number, to: number, upFrom = Infinity): BodyPacket[] {
  const out: BodyPacket[] = [];
  for (let t = from; t < to; t += 1000 / 30) {
    const up = t >= upFrom ? t - upFrom : 0;
    out.push({
      read: { t, present: true, tracking: true, calibrated: true, airborne: false } as BodyPacket['read'],
      events: [], channels: { inJump: false, stride: null, handsUpMs: up, handsDownMs: up ? 0 : 1000 }, arrivedAt: t + 66,
    });
  }
  return out;
}
const asPackets = (ps: BodyPacket[]) => ps.map((packet) => ({ frame: { t: packet.read.t, present: true, image: [], world: null } as unknown as PoseFrame, packet }));

describe('START is the games\' hands-up hold, or a tap — and only once the space check has passed', () => {
  it('both hands held up START_HOLD_MS starts the drill once the space is set; held before it, nothing', async () => {
    const r = rig();
    await r.live.open(mini([{ t: 8, move: 'jump', limb: 'feet' }]));
    // hands up during the check (the check's own reach): not a START — the space is not set yet
    r.play({ packets: asPackets(standingPackets(0, 2000, 500)), until: 2000, from: 0 });
    expect(r.bodyPlay.view().stage).not.toBe('set');
    expect(r.live.view().phase).toBe('setup');
    // the check passes; then a fresh hold (hands down first) starts it
    r.play({ check: checkFrames(2000), until: 7300 });
    expect(r.bodyPlay.view().stage).toBe('set');
    r.play({ packets: asPackets(standingPackets(7300, 8000)), until: 8000 });
    expect(r.live.view().phase).toBe('setup');
    r.play({ packets: asPackets(standingPackets(8000, 8000 + START_HOLD_MS + 300, 8000)), until: 8000 + START_HOLD_MS + 400 });
    expect(r.live.view().phase).toBe('playing');
    expect(sessionStore.view().phase).toBe('playing');
  });

  it('the hold ring shows on the session card at READY (body play\'s panel draws it)', async () => {
    const r = rig();
    await r.live.open(mini([{ t: 8, move: 'jump', limb: 'feet' }]));
    r.play({ check: checkFrames(0), until: 5300, from: 0 });
    r.play({ packets: asPackets(standingPackets(5300, 5300 + START_HOLD_MS / 2, 5300)), until: 5300 + START_HOLD_MS / 2 });
    expect(sessionStore.view().handsUp01).toBeGreaterThan(0.3);
    expect(sessionStore.view().handsUp01).toBeLessThan(1);
  });

  it('a tap before the check passes waits for it, then starts', async () => {
    const r = rig();
    await r.live.open(mini([{ t: 8, move: 'jump', limb: 'feet' }]));
    r.live.go();
    r.flush();
    expect(r.live.view()).toMatchObject({ phase: 'setup', waiting: true });
    r.play({ check: checkFrames(0), until: 5400, from: 0 });
    expect(r.bodyPlay.view().stage).toBe('set');
    expect(r.live.view()).toMatchObject({ phase: 'playing', waiting: false });
  });

  it('the drill clock waits for a body in frame: packets that stop count as nobody after PACKET_STALE_MS', async () => {
    const r = rig();
    await r.live.open(mini([{ t: 8, move: 'jump', limb: 'feet' }]));
    r.play({ check: checkFrames(0), until: 5400, from: 0 });
    r.live.go();
    r.play({ packets: asPackets(standingPackets(5400, 7400)), until: 7400 + 66 });
    const ran = r.live.runner()!.tick(r.clock, true).drillSec;
    // no packets for a while: the runner pauses (its own grace on top of PACKET_STALE_MS)
    r.play({ until: 7466 + PACKET_STALE_MS + 1500 });
    expect(r.live.view().run!.status).toBe('paused');
    expect(r.live.view().run!.drillSec).toBeLessThan(ran + (PACKET_STALE_MS + 400) / 1000);
  });
});

describe('a move captured before RESUME is the pause\'s, not the drill\'s', () => {
  it('a take-off the camera saw during the re-check, arriving just after RESUME, answers no target near the pause', async () => {
    const r = rig();
    await r.live.open(mini([{ t: 8, move: 'jump', limb: 'feet' }]));
    r.play({ check: checkFrames(0), until: 5400, from: 0 });
    r.live.go();
    const G = r.clock;
    // a body in frame until just before the target, then the tab is hidden
    r.play({ packets: asPackets(standingPackets(G - 500, G + 7900)), until: G + 7900 });
    expect(r.live.view().run!.drillSec).toBeGreaterThan(7.7);
    r.hide();
    const R = G + 7900 + 30_000;
    r.show();
    await r.live.cameraBack();
    r.play({ check: checkFrames(R - 5400), from: R - 5400, until: R - TICK });
    // the re-check saw a jump 40 ms before RESUME; its packet arrives 30 ms after it
    const jump = standingPackets(R - 40, R - 39)[0];
    const pre = { ...jump, events: [{ kind: 'takeoff', t: R - 40, feet: 'two', foot: 'both' }] as unknown as BodyPacket['events'], arrivedAt: R + 30 };
    r.play({ calls: [{ at: R, run: () => r.live.go() }], packets: asPackets([pre, ...standingPackets(R + 33, R + 9000)]), from: R, until: R + 9000 });
    const c = r.live.view().result!.phases[0].counts;
    expect(c.MISS).toBe(1);                                         // nothing jumped after RESUME
    expect(c.PERFECT + c.GREAT + c.GOOD).toBe(0);
  });
});

describe('the screen stays awake exactly while the camera is on (Phase 1, owner decision 7)', () => {
  it('held from the camera start, dropped on a hide, NOT taken back by a visible page with the camera off, held again on Camera back', async () => {
    const r = rig();
    await r.live.open(mini([{ t: 8, move: 'jump', limb: 'feet' }]));
    await settle();
    expect(r.wakeWorld.api.request).toHaveBeenCalledTimes(1);
    expect(r.wakeWorld.live()).toBe(1);
    r.hide();
    await settle();
    expect(r.wakeWorld.live()).toBe(0);
    expect(r.calls).toContain('camera.stop');
    r.show();
    await settle();
    expect(r.wakeWorld.api.request).toHaveBeenCalledTimes(1);
    await r.live.cameraBack();
    await settle();
    expect(r.wakeWorld.live()).toBe(1);
    r.live.close();
    await settle();
    expect(r.wakeWorld.live()).toBe(0);
    expect(r.calls).toContain('bus.stop');
    expect(sessionStore.view().modeId).toBeNull();               // the card is gone with the page
  });

  it('a hide at READY turns the camera off too, and a waiting tap is dropped (no START behind a hidden page)', async () => {
    const r = rig();
    await r.live.open(mini([{ t: 8, move: 'jump', limb: 'feet' }]));
    r.live.go();
    r.hide();
    r.flush();
    expect(r.calls).toContain('camera.stop');
    expect(r.live.view()).toMatchObject({ phase: 'setup', waiting: false });
  });
});

describe('an under-18, or an unknown age: the grown-up step before any camera; nothing is sent', () => {
  it('open() asks for the grown-up step and starts no camera; the screen is not held; the tick starts it', async () => {
    const r = rig({ age: { dobYear: 2012 } });
    expect(await r.live.open(mini([{ t: 8, move: 'jump', limb: 'feet' }]))).toBe(false);
    expect(r.bodyPlay.view().grownUp).toBe('ask');
    expect(r.calls).not.toContain('camera.start');
    await settle();
    expect(r.wakeWorld.api.request).not.toHaveBeenCalled();
    expect(await r.bodyPlay.confirmGrownUp()).toBe(true);
    expect(r.calls).toContain('camera.start');
    await settle();
    expect(r.wakeWorld.live()).toBe(1);
  });

  it('unknown age (no birth year, no screen answer) is the same step', async () => {
    const r = rig({ age: {} });
    expect(await r.live.open(mini([{ t: 8, move: 'jump', limb: 'feet' }]))).toBe(false);
    expect(r.bodyPlay.view().grownUp).toBe('ask');
    expect(r.calls).not.toContain('camera.start');
  });

  it('the drill\'s camera side has no network call and writes no progress, for any age', () => {
    const files = ['lib/drills/liveDrill.ts', 'lib/drills/drillVoice.ts', 'lib/drills/route.ts', 'lib/drills/access.ts'];
    const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(n) && !/\.test\./.test(n) ? [p] : [];
    });
    const root = join(__dirname, '..', '..');
    const all = [...files.map((f) => join(root, f)), ...walk(join(root, 'app', 'play', 'drills'))];
    expect(all.length).toBeGreaterThan(5);
    for (const f of all) {
      const src = readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '');
      expect(src, f).not.toMatch(/\bfetch\s*\(|sendBeacon|XMLHttpRequest|localStorage\.setItem|sessionStorage\.setItem|indexedDB/);
      expect(src, f).not.toMatch(/\bprisma\.\w+\.(create|update|upsert|delete)/);
    }
  });
});

describe('DrillClock: the time the camera was off never happened, to the drill', () => {
  it('maps every time after a resume back by the pause; nothing before the first pause moves', () => {
    const c = new DrillClock();
    expect(c.map(1234)).toBe(1234);
    c.pause(10_000);
    expect(c.paused).toBe(true);
    c.resume(100_000);
    expect(c.map(100_000)).toBe(10_000);
    expect(c.resumedAt).toBe(100_000);
    c.pause(110_000);
    c.pause(115_000);                                              // a second hide before a resume changes nothing
    c.resume(120_000);
    expect(c.map(120_000)).toBe(20_000);
    c.resume(130_000);                                             // a resume with no pause changes nothing
    expect(c.map(130_000)).toBe(30_000);
  });
});
