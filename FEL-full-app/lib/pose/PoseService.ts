'use client';

// PoseService — the ONE camera owner for body play (movement play, phase 2, 2026-09-24).
//
// Before this, each camera feature opened its own getUserMedia and built its own landmarker, the body-control source
// never freed its landmarker, a stop() during the permission prompt left the camera on, and GameShell's two Body
// buttons (header + full-bleed) could run two cameras. Now one service per page owns the camera, the <video>, the
// landmarker and the frame loop, and everything else subscribes:
//
//   start(opts) / stop()        ONE owner starts and stops it (PoseSource today; the READY screen's body-play provider
//                               in phase 4). A second start() while one is pending returns the same promise.
//   onFrame(cb) → unsubscribe   every reader. A PoseFrame (lib/pose/landmarks.ts) per camera frame, with or without a
//                               body: t = capture time (requestVideoFrameCallback), arrive = when the result came,
//                               image + world landmarks.
//   latest                      the newest frame, for a reader that polls on its own clock
//   state / why / status        idle | requesting | loading | live | error (+ why); onStatus(cb) for React
//   video / showIn(el)          the <video>, for a self-view. Never mirrored here: the view flips it. MOVEMENT PLAY P4
//                               (2026-09-25): the space check's panel and the corner during play both show it, so the
//                               hosts STACK — the last one shown wins, and an undo hands the picture back to the one
//                               under it (or parks it), never taking it from a host shown since.
//   stats / model               fps, detect ms, capture→result latency; which model and why
//
// The model: full on a desktop, lite on a phone or tablet, and full drops to lite when its first seconds of body frames
// are over budget (lib/pose/modelChoice.ts: the rules and where each number comes from). The wasm and models are ours
// (/pose/, lib/pose/assets.ts). The camera picture never leaves the browser.
//
// A dev and QA feed can stand in for the camera: window.__FEL_POSE_FEED__ (lib/pose/feed.ts has the how-to).
import {
  MediaPipePoseAdapter, onVideoFrames,
  type DetectFrameInfo, type PoseFrame as AdapterFrame, type VideoFrameTick,
} from '../babylon/nexus/neuro-mirror/pose/mediapipe-adapter';
import { agentEnabled } from '../babylon/core/AgentBridge';
import { LANDMARK_COUNT, emptyFrame, type PoseFrame } from './landmarks';
import type { PoseModel } from './assets';
import {
  DetectBudget, FULL_BUDGET_MS, MIN_DETECT_GAP_MS, MODEL_MEMORY_KEY, askedModel, cameraConstraints,
  cameraFallbackConstraints, cameraTooSlow, deviceClass, initialModel, parseRemembered, rememberFallback, type DeviceHints,
} from './modelChoice';
import { FeedSchedule, feedHookAllowed, type FeedPlayOptions, type PoseFeed } from './feed';

export type PoseServiceState = 'idle' | 'requesting' | 'loading' | 'live' | 'error';

export interface PoseCameraInfo {
  /** The frame the model is handed, read from the video element: what the camera really gave, not what was asked. */
  width: number;
  height: number;
  frameRate: number | null;
  facingMode: string | null;
  portrait: boolean;
}

export interface PoseStatus {
  state: PoseServiceState;
  /** Why it is in 'error', in words a player can act on. */
  why: string | null;
  /** Where frames come from: the camera, or the dev feed. */
  source: 'camera' | 'feed' | null;
  model: PoseModel | null;
  /** Why this model (device class, ?pose=, a measured fallback). */
  modelWhy: string | null;
  camera: PoseCameraInfo | null;
}

export interface PoseStats {
  /** Frames delivered in the last second of capture time. */
  fps: number;
  /** Median main-thread cost of one detect over the last STATS_FRAMES frames (ms). Null on the feed. */
  detectMs: number | null;
  /** Median capture → result latency over the last STATS_FRAMES frames (ms). */
  latencyMs: number | null;
  /** The clock t is on: 'capture' (best), 'display' (rVFC without a capture stamp), 'now' (rAF fallback), 'feed'. */
  clock: VideoFrameTick['clock'] | 'feed' | null;
  /** Frames delivered since start. */
  frames: number;
}

export interface PoseStartOptions {
  /** Force a model (no measuring). Otherwise ?pose=, then the device rules. */
  model?: PoseModel;
  /** 'user' (default): the camera on the screen's side, facing the player, for a laptop or a propped phone. */
  facingMode?: 'user' | 'environment';
}

