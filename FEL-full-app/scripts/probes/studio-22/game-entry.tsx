// studio-22 (2026-11-11): the GAME page a Studio Play-test opens, with no server, so the studio-easy rig can follow the press
// all the way into the game. Built by ./game-build.mjs; served by scripts/probes/_studio-easy-probe.mts (`--game=<site>`) on the
// SAME origin as the Studio, so the hand-off the Studio writes (sessionStorage in a production build, this device's play-test
// storage in a development one) is there for the game to read, exactly as on the site.
//
// The page is chosen by the address, as Next routes it:
//   /play/tennis?variant=tiebreak&share=<key>   a production build's Play-test (lib/nexus-studio/shareHandoff.ts modeRoute)
//   /play/football | /play/volleyball | /play/derby  the other play-test targets, the same way
//   /dev/mode/<key>?venue=<id>&place=home       a development build's Play-test (lib/nexus-studio/targets.ts route)
// Each is the REAL page body: app/play/layout.tsx around the route's own loader (GameShell, the mode's host), or the dev runner.
//
// Unlike the gameplay-clean rig's entry this one never clears storage: the Studio's hand-off is in it. The server's answers are
// stubbed (a signed-in player; every run start recorded in window.__starts so the probe can see it was asked as practice).
// For the probe: window.__ENGINES (Babylon's engines: frames advancing, the Studio's fixture nodes in the scene) and
// window.__studioPick() (the real runtime's answer to "which Studio venue does this mode load, and from where").
import { createElement as h, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { EngineStore } from '@babylonjs/core';
import PlayLayout from '@/app/play/layout';
import { studioPickFor } from '@/lib/nexus-studio/runtime';
import { tennisVariantOf } from '@/lib/babylon/modes/tennisVariant';

const W = window as unknown as Record<string, unknown>;
const path = location.pathname;
const q = new URLSearchParams(location.search);
W.__PATH = path;
W.__SESSION = { user: { id: 'u1', name: 'Rig Creator', email: 'rig@example.com' }, expires: '2099-01-01' };
W.__ENGINES = EngineStore.Instances;
W.__starts = [] as unknown[];

const realFetch = window.fetch.bind(window);
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const p = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
  if (!p.startsWith('/api/')) return realFetch(input, init);
  if (p === '/api/profile') return Response.json({ grade: 'B', prq: 50, profile: { userId: 'u1', xp: 1200 }, role: 'user' });
  if (p === '/api/sessions/start') {
    let body: unknown = null; try { body = JSON.parse(String(init?.body ?? 'null')); } catch { /* not JSON */ }
    (W.__starts as unknown[]).push(body);
    return Response.json({ runId: 'rig-run' });
  }
  return Response.json({});
}) as typeof fetch;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each loader takes its own props
type Page = { mode: string; load: () => Promise<ComponentType<any>>; props?: Record<string, unknown> };
function pageFor(): Page | null {
  const dev = path.match(/^\/dev\/mode\/([\w-]+)$/);
  if (dev) return { mode: dev[1], load: () => import('@/app/dev/mode/[key]/loader').then((m) => m.DevModeRunner), props: { modeKey: dev[1] } };
  switch (path) {
    case '/play/tennis': {
      const variant = tennisVariantOf(q.get('variant') ?? undefined);
      return { mode: variant === 'tiebreak' ? 'tiebreak' : 'tennis', load: () => import('@/app/play/tennis/_components/loader').then((m) => m.TennisLoader), props: { variant } };
    }
    case '/play/football': return { mode: 'football', load: () => import('@/app/play/football/_components/loader').then((m) => m.FootballLoader) };
    case '/play/volleyball': return { mode: 'volleyball', load: () => import('@/app/play/volleyball/_components/loader').then((m) => m.VolleyballLoader) };
    case '/play/derby': return { mode: 'derby', load: () => import('@/app/play/derby/_components/loader').then((m) => m.DerbyLoader) };
    default: return null;
  }
}

(async () => {
  const pg = pageFor();
  if (!pg) { document.body.textContent = `no game page at ${path}`; return; }
  W.__studioPick = () => { const s = studioPickFor(pg.mode); return s ? { source: s.source, competitive: s.competitive, target: s.exp.target, venueId: s.exp.venueId, mood: s.exp.mood, fixtures: s.exp.fixtures?.length ?? 0 } : null; };
  const Body = await pg.load();
  createRoot(document.getElementById('root')!).render(h(PlayLayout, null, h(Body, pg.props ?? {})));
})();
