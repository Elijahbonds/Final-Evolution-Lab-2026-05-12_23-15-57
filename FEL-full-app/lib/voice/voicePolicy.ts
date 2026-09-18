// VOICE POLICY — who may speak, when the mic is actually open, and what the room is told (2026-09-13).
//
// Owner asked for Discord-style voice chat. Decisions taken up front: peer-to-peer mesh (party-sized, no
// media server), IN-MATCH ONLY (joins with the lobby, ends with it, no persistent channels), and strict
// defaults — mic off until enabled, push-to-talk, and accounts flagged under 18 excluded entirely.
//
// THIS FILE IS THE RULES, NOT THE PLUMBING, and the split is deliberate. Everything that decides whether a
// microphone is live is pure and tested here; the getUserMedia/RTCPeerConnection glue lives next door in
// VoiceRoom.ts and has no judgement in it. A bug in the glue drops audio. A bug in the rules broadcasts a
// child's voice or leaves a mic open that the player believes is shut, and neither of those is something to
// discover from a bug report.
//
// THE UNDER-18 RULE IS NOT A PREFERENCE. This codebase already holds it — `hasPublicPresence` in
// CreatorRecord returns false for a record flagged `minor`, and Courts refuses them any public presence at
// all. Voice is the most public surface in the app, so the same flag closes it. There is no upgrade, no
// setting and no paid tier that opens it, and `eligibility` returns the same answer whatever else is true.
//
// FAIL CLOSED, EVERYWHERE. An unknown age is treated as a minor; an absent record is treated as a minor. A
// system that cannot tell how old someone is does not get to guess in the direction of opening a microphone.

export type VoiceDenial =
  | 'minor'          // flagged under 18 — hard, permanent, no override
  | 'unknown-age'    // we cannot tell, so we assume the answer that keeps the mic shut
  | 'no-consent'     // has not opted in this session
  | 'no-device';     // no microphone, or permission refused

export interface VoiceEligibility {
  allowed: boolean;
  reason: VoiceDenial | null;
  /** What the UI says. Plain, never blaming the player. */
  message: string;
}

export interface VoiceSubject {
  /** True when the account is flagged under 18. Undefined means UNKNOWN, which is treated as under 18. */
  minor?: boolean;
  /** Has the player turned voice on for this session? Never persisted — see the header. */
  consented?: boolean;
  /** Did a microphone actually become available? */
  hasDevice?: boolean;
}

export function eligibility(s: VoiceSubject): VoiceEligibility {
  // order matters: age is checked FIRST, so a minor is never told "turn on your mic" — they are told the
  // feature is not available to them, and no amount of consenting changes it
  if (s.minor !== false) {
    return s.minor === true
      ? { allowed: false, reason: 'minor', message: 'Voice chat isn’t available on accounts under 18.' }
      : { allowed: false, reason: 'unknown-age', message: 'Voice chat needs your date of birth on your profile.' };
  }
  if (!s.consented) {
    return { allowed: false, reason: 'no-consent', message: 'Voice is off. Turn it on to talk to your lobby.' };
  }
  if (!s.hasDevice) {
    return { allowed: false, reason: 'no-device', message: 'No microphone found, or access was refused.' };
  }
  return { allowed: true, reason: null, message: 'Voice on — hold to talk.' };
}

export function canUseVoice(s: VoiceSubject): boolean {
  return eligibility(s).allowed;
}

// ── PUSH TO TALK ─────────────────────────────────────────────────────────────────────────────────────────

export type VoiceMode = 'push-to-talk' | 'open-mic';

/**
 * The hang-over after the key is released, ms.
 *
 * Without it push-to-talk clips the last syllable of every sentence, which is the single thing that makes
 * PTT feel cheap. Short enough that nobody says a second sentence into a mic they think is closed.
 */
export const PTT_TAIL_MS = 220;

export interface VoiceState {
  mode: VoiceMode;
  /** Is the talk key held right now? */
  held: boolean;
  /** Wall clock of the last release, for the tail. */
  releasedAt: number | null;
  /** The player has muted themselves. Outranks everything except the rules above. */
  selfMuted: boolean;
}

export function freshVoiceState(mode: VoiceMode = 'push-to-talk'): VoiceState {
  return { mode, held: false, releasedAt: null, selfMuted: false };
}

/**
 * IS THE MICROPHONE ACTUALLY SENDING AUDIO RIGHT NOW?
 *
 * The single question the whole feature turns on, and the only function allowed to answer it. Everything —
 * the transmit path, the on-screen indicator, the lobby's "who is talking" — reads THIS, so the light a
 * player sees and the bytes that leave their machine can never disagree. Two sources of truth for "is the
 * mic open" is how a product ends up with a muted indicator over a live microphone.
 */
export function isTransmitting(s: VoiceState, eligible: boolean, now: number): boolean {
  if (!eligible || s.selfMuted) return false;
  if (s.mode === 'open-mic') return true;
  if (s.held) return true;
  return s.releasedAt !== null && now - s.releasedAt < PTT_TAIL_MS;
}

export function holdTalk(s: VoiceState): VoiceState {
  return { ...s, held: true, releasedAt: null };
}

export function releaseTalk(s: VoiceState, now: number): VoiceState {
  return s.held ? { ...s, held: false, releasedAt: now } : s;
}

export function setSelfMuted(s: VoiceState, muted: boolean): VoiceState {
  // muting while holding the key drops the tail too: a player who mutes mid-sentence means NOW
  return { ...s, selfMuted: muted, held: muted ? false : s.held, releasedAt: muted ? null : s.releasedAt };
}

export function setMode(s: VoiceState, mode: VoiceMode): VoiceState {
  // switching INTO push-to-talk must close the mic, not leave it open until the next key press
  return { ...s, mode, held: false, releasedAt: null };
}

// ── WHAT THE ROOM SEES ───────────────────────────────────────────────────────────────────────────────────

export interface VoicePeerView {
  id: string;
  name: string;
  speaking: boolean;
  muted: boolean;
}

/** The mesh ceiling. Above this every client uploads to every other and the room falls over. */
export const MAX_VOICE_PEERS = 6;

export function roomIsFull(peerCount: number): boolean {
  return peerCount >= MAX_VOICE_PEERS;
}

/**
 * The indicator string. Never silent about a live mic.
 *
 * There is deliberately no state in which a transmitting microphone renders nothing — "LIVE" is returned for
 * an eligible, transmitting player no matter what else is happening on screen.
 */
export function indicator(s: VoiceState, eligible: boolean, now: number): { label: string; live: boolean } {
  if (!eligible) return { label: 'VOICE OFF', live: false };
  if (s.selfMuted) return { label: 'MUTED', live: false };
  if (isTransmitting(s, eligible, now)) return { label: 'LIVE', live: true };
  // Only push-to-talk can reach here. An eligible, unmuted OPEN-MIC player is transmitting by definition, so
  // they always read LIVE — a first pass had a 'MIC OPEN' label for them and it was unreachable code that
  // would have implied a quieter state than open-mic actually is.
  return { label: 'HOLD TO TALK', live: false };
}
