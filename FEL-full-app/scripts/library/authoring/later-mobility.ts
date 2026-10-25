// Batch 3, mobility and recovery (owner priority 2026-10-25): mobility FLOWS built only from positions that really
// lead into each other (a down dog steps through to a spiderman lunge; a 90/90 sit does not), slow joint circles,
// stretches by target × position, dynamic warm-up moves, and breathing drills for the cool-down.
import { reps, secs, type Family, type Variant } from './types';
import { key, va } from './gen';

const BATCH = 3 as const;

// ── flows ─────────────────────────────────────────────────────────────────────────────────────────────────────────

interface Pos { k: string; n: string; cue: string; level: number; equipment?: Variant['equipment'] }
const P: readonly Pos[] = [
  { k: 'squat', n: 'Deep Squat', cue: 'Sit down between the heels, the floor flat under the feet.', level: 0 },
  { k: 'cossack', n: 'Cossack Shift', cue: 'Shift side to side along the floor, one leg long, heels down.', level: 1 },
  { k: 'fold', n: 'Forward Fold', cue: 'Hang heavy toward the floor, long and loose.', level: 0 },
  { k: 'inchworm', n: 'Inchworm', cue: 'Walk the hands out along the floor to a long plank and back.', level: 0 },
  { k: 'dog', n: 'Down Dog', cue: 'Push the floor away into a long upside-down V, heels sinking to the floor.', level: 0 },
  { k: 'spider', n: 'Spiderman Lunge', cue: 'Step up outside the hand and let the hips sink toward the floor.', level: 0 },
  { k: 'halfsplit', n: 'Half Split', cue: 'Rock back over the front heel, toes up toward the ceiling.', level: 0 },
  { k: 'lowlunge', n: 'Low Lunge Reach', cue: 'Sink into the lunge and reach the hands up toward the ceiling.', level: 0 },
  { k: 'kneel', n: 'Half-Kneeling Hip Opener', cue: 'Tuck the belt buckle up and shift forward until the front of the hip opens.', level: 0 },
  { k: 'ninety', n: '90/90 Sit', cue: 'Sit tall between two right angles on the floor.', level: 0 },
  { k: 'pigeon', n: 'Pigeon', cue: 'Square the belt line to the front wall and sink toward the floor.', level: 1 },
  { k: 'shinbox', n: 'Shin Box Rise', cue: 'Rise up to tall kneeling from the 90/90 and sit back down, smooth.', level: 1 },
  { k: 'child', n: "Child's Pose", cue: 'Sit back toward the heels, the hands reaching long along the floor.', level: 0, equipment: ['mat'] },
  { k: 'catcamel', n: 'Cat-Camel', cue: 'Round up toward the ceiling, then sag toward the floor, slowly, like a wave.', level: 0, equipment: ['mat'] },
  { k: 'thread', n: 'Thread the Needle', cue: 'Slide one hand under along the floor, then open it up toward the ceiling.', level: 0, equipment: ['mat'] },
  { k: 'frog', n: 'Frog Rock', cue: 'Knees wide on the floor, rock back toward the wall behind and forward again.', level: 0, equipment: ['mat'] },
];
const EDGES: readonly [string, string][] = [
  ['squat', 'cossack'], ['squat', 'fold'], ['squat', 'spider'], ['squat', 'frog'], ['fold', 'inchworm'], ['fold', 'dog'], ['inchworm', 'dog'], ['inchworm', 'spider'],
  ['dog', 'spider'], ['dog', 'child'], ['dog', 'pigeon'], ['dog', 'halfsplit'], ['spider', 'halfsplit'], ['spider', 'lowlunge'], ['halfsplit', 'kneel'], ['halfsplit', 'lowlunge'],
  ['kneel', 'lowlunge'], ['kneel', 'ninety'], ['ninety', 'pigeon'], ['ninety', 'shinbox'], ['pigeon', 'child'], ['child', 'catcamel'], ['child', 'thread'], ['child', 'frog'],
  ['catcamel', 'thread'], ['catcamel', 'frog'], ['thread', 'frog'],
];
const pos = (k: string): Pos => P.find((p) => p.k === k)!;
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

