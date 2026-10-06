// SET LENGTH (IMPROVE 2026-10-06): volleyball's set is to 25 — up to ~50 rallies of 4–6 s plus a 1.4 s rest each, long
// for a phone session. The splash offers a SHORT set to 15 beside it. Picked like a court layout: `?set=15` (or
// `?set=25`) wins, then the remembered pick, then the full set.

export type SetLengthId = 'full' | 'short';
export interface SetLength { id: SetLengthId; name: string; sub: string; tint: string; target: number; cap: number }
/**
 * TUNED (2026-10-06): the short set is to 15, win by 2 (the real game's deciding-set length), hard cap 20 — the same
 * +5 headroom the full set's cap of 30 gives over 25.
 */
export const SET_LENGTHS: readonly SetLength[] = [
  { id: 'full', name: 'To 25', sub: 'THE FULL SET · WIN BY 2 · CAP 30', tint: '#22d3ee', target: 25, cap: 30 },
  { id: 'short', name: 'To 15', sub: 'A SHORT SET · WIN BY 2 · CAP 20', tint: '#fbbf24', target: 15, cap: 20 },
];
export const SET_LENGTH_MODES: readonly string[] = ['volleyball'];
export const SET_KEY_PREFIX = 'fel-set-';

export function setLengthOf(id: SetLengthId): SetLength { return SET_LENGTHS.find((s) => s.id === id) ?? SET_LENGTHS[0]; }

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
    if (q === '15' || q === 'short') return 'short';
    if (q === '25' || q === 'full') return 'full';
    if (typeof window !== 'undefined') { const s = window.localStorage.getItem(SET_KEY_PREFIX + modeId); if (s === 'short') return 'short'; }
  } catch { /* convenience only */ }
  return 'full';
}
export function writeSetLength(modeId: string, id: SetLengthId): void {
  try { window.localStorage.setItem(SET_KEY_PREFIX + modeId, id); } catch { /* convenience only */ }
}
