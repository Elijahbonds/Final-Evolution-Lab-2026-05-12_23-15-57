// JOIN-LAB-HIDE (2026-09-29): the flyer and IG path lands on `/`, and the signed-out landing there is this hero. Until
// the adult waitlist asks an age question and saves safely (PRIVACY-CORE), `/` collects no email. These tests render the
// real hero with the switch off (unset, 'false') and on ('true'), so they fail if the form comes back while the switch is
// off, and they fail too if the switch stops being the only thing between the page and the form.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// The hero's analytics are not the form and are not under test here; stubbed so nothing is queued or sent.
vi.mock('@/lib/analytics', () => ({ track: vi.fn(), flush: vi.fn(async () => {}) }));

import { GuestLandingHero } from './guest-landing-hero';

const FLAG = 'NEXT_PUBLIC_JOIN_LAB_ENABLED';

/** Everything that makes the Join the Lab form a form. `>\s*Join\s*<` is the button's label: `</svg> Join</button>`. */
const FORM_MARKS: Array<[string, RegExp]> = [
  ['a <form>', /<form/],
  ['an email input', /type="email"/],
  ['the "Join the Lab" heading', /Join the Lab/],
  ['the "Join" button', />\s*Join\s*</],
];

/** The block the switch gates, as the hero renders it with the switch on. */
const FORM_BLOCK = /<div class="mx-auto mt-10 max-w-md">[\s\S]*?<\/form><\/div><\/div>/;

function heroWith(value: string | undefined): string {
  vi.stubEnv(FLAG, value);
  return renderToStaticMarkup(createElement(GuestLandingHero));
}

describe('the signed-out landing on / (GuestLandingHero)', () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  it.each([['unset', undefined], ["'false'", 'false']])('with the switch %s, renders no email form', (_label, value) => {
    const html = heroWith(value);
    for (const [what, mark] of FORM_MARKS) expect(html, what).not.toMatch(mark);
  });

  it('with the switch off, keeps the rest of the hero: PLAY NOW to /try and Log in to /login', () => {
    const html = heroWith(undefined);
    expect(html).toContain('PLAY NOW');
    expect(html).toContain('href="/try"');
    expect(html).toContain('href="/login"');
    expect(html).toContain('60 SECONDS');
  });

  it("with the switch 'true', the form is back: the switch is what hides it", () => {
    const html = heroWith('true');
    for (const [what, mark] of FORM_MARKS) expect(html, what).toMatch(mark);
  });

  it('the switch removes the form block and nothing else', () => {
    const on = heroWith('true');
    const off = heroWith(undefined);
    expect(on).toMatch(FORM_BLOCK);
    expect(on.replace(FORM_BLOCK, '')).toBe(off);
  });
});
