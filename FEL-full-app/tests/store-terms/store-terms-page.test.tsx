// STORE-TERMS-3 (e) + (f): the /store-terms page renders the approved text through the SAFE renderer,
// fills the address token, and emits one stable <section id> anchor per section. app/ is outside vitest's
// includes, so — like tests/screen-a/live-hud.test.tsx — the page test lives under tests/. No DOM runner
// here: the page is mocked to a synchronous render (renderToStaticMarkup, the real first paint), the safe
// renderer is called directly, and the wiring is read from source.
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { STORE_TERMS_SECTIONS, STORE_TERMS_VERSION } from '@/lib/store-terms';
import { BUSINESS_MAILING_ADDRESS } from '@/lib/legal/business';
import { anchorId, escapeHtml, renderSection, renderStoreTerms } from '@/lib/store-terms/render';

// The page is an async server component reading the session; mock the session + chrome so the render is
// synchronous and deterministic (the chrome is layout, not under test here).
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => null) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/components/public-chrome', () => ({
  PublicTopBar: () => null,
  PublicLegalFooter: () => null,
}));

import StoreTermsPage from '@/app/store-terms/page';

const pageSrc = readFileSync('app/store-terms/page.tsx', 'utf8');

describe('(e) the /store-terms page', () => {
  it('renders the full approved text with the address line hidden (no address set) and the version shown', async () => {
    // StoreTermsPage is an async server component; await its JSX (React 18 SSR can't take the Promise as a child).
    const jsx = await (StoreTermsPage as unknown as () => Promise<React.ReactElement>)();
    const html = renderToStaticMarkup(jsx);
    // The approved copy is present.
    expect(html).toContain('Terms of Service and Refund');
    expect(html).toContain('REFUND');
    // No address is set, so the address line is hidden: no token, no placeholder, no "pending".
    expect(html).not.toContain('{BUSINESS_ADDRESS}');
    expect(html).not.toContain(escapeHtml(BUSINESS_MAILING_ADDRESS));
    expect(html).not.toMatch(/pending/i);
    expect(html).toContain(`Store terms version: ${STORE_TERMS_VERSION}`);
  });

  it('renders through the safe renderer, not the STORE-TERMS-2 regex converter (source)', () => {
    expect(pageSrc).toContain("import { renderStoreTerms } from '@/lib/store-terms/render'");
    expect(pageSrc).toContain('renderStoreTerms(');
    // The unescaped regex markdown converter is gone.
    expect(pageSrc).not.toContain('simpleMarkdown');
  });
});

describe('(f) the safe renderer and per-section anchors', () => {
  it('emits one <section id> per section, with the data ids as stable anchors', () => {
    const html = renderStoreTerms(STORE_TERMS_SECTIONS);
    for (const s of STORE_TERMS_SECTIONS) {
      expect(html).toContain(`<section id="${anchorId(s.id)}">`);
    }
    // The known anchors a buyer or the brief can link to.
    expect(html).toContain('<section id="contact">');
    expect(html).toContain('<section id="mailing-address">');
  });

  it('anchor ids are lowercase word characters (never number-based, no injection)', () => {
    expect(anchorId('refund-policy')).toBe('refund-policy');
    expect(anchorId('Weird Id! <script>')).toMatch(/^[a-z0-9-]+$/);
    expect(anchorId('Weird Id! <script>')).not.toContain('<');
  });

  it('escapes every text cell — the text can never inject markup', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;');
    expect(escapeHtml('"quoted" & \'apostrophe\'')).toBe('&quot;quoted&quot; &amp; &#39;apostrophe&#39;');
    const html = renderSection({ id: 'x', markdown: '## <script>alert(1)</script>\n' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('emits only "/" links; a non-"/" href degrades to plain text', () => {
    const ok = renderSection({ id: 'x', markdown: 'See [Terms](/terms) and [Privacy](/privacy).\n' });
    expect(ok).toContain('<a href="/terms">Terms</a>');
    expect(ok).toContain('<a href="/privacy">Privacy</a>');
    const external = renderSection({ id: 'x', markdown: 'Bad [click](https://evil.example) and [js](javascript:alert(1)).\n' });
    expect(external).not.toContain('href="https://evil.example"');
    expect(external).not.toContain('javascript:');
    // The label text survives even when the href is dropped.
    expect(external).toContain('click');
  });

  it('renders the Part B quick-view table as a table', () => {
    const refund = STORE_TERMS_SECTIONS.find((s) => s.id === 'refund-policy');
    expect(refund).toBeDefined();
    const html = renderSection(refund!);
    expect(html).toContain('<table>');
    expect(html).toContain('<td>Product</td>');
    expect(html).toContain('Coach no-show or coach cancels');
  });
});
