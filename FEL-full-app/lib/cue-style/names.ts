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
