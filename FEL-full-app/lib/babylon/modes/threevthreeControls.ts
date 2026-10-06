// The 3v3's full control lists (IMPROVE 2026-10-06 #7: "put the full list in pause"), moved here verbatim from
// threevthreeRules.ts (HOOPS PAUSE, 2026-10-06), which re-exports them.
//
// Owner (2026-10-06, multiple choice): "Hoops pause: Controls panel only" — the pause shows ONE controls list, the shared
// CONTROLS panel, the same as every other mode; these two lists are its OFFENSE and DEFENSE groups for the 3v3
// (lib/babylon/ui/panelLines.ts PANEL_GROUPS). WHY A FILE OF ITS OWN: the panel sits under every host's splash and the
// body-play layer, and threevthreeRules imports BasketballCore (so @babylonjs/core); this file imports nothing.

/** Every control on offence (what the old always-on hint said, ~380 characters). The pause shows it, in the CONTROLS panel. */
export const CONTROLS_OFFENCE = 'HOLD R2 (SHIFT) + a direction to SPRINT · R2 + SQUARE (SHIFT + L) at the rim = DUNK, SQUARE (L) alone = LAY IT IN · SQUARE (L): hold, release in the green · BOTTOM BUTTON (J): PASS — lean the stick at a mate (hold to FAKE); off the ball it CALLS FOR IT · CIRCLE (K): call a SCREEN · L2 (F): POST UP (shoot = HOOK · stick off the rim = FADE, with R2 = SHIMMY FADE · stick at the rim = DROP STEP · stick across = SPIN · let go early = PUMP, then shoot = UP AND UNDER) · RIGHT STICK: the dribble moves · snap the stick to break ankles';
/** Every control on defence. */
export const CONTROLS_DEFENCE = 'STAY IN FRONT of the ball (the pink ring) · HOLD L2 (F): SIT DOWN and slide · SQUARE (L): POKE (hold it for a HAND UP) · TRIANGLE (I): jump on the gather to BLOCK · HOLD CIRCLE (K): plant and TAKE THE CHARGE · L1 (Q): BOX OUT on a shot';
