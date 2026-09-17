import { describe, expect, it } from 'vitest';
import {
  AERO_STUNTS, CHAIN_MAX, CHAIN_WINDOW_SEC, HUG_ARM_SEC, HUG_CEILING_M, REPEAT_FLOOR, SHAVE_M,
  addToChain, boostEarnForStunt, emptyChain, noHug, shaveCredit, stepChain, stepHug, stuntById,
} from './AeroTricks';

describe('aero tricks', () => {
  describe('the catalogue', () => {
    it('is not flat — a loop is not a roll', () => {
      expect(stuntById('loop')!.pts).toBeGreaterThan(stuntById('roll_left')!.pts * 2);
    });

    it('charges for what a stunt costs you', () => {
      // the reversals are worth more BECAUSE they leave you facing the wrong way
      for (const s of AERO_STUNTS.filter((x) => x.reverses)) {
        expect(s.pts).toBeGreaterThanOrEqual(150);
        expect(s.clearance).toBeGreaterThanOrEqual(55);
      }
    });

    it('only lets the rolls dodge', () => {
      expect(AERO_STUNTS.filter((s) => s.dodges).map((s) => s.id)).toEqual(['roll_left', 'roll_right']);
    });

    it('asks for more clear air the bigger it is', () => {
      const byPts = [...AERO_STUNTS].sort((a, b) => a.pts - b.pts);
      expect(byPts[0].clearance).toBeLessThan(byPts[byPts.length - 1].clearance);
    });

    it('takes longer the more it is worth', () => {
      expect(stuntById('immelmann')!.sec).toBeGreaterThan(stuntById('roll_left')!.sec);
    });
  });

  describe('the chain', () => {
    it('pays a single stunt its base value', () => {
      const { gained, chain } = addToChain(emptyChain(), 'loop');
      expect(gained).toBe(150);
      expect(chain.mult).toBe(1);
    });

    it('multiplies for different stunts', () => {
      let c = emptyChain();
      const first = addToChain(c, 'roll_left'); c = first.chain;
      const second = addToChain(c, 'loop'); c = second.chain;
      expect(c.mult).toBeGreaterThan(1);
      expect(second.gained).toBeGreaterThan(stuntById('loop')!.pts);
    });

    it('decays hard for the same stunt repeated', () => {
      let c = emptyChain();
      const gains: number[] = [];
      for (let i = 0; i < 5; i++) { const r = addToChain(c, 'roll_left'); c = r.chain; gains.push(r.gained); }
      expect(gains).toEqual([...gains].sort((a, b) => b - a));
      expect(gains[4]).toBeLessThan(gains[0] * 0.2);
    });

    it('makes a roll and a loop beat twenty rolls', () => {
      // the anti-mash rule, stated as the thing it is for
      let mash = emptyChain();
      for (let i = 0; i < 20; i++) mash = addToChain(mash, 'roll_left').chain;

      let varied = emptyChain();
      varied = addToChain(varied, 'roll_left').chain;
      varied = addToChain(varied, 'loop').chain;

      expect(varied.pts).toBeGreaterThan(mash.pts);
    });

    it('caps the multiplier', () => {
      let c = emptyChain();
      for (const s of AERO_STUNTS) c = addToChain(c, s.id).chain;
      expect(c.mult).toBeLessThanOrEqual(CHAIN_MAX);
    });

    it('closes itself when nothing is landed', () => {
      let { chain } = addToChain(emptyChain(), 'loop');
      let closed = null;
      for (let i = 0; i < 200 && !closed; i++) {
        const r = stepChain(chain, 1 / 60);
        chain = r.chain; closed = r.closed;
      }
      expect(closed).not.toBeNull();
      expect(closed!.pts).toBe(150);
      expect(chain.ids).toEqual([]);
    });

    it('stays open inside the window', () => {
      let { chain } = addToChain(emptyChain(), 'loop');
      const r = stepChain(chain, CHAIN_WINDOW_SEC * 0.5);
      expect(r.closed).toBeNull();
      expect(r.chain.ids).toEqual(['loop']);
    });

    it('does nothing to an empty chain', () => {
      const r = stepChain(emptyChain(), 10);
      expect(r.closed).toBeNull();
      expect(r.chain.ids).toEqual([]);
    });

    it('ignores an unknown stunt rather than scoring it', () => {
      const r = addToChain(emptyChain(), 'barrel_roll_of_doom' as never);
      expect(r.gained).toBe(0);
      expect(r.chain.ids).toEqual([]);
    });
  });

  describe('what it pays the shared boost', () => {
    it('pays big for a reversal and small for a roll', () => {
      expect(boostEarnForStunt('immelmann', 0)?.what).toBe('trickBig');
      expect(boostEarnForStunt('roll_left', 0)?.what).toBe('trickSmall');
    });

    it('pays less each repeat', () => {
      const a = boostEarnForStunt('roll_left', 0)!.scale;
      const b = boostEarnForStunt('roll_left', 1)!.scale;
      const c = boostEarnForStunt('roll_left', 2)!.scale;
      expect(a).toBeGreaterThan(b);
      expect(b).toBeGreaterThan(c);
    });

    it('stops paying entirely once it is just mashing', () => {
      expect(boostEarnForStunt('roll_left', 12)).toBeNull();
    });
  });

  describe('hugging the terrain', () => {
    it('pays nothing in open sky', () => {
      const r = stepHug(noHug(), 1 / 60, 400);
      expect(r.earnPerSec).toBe(0);
      expect(r.closeness01).toBe(0);
    });

    it('has to arm before it pays, so a dip through is not skill', () => {
      let h = noHug();
      let first = stepHug(h, 0.2, 6); h = first.hug;
      expect(first.earnPerSec).toBe(0);
      const later = stepHug(h, HUG_ARM_SEC, 6);
      expect(later.earnPerSec).toBeGreaterThan(0);
    });

    it('pays more the closer you are', () => {
      const run = (clearance: number) => {
        let h = noHug(), out = 0;
        for (let i = 0; i < 120; i++) { const r = stepHug(h, 1 / 60, clearance); h = r.hug; out = r.earnPerSec; }
        return out;
      };
      expect(run(5)).toBeGreaterThan(run(12));
      expect(run(12)).toBeGreaterThan(run(HUG_CEILING_M - 0.5));
    });

    it('resets the moment you climb out', () => {
      let h = noHug();
      for (let i = 0; i < 120; i++) h = stepHug(h, 1 / 60, 6).hug;
      expect(h.t).toBeGreaterThan(HUG_ARM_SEC);
      const out = stepHug(h, 1 / 60, 200);
      expect(out.hug.t).toBe(0);
      expect(out.earnPerSec).toBe(0);
    });

    it('remembers the closest it got', () => {
      let h = noHug();
      for (const c of [14, 9, 4.5, 11]) h = stepHug(h, 1 / 60, c).hug;
      expect(h.best).toBeCloseTo(4.5, 5);
    });

    it('treats a negative clearance as a crash, not a reward', () => {
      expect(stepHug(noHug(), 1 / 60, -2).earnPerSec).toBe(0);
    });
  });

  describe('shaving something on the way past', () => {
    it('pays more the closer the pass', () => {
      expect(shaveCredit(1)).toBeGreaterThan(shaveCredit(5));
      expect(shaveCredit(5)).toBeGreaterThan(shaveCredit(8.5));
    });

    it('pays nothing for a pass that was not close', () => {
      expect(shaveCredit(SHAVE_M + 0.1)).toBe(0);
      expect(shaveCredit(400)).toBe(0);
    });

    it('does not reward a collision', () => {
      expect(shaveCredit(-1)).toBe(0);
    });

    it('is bounded, so one pass cannot pay for the race', () => {
      expect(shaveCredit(0)).toBeLessThanOrEqual(1);
    });
  });
});
