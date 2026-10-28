// Batch 3, prehab and conditioning (owner priority 2026-10-25). Prehab: general capacity work for the shoulder (band
// rotation by direction × position, scap work by position), the knee (isometrics by depth, step-downs by direction),
// the ankle and foot (calf raises by knee × stance × range, tibialis), the hip (Copenhagen ladder, abduction and
// adduction by position) and the wrist and neck. Every prehab entry carries "General prehab, not treatment." and
// names no condition and promises no outcome. Conditioning: intervals by machine or court × work-rest format.
import { meters, reps, secs, type Family, type Variant } from './types';
import { key, va } from './gen';

const BATCH = 3 as const;
const SLOW = 'Return slow on a three-count.';
const PRE = { category: 'prehab' as const, braceMode: 'none' as const, batch: BATCH, youthOk: true };

// ── shoulder ──────────────────────────────────────────────────────────────────────────────────────────────────────

function rotationVariants(): Variant[] {
  const out: Variant[] = [];
  const dirs: [string, string, string][] = [['External', 'er', 'Rotate the band out toward the wall beside you'], ['Internal', 'ir', 'Rotate the band in across toward your belt buckle']];
  const positions: [string, string, number, string, Variant['equipment']][] = [
    ['Elbow at the Side', 'side', 0, 'Stand side-on to the band anchor, elbow bent at a right angle against a rolled towel at your side.', ['band', 'towel']],
    ['at 90, Standing', '90-standing', 1, 'Face the anchor, upper arm out level with the shoulder, elbow bent at a right angle.', ['band']],
    ['at 90, Half-Kneeling', '90-kneeling', 1, 'Half-kneel facing the anchor, upper arm out level with the shoulder, elbow at a right angle.', ['band', 'mat']],
    ['in a Split Stance', 'split', 1, 'Split stance side-on to the anchor, elbow at a right angle against a rolled towel.', ['band', 'towel']],
  ];
  for (const [d, dk, cue] of dirs) for (const [p, pk, l, setup, equipment] of positions) {
    const name = `Band ${d} Rotation, ${p}`;
    out.push(va(name, key(dk, pk), l, { setup, equipment, cue: `${cue} on a slow, smooth path.`, ladder: dk }));
  }
  // the cable versions, as variants of the band ones
  for (const [d, dk, cue] of dirs) for (const [p, pk, l, setup] of positions.slice(0, 2)) {
    out.push(va(`Cable ${d} Rotation, ${p}`, key('cable', dk, pk), l + 1, { base: key(dk, pk), setup: setup.replace('band anchor', 'cable').replace('the anchor', 'the cable'), equipment: ['cable', 'towel'], cue: `${cue.replace('the band', 'the handle')} on a slow, smooth path.`, ladder: dk }));
  }
  return out;
}
const SCAP: readonly [string, string, number, string, string, Variant['equipment']][] = [
  ['Incline Bench Y Raise', 'incline-y', 0, 'Lie chest-down on an incline bench, light weights hanging.', 'Raise your hands toward the wall in a Y, thumbs to the ceiling, then lower slowly.', ['bench', 'dumbbell']],
  ['Incline Bench T Raise', 'incline-t', 0, 'Lie chest-down on an incline bench, light weights hanging.', 'Raise the hands out toward the side walls in a T, then lower slow.', ['bench', 'dumbbell']],
  ['Incline Bench W Raise', 'incline-w', 0, 'Lie chest-down on an incline bench, elbows bent, light weights.', 'Draw the elbows back toward the wall behind in a W, then lower slow.', ['bench', 'dumbbell']],
  ['Stability Ball Y-T-W', 'ball-ytw', 1, 'Lie chest-down over a stability ball, feet on the floor.', 'Reach a Y toward the wall ahead, a T to the sides, a W back: slow and smooth.', ['stability-ball']],
  ['Wall Scap Push-Up', 'wall-scap', 0, 'Hands on a wall at shoulder height, arms long.', 'Let your chest sink toward the wall, then push the wall away, arms long the whole time.', ['wall']],
  ['Incline Scap Push-Up', 'incline-scap', 0, 'Hands on a bench, arms long, body in one line.', 'Let the chest sink toward the bench, then push the bench away, arms long.', ['bench']],
  ['Plank Scap Push-Up', 'plank-scap', 1, 'Forearm plank on the floor.', 'Let your chest sink toward the floor, then push the floor away, body in one long line.', ['mat']],
  ['Serratus Wall Slide with Band', 'serratus-slide', 1, 'Forearms on the wall, a mini band around the wrists.', 'Slide the forearms up the wall, pressing out into the band, then back down.', ['wall', 'mini-band']],
  ['Back-to-Wall Arm Raise', 'wall-raise', 0, 'Stand with the back of the head, upper back and seat touching a wall.', 'Raise the arms up the wall overhead and back, keeping contact with the wall.', ['wall']],
  ['Palms-Up Band Pull-Apart', 'pull-apart-up', 0, 'Hold a band at shoulder height, palms up, arms long.', 'Pull the band apart toward the side walls, then return slow.', ['band']],
  ['Diagonal Band Pull-Apart', 'pull-apart-diag', 1, 'Hold a band at shoulder height, arms long.', 'Pull the band apart on a diagonal, one hand toward the ceiling, one toward the floor.', ['band']],
  ['Bottoms-Up Kettlebell March', 'bu-march', 1, 'Hold a light kettlebell bottoms-up at the shoulder.', 'March slowly on the spot while the bell stays still and upright.', ['kettlebell']],
  ['Half-Kneeling Bottoms-Up Kettlebell Hold', 'bu-kneel', 1, 'Half-kneel, a light kettlebell bottoms-up at the shoulder.', 'Hold the bell still and upright, breathing smoothly, for the count.', ['kettlebell', 'mat']],
];

