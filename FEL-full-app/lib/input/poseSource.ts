'use client';

// poseSource — the camera half of body control: it reads PoseService's frames and pumps the mapper's events into
// InputBus. Nothing here decides what a gesture means; that is poseControl, which is pure and tested.
//
// Movement play, phase 2 (2026-09-24): the camera, the model and their lifetimes moved into PoseService
// (lib/pose/PoseService.ts): one camera per page, the landmarker freed on stop, and a stop during the permission
// prompt no longer leaves the camera on. What poseControl is fed, and when, is deliberately UNCHANGED until phase 3
// replaces the mapping: a requestAnimationFrame loop reads the newest frame to have arrived, CALIBRATION_FRAMES good
// ticks take the neutral from the last of them, and read() runs on every tick. That is exactly what lib/pose/baseline.ts
// replays, so the baseline still measures what ships. Two things did change, both only ever releasing input: a
// re-centre, and a switch to the dev feed, now let go of whatever the old neutral was holding down. The picture's
// shape is kept too: a desktop is now asked for 16:9, and the mapper is handed it as the 4:3 it was tuned on
// (MAPPER_ASPECT).
//
// It stays code-split where it matters: PoseService imports the adapter, and the adapter imports the MediaPipe package
// (and the wasm and model download) only when a camera actually starts.

import type { FelInput } from '../babylon/core/InputBus';
import { PoseController, calibrateFrom, type PoseInput } from './poseControl';
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

/**
 * Good rAF ticks of a standing pose before calibration is taken, so a blurred first frame cannot set the neutral.
 * Unchanged (about 6 camera frames at 60 Hz): lib/pose/baseline.ts replays this number.
 */
const CALIBRATION_FRAMES = 12;

/**
 * The picture shape poseControl was tuned and baselined on: the 640×480 the camera used to be asked for (and the phase 1
 * fixtures' virtual webcam). Its squat, jump and hand-raise read a height (image y) in shoulder widths (image x), so the
 * shape sits inside each of them: on the 1280×720 PoseService now asks a desktop for, the same jump reads
 * (16/9)/(4/3) = 1.33× higher and fires on three quarters of the movement. Until phase 3 replaces the mapper, a picture
 * wider than this is handed over as the 4:3 centre crop the old request got (Chrome's crop-and-scale cut a wide
 * webcam's sides to fit 640×480): x stretched about the middle, y untouched. Portrait and 4:3 pictures, which phones
 * gave before and give now, and the feed (no camera) pass through as they are.
 */
const MAPPER_ASPECT = 640 / 480;

/** How far to stretch x so a wider-than-4:3 picture reads as its 4:3 centre crop; 1 = as it is. */
export function mapperStretch(camera: PoseStatus['camera']): number {
  if (!camera || !(camera.width > 0) || !(camera.height > 0)) return 1;
  return Math.max(1, camera.width / camera.height / MAPPER_ASPECT);
}

/** The part of PoseService this uses; tests pass a stand-in. */
export type PoseServiceLike = Pick<PoseService, 'start' | 'stop' | 'onStatus' | 'status' | 'latest'>;
export interface PoseBus { emit(e: FelInput): void }

export class PoseSource {
  private controller: PoseController | null = null;
  private raf = 0;
  private active = false;
  private goodFrames = 0;
  private hadBody = false;
  private lastFrame: PoseFrame | null = null;
  private lastInput: PoseInput | null = null;
  private offStatus: (() => void) | null = null;
  private source: PoseStatus['source'] = null;
  private snap: PoseSourceSnapshot = { state: 'idle', detail: '', body: false };
  private readonly listeners = new Set<(s: PoseSourceSnapshot) => void>();
  private readonly service: PoseServiceLike;

  constructor(private readonly bus: PoseBus, private readonly events: PoseSourceEvents = {}, service?: PoseServiceLike) {
    this.service = service ?? poseService();
  }

  get snapshot(): PoseSourceSnapshot { return this.snap; }
  get state(): PoseSourceState { return this.snap.state; }

