// VERTICAL-EASY (owner, 2026-10-27: "allow arm swing"): the front door's arms-free read (lib/vertical/armsFree.ts).
//   · the flight read never keys on the hands: the same jumps filmed with and without an arm swing read the same heights;
//   · only the hands-on-hips refusal is lifted — every other refusal stands;
//   · the guard the hands rule used to hide: a jump taken away from the stand is refused (vertical.standDrift), the bench's
//     own jumps never come near it, and the owner's travelled take (jump_two_foot_high) no longer reads 62.5 cm for 30.5.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildTake, filmTake } from '@/lib/jump/ballistic';
import { calibrateTake } from '@/lib/jump/bench';
import { calibrateFront } from '@/lib/assess/calibration';
import { gradeT5 } from '@/lib/assess/graders/t5-cmj';
import { th } from '@/lib/assess/thresholds';
import { T5_ARMS_WHY } from '@/lib/jump/protocols';
import { liftArms, MOVED_WHY, standDrift } from '@/lib/vertical/armsFree';
import { rejectionFromInvalidWhy } from '@/lib/assess/rejection';
import type { PoseFrame } from '@/lib/pose/landmarks';

const read = (fps: number, seed: number, arms: boolean) => {
  const take = buildTake([0.25, 0.4, 0.55].map((h) => ({ trial: { heightM: h } })), { leadS: 3.2, ...(arms ? { style: { armSwing: true } } : {}) });
  const { frames, truth } = filmTake(take, { fps, seed });
  const cal = calibrateTake(frames, 4 / 3, 0.3)!;
  return { frames, truth, cal, t5: gradeT5(frames, { calibration: cal, aspect: 4 / 3 }).t5 };
};

describe('arms free', () => {
  it('the same jumps with and without an arm swing read the same heights (nothing in the flight read keys on the hands)', () => {
    let n = 0;
    for (const fps of [30, 60]) for (const seed of [1, 2, 3]) {
      const a = read(fps, seed, true), b = read(fps, seed, false);
      expect(a.t5.jumps.every((j) => !j.valid && j.invalidWhy === T5_ARMS_WHY)).toBe(true);    // the check refuses them all
      const la = liftArms(a.t5, { frames: a.frames, front: a.cal.front });
      expect(la.jumps.map((j) => j.heightCm)).toEqual(b.t5.jumps.map((j) => j.heightCm));
      expect(la.jumps.every((j) => j.valid)).toBe(true);
      n += la.jumps.length;
    }
    expect(n).toBe(18);
  }, 60_000);

  it('only the hands rule is lifted: a hop, a landing out of the shot, an over-limit read stay refused', () => {
    const t5 = read(30, 1, false).t5;
    const other = { ...t5, jumps: t5.jumps.map((j, i) => (i === 0 ? { ...j, valid: false, invalidWhy: 'the camera never saw you land' } : j)) };
    expect(liftArms(other).jumps[0]).toMatchObject({ valid: false, invalidWhy: 'the camera never saw you land' });
  }, 30_000);

  it('a jump away from the stand is refused, in plain words; the bench\'s own jumps never come near the line', () => {
    expect(th('vertical.standDrift')).toBe(0.08);
    let worst = 0;
    for (const fps of [30, 60]) for (const seed of [1, 2, 3, 4]) {
      const { frames, cal, t5 } = read(fps, seed, true);
      for (const j of t5.jumps) worst = Math.max(worst, standDrift(frames, cal.front!, j.takeoffT) ?? 0);
    }
    expect(worst).toBeLessThan(0.03);
    expect(rejectionFromInvalidWhy(MOVED_WHY).text).toBe('You moved from your spot. Go back to where you stood and jump again.');
  }, 60_000);

  it('the owner\'s travelled take (jump_two_foot_high): read from where it ended, the first jump is refused, not 62.5 cm for 30.5', () => {
    const fx = JSON.parse(readFileSync(join(__dirname, '../../lib/pose/__fixtures__/jump_two_foot_high.json'), 'utf8')) as { frames: PoseFrame[]; gt: { jumps: { heightFlightM: number; takeoff: { t: number } }[] } };
    const last = fx.frames[fx.frames.length - 1];
    const c = calibrateFront(Array.from({ length: 60 }, (_, k) => ({ ...last, t: k * 33.3 })), 4 / 3, 1500, 0.3);
    expect(c.ok).toBe(true);
    const front = c.ok ? c.value : null;
    const lifted = liftArms(gradeT5(fx.frames, { calibration: { aspect: 4 / 3, front, side: null }, aspect: 4 / 3 }).t5, { frames: fx.frames, front });
    for (const j of lifted.jumps.filter((x) => x.valid)) {
      const g = fx.gt.jumps.find((x) => Math.abs(x.takeoff.t - j.takeoffT) < 150);
      expect(g, `valid jump at ${j.takeoffT}`).toBeDefined();
      expect(Math.abs(j.heightCm - g!.heightFlightM * 100)).toBeLessThanOrEqual(3);
    }
  });

  it('the owner\'s take, calibrated where it starts (t5-cmj.test.ts\'s own stand): the jump read whole (23.4 cm for 25.4) was taken 40 cm from the stand, so it is refused as moved', () => {
    const fx = JSON.parse(readFileSync(join(__dirname, '../../lib/pose/__fixtures__/jump_two_foot_high.json'), 'utf8')) as { frames: PoseFrame[]; gt: { jumps: { heightFlightM: number; takeoff: { t: number } }[] } };
    const first = fx.gt.jumps[0].takeoff.t;
    const r = calibrateFront(fx.frames.filter((f) => f.t < first - 150), 4 / 3, Math.min(900, first - 250), 0.3);
    expect(r.ok).toBe(true);
    const front = r.ok ? r.value : null;
    const raw = gradeT5(fx.frames, { calibration: { aspect: 4 / 3, front, side: null }, aspect: 4 / 3 }).t5;
    expect(liftArms(raw).bestHeightCm).toBe(23.4);                                  // the read itself, without the guard
    const seen = raw.jumps.find((j) => j.heightCm === 23.4)!;
    expect(standDrift(fx.frames, front!, seen.takeoffT)!).toBeGreaterThan(th('vertical.standDrift'));
    const lifted = liftArms(raw, { frames: fx.frames, front });
    expect(lifted.bestHeightCm).toBeNull();
    expect(lifted.jumps.find((j) => j.takeoffT === seen.takeoffT)).toMatchObject({ valid: false, invalidWhy: MOVED_WHY });
  });
});
