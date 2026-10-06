// IMPROVE (2026-10-06, Big Air items 1 / 2): the jump the air core lands on, built from the SAME table (lib/feel/cores/
// air-hill.ts) — the kicker's ramp up to the lip at launchZ, and the landing: a 45° front face, the table, the knuckle and
// the pitched landing down to the run-out. Before, the visible "kicker" was a 0.5 m box at z −12 while the core launched at
// −60 off bare snow, and every air landed on the flat sheet. The meshes are scenery (unpickable, no collisions: the core
// owns the rider's height and the camera's occlusion probe must not treat the landing as a wall) and never move (frozen).
//
// Each piece is a profile swept across the run: a list of (z, y) points down the hill, every y ≥ 0, extruded `width` wide in
// x. The faces are flat-shaded (no shared vertices) and each is wound to face OUT (checked against its computed normal,
// as rideWorlds.rampWedge does). UVs are in metres over `tileM`, so a texture's rows run across the run.
import { Mesh, MeshBuilder, VertexData } from '@babylonjs/core';
import type { Material, Scene } from '@babylonjs/core';
import { hillSurface, type AirHill } from '../../feel/cores/air-hill';

/** The landing is wider than the kicker: it catches a spread of lines. */
export const HILL_WIDTH = { kicker: 6, landing: 16 } as const;

/** The two profiles (z, y), in order down the run (z decreasing). */
export function hillProfiles(h: AirHill, launchZ: number): { kicker: [number, number][]; landing: [number, number][] } {
  const surf = hillSurface(h, launchZ);
  return {
    kicker: [[launchZ + h.kickerLen, 0], [launchZ, h.lipY]],
    landing: [[h.deckFrontZ, 0], [h.deckFrontZ - h.deckY, h.deckY], [h.knuckleZ, h.deckY], [surf.bottomZ, 0]],
  };
}

/** A profile swept `width` wide across x: the top, both sides, and a vertical end where the profile starts or ends above 0. */
export function profileSolid(scene: Scene, name: string, profile: [number, number][], width: number, tileM = 4): Mesh {
  const hx = width / 2;
  const pos: number[] = [], uvs: number[] = [], idx: number[] = [];
  const out: [number, number, number][] = [];   // each quad's intended outward direction
  const quad = (a: number[], b: number[], c: number[], d: number[], uv: number[][], o: [number, number, number]): void => {
    const base = pos.length / 3;
    for (const p of [a, b, c, d]) pos.push(p[0], p[1], p[2]);
    for (const t of uv) uvs.push(t[0], t[1]);
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    out.push(o);
  };
  let along = 0;
  for (let i = 0; i + 1 < profile.length; i++) {
    const [z0, y0] = profile[i], [z1, y1] = profile[i + 1];
    const len = Math.hypot(z1 - z0, y1 - y0);
    // the top: across x, along the profile
    quad([-hx, y0, z0], [hx, y0, z0], [hx, y1, z1], [-hx, y1, z1],
      [[-hx / tileM, along / tileM], [hx / tileM, along / tileM], [hx / tileM, (along + len) / tileM], [-hx / tileM, (along + len) / tileM]], [0, 1, 0]);
    along += len;
    // the two sides: the strip under this segment, down to the snow
    for (const sx of [-hx, hx]) {
      quad([sx, 0, z0], [sx, y0, z0], [sx, y1, z1], [sx, 0, z1],
        [[z0 / tileM, 0], [z0 / tileM, y0 / tileM], [z1 / tileM, y1 / tileM], [z1 / tileM, 0]], [Math.sign(sx), 0, 0]);
    }
  }
  // the vertical ends (the kicker's back under the lip; a profile that starts or ends above the snow)
  const ends: [number, number, number][] = [[...profile[0], 1] as [number, number, number], [...profile[profile.length - 1], -1] as [number, number, number]];
  for (const [z, y, dir] of ends) {
    if (y <= 1e-6) continue;
    quad([-hx, 0, z], [hx, 0, z], [hx, y, z], [-hx, y, z], [[-hx / tileM, 0], [hx / tileM, 0], [hx / tileM, y / tileM], [-hx / tileM, y / tileM]], [0, 0, dir]);
  }
  let normals: number[] = [];
  VertexData.ComputeNormals(pos, idx, normals);
  // each quad faces OUT: a quad whose computed normal points in has its two triangles flipped
  let flipped = false;
  out.forEach((o, q) => {
    const v = q * 4, n = [normals[v * 3], normals[v * 3 + 1], normals[v * 3 + 2]];
    // the top's outward is "up-ish" (a slope's normal leans along z), the rest exactly their axis
    if (n[0] * o[0] + n[1] * o[1] + n[2] * o[2] < 0) {
      const k = q * 6;
      idx.splice(k, 6, v, v + 2, v + 1, v, v + 3, v + 2);
      flipped = true;
    }
  });
  if (flipped) { normals = []; VertexData.ComputeNormals(pos, idx, normals); }
  const vd = new VertexData();
  vd.positions = pos; vd.indices = idx; vd.normals = normals; vd.uvs = uvs;
  const m = new Mesh(name, scene);
  vd.applyToMesh(m);
  m.isPickable = false;
  m.checkCollisions = false;
  return m;
}

/**
 * The kicker and the landing, plus three painted lines a rider reads the landing by: the LIP, the KNUCKLE (short of it
 * is a case) and the landing's FOOT (past it is the flat). Everything frozen. Returns every mesh (the caller disposes them).
 */
export function buildAirHill(scene: Scene, h: AirHill, launchZ: number, snow: Material, line: Material): { kicker: Mesh; landing: Mesh; all: Mesh[] } {
  const prof = hillProfiles(h, launchZ);
  const kicker = profileSolid(scene, 'bigair_kicker', prof.kicker, HILL_WIDTH.kicker);
  const landing = profileSolid(scene, 'bigair_landing', prof.landing, HILL_WIDTH.landing);
  kicker.material = snow; landing.material = snow;
  const surf = hillSurface(h, launchZ);
  const strip = (name: string, z: number, w: number): Mesh => {
    const m = MeshBuilder.CreateGround(name, { width: w, height: 0.35 }, scene);
    m.position.set(0, surf.y(z) + 0.03, z);
    m.rotation.x = surf.pitch(z);   // lie on the face it is painted on (its +z edge low on the kicker's ramp, high on the landing)
    m.material = line; m.isPickable = false;
    return m;
  };
  const all = [
    kicker, landing,
    strip('bigair_lipline', launchZ + 0.2, HILL_WIDTH.kicker),
    strip('bigair_knuckleline', surf.sweetFromZ, HILL_WIDTH.landing),
    strip('bigair_footline', surf.bottomZ + 0.2, HILL_WIDTH.landing),
  ];
  for (const m of all) m.freezeWorldMatrix();
  return { kicker, landing, all };
}
