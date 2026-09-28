// prqWrite — what a finished screen writes: the numbers-only record (spec §9) and the PRQ axes it feeds (spec §5.2).
//
// THE RECORD IS NUMBERS. Scores, measured values, counts, versions, the device's frame rate. Never a frame, an image, a
// landmark or a skeleton: the worst-rep skeletons the results page draws stay in the page's memory (spec §6, §10), and
// toRecord() cannot copy one because it only reads named numeric fields. The server refuses anything media-shaped
// before it looks at anything else (mediaIn), then refuses any field it does not know (validateRecord).
//
// THE PRQ WRITES ARE RECOMPUTED FROM THE RECORD, on the server, with the same functions the results page previews
// them with (prqWritesFor): the client's claim about an axis is never stored.
//
//   power        the best valid CMJ height → lib/move/formSummary powerFromJumpCm (the verticalJump 12→40 in map).
//                Written with one valid jump; no RSI (owner defaults Q4, Q5).
//   flexibility  the Quick Screen has no T4, so the spec's 0.5·T2 + 0.3·T1 is renormalised: 0.625·T2 axis + 0.375·T1
//                mobility, where the T2 axis is the WORSE side's shin angle through ankleDorsiflexionDeg (30°→0,
//                45°→100) and T1 mobility is the mean of T1's depth, arms and trunk–shin scores. Needs T2 scored with
//                three valid rocks a side; T1 joins when it scored with three valid reps a view. [TUNE-EJ] weights.
//   the rest     never written: a movement screen does not measure them. MQS is never an axis (owner default Q1).
//
// An axis that did not score writes NOTHING: it is never defaulted to 50. And a pain stop writes nothing at all.
//
// Pure except postAssessment (fetch, injected).
import { powerFromJumpCm } from '@/lib/move/formSummary';
import { axisValue, measurementFor } from '@/lib/profile/scanToSnapshot';
import { PROTOCOL_VERSION, THRESHOLDS_VERSION, bandOf, th } from './thresholds';
import { bandScore, type Grade, type Mqs, type Score03, type TestResult, type TestStatus } from './scoring';
import type { AssessMode, Side, TestId } from './protocol';
import { inches } from './why';

export const ASSESSMENT_KIND = 'mirror_assessment';
export const RECORD_VERSION = 1 as const;
/** The largest record the route accepts (bytes). A full record is ~6 kB; nothing a camera frame fits in. */
export const MAX_RECORD_BYTES = 32 * 1024;
export const ANKLE_DF_KEY = 'ankleDorsiflexionDeg';
export const ASSESSMENT_ENDPOINT = '/api/mirror/assessment';

// ── the record ──

export interface RecordSide {
  score100: number | null;
  score03: Score03;
  repsValid: number;
  repsTotal: number;
  complete: boolean;
  /** metric id → measured value (null = not read). */
  metrics: Record<string, number | null>;
  /** Metric ids in fault. */
  faults: string[];
}

export interface RecordTest {
  id: TestId;
  status: TestStatus;
  confidence: number;
  score100: number | null;
  score03: Score03 | null;
  sides: Partial<Record<'both' | Side, RecordSide>>;
  asymmetry: { flagged: boolean; pointsDiff: number | null; weaker: Side | null; metricValue: number | null } | null;
  t5?: {
    bestHeightCm: number | null; bestFlightMs: number | null; bestJump: number | null; poseFps: number; cameraFps: number | null;
    fpsLow: boolean; heightPlusMinusCm: number | null; cvPct: number | null;
    jumps: { index: number; valid: boolean; flightMs: number; heightCm: number }[];
  };
}

export interface RecordDevice {
  class: 'desktop' | 'mobile';
  model: 'lite' | 'full' | null;
  /** Pose frames per second delivered over the session. */
  poseHz: number;
  cameraFps: number | null;
  width: number;
  height: number;
}

