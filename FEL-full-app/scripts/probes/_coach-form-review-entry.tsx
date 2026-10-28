// The form review on a phone and a desktop, with no server (COACH-VIDEO-REVIEW, 2026-10-24). Bundled by
// scripts/probes/_coach-form-review-probe.mts with esbuild and loaded into headless Chromium. Two scenes:
//   record   the client's RecordSet, its camera replaced by the pose service's own feed (lib/pose/PoseService.ts
//            beginFeed / pushFeed — the same door the QA feed uses): the probe pushes a fixture set's frames, the page
//            counts, flags and sends; every POST body is kept on window.__SENT__ for the probe to read.
//   clients  the real CoachView (Clients tab) with its /api calls answered from fixtures, the form-review queue's from
//            window.__FR__ (built by the probe from the same pure code the server runs).
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { CoachView } from '@/app/coach/_components/coach-view';
import { RecordSet } from '@/components/coach/form-review/record-set';
import { poseService } from '@/lib/pose/PoseService';
import type { PoseFrame } from '@/lib/pose/landmarks';
import { flagsFor, scoreReps, summarize } from '@/lib/coach/formReview/score';
import type { FormReviewSubmission } from '@/lib/coach/formReview/payload';
import type { RecordContext } from '@/lib/coach/formReview/gate';

interface FR { scene: 'record' | 'clients'; ctx: RecordContext; queue: unknown; details: Record<string, unknown> }
const w = window as unknown as Window & { __FR__: FR; __SENT__: { url: string; method: string; contentType: string | null; bodyType: string; body: string }[]; __feedBegin(): void; __feedPush(f: PoseFrame): void };
const FR = w.__FR__;
w.__SENT__ = [];
w.__feedBegin = () => poseService().beginFeed();
w.__feedPush = (f) => poseService().pushFeed(f);

const tree = {
  id: 'p1', name: 'Off-season strength', coachId: 'coach-1', clientId: 'c1',
  blocks: [{ id: 'b1', order: 1, label: 'Week 1', targetDate: null, sessions: [{ id: 's1', order: 1, label: 'Day 1 · Lower', kind: 'training', exercises: [
    { id: 'e1', order: 1, exerciseId: 'x1', name: 'Goblet squat', sets: 3, reps: '8', load: 'RPE 7', tempo: '3-1-1-0', restSeconds: 90, coachNote: null, section: 'key', isKeySet: true, supersetGroup: null, workSeconds: null, holdSeconds: null, setupCues: [], effortBand: null },
  ] }] }],
};
const names = ['Maya Okafor', 'Jordan Reyes', 'Sam Lee'];
const roster = names.map((name, i) => ({
  clientId: `c${i + 1}`, name, programs: [{ id: `p${i + 1}`, name: tree.name, isActive: true }], card: null,
  prq: { strength: 61, power: 55, speed: 48 }, prqDelta: null, sessions: 12, games: 12, gamesAtCap: false, wins: 3, resiliency: { attempts: 4, retryRate: 0.2 }, coachedSessions: 6, coverage: null,
}));
const FIXTURES: Record<string, unknown> = {
  '/api/coach/programs': { programs: roster.map((r, i) => ({ tree: { ...tree, id: `p${i + 1}`, clientId: r.clientId }, role: 'coach', clientName: r.name, clientId: r.clientId, completedSessionIds: [], plan: null })), coachCertified: true },
  '/api/coach/programs/exercises': [{ id: 'x1', name: 'Goblet squat', category: 'lower', pattern: 'squat' }],
  '/api/coach/inbox': { needsReview: 0, items: [] },
  '/api/coach/roster': { roster },
  '/api/coach/messages/unread': { available: false },
  '/api/coach/availability': { available: false },
  '/api/coach/guardian-report': { eligible: [], email: false },
  '/api/coach/invite': { invites: [] },
  '/api/coach/attention': {
    triage: { flags: [], totalFlagged: 0, clear: 3, summary: 'Everyone is on track.' }, drift: [], headline: null, painFlags: [], readiness: [],
    alerts: [{ clientId: 'c3', name: 'Sam Lee', kind: 'missed', line: '1 of 3 planned sessions in the last 7 days.' }],
  },
  '/api/ai/status': { coach: 'unavailable' },
};

/** What the server answers a sent set with: its own scores and flags from the reps' faults (lib/coach/formReview/server.ts). */
function submitted(body: string): Response {
  const sub = JSON.parse(body) as FormReviewSubmission;
  const reps = scoreReps(sub.movement, sub.reps);
  return Response.json({ id: 'sent-1', set: summarize(reps), flags: flagsFor(sub.movement, reps) });
}

async function answer(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const path = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
  const method = (init?.method ?? 'GET').toUpperCase();
  if (method !== 'GET') {
    const headers = new Headers(init?.headers);
    const b = init?.body;
    w.__SENT__.push({ url: path, method, contentType: headers.get('content-type'), bodyType: b === undefined || b === null ? 'none' : typeof b === 'string' ? 'string' : Object.prototype.toString.call(b), body: typeof b === 'string' ? b : '' });
  }
  if (path === '/api/coach/form-reviews' && method === 'POST') return submitted(String(init?.body ?? '{}'));
  if (path === '/api/coach/form-reviews' && url.includes('mine=1')) return Response.json({ available: true, items: w.__SENT__.some((s) => s.method === 'POST' && s.url === '/api/coach/form-reviews') ? [{ id: 'sent-1', exerciseName: FR.ctx.exerciseName, movement: FR.ctx.movement, reps: 6, setScore: 88, flags: [], status: 'unreviewed', createdAt: new Date().toISOString(), reviewedAt: null }] : [] });
  if (path === '/api/coach/form-reviews') return Response.json(FR.queue);
  const reply = /^\/api\/coach\/form-reviews\/([^/]+)\/reply$/.exec(path);
  if (reply) return Response.json({ reviewed: true, message: { id: 'm9', body: 'Form review', mine: true, fromCoach: true } });
  const one = /^\/api\/coach\/form-reviews\/([^/]+)$/.exec(path);
  if (one && FR.details[one[1]]) return Response.json(FR.details[one[1]]);
  if (path.startsWith('/api/coach/messages')) return Response.json({ messages: [] });
  if (/^\/api\/coach\/programs\/[^/]+\/gates$/.test(path)) return Response.json({ gates: {} });
  if (path.startsWith('/api/coach/prescribe')) return Response.json({ screen: null });
  if (path in FIXTURES) return Response.json(FIXTURES[path]);
  return Response.json({ error: 'not_found' }, { status: 404 });
}
window.fetch = answer as typeof fetch;

const root = createRoot(document.getElementById('root')!);
if (FR.scene === 'record') {
  root.render(createElement('main', { className: 'mx-auto min-h-screen max-w-xl bg-[#050505] px-4 py-6 pb-20' }, createElement(RecordSet, { ctx: FR.ctx })));
} else {
  root.render(createElement('div', { className: 'min-h-screen bg-[#050505] pb-20' }, createElement(CoachView)));
}
