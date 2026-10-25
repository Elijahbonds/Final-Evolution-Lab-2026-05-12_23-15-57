// Batch 2, plyometrics (owner priority 2026-10-25: "plyometric and jump progressions"): the jump-and-land ladder as a
// matrix — take-off and landing (jump, jump to one, hop, bound) × direction (backward, lateral, medial, diagonal,
// rotational) × finish (stick, continuous, into a sprint) — then the vertical, box, hurdle, broad, approach and drop
// progressions, jump combinations, rope footwork and light upper-body plyos. Landing comes first in every ladder: the
// stick is the base, the continuous and the sprint versions are its variants.
import { LANDING_CAUTION, contacts, reps, secs, type Family, type Variant } from './types';
import { key, va } from './gen';

const BATCH = 2 as const;
const QUIET = 'Land quiet: as little sound as you can.';
const STICK = 'Stick it still and silent for a two-count.';
const HOT = 'Touch the floor and leave it fast, like the floor is hot.';
const PLYO = { category: 'plyometric' as const, skillLayer: 'jump-land', braceMode: 'reflex' as const, cautions: [LANDING_CAUTION], batch: BATCH };

// ── the jump-and-land matrix ──────────────────────────────────────────────────────────────────────────────────────

type Kind = 'jump' | 'jump1' | 'one2' | 'hop' | 'bound';
type Dir = 'forward' | 'backward' | 'lateral' | 'medial' | 'diagonal' | 'rot90' | 'rot180';
type Fin = 'stick' | 'cont' | 'sprint';
const DIR: Record<Dir, { label: string; plane: Variant['plane']; cue: string }> = {
  forward: { label: 'Forward', plane: 'sagittal', cue: 'Travel forward to the line on the floor' },
  backward: { label: 'Backward', plane: 'sagittal', cue: 'Travel backward a short way, eyes on the line ahead' },
  lateral: { label: 'Lateral', plane: 'frontal', cue: 'Travel sideways over the line on the floor' },
  medial: { label: 'Medial', plane: 'frontal', cue: 'Travel sideways toward the standing side, over the line on the floor' },
  diagonal: { label: 'Diagonal', plane: 'multi', cue: 'Travel forward and across to the cone on the diagonal' },
  rot90: { label: '90° Rotational', plane: 'transverse', cue: 'Turn a quarter in the air to face the next wall' },
  rot180: { label: '180° Rotational', plane: 'transverse', cue: 'Turn half way in the air to face the wall behind' },
};
const KIND: Record<Kind, { noun: string; lvl: number; uni: boolean; setup: string; stickName: (d: string) => string; contName: (d: string) => string; sprintName: (d: string) => string }> = {
  jump: { noun: 'Jump', lvl: 0, uni: false, setup: 'Stand tall, feet hip-width, a line on the floor beside you.', stickName: (d) => `${d} Jump to Stick`, contName: (d) => `Continuous ${d} Jumps`, sprintName: (d) => `${d} Jump to Sprint` },
  jump1: { noun: 'Jump', lvl: 1, uni: true, setup: 'Stand tall on two feet, a line on the floor beside you.', stickName: (d) => `${d} Jump to Single-Leg Stick`, contName: (d) => `Continuous ${d} Two-to-One Jumps`, sprintName: (d) => `${d} Two-to-One Jump to Sprint` },
  one2: { noun: 'Jump', lvl: 1, uni: true, setup: 'Stand on one leg, a line on the floor beside you.', stickName: (d) => `${d} One-to-Two Jump to Stick`, contName: (d) => `Continuous ${d} One-to-Two Jumps`, sprintName: (d) => `${d} One-to-Two Jump to Sprint` },
  hop: { noun: 'Hop', lvl: 1, uni: true, setup: 'Stand on one leg, knee soft, a line on the floor beside you.', stickName: (d) => `${d} Hop to Stick`, contName: (d) => `Continuous ${d} Hops`, sprintName: (d) => `${d} Hop to Sprint` },
  bound: { noun: 'Bound', lvl: 1, uni: true, setup: 'Stand on one leg, ready to push off to the other.', stickName: (d) => `${d} Bound to Stick`, contName: (d) => `Continuous ${d} Bounds`, sprintName: (d) => `${d} Bound to Sprint` },
};
/** The cells a coach would program (batch 1 and the seed already hold the forward jumps and hops and the lateral bounds). */
const CELLS: Record<Kind, Partial<Record<Dir, Fin[]>>> = {
  jump: { forward: ['sprint'], backward: ['stick', 'cont'], lateral: ['stick', 'cont', 'sprint'], diagonal: ['stick', 'cont', 'sprint'], rot90: ['stick', 'cont'], rot180: ['stick', 'cont'] },
  jump1: { forward: ['stick', 'sprint'], backward: ['stick'], lateral: ['stick', 'sprint'], diagonal: ['stick'], rot90: ['stick'] },
  one2: { forward: ['stick', 'sprint'], lateral: ['stick', 'cont'], diagonal: ['stick'], rot90: ['stick'] },
  hop: { forward: ['sprint'], backward: ['stick', 'cont'], lateral: ['cont', 'sprint'], medial: ['stick', 'cont'], diagonal: ['stick', 'cont', 'sprint'], rot90: ['stick', 'cont'], rot180: ['stick'] },
  bound: { diagonal: ['stick', 'sprint'] },
};
const EXISTING_STICK: Partial<Record<string, string>> = { 'jump>forward': 'broad-jump-to-stick', 'hop>forward': 'single-leg-hop-to-stick', 'hop>lateral': 'lateral-hop-to-stick' };

