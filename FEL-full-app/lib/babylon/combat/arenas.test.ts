// Does every combat mode have three places to fight, and does each place hold a body the way its edge says?
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  COMBAT_ARENAS, COMBAT_MODE_IDS, arenasFor, perimeterWalls, arenaClamp, knockTo, offEdge, hazardAt, insideBy, clampToWalls, ROPES,
  ARENA_SCALE, scaleArena, arenaReach, edgeAlong, crowdRadius, crowdRing, CROWD_GAP, CROWD_PHASE, CROWD_CORNER_CLEAR, spawnRadius,
  showdownGateDist, SHOWDOWN_GATE, type CombatArena,
} from './arenas';
import { VENUE_PROP_SETS } from '../visual/venuePropSets';
import { SPECIAL_ATTACK } from '../core/FightCore';

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
    // test changed (2026-10-06): the body stood at a literal z 4.6, 0.4 m past the billboard at 4.2; ARENA_SCALE moved the
    // billboard to 5.25, which would have left the body INSIDE it and the assertion passing without a clamp. Placed off
    // the wall's own z now, and the push is asserted to have happened.
    const p = { x: 0, z: drop.walls[0].a.z + 0.4 }; expect(clampToWalls(p, drop.walls, 0.3)).toBe(true); expect(p.z).toBeLessThanOrEqual(drop.walls[0].a.z - 0.3 + 1e-9);
  });
  it('pillars push a body out and a hazard is found by standing in it', () => {
    const pil = foundry.pillars[0]; const p = { x: pil.x + 0.1, z: pil.z }; expect(arenaClamp(p, foundry)).toBe('pillar'); expect(Math.hypot(p.x - pil.x, p.z - pil.z)).toBeCloseTo(pil.r + 0.3, 6);
    expect(hazardAt({ x: foundry.hazards[0].x, z: foundry.hazards[0].z }, foundry)?.kind).toBe('fire');   // test changed (2026-10-06): was the literal (0, 4.4) — the pit's authored spot; ARENA_SCALE moved it to 5.5
    expect(hazardAt({ x: 0, z: 0 }, foundry)).toBeNull();
  });
  it('the ropes throw an over-shoved body back in; a wall just stops it', () => {
    // test changed (2026-10-06): the shoves landed at a literal z 9 — 2.6 m past the 6.4 cage and 1.5 m past the 7.5
    // gauntlet. ARENA_SCALE put the gauntlet's ring at 9.375, so z 9 was a shove that stayed INSIDE and asserted nothing
    // about the wall. The same overshoots, measured off each edge now.
    const edge = (a: typeof wall) => (a.shape.kind === 'disc' ? a.shape.radius : a.shape.halfZ);
    const r = knockTo({ x: 0, z: 4 }, { x: 0, z: edge(ropes) + 2.6 }, ropes);
    expect(r.rebound).toBe(true); expect(r.z).toBeLessThan(ropes.shape.kind === 'disc' ? ropes.shape.radius - 0.3 - 0.5 : 0);
    expect(insideBy(r, ropes.shape)).toBeLessThanOrEqual(0.3 + ROPES.maxRebound + 1e-9);
    const w = knockTo({ x: 0, z: 4 }, { x: 0, z: edge(wall) + 1.5 }, wall); expect(w.rebound).toBe(false); expect(insideBy(w, wall.shape)).toBeCloseTo(0.3, 6);
    const d = knockTo({ x: 0, z: 4 }, { x: 4, z: 0 }, drop); expect(d.rebound).toBe(false);
  });
});

// ── ARENA_SCALE (2026-10-06, owner: "Make the maps in the fighting modes a little bigger. They feel too small.") ────────
// One number grows every arena. These pin what it grew, hold everything that has to follow the size to the size, and
// keep the things that must stay body-sized at body size.
const byId = (id: string): CombatArena => COMBAT_ARENAS.find((a) => a.id === id)!;
const shapeOf = (a: CombatArena) => (a.shape.kind === 'disc' ? { r: a.shape.radius } : { hx: a.shape.halfX, hz: a.shape.halfZ });

