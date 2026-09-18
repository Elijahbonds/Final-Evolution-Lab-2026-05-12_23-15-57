// A DECAYING METER MUST NOT NARRATE ITS OWN DECAY (2026-09-14).
//
// MomentumBus cools at DECAY_PER_SEC with no input, so a player parked just above a tier line crosses it
// downward every few seconds without doing anything. The obvious implementation sounds a sting on every
// tier CHANGE, which turns that into a groan on a timer — landing, by construction, on the moments the
// player is concentrating hardest. Only rises sting. These tests hold that line, and the crowd curve's
// fidelity to the mode it was extracted from.

import { describe, it, expect } from 'vitest';
import { crowdLevel, tierSting, tierImpact, CROWD_FLOOR, CROWD_CEIL } from './MomentumFx';
import type { MomentumTier } from './MomentumBus';

const LADDER: MomentumTier[] = ['cold', 'warming', 'hot', 'on_fire'];

describe('MomentumFx — the crowd bed', () => {
  it('is never silent, even stone cold — an empty venue reads as a bug', () => {
    expect(crowdLevel(0)).toBe(CROWD_FLOOR);
    expect(CROWD_FLOOR).toBeGreaterThan(0);
  });

  it('reaches full at the top', () => {
    expect(crowdLevel(1)).toBe(CROWD_CEIL);
  });

  // FIDELITY: this is OneVOneMode's own line, `0.3 + score01 * 0.7`, and it must stay that line.
  it('reproduces the curve of the mode it was extracted from', () => {
    for (const s of [0, 0.25, 0.5, 0.75, 1]) expect(crowdLevel(s)).toBeCloseTo(0.3 + s * 0.7, 9);
  });

  it('clamps rather than trusting a score outside 0..1', () => {
    expect(crowdLevel(-2)).toBe(CROWD_FLOOR);
    expect(crowdLevel(9)).toBe(CROWD_CEIL);
  });

  it('is monotonic', () => {
    let prev = -1;
    for (let s = 0; s <= 1.0001; s += 0.05) { expect(crowdLevel(s)).toBeGreaterThan(prev); prev = crowdLevel(s); }
  });
});

describe('MomentumFx — the sting', () => {
  // THE POINT OF THE MODULE.
  it('says nothing on any downward crossing, because decay makes those routine', () => {
    for (let i = 0; i < LADDER.length; i++) {
      for (let j = 0; j < i; j++) {
        expect(tierSting(LADDER[j], LADDER[i])).toBeNull();
        expect(tierImpact(LADDER[j], LADDER[i])).toBe(0);
      }
    }
  });

  it('says nothing when the tier did not actually change', () => {
    for (const t of LADDER) { expect(tierSting(t, t)).toBeNull(); expect(tierImpact(t, t)).toBe(0); }
  });

  it('sounds every upward crossing', () => {
    for (let i = 0; i < LADDER.length; i++) {
      for (let j = i + 1; j < LADDER.length; j++) expect(tierSting(LADDER[j], LADDER[i])).not.toBeNull();
    }
  });

  it('gets louder the higher you climb', () => {
    const w = tierSting('warming', 'cold')!, h = tierSting('hot', 'warming')!, f = tierSting('on_fire', 'hot')!;
    expect(w.volume).toBeLessThan(h.volume);
    expect(h.volume).toBeLessThan(f.volume);
  });

  it('holds the flash back for the top of the ladder so it still means something', () => {
    expect(tierSting('warming', 'cold')!.flash).toBe(false);
    expect(tierSting('hot', 'warming')!.flash).toBe(true);
    expect(tierSting('on_fire', 'hot')!.flash).toBe(true);
  });

  it('uses a different sound for ON FIRE than for the rungs below it', () => {
    expect(tierSting('on_fire', 'hot')!.sfx).toBe('powerUp');
    expect(tierSting('hot', 'warming')!.sfx).toBe('crowdCheer');
  });

  it('handles a skipped rung — one huge play can jump cold straight to on fire', () => {
    const s = tierSting('on_fire', 'cold');
    expect(s).not.toBeNull();
    expect(s!.sfx).toBe('powerUp');
    expect(tierImpact('on_fire', 'cold')).toBeGreaterThan(0);
  });
});

describe('MomentumFx — the shake', () => {
  it('never out-punches a real collision', () => {
    for (let i = 0; i < LADDER.length; i++) {
      for (let j = 0; j < LADDER.length; j++) expect(tierImpact(LADDER[j], LADDER[i])).toBeLessThan(0.6);
    }
  });

  it('leaves the first rung unshaken — warming happens too often to be a hit', () => {
    expect(tierImpact('warming', 'cold')).toBe(0);
  });

  it('shakes harder for on fire than for hot', () => {
    expect(tierImpact('on_fire', 'hot')).toBeGreaterThan(tierImpact('hot', 'warming'));
  });
});
