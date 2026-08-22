/**
 * scripts/m13-signature-tests.ts
 * ==============================
 * M13 Step 3 verification harness for the weekly seeded Signature Challenge
 * (lib/mastery/signature.ts). Proves the ported reference semantics:
 *   1. Determinism: signatureFor(mode, weekKey) is a pure function of its
 *      inputs — identical challengeKey / modifier / targetScore every call, so
 *      every athlete worldwide faces the identical challenge that week.
 *   2. Distinctness: different modes in the same week yield distinct
 *      challengeKeys, and the same mode across weeks yields distinct keys.
 *   3. Bounded target: seeded jitter keeps targetScore within ±25% of the
 *      per-mode base and always >= 1.
 *   4. isoWeekKey format is `YYYY-Www` and stable within an ISO week.
 *   5. currentSignatures() covers exactly the three hoops signature modes.
 *
 * Pure logic — no DB, no env. Run: yarn tsx scripts/m13-signature-tests.ts
 */

import assert from 'node:assert';
import {
  SIGNATURE_MODES,
  signatureFor,
  currentSignatures,
  isoWeekKey,
} from '../lib/mastery/signature';

const BASE_TARGET: Record<string, number> = {
  dunkContest: 80,
  threePoint: 60,
  hoops1v1: 21,
};

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  \u2713 ${name}`);
}

// 1. Determinism — same inputs -> identical signature
check('signatureFor is deterministic for a fixed mode+week', () => {
  const wk = '2026-W29';
  for (const mode of SIGNATURE_MODES) {
    const a = signatureFor(mode, wk);
    const b = signatureFor(mode, wk);
    assert.strictEqual(a.challengeKey, b.challengeKey, 'challengeKey stable');
    assert.strictEqual(a.modifier.key, b.modifier.key, 'modifier stable');
    assert.strictEqual(a.targetScore, b.targetScore, 'targetScore stable');
    assert.strictEqual(a.challengeKey, `${mode}:${wk}`, 'challengeKey shape');
  }
});

// 2. Distinctness — across modes and across weeks
check('distinct modes/weeks yield distinct challengeKeys', () => {
  const wk = '2026-W29';
  const keys = SIGNATURE_MODES.map((m) => signatureFor(m, wk).challengeKey);
  assert.strictEqual(new Set(keys).size, keys.length, 'per-mode keys unique');
  const wkA = signatureFor('dunkContest', '2026-W29').challengeKey;
  const wkB = signatureFor('dunkContest', '2026-W30').challengeKey;
  assert.notStrictEqual(wkA, wkB, 'same mode, different week -> different key');
});

// 3. Bounded target score — within +/-25% of base and >= 1
check('targetScore stays within +/-25% of base and >= 1', () => {
  // sample many weeks to exercise the jitter distribution
  for (let w = 1; w <= 52; w++) {
    const wk = `2026-W${String(w).padStart(2, '0')}`;
    for (const mode of SIGNATURE_MODES) {
      const sig = signatureFor(mode, wk);
      const base = BASE_TARGET[mode];
      assert.ok(sig.targetScore >= 1, `${mode} target >= 1`);
      assert.ok(
        sig.targetScore >= Math.floor(base * 0.75) &&
          sig.targetScore <= Math.ceil(base * 1.25),
        `${mode} target ${sig.targetScore} within +/-25% of ${base}`,
      );
      assert.ok(
        typeof sig.modifier?.name === 'string' && sig.modifier.name.length > 0,
        'modifier has a name',
      );
    }
  }
});

// 4. isoWeekKey format + stability within a week
check('isoWeekKey format is YYYY-Www and stable within an ISO week', () => {
  const k = isoWeekKey(new Date('2026-07-16T12:00:00Z'));
  assert.ok(/^\d{4}-W\d{2}$/.test(k), `format is YYYY-Www (got ${k})`);
  // Mon..Sun of the same ISO week map to the same key
  const mon = isoWeekKey(new Date('2026-07-13T00:00:00Z'));
  const sun = isoWeekKey(new Date('2026-07-19T23:59:59Z'));
  assert.strictEqual(mon, sun, 'all days of one ISO week share a key');
});

// 5. currentSignatures covers exactly the signature modes
check('currentSignatures covers exactly the hoops signature modes', () => {
  const sigs = currentSignatures('2026-W29');
  assert.strictEqual(sigs.length, SIGNATURE_MODES.length, 'one per mode');
  const modes = sigs.map((s) => s.mode).sort();
  assert.deepStrictEqual(modes, [...SIGNATURE_MODES].sort(), 'exact mode set');
});

console.log(`\n\u2705 m13-signature: ${passed} checks passed`);
