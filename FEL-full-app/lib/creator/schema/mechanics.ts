// THE ANIMATION SLOTS (2026-09-14). Spec §3, and the section with the most substrate already under it.
//
// "Requirement: slots gated by attribute + body-measurement thresholds." That gate already exists and is
// load-bearing: `HandleSystem.MOVE_HANDLE` prices every dribble move by Ball Handle and `hasMove()` is the
// check. The audit's instruction was to EXTEND that rather than invent a parallel slot gate, so the
// dribble tab's thresholds below are MOVE_HANDLE's own numbers, not new ones. If they ever disagree, the
// game and the creator would be telling a player two different things about the same move.
//
// DONOR SLOTS REFERENCE FEL MOTION SETS, NEVER REAL ATHLETES — the spec's own first line. The base and
// release names follow its suggested biomechanical axis (Loaded Hinge, Vertical Stack, Whip, Long Lever),
// which is the right call for a second reason it does not give: a set named after a person is a set that
// has to be renamed when a licence lapses, and a set named after a movement never does.
//
// TABS 5 AND 6 WERE BLANK IN THE SPEC. Filled with the two the structure implies and that have real
// systems behind them already: DRIBBLE (HandleSystem's eleven moves, already gated) and SIGNATURE (the
// walk-out, which DunkMode already plays from the Music Room, plus the celebration).

import type { SlotRow, RatedRow, SectionTable, AnyRow } from './types';

/** Lower-body bases. Biomechanical, per the spec's naming axis. */
export const BASES = ['Loaded Hinge', 'Vertical Stack', 'Drift Base', 'Coil', 'Flat Load'] as const;
/** Upper-body releases. */
export const RELEASES = ['Whip', 'Long Lever', 'Snap Set', 'High Point', 'Delayed Extension'] as const;
export const RELEASE_TIMING = ['Very Early', 'Early', 'Standard', 'Late', 'Very Late'] as const;
/** Finish packages, built from the trick vocabulary that actually ships (DunkSystem.DUNK_TRICKS). */
export const DUNK_PACKAGES = ['Power Base', 'Windmill Set', 'Eastbay Set', 'Scorpion Set', 'Cradle Set', 'Double Clutch Set'] as const;
export const LAYUP_PACKAGES = ['Standard', 'Euro Set', 'Hop Set', 'Floater Set', 'Reverse Set'] as const;
export const POST_SETS = ['Standard', 'Drop Step Set', 'Turnaround Set', 'Jump Hook Set'] as const;
export const CELEBRATIONS = ['Standard', 'Cold', 'To The Crowd', 'Teammates First'] as const;

const slot = (
  id: string, label: string, tab: string, options: readonly string[],
  allowNone: boolean, requires: SlotRow['requires'], glossary: string,
): SlotRow => ({ kind: 'slot', id, label, section: 'mechanics', tab, options, allowNone, requires, glossary });

/** The blend between two releases, 0–100. A rated row — the editor already renders those. */
const blend: RatedRow = {
  kind: 'rated', id: 'releaseBlend', label: 'Release Blend', section: 'mechanics', tab: 'Jump Shot',
  min: 0, max: 100, prqAxis: null,
  glossary: '0 is all of Release 1, 100 is all of Release 2. Anywhere between mixes them.',
};

/**
 * MOVE_HANDLE's own thresholds, re-stated as slot gates.
 *
 * Deliberately the same numbers as the game uses, not a parallel table — see the header. A dribble slot a
 * player can select but not perform would be the creator lying to them.
 */
const DRIBBLE_GATES: Array<[string, string, number, string]> = [
  ['dribbleBasic', 'Basic Package', 0, 'Crossover and hesitation. Everybody has these.'],
  ['dribbleInOut', 'In-and-Out Package', 40, 'Fake the cross and keep the hand.'],
  ['dribbleBetween', 'Between-the-Legs Package', 45, 'Through the legs, either direction.'],
  ['dribbleYoyo', 'Yo-Yo Package', 52, 'The ball on a string while you size him up.'],
  ['dribbleBehind', 'Behind-the-Back Package', 58, 'Around the back, changing hands and angle.'],
  ['dribbleSpin', 'Spin Package', 64, 'Turning your back through the move.'],
  ['dribbleSlip', 'Slip-and-Slide Package', 68, 'Past his hip once he has committed.'],
  ['dribbleDouble', 'Double Cross Package', 72, 'Two crosses in one beat.'],
  ['dribbleSnatch', 'Snatch-Back Package', 80, 'Pull it back into your own shot.'],
  ['dribbleShamm', 'Shamm Package', 88, 'Push it out and take it back before he can.'],
  ['dribbleOffHead', 'Off-the-Head Package', 92, 'Off him, round him, and gone. The last thing you earn.'],
];

