// PLAT-BBS04-2: the rig page for scripts/probes/platform/team-rollup-tap.mts. The REAL TeamRollup with a fixed week,
// inside the team page's own column (components/groups/group-screen.tsx: max-w-2xl, px-4), so its boxes are the page's.
import { createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { TeamRollup } from '@/components/groups/team-rollup';
import type { Rollup } from '@/lib/groups/activity';

const on = location.hash.includes('on');
const rollup: Rollup = {
  weekKey: '2026-W45',
  rows: [
    { userId: 'a1', name: 'Jordan Reyes', minor: false, drillDays: 5, runsThisWeek: 7, runsLastWeek: 4, trend: 'up' },
    { userId: 'a2', name: 'Sam Okafor', minor: true, drillDays: 2, runsThisWeek: 1, runsLastWeek: 3, trend: 'down' },
    { userId: 'a3', name: 'Priya Natarajan-Whitfield', minor: false, drillDays: 0, runsThisWeek: 0, runsLastWeek: 0, trend: null },
  ],
  totals: { athletes: 3, active: 2, drillDays: 7, runs: 8 },
  drillAssigned: on,
};
// the PATCH the box sends: counted, answered ok, never leaves the page
const w = window as unknown as { __PATCHES: string[]; __CHANGED: number };
w.__PATCHES = []; w.__CHANGED = 0;
window.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
  if (init?.method === 'PATCH') w.__PATCHES.push(`${String(url)} ${String(init.body)}`);
  return new Response(JSON.stringify({ programs: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
}) as typeof fetch;

createRoot(document.getElementById('root')!).render(
  h('main', { className: 'mx-auto w-full max-w-2xl space-y-4 px-4 py-6' },
    h('h1', { className: 'sr-only' }, 'Team'),
    h(TeamRollup, { groupId: 'g1', rollup, onChanged: () => { w.__CHANGED++; } })),
);
setTimeout(() => { document.body.dataset.a11yReady = '1'; }, 600);
