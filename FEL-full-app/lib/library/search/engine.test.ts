// EXERCISE-LIBRARY (2026-10-25): search people can actually use — synonyms, typos, plurals, facets, zero results, speed.
import { describe, expect, it } from 'vitest';
import { loadLibraryFiles } from '../files';
import type { LibraryExercise } from '../types';
import { buildIndex, search, type SearchFilters } from './engine';
import { editDistance, nameKey, stem, terms } from './text';

const ALL = loadLibraryFiles();
const index = buildIndex(ALL);
const opts = { drafts: true, limit: 10 } as const;
const top = (q: string, f: SearchFilters = {}, n = 5) => search(index, q, f, opts).hits.slice(0, n).map((h) => h.entry);
const names = (q: string, f: SearchFilters = {}, n = 5) => top(q, f, n).map((e) => e.name);

describe('text: plurals, suffixes, abbreviations', () => {
  it('stems plurals and -ing the same on both sides', () => {
    expect(stem('squats')).toBe(stem('squat'));
    expect(stem('lunges')).toBe(stem('lunge'));
    expect(stem('presses')).toBe(stem('press'));
    expect(stem('crunches')).toBe(stem('crunch'));
    expect(stem('jumping')).toBe(stem('jump'));
    expect(stem('skipping')).toBe(stem('skip'));
    expect(stem('raises')).toBe(stem('raise'));
    expect(stem('flies')).toBe(stem('fly'));
  });
  it('folds the abbreviations coaches type', () => {
    expect(terms('DB RDL')).toEqual(terms('dumbbell romanian deadlift'));
    expect(terms('KB swing')).toEqual(terms('kettlebell swing'));
    expect(terms('pushups')).toEqual(terms('push-up'));
    expect(terms('1-arm row')).toEqual(terms('single arm row'));
    expect(terms('hammy curl')).toEqual(terms('hamstring curl'));
    expect(nameKey('Squat, Goblet')).toBe(nameKey('goblet squats'));
  });
  it('edit distance counts a transposition as one edit and gives up past the budget', () => {
    expect(editDistance('sqaut', 'squat')).toBe(1);
    expect(editDistance('kettelbell', 'kettlebell')).toBe(1);
    expect(editDistance('abc', 'xyzxyz', 2)).toBe(3);
  });
});

describe('synonyms', () => {
  it('runs on the full library: 5,000+ entries (owner decision 2026-10-25)', () => {
    expect(ALL.length).toBeGreaterThanOrEqual(5000);
  });
  it('RDL = Romanian deadlift', () => {
    expect(names('rdl')[0]).toMatch(/romanian deadlift/i);
    expect(names('DB RDL')[0]).toBe('Dumbbell Romanian Deadlift');
  });
  it('KB = kettlebell, DB = dumbbell', () => {
    expect(top('kb swing').every((e) => e.equipment.includes('kettlebell'))).toBe(true);
    expect(top('db bench press')[0].name).toMatch(/dumbbell bench press/i);
  });
  it('plyo finds plyometrics', () => {
    expect(top('plyo', {}, 10).filter((e) => e.category === 'plyometric' || e.pattern === 'locomotion').length).toBeGreaterThanOrEqual(8);
  });
  it('bodyweight = no equipment', () => {
    const hits = top('bodyweight squat', {}, 5);
    expect(hits[0].name).toBe('Bodyweight Squat');
    expect(top('no equipment lunge', {}, 5).filter((e) => e.equipment.length === 0).length).toBeGreaterThanOrEqual(4);
  });
  it('hammy = hamstrings', () => {
    expect(top('hammy', {}, 5).every((e) => [...e.primaryMuscles, ...e.secondaryMuscles].includes('hamstrings'))).toBe(true);
  });
  it('vert = vertical jump', () => {
    expect(top('vert', {}, 5).filter((e) => e.goals.includes('vertical')).length).toBeGreaterThanOrEqual(4);
  });
  it('vert means the vertical-jump goal, not the word: "Vertical Swing" ranks below real vertical-jump work', () => {
    const hits = top('vert', {}, 10);
    const swing = hits.findIndex((e) => e.name === 'Vertical Swing');
    expect(hits.slice(0, 5).every((e) => e.goals.includes('vertical'))).toBe(true);
    expect(swing === -1 || swing >= 5).toBe(true);
  });
  it('"trap bar" is one implement, not the traps muscle plus a bar', () => {
    expect(names('trap bar deadlift', {}, 1)[0]).toBe('Trap Bar Deadlift');
    expect(top('trap bar', {}, 3).every((e) => e.equipment.includes('trap-bar'))).toBe(true);
  });
  it('lay up = layup, abs = trunk', () => {
    expect(names('lay up')[0]).toMatch(/layup/i);
    expect(top('abs', {}, 5).every((e) => [...e.primaryMuscles, ...e.secondaryMuscles].includes('abs') || e.category === 'core')).toBe(true);
  });
  it('a synonym never stands in for another word of the same query', () => {
    // "crossover" is a dribble synonym, but "crossover dribble" must not return the cable crossover
    expect(top('crossover dribble', {}, 5).every((e) => e.equipment.includes('basketball'))).toBe(true);
  });
});

