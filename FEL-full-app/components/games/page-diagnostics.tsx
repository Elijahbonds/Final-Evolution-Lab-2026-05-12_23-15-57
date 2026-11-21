'use client';

import { useEffect } from 'react';
import { reportDiag, setDiagMode } from '@/lib/babylon/core/diag';
import {
  DOM_FPS_WINDOW_MS, DOM_MAX_FRAMES,
  domFpsDetail, domTtfpDetail, pageOsClass, summarizeDomFrames,
  type DomDeviceClass,
} from '@/lib/game-diag/pageStats';

function deviceClass(): DomDeviceClass {
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  const w = typeof window !== 'undefined' ? window : null;
  return {
    os: pageOsClass(nav?.userAgent ?? '', nav?.maxTouchPoints ?? 0),
    dpr: w?.devicePixelRatio || 1,
    px: w ? `${Math.round(w.innerWidth)}x${Math.round(w.innerHeight)}` : '0x0',
  };
}

export function PageDiagnostics({ mode, active = true }: { mode: string; active?: boolean }) {
  useEffect(() => {
    if (!active || typeof window === 'undefined') return;
    setDiagMode(mode);
    const start = performance.now();
    const frames: number[] = [];
    let firstSent = false;
    let fpsSent = false;
    let lastFrame: number | null = null;
    let raf = 0;
    let cancelled = false;
    let device: DomDeviceClass | null = null;
    const dev = () => (device ??= deviceClass());

    const sendFps = () => {
      if (fpsSent || frames.length === 0) return;
      fpsSent = true;
      reportDiag('fps', domFpsDetail(1, summarizeDomFrames(frames), dev()));
    };

    const tick = (now: number) => {
      if (cancelled) return;
      const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
      if (!hidden) {
        if (!firstSent) {
          firstSent = true;
          reportDiag('ttfp', domTtfpDetail({ firstMs: now - start, pageMs: now }, dev()));
        }
        if (lastFrame !== null && frames.length < DOM_MAX_FRAMES) {
          const dt = now - lastFrame;
          if (dt > 0 && dt < 1000) frames.push(dt);
        }
        lastFrame = now;
        if (now - start >= DOM_FPS_WINDOW_MS) {
          sendFps();
          return;
        }
      } else {
        lastFrame = null;
      }
      raf = window.requestAnimationFrame(tick);
    };

    raf = window.requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
      if (!firstSent) {
        try { reportDiag('ttfp', domTtfpDetail({ firstMs: 0, pageMs: performance.now(), leftMs: performance.now() - start }, dev())); } catch { /* diagnostics never break teardown */ }
      }
      sendFps();
    };
  }, [active, mode]);

  return null;
}
