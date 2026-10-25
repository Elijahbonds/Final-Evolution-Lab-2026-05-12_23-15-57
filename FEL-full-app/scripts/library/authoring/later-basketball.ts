// Batch 2, basketball (owner priority 2026-10-25): handle combos, one-hand and two-ball handling, finishing by finish ×
// approach, shooting off the dribble and off the catch by move × spot × range, post and triple-threat footwork,
// closeouts, help and recovery, passing. Each matrix lists only the cells a coach would program: a baby hook is a
// middle or baseline move, a kick-out pass is always off the dribble, an elbow jumper is never a three.
import { meters, reps, secs, type Family, type Variant } from './types';
import { key, lv, va } from './gen';

const BATCH = 2 as const;
const EYES = 'Eyes up on a target on the wall, not on the ball.';
const LOW = 'Pound the ball into the floor hard, below the knee.';

// ── handle combos: move A into move B ─────────────────────────────────────────────────────────────────────────────

interface Move { k: string; label: string; cue: string; lvl: number }
const MOVES: readonly Move[] = [
  { k: 'cross', label: 'Crossover', cue: 'rip the ball low across the body to the other hand', lvl: 0 },
  { k: 'between', label: 'Between-the-Legs', cue: 'bounce the ball hard between the feet on the floor', lvl: 1 },
  { k: 'behind', label: 'Behind-the-Back', cue: 'wrap the ball behind the belt line to the other side', lvl: 1 },
  { k: 'inout', label: 'In-and-Out', cue: 'fake the cross with the ball, then push it back out on the same side', lvl: 1 },
  { k: 'hesi', label: 'Hesitation', cue: 'slow the ball for a beat, eyes on the target, then go', lvl: 1 },
  { k: 'retreat', label: 'Retreat', cue: 'take two hard dribbles back, the ball shielded from the cone', lvl: 1 },
  { k: 'spin', label: 'Spin', cue: 'pull the ball tight through the spin and come out low', lvl: 2 },
];
/** Pairs batch 1 already wrote as its own combos: the settings below point at them as their base. */
const EXISTING_PAIR: Record<string, string> = { 'cross>between': 'crossover-between-combo', 'between>behind': 'between-behind-combo' };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function comboVariants(): Variant[] {
  const out: Variant[] = [];
  const settings = (base: string, name: string, lvl: number, cueA: string): Variant[] => [
    va(`${name} vs Pad Pressure`, key(base, 'pressure'), lv(lvl + 1), {
      base, equipment: ['basketball'], setup: 'A partner stands in front with a pad, bumping and reaching for the ball.',
      cue: 'Keep the ball low and on the side away from the pad through every move of the combo.', dosage: secs(3, 30, 30), ladder: base,
    }),
    va(`${name} on the Move`, key(base, 'move'), lv(lvl), {
      base, equipment: ['basketball', 'cone'], setup: 'Cones in a line down the floor, 5 metres apart, ball in one hand.',
      cue: `Hit the combo at each cone, then push the ball ahead to the next one.`, dosage: meters(3, 25, 30), goals: ['handles', 'footwork'], ladder: base,
    }),
    va(`${name}, Finish at the Rim`, key(base, 'finish'), lv(lvl + 1), {
      base, equipment: ['basketball', 'cone', 'hoop'], setup: 'Start at the wing three-point line with a cone at the elbow.',
      cue: `At the cone, ${cueA}, then attack the rim and finish off the glass.`, dosage: reps(3, '4 each side', 30), goals: ['handles', 'finishing'], ladder: base,
    }),
    va(`${name}, Pull-Up Jumper`, key(base, 'pull-up'), lv(lvl + 1), {
      base, equipment: ['basketball', 'cone', 'hoop'], setup: 'Start at half court with a cone at the top of the key.',
      cue: 'Hit the combo at the cone, then stop on two feet and rise straight up into the jumper.', dosage: reps(3, '5', 30), goals: ['handles', 'shooting'], ladder: base,
    }),
  ];
  // one entry per PAIR (a name with the same moves in the other order is the same entry to the validator's name key):
  // the athlete runs it both ways
  MOVES.forEach((a, i) => MOVES.slice(i + 1).forEach((b) => {
    const name = `${a.label} into ${b.label} Combo`;
    const lvl = Math.max(1, Math.max(a.lvl, b.lvl));
    const existing = EXISTING_PAIR[`${a.k}>${b.k}`];
    const v = key('combo', a.k, b.k);
    if (existing) { out.push(...settings(`id:${existing}`, name, lvl, a.cue)); return; }
    out.push(va(name, v, lv(lvl), { cues: [`First ${a.cue}.`, `Then ${b.cue}; next set, run it the other way round.`, LOW], ladder: v }));
    out.push(...settings(v, name, lvl, a.cue));
  }));
  // three-move combos: a set-up move, a change, a finish move
  for (const a of MOVES.filter((m) => ['hesi', 'inout', 'cross'].includes(m.k))) {
    for (const b of MOVES.filter((m) => ['between', 'behind'].includes(m.k))) {
      for (const c of MOVES.filter((m) => ['cross', 'spin', 'retreat'].includes(m.k))) {
        if (a.k === c.k) continue;
        const name = `${a.label}, ${b.label}, ${c.label} Combo`;
        const v = key('combo3', a.k, b.k, c.k);
        out.push(va(name, v, 2, { cues: [`${cap(a.cue)}; then ${b.cue}.`, `Finish the chain: ${c.cue}.`, EYES], ladder: v, dosage: secs(3, 30, 30) }));
        out.push(va(`${name} on the Move`, key(v, 'move'), 2, {
          base: v, ladder: v, equipment: ['basketball', 'cone'], setup: 'Cones in a line down the floor, 5 metres apart, ball in one hand.',
          cue: 'Run the whole chain at each cone, then push the ball ahead to the next one.', dosage: meters(3, 25, 40), goals: ['handles', 'footwork'],
        }));
      }
    }
  }
  return out;
}

// ── one-hand and two-ball handling ────────────────────────────────────────────────────────────────────────────────

