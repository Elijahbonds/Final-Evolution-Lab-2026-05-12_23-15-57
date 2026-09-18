// "SO CLOSE" MUST NOT BE A DICE ROLL (2026-09-14).
//
// A random rattle is prettier and teaches nothing, and the second time a player notices that their
// heartbreak was rolled rather than earned it stops landing. How far the ball gets is how close the press
// was — these tests hold that it is a pure function of the timing and that the ladder never inverts.

import { describe, it, expect } from 'vitest';
import { missFlavour, missBeat, IN_AND_OUT_MS, IRON_MS } from './MissFlavour';

describe('MissFlavour', () => {
  it('is deterministic — the same timing always gives the same miss', () => {
    for (const t of [0, 45, -80, 150, -300, 900]) {
      expect(missFlavour(t)).toBe(missFlavour(t));
      expect(missBeat(t)).toEqual(missBeat(t));
    }
  });

  it('climbs the ladder as the press gets closer, and never inverts', () => {
    expect(missFlavour(900)).toBe('air');
    expect(missFlavour(IRON_MS + 1)).toBe('air');
    expect(missFlavour(IRON_MS)).toBe('iron');
    expect(missFlavour(IN_AND_OUT_MS + 1)).toBe('iron');
    expect(missFlavour(IN_AND_OUT_MS)).toBe('in_and_out');
    expect(missFlavour(0)).toBe('in_and_out');
  });

  it('treats early and late the same — being 80 ms out is being 80 ms out', () => {
    expect(missFlavour(-80)).toBe(missFlavour(80));
    expect(missFlavour(-400)).toBe(missFlavour(400));
  });

  // A player who never pressed did not nearly make anything.
  it('never rewards a press that did not happen', () => {
    expect(missFlavour(null)).toBe('air');
    expect(missBeat(null).ringIt).toBe(false);
    expect(missFlavour(NaN)).toBe('air');
  });

  it('only rings the iron when the ball actually reached it', () => {
    expect(missBeat(0).ringIt).toBe(true);
    expect(missBeat(200).ringIt).toBe(true);
    expect(missBeat(600).ringIt).toBe(false);
  });

  it('gets louder the closer it was', () => {
    const air = missBeat(600), iron = missBeat(200), io = missBeat(20);
    expect(iron.punch).toBeGreaterThan(air.punch);
    expect(io.punch).toBeGreaterThan(iron.punch);
    expect(io.groan).toBeGreaterThan(iron.groan);
    expect(iron.groan).toBeGreaterThan(air.groan);
  });

  it('keeps the in-and-out rare enough to still mean something', () => {
    expect(IN_AND_OUT_MS).toBeLessThan(IRON_MS / 2);
  });

  it('gives each flavour its own words', () => {
    const labels = [missBeat(600).label, missBeat(200).label, missBeat(20).label];
    expect(new Set(labels).size).toBe(3);
  });
});
