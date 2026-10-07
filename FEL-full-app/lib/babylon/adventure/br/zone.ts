/**
 * The zone (ADVENTURE PLAN, "The Battle Royale": "a shrinking circle in five phases (wait, shrink, wait…), damage per
 * second rising each phase, plus a CEILING that comes down with it so flight cannot hide above the storm. Zone damage
 * is a DamageEvent with source 'zone'").
 *
 * THE PLAN IS DRAWN AT THE START. Every circle of the match — the start, the five phase circles and the collapse — is
 * rolled from the match seed when the zone is made (`planZone`), each one inside the last, so the state is plain data
 * with no generator inside it: a snapshot carries it whole (Phase D's host handover), and the HUD can show the NEXT
 * circle during a wait, as the genre does.
 *
 * THE STAGES. Phase k waits at circle k, then shrinks to circle k+1 (the radius, the centre and the ceiling ease
 * together). After phase 5 the circle COLLAPSES to nothing: no match can outlast its zone.
 *
 * THE DAMAGE. `createZoneSystem` is an AdventureSystem stepped after combat: a body outside the circle, or above the
 * ceiling, owes the stage's damage per second; every ZONE_TICK_SEC the debt is landed through A2's damage pipeline
 * (combat/damage.applyHit with `source: 'zone'`, unblockable, unparryable, no stagger or knockback), so the hp write,
 * the `damage` event and the `ko` are A2's code. A body in i-frames (a dodge) keeps its debt for the next tick: the
 * storm is dodged in time, never escaped. The movement system's flight ceiling follows the zone's, so a flyer is held
 * under it (A1's box clamp), and anything above it is in the storm anyway.
 *
 * Pure: no Babylon, no clock (ctx.tSec), no global random (the seed).
 */

import type { ActorId, AdventureActor, AdventureStepContext, AdventureSystem, Vec3 } from '../contracts';
import { applyHit, makeHitSpec, resetHitSpec } from '../combat/damage';
import { forkSeed, seededRng } from './rng';
import { ZONE_COLLAPSE, ZONE_PHASES, ZONE_START, ZONE_TICK_SEC } from './tuning';

export interface ZoneCircle { x: number; z: number; r: number; ceilingY: number }
export type ZoneStage = 'wait' | 'shrink' | 'closed';

/** The zone, as plain data (JSON-safe: a snapshot carries it). */
export interface ZoneState {
  /** Every circle, rolled at the start: [start, phase 1..5, collapsed]. */
  circles: ZoneCircle[];
  /** The circle the zone is waiting at or shrinking FROM (0..circles.length - 1). */
  index: number;
  stage: ZoneStage;
  stageSec: number;
  stageLen: number;
  /** The circle now (eased during a shrink). */
  cur: ZoneCircle;
  /** Damage per second outside, now. */
  dps: number;
  /** 1-based phase number shown on the HUD (0 before the first shrink). */
  phase: number;
}

export interface ZoneBounds { minX: number; maxX: number; minZ: number; maxZ: number }

/** (A function, so the stepping loop re-reads a stage it changes itself.) */
const isClosed = (z: ZoneState): boolean => z.stage === 'closed';
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** Smoothstep: a shrink starts and ends gently. */
const ease = (t: number): number => t * t * (3 - 2 * t);