const ONE_HAND: readonly [string, string, number, string][] = [
  ['Front V-Dribble', 'front-v', 0, 'Push the ball side to side in front of you in a V, the floor hit hard at the bottom.'],
  ['Side V-Dribble', 'side-v', 0, 'Rock the ball front to back at your side in a V, the hand riding over the top of the ball.'],
  ['Push-Pull Dribble', 'push-pull', 1, 'Push the ball ahead, then pull it back to the hip, the floor hit hard both ways.'],
  ['Windshield-Wiper Dribble', 'wiper', 1, 'Sweep the ball side to side low in front, like a wiper on a windscreen.'],
  ['Snatch-Back Dribble', 'snatch-back', 1, 'Push the ball out ahead, then snatch it back to the hip in one hard bounce.'],
  ['Wide Pound Dribble', 'wide-pound', 0, 'Pound the ball wide outside the foot, away from the reach of a defender.'],
  ['Kill Dribble', 'kill', 1, 'Pound the ball hard, then stop it dead in the hand on the count, and go again.'],
  ['Rocking Dribble', 'rocking', 1, 'Rock the ball front to back while the stance stays low and level.'],
];
function oneHandVariants(): Variant[] {
  return ONE_HAND.flatMap(([name, v, l, cue]) => [
    va(name, v, l, { cue, ladder: v }),
    va(`Kneeling ${name}`, key('kneeling', v), l, { base: v, ladder: v, setup: 'Kneel on one knee, ball in the outside hand, eyes up.', cue, dosage: secs(3, 30, 20) }),
    va(`Walking ${name}`, key('walking', v), l + 1, { base: v, ladder: v, setup: 'Walk slowly down the floor, ball in one hand.', cue: `${cue.replace(/\.$/, '')} as you walk.`, dosage: meters(3, 20, 30) }),
  ]);
}
const TWO_BALL: readonly [string, string, string][] = [
  ['Two-Ball High-Low Dribble', 'high-low', 'One ball high at the hip, the other low at the ankle, then switch on the count.'],
  ['Two-Ball In-and-Out Dribble', 'in-out', 'Push both balls in toward each other, then back out, together on the floor.'],
  ['Two-Ball Front V-Dribble', 'front-v', 'Both balls move side to side in front in a V, the floor hit hard at the bottom.'],
  ['Two-Ball Side V-Dribble', 'side-v', 'Both balls rock front to back at your sides, the hands riding over the top.'],
  ['Two-Ball Wide Pound', 'wide', 'Pound both balls wide outside the feet, hard into the floor.'],
  ['Two-Ball Rhythm Change', 'rhythm', 'Four together, four alternating: change the beat on the floor without losing a ball.'],
  ['Two-Ball Retreat Dribble', 'retreat', 'Two hard dribbles back with both balls, then two forward, eyes up.'],
  ['Two-Ball Cross and Pound', 'cross-pound', 'One ball crosses low in front while the other pounds at the side.'],
];
function twoBallVariants(): Variant[] {
  return TWO_BALL.flatMap(([name, v, cue]) => [
    va(name, v, 2, { cue, ladder: v }),
    va(`Walking ${name}`, key('walking', v), 2, { base: v, ladder: v, setup: 'A ball in each hand, walking slowly down the floor.', cue, dosage: meters(3, 20, 30) }),
  ]);
}

// ── finishing: finish × approach ──────────────────────────────────────────────────────────────────────────────────

const APPROACH: Record<string, { label: string; setup: string }> = {
  wing: { label: 'off One Dribble from the Wing', setup: 'Start at the wing in triple threat, a cone at the elbow-block.' },
  baseline: { label: 'off a Baseline Drive', setup: 'Start at the short corner and drive along the baseline, a cone at the block.' },
  middle: { label: 'off a Middle Drive', setup: 'Start at the wing and drive into the middle of the lane past a cone at the elbow.' },
  cut: { label: 'off a Catch on the Cut', setup: 'Cut from the wing to the rim; a partner passes as you reach the lane.' },
  transition: { label: 'in Transition', setup: 'Start at half court with the ball and push it ahead at speed to the rim.' },
  top: { label: 'off a Two-Dribble Drive from the Top', setup: 'Start at the top of the key and attack the lane in two dribbles.' },
  crossDrive: { label: 'off a Crossover Drive', setup: 'Start at the top with a cone at the elbow; cross over at the cone and attack the lane.' },
  hesiDrive: { label: 'off a Hesitation Drive', setup: 'Start at the wing with a cone at the elbow; hesitate at the cone, then attack the rim.' },
  spinDrive: { label: 'off a Spin Dribble', setup: 'Start at the wing; drive at a cone in the lane and spin off it toward the rim.' },
};
interface Finish { k: string; label: string; cue: string; lvl: number; from: string[]; contact: boolean }
const FINISHES: readonly Finish[] = [
  { k: 'overhand', label: 'Overhand Layup', cue: 'Drive the high knee up toward the target and lay the ball soft off the glass.', lvl: 0, from: ['wing', 'baseline', 'middle', 'cut', 'transition', 'top', 'crossDrive', 'hesiDrive', 'spinDrive'], contact: true },
  { k: 'reverse', label: 'Reverse Layup', cue: 'Carry the ball under the rim and finish on the far side, away from the reach.', lvl: 1, from: ['baseline', 'middle', 'transition', 'cut', 'crossDrive', 'spinDrive'], contact: true },
  { k: 'floater', label: 'Floater', cue: 'Release early and high: a soft arc over the outstretched reach.', lvl: 1, from: ['middle', 'top', 'transition', 'wing', 'crossDrive', 'hesiDrive', 'spinDrive'], contact: false },
  { k: 'runner', label: 'One-Foot Runner', cue: 'Keep running through the release: a soft, high shot off the floor in stride.', lvl: 1, from: ['middle', 'top', 'transition', 'baseline', 'crossDrive', 'hesiDrive'], contact: false },
  { k: 'euro', label: 'Euro Step Layup', cue: 'Long first step one way, the second across, the ball moving with you.', lvl: 2, from: ['wing', 'top', 'transition', 'middle', 'crossDrive', 'hesiDrive'], contact: true },
  { k: 'fingerroll', label: 'Finger Roll', cue: 'Roll the ball off the fingertips up over the rim, soft and high.', lvl: 1, from: ['wing', 'transition', 'cut', 'top', 'hesiDrive'], contact: true },
  { k: 'scoop', label: 'Scoop Layup', cue: 'Scoop the ball underhand up around the reach, a soft touch off the glass.', lvl: 1, from: ['middle', 'transition', 'baseline', 'crossDrive', 'spinDrive'], contact: false },
  { k: 'power', label: 'Two-Foot Power Finish', cue: 'Jump stop on two feet, ball high at the forehead, and go up strong to the rim.', lvl: 1, from: ['baseline', 'wing', 'cut', 'middle', 'crossDrive', 'spinDrive'], contact: true },
  { k: 'inside', label: 'Inside-Hand Layup', cue: 'Finish with the hand nearer the middle of the floor, the ball away from the shot-blocker.', lvl: 2, from: ['baseline', 'middle', 'wing', 'crossDrive'], contact: true },
  { k: 'prohop', label: 'Pro-Hop Layup', cue: 'Hop off one foot onto both, quiet and balanced, then rise to the rim.', lvl: 2, from: ['wing', 'top', 'transition', 'crossDrive', 'hesiDrive'], contact: true },
  { k: 'babyhook', label: 'Baby Hook Finish', cue: 'Shoulder to the rim, ball high, a soft one-hand hook over the reach.', lvl: 1, from: ['middle', 'baseline'], contact: false },
  { k: 'jumpstop', label: 'Jump-Stop Pivot Finish', cue: 'Jump stop on two feet, pivot away from the cone, and finish off the glass.', lvl: 1, from: ['middle', 'top', 'baseline', 'crossDrive'], contact: true },
  { k: 'spin', label: 'Spin-Back Finish', cue: 'Spin off the cone, the ball tight through the turn, and finish on the far side.', lvl: 2, from: ['middle', 'baseline'], contact: false },
  { k: 'upunder', label: 'Shot-Fake Step-Through Finish', cue: 'Ball fake up toward the target, then step through under the fake and finish.', lvl: 2, from: ['baseline', 'middle'], contact: true },
];
function finishVariants(): Variant[] {
  const out: Variant[] = [];
  for (const f of FINISHES) for (const a of f.from) {
    const ap = APPROACH[a];
    const name = `${f.label} ${ap.label}`;
    const v = key(f.k, a);
    out.push(va(name, v, f.lvl, { setup: ap.setup, cue: f.cue, ladder: f.k }));
    out.push(va(`${name}, Weak-Hand Side`, key(v, 'weak'), f.lvl + 1, {
      base: v, ladder: f.k, setup: `${ap.setup} Every rep on your weaker side.`,
      cues: ['The ball in your weaker hand on every rep: slower and clean beats fast and sloppy.', f.cue, 'Land quiet and balanced under the basket.'],
    }));
    if (f.contact) {
      out.push(va(`${name}, Through a Pad Bump`, key(v, 'contact'), f.lvl + 1, {
        base: v, ladder: f.k, setup: `${ap.setup} A partner bumps you with a pad on the take-off.`,
        cue: 'Absorb the bump and keep the ball high, then finish to the target on the glass.', cautions: ['Light bumps first; the partner adds contact only when the finish stays balanced.'],
      }));
    }
  }
  return out;
}

