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

// QA P0-02 (2026-09-27) replaced "no tile for a zero grant": the card shows the wallet's coins AND shards for every
// reported run, "+0" when nothing was granted, so a DNF can no longer read as a profile-shard "+1". The tiles and their
// cap wording are pinned in components/games/end-card-rewards.test.tsx; here, that the shell feeds them these grants.
describe('the shell\'s wallet tiles (components/games/game-shell.tsx)', () => {
  const shell = stripComments(fs.readFileSync(path.resolve(__dirname, '../../components/games/game-shell.tsx'), 'utf8'));
  it('every answered report set lands on the card (a zero grant too), summed by walletGrantsFrom', () => {
    expect(shell).toContain('setRecapCoins(walletGrantsFrom(gs));');
    expect(shell).not.toContain('if (coins > 0 || capped) setRecapCoins');
    expect(shell).toContain('<EndCardRewards recap={recap} walletGrants={recapCoins} />');
  });
});