describe('typos', () => {
  const cases: [string, RegExp][] = [
    ['goblet sqaut', /goblet squat/i],
    ['kettelbell swing', /kettlebell.*swing/i],
    ['hamstrng curl', /curl/i],
    ['defensve slide', /defensive slide/i],
    ['bulgarain split squat', /split squat/i],
    ['romainan deadlift', /romanian deadlift/i],
    ['pogo hopz', /pogo/i],
  ];
  for (const [q, want] of cases) {
    it(`"${q}" still finds it`, () => {
      const r = search(index, q, {}, opts);
      expect(r.hits[0]?.entry.name).toMatch(want);
    });
  }
  it('says what it corrected (did you mean)', () => {
    const r = search(index, 'goblet sqaut', {}, opts);
    expect(r.didYouMean).toBe('goblet squat');
  });
  it('the last word matches as a prefix while typing, without a false correction', () => {
    const r = search(index, 'kettl', {}, opts);
    expect(r.total).toBeGreaterThan(20);
    expect(r.didYouMean).toBeNull();
    expect(r.hits.every((h) => h.entry.equipment.includes('kettlebell'))).toBe(true);
  });
});

describe('ranking', () => {
  it('an exact name comes first', () => {
    for (const n of ['Goblet Squat', 'Pogo Hop', 'Defensive Slide', 'Copenhagen Plank', 'Band Pull Apart', 'Wall Sit']) expect(names(n)[0]).toBe(n);
  });
  it('plural queries find the singular entries', () => {
    expect(names('box jumps')[0]).toMatch(/box jump/i);
    expect(names('reverse lunges')[0]).toMatch(/reverse lunge/i);
  });
});

