/**
 * VENICE V1: walking up to a court and coming back to it (docs/VENICE-HUB-PLAN.md §4, "Walk-up to play", "Coming back").
 *
 * A court opens its mode's OWN page (no mode file changes to be launched) with `?from=venice&spot=<id>`, plus the court
 * location the hoops modes already read (`?location=venice`, nexus/courtLocations readCourtLocation). The hub also leaves a
 * return mark in sessionStorage, so the end screen can send the player back to the same court even when a page drops the
 * query on the way (the party's Start together navigates to its own query). The mark holds the SPOT, never a position
 * (ADVENTURE-PLAN.md: saves record a named spawn, never raw coordinates). Every storage access is in try/catch: the page
 * works without it.
 *
 * Pure apart from the storage it is handed (window.sessionStorage by default).
 */

import { SPOTS, type Spot } from './layout';

export const HUB_ROUTE = '/play/venice';
export const FROM_PARAM = 'from';
export const FROM_VENICE = 'venice';
export const SPOT_PARAM = 'spot';
export const RETURN_KEY = 'fel.hub.return';
/** A return mark older than this is ignored (a game left open overnight is not a trip from Venice). [TUNE] */
export const RETURN_TTL_MS = 3 * 60 * 60 * 1000;

/** The party seat a court's game has (server/netd partyRules ONLINE_MODES ids): only the 1v1 and 3v3 courts today. */
export const PARTY_MODE_FOR_SPOT: Readonly<Record<string, string>> = { 'court.ones': 'onevone', 'court.run': 'threevthree' };

export interface StoreLike { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }
export interface ReturnMark { spot: string; route: string; at: number }

const session = (): StoreLike | null => { try { return typeof window !== 'undefined' ? window.sessionStorage : null; } catch { return null; } };

/** The page a court opens. */
export function launchHref(s: Pick<Spot, 'id' | 'route' | 'kind'>): string {
  const q = new URLSearchParams({ [FROM_PARAM]: FROM_VENICE, [SPOT_PARAM]: s.id });
  if (s.kind === 'court') q.set('location', 'venice');
  return `${s.route}?${q.toString()}`;
}

export function writeReturn(s: Pick<Spot, 'id' | 'route'>, now: number, store: StoreLike | null = session()): void {
  try { store?.setItem(RETURN_KEY, JSON.stringify({ spot: s.id, route: s.route, at: now } satisfies ReturnMark)); } catch { /* convenience only */ }
}

export function readReturn(now: number, store: StoreLike | null = session()): ReturnMark | null {
  try {
    const raw = store?.getItem(RETURN_KEY);
    if (!raw) return null;
    const m = JSON.parse(raw) as Partial<ReturnMark>;
    if (typeof m.spot !== 'string' || typeof m.route !== 'string' || typeof m.at !== 'number') return null;
    if (!SPOTS.some((s) => s.id === m.spot) || now - m.at > RETURN_TTL_MS || now < m.at) return null;
    return { spot: m.spot, route: m.route, at: m.at };
  } catch { return null; }
}

export function clearReturn(store: StoreLike | null = session()): void { try { store?.removeItem(RETURN_KEY); } catch { /* fine */ } }

/** The hub page that puts the player back at `spot`. */
export const hubHrefFor = (spot: string): string => `${HUB_ROUTE}?${SPOT_PARAM}=${encodeURIComponent(spot)}`;

/**
 * The end screen's "back to Venice": the hub href when this game was started from Venice — the query says so, or the return
 * mark names this page's route — else null (the end screen keeps its own exits).
 */
export function veniceReturnHref(pathname: string, search: string, now: number, store: StoreLike | null = session()): string | null {
  let q: URLSearchParams;
  try { q = new URLSearchParams(search); } catch { q = new URLSearchParams(); }
  const spot = q.get(SPOT_PARAM);
  if (q.get(FROM_PARAM) === FROM_VENICE && spot && SPOTS.some((s) => s.id === spot)) return hubHrefFor(spot);
  const m = readReturn(now, store);
  return m && m.route === pathname ? hubHrefFor(m.spot) : null;
}

/** The spot the hub page should put the player at (`?spot=`), when it is one V1 opens. */
export function spotFromSearch(search: string): string | null {
  try { const s = new URLSearchParams(search).get(SPOT_PARAM); return s && SPOTS.some((x) => x.id === s) ? s : null; } catch { return null; }
}