// ── knee ──────────────────────────────────────────────────────────────────────────────────────────────────────────

function kneeVariants(): Variant[] {
  const out: Variant[] = [];
  const isos: [string, string, string, Variant['equipment']][] = [
    ['Wall Sit', 'wall-sit', 'Slide down the wall to the depth named and hold still, the floor pushed away.', ['wall']],
    ['Split Squat Hold', 'split', 'Sink to the depth named and hold still, the front foot pressing the floor.', []],
    ['Banded Spanish Squat Hold', 'spanish', 'Sit back into the band to the depth named and hold still, shins upright.', ['band']],
  ];
  const depths: [string, string, number][] = [['Quarter Depth', 'quarter', 0], ['Half Depth', 'half', 1], ['Thighs Level', 'deep', 1]];
  for (const [n, k, cue, equipment] of isos) for (const [d, dk, l] of depths) {
    out.push(va(`${n}, ${d}`, key(k, dk), l, { cue, equipment, dosage: secs(4, 30, 45), ladder: k }));
  }
  const steps: [string, string, number, string][] = [
    ['Retro Step-Down', 'retro', 1, 'Stand on the low step, slowly lower the back foot toward the floor, and stand up.'],
    ['Lateral Step-Down, Tap and Hold', 'lat-hold', 1, 'Lower the free foot beside the step, tap the floor, and hold for a two-count.'],
    ['Forward Step-Down from a High Step', 'fwd-high', 2, 'Lower the free heel toward the floor ahead of the high step, slow, and stand up.'],
    ['Slant Board Single-Leg Squat', 'slant-sl', 2, 'On the slant board, sink on one leg toward the floor, slow, and stand up.'],
    ['Slant Board Squat Hold', 'slant-hold', 0, 'On the slant board, sink to half depth and hold still.'],
    ['Backward Walk', 'back-walk', 0, 'Walk backward with long steps, the floor pushed away under the front of the foot.'],
    ['Standing Single-Leg Terminal Knee Extension', 'tke-sl', 1, 'Band behind the knee. Stand on that leg and push the band back until the leg is straight.'],
    ['Seated Band Knee Extension Hold', 'seated-ext', 0, 'Sit on a bench, band from ankle to bench leg, and hold the leg straight out.'],
    ['Heel-Elevated Goblet Squat Hold', 'heel-goblet-hold', 1, 'Heels on a plate, a light weight at your chest. Sit to half depth and hold still.'],
    ['Sissy Squat, Supported', 'sissy', 2, 'Hold a post, rise onto your toes and lean back as your knees travel forward, slowly.'],
  ];
  for (const [n, k, l, cue] of steps) {
    const equipment: Variant['equipment'] = k.startsWith('slant') ? ['plate'] : k === 'back-walk' ? [] : k === 'tke-sl' || k === 'seated-ext' ? ['band'] : k === 'heel-goblet-hold' ? ['kettlebell', 'plate'] : k === 'sissy' ? ['wall'] : ['step'];
    out.push(va(n, k, l, { cue, equipment, ...(k === 'back-walk' ? { dosage: meters(3, 20, 30) } : {}) }));
  }
  return out;
}

// ── ankle, foot, hip, wrist, neck ─────────────────────────────────────────────────────────────────────────────────

