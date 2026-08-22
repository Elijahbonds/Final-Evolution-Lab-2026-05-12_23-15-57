/**
 * lib/social/challenge-link-core.ts
 * =================================
 * M13 Step 4 — Challenge links (Blueprint 2.4): the K-factor engine.
 *
 * Faithful headless TS port of the verified reference core
 * (reference/ChallengeLinkCore.js, batch-16). Any finished run mints a share
 * payload ("beat my 46-card windmill"); opening it starts a GUEST-playable
 * ghost duel from METADATA ONLY (no video, no PII). The SERVER signs + stamps
 * payloads (see lib/social/challenge-sign.ts); this core owns the shape,
 * encode/decode, and win resolution + funnel step.
 *
 * Hard cap of 40 key moments keeps links tiny. Guest sessions carry no PII
 * (M13 FIREWALL): athleteTag is a short display handle, never an email/id.
 */

export interface ChallengeKeyMoment {
  t: number;
  [k: string]: number | string | boolean;
}

export interface ChallengePayload {
  v: number;
  modeKey: string;
  score: number;
  display?: string;
  tag: string;
  ghost: ChallengeKeyMoment[];
  /** Server stamps real epoch ms; 0 until signed. */
  t: number;
}

export interface MintInput {
  modeKey: string;
  score: number;
  display?: string;
  keyMoments?: ChallengeKeyMoment[];
  athleteTag?: string;
}

export interface MintResult {
  payload: ChallengePayload;
  path: string;
}

export type ChallengeResultEvent =
  | { type: 'challenge-won'; vs: string }
  | { type: 'challenge-lost'; vs: string }
  | { type: 'rematch-link-offer' };

export interface ResolveResult {
  beat: boolean;
  margin: number;
  events: ChallengeResultEvent[];
  funnel: { step: 'attempt-finished'; convertToSignup: boolean };
}

/** Base64url encode/decode that works in both Node (Buffer) and the browser. */
function b64urlEncode(json: string): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(json, 'utf8').toString('base64url');
  // Browser fallback
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(s, 'base64url').toString('utf8');
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  return decodeURIComponent(escape(atob(b64)));
}

export class ChallengeLinkCore {
  /** Mint from a finished run. keyMoments = sparse replay beats for the ghost. */
  static mint({ modeKey, score, display, keyMoments = [], athleteTag = 'ATHLETE' }: MintInput): MintResult {
    if (!modeKey || score == null) throw new Error('mode+score required');
    const payload: ChallengePayload = {
      v: 1,
      modeKey,
      score,
      display,
      tag: String(athleteTag).slice(0, 16),
      ghost: keyMoments.slice(0, 40), // hard cap: links stay tiny
      t: 0, // server stamps real time + signature
    };
    return { payload, path: `/c/${ChallengeLinkCore.encode(payload)}` };
  }

  static encode(p: ChallengePayload): string {
    return b64urlEncode(JSON.stringify(p));
  }

  static decode(s: string): ChallengePayload {
    return JSON.parse(b64urlDecode(s)) as ChallengePayload;
  }

  /** Resolve a finished challenge attempt. Winner mints back = the loop. */
  static resolve(payload: ChallengePayload, attemptScore: number): ResolveResult {
    const beat = attemptScore > payload.score;
    return {
      beat,
      margin: Math.round((attemptScore - payload.score) * 10) / 10,
      events: [
        beat ? { type: 'challenge-won', vs: payload.tag } : { type: 'challenge-lost', vs: payload.tag },
        { type: 'rematch-link-offer' },
      ],
      funnel: { step: 'attempt-finished', convertToSignup: beat },
    };
  }
}

export default ChallengeLinkCore;
