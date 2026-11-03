// lib/hoops-cam/frame.ts — basketball on the camera (BBS, 2026-10-26): the colour copy of one frame the ball detector reads.
//
// The page draws the pose service's own <video> into an offscreen canvas at GRAB_HEIGHT and hands getImageData's bytes
// here (components/hoops-cam/frame-grab.ts). The copy is read and dropped: it is never kept, encoded, sent or shown
// (the picture is shown only through SelfView). The synthetic court (scene.ts) draws frames in the same layout.
//
// Pure.

/** One colour frame: w × h, RGBA bytes (ImageData's layout, 4 per pixel). */
export interface Rgb { w: number; h: number; data: Uint8ClampedArray | Uint8Array }

/** A point in the frame's pixels (x right, y down). */
export interface Px { x: number; y: number }

/** A circle in the frame's pixels. */
export interface Circle { x: number; y: number; r: number }

/** (new) The colour copy's height (px): a ball 8–30 px across from 3–10 m, about 100 k pixels a frame at 16:9. */
export const GRAB_HEIGHT = 240;

/** The grab's width for a camera of this aspect (width ÷ height). */
export const grabWidth = (aspect: number, h = GRAB_HEIGHT): number => Math.max(1, Math.round(h * (aspect > 0 ? aspect : 16 / 9)));
