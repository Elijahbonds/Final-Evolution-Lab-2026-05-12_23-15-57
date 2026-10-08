/**
 * Private-slot lock. Skipped by ci-suite unless DATABASE_URL is set (DB_SUITES).
 * Two holds of one session key: one row, one refusal. No unique index was added.
 */
import 'dotenv/config';
import assert from 'node:assert';
import { PrismaClient } from '@/public/_prisma/client';
import { holdPrivateSlot } from '../lib/sessions/privateHold';

const prisma = new PrismaClient();

async function main() {
  const stamp = Date.now();
  const a = await prisma.user.create({ data: { email: `cs-a-${stamp}@fel.test`, password: 'x', dobYear: 1990 } });
  const b = await prisma.user.create({ data: { email: `cs-b-${stamp}@fel.test`, password: 'x', dobYear: 1990 } });
  const key = `pv_cs_${stamp}`;
  const startsAt = new Date(Date.now() + 86_400_000);
  try {
    const [r1, r2] = await Promise.all([
      holdPrivateSlot(prisma, { userId: a.id, kind: 'private_1on1', sessionKey: key, startsAt }),
      holdPrivateSlot(prisma, { userId: b.id, kind: 'private_1on1', sessionKey: key, startsAt }),
    ]);
    const wins = [r1, r2].filter((r) => 'id' in r);
    assert.equal(wins.length, 1, 'one hold wins');
    const rows = await prisma.sessionBooking.findMany({ where: { sessionKey: key } });
    assert.equal(rows.length, 1);
    console.log('  ✓ parallel private hold');
  } finally {
    await prisma.sessionBooking.deleteMany({ where: { sessionKey: key } });
    await prisma.user.deleteMany({ where: { id: { in: [a.id, b.id] } } });
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
