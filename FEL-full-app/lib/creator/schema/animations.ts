// ANIMATION PACKAGES (2026-10-01). A MyPlayer-style section on the SAME slot rows the generic editor
// already renders. Every option is a clip that already ships in lib/babylon/anim/authored — nothing here
// authors, downloads, or names a new mocap take.
//
// GATES ARE THE ONES THE GAME ALREADY HAS. Dribble moves use HandleSystem.MOVE_HANDLE (Ball Handle).
// Dunk packages use the Vertical attribute, which PRQ already caps through power — a dunk the body has
// not earned is a resolver violation, never a purchase. Nothing in this file has a price.
//
// WHAT 2K HAS THAT THESE CLIPS DO NOT is MISSING_VS_2K. That list is the report, not a promise to invent
// the footage.

import type { SlotRow, SectionTable } from './types';
import { MOVE_HANDLE, moveClip, type HandleMove } from '../../babylon/core/HandleSystem';

export interface ClipChoice {
  /** What the stepper shows. The stored value. */
  label: string;
  /** The authored clip id `CharacterAnimator.play` already knows. */
  clip: string;
}

export interface ChoiceGate {
  attribute: string;
  min: number;
}

const CHOICE_CLIP = new Map<string, string>();
const CHOICE_GATE = new Map<string, ChoiceGate>();

function register(choice: ClipChoice, gate: ChoiceGate | null): string {
  CHOICE_CLIP.set(choice.label, choice.clip);
  if (gate) CHOICE_GATE.set(choice.label, gate);
  return choice.label;
}

const slot = (
  id: string, label: string, tab: string, options: readonly string[],
  allowNone: boolean, requires: SlotRow['requires'], glossary: string, defaultOption?: string,
): SlotRow => ({
  kind: 'slot', id, label, section: 'animations', tab, options, allowNone, requires, glossary,
  ...(defaultOption ? { defaultOption } : {}),
});

/** The clip a stored choice plays, or null when the slot is empty or the label is not one we ship. */
export function clipForChoice(value: string | null | undefined): string | null {
  if (!value) return null;
  return CHOICE_CLIP.get(value) ?? null;
}

/** The attribute gate on a chosen package, or null when the choice is free. */
export function gateForChoice(value: string | null | undefined): ChoiceGate | null {
  if (!value) return null;
  return CHOICE_GATE.get(value) ?? null;
}

const titled = (move: string) => move.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

/** Dribble / size-up rows, one per handle move that already has a clip. Thresholds are MOVE_HANDLE's. */
function dribbleRows(): SlotRow[] {
  const rows: SlotRow[] = [];
  for (const move of Object.keys(MOVE_HANDLE) as HandleMove[]) {
    const min = MOVE_HANDLE[move];
    const right = moveClip(move, 'right');
    const left = moveClip(move, 'left');
    const clips = [...new Set([right, left].filter((c): c is string => !!c))];
    if (!clips.length) continue;
    const gate: ChoiceGate | null = min > 0 ? { attribute: 'ballHandle', min } : null;
    const options = clips.map((clip) => {
      const side = clips.length > 1 ? (clip.endsWith('_left') ? ' Left' : clip.endsWith('_right') ? ' Right' : '') : '';
      return register({ label: `${titled(move)}${side}`, clip }, gate);
    });
    rows.push(slot(
      `anim_${move}`, titled(move), 'Dribble / Size-up', options, min > 0,
      gate, `${titled(move)}. ${min > 0 ? `Needs Ball Handle ${min}.` : 'Everybody has this.'} Plays ${clips.join(' / ')}.`,
      min > 0 ? undefined : options[0],
    ));
  }
  return rows;
}

interface Pack {
  label: string;
  clip: string;
  /** Vertical attribute this dunk asks for. The attribute is itself under the power PRQ ceiling. */
  vertical: number;
}

