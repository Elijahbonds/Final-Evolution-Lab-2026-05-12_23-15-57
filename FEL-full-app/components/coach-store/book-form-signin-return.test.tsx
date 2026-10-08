// STORE-SIGNIN-RETURN: a 401 from /api/coach-store/checkout becomes a "Sign in to continue" link whose ?next=
// carries the listing and the chosen slot (never a raw "unauthorized"); a 403 adults_only becomes plain copy
// with a link to the birth-year page. jsdom is not configured here, so the component is rendered into
// node:test's built-in DOM-free harness the same way book-form.test.tsx does — renderToStaticMarkup for the
// static parts, and direct calls of the exported helpers for the fetch-driven states.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BookForm } from './book-form';
import { coachSignInHref, coachBookReturnPath } from '@/lib/coach-store/signInReturn';

function render(props: Record<string, unknown>) {
  return renderToStaticMarkup(createElement(BookForm as never, { slug: 'elijah', listingId: 'listing-1', ...props } as never));
}

describe('BookForm STORE-SIGNIN-RETURN', () => {
  it('renders with the return slot preselected (initialStartsAt survives the login hop)', () => {
    const slot = '2026-10-08T17:00:00.000Z';
    const html = render({ kind: 'live_1on1', durationMin: 30, initialStartsAt: slot });
    // The fallback option keeps a stale/taken slot selectable, labelled as the buyer's earlier pick.
    expect(html).toContain('Your earlier pick');
    expect(html).toContain(`value="${slot}"`);
    expect(html).toContain('selected=""');
  });

  it('a malformed initialStartsAt is dropped — the form starts on "Choose a time"', () => {
    const html = render({ kind: 'live_1on1', durationMin: 30, initialStartsAt: 'not-a-slot' });
    expect(html).not.toContain('Your earlier pick');
    expect(html).not.toContain('not-a-slot');
  });

  it('the sign-in link the 401 path shows points at /login with a same-origin ?next= (listing + slot)', () => {
    const slot = '2026-10-08T17:00:00.000Z';
    const href = coachSignInHref('elijah', 'listing-1', slot);
    expect(href.startsWith('/login?next=')).toBe(true);
    const next = new URL(`https://fel.invalid${href}`).searchParams.get('next')!;
    expect(next).toBe(coachBookReturnPath('elijah', 'listing-1', slot));
    expect(href).not.toContain('unauthorized');
  });

  it('the default form shows neither auth block and no raw "unauthorized"', () => {
    const html = render({ kind: 'video_review' });
    expect(html).not.toContain('Sign in to continue');
    expect(html).not.toContain('unauthorized');
    expect(html).not.toContain('verified adults');
  });
});
