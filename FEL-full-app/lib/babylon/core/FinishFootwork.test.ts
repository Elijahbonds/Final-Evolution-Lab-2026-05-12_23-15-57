// H2e (owner 2026-10-16): the hop step on a double tap of Square; the skip gather on Square + the left stick away from him.
import { describe, expect, it } from 'vitest';
import { Vector3 } from '@babylonjs/core';
import { hopOnDoubleTap, tapReleaseHeld, hopThen, hopReleaseOnButtonUp, hopAutoReleaseNow, HOP_AUTO_QUALITY, HOP_LAYUP_INSIDE_M, HOP_TAP_SEC, HOP_CONVERT_SEC, HOP_TAP_MIN_SPEED, skipAvailable, skipAwaySide, planSkipGather, SKIP_MIN, SKIP_MAX, SKIP_A_SEC, SKIP_B_SEC, type DoubleTapRead } from './FinishFootwork';
import { gatherTravel, gatherLabel, gatherWish, HOP_RANGE } from './HoopsMoves';

const tap = (o: Partial<DoubleTapRead> = {}): DoubleTapRead => ({ sinceSqueezeSec: 0.12, gatherSec: 0.08, speed: 4, rimDist: 3.5, hopAlready: false, dunking: false, ...o });

describe('the double-tapped hop releases itself (owner 2026-10-16, decisions 17-19)', () => {
  it('always ends in a finish: a layup in close, a floater beyond (never a jumper)', () => {
    expect(hopThen(HOP_LAYUP_INSIDE_M - 0.1)).toBe('layup');
    expect(hopThen(HOP_LAYUP_INSIDE_M + 0.1)).toBe('floater');
    expect(hopThen(4.9)).toBe('floater');
  });
  it('tap-tap (the second press up during the hop) is the self-release; up after the hop, the player is timing it', () => {
    expect(hopReleaseOnButtonUp('armed', true)).toBe('auto');
    expect(hopReleaseOnButtonUp('armed', false)).toBeNull();
    expect(hopReleaseOnButtonUp(null, true)).toBeNull();           // no double tap: nothing to release by itself
    expect(hopReleaseOnButtonUp('auto', false)).toBe('auto');      // a later button-up does not take it back
  });
  it('the self-release goes at the finish\'s own release key (the green centre), untimed', () => {
    expect(hopAutoReleaseNow('auto', 0.61, 0.62)).toBe(false);
    expect(hopAutoReleaseNow('auto', 0.62, 0.62)).toBe(true);
    expect(hopAutoReleaseNow('armed', 0.9, 0.62)).toBe(false);    // held: the player times it
    expect(HOP_AUTO_QUALITY).toBe('held');
  });
});

describe('the hop step on a double tap (hopOnDoubleTap)', () => {
  it('a second press inside HOP_TAP_SEC, the gather still young, on a drive in range: the hop', () => expect(hopOnDoubleTap(tap())).toBe(true));
  it('too late, too old a gather, too slow, out of range, already a hop, or a dunk: no', () => {
    expect(hopOnDoubleTap(tap({ sinceSqueezeSec: HOP_TAP_SEC + 0.01 }))).toBe(false);
    expect(hopOnDoubleTap(tap({ sinceSqueezeSec: 0 }))).toBe(false);                    // the first press itself
    expect(hopOnDoubleTap(tap({ gatherSec: HOP_CONVERT_SEC + 0.01 }))).toBe(false);
    expect(hopOnDoubleTap(tap({ speed: HOP_TAP_MIN_SPEED - 0.1 }))).toBe(false);
    expect(hopOnDoubleTap(tap({ rimDist: HOP_RANGE + 0.1 }))).toBe(false);
    expect(hopOnDoubleTap(tap({ hopAlready: true }))).toBe(false);
    expect(hopOnDoubleTap(tap({ dunking: true }))).toBe(false);
  });
  it('a quick tap that pump-faked a rise (no gather left) still converts: the second press is the hop', () => expect(hopOnDoubleTap(tap({ gatherSec: 0 }))).toBe(true));
  it('the first press\'s quick release is held exactly while a second press could still make the hop (and from the press frame on)', () => {
    expect(tapReleaseHeld(tap())).toBe(true);
    expect(tapReleaseHeld(tap({ sinceSqueezeSec: 0 }))).toBe(true);   // released on the press's own frame: still held
    expect(tapReleaseHeld(tap({ sinceSqueezeSec: HOP_TAP_SEC + 0.01 }))).toBe(false);
    expect(tapReleaseHeld(tap({ gatherSec: HOP_CONVERT_SEC + 0.01 }))).toBe(false);
    expect(tapReleaseHeld(tap({ speed: HOP_TAP_MIN_SPEED - 0.1 }))).toBe(false);   // a set shot is never held: only a drive can hop
    expect(tapReleaseHeld(tap({ dunking: true }))).toBe(false);
  });
});

describe('the skip gather (Square + the left stick away from him)', () => {
  // yaw 0 faces +z, his right is +x; the rim straight ahead
  const me = { x: 0, z: 0 }, rim = { x: 0, z: 4 };
  it('the stick away from the defender asks for that side; toward him, or not across the body, asks for nothing', () => {
    const defRight = { x: 0.8, z: 1.2 };
    expect(skipAwaySide(-1, 0.3, 0, me, defRight)).toBe('left');   // he is on my right; the stick to my left
    expect(skipAwaySide(1, 0.3, 0, me, defRight)).toBeNull();      // at him
    expect(skipAwaySide(0.1, 1, 0, me, defRight)).toBeNull();      // straight at the rim
    expect(skipAwaySide(1, 0, 0, me, null)).toBe('right');         // nobody: the stick's own side
  });
  it('only on a drive in its band', () => {
    expect(skipAvailable({ x: 0, z: 3 }, me, rim)).toBe(true);
    expect(skipAvailable({ x: 0, z: 1 }, me, rim)).toBe(false);
    expect(skipAvailable({ x: 0, z: 3 }, me, { x: 0, z: SKIP_MIN - 0.1 })).toBe(false);
    expect(skipAvailable({ x: 0, z: 3 }, me, { x: 0, z: SKIP_MAX + 0.1 })).toBe(false);
  });
  it('the plan: a long low step angled away, the skip at the rim, then a layup on the away hand off the glass', () => {
    const p = planSkipGather({ x: 0, z: 3 }, me, rim, 'left', 0);
    expect(p.kind).toBe('skip'); expect(p.then).toBe('layup'); expect(p.side).toBe('left'); expect(p.glass).toBe(true);
    expect(p.sec).toBeCloseTo(SKIP_A_SEC + SKIP_B_SEC, 9);
    const a = gatherWish(p, 0.05); expect(a.x).toBeLessThan(0); expect(a.z).toBeGreaterThan(0);   // step A: at the rim and away (to my left, −x)
    const b = gatherWish(p, SKIP_A_SEC + 0.05); expect(Math.abs(b.x)).toBeLessThan(1e-9); expect(b.z).toBeGreaterThan(0);
    expect(gatherTravel(p)).toBeGreaterThan(1.4);   // a LONG gather
    expect(gatherLabel('skip', 'X')).toBe('SKIP GATHER');
    expect(planSkipGather({ x: 0, z: 3 }, me, rim, 'right', 0).legs![0].dir.x).toBeGreaterThan(0);
  });
});
void Vector3;