export interface AssessmentRecord {
  assessmentId: string;
  version: typeof RECORD_VERSION;
  protocolVersion: string;
  thresholdsVersion: string;
  mode: AssessMode;
  measuredAt: string;
  device: RecordDevice;
  takeoffLeg: Side | null;
  tests: RecordTest[];
  mqs: Pick<Mqs, 'value' | 'band' | 'label' | 'fmsTotal' | 'fmsMax' | 'asymmetryFlags'> | null;
}

const r = (x: number | null, dp = 3): number | null => (x === null || !Number.isFinite(x) ? null : Math.round(x * 10 ** dp) / 10 ** dp);

/** The record of a session, from its graded tests: named numbers only. */
export function toRecord(s: {
  assessmentId: string; mode: AssessMode; measuredAt: Date; device: RecordDevice; takeoffLeg: Side | null; tests: readonly TestResult[]; mqs: Mqs | null;
}): AssessmentRecord {
  return {
    assessmentId: s.assessmentId, version: RECORD_VERSION, protocolVersion: PROTOCOL_VERSION, thresholdsVersion: THRESHOLDS_VERSION,
    mode: s.mode, measuredAt: s.measuredAt.toISOString(),
    device: {
      class: s.device.class, model: s.device.model, poseHz: r(s.device.poseHz, 1)!, cameraFps: r(s.device.cameraFps, 1),
      width: Math.round(s.device.width), height: Math.round(s.device.height),
    },
    takeoffLeg: s.takeoffLeg,
    tests: s.tests.map((t): RecordTest => {
      const sides: RecordTest['sides'] = {};
      for (const k of ['both', 'left', 'right'] as const) {
        const sd = t.sides[k];
        if (!sd) continue;
        sides[k] = {
          score100: sd.score100, score03: sd.score03, repsValid: sd.repsValid, repsTotal: sd.repsTotal, complete: sd.complete,
          metrics: Object.fromEntries(sd.metrics.map((m) => [m.id, r(m.value)])),
          faults: sd.metrics.filter((m) => m.fault).map((m) => m.id),
        };
      }
      return {
        id: t.id, status: t.status, confidence: t.confidence, score100: t.score100, score03: t.score03, sides,
        asymmetry: t.asymmetry ? { flagged: t.asymmetry.flagged, pointsDiff: t.asymmetry.pointsDiff, weaker: t.asymmetry.weaker, metricValue: r(t.asymmetry.metric?.value ?? null) } : null,
        ...(t.t5 ? {
          t5: {
            bestHeightCm: t.t5.bestHeightCm, bestFlightMs: t.t5.bestFlightMs, bestJump: t.t5.bestJump, poseFps: r(t.t5.poseFps, 1)!,
            cameraFps: r(t.t5.cameraFps, 1), fpsLow: t.t5.fpsLow, heightPlusMinusCm: t.t5.heightPlusMinusCm, cvPct: t.t5.cvPct,
            jumps: t.t5.jumps.map((j) => ({ index: j.index, valid: j.valid, flightMs: j.flightMs, heightCm: j.heightCm })),
          },
        } : {}),
      };
    }),
    mqs: s.mqs ? { value: s.mqs.value, band: s.mqs.band, label: s.mqs.label, fmsTotal: s.mqs.fmsTotal, fmsMax: s.mqs.fmsMax, asymmetryFlags: s.mqs.asymmetryFlags } : null,
  };
}

// ── what the route refuses ──

/** A key that names media, or a string that could carry it. The payload is numbers: none of these belong in it. */
const MEDIA_KEY = /image|video|blob|frame|landmark|^lm$|^world$|pixel|data_?url|photo|picture|snapshot|skeleton|canvas|base64|audio/i;
const MAX_STRING = 64;

