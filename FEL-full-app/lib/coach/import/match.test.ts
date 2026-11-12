// COACH-PARITY (2026-10-26): imported names matched against the coach's own catalogue and the REAL library (lib/library,
// 5,000+ entries, through its own search), with the confidence the review grid shows.
import { beforeAll, describe, expect, it } from 'vitest';
import { loadLibraryFiles } from '@/lib/library/files';
import { buildIndex, type LibraryIndex } from '@/lib/library/search/engine';
import { flagged, matchName, matchProgram } from './match';
import { parseText } from './parse';

let index: LibraryIndex;
beforeAll(() => { index = buildIndex(loadLibraryFiles()); });
const ctx = (catalogue: { id: string; name: string }[] = [], youth = false) => ({ index, catalogue, youth });

describe('matchName against the library', () => {
  it.each([
    ['Romanian deadlift', 'Romanian Deadlift', 'exact'],
    ['RDL', 'Romanian Deadlift', 'exact'],
    ['Trap bar deadlift', 'Trap Bar Deadlift', 'exact'],
    ['Goblet squats', 'Goblet Squat', 'exact'],
    ['Face pulls', 'Face Pull', 'exact'],
    ['Nordic curl', 'Nordic Curl', 'exact'],
    ['Copenhagen plank', 'Copenhagen Plank', 'exact'],
    ['SL RDL', 'Single-Leg Romanian Deadlift', 'exact'],
    ['Sled push', 'Sled Push', 'exact'],
    ['Back squat', 'Barbell Back Squat', 'high'],
    ['Pogo hops', 'Pogo Hop', 'exact'],
    ['Plank', 'Plank', 'exact'],
    ['Push-ups', 'Pushups', 'exact'],
    ['Chin-ups', 'Chin-Up', 'exact'],
    ['Glute bridges', 'Glute Bridge', 'exact'],
    ['RFESS', 'Rear-Foot-Elevated Split Squat', 'exact'],
    ['Chest-supported DB row', 'Chest-Supported Dumbbell Row', 'exact'],
    ['Squat, Back', 'Barbell Back Squat', 'high'],
  ])('%s → %s (%s)', (name, want, confidence) => {
    const m = matchName(name, ctx());
    expect(m).toMatchObject({ kind: 'library', name: want, confidence });
    expect(flagged(m)).toBe(false);
  });

  it('a vague name is matched low and flagged; nonsense is unmatched and flagged', () => {
    expect(matchName('Bench', ctx()).confidence).toBe('low');   // not "Bench Dips" with any confidence
    const bike = matchName('Bike', ctx());
    expect(bike.confidence).toBe('low');
    expect(flagged(bike)).toBe(true);
    const junk = matchName('Zxqv flombo', ctx());
    expect(junk).toMatchObject({ kind: 'none', id: null, confidence: 'none' });
    expect(flagged(junk)).toBe(true);
  });

  it('suggestions list the next best, drafts labelled', () => {
    const m = matchName('Bench press', ctx());
    expect(m.suggestions.length).toBeGreaterThanOrEqual(3);
    expect(m.suggestions.every((s) => s.kind === 'library' && typeof s.status === 'string')).toBe(true);
  });

  it('the coach\'s own row wins a tie: their words stay theirs', () => {
    const m = matchName('Back Squat', ctx([{ id: 'pe-1', name: 'back squat' }]));
    expect(m).toMatchObject({ kind: 'catalogue', id: 'pe-1', confidence: 'exact' });
    expect(m.suggestions[0]).toEqual({ kind: 'catalogue', id: 'pe-1', name: 'back squat' });
  });

  it('youth rules leave adults-only entries out of the match', () => {
    const adultsOnly = index.docs.find((e) => !e.youthOk && e.review.status === 'approved')!;
    expect(matchName(adultsOnly.name, ctx()).name).toBe(adultsOnly.name);
    const youth = matchName(adultsOnly.name, ctx([], true));
    expect(youth.id).not.toBe(adultsOnly.id);
    expect(youth.suggestions.some((s) => s.id === adultsOnly.id)).toBe(false);
  });
});

describe('matchProgram', () => {
  it('matches every line once per distinct name and counts what needs a look', () => {
    const p = parseText('Mon\nBack squat 5x5\nRDL 3x8\nZxqv flombo 3x3\nTue\nBack squat 3x5');
    const m = matchProgram(p, ctx());
    expect(m.matches.map((w) => w.map((d) => d.map((x) => x.confidence)))).toEqual([[['high', 'exact', 'none'], ['high']]]);
    expect(m.flagged).toBe(1);
    expect(m.counts).toEqual({ exact: 1, high: 2, low: 0, none: 1 });
  });
});
