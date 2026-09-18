// LocalInputSource — the 2K map on a pad and on a keyboard (suite pass, 2026-09-16).
//
// The bug this pins: SHIFT reached the slot as both R1 (glass) and an R trigger (turbo), so every keyboard sprint
// drive was a glass finish; and the R trigger it pulled also started the dunk contest's run-up. Now the keyboard's
// two shoulders arrive as R1 / L1 tagged `src: 'key'` and the slot alone turns the tag into turbo / intense.

import { describe, it, expect } from 'vitest';
import { LocalInputSource } from './PlayerSlot';

describe('LocalInputSource 2K map', () => {
  it('pad: R2 is turbo, R1 is glass, L2 is post-up + intense, L1 is the plant only', () => {
    const s = new LocalInputSource();
    s.feed({ t: 'trigger', side: 'R', value: 1 });
    s.feed({ t: 'button', btn: 'R1', pressed: true });
    s.feed({ t: 'trigger', side: 'L', value: 1 });
    let i = s.poll();
    expect(i.turbo).toBe(true); expect(i.sprint).toBe(true); expect(i.glass).toBe(true);
    expect(i.brace).toBe(true); expect(i.intense).toBe(true);
    s.feed({ t: 'trigger', side: 'L', value: 0 });
    s.feed({ t: 'button', btn: 'L1', pressed: true });
    i = s.poll();
    expect(i.brace).toBe(true); expect(i.intense).toBe(false);
  });
  it('keyboard: SHIFT (R1 src:key) is turbo and NOT glass', () => {
    const s = new LocalInputSource();
    s.feed({ t: 'stick', side: 'L', x: 0, y: -1 });
    s.feed({ t: 'button', btn: 'R1', pressed: true, src: 'key' });
    let i = s.poll();
    expect(i.turbo).toBe(true); expect(i.sprint).toBe(true); expect(i.glass).toBe(false);
    s.feed({ t: 'button', btn: 'R1', pressed: false, src: 'key' });
    i = s.poll();
    expect(i.turbo).toBe(false);
    // once a turbo source has reported, a full-magnitude keyboard direction is a WALK, not a sprint
    expect(i.sprint).toBe(false);
  });
  it('keyboard: F (L1 src:key) is post-up AND intense; Q (plain L1) is the plant only', () => {
    const s = new LocalInputSource();
    s.feed({ t: 'button', btn: 'L1', pressed: true, src: 'key' });
    let i = s.poll();
    expect(i.brace).toBe(true); expect(i.intense).toBe(true);
    s.feed({ t: 'button', btn: 'L1', pressed: false, src: 'key' });
    s.feed({ t: 'button', btn: 'L1', pressed: true });
    i = s.poll();
    expect(i.brace).toBe(true); expect(i.intense).toBe(false);
  });
  it('a pad that has never reported a trigger still sprints on a hard stick', () => {
    const s = new LocalInputSource();
    s.feed({ t: 'stick', side: 'L', x: 1, y: 0 });
    expect(s.poll().sprint).toBe(true);
  });
});
