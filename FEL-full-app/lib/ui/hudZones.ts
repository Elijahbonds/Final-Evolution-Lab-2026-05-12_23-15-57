// hudZones — one HUD layout for the hoops on a phone held upright (look-screens, phase A2 of docs/LOOK-PASS-AUDIT.md; owner
// 2026-11-24: "Let's do a pass where we improve how things look.").
//
// WHAT WAS MEASURED (scripts/probes/look-audit/look-walk.mts, 390 x 844 upright, before this file; findings 1 and 3):
//   - the Dunk stacks ELEVEN pieces over the court (score, round, dunk count, a 4-line leaderboard, NO PROP, SPECIALS · SEASON
//     PASS, SIGNATURE, the HYPE meter, MIX / MC / CC, the MC's caption, the hint) and the bottom column — the hint, the take-off
//     read, the beat strip, the MC's caption and the call — grows UP from above the touch deck straight across the hoop;
//   - in 1v1 and 3v3 the bottom stack (the hint, the shot meter, the MC's line, the call) sits right above the deck, which is
//     exactly where the high camera stands the players (it keeps their feet above the deck's band), so every line is drawn on
//     them; and a dashed ghost d-pad is drawn where those modes read no d-pad.
//
// THE ZONES (upright phone only: lib/ui/compactHeader.ts UPRIGHT_PHONE_QUERY):
//   top strip   the score bug and the round info, as each host draws them (unchanged), with the HYPE meter beside them;
//   line slot   right under the strip: the call, the MC's line (one line: the whole line is in CC's caption bus) and the shot
//               meter — the transient lines, above the rim and the bodies instead of on them;
//   deck slot   the hint, in the touch deck's own band (where the ghost d-pad was, over the move stick), in 1v1 only, where the
//               camera never stands a body (DECK_HINT_MODES); 3v3's and the Dunk's hints head their line slots;
//   "⋯" menu    what is read between plays, not during one: the Dunk's field board, its prop / specials / signature chips and the
//               MIX / MC / CC switches (the shell's menu holds them on the upright phone, lib/ui/compactHeader.ts).
// Sideways, desktop and a TV are untouched, and with no "⋯" menu slot (ui.compactGameHeader 0) the folded pieces stay where
// they were.
//
// Knobs (lib/feel-panel/knobs.ts):
//   `ui.hudZonesUpright`  1 = the zones; 0 = today's upright HUD exactly.
//   `ui.deckFadeOverBody` the opacity the upright deck's action cluster is drawn at (1 = today's solid deck). Ships at 1 (OFF):
//                         nothing a lane-A file can read says where a body is on screen at run time, so this is a constant fade
//                         (the labels stay full), a style call for the owner's eye, not a measured fix.
import { feel } from '@/lib/feel-panel/feel';

/** ui.hudZonesUpright: 1 = the upright hoops HUD zones; 0 = today's layout exactly. */
export const HUD_ZONES_UPRIGHT = 1;
export const hudZonesUpright = (): boolean => feel('ui.hudZonesUpright', HUD_ZONES_UPRIGHT) >= 0.5;

/** ui.deckFadeOverBody: the upright deck's action cluster opacity; 1 = today's solid deck (shipped). */
export const DECK_FADE_OVER_BODY = 1;
/** Never below this: a button a thumb has to find. */
export const DECK_FADE_MIN = 0.35;
export const deckFadeOverBody = (): number => Math.max(DECK_FADE_MIN, Math.min(1, feel('ui.deckFadeOverBody', DECK_FADE_OVER_BODY)));

/** The phone held upright (lib/ui/compactHeader.ts UPRIGHT_PHONE_QUERY, repeated so this file stands alone). */
export const ZONES_QUERY = '(max-width: 640px) and (orientation: portrait)';

/** The menu's slot the folded pieces portal into (rendered by components/games/compact-header.tsx MenuGameTools). */
export const MENU_SLOT_ATTR = 'data-fel-menu-slot';
/** The deck's slot the hint portals into (rendered by TouchOverlay where a ghost d-pad was). */
export const DECK_SLOT_ATTR = 'data-fel-deck-slot';

/**
 * The modes whose camera keeps the players above the touch deck's band (1v1's high sideline view: HighSidelineCam bottomBand), so
 * the deck slot is under no body and the hint may go there. 3v3's camera does not (its high view is a switch, off): measured, its
 * players walk into the deck's band (the hint sat on a player's feet in 1 of 6 moments), so its hint stays in the line slot.
 */
export const DECK_HINT_MODES: ReadonlySet<string> = new Set(['onevone']);

/** Where each of the hoops bottom stack's rows goes on the upright phone. */
export type HoopsRowZone = 'deck' | 'line';
export function hoopsRowZone(key: string): HoopsRowZone {
  return key === 'hint' ? 'deck' : 'line';
}

/** The line slot's top, below the hosts' top strip (a py-3 row of 44 px chips): the strip's 12 + 44 + 8 px of air. */
export const LINE_SLOT_TOP = '4rem';

/**
 * What the Dunk draws on an upright phone, by the zone each piece goes to. Every piece a player reads is in a zone (the strip,
 * the line slot or the menu): nothing is dropped. Over the court are the strip (one row) and the line slot's lines; the plan's
 * bar is at most 6 pieces there (it was 11). Counted in a browser by scripts/probes/look-screens/hud.mts.
 */
export const DUNK_UPRIGHT_PIECES = {
  score: 'strip', round: 'strip', dunkNum: 'strip',
  hype: 'strip',
  hint: 'line', mic: 'line', call: 'line', takeoff: 'line', beats: 'line',
  field: 'menu', prop: 'menu', specials: 'menu', style: 'menu', micToggle: 'menu',
} as const satisfies Record<string, 'strip' | 'line' | 'menu'>;