describe('variants do not crowd the results (batches 2–4)', () => {
  const groupOf = (e: LibraryExercise) => e.variantOf ?? e.id;
  it('a base shows once, with its matching variants folded under it', () => {
    const r = search(index, 'goblet squat', {}, opts);
    expect(r.hits[0].entry.name).toBe('Goblet Squat');
    expect(r.hits[0].variants.map((v) => v.name)).toEqual(expect.arrayContaining(['Paused Goblet Squat', 'Goblet Squat with 4-Second Lower']));
    expect(r.hits[0].variants.every((v) => v.variantOf === 'goblet-squat')).toBe(true);
  });
  it('no two hits share a group, and no entry shows twice', () => {
    for (const q of ['plyo', 'squat', 'layup', 'crossover', 'pogo', 'push up', 'romanian deadlift', 'closeout']) {
      const r = search(index, q, {}, { drafts: true, limit: 30 });
      const groups = r.hits.map((h) => groupOf(h.entry));
      expect(new Set(groups).size, q).toBe(groups.length);
      const ids = r.hits.flatMap((h) => [h.entry.id, ...h.variants.map((v) => v.id)]);
      expect(new Set(ids).size, q).toBe(ids.length);
      expect(r.groups, q).toBeLessThanOrEqual(r.total);
    }
  });
  it('asking for the variant by name shows the variant first', () => {
    expect(names('paused goblet squat', {}, 1)[0]).toBe('Paused Goblet Squat');
  });
  it('"plyo" no longer returns eight versions of one push-up', () => {
    const hits = search(index, 'plyo', {}, opts).hits;
    expect(hits.filter((h) => /plyo kettlebell pushups/i.test(h.entry.name)).length).toBeLessThanOrEqual(1);
  });
  it('paging walks groups: two pages never overlap', () => {
    const a = search(index, 'squat', {}, { drafts: true, limit: 12 });
    const b = search(index, 'squat', {}, { drafts: true, limit: 12, offset: 12 });
    const ga = new Set(a.hits.map((h) => groupOf(h.entry)));
    expect(b.hits.some((h) => ga.has(groupOf(h.entry)))).toBe(false);
    expect(a.groups).toBeGreaterThan(24);
  });
  // broad queries only: a narrow one ("pogo") is rightly answered by one family, the penalty only breaks near-ties
  it('the diversity penalty: on a broad query no family holds more than 4 of the top 10', () => {
    for (const q of ['plyo', 'squat', 'layup', 'crossover', 'vert', 'lunge', 'closeout', 'stretch', 'ladder', 'jump']) {
      const fam = new Map<string, number>();
      for (const h of search(index, q, {}, opts).hits) fam.set(h.entry.family, (fam.get(h.entry.family) ?? 0) + 1);
      expect(Math.max(...fam.values()), q).toBeLessThanOrEqual(4);
    }
  });
  it('group: false is one hit per entry (the controls and the review screen)', () => {
    const r = search(index, 'goblet squat', {}, { drafts: true, limit: 50, group: false });
    expect(r.groups).toBe(r.total);
    expect(r.hits.every((h) => h.variants.length === 0)).toBe(true);
    expect(r.hits.filter((h) => groupOf(h.entry) === 'goblet-squat').length).toBeGreaterThan(1);
  });
});

describe('filters and facets', () => {
  it('facet counts say exactly what clicking the value returns', () => {
    const r = search(index, 'squat', {}, opts);
    for (const key of ['equipment', 'level', 'pattern'] as const) {
      for (const v of r.facets[key].slice(0, 4)) {
        const narrowed = search(index, 'squat', { [key]: [v.value] }, opts);
        expect(narrowed.total, `${key}=${v.value}`).toBe(v.count);
      }
    }
  });
  it('filters combine: pattern + equipment + level', () => {
    const r = search(index, '', { pattern: ['hinge'], equipment: ['kettlebell'], level: ['beginner'] }, { drafts: true, limit: 100 });
    expect(r.total).toBeGreaterThan(0);
    expect(r.hits.every((h) => h.entry.pattern === 'hinge' && h.entry.equipment.includes('kettlebell') && h.entry.level === 'beginner')).toBe(true);
  });
  it('muscle, sport, skill layer and goal filters', () => {
    expect(search(index, '', { muscle: ['tibialis'] }, opts).hits.every((h) => [...h.entry.primaryMuscles, ...h.entry.secondaryMuscles].includes('tibialis'))).toBe(true);
    expect(search(index, '', { sport: ['basketball'], layer: ['jump-land'] }, opts).hits.every((h) => h.entry.sportTags.includes('basketball') && h.entry.skillLayer === 'jump-land')).toBe(true);
    expect(search(index, '', { goal: ['handles'] }, opts).total).toBeGreaterThan(20);
  });
  it('"only what I have": no equipment means bodyweight (a wall or a mat is fine)', () => {
    const r = search(index, '', { equipment: [], equipmentOnly: true, goal: ['vertical'] }, { drafts: true, limit: 100 });
    expect(r.total).toBeGreaterThan(10);
    expect(r.hits.every((h) => h.entry.equipment.every((x) => ['wall', 'mat', 'towel'].includes(x)))).toBe(true);
  });
  it('approved only unless drafts are asked for; rejected never', () => {
    const approved: LibraryExercise = { ...ALL[0], id: 'approved-x', slug: 'approved-x', name: 'Approved Zebra Squat', review: { status: 'approved', reviewer: 'owner', batch: 'test' } };
    const rejected: LibraryExercise = { ...ALL[1], id: 'rejected-x', slug: 'rejected-x', name: 'Rejected Zebra Squat', review: { status: 'rejected', reviewer: 'owner', batch: 'test' } };
    const idx = buildIndex([...ALL.filter((e) => e.review.status === 'draft').slice(0, 50), approved, rejected]);
    expect(search(idx, 'zebra', {}, {}).hits.map((h) => h.entry.id)).toEqual(['approved-x']);
    expect(search(idx, 'zebra', {}, { drafts: true }).hits.map((h) => h.entry.id)).toEqual(['approved-x']);
    expect(search(idx, '', {}, {}).total).toBe(1);
  });
  it('youth rules leave adults-only entries out', () => {
    const r = search(index, 'depth jump', {}, { drafts: true, youth: true, limit: 50 });
    expect(r.hits.every((h) => h.entry.youthOk)).toBe(true);
    expect(search(index, 'depth jump', {}, { drafts: true, limit: 50 }).hits.some((h) => !h.entry.youthOk)).toBe(true);
  });
});

