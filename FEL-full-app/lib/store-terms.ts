/**
 * lib/store-terms.ts — the coach-store terms as typed, versioned data (STORE-TERMS-1, PART 1 of 2).
 *
 * Pure, client-safe: no prisma, no next/*, no process.env, no server-only. Next to lib/policies.ts.
 * STORE-TERMS-2 renders this on /store-terms, adds the required checkout checkbox and saves
 * terms_version on the purchase; this launch adds ONLY the data and its tests (nothing user-visible).
 */

import { STORE_TERMS_TEXT_A } from './store-terms/text-a';
import { STORE_TERMS_TEXT_B } from './store-terms/text-b';

// Research COACH-STORE-TOS-REFUND-FINAL.md, Oct 4 2026; FE PM 5:51 PM PT Oct 7. The version is what a
// purchase records as the text it agreed to, so a text change that keeps the old string leaves that record
// unable to say which text anyone saw. Change the version, the text and the fingerprint (lib/store-terms.test.ts)
// together. LEGAL-COPY-2 will LATER insert the audiobooks section and renumber, which is why the sections below
// carry stable word-based ids and the text stays swappable by version.
export const STORE_TERMS_VERSION = 'store-terms-2026-10-04';

/** The FIXED whole-text sha256 of each approved store-terms version (given by the approved brief; never recomputed from the text). */
export const STORE_TERMS_FINGERPRINTS: Record<string, string> = {
  'store-terms-2026-10-04': 'cdfda044a8b927caa04ada91414fc028a28ea2d02deb6ca042ebae38f18169a6',
};

/** One section of the store terms: a stable, word-based anchor id and its markdown body. */
export interface StoreTermsSection {
  id: string;
  markdown: string;
}

/**
 * The store terms, in order: Part A then Part B (STORE-TERMS-2). Kept as data (not one big string)
 * so a later version can swap the whole text and a section can be inserted without breaking a numbered anchor.
 */
export const STORE_TERMS_SECTIONS: readonly StoreTermsSection[] = [...STORE_TERMS_TEXT_A, ...STORE_TERMS_TEXT_B];

/** The full terms text: every section's markdown joined with a single newline. */
export function storeTermsText(sections: readonly StoreTermsSection[] = STORE_TERMS_SECTIONS): string {
  return sections.map((s) => s.markdown).join('\n');
}

/**
 * The literal token the approved text prints where the company's mailing address goes (it appears in the
 * contact section here and in the mailing-address section in Part B). The real address is NEVER typed in
 * this repo; the page substitutes BUSINESS_MAILING_ADDRESS (lib/legal/business.ts) at render time.
 */
export const BUSINESS_ADDRESS_TOKEN = '{BUSINESS_ADDRESS}';

/** Replace every {BUSINESS_ADDRESS} token in the given markdown with the real address. */
export function withBusinessAddress(markdown: string, address: string): string {
  return markdown.split(BUSINESS_ADDRESS_TOKEN).join(address);
}
