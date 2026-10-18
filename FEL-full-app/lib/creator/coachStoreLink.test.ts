import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ELIJAH_COACH_STORE_HREF, ELIJAH_DUNK_PROGRAM_HREF } from './coachStoreHrefs';
import { bookHrefWhenStoreOpen } from './coachStoreLink';
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
    for (const f of ['app/team/page.tsx', 'app/team/[slug]/page.tsx']) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).toContain('bookHrefWhenStoreOpen(coachStoreBookHref(profile))');
    }
  });

  it('keeps shipped Elijah CTAs on the approved coach-store slug', () => {
    expect(ELIJAH_COACH_STORE_HREF).toBe(href);
    expect(ELIJAH_DUNK_PROGRAM_HREF).toBe(`${ELIJAH_COACH_STORE_HREF}/programs/dunking`);
    for (const f of [
      'components/sessions-view.tsx',
      'app/play/mirror/assess/results/adult-train.tsx',
      'app/screen/program/[lane]/adult-dunk.tsx',
    ]) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/['"]\/coach\/elijah['"]/);
      expect(src, f).not.toMatch(/['"]\/coach\/elijah\/programs\/dunking['"]/);
    }
  });
});
