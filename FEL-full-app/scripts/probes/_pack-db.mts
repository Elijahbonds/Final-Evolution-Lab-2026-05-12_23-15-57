import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const rules = await db.rewardRule.count(); const active = await db.rewardRule.count({ where: { active: true } });
const since = new Date(); since.setHours(0, 0, 0, 0);
const entries = await db.walletLedgerEntry.findMany({ where: { createdAt: { gte: since }, idempotencyKey: { startsWith: 'daily_first_session:' } }, select: { idempotencyKey: true, delta: true, createdAt: true } }).catch(() => []);
console.log(`RewardRule rows: ${rules} (active ${active})`);
console.log('daily_first_session entries today:', entries.map((e) => `${e.idempotencyKey.slice(0, 48)} Δ${e.delta}`).join(' | ') || 'none');
await db.$disconnect();
