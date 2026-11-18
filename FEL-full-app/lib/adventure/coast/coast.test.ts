// THE COAST & ISLANDS, phase A (lane/coast-islands): the zone shell held headless — the ground you stand on, the way across to
// both islands on the REAL Adventure host and movement sim, the water's edge, the streaming rings, the doors.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { AdventureHost } from '@/lib/babylon/adventure/host/AdventureHost';
import { emptyAdventureSave } from '@/lib/babylon/adventure/contracts';
import { stripComments, sourceFiles } from '@/lib/testing/sourceScan';
import { ENABLED_BABYLON_MODES, MODES } from '@/lib/babylon/modes/registry';
import {
  BOAT_AT, DECKS, ISLANDS, PIECE_M, PROP_MODELS, SANDBAR, SEA_Y, WADE_DEPTH, ZONE_COLS, ZONE_ROWS, ZONE_SPOTS, ZoneStreamer,
  arrivalSpawn, deckAt, mainlandShoreX, pieceAt, pieceRect, spotAtZone, surfaceY, terrainY, tierFor, walkable, zoneProps, zonePieces,
  COAST_STREAM_FULL, COAST_STREAM_KEEP, COAST_STREAM_LOD,
} from './zoneLayout';
import { buildCoastWorld, coastGroundY, DEEP_WALL_Y, WaterEdge } from './zoneWorld';
import { coastEntryHref, veniceReturnHref, COAST_ROUTE } from './door';
import { COARSE_DIV, FINE_DIV, drawnY } from './zoneView';

const RINGS = { full: COAST_STREAM_FULL, lod: COAST_STREAM_LOD, keep: COAST_STREAM_KEEP };

describe('the zone: the ground', () => {
  it('is 6 × 6 pieces of 64 m, mostly sea, with land and shore pieces', () => {
    const ps = zonePieces();
    expect(ps.length).toBe(36);
    expect(ZONE_COLS * PIECE_M).toBe(384);
    const sea = ps.filter((p) => p.kind === 'sea').length, land = ps.filter((p) => p.kind === 'land').length;
    expect(sea).toBeGreaterThanOrEqual(4);    // whole open-sea pieces draw nothing of their own
    expect(land).toBeGreaterThanOrEqual(6);   // the mainland's back strip
    // the plan: "≈ 60 % sea" — by area, water you cannot stand in
    let deep = 0, n = 0;
    for (let z = -190; z < 192; z += 4) for (let x = -190; x < 192; x += 4) { n++; if (!walkable(x, z)) deep++; }
    expect(deep / n).toBeGreaterThan(0.55);
  });

  it('you arrive on the dock, above the water, outside the boat spot, facing Palm Key', () => {
    const s = arrivalSpawn();
    expect(deckAt(s.pos.x, s.pos.z)?.id).toBe('dock');
    expect(s.pos.y).toBeGreaterThan(SEA_Y);
    expect(walkable(s.pos.x, s.pos.z)).toBe(true);
    expect(spotAtZone(s.pos.x, s.pos.z)).toBeNull();
    const isl = ISLANDS[0];
    expect(Math.abs(s.yaw - Math.atan2(isl.at[0] - s.pos.x, isl.at[1] - s.pos.z))).toBeLessThan(1e-9);
  });

  it('the boat back to Venice is on the dock, beside the boat', () => {
    const v = ZONE_SPOTS.find((x) => x.kind === 'venice')!;
    expect(deckAt(v.at[0], v.at[1])?.id).toBe('dock');
    expect(Math.hypot(v.at[0] - BOAT_AT[0], v.at[1] - BOAT_AT[1])).toBeLessThan(10);
  });

  it('the beach runs down into the sea, the islands rise out of it, the open sea is deep', () => {
    expect(terrainY(mainlandShoreX(0) + 30, 0)).toBeGreaterThan(1);
    expect(Math.abs(terrainY(mainlandShoreX(0), 0))).toBeLessThan(0.05);
    for (const isl of ISLANDS) expect(terrainY(isl.at[0], isl.at[1])).toBeGreaterThan(isl.beach + isl.hill * 0.6);
    expect(terrainY(-180, -180)).toBeLessThan(-5);
    expect(walkable(-180, -180)).toBe(false);
    expect(coastGroundY(-180, -180)).toBe(DEEP_WALL_Y);
  });

  it('the sandbar is wadeable all the way, and the water either side of it is not', () => {
    const [ax, az] = SANDBAR.from, [bx, bz] = SANDBAR.to;
    for (let t = 0; t <= 1; t += 0.02) expect(walkable(ax + (bx - ax) * t, az + (bz - az) * t), `t ${t}`).toBe(true);
    const mx = (ax + bx) / 2, mz = (az + bz) / 2, nx = -(bz - az), nz = bx - ax, nl = Math.hypot(nx, nz);
    expect(walkable(mx + (nx / nl) * 20, mz + (nz / nl) * 20)).toBe(false);
    expect(surfaceY(mx, mz)).toBeGreaterThanOrEqual(SEA_Y - WADE_DEPTH);
  });

  it('the deep-water wall is above every deck and shallow by more than the sim\'s 0.45 m step', () => {
    for (const d of DECKS) expect(DEEP_WALL_Y - d.y).toBeGreaterThan(0.45);
    expect(DEEP_WALL_Y - (SEA_Y - WADE_DEPTH)).toBeGreaterThan(0.45);
  });
});

