// Personal space in a crowd (2026-09-15).
//
// Every mob steers at the player and nothing looked at another mob, so a wave arrived as one clump of bodies drawn
// through each other — what the scorecard's frame review has charged The Hundred for since rc10. These tests hold the
// correction to what it is: a pair that overlaps is pushed apart, a pair that does not is left alone, and a body on the
// floor is stepped over rather than shoved.
import { describe, expect, it } from 'vitest';
import { Vector3 } from '@babylonjs/core';
import { BODY_SPACING, MobPool, type Mob } from './MobSteering';

/** A stand-in with only what `separate` touches — the real Mob needs a GLB and an animator. */
function fake(x: number, z: number, state: Mob['state'] = 'idle'): Mob {
  const position = new Vector3(x, 0, z);
  return {
    state,
    char: { root: { position, isEnabled: () => true } },
    update: () => false,
  } as unknown as Mob;
}
const gap = (a: Mob, b: Mob) => Math.hypot(
  a.char.root.position.x - b.char.root.position.x,
  a.char.root.position.z - b.char.root.position.z,
);

describe('MobPool personal space', () => {
  const run = (mobs: Mob[]) => { const p = new MobPool(); for (const m of mobs) p.add(m); p.update(1 / 60, Vector3.Zero(), Vector3.Zero()); return p; };

  it('pushes an overlapping pair apart, symmetrically', () => {
    const a = fake(0, 0), b = fake(0.3, 0);
    run([a, b]);
    expect(gap(a, b)).toBeCloseTo(BODY_SPACING, 2);
    expect(a.char.root.position.x).toBeCloseTo(-0.26, 2);   // each moved half the overlap
    expect(b.char.root.position.x).toBeCloseTo(0.56, 2);
  });

  it('leaves a pair that already has room exactly where it is', () => {
    const a = fake(0, 0), b = fake(2, 0);
    run([a, b]);
    expect(a.char.root.position.x).toBe(0);
    expect(b.char.root.position.x).toBe(2);
  });

  it('separates two bodies standing in exactly the same spot', () => {
    const a = fake(1, 1), b = fake(1, 1);
    run([a, b]);
    expect(gap(a, b)).toBeGreaterThan(BODY_SPACING * 0.9);
  });

  it('steps over a body on the floor instead of shoving it', () => {
    const a = fake(0, 0), down = fake(0.2, 0, 'downed');
    run([a, down]);
    expect(down.char.root.position.x).toBe(0.2);
    expect(a.char.root.position.x).toBe(0);
  });

  it('a whole wave arriving on one point ends up spread out', () => {
    const wave = Array.from({ length: 6 }, (_, i) => fake(0.05 * i, 0.05 * i));
    const p = new MobPool();
    for (const m of wave) p.add(m);
    for (let i = 0; i < 60; i++) p.update(1 / 60, Vector3.Zero(), Vector3.Zero());
    for (let i = 0; i < wave.length; i++) {
      for (let j = i + 1; j < wave.length; j++) expect(gap(wave[i], wave[j]), `${i}/${j}`).toBeGreaterThan(BODY_SPACING * 0.8);
    }
  });
});

