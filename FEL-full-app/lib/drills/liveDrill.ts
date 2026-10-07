// liveDrill — a drill run on the camera, end to end (Mirror & coaching plan Phase 6, "drills and warm-up by body",
// 2026-10-07; movement-play P9's /play/drills). The page's whole camera side, as one pure controller over stand-ins, so
// node tests drive it with recorded pose streams and fake pages (app/play/drills/_components/use-live-drill.ts is the
// React glue).
//
// NOTHING NEW ABOUT THE CAMERA. It is the games' body play, used the way a game host uses it:
//   · the space check is BODY PLAY'S (lib/move/bodyPlay.ts, lib/move/spaceCheck.ts — read-only here): open() mounts a
//     card on the session store as a game host's harness does (sessionStore.mount: phase 'ready'), and begin()s body
//     play under the key DRILLS_BODY_KEY. The check runs on READY exactly as on a game's READY screen, hands the shared
//     pose source its rulers when it passes, and the page draws body-play's own SpaceCheckPanel. The grown-up step for
//     an under-18 or an unknown age is body play's too (bodyPlay grownUp 'ask' → the Mirror's GrownUpStep).
//   · the body reaches the drill the way it reaches a game: the shared pose source publishes one BodyPacket per camera
//     frame to every running InputBus (publishBodyToLive); this page runs one bus and hands each packet's { read,
//     events } to DrillRunner.read(), with the frame's world landmarks (PoseService.onFrame, paired by capture time).
//   · START is the games' hands-up hold (BodySession, the same 800 ms, the same "a hold must begin in this phase") or a
//     tap. BodySession never pauses this page (drives: false): the drill's own clock already waits for a body that left
//     the frame (DrillRunner, ScreenRunner's semantics), and a walk-off is not an exit.
//
// PHASE 1'S CAMERA RULES (owner decision 7, 2026-10-07; lib/mirror/liveCamera.ts, reused by import):
//   · the screen is kept awake while the camera is on (MirrorWakeLock, asked again on every return to the page);
//   · the tab hidden = the camera OFF (body play's own hidden handler stops the source; the light goes out) and the drill
//     PAUSED where it was: its clock stops (DrillClock below), its phase, its targets and its counts are kept. Back on
//     the page a tap turns the camera on, the space check runs again (whoever stands there now is measured), and a
//     hands-up hold or RESUME carries the drill on from the beat it stopped on. The camera never restarts by itself.
//
// AGE. Everything here runs on the device and nothing is sent or stored, for every age (the page has no save path:
// app/play/drills reports why). An under-18 meets the grown-up step before the camera, and the drills that jump wait
// (lib/drills/access.ts) — both decided before this controller sees the drill.
import type { BodyPacket } from '../babylon/core/InputBus';
import type { ModePhase } from '../babylon/core/ModeHarness';
import { BodySession } from '../babylon/core/BodySession';
import type { BodyPresence, SessionWriter, SessionView } from '../babylon/core/sessionStore';
import type { BodyPlayView } from '../move/bodyPlay';
import type { Wm } from '../pose/landmarks';
import { FrameView, HUD_HZ, type FrameViewDeps } from '../mirror/liveCamera';
import type { CoachPrompt, Drill } from './chart';
import { DrillRunner, type DrillJudged, type DrillResult, type DrillState } from './DrillRunner';
import type { ReaderEventLike, ReaderFrameLike } from './fromReader';

/** Body play's key for this page: the session card's key and the remembered choice (bodyPlayChoice). */
export const DRILLS_BODY_KEY = 'drills';
/** The session card's mode id (nothing in the game registry: no run record is ever counted from it). */
export const DRILLS_MODE_ID = 'drills';
/** A body is in frame for the drill clock while its latest packet tracked it and is no older than this (ms): a camera
 *  that stopped sending is nobody. The runner adds its own PRESENCE_GRACE_MS on top. */
export const PACKET_STALE_MS = 500;
/** A judgement stays on screen this long (ms) as the hit flash. */
export const FLASH_MS = 600;
/** The Coach's caption stays up this long (ms) after its line started: the longest drill take is ~3 s. */
export const CAPTION_MS = 4000;

