// lib/coach/templates/adultBodyweight.ts — MIRROR-COACH P8 (2026-09-29): FEL's two adult bodyweight templates, 3 and 4
// days a week. "Bodyweight" means no gym: a loaded backpack, two bags, a chair or step, a bench or sturdy table, a sturdy
// door frame and a towel — what a home has. (MIRROR-COACH P8 FIX, 2026-09-30: the line left out the bench or table the
// incline push-ups need; templates/index.test.ts holds every template's line to the equipment its weeks use.) Every week trains all six patterns (squat, hinge, lunge, push, pull, carry) and pulls at least as
// many sets as it presses; templates/index.test.ts holds both, week by week, with P2's own checks (lib/coach/coverage.ts).
//
// Each day opens with ONE jump in Prime (3 × 3 or fewer landings, or the owner's 3 × 20 pogo contacts from Playbook ch6),
// which the protocol gate swaps for its ladder's no-landing step when it is shut (P8 rule (b); lib/coach/
// templateCatalogue.ts impactFreeStepDown). The upper-body days of the 4-day template have no Prime: P6's warm-up adds
// its own primer there. FEL's own programming, doses and day names; the week-1 dose is written here and the wave
// (./waves.ts) moves it.
import type { ProgramTemplate } from './types';

export const ADULT_BW_3: ProgramTemplate = {
  id: 'adult-bw-3',
  name: '3 days a week · bodyweight',
  summary: 'Three full-body days: squat and push, single leg and pull, hinge and mix. A jump to open each day.',
  audience: 'adult', equipment: 'bodyweight', kind: 'program', daysPerWeek: 3,
  equipmentLine: 'A backpack you can load, two bags, a chair or step, a bench or sturdy table, a sturdy door frame and a towel.',
  sessions: [
    { day: 'Mon', label: 'Squat and push', items: [
      { exercise: 'cmj-stick', section: 'prime', sets: 3, reps: '3 jumps', restSeconds: 60, setupCues: ['quiet-landing'] },
      { exercise: 'backpack-hug-squat', section: 'key', isKeySet: true, sets: 3, reps: '8', restSeconds: 120, setupCues: ['tripod-down', 'knees-over-laces'] },
      { exercise: 'backpack-row', section: 'assist', supersetGroup: 'A', sets: 3, reps: '10', restSeconds: 45, setupCues: ['elbows-to-pockets'] },
      { exercise: 'push-up', section: 'assist', supersetGroup: 'A', sets: 3, reps: '8', restSeconds: 60, setupCues: ['floor-away'] },
      { exercise: 'backpack-rdl', section: 'assist', sets: 3, reps: '10', restSeconds: 60, setupCues: ['wall-behind'] },
      { exercise: 'suitcase-carry', section: 'finish', sets: 2, workSeconds: 40, reps: '40 s each side', restSeconds: 60, setupCues: ['grow-tall'] },
    ] },
    { day: 'Wed', label: 'Single leg and pull', items: [
      { exercise: 'lateral-bound-stick', section: 'prime', sets: 3, reps: '3 each side', restSeconds: 60, setupCues: ['stick-two'] },
      { exercise: 'rfe-split-squat', section: 'key', isKeySet: true, sets: 3, reps: '8 each side', restSeconds: 90, setupCues: ['front-heel'] },
      { exercise: 'door-row', section: 'assist', supersetGroup: 'A', sets: 3, reps: '10', restSeconds: 45, setupCues: ['elbows-to-pockets'] },
      { exercise: 'pike-push-up', section: 'assist', supersetGroup: 'A', sets: 3, reps: '6', restSeconds: 60 },
      { exercise: 'sl-bridge-squeeze', section: 'assist', sets: 2, reps: '6 each side', restSeconds: 45 },
      { exercise: 'prone-yt', section: 'assist', sets: 2, reps: '8', restSeconds: 45 },
      { exercise: 'backpack-hug-carry', section: 'finish', sets: 2, workSeconds: 40, restSeconds: 60, setupCues: ['grow-tall'] },
    ] },
    { day: 'Fri', label: 'Hinge and mix', items: [
      { exercise: 'broad-jump-stick', section: 'prime', sets: 3, reps: '2 jumps', restSeconds: 60, setupCues: ['quiet-landing'] },
      { exercise: 'sl-rdl-supported', section: 'key', isKeySet: true, sets: 3, reps: '6 each side', restSeconds: 90, setupCues: ['tripod-down', 'wall-behind'] },
      { exercise: 'door-row-single', section: 'assist', supersetGroup: 'A', sets: 3, reps: '8 each side', restSeconds: 45 },
      { exercise: 'incline-push-up', section: 'assist', supersetGroup: 'A', sets: 3, reps: '10', restSeconds: 60 },
      { exercise: 'reverse-lunge', section: 'assist', sets: 2, reps: '8 each side', restSeconds: 60, setupCues: ['front-heel'] },
      { exercise: 'tempo-bw-squat', section: 'assist', sets: 2, reps: '12', restSeconds: 60 },
      { exercise: 'breathing-plank', section: 'assist', sets: 2, workSeconds: 30, restSeconds: 45, setupCues: ['light-punch'] },
      { exercise: 'farmer-carry-bags', section: 'finish', sets: 2, workSeconds: 40, restSeconds: 60, setupCues: ['grow-tall'] },
    ] },
  ],
};

