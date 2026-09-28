/**
 * FEL Creator Platform — the only catalog of team profiles, services, products and the media kit.
 *
 * Same shape of rule as lib/books/bookCatalog.ts: nothing is read from the browser, and every number that
 * could look like a decision is an EXAMPLE until Elijah replaces it.
 *
 * - `approved: false` entries never render and cannot be booked or bought. A profile that is not approved
 *   hides everything under it, whatever its services say.
 * - Every price carries `priceIsExample: true`. Checkout labels those as EXAMPLE on the Stripe line item.
 * - Bios, specialties and stats are placeholders. Do not replace them with invented copy in a code change;
 *   paste the real text.
 * - Weekly hours are EXAMPLE hours (`hoursAreExample`). Slots are computed from them on the server.
 */

import { PARTNERS } from '@/lib/books/bookCatalog';

export type FulfillmentProviderId = 'printful' | 'printify' | 'manual';

export interface CreatorLink {
  label: string;
  href: string;
}

export interface CreatorService {
  /** Globally unique. `<profileSlug>:<service>`. */
  id: string;
  profileSlug: string;
  name: string;
  description: string;
  durationMinutes: number;
  /** EXAMPLE cents until `priceIsExample` is false. The "starting at" rate on the profile. */
  priceCents: number;
  priceIsExample: boolean;
  approved: boolean;
}

export interface CreatorProduct {
  id: string;
  profileSlug: string;
  name: string;
  /** Which fulfillment module ships this. `manual` = owayo jerseys, signed basketballs, anything self-shipped. */
  provider: FulfillmentProviderId;
  /** Provider's variant/sync id, when known. Empty until the store is synced. */
  providerVariantId?: string;
  /** Manual products only: what one unit costs us (EXAMPLE until real). Printful costs come from its quote. */
  manualCostCents?: number;
  priceCents: number;
  priceIsExample: boolean;
  approved: boolean;
}

