// The touch radial: the slice under the thumb, and a gesture's FelInput (the pad's own events, so the mapper treats
// touch exactly like a pad).
import { describe, expect, it } from 'vitest';
import { neutralInput } from '../contracts';
import { createInputMapper } from './inputMap';
import { RADIAL_SLICES, RadialGesture, sliceAt, slicePos } from './touchRadial';

describe('the touch radial', () => {
  it('a still thumb is the hub; each direction is its slice, the first straight up', () => {
    expect(sliceAt(0.1, -0.1)).toBeNull();
    RADIAL_SLICES.forEach((s, i) => {
      const p = slicePos(i);
      expect(sliceAt(p.x * 0.8, p.y * 0.8)?.id).toBe(s.id);
    });
    expect(sliceAt(0, -1)?.id).toBe('lock');
  });

  it('a tap slice fires on the lift; a hold slice holds while the thumb rests on it', () => {
    const g = new RadialGesture();
    const lock = slicePos(0), guard = slicePos(RADIAL_SLICES.findIndex((s) => s.id === 'guard'));
    expect(g.move(lock.x, lock.y)).toEqual([]);
    expect(g.move(guard.x, guard.y)).toEqual([{ t: 'button', btn: 'L1', pressed: true }]);
    expect(g.move(lock.x, lock.y)).toEqual([{ t: 'button', btn: 'L1', pressed: false }]);
    expect(g.end()).toEqual([{ t: 'button', btn: 'R1', pressed: true }, { t: 'button', btn: 'R1', pressed: false }]);
    expect(g.end()).toEqual([]);
  });

  it('what a slice sends is what the mapper reads as that verb', () => {
    const m = createInputMapper();
    const want: Record<string, (i: ReturnType<typeof neutralInput>) => boolean> = {
      lock: (i) => i.lock, cast: (i) => i.magic, fuse: (i) => i.fuse, partner: (i) => i.partner,
    };
    for (const s of RADIAL_SLICES) {
      if (s.hold) continue;
      m.onInput(s.down); m.onInput(s.up);
      const out = m.fill(neutralInput(), { camYaw: 0, state: 'ground' });
      expect(want[s.id](out), s.id).toBe(true);
    }
    const slow = RADIAL_SLICES.find((s) => s.id === 'slow')!;
    m.onInput(slow.down);
    expect(m.fill(neutralInput(), { camYaw: 0, state: 'ground' }).focusHeld).toBe(true);
  });
});
