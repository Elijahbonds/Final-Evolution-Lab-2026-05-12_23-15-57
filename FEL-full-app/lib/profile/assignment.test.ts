// A LOCKED ITEM IS SHOWN, NOT DROPPED (2026-09-13).
//
// The decision this whole file turns on: when a program contains a protocol the athlete has not unlocked,
// silently dropping it means the coach's block is not the block they wrote and nobody is told; assigning it
// anyway makes the gate decorative. Showing it locked, with the threshold, is the only version that is
// honest to both people — and it turns the gate into a target rather than an obstacle.
//
// The other thing tested hard is authoring: a coach can build a block around another coach's private work
// and never find out until a client hits the wall, so that has to fail at authoring time where it is
// fixable.

import { describe, it, expect } from 'vitest';
import {
  validateProgram, canPublish, assignProgram, today, unlockedFraction,
  MAX_WEEKS, MAX_ITEMS_PER_WEEK, type CoachProgram,
} from './assignment';
import { PLATFORM_PROTOCOLS, COMPOSITE, type Protocol } from './protocol';
import { emptyProfile, type SharedProfile } from './sharedProfile';

const NOW = Date.parse('2026-09-13T12:00:00.000Z');
const ago = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

function profileAt(composite: number, axes: Record<string, number> = {}): SharedProfile {
  const p = emptyProfile('cl_1', 'Ama');
  p.prq = [{ composite, axes, at: ago(1) }];
  return p;
}

const theirPrivate: Protocol = {
  key: 'their_secret', title: 'Their drill', summary: 'x', minutes: 5, unlock: null,
  visibility: 'private', coachId: 'coach_other',
};
const myPrivate: Protocol = {
  key: 'my_drill', title: 'My drill', summary: 'x', minutes: 5, unlock: null,
  visibility: 'private', coachId: 'coach_me',
};
const CATALOGUE: Protocol[] = [...PLATFORM_PROTOCOLS, theirPrivate, myPrivate];

function program(over: Partial<CoachProgram> = {}): CoachProgram {
  return {
    key: 'knee8', title: '8-week knee resilience', coachId: 'coach_me',
    outcome: 'Land from height without a recovery step.',
    // 3, not 4: the fixture is a three-week block, and the validator correctly refuses a retest that lands
    // after the block ends. The first draft used 4 and failed its own "a valid block passes clean" test.
    visibility: 'private', retestAfterWeeks: 3,
    weeks: [
      { week: 1, focus: 'Settle the ankle', items: [{ protocolKey: 'ankle_prep', frequency: 4 }] },
      { week: 2, focus: 'Load the hinge', items: [{ protocolKey: 'hinge_pattern', frequency: 3 }] },
      { week: 3, focus: 'Absorb it', items: [{ protocolKey: 'depth_drop', frequency: 2, prescription: '3 x 5, quiet landings' }] },
    ],
    ...over,
  };
}

describe('A LOCKED ITEM IS SHOWN WITH ITS THRESHOLD', () => {
  it('a beginner sees the whole block, with the gated parts locked', () => {
    const a = assignProgram(program(), CATALOGUE, profileAt(30), 'cl_1', NOW);
    expect(a.weeks).toHaveLength(3);
    const depth = a.weeks[2].items[0];
    expect(depth.protocolKey).toBe('depth_drop');
    expect(depth.open).toBe(false);
    expect(depth.gate.blocking.length).toBeGreaterThan(0);
  });

  it('NOTHING IS SILENTLY DROPPED — the block a coach wrote is the block the athlete sees', () => {
    const beginner = assignProgram(program(), CATALOGUE, profileAt(20), 'cl_1', NOW);
    const strong = assignProgram(program(), CATALOGUE, profileAt(95, { flexibility: 95, recovery: 95 }), 'cl_1', NOW);
    const count = (a: typeof beginner) => a.weeks.reduce((n, w) => n + w.items.length, 0);
    expect(count(beginner)).toBe(count(strong));
  });

  it('and nothing is silently UNLOCKED — the gate still holds inside a program', () => {
    const a = assignProgram(program(), CATALOGUE, profileAt(30), 'cl_1', NOW);
    expect(a.weeks[2].items[0].open).toBe(false);
  });

  it('a ready athlete gets it all open', () => {
    const a = assignProgram(program(), CATALOGUE, profileAt(90, { flexibility: 90, recovery: 90 }), 'cl_1', NOW);
    expect(a.fullyLocked).toBe(false);
    expect(unlockedFraction(a)).toBe(1);
    expect(a.summary).toMatch(/all of it open/i);
  });

  it('the coach’s own prescription text is carried through untouched', () => {
    const a = assignProgram(program(), CATALOGUE, profileAt(95, { flexibility: 95, recovery: 95 }), 'cl_1', NOW);
    expect(a.weeks[2].items[0].prescription).toBe('3 x 5, quiet landings');
  });
});

