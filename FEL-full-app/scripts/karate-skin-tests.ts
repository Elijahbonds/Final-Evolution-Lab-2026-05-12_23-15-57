/**
 * scripts/karate-skin-tests.ts
 * ============================
 * M9 Step 3 verification harness for the karate family skinned onto the
 * Court/free-3D core (lib/feel/cores/karate-skin.ts + karate-constants.ts).
 *
 * Proves, by driving a headless two-fighter bout at a fixed 60Hz:
 *   1. Combat FSM walks Neutral→Strike→(Stagger on the defender)→Neutral.
 *   2. Clean light/heavy hits deal reference damage (8/15) on the contact frame.
 *   3. Dodge i-frames (400ms) fully negate a strike (whiff, no damage).
 *   4. Guard window (800ms) blocks damage and rewards defender PRQ (perfect guard).
 *   5. Dragon Strike (special) is combo-locked (needs chain ≥8) and, once landed,
 *      fires the crimson + slow-mo storm-cam window and spends the chain.
 *   6. KO fires the 0.3s hit-stop sensory and sets a winner.
 *   7. SensoryBus emits happen ON the contact frame (stats increment exactly then).
 *   8. Footwork runs on the shared Court core (no ArcDrive lock-on; grounded).
 *
 * Run: yarn tsx scripts/karate-skin-tests.ts
 * Wired into scripts/standing-suite.ts as the 7th standing suite.
 */

import assert from 'node:assert';
import { KarateBout } from '../lib/feel/cores/karate-skin';
import { STRIKE_DAMAGE, HIT_STUN_MS, SPECIAL_CHAIN_REQ, KARATE_SENSORY } from '../lib/feel/cores/karate-constants';

