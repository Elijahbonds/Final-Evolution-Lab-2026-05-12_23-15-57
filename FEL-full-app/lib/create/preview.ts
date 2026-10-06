// lib/create/preview.ts — CREATE HUB step 3's numbers. Pure.
import type { DanceStep } from '@/lib/creator/creative-card-types';

/** The in-game bed level the soundtrack plan names (§2 piece G: bed about -14 dB under the menu's 0 dB). */
export const BED_DB = -14;
export const dbToGain = (db: number): number => Math.pow(10, db / 20);

/** A chart's density as the Dance pick banner's 1–3 difficulty (steps per minute: under 40 easy, under 80 medium). */
export function chartDifficulty(chart: readonly DanceStep[], bpm: number): 1 | 2 | 3 {
  if (!chart.length) return 1;
  const lastBeat = Math.max(...chart.map((s) => s.beat + s.holdBeats));
  const perMin = chart.length / Math.max(1e-6, lastBeat / bpm);
  return perMin < 40 ? 1 : perMin < 80 ? 2 : 3;
}

/** Which beat of a looping routine is under the playhead, or -1 while stopped. */
export function routineBeat(seconds: number | null, songBpm: number, routine: readonly DanceStep[]): number {
  if (seconds === null || !(seconds >= 0) || !routine.length) return -1;
  const total = Math.max(1, ...routine.map((s) => s.beat + s.holdBeats));
  return ((seconds * songBpm) / 60) % total;
}

/** The step index under that beat, or -1 (a gap, or stopped). */
export function activeStep(beat: number, routine: readonly DanceStep[]): number {
  if (beat < 0) return -1;
  return routine.findIndex((s) => beat >= s.beat && beat < s.beat + s.holdBeats);
}
