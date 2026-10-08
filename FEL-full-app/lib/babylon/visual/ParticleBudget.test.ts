// A9.8 (visual-foundation, 2026-10-06): one live-particle ceiling for every burst, and a lever a governor can turn.
import { describe, expect, it } from 'vitest';
import { MIN_BURST, PARTICLE_BUDGET, fitBurst, liveParticles, particleBudget, particleBudgetScale, setParticleBudgetScale } from './ParticleBudget';

const sceneLike = (md: Record<string, unknown> | null, counts: number[] = []) =>
  ({ metadata: md, particleSystems: counts.map((n) => ({ getActiveCount: () => n })) }) as never;

describe('fitBurst', () => {
  it('a burst that fits fires whole', () => {
    expect(fitBurst(60, 100, 900)).toBe(60);
    expect(fitBurst(60, 840, 900)).toBe(60);
  });
  it('one that does not is trimmed to the room left, never below a readable few', () => {
    expect(fitBurst(60, 870, 900)).toBe(30);
    expect(fitBurst(60, 900, 900)).toBe(MIN_BURST);
    expect(fitBurst(60, 5000, 900)).toBe(MIN_BURST);
    expect(fitBurst(2, 5000, 900)).toBe(2);           // a tiny ask is not inflated to the floor
  });
  it('the lever scales the ask', () => {
    expect(fitBurst(60, 0, 900, 0.5)).toBe(30);
    expect(fitBurst(60, 0, 900, 0.2)).toBe(12);
  });
});

describe('the scene budget', () => {
  it('follows the tier the harness recorded; desktop when none', () => {
    expect(particleBudget(sceneLike({ felTier: 'mobile' }))).toBe(PARTICLE_BUDGET.mobile);
    expect(particleBudget(sceneLike({ felTier: 'high' }))).toBe(PARTICLE_BUDGET.high);
    expect(particleBudget(sceneLike(null))).toBe(PARTICLE_BUDGET.desktop);
    expect(PARTICLE_BUDGET.mobile).toBeLessThan(1500);   // under perf-guard's phone ceiling
  });
  it('the governor lever scales the ceiling too, clamped to 0.2..1', () => {
    const s = { metadata: { felTier: 'mobile' } as Record<string, unknown> } as never as { metadata: Record<string, unknown> };
    expect(particleBudgetScale(s)).toBe(1);
    setParticleBudgetScale(s as never, 0.5);
    expect(particleBudget(s)).toBe(PARTICLE_BUDGET.mobile / 2);
    setParticleBudgetScale(s as never, 0);
    expect(particleBudgetScale(s)).toBe(0.2);
    setParticleBudgetScale(s as never, 7);
    expect(particleBudgetScale(s)).toBe(1);
  });
  it('counts what is in the air across every system', () => {
    expect(liveParticles(sceneLike(null, [10, 0, 32]) as never)).toBe(42);
  });
});
