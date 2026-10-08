/**
 * P3 (membership delivers, M1) — one pure answer for "what does this ProgramAccess row open on the player page".
 *
 * This lives in its own module, NOT in ./entitlement, because entitlement.ts and bundlePolicy.ts are money
 * no-touch files that must stay byte-identical to lane/finish-release (PM rule, PR #211 follow-up). It IMPORTS
 * the live policy via ./entitlement's `currentEntitlementPolicy`/`EntitlementPolicy`; it never edits them, and
 * it never changes who pays or what is charged — checkout/entitlement are untouched.
 *
 * No I/O and no status logic: whether a row is open at all stays B4's `programAccessOpen` (./access). This
 * answers only "given an open row, which store-price product keys render".
 */
import { currentEntitlementPolicy, type EntitlementPolicy } from './entitlement';
import { programComingSoon } from './manifest';
import { STORE_PRICES } from './storePrices';

/**
 * The released program store-price keys: the STORE_PRICES keys whose manifest is kind 'program' and NOT
 * programComingSoon (so a coming-soon lane is never released). Derived, not hand-listed — today exactly
 * ['dunking-plyometrics-8wk'].
 */
export const RELEASED_PROGRAM_KEYS: readonly string[] = STORE_PRICES.filter(
  (row) => row.manifest && row.manifest.kind === 'program' && !programComingSoon(row.manifest),
).map((row) => row.key);

const COURSE_KEY = 'signature-dunk-course';
const SERIES_KEY = 'blueprint-series';
/** What the player page renders for a bundle today: the 8-week program plus the course and series. */
const BUNDLE_KEYS: readonly string[] = ['dunking-plyometrics-8wk', COURSE_KEY, SERIES_KEY];

/** The course and series keys a membership also opens when membershipIncludesCourses is true (default false). */
function membershipCourseKeys(): readonly string[] {
  return STORE_PRICES.filter(
    (row) => row.manifest && (row.manifest.kind === 'course' || row.manifest.kind === 'series'),
  ).map((row) => row.key);
}

/**
 * Pure: the store-price product keys a ProgramAccess row opens on /program/[accessId].
 * - 'lane' + lane 'dunking' -> ['dunking-plyometrics-8wk']; any other lane -> [].
 * - 'product' -> [lane] when lane is the course or series key, else [].
 * - 'bundle' -> the program, course and series keys (what the page renders today).
 * - 'all' / 'teen_all' -> RELEASED_PROGRAM_KEYS, plus the course/series keys ONLY when
 *   policy.membershipIncludesCourses is true (default false). Teen and adult follow the same rule.
 * - anything else -> [].
 */
export function programsForAccess(
  row: { scope: string; lane: string | null },
  policy: EntitlementPolicy = currentEntitlementPolicy(),
): readonly string[] {
  switch (row.scope) {
    case 'lane':
      return row.lane === 'dunking' ? ['dunking-plyometrics-8wk'] : [];
    case 'product':
      return row.lane === COURSE_KEY || row.lane === SERIES_KEY ? [row.lane] : [];
    case 'bundle':
      return BUNDLE_KEYS;
    case 'all':
    case 'teen_all':
      return [...RELEASED_PROGRAM_KEYS, ...(policy.membershipIncludesCourses ? membershipCourseKeys() : [])];
    default:
      return [];
  }
}
