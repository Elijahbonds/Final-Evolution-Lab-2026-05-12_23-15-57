// Authored block: more basketball — passing, shooting spots, moving handles, more finishes, and team-free conditioning.
import { meters, reps, secs, type Family } from './types';

const B = 'basketball';

export const BASKETBALL_EXTRA: Family[] = [
  {
    family: 'passing', block: `${B}-passing`, category: 'sport-skill', pattern: 'push', plane: 'sagittal', laterality: 'bilateral', skillLayer: 'speed', braceMode: 'reflex',
    primary: ['chest', 'triceps'], secondary: ['delts', 'forearms'], goals: ['handles', 'footwork'], sport: ['basketball'],
    lowLoad: ['back', 'knee'], youthOk: true, equipment: ['basketball', 'wall'], clip: 'throw',
    setup: 'Stand two to three metres from a wall, ball at the chest, a target marked on the wall.',
    cues: ['Step toward the target as the ball leaves.', 'Snap the ball out to the target, thumbs finishing down.', 'Catch the ball back with soft hands and go again.'],
    faults: [
      { fault: 'Floating, slow passes', fix: 'Step and snap: the ball should hit the target on a flat line.' },
      { fault: 'Passing flat-footed', fix: 'Step toward the target on the floor every pass.' },
    ],
    dosage: reps(3, '20', 20),
    variants: [
      { name: 'Wall Chest Pass', v: 'chest', level: 'beginner' },
      { name: 'Wall Bounce Pass', v: 'bounce', level: 'beginner', cue: 'Bounce the ball off the floor two-thirds of the way to the wall target.' },
      { name: 'Overhead Wall Pass', v: 'overhead', level: 'beginner', cue: 'Ball above the forehead, snap it to the target high on the wall.' },
      { name: 'One-Hand Push Pass', v: 'one-hand', level: 'intermediate', laterality: 'alternating', cue: 'Step and push the ball off one hand to the target, the other hand guiding.' },
      { name: 'Wall Pass with Footwork', v: 'footwork', level: 'intermediate', cue: 'Catch the ball, pivot away and back, then snap the ball to the target.' },
      { name: 'Two-Ball Wall Pass', v: 'two-ball', level: 'advanced', setup: 'A ball in each hand, facing a wall.', cue: 'Alternate the balls off the wall target in a steady beat.' },
      { name: 'Outlet Pass', v: 'outlet', level: 'intermediate', equipment: ['basketball'], setup: 'Rebound position under the basket, a partner or a target up the side of the floor.', cue: 'Pivot to the outside and throw the ball overhead to the target up the floor.' },
    ],
  },
  {
    family: 'shooting-spots', block: `${B}-shooting`, category: 'sport-skill', pattern: 'push', plane: 'sagittal', laterality: 'unilateral', skillLayer: 'speed', braceMode: 'none',
    primary: ['triceps', 'delts'], secondary: ['forearms', 'calves', 'quads'], goals: ['shooting'], sport: ['basketball'],
    lowLoad: ['back', 'knee'], youthOk: true, equipment: ['basketball', 'hoop'], clip: 'shoot',
    setup: 'Start at the first spot of the drill, square to the basket, ball ready on the finger pads.',
    cues: ['Same routine every shot: feet, ball up, push the floor away, follow through.', 'Hold the follow-through until the ball lands.', 'Count makes, not attempts.'],
    faults: [
      { fault: 'Rushing between spots', fix: 'Set the feet square on the floor before every shot.' },
      { fault: 'Short shots as you tire', fix: 'Push the floor away harder: the power comes from the ground.' },
    ],
    dosage: reps(3, '10 makes', 45),
    variants: [
      { name: 'Free Throw Routine', v: 'free-throw', level: 'beginner', cue: 'The same breath, the same dribbles, the same release every time.' },
      { name: 'Around the World Shooting', v: 'around-world', level: 'beginner', setup: 'Five spots in an arc around the basket, close range.', cue: 'Make one at each spot, then move to the next.' },
      { name: 'Elbow Jumper Series', v: 'elbow', level: 'intermediate', setup: 'Start at one elbow of the free-throw line.', cue: 'Catch, square up to the basket, rise; then the other elbow spot on the floor.' },
      { name: 'Corner Three Footwork', v: 'corner', level: 'intermediate', setup: 'Start in the corner behind the three-point line.', cue: 'Feet behind the line, square to the basket before the ball arrives.' },
      { name: 'Spot-Up Shooting, Five Spots', v: 'spot-up', level: 'intermediate', setup: 'Five spots around the three-point arc.', cue: 'Catch-and-shoot at each spot: two makes, then move.' },
      { name: 'Shot Fake, One Dribble Jumper', v: 'fake-dribble', level: 'advanced', cue: 'Ball fake up toward the target, one hard dribble, rise straight up.' },
      { name: 'Fatigue Free Throws', v: 'fatigue-ft', level: 'advanced', cue: 'Sprint the length of the floor and back, then shoot two with the same routine.', goals: ['shooting', 'conditioning'] },
    ],
  },
  {
    family: 'moving-handles', block: `${B}-handles`, category: 'sport-skill', pattern: 'locomotion', plane: 'multi', laterality: 'bilateral', skillLayer: 'speed', braceMode: 'reflex',
    primary: ['forearms', 'quads'], secondary: ['calves', 'glutes', 'delts'], goals: ['handles', 'speed', 'footwork'], sport: ['basketball'],
    lowLoad: ['back'], youthOk: true, equipment: ['basketball', 'cone'], clip: 'dribble',
    setup: 'Cones down the length of the floor; start at the baseline with the ball.',
    cues: ['Push the ball out in front and run to it.', 'Eyes up on the far wall, not on the ball.', 'Change hands at every cone with the ball low.'],
    faults: [
      { fault: 'Dribbling at your feet while running', fix: 'Push the ball out in front so you run onto it.' },
      { fault: 'High, loose change of hands', fix: 'Cross the ball low below the knee at every cone.' },
    ],
    dosage: meters(4, 28, 30),
    variants: [
      { name: 'Full-Court Speed Dribble', v: 'speed', level: 'beginner', equipment: ['basketball'], cue: 'Push the ball out far in front and run onto it, three dribbles a half.' },
      { name: 'Moving Crossover', v: 'crossover', level: 'intermediate' },
      { name: 'Moving Between-the-Legs', v: 'between', level: 'intermediate', cue: 'Bounce the ball between the legs at every cone, stepping through it.' },
      { name: 'Moving Behind-the-Back', v: 'behind', level: 'intermediate', cue: 'Wrap the ball behind your belt line at every cone, still moving forward.' },
      { name: 'Moving Hesitation', v: 'hesi', level: 'intermediate', cue: 'Slow down to each cone, eyes to the target, then burst past it.' },
      { name: 'Two-Ball Moving Dribble', v: 'two-ball', level: 'advanced', setup: 'A ball in each hand at the baseline.', cue: 'Both balls hit the floor together as you jog the length.' },
      { name: 'Crossover into Layup', v: 'cross-layup', level: 'intermediate', equipment: ['basketball', 'cone', 'hoop'], cue: 'Cross the ball low at the cone, two dribbles, and finish at the basket.', goals: ['handles', 'finishing'] },
    ],
  },
  {
    family: 'finishing-touch', block: `${B}-finishing`, category: 'sport-skill', pattern: 'locomotion', plane: 'multi', laterality: 'unilateral', skillLayer: 'jump-land', braceMode: 'reflex',
    primary: ['quads', 'calves', 'glutes'], secondary: ['delts', 'deep-core'], goals: ['finishing'], sport: ['basketball'],
    lowLoad: ['back'], youthOk: true, equipment: ['basketball', 'hoop'], clip: 'layup',
    setup: 'Start a few steps out on one side of the basket, ball in both hands.',
    cues: ['Lift the ball high and soft toward the target on the glass.', 'Rise straight up off the floor, not into the basket support.', 'Land quiet and balanced.'],
    faults: [
      { fault: 'Throwing the ball hard at the glass', fix: 'Lift the ball soft: let it kiss the glass and drop.' },
      { fault: 'Drifting under the basket', fix: 'Take off a step earlier so you rise up to the target.' },
    ],
    dosage: reps(3, '10 makes', 30),
    variants: [
      { name: 'Finger Roll Layup', v: 'finger-roll', level: 'intermediate', cue: 'Roll the ball off the fingertips up toward the target, palm up.' },
      { name: 'Scoop Layup', v: 'scoop', level: 'intermediate', cue: 'Scoop the ball up underneath from low, soft off the glass.' },
      { name: 'Baby Hook', v: 'baby-hook', level: 'intermediate', cue: 'Turn side-on, ball up over the shoulder away from the reach, soft to the target.' },
      { name: 'Jump Hook', v: 'jump-hook', level: 'advanced', cue: 'Turn side-on and rise off both feet, hooking the ball high over the reach.' },
      { name: 'Hop-Step Finish', v: 'hop-step', level: 'intermediate', cue: 'Gather, hop onto both feet, then rise strong off the floor.' },
      { name: 'Up-and-Under Finish', v: 'up-under-finish', level: 'advanced', cue: 'Ball fake high toward the target, step through, and finish on the other side.' },
      { name: 'Full-Court Layup Lines', v: 'full-court', level: 'intermediate', equipment: ['basketball', 'hoop', 'cone'], cue: 'Speed dribble the length and finish, then back the other way.', dosage: reps(4, '4 lengths', 60), goals: ['finishing', 'conditioning'] },
    ],
  },
  {
    family: 'basketball-warmup', block: `${B}-footwork`, category: 'mobility', pattern: 'locomotion', plane: 'multi', laterality: 'alternating', skillLayer: 'wake-up', braceMode: 'none',
    primary: ['hip-flexors', 'glutes', 'calves'], secondary: ['adductors', 'quads'], goals: ['warmup', 'footwork', 'mobility'], sport: ['basketball'],
    lowLoad: ['back', 'shoulder', 'wrist'], youthOk: true, equipment: [], clip: 'shuffle',
    setup: 'Line up on the baseline; go to the free-throw line extended and back.',
    cues: ['Easy to start, a little faster each length.', 'Stay light on the floor, like the floor is a drum you play quietly.', 'Breathe out long on the walk back.'],
    faults: [
      { fault: 'Going hard on the first length', fix: 'Build: easy, medium, then quick.' },
      { fault: 'Loud, heavy steps', fix: 'Quick, quiet contacts on the floor.' },
    ],
    dosage: reps(1, '2 lengths', 0),
    variants: [
      { name: 'Baseline Jog and Backpedal', v: 'jog-back', level: 'beginner', cue: 'Jog out to the line, backpedal back, light on the floor.' },
      { name: 'Defensive Slide Warm-Up', v: 'slide', level: 'beginner', plane: 'frontal', cue: 'Easy slides out and back, low and level, the speed building.' },
      { name: 'Skip for Height', v: 'skip-height', level: 'beginner', cue: 'Skip and drive the knee up toward the ceiling, landing quiet on the floor.', goals: ['vertical', 'warmup'] },
      { name: 'Skip for Distance', v: 'skip-distance', level: 'intermediate', cue: 'Skip and push the floor back to travel as far as you can each skip.', goals: ['speed', 'warmup'] },
      { name: 'Lateral Skip', v: 'skip-lateral', level: 'beginner', plane: 'frontal', cue: 'Skip sideways, arms swinging across, light on the floor.' },
      { name: 'Closeout Warm-Up', v: 'closeout', level: 'intermediate', cue: 'Jog out, chop the feet short at the line, hand up to the target, back.', goals: ['defense', 'warmup'] },
    ],
  },
];
