// Authored block: crawls, isometric holds, grip, partner throws, rebound jumps, marches and standing cable work.
import { contacts, meters, reps, secs, type Family } from './types';

const B = 'variety';
const STILL = 'Hold still: nothing moves but the air.';

export const VARIETY: Family[] = [
  {
    family: 'court-movement', block: 'basketball-defense', category: 'sport-skill', pattern: 'locomotion', plane: 'multi', laterality: 'alternating', skillLayer: 'speed', braceMode: 'reflex',
    primary: ['quads', 'glute-med', 'calves'], secondary: ['adductors', 'glutes'], goals: ['defense', 'agility', 'footwork'], sport: ['basketball'],
    lowLoad: ['back'], youthOk: true, equipment: ['cone'], clip: 'shuffle',
    setup: 'Cones set out for the drill on the court; start in a low defensive stance.',
    cues: ['Stay low and level, like under a low ceiling.', 'Push the floor away toward the next cone.', 'Hands active and wide, eyes on the target ahead.'],
    faults: [
      { fault: 'Standing up between moves', fix: 'Stay under the low ceiling the whole drill.' },
      { fault: 'Crossing the feet', fix: 'Keep a gap between the shoes on every slide.' },
    ],
    dosage: reps(4, '20 s', 30),
    variants: [
      { name: 'Help-Side Stance Hold', v: 'help-side', level: 'beginner', cues: ['Sit low and level, pointing at the ball and at your player.', 'Hold still and ready, weight on the balls of the feet.', 'Breathe smoothly for the count.'], dosage: secs(3, 20, 20) },
      { name: 'Shell Slide to Closeout', v: 'shell-closeout', level: 'intermediate', cue: 'Slide to the help spot, then close out to the cone with short, choppy steps.' },
      { name: 'Wall Slide Defensive Hold', v: 'wall-stance', level: 'beginner', equipment: ['wall'], setup: 'Back against a wall in a low defensive stance.', cues: ['Sit low against the wall with the arms wide and active.', 'Hold still and breathe.', 'Push the floor away evenly through both feet.'], dosage: secs(3, 30, 30) },
      { name: 'Deny Step Slide', v: 'deny', level: 'intermediate', cue: 'Slide along the line of cones with one hand up in the passing lane to the target.' },
      { name: 'Recover and Contest', v: 'recover-contest', level: 'advanced', cue: 'Sprint back to the cone, chop the feet, and jump with a hand up to the target.', goals: ['defense', 'vertical'] },
      { name: 'Two-Cone Slide Race', v: 'slide-race', level: 'beginner', cue: 'Slide between two cones and touch each cone with the outside hand, as many as you can.', goals: ['defense', 'conditioning'] },
      { name: 'Lateral Shuffle to Sprint', v: 'shuffle-sprint', level: 'intermediate', cue: 'Shuffle three steps, then open the hips and sprint to the far cone.', goals: ['speed', 'agility'] },
      { name: 'Backpedal Closeout', v: 'backpedal-closeout', level: 'intermediate', cue: 'Backpedal to the cone, then plant and close out forward with short steps.' },
      { name: 'Catch and Square-Up', v: 'catch-square', level: 'beginner', equipment: ['basketball', 'cone'], cue: 'Catch the ball off a cut, pivot to face the basket, and sit in triple threat.', goals: ['footwork'] },
      { name: 'Inside Pivot Turn', v: 'inside-pivot', level: 'intermediate', equipment: ['basketball', 'cone'], cue: 'Catch the ball, pivot on the inside foot to face the target, ball tight at the hip.', goals: ['footwork'] },
    ],
  },
  {
    family: 'crawl', block: B, category: 'core', pattern: 'locomotion', plane: 'multi', laterality: 'alternating', skillLayer: 'wake-up', braceMode: 'set',
    primary: ['delts', 'deep-core', 'quads'], secondary: ['triceps', 'hip-flexors', 'obliques'], goals: ['trunk', 'warmup', 'shoulder'], sport: ['general', 'basketball', 'football'],
    lowLoad: ['back'], youthOk: true, equipment: [], clip: 'crawl',
    setup: 'On hands and feet on the floor, as the crawl names, with a clear lane ahead.',
    cues: ['Small, quiet steps over the floor: opposite hand and foot together.', 'Keep the back flat as a table.', 'Breathe smoothly the whole length.'],
    faults: [
      { fault: 'Hips swaying side to side', fix: 'Take smaller steps and keep the back flat as a table.' },
      { fault: 'Holding the breath', fix: 'Breathe out long every few steps.' },
    ],
    dosage: meters(3, 10, 45),
    variants: [
      { name: 'Crab Walk', v: 'crab', level: 'beginner', setup: 'Sit on the floor, hands behind you, feet flat, hips lifted.', cue: 'Walk backward on hands and feet with the hips up off the floor.', primary: ['glutes', 'triceps', 'delts'], secondary: ['hamstrings'] },
      { name: 'Lateral Crab Walk', v: 'crab-lateral', level: 'beginner', plane: 'frontal', setup: 'Sit on the floor, hands behind you, feet flat, hips lifted.', cue: 'Walk sideways on hands and feet with the hips up off the floor.', primary: ['glutes', 'triceps', 'delts'], secondary: ['hamstrings'] },
      { name: 'Crab Reach', v: 'crab-reach', level: 'intermediate', laterality: 'alternating', setup: 'Sit on the floor, hands behind you, feet flat.', cue: 'Lift the hips toward the ceiling and reach one hand over toward the wall behind.', goals: ['mobility', 'shoulder', 'hip'] },
      { name: 'Leopard Crawl', v: 'leopard', level: 'advanced', cue: 'Crawl forward with the knees an inch off the floor and the hips low, slow.' },
      { name: 'Beast Hold Shoulder Tap', v: 'beast-tap', level: 'intermediate', setup: 'On hands and feet, knees hovering a fist above the floor.', cue: 'Tap one hand to the opposite shoulder while the knees hover still above the floor.', dosage: reps(3, '8 each side', 45) },
    ],
  },
  {
    family: 'isometric-hold', block: B, category: 'strength', pattern: 'push', plane: 'sagittal', laterality: 'bilateral', skillLayer: 'strength', braceMode: 'set',
    primary: ['chest', 'triceps'], secondary: ['delts', 'deep-core'], goals: ['strength', 'trunk'], sport: ['general', 'basketball'],
    lowLoad: ['knee', 'back'], youthOk: true, equipment: [], clip: 'push',
    setup: 'Set the position the hold names and start breathing before the clock starts.',
    cues: [STILL, 'Push the floor away the whole hold.', 'Breathe in through the nose and out long.'],
    faults: [
      { fault: 'Position sinking as the hold goes on', fix: 'Shorten the hold; end the set when the position changes.' },
      { fault: 'Holding the breath', fix: 'Breathe out long without moving.' },
    ],
    dosage: secs(3, 20, 45),
    variants: [
      { name: 'Push-Up Bottom Hold', v: 'push-up-bottom', level: 'intermediate', setup: 'Lower into a push-up and stop with the chest a fist from the floor.' },
      { name: 'Push-Up Top Hold', v: 'push-up-top', level: 'beginner', setup: 'High plank, arms straight, body in one long line.' },
      { name: 'Wall Press Hold', v: 'wall-press', level: 'beginner', equipment: ['wall'], setup: 'Stand in a split stance, hands on a wall at shoulder height, arms bent.', cues: ['Push the wall as if to move it and hold still.', 'Breathe in through the nose and out long.', 'Ease off slowly at the end.'] },
    ],
  },
  {
    family: 'pull-hold', block: B, category: 'strength', pattern: 'pull', plane: 'sagittal', laterality: 'bilateral', skillLayer: 'strength', braceMode: 'set',
    primary: ['lats', 'biceps', 'forearms'], secondary: ['mid-back'], goals: ['strength', 'grip'], sport: ['general', 'basketball'],
    lowLoad: ['knee', 'back'], youthOk: true, equipment: ['pull-up-bar'], clip: 'pull',
    setup: 'Step or jump to the position the hold names, hands on the bar.',
    cues: ['Crush the bar.', STILL, 'Step down before the grip or the position gives out.'],
    faults: [
      { fault: 'Sinking out of the position', fix: 'Shorten the hold; end the set when the position changes.' },
      { fault: 'Swinging', fix: 'Start still from a box and hold still.' },
    ],
    dosage: secs(3, 15, 60),
    variants: [
      { name: 'Flexed-Arm Hang', v: 'flexed-arm', level: 'beginner', setup: 'Step up from a box so the chin is over the bar, arms bent.', aliases: ['Chin-Over-Bar Hold'] },
      { name: 'Pull-Up Halfway Hold', v: 'halfway', level: 'intermediate', setup: 'Pull up until the arms are at a right angle and hold there.' },
      { name: 'Row Top Hold', v: 'row-top', level: 'beginner', equipment: ['suspension-trainer'], setup: 'Lean back on the straps and pull your chest to the handles.', cues: ['Hold the chest at the handles, the body one straight plank.', STILL, 'Lower slowly at the end.'] },
    ],
  },
  {
    family: 'grip-hold', block: B, category: 'strength', pattern: 'carry', plane: 'sagittal', laterality: 'bilateral', skillLayer: 'strength', braceMode: 'set',
    primary: ['forearms'], secondary: ['traps', 'deep-core'], goals: ['grip'], sport: ['general', 'basketball', 'football'],
    lowLoad: ['knee', 'ankle'], youthOk: true, equipment: ['kettlebell'], clip: 'carry',
    setup: 'Deadlift the weight up and stand tall, arms long.',
    cues: ['Crush the handle.', 'Grow tall toward the ceiling and hold still.', 'Set the weight down before the grip gives out.'],
    faults: [
      { fault: 'Shoulders rolling forward', fix: 'Grow tall toward the ceiling, the weight hanging long.' },
      { fault: 'Dropping the weight', fix: 'Set it down with a hinge before the grip fails.' },
    ],
    dosage: secs(3, 30, 60),
    variants: [
      { name: 'Farmer Hold', v: 'farmer-hold', level: 'beginner', setup: 'A kettlebell in each hand at your sides, standing tall.' },
      { name: 'Kettlebell Horn Hold', v: 'horn', level: 'intermediate', setup: 'Hold one kettlebell by the horns at waist height, arms long.' },
      { name: 'Towel Kettlebell Hold', v: 'towel', level: 'advanced', equipment: ['kettlebell', 'towel'], setup: 'A towel looped through the handle, one end in each hand.', laterality: 'bilateral' },
      { name: 'Dumbbell End Hold', v: 'db-end', level: 'intermediate', equipment: ['dumbbell'], setup: 'Hold a dumbbell upright by one end, pinched between thumb and fingers.', laterality: 'unilateral' },
    ],
  },
  {
    family: 'partner-throw', block: B, category: 'power', pattern: 'push', plane: 'multi', laterality: 'bilateral', skillLayer: 'wake-up', braceMode: 'reflex',
    primary: ['chest', 'delts', 'obliques'], secondary: ['triceps', 'glutes', 'abs'], goals: ['power'], sport: ['general', 'basketball', 'soccer', 'volleyball'],
    lowLoad: ['knee'], youthOk: true, equipment: ['medicine-ball'], clip: 'throw',
    setup: 'Face a partner (or a wall) three to four metres away, the medicine ball held as the throw names.',
    cues: ['Throw the ball through your partner\'s hands: full speed every rep.', 'Push the floor away and let the throw start from the ground.', 'Catch the ball soft and reset still.'],
    faults: [
      { fault: 'Arms-only throws', fix: 'Push the floor away first; the arms finish the throw.' },
      { fault: 'Slow, tired reps', fix: 'Rest longer: every throw should be the fastest one yet.' },
    ],
    dosage: reps(3, '8', 45),
    variants: [
      { name: 'Overhead Med Ball Throw', v: 'overhead', level: 'beginner', setup: 'Ball overhead in both hands, split stance facing the partner.', cue: 'Step and throw the ball from overhead to the partner\'s chest.', aliases: ['Soccer Throw'] },
      { name: 'Partner Rotational Pass', v: 'rotational', level: 'intermediate', plane: 'transverse', setup: 'Side-on to the partner, ball at the back hip.', cue: 'Turn the back foot and throw the ball across to the partner.' },
      { name: 'Kneeling Overhead Throw', v: 'kneeling-overhead', level: 'beginner', setup: 'Kneel tall facing the partner, the ball overhead.', cue: 'Throw the ball from overhead to the partner without arching back.' },
      { name: 'Med Ball Slam to Catch', v: 'slam-catch', level: 'intermediate', setup: 'Ball overhead, standing tall, open floor in front.', cue: 'Slam the ball into the floor and catch it on the bounce, full speed.' },
      { name: 'Single-Arm Med Ball Push Throw', v: 'single-arm', level: 'intermediate', laterality: 'alternating', setup: 'Split stance, the ball at one shoulder in one hand, the other hand behind it.', cue: 'Push the ball off the shoulder to the partner like a shot put.' },
    ],
  },
  {
    family: 'rebound-jump', block: B, category: 'plyometric', pattern: 'locomotion', plane: 'sagittal', laterality: 'bilateral', skillLayer: 'jump-land', braceMode: 'reflex',
    primary: ['calves', 'quads', 'glutes'], secondary: ['hamstrings', 'delts'], goals: ['vertical', 'conditioning', 'landing'], sport: ['basketball', 'volleyball'],
    lowLoad: ['back'], youthOk: true, equipment: [], clip: 'jump', cautions: ['Plyometric: only once landings are quiet and stable. Count contacts, not sets.'],
    setup: 'Stand under a high target (a backboard, a net or a mark on a wall), feet hip-width.',
    cues: ['Jump and touch the target, then go straight back up.', 'Quick off the floor between jumps.', 'Land quiet: as little sound as you can.'],
    faults: [
      { fault: 'Sinking deep between jumps', fix: 'Stay springy: short, quick contacts with the floor.' },
      { fault: 'Drifting forward', fix: 'Jump straight up and land on the same spot on the floor.' },
    ],
    dosage: contacts(4, 8, 75),
    variants: [
      { name: 'Continuous Target Touches', v: 'touches', level: 'intermediate', aliases: ['Rim Touches', 'Backboard Touches'] },
      { name: 'Alternating-Hand Target Touches', v: 'alternating', level: 'intermediate', laterality: 'alternating', cue: 'Touch the target with alternate hands, quick off the floor.' },
      { name: 'One-Foot Alternating Target Touches', v: 'one-foot', level: 'advanced', laterality: 'alternating', cue: 'Take off from alternate feet, one touch each, the floor hot.' },
      { name: 'Rebound Jumps with Ball', v: 'with-ball', level: 'intermediate', equipment: ['basketball'], setup: 'Hold a ball overhead under a high target.', cue: 'Jump and tap the ball to the target, then straight back up.' },
    ],
  },
  {
    family: 'march', block: B, category: 'core', pattern: 'carry', plane: 'sagittal', laterality: 'alternating', skillLayer: 'cylinder', braceMode: 'set',
    primary: ['hip-flexors', 'obliques', 'deep-core'], secondary: ['glute-med', 'forearms'], goals: ['trunk', 'balance', 'speed'], sport: ['general', 'basketball', 'track'],
    lowLoad: ['back'], youthOk: true, equipment: ['kettlebell'], clip: 'carry',
    setup: 'Stand tall holding the weight as the march names.',
    cues: ['Lift each knee up toward the ceiling slowly and pause.', 'Grow tall toward the ceiling; nothing leans.', 'Set each foot down quiet on the floor.'],
    faults: [
      { fault: 'Leaning to lift the knee', fix: 'Lift the knee lower and grow tall toward the ceiling.' },
      { fault: 'Rushing', fix: 'Pause at the top of every lift for a beat.' },
    ],
    dosage: reps(3, '10 each side', 45),
    variants: [
      { name: 'Suitcase March', v: 'suitcase', level: 'beginner', laterality: 'alternating', setup: 'One kettlebell in one hand at your side.' },
      { name: 'Front-Rack March', v: 'rack', level: 'intermediate', setup: 'Two kettlebells in the rack position.' },
      { name: 'Overhead March', v: 'overhead', level: 'advanced', setup: 'One kettlebell pressed overhead, arm straight.', cautions: ['Needs comfortable overhead range.'] },
      { name: 'Banded Knee Drive March', v: 'band', level: 'beginner', equipment: ['mini-band'], setup: 'Mini band around the feet, standing tall.', cue: 'Drive one knee up against the band and hold for a beat, tall over the floor.', goals: ['speed', 'hip'] },
    ],
  },
  {
    family: 'standing-cable', block: B, category: 'strength', pattern: 'push', plane: 'sagittal', laterality: 'unilateral', skillLayer: 'strength', braceMode: 'set',
    primary: ['chest', 'triceps'], secondary: ['obliques', 'deep-core', 'delts'], goals: ['strength', 'trunk'], sport: ['general', 'basketball', 'football'],
    lowLoad: ['knee', 'back'], youthOk: true, equipment: ['cable'], clip: 'push',
    setup: 'Split stance facing away from a cable at chest height, the handle in one hand at the chest.',
    cues: ['Push the handle straight out toward the wall ahead.', 'Keep the shoulders square to the wall ahead while one side works.', 'Let the handle back slow.'],
    faults: [
      { fault: 'Twisting with the handle', fix: 'Square up to the wall ahead and use less weight.' },
      { fault: 'Short range', fix: 'Reach the handle all the way out, then all the way back.' },
    ],
    dosage: reps(3, '10 each side', 45),
    variants: [
      { name: 'Standing Single-Arm Cable Press', v: 'press', level: 'intermediate' },
      { name: 'Standing Single-Arm Cable Row', v: 'row', level: 'intermediate', setup: 'Split stance facing a cable at chest height, the handle in one hand, arm long.', cues: ['Drive your elbow toward your back pocket.', 'Keep the shoulders square to the wall ahead while one side works.', 'Let the handle back slow.'], primary: ['lats', 'mid-back'], secondary: ['obliques', 'biceps'], pattern: 'pull' },
      { name: 'Band Single-Arm Press', v: 'band-press', level: 'beginner', equipment: ['band'], setup: 'Split stance facing away from a band anchored at chest height, the handle at the chest.' },
      { name: 'Band Single-Arm Row', v: 'band-row', level: 'beginner', equipment: ['band'], setup: 'Split stance facing a band anchored at chest height, the handle in one hand.', cues: ['Drive your elbow toward your back pocket.', 'Keep the shoulders square to the wall ahead while one side works.', 'Let the band back in slow.'], primary: ['lats', 'mid-back'], secondary: ['obliques', 'biceps'], pattern: 'pull' },
    ],
  },
];