/** The path of the first media-shaped field in `raw`, or null. */
export function mediaIn(raw: unknown, path = '$', depth = 0): string | null {
  if (depth > 8) return path;
  if (typeof raw === 'string') return raw.length > MAX_STRING || /^data:|;base64,/i.test(raw) ? path : null;
  if (Array.isArray(raw)) {
    for (let i = 0; i < raw.length; i++) { const p = mediaIn(raw[i], `${path}[${i}]`, depth + 1); if (p) return p; }
    return null;
  }
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw)) {
      if (MEDIA_KEY.test(k)) return `${path}.${k}`;
      const p = mediaIn(v, `${path}.${k}`, depth + 1);
      if (p) return p;
    }
  }
  return null;
}

type V<T> = { ok: true; value: T } | { ok: false; error: string };
const TEST_IDS: readonly TestId[] = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const STATUSES: readonly TestStatus[] = ['scored', 'notScored', 'painStop', 'skipped', 'notBuilt'];
const GRADES: readonly Grade[] = ['ELITE', 'PRIMED', 'READY', 'RECOVERING'];
const ID_RE = /^[A-Za-z0-9_-]{8,64}$/, KEY_RE = /^[A-Za-z][A-Za-z0-9]{0,31}$/;

class Bad extends Error {}
const fail = (why: string): never => { throw new Bad(why); };
const obj = (v: unknown, where: string, keys: readonly string[]): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) fail(`${where}: not an object`);
  const o = v as Record<string, unknown>;
  for (const k of Object.keys(o)) if (!keys.includes(k)) fail(`${where}.${k}: unexpected field`);
  return o;
};
const num = (v: unknown, where: string, lo: number, hi: number, opt: { nullable?: boolean; int?: boolean } = {}): number | null => {
  if (v === null && opt.nullable) return null;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi || (opt.int && !Number.isInteger(v))) fail(`${where}: out of range`);
  return v as number;
};
const oneOf = <T extends string | null>(v: unknown, where: string, list: readonly T[]): T => {
  if (!list.includes(v as T)) fail(`${where}: not allowed`);
  return v as T;
};
const bool = (v: unknown, where: string): boolean => (typeof v === 'boolean' ? v : fail(`${where}: not a boolean`));

function side(v: unknown, where: string): RecordSide {
  const o = obj(v, where, ['score100', 'score03', 'repsValid', 'repsTotal', 'complete', 'metrics', 'faults']);
  const m = obj(o.metrics, `${where}.metrics`, Object.keys((o.metrics as object) ?? {}));
  if (Object.keys(m).length > 16) fail(`${where}.metrics: too many`);
  const metrics: Record<string, number | null> = {};
  for (const [k, x] of Object.entries(m)) {
    if (!KEY_RE.test(k)) fail(`${where}.metrics.${k}: bad key`);
    metrics[k] = num(x, `${where}.metrics.${k}`, -1000, 1000, { nullable: true });
  }
  if (!Array.isArray(o.faults) || o.faults.length > 16 || !o.faults.every((f) => typeof f === 'string' && KEY_RE.test(f))) fail(`${where}.faults: bad`);
  return {
    score100: num(o.score100, `${where}.score100`, 0, 100, { nullable: true }), score03: num(o.score03, `${where}.score03`, 0, 3, { int: true }) as Score03,
    repsValid: num(o.repsValid, `${where}.repsValid`, 0, 50, { int: true })!, repsTotal: num(o.repsTotal, `${where}.repsTotal`, 0, 50, { int: true })!,
    complete: bool(o.complete, `${where}.complete`), metrics, faults: o.faults as string[],
  };
}

