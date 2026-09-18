// _mp-mode-keys — do GameSession.mode values match the multiplayer challenge keys (lib/mp/match-core MP_MODES)?
import { PrismaClient } from '@prisma/client';
import mc from '../../lib/mp/match-core';
const { MP_MODES } = mc as unknown as typeof import('../../lib/mp/match-core');
const db = new PrismaClient();
const rows = await db.gameSession.groupBy({ by: ['mode'], _count: { _all: true }, _max: { score: true } });
const sessionModes = new Set(rows.map((r) => r.mode));
console.log('GameSession.mode values:', rows.map((r) => `${r.mode}=${r._count._all}(max ${r._max.score})`).join(' '));
console.log('MP keys with NO matching session mode:', MP_MODES.map((m) => m.key).filter((k) => !sessionModes.has(k)).join(' ') || 'none');
console.log('MP keys WITH sessions:', MP_MODES.map((m) => m.key).filter((k) => sessionModes.has(k)).join(' ') || 'none');
await db.$disconnect();
