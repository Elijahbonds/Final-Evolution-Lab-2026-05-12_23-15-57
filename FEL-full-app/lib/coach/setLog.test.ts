// Per-set logging (MIRROR-COACH P2, 2026-09-25): what a set may hold (every range, refused not clamped), the kg/lb
// round trip, the ExerciseLog summary derived from the sets, and how old and new logs read back.
import { describe, expect, it } from 'vitest';
import { screenText } from '@/lib/share/screen';
import {
  EFFORT_ANCHOR, EFFORT_OPTIONS, KG_PER_LB, RIR_ANCHORS, SET_LIMITS, SET_LOG_ERROR_COPY, convertDrafts, copyPrevious, draftIsEmpty,
  draftsFor, draftsToInput, formatWeight, fromKg, legacyLine, logLines, setLine, setSummary, summaryToWrite, toKg, validateSet,
  validateSets, type CleanSet,
} from './setLog';
import { validateLog } from './loop';

const set = (over: Partial<CleanSet> = {}): CleanSet => ({ setIndex: 0, reps: null, weightKg: null, rir: null, effort: null, workSeconds: null, note: null, ...over });

describe('the per-set validator: every field has a range, and a value outside it is refused with its own error', () => {
  it('accepts the edges of every range', () => {
    expect(validateSet({ reps: 0, weight: 0, rir: 0, effort: 1, workSeconds: 1 })).toEqual({ ok: true, set: { reps: 0, weightKg: 0, rir: 0, effort: 1, workSeconds: 1, note: null } });
    expect(validateSet({ reps: 100, weight: 500, rir: 5, effort: 10, workSeconds: 1800 })).toEqual({ ok: true, set: { reps: 100, weightKg: 500, rir: 5, effort: 10, workSeconds: 1800, note: null } });
  });

  it('refuses just outside every range — never clamps', () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ reps: -1 }, 'reps_range'], [{ reps: 101 }, 'reps_range'], [{ reps: 8.5 }, 'reps_range'], [{ reps: 'eight' }, 'reps_range'],
      [{ weight: -2.5 }, 'weight_range'], [{ weight: 500.5 }, 'weight_range'], [{ weight: 1103, unit: 'lb' }, 'weight_range'], [{ weight: 'heavy' }, 'weight_range'],
      [{ weight: 60, unit: 'stone' }, 'unit_unknown'],
      [{ rir: -1 }, 'rir_range'], [{ rir: 6 }, 'rir_range'], [{ rir: 1.5 }, 'rir_range'],
      [{ effort: 0 }, 'effort_range'], [{ effort: 11 }, 'effort_range'], [{ effort: 7.5 }, 'effort_range'],
      [{ workSeconds: 0 }, 'work_seconds_range'], [{ workSeconds: 1801 }, 'work_seconds_range'],
      [{ reps: Number.NaN }, 'reps_range'], [{ weight: Number.POSITIVE_INFINITY }, 'weight_range'],
    ];
    for (const [input, error] of cases) expect(validateSet(input), JSON.stringify(input)).toEqual({ ok: false, error });
    expect(SET_LIMITS.rir).toEqual({ min: 0, max: 5 });
    expect(SET_LIMITS.effort).toEqual({ min: 1, max: 10 });
  });

  it('reads form strings: "8", "60,5" (a decimal comma), "5+" reps left; blank is no value', () => {
    expect(validateSet({ reps: ' 8 ', weight: '60,5', rir: '5+', effort: '7', workSeconds: '' })).toEqual({ ok: true, set: { reps: 8, weightKg: 60.5, rir: 5, effort: 7, workSeconds: null, note: null } });
    expect(validateSet({ note: '  last rep slowed  ' })).toEqual({ ok: true, set: { reps: null, weightKg: null, rir: null, effort: null, workSeconds: null, note: 'last rep slowed' } });
    expect((validateSet({ note: 'x'.repeat(400) }) as { set: { note: string } }).set.note).toHaveLength(SET_LIMITS.note);
  });

  it('weight is stored in kilograms: a pound figure is converted once, to the gram', () => {
    expect(KG_PER_LB).toBe(0.45359237);
    expect((validateSet({ weight: 135, unit: 'lb' }) as { set: Omit<CleanSet, 'setIndex'> }).set.weightKg).toBe(61.235);
    expect((validateSet({ weight: 60, unit: 'kg' }) as { set: Omit<CleanSet, 'setIndex'> }).set.weightKg).toBe(60);
    expect((validateSet({ weight: 60 }) as { set: Omit<CleanSet, 'setIndex'> }).set.weightKg).toBe(60);   // no unit = kg
    expect((validateSet({ weight: 1102, unit: 'lb' }) as { set: Omit<CleanSet, 'setIndex'> }).set.weightKg).toBeLessThanOrEqual(500);
  });

  it('a list: empty rows are dropped and the rest numbered 0…n−1 in order; the error names the row the client sent', () => {
    const r = validateSets([{ reps: '8', weight: '60' }, { reps: '', weight: '', rir: null }, { reps: 7, weight: 62.5, rir: 1, effort: 9 }]);
    expect(r).toEqual({ ok: true, sets: [
      { setIndex: 0, reps: 8, weightKg: 60, rir: null, effort: null, workSeconds: null, note: null },
      { setIndex: 1, reps: 7, weightKg: 62.5, rir: 1, effort: 9, workSeconds: null, note: null },
    ] });
    expect(validateSets([{ reps: 8 }, { rir: 9 }])).toEqual({ ok: false, error: 'rir_range', set: 2 });
    expect(validateSets(undefined)).toEqual({ ok: true, sets: null });   // an old client: no per-set data at all
    expect(validateSets([])).toEqual({ ok: true, sets: [] });
    expect(validateSets('8,8,8')).toEqual({ ok: false, error: 'sets_format' });
    expect(validateSets([7])).toEqual({ ok: false, error: 'sets_format', set: 1 });
    expect(validateSets(Array.from({ length: 21 }, () => ({ reps: 5 })))).toEqual({ ok: false, error: 'too_many_sets' });
    expect(validateSets(Array.from({ length: 41 }, () => ({})))).toEqual({ ok: false, error: 'too_many_sets' });
    expect(validateSets(Array.from({ length: 20 }, () => ({ reps: 5 }))).ok).toBe(true);
  });

  it('validateLog carries the sets through, and refuses the whole entry on a bad set', () => {
    const ok = validateLog({ sessionExerciseId: 'se1', sets: [{ reps: 5, weight: 100, unit: 'kg', rir: 2, effort: 8 }], clientNote: 'felt good' });
    expect(ok.ok && ok.log.sets).toEqual([{ setIndex: 0, reps: 5, weightKg: 100, rir: 2, effort: 8, workSeconds: null, note: null }]);
    expect(validateLog({ sessionExerciseId: 'se1', sets: [{ reps: 5 }, { effort: 12 }] })).toEqual({ ok: false, error: 'effort_range', set: 2 });
    const legacy = validateLog({ sessionExerciseId: 'se1', actualLoad: '225 lbs' });
    expect(legacy.ok && legacy.log.sets).toBeNull();
  });
});

