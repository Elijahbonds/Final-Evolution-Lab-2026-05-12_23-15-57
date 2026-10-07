// PANEL LINES — the CONTROLS panel's own short words for a mode whose static hint is too long to read on the READY
// card or the pause (controls-screen-2, console-view lane, 2026-10-06).
//
// Owner, replying to the controls-screen report: "Yes to both proposed fixes for texts and impeding gameplay view." The
// fix for the texts: the 1v1 list was ~25 lines and the 3v3's long too; on a sideways phone they scrolled inside the
// panel, and a pad cannot scroll. So the panel shows a curated few lines per mode instead of the mode's whole hint split
// at its dots — "short and readable", and on one screen with nothing to scroll at 844x390, 1280x720 and 1080p.
//
// WHY A SEPARATE LIST, and not a shorter hint in the mode: the mode files are other lanes' (the hoops lane owns
// OneVOneMode / ThreeVThreeMode). Their static hints still leave the play screen through staticControls.ts, word for
// word; this file only decides what the PANEL says in their place. Each line is said in the device-neutral words the
// panel's rows above it already map to a button (SHOOT, PASS, BLOCK …), or in the mode's own pad (keys) words — so a
// pad, a keyboard and a touch screen read the same list, and the rows say which button is which on theirs.
//
// What is left out is the depth a player finds in play (every dribble move's direction, the escape names, each post
// move): the lines are the essentials the brief named — move, sprint, shoot, pass / fake, dunk / lay-up, screen, post
// moves in one line, defence.
//
// lib/ui/controlsScreen.ts reads this before the static hint (controlLines); panelLines.test.ts holds every entry to a
// mode that exists, to the line budget, and (for a mode with static lines) to covering the same verbs.
//
// HOOPS PAUSE (2026-10-06): the owner then picked "Hoops pause: Controls panel only" — the 1v1 and 3v3 short lists that
// sat here are replaced by their full OFFENSE / DEFENSE lists, as titled groups (PANEL_GROUPS below).

import { SKATE_BODY_BOOST_HINT, KART_BODY_BOOST_HINT, AERO_BODY_BOOST_HINT } from '../modes/rideHud';
import { CONTROLS_OFFENCE as ONES_OFFENCE, CONTROLS_DEFENCE as ONES_DEFENCE } from '../modes/onevoneRules';
// (threevthreeControls, not threevthreeRules: the rules file imports BasketballCore — Babylon — and this panel is under every splash)
import { CONTROLS_OFFENCE as THREES_OFFENCE, CONTROLS_DEFENCE as THREES_DEFENCE } from '../modes/threevthreeControls';
import { STATIC_CONTROLS } from './staticControls';

export interface PanelLines {
  /** The pad / keys / touch list. */
  lines: readonly string[];
  /** The list while the body plays. Without one, a mode that has body words (staticControls) shows those, split. */
  body?: readonly string[];
}

/** Most lines a curated list may hold (the brief: 4–8 for the hoops modes, until their PANEL_GROUPS; fewer elsewhere). */
export const PANEL_MAX_LINES = 8;
/** Longest a curated line may be: one row of the panel's mono text at its narrowest (a sideways phone). */
export const PANEL_MAX_CHARS = 52;

