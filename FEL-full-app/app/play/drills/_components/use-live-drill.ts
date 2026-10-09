'use client';

// useLiveDrill — the page's side of lib/drills/liveDrill.ts (Mirror & coaching plan Phase 6, 2026-10-07): the real
// singletons handed to the pure controller, a requestAnimationFrame loop for its display clock, and its view read the
// way the Mirror's is (useSyncExternalStore over a FrameView published at most HUD_HZ times a second).
//
// Every piece is somebody else's, used as it is:
//   bodyPlay, the space check  lib/move/bodyPlay.ts (the games' READY screen; read-only here)
//   the session card            lib/babylon/core/sessionStore.ts (what a game host's harness mounts)
//   the body's packets          an InputBus (lib/babylon/core/InputBus.ts): the shared pose source publishes to every
//                               running bus, and this page runs one while a drill is open
//   the world landmarks         lib/pose/PoseService.ts onFrame
//   the screen awake            lib/mirror/liveCamera.ts MirrorWakeLock (Phase 1's, by import)
//   the Coach                   lib/babylon/audio/mic/VoiceKit.ts, the coach bank's drill takes (lib/drills/drillVoice.ts)
// Nothing here sends anything; the camera picture never leaves the page.

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { bodyPlay } from '@/lib/move/bodyPlay';
import { sessionStore } from '@/lib/babylon/core/sessionStore';
import { InputBus } from '@/lib/babylon/core/InputBus';
import { poseService } from '@/lib/pose/PoseService';
import { MirrorWakeLock, type WakeLockApiLike, type WakeLockState } from '@/lib/mirror/liveCamera';
import { VoiceKit } from '@/lib/babylon/audio/mic/VoiceKit';
import { createLiveDrill, LIVE_IDLE, type LiveDrill, type LiveDrillView } from '@/lib/drills/liveDrill';
import { DrillVoice, DRILL_VOICE_CAST } from '@/lib/drills/drillVoice';

const noSubscribe = () => () => {};

export interface LiveDrillHandle {
  live: LiveDrill;
  /** Everything off and every listener gone (the page left). */
  dispose(): void;
}

function makeLiveDrill(onWake: (s: WakeLockState) => void): LiveDrillHandle {
  const api = (navigator as Navigator & { wakeLock?: WakeLockApiLike }).wakeLock ?? null;
  const wake = new MirrorWakeLock(api, document, onWake);
  const voice = new DrillVoice();
  let bankAsked = false;
  const loadBank = (): void => {
    if (bankAsked) return;
    bankAsked = true;
    void VoiceKit.load([{ cast: DRILL_VOICE_CAST, group: DRILL_VOICE_CAST }])
      .then((idx) => { for (const b of idx) voice.load(b.lines); })
      .catch(() => { /* no bank: the screen lines carry the drill, unspoken */ });
  };
  let bus: InputBus | null = null;
  const live = createLiveDrill({
    bodyPlay,
    session: sessionStore,
    bus: {
      start() { loadBank(); bus?.stop(); bus = new InputBus(); bus.start(); },
      stop() { bus?.stop(); bus = null; },
      onBody(fn) { const b = bus; return b ? b.onBody(fn) : () => {}; },
    },
    frames: { onFrame: (fn) => poseService().onFrame(fn) },
    wake,
    onPageHidden(fn) {
      const h = () => { if (document.visibilityState === 'hidden') fn(); };
      document.addEventListener('visibilitychange', h);
      return () => document.removeEventListener('visibilitychange', h);
    },
    voice: {
      say(prompt, show) {
        const take = voice.pick(prompt);
        if (!take) return;
        void VoiceKit.playCaptioned({
          cast: DRILL_VOICE_CAST, role: 'coach', channel: 'player', clips: [take.clip], caption: take.text, speaker: 'Coach',
          sec: VoiceKit.line(take.clip)?.sec ?? 2, priority: 1, interrupt: false, pan: 0, gain: 1,
        }, 'venice', () => show(take.text));
      },
      stop() { VoiceKit.stop('player'); },
    },
    now: () => performance.now(),
    timers: { setTimer: (fn, ms) => setTimeout(fn, ms), clearTimer: (id) => clearTimeout(id as ReturnType<typeof setTimeout>) },
  });
  return { live, dispose() { live.dispose(); wake.dispose(); } };
}

/**
 * The page's live drill: made in an effect (so a remount — StrictMode's double effect included — gets a fresh one and
 * never a disposed one), ticked every animation frame, gone with the page.
 */
export function useLiveDrill(onWake: (s: WakeLockState) => void): { handle: LiveDrillHandle | null; view: LiveDrillView } {
  const [handle, setHandle] = useState<LiveDrillHandle | null>(null);
  const onWakeRef = useRef(onWake);
  onWakeRef.current = onWake;
  useEffect(() => {
    const h = makeLiveDrill((s) => onWakeRef.current(s));
    setHandle(h);
    let raf = 0;
    const loop = (t: number) => { h.live.tick(t); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); h.dispose(); };
  }, []);
  const view = useSyncExternalStore(
    handle ? handle.live.subscribe : noSubscribe,
    handle ? handle.live.view : () => LIVE_IDLE,
    () => LIVE_IDLE,
  );
  return { handle, view };
}
