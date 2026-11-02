// PLAT-P08 (2026-11-02): the library's search screen ranks MOVING demos first (lib/library/search/engine.ts demosFirst), over
// the real 5,020-entry data: for the empty query and "squat", "single leg", "landing", "shoulder", the first six tiles an
// athlete sees (approved entries) all have a faithful loop, so the first screen never shows "Demo coming". Ask does not ask
// for it, so its order — and its top-5 bench (lib/library/ask/ask.test.ts) — is exactly what it was.
import { describe, expect, it } from 'vitest';
import { loadLibraryFiles } from '@/lib/library/files';
import { buildIndex, search, DEMO_FIRST_WINDOW } from '@/lib/library/search/engine';
import { demoFor } from '@/lib/library/demo';

const index = buildIndex(loadLibraryFiles());
const moves = (e: Parameters<typeof demoFor>[0]) => !!demoFor(e)?.clip;
const QUERIES = ['', 'squat', 'single leg', 'landing', 'shoulder'];

describe('moving demos first', () => {
  it.each(QUERIES)('"%s": the first six tiles all move', (q) => {
    const hits = search(index, q, {}, { youth: false, demosFirst: true }).hits.slice(0, 6);
    expect(hits).toHaveLength(6);
    expect(hits.filter((h) => moves(h.entry)).map((h) => h.entry.name)).toEqual(hits.map((h) => h.entry.name));
  });
  it('control: without it (as Ask searches) the same queries put still entries in the first six', () => {
    const still = QUERIES.reduce((n, q) => n + search(index, q, {}, { youth: false }).hits.slice(0, 6).filter((h) => !moves(h.entry)).length, 0);
    expect(still).toBeGreaterThan(0);
  });
  it('relevance still decides WHICH entries make the page; only their order inside it changes, each side keeping its order', () => {
    for (const q of QUERIES.slice(1)) {
      const plain = search(index, q, {}, { youth: false, limit: DEMO_FIRST_WINDOW }).hits.map((h) => h.entry);
      const first = search(index, q, {}, { youth: false, limit: DEMO_FIRST_WINDOW, demosFirst: true }).hits.map((h) => h.entry);
      expect(new Set(first.map((e) => e.id))).toEqual(new Set(plain.map((e) => e.id)));
      expect(first.filter(moves).map((e) => e.id)).toEqual(plain.filter(moves).map((e) => e.id));
      expect(first.filter((e) => !moves(e)).map((e) => e.id)).toEqual(plain.filter((e) => !moves(e)).map((e) => e.id));
    }
  });
  it('off by default: a search that does not ask is unchanged', () => {
    for (const q of QUERIES) expect(search(index, q, {}, { youth: false }).hits.map((h) => h.entry.id)).toEqual(search(index, q, {}, { youth: false, demosFirst: false }).hits.map((h) => h.entry.id));
  });
});