function calfVariants(): Variant[] {
  const out: Variant[] = [];
  const knees: [string, string, number][] = [['Straight-Knee', 'straight', 0], ['Bent-Knee', 'bent', 0]];
  const stances: [string, string, number][] = [['Double-Leg', 'double', 0], ['Single-Leg', 'single', 1]];
  const ranges: [string, string, number, string, Variant['equipment']][] = [
    ['off a Step', 'step', 1, 'Sink below the edge of the step, slow, then rise as high as you can.', ['step']],
    ['Isometric Hold', 'iso', 0, 'Rise to halfway and hold still, the floor pressed away.', ['wall']],
    ['with a 3-Second Lower', 'slow', 1, 'Rise up, then lower to the floor on a slow three-count.', []],
  ];
  for (const [kn, kk, kl] of knees) for (const [st, sk, sl] of stances) for (const [r, rk, rl, cue, equipment] of ranges) {
    const name = rk === 'iso' ? `${kn} ${st} Calf Raise ${r}` : `${kn} ${st} Calf Raise ${r}`;
    out.push(va(name, key(kk, sk, rk), kl + sl + rl, { cue, equipment, laterality: sk === 'single' ? 'unilateral' : 'bilateral', ladder: key(kk, rk), ...(rk === 'iso' ? { dosage: secs(4, 30, 45) } : {}), ...(sk === 'single' ? { goals: ['balance'] } : {}) }));
  }
  return out;
}
const FOOT: readonly [string, string, number, string, Variant['equipment'], Partial<Variant>?][] = [
  ['Seated Tibialis Raise', 'tib-seated', 0, 'Sit on a bench, heels on the floor, and lift the toes toward the ceiling, slow.', ['bench']],
  ['Kneeling Tibialis Stretch-and-Lift', 'tib-kneel', 1, 'Kneel with your laces on the floor, then slowly lift your knees a little off the floor.', ['mat']],
  ['Toe Spread Hold', 'toe-spread', 0, 'Spread the toes wide on the floor and hold, the arch lifting.', []],
  ['Ankle Alphabet', 'alphabet', 0, 'Seated, trace each letter of the alphabet in the air, slow and smooth, the shin still.', ['bench']],
  ['Heel Raise with a Ball Between the Heels', 'heel-ball', 1, 'Squeeze a small ball between the heels and rise up tall, slow, keeping the ball.', ['medicine-ball']],
  ['Single-Leg Balance, Ball Pass Around the Waist', 'balance-pass', 1, 'Stand on one leg and pass the ball around your belt line, foot quiet on the floor.', ['basketball'], { goals: ['balance'] }],
  ['Single-Leg Balance, Reach and Touch', 'balance-reach', 1, 'Stand on one leg and reach down to touch a cone in front, then stand tall.', ['cone'], { goals: ['balance'] }],
  ['Single-Leg Balance, Band Pull', 'balance-band', 2, 'Stand on one leg while a partner pulls a band at your hips from the side. Stay still.', ['band'], { goals: ['balance'] }],
  ['Single-Leg Balance on a Folded Mat, Head Turns', 'balance-mat-turns', 2, 'On a folded mat, turn the eyes slowly from wall to wall, the foot quiet.', ['mat'], { goals: ['balance'] }],
  ['Single-Leg Hinge Reach to a Cone', 'hinge-cone', 1, 'Stand on one leg, push your hips back, touch the cone ahead, then stand tall.', ['cone'], { goals: ['balance'] }],
  ['Calf Raise, Toes Turned In', 'calf-in', 0, 'Toes turned in a little, rise straight up over the big toe and lower slow.', ['wall']],
  ['Calf Raise, Toes Turned Out', 'calf-out', 0, 'Toes turned out a little, rise straight up over the big toe and lower slow.', ['wall']],
  ['Short-Foot Single-Leg Balance', 'short-foot-sl', 1, 'Lift the arch without curling your toes, then stand on that leg and hold still.', [], { goals: ['balance'] }],
  ['Band Toe Splay', 'toe-splay', 0, 'A small band around the toes: spread them wide against it on the floor, hold, release.', ['mini-band']],
];
const HIP: readonly [string, string, number, string, Variant['equipment'], Partial<Variant>?][] = [
  ['Copenhagen Hold, Knee on Bench', 'cph-knee', 0, 'Side plank with the top knee on a bench and hold still, the bottom leg tucked.', ['bench']],
  ['Copenhagen Hold, Foot on Bench', 'cph-foot', 1, 'Side plank with the top foot on a bench and hold still, the bottom leg tucked.', ['bench']],
  ['Copenhagen Raise, Knee on Bench', 'cph-raise-knee', 1, 'Top knee on the bench: lift the hips off the floor and lower slow.', ['bench']],
  ['Copenhagen Raise, Foot on Bench', 'cph-raise-foot', 2, 'Top foot on the bench: lift the hips off the floor and lower slow.', ['bench']],
  ['Copenhagen Hold with Bottom-Leg Lift', 'cph-lift', 2, 'Hold the side plank and lift the bottom leg up to the bench, slow.', ['bench']],
  ['Fire Hydrant', 'hydrant', 0, 'On hands and knees, slowly lift one knee out to the side toward the wall, and lower.', ['mat']],
  ['Banded Fire Hydrant', 'hydrant-band', 1, 'Mini band above the knees: lift one knee out toward the wall against it, slow.', ['mat', 'mini-band']],
  ['Quadruped Hip Extension', 'quad-ext', 0, 'On hands and knees, push one heel up toward the ceiling, slow, the back long.', ['mat']],
  ['Side Plank Clamshell', 'sp-clam', 2, 'Short side plank on the knees, then open the top knee toward the ceiling, slow.', ['mat']],
  ['Banded Bridge with Knee Push', 'bridge-push', 0, 'Mini band above the knees: bridge up and push your knees out against it at the top.', ['mat', 'mini-band']],
  ['Standing Band Hip Abduction', 'abd-standing', 0, 'Band around the ankles, hold a wall and push one foot out to the side, slow.', ['mini-band', 'wall']],
  ['Standing Band Hip Adduction', 'add-standing', 1, 'Band from the ankle to a post, pull the foot in across the floor, slow.', ['band']],
  ['Standing Band Hip Flexion March', 'flex-march', 0, 'Band around the feet, lift one knee up toward the ceiling against it, slow.', ['mini-band']],
  ['Hip Airplane, Supported', 'airplane-sup', 1, 'On one leg, holding a wall, hips back, slowly turn your belt line open and closed.', ['wall'], { goals: ['balance'] }],
  ['Side-Lying Hip Abduction Hold', 'abd-hold', 0, 'Lie on your side and hold the top leg up toward the ceiling, still, for the count.', ['mat']],
  ['Lateral Band Walk, Low Squat', 'band-walk-low', 1, 'Mini band at the ankles: sit low and step sideways along the floor, low and level.', ['mini-band']],
  ['Backward Band Monster Walk', 'monster-back', 1, 'Mini band at the ankles: walk backward on the diagonal, the band staying tight.', ['mini-band']],
  ['Hip Airplane to Cone Touch', 'airplane-cone', 2, 'On one leg, hips back, turn your belt line open and closed, then touch the cone.', ['cone'], { goals: ['balance'] }],
];
const SMALL: readonly [string, string, number, string, Variant['equipment'], Partial<Variant>?][] = [
  ['Dumbbell Wrist Flexion', 'wrist-flex', 0, 'Forearm on a bench, palm up, curl the light weight up and lower it slow.', ['dumbbell', 'bench'], { goals: ['grip'] }],
  ['Dumbbell Wrist Extension', 'wrist-ext', 0, 'Forearm on a bench, palm down, lift the light weight up and lower it slow.', ['dumbbell', 'bench'], { goals: ['grip'] }],
  ['Dumbbell Radial Deviation', 'radial', 0, 'Hold the end of a light dumbbell, thumb up, and tip it up toward the ceiling, slowly.', ['dumbbell'], { goals: ['grip'] }],
  ['Dumbbell Ulnar Deviation', 'ulnar', 0, 'Hold a light dumbbell by the end, arm at your side, and tip it back behind you, slowly.', ['dumbbell'], { goals: ['grip'] }],
  ['Band Finger Extension', 'finger-ext', 0, 'Loop a small band around the fingertips and open the hand wide against it.', ['mini-band'], { goals: ['grip'] }],
  ['Wall Wrist Push-Up', 'wrist-pushup', 1, 'Hands on a wall, push the wall away with the fingers only, slow.', ['wall']],
  ['Neck Hold, Four Directions', 'neck-4', 0, 'Press gently into your hand to the front, sides and back, eyes level on the wall; hold still.', [], { goals: ['posture'] }],
  ['Prone Head Lift', 'neck-prone', 0, 'Lie face-down, forehead on a towel, and slowly lift your head a little toward the wall.', ['towel', 'mat'], { goals: ['posture'] }],
  ['Band Neck Turn Hold', 'neck-band', 1, 'Band around the head, tied to a post at the side. Eyes level on the wall ahead.', ['band'], { goals: ['posture'] }],
];

