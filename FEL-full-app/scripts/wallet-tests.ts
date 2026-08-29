/**
 * scripts/wallet-tests.ts — server-authoritative wallet (coins/shards) acceptance.
 *
 * Harness: `yarn tsx scripts/wallet-tests.ts` + node:assert (no jest/vitest).
 * Exits non-zero on any failure. Uses a throwaway user, cleaned up in finally
 * (User cascade removes Wallet / WalletLedgerEntry / PerfEarnEvent /
 * PlayerEntitlement). Global RewardRule rows are never mutated.
 *
 * Proves the spec §9 acceptance cases:
 *   1. Replayed idempotency_key grants EXACTLY once (returns original).
 *   2. Concurrent spend can NEVER drive a balance negative.
 *   3. Client-submitted amounts are ignored — server computes worth from rules.
 *   4. Purchases: coin packs mint coins; shard packs mint shards (M25), each idempotent.
 *   5. A hit rate cap returns capped:true, NOT a hard error.
 * Plus PURE checks (grant math, chain validation, ledger==balance).
 */
import 'dotenv/config';
import assert from 'node:assert';
import { PrismaClient } from '@prisma/client';

import {
  REASON, EVENT_REASON, SHARD_REASONS, DEFAULT_REWARD_RULES, computeGrant,
} from '../lib/wallet/reward-rules';
import {
  validateChain, chainScoreCeiling, validateDunkAttempt, payloadHash,
} from '../lib/wallet/validation';
import { CATALOG, COIN_PACKS, coinPackForPrice, getSku, COIN_STORE_PACKS, getCoinStorePack, coinStorePackTotal } from '../lib/wallet/catalog';
import {
  earn, spend, grantCoinPurchase, grantShardPurchase, refundCoins, readWallet, derivedBalances, resolveRule, WalletError,
} from '../lib/wallet/wallet-service';
import { FREE_USE_QUESTIONS, freeUseIsClean } from '../lib/wallet/sceneit-freeuse';
import { REASON_LABELS, reasonLabel } from '../lib/wallet/reason-labels';
import { generateReferralCode, isValidReferralCode } from '../lib/marketing/referral-core';
import { generateMatchCode, isValidMatchCode, resolveOutcome, winnerIdFor, isValidMpMode, mpModeLabel, MP_MODES } from '../lib/mp/match-core';
import { computeFunnelCounts, isValidEmail, normalizeEmail, FUNNEL_ORDER } from '../lib/marketing/funnel';
import { deriveRarity, isValidRarity, slugify, isValidSlug, slugCandidate, safeAccent, isValidAccent, rarityLabel, CARD_RARITIES } from '../lib/creator/card-core';
import { WALLET_EARN_EVENT } from '../lib/wallet/client';

const prisma = new PrismaClient();
let passed = 0;
function check(name: string, fn: () => void) { fn(); passed++; console.log(`  \u2713 ${name}`); }
async function checkAsync(name: string, fn: () => Promise<void>) { await fn(); passed++; console.log(`  \u2713 ${name}`); }

// A legal, valid dunk attempt payload (varies score so payload hash differs).
function attempt(score: number) {
  return { run_id: `r_${score}_${Math.random()}`, score, trick_chain: ['takeoff_a', 'spin_360', 'finish_windmill'], duration_ms: 1500, client_ts: Date.now() };
}

