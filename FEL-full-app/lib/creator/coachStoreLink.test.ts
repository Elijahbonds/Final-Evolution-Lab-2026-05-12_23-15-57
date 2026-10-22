import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bookHrefWhenStoreOpen } from './coachStoreLink';
import { ELIJAH_COACH_STORE_HREF, ELIJAH_DUNK_PROGRAM_HREF } from './coachStoreHrefs';
import { coachStoreBookHref, getApprovedProfile } from './creatorCatalog';

describe('Book links only while the coach store is open', () => {
  const href = coachStoreBookHref(getApprovedProfile('elijah-bonds')!);

  it('keeps the link when the store is open and drops it when the store is closed', () => {
    expect(href).toBe(ELIJAH_COACH_STORE_HREF);
    expect(bookHrefWhenStoreOpen(href, true)).toBe(ELIJAH_COACH_STORE_HREF);
    expect(bookHrefWhenStoreOpen(href, false)).toBeNull();
    expect(bookHrefWhenStoreOpen(null, true)).toBeNull();
  });

  it('defaults to the real flag, which is off unless COACH_STORE_ENABLED is set', () => {
    const was = process.env.COACH_STORE_ENABLED;
    try {
      delete process.env.COACH_STORE_ENABLED;
      expect(bookHrefWhenStoreOpen(href)).toBeNull();
      process.env.COACH_STORE_ENABLED = '1';
      expect(bookHrefWhenStoreOpen(href)).toBe(ELIJAH_COACH_STORE_HREF);
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

  it('Elijah CTAs use the catalog slug instead of the retired short slug', () => {
    expect(ELIJAH_COACH_STORE_HREF).toBe('/coach/elijahbonds');
    expect(ELIJAH_DUNK_PROGRAM_HREF).toBe('/coach/elijahbonds/programs/dunking');
    const files = [
      'components/sessions-view.tsx',
      'app/play/mirror/assess/results/adult-train.tsx',
      'app/screen/program/[lane]/adult-dunk.tsx',
    ];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toContain('/coach/elijah\'');
      expect(src, f).not.toContain('/coach/elijah"');
    }
  });
});