// ── conditioning: modality × format ───────────────────────────────────────────────────────────────────────────────

const FORMATS: readonly [string, string, number, number, number, number, string][] = [
  // label, key, level, sets, work s, rest s, cue
  ['10/20 Intervals', '10-20', 1, 10, 10, 20, 'Ten seconds hard, twenty easy: every hard rep the same speed.'],
  ['15/15 Intervals', '15-15', 1, 10, 15, 15, 'Fifteen seconds hard, fifteen easy: hold the same pace on every rep.'],
  ['20/40 Intervals', '20-40', 0, 8, 20, 40, 'Twenty seconds hard, forty easy: hard means fast but smooth.'],
  ['30/30 Intervals', '30-30', 1, 8, 30, 30, 'Thirty on, thirty off: pick a pace you can repeat on the last one.'],
  ['20/10 Intervals', '20-10', 2, 8, 20, 10, 'Twenty hard, ten easy, eight times: the last two should still be clean.'],
  ['60/60 Repeats', '60-60', 1, 6, 60, 60, 'One minute strong, one minute easy: steady breathing on the easy minute.'],
  ['3-Minute Repeats', '3-min', 1, 4, 180, 90, 'Three minutes at a pace you could talk in short phrases.'],
  ['Pyramid Intervals', 'pyramid', 2, 1, 600, 0, 'Fifteen, thirty, forty-five, sixty seconds on with the same off, then back down.'],
  ['4-Minute Tempo Repeats', '4-min', 1, 4, 240, 120, 'Four minutes at a steady, strong pace you could hold for twenty, then two easy.'],
];
const MODES: readonly [string, string, string, Variant['equipment'], string[], string][] = [
  // label, key, base id, equipment, formats, setup
  ['Bike', 'bike', 'bike-sprint-intervals', ['bike'], ['10-20', '15-15', '20-40', '30-30', '20-10', '60-60', '3-min', 'pyramid', '4-min'], 'Set the seat so the knee stays a little bent at the bottom of the pedal.'],
  ['Rower', 'rower', 'rower-intervals', ['rower'], ['10-20', '15-15', '20-40', '30-30', '20-10', '60-60', '3-min', 'pyramid', '4-min'], 'Feet strapped in, handle at the finish, the chain level.'],
  ['Treadmill', 'treadmill', '', ['treadmill'], ['15-15', '20-40', '30-30', '60-60', '3-min', '4-min'], 'Straddle the belt to start and stop; hop on once it is up to speed.'],
  ['Court Sprint', 'court', 'court-shuttle-run', [], ['10-20', '15-15', '20-40', '30-30', '60-60'], 'Sprint baseline to baseline on a court or between two lines 25 metres apart.'],
  ['Jump Rope', 'rope', 'basic-rope-jump', ['jump-rope'], ['15-15', '30-30', '60-60', '20-10'], 'Rope behind the heels, handles at the hips.'],
  ['Sled Push', 'sled', 'light-sled-push', ['sled'], ['20-40', '30-30', '60-60'], 'Load the sled light enough to keep moving at a run.'],
  ['Defensive Slide', 'slide', '', ['cone'], ['15-15', '20-40', '30-30'], 'Two cones 4 metres apart; slide between them in a low stance.'],
  ['Stair Climb', 'stairs', '', ['step'], ['30-30', '60-60'], 'A flight of stairs or a long step; walk or run back down easy.'],
];
function conditioningVariants(): Variant[] {
  const out: Variant[] = [];
  for (const [label, mk, baseId, equipment, fmts, setup] of MODES) {
    let first: string | null = null;
    for (const fk of fmts) {
      const [fl, , l, sets, work, rest, cue] = FORMATS.find((f) => f[1] === fk)!;
      const v = key(mk, fk);
      const base: string | undefined = baseId ? `id:${baseId}` : first ?? undefined;
      out.push(va(`${label} ${fl}`, v, l, { setup, cue, equipment, dosage: fk === 'pyramid' ? secs(1, work, rest) : secs(sets, work, rest), ...(base && base !== v ? { base } : {}), ladder: mk }));
      if (!first && !baseId) first = v;
    }
  }
  return out;
}
const COURT: readonly [string, string, number, string, Variant['equipment']][] = [
  ['Full-Court Layup Intervals', 'layup-int', 1, 'Dribble full court, finish, rebound, and go back: thirty seconds on, thirty off.', ['basketball', 'hoop']],
  ['Full-Court Dribble Sprint Intervals', 'dribble-int', 1, 'Speed dribble baseline to baseline and back, the ball out ahead: fifteen on, fifteen off.', ['basketball']],
  ['Shell Slide Intervals', 'shell-int', 1, 'Slide, closeout and recover around the cones for twenty seconds, forty easy.', ['cone']],
  ['Transition Sprint Intervals', 'transition-int', 1, 'Sprint to the far free-throw line, backpedal to half court, sprint home.', []],
  ['Down-and-Back Sprints', 'down-back', 0, 'Sprint to the far baseline and back, touching each line on the floor.', []],
  ['Sideline-to-Sideline Sprints', 'sideline', 1, 'Sprint across the court and back, touching each sideline on the floor, for the count.', []],
  ['Three-Line Touch Sprint', 'three-line', 1, 'Touch the near free-throw line, half court and far free-throw line, back each time.', []],
  ['Burpee Intervals', 'burpee-int', 1, 'Twenty seconds of smooth burpees, forty easy: every rep lands quiet on the floor.', []],
  ['Bear Crawl Intervals', 'crawl-int', 1, 'Bear crawl along the floor for twenty seconds, forty easy, the knees low.', []],
  ['Shuffle-Sprint Box Intervals', 'shuffle-box-int', 1, 'Shuffle, sprint, backpedal, shuffle around four cones for 20 seconds, 40 easy.', ['cone']],
  ['Shuttle Run Pyramid', 'shuttle-pyramid', 2, 'Shuttle to the 5, 10, 15 and 20 metre lines and back, then down again.', ['cone']],
];

