'use client';

// frame-grab — the ball detector's eyes (BBS, 2026-10-26). A downscaled COLOUR copy of the frame the page already shows,
// read from the pose service's <video> into an offscreen canvas that is never put on the page. The copy is read by
// lib/hoops-cam/ball.ts and dropped; it is never kept, encoded, sent or shown (the picture is shown only through
// SelfView, Z-P4-4). The shots page calls it once per pose frame while a session runs; no other page calls it.
import { GRAB_HEIGHT, grabWidth, type Rgb } from '@/lib/hoops-cam/frame';

export type RgbGrab = () => Rgb | null;

/** A grabber over a video element (null when it has no frame yet). */
export function videoRgbGrab(video: () => HTMLVideoElement | null): RgbGrab {
  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  return () => {
    const v = video();
    if (!v || !v.videoWidth || !v.videoHeight) return null;
    const h = GRAB_HEIGHT, w = grabWidth(v.videoWidth / v.videoHeight);
    if (!canvas) { canvas = document.createElement('canvas'); ctx = canvas.getContext('2d', { willReadFrequently: true }); }
    if (!ctx) return null;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    ctx.drawImage(v, 0, 0, w, h);
    return { w, h, data: ctx.getImageData(0, 0, w, h).data };
  };
}
