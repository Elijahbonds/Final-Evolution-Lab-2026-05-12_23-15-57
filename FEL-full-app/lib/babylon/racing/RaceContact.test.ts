// Does a blocker block, does a clean rival step around a slower one, and is a punt a punt?
import { describe, it, expect } from 'vitest';
import { CONTACT, alongGap, steerLane, resolveContact, nearMisses, personalityFor } from './RaceContact';

const LAP = 800;

describe('intent', () => {
  it('a blocker slides into the lane of a player closing behind it; a clean rival holds its home lane', () => {
    const player = { dist: 100, lateral: -3, speed: 20 };
    let lane = 3;
    for (let k = 0; k < 90; k++) lane = steerLane({ lane, dist: 112, speed: 18, personality: 'blocker', home: 3 }, player, [], 9, LAP, 1 / 30);
    expect(lane).toBeLessThan(-2);
    let clean = 3;
    for (let k = 0; k < 90; k++) clean = steerLane({ lane: clean, dist: 112, speed: 18, personality: 'clean', home: 3 }, player, [], 9, LAP, 1 / 30);
    expect(clean).toBeCloseTo(3, 6);
  });
  it('a blocker far ahead, or one already behind the player, does nothing', () => {
    const far = steerLane({ lane: 3, dist: 200, speed: 18, personality: 'blocker', home: 3 }, { dist: 100, lateral: -3, speed: 20 }, [], 9, LAP, 1);
    const behind = steerLane({ lane: 3, dist: 90, speed: 18, personality: 'blocker', home: 3 }, { dist: 100, lateral: -3, speed: 20 }, [], 9, LAP, 1);
    expect(far).toBeCloseTo(3, 6); expect(behind).toBeCloseTo(3, 6);
  });
  it('a clean rival steps aside from a slower rival dead ahead, and never past the road edge', () => {
    let lane = 0;
    for (let k = 0; k < 60; k++) lane = steerLane({ lane, dist: 100, speed: 20, personality: 'clean', home: 0 }, null, [{ dist: 105, lateral: 0.3, speed: 15 }], 9, LAP, 1 / 30);
    expect(Math.abs(lane)).toBeGreaterThan(1.5);
    let edge = 6;
    for (let k = 0; k < 120; k++) edge = steerLane({ lane: edge, dist: 100, speed: 20, personality: 'blocker', home: 6 }, { dist: 95, lateral: 30, speed: 25 }, [], 9, LAP, 1 / 30);
    expect(edge).toBeLessThanOrEqual(9 - CONTACT.edgeKeep + 1e-9);
  });
  it('the along-track gap wraps the lap', () => {
    expect(alongGap(795, 5, LAP)).toBeCloseTo(10, 6);
    expect(alongGap(5, 795, LAP)).toBeCloseTo(-10, 6);
  });
  it('the grid mixes personalities', () => {
    const set = new Set([0, 1, 2, 3, 4].map(personalityFor));
    expect(set.has('blocker')).toBe(true); expect(set.has('bumper')).toBe(true); expect(set.has('clean')).toBe(true);
  });
});

describe('contact', () => {
  it('overlapping alongside is a side bump that shoves both apart and costs both some speed', () => {
    const cd: number[] = [];
    const ev = resolveContact({ dist: 100, lateral: 0, speed: 20, boosting: false }, [{ dist: 101, lateral: 1.5, speed: 20 }], LAP, cd, 1 / 60);
    expect(ev).toHaveLength(1);
    expect(ev[0].kind).toBe('side');
    expect(ev[0].playerShove).toBeLessThan(0); expect(ev[0].rivalShove).toBeGreaterThan(0);
    expect(ev[0].playerKeep).toBe(CONTACT.bumpKeep);
    // and not again inside the cooldown
    expect(resolveContact({ dist: 100, lateral: 0, speed: 20, boosting: false }, [{ dist: 101, lateral: 1.5, speed: 20 }], LAP, cd, 1 / 60)).toHaveLength(0);
  });
  it('closing fast from behind is a PUNT: the rival spins, the player keeps going; a boosted nudge counts too', () => {
    const fast = resolveContact({ dist: 100, lateral: 0, speed: 24, boosting: false }, [{ dist: 103, lateral: 0.2, speed: 16 }], LAP, [], 1 / 60);
    expect(fast[0].kind).toBe('punt'); expect(fast[0].rivalKeep).toBe(CONTACT.puntedKeep); expect(fast[0].playerKeep).toBe(CONTACT.punterKeep);
    const boosted = resolveContact({ dist: 100, lateral: 0, speed: 20, boosting: true }, [{ dist: 103, lateral: 0.2, speed: 18 }], LAP, [], 1 / 60);
    expect(boosted[0].kind).toBe('punt');
    const slow = resolveContact({ dist: 100, lateral: 0, speed: 20, boosting: false }, [{ dist: 103, lateral: 0.2, speed: 18 }], LAP, [], 1 / 60);
    expect(slow[0].kind).toBe('side');
  });
  it('a rival closing fast from behind punts the PLAYER', () => {
    const ev = resolveContact({ dist: 100, lateral: 0, speed: 14, boosting: false }, [{ dist: 97, lateral: 0.3, speed: 24 }], LAP, [], 1 / 60);
    expect(ev[0].kind).toBe('punted'); expect(ev[0].playerKeep).toBe(CONTACT.puntedKeep);
  });
  it('no overlap, no event', () => {
    expect(resolveContact({ dist: 100, lateral: 0, speed: 20, boosting: false }, [{ dist: 110, lateral: 0, speed: 20 }, { dist: 101, lateral: 4, speed: 20 }], LAP, [], 1 / 60)).toHaveLength(0);
  });
  it('a close, clean pass is a near miss — once per crossing', () => {
    const was: boolean[] = [];
    expect(nearMisses({ dist: 100, lateral: 0, speed: 24 }, [{ dist: 101, lateral: 3.1, speed: 18 }], LAP, was)).toEqual([0]);
    expect(nearMisses({ dist: 101, lateral: 0, speed: 24 }, [{ dist: 101.5, lateral: 3.1, speed: 18 }], LAP, was)).toEqual([]);   // still alongside
    expect(nearMisses({ dist: 100, lateral: 0, speed: 24 }, [{ dist: 101, lateral: 6, speed: 18 }], LAP, [])).toEqual([]);      // too wide
    expect(nearMisses({ dist: 100, lateral: 0, speed: 19, }, [{ dist: 101, lateral: 3.1, speed: 18 }], LAP, [])).toEqual([]);     // not a pass
  });
});