/** One weekly open window in the profile's time zone. `weekday` 0 = Sunday. */
export interface WeeklyWindow {
  weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  start: string; // HH:MM
  end: string; // HH:MM
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
  /** Placeholder copy. Elijah replaces this. */
  bio: string;
  specialty: string;
  reels: CreatorLink[];
  socials: CreatorLink[];
  /** Sign-in emails that see this profile's payout block. Admins always see it. */
  ownerEmails: string[];
  timeZone: string;
  weeklyHours: WeeklyWindow[];
  hoursAreExample: boolean;
  /** Granularity of the booking grid. A service occupies every cell it overlaps. */
  slotMinutes: number;
  /** Earliest bookable start, measured from now. */
  leadMinutes: number;
  /** How far ahead slots are offered. */
  horizonDays: number;
  services: CreatorService[];
  products: CreatorProduct[];
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

export const EXAMPLE_RATE_NOTE = 'EXAMPLE — placeholder rate pending Elijah\'s decision. Not a live price.';

/** EXAMPLE cents. Not a price decision. */
export const EXAMPLE_SESSION_CENTS = 15000;
export const EXAMPLE_CONSULT_CENTS = 7500;

function service(input: Omit<CreatorService, 'priceIsExample' | 'approved'> & { approved?: boolean }): CreatorService {
  return { ...input, priceIsExample: true, approved: input.approved ?? true };
}

export const PROFILES: readonly CreatorProfile[] = [
  {
    slug: 'elijah-bonds',
    name: 'Elijah Bonds',
    approved: true,
    photoUrl: null,
    bio: 'Bio placeholder.',
    specialty: 'Specialty placeholder.',
    reels: [],
    socials: [
      { label: 'Books on FEL Press', href: '/press' },
      { label: 'Amazon author page', href: 'https://www.amazon.com/Elijah-Bonds/e/B0H63J1Q7B' },
    ],
    // Same owner address lib/crm/helpers.ts already trusts. Server-only use: the page passes a boolean down.
    ownerEmails: ['elijahbonds1@gmail.com'],
    timeZone: 'America/Los_Angeles',
    weeklyHours: [
      { weekday: 2, start: '16:00', end: '19:00' },
      { weekday: 4, start: '16:00', end: '19:00' },
      { weekday: 6, start: '10:00', end: '13:00' },
    ],
    hoursAreExample: true,
    slotMinutes: 30,
    leadMinutes: 12 * 60,
    horizonDays: 21,
    services: [
      service({
        id: 'elijah-bonds:session-60',
        profileSlug: 'elijah-bonds',
        name: '1-on-1 session (EXAMPLE)',
        description: 'Service description placeholder.',
        durationMinutes: 60,
        priceCents: EXAMPLE_SESSION_CENTS,
      }),
      service({
        id: 'elijah-bonds:consult-30',
        profileSlug: 'elijah-bonds',
        name: 'Consult call (EXAMPLE)',
        description: 'Service description placeholder.',
        durationMinutes: 30,
        priceCents: EXAMPLE_CONSULT_CENTS,
      }),
    ],
    // Mirrors the Printful fixture in lib/creator/printful.ts. Merch shows "Coming soon" while PRINTFUL_ENABLED is off.
    products: [
      { id: 'fel-hoodie-m', profileSlug: 'elijah-bonds', name: 'FEL Hoodie — Men\'s', provider: 'printful', priceCents: 6000, priceIsExample: true, approved: true },
      { id: 'fel-hoodie-w', profileSlug: 'elijah-bonds', name: 'FEL Hoodie — Women\'s', provider: 'printful', priceCents: 6000, priceIsExample: true, approved: true },
      { id: 'fel-tee', profileSlug: 'elijah-bonds', name: 'FEL Tee', provider: 'printful', priceCents: 3000, priceIsExample: true, approved: true },
      { id: 'fel-hat', profileSlug: 'elijah-bonds', name: 'FEL Hat', provider: 'printful', priceCents: 3000, priceIsExample: true, approved: true },
      { id: 'fel-joggers', profileSlug: 'elijah-bonds', name: 'FEL Joggers', provider: 'printful', priceCents: 5500, priceIsExample: true, approved: true },
      // Shows the `manual` provider (self-shipped, like owayo jerseys). Not approved, so it never renders.
      { id: 'signed-basketball', profileSlug: 'elijah-bonds', name: 'Signed basketball (EXAMPLE)', provider: 'manual', manualCostCents: 4000, priceCents: 15000, priceIsExample: true, approved: false },
    ],
    stats: [
      { label: 'Stat placeholder', value: 'EXAMPLE', isExample: true },
    ],
  },
  {
    // Shows the approval gate. Not a real person; never renders.
    slug: 'example-teammate',
    name: 'Example Teammate',
    approved: false,
    photoUrl: null,
    bio: 'Bio placeholder.',
    specialty: 'Specialty placeholder.',
    reels: [],
    socials: [],
    ownerEmails: [],
    timeZone: 'America/Los_Angeles',
    weeklyHours: [{ weekday: 3, start: '10:00', end: '12:00' }],
    hoursAreExample: true,
    slotMinutes: 30,
    leadMinutes: 12 * 60,
    horizonDays: 21,
    services: [
      service({
        id: 'example-teammate:session-60',
        profileSlug: 'example-teammate',
        name: 'Session (EXAMPLE)',
        description: 'Service description placeholder.',
        durationMinutes: 60,
        priceCents: EXAMPLE_SESSION_CENTS,
      }),
    ],
    products: [],
    stats: [{ label: 'Stat placeholder', value: 'EXAMPLE', isExample: true }],
  },
];

export const MEDIA_KIT: MediaKit = {
  profileSlug: 'elijah-bonds',
  highlights: ['Highlight placeholder.'],
  highlightsArePlaceholder: true,
  // Taken from the Press partner links, which are real links. Whether each counts as a past partner for a
  // brand deck is Elijah's call, so the kit marks the list unconfirmed.
  pastPartners: PARTNERS.map((p) => p.name),
  partnersConfirmed: false,
  packages: [
    { id: 'reel', name: 'Sponsored reel (EXAMPLE)', detail: 'Package description placeholder.', priceCents: 100000, priceIsExample: true },
    { id: 'story-set', name: 'Story set (EXAMPLE)', detail: 'Package description placeholder.', priceCents: 50000, priceIsExample: true },
    { id: 'appearance', name: 'Event appearance (EXAMPLE)', detail: 'Package description placeholder.', priceCents: 250000, priceIsExample: true },
  ],
};

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function minutesOfDay(hhmm: string): number {
  const m = HHMM.exec(hhmm);
  if (!m) throw new Error(`bad time ${hhmm}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

function assertCatalog(profiles: readonly CreatorProfile[]): void {
  const slugs = new Set<string>();
  const serviceIds = new Set<string>();
  const productIds = new Set<string>();
  for (const p of profiles) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(p.slug)) throw new Error(`bad profile slug ${p.slug}`);
    if (slugs.has(p.slug)) throw new Error(`duplicate profile ${p.slug}`);
    slugs.add(p.slug);
    if (p.bio.trim() === '') throw new Error(`${p.slug} needs a bio placeholder`);
    if (!Number.isInteger(p.slotMinutes) || p.slotMinutes < 5 || 60 % p.slotMinutes !== 0) {
      throw new Error(`${p.slug} slotMinutes must divide an hour`);
    }
    new Intl.DateTimeFormat('en-US', { timeZone: p.timeZone });
    for (const w of p.weeklyHours) {
      if (minutesOfDay(w.end) <= minutesOfDay(w.start)) throw new Error(`${p.slug} has an empty window`);
      if (minutesOfDay(w.start) % p.slotMinutes !== 0) throw new Error(`${p.slug} window is off the slot grid`);
    }
    for (const s of p.services) {
      if (s.profileSlug !== p.slug || !s.id.startsWith(`${p.slug}:`)) throw new Error(`service ${s.id} is on the wrong profile`);
      if (serviceIds.has(s.id)) throw new Error(`duplicate service ${s.id}`);
      serviceIds.add(s.id);
      if (!Number.isInteger(s.priceCents) || s.priceCents <= 0) throw new Error(`bad price on ${s.id}`);
      if (!Number.isInteger(s.durationMinutes) || s.durationMinutes % p.slotMinutes !== 0) {
        throw new Error(`${s.id} duration must be a whole number of ${p.slotMinutes}-minute cells`);
      }
    }
    for (const prod of p.products) {
      if (prod.profileSlug !== p.slug) throw new Error(`product ${prod.id} is on the wrong profile`);
      if (productIds.has(prod.id)) throw new Error(`duplicate product ${prod.id}`);
      productIds.add(prod.id);
      if (!Number.isInteger(prod.priceCents) || prod.priceCents <= 0) throw new Error(`bad price on ${prod.id}`);
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

export function approvedProducts(profile: CreatorProfile): CreatorProduct[] {
  return profile.approved ? profile.products.filter((p) => p.approved) : [];
}

/** A bookable service: known, approved, on an approved profile. */
export function getBookableService(serviceId: string): { profile: CreatorProfile; service: CreatorService } | undefined {
  for (const profile of PROFILES) {
    if (!profile.approved) continue;
    const found = profile.services.find((s) => s.id === serviceId && s.approved);
    if (found) return { profile, service: found };
  }
  return undefined;
}

export function getProduct(productId: string): CreatorProduct | undefined {
  for (const profile of PROFILES) {
    const found = profile.products.find((p) => p.id === productId);
    if (found) return found;
  }
  return undefined;
}

/** "From $150" — the lowest approved service price. */
export function startingAtCents(profile: CreatorProfile): number | null {
  const prices = approvedServices(profile).map((s) => s.priceCents);
  return prices.length ? Math.min(...prices) : null;
}

export function mediaKitProfile(): CreatorProfile | undefined {
  return getApprovedProfile(MEDIA_KIT.profileSlug);
}
