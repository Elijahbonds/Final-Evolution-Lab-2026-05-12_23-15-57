// AGE-SCREEN: the picker has one selected option, the disabled empty placeholder, and a block replaces it.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgeStep } from './age-step';

afterEach(() => { vi.unstubAllGlobals(); });

function html(props: { mode: 'signup' | 'account' } = { mode: 'signup' }): string {
  return renderToStaticMarkup(createElement(AgeStep, props));
}

describe('age step', () => {
  it('selects exactly one option, the disabled empty Select year placeholder, and highlights no year', () => {
    const markup = html();
    const options = markup.match(/<option\b[^>]*>[\s\S]*?<\/option>/g) ?? [];
    const selected = options.filter((o) => /\bselected\b/.test(o));
    expect(selected).toHaveLength(1);
    expect(selected[0]).toContain('disabled');
    expect(selected[0]).toContain('value=""');
    expect(selected[0]).toContain('Select year');
    const years = options.filter((o) => !o.includes('Select year'));
    expect(years.length).toBeGreaterThan(0);
    for (const year of years) {
      expect(year).not.toMatch(/\bselected\b/);
      expect(year).not.toMatch(/\bclass=/);
    }
    expect(markup).not.toMatch(/\b(old enough|kids|kid|child|parent|adult|minor)\b/i);
    expect(markup).not.toContain('type="email"');
  });

  it('with the flag or the cookie present, renders the turn-away and no select or email input', () => {
    vi.stubGlobal('document', { cookie: 'fel_age_gate=1' });
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} });
    const fromCookie = html();
    expect(fromCookie).toContain('create an account for you right now.');
    expect(fromCookie).not.toContain('<select');
    expect(fromCookie).not.toContain('type="email"');

    vi.stubGlobal('document', { cookie: '' });
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => (key === 'fel:ageGate' ? '1' : null),
      setItem: () => {},
    });
    const fromFlag = html();
    expect(fromFlag).toContain('create an account for you right now.');
    expect(fromFlag).not.toContain('<select');
    expect(fromFlag).not.toContain('type="email"');
  });
});

// FN-BOX-1b (2026-10-19): the month and day are asked beside the year, as plain inputs (no second pre-selected option).
describe('age step: the full date', () => {
  it('renders a Month and a Day input under the year, and still exactly one selected option', () => {
    const markup = html();
    expect(markup).toMatch(/<input[^>]*aria-label="Month"/);
    expect(markup).toMatch(/<input[^>]*aria-label="Day"/);
    expect((markup.match(/<option\b[^>]*\bselected\b/g) ?? [])).toHaveLength(1);
    expect(markup).toContain('When were you born?');
  });
});
