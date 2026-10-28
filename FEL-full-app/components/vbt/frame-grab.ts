'use client';

// frame-grab — the plate tracker's eyes (VBT, 2026-10-25). A downscaled GREY copy of the frame the page already shows,
// read from the pose service's <video> into an offscreen canvas that is never put on the page. The copy is read by
// lib/vbt/plate.ts and dropped; it is never kept, encoded, sent or shown (the picture is shown only through SelfView,
// Z-P4-4). A barbell set calls it once per pose frame; every other move never does.
import { lumaOf, type Luma } from '@/lib/vbt/plate';

/** (new) The grey copy's height (px): enough for a plate 30–80 px across at 3 m, cheap enough per frame. */
export const GRAB_HEIGHT = 240;

export type Grab = () => Luma | null;

/** A grabber over a video element (null when it has no frame yet). */
export function videoGrab(video: () => HTMLVideoElement | null): Grab {
  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  return () => {
    const v = video();
    if (!v || !v.videoWidth || !v.videoHeight) return null;
    const h = GRAB_HEIGHT, w = Math.round((GRAB_HEIGHT * v.videoWidth) / v.videoHeight);
    if (!canvas) { canvas = document.createElement('canvas'); ctx = canvas.getContext('2d', { willReadFrequently: true }); }
    if (!ctx) return null;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    ctx.drawImage(v, 0, 0, w, h);
    return lumaOf(ctx.getImageData(0, 0, w, h).data, w, h);
  };
}
