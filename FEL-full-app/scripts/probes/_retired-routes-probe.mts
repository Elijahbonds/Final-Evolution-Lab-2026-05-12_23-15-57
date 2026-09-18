// Phase 9: retired modes must be dark for a LOGGED-IN player too.
import { request } from 'playwright-core';
const BASE = process.env.BASE ?? 'http://localhost:3000';
const rc = await request.newContext({ baseURL: BASE });
const csrf = (await (await rc.get('/api/auth/csrf')).json()).csrfToken as string;
await rc.post('/api/auth/callback/credentials', { form: { csrfToken: csrf, email: 'playtest@fel.local', password: 'playtest-local-only', json: 'true' } });
for (const r of ['sprint', 'showdown', 'duel', 'onevone']) {
  const res = await rc.get(`/play/${r}`, { maxRedirects: 0 }).catch((e) => ({ status: () => `ERR ${e.message.slice(0, 40)}`, headers: () => ({}), text: async () => '' }));
  const loc = (res.headers() as Record<string, string>)['location'] ?? '';
  const body = await res.text();
  const hint = /retired|not found|404|no such mode|unknown mode/i.exec(body)?.[0] ?? '';
  console.log(`${r.padEnd(9)} status ${res.status()} ${loc ? '→ ' + loc : ''} ${hint ? 'body: ' + hint : ''}`);
}
await rc.dispose();
