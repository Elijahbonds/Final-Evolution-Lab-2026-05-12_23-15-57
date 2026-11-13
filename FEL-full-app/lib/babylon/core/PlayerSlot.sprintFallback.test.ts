// lane/move-feel (2026-11-12): THE STICK'S TURBO FALLBACK as a feel knob — `hoops.stickSprintFallback` (core/HoopsStick). As shipped (1), a
// stick past 0.85 is the turbo until any trigger has reported (a phone before its TURBO pad is touched, a keyboard before Shift); 0 ends
// the fallback: the turbo is the button or the trigger only, and a full push is a jog from the first frame.
import { describe, it, expect, afterEach } from 'vitest';
import { LocalInputSource } from './PlayerSlot';
import { HOOPS_STICK_SPRINT_FALLBACK } from './HoopsStick';
import { setFeelUser, setFeelSession, setFeelOverride, resetFeelForTests } from '@/lib/feel-panel/feel';

describe('the stick turbo fallback (hoops.stickSprintFallback)', () => {
  afterEach(() => { resetFeelForTests(); });

  it('ships on (1): a full push sprints until a trigger reports, then jogs', () => {
    expect(HOOPS_STICK_SPRINT_FALLBACK).toBe(1);
    const s = new LocalInputSource();
    s.feed({ t: 'stick', side: 'L', x: 1, y: 0 });
    expect(s.poll().sprint).toBe(true);
    s.feed({ t: 'stick', side: 'L', x: 0.8, y: 0 });
    expect(s.poll().sprint).toBe(false);   // (0.85 is the line)
    s.feed({ t: 'trigger', side: 'R', value: 0 });   // the TURBO pad let go, once
    s.feed({ t: 'stick', side: 'L', x: 1, y: 0 });
    expect(s.poll().sprint).toBe(false);
  });

  it('off (0): a full push never sprints; the turbo still does, on the trigger and on Shift', () => {
    setFeelUser(true); setFeelSession(null); expect(setFeelOverride('hoops.stickSprintFallback', 0)).toBe(0);
    const s = new LocalInputSource();
    s.feed({ t: 'stick', side: 'L', x: 1, y: 0 });
    expect(s.poll().sprint).toBe(false);
    s.feed({ t: 'trigger', side: 'R', value: 1 });
    expect(s.poll().sprint).toBe(true);
    const k = new LocalInputSource();
    k.feed({ t: 'stick', side: 'L', x: 1, y: 0 });
    k.feed({ t: 'button', btn: 'R1', pressed: true, src: 'key' });
    expect(k.poll().sprint).toBe(true);
  });
});
