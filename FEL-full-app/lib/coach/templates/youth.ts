// lib/coach/templates/youth.ts — MIRROR-COACH P8 (2026-09-29): FEL's youth templates (3 and 2 days a week, bodyweight)
// and the camp session. Owner decision #6 (conservative youth mode) and #10 (youth/camp templates), in data:
//   · NO IMPACT. No jump, hop, bound or depth drop anywhere, and no Prime section at all — so on Today P6's warm-up adds
//     its own calm, no-jump primer (lib/coach/warmup.ts pickPrimer(pattern, !isYouth)) and keeps the Wake-Up's jumping
//     phases out (a youth template never counts as "a coach put jumping in Prime": warmup.ts coachAssignedImpact).
//     "Unless a coach assigns them": a coach who wants jump work for a youth athlete adds it by hand, their call.
//   · NO MAX EFFORT. No band above Drive in any week (./waves.ts YOUTH_WAVE; Full throttle is adults-only anyway,
//     lib/coach/taxonomy.ts), and no cue that asks for everything (templates/index.test.ts runs every cue through
//     taxonomy.ts MAX_EFFORT_CUE and every name through PIN_EXERCISE).
//   · THE OWNER'S OWN MOVEMENTS. The youth week is the owner's Playbook ch8 map for three free windows ("one lower
//     hinge/split/bridge day, one upper/core day, one mixed quality day with fewer sets"), built from ch8's five
//     movements (hip hinge, split squat, glute bridge, push-up, breathing plank) on its own ladders, plus FEL's rows and
//     carries so the week covers all six patterns and pulls at least as much as it presses. The 2-day week is FEL's
//     two full-body days from the same pieces.
//   · REAL PULLING (MIRROR-COACH P8 FIX, 2026-09-30, code review). The camp session's only pull was an unloaded Prone Y-T
//     Raise, and youth-bw-2 passed pull ≥ push only because the Y-T raise counted 3 sets (3:5 without it): P2's check
//     passed on the pattern tag more than in substance. Now every session with a push has a row in it, and every week's
//     rows alone (Y-T raises left out) are at least its presses — templates/index.test.ts holds both for every template.
//   · 60 MINUTES A DAY. The youth activity target (decision #6; lib/consent/guardianGate.ts
//     YOUTH_DAILY_ACTIVITY_TARGET_MINUTES) is shown with every youth and camp template: a session is part of it, not
//     all of it.
// FEL's programming, doses and wording; the owner's movements and ladders are credited where they are used
// (lib/coach/templateCatalogue.ts `source`).
import { YOUTH_DAILY_ACTIVITY_TARGET_MINUTES } from '@/lib/consent/guardianGate';
import type { ProgramTemplate } from './types';

const YOUTH_EQUIPMENT = 'Two bags, a backpack, a bench, a sturdy table or door frame, and a towel.';

export const YOUTH_BW_3: ProgramTemplate = {
  id: 'youth-bw-3',
  name: 'Youth · 3 days a week · bodyweight',
  summary: 'A lower day (hinge, split squat, bridge), an upper and trunk day, and a mixed day with fewer sets. No jumps.',
  audience: 'youth', equipment: 'bodyweight', kind: 'program', daysPerWeek: 3,
  equipmentLine: YOUTH_EQUIPMENT,
  dailyTargetMinutes: YOUTH_DAILY_ACTIVITY_TARGET_MINUTES,
  sessions: [
    { day: 'Mon', label: 'Lower: hinge, split squat, bridge', items: [
      { exercise: 'bw-rdl-hold', section: 'key', isKeySet: true, sets: 3, reps: '6', restSeconds: 60, setupCues: ['wall-behind'] },
      { exercise: 'split-squat-hold', section: 'assist', sets: 3, reps: '6 each side', restSeconds: 60, setupCues: ['front-heel'] },
      { exercise: 'glute-bridge-close', section: 'assist', sets: 3, reps: '8', restSeconds: 45 },
      { exercise: 'farmer-carry-bags', section: 'finish', sets: 2, workSeconds: 30, restSeconds: 60, setupCues: ['grow-tall'] },
    ] },
    { day: 'Wed', label: 'Upper and trunk', items: [
      { exercise: 'incline-push-up', section: 'key', isKeySet: true, sets: 3, reps: '8', restSeconds: 60, setupCues: ['floor-away'] },
      // MIRROR-COACH P8 FIX (2026-09-30): 4 rows (was 3) and 2 Y-T raises (was 3) — the same sets, so the week's rows
      // alone match its presses in every week, week 3's extra push-up set included (the header's REAL PULLING)
      { exercise: 'door-row', section: 'assist', sets: 4, reps: '10', restSeconds: 60, setupCues: ['elbows-to-pockets'] },
      { exercise: 'prone-yt', section: 'assist', sets: 2, reps: '8', restSeconds: 45 },
      { exercise: 'breathing-plank', section: 'assist', sets: 3, workSeconds: 30, restSeconds: 45 },
      { exercise: 'backpack-hug-carry', section: 'finish', sets: 2, workSeconds: 30, restSeconds: 60, setupCues: ['grow-tall'] },
    ] },
    { day: 'Fri', label: 'Mixed, fewer sets', items: [
      { exercise: 'tempo-bw-squat', section: 'key', isKeySet: true, sets: 2, reps: '10', restSeconds: 60, setupCues: ['tripod-down'] },
      { exercise: 'door-row', section: 'assist', supersetGroup: 'A', sets: 2, reps: '10', restSeconds: 45 },
      { exercise: 'incline-push-up', section: 'assist', supersetGroup: 'A', sets: 2, reps: '8', restSeconds: 60 },
      { exercise: 'bw-rdl-hold', section: 'assist', sets: 2, reps: '6', restSeconds: 45 },
      { exercise: 'suitcase-carry', section: 'finish', sets: 2, workSeconds: 30, reps: '30 s each side', restSeconds: 60 },
    ] },
  ],
};

