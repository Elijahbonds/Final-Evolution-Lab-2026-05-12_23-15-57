// lib/hoops-cam/coach.ts — BBS-04 (2026-11-03): one athlete's shot chart for their coach, from their kept sessions.
//
// The coach sees what the player saw on their own summary (components/hoops-cam/shot-chart.tsx): made / taken, the
// zones, a dot per shot that had a spot, the make-% trend — over a window, not one session — plus a dribble line. The
// dots are capped (the newest DOTS_MAX) so a busy month stays readable; every shot still counts in the totals.
//
// Pure, client-safe (the server builds it; the team panel and the rig render it).
import { byZone, tally, trend, type HoopsSession, type LoggedShot, type Tally, type TrendDay } from './log';
import type { Zone } from './spot';

/** (new) The most dots one athlete's chart draws. */
export const DOTS_MAX = 150;

export interface CoachDot { made: boolean; x: number; z: number }

export interface AthleteShots {
  /** Shot sessions in the window. */
  sessions: number;
  total: Tally;
  zones: Record<Zone, Tally>;
  /** The newest DOTS_MAX shots that had a spot. */
  dots: CoachDot[];
  /** Shots with no spot (in the totals, not on the chart). */
  noSpot: number;
  trend: TrendDay[];
  /** The newest day with a session ('YYYY-MM-DD'), or null. */
  lastDay: string | null;
  dribble: { sessions: number; count: number; crossovers: number } | null;
}

export function athleteShots(sessions: readonly HoopsSession[], trendDays = 14): AthleteShots {
  const newest = [...sessions].sort((a, b) => b.at - a.at);
  const shotSessions = newest.filter((s): s is Extract<HoopsSession, { kind: 'shots' }> => s.kind === 'shots' && s.shots.length > 0);
  // newest session first, and inside a session the latest shot first
  const shots: LoggedShot[] = shotSessions.flatMap((s) => [...s.shots].sort((a, b) => b.t - a.t));
  const placed = shots.filter((s) => s.x !== null && s.z !== null);
  const drib = newest.filter((s): s is Extract<HoopsSession, { kind: 'dribble' }> => s.kind === 'dribble' && s.count > 0);
  return {
    sessions: shotSessions.length,
    total: tally(shots),
    zones: byZone(shots),
    dots: placed.slice(0, DOTS_MAX).map((s) => ({ made: s.made, x: s.x!, z: s.z! })),
    noSpot: shots.length - placed.length,
    trend: trend(shotSessions, trendDays),
    lastDay: newest[0]?.day ?? null,
    dribble: drib.length ? { sessions: drib.length, count: drib.reduce((n, s) => n + s.count, 0), crossovers: drib.reduce((n, s) => n + s.crossovers, 0) } : null,
  };
}
