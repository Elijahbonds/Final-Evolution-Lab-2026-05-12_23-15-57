// What POST /api/offline/results accepts and records (lib/pwa/offlineResults.ts): practice runs of single-player modes,
// recorded once each, never paid; before the pending SQL is applied, not_ready.
import { beforeEach, describe, expect, it } from 'vitest';
import { INSERT_OFFLINE_PLAY, OFFLINE_RESULT_MAX_AGE_MS, offlineMode, parseOfflineResult, recordOfflinePlay, resetOfflinePlayProbe } from './offlineResults';

const NOW = Date.UTC(2026, 9, 26, 12);
const ok = { mode: 'dunkContest', score: 40, won: true, durationMs: 61_400, completedAt: new Date(NOW - 3600_000).toISOString() };
const KEY = '4b0e7a52-9d0c-4b7f-a8a8-2f1d0c3e9b11';

describe('parseOfflineResult', () => {
  it('a single-player run in the window is accepted, seconds rounded', () => {
    expect(parseOfflineResult(ok, KEY, NOW)).toEqual({ ok: true, value: { runKey: KEY, mode: 'dunkContest', score: 40, won: true, durationSec: 61, playedAt: new Date(NOW - 3600_000) } });
  });
  it('old spellings resolve; non-catalogue, parked and non-/play modes are refused', () => {
    expect(offlineMode('velocitykart')).toBe('velocityKart');
    expect(offlineMode('mirror')).toBe('mirror');
    for (const m of ['storyMode', 'marketplace', 'kitchens', 'training', 'nope', '', 7]) expect(offlineMode(m), String(m)).toBeNull();
  });
  it.each([
    [{ ...ok, score: -1 }, 'bad_score'], [{ ...ok, score: 1.5 }, 'bad_score'], [{ ...ok, score: '40' }, 'bad_score'], [{ ...ok, score: 2e9 }, 'bad_score'],
    [{ ...ok, durationMs: -5 }, 'bad_duration'], [{ ...ok, durationMs: 7 * 3600_000 }, 'bad_duration'],
    [{ ...ok, completedAt: 'yesterday' }, 'bad_time'], [{ ...ok, completedAt: new Date(NOW + 3600_000).toISOString() }, 'in_the_future'],
    [{ ...ok, completedAt: new Date(NOW - OFFLINE_RESULT_MAX_AGE_MS - 1).toISOString() }, 'too_old'],
    [{ ...ok, mode: 'storyMode' }, 'mode_not_offline'], [null, 'bad_body'], [[ok], 'bad_body'],
  ])('%j → %s', (body, error) => {
    expect(parseOfflineResult(body, KEY, NOW)).toEqual({ ok: false, error });
  });
  it('the run key is required and plain', () => {
    expect(parseOfflineResult(ok, null, NOW)).toEqual({ ok: false, error: 'run_key_required' });
    expect(parseOfflineResult(ok, 'short', NOW)).toEqual({ ok: false, error: 'run_key_required' });
    expect(parseOfflineResult(ok, "x'; DROP TABLE x;--", NOW)).toEqual({ ok: false, error: 'run_key_required' });
  });
});

describe('recordOfflinePlay', () => {
  let rows: unknown[][];
  let tables: boolean;
  const db = {
    async $queryRawUnsafe<T>(q: string): Promise<T> { return (q.includes('OfflinePlay') && tables ? [{ ok: 1 }] : []) as T; },
    async $executeRawUnsafe(q: string, ...v: unknown[]): Promise<number> {
      if (q !== INSERT_OFFLINE_PLAY) throw new Error('unexpected');
      if (!tables) throw Object.assign(new Error('relation "OfflinePlay" does not exist'), { code: '42P01' });
      if (rows.some((r) => r[1] === v[1] && r[2] === v[2])) return 0;   // ON CONFLICT ("userId", "runKey") DO NOTHING
      rows.push(v);
      return 1;
    },
  };
  beforeEach(() => { rows = []; tables = true; resetOfflinePlayProbe(); });

  it('records once per run however often it is sent', async () => {
    const v = (parseOfflineResult(ok, KEY, NOW) as { value: never }).value;
    expect(await recordOfflinePlay(db, 'u1', v, NOW)).toEqual({ status: 'recorded' });
    expect(await recordOfflinePlay(db, 'u1', v, NOW)).toEqual({ status: 'already' });
    expect(rows).toHaveLength(1);
    expect(rows[0].slice(1)).toEqual(['u1', KEY, 'dunkContest', 40, true, 61, new Date(NOW - 3600_000)]);
  });

  it('before the table exists: not_ready, nothing attempted', async () => {
    tables = false;
    const v = (parseOfflineResult(ok, KEY, NOW) as { value: never }).value;
    expect(await recordOfflinePlay(db, 'u1', v, NOW)).toEqual({ status: 'not_ready' });
  });

  it('records into OfflinePlay only — never a GameSession, a wallet or a profile', () => {
    expect(INSERT_OFFLINE_PLAY).toMatch(/^INSERT INTO "OfflinePlay"/);
    expect(INSERT_OFFLINE_PLAY).not.toMatch(/GameSession|Wallet|PlayerProfile|Ledger/);
  });
});
