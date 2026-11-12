// JUMP-PRO 2 item 1: the max approach vertical, the standing reach and the touch height, on the ground-truth bench
// (lib/jump/approachBench.ts, reachBench.ts). The full matrix is `npx tsx scripts/jump-accuracy.ts --approach` and
// `--reach` (docs/JUMP-PRO.md §9); this pins a cut of it so a change that reads worse is seen.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { PoseFixture } from '@/lib/pose/synth';
import { approachConditions, approachReader, runApproach, approachTakes } from '@/lib/jump/approachBench';
import { framesReader, t5Reader } from '@/lib/jump/readers';
import { readApproach } from '@/lib/jump/approach';
import { reachConditions, runReach, runTouch, touchConditions } from '@/lib/jump/reachBench';
import { feetInches, touchHeight } from '@/lib/jump/reach';
import { analyseSideClip } from '@/lib/jump/sideView';
import { buildApproach, APPROACH_CAMERA } from '@/lib/jump/approachTake';
import { filmTake } from '@/lib/jump/ballistic';

const cond = (fps: number, name: string, seeds = 2) => approachConditions(seeds).find((c) => c.fps === fps && c.name.startsWith(name))!;

describe('the approach vertical (lib/jump/approach.ts)', () => {
  it('before: the jump check refuses an arm-swing run-up, and its frame edges read it 5–9 cm high', () => {
    const t5 = runApproach(cond(60, 'one-foot, 4'), t5Reader);
    expect(t5.read).toBe(0);
    const fr = runApproach(cond(60, 'one-foot, 4'), framesReader);
    expect(fr.biasV0).toBeGreaterThan(4);
  });
  for (const fps of [30, 60]) {
    it(`one-foot, 4 m/s, arm swing at ${fps} fps: every jump read, |bias| ≤ 1.5 cm, SD ≤ 4 cm, no false jump`, () => {
      const r = runApproach(cond(fps, 'one-foot, 4'), approachReader);
      expect(r.missed).toBe(0);
      expect(r.falseValid).toBe(0);
      expect(Math.abs(r.biasV0)).toBeLessThanOrEqual(1.5);
      expect(r.sdV0).toBeLessThanOrEqual(4);
    });
  }
  it('a two-foot step-close at 240 fps (slow-mo): |bias| ≤ 1 cm, SD ≤ 1.5 cm', () => {
    const r = runApproach(cond(240, 'two-foot', 1), approachReader);
    expect(r.missed).toBe(0);
    expect(Math.abs(r.biasV0)).toBeLessThanOrEqual(1);
    expect(r.sdV0).toBeLessThanOrEqual(1.5);
  });
  it('a run angled 12° toward the lens: the scale change is read from the legs (before the fix: +4.3 cm)', () => {
    const r = runApproach(cond(60, 'run angled 12° toward'), approachReader);
    expect(Math.abs(r.biasV0)).toBeLessThanOrEqual(2.5);
  });
  it('finds the take-off foot: the right for a one-foot plant, both for a step-close', () => {
    const one = approachTakes(cond(60, 'one-foot, 4', 1))[1];
    expect(readApproach(one.frames, { aspect: 4 / 3, poseHz: 60 }).jumps.find((j) => j.valid)?.takeoffFoot).toBe('right');
    const two = approachTakes(cond(60, 'two-foot', 1))[1];
    expect(readApproach(two.frames, { aspect: 4 / 3, poseHz: 60 }).jumps.find((j) => j.valid)?.takeoffFoot).toBe('both');
  });
  it('the recorded run-up (CMU): the take-off within 40 ms of the truth (the finder 110 ms early, the refiner 46)', () => {
    const fx = JSON.parse(readFileSync('lib/pose/__fixtures__/jump_one_foot_runup.json', 'utf8')) as PoseFixture;
    const j = readApproach(fx.frames, { aspect: 4 / 3 }).jumps.find((x) => x.valid)!;
    expect(Math.abs(j.takeoffT - fx.gt.jumps[0].takeoff.t)).toBeLessThanOrEqual(40);
  });
  it('a 240 fps capture stretched 8× to play at 30 fps reads at 240 (gravity is the clock)', () => {
    const t = buildApproach({ heightM: 0.6, takeoff: 'one' });
    const { frames } = filmTake({ clip: t.clip, truth: t.truth, decoys: 0 }, { fps: 240, seed: 2, distance: APPROACH_CAMERA.distance });
    const r = analyseSideClip(frames.map((f) => ({ ...f, t: f.t * 8 })), 4 / 3, 'approach');
    expect(r.ok && r.stretch).toBe(8);
    if (r.ok && r.kind === 'approach') expect(Math.abs(r.read.bestHeightCm! - t.truth[0].heightV0Cm)).toBeLessThanOrEqual(2);
  });
});

describe('the standing reach and the touch height (lib/jump/reach.ts)', () => {
  const rc = (fps: number, name: string) => reachConditions(4).find((c) => c.fps === fps && c.name.startsWith(name))!;
  it('arm straight up at 3 m, 60 fps: within 1.5 cm, SD ≤ 0.6 cm', () => {
    const r = runReach(rc(60, 'arm straight up, 3'));
    expect(r.refused).toBe(0);
    expect(Math.abs(r.biasCm)).toBeLessThanOrEqual(1.5);
    expect(r.sdCm).toBeLessThanOrEqual(0.6);
  });
  it('an arm flicked up with no hold is refused, with what to do', () => {
    const r = runReach(rc(60, 'arm flicked'));
    expect(r.n).toBe(0);
    expect(Object.keys(r.why).join(' ')).toMatch(/hold it/);
  });
  it('touch = reach × the jump\'s own leg in metres + the vertical: the leg ruler within 1 %, the touch within 3 cm at 60 fps', () => {
    const t = runTouch(touchConditions(2).find((c) => c.fps === 60 && c.name.startsWith('one-foot, 4'))!);
    expect(t.n).toBeGreaterThanOrEqual(5);
    expect(Math.abs(t.legBiasPct)).toBeLessThanOrEqual(1);
    expect(t.legSdPct).toBeLessThanOrEqual(1);
    expect(Math.abs(t.touchBiasCm)).toBeLessThanOrEqual(3);
  });
  it('touchHeight adds the fingertip and widens the ± by the reach; no leg ruler, no touch', () => {
    const t = touchHeight({ heightCm: 60, plusMinusCm: 4, legPathM: 0.87, legPathSdShare: 0.008 }, { reachOverLeg: 2.36, reachOverLegSd: 0.003 })!;
    expect(t.touchCm).toBeCloseTo(t.reachCm + 60, 1);
    expect(t.reachCm).toBeGreaterThan(2.36 * 87);
    expect(t.plusMinusCm).toBeGreaterThan(4);
    expect(touchHeight({ heightCm: 60, plusMinusCm: 4, legPathM: null, legPathSdShare: null }, { reachOverLeg: 2.36, reachOverLegSd: 0.003 })).toBeNull();
  });
  it('feet and inches to the half inch', () => {
    expect(feetInches(290)).toBe('9 ft 6 in');
    expect(feetInches(304.8)).toBe('10 ft 0 in');
    expect(feetInches(2.54 * 114.5)).toBe('9 ft 6½ in');
  });
});