/** idle: nothing open · setup: the camera and the space check (READY) · playing · paused: the tab was hidden, the
 *  camera is off, the drill waits · done: finished or abandoned, the camera off. */
export type LivePhase = 'idle' | 'setup' | 'playing' | 'paused' | 'done';

export interface LiveDrillView {
  phase: LivePhase;
  drillId: string | null;
  /** A START or RESUME was asked for (a tap) and waits for the space check to pass. */
  waiting: boolean;
  /** The drill's last tick (null before it starts). */
  run: DrillState | null;
  /** The last judgement, for FLASH_MS. */
  flash: DrillJudged | null;
  presence: BodyPresence;
  /** The hands-up hold's progress at READY / PAUSED (0..1). */
  handsUp01: number;
  result: DrillResult | null;
  /** The words of the Coach's line now playing (its caption), or null. */
  caption: string | null;
}

export const LIVE_IDLE: LiveDrillView = Object.freeze({
  phase: 'idle', drillId: null, waiting: false, run: null, flash: null, presence: 'off', handsUp01: 0, result: null, caption: null,
}) as LiveDrillView;

export interface LiveDrillDeps {
  bodyPlay: {
    view(): Pick<BodyPlayView, 'stage' | 'camera' | 'poseHz'>;
    subscribe(fn: () => void): () => void;
    begin(key: string): Promise<boolean>;
    end(key?: string | null): void;
  };
  session: { mount(m: Pick<SessionView, 'modeId' | 'key' | 'lines' | 'drives' | 'later'>): SessionWriter };
  bus: { start(): void; stop(): void; onBody(fn: (p: BodyPacket) => void): () => void };
  /** The camera's frames, for their world landmarks (PoseService.onFrame). */
  frames: { onFrame(fn: (f: { t: number; world?: readonly Wm[] | null }) => void): () => void };
  wake: { hold(): unknown; release(): unknown };
  /** Calls `fn` whenever the page goes to the background; returns the unsubscribe. */
  onPageHidden(fn: () => void): () => void;
  voice: { say(prompt: CoachPrompt, show: (caption: string) => void): void; stop(): void };
  /** The display clock (performance.now). */
  now(): number;
  timers: Pick<FrameViewDeps, 'setTimer' | 'clearTimer'>;
}

/**
 * The drill's clock across a camera-off pause: the time the tab was hidden (and the camera off, and the space check run
 * again) never happened, to the drill. Display times and capture times after a resume are both shifted back by every
 * pause so far, so the runner sees one continuous set — PoseClock's idea (lib/mirror/liveCamera.ts), for a pause that
 * starts and ends at known moments on the display clock.
 */
export class DrillClock {
  private offset = 0;
  private pausedAt: number | null = null;
  /** The display time the latest resume happened at (frames captured before it belong to the pause). */
  resumedAt = -Infinity;

  get paused(): boolean { return this.pausedAt !== null; }
  pause(now: number): void { if (this.pausedAt === null) this.pausedAt = now; }
  resume(now: number): void {
    if (this.pausedAt === null) return;
    this.offset += Math.max(0, now - this.pausedAt);
    this.pausedAt = null;
    this.resumedAt = now;
  }
  map(t: number): number { return t - this.offset; }
}

const cameraOn = (s: string) => s !== 'idle' && s !== 'error';

export interface LiveDrill {
  view(): LiveDrillView;
  subscribe(fn: () => void): () => void;
  /** Open a drill: the card on the session store, the bus, and body play begun (the camera, or the grown-up step). */
  open(drill: Drill): Promise<boolean>;
  /** A tap on START / RESUME: starts (or resumes) now when the space check has passed, else as soon as it does. */
  go(): void;
  /** The paused drill's "turn the camera back on" (a tap; the camera never restarts by itself). */
  cameraBack(): Promise<boolean>;
  /** One display frame (requestAnimationFrame). */
  tick(now?: number): void;
  /** Stop the drill here: its result so far, the camera off. */
  finish(): void;
  /** Leave: the camera off, the card unmounted, the bus stopped, the screen free to sleep. */
  close(): void;
  /** The runner (tests read its result). */
  runner(): DrillRunner | null;
  dispose(): void;
}

