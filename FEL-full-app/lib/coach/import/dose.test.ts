// COACH-PARITY (2026-10-26): one exercise line as coaches really type it → a name and a dose. Every shape here was seen
// in coaches' programs (notes apps, spreadsheets, PDFs pasted as text); each is read the same way every time.
import { describe, expect, it } from 'vitest';
import { normalise, readDose, readRepsUnit, toSeconds } from './dose';

type Want = Partial<ReturnType<typeof readDose>>;
const cases: [string, Want][] = [
  ['Back squat 5x5 @ 75%', { name: 'Back squat', sets: 5, reps: '5', load: '75%' }],
  ['Back Squat 5 x 5 @ 75% 1RM', { name: 'Back Squat', sets: 5, reps: '5', load: '75% 1RM' }],
  ['Bench Press — 4 x 6-8 @ RPE 8, rest 2 min', { name: 'Bench Press', sets: 4, reps: '6-8', load: 'RPE 8', restSeconds: 120 }],
  ['Bench press 4×6–8 @ RPE 8', { name: 'Bench press', sets: 4, reps: '6-8', load: 'RPE 8' }],
  ['3 sets of 10 goblet squats', { name: 'goblet squats', sets: 3, reps: '10' }],
  ['Goblet squat 3 sets x 10 reps', { name: 'Goblet squat', sets: 3, reps: '10' }],
  ['5x5 Back squat @ 100kg', { name: 'Back squat', sets: 5, reps: '5', load: '100kg' }],
  ['Plank 3 x :40', { name: 'Plank', sets: 3, reps: null, workSeconds: 40 }],
  ['Plank 3x40s', { name: 'Plank', sets: 3, workSeconds: 40 }],
  ['Plank 3 x 0:45', { name: 'Plank', sets: 3, workSeconds: 45 }],
  ['Wall sit 2 x 1 min', { name: 'Wall sit', sets: 2, workSeconds: 60 }],
  ['Copenhagen plank 2 x 20s each side', { name: 'Copenhagen plank', sets: 2, reps: '20 s each side', workSeconds: 20 }],
  ['SL RDL 3x8/leg @ 20kg', { name: 'SL RDL', sets: 3, reps: '8 each leg', load: '20kg' }],
  ['DB row 3x10 each side (pause at top)', { name: 'DB row', sets: 3, reps: '10 each side', load: null, note: 'pause at top' }],
  ['Half-kneeling landmine press 3x8 each', { name: 'Half-kneeling landmine press', sets: 3, reps: '8 each side' }],
  ['Pallof press 3 x 10 e/s', { name: 'Pallof press', sets: 3, reps: '10 each side' }],
  ['Back squat 5/5/3/3/1 @ 80%', { name: 'Back squat', sets: 5, reps: '5/5/3/3/1', load: '80%' }],
  ['Deadlift 5/5/5 @ 80%', { name: 'Deadlift', sets: 3, reps: '5' }],
  ['Pull-ups 3xAMRAP', { name: 'Pull-ups', sets: 3, reps: 'AMRAP' }],
  ['Push-ups: 3 x max', { name: 'Push-ups', sets: 3, reps: 'max' }],
  ['Sled push 6 x 20m', { name: 'Sled push', sets: 6, reps: '20 m' }],
  ['Farmer carry 4 x 40 meters @ 32kg', { name: 'Farmer carry', sets: 4, reps: '40 m', load: '32kg' }],
  ['Squat 3RM', { name: 'Squat', sets: 1, reps: '3RM' }],
  ['Box jump 3x5 tempo 31X1', { name: 'Box jump', sets: 3, reps: '5', tempo: null, note: 'tempo 31X1', warnings: ['tempo_kept_in_note'] }],
  ['Back squat 3x8 tempo 3-1-1-0', { name: 'Back squat', sets: 3, reps: '8', tempo: '3-1-1-0' }],
  ['Back squat 3x8 tempo 3110', { tempo: '3-1-1-0' }],
  ['Back squat 3x8 3-1-1-0', { name: 'Back squat', tempo: '3-1-1-0' }],
  ['Front squat 4x3 @70-75% 1RM rest 3min', { name: 'Front squat', sets: 4, reps: '3', load: '70-75% 1RM', restSeconds: 180 }],
  ['Romanian deadlift 3x8 (rest 90s)', { name: 'Romanian deadlift', restSeconds: 90, note: null }],
  ['Hip thrust 3x12, R: 60', { name: 'Hip thrust', restSeconds: 60 }],
  ['Bench 4×6 @ 225#', { name: 'Bench', load: '225#' }],
  ['Bench 4x6 225 lbs', { name: 'Bench', load: '225 lbs' }],
  ['Push-ups 50 reps', { name: 'Push-ups', sets: 1, reps: '50' }],
  ['Bike 5 min', { name: 'Bike', sets: 1, workSeconds: 300 }],
  ['EMOM 10: 3 power clean @ 70%', { name: 'power clean', sets: 10, reps: '3', load: '70%', warnings: ['circuit'] }],
  ['Glute bridges x 15 (3 rounds)', { name: 'Glute bridges', sets: 3, reps: '15', warnings: ['circuit'] }],
  ['Pogo hops 3 x 20', { name: 'Pogo hops', sets: 3, reps: '20' }],
  ['Back squat - drive the knees out 4x5', { name: 'Back squat', sets: 4, reps: '5', note: 'drive the knees out' }],
  ['Air squat 3x20 @ bodyweight', { name: 'Air squat', load: 'bodyweight' }],
  ['Lunge 3x10 BW', { name: 'Lunge', load: 'BW' }],
  ['Back squat 12x3 @ 60%', { sets: 10, warnings: ['sets_capped'], note: '12 sets written' }],
  ['90/90 hip switch 2x6 each', { name: '90/90 hip switch', sets: 2, reps: '6 each side' }],
  ['Foam roll quads', { name: 'Foam roll quads', sets: null, reps: null, warnings: ['no_dose'] }],
];

