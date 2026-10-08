// IMPROVE (2026-10-06), velocitykart: the pure rules of the owner-picked pass (kartRules.ts).
import { describe, expect, it } from 'vitest';
import {
  kartScore, KART_SCORE_MAX, KART_CLOCK_CAP, HOP, newHop, tryHop, stepHop, hopClear, kartThreatWords, hopNow, HOP_CUE_SEC,
  looseSlip, kartGhostKey, ghostYaw,
} from './kartRules';
import { MODE_SCORE_RULES } from '@/lib/sessions/modeScoreRules';
import { kartCircuits, kartCircuitVariant } from '../racing/kartCircuits';
import { MISSILE_HIT_RADIUS, MINE_HIT_RADIUS } from '../racing/AeroItems';
import type { Threat } from './aeroAcesRules';

describe('#4 the score pays the place', () => {
  it('1st and 8th on the same clock no longer score the same; the clock part is the old formula', () => {
    const at = (place: number) => kartScore({ finished: true, place, timeSec: 110, goldSec: 124 });
    expect(at(1).clockPts).toBe(Math.round((124 * 2 - 110) * 10));   // unchanged: (2 × gold − time) × 10
    expect(at(1).total).toBeGreaterThan(at(8).total);
    for (let p = 1; p < 8; p++) expect(at(p).total).toBeGreaterThan(at(p + 1).total);
  });

  it('a DNF scores nothing (the grid-sitter rule stands), and junk input scores nothing', () => {
    expect(kartScore({ finished: false, place: 1, timeSec: 60, goldSec: 124 }).total).toBe(0);
    expect(kartScore({ finished: true, place: 1, timeSec: NaN, goldSec: 124 }).total).toBe(0);
    expect(kartScore({ finished: true, place: 99, timeSec: 400, goldSec: 124 }).total).toBe(0);
  });

  it('the clock part is capped, so a race has a ceiling under the server\'s measured velocityKart row', () => {
    expect(kartScore({ finished: true, place: 1, timeSec: 1, goldSec: 10_000 }).clockPts).toBe(KART_CLOCK_CAP);
    expect(KART_SCORE_MAX).toBe(3000);
    expect(KART_SCORE_MAX).toBeLessThanOrEqual(MODE_SCORE_RULES.velocityKart.maxScore);
  });

  it('the fastest race the karts can drive, on every course and variant, stays under the server\'s pace check', () => {
    // 30 m/s average is past the starter's 26 m/s top speed — boost all the way round
    for (const c of kartCircuits()) {
      for (const v of [{ laps: 2, mirror: false }, { laps: 3, mirror: true }] as const) {
        const circ = kartCircuitVariant(c.course.id, v)!;
        const t = (circ.line.length * circ.course.laps) / 30;
        const s = kartScore({ finished: true, place: 1, timeSec: t, goldSec: circ.course.gold }).total;
        expect(s / t, `${c.course.id} ${v.laps}`).toBeLessThan(MODE_SCORE_RULES.velocityKart.maxScorePerSecond);
      }
    }
  });
});

describe('#7 the hop', () => {
  it('starts on a grounded press at speed, once per press, with a cooldown after landing', () => {
    const h = newHop();
    expect(tryHop(h, true, 2)).toBe(false);                  // below minSpeed: a plain drift press
    expect(tryHop(h, false, 20)).toBe(false);                // in the air off a ramp
    expect(tryHop(h, true, 20)).toBe(true);
    expect(hopClear(h)).toBe(true);
    expect(tryHop(h, true, 20)).toBe(false);                 // already up
    let peak = 0, t = 0;
    while (hopClear(h)) { peak = Math.max(peak, stepHop(h, 1 / 60)); t += 1 / 60; }
    expect(t).toBeCloseTo(HOP.sec, 1);
    expect(peak).toBeGreaterThan(HOP.height * 0.95);
    expect(peak).toBeLessThanOrEqual(HOP.height + 1e-9);
    expect(tryHop(h, true, 20)).toBe(false);                 // the cooldown: the button is timing, not a held immunity
    for (let i = 0; i < Math.ceil(HOP.cooldown * 60) + 1; i++) stepHop(h, 1 / 60);
    expect(tryHop(h, true, 20)).toBe(true);
  });

  it('lifts the hit point clear of a shell\'s and a mine\'s hit radius', () => {
    expect(HOP.clearLift).toBeGreaterThan(MISSILE_HIT_RADIUS);
    expect(HOP.clearLift).toBeGreaterThan(MINE_HIT_RADIUS);
  });
});

describe('#6 the shell warning words', () => {
  const at = (tti: number): Threat => ({ tti, side: 'BEHIND', lateral: 0, rollNow: false });
  it('reads seconds out, then HOP NOW inside the hop cue', () => {
    expect(kartThreatWords(null)).toBe('');
    expect(kartThreatWords(at(1.42))).toBe('SHELL 1.4s');
    expect(hopNow(at(1.42))).toBe(false);
    expect(kartThreatWords(at(HOP_CUE_SEC))).toBe('HOP NOW');
    expect(hopNow(at(0.2))).toBe(true);
    expect(HOP_CUE_SEC).toBeGreaterThan(HOP.sec);   // the cue lights before the hop's own air time
  });
});

describe('#8 the sand slides only when you turn on it', () => {
  it('no slip on the straight, more with more lock', () => {
    expect(looseSlip(0, 1 / 60)).toBe(0);
    expect(looseSlip(0.3, 1 / 60)).toBeGreaterThan(0);
    expect(looseSlip(1, 1 / 60)).toBeGreaterThan(looseSlip(0.3, 1 / 60));
    expect(looseSlip(-1, 1 / 60)).toBe(looseSlip(1, 1 / 60));
  });
});

describe('#3 #12 the ghost', () => {
  it('the standard race keeps its old key; a variant gets its own', () => {
    expect(kartGhostKey('stadium-oval', '')).toBe('stadium-oval');
    expect(kartGhostKey('stadium-oval', 'gp-m')).toBe('stadium-oval~gp-m');
  });
  it('a ghost recorded without yaw faces the way it moved', () => {
    expect(ghostYaw(null, { x: 0, z: 0 }, 0.5)).toBe(0.5);
    expect(ghostYaw({ x: 0, z: 0 }, { x: 0, z: 0 }, 0.5)).toBe(0.5);
    expect(ghostYaw({ x: 0, z: 0 }, { x: 1, z: 0 }, 0)).toBeCloseTo(Math.PI / 2);
    expect(ghostYaw({ x: 0, z: 0 }, { x: 0, z: 1 }, 1)).toBeCloseTo(0);
  });
});