export const PANEL_LINES: Readonly<Record<string, PanelLines>> = {
  // ── hoops: no short list here any more — the panel carries their full OFFENSE / DEFENSE lists (PANEL_GROUPS below) ──
  // ── the sweep: every other mode whose panel cut lines off on a sideways phone (controls-screen-2 probe), or whose
  //    lines only restated a row above them. The mode's own words, merged and with the repeats of its rows dropped. ──
  // the endless dojo's strings (rows: JAB · KICK · DASH · HEAVY): 11 lines → 5
  karate: {
    lines: [
      'STRINGS: A A A · A A B WHIRLWIND · A B Y HAMMER',
      'B B Y TYPHOON · stick AT a body + Y = RUSH',
      'pull back + B = SPIN BACK KICK · R1 = CHI BURST',
      'tap BLOCK late on a wind-up = COUNTER',
      'land 8 = TAKEDOWN (L1) · L1 on a stagger = GRAB',
    ],
  },
  // rows: STRIKE · KICK · DASH · HEAVY; the second line wrapped
  mixedcombat: {
    lines: [
      'Knock them past the glowing edge for a RING OUT',
      'side-step verticals (A/Y) · sweep (B) a stepper',
      'tap GUARD at the last instant to parry',
      'full CHI + Y = the DRAGON',
    ],
  },
  // INTEGRATION (2026-10-06, integration-2): the combat lane gave Karate VS every control in one line (9 lines split, three of
  // them its JAB / KICK / HEAVY rows again), and changed Showdown's L1 (a chakra charge, not a dash-cancel) and Duel's X (tap
  // steps, hold blocks). These lists are those new words, merged the same way; the old ones taught buttons that changed.
  // rows: JAB · KICK · DASH · HEAVY
  karate_vs: {
    lines: [
      'hold X guard, press it at the last instant to parry',
      'tap X dash, double-tap chakra dash',
      'L1 roll · R1 jump',
      'hold R2 Focus (L1 into a wall: wall run)',
      'full chi + an ELITE body: HEAVY becomes the DRAGON',
    ],
  },
  // rows: ORBIT (the stick) · FISTS · BLADE · BLOCK · STAFF
  duel: { lines: ['tap X step, double-tap X close in', 'hold X block — flick TOWARD them at impact', 'for GUARD IMPACT · hold R2 focus', 'knock them OFF the edge'] },
  showdown: { lines: ['X tap dash · hold X guard · hold L1 charge chakra', 'R1 substitute their strike · SELECT assist', 'R2 focus · full chakra + Y = ULTIMATE'] },
  // rows: MOVE · SLAM · STYLE · PROP · RUN · LOOK (its "LOOK stick orbits the camera" was the LOOK row again)
  dunkduel: { lines: ['STYLE to cycle · HOLD to run — then tap jump', 'X / D-PAD down picks the CAR, BARRIER or CRATE'] },
  // rows: MOVE · JUMP · SLIDE · FLIP / KICK · OVERDRIVE: 8 lines → 3
  freerun: { lines: ['RT SPRINT · LB GRAPPLE · R-stick TRICKS', 'A JUMP / VAULT / REBOUND / WALL RUN', 'LT or B SLIDE'] },
  // rows: SPIN · STOMP · STRIDES · BOOST. INTEGRATION (2026-10-06, integration-2): the board lane's one-line card (bigAirPlay
  // AIR_HINT) added X GRAB and Y BIG SPIN; its stride and boost words are the rows above.
  bigair: {
    lines: [
      'AIR: ◀ ▶ SIDE · A SPIN, A PLANT',
      'X GRAB · Y BIG SPIN (stick picks) · B STOMP',
    ],
  },
  // the rides: the gas, brake, fire and boost were each a row above as well (body: its own words, staticControls)
  velocitykart: { lines: ['X drift to fill BOOST · hold RB / Shift to burn it', 'A fires your item'] },
  aeroaces: { lines: ['B: roll, back=loop, fwd=split-s', 'Y: loop, +stick=knife edge'] },
  skateboard: { lines: ['HOLD FORWARD to push · POP to ollie', 'B to MANUAL · GRIND the rails'] },
  // (the surf's "R2 drives" is the CARVE row; its pocket line the one left out: the wave shows you the pocket)
  surf: { lines: ['pull BACK to climb, push to drop in · miss the buoys'] },
  snowboard_slalom: { lines: ['Between the poles for 100 · JUMP rocks · grind rails'] },
  // rows: MOVE · TRUCK …; the slingshot meter's "DRAFT → SLINGSHOT (L1)" caption came off the play screen to here
  football: { lines: ['Juke, spin, hurdle — or HOLD TRUCK and run THROUGH', 'DRAFT behind a blocker to fill the SLINGSHOT (L1)'] },
  // rows: AIM · SWING · CLUB · PAD
  golf: {
    lines: [
      'L-STICK turns the ARROW (the ring is a full swing)',
      'A starts the swing · A at the top for POWER',
      'A in the band · B cycles CLUB',
      'or pull the stick back, drive it STRAIGHT through',
      'drift off line hooks / slices',
    ],
  },
  // rows: ANSWER A–D. Split at its dots the quiz line came apart into 'A', 'B', 'X', 'Y pick the answer …'
  who_scene_it: {
    lines: [
      'pick the answer — faster is worth more',
      'P1: A B X Y · P2: ▲ ▶ ◀ ▼ (arrows)',
      'first right answer takes it',
      'a wrong one hands the steal over',
    ],
  },
};

