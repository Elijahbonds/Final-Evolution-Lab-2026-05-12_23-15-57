// PLATFORM PHASE 5 rig fixture (2026-10-27): an ACTIVE coach with a 10-item "Needs you today", answered on every route the
// coach screens read — the old Clients tab's (attention, drafts, form reviews, inbox, roster, programs, unread) for the
// BEFORE run, and /api/coach/queue for the AFTER run. The queue body is NOT hand-written: coach-fixture-gen.mts builds it
// from SOURCES below with the real lib/coach/queue.ts and writes coach-queue.json beside this file.
//
// The ten: a pain flag, running low, a draft to approve, a filmed set to review, two missed, a check-in, two unread
// threads, a new join with no program. Two more athletes have nothing waiting (the roster strip shows them).
export const NOW = Date.parse('2026-10-27T15:00:00Z');
const H = 3_600_000;
const iso = (hoursAgo: number) => new Date(NOW - hoursAgo * H).toISOString();

export const PEOPLE = [
  ['a1', 'Ada Lovelace'], ['a2', 'Ben Ortiz'], ['a3', 'Cara Diaz'], ['a4', 'Dev Patel'], ['a5', 'Eli Brooks'], ['a6', 'Fay Nguyen'],
  ['a7', 'Gus Moreau'], ['a8', 'Hana Ito'], ['a9', 'Ivan Petrov'], ['a10', 'Jay Kim'], ['a11', 'Kai Lee'], ['a12', 'Lia Park'],
] as const;
const name = (id: string) => PEOPLE.find((p) => p[0] === id)![1];
const withProgram = PEOPLE.map((p) => p[0]).filter((id) => id !== 'a10');
export const programOf = (id: string) => (withProgram.includes(id as never) ? `p-${id}` : null);

const draftChange = (id: string, title: string) => ({
  id, kind: 'progress_load', exerciseName: 'Trap-bar deadlift', title, reason: 'Top of the range on every set at effort 7 or less.',
  evidence: ['Last 2 sessions: 3 × 8 at 60 kg, effort 7'], confidence: 'high', safety: 'safe', method: null, ops: [], clientLine: 'A little more weight.',
  sensitive: false, priority: 2, aiNote: null,
});

/** The queue's sources, as the routes answer them (lib/coach/queue.ts QueueSources). */
export const SOURCES = {
  pain: [{ clientId: 'a1', name: name('a1'), view: { present: true, detailed: false, label: 'Client paused an exercise' } }],
  redFlags: [{ clientId: 'a2', name: name('a2'), view: { date: '2026-10-27', level: 'low', label: 'Running low: sleep, energy' } }],
  drafts: [{ draftId: 'd-a3', clientId: 'a3', name: name('a3'), status: 'ok', changes: [draftChange('x1', 'Trap-bar deadlift: 60 kg → 62.5 kg'), draftChange('x2', 'Split squat: 3 × 8 → 3 × 10')], decisions: {} }],
  reviews: [{ id: 'fr-a4', clientId: 'a4', clientName: name('a4'), programId: 'p-a4', exerciseName: 'Goblet squat', status: 'unreviewed', createdAt: iso(20), flags: [{ rep: 3, fault: 'knee_valgus' }, { rep: 4, fault: 'knee_valgus' }],
    presets: [{ id: 'fault:knee_valgus:cue', text: 'Push your knees out over your toes.' }, { id: 'setup:brace', text: 'Big breath and brace before you go down.' }] }],
  alerts: [{ clientId: 'a5', name: name('a5'), kind: 'missed', line: '1 of 3 planned sessions in the last 7 days.' }, { clientId: 'a6', name: name('a6'), kind: 'stalled', line: 'no coached session in 12 days.' }],
  checkins: [{ athleteId: 'a7', name: name('a7'), formTitle: 'Weekly check-in', createdAt: iso(30) }],
  messages: [{ programId: 'p-a8', athleteId: 'a8', name: name('a8'), unread: 2, at: NOW - 6 * H }, { programId: 'p-a9', athleteId: 'a9', name: name('a9'), unread: 1, at: NOW - 2 * H }],
  joins: [{ athleteId: 'a10', name: name('a10'), joinedAt: NOW - 26 * H, hasProgram: false }],
};

