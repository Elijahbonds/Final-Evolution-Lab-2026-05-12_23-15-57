/**
 * scripts/m17-m21-tests.ts
 * ========================
 * Pure-core acceptance tests for the M17–M21 delivery:
 *   - Movement screen (workout scan analysis)
 *   - Plan generator (shard-gated 4w / 12w)
 *   - Avatar spec builder
 *   - Closet wearable catalog + inclusive face options
 *   - Stream program guide + weighted ad pick
 *   - Session schedule (Wed/Fri group, private fallback, TZ-correct)
 *   - Coin→shard exchange rate math (shards never sold directly)
 *   - Obstacle/mob field (deterministic layout + patrol + collision)
 *
 * No DB, no THREE, no DOM — all pure. Run: yarn tsx scripts/m17-m21-tests.ts
 */

import assert from 'node:assert';

import { analyzeMovement, defaultMetrics, PILLAR_LABELS, type Pillar } from '../lib/workout/movement-screen';
import { generatePlan } from '../lib/workout/plan-generator';
import { buildAvatarSpec } from '../lib/workout/avatar-builder';
import {
  SKIN_TONES, FACE_SHAPES, HAIR_STYLES, HAIR_COLORS, EYE_SHAPES, EYE_COLORS,
  BROWS, MOUTHS, NOSES, WEARABLES, SLOTS, getWearable, wearablesForSlot,
  defaultFace, defaultEquipped,
} from '../lib/closet/wearable-catalog';
import { PROGRAMS, AD_SLOTS, pickAd, watchXp } from '../lib/stream/program-guide';
import {
  SESSION_PRICING, GROUP_CONFIG, upcomingGroupSlots,
  privateBookingAvailable, privateSlots, type Seminar,
} from '../lib/sessions/schedule';
import { COINS_PER_SHARD, MIN_SHARDS, MAX_SHARDS } from '../lib/wallet/exchange';
import {
  generateField, mobPositionAt, mobFacingAt, resolveObstacleCollision, makeRng,
} from '../lib/world/obstacle-field';

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  \u2713 ${name}`);
}
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;

console.log('\n=== Movement screen ===');
check('analyzeMovement returns 6 pillars in 0..100', () => {
  const r = analyzeMovement(defaultMetrics());
  const keys = Object.keys(r.pillars) as Pillar[];
  assert.equal(keys.length, 6);
  keys.forEach((k) => {
    assert.ok(r.pillars[k] >= 0 && r.pillars[k] <= 100, `${k} in range`);
    assert.ok(PILLAR_LABELS[k], `${k} has a label`);
  });
  assert.ok(r.overall >= 0 && r.overall <= 100);
  assert.ok(r.flags.length >= 1);
});
check('weakest pillar is genuinely the lowest', () => {
  const r = analyzeMovement({ jumpHeightCm: 20, depthDeg: 95, asymmetryPct: 4, valgusL: 0.1, valgusR: 0.1, cadenceSpm: 178, trunkLeanDeg: 11 });
  const lo = Math.min(...Object.values(r.pillars));
  assert.ok(near(r.pillars[r.weakest], lo), 'weakest matches min');
  assert.equal(r.weakest, 'power', 'low jump -> power weakest');
});

console.log('\n=== Plan generator ===');
check('4-week plan has 4 weeks, 12-week has 12', () => {
  const screen = analyzeMovement(defaultMetrics());
  const p4 = generatePlan(screen, 'plan_4w');
  const p12 = generatePlan(screen, 'program_12w');
  assert.equal(p4.weeks.length, 4);
  assert.equal(p12.weeks.length, 12);
  assert.equal(p4.focus, screen.weakest, 'plan targets the weakest pillar');
  p4.weeks.forEach((w) => assert.ok(w.days.length >= 1 && w.days[0].exercises.length >= 1));
});

console.log('\n=== Avatar spec ===');
check('buildAvatarSpec clamps scales and honours palette overrides', () => {
  const spec = buildAvatarSpec(defaultMetrics(), { skin: '#123456' });
  assert.ok(spec.heightScale >= 0.9 && spec.heightScale <= 1.12);
  assert.ok(spec.buildScale >= 0.9 && spec.buildScale <= 1.15);
  assert.equal(spec.palette.skin, '#123456');
  assert.ok(['athletic', 'tall', 'compact'].includes(spec.stance));
});

console.log('\n=== Closet catalog (inclusivity) ===');
check('inclusive option ranges are broad', () => {
  assert.ok(SKIN_TONES.length >= 10, 'at least 10 skin tones');
  assert.ok(HAIR_STYLES.length >= 8, 'broad hair styles');
  // Textured / protective / faith-inclusive styles must be present.
  ['Afro', 'Box Braids', 'Locs', 'Cornrows', 'Hijab', 'Bald'].forEach((s) =>
    assert.ok(HAIR_STYLES.includes(s), `hair styles include ${s}`),
  );
  [FACE_SHAPES, HAIR_COLORS, EYE_SHAPES, EYE_COLORS, BROWS, MOUTHS, NOSES].forEach((arr) =>
    assert.ok(arr.length >= 5, 'each face facet has 5+ options'),
  );
});
check('defaultFace + defaultEquipped are self-consistent', () => {
  const face = defaultFace();
  assert.ok(SKIN_TONES.includes(face.skinTone));
  assert.ok(HAIR_STYLES.includes(face.hairStyle));
  const eq = defaultEquipped();
  SLOTS.forEach((slot) => assert.ok(slot in eq, `equip map has ${slot}`));
});
check('wearables resolve by id and by slot; prices are non-negative', () => {
  assert.ok(WEARABLES.length >= 5);
  WEARABLES.forEach((w) => {
    assert.equal(getWearable(w.itemId)?.itemId, w.itemId);
    assert.ok(w.coinPrice >= 0, 'coin price non-negative');
  });
  SLOTS.forEach((slot) => {
    wearablesForSlot(slot).forEach((w) => assert.equal(w.slot, slot));
  });
  assert.equal(getWearable('__nope__'), null);
});

console.log('\n=== Stream guide ===');
check('programs include Elijah Bonds live + class variety', () => {
  assert.ok(PROGRAMS.length >= 5);
  const ids = PROGRAMS.map((p) => p.id);
  ['eb_hiit', 'eb_plyo', 'eb_iso', 'eb_smr', 'eb_biomech'].forEach((id) =>
    assert.ok(ids.includes(id), `guide includes ${id}`),
  );
});
check('pickAd is deterministic for a fixed seed and returns a valid slot', () => {
  const a = pickAd(AD_SLOTS, 42);
  const b = pickAd(AD_SLOTS, 42);
  assert.ok(a && b);
  assert.equal(a!.id, b!.id, 'same seed -> same ad');
  assert.ok(AD_SLOTS.some((s) => s.id === a!.id));
});
check('watchXp rewards engaged watching more', () => {
  assert.ok(watchXp(10, true) >= watchXp(10, false));
  assert.ok(watchXp(20, true) >= watchXp(5, true));
});

console.log('\n=== Session schedule ===');
check('pricing + group config sane', () => {
  assert.ok(SESSION_PRICING.group_workout > 0);
  assert.ok(SESSION_PRICING.private_1on1 > SESSION_PRICING.seminar_seat);
  assert.equal(GROUP_CONFIG.hour, 17);
  assert.equal(GROUP_CONFIG.minute, 30);
});
check('upcomingGroupSlots land on Wed/Fri 17:30 America/Los_Angeles', () => {
  const slots = upcomingGroupSlots(new Date('2026-07-19T12:00:00Z'), 6);
  assert.ok(slots.length === 6);
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: false,
  });
  slots.forEach((s) => {
    const parts = fmt.formatToParts(new Date(s.startsAtIso));
    const wd = parts.find((p) => p.type === 'weekday')!.value;
    const hh = parts.find((p) => p.type === 'hour')!.value;
    const mm = parts.find((p) => p.type === 'minute')!.value;
    assert.ok(wd === 'Wed' || wd === 'Fri', `slot on Wed/Fri, got ${wd}`);
    assert.equal(`${hh}:${mm}`, '17:30', 'starts 5:30 PM PT');
    assert.ok(s.startsAtIso > '2026-07-19', 'slot in the future');
  });
});
check('private 1-on-1 opens only after 14 days with no seminar', () => {
  const now = new Date('2026-07-19T12:00:00Z');
  const soon: Seminar[] = [{ sessionKey: 'sem1', title: 'x', startsAtIso: '2026-07-25T00:00:00Z', seats: 20, shards: 250 }];
  assert.equal(privateBookingAvailable(now, soon), false, 'seminar within 14d blocks private');
  assert.equal(privateBookingAvailable(now, []), true, 'no seminar -> private available');
  assert.ok(privateSlots(now, 3).length === 3);
});

console.log('\n=== Coin\u2192shard exchange (shards never sold directly) ===');
check('exchange rate constants are sane and bounded', () => {
  assert.ok(COINS_PER_SHARD >= 1, 'positive integer rate');
  assert.ok(MIN_SHARDS >= 1 && MIN_SHARDS < MAX_SHARDS);
  // coinCost is a strict multiple of the rate (money buys coins, coins buy shards)
  const shards = 25;
  assert.equal(shards * COINS_PER_SHARD, 500, 'derived coin cost is deterministic');
});

console.log('\n=== Obstacle / mob field ===');
check('makeRng is deterministic', () => {
  const a = makeRng(99); const b = makeRng(99);
  assert.ok(near(a(), b()) && near(a(), b()));
});
check('generateField is deterministic and respects counts + exclusions', () => {
  const cfg = {
    bounds: { minX: -6, maxX: 6, minZ: 0, maxZ: 8 },
    obstacleCount: 5, mobCount: 3,
    exclude: [{ pos: { x: 0, z: 0 }, radius: 3 }],
  };
  const f1 = generateField(cfg, 343);
  const f2 = generateField(cfg, 343);
  assert.equal(f1.obstacles.length, 5);
  assert.equal(f1.mobs.length, 3);
  assert.deepEqual(f1.obstacles.map((o) => o.id), f2.obstacles.map((o) => o.id));
  assert.ok(near(f1.obstacles[0].pos.x, f2.obstacles[0].pos.x), 'same seed -> same layout');
});
check('mob patrol orbits its home; facing follows the tangent', () => {
  const cfg = { bounds: { minX: -5, maxX: 5, minZ: 0, maxZ: 5 }, obstacleCount: 0, mobCount: 1 };
  const { mobs } = generateField(cfg, 7);
  const m = mobs[0];
  const p0 = mobPositionAt(m, 0);
  const d0 = Math.hypot(p0.x - m.home.x, p0.z - m.home.z);
  assert.ok(near(d0, m.patrolRadius, 1e-6), 'stays on patrol radius');
  assert.ok(Number.isFinite(mobFacingAt(m, 0.5)), 'facing is a finite yaw');
});
check('resolveObstacleCollision pushes a body out of a disc', () => {
  const obstacles = [{ id: 'o', kind: 'crate' as const, pos: { x: 0, z: 0 }, radius: 1 }];
  const fixed = resolveObstacleCollision({ x: 0.2, z: 0 }, 0.3, obstacles);
  const d = Math.hypot(fixed.x, fixed.z);
  assert.ok(d >= 1 + 0.3 - 1e-6, 'pushed to disc edge');
  const clear = resolveObstacleCollision({ x: 5, z: 5 }, 0.3, obstacles);
  assert.ok(near(clear.x, 5) && near(clear.z, 5), 'clear point unchanged');
});

console.log(`\n\u2705 m17-m21 pure cores: ${passed} checks passed`);
