// Batch 3, trunk and throws: anti-rotation (Pallof work by stance × implement × action), planks by position ×
// challenge, rollouts by implement × position, med-ball throws by throw × stance. The trunk work every athlete needs
// under the jumping, cutting and contact, in FEL's external-focus cues.
import { reps, secs, type Family, type Variant } from './types';
import { key, va } from './gen';

const BATCH = 3 as const;

// ── Pallof work ───────────────────────────────────────────────────────────────────────────────────────────────────

function pallofVariants(): Variant[] {
  const out: Variant[] = [];
  const stances: [string, string, number, string][] = [
    ['Standing', 'standing', 0, 'Stand side-on to the anchor, feet hip-width.'],
    ['Half-Kneeling', 'half-kneeling', 0, 'Half-kneel side-on to the anchor, the inside knee down.'],
    ['Tall-Kneeling', 'tall-kneeling', 0, 'Tall-kneel side-on to the anchor on a mat.'],
    ['Split-Stance', 'split', 1, 'Split stance side-on to the anchor.'],
    ['Lateral Lunge', 'lateral-lunge', 1, 'Side-on to the anchor, sink into a lateral lunge away from it.'],
    ['Single-Leg', 'single-leg', 2, 'Stand on the inside leg, side-on to the anchor.'],
  ];
  const actions: [string, string, number, string][] = [
    ['Press', 'press', 0, 'Press the handle straight out from the chest and back, the handle on a straight line.'],
    ['Press and Hold', 'hold', 0, 'Press the handle out and hold it still on the line for the count.'],
    ['Overhead Press', 'overhead', 1, 'Press the handle out, then up toward the ceiling and back, the handle never drifting.'],
    ['Rotate-Out', 'rotate-out', 1, 'Press out, then turn away from the anchor and back to centre, slow.'],
  ];
  const kits: [string, string, Variant['equipment']][] = [['Band', 'band', ['band']], ['Cable', 'cable', ['cable']]];
  for (const [imp, ik, eq] of kits) for (const [st, sk, sl, setup] of stances) for (const [act, ak, al, cue] of actions) {
    const name = `${imp} Pallof ${act}, ${st}`;
    const v = key(ik, ak, sk);
    const base = ik === 'cable' ? key('band', ak, sk) : undefined;
    out.push(va(name, v, sl + al, { setup: setup.replace('anchor', ik === 'cable' ? 'cable' : 'band anchor'), cue, equipment: [...(eq ?? []), ...(sk.includes('kneeling') ? ['mat' as const] : [])], ladder: ak, ...(base ? { base } : {}), ...(ak === 'hold' ? { dosage: secs(3, 20, 30) } : {}) }));
  }
  return out;
}

// ── planks and rollouts ───────────────────────────────────────────────────────────────────────────────────────────

