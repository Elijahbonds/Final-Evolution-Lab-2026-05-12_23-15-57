// Authored block: more strength — kettlebell, landmine and sandbag lower body, hinge accessories, more push and pull.
import { RANGE_CAUTION, meters, reps, secs, type Family } from './types';

const B = 'strength-extra';
const FLOOR_AWAY = 'Push the floor away to stand tall.';
const KNEES_OUT = 'Knees travel out over your laces.';
const WALL_BEHIND = 'Push the wall behind you with your hips.';

export const STRENGTH_EXTRA: Family[] = [
  {
    family: 'kb-lower', block: B, category: 'strength', pattern: 'squat', plane: 'sagittal', laterality: 'bilateral', skillLayer: 'strength', braceMode: 'set',
    primary: ['quads', 'glutes'], secondary: ['adductors', 'hamstrings', 'forearms'], goals: ['strength', 'hip'], sport: ['general', 'basketball'],
    lowLoad: ['back'], youthOk: true, equipment: ['kettlebell'],
    setup: 'Stand with the kettlebell where the variant names, feet a little wider than the hips.',
    cues: ['Heel, big toe, little toe: press all three into the floor.', FLOOR_AWAY, KNEES_OUT],
    faults: [
      { fault: 'Heels lifting off the floor', fix: 'Sit between the heels and keep them heavy on the floor.' },
      { fault: 'Knees caving in', fix: 'Push the floor apart: knees out over your laces.' },
    ],
    dosage: reps(3, '8-10', 75),
    variants: [
      { name: 'Kettlebell Sumo Deadlift', v: 'sumo-dl', level: 'beginner', setup: 'Wide stance, toes out, kettlebell on the floor between the feet.', cue: 'Sit the hips down, grip the handle, and push the floor apart to stand.', primary: ['glutes', 'adductors', 'quads'], secondary: ['hamstrings', 'forearms'] },
      { name: 'Kettlebell Sumo Squat', v: 'sumo-squat', level: 'beginner', setup: 'Wide stance, toes out, kettlebell hanging by the horns at arm\'s length.', cue: 'Sit straight down between the heels with the bell hanging still.' },
      { name: 'Kettlebell Front-Rack Reverse Lunge', v: 'rack-reverse-lunge', level: 'intermediate', laterality: 'alternating', setup: 'Two kettlebells in the rack on the front of the shoulders.', cue: 'Step back softly and drive the floor down through your front heel to return.' },
      { name: 'Kettlebell Suitcase Deadlift', v: 'suitcase-dl', level: 'beginner', laterality: 'unilateral', setup: 'One kettlebell on the floor beside one foot.', cue: 'Stand up tall and level, like the other hand held a matching bell.', goals: ['trunk', 'grip'] },
      { name: 'Kettlebell Goblet Reverse Lunge', v: 'goblet-reverse-lunge', level: 'beginner', laterality: 'alternating', setup: 'A kettlebell held by the horns at the chest.', cue: 'Step back softly and drive the floor down through your front heel to return.' },
      { name: 'Kettlebell Goblet Lateral Squat', v: 'goblet-lateral-squat', level: 'intermediate', plane: 'frontal', setup: 'Wide stance, a kettlebell held at the chest.', cue: 'Shift and sit over one heel on the floor, the other leg long, then shift across.' },
      { name: 'Double Kettlebell Swing', v: 'double-swing', level: 'advanced', equipment: ['kettlebell'], setup: 'Two kettlebells a foot in front, stance wide enough for both to pass.', cue: 'Hike the pair back high, then snap the hips through so each bell floats.', youthOk: false, primary: ['glutes', 'hamstrings'], secondary: ['forearms', 'lower-back'] },
    ],
  },
  {
    family: 'landmine-lower', block: B, category: 'strength', pattern: 'squat', plane: 'sagittal', laterality: 'bilateral', skillLayer: 'strength', braceMode: 'set',
    primary: ['quads', 'glutes'], secondary: ['deep-core', 'adductors'], goals: ['strength', 'knee'], sport: ['general', 'basketball', 'football'],
    lowLoad: ['back'], youthOk: true, equipment: ['landmine'],
    setup: 'Hold the end of the landmine bar at your chest with both hands, feet shoulder-width, leaning in a little.',
    cues: ['Sit down between your heels as the bar comes with you.', FLOOR_AWAY, KNEES_OUT],
    faults: [
      { fault: 'Bar drifting away from the chest', fix: 'Keep the bar end touching your chest from top to bottom.' },
      { fault: 'Knees caving in', fix: 'Push the floor apart: knees out over your laces.' },
    ],
    dosage: reps(3, '8-10', 75),
    variants: [
      { name: 'Landmine Squat', v: 'squat', level: 'beginner' },
      { name: 'Landmine Reverse Lunge', v: 'reverse-lunge', level: 'intermediate', laterality: 'alternating', cue: 'Step back softly and drive the floor down through your front heel to return.' },
      { name: 'Landmine Squat to Press', v: 'squat-press', level: 'intermediate', cue: 'Stand up and press the bar end up and away in one smooth push.', goals: ['power', 'shoulder'] },
      { name: 'Landmine Lateral Lunge', v: 'lateral-lunge', level: 'intermediate', plane: 'frontal', cue: 'Step wide and sit back over one heel, the bar at your chest.' },
      { name: 'Landmine Romanian Deadlift', v: 'rdl', level: 'beginner', setup: 'Straddle the bar facing the anchor, both hands on the bar end at the thighs.', cue: WALL_BEHIND, primary: ['hamstrings', 'glutes'], secondary: ['lower-back', 'forearms'] },
    ],
  },
  {
    family: 'sandbag', block: B, category: 'strength', pattern: 'squat', plane: 'sagittal', laterality: 'bilateral', skillLayer: 'strength', braceMode: 'set',
    primary: ['quads', 'glutes'], secondary: ['mid-back', 'forearms', 'deep-core'], goals: ['strength', 'trunk', 'grip'], sport: ['general', 'football'],
    lowLoad: [], youthOk: true, equipment: ['sandbag'],
    setup: 'Sandbag held in the crook of the elbows (the bear hug or zercher hold), feet shoulder-width.',
    cues: ['Squeeze the bag to your chest the whole rep.', 'Sit down between your heels, then push the floor away.', KNEES_OUT],
    faults: [
      { fault: 'Bag sliding down', fix: 'Squeeze the bag tight to your chest and grow tall.' },
      { fault: 'Rounding forward under the bag', fix: 'Show the logo on your shirt to the wall ahead.' },
    ],
    dosage: reps(3, '8-10', 75),
    variants: [
      { name: 'Sandbag Bear-Hug Squat', v: 'bear-hug-squat', level: 'beginner' },
      { name: 'Sandbag Zercher Squat', v: 'zercher-squat', level: 'intermediate', setup: 'Sandbag in the crook of the elbows, hands together.' },
      { name: 'Sandbag Reverse Lunge', v: 'reverse-lunge', level: 'intermediate', laterality: 'alternating', cue: 'Step back softly and drive the floor down through your front heel to return.' },
      { name: 'Sandbag Ground-to-Shoulder', v: 'ground-shoulder', level: 'advanced', laterality: 'alternating', setup: 'Sandbag on the floor between the feet.', cue: 'Hinge, lap the bag, then stand and roll it onto one shoulder.', youthOk: false, goals: ['power', 'strength'] },
      { name: 'Sandbag Shouldered Carry', v: 'shoulder-carry', level: 'intermediate', laterality: 'unilateral', setup: 'Sandbag resting on one shoulder.', cue: 'Grow tall toward the ceiling and take short, quiet steps.', dosage: meters(4, 30, 60) },
    ],
  },
  {
    family: 'hinge-accessory', block: B, category: 'strength', pattern: 'hinge', plane: 'sagittal', laterality: 'bilateral', skillLayer: 'strength', braceMode: 'set',
    primary: ['glutes', 'hamstrings'], secondary: ['lower-back'], goals: ['strength', 'hip', 'posture'], sport: ['general', 'basketball', 'track'],
    lowLoad: ['knee'], youthOk: true, equipment: ['band'],
    setup: 'Set up as the variant names, the back long and steady.',
    cues: [WALL_BEHIND, 'Stand tall by driving the hips forward to the wall ahead.', 'Pause at the top for a beat.'],
    faults: [
      { fault: 'Finishing by leaning back', fix: 'Stand tall and stop at a straight line to the floor.' },
      { fault: 'Squatting the hinge', fix: 'Push the wall behind you; the shins stay near vertical.' },
    ],
    dosage: reps(3, '12-15', 45),
    variants: [
      { name: 'Band Pull-Through', v: 'band-pull-through', level: 'beginner', setup: 'Face away from a band anchored low, the band between the legs in both hands.' },
      { name: 'Cable Pull-Through', v: 'cable-pull-through', level: 'beginner', equipment: ['cable'], setup: 'Face away from a low cable, the rope between the legs in both hands.' },
      { name: '45-Degree Back Extension', v: '45-ext', level: 'intermediate', equipment: ['bench'], setup: 'Hips on the pad of a 45-degree bench, feet anchored, arms crossed.', cue: 'Lower toward the floor slowly, then lift to a straight line with the wall.' },
      { name: 'Single-Leg 45-Degree Back Extension', v: '45-ext-sl', level: 'advanced', equipment: ['bench'], laterality: 'unilateral', setup: 'Hips on the pad of a 45-degree bench, one foot anchored.', cue: 'Lower toward the floor slowly, then lift to a straight line with the wall.' },
      { name: 'Frog Pump', v: 'frog-pump', level: 'beginner', equipment: ['mat'], setup: 'On your back on a mat, soles of the feet together, knees out wide.', cue: 'Push the floor away through the outside of the feet and lift the belt buckle up.', lowLoad: ['knee', 'back', 'shoulder'] },
      { name: 'Banded Good Morning', v: 'band-good-morning', level: 'beginner', setup: 'Stand on a band with it looped over the back of the neck, feet hip-width.', cautions: [RANGE_CAUTION] },
    ],
  },
  {
    family: 'push-extra', block: B, category: 'strength', pattern: 'push', plane: 'sagittal', laterality: 'bilateral', skillLayer: 'strength', braceMode: 'set',
    primary: ['chest', 'triceps', 'delts'], secondary: ['serratus', 'deep-core'], goals: ['strength', 'shoulder', 'trunk'], sport: ['general', 'basketball'],
    lowLoad: ['knee'], youthOk: true, equipment: [],
    setup: 'Set up as the variant names, the body in one long line.',
    cues: ['Push the floor away.', 'Lower as one plank; nothing sags.', 'Breathe out on the push.'],
    faults: [
      { fault: 'Hips sagging toward the floor', fix: 'Brace for a light punch and keep one long line to the floor.' },
      { fault: 'Rushing the bottom', fix: 'Lower on a two-count and touch light.' },
    ],
    dosage: reps(3, '6-10', 60),
    variants: [
      { name: 'T Push-Up', v: 't-push-up', level: 'intermediate', laterality: 'alternating', cue: 'Push the floor away, then turn into a side plank reaching to the ceiling.', goals: ['trunk', 'shoulder'] },
      { name: 'Spiderman Push-Up', v: 'spiderman', level: 'intermediate', laterality: 'alternating', cue: 'As you lower, bring one knee out to the side toward the elbow, over the floor.', goals: ['hip', 'trunk'] },
      { name: 'Staggered-Hand Push-Up', v: 'staggered', level: 'intermediate', setup: 'One hand a little ahead of the other on the floor, body in one long line.' },
      { name: 'Ring Push-Up', v: 'ring', level: 'advanced', equipment: ['rings'], setup: 'Hands on rings set a few inches above the floor, body in one long line.', cue: 'Push the rings down toward the floor and keep them close to your sides.' },
      { name: 'Seated Dumbbell Z Press', v: 'z-press', level: 'advanced', equipment: ['dumbbell', 'mat'], setup: 'Sit on the floor with the legs long, a dumbbell at each shoulder.', cue: 'Press the dumbbells straight up toward the ceiling without leaning back.', primary: ['delts', 'triceps'], secondary: ['deep-core', 'serratus'], cautions: ['Needs comfortable overhead range and a tall seated position first.'] },
      { name: 'Bottoms-Up Kettlebell Press', v: 'bottoms-up-press', level: 'advanced', equipment: ['kettlebell'], laterality: 'unilateral', setup: 'Hold a light kettlebell upside down by the handle at the shoulder.', cue: 'Crush the handle and press the bell up toward the ceiling, balanced.', primary: ['delts', 'rotator-cuff'], secondary: ['forearms', 'triceps'] },
      { name: 'Dumbbell Push Press', v: 'db-push-press', level: 'intermediate', equipment: ['dumbbell'], setup: 'Stand tall with a dumbbell at each shoulder.', cue: 'Dip straight down a few inches, then drive the floor away and press.', goals: ['power'] },
    ],
  },
  {
    family: 'pull-extra', block: B, category: 'strength', pattern: 'pull', plane: 'sagittal', laterality: 'bilateral', skillLayer: 'strength', braceMode: 'set',
    primary: ['lats', 'mid-back', 'forearms'], secondary: ['biceps', 'rear-delts'], goals: ['strength', 'grip', 'posture'], sport: ['general', 'basketball', 'football'],
    lowLoad: ['knee', 'back'], youthOk: true, equipment: ['pull-up-bar'],
    setup: 'Set up on the bar or the straps as the variant names.',
    cues: ['Drive your elbows toward your back pockets.', 'Crush the handle.', 'Lower all the way to full range, slow.'],
    faults: [
      { fault: 'Swinging to finish', fix: 'Hold still at the bottom and pull smooth.' },
      { fault: 'Short range', fix: 'Lower all the way to a long hang every rep.' },
    ],
    dosage: reps(3, '5-8', 90),
    variants: [
      { name: 'Towel Pull-Up', v: 'towel', level: 'advanced', equipment: ['pull-up-bar', 'towel'], setup: 'Two towels over the bar, one gripped in each hand.', goals: ['grip'] },
      { name: 'Towel Hang', v: 'towel-hang', level: 'intermediate', equipment: ['pull-up-bar', 'towel'], setup: 'Two towels over the bar, one gripped in each hand.', cues: ['Crush the towels and hang long.', 'Breathe smoothly through the hang.', 'Step down before the grip gives out.'], dosage: secs(3, 20, 60), goals: ['grip'] },
      { name: 'Suspension Trainer Row', v: 'strap-row', level: 'beginner', equipment: ['suspension-trainer'], setup: 'Hold the straps, lean back with the body straight, heels on the floor.', cue: 'Pull your chest to the handles as one straight plank.' },
      { name: 'Suspension Trainer Face Pull', v: 'strap-face-pull', level: 'intermediate', equipment: ['suspension-trainer'], setup: 'Hold the straps at face height, lean back with the body straight.', cue: 'Pull the handles toward your forehead, finishing with the hands beside your ears.', primary: ['rear-delts', 'mid-back'], secondary: ['rotator-cuff'], goals: ['shoulder', 'posture'] },
      { name: 'Band Straight-Arm Pulldown', v: 'band-straight-arm', level: 'beginner', equipment: ['band'], setup: 'A band anchored high, an end in each hand, arms long in front.', cue: 'Sweep the band down to your thighs with straight arms, then let it back up slow.' },
      { name: 'Kettlebell High Pull, Light', v: 'kb-high-pull', level: 'intermediate', equipment: ['kettlebell'], setup: 'Kettlebell between the feet, hinge back and grip the handle.', cue: 'Snap the hips through and pull the bell close to chest height, elbow high.', goals: ['power'], youthOk: true },
    ],
  },
];
