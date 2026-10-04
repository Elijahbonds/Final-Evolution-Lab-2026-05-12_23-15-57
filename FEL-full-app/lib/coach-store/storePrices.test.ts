import { afterEach, describe, expect, it } from 'vitest';
import { coachManifest, priceOk } from './manifest';
import { SESSION_LENGTHS } from './constants';
import { PROGRAM_LIBRARY_SEED } from './programLibrarySeed';
import { decideReferral } from './money';
import {
  getStorePrices,
  getStoreProgramGroupings,
  SHARED_DRILL_LIBRARY_VIDEO_IDS,
  STORE_PRICES,
  storePriceByKey,
  UNASSIGNED_VIDEO_IDS,
  type StorePriceRow,
} from './storePrices';

const ORIGINAL = process.env.COACH_STORE_ENABLED;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.COACH_STORE_ENABLED;
  else process.env.COACH_STORE_ENABLED = ORIGINAL;
});

const EXPECTED: Record<string, { cents: number; billing: 'one_time' | 'month' }> = {
  'dunking-plyometrics-8wk': { cents: 7900, billing: 'one_time' },
  'signature-dunk-course': { cents: 3900, billing: 'one_time' },
  'blueprint-series': { cents: 2900, billing: 'one_time' },
  'bundle-all-three': { cents: 11900, billing: 'one_time' },
  membership: { cents: 2999, billing: 'month' },
  'teen-membership': { cents: 1499, billing: 'month' },
  'async-review': { cents: 4500, billing: 'one_time' },
  'live-1on1-30': { cents: 6500, billing: 'one_time' },
  'live-1on1-60': { cents: 12000, billing: 'one_time' },
};