const DUNKS: readonly Pack[] = [
  { label: 'Power', clip: 'dunk_finish_power', vertical: 55 },
  { label: 'Two-Hand', clip: 'dunk_finish_two_hand', vertical: 60 },
  { label: 'Tomahawk', clip: 'dunk_finish_tomahawk', vertical: 68 },
  { label: 'Reverse', clip: 'dunk_finish_reverse', vertical: 70 },
  { label: 'Windmill', clip: 'dunk_finish_windmill', vertical: 75 },
  { label: 'Eastbay', clip: 'dunk_360_eastbay', vertical: 78 },
  { label: 'Double Clutch', clip: 'dunk_double_clutch', vertical: 80 },
  { label: 'Cradle', clip: 'dunk_cradle', vertical: 82 },
  { label: 'Scorpion', clip: 'dunk_scorpion', vertical: 85 },
  { label: 'Between the Legs', clip: 'dunk_between_legs', vertical: 88 },
  { label: '720', clip: 'dunk_720_spin', vertical: 92 },
];

const DUNK_LABELS = DUNKS.map((d) => register({ label: d.label, clip: d.clip }, { attribute: 'vertical', min: d.vertical }));

const JUMP_BASES: ClipChoice[] = [
  { label: 'Set Shot', clip: 'jumpshot' },
  { label: 'Pull-Up', clip: 'bball_pullup_gather' },
  { label: 'Fadeaway', clip: 'bball_fadeaway' },
  { label: 'Stepback Jumper', clip: 'bball_stepback_gather' },
];
const JUMP_RELEASES: ClipChoice[] = [
  { label: 'Standard Release', clip: 'bball_follow_through' },
  { label: 'Early Release', clip: 'bball_follow_through_early' },
  { label: 'Late Release', clip: 'bball_follow_through_late' },
];
const LAYUPS: ClipChoice[] = [
  { label: 'Gather', clip: 'bball_layup_gather' },
  { label: 'Euro', clip: 'bball_euro_step' },
  { label: 'Hop Step', clip: 'bball_hop_step' },
  { label: 'Floater', clip: 'bball_floater' },
  { label: 'Finger Roll', clip: 'bball_finger_roll' },
  { label: 'Reverse Layup', clip: 'bball_layup_reverse' },
  { label: 'Mikan', clip: 'bball_mikan' },
  { label: 'Scoop', clip: 'bball_layup_scoop' },
  { label: 'Spin Layup', clip: 'bball_layup_spin' },
  { label: 'Hang', clip: 'bball_layup_hang' },
];
const CELEBRATIONS: ClipChoice[] = [
  { label: 'Big', clip: 'dunk_celebrate_big' },
  { label: 'Splits', clip: 'dunk_celeb_spiderman_splits' },
  { label: 'Its Over', clip: 'dunk_celeb_its_over' },
  { label: 'Roar', clip: 'dunk_celeb_roar' },
  { label: 'Too Small', clip: 'dunk_celeb_too_small' },
  { label: 'Win', clip: 'party_win' },
  { label: 'Spike', clip: 'football_td_spike' },
];
const IDLES: ClipChoice[] = [
  { label: 'Idle', clip: 'idle_stand' },
  { label: 'Hoops Idle', clip: 'bball_idle_stand' },
  { label: 'Dribble Idle', clip: 'bball_dribble_idle' },
  { label: 'Walk', clip: 'walk' },
  { label: 'Run', clip: 'run' },
];

const labelsOf = (list: readonly ClipChoice[], gate: ChoiceGate | null = null) => list.map((c) => register(c, gate));

const dunkGlossary = DUNKS.map((d) => `${d.label} plays ${d.clip} and needs Vertical ${d.vertical}.`).join(' ');

