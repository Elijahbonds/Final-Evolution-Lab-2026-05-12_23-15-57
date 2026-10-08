// STORE-LISTING-FORMAT: FE PM's two one-line defaults (1:25 PM PT, Oct 4 2026) stay as decided until Elijah answers.
import { describe, expect, it } from 'vitest';
import { bundleOwnedPartsMode, membershipIncludesCourses } from './bundlePolicy';

describe('bundlePolicy defaults', () => {
  it('a membership does not include the course, series or bundle', () => {
    expect(membershipIncludesCourses).toBe(false);
  });

  it('buying the bundle while owning any part is blocked', () => {
    expect(bundleOwnedPartsMode).toBe('block_if_any_owned');
  });
});
