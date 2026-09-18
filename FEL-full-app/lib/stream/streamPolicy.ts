// STREAM POLICY — who may broadcast, what goes out, and who is told (2026-09-13).
//
// Owner: "I need people to be able to stream themselves playing this game", and on which kind: all three —
// in-app spectating, broadcast to Twitch/YouTube, and a local recording they can post themselves.
//
// WHAT IS ACTUALLY BUILDABLE HERE, stated plainly rather than discovered later:
//   · SPECTATE  — real, and shipped. Same WebRTC mesh as voice: the canvas is captured and sent to viewers.
//   · RECORD    — real, and shipped. MediaRecorder on the canvas, saved to a file the player keeps.
//   · BROADCAST — NOT shippable from a browser alone and this file does not pretend otherwise. Browsers
//                 cannot speak RTMP, so Twitch/YouTube need a relay that takes WebRTC or WebSocket in and
//                 pushes RTMP out. That is infrastructure somebody has to run and a stream key somebody has
//                 to enter. The seam is here and typed; `BROADCAST_READY` is false until a relay exists, and
//                 the UI must read that rather than offering a button that fails.
//
// THE AGE RULE IS THE SAME ONE VOICE USES and for a stronger reason: a stream carries a face. The Courts
// spec already says accounts flagged under 18 have no public presence in this system at all, and a camera
// pointed at a child is the most public thing the app could do. Unknown age fails closed.
//
// Pure: no DOM, no MediaRecorder, no peer connection. The plumbing is in StreamSession.ts.

export type StreamKind = 'spectate' | 'record' | 'broadcast';

/** Broadcast needs a relay nobody has provisioned yet. Flip this when one exists — see the header. */
export const BROADCAST_READY = false;

export type StreamDenial = 'minor' | 'unknown-age' | 'no-consent' | 'unavailable' | 'no-capture';

export interface StreamEligibility {
  allowed: boolean;
  reason: StreamDenial | null;
  message: string;
}

export interface StreamSubject {
  /** Undefined means UNKNOWN, which is treated as under 18. */
  minor?: boolean;
  /** Turned streaming on for this session. Never persisted. */
  consented?: boolean;
  /** Is the camera included, as opposed to game footage only? */
  camera?: boolean;
  /** Did the capture actually start? */
  hasCapture?: boolean;
}

export function eligibility(kind: StreamKind, s: StreamSubject): StreamEligibility {
  // age first, so a minor is never walked through a consent flow that ends in a refusal
  if (s.minor !== false) {
    return s.minor === true
      ? { allowed: false, reason: 'minor', message: 'Streaming isn’t available on accounts under 18.' }
      : { allowed: false, reason: 'unknown-age', message: 'Streaming needs your date of birth on your profile.' };
  }
  if (kind === 'broadcast' && !BROADCAST_READY) {
    return {
      allowed: false, reason: 'unavailable',
      message: 'Broadcasting to Twitch and YouTube isn’t switched on yet. You can still go live in-app or record a clip.',
    };
  }
  if (!s.consented) {
    return { allowed: false, reason: 'no-consent', message: 'Streaming is off. Turn it on to let people watch.' };
  }
  if (!s.hasCapture) {
    return { allowed: false, reason: 'no-capture', message: 'Couldn’t start the capture.' };
  }
  return { allowed: true, reason: null, message: kind === 'record' ? 'Recording.' : 'You’re live.' };
}

export function canStream(kind: StreamKind, s: StreamSubject): boolean {
  return eligibility(kind, s).allowed;
}

/** Which kinds a player can pick right now — so the UI never renders a button that will refuse. */
export function availableKinds(s: StreamSubject): StreamKind[] {
  return (['spectate', 'record', 'broadcast'] as StreamKind[])
    .filter((k) => eligibility(k, { ...s, consented: true, hasCapture: true }).allowed);
}

// ── WHAT LEAVES THE MACHINE ──────────────────────────────────────────────────────────────────────────────

export interface StreamComposition {
  /** The game canvas. Always on — a stream of a game with no game in it is not a stream. */
  game: true;
  /** The player's camera. OFF by default, and a separate decision from streaming at all. */
  camera: boolean;
  /** The player's microphone. OFF by default, and separate from voice chat's mic. */
  microphone: boolean;
  /** Game audio. On by default: it is the only track that carries no personal data. */
  gameAudio: boolean;
}

export function defaultComposition(): StreamComposition {
  // EVERY personal channel starts off. The player turns on what they mean to share, one decision at a time,
  // rather than discovering after the fact that their room was on screen.
  return { game: true, camera: false, microphone: false, gameAudio: true };
}

/**
 * The one-line summary shown while live.
 *
 * Names every personal channel that is actually on. A player must never have to remember what they enabled
 * ten minutes ago to know whether their face is being broadcast.
 */
export function compositionSummary(c: StreamComposition): string {
  const on = ['GAME'];
  if (c.gameAudio) on.push('GAME AUDIO');
  if (c.camera) on.push('CAMERA');
  if (c.microphone) on.push('MIC');
  return on.join(' · ');
}

/** True when anything personal is going out, which is what the loud indicator keys off. */
export function sharingPersonal(c: StreamComposition): boolean {
  return c.camera || c.microphone;
}

// ── VIEWERS ──────────────────────────────────────────────────────────────────────────────────────────────

/** Spectators ride the same mesh as voice, so the same ceiling applies. */
export const MAX_SPECTATORS = 6;

export function spectatorsFull(n: number): boolean {
  return n >= MAX_SPECTATORS;
}

export type StreamVisibility = 'invite-only' | 'lobby' | 'public';

/**
 * Who can open your stream.
 *
 * INVITE-ONLY is the default deliberately. "Public by default" is how somebody ends up broadcast to
 * strangers because they pressed a button that said Go Live and meant "show my friend".
 */
export const DEFAULT_VISIBILITY: StreamVisibility = 'invite-only';

export function visibilityLabel(v: StreamVisibility): string {
  return v === 'public' ? 'Anyone can watch'
    : v === 'lobby' ? 'People in your lobby can watch'
      : 'Only people you invite can watch';
}

/** A viewer's own controls are never gated: leaving and reporting always work. */
export interface ViewerControls {
  canLeave: true;
  canReport: true;
  canMute: true;
}

export function viewerControls(): ViewerControls {
  return { canLeave: true, canReport: true, canMute: true };
}
