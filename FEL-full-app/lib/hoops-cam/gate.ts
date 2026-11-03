// lib/hoops-cam/gate.ts — basketball on the camera (BBS, 2026-10-26): who may use the shot and dribble tracker, and whose
// numbers are kept. Every gate is one the app already has (lib/vbt/gate.ts names them; the same rules apply here):
//   · SIGNED IN, and a birth year on file. UNDER 13 or an UNKNOWN age: refused with one line, no camera (the VBT tool's
//     rule, fail closed; the sign-up lock already turns most under-13s away).
//   · 13–17: the tracker runs on the phone and shows its numbers; NOTHING IS KEPT — not on the server, not on the phone
//     (owner, 2026-10-26: "teens are not saved until the guardian wording is approved"). TEEN_SHOT_SAVE below.
//   · ADULTS (verified 18+): their sessions are kept on their own phone. Kept on the server — where a coach could see
//     them — only through the movement-save gate (canSaveScanNumbers: verified 18+ AND opted in), and only once the
//     owner applies the pending SQL (docs/HOOPS-CAM.md).
//
// Pure.
import { vbtAccess } from '@/lib/vbt/gate';

/** OWNER CALL (flagged): keep a teen's shot and dribble sessions anywhere. false until a guardian consent covers them. */
export const TEEN_SHOT_SAVE = false as const;

export type HoopsTier = 'adult' | 'teen';
export type HoopsAccess = { ok: true; tier: HoopsTier } | { ok: false; error: 'sign_in' | 'under_13' | 'age_unknown' };

/** The same age read as the bar-speed tool's (one rule, one place). */
export function hoopsCamAccess(o: { signedIn: boolean; dobYear: number | null | undefined }, now: Date = new Date()): HoopsAccess {
  return vbtAccess(o, now);
}

/** Whether this tier's sessions are kept on the phone at all. */
export const keepsSessions = (tier: HoopsTier): boolean => tier === 'adult' || TEEN_SHOT_SAVE;