export const YOUTH_BW_2: ProgramTemplate = {
  id: 'youth-bw-2',
  name: 'Youth · 2 days a week · bodyweight',
  summary: 'Two full-body days from the same pieces: a squat day and a hinge day, rows and push-ups on both. No jumps.',
  audience: 'youth', equipment: 'bodyweight', kind: 'program', daysPerWeek: 2,
  equipmentLine: YOUTH_EQUIPMENT,
  dailyTargetMinutes: YOUTH_DAILY_ACTIVITY_TARGET_MINUTES,
  sessions: [
    { day: 'Mon', label: 'Full body: squat', items: [
      { exercise: 'tempo-bw-squat', section: 'key', isKeySet: true, sets: 3, reps: '10', restSeconds: 60, setupCues: ['tripod-down'] },
      { exercise: 'door-row', section: 'assist', supersetGroup: 'A', sets: 3, reps: '10', restSeconds: 45, setupCues: ['elbows-to-pockets'] },
      { exercise: 'incline-push-up', section: 'assist', supersetGroup: 'A', sets: 3, reps: '8', restSeconds: 60 },
      { exercise: 'split-squat-hold', section: 'assist', sets: 2, reps: '6 each side', restSeconds: 60, setupCues: ['front-heel'] },
      { exercise: 'farmer-carry-bags', section: 'finish', sets: 2, workSeconds: 30, restSeconds: 60, setupCues: ['grow-tall'] },
    ] },
    { day: 'Thu', label: 'Full body: hinge', items: [
      { exercise: 'bw-rdl-hold', section: 'key', isKeySet: true, sets: 3, reps: '6', restSeconds: 60, setupCues: ['wall-behind'] },
      // MIRROR-COACH P8 FIX (2026-09-30): a real row paired with the push-up (it was the Y-T raise, the day's only pull)
      { exercise: 'door-row', section: 'assist', supersetGroup: 'A', sets: 2, reps: '10', restSeconds: 45, setupCues: ['elbows-to-pockets'] },
      { exercise: 'incline-push-up', section: 'assist', supersetGroup: 'A', sets: 2, reps: '8', restSeconds: 60 },
      { exercise: 'prone-yt', section: 'assist', sets: 2, reps: '8', restSeconds: 45 },
      { exercise: 'glute-bridge-close', section: 'assist', sets: 2, reps: '8', restSeconds: 45 },
      { exercise: 'breathing-plank', section: 'assist', sets: 2, workSeconds: 30, restSeconds: 45 },
      { exercise: 'backpack-hug-carry', section: 'finish', sets: 2, workSeconds: 30, restSeconds: 60, setupCues: ['grow-tall'] },
    ] },
  ],
};

/**
 * The camp session: one bodyweight session a coach runs with a group, as often as the camp meets. Paired stations
 * (A and B supersets) so half the group works while the other half watches and counts. All six patterns in the one
 * session, pulling sets equal to pressing sets, nothing that lands, no band above Drive.
 */
export const CAMP_SESSION: ProgramTemplate = {
  id: 'camp-session',
  name: 'Camp session · bodyweight',
  summary: 'One group session with paired stations: all six patterns in one session, and no jumps.',
  audience: 'youth', equipment: 'bodyweight', kind: 'camp', daysPerWeek: 1,
  equipmentLine: 'Two bags or water jugs and a backpack per pair, a bench or bleacher, and a towel each.',
  dailyTargetMinutes: YOUTH_DAILY_ACTIVITY_TARGET_MINUTES,
  sessions: [
    { day: 'Camp', label: 'Camp session', items: [
      { exercise: 'tempo-bw-squat', section: 'key', isKeySet: true, sets: 2, reps: '10', restSeconds: 60, setupCues: ['tripod-down'] },
      { exercise: 'split-squat-hold', section: 'assist', supersetGroup: 'A', sets: 2, reps: '6 each side', restSeconds: 30, setupCues: ['front-heel'] },
      // MIRROR-COACH P8 FIX (2026-09-30): a real row (it was the Prone Y-T Raise, the session's only pull)
      { exercise: 'backpack-row', section: 'assist', supersetGroup: 'A', sets: 2, reps: '10', restSeconds: 60, setupCues: ['elbows-to-pockets'] },
      { exercise: 'bw-rdl-hold', section: 'assist', supersetGroup: 'B', sets: 2, reps: '6', restSeconds: 30, setupCues: ['wall-behind'] },
      { exercise: 'incline-push-up', section: 'assist', supersetGroup: 'B', sets: 2, reps: '8', restSeconds: 60 },
      { exercise: 'breathing-plank', section: 'assist', sets: 2, workSeconds: 30, restSeconds: 45 },
      { exercise: 'farmer-carry-bags', section: 'finish', sets: 2, workSeconds: 30, restSeconds: 60, setupCues: ['grow-tall'] },
    ] },
  ],
};