// ---------------------------------------------------------------------------
function pureTests() {
  console.log('\nPURE LOGIC');

  check('every EVENT_REASON maps to a known REASON', () => {
    for (const r of Object.values(EVENT_REASON)) assert.ok(Object.values(REASON).includes(r as any), `bad ${r}`);
  });

  check('validateChain enforces takeoff-first / finish-last / 2..5 length', () => {
    assert.equal(validateChain(['takeoff_a', 'finish_dunk']).legal, true);
    assert.equal(validateChain(['takeoff_a', 'spin_360', 'finish_360']).legal, true);
    assert.equal(validateChain(['spin_360', 'finish_dunk']).legal, false); // no takeoff
    assert.equal(validateChain(['takeoff_a', 'spin_360']).legal, false);    // no finish
    assert.equal(validateChain(['takeoff_a']).legal, false);                // too short
    assert.equal(validateChain(['takeoff_a', 'takeoff_b', 'spin_360', 'reverse', 'double_clutch', 'finish_dunk']).legal, false); // too long
    assert.equal(validateChain(['takeoff_a', 'nope', 'finish_dunk']).legal, false); // unknown mid
  });

  check('chainScoreCeiling grows with mids', () => {
    assert.equal(chainScoreCeiling(['takeoff_a', 'finish_dunk']), 120);
    assert.equal(chainScoreCeiling(['takeoff_a', 'spin_360', 'finish_dunk']), 160);
  });

  check('validateDunkAttempt rejects out-of-range duration and over-ceiling score', () => {
    assert.equal(validateDunkAttempt(attempt(50)).ok, true);
    assert.equal(validateDunkAttempt({ ...attempt(50), duration_ms: 10 }).ok, false);
    assert.equal(validateDunkAttempt({ ...attempt(999999) }).ok, false); // above ceiling
  });

  check('payloadHash is key-order independent', () => {
    assert.equal(payloadHash({ a: 1, b: 2 }), payloadHash({ b: 2, a: 1 }));
    assert.notEqual(payloadHash({ a: 1 }), payloadHash({ a: 2 }));
  });

  check('computeGrant: scoreLinear clamps to [min,max]; flat is constant', () => {
    const attemptRule = DEFAULT_REWARD_RULES[REASON.DUNK_ATTEMPT_SCORED];
    assert.equal(computeGrant(attemptRule, { score: 0 }), attemptRule.minGrant);
    assert.equal(computeGrant(attemptRule, { score: 100000 }), attemptRule.maxGrant);
    const routine = DEFAULT_REWARD_RULES[REASON.DUNK_ROUTINE_COMPLETED];
    assert.equal(computeGrant(routine, { score: 99 }), routine.baseAmount);
  });

  // Spec §4 (case 4, pure half): the SPEND catalog + legacy price-mapped COIN_PACKS
  // are coins-only (shard catalog SKUs are SPEND-only). The real-money SHARD_PACKS
  // (M25) are a separate family, exercised in the async purchase case below.
  check('legacy coin packs mint coins; catalog shard SKUs are spend-only', () => {
    for (const pack of Object.values(COIN_PACKS)) assert.ok(pack.coins > 0, 'pack must grant coins');
    assert.equal(coinPackForPrice('price_that_does_not_exist'), null);
    const shardSkus = Object.values(CATALOG).filter((s) => s.currency === 'shards');
    assert.ok(shardSkus.length > 0, 'a shard spend sku should exist to prove spend works');
  });

  check('SHARD_REASONS never overlap the coin reasons', () => {
    assert.ok(SHARD_REASONS.has(REASON.DUNK_CONTEST_PLACED));
    assert.ok(!SHARD_REASONS.has(REASON.DUNK_ATTEMPT_SCORED));
    assert.ok(!SHARD_REASONS.has(REASON.PURCHASE_COIN_PACK));
  });

  // ---- Phase 2: multi-mode earn + Scene It free-use -----------------------
  check('Phase-2 event_types are wired to reasons', () => {
    assert.equal(EVENT_REASON['mode_session_completed'], REASON.MODE_SESSION_COMPLETED);
    assert.equal(EVENT_REASON['mode_session_won'], REASON.MODE_SESSION_WON);
    assert.equal(EVENT_REASON['sceneit_freeuse_identified'], REASON.SCENEIT_FREEUSE_IDENTIFIED);
  });

  check('mode win + scene-it free-use pay in shards; mode completion pays coins', () => {
    assert.ok(SHARD_REASONS.has(REASON.MODE_SESSION_WON));
    assert.ok(SHARD_REASONS.has(REASON.SCENEIT_FREEUSE_IDENTIFIED));
    assert.ok(!SHARD_REASONS.has(REASON.MODE_SESSION_COMPLETED)); // coins
  });

  check('every Phase-2 reason has a default reward rule', () => {
    for (const r of [REASON.MODE_SESSION_COMPLETED, REASON.MODE_SESSION_WON, REASON.SCENEIT_FREEUSE_IDENTIFIED]) {
      assert.ok(DEFAULT_REWARD_RULES[r], `missing rule for ${r}`);
    }
  });

  check('Scene It free-use questions are legally clean public-domain picks', () => {
    assert.ok(FREE_USE_QUESTIONS.length >= 3, 'need enough free-use legends to fill reserved slots');
    for (const q of FREE_USE_QUESTIONS) {
      assert.ok(q.note && q.note.length > 0, `${q.answer} must carry a public-domain note`);
    }
    // freeUseIsClean must accept a franchise-IP ban list (no PD pick collides).
    assert.equal(freeUseIsClean(['marvel', 'disney', 'pokemon', 'star wars']), true);
  });

  check('HUD earn-event contract is stable (reward toast + refresh bus)', () => {
    assert.equal(WALLET_EARN_EVENT, 'fel:wallet-earn');
  });

  check('coin store packs are coins-only, positively priced, unique ids', () => {
    assert.ok(COIN_STORE_PACKS.length >= 3);
    const ids = new Set<string>();
    for (const p of COIN_STORE_PACKS) {
      assert.ok(p.priceUsdCents > 0, `${p.id} must have a positive USD price`);
      assert.ok(p.coins > 0, `${p.id} must grant coins`);
      assert.ok(p.bonus >= 0, `${p.id} bonus must be >= 0`);
      assert.equal(coinStorePackTotal(p), p.coins + p.bonus);
      assert.ok(!ids.has(p.id), `${p.id} duplicated`);
      ids.add(p.id);
    }
    // Store never sells shards — there is no currency field to opt out of.
    assert.ok(!('currency' in (COIN_STORE_PACKS[0] as any)) || (COIN_STORE_PACKS[0] as any).currency === 'coins');
  });

  check('getCoinStorePack resolves known ids and rejects unknown', () => {
    assert.equal(getCoinStorePack('coins_pro')?.id, 'coins_pro');
    assert.equal(getCoinStorePack('nope'), null);
    assert.equal(getCoinStorePack(undefined), null);
  });

  check('every REASON code has a human-readable ledger label', () => {
    for (const code of Object.values(REASON)) {
      assert.ok(REASON_LABELS[code as string], `missing label for ${code}`);
    }
    // Unknown codes degrade gracefully rather than throwing.
    assert.ok(reasonLabel('SOME_FUTURE_CODE').label.length > 0);
  });

  check('referral codes are well-formed, unambiguous, and deterministic under a seed', () => {
    // No ambiguous chars (0/O/1/I) ever appear.
    for (let i = 0; i < 200; i++) {
      const code = generateReferralCode();
      assert.ok(isValidReferralCode(code), `generated code ${code} should validate`);
      assert.ok(!/[01OI]/.test(code), `code ${code} must avoid ambiguous chars`);
    }
    // Deterministic for a fixed RNG (single source of truth for host+tests).
    let x = 0.123456;
    const rnd = () => (x = (x * 9301 + 49297) % 233280 / 233280);
    const a = generateReferralCode(7, rnd);
    x = 0.123456;
    const rnd2 = () => (x = (x * 9301 + 49297) % 233280 / 233280);
    const b = generateReferralCode(7, rnd2);
    assert.equal(a, b, 'same seed -> same code');
    assert.ok(!isValidReferralCode('abc'), 'too short / lowercase rejected');
    assert.ok(!isValidReferralCode('AB0CD'), 'ambiguous 0 rejected');
  });

  check('marketing funnel counts, conversion rate, and email normalization are correct', () => {
    assert.ok(isValidEmail('a@b.co'));
    assert.ok(!isValidEmail('nope'));
    assert.equal(normalizeEmail('  A@B.CO '), 'a@b.co');
    const rows = [
      { stage: 'lead' as const }, { stage: 'lead' as const },
      { stage: 'welcomed' as const }, { stage: 'converted' as const },
    ];
    const c = computeFunnelCounts(rows);
    assert.equal(c.total, 4);
    assert.equal(c.byStage.lead, 2);
    assert.equal(c.byStage.converted, 1);
    assert.equal(c.conversionRate, 0.25);
    // Every stage present in the order map so the admin view never NaNs.
    for (const s of FUNNEL_ORDER) assert.ok(typeof c.byStage[s] === 'number');
  });

  check('multiplayer outcome resolution is deterministic and fair', () => {
    assert.equal(resolveOutcome(10, 5), 'host');
    assert.equal(resolveOutcome(5, 10), 'guest');
    assert.equal(resolveOutcome(7, 7), 'tie');
    // Non-finite scores are treated as 0 (never crash the settle path).
    assert.equal(resolveOutcome(NaN, 3), 'guest');
    assert.equal(resolveOutcome(3, Infinity), 'host'); // Infinity coerced to 0
    assert.equal(winnerIdFor('host', 'H', 'G'), 'H');
    assert.equal(winnerIdFor('guest', 'H', 'G'), 'G');
    assert.equal(winnerIdFor('tie', 'H', 'G'), null);
  });

  check('match codes are well-formed, unambiguous, and mode registry is valid', () => {
    let seed = 987654321;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let i = 0; i < 200; i++) {
      const code = generateMatchCode(6, rnd);
      assert.ok(isValidMatchCode(code), `bad code ${code}`);
      assert.ok(!/[01OI]/.test(code), `ambiguous chars in ${code}`);
    }
    assert.ok(!isValidMatchCode('AB'));       // too short
    assert.ok(!isValidMatchCode('abc123'));   // lowercase not allowed
    // MP mode registry is internally consistent.
    assert.ok(MP_MODES.length > 0);
    for (const m of MP_MODES) {
      assert.ok(isValidMpMode(m.key), `mode ${m.key} should be valid`);
      assert.equal(mpModeLabel(m.key), m.label);
    }
    assert.ok(!isValidMpMode('not_a_mode'));
  });

  check('creator-card rarity is earned monotonically and never chosen', () => {
    // Higher measured achievement never yields a lower rarity.
    const order = (r: string) => CARD_RARITIES.indexOf(r as any);
    const low = deriveRarity({ prq: 0, wins: 0, topScore: 0 });
    const mid = deriveRarity({ prq: 40, wins: 3, topScore: 100 });
    const high = deriveRarity({ prq: 88, wins: 20, topScore: 500 });
    assert.equal(low, 'common');
    assert.ok(order(mid) >= order(low));
    assert.ok(order(high) >= order(mid));
    assert.equal(high, 'legendary');
    // Non-finite inputs degrade to common, never crash.
    assert.equal(deriveRarity({ prq: NaN, wins: Infinity, topScore: NaN }), 'common');
    for (const r of CARD_RARITIES) { assert.ok(isValidRarity(r)); assert.ok(typeof rarityLabel(r) === 'string'); }
    assert.ok(!isValidRarity('mythic'));
  });

  check('creator-card slug + accent helpers are URL-safe and defensive', () => {
    assert.equal(slugify('Elijah "The Nexus" Bonds!!'), 'elijah-the-nexus-bonds');
    assert.ok(isValidSlug('elijah-bonds'));
    assert.ok(!isValidSlug('-bad'));
    assert.ok(!isValidSlug('a'));
    const withSuffix = slugCandidate('Elijah Bonds', 'x1y2');
    assert.ok(withSuffix.endsWith('-x1y2'));
    assert.ok(isValidSlug(withSuffix));
    // Accent validation + safe fallback to FEL cyan.
    assert.ok(isValidAccent('#00E5FF'));
    assert.ok(!isValidAccent('red'));
    assert.equal(safeAccent('bogus'), '#00E5FF');
    assert.equal(safeAccent('#FF3366'), '#FF3366');
  });
}