// ── shooting: off the dribble (move × spot × range), off the catch (cut × spot × range × footwork) ─────────────────

const PULL_UPS: readonly [string, string, number, string][] = [
  ['One-Dribble Pull-Up', 'one-dribble', 1, 'One hard dribble, stop on two feet, and rise straight up.'],
  ['Two-Dribble Pull-Up', 'two-dribble', 1, 'Two hard dribbles, a quick stop, and rise straight up to the target.'],
  ['Crossover Pull-Up', 'cross', 1, 'Rip the ball across low, then stop square to the rim and rise.'],
  ['Between-the-Legs Pull-Up', 'between', 2, 'Bounce the ball between the feet into the stop, then rise straight up.'],
  ['Behind-the-Back Pull-Up', 'behind', 2, 'Wrap the ball behind the belt line into the stop, square to the rim.'],
  ['Hesitation Pull-Up', 'hesi', 1, 'Slow the ball for a beat, then stop sharp and rise before the reach arrives.'],
  ['In-and-Out Pull-Up', 'inout', 2, 'Fake the cross with the ball, push it back out, and rise off the stop.'],
  ['Step-Back Jumper', 'step-back', 2, 'Push the floor away from the cone, land balanced and square, then rise.'],
  ['Side-Step Jumper', 'side-step', 2, 'Hop sideways off the drive, land quiet on the floor square to the target, and rise.'],
];
const SPOTS: readonly [string, string, boolean][] = [['Wing', 'wing', true], ['Top', 'top', true], ['Slot', 'slot', true], ['Elbow', 'elbow', false], ['Baseline', 'baseline', false]];
function pullUpVariants(): Variant[] {
  const out: Variant[] = [];
  for (const [label, k, l, cue] of PULL_UPS) for (const [spot, sk, three] of SPOTS) {
    const v = key(k, sk);
    out.push(va(`${label}, ${spot}`, v, l, { cue, setup: `Start a step beyond the ${spot.toLowerCase()} spot inside the arc, ball in triple threat.`, ladder: k }));
    // the weaker direction is the one that needs the reps: the same pull-up, finishing toward the weaker hand's side
    out.push(va(`${label}, ${spot}, Toward the Weak Hand`, key(v, 'weak'), l + 1, {
      base: v, ladder: k, cue: 'Go toward your weaker hand: same stop, same rise, the ball as low and tight as on your strong side.',
      setup: `Start a step beyond the ${spot.toLowerCase()} spot inside the arc, ball in triple threat.`,
    }));
    if (three) out.push(va(`${label}, ${spot} Three`, key(v, 'three'), l + 1, { base: v, ladder: k, cue, setup: `Start a step beyond the three-point line at the ${spot.toLowerCase()}, ball in triple threat.`, goals: ['shooting'] }));
  }
  return out;
}
const CUTS: readonly [string, string, string, [string, string, boolean][]][] = [
  ['off a V-Cut', 'v-cut', 'Walk the cone in, then push the floor away and pop out to the spot with hands ready.', [['Wing', 'wing', true]]],
  ['off an L-Cut', 'l-cut', 'Walk up the lane, then cut flat out to the spot with hands ready for the ball.', [['Wing', 'wing', true], ['Elbow', 'elbow', false]]],
  ['off a Flare Cut', 'flare', 'Fade away from the ball off the cone, feet set before the catch.', [['Wing', 'wing', true]]],
  ['off a Curl Cut', 'curl', 'Curl tight around the cone toward the ball, then stop square to the rim.', [['Elbow', 'elbow', false]]],
  ['off a Fade to the Corner', 'fade', 'Drift to the corner as the drive goes the other way, set on the spot for the catch.', [['Corner', 'corner', true]]],
  ['off a Lift from the Corner', 'lift', 'Lift from the corner to the wing as the ball moves, hands ready on the catch.', [['Wing', 'wing', true]]],
  ['after a Relocation', 'relocate', 'Pass, then move one spot along the arc and catch it back, feet set.', [['Corner', 'corner', true], ['Wing', 'wing', true]]],
  ['off a Screen Pop', 'pop', 'Set the screen on the cone, then pop out to the spot with hands ready.', [['Top', 'top', true], ['Wing', 'wing', true]]],
];
function catchAndShootVariants(): Variant[] {
  const out: Variant[] = [];
  for (const [cut, ck, cue, spots] of CUTS) for (const [spot, sk, three] of spots) {
    const ranges: [string, string][] = three ? [['Mid-Range', 'mid'], ['Three', 'three']] : [['Mid-Range', 'mid']];
    for (const [range, rk] of ranges) {
      const name = `Catch-and-Shoot ${cut}, ${spot} ${range}`;
      const v = key(ck, sk, rk);
      const setup = `A partner or coach passes from the top; start the cut from below the ${spot.toLowerCase()} spot.`;
      out.push(va(name, v, rk === 'three' ? 2 : 1, { cue, ladder: ck, setup, goals: ['shooting', 'footwork'] }));
      out.push(va(`${name}, One-Two Step`, key(v, 'one-two'), rk === 'three' ? 2 : 1, {
        base: v, ladder: ck, setup, cue: 'Catch, then step one-two into the spot, square to the target, and rise.', goals: ['shooting', 'footwork'],
      }));
    }
  }
  return out;
}

