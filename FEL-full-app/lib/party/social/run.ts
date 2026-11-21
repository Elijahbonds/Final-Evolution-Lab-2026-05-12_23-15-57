// lib/party/social/run.ts — "winners stay on" (lane/online-play, 2026-11-21). Pure: no socket, no DOM.
//
// Owner (2026-11-17, defaults taken, flagged): "The run's rule: winners stay on" (V2). A party that plays game after game on one
// court: the winners keep the court, the next people waiting come on against them, the losers go to the back of the line. Bots
// fill a short team (the mode does that: an empty seat is the AI, lib/net/seats.ts).
//
// It lives on the HOST's page (the host presses Start), fed by netd's p_result (party2): who won the last game, as party
// members. The order it returns is the one p_start takes (server/netd/src/party.ts): seat 0 is the host seat `h…`, and the 3v3
// seats ALTERNATE teams (lib/net/seats.ts), so a team is every other seat — the order interleaves the two teams.

export interface RunState {
  /** Members waiting, longest first. */
  line: string[];
  /** The team that holds the court (members, in seat order), or [] before the first result. */
  holders: string[];
  /** Games the holders have won in a row. */
  streak: number;
  /** Games played in this run. */
  games: number;
}

export const EMPTY_RUN: RunState = { line: [], holders: [], streak: 0, games: 0 };

/** Seats per game and per team, by mode (the modes' own sizes; ONLINE_MODES `humans`). */
export function teamSize(humans: number): number { return Math.max(1, Math.floor(humans / 2)); }

/** Keep the run to who is here: members who left are dropped, newcomers join the back of the line, in join order. */
export function sync(run: RunState, present: readonly string[]): RunState {
  const here = new Set(present);
  const holders = run.holders.filter((m) => here.has(m));
  const line = run.line.filter((m) => here.has(m) && !holders.includes(m));
  for (const m of present) if (!holders.includes(m) && !line.includes(m)) line.push(m);
  return { ...run, holders, line, streak: holders.length ? run.streak : 0 };
}

/** Interleave two teams into the alternating seat order: [a0, b0, a1, b1, …]. */
export function interleave(a: readonly string[], b: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) { if (a[i]) out.push(a[i]); if (b[i]) out.push(b[i]); }
  return out;
}

/**
 * Who plays the next game: the holders against the next ones in line (the first game: the line's first two teams). A team is
 * as big as the mode's half, or half the party when that is fewer ("a party of 4 plays 2 + 2 bots a side").
 */
export function nextGame(run: RunState, humans: number): { home: string[]; away: string[]; order: string[]; sitting: string[] } {
  const size = Math.max(1, Math.min(teamSize(humans), Math.ceil((run.holders.length + run.line.length) / 2)));
  const pool = [...run.line];
  const home = run.holders.length ? run.holders.slice(0, size) : pool.splice(0, size);
  const away = pool.splice(0, size);
  const order = interleave(home, away);
  return { home, away, order, sitting: pool };
}

/**
 * After a game: the winners hold the court; the losers go to the back of the line (in their seat order). A result that names
 * nobody here changes nothing.
 */
export function afterGame(run: RunState, winners: readonly string[], losers: readonly string[]): RunState {
  const w = winners.filter(Boolean), l = losers.filter((m) => !w.includes(m));
  if (!w.length) return run;
  const sameHolders = run.holders.length > 0 && w.every((m) => run.holders.includes(m));
  const line = [...run.line.filter((m) => !w.includes(m) && !l.includes(m)), ...l];
  return { holders: [...w], line, streak: sameHolders ? run.streak + 1 : 1, games: run.games + 1 };
}
