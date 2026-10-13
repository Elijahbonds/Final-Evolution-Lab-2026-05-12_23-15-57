/**
 * lib/venueModes.ts — what a venue card lists (QA P1-28, 2026-09-27).
 *
 * The /venues cards carried hand-written mode lists that drifted from the roster: Venice Beach Court listed Flight Night,
 * Ones and Threes but not Downtown, Game Night or Prove It; Venice Tennis Court left out Tiebreak Blitz; Mountain Slope
 * left out Stomp. A card now lists every mode on the /play shelf (lib/nav/families) whose MODE_INFO venue is the card's
 * name. A card no mode names as its venue (Court Carnival's events, the shop, the Dunk Duel Arena) keeps its own list.
 */
import { MODE_INFO, type Venue } from '@/lib/game-data';
import { FAMILIES } from '@/lib/nav/families';

/** The modes a player can pick on /play, by MODE_INFO key. */
export function shelfModeKeys(): Set<string> {
  return new Set(FAMILIES.flatMap((f) => f.modes));
}

/** Every live mode (on the shelf) whose MODE_INFO venue is `venueName`, by name, in MODE_INFO order. */
export function modesAtVenue(venueName: string, live: ReadonlySet<string> = shelfModeKeys()): string[] {
  return Object.entries(MODE_INFO).filter(([key, info]) => live.has(key) && info.venue === venueName).map(([, info]) => info.name);
}

/** What the card lists: the derived modes, or the card's own list where no mode lives there. */
export function venueCardModes(venue: Pick<Venue, 'name' | 'modes'>, live?: ReadonlySet<string>): string[] {
  const derived = modesAtVenue(venue.name, live);
  return derived.length ? derived : [...(venue.modes ?? [])];
}
