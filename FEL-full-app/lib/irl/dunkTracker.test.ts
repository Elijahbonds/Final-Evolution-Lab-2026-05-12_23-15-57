import { describe, expect, it } from 'vitest';
import { DunkTracker, refusalLine, DUNK_POSE_IDX, type TrackerFrame } from './dunkTracker';
import { errorBandInches, formatWithBand, FpsMeter } from '../session-setup/accuracy';
import { resultLine, rimHangLine, spokenResultLine } from '../session-setup/voice';

const FLIGHT_S = 0.857;                     // g·t²/8 ≈ 90 cm
const G = 9.80665;

/** A body whose hip-to-ankle span is `span` image units, standing on `floor`, jumping with a true parabola. */
function stream(fps: number, span: number, phaseMs: number, floor = 0.85): TrackerFrame[] {
  const dt = 1000 / fps;
  const peak = (G * FLIGHT_S * FLIGHT_S) / 8;          // metres
  const unitPerM = span / 0.9;                         // a 0.9 m hip-to-ankle span
  const takeoffTrue = 1000 + phaseMs;
  const out: TrackerFrame[] = [];
  for (let t = 0; t <= 4000; t += dt) {
    const s = (t - takeoffTrue) / 1000;
    const h = s > 0 && s < FLIGHT_S ? (G * s * (FLIGHT_S - s)) / 2 : 0;
    const ankle = floor - h * unitPerM;
    const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }));
    const set = (i: number, y: number, x = 0.5) => { lm[i] = { x, y, visibility: 1 }; };
    set(DUNK_POSE_IDX.leftAnkle, ankle, 0.48); set(DUNK_POSE_IDX.rightAnkle, ankle, 0.52);
    set(DUNK_POSE_IDX.leftHip, ankle - span, 0.48); set(DUNK_POSE_IDX.rightHip, ankle - span, 0.52);
    out.push({ landmarks: lm, timestampMs: t, present: true });
  }
  void peak;
  return out;
}

/** The flight between the tracker's two threshold heights (rise at takeoff, half of it at landing) on the true parabola.
 *  The thresholds themselves bias the flight a little short of the full 857 ms; that bias is not frame quantisation. */
function thresholdFlightMs(span: number): number {
  const rise = 0.086 * span;
  const rM = (rise * 0.9) / span;
  const rootAt = (h: number) => (FLIGHT_S - Math.sqrt(FLIGHT_S * FLIGHT_S - (8 * h) / G)) / 2;
  return (FLIGHT_S - rootAt(rM / 2) - rootAt(rM)) * 1000;
}

function flightOf(fps: number, span: number, phaseMs: number): number {
  const tr = new DunkTracker();
  let got = null;
  for (const f of stream(fps, span, phaseMs)) { const r = tr.feed(f); if (r) got = r; }
  return got ? (got as { flightTimeMs: number }).flightTimeMs : NaN;
}

describe('sub-frame flight time', () => {
  for (const fps of [30, 60]) {
    it(`recovers a ${FLIGHT_S}s flight (to its threshold crossings) within half a frame at ${fps} fps`, () => {
      const half = 500 / fps;
      for (const phase of [0, 0.25, 0.5, 0.75].map((p) => (p * 1000) / fps)) {
        const ms = flightOf(fps, 0.4, phase);
        expect(Math.abs(ms - thresholdFlightMs(0.4))).toBeLessThanOrEqual(half);
        expect(Math.abs(ms - FLIGHT_S * 1000)).toBeLessThanOrEqual(40);
      }
    });
  }
});

describe('span-scaled airborne rise', () => {
  it('gives the same flight time at two camera distances, within one frame', () => {
    for (const fps of [30, 60]) {
      const near = flightOf(fps, 0.5, 7);
      const far = flightOf(fps, 0.2, 7);
      expect(Math.abs(near - far)).toBeLessThanOrEqual(1000 / fps);
    }
  });
});

