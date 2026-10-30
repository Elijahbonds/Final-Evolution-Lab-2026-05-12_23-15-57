// CAMERA TIP (2026-10-29): cam.dunkFraming, default off — off is today's framing exactly; on fixes QA items 1-3 and 8.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  CAM_DUNK_FRAMING_ON, CONTEST_FOLLOW, HOOP_KEEP_OUT, RESET_MIN_Y, RIM_CUT_AIM_H, RIM_CUT_OFFSET, SLAM_AIM_BETWEEN_H, TALL_SLAM_MIN_Y,
  TALL_SLAM_PULL_M, UNDER_HOOP_M, clearOfHoop, dunkFramingOn, isTall, rimCutSpot, runUpTune, tuneKey,
} from './dunkCamFraming';
import { FOLLOW_PRESETS } from './CameraDirector';
import { DUNK_BACKBOARD_Z } from '../visual/venuePropSets';
import { RIM_HEIGHT_M } from './courtDims';
import { FEEL_STORAGE_KEY, resetFeelForTests, setFeelSession, setFeelUser } from '../../feel-panel/feel';
import { feelSessionBlock } from '../../feel-panel/sessionGate';

class FakeStorage {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}
const g = globalThis as { window?: unknown };
let ls: FakeStorage;
beforeEach(() => { resetFeelForTests(); ls = new FakeStorage(); g.window = { localStorage: ls }; });
afterEach(() => { resetFeelForTests(); delete g.window; });
const knobOn = () => { ls.m.set(FEEL_STORAGE_KEY, JSON.stringify({ 'cam.dunkFraming': 1 })); setFeelUser(true); setFeelSession(feelSessionBlock('/play/dunk', '?playtest=1')); };

const RIM = { x: 0, y: RIM_HEIGHT_M, z: -10.3 };
const PHONE = 390 / 844, DESKTOP = 16 / 9;

describe('cam.dunkFraming OFF (the default): today\'s camera, exactly', () => {
  it('defaults off; the repeated preset numbers are the contest preset\'s', () => {
    expect(CAM_DUNK_FRAMING_ON).toBe(0); expect(dunkFramingOn()).toBe(false);
    const c = FOLLOW_PRESETS.contest;
    expect([c.distance, c.height, c.pitchCapDeg]).toEqual([CONTEST_FOLLOW.distance, CONTEST_FOLLOW.height, CONTEST_FOLLOW.pitchCapDeg]);
    expect(SLAM_AIM_BETWEEN_H).toBeCloseTo((1.4 + RIM_HEIGHT_M) / 2, 9);
  });
  it('the rim cut is rim + (2.9, 1.15, 1.9), aim 1.5, on every screen', () => {
    for (const a of [PHONE, 1, DESKTOP]) expect(rimCutSpot(RIM, a)).toEqual({ at: { x: 2.9, y: 1.15, z: RIM.z + 1.9 }, aimH: 1.5 });
    expect([RIM_CUT_OFFSET.x, RIM_CUT_OFFSET.y, RIM_CUT_OFFSET.z, RIM_CUT_AIM_H]).toEqual([2.9, 1.15, 1.9, 1.5]);
  });
  it('no hoop keep-out and no run-up overlay', () => {
    const under = { x: 0.2, y: 1.2, z: DUNK_BACKBOARD_Z + 0.5 };
    expect(clearOfHoop(under, DUNK_BACKBOARD_Z)).toBe(under);
    expect(runUpTune({ runUp: true, speed: 0, aspect: PHONE })).toBeNull();
    expect(tuneKey(null)).toBe('');
  });
});

