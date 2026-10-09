'use client';

// useMirrorCamera — the Mirror's camera, pose runtime and screen-awake life (MIRROR-FIRST P1, 2026-10-07; plan Phase 1,
// "a first session that survives a propped-up phone"). Pulled out of mirror-harness.tsx, which keeps everything that
// READS a frame (the graders, the coach, the screen runner); this file owns everything that PRODUCES one:
//
//   open(o)    a fresh session: getUserMedia → the <video> → the pose runtime (NeuroMirror, loaded on demand) → o.onFrame
//              once per camera frame. A second open, an End, a hide or an unmount while an earlier one is still awaiting
//              the camera or the model cancels it (the generation check): its stream is stopped and its runtime disposed,
//              so a slow model load can never leave the camera light on behind an idle page.
//   hide       owner decision 7 (2026-10-07): the camera is OFF whenever the tab is hidden — a phone call, an app switch,
//              the screen locking. The stream's tracks stop (the camera light goes off) and the runtime is disposed;
//              the session's books (reps, stages, the screen runner, the cue schedules) stay with the harness, and the
//              page says Paused. Body play's precedent (lib/move/bodyPlay.ts onPageHidden): a hidden tab never keeps the
//              camera, and back on the page a tap starts it again — a camera that switched itself on would surprise.
//   resume()   the same session again: a new stream and runtime, the counts carried (mergeSummaries, the rep offset) and
//              the pose clock stitched across the gap (PoseClock), so the graders see one continuous set.
//   wake lock  always on while the camera is on (owner decision 7): asked for when the camera starts, let go when it
//              stops, and asked for again when the page is visible again (lib/mirror/liveCamera.ts MirrorWakeLock).
//
// useFrameView is the other half of the frame budget: the harness writes its per-frame readouts into it and the page
// re-renders at most HUD_HZ times a second (lib/mirror/liveCamera.ts FrameView).
//
// Everything runs in the browser; nothing here sends anything.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
// CODE-SPLIT (2026-09-12, moved here from the harness). `NeuroMirror` reaches @babylonjs through
// render/overlay-compositor and rig/zone-binding, so importing it as a VALUE pulled the whole engine into /play/mirror's
// first-load bundle (2.03 MB against ~160 kB for every other /play route). Types only, from the source module; the
// engine loads on demand through loadMirror().
import type { MirrorMountOpts, MirrorRuntime, SessionSummary } from '@/lib/babylon/nexus/neuro-mirror/render/overlay-compositor';
import {
  FrameView, HUD_HZ, MirrorWakeLock, PoseClock, cameraErrorLine, mergeSummaries,
  type WakeLockApiLike, type WakeLockState,
} from '@/lib/mirror/liveCamera';

type MirrorModule = typeof import('@/lib/babylon/nexus/neuro-mirror');
/** Cached so a second session does not re-fetch the chunk. */
let mirrorModPromise: Promise<MirrorModule> | null = null;
const loadMirror = (): Promise<MirrorModule> =>
  (mirrorModPromise ??= import('@/lib/babylon/nexus/neuro-mirror'));

/** 'paused': the tab went to the background with the camera on, so the camera is off and the session waits for Resume. */
export type CameraStatus = 'idle' | 'requesting' | 'loading-model' | 'live' | 'paused' | 'error';
export type MirrorFrameInfo = Parameters<NonNullable<MirrorMountOpts['onFrame']>>[0];

export interface MirrorCameraOpen {
  analysis: MirrorMountOpts['analysis'];
  /** The <video> is playing (the frame's shape is known). Called again on every resume. */
  onVideo?: (v: HTMLVideoElement) => void;
  /** Once per camera frame, on the session's pose clock. Runs outside React: write refs and the frame view, not state. */
  onFrame: (info: MirrorFrameInfo, v: HTMLVideoElement) => void;
}

export interface MirrorCameraHooks {
  /** The camera has just gone off because the page was hidden (stop talking: nobody is there to hear it). */
  onPause?: () => void;
  /** Resume was pressed, before the camera comes back (reset what cannot span a gap, a jump in mid-air). */
  onResume?: () => void;
}

