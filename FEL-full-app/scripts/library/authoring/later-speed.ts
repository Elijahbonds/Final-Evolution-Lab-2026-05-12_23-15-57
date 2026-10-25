// Batch 2, speed and agility (owner priority 2026-10-25): sprint starts by start position × distance, resisted and
// top-speed work, sprint drills, cuts by cut × entry, patterned agility drills (and their with-the-ball versions),
// deceleration, ladder patterns, shuffle and backpedal patterns, and quick-feet drills.
import { SPRINT_CAUTION, meters, reps, secs, type Family, type Variant } from './types';
import { key, va } from './gen';

const BATCH = 2 as const;
const LEAN = 'Lean and push the floor back behind you, like pushing a car.';
const PUSH = 'Push the floor away from the way you want to go.';
const LOWLEVEL = 'Stay low and level, like under a low ceiling.';

// ── starts × distance ─────────────────────────────────────────────────────────────────────────────────────────────

const NEW_STARTS: readonly [string, string, number, string, string][] = [
  ['Prone Start', 'prone', 1, 'Lie face-down behind the line, hands under the chest.', 'Pop up off the floor and drive the first steps low, pushing the floor back.'],
  ['Supine Start', 'supine', 1, 'Lie face-up behind the line, head toward the cone.', 'Roll, pop up off the floor and drive out low toward the cone.'],
  ['Seated Start', 'seated', 1, 'Sit on the floor behind the line, facing the cone.', 'Get up off the floor in one move and drive out low toward the cone.'],
  ['Side-On Start', 'side-on', 1, 'Stand side-on to the cone, feet behind the line.', 'Open the hips toward the cone with a crossover step and drive out low.'],
  ['Back-to-the-Line Start', 'turn', 1, 'Stand with your back to the cone, feet behind the line.', 'Turn, then push the floor back and drive out low toward the cone.'],
  ['Split-Stance Start', 'split', 0, 'Stand in a split stance behind the line, front foot at the line.', 'Push the floor back off the front foot and drive the first steps low.'],
  ['Pogo-and-Go Start', 'pogo-go', 1, 'Stand tall behind the line on the balls of the feet.', 'Three quick pogos on the floor, then fall forward and sprint out low.'],
  ['Lateral Shuffle Start', 'shuffle-go', 1, 'Stand side-on behind the line in an athletic stance.', 'Two shuffles along the line, then open and sprint out low toward the cone.'],
];
const EXISTING_STARTS: readonly [string, string][] = [
  ['falling-start', 'Falling Start'], ['two-point-start-sprint', 'Two-Point Start'], ['three-point-start-sprint', 'Three-Point Start'],
  ['push-up-start-sprint', 'Push-Up Start'], ['half-kneeling-start-sprint', 'Half-Kneeling Start'],
];
function startVariants(): Variant[] {
  const out: Variant[] = [];
  for (const [label, k, l, setup, cue] of NEW_STARTS) {
    out.push(va(`${label}, 10 m Sprint`, key(k, '10'), l, { setup, cue, dosage: meters(5, 10, 60), ladder: k }));
    out.push(va(`${label}, 5 m Sprint`, key(k, '5'), l, { base: key(k, '10'), setup, cue, dosage: meters(6, 5, 45), ladder: k }));
    out.push(va(`${label}, 20 m Sprint`, key(k, '20'), l + 1, { base: key(k, '10'), setup, cue: `${cue.replace(/\.$/, '')}, then rise tall as the speed builds.`, dosage: meters(4, 20, 90), ladder: k }));
    out.push(va(`Band-Resisted ${label}, 10 m Sprint`, key(k, 'band'), l + 1, {
      base: key(k, '10'), setup: `${setup} A partner holds a band around the hips from behind.`, cue: `${cue.replace(/\.$/, '')} against the band.`, equipment: ['cone', 'band'], dosage: meters(5, 10, 60), ladder: k,
    }));
  }
  for (const [id, label] of EXISTING_STARTS) {
    out.push(va(`${label}, 5 m Sprint`, key(id, '5'), 0, { base: `id:${id}`, cue: 'Drive the first three steps low, pushing the floor back behind you.', dosage: meters(6, 5, 45) }));
    out.push(va(`${label}, 20 m Sprint`, key(id, '20'), 1, { base: `id:${id}`, cue: 'Drive out low, then rise tall as the speed builds to the cone.', dosage: meters(4, 20, 90) }));
  }
  return out;
}

// ── sprint development ────────────────────────────────────────────────────────────────────────────────────────────