export const ANIMATIONS: SectionTable<SlotRow> = {
  section: 'animations',
  title: 'Animations',
  rows: [
    slot('animJsBase', 'Jump Shot Base', 'Jump Shot', labelsOf(JUMP_BASES), false, null,
      'The lower body of the shot. One authored clip each — Set Shot, Pull-Up, Fadeaway, Stepback.', JUMP_BASES[0].label),
    slot('animJsRelease', 'Jump Shot Release', 'Jump Shot', labelsOf(JUMP_RELEASES), false, null,
      'Where the ball leaves. Early, standard, and late are the three follow-through clips that ship.', JUMP_RELEASES[0].label),
    slot('animDunk1', 'Dunk Package 1', 'Dunk Packages', DUNK_LABELS, false, { attribute: 'vertical', min: 55 },
      `First dunk. ${dunkGlossary}`, 'Power'),
    slot('animDunk2', 'Dunk Package 2', 'Dunk Packages', DUNK_LABELS, true, { attribute: 'vertical', min: 70 },
      'A second dunk. May be left empty. Needs Vertical 70 before any choice, and the choice can ask for more.'),
    slot('animDunk3', 'Dunk Package 3', 'Dunk Packages', DUNK_LABELS, true, { attribute: 'vertical', min: 80 },
      'A third dunk. May be left empty. Needs Vertical 80.'),
    slot('animDunk4', 'Dunk Package 4', 'Dunk Packages', DUNK_LABELS, true, { attribute: 'vertical', min: 88 },
      'A fourth dunk. May be left empty. Needs Vertical 88.'),
    slot('animDunk5', 'Dunk Package 5', 'Dunk Packages', DUNK_LABELS, true, { attribute: 'vertical', min: 92 },
      'A fifth dunk. May be left empty. Needs Vertical 92.'),
    slot('animLayup', 'Layup Package', 'Layup / Gather', labelsOf(LAYUPS), false, null,
      'How he finishes at the rim. Each name is one clip that already plays in hoops.', 'Gather'),
    slot('animGather', 'Gather', 'Layup / Gather', labelsOf([
      { label: 'Layup Gather', clip: 'bball_layup_gather' },
      { label: 'Hop Gather', clip: 'bball_hop_step' },
      { label: 'Pull-Up Gather', clip: 'bball_pullup_gather' },
    ]), false, null, 'The last step into the finish.', 'Layup Gather'),
    ...dribbleRows(),
    slot('animCelebration', 'Celebration', 'Celebrations / Taunts', labelsOf(CELEBRATIONS), false, null,
      'What plays after a make. These are the celebration clips on disk. There is no separate taunt pack.', 'Big'),
    slot('animIdle', 'Idle', 'Idle / Walk', labelsOf([IDLES[0], IDLES[1], IDLES[2]]), false, null,
      'The stance between plays.', 'Idle'),
    slot('animWalk', 'Walk Style', 'Idle / Walk', labelsOf([IDLES[3], IDLES[4]]), false, null,
      'One walk and one run. A style library (swagger, stiff, injured) is not on disk.', 'Walk'),
  ],
};

/**
 * What 2K's MyPlayer animation creator has that this build cannot offer, because the clip is not in the repo.
 * Listed so the gap stays visible. Do not fill it by authoring or downloading mocap.
 */
export const MISSING_VS_2K: readonly string[] = [
  'A library of jump-shot bases and upper-body releases that blend. We ship one set-shot clip (jumpshot) and three follow-throughs, not a base/release mixer.',
  'Signature packages named for real players. FEL motion sets stay biomechanical on purpose, and no licensed athlete mocap is in the repo.',
  'Dunk packages as authored sequences (gather → takeoff → finish → land) you equip as one item. The pieces exist as separate clips; the creator picks one clip, it does not chain them.',
  'Layup packages that blend gather, finish, and contact. Each layup here is a single clip.',
  'Dribble style (normal / quick / hesitant) and size-up chains as their own packages. Moves gate on Ball Handle and play the one clip HandleSystem already maps.',
  'Handle moves with no clip of their own: spin and off-the-head. The modes render those; the creator cannot preview a clip that does not exist.',
  'A taunt pack separate from celebrations. The celebration clips and party_win are the whole set.',
  'Walk styles beyond one walk and one run. No swagger, stiff, or tired walk is authored.',
  'Post-game creator packages (hook, fade, drop-step) as equippable slots. The clips exist (bball_hook, bball_fadeaway, bball_drop_step) and are not a section here.',
  'Hot zones, ink, and vitals as 2K-style editors. Left as a follow-up. Tendencies already have rows and were not extended in this pass.',
];
