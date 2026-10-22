/**
 * FEL Creator Platform — the only catalog of team profiles, services and the media kit.
 *
 * SLIM DOWN (owner, 2026-10-13): this platform is team profiles, the media kit, "Work with us" and the inquiry form.
 * The slot/booking engine, its checkout, merch (Printful), payouts (Connect) and Instagram stats are gone. A "Book"
 * button sends the buyer to the existing COACH STORE (`/coach/<coachStoreSlug>`), which is adults-only and owns
 * pricing, slots, terms and refunds. Nothing here is priced or sold.
 *
 * Same shape of rule as lib/books/bookCatalog.ts: nothing is read from the browser, and every number that
 * could look like a decision is an EXAMPLE until Elijah replaces it.
 *
 * - `approved: false` entries never render. A profile that is not approved hides everything under it.
 * - Bios, specialties and stats are pending confirmation. Do not replace them with invented copy in a code change;
 *   paste the real text.
 * - Media-kit package rates are EXAMPLE (`priceIsExample`) until the owner sets real ones.
 */

import { PARTNERS } from '@/lib/books/bookCatalog';

export interface CreatorLink {
  label: string;
  href: string;
}

/** A thing this person does, listed on their profile. Information only: it has no price and is not bookable here. */
export interface CreatorService {
  /** Globally unique. `<profileSlug>:<service>`. */
  id: string;
  profileSlug: string;
  name: string;
  description: string;
  durationMinutes: number;
  approved: boolean;
}

export interface CreatorStat {
  label: string;
  value: string;
  isExample: boolean;
}

export interface CreatorProfile {
  slug: string;
  name: string;
  approved: boolean;
  /** Public image path or null for the initials tile. */
  photoUrl: string | null;
  /** Public profile copy. Keep generic until Elijah replaces this. */
  bio: string;
  specialty: string;
  reels: CreatorLink[];
  socials: CreatorLink[];
  /**
   * The coach-store slug (`/coach/<slug>`) this person books through, or null when they are not in the coach store.
   * The "Book" buttons link there; the coach store is adults-only and checks the age itself.
   */
  coachStoreSlug: string | null;
  services: CreatorService[];
  stats: CreatorStat[];
}

export interface MediaKitPackage {
  id: string;
  name: string;
  detail: string;
  priceCents: number;
  priceIsExample: boolean;
}

export interface MediaKit {
  profileSlug: string;
  highlights: string[];
  highlightsArePlaceholder: boolean;
  /** Names only. Confirm each before the kit goes to a brand (`partnersConfirmed`). */
  pastPartners: string[];
  partnersConfirmed: boolean;
  packages: MediaKitPackage[];
}

/**
 * The audience numbers on the media kit. FIXTURE, not a connection to Instagram (that stub is gone): every value is
 * an example and the page shows an "Example data" badge until the owner pastes real numbers.
 */
export interface AudienceStats {
  isExample: boolean;
  stats: Array<{ label: string; value: string }>;
}

export const EXAMPLE_RATE_NOTE = 'EXAMPLE — draft rate pending Elijah\'s decision. Not a live price.';
export const PUBLIC_PROFILE_BIO_FALLBACK = 'Profile details are being confirmed with the Final Evolution Lab team.';
export const PUBLIC_PROFILE_SPECIALTY_FALLBACK = 'Final Evolution Lab sessions and creative collaborations';
export const PUBLIC_SERVICE_NAME_FALLBACK = 'FEL team session';
export const PUBLIC_SERVICE_DESCRIPTION_FALLBACK = 'Scope is confirmed before booking or quoting.';
export const PUBLIC_MEDIA_KIT_HIGHLIGHT_FALLBACK = 'Partner-facing highlights are confirmed during inquiry.';
export const PUBLIC_MEDIA_KIT_PACKAGE_FALLBACK = 'Deliverables and usage terms are confirmed during inquiry.';

const PLACEHOLDER_COPY = /\bplaceholder\b/i;
const EXAMPLE_SUFFIX = /\s*\(EXAMPLE\)\s*$/i;

export function publicCreatorCopy(value: string | null | undefined, fallback: string): string {
  const trimmed = (value ?? '').trim();
  return trimmed && !PLACEHOLDER_COPY.test(trimmed) ? trimmed : fallback;
}

export const AUDIENCE_STATS: AudienceStats = {
  isExample: true,
  stats: [
    { label: 'Followers', value: '12,345' },
    { label: 'Avg. reel views', value: '6,789' },
    { label: 'Engagement rate', value: '4.2%' },
    { label: 'Top audience', value: 'US · 18–34' },
  ],
};

function service(input: Omit<CreatorService, 'approved'> & { approved?: boolean }): CreatorService {
  return { ...input, approved: input.approved ?? true };
}

