// tests/helpers/weeklyDraftFixtures.ts — COACH-AI-DRAFT (2026-10-24): realistic clients for the weekly draft's tests.
//
// One coach's off-season program, as the builder writes it: week 1 done, week 2 to come, three sessions a week with
// Prep / Prime / Key / Assist / Finish sections, a catalogue with easier/harder links and the P2 tags. Each fixture
// below starts from that and changes only what its test is about, so a test reads as "this client, this week".

import type { Prescription } from '@/lib/coach/mirrorToProgram';
import type { ProgramTree, TreeExercise } from '@/lib/coach/loop';
import type { DraftCatalogueRow, DraftFacts, Exposure, LoggedSet } from '@/lib/coach/weeklyDraft/types';

export const NOW = Date.parse('2026-10-22T15:00:00Z'); // a Thursday; its week is 2026-10-19
export const DAY = 86_400_000;

export const CATALOGUE: DraftCatalogueRow[] = [
  { id: 'pe-tbdl', name: 'Trap-bar deadlift', category: 'lower-body', pattern: 'hinge', skillLayer: 'strength', regressionOfId: 'pe-rdl', progressionOfId: null },
  { id: 'pe-rdl', name: 'Dumbbell RDL', category: 'lower-body', pattern: 'hinge', skillLayer: 'strength', regressionOfId: null, progressionOfId: 'pe-tbdl' },
  { id: 'pe-goblet', name: 'Goblet squat', category: 'lower-body', pattern: 'squat', skillLayer: 'strength', regressionOfId: 'pe-box', progressionOfId: null },
  { id: 'pe-box', name: 'Box squat', category: 'lower-body', pattern: 'squat', skillLayer: 'strength', regressionOfId: null, progressionOfId: 'pe-goblet' },
  { id: 'pe-split', name: 'Split squat', category: 'lower-body', pattern: 'lunge', skillLayer: 'strength', regressionOfId: null, progressionOfId: null },
  { id: 'pe-row', name: 'Half-kneeling row', category: 'upper-pull', pattern: 'pull', skillLayer: 'strength', regressionOfId: null, progressionOfId: null },
  { id: 'pe-push', name: 'Push-up', category: 'upper-push', pattern: 'push', skillLayer: 'strength', regressionOfId: 'pe-incline', progressionOfId: 'pe-deficit' },
  { id: 'pe-incline', name: 'Incline push-up', category: 'upper-push', pattern: 'push', skillLayer: 'strength', regressionOfId: null, progressionOfId: 'pe-push' },
  { id: 'pe-deficit', name: 'Deficit push-up', category: 'upper-push', pattern: 'push', skillLayer: 'strength', regressionOfId: 'pe-push', progressionOfId: null },
  { id: 'pe-pogo', name: 'Pogo hops', category: 'plyometric', pattern: 'locomotion', skillLayer: 'jump-land', regressionOfId: null, progressionOfId: null },
  { id: 'pe-breath', name: 'Crocodile breathing', category: 'breath', pattern: 'breath', skillLayer: 'cylinder', regressionOfId: null, progressionOfId: null },
  { id: 'pe-carry', name: 'Suitcase carry', category: 'conditioning', pattern: 'carry', skillLayer: 'strength', regressionOfId: null, progressionOfId: null },
  { id: 'pe-clam', name: 'Side-lying clamshell', category: 'mobility', pattern: 'other', skillLayer: 'joints', regressionOfId: null, progressionOfId: null, defaultTempo: '2-1-1-0' },
];
const NAME = Object.fromEntries(CATALOGUE.map((c) => [c.id, c.name]));

let seq = 0;
function ex(sessionId: string, exerciseId: string, o: Partial<TreeExercise> = {}): TreeExercise {
  seq += 1;
  return {
    id: `${sessionId}-${exerciseId}`, order: seq, exerciseId, name: NAME[exerciseId], sets: 3, reps: '8-10', load: 'RPE7', tempo: '3-1-1-0', restSeconds: 90,
    coachNote: null, section: 'key', isKeySet: false, supersetGroup: null, workSeconds: null, holdSeconds: null, setupCues: [], effortBand: null, ...o,
  };
}

