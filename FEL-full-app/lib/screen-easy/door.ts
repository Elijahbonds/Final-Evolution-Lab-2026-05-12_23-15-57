// door — the full Quick Screen's front door from inside the app (SCREEN-EASY, 2026-10-28; owner: "Screening needs to be
// faster and easier"). Train's Quick Screen card opened /screen, the QR start card, whose first button is now "Measure
// my vertical" — which Train has as its own card (lib/vertical/door.ts). So the card opens the full screen itself: one
// tap fewer, one screen and 73 words fewer before the camera. It is not a way past the screen's own steps: a ?run= start
// asks the age question first (lib/screen/minor-lock.test.tsx, "from a ?run= link"), then the pain question.
//
// /screen stays the QR address and the start card for the jump-or-full choice.
//
// Written as a literal so lib/nav/reachability.test.ts, which reads link literals, sees it.
export const FULL_SCREEN_HREF = '/play/mirror/assess?run=full';
