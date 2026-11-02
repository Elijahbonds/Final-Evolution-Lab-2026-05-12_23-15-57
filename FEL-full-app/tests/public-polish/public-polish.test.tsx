// PUBLIC-POLISH (2026-11-02): the live sweep's non-readability fixes on the signed-out site (D1–D4, J5, J7, J9).
// Each case renders the surface as the visitor it was broken for, and the visitor it must not change for.
import { readFileSync } from 'node:fs';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SessionContext } from 'next-auth/react';
import { describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ session: null as { user: { id: string } } | null }));
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => h.session) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));

import { visitorKindFrom } from '@/components/auth/use-visitor';
import { ModesSignInNote, SignInChip, SIGN_IN_TO_PLAY } from '@/components/modes/sign-in-to-play';
import { LocalPartyFallback } from '@/components/party/social/party-hub';
import { termsMarkdown } from '@/lib/legal/terms-markdown';
import { TERMS_CONTENT } from '@/lib/policies';
import ModesPage from '@/app/modes/page';
import CoachBusinessThanksPage from '@/app/coach/business/thanks/page';

type Status = 'loading' | 'authenticated' | 'unauthenticated';
const as = (status: Status | null, el: ReactElement) =>
  renderToStaticMarkup(status
    ? createElement(SessionContext.Provider, { value: { status, data: status === 'authenticated' ? { user: {}, expires: '' } : null, update: async () => null } as never }, el)
    : el);

describe('who is looking', () => {
  it('maps the session status, and no provider is "unknown" (never a guest)', () => {
    expect(visitorKindFrom(undefined)).toBe('unknown');
    expect(visitorKindFrom('loading')).toBe('loading');
    expect(visitorKindFrom('unauthenticated')).toBe('guest');
    expect(visitorKindFrom('authenticated')).toBe('signed-in');
  });
});

describe('/modes (D2, J7)', () => {
  it('tells a signed-out visitor, above the list and on each card, that playing needs a free sign-in', () => {
    const page = as('unauthenticated', createElement(ModesPage));
    expect(page).toContain('data-testid="modes-signin-note"');
    expect(page).toContain('href="/login?next=%2Fmodes"');
    expect(page).toContain('href="/try"');
    const chips = page.match(/data-testid="mode-signin-chip"/g) ?? [];
    const cards = page.match(/--mode-accent:/g) ?? [];   // one per card (every card's route signs a guest in first)
    expect(chips.length).toBeGreaterThan(20);
    expect(chips.length).toBe(cards.length);
    expect(page).toContain(SIGN_IN_TO_PLAY);
  });

  it('shows no sign-in hint to a signed-in player, nor while the session is still loading', () => {
    for (const s of ['authenticated', 'loading'] as const) {
      const page = as(s, createElement(ModesPage));
      expect(page).not.toContain('modes-signin-note');
      expect(page).not.toContain('mode-signin-chip');
    }
    expect(renderToStaticMarkup(createElement(SignInChip))).toBe('');
    expect(renderToStaticMarkup(createElement(ModesSignInNote))).toBe('');
  });

  it('opens in plain words, not the shelf vocabulary', () => {
    const page = renderToStaticMarkup(createElement(ModesPage));
    expect(page).toContain('All live modes');
    expect(page).toMatch(/\d+ games, grouped by sport/);
    expect(page).not.toMatch(/shelf modes|training-floor entr|play contract/);
  });
});

describe('/party fallback (D1)', () => {
  it('a signed-out visitor learns what they can do now, that hosting signs them in, and that friends need no account', () => {
    const html = as('unauthenticated', createElement(LocalPartyFallback));
    expect(html).toContain("Online parties aren&#x27;t switched on here yet");   // still honest
    expect(html).toContain('data-testid="party-guest-explainer"');
    expect(html).toContain('href="/login?next=%2Fplay%2Fparty"');
    expect(html).toContain('href="/join"');
    expect(html).toMatch(/Making an account is free/);
  });

  it('a signed-in host goes straight to the room, with no sign-in line', () => {
    const html = as('authenticated', createElement(LocalPartyFallback));
    expect(html).toContain('href="/play/party"');
    expect(html).not.toContain('/login?next=');
    expect(html).not.toContain('party-guest-explainer');
    expect(html).not.toMatch(/Making an account is free/);
  });
});

