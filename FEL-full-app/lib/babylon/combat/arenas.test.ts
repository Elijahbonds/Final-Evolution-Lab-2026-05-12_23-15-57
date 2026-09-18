// Does every combat mode have three places to fight, and does each place hold a body the way its edge says?
import { describe, it, expect } from 'vitest';
import { COMBAT_ARENAS, COMBAT_MODE_IDS, arenasFor, perimeterWalls, arenaClamp, knockTo, offEdge, hazardAt, insideBy, clampToWalls, ROPES } from './arenas';

describe('the arena registry', () => {
  it('gives every combat mode at least three ready arenas', () => {
    for (const m of COMBAT_MODE_IDS) expect(arenasFor(m).length, m).toBeGreaterThanOrEqual(3);
  });
  it('every wall normal is unit length and points INTO the arena', () => {
    for (const a of COMBAT_ARENAS) for (const w of a.walls) {
      expect(Math.hypot(w.nx, w.nz)).toBeCloseTo(1, 6);
      const mx = (w.a.x + w.b.x) / 2, mz = (w.a.z + w.b.z) / 2;
      expect(insideBy({ x: mx + w.nx * 0.5, z: mz + w.nz * 0.5 }, a.shape), `${a.id} ${w.label}`).toBeGreaterThan(insideBy({ x: mx, z: mz }, a.shape) - 1e-6);
    }
  });
  it('pillars and hazards sit inside the arena', () => {
    for (const a of COMBAT_ARENAS) {
      for (const p of a.pillars) expect(insideBy(p, a.shape), `${a.id} ${p.label}`).toBeGreaterThan(p.r);
      for (const h of a.hazards) expect(insideBy(h, a.shape), `${a.id} ${h.label}`).toBeGreaterThan(0);
    }
  });
  it('a disc perimeter is a closed polygon and a box has four sides', () => {
    expect(perimeterWalls({ kind: 'disc', radius: 5 }, 2, 'w', 12)).toHaveLength(12);
    expect(perimeterWalls({ kind: 'box', halfX: 3, halfZ: 2 }, 2, 'w')).toHaveLength(4);
    const half = perimeterWalls({ kind: 'disc', radius: 5 }, 2, 'w', 16, Math.PI * 0.5, Math.PI * 1.5);
    expect(half).toHaveLength(8);
    for (const w of half) expect((w.a.z + w.b.z) / 2).toBeLessThan(0.01);   // the back half (−z)
  });
});

describe('how an arena holds a body', () => {
  const wall = arenasFor('karate').find((a) => a.edge === 'wall')!;
  const ropes = arenasFor('karate').find((a) => a.edge === 'ropes')!;
  const drop = arenasFor('mixedcombat').find((a) => a.edge === 'drop' && a.walls.length)!;
  const foundry = COMBAT_ARENAS.find((a) => a.id === 'foundry')!;
  it('a wall stops a body at the edge; a drop lets it past', () => {
    const p = { x: 0, z: 40 }; expect(arenaClamp(p, wall)).toBe('edge'); expect(insideBy(p, wall.shape)).toBeGreaterThan(0.25); expect(insideBy(p, wall.shape)).toBeLessThan(0.7);   // inside the circle AND the chord
    const q = { x: 0, z: 40 }; expect(arenaClamp(q, drop)).not.toBe('edge'); expect(offEdge(q, drop)).toBe(true);
    expect(offEdge({ x: 0, z: 40 }, wall)).toBe(false);
  });
  it('a drop arena\'s explicit walls still hold (the rooftop billboards)', () => {
    const p = { x: 0, z: 4.6 }; clampToWalls(p, drop.walls, 0.3); expect(p.z).toBeLessThanOrEqual(drop.walls[0].a.z - 0.3 + 1e-9);
  });
  it('pillars push a body out and a hazard is found by standing in it', () => {
    const pil = foundry.pillars[0]; const p = { x: pil.x + 0.1, z: pil.z }; expect(arenaClamp(p, foundry)).toBe('pillar'); expect(Math.hypot(p.x - pil.x, p.z - pil.z)).toBeCloseTo(pil.r + 0.3, 6);
    expect(hazardAt({ x: 0, z: 4.4 }, foundry)?.kind).toBe('fire');
    expect(hazardAt({ x: 0, z: 0 }, foundry)).toBeNull();
  });
  it('the ropes throw an over-shoved body back in; a wall just stops it', () => {
    const r = knockTo({ x: 0, z: 4 }, { x: 0, z: 9 }, ropes);
    expect(r.rebound).toBe(true); expect(r.z).toBeLessThan(ropes.shape.kind === 'disc' ? ropes.shape.radius - 0.3 - 0.5 : 0);
    expect(insideBy(r, ropes.shape)).toBeLessThanOrEqual(0.3 + ROPES.maxRebound + 1e-9);
    const w = knockTo({ x: 0, z: 4 }, { x: 0, z: 9 }, wall); expect(w.rebound).toBe(false); expect(insideBy(w, wall.shape)).toBeCloseTo(0.3, 6);
    const d = knockTo({ x: 0, z: 4 }, { x: 4, z: 0 }, drop); expect(d.rebound).toBe(false);
  });
});
