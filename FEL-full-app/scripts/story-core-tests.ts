/**
 * scripts/story-core-tests.ts
 * ===========================
 * M9 Step 17 verification harness for the Board/Story core (StoryCore) and the
 * Story Mode skin.
 *
 * Deterministic checks (all randomness flows through a seeded mulberry32 PRNG):
 *   - roll() only fires in traversal; returns a 1..6 d6 and enters `moving`
 *   - a full roll walks the token phase TRAVERSAL -> MOVING -> (land) with the
 *     token advancing exactly `roll` spaces (no teleport: continuous hops)
 *   - space landings resolve per donor: bonus/rail/flight add shards,
 *     carnival adds shards + sets extraRoll, obstacle subtracts HP
 *   - a boss tile opens a BOSS fight; strike() damages the boss and is gated by
 *     the strike cooldown; enough strikes clear the boss (-> defeated/complete)
 *   - defeating all four zone bosses drives the FSM to `complete`
 *   - obstacle damage exceeding HP triggers a retreat to space 0 with retreatHp
 *   - determinism: two cores on the same seed + input script match exactly
 *
 * Run: yarn tsx scripts/story-core-tests.ts
 */

import assert from 'node:assert';
import { StoryCore, type StoryPhase } from '../lib/feel/cores/story-core';
import { makeStoryRun, makeStorySkin, STORY_TUNING } from '../lib/feel/cores/story-skin';
import { BOARD_SPACES, ZONE_BOSSES, TOTAL_BOSSES } from '../lib/feel/cores/story-board-data';

const DT_SEC = 1 / 60;

/** Widening helper — keep phase comparisons from narrowing across tick()/roll(). */
function phaseOf(c: StoryCore): string {
  return c.phase as string;
}

/** Deterministic PRNG so every run is reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Advance until the token stops hopping (phase leaves `moving`). */
function settle(c: StoryCore, maxTicks = 20000): void {
  let n = 0;
  while (phaseOf(c) === 'moving') {
    c.tick(DT_SEC);
    if (++n > maxTicks) throw new Error('token never settled');
  }
}

let passed = 0;
function check(name: string, fn: () => void): void {
  fn();
  passed++;
  console.log('  ✓ ' + name);
}

// 1. roll() gating + d6 range + phase entry
check('roll() returns a 1..6 d6 and enters moving; ignored outside traversal', () => {
  const c = new StoryCore(makeStorySkin(), { rng: mulberry32(1) });
  assert.strictEqual(phaseOf(c), 'traversal');
  const r = c.roll();
  assert.ok(r !== null && r >= 1 && r <= 6, 'roll in 1..6');
  assert.strictEqual(phaseOf(c), 'moving');
  // second roll while moving is ignored
  assert.strictEqual(c.roll(), null, 'no roll while moving');
});

// 2. token advances exactly `roll` spaces, continuously (no teleport)
check('a roll advances the token exactly `roll` spaces via continuous hops', () => {
  const c = new StoryCore(makeStorySkin(), { rng: mulberry32(7) });
  const startIdx = c.state.tokenIndex;
  const roll = c.roll()!;
  // record max per-tick displacement to prove hops, not teleports
  let prev = { ...c.state.tokenPos };
  let maxStep = 0;
  let n = 0;
  while (phaseOf(c) === 'moving') {
    c.tick(DT_SEC);
    const d = Math.hypot(
      c.state.tokenPos.x - prev.x,
      c.state.tokenPos.y - prev.y,
      c.state.tokenPos.z - prev.z,
    );
    if (d > maxStep) maxStep = d;
    prev = { ...c.state.tokenPos };
    if (++n > 20000) throw new Error('never settled');
  }
  const expected = (startIdx + roll) % BOARD_SPACES.length;
  assert.strictEqual(c.state.tokenIndex, expected, 'landed `roll` spaces on');
  // a single 60Hz step should never cross a whole board gap (typical > 3m)
  assert.ok(maxStep < 3, `per-tick step small (was ${maxStep.toFixed(3)})`);
});

// 3. space landings resolve per donor rules
check('bonus/carnival add shards (carnival sets extraRoll); obstacle subtracts HP', () => {
  // Drive a controlled walk by forcing rolls of 1 and inspecting each landing.
  const c = new StoryCore(makeStorySkin(), { rng: () => 0 }); // rng()=0 => d6=1 every time
  let guard = 0;
  // Walk one space at a time until we've observed a bonus, a carnival, and an obstacle.
  let sawBonus = false;
  let sawCarnival = false;
  let sawObstacle = false;
  while ((!sawBonus || !sawCarnival || !sawObstacle) && guard++ < 40) {
    if (phaseOf(c) !== 'traversal') {
      // if we walked onto a boss tile, skip past it by clearing via strikes
      if (phaseOf(c) === 'boss') {
        for (let i = 0; i < 400 && phaseOf(c) === 'boss'; i++) {
          c.strike();
          c.tick(DT_SEC);
        }
        // drain any defeated hold
        for (let i = 0; i < 200 && phaseOf(c) !== 'traversal' && phaseOf(c) !== 'complete'; i++) c.tick(DT_SEC);
      }
      if (phaseOf(c) !== 'traversal') break;
    }
    const shardsBefore = c.state.shards;
    const hpBefore = c.state.hp;
    c.roll();
    settle(c);
    const landed = c.state.lastSpace!;
    if (landed.type === 'bonus' || landed.type === 'rail' || landed.type === 'flight') {
      assert.ok(c.state.shards >= shardsBefore, 'shard space did not reduce shards');
      if (landed.type === 'bonus') sawBonus = true;
    } else if (landed.type === 'carnival') {
      assert.strictEqual(c.state.shards, shardsBefore + landed.bonus, 'carnival shard bonus');
      assert.strictEqual(c.state.extraRoll, true, 'carnival grants extra roll');
      sawCarnival = true;
    } else if (landed.type === 'obstacle') {
      assert.ok(c.state.hp <= hpBefore, 'obstacle reduced HP');
      sawObstacle = true;
    }
  }
  assert.ok(sawBonus, 'observed a bonus space');
  assert.ok(sawCarnival, 'observed a carnival space');
  assert.ok(sawObstacle, 'observed an obstacle space');
});

