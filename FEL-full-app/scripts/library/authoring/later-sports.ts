// Batch 2, the other sports the library tags (volleyball, soccer, tennis and racket sports, football): the footwork
// and skill drills those athletes search for ("speed drills for soccer", "plyometrics for volleyball"), in the same
// external-focus style. FEL's own drill names; the common sport words otherwise. The equipment list has no volleyball,
// soccer ball or football (vocab.ts), so those drills list only their cones or wall and name the ball in the set-up.
import { meters, reps, secs, type Family, type Variant } from './types';
import { key, va } from './gen';

const BATCH = 2 as const;

const VOLLEY: readonly [string, string, number, string, Partial<Variant>?][] = [
  ['Forearm Pass to Target', 'pass-target', 0, 'Angle the platform toward the target and let the ball rebound off it; the floor push lifts it.', { equipment: ['cone'] }],
  ['Shuffle and Forearm Pass', 'shuffle-pass', 1, 'Shuffle to get behind the ball first, stop square, then pass it to the target.', { equipment: ['cone'] }],
  ['Wall Forearm Passing', 'wall-pass', 0, 'Pass the ball off the wall to a mark at head height, again and again.', { equipment: ['wall'] }],
  ['Wall Setting', 'wall-set', 0, 'Set the ball off the wall to a mark above head height, the hands a soft window.', { equipment: ['wall'] }],
  ['Overhead Set to Target', 'set-target', 1, 'Get under the ball, then push it up and out to the target in a high arc.', { equipment: ['cone'] }],
  ['Low-Stance Dig Drill', 'dig', 1, 'Stay low and still; a partner hits the ball at you and you pass it up toward the ceiling.', {}],
  ['Serve-Receive Footwork', 'serve-receive', 1, 'Read the toss, move to the ball with short steps, and stop square to the target.', { equipment: ['cone'] }],
  ['Standing Arm Swing Drill', 'arm-swing', 0, 'Bow back, then whip the hand high toward the target on the wall.', { equipment: ['wall'] }],
  ['Approach and Arm Swing to Target', 'approach-swing', 2, 'Four-step approach, jump, and swing at a ball tossed to the target height.', {}],
  ['Float Serve to Target', 'float-serve', 1, 'Toss low in front, step, and push through the middle of the ball to the target zone.', { equipment: ['cone'] }],
  ['Blocking Swing Footwork', 'block-swing', 2, 'Swing-step along the line, plant square, and jump, reaching up and over the line toward the ball.', {}],
  ['Three-Step Block Move', 'block-three', 2, 'Three steps along the line, plant square, and jump straight up toward the ceiling, reaching high and firm.', {}],
  ['Partner Pepper', 'pepper', 1, 'Pass, set, hit back and forth with a partner, moving to every ball.', {}],
  ['Overhead Pass on the Move', 'set-move', 2, 'Shuffle under the ball, stop square, and set it to the target.', { equipment: ['cone'] }],
  ['Sprawl Dig Drill', 'sprawl', 2, 'Sprint, then dive-slide low along the floor to dig the ball up, and recover fast.', { equipment: ['mat'] }],
  ['Jump Serve Toss Drill', 'jump-toss', 1, 'Toss the ball high and out in front, then step into the approach without hitting it.', {}],
  ['Free-Ball Shuffle and Pass', 'free-ball', 1, 'Shuffle to the free ball, stop square to the target, and pass it high to the setter spot.', { equipment: ['cone'] }],
  ['Transition Footwork, Block to Approach', 'block-approach', 2, 'Land from the block, open off the line, and step into a full approach.', {}],
  ['Back-Row Attack Approach', 'back-row', 2, 'Approach from behind the line on the floor and jump forward to hit.', {}],
  ['Setter Footwork to Target', 'setter', 1, 'Run to the target spot, stop square to the left antenna line on the floor, and shadow the set.', { equipment: ['cone'] }],
  ['Libero Shuffle-Dig Pattern', 'libero', 2, 'Shuffle to each cone in turn, drop low, and shadow a dig, then recover to the middle.', { equipment: ['cone'] }],
];
const SOCCER_TOUCHES: readonly [string, string, number, string][] = [
  ['Toe Taps', 'toe-taps', 0, 'Tap the top of the ball with alternate soles, light and quick.'],
  ['Sole Rolls', 'sole-rolls', 0, 'Roll the ball across with the sole, then back with the other, the ball close.'],
  ['Inside-Outside Touches', 'in-out', 1, 'Touch the ball inside, then outside, with the same foot, the ball never far away.'],
  ['Push-Pull Touches', 'push-pull', 1, 'Push the ball forward with the laces, pull it back with the sole.'],
  ['Inside Taps', 'bells', 0, 'Tap the ball side to side between the insides of both feet, light and quick.'],
  ['Step-Overs', 'step-overs', 1, 'Circle a foot over the ball and plant beyond it, then take it the other way.'],
  ['Drag-Back Turn', 'drag-back', 1, 'Drag the ball back with the sole and turn away with it in one move.'],
  ['Inside Hook Turn', 'inside-hook', 1, 'Hook the ball back across with the inside of the foot and go the other way.'],
  ['Outside Hook Turn', 'outside-hook', 1, 'Hook the ball back with the outside of the foot and accelerate away.'],
  ['Scissor Feint', 'scissor', 2, 'Swing a foot around the front of the ball, plant, and push it away the other way.'],
  ['V Pull-Back', 'v-pull', 1, 'Pull the ball back with the sole and push it away on the angle with the inside of the same foot.'],
  ['Roll and Stop', 'roll-stop', 0, 'Roll the ball across with the sole, then stop it dead with the other sole.'],
  ['Inside Cut', 'inside-cut', 1, 'Cut the ball back across the body with the inside of the foot and go.'],
  ['Outside Cut', 'outside-cut', 1, 'Cut the ball away with the outside of the foot and accelerate the other way.'],
  ['Sole Stop and Go', 'sole-stop', 0, 'Stop the ball under the sole, pause, then push it ahead and go.'],
  ['Double Touch', 'double-touch', 2, 'Touch the ball across with the inside of one foot and on with the inside of the other.'],
  ['Laces Push and Stop', 'laces-stop', 0, 'Push the ball ahead with the laces, then stop it dead under the sole.'],
  ['Outside-Foot Taps', 'outside-taps', 1, 'Tap the ball along with the outside of the same foot, small and quick.'],
  ['Sole Pull and Turn', 'sole-turn', 1, 'Pull the ball back under the sole and turn the other way in one move.'],
];
function soccerVariants(): Variant[] {
  const out: Variant[] = [];
  for (const [name, k, l, cue] of SOCCER_TOUCHES) {
    out.push(va(`Ball Mastery: ${name}`, k, l, { cue, ladder: k }));
    out.push(va(`Ball Mastery: ${name} on the Move`, key(k, 'move'), l + 1, { base: k, ladder: k, cue: `${cue.replace(/\.$/, '')}, travelling along the line.`, dosage: meters(3, 15, 30) }));
  }
  const more: [string, string, number, string, Partial<Variant>?][] = [
    ['Cone Weave Dribble, Inside of the Foot', 'weave-inside', 0, 'Weave the ball through the cones with the inside of the foot, close and quick.', { equipment: ['cone'], dosage: meters(3, 20, 30) }],
    ['Cone Weave Dribble, Outside of the Foot', 'weave-outside', 1, 'Weave the ball through the cones with the outside of the foot only.', { equipment: ['cone'], dosage: meters(3, 20, 30) }],
    ['Gate Dribbling', 'gates', 1, 'Dribble through as many cone gates as you can, a new gate every time.', { equipment: ['cone'], dosage: secs(3, 45, 45) }],
    ['One-Touch Wall Passing', 'wall-one', 1, 'Pass into the wall and return it first time, the ankle locked, the ball low.', { equipment: ['wall'] }],
    ['Two-Touch Wall Passing', 'wall-two', 0, 'Pass into the wall, control it with one touch, pass it back with the next.', { equipment: ['wall'] }],
    ['First Touch off the Wall', 'first-touch', 1, 'Pass hard into the wall and take the return into space with one soft touch.', { equipment: ['wall'] }],
    ['Weaker-Foot Wall Passing', 'weak-wall', 1, 'Pass every ball into the wall with the weaker side: clean beats hard.', { equipment: ['wall'] }],
    ['Foot Juggling', 'juggle-foot', 1, 'Keep the ball up with the laces, a soft touch, the ball below the knee.', {}],
    ['Thigh-and-Foot Juggling', 'juggle-thigh', 2, 'Keep the ball up with a thigh, then a foot, alternating, soft touches.', {}],
    ['Driven Wall Pass with the Laces', 'wall-laces', 1, 'Strike through the middle of the ball with the laces so it drives low into the wall.', { equipment: ['wall'] }],
    ['Chip onto a Target', 'chip', 2, 'Stab under the ball so it lifts and drops onto the cone target.', { equipment: ['cone'] }],
    ['Cross-Body First Touch', 'cross-touch', 1, 'Take the pass across the body with the far foot into the space beside the cone.', { equipment: ['wall', 'cone'] }],
    ['Receive on the Half-Turn', 'half-turn', 2, 'Open up side-on to the wall and take the pass forward toward the cone in one touch.', { equipment: ['wall', 'cone'] }],
    ['Dribble Speed Gates', 'speed-gates', 1, 'Dribble through two gates at full speed, the ball pushed out ahead.', { equipment: ['cone'], dosage: meters(4, 20, 45) }],
  ];
  for (const [name, k, l, cue, over] of more) out.push(va(name, k, l, { cue, ...(over ?? {}) }));
  return out;
}
const RACKET: readonly [string, string, number, string][] = [
  ['Split Step to First Step', 'split-first', 0, 'Small hop off the floor as the partner points, land light, and push off toward the point.'],
  ['Shadow Forehand Footwork', 'shadow-fh', 1, 'Move to the forehand cone, load the outside leg, swing, and recover to the centre mark.'],
  ['Shadow Backhand Footwork', 'shadow-bh', 1, 'Move to the backhand cone, load, swing, and recover to the centre mark.'],
  ['Crossover Recovery Step', 'crossover-recover', 1, 'After the shadow swing, cross over and push the floor back toward the centre mark.'],
  ['Six-Cone Court Spider', 'spider', 1, 'Sprint from the centre mark to each cone and back, touching each one.'],
  ['Shadow Volley Footwork', 'shadow-volley', 1, 'Split step, then step across to the cone with a short, firm volley shape.'],
  ['Open-Stance Load and Recover', 'open-stance', 1, 'Load the outside leg wide, swing, then push off it back toward the centre.'],
  ['Drop-Step Overhead Footwork', 'overhead', 2, 'Turn side-on, drop-step back to the cone, and reach high for the overhead.'],
  ['Side Shuffle Recovery to Centre', 'shuffle-centre', 0, 'Shuffle back to the centre mark after each shadow swing, low and quick.'],
  ['Wide-Ball Slide and Recover', 'wide-slide', 2, 'Slide wide to the far cone, plant low, and push the floor away back to the centre.'],
  ['Shadow Approach and Split', 'approach-split', 1, 'Run forward to the service-line cone, split step on the point, and move to it.'],
  ['Short-Ball Sprint and Recover', 'short-ball', 1, 'Sprint forward to the cone, shadow the shot, and backpedal to the centre mark.'],
  ['Closed-Stance Step-In Footwork', 'closed-stance', 1, 'Step across toward the cone side-on, shadow the swing, and recover.'],
  ['Two-Ball Feed Recovery Drill', 'two-ball-feed', 2, 'A partner points left and right in turn; shadow each and recover to the mark.'],
  ['Baseline Shuffle Rally Footwork', 'baseline-shuffle', 0, 'Shuffle along the baseline between two cones, shadowing a shot at each one.'],
  ['Net Approach Split and Volley', 'net-approach', 2, 'Run in to the cone, split step on the point, and step across to shadow the volley.'],
  ['Cross-Court Recovery Run', 'cross-recovery', 1, 'Shadow a wide shot at the far cone, then crossover and run back to the centre mark.'],
  ['Forehand Inside-Out Footwork', 'inside-out', 2, 'Step around to the backhand-side cone and shadow a forehand, then recover to the mark.'],
  ['Serve and First-Step Footwork', 'serve-first', 1, 'Shadow the serve, land inside the line on the floor, and split step for the return.'],
];
const GRIDIRON: readonly [string, string, number, string, Partial<Variant>?][] = [
  ['Backpedal and Break at 45°', 'break-45', 1, 'Backpedal to the cone, plant, and drive forward on the 45-degree line.'],
  ['Backpedal and Break at 90°', 'break-90', 1, 'Backpedal to the cone, plant, and drive out flat along the line.'],
  ['Hip Turn and Run', 'hip-turn', 1, 'Backpedal, then on the call turn and open toward the sideline and run with the partner.'],
  ['Press-Release Footwork', 'release', 1, 'Quick jab at the line, then a sharp step past the cone and burst up the field.'],
  ['Speed-Out Route Footwork', 'speed-out', 1, 'Sprint five metres, round off at the cone, and run flat to the sideline.'],
  ['Pass-Rush Get-Off', 'get-off', 1, 'From the stance, first step on the ball snap: long, low and hard.'],
  ['Kick-Step Footwork', 'kick-step', 1, 'From the stance, kick-step back and set, square to the cone, twice.'],
  ['Over-the-Hurdle Shuffle', 'hurdle-shuffle', 1, 'Shuffle over each mini hurdle without touching it, eyes up on the cone ahead.', { equipment: ['mini-hurdle'] }],
  ['Ball-Security Cone Weave', 'ball-security', 0, 'Weave the cones with the football high and tight, switching arms at each cone.', { equipment: ['cone'] }],
  ['Three-Point Stance Get-Off to 10 m', 'stance-10', 1, 'From the three-point stance, explode out on the call and sprint to the cone.'],
  ['Backpedal Weave', 'backpedal-weave', 1, 'Backpedal and weave left and right on the partner\'s point, eyes on the partner.'],
  ['Comeback Route Footwork', 'comeback', 1, 'Sprint to the cone, sink, and come back toward the line in two quick steps.'],
  ['Slant Route Footwork', 'slant', 0, 'Three hard steps up the field, plant, and cut inside on the slant line.'],
  ['Lateral Mirror Drill, Pass Rush', 'mirror-rush', 1, 'Mirror the partner along the line, then on the call rush past the cone.'],
  ['Out-Route Footwork', 'out-route', 1, 'Sprint to the cone, sink in three steps, and break flat to the sideline.'],
  ['Pedal and Drive Footwork', 'pedal-drive', 1, 'Backpedal three steps, plant, and drive forward to the cone on the call.'],
  ['Zone Drop Footwork', 'zone-drop', 1, 'Open and drop back to the zone cone, eyes on the partner, then break on the point.'],
  ['Running Back Cut Footwork', 'rb-cut', 1, 'Press the line toward the cone, plant, and cut back the other way in one step.'],
  ['Hand-Fighting Stance Drill', 'hand-fight', 1, 'Low stance on the line, quick strikes at the partner\'s pads, the stance still on the floor.'],
];