function jumpLandVariants(): Variant[] {
  const out: Variant[] = [];
  for (const k of Object.keys(CELLS) as Kind[]) for (const d of Object.keys(CELLS[k]) as Dir[]) {
    const K = KIND[k]; const D = DIR[d];
    const fins = CELLS[k][d]!;
    const stickV = key(k, d, 'stick');
    const base = fins.includes('stick') ? stickV : EXISTING_STICK[`${k}>${d}`] ? `id:${EXISTING_STICK[`${k}>${d}`]}` : undefined;
    const lvl = K.lvl + (d === 'rot180' ? 1 : 0) + (k !== 'jump' && d.startsWith('rot') ? 1 : 0);
    const common = { setup: K.setup, plane: D.plane, laterality: K.uni ? 'unilateral' as const : 'bilateral' as const, ladder: key(k, d) };
    for (const f of fins) {
      if (f === 'stick') out.push(va(K.stickName(D.label), stickV, lvl, { ...common, cue: `${D.cue}, then stick the landing still and silent.`, dosage: reps(3, K.uni ? '4 each side' : '5', 45) }));
      if (f === 'cont') out.push(va(K.contName(D.label), key(k, d, 'cont'), lvl + 1, { ...common, ...(base ? { base } : {}), cue: `${D.cue} again and again, leaving the floor fast each time.`, dosage: contacts(3, K.uni ? 8 : 10, 60) }));
      if (f === 'sprint') out.push(va(K.sprintName(D.label), key(k, d, 'sprint'), lvl + 1, { ...common, ...(base ? { base } : {}), equipment: ['cone'], cue: `${D.cue}, land, and sprint to a cone 5 metres ahead.`, dosage: reps(4, K.uni ? '2 each side' : '3', 60), goals: ['speed', 'agility'] }));
    }
  }
  return out;
}

// ── drop landings by height × stance × direction ──────────────────────────────────────────────────────────────────

function dropLandingVariants(): Variant[] {
  const out: Variant[] = [];
  const heights: [string, string, number, string][] = [['Low Box', 'low', 0, 'a low box (shin height)'], ['Knee-High Box', 'knee', 1, 'a box at knee height']];
  const stances: [string, string, number, boolean][] = [['', 'two', 0, false], ['Split-Stance ', 'split', 1, false], ['Single-Leg ', 'single', 2, true]];
  const dirs: [string, string, string][] = [['', 'fwd', 'Step forward off the box'], ['Lateral ', 'lat', 'Step sideways off the box'], ['Rotational ', 'rot', 'Step off the box and turn a quarter in the air']];
  for (const [h, hk, hl, hs] of heights) for (const [s, sk, sl, uni] of stances) for (const [d, dk, dc] of dirs) {
    const name = `${d}${s}Drop Landing from a ${h}`.replace(/\s+/g, ' ');
    out.push(va(name, key('drop', hk, sk, dk), hl + sl + (dk === 'fwd' ? 0 : 1), {
      equipment: ['box'], laterality: uni ? 'unilateral' : 'bilateral', plane: dk === 'lat' ? 'frontal' : dk === 'rot' ? 'transverse' : 'sagittal', ladder: key('drop', sk, dk),
      setup: `Stand on ${hs}, toes at the edge.`, cue: `${dc} (do not jump off) and stick the landing${sk === 'split' ? ' in a split stance' : ''}.`,
    }));
  }
  return out;
}

