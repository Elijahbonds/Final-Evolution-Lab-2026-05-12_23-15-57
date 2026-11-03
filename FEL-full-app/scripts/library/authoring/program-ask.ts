// scripts/library/authoring/program-ask.ts — PROGRAM-ASK-2 (2026-11-02): batch 5, the band and home entries "Build my
// program" found missing, as FEL DRAFTS for the owner's review → data/library/authored/b5-program-ask.json.
//
// Coordinator, 2026-11-02 (review of the band-only sample): "Author the missing library entries as DRAFTS that pass the
// library validator, each with regression/progression links". The library had no band-loaded squat (band under the
// feet; its "Squat with Bands" is a barbell lift with bands), no band front squat, no band split squat, no band
// rear-foot-elevated split squat, no pike push-up and no beginner conditioning move that does not leave the floor.
//
// ONE GENERATOR (coordinator, 2026-11-03, PR #515): these entries are built by scripts/library/author.ts buildAll as
// batch 5, like every other authored batch, so a re-run of the generator reproduces everything on disk
// (tests/library-p8/generator.test.ts) and they pass through the same CUE-STYLE step (./cue-style.ts) as batches 1–4.
// Write them with: npx tsx scripts/library/author.ts --batch 5 (the validator gate runs over the whole library first).
// Unlike batches 1–4 they are written out whole here, not from a family × variant matrix: six entries, each its own
// movement.
//
// THE LADDER (each entry's regressionId / progressionId, to real entries):
//   Bodyweight Squat → Band Under-Feet Squat → Band Front Squat → Band Split Squat → Band Rear-Foot-Elevated Split Squat →
//   Dumbbell Rear-Foot-Elevated Split Squat;  Incline Push-Up → Pike Push-Up → Handstand Push-Ups;
//   Bear Plank Hold → Step-In Mountain Climber → Mountain Climber Run.
// Youth: all six are youthOk, and none carries max-effort wording (the validator's youth check).
// Demo loops: the squats and split squats are written in families and variations the avatar's existing loops cover
// (lib/library/demo.ts); the pike push-up and the step-in climber have none yet (gaps for the demo-loops lane).
import type { LibraryExercise } from '../../../lib/library/types';

export const PROGRAM_ASK_BATCH = 5;
const BATCH = 'authored-b5-program-ask';
const LICENCE = 'FEL original (Final Evolution Lab)';

type Spec = Omit<LibraryExercise, 'slug' | 'aliases' | 'plane' | 'sportTags' | 'skillLayer' | 'braceMode' | 'cautions' | 'lowLoad' | 'youthOk' | 'prehabNote' | 'demo' | 'source' | 'review' | 'secondaryMuscles'>
  & Partial<Pick<LibraryExercise, 'aliases' | 'plane' | 'sportTags' | 'skillLayer' | 'braceMode' | 'cautions' | 'lowLoad' | 'secondaryMuscles'>> & { clipKey: LibraryExercise['demo']['clipKey'] };

