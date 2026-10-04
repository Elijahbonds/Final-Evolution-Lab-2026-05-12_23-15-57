import * as bundlePolicy from './bundlePolicy';
import type { CoachManifest } from './manifest';
import { STORE_PRICES, storePriceByKey } from './storePrices';

export interface EntitlementPolicy {
  /** See ./bundlePolicy — whether a membership also grants the course/series products. */
  membershipIncludesCourses: boolean;
}

/** The live policy, read at call time from ./bundlePolicy (so tests can mock it). */
export function currentEntitlementPolicy(): EntitlementPolicy {
  return { membershipIncludesCourses: bundlePolicy.membershipIncludesCourses };
}

/** The course and series product keys (from storePrices) a membership grants when membershipIncludesCourses is true. */
function membershipCourseProducts(): string[] {
  const out: string[] = [];
  for (const row of STORE_PRICES) {
    if (row.manifest && (row.manifest.kind === 'course' || row.manifest.kind === 'series')) out.push(row.manifest.product);
  }
  return out;
}

/**
 * Pure helper: the store-price product keys a manifest's purchase grants. No I/O.
 *
 * `program` (dunking only — the only sellable lane) grants the dunking 8-week product. `course`/`series` grant
 * their own product. `bundle` grants every one of its members. `live_1on1`/`video_review` grant none.
 * `membership` grants none unless `membershipIncludesCourses` (./bundlePolicy, default false) is true, in which
 * case it grants the course and series products — an open question for Elijah (see the PR body).
 */
export function productsGrantedBy(
  manifest: CoachManifest,
  policy: EntitlementPolicy = currentEntitlementPolicy(),
): readonly string[] {
  switch (manifest.kind) {
    case 'program':
      return manifest.lane === 'dunking' ? ['dunking-plyometrics-8wk'] : [];
    case 'course':
    case 'series':
      return [manifest.product];
    case 'bundle':
      return manifest.members;
    case 'membership':
      return policy.membershipIncludesCourses ? membershipCourseProducts() : [];
    case 'live_1on1':
    case 'video_review':
      return [];
    default:
      return [];
  }
}

export interface BundlePart {
  key: string;
  /** Null only if a member key is not in storePrices. */
  title: string | null;
  priceCents: number | null;
}

/** Pure helper: the bundle members the buyer does NOT already own, each with its individual storePrices price. */
export function missingBundleParts(members: readonly string[], owned: ReadonlySet<string>): BundlePart[] {
  return members
    .filter((key) => !owned.has(key))
    .map((key) => {
      const row = storePriceByKey(key);
      return { key, title: row?.title ?? null, priceCents: row?.priceCents ?? null };
    });
}