/** The circles of one match, from its seed: each inside the last, centred on the playable map. */
export function planZone(seed: number, bounds: ZoneBounds): ZoneCircle[] {
  const rng = seededRng(forkSeed(seed, 'zone'));
  const cx = (bounds.minX + bounds.maxX) / 2, cz = (bounds.minZ + bounds.maxZ) / 2;
  const out: ZoneCircle[] = [{ x: cx, z: cz, r: ZONE_START.radiusM, ceilingY: ZONE_START.ceilingY }];
  for (const ph of ZONE_PHASES) {
    const prev = out[out.length - 1];
    const slack = Math.max(0, prev.r - ph.radiusM) * 0.85;
    // the centre stays far enough inside the map that the circle's heart is ground, not the void past the edge
    const inset = Math.min(ph.radiusM * 0.6, 40);
    let x = prev.x, z = prev.z;
    for (let tries = 0; tries < 12; tries++) {
      const ang = rng() * Math.PI * 2, d = Math.sqrt(rng()) * slack;
      const nx = prev.x + Math.sin(ang) * d, nz = prev.z + Math.cos(ang) * d;
      x = nx; z = nz;
      if (nx >= bounds.minX + inset && nx <= bounds.maxX - inset && nz >= bounds.minZ + inset && nz <= bounds.maxZ - inset) break;
    }
    x = Math.max(bounds.minX + inset, Math.min(bounds.maxX - inset, x));
    z = Math.max(bounds.minZ + inset, Math.min(bounds.maxZ - inset, z));
    // nested by construction: keep the new circle inside the old even after the clamp
    const dx = x - prev.x, dz = z - prev.z, off = Math.hypot(dx, dz), room = Math.max(0, prev.r - ph.radiusM);
    if (off > room && off > 0) { x = prev.x + (dx / off) * room; z = prev.z + (dz / off) * room; }
    out.push({ x, z, r: ph.radiusM, ceilingY: ph.ceilingY });
  }
  const last = out[out.length - 1];
  out.push({ x: last.x, z: last.z, r: 0, ceilingY: ZONE_COLLAPSE.ceilingY });
  return out;
}

/** The wait before shrinking FROM circle i, and the shrink to circle i + 1. */
function waitOf(i: number): number { return i < ZONE_PHASES.length ? ZONE_PHASES[i].waitSec : ZONE_COLLAPSE.waitSec; }
function shrinkOf(i: number): number { return i < ZONE_PHASES.length ? ZONE_PHASES[i].shrinkSec : ZONE_COLLAPSE.collapseSec; }
/** Damage while waiting at circle i (the phase that made it), and while shrinking from it (the next phase's). */
function waitDps(i: number): number { return i === 0 ? ZONE_START.dps : i - 1 < ZONE_PHASES.length ? ZONE_PHASES[i - 1].dps : ZONE_COLLAPSE.dps; }
function shrinkDps(i: number): number { return i < ZONE_PHASES.length ? ZONE_PHASES[i].dps : ZONE_COLLAPSE.dps; }

export function createZone(seed: number, bounds: ZoneBounds): ZoneState {
  const circles = planZone(seed, bounds);
  const c0 = circles[0];
  return { circles, index: 0, stage: 'wait', stageSec: 0, stageLen: waitOf(0), cur: { ...c0 }, dps: waitDps(0), phase: 0 };
}

/** The circle the zone is heading for (the map's "next circle"), or the current one when closed. */
export function nextCircle(z: ZoneState): ZoneCircle {
  return z.circles[Math.min(z.index + 1, z.circles.length - 1)];
}

/**
 * Advance the zone by dt. Returns 'phase' when a shrink began this step (the `zone` event's moment), 'closed' when the
 * collapse finished, else null. Allocation-free.
 */
export function stepZone(z: ZoneState, dt: number): 'phase' | 'closed' | null {
  if (z.stage === 'closed' || !(dt > 0)) return null;
  z.stageSec += dt;
  let ev: 'phase' | 'closed' | null = null;
  // a long dt may cross a stage end; the loop keeps the clock exact
  while (!isClosed(z) && z.stageSec >= z.stageLen) {
    z.stageSec -= z.stageLen;
    if (z.stage === 'wait') {
      z.stage = 'shrink';
      z.stageLen = shrinkOf(z.index);
      z.dps = shrinkDps(z.index);
      z.phase = Math.min(ZONE_PHASES.length + 1, z.index + 1);
      ev = 'phase';
    } else {
      z.index++;
      const c = z.circles[z.index];
      z.cur.x = c.x; z.cur.z = c.z; z.cur.r = c.r; z.cur.ceilingY = c.ceilingY;
      if (z.index >= z.circles.length - 1) { z.stage = 'closed'; z.stageSec = 0; z.stageLen = 0; z.dps = ZONE_COLLAPSE.dps; ev = 'closed'; break; }
      z.stage = 'wait';
      z.stageLen = waitOf(z.index);
      z.dps = waitDps(z.index);
    }
  }
  if (z.stage === 'shrink') {
    const a = z.circles[z.index], b = z.circles[z.index + 1];
    const t = ease(Math.min(1, z.stageSec / Math.max(1e-6, z.stageLen)));
    z.cur.x = lerp(a.x, b.x, t); z.cur.z = lerp(a.z, b.z, t); z.cur.r = lerp(a.r, b.r, t); z.cur.ceilingY = lerp(a.ceilingY, b.ceilingY, t);
  }
  return ev;
}