export const ADULT_BW_4: ProgramTemplate = {
  id: 'adult-bw-4',
  name: '4 days a week · bodyweight',
  summary: 'Lower, upper, lower, upper. A jump to open each lower day, and more pulling than pressing every week.',
  audience: 'adult', equipment: 'bodyweight', kind: 'program', daysPerWeek: 4,
  equipmentLine: 'A backpack you can load, two bags, a chair or step, a bench or sturdy table, a sturdy door frame and a towel.',
  sessions: [
    { day: 'Mon', label: 'Lower: squat', items: [
      { exercise: 'pogo-hops', section: 'prime', sets: 3, reps: '20 contacts', restSeconds: 60, setupCues: ['quiet-landing'] },
      { exercise: 'backpack-hug-squat', section: 'key', isKeySet: true, sets: 3, reps: '8', restSeconds: 120, setupCues: ['tripod-down', 'knees-over-laces'] },
      { exercise: 'backpack-rdl', section: 'assist', sets: 3, reps: '10', restSeconds: 60, setupCues: ['wall-behind'] },
      { exercise: 'reverse-lunge', section: 'assist', sets: 3, reps: '8 each side', restSeconds: 60, setupCues: ['front-heel'] },
      { exercise: 'suitcase-carry', section: 'finish', sets: 2, workSeconds: 40, reps: '40 s each side', restSeconds: 60, setupCues: ['grow-tall'] },
    ] },
    { day: 'Tue', label: 'Upper: push', items: [
      { exercise: 'push-up', section: 'key', isKeySet: true, sets: 3, reps: '8', restSeconds: 90, setupCues: ['floor-away', 'light-punch'] },
      { exercise: 'backpack-row', section: 'assist', supersetGroup: 'A', sets: 3, reps: '10', restSeconds: 45, setupCues: ['elbows-to-pockets'] },
      { exercise: 'pike-push-up', section: 'assist', supersetGroup: 'A', sets: 3, reps: '6', restSeconds: 60 },
      { exercise: 'door-row', section: 'assist', sets: 3, reps: '10', restSeconds: 60, setupCues: ['elbows-to-pockets'] },
      { exercise: 'prone-yt', section: 'assist', sets: 2, reps: '8', restSeconds: 45 },
      { exercise: 'backpack-hug-carry', section: 'finish', sets: 2, workSeconds: 40, restSeconds: 60, setupCues: ['grow-tall'] },
    ] },
    { day: 'Thu', label: 'Lower: single leg', items: [
      { exercise: 'cmj-stick', section: 'prime', sets: 3, reps: '3 jumps', restSeconds: 60, setupCues: ['quiet-landing'] },
      { exercise: 'rfe-split-squat', section: 'key', isKeySet: true, sets: 3, reps: '8 each side', restSeconds: 90, setupCues: ['front-heel'] },
      { exercise: 'sl-rdl-supported', section: 'assist', sets: 3, reps: '6 each side', restSeconds: 60, setupCues: ['tripod-down'] },
      { exercise: 'glute-bridge-close', section: 'assist', sets: 2, reps: '10', restSeconds: 45 },
      { exercise: 'breathing-plank', section: 'assist', sets: 2, workSeconds: 30, restSeconds: 45, setupCues: ['light-punch'] },
      { exercise: 'farmer-carry-bags', section: 'finish', sets: 2, workSeconds: 40, restSeconds: 60, setupCues: ['grow-tall'] },
    ] },
    { day: 'Fri', label: 'Upper: pull', items: [
      { exercise: 'door-row-single', section: 'key', isKeySet: true, sets: 3, reps: '8 each side', restSeconds: 90, setupCues: ['elbows-to-pockets'] },
      { exercise: 'incline-push-up', section: 'assist', supersetGroup: 'A', sets: 3, reps: '10', restSeconds: 45 },
      { exercise: 'backpack-row', section: 'assist', supersetGroup: 'A', sets: 3, reps: '10', restSeconds: 60 },
      { exercise: 'prone-yt', section: 'assist', sets: 2, reps: '8', restSeconds: 45 },
      { exercise: 'suitcase-carry', section: 'finish', sets: 2, workSeconds: 40, reps: '40 s each side', restSeconds: 60, setupCues: ['grow-tall'] },
    ] },
  ],
};