function test(v: unknown, where: string): RecordTest {
  const o = obj(v, where, ['id', 'status', 'confidence', 'score100', 'score03', 'sides', 'asymmetry', 't5']);
  const out: RecordTest = {
    id: oneOf(o.id, `${where}.id`, TEST_IDS), status: oneOf(o.status, `${where}.status`, STATUSES),
    confidence: num(o.confidence, `${where}.confidence`, 0, 1)!,
    score100: num(o.score100, `${where}.score100`, 0, 100, { nullable: true }),
    score03: num(o.score03, `${where}.score03`, 0, 3, { nullable: true, int: true }) as Score03 | null,
    sides: {}, asymmetry: null,
  };
  const sides = obj(o.sides, `${where}.sides`, ['both', 'left', 'right']);
  for (const [k, sv] of Object.entries(sides)) out.sides[k as 'both' | Side] = side(sv, `${where}.sides.${k}`);
  if (o.asymmetry !== null && o.asymmetry !== undefined) {
    const a = obj(o.asymmetry, `${where}.asymmetry`, ['flagged', 'pointsDiff', 'weaker', 'metricValue']);
    out.asymmetry = {
      flagged: bool(a.flagged, `${where}.asymmetry.flagged`), pointsDiff: num(a.pointsDiff, `${where}.asymmetry.pointsDiff`, 0, 100, { nullable: true }),
      weaker: oneOf(a.weaker, `${where}.asymmetry.weaker`, ['left', 'right', null] as const), metricValue: num(a.metricValue, `${where}.asymmetry.metricValue`, 0, 1000, { nullable: true }),
    };
  }
  if (o.t5 !== undefined) {
    const t = obj(o.t5, `${where}.t5`, ['bestHeightCm', 'bestFlightMs', 'bestJump', 'poseFps', 'cameraFps', 'fpsLow', 'heightPlusMinusCm', 'cvPct', 'jumps']);
    if (!Array.isArray(t.jumps) || t.jumps.length > 10) fail(`${where}.t5.jumps: bad`);
    const maxCm = th('t5.maxHeightCm'), maxMs = th('t5.flightMaxMs');
    out.t5 = {
      bestHeightCm: num(t.bestHeightCm, `${where}.t5.bestHeightCm`, 0, maxCm, { nullable: true }), bestFlightMs: num(t.bestFlightMs, `${where}.t5.bestFlightMs`, 0, maxMs, { nullable: true }),
      bestJump: num(t.bestJump, `${where}.t5.bestJump`, 1, 10, { nullable: true, int: true }), poseFps: num(t.poseFps, `${where}.t5.poseFps`, 0, 240)!,
      cameraFps: num(t.cameraFps, `${where}.t5.cameraFps`, 0, 240, { nullable: true }), fpsLow: bool(t.fpsLow, `${where}.t5.fpsLow`),
      heightPlusMinusCm: num(t.heightPlusMinusCm, `${where}.t5.heightPlusMinusCm`, 0, 50, { nullable: true }), cvPct: num(t.cvPct, `${where}.t5.cvPct`, 0, 1000, { nullable: true }),
      jumps: (t.jumps as unknown[]).map((j, i) => {
        const q = obj(j, `${where}.t5.jumps[${i}]`, ['index', 'valid', 'flightMs', 'heightCm']);
        return { index: num(q.index, 'index', 1, 10, { int: true })!, valid: bool(q.valid, 'valid'), flightMs: num(q.flightMs, 'flightMs', 0, 5000)!, heightCm: num(q.heightCm, 'heightCm', 0, 1000)! };
      }),
    };
    // a valid jump is one the grader measured under the refusal line
    if (out.t5.jumps.some((j) => j.valid && j.heightCm > maxCm)) fail(`${where}.t5: a valid jump over ${maxCm} cm`);
  }
  // the gate the grader applies, applied again: a scored test cleared the confidence line; an unscored one has no score
  if (out.status === 'scored' && out.confidence < th('gate.minConfidence')) fail(`${where}: scored under the confidence line`);
  if (out.status !== 'scored' && out.status !== 'painStop' && (out.score100 !== null || Object.keys(out.sides).length)) fail(`${where}: a score on an unscored test`);
  return out;
}

