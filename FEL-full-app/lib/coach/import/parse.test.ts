// COACH-PARITY (2026-10-26): whole programs as coaches paste them — a typed week from a notes app, a spreadsheet copy with
// merged cells, a Google Sheets CSV export with quoted commas, an Instagram-style post, and a sheet with no header —
// read into weeks, days and lines. The samples are in tests/coach-parity/samples/.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { headerMap, looksTabular, parseProgram, parseTable, parseText, restCellSeconds, sectionOf, shapeOf, weekDayOf } from './parse';
import { parseCsv } from './csv';
import type { ParsedProgram } from './types';

const sample = (f: string) => readFileSync(join(__dirname, '../../../tests/coach-parity/samples', f), 'utf8');
const lines = (p: ParsedProgram) => p.weeks.flatMap((w) => w.days.flatMap((d) => d.items.map((i) => `${w.label} | ${d.label} | ${i.superset ?? '-'} ${i.section ?? '-'} | ${i.name} | ${i.sets ?? '?'}x${i.reps ?? (i.workSeconds ? `${i.workSeconds}s` : '?')} | ${i.load ?? ''} | ${i.restSeconds ?? ''}`)));

describe('a typed week (notes app)', () => {
  const p = parseProgram(sample('typed-week.txt'));
  it('reads every line into its week, day, section and superset', () => {
    expect(p.format).toBe('text');
    expect(lines(p)).toEqual([
      'Week 1 · Accumulation | Mon · Lower | - - | Back Squat | 4x6 | 70% | 120',
      'Week 1 · Accumulation | Mon · Lower | B - | RFESS | 3x8 each leg | RPE 7 | ',
      'Week 1 · Accumulation | Mon · Lower | B - | Nordic curl | 3x5 |  | ',
      'Week 1 · Accumulation | Mon · Lower | - - | Copenhagen plank | 2x20 s each side |  | ',
      'Week 1 · Accumulation | Wed · Upper | - - | Bench Press | 4x6 | 72.5% | ',
      'Week 1 · Accumulation | Wed · Upper | B - | Chest-supported DB row | 3x10 |  | ',
      'Week 1 · Accumulation | Wed · Upper | B - | Half-kneeling landmine press | 3x8 each side |  | ',
      'Week 1 · Accumulation | Wed · Upper | - - | Face pulls | 3x15 |  | ',
      "Week 1 · Accumulation | Fri · Power | - prep | Bike | 1x300s |  | ",
      "Week 1 · Accumulation | Fri · Power | - prep | World's greatest stretch | 2x5 each side |  | ",
      'Week 1 · Accumulation | Fri · Power | - key | Box jump | 4x3 |  | ',
      'Week 1 · Accumulation | Fri · Power | - key | Trap bar deadlift | 5x3 | 80% | 180',
      'Week 1 · Accumulation | Fri · Power | - finish | Sled push | 6x20 m |  | ',
    ]);
  });
  it('the bracketed rest and the Notes line are kept', () => {
    const squat = p.weeks[0].days[0].items[0];
    expect(squat.note).toBeNull();
    expect(squat.restSeconds).toBe(120);
    expect(p.weeks[0].days[0].items[3].note).toBe('film the top set of squats');
  });
  it('"Sat: Rest" makes no session; everything was read', () => {
    expect(shapeOf(p)).toEqual({ weeks: 1, days: 3, items: 13 });
    expect(p.readRate).toBe(1);
    expect(p.skipped).toEqual([]);
  });
});

describe('a spreadsheet copy (tabs, merged cells copy as blanks)', () => {
  const p = parseProgram(sample('sheet-copy.tsv'));
  it('is a table; the header row is skipped; blanks repeat the week and day above', () => {
    expect(p.format).toBe('table');
    expect(p.skipped).toEqual([{ line: 1, raw: 'Week | Day | Exercise | Sets | Reps | Load | Rest | Notes', why: 'header_row' }]);
    expect(shapeOf(p)).toEqual({ weeks: 2, days: 4, items: 10 });
    expect(lines(p).slice(0, 6)).toEqual([
      'Week 1 | Mon | - - | Back Squat | 5x5 | 75% | 180',
      'Week 1 | Mon | - - | Romanian Deadlift | 3x8 | RPE 7 | 90',
      'Week 1 | Mon | - - | Walking Lunge | 3x10 each side | BW | 60',
      'Week 1 | Thu | - - | Bench Press | 5x5 | 75% | 180',
      'Week 1 | Thu | - - | Pull-Up | 4xAMRAP |  | 90',
      'Week 1 | Thu | - - | Plank | 3x45s |  | 45',
    ]);
    expect(p.weeks[0].days[0].items[0].note).toBe('Belt on top sets');
    expect(p.weeks[1].days[0].items[0].load).toBe('77.5%');
  });
});

describe('a CSV export (quoted commas, doubled quotes)', () => {
  const p = parseProgram(sample('export.csv'), { csv: true });
  it('reads the "Sets x Reps" and "Intensity" columns and keeps quoted names whole', () => {
    expect(lines(p)).toEqual([
      'Week 1 | Day 1 | - - | Squat, Back | 5x5 | 75% | ',
      'Week 1 | Day 1 | - - | Bench Press | 5x5 | 75% | ',
      'Week 1 | Day 1 | - - | Row, Barbell | 4x8 | RPE 8 | ',
      'Week 1 | Day 2 | - - | Deadlift | 3x5 | 80% | ',
      'Week 1 | Day 2 | - - | Overhead Press | 4x6 | 70% | ',
      'Week 1 | Day 2 | - - | Chin-ups | 3xAMRAP |  | ',
    ]);
    expect(p.weeks[0].days[0].items[0].note).toBe('Pause 1s, then drive');
    expect(p.weeks[0].days[1].items[2].note).toBe('Full hang "dead" start');
  });
});

