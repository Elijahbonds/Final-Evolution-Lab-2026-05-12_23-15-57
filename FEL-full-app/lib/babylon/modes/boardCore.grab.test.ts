// HOTFIX (2026-09-24): THE MINIMUM GRAB. On the snowboard X in the air is a grab and X's release ends it, so a keyboard tap
// (released inside a frame or three) graded a 0.05–0.1 s hold — under GRAB_SKETCHY — and landed as a BAIL. The rule now,
// opt-in per board (`minGrabSec`; the snowboard passes MIN_TAP_GRAB_SEC): a grab is held at least that long from the throw,
// so a tap is a clean minimum grab. Surf and the carnival gauntlet pass nothing and keep the release-ends-it-now rule.
import { describe, expect, it } from 'vitest';
import { TRICKS, TrickMachine, type BoardRig, type TrickMachineOpts } from './boardCore';

function fake(opts: TrickMachineOpts = {}) {
  const rider = { grounded: true, vel: { scaleInPlace: () => undefined }, jump: () => undefined };
  const rig = { char: { root: { rotation: { y: 0, z: 0 } }, animator: { play: () => undefined } }, rider } as unknown as BoardRig;
  let grabEnds = 0;
  const tm = new TrickMachine(rig, () => undefined, { anim: 'external', ...opts, onGrabEnd: () => { grabEnds++; opts.onGrabEnd?.(); } });
  const step = (sec: number) => { for (let i = 0; i < Math.round(sec * 60); i++) tm.update(1 / 60); };
  /** pop, throw a grab, let go of the button after `tapSec`, ride the rest of `airSec`, land: the landing banner */
  const tapGrab = (tapSec: number, airSec: number): string | null => {
    rider.grounded = false; tm.start(TRICKS.grab);
    step(tapSec); tm.endGrab();
    step(airSec - tapSec);
    rider.grounded = true; return tm.update(1 / 60);
  };
  return { tm, rider, step, tapGrab, grabEnds: () => grabEnds };
}

const SNOW: TrickMachineOpts = { minGrabSec: TrickMachine.MIN_TAP_GRAB_SEC };

describe('TrickMachine minimum grab (snowboard X tap)', () => {
  it('the minimum is exactly one clean grab: 4 a second against a need of 1', () => {
    expect(TrickMachine.MIN_TAP_GRAB_SEC * 4).toBeGreaterThanOrEqual(TrickMachine.LAND_CLEAN);
  });

  it('a keyboard tap (released after 1 frame) is a clean minimum grab, not a bail', () => {
    const { tapGrab } = fake(SNOW);
    expect(tapGrab(1 / 60, 0.8)).toBe('GRAB +90');
  });

  it('without a minimum (surf, the gauntlet) the same tap is still the bail — the rule is opt-in', () => {
    const { tapGrab } = fake();
    expect(tapGrab(1 / 60, 0.8)).toBe('BAILED');
  });

  it('the tapped grab stays held until the minimum runs out, then ends (and says so once)', () => {
    const { tm, rider, step, grabEnds } = fake(SNOW);
    rider.grounded = false; tm.start(TRICKS.grab);
    step(2 / 60); tm.endGrab();
    expect(tm.grabHeld).toBe(true);                  // released, but inside the minimum hold
    expect(grabEnds()).toBe(0);
    step(0.15);                                      // 0.18 s from the throw
    expect(tm.grabHeld).toBe(true);
    step(0.1);                                       // past 0.25 s
    expect(tm.grabHeld).toBe(false);
    expect(grabEnds()).toBe(1);
    step(0.3);
    expect(grabEnds()).toBe(1);
  });

  it('a grab held past the minimum ends on the release, as it always did', () => {
    const { tm, rider, step, grabEnds } = fake(SNOW);
    rider.grounded = false; tm.start(TRICKS.grab);
    step(0.4); tm.endGrab();
    expect(tm.grabHeld).toBe(false);
    expect(grabEnds()).toBe(1);
  });

  it('a tap that lands inside the minimum is graded on the air it had (the grab ends at touchdown)', () => {
    const { tm, tapGrab, grabEnds } = fake(SNOW);
    expect(tapGrab(1 / 60, 0.2)).toBe('SKETCHY GRAB +45');   // 0.2 s of air held the grab 0.2 s: 0.8 of a clean one
    expect(tm.grabHeld).toBe(false);
    expect(grabEnds()).toBe(1);
  });

  it('a new trick thrown during the minimum hold starts its own grab (the old release does not end it)', () => {
    const { tm, rider, step } = fake(SNOW);
    rider.grounded = false; tm.start(TRICKS.grab);
    step(1 / 60); tm.endGrab();
    tm.start(TRICKS.grab);
    step(0.4);
    expect(tm.grabHeld).toBe(true);
  });

  // HOTFIX (2026-09-24): the minimum is an AIR rule — a release on the ground ends the grab at once
  it('a grab held through a short air and let go on the ground ends at the release (and the next jump is not a grab)', () => {
    const { tm, rider, step, grabEnds } = fake(SNOW);
    rider.grounded = false; tm.start(TRICKS.grab);
    step(0.15);                                      // the air ran out 0.15 s into the grab, X still down
    rider.grounded = true;
    expect(tm.update(1 / 60)).toBe('SKETCHY GRAB +45');
    expect(tm.grabHeld).toBe(true);                  // X is still held on the snow
    tm.endGrab();                                    // …and let go there, inside the 0.25 s minimum
    expect(tm.grabHeld).toBe(false);
    expect(grabEnds()).toBe(1);
    rider.grounded = false; step(0.2);               // the next plain jump, no trick pressed
    expect(tm.grabHeld).toBe(false);
    expect(grabEnds()).toBe(1);
  });

  it('a release between tricks (landed, then airborne again with no trick) ends the grab at once', () => {
    const { tm, rider, step, grabEnds } = fake(SNOW);
    rider.grounded = false; tm.start(TRICKS.grab);
    step(0.15); rider.grounded = true;
    expect(tm.update(1 / 60)).toBe('SKETCHY GRAB +45');   // landed inside the minimum, X still down
    rider.grounded = false; step(1 / 60);                  // a bump: in the air again, no trick thrown
    tm.endGrab();
    expect(tm.grabHeld).toBe(false);
    expect(grabEnds()).toBe(1);
  });

  it('a bail clears a pending release', () => {
    const { tm, rider, step, grabEnds } = fake(SNOW);
    rider.grounded = false; tm.start(TRICKS.grab);
    step(1 / 60); tm.endGrab(); tm.bail();
    step(0.4);
    expect(tm.grabHeld).toBe(false);
    expect(grabEnds()).toBe(0);
  });
});