export function createLiveDrill(deps: LiveDrillDeps): LiveDrill {
  const listeners = new Set<() => void>();
  const frame = new FrameView<LiveDrillView>(LIVE_IDLE, HUD_HZ, { now: deps.now, ...deps.timers });
  let phase: LivePhase = 'idle';
  let drill: Drill | null = null;
  let runner: DrillRunner | null = null;
  let writer: SessionWriter | null = null;
  let session = new BodySession({ drives: false, overheadIsPlay: false });
  let clock = new DrillClock();
  let pending = false;                     // a START / RESUME tap waiting for the space check
  let offs: (() => void)[] = [];
  let world: { t: number; world: readonly Wm[] | null | undefined } | null = null;
  let lastPacket: { at: number; tracking: boolean } | null = null;
  let lastPacketAt = -Infinity;
  let presence: BodyPresence = 'off';
  let handsUp01 = 0;
  let flash: { j: DrillJudged; at: number } | null = null;
  let last: DrillState | null = null;
  let result: DrillResult | null = null;
  let caption: { text: string; at: number } | null = null;
  let wakeHeld = false;

  const modePhase = (): ModePhase =>
    phase === 'setup' ? 'ready' : phase === 'playing' ? 'playing' : phase === 'paused' ? 'paused' : phase === 'done' ? 'ended' : 'loading';
  const spaceSet = (): boolean => deps.bodyPlay.view().stage === 'set';

  const snapshot = (): LiveDrillView => ({
    phase, drillId: drill?.id ?? null, waiting: pending, run: last,
    flash: flash && deps.now() - flash.at < FLASH_MS ? flash.j : null,
    presence, handsUp01, result,
    caption: caption && deps.now() - caption.at < CAPTION_MS ? caption.text : null,
  });
  /** A change the page acts on (a phase, a tap, the end): shown now. A plain frame: at most HUD_HZ times a second. */
  const publish = (now = false): void => { frame.set(snapshot(), { now }); };
  frame.subscribe(() => { for (const fn of [...listeners]) fn(); });

  const setPhase = (p: LivePhase): void => {
    phase = p;
    writer?.setPhase(modePhase());
    publish(true);
  };

  // ── the screen stays on while the camera is (owner decision 7) ──
  const syncWake = (): void => {
    const on = phase !== 'idle' && cameraOn(deps.bodyPlay.view().camera.state);
    if (on && !wakeHeld) { wakeHeld = true; void deps.wake.hold(); }
    else if (!on && wakeHeld) { wakeHeld = false; void deps.wake.release(); }
  };

  function startRun(by: 'body' | 'external'): void {
    if (!drill) return;
    const v = deps.bodyPlay.view();
    runner = new DrillRunner(drill, {
      ...(v.poseHz ? { poseHz: v.poseHz } : {}),
      ...(v.camera.aspect > 0 ? { aspect: v.camera.aspect } : {}),
    });
    clock = new DrillClock();
    pending = false;
    session.begin(deps.now(), by);
    setPhase('playing');
  }

  function resumeRun(by: 'body' | 'external'): void {
    pending = false;
    clock.resume(deps.now());
    session.begin(deps.now(), by);
    setPhase('playing');
  }

  function onPacket(p: BodyPacket): void {
    if (phase === 'idle' || phase === 'done') return;
    const now = deps.now();
    const step = session.step(modePhase(), p, now);
    presence = step.presence;
    handsUp01 = step.handsUp01;
    writer?.setBody(step.presence, step.handsUp01);
    if (p.final) { lastPacket = null; publish(); return; }
    lastPacketAt = p.arrivedAt;
    lastPacket = { at: p.arrivedAt, tracking: p.read.tracking };
    // the hands-up START / RESUME: only once the space check has passed (the rulers are this body's)
    if (spaceSet()) {
      if (phase === 'setup' && step.intents.includes('wake')) startRun('body');
      else if (phase === 'paused' && step.intents.includes('resume')) resumeRun('body');
    }
    if (phase === 'playing' && runner && !clock.paused) {
      // a frame captured before the resume belongs to the pause (the camera was being checked, not drilled)
      if (p.read.t < clock.resumedAt) return;
      const w = world && world.t === p.read.t ? world.world : null;
      const read = { ...(p.read as unknown as ReaderFrameLike), t: clock.map(p.read.t) };
      const events = p.events.map((e) => ({ ...(e as unknown as ReaderEventLike), t: clock.map(e.t) }));
      runner.read({ read, events, ...(w ? { world: w } : {}) });
    }
    publish();
  }

  function finishRun(): void {
    if (!runner) return;
    result = runner.result();
    pending = false;
    deps.bodyPlay.end();          // the camera off: nothing more to read
    setPhase('done');
  }

  const onHidden = (): void => {
    // body play has already stopped the camera (its own hidden handler); the drill stops where it is
    if (phase === 'playing') {
      clock.pause(deps.now());
      deps.voice.stop();
      caption = null;
      setPhase('paused');
    } else if (phase === 'setup' || phase === 'paused') {
      pending = false;
      publish(true);
    }
    syncWake();
  };

  const api: LiveDrill = {
    view: () => frame.shown(),
    subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; },

    async open(d) {
      api.close();
      drill = d;
      runner = null; result = null; last = null; flash = null; caption = null; pending = false;
      session = new BodySession({ drives: false, overheadIsPlay: false });
      clock = new DrillClock();
      writer = deps.session.mount({ modeId: DRILLS_MODE_ID, key: DRILLS_BODY_KEY, lines: [], drives: true, later: null });
      phase = 'setup';
      writer.setPhase('ready');
      // the world landmarks first, so a frame's are in hand when its packet arrives (the source subscribes after)
      offs.push(deps.frames.onFrame((f) => { world = { t: f.t, world: f.world }; }));
      deps.bus.start();
      offs.push(deps.bus.onBody(onPacket));
      offs.push(deps.bodyPlay.subscribe(syncWake));
      offs.push(deps.onPageHidden(onHidden));
      publish(true);
      return deps.bodyPlay.begin(DRILLS_BODY_KEY);
    },

    go() {
      if (phase !== 'setup' && phase !== 'paused') return;
      if (!spaceSet()) { pending = true; publish(true); return; }
      if (phase === 'setup') startRun('external');
      else resumeRun('external');
    },

    cameraBack() {
      if (phase !== 'paused' && phase !== 'setup') return Promise.resolve(false);
      return deps.bodyPlay.begin(DRILLS_BODY_KEY);
    },

    tick(nowArg) {
      const now = nowArg ?? deps.now();
      if (phase === 'idle' || phase === 'done') return;
      const st = session.tick(modePhase(), now, lastPacketAt);
      if (st.presence !== presence || st.handsUp01 !== handsUp01) {
        presence = st.presence; handsUp01 = st.handsUp01;
        writer?.setBody(presence, handsUp01);
      }
      // a tap that waited for the space check
      if (pending && spaceSet()) {
        if (phase === 'setup') startRun('external');
        else if (phase === 'paused') resumeRun('external');
      }
      if (phase !== 'playing' || !runner) { publish(); return; }
      const inFrame = !!lastPacket && lastPacket.tracking && now - lastPacket.at <= PACKET_STALE_MS;
      const s = runner.tick(clock.map(now), inFrame);
      last = s;
      if (s.judged.length) flash = { j: s.judged[s.judged.length - 1], at: now };
      for (const prompt of s.say) deps.voice.say(prompt, (c) => { caption = { text: c, at: deps.now() }; publish(); });
      if (s.status === 'complete' || s.status === 'abandoned') { finishRun(); return; }
      publish();
    },

    finish() {
      if (phase === 'playing' || phase === 'paused') {
        if (runner) { finishRun(); return; }
      }
      api.close();
    },

    close() {
      for (const off of offs) off();
      offs = [];
      if (phase !== 'idle') {
        deps.voice.stop();
        deps.bodyPlay.end();
        deps.bus.stop();
        writer?.unmount();
      }
      writer = null;
      world = null; lastPacket = null; lastPacketAt = -Infinity;
      presence = 'off'; handsUp01 = 0; pending = false;
      phase = 'idle';
      syncWake();
      publish(true);
    },

    runner: () => runner,

    dispose() {
      api.close();
      frame.dispose();
      listeners.clear();
    },
  };
  return api;
}