// ---------------------------------------------------------------------------
async function dbTests() {
  console.log('\nDB INTEGRATION');
  const stamp = Date.now();
  const user = await prisma.user.create({
    data: { email: `__wallettest_${stamp}@fel.test`, name: 'Wallet Test', password: 'x' },
    select: { id: true },
  });
  const playerId = user.id;

  try {
    // CASE 1 — replayed idempotency_key grants exactly once.
    await checkAsync('replayed idempotency_key grants EXACTLY once', async () => {
      const key = `earn_once_${stamp}`;
      const p = attempt(40);
      const first = await earn(prisma, { playerId, idempotencyKey: key, eventType: 'dunk_attempt_scored', payload: p });
      assert.ok(first.granted.coins > 0, 'first grant should be positive');
      const second = await earn(prisma, { playerId, idempotencyKey: key, eventType: 'dunk_attempt_scored', payload: p });
      assert.equal(second.entry_id, first.entry_id, 'replay returns original entry');
      assert.equal(second.granted.coins, first.granted.coins, 'replay returns original grant');
      const rows = await prisma.walletLedgerEntry.count({ where: { idempotencyKey: key } });
      assert.equal(rows, 1, 'exactly one ledger row for the key');
    });

    // CASE 3 — client-submitted amounts are ignored.
    await checkAsync('client-submitted amount/currency fields are ignored', async () => {
      const rule = (await resolveRule(prisma, REASON.DUNK_ATTEMPT_SCORED))!;
      const expected = computeGrant(rule, { score: 30 });
      const res = await earn(prisma, {
        playerId, idempotencyKey: `ignore_${stamp}`, eventType: 'dunk_attempt_scored',
        // Malicious client fields — must be ignored by the server.
        payload: { ...attempt(30), coins: 999999, shards: 999999, amount: 999999, currency: 'shards' },
      });
      assert.equal(res.granted.coins, expected, 'grant uses rule math, not client amount');
      assert.equal(res.granted.shards, 0, 'no shards from a coin reason regardless of client input');
    });

    // CASE 5 — hitting a rate cap returns capped:true, not an error.
    await checkAsync('per-minute rate cap returns capped:true (not an error)', async () => {
      const rule = (await resolveRule(prisma, REASON.DUNK_ROUTINE_COMPLETED))!;
      const cap = rule.perMinuteCap; // 6 by default
      assert.ok(cap > 0, 'routine has a per-minute cap to exercise');
      let sawCap = false;
      for (let i = 0; i < cap + 2; i++) {
        const r = await earn(prisma, {
          playerId, idempotencyKey: `cap_${stamp}_${i}`, eventType: 'dunk_routine_completed',
          payload: { run_id: `run_${i}`, score: 10 + i, nonce: i },
        });
        if (r.capped) { sawCap = true; assert.equal(r.granted.coins, 0, 'capped grant is zero'); }
      }
      assert.ok(sawCap, 'cap must trigger within cap+2 attempts');
    });

    // CASE 2 — concurrent spend can never go negative.
    await checkAsync('concurrent spend cannot drive balance negative', async () => {
      // Dedicated user so the starting balance is DETERMINISTIC (100 coins),
      // independent of coins accumulated by earlier cases on the main user.
      const cu = await prisma.user.create({
        data: { email: `__walletcc_${stamp}@fel.test`, name: 'Wallet CC', password: 'x' },
        select: { id: true },
      });
      try {
        await grantCoinPurchase(prisma, { playerId: cu.id, coins: 100, idempotencyKey: `fund_${stamp}` });
        const sku = getSku('dunk_retry_token')!; // 50 coins each
        const n = 3; // 3 * 50 = 150 > 100 → exactly 2 can succeed
        const results = await Promise.allSettled(
          Array.from({ length: n }, (_, i) =>
            spend(prisma, { playerId: cu.id, idempotencyKey: `spend_${stamp}_${i}`, skuId: sku.skuId, quantity: 1 })),
        );
        const ok = results.filter((r) => r.status === 'fulfilled').length;
        const fail = results.filter((r) => r.status === 'rejected').length;
        assert.equal(ok, 2, 'exactly two spends succeed');
        assert.equal(fail, 1, 'exactly one spend fails');
        for (const r of results) {
          if (r.status === 'rejected') assert.ok(r.reason instanceof WalletError && r.reason.code === 'INSUFFICIENT_FUNDS');
        }
        const bal = await readWallet(prisma, cu.id);
        assert.ok(bal.coins >= 0, 'balance never negative');
        assert.equal(bal.coins, 0, 'balance is exactly zero after two 50-coin spends');
      } finally {
        await prisma.user.delete({ where: { id: cu.id } }).catch(() => {});
      }
    });

    // CASE 4a — coin purchase mints coins only; grantCoinPurchase refuses a
    // non-positive coin grant.
    await checkAsync('coin purchase mints coins exactly once (idempotent)', async () => {
      const before = await readWallet(prisma, playerId);
      const res = await grantCoinPurchase(prisma, { playerId, coins: 500, idempotencyKey: `buy_${stamp}` });
      assert.equal(res.balances.coins, before.coins + 500);
      assert.equal(res.balances.shards, before.shards, 'shards unchanged by a coin purchase');
      // replay must NOT double-credit.
      const replay = await grantCoinPurchase(prisma, { playerId, coins: 500, idempotencyKey: `buy_${stamp}` });
      assert.equal(replay.balances.coins, res.balances.coins, 'replayed coin purchase does not double-credit');
      await assert.rejects(
        () => grantCoinPurchase(prisma, { playerId, coins: 0, idempotencyKey: `buy0_${stamp}` }),
        (e: any) => e instanceof WalletError && e.code === 'SHARD_PURCHASE_FORBIDDEN',
      );
    });

    // CASE 4b (M25) — real-money SHARD pack mints shards, idempotent, and
    // refuses a non-positive amount.
    await checkAsync('shard pack purchase mints shards exactly once (idempotent)', async () => {
      const before = await readWallet(prisma, playerId);
      const res = await grantShardPurchase(prisma, { playerId, shards: 1200, idempotencyKey: `shbuy_${stamp}` });
      assert.equal(res.balances.shards, before.shards + 1200, 'shard pack credits shards');
      assert.equal(res.balances.coins, before.coins, 'coins unchanged by a shard purchase');
      const replay = await grantShardPurchase(prisma, { playerId, shards: 1200, idempotencyKey: `shbuy_${stamp}` });
      assert.equal(replay.balances.shards, res.balances.shards, 'replayed shard purchase does not double-credit');
      await assert.rejects(
        () => grantShardPurchase(prisma, { playerId, shards: 0, idempotencyKey: `shbuy0_${stamp}` }),
        (e: any) => e instanceof WalletError && e.code === 'INVALID_AMOUNT',
      );
    });

    // LEDGER INVARIANT — balance is reconstructable from the ledger alone.
    await checkAsync('wallet balance equals the sum of its ledger deltas', async () => {
      const view = await readWallet(prisma, playerId);
      const derived = await derivedBalances(prisma, playerId);
      assert.equal(view.coins, derived.coins, 'coins == ledger sum');
      assert.equal(view.shards, derived.shards, 'shards == ledger sum');
    });

    // Shard earn works (milestone) and refund clamps at zero.
    await checkAsync('shard milestone earn credits shards; refund clamps at zero', async () => {
      const r = await earn(prisma, { playerId, idempotencyKey: `shard_${stamp}`, eventType: 'dunk_contest_placed', payload: { run_id: 'x', placement: 1 } });
      assert.ok(r.granted.shards > 0, 'contest placed grants shards');
      const before = await readWallet(prisma, playerId);
      await refundCoins(prisma, { playerId, coins: before.coins + 100000, idempotencyKey: `refund_${stamp}` });
      const after = await readWallet(prisma, playerId);
      assert.ok(after.coins >= 0, 'coins floored at zero, never negative');
    });
  } finally {
    await prisma.user.delete({ where: { id: playerId } }).catch(() => {});
  }
}

async function main() {
  console.log('FEL Wallet (coins/shards) \u2014 acceptance tests');
  pureTests();
  await dbTests();
  console.log(`\nALL ${passed} CHECKS PASSED`);
}

main()
  .catch((e) => { console.error('\nWALLET TESTS FAILED:\n', e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