/** A record, or why not. Strict: an unknown field anywhere is refused, as is a version this server does not speak. */
export function validateRecord(raw: unknown): V<AssessmentRecord> {
  try {
    const o = obj(raw, '$', ['assessmentId', 'version', 'protocolVersion', 'thresholdsVersion', 'mode', 'measuredAt', 'device', 'takeoffLeg', 'tests', 'mqs']);
    if (typeof o.assessmentId !== 'string' || !ID_RE.test(o.assessmentId)) fail('$.assessmentId: bad');
    if (o.version !== RECORD_VERSION) fail('$.version: unsupported');
    if (o.protocolVersion !== PROTOCOL_VERSION || o.thresholdsVersion !== THRESHOLDS_VERSION) fail('$.version: out of date');
    if (typeof o.measuredAt !== 'string' || !Number.isFinite(Date.parse(o.measuredAt))) fail('$.measuredAt: bad');
    const d = obj(o.device, '$.device', ['class', 'model', 'poseHz', 'cameraFps', 'width', 'height']);
    if (!Array.isArray(o.tests) || !o.tests.length || o.tests.length > 7) fail('$.tests: bad');
    const tests = (o.tests as unknown[]).map((t, i) => test(t, `$.tests[${i}]`));
    if (new Set(tests.map((t) => t.id)).size !== tests.length) fail('$.tests: repeated test');
    let mqs: AssessmentRecord['mqs'] = null;
    if (o.mqs !== null) {
      const m = obj(o.mqs, '$.mqs', ['value', 'band', 'label', 'fmsTotal', 'fmsMax', 'asymmetryFlags']);
      mqs = {
        value: num(m.value, '$.mqs.value', 0, 100)!, band: oneOf(m.band, '$.mqs.band', GRADES), label: oneOf(m.label, '$.mqs.label', ['Quick', 'Full'] as const),
        fmsTotal: num(m.fmsTotal, '$.mqs.fmsTotal', 0, 21, { int: true })!, fmsMax: num(m.fmsMax, '$.mqs.fmsMax', 0, 21, { int: true })!,
        asymmetryFlags: num(m.asymmetryFlags, '$.mqs.asymmetryFlags', 0, 7, { int: true })!,
      };
    }
    return {
      ok: true,
      value: {
        assessmentId: o.assessmentId as string, version: RECORD_VERSION, protocolVersion: PROTOCOL_VERSION, thresholdsVersion: THRESHOLDS_VERSION,
        mode: oneOf(o.mode, '$.mode', ['quick', 'full'] as const), measuredAt: new Date(Date.parse(o.measuredAt as string)).toISOString(),
        device: {
          class: oneOf(d.class, '$.device.class', ['desktop', 'mobile'] as const), model: oneOf(d.model, '$.device.model', ['lite', 'full', null] as const),
          poseHz: num(d.poseHz, '$.device.poseHz', 0, 240)!, cameraFps: num(d.cameraFps, '$.device.cameraFps', 0, 240, { nullable: true }),
          width: num(d.width, '$.device.width', 0, 8192, { int: true })!, height: num(d.height, '$.device.height', 0, 8192, { int: true })!,
        },
        takeoffLeg: oneOf(o.takeoffLeg, '$.takeoffLeg', ['left', 'right', null] as const),
        tests, mqs,
      },
    };
  } catch (e) {
    if (e instanceof Bad) return { ok: false, error: e.message };
    throw e;
  }
}

// ── the PRQ axes (spec §5.2) ──

export interface PrqWrite {
  axis: 'power' | 'flexibility';
  /** 0–100, integer. */
  value: number;
  unit: 'score';
  /** The measured basis, for "Power 57 → 61: <reason>". */
  reason: string;
  inputs: Record<string, number>;
}

const scoredTest = (rec: AssessmentRecord, id: TestId) =>
  rec.tests.find((t) => t.id === id && t.status === 'scored' && t.confidence >= th('gate.minConfidence'));

