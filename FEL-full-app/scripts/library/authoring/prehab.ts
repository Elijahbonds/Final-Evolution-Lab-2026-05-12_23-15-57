// Authored block: prehab — general capacity work for the ankle, knee, hip and shoulder. Every entry carries
// prehabNote = "General prehab, not treatment." (vocab.ts PREHAB_NOTE): these are training drills that build capacity,
// never a plan for a sore or injured joint. Nothing here names a condition or promises an outcome.
import { reps, secs, meters, type Family } from './types';

const B = 'prehab';
const TRIPOD = 'Heel, big toe, little toe: press all three into the floor.';
const SLOW = 'Return slow on a three-count.';

export const PREHAB: Family[] = [
  {
    family: 'balance', block: `${B}-ankle`, category: 'prehab', pattern: 'other', plane: 'multi', laterality: 'unilateral', skillLayer: 'tripod', braceMode: 'none',
    primary: ['foot', 'calves'], secondary: ['glute-med', 'tibialis'], goals: ['ankle', 'balance', 'landing'], sport: ['general', 'basketball', 'volleyball', 'soccer'],
    lowLoad: ['back', 'shoulder', 'wrist', 'knee'], youthOk: true, equipment: [], clip: 'idle',
    setup: 'Stand on one leg, knee soft, the other foot just off the floor; a wall within reach.',
    cues: [TRIPOD, 'Stand tall and still, like a post planted in the floor.', 'Let the foot make tiny corrections against the floor; the rest stays still.'],
    faults: [
      { fault: 'Foot rolling out onto the little toe', fix: 'Press the big-toe joint back down into the floor.' },
      { fault: 'Hip dropping on the free side', fix: 'Keep your belt line level, like a tray of drinks on it.' },
    ],
    dosage: secs(3, 30, 15),
    variants: [
      { name: 'Single-Leg Balance', v: 'basic', level: 'beginner', aliases: ['Single-Leg Stand'] },
      { name: 'Single-Leg Balance, Head Turns', v: 'head-turns', level: 'beginner', cue: 'Turn your eyes slowly to one wall, then the other, the foot quiet on the floor.' },
      { name: 'Single-Leg Balance, Eyes Closed', v: 'eyes-closed', level: 'intermediate', cue: 'Close your eyes and keep heel, big toe and little toe on the floor.' },
      { name: 'Single-Leg Balance on Foam Pad', v: 'foam', level: 'intermediate', equipment: ['mat'], setup: 'Stand on one leg on a folded mat or foam pad, a wall within reach.' },
      { name: 'Single-Leg Ball Toss', v: 'ball-toss', level: 'intermediate', equipment: ['basketball', 'wall'], setup: 'Stand on one leg facing a wall, ball in both hands.', cue: 'Pass the ball off the wall and catch it, the standing foot quiet on the floor.' },
      { name: 'Star Reach', v: 'star', level: 'intermediate', ladder: 'reach', cue: 'Reach the free toe to three spots on the floor: front, side, back. Stand tall each time.', dosage: reps(2, '3 rounds each side', 30), aliases: ['Star Excursion Reach'] },
      { name: 'Clock Reach', v: 'clock', level: 'advanced', ladder: 'reach', cue: 'Reach the free toe to every hour of a clock on the floor around you, slow.', dosage: reps(2, '1 clock each side', 30) },
      { name: 'Single-Leg Balance Catch', v: 'catch', level: 'advanced', equipment: ['basketball'], setup: 'Stand on one leg; a partner throws a ball to either side of you.', cue: 'Catch the ball and stick the standing foot still on the floor.' },
    ],
  },
  {
    family: 'ankle-band', block: `${B}-ankle`, category: 'prehab', pattern: 'other', plane: 'multi', laterality: 'unilateral', skillLayer: 'tripod', braceMode: 'none',
    primary: ['calves', 'tibialis'], secondary: ['foot'], goals: ['ankle'], sport: ['general', 'basketball', 'volleyball', 'soccer'],
    lowLoad: ['back', 'shoulder', 'wrist', 'knee', 'hip'], youthOk: true, equipment: ['band', 'mat'], clip: 'idle',
    setup: 'Sit on a mat with the leg long, a band looped around the forefoot.',
    cues: ['Push the band away on a slow, smooth path.', 'Hold the end of the range for a beat.', SLOW],
    faults: [
      { fault: 'Turning the whole leg to move the foot', fix: 'Keep the knee pointing at the ceiling; only the foot moves the band.' },
      { fault: 'Snapping back to the start', fix: 'Let the band back in on a slow three-count.' },
    ],
    dosage: reps(2, '15 each way', 15),
    variants: [
      { name: 'Band Ankle Push', v: 'plantar', level: 'beginner', setup: 'Sit on a mat, leg long, the band ends in your hands looped around the forefoot.', cue: 'Push the band away with the ball of the foot, like pressing a pedal.' },
      { name: 'Band Ankle Turn-Out', v: 'eversion', level: 'beginner', setup: 'Sit on a mat, leg long, the band anchored to the inside and looped around the forefoot.', cue: 'Turn the sole of the foot out against the band, small and slow.' },
      { name: 'Band Ankle Turn-In', v: 'inversion', level: 'beginner', setup: 'Sit on a mat, leg long, the band anchored to the outside and looped around the forefoot.', cue: 'Turn the sole of the foot in against the band, small and slow.' },
      { name: 'Short Foot Hold', v: 'short-foot', level: 'beginner', ladder: 'foot', equipment: [], setup: 'Sit or stand with the foot flat on the floor.', cues: ['Lift the arch off the floor while the big-toe joint and the heel stay down.', 'Hold for a three-count, then let it go.', TRIPOD], dosage: reps(2, '8 each side', 15), primary: ['foot'], secondary: ['tibialis'] },
      { name: 'Toe Yoga', v: 'toe-yoga', level: 'intermediate', ladder: 'foot', equipment: [], setup: 'Sit or stand with the foot flat on the floor.', cues: ['Lift the big toe off the floor while the little toes stay down.', 'Then press the big toe down into the floor and lift the little toes.', 'Slow and small on the floor; the foot learns it over weeks.'], dosage: reps(2, '10', 15), primary: ['foot'], secondary: [] },
      { name: 'Towel Scrunch', v: 'towel', level: 'beginner', ladder: 'foot-towel', equipment: ['towel'], setup: 'Sit with one foot flat on a towel on the floor.', cues: ['Pull the towel toward you with the toes, a little at a time.', 'Keep the heel heavy on the floor.', 'Spread the towel back out and go again.'], dosage: reps(2, '3 lengths', 15), primary: ['foot'], secondary: [] },
      { name: 'Toe Walk', v: 'toe-walk', level: 'beginner', ladder: 'walks', equipment: [], laterality: 'alternating', setup: 'Stand tall up on the balls of the feet.', cues: ['Walk tall on the balls of the feet, heels high off the floor.', 'Short, quiet steps.', 'Keep the big-toe joint heavy on the floor.'], dosage: meters(2, 20, 30) },
    ],
  },
  {
    family: 'knee-capacity', block: `${B}-knee`, category: 'prehab', pattern: 'squat', plane: 'sagittal', laterality: 'bilateral', skillLayer: 'strength', braceMode: 'set',
    primary: ['quads'], secondary: ['glutes', 'calves'], goals: ['knee', 'strength', 'landing'], sport: ['general', 'basketball', 'volleyball', 'soccer'],
    lowLoad: ['back', 'shoulder', 'wrist'], youthOk: true, equipment: ['wall'], clip: 'squat',
    setup: 'Back flat against a wall, feet a step out from it, hip-width apart.',
    cues: ['Slide down the wall to the depth you own and hold still.', 'Press the floor away evenly through both feet.', 'Breathe smoothly through the hold.'],
    faults: [
      { fault: 'Knees drifting in', fix: 'Push the knees out over your laces.' },
      { fault: 'Holding the breath', fix: 'Breathe in through the nose, out long, the hold unchanged.' },
    ],
    dosage: secs(4, 30, 45),
    variants: [
      { name: 'Wall Sit, Shallow', v: 'wall-shallow', level: 'beginner', setup: 'Back flat against a wall, slide down only a little, feet a step out.' },
      { name: 'Single-Leg Wall Sit', v: 'wall-sl', level: 'advanced', laterality: 'unilateral', setup: 'Back flat against a wall, slide down a little, then lift one foot.' },
      { name: 'Band Terminal Knee Extension', v: 'tke', level: 'beginner', ladder: 'tke', equipment: ['band'], laterality: 'unilateral', setup: 'A band anchored low in front, looped behind one knee; step back until it pulls.', cues: ['Push the band back until the knee is straight, heel heavy on the floor.', 'Hold the straight knee for a beat.', SLOW], dosage: reps(3, '15 each side', 30), aliases: ['TKE'] },
      { name: 'Slant Board Squat', v: 'slant', level: 'intermediate', ladder: 'slant', equipment: ['plate'], setup: 'Heels on a plate or wedge, toes on the floor, feet hip-width.', cues: ['Sit straight down between the heels on a slow three-count.', 'Let the knees travel forward over the laces.', 'Push the floor away to stand.'], dosage: reps(3, '10', 45, '3-0-1-0') },
      { name: 'Reverse Nordic, Short Range', v: 'reverse-nordic-short', level: 'intermediate', ladder: 'reverse-nordic', equipment: ['mat'], setup: 'Kneel tall on a mat, the body in one line from knees to head.', cues: ['Lean back toward the wall behind you a short way as one straight piece.', 'Pause, then come back up tall.', 'Stay in one line to the wall: no folding at the hips.'], dosage: reps(3, '6-8', 45), primary: ['quads'], secondary: ['hip-flexors'] },
      { name: 'Reverse Nordic', v: 'reverse-nordic', level: 'advanced', ladder: 'reverse-nordic', equipment: ['mat'], setup: 'Kneel tall on a mat, the body in one line from knees to head.', cues: ['Lean back toward the floor as one straight piece, as far as you control.', 'Pause, then come back up tall.', 'Stay in one line to the wall: no folding at the hips.'], dosage: reps(3, '5-6', 60), primary: ['quads'], secondary: ['hip-flexors'] },
      { name: 'Isometric Split Squat Hold', v: 'split-iso', level: 'beginner', ladder: 'iso', laterality: 'unilateral', setup: 'Split stance, back knee hovering a few inches above the floor.', cues: ['Hold still with the back knee hovering above the floor.', 'Drive the floor down through your front heel.', 'Breathe smoothly through the hold.'], dosage: secs(3, 30, 30) },
    ],
  },
  {
    family: 'hip-stability', block: `${B}-hip`, category: 'prehab', pattern: 'other', plane: 'frontal', laterality: 'unilateral', skillLayer: 'strength', braceMode: 'none',
    primary: ['glute-med'], secondary: ['glutes', 'abductors'], goals: ['hip', 'knee', 'balance'], sport: ['general', 'basketball', 'soccer', 'track'],
    lowLoad: ['back', 'shoulder', 'wrist', 'knee'], youthOk: true, equipment: ['mini-band'], clip: 'idle',
    setup: 'Mini band just above the knees, set up as the variant names.',
    cues: ['Press the band apart toward the wall on a slow, smooth path.', 'Pause at the end of the range for a beat.', SLOW],
    faults: [
      { fault: 'Rolling back to fake the range', fix: 'Stack the hips toward the ceiling and move less.' },
      { fault: 'Snapping back to the start', fix: 'Let the band back in on a slow three-count.' },
    ],
    dosage: reps(2, '12-15 each side', 30),
    variants: [
      { name: 'Banded Clamshell', v: 'clamshell', level: 'beginner', equipment: ['mini-band', 'mat'], setup: 'Lie on your side on a mat, knees bent, heels together, the band above the knees.', cue: 'Open the top knee toward the ceiling like a clamshell, heels together.' },
      { name: 'Side-Lying Leg Raise', v: 'side-raise', level: 'beginner', equipment: ['mat'], setup: 'Lie on your side on a mat, the bottom knee bent, the top leg long.', cue: 'Lift the top heel toward the ceiling, heel first, toes pointing at the wall ahead.' },
      { name: 'Banded Lateral Walk', v: 'lateral-walk', level: 'beginner', laterality: 'alternating', setup: 'Band above the knees (or around the ankles), half-squat stance.', cue: 'Step sideways, keeping tension on the band; the feet never come together.', dosage: meters(2, 10, 30), aliases: ['Band Side Steps', 'Lateral Band Walk'] },
      { name: 'Banded Monster Walk', v: 'monster-walk', level: 'intermediate', laterality: 'alternating', setup: 'Band around the ankles, half-squat stance.', cue: 'Step forward and out on a diagonal, tension on the band every step.', dosage: meters(2, 10, 30) },
      { name: 'Standing Banded Hip Hike', v: 'hip-hike', level: 'intermediate', equipment: ['step'], setup: 'Stand on one leg on the edge of a step, the free foot hanging just below it.', cue: 'Hike your hip to lift the free foot level with the step, then lower it toward the floor.' },
      { name: 'Adductor Ball Squeeze', v: 'adductor-squeeze', level: 'beginner', ladder: 'adductor', equipment: ['basketball', 'mat'], laterality: 'bilateral', setup: 'Lie on your back on a mat, knees bent, a ball between the knees.', cues: ['Squeeze the ball between the knees and hold for five.', 'Breathe smoothly through the hold.', 'Let go slowly.'], dosage: reps(3, '6 x 5 s', 30), primary: ['adductors'], secondary: [] },
      { name: 'Side-Lying Adductor Raise', v: 'adductor-raise', level: 'intermediate', ladder: 'adductor', equipment: ['mat'], setup: 'Lie on your side on a mat, the top foot planted in front of the bottom knee.', cue: 'Lift the bottom heel up off the floor toward the ceiling, slow, and lower.', primary: ['adductors'], secondary: [] },
    ],
  },
  {
    family: 'shoulder-care', block: `${B}-shoulder`, category: 'prehab', pattern: 'pull', plane: 'transverse', laterality: 'unilateral', skillLayer: 'joints', braceMode: 'none',
    primary: ['rotator-cuff'], secondary: ['rear-delts', 'mid-back'], goals: ['shoulder', 'posture'], sport: ['general', 'basketball', 'volleyball', 'tennis'],
    lowLoad: ['knee', 'back', 'hip', 'ankle'], youthOk: true, equipment: ['band'], clip: 'pull',
    setup: 'Elbow at your side with a rolled towel between it and your ribs, forearm across the front, holding the band.',
    cues: ['Turn the handle out toward the wall like a gate swinging open.', 'Keep the towel pinned in place the whole rep.', SLOW],
    faults: [
      { fault: 'Towel dropping as the elbow drifts', fix: 'Keep the towel in place; the hand travels, the elbow stays.' },
      { fault: 'Twisting the trunk to turn further', fix: 'Face the wall ahead and stop the handle where the turn ends.' },
    ],
    dosage: reps(2, '12-15 each side', 30, '1-1-1-3'),
    variants: [
      { name: 'Band External Rotation', v: 'er-band', level: 'beginner', equipment: ['band', 'towel'], aliases: ['Band ER'] },
      { name: 'Side-Lying Dumbbell External Rotation', v: 'er-side-lying', level: 'beginner', equipment: ['dumbbell', 'towel', 'mat'], setup: 'Lie on your side on a mat, a towel under the top elbow, a light dumbbell in the top hand.', cue: 'Turn the dumbbell up toward the ceiling, elbow pinned on the towel.' },
      { name: 'Band External Rotation at 90', v: 'er-90', level: 'intermediate', setup: 'Band anchored in front at shoulder height, upper arm out to the side, elbow bent to a right angle.', cue: 'Turn the band up and back until the forearm points at the ceiling, slow.', cautions: ['Comfortable range only: stop where the turn stays smooth.'] },
      { name: 'Prone Y Raise', v: 'prone-y', level: 'beginner', ladder: 'prone', equipment: ['mat'], laterality: 'bilateral', setup: 'Lie face down on a mat, arms reaching overhead in a Y, thumbs up.', cue: 'Lift the thumbs off the floor toward the ceiling, slow, and hold for a beat.', primary: ['mid-back', 'rear-delts'], secondary: ['rotator-cuff'] },
      { name: 'Prone T Raise', v: 'prone-t', level: 'beginner', ladder: 'prone', equipment: ['mat'], laterality: 'bilateral', setup: 'Lie face down on a mat, arms out to the sides in a T, thumbs up.', cue: 'Lift the thumbs off the floor toward the ceiling, slow, and hold for a beat.', primary: ['mid-back', 'rear-delts'], secondary: ['rotator-cuff'] },
      { name: 'Prone W Raise', v: 'prone-w', level: 'intermediate', ladder: 'prone', equipment: ['mat'], laterality: 'bilateral', setup: 'Lie face down on a mat, elbows bent and tucked into a W.', cue: 'Lift the hands and elbows off the floor, thumbs turning up toward the ceiling.', primary: ['mid-back', 'rotator-cuff'], secondary: ['rear-delts'] },
      { name: 'Scap Push-Up', v: 'scap-push-up', level: 'beginner', ladder: 'serratus', equipment: [], laterality: 'bilateral', plane: 'sagittal', setup: 'High plank, arms straight.', cue: 'Let your chest sink an inch toward the floor, arms straight, then push the floor away.', primary: ['serratus'], secondary: ['chest', 'deep-core'] },
      { name: 'Wall Slide with Lift-Off', v: 'wall-lift', level: 'intermediate', ladder: 'serratus', equipment: ['wall'], laterality: 'bilateral', plane: 'sagittal', setup: 'Face a wall, forearms on it, a light band around the wrists.', cue: 'Slide your forearms up the wall, then lift them an inch off the wall at the top.', primary: ['serratus', 'traps'], secondary: ['rotator-cuff'] },
      { name: 'Bottoms-Up Kettlebell Hold', v: 'bottoms-up', level: 'intermediate', ladder: 'bottoms-up', equipment: ['kettlebell'], plane: 'sagittal', setup: 'Hold a light kettlebell upside down by the handle at shoulder height, elbow bent.', cues: ['Crush the handle so the bell stays balanced over your fist.', 'Hold still and breathe.', 'Set the bell down before the grip fades.'], dosage: secs(3, 20, 30), primary: ['rotator-cuff', 'forearms'], secondary: ['delts'] },
    ],
  },
  {
    family: 'wrist-care', block: `${B}-shoulder`, category: 'prehab', pattern: 'other', plane: 'multi', laterality: 'bilateral', skillLayer: 'joints', braceMode: 'none',
    primary: ['forearms'], secondary: [], goals: ['grip', 'mobility'], sport: ['general', 'basketball', 'volleyball'],
    lowLoad: ['knee', 'back', 'hip', 'ankle', 'shoulder'], youthOk: true, equipment: [], clip: 'idle',
    setup: 'Kneel on a mat or sit tall, hands free.',
    cues: ['Move slow through the whole range, both ways.', 'Stop at the first firm pull.', 'Breathe out long through each hold.'],
    faults: [
      { fault: 'Forcing the end of the range', fix: 'Stop at the first firm pull and breathe there.' },
      { fault: 'Rushing the circles', fix: 'Slow to a long-breath tempo.' },
    ],
    dosage: reps(2, '10 each way', 15),
    variants: [
      { name: 'Wrist Circles', v: 'circles', level: 'beginner' },
      { name: 'Quadruped Wrist Rocks', v: 'rocks', level: 'beginner', equipment: ['mat'], setup: 'On hands and knees on a mat, fingers pointing forward.', cue: 'Rock the shoulders forward over the hands on the floor and back, slow.' },
      { name: 'Light Dumbbell Wrist Turns', v: 'db-turns', level: 'intermediate', equipment: ['dumbbell', 'bench'], setup: 'Forearm on a bench, holding a light dumbbell by one end, hand past the edge.', cue: 'Turn the dumbbell slowly palm up, then palm down, the forearm still on the bench.' },
    ],
  },
];
