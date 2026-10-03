// clips — the short window around one jump.
//
// About 1.5 s before takeoff through 1 s after landing, clamped to the recording. The review plays
// this window; the export writes it. The full session stays on the device until the player deletes it.

export const CLIP_PRE_MS = 1500;
export const CLIP_POST_MS = 1000;

export interface ClipBounds {
  startMs: number;
  endMs: number;
}

export function clipWindow(takeoffMs: number, landingMs: number, durationMs: number): ClipBounds {
  const duration = Math.max(0, durationMs);
  const startMs = Math.max(0, takeoffMs - CLIP_PRE_MS);
  const endMs = Math.min(duration, Math.max(landingMs, takeoffMs) + CLIP_POST_MS);
  return { startMs, endMs: Math.max(startMs, endMs) };
}
