// Combine day on a phone, with no server (COMBINE-DAY, 2026-10-25). Bundled by scripts/probes/_combine-day-probe.mts
// with esbuild and loaded into headless Chromium. The coach's screens are the real ones (components/combine/combine-app.tsx);
// the jump station's camera is the pose service's own feed (lib/pose/PoseService.ts beginFeed / pushFeed), pushed a take
// filmed in the page by JUMP-PRO's bench (lib/jump/ballistic.ts); the routes are answered by a stand-in that keeps
// what it is sent, so the probe can check that only numbers went out.
//   coach   the account can save (the SQL applied): a roster of five with one teen (held) and one adult not opted in
//   draft   before the SQL: the same roster, the combine kept on this phone, "coming soon"
import { createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { CombineApp } from '@/components/combine/combine-app';
import { poseService } from '@/lib/pose/PoseService';
import type { PoseFrame } from '@/lib/pose/landmarks';
import { buildTake, filmTake } from '@/lib/jump/ballistic';

const scene = location.hash.slice(1) || 'coach';
const w = window as unknown as Window & { __frames(k: number, seed: number): PoseFrame[]; __feedBegin(): void; __feedPush(f: PoseFrame): void; __SENT__: { method: string; url: string; body: string }[] };
w.__SENT__ = [];
w.__feedBegin = () => poseService().beginFeed();
w.__feedPush = (f) => poseService().pushFeed(f);
/** A take of three jumps around 47 cm × k, filmed with its own noise seed (each athlete jumps differently). */
w.__frames = (k, seed) => filmTake(buildTake([0.46, 0.48, 0.47].map((m) => ({ trial: { heightM: m * k } })), { leadS: 3.2 }), { fps: 60, seed }).frames;
try { localStorage.clear(); } catch { /* a fresh page anyway */ }

const OPEN = { jump: false, skills: [] as string[] };
const adult = (id: string, name: string, saveCamera = true, today = OPEN) => ({ id, name, source: 'roster', access: { testable: true, camera: true, saveCamera, held: null, today } });
const CTX = {
  available: scene === 'coach',
  athletes: [
    adult('a1', 'Maya Okafor'), adult('a2', 'Jordan Reyes', false), adult('a3', 'Sam Lee'), adult('a4', 'Dev Patel', true, { jump: true, skills: [] }),   // THE JUMP GATE shut today: held at the jump station
    { id: 't1', name: 'Riley Chen', source: 'roster', access: { testable: false, camera: false, saveCamera: false, held: 'guardian_consent_required', today: { jump: true, skills: [] } } },
  ],
  teams: [{ id: 'team-1', name: 'Varsity', athleteIds: ['a1', 'a2', 'a3', 'a4', 't1'] }],
  events: [],
};

async function answer(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const path = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
  const method = (init?.method ?? 'GET').toUpperCase();
  if (method !== 'GET') w.__SENT__.push({ method, url: path, body: typeof init?.body === 'string' ? init.body : '' });
  if (path === '/api/coach/combine' && method === 'GET') return Response.json(CTX);
  if (path === '/api/coach/combine' && method === 'POST') return scene === 'coach' ? Response.json({ id: 'ev-1' }) : Response.json({ error: 'combine_not_ready' }, { status: 503 });
  if (path.startsWith('/api/coach/combine/') && method === 'PUT') {
    const b = JSON.parse(String(init?.body ?? '{}'));
    // the server's rule: a camera number for an athlete who has not opted in stays on the phone
    const kept = Object.keys(b.results?.a2 ?? {}).filter((s) => !s.startsWith('sprint') && !s.startsWith('agility')).map((s) => ({ athleteId: 'a2', stationId: s }));
    return Response.json({ saved: 1, keptOnDevice: kept });
  }
  return Response.json({ error: 'not_found' }, { status: 404 });
}
window.fetch = answer as typeof fetch;

createRoot(document.getElementById('root')!).render(h('main', { className: 'mx-auto min-h-screen max-w-2xl bg-[#050505] px-4 py-6 pb-24' },
  h('p', { className: 'font-mono text-[10.5px] font-bold uppercase tracking-[0.18em] text-[#00E5FF]' }, 'Combine day'),
  h('h1', { className: 'mb-5 text-3xl font-black text-white' }, 'Tryouts and testing days'),
  h(CombineApp),
));