/** Run the real host's player toward each waypoint in turn (the stick held forward, the camera's yaw on the target). */
function walkRoute(route: [number, number][], opts: { secPerLeg?: number } = {}) {
  const world = buildCoastWorld();
  const host = new AdventureHost({ world: world.source, save: emptyAdventureSave(0), playerSpawn: world.spawn, band: null });
  const edge = new WaterEdge(world.spawn.pos);
  let target = route[0];
  host.setInputSource(host.playerId, (out) => {
    const p = host.player.pos;
    out.camYaw = Math.atan2(target[0] - p.x, target[1] - p.z);
    out.move.x = 0; out.move.y = 1;
  });
  const reached: boolean[] = [];
  let lowest = Infinity, deepFrames = 0;
  for (const wp of route) {
    target = wp;
    let ok = false;
    for (let f = 0; f < (opts.secPerLeg ?? 40) * 30; f++) {
      host.frame(1 / 30);
      edge.hold(host.player);
      const p = host.player.pos;
      lowest = Math.min(lowest, p.y);
      if (!walkable(p.x, p.z)) deepFrames++;
      if (Math.hypot(p.x - wp[0], p.z - wp[1]) < 2) { ok = true; break; }
    }
    reached.push(ok);
  }
  return { host, edge, reached, lowest, deepFrames };
}