// ── progressions with a base in batch 1 ───────────────────────────────────────────────────────────────────────────

const PROGRESSIONS: readonly [string, string, number, string, string, Partial<Variant>?][] = [
  // vertical
  ['Squat Jump from a Pause', 'squat-jump-pause', 1, 'id:squat-jump', 'Sit in the quarter squat for two seconds, then push the floor away hard with no dip.'],
  ['Squat Jump, Hands on Hips', 'squat-jump-hips', 1, 'id:squat-jump', 'Hands stay on the belt line: the floor push does all the work.'],
  ['Countermovement Jump, Hands on Hips', 'cmj-hips', 1, 'id:countermovement-jump', 'Hands stay on the belt line: dip and push the floor away in one fast motion.'],
  ['Countermovement Jump to a Target Touch', 'cmj-target', 1, 'id:countermovement-jump', 'Dip, then reach one hand up to touch the target on the wall at the top.', { equipment: ['wall'] }],
  ['Tuck Jump to Stick', 'tuck-stick', 1, 'id:tuck-jump', 'Knees up toward the ceiling at the top, then open and stick the landing still and silent.'],
  ['Switch Split Jump to Stick', 'split-stick', 1, 'id:switch-split-jump', 'Switch the legs in the air and stick the split landing still and silent.'],
  ['Split Squat Jump from a Pause', 'split-pause', 1, 'id:switch-split-jump', 'Hold the bottom of the split squat for two seconds, then push the floor away.'],
  ['Single-Leg Vertical Jump to Stick', 'sl-vert-stick', 2, 'id:single-leg-vertical-jump', 'Push the floor away on one leg and stick the landing on the same one.'],
  ['Single-Leg Vertical Jump to a Target Touch', 'sl-vert-target', 2, 'id:single-leg-vertical-jump', 'Push off one leg and reach a hand to the target on the wall at the top.', { equipment: ['wall'] }],
  ['Repeated Single-Leg Vertical Jumps', 'sl-vert-repeat', 2, 'id:single-leg-vertical-jump', 'Leave the floor fast each time, on the same leg, quiet on every contact.', { dosage: contacts(3, 6, 60) }],
  // box
  ['90° Rotational Box Jump', 'box-rot', 2, 'id:box-jump', 'Jump and turn a quarter in the air to land on the box, still and silent.', { equipment: ['box'] }],
  ['Split-Stance Box Jump', 'box-split', 1, 'id:box-jump', 'Start in a split stance, then push the floor away and land on the box on both feet.', { equipment: ['box'] }],
  ['Kneeling Jump to Box', 'box-kneel', 2, 'id:box-jump', 'From tall kneeling, swing and pop up onto the low box, landing quiet.', { equipment: ['box', 'mat'] }],
  ['Box Jump from a Pause', 'box-pause', 1, 'id:box-jump', 'Hold the quarter squat for two seconds, then jump onto the box with no dip.', { equipment: ['box'] }],
  ['Hands-on-Hips Box Jump', 'box-hips', 1, 'id:box-jump', 'Hands stay on the belt line: the floor push lifts you onto the box.', { equipment: ['box'] }],
  ['Single-Leg Lateral Box Jump', 'box-sl-lat', 2, 'id:single-leg-box-jump', 'Push off one leg sideways onto the low box and stick it on the same leg.', { equipment: ['box'], plane: 'frontal' }],
  // broad
  ['Single-Leg Broad Jump to Stick', 'broad-sl', 2, 'id:broad-jump-to-stick', 'Push off one leg out to the line and stick it on the same leg.', { laterality: 'unilateral' }],
  ['Broad Jump to Vertical Jump', 'broad-vert', 2, 'id:broad-jump-to-stick', 'Broad jump to the line, then on landing jump straight up toward the ceiling.'],
  ['Broad Jump from a Pause', 'broad-pause', 1, 'id:broad-jump-to-stick', 'Hold the quarter squat for two seconds, then jump out to the line with no dip.'],
  ['Kneeling Broad Jump', 'broad-kneel', 2, 'id:broad-jump-to-stick', 'From tall kneeling, swing and pop up onto both feet as far out as you can land quiet.', { equipment: ['mat'] }],
  ['Standing Triple Jump', 'triple', 2, 'id:broad-jump-to-stick', 'Hop, step, and jump to the line in three long contacts, then stick it.'],
  // hurdles
  ['Mini-Hurdle Jumps', 'hurdle-jumps', 1, '', 'Jump each hurdle with no extra bounce between, the floor hot.', { equipment: ['mini-hurdle'], dosage: contacts(3, 6, 60) }],
  ['Mini-Hurdle Jump to Stick', 'hurdle-stick', 0, '', 'Jump one hurdle and stick the landing still and silent before the next.', { equipment: ['mini-hurdle'] }],
  ['Lateral Mini-Hurdle Jumps', 'hurdle-lat', 1, '', 'Jump sideways over each hurdle with no extra bounce, the floor hot.', { equipment: ['mini-hurdle'], plane: 'frontal', dosage: contacts(3, 6, 60) }],
  ['Single-Leg Mini-Hurdle Hops', 'hurdle-sl', 2, '', 'Hop each hurdle on one leg, quiet on every contact.', { equipment: ['mini-hurdle'], laterality: 'unilateral', dosage: contacts(3, 5, 60) }],
  ['Lateral Single-Leg Mini-Hurdle Hops', 'hurdle-sl-lat', 2, '', 'Hop sideways over each hurdle on one leg, quiet on every contact.', { equipment: ['mini-hurdle'], laterality: 'unilateral', plane: 'frontal', dosage: contacts(3, 5, 60) }],
  ['Mini-Hurdle Jumps to Sprint', 'hurdle-sprint', 2, '', 'Jump the last hurdle, land and sprint to a cone 5 metres ahead.', { equipment: ['mini-hurdle', 'cone'], goals: ['speed'] }],
  ['Mini-Hurdle Stick-and-Go Jumps', 'hurdle-stick-jump', 1, '', 'Jump a hurdle, stick it for a two-count, then jump the next.', { equipment: ['mini-hurdle'] }],
  ['180° Mini-Hurdle Jumps', 'hurdle-180', 2, '', 'Jump each hurdle turning half way in the air, then stick it.', { equipment: ['mini-hurdle'], plane: 'transverse' }],
  // approach
  ['Four-Step Approach Jump', 'approach-4', 2, 'id:three-step-approach-jump', 'Four steps, the last two quick, then plant and lift off toward the target.'],
  ['Five-Step Approach Jump', 'approach-5', 2, 'id:three-step-approach-jump', 'Five steps building speed, then a quick last two and lift toward the target.'],
  ['Two-Foot Approach Jump to Rim Touch', 'approach-rim', 2, 'id:three-step-approach-jump', 'Gather on two feet under the target and reach up to touch the rim.', { equipment: ['hoop'] }],
  ['One-Foot Approach Jump to Backboard Touch', 'approach-board', 2, 'id:one-foot-approach-jump', 'Take off the floor like a layup and touch as high on the backboard as you can.', { equipment: ['hoop'] }],
  ['Approach Jump with Ball Reach', 'approach-ball', 2, 'id:three-step-approach-jump', 'Carry the ball high and reach it up toward the target at the top of the jump.', { equipment: ['basketball', 'hoop'] }],
  ['Approach Jump off a Dribble', 'approach-dribble', 2, 'id:one-foot-approach-jump', 'Two hard dribbles, gather, and rise off the floor toward the target.', { equipment: ['basketball', 'hoop'], goals: ['finishing'] }],
  ['Slide-Step Block Jump', 'block-slide', 1, '', 'Two slides along the line, then jump straight up with hands reaching to the ceiling.', { plane: 'frontal', sport: ['volleyball', 'basketball'] }],
  ['Crossover-Step Block Jump', 'block-cross', 2, '', 'Crossover step along the line, plant square, and jump straight up, hands high.', { plane: 'frontal', sport: ['volleyball', 'basketball'] }],
  // drop jumps (adults only)
  ['Single-Leg Drop Jump', 'drop-sl', 2, 'id:drop-jump-from-low-box', 'Step off the low box onto one leg and leave the floor fast, straight up.', { equipment: ['box'], laterality: 'unilateral', youthOk: false }],
  ['Drop Jump to Lateral Bound', 'drop-lat-bound', 2, 'id:drop-jump-from-low-box', 'Step off, touch the floor and bound sideways at once, then stick it.', { equipment: ['box'], youthOk: false, plane: 'frontal' }],
  ['Drop Jump to Sprint', 'drop-sprint', 2, 'id:drop-jump-from-low-box', 'Step off, touch the floor and sprint to the cone 5 metres ahead.', { equipment: ['box', 'cone'], youthOk: false, goals: ['speed'] }],
  ['Drop Jump to a Target Touch', 'drop-target', 2, 'id:drop-jump-from-low-box', 'Step off, touch the floor and jump to touch the target on the wall.', { equipment: ['box', 'wall'], youthOk: false }],
  ['Lateral Drop Jump', 'drop-lat', 2, 'id:drop-jump-from-low-box', 'Step sideways off the box, touch the floor and jump straight up, quiet.', { equipment: ['box'], youthOk: false, plane: 'frontal' }],
  ['Drop Jump, Hands on Hips', 'drop-hips', 2, 'id:drop-jump-from-low-box', 'Hands on the belt line: touch the floor and leave it fast, straight up.', { equipment: ['box'], youthOk: false }],
  // combinations
  ['Snap-Down to Vertical Jump', 'snap-vert', 1, 'id:snap-down', 'Snap down into a quiet stance, then jump straight up toward the ceiling at once.'],
  ['Snap-Down to Lateral Bound', 'snap-bound', 1, 'id:snap-down', 'Snap down into a quiet stance, then bound sideways and stick it.', { plane: 'frontal' }],
  ['Pogo Hops into Broad Jump', 'pogo-broad', 1, 'id:pogo-hop', 'Three springy pogos, then turn the last one into a broad jump to stick.'],
  ['Pogo Hops into Vertical Jump', 'pogo-vert', 1, 'id:pogo-hop', 'Three springy pogos, then turn the last one into a full jump to the ceiling.'],
  ['Broad Jump to Lateral Bound', 'broad-bound', 2, 'id:broad-jump-to-stick', 'Broad jump, land, then bound sideways at once and stick it.'],
  ['Lateral Bound to Vertical Jump', 'bound-vert', 2, 'id:lateral-bound-to-stick', 'Bound sideways, land on the outside leg, then jump straight up off both feet.'],
  ['Lateral Hop to Vertical Jump', 'hop-vert', 2, 'id:lateral-hop-to-stick', 'Hop sideways over the line, land, and jump straight up toward the ceiling.'],
  ['Drop Landing to Broad Jump', 'drop-broad', 2, 'id:drop-landing-from-low-box', 'Step off the low box, stick it, then broad jump to the line and stick again.', { equipment: ['box'] }],
  ['Drop Landing to Lateral Bound', 'drop-land-bound', 2, 'id:drop-landing-from-low-box', 'Step off the low box, stick it, then bound sideways and stick again.', { equipment: ['box'], plane: 'frontal' }],
  ['Drop Landing with Ball Catch', 'drop-catch', 1, 'id:drop-landing-from-low-box', 'Step off the low box as a partner tosses the ball; catch it and stick the landing.', { equipment: ['box', 'basketball'], sport: ['basketball', 'general'] }],
  ['Single-Leg Drop Landing with Ball Catch', 'drop-catch-sl', 2, 'id:single-leg-drop-landing', 'Step off onto one leg as the ball arrives; catch it and stick it still.', { equipment: ['box', 'basketball'], laterality: 'unilateral', sport: ['basketball', 'general'] }],
  ['Lateral Hop to Stick with Partner Push', 'hop-push', 2, 'id:lateral-hop-to-stick', 'Hop sideways over the line; a partner gives a light push as you land; stick it.', { laterality: 'unilateral', plane: 'frontal' }],
  ['Jump to Stick with Partner Push', 'jump-push', 1, 'id:broad-jump-to-stick', 'Jump out to the line; a partner gives a light push as you land; stick it still.'],
  ['Crossover Bound to Stick', 'cross-bound', 2, 'id:lateral-bound-to-stick', 'Bound across in front of the standing leg toward the line and stick it.', { laterality: 'unilateral', plane: 'frontal' }],
  ['Split Jump to Vertical Jump', 'split-vert', 2, 'id:switch-split-jump', 'One switch split jump, land, then jump straight up off both feet.'],
  // single-leg and line work
  ['Single-Leg Zig-Zag Hops', 'sl-zigzag', 2, 'id:single-leg-hop-series', 'Hop forward and across the line on one leg, side to side, quiet each time.', { plane: 'multi', dosage: contacts(3, 8, 60) }],
  ['Single-Leg Box Hop-Up', 'sl-box-hop', 2, 'id:single-leg-hop-to-stick', 'Hop up onto the low box on one leg and stick it on the same leg.', { equipment: ['box'] }],
  ['Single-Leg Square Hops', 'sl-square', 2, 'id:single-leg-hop-series', 'Hop the four corners of a square on the floor on one leg, quiet each time.', { plane: 'multi', dosage: contacts(3, 8, 60) }],
  ['Four-Square Line Hops', 'four-square', 1, 'id:forward-back-pogo', 'Pogo around four squares on the floor in order, quiet and quick.', { plane: 'multi', dosage: secs(3, 15, 45) }],
  ['Single-Leg Four-Square Line Hops', 'four-square-sl', 2, 'id:forward-back-pogo', 'Hop the four squares on the floor on one leg, quiet and quick.', { plane: 'multi', laterality: 'unilateral', dosage: secs(3, 10, 45) }],
  ['Diagonal Line Hops', 'line-diag', 1, 'id:forward-back-pogo', 'Pogo forward and across the line on the floor on the diagonal, quiet and quick.', { plane: 'multi', dosage: secs(3, 15, 45) }],
  ['Hexagon Hops', 'hexagon', 1, 'id:forward-back-pogo', 'Hop out and back over each side of a hexagon on the floor, facing the same wall.', { plane: 'multi', dosage: reps(3, '2 laps', 60) }],
  ['Single-Leg Hexagon Hops', 'hexagon-sl', 2, 'id:forward-back-pogo', 'One leg: hop out and back over each side of the hexagon on the floor.', { plane: 'multi', laterality: 'unilateral', dosage: reps(3, '1 lap each side', 60) }],
  // skips
  ['Lateral Power Skip', 'skip-lat', 1, 'id:power-skip', 'Skip sideways, driving off the floor for height with each push.', { plane: 'frontal' }],
  ['Backward Skip', 'skip-back', 0, 'id:power-skip', 'Skip backward in a steady rhythm, eyes on the line ahead.'],
  ['Crossover Skip', 'skip-cross', 1, 'id:power-skip', 'Skip sideways crossing the trail foot over in front, light on the floor.', { plane: 'frontal' }],
];