/** The camera states in which the camera light is (or is about to be) on. */
const CAMERA_ON: readonly CameraStatus[] = ['requesting', 'loading-model', 'live'];

export function useMirrorCamera(hooks: MirrorCameraHooks = {}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const runtimeRef = useRef<MirrorRuntime | null>(null);
  /** Bumped by every release: an open still awaiting the camera or the model checks it and stands down. */
  const genRef = useRef(0);
  const openRef = useRef<MirrorCameraOpen | null>(null);
  /** The summaries of the camera stretches before a pause (End reports the whole session). */
  const carriedRef = useRef<SessionSummary | null>(null);
  const clockRef = useRef(new PoseClock());
  const hooksRef = useRef(hooks);
  hooksRef.current = hooks;

  const [status, setStatusState] = useState<CameraStatus>('idle');
  const statusRef = useRef<CameraStatus>('idle');
  const setStatus = useCallback((s: CameraStatus) => { statusRef.current = s; setStatusState(s); }, []);
  const [error, setError] = useState('');
  const [wakeLock, setWakeLock] = useState<WakeLockState>('off');
  const wakeRef = useRef<MirrorWakeLock | null>(null);

  /** The camera off and the runtime gone; any open still in flight stands down. The session's books are untouched. */
  const release = useCallback(() => {
    genRef.current += 1;
    runtimeRef.current?.dispose();
    runtimeRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    const v = videoRef.current;
    if (v) { try { v.srcObject = null; } catch { /* a stand-in element */ } }
  }, []);

  /** What End and a finished screen do to the camera: off, and the session over (the caller sets the status). */
  const stop = useCallback(() => {
    release();
    carriedRef.current = null;
    void wakeRef.current?.release();
  }, [release]);

  const acquire = useCallback(async () => {
    const o = openRef.current;
    if (!o) return;
    release();                                   // never two cameras: whatever was open is let go first
    const gen = genRef.current;
    const stale = () => gen !== genRef.current;
    setError('');
    setStatus('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        // front camera preferred for form work, but as an IDEAL: a hard 'user' constraint rejects devices that don't
        // declare facing modes at all (measured: some webcams/fake devices refuse and the session never starts)
        video: { facingMode: { ideal: 'user' }, width: { ideal: 960 }, height: { ideal: 720 } }, audio: false,
      });
      if (stale()) { stream.getTracks().forEach((t) => t.stop()); return; }
      streamRef.current = stream;
      const v = videoRef.current!;
      v.srcObject = stream;
      await v.play();
      if (stale()) return;                       // the release that made this stale stopped the stream (streamRef)
      o.onVideo?.(v);

      setStatus('loading-model');
      const { NeuroMirror } = await loadMirror();
      if (stale()) return;
      // a resumed session's press/row count goes on from where it stopped: the new runtime counts from 0
      const carriedReps = carriedRef.current?.reps ?? 0;
      const clock = clockRef.current;
      const runtime = await NeuroMirror.session({
        video: v,
        overlayCanvas: canvasRef.current!,
        analysis: o.analysis,
        onReady: () => { if (!stale()) setStatus('live'); },
        onFrame: (info) => {
          if (stale()) return;
          const t = clock.stamp(info.pose.timestampMs);
          // until the first pause the frame goes through untouched (offset 0, no carried reps): the same objects as before
          if (t === info.pose.timestampMs && carriedReps === 0) { o.onFrame(info, v); return; }
          o.onFrame({
            ...info,
            pose: t === info.pose.timestampMs ? info.pose : { ...info.pose, timestampMs: t },
            reps: carriedReps === 0 ? info.reps : { ...info.reps, reps: info.reps.reps + carriedReps },
          }, v);
        },
      });
      if (stale()) { runtime.dispose(); return; }
      runtimeRef.current = runtime;
    } catch (e: unknown) {
      if (stale()) return;
      console.error('[FEL-MIRROR] start failed', e);
      // MIRROR-FIRST P1: a failed start lets go of the camera too (a dead 3D overlay used to leave the light on)
      release();
      setError(cameraErrorLine(e));
      setStatus('error');
    }
  }, [release, setStatus]);

  /** Start a new session with these settings (Start). */
  const open = useCallback((o: MirrorCameraOpen): Promise<void> => {
    carriedRef.current = null;
    clockRef.current = new PoseClock();
    openRef.current = o;
    return acquire();
  }, [acquire]);

  /** Carry on the paused session (Resume). A tap, like body play's READY button: the camera never turns itself on. */
  const resume = useCallback((): Promise<void> => {
    if (statusRef.current !== 'paused' || !openRef.current) return Promise.resolve();
    hooksRef.current.onResume?.();
    return acquire();
  }, [acquire]);

  /** The page went to the background: camera off, books kept, Paused. Nothing is sent. */
  const pause = useCallback(() => {
    if (!CAMERA_ON.includes(statusRef.current)) return;
    const rt = runtimeRef.current;
    if (rt) carriedRef.current = mergeSummaries(carriedRef.current, rt.summary());
    release();
    clockRef.current.pause();
    void wakeRef.current?.release();
    setStatus('paused');
    hooksRef.current.onPause?.();
  }, [release, setStatus]);

  /** The whole session so far, across pauses (null before a runtime ever ran). */
  const summary = useCallback((): SessionSummary | null =>
    mergeSummaries(carriedRef.current, runtimeRef.current?.summary() ?? null), []);

  /** Whether a camera stream or runtime is up right now. */
  const cameraOn = useCallback(() => runtimeRef.current !== null || streamRef.current !== null, []);
  /** Whether a session is going: a camera stretch running, or one carried over a pause. */
  const sessionOn = useCallback(() => runtimeRef.current !== null || carriedRef.current !== null, []);

  // the screen-awake lock: one per page, its own visibility re-acquire (MirrorWakeLock)
  useEffect(() => {
    if (typeof navigator === 'undefined' || typeof document === 'undefined') return;
    const api = (navigator as Navigator & { wakeLock?: WakeLockApiLike }).wakeLock ?? null;
    const w = new MirrorWakeLock(api, document, setWakeLock);
    wakeRef.current = w;
    return () => { w.dispose(); if (wakeRef.current === w) wakeRef.current = null; };
  }, []);
  // …held exactly while the camera is on
  useEffect(() => {
    const w = wakeRef.current;
    if (!w) return;
    if (CAMERA_ON.includes(status)) void w.hold();
    else void w.release();
  }, [status]);

  // the camera goes off with the page: hidden (app switch, call, lock) and pagehide (leaving it)
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVisibility = () => { if (document.visibilityState === 'hidden') pause(); };
    document.addEventListener('visibilitychange', onVisibility);
    const win = typeof window === 'undefined' ? null : window;
    win?.addEventListener('pagehide', pause);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      win?.removeEventListener('pagehide', pause);
    };
  }, [pause]);

  // leaving the page lets go of everything
  useEffect(() => () => { stop(); }, [stop]);

  return {
    videoRef, canvasRef, status, setStatus, error, wakeLock,
    open, resume, stop, summary, cameraOn, sessionOn,
  };
}

/**
 * The page's per-frame readouts: `view.set(patch)` every camera frame, `shown` re-rendered at most `hz` times a second
 * (lib/mirror/liveCamera.ts FrameView). `shown` is a stable snapshot between publishes.
 */
export function useFrameView<T extends object>(initial: T, hz: number = HUD_HZ): readonly [T, FrameView<T>] {
  const ref = useRef<FrameView<T> | null>(null);
  if (!ref.current) {
    ref.current = new FrameView(initial, hz, {
      now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
    });
  }
  const view = ref.current;
  const shown = useSyncExternalStore(view.subscribe, view.shown, view.shown);
  useEffect(() => () => view.dispose(), [view]);
  return [shown, view] as const;
}
