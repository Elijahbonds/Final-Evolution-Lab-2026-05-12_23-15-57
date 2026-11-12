// JUMP-PRO: a trial's quality, the session's numbers, the verified rule and the real-change gate (lib/jump/session.ts).
import { describe, expect, it } from 'vitest';
import { defaultTypicalErrorCm, realChange, sessionStats, trialQuality, verifyJump, type TrialQuality } from '@/lib/jump/session';
import { JUMP, JUMP_IDS, jr } from '@/lib/jump/PROPOSED-jump';
import type { RefinedFlight } from '@/lib/jump/refine';
import { gradeT5 } from '@/lib/assess/graders/t5-cmj';
import { buildTake, filmTake } from '@/lib/jump/ballistic';
import { calibrateTake, STD_TRIALS } from '@/lib/jump/bench';

const rf = (o: Partial<RefinedFlight> = {}): RefinedFlight => ({
  takeoffT: 0, landT: 570, apexT: 285, flightMs: 570, heightFlightCm: 40, heightTovCm: 40, landDropCm: -0.5, landDropSdCm: 1.5,
  dropWeight: 0, depthRatio: 1, dropSkipped: null, heightFlightSdCm: 0.8, heightTovSdCm: 0.8, riseFall: 1, ruler: 2.6, frames: 30, rmsCm: 0.5,
  shiftMs: { takeoff: 0, land: 0 }, ...o,
});
const q = (o: Partial<RefinedFlight> | null, hz = 60, valid = true) => trialQuality({ refined: o === null ? null : rf(o), poseHz: hz, valid });

describe('the register', () => {
  it('every entry is TUNE and unsigned until the pilot data', () => {
    for (const id of JUMP_IDS) expect(JUMP[id]).toMatchObject({ tune: true, signedOff: false });
  });
  it('the verified frame rate IS the screen\'s jump gate (read, not copied)', () => {
    expect(jr('jump.verifiedFps')).toBe(50);
  });
});

describe('a trial\'s quality', () => {
  it('a clean 60 fps read is clean, but an estimate under 120 fps', () => {
    expect(q({})).toEqual({ flags: ['frameRate'], clean: true });
    expect(q({}, 240)).toEqual({ flags: [], clean: true });
  });
  it('a landing 10 cm low (and well past its own noise) is flagged; inside its noise it is not', () => {
    expect(q({ landDropCm: -10, landDropSdCm: 1.5 }).flags[0]).toBe('landedLow');
    expect(q({ landDropCm: -6, landDropSdCm: 4 }).flags).not.toContain('landedLow');
  });
  it('a wide read, a move toward the lens and the finder\'s frames are each said', () => {
    expect(q({ heightTovSdCm: 3.5 }).flags).toContain('feetUnclear');
    expect(q({ dropSkipped: 'moved' }).flags).toContain('moved');
    expect(q(null).flags).toContain('framesOnly');
    expect(q(null).clean).toBe(false);
  });
});

describe('the session', () => {
  const t = (index: number, heightCm: number, quality?: TrialQuality) => ({ index, heightCm, heightSdCm: 1, quality });
  it('best, mean ± SD, CV, and a typical error never under the body\'s own 3 %', () => {
    const s = sessionStats([t(1, 40), t(2, 42), t(3, 41)]);
    expect(s).toMatchObject({ n: 3, bestCm: 42, bestIndex: 2, meanCm: 41, sdCm: 1, cvPct: 2.4, measurementSdCm: 1 });
    expect(s.typicalErrorCm).toBeCloseTo(1.2, 1);                  // 3 % of 41
    expect(s.realChangeCm).toBeCloseTo(1.645 * Math.SQRT2 * 1.23, 0);
  });
  it('a jump far above the others is flagged and never the verified best', () => {
    const qs: TrialQuality = { flags: ['frameRate'], clean: true };
    const s = sessionStats([t(1, 40), t(2, 55, qs), t(3, 41)]);
    expect(s.outliers).toEqual([2]);
    expect(s.bestCm).toBe(55);
    expect(s.bestCleanCm).toBe(41);
    expect(qs).toEqual({ flags: ['outlier', 'frameRate'], clean: false });
  });
  it('one jump: no spread, the measurement and the body set the typical error', () => {
    const s = sessionStats([t(1, 40)]);
    expect(s.sdCm).toBeNull();
    expect(s.typicalErrorCm).toBe(1.2);
  });
});

describe('a real change', () => {
  it('"better" only past both sessions\' noise', () => {
    expect(realChange({ cm: 42, teCm: 1.5 }, { cm: 40, teCm: 1.5 }).kind).toBe('same');   // band 3.5 cm
    expect(realChange({ cm: 45, teCm: 1.5 }, { cm: 40, teCm: 1.5 })).toMatchObject({ kind: 'up', deltaCm: 5 });
    expect(realChange({ cm: 35, teCm: 1.5 }, { cm: 40, teCm: 1.5 }).kind).toBe('down');
  });
  it('a saved best with nothing else known carries the bench\'s error at its frame rate, never under 3 %', () => {
    expect(defaultTypicalErrorCm(40, 30)).toBe(1.5);
    expect(defaultTypicalErrorCm(40, 240)).toBe(1.2);
  });
});

