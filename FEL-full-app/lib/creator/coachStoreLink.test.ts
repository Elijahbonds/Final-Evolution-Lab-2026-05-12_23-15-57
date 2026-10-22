import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bookHrefWhenStoreOpen } from './coachStoreLink';
import { coachStoreBookHref, getApprovedProfile } from './creatorCatalog';

describe('Book links only while the coach store is open', () => {
  const href = coachStoreBookHref(getApprovedProfile('elijah-bonds')!);

  it('keeps the link when the store is open and drops it when the store is closed', () => {
    expect(href).toBe('/coach/elijahbonds');
    expect(bookHrefWhenStoreOpen(href, true)).toBe('/coach/elijahbonds');
    expect(bookHrefWhenStoreOpen(href, false)).toBeNull();
    expect(bookHrefWhenStoreOpen(null, true)).toBeNull();
  });

  it('defaults to the real flag, which is off unless COACH_STORE_ENABLED is set', () => {
    const was = process.env.COACH_STORE_ENABLED;
    try {
      delete process.env.COACH_STORE_ENABLED;
      expect(bookHrefWhenStoreOpen(href)).toBeNull();
      process.env.COACH_STORE_ENABLED = '1';
      expect(bookHrefWhenStoreOpen(href)).toBe('/coach/elijahbonds');
    } finally {
      if (was === undefined) delete process.env.COACH_STORE_ENABLED; else process.env.COACH_STORE_ENABLED = was;
    }
  });

  it('both /team pages send the href through it (the live /team linked a 404)', () => {
    const calls: Record<string, RegExp> = {
      'app/team/page.tsx': /bookHrefWhenStoreOpen\(coachStoreBookHref\(profile\), coachStoreOpen\)/,
      'app/team/[slug]/page.tsx': /bookHrefWhenStoreOpen\(coachStoreBookHref\(profile\)\)/,
    };
    for (const [f, call] of Object.entries(calls)) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).toMatch(call);
    }
  });
});
