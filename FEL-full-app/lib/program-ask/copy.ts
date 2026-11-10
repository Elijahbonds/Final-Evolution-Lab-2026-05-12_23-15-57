// lib/program-ask/copy.ts — PROGRAM-ASK (2026-11-02): every line the program builder says that is not a library entry's.
//
// Plain words (owner: "readable, plain words, ≤ 50 words above the fold"). The HONESTY RULE holds every line here
// (program-ask.test.ts runs each through lib/share/screen.ts screenText and weeklyDraft/copy.ts MEDICAL_WORDS): no
// condition, no treatment, no promise of a result. The rhythm of a block is FEL's choice and says so. NEW copy for the
// Owner Inbox: none of it is owner-approved yet.
//
// Pure. Client-safe.
import { EFFORT_BANDS } from '@/lib/coach/taxonomy';
import type { WaveBand } from '@/lib/coach/templates/waves';
import { EQUIPMENT, type LevelId } from '@/lib/library/vocab';
import type { AgeBand, BandTension, DayFocus, ProgramGoal, ProgramRequest, SlotId } from './types';

export const PAGE_TITLE = 'Build my program';
export const PAGE_LEDE = 'Say what you have and what you want. You get a full plan you can start today.';
export const ASK_PLACEHOLDER = 'All I have is a band. Full body, 3 days a week, 40 minutes.';
export const ASK_BUTTON = 'Build it';
export const START_TODAY = 'Start today';
export const READ_BACK = 'What FEL read';
export const EDIT_HINT = 'Tap a chip to change it.';
export const SAVED_LINE = 'Saved on this phone.';
export const SAVED_ACCOUNT_LINE = 'Saved on this phone and your account.';
export const WEEK_VIEW = 'The weeks';
export const CHECKPOINT_TITLE = 'Checkpoint';
export const LIGHTER_TAG = 'Lighter';
export const TRAIN_CARD_TITLE = 'Build my program';
export const TRAIN_CARD_LINE = 'Tell it what you have. Get a full plan.';
export const ASK_DOOR_LINE = 'Want a whole plan, not single exercises?';
export const ASK_DOOR_CTA = 'Build my program';

export const GOAL_LABEL: Record<ProgramGoal, string> = {
  'full-body': 'Full body', strength: 'Strength', muscle: 'Muscle', conditioning: 'Fitness and fat loss',
  athletic: 'Athletic', mobility: 'Mobility', sport: 'Sport',
};
export const LEVEL_LABEL: Record<LevelId, string> = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };
export const AGE_LABEL: Record<AgeBand, string> = { adult: '18 or over', teen: 'Under 18', child: 'Under 13' };
export const TENSION_LABEL: Record<BandTension, string> = { light: 'Light band', medium: 'Medium band', heavy: 'Heavy band' };

export const FOCUS_LABEL: Record<DayFocus, string> = {
  full: 'Full body', upper: 'Upper body', lower: 'Lower body', push: 'Push', pull: 'Pull', legs: 'Legs',
  conditioning: 'Conditioning circuit', athletic: 'Speed and athletic', mobility: 'Mobility',
};

export const SLOT_LABEL: Record<SlotId, string> = {
  knee: 'squat', hinge: 'hip hinge', single: 'single leg', hpush: 'push', hpull: 'row', vpush: 'overhead press', vpull: 'pulldown',
  antiExt: 'trunk (front)', antiRot: 'trunk (anti-rotation)', calf: 'calves', biceps: 'arms (pull)', triceps: 'arms (push)',
  rear: 'upper back', power: 'jumps', speed: 'speed', cond: 'conditioning', mobility: 'mobility',
};

export function kitWords(eq: readonly string[], tension: BandTension | null, bands?: readonly BandTension[]): string {
  if (!eq.length) return 'no equipment';
  return eq.map((id) => (id === 'band' ? (bands && bands.length > 1 ? `${bands.join(', ')} bands` : tension ? `one ${tension} band` : 'one band') : (EQUIPMENT.find((e) => e.id === id)?.label ?? id).toLowerCase())).join(', ');
}

const HOLD_WORDS: Record<WaveBand, string> = { idle: 'just breathe', cruise: 'easy, could go longer', drive: 'steady, some left at the end', surge: 'hard, still clean' };

/** The reps-in-reserve words for a band ("Drive: 3–4 reps left"), or, for a timed set, how it should feel. */
export function effortWords(b: WaveBand, timed = false): string {
  const band = EFFORT_BANDS.find((x) => x.id === b);
  if (!band) return '';
  return timed ? `${band.label}: ${HOLD_WORDS[b]}` : `${band.label}: ${band.rir.replace(/ left$/, '')} reps left`;
}

export const WEEK_LINE = 'Each block builds for a few weeks, then a lighter week. That rhythm is FEL\'s choice, not a rule from a clinic.';

export const CHECKPOINT_LINES = {
  question: 'In the last hard week, did most sets reach the target with 2 or more reps left, with clean form?',
  yes: 'Yes, move me on',
  no: 'Not yet',
  advance: 'Next block: harder versions of the same moves, reps back to the start.',
  repeat: 'Run this block again. Same moves, and the reps will come.',
  pain: 'Something hurt: the plan does not move up. Run the lighter week again.',
} as const;

