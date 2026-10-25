// lib/library/modifiers.ts — EXERCISE-LIBRARY batches 2–4 (2026-10-25): the modifier axis of the authoring matrix,
// with WHERE EACH ONE MAKES SENSE written down as data.
//
// A modifier turns one entry into a real, distinct exercise a coach programs on purpose (a paused squat, a single-arm
// row, an off-hand finish). The first generation applied them by a loose test per modifier and wrote nonsense the
// validator could not see: "Plyo Kettlebell Pushups Isometric Hold", "Paused Plyo …", "1.5-Rep Plyo …", "Vertical Swing
// Against the Clock". So each modifier now carries an APPLICABILITY RULE (categories, patterns, laterality, equipment,
// name allow- and deny-lists), the generator (scripts/library/author.ts) applies a modifier only where its rule passes,
// and the validator (./validate.ts) FAILS any entry whose `+modifier` variation sits on a base its rule refuses — so a
// hand edit or a future generator cannot bring the nonsense back. scripts/library-tests.ts holds a negative control per
// rule.
//
// The rules, in words (what the owner reviews):
//   R1 slow-tempo modifiers — paused, 4-second lower, isometric hold, 1.5-rep — never on explosive work: no plyometric,
//      power, ballistic, jump, hop, bound, throw, swing, clap, snatch, clean, jerk or sprint entry (by category AND by
//      name, because the seed files "Plyo Kettlebell Pushups" under strength).
//   R2 "Against the Clock" only on rhythm and conditioning work — never a heavy max-strength lift, a max-intent jump or
//      a sprint (those are already timed, or must stay fresh).
//   R3 single-arm only on a one-hand implement — never a two-handed barbell, trap-bar, EZ-bar or landmine lift, and
//      never a drill that needs both hands (a band pull-apart, a squeeze press).
//   R4 deficit only where the athlete STANDS on a surface (a deadlift, an RDL, a split squat, a reverse lunge) — never
//      seated, lying, kneeling, on a bench or box, or on a machine.
//   R5 one level deep: a modifier never stacks on another modifier's entry.
//   …and the incompatibilities found reading the first generation: offset needs two hands' worth of load (not a goblet
//   or sumo hold); half-kneeling never on a bent-over, lying or bench lift; the kettlebell swap only where a bell holds
//   like a dumbbell (not a fly or a raise); neutral grip only on handles (never a straight bar); off-hand only on a
//   one-hand drill (not a crossover or a combo, which already use both hands); "Reactive" never on a pre-set pattern (a
//   ladder, a skip, a build-up); eyes closed never on a hop, a reach or a catch; "at Game Speed" never on a form or
//   warm-up drill; weight vest and band resistance never on an assisted or regressed version.
//
// Pure data and small pure functions. No Prisma, no DOM. Client-safe.

import type { LibraryExercise } from './types';
import { levelRank, type CategoryId, type EquipmentId, type GoalId, type Laterality, type LevelId, type MovementPattern } from './vocab';

export interface ModifierRule {
  /** The base must be in one of these categories. */
  categories: readonly CategoryId[];
  /** …and, when given, one of these movement patterns. */
  patterns?: readonly MovementPattern[];
  laterality?: readonly Laterality[];
  /** The base must carry at least one of these. */
  equipmentAny?: readonly EquipmentId[];
  /** The base must carry none of these. */
  equipmentNot?: readonly EquipmentId[];
  /** The base needs nothing beyond a wall, a mat, a towel, a box, a bench or a bar to hang from. */
  bodyweightOnly?: boolean;
  /** The base's name must contain one of these words (a word start, case-insensitive; a space also matches a hyphen). */
  nameAny?: readonly string[];
  /** The base's name must contain none of these words. */
  nameNot?: readonly string[];
  /** …nor match any of these patterns (for what is not a word: " to " in a transition, " with " before a suffix). */
  namePatternsNot?: readonly RegExp[];
  /** The base must carry one of these goals. */
  goalsAny?: readonly GoalId[];
  minLevel?: LevelId;
}

export interface Modifier {
  id: string;
  batch: 2 | 3 | 4;
  /** What the owner reads in the review list. */
  label: string;
  rule: ModifierRule;
  name: (n: string) => string;
  cue: string;
  /** 'down' makes an easier version: it links to its base as the HARDER step. */
  level: 'same' | 'up' | 'down';
  /** Base cues this modifier contradicts ("Pause at the top for a beat" under a 4-second lower): left out of the variant. */
  dropCues?: RegExp;
  laterality?: LibraryExercise['laterality'];
  dosage?: (d: LibraryExercise['dosage']) => LibraryExercise['dosage'];
  equipment?: (eq: LibraryExercise['equipment']) => LibraryExercise['equipment'];
  youthOk?: boolean;
  /**
   * Which entries the generator offers it: 'early' (default) = batch 1 and the seed; 'all' = also the families batches
   * 2–3 add. (The rule decides whether it FITS; this only keeps a modifier such as "at Game Speed" from cloning every
   * new matrix cell. The validator does not read it.)
   */
  pool?: 'early' | 'all';
}