const DEVELOP: readonly [string, string, number, string, Partial<Variant>][] = [
  ['Sled-Resisted March', 'sled-march', 0, 'Lean into the harness and march the sled, each step pushing the floor back.', { equipment: ['sled'], base: 'id:sled-resisted-sprint', dosage: meters(4, 15, 60) }],
  ['Band-Resisted A-March', 'band-a-march', 0, 'A partner holds the band at the hips: march tall, each step pushing the floor back.', { equipment: ['band'], base: 'id:a-march', dosage: meters(3, 15, 45) }],
  ['Partner Towel-Resisted Sprint', 'towel-sprint', 1, 'A partner holds a towel around the hips: drive out low against it for the distance.', { equipment: ['towel'], base: 'id:band-resisted-sprint', dosage: meters(5, 10, 60) }],
  ['Stair Sprint', 'stairs', 1, 'Hit every step quick and light, driving up the stairs.', { equipment: ['step'], dosage: reps(5, '1 flight', 60) }],
  ['Hill Bounding', 'hill-bound', 2, 'Bound up the hill, each push long and springy off the floor.', { base: 'id:hill-sprint', dosage: meters(4, 20, 90) }],
  ['Band-Resisted Crossover Run', 'band-crossover', 1, 'A partner holds the band at the hips: crossover run along the line against it.', { equipment: ['band'], base: 'id:crossover-run', plane: 'frontal', dosage: meters(3, 10, 45) }],
  ['Flying 20', 'fly-20', 1, 'Build up over 20 metres, then hold top speed through the 20-metre zone.', { equipment: ['cone'], base: 'id:flying-10', dosage: meters(4, 20, 120) }],
  ['Flying 30', 'fly-30', 2, 'Build up over 20 metres, then hold top speed through the 30-metre zone.', { equipment: ['cone'], base: 'id:flying-10', dosage: meters(3, 30, 180) }],
  ['Fly-Float-Fly Sprint', 'fly-float', 2, 'Sprint the first zone, float the middle one smooth and tall, sprint the last.', { equipment: ['cone'], dosage: meters(3, 60, 180) }],
  ['Wicket Run', 'wicket', 1, 'Step over each mini hurdle with a quick, tall stride, the floor hit under you.', { equipment: ['mini-hurdle'], dosage: reps(4, '1 run', 90) }],
  ['Wicket Run, Acceleration Spacing', 'wicket-accel', 1, 'Hurdles get further apart: lean early and let the strides lengthen over each one.', { equipment: ['mini-hurdle'], base: 'wicket', dosage: reps(4, '1 run', 90) }],
  ['Wicket Run, Top-Speed Spacing', 'wicket-top', 2, 'Hurdles evenly spaced: run tall and quick over each one at top speed.', { equipment: ['mini-hurdle'], base: 'wicket', dosage: reps(4, '1 run', 120) }],
  ['Wall Drill, Single Exchange', 'wall-single', 0, 'Lean into the wall and switch the knees once, quick and sharp, on the count.', { equipment: ['wall'], base: 'id:wall-drive-switches', dosage: reps(3, '5 each side', 30) }],
  ['Wall Drill, Double Exchange', 'wall-double', 1, 'Lean into the wall and switch twice on the count, quick and sharp.', { equipment: ['wall'], base: 'id:wall-drive-switches', dosage: reps(3, '5', 30) }],
  ['Wall Drill, Triple Exchange', 'wall-triple', 1, 'Lean into the wall and switch three times on the count, quick and sharp.', { equipment: ['wall'], base: 'id:wall-drive-switches', dosage: reps(3, '5', 30) }],
  ['Seated Arm Swing Drill', 'arm-seated', 0, 'Sit tall on the floor and swing the arms cheek to back pocket, fast and loose.', { dosage: secs(3, 10, 30) }],
  ['Standing Arm Swing Drill', 'arm-standing', 0, 'Stand tall and swing the arms cheek to back pocket, fast, like a sprinter.', { dosage: secs(3, 10, 30) }],
  ['Single-Leg A-Skip', 'a-skip-sl', 1, 'One side only: skip, striking the floor right under you each time.', { base: 'id:a-skip', laterality: 'unilateral', dosage: meters(3, 15, 30) }],
  ['Fast-Leg Drill', 'fast-leg', 1, 'Every third step, cycle the leg fast and strike the floor right under you.', { dosage: meters(3, 20, 45) }],
  ['Straight-Leg Run', 'straight-leg-run', 1, 'Run with stiff legs, striking the floor under the hips with quick, short pulls.', { dosage: meters(3, 20, 30) }],
  ['Skip to Sprint', 'skip-sprint', 1, 'A-skip for 10 metres, then go straight into a sprint to the cone.', { base: 'id:a-skip', equipment: ['cone'], dosage: meters(4, 20, 60) }],
  ['Hill Sprint, 20 m', 'hill-20', 1, 'Drive up the hill 20 metres, the steps short and powerful, then walk down.', { base: 'id:hill-sprint', dosage: meters(6, 20, 90) }],
  ['Hill Sprint, 40 m', 'hill-40', 2, 'Drive up the hill 40 metres, tall as the speed builds, then walk down.', { base: 'id:hill-sprint', dosage: meters(4, 40, 150) }],
  ['Sled-Resisted Sprint, 20 m', 'sled-20', 1, 'Lean into the harness and drive the sled 20 metres, the floor pushed back.', { equipment: ['sled'], base: 'id:sled-resisted-sprint', dosage: meters(4, 20, 120) }],
  ['Band-Resisted Sprint, 5 m', 'band-5', 0, 'Drive out 5 metres against the band, three hard steps and stop.', { equipment: ['band'], base: 'id:band-resisted-sprint', dosage: meters(6, 5, 45) }],
  ['Mini-Hurdle A-Run', 'hurdle-a-run', 1, 'Run over the mini hurdles with the knee driving up and the floor struck right under you.', { equipment: ['mini-hurdle'], dosage: reps(3, '2 runs', 45) }],
  ['Mini-Hurdle Lateral Run', 'hurdle-lat-run', 1, 'Side-on, run over each mini hurdle quick and light on the floor, never touching a hurdle.', { equipment: ['mini-hurdle'], plane: 'frontal', dosage: reps(3, '2 runs', 45) }],
  ['Mini-Hurdle High-Knee Run', 'hurdle-high-knee', 0, 'One quick step between each mini hurdle, tall, the floor hit under you.', { equipment: ['mini-hurdle'], dosage: reps(3, '2 runs', 45) }],
  ['Build-Up Strides', 'strides', 0, 'Build smoothly to about 80 percent over the distance, tall and smooth.', { base: 'id:build-up-run', dosage: meters(4, 60, 60) }],
  ['Partner-Chase Start', 'chase', 1, 'Start a metre behind the partner; when they go, chase and try to tag them before the cone.', { equipment: ['cone'], dosage: meters(5, 15, 60) }],
  ['Partner Tag Escape Sprint', 'escape', 1, 'A partner starts a metre behind you; go on their move and beat them to the cone.', { equipment: ['cone'], dosage: meters(5, 15, 60) }],
  ['5-10-5 Shuttle with a Dribble', 'pro-dribble', 1, 'Run the 5-10-5 dribbling, the ball on the outside hand at each touch.', { equipment: ['cone', 'basketball'], base: 'id:5-10-5-shuttle', sport: ['basketball'], goals: ['agility', 'handles'], dosage: reps(4, '1', 60) }],
  ['T-Drill with a Dribble', 't-dribble', 2, 'Run the T dribbling: sprint, shuffle, shuffle, backpedal, the ball low.', { equipment: ['cone', 'basketball'], base: 'id:t-drill', sport: ['basketball'], goals: ['agility', 'handles'], dosage: reps(4, '1', 60) }],
  ['Three-Cone L-Drill with a Dribble', 'l-dribble', 2, 'Run the L dribbling, changing to the outside hand around each cone.', { equipment: ['cone', 'basketball'], base: 'id:three-cone-l-drill', sport: ['basketball'], goals: ['agility', 'handles'], dosage: reps(4, '1', 60) }],
  ['Tempo Run, 100 m', 'tempo-100', 0, 'Run 100 metres at about 70 percent, smooth and tall, then walk back.', { base: 'id:tempo-run', dosage: meters(8, 100, 60) }],
  ['Tempo Run, 200 m', 'tempo-200', 1, 'Run 200 metres at about 70 percent, smooth and tall, then walk 100.', { base: 'id:tempo-run', dosage: meters(5, 200, 90) }],
];

