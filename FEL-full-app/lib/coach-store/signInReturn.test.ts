// STORE-SIGNIN-RETURN: the buyer returns from sign-in to the same listing with the same slot preselected, and
// ?next= stays a same-origin relative path (open-redirect guard, matching lib/auth/safeNext.test.ts's cases).
import { describe, expect, it } from 'vitest';
import {
  BOOK_SLOT_PARAM,
  coachBookPath,
  coachBookReturnPath,
  coachSignInHref,
  isSlotValue,
  slotFromSearchParams,
} from './signInReturn';

const SLOT = '2026-10-08T17:00:00.000Z';

describe('coachBookPath', () => {
  it('builds the listing page path', () => {
    expect(coachBookPath('elijah', 'listing-1')).toBe('/coach/elijah/book/listing-1');
  });

  it('rejects segments that could escape the path', () => {
    for (const bad of ['a/b', 'a?b', 'a#b', 'a\\b', 'a%2Fb', 'a:b', '', '  ', 'https://evil.example']) {
      expect(coachBookPath(bad, 'listing-1'), bad).toBeNull();
      expect(coachBookPath('elijah', bad), bad).toBeNull();
    }
    expect(coachBookPath(undefined, 'listing-1')).toBeNull();
    expect(coachBookPath('elijah', 42)).toBeNull();
  });
});

describe('coachBookReturnPath', () => {
  it('puts the slot in the return URL', () => {
    expect(coachBookReturnPath('elijah', 'listing-1', SLOT)).toBe(
      `/coach/elijah/book/listing-1?${BOOK_SLOT_PARAM}=${encodeURIComponent(SLOT)}`,
    );
  });

  it('omits the slot when there is none, and refuses an unsafe base', () => {
    expect(coachBookReturnPath('elijah', 'listing-1', '')).toBe('/coach/elijah/book/listing-1');
    expect(coachBookReturnPath('elijah', 'listing-1', undefined)).toBe('/coach/elijah/book/listing-1');
    expect(coachBookReturnPath('a/b', 'listing-1', SLOT)).toBeNull();
  });
});

describe('isSlotValue / slotFromSearchParams', () => {
  it('round-trips a slot through the return URL', () => {
    const path = coachBookReturnPath('elijah', 'listing-1', SLOT)!;
    const query = new URL(`https://fel.invalid${path}`).searchParams.get(BOOK_SLOT_PARAM)!;
    expect(slotFromSearchParams(query)).toBe(SLOT);
  });

  it('accepts a valid ISO timestamp and rejects junk', () => {
    expect(isSlotValue(SLOT)).toBe(true);
    expect(isSlotValue('2026-10-08')).toBe(false);          // bare date, no time
    expect(isSlotValue('not-a-slot')).toBe(false);
    expect(isSlotValue('')).toBe(false);
    expect(isSlotValue(undefined)).toBe(false);
    expect(slotFromSearchParams(undefined)).toBeNull();
    expect(slotFromSearchParams(['not-a-slot'])).toBeNull();
    expect(slotFromSearchParams([SLOT, 'ignored'])).toBe(SLOT);
  });
});

describe('coachSignInHref', () => {
  it('is a /login URL whose next= decodes to the listing page with the slot', () => {
    const href = coachSignInHref('elijah', 'listing-1', SLOT);
    expect(href.startsWith('/login?next=')).toBe(true);
    const next = new URL(`https://fel.invalid${href}`).searchParams.get('next')!;
    expect(next).toBe(`/coach/elijah/book/listing-1?${BOOK_SLOT_PARAM}=${encodeURIComponent(SLOT)}`);
  });

  it('next= is a same-origin relative path only (open-redirect test)', () => {
    for (const evil of ['//evil.example', 'https://evil.example', '/%2F%2Fevil.example', 'a\\b', 'a:b']) {
      const href = coachSignInHref(evil, 'listing-1', SLOT);
      expect(href, evil).toBe('/login');
      expect(href).not.toContain('evil.example');
    }
    const href = coachSignInHref('elijah', 'listing-1', SLOT);
    expect(href).not.toMatch(/https?:/);
    expect(new URL(`https://fel.invalid${href}`).searchParams.get('next')!.startsWith('/')).toBe(true);
  });
});
