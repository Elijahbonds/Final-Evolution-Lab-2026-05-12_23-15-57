/**
 * Headless invariant tests for lib/feel/karate-endless-economy.ts (handoff Part 4).
 * Run: yarn tsx scripts/karate-endless-economy-tests.ts
 */
import {
  ECON, waveCreditMult, killReward, isEliteKill,
  enemyHpMult, enemySpeedMult, isSpikeRound, extractUnlocked,
  extractLc, downedExtractLc,
  BUY_ITEMS, buyItem, canAfford,
  rollPowerUp, POWERUP_KINDS,
  createPowerups, activatePowerup, updatePowerups, instaKillActive, doublePointsActive,
  createDowned, goDown, updateDowned, reviveProgress01,
} from '../lib/feel/karate-endless-economy';

let passed = 0;
const fail: string[] = [];
function ok(cond: boolean, label: string) {
  if (cond) { passed++; console.log('  \u2713 ' + label); }
  else { fail.push(label); console.log('  \u2717 ' + label); }
}
const approx = (a: number, b: number, e = 1e-6) => Math.abs(a - b) <= e;

console.log('Karate Endless economy — invariants\n');

// --- currency ---
ok(killReward(1) === ECON.BASE_CREDITS, 'wave-1 plain kill pays BASE_CREDITS');
ok(killReward(10) > killReward(1), 'later waves pay more per kill');
ok(approx(waveCreditMult(1), 1) && waveCreditMult(10) > waveCreditMult(1), 'wave credit multiplier grows monotonically');
ok(killReward(5, { elite: true }) === Math.round(killReward(5) * ECON.ELITE_CREDIT_MULT), 'elite kill pays the elite multiplier');
ok(killReward(5, { doublePoints: true }) === Math.round(killReward(5) * ECON.DOUBLE_POINTS_MULT), 'double-points doubles the reward');
ok(killReward(3, { elite: true, doublePoints: true }) > killReward(3, { elite: true }), 'stacked bonuses exceed a single bonus');
ok(!isEliteKill(0) && !isEliteKill(4) && isEliteKill(5) && isEliteKill(10) && !isEliteKill(11), 'every 5th kill is elite');

// --- round-10 spike ---
ok(enemyHpMult(9) === 1 && enemyHpMult(10) === ECON.SPIKE_HP_MULT, 'enemy HP spikes exactly at round 10');
ok(enemySpeedMult(9) === 1 && enemySpeedMult(10) === ECON.SPIKE_SPEED_MULT, 'enemy speed spikes exactly at round 10');
ok(enemyHpMult(15) === ECON.SPIKE_HP_MULT, 'spike persists past round 10');
ok(isSpikeRound(10) && !isSpikeRound(11), 'spike milestone fires only on round 10');
ok(!extractUnlocked(9) && extractUnlocked(10) && extractUnlocked(20), 'extract unlocks from round 10 onward');

// --- extract ---
ok(extractLc(0) === ECON.EXTRACT_MIN_LC, 'zero score still banks the minimum LC');
ok(extractLc(8000) === 80, 'extract rate is score ÷ 100 above the floor');
ok(extractLc(20000) > extractLc(8000), 'higher score banks more LC');
ok(downedExtractLc(20000) < extractLc(20000), 'downed extract pays less than a standing extract');
ok(downedExtractLc(10000) === Math.floor(extractLc(10000) * ECON.DOWNED_EXTRACT_RATE), 'downed extract is the 25% share');

// --- buy menu ---
ok(BUY_ITEMS.length === 4, 'four shop items');
ok(BUY_ITEMS.every((b) => b.cost > 0 && b.label.length > 0), 'shop items have a cost and a label');
ok(buyItem('upgradeStrike')?.cost === 350, 'UPGRADE STRIKE costs 350');
ok(canAfford(200, 'secondWind') && !canAfford(199, 'secondWind'), 'canAfford respects exact cost');
ok(!canAfford(50, 'upgradeStrike'), 'cannot afford above balance');

// --- power-up roll ---
ok(rollPowerUp(0) === POWERUP_KINDS[0], 'roll 0 -> first power-up');
ok(rollPowerUp(0.99) === POWERUP_KINDS[POWERUP_KINDS.length - 1], 'roll ~1 -> last power-up');
ok(POWERUP_KINDS.every((k, i) => rollPowerUp((i + 0.5) / POWERUP_KINDS.length) === k), 'roll buckets cover every kind');

// --- power-up timers ---
{
  const p = createPowerups();
  ok(!instaKillActive(p) && !doublePointsActive(p), 'fresh timers inactive');
  const refill = activatePowerup(p, 'maxAmmo');
  ok(refill === true, 'maxAmmo signals a special refill');
  activatePowerup(p, 'instaKill');
  ok(instaKillActive(p) && approx(p.instaKillT, ECON.INSTA_KILL_S), 'insta-kill starts at full duration');
  updatePowerups(p, ECON.INSTA_KILL_S + 1);
  ok(!instaKillActive(p) && p.instaKillT === 0, 'insta-kill expires and clamps at 0');
  activatePowerup(p, 'doublePoints');
  ok(doublePointsActive(p) && approx(p.doublePointsT, ECON.DOUBLE_POINTS_S), 'double-points starts at full duration');
}

// --- downed / self-revive ---
{
  const d = createDowned();
  ok(!d.downed, 'starts not downed');
  d.secondWinds = 1;
  goDown(d);
  ok(d.downed && approx(d.timeoutT, ECON.DOWNED_TIMEOUT_S), 'goDown sets timeout to full');
  // hold revive for less than required -> still downed, progress rises
  let ev = updateDowned(d, ECON.REVIVE_HOLD_S - 0.5, true);
  ok(ev === 'downed' && reviveProgress01(d) > 0 && reviveProgress01(d) < 1, 'partial revive hold keeps player downed with progress');
  ev = updateDowned(d, 1.0, true);
  ok(ev === 'revived' && !d.downed && d.secondWinds === 0, 'completing the hold revives and consumes a second wind');
}
{
  const d = createDowned(); // no second winds banked
  goDown(d);
  const ev = updateDowned(d, ECON.DOWNED_TIMEOUT_S + 1, true);
  ok(ev === 'expired', 'no banked revive + holding does nothing; times out');
}
{
  const d = createDowned();
  d.secondWinds = 1;
  goDown(d);
  updateDowned(d, 1.0, true); // some progress
  const ev = updateDowned(d, 0.1, false); // release before completing
  ok(reviveProgress01(d) === 0 && ev === 'downed', 'releasing the hold resets revive progress');
}

console.log('');
if (fail.length) {
  console.error(`\u274c ${fail.length} FAILED:`);
  for (const f of fail) console.error('   - ' + f);
  process.exit(1);
}
console.log(`All ${passed} karate-endless economy invariants passed.`);