/** Band tips: one band, harder without buying another. */
export const BAND_TIP = 'One band can still get harder: step further from the anchor, hold the band shorter, slow the lowering, or pause at the hardest point.';
export const BAND_ANCHOR = 'Rows, pulldowns and the Pallof press need the band fixed at about chest or head height: a door anchor or a solid post.';

export const TEMPO_NOTE = (tempo: string): string => {
  const [down, pause] = tempo.split('-');
  return `Slow it down: ${down} s on the way down${Number(pause) > 0 ? `, ${pause} s pause` : ''}.`;
};
export const HARDER_NOTE = (from: string): string => `A harder version of ${from}.`;
export const MAKE_HARDER_BAND = 'Make it harder with the band: step further from the anchor or hold it shorter.';
export const MAKE_HARDER_BODY = 'Make it harder: add a 2 second pause at the hardest point.';

export const JUMPS_OPEN_LINE = 'Jumps are in from week 2 of each block: your jump checks are in.';

export const STAND_IN = (job: string, kit: string, names: string): string => `Nothing in the library does the ${job} with ${kit}: ${names} ${/ and /.test(names) ? 'stand' : 'stands'} in.`;
export const NO_BAND_SQUAT = 'The library has no squat loaded with a band under the feet yet, so the legs get the hardest real versions: the band-resisted squat and one-leg squats and split squats.';
export const ONE_LEG_BIAS = 'With nothing to load a squat, the legs work one at a time: one-leg squats and split squats are hard enough to count.';
export const NO_PULL_TIP = 'A band opens real rows and pulldowns.';
export const VOLUME_SHORT = (area: string, have: number, lo: number): string =>
  `${have} hard sets a week for ${area} fit in this time; ${lo} is the low end for your goal. More minutes or one more day would get there.`;

export const CHILD_LINE = 'Built for under 13: light, two sets, smooth reps, nothing heavy.';
export const TEEN_LINE = 'Built for under 18: no max-effort sets and no jumps.';
export const KIT_ANCHOR_ASSUMPTION = 'assumption: the band can be fixed at chest or head height (a door anchor or a post).';

const days = (n: number) => `${n} day${n === 1 ? '' : 's'} a week`;

export function programTitle(r: ProgramRequest): string {
  const kit = r.equipment.length === 1 && r.equipment[0] === 'band' ? 'Band' : r.equipment.length === 0 ? 'Bodyweight' : 'Home kit';
  return `${kit} ${GOAL_LABEL[r.goal].toLowerCase()}`;
}

/** ≤ 50 words: what it is, and how it moves. */
export function programSummary(r: ProgramRequest, blockLen: number): string {
  const lighter = Math.min(blockLen, r.weeks);
  return `${days(r.days)}, ${r.minutes} minutes, ${r.weeks} weeks, with ${kitWords(r.equipment, r.tension, r.bands)}. Every session has a warm-up, the main work in pairs, and a cool-down. Reps and difficulty climb each week; week ${lighter} is lighter, then a checkpoint decides the next block.`;
}

/** FEL's own "why this plan" (the AI may replace it with its own, through ./ai.ts's guards). */
export function felWhy(r: ProgramRequest, splitWords: string): string {
  const goal: Record<ProgramGoal, string> = {
    'full-body': 'every session works the whole body: a squat, a hinge, a push, a pull, one leg at a time, and two trunk moves',
    strength: 'the main moves stay low in reps and get harder through slower lowering, pauses and harder versions, since a band cannot be loaded like a bar',
    muscle: 'more weekly sets and higher reps taken close to the end of the set, which is how light loads build muscle',
    conditioning: 'the moves run as a circuit with short rests, so your breathing stays up the whole session',
    athletic: 'strength on one leg and both, plus speed work, for moving well in any sport',
    sport: 'strength on one leg and both, plus speed work, for moving well in your sport',
    mobility: 'each session opens with range work and keeps light strength through the whole body',
  };
  return `${splitWords}: ${goal[r.goal]}. Pairs alternate a lower and an upper move, so one rests while the other works and the session fits your ${r.minutes} minutes. Pulling is kept at least equal to pushing.`;
}

/** EVERY-SCREEN P3: the plan needed longer sessions than asked to keep every rule (./kept.ts). Plain words, no dose. */
export const LONGER_THAN_ASKED = (asked: number, got: number): string =>
  `These sessions run about ${got} minutes, not ${asked}: ${asked} minutes was too short for the warm-up and every movement this plan covers. Ask for fewer days of more minutes, or a lighter goal, to change it.`;
/** EVERY-SCREEN P3: the plan's weekly limits fill fewer minutes than asked (./kept.ts). */
export const SHORTER_THAN_ASKED = (asked: number, got: number): string =>
  `These sessions run about ${got} minutes, not ${asked}: that is all the work this plan's weekly limits allow, without filler.`;