// ── cuts × entry ──────────────────────────────────────────────────────────────────────────────────────────────────

const CUTS: readonly [string, string, number, string][] = [
  ['45° Cut', '45', 1, 'Plant outside the hips and push the floor away on the angle to the next cone.'],
  ['90° Cut', '90', 1, 'Lower the hips into the plant, then push the floor away square to the new line.'],
  ['180° Turn', '180', 1, 'Sink and plant side-on, touch the line, and push the floor away back the way you came.'],
  ['Crossover Cut', 'crossover', 1, 'Plant, then cross over toward the cone and drive out on the new line along the floor.'],
  ['Side-Step Cut', 'side-step', 1, 'Plant wide and push the floor away to the opposite side in one sharp step.'],
  ['Jump-Stop Cut', 'jump-stop', 1, 'Jump stop on two feet at the cone, quiet, then push off on the new line.'],
  ['Speed Turn', 'speed-turn', 2, 'Round the cone in a tight arc without slowing, the steps short and quick.'],
];
const ENTRIES: readonly [string, string, number, string][] = [
  ['from a Sprint', 'sprint', 0, 'Sprint 10 metres to the cone, then cut.'],
  ['from a Backpedal', 'backpedal', 1, 'Backpedal 5 metres to the cone, then cut.'],
  ['from a Shuffle', 'shuffle', 1, 'Shuffle 5 metres to the cone, then cut.'],
];
function cutVariants(): Variant[] {
  const out: Variant[] = [];
  for (const [label, k, l, cue] of CUTS) for (const [entry, ek, el, setup] of ENTRIES) {
    out.push(va(`${label} ${entry}`, key(k, ek), l + el, { cue, setup: `${setup} Cones set for the cut.`, ladder: k, ...(ek !== 'sprint' ? { base: key(k, 'sprint') } : {}) }));
  }
  for (const [label, k, l, cue] of CUTS) {
    out.push(va(`${label} with a Dribble`, key(k, 'dribble'), l + 1, {
      base: key(k, 'sprint'), ladder: k, equipment: ['cone', 'basketball'], sport: ['basketball'], goals: ['agility', 'handles'],
      setup: 'Speed dribble 10 metres to the cone, then cut.', cue: `${cue} The ball changes to the outside hand on the cut.`,
    }));
  }
  return out;
}

