// Every measuring tool on a phone, screen by screen, with no server (TOOLS-EASY, 2026-10-28). Bundled by
// scripts/probes/_tools-easy-phone.mts with esbuild and loaded into headless Chromium at 390 px. The same entry builds
// against the lane's base (the "before" tree, built from git objects) and this lane (the "after").
//
// The live scenes are the real components on the pose service's own feed (lib/pose/PoseService.ts beginFeed / pushFeed),
// pushed frames JUMP-PRO's bench films in the page (lib/jump/ballistic.ts); the API is answered in the page.
//   #readiness #readiness-stand #readiness-refused #combine-stand #combine-refused #vbt #vbt-live #sprint #sprint-tap
//   #jump-tests #form-review
import { createElement as h, useEffect, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { ReadinessCheck } from '@/components/readiness/readiness-check';
import { VelocitySession } from '@/components/vbt/velocity-session';
import { SpeedApp } from '@/components/sprint/speed-app';
import { JumpTests } from '@/components/jump/jump-tests';
import { JumpCamera } from '@/components/combine/jump-camera';
import { RecordSet } from '@/components/coach/form-review/record-set';
import { poseService } from '@/lib/pose/PoseService';
import type { PoseFrame } from '@/lib/pose/landmarks';
import { buildTake, filmTake } from '@/lib/jump/ballistic';
import { featuresFor } from '@/lib/vbt/gate';

declare const __VER__: string;
const scene = location.hash.slice(1) || 'readiness';
const W = window as unknown as { __READY__?: boolean; __feed(frames: PoseFrame[]): void; __stand(): PoseFrame[]; __swing(): PoseFrame[] };

// the page's own words above each tool (its TabPage eyebrow, title and lede), as each tree has them
const PAGE: Record<string, { before: [string, string]; after: [string, string] }> = {
  readiness: { before: ['Readiness check', 'Three jumps against your own normal: ready, normal or low, and why.'], after: ['Readiness check', 'Three jumps, hands on hips. About 30 seconds.'] },
  combine: { before: ['Combine day', ''], after: ['Combine day', ''] },
  vbt: { before: ['Bar speed', 'Rep speed from your camera: zones, speed loss, and your load-velocity line. Estimates, not lab numbers.'], after: ['Bar speed', 'Rep speed from your camera. Every number is an estimate.'] },
  sprint: { before: ['Sprint speed', "Time a sprint, a flying 10 or a 5-10-5 with your phone's camera, and read your top speed. Every number is an estimate."], after: ['Sprint speed', 'Time a sprint with your phone\'s camera. Every number is an estimate.'] },
  jumps: { before: ['Your vertical', '(the jump tests sit under an adult\'s jump result, inside "More detail")'], after: ['Jump tests', 'Squat jump, arm swing, one leg, 10-5 bounce. Film it, then read it on this phone.'] },
  form: { before: ['Film a set', ''], after: ['Film a set', ''] },
};
function Page({ id, children }: { id: keyof typeof PAGE; children?: ReactNode }) {
  const [title, lede] = PAGE[id][__VER__ === 'before' ? 'before' : 'after'];
  return h('main', { className: 'mx-auto min-h-screen max-w-md bg-[#050505] px-4 py-6 pb-20' },
    h('p', { className: 'text-[12px] font-bold uppercase tracking-[0.18em] text-white/50' }, 'Train'),
    h('h1', { className: 'mt-1 text-[28px] font-black leading-tight text-white' }, title),
    lede ? h('p', { className: 'mb-4 mt-1 text-[15px] text-white/70' }, lede) : null,
    children);
}

// ── frames ──
const still = () => filmTake(buildTake([], { leadS: 6 }), { fps: 60, seed: 3, noise: 1 }).frames;
W.__stand = still;
W.__swing = () => filmTake(buildTake([{ trial: { heightM: 0.44 } }], { leadS: 0.6, style: { armSwing: true } }), { fps: 60, seed: 4 }).frames;
W.__feed = (frames) => { const svc = poseService(); svc.beginFeed(); for (const f of frames) svc.pushFeed(f); };

// ── the API, answered in the page ──
const VBT_CTX = { ok: true, tier: 'adult', features: featuresFor('adult'), canSave: false, ready: true, kept: 'device', history: null, coaches: [], targets: [] };
async function answer(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const path = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
  const method = (init?.method ?? 'GET').toUpperCase();
  if (path === '/api/readiness/check' && method === 'GET') return Response.json({ ok: true, canSave: false, ready: false, kept: 'device', coaches: [], history: null, trend: null, today: null });
  if (path === '/api/vbt/sets' && method === 'GET') return Response.json(VBT_CTX);
  if (path.startsWith('/api/coach/form-reviews')) return Response.json({ available: true, items: [] });
  return Response.json({ error: 'not_found' }, { status: 404 });
}
window.fetch = answer as typeof fetch;

const FORM_CTX = { programId: 'p1', sessionExerciseId: 'se1', exerciseName: 'Goblet squat', movement: 'squat', send: { ok: true }, ready: true };

function App() {
  let body: ReactNode = null;
  switch (scene) {
    case 'readiness': case 'readiness-stand': case 'readiness-refused': body = h(Page, { id: 'readiness' }, h(ReadinessCheck)); break;
    case 'combine-stand': case 'combine-refused': body = h(Page, { id: 'combine' }, h('div', { className: 'space-y-3' },
      h('p', { className: 'text-[28px] font-black text-white' }, 'Maya Okafor · Vertical jump'),
      h(JumpCamera, { jumps: 3, athlete: 'Maya', onAttempts: () => {} }))); break;
    case 'vbt': case 'vbt-live': body = h(Page, { id: 'vbt' }, h(VelocitySession)); break;
    case 'sprint': case 'sprint-tap': body = h(Page, { id: 'sprint' }, h(SpeedApp)); break;
    case 'jump-tests': body = h(Page, { id: 'jumps' }, h(JumpTests, { adult: true, startOpen: true } as Parameters<typeof JumpTests>[0])); break;
    case 'form-review': body = h(Page, { id: 'form' }, h(RecordSet, { ctx: FORM_CTX as Parameters<typeof RecordSet>[0]['ctx'] })); break;
  }
  useEffect(() => { W.__READY__ = true; }, []);
  return body as never;
}
createRoot(document.getElementById('root')!).render(h(App));
