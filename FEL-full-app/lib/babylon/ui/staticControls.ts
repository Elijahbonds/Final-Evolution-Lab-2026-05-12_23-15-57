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
  // INTEGRATION (2026-10-06, integration-2): the 3v3 and 1v1 maps that sat here are gone from the modes. The owner's picks for
  // the hoops lane (1v1 #1, 3v3 #7: "show one line keyed to the current state … and put the full list in pause") replaced
  // them with ONE line for the state you are in (onevoneRules / threevthreeRules hintFor): live prompts by this file's own
  // rule, listed on the scan's LIVE side. The panel shows the curated hoops lists (panelLines.ts), which never read these.
  { mode: 'dunk', file: 'DunkMode.ts', text: 'HOLD to run · tap JUMP at the line — then SLAM on NOW!' },
  { mode: 'dunkduel', file: 'DunkDuelMode.ts', text: 'STYLE to cycle · X / D-PAD down picks the CAR, BARRIER or CRATE · LOOK stick orbits the camera · HOLD to run — then tap jump' },
  // ── combat ──
  { mode: 'karate', file: 'KarateEndlessMode.ts', text: 'Strings: A A A · A A B WHIRLWIND · A B Y HAMMER · B B Y TYPHOON · stick AT a body + Y = RUSH · pull back + B = SPIN BACK KICK · L1 on a staggered body = GRAB (A swing · Y throw) · tap BLOCK late on a wind-up = COUNTER · land 8 = TAKEDOWN (L1) · a miss or a hit taken breaks the flow · R1 = CHI BURST' },
  { mode: 'karate_vs', file: 'KarateVSMode.ts', text: 'A jab · B kick · Y heavy · hold X guard, press it at the last instant to parry · tap X dash, double-tap chakra dash · L1 roll · R1 jump · hold R2 Focus (L1 into a wall: wall run) · full chi + an ELITE body: HEAVY becomes the DRAGON' },
  { mode: 'showdown', file: 'ShowdownMode.ts', text: 'X tap dash · hold X guard · hold L1 charge chakra · R1 substitute their strike · SELECT assist · R2 focus · full chakra + Y = ULTIMATE' },
  { mode: 'mixedcombat', file: 'MixedCombatMode.ts', text: 'Knock them past the glowing edge for a RING OUT · side-step verticals (A/Y), punish steppers with the sweep (B) · tap GUARD at the last instant to parry · full CHI + Y = the DRAGON' },
  { mode: 'duel', file: 'duelRules.ts', text: 'Stick orbits your foe · A / B / Y strike · tap X step, double-tap X close in · hold X block — flick TOWARD them at impact for GUARD IMPACT · hold R2 focus · knock them OFF the edge' },
  // ── race / ride ──
  { mode: 'freerun', file: 'FreeRunMode.ts', text: 'stick RUNS · RT SPRINT · A JUMP / VAULT / REBOUND / WALL RUN · LT or B SLIDE · X FLIP / KICK · Y OVERDRIVE · LB GRAPPLE · R-stick TRICKS' },
  { mode: 'football', file: 'FootballRushMode.ts', text: 'Juke, spin, hurdle — or HOLD TRUCK and run THROUGH them' },
  // the sprint's line follows the race (SprintMode hintFor): the run's map is static; before GO ("Do NOT tap before GO …")
  // and the last 20 m's dip call are live prompts, and stay.
  { mode: 'sprint', file: 'SprintMode.ts', text: 'Alternate D-PAD ←/→ — tap as the ring closes.' },
  { mode: 'bigair', file: 'bigAirPlay.ts', text: '◀ ▶ STRIDE · HOLD RB BOOST · AIR: ◀ ▶ SIDE · A SPIN, A PLANT · X GRAB · Y BIG SPIN (stick picks) · B STOMP' },
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
  { mode: 'golf', file: 'precisionModes.ts', text: 'L-STICK turns the ARROW (the ring is a full swing) · A starts the swing · A at the top for POWER · A in the band · B cycles CLUB · or pull the stick back and drive it STRAIGHT through (drift off line hooks / slices)' },
  { mode: 'derby', file: 'precisionModes.ts', text: 'STRIKE as it crosses the plate · read the break' },
  // ── party ──
  { mode: 'who_scene_it', file: 'WhoSceneItMode.ts', text: 'A · B · X · Y pick the answer — faster is worth more' },
  { mode: 'who_scene_it', file: 'WhoSceneItMode.ts', text: 'P1: A · B · X · Y   ·   P2: ▲ ▶ ◀ ▼ (arrows)   ·   first right answer takes it, a wrong one hands the steal over' },
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
