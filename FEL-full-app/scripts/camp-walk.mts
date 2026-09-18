// Walk the Camp Blueprint API end to end on the dev server, as a real user.
// Login is the real NextAuth credentials flow (csrf → callback), no bypass.
//   BASE=http://localhost:3000 npx tsx scripts/camp-walk.mts
import { request } from 'playwright-core';
const { CURRICULUM } = await import('../lib/curriculum/blueprint.ts');
const BASE = process.env.BASE ?? 'http://localhost:3000';
const FAC = { email: 'playtest@fel.local', password: 'playtest-local-only' };
const MENTEE = { email: 'mentee@fel.local', password: 'playtest-local-only' };
const out: string[] = [];
async function jr(r: { status(): number; text(): Promise<string> }): Promise<any> {
  const t = await r.text();
  try { return JSON.parse(t); } catch { return { error: `non-json ${r.status()}: ${t.replace(/\s+/g, ' ').slice(0, 160)}` }; }
}
const log = (k: string, v: unknown) => { const s = typeof v === 'string' ? v : JSON.stringify(v); out.push(`${k.padEnd(18)} ${s.slice(0, 220)}`); };

async function login(creds: { email: string; password: string }) {
  const ctx = await request.newContext({ baseURL: BASE });
  const csrf = (await jr(await ctx.get('/api/auth/csrf'))).csrfToken as string;
  await ctx.post('/api/auth/callback/credentials', { form: { csrfToken: csrf, email: creds.email, password: creds.password, json: 'true' } });
  const me = await jr(await ctx.get('/api/auth/session'));
  return { ctx, userId: me?.user?.id as string | undefined, session: me };
}

const fac = await login(FAC);
log('facilitator', fac.userId ? `logged in ${fac.userId}` : `LOGIN FAILED ${JSON.stringify(fac.session)}`);
const mentee = await login(MENTEE);
log('mentee', mentee.userId ? `logged in ${mentee.userId}` : `LOGIN FAILED ${JSON.stringify(mentee.session)}`);
if (!fac.userId || !mentee.userId) { console.log(out.join('\n')); process.exit(1); }

// 1) certification: answer every required module correctly
for (const t of CURRICULUM.tracks) for (const m of t.modules) {
  const answers = Object.fromEntries(m.lessons.flatMap((l) => l.assessment.map((q) => [q.key, q.answer])));
  const r = await fac.ctx.post('/api/v1/camp/assess', { data: { trackKey: t.key, moduleKey: m.key, answers } });
  const j = await jr(r); log(`assess ${t.key}/${m.key}`, `${r.status()} score=${j.score} passed=${j.passed} status=${j.status}`);
}
const st = await jr(await fac.ctx.get('/api/v1/camp/assess')); log('cert status', `${st.status} missing=${JSON.stringify(st.missingModules)}`);

// 2) intake: draft a plan for the mentee with two milestones
let r = await fac.ctx.post('/api/v1/camp/plans', { data: { menteeId: mentee.userId, goalText: 'Make the varsity team as a two-way guard', tags: ['basketball', 'defense'], linkedModuleKeys: ['blueprint/m1', 'blueprint/m2'], milestones: [{ label: 'Handle under pressure', sessions: [{ label: 'Crossover reads' }, { label: 'Hesi timing' }] }, { label: 'Guard the ball', sessions: [{ label: 'Slide and recover' }] }] } });
let j = await jr(r); log('draft plan', `${r.status()} status=${j.plan?.status} blocks=${j.program ? 'yes' : 'no'} ${j.error ?? ''}`);
const planId = j.plan?.id as string;
r = await fac.ctx.post('/api/v1/camp/plans', { data: { action: 'lock', planId } }); j = await jr(r); log('lock', `${r.status()} status=${j.plan?.status} ${j.error ?? ''}`);
r = await fac.ctx.post('/api/v1/camp/plans', { data: { action: 'activate', planId } }); j = await jr(r); log('activate (no consent)', `${r.status()} ${j.error ?? j.plan?.status}`);

// 3) consent: request as the facilitator, accept as the guardian by token, activate again
r = await fac.ctx.post('/api/v1/camp/consent', { data: { menteeId: mentee.userId, guardianName: 'Dana Rivera', guardianEmail: 'dana@example.com', menteeBirthYear: 2011 } });
j = await jr(r); log('consent request', `${r.status()} token=${j.token ? 'yes' : 'no'} ${j.error ?? ''}`);
const token = j.token as string;
const anon = await request.newContext({ baseURL: BASE });
r = await anon.get(`/api/v1/camp/consent?token=${encodeURIComponent(token)}`); j = await jr(r); log('consent accept', `${r.status()} accepted=${j.accepted}`);
r = await fac.ctx.post('/api/v1/camp/plans', { data: { action: 'activate', planId } }); j = await jr(r); log('activate', `${r.status()} status=${j.plan?.status} ${j.error ?? ''}`);

// 4) a session record, the profile read-model, a template round trip
r = await fac.ctx.post('/api/v1/camp/sessions', { data: { goalPlanId: planId, moduleKeys: ['blueprint/m1/strength'], notes: 'Held the box-out three times. Retried after the first miss.' } });
j = await jr(r); log('session record', `${r.status()} games=${j.gamesAttached} resiliency=${JSON.stringify(j.session?.resiliency)} ${j.error ?? ''}`);
r = await fac.ctx.get(`/api/v1/camp/profile?userId=${mentee.userId}`); j = await jr(r); log('mentee profile', `${r.status()} cred=${j.credentials?.status} sessions=${j.history?.sessions} prqEntries=${j.prq?.entries}`);
r = await mentee.ctx.get(`/api/v1/camp/profile?userId=${fac.userId}`); log('mentee reads fac', `${r.status()} (expect 403)`);
r = await fac.ctx.post('/api/v1/camp/templates', { data: { action: 'export', goalPlanId: planId, name: 'Two-way guard camp', publish: true } }); j = await jr(r); log('export template', `${r.status()} id=${j.template?.id ? 'yes' : 'no'} blocks=${(j.template?.structure as any)?.blocks?.length}`);
const templateId = j.template?.id as string;
r = await fac.ctx.post('/api/v1/camp/templates', { data: { action: 'fork', templateId, name: 'Two-way guard camp v2' } }); j = await jr(r); log('fork', `${r.status()} forkedFrom=${j.template?.forkedFromId === templateId}`);
r = await fac.ctx.post('/api/v1/camp/templates', { data: { action: 'import', templateId, menteeId: mentee.userId, goalText: 'Second season' } }); j = await jr(r); log('import', `${r.status()} status=${j.plan?.status} reconciled=${j.reconciled} ${j.error ?? ''}`);
r = await mentee.ctx.get('/api/v1/camp/plans'); j = await jr(r); log('mentee plans', `${r.status()} count=${j.plans?.length}`);
r = await mentee.ctx.post('/api/v1/camp/plans', { data: { menteeId: fac.userId, goalText: 'x' } }); j = await jr(r); log('uncertified drafts', `${r.status()} ${j.error} (expect 403)`);
console.log(out.join('\n'));
await fac.ctx.dispose(); await mentee.ctx.dispose(); await anon.dispose();
