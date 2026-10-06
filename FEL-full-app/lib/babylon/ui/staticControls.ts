// STATIC CONTROLS — the button maps a mode used to print across the bottom of the screen while you play
// (controls-screen, console-view lane, 2026-10-06).
//
// Owner, verbatim: "Can we take off that wall of text when the game starts, maybe have that show as a beginning screen
// for the controls." Owner's picks: during play NOTHING — the controls show on a screen BEFORE START, and pausing shows
// the same screen again; EVERY mode, one shared controls screen in the shell.
//
// So there are two kinds of `hint` a mode writes through ctx.setHud, and only one of them leaves the play screen:
//   (a) STATIC controls text — a button map that says the same thing whatever is happening ("HOLD R2 (SHIFT) + a
//       direction to SPRINT · …", "Stick orbits your foe · X block …"). Those are listed here, word for word. The harness
//       (ModeHarness setHud) hands the host `hint: ''` in their place, and the READY card and the pause (ControlsPanel)
//       show them instead, split into lines.
//   (b) LIVE prompts — what to do NOW: "NOW!", "CATCH IT!", "DEFEND — …", "READ THE FRONT — push ▲/W to SNAP", a
//       picker's "◀ ▶ … any face button starts", a tutorial line that reacts to the run. Not listed here, so they pass
//       straight through, exactly as before.
//
// WHY A LIST OF STRINGS, and not an edit in each mode: the mode files are owned by other lanes and are being edited in
// parallel; the shell owns the presentation. A string listed here that drifts from its mode (someone rewords it) would
// silently come back on the play screen, so lib/ui/controlsScreen.scan.test.ts holds every entry to its source file, and
// classifies every `hint:` literal in every mode file as static (here) or live (its allow-list): a new hint has to be
// sorted before it ships.

import {
  SKATE_PAD_HINT, SKATE_BODY_HINT, KART_PAD_HINT, KART_BODY_HINT, AERO_PAD_HINT, AERO_BODY_HINT,
} from '../modes/rideHud';

export interface StaticControlsLine {
  /** Registry key of the mode that writes it (lib/babylon/modes/registry.ts; the card slot's `slotModeKey`). */
  mode: string;
  /** The hint, exactly as the mode writes it. */
  text: string;
  /** The words for a player using body play (shown on the controls screen only while the body is on). */
  body?: true;
  /** The mode file that writes it (relative to lib/babylon/modes), for the source guard. */
  file: string;
  /** A shorter repeat of a line above it (the 3v3's "Work the court" after a stop): kept off the play screen like the
   *  rest, but not listed a second time on the controls screen. */
  repeat?: true;
}

