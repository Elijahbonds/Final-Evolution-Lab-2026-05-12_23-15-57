// PLATFORM PHASE 6 rig fixture (2026-10-28): a coached ADULT athlete's Today, answered the way the real route answers it.
// The payload is NOT hand-written: lib/coach/todayServer.ts loadToday runs over the in-memory store
// (lib/coach/todayMemoryDb.ts) on a program seeded below, the coach's reply is lib/coach/coachReply.ts coachReplyFor over
// the thread, and each exercise's loop is the library's own pick (lib/library/match.ts + demo.ts, as
// lib/coach/todayExtras.ts libraryClips does — that file is server-only, so its three lines are repeated here).
// Writes athlete-today.json beside this file: { today, messages, warmup }. The same JSON feeds the BEFORE run (the old
// Today ignores `reply` and `clips`) and the AFTER run.
//   npx tsx scripts/probes/platform/athlete-fixture-gen.mts
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as memMod from '../../../lib/coach/todayMemoryDb';
import * as todayMod from '../../../lib/coach/todayServer';
import * as replyMod from '../../../lib/coach/coachReply';
import * as filesMod from '../../../lib/library/files';
import * as matchMod from '../../../lib/library/match';
import * as demoMod from '../../../lib/library/demo';

// lib/ is CommonJS to tsx: its named exports arrive on the default export
const d = <T,>(m: T): T => ((m as unknown as { default?: T }).default ?? m);
const { todayMemoryDb, newTodayStore, seedProgram, catalogueRow } = d(memMod);
const { loadToday } = d(todayMod);
const { coachReplyFor } = d(replyMod);
const { loadLibraryFiles } = d(filesMod);
const { matchLibraryByName } = d(matchMod);
const { demoClipFor } = d(demoMod);

const s = newTodayStore();
s.user.push({ id: 'coach', name: 'Dee', email: 'dee@x.test' }, { id: 'u1', name: 'Jordan Reyes', email: 'jordan@example.com', dobYear: 1996 });
s.pe.push(
  catalogueRow({ id: 'pe-goblet', coachId: 'coach', name: 'Goblet Squat', pattern: 'squat', braceMode: 'set', equipment: ['kettlebell'],
    primaryCues: ['Elbows inside the knees', 'Spread the floor', 'Chest proud'], commonFaults: [{ fault: 'Knees drift in', correctionCue: 'Push the knees out over the toes' }], regressionOfId: 'pe-box' }),
  catalogueRow({ id: 'pe-box', coachId: 'coach', name: 'Box Squat', pattern: 'squat' }),
  catalogueRow({ id: 'pe-split', coachId: 'coach', name: 'Split Squat', pattern: 'lunge', primaryCues: ['Front shin stays tall'] }),
  catalogueRow({ id: 'pe-row', coachId: 'coach', name: 'Half-Kneeling Cable Row', pattern: 'pull', primaryCues: ['Elbow to the back pocket'] }),
  catalogueRow({ id: 'pe-carry', coachId: 'coach', name: 'Suitcase Carry', pattern: 'carry', primaryCues: ['Stand tall, no lean'] }),
);
const day = (label: string, order: number) => ({ order, label, exercises: [
  { exerciseId: 'pe-goblet', section: 'key', isKeySet: true, sets: 4, reps: '5', load: 'RPE8', restSeconds: 120, setupCues: ['tripod-down'], coachNote: 'Own the bottom.' },
  { exerciseId: 'pe-split', section: 'assist', supersetGroup: 'A', sets: 3, reps: '8 each side', load: 'RPE7', restSeconds: 75 },
  { exerciseId: 'pe-row', section: 'assist', supersetGroup: 'A', sets: 3, reps: '10', load: 'RPE7', restSeconds: 75 },
  { exerciseId: 'pe-carry', section: 'finish', sets: 2, reps: '30 s', workSeconds: 30, load: '24kg', restSeconds: 60 },
] });
const ids = seedProgram(s, { coachId: 'coach', clientId: 'u1', name: 'Off-season strength', blockLabel: 'Week 2',
  sessions: [day('Day 1 · Lower', 1), day('Day 2 · Lower', 2), { order: 3, label: 'Off day', kind: 'recovery', exercises: [] }, day('Day 3 · Lower', 4)] });

const NOW = new Date();
const H = 3_600_000;
// Day 1 done yesterday, logged per set, the coach's reply after it
const done = new Date(NOW.getTime() - 26 * H);
s.cs.push({ id: 'cs1', programId: ids.programId, sessionId: ids.sessionIds[0], clientId: 'u1', completedAt: done, createdAt: done, updatedAt: done, cooldownDoneAt: done });
s.log.push({ id: 'l1', clientSessionId: 'cs1', sessionExerciseId: ids.exerciseIds[0][0], actualSets: 4, actualReps: '5,5,5,5', actualLoad: '24 kg', rpe: 8, clientNote: null, videoUrl: null,
  coachComment: null, coachCommentAt: null, completedAt: done, createdAt: done, updatedAt: done, servedExerciseId: null });
const messages = [
  { id: 'm1', programId: ids.programId, authorId: 'u1', body: 'Day 1 done. Knees felt better on the last two sets.', createdAt: new Date(NOW.getTime() - 25 * H) },
  { id: 'm2', programId: ids.programId, authorId: 'coach', body: 'Nice work. Knees stayed out on every rep I saw. Same weight today, and own the bottom.', createdAt: new Date(NOW.getTime() - 3 * H) },
];
const db = {
  ...todayMemoryDb(s),
  clientSession: { ...todayMemoryDb(s).clientSession, findFirst: async () => ({ completedAt: done }) },
  programMessage: { findMany: async (a: { where: { authorId?: string } }) => messages.filter((m) => !a.where.authorId || m.authorId === a.where.authorId).sort((x, y) => +y.createdAt - +x.createdAt).slice(0, 1) },
};

const payload = await loadToday(db as never, 'u1', NOW);
const reply = await coachReplyFor(db, 'u1', payload, NOW);
const docs = loadLibraryFiles();
const clips: Record<string, string | null> = {};
for (const e of payload.today?.session.exercises ?? []) {
  const hit = matchLibraryByName(docs, [e.name]);
  clips[e.id] = hit && hit.review.status === 'approved' ? demoClipFor(hit) : null;
}
const today = { ...payload, ...(reply ? { reply } : {}), clips };
const thread = messages.map((m) => ({ ...m, mine: m.authorId === 'u1', fromCoach: m.authorId === 'coach' }));
writeFileSync(join(import.meta.dirname, 'athlete-today.json'), JSON.stringify({ today, messages: { messages: thread, reads: false } }, null, 1) + '\n');
console.log(`session ${today.today?.session.label}: ${today.today?.session.exercises.map((e) => `${e.name}→${clips[e.id] ?? 'still'}`).join(', ')}; reply: ${reply?.body ?? 'none'}`);
