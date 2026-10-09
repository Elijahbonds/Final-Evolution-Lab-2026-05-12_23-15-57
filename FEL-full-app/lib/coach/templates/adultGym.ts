// lib/coach/templates/adultGym.ts — MIRROR-COACH P8 (2026-09-29): FEL's two adult full-gym templates, 3 and 4 days a
// week: barbells, a trap bar, dumbbells, kettlebells, a cable stack, a pull-up bar and band, a bench and a box to step
// onto. Every week trains all six patterns and pulls at least as many sets as it presses (templates/index.test.ts, with
// P2's own checks).
//
// MIRROR-COACH P8 FIX (2026-09-30, code review + an owner-decision conflict it raised):
//   · NO BOX JUMP. Both templates opened Monday with Box Jump and Stick from week 1, against the owner's own Playbook ch6
//     (two to four weeks of pogo base before high boxes or depth jumps; the builder had flagged it as an assumption).
//     The owner's guidance wins: adult-gym-3's Monday opens with the owner's pogo hops (3 × 20 contacts, ch6), and
//     adult-gym-4's Monday — whose Thursday already holds the pogos — with the countermovement jump, which needs no box.
//     A jump never climbs a wave (./index.ts expandTemplate), so no template reaches a box: Box Jump and Stick stays on
//     the vertical-jump ladder as the countermovement jump's harder version, a coach's call. Flagged for the owner.
//   · THE EQUIPMENT LINES NAME EVERYTHING THE WEEKS USE. adult-gym-3's left out the trap bar (Wednesday's key lift from
//     week 1) and the pull-up bar and band its pulldown steps up to in waves 2–3, and both said "a low plyo box" for a
//     box only the step-ups use. templates/index.test.ts now holds every template's line against the catalogue
//     equipment of every item in every wave it writes.
//
// Loads are not written: the effort band is the dose (lib/coach/taxonomy.ts EFFORT_BANDS — "Drive: 3–4 reps left"), so
// the same template fits a first-year lifter and a strong one, and the athlete picks the weight that reads as the band.
// One jump opens each lower day, in Prime, behind the protocol gate (P8 rule (b)). FEL's own programming and doses.
import type { ProgramTemplate } from './types';

export const ADULT_GYM_3: ProgramTemplate = {
  id: 'adult-gym-3',
  name: '3 days a week · full gym',
  summary: 'Three full-body days built around a squat, a deadlift and a split squat. A jump or hop to open each day.',
  audience: 'adult', equipment: 'gym', kind: 'program', daysPerWeek: 3,
  equipmentLine: 'Barbell, rack and safeties, a trap bar, dumbbells, two kettlebells, a cable stack with a rope, a lat pulldown, a pull-up bar and band, a bench and a box to step onto.',
  sessions: [
    { day: 'Mon', label: 'Squat', items: [
      { exercise: 'pogo-hops', section: 'prime', sets: 3, reps: '20 contacts', restSeconds: 60, setupCues: ['quiet-landing'] },
      { exercise: 'back-squat', section: 'key', isKeySet: true, sets: 3, reps: '5', restSeconds: 150, setupCues: ['tripod-down', 'light-punch'] },
      { exercise: 'one-arm-db-row', section: 'assist', supersetGroup: 'A', sets: 3, reps: '10 each side', restSeconds: 45, setupCues: ['elbows-to-pockets'] },
      { exercise: 'db-bench', section: 'assist', supersetGroup: 'A', sets: 3, reps: '8', restSeconds: 75, setupCues: ['floor-away'] },
      { exercise: 'barbell-rdl', section: 'assist', sets: 3, reps: '8', restSeconds: 90, setupCues: ['wall-behind'] },
      { exercise: 'db-farmer-carry', section: 'finish', sets: 2, workSeconds: 40, restSeconds: 60, setupCues: ['crush-handle', 'grow-tall'] },
    ] },
    { day: 'Wed', label: 'Hinge', items: [
      { exercise: 'lateral-bound-stick', section: 'prime', sets: 3, reps: '3 each side', restSeconds: 60, setupCues: ['stick-two'] },
      { exercise: 'trap-bar-deadlift', section: 'key', isKeySet: true, sets: 3, reps: '5', restSeconds: 150, setupCues: ['tripod-down', 'light-punch'] },
      { exercise: 'lat-pulldown', section: 'assist', supersetGroup: 'A', sets: 3, reps: '10', restSeconds: 45, setupCues: ['elbows-to-pockets'] },
      { exercise: 'db-overhead-press', section: 'assist', supersetGroup: 'A', sets: 3, reps: '8', restSeconds: 75 },
      { exercise: 'db-step-up', section: 'assist', sets: 3, reps: '8 each side', restSeconds: 60, setupCues: ['front-heel'] },
      { exercise: 'face-pull', section: 'assist', sets: 2, reps: '12', restSeconds: 45 },
      { exercise: 'db-suitcase-carry', section: 'finish', sets: 2, workSeconds: 30, reps: '30 s each side', restSeconds: 60, setupCues: ['grow-tall'] },
    ] },
    { day: 'Fri', label: 'Single leg and press', items: [
      { exercise: 'broad-jump-stick', section: 'prime', sets: 3, reps: '2 jumps', restSeconds: 60, setupCues: ['quiet-landing'] },
      { exercise: 'db-rfe-split-squat', section: 'key', isKeySet: true, sets: 3, reps: '8 each side', restSeconds: 120, setupCues: ['front-heel'] },
      { exercise: 'bb-row', section: 'assist', supersetGroup: 'A', sets: 3, reps: '8', restSeconds: 45, setupCues: ['elbows-to-pockets'] },
      { exercise: 'bb-bench', section: 'assist', supersetGroup: 'A', sets: 3, reps: '6', restSeconds: 90, setupCues: ['floor-away'] },
      { exercise: 'goblet-squat', section: 'assist', sets: 2, reps: '10', restSeconds: 60 },
      { exercise: 'pallof-press', section: 'assist', sets: 2, reps: '8 each side', restSeconds: 45 },
      { exercise: 'goblet-carry', section: 'finish', sets: 2, workSeconds: 40, restSeconds: 60, setupCues: ['grow-tall'] },
    ] },
  ],
};

