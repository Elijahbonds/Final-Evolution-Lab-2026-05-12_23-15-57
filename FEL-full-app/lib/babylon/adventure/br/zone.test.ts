// The zone (ADVENTURE PLAN, "The Battle Royale"): five phases of wait and shrink, damage rising each phase, a ceiling
// that comes down with the circle, zone damage as a DamageEvent with source 'zone', and a collapse that ends every match.
import { describe, expect, it } from 'vitest';
import { createAdventureBus, NO_FUSION, type AdventureActor, type AdventureStepContext, type DamageEvent } from '../contracts';
import { fightStateOf } from '../combat/fightState';
import {
  createZone, createZoneSystem, inStorm, nextCircle, planZone, stepZone, zoneSecondsLeft, zoneTotalSec, type ZoneState,
} from './zone';
import { ZONE_COLLAPSE, ZONE_PHASES, ZONE_START, ZONE_TICK_SEC } from './tuning';

const BOUNDS = { minX: -158, maxX: 158, minZ: -158, maxZ: 158 };
const DT = 1 / 60;

function body(id: string, x: number, y: number, z: number, hp = 200): AdventureActor {
  return {
    id, kind: 'bot', team: 1, pos: { x, y, z }, vel: { x: 0, y: 0, z: 0 }, facingYaw: 0, grounded: true, state: 'ground',
    stateSec: 0, radius: 0.4, height: 1.8,
    stats: { hp: { cur: hp, max: hp }, stamina: { cur: 100, max: 100 }, energy: { cur: 100, max: 100 }, poise: { cur: 50, max: 50 }, special: 0, level: 10, prqBand: 'READY', school: { primary: 'straight', secondary: 'straight', mix: 0 }, element: null },
    lock: null, stunSec: 0, iframeSec: 0, impulse: null, rail: null, ridingId: null, wantsFlight: false, fusion: { ...NO_FUSION }, partnerId: null,
  };
}

function rig(zone: ZoneState, bodies: AdventureActor[], o: { mult?: number } = {}) {
  const bus = createAdventureBus((e) => { throw e; });
  const actors = new Map(bodies.map((b) => [b.id, b]));
  const ceilings: number[] = [];
  const sys = createZoneSystem({ zone, hurts: () => true, damageMult: () => o.mult ?? 1, setCeiling: (y) => ceilings.push(y) });
  const ctx: AdventureStepContext = {
    tSec: 0, world: { actors, groundY: () => 0, rails: { id: 'r', segments: [] }, walls: [], near: () => [], clear: () => true },
    inputs: new Map(), bus, timeScaleOf: () => 1, hint: () => {},
  };
  const damage: DamageEvent[] = [];
  const kos: string[] = [];
  bus.on('damage', (e) => damage.push({ ...e }));
  bus.on('ko', (e) => kos.push(e.actorId));
  const zoneEvents: number[] = [];
  bus.on('zone', (e) => zoneEvents.push(e.phase));
  const run = (sec: number) => { for (let i = 0; i < Math.round(sec / DT); i++) { sys.step(ctx, DT); ctx.tSec += DT; } };
  return { sys, ctx, damage, kos, ceilings, zoneEvents, run };
}

