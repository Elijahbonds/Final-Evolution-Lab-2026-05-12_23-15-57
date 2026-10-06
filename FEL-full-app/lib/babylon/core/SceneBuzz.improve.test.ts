// IMPROVE (2026-10-06): Spot the Scene's draw — easy to hard (#9), wrong answers drawn per play (#10) and the thin
// categories thickened, combat arenas included (#11).
import { describe, expect, it } from 'vitest';
import { buildRounds, categoryAnswers, categoryOf, rampRounds, SCENE_CATEGORIES, splitSceneVenue, varyDistractors } from './SceneBuzz';
import { WHO_SCENE_IT_PACK } from '../content/quizPacks';
import { VENUE_SPECS } from '../nexus/venueSpecs';
import { COMBAT_ARENAS } from '../combat/arenas';

const rnd = (seed: number) => { let a = seed >>> 0; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; };

describe('#11 the pack', () => {
  it('every category has at least four questions, combat at least five distinct venues', () => {
    for (const c of SCENE_CATEGORIES) {
      expect(WHO_SCENE_IT_PACK.questions.filter((q) => categoryOf(q.sceneVenueId)?.id === c.id).length, c.id).toBeGreaterThanOrEqual(4);
    }
    const combat = WHO_SCENE_IT_PACK.questions.filter((q) => categoryOf(q.sceneVenueId)?.id === 'combat');
    expect(new Set(combat.map((q) => q.sceneVenueId)).size).toBeGreaterThanOrEqual(5);
  });
  it('every venue key builds: a VENUE_SPECS venue, and an arena that exists', () => {
    for (const q of WHO_SCENE_IT_PACK.questions) {
      const { venueId, arenaId } = splitSceneVenue(q.sceneVenueId!);
      expect(VENUE_SPECS[venueId as keyof typeof VENUE_SPECS], q.id).toBeTruthy();
      if (arenaId) expect(COMBAT_ARENAS.some((a) => a.id === arenaId), q.id).toBe(true);
      expect(q.options.filter((o) => o.id === q.answer), q.id).toHaveLength(1);
      expect(new Set(q.options.map((o) => o.id)).size, q.id).toBe(q.options.length);
    }
    expect(new Set(WHO_SCENE_IT_PACK.questions.map((q) => q.id)).size).toBe(WHO_SCENE_IT_PACK.questions.length);
  });
  it('an arena key keeps its venue\'s category; a plain key has no arena', () => {
    expect(splitSceneVenue('karate_h2h@cage')).toEqual({ venueId: 'karate_h2h', arenaId: 'cage' });
    expect(splitSceneVenue('tennis')).toEqual({ venueId: 'tennis', arenaId: null });
    expect(categoryOf('karate_h2h@pit')?.id).toBe('combat');
  });
});

describe('#9 easy to hard', () => {
  it('orders questions inside each round and rounds by mean difficulty, for many seeds', () => {
    for (let seed = 1; seed < 40; seed++) {
      const rounds = buildRounds(WHO_SCENE_IT_PACK, seed, 2, { ramp: true });
      const means = rounds.map((r) => r.questions.reduce((s, q) => s + q.difficulty, 0) / r.questions.length);
      for (let i = 1; i < means.length; i++) expect(means[i]).toBeGreaterThanOrEqual(means[i - 1]);
      for (const r of rounds) for (let i = 1; i < r.questions.length; i++) expect(r.questions[i].difficulty).toBeGreaterThanOrEqual(r.questions[i - 1].difficulty);
    }
  });
  it('draws the same questions as without the ramp — only the order changes', () => {
    const plain = buildRounds(WHO_SCENE_IT_PACK, 11, 2).flatMap((r) => r.questions.map((q) => q.id)).sort();
    const ramped = buildRounds(WHO_SCENE_IT_PACK, 11, 2, { ramp: true }).flatMap((r) => r.questions.map((q) => q.id)).sort();
    expect(ramped).toEqual(plain);
    expect(rampRounds([])).toEqual([]);
  });
});

