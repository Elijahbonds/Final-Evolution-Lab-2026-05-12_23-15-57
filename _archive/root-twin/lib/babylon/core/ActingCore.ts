// ActingCore — delivery scoring for Acting mode.
//
// Acting is the only one of the five Creator Card disciplines with no playable
// surface: M28 shipped VoiceCapture.ts and nothing ever played it. This is the
// scoring half.
//
// WHAT IT ACTUALLY JUDGES, AND WHAT IT DELIBERATELY DOES NOT
// It does NOT do speech recognition. No transcription, no accent model, no
// "was that the right word" — that needs a service this project has no
// credentials for, and faking it would be worse than not having it. What it
// judges is DELIVERY, from three signals any browser can measure locally with
// the Web Audio API:
//
//   TIMING   did you start and stop near the beat the line is cued for
//   ENERGY   did the loudness contour match what the line asks for
//   RANGE    did you vary, or deliver it flat
//
// That is an honest, local, private assessment: audio never leaves the device
// to be scored. It is also the part a performance game actually cares about —
// an actor hitting a cue with the right intensity reads as good acting far
// more than pronouncing every word cleanly does.
//
// Babylon-free and DOM-free so it can be executed as a test.

export type LineIntensity = 'whisper' | 'calm' | 'raised' | 'shout';

export interface ScriptLine {
  id: string;
  text: string;
  /** Seconds from scene start when delivery should begin. */
  cueAt: number;
  /** Expected duration in seconds. */
  duration: number;
  intensity: LineIntensity;
}

export interface Scene {
  id: string;
  title: string;
  lines: ScriptLine[];
}

/** Target RMS band per intensity, in normalised 0–1 loudness. */
export const INTENSITY_BANDS: Record<LineIntensity, { min: number; max: number }> = {
  whisper: { min: 0.02, max: 0.14 },
  calm: { min: 0.10, max: 0.32 },
  raised: { min: 0.28, max: 0.60 },
  shout: { min: 0.50, max: 1.00 },
};

/** A delivery as measured by the mode: when it started/ended and its loudness
 *  envelope, sampled at a fixed rate. */
export interface Delivery {
  startedAt: number;
  endedAt: number;
  /** Normalised RMS samples, 0–1, in order. */
  envelope: number[];
}

export const clamp01 = (v: number): number =>
  (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

/** 1.0 when dead on the cue, falling to 0 by `tolerance` seconds away. */
export function timingScore(line: ScriptLine, d: Delivery, tolerance = 1.2): number {
  const startErr = Math.abs(d.startedAt - line.cueAt);
  const lenErr = Math.abs((d.endedAt - d.startedAt) - line.duration);
  const start = 1 - Math.min(1, startErr / tolerance);
  // Length is judged more loosely than entry: actors stretch lines, and
  // punishing that as hard as missing the cue would make good delivery score badly.
  const len = 1 - Math.min(1, lenErr / (tolerance * 2));
  return clamp01(start * 0.65 + len * 0.35);
}

export function rms(env: number[]): number {
  if (env.length === 0) return 0;
  let s = 0;
  for (const v of env) s += v * v;
  return Math.sqrt(s / env.length);
}

/** How well the average loudness sits inside the band the line asks for. */
export function energyScore(line: ScriptLine, d: Delivery): number {
  const band = INTENSITY_BANDS[line.intensity];
  const level = rms(d.envelope);
  if (level >= band.min && level <= band.max) return 1;
  // Outside the band, fall off relative to the band's own width, so a whisper
  // is not judged on the same absolute scale as a shout.
  const width = Math.max(0.05, band.max - band.min);
  const dist = level < band.min ? band.min - level : level - band.max;
  return clamp01(1 - dist / width);
}

/** Dynamic range across the line. A flat read scores low even when loud. */
export function rangeScore(d: Delivery): number {
  if (d.envelope.length < 2) return 0;
  const min = Math.min(...d.envelope);
  const max = Math.max(...d.envelope);
  // 0.35 of full scale is treated as a full-marks spread; more than that is
  // shouting-then-silent, which is not better.
  return clamp01((max - min) / 0.35);
}

export interface LineScore {
  lineId: string;
  timing: number;
  energy: number;
  range: number;
  total: number;
  /** Player-facing note. Specific beats "try harder". */
  note: string;
}

export const WEIGHTS = { timing: 0.4, energy: 0.4, range: 0.2 };

export function scoreLine(line: ScriptLine, d: Delivery): LineScore {
  const timing = timingScore(line, d);
  const energy = energyScore(line, d);
  const range = rangeScore(d);
  const total = clamp01(timing * WEIGHTS.timing + energy * WEIGHTS.energy + range * WEIGHTS.range);

  const band = INTENSITY_BANDS[line.intensity];
  const level = rms(d.envelope);
  let note: string;
  if (timing < 0.5) note = d.startedAt > line.cueAt ? 'Came in late on the cue.' : 'Jumped the cue.';
  else if (level < band.min) note = `Too quiet for a ${line.intensity} line.`;
  else if (level > band.max) note = `Too loud for a ${line.intensity} line.`;
  else if (range < 0.35) note = 'Flat — vary the delivery.';
  else if (total > 0.85) note = 'Landed it.';
  else note = 'Solid read.';

  return { lineId: line.id, timing, energy, range, total, note };
}

export interface PerformanceResult {
  perLine: LineScore[];
  average: number;
  stars: number;
  best: string | null;
  worst: string | null;
}

export function scorePerformance(scene: Scene, deliveries: Record<string, Delivery>): PerformanceResult {
  const perLine = scene.lines
    .filter((l) => deliveries[l.id])
    .map((l) => scoreLine(l, deliveries[l.id]));

  if (perLine.length === 0) {
    return { perLine: [], average: 0, stars: 0, best: null, worst: null };
  }
  const average = perLine.reduce((a, b) => a + b.total, 0) / perLine.length;
  // Unperformed lines still count against you — otherwise skipping the hard
  // line is the optimal strategy.
  const coverage = perLine.length / scene.lines.length;
  const adjusted = clamp01(average * coverage);

  const sorted = [...perLine].sort((a, b) => b.total - a.total);
  return {
    perLine,
    average: adjusted,
    stars: adjusted >= 0.9 ? 5 : adjusted >= 0.75 ? 4 : adjusted >= 0.55 ? 3 : adjusted >= 0.35 ? 2 : adjusted > 0 ? 1 : 0,
    best: sorted[0]?.lineId ?? null,
    worst: sorted[sorted.length - 1]?.lineId ?? null,
  };
}