describe('the ExerciseLog summary, derived from the sets', () => {
  it('count, reps joined, the weight (a range when it changed) in kg, the top effort', () => {
    expect(setSummary([set({ reps: 8, weightKg: 60, effort: 7 }), set({ setIndex: 1, reps: 8, weightKg: 62.5, effort: 8 }), set({ setIndex: 2, reps: 7, weightKg: 62.5, effort: 9 })]))
      .toEqual({ actualSets: 3, actualReps: '8,8,7', actualLoad: '60–62.5 kg', rpe: 9 });
    expect(setSummary([set({ reps: 5, weightKg: 61.235 }), set({ setIndex: 1, reps: 5, weightKg: 61.235 })])).toEqual({ actualSets: 2, actualReps: '5,5', actualLoad: '61.2 kg', rpe: null });
    expect(setSummary([set({ workSeconds: 30 }), set({ setIndex: 1, workSeconds: 28, weightKg: 24 })])).toEqual({ actualSets: 2, actualReps: '30s,28s', actualLoad: '24 kg', rpe: null });
    expect(setSummary([set({ rir: 2 })])).toEqual({ actualSets: 1, actualReps: null, actualLoad: null, rpe: null });
    expect(setSummary([])).toEqual({ actualSets: null, actualReps: null, actualLoad: null, rpe: null });
  });

  it('never writes "RPE7" as a load: the load column is a weight or nothing', () => {
    const s = setSummary([set({ reps: 8, effort: 7 })]);
    expect(s.actualLoad).toBeNull();
    expect(s.rpe).toBe(7);
  });

  it('what to write: typed columns for an old client, derived for sets, and an old row left alone by an untouched card', () => {
    const typed = { actualSets: 3, actualReps: '8,8,8', actualLoad: '24kg', rpe: 7 };
    expect(summaryToWrite(typed, null, { exists: false, hadSets: false })).toEqual(typed);
    expect(summaryToWrite(typed, [set({ reps: 5, weightKg: 100 })], { exists: true, hadSets: false })).toEqual({ actualSets: 1, actualReps: '5', actualLoad: '100 kg', rpe: null });
    // the new card sends [] for an exercise it never touched: an OLD row keeps its free text…
    expect(summaryToWrite(typed, [], { exists: true, hadSets: false })).toEqual({});
    // …a row that had sets and now has none is cleared (its columns were derived), and a new row is empty
    expect(summaryToWrite(typed, [], { exists: true, hadSets: true })).toEqual({ actualSets: null, actualReps: null, actualLoad: null, rpe: null });
    expect(summaryToWrite(typed, [], { exists: false, hadSets: false })).toEqual({ actualSets: null, actualReps: null, actualLoad: null, rpe: null });
  });
});