// IMPROVE (2026-10-06): the pool learned three opt-ins for The Hundred — take a KO'd mob out, move every mob every frame
// (no 15 Hz hops), and chase a per-mob target — and Mob.update stopped allocating. The defaults (football, the yeti) are
// held exactly as they were.
describe('MobPool opt-ins (2026-10-06)', () => {
  const spy = (x = 0, z = 0) => {
    const position = new Vector3(x, 0, z);
    const calls: { dt: number; target: Vector3 }[] = [];
    const m = { state: 'pursuing', char: { root: { position, isEnabled: () => true } }, update: (dt: number, t: Vector3) => { calls.push({ dt, target: t }); return false; } } as unknown as Mob;
    return { m, calls };
  };
  const spread = (n: number) => Array.from({ length: n }, (_, i) => spy(i * 3, 0));

  it('the default still staggers: a quarter of the pool a frame on dt × 4', () => {
    const mobs = spread(8), p = new MobPool();
    for (const s of mobs) p.add(s.m);
    p.update(1 / 60, Vector3.Zero(), Vector3.Zero());
    expect(mobs.filter((s) => s.calls.length === 1)).toHaveLength(2);
    expect(mobs.find((s) => s.calls.length)!.calls[0].dt).toBeCloseTo(4 / 60, 9);
  });

  it('everyFrame moves every mob every frame on the real dt', () => {
    const mobs = spread(8), p = new MobPool({ everyFrame: true });
    for (const s of mobs) p.add(s.m);
    p.update(1 / 60, Vector3.Zero(), Vector3.Zero());
    for (const s of mobs) { expect(s.calls).toHaveLength(1); expect(s.calls[0].dt).toBeCloseTo(1 / 60, 9); }
  });

  it('remove() takes a mob out of the steering and the separation', () => {
    const a = spy(0, 0), b = spy(0.3, 0), p = new MobPool({ everyFrame: true });
    p.add(a.m); p.add(b.m);
    expect(p.remove(b.m)).toBe(true);
    expect(p.remove(b.m)).toBe(false);
    p.update(1 / 60, Vector3.Zero(), Vector3.Zero());
    expect(b.calls).toHaveLength(0);
    expect(b.m.char.root.position.x).toBe(0.3);              // not shoved: it is not in the pool any more
    expect(p.all()).toEqual([a.m]);
  });

  it('remove() keeps the staggered cursor walking the survivors', () => {
    const mobs = spread(8), p = new MobPool();
    for (const s of mobs) p.add(s.m);
    for (let f = 0; f < 3; f++) p.update(1 / 60, Vector3.Zero(), Vector3.Zero());
    p.remove(mobs[7].m); p.remove(mobs[0].m);
    for (let f = 0; f < 3; f++) p.update(1 / 60, Vector3.Zero(), Vector3.Zero());
    for (const s of mobs.slice(1, 7)) expect(s.calls.length, 'every survivor is still visited').toBeGreaterThan(0);
  });

  it('targetOf hands a mob its own target; null falls back to the shared one', () => {
    const a = spy(0, 0), b = spy(5, 0), other = new Vector3(9, 0, 9);
    const p = new MobPool({ everyFrame: true, targetOf: (m) => (m === b.m ? { pos: other, vel: Vector3.Zero() } : null) });
    p.add(a.m); p.add(b.m);
    const shared = new Vector3(1, 0, 1);
    p.update(1 / 60, shared, Vector3.Zero());
    expect(a.calls[0].target).toBe(shared);
    expect(b.calls[0].target).toBe(other);
  });
});

describe('Mob.update without allocations (2026-10-06): the same steering', () => {
  /** The pre-2026-10-06 body of Mob.update's chase, on Vector3s — the reference the rewrite is held to. */
  function reference(me: Vector3, yaw: number, cfg: { maxSpeed: number; turnRateRad: number; containmentBias: number }, dt: number, tp: Vector3, tv: Vector3, cr: number) {
    const lead = Vector3.Distance(me, tp) / Math.max(cfg.maxSpeed, 0.1);
    const predicted = tp.add(tv.scale(Math.min(lead, 0.6)));
    const to = predicted.subtract(me);
    if (cfg.containmentBias > 0) to.x += (tp.x - me.x) * cfg.containmentBias;
    to.y = 0;
    const dist = to.length();
    if (dist < cr) return { contact: true, x: me.x, z: me.z, yaw };
    let d = Math.atan2(to.x, to.z) - yaw;
    while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    const step = cfg.turnRateRad * dt; const y = yaw + Math.max(-step, Math.min(step, d));
    const sp = Math.min(cfg.maxSpeed, dist / dt);
    return { contact: false, x: me.x + Math.sin(y) * sp * dt, z: me.z + Math.cos(y) * sp * dt, yaw: y };
  }
  it('matches the Vector3 reference step for step, contact included', async () => {
    const { Mob, STEERING_PRESETS } = await import('./MobSteering');
    for (const preset of ['striker', 'flanker', 'defender'] as const) {
      const cfg = { ...STEERING_PRESETS[preset], reactionSec: 0 };
      const position = new Vector3(4, 0, -3), rotation = new Vector3(0, 0.4, 0);
      const char = { root: { position, rotation }, animator: { play: () => null, clipNames: new Set<string>() } };
      const mob = new Mob(char as never, cfg, () => {});
      mob.startPursuit();
      const ref = { x: 4, z: -3, yaw: 0.4 };
      const target = new Vector3(0.5, 0, 0.2), vel = new Vector3(1.2, 0, -0.7);
      for (let f = 0; f < 240; f++) {
        const r = reference(new Vector3(ref.x, 0, ref.z), ref.yaw, cfg, 1 / 60, target, vel, 0.9);
        const contact = mob.update(1 / 60, target, vel, 0.9);
        expect(contact, `${preset} frame ${f}`).toBe(r.contact);
        if (r.contact) break;
        ref.x = r.x; ref.z = r.z; ref.yaw = r.yaw;
        expect(position.x).toBeCloseTo(ref.x, 9); expect(position.z).toBeCloseTo(ref.z, 9);
      }
    }
  });
});