describe('ARENA_SCALE — every fighting floor a quarter bigger', () => {
  it('is 1.25, and every arena is its authored size times it', () => {
    expect(ARENA_SCALE).toBe(1.25);
    const want: Record<string, { r: number } | { hx: number; hz: number }> = {
      gauntlet: { r: 9.375 }, dojo: { hx: 6.25, hz: 6.25 }, cage: { r: 8 }, foundry: { hx: 8.75, hz: 7.5 },
      pit: { r: 7.75 }, rooftop: { hx: 7.5, hz: 5.25 }, cliff: { r: 8.125 },
    };
    expect(COMBAT_ARENAS.map((a) => a.id).sort()).toEqual(Object.keys(want).sort());
    for (const a of COMBAT_ARENAS) {
      const got = shapeOf(a), w = want[a.id];
      for (const k of Object.keys(w) as Array<keyof typeof got>) expect(got[k], `${a.id} ${String(k)}`).toBeCloseTo((w as Record<string, number>)[k], 9);
    }
  });
  it('grows the walls, the pillars\' and pits\' places, the lamps and the floor — and nothing a body measures itself against', () => {
    const f = byId('foundry');
    expect(f.walls.map((w) => w.height)).toEqual([3.2, 3.2, 3.2, 3.2]);
    expect(f.pillars.map((p) => [p.x, p.z, p.r, p.h])).toEqual([[4.25, 3.25, 0.5, 3.2], [-4.25, 3.25, 0.5, 3.2], [4.25, -3.25, 0.5, 3.2], [-4.25, -3.25, 0.5, 3.2]]);
    expect(f.hazards.map((h) => [h.x, h.z, h.r])).toEqual([[0, 5.5, 1.1], [0, -5.5, 1.1]]);
    expect(COMBAT_ARENAS.map((a) => [a.id, a.look.floorHalf])).toEqual([['gauntlet', 15], ['dojo', 15], ['cage', 15], ['foundry', 17.5], ['pit', 16.25], ['rooftop', 16.25], ['cliff', 16.25]]);
    // the backdrop walls and banners stood past the floor already and stay where they were; the lamps flank the edge and move
    expect(byId('gauntlet').look.props.map((p) => `${p.kind}@${p.position[0]},${p.position[2]}`)).toEqual(['wall@0,-14', 'lamp@8.75,-6.25', 'lamp@-8.75,-6.25', 'banner@0,-13.6']);
    // every wall still lies ON its edge (a disc's polygon vertices on the circle, a box's sides on the box)
    for (const a of COMBAT_ARENAS) for (const w of a.walls) for (const v of [w.a, w.b]) expect(Math.abs(insideBy(v, a.shape)), `${a.id} ${w.label}`).toBeLessThan(1e-9);
  });
  it('scaleArena is linear: a scale of 1 changes nothing, and two scales compose', () => {
    for (const a of COMBAT_ARENAS) {
      expect(scaleArena(a, 1)).toEqual(a);
      const twice = scaleArena(scaleArena(a, 2), 0.5);
      expect(arenaReach(twice)).toBeCloseTo(arenaReach(a), 9);
      expect(twice.walls.map((w) => [w.a.x, w.a.z])).toEqual(a.walls.map((w) => [expect.closeTo(w.a.x, 9), expect.closeTo(w.a.z, 9)]));
    }
  });
});

