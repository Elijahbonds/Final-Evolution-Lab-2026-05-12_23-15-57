// OWNER-APPROVALS (2026-10-27; owner, in chat: "You do it. I approve." — cards C12 and C28): the Coach Terms and Payout
// Terms (lib/coach-terms.ts, /coach-terms) and the Purchase Terms and Refund Policy (lib/purchase-terms.ts,
// /purchase-terms). Each is versioned like the store terms: the version a coach's account or a purchase records must name
// the text that was shown, so a text change fails here until the version moves. The blanks the cards left are the
// coordinator's defaults, held here to the code they describe.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => null) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/components/public-chrome', () => ({ PublicTopBar: () => null, PublicLegalFooter: () => null }));

import { COACH_TERMS_DOC_VERSION, COACH_TERMS_PAGE_HREF, COACH_TERMS_SECTIONS, coachTermsText } from '@/lib/coach-terms';
import { PURCHASE_REFUND_DAYS, PURCHASE_TERMS_HREF, PURCHASE_TERMS_SECTIONS, PURCHASE_TERMS_VERSION, purchaseTermsText } from '@/lib/purchase-terms';
import { BUYER_TERMS, COACH_TERMS_HREF, COACH_TERMS_VERSION } from '@/lib/payments/terms';
import { COACH_PRO_PRICE_DEFAULT_CENTS, FREE_CLIENT_LIMIT_DEFAULT, PLATFORM_FEE_BPS_FREE_DEFAULT, PLATFORM_FEE_BPS_PRO_DEFAULT, REFUND_PROCESSING_FEE_DEFAULT, usdPlain } from '@/lib/coach-business/config';
import { bpsLabel } from '@/lib/coach-business/fees';
import { STORE_TERMS_VERSION } from '@/lib/store-terms';
import { BUSINESS_CONTACT_EMAIL } from '@/lib/legal/business';
import { PUBLIC_STATIC_PATHS } from '@/lib/seo/publicPages';
import CoachTermsPage from '@/app/coach-terms/page';
import PurchaseTermsPage from '@/app/purchase-terms/page';

const fp = (text: string, version: string) => createHash('sha256').update(text.split(version).join('')).digest('hex').slice(0, 16);

/** Each version → a fingerprint of its text (the version string itself taken out). Add a row with every new version. */
const COACH_TERMS_BY_VERSION: Record<string, string> = {
  'coach-terms-2026-10-27': fp(coachTermsText(), 'coach-terms-2026-10-27'),
};
const PURCHASE_TERMS_BY_VERSION: Record<string, string> = {
  'purchase-terms-2026-10-27': fp(purchaseTermsText(), 'purchase-terms-2026-10-27'),
};
// The fingerprints the rows above must equal — written down, never recomputed — so an edit to either text fails until
// its version moves and a new row is added.
const PINNED = { coach: 'cccbdca5816ecf55', purchase: 'a6dd475b4cb751a8' };

describe('versioned like the store terms', () => {
  it('each text matches the fingerprint written for its version', () => {
    expect(COACH_TERMS_BY_VERSION[COACH_TERMS_DOC_VERSION], `coach terms changed under ${COACH_TERMS_DOC_VERSION}: bump it; new fingerprint ${fp(coachTermsText(), COACH_TERMS_DOC_VERSION)}`).toBe(PINNED.coach);
    expect(PURCHASE_TERMS_BY_VERSION[PURCHASE_TERMS_VERSION], `purchase terms changed under ${PURCHASE_TERMS_VERSION}: bump it; new fingerprint ${fp(purchaseTermsText(), PURCHASE_TERMS_VERSION)}`).toBe(PINNED.purchase);
  });

  it('the ticks ask for exactly these versions and link these pages; the coach store keeps its own terms', () => {
    expect([COACH_TERMS_VERSION, COACH_TERMS_HREF]).toEqual([COACH_TERMS_DOC_VERSION, COACH_TERMS_PAGE_HREF]);
    expect(BUYER_TERMS.fel_pro).toEqual({ version: PURCHASE_TERMS_VERSION, href: PURCHASE_TERMS_HREF });
    expect(BUYER_TERMS.coach_package).toEqual({ version: PURCHASE_TERMS_VERSION, href: PURCHASE_TERMS_HREF });
    expect(STORE_TERMS_VERSION).toBe('store-terms-2026-10-12');
  });

  it('every text carries the visible-to-owner note in its source', () => {
    for (const f of ['lib/coach-terms.ts', 'lib/purchase-terms.ts', 'lib/policies.ts', 'app/coach-terms/page.tsx', 'app/purchase-terms/page.tsx']) {
      expect(readFileSync(f, 'utf8'), f).toContain('Drafted by Claude 2026-10-27 on owner approval; not lawyer-reviewed.');
    }
  });
});

