// lib/coach/availability.ts — COACH-AI Phase 8 (2026-10-07): an athlete's availability as their coach records it.
//
// WHY (lib/coach research item 5): health writes are verified-18+ only (lib/privacy/healthWriteGate.ts), so a teen can
// write no readiness check-in and no pain flag, and for a high-school roster the attention board's health lines are
// always empty. The coach still needs to say "she's out this week". This is that: Full / Limited / Out plus an
// optional expected return day. It works for any athlete on the coach's roster; it exists for the teens.
//
// NEVER A DIAGNOSIS, BY CONSTRUCTION. Three fixed values and a date. There is no note, reason, body part or free-text
// field anywhere — the route REFUSES a body that carries any other key (400 unexpected_field), so nothing a coach types
// can turn this into a medical record about a minor. The labels below say what it means for training, never why.
//
// NOT HEALTH DATA FROM THE ATHLETE. The athlete writes nothing; it never reads or writes HealthIntake, PainCheckIn,
// ReadinessCheckIn or HealthConsent (a test pins that), so the minors' health rules (canWriteHealthData) are untouched.
//
// WHO SEES IT, HOW LONG (assumption — the research item asked the owner; the Phase 8 approval named the feature, not
// these rules, so the strictest reasonable choice is taken): the coach who set it, and the athlete. Nobody else. Full
// is the ABSENCE of a row (setting Full deletes it); a status whose return day has passed reads as Full and is deleted
// on the coach's next look; ending the coaching relationship hides it, and deleting it (or the account) cascades.
//
// PURE: the server half is ./availabilityServer.ts.

export const AVAILABILITY_STATUSES = ['full', 'limited', 'out'] as const;
export type Availability = (typeof AVAILABILITY_STATUSES)[number];

/** How far ahead a return day may be set. assumption: 12 weeks — a season's break; longer is "Out" with no date. */
export const AVAILABILITY_MAX_DAYS_AHEAD = 84;

export const AVAILABILITY_LABEL: Record<Availability, { short: string; coach: string; athlete: string }> = {
  full: { short: 'Full', coach: 'Full — training as normal', athlete: 'Full — training as normal' },
  limited: { short: 'Limited', coach: 'Limited — lighter work for now', athlete: 'Limited — your coach is keeping your training lighter for now' },
  out: { short: 'Out', coach: 'Out — not training for now', athlete: 'Out — your coach has you off training for now' },
};

/** The only keys a set request may carry. */
const ALLOWED_KEYS = new Set(['clientId', 'status', 'returnBy']);

export type AvailabilityInputError = 'bad_body' | 'unexpected_field' | 'client_required' | 'bad_status' | 'bad_return_day' | 'return_day_past' | 'return_day_too_far';
export type AvailabilityInput =
  | { ok: true; clientId: string; status: Availability; returnBy: string | null }
  | { ok: false; error: AvailabilityInputError };

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** 'YYYY-MM-DD' → epoch day, or null when it is not a real calendar day. */
export function epochDay(day: string): number | null {
  if (!DAY.test(day)) return null;
  const t = Date.parse(`${day}T00:00:00Z`);
  if (!Number.isFinite(t)) return null;
  if (new Date(t).toISOString().slice(0, 10) !== day) return null; // 2026-02-30 is not a day
  return Math.round(t / 86_400_000);
}

/** Today as 'YYYY-MM-DD' (UTC). assumption: a day's edge in the athlete's own zone is not worth a time-zone field. */
export function todayDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function parseAvailabilityInput(body: unknown, today: string): AvailabilityInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'bad_body' };
  for (const k of Object.keys(body)) if (!ALLOWED_KEYS.has(k)) return { ok: false, error: 'unexpected_field' };
  const b = body as { clientId?: unknown; status?: unknown; returnBy?: unknown };
  if (typeof b.clientId !== 'string' || !b.clientId) return { ok: false, error: 'client_required' };
  if (typeof b.status !== 'string' || !(AVAILABILITY_STATUSES as readonly string[]).includes(b.status)) return { ok: false, error: 'bad_status' };
  const status = b.status as Availability;
  if (status === 'full' || b.returnBy === undefined || b.returnBy === null || b.returnBy === '') return { ok: true, clientId: b.clientId, status, returnBy: null };
  if (typeof b.returnBy !== 'string') return { ok: false, error: 'bad_return_day' };
  const d = epochDay(b.returnBy);
  const t = epochDay(today);
  if (d === null || t === null) return { ok: false, error: 'bad_return_day' };
  if (d < t) return { ok: false, error: 'return_day_past' };
  if (d - t > AVAILABILITY_MAX_DAYS_AHEAD) return { ok: false, error: 'return_day_too_far' };
  return { ok: true, clientId: b.clientId, status, returnBy: b.returnBy };
}

export interface AvailabilityRow { status: string; returnBy: string | null }
export interface AvailabilityView { status: Availability; returnBy: string | null }

/** A stored row → what it means today. No row, an unknown value, or a return day that has passed → Full. */
export function effectiveAvailability(row: AvailabilityRow | null | undefined, today: string): AvailabilityView {
  if (!row || (row.status !== 'limited' && row.status !== 'out')) return { status: 'full', returnBy: null };
  if (row.returnBy) {
    const d = epochDay(row.returnBy);
    const t = epochDay(today);
    if (d !== null && t !== null && d < t) return { status: 'full', returnBy: null };
  }
  return { status: row.status, returnBy: row.returnBy };
}

/** True when the row has run out (its return day is before today): the server deletes these. */
export function availabilityExpired(row: AvailabilityRow, today: string): boolean {
  return effectiveAvailability(row, today).status === 'full';
}

const RANK: Record<Availability, number> = { full: 0, limited: 1, out: 2 };

/** An athlete with two coaches sees the more careful of the two (Out over Limited), and its return day. */
export function mostCareful(views: readonly AvailabilityView[]): AvailabilityView {
  return views.reduce<AvailabilityView>((a, b) => (RANK[b.status] > RANK[a.status] ? b : a), { status: 'full', returnBy: null });
}

/** "Oct 20" from 'YYYY-MM-DD' (UTC, so the day never shifts). */
export function shortDay(day: string): string {
  const t = Date.parse(`${day}T00:00:00Z`);
  return Number.isFinite(t) ? new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : day;
}

/** The one line each side reads. */
export function availabilityLine(view: AvailabilityView, who: 'coach' | 'athlete'): string {
  const base = AVAILABILITY_LABEL[view.status][who];
  return view.status !== 'full' && view.returnBy ? `${base} · back ${shortDay(view.returnBy)}` : base;
}
