#!/usr/bin/env -S npx tsx
/**
 * scripts/competition-bridge-tests.ts — Mode 3 Phase 19 proof.
 *   A. Submission posts the earned score to the server endpoint (mocked
 *      fetch) and NEVER computes a reward locally.
 *   B. Server refusal and offline both degrade without granting anything.
 *
 * Run: npx tsx scripts/competition-bridge-tests.ts
 */
import assert from 'node:assert';
import { submitRunScore, type RunResult } from '../lib/babylon/core/CompetitionBridge';

let pass = 0;
const ok = (n: string, fn: () => void | Promise<void>) => Promise.resolve(fn()).then(() => { pass++; console.log(`  ✓ ${n}`); });
const R: RunResult = { mode: 'skateboard', score: 4200, bestCombo: 6 };

async function main() {
  console.log('\nA. server-authoritative submission');
  await ok('posts score + meta; response drives the outcome', async () => {
    let body: any = null;
    (globalThis as any).fetch = async (url: string, init: any) => {
      assert.ok(url.includes('/api/competition/submit-score'));
      body = JSON.parse(init.body);
      return { ok: true, status: 200 };
    };
    const r = await submitRunScore('m1', R);
    assert.ok(r.ok);
    assert.equal(body.score, 4200);
    assert.equal(body.meta.bestCombo, 6);
    assert.ok(!('reward' in body) && !('coins' in body), 'client sends NO reward fields');
  });

  console.log('\nB. honest degradation');
  await ok('server refusal and offline grant nothing', async () => {
    (globalThis as any).fetch = async () => ({ ok: false, status: 403 });
    assert.ok(!(await submitRunScore('m1', R)).ok);
    (globalThis as any).fetch = async () => { throw new Error('offline'); };
    const r = await submitRunScore('m1', R);
    assert.ok(!r.ok && /offline/.test(r.reason!));
  });

  console.log(`\n${pass} checks green`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
