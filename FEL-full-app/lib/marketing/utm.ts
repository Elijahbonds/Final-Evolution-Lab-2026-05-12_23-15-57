// utm — ONB-04: where a visit came from, counted on FEL's own server, with no ad pixel and no cross-site id.
//
// Owner (ADVERTISEMENT / GROWTH, 2026-10-20): "privacy-first tracking, no ad pixels, UTM and referral codes counted on
// FEL's server". docs/PLATFORM-ROADMAP.md §6 "Privacy-first tracking". So:
//
//   READ       utm_source, utm_medium, utm_campaign and ref, on the first page view that carries any of them.
//   KEEP       first touch wins: the first tagged visit is kept on this browser (localStorage, first-party), for
//              ATTRIBUTION_TTL_DAYS, and a later tagged visit does not overwrite it. It holds the four tags and the day
//              they were seen — no id, no fingerprint, no page history, nothing another site can read.
//   ATTACH     the sign-up posts them (components/auth-form.tsx) and the server puts them on its own signup_complete
//              event (app/api/signup/route.ts). The first purchase is joined to that sign-up by account on the funnel
//              page (Order rows, status PAID) — nothing new is written at checkout.
//   COUNT      /admin/funnel shows sign-ups and first purchases by source / medium / campaign / ref.
//
// Values are cleaned to short tag-shaped strings before they are kept or posted: a tag is a campaign label, and an
// email address or a free-text sentence pasted into a URL is not one, so it is dropped rather than stored.
//
// Pure except captureFirstTouch / readFirstTouch, which take the storage they use.

export const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign'] as const;
/** localStorage key. First-party: only this origin can read it. */
export const ATTRIBUTION_KEY = 'fel:attribution';
/** (new) How long a first touch is kept before a later visit may start a new one. assumption: 30 days. */
export const ATTRIBUTION_TTL_DAYS = 30;
const DAY_MS = 86_400_000;

export interface Attribution {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  ref: string | null;
}

export interface StoredAttribution extends Attribution {
  /** The day it was first seen, YYYY-MM-DD (UTC). A day, not a time: enough to expire it, too coarse to track with. */
  day: string;
}

const TAG_MAX = 64;
const REF_MAX = 16; // the signup route's own `ref` cap

/** A campaign tag: lower case, letters, digits, `.`, `_`, `-`, `+` (spaces become `-`); anything with `@` is dropped. */
export function cleanTag(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim().toLowerCase();
  if (!t || t.includes('@')) return null;
  const s = t.replace(/\s+/g, '-').replace(/[^a-z0-9._+-]/g, '').slice(0, TAG_MAX);
  return s || null;
}

/** A referral code as the referral tables keep it: upper case letters and digits, at most REF_MAX. */
export function cleanRef(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  return s && s.length <= REF_MAX ? s : null;
}

export function cleanAttribution(raw: unknown): Attribution | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const a: Attribution = {
    source: cleanTag(r.source),
    medium: cleanTag(r.medium),
    campaign: cleanTag(r.campaign),
    ref: cleanRef(r.ref),
  };
  return a.source || a.medium || a.campaign || a.ref ? a : null;
}

/** The tags on a URL's query, or null when it carries none. */
export function attributionFromSearch(search: string | URLSearchParams): Attribution | null {
  const q = typeof search === 'string' ? new URLSearchParams(search) : search;
  return cleanAttribution({
    source: q.get('utm_source'),
    medium: q.get('utm_medium'),
    campaign: q.get('utm_campaign'),
    ref: q.get('ref'),
  });
}

export const dayOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

function expired(day: string, now: number): boolean {
  const t = Date.parse(`${day}T00:00:00Z`);
  return !Number.isFinite(t) || now - t > ATTRIBUTION_TTL_DAYS * DAY_MS;
}

type Store = Pick<Storage, 'getItem' | 'setItem'>;

