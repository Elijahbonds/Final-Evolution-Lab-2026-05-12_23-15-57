// VENICE-SKATE-THPS (2026-09-09) — the two board states the skater could not see.
//
// The manual pointed at `board_ride_idle`: the one THPS link that turns two tricks into a line looked exactly like
// coasting. And the pop had no body at all — the rider went from the ride idle straight into the air tuck, so the
// sticky plant → pop → hang that makes an ollie feel like an ollie was never on screen.
import { describe, it, expect } from 'vitest';
import { chooseBoardClip, AFTER_ONESHOT, type BoardAnimInput } from './boardTree';

const ride = (over: Partial<BoardAnimInput> = {}): BoardAnimInput => ({
  speed01: 0.6, pushing: false, lean: 0, airborne: false, grabHeld: false, flipping: false,
  spinning: false, grinding: false, manual: false, landing: 'none', bailing: false, ...over,
});

describe('the manual has its own clip', () => {
  it('a manual is not the ride idle any more', () => {
    const m = chooseBoardClip(ride({ manual: true }));
    expect(m.state).toBe('manual');
    expect(m.clip).toBe('board_manual');
    expect(m.clip).not.toBe(chooseBoardClip(ride()).clip);
  });

  it('a grind still wins over a manual — you cannot be on both', () => {
    expect(chooseBoardClip(ride({ manual: true, grinding: true })).state).toBe('grind');
  });
});

describe('the pop beat', () => {
  it('plays the ollie through the pop, then settles into the air pose', () => {
    const pop = chooseBoardClip(ride({ airborne: true, popping: true }));
    expect(pop.state).toBe('ollie');
    expect(pop.clip).toBe('skate_ollie');
    expect(pop.loop).toBe(false);
    expect(AFTER_ONESHOT.ollie).toBe('air_tuck');
  });

  it('never eats a trick the player actually threw', () => {
    expect(chooseBoardClip(ride({ airborne: true, popping: true, flipping: true })).state).toBe('air_flip');
    expect(chooseBoardClip(ride({ airborne: true, popping: true, grabHeld: true })).state).toBe('air_grab');
    expect(chooseBoardClip(ride({ airborne: true, popping: true, spinning: true })).state).toBe('air_spin');
  });

  it('a landing beat and a bail both win over a pop still counting down', () => {
    expect(chooseBoardClip(ride({ popping: true, landing: 'clean' })).state).toBe('land_clean');
    expect(chooseBoardClip(ride({ popping: true, bailing: true })).state).toBe('bail');
  });

  it('without the beat the air is what it always was', () => {
    expect(chooseBoardClip(ride({ airborne: true })).state).toBe('air_tuck');
  });
});
