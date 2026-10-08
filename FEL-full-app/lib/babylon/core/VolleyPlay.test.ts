// VolleyPlay — the volleyball rules added on 2026-10-06 (docs/IMPROVEMENTS-2026-10-05.md, Volleyball 1–20), executed.
import { describe, it, expect } from 'vitest';
import {
  nextServer, TOSS_SEC, TOSS_HEIGHT, tossHeight, gradeToss, tossDropped, degradeDig, AI_SPIKE_SHANK, HUMAN_SPIKE_SHANK,
  QUICK_SET, shapeSet, spikeDigSteps, quantiseMeter, blockChip,
} from './VolleyPlay';
import { VOLLEYBALL, SWING_BANDS, BLOCK_STUFF_WINDOW, planShot, judgeShot, type SwingQuality } from './RallyCore';

/** A seeded stream, so the shank rolls are reproducible. */
function lcg(seed: number): () => number { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

describe('the serve', () => {
  it('rally scoring: the winner of the rally serves the next one — the opponent included', () => {
    expect(nextServer(0)).toBe(0);
    expect(nextServer(1)).toBe(1);
  });

  it('the toss leaves the hand, peaks a little past halfway, and is on its way DOWN at contact', () => {
    expect(tossHeight(0)).toBeCloseTo(0, 6);
    expect(tossHeight(TOSS_SEC * 0.55)).toBeCloseTo(TOSS_HEIGHT, 6);
    const atContact = tossHeight(TOSS_SEC);
    expect(atContact).toBeGreaterThan(0.2);                    // still above the hand: struck in the air
    expect(atContact).toBeLessThan(tossHeight(TOSS_SEC - 0.1)); // and falling
  });

  it('is graded on the swing bands around the contact point; a press far too early is not a serve at all', () => {
    expect(gradeToss(TOSS_SEC)).toBe('perfect');
    expect(gradeToss(TOSS_SEC - SWING_BANDS.perfect + 0.01)).toBe('perfect');
    expect(gradeToss(TOSS_SEC + SWING_BANDS.good - 0.01)).toBe('good');
    expect(gradeToss(TOSS_SEC - SWING_BANDS.ok + 0.01)).toBe('early');
    expect(gradeToss(TOSS_SEC + SWING_BANDS.ok - 0.01)).toBe('late');
    expect(gradeToss(TOSS_SEC - SWING_BANDS.ok - 0.01)).toBe('wait');
    expect(gradeToss(0)).toBe('wait');
  });

  it('a toss counts as dropped only once the last late band has passed', () => {
    expect(tossDropped(TOSS_SEC + SWING_BANDS.ok - 0.001)).toBe(false);
    expect(tossDropped(TOSS_SEC + SWING_BANDS.ok + 0.001)).toBe(true);
  });
});

describe('the dig against an attack', () => {
  /** The loop aiReturn played before it moved here — the reference the shared rule must reproduce exactly. */
  function legacyAiDig(q: SwingQuality, steps: number, rand: () => number): SwingQuality {
    for (let i = 0; i < steps; i++) {
      if (q === 'perfect') q = 'good';
      else if (q === 'good') q = 'late';
      else if (q === 'late' && rand() < 0.45) q = 'miss';
    }
    return q;
  }

  it('reproduces the opponent\'s old dig rule draw for draw (the AI qualities: perfect / good / late / miss)', () => {
    for (const q of ['perfect', 'good', 'late', 'miss'] as SwingQuality[]) {
      for (const steps of [1, 2]) {
        for (let seed = 1; seed < 40; seed++) {
          expect(degradeDig(q, steps, AI_SPIKE_SHANK, lcg(seed))).toBe(legacyAiDig(q, steps, lcg(seed)));
        }
      }
    }
  });

  it('one step: perfect → good, good → late, and a late or early dig is shanked only on the roll', () => {
    const never = () => 0.99, always = () => 0;
    expect(degradeDig('perfect', 1, HUMAN_SPIKE_SHANK, always)).toBe('good');
    expect(degradeDig('good', 1, HUMAN_SPIKE_SHANK, always)).toBe('late');
    expect(degradeDig('late', 1, HUMAN_SPIKE_SHANK, never)).toBe('late');
    expect(degradeDig('late', 1, HUMAN_SPIKE_SHANK, always)).toBe('miss');
    expect(degradeDig('early', 1, HUMAN_SPIKE_SHANK, always)).toBe('miss');
    expect(degradeDig('early', 1, HUMAN_SPIKE_SHANK, never)).toBe('early');
  });

  it('the player\'s shank is rarer than the opponent\'s, and both happen at about their stated rate', () => {
    expect(HUMAN_SPIKE_SHANK).toBeLessThan(AI_SPIKE_SHANK);
    const r = lcg(7); let shanks = 0; const N = 4000;
    for (let i = 0; i < N; i++) if (degradeDig('late', 1, HUMAN_SPIKE_SHANK, r) === 'miss') shanks++;
    expect(shanks / N).toBeGreaterThan(HUMAN_SPIKE_SHANK - 0.03);
    expect(shanks / N).toBeLessThan(HUMAN_SPIKE_SHANK + 0.03);
  });

  it('dig steps: one, two when KINETIC or off a QUICK set, never more than two', () => {
    expect(spikeDigSteps(false, false)).toBe(1);
    expect(spikeDigSteps(true, false)).toBe(2);
    expect(spikeDigSteps(false, true)).toBe(2);
    expect(spikeDigSteps(true, true)).toBe(2);
  });
});

describe('the set call', () => {
  const from = { x: 0.5, y: 1.1, z: 4 };
  it('a HIGH call leaves the set exactly as planShot made it', () => {
    const a = planShot(VOLLEYBALL, from, 1, 0, 'good', 'set')!;
    const b = shapeSet(planShot(VOLLEYBALL, from, 1, 0, 'good', 'set')!, 'high');
    expect(b).toEqual(a);
  });

  it('a QUICK set is lower and faster, lands in the same place, and is still slower than the spike it feeds', () => {
    const high = planShot(VOLLEYBALL, from, 1, 0, 'good', 'set')!;
    const quick = shapeSet(planShot(VOLLEYBALL, from, 1, 0, 'good', 'set')!, 'quick');
    expect(quick.apex).toBe(QUICK_SET.apex);
    expect(quick.apex).toBeLessThan(high.apex);
    expect(quick.duration).toBeLessThan(high.duration);
    expect(quick.to).toEqual(high.to);
    expect(judgeShot(VOLLEYBALL, quick)).toBeNull();            // it stays on our side, clean
    const spike = planShot(VOLLEYBALL, { x: quick.to.x, y: 1.1, z: quick.to.z }, -1, 0, 'good', 'spike')!;
    expect(quick.duration).toBeGreaterThan(spike.duration);
    // the swing window (the meter covers the last 45 % of a flight) still holds the whole OK band
    expect(quick.duration * 0.45).toBeGreaterThan(SWING_BANDS.ok);
  });
});

describe('the block and the HUD', () => {
  it('TUNED stuff window: wider than two frames a side at 60 fps, still well inside the perfect band', () => {
    expect(BLOCK_STUFF_WINDOW).toBeGreaterThanOrEqual(3 / 60 - 1e-9);
    expect(BLOCK_STUFF_WINDOW).toBeLessThan(SWING_BANDS.perfect);
  });

  it('the block chip reads READY, or the whole seconds left — never 0s', () => {
    expect(blockChip(0)).toBe('READY');
    expect(blockChip(7)).toBe('7s');
    expect(blockChip(0.2)).toBe('1s');
    expect(blockChip(6.01)).toBe('7s');
  });

  it('the meter is quantised to 1/50 and clamped, so a window pushes at most 51 values', () => {
    expect(quantiseMeter(-0.3)).toBe(0);
    expect(quantiseMeter(1.4)).toBe(1);
    expect(quantiseMeter(0.503)).toBe(0.5);
    const seen = new Set<number>();
    for (let t = 0; t <= 1; t += 1 / 600) seen.add(quantiseMeter(t));
    expect(seen.size).toBeLessThanOrEqual(51);
  });
});
