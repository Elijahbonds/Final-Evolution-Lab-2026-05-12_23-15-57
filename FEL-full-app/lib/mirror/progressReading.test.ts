// MIRROR-PROGRESS (plan Phase 4, 2026-10-07): the one comparable number per movement, where it lives, and what the
// review says about it.
import { describe, expect, it } from 'vitest';
import { compareToRecent, recordCheckValues } from './baselines';
import { PRESS_ROW_PATTERN_ID } from './correctives';
import { initialLungeSession } from './lungeStage';
import {
  CLEAN_SHARE_SAME_BAND, FIRST_LINE, HEADLINE, PROGRESS_MIN_REPS, SAVED_PATTERN_ID, SERVER_UNAVAILABLE_LINE, DEVICE_UNAVAILABLE_LINE,
  TOO_FEW_LINE, WHERE_DEVICE, WHERE_SERVER, lungeReading, movementForPatternId, pressRowReading, progressMovementFor, progressSource,
  progressView, savedPatternId, sideRepReading, squatReading, valueFromRow,
} from './progressReading';

const all = (f: readonly string[]) => f;

describe('which number each movement compares', () => {
  it('the squat: the share of work-set reps with no judged fault, plus each fault\'s share (the per-check values)', () => {
    const r = squatReading([[], ['heelRise'], [], ['heelRise', 'shallow'], [], [], [], []], all)!;
    expect(r.movement).toBe('squat');
    expect(r.value).toBe(0.75);
    expect(r.reps).toBe(8);
    expect(r.checkValues).toEqual({ cleanShare: 0.75, heelRise: 0.25, shallow: 0.125, reps: 8 });
  });

  it('the squat: a fault the review does not judge never costs a clean rep (the knee read off square)', () => {
    const notKnee = (f: readonly string[]) => f.filter((x) => x !== 'kneeValgus');
    expect(squatReading([['kneeValgus'], ['kneeValgus'], ['kneeValgus']], notKnee)!.value).toBe(1);
    expect(squatReading([['kneeValgus'], ['kneeValgus'], ['kneeValgus']], all)!.value).toBe(0);
  });

  it(`fewer than ${PROGRESS_MIN_REPS} reps: no reading (nothing compared, nothing kept, nothing sent)`, () => {
    expect(squatReading([[], []], all)).toBeNull();
    expect(sideRepReading('hinge', { workReps: [{ faults: [], read: true }, { faults: [], read: true }, { faults: [], read: false }] })).toBeNull();
    expect(pressRowReading({ reps: 2, faultCounts: { lat_rhomboid: 1 } })).toBeNull();
  });

  it('the lunge: both sides\' reps, a side read off square left out, and each side\'s own share', () => {
    const s = initialLungeSession();
    s.workReps = { left: [[], ['kneeIn'], [], []], right: [['wobble'], ['wobble'], [], []] };
    s.framedOk = { left: 100, right: 100 };
    const r = lungeReading(s)!;
    expect(r.value).toBe(0.625);
    expect(r.checkValues).toMatchObject({ cleanShare: 0.625, 'left.cleanShare': 0.75, 'right.cleanShare': 0.5, kneeIn: 0.125, wobble: 0.25, reps: 8 });
    // the right side read off square the whole way: only the left counts
    s.framedWrong = { left: 0, right: 100 };
    s.framedOk = { left: 100, right: 2 };
    const left = lungeReading(s)!;
    expect(left.reps).toBe(4);
    expect(left.checkValues['right.cleanShare']).toBeUndefined();
  });

  it('the hinge / push-up: only the READ work-set reps', () => {
    const r = sideRepReading('pushup', { workReps: [
      { faults: [], read: true }, { faults: ['depth'], read: true }, { faults: [], read: true }, { faults: ['bodyLine'], read: false },
    ] })!;
    expect(r).toMatchObject({ movement: 'pushup', reps: 3, value: 0.667 });
  });

  it('the press/row: zone faults per rep from the summary, lower is better; a stored value key is never counted', () => {
    const r = pressRowReading({ reps: 10, faultCounts: { lat_rhomboid: 3, upper_traps: 2, _checkValues: { x: 99 } } })!;
    expect(r.value).toBe(0.5);
    expect(HEADLINE.pressRow.direction).toBe('lowerIsBetter');
    expect(HEADLINE.squat.direction).toBe('higherIsBetter');
  });
});

