// PLAT-P08 (2026-11-02): the library's search screen ranks moving demos first AFTER relevance (lib/library/search/engine.ts
// demosFirst: inside a relevance band, faithful loops first), over the real 5,020-entry data. For the empty query and
// "squat", "landing", "shoulder" the first six tiles all move. "single leg" has only four moving entries among its strong
// matches (seven single-leg exercises have no loop yet: queued for demo-loops), and a weaker match that moves is not pulled
// above them — the brief's order is relevance first. Ask does not ask for it, so its order and its top-5 bench
// (lib/library/ask/ask.test.ts) are exactly what they were.
import { describe, expect, it } from 'vitest';
import { loadLibraryFiles } from '@/lib/library/files';
import { buildIndex, search, DEMO_FIRST_BAND, DEMO_FIRST_WINDOW } from '@/lib/library/search/engine';
import { demoFor } from '@/lib/library/demo';

const index = buildIndex(loadLibraryFiles());
const moves = (e: Parameters<typeof demoFor>[0]) => !!demoFor(e)?.clip;
const QUERIES = ['', 'squat', 'single leg', 'landing', 'shoulder'];

describe('moving demos first', () => {
  it.each(QUERIES.filter((q) => q !== 'single leg'))('"%s": the first six tiles all move', (q) => {
    const hits = search(index, q, {}, { youth: false, demosFirst: true }).hits.slice(0, 6);
    expect(hits).toHaveLength(6);
    expect(hits.filter((h) => moves(h.entry)).map((h) => h.entry.name)).toEqual(hits.map((h) => h.entry.name));
  });
  it('"single leg": the moving single-leg exercises lead, and nothing weaker is pulled above the strong matches', () => {
    const hits = search(index, 'single leg', {}, { youth: false, demosFirst: true }).hits;
    const top = hits[0].score;
    expect(hits.slice(0, 4).every((h) => moves(h.entry))).toBe(true);
    // every hit in the first 11 is a strong match (≥ 0.6 of the top score): no one-arm swing or hamstring stretch up here
    expect(hits.slice(0, 11).every((h) => h.score >= top * DEMO_FIRST_BAND)).toBe(true);
  });
  it('an exact name stays first even when it has no loop', () => {
    const hits = search(index, 'one leg barbell squat', {}, { youth: false, demosFirst: true }).hits;
    expect(moves(hits[0].entry)).toBe(false);
    expect(hits[0].entry.name).toBe('One Leg Barbell Squat');
  });
  it('control: without it (as Ask searches) the same queries put still entries in the first six', () => {
    const still = QUERIES.reduce((n, q) => n + search(index, q, {}, { youth: false }).hits.slice(0, 6).filter((h) => !moves(h.entry)).length, 0);
    expect(still).toBeGreaterThan(0);
  });
  it('relevance still decides WHICH entries make the page; inside a band only the moving ones step forward', () => {
    for (const q of QUERIES.slice(1)) {
      const plain = search(index, q, {}, { youth: false, limit: DEMO_FIRST_WINDOW }).hits.map((h) => h.entry);
      const first = search(index, q, {}, { youth: false, limit: DEMO_FIRST_WINDOW, demosFirst: true }).hits;
      expect(new Set(first.map((h) => h.entry.id))).toEqual(new Set(plain.map((e) => e.id)));
      expect(first.filter((h) => moves(h.entry)).map((h) => h.entry.id)).toEqual(plain.filter(moves).map((e) => e.id));
      expect(first.filter((h) => !moves(h.entry)).map((h) => h.entry.id)).toEqual(plain.filter((e) => !moves(e)).map((e) => e.id));
      // the score bands never invert: a hit is never more than one band ratio below a later hit's score
      const top = first[0].score;
      const band = (sc: number) => (sc >= top ? 0 : Math.floor(Math.log(top / sc) / Math.log(1 / DEMO_FIRST_BAND)));
      for (let i = 1; i < first.length; i++) expect(band(first[i].score)).toBeGreaterThanOrEqual(band(first[i - 1].score));
    }
  });
  it('off by default: a search that does not ask is unchanged', () => {
    for (const q of QUERIES) expect(search(index, q, {}, { youth: false }).hits.map((h) => h.entry.id)).toEqual(search(index, q, {}, { youth: false, demosFirst: false }).hits.map((h) => h.entry.id));
  });
});
