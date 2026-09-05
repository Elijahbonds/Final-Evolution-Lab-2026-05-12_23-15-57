// _mp-challenge — pass 5 phase 5: a dunk challenge created by the playtest user carries their REAL best dunk score (the key
// map fix), and accepting it as the mentee settles with both scores.
import { request } from 'playwright-core';
async function login(email: string, password: string) {
  const rc = await request.newContext({ baseURL: 'http://localhost:3000' });
  const csrf = (await (await rc.get('/api/auth/csrf')).json()).csrfToken as string;
  await rc.post('/api/auth/callback/credentials', { form: { csrfToken: csrf, email, password, json: 'true' } });
  return rc;
}
const host = await login('playtest@fel.local', 'playtest-local-only');
const mode = process.env.MODE ?? 'dunk';
const created = await (await host.post('/api/v1/mp/create', { data: { mode } })).json();
console.log(`create ${mode}: code ${created.code ?? 'none'} · hostScore ${created.hostScore} · ${created.error ?? ''}`);
const guest = await login(process.env.GUEST_EMAIL ?? 'mentee@fel.local', process.env.GUEST_PASSWORD ?? 'playtest-local-only');
const joined = await (await guest.post('/api/v1/mp/join', { data: { code: created.code } })).json();
const m = joined.match ?? joined;
console.log(`join as guest: status ${m.status ?? joined.error} · host ${m.hostScore} vs guest ${m.guestScore} · outcome ${m.outcome ?? m.result ?? '?'} · winner ${m.winnerId ? (m.winnerId === m.hostId ? 'host' : 'guest') : 'tie/none'}`);
await host.dispose(); await guest.dispose();
