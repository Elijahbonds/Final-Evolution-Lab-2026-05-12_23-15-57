// The exercise library's 3D demo and muscle view, with no Next server (LIBRARY-ANATOMY, 2026-10-25). Bundled by
// scripts/probes/_library-anatomy.mts with esbuild and served with public/ by a static file server, so the stage loads
// the real kit body (/models/...) and the real Babylon code. Scene = location.hash:
//   #stage:<clip>[:<holdSec>]       the stage alone, Demo view, playing <clip>
//   #muscles:<entryId>:<front|back> the stage alone, Muscles view, for a library entry
//   #ui:<entryId>[:<tab>]           the real LibraryBrowser searching for the entry, its sheet opened on <tab>
//   #card:<query>                   the real LibraryBrowser's result cards for a search
// Every /api call is answered here from the REAL data files and the REAL search engine (no fixtures); the identity call
// answers 401, so the stage plays the guest body (the male kit), as a signed-out phone would.
import { createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import ExerciseStage from '@/components/library/exercise-stage';
import { LibraryBrowser } from '@/components/library/library-browser';
import { AvatarDemo } from '@/components/library/avatar-demo';
import { demoFor, muscleMap } from '@/lib/library/demo';
import { loadLibraryFiles } from '@/lib/library/files';
import { buildIndex, search } from '@/lib/library/search/engine';
import type { LibraryExercise } from '@/lib/library/types';

const hash = decodeURIComponent(location.hash.replace('#', ''));
const [mode, a = '', b = ''] = hash.split(':');
const entries: LibraryExercise[] = loadLibraryFiles();
const index = buildIndex(entries);
const card = (e: LibraryExercise) => { const d = demoFor(e); return { ...e, muscleMap: muscleMap(e), avatarClip: d?.clip ?? null, avatarHold: d?.hold ?? null }; };
const byId = (id: string) => entries.find((e) => e.id === id);

const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const u = new URL(url, location.href);
  if (u.pathname === '/api/library/search') {
    const r = search(index, u.searchParams.get('q') ?? '', {}, { drafts: true, offset: 0, limit: 12 });
    return Response.json({ ...r, hits: r.hits.map((h) => ({ ...card(h.entry), variants: [] })), viewer: { coach: true, admin: false, drafts: true, youth: false }, library: { total: entries.length, approved: 0, drafts: entries.length, ready: false } });
  }
  const one = /^\/api\/library\/([^/]+)$/.exec(u.pathname);
  if (one) { const e = byId(decodeURIComponent(one[1])); return e ? Response.json({ entry: card(e) }) : Response.json({ error: 'not_found' }, { status: 404 }); }
  // T-POSE (2026-10-27): ?body=scan|female|male answers the hero-body read as the server would for that account (a release
  // bundle has no dev identity override); without it, the guest's 401
  const body = new URLSearchParams(location.search).get('body');
  if (u.pathname === '/api/v1/hero-body' && body) return Response.json({ body: body === 'scan' ? 'scan' : body === 'female' ? 'kit-female' : 'kit-male', frame: null, palette: null, scanOwned: body === 'scan' });
  if (u.pathname.startsWith('/api/')) return Response.json({ error: 'unauthorized' }, { status: 401 });
  return realFetch(input, init);
};

(window as unknown as { __rig: unknown }).__rig = { mode, a, b, entries: entries.length };

function Stage() {
  const [, force] = useState(0);
  // LIBRARY-ANATOMY-2: the rig's sheet job swaps the clip on one loaded stage (window.__rigSetClip) instead of a page per clip
  const [shown, setShown] = useState<{ clip: string | null; hold: number | null }>({ clip: a || null, hold: b ? Number(b) : null });
  (window as unknown as { __rigSetClip?: (clip: string | null, hold?: number | null) => void }).__rigSetClip = (clip, hold = null) => setShown({ clip, hold });
  if (mode === 'stage') {
    return createElement(ExerciseStage, { view: 'demo', clip: shown.clip, hold: shown.hold, muscles: { primary: [], secondary: [] }, side: 'front', onState: () => force((n) => n + 1) });
  }
  const e = byId(a);
  if (!e) return createElement('p', null, `no entry ${a}`);
  return createElement(ExerciseStage, { view: 'muscles', clip: null, muscles: muscleMap(e), side: (b === 'back' ? 'back' : 'front'), onState: () => force((n) => n + 1) });
}

function Ui() {
  // open the sheet the way a person does: search for it, then tap its card (or one of the card's quick links)
  return createElement('main', { className: 'mx-auto max-w-[720px] px-4 py-4' }, createElement(LibraryBrowser, { canAdd: false }));
}

const root = createRoot(document.getElementById('root')!);
if (mode === 'avatar') {
  // T-POSE (2026-10-27): the drill surfaces' demo (AvatarDemo), as their drill-demo.tsx mounts it: #avatar:<clip|still>
  // DEMO-SPEED (2026-10-27): `rig:mount` marks the moment the surface mounts the demo (the speed job times from it), and
  // window.__rigRemount() unmounts it and mounts a fresh one in the same page — a route change and back, in one session
  const Avatar = () => createElement('div', { style: { width: '358px', background: '#0c0c11' } }, createElement(AvatarDemo, { clip: a && a !== 'still' ? a : null }));
  (window as unknown as { __rigRemount?: () => void }).__rigRemount = () => { root.render(createElement('div')); setTimeout(() => { performance.mark('rig:mount'); root.render(createElement(Avatar)); }, 50); };
  performance.mark('rig:mount');
  root.render(createElement(Avatar));
} else if (mode === 'stage' || mode === 'muscles') {
  // ?w=&h= sizes the stage like the sheet does on a phone (358×268 at 390 px); default: the whole window
  const q = new URLSearchParams(location.search);
  const size = q.get('w') ? { width: `${q.get('w')}px`, height: `${q.get('h')}px` } : { width: '100vw', height: '100vh' };
  root.render(createElement('div', { style: { ...size, background: '#07070d' } }, createElement(Stage)));
} else {
  root.render(createElement('div', { className: 'min-h-screen bg-[#050505] pb-20' }, createElement(Ui)));
}
