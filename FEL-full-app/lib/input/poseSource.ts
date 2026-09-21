'use client';

// poseSource — the camera half of body control: it owns a video element and a pose model, and pumps the mapper's
// events into InputBus. Nothing here decides what a gesture means; that is poseControl, which is pure and tested.
//
// It is code-split on purpose. The pose model is a WASM download and @mediapipe/tasks-vision is large, and a
// player who never turns body control on should never pay for either — so the import is dynamic and happens the
// first time somebody actually asks for it.

import type { InputBus } from '../babylon/core/InputBus';
import { PoseController, calibrateFrom, type Calibration } from './poseControl';

export type PoseSourceState = 'idle' | 'requesting' | 'loading' | 'calibrating' | 'live' | 'error';

export interface PoseSourceEvents {
  onState?: (s: PoseSourceState, detail?: string) => void;
  /** Whether a usable body is in shot right now — the one thing the player needs to see. */
  onBody?: (present: boolean) => void;
}

/** Frames of a good standing pose before calibration is taken, so a blurred first frame cannot set the neutral. */
const CALIBRATION_FRAMES = 12;

export class PoseSource {
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private adapter: { init(): Promise<void>; detect(v: HTMLVideoElement, t: number): { landmarks: { x: number; y: number; visibility: number }[]; timestampMs: number; present: boolean } } | null = null;
  private controller: PoseController | null = null;
  private raf = 0;
  private stopped = true;
  private goodFrames = 0;
  private hadBody = false;

  constructor(private readonly bus: InputBus, private readonly events: PoseSourceEvents = {}) {}

  private set(s: PoseSourceState, detail?: string) { this.events.onState?.(s, detail); }

  /** Ask for the camera, load the model, take a calibration, then start feeding the bus. */
  async start(): Promise<boolean> {
    this.stopped = false;
    this.goodFrames = 0;
    try {
      this.set('requesting');
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });

      const v = document.createElement('video');
      v.playsInline = true; v.muted = true; v.srcObject = this.stream;
      await v.play();
      this.video = v;

      this.set('loading');
      const { MediaPipePoseAdapter } = await import('@/lib/babylon/nexus/neuro-mirror/pose/mediapipe-adapter');
      const a = new MediaPipePoseAdapter({ numPoses: 1 });
      await a.init();
      this.adapter = a;

      this.set('calibrating');
      this.loop();
      return true;
    } catch (e) {
      // A refused camera is an ordinary answer, not a crash: the player keeps their controller and is told why.
      this.set('error', e instanceof Error ? e.message : 'The camera could not be started.');
      this.stop();
      return false;
    }
  }

  /** Retake the neutral pose — people move, and they move the phone. */
  recalibrate(): void {
    this.goodFrames = 0;
    this.controller = null;
    this.set('calibrating');
  }

  private loop = (): void => {
    if (this.stopped) return;
    this.raf = requestAnimationFrame(this.loop);

    const v = this.video, a = this.adapter;
    if (!v || !a) return;

    const frame = a.detect(v, performance.now());
    const present = frame.present && frame.landmarks.length > 0;
    if (present !== this.hadBody) { this.hadBody = present; this.events.onBody?.(present); }

    if (!this.controller) {
      // Calibrating: wait for a run of good frames so a blur or a half-detected body cannot become the neutral.
      const cal: Calibration | null = present ? calibrateFrom(frame) : null;
      if (!cal) { this.goodFrames = 0; return; }
      if (++this.goodFrames < CALIBRATION_FRAMES) return;
      this.controller = new PoseController(cal);
      this.set('live');
      return;
    }

    for (const e of this.controller.read(frame)) this.bus.emit(e);
  };

  /** Hands off, camera off, nothing left held down. */
  stop(): void {
    this.stopped = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;

    // THE RELEASE MATTERS MOST HERE. Switching body control off while leaning must not leave the stick pushed.
    if (this.controller) { for (const e of this.controller.release()) this.bus.emit(e); }
    this.controller = null;

    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.video) { this.video.srcObject = null; this.video = null; }
    this.adapter = null;
    this.hadBody = false;
    this.set('idle');
  }
}