/**
 * A titled group of the panel's lines: a heading and a list in its mode's own words (split at its dots by the panel,
 * lib/ui/controlsScreen.ts splitHint — the post-up's bracketed moves stay one line).
 */
export interface PanelGroup {
  title: string;
  /** The heading's colour (the hosts' old pause list: OFFENSE cyan, DEFENSE gold). */
  color: string;
  /** The list, exactly as the mode's rules file writes it. */
  text: string;
}

/**
 * HOOPS PAUSE (2026-10-06). Owner (multiple choice): "Hoops pause: Controls panel only". The 1v1 and 3v3 pause showed TWO
 * lists — the hoops lane's full OFFENSE / DEFENSE list along the bottom (its picks 1v1 #1 / 3v3 #7: "put the full list in
 * pause") and this panel's short list over it. Now ONE: this panel, the same as every other mode, carrying the full lists
 * in two groups, in the rules files' own words (CONTROLS_OFFENCE / CONTROLS_DEFENCE, word for word: nothing to drift).
 *
 * This sets aside the line budget above for these two modes, by the owner's pick: the 1v1's offence is 16 lines and some
 * wrap, so on a sideways phone (by estimate also at 1280x720; not measured in a browser) the lines scroll inside the panel's box — a finger or a wheel scrolls
 * them; the pause's tap still resumes. The rows and the headings stay put above and in the list.
 */
export const PANEL_GROUPS: Readonly<Record<string, readonly PanelGroup[]>> = {
  onevone: [
    { title: 'OFFENSE', color: 'var(--fel-cyan)', text: ONES_OFFENCE },
    { title: 'DEFENSE', color: 'var(--fel-gold)', text: ONES_DEFENCE },
  ],
  threevthree: [
    { title: 'OFFENSE', color: 'var(--fel-cyan)', text: THREES_OFFENCE },
    { title: 'DEFENSE', color: 'var(--fel-gold)', text: THREES_DEFENCE },
  ],
};

/**
 * The body's boost line for a speed mode, on the panel. The boost gauge used to say it under the meter during play
 * (`boostHint`, "LANDINGS FILL IT · RB ON PAD / TOUCH"); the owner took the gauge's caption off the play screen
 * (2026-10-06: "the meter itself stays … with no instruction text"), so a body player reads it here before START. The
 * pad, the keys and touch have their BOOST row (cardSlot's buttonMap) and need no line.
 */
export const BODY_BOOST_LINE: Readonly<Record<string, string>> = {
  skateboard: `BOOST: ${SKATE_BODY_BOOST_HINT}`,
  velocitykart: `BOOST: ${KART_BODY_BOOST_HINT}`,
  aeroaces: `BOOST: ${AERO_BODY_BOOST_HINT}`,
  // SnowboardSlalomMode's hudFor says it inline ('FILLS FROM GATES + TRICKS'); panelLines.test holds the two together
  snowboard_slalom: 'BOOST: FILLS FROM GATES + TRICKS · RB ON PAD / TOUCH',
};

/**
 * The curated list for a mode, or null — the panel then splits the static hint. While the body plays: the curated body
 * list; else null when the mode has body words of its own (the kart's "Grip the wheel …", which the pad list must not
 * replace); else the pad list (a mode the body plays with the pad's words).
 */
export function panelLinesFor(modeKey: string, body = false): string[] | null {
  const p = PANEL_LINES[modeKey];
  if (!p) return null;
  if (body && p.body) return [...p.body];
  if (body && STATIC_CONTROLS.some((l) => l.mode === modeKey && l.body)) return null;
  return [...p.lines];
}
