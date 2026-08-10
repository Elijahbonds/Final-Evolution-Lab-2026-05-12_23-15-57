// node --experimental-strip-types --import ./tools/ts_resolve.mjs \
//   --import ./tools/fel_batch_alias.mjs tests/camera_presets_test.ts
//
// These assertions guard the two things that would quietly waste someone's
// afternoon: applying a preset that gets clamped, and applying a preset to a
// camera that overwrites it every frame.

import {
  PRESETS, TARGET_FRACTION, HARD_RADIUS_FLOOR,
  presetFor, planFor, actionable, blocked, magnification,
} from '../lib/babylon/core/cameraPresets';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, x = '') => { c ? (pass++, console.log(`  ok   ${n}`)) : (fail++, console.log(`  FAIL ${n} ${x}`)); };

// ══ THE MEASUREMENTS ARE REAL ════════════════════════════════════════════
{
  const verified = Object.entries(PRESETS).filter(([, p]) => p.verified);
  ok('FOUR MODES ARE VERIFIED — applied on the live build and measured after',
    verified.length === 4, `${verified.length}`);
  for (const [mode, p] of verified) {
    ok(`${mode} landed within 2 points of target`,
      Math.abs((p.fractionAfter as number) - TARGET_FRACTION) < 0.02,
      `${((p.fractionAfter as number) * 100).toFixed(1)}%`);
    ok(`  and it started unreadable`, p.fractionBefore < 0.15);
  }
  ok('every verified preset moved the camera CLOSER',
    verified.every(([, p]) => (p.radius as number) < (p.radiusBefore as number)));

  // The number that communicates it: threevthree is 3.6x bigger.
  ok('threevthree magnifies the character 3.6x', magnification('threevthree') === 3.64,
    `${magnification('threevthree')}`);
  ok('and every verified mode at least doubles it',
    verified.every(([m]) => (magnification(m) ?? 0) >= 2));
}

// ══ THE CLAMP ════════════════════════════════════════════════════════════
{
  // tennis and volleyball need radius 2.51 against a hard floor of 3. Applying
  // them without lowering the limit does nothing at all, silently — the exact
  // failure shape that let CameraStandoff go six batches unnoticed.
  for (const mode of ['tennis', 'volleyball']) {
    const p = presetFor(mode)!;
    ok(`${mode} needs to go below the hard floor`, (p.radius as number) < HARD_RADIUS_FLOOR);
    const plan = planFor(mode);
    ok(`  and planFor REFUSES rather than silently failing`, plan.applied === false);
    ok(`  and the reason names lowerRadiusLimit and what to set it to`,
      /lowerRadiusLimit/.test((plan as { reason: string }).reason)
      && /2\.5/.test((plan as { reason: string }).reason));
    ok(`  and says the setting would be silently clamped`,
      /silently clamped/.test((plan as { reason: string }).reason));
  }
  ok('their measured result stalled below target, which is the evidence for the clamp',
    (presetFor('tennis')!.fractionAfter as number) < 0.19
    && (presetFor('volleyball')!.fractionAfter as number) < 0.19);
}

// ══ THE SIX MODES NO VALUE CAN FIX ═══════════════════════════════════════
{
  const controller = Object.entries(PRESETS).filter(([, p]) => p.controllerChangeRequired);
  ok('FIVE MODES NEED A CONTROLLER CHANGE, not a value', controller.length === 5,
    `${controller.length}: ${controller.map(([m]) => m).join(',')}`);
  ok('and every one of them is a TargetCamera',
    controller.every(([, p]) => p.type === 'TargetCamera'));
  for (const [mode] of controller) {
    const plan = planFor(mode);
    ok(`${mode} refuses with the controller reason`, plan.applied === false
      && /rewritten every frame/.test((plan as { reason: string }).reason));
  }
  ok('baseball is flagged TOO CLOSE, not too far — a blanket rule would break it',
    (presetFor('baseball')!.fractionBefore) > 0.45);
}

// ══ THE MODE THAT MUST NOT BE TOUCHED ════════════════════════════════════
{
  const kvs = presetFor('karate-vs')!;
  ok('karate-vs is marked leaveAlone', kvs.leaveAlone === true);
  ok('and it is genuinely already good', kvs.fractionBefore > 0.22 && kvs.fractionBefore < 0.45);
  ok('and planFor says so instead of moving it',
    planFor('karate-vs').applied === false
    && /leave it alone/.test((planFor('karate-vs') as { reason: string }).reason));
  ok('and it does not appear in blocked() as work to do',
    !blocked().some((b) => b.mode === 'karate-vs'));
}

// ══ WHAT CAN ACTUALLY BE DONE TODAY ══════════════════════════════════════
{
  const can = actionable();
  ok('FOUR MODES CAN BE FIXED BY SETTING ONE NUMBER', can.length === 4, can.join(','));
  ok('and they are the four verified ones',
    can.every((m) => PRESETS[m].verified));
  ok('the rest are reported as blocked WITH a reason each', blocked().length === 7,
    `${blocked().length}`);
  ok('and no blocked entry has an empty reason',
    blocked().every((b) => b.reason.length > 20));
  ok('an unknown mode is refused rather than guessed at',
    planFor('who_scene_it').applied === false);
}

// ══ THE DATA ITSELF ══════════════════════════════════════════════════════
{
  ok('the target is 22% of frame height', TARGET_FRACTION === 0.22);
  ok('the hard floor matches what Babylon clamps to', HARD_RADIUS_FLOOR === 3);
  ok('every preset records what it measured BEFORE, so the claim is checkable',
    Object.values(PRESETS).every((p) => typeof p.fractionBefore === 'number' && p.fractionBefore > 0));
  ok('nothing is marked verified without an after-measurement',
    Object.values(PRESETS).every((p) => !p.verified || typeof p.fractionAfter === 'number'));
  ok('and nothing claims to be verified that was blocked',
    Object.values(PRESETS).every((p) => !p.verified || !p.controllerChangeRequired));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
