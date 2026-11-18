// Phase F-lite (lane/coast-f): the zone grows by the 2 × 2 block past Reef Rock (coast.zoneGrow): open sea, a sandbank you can
// wade from Reef Rock, and Gull Key. Walked on the real host; with the knob off the zone is phase A's.
import { afterEach, describe, expect, it } from 'vitest';
import { AdventureHost } from '@/lib/babylon/adventure/host/AdventureHost';
import { emptyAdventureSave } from '@/lib/babylon/adventure/contracts';
import { COAST_ZONE_GROW, GROW, GULL_KEY, inZoneAt, ISLANDS, pieceAt, SANDBANK, setZoneGrow, terrainY, walkable, zoneIslands, zonePieces, zoneProps } from './zoneLayout';
import { buildCoastWorld, WaterEdge } from './zoneWorld';

afterEach(() => setZoneGrow(true));

describe('the grown block past Reef Rock', () => {
  it('ships on (1): four more pieces, all north-west of Reef Rock, Gull Key and the sandbank in them', () => {
    expect(COAST_ZONE_GROW).toBe(1);
    const grown = zonePieces().filter((p) => p.i < GROW.cols);
    expect(grown).toHaveLength(4);
    for (const p of grown) { expect(p.j).toBeGreaterThanOrEqual(GROW.fromRow); expect(p.rect.maxX).toBeLessThanOrEqual(ISLANDS[1].at[0] - 24); }
    const [gi, gj] = pieceAt(GULL_KEY.at[0], GULL_KEY.at[1]);
    expect(gi).toBeLessThan(GROW.cols); expect(gj).toBeGreaterThanOrEqual(GROW.fromRow);
    // mostly open sea: by area, water you cannot stand in (the islet's and the sandbank's shelves reach into every one of the four)
    let deep = 0, n = 0;
    for (const p of grown) for (let z = p.rect.minZ + 2; z < p.rect.maxZ; z += 4) for (let x = p.rect.minX + 2; x < p.rect.maxX; x += 4) { n++; if (!walkable(x, z)) deep++; }
    expect(deep / n).toBeGreaterThan(0.7);
    expect(terrainY(GULL_KEY.at[0], GULL_KEY.at[1])).toBeGreaterThan(1);   // dry land
    expect(zoneIslands().map((i) => i.id)).toContain('gullkey');
    expect(zoneProps().some((p) => Math.hypot(p.x - GULL_KEY.at[0], p.z - GULL_KEY.at[1]) < GULL_KEY.radius)).toBe(true);   // dressed
  });

  it('the sandbank is wadeable all the way; either side of it is deep water you cannot stand in', () => {
    const [ax, az] = SANDBANK.from, [bx, bz] = SANDBANK.to;
    for (let k = 0; k <= 40; k++) { const x = ax + ((bx - ax) * k) / 40, z = az + ((bz - az) * k) / 40; expect(walkable(x, z)).toBe(true); }
    const nx = -(bz - az), nz = bx - ax, n = Math.hypot(nx, nz), mx = (ax + bx) / 2, mz = (az + bz) / 2;
    expect(walkable(mx + (nx / n) * 20, mz + (nz / n) * 20)).toBe(false);
    expect(walkable(mx - (nx / n) * 20, mz - (nz / n) * 20)).toBe(false);
  });

  it('outside the zone\'s footprint nothing is walkable (the west columns south of the block are not zone)', () => {
    expect(inZoneAt(-250, -100)).toBe(false);
    expect(inZoneAt(GULL_KEY.at[0], GULL_KEY.at[1])).toBe(true);
  });

  it('on the real host: from Reef Rock along the sandbank onto Gull Key, never in deep water', () => {
    const start = { x: ISLANDS[1].at[0] - 10, y: terrainY(ISLANDS[1].at[0] - 10, ISLANDS[1].at[1]), z: ISLANDS[1].at[1] };
    const world = buildCoastWorld({ spawn: { pos: start, yaw: 0 } });
    const host = new AdventureHost({ world: world.source, save: emptyAdventureSave(0), playerSpawn: world.spawn, band: null });
    const edge = new WaterEdge(world.spawn.pos);
    const route: Array<[number, number]> = [[SANDBANK.from[0], SANDBANK.from[1]], [SANDBANK.to[0], SANDBANK.to[1]], [GULL_KEY.at[0], GULL_KEY.at[1]]];
    let target = route[0], deep = 0;
    host.setInputSource(host.playerId, (out) => { const p = host.player.pos; out.camYaw = Math.atan2(target[0] - p.x, target[1] - p.z); out.move.x = 0; out.move.y = 1; });
    const reached: boolean[] = [];
    for (const wp of route) {
      target = wp;
      let ok = false;
      for (let f = 0; f < 60 * 30; f++) {
        host.frame(1 / 30); edge.hold(host.player);
        if (!walkable(host.player.pos.x, host.player.pos.z)) deep++;
        if (Math.hypot(host.player.pos.x - wp[0], host.player.pos.z - wp[1]) < 2) { ok = true; break; }
      }
      reached.push(ok);
    }
    expect(reached).toEqual([true, true, true]);
    expect(deep).toBe(0);
    expect(host.player.pos.y).toBeGreaterThan(1);   // standing on Gull Key's hill
  });

  it('coast.zoneGrow 0: phase A\'s zone — no Gull Key, no sandbank, the block not zone', () => {
    setZoneGrow(false);
    expect(zonePieces()).toHaveLength(36);
    expect(walkable(GULL_KEY.at[0], GULL_KEY.at[1])).toBe(false);
    expect(terrainY(GULL_KEY.at[0], GULL_KEY.at[1])).toBeLessThan(-5);
    const mx = (SANDBANK.from[0] + SANDBANK.to[0]) / 2, mz = (SANDBANK.from[1] + SANDBANK.to[1]) / 2;
    expect(walkable(mx, mz)).toBe(false);
    expect(zoneIslands().map((i) => i.id)).not.toContain('gullkey');
  });
});
