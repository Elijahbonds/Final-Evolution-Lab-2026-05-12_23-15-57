import { describe, expect, it, vi } from 'vitest';
import { powerFromJumpCm } from '@/lib/move/formSummary';
import { readFixture } from '@/lib/mirror/fixtures/load';
import { toPoseFrames } from '@/lib/mirror/fixtures';
import { concat, cmj, kneeWall, ohsSide, singleLegSquat, syntheticCalibration, type Capture } from './replay';
import { gradeT1 } from './graders/t1-overhead-squat';
import { gradeT2 } from './graders/t2-dorsiflexion';
import { gradeT3 } from './graders/t3-single-leg-squat';
import { gradeT5 } from './graders/t5-cmj';
import { mqs, type TestResult } from './scoring';
import { bandOf } from './thresholds';
import { bandScore } from './scoring';
import {
  ASSESSMENT_ENDPOINT, MAX_RECORD_BYTES, mediaIn, postAssessment, prqWritesFor, toRecord, validateRecord, type AssessmentRecord, type FetchLike,
} from './prqWrite';

const cal = syntheticCalibration();
const ctx = { calibration: cal, aspect: 4 / 3 };
const fx = (name: string): Capture => ({ frames: toPoseFrames(readFixture(name)), aspect: 4 / 3, fps: 30 });
const T1 = gradeT1({ front: concat([fx('squat_knee_in_left'), fx('squat_knee_in_left'), fx('squat_knee_in_left')]).frames, side: ohsSide().frames }, ctx);
const T2 = gradeT2({ left: kneeWall('left', { tibiaMax: 44 }).frames, right: kneeWall('right', { tibiaMax: 33 }).frames }, ctx);
const T3 = gradeT3({ left: singleLegSquat('left', { kneeIn: 0.06 }).frames, right: singleLegSquat('right').frames }, ctx);
const T5 = gradeT5(cmj([{ heightM: 0.4 }, { heightM: 0.45 }, { heightM: 0.42 }]).frames, ctx);
const TESTS: TestResult[] = [T1, T2, T3, T5];
const device = { class: 'desktop' as const, model: 'full' as const, poseHz: 30, cameraFps: 30, width: 1280, height: 720 };
const record = (tests: TestResult[] = TESTS): AssessmentRecord => toRecord({
  assessmentId: 'assess-0001-abcd', mode: 'quick', measuredAt: new Date('2026-09-28T18:00:00Z'), device, takeoffLeg: 'left', tests, mqs: mqs(tests, 'quick'),
});

describe('the record is numbers', () => {
  it('carries the spec §9 shape and validates round trip', () => {
    const rec = record();
    expect(rec).toMatchObject({ version: 1, protocolVersion: 'jump-screen-1.0', thresholdsVersion: 'jump-screen-0.1-provisional', mode: 'quick', takeoffLeg: 'left' });
    expect(rec.tests.map((t) => t.id)).toEqual(['T1', 'T2', 'T3', 'T5']);
    expect(rec.tests[0].sides.both!.faults).toEqual(['valgusLeft']);
    expect(rec.mqs).toMatchObject({ label: 'Quick' });
    const v = validateRecord(JSON.parse(JSON.stringify(rec)));
    expect(v.ok && v.value).toEqual(rec);
  });

  it('NO SKELETON LEAVES THE PAGE: the graded tests hold worst-rep frames, the record holds none of them', () => {
    expect(TESTS.some((t) => t.frozen.length > 0)).toBe(true);
    const json = JSON.stringify(record());
    expect(json.length).toBeLessThan(MAX_RECORD_BYTES);
    expect(json).not.toMatch(/"(x|y|z|v|image|frozen|landmarks?|world)"\s*:/);
    expect(mediaIn(record())).toBeNull();
  });

  it('mediaIn finds anything media-shaped, however deep', () => {
    expect(mediaIn({ image: 'x' })).toBe('$.image');
    expect(mediaIn({ tests: [{ sides: { both: { frames: [] } } }] })).toBe('$.tests[0].sides.both.frames');
    expect(mediaIn({ a: 'data:image/png;base64,AAAA' })).toBe('$.a');
    expect(mediaIn({ a: 'x'.repeat(65) })).toBe('$.a');
    expect(mediaIn({ video: null })).toBe('$.video');
    expect(mediaIn({ blob: {} })).toBe('$.blob');
    expect(mediaIn({ lm: [[0.1, 0.2]] })).toBe('$.lm');
  });

  it('validateRecord refuses anything it does not know, and numbers out of range', () => {
    const good = () => JSON.parse(JSON.stringify(record()));
    const bad = (mut: (r: any) => void) => { const r = good(); mut(r); return validateRecord(r); };
    expect(bad((r) => { r.extra = 1; })).toMatchObject({ ok: false, error: '$.extra: unexpected field' });
    expect(bad((r) => { r.tests[0].sides.both.notes = 'hi'; }).ok).toBe(false);
    expect(bad((r) => { r.tests[0].score100 = 140; }).ok).toBe(false);
    expect(bad((r) => { r.thresholdsVersion = 'jump-screen-0.0'; })).toMatchObject({ ok: false, error: '$.version: out of date' });
    expect(bad((r) => { r.tests[0].confidence = 0.4; })).toMatchObject({ ok: false });
    expect(bad((r) => { r.tests[3].t5.jumps[0].heightCm = 180; })).toMatchObject({ ok: false });
    expect(bad((r) => { r.tests[3].t5.bestHeightCm = 131; }).ok).toBe(false);
    expect(bad((r) => { r.tests.push(r.tests[0]); })).toMatchObject({ ok: false, error: '$.tests: repeated test' });
    expect(bad((r) => { r.assessmentId = 'x'; }).ok).toBe(false);
    expect(validateRecord('nope').ok).toBe(false);
  });
});

