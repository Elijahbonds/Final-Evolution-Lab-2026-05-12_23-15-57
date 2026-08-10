/**
 * scripts/challenge-link-core-tests.ts
 * ====================================
 * M13 Step 4 verification harness for the Challenge-link K-factor engine
 * (lib/social/challenge-link-core.ts). Proves the ported reference semantics:
 *   1. mint requires mode + score, produces a /c/<payload> path.
 *   2. encode -> decode round-trips a payload losslessly.
 *   3. Ghost key-moments are hard-capped at 40 (links stay tiny).
 *   4. athleteTag is truncated to 16 chars (no PII bloat).
 *   5. resolve: beating the score wins + offers a rematch + flags signup.
 *   6. resolve: losing does not offer signup but still offers rematch.
 *   7. Determinism: identical mint input -> identical encoded path.
 *
 * Run: yarn tsx scripts/challenge-link-core-tests.ts
 */

import assert from 'node:assert';
import { ChallengeLinkCore, type ChallengePayload } from '../lib/social/challenge-link-core';

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  \u2713 ${name}`);
}

// 1. mint requires mode+score
check('mint requires mode + score, yields /c/ path', () => {
  const { payload, path } = ChallengeLinkCore.mint({ modeKey: 'dunkContest', score: 46, display: '46-card Windmill' });
  assert.strictEqual(payload.modeKey, 'dunkContest');
  assert.strictEqual(payload.score, 46);
  assert.ok(path.startsWith('/c/'), 'path is /c/<payload>');
  assert.throws(() => ChallengeLinkCore.mint({ modeKey: '', score: 1 }), /mode\+score/);
  assert.throws(() => ChallengeLinkCore.mint({ modeKey: 'x', score: null as any }), /mode\+score/);
});

// 2. round-trip
check('encode -> decode round-trips losslessly', () => {
  const { payload } = ChallengeLinkCore.mint({
    modeKey: 'threePoint',
    score: 21,
    display: 'Green Machine',
    keyMoments: [{ t: 1, x: 3 }, { t: 2, x: 5 }],
    athleteTag: 'VENICEKID',
  });
  const enc = ChallengeLinkCore.encode(payload);
  const dec = ChallengeLinkCore.decode(enc);
  assert.deepStrictEqual(dec, payload, 'decoded matches original');
});

// 3. ghost cap 40
check('ghost key-moments capped at 40', () => {
  const moments = Array.from({ length: 100 }, (_, i) => ({ t: i }));
  const { payload } = ChallengeLinkCore.mint({ modeKey: 'dunkContest', score: 50, keyMoments: moments });
  assert.strictEqual(payload.ghost.length, 40, 'hard cap enforced');
});

// 4. tag truncation
check('athleteTag truncated to 16 chars', () => {
  const { payload } = ChallengeLinkCore.mint({ modeKey: 'x', score: 1, athleteTag: 'A'.repeat(50) });
  assert.strictEqual(payload.tag.length, 16, 'tag <= 16 chars');
});

// 5. resolve win
check('resolve: beating score wins, offers rematch + signup', () => {
  const payload: ChallengePayload = { v: 1, modeKey: 'dunkContest', score: 40, tag: 'RIVAL', ghost: [], t: 0 };
  const r = ChallengeLinkCore.resolve(payload, 46);
  assert.strictEqual(r.beat, true);
  assert.strictEqual(r.margin, 6);
  assert.ok(r.events.some((e) => e.type === 'challenge-won'));
  assert.ok(r.events.some((e) => e.type === 'rematch-link-offer'));
  assert.strictEqual(r.funnel.convertToSignup, true);
});

// 6. resolve loss
check('resolve: losing still offers rematch, no signup flag', () => {
  const payload: ChallengePayload = { v: 1, modeKey: 'dunkContest', score: 40, tag: 'RIVAL', ghost: [], t: 0 };
  const r = ChallengeLinkCore.resolve(payload, 30);
  assert.strictEqual(r.beat, false);
  assert.strictEqual(r.margin, -10);
  assert.ok(r.events.some((e) => e.type === 'challenge-lost'));
  assert.ok(r.events.some((e) => e.type === 'rematch-link-offer'));
  assert.strictEqual(r.funnel.convertToSignup, false);
});

// 7. determinism
check('identical mint input -> identical path', () => {
  const input = { modeKey: 'dunkContest', score: 46, display: 'Windmill', athleteTag: 'KID' };
  const a = ChallengeLinkCore.mint(input);
  const b = ChallengeLinkCore.mint(input);
  assert.strictEqual(a.path, b.path, 'deterministic encoding');
});

console.log(`\n\u2705 challenge-link-core: ${passed} checks passed`);
