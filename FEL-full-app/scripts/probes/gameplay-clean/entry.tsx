// gameplay-clean rig entry (lane/gameplay-clean, 2026-10-28): the REAL /play/<route> page a player gets — app/play/layout.tsx
// (the error boundary, the caption region, the feel panel's tab) around the route's own loader (GameShell, the mode's host,
// its HUD, the READY card, the pause, the touch deck) — with no server. Built by ./build.mjs; driven by ./audit.mjs.
//
//   index.html?mode=<registry key>            e.g. ?mode=golf, ?mode=snowboard_slalom
//
// The server's answers are stubbed: a signed-in player with a profile, a started run that is an agent run (so the harness
// publishes window.__FEL_DEV__ — the scene, the hero, the input bus — on this loopback page; lib/agentRunHooks.ts), the
// feel panel opened (so the audit can see whether the owner can reach it), and an empty {} for everything else.
import { createElement as h, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { Tools } from '@babylonjs/core';
import PlayLayout from '@/app/play/layout';
import { setAgentRunHooksAllowed } from '@/lib/agentRunHooks';
import { sessionStore } from '@/lib/babylon/core/sessionStore';

type Loader = () => Promise<ComponentType>;
/** Registry key → its /play route's loader (app/play/<route>/_components/loader.tsx). */
export const ROUTES: Record<string, [string, Loader]> = {
  aeroaces: ['aero-aces', () => import('@/app/play/aero-aces/_components/loader').then((m) => m.AeroAcesLoader)],
  baseball: ['baseball', () => import('@/app/play/baseball/_components/loader').then((m) => m.BaseballLoader)],
  bigair: ['big-air', () => import('@/app/play/big-air/_components/loader').then((m) => m.BigAirLoader)],
  brainbrawl: ['brain-brawl', () => import('@/app/play/brain-brawl/_components/loader').then((m) => m.BrainBrawlLoader)],
  carnival: ['carnival', () => import('@/app/play/carnival/_components/loader').then((m) => m.CarnivalLoader)],
  dance: ['dance', () => import('@/app/play/dance/_components/loader').then((m) => m.DanceLoader)],
  derby: ['derby', () => import('@/app/play/derby/_components/loader').then((m) => m.DerbyLoader)],
  duel: ['duel', () => import('@/app/play/duel/_components/loader').then((m) => m.DuelLoader)],
  dunk: ['dunk', () => import('@/app/play/dunk/_components/loader').then((m) => m.DunkLoader)],
  dunkduel: ['dunkduel', () => import('@/app/play/dunkduel/_components/loader').then((m) => m.DunkDuelLoader)],
  football: ['football', () => import('@/app/play/football/_components/loader').then((m) => m.FootballLoader)],
  freerun: ['freerun', () => import('@/app/play/freerun/_components/loader').then((m) => m.FreeRunLoader)],
  golf: ['golf', () => import('@/app/play/golf/_components/loader').then((m) => m.GolfLoader)],
  karate: ['karate', () => import('@/app/play/karate/_components/loader').then((m) => m.KarateLoader)],
  karate_vs: ['karate-vs', () => import('@/app/play/karate-vs/_components/loader').then((m) => m.KarateVsLoader)],
  mixedcombat: ['mixedcombat', () => import('@/app/play/mixedcombat/_components/loader').then((m) => m.MixedCombatLoader)],
  onevone: ['onevone', () => import('@/app/play/onevone/_components/loader').then((m) => m.OneVOneLoader)],
  penalty: ['soccer', () => import('@/app/play/soccer/_components/loader').then((m) => m.SoccerLoader)],
  showdown: ['showdown', () => import('@/app/play/showdown/_components/loader').then((m) => m.ShowdownLoader)],
  skateboard: ['skateboard', () => import('@/app/play/skateboard/_components/loader').then((m) => m.SkateboardLoader)],
  snowboard_slalom: ['snowboard', () => import('@/app/play/snowboard/_components/loader').then((m) => m.SnowboardLoader)],
  sprint: ['sprint', () => import('@/app/play/sprint/_components/loader').then((m) => m.SprintLoader)],
  surf: ['surf', () => import('@/app/play/surf/_components/loader').then((m) => m.SurfLoader)],
  tennis: ['tennis', () => import('@/app/play/tennis/_components/loader').then((m) => m.TennisLoader)],
  threepoint: ['threepoint', () => import('@/app/play/threepoint/_components/loader').then((m) => m.ThreePointLoader)],
  threevthree: ['threevthree', () => import('@/app/play/threevthree/_components/loader').then((m) => m.ThreeVThreeLoader)],
  tiebreak: ['tiebreak', () => import('@/app/play/tiebreak/_components/loader').then((m) => m.TiebreakLoader)],
  velocitykart: ['velocity-kart', () => import('@/app/play/velocity-kart/_components/loader').then((m) => m.VelocityKartLoader)],
  volleyball: ['volleyball', () => import('@/app/play/volleyball/_components/loader').then((m) => m.VolleyballLoader)],
  who_scene_it: ['who-scene-it', () => import('@/app/play/who-scene-it/_components/loader').then((m) => m.WhoSceneItLoader)],
};

const W = window as unknown as Record<string, unknown>;
const q = new URLSearchParams(location.search);
const key = q.get('mode') ?? 'golf';
const route = ROUTES[key];
W.__PATH = `/play/${route?.[0] ?? key}`;
W.__SESSION = { user: { id: 'u1', name: 'Rig Player', email: 'rig@example.com' }, expires: '2099-01-01' };
W.__sessionStore = sessionStore;
W.__BABYLON_TOOLS = Tools;
W.__api = [] as string[];
setAgentRunHooksAllowed(true);
try { localStorage.clear(); } catch { /* fresh anyway */ }

const realFetch = window.fetch.bind(window);
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const p = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
  if (!p.startsWith('/api/')) return realFetch(input, init);
  (W.__api as string[]).push(p);
  if (p === '/api/profile') return Response.json({ grade: 'B', prq: 50, profile: { userId: 'u1', xp: 1200 }, role: 'user' });
  if (p === '/api/sessions/start') return Response.json({ runId: 'rig-run', agentRun: true });
  if (p === '/api/feel-panel') return Response.json({ enabled: true });
  return Response.json({});
}) as typeof fetch;

(async () => {
  if (!route) { document.body.textContent = `no route for ${key}`; return; }
  const Loader = await route[1]();
  createRoot(document.getElementById('root')!).render(h(PlayLayout, null, h(Loader)));
})();