describe('a saved session reads back as the same number', () => {
  it('squat / lunge: the stored checkValues\' cleanShare', () => {
    const fc = recordCheckValues({ posterior_chain: 1 }, squatReading([[], [], ['heelRise'], []], all)!.checkValues);
    expect(valueFromRow({ patternId: 'squat', reps: 4, faultCounts: fc })).toBe(0.75);
    expect(valueFromRow({ patternId: 'lunge', reps: 4, faultCounts: recordCheckValues({}, { cleanShare: 0.5 }) })).toBe(0.5);
  });

  it('the press/row: derived from the columns every press/row session has always stored', () => {
    expect(valueFromRow({ patternId: PRESS_ROW_PATTERN_ID, reps: 4, faultCounts: { lat_rhomboid: 2 } })).toBe(0.5);
  });

  it('null for a row from before (no values), another pattern, junk, or an out-of-range share', () => {
    expect(valueFromRow({ patternId: 'squat', reps: 8, faultCounts: { lat_rhomboid: 2 } })).toBeNull();
    expect(valueFromRow({ patternId: 'carry', reps: 8, faultCounts: recordCheckValues({}, { cleanShare: 0.5 }) })).toBeNull();
    expect(valueFromRow({ patternId: 'squat', reps: 8, faultCounts: recordCheckValues({}, { cleanShare: 7 }) })).toBeNull();
    expect(valueFromRow({ patternId: 'squat', reps: 8, faultCounts: null })).toBeNull();
  });
});

describe('the saved patternId per tab', () => {
  it('the press/row keeps the id correctives reads; every other tab is saved under its own id (it was the press/row\'s)', () => {
    expect(SAVED_PATTERN_ID.pressRow).toBe(PRESS_ROW_PATTERN_ID);
    expect(savedPatternId('pressRow', 'split-stance-press-row')).toBe('split-stance-press-row');
    expect(savedPatternId('squat', 'split-stance-press-row')).toBe('squat');
    expect(savedPatternId('lunge', 'split-stance-press-row')).toBe('lunge');
    expect(savedPatternId('jump', 'split-stance-press-row')).toBe('jump');
    expect(savedPatternId('screen', 'split-stance-press-row')).toBe('screen');
    expect(savedPatternId('somethingNew', 'runtime-id')).toBe('runtime-id');
    for (const m of ['squat', 'lunge', 'pressRow', 'hinge', 'pushup'] as const) expect(movementForPatternId(SAVED_PATTERN_ID[m])).toBe(m);
    expect(progressMovementFor('jump')).toBeNull();
    expect(progressMovementFor('screen')).toBeNull();
  });
});

describe('where the history lives (owner decision 1: under-18s on the device only)', () => {
  it('server only for an exact true from the server gate, and only on the squat, lunge and press/row', () => {
    expect(progressSource('squat', true)).toBe('server');
    expect(progressSource('lunge', true)).toBe('server');
    expect(progressSource('pressRow', true)).toBe('server');
    // the hinge and the push-up send nothing for anyone
    expect(progressSource('hinge', true)).toBe('device');
    expect(progressSource('pushup', true)).toBe('device');
    // a minor, no birth year, an adult who has not opted in: canSaveScan is false
    for (const v of [false, undefined, null, 'true', 1]) expect(progressSource('squat', v)).toBe('device');
  });
});

describe('what the review says', () => {
  it('compared: the number, the recent mean, and better / same / not as clean', () => {
    const v = progressView('squat', 'server', { kind: 'read', comparison: compareToRecent(0.75, [0.5, 0.5, 0.5], 'higherIsBetter', CLEAN_SHARE_SAME_BAND) });
    expect(v).toMatchObject({ kind: 'compared', heading: 'vs your last 3', where: WHERE_SERVER });
    expect(v.line).toBe('Clean reps 75% — your last 3 averaged 50%. Better than your last 3.');
    const w = progressView('pressRow', 'device', { kind: 'read', comparison: compareToRecent(1.5, [0.5], 'lowerIsBetter', 0.25) });
    expect(w.heading).toBe('vs your last 1');
    expect(w.line).toBe('Zone faults per rep 1.5 — your last set 0.5. Not as clean as your last set.');
    expect(w.where).toBe(WHERE_DEVICE);
  });

  it('first, too few, and unavailable — each says so plainly; a phone-only history always says it is phone-only', () => {
    expect(progressView('lunge', 'device', { kind: 'read', comparison: { kind: 'first' } }).line).toBe(FIRST_LINE);
    expect(progressView('lunge', 'device', { kind: 'tooFew' }).line).toBe(TOO_FEW_LINE);
    expect(progressView('lunge', 'server', { kind: 'unavailable' }).line).toBe(SERVER_UNAVAILABLE_LINE);
    expect(progressView('lunge', 'device', { kind: 'unavailable' }).line).toBe(DEVICE_UNAVAILABLE_LINE);
    expect(WHERE_DEVICE).toMatch(/this phone only/);
    expect(WHERE_DEVICE).toMatch(/never sent/);
  });

  it('no score words, no medical words', () => {
    const lines = [FIRST_LINE, TOO_FEW_LINE, SERVER_UNAVAILABLE_LINE, DEVICE_UNAVAILABLE_LINE, WHERE_DEVICE, WHERE_SERVER];
    for (const l of lines) expect(l).not.toMatch(/score|grade|injur|diagnos|weak|fail/i);
  });
});