function progressionVariants(): Variant[] {
  return PROGRESSIONS.map(([name, v, l, base, cue, over]) => va(name, v, l, { cue, ...(base ? { base } : {}), ...(over ?? {}) }));
}

// ── upper-body plyos and loaded jumps ─────────────────────────────────────────────────────────────────────────────

const UPPER: readonly [string, string, number, string, Partial<Variant>?][] = [
  ['Wall Plyo Push-Off', 'wall', 0, 'Fall into the wall and push it away fast, so you leave it for a beat.', { equipment: ['wall'] }],
  ['Incline Plyo Push-Up', 'incline', 1, 'Hands on the box: push it away fast so the hands leave the box, land soft.', { equipment: ['box'] }],
  ['Kneeling Plyo Push-Up', 'kneeling', 1, 'From the knees, push the floor away fast so the hands leave it, land soft.', { equipment: ['mat'] }],
  ['Plyo Push-Up to Plates', 'plates', 2, 'Push the floor away and land each hand on a plate, then push back down.', { equipment: ['plate'], youthOk: false }],
  ['Med Ball Drop Push-Up', 'mb-drop', 2, 'Hands on the ball, drop them to the floor and push the floor away back onto the ball.', { equipment: ['medicine-ball'], youthOk: false }],
];
const LOADED: readonly [string, string, number, string, Variant['equipment'], string?][] = [
  ['Trap Bar Jump', 'trap-bar', 2, 'Light trap bar at the hips: dip and push the floor away hard, land quiet.', ['trap-bar']],
  ['Kettlebell Squat Jump', 'kb', 1, 'Light bell held at the chest: dip and push the floor away, land quiet.', ['kettlebell'], 'id:dumbbell-jump-squat'],
  ['Weight-Vest Countermovement Jump', 'vest-cmj', 2, 'Vest on: dip and push the floor away; if the landing gets loud, take it off.', ['weight-vest'], 'id:countermovement-jump'],
  ['Weight-Vest Broad Jump', 'vest-broad', 2, 'Vest on: jump out to the line and stick it still and silent.', ['weight-vest'], 'id:broad-jump-to-stick'],
  ['Band-Assisted Jump', 'band-assist', 1, 'A band overhead lightens the take-off: leave the floor fast, land quiet.', ['band'], 'id:countermovement-jump'],
  ['Band-Resisted Broad Jump', 'band-resist', 2, 'A partner holds a band at the hips: jump out to the line against it and stick it.', ['band'], 'id:broad-jump-to-stick'],
];

