// STORE-LISTING-FORMAT: FE PM's two one-line defaults (1:25 PM PT, Oct 4 2026). membershipIncludesCourses was
// answered by Elijah (4:18 PM PT, Oct 7 2026, STORE-ECON-EDU-10 Phase 3): a membership opens a real program, so
// it DOES include the course and series. bundleOwnedPartsMode stays as decided.
import { describe, expect, it } from 'vitest';
import { bundleOwnedPartsMode, membershipIncludesCourses } from './bundlePolicy';

describe('bundlePolicy defaults', () => {
  it('a membership includes the course and series (Elijah: a membership opens a real program)', () => {
    expect(membershipIncludesCourses).toBe(true);
  });

  it('buying the bundle while owning any part is blocked', () => {
    expect(bundleOwnedPartsMode).toBe('block_if_any_owned');
  });
});