const PLANKS: readonly [string, string, number, string][] = [
  ['Forearm Plank', 'forearm', 0, 'Forearms on the floor, body in one long line.'],
  ['High Plank', 'high', 0, 'Hands under the shoulders, body in one long line.'],
  ['Side Plank', 'side', 1, 'On one forearm, feet stacked, body in one long line.'],
  ['Bear Plank', 'bear', 0, 'Hands and toes on the floor, knees hovering an inch up.'],
  ['Long-Lever Forearm Plank', 'long-lever', 1, 'Forearms on the floor a little ahead of the shoulders, body in one long line.'],
  ['Reverse Plank', 'reverse', 1, 'Face-up, hands under the shoulders, heels on the floor, body in one long line.'],
];
const CHALLENGES: readonly [string, string, number, string, Partial<Variant>?][] = [
  ['with Leg Lift', 'leg-lift', 1, 'Lift one foot an inch off the floor and hold, the body still.'],
  ['with Arm Reach', 'arm-reach', 1, 'Reach one hand long toward the wall ahead and hold, the body still.'],
  ['with Band Row', 'band-row', 2, 'Row the band toward the floor beside you with one hand, the body still.', { equipment: ['band'] }],
  ['with Knee-to-Elbow', 'knee-elbow', 1, 'Draw one knee in off the floor toward the same-side elbow and back, slow, the line still.'],
  ['with Partner Push', 'partner-push', 2, 'A partner gives light pushes from the sides; stay still, like a table.'],
  ['with Plate Drag', 'plate-drag', 2, 'Reach under and drag a light plate across the floor to the other side, the body still.', { equipment: ['plate'] }],
];
function plankVariants(): Variant[] {
  const out: Variant[] = [];
  for (const [p, pk, pl, setup] of PLANKS) for (const [c, ck, cl, cue, over] of CHALLENGES) {
    if (pk === 'side' && ck === 'knee-elbow') continue; // the side-plank crunch is its own drill
    // face-up, a forearm plank and a side plank cannot reach under for a row or a plate; a reverse plank keeps to lifts and pushes
    if (pk === 'reverse' && !['leg-lift', 'partner-push'].includes(ck)) continue;
    if (ck === 'plate-drag' && !['high', 'bear'].includes(pk)) continue;
    if (ck === 'band-row' && ['side', 'forearm', 'long-lever'].includes(pk)) continue;
    out.push(va(`${p} ${c}`, key(pk, ck), pl + cl, { setup, cue, ladder: pk, ...(over ?? {}) }));
  }
  return out;
}
const ROLLOUTS: readonly [string, string, number, string, Variant['equipment']][] = [
  ['Slider Body Saw', 'slider-saw', 1, 'Forearm plank, feet on sliders: rock forward and back along the floor, slow.', ['slider']],
  ['Slider Rollout, Kneeling', 'slider-kneel', 1, 'Kneel with the hands on sliders: slide them out along the floor and back.', ['slider', 'mat']],
  ['Slider Mountain Climber', 'slider-climber', 1, 'High plank, feet on sliders: slide one knee in along the floor, then the other.', ['slider']],
  ['Barbell Rollout, Kneeling', 'barbell-kneel', 2, 'Kneel holding a loaded bar: roll it out along the floor and back.', ['barbell', 'plate', 'mat']],
  ['Ab Wheel Rollout, Standing', 'wheel-standing', 2, 'Standing, roll the wheel out along the floor as far as stays smooth, then back.', ['ab-wheel']],
  ['Stability Ball Pike', 'ball-pike', 2, 'High plank, shins on the ball: lift the hips toward the ceiling, slow.', ['stability-ball']],
  ['Stability Ball Knee Tuck', 'ball-tuck', 1, 'High plank, shins on the ball: roll the ball in toward the chest and out.', ['stability-ball']],
  ['Suspension Trainer Fallout', 'trx-fallout', 1, 'Lean into the straps and reach them up toward the ceiling, slow, then back.', ['suspension-trainer']],
  ['Suspension Trainer Pike', 'trx-pike', 2, 'Feet in the straps, high plank: lift the hips toward the ceiling, slow.', ['suspension-trainer']],
  ['Side Plank Hip Dip', 'side-dip', 1, 'In a side plank, lower the hips toward the floor and lift them back to the line, slow.', ['mat']],
  ['Side Plank Reach-Through', 'side-reach', 2, 'In a side plank, reach the top hand under the body toward the wall behind, then open up.', ['mat']],
];

// ── med-ball throws: throw × stance ───────────────────────────────────────────────────────────────────────────────

