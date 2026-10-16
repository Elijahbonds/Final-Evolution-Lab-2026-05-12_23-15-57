// A9.8 (visual-foundation, 2026-10-06): one live-particle ceiling for every burst, and a lever a governor can turn.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MIN_BURST, PARTICLE_BUDGET, PHONE_BURST_FLOOR, PHONE_MODE_CEILING, PHONE_STEADY_CAP, burstFloor, committedParticles, fitBurst, liveParticles, particleBudget, particleBudgetScale, phoneModeCeiling, phoneSteadyCap, phoneSystemCap, roomUsed, setParticleBudgetScale } from './ParticleBudget';

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

// lane/owner-1016 (2026-10-16): dunk and karate got a ceiling of their own on a PHONE (PR #281: 29 live against rows of 12 and 24).
describe('a phone mode ceiling', () => {
  const phone = (modeId: string) => ({ metadata: { felTier: 'mobile', felModeId: modeId } });

  it('lowers the phone budget for dunk and karate only, and only on a phone', () => {
    expect(particleBudget(phone('dunk') as never)).toBe(PHONE_MODE_CEILING.dunk);
    expect(particleBudget(phone('karate') as never)).toBe(PHONE_MODE_CEILING.karate);
    expect(particleBudget(phone('onevone') as never)).toBe(PARTICLE_BUDGET.mobile);               // another mode: the tier's, untouched
    expect(particleBudget({ metadata: { felTier: 'desktop', felModeId: 'dunk' } } as never)).toBe(PARTICLE_BUDGET.desktop);
    expect(particleBudget({ metadata: { felTier: 'high', felModeId: 'dunk' } } as never)).toBe(PARTICLE_BUDGET.high);
    expect(phoneModeCeiling({ metadata: { felTier: 'mobile' } })).toBeNull();                       // no mode recorded
  });

  it('trims a burst to the room under it: a dunk spark burst beside a full trail', () => {
    const s = phone('dunk') as never;
    expect(fitBurst(20, 4, particleBudget(s), 1, burstFloor(s))).toBe(4);        // 20 sparks, 4 trail dots in the air, ceiling 8: 4 sparks
    expect(fitBurst(20, 8, particleBudget(s), 1, burstFloor(s))).toBe(PHONE_BURST_FLOOR); // never below a readable few
    expect(fitBurst(20, 4, PARTICLE_BUDGET.mobile)).toBe(20);   // CONTROL: without the ceiling it fires whole
  });

  it('under a ceiling a burst keeps two, not four: hits landing together do not each hold a full floor', () => {
    expect(burstFloor(phone('karate') as never)).toBe(PHONE_BURST_FLOOR);
    expect(burstFloor(phone('onevone') as never)).toBe(MIN_BURST);
    expect(burstFloor({ metadata: { felTier: 'desktop', felModeId: 'karate' } } as never)).toBe(MIN_BURST);
    // four hits at once in karate, each a star and four streaks, on a petal-sprinkled floor, ceiling 12: the sum stays inside the row (24)
    const s = phone('karate') as never, ceiling = particleBudget(s);
    let live = 4;                                                   // the petals
    for (let hit = 0; hit < 4; hit++) { live += fitBurst(1, live, ceiling, 1, burstFloor(s)); live += fitBurst(4, live, ceiling, 1, burstFloor(s)); }
    expect(live).toBeLessThanOrEqual(20);
    expect(live).toBeLessThanOrEqual(24);
    // CONTROL: the tier's floor of four (what ran) keeps 4 + 4 x (1 + 4) = 24 from a ceiling that is already spent
    let old = 4;
    for (let hit = 0; hit < 4; hit++) { old += fitBurst(1, old, ceiling); old += fitBurst(4, old, ceiling); }
    expect(old).toBeGreaterThan(live);
  });

  it('sizes the steady systems to a share of it, on a phone in that mode only', () => {
    expect(phoneSystemCap(phone('dunk') as never, 120, 0.5)).toBe(4);
    expect(phoneSystemCap(phone('karate') as never, 60, 0.4)).toBe(4);
    expect(phoneSystemCap(phone('onevone') as never, 120, 0.5)).toBe(120);
    expect(phoneSystemCap({ metadata: { felTier: 'desktop', felModeId: 'dunk' } } as never, 120, 0.5)).toBe(120);
    expect(phoneSystemCap(phone('dunk') as never, 4, 0.5)).toBe(4);   // never above what the system asked for
  });

  it('a ceiling is never above its mode\'s row in mobileBudget.json (the row is not raised; this is what holds the mode to it)', () => {
    const t = JSON.parse(readFileSync(join(__dirname, '..', 'config', 'mobileBudget.json'), 'utf8')) as { modes: Record<string, { budget: { particles: number } }> };
    // the table's rows are keyed by the REGISTRY key (`karate_vs`); the ceiling by the harness's modeId (`karate-vs`): same mode, two spellings
    // (test changed: lane/kvs-skin looks the row up under both spellings; the assertion itself is the same, and no row is raised)
    for (const [mode, ceiling] of Object.entries(PHONE_MODE_CEILING)) {
      const row = t.modes[mode] ?? t.modes[mode.replace(/-/g, '_')];
      expect(row, mode).toBeTruthy();
      expect(ceiling, mode).toBeLessThanOrEqual(row.budget.particles);
    }
  });
});

