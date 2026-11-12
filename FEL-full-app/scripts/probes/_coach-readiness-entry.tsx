// The daily readiness check on a phone, with no server (COACH-READINESS, 2026-10-25). Bundled by
// scripts/probes/_coach-readiness-probe.mts with esbuild and loaded into headless Chromium. Every number is a real read:
// the check's camera is the pose service's own feed (lib/pose/PoseService.ts beginFeed / pushFeed), pushed a take filmed
// in the page by JUMP-PRO's bench (lib/jump/ballistic.ts); the POST is answered by the same pure read the server runs
// (lib/coach/readiness/view.ts readDay + viewOf), and Today's payload comes from the real loadToday over the Today
// harness's in-memory database (lib/coach/todayMemoryDb.ts) with today's check Low under the default rule — built by the
// probe in Node and handed in as window.__TODAY__ (loadToday's module graph reaches lib/db, which a browser bundle cannot).
//   check   a coached adult who saves: 6 normal days, today 9 % down → Low, eased, the coach told
//   solo    a solo adult who keeps it on the phone: today up → Ready, a suggestion, nothing forced
//   today   the athlete's Today: the eased session and why
//   coach   the coach's panel: the alert, the latest bands, the rules editor open
//   teen    a 15-year-old opens the page: one line, no camera
//   trend   the progress card's trend line
import { createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { ReadinessCheck } from '@/components/readiness/readiness-check';
import { ReadinessTrendCard } from '@/components/readiness/readiness-trend';
import { ReadinessPanel } from '@/components/coach/readiness/readiness-panel';
import { TodayView } from '@/app/coach/_components/today-view';
import { poseService } from '@/lib/pose/PoseService';
import type { PoseFrame } from '@/lib/pose/landmarks';
import { buildTake, filmTake } from '@/lib/jump/ballistic';
import { DEFAULT_RULE } from '@/lib/coach/readiness/rules';
import { ADULTS_ONLY_LINE, ruleLine } from '@/lib/coach/readiness/copy';
import { DEVICE_KEY } from '@/lib/coach/readiness/deviceHistory';
import { localDayKey } from '@/lib/health/readiness';
import { readDay, viewOf } from '@/lib/coach/readiness/view';
import type { PriorCheck } from '@/lib/coach/readiness/types';

const scene = location.hash.slice(1) || 'check';
const w = window as unknown as Window & { __frames(): PoseFrame[]; __feedBegin(): void; __feedPush(f: PoseFrame): void; __SENT__: { method: string; url: string; body: string }[] };
w.__SENT__ = [];
w.__feedBegin = () => poseService().beginFeed();
w.__feedPush = (f) => poseService().pushFeed(f);

const TODAY = localDayKey(new Date());
const dayAgo = (n: number) => localDayKey(new Date(Date.now() - n * 86_400_000));
const NORMAL: PriorCheck[] = [41.6, 42.3, 41.9, 42.5, 41.8, 42.2].map((b, i) => ({ day: dayAgo(i + 1), bestCm: b, meanCm: b - 1.1, teCm: 1.3, jumps: 3, poseHz: 60, belowReal: false, band: 'normal' }));
const COACHES = scene === 'check' ? [{ coachId: 'c1', coachName: 'Coach Dee', rule: DEFAULT_RULE, shared: true, ruleLine: ruleLine(DEFAULT_RULE, { coachName: 'Coach Dee' }) }] : [];

/** Today's take: 9 % under the athlete's normal for the coached scene, 6 % over it for the solo one. */
w.__frames = () => {
  const k = scene === 'check' ? 0.91 : 1.06;
  const take = buildTake([0.42, 0.425, 0.418].map((m) => ({ trial: { heightM: m * k } })), { leadS: 3.2 });
  return filmTake(take, { fps: 60, seed: 11 }).frames;
};
if (scene === 'solo') { try { localStorage.setItem(DEVICE_KEY, JSON.stringify(NORMAL)); } catch { /* the check reads "building" */ } }

const BOARD = {
  available: true,
  alerts: [{ id: 'al1', athleteId: 'a1', name: 'Maya Okafor', day: TODAY, seenAt: null, line: 'Maya Okafor\'s jump check read Low: down 9.1% on their normal. Today\'s session eased automatically.' }],
  latest: [{ athleteId: 'a1', name: 'Maya Okafor', day: TODAY, band: 'low', dropPct: 9.1 }, { athleteId: 'a2', name: 'Jordan Reyes', day: TODAY, band: 'ready', dropPct: -5.2 }, { athleteId: 'a3', name: 'Sam Lee', day: dayAgo(1), band: 'normal', dropPct: 1.2 }],
  athletes: [
    { id: 'a1', name: 'Maya Okafor', adult: true, shares: true, rule: { kind: 'drop_pct', dropPct: 8, action: 'ease' } },
    { id: 'a2', name: 'Jordan Reyes', adult: true, shares: true, rule: null },
    { id: 'a4', name: 'Riley Chen', adult: false, shares: false, rule: null },
  ],
  teams: [{ id: 't1', name: 'Varsity', rule: { kind: 'low_twice', dropPct: 5, action: 'tell' } }],
  defaultRule: { kind: 'drop_pct', dropPct: DEFAULT_RULE.dropPct, action: 'ease', line: ruleLine(DEFAULT_RULE) },
};
const TREND = Array.from({ length: 20 }, (_, i) => ({ day: dayAgo(20 - i), bestCm: 41.5 + Math.sin(i * 1.3) * 0.8 - (i === 14 || i === 15 ? 3.6 : 0), band: i < 3 ? 'building' : i === 14 || i === 15 ? 'low' : i === 8 ? 'ready' : 'normal' }));

async function answer(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const path = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
  const method = (init?.method ?? 'GET').toUpperCase();
  if (method !== 'GET') w.__SENT__.push({ method, url: path, body: typeof init?.body === 'string' ? init.body : '' });
  if (path === '/api/readiness/check' && method === 'GET') {
    if (scene === 'trend') return Response.json({ ok: true, canSave: true, ready: true, kept: 'server', coaches: [], history: [], trend: TREND, today: null });
    if (scene === 'solo') return Response.json({ ok: true, canSave: false, ready: false, kept: 'device', coaches: [], history: null, trend: null, today: null });
    return Response.json({ ok: true, canSave: true, ready: true, kept: 'server', coaches: COACHES, history: NORMAL, trend: NORMAL.slice().reverse().map((c) => ({ day: c.day, bestCm: c.bestCm, band: c.band })), today: null });
  }
  if (path === '/api/readiness/check' && method === 'POST') {
    const b = JSON.parse(String(init?.body ?? '{}'));
    const today = { day: b.day, bestCm: b.bestCm, meanCm: b.meanCm, teCm: b.teCm, jumps: b.jumps, poseHz: b.poseHz };
    const { facts, read } = readDay(today, NORMAL, b.feel ?? null, COACHES);
    const view = viewOf({ today, facts, read, priorChecks: NORMAL.length, coaches: COACHES, told: read.band === 'low' ? ['c1'] : [], saved: true });
    const trend = [...NORMAL.slice().reverse(), { ...today, belowReal: facts.belowReal, band: read.band }].map((c) => ({ day: c.day, bestCm: c.bestCm, band: c.band }));
    return Response.json({ saved: true, first: true, view, trend });
  }
  // the real loadToday's payload, made by the probe in Node (it reads lib/db's module graph) and handed in
  if (path === '/api/coach/me/today') return Response.json((window as unknown as { __TODAY__: unknown }).__TODAY__);
  if (path === '/api/coach/readiness') return method === 'GET' ? Response.json(BOARD) : Response.json({ ok: true });
  return Response.json({ error: 'not_found' }, { status: 404 });
}
window.fetch = answer as typeof fetch;

const shell = (child: unknown) => h('main', { className: 'mx-auto min-h-screen max-w-md bg-[#050505] px-4 py-6 pb-20' }, child as never);
const root = createRoot(document.getElementById('root')!);
if (scene === 'check' || scene === 'solo') root.render(shell(h(ReadinessCheck)));
else if (scene === 'today') root.render(shell(h(TodayView, { api: { today: '/api/coach/me/today', log: '/api/coach/me/log', messages: null, readiness: '/api/readiness/check' } })));
else if (scene === 'coach') root.render(shell(h('section', { className: 'rounded-xl border border-white/6 bg-[#0f0f13] p-4' }, h('h2', { className: 'text-sm font-semibold text-white/80' }, 'Needs you today'), h(ReadinessPanel))));
else if (scene === 'teen') root.render(shell(h('div', { className: 'fel-card rounded-xl p-5 text-sm text-white/75', 'data-readiness-adults-only': '' }, ADULTS_ONLY_LINE)));
else root.render(shell(h(ReadinessTrendCard)));
