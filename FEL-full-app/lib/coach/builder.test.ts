// The builder's form state round-trips (MIRROR-COACH P2, 2026-09-25): what the edit panel shows is what it saves,
// and what it saves reads back as the same panel. Pure; builder-route.test.ts runs the same trip through the routes.
import { describe, expect, it } from 'vitest';
import { mergeSpecUpdate, treeExercise, validateExerciseSpec, type TreeExercise } from './loop';
import {
  BUILDER_ERROR_COPY, bandMismatchLine, bodyFromDraft, builderErrorText, draftFromExercise, emptyDraft, suggestedBand, timedSuffixOf, toggleCue,
  withSection, withTimedSuffix, type ExerciseDraft,
} from './builder';
import { STRUCTURE_ERROR_COPY, doseLine, loadBandConflict, timedRepsSuffix } from './structure';

/** draft → body → the route's validator → a stored row → the tree the route answers with. */
function saveAndRead(d: ExerciseDraft, id = 'se1', order = 1): TreeExercise {
  const v = validateExerciseSpec(bodyFromDraft(d));
  if (!v.ok) throw new Error(`refused: ${v.error}`);
  return treeExercise({ id, order, ...v.spec, exercise: { name: 'Trap-bar deadlift', category: 'lower-body' } });
}

const EXERCISES: TreeExercise[] = [
  { id: 'k', order: 1, exerciseId: 'pe-tbdl', name: 'Trap-bar deadlift', sets: 4, reps: '5', load: 'RPE8', tempo: '2-1-1-0', restSeconds: 150, coachNote: 'Push the floor.',
    section: 'key', isKeySet: true, supersetGroup: null, workSeconds: null, holdSeconds: null, setupCues: ['tripod-down', 'wall-behind'], effortBand: 'surge' },
  { id: 'a', order: 2, exerciseId: 'pe-row', name: 'Half-kneeling row', sets: 3, reps: '10 each', load: 'RPE7', tempo: '3-1-1-0', restSeconds: 60, coachNote: null,
    section: 'assist', isKeySet: false, supersetGroup: 'A', workSeconds: null, holdSeconds: 2, setupCues: ['elbows-to-pockets'], effortBand: 'drive' },
  { id: 'c', order: 3, exerciseId: 'pe-carry', name: 'Suitcase carry', sets: 3, reps: '30 s', load: '24kg', tempo: '3-1-1-0', restSeconds: 60, coachNote: null,
    section: 'finish', isKeySet: false, supersetGroup: null, workSeconds: 30, holdSeconds: null, setupCues: ['crush-handle', 'grow-tall'], effortBand: null },
  { id: 'b', order: 4, exerciseId: 'pe-breath', name: 'Crocodile breathing', sets: 1, reps: '30 s each side', load: 'body', tempo: '3-1-1-0', restSeconds: 0, coachNote: 'Long exhales.',
    section: 'cooldown', isKeySet: false, supersetGroup: null, workSeconds: 30, holdSeconds: 10, setupCues: ['long-exhale'], effortBand: 'idle' },
];