const THROWS: readonly [string, string, number, string, Variant['pattern']][] = [
  ['Chest Pass Throw', 'chest', 0, 'Step and snap the ball off the chest into the wall, as fast as you can.', 'push'],
  ['Overhead Throw', 'overhead', 0, 'Ball overhead, step and throw it down hard into the wall.', 'push'],
  ['Rotational Scoop Toss', 'scoop', 1, 'Load the back hip, then turn and scoop the ball into the wall, fast.', 'rotation'],
  ['Rotational Shot Put', 'shot-put', 1, 'Ball at the shoulder, turn and push it into the wall like a shot put.', 'rotation'],
  ['Side Toss', 'side-toss', 1, 'Swing the ball across the body and let it fly into the wall beside you.', 'rotation'],
  ['Underhand Scoop Throw', 'underhand', 0, 'Swing the ball low between the knees, then drive the floor away and throw it up the wall.', 'hinge'],
  ['Single-Arm Push Throw', 'single-push', 1, 'Ball in one hand at the shoulder, step and push it into the wall fast.', 'push'],
  ['Rotational Overhead Throw', 'rot-overhead', 2, 'Ball overhead, turn and throw it down across the body into the wall.', 'rotation'],
];
const THROW_STANCES: readonly [string, string, number, string][] = [
  ['Standing', 'standing', 0, 'Stand square or side-on a step from the wall, feet hip-width, ball at the chest.'],
  ['Tall-Kneeling', 'tall-kneeling', 0, 'Tall-kneel on a mat facing the wall, ball at the chest.'],
  ['Half-Kneeling', 'half-kneeling', 0, 'Half-kneel on a mat, side-on or facing the wall, ball at the chest.'],
  ['Split-Stance', 'split', 0, 'Split stance a step from the wall, ball at the chest.'],
  ['Step-In', 'step-in', 1, 'Stand a few steps back from the wall, ball at the chest.'],
  ['Single-Leg', 'single-leg', 2, 'Stand on one leg a step from the wall, ball at the chest.'],
];
function throwVariants(): Variant[] {
  const out: Variant[] = [];
  for (const [t, tk, tl, cue, pattern] of THROWS) for (const [st, sk, sl, setup] of THROW_STANCES) {
    out.push(va(`${st} Med Ball ${t}`, key(tk, sk), tl + sl, { setup, cue, pattern, plane: pattern === 'rotation' ? 'transverse' : 'sagittal', ladder: tk, equipment: ['medicine-ball', 'wall', ...(sk.includes('kneeling') ? ['mat' as const] : [])] }));
  }
  return out;
}

const DEAD_BUG: readonly [string, string, number, string, Variant['equipment']][] = [
  ['Dead Bug with Ball Squeeze', 'ball', 0, 'Squeeze a ball between the hands and knees, then reach one arm and the opposite leg long toward the floor.', ['stability-ball', 'mat']],
  ['Dead Bug with Plate Hold', 'plate', 1, 'Hold a light plate up toward the ceiling while the legs take turns reaching toward the floor.', ['plate', 'mat']],
  ['Dead Bug with Kettlebell Press', 'kb', 1, 'Press a light bell up toward the ceiling with one hand; the opposite leg reaches toward the floor.', ['kettlebell', 'mat']],
  ['Dead Bug, Wall Press', 'wall', 0, 'Hands press into a wall behind the head while the legs take turns reaching toward the floor.', ['wall', 'mat']],
  ['Dead Bug, Legs Only', 'legs', 0, 'Arms on the floor; the legs take turns reaching long toward the floor, slow.', ['mat']],
  ['Bird Dog with Band Row', 'bird-band', 1, 'On hands and knees, reach the opposite leg long toward the wall behind while one hand rows a band.', ['band', 'mat']],
  ['Plank Bird Dog', 'bird-plank', 2, 'From a high plank, reach one hand toward the wall ahead and the opposite foot toward the wall behind.', ['mat']],
  ['Bird Dog Hold, Knee Hover', 'bird-hover', 1, 'Knees hovering an inch off the floor, reach the opposite arm and leg long and hold.', ['mat']],
];

const TRUNK = { category: 'core' as const, batch: BATCH, youthOk: true };