describe('cam.dunkFraming ON', () => {
  it('QA 1 (phone slam): a tall screen pulls the cut back 1.75 m along its own line, lifts it level with the iron, aims between chest and rim', () => {
    knobOn(); expect(dunkFramingOn()).toBe(true);
    const c = rimCutSpot(RIM, PHONE);
    const d0 = Math.hypot(2.9, 1.9), d1 = Math.hypot(c.at.x - RIM.x, c.at.z - RIM.z);
    expect(d1 - d0).toBeCloseTo(TALL_SLAM_PULL_M, 9);
    expect((c.at.z - RIM.z) / (c.at.x - RIM.x)).toBeCloseTo(1.9 / 2.9, 9);   // same bearing: only further back
    expect(c.at.y).toBe(TALL_SLAM_MIN_Y); expect(c.at.y).toBeGreaterThanOrEqual(3.0);
    expect(c.aimH).toBeCloseTo(SLAM_AIM_BETWEEN_H, 9); expect(c.aimH).toBeGreaterThan(1.4); expect(c.aimH).toBeLessThan(RIM.y);
  });
  it('QA 1: a wide screen keeps today\'s cut', () => {
    knobOn();
    for (const a of [1, DESKTOP]) expect(rimCutSpot(RIM, a)).toEqual({ at: { x: 2.9, y: 1.15, z: RIM.z + 1.9 }, aimH: 1.5 });
    expect([isTall(PHONE), isTall(1), isTall(0), isTall(Number.NaN)]).toEqual([true, false, false, false]);
  });
  it('QA 2 (reset cam): a camera in the stanchion box or under the hoop moves out in front of the glass and up', () => {
    knobOn();
    const B = DUNK_BACKBOARD_Z;
    for (const p of [{ x: 0, y: 1.0, z: B - 0.9 }, { x: 0.5, y: 2.0, z: B + 0.3 }, { x: -1.2, y: 1.6, z: B + 1.8 }]) {
      const c = clearOfHoop(p, B);
      expect(c.z).toBeGreaterThanOrEqual(B + UNDER_HOOP_M); expect(c.y).toBeGreaterThanOrEqual(RESET_MIN_Y); expect(c.x).toBe(p.x);
    }
    // already high stays high; out of the box stays put
    expect(clearOfHoop({ x: 0, y: 4.2, z: B + 1 }, B).y).toBe(4.2);
    for (const p of [{ x: 3.5, y: 1.2, z: B + 0.5 }, { x: 0, y: 1.6, z: B + 4 }, { x: 0, y: 1.6, z: B - HOOP_KEEP_OUT.behindM - 1 }]) expect(clearOfHoop(p, B)).toBe(p);
  });
  it('QA 3 (over the shoulder): the run-up is up 1 m and back 1.5 m with a steeper pitch cap', () => {
    knobOn();
    for (const a of [PHONE, DESKTOP]) expect(runUpTune({ runUp: true, speed: 5, aspect: a })).toEqual({ distance: 7.1, height: 2.7, pitchCapDeg: 20 });
    expect(runUpTune({ runUp: true, speed: 0, aspect: DESKTOP })).toEqual({ distance: 7.1, height: 2.7, pitchCapDeg: 20 });
    expect(runUpTune({ runUp: false, speed: 5, aspect: PHONE })).toBeNull();   // the flight, resolve and verdict keep their own cameras
  });
  it('QA 8 (phone idle): standing on a tall screen comes 3 m closer and looks further toward the rim', () => {
    knobOn();
    const t = runUpTune({ runUp: true, speed: 0.1, aspect: PHONE })!;
    expect(t.distance).toBeCloseTo(4.1, 9); expect(t.height).toBeCloseTo(2.7, 9); expect(t.lookAhead).toBe(1.6);
    expect(tuneKey(t)).not.toBe(tuneKey(runUpTune({ runUp: true, speed: 5, aspect: PHONE })));
  });
});

describe('CAMERA TIP wiring in DunkMode', () => {
  const src = readFileSync('lib/babylon/modes/DunkMode.ts', 'utf8');
  it('the player\'s rim cut goes through rimCutSpot; the rival cut and every other camera call are as they were', () => {
    expect(src).toMatch(/const c = rimCutSpot\(rim, camAspect\(ctx\)\); ctx\.camDirector\.setFixed\(new Vector3\(c\.at\.x, c\.at\.y, c\.at\.z\), c\.aimH, true\);/);
    expect(src.match(/setFixed\(new Vector3\(rim\.x \+ 2\.9, 1\.15, rim\.z \+ 1\.9\), 1\.5, true\)/g)?.length).toBe(1);   // the rival's
  });
  it('the per-frame step runs only with the knob on, and the overlay is dropped when it goes off', () => {
    expect(src).toMatch(/if \(dunkFramingOn\(\)\) camFramingStep\(ctx\);/);
    expect(src).toMatch(/else if \(camTuneKey\) \{ camTuneKey = ''; ctx\.camDirector\.tuneFollow\(null\); \}/);
  });
});
