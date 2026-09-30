// app/play/mirror/_components/intake-refusal.ts — R-HEALTH-CLIENT (2026-09-30; FE PM 19:31, 19:46, 19:53 and 19:56 PT): what the
// health-intake screen (./health-intake-gate.tsx) does when a user's health answers must NOT be saved.
//
// WHO. canWriteHealthData (lib/privacy/healthWriteGate.ts, read by app/play/mirror/page.tsx on the server) is false for
// everyone who isn't a verified adult: unknown age, under 18, 17 with a parent's yes. For them the intake runs in the
// browser only and sends NOTHING: no status GET, no submit POST, no clear ("a 403 still carries a teen's answers to the
// server and its logs", FE PM 19:46 PT). A verified adult who declines the health_data consent takes the same path. And
// a verified adult whose submit is refused anyway (403 health_data_adults_only, e.g. a stale render) lands on it too.
//
// ONE RULE, ONE MODULE. The red-flag rule is lib/health/intake.ts's (validateIntakeAnswers, redFlagsFor, RED_FLAG_COPY),
// imported here, never copied: the same answers stop here exactly when they would have stopped on the server.
//
// Pure: no React, no prisma, no next/*, no storage. Nothing here logs an answer, a red flag id or a birth year.
import { RED_FLAG_COPY, redFlagsFor, validateIntakeAnswers } from '@/lib/health/intake';

/**
 * The code app/api/health/intake answers a refused health write with (HEALTH_WRITE_REFUSED.error in
 * lib/privacy/healthWriteGate.ts). A literal, not an import: that module imports next/server, which must not ride into a
 * browser bundle. tests/mirror-no-save/intake-refusal.test.ts holds the two equal.
 */
export const HEALTH_ADULTS_ONLY = 'health_data_adults_only';

/** The pre-TEEN-WRITE-BLOCK 412 code (the gate's own GUARDIAN_NEEDED). Nothing answers it any more; kept so an old
 *  server's answer still lands on the guardian_needed stage rather than on "That didn't save". */
export const LEGACY_GUARDIAN_NEEDED = 'guardian_consent_required';

export const INTAKE_URL = '/api/health/intake';

/** What the page's server render knows about this user's stored intake, for the browser-only path (no client request). */
export interface LocalIntakeStatus {
  intakeDue: boolean;
  storedHardStop: boolean;
}

/** When the status can't be read (no user, a failed read): ask the intake, and stop nothing that isn't answered. */
export const UNKNOWN_LOCAL_STATUS: LocalIntakeStatus = { intakeDue: true, storedHardStop: false };

/** A 403 that means "health data is kept only for a verified adult; nothing was written". Nothing else counts. */
export function isAdultsOnlyRefusal(status: number, body: unknown): boolean {
  return status === 403 && !!body && typeof body === 'object' && (body as { error?: unknown }).error === HEALTH_ADULTS_ONLY;
}

export type LocalOutcome =
  | { stage: 'stopped_local'; redFlags: string[]; copy: string }
  | { stage: 'ready_unsaved'; redFlags: [] };

/**
 * The intake's outcome in page memory. Any red flag (lib/health/intake.ts's rule) stops with RED_FLAG_COPY; none lets the
 * athlete continue with nothing saved.
 * assumption: (FE PM can reverse) answers that fail validation stop the athlete (fail closed) rather than continue.
 */
export function localIntakeOutcome(rawAnswers: unknown, now: Date = new Date()): LocalOutcome {
  const { answers, errors } = validateIntakeAnswers(rawAnswers, now);
  const redFlags = redFlagsFor(answers);
  if (errors.length > 0 || redFlags.length > 0) return { stage: 'stopped_local', redFlags, copy: RED_FLAG_COPY };
  return { stage: 'ready_unsaved', redFlags: [] };
}

/** Where the browser-only path starts: a stored red flag still stops; a due intake is asked; otherwise straight on. */
export function localIntakeStart(status: LocalIntakeStatus = UNKNOWN_LOCAL_STATUS): 'stopped_local' | 'question' | 'ready_unsaved' {
  if (status.storedHardStop) return 'stopped_local';
  return status.intakeDue ? 'question' : 'ready_unsaved';
}

/** "I've checked — mark cleared" on the browser-only path: a tick in page memory (no request, no row). A reload asks again. */
export const LOCAL_CLEARED = 'ready_unsaved' as const;

/** What the server's answer to a saved intake carries (app/api/health/intake POST). */
export interface SavedIntakeAnswer {
  intake: { id: string; version: string; redFlags: string[]; birthYear: number | null; consentedAt: string };
  hardStopped: boolean;
  redFlagCopy: string | null;
}

export type SubmitOutcome =
  | { stage: 'ready' | 'stopped'; data: SavedIntakeAnswer }
  | LocalOutcome
  | { stage: 'guardian_needed' }
  | { stage: 'error' };

/**
 * The verified adult's submit: the SAME single POST the screen has always made (same URL, headers and body), mapped to the
 * next stage. 2xx → 'ready' / 'stopped' with the server's answer; the adults-only 403 → the page-memory outcome; the legacy
 * 412 → 'guardian_needed'; anything else, or a thrown fetch → 'error'. Exactly one request: no retry, no clear.
 */
export async function submitIntakeOnce(fetchImpl: typeof fetch, answers: unknown): Promise<SubmitOutcome> {
  try {
    const res = await fetchImpl(INTAKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers, consent: true }),
    });
    const data = await res.json().catch(() => undefined);
    if (res.ok) {
      if (!data || typeof data !== 'object') return { stage: 'error' };
      const saved = data as SavedIntakeAnswer;
      return { stage: saved.hardStopped ? 'stopped' : 'ready', data: saved };
    }
    if (isAdultsOnlyRefusal(res.status, data)) return localIntakeOutcome(answers);
    if ((data as { error?: unknown } | undefined)?.error === LEGACY_GUARDIAN_NEEDED) return { stage: 'guardian_needed' };
    return { stage: 'error' };
  } catch {
    return { stage: 'error' };
  }
}

/**
 * The verified adult's "mark cleared": the same single POST as always. 2xx → 'ready'; the adults-only 403 (an intake row
 * from before TEEN-WRITE-BLOCK on an account that isn't a verified adult) → the page-memory tick; anything else → 'error'.
 */
export async function clearOnce(fetchImpl: typeof fetch, intakeId: string): Promise<'ready' | typeof LOCAL_CLEARED | 'error'> {
  try {
    const res = await fetchImpl(INTAKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'clear', intakeId }),
    });
    const data = await res.json().catch(() => undefined);
    if (res.ok) return data === undefined ? 'error' : 'ready';
    return isAdultsOnlyRefusal(res.status, data) ? LOCAL_CLEARED : 'error';
  } catch {
    return 'error';
  }
}

// The screen's own lines for this path (FE PM's wording where the brief gives it).
/** On the first question, browser-only. */
export const BROWSER_ONLY_LINE = 'Your answers stay on this device; nothing is sent or saved.';
/** Under a red-flag stop that nothing was saved for. */
export const NOTHING_SAVED_LINE = 'Nothing you answered was saved.';
/** Above the Mirror once this path's intake was asked. */
export const NOT_KEPT_LINE = "We don't save health answers without a verified adult birth year. Nothing you answered was kept.";
/** Above the Mirror for a verified adult who chose 'No thanks, continue without saving'. */
export const DECLINED_LINE = "You chose not to save health answers. Nothing you answered was kept.";
/** The consent screen's second button (FE PM 19:56 PT). */
export const DECLINE_LABEL = 'No thanks, continue without saving';
