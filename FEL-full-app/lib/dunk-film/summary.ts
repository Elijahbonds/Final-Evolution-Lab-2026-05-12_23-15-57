// summary — best, average, and the direction across one session.
//
// Heights are the air-time estimates, in whole centimetres. A change under TREND_FLAT_CM is called flat
// so a centimetre of noise is not a story. assumption: 2 cm is that band.

import type { JumpRead } from './jumpDetect';

/** A first-half to second-half change smaller than this is flat. assumption: 2 cm. */
export const TREND_FLAT_CM = 2;

export interface SessionSummary {
  count: number;
  bestCm: number | null;
  averageCm: number | null;
  trend: 'up' | 'down' | 'flat';
  /** Second half minus first half, whole centimetres. 0 when there is nothing to compare. */
  trendDeltaCm: number;
}

function avg(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function summariseJumps(jumps: readonly Pick<JumpRead, 'airTimeCm'>[]): SessionSummary {
  const heights = jumps.map((j) => j.airTimeCm).filter((n): n is number => n != null);
  if (!heights.length) return { count: 0, bestCm: null, averageCm: null, trend: 'flat', trendDeltaCm: 0 };
  const bestCm = Math.max(...heights);
  const averageCm = Math.round(avg(heights));
  if (heights.length < 2) return { count: heights.length, bestCm, averageCm, trend: 'flat', trendDeltaCm: 0 };
  const mid = Math.floor(heights.length / 2);
  const delta = Math.round(avg(heights.slice(mid)) - avg(heights.slice(0, mid)));
  const trend = Math.abs(delta) < TREND_FLAT_CM ? 'flat' : delta > 0 ? 'up' : 'down';
  return { count: heights.length, bestCm, averageCm, trend, trendDeltaCm: delta };
}

export function summaryLines(s: SessionSummary): string[] {
  if (!s.count || s.bestCm == null || s.averageCm == null) return ['No jumps read in this session.'];
  const way = s.trend === 'up' ? 'up' : s.trend === 'down' ? 'down' : 'flat';
  const delta = s.trend === 'flat' ? 'flat' : `${way} about ${Math.abs(s.trendDeltaCm)} cm`;
  return [
    `Best: about ${s.bestCm} cm, estimate`,
    `Average: about ${s.averageCm} cm, estimate`,
    `Trend: ${delta}`,
  ];
}