describe('#10 wrong answers drawn per play', () => {
  it('keeps the right answer and one authored distractor, unique ids, same count, drawn from the category', () => {
    for (const q of WHO_SCENE_IT_PACK.questions) {
      const cat = categoryOf(q.sceneVenueId)!.id;
      const pool = categoryAnswers(WHO_SCENE_IT_PACK, cat);
      const authored = new Set(q.options.map((o) => o.label));
      const allowed = new Set([...authored, ...pool.map((o) => o.label)]);
      for (let s = 0; s < 20; s++) {
        const opts = varyDistractors(q, pool, rnd(s * 7 + 1));
        expect(opts).toHaveLength(q.options.length);
        expect(opts.filter((o) => o.id === q.answer)).toHaveLength(1);
        expect(opts.find((o) => o.id === q.answer)!.label).toBe(q.options.find((o) => o.id === q.answer)!.label);
        expect(new Set(opts.map((o) => o.id)).size).toBe(opts.length);
        expect(new Set(opts.map((o) => o.label)).size).toBe(opts.length);
        expect(opts.filter((o) => o.id !== q.answer && authored.has(o.label)).length).toBeGreaterThanOrEqual(1);
        for (const o of opts) expect(allowed.has(o.label), o.label).toBe(true);
      }
    }
  });
  it('actually varies: over a few plays a court question meets more than its three authored wrong answers', () => {
    const q = WHO_SCENE_IT_PACK.questions.find((x) => x.id === 'ws1')!;
    const pool = categoryAnswers(WHO_SCENE_IT_PACK, 'courts');
    const seen = new Set<string>();
    for (let s = 0; s < 30; s++) for (const o of varyDistractors(q, pool, rnd(s + 3))) if (o.id !== q.answer) seen.add(o.label);
    expect(seen.size).toBeGreaterThan(3);
  });
  it('a pool that cannot fill the set keeps the author\'s options, and ids that collide are renamed', () => {
    const q = { id: 'x', prompt: '?', difficulty: 1 as const, answer: 'o0', options: [{ id: 'o0', label: 'R' }, { id: 'o1', label: 'W1' }, { id: 'o2', label: 'W2' }, { id: 'o3', label: 'W3' }] };
    expect(varyDistractors(q, [], rnd(1)).map((o) => o.label).sort()).toEqual(['R', 'W1', 'W2', 'W3']);
    for (let s = 0; s < 24; s++) {
      const collide = varyDistractors(q, [{ id: 'o1', label: 'P1' }, { id: 'o2', label: 'P2' }, { id: 'o3', label: 'P4' }, { id: 'o0', label: 'P3' }], rnd(s + 5));
      expect(new Set(collide.map((o) => o.id)).size).toBe(4);
      expect(collide.filter((o) => o.id === 'o0')).toHaveLength(1);
      expect(collide.find((o) => o.id === 'o0')!.label).toBe('R');
    }
  });
  it('the author\'s other distractors stay in the draw, so a one-venue pool still mixes in', () => {
    const q = { id: 'x', prompt: '?', difficulty: 1 as const, answer: 'r', options: [{ id: 'r', label: 'R' }, { id: 'w1', label: 'W1' }, { id: 'w2', label: 'W2' }, { id: 'w3', label: 'W3' }] };
    let mixed = 0;
    for (let s = 0; s < 24; s++) if (varyDistractors(q, [{ id: 'n', label: 'NEW' }], rnd(s + 1)).some((o) => o.label === 'NEW')) mixed++;
    expect(mixed).toBeGreaterThan(0);
  });
  it('off by default: a plain draw keeps the authored option sets (the Arena ceiling\'s draw)', () => {
    for (const r of buildRounds(WHO_SCENE_IT_PACK, 9, 2)) for (const q of r.questions) {
      expect(q.options.map((o) => o.id).sort()).toEqual(WHO_SCENE_IT_PACK.questions.find((x) => x.id === q.id)!.options.map((o) => o.id).sort());
    }
  });
});