  /** Every change of state or body, for as many views as want it (GameShell shows two Body buttons). */
  listen = (fn: (s: PoseSourceSnapshot) => void): (() => void) => {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  };

  /** Start the camera (PoseService), take a calibration, then feed the bus. */
  async start(): Promise<boolean> {
    if (this.active) return true;
    this.active = true;
    this.offStatus = this.service.onStatus(this.onStatus);
    this.loop();
    const ok = await this.service.start();
    if (!this.active) return false;   // switched off while it was starting
    // The feed can take over a start still in flight; that start says false, but frames are coming.
    this.onStatus(this.service.status);
    return ok || this.service.status.state === 'live';
  }

  /** Retake the neutral pose — people move, and they move the phone. */
  recalibrate(): void {
    this.release();
    this.goodFrames = 0;
    if (this.active && this.service.status.state === 'live') this.update({ state: 'calibrating' });
  }

  /** Hands off, camera off, nothing left held down. */
  stop(): void {
    const was = this.active;
    this.detach();
    // Only the one who started the camera stops it: an unmount that never switched body on leaves a dev feed alone.
    if (was) this.service.stop();
    this.update({ state: 'idle', detail: '', body: false });
  }

  private onStatus = (s: PoseStatus): void => {
    if (!this.active) return;
    // The dev feed took the camera's place (or the other way round): a different body, so a new neutral.
    if (this.source && s.source && s.source !== this.source) this.recalibrate();
    this.source = s.source ?? this.source;
    switch (s.state) {
      case 'requesting':
      case 'loading':
        this.update({ state: s.state, detail: '' });
        break;
      case 'live':
        this.update({ state: this.controller ? 'live' : 'calibrating', detail: '' });
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

  private loop = (): void => {
    if (!this.active) return;
    this.raf = requestAnimationFrame(this.loop);

    const frame = this.service.latest;
    if (!frame) return;
    const input = this.toInput(frame);
    const present = frame.present && input.landmarks.length > 0;
    if (present !== this.hadBody) { this.hadBody = present; this.update({ body: present }); }

    if (!this.controller) {
      // Calibrating: wait for a run of good frames so a blur or a half-detected body cannot become the neutral.
      const cal = present ? calibrateFrom(input) : null;
      if (!cal) { this.goodFrames = 0; return; }
      if (++this.goodFrames < CALIBRATION_FRAMES) return;
      this.controller = new PoseController(cal);
      this.update({ state: 'live' });
      return;
    }

    for (const e of this.controller.read(input)) this.bus.emit(e);
  };

  /** The mapper's view of a frame: image landmarks as {x, y, visibility} in the 4:3 it was tuned on, built once per frame. */
  private toInput(f: PoseFrame): PoseInput {
    if (f !== this.lastFrame || !this.lastInput) {
      const k = mapperStretch(this.service.status.camera);
      this.lastFrame = f;
      this.lastInput = {
        present: f.present,
        landmarks: f.image.map((l) => ({ x: k === 1 ? l.x : 0.5 + (l.x - 0.5) * k, y: l.y, visibility: l.v })),
      };
    }
    return this.lastInput;
  }

  private release(): void {
    // THE RELEASE MATTERS MOST HERE. Switching body control off while leaning must not leave the stick pushed.
    if (this.controller) { for (const e of this.controller.release()) this.bus.emit(e); }
    this.controller = null;
  }

  /** Stop reading (loop, listener, held input) without touching the service or the state shown. */
  private detach(): void {
    this.active = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.release();
    this.offStatus?.();
    this.offStatus = null;
    this.source = null;
    this.hadBody = false;
    this.goodFrames = 0;
    this.lastFrame = null;
    this.lastInput = null;
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
 * The page's one body-control source. GameShell mounts BodyControl twice (the header, and the compact button in
 * full-bleed, with the header only hidden by CSS), and before this each mount had its own camera and model: switching
 * on in both ran two cameras and doubled every event. Both now drive, and show, this one.
 */
export function sharedPoseSource(bus: PoseBus, service?: PoseServiceLike): PoseSource {
  return (shared ??= new PoseSource(bus, {}, service));
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
