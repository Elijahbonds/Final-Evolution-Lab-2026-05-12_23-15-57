import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CreditsList } from './credits-list';
import { CREDITS, LICENCE_PENDING, PENDING_OWNER, type Credit } from '@/lib/credits/credits';

// HOTFIX (2026-09-24): the page is the thing a licensor reads, so render it and read it back.
const html = renderToStaticMarkup(createElement(CreditsList));
const text = html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, ' ');

describe('the credits page', () => {
  it('shows CMU’s acknowledgement word for word', () => {
    expect(text).toContain(
      'The data used in this project was obtained from mocap.cs.cmu.edu. The database was created with funding from NSF EIA-0196217.',
    );
  });

  it('lists every entry with who made it and what it is used for', () => {
    for (const c of CREDITS) {
      expect(text, c.id).toContain(c.title);
      expect(text, c.id).toContain(c.by);
      expect(text, c.id).toContain(c.used);
    }
  });

  it('shows each recorded licence, linked to its text where there is one', () => {
    for (const c of CREDITS.filter((x) => x.status !== 'pending')) {
      expect(text, c.id).toContain(c.licence);
      if (c.licenceUrl) expect(html, c.id).toContain(`href="${c.licenceUrl}"`);
    }
  });

  // HOTFIX (2026-09-24): the licences the owner is still confirming read "licence being confirmed", one per entry on
  // PENDING_OWNER, and nothing else on the page says it.
  it('says "licence being confirmed" for exactly the owner’s pending list, and never invents a licence', () => {
    const shown = text.split(LICENCE_PENDING).length - 1;
    expect(shown).toBe(PENDING_OWNER.length);
    expect(CREDITS.filter((c) => c.status === 'pending').map((c) => c.id).sort()).toEqual([...PENDING_OWNER].sort());
  });

  it('renders a pending entry as being confirmed even if a licence string slipped into it', () => {
    // HOTFIX (2026-09-24): nothing on the real list is pending now (the owner answered all three), so make one up.
    const slipped: Credit = {
      id: 'new-thing', section: 'models', title: 'New thing', by: 'Not yet confirmed', used: 'Something on a screen.',
      licence: 'CC0 1.0', status: 'pending', recordedIn: [], covers: [], manifestLicences: [], missing: 'Who made it.',
    };
    const m = renderToStaticMarkup(createElement(CreditsList, { credits: [slipped] }));
    expect(m).toContain(LICENCE_PENDING);
    expect(m).not.toContain('CC0 1.0');
  });

  it('does not claim to list every outside source (the npm libraries are not on it)', () => {
    expect(text).not.toMatch(/every outside source/i);
  });

  it('prints no asset file paths, which carry character and person names', () => {
    for (const c of CREDITS) for (const cover of c.covers) {
      if (cover.includes('/')) expect(html, `${c.id}: ${cover}`).not.toContain(cover);
    }
    expect(text).not.toMatch(/elijah|amir|eric nash/i);
  });

  it('opens outside links in a new tab without handing them this page', () => {
    const blank = html.match(/<a [^>]*target="_blank"[^>]*>/g) ?? [];
    expect(blank.length).toBeGreaterThan(5);
    for (const a of blank) expect(a).toContain('rel="noopener noreferrer"');
  });
});

describe('where the page is linked from', () => {
  const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');

  it('the logged-out legal footer, the support page and the login view all link /credits', () => {
    expect(read('components/public-chrome.tsx')).toContain('href="/credits"');
    expect(read('app/support/page.tsx')).toContain('href="/credits"');
    expect(read('components/auth-form.tsx')).toContain('href="/credits"');
  });

  it('names the link for licences, so it does not read as the Lab Credits wallet', () => {
    // HOTFIX (2026-09-24): the currency is also called "Credits" in the game shell.
    const label = (src: string) => src.match(/href="\/credits"[^>]*>([^<]+)</)?.[1];
    expect(label(read('components/public-chrome.tsx'))).toBe('Credits &amp; licences');
    expect(label(read('components/auth-form.tsx'))).toBe('Credits &amp; licences');
  });
});