const DT = 1 / 60;
const IDLE = { moveX: 0, moveY: 0, camYaw: 0 };

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  \u2713 ${name}`);
}

/** Step the bout for `ms` of bout time with both fighters idle. */
function advance(bout: KarateBout, ms: number) {
  const n = Math.round(ms / 1000 / DT);
  for (let i = 0; i < n; i++) bout.step(DT, IDLE, IDLE);
}

console.log('karate-skin-tests: karate family on the Court core\n');

// 1. Combat FSM walk -------------------------------------------------------
check('FSM walks Neutral→Strike (attacker) and →Stagger (defender) →Neutral', () => {
  const bout = new KarateBout();
  assert.strictEqual(bout.a.phase, 'Neutral');
  bout.strike(bout.a, 'heavy');
  assert.strictEqual(bout.a.phase, 'Strike');
  advance(bout, 160); // past heavy windup(140) — contact resolves
  assert.strictEqual(bout.b.phase, 'Stagger', 'defender staggers on hit');
  advance(bout, 400); // past hit-stun + strike recovery
  assert.strictEqual(bout.a.phase, 'Neutral');
  assert.strictEqual(bout.b.phase, 'Neutral');
});

// 2. Reference damage on contact frame ------------------------------------
check('light + heavy strikes deal reference damage (8 / 15)', () => {
  const bout = new KarateBout();
  bout.strike(bout.a, 'light');
  advance(bout, 400); // resolve + recover
  assert.strictEqual(bout.b.hp, 100 - STRIKE_DAMAGE.light, 'light = 8 dmg');
  advance(bout, 400); // let defender leave stagger
  bout.strike(bout.a, 'heavy');
  advance(bout, 500);
  assert.strictEqual(bout.b.hp, 100 - STRIKE_DAMAGE.light - STRIKE_DAMAGE.heavy, 'heavy = 15 dmg');
});

// 3. Dodge i-frames negate the strike -------------------------------------
check('dodge i-frames (400ms) fully negate an incoming strike', () => {
  const bout = new KarateBout();
  bout.dodge(bout.b); // b invincible for 400ms
  bout.strike(bout.a, 'heavy'); // contact at ~140ms < 400ms
  advance(bout, 300);
  assert.strictEqual(bout.b.hp, 100, 'no damage through i-frames');
});

// 4. Guard blocks + rewards PRQ (perfect guard) ---------------------------
check('guard window blocks damage and grants defender PRQ', () => {
  const bout = new KarateBout();
  const prq0 = bout.b.prq;
  bout.setBlock(bout.b, true); // 800ms guard
  bout.strike(bout.a, 'heavy');
  advance(bout, 300);
  assert.strictEqual(bout.b.hp, 100, 'blocked = no damage');
  assert.ok(bout.b.prq > prq0, 'perfect guard rewards PRQ');
});

// 5. Dragon Strike combo lock + storm cam ---------------------------------
check('special is combo-locked until chain ≥ 8', () => {
  const bout = new KarateBout();
  assert.strictEqual(bout.strike(bout.a, 'special'), false, 'locked at combo 0');
  bout.a.combo = SPECIAL_CHAIN_REQ; // simulate an 8-hit chain
  assert.strictEqual(bout.strike(bout.a, 'special'), true, 'unlocks at chain 8');
});

check('landed Dragon Strike fires storm cam and spends the chain', () => {
  const bout = new KarateBout();
  bout.a.combo = SPECIAL_CHAIN_REQ;
  bout.strike(bout.a, 'special');
  advance(bout, 240); // past special windup(220) — contact
  assert.strictEqual(bout.a.combo, 0, 'special spends the chain');
  assert.strictEqual(bout.camera.stormCam, true, 'crimson + slow-mo storm cam engaged');
  assert.strictEqual(bout.b.hp, 100 - STRIKE_DAMAGE.special, 'special = 25 dmg');
});

// 6. KO fires 0.3s hit-stop + sets winner ---------------------------------
check('KO sets winner and fires the 0.3s hit-stop sensory', () => {
  let koFired = false;
  const bout = new KarateBout({
    onSensory: (evt, info) => { if (evt === 'ko' && info.outcome === 'ko') koFired = true; },
  });
  bout.b.hp = STRIKE_DAMAGE.heavy; // one heavy ends it
  const emit0 = bout.bus.stats.emitted;
  bout.strike(bout.a, 'heavy');
  advance(bout, 200);
  assert.strictEqual(bout.winner, bout.a.id, 'attacker wins on KO');
  assert.ok(koFired, 'KO sensory event fired');
  assert.ok(bout.bus.stats.emitted > emit0, 'KO emitted on the bus');
  assert.strictEqual(KARATE_SENSORY.ko.hitStopMs, HIT_STUN_MS, 'KO hit-stop preset is the spec 0.3s');
  assert.strictEqual(HIT_STUN_MS, 300);
});

// 7. Sensory emits on the contact frame -----------------------------------
check('SensoryBus emit lands exactly on the contact frame', () => {
  const bout = new KarateBout();
  const before = bout.bus.stats.emitted;
  bout.strike(bout.a, 'heavy'); // windup 140ms ≈ 8-9 frames
  // Just before contact: no emit yet.
  advance(bout, 120);
  assert.strictEqual(bout.bus.stats.emitted, before, 'no emit during windup');
  // Cross the contact frame.
  advance(bout, 40);
  assert.strictEqual(bout.bus.stats.emitted, before + 1, 'exactly one emit on contact');
});

// 8. Footwork on the shared Court core ------------------------------------
check('footwork runs on the Court core (grounded, no lock-on)', () => {
  const bout = new KarateBout();
  const x0 = bout.a.pos.x;
  const fwd = { moveX: 1, moveY: 0, camYaw: 0 };
  for (let i = 0; i < 60; i++) bout.step(DT, fwd, IDLE);
  assert.ok(Math.abs(bout.a.pos.x - x0) > 0.2, 'fighter A moved under locomotion');
  assert.strictEqual(bout.a.loco.state.driving, false, 'ArcDrive unused in karate');
  assert.ok(bout.a.pos.x <= 6 + 1e-6, 'stays within karate arena bounds');
});

console.log(`\nkarate-skin-tests: ${passed} checks passed \u2713`);
