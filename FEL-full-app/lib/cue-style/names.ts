// lib/cue-style/names.ts — CUE-REWRITE (2026-10-27): ONE name per fault and per movement, on every surface.
//
// Before this file the same knee was "Knee drifting inward on the descent" (the Mirror's squat review), "Front knee
// drifting in off the midline" (the lunge), "knee caves" (the form review), "Knees cave in" (the Quick Screen),
// "valgus" (the HUD and the docs) and "KNEES OUT — PRESS THE FLOOR APART" (the overlay). Every surface now reads its
// fault and movement words from here (lib/cue-style/corpus.test.ts checks that the review labels, the flag lines and the
// Quick Screen rows agree with this table).
//
// The keys are the detectors' own ids (what the code measures); the words are what a person reads. A name says what the
// camera saw the body do, in plain words, never a judgement ("Not deep enough", not "Bad depth").
//
// Pure data.

/** The canonical words for a thing the camera can see go wrong (title case off: they read as a sentence fragment). */
export const FAULT_NAMES = {
  kneeCave: 'Knees cave in',
  kneeCaveOne: 'Knee caves in',
  frontKneeCave: 'Front knee caves in',
  landingKneeCave: 'Knees cave in on landing',
  kneeWobble: 'Front knee wobbles',
  heelLift: 'Heels lift',
  shoulderShift: 'Shoulders shift to one side',
  weightShift: 'Weight shifts to one side',
  notDeep: 'Not deep enough',
  hipTip: 'Hips tip to one side',
  hipDrop: 'Hip drops',
  hipHike: 'Hip hikes up',
  upperBodyDrift: 'Upper body drifts',
  sideLean: 'Leans to one side',
  chestDrop: 'Chest drops forward',
  armsDrop: 'Arms drop forward',
  backBends: 'Back bends',
  kneesTooMuch: 'Knees bend too much',
  shinsForward: 'Shins tip forward',
  hipsOffLine: 'Hips sag or pike',
  handsNotUnder: 'Hands not under shoulders',
  headOffLine: 'Head pokes forward',
  elbowRises: 'Elbow rises too high',
  shrug: 'Shoulder shrugs up',
  /** The press/row reads ONE arm (the working arm), so its names say which. */
  workingElbowRises: 'Working elbow rises too high',
  workingShrug: 'Working shoulder shrugs up',
  shrugBoth: 'Shoulders shrug up',
  notAllTheWayUp: 'Arms stop short of the top',
  handsUneven: 'Hands at different heights',
  elbowsBent: 'Elbows stay bent',
  unevenSteps: 'Uneven steps',
  hipsHigh: 'Hips too high',
  hipsLow: 'Hips too low',
  shouldersBehindBar: 'Shoulders behind the bar',
  stiffLanding: 'Stiff landing',
  ankleBend: 'Ankle bend',
  sidesDiffer: 'Left and right differ',
  headForward: 'Head forward of the shoulders',
  shoulderUneven: 'One shoulder higher',
  hipUneven: 'One hip higher',
  wobblyBalance: 'Wobbly on one leg',
  ribsFlare: 'Ribs flare up',
  turnLimited: 'Turning is limited',
  footRollsIn: 'Foot rolls in',
} as const;
export type FaultName = keyof typeof FAULT_NAMES;

/** WHAT IT MEANS, per fault: the middle part of a result line (lib/cue-style/result.ts). Movement words, no cause. */
export const FAULT_MEANS: Partial<Readonly<Record<FaultName, string>>> = {
  kneeCave: 'Knees that stay over your toes are easier to control.',
  kneeCaveOne: 'Knees that stay over your toes are easier to control.',
  frontKneeCave: 'A front knee that stays over your toes is easier to control.',
  landingKneeCave: 'Landing with knees over toes is easier to control.',
  kneeWobble: 'A steady front knee keeps the rep under control.',
  heelLift: 'Heels down keeps you balanced. Often the ankles need more bend.',
  shoulderShift: 'Staying in the middle lets both sides share the work.',
  weightShift: 'Even weight lets both legs share the work.',
  hipTip: 'Level hips keep the work on the front leg.',
  upperBodyDrift: 'Staying tall keeps the work in your legs.',
  sideLean: 'Staying tall keeps the work where it belongs.',
  notDeep: 'More depth works your legs through more range.',
  backBends: 'A flat back keeps the work in your hips and legs.',
  kneesTooMuch: 'Pushing your hips back works the back of your legs, which is the point of this move.',
  shinsForward: 'Still shins keep the move in your hips.',
  hipsOffLine: 'A straight body makes the push-up work as one piece.',
  handsNotUnder: 'Hands under your shoulders gives you the strongest push.',
  headOffLine: 'A long neck keeps your head in line with your body.',
  workingElbowRises: 'A low path keeps the work in your back and arm.',
  workingShrug: 'Shoulders down keeps your neck out of the lift.',
};

/** The canonical movement names. */
export const MOVEMENT_NAMES = {
  squat: 'Squat',
  overheadSquat: 'Overhead squat',
  lunge: 'Lunge',
  hinge: 'Hip hinge',
  pushup: 'Push-up',
  pressRow: 'Press and row',
  overhead: 'Overhead reach',
  carry: 'Carry',
  setup: 'Lift set-up',
  singleLegSquat: 'Single-leg squat',
  kneeToWall: 'Knee-to-wall ankle check',
  jump: 'Jump',
  movementScreen: 'Movement Screen',
  quickScreen: 'Quick Screen',
} as const;

/** What the hip hinge is, the first time a screen names it (CUE-STYLE: a term gets its gloss on first use). */
export const HINGE_GLOSS = 'Hip hinge: push your hips back and bend at the hips, back flat.';

/** "Left knee caves in" — a one-sided fault with its side; "Both knees cave in". */
export function sided(name: string, side: 'left' | 'right' | 'both' | null | undefined): string {
  if (!side) return name;
  const lower = name.charAt(0).toLowerCase() + name.slice(1);
  if (side === 'both') {
    return 'Both ' + lower.replace(/^front knee caves in/, 'front knees cave in').replace(/^knee caves in/, 'knees cave in')
      .replace(/^knees cave in/, 'knees cave in').replace(/^front knee wobbles/, 'front knees wobble').replace(/^hip drops/, 'hips drop');
  }
  const s = side === 'left' ? 'Left' : 'Right';
  return `${s} ${lower.replace(/^knees cave in/, 'knee caves in')}`;
}

/** The one line every pain question routes to (CUE-STYLE: pain → stop, and a person). */
export const PAIN_STOP_LINE = 'If anything hurts, stop. Tell your coach or an adult, and see a health professional.';
export const PAIN_STOP_SHORT = 'If anything hurts, stop.';