const SPECS: Spec[] = [
  {
    id: 'band-under-feet-squat', name: 'Band Under-Feet Squat', aliases: ['Stand-On-Band Squat'], family: 'squat', variation: 'squat', pattern: 'squat', laterality: 'bilateral',
    category: 'strength', level: 'beginner', equipment: ['band'], primaryMuscles: ['quads', 'glutes'], secondaryMuscles: ['adductors', 'deep-core'],
    goals: ['strength', 'hypertrophy'], clipKey: 'squat',
    setup: 'Stand on the middle of a long band, feet shoulder-width. Loop it over both shoulders, or hold the ends at your shoulders.',
    cues: ['Sit down between your heels, then stand the band up tall.', 'Spread the floor with your feet on the way up.', 'Keep the band path straight up and down.'],
    faults: [
      { fault: 'Knees falling in as the band pulls down', fix: 'Push the floor apart with your feet on the way up.' },
      { fault: 'Heels lifting at the bottom', fix: 'Keep the whole foot pressed down on the band.' },
    ],
    regressionId: 'bodyweight-squat', progressionId: 'band-front-squat', dosage: { sets: 3, reps: '8-12', restSec: 75 },
  },
  {
    id: 'band-front-squat', name: 'Band Front Squat', family: 'squat', variation: 'front-squat', pattern: 'squat', laterality: 'bilateral',
    category: 'strength', level: 'beginner', equipment: ['band'], primaryMuscles: ['quads'], secondaryMuscles: ['glutes', 'deep-core', 'mid-back'],
    goals: ['strength', 'hypertrophy', 'posture'], clipKey: 'squat',
    setup: 'Stand on the middle of a long band, feet shoulder-width. Hold the ends at the front of your shoulders, elbows high and pointing forward.',
    cues: ['Hold the band ends high in front, like carrying a tray.', 'Sit straight down between your heels.', 'Stand the band up tall and quiet.'],
    faults: [
      { fault: 'Elbows dropping and the chest folding forward', fix: 'Keep the band ends high and pointed at the wall in front.' },
      { fault: 'Knees falling in on the way up', fix: 'Spread the floor with your feet.' },
    ],
    regressionId: 'band-under-feet-squat', progressionId: 'band-split-squat', dosage: { sets: 3, reps: '8-12', restSec: 75, tempo: '3-1-1-0' },
  },
  {
    id: 'band-split-squat', name: 'Band Split Squat', family: 'split-squat', variation: 'band', pattern: 'lunge', laterality: 'unilateral',
    category: 'strength', level: 'intermediate', equipment: ['band'], primaryMuscles: ['quads', 'glutes'], secondaryMuscles: ['adductors', 'glute-med'],
    goals: ['strength', 'balance', 'hypertrophy'], clipKey: 'lunge',
    setup: 'Split stance, front foot standing on the middle of a long band. Hold the ends at your shoulders.',
    cues: ['Drop the back knee straight down toward the floor.', 'Push the floor away with the front foot to stand up.', 'Keep the band path straight up and down.'],
    faults: [
      { fault: 'Front knee caving in', fix: 'Keep the front knee over the middle toes.' },
      { fault: 'Leaning forward over the front leg', fix: 'Stay tall, like a wall is in front of your chest.' },
    ],
    regressionId: 'split-squat', progressionId: 'band-rear-foot-elevated-split-squat', dosage: { sets: 3, reps: '8 each side', restSec: 75 },
  },
  {
    id: 'band-rear-foot-elevated-split-squat', name: 'Band Rear-Foot-Elevated Split Squat', aliases: ['Band Bulgarian Split Squat'], family: 'split-squat', variation: 'rfe-band',
    pattern: 'lunge', laterality: 'unilateral', category: 'strength', level: 'intermediate', equipment: ['band'], primaryMuscles: ['quads', 'glutes'],
    secondaryMuscles: ['adductors', 'glute-med', 'hip-flexors'], goals: ['strength', 'balance', 'hypertrophy'], clipKey: 'lunge',
    setup: 'Back foot on a sturdy chair or step. Front foot on the middle of a long band; ends held at your shoulders.',
    cues: ['Drop straight down between the front foot and the chair.', 'Push the floor away with the front foot.', 'Keep the band path straight up and down.'],
    faults: [
      { fault: 'Pushing off the back foot', fix: 'Drive the floor away in front; the chair only holds balance.' },
      { fault: 'Front knee caving in', fix: 'Keep the front knee over the middle toes.' },
    ],
    cautions: ['Pick the band split squat with both feet on the floor until the balance feels steady.'],
    regressionId: 'band-split-squat', progressionId: 'dumbbell-rear-foot-elevated-split-squat', dosage: { sets: 3, reps: '8 each side', restSec: 90 },
  },
  {
    id: 'pike-push-up', name: 'Pike Push-Up', family: 'push-up', variation: 'pike', pattern: 'push', laterality: 'bilateral', plane: 'sagittal',
    category: 'strength', level: 'beginner', equipment: [], primaryMuscles: ['delts', 'triceps'], secondaryMuscles: ['traps', 'serratus', 'deep-core'],
    goals: ['strength', 'shoulder'], clipKey: 'push',
    setup: 'Hands on the floor shoulder-width, hips high so your body makes an upside-down V, feet walked in close.',
    cues: ['Lower the top of your head toward a spot in front of your hands.', 'Push the floor away until the arms are long.', 'Keep the upside-down V tall the whole set.'],
    faults: [
      { fault: 'Hips dropping into a regular push-up', fix: 'Walk in closer until the V is tall again.' },
      { fault: 'Elbows flaring straight out', fix: 'Lower toward the floor in an arrow shape, not a T.' },
    ],
    cautions: ['Pick the incline push-up if the head-down position feels like too much.'],
    regressionId: 'incline-push-up', progressionId: 'handstand-push-ups', dosage: { sets: 3, reps: '6-10', restSec: 75 },
  },
  {
    id: 'step-in-mountain-climber', name: 'Step-In Mountain Climber', aliases: ['Slow Mountain Climber'], family: 'cardio', variation: 'step-in-mountain-climber',
    pattern: 'locomotion', laterality: 'alternating', plane: 'sagittal', category: 'conditioning', level: 'beginner', equipment: [],
    primaryMuscles: ['deep-core', 'hip-flexors'], secondaryMuscles: ['delts', 'quads', 'abs'], goals: ['conditioning', 'trunk'], clipKey: 'crawl', skillLayer: null, braceMode: 'set',
    setup: 'High plank, hands under shoulders, body long from head to heels.',
    cues: ['Step in toward the floor under your chest, then back out, and switch.', 'Stay flat enough to balance a tray.', 'Quick, quiet steps: the feet never leave the floor together.'],
    faults: [
      { fault: 'Hips piking up as the pace rises', fix: 'Stay long and flat as a plank of wood.' },
      { fault: 'Hopping both feet at once', fix: 'One foot at a time, always one foot on the floor.' },
    ],
    regressionId: 'bear-plank-hold', progressionId: 'mountain-climber-run', dosage: { sets: 4, seconds: 30, restSec: 30 },
  },
];

function entryOf(s: Spec): LibraryExercise {
  const { clipKey, ...rest } = s;
  return {
    slug: s.id, aliases: [], plane: 'sagittal', sportTags: ['general'], skillLayer: 'strength', braceMode: 'set', cautions: [], lowLoad: [], secondaryMuscles: [],
    ...rest,
    youthOk: true, prehabNote: null,
    demo: { clipKey, videoUrl: null, imageRef: null },
    source: { kind: 'authored', ref: `program-ask/${s.family}/${s.variation}`, url: null, licence: LICENCE },
    review: { status: 'draft', reviewer: null, batch: BATCH },
  } as LibraryExercise;
}

export const PROGRAM_ASK_ENTRIES: readonly LibraryExercise[] = SPECS.map(entryOf);