describe('PRQ writes (spec §5.2), recomputed from the record', () => {
  it('power is the best valid CMJ through the verticalJump map', () => {
    const w = prqWritesFor(record()).find((x) => x.axis === 'power')!;
    expect(w.value).toBe(powerFromJumpCm(T5.t5!.bestHeightCm!));
    expect(w.unit).toBe('score');
    expect(w.reason).toMatch(/^CMJ \d+\.\d in \(estimated from a 0\.\d\d s flight, 30 fps, ±\d(\.\d)? in\)$/);
  });

  it('flexibility = 0.625 × the worse ankle\'s axis + 0.375 × T1 mobility, by hand', () => {
    const w = prqWritesFor(record()).find((x) => x.axis === 'flexibility')!;
    const worse = T2.sides.right!.metrics[0].value!;                    // 33°
    const t2axis = Math.max(0, Math.min(100, Math.round(((worse - 30) / 15) * 100)));
    const m = T1.sides.both!.metrics;
    const s = (id: string, th: 't1.depthKneeFlex' | 't1.shoulderFlex' | 't1.trunkTibia') => bandScore(m.find((x) => x.id === id)!.value!, bandOf(th));
    const mob = (s('depthKneeFlex', 't1.depthKneeFlex') + s('shoulderFlex', 't1.shoulderFlex') + s('trunkTibia', 't1.trunkTibia')) / 3;
    expect(w.value).toBe(Math.round(0.625 * t2axis + 0.375 * mob));
    expect(w.reason).toMatch(/ankle 33° with the heel down \(worse side, right\), overhead-squat mobility \d+\/100/);
  });

  it('without T1 the ankle axis stands alone; without three valid rocks a side, flexibility writes nothing', () => {
    const noT1 = prqWritesFor(record([T2, T3, T5])).find((x) => x.axis === 'flexibility')!;
    expect(noT1.value).toBe(Math.round(((33 - 30) / 15) * 100));
    const shortT2 = gradeT2({ left: kneeWall('left', {}, { reps: 2 }).frames, right: kneeWall('right').frames }, ctx);
    expect(prqWritesFor(record([T1, shortT2, T3, T5])).map((x) => x.axis)).toEqual(['power']);
  });

  it('AN AXIS THAT DID NOT SCORE WRITES NOTHING — never a default 50', () => {
    const unscored = (t: TestResult): TestResult => ({ ...t, status: 'notScored', confidence: 0.3, sides: {}, score100: null, score03: null });
    expect(prqWritesFor(record([T1, unscored(T2), T3, unscored(T5)]))).toEqual([]);
    for (const w of prqWritesFor(record())) expect(['power', 'flexibility']).toContain(w.axis);
  });

  it('a pain stop writes nothing at all', () => {
    const pain: TestResult = { ...T3, status: 'painStop', score03: 0 };
    expect(prqWritesFor(record([T1, T2, pain, T5]))).toEqual([]);
  });

  it('MQS is never an axis', () => {
    expect(prqWritesFor(record()).map((w) => w.axis)).not.toContain('mqs');
  });
});

describe('the API client', () => {
  it('sends the record, as JSON, to its own route, and nothing else', async () => {
    const fetchImpl = vi.fn<Parameters<FetchLike>, ReturnType<FetchLike>>(async () => ({ ok: true, status: 200, json: async () => ({ saved: true }) }));
    const rec = record();
    const res = await postAssessment(rec, fetchImpl);
    expect(res).toEqual({ status: 200, body: { saved: true } });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(ASSESSMENT_ENDPOINT);
    expect(init).toMatchObject({ method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin' });
    expect(JSON.parse(init.body)).toEqual(rec);
    expect(mediaIn(JSON.parse(init.body))).toBeNull();
  });

  it('refuses to send a media-shaped field, before any request', async () => {
    const fetchImpl = vi.fn();
    const smuggled = { ...record(), tests: [{ ...record().tests[0], image: 'data:image/png;base64,AAAA' }] } as unknown as AssessmentRecord;
    await expect(postAssessment(smuggled, fetchImpl as unknown as FetchLike)).rejects.toThrow(/media-shaped/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
