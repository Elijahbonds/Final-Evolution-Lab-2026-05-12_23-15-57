// The coach's own tools on a phone and a desktop, with no server and no production data (COACH-TOOLS-EASY, 2026-11-02).
// Bundled by scripts/probes/_coach-tools-phone.mts with esbuild and loaded into headless Chromium at 390 and 1280 px.
// Every /api call is answered from SEEDED fixtures: the platform phase-5 coach (scripts/probes/platform/coach-fixture.mts:
// twelve athletes, ten things waiting, the queue built by the real lib/coach/queue.ts), plus a combine roster and a
// business dashboard written here. The same entry builds against the lane's base and this lane.
//   #home #sheet #thread #drafts #reviews #reply #attention #setup #combine #combine-setup #business
import { createElement as h, useEffect, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { CoachView } from '@/app/coach/_components/coach-view';
import { CombineApp } from '@/components/combine/combine-app';
import { BusinessDashboard } from '@/components/coach-business/business-dashboard';
// @ts-ignore -- the platform rig's fixture is an .mts module (esbuild bundles it; tsc does not import .mts by name)
import { FIXTURES } from './platform/coach-fixture.mts';
import QUEUE from './platform/coach-queue.json';

const scene = location.hash.slice(1) || 'home';
const W = window as unknown as { __READY__?: boolean };
try { localStorage.clear(); } catch { /* a fresh page anyway */ }

const OPEN = { jump: false, skills: [] as string[] };
const adult = (id: string, name: string) => ({ id, name, source: 'roster', access: { testable: true, camera: true, saveCamera: true, held: null, today: OPEN } });
const COMBINE = {
  available: true,
  athletes: [adult('a1', 'Ada Lovelace'), adult('a2', 'Ben Ortiz'), adult('a3', 'Cara Diaz'), adult('a4', 'Dev Patel'), adult('a5', 'Eli Brooks')],
  teams: [{ id: 'team-1', name: 'Varsity', athleteIds: ['a1', 'a2', 'a3', 'a4', 'a5'] }],
  events: [],
};
const pkg = (id: string, kind: string, title: string, priceCents: number) => ({ id, coachId: 'coach', kind, title, summary: '', priceCents, includes: ['A weekly program in the app'], capacity: null, sessions: null, active: true, sortOrder: 0, spotsLeft: null, action: 'apply' });
const BUSINESS = {
  ready: true, plan: { plan: 'free', gatesOn: true, clientLimit: 3, activeClients: 12 }, proPriceCents: 3_900, paymentsLive: false, marketplaceOn: true,
  profile: { slug: 'dee-coach', displayName: 'Dee Coach', headline: 'Strength and speed for field athletes', bio: 'Eleven years coaching.', specialties: ['Speed'], certifications: ['CSCS'], published: false },
  market: { listed: false, acceptingClients: true, sports: ['football'], goals: ['speed'] },
  packages: [pkg('p1', 'monthly', 'Monthly online coaching', 14_900)], connect: null, needsStripeSetup: true,
  coachTerms: { version: 'coach-terms-unsigned-test-mode', href: null, signed: false }, feeLabel: '5%', disputes: [], sales: [], applications: [], highlights: [],
};

async function answer(input: RequestInfo | URL): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const path = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
  if (path === '/api/coach/queue') return Response.json(QUEUE);
  if (path === '/api/coach/combine') return Response.json(COMBINE);
  if (path === '/api/coach/business') return Response.json(BUSINESS);
  if (path === '/api/share/me') return Response.json({ id: 'coach', name: 'Dee Coach', certified: true });
  if (path === '/api/coach/messages') return Response.json({ messages: [{ id: 'm1', fromCoach: false, body: 'Left knee felt wobbly on the last set. Should I drop the weight?', createdAt: '2026-10-27T09:00:00Z', readAt: null }] });
  if (path in FIXTURES) return Response.json(FIXTURES[path]);
  return Response.json({}, { status: 200 });
}
window.fetch = answer as typeof fetch;

function App() {
  let body: ReactNode;
  if (scene.startsWith('combine')) body = h('main', { className: 'mx-auto max-w-xl px-4 py-6' }, h(CombineApp));
  else if (scene === 'business') body = h(BusinessDashboard);
  else body = h(CoachView);
  useEffect(() => { W.__READY__ = true; }, []);
  return h('div', { className: 'min-h-screen bg-fel-bg pb-20' }, body);
}
createRoot(document.getElementById('root')!).render(h(App));