// ── shared word lists ────────────────────────────────────────────────────────────────────────────────────────────────

/** R1: explosive, ballistic or max-intent work, by name (the seed's categories are not reliable enough on their own). */
export const EXPLOSIVE_WORDS = [
  'plyo', 'power', 'ballistic', 'explosive', 'jump', 'hop', 'bound', 'leap', 'throw', 'toss', 'slam', 'swing', 'clap', 'snatch',
  'clean', 'jerk', 'sprint', 'skip', 'pogo', 'depth', 'speed', 'kipping', 'push press', 'thruster', 'high pull', 'burpee', 'launch',
  'dynamic', 'reactive', 'drop catch',
] as const;

/**
 * R5, by name: a base that already names a modifier (batch 1 and the seed hold "Pause Back Squat", "Tempo Push-Up",
 * "Deficit Reverse Lunge", "Box Squat with Chains"…) takes no second one. Every modifier refuses these.
 */
export const STACK_WORDS = [
  'pause', 'paused', 'tempo', 'second lower', 'eccentric', 'negative', 'isometric', 'iso', '1.5', 'deficit', 'offset', 'stagger', 'staggered',
  'single-arm', 'single arm', 'one-arm', 'one arm', 'half-kneeling', 'neutral-grip', 'neutral grip', 'wide-stance', 'weight-vest', 'weighted',
  'band-resisted', 'banded', 'with bands', 'with chains', 'chains', 'reverse band', 'off-hand', 'reactive', 'eyes closed', 'game speed',
  'against the clock', 'timed',
] as const;
/** Names the seed spells in ways a prefix or suffix would garble ("Bench Press - Medium Grip", "Pull-Ups/Pulldowns", "Landmine 180's"). */
const MESSY_NAME = [/\s[-–]\s/, /\s-\w/, /\//, /[()]/, /\d+'s\b/i] as const;
/** Lifts named after a person: FEL does not build its own variants on someone's name. */
const PERSON_NAMES = ['arnold', 'gironda', 'cuban', 'zottman', 'tate', 'jm press', 'rocky', 'anderson', 'pendlay', 'kroc', 'meadows', 'jefferson', 'svend', 'bradford', 'otis'] as const;
/** Every modifier: never stack, never on a garbled or person-named seed name. */
const GLOBAL_NOT: readonly string[] = [...STACK_WORDS, ...PERSON_NAMES];

/** Single-joint work: a slow-tempo modifier adds bulk, not a new exercise. */
const ISOLATION = [
  'curl', 'extension', 'raise', 'fly', 'flye', 'kickback', 'pushdown', 'shrug', 'crossover', 'cross over', 'pullover', 'scaption', 'iron cross',
  'upright row', 'face pull', 'rear delt', 'lateral', 'butterfly', 'pec deck', 'tricep', 'bicep', 'skull', 'wrist', 'calf', 'press-around',
  'around the world', 'side bend', 'deltoid', 'windmill', 'upright', 'pull-apart', 'pull apart', 'straight-arm', 'crucifix', 'concentration',
] as const;
/** Machine-named seed rows ("Dip Machine", "Leverage Iso Row", "Smith …"): the machine sets the path, a modifier name garbles it. */
const MACHINE_NAMES = ['machine', 'leverage', 'smith', 'hack', 'sled', 'jammer', 'leg press'] as const;
/** Already a hold, a carry or a pattern on the move: no bottom to pause in, no rep to lower. */
const NOT_A_REP = ['hold', 'hang', 'hike', 'dowel', 'wall', 'walking', 'walk', 'carry', 'march', 'farmer', 'crawl', 'drag', 'plank', 'support', 'pass through', 'pass-through', 'airplane', 'walkout'] as const;
/** A box or pin already sets the bottom ("Box Squat", "Squat to a Bench", "off Pins"). */
const SET_BOTTOM = ['box squat', 'to a bench', 'to box', 'to pad', 'pins', 'pin', 'deadstop', 'dead stop', 'chair', 'rack pull'] as const;
/** "Squat to Press", "Ground-to-Shoulder": a transition, not one rep to modify. */
const TRANSITION = /(?:\s|-)to(?:\s|-)/i;
/** A suffix after "… with …" or a comma reads garbled ("Bench Dip, Knees Bent with 4-Second Lower"). */
const WITH_SUFFIX = /\swith\s|,/i;
/** Odd or risky seed rows FEL builds no variant on. */
const ODD = ['body-up', 'body tricep', 'manual', 'chain', 'anti-gravity', 'guillotine', 'neck press', 'behind neck', 'behind the neck', 'handstand', 'rear pull', 'butt'] as const;

/** One rule's words as a regex: each word must START a word in the name ("jump" matches "jumps", not "bumpjump"). */
const wordsRe = (ws: readonly string[]): RegExp => new RegExp(`(?:^|[^a-z0-9.])(?:${ws.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[ -]/g, '[ -]?')).join('|')})`, 'i');

/** The slow-tempo modifiers fit single-joint lifts too (a paused curl, a slow-lower raise, a held curl, a 1.5-rep
 *  raise); each rule adds its own refusals on top. */
const SLOW_ANY_NOT: readonly string[] = [...EXPLOSIVE_WORDS, ...MACHINE_NAMES, ...NOT_A_REP, ...SET_BOTTOM, ...ODD, 'step-up', 'step up', 'nordic', 'car deadlift', 'rickshaw', 'london', 'cable deadlift', 'iron cross', 'climb', 'clock', 'glute ham', 'glute-ham', 'renegade', 'seesaw', 'see-saw', 'side to side', 'scapular', 'good morning', 'overhead squat', 'zercher', 'bent press', 'behind the back', 'crucifix', 'board press', 'kneeling squat'];
const LOADS: readonly EquipmentId[] = ['dumbbell', 'kettlebell', 'barbell', 'cable', 'landmine', 'trap-bar', 'ez-bar', 'machine', 'sandbag'];
/** Kit a bodyweight exercise may still use. */
const AMBIENT: readonly EquipmentId[] = ['wall', 'mat', 'towel', 'box', 'bench', 'step', 'pull-up-bar', 'dip-bars'];

export const MODIFIERS: readonly Modifier[] = [
  // ── strength: the slow-tempo family (R1), on compound lifts only ─────────────────────────────────────────────────
  {
    id: 'paused', batch: 4, label: 'Paused',
    rule: { categories: ['strength'], patterns: ['squat', 'hinge', 'lunge', 'push', 'pull'], nameNot: [...SLOW_ANY_NOT, 'axle', 'pull-through', 'back extension', 'hyperextension', 'pullover', 'crossover', 'cross over'], namePatternsNot: [TRANSITION, /\swith\s/i] },
    name: (n) => `Paused ${n}`, cue: 'Stop dead at the hardest point of the rep for a two-count, then finish.', level: 'up', dosage: (d) => ({ ...d, tempo: '2-2-1-0' }),
    dropCues: /pause|hold still|for a beat|\bcount\b/i,
  },
  {
    id: 'tempo', batch: 4, label: '4-second lower',
    rule: { categories: ['strength'], patterns: ['squat', 'hinge', 'lunge', 'push', 'pull'], nameNot: [...SLOW_ANY_NOT, 'pull-through', 'conventional', 'sumo deadlift', 'trap bar deadlift', 'axle', 'shrug', 'kickback', 'crossover', 'cross over'], namePatternsNot: [TRANSITION, WITH_SUFFIX] },
    name: (n) => `${n} with 4-Second Lower`, cue: 'Lower on a slow four-count, then move at normal speed.', level: 'same', dosage: (d) => ({ ...d, tempo: '4-0-1-0' }),
    dropCues: /-count|\bcount\b|slow|pause|for a beat/i,
  },
  {
    id: 'iso-hold', batch: 4, label: 'Isometric hold',
    rule: { categories: ['strength'], patterns: ['squat', 'hinge', 'lunge', 'push', 'pull'], nameNot: [...SLOW_ANY_NOT, 'conventional', 'sumo deadlift', 'trap bar', 'axle', 'pull-through', 'pullover', 'crossover', 'cross over', 'shrug', 'kickback', 'fly', 'flye'], namePatternsNot: [TRANSITION, WITH_SUFFIX] },
    name: (n) => `${n} Isometric Hold`, cue: 'Stop at the hardest point of the range and hold still, breathing smoothly.', level: 'same',
    dosage: (d) => ({ sets: d.sets, seconds: 20, restSec: d.restSec }),
    dropCues: /\b(lower|lowering|return|then|back out|back up|count|beat|pause|slow|swing|stand tall|step|drive|push .* back)\b/i,
  },
  {
    id: 'one-and-a-half', batch: 4, label: '1.5-rep',
    rule: { categories: ['strength'], patterns: ['squat', 'hinge', 'lunge', 'push', 'pull'], equipmentAny: LOADS, nameNot: [...SLOW_ANY_NOT, 'conventional', 'sumo deadlift', 'trap bar', 'axle', 'back extension', 'hyperextension', 'pull-through', 'single-leg', 'pistol', 'pullover', 'shrug', 'kickback', 'upright', 'scaption', 'iron cross'], namePatternsNot: [TRANSITION] },
    name: (n) => `1.5-Rep ${n}`, cue: 'All the way down, halfway up, back down, then all the way up: that is one rep.', level: 'up',
    dosage: (d) => { const { tempo: _t, ...rest } = d; return rest; }, dropCues: /pause|for a beat|\bcount\b/i,
  },
  // ── strength: stance, grip and implement ─────────────────────────────────────────────────────────────────────────
  {
    id: 'single-arm', batch: 4, label: 'Single-arm',
    rule: {
      categories: ['strength'], patterns: ['push', 'pull'], laterality: ['bilateral'], equipmentAny: ['dumbbell', 'kettlebell', 'cable', 'band'],
      equipmentNot: ['barbell', 'trap-bar', 'ez-bar', 'landmine', 'machine'],
      nameNot: [
        'barbell', 'trap bar', 'ez bar', 'landmine', 'pull-apart', 'pull apart', 'pass-through', 'squeeze press', 'hex press', 'crush', 'two', 'double', 'both',
        'renegade', 'alternating', 'single', 'push-up', 'pushup', 'pull-up', 'pullup', 'chin', 'dip', 'inverted', 'straight bar', 'rope', 'v-bar', 'wide-grip',
        'close-grip', 'iron cross', 'seesaw', 'see-saw', 'around the world', 'pullover', 'shrug', 'upright', 'bent press', 'concentration', 'cross body', 'cross-body',
        ...ODD, ...EXPLOSIVE_WORDS, ...MACHINE_NAMES,
      ],
      namePatternsNot: [TRANSITION, /\swith\s/i],
    },
    name: (n) => `Single-Arm ${n}`, cue: 'Keep the shoulders square to the wall ahead while one side works.', level: 'up', laterality: 'unilateral',
    dropCues: /together|apart|both|the dumbbells|the weights/i,
  },
  {
    id: 'offset', batch: 4, label: 'Offset load',
    rule: {
      categories: ['strength'], patterns: ['squat', 'lunge', 'carry'], equipmentAny: ['dumbbell', 'kettlebell'], equipmentNot: ['barbell', 'trap-bar', 'landmine'],
      nameNot: ['suitcase', 'single', 'goblet', 'sumo', 'plie', 'zercher', 'bear-hug', 'horn', 'bottoms-up', 'pistol', 'overhead', 'cossack', 'hold', 'pass through', ...EXPLOSIVE_WORDS, ...MACHINE_NAMES],
      namePatternsNot: [TRANSITION],
    },
    name: (n) => `Offset ${n}`, cue: 'Grow tall toward the ceiling; do not lean toward the load.', level: 'up',
  },
  {
    id: 'half-kneeling', batch: 4, label: 'Half-kneeling',
    rule: {
      categories: ['strength', 'core'], patterns: ['push', 'pull', 'rotation'], equipmentAny: ['cable', 'band', 'landmine', 'dumbbell', 'kettlebell'],
      nameAny: ['shoulder press', 'overhead press', 'military press', 'landmine press', 'kettlebell press', 'dumbbell press', 'pulldown', 'pull-down', 'face pull', 'chop', 'lift', 'pallof', 'chest press'],
      nameNot: ['kneeling', 'standing', 'seated', 'bench', 'lying', 'floor', 'incline', 'decline', 'straight-arm', 'windmill', 'halo', 'to the side', 'walkout', 'split', 'stance', 'close-grip', ...ODD, ...EXPLOSIVE_WORDS, ...MACHINE_NAMES],
    },
    name: (n) => `Half-Kneeling ${n}`, cue: 'Tuck the belt buckle up and keep the down knee heavy on the floor the whole set.', level: 'same',
    dropCues: /feet|stand|floor away|heels/i,
  },
  {
    id: 'deficit', batch: 4, label: 'Deficit',
    rule: {
      categories: ['strength'], patterns: ['hinge', 'lunge'], equipmentAny: ['dumbbell', 'kettlebell', 'barbell', 'trap-bar'], equipmentNot: ['machine', 'cable', 'band', 'stability-ball', 'suspension-trainer', 'bench', 'box', 'step'],
      nameAny: ['deadlift', 'romanian', 'rdl', 'stiff', 'reverse lunge', 'split squat'],
      nameNot: [
        'seated', 'lying', 'kneeling', 'bench', 'box', 'step', 'elevated', 'rear-foot', 'rear foot', 'front-foot', 'bulgarian', 'hanging', 'prone', 'supine', 'ball',
        'walking', 'lateral', 'side', 'curtsy', 'single-leg', 'single leg', 'one-legged', 'one leg', 'suitcase', 'kickstand', 'snatch-grip', 'good morning',
        ...EXPLOSIVE_WORDS, ...MACHINE_NAMES,
      ],
    },
    name: (n) => `Deficit ${n}`, cue: 'Stand on a low plate so the range runs a little past the floor.', level: 'up',
  },
  {
    id: 'kettlebell', batch: 4, label: 'Kettlebell swap',
    rule: {
      categories: ['strength'], patterns: ['squat', 'hinge', 'lunge', 'carry', 'push', 'pull'], equipmentAny: ['dumbbell'], equipmentNot: ['kettlebell'], nameAny: ['dumbbell'],
      nameNot: [...ISOLATION, 'hammer', 'preacher', 'spider', 'squeeze', 'bench press', 'incline', 'decline', 'end hold', 'close-grip', ...EXPLOSIVE_WORDS],
    },
    name: (n) => n.replace(/dumbbells?/i, 'Kettlebell'), cue: 'Same path with a kettlebell: keep the handle quiet in the hand.', level: 'same',
    equipment: (eq) => eq.map((x) => (x === 'dumbbell' ? 'kettlebell' : x)),
  },
  {
    id: 'staggered', batch: 4, label: 'Staggered stance',
    rule: {
      categories: ['strength'], patterns: ['hinge'], laterality: ['bilateral'], equipmentAny: ['dumbbell', 'kettlebell', 'barbell', 'landmine'],
      nameAny: ['romanian', 'rdl', 'stiff', 'kettlebell deadlift', 'dumbbell deadlift', 'good morning'],
      nameNot: ['kickstand', 'sumo', 'split', 'box', 'seated', 'lying', 'single', 'suitcase', 'snatch-grip', 'hanging bar', 'conventional', 'axle', ...EXPLOSIVE_WORDS, ...MACHINE_NAMES, ...SET_BOTTOM],
    },
    name: (n) => `Staggered-Stance ${n}`, cue: 'Set one foot half a step back with the toes on the floor; the front foot does most of the work.', level: 'up', laterality: 'unilateral',
  },
  {
    id: 'wide-stance', batch: 4, label: 'Wide stance',
    rule: {
      categories: ['strength'], patterns: ['squat', 'hinge'], laterality: ['bilateral'], equipmentAny: ['dumbbell', 'kettlebell', 'barbell'],
      nameAny: ['romanian', 'rdl', 'stiff', 'good morning', 'back squat', 'box squat'],
      nameNot: ['wide', 'sumo', 'narrow', 'kickstand', 'seated', 'single', 'suitcase', 'overhead', 'zercher', 'goblet', 'hanging bar', 'pins', ...EXPLOSIVE_WORDS, ...MACHINE_NAMES],
    },
    name: (n) => `Wide-Stance ${n}`, cue: 'Feet wider than usual, toes turned out to match: push the floor apart.', level: 'same',
  },
  {
    id: 'grip-swap', batch: 4, label: 'Neutral grip',
    rule: {
      categories: ['strength'], patterns: ['push', 'pull'], laterality: ['bilateral'], equipmentAny: ['dumbbell', 'cable'], equipmentNot: ['barbell', 'ez-bar', 'trap-bar', 'landmine', 'kettlebell', 'machine'],
      nameAny: ['bench press', 'floor press', 'shoulder press', 'overhead press', 'military press', 'chest press', 'dumbbell press', 'row', 'pulldown', 'pull-down'],
      nameNot: ['grip', 'neutral', 'palms in', 'palm-in', 'palms-in', 'palms facing', 'hammer', 'wide', 'close', 'v-bar', 'rope', 'upright', 'renegade', 'single', 'alternating', 'to neck', 'rear delt', 'squeeze', 'straight-arm', 'underhand', 'overhand', 'reverse grip', 'supinated', 'pronated', ...EXPLOSIVE_WORDS, ...MACHINE_NAMES],
    },
    name: (n) => `Neutral-Grip ${n}`, cue: 'Palms facing each other on the handles: the elbows stay closer to your sides.', level: 'same',
  },
  {
    id: 'vest', batch: 4, label: 'Weight vest',
    rule: {
      categories: ['strength'], patterns: ['squat', 'lunge', 'push', 'pull'], bodyweightOnly: true, minLevel: 'intermediate',
      nameNot: ['assisted', 'wall', 'kneeling', 'incline', 'support', 'hold', 'vest', 'hang', 'counterweight', 'box squat', 'sit to', 'handstand', 'muscle up', 'muscle-up', 'single', 'side to side', 'rear pull', 'behind the neck', 'body-up', 'clock', 'archer', ...EXPLOSIVE_WORDS],
    },
    name: (n) => `Weight-Vest ${n}`, cue: 'Same reps with the vest on: if the path changes, take it off.', level: 'up', youthOk: false,
    equipment: (eq) => [...eq, 'weight-vest'],
  },
  {
    id: 'band-resisted', batch: 4, label: 'Band-resisted',
    rule: {
      categories: ['strength'], patterns: ['squat', 'hinge', 'push'], bodyweightOnly: true,
      nameAny: ['push-up', 'pushup', 'squat', 'bridge', 'hip thrust', 'frog pump'],
      nameNot: ['band', 'hold', 'wall', 'assisted', 'incline', 'kneeling', 'support', 'handstand', 'pike', 'pistol', 'counterweight', 'box', 'single-arm', 'clock', 'pry', 'deep squat', ...ODD, ...EXPLOSIVE_WORDS],
      namePatternsNot: [TRANSITION, /\swith\s/i],
    },
    name: (n) => `Band-Resisted ${n}`, cue: 'A band pulls against the hardest part of the rep: finish strong against it.', level: 'up',
    equipment: (eq) => [...eq.filter((x) => x !== 'band'), 'band'],
  },
  {
    id: 'alternating', batch: 4, label: 'Alternating',
    rule: {
      categories: ['strength'], patterns: ['push', 'pull'], laterality: ['bilateral'], equipmentAny: ['dumbbell', 'kettlebell'], equipmentNot: ['barbell', 'machine', 'cable', 'ez-bar'],
      nameAny: ['press', 'row', 'curl'],
      nameNot: ['alternating', 'single', 'renegade', 'two-', 'double', 'squeeze', 'pullover', 'fly', 'raise', 'upright', 'shrug', 'kickback', 'extension', 'skull', 'close-grip', 'triceps', 'tricep', 'concentration', 'preacher', 'spider', 'cross body', 'hammer', 'reverse', 'zottman', 'tate', 'jm', 'see-saw', 'seesaw', 'bent press', 'push press', ...EXPLOSIVE_WORDS, ...MACHINE_NAMES],
      namePatternsNot: [TRANSITION, /\swith\s/i],
    },
    name: (n) => `Alternating ${n}`, cue: 'One side works while the other holds still at the start; switch every rep.', level: 'same', laterality: 'alternating',
    dropCues: /together|both/i,
  },
  {
    id: 'supported', batch: 4, label: 'Supported (easier)',
    rule: {
      categories: ['strength'], patterns: ['squat', 'lunge', 'hinge'], laterality: ['unilateral'], equipmentNot: ['barbell', 'trap-bar', 'machine', 'landmine'],
      nameAny: ['split squat', 'single-leg', 'lunge', 'step-down', 'skater', 'cossack', 'curtsy', 'pistol'],
      nameNot: ['supported', 'assisted', 'to box', 'to pad', 'counterweight', 'walking', 'jump', 'airplane', 'hip thrust', 'bridge', 'curl', 'back extension', 'calf', 'pistol', 'pass through', 'suspended', 'suspension', ...MACHINE_NAMES, ...EXPLOSIVE_WORDS],
      namePatternsNot: [/\swith\s/i],
    },
    name: (n) => `Supported ${n}`, cue: 'Hold a post or the wall lightly with one hand: it steadies you, it does not lift you.', level: 'down',
  },
  // ── sport, speed, prehab, conditioning ───────────────────────────────────────────────────────────────────────────
  {
    id: 'off-hand', batch: 3, label: 'Off-hand',
    rule: {
      categories: ['sport-skill'], goalsAny: ['handles', 'finishing', 'shooting'],
      nameAny: ['pound', 'layup', 'finish', 'floater', 'hook', 'finger roll', 'scoop', 'hesitation', 'retreat', 'in-and-out', 'speed dribble', 'change-of-pace', 'push pass', 'one-hand', 'v-dribble', 'push-pull', 'wiper', 'snatch-back', 'kill dribble', 'rocking dribble'],
      nameNot: ['two-ball', 'weak', 'two-hand', 'left', 'right', 'figure', 'wrap', 'spider', 'cross', 'between', 'behind', 'combo', 'zig', 'two-cone', 'full-court', 'lines', 'drive and kick', 'under the rim', 'under-rim', 'toss', 'wall', 'pull-up', 'jumper', 'off a', 'off one', 'in transition'],
    },
    name: (n) => `Off-Hand ${n}`, cue: 'Same drill with the ball in your weaker hand: slower and clean beats fast and sloppy.', level: 'up', pool: 'all',
  },
  {
    id: 'reactive', batch: 3, label: 'Reactive (on a call)',
    rule: {
      categories: ['speed-agility'],
      nameAny: ['start', 'decel', 'lateral shuffle', 'backpedal', 'drop step', 'crossover run', 'turn', 'cut'],
      nameNot: ['falling', 'banded', 'band', 'resisted', 'sled', 'hill', 'hold', 'march', 'skip', 'wall', 'ladder', 'mirror', 'react', 'drill', 'technique', 'wind sprints', 'speed turn'],
    },
    name: (n) => `Reactive ${n}`, cue: 'Go on a point or a call from a partner, not on your own count.', level: 'up', pool: 'all',
  },
  {
    id: 'eyes-closed', batch: 3, label: 'Eyes closed',
    rule: {
      categories: ['prehab'], goalsAny: ['balance'], nameAny: ['balance', 'single-leg', 'calf raise'],
      nameNot: ['hop', 'jump', 'walk', 'toss', 'catch', 'throw', 'ball', 'reach', 'head turns', 'march', 'step', 'lunge', 'skip', 'bound', 'lying', 'clam', 'marble', 'press', 'band'],
    },
    name: (n) => `${n} with Eyes Closed`, cue: 'Close your eyes and keep the floor under all three tripod points.', level: 'up', pool: 'all',
  },
  {
    id: 'game-speed', batch: 3, label: 'At game speed',
    rule: {
      categories: ['sport-skill'], goalsAny: ['handles', 'finishing', 'footwork', 'defense', 'shooting'],
      nameNot: [
        'hold', 'stance', 'lying', 'clock', 'form', 'free throw', 'release', 'routine', 'wrap', 'figure', 'wall', 'two-ball', 'warm-up', 'fatigue', 'around the world',
        'spot-up', 'series', 'pivot', 'under the rim', 'under-rim', 'tip drill', 'toss', 'race', 'lines', 'jump', 'pound', 'stationary', 'spider', 'speed', 'triple threat',
        'combo', 'off a', 'off one', 'in transition', 'pull-up', 'catch-and-shoot', 'spin-out', 'partner', 'full-court', 'coast', 'sprint', 'dribble', 'shooting',
        'ball mastery', 'battle', 'forearm pass', 'serve', 'split step', 'shadow', 'hurdle', 'juggling', 'wall pass', 'first touch', 'chip', 'approach', 'attack',
      ],
    },
    name: (n) => `${n} at Game Speed`, cue: 'Full game speed now: if it gets sloppy, drop back to the slower version.', level: 'up', pool: 'all',
  },
  {
    id: 'timed', batch: 3, label: 'Against the clock',
    rule: {
      categories: ['conditioning', 'speed-agility', 'plyometric'], equipmentNot: ['barbell', 'trap-bar', 'strongman', 'sled', 'dumbbell', 'kettlebell', 'box'],
      nameAny: ['ladder', 'rope jump', 'jumping jack', 'seal jack', 'mountain climber', 'squat thrust', 'pogo', 'line hop', 'lateral shuffle', 'cone weave', 'carioca', 'box drill', 'ankle bounce', 'quick feet', 'dot drill', 'cone taps', 'quick steps', 'hexagon', 'four-square'],
      nameNot: [
        'hold', 'march', 'sprint', 'depth', 'drop', 'max', 'broad', 'vertical', 'approach', 'tuck', 'bound', 'swing', 'throw', 'slam', 'toss', 'sled', 'shuttle', 'tempo',
        'interval', 'steady', 'ride', 'flying', 'build-up', 'heavy', 'deadlift', 'squat jump', 'clean', 'snatch', 'jerk', 'press', 'to stick', 'decel', 'single-leg',
        'double under', 'resisted', 'hurdle', 'turns', 'criss',
      ],
    },
    name: (n) => `${n} Against the Clock`, cue: 'Count clean reps in the time; a rep that is not clean does not count.', level: 'same', pool: 'all',
    dosage: (d) => ({ sets: d.sets, seconds: 20, restSec: Math.max(30, d.restSec) }),
  },
];

const BY_ID = new Map(MODIFIERS.map((m) => [m.id, m]));
export const modifierById = (id: string): Modifier | undefined => BY_ID.get(id);

const RE_CACHE = new Map<readonly string[], RegExp>();
const re = (ws: readonly string[]): RegExp => {
  let r = RE_CACHE.get(ws);
  if (!r) { r = wordsRe(ws); RE_CACHE.set(ws, r); }
  return r;
};

/** Why a modifier's rule refuses this base (empty = it applies). Each reason names the rule it breaks. */
/** Implements a cue names, and the kit that makes the word fit ("the bar" on a cable press is a seed cue-family slip). */
const KIT_WORDS: readonly [RegExp, readonly EquipmentId[]][] = [
  [/\bthe bar\b|\bbend the bar\b/i, ['barbell', 'ez-bar', 'trap-bar', 'pull-up-bar', 'landmine', 'dip-bars', 'machine', 'cable', 'other']],
  [/\bthe band\b/i, ['band', 'mini-band']],
  [/\bthe dumbbells?\b/i, ['dumbbell']],
  [/\bthe (?:kettle)?bell\b/i, ['kettlebell', 'dumbbell']],
];
function kitMismatch(base: Pick<LibraryExercise, 'cues' | 'equipment'>): string | null {
  for (const [re, kit] of KIT_WORDS) {
    const hit = base.cues.find((c) => re.test(c));
    if (hit && !base.equipment.some((x) => kit.includes(x))) return `"${re.exec(hit)![0]}"`;
  }
  return null;
}

export function ruleFailures(rule: ModifierRule, base: Pick<LibraryExercise, 'name' | 'category' | 'pattern' | 'laterality' | 'equipment' | 'goals' | 'level'> & Partial<Pick<LibraryExercise, 'cues'>>): string[] {
  const out: string[] = [];
  // every modifier: one level deep (R5), never on a garbled or person-named seed name
  { const m = re(GLOBAL_NOT).exec(base.name); if (m) out.push(`name word "${m[0].replace(/^[^a-z0-9]/i, '')}" already names a modifier or a person (R5)`); }
  if (MESSY_NAME.some((r) => r.test(base.name))) out.push(`name "${base.name}" is punctuated in a way a modifier would garble`);
  if (base.cues) { const k = kitMismatch({ cues: base.cues, equipment: base.equipment }); if (k) out.push(`its cues name ${k}, which it does not use (a variant would copy the wrong cue)`); }
  if (!rule.categories.includes(base.category)) out.push(`category ${base.category} not in [${rule.categories.join(', ')}]`);
  if (rule.patterns && !rule.patterns.includes(base.pattern)) out.push(`pattern ${base.pattern} not in [${rule.patterns.join(', ')}]`);
  if (rule.laterality && !rule.laterality.includes(base.laterality)) out.push(`laterality ${base.laterality} not in [${rule.laterality.join(', ')}]`);
  if (rule.equipmentAny && !base.equipment.some((x) => rule.equipmentAny!.includes(x))) out.push(`needs one of [${rule.equipmentAny.join(', ')}]`);
  const banned = rule.equipmentNot ? base.equipment.filter((x) => rule.equipmentNot!.includes(x)) : [];
  if (banned.length) out.push(`equipment ${banned.join(', ')} refused`);
  if (rule.bodyweightOnly && !base.equipment.every((x) => AMBIENT.includes(x))) out.push('bodyweight bases only');
  if (rule.nameAny && !re(rule.nameAny).test(base.name)) out.push(`name "${base.name}" is not one it applies to`);
  if (rule.nameNot) { const m = re(rule.nameNot).exec(base.name); if (m) out.push(`name word "${m[0].replace(/^[^a-z0-9]/i, '')}" refused`); }
  for (const r of rule.namePatternsNot ?? []) if (r.test(base.name)) out.push(`name "${base.name}" matches ${r} (refused)`);
  if (rule.goalsAny && !base.goals.some((g) => rule.goalsAny!.includes(g))) out.push(`needs a goal in [${rule.goalsAny.join(', ')}]`);
  if (rule.minLevel && levelRank(base.level) < levelRank(rule.minLevel)) out.push(`level ${base.level} below ${rule.minLevel}`);
  return out;
}

/** The modifier id a generated entry's variation names ("goblet+paused" → "paused"), or null. */
export function modifierOf(variation: string): string | null {
  const i = variation.lastIndexOf('+');
  return i > 0 ? variation.slice(i + 1) : null;
}

/** R1, for reports and tests: the slow-tempo modifiers. */
export const SLOW_TEMPO_MODIFIERS = ['paused', 'tempo', 'iso-hold', 'one-and-a-half'] as const;
