// SET LENGTH (IMPROVE 2026-10-06): volleyball's set is to 25 — up to ~50 rallies of 4–6 s plus a 1.4 s rest each, long
// for a phone session. The splash offers a SHORT set to 15 beside it. Picked like a court layout: `?set=15` (or
// `?set=25`) wins, then the remembered pick, then the full set.
// Tennis (IMPROVE 2026-10-06, Tennis #5) rides the same pick: a QUICK MATCH, first to 3 games, beside the first to 6 —
// deuce games with no time limit make a six-game match long on a phone. `?set=3` / `?set=6` (or short / full).

export type SetLengthId = 'full' | 'short';
export interface SetLength {
  id: SetLengthId; name: string; sub: string; tint: string; target: number; cap: number;
  /** The `?set=` value that picks it (the splash writes it; the url reads it). */
  param: string;
}
/**
 * TUNED (2026-10-06): the short set is to 15, win by 2 (the real game's deciding-set length), hard cap 20 — the same
 * +5 headroom the full set's cap of 30 gives over 25.
 */
export const SET_LENGTHS: readonly SetLength[] = [
  { id: 'full', name: 'To 25', sub: 'THE FULL SET · WIN BY 2 · CAP 30', tint: '#22d3ee', target: 25, cap: 30, param: '25' },
  { id: 'short', name: 'To 15', sub: 'A SHORT SET · WIN BY 2 · CAP 20', tint: '#fbbf24', target: 15, cap: 20, param: '15' },
];
/**
 * TUNED (2026-10-06): tennis's quick match is first to 3 games (deuce games as ever). `target` is games to win; a
 * tennis match has no cap beyond it, so `cap` repeats it.
 */
export const TENNIS_MATCH_LENGTHS: readonly SetLength[] = [
  { id: 'full', name: 'First to 6', sub: 'THE FULL MATCH · FIRST TO 6 GAMES', tint: '#22d3ee', target: 6, cap: 6, param: '6' },
  { id: 'short', name: 'First to 3', sub: 'A QUICK MATCH · FIRST TO 3 GAMES', tint: '#fbbf24', target: 3, cap: 3, param: '3' },
];
export const SET_LENGTH_MODES: readonly string[] = ['volleyball', 'tennis'];
/** The lengths a mode offers (volleyball's sets unless the mode has its own). */
export function setLengthsFor(modeId: string): readonly SetLength[] { return modeId === 'tennis' ? TENNIS_MATCH_LENGTHS : SET_LENGTHS; }
/** The splash chip's caption. */
export function setLengthLabel(modeId: string): string { return modeId === 'tennis' ? 'MATCH' : 'SET'; }
export const SET_KEY_PREFIX = 'fel-set-';

export function setLengthOf(id: SetLengthId, modeId = 'volleyball'): SetLength {
  const ls = setLengthsFor(modeId);
  return ls.find((s) => s.id === id) ?? ls[0];
}

/**
 * A SCORED run plays the full set, whatever was picked: a Story node's goal ("score 22 points"), an Arena stake's
 * ceiling and a challenge's score were all measured on a set to 25, and a set to 15 cannot reach them. These are the
 * game shell's own run markers (components/games/game-shell.tsx): `story`, `arena`, `mp`, `c`.
 */
export const SCORED_RUN_PARAMS: readonly string[] = ['story', 'arena', 'mp', 'c'];
export function setLengthLocked(search?: string): boolean {
  try {
    const q = new URLSearchParams(search ?? (typeof window !== 'undefined' ? window.location.search : ''));
    return SCORED_RUN_PARAMS.some((p) => !!q.get(p));
  } catch { return false; }
}

export function readSetLength(modeId: string, search?: string): SetLengthId {
  if (!SET_LENGTH_MODES.includes(modeId) || setLengthLocked(search)) return 'full';
  try {
    const q = new URLSearchParams(search ?? (typeof window !== 'undefined' ? window.location.search : '')).get('set');
    // each mode answers to its own numbers (volleyball's 15 is not a tennis match), and to short / full
    const hit = setLengthsFor(modeId).find((l) => l.param === q || l.id === q);
    if (hit) return hit.id;
    if (typeof window !== 'undefined') { const s = window.localStorage.getItem(SET_KEY_PREFIX + modeId); if (s === 'short') return 'short'; }
  } catch { /* convenience only */ }
  return 'full';
}
export function writeSetLength(modeId: string, id: SetLengthId): void {
  try { window.localStorage.setItem(SET_KEY_PREFIX + modeId, id); } catch { /* convenience only */ }
}