/** Is `p` in the storm: outside the circle (on the ground plane), or above the ceiling? */
export function inStorm(z: ZoneState, p: Vec3): boolean {
  const dx = p.x - z.cur.x, dz = p.z - z.cur.z;
  return dx * dx + dz * dz > z.cur.r * z.cur.r || p.y > z.cur.ceilingY;
}

/** Seconds left in the stage (the HUD's zone timer). */
export const zoneSecondsLeft = (z: ZoneState): number => (z.stage === 'closed' ? 0 : Math.max(0, z.stageLen - z.stageSec));

/** Total seconds from the start until the collapse is complete (a match can never run longer than this plus a beat). */
export function zoneTotalSec(): number {
  let s = 0;
  for (let i = 0; i <= ZONE_PHASES.length; i++) s += waitOf(i) + shrinkOf(i);
  return s;
}

// ── The system ──────────────────────────────────────────────────────────────────────────────────────────────────────

export interface ZoneSystemOptions {
  zone: ZoneState;
  /** Who the storm hurts (fighters and summoned partners; not a fused partner's hidden body). */
  hurts: (a: AdventureActor) => boolean;
  /** A body's damage multiplier (an ability). Default 1. */
  damageMult?: (id: ActorId) => number;
  /** The flight ceiling follows the zone's (the movement system's FlightParams.ceilingY). */
  setCeiling?: (y: number) => void;
}

export interface ZoneSystem extends AdventureSystem {
  readonly zone: ZoneState;
  /** Damage owed and not yet landed, by body (tests). */
  owed(id: ActorId): number;
}

export function createZoneSystem(o: ZoneSystemOptions): ZoneSystem {
  const zone = o.zone;
  const debt = new Map<ActorId, number>();
  const spec = makeHitSpec();
  const ev = { phase: 0, radiusM: 0, center: { x: 0, y: 0, z: 0 } };
  let tickSec = 0;

  return {
    id: 'br.zone',
    zone,
    owed: (id) => debt.get(id) ?? 0,
    step(ctx: AdventureStepContext, dt: number): void {
      const change = stepZone(zone, dt);
      if (change) {
        const next = change === 'phase' ? zone.circles[zone.index + 1] : zone.cur;
        ev.phase = zone.phase; ev.radiusM = next.r; ev.center.x = next.x; ev.center.z = next.z;
        ctx.bus.emit('zone', ev);
      }
      o.setCeiling?.(zone.cur.ceilingY);
      // the debt grows every step; it lands in pulses
      for (const a of ctx.world.actors.values()) {
        if (!(a.stats.hp.cur > 0) || !o.hurts(a)) { if (debt.has(a.id)) debt.delete(a.id); continue; }
        if (!inStorm(zone, a.pos)) continue;
        const mult = o.damageMult ? o.damageMult(a.id) : 1;
        debt.set(a.id, (debt.get(a.id) ?? 0) + zone.dps * mult * dt);
      }
      tickSec += dt;
      if (tickSec + 1e-9 < ZONE_TICK_SEC) return;
      tickSec = 0;
      for (const [id, owe] of debt) {
        const a = ctx.world.actors.get(id);
        if (!a || !(a.stats.hp.cur > 0)) { debt.delete(id); continue; }
        if (a.iframeSec > 0) continue;        // a dodge delays the storm; it never cancels it
        const whole = Math.floor(owe);
        if (whole < 1) continue;
        resetHitSpec(spec);
        spec.base = whole; spec.source = 'zone'; spec.via = 'zone'; spec.blockable = false; spec.parryable = false;
        spec.poiseMult = 0; spec.fromX = a.pos.x; spec.fromZ = a.pos.z;
        applyHit(ctx.bus, ctx.tSec, null, a, spec);
        debt.set(id, owe - whole);
      }
    },
    dispose() { debt.clear(); },
  };
}
