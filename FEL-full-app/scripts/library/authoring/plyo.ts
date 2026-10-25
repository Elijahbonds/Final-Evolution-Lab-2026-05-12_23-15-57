// Authored block: plyometrics — the Playbook's ch6 jump-and-land progressions (land first, then jump, then react),
// ankle stiffness, bounds and throws. Landing quality gates every step: the ladders start with a stick, not a jump.
import { LANDING_CAUTION, contacts, reps, type Family } from './types';

const B = 'plyometrics';
const QUIET = 'Land quiet: as little sound as you can.';
const STICK = 'Stick it still and silent for a two-count.';
const FLOOR_FAST = 'Push the floor away hard and fast.';
const HOT = 'Touch the floor and leave it fast, like the floor is hot.';

export const PLYO: Family[] = [
  {
    family: 'landing', block: B, category: 'plyometric', pattern: 'locomotion', plane: 'sagittal', laterality: 'bilateral', skillLayer: 'jump-land', braceMode: 'reflex',
    primary: ['quads', 'glutes'], secondary: ['calves', 'hamstrings', 'foot'], goals: ['landing', 'knee', 'vertical'], sport: ['general', 'basketball', 'volleyball', 'soccer'],
    lowLoad: ['back'], youthOk: true, equipment: [], clip: 'jump',
    setup: 'Stand tall in an athletic stance with open floor in front.',
    cues: [STICK, QUIET, 'Knees travel out over your laces as you land.'],
    faults: [
      { fault: 'Knees caving in on the landing', fix: 'Land with the knees out over your laces and stick it.' },
      { fault: 'Landing stiff-legged and loud', fix: 'Let the hips sit back as the floor arrives, quiet like a cat.' },
      { fault: 'Wobbling after the landing', fix: 'Shrink the drop until you can stick it for a two-count.' },
    ],
    dosage: reps(3, '5', 45),
    variants: [
      { name: 'Snap-Down', v: 'snap-down', level: 'beginner', setup: 'Stand tall on the balls of the feet, arms overhead.', cue: 'Snap the arms down and drop into a quiet, stuck athletic stance.', aliases: ['Snap Down to Stick'] },
      { name: 'Pogo to Stick', v: 'pogo-stick', level: 'beginner', cue: 'Three small hops, then stick the third one still and silent.' },
      { name: 'Drop Landing from Low Box', v: 'drop-low', level: 'beginner', equipment: ['box'], setup: 'Stand on a low box (shin height), toes at the edge.', cue: 'Step off, do not jump off, and stick the landing.' },
      { name: 'Drop Landing', v: 'drop-mid', level: 'intermediate', equipment: ['box'], setup: 'Stand on a box at knee height, toes at the edge.', cue: 'Step off, do not jump off, and stick the landing.', aliases: ['Depth Drop'] },
      { name: 'Single-Leg Drop Landing', v: 'drop-sl', level: 'advanced', equipment: ['box'], laterality: 'unilateral', setup: 'Stand on one leg on a low box, toes at the edge.', cue: 'Step off and stick it on one leg, still and silent.' },
      { name: 'Lateral Snap-Down', v: 'snap-lateral', level: 'intermediate', plane: 'frontal', ladder: 'lateral', setup: 'Stand tall on one foot, ready to drop sideways.', cue: 'Hop sideways onto both feet and stick a wide, quiet stance.', goals: ['agility'] },
    ],
  },
  {
    family: 'pogo', block: B, category: 'plyometric', pattern: 'locomotion', plane: 'sagittal', laterality: 'bilateral', skillLayer: 'jump-land', braceMode: 'reflex',
    primary: ['calves', 'soleus'], secondary: ['foot', 'quads', 'tibialis'], goals: ['vertical', 'speed', 'ankle', 'landing'], sport: ['general', 'basketball', 'volleyball', 'track'],
    lowLoad: ['back', 'knee', 'shoulder', 'wrist'], youthOk: true, equipment: [], clip: 'hop',
    setup: 'Stand tall on the balls of the feet, knees nearly straight, arms loose.',
    cues: [HOT, 'Stay tall, like a spring on the floor: the knees barely bend.', 'Keep a steady rhythm, like a metronome beat.'],
    faults: [
      { fault: 'Sinking deep into each contact', fix: 'Bounce off the floor with the knees nearly straight; do not squat into it.' },
      { fault: 'Heels slamming the floor', fix: 'Stay on the balls of the feet, quiet on every contact.' },
    ],
    dosage: contacts(3, 20, 45),
    variants: [
      { name: 'Ankle Bounce', v: 'ankle-bounce', level: 'beginner', cue: 'Tiny bounces off the floor, an inch high, light and quick.', aliases: ['Low Pogo'] },
      { name: 'Pogo Hop', v: 'pogo', level: 'beginner', aliases: ['Pogos', 'Pogo Jumps'] },
      { name: 'Forward-Back Pogo', v: 'fore-aft', level: 'intermediate', ladder: 'travel', cue: 'Pogo over a line on the floor, forward and back, quiet on every contact.', aliases: ['Line Hop Forward-Back'] },
      { name: 'Lateral Pogo', v: 'lateral', level: 'intermediate', ladder: 'travel', plane: 'frontal', cue: 'Pogo side to side over a line on the floor, quiet on every contact.', aliases: ['Line Hop Side to Side'], goals: ['agility'] },
      { name: 'Single-Leg Pogo', v: 'single-leg', level: 'advanced', laterality: 'unilateral', cue: 'Pogo on one foot, the floor hot, the rhythm steady.', dosage: contacts(3, 10, 60) },
      { name: 'Single-Leg Lateral Line Hop', v: 'single-leg-lateral', level: 'advanced', ladder: 'travel', laterality: 'unilateral', plane: 'frontal', cue: 'Hop side to side over a line on the floor on one foot, quiet every time.', dosage: contacts(3, 10, 60), goals: ['agility', 'balance'] },
      { name: 'Mini-Hurdle Pogo', v: 'hurdle', level: 'advanced', ladder: 'hurdle', equipment: ['mini-hurdle'], setup: 'Four to six mini hurdles in a line, a stride apart.', cue: 'Pogo over each hurdle with no extra bounce between, the floor hot.' },
    ],
  },
  {
    family: 'vertical-jump', block: B, category: 'plyometric', pattern: 'locomotion', plane: 'sagittal', laterality: 'bilateral', skillLayer: 'jump-land', braceMode: 'reflex',
    primary: ['quads', 'glutes', 'calves'], secondary: ['hamstrings', 'foot'], goals: ['vertical', 'power', 'landing'], sport: ['general', 'basketball', 'volleyball'],
    lowLoad: ['back'], youthOk: true, equipment: [], clip: 'jump', cautions: [LANDING_CAUTION],
    setup: 'Stand tall, feet hip-width, arms ready to swing.',
    cues: [FLOOR_FAST, 'Swing the arms up toward the ceiling as you leave the floor.', QUIET],
    faults: [
      { fault: 'Knees caving in on take-off or landing', fix: 'Push the floor apart: knees out over your laces both ways.' },
      { fault: 'Pausing too long at the bottom', fix: 'Drop and go: one quick dip, straight into the jump.' },
      { fault: 'Loud, heavy landings', fix: 'Land quiet, like a cat; shorten the jump until you can.' },
    ],
    dosage: reps(4, '4', 60),
    variants: [
      { name: 'Squat Jump', v: 'squat-jump', level: 'beginner', setup: 'Sink into a quarter squat and hold still for a two-count, hands on the hips.', cue: 'From the still start, push the floor away and jump straight up.', aliases: ['Static Squat Jump'] },
      { name: 'Countermovement Jump', v: 'cmj', level: 'beginner', aliases: ['CMJ', 'Vertical Jump'] },
      { name: 'Countermovement Jump to Stick', v: 'cmj-stick', level: 'beginner', cue: 'Jump as high as you can and stick the landing still and silent.' },
      { name: 'Repeated Countermovement Jump', v: 'cmj-repeat', level: 'intermediate', cue: 'Land and jump again straight away, quick off the floor.', dosage: reps(4, '5', 75) },
      { name: 'Tuck Jump', v: 'tuck', level: 'advanced', cue: 'Jump and pull the knees up toward the ceiling, then land quiet.', youthOk: true },
      { name: 'Split Jump', v: 'split', level: 'intermediate', ladder: 'split', setup: 'Split stance, feet hip-width side to side, back heel up.', cue: 'Jump straight up from the split and land in the same split, quiet.', aliases: ['Split Squat Jump'] },
      { name: 'Switch Split Jump', v: 'split-switch', level: 'advanced', ladder: 'split', laterality: 'alternating', setup: 'Split stance, feet hip-width side to side, back heel up.', cue: 'Jump and switch the feet in the air, landing quiet in the other split.' },
      { name: 'Single-Leg Vertical Jump', v: 'single-leg', level: 'advanced', ladder: 'single-leg', laterality: 'unilateral', setup: 'Stand on one leg, the other knee soft and ready to drive.', cue: 'Drive the free knee up as the standing foot pushes the floor away.', dosage: reps(3, '4 each side', 75) },
      { name: 'Dumbbell Jump Squat', v: 'loaded', level: 'advanced', ladder: 'loaded', equipment: ['dumbbell'], setup: 'Light dumbbells at your sides, feet hip-width.', cue: 'Light weights, full speed: push the floor away and land quiet.', youthOk: false, goals: ['power'] },
    ],
  },
  {
    family: 'box-jump', block: B, category: 'plyometric', pattern: 'locomotion', plane: 'sagittal', laterality: 'bilateral', skillLayer: 'jump-land', braceMode: 'reflex',
    primary: ['quads', 'glutes', 'calves'], secondary: ['hamstrings'], goals: ['vertical', 'power', 'landing'], sport: ['general', 'basketball', 'volleyball'],
    lowLoad: ['back', 'knee'], youthOk: true, equipment: ['box'], clip: 'jump', cautions: [LANDING_CAUTION, 'Step down from the box; do not jump down.'],
    setup: 'Stand a short step from a box you can land on with your hips higher than your knees.',
    cues: [FLOOR_FAST, 'Land on the box in the same quiet athletic stance you jumped from.', 'Step down from the box, never jump down.'],
    faults: [
      { fault: 'Landing in a deep squat on the box', fix: 'Lower the box: the landing should look like your take-off stance.' },
      { fault: 'Knees caving in on the box', fix: 'Land with the knees out over your laces and stick it.' },
    ],
    dosage: reps(4, '3-4', 60),
    variants: [
      { name: 'Low Box Jump', v: 'low', level: 'beginner', setup: 'Stand a short step from a low box (mid-shin height).' },
      { name: 'Box Jump', v: 'mid', level: 'intermediate', aliases: ['Box Jumps'] },
      { name: 'Seated Box Jump', v: 'seated', level: 'intermediate', ladder: 'seated', equipment: ['box', 'bench'], setup: 'Sit on a bench facing a box, feet flat on the floor.', cue: 'From the seat, push the floor away and land on the box quiet.' },
      { name: 'Single-Leg Box Jump', v: 'single-leg', level: 'advanced', laterality: 'unilateral', setup: 'Stand on one leg a short step from a low box.', cue: 'Jump from one leg and land on the box on two, quiet.' },
      { name: 'Lateral Box Jump', v: 'lateral', level: 'intermediate', ladder: 'lateral', plane: 'frontal', setup: 'Stand side-on to a low box.', cue: 'Jump sideways onto the box and land quiet in your take-off stance.', goals: ['agility'] },
      { name: 'Approach Box Jump', v: 'approach', level: 'advanced', setup: 'Two steps back from the box.', cue: 'Step, step, plant both feet and jump onto the box.', youthOk: true },
    ],
  },
  {
    family: 'broad-jump', block: B, category: 'plyometric', pattern: 'locomotion', plane: 'sagittal', laterality: 'bilateral', skillLayer: 'jump-land', braceMode: 'reflex',
    primary: ['glutes', 'hamstrings', 'quads'], secondary: ['calves'], goals: ['power', 'speed', 'landing'], sport: ['general', 'football', 'track', 'basketball'],
    lowLoad: ['back'], youthOk: true, equipment: [], clip: 'jump', cautions: [LANDING_CAUTION],
    setup: 'Stand tall behind a line on the floor, feet hip-width, arms ready to swing.',
    cues: ['Swing the arms back, then push the floor away out in front of you.', 'Reach the landing out in front and stick it.', QUIET],
    faults: [
      { fault: 'Landing with the chest over the toes', fix: 'Reach the feet out to the floor in front and sit the hips back as you land.' },
      { fault: 'Jumping up instead of out', fix: 'Aim for a spot on the floor out in front, not the ceiling.' },
    ],
    dosage: reps(4, '3', 60),
    variants: [
      { name: 'Broad Jump to Stick', v: 'stick', level: 'beginner', aliases: ['Standing Broad Jump'] },
      { name: 'Consecutive Broad Jumps', v: 'consecutive', level: 'intermediate', cue: 'Land and go again straight away, three jumps in a row.', dosage: reps(4, '3 jumps', 75) },
      { name: 'Single-Leg Hop to Stick', v: 'single-leg-stick', level: 'intermediate', ladder: 'single-leg', laterality: 'unilateral', setup: 'Stand on one leg behind a line.', cue: 'Hop forward and stick the landing on the same foot, still and silent.', goals: ['balance', 'knee'] },
      { name: 'Single-Leg Hop Series', v: 'single-leg-series', level: 'advanced', ladder: 'single-leg', laterality: 'unilateral', setup: 'Stand on one leg behind a line.', cue: 'Three hops along the floor on the same foot, the last one stuck still.', dosage: reps(3, '3 hops each side', 75) },
      { name: 'Triple Jump Bound', v: 'triple', level: 'advanced', laterality: 'alternating', cue: 'Hop, step, jump: three long contacts with the floor, the last one stuck.', goals: ['speed'] },
    ],
  },
  {
    family: 'lateral-bound', block: B, category: 'plyometric', pattern: 'locomotion', plane: 'frontal', laterality: 'alternating', skillLayer: 'jump-land', braceMode: 'reflex',
    primary: ['glute-med', 'glutes', 'quads'], secondary: ['adductors', 'calves', 'foot'], goals: ['agility', 'power', 'landing', 'defense'], sport: ['general', 'basketball', 'soccer', 'tennis'],
    lowLoad: ['back'], youthOk: true, equipment: [], clip: 'bound', cautions: [LANDING_CAUTION],
    setup: 'Stand on one leg, the other foot just off the floor, in a low athletic stance.',
    cues: ['Push the floor away sideways from the outside foot.', 'Land on the other foot and stick it still and silent.', 'Knees travel out over your laces as you land.'],
    faults: [
      { fault: 'Landing knee caving in', fix: 'Shorten the bound and land with the knee over your laces.' },
      { fault: 'Trunk falling outside the landing foot', fix: 'Land with your belt line over the landing foot, still.' },
    ],
    dosage: reps(3, '5 each side', 60),
    variants: [
      { name: 'Lateral Hop to Stick', v: 'hop-stick', level: 'beginner', cue: 'Small hop sideways, stick it on the other foot for a two-count.' },
      { name: 'Lateral Bound to Stick', v: 'bound-stick', level: 'intermediate', aliases: ['Skater Hop to Stick'] },
      { name: 'Continuous Lateral Bound', v: 'continuous', level: 'advanced', cue: 'Bound side to side without the stick, quick off the floor each time.', aliases: ['Skater Bound'] },
      { name: 'Lateral Bound to Sprint', v: 'to-sprint', level: 'advanced', cue: 'Stick the bound, then sprint forward five steps on the call.', goals: ['speed'] },
      { name: 'Diagonal Bound', v: 'diagonal', level: 'intermediate', plane: 'multi', cue: 'Bound forward and out at an angle, landing quiet on the other foot.', goals: ['speed'] },
    ],
  },
  {
    family: 'approach-jump', block: B, category: 'sport-skill', pattern: 'locomotion', plane: 'sagittal', laterality: 'bilateral', skillLayer: 'jump-land', braceMode: 'reflex',
    primary: ['quads', 'glutes', 'calves'], secondary: ['hamstrings', 'foot'], goals: ['vertical', 'power', 'finishing'], sport: ['basketball', 'volleyball'],
    lowLoad: ['back'], youthOk: true, equipment: [], clip: 'jump', cautions: [LANDING_CAUTION],
    setup: 'Start a few steps back from a target overhead (a net, a backboard, a mark on a wall).',
    cues: ['Last two steps fast: right-left (or left-right), plant and go.', 'Swing both arms up toward the target as you leave the floor.', QUIET],
    faults: [
      { fault: 'Slowing down into the plant', fix: 'Speed up into the last two steps; the floor gets hit hard and fast.' },
      { fault: 'Drifting forward under the target', fix: 'Plant the last step a little in front so you jump up, not out.' },
    ],
    dosage: reps(4, '3', 75),
    variants: [
      { name: 'One-Step Approach Jump', v: 'one-step', level: 'beginner', cue: 'One step in, plant both feet and jump to the target.' },
      { name: 'Two-Step Approach Jump', v: 'two-step', level: 'intermediate', aliases: ['Penultimate Step Jump'] },
      { name: 'Three-Step Approach Jump', v: 'three-step', level: 'advanced' },
      { name: 'One-Foot Approach Jump', v: 'one-foot', level: 'intermediate', ladder: 'one-foot', laterality: 'unilateral', cue: 'Run in and take off from one foot, the other knee driving up toward the target.', aliases: ['Layup Takeoff Jump'] },
      { name: 'Weak-Side One-Foot Approach Jump', v: 'one-foot-off', level: 'advanced', ladder: 'one-foot', laterality: 'unilateral', cue: 'Same jump from your weaker foot, the other knee driving up toward the target.' },
    ],
  },
  {
    family: 'reactive-jump', block: B, category: 'plyometric', pattern: 'locomotion', plane: 'sagittal', laterality: 'bilateral', skillLayer: 'jump-land', braceMode: 'reflex',
    primary: ['calves', 'quads', 'glutes'], secondary: ['hamstrings', 'foot'], goals: ['vertical', 'power'], sport: ['basketball', 'volleyball', 'track'],
    lowLoad: ['back'], youthOk: false, equipment: ['box'], clip: 'jump',
    cautions: [LANDING_CAUTION, 'Advanced: drop landings stick first, for weeks, before any rebound off a box.'],
    setup: 'Stand on a low box, toes at the edge, with open floor in front.',
    cues: ['Step off, do not jump off.', HOT, QUIET],
    faults: [
      { fault: 'Sinking deep on the contact', fix: 'Lower the box until the contact is short and springy.' },
      { fault: 'Loud landings', fix: 'Land quiet on the whole foot, knees over the laces.' },
    ],
    dosage: contacts(3, 5, 120),
    variants: [
      { name: 'Drop Jump from Low Box', v: 'drop-jump-low', level: 'advanced', aliases: ['Depth Jump from Low Box'] },
      { name: 'Drop Jump to Box', v: 'drop-to-box', level: 'advanced', equipment: ['box'], setup: 'Two boxes a step apart: stand on the low one.', cue: 'Step off, touch the floor, and jump straight onto the second box.' },
      { name: 'Drop Jump to Broad Jump', v: 'drop-broad', level: 'advanced', cue: 'Step off, touch the floor, and jump out to a quiet, stuck landing.' },
    ],
  },
  {
    family: 'med-ball-power', block: B, category: 'power', pattern: 'push', plane: 'sagittal', laterality: 'bilateral', skillLayer: 'wake-up', braceMode: 'reflex',
    primary: ['glutes', 'delts', 'chest'], secondary: ['triceps', 'quads', 'abs'], goals: ['power', 'vertical'], sport: ['general', 'basketball', 'football', 'volleyball'],
    lowLoad: ['knee'], youthOk: true, equipment: ['medicine-ball'], clip: 'throw',
    setup: 'Hold the medicine ball at the chest with open space or a solid wall in front.',
    cues: ['Throw it through the wall: full speed every rep.', 'Push the floor away and let the throw start from the ground.', 'Reset still between reps so every throw is fast.'],
    faults: [
      { fault: 'Arms-only throws', fix: 'Push the floor away first; the arms finish the throw.' },
      { fault: 'Slow, tired reps', fix: 'Rest longer: every throw should be the fastest one yet.' },
    ],
    dosage: reps(4, '5', 60),
    variants: [
      { name: 'Med Ball Chest Pass', v: 'chest-pass', level: 'beginner', equipment: ['medicine-ball', 'wall'], aliases: ['Medicine Ball Chest Throw'] },
      { name: 'Med Ball Scoop Toss Forward', v: 'scoop-forward', level: 'intermediate', setup: 'Hold the ball between the legs in a hinge, open space in front.', cue: 'Push the wall behind you with your hips, then throw the ball forward and up.' },
      { name: 'Med Ball Overhead Backward Toss', v: 'backward-toss', level: 'intermediate', setup: 'Stand with your back to open space, ball held low between the legs.', cue: 'Drive the floor away and throw the ball up and back over your head.', aliases: ['Med Ball Back Toss'] },
      { name: 'Med Ball Slam', v: 'slam', level: 'beginner', equipment: ['slam-ball'], setup: 'Stand tall holding a slam ball overhead.', cue: 'Slam the ball into the floor in front of you, full speed.', aliases: ['Ball Slam'] },
      { name: 'Med Ball Squat Throw', v: 'squat-throw', level: 'intermediate', setup: 'Hold the ball at the chest, feet hip-width, open space above.', cue: 'Sink and jump, throwing the ball straight up toward the ceiling.', goals: ['vertical'] },
      { name: 'Kneeling Med Ball Chest Pass', v: 'kneeling-pass', level: 'beginner', equipment: ['medicine-ball', 'wall'], setup: 'Kneel tall facing a wall, the ball at the chest.', cue: 'Push the ball off the chest through the wall, fast.' },
    ],
  },
];
