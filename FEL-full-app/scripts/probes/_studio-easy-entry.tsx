// The Studio, with no server (STUDIO-EASY, 2026-10-28). Bundled by scripts/probes/_studio-easy-probe.mts through the a11y rig
// (scripts/a11y/rig.mts, Babylon bundled so the viewport is the mode's own engine path) and loaded into headless Chromium over
// http. It renders the REAL page module (app/studio/page.tsx) as a signed-in creator, between the real StatusRail and TabBar; the probe's server answers the few APIs the
// Studio asks (the AI switch, CELL, the Closet).
//
//   ?fresh=1   clear this device's storage first: a first visit
//   (default)  keep it: a return visit (the reopen task)
import { createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { StatusRail } from '@/components/shell/status-rail';
import { TabBar } from '@/components/shell/tab-bar';
import StudioPage from '@/app/studio/page';

const w = window as unknown as Window & { __PATH: string; __SESSION: unknown };
w.__PATH = '/studio';
w.__SESSION = { user: { id: 'u1', name: 'Jordan Reyes', email: 'jordan@example.com' }, expires: '2099-01-01' };
if (new URLSearchParams(location.search).get('fresh') === '1') { try { localStorage.clear(); sessionStorage.clear(); } catch { /* a fresh page anyway */ } }

const root = document.getElementById('root')!;
try {
  // as app/layout.tsx mounts a page: the rail above it, the tab bar below it (each decides for itself whether it shows on /studio)
  createRoot(root).render(h('div', null, h(StatusRail), h(StudioPage), h(TabBar)));
  setTimeout(() => { document.body.dataset.a11yReady = '1'; }, 400);
} catch (e) {
  document.body.dataset.a11yError = e instanceof Error ? e.message : String(e);
}