describe('STORE_PRICES: the nine approved rows', () => {
  it('has exactly the nine approved keys', () => {
    expect(STORE_PRICES.map((r) => r.key).sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it.each(Object.entries(EXPECTED))('%s is %o cents/billing and priceOk() accepts it', (key, exp) => {
    const row = storePriceByKey(key)!;
    expect(row).toBeDefined();
    expect(row.priceCents).toBe(exp.cents);
    expect(row.billing).toBe(exp.billing);
    expect(priceOk(row.priceCents)).toBe(true);
  });

  it('every row is buyer verified_adult, except teen-membership which is verified_adult_parent_for_teen', () => {
    for (const row of STORE_PRICES) {
      if (row.key === 'teen-membership') expect(row.buyer).toBe('verified_adult_parent_for_teen');
      else expect(row.buyer).toBe('verified_adult');
    }
  });
});

describe('manifests: parse, SESSION_LENGTHS, membership shape', () => {
  it('every non-null manifest parses with coachManifest', () => {
    for (const row of STORE_PRICES) {
      if (row.manifest === null) continue;
      expect(coachManifest.safeParse(row.manifest).success).toBe(true);
    }
  });

  it('live 30/60 match SESSION_LENGTHS exactly', () => {
    const live = STORE_PRICES.filter((r) => r.manifest?.kind === 'live_1on1');
    expect(live.map((r) => (r.manifest as { durationMin: number }).durationMin).sort((a, b) => a - b)).toEqual([...SESSION_LENGTHS].sort((a, b) => a - b));
  });

  it('memberships are interval month with audience adult/teen', () => {
    const membership = storePriceByKey('membership')!;
    const teen = storePriceByKey('teen-membership')!;
    expect(membership.manifest).toMatchObject({ kind: 'membership', audience: 'adult', interval: 'month' });
    expect(teen.manifest).toMatchObject({ kind: 'membership', audience: 'teen', interval: 'month' });
  });

  it('Signature, Blueprint and the bundle are priced but manifest null (unsellable)', () => {
    for (const key of ['signature-dunk-course', 'blueprint-series', 'bundle-all-three']) {
      expect(storePriceByKey(key)!.manifest).toBeNull();
    }
  });

  it('the six sellable items have non-null manifests', () => {
    for (const key of ['dunking-plyometrics-8wk', 'membership', 'teen-membership', 'async-review', 'live-1on1-30', 'live-1on1-60']) {
      expect(storePriceByKey(key)!.manifest).not.toBeNull();
    }
  });
});

describe('the bundle', () => {
  it('is its own entry whose componentKeys are exactly the three programs, and the three parts keep their own prices', () => {
    const bundle = storePriceByKey('bundle-all-three')!;
    expect(bundle.componentKeys).toEqual(['dunking-plyometrics-8wk', 'signature-dunk-course', 'blueprint-series']);
    expect(storePriceByKey('dunking-plyometrics-8wk')!.priceCents).toBe(7900);
    expect(storePriceByKey('signature-dunk-course')!.priceCents).toBe(3900);
    expect(storePriceByKey('blueprint-series')!.priceCents).toBe(2900);
    expect(bundle.priceCents).toBe(11900);
  });

  it('no non-bundle row carries componentKeys', () => {
    for (const row of STORE_PRICES) {
      if (row.key === 'bundle-all-three') continue;
      expect(row.componentKeys).toBeUndefined();
    }
  });
});

describe('program → videoId mapping', () => {
  const seedIds = new Set(PROGRAM_LIBRARY_SEED.map((e) => e.videoId));
  const programRows = (): StorePriceRow[] =>
    STORE_PRICES.filter((r) => ['dunking-plyometrics-8wk', 'signature-dunk-course', 'blueprint-series', 'bundle-all-three'].includes(r.key));

  it('matches the approved mapping exactly', () => {
    expect(storePriceByKey('dunking-plyometrics-8wk')!.videoIds).toEqual(['00j3HPZsPmY', '3GtJ-134D9s']);
    expect(storePriceByKey('signature-dunk-course')!.videoIds).toEqual([
      'cWYFVg6GsVU', 'xVE7Gegu27w', 'V0yX1H1OtQ8', 'tiHUrigssOA', 'isjAY8Oo58g', 's4U7IsjowuE',
    ]);
    expect(storePriceByKey('blueprint-series')!.videoIds).toEqual(['hrlGbS0r-hM', 'dAoLYThf1bc']);
    expect(storePriceByKey('bundle-all-three')!.videoIds).toEqual([
      '00j3HPZsPmY', '3GtJ-134D9s', 'cWYFVg6GsVU', 'xVE7Gegu27w', 'V0yX1H1OtQ8', 'tiHUrigssOA', 'isjAY8Oo58g', 's4U7IsjowuE', 'hrlGbS0r-hM', 'dAoLYThf1bc',
    ]);
  });

  it('every mapped videoId exists in PROGRAM_LIBRARY_SEED', () => {
    for (const row of programRows()) {
      for (const videoId of row.videoIds ?? []) expect(seedIds.has(videoId), videoId).toBe(true);
    }
  });

  it('the shared drill library is in no program\'s videoIds', () => {
    for (const shared of SHARED_DRILL_LIBRARY_VIDEO_IDS) {
      for (const row of programRows()) {
        expect(row.videoIds ?? [], `${shared} in ${row.key}`).not.toContain(shared);
      }
    }
  });

  it('mpRZl8VNWlo is in no program and not in the shared list', () => {
    expect(SHARED_DRILL_LIBRARY_VIDEO_IDS as readonly string[]).not.toContain('mpRZl8VNWlo');
    for (const row of programRows()) {
      expect(row.videoIds ?? []).not.toContain('mpRZl8VNWlo');
    }
    expect(UNASSIGNED_VIDEO_IDS).toEqual(['mpRZl8VNWlo']);
  });

  it('every per-video PROGRAM_LIBRARY_SEED entry stays priceCents null', () => {
    for (const entry of PROGRAM_LIBRARY_SEED) {
      expect(entry.priceCents).toBeNull();
    }
  });
});

describe('flag-gated read path', () => {
  it.each([undefined, '0', 'false', ''])('flag off (%j): getStorePrices and getStoreProgramGroupings return nothing', (v) => {
    if (v === undefined) delete process.env.COACH_STORE_ENABLED;
    else process.env.COACH_STORE_ENABLED = v;
    expect(getStorePrices()).toEqual([]);
    expect(getStoreProgramGroupings()).toEqual([]);
  });

  it('flag on: getStorePrices returns all nine, getStoreProgramGroupings returns the four', () => {
    process.env.COACH_STORE_ENABLED = '1';
    expect(getStorePrices().length).toBe(9);
    expect(getStoreProgramGroupings().length).toBe(4);
  });
});

describe('referral: memberships pay referrers; $10/wk floor is weekly-billed only (Elijah 11:53 PT)', () => {
  function membershipDecision(key: string) {
    const row = storePriceByKey(key)!;
    return decideReferral({
      referrerUserId: 'ref', buyerUserId: 'buy', coachUserId: 'coach',
      referrerIsAdult: true, buyerIsAdult: true, priceCents: row.priceCents, platformFeeCents: Math.floor(row.priceCents * 0.15),
      renewalIndex: 0, source: 'membership', billing: 'month', weeklyCents: null, monthCutCents: 0, share: 0.2,
      paidAt: new Date('2026-10-04T00:00:00Z'), sessionEndsAt: null,
    });
  }

  it('monthly $29.99 membership pays referrer, no floor', () => {
    const decision = membershipDecision('membership');
    expect(decision.reason).toBeNull();
    expect(decision.cutCents).toBe(Math.floor(Math.floor(2999 * 0.15) * 0.2));
  });

  it('monthly $14.99 teen membership pays referrer, no floor', () => {
    const decision = membershipDecision('teen-membership');
    expect(decision.reason).toBeNull();
    expect(decision.cutCents).toBe(Math.floor(Math.floor(1499 * 0.15) * 0.2));
  });

  it('weekly-billed under 1000¢/week still gets no referral', () => {
    const decision = decideReferral({
      referrerUserId: 'ref', buyerUserId: 'buy', coachUserId: 'coach',
      referrerIsAdult: true, buyerIsAdult: true, priceCents: 999, platformFeeCents: Math.floor(999 * 0.15),
      renewalIndex: 0, source: 'membership', billing: 'week', weeklyCents: 999, monthCutCents: 0, share: 0.2,
      paidAt: new Date('2026-10-04T00:00:00Z'), sessionEndsAt: null,
    });
    expect(decision.cutCents).toBe(0);
    expect(decision.reason).toBe('under_ten_a_week');
  });

  it('weekly-billed at/above 1000¢/week pays referrer', () => {
    const decision = decideReferral({
      referrerUserId: 'ref', buyerUserId: 'buy', coachUserId: 'coach',
      referrerIsAdult: true, buyerIsAdult: true, priceCents: 1000, platformFeeCents: Math.floor(1000 * 0.15),
      renewalIndex: 0, source: 'membership', billing: 'week', weeklyCents: 1000, monthCutCents: 0, share: 0.2,
      paidAt: new Date('2026-10-04T00:00:00Z'), sessionEndsAt: null,
    });
    expect(decision.reason).toBeNull();
    expect(decision.cutCents).toBe(Math.floor(Math.floor(1000 * 0.15) * 0.2));
  });
});