// ── footwork: post moves by side, triple-threat series ────────────────────────────────────────────────────────────

const POST: readonly [string, string, number, string][] = [
  ['Post Drop Step', 'drop-step', 1, 'Drop the foot behind the cone and seal it, then power up off two feet.'],
  ['Post Jump Hook', 'jump-hook', 1, 'Step across, ball high, and lift a soft one-hand hook over the reach.'],
  ['Post Face-Up Jab', 'face-up', 1, 'Pivot to face the rim, jab at the cone, then drive or shoot.'],
  ['Post Spin', 'spin', 2, 'Spin off the cone on the pivot foot, the ball tight, and finish on the glass.'],
  ['Post Turnaround Jumper', 'turnaround', 2, 'Turn on the pivot foot to square up, then rise straight up to the target.'],
  ['Post Shot Fake and Step-Through', 'fake-through', 2, 'Ball fake up toward the target, then step through under it and finish.'],
];
function postVariants(): Variant[] {
  return POST.flatMap(([label, k, l, cue]) => [
    va(`${label} to the Baseline`, key(k, 'baseline'), l, { cue, ladder: k }),
    va(`${label} to the Middle`, key(k, 'middle'), l, { base: key(k, 'baseline'), ladder: k, cue }),
  ]);
}
const TRIPLE: readonly [string, string, number, string][] = [
  ['Jab and Shoot', 'jab-shoot', 1, 'Jab at the cone; if it does not move back, rise and shoot.'],
  ['Jab, Shot Fake, Drive', 'jab-fake-drive', 1, 'Jab, ball fake up toward the target, then drive past the cone.'],
  ['Jab, Crossover Drive', 'jab-cross-drive', 1, 'Jab one way, rip the ball across low, and drive the other way past the cone.'],
  ['Jab, Rip-Through Drive', 'jab-rip', 1, 'Jab, rip the ball low across the knees, and drive past the cone.'],
  ['Shot Fake, Side-Step Jumper', 'fake-side-step', 2, 'Ball fake up, hop sideways off the cone, land square and rise.'],
  ['Rip-Through Baseline Drive', 'rip-baseline', 1, 'Rip the ball low and drive along the baseline past the cone.'],
  ['Front Pivot into Jab', 'pivot-jab', 0, 'Front pivot to face the rim, then jab sharp at the cone.'],
  ['Reverse Pivot into Drive', 'pivot-drive', 1, 'Reverse pivot away from the cone, then drive past it in one dribble.'],
  ['Catch, Pivot and Rip', 'catch-pivot-rip', 0, 'Catch on two feet, pivot to face the rim, and rip the ball low.'],
];
function tripleVariants(): Variant[] {
  return TRIPLE.flatMap(([label, k, l, cue]) => [
    va(label, k, l, { cue, ladder: k }),
    va(`${label} vs a Closeout`, key(k, 'closeout'), l + 1, {
      base: k, ladder: k, cue: 'Read the partner closing out at you: short and high, go by; long and low, shoot.', setup: 'Catch at the wing; a partner closes out from the paint.',
    }),
  ]);
}

// ── defense: closeouts, slides, help and recovery, post, transition, boxing out ───────────────────────────────────

