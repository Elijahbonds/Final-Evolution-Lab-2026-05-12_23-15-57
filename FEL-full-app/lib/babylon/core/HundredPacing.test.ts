// The Hundred's run rules (IMPROVE 2026-10-06) — see HundredPacing.ts.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  canTopUp, hordeLiveCap, HORDE_LIVE_CAP_MOBILE, HUNDRED_PHONE_ONLOOKERS, waveDone,
  hordeSpeedMult, HORDE_SPEED_CAP, capWarning, clockText, waveLesson, WAVE_LESSONS,
  partnerTarget, PARTNER_STRIKE, chasesPartner, partnerHitDamage, PARTNER_MAX_HP,
} from './HundredPacing';
import { waveSpec } from './OnslaughtCore';
import { STRIKE_TIMING } from './HordeDynamics';
import { STEERING_PRESETS } from './MobSteering';
import { enemyHitDamage, VITALS } from './NeoCombatCore';

describe('the phone body cap', () => {
  it('a phone stands at most HORDE_LIVE_CAP_MOBILE; desktop is uncapped', () => {
    expect(hordeLiveCap('mobile')).toBe(HORDE_LIVE_CAP_MOBILE);
    expect(hordeLiveCap('desktop')).toBe(Infinity);
    expect(hordeLiveCap(undefined)).toBe(Infinity);
  });
  it('2 fighters + the onlookers + the cap fit the perf ceiling of 16 skinned bodies', () => {
    expect(2 + HUNDRED_PHONE_ONLOOKERS + HORDE_LIVE_CAP_MOBILE).toBeLessThanOrEqual(16);
  });
  it('the cap is under the phone wave, so the queue is what holds it (the wave itself is unchanged)', () => {
    expect(waveSpec(9, 12).count).toBe(12);
    expect(HORDE_LIVE_CAP_MOBILE).toBeLessThan(12);
  });
  it('a queued body comes in only on a free rig under the cap', () => {
    expect(canTopUp(9, 2, 10)).toBe(true);
    expect(canTopUp(10, 2, 10)).toBe(false);
    expect(canTopUp(3, 0, 10)).toBe(false);
    expect(canTopUp(50, 1, Infinity)).toBe(true);
  });
  it('the wave is done only when nobody stands, loads or waits', () => {
    expect(waveDone(0, 0, 0)).toBe(true);
    expect(waveDone(0, 0, 1)).toBe(false);
    expect(waveDone(0, 1, 0)).toBe(false);
    expect(waveDone(1, 0, 0)).toBe(false);
  });
  it('simulated phone wave: never more than the cap rigged, every body of the wave fights', () => {
    const count = 12, cap = HORDE_LIVE_CAP_MOBILE;
    let live = Math.min(count, cap), queued = count - live, sinking = 0, spawned = live, peak = live;
    for (let t = 0; t < 1000; t++) {
      if (live > 0 && t % 3 === 0) { live--; sinking++; }          // a KO: the body sinks out on its rig
      if (sinking > 0 && t % 7 === 0) { sinking--; while (canTopUp(live + sinking, queued, cap)) { queued--; live++; spawned++; } }
      peak = Math.max(peak, live + sinking);
    }
    expect(spawned).toBe(count);
    expect(peak).toBeLessThanOrEqual(cap);
  });
});

describe('#16 the horde gets faster (TUNED: half the wave ramp, capped)', () => {
  it('rises with the wave and never falls', () => {
    let prev = 1;
    for (let w = 1; w <= 30; w++) { const m = hordeSpeedMult(waveSpec(w).speedMult); expect(m).toBeGreaterThanOrEqual(prev); prev = m; }
    expect(hordeSpeedMult(waveSpec(1).speedMult)).toBeGreaterThan(1);
  });
  it('wave 1 ×1.03, wave 5 ×1.14, capped at HORDE_SPEED_CAP', () => {
    expect(hordeSpeedMult(waveSpec(1).speedMult)).toBeCloseTo(1.0275, 4);
    expect(hordeSpeedMult(waveSpec(5).speedMult)).toBeCloseTo(1.1375, 4);
    expect(hordeSpeedMult(waveSpec(40).speedMult)).toBe(HORDE_SPEED_CAP);
  });
  it('the fastest archetype at the cap is level with a QUICKSILVER hero (4.4 × 1.15), not past it', () => {
    expect(STEERING_PRESETS.rusher.maxSpeed * HORDE_SPEED_CAP).toBeLessThanOrEqual(4.4 * 1.15 + 1e-9);
  });
});