describe('everything that follows the size follows it', () => {
  it('every arena stands inside the floor its venue paints, with room for the fight camera behind the edge', () => {
    // fight-balance-tests D holds the exact camera pullback per mode; this is the plain margin: 5.5 m of floor past the
    // furthest point a body can reach (the tightest is the gauntlet, 9.375 inside 15 — it was 4.5 at the old size)
    for (const a of COMBAT_ARENAS) expect(a.look.floorHalf - arenaReach(a), a.id).toBeGreaterThanOrEqual(5.5);
  });
  it('the gauntlet\'s painted ring is drawn on its clamp (NexusWebScene paints it at a fixed fraction of the mat)', () => {
    const src = readFileSync(join(__dirname, '../nexus/NexusWebScene.ts'), 'utf8');
    const m = src.match(/case 'ring':[\s\S]*?arc\(cx, cy, S \* ([0-9.]+)\)/);
    expect(m, 'the ring marking\'s fraction was not found in NexusWebScene — re-point this read, do not drop it').toBeTruthy();
    const frac = Number(m![1]);
    const ringed = COMBAT_ARENAS.filter((a) => a.look.ground.markings === 'ring');
    expect(ringed.length).toBeGreaterThan(0);
    for (const a of ringed) {
      expect(a.shape.kind, a.id).toBe('disc');
      if (a.shape.kind === 'disc') expect(frac * a.look.floorHalf * 2, `${a.id}: the ring is painted at ${frac * a.look.floorHalf * 2} m, the clamp is ${a.shape.radius} m`).toBeCloseTo(a.shape.radius, 6);
    }
  });
  it('every lamp and banner, and every prop of the arena\'s dressing set, stands outside the arena', () => {
    // the dojo set's column ring stood at 9.5 m — inside the grown gauntlet's 9.375 m stone ring (venuePropSets moved it to 11)
    const inside: string[] = [];
    for (const a of COMBAT_ARENAS) {
      for (const p of a.look.props) if (insideBy({ x: p.position[0], z: p.position[2] }, a.shape) > -0.6) inside.push(`${a.id}: ${p.kind} at ${p.position[0]},${p.position[2]}`);
      for (const p of a.look.propSet ? VENUE_PROP_SETS[a.look.propSet] ?? [] : []) if (insideBy({ x: p.at[0], z: p.at[2] }, a.shape) > -1) inside.push(`${a.id}: ${a.look.propSet} ${p.model} at ${p.at[0].toFixed(2)},${p.at[2].toFixed(2)}`);
    }
    expect(inside).toEqual([]);
  });
  it('every onlooker ring stands outside its arena, on its floor, and clear of the dressing', () => {
    const modes = Object.keys(CROWD_GAP) as Array<keyof typeof CROWD_GAP>;
    const bad: string[] = [];
    for (const m of modes) for (const a of arenasFor(m)) {
      const ring = crowdRing(a, CROWD_GAP[m], 14, CROWD_PHASE[m]);
      expect(ring).toHaveLength(14);
      const props = [
        ...a.look.props.map((p) => ({ x: p.position[0], z: p.position[2], n: p.kind })),
        ...(a.look.propSet ? VENUE_PROP_SETS[a.look.propSet] ?? [] : []).map((p) => ({ x: p.at[0], z: p.at[2], n: p.model })),
      ];
      for (const c of ring) {
        if (-insideBy(c, a.shape) < Math.min(CROWD_GAP[m], CROWD_CORNER_CLEAR)) bad.push(`${m}/${a.id}: an onlooker ${(-insideBy(c, a.shape)).toFixed(2)} m off the edge`);
        if (Math.max(Math.abs(c.x), Math.abs(c.z)) > a.look.floorHalf - 0.5) bad.push(`${m}/${a.id}: an onlooker off the floor at ${c.x.toFixed(1)},${c.z.toFixed(1)}`);
        // 0.6 m: the closest an onlooker stood to a prop at the old size (Mixed's gallery by a dojo column)
        for (const p of props) if (Math.hypot(c.x - p.x, c.z - p.z) < 0.6) bad.push(`${m}/${a.id}: an onlooker inside the ${p.n} at ${p.x},${p.z}`);
      }
    }
    expect(bad).toEqual([]);
  });
  it('a crowd ring on a box clears its corner (the old max-half-extent ring stood inside the grown Foundry)', () => {
    const f = byId('foundry');
    const old = Math.max((f.shape as { halfX: number }).halfX, (f.shape as { halfZ: number }).halfZ) + CROWD_GAP.karate_vs;
    expect(old).toBeLessThan(arenaReach(f));   // the defect this guards: a ring that passes through the corners
    expect(crowdRadius(f, CROWD_GAP.karate_vs)).toBeGreaterThanOrEqual(arenaReach(f) + CROWD_CORNER_CLEAR);
    expect(crowdRadius(byId('gauntlet'), CROWD_GAP.karate)).toBeCloseTo(9.375 + 2.7, 9);   // a disc keeps radius + gap
  });
  it('spawn rings stay inside the arena and fighters still start in reach of each other', () => {
    for (const a of COMBAT_ARENAS) {
      const sr = spawnRadius(a);
      expect(sr, a.id).toBeGreaterThan(0);
      for (let i = 0; i < 16; i++) {
        const t = (i / 16) * Math.PI * 2, p = { x: Math.sin(t) * sr, z: Math.cos(t) * sr };
        arenaClamp(p, a, 0.6);
        expect(insideBy(p, a.shape), `${a.id} spawn ${i}`).toBeGreaterThan(0.5);
      }
      // the two-fighter modes start 4.4 m (Karate VS / Mixed ±2.2), 4.8 m (Duel ±2.4), 8 m (Showdown ±4) apart on z —
      // fixed, not scaled, so a bigger floor never opens the gap; the spots are on the floor in every arena
      for (const z of [2.2, 2.4, 4]) for (const s of [1, -1]) expect(insideBy({ x: 0, z: z * s }, a.shape), `${a.id} start z ${z * s}`).toBeGreaterThan(0.5);
    }
  });
});