/** Week 1 (A1, B1, C1, all done) and week 2 (A2, B2, C2, to come). */
export function program(): { id: string; name: string; tree: ProgramTree } {
  const week = (w: number) => ({
    id: `blk-${w}`, order: w, label: `Week ${w}`, targetDate: null,
    sessions: [
      { id: `A${w}`, order: 1, label: `Day 1 — Lower`, kind: 'training' as const, exercises: [
        ex(`A${w}`, 'pe-breath', { section: 'prep', sets: 1, reps: '5 breaths', load: '' }),
        ex(`A${w}`, 'pe-pogo', { section: 'prime', sets: 3, reps: '10 contacts', load: '' }),
        ex(`A${w}`, 'pe-tbdl', { isKeySet: true, load: '60 kg' }),
        ex(`A${w}`, 'pe-split', { section: 'assist', reps: '10', load: '16 kg' }),
        ex(`A${w}`, 'pe-carry', { section: 'finish', sets: 2, reps: '40 s', load: '24 kg', workSeconds: 40 }),
      ] },
      { id: `B${w}`, order: 2, label: `Day 2 — Upper`, kind: 'training' as const, exercises: [
        ex(`B${w}`, 'pe-push', { reps: '8-12', load: '' }),
        ex(`B${w}`, 'pe-row', { section: 'assist', reps: '10-12', load: '', effortBand: 'drive' }),
      ] },
      { id: `C${w}`, order: 3, label: `Day 3 — Full`, kind: 'training' as const, exercises: [
        ex(`C${w}`, 'pe-goblet', { load: 'RPE7' }),
        ex(`C${w}`, 'pe-row', { section: 'assist', reps: '10-12', load: '', effortBand: 'drive' }),
      ] },
    ],
  });
  return { id: 'prog-1', name: 'Off-season strength', tree: { id: 'prog-1', name: 'Off-season strength', coachId: 'coach-1', clientId: 'client-1', blocks: [week(1), week(2)] } };
}

export const WEEK1_DONE = ['A1', 'B1', 'C1'];

const sets = (reps: number[], effort: (number | null)[] | number | null = null, weightKg: number | null = null): LoggedSet[] =>
  reps.map((r, i) => ({ reps: r, weightKg, rir: null, effort: Array.isArray(effort) ? effort[i] ?? null : effort }));

/** One exposure, `daysAgo` before NOW. */
export function exposure(exerciseId: string, daysAgo: number, reps: number[], effort: (number | null)[] | number | null, prescribed: Partial<Exposure['prescribed']> = {}): Exposure {
  return {
    exerciseId, atMs: NOW - daysAgo * DAY,
    prescribed: { sets: 3, reps: '8-10', load: 'RPE7', effortBand: null, ...prescribed },
    sets: sets(reps, effort), summary: { actualSets: reps.length, actualReps: reps.join(','), actualLoad: prescribed.load ?? null, rpe: null },
  };
}

/** A steady adult with nothing in particular to act on: two in-range exposures of each key lift. */
export function adult(o: Partial<DraftFacts> = {}): DraftFacts {
  return {
    coachId: 'coach-1', clientId: 'client-1', name: 'Jordan', band: 'adult', program: program(), completedSessionIds: WEEK1_DONE, loggedRowIds: [],
    exposures: [
      exposure('pe-tbdl', 3, [9, 9, 8], 7, { load: '60 kg' }),
      exposure('pe-tbdl', 10, [9, 8, 8], 7, { load: '60 kg' }),
    ],
    catalogue: CATALOGUE,
    compliance: { state: 'steady', note: '3 coached sessions in the last two weeks.', daysSince: 2, planned: 3, doneLast7: 3, missed: 0 },
    availability: null,
    pain: { present: false, detailed: false, items: [] },
    readiness: null, form: null, jump: null, prq: null, screen: null, drill: null,
    nowMs: NOW,
    ...o,
  };
}

/** The Mirror screen's prescription for a right-side hip drop, matched (or not) in the coach's catalogue. */
export function hipPrescription(matched: boolean): Prescription {
  return {
    findingId: 'hipLevel', side: 'right', title: 'Hip level, right side', value: 'estimated 6° drop', because: 'From the screen: hip level, right side — the right hip drops on a single-leg stand.',
    fix: 'Glute med work before load.', block: null,
    exercise: matched ? { id: 'pe-clam', name: 'Side-lying clamshell', category: 'mobility', pattern: 'other', skillLayer: 'joints', defaultTempo: '2-1-1-0' } : null,
    matchedBy: matched ? 'tags' : null, sets: 2, reps: '12 each side', workSeconds: null, section: 'prep', wanted: ['a Joints exercise'], corrective: null,
  };
}