const ISO_HOLDS: readonly [string, string, number, string, Variant['equipment'], Partial<Variant>?][] = [
  ['Hamstring Heel-Dig Hold, Knee Bent', 'ham-dig-bent', 0, 'Lie face-up, heel on a box with the knee bent; dig the heel down into the box and hold, the hips up.', ['box', 'mat'], { goals: ['knee'], primary: ['hamstrings'] }],
  ['Hamstring Heel-Dig Hold, Knee Long', 'ham-dig-long', 1, 'Lie face-up, heel on a box with the knee nearly straight; dig the heel down into the box and hold.', ['box', 'mat'], { goals: ['knee'], primary: ['hamstrings'] }],
  ['Single-Leg Heel-Dig Bridge Hold', 'ham-dig-sl', 2, 'One heel on the box, the other leg lifted: dig the heel into the box and hold the hips up.', ['box', 'mat'], { goals: ['knee'], primary: ['hamstrings'] }],
  ['Adductor Ball Squeeze, Knees Bent', 'squeeze-bent', 0, 'Lie face-up, knees bent, a ball between the knees; squeeze the ball and hold.', ['medicine-ball', 'mat'], { goals: ['hip'], primary: ['adductors'] }],
  ['Adductor Ball Squeeze, Legs Long', 'squeeze-long', 1, 'Lie face-up, legs long, a ball between the ankles; squeeze the ball and hold.', ['medicine-ball', 'mat'], { goals: ['hip'], primary: ['adductors'] }],
  ['Adductor Ball Squeeze, Bridge', 'squeeze-bridge', 1, 'Bridge up with a ball between the knees; squeeze the ball and hold the hips up.', ['medicine-ball', 'mat'], { goals: ['hip'], primary: ['adductors'] }],
  ['Doorway External Rotation Hold', 'door-er', 0, 'Stand in a doorway, elbow bent at your side, back of the hand on the frame. Push into it and hold.', [], { goals: ['shoulder'], primary: ['rotator-cuff'] }],
  ['Doorway Internal Rotation Hold', 'door-ir', 0, 'Stand in a doorway, elbow bent at your side, the palm against the frame; push into the frame and hold.', [], { goals: ['shoulder'], primary: ['rotator-cuff'] }],
  ['Prone External Rotation at 90 on a Bench', 'prone-er', 1, 'Lie face-down on a bench, upper arm out level with the shoulder; rotate the light weight up toward the ceiling, slow.', ['bench', 'dumbbell'], { goals: ['shoulder'], primary: ['rotator-cuff'] }],
  ['Side-Lying Internal Rotation', 'side-ir', 0, 'Lie on your side, elbow bent on the floor; rotate the light weight up toward the ceiling, slow.', ['dumbbell', 'mat'], { goals: ['shoulder'], primary: ['rotator-cuff'] }],
  ['Band Ankle Turn-Out Hold', 'ankle-out-hold', 0, 'Seated, band around the forefoot from the side; hold the foot turned out against it.', ['band', 'mat'], { goals: ['ankle'], primary: ['calves'] }],
  ['Band Ankle Turn-In Hold', 'ankle-in-hold', 0, 'Seated, band around the forefoot from the side; hold the foot turned in against it.', ['band', 'mat'], { goals: ['ankle'], primary: ['tibialis'] }],
  ['Wall Tibialis Hold', 'tib-hold', 0, 'Lean back against a wall, heels out a step; lift the toes toward the ceiling and hold.', ['wall'], { goals: ['ankle'], primary: ['tibialis'] }],
  ['Isometric Glute Bridge, Single Leg', 'bridge-sl-hold', 1, 'Bridge up on one leg and hold still, the belt line level.', ['mat'], { goals: ['hip'], primary: ['glutes'] }],
  ['Side Plank Hip Hold, Top Leg Up', 'side-top-hold', 1, 'Short side plank on the knees with the top leg lifted toward the ceiling; hold still.', ['mat'], { goals: ['hip'], primary: ['glute-med'] }],
  ['Isometric Split Squat, Back Knee Hover', 'split-hover', 1, 'Sink until the back knee hovers an inch off the floor and hold still.', [], { goals: ['knee'], primary: ['quads'] }],
  ['Isometric Calf Raise on a Step, Single Leg', 'calf-step-hold', 1, 'On one leg on a step, rise to halfway and hold still, a rail for balance.', ['step'], { goals: ['ankle'], primary: ['calves'] }],
  ['Wrist Plank Rock', 'wrist-rock', 0, 'High plank on the floor: rock forward over the hands and back, slow.', ['mat'], { goals: ['grip'], primary: ['forearms'] }],
  ['Wall Press External Rotation Hold, Arm Raised', 'wall-er-raised', 1, 'Stand side-on to a wall, upper arm level with the shoulder, the back of the hand on the wall; press and hold.', ['wall'], { goals: ['shoulder'], primary: ['rotator-cuff'] }],
  ['Isometric Calf Hold, Bent Knee', 'calf-bent-hold', 0, 'Sit on a bench, a weight on the knees; rise onto the toes and hold still.', ['bench', 'dumbbell'], { goals: ['ankle'], primary: ['soleus'] }],
  ['Wall Sit, Single-Leg Lift', 'wall-sit-lift', 2, 'In a wall sit, lift one foot an inch off the floor and hold still.', ['wall'], { goals: ['knee'], primary: ['quads'] }],
  ['Split Squat Hold, Front Knee Forward', 'split-knee-fwd', 1, 'Sink into the split squat with the front knee travelling past the toes on the floor, and hold still.', [], { goals: ['knee'], primary: ['quads'] }],
  ['Side-Lying Adductor Hold', 'add-side-hold', 0, 'Lie on your side, lift the bottom leg toward the ceiling and hold it still.', ['mat'], { goals: ['hip'], primary: ['adductors'] }],
  ['Prone Y Hold', 'prone-y-hold', 0, 'Lie face-down and hold both thumbs up off the floor in a Y toward the wall ahead.', ['mat'], { goals: ['shoulder', 'posture'], primary: ['mid-back'] }],
  ['Band Scap Retraction Hold', 'scap-hold', 0, 'Hold a band at chest height, arms long; pull it apart a little and hold still.', ['band'], { goals: ['shoulder', 'posture'], primary: ['mid-back'] }],
  ['Chin Tuck Hold Against the Floor', 'chin-floor', 0, 'Lie face-up, head on the floor. Nod your chin a little and press the back of your head gently down.', ['mat'], { goals: ['posture'], primary: ['neck'] }],
];
const CARRIES: readonly [string, string, number, string, Variant['equipment']][] = [
  ['Farmer Carry Intervals', 'farmer-int', 1, 'Carry for 30 seconds tall and quick, then set the weights down and rest 30.', ['kettlebell']],
  ['Sandbag Carry Intervals', 'sandbag-int', 1, 'Bear-hug the bag and walk for 30 seconds, then set it down and rest 30.', ['sandbag']],
  ['Sled Push Intervals', 'sled-int', 1, 'Push the sled 20 metres, rest while a partner goes, repeat.', ['sled']],
  ['Sled Drag Intervals', 'sled-drag-int', 0, 'Drag the sled backward 20 metres, rest 40 seconds, repeat.', ['sled']],
  ['Med Ball Slam Intervals', 'slam-int', 1, 'Twenty seconds of hard slams into the floor, forty easy.', ['slam-ball']],
];