describe('reading a log back: old rows exactly as before, new rows set by set', () => {
  it('an old row (no SetLogs) reads as the inbox has always shown it', () => {
    const old = { actualSets: 3, actualReps: '8,8,8', actualLoad: '24kg', rpe: 7 };
    expect(legacyLine(old)).toBe('3×8,8,8 @ 24kg · RPE 7');
    expect(logLines(old)).toEqual({ kind: 'legacy', lines: ['3×8,8,8 @ 24kg · RPE 7'] });
    expect(logLines({ ...old, setLogs: [] })).toEqual({ kind: 'legacy', lines: ['3×8,8,8 @ 24kg · RPE 7'] });
    // the pre-filled "RPE7" load of the old card reads as it was stored — history is shown, not rewritten
    expect(logLines({ actualSets: 3, actualReps: '8-10', actualLoad: 'RPE7', rpe: null }).lines).toEqual(['3×8-10 @ RPE7 · RPE –']);
    expect(logLines({ actualSets: null, actualReps: null, actualLoad: null, rpe: null })).toEqual({ kind: 'empty', lines: [] });
  });

  it('a new row reads one line per set, in the viewer\'s unit, whatever order the rows come in', () => {
    const l = { actualSets: 2, actualReps: '8,7', actualLoad: '60 kg', rpe: 9, setLogs: [set({ setIndex: 1, reps: 7, weightKg: 61.235, rir: 0, effort: 9 }), set({ reps: 8, weightKg: 60, rir: 2, effort: 8 })] };
    expect(logLines(l)).toEqual({ kind: 'sets', lines: ['Set 1 · 8 reps · 60 kg · 2 left · effort 8 (Surge)', 'Set 2 · 7 reps · 61.24 kg · 0 left · effort 9 (Surge)'] });
    expect(logLines(l, 'lb').lines[1]).toBe('Set 2 · 7 reps · 135 lb · 0 left · effort 9 (Surge)');
    expect(setLine(set({ workSeconds: 30, effort: 6 }))).toBe('30 s · effort 6 (Drive)');
    expect(setLine(set({ reps: 1, rir: 5 }))).toBe('1 rep · 5+ left');
    expect(setLine(set())).toBe('no numbers');
  });

  it('kg ↔ lb: 135 lb survives the trip, and display rounding is a plate, not a milligram', () => {
    expect(fromKg(toKg(135, 'lb'), 'lb')).toBe(135);
    expect(fromKg(toKg(225, 'lb'), 'lb')).toBe(225);
    expect(fromKg(toKg(62.5, 'kg'), 'kg')).toBe(62.5);
    expect(formatWeight(100, 'lb')).toBe('220.5 lb');
    expect(formatWeight(61.235, 'kg')).toBe('61.24 kg');
  });
});

