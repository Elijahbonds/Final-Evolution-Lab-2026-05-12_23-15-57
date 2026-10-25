// lib/consent/wording.ts — SAFETY lane (SAF-02 / SAF-03, 2026-10-25): what a guardian is asked, which version that is,
// and the re-ask for consents given under older words.
//
// THE WORDING SLOT. The words a guardian reads come from ONE list, GUARDIAN_CONSENT_COVERS (lib/consent/guardianGate.ts:
// today's live line, a camp plan going live) plus, for each new scope, a line from GUARDIAN_CONSENT_DRAFT below — and a
// draft line joins the list ONLY when its go-live date is set (COACH_TRAINING_CONSENT_SINCE in lib/coach/coachConsent.ts,
// SQUADS_CONSENT_SINCE in lib/groups/gates.ts). Both dates are null, so the live list is exactly today's and no guardian
// is shown a draft. The draft lines are PLACEHOLDERS, marked TODO(owner): the words are the owner's and counsel's
// (OWN-03; proposals in docs/COACH-LOOP.md §1 and docs/TEAMS-SQUADS.md §3). Go-live = put the approved words in the
// draft line, set the date, ship together (the tests in tests/consent/reask.test.ts pin that a placeholder can never go
// live: liveCovers refuses a line still marked as one).
//
// THE VERSION (SAF-03). The request route stamps liveWordingVersion() on the new row (stampWordingVersion, raw SQL
// behind the pendingSchema seam: a no-op until prisma/pending/2026-10-25-guardian-consent-wording.sql is applied, then
// on within ~5 minutes). The accept page shows the words OF THE ROW'S version, so a guardian reads exactly what the gates
// will judge the yes by.
//
// THE RE-ASK (SAF-02). A teen whose current consent is accepted but asked under older words is refused by the new gate.
// reaskState() says whether they may send a fresh request for a live scope; POST /api/consent/reask makes it from the
// guardian details already on file (the teen types nothing), as a player request (selfRequested) — so the accept rules
// of P6 apply unchanged.
import { pendingProbe, type RawDb } from '@/lib/coach/pendingSchema';
import { COACH_TRAINING_CONSENT_SINCE } from '@/lib/coach/coachConsent';
import { SQUADS_CONSENT_SINCE } from '@/lib/groups/gates';
import { GUARDIAN_CONSENT_COVERS, guardianStatus, type GuardianConsentLike } from './guardianGate';
import { consentCovers, versionFor, WORDING_VERSIONS, type GuardianScope } from './wordingVersions';

export type { GuardianScope } from './wordingVersions';

/** Marks a line the owner has not written yet. A line containing it can never be live (liveCovers throws). */
export const OWNER_WORDING_TODO = 'TODO(owner): OWN-03';

export interface CoverLine { unlocks: GuardianScope; words: string }

/**
 * TODO(owner): OWN-03 — the guardian wording for the two new scopes. PLACEHOLDERS, NOT LIVE. Replace each `words` with
 * the approved sentence fragment (it is read as "Before {name} can <words>, we ask a parent or guardian…"), delete the
 * marker, then set the scope's date. Drafts to start from: docs/COACH-LOOP.md §1 and docs/TEAMS-SQUADS.md §3.
 */
export const GUARDIAN_CONSENT_DRAFT: readonly CoverLine[] = [
  { unlocks: 'coach_training', words: `[${OWNER_WORDING_TODO} coach roster and training wording, docs/COACH-LOOP.md §1]` },
  { unlocks: 'squads', words: `[${OWNER_WORDING_TODO} squads wording, docs/TEAMS-SQUADS.md §3]` },
];

export interface ScopeDates { coachTraining: Date | null; squads: Date | null }
export const LIVE_DATES: ScopeDates = { coachTraining: COACH_TRAINING_CONSENT_SINCE, squads: SQUADS_CONSENT_SINCE };

/** The lines a guardian is shown for a request made now: today's line, plus each new scope whose date is set. */
export function liveCovers(dates: ScopeDates = LIVE_DATES, draft: readonly CoverLine[] = GUARDIAN_CONSENT_DRAFT): CoverLine[] {
  const out: CoverLine[] = [...GUARDIAN_CONSENT_COVERS];
  for (const line of draft) {
    const on = line.unlocks === 'coach_training' ? dates.coachTraining : line.unlocks === 'squads' ? dates.squads : null;
    if (on == null) continue;
    if (line.words.includes(OWNER_WORDING_TODO)) {
      throw new Error(`guardian wording for ${line.unlocks} is still a placeholder; it cannot go live (OWN-03)`);
    }
    out.push(line);
  }
  return out;
}