// lane/kvs-skin (2026-10-16): Karate VS read 18-26 live (55 over 12 s) against a row of 5. Its ceiling is the row itself.
describe('Karate VS on a phone', () => {
  const phone = (modeId = 'karate-vs') => ({ metadata: { felTier: 'mobile', felModeId: modeId } });

  it('has a ceiling of exactly its row (5), on a phone only', () => {
    const t = JSON.parse(readFileSync(join(__dirname, '..', 'config', 'mobileBudget.json'), 'utf8')) as { modes: Record<string, { budget: { particles: number } }> };
    expect(t.modes.karate_vs.budget.particles).toBe(5);                                    // the row is NOT raised
    expect(PHONE_MODE_CEILING['karate-vs']).toBe(5);
    expect(particleBudget(phone() as never)).toBe(5);
    expect(burstFloor(phone() as never)).toBe(PHONE_BURST_FLOOR);
    expect(particleBudget({ metadata: { felTier: 'desktop', felModeId: 'karate-vs' } } as never)).toBe(PARTICLE_BUDGET.desktop);   // CONTROL: desktop unchanged
    expect(particleBudget({ metadata: { felTier: 'high', felModeId: 'karate-vs' } } as never)).toBe(PARTICLE_BUDGET.high);
    expect(burstFloor({ metadata: { felTier: 'desktop', felModeId: 'karate-vs' } } as never)).toBe(MIN_BURST);
    expect(particleBudget(phone('showdown') as never)).toBe(PARTICLE_BUDGET.mobile);       // CONTROL: its peers keep the tier's
  });

  it('pins its steady systems: one petal, no aura motes, and only on that phone', () => {
    expect(PHONE_STEADY_CAP['karate-vs']).toEqual({ petals: 1, motes: 0 });
    expect(phoneSteadyCap(phone() as never, 'petals', 60)).toBe(1);
    expect(phoneSteadyCap(phone() as never, 'motes', 40)).toBe(0);
    expect(phoneSteadyCap(phone() as never, 'petals', 1)).toBe(1);                         // never above what the system asked for
    expect(phoneSteadyCap(phone() as never, 'unlisted', 40)).toBe(40);                     // a system the mode does not pin keeps its own cap
    expect(phoneSteadyCap(phone('karate') as never, 'petals', 4)).toBe(4);                 // CONTROL: karate (endless) is not pinned
    expect(phoneSteadyCap(phone('karate') as never, 'motes', 40)).toBe(40);
    expect(phoneSteadyCap({ metadata: { felTier: 'desktop', felModeId: 'karate-vs' } } as never, 'petals', 60)).toBe(60);
    expect(phoneSteadyCap({ metadata: {} } as never, 'petals', 60)).toBe(60);
  });

  it('counts what is queued, not only what is in the air, so same-frame bursts do not each take the whole room', () => {
    const queued = { particleSystems: [{ getActiveCount: () => 1, manualEmitCount: 0 }, { getActiveCount: () => 0, manualEmitCount: 3 }, { getActiveCount: () => 0, manualEmitCount: -1 }] };
    expect(committedParticles(queued)).toBe(4);                                            // 1 live + 3 queued; a stream's -1 is not a queue
    expect(roomUsed({ metadata: phone().metadata, ...queued })).toBe(4);                   // a phone under a ceiling counts the queue
    expect(roomUsed({ metadata: { felTier: 'mobile', felModeId: 'onevone' }, ...queued })).toBe(1);   // CONTROL: any other scene counts the air only
    expect(roomUsed({ metadata: { felTier: 'desktop', felModeId: 'karate-vs' }, ...queued })).toBe(1);
  });
});