/** The kept first touch, or null (none, expired, unreadable, or a blocked store). */
export function readFirstTouch(store: Pick<Storage, 'getItem'> | null, now: number = Date.now()): StoredAttribution | null {
  try {
    const raw = store?.getItem(ATTRIBUTION_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as Record<string, unknown>;
    const a = cleanAttribution(j);
    const day = typeof j.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(j.day) ? j.day : null;
    if (!a || !day || expired(day, now)) return null;
    return { ...a, day };
  } catch {
    return null;
  }
}

/**
 * The first page view: keep this visit's tags unless a live first touch is already kept. Returns what is kept after
 * the call. Never throws: a private window or a blocked store keeps nothing and the visit goes on.
 */
export function captureFirstTouch(search: string, store: Store | null, now: number = Date.now()): StoredAttribution | null {
  const kept = readFirstTouch(store, now);
  if (kept) return kept;
  const seen = attributionFromSearch(search);
  if (!seen) return null;
  const next: StoredAttribution = { ...seen, day: dayOf(now) };
  try { store?.setItem(ATTRIBUTION_KEY, JSON.stringify(next)); } catch { /* not kept: nothing else happens */ }
  return next;
}

/** What the sign-up posts: the four tags only (never the day), or undefined when there is nothing to say. */
export function signupAttribution(kept: Attribution | null): Attribution | undefined {
  return kept ? { source: kept.source, medium: kept.medium, campaign: kept.campaign, ref: kept.ref } : undefined;
}

/** The props the server adds to its signup_complete event. Flat, so the funnel reads them without a JSON path. */
export interface AttributionProps {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmRef?: string;
}

export function attributionProps(a: Attribution | null): AttributionProps {
  if (!a) return {};
  return {
    ...(a.source ? { utmSource: a.source } : {}),
    ...(a.medium ? { utmMedium: a.medium } : {}),
    ...(a.campaign ? { utmCampaign: a.campaign } : {}),
    ...(a.ref ? { utmRef: a.ref } : {}),
  };
}

// ── the funnel's count ─────────────────────────────────────────────────────────────────────────────────────────────

export interface SignupRow { userId: string | null; props: unknown }
export interface OrderRow { userId: string; amount: number; createdAt: Date }

export interface AttributionLine {
  source: string;
  medium: string;
  campaign: string;
  ref: string;
  signups: number;
  /** Of those sign-ups, how many have made a first purchase (a PAID order). */
  purchasers: number;
  /** The first purchases' total, in cents. */
  firstPurchaseCents: number;
}

/** "(none)" for a tag a visit did not carry. Direct visits (no tags at all) are one line of their own. */
export const NONE = '(none)';

/** Sign-ups by source / medium / campaign / ref, each with its first purchase joined by account. Most sign-ups first. */
export function attributionReport(signups: readonly SignupRow[], paidOrders: readonly OrderRow[]): AttributionLine[] {
  const first = new Map<string, OrderRow>();
  for (const o of paidOrders) {
    const f = first.get(o.userId);
    if (!f || o.createdAt < f.createdAt) first.set(o.userId, o);
  }
  const lines = new Map<string, AttributionLine>();
  const seenUsers = new Set<string>();
  for (const s of signups) {
    if (s.userId) {
      if (seenUsers.has(s.userId)) continue;
      seenUsers.add(s.userId);
    }
    const p = (s.props && typeof s.props === 'object' ? s.props : {}) as Record<string, unknown>;
    const key = {
      source: cleanTag(p.utmSource) ?? NONE,
      medium: cleanTag(p.utmMedium) ?? NONE,
      campaign: cleanTag(p.utmCampaign) ?? NONE,
      ref: cleanRef(p.utmRef) ?? NONE,
    };
    const k = `${key.source}|${key.medium}|${key.campaign}|${key.ref}`;
    const line = lines.get(k) ?? { ...key, signups: 0, purchasers: 0, firstPurchaseCents: 0 };
    line.signups += 1;
    const o = s.userId ? first.get(s.userId) : undefined;
    if (o) { line.purchasers += 1; line.firstPurchaseCents += Math.max(0, o.amount); }
    lines.set(k, line);
  }
  return [...lines.values()].sort((a, b) => b.signups - a.signups || b.purchasers - a.purchasers || a.source.localeCompare(b.source));
}
