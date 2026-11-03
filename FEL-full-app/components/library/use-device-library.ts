'use client';
// useDeviceLibrary — PLAT-P08 (2026-11-02): the brief's "run it on the device for keystrokes". The viewer's slice of the
// library is fetched once (/api/library/all: what search could show them, youth rules applied on the server), indexed
// on the device (engine.ts buildIndex), and every keystroke runs lib/library/search/page.ts searchPage — the function
// the server's /api/library/search runs — with no round trip. Until the slice is in (or if it never comes), the hook
// returns null and the screen asks the server, as before.
import { useEffect, useState } from 'react';
import { buildIndex } from '@/lib/library/search/engine';
import { searchPage, type LibraryCounts, type SearchPage } from '@/lib/library/search/page';
import type { LibraryExercise } from '@/lib/library/types';

interface Slice { entries: LibraryExercise[]; viewer: { coach: boolean; admin: boolean; drafts: boolean; youth: boolean }; library: LibraryCounts }
export type DeviceSearch = (params: URLSearchParams) => SearchPage;

export function useDeviceLibrary(drafts: boolean): DeviceSearch | null {
  const [run, setRun] = useState<{ drafts: boolean; fn: DeviceSearch } | null>(null);
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const r = await fetch(`/api/library/all${drafts ? '?drafts=1' : ''}`);
        if (!r.ok) return;
        const s = await r.json() as Slice;
        if (!live || !Array.isArray(s.entries)) return;
        const index = buildIndex(s.entries);
        const viewer = { isCoach: s.viewer.coach, isAdmin: s.viewer.admin, youth: s.viewer.youth };
        setRun({ drafts, fn: (params) => searchPage(index, params, viewer, s.library) });
      } catch { /* the server answers instead */ }
    })();
    return () => { live = false; };
  }, [drafts]);
  return run && run.drafts === drafts ? run.fn : null;
}