describe('± band', () => {
  it('is derived from the measured fps', () => {
    expect(errorBandInches(30)).toBe(1);
    expect(errorBandInches(60)).toBe(1);
    expect(errorBandInches(10)).toBeGreaterThan(errorBandInches(30));
    expect(errorBandInches(0)).toBe(errorBandInches(30));
    expect(formatWithBand(34, 1)).toBe('34 ±1 in');
  });
  it('shows on the result line, not in speech', () => {
    expect(resultLine('Jalen', 86.36, 8.5, 1)).toBe('Jalen, 34 ±1 in, judges 8.5');
    expect(spokenResultLine(86.36, 8.5)).toBe('34 inches, judges 8.5');
  });
  it('measures fps from frame stamps', () => {
    const m = new FpsMeter();
    for (let i = 0; i < 20; i++) m.push(i * (1000 / 60));
    expect(Math.round(m.fps)).toBe(60);
  });
});

describe('rim hang vs lost feet', () => {
  type Opts = { airMs: number; hands: boolean; hipStill: boolean };
  /** Calibrate 0.7 s standing, jump (ankles up), stay up `airMs`, land, settle. Hips follow ankles unless `hipStill`. */
  function run({ airMs, hands, hipStill }: Opts) {
    const tr = new DunkTracker();
    const dt = 1000 / 60;
    const takeoff = 1000, land = takeoff + airMs;
    let got: unknown = null;
    for (let t = 0; t <= land + 1500; t += dt) {
      const up = t > takeoff && t < land;
      const lift = up ? Math.min(0.2, (t - takeoff) / 200 * 0.2) : 0;
      const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }));
      const set = (i: number, y: number, x = 0.5) => { lm[i] = { x, y, visibility: 1 }; };
      const ankle = 0.85 - lift;
      const hip = hipStill && up ? 0.5 - 0.2 : ankle - 0.35 - (up ? 0.04 * Math.sin(t / 80) : 0);
      set(DUNK_POSE_IDX.leftAnkle, ankle, 0.48); set(DUNK_POSE_IDX.rightAnkle, ankle, 0.52);
      set(DUNK_POSE_IDX.leftHip, hip, 0.48); set(DUNK_POSE_IDX.rightHip, hip, 0.52);
      set(DUNK_POSE_IDX.nose, hip - 0.25);
      const wristY = up && hands ? hip - 0.4 : hip - 0.05;
      set(DUNK_POSE_IDX.leftWrist, wristY, 0.45); set(DUNK_POSE_IDX.rightWrist, wristY, 0.55);
      const r = tr.feed({ landmarks: lm, timestampMs: t, present: true });
      if (r) got = r;
    }
    return { got, refusal: tr.takeRefusal(), air: tr.refusalAirTimeMs };
  }

  it('names a rim hang and reports its air time', () => {
    const r = run({ airMs: 1150, hands: true, hipStill: true });
    expect(r.got).toBeNull();
    expect(r.refusal).toBe('rim_hang');
    expect(Math.abs((r.air ?? 0) - 1150)).toBeLessThanOrEqual(60);
    expect(refusalLine('rim_hang', 1120)).toBe('Rim hang. Air time 1.12 s');
  });
  it('still refuses lost feet (hands low, hips moving) as implausible_vertical', () => {
    expect(run({ airMs: 1150, hands: false, hipStill: false }).refusal).toBe('implausible_vertical');
    expect(run({ airMs: 1150, hands: true, hipStill: false }).refusal).toBe('implausible_vertical');
    expect(run({ airMs: 1150, hands: false, hipStill: true }).refusal).toBe('implausible_vertical');
  });
  it('leaves a normal dunk unchanged', () => {
    const r = run({ airMs: 600, hands: true, hipStill: true });
    expect(r.refusal).toBeNull();
    expect((r.got as { flightTimeMs: number }).flightTimeMs).toBeGreaterThan(500);
  });
  it('speaks the air time only, no height', () => {
    expect(rimHangLine(1120)).toBe('Rim hang. Air time 1.12 seconds');
    expect(rimHangLine(1120)).not.toMatch(/inch|cm/i);
  });
});
