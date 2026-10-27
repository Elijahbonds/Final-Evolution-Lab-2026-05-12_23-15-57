// lib/coach/schedule/rules.ts — COACH-DELIVERY COA-05 (2026-10-26): roster sessions on a coach's calendar (not paid
// bookings: those stay the coach store's, lib/coach-store/slots.ts). The pure half: what a coach typed, who a session
// reaches, the clash check.
//
// A session is a title, a start (an instant; the browser sends it from the coach's own clock), a length, an optional place
// (a venue name — a street address is refused, the coach store's own rule: lib/coach-store/address.ts addressRejected), and
// who it is for: the whole roster, one athlete, or a team the coach runs (a team reaches only its members on the coach's
// live roster, docs/COACH-LOOP.md §3).
//
// THE CLASH CHECK. A coach's sessions may not overlap each other, nor a HELD or PAID coach-store booking of theirs — the
// same busy rule as the store's slot check (lib/coach-store/slotCheck.ts: bookings with a slot lock and status HELD/PAID
// are busy; start < other end AND other start < end). A cancelled session is not busy.
//
// Pure.
import { addressRejected } from '@/lib/coach-store/address';
import type { BusyRange } from '@/lib/coach-store/slots';

export type SessionScope = 'roster' | 'athlete' | 'team';

export const LIMITS = { title: 80, place: 80, minMinutes: 15, maxMinutes: 480, daysAhead: 365, perCoachUpcoming: 300 } as const;

export interface CleanSession { title: string; startsAt: Date; minutes: number; place: string | null; scope: SessionScope; scopeId: string | null }
export type SessionError = 'title_required' | 'starts_at' | 'in_the_past' | 'too_far_ahead' | 'minutes' | 'place_address' | 'scope';

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

export function cleanSession(body: unknown, now: Date = new Date()): { ok: true; s: CleanSession } | { ok: false; error: SessionError } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const title = text(b.title, LIMITS.title);
  if (!title) return { ok: false, error: 'title_required' };
  const startsAt = typeof b.startsAt === 'string' ? new Date(b.startsAt) : null;
  if (!startsAt || Number.isNaN(startsAt.getTime())) return { ok: false, error: 'starts_at' };
  if (startsAt.getTime() < now.getTime() - 60 * 60_000) return { ok: false, error: 'in_the_past' };
  if (startsAt.getTime() > now.getTime() + LIMITS.daysAhead * 86_400_000) return { ok: false, error: 'too_far_ahead' };
  const minutes = b.minutes;
  if (typeof minutes !== 'number' || !Number.isInteger(minutes) || minutes < LIMITS.minMinutes || minutes > LIMITS.maxMinutes) return { ok: false, error: 'minutes' };
  const place = text(b.place, LIMITS.place) || null;
  if (place && addressRejected(place)) return { ok: false, error: 'place_address' };
  const scope = (b.scope ?? 'roster') as SessionScope;
  if (scope !== 'roster' && scope !== 'athlete' && scope !== 'team') return { ok: false, error: 'scope' };
  const scopeId = scope === 'roster' ? null : typeof b.scopeId === 'string' && b.scopeId && b.scopeId.length <= 64 ? b.scopeId : null;
  if (scope !== 'roster' && !scopeId) return { ok: false, error: 'scope' };
  return { ok: true, s: { title, startsAt, minutes, place, scope, scopeId } };
}

export const endOf = (s: { startsAt: Date; minutes: number }): Date => new Date(s.startsAt.getTime() + s.minutes * 60_000);

/** The first busy range this session overlaps, or null (the store's overlap rule). */
export function clashWith(s: { startsAt: Date; minutes: number }, busy: readonly BusyRange[]): BusyRange | null {
  const a0 = s.startsAt.getTime(), a1 = endOf(s).getTime();
  return busy.find((b) => a0 < b.endsAt.getTime() && b.startsAt.getTime() < a1) ?? null;
}

/** Does a session reach this athlete? (the athlete's own view and feed) */
export function reaches(s: { scope: SessionScope; scopeId: string | null }, athleteId: string, teamIds: readonly string[]): boolean {
  if (s.scope === 'roster') return true;
  if (s.scope === 'athlete') return s.scopeId === athleteId;
  return !!s.scopeId && teamIds.includes(s.scopeId);
}

export const SCHEDULE_ERROR_COPY: Record<SessionError | 'clash' | 'not_your_athlete' | 'not_your_team', string> = {
  title_required: 'Give the session a name.', starts_at: 'Pick a start time.', in_the_past: 'That time has passed.', too_far_ahead: 'Up to a year ahead.',
  minutes: 'Between 15 minutes and 8 hours.', place_address: 'Use a venue name, not a street address.', scope: 'Pick who it is for.',
  clash: 'That overlaps another session or a booking of yours.', not_your_athlete: 'That athlete is not on your roster.', not_your_team: 'That is not a team you run.',
};
