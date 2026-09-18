// A BUYER FINDS OUT BEFORE THEY PAY, NOT AFTER (2026-09-13).
//
// The refund this file prevents: somebody buys an eight-week block and discovers in week three that the
// rest is gated behind a PRQ they do not have. `assignProgram` was always going to show them the locked
// items honestly — but only once the money had moved.
//
// The load-bearing test is the one where a sale is REFUSED. Everywhere else in the coaching layer the answer
// to "this athlete cannot use this yet" is to show it locked with its threshold. At a checkout that is not
// enough, because a caveat next to a Buy button is a caveat nobody reads.

import { describe, it, expect } from 'vitest';
import {
  buildListing, previewPurchase, requirementsOf, MIN_PRICE_CENTS, MAX_PRICE_CENTS,
} from './coachListing';
import type { CoachProgram } from '../profile/assignment';
import { PLATFORM_PROTOCOLS, type Protocol } from '../profile/protocol';
import { emptyProfile, type SharedProfile } from '../profile/sharedProfile';

const NOW = Date.parse('2026-09-13T12:00:00.000Z');
const ago = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

const myPrivate: Protocol = {
  key: 'my_drill', title: 'My drill', summary: 'x', minutes: 5, unlock: null,
  visibility: 'private', coachId: 'coach_me',
};
const CATALOGUE: Protocol[] = [...PLATFORM_PROTOCOLS, myPrivate];

function program(over: Partial<CoachProgram> = {}): CoachProgram {
  return {
    key: 'knee8', title: '8-week knee resilience', coachId: 'coach_me',
    outcome: 'Land from height without a recovery step.',
    visibility: 'published', retestAfterWeeks: 3,
    weeks: [
      { week: 1, focus: 'Settle the ankle', items: [{ protocolKey: 'ankle_prep', frequency: 4 }] },
      { week: 2, focus: 'Load the hinge', items: [{ protocolKey: 'hinge_pattern', frequency: 3 }] },
      { week: 3, focus: 'Absorb it', items: [{ protocolKey: 'depth_drop', frequency: 2 }] },
    ],
    ...over,
  };
}

/** An ungated block: anybody can use all of it. */
const ungated = () => program({
  key: 'breathe', title: 'Four weeks of breathing', retestAfterWeeks: 1,
  weeks: [{ week: 1, focus: 'x', items: [{ protocolKey: 'breath_reset', frequency: 5 }] }],
});

function buyer(composite: number, axes: Record<string, number> = {}, daysAgo = 1): SharedProfile {
  const p = emptyProfile('cl_buyer', 'Buyer');
  p.prq = [{ composite, axes, at: ago(daysAgo), sourceScanAt: ago(daysAgo) }];
  return p;
}

const FULL = { strength: 90, speed: 90, endurance: 90, agility: 90, power: 90, flexibility: 90, recovery: 90, mental: 90 };

describe('A LISTING DECLARES ITS REQUIREMENTS, DERIVED NOT TYPED', () => {
  it('every gate in the block shows up, hardest first', () => {
    const reqs = requirementsOf(program(), CATALOGUE);
    expect(reqs.length).toBeGreaterThan(0);
    for (let i = 1; i < reqs.length; i++) expect(reqs[i - 1].need).toBeGreaterThanOrEqual(reqs[i].need);
  });

  it('an axis appearing twice is listed ONCE, at the harder bar', () => {
    const twice = program({
      weeks: [{ week: 1, focus: 'x', items: [
        { protocolKey: 'depth_drop', frequency: 2 },
        { protocolKey: 'oscillatory_jump', frequency: 2 },
      ] }],
      retestAfterWeeks: 1,
    });
    const reqs = requirementsOf(twice, CATALOGUE);
    const axes = reqs.map((r) => r.axis);
    expect(new Set(axes).size).toBe(axes.length);
    // whatever the two protocols ask of a shared axis, the listing quotes the higher number
    const both = [...PLATFORM_PROTOCOLS].filter((p) => ['depth_drop', 'oscillatory_jump'].includes(p.key));
    for (const r of reqs) {
      const highest = Math.max(...both.flatMap((p) => (p.unlock?.all ?? []).filter((t) => t.axis === r.axis).map((t) => t.min)));
      expect(r.need, r.axis).toBe(highest);
    }
  });

  it('an ungated block requires nothing, and says so with an empty list', () => {
    expect(requirementsOf(ungated(), CATALOGUE)).toEqual([]);
  });
});

