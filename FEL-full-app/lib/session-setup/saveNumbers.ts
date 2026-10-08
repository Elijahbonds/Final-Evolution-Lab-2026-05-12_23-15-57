// Whether Prove It may send jump numbers to the server (SESSION-SETUP-V1).
//
// Draft PRs #146 and #147 posted every dunk's height and flight time to /api/sessions
// when the final screen appeared. That stays off unless this account is a verified
// adult who has opted in (canSaveScanNumbers / AB-04). Under 18 and unknown age are
// never in the body. On a shared camera the server keeps only player 1, so only the
// first athlete — when they themselves are a verified 18+ — is eligible. Everyone
// else's jumps stay on the phone.

import { FORM_SUMMARY_VERSION } from '@/lib/move/formSummary';
import type { SessionBand } from './roster';

export const SESSION_MODE = 'dunkduel';

export interface MeasuredJump {
  /** Roster slot. 0 is the signed-in athlete (form player 1). */
  playerIndex: number;
  band: SessionBand;
  /** Kept for the on-screen board. Never copied into the server body. */
  name: string;
  family: string;
  takeoff: 'one-foot' | 'two-foot';
  verticalCm: number;
  flightTimeMs: number;
  landingStability: number;
}

export interface ServerJumpForm {
  v: typeof FORM_SUMMARY_VERSION;
  mode: typeof SESSION_MODE;
  attemptCount: number;
  attempts: Array<{
    kind: 'jump';
    label: string;
    player: 1;
    made: true;
    takeoff: 'one' | 'two';
    reads: { heightCm: number; flightMs: number; landingStability: number };
  }>;
}

/**
 * The body #147 built, filtered. Null means do not call the server at all:
 * not verified, not opted in, or the first athlete is under 18 or unknown.
 */
export function serverJumpForm(
  jumps: readonly MeasuredJump[],
  opts: { serverVerified: boolean; optedIn: boolean },
): ServerJumpForm | null {
  if (!opts.serverVerified || !opts.optedIn) return null;
  const mine = jumps.filter((j) => j.playerIndex === 0 && j.band === '18+');
  if (mine.length === 0) return null;
  return {
    v: FORM_SUMMARY_VERSION,
    mode: SESSION_MODE,
    attemptCount: mine.length,
    attempts: mine.map((j) => ({
      kind: 'jump' as const,
      label: j.family,
      player: 1 as const,
      made: true as const,
      takeoff: j.takeoff === 'one-foot' ? 'one' as const : 'two' as const,
      reads: {
        heightCm: j.verticalCm,
        flightMs: j.flightTimeMs,
        landingStability: j.landingStability,
      },
    })),
  };
}

export type SaveOutcome = 'skipped' | 'saved' | 'failed';

/**
 * Start a run and finish it only when serverJumpForm returns a body.
 * Score is 0: dunkduel's server cap is still two dunks, and the mode pays the
 * played floor. The measured jumps ride in `form`. No request when the gate is shut.
 */
export async function postOptInSession(
  jumps: readonly MeasuredJump[],
  opts: { serverVerified: boolean; optedIn: boolean },
  fetchImpl: typeof fetch = fetch,
): Promise<SaveOutcome> {
  const form = serverJumpForm(jumps, opts);
  if (!form) return 'skipped';
  try {
    const started = await fetchImpl('/api/sessions/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: SESSION_MODE }),
    });
    const startBody = started.ok ? await started.json().catch(() => null) : null;
    const runId = typeof startBody?.runId === 'string' ? startBody.runId : null;
    if (!runId) return 'failed';
    const finished = await fetchImpl('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: SESSION_MODE,
        runId,
        score: 0,
        opponentScore: 0,
        won: false,
        played: true,
        form,
      }),
    });
    if (!finished.ok) return 'failed';
    const body = await finished.json().catch(() => null);
    if (body && body.ok === false) return 'failed';
    return 'saved';
  } catch {
    return 'failed';
  }
}
