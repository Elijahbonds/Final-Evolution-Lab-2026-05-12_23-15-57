// IMPROVE (2026-10-06): the pure rules behind the owner-picked Football Rush improvements (footballRushRules.ts).
import { describe, it, expect } from 'vitest';
import {
  GameTimers, kickLanding, positionedCatch, kickMoveStep, KICK_LAND, CATCH_REACH, KICK_MOVE, rampTier, DEFENSE_RAMP,
  coinLayout, FB_COIN_GROUP_MAX, contextPrompts, truckReady01, hopY, HURDLE_HOP_M, medalFor, medalName, parLine, FB_MEDALS,
  bestDriveIndex, loadFootballBest, saveFootballBestIfHigher, FB_BEST_KEY, hudChanges,
} from './footballRushRules';
import { LANES, rampAt, tunnelAt } from '../core/KickoffReturn';
import { profileFor } from '../core/Difficulty';

function memStore(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, m };
}

describe('GameTimers (#5: the snap releases, the reset and the next drive on the mode clock)', () => {
  it('fires on the clock, earliest first, and never before', () => {
    const t = new GameTimers(); const log: string[] = [];
    t.later(0, 0.5, () => log.push('b')); t.later(0, 0.2, () => log.push('a'));
    t.tick(0.1); expect(log).toEqual([]);
    t.tick(1); expect(log).toEqual(['a', 'b']); expect(t.size).toBe(0);
  });
  it('a tag clears only its own; a call that clears the rest stops them firing in the same tick', () => {
    const t = new GameTimers(); const log: string[] = [];
    t.later(0, 0.1, () => log.push('pursuit'), 'pursuit'); t.later(0, 0.1, () => log.push('reset'), 'reset');
    t.clear('pursuit'); expect(t.pending('pursuit')).toBe(0); expect(t.pending('reset')).toBe(1);
    t.tick(1); expect(log).toEqual(['reset']);
    t.later(1, 0.1, () => { log.push('drive'); t.clear(); }, 'drive'); t.later(1, 0.2, () => log.push('stale'), 'pursuit');
    t.tick(2); expect(log).toEqual(['reset', 'drive']);
  });
  it('a pause is just a clock that does not advance', () => {
    const t = new GameTimers(); let fired = 0;
    t.later(3, 1, () => fired++);
    for (let i = 0; i < 100; i++) t.tick(3.5);   // a hundred frames held at the same clock (paused / hit-stopped)
    expect(fired).toBe(0); t.tick(4); expect(fired).toBe(1);
  });
});

describe('the kick (#2: it lands somewhere, and the catch is graded on positioning)', () => {
  it('lands inside the band, across both sides', () => {
    expect(kickLanding(0, 0)).toEqual({ x: -KICK_LAND.halfX, z: KICK_LAND.zMin });
    expect(kickLanding(0.5, 1).x).toBeCloseTo(0, 9);
    expect(kickLanding(0.999, 0.5).x).toBeGreaterThan(KICK_LAND.halfX * 0.99);
  });
  it('under the ball keeps the grade; a stretch costs one; further is a bobble', () => {
    expect(positionedCatch('perfect', 0.4)).toBe('perfect');
    expect(positionedCatch('perfect', CATCH_REACH.fullM + 0.1)).toBe('good');
    expect(positionedCatch('good', CATCH_REACH.fullM + 0.1)).toBe('early');
    expect(positionedCatch('perfect', CATCH_REACH.stretchM + 0.1)).toBe('late');
    expect(positionedCatch('late', 0)).toBe('late');
    expect(positionedCatch('perfect', Number.NaN)).toBe('late');
  });
  it('the returner can reach the far edge of the band before the ball lands', () => {
    let v = { vx: 0, vz: 0 }, x = 0; const dt = 1 / 60;
    for (let t = 0; t < 1.7; t += dt) { v = kickMoveStep(v, 1, 0, dt); x += v.vx * dt; }
    expect(x).toBeGreaterThan(KICK_LAND.halfX - CATCH_REACH.fullM);
    expect(Math.abs(v.vx)).toBeLessThanOrEqual(KICK_MOVE.speed + 1e-9);
    // stick y −1 is upfield, a diagonal is not faster than straight
    const d = kickMoveStep({ vx: 0, vz: 0 }, 1, -1, 10);
    expect(Math.hypot(d.vx, d.vz)).toBeCloseTo(KICK_MOVE.speed, 6); expect(d.vz).toBeGreaterThan(0);
  });
});

describe('the defense tightens each drive (#3, TUNED)', () => {
  it('drive 1 is the picked tier exactly; later drives read quicker and bust less, never past the floor', () => {
    const rookie = profileFor('rookie');
    expect(rampTier(rookie, 1)).toEqual(rookie);
    const d5 = rampTier(rookie, 5);
    expect(d5.reactionMs).toBe(Math.round(rookie.reactionMs * (1 - DEFENSE_RAMP.reactionStep * 4)));
    expect(d5.reactionMs).toBeLessThan(rampTier(rookie, 4).reactionMs);
    expect(d5.mistakeRate).toBeLessThan(rookie.mistakeRate);
    const far = rampTier(rookie, 50);
    expect(far.reactionMs).toBe(Math.round(rookie.reactionMs * DEFENSE_RAMP.reactionFloor));
    expect(far.mistakeRate).toBeCloseTo(rookie.mistakeRate * DEFENSE_RAMP.mistakeFloor, 9);
    expect(rampTier(rookie, 3)).not.toBe(rookie);   // a copy: the picked tier is never mutated
  });
});

