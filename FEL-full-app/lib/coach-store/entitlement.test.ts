// STORE-LISTING-FORMAT: productsGrantedBy is pure — every manifest kind maps to the right store-price keys.
import { describe, expect, it } from 'vitest';
import { productsGrantedBy } from './entitlement';

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

  it('live 1:1 and async review grant none of the three', () => {
    expect(productsGrantedBy({ kind: 'live_1on1', durationMin: 30 })).toEqual([]);
    expect(productsGrantedBy({ kind: 'video_review', maxClips: 3, maxClipSeconds: 60 })).toEqual([]);
  });
});
