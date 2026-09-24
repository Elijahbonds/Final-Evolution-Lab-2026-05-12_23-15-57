// THE BASELINE, pinned (movement play, phase 1, 2026-09-24). These are KNOWN-BAD facts about TODAY's body mapper
// (lib/input/poseControl.ts) replayed on the synthetic streams — the two misfires that matter most, confirmed in numbers
// by scripts/body/baseline.mts (report: ~/Claude/outbox/finish-release/movementplay/p1-baseline/BASELINE.md).
//
// They pass today BECAUSE the mapper is wrong. Phase 3 (per-mode body profiles) is expected to break both: when it
// does, flip each `it` to the fixed behaviour written in its comment rather than deleting it.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { replay, dunkRead, restStick, stickYStats, slamWindow, uprightFrame, type ReplayOptions } from './baseline';
import type { PoseFixture } from './synth';

const load = (name: string) => JSON.parse(readFileSync(join(__dirname, '__fixtures__', `${name}.json`), 'utf8')) as PoseFixture;
const still = load('stand_still');
/** The owner's own stand (same body, same camera): his takes that never stand still calibrate on it, as the report does. */
const ownerStand: ReplayOptions = { calibration: 'stand', stand: still.frames[uprightFrame(still)] };

describe('BASELINE — today\'s poseControl on the streams (KNOWN-BAD: phase 3 flips these)', () => {
  it('KNOWN-BAD: every body dunk launches on the rise out of the dip and commits the jump itself as the slam, refused TOO EARLY', () => {
    // Phase 3: the launch waits for the real take-off, the slam is the arm's strike against the apex, and these are made.
    const w = slamWindow(0);
    const takes: [string, ReplayOptions][] = [
      ['jump_two_foot_high', { calibration: 'stand' }],   // their own upright stand
      ['jump_one_foot_runup', { calibration: 'stand' }],
      ['jumpshot', { calibration: 'stand' }],
      ['dunk_elijah_two_foot', ownerStand],                // the run-up never stands still
    ];
    for (const [name, opt] of takes) {
      const fx = load(name);
      const d = dunkRead(replay(fx, opt).events);
      const jump = fx.gt.jumps.find((j) => j.landing.t + 100 > d.launch!) ?? fx.gt.jumps[0];
      const oneFrame = 1000 / fx.settings.synth.fps;
      // R2 (the squat) back to 0 is the launch — from a frame captured no later than the take-off frame: the feet are down
      expect(d.launchBy, name).toBe('R2 released');
      expect(d.launchT, name).toBeLessThanOrEqual(jump.takeoff.t + oneFrame);
      // the first A of the flight is the hip rise of the jump itself, within 200 ms of the take-off …
      expect(Math.abs(d.slam!.at - jump.takeoff.t), name).toBeLessThan(200);
      // … which lands on the flight clock long before even the buffer that holds a press for the window
      expect(d.slam!.clip, name).toBeLessThan(w.openAt - w.holdSec);
      expect(d.verdict, name).toBe('too early');
      expect(d.tooEarlyMs!, name).toBeGreaterThan(500);
      expect(d.made, name).toBe(false);
      expect(d.missWhy, name).toBe('THREW IT AT THE IRON TOO EARLY');
    }
  });

  it('KNOWN-BAD: standing still reads as the L stick held full back (y = +1), and forward (y < 0) is unreachable', () => {
    // Phase 3: the resting stick is (0, 0), and a real forward lean or a run in place can push y below 0.
    // (the mapper writes a centred x as −0: `-Math.sign(0) * 0`)
    const atRest = (r: ReturnType<typeof replay>) => { const s = restStick(r)!; return { x: Math.abs(s.x), y: s.y }; };
    const rest = replay(still, { calibration: 'stand' });
    expect(atRest(rest)).toEqual({ x: 0, y: 1 });
    expect(stickYStats(rest).shareAtLevel).toBe(1);              // the whole take, standing, at full back stick
    for (const name of ['run_in_place', 'shuffle_lateral', 'jump_two_foot_high']) {
      const r = replay(load(name), { calibration: 'stand' });
      expect(atRest(r), name).toEqual({ x: 0, y: 1 });
      expect(stickYStats(r).min, name).toBeGreaterThanOrEqual(0);   // running, stepping, jumping: never forward
    }
  });
});
