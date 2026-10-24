// VB75-2 (ALL-MODES-TO-75-2026-10-22 §7): the volleyball card equals the saved result. The card used to show only the
// player's points ("SET WON · 25 PTS"), so a card could never be checked against the saved pair — the audit's "4–0 LOST"
// read. It now reads BOTH scores off the same GameResult the shell saves (score / opponentScore, timingGameResult).
import type { GameResult } from './game-shell';

/** The volleyball card line, built from the saved result itself: verdict, both scores, style. */
export function volleyballHeadline(saved: Pick<GameResult, 'won' | 'score' | 'opponentScore' | 'stats'>): string {
  const style = Number((saved.stats as Record<string, unknown> | undefined)?.style ?? 0);
  return `${saved.won ? 'SET WON' : 'SET LOST'} · ${saved.score}–${saved.opponentScore ?? 0} · ${style} STYLE`;
}
