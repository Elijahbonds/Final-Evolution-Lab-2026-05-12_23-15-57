import { describe, expect, it } from 'vitest';
import { KO_REPLAY, KoReplayCue } from './koReplay';

const ko = { kind: 'ko', decidesMatch: false, victim: 1 } as const;
const run = (c: KoReplayCue, sec: number) => { let p = null; for (let t = 0; t < sec; t += 1 / 60) p = c.step(1 / 60) ?? p; return p; };

describe('KO replays are paced', () => {
  it('a KO that does not decide the match is offered once, a beat after the fall, on the victim', () => {
    const c = new KoReplayCue();
    expect(c.arm(ko, false)).toBe(true);
    expect(c.step(0.2)).toBeNull();
    const plan = run(c, KO_REPLAY.delaySec);
    expect(plan).toEqual({ lastSeconds: KO_REPLAY.lastSec, focus: 1, angles: ['low', 'side', 'tight'], kind: 'ko' });
    expect(c.step(1)).toBeNull();                     // once
    expect(c.count).toBe(1);
  });
  it('NEVER the match-deciding finish: it goes straight to the end card', () => {
    const c = new KoReplayCue();
    expect(c.arm({ ...ko, decidesMatch: true }, false)).toBe(false);
    expect(c.armed).toBe(false);
    expect(run(c, 5)).toBeNull();
  });
  it('not the bell, not a fire pit: only a strike KO or a ring-out', () => {
    const c = new KoReplayCue();
    expect(c.arm({ ...ko, kind: 'time' }, false)).toBe(false);
    expect(c.arm({ ...ko, kind: 'hazard' }, false)).toBe(false);
    expect(c.arm({ ...ko, kind: 'ringout' }, false)).toBe(true);
  });
  it('a ring-out waits for the fall and is shot from the side and from above', () => {
    const c = new KoReplayCue(); c.arm({ kind: 'ringout', decidesMatch: false, victim: 0 }, false);
    expect(run(c, KO_REPLAY.delaySec + 0.05)).toBeNull();
    const plan = run(c, KO_REPLAY.ringOutDelaySec);
    expect(plan?.angles).toEqual(['side', 'high']); expect(plan?.focus).toBe(0); expect(plan?.lastSeconds).toBe(KO_REPLAY.ringOutLastSec);
  });
  it('never under reduced motion', () => {
    const c = new KoReplayCue();
    expect(c.arm(ko, true)).toBe(false);
  });
  it('at most maxPerMatch a match; a new match starts again', () => {
    const c = new KoReplayCue();
    for (let i = 0; i < KO_REPLAY.maxPerMatch; i++) { expect(c.arm(ko, false)).toBe(true); expect(run(c, 3)).not.toBeNull(); }
    expect(c.arm(ko, false)).toBe(false);
    c.reset();
    expect(c.arm(ko, false)).toBe(true);
  });
  it('a round that moves on first cancels the cue', () => {
    const c = new KoReplayCue(); c.arm(ko, false); c.cancel();
    expect(run(c, 5)).toBeNull();
    expect(c.arm(ko, false)).toBe(true);
  });
  it('one cue at a time (arming twice before it fires does not queue a second)', () => {
    const c = new KoReplayCue();
    expect(c.arm(ko, false)).toBe(true); expect(c.arm(ko, false)).toBe(false);
  });
});
