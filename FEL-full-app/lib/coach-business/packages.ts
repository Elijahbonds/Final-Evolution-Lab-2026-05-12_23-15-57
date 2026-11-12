// lib/coach-business/packages.ts — COACH-BUSINESS: the offers a coach sells (owner, 2026-10-25): monthly online
// coaching, a session pack, a single review, a program. Each has a price, what is included, and a capacity.
//
// Pure: validation of what a coach typed, the spots left, and which button a package shows. The server stores packages
// in raw SQL (store.ts) and the checkout re-checks every rule here before Stripe is asked for anything.
import { PACKAGE_MAX_CENTS, PACKAGE_MIN_CENTS } from './config';

// COACH-DELIVERY COA-12 (2026-10-27): 'team_fee' — a one-off fee a coach sends to their roster or a team (lib/coach-business/
// teamFee.ts). It is never listed on the public page or in find-a-coach (store.ts activePackagesFor leaves it out).
export const PACKAGE_KINDS = ['monthly', 'session_pack', 'single_review', 'program', 'team_fee'] as const;
export type PackageKind = (typeof PACKAGE_KINDS)[number];

export const PACKAGE_KIND_LABELS: Record<PackageKind, string> = {
  monthly: 'Monthly online coaching',
  session_pack: 'Session pack',
  single_review: 'Single review',
  program: 'Program',
  team_fee: 'Team fee',
};

/** How the price reads: monthly bills every month, the rest once. */
export function billingOf(kind: PackageKind): 'month' | 'once' {
  return kind === 'monthly' ? 'month' : 'once';
}

export const TITLE_MAX = 80;
export const SUMMARY_MAX = 280;
export const INCLUDES_MAX = 8;
export const INCLUDE_MAX = 80;
export const CAPACITY_MAX = 500;
export const SESSIONS_MAX = 50;
export const PACKAGES_PER_COACH_MAX = 12;

export interface PackageInput {
  kind: PackageKind;
  title: string;
  summary: string;
  priceCents: number;
  includes: string[];
  /** Open spots at once; null = no limit. */
  capacity: number | null;
  /** Session packs only: how many sessions. */
  sessions: number | null;
  active: boolean;
}

export interface CoachPackage extends PackageInput {
  id: string;
  coachId: string;
  sortOrder: number;
}

export type PackageParse = { ok: true; value: PackageInput } | { ok: false; error: string; field: keyof PackageInput | 'body' };

const clean = (v: unknown): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');
const intOrNull = (v: unknown): number | null | 'bad' => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isSafeInteger(n) ? n : 'bad';
};

/** Read what the coach sent. Every field is checked; nothing unknown is kept. */
export function parsePackageInput(body: unknown): PackageParse {
  if (!body || typeof body !== 'object') return { ok: false, error: 'invalid_body', field: 'body' };
  const b = body as Record<string, unknown>;
  const kind = b.kind;
  if (typeof kind !== 'string' || !(PACKAGE_KINDS as readonly string[]).includes(kind)) return { ok: false, error: 'invalid_kind', field: 'kind' };
  const title = clean(b.title);
  if (title.length < 3 || title.length > TITLE_MAX) return { ok: false, error: 'invalid_title', field: 'title' };
  const summary = clean(b.summary);
  if (summary.length > SUMMARY_MAX) return { ok: false, error: 'invalid_summary', field: 'summary' };
  const price = intOrNull(b.priceCents);
  if (price === null || price === 'bad' || price < PACKAGE_MIN_CENTS || price > PACKAGE_MAX_CENTS) return { ok: false, error: 'invalid_price', field: 'priceCents' };
  if (!Array.isArray(b.includes)) return { ok: false, error: 'invalid_includes', field: 'includes' };
  const includes = b.includes.map(clean).filter(Boolean);
  if (includes.length < 1 || includes.length > INCLUDES_MAX || includes.some((s) => s.length > INCLUDE_MAX)) {
    return { ok: false, error: 'invalid_includes', field: 'includes' };
  }
  const capacity = intOrNull(b.capacity);
  if (capacity === 'bad' || (capacity !== null && (capacity < 1 || capacity > CAPACITY_MAX))) return { ok: false, error: 'invalid_capacity', field: 'capacity' };
  const sessions = intOrNull(b.sessions);
  if (kind === 'session_pack') {
    if (sessions === null || sessions === 'bad' || sessions < 1 || sessions > SESSIONS_MAX) return { ok: false, error: 'invalid_sessions', field: 'sessions' };
  } else if (sessions !== null) {
    return { ok: false, error: 'invalid_sessions', field: 'sessions' };
  }
  const active = b.active === undefined ? true : b.active === true;
  return { ok: true, value: { kind: kind as PackageKind, title, summary, priceCents: price, includes, capacity, sessions: sessions as number | null, active } };
}

/** Spots still open: null when the package has no limit. Never negative. */
export function spotsLeft(capacity: number | null, taken: number): number | null {
  if (capacity === null) return null;
  return Math.max(0, capacity - Math.max(0, taken));
}

/** `$120.00 / month` or `$40.00`. */
export function packagePriceLabel(priceCents: number, kind: PackageKind): string {
  const money = `$${(priceCents / 100).toFixed(2)}`;
  return billingOf(kind) === 'month' ? `${money} / month` : money;
}

/**
 * Which button a package shows on the coach's public page:
 *   book              — payments are live for this coach (switch on, Stripe ready, plan allows) and a spot is open;
 *   apply             — anything else that is open: the client applies and the coach replies;
 *   full              — capacity reached.
 * `paymentsLive` is the page-wide state; `coachCanCharge` is this coach's (Connect ready and the plan allows payments).
 */
export type PackageAction = 'book' | 'apply' | 'full';

export function packageAction(input: { paymentsLive: boolean; coachCanCharge: boolean; spotsLeft: number | null; active: boolean }): PackageAction | null {
  if (!input.active) return null;
  if (input.spotsLeft !== null && input.spotsLeft <= 0) return 'full';
  return input.paymentsLive && input.coachCanCharge ? 'book' : 'apply';
}
