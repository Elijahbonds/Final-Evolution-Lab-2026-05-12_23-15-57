// PLAT-P08 (2026-11-02): search on the device. The screen fetches the viewer's slice (/api/library/all, built with
// engine.ts visibleTo), indexes it on the device and runs lib/library/search/page.ts searchPage per keystroke — the
// function /api/library/search runs on the server.
import { describe, expect, it } from 'vitest';
import { loadLibraryFiles } from '@/lib/library/files';
import { buildIndex, visibleTo } from '@/lib/library/search/engine';
import { libraryCounts, searchPage } from '@/lib/library/search/page';

const all = loadLibraryFiles();
const full = buildIndex(all);
const sliceFor = (youth: boolean, drafts = false) => all.filter((e) => visibleTo(e, { drafts, youth }));
const params = (q: string) => new URLSearchParams(q ? { q } : {});

describe('the device slice', () => {
  it('holds only what search could show the viewer: approved, and for a teen only youth-safe entries', () => {
    const adult = sliceFor(false), teen = sliceFor(true);
    expect(adult.length).toBeGreaterThan(800);
    expect(adult.every((e) => e.review.status === 'approved')).toBe(true);
    expect(teen.length).toBeGreaterThan(0);
    expect(teen.every((e) => e.review.status === 'approved' && e.youthOk)).toBe(true);
    // control: the full library does hold drafts and adults-only entries, so the filter is doing the work
    expect(all.some((e) => e.review.status === 'draft')).toBe(true);
    expect(all.some((e) => e.review.status === 'approved' && !e.youthOk)).toBe(true);
  });

  it('a coach who asks for drafts gets them; nobody gets a rejected entry', () => {
    const coach = sliceFor(false, true);
    expect(coach.some((e) => e.review.status === 'draft')).toBe(true);
    expect(coach.some((e) => e.review.status === 'rejected')).toBe(false);
  });
});

describe('searchPage on the device', () => {
  const v = { isCoach: false, isAdmin: false, youth: false };
  const dev = buildIndex(sliceFor(false));
  const counts = libraryCounts(full, v, false);

  // "single leg" has 4 moving among its strong matches (tests/library-p8/search.test.ts; loops queued for demo-loops)
  it.each(['', 'squat', 'landing', 'shoulder'])('"%s": the first 6 tiles all move', (q) => {
    const r = searchPage(dev, params(q), v, counts);
    expect(r.hits.length).toBeGreaterThanOrEqual(6);
    expect(r.hits.slice(0, 6).filter((h) => h.avatarClip).map((h) => h.id)).toHaveLength(6);
  });

  it('answers the same page the server does for the phase queries (same first 6)', () => {
    for (const q of ['', 'squat', 'single leg', 'landing']) {
      const a = searchPage(full, params(q), v, counts).hits.slice(0, 6).map((h) => h.id);
      const b = searchPage(dev, params(q), v, counts).hits.slice(0, 6).map((h) => h.id);
      expect(b).toEqual(a);
    }
  });

  it('pages: offset walks on without repeats', () => {
    const p1 = searchPage(dev, params('squat'), v, counts).hits.map((h) => h.id);
    const p2 = searchPage(dev, new URLSearchParams({ q: 'squat', offset: String(p1.length) }), v, counts).hits.map((h) => h.id);
    expect(p2.length).toBeGreaterThan(0);
    expect(p2.filter((id) => p1.includes(id))).toEqual([]);
  });
});
