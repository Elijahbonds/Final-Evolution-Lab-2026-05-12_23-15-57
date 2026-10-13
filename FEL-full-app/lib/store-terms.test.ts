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
import { renderStoreTerms } from './store-terms/render';
import { REAL_MAILING_ADDRESS, isMailingAddressSet, renderMailingAddress } from './legal/business';

// STORE-TERMS (Parts A + B): the approved coach-store terms, pinned byte-for-byte. The whole-text
// sha256 is the version's fingerprint: like policies.test.ts, an edit to the text fails here until the version,
// the text and the fingerprint move together. On a whole-text mismatch the per-section fingerprints below show
// exactly which section changed (first 12 hex of sha256(section.markdown)).
const WHOLE_TEXT_SHA256 = 'fcc646da4fa9d7aefc762bfed28c39b4a42311b08e4d167454e470798b210b0d';
const PART_B_SHA256 = '2c78940575478439f4dfdc1ef3c8482be9cc455f5979f201ab5e04b56775973f';
const SECTION_SHA256_12: Record<string, string> = {
  title: '2df89c51efa6',
  'short-version': 'e80f37e30bbc',
  'terms-of-service': 'a730c3c8a2ac',
  'who-we-are': 'f5823b2d705a',
  'who-can-buy': '83336723507e',
  'prices-and-payment': '0dc5e85726c8',
  'what-you-can-buy': 'a3e6a4cf827f',
  programs: '1f683c4a8de3',
  'fel-membership': 'b72fc214cd09',
  'teen-membership': '37b94426ccb6',
  'video-review': 'c6b5802c08ba',
  'live-sessions': '76e7a384a6a7',
  audiobooks: '0674570509a7',
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
  'refund-policy': 'f67a63867973',
  'refund-program': '5cae66207208',
  'refund-membership': 'b8dee2b3829e',
  'refund-teen-membership': 'ce355381d7e0',
  'refund-video-review': 'ada0637c6e30',
  'refund-live-sessions': '0cf1b715232d',
  'refund-every-product': 'f75380f579a6',
  'refund-audiobooks': 'b8e8314559b3',
  'mailing-address': 'e5d269183518',
};

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

