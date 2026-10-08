// STORE-READY B2 (buy button): a 409 store_closed from /api/coach-store/checkout becomes a friendly
// "Checkout opens soon." notice in neutral styling — not the red error text, never "payments not set up"
// or "error", and no redirect. Every other non-ok answer behaves as today (a 500 still shows the error).
//
// book-form's closed/error branch is client-side and fetch-driven; jsdom is not configured here, so the
// classification (the decision the flag hinges on) is asserted from source and the static first paint by
// renderToStaticMarkup — the same pattern as book-form.test.tsx / book-form-signin-return.test.tsx.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BookForm } from './book-form';

const src = readFileSync('components/coach-store/book-form.tsx', 'utf8');

function render(props: Record<string, unknown>) {
  return renderToStaticMarkup(createElement(BookForm as never, { slug: 'elijah', listingId: 'listing-1', ...props } as never));
}

describe('B2 book-form: 409 store_closed is a friendly "Checkout opens soon." notice', () => {
  it('authOrMessage maps 409 { error: store_closed } to the closed branch (source)', () => {
    expect(src).toContain("res.status === 409 && json.error === 'store_closed'");
    expect(src).toContain("return 'store_closed'");
  });

  it('the closed branch sets the neutral "Checkout opens soon." notice, not the red error (source)', () => {
    expect(src).toContain("else if (outcome === 'store_closed') setClosedNotice('Checkout opens soon.')");
    // The notice renders in a neutral <p role="status">, NOT the red error class and NOT the error state.
    expect(src).toMatch(/closedNotice \? \([\s\S]*?role="status"[\s\S]*?\{closedNotice\}/);
    expect(src).toContain('Checkout opens soon.');
    // The red error paragraph is only for the real error branch.
    expect(src).toContain('error ? <p className="text-sm text-red-300">{error}</p> : null');
  });

  it('never shows "payments not set up" or the word "error" for the closed store (source)', () => {
    // The closed-notice copy is exactly the friendly sentence, with no raw error surface.
    expect(src).not.toMatch(/closedNotice[^;]*payments not set up/);
    expect(src).not.toMatch(/setClosedNotice\([^)]*error/i);
  });

  it('the static first paint shows no closed notice, no error, and the buy button is intact', () => {
    const html = render({ kind: 'video_review' });
    expect(html).not.toContain('Checkout opens soon');
    expect(html).not.toContain('payments not set up');
    expect(html).toContain('<button');
  });
});

// STORE-TERMS-2: every checkout carries a required terms checkbox that starts UNTICKED on every load,
// and the POST names the current terms version (the server is the real gate — see storeClosed.test.ts).
describe('STORE-TERMS-2 book-form: required, unticked-on-load terms checkbox', () => {
  it('renders an unticked checkbox linking to /store-terms (source + first paint)', () => {
    expect(src).toContain('const [termsAgreed, setTermsAgreed] = useState(false)');
    expect(src).toContain('href="/store-terms"');
    expect(src).toContain('checked={termsAgreed}');
    const html = render({ kind: 'video_review' });
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('/store-terms');
    // Unticked on load: no checked attribute in the static paint.
    expect(html).not.toMatch(/<input[^>]*checkbox[^>]*checked/);
  });

  it('never pre-ticks or remembers the box (source)', () => {
    expect(src).not.toMatch(/setTermsAgreed\(true\)/); // only ever set from the input's onChange
    expect(src).not.toMatch(/localStorage|sessionStorage[^)]*terms/i);
    expect(src).toContain('onChange={(e) => setTermsAgreed(e.target.checked)}');
  });

  it('a submit with the box unticked stops client-side with a friendly message (source)', () => {
    expect(src).toContain("if (!termsAgreed) { setError('Please agree to the store terms to continue.'); return; }");
  });

  it('the POST sends termsAccepted + the current termsVersion (source)', () => {
    expect(src).toContain('termsAccepted: true');
    expect(src).toContain('termsVersion: STORE_TERMS_VERSION');
    expect(src).toContain("import { STORE_TERMS_VERSION } from '@/lib/store-terms'");
  });

  it('a server 409 terms_required re-prompts in place (source)', () => {
    expect(src).toContain("json.error === 'terms_required'");
    expect(src).toContain("return 'terms_required'");
  });
});