// 4. boss encounter + strike damage + cooldown gating
check('boss tile opens a fight; strike() damages boss and is cooldown-gated', () => {
  // Space index 6 is the first boss (courtFloor). Walk there deterministically.
  const c = new StoryCore(makeStorySkin(), { rng: () => 0 }); // always +1
  let guard = 0;
  while (phaseOf(c) !== 'boss' && guard++ < 30) {
    if (phaseOf(c) === 'traversal') {
      c.roll();
      settle(c);
    } else {
      c.tick(DT_SEC);
    }
  }
  assert.strictEqual(phaseOf(c), 'boss', 'reached a boss fight');
  assert.ok(c.state.boss, 'boss present');
  const hp0 = c.state.boss!.hp;
  const ok1 = c.strike();
  assert.ok(ok1, 'first strike lands');
  assert.ok(c.state.boss!.hp < hp0, 'boss HP dropped');
  // immediate second strike is gated by cooldown
  const ok2 = c.strike();
  assert.strictEqual(ok2, false, 'second strike gated by cooldown');
  // after the cooldown elapses a strike lands again
  const cd = STORY_TUNING.strikeCooldownS;
  for (let i = 0; i < Math.ceil(cd / DT_SEC) + 1; i++) c.tick(DT_SEC);
  assert.ok(phaseOf(c) === 'boss' ? c.strike() : true, 'strike available after cooldown');
});

// 5. defeating all bosses reaches `complete`
check('clearing every zone boss drives the FSM to complete', () => {
  const c = new StoryCore(makeStorySkin(), { rng: () => 0 });
  let guard = 0;
  while (phaseOf(c) !== 'complete' && guard++ < 4000) {
    const p = phaseOf(c);
    if (p === 'traversal') {
      c.roll();
      settle(c);
    } else if (p === 'boss') {
      c.strike();
      c.tick(DT_SEC);
    } else {
      c.tick(DT_SEC); // moving / defeated holds
    }
  }
  assert.strictEqual(phaseOf(c), 'complete', 'story completed');
  assert.strictEqual(c.state.bossesDefeated, TOTAL_BOSSES, 'all bosses defeated');
  assert.strictEqual(c.state.finished, true, 'finished flag set');
});

// 6. retreat on HP depletion (obstacle overkill) resets to space 0 w/ retreatHp
check('HP depletion triggers a retreat to space 0 at retreatHp', () => {
  // startHp small enough that one obstacle can zero it: use a bespoke skin.
  const skin = makeStorySkin();
  const c = new StoryCore(
    { ...skin, tuning: { ...STORY_TUNING, startHp: 8 } }, // any obstacle bonus >= 8 zeroes HP
    { rng: () => 0 },
  );
  let guard = 0;
  let retreated = false;
  const startTokens: number[] = [];
  while (!retreated && guard++ < 60) {
    if (phaseOf(c) === 'traversal') {
      const hpBefore = c.state.hp;
      c.roll();
      settle(c);
      if (c.state.lastSpace?.type === 'obstacle' && c.state.lastSpace.bonus >= hpBefore) {
        retreated = true;
        assert.strictEqual(c.state.tokenIndex, 0, 'retreated to space 0');
        assert.strictEqual(c.state.hp, STORY_TUNING.retreatHp, 'HP restored to retreatHp');
        assert.strictEqual(phaseOf(c), 'traversal', 'back in traversal after retreat');
      }
    } else if (phaseOf(c) === 'boss') {
      // avoid getting stuck in a boss fight for this check: strike it down
      c.strike();
      c.tick(DT_SEC);
    } else {
      c.tick(DT_SEC);
    }
    startTokens.push(c.state.tokenIndex);
  }
  assert.ok(retreated, 'observed a retreat');
});

// 7. determinism: same seed + same inputs => identical state
check('same seed and input script yield identical end state', () => {
  function run(): string {
    const c = makeStoryRun({ rng: mulberry32(12345) });
    for (let step = 0; step < 40; step++) {
      const p = phaseOf(c);
      if (p === 'traversal') {
        c.roll();
        settle(c);
      } else if (p === 'boss') {
        c.strike();
        c.tick(DT_SEC);
      } else if (p === 'complete') {
        break;
      } else {
        c.tick(DT_SEC);
      }
    }
    return JSON.stringify({
      phase: c.phase,
      shards: c.state.shards,
      hp: c.state.hp,
      idx: c.state.tokenIndex,
      bosses: c.state.bossesDefeated,
    });
  }
  assert.strictEqual(run(), run(), 'deterministic end state');
});

// 8. board data integrity (donor fidelity)
check('board data is intact: 20 spaces, 4 zone bosses, one final', () => {
  assert.strictEqual(BOARD_SPACES.length, 20, '20 board spaces');
  assert.strictEqual(TOTAL_BOSSES, 4, 'four zone bosses');
  assert.strictEqual(Object.keys(ZONE_BOSSES).length, 4, 'four boss configs');
  const finals = Object.values(ZONE_BOSSES).filter((b) => b?.final).length;
  assert.strictEqual(finals, 1, 'exactly one final boss');
});

console.log(`\nstory-core: ${passed}/${passed} checks passed`);