export const LATER_PREHAB: Family[] = [
  {
    ...PRE, family: 'shoulder-rotation', block: 'prehab-shoulder-2', pattern: 'pull', plane: 'transverse', laterality: 'unilateral', skillLayer: 'joints',
    primary: ['rotator-cuff'], secondary: ['rear-delts', 'mid-back'], goals: ['shoulder'], sport: ['general', 'basketball', 'volleyball', 'tennis'],
    lowLoad: ['knee', 'back', 'ankle', 'hip'], equipment: ['band'], clip: 'pull',
    setup: 'Stand side-on to the band anchor, elbow bent at a right angle.',
    cues: ['Move the band on a slow, smooth path.', 'Keep the elbow on its spot, like it is pinned to the wall.', SLOW],
    faults: [
      { fault: 'The elbow drifting away from its spot', fix: 'Keep the elbow on its spot, like it is pinned to the wall.' },
      { fault: 'Rushing the return', fix: 'Return slow on a three-count.' },
    ],
    dosage: reps(3, '12 each side', 30), variants: rotationVariants(),
  },
  {
    ...PRE, family: 'scap-work', block: 'prehab-shoulder-2', pattern: 'pull', plane: 'multi', laterality: 'bilateral', skillLayer: 'joints',
    primary: ['mid-back', 'serratus'], secondary: ['rear-delts', 'rotator-cuff', 'traps'], goals: ['shoulder', 'posture'], sport: ['general', 'basketball', 'volleyball', 'tennis'],
    lowLoad: ['knee', 'back', 'ankle'], equipment: [], clip: 'pull',
    setup: 'Take the position named with a light load or none.',
    cues: ['Move on a slow, smooth path.', 'Light enough to stay smooth for every rep.', SLOW],
    faults: [
      { fault: 'Shrugging up toward the ears', fix: 'Reach long toward the wall ahead, the ears far from the shoulders.' },
      { fault: 'Too heavy to move smooth', fix: 'Drop the load until every rep stays smooth.' },
    ],
    dosage: reps(3, '10', 30), variants: SCAP.map(([name, k, l, setup, cue, equipment]) => va(name, k, l, { setup, cue, equipment })),
  },
  {
    ...PRE, family: 'knee-capacity', block: 'prehab-knee-2', pattern: 'squat', plane: 'sagittal', laterality: 'bilateral', skillLayer: 'strength',
    primary: ['quads'], secondary: ['glutes', 'calves'], goals: ['knee'], sport: ['general', 'basketball', 'volleyball', 'soccer'],
    lowLoad: ['back', 'shoulder', 'wrist'], equipment: [], clip: 'squat',
    setup: 'Take the position named; a wall or post within reach.',
    cues: ['Push the floor away the whole time.', 'Knees travel out over your laces.', 'Smooth and slow: stop at a comfortable depth.'],
    faults: [
      { fault: 'Knees caving in', fix: 'Push the floor apart: the knees stay out over your laces.' },
      { fault: 'Going deeper than stays smooth', fix: 'Stop at a comfortable depth and own it first.' },
    ],
    dosage: reps(3, '8', 45), variants: kneeVariants(),
  },
  {
    ...PRE, family: 'calf-capacity', block: 'prehab-ankle-2', pattern: 'other', plane: 'sagittal', laterality: 'bilateral', skillLayer: 'tripod',
    primary: ['calves', 'soleus'], secondary: ['foot'], goals: ['ankle'], sport: ['general', 'basketball', 'volleyball', 'track'],
    lowLoad: ['back', 'shoulder', 'wrist'], equipment: [], clip: 'idle',
    setup: 'Stand tall holding a wall for balance.',
    cues: ['Rise straight up over the big toe, as high as you can.', 'Smooth both ways, no bounce at the bottom.', 'Heel, big toe, little toe: press all three into the floor.'],
    faults: [
      { fault: 'Rolling out onto the little toe', fix: 'Rise straight up over the big toe.' },
      { fault: 'Bouncing at the bottom', fix: 'Pause at the bottom, then rise smooth.' },
    ],
    dosage: reps(3, '12', 45), variants: calfVariants(),
  },
  {
    ...PRE, family: 'foot-and-balance', block: 'prehab-ankle-2', pattern: 'other', plane: 'multi', laterality: 'unilateral', skillLayer: 'tripod',
    primary: ['foot', 'tibialis'], secondary: ['calves', 'glute-med'], goals: ['ankle', 'balance'], sport: ['general', 'basketball', 'volleyball', 'soccer'],
    lowLoad: ['back', 'shoulder', 'wrist'], equipment: [], clip: 'idle',
    setup: 'Take the position named, a wall within reach.',
    cues: ['Heel, big toe, little toe: press all three into the floor.', 'Slow and smooth.', 'Stand tall and still, like a post planted in the floor.'],
    faults: [
      { fault: 'The foot rolling onto its edge', fix: 'Press the big-toe joint back down into the floor.' },
    ],
    dosage: reps(3, '10', 30), variants: FOOT.map(([name, k, l, cue, equipment, over]) => va(name, k, l, { cue, equipment, ...(/reach/i.test(name) ? { dosage: reps(3, '5 each side', 30) } : /balance|hold/i.test(name) ? { dosage: secs(3, 30, 15) } : {}), ...(over ?? {}) })),
  },
  {
    ...PRE, family: 'hip-capacity', block: 'prehab-hip-2', pattern: 'other', plane: 'frontal', laterality: 'unilateral', skillLayer: 'strength',
    primary: ['glute-med', 'adductors'], secondary: ['glutes', 'obliques'], goals: ['hip'], sport: ['general', 'basketball', 'soccer', 'football'],
    lowLoad: ['knee', 'back', 'ankle'], equipment: [], clip: 'brace',
    setup: 'Take the position named on a mat or bench.',
    cues: ['Slow and smooth, the belt line level.', 'Hold still at the end for a beat.', SLOW],
    faults: [
      { fault: 'Rolling back to make the lift bigger', fix: 'Stack the belt line level and keep the lift small and clean.' },
    ],
    dosage: reps(3, '10 each side', 30), variants: HIP.map(([name, k, l, cue, equipment, over]) => va(name, k, l, { cue, equipment, ...(/hold/i.test(name) ? { dosage: secs(3, 20, 30) } : {}), ...(over ?? {}) })),
  },
  {
    ...PRE, family: 'wrist-and-neck', block: 'prehab-shoulder-2', pattern: 'other', plane: 'multi', laterality: 'unilateral', skillLayer: 'joints',
    primary: ['forearms'], secondary: ['neck'], goals: ['grip'], sport: ['general', 'basketball', 'volleyball', 'tennis'],
    lowLoad: ['knee', 'back', 'ankle', 'hip'], equipment: [], clip: 'idle',
    setup: 'Take the position named with a light load or none.',
    cues: ['Light and slow, the range smooth.', 'Hold still at the end for a beat.', SLOW],
    faults: [
      { fault: 'Using a load too heavy to move slow', fix: 'Go lighter until every rep stays slow and smooth.' },
    ],
    dosage: reps(2, '15', 30), variants: SMALL.map(([name, k, l, cue, equipment, over]) => va(name, k, l, { cue, equipment, ...(/hold/i.test(name) ? { dosage: reps(2, '10-second hold each way', 30) } : {}), ...(over ?? {}) })),
  },
  {
    family: 'conditioning-intervals', block: 'conditioning-2', batch: BATCH, category: 'conditioning', pattern: 'locomotion', plane: 'sagittal', laterality: 'alternating', skillLayer: null, braceMode: 'reflex',
    primary: ['quads', 'glutes', 'calves'], secondary: ['hamstrings', 'lats'], goals: ['conditioning'], sport: ['general', 'basketball', 'soccer', 'football'],
    lowLoad: ['back'], youthOk: true, equipment: [], clip: 'sprint',
    setup: 'Warm up for five minutes first.',
    cues: ['Hard means fast but smooth: the form holds on every rep.', 'Easy means easy: let the breathing settle.', 'Stop the set when the pace drops a lot.'],
    faults: [
      { fault: 'Starting too fast and fading', fix: 'Pick a pace you can repeat on the last rep.' },
      { fault: 'Form falling apart late in the set', fix: 'Slow the work pace until the form holds to the end.' },
    ],
    dosage: secs(8, 20, 40), variants: conditioningVariants(),
  },
  {
    family: 'court-conditioning', block: 'conditioning-2', batch: BATCH, category: 'conditioning', pattern: 'locomotion', plane: 'multi', laterality: 'alternating', skillLayer: null, braceMode: 'reflex',
    primary: ['quads', 'glutes', 'calves'], secondary: ['adductors', 'hamstrings'], goals: ['conditioning'], sport: ['basketball'],
    lowLoad: ['back'], youthOk: true, equipment: [], clip: 'sprint',
    setup: 'A basketball court or two lines 25 metres apart.',
    cues: ['Touch every line on the floor.', 'Smooth turns: lower before the line, push away from it.', 'Hold the pace on the last rep.'],
    faults: [
      { fault: 'Skipping the line touch', fix: 'Touch every line on the floor; a rep without it does not count.' },
      { fault: 'Standing tall into the turns', fix: 'Lower before the line, then push the floor away from it.' },
    ],
    dosage: reps(6, '1', 60), variants: COURT.map(([name, k, l, cue, equipment]) => va(name, k, l, { cue, equipment })),
  },
  {
    ...PRE, family: 'isometric-capacity', block: 'prehab-hip-2', pattern: 'other', plane: 'multi', laterality: 'bilateral', skillLayer: 'strength',
    primary: ['hamstrings'], secondary: [], goals: ['knee'], sport: ['general', 'basketball', 'soccer', 'volleyball'],
    lowLoad: ['back', 'wrist'], equipment: [], clip: 'brace',
    setup: 'Take the position named.',
    cues: ['Push steadily into the resistance and hold still.', 'Smooth breathing the whole hold.', 'Build the push slowly over the first few seconds.'],
    faults: [
      { fault: 'Holding the breath', fix: 'Breathe out slowly through the mouth the whole hold.' },
      { fault: 'Jerking into the push', fix: 'Build the push slowly over the first few seconds.' },
    ],
    dosage: secs(3, 30, 30), variants: ISO_HOLDS.map(([name, k, l, setup, equipment, over]) => va(name, k, l, { setup, equipment, ...(over ?? {}) })),
  },
  {
    family: 'loaded-conditioning', block: 'conditioning-2', batch: BATCH, category: 'conditioning', pattern: 'carry', plane: 'sagittal', laterality: 'bilateral', skillLayer: null, braceMode: 'set',
    primary: ['forearms', 'quads', 'glutes'], secondary: ['traps', 'deep-core', 'calves'], goals: ['conditioning'], sport: ['general', 'basketball', 'football'],
    lowLoad: ['knee'], youthOk: true, equipment: [], clip: 'carry',
    setup: 'Set up the load and the distance before you start the clock.',
    cues: ['Tall and quick, the load quiet.', 'Set the load down under control at the end.', 'Same pace on every round.'],
    faults: [
      { fault: 'Leaning or twisting under the load', fix: 'Grow tall toward the ceiling; lighten the load if it pulls you over.' },
    ],
    dosage: secs(6, 30, 30), variants: CARRIES.map(([name, k, l, cue, equipment]) => va(name, k, l, { cue, equipment, pattern: k.startsWith('farmer') || k.startsWith('sandbag') ? 'carry' : k === 'slam-int' ? 'other' : 'locomotion' })),
  },
];
