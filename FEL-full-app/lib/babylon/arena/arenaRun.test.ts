// lane/physics-arena: the page's two calls for an arena game's run (start, finish) and the body the server reads.
import { describe, expect, it } from 'vitest';
import { ARENA_SESSION_KEY, arenaFinishBody, finishArenaRun, startArenaRun } from './arenaRun';
import { rebuildArenaScore } from '@/lib/sessions/arenaScore';

const card = { modeId: 'physics_arena', outcome: 'WIN', score: 11, stats: { opponentScore: 3, won: 1 }, durationSec: 90, timestamp: '',
  detail: { arena: { v: 1, baskets: Array.from({ length: 14 }, (_, i) => ({ t: 3 + i * 2, side: i < 3 ? 'foe' : 'me', shot: true, fromM: 4 })) }, opponentScore: 3, won: true } } as const;

describe('arenaRun', () => {
  it('each sport saves under its own key', () => {
    expect(ARENA_SESSION_KEY).toEqual({ hoops: 'arenaHoops', threes: 'arenaThrees', threepoint: 'arenaThreePoint' });
  });
  it('the start: the key, unpaid playtest when ?playtest=1, the agent query when ?agent=1', async () => {
    const seen: Array<{ url: string; body: unknown }> = [];
    const f = (async (url: string, init: RequestInit) => { seen.push({ url, body: JSON.parse(String(init.body)) }); return new Response(JSON.stringify({ runId: 'run_12345678' }), { status: 200 }); }) as unknown as typeof fetch;
    expect(await startArenaRun('arenaHoops', { agent: false, playtest: false, fetch: f })).toBe('run_12345678');
    await startArenaRun('arenaThrees', { agent: true, playtest: true, fetch: f });
    expect(seen).toEqual([
      { url: '/api/sessions/start', body: { mode: 'arenaHoops' } },
      { url: '/api/sessions/start?agent=1', body: { mode: 'arenaThrees', playtest: true } },
    ]);
    const down = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    expect(await startArenaRun('arenaHoops', { agent: false, playtest: false, fetch: down })).toBeNull();
  });
  it('the finish body carries the play log as stats.arena, and the server rebuilds the shown score from it', async () => {
    const body = JSON.parse(arenaFinishBody('run_12345678', 'arenaHoops', card as never));
    expect(body).toMatchObject({ runId: 'run_12345678', mode: 'arenaHoops', score: 11, opponentScore: 3, won: true, played: true });
    expect(rebuildArenaScore(body.mode, body.stats.arena, { durationMs: 120_000, sentScore: body.score, sentOpponent: body.opponentScore })).toMatchObject({ ok: true, score: 11, opponentScore: 3, won: true });
    const sent: string[] = [];
    const deps = { fetch: async (_u: string, init: RequestInit) => { sent.push(String(init.body)); return new Response(JSON.stringify({ paid: true, xp: 67 }), { status: 200 }); }, sleep: async () => {} };
    expect(await finishArenaRun('run_12345678', 'arenaHoops', card as never, deps, null)).toEqual({ paid: true, xp: 67, reason: null });
    expect(JSON.parse(sent[0]).stats.arena.baskets).toHaveLength(14);
  });
});
