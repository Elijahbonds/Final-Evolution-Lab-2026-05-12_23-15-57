// PROGRESS CARD — the week's card, built from the rows profile v2 already reads (lib/profile-v2/load.ts readProfileRows).
//
// No second data layer: the jump, form, reaction and streak tiles ARE the profile header's tiles (assembleProfile), with
// the same gates (lib/profile-v2/gate.ts: jump and form for opted-in verified adults, form kept on the phone for
// everyone else) and the same rolling weeks. What the card adds is the games: runs this week against last (times only,
// for everyone) and, for a verified adult, each mode's best score this week against last.
//
// Pure: no Prisma, no DOM, no clock of its own.
import { assembleProfile, type ProfileRows } from '@/lib/profile-v2/assemble';
import { vsLine } from '@/lib/profile-v2/tiles';
import { compareWeeks, WEEK_MS, type Point, type WeekCompare } from '@/lib/profile-v2/week';
import { MODE_INFO, canonicalModeKey } from '@/lib/game-data';
import { rivalHistorySince } from '@/lib/rival-history';
import { summarizeCard, windowAt, type CardMode, type CardGames, type ProgressCard } from './summary';

export * from './summary';

/** Modes the card lists: the three played most this week (then last week). A card, not the profile's stats block. */
export const CARD_MODES = 3;

const fmtScore = (n: number) => Math.round(n).toLocaleString('en-US');

function runsLine(runs: WeekCompare, capped: boolean): string | null {
  const now = runs.thisWeek ?? 0;
  const before = runs.lastWeek ?? 0;
  if (now === 0 && before === 0) return null;
  const plus = capped ? '+' : '';
  const n = (k: number) => `${k}${plus} run${k === 1 && !capped ? '' : 's'}`;
  return `${n(now)} this week, ${before === 0 ? 'none' : n(before)} the week before`;
}

function modeVsLine(c: WeekCompare): string | null {
  if (c.thisWeek === null) return c.lastWeek === null ? null : `Not played this week (last week’s best ${fmtScore(c.lastWeek)})`;
  return vsLine(c, fmtScore, '');
}

/** Each mode's best this week vs last, from a verified adult's recent scores (already gated in the query and in JS). */
export function modesOf(scores: ProfileRows['recentScores'], now: number): CardMode[] {
  const byMode = new Map<string, Point[]>();
  for (const s of scores) {
    const at = s.createdAt.getTime();
    if (at < now - 2 * WEEK_MS || !Number.isFinite(s.score)) continue;
    // DERBY-KEY: a key whose older rows are another game's scale counts only from its cut-over (lib/rival-history)
    const since = rivalHistorySince(s.mode);
    if (since && at < since.getTime()) continue;
    const k = canonicalModeKey(s.mode);
    const list = byMode.get(k) ?? [];
    list.push({ at, value: s.score });
    byMode.set(k, list);
  }
  const out: CardMode[] = [];
  for (const [mode, points] of byMode) {
    const compare = compareWeeks(points, now, { reduce: 'max' });
    const runs = compareWeeks(points.map((p) => ({ at: p.at, value: 1 })), now, { reduce: 'count' });
    const info = MODE_INFO[mode];
    out.push({
      mode, name: info?.name ?? mode, href: info?.href ?? null,
      runsThisWeek: runs.thisWeek ?? 0, runsLastWeek: runs.lastWeek ?? 0,
      compare, vsLine: modeVsLine(compare),
    });
  }
  return out
    .filter((m) => m.runsThisWeek + m.runsLastWeek > 0)
    .sort((a, b) => b.runsThisWeek - a.runsThisWeek || b.runsLastWeek - a.runsLastWeek || a.name.localeCompare(b.name))
    .slice(0, CARD_MODES);
}

/**
 * The card. `playedCap` is the read cap on the played-times rows (READ_CAP.played in load.ts): when the read came back
 * full, the run counts are a floor and say so ("400+ runs").
 */
export function buildProgressCard(userId: string, rows: ProfileRows, nowDate: Date, playedCap: number): ProgressCard {
  const now = nowDate.getTime();
  const data = assembleProfile(userId, rows, nowDate);
  const adult = data.gates.adult;
  const runs = compareWeeks(rows.playedAt.map((d) => ({ at: d.getTime(), value: 1 })), now, { reduce: 'count' });
  const runsCapped = playedCap > 0 && rows.playedAt.length >= playedCap;
  const games: CardGames = {
    scope: adult ? 'account' : 'device',
    runs, runsCapped, runsLine: runsLine(runs, runsCapped),
    // belt and braces: the query gated recentScores to verified adults; a teen's card never reads a score
    modes: adult ? modesOf(rows.recentScores, now) : [],
  };
  return summarizeCard({
    window: windowAt(nowDate),
    name: data.privacy.minorOrUnknown ? null : data.identity.name,
    minorOrUnknown: data.privacy.minorOrUnknown,
    metrics: data.tiles,
    games,
    clips: null,
  });
}