describe('zero-result recovery', () => {
  it('relaxes one filter at a time and says how many come back', () => {
    const r = search(index, 'pistol squat', { equipment: ['sled'] }, opts);
    expect(r.total).toBe(0);
    expect(r.relaxations[0]).toMatchObject({ filter: 'equipment' });
    expect(r.relaxations[0].count).toBeGreaterThan(0);
  });
  it('falls back to any-term matches rather than nothing', () => {
    const r = search(index, 'pogo zzzzqqq', {}, opts);
    expect(r.total).toBeGreaterThan(0);
    expect(r.hits[0].entry.name).toMatch(/pogo/i);
  });
  it('gibberish returns nothing, without inventing a correction', () => {
    const r = search(index, 'qqxzv', {}, opts);
    expect(r.total).toBe(0);
    expect(r.didYouMean).toBeNull();
  });
});

describe('speed over 5,000+ entries', () => {
  // synthetic: the real library cloned with distinct names until it passes 5,000
  const big: LibraryExercise[] = [];
  const tags = ['Paused', 'Tempo', 'Banded', 'Offset'];
  for (let k = 0; big.length < 5200; k++) for (const e of ALL) big.push(k === 0 ? e : { ...e, id: `${e.id}-${k}`, slug: `${e.id}-${k}`, name: `${tags[k % 4]} ${e.name} ${k}` });
  const t0 = performance.now();
  const bigIndex = buildIndex(big, () => performance.now());
  const buildMs = performance.now() - t0;
  it('builds the index and answers typical queries fast', () => {
    const qs = ['goblet squat', 'rdl', 'kettelbell swing', 'vert', 'bodyweight lunge', 'defensive slide', 'hammy', 'single leg', 'band', 'pogo', 'box jump', 'push up', 'sqaut', 'core', 'ankle'];
    const times: number[] = [];
    for (let i = 0; i < 3; i++) for (const q of qs) { const s = performance.now(); search(bigIndex, q, { level: ['beginner'] }, { drafts: true }); times.push(performance.now() - s); }
    times.sort((a, b) => a - b);
    const p95 = times[Math.floor(times.length * 0.95)];
    expect(big.length).toBeGreaterThanOrEqual(5000);
    expect(buildMs).toBeLessThan(5000);
    expect(p95).toBeLessThan(150);
  });
});