/** The version a request made now is asked under. */
export function liveWordingVersion(dates: ScopeDates = LIVE_DATES): number {
  return versionFor({ coachTraining: dates.coachTraining != null, squads: dates.squads != null });
}

/** The lines a stored version was asked with (null/unknown version → the live lines, which is what the page showed). */
export function coversForVersion(version: number | null | undefined, dates: ScopeDates = LIVE_DATES, draft: readonly CoverLine[] = GUARDIAN_CONSENT_DRAFT): CoverLine[] {
  const scopes = typeof version === 'number' ? WORDING_VERSIONS[version] : undefined;
  if (!scopes) return liveCovers(dates, draft);
  return [...GUARDIAN_CONSENT_COVERS, ...draft.filter((l) => scopes.includes(l.unlocks))];
}

/** "FEL is a training app. Before Sam can a, b or c, we ask a parent or guardian to confirm that's OK." */
export function askFor(menteeName: string, lines: readonly CoverLine[]): string {
  const w = lines.map((c) => c.words);
  const list = w.length > 1 ? `${w.slice(0, -1).join(', ')} or ${w[w.length - 1]}` : w[0];
  return `FEL is a training app. Before ${menteeName} can ${list}, we ask a parent or guardian to confirm that's OK.`;
}

// ── the version column (pending SQL) ────────────────────────────────────────────────────────────────────────────────

const PROBE_SQL =
  `SELECT 1 AS "ok" FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'GuardianConsent' AND column_name = 'wordingVersion' LIMIT 1`;
const probe = pendingProbe('guardian_wording', PROBE_SQL);
/** Tests only. */
export function resetWordingProbe(): void { probe.reset(); }

/** Record the version a new request was asked under. Best effort: a row without one is judged by its date. */
export async function stampWordingVersion(db: RawDb, consentId: string, version: number = liveWordingVersion()): Promise<boolean> {
  if (!(await probe.ready(db))) return false;
  try {
    await db.$executeRawUnsafe(`UPDATE "GuardianConsent" SET "wordingVersion" = $1 WHERE "id" = $2`, version, consentId);
    return true;
  } catch (e) {
    probe.fail('guardian_wording_stamp_failed', e);
    return false;
  }
}

/** consentId → recorded version, for the rows that have one. Empty until the SQL is applied. Never throws. */
export async function readWordingVersions(db: RawDb, consentIds: readonly string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!consentIds.length || !(await probe.ready(db))) return out;
  try {
    const rows = await db.$queryRawUnsafe<{ id: string; wordingVersion: number | null }[]>(
      `SELECT "id", "wordingVersion" FROM "GuardianConsent" WHERE "id" = ANY($1::text[]) AND "wordingVersion" IS NOT NULL`, [...consentIds],
    );
    for (const r of rows ?? []) if (typeof r.wordingVersion === 'number') out.set(r.id, r.wordingVersion);
  } catch (e) {
    probe.fail('guardian_wording_read_failed', e);
  }
  return out;
}

/** The rows with their recorded versions attached, for a reader that selects `id` (one line at a gate's read). */
export async function withWordingVersions<T extends { id: string }>(db: RawDb, rows: readonly T[]): Promise<(T & { wordingVersion: number | null })[]> {
  const v = await readWordingVersions(db, rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, wordingVersion: v.get(r.id) ?? null }));
}

// ── the re-ask ──────────────────────────────────────────────────────────────────────────────────────────────────────

export type ReaskScope = Exclude<GuardianScope, 'camp_plan'>;
export type ReaskState =
  | { state: 'not_live' }          // the scope's wording is not live: there is nothing a guardian could say yes to
  | { state: 'covered' }           // the current consent already covers it
  | { state: 'pending' }           // a request is already waiting for the guardian
  | { state: 'no_guardian' }       // nothing accepted on file to re-ask from: the first ask (/consent/guardian) is the door
  | { state: 'reask'; from: GuardianConsentLike & { id: string } };

/**
 * May this teen re-ask for `scope`? Only when the scope is live, the newest consent is accepted (so there is a
 * guardian on file to ask again) and it does not cover the scope. Pure.
 */
export function reaskState<T extends GuardianConsentLike & { id: string }>(scope: ReaskScope, consents: readonly T[], dates: ScopeDates = LIVE_DATES): ReaskState {
  const since = scope === 'coach_training' ? dates.coachTraining : dates.squads;
  if (since == null) return { state: 'not_live' };
  const status = guardianStatus(consents);
  if (status === 'pending') return { state: 'pending' };
  if (status !== 'accepted') return { state: 'no_guardian' };
  const latest = consents.reduce((a, b) => (b.requestedAt > a.requestedAt ? b : a));
  if (consentCovers(latest, scope, since)) return { state: 'covered' };
  return { state: 'reask', from: latest };
}