const CLOSE_FROM: readonly [string, string, string][] = [
  ['from Help Side', 'help', 'Start in help-side stance on the far block, a partner with the ball at the wing.'],
  ['from the Paint', 'paint', 'Start in the middle of the paint, a partner with the ball at the wing.'],
  ['from the Baseline', 'baseline', 'Start under the rim, a partner with the ball in the corner.'],
];
const CLOSE_TO: readonly [string, string, string][] = [
  ['to Contest', 'contest', 'Sprint, then chop the feet short and get a high hand up toward the ball.'],
  ['to Cut Off the Drive', 'cut-off', 'Chop the feet, then slide to beat the partner to the spot, chest square.'],
  ['to Drop Step and Slide', 'drop-slide', 'Chop short steps on the floor, then open on a drop step and slide with the drive.'],
  ['to Box-Out', 'box-out', 'Contest the shot, then turn, find the partner and hold them off the rim.'],
];
function closeoutVariants(): Variant[] {
  const out: Variant[] = [];
  for (const [from, fk, setup] of CLOSE_FROM) for (const [to, tk, cue] of CLOSE_TO) {
    out.push(va(`Closeout ${from} ${to}`, key('closeout', fk, tk), fk === 'help' ? 1 : 2, { setup, cue, ladder: fk }));
  }
  return out;
}
const DEF_DRILLS: readonly [string, string, number, string, string?][] = [
  ['Lane Line Slides', 'lane-slides', 0, 'Slide lane line to lane line, touching each line on the floor, low and level.'],
  ['Slide, Drop Step, Slide', 'slide-drop-slide', 1, 'Three slides, open on a drop step at the cone, three slides back the other way.'],
  ['Slide to Sprint Recovery', 'slide-sprint', 1, 'Slide until the cone, then turn and sprint to the next cone to beat the ball there.'],
  ['Slide with Ball Swipe', 'slide-swipe', 1, 'Slide with the drive and swipe up at a ball the partner holds low, hands quick.'],
  ['Defensive Slide Ladder', 'slide-ladder', 1, 'Slide three steps, then five, then seven, stopping square and still at each cone.'],
  ['Zig-Zag Slides vs a Dribbler', 'zig-zag-dribbler', 2, 'Stay a step ahead of the dribbler and turn them at every cone down the floor.', 'partner'],
  ['Mirror Slides vs a Partner', 'mirror-slides', 1, 'Mirror the partner along the lane line, chest square to them, staying in front.', 'partner'],
  ['Help Stance to Stunt and Recover', 'stunt-recover', 1, 'Stunt toward the driving partner, then sprint back to your cone and close out.'],
  ['Tag the Cutter and Recover', 'tag-recover', 1, 'Bump the cutter off the line with a body check, then sprint back to the ball side.'],
  ['Help-Side Rotation to Charge Stance', 'rotate-charge', 2, 'Rotate across the lane, beat the driver to the spot, and stop square and still.'],
  ['Deny to Back-Cut Recovery', 'deny-backcut', 2, 'Deny the pass with a hand in the passing lane to the ball; on the back-cut, open and race the cutter to the rim.'],
  ['Hedge and Recover', 'hedge', 2, 'Step out wide on the screen to stop the dribbler, then sprint back to your cone.'],
  ['Show and Recover', 'show', 1, 'Show high on the screen for two slides, then recover to your cone at the elbow.'],
  ['Low Man Rotation', 'low-man', 2, 'Rotate from the weak-side block to stop the drive at the rim, square and still.'],
  ['Front the Post', 'front-post', 1, 'Step around in front of the post partner, a hand up in the passing lane.'],
  ['Three-Quarter Post Denial', 'three-quarter', 1, 'Sit on the high side of the post partner with a hand in the passing lane.'],
  ['Post Position Battle', 'post-battle', 1, 'Hold your spot in front of the block against the partner\'s push, low and wide.'],
  ['Sprint Back and Turn', 'sprint-back', 0, 'Sprint back past half court, then turn and find the ball in a stance.'],
  ['Backpedal to Sprint Back', 'backpedal-sprint', 1, 'Backpedal to the cone watching the ball, then turn and sprint to the paint.'],
  ['Stop the Ball in Transition', 'stop-ball', 2, 'Sprint back ahead of the dribbler and turn them before half court.', 'partner'],
  ['Box-Out from Help Side', 'box-help', 1, 'On the shot, find the partner from help side, turn and hold them off the rim.'],
  ['Box-Out and Outlet', 'box-outlet', 1, 'Hold the box-out, chase the miss, then turn and throw the outlet to the sideline.'],
  ['Crash and Box Rebounding', 'crash-box', 1, 'Crash to the rim on the shot, find a body, and hold your spot to the ball.'],
  ['Rebound Pursuit Drill', 'pursuit', 1, 'Chase every miss off the rim and catch it at its highest point.'],
  ['Box-Out Hold vs Push', 'box-hold', 0, 'Sit low and wide on the spot and hold it against the partner\'s push for the count.', 'partner'],
  ['Offensive Rebound Swim Move', 'swim', 1, 'Swim the arm over the partner\'s box-out and get a foot to the rim first.', 'partner'],
];

// ── passing: pass × context ───────────────────────────────────────────────────────────────────────────────────────

const PASSES: readonly [string, string, number, string, ('partner' | 'move' | 'dribble')[]][] = [
  ['Chest Pass', 'chest', 0, 'Step toward the target and snap the ball to the partner\'s chest, thumbs ending down.', ['partner', 'move', 'dribble']],
  ['Bounce Pass', 'bounce', 0, 'Bounce the ball two-thirds of the way to the partner so it arrives at the waist.', ['partner', 'move', 'dribble']],
  ['Overhead Pass', 'overhead', 0, 'Ball above the forehead, step and snap it to the partner\'s hands.', ['partner', 'move']],
  ['Wrap-Around Pass', 'wrap', 1, 'Step around the cone and pass the ball past it to the partner, low and quick.', ['partner', 'dribble']],
  ['Skip Pass', 'skip', 1, 'Throw the ball across the floor over the cone to the far partner, on a line.', ['partner', 'dribble']],
  ['Baseball Pass', 'baseball', 1, 'One hand behind the ball, step and throw it long to the partner\'s outside hand.', ['partner', 'dribble']],
  ['Behind-the-Back Pass', 'behind', 2, 'Wrap the ball behind the belt line and flick it to the partner\'s hands.', ['partner', 'move', 'dribble']],
  ['Pocket Pass', 'pocket', 2, 'Slip a quick bounce pass low between the cones into the partner\'s pocket.', ['partner', 'dribble']],
  ['Lob Pass', 'lob', 1, 'Loft the ball high to the target over the reach of the cone, soft on the catch.', ['partner', 'dribble']],
  ['Hook Pass', 'hook', 2, 'Shoulder to the cone, swing the ball high over the top to the partner.', ['partner', 'move']],
  ['Kick-Out Pass', 'kick-out', 1, 'Drive two dribbles at the cone, then pass out to the partner on the arc, on a line.', ['dribble']],
];
function passingVariants(): Variant[] {
  const out: Variant[] = [];
  for (const [label, k, l, cue, ctx] of PASSES) {
    const base = ctx.includes('partner') ? key(k, 'partner') : null;
    for (const c of ctx) {
      const name = c === 'partner' ? `Partner ${label}` : c === 'move' ? `${label} on the Move` : `${label} off the Dribble`;
      out.push(va(name, key(k, c), c === 'partner' ? l : l + 1, {
        cue, ladder: k, ...(base && c !== 'partner' ? { base } : {}),
        ...(c === 'move' ? { setup: 'Two players run down the floor a few metres apart, passing back and forth.', dosage: meters(3, 28, 30) } : {}),
        ...(c === 'dribble' ? { setup: 'Dribble at a cone; a partner waits on the arc to receive the pass.' } : {}),
      }));
    }
  }
  return out;
}

// ── spot shooting by spot × side × range, shooting footwork, full-court and rebounding drills ─────────────────────