// ── patterned agility drills ──────────────────────────────────────────────────────────────────────────────────────

const PATTERNS: readonly [string, string, number, string, string][] = [
  ['Star Drill', 'star', 1, 'Five cones in a star around a centre cone.', 'Sprint out to each cone and back to the centre, quick feet at every turn.'],
  ['W-Drill', 'w-drill', 1, 'Five cones in a W shape, 5 metres apart.', 'Sprint forward and backpedal through the W, sharp at every cone.'],
  ['X-Drill', 'x-drill', 1, 'Four cones in a square, 5 metres apart.', 'Sprint the diagonals and shuffle the sides, sharp at every cone.'],
  ['Lane Agility Drill', 'lane', 1, 'Cones at the four corners of the lane.', 'Sprint, shuffle, backpedal and shuffle around the lane, low at the corners.'],
  ['Y-Drill', 'y-drill', 2, 'Cones in a Y: a start, a middle cone, and two at the ends.', 'Sprint to the middle cone, then cut to the end a partner points to.'],
  ['Z-Drill', 'z-drill', 1, 'Cones in a zig-zag, 5 metres apart.', 'Sprint and cut at each cone, plant outside the hips each time.'],
  ['Arrowhead Drill', 'arrowhead', 2, 'Cones in an arrowhead: a start, a middle, a tip and a side cone.', 'Sprint, cut around the side cone, sprint to the tip and back.'],
  ['N-Drill', 'n-drill', 1, 'Four cones in an N shape, 5 metres apart.', 'Sprint up, shuffle across the diagonal, and sprint up again.'],
  ['Four-Cone Square Drill', 'square', 0, 'Four cones in a square, 5 metres apart.', 'Sprint, shuffle, backpedal, shuffle around the square, quick at every cone.'],
];
function patternVariants(): Variant[] {
  return PATTERNS.flatMap(([name, k, l, setup, cue]) => [
    va(name, k, l, { setup, cue, ladder: k }),
    va(`${name} with a Dribble`, key(k, 'dribble'), l + 1, {
      base: k, ladder: k, equipment: ['cone', 'basketball'], setup: `${setup} Dribble the whole way.`, cue: 'Keep the ball low and on the outside hand at every cone.', sport: ['basketball'], goals: ['agility', 'handles'],
    }),
  ]);
}

// ── deceleration, shuffles, backpedals, ladders, quick feet ───────────────────────────────────────────────────────