/** A landmarker as the service uses it: MediaPipePoseAdapter, or a test's stand-in. */
export interface PoseDetector {
  detect(video: HTMLVideoElement, timestampMs: number, info?: DetectFrameInfo): AdapterFrame;
  dispose(): void;
}

/** What the service needs from the page. The browser's are below; tests pass stand-ins. */
export interface PoseDeps {
  getUserMedia(c: MediaStreamConstraints): Promise<MediaStream>;
  /** A muted, inline <video> on the stream, parked in the document (requestVideoFrameCallback wants it there). Not yet playing. */
  makeVideo(stream: MediaStream): HTMLVideoElement;
  /** Start it. Rejects when it cannot play, and when releaseVideo() runs first (a pause or a cleared source rejects a pending play()). */
  playVideo(video: HTMLVideoElement): Promise<void>;
  releaseVideo(video: HTMLVideoElement): void;
  /** Park it out of sight again, still in the page (requestVideoFrameCallback wants it there). Default: document.body. */
  parkVideo?(video: HTMLVideoElement): void;
  loadDetector(model: PoseModel): Promise<PoseDetector>;
  onVideoFrames(video: HTMLVideoElement, onFrame: (tick: VideoFrameTick) => void): () => void;
  /** performance.now(): the clock capture times are on. */
  now(): number;
  env(): DeviceHints & { portrait: boolean; search: string };
  storage: { get(key: string): string | null; set(key: string, value: string): void };
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  warn(message: string, err?: unknown): void;
}

/** fps is counted over the last second. */
const STATS_WINDOW_MS = 1000;
/** Medians over the last 30 frames: one second at the 30 fps the camera is asked for. */
const STATS_FRAMES = 30;

const IDLE: PoseStatus = { state: 'idle', why: null, source: null, model: null, modelWhy: null, camera: null };

