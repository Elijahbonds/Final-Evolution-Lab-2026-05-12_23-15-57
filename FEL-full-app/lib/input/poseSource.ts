'use client';

// poseSource — the camera half of body play: PoseService's frames, read into the body channel every running mode hears.
//
// MOVEMENT PLAY P3 (2026-09-24): THE SWITCH-OVER. Until now this pumped the P1 mapper (poseControl) into InputBus on a
// requestAnimationFrame loop, the same buttons for every game — a hip rise was A everywhere, and standing still held the
// stick at full back (BASELINE.md). It only READS now. Each camera frame goes through BodyReader (the jumps, steps and
// strikes, the lean and the crouch, on the capture clock) and ChannelReader (the facts that need history: in a jump, the
// stride, both hands held up), and is published whole, one BodyPacket per frame, to every running bus
// (publishBodyToLive). What a body PRESSES is each mode's business: the harness runs the mode's row in
// lib/input/bodyProfiles through the floor, starts and pauses the game on the body (BodySession), and a mode that owns
// its body play later reads the packet itself (ctx.body, onBody).
//
// Driven by the frames themselves (PoseService.onFrame), not a render loop: a packet per camera frame, stamped with the
// frame's arrival. Whenever the source stops being this body — switched off, re-centred, the camera refused or gone — a
// FINAL packet goes out: every running mode lets go of whatever the body held, and nothing pauses.
//
// MOVEMENT PLAY P4 (2026-09-25): THE SPACE CHECK GATES THE SOURCE. The reader used to calibrate itself on any still
// stand, so a player standing still beside the laptop took the rulers there (the map's "calibration is not a space
// check, and a bad calibration starts the game"). It no longer calibrates itself: its rulers come only from the space
// check (lib/move/bodyPlay → setCalibration), and until then every read is uncalibrated — the floor presses nothing and
// the hands-up START cannot fire (the session wakes a calibrated body only), so nothing reaches a game before the check
// passes. start({ autoCalibrate: true }) keeps the old self-calibrating reader for the dev probe (__FEL_BODY__) and
// tests alone; no player path passes it (poseSource.test scans for it).
//
// It stays code-split where it matters: PoseService imports the adapter, and the adapter imports the MediaPipe package
// (and the wasm and model download) only when a camera actually starts.

import { publishBodyToLive, type BodyPacket } from '../babylon/core/InputBus';
import { agentEnabled } from '../babylon/core/AgentBridge';
import { BodyReader, type BodyRead } from '../pose/BodyReader';
import type { Calibration } from '../pose/calibrate';
import { ChannelReader, type BodyChannels } from '../pose/bodyChannels';
import { feedHookAllowed } from '../pose/feed';
import { poseService, type PoseService, type PoseStatus } from '../pose/PoseService';
import type { PoseFrame } from '../pose/landmarks';

export type PoseSourceState = 'idle' | 'requesting' | 'loading' | 'calibrating' | 'live' | 'error';

export interface PoseSourceEvents {
  onState?: (s: PoseSourceState, detail?: string) => void;
  /** Whether a usable body is in shot right now — the one thing the player needs to see. */
  onBody?: (present: boolean) => void;
}

/** What a Body button shows. A new object on every change, so it works as a React external store. */
export interface PoseSourceSnapshot { state: PoseSourceState; detail: string; body: boolean }

/** The part of PoseService this uses; tests pass a stand-in. */
export type PoseServiceLike = Pick<PoseService, 'start' | 'stop' | 'onStatus' | 'onFrame' | 'status'>;
/** Where the packets go: every running bus (publishBodyToLive), or a test's sink. */
export type BodyPublish = (p: BodyPacket) => void;

/** The channels of a body that is not there: the final packet's (nothing held, no jump, no stride). */
const NO_CHANNELS: BodyChannels = Object.freeze({ inJump: false, stride: null, handsUpMs: 0, handsDownMs: 0 });

/** A read with nobody in it (present: false, every field null), as the final packet carries. */
function absentRead(t: number): BodyRead {
  return {
    t, present: false, conf: null, calibrated: false, tracking: false, rulers: null, hip: null, feet: null,
    airborne: null, knee: null, wrist: null, elbowDeg: null, lean: null, squat: null, yaw: null,
  };
}

/** How the source reads: the check-gated reader (the default), or one that calibrates itself (the dev probe, tests). */
export interface PoseSourceStartOptions { autoCalibrate?: boolean }

