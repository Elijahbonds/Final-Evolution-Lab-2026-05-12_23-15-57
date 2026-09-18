/**
 * scripts/m6-tests.ts
 * ===================
 * M6 — Studio To Spec (non-LLM slice) + game-parity tally plumbing.
 *
 * Covers:
 *   1. SessionRecorder event counting (hits/misses/dodges/chain/perfects).
 *   2. sanitizeTallies() — defaults, clamping, fractional & NaN handling.
 *   3. Compliance jurisdiction/denylist/allowlist gate.
 *
 * Pure logic — no DOM, no network, no LLM credits.
 *
 * Run:  cd nextjs_space && yarn tsx scripts/m6-tests.ts
 */

import { strict as assert } from 'node:assert';
import { SessionRecorder, sanitizeTallies } from '../lib/game-systems';
import {
  assertProviderAllowed,
  evaluateProvider,
  ComplianceError,
  PROVIDER_JURISDICTION,
  type CompliancePolicy,
} from '../lib/cell-compliance';

let pass = 0;
const t = (label: string, fn: () => void) => {
  fn();
  pass++;
  console.log(`  ✓ ${label}`);
};

console.log('\n── M6 Tests: game parity + compliance ──\n');

/* ─── SessionRecorder ─────────────────────────── */
console.log('SessionRecorder');

t('starts at zero', () => {
  const r = new SessionRecorder();
  assert.deepEqual(r.tallies(), { hits: 0, misses: 0, dodges: 0, combos: 0 });
  assert.equal(r.bestChain, 0);
  assert.equal(r.perfects, 0);
});

t('recordHit increments hits; perfect flag tracked separately', () => {
  const r = new SessionRecorder();
  r.recordHit();
  r.recordHit(true);
  r.recordHit(true);
  assert.equal(r.hits, 3);
  assert.equal(r.perfects, 2);
});

t('recordMiss and recordDodge increment independently', () => {
  const r = new SessionRecorder();
  r.recordMiss();
  r.recordMiss();
  r.recordDodge();
  assert.equal(r.misses, 2);
  assert.equal(r.dodges, 1);
});

t('recordChain keeps the maximum chain seen', () => {
  const r = new SessionRecorder();
  r.recordChain(3);
  r.recordChain(7);
  r.recordChain(2);
  assert.equal(r.bestChain, 7);
});

t('tallies() reflects a realistic mixed session', () => {
  const r = new SessionRecorder();
  // 5 hits (2 perfect), 2 misses, 1 dodge, best chain 4
  r.recordHit(true); r.recordChain(1);
  r.recordHit();     r.recordChain(2);
  r.recordHit(true); r.recordChain(3);
  r.recordHit();     r.recordChain(4);
  r.recordMiss();
  r.recordHit();
  r.recordDodge();
  r.recordMiss();
  assert.deepEqual(r.tallies(), { hits: 5, misses: 2, dodges: 1, combos: 0 });
  assert.equal(r.bestChain, 4);
  assert.equal(r.perfects, 2);
});

t('reset() zeroes every field', () => {
  const r = new SessionRecorder();
  r.recordHit(true); r.recordMiss(); r.recordDodge(); r.recordChain(9); r.addScore(50);
  r.reset();
  assert.deepEqual(r.tallies(), { hits: 0, misses: 0, dodges: 0, combos: 0 });
  assert.equal(r.bestChain, 0);
  assert.equal(r.perfects, 0);
  assert.equal(r.totalScore, 0);
});

/* ─── sanitizeTallies (sessions route) ───────────── */
console.log('\nsanitizeTallies');

t('empty/legacy body defaults everything to 0', () => {
  assert.deepEqual(sanitizeTallies({}), { hits: 0, misses: 0, dodges: 0, combos: 0, maxCombo: 0 });
  assert.deepEqual(sanitizeTallies(undefined), { hits: 0, misses: 0, dodges: 0, combos: 0, maxCombo: 0 });
});

t('reads well-formed tallies + maxCombo', () => {
  const out = sanitizeTallies({ tallies: { hits: 10, misses: 3, dodges: 2, combos: 0 }, maxCombo: 8 });
  assert.deepEqual(out, { hits: 10, misses: 3, dodges: 2, combos: 0, maxCombo: 8 });
});