describe('an Instagram-style post', () => {
  const p = parseProgram(sample('instagram.txt'));
  it('reads the days and lines; a "Rest …" line fills the rest; a pep-talk sentence becomes a note', () => {
    expect(lines(p)).toEqual([
      'Week 1 | Day 1 · LOWER BODY 🔥 | - - | Squats | 3x10 |  | 75',
      'Week 1 | Day 1 · LOWER BODY 🔥 | - - | Lunges | 3x12 each leg |  | 75',
      'Week 1 | Day 1 · LOWER BODY 🔥 | - - | Glute bridges | 3x15 |  | 75',
      'Week 1 | Day 2 · UPPER BODY 💪 | - - | Push-ups | 3xmax |  | ',
      'Week 1 | Day 2 · UPPER BODY 💪 | - - | Dumbbell rows | 3x12 each side |  | ',
      'Week 1 | Day 2 · UPPER BODY 💪 | - - | Shoulder press | 3x10 | 15 lb | ',
    ]);
    expect(p.weeks[0].days[1].items[2].note).toMatch(/full focus/);
    expect(p.weeks[0].days[0].items[2].warnings).toEqual(['circuit']);
  });
});

describe('a sheet with no header row', () => {
  it('reads day + exercise + sets + reps + load by position', () => {
    const p = parseProgram(sample('headerless.tsv'));
    expect(lines(p)).toEqual([
      'Week 1 | Mon | - - | Back squat | 5x5 | 75% | ',
      'Week 1 | Mon | - - | Bench | 5x5 | 70% | ',
      'Week 1 | Wed | - - | Deadlift | 3x5 | 80% | ',
      'Week 1 | Wed | - - | Pull-ups | 3x8 |  | ',
    ]);
  });
});

describe('the edges', () => {
  it('no week and no day: one week, one day', () => {
    const p = parseText('Back squat 3x5\nBench 3x5');
    expect(p.weeks.map((w) => [w.label, w.days.map((d) => d.label)])).toEqual([['Week 1', ['Day 1']]]);
  });
  it('"Mon: Back squat 5x5" is a day AND its first line; "Tue - Upper" is a day label', () => {
    const p = parseText('Mon: Back squat 5x5\nTue - Upper\nBench 3x5');
    expect(p.weeks[0].days.map((d) => [d.label, d.day, d.items.map((i) => i.name)])).toEqual([['Mon', 'Mon', ['Back squat']], ['Tue · Upper', 'Tue', ['Bench']]]);
  });
  it('"Day 1 - Lower: Squat 5x5", "Session A", "Workout 2", "Lower body:" and "Upper A" all start days', () => {
    const p = parseText('Day 1 - Lower: Squat 5x5\nSession A\nBench 3x8\nWorkout 2\nRow 3x8\nLower body:\nLunge 3x8\nUpper A\nPress 3x8');
    expect(p.weeks[0].days.map((d) => d.label)).toEqual(['Day 1 · Lower', 'Session A', 'Workout 2', 'Lower body', 'Upper A']);
  });
  it('week headers in many spellings, and a day on the same line', () => {
    const p = parseText('## Week 1\nBack squat 3x5\nWk2 - Deload\nBack squat 2x5\nW3: Day 1\nBack squat 3x3');
    expect(p.weeks.map((w) => [w.label, w.days[0].label])).toEqual([['Week 1', 'Day 1'], ['Week 2 · Deload', 'Day 1'], ['Week 3', 'Day 1']]);
  });
  it('comments and a header row are skipped and listed; an unreadable line is listed, never silently lost', () => {
    const p = parseText('// my notes\nExercise Sets Reps\n12345\nBack squat 3x5');
    expect(p.skipped.map((s) => s.why)).toEqual(['comment', 'header_row', 'unreadable']);
    expect(p.readRate).toBe(0.5);
  });
  it('a long sentence with no dose and nothing above it is unread, not an exercise', () => {
    const p = parseText('This program is designed to build strength over eight weeks for intermediate lifters\nSquat 3x5');
    expect(p.weeks[0].days[0].items.map((i) => i.name)).toEqual(['Squat']);
    expect(p.skipped).toHaveLength(1);
  });
  it('a paste over the limit is cut, not refused, and an empty one reads nothing', () => {
    expect(parseText('').weeks).toEqual([]);
    expect(shapeOf(parseText('Squat 3x5\n'.repeat(1000))).items).toBe(800);
  });
  it('helpers', () => {
    expect(sectionOf('Warm-up:')).toBe('prep');
    expect(sectionOf('Accessories')).toBe('assist');
    expect(sectionOf('Cool down')).toBe('cooldown');
    expect(sectionOf('Back squat')).toBeNull();
    expect(weekDayOf('thursday')).toBe('Thu');
    expect(weekDayOf('Thurs - legs')).toBe('Thu');
    expect(weekDayOf('Monster walk')).toBeNull();
    expect(headerMap(['Exercise', 'Sets', 'Reps'])).not.toBeNull();
    expect(headerMap(['Monday', 'Back squat', '5'])).toBeNull();
    expect(restCellSeconds('90')).toBe(90);
    expect(restCellSeconds('2 min')).toBe(120);
    expect(looksTabular('a\tb\nc\td')).toBe(true);
    expect(looksTabular('Squat 3x5\nBench 3x5')).toBe(false);
  });
  it('a CSV in a European export (semicolons) reads the same', () => {
    const p = parseTable(parseCsv('Exercise;Sets;Reps;Load\nBack squat;5;5;75%\n'));
    expect(lines(p)).toEqual(['Week 1 | Day 1 | - - | Back squat | 5x5 | 75% | ']);
  });
});
