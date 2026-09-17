import { describe, expect, it } from 'vitest';
import {
  groundContest, aiBlockChance, bumpExposure, aiBumpStrips, jumpSwats, SWAT_JUMP_MAX_SEC, contestedPct, alteredApex, aiHandsUp, facingCos,
  HAND_UP_CONTEST, HAND_UP_RANGE, BUMP_STRIP_WINDOW_SEC, BUMP_STRIP_EXPOSURE, AI_BLOCK_RANGE, AI_BLOCK_BASE, CONTEST_PCT_BITE, ALTER_APEX_ADD,
} from './HoopsDefense';
import { STEAL_EXPOSURE_MIN, BLOCK_WINDOW_SEC } from './BasketballCore';

describe('D3 — the grounded contest', () => {
  it('a hand up inside range, facing the shooter, contests; further out it fades; behind him or without the hand it is nothing', () => {
    expect(groundContest(0.8, 1, true)).toBeCloseTo(HAND_UP_CONTEST, 5);
    expect(groundContest(HAND_UP_RANGE, 1, true)).toBeCloseTo(HAND_UP_CONTEST * 0.4, 5);   // the closeout's far edge still counts for something
    expect(groundContest(1.6, 1, true)).toBeGreaterThan(groundContest(HAND_UP_RANGE, 1, true));
    expect(groundContest(HAND_UP_RANGE + 0.1, 1, true)).toBe(0);
    expect(groundContest(0.8, -0.5, true)).toBe(0);
    expect(groundContest(0.8, 1, false)).toBe(0);
  });
  it('the contest bites the make chance itself, and a strong one alters the release', () => {
    expect(contestedPct(0.8, 0)).toBeCloseTo(0.8, 5);
    expect(contestedPct(0.8, 1)).toBeCloseTo(0.8 * (1 - CONTEST_PCT_BITE), 5);
    expect(alteredApex(0.3)).toBe(0); expect(alteredApex(0.6)).toBe(ALTER_APEX_ADD);
  });
  it('facingCos: forward toward the point is 1, away is −1 (yaw 0 = +z)', () => {
    expect(facingCos(0, { x: 0, z: 0 }, { x: 0, z: 2 })).toBeCloseTo(1, 5);
    expect(facingCos(Math.PI, { x: 0, z: 0 }, { x: 0, z: 2 })).toBeCloseTo(-1, 5);
    expect(facingCos(Math.PI, { x: 0, z: 5 }, { x: 0, z: 2 })).toBeCloseTo(1, 5);
  });
  it('the AI puts a hand up inside range facing the shooter (with its roll), never from behind', () => {
    expect(aiHandsUp(1.0, 1, () => 0)).toBe(true);
    expect(aiHandsUp(1.0, 1, () => 0.99)).toBe(false);
    expect(aiHandsUp(1.0, -1, () => 0)).toBe(false);
    expect(aiHandsUp(3.0, 1, () => 0)).toBe(false);
  });
});

describe('D1 — the block', () => {
  it('the AI blocks only with a hand up inside range; a layup / dunk is more blockable than a jumper; a moving body halves it', () => {
    expect(aiBlockChance('layup', 0.5, false, true)).toBe(0);
    expect(aiBlockChance('layup', AI_BLOCK_RANGE + 0.1, true, true)).toBe(0);
    const layup = aiBlockChance('layup', 0.5, true, true), jumper = aiBlockChance('jumper', 0.5, true, true), dunk = aiBlockChance('dunk', 0.5, true, true);
    expect(layup).toBeGreaterThan(jumper); expect(dunk).toBeGreaterThan(jumper);
    expect(aiBlockChance('layup', 0.5, true, false)).toBeCloseTo(layup / 2, 5);
    expect(aiBlockChance('layup', 1.4, true, true)).toBeLessThan(layup);
    expect(aiBlockChance('dunk', 0.5, true, true, 0.5)).toBeCloseTo(dunk * 0.5, 5);
    expect(aiBlockChance('dunk', 0, true, true, 1)).toBeCloseTo(AI_BLOCK_BASE.dunk, 5);
  });
  it('the player swats a dunker in the air with a fresh jump inside range, between the takeoff and the resolve', () => {
    expect(jumpSwats(0.3, 0.1, 1.0)).toBe(true);
    expect(jumpSwats(0.05, 0.1, 1.0)).toBe(false);                       // still on the floor
    expect(jumpSwats(0.9, 0.1, 1.0)).toBe(false);                        // past the window, on the way down
    expect(jumpSwats(0.3, BLOCK_WINDOW_SEC + 0.3, 1.0)).toBe(false);     // a stale jump
    expect(jumpSwats(0.5, 0.6, 1.0)).toBe(true);                         // the hang: a jump timed on the gather tell is 0.6 s old when the flight reaches the rim
    expect(jumpSwats(0.5, SWAT_JUMP_MAX_SEC + 0.01, 1.0)).toBe(false);   // …and on the way down it is over
    expect(jumpSwats(0.3, 0.1, AI_BLOCK_RANGE + 0.2)).toBe(false);       // out of reach
  });
});

describe('D2 — the strip on the bump', () => {
  it('a hard contact opens a window in which a poke connects; outside it the exposure is the body\'s', () => {
    expect(bumpExposure(0.1, 0.1)).toBe(BUMP_STRIP_EXPOSURE);
    expect(bumpExposure(0.1, 0.1)).toBeGreaterThanOrEqual(STEAL_EXPOSURE_MIN);
    expect(bumpExposure(0.9, 0.1)).toBe(0.9);
    expect(bumpExposure(0.1, BUMP_STRIP_WINDOW_SEC + 0.05)).toBe(0.1);
    expect(bumpExposure(0.1, Infinity)).toBe(0.1);
  });
  it('a set, facing AI defender strips on his roll; a moving or turned one does not', () => {
    expect(aiBumpStrips(true, 1, () => 0)).toBe(true);
    expect(aiBumpStrips(true, 1, () => 0.99)).toBe(false);
    expect(aiBumpStrips(false, 1, () => 0)).toBe(false);
    expect(aiBumpStrips(true, -0.5, () => 0)).toBe(false);
  });
});
