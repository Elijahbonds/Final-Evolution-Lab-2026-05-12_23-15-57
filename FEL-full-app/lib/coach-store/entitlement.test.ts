// STORE-LISTING-FORMAT: productsGrantedBy is pure — every manifest kind maps to the right store-price keys.
import { describe, expect, it } from 'vitest';
import { missingBundleParts, productsGrantedBy } from './entitlement';

describe('productsGrantedBy', () => {
  it('a dunking program grants the dunking 8-week product', () => {
    expect(productsGrantedBy({ kind: 'program', lane: 'dunking', billing: 'one_time' })).toEqual(['dunking-plyometrics-8wk']);
  });

  it('a non-dunking program (not sellable anyway) grants nothing', () => {
    expect(productsGrantedBy({ kind: 'program', lane: 'correctives', billing: 'one_time' })).toEqual([]);
    expect(productsGrantedBy({ kind: 'program', lane: 'posture', billing: 'one_time' })).toEqual([]);
  });

  it('a course grants its own product', () => {
    expect(productsGrantedBy({ kind: 'course', product: 'signature-dunk-course', billing: 'one_time' })).toEqual(['signature-dunk-course']);
  });

  it('a series grants its own product', () => {
    expect(productsGrantedBy({ kind: 'series', product: 'blueprint-series', billing: 'one_time' })).toEqual(['blueprint-series']);
  });

  it('the bundle grants all three members', () => {
    const members = ['dunking-plyometrics-8wk', 'signature-dunk-course', 'blueprint-series'];
    expect(productsGrantedBy({ kind: 'bundle', product: 'bundle-all-three', billing: 'one_time', members })).toEqual(members);
  });

  it('memberships grant none of the three course/series/bundle products', () => {
    expect(productsGrantedBy({ kind: 'membership', audience: 'adult', interval: 'month' })).toEqual([]);
    expect(productsGrantedBy({ kind: 'membership', audience: 'teen', interval: 'month' })).toEqual([]);
  });

  it('membershipIncludesCourses false (explicit) → memberships grant nothing', () => {
    const policy = { membershipIncludesCourses: false };
    expect(productsGrantedBy({ kind: 'membership', audience: 'adult', interval: 'month' }, policy)).toEqual([]);
    expect(productsGrantedBy({ kind: 'membership', audience: 'teen', interval: 'month' }, policy)).toEqual([]);
  });

  it('membershipIncludesCourses true → memberships grant the course and series products (not the 8-week program)', () => {
    const policy = { membershipIncludesCourses: true };
    const want = ['signature-dunk-course', 'blueprint-series'];
    expect(productsGrantedBy({ kind: 'membership', audience: 'adult', interval: 'month' }, policy)).toEqual(want);
    expect(productsGrantedBy({ kind: 'membership', audience: 'teen', interval: 'month' }, policy)).toEqual(want);
  });

  it('the policy never changes what program/course/series/bundle/live/review grant', () => {
    for (const membershipIncludesCourses of [false, true]) {
      const policy = { membershipIncludesCourses };
      expect(productsGrantedBy({ kind: 'program', lane: 'dunking', billing: 'one_time' }, policy)).toEqual(['dunking-plyometrics-8wk']);
      expect(productsGrantedBy({ kind: 'course', product: 'signature-dunk-course', billing: 'one_time' }, policy)).toEqual(['signature-dunk-course']);
      expect(productsGrantedBy({ kind: 'live_1on1', durationMin: 60 }, policy)).toEqual([]);
      expect(productsGrantedBy({ kind: 'video_review', maxClips: 3, maxClipSeconds: 60 }, policy)).toEqual([]);
    }
  });

  it('live 1:1 and async review grant none of the three', () => {
    expect(productsGrantedBy({ kind: 'live_1on1', durationMin: 30 })).toEqual([]);
    expect(productsGrantedBy({ kind: 'video_review', maxClips: 3, maxClipSeconds: 60 })).toEqual([]);
  });
});

describe('missingBundleParts', () => {
  const members = ['dunking-plyometrics-8wk', 'signature-dunk-course', 'blueprint-series'];

  it('owning the course → missing parts are the 8-week program ($79) and the series ($29)', () => {
    expect(missingBundleParts(members, new Set(['signature-dunk-course']))).toEqual([
      { key: 'dunking-plyometrics-8wk', title: 'Dunking & Plyometrics 8-week', priceCents: 7900 },
      { key: 'blueprint-series', title: 'Blueprint series', priceCents: 2900 },
    ]);
  });

  it('owning nothing → all three parts with their individual prices', () => {
    expect(missingBundleParts(members, new Set()).map((p) => p.priceCents)).toEqual([7900, 3900, 2900]);
  });

  it('owning everything → nothing missing', () => {
    expect(missingBundleParts(members, new Set(members))).toEqual([]);
  });

  it('a member key not in storePrices is still listed, with null title/price', () => {
    expect(missingBundleParts(['not-a-store-key'], new Set())).toEqual([{ key: 'not-a-store-key', title: null, priceCents: null }]);
  });
});