describe('the zone plan', () => {
  it('rolls the start, five phase circles and the collapse, each inside the last, from the seed', () => {
    for (const seed of [1, 2, 3, 99, 12345, 0xdeadbeef]) {
      const c = planZone(seed, BOUNDS);
      expect(c).toHaveLength(ZONE_PHASES.length + 2);
      expect(c[0].r).toBe(ZONE_START.radiusM);
      ZONE_PHASES.forEach((ph, i) => expect(c[i + 1].r).toBe(ph.radiusM));
      expect(c.at(-1)!.r).toBe(0);
      for (let i = 1; i < c.length; i++) {
        const off = Math.hypot(c[i].x - c[i - 1].x, c[i].z - c[i - 1].z);
        expect(off + c[i].r, `seed ${seed} circle ${i} nested`).toBeLessThanOrEqual(c[i - 1].r + 1e-6);
        expect(c[i].ceilingY, 'the ceiling comes down').toBeLessThanOrEqual(c[i - 1].ceilingY);
        if (i < c.length - 1) {
          expect(c[i].x).toBeGreaterThan(BOUNDS.minX); expect(c[i].x).toBeLessThan(BOUNDS.maxX);
          expect(c[i].z).toBeGreaterThan(BOUNDS.minZ); expect(c[i].z).toBeLessThan(BOUNDS.maxZ);
        }
      }
    }
  });

  it('is the same plan for the same seed and a different one for another', () => {
    expect(planZone(7, BOUNDS)).toEqual(planZone(7, BOUNDS));
    const a = planZone(7, BOUNDS), b = planZone(8, BOUNDS);
    expect(a.slice(1).some((c, i) => Math.abs(c.x - b[i + 1].x) > 1 || Math.abs(c.z - b[i + 1].z) > 1)).toBe(true);
  });
});

describe('the zone, stepped', () => {
  it('waits, shrinks, waits … five phases, damage rising each phase, then collapses and closes', () => {
    const z = createZone(5, BOUNDS);
    const seen: { phase: number; stage: string; dps: number }[] = [];
    let t = 0;
    while (z.stage !== 'closed' && t < 1000) {
      const ev = stepZone(z, DT);
      t += DT;
      if (ev === 'phase') seen.push({ phase: z.phase, stage: z.stage, dps: z.dps });
    }
    expect(z.stage).toBe('closed');
    expect(z.cur.r).toBe(0);
    expect(t).toBeCloseTo(zoneTotalSec(), 0);
    expect(seen.map((s) => s.phase)).toEqual([1, 2, 3, 4, 5, 6]);
    for (let i = 1; i < seen.length; i++) expect(seen[i].dps, 'damage rises each phase').toBeGreaterThan(seen[i - 1].dps);
    expect(seen.at(-1)!.dps).toBe(ZONE_COLLAPSE.dps);
  });

  it('eases the circle and the ceiling during a shrink, and shows the next circle while it waits', () => {
    const z = createZone(5, BOUNDS);
    expect(nextCircle(z)).toEqual(z.circles[1]);
    stepZone(z, ZONE_PHASES[0].waitSec + ZONE_PHASES[0].shrinkSec / 2);
    expect(z.stage).toBe('shrink');
    expect(z.cur.r).toBeLessThan(ZONE_START.radiusM);
    expect(z.cur.r).toBeGreaterThan(ZONE_PHASES[0].radiusM);
    expect(z.cur.ceilingY).toBeLessThan(ZONE_START.ceilingY);
    expect(z.cur.ceilingY).toBeGreaterThan(ZONE_PHASES[0].ceilingY);
    expect(zoneSecondsLeft(z)).toBeCloseTo(ZONE_PHASES[0].shrinkSec / 2, 3);
  });

  it('a body is in the storm outside the circle, or above the ceiling inside it', () => {
    const z = createZone(5, BOUNDS);
    const c = z.cur;
    expect(inStorm(z, { x: c.x, y: 0, z: c.z })).toBe(false);
    expect(inStorm(z, { x: c.x + c.r + 1, y: 0, z: c.z })).toBe(true);
    expect(inStorm(z, { x: c.x, y: c.ceilingY + 1, z: c.z }), 'flight cannot hide above the storm').toBe(true);
    expect(inStorm(z, { x: c.x, y: c.ceilingY - 1, z: c.z })).toBe(false);
  });
});