describe('WHAT MAY BE LISTED AT ALL', () => {
  it('a valid published block lists', () => {
    const r = buildListing(program(), CATALOGUE, 4_900);
    expect(r.listing).not.toBeNull();
    expect(r.listing!.weeks).toBe(3);
    expect(r.listing!.items).toBe(3);
    expect(r.problems).toEqual([]);
  });

  it('a block containing the coach’s own private work cannot be listed — buyers cannot see it', () => {
    const mine = program({ weeks: [{ week: 1, focus: 'x', items: [{ protocolKey: 'my_drill', frequency: 2 }] }], retestAfterWeeks: 1 });
    const r = buildListing(mine, CATALOGUE, 4_900);
    expect(r.listing).toBeNull();
    expect(r.problems.some((p) => p.where === 'protocols')).toBe(true);
  });

  it('an invalid block fails with the AUTHORING problems, not a price complaint', () => {
    const r = buildListing(program({ outcome: '' }), CATALOGUE, 4_900);
    expect(r.listing).toBeNull();
    expect(r.problems.some((p) => p.where === 'outcome')).toBe(true);
  });

  it('prices outside the bounds are refused', () => {
    for (const price of [0, -1, 100, MIN_PRICE_CENTS - 1, MAX_PRICE_CENTS + 1, 4_900.5]) {
      const r = buildListing(program(), CATALOGUE, price);
      expect(r.listing, String(price)).toBeNull();
      expect(r.problems.some((p) => p.where === 'price'), String(price)).toBe(true);
    }
  });

  it('and the bounds themselves list fine', () => {
    expect(buildListing(program(), CATALOGUE, MIN_PRICE_CENTS).listing).not.toBeNull();
    expect(buildListing(program(), CATALOGUE, MAX_PRICE_CENTS).listing).not.toBeNull();
  });
});

describe('THE BUYER IS TOLD HOW MUCH OF *THIS* BLOCK IS OPEN TO *THEM*', () => {
  it('a ready buyer gets all of it, and is told so plainly', () => {
    const p = previewPurchase(program(), CATALOGUE, buyer(92, FULL), NOW);
    expect(p.openNow).toBe(p.total);
    expect(p.fraction).toBe(1);
    expect(p.blockedBy).toEqual([]);
    expect(p.sellable).toBe(true);
    expect(p.advice).toMatch(/all of it is open/i);
  });

  it('a partly-ready buyer gets a NUMBER, not "some content may be locked"', () => {
    const p = previewPurchase(program(), CATALOGUE, buyer(45), NOW);
    expect(p.openNow).toBeGreaterThan(0);
    expect(p.openNow).toBeLessThan(p.total);
    expect(p.advice).toMatch(/\d+ of \d+ open to you today/);
    expect(p.sellable).toBe(true);
  });

  it('and is told they keep the whole block — a locked week is deferred, not withheld', () => {
    const p = previewPurchase(program(), CATALOGUE, buyer(45), NOW);
    expect(p.advice).toMatch(/keep the whole block/i);
  });

  it('blockedBy names only what is stopping THEM, hardest first', () => {
    const p = previewPurchase(program(), CATALOGUE, buyer(45), NOW);
    expect(p.blockedBy.length).toBeGreaterThan(0);
    for (let i = 1; i < p.blockedBy.length; i++) {
      expect(p.blockedBy[i - 1].need).toBeGreaterThanOrEqual(p.blockedBy[i].need);
    }
  });
});