describe('the zone on the real Adventure host: you can walk to both islands', () => {
  const sx = mainlandShoreX(24) + 16, bx = mainlandShoreX(-36) + 9;
  const reef = ISLANDS[1];
  const route: [number, number][] = [
    [sx, 24],                  // off the dock onto the beach
    [bx, -36],                 // down the beach to the bridge
    [-20, -36],                // over the boardwalk bridge onto Palm Key
    [SANDBAR.from[0], SANDBAR.from[1]],   // across Palm Key to the sandbar
    [SANDBAR.to[0], SANDBAR.to[1]],       // wade the sandbar
    [reef.at[0], reef.at[1] + 6],         // up onto Reef Rock
  ];

  it('dock → beach → bridge → Palm Key → sandbar → Reef Rock, every leg reached, never in deep water', () => {
    const r = walkRoute(route);
    expect(r.reached).toEqual(route.map(() => true));
    expect(r.deepFrames).toBe(0);
    expect(r.edge.turnedBack).toBe(0);
    expect(r.lowest).toBeGreaterThanOrEqual(SEA_Y - WADE_DEPTH - 0.05);
    r.host.dispose();
  });

  it('running off the end of the dock stops at the deep water (the wall), not in it', () => {
    const d = DECKS[0];
    const r = walkRoute([[d.minX - 30, 24]], { secPerLeg: 4 });
    expect(r.reached).toEqual([false]);
    const p = r.host.player.pos;
    expect(walkable(p.x, p.z)).toBe(true);
    expect(p.x).toBeGreaterThan(d.minX - 1);
    r.host.dispose();
  });

  it('a jump off the side of the dock is turned back by the water\'s edge', () => {
    const world = buildCoastWorld();
    const host = new AdventureHost({ world: world.source, save: emptyAdventureSave(0), playerSpawn: world.spawn, band: null });
    const edge = new WaterEdge(world.spawn.pos);
    let f = 0;
    host.setInputSource(host.playerId, (out) => { out.camYaw = 0; out.move.x = 0; out.move.y = 1; out.jump = f % 20 === 0; out.jumpHeld = true; });
    let deep = 0;
    for (; f < 120; f++) { host.frame(1 / 30); edge.hold(host.player); if (!walkable(host.player.pos.x, host.player.pos.z)) deep++; }
    expect(deep).toBe(0);
    expect(walkable(host.player.pos.x, host.player.pos.z)).toBe(true);
    host.dispose();
  });

  it('CONTROL: with the water\'s edge off, the same jump does end over deep water (so the rule is what holds it)', () => {
    const world = buildCoastWorld();
    const host = new AdventureHost({ world: world.source, save: emptyAdventureSave(0), playerSpawn: world.spawn, band: null });
    const edge = new WaterEdge(world.spawn.pos);
    let f = 0;
    host.setInputSource(host.playerId, (out) => { out.camYaw = 0; out.move.x = 0; out.move.y = 1; out.jump = f % 20 === 0; out.jumpHeld = true; });
    let deep = 0;
    for (; f < 120; f++) { host.frame(1 / 30); edge.hold(host.player, false); if (!walkable(host.player.pos.x, host.player.pos.z)) deep++; }
    expect(deep).toBeGreaterThan(0);
    host.dispose();
  });
});

describe('streaming the 64 m pieces', () => {
  it('the rings are the phone plan: the 3 × 3 at full, the 5 × 5 at LOD, one piece of hysteresis', () => {
    expect(RINGS).toEqual({ full: 1, lod: 2, keep: 1 });
    expect(tierFor(2, 2, 2, 2, RINGS)).toBe('full');
    expect(tierFor(3, 3, 2, 2, RINGS)).toBe('full');
    expect(tierFor(4, 2, 2, 2, RINGS)).toBe('lod');
    expect(tierFor(5, 2, 2, 2, RINGS)).toBe('far');
  });

  it('arriving: 9 full, 16 LOD, the rest far (an inner piece)', () => {
    const s = new ZoneStreamer(RINGS);
    expect(s.step(2, 2).length).toBeGreaterThan(0);
    expect(s.count('full')).toBe(9);
    expect(s.count('lod')).toBe(16);
    expect(s.count('far')).toBe(11);
    expect(s.step(2, 2)).toEqual([]);   // same piece: nothing changes
  });

  it('hysteresis: one piece over and back changes nothing on the way back; two pieces over lowers the trailing edge', () => {
    const s = new ZoneStreamer(RINGS);
    s.step(2, 2);
    s.step(3, 2);
    expect(s.tiers.get('1,2')).toBe('full');   // two out, kept by the band
    expect(s.step(2, 2)).toEqual([]);          // back: every piece already holds what it wants
    s.step(3, 2); s.step(4, 2);
    expect(s.tiers.get('1,2')).toBe('lod');    // three out: lowered
  });

  it('a fine piece and a coarse piece draw their shared edge at the same heights (no cracks)', () => {
    for (let j = 0; j < ZONE_ROWS; j++) for (let i = 0; i < ZONE_COLS - 1; i++) {
      const a = pieceRect(i, j), b = pieceRect(i + 1, j);
      for (let k = 0; k <= FINE_DIV; k++) {
        const z = a.minZ + (k * PIECE_M) / FINE_DIV;
        expect(drawnY(a.maxX, z, a)).toBeCloseTo(drawnY(b.minX, z, b), 9);
      }
      // and the coarse samples are the fine edge's own points
      for (let k = 0; k <= COARSE_DIV; k++) { const z = a.minZ + (k * PIECE_M) / COARSE_DIV; expect(drawnY(a.maxX, z, a)).toBeCloseTo(terrainY(a.maxX, z), 9); }
    }
  });
});

