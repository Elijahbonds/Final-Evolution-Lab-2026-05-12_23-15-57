// BRAINBRAWL-POLISH-2 N10: the shell's results card shows the wallet coins a run's earn reports were granted. reportEarnGrant
// resolves to the SERVER's grant; reportEarn keeps its old contract (a boolean) for every other caller.
//
// The bodies are the ones app/api/v1/wallet/earn answers with (it returns `{ granted, balances, entry_id, capped, rejected }`
// on EVERY path — wallet-service.earn refuses an event and caps a grant with a 200, never an error status).
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { stripComments } from '@/lib/testing/sourceScan';
import { reportEarn, reportEarnGrant } from './client';

const report = { idempotency_key: 'sess:abc:complete', event_type: 'mode_session_completed', payload: { mode: 'brainBrawl', run_id: 'abc', score: 551 } };
const respond = (status: number, body: unknown) => vi.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }));
const balances = { coins: 43421, shards: 111, lc: 1430 };
/** The route's body: wallet-service.earn's result, `rejected` null when there was no refusal. */
const earned = (o: { coins?: number; shards?: number; capped?: boolean; rejected?: string | null } = {}) => ({
  granted: { coins: o.coins ?? 0, shards: o.shards ?? 0 }, balances, entry_id: o.coins ? 'e1' : null, capped: o.capped ?? false, rejected: o.rejected ?? null,
});

afterEach(() => { vi.unstubAllGlobals(); });

describe('wallet client — the grant a report was paid', () => {
  it('resolves to the server grant on a 2xx', async () => {
    vi.stubGlobal('fetch', respond(200, earned({ coins: 316 })));
    expect(await reportEarnGrant(report)).toEqual({ coins: 316, shards: 0, capped: false });
  });

  it('a refusal is a 200 with `rejected` — null, no tile (run_already_paid, session_not_won, replay_detected, rule_inactive)', async () => {
    for (const rejected of ['run_already_paid', 'session_not_won', 'replay_detected', 'rule_inactive']) {
      vi.stubGlobal('fetch', respond(200, earned({ rejected })));
      expect(await reportEarnGrant(report), rejected).toBeNull();
    }
  });

  it('ECONOMY-SESSIONS-HARDEN: a REPLAYED key is nothing new — zero on the card, zero in the HUD event, still a 2xx', async () => {
    // the eye at 46a8dc6a: the wallet chip's daily_first_session, re-sent from a fresh browser, answered "granted 100 coins"
    // with the balance unchanged — the original grant of a key already in the ledger, which a display must not show as +100
    const seen: unknown[] = [];
    vi.stubGlobal('window', { dispatchEvent: (e: CustomEvent) => { seen.push(e.detail); return true; } });
    vi.stubGlobal('CustomEvent', class { constructor(public type: string, public init: { detail: unknown }) {} get detail() { return this.init.detail; } });
    const replay = { ...earned({ coins: 100 }), replayed: true };
    vi.stubGlobal('fetch', respond(200, replay));
    expect(await reportEarnGrant({ idempotency_key: 'daily_first_session:2026-09-28:u1', event_type: 'daily_first_session', payload: { day: '2026-09-28' } })).toEqual({ coins: 0, shards: 0, capped: false });
    expect(seen).toEqual([{ granted: { coins: 0, shards: 0 }, balances, capped: false }]);
    vi.stubGlobal('fetch', respond(200, replay));
    expect(await reportEarn({ idempotency_key: 'daily_first_session:2026-09-28:u1', event_type: 'daily_first_session', payload: {} })).toBe(true);   // the chip marks the day done
    // PM note (QA acceptance #5): the server now answers an already-claimed daily with granted 0 — nothing to show either way
    seen.length = 0;
    vi.stubGlobal('fetch', respond(200, { ...earned({ coins: 0 }), replayed: true, already_claimed: true }));
    expect(await reportEarnGrant({ idempotency_key: 'daily_first_session:2026-09-28:u1', event_type: 'daily_first_session', payload: {} })).toEqual({ coins: 0, shards: 0, capped: false });
    expect(seen).toEqual([{ granted: { coins: 0, shards: 0 }, balances, capped: false }]);
    // the first, real grant still shows
    seen.length = 0;
    vi.stubGlobal('fetch', respond(200, { ...earned({ coins: 100 }), replayed: false }));
    expect(await reportEarnGrant({ idempotency_key: 'daily_first_session:2026-09-29:u1', event_type: 'daily_first_session', payload: {} })).toEqual({ coins: 100, shards: 0, capped: false });
    expect(seen).toEqual([{ granted: { coins: 100, shards: 0 }, balances, capped: false }]);
  });

  it('a cap is not a refusal: it says so, with the coins the cap left (MODE_SESSION_COMPLETED is 2 a minute)', async () => {
    vi.stubGlobal('fetch', respond(200, earned({ capped: true })));
    expect(await reportEarnGrant(report)).toEqual({ coins: 0, shards: 0, capped: true });
    vi.stubGlobal('fetch', respond(200, earned({ coins: 120, capped: true })));   // the daily cap's headroom
    expect(await reportEarnGrant(report)).toEqual({ coins: 120, shards: 0, capped: true });
  });

  it('a 2xx with no readable body is a zero grant; an error status or a network failure is null', async () => {
    vi.stubGlobal('fetch', respond(200, 'not json'));
    expect(await reportEarnGrant(report)).toEqual({ coins: 0, shards: 0, capped: false });
    vi.stubGlobal('fetch', respond(401, { error: 'unauthorized' }));
    expect(await reportEarnGrant(report)).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await reportEarnGrant(report)).toBeNull();
  });

  it('reportEarn is unchanged: true on any 2xx (a refusal too — the daily faucet marks its day on it), false otherwise', async () => {
    vi.stubGlobal('fetch', respond(200, 'not json'));
    expect(await reportEarn(report)).toBe(true);
    vi.stubGlobal('fetch', respond(200, earned({ rejected: 'run_already_paid' })));
    expect(await reportEarn(report)).toBe(true);
    vi.stubGlobal('fetch', respond(500, {}));
    expect(await reportEarn(report)).toBe(false);
  });
});

// ECONOMY-SESSIONS-HARDEN (2026-09-28) replaced the P0-02 tiles this comment used to point at
// (components/games/end-card-rewards.tsx, deleted in the qa-fixes/movement-lane merge): the wallet coin tile now
// reads the session's own payout figure, inlined in game-shell.tsx — checked below.
describe('the shell\'s wallet tiles (components/games/game-shell.tsx)', () => {
  const shell = stripComments(fs.readFileSync(path.resolve(__dirname, '../../components/games/game-shell.tsx'), 'utf8'));
  it('no tile for a refused earn or a zero grant nothing capped; a capped coin earn says so instead of "+0"', () => {
    expect(shell).toContain('if (coins > 0 || capped) setRecapCoins({ coins, capped });');
    // ECONOMY-SESSIONS-HARDEN: the figures are the session answer's (the run pays its coins), never an earn report's
    expect(shell).toContain('const capped = Boolean(j?.coinsCapped);');
    expect(shell).toContain('const coins = Number.isFinite(j?.coins) ? Number(j.coins) : 0;');
    expect(shell).toContain('{recapCoins.coins > 0 && <span');
    expect(shell).toContain("'Wallet coin limit reached for now'");
  });
});
