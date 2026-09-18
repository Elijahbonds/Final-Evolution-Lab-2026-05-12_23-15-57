import { PrismaClient } from '@prisma/client'; const db = new PrismaClient();
const m = await db.mpMatch.findUnique({ where: { code: process.argv[2] ?? 'DW39PA' } });
console.log(JSON.stringify({ status: m?.status, hostScore: m?.hostScore, guestScore: m?.guestScore, outcome: (m as any)?.outcome, winnerIsHost: m?.winnerId === m?.hostId, winnerIsGuest: m?.winnerId === m?.guestId, hasWinner: !!m?.winnerId }));
await db.$disconnect();