describe('the Showdown gate and the ring-outs, at the new size', () => {
  it('the gate stands on each Showdown arena\'s own −z edge, where the rival can be driven into it', () => {
    for (const a of arenasFor('showdown')) {
      const d = showdownGateDist(a);
      expect(d, a.id).toBeCloseTo(edgeAlong(a, { x: 0, z: -1 }) - SHOWDOWN_GATE.inset, 9);
      // a rival driven along −z as far as the arena lets it (the mode's own arenaClamp, inset 0.3) is in breaking range
      const p = { x: 0, z: -100 };
      for (let k = 0; k < 4; k++) arenaClamp(p, a);
      expect(p.z, `${a.id}: the rival stops at z ${p.z.toFixed(2)}, the gate breaks at ${(-d + SHOWDOWN_GATE.breakM).toFixed(2)}`).toBeLessThanOrEqual(-d + SHOWDOWN_GATE.breakM);
      expect(insideBy({ x: 0, z: -d }, a.shape), a.id).toBeGreaterThan(0);   // in front of the wall, not behind it
    }
    // the cage's −z side is a CHORD of its octagon (7.39 m), not its 8 m circle — the gate stands on the rope
    expect(edgeAlong(byId('cage'), { x: 0, z: -1 })).toBeCloseTo(8 * Math.cos(Math.PI / 8), 6);
  });
  it('Showdown\'s floor fallback box still holds every Showdown arena', () => {
    const src = readFileSync(join(__dirname, '../modes/ShowdownMode.ts'), 'utf8');
    const m = src.match(/const ARENA_HALF = ([0-9.]+)/);
    expect(m, 'ShowdownMode ARENA_HALF was not found — re-point this read, do not drop it').toBeTruthy();
    const half = Number(m![1]);
    for (const a of arenasFor('showdown')) {
      const ex = a.shape.kind === 'disc' ? a.shape.radius : Math.max(a.shape.halfX, a.shape.halfZ);
      expect(ex, a.id).toBeLessThan(half);
    }
  });
  it('on every DROP arena a fighter at the centre is rung out by three DRAGON shoves toward the nearest open edge', () => {
    // At the old size it was two (6.2 / 6.0 / 6.5 m against a 3.4 m shove); the bigger floor makes it three. This holds
    // the scale to a size where the ring-out stays a thing a round can reach, and uses the real knockTo (walls, pillars).
    for (const a of COMBAT_ARENAS.filter((x) => x.edge === 'drop')) {
      // the fewest shoves over any edge, trying 32 directions: a billboard or the cliff face stops some of them (knockTo)
      let fewest = Infinity;
      for (let i = 0; i < 32; i++) {
        const t = (i / 32) * Math.PI * 2, d = { x: Math.sin(t), z: Math.cos(t) };
        let p = { x: 0, z: 0 }, shoves = 0;
        while (!offEdge(p, a) && shoves < 6) { const q = knockTo(p, { x: p.x + d.x * SPECIAL_ATTACK.knockback, z: p.z + d.z * SPECIAL_ATTACK.knockback }, a); p = { x: q.x, z: q.z }; shoves++; }
        if (offEdge(p, a)) fewest = Math.min(fewest, shoves);
      }
      expect(fewest, `${a.id}: the fewest DRAGON shoves (${SPECIAL_ATTACK.knockback} m) from the centre over an open edge`).toBeLessThanOrEqual(3);
    }
  });
});