const DECEL: readonly [string, string, number, string, string?][] = [
  ['Single-Leg Decel to Stick', 'sl-stick', 2, 'Sprint 10 metres, then stop on one leg at the line, still and silent.', 'id:decel-to-stick'],
  ['Decel from 20 m', 'from-20', 1, 'Sprint 20 metres, then stop in three steps at the line, low and still.', 'id:decel-to-stick'],
  ['Crossover Decel', 'crossover', 1, 'Sprint, then stop side-on with a crossover step at the line, low and still.', 'id:decel-to-stick'],
  ['Decel into Cut', 'into-cut', 2, 'Sprint, stop in three steps at the cone, then cut out at an angle.', 'id:decel-to-stick'],
  ['Backpedal to Stick', 'backpedal', 1, 'Backpedal 10 metres, then stop at the line, low and still.', 'id:decel-to-backpedal'],
  ['Sprint-Stop-Sprint', 'stop-go', 1, 'Sprint to the cone, stop dead in three steps, then sprint to the next cone.', 'id:decel-to-stick'],
  ['Lateral Bound Decel', 'lat-bound', 2, 'Bound sideways and stop the slide on the outside leg at the line.', 'id:lateral-shuffle-decel'],
  ['Decel to Lateral Shuffle', 'to-shuffle', 1, 'Sprint, stop in three steps at the line, then shuffle out to the side cone.', 'id:decel-to-stick'],
  ['Decel to Jump Stop', 'jump-stop', 1, 'Sprint, then stop on two feet at the line in a quiet jump stop.', 'id:decel-to-stick'],
  ['Curved-Run Decel', 'curve-decel', 2, 'Run the curve to the cone and stop square and still at the line.', 'id:decel-to-stick'],
];
const SHUFFLE: readonly [string, string, number, string, string?][] = [
  ['Lateral Shuffle, Three Steps and Stick', 'shuffle-3-stick', 0, 'Shuffle three steps, then stop square and still at the line.', 'id:lateral-shuffle'],
  ['Shuffle to Crossover Run', 'shuffle-crossover', 1, 'Shuffle two steps, then turn and crossover run to the cone.', 'id:lateral-shuffle'],
  ['Shuffle-Sprint-Shuffle', 'shuffle-sprint-shuffle', 1, 'Shuffle to the first cone, sprint to the second, shuffle to the third.', 'id:lateral-shuffle'],
  ['Partner Shuffle Mirror', 'shuffle-mirror', 1, 'Mirror the partner along the line, staying square to them.', 'id:mirror-drill'],
  ['Backpedal to Shuffle', 'backpedal-shuffle', 1, 'Backpedal to the cone, then open and shuffle sideways along the line.', 'id:backpedal'],
  ['Backpedal Zig-Zag', 'backpedal-zigzag', 1, 'Backpedal on the diagonal from cone to cone, turning the hips at each one.', 'id:backpedal'],
  ['Backpedal to Turn and Run', 'backpedal-turn', 1, 'Backpedal, then turn on the call and sprint back past the cone.', 'id:backpedal-to-sprint'],
  ['Carioca to Sprint', 'carioca-sprint', 1, 'Carioca along the line to the cone, then open and sprint.', 'id:carioca'],
  ['High-Knee Carioca', 'carioca-high', 1, 'Carioca with the back knee driving high across the front, quick on the floor.', 'id:carioca'],
  ['Shuffle-Crossover-Shuffle', 'shuffle-cross-shuffle', 1, 'Shuffle two steps, crossover run two, shuffle two, along the line on the floor.', 'id:lateral-shuffle'],
  ['Backpedal-Shuffle-Sprint Box', 'box-combo', 1, 'Backpedal, shuffle, sprint and shuffle around four cones, sharp at each one.', 'id:backpedal'],
  ['Lateral Shuffle to Backpedal', 'shuffle-backpedal', 1, 'Shuffle to the cone, then drop and backpedal to the next one.', 'id:lateral-shuffle'],
  ['Partner Mirror Backpedal', 'mirror-backpedal', 1, 'Mirror the partner forward and back along the line, staying square to them.', 'id:mirror-drill'],
];
const LADDER: readonly [string, string, number, string, Variant['plane']][] = [
  ['Ladder Lateral One In', 'lat-one-in', 0, 'Side-on to the ladder: one quick, light step in each square on the floor.', 'frontal'],
  ['Ladder In-In-Out Shuffle', 'in-in-out', 1, 'In, in, out to the side at each square, moving forward down the ladder.', 'multi'],
  ['Ladder Two-Foot Hops', 'two-foot-hops', 0, 'Hop into each square on the floor, light and quick.', 'sagittal'],
  ['Ladder Lateral Two-Foot Hops', 'lat-two-foot', 1, 'Side-on: hop into each square on the floor, light and quick.', 'frontal'],
  ['Ladder Zig-Zag Hops', 'zigzag-hops', 1, 'Hop in and out of each square, side to side, moving forward.', 'multi'],
  ['Ladder Scissors', 'scissors', 1, 'Scissor front and back across the ladder on the floor as you move along it.', 'frontal'],
  ['Ladder Carioca', 'carioca', 1, 'Carioca down the side of the ladder, one quick step in each square on the floor.', 'frontal'],
  ['Ladder Straddle Hops', 'straddle', 0, 'Jump out beside the ladder, then in, out, in, light on the floor, moving forward.', 'sagittal'],
  ['Ladder Backward Two Feet In', 'backward', 1, 'Backward down the ladder: two quick steps in each square on the floor.', 'sagittal'],
  ['Ladder Slalom Jumps', 'slalom', 1, 'Jump across the ladder side to side on the floor as you move along it.', 'frontal'],
  ['Ladder Single-Leg Lateral Hops', 'sl-lat', 2, 'One foot, side-on: hop into each square, quiet on every contact.', 'frontal'],
  ['Ladder Crossover Steps', 'crossover-steps', 1, 'Cross over into each square on the floor, moving forward down the ladder.', 'multi'],
  ['Ladder Two In, Two Out Lateral', 'two-in-two-out', 1, 'Side-on: two steps in, two steps out, along the ladder on the floor.', 'frontal'],
  ['Ladder to Sprint', 'to-sprint', 1, 'Two feet in each square, then explode out of the ladder to the cone.', 'sagittal'],
];
const QUICK: readonly [string, string, number, string][] = [
  ['Dot Drill', 'dot', 1, 'Hop the five dots on the floor in the pattern, quick and light.'],
  ['Quick Feet in Place', 'in-place', 0, 'Fast, light steps on the spot, the feet barely leaving the floor.'],
  ['Quick Feet to Sprint', 'to-sprint', 1, 'Fast feet on the spot, then on the call sprint to the cone.'],
  ['Cone Taps', 'cone-taps', 0, 'Tap the top of the cone with alternate feet, fast and light.'],
  ['Line Quick Steps', 'line-steps', 0, 'Step over the line on the floor and back, fast and light.'],
  ['Fast Feet to Shuffle', 'to-shuffle', 1, 'Fast feet on the spot, then shuffle to the cone on the point.'],
];