describe('the store terms text (Parts A + B)', () => {
  it('matches the approved fingerprint of store-terms-2026-10-12, section by section', () => {
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

  // LEGAL-COPY-2 (store-terms-2026-10-12): paste block B (audiobooks) is in; block C (ebooks) is not, it goes with EBOOK-1.
  it('mentions audiobooks (LEGAL-COPY-2) and no ebooks (block C is not in)', () => {
    expect(storeTermsText(STORE_TERMS_SECTIONS)).toMatch(/audiobook/i);
    expect(storeTermsText(STORE_TERMS_SECTIONS)).not.toMatch(/ebook/i);
  });
});

// STORE-TERMS (g): the literal fingerprint record, the whole-text and Part B hashes, and every section's hash.
describe('STORE-TERMS (g) fingerprint', () => {
  it('pins the fixed fingerprint of store-terms-2026-10-12, and keeps store-terms-2026-10-04', () => {
    expect(STORE_TERMS_FINGERPRINTS['store-terms-2026-10-04']).toBe(
      'cdfda044a8b927caa04ada91414fc028a28ea2d02deb6ca042ebae38f18169a6',
    );
    expect(STORE_TERMS_FINGERPRINTS['store-terms-2026-10-12']).toBe(
      'fcc646da4fa9d7aefc762bfed28c39b4a42311b08e4d167454e470798b210b0d',
    );
    expect(Object.keys(STORE_TERMS_FINGERPRINTS)).toEqual(['store-terms-2026-10-04', 'store-terms-2026-10-12']);
    expect(STORE_TERMS_VERSION).toBe('store-terms-2026-10-12');
  });

  it('the text reproduces the whole-text and Part B hashes', () => {
    expect(sha256(storeTermsText())).toBe(STORE_TERMS_FINGERPRINTS[STORE_TERMS_VERSION]);
    expect(sha256(storeTermsText())).toBe(WHOLE_TEXT_SHA256);
    expect(sha256(storeTermsText(STORE_TERMS_TEXT_B))).toBe(PART_B_SHA256);
    expect(STORE_TERMS_TEXT_B.map((s) => s.id)).toEqual(['refund-policy', 'refund-program', 'refund-membership', 'refund-teen-membership', 'refund-video-review', 'refund-live-sessions', 'refund-every-product', 'refund-audiobooks', 'mailing-address']);
  });

  it('covers all 36 sections, each id pinned to its section fingerprint', () => {
    expect(STORE_TERMS_SECTIONS).toHaveLength(36);
    expect(Object.keys(SECTION_SHA256_12)).toEqual(STORE_TERMS_SECTIONS.map((s) => s.id));
    for (const s of STORE_TERMS_SECTIONS) {
      expect(sha256(s.markdown).slice(0, 12), `section ${s.id}`).toBe(SECTION_SHA256_12[s.id]);
    }
  });

  it('has exactly two address tokens, mentions audiobooks and no ebooks', () => {
    expect(storeTermsText().split(BUSINESS_ADDRESS_TOKEN).length - 1).toBe(2);
    expect(storeTermsText()).toMatch(/audiobook/i);
    expect(storeTermsText()).not.toMatch(/ebook/i);
  });
});

// LEGAL-COPY-2 (store-terms-2026-10-12; Elijah, 10:07 AM PT Oct 8, yes to the LEGAL-COPY-2 defaults): every store-terms
// line paste block B adds or changes is present verbatim and carries no placeholder (FE PM / Elijah Oct 8: no "[", no
// "pending", no "coming soon", no "to be completed" anywhere user-facing).
describe('LEGAL-COPY-2 store-terms lines, no placeholder', () => {
  const section = (id: string) => STORE_TERMS_SECTIONS.find((s) => s.id === id)?.markdown ?? '';
  const AUDIOBOOKS =
    '### 4.6 Audiobooks (one-time digital purchase)\n' +
    '\n' +
    'Each audiobook is a one-time purchase for verified adults (18+). Audiobooks aren’t sold for teens, and no unlock code comes with them.\n' +
    '\n' +
    'You get a personal, non-transferable license to stream the audiobook in the app on your own account, for as long as the Site offers it. If we stop offering an audiobook within 12 months of your purchase, you get a prorated refund.\n' +
    '\n' +
    'Audiobooks stream only. There’s no download, and you may not copy, share or resell them. They aren’t part of any membership. Refunds are in Part 2, §2.7.\n';
  const REFUND_AUDIOBOOKS =
    '## 2.7 Audiobooks (one-time)\n' +
    '\n' +
    'You get a **full refund if you ask within 14 days of purchase**, no questions asked. After 14 days, purchases are final, except where Terms §13 or the law says otherwise.\n' +
    '\n' +
    '**One refund per person per audiobook.** If you buy the same audiobook again after a refund, that purchase can’t be refunded.\n' +
    '\n' +
    'A refund ends your license to the audiobook, and it stops playing on your account. While a chargeback or payment dispute is open, we may pause access, and we restore it if the dispute is resolved in your favor or withdrawn (Terms §12).\n' +
    '\n' +
    'Audiobooks stream in the app on your own account. They can’t be downloaded, and they aren’t included in the FEL Membership or the Teen Membership.\n';
  const LINES: Array<[string, string]> = [
    ['title', '**Version:** store-terms-2026-10-12'],
    ['title', '**Last updated:** October 12, 2026'],
    ['short-version', 'These terms cover everything you buy in the Final Evolution Lab coach store at go.finalevolutiongroup.com: training programs, memberships, video reviews and live 1:1 online sessions, plus audiobooks.'],
    ['who-we-are', '- Audiobooks sold in the store are covered by these terms too, but they aren’t Coaching Services.'],
    ['who-we-are', '- The store pages are the coach page (`/coach/elijahbonds`) and booking pages (`/coach/<slug>/book/<listingId>`).'],
    ['prices-and-payment', '  | Audiobooks | price shown on each listing | one-time |'],
    ['refund-policy', '| Audiobooks (one-time) | Full refund within **14 days** of purchase; one refund per audiobook |'],
  ];

  it('the audiobooks (§4.6) and refund-audiobooks (§2.7) sections are verbatim, with no placeholder', () => {
    expect(section('audiobooks')).toBe(AUDIOBOOKS);
    expect(section('refund-audiobooks')).toBe(REFUND_AUDIOBOOKS);
    for (const md of [AUDIOBOOKS, REFUND_AUDIOBOOKS]) {
      expect(md).not.toContain('[');
      expect(md).not.toContain(']');
      expect(md).not.toMatch(/pending|coming soon|to be completed/i);
    }
  });

  it('every added or changed line is present verbatim, with no placeholder', () => {
    for (const [id, line] of LINES) {
      expect(section(id), `${id}: ${line}`).toContain(line);
      expect(line).not.toContain('[');
      expect(line).not.toContain(']');
      expect(line).not.toMatch(/pending|coming soon|to be completed/i);
    }
  });

  it('renumbers the mailing-address heading to §2.8', () => {
    expect(section('mailing-address').split('\n')[0]).toBe('## 2.8 Business mailing address');
  });
});

// LEGAL-COPY-2: what /store-terms renders while no address is set, built exactly as app/store-terms/page.tsx builds it.
describe('LEGAL-COPY-2 store terms rendered while the address is unset', () => {
  it('shows no placeholder, token or mail line, drops §2.8, and carries both audiobook sections', () => {
    const addressSet = isMailingAddressSet(REAL_MAILING_ADDRESS);
    expect(addressSet).toBe(false);
    const sections = STORE_TERMS_SECTIONS.filter((s) => addressSet || s.id !== 'mailing-address').map((s) => ({
      ...s,
      markdown: renderMailingAddress(s.markdown, BUSINESS_ADDRESS_TOKEN, REAL_MAILING_ADDRESS),
    }));
    const html = renderStoreTerms(sections);
    expect(html).not.toContain('[');
    expect(html).not.toContain('{BUSINESS_ADDRESS}');
    expect(html).not.toContain('Mail:');
    expect(html).not.toContain('by mail to');
    expect(html).not.toMatch(/pending/i);
    expect(html).not.toContain('<section id="mailing-address">');
    expect(html).toContain('<section id="refund-audiobooks">');
    expect(html).toContain('<section id="audiobooks">');
  });
});
