// JUMP-PRO: a slow-motion file's jump (lib/jump/slowmo.ts). Gravity is the clock: the real file and the one the share
// sheet stretched to 30 fps must read the same jump.
import { describe, expect, it } from 'vitest';
import { analyseSlowMo } from '@/lib/jump/slowmo';
import { buildTake, filmTake } from '@/lib/jump/ballistic';
import { verifyJump } from '@/lib/jump/session';
import type { PoseFrame } from '@/lib/pose/landmarks';

// a real session: three jumps near one height (a spread like the bench's 25/40/55 flags the 55 as an outlier)
const take = buildTake([0.38, 0.4, 0.42].map((h) => ({ trial: { heightM: h } })), { leadS: 2.2 });
const stretch = (frames: PoseFrame[], k: number) => frames.map((f) => ({ ...f, t: f.t * k }));

describe('a slow-mo file', () => {
  it('the real 240 fps file: read at 240, the jumps within 1 cm of the force-plate height on average, verified', () => {
    const { frames, truth } = filmTake(take, { fps: 240, seed: 5 });
    const r = analyseSlowMo(frames, 4 / 3);
    if (!r.ok) throw new Error(r.why);
    expect(r.stretch).toBe(1);
    expect(r.fps).toBeGreaterThan(220);
    const valid = r.t5.jumps.filter((j) => j.valid);
    expect(valid).toHaveLength(3);
    // each within 3 of its own SDs; together within 1 cm
    valid.forEach((j, k) => expect(Math.abs(j.heightCm - truth[k].heightV0Cm)).toBeLessThan(3 * j.heightSdCm! + 0.2));
    expect(Math.abs(valid.reduce((a, j, k) => a + j.heightCm - truth[k].heightV0Cm, 0) / 3)).toBeLessThan(1);
    const best = valid.find((j) => j.index === r.t5.bestJump)!;
    expect(verifyJump(best, { poseHz: r.fps, source: 'slowmo' }).verified).toBe(true);
  });
  it('the same capture stretched 8× to play at 30 fps reads the same jumps (the clock comes from the fall)', () => {
    const { frames, truth } = filmTake(take, { fps: 240, seed: 6 });
    const r = analyseSlowMo(stretch(frames, 8), 4 / 3);
    if (!r.ok) throw new Error(r.why);
    expect(r.stretch).toBe(8);
    expect(r.fps).toBeGreaterThan(220);
    r.t5.jumps.filter((j) => j.valid).forEach((j, k) => expect(Math.abs(j.heightCm - truth[k].heightV0Cm)).toBeLessThan(1.5));
  });
  it('a 120 fps capture stretched 4×', () => {
    const { frames } = filmTake(take, { fps: 120, seed: 7 });
    const r = analyseSlowMo(stretch(frames, 4), 4 / 3);
    expect(r.ok && r.stretch).toBe(4);
  });
  it('no body, or no jump: refused with the reason, never guessed', () => {
    expect(analyseSlowMo([], 4 / 3)).toMatchObject({ ok: false });
    const still = buildTake([{ rest: 2 }], { leadS: 2 });
    const r = analyseSlowMo(filmTake(still, { fps: 240, seed: 1 }).frames, 4 / 3);
    expect(r).toMatchObject({ ok: false, why: expect.stringMatching(/No jump/) });
  });
});