const SPEED = { category: 'speed-agility' as const, braceMode: 'reflex' as const, batch: BATCH, youthOk: true };

export const LATER_SPEED: Family[] = [
  {
    ...SPEED, family: 'sprint-starts', block: 'speed-starts', pattern: 'locomotion', plane: 'sagittal', laterality: 'alternating', skillLayer: 'speed',
    primary: ['glutes', 'quads', 'hamstrings'], secondary: ['calves', 'hip-flexors'], goals: ['speed'], sport: ['general', 'basketball', 'soccer', 'football', 'track'],
    lowLoad: ['back'], equipment: ['cone'], clip: 'sprint', cautions: [SPRINT_CAUTION],
    setup: 'Start behind the line, a cone at the distance.',
    cues: [LEAN, 'Drive the first steps low, then rise tall as the speed builds.', 'Punch the arms cheek to back pocket.'],
    faults: [
      { fault: 'Standing straight up out of the start', fix: 'Stay low for the first three steps, pushing the floor back behind you.' },
      { fault: 'Short, choppy first steps', fix: 'Push the floor back long and hard on each of the first steps.' },
    ],
    dosage: meters(5, 10, 60), variants: startVariants(),
  },
  {
    ...SPEED, family: 'sprint-development', block: 'speed-2', pattern: 'locomotion', plane: 'sagittal', laterality: 'alternating', skillLayer: 'speed',
    primary: ['glutes', 'hamstrings', 'quads'], secondary: ['calves', 'hip-flexors'], goals: ['speed'], sport: ['general', 'basketball', 'soccer', 'football', 'track'],
    lowLoad: ['back'], equipment: [], clip: 'sprint', cautions: [SPRINT_CAUTION],
    setup: 'Open floor or a track, cones at the distance.',
    cues: [LEAN, 'Strike the floor right under you, quick and light.', 'Punch the arms cheek to back pocket.'],
    faults: [
      { fault: 'Reaching out in front with each stride', fix: 'Strike the floor right under you, quick and light.' },
      { fault: 'Stiff, slow arm action', fix: 'Punch the arms cheek to back pocket, fast and loose.' },
    ],
    dosage: meters(4, 20, 60), variants: DEVELOP.map(([name, k, l, cue, over]) => va(name, k, l, { cue, ...over })),
  },
  {
    ...SPEED, family: 'cut-matrix', block: 'speed-cuts', pattern: 'locomotion', plane: 'multi', laterality: 'alternating', skillLayer: 'speed',
    primary: ['quads', 'glutes', 'adductors'], secondary: ['calves', 'glute-med', 'hamstrings'], goals: ['agility'], sport: ['general', 'basketball', 'soccer', 'football', 'tennis'],
    lowLoad: ['back'], equipment: ['cone'], clip: 'shuffle', cautions: ['Plant only as hard as you can stop: build to full speed over a few sets.'],
    setup: 'Cones set for the cut.',
    cues: [PUSH, 'Get low before the plant, not after: the floor arrives under a bent leg.', 'Plant outside the hips, then drive out on the new line.'],
    faults: [
      { fault: 'Knee caving in on the plant', fix: 'Plant with the knee out over the laces and push the floor away.' },
      { fault: 'Standing tall into the cut', fix: 'Lower the hips before the plant, like ducking under a bar.' },
    ],
    dosage: reps(4, '3 each side', 45), variants: cutVariants(),
  },
  {
    ...SPEED, family: 'agility-patterns', block: 'speed-cuts', pattern: 'locomotion', plane: 'multi', laterality: 'alternating', skillLayer: 'speed',
    primary: ['quads', 'glutes', 'calves'], secondary: ['adductors', 'glute-med'], goals: ['agility', 'speed'], sport: ['general', 'basketball', 'soccer', 'football', 'tennis'],
    lowLoad: ['back'], equipment: ['cone'], clip: 'shuffle',
    setup: 'Cones set in the pattern.',
    cues: [PUSH, LOWLEVEL, 'Short, quick steps into every cone; long steps out of it.'],
    faults: [
      { fault: 'Rounding the turns wide', fix: 'Short, quick steps into the cone, then push the floor away out of it.' },
      { fault: 'Standing tall at the cones', fix: 'Stay low and level, like under a low ceiling.' },
    ],
    dosage: reps(4, '1', 60), variants: patternVariants(),
  },
  {
    ...SPEED, family: 'decel-2', block: 'speed-2', pattern: 'locomotion', plane: 'sagittal', laterality: 'alternating', skillLayer: 'speed',
    primary: ['quads', 'glutes'], secondary: ['hamstrings', 'calves'], goals: ['agility', 'landing', 'knee'], sport: ['general', 'basketball', 'soccer', 'football', 'tennis'],
    lowLoad: ['back'], equipment: ['cone'], clip: 'sprint',
    setup: 'A cone to sprint to and a line to stop at.',
    cues: ['Short, quick steps into the stop, lowering as you go.', 'Stop square and still at the line.', 'Land quiet on every step of the stop.'],
    faults: [
      { fault: 'Stopping tall and loud', fix: 'Lower the hips into the stop, quiet on every step.' },
      { fault: 'Knees caving in on the last step', fix: 'Land with the knees out over your laces.' },
    ],
    dosage: reps(4, '3', 45), variants: DECEL.map(([name, k, l, cue, base]) => va(name, k, l, { cue, ...(base ? { base } : {}) })),
  },
  {
    ...SPEED, family: 'shuffle-backpedal-2', block: 'speed-2', pattern: 'locomotion', plane: 'frontal', laterality: 'alternating', skillLayer: 'speed',
    primary: ['quads', 'glute-med', 'adductors'], secondary: ['calves', 'glutes'], goals: ['agility', 'footwork'], sport: ['general', 'basketball', 'soccer', 'tennis'],
    lowLoad: ['back'], equipment: ['cone'], clip: 'shuffle',
    setup: 'Athletic stance, feet wider than the hips, cones set for the drill.',
    cues: [PUSH, LOWLEVEL, 'Never let the feet cross or click together on the shuffle.'],
    faults: [
      { fault: 'Feet clicking together on the shuffle', fix: 'Push the floor away and keep the feet apart, never crossing.' },
      { fault: 'Bouncing up and down', fix: 'Stay low and level, like under a low ceiling.' },
    ],
    dosage: reps(3, '3', 30), variants: SHUFFLE.map(([name, k, l, cue, base]) => va(name, k, l, { cue, ...(base ? { base } : {}) })),
  },
  {
    ...SPEED, family: 'ladder-2', block: 'speed-footwork', pattern: 'locomotion', plane: 'sagittal', laterality: 'alternating', skillLayer: 'wake-up',
    primary: ['calves', 'quads'], secondary: ['foot', 'hip-flexors'], goals: ['footwork', 'agility', 'warmup'], sport: ['general', 'basketball', 'soccer', 'football', 'tennis'],
    lowLoad: ['back', 'shoulder', 'wrist'], equipment: ['agility-ladder'], clip: 'shuffle',
    setup: 'Stand at the end of the agility ladder.',
    cues: ['Quick, light contacts on the floor: the ladder never moves.', 'Eyes ahead down the ladder, not down at the floor.', 'Clean first, then fast.'],
    faults: [
      { fault: 'Kicking the ladder', fix: 'Slow down until every contact lands clean in its square, then speed up.' },
      { fault: 'Heavy, loud contacts', fix: 'Stay on the balls of the feet, quick and quiet on the floor.' },
    ],
    dosage: reps(3, '2 lengths', 30), variants: LADDER.map(([name, k, l, cue, plane]) => va(name, k, l, { cue, plane, ...(k === 'to-sprint' ? { equipment: ['agility-ladder', 'cone'], goals: ['speed'] } : {}) })),
  },
  {
    ...SPEED, category: 'sport-skill', family: 'ladder-dribble', block: 'basketball-handles-2', pattern: 'locomotion', plane: 'sagittal', laterality: 'alternating', skillLayer: 'wake-up',
    primary: ['calves', 'forearms'], secondary: ['quads', 'delts'], goals: ['handles', 'footwork'], sport: ['basketball'],
    lowLoad: ['back', 'knee'], equipment: ['agility-ladder', 'basketball'], clip: 'dribble',
    setup: 'Stand at the end of the agility ladder with the ball.',
    cues: ['Quick, light contacts on the floor while the ball keeps a steady beat.', 'Eyes ahead down the ladder, not on the ball.', 'Clean first, then fast.'],
    faults: [
      { fault: 'Watching the ball and kicking the ladder', fix: 'Eyes ahead; slow down until the feet and the ball both stay clean.' },
    ],
    dosage: reps(3, '2 lengths', 30),
    variants: ([
      ['Ladder One Foot In with a Dribble', 'one-in', 0, 'One quick step in each square on the floor, pounding the ball beside you.'],
      ['Ladder Two Feet In with a Dribble', 'two-in', 1, 'Two quick steps in each square on the floor, the ball pounding on the outside.'],
      ['Ladder Lateral Two In with a Dribble', 'lat-two-in', 1, 'Side-on: two steps in each square on the floor, the ball on the outside hand.'],
      ['Ladder In-In-Out-Out with a Dribble', 'in-out', 1, 'In, in, out, out along the ladder on the floor, a crossover at every square.'],
      ['Ladder Hopscotch with a Dribble', 'hopscotch', 2, 'Hopscotch down the ladder on the floor while the ball keeps a steady beat.'],
      ['Ladder Crossover Steps with a Dribble', 'crossover', 2, 'Cross over into each square on the floor, the ball switching hands as you go.'],
    ] as const).map(([name, k, l, cue]) => va(name, k, l, { cue })),
  },
  {
    ...SPEED, family: 'quick-feet', block: 'speed-footwork', pattern: 'locomotion', plane: 'multi', laterality: 'alternating', skillLayer: 'wake-up',
    primary: ['calves'], secondary: ['foot', 'quads'], goals: ['footwork', 'warmup', 'agility'], sport: ['general', 'basketball', 'soccer', 'football', 'tennis'],
    lowLoad: ['back', 'shoulder', 'wrist', 'knee'], equipment: [], clip: 'hop',
    setup: 'Stand tall on the balls of the feet, a line or cones on the floor.',
    cues: ['Quick, light contacts on the floor.', 'Stay tall and quiet, like a spring.', 'Clean first, then fast.'],
    faults: [
      { fault: 'Heavy, loud contacts', fix: 'Stay on the balls of the feet, quick and quiet on the floor.' },
    ],
    dosage: secs(3, 15, 30), variants: QUICK.map(([name, k, l, cue]) => va(name, k, l, { cue, ...(['cone-taps', 'to-sprint', 'to-shuffle'].includes(k) ? { equipment: ['cone'] } : {}) })),
  },
];

