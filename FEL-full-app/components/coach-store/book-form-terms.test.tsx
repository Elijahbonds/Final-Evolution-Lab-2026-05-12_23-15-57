// STORE-TERMS (i): the T6 terms checkbox, disabled buy buttons and neutral notices. renderToStaticMarkup (no jsdom).
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BookForm } from './book-form';
import { BundleMissingParts } from './bundle-missing-parts';
import type { BundlePartWithListing } from '@/lib/coach-store/bundleParts';

const SRC = readFileSync(join(process.cwd(), 'components/coach-store/book-form.tsx'), 'utf8');
const NOTICE_TICK = 'Please tick the box to agree to the store terms.';
const NOTICE_UPDATED = 'The store terms were updated. Reload the page and tick the box again.';
const LINK_TEXT = 'Coach Store Terms of Service and Refund &amp; Cancellation Policy';

const PART: BundlePartWithListing = {
  key: 'dunking-plyometrics-8wk', title: 'Dunking & Plyometrics 8-week', priceCents: 7900,
  listingId: 'listing-dunk', listingPriceCents: 7900,
};

function renderForm(kind: string) {
  return renderToStaticMarkup(
    createElement(BookForm as never, { slug: 'elijah', listingId: 'listing-1', kind, audience: 'adult', continueLabel: 'Go' } as never),
  );
}

describe('STORE-TERMS (i) book form', () => {
  for (const kind of ['video_review', 'program', 'membership', 'live_1on1']) {
    describe(kind, () => {
      const html = renderForm(kind);

      it('has an unticked checkbox, the terms link and label, and a disabled main buy button', () => {
        const checkbox = html.match(/<input[^>]*type="checkbox"[^>]*>/);
        expect(checkbox).not.toBeNull();
        expect(checkbox![0]).not.toContain('checked');
        expect(html).toMatch(
          new RegExp(`<a [^>]*href="/store-terms"[^>]*target="_blank"[^>]*rel="noopener noreferrer"[^>]*>${LINK_TEXT}</a>`),
        );
        const label = html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, '');
        expect(label).toContain(`I agree to the ${LINK_TEXT}.`);
        expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Go<\/button>/);
      });

      it('puts the checkbox before the main buy button', () => {
        expect(html.indexOf('type="checkbox"')).toBeGreaterThan(-1);
        expect(html.indexOf('type="checkbox"')).toBeLessThan(html.indexOf('<button'));
      });

      it('shows no terms notice on first paint', () => {
        expect(html).not.toContain(NOTICE_TICK);
        expect(html).not.toContain(NOTICE_UPDATED);
      });
    });
  }

  describe('source', () => {
    it('sends termsAccepted and termsVersion from submit() and buyPart()', () => {
      const submitBody = SRC.slice(SRC.indexOf('const submit'), SRC.indexOf('const buyPart'));
      expect(submitBody).toContain('termsAccepted: true');
      expect(submitBody).toContain('termsVersion: STORE_TERMS_VERSION');
      expect(SRC).toContain(
        'body: JSON.stringify({ ...partCheckoutBody(part, currentBeneficiary()), termsAccepted: true, termsVersion: STORE_TERMS_VERSION }),',
      );
    });

    it('carries both notice strings, the version compare and the neutral notice element', () => {
      expect(SRC).toContain(NOTICE_TICK);
      expect(SRC).toContain(NOTICE_UPDATED);
      expect(SRC).toContain('json.version === STORE_TERMS_VERSION');
      expect(SRC).toContain('<p className="rounded-xl border border-white/20 p-3 text-sm text-white/80" role="status">{termsNotice}</p>');
      expect(SRC).toContain('const [termsAgreed, setTermsAgreed] = useState(false);');
    });

    it('has no forbidden copy, storage or red-error terms notice', () => {
      expect(SRC).not.toContain('Please agree to the store terms');
      expect(SRC).not.toContain('Please read and agree');
      expect(SRC).not.toContain('localStorage');
      expect(SRC).not.toContain('setError(termsNoticeFor');
    });
  });

  describe('BundleMissingParts terms gate', () => {
    const buy = (props: Record<string, unknown>) =>
      renderToStaticMarkup(createElement(BundleMissingParts as never, { owned: [], missing: [PART], onBuy: () => {}, ...props } as never));

    it('disables the Buy button when termsAgreed is omitted or false', () => {
      expect(buy({})).toMatch(/<button[^>]*disabled=""[^>]*>Buy<\/button>/);
      expect(buy({ termsAgreed: false })).toMatch(/<button[^>]*disabled=""[^>]*>Buy<\/button>/);
    });

    it('enables the Buy button when termsAgreed is true and nothing is busy', () => {
      const html = buy({ termsAgreed: true });
      const btn = html.match(/<button[^>]*>Buy<\/button>/);
      expect(btn).not.toBeNull();
      expect(btn![0]).not.toContain('disabled=');
    });
  });
});
