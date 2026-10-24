// lane/hoops-shot-content (2026-10-20): which body a shot plays — the step-back's rise, the bank's set / follow-through / glance.
import { describe, expect, it } from 'vitest';
import { Vector3 } from '@babylonjs/core';
import { BankLook, BANK_SET_DEG, gatherClipFor, riseClipFor } from './shotLooks';
import { STEPBACK_RELEASE_CLIP, STEPBACK_RELEASE_01, BANK_FOLLOW_CLIP } from '../anim/authored/shotKit';
import { RELEASE_FRAME_01 } from '../core/BallHandling';
import { CAPTURE_RELEASE_01 } from '../anim/opponentMotion';
import { bankPoint, inBankBand } from '../core/HoopsMoves';
import { followThroughFor } from '../core/BasketballCore';
import { yawTo } from '../core/Biomech';
import { lateralOf } from '../anim/athleteSide';

const RIM = new Vector3(0, 3.05, -0.6), RIM_FLOOR = new Vector3(0, 0, -0.6), N = new Vector3(0, 0, 1);
const anim = (names: string[]) => ({ clipNames: new Set(names) }) as never;

describe('the step-back rises on its own release', () => {
  it('a step-back gathers on its own clip; every other kind on the pull-up', () => {
    expect(gatherClipFor('stepback')).toBe('bball_stepback_gather');
    expect(gatherClipFor('pullup')).toBe('bball_pullup_gather');
    expect(gatherClipFor('set')).toBe('bball_pullup_gather');
    expect(gatherClipFor(undefined)).toBe('bball_pullup_gather');
  });
  it('a step-back on a body with the kit holds bball_stepback_release paced by its own release key; everything else the jumpshot', () => {
    expect(riseClipFor('stepback', anim([STEPBACK_RELEASE_CLIP]))).toEqual({ clip: STEPBACK_RELEASE_CLIP, release01: STEPBACK_RELEASE_01 });
    expect(riseClipFor('pullup', anim([STEPBACK_RELEASE_CLIP]))).toEqual({ clip: 'jumpshot', release01: RELEASE_FRAME_01 });
    expect(riseClipFor(undefined, anim([STEPBACK_RELEASE_CLIP]))).toEqual({ clip: 'jumpshot', release01: RELEASE_FRAME_01 });
    // no kit on this body (an unscoped spawn): the jumpshot, as before
    expect(riseClipFor('stepback', anim([])).clip).toBe('jumpshot');
    // the jumpshot's release is the clip that really plays — the capture's where one replaces it (unchanged from the modes' old line)
    expect(riseClipFor('set', anim(['bball_mc_jumpshot'])).release01).toBe(CAPTURE_RELEASE_01.bball_mc_jumpshot);
  });
});

describe('the bank look', () => {
  const wing = (deg: number, d = 4.5) => new Vector3(RIM_FLOOR.x + Math.sin(deg * Math.PI / 180) * d, 0, RIM_FLOOR.z + Math.cos(deg * Math.PI / 180) * d);
  it('the angled set: ±BANK_SET_DEG toward the glass point, only with glass held inside the band', () => {
    for (const deg of [-40, 40]) {
      const p = wing(deg); expect(inBankBand(p, RIM_FLOOR, N)).toBe(true);
      const b = new BankLook();
      const add = b.setYaw(p, RIM, RIM_FLOOR, N, true);
      expect(Math.abs(add)).toBeCloseTo(BANK_SET_DEG * Math.PI / 180, 9);
      // it turns TOWARD the glass point: the glass point's bearing lies on the same side of the rim's as the turn
      const toRim = yawTo(p, RIM), toGlass = yawTo(p, bankPoint(p, RIM, N));
      expect(Math.sign(add)).toBe(Math.sign(Math.atan2(Math.sin(toGlass - toRim), Math.cos(toGlass - toRim))));
      expect(b.target()).not.toBeNull();   // the glance is on
    }
    const b = new BankLook();
    expect(b.setYaw(wing(40), RIM, RIM_FLOOR, N, false)).toBe(0);       // not called
    expect(b.setYaw(wing(0), RIM, RIM_FLOOR, N, true)).toBe(0);         // straight on: outside the band
    expect(b.setYaw(wing(40, 9), RIM, RIM_FLOOR, N, true)).toBe(0);     // too deep
    expect(b.target()).toBeNull();                                       // nothing called: the eyes stay the mode's
  });
  it('the follow-through: a green bank goes to the glass side as drawn; early / late / not banked keep their own', () => {
    const b = new BankLook();
    for (const deg of [-40, 40]) {
      const p = wing(deg), yaw = yawTo(p, RIM), bank = bankPoint(p, RIM, N);
      const side = lateralOf(p, yaw, bank) >= 0 ? 'right' : 'left';
      expect(b.followThrough('perfect', bank, p, yaw)).toBe(BANK_FOLLOW_CLIP[side]);
      expect(b.followThrough('good', bank, p, yaw)).toBe(BANK_FOLLOW_CLIP[side]);
      for (const q of ['early', 'late', 'brick', 'held'] as const) expect(b.followThrough(q, bank, p, yaw)).toBe(followThroughFor(q));
      for (const q of ['perfect', 'good', 'early', 'late'] as const) expect(b.followThrough(q, null, p, yaw)).toBe(followThroughFor(q));
    }
    // the two wings bank off opposite sides
    const l = wing(-40), r = wing(40);
    expect(b.followThrough('perfect', bankPoint(l, RIM, N), l, yawTo(l, RIM))).not.toBe(b.followThrough('perfect', bankPoint(r, RIM, N), r, yawTo(r, RIM)));
  });
  it('the glance lasts the flight, then the eyes go back to the mode', () => {
    let now = 1000; const real = performance.now; (performance as { now: () => number }).now = () => now;
    try {
      const b = new BankLook();
      b.setYaw(wing(40), RIM, RIM_FLOOR, N, true);
      expect(b.target()).not.toBeNull();
      now += 1000; expect(b.target()).not.toBeNull();
      now += 200; expect(b.target()).toBeNull();
      b.setYaw(wing(40), RIM, RIM_FLOOR, N, true); b.reset(); expect(b.target()).toBeNull();
    } finally { (performance as { now: () => number }).now = real; }
  });
});
