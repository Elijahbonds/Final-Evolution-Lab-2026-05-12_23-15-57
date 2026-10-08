import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  BUSINESS_ADDRESS_TOKEN,
  STORE_TERMS_SECTIONS,
  STORE_TERMS_VERSION,
  storeTermsText,
  withBusinessAddress,
} from './store-terms';

// STORE-TERMS (Parts A + B): the approved coach-store terms, pinned byte-for-byte. The whole-text
// sha256 is the version's fingerprint: like policies.test.ts, an edit to the text fails here until the version,
// the text and the fingerprint move together. On a whole-text mismatch the per-section fingerprints below show
// exactly which section changed (first 12 hex of sha256(section.markdown)).
const WHOLE_TEXT_SHA256 = '2f616a45b1db6664bf039ec1f6b261751d72ace0f1666857543b6a5be7faccf1';
const SECTION_SHA256_12: Record<string, string> = {
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
  // STORE-TERMS-2: Part B — the refund & cancellation policy (PART 2 of the approved text).
  'refund-policy': 'ca07c0b6ec14',
  'refund-short-version': '165c327caad9',
  'programs-refunds': '8e0b56965ae1',
  'membership-renewal-and-cancellation': '89b7ded64022',
  'teen-membership-refunds': 'fab1d0017267',
  'video-review-refunds': '9c6c53099286',
  'live-session-refunds': '8edd7995fdc5',
  'how-to-request-a-refund': '00bde79c4639',
  'mailing-address': 'e665a2a6b566',
};

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

describe('the store terms text (Parts A + B)', () => {
  it('matches the approved fingerprint of store-terms-2026-10-04, section by section', () => {
    const text = storeTermsText(STORE_TERMS_SECTIONS);
    const got = sha256(text);
    if (got !== WHOLE_TEXT_SHA256) {
      // Name the bad section(s) so the failing text is obvious without a manual diff.
      const perSection = STORE_TERMS_SECTIONS.map(
        (s) => `${s.id}:${sha256(s.markdown).slice(0, 12)} (expected ${SECTION_SHA256_12[s.id] ?? 'n/a'})`,
      ).join('\n  ');
      throw new Error(`store terms text changed under ${STORE_TERMS_VERSION}:\n  ${perSection}`);
    }
    expect(got).toBe(WHOLE_TEXT_SHA256);
  });

  it('carries unique, word-based (never number-based) section ids, starting with the title', () => {
    expect(STORE_TERMS_SECTIONS.length).toBeGreaterThan(0);
    expect(STORE_TERMS_SECTIONS[0].id).toBe('title');
    const ids = STORE_TERMS_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z]+(-[a-z]+)*$/);
    }
  });

  it('prints the version it records', () => {
    expect(storeTermsText(STORE_TERMS_SECTIONS)).toContain(`**Version:** ${STORE_TERMS_VERSION}`);
  });

  it('keeps the business address as a render-time token, never a typed address', () => {
    const text = storeTermsText(STORE_TERMS_SECTIONS);
    // The token appears exactly twice: Part A's contact section and Part B's mailing-address section.
    expect(text.split(BUSINESS_ADDRESS_TOKEN).length - 1).toBe(2);
    // And never as an already-typed address.
    expect(text).not.toContain('[Business mailing address');
    // The page substitutes it at render time; afterwards no token remains.
    expect(withBusinessAddress(text, 'X ADDR')).not.toContain(BUSINESS_ADDRESS_TOKEN);
    expect(withBusinessAddress(text, 'X ADDR')).toContain('X ADDR');
  });

  it('links buyers to /account/coaching (P2 keeps that URL for "My coaching")', () => {
    expect(storeTermsText(STORE_TERMS_SECTIONS)).toContain('/account/coaching');
  });

  it('still mentions no audiobooks (LEGAL-COPY-2 adds them later as their own version)', () => {
    expect(storeTermsText(STORE_TERMS_SECTIONS)).not.toMatch(/audiobook/i);
  });
});
