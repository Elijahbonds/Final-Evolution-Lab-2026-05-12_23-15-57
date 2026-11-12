import { PrismaClient } from '@/lib/generated/prisma';
const db = new PrismaClient();
const since = new Date(); since.setHours(0, 0, 0, 0);
const s = await db.gameSession.groupBy({ by: ['mode'], where: { createdAt: { gte: since } }, _count: { _all: true } });
console.log('GameSession today:', s.map((r) => `${r.mode}=${r._count._all}`).join(' ') || 'none');
const d = await db.analyticsEvent.groupBy({ by: ['name'], where: { createdAt: { gte: since } }, _count: { _all: true } }).catch(() => null);
console.log('AnalyticsEvent today:', d ? d.map((r) => `${r.name}=${r._count._all}`).join(' ') : 'n/a');
await db.$disconnect();
