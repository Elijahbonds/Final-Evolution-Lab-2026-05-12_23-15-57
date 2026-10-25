// Authored block: dumbbell-only lower and upper work (the home-gym set), plus handle combinations and finishing reads.
import { reps, secs, type Family } from './types';

const B = 'dumbbell-home';
const TRIPOD = 'Heel, big toe, little toe: press all three into the floor.';
const KNEES_OUT = 'Knees travel out over your laces.';

export const DUMBBELL_AND_SKILL: Family[] = [
  {
    family: 'db-lower', block: B, category: 'strength', pattern: 'squat', plane: 'sagittal', laterality: 'bilateral', skillLayer: 'strength', braceMode: 'set',
    primary: ['quads', 'glutes'], secondary: ['adductors', 'hamstrings', 'forearms'], goals: ['strength', 'knee', 'hip'], sport: ['general', 'basketball'],
    lowLoad: ['back'], youthOk: true, equipment: ['dumbbell'],
    setup: 'Stand with the dumbbells held where the variant names, feet about shoulder-width.',
    cues: [TRIPOD, 'Sit down between your heels, then push the floor away to stand.', KNEES_OUT],
    faults: [
      { fault: 'Heels lifting off the floor', fix: 'Press the heels into the floor and sit only as deep as they stay down.' },
      { fault: 'Knees caving in', fix: 'Push the floor apart: knees out over your laces.' },
    ],
    dosage: reps(3, '8-12', 75),
    variants: [
      { name: 'Dumbbell Front Squat', v: 'front', level: 'intermediate', setup: 'A dumbbell on each shoulder, ends resting on the front of the shoulders, elbows forward.', cue: 'Keep the elbows pointing at the wall ahead the whole rep.' },
      { name: 'Dumbbell Sumo Squat', v: 'sumo', level: 'beginner', setup: 'Wide stance, toes out, one dumbbell hanging by the top end between the legs.', cue: 'Sit straight down with the dumbbell hanging still between the heels.' },
      { name: 'Dumbbell Box Squat', v: 'box', level: 'beginner', equipment: ['dumbbell', 'box'], setup: 'Dumbbells at your sides, a box behind you at a height you can sit to under control.', cue: 'Touch the box like it is made of glass, then stand.' },
      { name: 'Dumbbell Heels-Elevated Squat', v: 'heels-up', level: 'intermediate', equipment: ['dumbbell', 'plate'], setup: 'Heels on a thin plate, a dumbbell at each side, feet a little narrower than usual.', cue: 'Let the knees travel forward over the laces while the heels stay heavy on the plate.' },
      { name: 'Dumbbell Cossack Squat', v: 'cossack', level: 'advanced', plane: 'frontal', setup: 'Very wide stance, one dumbbell held at the chest.', cue: 'Sink to one side with the heel of the bent leg heavy on the floor.', goals: ['mobility', 'hip'] },
      { name: 'Dumbbell Lateral Lunge', v: 'lateral-lunge', level: 'intermediate', plane: 'frontal', setup: 'Feet together, a dumbbell held at the chest.', cue: 'Step wide and sit back toward the wall behind you over the bent leg.', goals: ['agility'] },
      { name: 'Dumbbell Step-Back to Knee Drive', v: 'step-back-knee', level: 'intermediate', laterality: 'alternating', pattern: 'lunge', setup: 'Dumbbells at your sides, standing tall.', cue: 'Step back into a lunge, then drive that knee up toward the ceiling as you stand.', goals: ['speed', 'balance'] },
      { name: 'Dumbbell Single-Leg Box Squat', v: 'sl-box', level: 'advanced', laterality: 'unilateral', equipment: ['dumbbell', 'box'], setup: 'Stand on one leg in front of a box, a light dumbbell held at the chest.', cue: 'Sit back to the box on one leg slowly, touch it, and stand.' },
    ],
  },
  {
    family: 'db-hinge', block: B, category: 'strength', pattern: 'hinge', plane: 'sagittal', laterality: 'bilateral', skillLayer: 'strength', braceMode: 'set',
    primary: ['hamstrings', 'glutes'], secondary: ['lower-back', 'forearms'], goals: ['strength', 'hip', 'speed'], sport: ['general', 'basketball', 'track'],
    lowLoad: ['knee'], youthOk: true, equipment: ['dumbbell'],
    setup: 'Stand tall with the dumbbells in front of the thighs, feet hip-width, knees soft.',
    cues: ['Push the wall behind you with your hips.', 'Slide the dumbbells down your thighs, close the whole way.', 'Stand tall by driving the hips forward to the wall ahead.'],
    faults: [
      { fault: 'Back rounding to chase depth', fix: 'Stop when the wall behind you is as far as the hips go.' },
      { fault: 'Dumbbells drifting away', fix: 'Keep the dumbbells brushing your thighs.' },
    ],
    dosage: reps(3, '10-12', 60, '3-0-1-0'),
    variants: [
      { name: 'Dumbbell Suitcase Romanian Deadlift', v: 'suitcase-rdl', level: 'beginner', setup: 'Dumbbells at your sides, palms facing in, feet hip-width.' },
      { name: 'Dumbbell Staggered-Stance Romanian Deadlift', v: 'staggered-rdl', level: 'intermediate', laterality: 'unilateral', setup: 'Most of the weight on the front leg, the back toe beside the front heel, dumbbells in front.' },
      { name: 'Dumbbell Good Morning', v: 'good-morning', level: 'intermediate', setup: 'One dumbbell held at the chest, feet hip-width, knees soft.' },
      { name: 'Dumbbell Glute Bridge', v: 'bridge', level: 'beginner', equipment: ['dumbbell', 'mat'], setup: 'On your back on a mat, knees bent, a dumbbell across the hips.', cues: ['Push the floor away through your heels and lift the belt buckle to the ceiling.', 'Hold the top still for a two-count.', 'Lower slow until the hips nearly touch the floor.'], primary: ['glutes'], secondary: ['hamstrings'], lowLoad: ['knee', 'back', 'shoulder', 'wrist'] },
      { name: 'Dumbbell Swing', v: 'swing', level: 'intermediate', setup: 'Hold one dumbbell by the top end, feet a little wider than the hips.', cues: ['Hike the dumbbell back high between your legs.', 'Snap the hips forward and let the dumbbell float to chest height.', 'Stand tall at the top: still for a beat.'], goals: ['power', 'conditioning'] },
    ],
  },
  {
    family: 'db-upper', block: B, category: 'strength', pattern: 'push', plane: 'sagittal', laterality: 'bilateral', skillLayer: 'strength', braceMode: 'set',
    primary: ['chest', 'delts', 'triceps'], secondary: ['serratus'], goals: ['strength', 'shoulder'], sport: ['general', 'basketball'],
    lowLoad: ['knee'], youthOk: true, equipment: ['dumbbell'],
    setup: 'Set up with the dumbbells as the variant names.',
    cues: ['Push the weight away on a smooth, straight path.', 'Lower slower than you push.', 'Keep the feet heavy on the floor the whole set.'],
    faults: [
      { fault: 'Weight drifting off the path', fix: 'Go lighter and push straight to the top.' },
      { fault: 'Bouncing at the bottom', fix: 'Pause the weight for a beat at the bottom.' },
    ],
    dosage: reps(3, '8-12', 75),
    variants: [
      { name: 'Dumbbell Squeeze Press', v: 'squeeze-press', level: 'intermediate', equipment: ['dumbbell', 'bench'], setup: 'Lie on a bench, two dumbbells pressed together over the chest.', cue: 'Press the dumbbells into each other the whole rep as they travel.' },
      { name: 'Dumbbell Landmine-Angle Press', v: 'angle-press', level: 'beginner', laterality: 'unilateral', setup: 'Split stance, one dumbbell at the shoulder held by the top end.', cue: 'Press the dumbbell up and forward at an angle, toward the top of the wall ahead.' },
      { name: 'Dumbbell Arnold-Style Press', v: 'rotating-press', level: 'intermediate', setup: 'Seated or standing, dumbbells at the shoulders, palms facing you.', cue: 'Turn the palms out as you press up toward the ceiling, and back on the way down.', cautions: ['Needs comfortable overhead range.'] },
      { name: 'Dumbbell Pullover', v: 'pullover', level: 'intermediate', equipment: ['dumbbell', 'bench'], setup: 'Lie on a bench, one dumbbell held over the chest by the top end in both hands.', cue: 'Lower the dumbbell back over your head toward the floor on an arc, then return.', primary: ['lats', 'chest'], secondary: ['triceps', 'serratus'], cautions: ['Needs comfortable overhead range.'] },
      { name: 'Dumbbell Incline Y Raise', v: 'incline-y', level: 'beginner', equipment: ['dumbbell', 'bench'], setup: 'Lie face down on a low incline bench, a light dumbbell hanging in each hand.', cue: 'Lift the dumbbells up and out in a Y toward the wall ahead, thumbs up.', primary: ['mid-back', 'rear-delts'], secondary: ['rotator-cuff'], pattern: 'pull', goals: ['shoulder', 'posture'] },
      { name: 'Dumbbell Renegade Row', v: 'renegade', level: 'advanced', laterality: 'alternating', setup: 'High plank with the hands on two dumbbells, feet wide.', cue: 'Row one dumbbell to your ribs while the other pushes the floor away; hips still.', primary: ['lats', 'mid-back', 'deep-core'], secondary: ['obliques', 'biceps'], pattern: 'pull', goals: ['trunk'] },
    ],
  },
  {
    family: 'handle-combos', block: 'basketball-handles', category: 'sport-skill', pattern: 'other', plane: 'multi', laterality: 'bilateral', skillLayer: 'wake-up', braceMode: 'reflex',
    primary: ['forearms', 'delts'], secondary: ['quads', 'deep-core'], goals: ['handles'], sport: ['basketball'],
    lowLoad: ['back', 'knee'], youthOk: true, equipment: ['basketball'], clip: 'dribble',
    setup: 'Athletic stance, knees bent, ball in the dribbling hand, eyes up.',
    cues: ['Pound the ball into the floor hard, below the knee.', 'Eyes up on a target on the wall, not on the ball.', 'Clean first, then fast.'],
    faults: [
      { fault: 'Watching the ball', fix: 'Eyes up on a target on the wall; feel the ball, do not look at it.' },
      { fault: 'Losing the rhythm between moves', fix: 'Slow down until the combo is clean, then speed up.' },
    ],
    dosage: secs(3, 30, 20),
    variants: [
      { name: 'Pound-Crossover Combo', v: 'pound-cross', level: 'beginner', cue: 'Two hard pounds, then a low crossover, then two pounds on the other side.' },
      { name: 'Crossover-Between Combo', v: 'cross-between', level: 'intermediate', cue: 'A low crossover, then the ball between the legs, back and forth.' },
      { name: 'Between-Behind Combo', v: 'between-behind', level: 'intermediate', cue: 'The ball between the legs, then behind the back, without a stop.' },
      { name: 'Two-Ball Crossover', v: 'two-ball-cross', level: 'advanced', setup: 'A ball in each hand, athletic stance.', cue: 'Cross both balls in front at the same time, one bouncing a beat behind the other.' },
      { name: 'Dribble with Ball Toss', v: 'toss', level: 'advanced', setup: 'A ball dribbling in one hand, a small ball in the other.', cue: 'Keep the dribble going while you toss and catch the small ball with the other hand.' },
      { name: 'Wall Dribble Overhead', v: 'wall-overhead', level: 'beginner', equipment: ['basketball', 'wall'], setup: 'Stand close to a wall, arm reaching up, ball on the wall above your head.', cue: 'Dribble the ball against the wall with the fingertips, quick and controlled.', goals: ['handles', 'shoulder'] },
    ],
  },
  {
    family: 'finishing-reads', block: 'basketball-finishing', category: 'sport-skill', pattern: 'locomotion', plane: 'multi', laterality: 'unilateral', skillLayer: 'jump-land', braceMode: 'reflex',
    primary: ['quads', 'calves', 'glutes'], secondary: ['delts', 'deep-core'], goals: ['finishing', 'footwork'], sport: ['basketball'],
    lowLoad: ['back'], youthOk: true, equipment: ['basketball', 'hoop', 'cone'], clip: 'layup',
    setup: 'A cone at the free-throw line as the defender, start at the top with the ball.',
    cues: ['Read the cone early and pick the finish before you gather.', 'Protect the ball with the off arm, the ball high and away.', 'Land quiet and balanced.'],
    faults: [
      { fault: 'Deciding too late', fix: 'Read the cone two dribbles early.' },
      { fault: 'Ball exposed on the gather', fix: 'Gather the ball high, away from the cone.' },
    ],
    dosage: reps(3, '8 makes', 30),
    variants: [
      { name: 'Two-Cone Finish Read', v: 'two-cone', level: 'intermediate', setup: 'Two cones near the basket; a partner points to one as you drive.', cue: 'Finish on the side away from the cone your partner points to.' },
      { name: 'Drive and Kick Footwork', v: 'drive-kick', level: 'intermediate', cue: 'Drive past the cone, jump stop, and pass the ball out to a target on the wall.', goals: ['handles', 'footwork'] },
      { name: 'Pro-Hop Finish', v: 'pro-hop', level: 'advanced', cue: 'Hop past the cone onto both feet, then rise strong with the ball high.' },
      { name: 'Crossover Gather Finish', v: 'cross-gather', level: 'advanced', cue: 'Cross the ball low at the cone, gather on the next step, and finish soft.' },
    ],
  },
];
