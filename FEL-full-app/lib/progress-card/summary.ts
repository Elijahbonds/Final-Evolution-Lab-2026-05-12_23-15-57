// PROGRESS CARD (value round, item 1; owner promise: "get measurably better"). The card's shape and its honest summary.
//
// Pure and client-safe: no Prisma, no DOM, no clock of its own. The server builds the card from the profile's rows
// (card.ts); the card page's phone-only island re-summarizes it once the form numbers kept on this phone are read, so
// the line on top always agrees with the tiles under it.
//
// THE HONESTY RULES are profile v2's (lib/profile-v2/week.ts, tiles.ts): a week with no reading is null, never 0; an
// arrow needs both weeks; a change inside the noise band reads "same". On top of those, the card says which of four
// states it is in and never claims a trend it cannot show:
//   · new          nothing measured or played in either week;
//   · first-week   something this week, nothing the week before (no arrow anywhere, by construction);
//   · quiet-week   something last week, nothing this week;
//   · compared     something in both weeks (the tally counts only what has a number in BOTH).
import type { ProgressTile } from '@/lib/profile-v2/tiles';
import type { WeekCompare } from '@/lib/profile-v2/week';

export type CardState = 'new' | 'first-week' | 'quiet-week' | 'compared';

/** One mode's best score this week against last week (verified adults only: a teen's scores stay on the device). */
export interface CardMode {
  mode: string;
  name: string;
  href: string | null;
  runsThisWeek: number;
  runsLastWeek: number;
  /** reduce 'max' over the week's scores; higher is better in every mode (components/games/end-screen/records.ts). */
  compare: WeekCompare;
  vsLine: string | null;
}

export interface CardGames {
  /** 'account': the server's scores (a verified adult). 'device': under 18 or unknown age, scores stay on the phone. */
  scope: 'account' | 'device';
  /** Runs finished this week vs last (GameSession times only, no scores: allowed for teens, as days played are). */
  runs: WeekCompare;
  /** The read hit its cap (lib/profile-v2/load READ_CAP.played), so the counts are "at least". */
  runsCapped: boolean;
  runsLine: string | null;
  modes: CardMode[];
}

export interface Tally { better: number; worse: number; same: number; compared: number }

export interface ProgressCard {
  /** The rolling windows, ISO: this week is [from, to], last week [lastFrom, from). */
  window: { from: string; to: string; lastFrom: string };
  /** The display name, or null for under-18s and unknown ages: a teen's card never carries a name. */
  name: string | null;
  minorOrUnknown: boolean;
  /** Profile v2's four tiles, as built for the profile header: jump, form, reaction, streak. */
  metrics: ProgressTile[];
  games: CardGames;
  /**
   * SEAM: before/after clips. FEL keeps no clip of the user's own today: the replay buffer and the Screen's frozen reps
   * live in page memory only (lib/capture/replayBuffer.ts, lib/screen/rep-memory.ts), and the coach-review clips
   * (Booking.clipPaths) are consented for that one review and deleted after it. When the user's own clip store exists
   * (owner decision 2026-10-22: our own storage only), this carries this week's and last week's clip of one movement.
   */
  clips: null;
  state: CardState;
  tally: Tally;
  headline: string;
}

/** Did this tile read anything in the window? The streak tile's compare is a count of days played (0 is "no"). */
function active(t: ProgressTile, which: 'thisWeek' | 'lastWeek'): boolean {
  const v = t.compare?.[which] ?? null;
  if (v === null) return false;
  return t.key === 'streak' ? v > 0 : true;
}

/** The trends with a number in both weeks: the measured tiles (jump, form, days played) and each mode's best. */
export function tallyOf(metrics: readonly ProgressTile[], modes: readonly CardMode[]): Tally {
  const t: Tally = { better: 0, worse: 0, same: 0, compared: 0 };
  const trends = [...metrics.map((m) => m.compare?.trend ?? null), ...modes.map((m) => m.compare.trend)];
  for (const tr of trends) {
    if (tr === null) continue;
    t.compared += 1;
    t[tr] += 1;
  }
  return t;
}

export function stateOf(metrics: readonly ProgressTile[], games: Pick<CardGames, 'runs' | 'modes'>): CardState {
  const any = (which: 'thisWeek' | 'lastWeek') =>
    metrics.some((m) => active(m, which))
    || (games.runs[which] ?? 0) > 0
    || games.modes.some((m) => m.compare[which] !== null);
  const now = any('thisWeek');
  const before = any('lastWeek');
  if (now && before) return 'compared';
  if (now) return 'first-week';
  if (before) return 'quiet-week';
  return 'new';
}

/** The one line on top. Product copy (owner review: docs/PROGRESS-CARD.md). It never names a number it did not read. */
export function headlineFor(state: CardState, t: Tally): string {
  if (state === 'new') return 'Nothing on your card yet. Play or measure once this week, and next week’s card shows what changed.';
  if (state === 'first-week') return 'Your first week on record. Next week’s card shows what changed.';
  if (state === 'quiet-week') return 'Nothing in the last 7 days yet. Last week’s numbers are here to beat.';
  if (t.compared === 0) return 'You measured different things each week, so there is nothing to compare yet.';
  if (t.better > 0) return `Better on ${t.better} of ${t.compared} against last week.`;
  if (t.worse > 0) return `Down on ${t.worse} of ${t.compared} against last week. One session turns it around.`;
  if (t.compared === 1) return 'Level with last week.';
  return t.compared === 2 ? 'Level with last week on both.' : `Level with last week on all ${t.compared}.`;
}

/** The card with its state, tally and headline worked out from its own tiles and games. */
export function summarizeCard(card: Omit<ProgressCard, 'state' | 'tally' | 'headline'>): ProgressCard {
  const tally = tallyOf(card.metrics, card.games.modes);
  const state = stateOf(card.metrics, card.games);
  return { ...card, state, tally, headline: headlineFor(state, tally) };
}

/** The same card with one tile swapped (the phone-only form tile), summarized again. */
export function withTile(card: ProgressCard, tile: ProgressTile): ProgressCard {
  const { state: _s, tally: _t, headline: _h, ...rest } = card;
  return summarizeCard({ ...rest, metrics: rest.metrics.map((m) => (m.key === tile.key ? tile : m)) });
}

const DAY_FMT: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', timeZone: 'UTC' };
const WEEK = 7 * 86_400_000;

/** The rolling windows ending at `now`: this week is [from, to], last week [lastFrom, from) (lib/profile-v2/week.ts). */
export function windowAt(now: Date): ProgressCard['window'] {
  const t = now.getTime();
  return { from: new Date(t - WEEK).toISOString(), to: now.toISOString(), lastFrom: new Date(t - 2 * WEEK).toISOString() };
}

/** "Oct 18 – Oct 24": the rolling week's first and last day (UTC, as the days-played count is; assumption). */
export function weekLabel(card: Pick<ProgressCard, 'window'>): string {
  const from = new Date(card.window.from);
  const to = new Date(card.window.to);
  // the window opens at now - 7 days, so its first FULL day is the next one
  const first = new Date(from.getTime() + 86_400_000);
  return `${first.toLocaleDateString('en-US', DAY_FMT)} – ${to.toLocaleDateString('en-US', DAY_FMT)}`;
}