describe('A SALE THAT WOULD DELIVER NOTHING IS REFUSED, NOT WARNED ABOUT', () => {
  const allGated = () => program({
    key: 'plyo', title: 'Plyometrics', retestAfterWeeks: 1,
    weeks: [{ week: 1, focus: 'x', items: [
      { protocolKey: 'depth_drop', frequency: 2 },
      { protocolKey: 'oscillatory_jump', frequency: 2 },
    ] }],
  });

  it('nothing open → sellable is FALSE', () => {
    const p = previewPurchase(allGated(), CATALOGUE, buyer(20, { flexibility: 20, recovery: 20, power: 20 }), NOW);
    expect(p.openNow).toBe(0);
    expect(p.sellable).toBe(false);
  });

  it('and the refusal names the NEAREST bar and invites them back', () => {
    const p = previewPurchase(allGated(), CATALOGUE, buyer(20, { flexibility: 20, recovery: 20, power: 20 }), NOW);
    expect(p.advice).toMatch(/nothing in this block is open to you yet/i);
    expect(p.advice).toMatch(/it starts at .+ \d+/);
    expect(p.advice).toMatch(/come back/i);
    // the nearest bar is the LOWEST one, not the first in the hardest-first list
    const lowest = Math.min(...p.blockedBy.map((r) => r.need));
    expect(p.advice).toContain(String(lowest));
  });

  it('AN UNSCANNED BUYER CANNOT BE SOLD A GATED BLOCK — nobody knows what they would get', () => {
    const p = previewPurchase(program(), CATALOGUE, emptyProfile('cl_buyer', 'B'), NOW);
    expect(p.sellable).toBe(false);
    expect(p.advice).toMatch(/system scan/i);
    expect(p.advice).toMatch(/neither of us can see/i);
  });

  it('a null profile is treated the same as an unscanned one', () => {
    expect(previewPurchase(program(), CATALOGUE, null, NOW).sellable).toBe(false);
  });

  it('but an UNGATED block sells to an unscanned buyer, because there is nothing to be uncertain about', () => {
    const p = previewPurchase(ungated(), CATALOGUE, null, NOW);
    expect(p.sellable).toBe(true);
    expect(p.openNow).toBe(p.total);
    expect(p.advice).toMatch(/all of it is open/i);
  });

  it('an empty block is never sellable', () => {
    const p = previewPurchase(program({ weeks: [], retestAfterWeeks: 1 }), CATALOGUE, buyer(92, FULL), NOW);
    expect(p.sellable).toBe(false);
    expect(p.total).toBe(0);
  });
});

describe('THE PREVIEW USES THE REAL GATE, INCLUDING ITS STALENESS RULE', () => {
  it('a buyer whose scan has gone stale sees the time-sensitive item locked, not promised', () => {
    // depth_drop carries maxScanAgeDays: 7 — a strong but old reading does not open it
    const fresh = previewPurchase(program(), CATALOGUE, buyer(92, FULL, 1), NOW);
    const stale = previewPurchase(program(), CATALOGUE, buyer(92, FULL, 30), NOW);
    expect(fresh.openNow).toBe(fresh.total);
    expect(stale.openNow).toBeLessThan(fresh.openNow);
    expect(stale.sellable).toBe(true);            // still worth buying, just not all open today
  });

  it('AND IS TOLD TO SCAN, NOT TO TRAIN HARDER — the gate blames no threshold here', () => {
    // this is the bug the probe found: a strong athlete with an old scan was being told "the rest unlocks
    // as your readiness comes up", when their readiness is fine and the reading is simply out of date
    const stale = previewPurchase(program(), CATALOGUE, buyer(92, FULL, 30), NOW);
    expect(stale.staleScan).toBe(true);
    expect(stale.blockedBy).toEqual([]);                    // nothing about their body is in the way
    expect(stale.advice).toMatch(/more recent scan/i);
    expect(stale.advice).not.toMatch(/readiness comes up/i);
  });

  it('a fresh buyer is never told their scan is stale', () => {
    for (const p of [
      previewPurchase(program(), CATALOGUE, buyer(92, FULL), NOW),
      previewPurchase(program(), CATALOGUE, buyer(45), NOW),
    ]) {
      expect(p.staleScan).toBe(false);
      expect(p.advice).not.toMatch(/recent scan/i);
    }
  });
});

describe('the preview never talks about the buyer’s body or about other buyers', () => {
  it('no clinical or population language in any branch', () => {
    const cases = [
      previewPurchase(program(), CATALOGUE, buyer(92, FULL), NOW),
      previewPurchase(program(), CATALOGUE, buyer(45), NOW),
      previewPurchase(program(), CATALOGUE, buyer(15, { power: 10 }), NOW),
      previewPurchase(program(), CATALOGUE, null, NOW),
    ];
    for (const c of cases) {
      const blob = JSON.stringify(c).toLowerCase();
      for (const bad of ['diagnos', 'injur', 'weak', 'deficien', 'percentile', 'rank', 'other buyers', 'most people']) {
        expect(blob, `${bad} in "${c.advice}"`).not.toContain(bad);
      }
    }
  });
});
