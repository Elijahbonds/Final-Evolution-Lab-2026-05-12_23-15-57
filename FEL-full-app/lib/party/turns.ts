// lib/party/turns.ts — one go each, a board at the end (MULTIPLAYER lane, 2026-10-06).
//
// A TURNS game (catalog.ts) is any solo game with a score: the room runs one attempt per seated player, banks each
// score against that seat, and shows the board when the last player has been. A rematch is the same order again.
// The players are snapshotted when the game starts, so somebody joining mid-game plays the next one instead of
// reshuffling whose go it is. Pure.

export interface TurnPlayer { seat: number; label: string; name: string; color: string }

export interface TurnState {
  players: TurnPlayer[];
  /** Index into players of whose go it is; === players.length once everyone has been. */
  at: number;
  scores: (number | null)[];
}

export function startTurns(players: readonly TurnPlayer[]): TurnState {
  return { players: [...players], at: 0, scores: players.map(() => null) };
}

export function currentTurn(s: TurnState): TurnPlayer | null {
  return s.players[s.at] ?? null;
}

export function turnsDone(s: TurnState): boolean {
  return s.at >= s.players.length;
}

/** Bank the current player's score and pass the go on. A finished state is returned unchanged. */
export function recordTurnScore(s: TurnState, score: number): TurnState {
  if (turnsDone(s)) return s;
  const scores = [...s.scores];
  scores[s.at] = Number.isFinite(score) ? Math.max(0, Math.round(score)) : 0;
  return { ...s, scores, at: s.at + 1 };
}

/** Skip the current player (they left mid-turn): no score, the go moves on. */
export function skipTurn(s: TurnState): TurnState {
  if (turnsDone(s)) return s;
  return { ...s, at: s.at + 1 };
}

export interface Standing extends TurnPlayer { score: number | null; place: number }

/** Highest first; a tie shares the place; a player who never went sits last with no score. */
export function turnStandings(s: TurnState): Standing[] {
  const rows = s.players.map((p, i) => ({ ...p, score: s.scores[i] }));
  rows.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  let place = 0;
  let last: number | null | undefined;
  return rows.map((r, i) => {
    if (r.score !== last) { place = i + 1; last = r.score; }
    return { ...r, place };
  });
}

/** The TV line while a game runs: "P2 · SAM — YOUR GO · 2 OF 3". */
export function turnBannerLine(s: TurnState): string {
  const p = currentTurn(s);
  if (!p) return '';
  return s.players.length > 1 ? `${p.label} · ${p.name} — YOUR GO · ${s.at + 1} OF ${s.players.length}` : '';
}
