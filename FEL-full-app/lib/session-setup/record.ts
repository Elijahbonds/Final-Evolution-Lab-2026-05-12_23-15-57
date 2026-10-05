// Prove It recording (SESSION-SETUP-V1).
//
// The adult half of this gate is verifiedAdult (lib/privacy/verifiedAdult.ts): a year gap of more
// than 18 on the account's User.dobYear. This file does not invent a second "verified adult" rule.
// A kid or an unknown age never sees the button, and a recorder that was running stops (and is
// discarded) when the rotation hands them the next turn.
// The clip is handed to the phone's download or share sheet. This file does not fetch, post, or upload.

import { deliverClip, extForMime, shareFileName, type ShareEnv, type SharePlan } from '@/lib/capture/shareClip';
import { verifiedAdult } from '@/lib/privacy/verifiedAdult';
import type { SessionBand } from './roster';

export const KIDS_IN_SHOT = "Make sure no kids or people who haven't said yes are in the shot.";

/**
 * True only when this jumper is tagged 18+ and the account birth year passes verifiedAdult.
 * A gap of exactly 18 is not enough (that year may still be 17). Missing year is not an adult.
 */
export function mayRecord(
  band: SessionBand,
  dobYear: number | null | undefined,
  now: Date = new Date(),
): boolean {
  return band === '18+' && verifiedAdult(dobYear, now);
}

/**
 * After the board moves to `nextBand`: recording stays only if that athlete may record.
 * Handing off to a kid or an unknown age forces it off. `discard` is true when the open
 * clip must not be saved (it would keep rolling onto someone who cannot be recorded).
 */
export function recordingOnHandoff(
  recording: boolean,
  nextBand: SessionBand,
  dobYear: number | null | undefined,
  now: Date = new Date(),
): { recording: boolean; discard: boolean } {
  if (!mayRecord(nextBand, dobYear, now)) {
    return { recording: false, discard: recording };
  }
  return { recording, discard: false };
}

/** Save one attempt on this phone. Download or the system share sheet. No other path. */
export function saveClipOnDevice(blob: Blob, env: ShareEnv): Promise<SharePlan> {
  const name = shareFileName('dunk', '16:9', extForMime(blob.type));
  return deliverClip(blob, name, 'FEL Prove It', env);
}