describe('the builder round-trips an exercise', () => {
  for (const e of EXERCISES) {
    it(`${e.section}: ${e.name} → draft → save → read → the same exercise and the same draft`, () => {
      const d = draftFromExercise(e);
      const back = saveAndRead(d, e.id, e.order);
      expect({ ...back, name: e.name }).toEqual(e);
      expect(draftFromExercise(back)).toEqual(d);
    });
  }

  it('a new exercise from the add row is a plain Key-section prescription at the schema defaults', () => {
    const back = saveAndRead(emptyDraft('pe-x'));
    expect(back).toMatchObject({ exerciseId: 'pe-x', section: 'key', isKeySet: false, supersetGroup: null, sets: 3, reps: '8-10', load: 'RPE7', tempo: '3-1-1-0', restSeconds: 90,
      workSeconds: null, holdSeconds: null, setupCues: [], effortBand: null, coachNote: null });
    expect(saveAndRead(emptyDraft('pe-x', 'cooldown')).section).toBe('cooldown');
  });

  it('clearing a field in the form clears it in the save (blank = null, never "left as it was")', () => {
    const d = { ...draftFromExercise(EXERCISES[1]), supersetGroup: '', holdSeconds: '', effortBand: '', setupCues: [], coachNote: '' };
    const body = bodyFromDraft(d);
    expect(body).toMatchObject({ supersetGroup: null, holdSeconds: null, effortBand: null, setupCues: [], coachNote: null });
    expect(saveAndRead(d)).toMatchObject({ supersetGroup: null, holdSeconds: null, effortBand: null, setupCues: [], coachNote: null });
  });

  it('a timer: switching it off sends no seconds whatever the box says; changing it re-derives the "30 s" reps', () => {
    const d = draftFromExercise(EXERCISES[2]);
    expect(bodyFromDraft({ ...d, timed: false }).workSeconds).toBeNull();
    const off = saveAndRead({ ...d, timed: false });
    expect(off).toMatchObject({ workSeconds: null, reps: '8-10' });
    expect(saveAndRead({ ...d, workSeconds: '45' })).toMatchObject({ workSeconds: 45, reps: '45 s' });
    // the reps text follows the timer: "30 s each side" survives a save at 30 s, and — FLIPPED IN THE P2 REVIEW
    // (2026-09-26) — keeps its "each side" at 40 s ("40 s"; the builder hid the reps box, so it could not be restored)
    expect(saveAndRead(draftFromExercise(EXERCISES[3]))).toMatchObject({ workSeconds: 30, reps: '30 s each side' });
    expect(saveAndRead({ ...draftFromExercise(EXERCISES[3]), workSeconds: '40' })).toMatchObject({ workSeconds: 40, reps: '40 s each side' });
    // found live (2026-09-25): an exercise from the add row (reps "8-10") that is then timed saves its seconds as reps
    expect(saveAndRead({ ...emptyDraft('pe-carry'), timed: true, workSeconds: '30' })).toMatchObject({ workSeconds: 30, reps: '30 s' });
    // junk in the timer box is refused, not saved as nothing
    expect(validateExerciseSpec(bodyFromDraft({ ...d, workSeconds: 'half a minute' }))).toEqual({ ok: false, error: 'work_seconds_range' });
  });

  it('the key-set switch goes with the Key section', () => {
    const d = draftFromExercise(EXERCISES[0]);
    expect(withSection(d, 'assist')).toMatchObject({ section: 'assist', isKeySet: false });
    expect(withSection(d, 'key').isKeySet).toBe(true);
    // a stale switch on a non-Key draft is never sent as true
    expect(bodyFromDraft({ ...d, section: 'prep', isKeySet: true }).isKeySet).toBe(false);
  });

  it('the cue pick-list toggles and stops at three', () => {
    let d = emptyDraft('pe-x');
    d = toggleCue(d, 'tripod-down'); d = toggleCue(d, 'wall-behind'); d = toggleCue(d, 'light-punch');
    expect(d.setupCues).toEqual(['tripod-down', 'wall-behind', 'light-punch']);
    expect(toggleCue(d, 'floor-away')).toBe(d);
    expect(toggleCue(d, 'wall-behind').setupCues).toEqual(['tripod-down', 'light-punch']);
  });

  it('suggests a band from an RPE load only while none is picked', () => {
    expect(suggestedBand(emptyDraft('pe-x'))).toBe('drive');                      // load defaults to RPE7
    expect(suggestedBand({ ...emptyDraft('pe-x'), load: '24kg' })).toBeNull();
    expect(suggestedBand({ ...emptyDraft('pe-x'), effortBand: 'cruise' })).toBeNull();
  });

  it('every error the route can answer has a line for the coach', () => {
    for (const code of Object.keys(STRUCTURE_ERROR_COPY)) expect(BUILDER_ERROR_COPY[code]).toBeTruthy();
    for (const code of ['exercise_not_found', 'exercise_logged', 'session_not_found', 'tempo_format', 'direction_required', 'forbidden']) expect(builderErrorText(code)).toBe(BUILDER_ERROR_COPY[code]);
    expect(builderErrorText('something_new')).toMatch(/did not save/);
  });
});