describe('verified (owner rule 2026-10-24)', () => {
  const ok = { index: 1, heightCm: 40, heightSdCm: 0.9, valid: true, method: 'refined' as const, quality: { flags: ['frameRate'] as TrialQuality['flags'], clean: true } };
  it('a clean, re-timed, tight live read at 60 fps is verified; at 30 fps it is not', () => {
    expect(verifyJump(ok, { poseHz: 60, source: 'live' })).toEqual({ verified: true, source: 'live', blocks: [] });
    expect(verifyJump(ok, { poseHz: 30, source: 'live' }).blocks).toEqual(['frameRate']);
  });
  it('each rule blocks it on its own', () => {
    const v = (o: object, ctx = {}) => verifyJump({ ...ok, ...o }, { poseHz: 60, source: 'live', ...ctx }).blocks;
    expect(v({ valid: false })).toContain('notValid');
    expect(v({ method: 'frames' })).toContain('framesOnly');
    expect(v({ quality: { flags: ['landedLow'], clean: false } })).toContain('landing');
    expect(v({ heightSdCm: 2 })).toContain('unclear');   // over jump.verifiedSdCm (1.75)
    expect(v({ quality: { flags: ['moved'], clean: false } })).toContain('moved');
    expect(v({ quality: { flags: ['outlier'], clean: false } })).toContain('outlier');
  });
  it('the trust hook: PR #424\'s Low blocks it; its Medium does not', () => {
    expect(verifyJump(ok, { poseHz: 60, source: 'live', trust: 'low' }).blocks).toEqual(['trustLow']);
    expect(verifyJump(ok, { poseHz: 60, source: 'live', trust: 'medium' }).verified).toBe(true);
  });
  it('a slow-mo file needs 120 fps or more', () => {
    expect(verifyJump(ok, { poseHz: 240, source: 'slowmo' }).verified).toBe(true);
    expect(verifyJump(ok, { poseHz: 60, source: 'slowmo' }).blocks).toEqual(['frameRate']);
  });
});

describe('T5 carries it all, in memory only', () => {
  it('each jump is re-timed, has its own ±, quality flags, and the session is summed up', () => {
    const take = buildTake(STD_TRIALS({ landKnee: 0.2 }).map((x) => ({ trial: x })), { leadS: 3.2 });
    const { frames, truth } = filmTake(take, { fps: 60, seed: 3 });
    const cal = calibrateTake(frames)!;
    const r = gradeT5(frames, { calibration: cal, aspect: cal.aspect });
    expect(r.t5.jumps).toHaveLength(3);
    r.t5.jumps.forEach((j, k) => {
      expect(j.method).toBe('refined');
      expect(j.heightSdCm!).toBeGreaterThan(0);
      expect(j.landDropCm!).toBeLessThan(-5);
      expect(j.quality!.flags).toContain('landedLow');
      expect(Math.abs(j.heightCm - truth[k].heightV0Cm)).toBeLessThan(3.5);
      expect(j.heightFlightCm! - j.heightCm).toBeGreaterThan(2);   // the extra fall, taken out
    });
    expect(r.t5.session).toMatchObject({ n: 3, bestIndex: 3 });
    expect(r.t5.session!.bestCleanCm).toBeNull();                  // every landing was flexed: nothing verifiable
    // the ± shown is never narrower than one frame's worth
    expect(r.t5.heightPlusMinusCm!).toBeGreaterThanOrEqual((9.81 * (r.t5.bestFlightMs! / 1000) * (1 / 60)) / 4 * 100 - 0.05);
  });
});

describe('rebounds', () => {
  it('contact, RSI and RSI-flight between jumps under 400 ms apart; the 10/5 best-five mean', async () => {
    const { reboundStats } = await import('@/lib/jump/rebound');
    const j = (index: number, takeoffT: number, landT: number, heightCm: number) => ({ index, valid: true, takeoffT, landT, heightCm, flightMs: landT - takeoffT });
    const r = reboundStats([j(1, 0, 500, 30), j(2, 700, 1190, 29.5), j(3, 3000, 3500, 30)]);
    expect(r.rebounds).toEqual([{ from: 1, to: 2, contactMs: 200, rsi: 1.48, rsiFlight: 2.45 }]);
    expect(r).toMatchObject({ bestRsi: 1.48, bestContactMs: 200, best5Rsi: null });
  });
});

describe('the seam for later lanes (lib/jump/seam.ts)', () => {
  it('a verified CMJ record from a clean 60 fps read; never a power field', async () => {
    const { jumpRecords } = await import('@/lib/jump/seam');
    const take = buildTake([0.42, 0.44, 0.43].map((h) => ({ trial: { heightM: h } })), { leadS: 3.2 });
    const { frames } = filmTake(take, { fps: 60, seed: 4 });
    const cal = calibrateTake(frames)!;
    const recs = jumpRecords(gradeT5(frames, { calibration: cal, aspect: cal.aspect }).t5, { source: 'live' });
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({ type: 'cmj', source: 'live', fps: expect.any(Number), rsi: null });
    expect(recs[0].heightCm).toBeGreaterThan(40);
    expect(Object.keys(recs[0])).not.toContain('power');
    expect(jumpRecords(gradeT5(frames, { calibration: cal, aspect: cal.aspect }).t5, { source: 'live', trust: 'low' })[0]).toMatchObject({ verified: false, blocks: expect.arrayContaining(['trustLow']) });
  });
  it('rebounds add a repeated-jump record with its RSI', async () => {
    const { jumpRecords } = await import('@/lib/jump/seam');
    const take = buildTake(Array.from({ length: 4 }, (_, i) => ({ trial: { heightM: 0.3, ...(i < 3 ? { reboundMs: 200 } : {}) } })), { leadS: 3.2 });
    const { frames } = filmTake(take, { fps: 120, seed: 2 });
    const cal = calibrateTake(frames)!;
    const recs = jumpRecords(gradeT5(frames, { calibration: cal, aspect: cal.aspect }).t5, { source: 'live' });
    expect(recs.map((r) => r.type)).toEqual(['cmj', 'repeated']);
    expect(recs[1].rsi!).toBeGreaterThan(1.2);
    expect(recs[1].rsi!).toBeLessThan(1.8);                       // 0.30 m / 0.20 s = 1.5
  });
});
