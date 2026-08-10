// node --experimental-strip-types --import ./tools/ts_resolve.mjs \
//   --import ./tools/fel_batch_alias.mjs tests/camera_framing_test.ts
//
// The assertions that matter here are about CONSEQUENCES: can a player read a
// tell, and does fixing the canvas alone get there. Asserting that the
// arithmetic is arithmetic would prove nothing.

import {
  fractionAtDistance, distanceForFraction, gradeFraming, tellPixels, canReadTells,
  recommend, unreadableModes, MEASURED,
  READABLE_MIN, TARGET_FRACTION, TOO_CLOSE, MIN_TELL_CSS_PX,
} from '../lib/babylon/core/CameraFraming';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, x = '') => { c ? (pass++, console.log(`  ok   ${n}`)) : (fail++, console.log(`  FAIL ${n} ${x}`)); };

// Canvas heights measured in M95, before and after the aspect-ratio fix.
const PHONE_BEFORE = 232;
const PHONE_AFTER = 556;
const DESKTOP = 728;

// ══ THE MODEL MATCHES THE MEASUREMENT ════════════════════════════════════
{
  // If the arithmetic disagreed with the probe, the recommendations would be
  // fiction. Pitch is unknown per camera, so the ideal model overestimates —
  // it must be close, and it must overestimate rather than under.
  for (const m of MEASURED.filter((x) => x.distanceM !== null)) {
    const predicted = fractionAtDistance({
      heightM: m.heightM, fovRad: m.fovRad, distanceM: m.distanceM as number,
    });
    const ratio = m.measured / predicted;
    ok(`model matches the probe within 20% on ${m.mode}`, ratio > 0.8 && ratio <= 1.0,
      `predicted ${predicted.toFixed(4)} vs measured ${m.measured} (ratio ${ratio.toFixed(3)})`);
  }
  // Round trip.
  const d = distanceForFraction({ heightM: 1.72, fovRad: 0.8, fraction: 0.22 });
  const back = fractionAtDistance({ heightM: 1.72, fovRad: 0.8, distanceM: d });
  ok('distance and fraction are inverses of each other', Math.abs(back - 0.22) < 1e-9);
  ok('and a wider FOV needs a closer camera for the same size',
    distanceForFraction({ heightM: 1.72, fovRad: 1.2, fraction: 0.22 })
    < distanceForFraction({ heightM: 1.72, fovRad: 0.6, fraction: 0.22 }));
}

// ══ THE FINDING ══════════════════════════════════════════════════════════
{
  const bad = MEASURED.filter((m) => gradeFraming(m.measured) === 'unreadable');
  ok('SIX OF EIGHT MODES ARE UNREADABLE TODAY', bad.length === 6, `${bad.length}`);
  ok('and karate-vs is the one that is right', gradeFraming(0.344) === 'good');
  ok('and baseball is too close, not too far', gradeFraming(1.316) === 'too_close');

  // The number that reframed four batches of diagnosis.
  const dunk = MEASURED.find((m) => m.mode === 'dunk')!;
  ok('dunk renders the player at 60 CSS px on a desktop',
    Math.round(dunk.measured * DESKTOP) === 60, `${Math.round(dunk.measured * DESKTOP)}`);
  ok('AND AT 19 CSS PX ON A PRE-M95 PHONE — the actual player experience',
    Math.round(dunk.measured * PHONE_BEFORE) === 19, `${Math.round(dunk.measured * PHONE_BEFORE)}`);
}

// ══ WHY M95 IS NOT ENOUGH ON ITS OWN ═════════════════════════════════════
{
  const dunk = MEASURED.find((m) => m.mode === 'dunk')!;

  ok('a tell is unreadable on a phone before M95',
    !canReadTells(dunk.measured, PHONE_BEFORE),
    `${tellPixels(dunk.measured, PHONE_BEFORE).toFixed(1)}px`);
  ok('M95 QUADRUPLES THE CANVAS AND THE TELL IS STILL UNREADABLE',
    !canReadTells(dunk.measured, PHONE_AFTER),
    `${tellPixels(dunk.measured, PHONE_AFTER).toFixed(1)}px vs ${MIN_TELL_CSS_PX} needed`);
  ok('and it is still unreadable on a full desktop canvas',
    !canReadTells(dunk.measured, DESKTOP),
    `${tellPixels(dunk.measured, DESKTOP).toFixed(1)}px`);

  // Both together clear it, which is the actual recommendation.
  ok('CANVAS + FRAMING TOGETHER CLEAR IT ON A PHONE',
    canReadTells(TARGET_FRACTION, PHONE_AFTER),
    `${tellPixels(TARGET_FRACTION, PHONE_AFTER).toFixed(1)}px`);
  ok('and framing alone clears it on a desktop', canReadTells(TARGET_FRACTION, DESKTOP));

  // The honest edge: target framing on the OLD phone canvas is marginal, so
  // the two fixes are not interchangeable and M95 is not optional.
  ok('but framing alone does NOT clear it on the pre-M95 phone canvas — the two fixes multiply',
    !canReadTells(TARGET_FRACTION, PHONE_BEFORE),
    `${tellPixels(TARGET_FRACTION, PHONE_BEFORE).toFixed(1)}px`);
}