describe('the zone system', () => {
  it('lands the storm as DamageEvents with source zone, at the stage\'s damage per second', () => {
    const z = createZone(5, BOUNDS);
    const out = body('out', z.cur.x + z.cur.r + 20, 0, z.cur.z);
    const inside = body('in', z.cur.x, 0, z.cur.z);
    const r = rig(z, [out, inside]);
    r.run(10);
    const zoneHits = r.damage.filter((d) => d.targetId === 'out');
    // whole points land each pulse (a fraction waits for the next), so a 1/s storm pulses once a second
    expect(zoneHits.length).toBeGreaterThanOrEqual(Math.min(Math.floor(10 / ZONE_TICK_SEC), Math.floor(ZONE_START.dps * 10)) - 1);
    for (const d of zoneHits) { expect(d.source).toBe('zone'); expect(d.outcome).toBe('hit'); expect(d.sourceId).toBeNull(); expect(d.knockback).toBeNull(); }
    const total = zoneHits.reduce((s, d) => s + d.amount, 0);
    expect(total).toBeGreaterThanOrEqual(Math.floor(ZONE_START.dps * 10) - 1);
    expect(total).toBeLessThanOrEqual(Math.ceil(ZONE_START.dps * 10) + 1);
    expect(r.damage.some((d) => d.targetId === 'in')).toBe(false);
    expect(200 - out.stats.hp.cur).toBe(total);
  });

  it('a body above the ceiling is in the storm too (no hiding up there)', () => {
    const z = createZone(5, BOUNDS);
    const high = body('high', z.cur.x, z.cur.ceilingY + 5, z.cur.z);
    const r = rig(z, [high]);
    r.run(4);
    expect(r.damage.filter((d) => d.targetId === 'high' && d.source === 'zone').length).toBeGreaterThan(0);
  });

  it('the flight ceiling follows the zone down', () => {
    const z = createZone(5, BOUNDS);
    const r = rig(z, []);
    r.run(ZONE_PHASES[0].waitSec + ZONE_PHASES[0].shrinkSec + 1);
    expect(r.ceilings[0]).toBe(ZONE_START.ceilingY);
    expect(r.ceilings.at(-1)).toBeCloseTo(ZONE_PHASES[0].ceilingY, 5);
    for (let i = 1; i < r.ceilings.length; i++) expect(r.ceilings[i]).toBeLessThanOrEqual(r.ceilings[i - 1] + 1e-9);
    expect(r.zoneEvents).toEqual([1]);
  });

  it('i-frames delay the storm but never cancel it', () => {
    const z = createZone(5, BOUNDS);
    const a = body('a', z.cur.x + z.cur.r + 20, 0, z.cur.z);
    const r = rig(z, [a]);
    a.iframeSec = 999;   // a dodge that never ends (the test's): nothing lands …
    r.run(4);
    expect(r.damage.length).toBe(0);
    expect(r.sys.owed('a')).toBeGreaterThan(ZONE_START.dps * 4 - 0.5);
    a.iframeSec = 0;   // … and the debt lands the moment it is over
    r.run(ZONE_TICK_SEC + DT);
    expect(r.damage.reduce((s, d) => s + d.amount, 0)).toBeGreaterThanOrEqual(Math.floor(ZONE_START.dps * 4));
  });

  it('a guard does not block the storm, and a KO by the storm fires once', () => {
    const z = createZone(5, BOUNDS);
    stepZone(z, zoneTotalSec() - 1);   // the collapse: the fiercest storm
    const a = body('a', z.cur.x + 50, 0, z.cur.z, 30);
    fightStateOf(a).guardWasHeld = true;
    const r = rig(z, [a]);
    r.run(5);
    expect(r.damage.every((d) => d.outcome === 'hit')).toBe(true);
    expect(a.stats.hp.cur).toBe(0);
    expect(r.kos).toEqual(['a']);
  });

  it('an ability that thins the storm thins its damage', () => {
    const z1 = createZone(5, BOUNDS), z2 = createZone(5, BOUNDS);
    const a = body('a', z1.cur.x + z1.cur.r + 20, 0, z1.cur.z), b = body('a', z2.cur.x + z2.cur.r + 20, 0, z2.cur.z);
    const full = rig(z1, [a]), thin = rig(z2, [b], { mult: 0.6 });
    full.run(20); thin.run(20);
    const sum = (r: typeof full) => r.damage.reduce((s, d) => s + d.amount, 0);
    expect(sum(thin)).toBeLessThan(sum(full));
    expect(sum(thin)).toBeGreaterThanOrEqual(Math.floor(sum(full) * 0.6) - 1);
  });
});
