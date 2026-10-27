// Authored block: mobility flows — the Playbook's ch4 (unlocking the joints): ankle, hip, upper back, in range you own.
import { reps, secs, type Family } from './types';

const B = 'mobility';
const EXHALE = 'Let the air out longer than it came in.';
const FIRM = 'Stop at the first firm pull; the range opens over the set.';
const SMOOTH = 'Move smooth and slow, like the tempo of a long breath.';

export const MOBILITY: Family[] = [
  {
    family: 'ankle-mobility', block: B, category: 'mobility', pattern: 'mobility', plane: 'sagittal', laterality: 'unilateral', skillLayer: 'joints', braceMode: 'none',
    primary: ['calves', 'soleus'], secondary: ['foot', 'tibialis'], goals: ['mobility', 'ankle', 'warmup'], sport: ['general', 'basketball', 'volleyball'],
    lowLoad: ['back', 'shoulder', 'wrist', 'hip'], youthOk: true, equipment: ['wall'], clip: 'stretch',
    setup: 'Half-kneeling facing a wall, the front toes a hand-width from it, hands on the wall.',
    cues: ['Drive the front knee toward the wall over the middle toes, heel heavy on the floor.', 'Rock in and out on a slow, steady rhythm.', FIRM],
    faults: [
      { fault: 'Heel lifting off the floor', fix: 'Move the foot closer to the wall until the heel stays heavy on the floor.' },
      { fault: 'Knee falling inward', fix: 'Aim the knee at the wall over the middle toes.' },
    ],
    dosage: reps(2, '10 each side', 15),
    variants: [
      { name: 'Knee-to-Wall Ankle Rock', v: 'knee-to-wall', level: 'beginner', aliases: ['Ankle Rocks', 'Knee to Wall'] },
      { name: 'Banded Ankle Rock', v: 'banded', level: 'intermediate', equipment: ['wall', 'band'], setup: 'Half-kneeling facing a wall, a band anchored behind you looped low around the front ankle.', cue: 'Let the band pull the ankle back as the knee drives toward the wall.' },
      { name: 'Loaded Ankle Rock', v: 'loaded', level: 'intermediate', equipment: ['wall', 'kettlebell'], setup: 'Half-kneeling, a kettlebell resting on the front knee.', cue: 'Let the weight push your knee toward the wall, heel heavy on the floor.' },
      { name: 'Ankle Circles', v: 'circles', level: 'beginner', equipment: [], setup: 'Stand on one leg, a hand on a wall, the other foot lifted.', cues: ['Draw slow, big circles with the toes, a smooth round path through the air.', 'Make the circle as round as you can, both ways.', SMOOTH] },
    ],
  },
  {
    family: 'hip-mobility', block: B, category: 'mobility', pattern: 'mobility', plane: 'multi', laterality: 'bilateral', skillLayer: 'joints', braceMode: 'none',
    primary: ['hip-flexors', 'glutes', 'adductors'], secondary: ['abductors', 'lower-back'], goals: ['mobility', 'hip', 'warmup'], sport: ['general', 'basketball', 'soccer'],
    lowLoad: ['back', 'shoulder', 'wrist'], youthOk: true, equipment: ['mat'], clip: 'stretch',
    setup: 'Sit on a mat with both knees bent to one side, each at about a right angle.',
    cues: ['Sit tall toward the ceiling before you lean.', 'Switch the knees from side to side slowly, heels on the floor.', EXHALE],
    faults: [
      { fault: 'Slumping into the floor', fix: 'Grow tall toward the ceiling, hands on the floor behind if needed.' },
      { fault: 'Rushing the switches', fix: 'Switch on a slow three-count and pause in each side.' },
    ],
    dosage: reps(2, '8 each side', 15),
    variants: [
      { name: '90/90 Hip Switch', v: '90-90-switch', level: 'beginner', aliases: ['90 90 Switch', 'Windshield Wipers Hip'] },
      { name: '90/90 Hip Switch, Hands Free', v: '90-90-free', level: 'intermediate', cue: 'Switch without the hands on the floor, tall the whole way.' },
      { name: '90/90 Lean', v: '90-90-lean', level: 'beginner', cues: ['Sit tall, then lean the belt line toward the front shin.', 'Hold still at the first firm pull and breathe.', EXHALE], dosage: secs(2, 30, 15) },
      { name: 'Shin Box Get-Up', v: 'shin-box', level: 'advanced', cue: 'From a knees-to-one-side sit, rise off the floor onto your knees, no hands, then sit back.' },
      { name: 'Half-Kneeling Hip Opener', v: 'half-kneel', level: 'beginner', ladder: 'flexor', setup: 'Half-kneeling on a mat, the front foot flat, the back knee under the hip.', cues: ['Tuck the belt buckle up toward your chin, then shift forward an inch.', 'Reach the arm on the down-knee side up to the ceiling.', EXHALE], dosage: secs(2, 30, 15), aliases: ['Hip Flexor Stretch'] },
      { name: 'Couch Stretch', v: 'couch', level: 'intermediate', ladder: 'flexor', equipment: ['wall', 'mat'], setup: 'Back knee on a mat against a wall, the shin up the wall, the front foot flat.', cues: ['Tuck the belt buckle up and grow tall toward the ceiling.', 'Hold still at the first firm pull and breathe.', EXHALE], dosage: secs(2, 45, 15) },
      { name: 'Frog Rock', v: 'frog', level: 'intermediate', ladder: 'adductor', setup: 'On hands and knees on a mat, knees wide apart, feet turned out.', cues: ['Rock the hips back toward the wall behind you and forward again.', FIRM, SMOOTH], aliases: ['Adductor Rock Back'] },
      { name: 'Half-Kneeling Adductor Rock', v: 'adductor-rock', level: 'beginner', ladder: 'adductor', setup: 'Kneel on a mat with one leg out long to the side, the foot flat on the floor.', cues: ['Rock the hips back toward the wall behind you and forward again.', FIRM, SMOOTH] },
      { name: 'Quadruped Hip Circles', v: 'quad-circles', level: 'beginner', ladder: 'circles', setup: 'On hands and knees on a mat.', cues: ['Draw the biggest slow circle you can with one knee, a smooth path through the air.', 'Keep the back flat as a table the whole circle.', SMOOTH], aliases: ['Controlled Hip Circles'] },
      { name: 'Standing Hip Circles', v: 'standing-circles', level: 'intermediate', ladder: 'circles', equipment: ['wall'], setup: 'Stand on one leg with a hand on a wall.', cues: ['Draw a slow, big circle with the free knee, a smooth path: up, out, back, down.', 'Stay tall over the standing foot, still on the floor.', SMOOTH] },
      { name: 'Pigeon Stretch', v: 'pigeon', level: 'intermediate', ladder: 'glute', setup: 'Front shin across the mat, back leg long behind you, hands on the floor.', cues: ['Sit the hips square toward the floor.', 'Walk the hands forward along the floor and breathe at the first firm pull.', EXHALE], dosage: secs(2, 45, 15) },
    ],
  },
  {
    family: 'upper-back-mobility', block: B, category: 'mobility', pattern: 'mobility', plane: 'transverse', laterality: 'unilateral', skillLayer: 'joints', braceMode: 'none',
    primary: ['mid-back', 'obliques'], secondary: ['chest', 'lats'], goals: ['mobility', 'shoulder', 'posture', 'warmup'], sport: ['general', 'basketball', 'volleyball', 'tennis'],
    lowLoad: ['knee', 'ankle', 'back'], youthOk: true, equipment: ['mat'], clip: 'stretch',
    setup: 'Lie on your side on a mat, knees bent up level with the hips, arms together in front.',
    cues: ['Open the top arm like a book toward the floor behind you.', 'Follow the hand with your eyes all the way to the top of the range.', EXHALE],
    faults: [
      { fault: 'Knees sliding apart', fix: 'Press the stacked knees into the floor; they stay together.' },
      { fault: 'Forcing the arm to the floor', fix: 'Stop at the first firm pull and breathe there.' },
    ],
    dosage: reps(2, '8 each side', 15),
    variants: [
      { name: 'Open Book', v: 'open-book', level: 'beginner', aliases: ['Side-Lying Thoracic Rotation'] },
      { name: 'Quadruped Thoracic Rotation', v: 'quadruped', level: 'beginner', setup: 'On hands and knees on a mat, one hand behind the head.', cue: 'Turn the elbow up toward the ceiling, then down toward the far hand on the floor.' },
      { name: 'Thread the Needle', v: 'thread', level: 'beginner', setup: 'On hands and knees on a mat.', cue: 'Slide one arm under the other along the floor, then open it up toward the ceiling.' },
      { name: 'Cat-Camel', v: 'cat-camel', level: 'beginner', laterality: 'bilateral', plane: 'sagittal', setup: 'On hands and knees on a mat.', cues: ['Round the back up toward the ceiling, then let it sink toward the floor.', SMOOTH, EXHALE], aliases: ['Cat Cow'] },
      { name: 'Wall Slide', v: 'wall-slide', level: 'beginner', laterality: 'bilateral', plane: 'sagittal', equipment: ['wall'], setup: 'Back against a wall, forearms on the wall in a goalpost shape.', cue: 'Slide the forearms up the wall as far as they stay touching it, then back down.', goals: ['shoulder'] },
      { name: 'Bench Thoracic Extension', v: 'bench-ext', level: 'intermediate', laterality: 'bilateral', plane: 'sagittal', equipment: ['bench', 'dowel', 'mat'], setup: 'Kneel facing a bench, elbows on it holding a dowel, hips back.', cue: 'Sink the chest toward the floor between the elbows and breathe out.' },
      { name: 'World’s Greatest Lunge Flow', v: 'wgs-flow', level: 'intermediate', laterality: 'alternating', plane: 'multi', equipment: [], setup: 'Long lunge, both hands on the floor inside the front foot.', cues: ['Drop the inside elbow toward the floor, then reach that hand up to the ceiling.', 'Follow the hand with your eyes all the way to the top of the range.', EXHALE], goals: ['hip', 'warmup'], primary: ['hip-flexors', 'mid-back', 'hamstrings'], secondary: ['adductors', 'obliques'] },
    ],
  },
  {
    family: 'dynamic-flow', block: B, category: 'mobility', pattern: 'mobility', plane: 'multi', laterality: 'alternating', skillLayer: 'wake-up', braceMode: 'none',
    primary: ['hamstrings', 'hip-flexors', 'glutes'], secondary: ['adductors', 'calves'], goals: ['warmup', 'mobility'], sport: ['general', 'basketball', 'soccer', 'track'],
    lowLoad: ['back', 'shoulder', 'wrist'], youthOk: true, equipment: [], clip: 'stretch',
    setup: 'Clear a 10-metre lane of floor; move through the drill at an easy pace first.',
    cues: [SMOOTH, 'Let the range grow a little each rep.', 'Keep the rhythm steady, like a slow beat.'],
    faults: [
      { fault: 'Swinging hard into the end of the range', fix: 'Stop at the first firm pull; the range opens over the set.' },
      { fault: 'Rushing the reps', fix: 'Slow the rhythm and own the end of each range.' },
    ],
    dosage: reps(1, '8 each side', 0),
    variants: [
      { name: 'Leg Swing Forward-Back', v: 'swing-sagittal', level: 'beginner', ladder: 'swing', equipment: ['wall'], setup: 'Stand side-on to a wall, a hand on it.', cue: 'Swing the free leg forward and back like a pendulum, the range growing each swing.', aliases: ['Leg Swings'] },
      { name: 'Leg Swing Side to Side', v: 'swing-frontal', level: 'beginner', ladder: 'swing', equipment: ['wall'], setup: 'Face a wall, both hands on it.', cue: 'Swing the free leg across and out like a pendulum, the range growing each swing.' },
      { name: 'Walking Knee Hug', v: 'knee-hug', level: 'beginner', cue: 'Step and hug one knee to your chest, stand tall on the floor, then step on.' },
      { name: 'Walking Quad Pull', v: 'quad-pull', level: 'beginner', cue: 'Step and pull one heel to the seat, stand tall on the floor, then step on.' },
      { name: 'Walking Toe Touch', v: 'toe-touch', level: 'beginner', cue: 'Kick one leg up toward the opposite hand, tall over the floor, then step on.', aliases: ['Frankenstein Walk'] },
      { name: 'Inchworm Walkout', v: 'inchworm', level: 'intermediate', cue: 'Hands to the floor, walk them out to a plank, then walk the feet back in.', primary: ['hamstrings', 'abs'], secondary: ['delts', 'calves'] },
      { name: 'Spiderman Lunge Walk', v: 'spiderman', level: 'intermediate', cue: 'Long lunge step, the inside elbow sinking toward the floor, then step through.' },
      { name: 'Lateral Lunge Walk', v: 'lateral-walk', level: 'beginner', plane: 'frontal', cue: 'Step wide, sit back over the bent leg toward the floor, then step the other foot in.' },
      { name: 'Walking Hip Opener', v: 'hip-open', level: 'beginner', cue: 'Lift the knee up and around, like stepping over a fence on the floor, then step on.', aliases: ['Open the Gate'] },
      { name: 'Walking Hip Closer', v: 'hip-close', level: 'beginner', cue: 'Lift the knee out and around to the front, like stepping back over a fence on the floor.', aliases: ['Close the Gate'] },
      { name: 'Arm Circles Forward and Back', v: 'arm-circles', level: 'beginner', setup: 'Stand tall, arms out to the sides.', cue: 'Small circles growing into big ones, forward then back, smooth.', primary: ['delts'], secondary: ['rotator-cuff'], goals: ['shoulder', 'warmup'] },
    ],
  },
  {
    family: 'posterior-chain-mobility', block: B, category: 'mobility', pattern: 'mobility', plane: 'sagittal', laterality: 'bilateral', skillLayer: 'joints', braceMode: 'none',
    primary: ['hamstrings', 'lower-back'], secondary: ['calves', 'glutes'], goals: ['mobility', 'cooldown', 'hip'], sport: ['general', 'basketball', 'track'],
    lowLoad: ['knee', 'shoulder', 'wrist'], youthOk: true, equipment: [], clip: 'stretch',
    setup: 'Stand tall, feet hip-width, knees soft.',
    cues: ['Fold from the belt line toward the floor and stop at the first firm pull.', EXHALE, 'Roll back up slowly to stand tall.'],
    faults: [
      { fault: 'Bouncing at the bottom', fix: 'Hold still at the first firm pull and breathe out.' },
      { fault: 'Locking the knees hard', fix: 'Keep a soft bend; the floor will come closer over time.' },
    ],
    dosage: secs(2, 30, 15),
    variants: [
      { name: 'Standing Forward Fold', v: 'fold', level: 'beginner', aliases: ['Toe Touch Stretch'] },
      { name: 'Supine Strap Leg Raise', v: 'strap', level: 'beginner', equipment: ['towel'], laterality: 'unilateral', setup: 'On your back, a towel looped over one foot, the leg raised toward the ceiling.', cue: 'Draw the towel toward you until the first firm pull, the other leg long on the floor.' },
      { name: 'Elevated Heel Hinge Stretch', v: 'heel-up', level: 'beginner', equipment: ['step'], laterality: 'unilateral', setup: 'One heel on a low step in front, toes up, hands on the hips.', cue: 'Push the wall behind you with your hips until the first firm pull.' },
      { name: 'Loaded Jefferson Curl', v: 'jefferson', level: 'advanced', equipment: ['kettlebell', 'box'], youthOk: false, setup: 'Stand on a box holding a very light kettlebell, knees straight but soft.', cue: 'Roll down one segment at a time toward the floor, then roll back up.', cautions: ['Adults only, very light load, and only once the bodyweight fold is easy.'] },
    ],
  },
];
