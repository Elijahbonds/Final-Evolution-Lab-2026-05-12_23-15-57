// H2d (hoops-motion plan §3.8, owner Q8): both modes return the ball to the strong hand the same way — stepStrongHand on the live dribble,
// then a quiet front crossing on the carry (runMove), never a requestMove (a chain move that reads a defender and rolls odds).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const one = readFileSync('lib/babylon/modes/OneVOneMode.ts', 'utf8');
const three = readFileSync('lib/babylon/modes/ThreeVThreeMode.ts', 'utf8');

describe('the strong-hand return is wired in both modes (§3.8)', () => {
  for (const [name, src, carry] of [['1v1', one, 'meCarry?.runMove'], ['3v3', three, 'myC?.runMove']] as const) {
    it(`${name}: stepStrongHand each frame on the live dribble, the crossing on the carry, counted and logged, cleared on a reset`, () => {
      const at = src.indexOf('const sh = stepStrongHand(strongHand, dt, {'); expect(at, name).toBeGreaterThan(0);
      const blk = src.slice(at, at + 900);
      expect(blk).toContain(`if (sh.back && ${carry}('crossover', { pace: 1 })) { strongBacks++;`);
      expect(blk).not.toContain('requestMove(');
      expect(blk).toMatch(/dribbling: [^\n]*!shooting && !dunking && !finish && !gather && !spin && !pausedDribble/);
      expect(src).toMatch(/strongHand = STRONG_HAND_IDLE/);
    });
  }
});
