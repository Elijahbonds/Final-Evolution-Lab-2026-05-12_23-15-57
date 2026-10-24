// unlisted-modes — the modes nobody can reach, parked but NOT deleted (IRON-PARADISE-OUT, 2026-10-03).
//
// Iron Paradise (mode id 'training') is off every shelf, menu, picker and ladder in the app. Nothing is deleted:
// the game (components/games/training-game.tsx and its loader), its MODE_INFO / MODE_MENU_META / PRQ rows, its
// story zone (gymDome) and every recorded session stay exactly where they were. The way back is to remove one
// entry from the list below.
//
// One list, one question: `isUnlistedMode(id)`. Every surface that OFFERS a mode to a player filters on it —
// the Train tab's Iron Paradise card, the mode-menu entries, the catalogue listing in lib/game-data.ts, the
// family shelf, the first-run carousel, the Arena's stake picker, and the story ladder (a zone played on an
// unlisted mode is skipped, and the next zone still unlocks). Reads of STORED data (an old session, a saved
// pick, an open duel) are not filtered: history stays readable.

import { modeKeyForHref } from './mode-routes';
export { UNLISTED_MODES, isUnlistedMode, type UnlistedModeId } from './unlisted-mode-ids';
import { isUnlistedMode } from './unlisted-mode-ids';

/** The mode slug of a '/play/<slug>' href, or null when the href points somewhere else. */
export function playSlugOf(href: string | null | undefined): string | null {
  const slug = String(href ?? '').split('/play/')[1]?.split(/[?#]/)[0];
  return slug || null;
}

/** The catalogue/session mode id behind a '/play/<slug>' href, even when the route slug is an alias. */
export function modeIdOfPlayHref(href: string | null | undefined): string | null {
  const slug = playSlugOf(href);
  return slug === null ? null : modeKeyForHref(href) ?? slug;
}

/** Does this href open a parked mode's play route? ('/play/training' today.) */
export function isUnlistedPlayHref(href: string | null | undefined): boolean {
  return isUnlistedMode(modeIdOfPlayHref(href));
}
