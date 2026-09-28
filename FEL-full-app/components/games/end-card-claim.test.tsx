// QA P0-03 (2026-09-27): every GameShell end card had REPLAY and HOME and no CLAIM. CLAIM re-sends the run's earn reports
// under the SAME idempotency keys, so the wallet answers from its ledger and pays nothing twice; it never navigates and
// never stands in REPLAY's way.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const push = vi.fn();
const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace, back: vi.fn() }) }));

import { ClaimView, EndCardClaim, claimRunRewards, sessionEarnReports, type ClaimRun } from './end-card-rewards';
import { reportEarnGrant } from '@/lib/wallet/client';
import { drive, settle } from '@/tests/helpers/driveRender';
import { stripComments } from '@/lib/testing/sourceScan';

const shell = stripComments(readFileSync(path.resolve(__dirname, 'game-shell.tsx'), 'utf8'));
const rewardsSrc = stripComments(readFileSync(path.resolve(__dirname, 'end-card-rewards.tsx'), 'utf8'));

/** The wallet route as wallet-service.earn answers it: a key it has paid returns the ORIGINAL grant and changes nothing. */
function fakeWallet() {
  const ledger = new Map<string, { coins: number; shards: number }>();
  const balances = { coins: 100, shards: 1, lc: 500 };
  let changes = 0;
  const fetch = vi.fn(async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as { idempotency_key: string; event_type: string };
    let granted = ledger.get(body.idempotency_key);
    if (!granted) {
      granted = body.event_type === 'mode_session_won' ? { coins: 0, shards: 2 } : { coins: 40, shards: 0 };
      ledger.set(body.idempotency_key, granted);
      balances.coins += granted.coins;
      balances.shards += granted.shards;
      changes += 1;
    }
    return new Response(JSON.stringify({ granted, balances: { ...balances }, capped: false, rejected: null }), { status: 200 });
  });
  return { fetch, balances, ledger, changes: () => changes };
}

const RUN: ClaimRun = { sessionId: 's1', mode: 'tiebreak', score: 0, won: false };
const WON: ClaimRun = { sessionId: 's2', mode: 'tiebreak', score: 7, won: true };

beforeEach(() => { push.mockReset(); replace.mockReset(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('the claim re-sends the run\'s own reports', () => {
  it('the keys and event types are the ones the shell sends', () => {
    expect(sessionEarnReports(RUN).map((r) => [r.idempotency_key, r.event_type])).toEqual([['sess:s1:complete', 'mode_session_completed']]);
    expect(sessionEarnReports(WON).map((r) => r.idempotency_key)).toEqual(['sess:s2:complete', 'sess:s2:won']);
    // the shell's reports, literally
    expect(shell).toContain('idempotency_key: `sess:${j.sessionId}:complete`,');
    expect(shell).toContain('idempotency_key: `sess:${j.sessionId}:won`,');
    expect(shell).toContain("payload: { mode, run_id: j.sessionId, score: res?.score ?? 0 },");
    expect(shell).toContain('setClaimRun({ sessionId: j.sessionId, mode, score: res?.score ?? 0, won: Boolean(j?.won) });');
  });

  it('two claims after the run\'s own grant are ONE wallet change, and say the balances the server returned', async () => {
    const w = fakeWallet();
    vi.stubGlobal('fetch', w.fetch);
    // the shell's report at the end of the run
    for (const r of sessionEarnReports(WON)) await reportEarnGrant(r);
    expect(w.changes()).toBe(2);                         // completed (coins) + won (shards): the run's one payment
    const after = { ...w.balances };
    const first = await claimRunRewards(WON);
    const second = await claimRunRewards(WON);
    expect(w.changes()).toBe(2);                         // nothing more
    expect(w.balances).toEqual(after);
    expect(first).toEqual(after);
    expect(second).toEqual(after);
  });

  it('a claim whose original report never landed pays it once, then never again', async () => {
    const w = fakeWallet();
    vi.stubGlobal('fetch', w.fetch);
    await claimRunRewards(RUN);
    await claimRunRewards(RUN);
    expect(w.changes()).toBe(1);
    expect(w.balances.coins).toBe(140);
  });

  it('nothing answered (offline, refused) is a failed claim, not a claimed one', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await claimRunRewards(RUN)).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ granted: { coins: 0, shards: 0 }, balances: { coins: 1, shards: 1, lc: 0 }, capped: false, rejected: 'session_not_won' }))));
    expect(await claimRunRewards(RUN)).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not json', { status: 200 })));   // no balances to show
    expect(await claimRunRewards(RUN)).toBeNull();
  });
});

