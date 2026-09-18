/**
 * scripts/m3-tests.ts — M3 Track C (NEXUS Studio Creator) test suite.
 *
 * DB-backed tests run inside rolled-back transactions (no real data touched);
 * pure-logic tests run directly. Run: yarn tsx scripts/m3-tests.ts
 *
 * Coverage:
 *   T1.  validateCartridgeManifest — accepts a good manifest
 *   T2.  validateCartridgeManifest — rejects bad semver / missing entry / empty files / entry-not-in-files
 *   T3.  partner key crypto — generate/hash/bearer roundtrip + unit cost table
 *   T4.  partner key storage contract — hash stored, lookup by keyHash matches (rollback tx)
 *   T5.  STUDIO_CREDIT grant -> balance (rollback tx)
 *   T6.  STUDIO_CREDIT overage spend draws credits + rejects overdraw (enforceNonNegative)
 *   T7.  resolveStudioTier — FREE / CREATOR / BYO precedence (rollback tx)
 *   T8.  getStudioUsage — distinct build count + summed metered cost (rollback tx)
 *   T9.  checkBuildAllowed — gate transitions (within included / quota / budget-no-credits / overage-ok / byo)
 *   T10. settleBuildOverage — bills only the portion beyond the included budget; idempotent
 *   T11. partner usage rollup — units summed per billing month (rollback tx)
 */

import 'dotenv/config';
import assert from 'assert';
import { PrismaClient } from '@prisma/client';
import { getBalance, type DbClient } from '../lib/ledger';
import {
  studioCreditBalance,
  ledgerStudioCreditsGrant,
  ledgerStudioOverageSpend,
} from '../lib/studio-credits';
import {
  resolveStudioTier,
  getStudioUsage,
  checkBuildAllowed,
  settleBuildOverage,
  validateCartridgeManifest,
  billingMonthKey,
} from '../lib/studio-service';
import {
  hashPartnerKey,
  generatePartnerKey,
  bearerFrom,
  unitsForScope,
} from '../lib/partner-keys';
import { PARTNER_KEY_PREFIX } from '../lib/studio-plan';

const prisma = new PrismaClient();
let passed = 0;
let failed = 0;

async function runInRollback(name: string, fn: (tx: DbClient) => Promise<void>) {
  process.stdout.write(`  ${name} ... `);
  try {
    await prisma.$transaction(async (tx) => {
      await fn(tx as DbClient);
      throw new Error('__ROLLBACK__');
    });
  } catch (err: any) {
    if (err.message === '__ROLLBACK__') {
      process.stdout.write('PASS\n');
      passed++;
      return;
    }
    process.stdout.write(`FAIL: ${err.message}\n`);
    failed++;
  }
}

async function runPure(name: string, fn: () => Promise<void> | void) {
  process.stdout.write(`  ${name} ... `);
  try {
    await fn();
    process.stdout.write('PASS\n');
    passed++;
  } catch (err: any) {
    process.stdout.write(`FAIL: ${err.message}\n`);
    failed++;
  }
}

async function mkUser(tx: DbClient, email: string) {
  return (tx as any).user.create({ data: { email, password: 'test', name: 'Test' } });
}

async function mkProject(tx: DbClient, userId: string, title = 'Proj') {
  return (tx as any).cellProject.create({ data: { userId, title } });
}

/** Seed a CellUsage row (one lane of a build) inside the tx. */
async function mkUsage(tx: DbClient, projectId: string, buildId: string, costUsd: number, at?: Date) {
  return (tx as any).cellUsage.create({
    data: { projectId, buildId, costUsd, ...(at ? { createdAt: at } : {}) },
  });
}