/** The axes this record writes, recomputed from its numbers. None after a pain stop; none for an axis that did not score. */
export function prqWritesFor(rec: AssessmentRecord): PrqWrite[] {
  if (rec.tests.some((t) => t.status === 'painStop')) return [];
  const out: PrqWrite[] = [];
  const t5 = scoredTest(rec, 'T5');
  if (t5?.t5 && t5.t5.bestHeightCm !== null && t5.t5.jumps.some((j) => j.valid)) {
    const value = powerFromJumpCm(t5.t5.bestHeightCm);
    if (value !== null) {
      const x = t5.t5, pm = x.heightPlusMinusCm !== null ? `, ±${inches(x.heightPlusMinusCm)} in` : '';
      out.push({
        axis: 'power', value, unit: 'score', inputs: { cmjCm: x.bestHeightCm!, flightMs: x.bestFlightMs ?? 0, poseFps: x.poseFps },
        reason: `CMJ ${inches(x.bestHeightCm!)} in (estimated from a ${((x.bestFlightMs ?? 0) / 1000).toFixed(2)} s flight, ${Math.round(x.poseFps)} fps${pm})`,
      });
    }
  }
  const t2 = scoredTest(rec, 'T2');
  const l = t2?.sides.left, rr = t2?.sides.right;
  const minReps = th('gate.minValidReps');
  if (l && rr && l.repsValid >= minReps && rr.repsValid >= minReps && l.metrics.tibia != null && rr.metrics.tibia != null) {
    const worseSide: Side = l.metrics.tibia <= rr.metrics.tibia ? 'left' : 'right';
    const worse = Math.min(l.metrics.tibia, rr.metrics.tibia);
    const t2axis = axisValue(measurementFor(ANKLE_DF_KEY)!, worse)!;
    const t1 = scoredTest(rec, 'T1')?.sides.both;
    const mob = t1 && t1.complete
      ? (['depthKneeFlex', 'shoulderFlex', 'trunkTibia'] as const)
        .map((id) => ({ id, v: t1.metrics[id] })).filter((x): x is { id: typeof x.id; v: number } => x.v != null)
        .map((x) => bandScore(x.v, bandOf(x.id === 'depthKneeFlex' ? 't1.depthKneeFlex' : x.id === 'shoulderFlex' ? 't1.shoulderFlex' : 't1.trunkTibia')))
      : [];
    const t1mob = mob.length ? mob.reduce((a, b) => a + b, 0) / mob.length : null;
    const w = th('prq.flexWeights');
    const value = Math.round(t1mob === null ? t2axis : w.t2 * t2axis + w.t1Mobility * t1mob);
    out.push({
      axis: 'flexibility', value, unit: 'score',
      inputs: { worseTibiaDeg: Math.round(worse * 10) / 10, t2Axis: t2axis, ...(t1mob !== null ? { t1Mobility: Math.round(t1mob) } : {}) },
      reason: `ankle ${Math.round(worse)}° with the heel down (worse side, ${worseSide})${t1mob !== null ? `, overhead-squat mobility ${Math.round(t1mob)}/100 (depth, arms, trunk against shin)` : ''}`,
    });
  }
  return out;
}

// ── the client ──

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; credentials: 'same-origin' }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/**
 * Send a record. The body is the record and nothing else, checked here before it leaves the page: a media-shaped
 * field or an oversized body throws instead of sending (the route refuses both too).
 */
export async function postAssessment(record: AssessmentRecord, fetchImpl: FetchLike): Promise<{ status: number; body: unknown }> {
  const media = mediaIn(record);
  if (media) throw new Error(`[assess] refusing to send a media-shaped field: ${media}`);
  const body = JSON.stringify(record);
  if (body.length > MAX_RECORD_BYTES) throw new Error('[assess] record too large to send');
  const res = await fetchImpl(ASSESSMENT_ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body, credentials: 'same-origin' });
  return { status: res.status, body: await res.json().catch(() => null) };
}
