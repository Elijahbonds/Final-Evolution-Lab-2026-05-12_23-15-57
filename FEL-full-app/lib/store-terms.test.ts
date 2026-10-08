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

// STORE-TERMS (Parts A + B): the approved coach-store terms, pinned byte-for-byte. The whole-text
// sha256 is the version's fingerprint: like policies.test.ts, an edit to the text fails here until the version,
// the text and the fingerprint move together. On a whole-text mismatch the per-section fingerprints below show
// exactly which section changed (first 12 hex of sha256(section.markdown)).
// STORE-TERMS-3: the constants live in STORE_TERMS_FINGERPRINTS (lib/store-terms.ts) — fixed, never recomputed.
const WHOLE_TEXT_SHA256 = STORE_TERMS_FINGERPRINTS.text;
const SECTION_SHA256_12: Record<string, string> = STORE_TERMS_FINGERPRINTS.sections;

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

// STORE-TERMS-3 (g): STORE_TERMS_FINGERPRINTS is the single source of the fixed hashes — the whole-text
// fingerprint names the brief-given constant, and every section's first-12-hex sha256 matches the map.
describe('STORE_TERMS_FINGERPRINTS (g)', () => {
  it('the whole-text fingerprint is the fixed store-terms-2026-10-04 value and the text reproduces it', () => {
    expect(STORE_TERMS_FINGERPRINTS.version).toBe('store-terms-2026-10-04');
    expect(STORE_TERMS_FINGERPRINTS.text).toBe('cdfda044a8b927caa04ada91414fc028a28ea2d02deb6ca042ebae38f18169a6');
    expect(sha256(storeTermsText(STORE_TERMS_SECTIONS))).toBe(STORE_TERMS_FINGERPRINTS.text);
  });

  it('covers all 34 sections (26 Part A + 8 Part B), each id pinned to its section fingerprint', () => {
    expect(STORE_TERMS_SECTIONS).toHaveLength(34);
    expect(Object.keys(STORE_TERMS_FINGERPRINTS.sections)).toHaveLength(34);
    for (const s of STORE_TERMS_SECTIONS) {
      expect(SECTION_SHA256_12[s.id], `missing fingerprint for section ${s.id}`).toBeDefined();
      expect(sha256(s.markdown).slice(0, 12)).toBe(SECTION_SHA256_12[s.id]);
    }
  });
});