const tree = (id: string) => ({
  id: `p-${id}`, name: 'Off-season strength block', coachId: 'coach', clientId: id,
  blocks: [{ id: `b-${id}`, order: 1, label: 'Week 1', targetDate: null, sessions: [
    { id: `s-${id}`, order: 1, label: 'Day 1 · Lower body', kind: 'training', exercises: [
      { id: `e1-${id}`, order: 1, exerciseId: 'x1', name: 'Rear-foot-elevated split squat with a long name', sets: 4, reps: '6-8 each side', load: 'RPE 8', tempo: '', restSeconds: 120, coachNote: null, section: 'key', isKeySet: true, supersetGroup: null, workSeconds: null, holdSeconds: null, setupCues: [], effortBand: null },
      { id: `e2-${id}`, order: 2, exerciseId: 'x2', name: 'Half-kneeling cable row', sets: 3, reps: '10', load: '', tempo: '', restSeconds: 60, coachNote: null, section: 'assist', isKeySet: false, supersetGroup: 'A', workSeconds: null, holdSeconds: 2, setupCues: [], effortBand: null },
    ] },
  ] }],
});

const roster = PEOPLE.map(([id, n]) => ({
  clientId: id, name: n, joinedAt: id === 'a10' ? iso(26) : '2026-09-01T00:00:00Z',
  programs: programOf(id) ? [{ id: `p-${id}`, name: 'Off-season strength block', isActive: true }] : [],
  card: null, prq: { strength: 61, power: 55, speed: 48 }, prqDelta: { strength: 3 },
  sessions: 12, games: 12, gamesAtCap: false, wins: 4, resiliency: { attempts: 3, retryRate: 0.3 }, coachedSessions: 6, coverage: null,
}));

/** Every route the coach screens read, answered as an active coach with the pending SQL applied. */
export const FIXTURES: Record<string, unknown> = {
  '/api/coach/programs': { coachCertified: true, programs: withProgram.map((id) => ({ tree: tree(id), role: 'coach', clientName: name(id), clientId: id, completedSessionIds: [], plan: null })) },
  '/api/coach/programs/exercises': [{ id: 'x1', name: 'Rear-foot-elevated split squat with a long name', category: 'lower', pattern: 'lunge' }, { id: 'x2', name: 'Half-kneeling cable row', category: 'upper', pattern: 'pull' }],
  '/api/coach/roster': { roster },
  '/api/coach/inbox': { needsReview: 2, items: ['a4', 'a8'].map((id, n) => ({
    id: `i-${id}`, completedAt: iso(20 + n), program: { id: `p-${id}`, name: 'Off-season strength block' }, session: 'Day 1 · Lower body', clientName: name(id),
    logs: [{ id: `l-${id}`, exercise: 'Rear-foot-elevated split squat with a long name', prescribed: '4 × 6-8 each side @ RPE 8', actualSets: 4, actualReps: '8,8,7,6', actualLoad: '2×24kg', rpe: 8, setLines: ['Set 1 · 8 reps · 24 kg · 2 in reserve'], clientNote: 'Left knee felt wobbly on the last set', videoUrl: null, coachComment: null }],
  })) },
  '/api/coach/messages/unread': { available: true, total: 3, byProgram: { 'p-a8': 2, 'p-a9': 1 } },
  '/api/coach/attention': {
    triage: { flags: [], totalFlagged: 0, clear: 12, summary: 'Everyone is on track.' },
    drift: [], headline: null,
    painFlags: SOURCES.pain, readiness: [{ clientId: 'a2', name: name('a2'), view: { ...SOURCES.redFlags[0].view, summary: 'sleep 2/5 · energy 2/5', answers: {} } }],
    alerts: SOURCES.alerts,
  },
  '/api/coach/drafts': { weekKey: '2026-10-26', approvals: true, drafts: SOURCES.drafts.map((d) => ({
    version: 1, weekKey: '2026-10-26', coachId: 'coach', programId: 'p-a3', programName: 'Off-season strength block', band: 'adult', skipReason: null,
    held: [], context: ['2 sessions logged this week'], engine: 'rules', summary: null, guard: {}, ...d,
  })) },
  '/api/coach/form-reviews': { available: true, unreviewed: 1, items: SOURCES.reviews.map(({ presets: _p, ...r }) => ({ ...r, movement: 'squat', reps: 6, read: 6, setScore: 72, reviewedAt: null, trend: { line: 'First set filmed.', points: [] } })) },
  '/api/coach/invite': { invites: [{ token: 'ABCD2345~aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', use: 'many', expiresAt: '2026-11-20T00:00:00Z', joined: 12 }] },
  '/api/ai/status': { coach: 'unavailable' },
};

export const FIXTURE_COACH = { id: 'coach', name: 'Dee Coach' };
