// The exercise library on a phone and a desktop, with no server (EXERCISE-LIBRARY, 2026-10-25). Bundled by
// scripts/probes/_library-phone.mts with esbuild and loaded into headless Chromium: the real LibraryBrowser and
// LibraryReview, every /api call answered by the REAL search engine and Ask layer over the REAL data files (no
// fixtures), so the shots show what the routes would return. Scene = location.hash.
//   coach-*   : a coach with drafts on (nothing is approved yet in the data)
//   athlete-* : an athlete, with three batches marked approved IN THIS RIG ONLY, to show the approved-only view
//   review    : the owner's review page
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';
import { LibraryBrowser } from '@/components/library/library-browser';
import { LibraryReview } from '@/components/library/library-review';
import { answerAsk } from '@/lib/library/ask/answer';
import { demoFor, muscleMap } from '@/lib/library/demo';
import { loadLibraryFiles } from '@/lib/library/files';
import { buildIndex, search, FACET_KEYS, type SearchFilters } from '@/lib/library/search/engine';
import type { LibraryExercise } from '@/lib/library/types';

const scene = location.hash.replace('#', '') || 'coach-search';
const athlete = scene.startsWith('athlete');
const RIG_APPROVED = new Set(['authored-b1-basketball-handles', 'authored-b1-plyometrics', 'authored-b1-speed-agility', 'seed-strength']);
const entries: LibraryExercise[] = loadLibraryFiles().map((e) => (athlete && RIG_APPROVED.has(e.review.batch) ? { ...e, review: { ...e.review, status: 'approved' as const, reviewer: 'rig' } } : e));
const index = buildIndex(entries);
const viewer = { coach: !athlete, admin: !athlete, drafts: false, youth: false };
const card = (e: LibraryExercise) => { const d = demoFor(e); return { ...e, muscleMap: muscleMap(e), avatarClip: d?.clip ?? null, avatarHold: d?.hold ?? null }; };   // LIBRARY-ANATOMY: the card's loop is the entry's own (lib/library/server.ts toCard)

function filtersFrom(p: URLSearchParams): SearchFilters {
  const f: SearchFilters = {};
  const list = (v: string | null) => (v ? v.split(',').filter(Boolean) : undefined);
  for (const k of FACET_KEYS) { const v = list(p.get(k)); if (v) (f as Record<string, string[]>)[k] = v; }
  for (const k of ['lowLoad', 'notCategory', 'notEquipment'] as const) { const v = list(p.get(k)); if (v) f[k] = v; }
  if (p.get('only') === '1') { f.equipmentOnly = true; f.equipment ??= []; }
  return f;
}

async function answer(url: string, init?: RequestInit): Promise<Response> {
  const u = new URL(url, 'http://rig.local');
  if (u.pathname === '/api/library/search') {
    const p = u.searchParams;
    const drafts = !athlete && p.get('drafts') === '1';
    const r = search(index, p.get('q') ?? '', filtersFrom(p), { drafts, offset: Number(p.get('offset') ?? 0), limit: 24 });
    return Response.json({
      ...r, hits: r.hits.map((h) => ({ ...card(h.entry), variants: h.variants.map((v) => ({ id: v.id, name: v.name, level: v.level, status: v.review.status })) })), viewer: { ...viewer, drafts },
      library: { total: entries.length, approved: entries.filter((e) => e.review.status === 'approved').length, drafts: entries.filter((e) => e.review.status === 'draft').length, ready: false },
    });
  }
  if (u.pathname === '/api/library/ask') {
    const body = JSON.parse(String(init?.body ?? '{}')) as { q: string; drafts?: boolean };
    const a = await answerAsk(index, body.q, { drafts: !athlete && body.drafts === true, limit: 10 });
    return Response.json({
      question: a.parsed.question, chips: a.chips, filters: a.filters, text: a.parsed.text, intent: a.parsed.intent, results: a.results.map(card), total: a.total,
      plan: a.plan?.map((s) => ({ slot: s.slot, minutes: s.minutes, entry: card(s.entry) })) ?? null, anchor: a.anchor ? { id: a.anchor.id, name: a.anchor.name } : null,
      safety: a.safety, relaxed: a.relaxed, ai: a.ai, didYouMean: a.didYouMean,
    });
  }
  const one = /^\/api\/library\/([^/]+)$/.exec(u.pathname);
  if (one) { const e = index.docs[index.byId.get(decodeURIComponent(one[1])) ?? -1]; return e ? Response.json({ entry: card(e) }) : Response.json({ error: 'not_found' }, { status: 404 }); }
  if (u.pathname === '/api/coach/programs/exercises/from-library') return Response.json({ item: { id: 'pe-1' }, already: false, linked: false }, { status: 201 });
  if (u.pathname === '/api/admin/library') {
    const batches = new Map<string, { batch: string; total: number; draft: number; approved: number; rejected: number }>();
    for (const e of entries) { const b = batches.get(e.review.batch) ?? { batch: e.review.batch, total: 0, draft: 0, approved: 0, rejected: 0 }; b.total++; b[e.review.status]++; batches.set(e.review.batch, b); }
    const batch = u.searchParams.get('batch') ?? 'authored-b1-basketball-footwork';
    const list = entries.filter((e) => e.review.batch === batch && e.review.status === 'draft');
    return Response.json({
      ready: false, batches: [...batches.values()].sort((a, b) => a.batch.localeCompare(b.batch)), total: list.length, entries: list.slice(0, 6).map(card),
      queue: [{ id: 's1', coachName: 'Coach Rivera', payload: { name: 'Wall Ankle Rocks, Banded', category: 'mobility', pattern: 'mobility', primaryCues: ['Drive the knee toward the wall over the middle toes.'], commonFaults: [], equipment: ['band', 'wall'] } }],
    });
  }
  return Response.json({ error: 'not_found' }, { status: 404 });
}
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => answer(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, init);

const view = scene === 'review'
  ? createElement(LibraryReview)
  : createElement('main', { className: 'mx-auto max-w-[720px] px-4 py-4' }, createElement(LibraryBrowser, { canAdd: !athlete }));
createRoot(document.getElementById('root')!).render(createElement('div', { className: 'min-h-screen bg-[#050505] pb-20' }, view, createElement(Toaster)));
