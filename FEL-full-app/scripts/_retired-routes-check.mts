// Phase 9: retired modes must stay dark for a LOGGED-IN player (they redirect to the Lab).
import { request } from 'playwright-core';
const BASE = process.env.BASE ?? 'http://localhost:3000';
const ctx = await request.newContext({ baseURL: BASE, maxRedirects: 0 });
const csrf = (await (await ctx.get('/api/auth/csrf')).json()).csrfToken as string;
await ctx.post('/api/auth/callback/credentials', { form: { csrfToken: csrf, email: 'playtest@fel.local', password: 'playtest-local-only', json: 'true' }, maxRedirects: 0 }).catch(() => undefined);
const me = await (await ctx.get('/api/auth/session')).json();
console.log('logged in:', Boolean(me?.user?.id));
for (const r of ['sprint', 'showdown', 'duel']) {
  const res = await ctx.get(`/play/${r}`, { maxRedirects: 0 });
  console.log(`/play/${r} → ${res.status()} ${res.headers()['location'] ?? ''}`);
}
const live = await ctx.get('/play/karate', { maxRedirects: 0 });
console.log(`/play/karate (live) → ${live.status()} ${live.headers()['location'] ?? ''}`);
await ctx.dispose();
