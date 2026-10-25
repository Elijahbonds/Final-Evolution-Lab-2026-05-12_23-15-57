// lib/coach-business/profile.ts — COACH-BUSINESS: the coach's public page (/coach/[slug]) — who they are, what they
// sell, and results their clients chose to share.
//
// NO MINOR'S DATA, EVER. The page is public and indexed. The only client-derived thing on it is a RESULT HIGHLIGHT, and
// one is shown only when ALL of these hold at render time:
//   · the client approved that exact text (consentAt set) and has not withdrawn it (revokedAt null);
//   · the client was a verified adult when they approved it (consentAdult) AND is one now (the `adultClientIds` read from
//     User.dobYear on every render — a later correction of the birth year hides it at once);
// and even then the page shows the TEXT only: no name, no id, no photo, no date. Everything else on the page is the
// coach's own words and prices.
//
// Pure. app/coach/[slug]/page.tsx reads the rows, calls publicHighlights() and profileJsonLd(), and renders.
import { billingOf, packagePriceLabel, type CoachPackage, type PackageKind } from './packages';

export const HIGHLIGHT_MAX = 280;
export const BIO_MAX = 2000;
export const HEADLINE_MAX = 120;
export const SPECIALTIES_MAX = 8;
export const SPECIALTY_MAX = 40;

export interface HighlightRow {
  id: string;
  coachId: string;
  clientId: string;
  text: string;
  consentAt: Date | string | null;
  consentAdult: boolean;
  revokedAt: Date | string | null;
}

/** What the public page may show of a highlight: its words. */
export interface PublicHighlight { id: string; text: string }

export function publicHighlights(rows: readonly HighlightRow[], adultClientIds: ReadonlySet<string>): PublicHighlight[] {
  return rows
    .filter((r) => r.consentAt !== null && r.revokedAt === null && r.consentAdult === true && adultClientIds.has(r.clientId))
    .map((r) => ({ id: r.id, text: r.text.slice(0, HIGHLIGHT_MAX) }));
}

/** The client ids the page must age-check before showing any highlight. */
export function highlightClientIds(rows: readonly HighlightRow[]): string[] {
  return [...new Set(rows.filter((r) => r.consentAt !== null && r.revokedAt === null && r.consentAdult).map((r) => r.clientId))];
}

const SLUG = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;
/** Paths under /coach that a slug must never shadow (the coach store's list plus this lane's pages). */
export const RESERVED_COACH_SLUGS: ReadonlySet<string> = new Set([
  'admin', 'join', 'dashboard', 'receipt', 'business', 'highlight', 'thanks', 'review', 'session', 'programs', 'book',
  'api', 'new', 'settings', 'coaches', 'pro',
]);

export function slugOk(slug: string): boolean {
  return SLUG.test(slug) && !slug.includes('--') && !RESERVED_COACH_SLUGS.has(slug);
}

/** A starting slug from a display name: `Jordan Lee` → `jordan-lee`. The caller checks it is free. */
export function slugFromName(name: string): string {
  const s = name.toLowerCase().normalize('NFKD').replace(/[^\x00-\x7f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
  return s.length >= 3 ? s : `coach-${s || 'new'}`.slice(0, 40);
}

export interface PublicProfile {
  slug: string;
  displayName: string;
  headline: string | null;
  bio: string | null;
  specialties: string[];
  certifications: string[];
}

/** The page's description for search: the headline, else the start of the bio, else a plain line. ≤ 160 chars. */
export function profileDescription(p: PublicProfile): string {
  const base = p.headline?.trim() || p.bio?.trim() || `Train with ${p.displayName} on Final Evolution.`;
  const flat = base.replace(/\s+/g, ' ');
  return flat.length <= 160 ? flat : `${flat.slice(0, 157).trimEnd()}…`;
}

/**
 * schema.org JSON-LD for the page: the coach as a Person offering their packages. No rating is claimed (there is no
 * review system to back one). `<` is escaped so the coach's own text can never close the script tag.
 */
export function profileJsonLd(p: PublicProfile, packages: readonly Pick<CoachPackage, 'title' | 'priceCents' | 'kind' | 'summary'>[], url: string): string {
  const doc = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: p.displayName,
    jobTitle: 'Coach',
    url,
    ...(p.headline || p.bio ? { description: profileDescription(p) } : {}),
    ...(p.specialties.length ? { knowsAbout: p.specialties } : {}),
    ...(packages.length
      ? {
          makesOffer: packages.map((k) => ({
            '@type': 'Offer',
            name: k.title,
            ...(k.summary ? { description: k.summary } : {}),
            price: (k.priceCents / 100).toFixed(2),
            priceCurrency: 'USD',
            ...(billingOf(k.kind as PackageKind) === 'month'
              ? { priceSpecification: { '@type': 'UnitPriceSpecification', price: (k.priceCents / 100).toFixed(2), priceCurrency: 'USD', unitCode: 'MON' } }
              : {}),
          })),
        }
      : {}),
  };
  return JSON.stringify(doc).replace(/</g, '\\u003c');
}

export { packagePriceLabel };

/** Trim and bound what a coach typed for their profile. */
export function cleanProfileText(input: { headline?: unknown; bio?: unknown; specialties?: unknown; certifications?: unknown; displayName?: unknown }) {
  const s = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const list = (v: unknown) => (Array.isArray(v) ? v : [])
    .filter((x): x is string => typeof x === 'string')
    .map((x) => x.replace(/\s+/g, ' ').trim().slice(0, SPECIALTY_MAX))
    .filter(Boolean)
    .slice(0, SPECIALTIES_MAX);
  return {
    displayName: s(input.displayName, 60).replace(/\s+/g, ' '),
    headline: s(input.headline, HEADLINE_MAX).replace(/\s+/g, ' ') || null,
    bio: s(input.bio, BIO_MAX) || null,
    specialties: list(input.specialties),
    certifications: list(input.certifications),
  };
}
