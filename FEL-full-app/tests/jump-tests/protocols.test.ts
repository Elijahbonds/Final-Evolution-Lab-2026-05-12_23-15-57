// JUMP-TESTS: each test's validity rules on the protocol bench (lib/jump/protocolBench.ts: ground-truth takes through
// the app's own camera). Every honest take counts; every take that is not the test is refused with its own reason.
// The heights are not pinned here as an accuracy: they ride on the jump check's reader (tests/jump-pro pins that).
import { describe, expect, it } from 'vitest';
import { protocolTake, stretched } from '@/lib/jump/protocolBench';
import {
  armSwingGain, asymmetry, PROTOCOL_WHY, PROTOCOLS, PROTOCOL_IDS, readProtocolClip, RJ_WHY, sideBest, T5_ARMS_WHY, type ProtocolId,
} from '@/lib/jump/protocols';
import { buildTake, filmTake } from '@/lib/jump/ballistic';
import { calibrateTake } from '@/lib/jump/bench';
import { gradeT5 } from '@/lib/assess/graders/t5-cmj';

const read = (id: ProtocolId, fps: number, kind: 'honest' | 'cheat' = 'honest', seed = 1) => {
  const r = readProtocolClip(protocolTake(id, { fps, seed, kind }).frames, 4 / 3, id);
  if (!r.ok) throw new Error(`${id} ${kind} ${fps}: refused: ${r.why}`);
  return r;
};
const whys = (r: ReturnType<typeof read>) => r.t5.jumps.map((j) => j.invalidWhy ?? null);

describe('the test set', () => {
  it('six tests, each with a setup cue that says how to film it and that the video stays on the phone', () => {
    expect(PROTOCOL_IDS).toHaveLength(6);
    for (const id of PROTOCOL_IDS) {
      expect(PROTOCOLS[id].steps.length).toBeGreaterThanOrEqual(3);
      expect(PROTOCOLS[id].steps.join(' ')).toMatch(/never uploaded/);
    }
  });
  it('T5 still words an arm swing as the arm-swing test expects to lift it', () => {
    const take = buildTake([{ trial: { heightM: 0.45 } }], { leadS: 3.2, style: { armSwing: true } });
    const { frames } = filmTake(take, { fps: 60, seed: 1 });
    const cal = calibrateTake(frames)!;
    expect(gradeT5(frames, { calibration: cal, aspect: cal.aspect }).t5.jumps[0].invalidWhy).toBe(T5_ARMS_WHY);
  });
});

describe.each([30, 60, 240])('at %i fps', (fps) => {
  it('squat jump: held squats count; a dip after the hold is refused as a countermovement', () => {
    expect(whys(read('sj', fps))).toEqual([null, null, null]);
    expect(whys(read('sj', fps, 'cheat'))).toEqual(Array(3).fill(PROTOCOL_WHY.sjDip));
  });
  it('a countermovement jump read as a squat jump is refused (no held squat)', () => {
    const r = read('sj', fps, 'honest');
    expect(r.best).not.toBeNull();
    const cmj = readProtocolClip(protocolTake('cmjHips', { fps, seed: 1 }).frames, 4 / 3, 'sj');
    if (!cmj.ok) throw new Error(cmj.why);
    for (const j of cmj.t5.jumps) expect([PROTOCOL_WHY.sjShallow, PROTOCOL_WHY.sjNoHold, PROTOCOL_WHY.sjDip]).toContain(j.invalidWhy);
  });
  it('hands on hips: counts with hands on hips; an arm swing is refused', () => {
    expect(whys(read('cmjHips', fps))).toEqual([null, null, null]);
    expect(whys(read('cmjHips', fps, 'cheat'))).toEqual(Array(3).fill(PROTOCOL_WHY.handsOff));
  });
  it('arm swing: T5\'s "hands left your hips" is lifted; hands kept on the hips are refused (no swing)', () => {
    expect(whys(read('cmjArms', fps))).toEqual([null, null, null]);
    expect(whys(read('cmjArms', fps, 'cheat'))).toEqual(Array(3).fill(PROTOCOL_WHY.noSwing));
  });
  it('single leg: one foot held up counts, on both sides; a two-foot jump is refused', () => {
    expect(whys(read('singleLeft', fps))).toEqual([null, null, null]);
    expect(whys(read('singleRight', fps))).toEqual([null, null, null]);
    expect(whys(read('singleLeft', fps, 'cheat'))).toEqual(Array(3).fill(PROTOCOL_WHY.otherFoot));
  });
  it('10-5: nine quick rebounds read, the best five\'s RSI is flight ÷ contact (~0.5 s ÷ 0.18 s); slow contacts get no result', () => {
    const r = read('rj105', fps);
    expect(r.rj!.jumps).toBe(10);
    expect(r.rj!.counted).toBe(9);
    // truth: a 30 cm jump flies 0.495 s; 180 ms contacts → 2.75
    expect(r.rj!.best5RsiFlight!).toBeGreaterThan(2.4);
    expect(r.rj!.best5RsiFlight!).toBeLessThan(3.3);
    expect(Math.abs(r.rj!.best5ContactMs! - 180)).toBeLessThan(30);
    const slow = read('rj105', fps, 'cheat');
    expect(slow.rj!.best5RsiFlight).toBeNull();
    expect(slow.rj!.why).toBe(RJ_WHY.slow);
    expect(slow.rj!.rebounds.every((x) => !x.counted)).toBe(true);
  });
});

