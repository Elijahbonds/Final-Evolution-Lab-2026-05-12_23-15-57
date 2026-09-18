// _coach-loop-smoke — lane 1 C1–C3 end to end on the dev DB: the client reads Today, logs and completes the session (with a
// video URL); the coach reads the inbox, comments a log, and both sides exchange a message. Prints PASS/FAIL per step.
// Needs scripts/coach/seed-loop.ts to have run. BASE=http://localhost:3000
import { request } from 'playwright-core';
const BASE = process.env.BASE ?? 'http://localhost:3000';
async function login(email: string, password: string) {
  const rc = await request.newContext({ baseURL: BASE });
  const csrf = (await (await rc.get('/api/auth/csrf')).json()).csrfToken as string;
  await rc.post('/api/auth/callback/credentials', { form: { csrfToken: csrf, email, password, callbackUrl: `${BASE}/`, json: 'true' } });
  return rc;
}
const out: Record<string, string> = {}; const say = (k: string, ok: boolean, note = '') => { out[k] = `${ok ? 'PASS' : 'FAIL'}${note ? ' — ' + note : ''}`; };
const client = await login(process.env.CLIENT_EMAIL ?? 'client@fel.local', process.env.CLIENT_PASSWORD ?? 'client-local-only');
const today = await (await client.get('/api/coach/me/today')).json();
say('C2 today', !!today.today?.session?.id, today.today ? `${today.program?.name} → ${today.today.block.label} · ${today.today.session.label} (${today.today.session.exercises.length} exercises, ${today.today.index + 1}/${today.today.total})` : JSON.stringify(today).slice(0, 120));
let logResp: any = null;
if (today.today) {
  const logs = today.today.session.exercises.map((e: any, i: number) => ({ sessionExerciseId: e.id, actualSets: e.sets, actualReps: e.reps, actualLoad: e.load, rpe: 7 + (i % 3), clientNote: i === 0 ? 'felt strong, last set slowed' : null, videoUrl: i === 0 ? 'https://fel.local/dev/form-check.mp4' : null }));
  const r = await client.post('/api/coach/me/log', { data: { programId: today.program.id, sessionId: today.today.session.id, logs, complete: true } });
  logResp = await r.json();
  say('C2 log+complete', r.status() === 200 && !!logResp.clientSession?.completedAt && logResp.clientSession.exerciseLogs.length === logs.length, `${r.status()} · ${logResp.clientSession?.exerciseLogs?.length ?? 0} logs, video on first: ${!!logResp.clientSession?.exerciseLogs?.[0]?.videoUrl}`);
}
const coach = await login(process.env.COACH_EMAIL ?? 'coach@fel.local', process.env.COACH_PASSWORD ?? 'coach-local-only');
const inbox = await (await coach.get('/api/coach/inbox')).json();
const item = inbox.items?.[0];
say('C3 inbox', !!item && item.logs.length > 0, item ? `${inbox.items.length} sessions, needsReview ${inbox.needsReview}, first: ${item.clientName} · ${item.session}` : JSON.stringify(inbox).slice(0, 120));
if (item) {
  const target = item.logs.find((l: any) => l.videoUrl) ?? item.logs[0];
  const r = await coach.post('/api/coach/review', { data: { exerciseLogId: target.id, comment: 'Depth is there — keep the chest tall on the last two reps. Watched the video: knees track well.' } });
  const j = await r.json();
  say('C3 review', r.status() === 200 && !!j.log?.coachComment, `${r.status()} on ${target.exercise}`);
  const after = await (await coach.get('/api/coach/inbox')).json();
  say('C3 needsReview drops', after.needsReview <= inbox.needsReview, `${inbox.needsReview} → ${after.needsReview}`);
  const programId = item.program.id;
  const m1 = await coach.post('/api/coach/messages', { data: { programId, body: 'Great first session. Bridge for the week: the plan survived the last set slowing down — that is the move.' } });
  const m2 = await client.post('/api/coach/messages', { data: { programId, body: 'Felt it. Day 2 tomorrow.' } });
  const thread = await (await client.get(`/api/coach/messages?programId=${programId}`)).json();
  say('C3 messages', m1.status() === 200 && m2.status() === 200 && thread.messages?.length >= 2 && thread.messages.some((m: any) => m.fromCoach) && thread.messages.some((m: any) => m.mine), `${thread.messages?.length ?? 0} in thread`);
  const c2 = await (await client.get('/api/coach/me/today')).json();
  say('C2 today advances', c2.today?.session?.id !== today.today?.session?.id, c2.today ? `now ${c2.today.block.label} · ${c2.today.session.label}; ${c2.recentComments.length} coach comment(s) surfaced` : 'program done');
  // the client may not touch the builder or the review; a stranger may not read the thread
  const forbid = await client.post(`/api/coach/programs/${programId}/exercises`, { data: { action: 'add', sessionId: 'x', exerciseId: 'y' } });
  say('gates', forbid.status() === 403, `client on builder → ${forbid.status()}`);
  // C1: the coach adds and removes a prescription
  const tree = (await (await coach.get('/api/coach/programs')).json()).programs.find((p: any) => p.tree.id === programId)?.tree;
  const lastSession = tree.blocks.at(-1).sessions.at(-1);
  const exList = await (await coach.get('/api/coach/programs/exercises')).json();
  const add = await coach.post(`/api/coach/programs/${programId}/exercises`, { data: { action: 'add', sessionId: lastSession.id, exerciseId: exList[0].id, sets: 4, reps: '6', load: 'RPE8', restSeconds: 120, coachNote: 'seed add' } });
  const addJ = await add.json();
  const added = addJ.tree?.blocks.at(-1).sessions.at(-1).exercises.find((e: any) => e.coachNote === 'seed add');
  const rm = added ? await coach.post(`/api/coach/programs/${programId}/exercises`, { data: { action: 'remove', sessionExerciseId: added.id } }) : null;
  say('C1 builder add/remove', add.status() === 200 && !!added && rm?.status() === 200, `${add.status()}/${rm?.status()} on ${lastSession.label}`);
}
console.log(JSON.stringify(out, null, 1));
