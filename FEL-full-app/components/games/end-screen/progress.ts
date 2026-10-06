// PROGRESS TOWARD NEXT — "what is the next thing to earn", from real numbers only.
//
// Every line here is read from the server's answer or this device's own records; when the data for a line is missing, the
// line is missing. No invented goals. (IMPROVE 2026-10-06: the daily goals and the player level now exist, and each has
// its own block on the card — the goals card and the level bar, which says the XP to the next level — so neither is
// repeated here, and these three lines stay free for the season, mastery, the streak and the device's records.)

import { TIERS } from '@/lib/mastery/mastery-core';
import type { EndRecap } from './types';
import type { RunCallouts } from './records';

/** lib/session-payout.ts STREAK_CAP_DAYS, restated so the card does not pull the payout module into the client bundle;
 *  progress.test.ts holds the two equal. */
export const STREAK_CAP_DAYS_VIEW = 7;
/** lib/season/season-pass-core.ts SeasonPassCore's default track length (50 tiers); progress.test.ts holds it. */
export const SEASON_TIERS_VIEW = 50;

export interface ProgressLine {
  id: 'season' | 'mastery' | 'streak' | 'best' | 'winRun';
  text: string;
  /** 0..100 when the line has a bar. */
  pct?: number;
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

export function progressLines(recap: EndRecap | null, rec: RunCallouts | null, won: boolean): ProgressLine[] {
  const out: ProgressLine[] = [];
  const paid = Boolean(recap && !recap.noPlay && !recap.unpaid);

  const s = paid ? recap!.season : null;
  if (s && Number.isFinite(s.need) && s.need > 0) {
    if (s.tier >= SEASON_TIERS_VIEW) out.push({ id: 'season', text: `${s.name}: track complete` });
    else out.push({ id: 'season', text: `${fmt(Math.max(0, s.need - s.into))} season XP to Tier ${s.tier + 1}`, pct: Math.max(0, Math.min(100, (s.into / s.need) * 100)) });
  }

  const m = paid ? recap!.mastery : null;
  if (m && Number.isInteger(m.tierIndex) && m.tierIndex >= 0) {
    const next = TIERS[m.tierIndex];   // tierIndex 0 = Unranked → TIERS[0] Bronze; 5 = top → undefined
    if (next) out.push({ id: 'mastery', text: m.tierIndex === 0 ? `Mastery: graded runs here earn ${next}` : `Mastery ${m.tier} · next: ${next}` });
    else out.push({ id: 'mastery', text: `Mastery ${m.tier} · the top tier` });
  }

  const days = paid ? recap!.streakDays : undefined;
  if (typeof days === 'number' && days >= 1) {
    out.push({ id: 'streak', text: days >= STREAK_CAP_DAYS_VIEW ? `Day ${days} streak · top streak bonus` : `Day ${days} streak · play tomorrow for day ${days + 1}` });
  }

  if (rec) {
    if (rec.shortBy !== null && rec.shortBy > 0) out.push({ id: 'best', text: `${fmt(rec.shortBy)} short of your best (${fmt(rec.best)})` });
    if (won && rec.winRun >= 1) out.push({ id: 'winRun', text: rec.winRun === 1 ? 'Win the next one for 2 in a row' : `${rec.winRun} wins in a row · go for ${rec.winRun + 1}` });
  }
  // three lines at most: the card has to fit a TV without scrolling, and the first three are the nearest goals
  return out.slice(0, MAX_PROGRESS_LINES);
}

export const MAX_PROGRESS_LINES = 3;

export interface CalloutChip {
  id: 'best' | 'first' | 'winRun' | 'streak';
  text: string;
  sub?: string;
  /** Gold = a record. */
  gold?: boolean;
}

/** The moment's callouts: a beaten best, a first run, a win run, the day's streak — each only when the data says so. */
export function calloutChips(rec: RunCallouts | null, recap: EndRecap | null, won: boolean): CalloutChip[] {
  const out: CalloutChip[] = [];
  if (rec?.newBest) out.push({ id: 'best', text: 'NEW PERSONAL BEST', sub: rec.previousBest !== null ? `was ${fmt(rec.previousBest)}` : undefined, gold: true });
  else if (rec?.firstRun) out.push({ id: 'first', text: 'FIRST RUN LOGGED', sub: `best to beat: ${fmt(rec.best)}` });
  if (won && rec && rec.winRun >= 2) out.push({ id: 'winRun', text: `${rec.winRun} WINS IN A ROW` });
  const paid = Boolean(recap && !recap.noPlay && !recap.unpaid);
  const days = paid ? recap!.streakDays : undefined;
  const bonus = paid ? recap!.streakBonus : undefined;
  if (typeof days === 'number' && days >= 1 && typeof bonus === 'number' && bonus > 0) out.push({ id: 'streak', text: `DAY ${days} STREAK`, sub: `+${fmt(bonus)} streak LC` });
  else if (typeof days === 'number' && days >= 2) out.push({ id: 'streak', text: `DAY ${days} STREAK` });
  return out;
}
