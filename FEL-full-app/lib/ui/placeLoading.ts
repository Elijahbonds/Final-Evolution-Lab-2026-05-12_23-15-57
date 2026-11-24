// placeLoading — one branded loading card for the places (look-screens, phase A3(a) of docs/LOOK-PASS-AUDIT.md, finding 4; owner
// 2026-11-24: "Let's do a pass where we improve how things look.").
//
// WHAT WAS MEASURED (scripts/probes/look-audit/look-walk.mts, every size): Venice, the Coast and the Physics Arena load on a black
// screen with one line of small grey text ("Heading to the courts…", "Sailing to the coast…", "Building the arena…") for 9-19 s on
// the rig, straight after the hoops games' branded loading cards (BootSplash: the venue's art, its name, the title, a bar).
//
// THE CARD: the boot splash's look with what already ships — the procedural venue art (lib/babylon/ui/venueThumbs.ts: no file, no
// request), the place's own page title, the brand line BootSplash already uses for a place with no venue ("FINAL EVOLUTION"), the
// stage's own loading line word for word, and the splash's bar. No new words, no new art. It is drawn by the /play layout (a
// shared shell file) over a place's stage from the first paint until the stage's harness leaves its loading phase (sessionStore),
// so no place's own files change; the story is not veiled (its loading is its READY card, the story lane's C2), but its words are
// here for that lane to use.
//
// Knob `ui.placeLoadingCard` (lib/feel-panel/knobs.ts): 1 = the card; 0 = today's black screen and line exactly (nothing drawn).
import { feel } from '@/lib/feel-panel/feel';

/** ui.placeLoadingCard: 1 = the branded card while a place loads; 0 = today's black screen. */
export const PLACE_LOADING_CARD = 1;
export const placeLoadingCard = (): boolean => feel('ui.placeLoadingCard', PLACE_LOADING_CARD) >= 0.5;

export type Place = 'venice' | 'coast' | 'arena' | 'story';

export interface PlaceCard {
  /** The page's own title (app/play/<place>/page.tsx metadata), upper-cased by the card. */
  title: string;
  /** BootSplash's brand line for a place with no venue of its own (VENUE_ART.default.sub). */
  sub: string;
  /** The stage's own loading line, word for word (app/play/<place>/stage.tsx). */
  line: string;
  /** A procedural venue thumb that ships (venueThumbs PALETTES) and BootSplash's tint for it. */
  venue: string;
  tint: string;
}

export const PLACE_CARDS: Record<Place, PlaceCard> = {
  venice: { title: 'Venice Beach', sub: 'FINAL EVOLUTION', line: 'Heading to the courts…', venue: 'venice-court', tint: '#ffb36b' },
  coast: { title: 'The Coast', sub: 'FINAL EVOLUTION', line: 'Sailing to the coast…', venue: 'surf-break', tint: '#37b6d9' },
  arena: { title: 'Physics Arena', sub: 'FINAL EVOLUTION', line: 'Building the arena…', venue: 'default', tint: '#22d3ee' },
  story: { title: 'The Adventure', sub: 'FINAL EVOLUTION', line: 'LOADING…', venue: 'default', tint: '#22d3ee' },
};

/** The place a /play route is, for the veil: only the three that load on black (the story's loading is its READY card). */
export function veiledPlace(pathname: string | null | undefined): Exclude<Place, 'story'> | null {
  // by its segments (/play/<place>), so this file names no route of its own (the Coast's stays unlisted: coast.test.ts)
  const [lead, play, place, ...rest] = (pathname ?? '').replace(/\/+$/, '').split('/');
  if (lead !== '' || play !== 'play' || rest.length) return null;
  return place === 'venice' || place === 'coast' || place === 'arena' ? place : null;
}