export class PoseSource {
  private active = false;
  private reader = new BodyReader({ autoCalibrate: false });
  private readonly channels = new ChannelReader();
  /** A packet has gone out since the last final one: a stop or a re-centre must tell the running mode to let go. */
  private published = false;
  /** The capture time of the last frame read (the final packet's read carries it). */
  private lastT = -Infinity;
  private offStatus: (() => void) | null = null;
  private offFrame: (() => void) | null = null;
  private source: PoseStatus['source'] = null;
  private snap: PoseSourceSnapshot = { state: 'idle', detail: '', body: false };
  private readonly listeners = new Set<(s: PoseSourceSnapshot) => void>();
  private readonly service: PoseServiceLike;

  constructor(
    private readonly events: PoseSourceEvents = {},
    service?: PoseServiceLike,
    private readonly publish: BodyPublish = publishBodyToLive,
  ) {
    this.service = service ?? poseService();
  }

  get snapshot(): PoseSourceSnapshot { return this.snap; }
  get state(): PoseSourceState { return this.snap.state; }
  /** The rulers the reader reads with now (the space check's), or null until it has them. */
  get calibration(): Calibration | null { return this.reader.calibration; }

  /** Every change of state or body, for as many views as want it (GameShell shows two Body buttons). */
  listen = (fn: (s: PoseSourceSnapshot) => void): (() => void) => {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  };

  /**
   * Start the camera (PoseService) and read every frame it gives into the body channel. The reader waits for the space
   * check's rulers (setCalibration) unless `autoCalibrate` (the dev probe, tests): a fresh one each start.
   */
  async start(opts: PoseSourceStartOptions = {}): Promise<boolean> {
    if (this.active) return true;
    this.active = true;
    this.reader = new BodyReader({ autoCalibrate: opts.autoCalibrate ?? false });
    this.offStatus = this.service.onStatus(this.onStatus);
    this.offFrame = this.service.onFrame(this.onFrame);
    const ok = await this.service.start();
    if (!this.active) return false;   // switched off while it was starting
    // The feed can take over a start still in flight; that start says false, but frames are coming.
    this.onStatus(this.service.status);
    return ok || this.service.status.state === 'live';
  }

  /**
   * The space check passed: read with its rulers from the next frame (the stand's floor line, hip height, metre rulers
   * and lens pitch). The channels start clean, so a hold counted before is not carried into the calibrated body.
   */
  setCalibration(cal: Calibration): void {
    this.reader.setCalibration(cal);
    this.channels.reset();
    if (this.active && this.service.status.state === 'live') this.update({ state: 'live' });
  }

  /** Retake the stand — people move, and they move the phone. The running mode lets go first (a final packet). */
  recalibrate(): void {
    this.reader.recalibrate();
    this.channels.reset();
    this.final();
    if (this.active && this.service.status.state === 'live') this.update({ state: 'calibrating' });
  }

  /** Camera off, and every running mode told the body is gone (it lets go; nothing pauses). */
  stop(): void {
    const was = this.active;
    this.detach();
    // Only the one who started the camera stops it: an unmount that never switched body on leaves a dev feed alone.
    if (was) this.service.stop();
    this.update({ state: 'idle', detail: '', body: false });
  }

  private onStatus = (s: PoseStatus): void => {
    if (!this.active) return;
    // The dev feed took the camera's place (or the other way round): a different body, so a new stand.
    if (this.source && s.source && s.source !== this.source) this.recalibrate();
    this.source = s.source ?? this.source;
    switch (s.state) {
      case 'requesting':
      case 'loading':
        this.update({ state: s.state, detail: '' });
        break;
      case 'live':
        this.update({ state: this.reader.calibration ? 'live' : 'calibrating', detail: '' });
        break;
      case 'error':
        // A refused camera is an ordinary answer, not a crash: the player keeps their controller and is told why.
        this.detach();
        this.update({ state: 'error', detail: s.why ?? 'The camera could not be started.', body: false });
        break;
      case 'idle':
        // Stopped under us (the dev feed ended): nothing more is coming.
        this.detach();
        this.update({ state: 'idle', detail: '', body: false });
        break;
    }
  };

