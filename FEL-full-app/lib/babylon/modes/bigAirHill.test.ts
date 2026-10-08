// IMPROVE (2026-10-06, Big Air items 1 / 2) — the kicker and the landing are built from the core's own hill table, so the snow
// the rider is drawn on is the snow the core lands him on: the lip at launchZ and lipY, the table, the landing down to the
// run-out. Every face is wound to face out (a face wound in renders black / culled), and the meshes are frozen scenery.
import { describe, expect, it } from 'vitest';
import { NullEngine, Scene, Vector3, VertexBuffer, type Mesh } from '@babylonjs/core';
import { buildAirHill, hillProfiles } from './bigAirHill';
import { VenueKit } from '../visual/VenueKit';
import { hillSurface } from '../../feel/cores/air-hill';
import { BIG_AIR_HILL, BIG_AIR_TUNING } from '../../feel/cores/big-air-constants';

const scene = new Scene(new NullEngine());
const mat = VenueKit.paint(scene, 'snow', '#e3ebf4');
const L = BIG_AIR_TUNING.launchZ;
const hill = buildAirHill(scene, BIG_AIR_HILL, L, mat, mat);
const surf = hillSurface(BIG_AIR_HILL, L);

/** The mesh's top under (x 0, z): the highest vertex y along the profile, interpolated by casting down onto its triangles. */
function topAt(m: Mesh, z: number): number {
  const pos = m.getVerticesData(VertexBuffer.PositionKind)!, idx = m.getIndices()!;
  let best = -Infinity;
  for (let i = 0; i < idx.length; i += 3) {
    const [a, b, c] = [idx[i], idx[i + 1], idx[i + 2]].map((k) => new Vector3(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]));
    // barycentric in the xz plane
    const d = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
    if (Math.abs(d) < 1e-9) continue;
    const w1 = ((b.z - c.z) * (0 - c.x) + (c.x - b.x) * (z - c.z)) / d;
    const w2 = ((c.z - a.z) * (0 - c.x) + (a.x - c.x) * (z - c.z)) / d;
    const w3 = 1 - w1 - w2;
    if (w1 < -1e-6 || w2 < -1e-6 || w3 < -1e-6) continue;
    best = Math.max(best, w1 * a.y + w2 * b.y + w3 * c.y);
  }
  return best;
}

describe('the Big Air hill meshes', () => {
  it('put the kicker\'s lip at launchZ and the snow the core lands on under every z of the landing', () => {
    expect(hillProfiles(BIG_AIR_HILL, L).kicker[1]).toEqual([L, BIG_AIR_HILL.lipY]);
    expect(topAt(hill.kicker, L + 0.01)).toBeCloseTo(BIG_AIR_HILL.lipY, 1);
    expect(topAt(hill.kicker, L + BIG_AIR_HILL.kickerLen / 2)).toBeCloseTo(surf.y(L + BIG_AIR_HILL.kickerLen / 2), 3);
    for (const z of [BIG_AIR_HILL.deckFrontZ - 3, BIG_AIR_HILL.knuckleZ + 4, (BIG_AIR_HILL.knuckleZ + surf.bottomZ) / 2, surf.bottomZ + 2]) {
      expect(topAt(hill.landing, z), `z ${z}`).toBeCloseTo(surf.y(z), 3);
    }
  });

  it('winds every face to face out: the tops up, the sides out to their own side', () => {
    for (const m of [hill.kicker, hill.landing]) {
      const pos = m.getVerticesData(VertexBuffer.PositionKind)!, nor = m.getVerticesData(VertexBuffer.NormalKind)!;
      for (let v = 0; v < pos.length / 3; v++) {
        const [x, y] = [pos[v * 3], pos[v * 3 + 1]], [nx, ny] = [nor[v * 3], nor[v * 3 + 1]];
        const half = m === hill.kicker ? 3 : 8;
        if (Math.abs(Math.abs(x) - half) < 1e-6 && Math.abs(nx) > 0.5) expect(Math.sign(nx), `${m.name} side`).toBe(Math.sign(x));
        if (Math.abs(nx) < 0.5 && Math.abs(nor[v * 3 + 2]) < 0.95 && y > 0) expect(ny, `${m.name} top`).toBeGreaterThan(0);
      }
    }
  });

  it('lays the three lines on the snow (lip, knuckle, foot) and freezes everything, none of it pickable', () => {
    const lines = hill.all.filter((m) => m.name.endsWith('line'));
    expect(lines.map((m) => m.name)).toEqual(['bigair_lipline', 'bigair_knuckleline', 'bigair_footline']);
    for (const m of lines) expect(m.position.y).toBeCloseTo(surf.y(m.position.z) + 0.03, 3);
    // the knuckle line lies along the landing's pitch: its uphill (+z) edge is the higher one
    const k = lines[1]; k.computeWorldMatrix(true);
    const up = Vector3.TransformCoordinates(new Vector3(0, 0, 0.17), k.getWorldMatrix());
    const down = Vector3.TransformCoordinates(new Vector3(0, 0, -0.17), k.getWorldMatrix());
    expect(up.y).toBeGreaterThan(down.y);
    // the lip line on the kicker: its downhill (−z) edge is the higher one (the ramp rises toward the lip)
    const lip = lines[0]; lip.computeWorldMatrix(true);
    expect(Vector3.TransformCoordinates(new Vector3(0, 0, -0.17), lip.getWorldMatrix()).y)
      .toBeGreaterThan(Vector3.TransformCoordinates(new Vector3(0, 0, 0.17), lip.getWorldMatrix()).y);
    for (const m of hill.all) { expect(m.isWorldMatrixFrozen).toBe(true); expect(m.isPickable).toBe(false); }
  });
});