const SPOT_SHOTS: readonly [string, string, boolean, boolean][] = [
  // spot, key, has sides, has a three
  ['Corner', 'corner', true, true], ['Wing', 'wing', true, true], ['Slot', 'slot', true, true], ['Top', 'top', false, true],
  ['Elbow', 'elbow', true, false], ['Short Corner', 'short-corner', true, false], ['Block Bank Shot', 'block', true, false],
];
function spotShootingVariants(): Variant[] {
  const out: Variant[] = [];
  for (const [spot, sk, sided, three] of SPOT_SHOTS) {
    const sides: [string, string][] = sided ? [['Left ', 'left'], ['Right ', 'right']] : [['', 'centre']];
    const ranges: [string, string][] = three ? [['Mid-Range', 'mid'], ['Three', 'three']] : [['', 'mid']];
    for (const [side, dk] of sides) for (const [range, rk] of ranges) {
      const label = `${side}${spot}${range ? ` ${range}` : ''}`.trim();
      const v = key(sk, dk, rk);
      out.push(va(`Spin-Out Shooting, ${label}`, v, rk === 'three' ? 1 : 0, {
        cue: 'Spin the ball out in front, catch it on the hop square to the target, and rise.', setup: `Stand at the ${label.toLowerCase()} spot with the ball.`, ladder: sk,
      }));
      out.push(va(`Catch-and-Shoot from a Pass, ${label}`, key(v, 'pass'), rk === 'three' ? 1 : 0, {
        base: v, ladder: sk, cue: 'Hands ready as a target, catch square to the target, and rise in one motion.', setup: `Stand at the ${label.toLowerCase()} spot; a partner passes from the top or the paint.`,
      }));
    }
  }
  return out;
}
const SHOT_FOOTWORK: readonly [string, string, number, string][] = [
  ['Hop into Shot Footwork', 'hop', 0, 'Hop onto both feet at once, quiet, square to the target, and rise.'],
  ['One-Two Step into Shot Footwork', 'one-two', 0, 'Step one-two into the spot, square to the target, and rise.'],
  ['Turn-and-Face into Shot', 'turn-face', 1, 'Catch with your back to the target, pivot to face it, and rise.'],
  ['Sprint to Spot and Set', 'sprint-set', 1, 'Sprint to the spot, stop on two feet square to the target, and set the shot.'],
  ['Pivot into Shot off the Catch', 'pivot-catch', 1, 'Catch, pivot square to the target on the inside foot, and rise.'],
  ['Step-In Footwork', 'step-in', 0, 'Start a step behind the spot, step in square to the target, and rise.'],
  ['Shot Fake, Step-Through Footwork', 'fake-through', 1, 'Ball fake up, step through past the cone, and finish the shot off one dribble.'],
  ['Relocate and Set', 'relocate-set', 1, 'Pass, slide one spot along the arc, set square to the target, and catch.'],
];
const FULL_COURT: readonly [string, string, number, string, Partial<Variant>?][] = [
  ['Full-Court Weak-Hand Speed Dribble to Layup', 'weak-speed', 1, 'Push the ball ahead with the weaker hand the whole way, then finish with it.'],
  ['Two-Ball Full-Court Dribble', 'two-ball', 2, 'Speed dribble both balls down the floor and back, both hitting the floor hard.'],
  ['Full-Court Zig-Zag to Layup', 'zig-zag-layup', 1, 'Change hands at every cone down the floor, then attack the rim and finish.', { equipment: ['basketball', 'hoop', 'cone'] }],
  ['Full-Court Retreat Dribble Series', 'retreat-series', 1, 'Attack each cone, two retreat dribbles, cross, and go to the next.', { equipment: ['basketball', 'cone'] }],
  ['Coast-to-Coast Euro Step Layup', 'coast-euro', 2, 'Push the ball the length of the floor and finish with a long euro step.'],
  ['Full-Court Change-of-Pace Dribble', 'change-pace', 1, 'Slow to each line on the floor, then burst past it: slow, fast, slow, fast.'],
];
const REBOUND: readonly [string, string, number, string][] = [
  ['Rebound, Chin and Pivot', 'chin-pivot', 0, 'Catch the ball at its highest point, bring it to the chin, and pivot away from the cone.'],
  ['Rebound and Two-Foot Put-Back', 'two-foot-putback', 1, 'Catch the miss, land quiet on the floor, and go straight back up to the glass.'],
  ['Rebound and Outlet off the Glass', 'outlet-glass', 1, 'Toss the ball off the glass, rebound it high, and pivot to throw the outlet.'],
  ['Off-Hand Tip Drill', 'tip-off', 1, 'Tip the ball off the glass with the weaker hand, again and again, at the top.'],
  ['Crash and Tip-Out', 'tip-out', 1, 'Crash to the rim on the shot and tip the ball out toward the partner on the arc.'],
];

// ── the families ──────────────────────────────────────────────────────────────────────────────────────────────────

const BB = { sport: ['basketball'] as Family['sport'], youthOk: true, batch: BATCH };