const SPORT = { category: 'sport-skill' as const, batch: BATCH, youthOk: true };

export const LATER_SPORTS: Family[] = [
  {
    ...SPORT, family: 'volleyball-skills', block: 'sport-multi', pattern: 'locomotion', plane: 'multi', laterality: 'bilateral', skillLayer: 'speed', braceMode: 'reflex',
    primary: ['quads', 'delts', 'calves'], secondary: ['glutes', 'forearms', 'deep-core'], goals: ['footwork'], sport: ['volleyball'],
    lowLoad: ['back'], equipment: [], clip: 'shuffle',
    setup: 'Athletic stance on the court with a volleyball, a partner or a wall ready.',
    cues: ['Get to the spot first, then play the ball.', 'Stop square to the target before the contact.', 'Light, quick steps on the floor.'],
    faults: [
      { fault: 'Reaching for the ball instead of moving to it', fix: 'Move the feet first and get behind the ball, then play it.' },
      { fault: 'Off balance at contact', fix: 'Stop square to the target before the ball arrives.' },
    ],
    dosage: reps(3, '10', 30), variants: VOLLEY.map(([name, k, l, cue, over]) => va(name, k, l, { cue, ...(over ?? {}) })),
  },
  {
    ...SPORT, family: 'soccer-ball-skills', block: 'sport-multi', pattern: 'locomotion', plane: 'multi', laterality: 'alternating', skillLayer: 'wake-up', braceMode: 'reflex',
    primary: ['calves', 'quads', 'foot'], secondary: ['adductors', 'hip-flexors'], goals: ['footwork'], sport: ['soccer'],
    lowLoad: ['back', 'shoulder', 'wrist'], equipment: [], clip: 'shuffle',
    setup: 'A soccer ball at your feet, open floor or a wall in front.',
    cues: ['Keep the ball close, never more than a step away.', 'Eyes up between touches.', 'Light, quick touches; clean first, then fast.'],
    faults: [
      { fault: 'The ball getting away', fix: 'Smaller touches: the ball stays within a step.' },
      { fault: 'Head down the whole time', fix: 'Glance up at a cone between every few touches.' },
    ],
    dosage: secs(3, 30, 30), variants: soccerVariants(),
  },
  {
    ...SPORT, family: 'racket-footwork', block: 'sport-multi', pattern: 'locomotion', plane: 'multi', laterality: 'alternating', skillLayer: 'speed', braceMode: 'reflex',
    primary: ['quads', 'glutes', 'calves'], secondary: ['adductors', 'glute-med', 'obliques'], goals: ['footwork', 'agility'], sport: ['tennis'],
    lowLoad: ['back'], equipment: ['cone'], clip: 'shuffle',
    setup: 'Start on a centre mark on the floor with cones at the corners of your court space.',
    cues: ['Split step as the partner points: land light and ready.', 'Load the outside leg into every shot shape.', 'Recover to the centre mark after every swing.'],
    faults: [
      { fault: 'Flat-footed when the point comes', fix: 'Small split step off the floor on the point, landing light and ready.' },
      { fault: 'Watching the swing instead of recovering', fix: 'Push the floor back toward the centre mark straight after every swing.' },
    ],
    dosage: reps(3, '8', 30), variants: RACKET.map(([name, k, l, cue]) => va(name, k, l, { cue })),
  },
  {
    ...SPORT, family: 'football-footwork', block: 'sport-multi', pattern: 'locomotion', plane: 'multi', laterality: 'alternating', skillLayer: 'speed', braceMode: 'reflex',
    primary: ['quads', 'glutes', 'hamstrings'], secondary: ['calves', 'adductors'], goals: ['footwork', 'agility', 'speed'], sport: ['football'],
    lowLoad: ['back'], equipment: ['cone'], clip: 'sprint',
    setup: 'Cones set for the drill on open field or floor.',
    cues: ['Push the floor away from the way you want to go.', 'Stay low through the break, then drive out.', 'Eyes up on the cone or the partner, not on the floor.'],
    faults: [
      { fault: 'Standing tall into the break', fix: 'Sink before the plant, then push the floor away out of it.' },
      { fault: 'Rounding the cut wide', fix: 'Short, quick steps into the cone, a sharp plant, a long push out.' },
    ],
    dosage: reps(4, '3', 45), variants: GRIDIRON.map(([name, k, l, cue, over]) => va(name, k, l, { cue, ...(over ?? {}) })),
  },
];
