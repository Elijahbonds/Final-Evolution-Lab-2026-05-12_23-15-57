// scripts/library/authoring/modifiers.ts — EXERCISE-LIBRARY (2026-10-25): the follow-up batches' axis of the matrix.
//
// A modifier turns one authored entry into a real, distinct exercise a coach programs on purpose (a paused squat, a
// single-arm row, an off-hand finish) — a new (pattern, equipment, variation) key, never a reworded copy. Each one
// changes the name, one cue (its own, in FEL's style), the level and the dose, and links back to its base as the
// easier version. Batch 1 ships none of them; `author.ts --batch 2` (3, 4) writes them for the owner's next reviews.

import type { LibraryExercise } from '../../../lib/library/types';
import { levelRank } from '../../../lib/library/vocab';

export interface Modifier {
  id: string;
  batch: 2 | 3 | 4;
  applies: (e: LibraryExercise) => boolean;
  name: (n: string) => string;
  cue: string;
  level: 'same' | 'up';
  laterality?: LibraryExercise['laterality'];
  dosage?: (d: LibraryExercise['dosage']) => LibraryExercise['dosage'];
  equipment?: (eq: LibraryExercise['equipment']) => LibraryExercise['equipment'];
  youthOk?: boolean;
}

const LOADED = (e: LibraryExercise) => e.equipment.some((x) => ['dumbbell', 'kettlebell', 'barbell', 'cable', 'landmine', 'trap-bar'].includes(x));
const STRENGTH = (e: LibraryExercise) => e.category === 'strength' && ['squat', 'hinge', 'lunge', 'push', 'pull'].includes(e.pattern);
const has = (e: LibraryExercise, re: RegExp) => re.test(e.name.toLowerCase());