export const PROFILES: readonly CreatorProfile[] = [
  {
    slug: 'elijah-bonds',
    name: 'Elijah Bonds',
    approved: true,
    photoUrl: null,
    bio: 'Bio details are pending confirmation.',
    specialty: 'Services and collaborations through Final Evolution Lab.',
    reels: [],
    socials: [
      { label: 'Books on FEL Press', href: '/press' },
      { label: 'Amazon author page', href: 'https://www.amazon.com/Elijah-Bonds/e/B0H63J1Q7B' },
    ],
    // The coach-store page /coach/elijahbonds (the store terms name it). Book buttons go there.
    coachStoreSlug: 'elijahbonds',
    services: [
      service({
        id: 'elijah-bonds:session-60',
        profileSlug: 'elijah-bonds',
        name: '1-on-1 session (EXAMPLE)',
        description: 'Details are confirmed through the coach store.',
        durationMinutes: 60,
      }),
      service({
        id: 'elijah-bonds:consult-30',
        profileSlug: 'elijah-bonds',
        name: 'Consult call (EXAMPLE)',
        description: 'Details are confirmed through the coach store.',
        durationMinutes: 30,
      }),
    ],
    stats: [
      { label: 'Confirmed stat', value: 'EXAMPLE', isExample: true },
    ],
  },
  {
    // Shows the approval gate. Not a real person; never renders.
    slug: 'example-teammate',
    name: 'Example Teammate',
    approved: false,
    photoUrl: null,
    bio: 'Bio details are pending confirmation.',
    specialty: 'Services and collaborations through Final Evolution Lab.',
    reels: [],
    socials: [],
    coachStoreSlug: null,
    services: [
      service({
        id: 'example-teammate:session-60',
        profileSlug: 'example-teammate',
        name: 'Session (EXAMPLE)',
        description: 'Details are confirmed through the coach store.',
        durationMinutes: 60,
      }),
    ],
    stats: [{ label: 'Confirmed stat', value: 'EXAMPLE', isExample: true }],
  },
];

export const MEDIA_KIT: MediaKit = {
  profileSlug: 'elijah-bonds',
  highlights: ['Highlights are pending confirmation.'],
  highlightsArePlaceholder: true,
  // Taken from the Press partner links, which are real links. Whether each counts as a past partner for a
  // brand deck is Elijah's call, so the kit marks the list unconfirmed.
  pastPartners: PARTNERS.map((p) => p.name),
  partnersConfirmed: false,
  packages: [
    { id: 'reel', name: 'Sponsored reel (EXAMPLE)', detail: 'Scope is confirmed by inquiry before any offer.', priceCents: 100000, priceIsExample: true },
    { id: 'story-set', name: 'Story set (EXAMPLE)', detail: 'Scope is confirmed by inquiry before any offer.', priceCents: 50000, priceIsExample: true },
    { id: 'appearance', name: 'Event appearance (EXAMPLE)', detail: 'Scope is confirmed by inquiry before any offer.', priceCents: 250000, priceIsExample: true },
  ],
};

function assertCatalog(profiles: readonly CreatorProfile[]): void {
  const slugs = new Set<string>();
  const serviceIds = new Set<string>();
  for (const p of profiles) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(p.slug)) throw new Error(`bad profile slug ${p.slug}`);
    if (slugs.has(p.slug)) throw new Error(`duplicate profile ${p.slug}`);
    slugs.add(p.slug);
    if (p.bio.trim() === '') throw new Error(`${p.slug} needs a bio line`);
    if (p.coachStoreSlug != null && !/^[a-z0-9][a-z0-9-]*$/.test(p.coachStoreSlug)) throw new Error(`bad coach-store slug on ${p.slug}`);
    for (const s of p.services) {
      if (s.profileSlug !== p.slug || !s.id.startsWith(`${p.slug}:`)) throw new Error(`service ${s.id} is on the wrong profile`);
      if (serviceIds.has(s.id)) throw new Error(`duplicate service ${s.id}`);
      serviceIds.add(s.id);
      if (!Number.isInteger(s.durationMinutes) || s.durationMinutes <= 0) throw new Error(`bad duration on ${s.id}`);
    }
  }
}

assertCatalog(PROFILES);

/** Approved profiles only. Unapproved entries never render. */
export function approvedProfiles(): CreatorProfile[] {
  return PROFILES.filter((p) => p.approved);
}

/** Undefined for an unknown or unapproved slug, so the page 404s either way. */
export function getApprovedProfile(slug: string): CreatorProfile | undefined {
  return PROFILES.find((p) => p.slug === slug && p.approved);
}

export function approvedServices(profile: CreatorProfile): CreatorService[] {
  return profile.approved ? profile.services.filter((s) => s.approved) : [];
}

export function publicProfileBio(profile: CreatorProfile | undefined): string {
  return publicCreatorCopy(profile?.bio, PUBLIC_PROFILE_BIO_FALLBACK);
}

export function publicProfileSpecialty(profile: CreatorProfile): string {
  return publicCreatorCopy(profile.specialty, PUBLIC_PROFILE_SPECIALTY_FALLBACK);
}

export function publicServiceName(service: CreatorService): string {
  return publicCreatorCopy(service.name.replace(EXAMPLE_SUFFIX, ''), PUBLIC_SERVICE_NAME_FALLBACK);
}

export function publicServiceDescription(service: CreatorService): string {
  return publicCreatorCopy(service.description, PUBLIC_SERVICE_DESCRIPTION_FALLBACK);
}

export function publicMediaKitHighlight(highlight: string): string {
  return publicCreatorCopy(highlight, PUBLIC_MEDIA_KIT_HIGHLIGHT_FALLBACK);
}

export function publicMediaKitPackageDetail(pkg: MediaKitPackage): string {
  return publicCreatorCopy(pkg.detail, PUBLIC_MEDIA_KIT_PACKAGE_FALLBACK);
}

/**
 * Where a "Book" button goes: the coach store's page for this person (`/coach/<slug>`), which lists what they sell and
 * is adults-only (sign-in, 18+, store terms are enforced there). Null when the profile is not in the coach store, or
 * is not approved, so no Book button renders.
 */
export function coachStoreBookHref(profile: CreatorProfile): string | null {
  if (!profile.approved || !profile.coachStoreSlug) return null;
  return `/coach/${profile.coachStoreSlug}`;
}

export function mediaKitProfile(): CreatorProfile | undefined {
  return getApprovedProfile(MEDIA_KIT.profileSlug);
}
