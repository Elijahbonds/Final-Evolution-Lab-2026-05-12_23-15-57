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

/**
 * The FIXED fingerprints of the approved text (STORE-TERMS-3). `text` is the whole-text sha256 the brief
 * pins for store-terms-2026-10-04 (given, never recomputed from the text); `sections` is the per-section
 * sha256 (first 12 hex) keyed by section id, so a failing check names the exact section that changed.
 * An edit to the text moves the version AND these fingerprints together.
 *
 * NOTE (flagged): the per-section values below are recomputed from the on-branch text. The brief that
 * fixes the per-section constants was truncated; the whole-text `text` value IS the brief-given constant
 * (and the on-branch text reproduces it exactly). Replace `sections` with the briefed map when provided.
 */
export const STORE_TERMS_FINGERPRINTS = {
  version: STORE_TERMS_VERSION,
  text: 'cdfda044a8b927caa04ada91414fc028a28ea2d02deb6ca042ebae38f18169a6',
  sections: {
    title: 'eaf007f479df',
    'short-version': '08da22402bd9',
    'terms-of-service': 'a730c3c8a2ac',
    'who-we-are': '1e1cb650fa7d',
    'who-can-buy': '83336723507e',
    'prices-and-payment': '15caae7efb96',
    'what-you-can-buy': 'a3e6a4cf827f',
    programs: '1f683c4a8de3',
    'fel-membership': 'b72fc214cd09',
    'teen-membership': '37b94426ccb6',
    'video-review': 'c6b5802c08ba',
    'live-sessions': '76e7a384a6a7',
    'not-medical-advice': '97c69aa8c060',
    'no-guaranteed-results': '5105957a2163',
    'exercise-risk': '4256ea1f8861',
    'recording-policy': 'b6d7a3e397ed',
    'acceptable-use': '54a9c320332e',
    'who-owns-what': '3fb95872af19',
    privacy: '43781e02a36f',
    'chargebacks-and-disputes': 'f25eea8cd80f',
    changes: 'e793924083a1',
    'suspension-and-termination': '53338d765101',
    'limitation-of-liability': '9ebec4fdeb5d',
    'governing-law-and-disputes': '48ee7a6ae280',
    'other-legal-terms': '644e5f72a074',
    contact: '8533028ef830',
    // Part B (refund & cancellation policy) — AM's verbatim copy renamed these section ids.
    'refund-policy': 'e41049c26f76',
    'refund-program': '5cae66207208',
    'refund-membership': 'b8dee2b3829e',
    'refund-teen-membership': 'ce355381d7e0',
    'refund-video-review': 'ada0637c6e30',
    'refund-live-sessions': '0cf1b715232d',
    'refund-every-product': 'f75380f579a6',
    'mailing-address': 'fdfc6fa886c3',
  },
} as const;

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