export const ADULT_GYM_4: ProgramTemplate = {
  id: 'adult-gym-4',
  name: '4 days a week · full gym',
  summary: 'Lower, upper, lower, upper: a squat day, a press day, a deadlift day and a row day. A jump to open each lower day.',
  audience: 'adult', equipment: 'gym', kind: 'program', daysPerWeek: 4,
  equipmentLine: 'Barbell, rack and safeties, a trap bar, dumbbells, two kettlebells, a cable stack with a rope, a lat pulldown, a pull-up bar and band, a bench and a box to step onto.',
  sessions: [
    { day: 'Mon', label: 'Lower: squat', items: [
      { exercise: 'cmj-stick', section: 'prime', sets: 3, reps: '3 jumps', restSeconds: 60, setupCues: ['quiet-landing'] },
      { exercise: 'back-squat', section: 'key', isKeySet: true, sets: 3, reps: '5', restSeconds: 150, setupCues: ['tripod-down', 'light-punch'] },
      { exercise: 'barbell-rdl', section: 'assist', sets: 3, reps: '8', restSeconds: 90, setupCues: ['wall-behind'] },
      { exercise: 'db-step-up', section: 'assist', sets: 3, reps: '8 each side', restSeconds: 60, setupCues: ['front-heel'] },
      { exercise: 'db-farmer-carry', section: 'finish', sets: 2, workSeconds: 40, restSeconds: 60, setupCues: ['crush-handle', 'grow-tall'] },
    ] },
    { day: 'Tue', label: 'Upper: press', items: [
      { exercise: 'bb-bench', section: 'key', isKeySet: true, sets: 3, reps: '5', restSeconds: 150, setupCues: ['floor-away', 'light-punch'] },
      { exercise: 'one-arm-db-row', section: 'assist', supersetGroup: 'A', sets: 3, reps: '10 each side', restSeconds: 45, setupCues: ['elbows-to-pockets'] },
      { exercise: 'db-overhead-press', section: 'assist', supersetGroup: 'A', sets: 3, reps: '8', restSeconds: 75 },
      { exercise: 'lat-pulldown', section: 'assist', sets: 3, reps: '10', restSeconds: 60, setupCues: ['elbows-to-pockets'] },
      { exercise: 'face-pull', section: 'assist', sets: 2, reps: '12', restSeconds: 45 },
      { exercise: 'db-suitcase-carry', section: 'finish', sets: 2, workSeconds: 30, reps: '30 s each side', restSeconds: 60, setupCues: ['grow-tall'] },
    ] },
    { day: 'Thu', label: 'Lower: deadlift', items: [
      { exercise: 'pogo-hops', section: 'prime', sets: 3, reps: '20 contacts', restSeconds: 60, setupCues: ['quiet-landing'] },
      { exercise: 'trap-bar-deadlift', section: 'key', isKeySet: true, sets: 3, reps: '5', restSeconds: 150, setupCues: ['tripod-down', 'light-punch'] },
      { exercise: 'db-rfe-split-squat', section: 'assist', sets: 3, reps: '8 each side', restSeconds: 60, setupCues: ['front-heel'] },
      { exercise: 'goblet-squat', section: 'assist', sets: 2, reps: '10', restSeconds: 60 },
      { exercise: 'pallof-press', section: 'assist', sets: 2, reps: '8 each side', restSeconds: 45 },
      { exercise: 'goblet-carry', section: 'finish', sets: 2, workSeconds: 40, restSeconds: 60, setupCues: ['grow-tall'] },
    ] },
    { day: 'Fri', label: 'Upper: row', items: [
      { exercise: 'bb-row', section: 'key', isKeySet: true, sets: 3, reps: '8', restSeconds: 120, setupCues: ['elbows-to-pockets'] },
      { exercise: 'band-pull-up', section: 'assist', supersetGroup: 'A', sets: 3, reps: '6', restSeconds: 45 },
      { exercise: 'db-bench', section: 'assist', supersetGroup: 'A', sets: 3, reps: '10', restSeconds: 75, setupCues: ['floor-away'] },
      { exercise: 'face-pull', section: 'assist', sets: 2, reps: '12', restSeconds: 45 },
      { exercise: 'db-farmer-carry', section: 'finish', sets: 2, workSeconds: 40, restSeconds: 60, setupCues: ['crush-handle'] },
    ] },
  ],
};
