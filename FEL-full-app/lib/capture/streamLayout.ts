// streamLayout — a stable 16:9 frame for OBS or a phone's own screen broadcast.
//
// This is not a live ingest. A browser cannot speak RTMP. Twitch and YouTube need a relay that accepts
// WebRTC or WHIP and pushes RTMP with a stream key. That is a server, and usually a paid one. It is not
// built here. LIVE_RELAY_BUILT stays false so a button cannot pretend otherwise.
//
// What is built: the page lays out a 16:9 stage, pads a safe area so a stream overlay (chat, a face cam)
// has somewhere to sit, and hides the app chrome. The player captures that window with OBS or the phone's
// screen broadcast.

export const LIVE_RELAY_BUILT = false;

export const RTMP_NOTE =
  'Live RTMP from the browser is not built. A browser cannot push RTMP. Twitch or YouTube needs a relay '
  + '(WebRTC or WHIP in, RTMP out) and a stream key — a server you run, usually paid. Stream mode is the '
  + '16:9 frame for OBS, or for the phone’s own screen broadcast.';

/** The frame OBS should see. */
export const STREAM_ASPECT = 16 / 9;

/** Pixels held back from the game picture so an overlay can sit in the margin. */
export const STREAM_SAFE = { top: 48, right: 88, bottom: 72, left: 88 } as const;

export interface StageBox { x: number; y: number; w: number; h: number }

/** The 16:9 stage centred in the viewport. */
export function streamStageBox(viewW: number, viewH: number): StageBox {
  const w = Math.max(1, viewW);
  const h = Math.max(1, viewH);
  const fitW = Math.min(w, h * STREAM_ASPECT);
  const fitH = fitW / STREAM_ASPECT;
  return {
    x: Math.round((w - fitW) / 2),
    y: Math.round((h - fitH) / 2),
    w: Math.round(fitW),
    h: Math.round(fitH),
  };
}

/** The rectangle inside the safe area — where the game picture sits. */
export function streamSafeBox(stage: StageBox, safe = STREAM_SAFE): StageBox {
  const w = Math.max(1, stage.w - safe.left - safe.right);
  const h = Math.max(1, stage.h - safe.top - safe.bottom);
  return { x: stage.x + safe.left, y: stage.y + safe.top, w, h };
}

/** Chrome stream mode hides. A mode's own in-scene score is still the mode's. */
export const STREAM_HIDDEN = ['header', 'prq', 'back', 'body-control', 'touch-deck', 'legacy-pad'] as const;