describe('the client\'s form', () => {
  it('opens with the saved sets, then BLANK rows up to the prescription — nothing pre-filled from the prescription', () => {
    const fresh = draftsFor(3, [], 'kg');
    expect(fresh).toHaveLength(3);
    expect(fresh.every(draftIsEmpty)).toBe(true);
    expect(validateSets(draftsToInput(fresh, 'kg'))).toEqual({ ok: true, sets: [] });   // an untouched card logs nothing
    const saved = draftsFor(3, [set({ setIndex: 1, reps: 7, weightKg: 61.235 }), set({ reps: 8, weightKg: 61.235, rir: 2, effort: 8 })], 'lb');
    expect(saved).toEqual([
      { reps: '8', weight: '135', rir: 2, effort: 8, workSeconds: '' },
      { reps: '7', weight: '135', rir: null, effort: null, workSeconds: '' },
      { reps: '', weight: '', rir: null, effort: null, workSeconds: '' },
    ]);
    expect(draftsFor(0, null, 'kg')).toHaveLength(1);
    expect(draftsFor(99, null, 'kg')).toHaveLength(SET_LIMITS.maxSets);
  });

  it('the round trip: typed in lb, saved in kg, read back in lb unchanged', () => {
    const typed = [{ reps: '5', weight: '225', rir: 2, effort: 8, workSeconds: '' }, { reps: '5', weight: '225', rir: 1, effort: 9, workSeconds: '' }];
    const v = validateSets(draftsToInput(typed, 'lb'));
    expect(v.ok && v.sets!.map((s) => s.weightKg)).toEqual([102.058, 102.058]);
    expect(draftsFor(2, v.ok ? v.sets : [], 'lb')).toEqual(typed);
  });

  it('flipping the unit converts what was typed, so 135 in lb does not become 135 kg', () => {
    const rows = [{ reps: '8', weight: '135', rir: null, effort: null, workSeconds: '' }, { reps: '', weight: '', rir: null, effort: null, workSeconds: '' }, { reps: '', weight: 'abc', rir: null, effort: null, workSeconds: '' }];
    const kg = convertDrafts(rows, 'lb', 'kg');
    expect(kg.map((r) => r.weight)).toEqual(['61.24', '', 'abc']);
    expect(convertDrafts(kg, 'kg', 'lb')[0].weight).toBe('135');
    expect(convertDrafts(rows, 'kg', 'kg')).toEqual(rows);
  });

  it('"same again" copies the row above\'s reps, weight and seconds — not its effort or reps left', () => {
    const rows = [{ reps: '8', weight: '60', rir: 2, effort: 8, workSeconds: '' }, { reps: '', weight: '', rir: null, effort: null, workSeconds: '' }];
    expect(copyPrevious(rows, 1)[1]).toEqual({ reps: '8', weight: '60', rir: null, effort: null, workSeconds: '' });
    expect(copyPrevious(rows, 0)).toEqual(rows);
  });
});

describe('the anchors, and FEL\'s copy rules', () => {
  it('reps in reserve runs 0–5 with a plain anchor for each ("2 = two more clean reps left"); effort 1–10 names its band', () => {
    expect(RIR_ANCHORS.map((a) => a.rir)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(RIR_ANCHORS[2].text).toBe('2 = two more clean reps left');
    expect(RIR_ANCHORS[5].short).toBe('5+');
    expect(EFFORT_OPTIONS.map((o) => o.effort)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(EFFORT_OPTIONS[6].label).toBe('7 · Drive');
    expect(EFFORT_OPTIONS[9].label).toBe('10 · Full throttle');
  });

  it('no line trips the claims screen, and none speaks of injury, risk or diagnosis', () => {
    const copy = [...RIR_ANCHORS.map((a) => a.text), EFFORT_ANCHOR, ...EFFORT_OPTIONS.map((o) => o.label), ...Object.values(SET_LOG_ERROR_COPY)];
    expect(copy.map((t) => ({ t, flags: screenText(t) })).filter((x) => x.flags.length)).toEqual([]);
    for (const t of copy) expect(t).not.toMatch(/injur|prevent|reduc\w* risk|safe|diagnos|pain|heal|cure|treat|rehab/i);
  });
});