// MIRROR-COACH P2 review (2026-09-26): what the client reads on Today when the coach clears a load, picks a band the
// load's RPE contradicts, or times a per-side dose — through the builder's own draft → body → validator → dose line.
describe('the dose the athlete reads (P2 review)', () => {
  const dose = (d: ExerciseDraft) => { const e = saveAndRead(d); return doseLine(e); };

  it('a cleared load is no load: "3 × 8-10 · Surge", never "@ RPE7" coming back', () => {
    const d = { ...emptyDraft('pe-tbdl'), load: '', effortBand: 'surge' };
    expect(bodyFromDraft(d).load).toBeNull();
    expect(dose(d)).toBe('3 × 8-10 · Surge');
    // an edit that clears the load on a saved exercise clears it too (it used to mean "unchanged")
    const row = { exerciseId: 'pe-tbdl', sets: 3, reps: '8-10', load: 'RPE7', tempo: '3-1-1-0', restSeconds: 90, coachNote: null, section: 'key' as const,
      isKeySet: false, supersetGroup: null, workSeconds: null, holdSeconds: null, setupCues: [], effortBand: null };
    const v = validateExerciseSpec(mergeSpecUpdate(row, bodyFromDraft({ ...draftFromExercise(treeExercise({ id: 'se', order: 1, ...row, exercise: { name: 'x', category: 'y' } })), load: '', effortBand: 'full' })));
    expect(v.ok && doseLine(v.spec)).toBe('3 × 8-10 · Full throttle');
  });

  it('a load RPE that contradicts the band is left off the line, the rest of the load stays; the builder says so', () => {
    expect(doseLine({ sets: 3, reps: '8-10', load: 'RPE7', effortBand: 'surge' })).toBe('3 × 8-10 · Surge');
    expect(doseLine({ sets: 3, reps: '8-10', load: '24kg @ RPE7', effortBand: 'surge' })).toBe('3 × 8-10 @ 24kg · Surge');
    expect(doseLine({ sets: 3, reps: '8-10', load: 'RPE8', effortBand: 'surge' })).toBe('3 × 8-10 @ RPE8 · Surge');   // agrees: kept
    expect(doseLine({ sets: 3, reps: '8-10', load: 'RPE7', effortBand: null })).toBe('3 × 8-10 @ RPE7');              // no band: kept
    expect(loadBandConflict('RPE7', 'surge')).toEqual({ loadBand: 'Drive', band: 'Surge' });
    expect(bandMismatchLine({ ...emptyDraft('pe-tbdl'), load: 'RPE7', effortBand: 'surge' })).toMatch(/reads as Drive, but the band is Surge/);
    expect(bandMismatchLine({ ...emptyDraft('pe-tbdl'), load: 'RPE8', effortBand: 'surge' })).toBeNull();
  });

  it('a breath or mobility item, or anything added to prep or cool-down, starts with no load', () => {
    expect(emptyDraft('pe-croc', 'key', 'breath').load).toBe('');
    expect(emptyDraft('pe-flow', 'key', 'mobility').load).toBe('');
    expect(emptyDraft('pe-x', 'cooldown').load).toBe('');
    expect(emptyDraft('pe-tbdl', 'key', 'hinge').load).toBe('RPE7');
    expect(dose({ ...emptyDraft('pe-croc', 'cooldown', 'breath'), sets: '1', reps: '5 breaths' })).toBe('1 × 5 breaths');
  });

  it('a timed per-side dose reads "each side" on Today, keeps it when the timer changes, and the builder shows it', () => {
    const d = draftFromExercise(EXERCISES[3]);
    expect(d.reps).toBe('30 s each side');
    expect(dose(d)).toBe('1 × 30 s each side @ body · hold 10 s · Idle');
    expect(timedSuffixOf(d)).toBe('each side');
    expect(dose({ ...d, workSeconds: '40' })).toBe('1 × 40 s each side @ body · hold 10 s · Idle');
    // the timed panel's box edits only the text after the seconds
    expect(withTimedSuffix(d, 'per arm').reps).toBe('30 s per arm');
    expect(dose(withTimedSuffix(d, ''))).toBe('1 × 30 s @ body · hold 10 s · Idle');
    expect(timedRepsSuffix('30 s', 30)).toBeNull();
    expect(timedRepsSuffix('30 s each side', 40)).toBeNull();             // a text that does not state these seconds
  });
});
