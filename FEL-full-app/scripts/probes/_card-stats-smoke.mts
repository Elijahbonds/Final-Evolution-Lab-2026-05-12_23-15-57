// _card-stats-smoke — lane 5 S1–S3 on the dev DB: the client shapes their card (mask + pins), publishes, the public read
// carries the masked stat blocks, the OG image renders, and the coach's roster lists the client with the card link.
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
const cands = await (await client.get('/api/v1/card/highlights')).json();
say('S2 candidates', Array.isArray(cands.candidates), `${cands.candidates?.length ?? 'n/a'} pinnable`);
const pins = (cands.candidates ?? []).slice(0, 2).map((c: any, i: number) => ({ kind: c.kind, id: c.id, label: i === 0 ? 'Personal best' : undefined }));
const stolen = [...pins, { kind: 'session', id: 'not-mine' }];
const up = await client.post('/api/v1/card', { data: { displayName: 'Client Seed', tagline: 'Dunk on 10 ft by winter', showStats: { movement: true, resiliency: false, bogus: true }, highlights: stolen } });
const upJ = await up.json();
say('S1 mask saved', up.status() === 200 && upJ.card?.showStats?.resiliency === false && upJ.card?.showStats?.movement === true && !('bogus' in (upJ.card?.showStats ?? {})), JSON.stringify(upJ.card?.showStats));
say('S2 pins own-only', Array.isArray(upJ.card?.highlights) && !upJ.card.highlights.some((h: any) => h.id === 'not-mine') && upJ.card.highlights.length === pins.length, `${upJ.card?.highlights?.length ?? 0} pinned (stolen id dropped)`);
await client.post('/api/v1/card/publish', { data: { published: true } });
const slug = upJ.card?.slug;
const pub = await (await client.get(`/api/v1/card/${slug}`)).json();
say('S1 public stats', pub.ok && pub.stats && pub.stats.resiliency === null && pub.stats.verified === true && 'prq' in pub.stats, `blocks: prq ${pub.stats?.prq ? 'yes' : 'none'}, mastery ${pub.stats?.mastery?.length}, records ${pub.stats?.records?.length}, resiliency hidden ${pub.stats?.resiliency === null}, highlights ${pub.highlights?.length}`);
const og = await client.get(`/card/${slug}/opengraph-image`);
say('S3 OG image', og.status() === 200 && (og.headers()['content-type'] ?? '').includes('image/png'), `${og.status()} ${og.headers()['content-type']}`);
const page = await client.get(`/card/${slug}`);
const html = await page.text();
say('S1 card page', page.status() === 200 && html.includes('PRQ profile') || html.includes('Records') || html.includes('Mastery'), `${page.status()} · blocks in HTML: ${['PRQ profile', 'Records', 'Mastery', 'Highlights'].filter((k) => html.includes(k)).join(', ') || 'none (no data yet)'}`);
const coach = await login(process.env.COACH_EMAIL ?? 'coach@fel.local', process.env.COACH_PASSWORD ?? 'coach-local-only');
const roster = await (await coach.get('/api/coach/roster')).json();
const row = roster.roster?.find((r: any) => r.card?.slug === slug);
say('S3 roster', !!row && row.card.published === true, row ? `${row.name} → /card/${row.card.slug} · ${row.sessions} sessions · programs ${row.programs.length}` : JSON.stringify(roster).slice(0, 120));
console.log(JSON.stringify(out, null, 1));