function flowVariants(): Variant[] {
  const out: Variant[] = [];
  const nb = new Map<string, string[]>();
  for (const [a, b] of EDGES) { nb.set(a, [...(nb.get(a) ?? []), b]); nb.set(b, [...(nb.get(b) ?? []), a]); }
  const eq = (...ps: Pos[]) => [...new Set(ps.flatMap((p) => p.equipment ?? []))];
  for (const [a, b] of EDGES) {
    const A = pos(a), B = pos(b);
    out.push(va(`${A.n} to ${B.n} Flow`, key('flow', a, b), Math.max(A.level, B.level), {
      equipment: eq(A, B), cues: [A.cue, `Then flow on the floor into the ${B.n.toLowerCase()}: ${lowerFirst(B.cue)}`, 'Breathe out as you sink into each position; move on the breath in.'], ladder: a,
    }));
  }
  // three-position chains along the edges, each once (a chain and its reverse are the same flow)
  for (const [b, list] of nb) for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const [a, c] = [list[i], list[j]].sort();
    const A = pos(a), B = pos(b), C = pos(c);
    out.push(va(`${A.n}, ${B.n} and ${C.n} Flow`, key('flow3', a, b, c), Math.max(1, A.level, B.level, C.level), {
      equipment: eq(A, B, C), ladder: b, dosage: reps(2, '4 slow rounds each side', 30),
      cues: [`On the floor, flow from the ${A.n.toLowerCase()} through the ${B.n.toLowerCase()} to the ${C.n.toLowerCase()}.`, B.cue, 'Breathe out as you sink into each position; move on the breath in.'],
    }));
  }
  return out;
}

// ── joint circles, stretches, dynamic warm-up, breathing ──────────────────────────────────────────────────────────

