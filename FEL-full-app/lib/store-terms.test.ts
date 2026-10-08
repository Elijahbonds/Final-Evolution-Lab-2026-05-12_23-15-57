import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  BUSINESS_ADDRESS_TOKEN,
  STORE_TERMS_FINGERPRINTS,
  STORE_TERMS_SECTIONS,
  STORE_TERMS_VERSION,
  storeTermsText,
  withBusinessAddress,
} from './store-terms';
import { STORE_TERMS_TEXT_B } from './store-terms/text-b';

// STORE-TERMS (Parts A + B): the approved coach-store terms, pinned byte-for-byte. The whole-text
// sha256 is the version's fingerprint: like policies.test.ts, an edit to the text fails here until the version,
// the text and the fingerprint move together. On a whole-text mismatch the per-section fingerprints below show
// exactly which section changed (first 12 hex of sha256(section.markdown)).
const WHOLE_TEXT_SHA256 = 'cdfda044a8b927caa04ada91414fc028a28ea2d02deb6ca042ebae38f18169a6';
const PART_B_SHA256 = '19ca6a50294365cba64409634bfc8c69e39858cb199af730c03bd164c9ecf0fb';
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
  'refund-policy': 'e41049c26f76',
  'refund-program': '5cae66207208',
  'refund-membership': 'b8dee2b3829e',
  'refund-teen-membership': 'ce355381d7e0',
  'refund-video-review': 'ada0637c6e30',
  'refund-live-sessions': '0cf1b715232d',
  'refund-every-product': 'f75380f579a6',
  'mailing-address': 'fdfc6fa886c3',
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

// STORE-TERMS (g): the literal fingerprint record, the whole-text and Part B hashes, and every section's hash.
describe('STORE-TERMS (g) fingerprint', () => {
  it('pins the fixed fingerprint of store-terms-2026-10-04', () => {
    expect(STORE_TERMS_FINGERPRINTS['store-terms-2026-10-04']).toBe(
      'cdfda044a8b927caa04ada91414fc028a28ea2d02deb6ca042ebae38f18169a6',
    );
    expect(Object.keys(STORE_TERMS_FINGERPRINTS)).toEqual(['store-terms-2026-10-04']);
    expect(STORE_TERMS_VERSION).toBe('store-terms-2026-10-04');
  });

  it('the text reproduces the whole-text and Part B hashes', () => {
    expect(sha256(storeTermsText())).toBe(STORE_TERMS_FINGERPRINTS[STORE_TERMS_VERSION]);
    expect(sha256(storeTermsText())).toBe(WHOLE_TEXT_SHA256);
    expect(sha256(storeTermsText(STORE_TERMS_TEXT_B))).toBe(PART_B_SHA256);
    expect(STORE_TERMS_TEXT_B.map((s) => s.id)).toEqual(['refund-policy', 'refund-program', 'refund-membership', 'refund-teen-membership', 'refund-video-review', 'refund-live-sessions', 'refund-every-product', 'mailing-address']);
  });

  it('covers all 34 sections, each id pinned to its section fingerprint', () => {
    expect(STORE_TERMS_SECTIONS).toHaveLength(34);
    expect(Object.keys(SECTION_SHA256_12)).toEqual(STORE_TERMS_SECTIONS.map((s) => s.id));
    for (const s of STORE_TERMS_SECTIONS) {
      expect(sha256(s.markdown).slice(0, 12), `section ${s.id}`).toBe(SECTION_SHA256_12[s.id]);
    }
  });

  it('has exactly two address tokens and no audiobooks', () => {
    expect(storeTermsText().split(BUSINESS_ADDRESS_TOKEN).length - 1).toBe(2);
    expect(storeTermsText()).not.toMatch(/audiobook/i);
  });
});