describe('the coins pay the lanes (#6)', () => {
  it('ramp coins sit in the launch arc, out of a turf runner\'s reach; tunnel coins sit under the bench; rail coins on the rail', () => {
    for (const d of [1, 2, 3, 4, 5]) {
      const groups = coinLayout(d);
      expect(groups.map((g) => g.lane).sort()).toEqual(['rail', 'ramp', 'ramp', 'ramp', 'tunnel']);
      for (const g of groups) {
        expect(g.points.length).toBeGreaterThan(0);
        expect(g.points.length).toBeLessThanOrEqual(FB_COIN_GROUP_MAX);   // the arena bound's per-frame coin term
        for (const [x, y, z] of g.points) {
          if (g.lane === 'ramp') { expect(y).toBeGreaterThan(1.1 + 0.2); expect(LANES.ramps.some((r) => r.x === x)).toBe(true); }   // above the magnet's reach from the turf
          if (g.lane === 'tunnel') { expect(tunnelAt(x, z)).toBeGreaterThanOrEqual(0); expect(y).toBeLessThan(1.1); }
          if (g.lane === 'rail') { expect(Math.abs(x)).toBeCloseTo(LANES.railX - 0.25, 6); expect(y).toBeGreaterThan(LANES.railY); }
        }
      }
      // the first ramp coin is past the ramp's near edge (the air lane starts there)
      const r0 = LANES.ramps[0], first = groups.find((g) => g.lane === 'ramp')!.points[0];
      expect(rampAt(r0.x, r0.z - r0.halfZ)).toBe(0); expect(first[2]).toBeGreaterThan(r0.z - r0.halfZ);
    }
    // the rail and the tunnel alternate sides by drive
    const side = (d: number) => Math.sign(coinLayout(d).find((g) => g.lane === 'rail')!.points[0][0]);
    expect(side(1)).toBe(-side(2));
  });
});

describe('the HUD reads (#7 #10)', () => {
  it('the truck fill is 1 when ready and climbs in 5 % steps', () => {
    expect(truckReady01(0, 2.5)).toBe(1);
    expect(truckReady01(2.5, 2.5)).toBe(0);
    expect(truckReady01(1.25, 2.5)).toBe(0.5);
    expect(truckReady01(1.24, 2.5) * 20 % 1).toBe(0);
  });
  it('the prompts list only the live reads, in button order', () => {
    expect(contextPrompts({ vault: false, catapult: false, arm: false })).toBe('');
    expect(contextPrompts({ vault: true, catapult: false, arm: true })).toBe('B VAULT · R1 ARM');
    expect(contextPrompts({ vault: true, catapult: true, arm: true })).toBe('B VAULT · A CATAPULT · R1 ARM');
  });
});

describe('the hurdle hop (#9)', () => {
  it('leaves the ground and comes back', () => {
    expect(hopY(0, 0.5)).toBe(0);
    expect(hopY(0.25, 0.5)).toBeCloseTo(HURDLE_HOP_M, 9);
    expect(hopY(0.5, 0.5)).toBe(0);
    expect(hopY(0.1, 0)).toBe(0);
  });
});

describe('the session target (#11)', () => {
  it('the medal ladder', () => {
    expect(medalFor(0)).toBe(0);
    expect(medalFor(FB_MEDALS[0].at)).toBe(1);
    expect(medalFor(FB_MEDALS[2].at + 1)).toBe(3);
    expect(medalName(2)).toBe('SILVER'); expect(medalName(0)).toBe('');
    expect(parLine(FB_MEDALS[0].at - 30)).toBe(`BRONZE AT ${FB_MEDALS[0].at} · 30 TO GO`);
    expect(parLine(5000, 1200)).toBe('GOLD ✓ · BEST 1200');
  });
  it('the best drive is the longest, first on a tie', () => {
    expect(bestDriveIndex([])).toBe(-1);
    expect(bestDriveIndex([{ score: 12 }, { score: 40 }, { score: 40 }])).toBe(1);
  });
  it('the best is kept only when beaten, and a broken store reads as none', () => {
    const s = memStore();
    expect(loadFootballBest(s)).toBeNull();
    expect(saveFootballBestIfHigher(500, s)).toEqual({ improved: true, previous: null });
    expect(saveFootballBestIfHigher(400, s)).toEqual({ improved: false, previous: 500 });
    expect(loadFootballBest(s)).toBe(500);
    expect(saveFootballBestIfHigher(0, s).improved).toBe(false);
    expect(loadFootballBest(memStore({ [FB_BEST_KEY]: 'garbage' }))).toBeNull();
    expect(loadFootballBest(null)).toBeNull();
  });
});

describe('the HUD gate (#12)', () => {
  it('sends only what changed; a continuous field waits for the gate, a discrete one never does', () => {
    const sent: Record<string, string | number | boolean> = {};
    const cont = new Set(['fill']);
    expect(hudChanges(sent, { yards: 1, fill: 0.1 }, cont, false)).toEqual({ yards: 1, fill: 0.1 });   // first send goes
    expect(hudChanges(sent, { yards: 1, fill: 0.1 }, cont, false)).toBeNull();                         // nothing moved
    expect(hudChanges(sent, { yards: 1, fill: 0.2 }, cont, false)).toBeNull();                         // fill waits
    expect(hudChanges(sent, { yards: 2, fill: 0.3 }, cont, false)).toEqual({ yards: 2 });              // discrete goes now
    expect(hudChanges(sent, { yards: 2, fill: 0.3 }, cont, true)).toEqual({ fill: 0.3 });              // the gate sends the fill
  });
});