export const MECHANICS: SectionTable<AnyRow> = {
  section: 'mechanics',
  title: 'Mechanics',
  rows: [
    // ── Jump Shot ───────────────────────────────────────────────────────────────────────────────────
    slot('jsBase', 'Base / Lower', 'Jump Shot', BASES, false, null, 'How the legs load and leave the floor.'),
    slot('jsRelease1', 'Upper Release 1', 'Jump Shot', RELEASES, false, null, 'The primary arm action.'),
    blend,
    slot('jsRelease2', 'Upper Release 2', 'Jump Shot', RELEASES, false, null, 'The arm action blended against the first.'),
    slot('jsTiming', 'Release Timing', 'Jump Shot', RELEASE_TIMING, false, null, 'Where in the jump the ball leaves. Moves the green window with it.'),

    // ── Jump Shot II ────────────────────────────────────────────────────────────────────────────────
    slot('jsFreeThrow', 'Free Throw', 'Jump Shot II', BASES, false, null, 'The unguarded routine from the stripe.'),
    slot('jsGoTo', 'Go-To Shot', 'Jump Shot II', RELEASES, false, { attribute: 'shotIq', min: 70 }, 'The one he takes when it matters.'),
    slot('jsPullUp', 'Dribble Pull-Up', 'Jump Shot II', RELEASES, false, { attribute: 'ballHandle', min: 60 }, 'Rising out of a live dribble.'),
    slot('jsSpin', 'Spin Jumper', 'Jump Shot II', RELEASES, true, { attribute: 'ballHandle', min: 64 }, 'Spinning into the shot.'),
    slot('jsHop', 'Hop Jumper', 'Jump Shot II', RELEASES, true, { attribute: 'agility', min: 60 }, 'Hopping into the shot.'),
    slot('jsStepThrough', 'Step-Through', 'Jump Shot II', RELEASES, true, { attribute: 'postControl', min: 60 }, 'Stepping through contact into the shot.'),

    // ── Finishes ────────────────────────────────────────────────────────────────────────────────────
    slot('finLayup', 'Layup Package', 'Finishes', LAYUP_PACKAGES, false, null, 'How he finishes soft at the rim.'),
    slot('finDunk1', 'Primary Dunk Package', 'Finishes', DUNK_PACKAGES, false, { attribute: 'drivingDunk', min: 60 }, 'His first-choice dunk.'),
    slot('finDunk2', 'Dunk Package 2', 'Finishes', DUNK_PACKAGES, true, { attribute: 'drivingDunk', min: 70 }, 'A second dunk set. May be left empty.'),
    slot('finDunk3', 'Dunk Package 3', 'Finishes', DUNK_PACKAGES, true, { attribute: 'drivingDunk', min: 78 }, 'A third dunk set. May be left empty.'),
    slot('finDunk4', 'Dunk Package 4', 'Finishes', DUNK_PACKAGES, true, { attribute: 'drivingDunk', min: 85 }, 'A fourth dunk set. May be left empty.'),
    slot('finDunk5', 'Dunk Package 5', 'Finishes', DUNK_PACKAGES, true, { attribute: 'drivingDunk', min: 92 }, 'A fifth dunk set. May be left empty.'),

    // ── Post Game ───────────────────────────────────────────────────────────────────────────────────
    slot('postFade', 'Post Fade', 'Post Game', POST_SETS, false, { attribute: 'postFade', min: 55 }, 'The turnaround away from the rim.'),
    slot('postHook', 'Post Hook', 'Post Game', POST_SETS, false, { attribute: 'postHook', min: 55 }, 'The hook over either shoulder.'),
    slot('postHopShot', 'Post Hop Shot', 'Post Game', POST_SETS, true, { attribute: 'postControl', min: 62 }, 'Hopping into the shot from the post.'),
    slot('postGoTo', 'Post Go-To', 'Post Game', POST_SETS, false, { attribute: 'postControl', min: 70 }, 'His first move with his back to the rim.'),

    // ── Dribble (tab 5, blank in the spec) — MOVE_HANDLE's own gates ─────────────────────────────────
    ...DRIBBLE_GATES.map(([id, label, min, gloss]) =>
      slot(id, label, 'Dribble', ['Standard', 'Quick', 'Wide', 'Low'], min > 0,
        min > 0 ? { attribute: 'ballHandle', min } : null,
        `${gloss} Needs Ball Handle ${min}.`)),

    // ── Signature (tab 6, blank in the spec) ────────────────────────────────────────────────────────
    slot('sigWalkOut', 'Walk-Out', 'Signature', ['Standard', 'From My Music Room'], false, null,
      'What plays when you walk out. "From My Music Room" uses the track you authored.'),
    slot('sigCelebration', 'Celebration', 'Signature', CELEBRATIONS, false, null, 'What he does after a big one.'),
  ],
};

/** The gate a slot names, for the resolver — data, so a new slot needs no resolver change. */
export function slotGate(row: AnyRow): { attribute: string; min: number } | null {
  return row.kind === 'slot' ? row.requires : null;
}
