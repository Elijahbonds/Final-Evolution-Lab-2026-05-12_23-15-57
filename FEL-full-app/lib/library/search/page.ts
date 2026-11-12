// lib/library/search/page.ts — PLAT-P08 (2026-11-02): one page of the library's search, as the search screen shows it.
//
// Pure (no server, no database), so the SAME function answers on the server (/api/library/search, lib/library/server.ts)
// and on the device: the brief's "run it on the device for keystrokes". The screen fetches its viewer's slice of the
// library once (/api/library/all: approved entries, drafts for a coach who opted in, youth rules applied on the server),
// builds the index (engine.ts buildIndex) and calls searchPage on every keystroke — no round trip per letter.
import { demoFor, muscleMap } from '../demo';
import type { LibraryExercise } from '../types';
import { FACET_KEYS, search, type LibraryIndex, type SearchFilters, type SearchResponse } from './engine';

export interface VariantRef { id: string; name: string; level: LibraryExercise['level']; status: LibraryExercise['review']['status'] }

export interface LibraryCard extends LibraryExercise {
  muscleMap: { primary: string[]; secondary: string[] };
  /** LIBRARY-ANATOMY (2026-10-25): the loop the 3D demo plays (lib/library/demo.ts demoFor), or null — the cue card. */
  avatarClip: string | null;
  /** …and, for an isometric hold, the second of that loop it holds still at (null: it loops). */
  avatarHold: number | null;
  /** On a search hit: the other matching members of its group. Absent elsewhere. */
  variants?: VariantRef[];
}

export const toCard = (e: LibraryExercise): LibraryCard => { const d = demoFor(e); return { ...e, muscleMap: muscleMap(e), avatarClip: d?.clip ?? null, avatarHold: d?.hold ?? null }; };
export const toVariantRef = (e: LibraryExercise): VariantRef => ({ id: e.id, name: e.name, level: e.level, status: e.review.status });

const LIST = (v: string | null): string[] | undefined => {
  const out = (v ?? '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 12);
  return out.length ? out : undefined;
};

/** The search screen's request, read from a URL's query string. */
export function filtersFromParams(p: URLSearchParams): SearchFilters {
  const f: SearchFilters = {};
  for (const k of FACET_KEYS) { const v = LIST(p.get(k)); if (v) (f as Record<string, string[]>)[k] = v; }
  const low = LIST(p.get('lowLoad'));
  if (low) f.lowLoad = low;
  const not = LIST(p.get('notCategory'));
  if (not) f.notCategory = not;
  const notEq = LIST(p.get('notEquipment'));
  if (notEq) f.notEquipment = notEq;
  if (p.get('only') === '1') { f.equipmentOnly = true; if (!f.equipment) f.equipment = []; }
  return f;
}

export interface PageViewer { isCoach: boolean; isAdmin: boolean; youth: boolean }
export interface LibraryCounts { total: number; approved: number; drafts: number; ready: boolean }

export type SearchPage = Omit<SearchResponse, 'hits'> & {
  hits: LibraryCard[];
  viewer: { coach: boolean; admin: boolean; drafts: boolean; youth: boolean };
  library: LibraryCounts;
};

/** The library's counts for the coach's line ("N entries, M approved"), over the whole index. */
export function libraryCounts(index: LibraryIndex, viewer: Pick<PageViewer, 'youth'>, ready: boolean): LibraryCounts {
  return {
    total: index.docs.length, ready,
    approved: index.docs.filter((e) => e.review.status === 'approved' && (!viewer.youth || e.youthOk)).length,
    drafts: index.docs.filter((e) => e.review.status === 'draft').length,
  };
}

/** One page of results for the search screen: moving demos first in the first page (engine.ts demosFirst). */
export function searchPage(index: LibraryIndex, params: URLSearchParams, viewer: PageViewer, counts: LibraryCounts): SearchPage {
  const q = (params.get('q') ?? '').slice(0, 120);
  const drafts = viewer.isCoach && params.get('drafts') === '1';
  const offset = Math.max(0, Number(params.get('offset') ?? 0) || 0);
  const limit = Math.min(48, Math.max(1, Number(params.get('limit') ?? 24) || 24));
  const r = search(index, q, filtersFromParams(params), { drafts, youth: viewer.youth, offset, limit, demosFirst: true });
  return {
    ...r, hits: r.hits.map((h) => ({ ...toCard(h.entry), variants: h.variants.map(toVariantRef) })),
    viewer: { coach: viewer.isCoach, admin: viewer.isAdmin, drafts, youth: viewer.youth },
    library: counts,
  };
}
