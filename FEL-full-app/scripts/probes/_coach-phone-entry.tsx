// The coach screens on a phone, with no server (coach-loop P1, 2026-10-20). Bundled by scripts/probes/_coach-phone-probe.mts
// with esbuild and loaded into headless Chromium at 390 px: the real CoachView (Clients tab), every /api call answered
// from the fixtures below. The fixtures are deliberately the awkward case — long names, long program names, many
// invites, a full inbox, every board list — because a layout that fits only short words does not fit a real roster.
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { CoachView } from '@/app/coach/_components/coach-view';

const LONG = 'Alexandria Montgomery-Fitzgerald';
const tree = {
  id: 'p1', name: 'Off-season strength and power block — U16 Varsity', coachId: 'coach-1', clientId: 'c1',
  blocks: [{ id: 'b1', order: 1, label: 'Week 1 · Accumulation', targetDate: null, sessions: [
    { id: 's1', order: 1, label: 'Day 1 · Lower body strength', kind: 'training', exercises: [
      { id: 'e1', order: 1, exerciseId: 'x1', name: 'Rear-foot-elevated split squat with a long name', sets: 4, reps: '6-8 each side', load: 'RPE 8', tempo: '3-1-1-0', restSeconds: 120, coachNote: 'Drive through the whole foot, stay tall, slow on the way down', section: 'key', isKeySet: true, supersetGroup: null, workSeconds: null, holdSeconds: null, setupCues: [], effortBand: null },
      { id: 'e2', order: 2, exerciseId: 'x2', name: 'Half-kneeling cable row', sets: 3, reps: '10', load: '', tempo: '', restSeconds: 60, coachNote: null, section: 'assist', isKeySet: false, supersetGroup: 'A', workSeconds: null, holdSeconds: 2, setupCues: [], effortBand: null },
    ] },
  ] }],
};
const roster = Array.from({ length: 6 }, (_, i) => ({
  clientId: `c${i + 1}`, name: i === 0 ? LONG : `Athlete Number ${i + 1}`,
  programs: [{ id: `p${i + 1}`, name: i < 3 ? tree.name : 'Return to play', isActive: true }],
  card: i % 2 ? { slug: `card-${i}`, published: true, rarity: 'legendary', prq: 71, topScore: 9000, wins: 12 } : null,
  prq: { strength: 61.2, power: 55.9, speed: 48.1, agility: 52, endurance: 40 }, prqDelta: { strength: 3.1, power: -1.2 },
  sessions: 40, games: 40, gamesAtCap: true, wins: 12, resiliency: { attempts: 10, retryRate: 0.3 }, coachedSessions: 14,
  coverage: null,
}));
const FIXTURES: Record<string, unknown> = {
  '/api/coach/programs': { programs: roster.slice(0, 3).map((r, i) => ({ tree: { ...tree, id: `p${i + 1}`, clientId: r.clientId }, role: 'coach', clientName: r.name, clientId: r.clientId, completedSessionIds: [], plan: null })), coachCertified: true },
  '/api/coach/programs/exercises': [{ id: 'x1', name: 'Rear-foot-elevated split squat with a long name', category: 'lower', pattern: 'lunge' }, { id: 'x2', name: 'Half-kneeling cable row', category: 'upper', pattern: 'pull' }],
  '/api/coach/inbox': { needsReview: 3, items: [1, 2, 3].map((n) => ({
    id: `i${n}`, completedAt: '2026-10-19T10:00:00Z', program: { id: 'p1', name: tree.name }, session: 'Day 1 · Lower body strength', clientName: LONG,
    logs: [{ id: `l${n}`, exercise: 'Rear-foot-elevated split squat with a long name', prescribed: '4 × 6-8 each side @ RPE 8', actualSets: 4, actualReps: '8,8,7,6', actualLoad: '2×24kg', rpe: 8, setLines: ['Set 1 · 8 reps · 24 kg · 2 in reserve', 'Set 2 · 8 reps · 24 kg · 2 in reserve'], clientNote: 'Left knee felt a little wobbly on the last two sets, I slowed it down', videoUrl: 'https://video.example/v.mp4', coachComment: n === 1 ? 'Good depth.' : null }],
  })) },
  '/api/coach/roster': { roster },
  '/api/coach/messages/unread': { available: true, total: 2, byProgram: { p1: 2 } },
  '/api/coach/availability': { available: true, byClient: {}, linked: roster.map((r) => r.clientId) },
  '/api/coach/guardian-report': { eligible: ['c2'], email: false },
  '/api/coach/invite': { invites: [
    { token: 'ABCD2345~aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', use: 'many', expiresAt: '2026-11-20T00:00:00Z', joined: 14 },
    { token: 'WXYZ6789~bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', use: 'once', expiresAt: '2026-10-27T00:00:00Z', joined: 0 },
    { token: 'oldtokenoldtokenoldtokenoldtoken', use: 'once', expiresAt: '2026-10-27T00:00:00Z', joined: 0 },
  ] },
  '/api/coach/attention': {
    triage: { flags: [{ clientId: 'c3', displayName: 'Athlete Number 3', kind: 'gone-quiet', urgency: 3, observed: 'No activity for 9 days.', action: 'Send a short check-in before the gap sets.', positive: false }], totalFlagged: 1, clear: 2, summary: '1 athlete needs you.' },
    drift: [
      { clientId: 'c4', name: 'Athlete Number 4', state: 'awaitingProgram', daysSince: null, note: 'Waiting on you — no programming yet.' },
      { clientId: 'c1', name: LONG, state: 'stalled', daysSince: 12, note: 'No coached session for 12 days. Still playing: 5 games in the last two weeks.' },
    ],
    headline: '1 athlete is waiting on programming from you.',
    painFlags: [{ clientId: 'c5', name: 'Athlete Number 5', view: { present: true, detailed: false, label: 'Client paused an exercise' } }],
    readiness: [{ clientId: 'c6', name: 'Athlete Number 6', view: { date: '2026-10-20', level: 'low', label: 'Running low', summary: 'sleep 2/5 · soreness 4/5' } }],
    alerts: [
      { clientId: 'c1', name: LONG, kind: 'stalled', line: 'no coached session in 12 days.' },
      { clientId: 'c2', name: 'Athlete Number 2', kind: 'missed', line: '1 of 3 planned sessions in the last 7 days.' },
    ],
  },
  '/api/ai/status': { coach: 'unavailable' },
  '/api/share/me': null,
};

function answer(url: string): Response {
  const path = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
  if (path.startsWith('/api/coach/messages')) return Response.json({ messages: [{ id: 'm1', body: 'See you Thursday — bring the band for the warm-up', mine: true, fromCoach: true }] });
  if (/^\/api\/coach\/programs\/[^/]+\/gates$/.test(path)) return Response.json({ gates: {} });
  if (path.startsWith('/api/coach/prescribe')) return Response.json({ screen: null });
  if (path in FIXTURES && FIXTURES[path] !== null) return Response.json(FIXTURES[path]);
  return Response.json({ error: 'not_found' }, { status: 404 });
}
window.fetch = async (input: RequestInfo | URL) => answer(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);

createRoot(document.getElementById('root')!).render(createElement('div', { className: 'min-h-screen bg-[#050505] pb-20' }, createElement(CoachView)));