describe('A WALL ALWAYS COMES WITH A NEXT STEP', () => {
  it('when everything is locked, the summary names the NEAREST threshold', () => {
    const allGated = program({
      weeks: [{ week: 1, focus: 'x', items: [
        { protocolKey: 'depth_drop', frequency: 2 },
        { protocolKey: 'oscillatory_jump', frequency: 2 },
      ] }],
      retestAfterWeeks: 1,
    });
    const a = assignProgram(allGated, CATALOGUE, profileAt(64, { flexibility: 59, recovery: 64, power: 59 }), 'cl_1', NOW);
    expect(a.fullyLocked).toBe(true);
    expect(a.summary).toMatch(/nothing here is open yet/i);
    expect(a.summary).toMatch(/you're at \d+/);
  });

  it('and with no scan at all it asks for one rather than naming a number it does not have', () => {
    const allGated = program({
      weeks: [{ week: 1, focus: 'x', items: [{ protocolKey: 'depth_drop', frequency: 2 }] }],
      retestAfterWeeks: 1,
    });
    const a = assignProgram(allGated, CATALOGUE, null, 'cl_1', NOW);
    expect(a.fullyLocked).toBe(true);
    expect(a.summary).toMatch(/system scan/i);
  });

  it('a partly open block says how much', () => {
    const a = assignProgram(program(), CATALOGUE, profileAt(45), 'cl_1', NOW);
    expect(a.summary).toMatch(/\d+ of \d+ open now/);
    expect(unlockedFraction(a)).toBeGreaterThan(0);
    expect(unlockedFraction(a)).toBeLessThan(1);
  });

  it('today() is a short list, not sixteen weeks of plan', () => {
    const a = assignProgram(program(), CATALOGUE, profileAt(45), 'cl_1', NOW);
    expect(today(a, 1).every((i) => i.open)).toBe(true);
    expect(today(a, 3)).toEqual([]);        // week 3 is the gated one
    expect(today(a, 99)).toEqual([]);       // a week that does not exist is empty, not a crash
  });
});

describe('AUTHORING FAILS WHERE IT CAN BE FIXED', () => {
  it('another coach’s private work is rejected at authoring time', () => {
    const stolen = program({ weeks: [{ week: 1, focus: 'x', items: [{ protocolKey: 'their_secret', frequency: 2 }] }], retestAfterWeeks: 1 });
    const problems = validateProgram(stolen, CATALOGUE);
    expect(problems.some((p) => /another coach/i.test(p.problem))).toBe(true);
  });

  it('but a coach’s OWN private work is fine', () => {
    const mine = program({ weeks: [{ week: 1, focus: 'x', items: [{ protocolKey: 'my_drill', frequency: 2 }] }], retestAfterWeeks: 1 });
    expect(validateProgram(mine, CATALOGUE)).toEqual([]);
  });

  it('an unknown protocol key is caught', () => {
    const bad = program({ weeks: [{ week: 1, focus: 'x', items: [{ protocolKey: 'nope', frequency: 2 }] }], retestAfterWeeks: 1 });
    expect(validateProgram(bad, CATALOGUE).some((p) => /not a protocol/i.test(p.problem))).toBe(true);
  });

  it('a valid block passes clean', () => {
    expect(validateProgram(program(), CATALOGUE)).toEqual([]);
  });

  it('THE OUTCOME IS REQUIRED — a block with no stated end is a subscription, not a block', () => {
    expect(validateProgram(program({ outcome: '' }), CATALOGUE).some((p) => p.where === 'outcome')).toBe(true);
    expect(validateProgram(program({ title: '  ' }), CATALOGUE).some((p) => p.where === 'title')).toBe(true);
  });

  it('the retest has to land inside the block', () => {
    expect(validateProgram(program({ retestAfterWeeks: 9 }), CATALOGUE).some((p) => p.where === 'retest')).toBe(true);
    expect(validateProgram(program({ retestAfterWeeks: 0 }), CATALOGUE).some((p) => p.where === 'retest')).toBe(true);
  });

  it('empty weeks, duplicate weeks and overstuffed weeks are all caught', () => {
    expect(validateProgram(program({ weeks: [] }), CATALOGUE).some((p) => p.where === 'weeks')).toBe(true);
    const dupe = program({ weeks: [
      { week: 1, focus: 'a', items: [{ protocolKey: 'ankle_prep', frequency: 2 }] },
      { week: 1, focus: 'b', items: [{ protocolKey: 'breath_reset', frequency: 2 }] },
    ], retestAfterWeeks: 1 });
    expect(validateProgram(dupe, CATALOGUE).some((p) => /share a number/i.test(p.problem))).toBe(true);
    const stuffed = program({ weeks: [{ week: 1, focus: 'x', items: Array.from({ length: MAX_ITEMS_PER_WEEK + 1 }, () => ({ protocolKey: 'breath_reset', frequency: 1 })) }], retestAfterWeeks: 1 });
    expect(validateProgram(stuffed, CATALOGUE).some((p) => /not a week anybody finishes/i.test(p.problem))).toBe(true);
  });

  it('a block longer than MAX_WEEKS is caught', () => {
    const long = program({
      weeks: Array.from({ length: MAX_WEEKS + 1 }, (_, i) => ({ week: i + 1, focus: 'x', items: [{ protocolKey: 'breath_reset', frequency: 1 }] })),
      retestAfterWeeks: 1,
    });
    expect(validateProgram(long, CATALOGUE).some((p) => p.where === 'weeks')).toBe(true);
  });

  it('a bad frequency is caught', () => {
    for (const frequency of [0, 8, -1]) {
      const f = program({ weeks: [{ week: 1, focus: 'x', items: [{ protocolKey: 'breath_reset', frequency }] }], retestAfterWeeks: 1 });
      expect(validateProgram(f, CATALOGUE).some((p) => /frequency/i.test(p.problem)), String(frequency)).toBe(true);
    }
  });
});

describe('PUBLISHING IS STRICTER THAN ASSIGNING', () => {
  it('a block containing private work cannot be published, even the author’s own', () => {
    // buyers would get a block with holes in it that only the author can see through
    const mine = program({ weeks: [{ week: 1, focus: 'x', items: [{ protocolKey: 'my_drill', frequency: 2 }] }], retestAfterWeeks: 1 });
    expect(validateProgram(mine, CATALOGUE)).toEqual([]);     // fine to assign to their own client
    expect(canPublish(mine, CATALOGUE)).toBe(false);          // not fine to sell
  });

  it('a block built entirely from published protocols can be published', () => {
    expect(canPublish(program(), CATALOGUE)).toBe(true);
  });

  it('an invalid block can never be published whatever it contains', () => {
    expect(canPublish(program({ outcome: '' }), CATALOGUE)).toBe(false);
  });
});