export const LATER_TRUNK: Family[] = [
  {
    ...TRUNK, family: 'pallof-matrix', block: 'trunk-2', pattern: 'rotation', plane: 'transverse', laterality: 'unilateral', skillLayer: 'cylinder', braceMode: 'set',
    primary: ['obliques', 'deep-core'], secondary: ['abs', 'glutes'], goals: ['trunk'], sport: ['general', 'basketball', 'football', 'tennis'],
    lowLoad: ['knee', 'back', 'ankle'], equipment: ['band'], clip: 'brace',
    setup: 'Side-on to the anchor, the handle at the chest.',
    cues: ['The handle travels on a straight line; the pull never drags it off.', 'Tall and still, like a post planted in the floor.', 'Breathe out slowly as you press.'],
    faults: [
      { fault: 'Turning toward the anchor', fix: 'Keep the handle on a straight line out from the chest; stay square to the wall ahead.' },
      { fault: 'Leaning away from the band', fix: 'Stand tall and still, like a post planted in the floor.' },
    ],
    dosage: reps(3, '10 each side', 30), variants: pallofVariants(),
  },
  {
    ...TRUNK, family: 'plank-matrix', block: 'trunk-2', pattern: 'other', plane: 'sagittal', laterality: 'bilateral', skillLayer: 'cylinder', braceMode: 'set',
    primary: ['abs', 'deep-core'], secondary: ['obliques', 'delts', 'glutes'], goals: ['trunk'], sport: ['general', 'basketball'],
    lowLoad: ['knee', 'back'], equipment: ['mat'], clip: 'brace',
    setup: 'Body in one long line on the floor.',
    cues: ['Push the floor away and stay long, like a plank of wood.', 'Nothing moves but the part named.', 'Breathe out slowly, the line staying still.'],
    faults: [
      { fault: 'Hips sagging toward the floor', fix: 'Push the floor away and stay long, like a plank of wood.' },
      { fault: 'Twisting as the limb moves', fix: 'Move slower and smaller until the rest stays still.' },
    ],
    dosage: secs(3, 30, 30), variants: plankVariants(),
  },
  {
    ...TRUNK, family: 'rollout-matrix', block: 'trunk-2', pattern: 'other', plane: 'sagittal', laterality: 'bilateral', skillLayer: 'cylinder', braceMode: 'set',
    primary: ['abs', 'deep-core'], secondary: ['lats', 'delts', 'hip-flexors'], goals: ['trunk'], sport: ['general', 'basketball'],
    lowLoad: ['knee'], equipment: [], clip: 'brace', cautions: ['Only as far as the line stays long; shorten the range before you add more.'],
    setup: 'Take the position named on the floor.',
    cues: ['Only as far as the line stays long.', 'Move slow both ways.', 'Push the floor away the whole rep.'],
    faults: [
      { fault: 'The low back sagging toward the floor at the far end', fix: 'Shorten the range: only as far as the line stays long.' },
    ],
    dosage: reps(3, '8', 45), variants: ROLLOUTS.map(([name, k, l, cue, equipment]) => va(name, k, l, { cue, equipment })),
  },
  {
    ...TRUNK, family: 'med-ball-throw-matrix', block: 'trunk-throws', category: 'power', pattern: 'rotation', plane: 'transverse', laterality: 'bilateral', skillLayer: 'strength', braceMode: 'reflex',
    primary: ['obliques', 'glutes'], secondary: ['chest', 'delts', 'deep-core'], goals: ['power'], sport: ['general', 'basketball', 'football', 'tennis', 'volleyball'],
    lowLoad: ['knee'], equipment: ['medicine-ball', 'wall'], clip: 'throw',
    setup: 'Face or stand side-on to a solid wall, a medicine ball at the chest.',
    cues: ['Throw it as fast as you can into the wall.', 'The floor push starts the throw; the arms finish it.', 'Catch it, reset, and throw again: every rep fast.'],
    faults: [
      { fault: 'Arm-only throws', fix: 'Push the floor first, then let the turn and the arms follow.' },
      { fault: 'Slowing down over the set', fix: 'Stop the set when the ball stops hitting the wall hard.' },
    ],
    dosage: reps(3, '6', 45), variants: throwVariants(),
  },
  {
    ...TRUNK, family: 'dead-bug-bird-dog', block: 'trunk-2', pattern: 'other', plane: 'sagittal', laterality: 'alternating', skillLayer: 'cylinder', braceMode: 'set',
    primary: ['abs', 'deep-core'], secondary: ['obliques', 'glutes', 'hip-flexors'], goals: ['trunk'], sport: ['general', 'basketball'],
    lowLoad: ['knee', 'back', 'ankle'], equipment: ['mat'], clip: 'brace',
    setup: 'Take the position named on a mat.',
    cues: ['Reach long and slow, the rest of you still on the floor.', 'Breathe out as you reach long toward the floor.', 'Smaller and still beats bigger and wobbly.'],
    faults: [
      { fault: 'The low back arching off the floor', fix: 'Shorten the reach until the back stays heavy on the floor.' },
    ],
    dosage: reps(3, '8 each side', 30), variants: DEAD_BUG.map(([name, k, l, cue, equipment]) => va(name, k, l, { cue, equipment })),
  },
];
