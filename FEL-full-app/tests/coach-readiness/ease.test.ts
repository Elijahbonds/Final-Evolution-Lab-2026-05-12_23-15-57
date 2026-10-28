// COACH-READINESS: easing only ever reduces load. The drafts engine's own step (dose.ts easeStep) on Today's work rows;
// every other row as written; neverHarder() catches any increase on any axis.
import { describe, expect, it } from 'vitest';
import { easeRow, easeSession, neverHarder } from '@/lib/coach/readiness/ease';
import type { TreeExercise } from '@/lib/coach/loop';
import { EFFORT_BANDS } from '@/lib/coach/taxonomy';

const row = (o: Partial<TreeExercise>): TreeExercise => ({
  id: 'e1', order: 1, exerciseId: 'x1', name: 'Back squat', sets: 4, reps: '5', load: '100 kg', tempo: '', restSeconds: 120, coachNote: null,
  section: 'key', isKeySet: true, supersetGroup: null, workSeconds: null, holdSeconds: null, setupCues: [], effortBand: null, ...o,
});

describe('easeRow', () => {
  it('a key lift: one set fewer and ~10 % off a written weight', () => {
    const r = easeRow(row({}), { youth: false });
    expect(r.row).toMatchObject({ sets: 3, load: '90 kg' });
    expect(r.what).toBe('4 → 3 sets, 100 kg → 90 kg');
  });

  it('an RPE load: one RPE down; a band: one band down; never below MIN_EASE_SETS', () => {
    expect(easeRow(row({ sets: 2, load: 'RPE 8' }), { youth: false }).row).toMatchObject({ sets: 2, load: 'RPE 7' });
    const band = EFFORT_BANDS[2]?.id ?? EFFORT_BANDS[1].id;
    const eased = easeRow(row({ sets: 3, load: 'body', effortBand: band }), { youth: false }).row;
    expect(EFFORT_BANDS.findIndex((b) => b.id === eased.effortBand)).toBeLessThanOrEqual(EFFORT_BANDS.findIndex((b) => b.id === band));
  });

  it('prep, prime, cool-down, timed rows and breath/mobility work are served as written', () => {
    for (const section of ['prep', 'prime', 'cooldown'] as const) expect(easeRow(row({ section }), { youth: false }).what).toBeNull();
    expect(easeRow(row({ workSeconds: 30 }), { youth: false }).what).toBeNull();
    expect(easeRow(row({}), { youth: false, pattern: 'breath' }).what).toBeNull();
    expect(easeRow(row({}), { youth: false, pattern: 'mobility' }).what).toBeNull();
  });

  it('PROPERTY: over every combination of sets, loads, bands and sections, the eased row is never harder', () => {
    const loads = ['', 'body', '60 kg', '135 lbs @ RPE7', 'RPE 9', '2.5 kg', '5 lb', 'RPE6', '40kg', 'light'];
    const bands = [null, ...EFFORT_BANDS.map((b) => b.id)];
    const sections = ['prep', 'prime', 'key', 'assist', 'finish', 'cooldown'] as const;
    let n = 0, changed = 0;
    for (const sets of [1, 2, 3, 4, 5, 6]) for (const load of loads) for (const effortBand of bands) for (const section of sections) for (const youth of [false, true]) {
      const before = row({ sets, load, effortBand, section });
      const { row: after, what } = easeRow(before, { youth });
      expect(neverHarder(before, after)).toBe(true);
      expect(after.sets).toBeLessThanOrEqual(before.sets);
      expect(after.reps).toBe(before.reps);
      expect(after.exerciseId).toBe(before.exerciseId);
      if (what) changed++;
      n++;
    }
    expect(n).toBeGreaterThan(1000);
    expect(changed).toBeGreaterThan(100);
  });
});

describe('neverHarder', () => {
  const b = row({ sets: 3, load: '60 kg @ RPE7', effortBand: EFFORT_BANDS[1].id });
  it('refuses more sets, more weight, a higher RPE, a harder band, changed reps', () => {
    expect(neverHarder(b, { ...b, sets: 4 })).toBe(false);
    expect(neverHarder(b, { ...b, load: '62.5 kg @ RPE7' })).toBe(false);
    expect(neverHarder(b, { ...b, load: '60 kg @ RPE8' })).toBe(false);
    expect(neverHarder(b, { ...b, effortBand: EFFORT_BANDS[2].id })).toBe(false);
    expect(neverHarder(b, { ...b, reps: '10' })).toBe(false);
    expect(neverHarder(b, { ...b, sets: 2, load: '55 kg @ RPE6' })).toBe(true);
    expect(neverHarder(row({ load: '100 kg' }), row({ load: '200 lb' }))).toBe(true);  // 200 lb ≈ 90.7 kg
    expect(neverHarder(row({ load: '100 kg' }), row({ load: '230 lb' }))).toBe(false); // ≈ 104 kg
  });
});

describe('easeSession', () => {
  it('lists what changed, by row, and leaves the rest', () => {
    const { rows, eased } = easeSession([row({ id: 'a', section: 'prep', name: 'Hip airplane' }), row({ id: 'b' }), row({ id: 'c', section: 'assist', name: 'Split squat', sets: 3, load: '20 kg' })], { youth: false });
    expect(eased.map((e) => e.id)).toEqual(['b', 'c']);
    expect(rows[0]).toEqual(row({ id: 'a', section: 'prep', name: 'Hip airplane' }));
    expect(rows[2]).toMatchObject({ sets: 2, load: '17.5 kg' });
  });
});