// ── rope footwork ─────────────────────────────────────────────────────────────────────────────────────────────────

const ROPE: readonly [string, string, number, string][] = [
  ['Forward-Back Rope Jump', 'fwd-back', 0, 'Jump the rope forward and back over a line on the floor, light and quick.'],
  ['Criss-Cross Rope Jump', 'criss-cross', 2, 'Cross the rope in front on every other turn, the floor contacts light.'],
  ['Boxer Skip Rope Jump', 'boxer', 1, 'Shift the weight side to side on each turn, light on the floor, like a boxer.'],
  ['Ski Rope Jump', 'ski', 1, 'Jump the rope side to side over a line on the floor, feet together.'],
  ['Scissor Rope Jump', 'scissor', 1, 'Switch the feet front and back on each turn, light on the floor.'],
  ['Wide-Narrow Rope Jump', 'wide-narrow', 1, 'Land wide, then narrow on alternate turns, quiet on the floor.'],
  ['Rope Jump with 180° Turns', 'turns', 2, 'Turn half way every four jumps without missing a turn of the rope.'],
  ['Single-Leg Side-to-Side Rope Jump', 'sl-side', 2, 'One foot: jump the rope side to side over a line on the floor.'],
  ['Heel-Toe Rope Jump', 'heel-toe', 1, 'Tap heel then toe out front on alternate turns, light on the floor.'],
  ['Running Rope Jump', 'running', 1, 'Run forward along the floor turning the rope, one light step per turn.'],
  ['Crossover-Step Rope Jump', 'crossover-step', 2, 'Cross one foot over the other on each turn, light on the floor.'],
];

