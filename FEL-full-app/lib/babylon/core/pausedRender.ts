// pausedRender — IMPROVE (2026-10-06, 3PT #18): THE PAUSE IS NOT RENDERED AT 60 FPS.
//
// The harness rendered a full frame every tick while paused — the whole scene, its post-process chain and its shadows, behind
// a card that dims it — and on a phone that is the battery spent on a picture that is not moving (update() is not called).
// While paused the harness renders at about PAUSED_RENDER_FPS instead; the canvas keeps showing the last frame it was given
// between them (a WebGL canvas that is not drawn to is not cleared on screen). The body clock, the resume hold and every
// other per-tick job of the loop still run every tick: only scene.render() is thinned. The first paused tick always renders,
// so the frame under the card is the one the pause landed on; any other phase renders every tick, as before.

/** Renders a second while paused. */
export const PAUSED_RENDER_FPS = 10;
const PAUSED_RENDER_MS = 1000 / PAUSED_RENDER_FPS;

/**
 * Is this tick's render due? `lastPausedMs` is when the last paused render ran (−Infinity once the loop leaves the pause), so
 * every phase but 'paused' is always due, and a paused tick is due PAUSED_RENDER_MS after the last paused render.
 */
export function renderDue(phase: string, nowMs: number, lastPausedMs: number): boolean {
  if (phase !== 'paused') return true;
  return !(nowMs - lastPausedMs < PAUSED_RENDER_MS);
}
