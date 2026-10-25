// Authored block: more athletic work — bounding and skips, curve runs, net-sport footwork, more prehab and mobility.
import { contacts, meters, reps, secs, type Family } from './types';

const B = 'athletic-extra';
const QUIET = 'Land quiet: as little sound as you can.';
const EXHALE = 'Let the air out longer than it came in.';

export const ATHLETIC_EXTRA: Family[] = [
  {
    family: 'bounding', block: B, category: 'plyometric', pattern: 'locomotion', plane: 'sagittal', laterality: 'alternating', skillLayer: 'jump-land', braceMode: 'reflex',
    primary: ['glutes', 'calves', 'hamstrings'], secondary: ['hip-flexors', 'quads', 'foot'], goals: ['speed', 'power'], sport: ['general', 'track', 'basketball', 'soccer'],
    lowLoad: ['back'], youthOk: true, equipment: ['cone'], clip: 'bound', cautions: ['Plyometric: only once landings are quiet and stable. Count contacts, not sets.'],
    setup: 'A 20-metre lane on grass or a court, cones at each end.',
    cues: ['Push the ground back and float forward into the next contact.', 'Drive the front knee up toward the wall ahead.', 'Every contact lands under you, quick and springy on the floor.'],
    faults: [
      { fault: 'Short, choppy bounds', fix: 'Push the ground back hard and hang in the air a beat longer.' },
      { fault: 'Landing out in front with a straight leg', fix: 'Paw the floor back under you as you land.' },
    ],
    dosage: contacts(4, 10, 75),
    variants: [
      { name: 'Power Skip', v: 'power-skip', level: 'beginner', cue: 'Skip as high as you can off the floor, the knee and the opposite arm driving up.', goals: ['vertical', 'warmup'] },
      { name: 'Alternate-Leg Bound', v: 'alternate', level: 'intermediate', aliases: ['Running Bound'] },
      { name: 'Single-Leg Bound Series', v: 'single-leg', level: 'advanced', laterality: 'unilateral', cue: 'Bound on the same leg down the lane, quick and springy on each contact.', dosage: contacts(3, 6, 90) },
      { name: 'Bound to Sprint', v: 'to-sprint', level: 'advanced', cue: 'Four bounds into a ten-metre sprint, the rhythm unbroken.' },
      { name: 'Ankle Skip', v: 'ankle-skip', level: 'beginner', cue: 'Low, quick skips off the ball of the foot, the floor hot.', goals: ['ankle', 'warmup'] },
    ],
  },
  {
    family: 'curve-run', block: B, category: 'speed-agility', pattern: 'locomotion', plane: 'multi', laterality: 'alternating', skillLayer: 'speed', braceMode: 'reflex',
    primary: ['glutes', 'adductors', 'calves'], secondary: ['glute-med', 'obliques'], goals: ['speed', 'agility'], sport: ['general', 'basketball', 'soccer', 'football'],
    lowLoad: ['back'], youthOk: true, equipment: ['cone'], clip: 'sprint', cautions: ['Full warm-up first; stop the set when the speed drops.'],
    setup: 'Cones in an arc (a quarter circle about 10 metres across) on a flat surface.',
    cues: ['Lean into the curve from the ground up, like a bike turning.', 'Push the ground away with the outside foot.', 'Quick, quiet contacts on the floor around the arc.'],
    faults: [
      { fault: 'Drifting wide of the cones', fix: 'Lean in earlier and push the floor away with the outside foot.' },
      { fault: 'Slowing into the curve', fix: 'Arrive at the arc already fast and hold the speed through it.' },
    ],
    dosage: reps(4, '2 each way', 75),
    variants: [
      { name: 'Curve Run', v: 'curve', level: 'intermediate', aliases: ['Arc Sprint'] },
      { name: 'Figure-8 Run', v: 'figure-8', level: 'intermediate', setup: 'Two cones 6 metres apart.', cue: 'Run a figure-8 around the cones, leaning into each turn from the ground up.' },
      { name: 'Circle Shuffle-to-Sprint', v: 'circle-shuffle', level: 'advanced', setup: 'Cones in a 5-metre circle.', cue: 'Shuffle around the circle, then turn and sprint out on the call.' },
      { name: 'Banded Lateral Lunge Hold to Sprint', v: 'band-lateral-sprint', level: 'advanced', equipment: ['cone', 'band'], setup: 'A band around the belt line held by a partner to one side.', cue: 'Push the floor away against the band, then sprint when it releases.' },
    ],
  },
  {
    family: 'net-footwork', block: B, category: 'sport-skill', pattern: 'locomotion', plane: 'frontal', laterality: 'alternating', skillLayer: 'speed', braceMode: 'reflex',
    primary: ['quads', 'glute-med', 'calves'], secondary: ['adductors', 'glutes'], goals: ['footwork', 'agility', 'vertical'], sport: ['volleyball', 'tennis'],
    lowLoad: ['back'], youthOk: true, equipment: ['cone'], clip: 'shuffle',
    setup: 'Ready stance at the middle of the space, cones marking the spots to reach.',
    cues: ['Split step as the play starts: a small hop to land ready on the floor.', 'Push the floor away toward the spot.', 'Recover to the middle with quick, quiet steps.'],
    faults: [
      { fault: 'Flat-footed start', fix: 'Small split step onto the floor, on the balls of the feet, before every move.' },
      { fault: 'Crossing the feet on the recovery', fix: 'Shuffle back with a gap between the shoes.' },
    ],
    dosage: reps(4, '30 s', 45),
    variants: [
      { name: 'Split Step Reaction', v: 'split-step', level: 'beginner', cue: 'Small split step, then go where a partner points.', aliases: ['Split Step'] },
      { name: 'Four-Corner Footwork', v: 'four-corner', level: 'intermediate', setup: 'Four cones in a square around you, 3 metres out.', cue: 'Split step, touch a cone, recover to the middle, next cone.' },
      { name: 'Block Jump Footwork', v: 'block-jump', level: 'intermediate', setup: 'Stand side-on to a wall or net line, hands up at forehead height.', cue: 'Side-step, plant, and jump straight up with the hands reaching over the target.', goals: ['vertical'], sport: ['volleyball'] },
      { name: 'Defensive Dig Stance Shuffle', v: 'dig-stance', level: 'beginner', cue: 'Low and wide, shuffle a step each way over the floor, the arms together in front.', sport: ['volleyball'] },
      { name: 'Crossover Recovery Step', v: 'crossover-recovery', level: 'intermediate', cue: 'Reach wide with a crossover step, then push the floor away back to the middle.', sport: ['tennis'] },
    ],
  },
  {
    family: 'hamstring-iso', block: `prehab-hip`, category: 'prehab', pattern: 'hinge', plane: 'sagittal', laterality: 'bilateral', skillLayer: 'strength', braceMode: 'set',
    primary: ['hamstrings'], secondary: ['glutes', 'calves'], goals: ['speed', 'knee', 'hip'], sport: ['general', 'basketball', 'soccer', 'track'],
    lowLoad: ['back', 'shoulder', 'wrist', 'knee'], youthOk: true, equipment: ['bench', 'mat'], clip: 'hinge',
    setup: 'On your back on a mat, heels up on a bench, knees bent a little.',
    cues: ['Push the heels down into the bench and lift the belt buckle up.', 'Hold still and breathe smoothly.', 'Lower slowly to the floor at the end of the hold.'],
    faults: [
      { fault: 'Hips sagging during the hold', fix: 'Lift the belt buckle back up toward the ceiling.' },
      { fault: 'Holding the breath', fix: 'Breathe in through the nose, out long, the hold unchanged.' },
    ],
    dosage: secs(3, 20, 30),
    variants: [
      { name: 'Heels-on-Bench Bridge Hold', v: 'bench-hold', level: 'beginner' },
      { name: 'Long-Lever Bridge Hold', v: 'long-lever', level: 'intermediate', setup: 'On your back on a mat, heels on a bench with the knees nearly straight.' },
      { name: 'Single-Leg Heels-on-Bench Bridge Hold', v: 'single-leg', level: 'advanced', laterality: 'unilateral', setup: 'On your back on a mat, one heel on a bench, the other leg pointed at the ceiling.' },
      { name: 'Isometric Hinge Against Strap', v: 'strap-hinge', level: 'intermediate', equipment: ['band'], setup: 'Stand on the middle of a heavy band, hinged at the knees-and-hips position you want, hands on the band.', cues: ['Push the floor away against the band without moving.', 'Hold still and breathe smoothly.', 'Ease off slowly at the end of the hold.'] },
    ],
  },
  {
    family: 'neck-care', block: `prehab-shoulder`, category: 'prehab', pattern: 'other', plane: 'multi', laterality: 'bilateral', skillLayer: 'joints', braceMode: 'none',
    primary: ['neck'], secondary: ['traps'], goals: ['posture'], sport: ['general', 'football', 'basketball'],
    lowLoad: ['knee', 'back', 'hip', 'ankle', 'wrist'], youthOk: true, equipment: ['mat'], clip: 'idle',
    setup: 'Lie on your back on a mat, knees bent, head resting on the floor.',
    cues: ['Nod slow and small, like a gentle yes, the head resting on the floor.', 'Hold the nod for a few seconds, breathing smoothly.', 'Ease back to the start.'],
    faults: [
      { fault: 'Lifting the head off the floor', fix: 'Keep the back of the head resting on the floor; the nod is small.' },
      { fault: 'Jerky movement', fix: 'Move slow and small, like a nod in slow motion.' },
    ],
    dosage: reps(2, '8 x 5 s', 15),
    variants: [
      { name: 'Supine Chin Nod', v: 'chin-nod', level: 'beginner', aliases: ['Chin Tuck Nod'] },
      { name: 'Wall Chin Tuck', v: 'wall', level: 'beginner', equipment: ['wall'], setup: 'Stand with the back and the head against a wall.', cue: 'Slide the back of the head up the wall, chin tucking a little, and hold.' },
      { name: 'Hand-Resisted Neck Hold', v: 'hand-iso', level: 'intermediate', equipment: [], setup: 'Sit tall, one hand on the side of the head.', cues: ['Press gently into the hand and hold still.', 'Breathe smoothly through the hold.', 'Change sides: front, back, left, right.'], dosage: reps(2, '4 x 10 s each way', 15) },
    ],
  },
  {
    family: 'shoulder-mobility', block: 'mobility', category: 'mobility', pattern: 'mobility', plane: 'multi', laterality: 'bilateral', skillLayer: 'joints', braceMode: 'none',
    primary: ['delts', 'lats'], secondary: ['chest', 'rotator-cuff', 'mid-back'], goals: ['mobility', 'shoulder', 'warmup'], sport: ['general', 'basketball', 'volleyball', 'tennis'],
    lowLoad: ['knee', 'ankle', 'back'], youthOk: true, equipment: ['dowel'], clip: 'stretch',
    setup: 'Stand tall holding a dowel with a wide grip in front of the thighs.',
    cues: ['Lift the dowel up and over toward the wall behind, arms long, only as far as it stays smooth.', 'Widen the grip if it catches.', EXHALE],
    faults: [
      { fault: 'Bending the elbows to get over', fix: 'Widen the grip on the dowel until the arms stay long.' },
      { fault: 'Arching back to fake the range', fix: 'Tuck the belt buckle up and move the dowel less.' },
    ],
    dosage: reps(2, '10', 15),
    variants: [
      { name: 'Dowel Pass-Through', v: 'pass-through', level: 'beginner', aliases: ['Shoulder Dislocates', 'Band Pass-Through'] },
      { name: 'Bench Lat Stretch', v: 'bench-lat', level: 'beginner', equipment: ['bench', 'dowel', 'mat'], setup: 'Kneel facing a bench, elbows on it holding a dowel, hips back over the heels.', cues: ['Sink the chest toward the floor between the elbows.', 'Hold still at the first firm pull.', EXHALE], dosage: secs(2, 30, 15) },
      { name: 'Doorway Chest Stretch', v: 'doorway', level: 'beginner', equipment: ['wall'], laterality: 'unilateral', setup: 'Forearm on a door frame or wall edge at shoulder height, one foot forward.', cues: ['Step through the doorway until the first firm pull.', 'Hold still and breathe.', EXHALE], dosage: secs(2, 30, 15) },
      { name: 'Prone Scorpion Reach', v: 'scorpion', level: 'intermediate', equipment: ['mat'], laterality: 'alternating', setup: 'Lie face down on a mat, arms out in a T.', cue: 'Reach one heel up and across toward the opposite hand on the floor, slow.', goals: ['hip', 'mobility'] },
      { name: 'Tall-Kneeling Hip Rotation', v: 'tall-kneel-rotation', level: 'beginner', equipment: ['mat'], setup: 'Kneel tall on a mat, hands on the hips.', cue: 'Turn the belt line to one wall and back, the knees still on the floor.', goals: ['hip', 'mobility'] },
      { name: 'Spinal Wave', v: 'spinal-wave', level: 'intermediate', equipment: [], setup: 'Stand tall with the hands on the thighs.', cue: 'Roll a slow wave down from the top of the head to the belt line and back up, smooth.' },
    ],
  },
  {
    family: 'foot-strength', block: `prehab-ankle`, category: 'prehab', pattern: 'other', plane: 'sagittal', laterality: 'unilateral', skillLayer: 'tripod', braceMode: 'none',
    primary: ['foot'], secondary: ['calves', 'tibialis'], goals: ['ankle', 'balance', 'speed'], sport: ['general', 'basketball', 'track'],
    lowLoad: ['back', 'shoulder', 'wrist', 'knee', 'hip'], youthOk: true, equipment: [], clip: 'idle',
    setup: 'Stand barefoot on a flat floor, a wall within reach.',
    cues: ['Heel, big toe, little toe: press all three into the floor.', 'Move slow and small against the floor; the foot does the work.', 'Breathe smoothly and stay tall.'],
    faults: [
      { fault: 'Toes clawing into the floor', fix: 'Keep the toes long and soft on the floor; the arch does the lifting.' },
      { fault: 'Rolling to the outside of the foot', fix: 'Press the big-toe joint back down into the floor.' },
    ],
    dosage: reps(2, '10 each side', 15),
    variants: [
      { name: 'Tripod Foot Lift', v: 'tripod-lift', level: 'beginner', cue: 'Press the three tripod points down and lift the arch off the floor, hold for three.' },
      { name: 'Single-Leg Calf Raise on Flat Floor', v: 'sl-flat', level: 'beginner', cue: 'Rise on one foot through the big-toe joint and lower slow to the floor.', primary: ['calves', 'foot'], secondary: ['soleus'] },
      { name: 'Big-Toe Press', v: 'big-toe-press', level: 'beginner', cue: 'Press only the big toe down into the floor and hold for five.' },
      { name: 'Marble Pick-Up', v: 'marble', level: 'beginner', equipment: ['towel'], setup: 'Sit with a few small objects and a towel on the floor in front.', cue: 'Pick up each object with the toes and drop it on the towel.' },
      { name: 'Single-Leg Balance on Toes', v: 'toe-balance', level: 'advanced', cue: 'Rise onto the ball of one foot and hold still and tall for the count.', dosage: secs(3, 15, 20), goals: ['balance', 'ankle'] },
    ],
  },
  {
    family: 'recovery-mobility', block: 'conditioning-recovery', category: 'recovery', pattern: 'mobility', plane: 'multi', laterality: 'bilateral', skillLayer: 'reset', braceMode: 'none',
    primary: ['lower-back', 'glutes'], secondary: ['hip-flexors', 'hamstrings', 'mid-back'], goals: ['cooldown', 'mobility'], sport: ['general', 'basketball'],
    lowLoad: ['knee', 'ankle', 'back', 'shoulder', 'wrist', 'hip', 'elbow'], youthOk: true, equipment: ['mat'], clip: 'stretch',
    setup: 'Lie or kneel comfortably on a mat in the position the drill names.',
    cues: [EXHALE, 'Let the floor take more of your weight each breath.', 'Stay at an easy pull, never a sharp one.'],
    faults: [
      { fault: 'Forcing the stretch', fix: 'Ease back to an easy pull and breathe.' },
      { fault: 'Holding the breath', fix: 'Breathe in through the nose, out long.' },
    ],
    dosage: secs(1, 60, 0),
    variants: [
      { name: 'Supine Knee Rock', v: 'knee-rock', level: 'beginner', setup: 'On your back, knees bent, feet wide on the floor.', cue: 'Let both knees fall slowly to one side, then the other, smooth and easy.' },
      { name: 'Supine Twist', v: 'twist', level: 'beginner', setup: 'On your back, arms out in a T, knees bent together.', cue: 'Let the knees settle to one side toward the floor and breathe there.' },
      { name: 'Child\'s Pose Side Reach', v: 'child-side', level: 'beginner', setup: 'Kneel on a mat and sit back toward the heels, arms long on the floor.', cue: 'Walk both hands toward one wall and breathe into the side that opens.' },
      { name: 'Happy Baby Rock', v: 'happy-baby', level: 'beginner', setup: 'On your back, knees pulled toward the armpits, hands holding the feet.', cue: 'Rock gently side to side along the floor, slow and easy.' },
      { name: 'Figure-4 Stretch on Back', v: 'figure-4', level: 'beginner', laterality: 'unilateral', setup: 'On your back, one ankle crossed over the other knee.', cue: 'Draw the bottom knee toward you until the first easy pull, and breathe.' },
    ],
  },
];
