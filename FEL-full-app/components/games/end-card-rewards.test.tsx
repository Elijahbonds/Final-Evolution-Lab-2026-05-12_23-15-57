// QA P0-02 (2026-09-27): the end card showed "+1 SHARDS" on a zero-score DNF (Beach Sprint, Tiebreak) and the wallet chip's
// shards never moved: the tile was the PROFILE's session shards (never below 1), not what the wallet paid. The card now
// shows the wallet's grants from the earn reports' answers — built here the way the wallet route answers them.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EndCardRewards, walletGrantsFrom, type WalletGrants } from './end-card-rewards';
import { reportEarnGrant, type EarnGrant } from '@/lib/wallet/client';

const RECAP = { xp: 120, credits: 0, prqDelta: 0.1 };
const render = (walletGrants: WalletGrants | null) =>
  renderToStaticMarkup(createElement(EndCardRewards, { recap: RECAP, walletGrants }));
/** The value printed on the tile tagged data-recap=<kind>. */
const tile = (html: string, kind: string): string | null => {
  const m = html.match(new RegExp(`data-recap="${kind}"[^>]*>.*?font-bold"[^>]*>([^<]*)</div><div[^>]*>([^<]*)</div>`));
  return m ? `${m[1]} ${m[2]}` : null;
};
const grant = (coins: number, shards: number, capped = false): EarnGrant => ({ coins, shards, capped });

describe('the wallet tiles show what the wallet granted', () => {
  it('a DNF (no win): +40 coins, +0 shards', () => {
    const html = render(walletGrantsFrom([grant(40, 0)]));
    expect(tile(html, 'coins')).toBe('+40 Wallet coins');
    expect(tile(html, 'shards')).toBe('+0 Wallet shards');
  });

  it('a win: the shards are the mode_session_won grant', () => {
    const html = render(walletGrantsFrom([grant(95, 0), grant(0, 2)]));
    expect(tile(html, 'coins')).toBe('+95 Wallet coins');
    expect(tile(html, 'shards')).toBe('+2 Wallet shards');
  });

  it('a capped coin earn says the limit was reached', () => {
    const html = render(walletGrantsFrom([grant(0, 0, true)]));
    expect(tile(html, 'coins')).toBe('+0 Wallet coins · limit reached');
    expect(html).toContain('data-capped="1"');
  });

  it('a capped shard earn says so on the shards tile', () => {
    expect(tile(render(walletGrantsFrom([grant(40, 0), grant(0, 0, true)])), 'shards')).toBe('+0 Wallet shards · limit reached');
  });

  it('refused or failed reports (null) granted nothing: +0, never a guess', () => {
    const html = render(walletGrantsFrom([null, null]));
    expect(tile(html, 'coins')).toBe('+0 Wallet coins');
    expect(tile(html, 'shards')).toBe('+0 Wallet shards');
  });

  it('before the reports answer (or for dunk, which reports its own) there are no wallet tiles', () => {
    const html = render(null);
    expect(html).not.toContain('data-recap="coins"');
    expect(html).not.toContain('data-recap="shards"');
  });

  it('the profile-shard tile is gone ([DECISION-EJ]); XP, Credits and PRQ Δ stay', () => {
    const html = render(walletGrantsFrom([grant(40, 0)]));
    expect(html).not.toMatch(/>Shards</);
    expect(html).toMatch(/\+120<\/div><div[^>]*>XP</);
    expect(html).toMatch(/>Credits</);
    expect(html).toMatch(/\+0\.1<\/div><div[^>]*>PRQ Δ</);
  });
});

describe('from the wallet route\'s answer to the tile', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('the grant the server answers is the number on the card', async () => {
    const answers = [
      { granted: { coins: 40, shards: 0 }, balances: { coins: 140, shards: 3, lc: 500 }, capped: false, rejected: null },
      { granted: { coins: 0, shards: 0 }, balances: { coins: 140, shards: 3, lc: 500 }, capped: false, rejected: 'session_not_won' },
    ];
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(answers.shift()), { status: 200 })));
    const gs = await Promise.all([
      reportEarnGrant({ idempotency_key: 'sess:s1:complete', event_type: 'mode_session_completed', payload: { run_id: 's1' } }),
      reportEarnGrant({ idempotency_key: 'sess:s1:won', event_type: 'mode_session_won', payload: { run_id: 's1' } }),
    ]);
    const html = render(walletGrantsFrom(gs));
    expect(tile(html, 'coins')).toBe('+40 Wallet coins');
    expect(tile(html, 'shards')).toBe('+0 Wallet shards');
  });
});

describe('the shell renders the wallet grants, not the profile shards', () => {
  const shell = readFileSync(path.resolve(__dirname, 'game-shell.tsx'), 'utf8');
  it('the card is EndCardRewards fed by the reports, and recap.shards is printed nowhere', () => {
    expect(shell).toContain('<EndCardRewards recap={recap} walletGrants={recapCoins} />');
    expect(shell).toContain('setRecapCoins(walletGrantsFrom(gs));');
    expect(shell).not.toMatch(/recap\.shards/);
  });
});