export const STATIC_CONTROLS: readonly StaticControlsLine[] = [
  // ── hoops ──
  { mode: 'threevthree', file: 'ThreeVThreeMode.ts', text: 'HOLD R2 (SHIFT) + a direction to SPRINT · R2 + SQUARE (SHIFT + L) at the rim = DUNK, SQUARE (L) alone = LAY IT IN · SQUARE (L): hold, release in the green · BOTTOM BUTTON (J): PASS (hold to FAKE) · CIRCLE (K): call a SCREEN · L2 (F): POST UP (L2/L1 · shoot = HOOK · stick off the rim = FADE, with R2 = SHIMMY FADE · stick at the rim = DROP STEP · stick across = SPIN · let go early = PUMP, then shoot = UP AND UNDER) · snap the stick to break ankles' },
  { mode: 'threevthree', file: 'ThreeVThreeMode.ts', repeat: true, text: 'Work the court · BOTTOM BUTTON (J) passes · CIRCLE (K) calls a screen · HOLD SQUARE (L), release in the green' },
  { mode: 'onevone', file: 'OneVOneMode.ts', text: 'HOLD R2 (SHIFT) + a direction to SPRINT · R2 + SQUARE (SHIFT + L) at the rim = DUNK, SQUARE (L) alone = LAY IT IN · SQUARE (L): hold, release in the green · L2 (F): POST UP · RIGHT STICK (2K, relative to the ball hand): flick TOWARD the ball = hesi · AWAY = between the legs · UP-AWAY = crossover · UP = in and out · DOWN-AWAY = behind the back · DOWN = STEP-BACK (shoot inside it = the step-back jumper) · UP-TOWARD = size-ups · ROTATE = SPIN · hold R2 with any of them = the ESCAPE (crossover → momentum cross · down → the SNATCHBACK · rotate → the STEEZO ROLL) · hold the stick = PAUSIN · hold L2 (F) or L1 (Q) near the block to POST UP (back to the rim: SQUARE = HOOK · stick OFF the rim + SQUARE = FADE, with R2 = SHIMMY FADE · stick AT the rim + SQUARE = DROP STEP · swing the stick across = SPIN · let go early = PUMP FAKE, then SQUARE again = UP AND UNDER) · drive into a body to SPIN off him' },
  { mode: 'onevone', file: 'OneVOneMode.ts', text: 'STAY IN FRONT — they sidestep, you slide · HOLD L2 (F): SIT DOWN and slide faster · SQUARE (L): STEAL as the ball crosses over (hold it for a HAND UP) · TRIANGLE (I): jump on the gather to BLOCK · HOLD CIRCLE (K): plant and TAKE THE CHARGE · L1: BOX OUT' },
  { mode: 'dunk', file: 'DunkMode.ts', text: 'HOLD to run · tap JUMP at the line — then SLAM on NOW!' },
  { mode: 'dunkduel', file: 'DunkDuelMode.ts', text: 'STYLE to cycle · X / D-PAD down picks the CAR, BARRIER or CRATE · LOOK stick orbits the camera · HOLD to run — then tap jump' },
  { mode: 'dunkduel', file: 'DunkDuelMode.ts', repeat: true, text: 'STYLE to cycle · LOOK stick orbits the camera · HOLD to run — then tap jump' },
  // ── combat ──
  { mode: 'karate', file: 'KarateEndlessMode.ts', text: 'Strings: A A A · A A B WHIRLWIND · A B Y HAMMER · B B Y TYPHOON · stick AT a body + Y = RUSH · pull back + B = SPIN BACK KICK · L1 on a staggered body = GRAB (A swing · Y throw) · tap BLOCK late on a wind-up = COUNTER · land 8 = TAKEDOWN (L1) · a miss or a hit taken breaks the flow · R1 = CHI BURST' },
  { mode: 'karate_vs', file: 'KarateVSMode.ts', text: 'Chain hits for combos · tap BLOCK at the last instant to parry · full chi turns HEAVY into the DRAGON' },
  { mode: 'showdown', file: 'ShowdownMode.ts', text: 'L1 dash-cancel (chi) · R1 substitute their strike · SELECT assist · full chi + Y = ULTIMATE' },
  { mode: 'mixedcombat', file: 'MixedCombatMode.ts', text: 'Knock them past the glowing edge for a RING OUT · side-step verticals (A/Y), punish steppers with the sweep (B) · tap GUARD at the last instant to parry' },
  { mode: 'duel', file: 'DuelMode.ts', text: 'Stick orbits your foe · X block — tap+flick TOWARD them at impact for GUARD IMPACT · knock them OFF the disc' },
  // ── race / ride ──
  { mode: 'freerun', file: 'FreeRunMode.ts', text: 'stick RUNS · RT SPRINT · A JUMP / VAULT / REBOUND / WALL RUN · LT or B SLIDE · X FLIP / KICK · Y OVERDRIVE · LB GRAPPLE · R-stick TRICKS' },
  { mode: 'football', file: 'FootballRushMode.ts', text: 'Juke, spin, hurdle — or HOLD TRUCK and run THROUGH them' },
  { mode: 'sprint', file: 'SprintMode.ts', text: 'Alternate D-PAD ←/→ in rhythm. Do NOT tap before GO.' },
  { mode: 'bigair', file: 'AirSessionMode.ts', text: 'D-PAD ←/→ alternate strides · HOLD RB/SHIFT boost the run-in (bigger pop) · in the air ←/→ picks backside/frontside · A starts the spin, A again plants it — land on a half turn · B stick the landing' },
  { mode: 'surf', file: 'SurfBreakMode.ts', text: 'Ride the pocket under the lip · pull BACK to climb, push to drop in · R2 drives · hold RB / Shift to BOOST · miss the buoys' },
  { mode: 'snowboard_slalom', file: 'SnowboardSlalomMode.ts', text: 'Between the poles for 100 · JUMP rocks · grind the rails · hold RB / Shift to BOOST' },
  { mode: 'snowboard_slalom', file: 'SnowboardSlalomMode.ts', body: true, text: 'Lean to carve between the poles · crouch to tuck · hop to jump · a hand to the board grabs · turn your shoulders to spin' },
  { mode: 'skateboard', file: 'rideHud.ts', text: SKATE_PAD_HINT },
  { mode: 'skateboard', file: 'rideHud.ts', body: true, text: SKATE_BODY_HINT },
  // the kart and the plane: after GO. Before it the line is the rocket start's timing (a live prompt), and stays.
  { mode: 'velocitykart', file: 'rideHud.ts', text: KART_PAD_HINT },
  { mode: 'velocitykart', file: 'rideHud.ts', body: true, text: KART_BODY_HINT },
  { mode: 'aeroaces', file: 'rideHud.ts', text: AERO_PAD_HINT },
  { mode: 'aeroaces', file: 'rideHud.ts', body: true, text: AERO_BODY_HINT },
  // ── precision ──
  { mode: 'golf', file: 'precisionModes.ts', text: 'L-STICK turns the ARROW (the ring is a full swing) · A starts the swing · A at the top for POWER · A in the band · B cycles CLUB · or pull the stick back and drive through' },
  { mode: 'derby', file: 'precisionModes.ts', text: 'STRIKE as it crosses the plate · read the break' },
  // ── party ──
  { mode: 'who_scene_it', file: 'WhoSceneItMode.ts', text: 'A · B · X · Y pick the answer — faster is worth more' },
  { mode: 'who_scene_it', file: 'WhoSceneItMode.ts', text: 'P1: A · B · X · Y   ·   P2: ▲ ▶ ▼ ◀ (arrows)   ·   first right answer takes it, a wrong one hands the steal over' },
];

const STATIC_SET: ReadonlySet<string> = new Set(STATIC_CONTROLS.map((l) => l.text));

/** True for a hint that is one of the static button maps above (and so never drawn during play). */
export function isStaticControlsHint(hint: unknown): boolean {
  return typeof hint === 'string' && STATIC_SET.has(hint);
}

/**
 * A HUD update as the host should get it: a static controls hint becomes `''`. Blank, not dropped: the hosts MERGE
 * updates, so an earlier live prompt ("DEFEND — …") must be cleared by the static line that used to replace it.
 * Returns the same object when there is nothing to strip.
 */
export function stripStaticControls<T extends Record<string, unknown>>(update: T): T {
  return isStaticControlsHint(update.hint) ? { ...update, hint: '' } : update;
}

/** The static lines a mode writes, for the controls screen: the pad / keys / touch words, or the body's. */
export function staticControlsFor(modeKey: string, body = false): string[] {
  const mine = STATIC_CONTROLS.filter((l) => l.mode === modeKey && !l.repeat);
  const pick = mine.filter((l) => !!l.body === body);
  return (pick.length ? pick : mine.filter((l) => !l.body)).map((l) => l.text);
}
