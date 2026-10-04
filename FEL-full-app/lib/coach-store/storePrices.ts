/**
 * STORE-PRICES — Elijah's approved coach-store prices (approved 11:27 AM PT, Oct 4 2026), as typed, flag-off
 * data. Gated behind `isCoachStoreEnabled()` (lib/flags.ts, `COACH_STORE_ENABLED`, default off) — the same
 * flag `programLibrarySeed.ts` ships behind. With the flag unset, `getStorePrices()` and
 * `getStoreProgramGroupings()` return `[]`: nothing new is visible or returned anywhere. No parallel flag.
 *
 * THIS TIP WRITES NO DATABASE ROWS. Today every sellable coach-store price lives only as a
 * `MarketplaceListing.priceUsd` database row (see `lib/coach-store/manifest.ts`, `lib/coach-store/checkout.ts`);
 * no code, seed, SQL or migration creates those rows. This module is the typed source of truth the eventual
 * seeding step reads from — see `~/Claude/_observe/STORE-PRICES-LIVE-ROWS.txt` for the write-order spec.
 *
 * Reuses existing types rather than inventing parallel ones: `CoachManifest` (./manifest) is the exact shape
 * `checkout.ts` parses off a listing row, and `ProgramLibraryVideoEntry`'s `videoId` (./programLibrarySeed) is
 * the same string id used to key the 14-video seed.
 *
 * THREE ITEMS WERE PRICED BUT UNSELLABLE until STORE-LISTING-FORMAT: Signature Dunk Course (`course`), Blueprint
 * series (`series`) and the all-three bundle (`bundle`). `coachManifest` (./manifest) now carries those three
 * kinds alongside the original four; `itemKeyFor()` gives each its own key
 * (`coach-store:<slug>:course|series|bundle:<product>:one_time`); `checkout.ts`'s `buyAccess()` treats them as
 * one-time self/teen purchases exactly like `program`, writing `ProgramAccess.scope` `'product'` (course/series)
 * or `'bundle'` (bundle) with `lane` set to the manifest's `product` key. `lib/coach-store/entitlement.ts`'s
 * `productsGrantedBy()` is the pure map from a manifest to the store-price keys it grants (the bundle grants all
 * three members). No schema or SQL change was needed: `MarketplaceListing.manifest` is already a JSON string and
 * `ProgramAccess.scope`/`lane` are already free-form strings.
 */
import { isCoachStoreEnabled } from '@/lib/flags';
import { MAX_CLIPS, MAX_CLIP_SECONDS } from './constants';
import type { CoachManifest } from './manifest';
import type { ProgramLibraryVideoEntry } from './programLibrarySeed';

export type StoreBilling = 'one_time' | 'month';

/** Who may buy. Every row is adults-only at checkout; a teen membership is bought BY a verified adult FOR a teen. */
export type StoreBuyer = 'verified_adult' | 'verified_adult_parent_for_teen';

export interface StorePriceRow {
  key: string;
  title: string;
  priceCents: number;
  billing: StoreBilling;
  /** Null means priced but not yet representable/sellable — see the module doc above. */
  manifest: CoachManifest | null;
  buyer: StoreBuyer;
  /** Program-library video ids this item is built from (programs and the bundle only). */
  videoIds?: readonly string[];
  /** For the bundle: the three component item keys it is the union of. Their own prices are untouched. */
  componentKeys?: readonly string[];
}

/**
 * Every program (and the bundle) pulls from this shared drill library. It is never pinned to one package, never
 * part of any single program's `videoIds`, and is never priced on its own.
 */
export const SHARED_DRILL_LIBRARY_VIDEO_IDS = [
  'pqyxTY85x4U', // Plyometric Exercise List (16 timestamped drills)
  'J037GG99GT0', // gym exercise list (44 timestamped drills)
  'q1HLjLbhS2s', // bodyweight & mobility (25 timestamped drills)
] as const;

const DUNKING_PLYOMETRICS_VIDEO_IDS = ['00j3HPZsPmY', '3GtJ-134D9s'] as const; // Plyometric Work, Approach Work!
const SIGNATURE_DUNK_COURSE_VIDEO_IDS = [
  'cWYFVg6GsVU', 'xVE7Gegu27w', 'V0yX1H1OtQ8', 'tiHUrigssOA', 'isjAY8Oo58g', 's4U7IsjowuE',
] as const; // the six dunk tutorials
const BLUEPRINT_SERIES_VIDEO_IDS = ['hrlGbS0r-hM', 'dAoLYThf1bc'] as const; // Bonds Bounce BluePrint videos

/** mpRZl8VNWlo (Final Evolution Vol. 2, a trailer) is deliberately in no program and not in the shared list. */
export const UNASSIGNED_VIDEO_IDS = ['mpRZl8VNWlo'] as const;

