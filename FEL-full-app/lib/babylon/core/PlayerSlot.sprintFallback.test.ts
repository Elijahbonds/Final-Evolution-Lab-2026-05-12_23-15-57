// lane/move-feel (2026-11-12): THE STICK'S TURBO FALLBACK as a feel knob — `hoops.stickSprintFallback` (core/HoopsStick). OFF (0) since the
// owner's 2026-11-17 "turn all six on now": the turbo is the button or the trigger only, and a full push is a jog from the first frame. 1 is
// the game before: a stick past 0.85 is the turbo until any trigger has reported (a phone before TURBO is touched, a keyboard before Shift).
import { describe, it, expect, afterEach } from 'vitest';
import { LocalInputSource } from './PlayerSlot';
import { HOOPS_STICK_SPRINT_FALLBACK } from './HoopsStick';
import { setFeelUser, setFeelSession, setFeelOverride, resetFeelForTests } from '@/lib/feel-panel/feel';

describe('the stick turbo fallback (hoops.stickSprintFallback)', () => {
  afterEach(() => { resetFeelForTests(); });

  it('1 (the game before 2026-11-17): a full push sprints until a trigger reports, then jogs', () => {
    setFeelUser(true); setFeelSession(null); expect(setFeelOverride('hoops.stickSprintFallback', 1)).toBe(1);
    const s = new LocalInputSource();
    s.feed({ t: 'stick', side: 'L', x: 1, y: 0 });
    expect(s.poll().sprint).toBe(true);
    s.feed({ t: 'stick', side: 'L', x: 0.8, y: 0 });
    expect(s.poll().sprint).toBe(false);   // (0.85 is the line)
    s.feed({ t: 'trigger', side: 'R', value: 0 });   // the TURBO pad let go, once
    s.feed({ t: 'stick', side: 'L', x: 1, y: 0 });
    expect(s.poll().sprint).toBe(false);
  });

  it('0, the default (owner 2026-11-17): a full push never sprints; the turbo still does, on the trigger and on Shift', () => {
    expect(HOOPS_STICK_SPRINT_FALLBACK).toBe(0);
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