export const LATER_JUMPS: Family[] = [
  {
    ...PLYO, family: 'jump-land-matrix', block: 'plyometrics-landing', pattern: 'locomotion', plane: 'multi', laterality: 'bilateral',
    primary: ['quads', 'glutes', 'calves'], secondary: ['hamstrings', 'glute-med', 'foot'], goals: ['landing', 'agility', 'vertical'], sport: ['general', 'basketball', 'volleyball', 'soccer', 'football'],
    lowLoad: ['back'], youthOk: true, equipment: [], clip: 'jump',
    setup: 'Athletic stance, a line on the floor beside you.',
    cues: [STICK, QUIET, 'Knees travel out over your laces as you land.'],
    faults: [
      { fault: 'Knees caving in on the landing', fix: 'Land with the knees out over your laces and stick it.' },
      { fault: 'Landing loud and stiff', fix: 'Let the hips sit back as the floor arrives, quiet like a cat.' },
      { fault: 'Wobbling after the landing', fix: 'Shorten the distance until you can stick it for a two-count.' },
    ],
    dosage: reps(3, '5', 45), variants: jumpLandVariants(),
  },
  {
    ...PLYO, family: 'drop-landing-ladder', block: 'plyometrics-landing', pattern: 'locomotion', plane: 'sagittal', laterality: 'bilateral',
    primary: ['quads', 'glutes'], secondary: ['calves', 'hamstrings', 'foot'], goals: ['landing', 'knee'], sport: ['general', 'basketball', 'volleyball', 'soccer'],
    lowLoad: ['back'], youthOk: true, equipment: ['box'], clip: 'jump',
    setup: 'Stand on the box, toes at the edge.',
    cues: [STICK, QUIET, 'Knees travel out over your laces as you land.'],
    faults: [
      { fault: 'Jumping up off the box', fix: 'Step off, do not jump off: the drop is the work.' },
      { fault: 'Knees caving in on the landing', fix: 'Land with the knees out over your laces and stick it.' },
    ],
    dosage: reps(3, '4', 45), variants: dropLandingVariants(),
  },
  {
    ...PLYO, family: 'jump-progressions-2', block: 'plyometrics-2', pattern: 'locomotion', plane: 'sagittal', laterality: 'bilateral',
    primary: ['quads', 'glutes', 'calves'], secondary: ['hamstrings', 'foot'], goals: ['vertical', 'power', 'landing'], sport: ['general', 'basketball', 'volleyball', 'track'],
    lowLoad: ['back'], youthOk: true, equipment: [], clip: 'jump',
    setup: 'Stand tall, feet hip-width, arms ready to swing.',
    cues: ['Push the floor away hard and fast.', QUIET, HOT],
    faults: [
      { fault: 'Landing loud and stiff', fix: 'Let the hips sit back as the floor arrives, quiet like a cat.' },
      { fault: 'Knees caving in on the take-off or landing', fix: 'Push the floor apart: the knees stay out over your laces.' },
      { fault: 'Slow, sticky contacts in a repeated set', fix: 'Touch the floor and leave it fast, like the floor is hot.' },
    ],
    dosage: reps(3, '5', 60), variants: progressionVariants(),
  },
  {
    ...PLYO, family: 'upper-body-plyo', block: 'plyometrics-2', category: 'plyometric', pattern: 'push', plane: 'sagittal', laterality: 'bilateral',
    primary: ['chest', 'triceps'], secondary: ['delts', 'serratus', 'deep-core'], goals: ['power'], sport: ['general', 'basketball', 'football'],
    lowLoad: ['knee', 'ankle'], youthOk: true, equipment: [], clip: 'push', cautions: ['Only once a full push-up is smooth; stop the set when the hands land loud.'],
    setup: 'Hands a little wider than the shoulders, body in one long line.',
    cues: ['Push the floor away fast.', 'Land soft: the hands meet the floor quiet.', 'Keep one long line from head to heels, like a plank.'],
    faults: [
      { fault: 'Hips sagging toward the floor', fix: 'Keep one long line, like a plank, through every push.' },
      { fault: 'Landing hard on locked arms', fix: 'Let the floor arrive into soft arms, then push it away again.' },
    ],
    dosage: reps(3, '5', 60), variants: UPPER.map(([name, v, l, cue, over]) => va(name, v, l, { cue, ...(over ?? {}) })),
  },
  {
    ...PLYO, family: 'loaded-jump', block: 'plyometrics-2', category: 'power', pattern: 'squat', plane: 'sagittal', laterality: 'bilateral',
    primary: ['quads', 'glutes'], secondary: ['calves', 'hamstrings'], goals: ['power', 'vertical'], sport: ['general', 'basketball', 'volleyball', 'football'],
    lowLoad: ['back'], youthOk: false, equipment: [], clip: 'jump', cautions: ['Light load only: the jump height should barely drop. Adults only.'],
    setup: 'Stand tall, feet hip-width, the load set.',
    cues: ['Push the floor away hard and fast.', QUIET, 'Stop the set when the height drops.'],
    faults: [
      { fault: 'Load too heavy, jump too low', fix: 'Lighten the load until the jump is still fast off the floor.' },
      { fault: 'Landing loud and stiff', fix: 'Let the hips sit back as the floor arrives, quiet like a cat.' },
    ],
    dosage: reps(4, '4', 90), variants: LOADED.map(([name, v, l, cue, equipment, base]) => va(name, v, l, { cue, equipment, ...(base ? { base } : {}) })),
  },
  {
    family: 'jump-rope-2', block: 'conditioning-rope', batch: BATCH, category: 'conditioning', pattern: 'locomotion', plane: 'sagittal', laterality: 'bilateral', skillLayer: 'wake-up', braceMode: 'reflex',
    primary: ['calves', 'soleus'], secondary: ['foot', 'forearms', 'delts'], goals: ['conditioning', 'ankle', 'footwork'], sport: ['general', 'basketball', 'tennis', 'soccer'],
    lowLoad: ['back', 'knee', 'shoulder'], youthOk: true, equipment: ['jump-rope'], clip: 'hop',
    setup: 'Rope behind the heels, handles at the hips, elbows close to the sides.',
    cues: ['Small, quiet contacts on the floor, an inch high.', 'Turn the rope with the wrists, the handles at the hips.', 'Keep a steady rhythm, like a metronome beat.'],
    faults: [
      { fault: 'Jumping too high over the rope', fix: 'Clear the rope by an inch: small, quiet contacts on the floor.' },
      { fault: 'Big arm circles', fix: 'Keep the handles at the hips and turn the rope with small circles.' },
    ],
    dosage: secs(4, 30, 30), variants: ROPE.map(([name, v, l, cue]) => va(name, v, l, { cue })),
  },
];