const stopTracks = (s: MediaStream) => s.getTracks().forEach((t) => { try { t.stop(); } catch { /* already stopped */ } });
const median = (v: number[]) => {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function readCamera(track: MediaStreamTrack | undefined, video: HTMLVideoElement): PoseCameraInfo {
  const s: MediaTrackSettings = track?.getSettings?.() ?? {};
  // The video's own size wins: it is the picture the model sees and the landmarks are normalised to, while a phone's
  // track settings can report the sensor's orientation instead of the picture's.
  const width = video.videoWidth || s.width || 0, height = video.videoHeight || s.height || 0;
  return { width, height, frameRate: s.frameRate ?? null, facingMode: s.facingMode ?? null, portrait: height > width };
}

/** The adapter's frame as the app's PoseFrame. A frame without all 33 points is a frame without a body. */
function toPoseFrame(raw: AdapterFrame, t: number, arrive: number): PoseFrame {
  if (!raw.present || raw.landmarks.length < LANDMARK_COUNT) return emptyFrame(t, arrive);
  const image = raw.landmarks.map((l) => ({ x: l.x, y: l.y, z: l.z, v: l.visibility }));
  return raw.world?.length === LANDMARK_COUNT
    ? { t, present: true, image, world: raw.world, arrive }
    : { t, present: true, image, arrive };
}

type Stage = 'camera' | 'video' | 'model';

/** A failed start, in words a player can act on. */
function explain(e: unknown, stage: Stage): string {
  if (stage === 'model') return 'The pose model did not load. Check the connection and try again.';
  if (stage === 'video') return 'The camera picture did not start. Try again.';
  const name = e && typeof e === 'object' && 'name' in e ? String((e as { name: unknown }).name) : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Camera access was refused. Allow the camera for this site and try again.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No camera was found on this device.';
  if (name === 'NotReadableError' || name === 'AbortError') return 'The camera is in use by another app, or could not start.';
  if (name === 'TypeError') return 'This page cannot reach the camera (it needs https).';
  return `The camera could not start (${e instanceof Error ? e.message : String(e)}).`;
}

export class PoseService {
  private _status: PoseStatus = IDLE;
  private readonly frameCbs = new Set<(f: PoseFrame) => void>();
  private readonly statusCbs = new Set<(s: PoseStatus) => void>();

  /** Bumped by every stop, failure and feed take-over, so an async start step that finishes late knows it is stale. */
  private session = 0;
  private starting: Promise<boolean> | null = null;
  private stream: MediaStream | null = null;
  private _video: HTMLVideoElement | null = null;
  private detector: PoseDetector | null = null;
  private stopFrames: (() => void) | null = null;
  private budget: DetectBudget | null = null;
  private lastRaw: AdapterFrame | null = null;
  private lastDetectT = -Infinity;
  private _latest: PoseFrame | null = null;

  private clock: PoseStats['clock'] = null;
  private readonly times: number[] = [];
  private readonly costs: number[] = [];
  private readonly lags: number[] = [];
  private count = 0;

  private feed: { schedule: FeedSchedule; resolve: (n: number) => void; timer: unknown } | null = null;
  /** The self-views showing the <video>, oldest first: the last one has it (showIn). */
  private hosts: { el: HTMLElement; video: HTMLVideoElement }[] = [];
  private fed = 0;

  constructor(private readonly deps: PoseDeps) {}

  // ── reading ──

  get status(): PoseStatus { return this._status; }
  get state(): PoseServiceState { return this._status.state; }
  get why(): string | null { return this._status.why; }
  get model(): PoseModel | null { return this._status.model; }
  get video(): HTMLVideoElement | null { return this._video; }
  get latest(): PoseFrame | null { return this._latest; }

  get stats(): PoseStats {
    return {
      fps: this.times.length, detectMs: median(this.costs), latencyMs: median(this.lags), clock: this.clock, frames: this.count,
    };
  }

  /** Every frame, as it comes. Returns the unsubscribe. */
  onFrame(cb: (f: PoseFrame) => void): () => void {
    this.frameCbs.add(cb);
    return () => { this.frameCbs.delete(cb); };
  }

  /** Every status change (a new object each time, so it works as a React external store). Returns the unsubscribe. */
  onStatus(cb: (s: PoseStatus) => void): () => void {
    this.statusCbs.add(cb);
    return () => { this.statusCbs.delete(cb); };
  }

  /**
   * Show the camera picture inside `el` (a self-view: size it, and flip it with CSS to mirror). Returns the undo. The
   * hosts stack: the last one shown has the picture, and an undo takes only its own place — the picture goes back to
   * the host under it, or is parked out of sight when none is left. Call again after a restart: every start makes a new
   * <video>, and an undo from before it does nothing.
   */
  showIn(el: HTMLElement): () => void {
    const v = this._video;
    if (!v) return () => {};
    const entry = { el, video: v };
    this.hosts.push(entry);
    placeVideo(v, el);
    return () => {
      const i = this.hosts.indexOf(entry);
      if (i < 0) return;                         // undone already, or the camera stopped since
      const top = i === this.hosts.length - 1;
      this.hosts.splice(i, 1);
      if (!top || this._video !== v) return;     // another host has it; or a restart made a new <video>
      const under = this.hosts[this.hosts.length - 1];
      if (under) placeVideo(v, under.el);
      else if (this.deps.parkVideo) this.deps.parkVideo(v);
      else parkVideo(v);
    };
  }

  // ── the camera ──

  /** Ask for the camera, pick and load the model, and start delivering frames. False (with state 'error') if it cannot. */
  start(opts: PoseStartOptions = {}): Promise<boolean> {
    if (this._status.source === 'feed' || this._status.state === 'live') return Promise.resolve(true);
    if (this.starting) return this.starting;
    const run = this.open(++this.session, opts);
    this.starting = run;
    void run.finally(() => { if (this.starting === run) this.starting = null; });
    return run;
  }

  /** Camera off, landmarker freed, the feed ended. A start() still pending resolves false and frees what it gets late. */
  stop(): void {
    this.session++;
    this.starting = null;
    this.cancelFeed();
    this.teardown();
    this.setStatus(IDLE);
  }

  private async open(id: number, opts: PoseStartOptions): Promise<boolean> {
    // Everything an await hands back after stop() is freed right here, by this run: stop() can only free what was
    // already assigned. That is the whole fix for the camera light staying on after a stop during the prompt.
    const stale = () => id !== this.session;
    const env = this.deps.env();
    const device = deviceClass(env);
    let stage: Stage = 'camera';
    try {
      this.setStatus({ ...IDLE, state: 'requesting', source: 'camera' });
      let stream = await this.deps.getUserMedia({ video: cameraConstraints(device, env.portrait, opts.facingMode), audio: false });
      if (stale()) { stopTracks(stream); return false; }
      // CONTEXT (2026-09-24): a desktop webcam can answer 1280×720 with a 10-15 fps mode (modelChoice.cameraTooSlow has
      // the why). Asked again for VGA at 30 before anything is built on the first answer, so the stored stream, the
      // 'ended' listener, the <video> and the status all follow the camera that is kept. A fresh request, not
      // track.applyConstraints: Chrome reselects a device's mode on applyConstraints only in some cases, and always on
      // a new request. The first stream stops first, or the second would share its open mode. Asked once: whatever the
      // second answer is, it stays.
      if (cameraTooSlow(device, stream.getVideoTracks()[0]?.getSettings?.().frameRate)) {
        stopTracks(stream);
        stream = await this.deps.getUserMedia({ video: cameraFallbackConstraints(opts.facingMode), audio: false });
        if (stale()) { stopTracks(stream); return false; }
      }
      this.stream = stream;
      const track = stream.getVideoTracks()[0];
      track?.addEventListener?.('ended', () => {
        if (this.stream === stream) this.fail('The camera stopped: unplugged, or taken by another app.');
      });

      stage = 'video';
      // The service owns the <video> BEFORE play() settles, so a stop() in this gap releases it (and that release
      // rejects the pending play). Owned only after, a play() that never settles on a stopped stream would leave the
      // element parked in the page and this start pending for good.
      const video = this.deps.makeVideo(stream);
      this._video = video;
      await this.deps.playVideo(video);
      if (stale()) return false;   // stop() already released it
      // A phone turned mid-session changes the picture's shape; the space check reads it from here.
      video.addEventListener?.('resize', () => {
        if (this._video === video) this.setStatus({ ...this._status, camera: readCamera(track, video) });
      });

      stage = 'model';
      const choice = initialModel(device, {
        asked: opts.model ?? askedModel(env.search),
        remembered: parseRemembered(this.deps.storage.get(MODEL_MEMORY_KEY), Date.now()),
      });
      this.setStatus({ ...this._status, state: 'loading', camera: readCamera(track, video), model: choice.model, modelWhy: choice.why });
      let model = choice.model, why = choice.why;
      let detector: PoseDetector;
      try {
        detector = await this.deps.loadDetector(model);
      } catch (e) {
        if (model !== 'full' || stale()) throw e;
        // Full would not load (a bad copy, not enough memory): lite is still a working camera.
        this.deps.warn('[FEL-POSE] the full model did not load; using lite', e);
        model = 'lite'; why = 'full did not load: lite';
        detector = await this.deps.loadDetector(model);
      }
      if (stale()) { detector.dispose(); return false; }
      this.detector = detector;
      this.budget = choice.measure && model === 'full' ? new DetectBudget() : null;
      this.stopFrames = this.deps.onVideoFrames(video, this.onTick);
      this.setStatus({ ...this._status, state: 'live', model, modelWhy: why });
      return true;
    } catch (e) {
      if (stale()) return false;
      this.session++;
      this.teardown();
      this.setStatus({ ...IDLE, state: 'error', why: explain(e, stage) });
      return false;
    }
  }

  /** One camera frame: detect, time it, deliver it. */
  private onTick = (tick: VideoFrameTick): void => {
    const v = this._video, d = this.detector;
    if (!v || !d) return;
    // A camera faster than 30 fps is thinned to 30, so the detect budget holds (MIN_DETECT_GAP_MS).
    const gap = tick.timestampMs - this.lastDetectT;
    if (gap >= 0 && gap < MIN_DETECT_GAP_MS) return;
    const before = this.deps.now();
    const raw = d.detect(v, tick.timestampMs, { frameId: tick.frameId });
    // No detect ran for this frame: the same video frame again, a detect that failed, or a picture not decoded yet (the
    // adapter then hands back its placeholder, stamped 0, which is not a frame without a body and must not read as one).
    // A frame the model did read carries this tick's time.
    if (raw === this.lastRaw || raw.timestampMs !== tick.timestampMs) return;
    const after = this.deps.now();
    this.lastRaw = raw;
    this.lastDetectT = tick.timestampMs;
    this.clock = tick.clock;
    const frame = toPoseFrame(raw, tick.timestampMs, after);
    this.note(frame, after - before);
    if (this.budget) this.judgeBudget(after - before, frame.present);
    this.deliver(frame);
  };

  private judgeBudget(ms: number, body: boolean): void {
    const b = this.budget!;
    const verdict = b.add(ms, body);
    if (verdict === 'measuring') return;
    this.budget = null;
    const med = b.medianMs ?? ms;
    if (verdict === 'keep') {
      this.setStatus({ ...this._status, modelWhy: `desktop: full, ${med.toFixed(1)} ms a frame (budget ${FULL_BUDGET_MS.toFixed(1)} ms)` });
      return;
    }
    void this.fallBackToLite(med);
  }

  /** Full is over budget: load lite beside it (full keeps detecting meanwhile, so no frame is lost), then swap. */
  private async fallBackToLite(ms: number): Promise<void> {
    const id = this.session;
    this.deps.storage.set(MODEL_MEMORY_KEY, rememberFallback(ms, Date.now()));
    let lite: PoseDetector;
    try {
      lite = await this.deps.loadDetector('lite');
    } catch (e) {
      this.deps.warn('[FEL-POSE] lite did not load; staying on full', e);   // slow beats nothing
      return;
    }
    if (id !== this.session) { lite.dispose(); return; }
    const full = this.detector;
    this.detector = lite;
    this.lastRaw = null;
    this.costs.length = 0;   // the stats show lite's cost from here
    full?.dispose();
    this.setStatus({
      ...this._status, model: 'lite', modelWhy: `full ran ${ms.toFixed(1)} ms a frame (budget ${FULL_BUDGET_MS.toFixed(1)} ms): lite`,
    });
  }

  private fail(why: string): void {
    this.session++;
    this.starting = null;
    this.cancelFeed();
    this.teardown();
    this.setStatus({ ...IDLE, state: 'error', why });
  }

  private teardown(): void {
    this.hosts = [];   // the <video> is released below: no self-view shows it any more, and their undos do nothing
    this.stopFrames?.(); this.stopFrames = null;
    this.detector?.dispose(); this.detector = null;
    if (this.stream) { stopTracks(this.stream); this.stream = null; }
    if (this._video) { this.deps.releaseVideo(this._video); this._video = null; }
    this.budget = null;
    this.lastRaw = null;
    this.lastDetectT = -Infinity;
    this._latest = null;
    this.clock = null;
    this.times.length = 0; this.costs.length = 0; this.lags.length = 0;
    this.count = 0; this.fed = 0;
  }

  private note(f: PoseFrame, cost: number | null): void {
    this.count++;
    this.times.push(f.t);
    while (this.times.length && this.times[0] <= f.t - STATS_WINDOW_MS) this.times.shift();
    if (cost != null) { this.costs.push(cost); if (this.costs.length > STATS_FRAMES) this.costs.shift(); }
    if (f.arrive != null) { this.lags.push(f.arrive - f.t); if (this.lags.length > STATS_FRAMES) this.lags.shift(); }
  }

  private deliver(f: PoseFrame): void {
    this._latest = f;
    for (const cb of [...this.frameCbs]) {
      try { cb(f); } catch (e) { this.deps.warn('[FEL-POSE] a frame listener threw', e); }
    }
  }

  private setStatus(s: PoseStatus): void {
    this._status = s;
    for (const cb of [...this.statusCbs]) {
      try { cb(s); } catch (e) { this.deps.warn('[FEL-POSE] a status listener threw', e); }
    }
  }

  // ── the dev / QA feed (lib/pose/feed.ts) ──

  /** Frames delivered by the feed since it began. */
  get fedCount(): number { return this.fed; }
  get feedPlaying(): boolean { return this.feed != null; }

  /**
   * The feed takes the camera's place: the camera stops, and start() resolves at once. Straight from the camera's
   * status to the feed's, with no 'idle' between, so a reader that is running stays running.
   */
  beginFeed(): void {
    if (this._status.source === 'feed') return;
    this.session++;
    this.starting = null;
    this.teardown();
    this.setStatus({ ...IDLE, state: 'live', source: 'feed', modelWhy: 'fed frames: no camera, no model' });
  }

  /** One frame now, exactly as given (arrive filled in when missing). */
  pushFeed(f: PoseFrame): void {
    this.beginFeed();
    this.deliverFed(f.arrive === undefined ? { ...f, arrive: this.deps.now() } : f);
  }

  /** Frames on their own timing (FeedSchedule). Resolves with the count delivered, when done or cancelled. */
  playFeed(frames: PoseFrame[], opts: FeedPlayOptions = {}): Promise<number> {
    this.beginFeed();
    this.cancelFeed();
    const schedule = new FeedSchedule(frames, this.deps.now(), opts);
    const retime = opts.retime ?? true;
    return new Promise<number>((resolve) => {
      const run = { schedule, resolve, timer: null as unknown };
      this.feed = run;
      const pump = () => {
        if (this.feed !== run) return;
        const now = this.deps.now();
        for (const f of schedule.due(now)) {
          this.deliverFed(retime ? { ...f, arrive: now } : f);   // arrive = the real delivery: a timer can fire late
          if (this.feed !== run) return;   // a listener ended the feed
        }
        const next = schedule.nextAt();
        if (next == null) { this.feed = null; resolve(schedule.delivered); return; }
        run.timer = this.deps.setTimer(pump, Math.max(0, next - now));
      };
      pump();
    });
  }

  /** Stop a playback (it resolves with what it delivered); the feed stays the source. */
  cancelFeed(): void {
    const run = this.feed;
    if (!run) return;
    this.feed = null;
    this.deps.clearTimer(run.timer);
    run.resolve(run.schedule.delivered);
  }

  /** Stop feeding: idle, and the next start() opens the camera. */
  endFeed(): void {
    if (this._status.source === 'feed') this.stop();
  }

  private deliverFed(f: PoseFrame): void {
    this.clock = 'feed';
    this.fed++;
    this.note(f, null);
    this.deliver(f);
  }
}

// ── the browser ─────────────────────────────────────────────────────────────────────────────────────────────────

/** Where the <video> waits when no self-view shows it: in the page (for requestVideoFrameCallback), but invisible. */
const PARK_STYLE = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;z-index:-1';
/** In a self-view: the host's box, covered (the host sizes itself to the picture's shape, so nothing is cropped). */
const SHOW_STYLE = 'display:block;width:100%;height:100%;object-fit:cover';

function placeVideo(v: HTMLVideoElement, el: HTMLElement): void {
  v.style.cssText = SHOW_STYLE;
  el.appendChild(v);
}
function parkVideo(v: HTMLVideoElement): void {
  v.style.cssText = PARK_STYLE;
  document.body.appendChild(v);
}

function browserDeps(): PoseDeps {
  return {
    getUserMedia: (c) => navigator.mediaDevices?.getUserMedia
      ? navigator.mediaDevices.getUserMedia(c)
      : Promise.reject(new TypeError('navigator.mediaDevices is missing')),   // plain http, or an old browser
    makeVideo(stream) {
      const v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.autoplay = true;
      v.setAttribute('playsinline', '');   // older iOS reads the attribute, not the property
      v.setAttribute('aria-hidden', 'true');
      v.style.cssText = PARK_STYLE;
      document.body.appendChild(v);
      v.srcObject = stream;
      return v;
    },
    playVideo: (v) => v.play(),
    releaseVideo(v) {
      try { v.pause(); } catch { /* not playing */ }
      v.srcObject = null;
      v.remove();
    },
    async loadDetector(model) {
      const a = new MediaPipePoseAdapter({ numPoses: 1, world: true, model });
      try {
        await a.init();
      } catch (e) {
        a.dispose();
        throw e;
      }
      return a;
    },
    onVideoFrames,
    now: () => performance.now(),
    env: () => ({
      userAgent: navigator.userAgent,
      maxTouchPoints: navigator.maxTouchPoints,
      uaMobile: (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData?.mobile,
      portrait: typeof matchMedia === 'function' && matchMedia('(orientation: portrait)').matches,
      search: location.search,
    }),
    storage: {
      get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
      set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* no storage: full is measured again next time */ } },
    },
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    warn: (m, e) => console.warn(m, e),
  };
}

let instance: PoseService | null = null;

/** The page's one PoseService. */
export function poseService(): PoseService {
  return (instance ??= new PoseService(browserDeps()));
}

/** window.__FEL_POSE_FEED__, bound to a service getter (the page's singleton, or a test's). */
export function makeFeedHandle(get: () => PoseService): PoseFeed {
  return {
    begin: () => get().beginFeed(),
    push: (f) => get().pushFeed(f),
    play: (frames, o) => get().playFeed(frames, o),
    cancel: () => get().cancelFeed(),
    end: () => get().endFeed(),
    status: () => {
      const s = get();
      return { ...s.status, stats: s.stats, delivered: s.fedCount, playing: s.feedPlaying };
    },
  };
}

// Installed when this module loads (any page with body control), so a probe finds it before anything opens the camera.
if (typeof window !== 'undefined' && feedHookAllowed(process.env.NODE_ENV, agentEnabled(), window.location.hostname)) {
  window.__FEL_POSE_FEED__ = makeFeedHandle(poseService);
}