describe('the CLAIM button', () => {
  it('CLAIM → CLAIMING… (disabled) → Claimed ✓ with the balances', () => {
    const idle = renderToStaticMarkup(createElement(ClaimView, { phase: 'idle', balances: null, onClaim: () => {} }));
    expect(idle).toMatch(/data-claim="idle"/);
    expect(idle).toMatch(/CLAIM<\/button>/);
    expect(idle).not.toMatch(/disabled=""/);
    const busy = renderToStaticMarkup(createElement(ClaimView, { phase: 'claiming', balances: null, onClaim: () => {} }));
    expect(busy).toMatch(/disabled=""/);
    const done = renderToStaticMarkup(createElement(ClaimView, { phase: 'claimed', balances: { coins: 140, shards: 3, lc: 0 }, onClaim: () => {} }));
    expect(done).toContain('Claimed ✓');
    expect(done).toContain('Wallet 140 coins · 3 shards');
    expect(done).toMatch(/disabled=""/);
  });

  it('a click claims once; a second click while it is out sends nothing; no navigation at all', async () => {
    const w = fakeWallet();
    vi.stubGlobal('fetch', w.fetch);
    // EndCardClaim renders <ClaimView phase onClaim>; its onClaim is what the button's onClick is
    const claim = (t: { props: unknown }) => (t.props as { onClaim: () => void }).onClaim();
    const { html, tree } = drive(() => EndCardClaim({ run: WON }), [claim]);
    expect(html).toContain('CLAIMING…');
    await settle(); await settle();
    const sent = w.fetch.mock.calls.length;
    expect(sent).toBe(2);                                // the run's two keys
    claim(tree);                                         // the second click
    await settle();
    expect(w.fetch.mock.calls.length).toBe(sent);
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    // and nothing in the claim can navigate
    expect(rewardsSrc).not.toMatch(/useRouter|router\.|location\.|<Link|href=/);
    expect(rewardsSrc).toContain('onClick={onClaim}');
  });
});

describe('in the shell: next to REPLAY, only when the run granted something, never in REPLAY\'s way', () => {
  const row = shell.slice(shell.indexOf('onClick={replay}') - 200, shell.indexOf("{storyNodeId ? 'Map' : 'Home'}"));

  it('CLAIM sits in the REPLAY row, shown when this run\'s grants are above zero', () => {
    expect(row).toContain('{claimRun && recapCoins && (recapCoins.coins > 0 || recapCoins.shards > 0) && <EndCardClaim run={claimRun} />}');
  });

  it('REPLAY stays a plain, always-enabled button, and REPLAY clears the claim for the next run', () => {
    const replayBtn = row.slice(row.indexOf('<button'), row.indexOf('REPLAY'));
    expect(replayBtn).toContain('onClick={replay}');
    expect(replayBtn).not.toMatch(/disabled/);
    const replayFn = shell.slice(shell.indexOf('const replay = () => {'), shell.indexOf('setGameKey((k) => k + 1);'));
    expect(replayFn).toContain('setClaimRun(null);');
    expect(replayFn).not.toMatch(/await|claimRunRewards/);   // REPLAY never waits on a claim
  });
});