async function main() {
  console.log('\n=== M3 Track C (NEXUS Studio Creator) Tests ===\n');

  // ── T1: manifest accepts good input ────────────────────────────────────
  await runPure('T1 validateCartridgeManifest accepts a valid manifest', () => {
    const r = validateCartridgeManifest({
      name: 'Neon Dunk',
      version: '1.2.3',
      genre: 'arcade',
      entry: 'index.html',
      files: [{ path: 'index.html' }, { path: 'main.js', hash: 'abc' }],
      inputs: ['tap'],
    });
    assert.strictEqual(r.ok, true, `expected ok, got errors: ${r.errors.join('; ')}`);
    assert.ok(r.manifest, 'manifest present');
    assert.strictEqual(r.manifest!.version, '1.2.3');
    assert.strictEqual(r.manifest!.files.length, 2);
  });

  // ── T2: manifest rejects bad input ─────────────────────────────────────
  await runPure('T2 validateCartridgeManifest rejects invalid manifests', () => {
    const badSemver = validateCartridgeManifest({ name: 'x', version: '1.0', entry: 'a', files: [{ path: 'a' }] });
    assert.strictEqual(badSemver.ok, false, 'bad semver should fail');
    assert.ok(badSemver.errors.some((e) => e.includes('semver')), 'semver error reported');

    const noEntry = validateCartridgeManifest({ name: 'x', version: '1.0.0', files: [{ path: 'a' }] });
    assert.strictEqual(noEntry.ok, false, 'missing entry should fail');

    const noFiles = validateCartridgeManifest({ name: 'x', version: '1.0.0', entry: 'a', files: [] });
    assert.strictEqual(noFiles.ok, false, 'empty files should fail');

    const entryNotListed = validateCartridgeManifest({ name: 'x', version: '1.0.0', entry: 'missing.html', files: [{ path: 'index.html' }] });
    assert.strictEqual(entryNotListed.ok, false, 'entry not in files[] should fail');
    assert.ok(entryNotListed.errors.some((e) => e.includes('entry must reference')), 'entry-in-files error reported');

    const noName = validateCartridgeManifest({ version: '1.0.0', entry: 'a', files: [{ path: 'a' }] });
    assert.strictEqual(noName.ok, false, 'missing name should fail');
  });

  // ── T3: partner key crypto ─────────────────────────────────────────────
  await runPure('T3 partner key generate/hash/bearer roundtrip', () => {
    const { raw, hash, hint } = generatePartnerKey();
    assert.ok(raw.startsWith(PARTNER_KEY_PREFIX), 'raw key carries prefix');
    assert.strictEqual(hash, hashPartnerKey(raw), 'hash is deterministic sha256 of raw');
    assert.strictEqual(hash.length, 64, 'sha256 hex is 64 chars');
    assert.ok(!hint.includes(raw.slice(PARTNER_KEY_PREFIX.length, -4)), 'hint does not leak middle of key');
    assert.ok(hint.endsWith(raw.slice(-4)), 'hint shows last 4');

    assert.strictEqual(bearerFrom(`Bearer ${raw}`), raw, 'bearer extracted');
    assert.strictEqual(bearerFrom(`bearer ${raw}`), raw, 'bearer is case-insensitive');
    assert.strictEqual(bearerFrom(null), null, 'null header -> null');
    assert.strictEqual(bearerFrom('Token xyz'), null, 'non-bearer -> null');

    assert.strictEqual(unitsForScope('build:read'), 1);
    assert.strictEqual(unitsForScope('build:create'), 10);
    assert.strictEqual(unitsForScope('catalog:read'), 1);
    assert.strictEqual(unitsForScope('unknown:scope'), 1, 'unknown scope defaults to 1');
  });

  // ── T4: partner key storage contract ───────────────────────────────────
  await runInRollback('T4 partner key stored as hash, lookup by keyHash matches', async (tx) => {
    const user = await mkUser(tx, `t4-${Date.now()}@test.com`);
    const { raw, hash, hint } = generatePartnerKey();
    const created = await (tx as any).studioPartnerKey.create({
      data: { userId: user.id, name: 'CI key', keyHash: hash, keyHint: hint, scopes: 'build:read,catalog:read' },
    });
    assert.ok(created.id, 'key row created');
    // Presented raw token hashes to the stored value.
    const found = await (tx as any).studioPartnerKey.findUnique({ where: { keyHash: hashPartnerKey(raw) } });
    assert.ok(found, 'lookup by hashed presented key succeeds');
    assert.strictEqual(found.userId, user.id);
    assert.strictEqual(found.active, true, 'active by default');
    // The raw value is never persisted anywhere on the row.
    assert.ok(!JSON.stringify(found).includes(raw), 'raw key not stored on the record');
  });

  // ── T5: STUDIO_CREDIT grant -> balance ─────────────────────────────────
  await runInRollback('T5 STUDIO_CREDIT grant increases balance', async (tx) => {
    const user = await mkUser(tx, `t5-${Date.now()}@test.com`);
    assert.strictEqual(await studioCreditBalance(tx, user.id), 0, 'starts at 0');
    await ledgerStudioCreditsGrant(tx, { userId: user.id, credits: 2200, idempotencyKey: `grant-${user.id}` });
    assert.strictEqual(await studioCreditBalance(tx, user.id), 2200, 'balance = granted credits');
    // Isolated book: global sum for STUDIO_CREDIT is still 0 (EXTERNAL went negative).
    const ext = await getBalance(tx, { type: 'EXTERNAL', currency: 'STUDIO_CREDIT' });
    assert.strictEqual(ext, -2200, 'EXTERNAL mirrors the grant');
    // Idempotent replay = no double grant.
    await ledgerStudioCreditsGrant(tx, { userId: user.id, credits: 2200, idempotencyKey: `grant-${user.id}` });
    assert.strictEqual(await studioCreditBalance(tx, user.id), 2200, 'replay is a no-op');
  });

  // ── T6: overage spend draws credits + rejects overdraw ─────────────────
  await runInRollback('T6 STUDIO_CREDIT overage spend draws + rejects overdraw', async (tx) => {
    const user = await mkUser(tx, `t6-${Date.now()}@test.com`);
    await ledgerStudioCreditsGrant(tx, { userId: user.id, credits: 300, idempotencyKey: `g-${user.id}` });
    await ledgerStudioOverageSpend(tx, { userId: user.id, credits: 120, idempotencyKey: `s1-${user.id}` });
    assert.strictEqual(await studioCreditBalance(tx, user.id), 180, 'balance after spend');
    // Overdraw must be rejected by the non-negative guard (enforceNonNegative on
    // the user wallet). Mirrors the M1 ledger pattern: production wraps the post
    // in a transaction that aborts on this throw, so no half-write is committed.
    await assert.rejects(
      () => ledgerStudioOverageSpend(tx, { userId: user.id, credits: 999, idempotencyKey: `s2-${user.id}` }),
      (e: any) => e?.code === 'NEGATIVE_BALANCE',
      'overdraw should throw NEGATIVE_BALANCE'
    );
  });

  // ── T7: resolveStudioTier precedence ───────────────────────────────────
  await runInRollback('T7 resolveStudioTier FREE/CREATOR/BYO precedence', async (tx) => {
    const user = await mkUser(tx, `t7-${Date.now()}@test.com`);
    assert.strictEqual(await resolveStudioTier(user.id, tx), 'FREE', 'no sub, no keys -> FREE');

    await (tx as any).subscription.create({
      data: {
        userId: user.id,
        stripeSubscriptionId: `sub-${user.id}`,
        stripePriceId: 'price_studio',
        product: 'STUDIO_CREATOR',
        status: 'ACTIVE',
      },
    });
    assert.strictEqual(await resolveStudioTier(user.id, tx), 'CREATOR', 'active sub -> CREATOR');

    await (tx as any).cellApiKey.create({
      data: { userId: user.id, provider: 'openai', keyCipher: 'x', hint: '1234' },
    });
    assert.strictEqual(await resolveStudioTier(user.id, tx), 'BYO', 'own key -> BYO (highest precedence)');
  });

  // ── T8: getStudioUsage aggregation ─────────────────────────────────────
  await runInRollback('T8 getStudioUsage counts distinct builds + sums cost', async (tx) => {
    const user = await mkUser(tx, `t8-${Date.now()}@test.com`);
    const proj = await mkProject(tx, user.id);
    // build A: 2 lanes; build B: 1 lane. Total 3 rows, 2 distinct builds.
    await mkUsage(tx, proj.id, 'buildA', 0.03);
    await mkUsage(tx, proj.id, 'buildA', 0.02);
    await mkUsage(tx, proj.id, 'buildB', 0.05);
    const usage = await getStudioUsage(user.id, new Date(), tx);
    assert.strictEqual(usage.builds, 2, 'distinct build count');
    assert.strictEqual(usage.meteredUsdCents, 10, '0.10 USD -> 10 cents');
    assert.strictEqual(usage.month, billingMonthKey(), 'month key present');
  });

  // ── T9: checkBuildAllowed gate transitions ─────────────────────────────
  await runInRollback('T9 checkBuildAllowed gate transitions', async (tx) => {
    // FREE within quota -> allowed
    const free = await mkUser(tx, `t9a-${Date.now()}@test.com`);
    let gate = await checkBuildAllowed(free.id, new Date(), tx);
    assert.strictEqual(gate.tier, 'FREE');
    assert.strictEqual(gate.allowed, true, 'FREE first build allowed');
    assert.strictEqual(gate.reason, 'ok_within_included');

    // FREE quota exhausted -> blocked
    const freeProj = await mkProject(tx, free.id);
    await mkUsage(tx, freeProj.id, 'b1', 0);
    await mkUsage(tx, freeProj.id, 'b2', 0);
    await mkUsage(tx, freeProj.id, 'b3', 0);
    gate = await checkBuildAllowed(free.id, new Date(), tx);
    assert.strictEqual(gate.allowed, false, 'FREE 4th build blocked');
    assert.strictEqual(gate.reason, 'build_quota_exceeded');

    // CREATOR beyond included budget, no credits -> blocked
    const cre = await mkUser(tx, `t9b-${Date.now()}@test.com`);
    await (tx as any).subscription.create({
      data: { userId: cre.id, stripeSubscriptionId: `sub-${cre.id}`, stripePriceId: 'p', product: 'STUDIO_CREATOR', status: 'ACTIVE' },
    });
    const creProj = await mkProject(tx, cre.id);
    await mkUsage(tx, creProj.id, 'cb1', 12.5); // $12.50 > $10 included
    gate = await checkBuildAllowed(cre.id, new Date(), tx);
    assert.strictEqual(gate.tier, 'CREATOR');
    assert.strictEqual(gate.allowed, false, 'over budget with no credits blocked');
    assert.strictEqual(gate.reason, 'budget_exceeded_no_credits');

    // Same CREATOR after buying credits -> allowed via overage
    await ledgerStudioCreditsGrant(tx, { userId: cre.id, credits: 500, idempotencyKey: `g-${cre.id}` });
    gate = await checkBuildAllowed(cre.id, new Date(), tx);
    assert.strictEqual(gate.allowed, true, 'over budget with credits allowed');
    assert.strictEqual(gate.reason, 'ok_overage_credits');

    // BYO -> always allowed under abuse ceiling
    const byo = await mkUser(tx, `t9c-${Date.now()}@test.com`);
    await (tx as any).cellApiKey.create({ data: { userId: byo.id, provider: 'openai', keyCipher: 'x', hint: '1' } });
    gate = await checkBuildAllowed(byo.id, new Date(), tx);
    assert.strictEqual(gate.tier, 'BYO');
    assert.strictEqual(gate.allowed, true, 'BYO allowed');
    assert.strictEqual(gate.reason, 'ok_byo');
  });

  // ── T10: settleBuildOverage bills only beyond included ─────────────────
  await runInRollback('T10 settleBuildOverage bills only the portion beyond included budget', async (tx) => {
    const cre = await mkUser(tx, `t10-${Date.now()}@test.com`);
    await (tx as any).subscription.create({
      data: { userId: cre.id, stripeSubscriptionId: `sub-${cre.id}`, stripePriceId: 'p', product: 'STUDIO_CREATOR', status: 'ACTIVE' },
    });
    await ledgerStudioCreditsGrant(tx, { userId: cre.id, credits: 1000, idempotencyKey: `g-${cre.id}` });

    // Build entirely within included budget (prior 0, build 500c, included 1000c) -> 0 charged.
    let r = await settleBuildOverage(cre.id, { priorMeteredUsdCents: 0, buildUsdCents: 500, buildId: 'wb1' }, tx);
    assert.strictEqual(r.chargedCredits, 0, 'within included budget -> nothing charged');
    assert.strictEqual(await studioCreditBalance(tx, cre.id), 1000, 'balance unchanged');

    // Build straddling the boundary: prior 800, build 400 -> total 1200, only 200 over 1000 billable.
    r = await settleBuildOverage(cre.id, { priorMeteredUsdCents: 800, buildUsdCents: 400, buildId: 'wb2' }, tx);
    assert.strictEqual(r.chargedCredits, 200, 'only the 200c above included is billed');
    assert.strictEqual(await studioCreditBalance(tx, cre.id), 800, 'balance drawn by 200');

    // Idempotent: same buildId settled twice = no double charge.
    r = await settleBuildOverage(cre.id, { priorMeteredUsdCents: 800, buildUsdCents: 400, buildId: 'wb2' }, tx);
    assert.strictEqual(await studioCreditBalance(tx, cre.id), 800, 'replay is a no-op');

    // Fully-over build: prior 1500 (already over), build 300 -> all 300 billable.
    r = await settleBuildOverage(cre.id, { priorMeteredUsdCents: 1500, buildUsdCents: 300, buildId: 'wb3' }, tx);
    assert.strictEqual(r.chargedCredits, 300, 'fully-over build bills the whole build');
    assert.strictEqual(await studioCreditBalance(tx, cre.id), 500, 'balance drawn by 300');
  });

  // ── T11: partner usage rollup per billing month ────────────────────────
  await runInRollback('T11 partner usage rolls up units per billing month', async (tx) => {
    const user = await mkUser(tx, `t11-${Date.now()}@test.com`);
    const { hash, hint } = generatePartnerKey();
    const key = await (tx as any).studioPartnerKey.create({
      data: { userId: user.id, keyHash: hash, keyHint: hint, monthlyQuota: 1000 },
    });
    const month = billingMonthKey();
    await (tx as any).partnerUsage.createMany({
      data: [
        { partnerKeyId: key.id, endpoint: '/catalog', units: 1, status: 200, billingMonth: month },
        { partnerKeyId: key.id, endpoint: '/catalog', units: 1, status: 200, billingMonth: month },
        { partnerKeyId: key.id, endpoint: '/build', units: 10, status: 200, billingMonth: month },
        { partnerKeyId: key.id, endpoint: '/old', units: 99, status: 200, billingMonth: '2000-01' },
      ],
    });
    const agg = await (tx as any).partnerUsage.aggregate({
      where: { partnerKeyId: key.id, billingMonth: month },
      _sum: { units: true },
    });
    assert.strictEqual(agg._sum.units, 12, 'only this-month units summed (1+1+10)');
  });

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main();
