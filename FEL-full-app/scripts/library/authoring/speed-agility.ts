// Authored block: speed and agility — the Playbook's ch7 (SAQ made simple): lean, crisp contacts, a stuck finish.
import { SPRINT_CAUTION, meters, reps, secs, type Family } from './types';

const B = 'speed-agility';
const GROUND_BACK = 'Push the ground back behind you.';
const QUICK = 'Quick, quiet contacts under you.';
const STICK = 'Stick it still and silent for a two-count.';

export const SPEED_AGILITY: Family[] = [
  {
    family: 'sprint-mechanics', block: B, category: 'speed-agility', pattern: 'locomotion', plane: 'sagittal', laterality: 'alternating', skillLayer: 'speed', braceMode: 'reflex',
    primary: ['hip-flexors', 'glutes', 'calves'], secondary: ['hamstrings', 'foot', 'deep-core'], goals: ['speed', 'warmup'], sport: ['general', 'basketball', 'soccer', 'football', 'track'],
    lowLoad: ['back'], youthOk: true, equipment: [], clip: 'sprint',
    setup: 'Stand tall with a clear lane ahead, arms bent about a right angle.',
    cues: ['Stay tall, like a string pulls the top of your head to the ceiling.', 'Strike the floor under you, not out in front.', 'Swing the hands from the pocket to the chin.'],
    faults: [
      { fault: 'Leaning back as the knee lifts', fix: 'Stay tall over the floor, like the string pulls you up.' },
      { fault: 'Feet slapping the floor', fix: 'Quick, quiet contacts under you on the ball of the foot.' },
    ],
    dosage: meters(3, 15, 30),
    variants: [
      { name: 'Wall March', v: 'wall-march', level: 'beginner', ladder: 'wall', equipment: ['wall'], setup: 'Hands on a wall at shoulder height, body leaning in at a sprint angle.', cue: 'Drive one knee up toward the wall, then switch, slow and sharp.', dosage: reps(3, '6 each side', 30), aliases: ['Wall Drive March'] },
      { name: 'Wall Drive Switches', v: 'wall-switch', level: 'intermediate', ladder: 'wall', equipment: ['wall'], setup: 'Hands on a wall at shoulder height, leaning in, one knee up.', cue: 'Switch the feet fast on the count: one, two, three, then hold still.', dosage: reps(4, '3 switches', 45), aliases: ['Wall Drill Switches'] },
      { name: 'A-March', v: 'a-march', level: 'beginner', cue: 'March forward, the knee up and the foot stepping down onto the floor under you.' },
      { name: 'A-Skip', v: 'a-skip', level: 'beginner', cue: 'Skip forward with a sharp knee lift and a quick contact with the floor under you.' },
      { name: 'B-Skip', v: 'b-skip', level: 'intermediate', cue: 'Skip, reach the foot out, then paw it back down to the floor under you.' },
      { name: 'High-Knee Run', v: 'high-knees', level: 'beginner', cue: 'Quick knees up toward the ceiling, short steps, travelling slowly forward.', aliases: ['High Knees'] },
      { name: 'Butt Kick Run', v: 'butt-kicks', level: 'beginner', cue: 'Quick heels up toward the seat of your shorts, short steps, light on the floor.', aliases: ['Heel Flicks'] },
      { name: 'Straight-Leg Bound', v: 'straight-leg', level: 'intermediate', cue: 'Legs nearly straight, paw the floor back under you like a wheel.', aliases: ['Scissor Run'] },
      { name: 'Ankling', v: 'ankling', level: 'beginner', cue: 'Tiny steps, ankles springy, rolling over the floor from the ball of the foot.' },
    ],
  },
  {
    family: 'acceleration', block: B, category: 'speed-agility', pattern: 'locomotion', plane: 'sagittal', laterality: 'alternating', skillLayer: 'speed', braceMode: 'reflex',
    primary: ['glutes', 'quads', 'calves'], secondary: ['hamstrings', 'hip-flexors'], goals: ['speed', 'power'], sport: ['general', 'basketball', 'soccer', 'football', 'track'],
    lowLoad: ['back'], youthOk: true, equipment: ['cone'], clip: 'sprint', cautions: [SPRINT_CAUTION],
    setup: 'Cones 10 metres apart on a flat, dry surface; start behind the first one.',
    cues: [GROUND_BACK, 'Lean into the run like you are falling forward, then catch yourself.', 'Stay low for the first five steps, then rise.'],
    faults: [
      { fault: 'Standing straight up in the first steps', fix: 'Stay low and push the ground back for the first five steps.' },
      { fault: 'Reaching out with the foot', fix: 'Strike the ground under you, not out in front.' },
    ],
    dosage: meters(6, 10, 75),
    variants: [
      { name: 'Falling Start', v: 'falling', level: 'beginner', setup: 'Stand tall behind the cone, feet together.', cue: 'Lean forward as one piece until you have to step, then sprint to the next cone.', aliases: ['Lean and Go'] },
      { name: 'Two-Point Start Sprint', v: 'two-point', level: 'beginner', setup: 'Split stance behind the cone, front foot just behind it, weight forward.' },
      { name: 'Half-Kneeling Start Sprint', v: 'half-kneel', level: 'intermediate', setup: 'Half-kneeling behind the cone, front foot just behind it.', cue: 'Drive off the front foot and push the ground back hard from the first step.' },
      { name: 'Push-Up Start Sprint', v: 'push-up', level: 'intermediate', setup: 'Lie face down behind the cone, hands under the shoulders.', cue: 'Push the floor away, get the feet under you, and sprint to the cone.' },
      { name: 'Three-Point Start Sprint', v: 'three-point', level: 'intermediate', setup: 'One hand on the floor behind the cone, feet staggered, hips a little above the shoulders.' },
      { name: 'Band-Resisted Sprint', v: 'band', level: 'intermediate', equipment: ['cone', 'band'], setup: 'A partner holds a band around your belt line from behind.', cue: 'Lean into the band and push the ground back with every step.' },
      { name: 'Sled-Resisted Sprint', v: 'sled', level: 'advanced', equipment: ['cone', 'sled'], setup: 'A light sled behind you on a harness or belt, the lane clear ahead.', cue: 'Light sled, fast steps: push the ground back behind you.' },
      { name: 'Hill Sprint', v: 'hill', level: 'intermediate', equipment: [], setup: 'A short, steady slope with a clear lane up it.', cue: 'Push the hill back down behind you with every step.', aliases: ['Uphill Sprint'] },
      { name: 'Flying 10', v: 'flying', level: 'advanced', ladder: 'flying', setup: 'Cones at 0, 20 and 30 metres; build speed for 20, sprint the last 10.', cue: 'Arrive at the second cone already fast, then run tall and loose.', dosage: meters(4, 30, 120), goals: ['speed'] },
      { name: 'Build-Up Run', v: 'build-up', level: 'beginner', ladder: 'flying', setup: 'A 40-metre lane with cones at each end.', cue: 'Build smoothly from a jog to fast over the lane, loose the whole way.', dosage: meters(4, 40, 60), goals: ['warmup', 'speed'] },
    ],
  },
  {
    family: 'deceleration', block: B, category: 'speed-agility', pattern: 'locomotion', plane: 'sagittal', laterality: 'bilateral', skillLayer: 'speed', braceMode: 'reflex',
    primary: ['quads', 'glutes'], secondary: ['hamstrings', 'calves', 'adductors'], goals: ['agility', 'landing', 'knee'], sport: ['general', 'basketball', 'soccer', 'tennis', 'football'],
    lowLoad: ['back'], youthOk: true, equipment: ['cone'], clip: 'sprint',
    setup: 'Two cones 10 metres apart; run from the first toward the second.',
    cues: ['Short, choppy steps as the cone arrives.', 'Sink the hips toward the floor and stick the stop at the cone.', STICK],
    faults: [
      { fault: 'Stopping with one long braking step', fix: 'Chop the feet: three short steps into the stop at the cone.' },
      { fault: 'Knees caving in on the stop', fix: 'Stop with the knees out over your laces and the hips low.' },
    ],
    dosage: reps(4, '4', 60),
    variants: [
      { name: 'Decel to Stick', v: 'stick', level: 'beginner', aliases: ['Stop and Stick'] },
      { name: 'Split-Stance Decel', v: 'split', level: 'intermediate', cue: 'Stop in a split stance, front foot flat, and stick it.' },
      { name: 'Decel to Backpedal', v: 'backpedal', level: 'intermediate', cue: 'Stick the stop, then backpedal away from the cone on the call.' },
      { name: 'Lateral Shuffle Decel', v: 'lateral', level: 'intermediate', plane: 'frontal', cue: 'Shuffle to the cone, plant the outside foot and stick the stop.', goals: ['defense'] },
      { name: 'Sprint, Decel and Turn', v: 'turn', level: 'advanced', cue: 'Stop at the cone, turn and sprint back: quick, quiet contacts the whole time.' },
    ],
  },
  {
    family: 'change-of-direction', block: B, category: 'speed-agility', pattern: 'locomotion', plane: 'multi', laterality: 'alternating', skillLayer: 'speed', braceMode: 'reflex',
    primary: ['quads', 'glutes', 'glute-med'], secondary: ['adductors', 'calves', 'obliques'], goals: ['agility', 'speed', 'conditioning'], sport: ['general', 'basketball', 'soccer', 'tennis', 'football'],
    lowLoad: ['back'], youthOk: true, equipment: ['cone'], clip: 'shuffle', cautions: [SPRINT_CAUTION],
    setup: 'Set the cones out for the drill on a flat, dry surface; walk it once before you run it.',
    cues: ['Sink the hips toward the floor before every cut.', 'Push the ground away from the way you want to go.', QUICK],
    faults: [
      { fault: 'Standing tall into the cut', fix: 'Lower the hips toward the floor a step before the cone.' },
      { fault: 'Rounding the turn wide', fix: 'Plant the outside foot close to the cone and push the ground back.' },
    ],
    dosage: reps(4, '2', 90),
    variants: [
      { name: '5-10-5 Shuttle', v: '5-10-5', level: 'intermediate', setup: 'Three cones in a line, 5 metres apart; start at the middle one.', aliases: ['Pro Agility Shuttle', '5-10-5 Drill'] },
      { name: 'T-Drill', v: 't-drill', level: 'intermediate', setup: 'Four cones in a T: one at the base, three across the top 10 metres away, 5 metres apart.', cue: 'Sprint, shuffle, shuffle, shuffle, backpedal, facing the same way the whole time.' },
      { name: 'Three-Cone L-Drill', v: 'l-drill', level: 'advanced', setup: 'Three cones in an L, 5 metres apart.', aliases: ['L-Drill', 'Three-Cone Drill'] },
      { name: 'Cone Weave', v: 'weave', level: 'beginner', setup: 'Six cones in a zig-zag, 3 metres apart.', cue: 'Weave through the cones, planting the outside foot close to each cone.' },
      { name: 'Box Drill', v: 'box', level: 'intermediate', setup: 'Four cones in a 5-metre square.', cue: 'Sprint, shuffle, backpedal, shuffle around the square, hips low at each cone.' },
      { name: 'Mirror Drill', v: 'mirror', level: 'intermediate', ladder: 'reactive', setup: 'Face a partner between two cones 5 metres apart.', cue: 'Copy your partner: shuffle when they shuffle, stop when they stop.', goals: ['defense', 'agility'] },
      { name: 'Reactive Point Drill', v: 'point', level: 'advanced', ladder: 'reactive', setup: 'A partner in front points left, right, forward or back.', cue: 'Go the moment the hand moves: first step fast, then stick it.' },
      { name: 'Reaction Ball Drop', v: 'ball-drop', level: 'beginner', ladder: 'ball', equipment: ['reaction-ball'], setup: 'A partner holds a reaction ball at shoulder height, a few steps away.', cue: 'Go on the drop and catch the ball before its second bounce off the floor.' },
      { name: 'Partner Ball Drop', v: 'tennis-drop', level: 'beginner', ladder: 'ball', equipment: ['basketball'], setup: 'A partner holds a ball out at shoulder height, a few steps away.', cue: 'Go on the drop and catch the ball before its second bounce off the floor.' },
    ],
  },
  {
    family: 'lateral-movement', block: B, category: 'speed-agility', pattern: 'locomotion', plane: 'frontal', laterality: 'alternating', skillLayer: 'speed', braceMode: 'reflex',
    primary: ['glute-med', 'adductors', 'quads'], secondary: ['calves', 'glutes'], goals: ['agility', 'defense', 'warmup'], sport: ['general', 'basketball', 'tennis', 'soccer'],
    lowLoad: ['back'], youthOk: true, equipment: ['cone'], clip: 'shuffle',
    setup: 'Two cones 5 metres apart; start in a low athletic stance at one.',
    cues: ['Push the floor away sideways with the trailing foot.', 'Keep the hips low and level, like under a low ceiling.', 'Keep a gap between the shoes: they never click together.'],
    faults: [
      { fault: 'Bouncing up and down', fix: 'Stay under the low ceiling: the head travels flat.' },
      { fault: 'Feet crossing or clicking', fix: 'Keep a gap between the shoes the whole way.' },
    ],
    dosage: reps(4, '4 lengths', 45),
    variants: [
      { name: 'Lateral Shuffle', v: 'shuffle', level: 'beginner', aliases: ['Side Shuffle'] },
      { name: 'Carioca', v: 'carioca', level: 'beginner', cue: 'Cross the trailing foot over the floor in front, then behind, hips turning with it.', aliases: ['Grapevine'], goals: ['warmup', 'agility', 'hip'] },
      { name: 'Crossover Run', v: 'crossover', level: 'intermediate', cue: 'Turn the hips and cross over, then square back up at the cone.' },
      { name: 'Banded Lateral Shuffle', v: 'banded', level: 'intermediate', equipment: ['cone', 'mini-band'], setup: 'Mini band around the ankles, low athletic stance.', cue: 'Keep tension on the band the whole way; never let it go slack.' },
      { name: 'Backpedal', v: 'backpedal', level: 'beginner', ladder: 'backpedal', plane: 'sagittal', clip: 'backpedal', cue: 'Stay low, chest over the knees, quick steps back over the floor.' },
      { name: 'Backpedal to Sprint', v: 'backpedal-sprint', level: 'intermediate', ladder: 'backpedal', plane: 'sagittal', clip: 'backpedal', cue: 'Backpedal, then open the hips and sprint to the cone on the call.' },
      { name: 'Drop Step to Sprint', v: 'drop-step', level: 'intermediate', ladder: 'backpedal', plane: 'multi', cue: 'Open the hip and drop the foot back toward the cone, then sprint.', goals: ['defense', 'speed'] },
    ],
  },
  {
    family: 'ladder', block: B, category: 'speed-agility', pattern: 'locomotion', plane: 'multi', laterality: 'alternating', skillLayer: 'wake-up', braceMode: 'reflex',
    primary: ['calves', 'hip-flexors'], secondary: ['foot', 'quads'], goals: ['footwork', 'warmup', 'agility'], sport: ['general', 'basketball', 'soccer', 'tennis', 'football'],
    lowLoad: ['back', 'shoulder', 'wrist'], youthOk: true, equipment: ['agility-ladder'], clip: 'sprint',
    setup: 'An agility ladder flat on the floor; start at one end.',
    cues: ['Light, quick feet: touch the floor and go.', 'Eyes up toward the end of the ladder, not down at your shoes.', 'Clean first, then fast.'],
    faults: [
      { fault: 'Kicking the rungs', fix: 'Slow down until every step lands clean, then speed up.' },
      { fault: 'Heavy, flat-footed steps', fix: 'Stay on the balls of the feet, quiet on the floor.' },
    ],
    dosage: reps(3, '2 lengths', 30),
    variants: [
      { name: 'Ladder One Foot In', v: 'one-in', level: 'beginner', cue: 'One foot in each square of the ladder, quick and light on the floor.' },
      { name: 'Ladder Two Feet In', v: 'two-in', level: 'beginner', cue: 'Both feet in each square of the ladder, quick and light on the floor.' },
      { name: 'Ladder Lateral Two In', v: 'lateral-two-in', level: 'beginner', plane: 'frontal', cue: 'Side-on: both feet in each square of the ladder, quick on the floor.' },
      { name: 'Ladder In-In-Out-Out', v: 'in-out', level: 'intermediate', cue: 'In, in, out, out down the ladder, a steady beat.' },
      { name: 'Ladder Hopscotch', v: 'hopscotch', level: 'intermediate', cue: 'Two feet in, then split out to the floor on both sides of the next square.' },
      { name: 'Ladder Crossover Shuffle', v: 'crossover-shuffle', level: 'advanced', cue: 'Cross over into the square, step, step out to the side, then cross again.' },
      { name: 'Ladder Single-Leg Hops', v: 'single-leg-hops', level: 'intermediate', laterality: 'unilateral', cue: 'Hop into each square on one foot, quiet every contact.', goals: ['ankle', 'footwork'] },
    ],
  },
  {
    family: 'sprint-conditioning', block: B, category: 'conditioning', pattern: 'locomotion', plane: 'sagittal', laterality: 'alternating', skillLayer: 'speed', braceMode: 'reflex',
    primary: ['quads', 'glutes', 'calves'], secondary: ['hamstrings', 'hip-flexors'], goals: ['conditioning', 'speed'], sport: ['general', 'basketball', 'soccer', 'football'],
    lowLoad: ['back'], youthOk: true, equipment: ['cone'], clip: 'sprint', cautions: [SPRINT_CAUTION],
    setup: 'Cones at the distances the drill names on a flat, dry surface.',
    cues: ['Run the turns low: touch the cone with the hand nearest the floor.', 'Keep every length the same speed, start to finish.', 'Breathe out long on the walk back.'],
    faults: [
      { fault: 'First length flat out, last one crawling', fix: 'Pick a pace you can hold for every length.' },
      { fault: 'Rounding the turns wide', fix: 'Plant the outside foot right at the cone and push the ground back.' },
    ],
    dosage: reps(4, '1', 120),
    variants: [
      { name: 'Court Shuttle Run', v: 'court-17', level: 'intermediate', setup: 'Two cones 15 metres apart (sideline to sideline).', cue: 'Seventeen lengths, touch every cone, the same speed each length.', aliases: ['17s', 'Sideline 17s'] },
      { name: 'Line Drill', v: 'lines', level: 'intermediate', setup: 'Cones at a quarter, half, three-quarter and full length of the court.', cue: 'Out and back to each cone in turn, low at every turn.', aliases: ['Suicides', 'Ladders Run'] },
      { name: 'Tempo Run', v: 'tempo', level: 'beginner', setup: 'A 100-metre lane or the length of a field.', cue: 'Run the length at a smooth, steady pace you could talk at, walk back.', dosage: reps(6, '100 m', 60), goals: ['conditioning'] },
      { name: '30-30 Shuttle', v: '30-30', level: 'intermediate', setup: 'Two cones 15 metres apart.', cue: 'Shuttle for 30 seconds, rest 30, every round at the same count of lengths.', dosage: secs(8, 30, 30) },
    ],
  },
];