export const STORE_PRICES: readonly StorePriceRow[] = [
  {
    key: 'dunking-plyometrics-8wk',
    title: 'Dunking & Plyometrics 8-week',
    priceCents: 7900,
    billing: 'one_time',
    manifest: { kind: 'program', lane: 'dunking', billing: 'one_time', weeks: 8 },
    buyer: 'verified_adult',
    videoIds: DUNKING_PLYOMETRICS_VIDEO_IDS,
  },
  {
    key: 'signature-dunk-course',
    title: 'Signature Dunk Course',
    priceCents: 3900,
    billing: 'one_time',
    manifest: { kind: 'course', product: 'signature-dunk-course', billing: 'one_time' },
    buyer: 'verified_adult',
    videoIds: SIGNATURE_DUNK_COURSE_VIDEO_IDS,
  },
  {
    key: 'blueprint-series',
    title: 'Blueprint series',
    priceCents: 2900,
    billing: 'one_time',
    manifest: { kind: 'series', product: 'blueprint-series', billing: 'one_time' },
    buyer: 'verified_adult',
    videoIds: BLUEPRINT_SERIES_VIDEO_IDS,
  },
  {
    key: 'bundle-all-three',
    title: 'All-three bundle',
    priceCents: 11900,
    billing: 'one_time',
    manifest: {
      kind: 'bundle',
      product: 'bundle-all-three',
      billing: 'one_time',
      members: ['dunking-plyometrics-8wk', 'signature-dunk-course', 'blueprint-series'] as string[],
    },
    buyer: 'verified_adult',
    videoIds: [...DUNKING_PLYOMETRICS_VIDEO_IDS, ...SIGNATURE_DUNK_COURSE_VIDEO_IDS, ...BLUEPRINT_SERIES_VIDEO_IDS],
    componentKeys: ['dunking-plyometrics-8wk', 'signature-dunk-course', 'blueprint-series'],
  },
  {
    key: 'membership',
    title: 'Membership',
    priceCents: 2999,
    billing: 'month',
    manifest: { kind: 'membership', audience: 'adult', interval: 'month' },
    buyer: 'verified_adult',
  },
  {
    key: 'teen-membership',
    title: 'Teen Membership (parent-bought)',
    priceCents: 1499,
    billing: 'month',
    manifest: { kind: 'membership', audience: 'teen', interval: 'month' },
    buyer: 'verified_adult_parent_for_teen',
  },
  {
    key: 'async-review',
    title: 'Async review',
    priceCents: 4500,
    billing: 'one_time',
    manifest: { kind: 'video_review', maxClips: MAX_CLIPS, maxClipSeconds: MAX_CLIP_SECONDS },
    buyer: 'verified_adult',
  },
  {
    key: 'live-1on1-30',
    title: 'Live 1:1, 30 min',
    priceCents: 6500,
    billing: 'one_time',
    manifest: { kind: 'live_1on1', durationMin: 30 },
    buyer: 'verified_adult',
  },
  {
    key: 'live-1on1-60',
    title: 'Live 1:1, 60 min',
    priceCents: 12000,
    billing: 'one_time',
    manifest: { kind: 'live_1on1', durationMin: 60 },
    buyer: 'verified_adult',
  },
] as const;

/** Flag-gated read path, same pattern as `getProgramLibrarySeed()`. `[]` while `COACH_STORE_ENABLED` is off. */
export function getStorePrices(): readonly StorePriceRow[] {
  return isCoachStoreEnabled() ? STORE_PRICES : [];
}

export function storePriceByKey(key: string): StorePriceRow | undefined {
  return STORE_PRICES.find((r) => r.key === key);
}

/** The four program-level groupings (three programs + the bundle), each carrying its own price and video ids. */
export interface StoreProgramGrouping {
  key: string;
  title: string;
  priceCents: number;
  videoIds: readonly string[];
  componentKeys?: readonly string[];
}

const PROGRAM_GROUPING_KEYS = ['dunking-plyometrics-8wk', 'signature-dunk-course', 'blueprint-series', 'bundle-all-three'];

const STORE_PROGRAM_GROUPINGS: readonly StoreProgramGrouping[] = STORE_PRICES
  .filter((r) => PROGRAM_GROUPING_KEYS.includes(r.key))
  .map((r) => ({ key: r.key, title: r.title, priceCents: r.priceCents, videoIds: r.videoIds ?? [], componentKeys: r.componentKeys }));

/** Flag-gated read path for the program groupings. `[]` while `COACH_STORE_ENABLED` is off. */
export function getStoreProgramGroupings(): readonly StoreProgramGrouping[] {
  return isCoachStoreEnabled() ? STORE_PROGRAM_GROUPINGS : [];
}

/** Narrows a flat program-library seed list down to the videoIds one grouping references. Read-only convenience. */
export function videosForGrouping(
  grouping: StoreProgramGrouping,
  seed: readonly ProgramLibraryVideoEntry[],
): ProgramLibraryVideoEntry[] {
  return seed.filter((entry) => grouping.videoIds.includes(entry.videoId));
}