const CIRCLES: readonly [string, string, number, string, Partial<Variant>?][] = [
  ['Controlled Hip Circle, Standing', 'hip-standing', 1, 'Hold the wall and draw the biggest slow circle you can with the knee, the standing side still.', { equipment: ['wall'], goals: ['hip'] }],
  ['Controlled Shoulder Circle, Standing', 'shoulder-standing', 0, 'Reach long and draw the biggest slow circle you can toward the walls and ceiling.', { goals: ['shoulder'] }],
  ['Controlled Shoulder Circle, Side-Lying', 'shoulder-side', 0, 'Lie on your side and sweep the top hand in a slow circle over the floor and back.', { equipment: ['mat'], goals: ['shoulder'] }],
  ['Controlled Ankle Circle, Seated', 'ankle-seated', 0, 'Draw the biggest slow circle you can with the toes, the shin still on the floor.', { equipment: ['mat'], goals: ['ankle'] }],
  ['Controlled Wrist Circle', 'wrist', 0, 'Draw slow, smooth circles as big as they go, both ways, the forearms still.', {}],
  ['Standing Spine Wave', 'spine-standing', 0, 'Hands on the thighs, round up toward the ceiling, then arch, slowly, like a wave.', {}],
  ['Controlled Neck Turns', 'neck', 0, 'Turn the eyes slowly to one wall, then the other, the movement small and smooth.', { goals: ['posture'] }],
  ['Controlled Thoracic Circle, Seated', 'thoracic-seated', 1, 'Sit tall on a bench and circle the ribcage slowly, the belt line still.', { equipment: ['bench'] }],
];
const STRETCHES: readonly [string, string, number, string, string, Partial<Variant>?][] = [
  ['Hip Flexor Stretch, Standing Split Stance', 'hf-standing', 0, 'Split stance, back heel up.', 'Tuck the belt buckle up and shift forward until the front of the hip opens.', { goals: ['hip'] }],
  ['Hip Flexor Stretch, Rear Foot on a Bench', 'hf-bench', 1, 'Back foot laces-down on a bench, front foot planted.', 'Tuck the belt buckle up and sink toward the floor, the front of the hip opening.', { equipment: ['bench'], goals: ['hip'] }],
  ['Hip Flexor Stretch with Overhead Reach', 'hf-reach', 0, 'Half-kneeling on a mat, front foot planted.', 'Tuck the belt buckle up, then reach the hand on the kneeling side up toward the ceiling.', { equipment: ['mat'], goals: ['hip'] }],
  ['Side-Lying Quad and Hip Stretch', 'quad-side', 0, 'Lie on your side and hold the top ankle.', 'Draw the ankle toward the seat of your shorts, then move it back behind the line of the floor.', { equipment: ['mat'] }],
  ['Prone Quad Stretch with a Strap', 'quad-prone', 0, 'Lie face-down with a strap around the ankle.', 'Draw the heel toward the seat of your shorts with the strap, the hips flat on the floor.', { equipment: ['mat', 'towel'] }],
  ['Hamstring Stretch, Foot on a Box', 'ham-box', 0, 'Heel on a low box, leg long, hands on the hips.', 'Hinge toward the box with a long back until the back of the leg opens.', { equipment: ['box'] }],
  ['Seated Single-Leg Hamstring Stretch', 'ham-seated', 0, 'Sit on the floor, one leg long, the other foot against its knee.', 'Reach along the floor toward the toes of the long leg, chest leading.', { equipment: ['mat'] }],
  ['Doorway Hamstring Stretch', 'ham-doorway', 0, 'Lie in a doorway, one leg up the frame, the other flat along the floor.', 'Slide closer to the door frame until the back of the leg opens, then breathe.', {}],
  ['Kneeling Half-Split Hold', 'ham-halfsplit', 1, 'Half-kneeling, front leg long, heel on the floor.', 'Rock back over the front heel with a long back, toes up toward the ceiling.', { equipment: ['mat'] }],
  ['Side-Lying Adductor Stretch', 'add-side', 0, 'Lie on your side, top foot planted in front, bottom leg long.', 'Lift the bottom leg off the floor slowly, then lower it, the stretch along the inside of the top leg.', { equipment: ['mat'] }],
  ['Seated Wide Straddle Reach', 'add-straddle', 1, 'Sit on the floor with the legs wide, toes up.', 'Walk the hands forward along the floor, chest leading, then back.', { equipment: ['mat'] }],
  ['Standing Side-Lunge Hold', 'add-sidelunge', 0, 'Stand with the feet very wide.', 'Sit into one hip, the other leg long, heels on the floor, and hold.', {}],
  ['Calf Stretch, Straight Knee at the Wall', 'calf-straight', 0, 'Hands on the wall, back leg long, heel down.', 'Lean toward the wall, the back heel heavy on the floor.', { equipment: ['wall'], goals: ['ankle'] }],
  ['Calf Stretch, Bent Knee at the Wall', 'calf-bent', 0, 'Hands on the wall, back knee bent, heel down.', 'Sink the back knee toward the floor, the heel still down.', { equipment: ['wall'], goals: ['ankle'] }],
  ['Step Drop Calf Stretch, Straight Knee', 'calf-step-straight', 0, 'Balls of the feet on a step, holding a rail or wall.', 'Let the step sink away under you, slow, and hold.', { equipment: ['step'], goals: ['ankle'] }],
  ['Step Drop Calf Stretch, Bent Knee', 'calf-step-bent', 1, 'Balls of the feet on a step, knees bent, holding a rail.', 'Sink toward the floor with soft knees, the step under the toes, and hold.', { equipment: ['step'], goals: ['ankle'] }],
  ['Down Dog Calf Pedal', 'calf-dog', 0, 'In a down dog on a mat.', 'Press one heel toward the floor, then the other, slow and smooth.', { equipment: ['mat'], goals: ['ankle'] }],
  ['Seated Figure-4 Stretch', 'glute-seated', 0, 'Sit on a bench, one ankle across the other knee.', 'Hinge forward toward the floor with a long back until the outside of the hip opens.', { equipment: ['bench'], goals: ['hip'] }],
  ['Standing Figure-4 Stretch', 'glute-standing', 1, 'Stand on one leg holding a wall, the other ankle across the knee.', 'Sit back toward the wall behind you until the outside of the hip opens.', { equipment: ['wall'], goals: ['hip', 'balance'] }],
  ['Doorway Lat Stretch', 'lat-door', 0, 'Hold the door frame at shoulder height with both hands.', 'Sit the hips back away from the door frame, arms long, until the side opens.', { goals: ['shoulder'] }],
  ['Kneeling Stability Ball Lat Stretch', 'lat-ball', 0, 'Kneel with the forearms on a stability ball.', 'Roll the ball away along the floor and sink the chest toward the floor.', { equipment: ['stability-ball', 'mat'], goals: ['shoulder'] }],
  ['Corner Chest Stretch', 'chest-corner', 0, 'Forearms on the two walls of a corner, at shoulder height.', 'Lean into the corner of the wall until the front opens, the chin tucked.', { equipment: ['wall'], goals: ['shoulder', 'posture'] }],
  ['Floor Snow Angel', 'chest-angel', 0, 'Lie face-up on the floor, arms out at the sides.', 'Slide the backs of the hands along the floor up overhead and back, slow.', { equipment: ['mat'], goals: ['shoulder', 'posture'] }],
  ['Seated Rotation with a Dowel', 'tspine-dowel', 0, 'Sit tall on a bench, a dowel across the upper back.', 'Turn the dowel toward one wall, then the other, the belt line still.', { equipment: ['dowel', 'bench'], goals: ['posture'] }],
  ['Foam Roller Thoracic Extension', 'tspine-roller', 0, 'Lie with a foam roller across the upper back, hands behind the head.', 'Sink back over the roller toward the floor, then move the roller a little lower.', { equipment: ['foam-roller'], goals: ['posture'] }],
  ['Side-Lying Windmill Reach', 'tspine-windmill', 0, 'Lie on your side, knees bent, arms long in front on the floor.', 'Sweep the top hand over in a big arc to the floor behind you, eyes following.', { equipment: ['mat'], goals: ['posture'] }],
  ['Wall Wrist Flexor Stretch', 'wrist-flex', 0, 'Palm flat on the wall, fingers pointing down.', 'Lean gently toward the wall until the inside of the forearm opens.', { equipment: ['wall'] }],
  ['Wall Wrist Extensor Stretch', 'wrist-ext', 0, 'Back of the hand flat on the wall, fingers pointing down.', 'Lean gently toward the wall until the top of the forearm opens.', { equipment: ['wall'] }],
  ['Kneeling Toe Stretch', 'toe-kneel', 0, 'Kneel on a mat with the toes tucked under.', 'Sit back toward the floor until the bottoms of the toes open, then breathe.', { equipment: ['mat'], goals: ['ankle'] }],
  ['Kneeling Shin Stretch', 'shin-kneel', 0, 'Kneel on a mat with the laces flat on the floor.', 'Sit back toward the floor until the front of the shin opens.', { equipment: ['mat'], goals: ['ankle'] }],
  ['Quadruped Rock-Back', 'quad-rock', 0, 'On hands and knees on a mat.', 'Rock back toward the wall behind you and forward again, a long back the whole way.', { equipment: ['mat'], goals: ['hip'] }],
  ['Elevated Pigeon Stretch', 'pigeon-bench', 0, 'Front shin across a bench, back leg long behind.', 'Square the belt line to the bench and hinge forward toward it.', { equipment: ['bench'], goals: ['hip'] }],
  ['Supine Hamstring Stretch with a Strap, Leg Across', 'ham-across', 1, 'Lie face-up with a strap around one foot.', 'Draw the long leg across the body toward the floor on the far side, the hips flat.', { equipment: ['mat', 'towel'] }],
];
const DYNAMIC: readonly [string, string, number, string][] = [
  ['Walking Spiderman with Overhead Reach', 'spider-reach', 0, 'Step into a spiderman lunge, reach the inside hand up toward the ceiling, then step through.'],
  ['Lateral Lunge to Overhead Reach', 'lat-lunge-reach', 0, 'Lunge sideways along the floor, then stand and reach both hands up toward the ceiling.'],
  ['Walking Lunge with Rotation', 'lunge-rot', 0, 'Lunge forward, turn toward the wall on the front-leg side, then step through.'],
  ['Reverse Lunge with Overhead Reach', 'rev-lunge-reach', 0, 'Step back into the lunge and reach both hands up toward the ceiling.'],
  ['Straight-Leg Kick Walk', 'kick-walk', 0, 'Kick a straight leg up toward the ceiling and the opposite hand, tall, then step through.'],
  ['Inchworm to Spiderman', 'inch-spider', 1, 'Walk the hands out along the floor, step up into a spiderman lunge, then walk back.'],
  ['Lunge to Half-Split Walk', 'lunge-halfsplit', 1, 'Lunge, rock back into a half split with the toes up toward the ceiling, then step through.'],
  ['Lateral Squat Walk', 'lat-squat-walk', 0, 'Stay low and step sideways along the floor, heels down, chest tall.'],
  ['Knee Hug to Lunge', 'hug-lunge', 0, 'Hug one knee up off the floor, then step it forward into a lunge.'],
  ['Walking Quad Pull to Hinge Reach', 'quad-hinge', 1, 'Pull one heel up behind you, then hinge and reach the free hand toward the floor.'],
  ['Cross-Body Arm Swings', 'arm-swings', 0, 'Swing the arms open toward the walls and cross them in front, loose and easy.'],
  ['Torso Turns with Reach', 'torso-turns', 0, 'Turn the chest to one wall and reach long toward it, then the other.'],
  ['Skip with Arm Circles', 'skip-circles', 0, 'Skip lightly along the floor while the arms circle forward, then back.'],
  ['Walking Hip Hinge Reach', 'hinge-reach', 0, 'Step, then hinge on the front leg and reach both hands toward the floor ahead.'],
];
const BREATH: readonly [string, string, number, string, string, Partial<Variant>?][] = [
  ['Supine Belly Breathing', 'supine-belly', 0, 'Lie face-up, knees bent, a hand on the belly.', 'Breathe in through the nose so the belly rises toward the ceiling; breathe out slowly so it sinks.'],
  ['Side-Lying Breathing', 'side-lying', 0, 'Lie on your side, knees bent, head on an arm.', 'Breathe into the side that faces the ceiling; long, slow exhales.'],
  ["Child's Pose Breathing", 'child', 0, 'Sit back into child\'s pose on a mat.', 'Breathe into the back of the ribs so they push toward the ceiling; long exhales.', { equipment: ['mat'] }],
  ['Seated Long-Exhale Breathing', 'seated-exhale', 0, 'Sit tall on a chair or bench.', 'In through the nose for four, out through the mouth for eight, smooth and quiet.', { equipment: ['bench'] }],
  ['Humming Exhale', 'humming', 0, 'Sit or lie comfortably.', 'Breathe in through the nose, then hum on a long, steady exhale until the breath is out.'],
  ['Straw Breathing', 'straw', 0, 'Sit tall; purse the lips as if through a straw.', 'Breathe in through the nose, then out through the pursed lips, slow and steady.'],
  ['Double-Inhale Sigh', 'sigh', 0, 'Sit or stand comfortably.', 'Two breaths in through the nose, one on top of the other, then one long sigh out.'],
  ['Walking Nasal Breathing', 'walk-nasal', 0, 'Walk at an easy pace.', 'Breathe in and out through the nose only, matching the breath to your steps.', { pattern: 'locomotion' }],
  ['Prone Breathing', 'prone', 0, 'Lie face-down, forehead on the hands.', 'Breathe in so the belly pushes into the floor; long, slow exhales.', { equipment: ['mat'] }],
  ['Supine Breathing with Feet on a Wall', 'feet-wall', 0, 'Lie face-up, feet flat on a wall, knees and hips bent to right angles.', 'Press the heels lightly into the wall and breathe out long and slow.', { equipment: ['wall', 'mat'] }],
];