describe('/coach/business/thanks (D3)', () => {
  const render = async (sessionId?: string) =>
    renderToStaticMarkup(await CoachBusinessThanksPage({ searchParams: sessionId ? { session_id: sessionId } : {} }));

  it('with no checkout session: no failed-payment wording, the site header, and a way on', async () => {
    h.session = null;
    const html = await render();
    expect(html).toContain('data-thanks="none"');
    expect(html).toContain('Nothing to show here');
    expect(html).not.toContain('could not confirm');
    expect(html).toContain('LOG IN');            // PublicTopBar for a signed-out visitor
    expect(html).toContain('href="/coach"');
    expect(html).toContain('href="/"');
  });

  it('a signed-in visitor gets no public header (the app shell has its own)', async () => {
    h.session = { user: { id: 'u1' } };
    const html = await render();
    expect(html).not.toContain('LOG IN');
    h.session = null;
  });

  it('with a session id it is the confirm-with-Stripe flow, unchanged', async () => {
    const html = await render('cs_test_123');
    expect(html).toContain('data-thanks="checking"');
    expect(html).not.toContain('Nothing to show here');
  });
});

describe('/press/receipt and /press/library with nothing to show (D3), by source', () => {
  it('the receipt with no session id offers the shop and the library, and the paid path is untouched', () => {
    const src = readFileSync('app/press/receipt/page.tsx', 'utf8');
    expect(src).not.toContain('This page needs the checkout session from Stripe.');
    expect(src).toContain('Go to the shop');
    expect(src).toContain('href="/press/library"');
    expect(src).toContain('recordPaidBookSession(checkoutForGrant, prismaBookStore())');
  });

  it("the library's log-in comes back to the library, beside a way to the shop", () => {
    const src = readFileSync('app/press/library/page.tsx', 'utf8');
    expect(src).toContain("loginPath('/press/library')");
    expect(src).toContain('Browse the books');
  });
});

describe('the Adventure routes (D4, J5), by source', () => {
  for (const f of ['app/play/adventure/stage.tsx', 'app/play/adventure-br/stage.tsx']) {
    it(`${f}: the title is the route's name, and a guest's spawn is marked a guest`, () => {
      const src = readFileSync(f, 'utf8');
      expect(src).not.toMatch(/THE ADVENTURE[^<\n]*\[PLACEHOLDER\]/);
      expect(src).toMatch(/guest: !signedIn,/);
    });
  }

  it('the BR page reads the session and hands it to the stage', () => {
    const page = readFileSync('app/play/adventure-br/page.tsx', 'utf8');
    expect(page).toContain('getServerSession(authOptions)');
    expect(page).toContain('<AdventureBRLoader signedIn={signedIn} />');
    expect(readFileSync('app/play/adventure-br/loader.tsx', 'utf8')).toContain('<Stage signedIn={signedIn} />');
  });
});

describe('/terms layout (J9)', () => {
  const html = termsMarkdown(TERMS_CONTENT);

  it('keeps a hard-wrapped sentence in one paragraph', () => {
    expect(html).toMatch(/you agree to these Terms of Service and our Privacy Policy\./);
    expect(html).not.toMatch(/you agree to<\/p>/);
    expect(html).toMatch(/you grant us a non-exclusive license/);
    expect(html).toMatch(/reverse-engineer the Service; harass other users/);
  });

  it('keeps the contact block on its own lines (they start upper-case)', () => {
    expect(termsMarkdown('Final Evolution LLC\nFinalEvolution.us@gmail.com\nMail: 1 Main St')).toBe(
      '<p>Final Evolution LLC</p>\n<p>FinalEvolution.us@gmail.com</p>\n<p>Mail: 1 Main St</p>',
    );
  });

  it('links the paths the text names, with the path itself as the link text', () => {
    for (const p of ['/purchase-terms', '/coach-terms', '/store-terms']) expect(html).toContain(`<a href="${p}">${p}</a>`);
    // no partial match inside a longer path
    expect(termsMarkdown('at /purchase-terms.')).toContain('<a href="/purchase-terms">/purchase-terms</a>.');
    expect(termsMarkdown('at /purchase-terms.')).not.toContain('<a href="/terms">');
  });
});