describe('readDose', () => {
  it.each(cases)('%s', (line, want) => {
    const d = readDose(line);
    expect(d).toMatchObject(want);
    if (!('warnings' in want)) expect(d.warnings).toEqual([]);
  });

  it('every line with a dose says so; one without does not', () => {
    for (const [line] of cases) expect(readDose(line).hasDose, line).toBe(!/Foam roll/.test(line));
  });

  it('a long reps or load is trimmed to FEL\'s 24 characters and says so', () => {
    const d = readDose('Bench 3x8 @ 60% of your best single from last week');
    expect(d.load!.length).toBeLessThanOrEqual(24);
    expect(d.warnings).toContain('load_trimmed');
  });

  it('a work time over 30 minutes is capped and says so', () => {
    expect(readDose('Easy run 1 x 45 min')).toMatchObject({ workSeconds: 1800, warnings: ['work_capped'] });
  });
});

describe('helpers', () => {
  it('normalise', () => expect(normalise('Squat  5×5 — 75% ')).toBe('Squat 5x5 - 75%'));
  it('toSeconds', () => {
    expect(toSeconds('90', undefined, undefined)).toBe(90);
    expect(toSeconds('2', undefined, undefined)).toBe(120);
    expect(toSeconds('2:30', undefined, undefined)).toBe(150);
    expect(toSeconds('1', '2', 'min')).toBe(90);
    expect(toSeconds('60', '90', 'sec')).toBe(75);
  });
  it('readRepsUnit', () => {
    expect(readRepsUnit('40s')).toEqual({ workSeconds: 40 });
    expect(readRepsUnit(':30')).toEqual({ workSeconds: 30 });
    expect(readRepsUnit('1:30')).toEqual({ workSeconds: 90 });
    expect(readRepsUnit('400 m')).toEqual({ reps: '400 m' });
    expect(readRepsUnit('20 yd')).toEqual({ reps: '20 yd' });
    expect(readRepsUnit('8')).toBeNull();
  });
});