describe('#17 the warning before the cap', () => {
  it('calls 30 and 10 once each, on the frame the clock crosses them', () => {
    const calls: number[] = [];
    for (let t = 0; t < 180; t += 1 / 60) { const w = capWarning(180 - t + 1 / 60, 180 - t); if (w) calls.push(w); }
    expect(calls).toEqual([30, 10]);
  });
  it('a long frame that skips past both calls the nearer one only', () => {
    expect(capWarning(31, 9)).toBe(30);
    expect(capWarning(40, 35)).toBeNull();
  });
  it('m:ss', () => {
    expect(clockText(180)).toBe('3:00'); expect(clockText(29.2)).toBe('0:30'); expect(clockText(9.01)).toBe('0:10'); expect(clockText(-3)).toBe('0:00');
  });
});

describe('#19 the tutorial, a few verbs a wave', () => {
  it('waves 1–5 each teach something, short enough to read in one banner, and none repeats', () => {
    const lessons = [1, 2, 3, 4, 5].map(waveLesson);
    for (const l of lessons) { expect(l).toBeTruthy(); expect(l!.length).toBeLessThanOrEqual(64); }
    expect(new Set(lessons).size).toBe(5);
    expect(waveLesson(6)).toBeNull();
  });
  it('the first wave is the basic verbs; strings come after', () => {
    expect(WAVE_LESSONS[1]).toMatch(/JAB/); expect(WAVE_LESSONS[1]).toMatch(/DODGE/);
    expect(WAVE_LESSONS[2]).toMatch(/STRINGS/);
  });
});

describe('#13 the partner swing', () => {
  const me = { x: 0, z: 0 };
  it('hits on the hero\'s own light contact beat', () => {
    expect(PARTNER_STRIKE.hitAtSec).toBe(STRIKE_TIMING.light.hitAt);
  });
  it('the nearest body inside reach AND the arc from its own facing', () => {
    const bodies = [{ x: 0, z: 1.7 }, { x: 0, z: 1.2 }, { x: 0, z: -0.6 }, { x: 1.0, z: 0.1 }];
    expect(partnerTarget(me, 0, bodies)).toBe(1);                 // ahead and closest
    expect(partnerTarget(me, Math.PI, bodies)).toBe(2);           // turned round: the one behind
    expect(partnerTarget(me, 0, [{ x: 0, z: -1 }])).toBe(-1);     // behind it: no hit (it used to land anywhere within 1.8 m)
    expect(partnerTarget(me, 0, [{ x: 0, z: PARTNER_STRIKE.reach + 0.05 }])).toBe(-1);
    expect(partnerTarget(me, 0, [{ x: 1.0, z: 0.1 }])).toBe(-1);  // 84° off the facing: outside the 100° arc
  });
});

describe('#15 the partner can go down (TUNED)', () => {
  it('a share of the pack hunts it, from wave 2', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].filter((i) => chasesPartner(i, 1))).toEqual([]);
    expect([0, 1, 2, 3, 4, 5, 6, 7].filter((i) => chasesPartner(i, 2))).toEqual([3, 7]);
  });
  it('it takes a share of a blow and survives a few at wave 1', () => {
    const hit = partnerHitDamage(enemyHitDamage(1));
    expect(hit).toBeLessThan(enemyHitDamage(1));
    expect(Math.ceil(PARTNER_MAX_HP / hit)).toBeGreaterThanOrEqual(Math.ceil(VITALS.maxHp / enemyHitDamage(1)));
    expect(partnerHitDamage(0)).toBe(1);
  });
});

describe('the mode reads them (static)', () => {
  const src = readFileSync('lib/babylon/modes/KarateEndlessMode.ts', 'utf8');
  it('#18 the CHI READY call is not gated on a move the burst does not need', () => {
    const line = src.split('\n').find((l) => l.includes("chi >= 100") && l.includes('before < 100'));
    expect(line).toBeTruthy();
    expect(line).not.toMatch(/hasFightMove/);
  });
  it('#14 the partner is held by the arena, not a square', () => {
    expect(src).not.toMatch(/Math\.max\(-8, Math\.min\(8, partner/);
    expect(src).toContain('clampDisc(partner.root.position)');
  });
  it('#1 a KO takes the mob out of the pool; #16 the steering preset carries the wave speed', () => {
    expect(src).toContain('pool.remove(e.mob)');
    expect(src).toContain('maxSpeed: base.maxSpeed * hordeSpeed');
  });
});