  /** One camera frame: read it, and hand the running mode the packet. */
  private onFrame = (f: PoseFrame): void => {
    if (!this.active) return;
    const { read, events } = this.reader.read(f);
    const channels = this.channels.step(read, events);
    this.lastT = read.t;
    this.published = true;
    try {
      this.publish({ read, events, channels, arrivedAt: f.arrive ?? performance.now() });
    } finally {
      // the Body button shows this frame whatever a listener did with it (the step-3 review: the bus reports a
      // throwing listener itself, and a publisher that throws anyway must not freeze the button on the last frame)
      const live = this.service.status.state === 'live';
      this.update(live ? { body: read.tracking, state: read.calibrated ? 'live' : 'calibrating' } : { body: read.tracking });
    }
  };

  /** The body is gone on purpose (off, re-centred, the camera gone): one final packet, if any went out since the last. */
  private final(): void {
    if (!this.published) return;
    this.published = false;
    const now = performance.now();
    // reported, not thrown (the step-3 review): this runs inside stop() and recalibrate(), and a publisher's throw must
    // not leave the camera on, or the reader holding the old body, behind a Body button that says off
    try {
      this.publish({ read: absentRead(Number.isFinite(this.lastT) ? this.lastT : now), events: [], channels: NO_CHANNELS, arrivedAt: now, final: true });
    } catch (err) {
      console.error('[FEL-BODY] the final packet\'s publisher threw:', err);
    }
  }

  /** Stop reading (listeners, the reader's history) and let go, without touching the service or the state shown. */
  private detach(): void {
    this.active = false;
    this.offStatus?.(); this.offStatus = null;
    this.offFrame?.(); this.offFrame = null;
    this.final();
    this.reader.reset();
    this.channels.reset();
    this.lastT = -Infinity;
    this.source = null;
  }

  private update(p: Partial<PoseSourceSnapshot>): void {
    const prev = this.snap;
    const next = { ...prev, ...p };
    const stateChanged = next.state !== prev.state || next.detail !== prev.detail;
    const bodyChanged = next.body !== prev.body;
    if (!stateChanged && !bodyChanged) return;
    this.snap = next;
    if (stateChanged) this.events.onState?.(next.state, next.detail || undefined);
    if (bodyChanged) this.events.onBody?.(next.body);
    for (const fn of [...this.listeners]) fn(next);
  }
}

// ── one source per page ─────────────────────────────────────────────────────────────────────────────────────────

let shared: PoseSource | null = null;
let holds = 0;

/**
 * The page's one body source. GameShell mounts BodyControl twice (the header, and the compact button in full-bleed,
 * with the header only hidden by CSS), and before this each mount had its own camera and model: switching on in both
 * ran two cameras and doubled every frame. Both now drive, and show, this one. It needs no bus: it publishes to
 * whichever modes are running.
 */
export function sharedPoseSource(service?: PoseServiceLike): PoseSource {
  return (shared ??= new PoseSource({}, service));
}

/** The page's source if one has been made, without making one. */
export function peekSharedPoseSource(): PoseSource | null {
  return shared;
}

/** A mounted Body button holds the shared source. When the last one lets go (the shell unmounts), it is stopped. */
export function holdSharedPoseSource(): () => void {
  holds++;
  let held = true;
  return () => {
    if (!held) return;
    held = false;
    if (--holds === 0) shared?.stop();
  };
}

// ── the probe's Body button ─────────────────────────────────────────────────────────────────────────────────────

/**
 * window.__FEL_BODY__: the Body button without a click, for a probe that drives a mode with __FEL_POSE_FEED__ frames
 * (scripts/probes/_body-seam-live.mts). The same gate as the feed (lib/pose/feed.ts): development, or a production
 * build on this machine with ?agent=1 — never the deployed site, where scripted frames would make body play nobody did.
 */
export interface BodyHook {
  /** The probe's Body button. MOVEMENT PLAY P4: `{ autoCalibrate: true }` keeps P3's self-calibrating reader for the
   *  seam probe; without it the source waits for the space check, as the player's does. */
  start(opts?: PoseSourceStartOptions): Promise<boolean>;
  stop(): void;
  snapshot(): PoseSourceSnapshot;
}

declare global {
  interface Window { __FEL_BODY__?: BodyHook }
}

if (typeof window !== 'undefined' && feedHookAllowed(process.env.NODE_ENV, agentEnabled(), window.location.hostname)) {
  window.__FEL_BODY__ = {
    start: (opts?: PoseSourceStartOptions) => sharedPoseSource().start(opts),
    stop: () => sharedPoseSource().stop(),
    snapshot: () => sharedPoseSource().snapshot,
  };
}