t('clamps negatives to 0', () => {
  const out = sanitizeTallies({ tallies: { hits: -5, misses: -1, dodges: -9, combos: -2 }, maxCombo: -7 });
  assert.deepEqual(out, { hits: 0, misses: 0, dodges: 0, combos: 0, maxCombo: 0 });
});

t('floors fractional values', () => {
  const out = sanitizeTallies({ tallies: { hits: 4.9, misses: 2.1, dodges: 0.7, combos: 3.5 }, maxCombo: 6.99 });
  assert.deepEqual(out, { hits: 4, misses: 2, dodges: 0, combos: 3, maxCombo: 6 });
});

t('NaN / non-numeric collapses to 0', () => {
  const out = sanitizeTallies({ tallies: { hits: 'abc', misses: null, dodges: NaN, combos: undefined }, maxCombo: 'x' });
  assert.deepEqual(out, { hits: 0, misses: 0, dodges: 0, combos: 0, maxCombo: 0 });
});

t('partial tallies fill missing keys with 0', () => {
  const out = sanitizeTallies({ tallies: { hits: 7 } });
  assert.deepEqual(out, { hits: 7, misses: 0, dodges: 0, combos: 0, maxCombo: 0 });
});

/* ─── Compliance gate ──────────────────────── */
console.log('\nCompliance gate');

t('no policy allows every provider', () => {
  for (const p of ['abacus', 'openai', 'anthropic', 'google'] as const) {
    assert.doesNotThrow(() => assertProviderAllowed(p));
    assert.equal(evaluateProvider(p).allowed, true);
  }
});

t('all shipped providers map to a known jurisdiction', () => {
  for (const p of ['abacus', 'openai', 'anthropic', 'google'] as const) {
    assert.ok(['US', 'EU', 'OTHER'].includes(PROVIDER_JURISDICTION[p]));
  }
});

t('US-only residency policy allows all current providers', () => {
  const policy: CompliancePolicy = { allowedJurisdictions: ['US'] };
  for (const p of ['abacus', 'openai', 'anthropic', 'google'] as const) {
    assert.doesNotThrow(() => assertProviderAllowed(p, policy));
  }
});

t('EU-only residency policy blocks US providers', () => {
  const policy: CompliancePolicy = { allowedJurisdictions: ['EU'] };
  const d = evaluateProvider('openai', policy);
  assert.equal(d.allowed, false);
  assert.match(d.reason, /jurisdiction/);
  assert.throws(() => assertProviderAllowed('openai', policy), ComplianceError);
});

t('denylist blocks a named provider even if jurisdiction is allowed', () => {
  const policy: CompliancePolicy = { deniedProviders: ['openai'] };
  assert.throws(() => assertProviderAllowed('openai', policy), ComplianceError);
  assert.doesNotThrow(() => assertProviderAllowed('anthropic', policy));
});

t('allowlist permits only listed providers', () => {
  const policy: CompliancePolicy = { allowedProviders: ['abacus'] };
  assert.doesNotThrow(() => assertProviderAllowed('abacus', policy));
  assert.throws(() => assertProviderAllowed('openai', policy), ComplianceError);
  assert.equal(evaluateProvider('google', policy).reason, 'provider not on allowlist');
});

t('denylist takes precedence over an allowlist that includes the provider', () => {
  const policy: CompliancePolicy = { allowedProviders: ['openai'], deniedProviders: ['openai'] };
  assert.throws(() => assertProviderAllowed('openai', policy), ComplianceError);
});

t('ComplianceError carries provider + reason', () => {
  try {
    assertProviderAllowed('openai', { allowedJurisdictions: ['EU'] });
    assert.fail('expected throw');
  } catch (e) {
    assert.ok(e instanceof ComplianceError);
    assert.equal((e as ComplianceError).provider, 'openai');
    assert.ok((e as ComplianceError).reason.length > 0);
  }
});

t('empty policy object (no fields) allows all', () => {
  const policy: CompliancePolicy = {};
  for (const p of ['abacus', 'openai', 'anthropic', 'google'] as const) {
    assert.doesNotThrow(() => assertProviderAllowed(p, policy));
  }
});

console.log(`\n✅ M6: ${pass} assertions passed\n`);