describe('the video\'s clock', () => {
  it('a 240 fps take exported stretched 8× reads the same squat jumps at the real rate', () => {
    const { frames } = protocolTake('sj', { fps: 240, seed: 2 });
    const r = readProtocolClip(stretched(frames, 8), 4 / 3, 'sj');
    if (!r.ok) throw new Error(r.why);
    expect(r.stretch).toBe(8);
    expect(Math.round(r.fps)).toBeGreaterThan(200);
    expect(r.t5.jumps.filter((j) => j.valid)).toHaveLength(3);
    // the frames handed to the review are on the real clock
    expect(r.frames[r.frames.length - 1].t).toBeCloseTo(frames[frames.length - 1].t, 0);
  });
  it('the best counted jump is the result, verified by the slow-mo rule', () => {
    const r = read('cmjHips', 240);
    expect(r.best!.index).toBe(r.t5.bestJump);
    expect(r.verified!.source).toBe('slowmo');
  });
});

describe('the comparisons say no more than the noise allows', () => {
  it('single-leg asymmetry: inside the band, "no clear difference"; past it, the higher leg and the %', () => {
    const same = asymmetry({ bestCm: 20, teCm: 0.9 }, { bestCm: 19.5, teCm: 0.9 });
    expect(same.higher).toBeNull();
    expect(same.pct).toBe(3);
    expect(same.bandPct).toBeGreaterThan(same.pct);
    const diff = asymmetry({ bestCm: 18, teCm: 0.9 }, { bestCm: 24, teCm: 0.9 });
    expect(diff).toMatchObject({ higher: 'right', pct: 25 });
  });
  it('the arm swing\'s gain over hands on hips, real only past the noise', () => {
    expect(armSwingGain({ bestCm: 47, teCm: 1.4 }, { bestCm: 41, teCm: 1.2 })).toMatchObject({ cm: 6, pct: 15, real: true });
    expect(armSwingGain({ bestCm: 41.5, teCm: 1.4 }, { bestCm: 41, teCm: 1.2 }).real).toBe(false);
  });
  it('the bench\'s single-leg takes: both sides read, and the difference read as no clear difference', () => {
    const L = sideBest(read('singleLeft', 120).t5)!, R = sideBest(read('singleRight', 120).t5)!;
    expect(L.bestCm).toBeGreaterThan(15);
    expect(R.bestCm).toBeGreaterThan(15);
    expect(asymmetry(L, R).bandPct).toBeGreaterThanOrEqual(5);
  });
});