const MOB = { category: 'mobility' as const, braceMode: 'none' as const, batch: BATCH, youthOk: true };

export const LATER_MOBILITY: Family[] = [
  {
    ...MOB, family: 'mobility-flow', block: 'mobility-flows', pattern: 'mobility', plane: 'multi', laterality: 'alternating', skillLayer: 'joints',
    primary: ['hip-flexors', 'hamstrings', 'adductors'], secondary: ['glutes', 'lats', 'calves'], goals: ['mobility', 'warmup', 'hip'], sport: ['general', 'basketball', 'soccer', 'volleyball'],
    lowLoad: ['knee', 'back', 'shoulder'], equipment: [], clip: 'stretch',
    setup: 'Clear floor space; start in the first position named.',
    cues: ['Move slowly from one position into the next.', 'Breathe out as you sink into each position; move on the breath in.', 'Go only as far as the position stays smooth.'],
    faults: [
      { fault: 'Rushing through the positions', fix: 'Slow down: one full breath out in every position before you move on.' },
      { fault: 'Forcing the end of the range', fix: 'Stop where the position stays smooth; the range grows over the weeks.' },
    ],
    dosage: reps(2, '5 slow rounds each side', 20), variants: flowVariants(),
  },
  {
    ...MOB, family: 'joint-circles', block: 'mobility-flows', pattern: 'mobility', plane: 'multi', laterality: 'unilateral', skillLayer: 'joints',
    primary: ['hip-flexors', 'rotator-cuff'], secondary: ['glutes', 'delts'], goals: ['mobility', 'warmup'], sport: ['general', 'basketball'],
    lowLoad: ['knee', 'back'], equipment: [], clip: 'stretch',
    setup: 'Stand tall, or take the position named, everything else still.',
    cues: ['Draw the biggest slow circle you can, smooth all the way round.', 'Everything that is not circling stays still.', 'Go both ways.'],
    faults: [
      { fault: 'The whole body swinging with the circle', fix: 'Slow it down until only the one joint draws the circle.' },
    ],
    dosage: reps(2, '3 each way', 20), variants: CIRCLES.map(([name, k, l, cue, over]) => va(name, k, l, { cue, ...(over ?? {}) })),
  },
  {
    ...MOB, family: 'stretch-matrix', block: 'mobility-stretches', pattern: 'mobility', plane: 'sagittal', laterality: 'unilateral', skillLayer: 'joints',
    primary: ['hamstrings', 'hip-flexors', 'calves'], secondary: ['adductors', 'glutes'], goals: ['mobility', 'cooldown'], sport: ['general', 'basketball'],
    lowLoad: ['knee', 'back'], equipment: [], clip: 'stretch',
    setup: 'Take the position named.',
    cues: ['Ease into the stretch and hold still, breathing out slowly.', 'Stop at a stretch, never at a sharp pinch.', 'Each long breath out, sink a little further.'],
    faults: [
      { fault: 'Bouncing at the end of the range', fix: 'Ease in and hold still; let each breath out take you a little further.' },
      { fault: 'Holding the breath', fix: 'Breathe out slowly through the mouth the whole hold.' },
    ],
    dosage: secs(2, 30, 15), variants: STRETCHES.map(([name, k, l, setup, cue, over]) => va(name, k, l, { setup, cue, ...(over ?? {}) })),
  },
  {
    ...MOB, family: 'dynamic-warmup-2', block: 'mobility-flows', pattern: 'locomotion', plane: 'multi', laterality: 'alternating', skillLayer: 'wake-up', braceMode: 'reflex',
    primary: ['hip-flexors', 'glutes', 'hamstrings'], secondary: ['adductors', 'quads', 'calves'], goals: ['warmup', 'mobility'], sport: ['general', 'basketball', 'soccer', 'football', 'volleyball'],
    lowLoad: ['back'], equipment: [], clip: 'lunge',
    setup: 'Open floor, about 15 metres.',
    cues: ['Smooth and steady down the floor, a little bigger each rep.', 'Tall between reps, like a string pulling up to the ceiling.', 'Go only as deep as stays smooth.'],
    faults: [
      { fault: 'Rushing the reps', fix: 'Slow and smooth: each rep a little bigger than the one before.' },
    ],
    dosage: reps(2, '5 each side', 20), variants: DYNAMIC.map(([name, k, l, cue]) => va(name, k, l, { cue })),
  },
  {
    family: 'breathing-2', block: 'recovery-breathing', batch: BATCH, category: 'recovery', pattern: 'breath', plane: 'sagittal', laterality: 'bilateral', skillLayer: 'reset', braceMode: 'none',
    primary: ['diaphragm'], secondary: ['deep-core'], goals: ['cooldown'], sport: ['general', 'basketball'],
    lowLoad: ['knee', 'back', 'shoulder', 'wrist', 'ankle', 'hip', 'elbow'], youthOk: true, equipment: [], clip: 'breathe',
    setup: 'Take the position named and let the floor hold you.',
    cues: ['Breathe in through the nose, slow and quiet.', 'Make each breath out longer than the breath in.', 'Let the floor take your weight.'],
    faults: [
      { fault: 'Breathing fast and high in the chest', fix: 'Slow it down: in through the nose, then a longer breath out.' },
    ],
    dosage: secs(1, 120, 0), variants: BREATH.map(([name, k, l, setup, cue, over]) => va(name, k, l, { setup, cue, ...(over ?? {}) })),
  },
];