// ══ THE RECOMMENDATIONS ARE ACTIONABLE ═══════════════════════════════════
{
  const dunk = recommend(MEASURED.find((m) => m.mode === 'dunk')!);
  ok('dunk gets a concrete distance, not an adjective', dunk.recommendedDistanceM !== null);
  ok('and it is closer than today', (dunk.recommendedDistanceM as number) < 18.44);
  ok('by a factor a person can act on', (dunk.closerBy as number) > 2 && (dunk.closerBy as number) < 4,
    `${dunk.closerBy}x`);
  ok('and applying it lands on the target, not near it', (() => {
    const m = MEASURED.find((x) => x.mode === 'dunk')!;
    // measured fraction scales inversely with distance
    const after = m.measured * (m.distanceM as number) / (dunk.recommendedDistanceM as number);
    return Math.abs(after - TARGET_FRACTION) < 0.005;
  })());

  const tennis = recommend(MEASURED.find((m) => m.mode === 'tennis')!);
  ok('TENNIS IS THE WORST — 33m from a 1.7m player', (tennis.currentDistanceM as number) > 30);
  ok('and it needs to come in more than four times closer',
    (tennis.closerBy as number) > 4, `${tennis.closerBy}x`);

  // A mode already framed well must not be dragged in by a blanket rule.
  const kvs = recommend(MEASURED.find((m) => m.mode === 'karate-vs')!);
  ok('karate-vs is already good and is barely moved', kvs.grade === 'good'
    && Math.abs((kvs.closerBy as number) - 1) < 0.6, `${kvs.closerBy}x`);
}

// ══ THE GRADES MEAN SOMETHING ════════════════════════════════════════════
{
  ok('the boundaries are ordered', READABLE_MIN < TARGET_FRACTION && TARGET_FRACTION < TOO_CLOSE);
  ok('just under the floor is unreadable', gradeFraming(READABLE_MIN - 0.001) === 'unreadable');
  ok('just over it is tight, not good — the floor is a floor',
    gradeFraming(READABLE_MIN + 0.001) === 'tight');
  ok('the target itself grades good', gradeFraming(TARGET_FRACTION) === 'good');

  // The floor has to be a real threshold: a character AT the floor on the
  // smallest canvas we ship must still carry a tell, or the floor is decoration.
  ok('THE FLOOR IS CALIBRATED — a mode at exactly READABLE_MIN can show a tell on a post-M95 phone',
    canReadTells(READABLE_MIN, PHONE_AFTER),
    `${tellPixels(READABLE_MIN, PHONE_AFTER).toFixed(1)}px`);

  ok('unreadableModes reports worst first', (() => {
    const u = unreadableModes(PHONE_AFTER);
    return u.length > 1 && u[0].measured <= u[1].measured && u[0].mode === 'tennis';
  })());
  // The first version of this assertion claimed a huge canvas could not rescue
  // the worst modes. It can — 2160px clears every one of them. The true and
  // useful statement is how big "huge" has to be.
  ok('RESCUING TENNIS BY CANVAS ALONE NEEDS A CANVAS NO DEVICE HAS', (() => {
    const tennis = MEASURED.find((m) => m.mode === 'tennis')!;
    const needed = MIN_TELL_CSS_PX / (tennis.measured / 3);
    // A 15" laptop is about 900 CSS px tall; a phone in portrait, under 700.
    return needed > 1400 && unreadableModes(2160).length === 0;
  })(), (() => {
    const t = MEASURED.find((m) => m.mode === 'tennis')!;
    return `${Math.round(MIN_TELL_CSS_PX / (t.measured / 3))}px of canvas height`;
  })());
  ok('which is why the camera is the fix and the canvas is the multiplier',
    unreadableModes(PHONE_AFTER).length > unreadableModes(2160).length);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