export const MODIFIERS: readonly Modifier[] = [
  {
    id: 'paused', batch: 2, applies: (e) => STRENGTH(e) && !has(e, /pause|iso|hold|hike|dowel|wall/), name: (n) => `Paused ${n}`,
    cue: 'Hold the bottom still for a two-count, then move.', level: 'up', dosage: (d) => ({ ...d, tempo: '2-2-1-0' }),
  },
  {
    id: 'tempo', batch: 2, applies: (e) => STRENGTH(e) && !has(e, /tempo|second lower|eccentric|iso|hold|hike/), name: (n) => `${n} with 4-Second Lower`,
    cue: 'Lower on a slow four-count, then move at normal speed.', level: 'same', dosage: (d) => ({ ...d, tempo: '4-0-1-0' }),
  },
  {
    id: 'single-arm', batch: 2, applies: (e) => ['push', 'pull'].includes(e.pattern) && e.laterality === 'bilateral' && e.equipment.some((x) => ['dumbbell', 'kettlebell', 'cable', 'band'].includes(x)) && !has(e, /single|one-arm|swing/),
    name: (n) => `Single-Arm ${n}`, cue: 'Keep the shoulders square to the wall ahead while one side works.', level: 'up', laterality: 'unilateral',
  },
  {
    id: 'offset', batch: 2, applies: (e) => ['squat', 'lunge', 'carry'].includes(e.pattern) && e.equipment.some((x) => ['dumbbell', 'kettlebell'].includes(x)) && !has(e, /offset|suitcase|single/),
    name: (n) => `Offset ${n}`, cue: 'Grow tall toward the ceiling; do not lean toward the load.', level: 'up',
  },
  {
    id: 'iso-hold', batch: 3, applies: (e) => STRENGTH(e) && !has(e, /iso|hold|hike|swing|dowel/), name: (n) => `${n} Isometric Hold`,
    cue: 'Stop at the hardest point of the range and hold still, breathing smoothly.', level: 'same', dosage: (d) => ({ sets: d.sets, seconds: 20, restSec: d.restSec }),
  },
  {
    id: 'one-and-a-half', batch: 3, applies: (e) => STRENGTH(e) && LOADED(e) && !has(e, /iso|hold|pause|swing|hike/), name: (n) => `1.5-Rep ${n}`,
    cue: 'All the way down, halfway up, back down, then all the way up: that is one rep.', level: 'up',
  },
  {
    id: 'half-kneeling', batch: 3, applies: (e) => ['push', 'pull', 'rotation'].includes(e.pattern) && e.equipment.some((x) => ['cable', 'band', 'landmine', 'dumbbell', 'kettlebell'].includes(x)) && !has(e, /kneeling|bench|lying|floor|seated|inverted|pull-up|chin|dip|row/),
    name: (n) => `Half-Kneeling ${n}`, cue: 'Tuck the belt buckle up and keep the down knee heavy on the floor the whole set.', level: 'same',
  },
  {
    id: 'deficit', batch: 3, applies: (e) => ['lunge', 'hinge'].includes(e.pattern) && LOADED(e) && !has(e, /deficit|elevated|single-leg|swing|thrust|bridge|curl/),
    name: (n) => `Deficit ${n}`, cue: 'Stand on a low plate so the range runs a little past the floor.', level: 'up',
  },
  {
    id: 'off-hand', batch: 4, applies: (e) => e.category === 'sport-skill' && (e.goals.includes('handles') || e.goals.includes('finishing')) && !has(e, /off-hand|two-ball|weak/),
    name: (n) => `Off-Hand ${n}`, cue: 'Same drill with the ball in your weaker hand: slower and clean beats fast and sloppy.', level: 'up',
  },
  {
    id: 'reactive', batch: 4, applies: (e) => e.category === 'speed-agility' && !has(e, /reactive|mirror|march|skip|wall/), name: (n) => `Reactive ${n}`,
    cue: 'Go on a point or a call from a partner, not on your own count.', level: 'up',
  },
  {
    id: 'eyes-closed', batch: 4, applies: (e) => e.category === 'prehab' && e.goals.includes('balance') && !has(e, /eyes closed/), name: (n) => `${n} with Eyes Closed`,
    cue: 'Close your eyes and keep the floor under all three tripod points.', level: 'up',
  },
  {
    id: 'vest', batch: 4, applies: (e) => e.equipment.length === 0 && ['squat', 'lunge', 'push', 'pull'].includes(e.pattern) && e.category === 'strength' && levelRank(e.level) >= 1,
    name: (n) => `Weight-Vest ${n}`, cue: 'Same reps with the vest on: if the path changes, take it off.', level: 'up', youthOk: false,
  },
  {
    id: 'kettlebell', batch: 3, applies: (e) => e.equipment.includes('dumbbell') && !e.equipment.includes('kettlebell') && /dumbbell/i.test(e.name) && ['squat', 'hinge', 'lunge', 'carry', 'push', 'pull'].includes(e.pattern),
    name: (n) => n.replace(/dumbbells?/i, 'Kettlebell'), cue: 'Same path with a kettlebell: let the bell sit quiet against the forearm.', level: 'same',
    equipment: (eq) => eq.map((x) => (x === 'dumbbell' ? 'kettlebell' : x)),
  },
  {
    id: 'staggered', batch: 3, applies: (e) => ['squat', 'hinge'].includes(e.pattern) && e.laterality === 'bilateral' && LOADED(e) && e.category === 'strength' && !has(e, /stagger|kickstand|sumo|split|box|machine|press|hack|smith|seated|lying/),
    name: (n) => `Staggered-Stance ${n}`, cue: 'Set one foot half a step back with the toes on the floor; the front foot does most of the work.', level: 'up', laterality: 'unilateral',
  },
  {
    id: 'band-resisted', batch: 4, applies: (e) => e.equipment.length === 0 && e.category === 'strength' && ['squat', 'hinge', 'push'].includes(e.pattern) && !has(e, /band|hold|iso/),
    name: (n) => `Band-Resisted ${n}`, cue: 'A band pulls against the hardest part of the rep: finish strong against it.', level: 'up', equipment: () => ['band'],
  },
  {
    id: 'grip-swap', batch: 4, applies: (e) => ['push', 'pull'].includes(e.pattern) && e.category === 'strength' && LOADED(e) && e.laterality === 'bilateral' && !has(e, /grip|neutral|wide|close|fly|raise|curl|extension|pushdown|kickback/),
    name: (n) => `Neutral-Grip ${n}`, cue: 'Palms facing each other on the handles: the elbows stay closer to your sides.', level: 'same',
  },
  {
    id: 'game-speed', batch: 4, applies: (e) => e.category === 'sport-skill' && !has(e, /hold|stance|lying|game speed|clock/), name: (n) => `${n} at Game Speed`,
    cue: 'Full game speed now: if it gets sloppy, drop back to the slower version.', level: 'up',
  },
  {
    id: 'timed', batch: 4, applies: (e) => ['plyometric', 'speed-agility', 'conditioning'].includes(e.category) && !has(e, /clock|timed|hold|march|skip/), name: (n) => `${n} Against the Clock`,
    cue: 'Count clean reps in the time; a rep that is not clean does not count.', level: 'same', dosage: (d) => ({ sets: d.sets, seconds: 20, restSec: Math.max(30, d.restSec) }),
  },
  {
    id: 'wide-stance', batch: 4, applies: (e) => ['squat', 'hinge'].includes(e.pattern) && e.laterality === 'bilateral' && e.category === 'strength' && !has(e, /wide|sumo|narrow|stagger|machine|hack|smith|seated|lying|bridge|thrust|curl/),
    name: (n) => `Wide-Stance ${n}`, cue: 'Feet wider than usual, toes turned out to match: push the floor apart.', level: 'same',
  },
];
