// Check-ins, habits and "paste a program" on a phone, with no server (COACH-PARITY, 2026-10-26). Bundled by
// scripts/probes/_coach-parity-probe.mts with esbuild and loaded into headless Chromium at 390 px. Every payload is a
// real server answer: the probe runs lib/coach/checkins/server.ts, lib/coach/habits/server.ts and lib/coach/import/
// preview.ts in Node over the in-memory tables (tests/helpers/fakeParityDb.ts) and the real library, and hands them in as
// window.__DATA__; Today's payload is the real loadToday over the Today harness. POSTs are recorded in window.__SENT__.
//   coach-checkins   the coach's check-in panel: forms, the builder open
//   coach-answers    one form's answers over time (a spark line per number question)
//   coach-habits     the coach's habits with each athlete's week and streak, and the new-habit form
//   coach-import     paste a program → the review grid, flagged lines, then "Add to …"
//   coach-soon       before the pending SQL: "coming soon"
//   client-today     the athlete's Today: habits to tick and a check-in due, above the session
//   client-teen      a teen's check-in: training questions only
import { createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { CheckinsPanel } from '@/components/coach/parity/checkins-panel';
import { HabitsPanel } from '@/components/coach/parity/habits-panel';
import { ImportProgram } from '@/components/coach/parity/import-panel';
import { CheckinCard } from '@/components/coach/parity/checkin-card';
import { HabitsToday } from '@/components/coach/parity/habits-today';
import { TodayView } from '@/app/coach/_components/today-view';

const scene = location.hash.slice(1) || 'coach-checkins';
type Data = Record<string, Record<string, unknown>>;
const w = window as unknown as Window & { __DATA__: Data; __TODAY__: unknown; __SENT__: { method: string; url: string; body: string }[]; __TREE__: unknown };
w.__SENT__ = [];
const D = (k: string) => (w.__DATA__[scene] ?? {})[k];

async function answer(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const path = url.replace(/^https?:\/\/[^/]+/, '');
  const bare = path.split('?')[0];
  const method = (init?.method ?? 'GET').toUpperCase();
  if (method !== 'GET') w.__SENT__.push({ method, url: bare, body: typeof init?.body === 'string' ? init.body : '' });
  if (bare === '/api/coach/me/today') return Response.json(w.__TODAY__);
  if (method === 'GET') {
    const v = D(path) ?? D(bare);
    return v === undefined ? Response.json({ error: 'not_found' }, { status: 404 }) : Response.json(v);
  }
  if (bare === '/api/coach/import') return Response.json(D('POST /api/coach/import'));
  if (/^\/api\/coach\/programs\/[^/]+\/exercises$/.test(bare)) return Response.json({ tree: w.__TREE__ });
  return Response.json(D(`POST ${bare}`) ?? { ok: true });
}
window.fetch = answer as typeof fetch;

const shell = (...children: unknown[]) => h('main', { className: 'mx-auto min-h-screen max-w-md space-y-4 bg-[#050505] px-4 py-6 pb-20' }, ...(children as never[]));
const root = createRoot(document.getElementById('root')!);
if (scene === 'coach-checkins' || scene === 'coach-answers' || scene === 'coach-soon') root.render(shell(h(CheckinsPanel), scene === 'coach-soon' ? h(HabitsPanel) : null));
else if (scene === 'coach-habits') root.render(shell(h(HabitsPanel)));
else if (scene === 'coach-import') root.render(shell(h('div', { className: 'fel-card rounded-xl p-4 space-y-3' }, h('div', { className: 'text-[11px] uppercase tracking-wider text-white/40' }, 'Programs I coach'), h(ImportProgram, { program: { id: 'p-1', name: 'Off-season block', clientName: 'Maya' }, blank: true, onTree: (t: unknown) => { (window as unknown as { __DONE__: unknown }).__DONE__ = t; } }))));
else if (scene === 'client-today') root.render(shell(h(TodayView, { api: { today: '/api/coach/me/today', log: '/api/coach/me/log', messages: null, habits: '/api/coach/me/habits', checkins: '/api/coach/me/checkins' } })));
else if (scene === 'client-teen') root.render(shell(h(HabitsToday), h(CheckinCard)));