export const LATER_BASKETBALL: Family[] = [
  {
    ...BB, family: 'handle-combo', block: 'basketball-combos', category: 'sport-skill', pattern: 'other', plane: 'multi', laterality: 'bilateral', skillLayer: 'wake-up', braceMode: 'reflex',
    primary: ['forearms', 'delts'], secondary: ['quads', 'deep-core', 'calves'], goals: ['handles'], lowLoad: ['back', 'knee'], equipment: ['basketball'], clip: 'dribble',
    setup: 'Athletic stance, knees bent, ball in one hand, eyes up on a target on the wall.',
    cues: [LOW, EYES, 'Every move ends low and balanced, ready for the next one.'],
    faults: [
      { fault: 'Watching the ball through the moves', fix: 'Eyes up on the target on the wall; feel the ball, do not look at it.' },
      { fault: 'Moves get high and loose', fix: 'Keep every bounce below the knee, hard into the floor.' },
      { fault: 'Rushing the chain and losing the ball', fix: 'Slow the whole combo down until every bounce is clean, then speed it up.' },
    ],
    dosage: secs(3, 30, 20), variants: comboVariants(),
  },
  {
    ...BB, family: 'one-hand-dribble', block: 'basketball-handles-2', category: 'sport-skill', pattern: 'other', plane: 'multi', laterality: 'unilateral', skillLayer: 'wake-up', braceMode: 'reflex',
    primary: ['forearms'], secondary: ['delts', 'quads'], goals: ['handles'], lowLoad: ['back', 'knee'], equipment: ['basketball'], clip: 'dribble',
    setup: 'Athletic stance, knees bent, ball in one hand at the side, eyes up.',
    cues: [EYES, 'Push the ball with the finger pads, not the palm.', LOW],
    faults: [
      { fault: 'Slapping the ball with a flat palm', fix: 'Push the ball with the finger pads and ride it on the way up.' },
      { fault: 'The free hand hanging loose', fix: 'Hold the free arm up as a bar between the ball and the cone.' },
    ],
    dosage: secs(3, 30, 20), variants: oneHandVariants(),
  },
  {
    ...BB, family: 'two-ball-handling', block: 'basketball-handles-2', category: 'sport-skill', pattern: 'other', plane: 'multi', laterality: 'bilateral', skillLayer: 'wake-up', braceMode: 'reflex',
    primary: ['forearms'], secondary: ['delts', 'quads'], goals: ['handles'], lowLoad: ['back', 'knee'], equipment: ['basketball'], clip: 'dribble',
    setup: 'A ball in each hand, athletic stance, eyes up.',
    cues: [EYES, 'Both balls hit the floor hard and low.', 'Lose a ball, pick it up and restart the count: clean beats fast.'],
    faults: [
      { fault: 'The weaker hand\'s ball drifting away', fix: 'Slow the beat until the weaker hand\'s ball stays under the hand on the floor.' },
      { fault: 'Watching the balls', fix: 'Eyes up on the target on the wall the whole set.' },
    ],
    dosage: secs(3, 30, 30), variants: twoBallVariants(),
  },
  {
    ...BB, family: 'finish-series', block: 'basketball-finishing-2', category: 'sport-skill', pattern: 'locomotion', plane: 'multi', laterality: 'unilateral', skillLayer: 'jump-land', braceMode: 'reflex',
    primary: ['quads', 'calves', 'glutes'], secondary: ['delts', 'deep-core'], goals: ['finishing'], lowLoad: ['back'], equipment: ['basketball', 'hoop'], clip: 'layup',
    setup: 'Start on the wing with the ball, a cone at the elbow.',
    cues: ['Protect the ball with the off arm, the ball high and away.', 'Land quiet and balanced under the basket.', 'Work both sides: right hand on the right, left hand on the left.'],
    faults: [
      { fault: 'Ball carried low and loose', fix: 'Carry the ball high, chin to forehead, away from the reach.' },
      { fault: 'Drifting under the rim on the take-off', fix: 'Leave the floor a step earlier so you rise up to the target.' },
      { fault: 'Landing off balance', fix: 'Land on two feet, quiet and balanced, ready to go again.' },
    ],
    dosage: reps(3, '5 each side', 30), variants: finishVariants(),
  },
  {
    ...BB, family: 'pull-up-shooting', block: 'basketball-shooting-2', category: 'sport-skill', pattern: 'push', plane: 'sagittal', laterality: 'unilateral', skillLayer: 'speed', braceMode: 'reflex',
    primary: ['quads', 'triceps', 'delts'], secondary: ['calves', 'forearms', 'deep-core'], goals: ['shooting', 'handles'], lowLoad: ['back'], equipment: ['basketball', 'hoop'], clip: 'shoot',
    setup: 'Start a step beyond the shooting spot, ball in triple threat.',
    cues: ['Stop on two feet, square to the rim, then rise straight up.', 'Release at the top and hold the follow-through to the target.', 'Land on the spot you left from, quiet.'],
    faults: [
      { fault: 'Drifting forward or sideways on the shot', fix: 'Stop square and rise straight up; land on the spot you left from.' },
      { fault: 'Picking the ball up high and slow', fix: 'Pick the ball up low and bring it straight up into the shot in one path.' },
    ],
    dosage: reps(3, '5 makes', 30), variants: pullUpVariants(),
  },
  {
    ...BB, family: 'catch-and-shoot-cuts', block: 'basketball-shooting-2', category: 'sport-skill', pattern: 'push', plane: 'sagittal', laterality: 'unilateral', skillLayer: 'speed', braceMode: 'reflex',
    primary: ['quads', 'triceps', 'delts'], secondary: ['calves', 'forearms'], goals: ['shooting'], lowLoad: ['back'], equipment: ['basketball', 'hoop', 'cone'], clip: 'shoot',
    setup: 'A partner or coach passes from the top; start the cut below the shooting spot.',
    cues: ['Hands ready as a target before the ball arrives.', 'Catch on the spot already set, square to the target.', 'Release at the top and hold the follow-through to the target.'],
    faults: [
      { fault: 'Catching flat-footed and late', fix: 'Arrive on the spot a beat early, hands ready as a target.' },
      { fault: 'Shot drifting off line', fix: 'Square the feet to the rim on the catch and rise straight up.' },
    ],
    dosage: reps(3, '5 makes', 30), variants: catchAndShootVariants(),
  },
  {
    ...BB, family: 'post-moves', block: 'basketball-footwork-2', category: 'sport-skill', pattern: 'locomotion', plane: 'multi', laterality: 'alternating', skillLayer: 'speed', braceMode: 'reflex',
    primary: ['quads', 'glutes'], secondary: ['calves', 'adductors', 'deep-core'], goals: ['footwork', 'finishing'], lowLoad: ['back'], equipment: ['basketball', 'hoop', 'cone'], clip: 'layup',
    setup: 'Back to the basket on the block, a cone behind you as the defender, ball in both hands.',
    cues: ['Glue the pivot foot to the floor and turn on the ball of it.', 'Ball high and tight to the chin through the move.', 'Finish soft off the glass.'],
    faults: [
      { fault: 'Travelling: the pivot foot slides', fix: 'Glue the pivot foot to the floor and turn on the ball of it.' },
      { fault: 'Ball held low in the traffic', fix: 'Keep the ball high and tight at the chin, away from the reach.' },
    ],
    dosage: reps(3, '5 each side', 30), variants: postVariants(),
  },
  {
    ...BB, family: 'triple-threat-series', block: 'basketball-footwork-2', category: 'sport-skill', pattern: 'locomotion', plane: 'multi', laterality: 'alternating', skillLayer: 'speed', braceMode: 'reflex',
    primary: ['quads', 'glutes', 'calves'], secondary: ['adductors', 'deep-core'], goals: ['footwork'], lowLoad: ['back'], equipment: ['basketball', 'hoop', 'cone'], clip: 'shuffle',
    setup: 'Catch on the wing in triple threat, a cone in front as the defender.',
    cues: ['Keep the ball tight to the hip, away from the cone.', 'Push the floor away from the way you want to go.', 'Every step lands quiet and balanced.'],
    faults: [
      { fault: 'Standing tall out of triple threat', fix: 'Stay low and level, like under a low ceiling.' },
      { fault: 'Ball swinging loose', fix: 'Rip the ball from hip to hip, tight and fast.' },
    ],
    dosage: reps(3, '5 each side', 30), variants: tripleVariants(),
  },
  {
    ...BB, family: 'closeout-series', block: 'basketball-defense-2', category: 'sport-skill', pattern: 'locomotion', plane: 'multi', laterality: 'alternating', skillLayer: 'speed', braceMode: 'reflex',
    primary: ['quads', 'glutes', 'calves'], secondary: ['adductors', 'glute-med', 'hamstrings'], goals: ['defense', 'agility'], lowLoad: ['back'], equipment: ['basketball'], clip: 'shuffle',
    setup: 'Start in the spot named, a partner with the ball on the arc.',
    cues: ['Sprint the first half, then chop short, quick steps on the floor.', 'Arrive low and balanced, a high hand toward the ball.', 'Stay in front: slide, never cross the feet.'],
    faults: [
      { fault: 'Flying past the shooter', fix: 'Chop short, quick steps on the floor as you arrive, low and balanced.' },
      { fault: 'Standing tall on the arrival', fix: 'Stay low and level, like under a low ceiling.' },
    ],
    dosage: reps(3, '5', 30), variants: closeoutVariants(),
  },
  {
    ...BB, family: 'defense-drills-2', block: 'basketball-defense-2', category: 'sport-skill', pattern: 'locomotion', plane: 'frontal', laterality: 'alternating', skillLayer: 'speed', braceMode: 'reflex',
    primary: ['quads', 'glutes', 'glute-med'], secondary: ['adductors', 'calves'], goals: ['defense', 'agility', 'footwork'], lowLoad: ['back'], equipment: ['cone'], clip: 'shuffle',
    setup: 'Cones set for the drill; athletic stance, feet wider than the hips.',
    cues: ['Push the floor away from the way you want to go.', 'Stay low and level, like under a low ceiling.', 'Stop square and still at every cone.'],
    faults: [
      { fault: 'Crossing the feet in the slide', fix: 'Push the floor away and step toward the cone first, never crossing.' },
      { fault: 'Bouncing up and down', fix: 'Stay low and level, like under a low ceiling.' },
    ],
    dosage: reps(3, '4', 30),
    variants: DEF_DRILLS.map(([name, v, l, cue, partner]) => va(name, v, l, { cue, ...(partner ? { equipment: ['basketball', 'cone'] } : {}) })),
  },
  {
    ...BB, family: 'passing-2', block: 'basketball-passing-2', category: 'sport-skill', pattern: 'push', plane: 'sagittal', laterality: 'bilateral', skillLayer: 'speed', braceMode: 'reflex',
    primary: ['chest', 'triceps', 'forearms'], secondary: ['delts', 'deep-core'], goals: ['handles'], lowLoad: ['back', 'knee'], equipment: ['basketball'], clip: 'throw',
    setup: 'Face a partner about 4 metres away, ball at the chest.',
    cues: ['Step toward the target as the ball leaves.', 'Pass to the partner\'s outside hand, away from the cone.', 'Snap it: the ball arrives on a line, not a loop.'],
    faults: [
      { fault: 'Floating, slow passes', fix: 'Step and snap the ball so it arrives on a line.' },
      { fault: 'Passing where the partner was, not where they go', fix: 'Lead the partner: throw to the space they are moving into.' },
    ],
    dosage: reps(3, '10', 20), variants: passingVariants(),
  },
  {
    ...BB, family: 'spot-shooting', block: 'basketball-shooting-2', category: 'sport-skill', pattern: 'push', plane: 'sagittal', laterality: 'unilateral', skillLayer: 'speed', braceMode: 'reflex',
    primary: ['quads', 'triceps', 'delts'], secondary: ['calves', 'forearms'], goals: ['shooting'], lowLoad: ['back'], equipment: ['basketball', 'hoop'], clip: 'shoot',
    setup: 'Stand at the spot with the ball.',
    cues: ['Square to the target on the catch, then rise straight up.', 'Release at the top and hold the follow-through to the target.', 'Land on the spot you left from, quiet.'],
    faults: [
      { fault: 'Drifting forward or sideways', fix: 'Rise straight up and land on the spot you left from.' },
      { fault: 'A slow, low catch', fix: 'Catch the ball high and ready, square to the target, and go.' },
    ],
    dosage: reps(3, '5 makes', 30), variants: spotShootingVariants(),
  },
  {
    ...BB, family: 'shooting-footwork', block: 'basketball-shooting-2', category: 'sport-skill', pattern: 'locomotion', plane: 'multi', laterality: 'bilateral', skillLayer: 'speed', braceMode: 'reflex',
    primary: ['quads', 'calves'], secondary: ['glutes', 'adductors'], goals: ['shooting', 'footwork'], lowLoad: ['back'], equipment: ['basketball', 'hoop'], clip: 'shoot',
    setup: 'Start a step or two from the shooting spot, ball in hand or a partner passing.',
    cues: ['Arrive square to the target, quiet on the floor.', 'Same footwork every rep, then the same rise.', 'Slow and clean first, then game speed.'],
    faults: [
      { fault: 'Arriving off balance', fix: 'Slow the footwork until you land square and still, then speed it up.' },
    ],
    dosage: reps(3, '8', 30), variants: SHOT_FOOTWORK.map(([name, k, l, cue]) => va(name, k, l, { cue })),
  },
  {
    ...BB, family: 'full-court-handles', block: 'basketball-handles-2', category: 'sport-skill', pattern: 'locomotion', plane: 'sagittal', laterality: 'alternating', skillLayer: 'speed', braceMode: 'reflex',
    primary: ['quads', 'calves', 'forearms'], secondary: ['glutes', 'delts'], goals: ['handles', 'conditioning'], lowLoad: ['back'], equipment: ['basketball', 'hoop'], clip: 'dribble',
    setup: 'Start on the baseline with the ball.',
    cues: ['Push the ball out ahead and run to it.', 'Eyes up the floor, not on the ball.', 'Finish under control: speed you can stop.'],
    faults: [
      { fault: 'Ball too close, slowing the run', fix: 'Push the ball further ahead and run onto it.' },
    ],
    dosage: reps(4, '1 length', 45), variants: FULL_COURT.map(([name, k, l, cue, over]) => va(name, k, l, { cue, ...(over ?? {}) })),
  },
  {
    ...BB, family: 'rebounding-2', block: 'basketball-finishing-2', category: 'sport-skill', pattern: 'locomotion', plane: 'sagittal', laterality: 'bilateral', skillLayer: 'jump-land', braceMode: 'reflex',
    primary: ['quads', 'calves', 'glutes'], secondary: ['forearms', 'delts'], goals: ['finishing', 'vertical'], lowLoad: ['back'], equipment: ['basketball', 'hoop'], clip: 'jump',
    setup: 'Stand under the basket with the ball.',
    cues: ['Catch the ball at its highest point.', 'Land on two feet, quiet and balanced.', 'Ball to the chin, away from the reach.'],
    faults: [
      { fault: 'Waiting for the ball to come down', fix: 'Go up and catch it at its highest point.' },
    ],
    dosage: reps(3, '8', 30), variants: REBOUND.map(([name, k, l, cue]) => va(name, k, l, { cue })),
  },
];