describe('the dressing', () => {
  it('every prop stands on the ground of its own piece, off the decks, and names a model the zone loads', () => {
    const ids = new Set(PROP_MODELS.map((m) => m.id));
    const props = zoneProps();
    expect(props.length).toBeGreaterThan(40);
    for (const p of props) {
      expect(ids.has(p.model), p.model).toBe(true);
      expect(deckAt(p.x, p.z)).toBeNull();
      expect(p.y).toBeCloseTo(terrainY(p.x, p.z), 9);
      const [i, j] = pieceAt(p.x, p.z);
      expect(p.piece).toBe(`${i},${j}`);
    }
  });

  it('uses only shipped art: the Kenney nature kit (CC0), files that exist', () => {
    const pub = path.resolve(__dirname, '../../../public');
    for (const m of PROP_MODELS) {
      const f = m.kit === 'meshy' ? path.join(pub, 'models/meshy', m.file) : path.join(pub, 'models/props/nature', m.file);
      expect(fs.existsSync(f), f).toBe(true);
    }
  });
});

describe('the doors', () => {
  it('Venice opens the zone with where it left from; the boat back goes to that Venice spot', () => {
    expect(coastEntryHref()).toBe('/play/coast?from=venice&spot=pier.end');
    expect(veniceReturnHref('')).toBe('/play/venice?spot=pier.end');
    expect(veniceReturnHref('?from=venice&spot=plaza.home')).toBe('/play/venice?spot=plaza.home');
    expect(veniceReturnHref('?spot=pier.end')).toBe('/play/venice?spot=pier.end');
    expect(veniceReturnHref('?from=venice&spot=%3Cscript%3E')).toBe('/play/venice?spot=pier.end');
  });
});

describe('/play/coast: unlisted and noindex while the zone grows', () => {
  const ROOT = path.resolve(__dirname, '../../..');
  const read = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8');

  it('asks never to be indexed, and mounts a registered mode that no picker serves', () => {
    expect(stripComments(read('app/play/coast/page.tsx'))).toMatch(/robots:\s*\{\s*index:\s*false,\s*follow:\s*false/);
    expect(MODES.coast_zone).toBeTruthy();
    expect(ENABLED_BABYLON_MODES.has('coast_zone')).toBe(false);
  });

  it('nothing links to it but its own door (Venice wires the door later), and no menu, nav or sitemap carries it', () => {
    const files = sourceFiles(ROOT, ['app', 'components', 'lib'], fs, path)
      .map((f) => f.split(path.sep).join('/'))
      .filter((f) => !f.startsWith('app/play/coast/') && !f.startsWith('lib/adventure/coast/'));
    expect(files.length).toBeGreaterThan(500);
    const linkers = files.filter((f) => /\/play\/coast\b/.test(stripComments(read(f))));
    expect(linkers).toEqual([]);
    for (const rel of ['lib/nav/doors.ts', 'lib/nav/families.ts', 'components/shell/tab-bar.tsx', 'app/sitemap.ts', 'app/robots.ts']) {
      expect(stripComments(read(rel)), rel).not.toMatch(/play\/coast/);
    }
    expect(COAST_ROUTE).toBe('/play/coast');
  });
});
