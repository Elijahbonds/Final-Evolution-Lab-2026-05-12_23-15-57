// firstRun — the first-run and menu screens in one finish (look-screens, phase A3 (b)-(f) of docs/LOOK-PASS-AUDIT.md, findings 5, 7,
// 9, 10, 17; owner 2026-11-24: "Let's do a pass where we improve how things look."). Layout and the shipped look only: not a word,
// a rule or an age question changes (tests pin the words).
//
// WHAT WAS MEASURED (scripts/probes/look-audit/look-walk.mts, before this file):
//   /try          the guest's birth-date step is a bare form on black, 60 % of the screen empty, while /signup asks the same question
//                 on the card with the crest and the glow (b1-portrait-try.jpg against b1-portrait-signup.jpg);
//   home sideways the headline fills an 844 x 390 phone and PLAY NOW is below the fold (b1-landscape-home.jpg);
//   /login        the chosen venue card's glow is cut flat at the carousel's bottom edge (the rail scrolls sideways, so it clips);
//   /play upright "FEL" alone on a row, then an empty level ring with a dash, the wallet and sign-out on a second; six chips wrapped
//                 in ragged rows (b1-portrait-play.jpg);
//   Dunk, 3-Point the "USB controller? Plug it in…" line is drawn over the loading card's venue line (b1-portrait-dunk-a-loading.jpg);
//   end card      "SHOOTOUT COMPLETE · 6 PTS VS / 19": the title's last word alone on its line (b1-portrait-threepoint-e-end.jpg).
//
// Knobs (lib/feel-panel/knobs.ts), each 1 = this lane's look, 0 = the screen exactly as before. The pages here are not /play/<mode>
// playtest runs, so the feel panel's overrides never reach them (lib/feel-panel/sessionGate.ts): these are the shipped values,
// changed by a commit, and the tests pin both ends.
//   `ui.firstRunCard`       /try's birth date on the sign-up card (crest, card, glow); the home hero fits a sideways phone; the
//                           sign-in carousel's glow is not clipped.
//   `ui.compactAppHeader`   the app's top rail shows the level ring only with a number (the wallet keeps its own row on a phone: on
//                           the wordmark's row its count-up could wrap the row mid-load); /play's six doors are a two-column grid.
//   `ui.cardOverlapFixes`   the USB line goes into the "⋯" menu on an upright phone while the card is up (it sat on the venue line);
//                           the end card's title wraps balanced, so no word is left alone on a line.
import { feel } from '@/lib/feel-panel/feel';

export const FIRST_RUN_CARD = 1;
export const firstRunCard = (): boolean => feel('ui.firstRunCard', FIRST_RUN_CARD) >= 0.5;

export const COMPACT_APP_HEADER = 1;
export const compactAppHeader = (): boolean => feel('ui.compactAppHeader', COMPACT_APP_HEADER) >= 0.5;

export const CARD_OVERLAP_FIXES = 1;
export const cardOverlapFixes = (): boolean => feel('ui.cardOverlapFixes', CARD_OVERLAP_FIXES) >= 0.5;

/** The home hero on a short sideways screen (a phone held sideways): the headline at the phone display size, wider, less top room. */
export const HERO_SHORT_LANDSCAPE_CLASS = {
  box: '[@media(orientation:landscape)_and_(max-height:520px)]:pt-6',
  title: '[@media(orientation:landscape)_and_(max-height:520px)]:!text-[44px] [@media(orientation:landscape)_and_(max-height:520px)]:max-w-[26ch]',
} as const;

/** The sign-in carousel's rail: room under the cards for the chosen card's glow (its shadow reaches about 40 px below the card), taken
 *  back by a negative margin so nothing under the rail moves. */
export const RAIL_GLOW_CLASS = 'pb-10 -mb-8';
