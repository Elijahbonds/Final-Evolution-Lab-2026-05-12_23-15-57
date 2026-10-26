// The signature programs on a phone, with no server (SIGNATURE-PROGRAMS, 2026-10-25). Bundled by
// scripts/probes/_signature-programs-probe.mts with esbuild and loaded into headless Chromium. Every view is the page's own
// pure builder (lib/signature/view.ts buildProgramView over lib/signature/plan.ts, adapt.ts and serve.ts) run by the probe
// in Node over the real library files and handed in as window.__SCENES__ (the library is ~2 MB of JSON and server-only).
//   list       /train/programs: the four approved programs, one in progress
//   overview   Vertical Jump before starting: the overview, week 1 served, the later weeks locked (no FEL Pro)
//   today      Vertical Jump week 3 for a FEL Pro adult: today's session as planned, the base decision in the week view
//   gated      the same day with the jump gate shut (no landing check) and a Low readiness check: swaps and eases
//   pain       a pain check-in that said stop and check with a clinician: calm work only, the check-in's own words
//   locked     week 2 for an adult without FEL Pro, payments off: the lock, no content
//   youth      a 15-year-old in Basketball Skills: kept on the phone, youth rules, the free week only
//   painfree   Pain-Free Prehab: the prehab note on top, week 1 in progress
//   review     /coach/admin/programs: the owner's review with the checks, the gaps and the editor open
import { createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { TabPage } from '@/components/shell/tab-page';
import { ProgramList } from '@/components/signature/program-list';
import { ProgramPage } from '@/components/signature/program-page';
import { ProgramReview } from '@/components/signature/program-review';
import { PROGRAMS_LEDE, PROGRAMS_TITLE } from '@/lib/signature/copy';
import type { ProgramView, ProgramCard } from '@/lib/signature/view';
import type { ReviewRow } from '@/lib/signature/server';

const scene = location.hash.slice(1) || 'list';
const w = window as unknown as Window & { __SCENES__: Record<string, unknown> };
const data = w.__SCENES__[scene];

// the page re-reads its view after an action; the rig answers from the scene
window.fetch = (async () => new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch;

function App() {
  if (scene === 'list') {
    const o = data as { ready: boolean; admin: boolean; youth: boolean; programs: ProgramCard[] };
    return h(TabPage, { eyebrow: 'Train', title: PROGRAMS_TITLE, lede: PROGRAMS_LEDE, accent: '#00FF9D', children: h(ProgramList, o) });
  }
  if (scene === 'review') return h('div', { className: 'min-h-screen bg-[#050505] pb-20' }, h(ProgramReview, { initial: data as { ready: boolean; programs: ReviewRow[] } }));
  const v = data as ProgramView;
  return h(TabPage, { eyebrow: 'Signature program', title: v.title, lede: v.tagline, accent: '#00FF9D', children: h(ProgramPage, { initial: v }) });
}

createRoot(document.getElementById('root')!).render(h(App));