describe('C12: the coach terms fill the blanks with the defaults, read from the code', () => {
  const text = coachTermsText();
  it('the buyer pays the processing fee; FEL keeps 5% on Free, 0% on Pro (the config defaults)', () => {
    expect(text).toContain("The buyer pays Stripe's processing fee.");
    expect([bpsLabel(PLATFORM_FEE_BPS_FREE_DEFAULT), bpsLabel(PLATFORM_FEE_BPS_PRO_DEFAULT)]).toEqual(['5%', '0%']);
    expect(text).toContain("**FEL's share:** 5% of your listed price on each sale you make on Coach Free, and 0% on Coach Pro.");
    expect(text).not.toMatch(/out of the 5%|platform pays/);   // the card's out-of-date line ("the platform pays them out of the 5%") is gone
  });

  it('Free and Pro limits come from the config (3 clients, $39 a month), not typed in', () => {
    expect(text).toContain(`up to ${FREE_CLIENT_LIMIT_DEFAULT} active clients`);
    expect(text).toContain(`**Coach Pro:** ${usdPlain(COACH_PRO_PRICE_DEFAULT_CENTS)} a month.`);
    expect([FREE_CLIENT_LIMIT_DEFAULT, COACH_PRO_PRICE_DEFAULT_CENTS]).toEqual([3, 3900]);
    expect(readFileSync('lib/coach-terms.ts', 'utf8')).not.toMatch(/\$39|up to 3 /);
  });

  it('refund minimum, insurance, credentials, disputes, negative balances, minors', () => {
    expect(text).toContain('a full refund for any session, or any program week, that has not been delivered yet');
    expect(REFUND_PROCESSING_FEE_DEFAULT).toBe(true);
    expect(text).toContain("**The processing fee is refunded too, at FEL's cost.**");
    expect(text).toContain('we recommend professional liability insurance for your coaching. It is not required.');
    expect(text).toContain('claim only the certifications, licences and experience you really hold');
    expect(text).toMatch(/the dispute fee and any amount lost are yours\. Stripe takes them from FEL first\. FEL can recover them from your future payouts\./);
    expect(text).toMatch(/FEL can recover the amount from your future payouts\. FEL can also pause your payouts until the balance is back above zero\./);
    expect(text).toContain('**Under 13: never.**');
    expect(text).toContain("only through FEL's own invite code or link, and only after a parent or legal guardian has said yes to coached training");
    expect(text).toContain('**No contact outside FEL.**');
  });
});

describe('C28: the purchase terms fill the blanks with the defaults', () => {
  const text = purchaseTermsText();
  it('FEL Pro: cancel any time, access to the end of the paid period, a full refund within 14 days of a charge', () => {
    expect(PURCHASE_REFUND_DAYS).toBe(14);
    expect(text).toContain(`**Cancel at any time** by emailing **${BUSINESS_CONTACT_EMAIL}**`);
    expect(text).toContain('**You keep FEL Pro until the end of the period you have paid for.**');
    expect(text).toContain('| FEL Pro (weekly or monthly) | A full refund of a charge if you ask within 14 days of it | FEL Pro ends when we refund, and the subscription is cancelled |');
    expect(text).toContain('**"Full" means everything you paid,** including any processing fee.');
    expect(text).toContain('**It renews automatically.**');
  });

  it("18+ only, verified by birth year; coaches' packages carry the coach's refund minimum; the coach store keeps its own text", () => {
    expect(text).toContain('**Adults (18+) only, verified by birth year.**');
    expect(text).toContain('At the least: a full refund for any session, or any program week, not yet delivered');
    expect(text).toContain('| Coach store and audiobooks | As the [store terms](/store-terms) say | As the store terms say |');
  });

  it('cancelling names email only: the in-app billing link is not built (control: nothing links /api/stripe/portal)', () => {
    expect(text).not.toMatch(/billing page|Manage billing/);
    const { execSync } = require('node:child_process') as typeof import('node:child_process');
    const callers = execSync("grep -rln \"api/stripe/portal\" app components --include=*.tsx --include=*.ts | grep -v '^app/api/' | grep -v '\\.test\\.' || true", { encoding: 'utf8' }).split('\n').filter(Boolean);
    expect(callers).toEqual([]);   // when a page links it, add it to the cancel line (and bump the version)
  });
});

describe('the pages', () => {
  const render = async (Page: unknown) => renderToStaticMarkup(await (Page as () => Promise<React.ReactElement>)());
  it('/coach-terms and /purchase-terms render every section through the safe renderer, with their version', async () => {
    const coach = await render(CoachTermsPage);
    const purchase = await render(PurchaseTermsPage);
    expect(coach).toContain(`Coach terms version: ${COACH_TERMS_DOC_VERSION}`);
    expect(purchase).toContain(`Purchase terms version: ${PURCHASE_TERMS_VERSION}`);
    for (const s of COACH_TERMS_SECTIONS) expect(coach).toContain(`<section id="${s.id}">`);
    for (const s of PURCHASE_TERMS_SECTIONS) expect(purchase).toContain(`<section id="${s.id}">`);
    for (const html of [coach, purchase]) {
      for (const [, href] of html.matchAll(/href="([^"]+)"/g)) expect(href.startsWith('/'), href).toBe(true);
      expect(html).not.toContain('<script');
    }
    expect(purchase).toContain('<table>');
  });

  it('both are public pages in the sitemap list, like /store-terms', () => {
    for (const p of ['/coach-terms', '/purchase-terms', '/store-terms']) expect(PUBLIC_STATIC_PATHS as readonly string[]).toContain(p);
  });
});
