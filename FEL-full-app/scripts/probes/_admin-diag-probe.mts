// Ship pass 2, Phase 5 proof: promote the LOCAL playtest account to admin, then read /api/admin/diag.
import { PrismaClient } from '@/public/_prisma/client';
import { request } from 'playwright-core';
const prisma = new PrismaClient();
await prisma.user.update({ where: { email: 'playtest@fel.local' }, data: { role: 'admin' } });
await prisma.$disconnect();
const rc = await request.newContext({ baseURL: process.env.BASE ?? 'http://localhost:3000' });
const csrf = (await (await rc.get('/api/auth/csrf')).json()).csrfToken as string;
await rc.post('/api/auth/callback/credentials', { form: { csrfToken: csrf, email: 'playtest@fel.local', password: 'playtest-local-only', json: 'true' } });
const r = await rc.get('/api/admin/diag?hours=6');
const j = await r.json();
console.log('status', r.status(), 'total', j.total, 'byKind', JSON.stringify(j.byKind), 'modes', Object.keys(j.byMode ?? {}).join(','));
for (const e of (j.recent ?? []).slice(0, 5)) console.log('  ', e.at, e.kind, e.mode, String(e.detail).slice(0, 90));
await rc.dispose();
