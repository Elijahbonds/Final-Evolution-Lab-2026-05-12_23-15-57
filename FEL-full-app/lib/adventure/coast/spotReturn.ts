/**
 * A COAST SPORTS SPOT'S ROUND TRIP, phase D (lane/coast-d): the Venice courts' pattern (lib/adventure/venice/hubReturn.ts),
 * for the coast, in the coast's own files.
 *
 * A spot opens its mode's OWN page (no mode file changes to be launched) with `?from=coast&spot=<id>`, and leaves a return mark
 * in sessionStorage (the spot, never a position), so the end screen can bring the player back to the same spot even when the
 * page drops the query. The end screen (components/games/end-screen/end-screen.tsx) reads it beside Venice's; the coast reads
 * `?spot=` on arrival and stands the player beside that spot. Every storage access is in try/catch: the page works without it.
 *
 * Pure apart from the storage it is handed (window.sessionStorage by default).
 */

import { SPORT_SPOTS } from './zoneTown';

export const COAST_ROUTE = '/play/coast';
export const FROM_PARAM = 'from';
export const FROM_COAST = 'coast';
export const SPOT_PARAM = 'spot';
export const COAST_RETURN_KEY = 'fel.coast.return';
/** A mark older than this is ignored (a game left open overnight is not a trip from the coast). [TUNE] */
export const RETURN_TTL_MS = 3 * 60 * 60 * 1000;

export interface StoreLike { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }
export interface ReturnMark { spot: string; route: string; at: number }

const session = (): StoreLike | null => { try { return typeof window !== 'undefined' ? window.sessionStorage : null; } catch { return null; } };
const isSpot = (id: string | null): id is string => !!id && SPORT_SPOTS.some((s) => s.id === id);

/** The page a sports spot opens. */
export function launchHref(s: { id: string; route: string }): string {
  return `${s.route}?${new URLSearchParams({ [FROM_PARAM]: FROM_COAST, [SPOT_PARAM]: s.id }).toString()}`;
}

export function writeReturn(s: { id: string; route: string }, now: number, store: StoreLike | null = session()): void {
  try { store?.setItem(COAST_RETURN_KEY, JSON.stringify({ spot: s.id, route: s.route, at: now } satisfies ReturnMark)); } catch { /* convenience only */ }
}

export function readReturn(now: number, store: StoreLike | null = session()): ReturnMark | null {
  try {
    const raw = store?.getItem(COAST_RETURN_KEY);
    if (!raw) return null;
    const m = JSON.parse(raw) as Partial<ReturnMark>;
    if (typeof m.spot !== 'string' || typeof m.route !== 'string' || typeof m.at !== 'number') return null;
    if (!isSpot(m.spot) || now - m.at > RETURN_TTL_MS || now < m.at) return null;
    return { spot: m.spot, route: m.route, at: m.at };
  } catch { return null; }
}

export function clearReturn(store: StoreLike | null = session()): void { try { store?.removeItem(COAST_RETURN_KEY); } catch { /* fine */ } }

/** The coast page that stands the player at `spot`. */
export const coastHrefFor = (spot: string): string => `${COAST_ROUTE}?${new URLSearchParams({ [SPOT_PARAM]: spot }).toString()}`;

/** The end screen's "back to the coast": when this game was opened from a coast spot (the query, or the mark names this page). */
export function coastReturnHref(pathname: string, search: string, now: number, store: StoreLike | null = session()): string | null {
  let q: URLSearchParams;
  try { q = new URLSearchParams(search); } catch { q = new URLSearchParams(); }
  const spot = q.get(SPOT_PARAM);
  if (q.get(FROM_PARAM) === FROM_COAST && isSpot(spot)) return coastHrefFor(spot);
  const m = readReturn(now, store);
  return m && m.route === pathname ? coastHrefFor(m.spot) : null;
}

/** As coastReturnHref, and the mark is used up (the next game opened from the shelf does not come back here). */
export function consumeCoastReturnHref(pathname: string, search: string, now: number, store: StoreLike | null = session()): string | null {
  const href = coastReturnHref(pathname, search, now, store);
  if (href) clearReturn(store);
  return href;
}

/** The sports spot the coast page should stand the player at (`?spot=`), or null. */
export function spotFromSearch(search: string): string | null {
  try { const s = new URLSearchParams(search).get(SPOT_PARAM); return isSpot(s) ? s : null; } catch { return null; }
}
