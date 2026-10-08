// IMPROVE (2026-10-06, surf items 1 / 5 / 14 / 17 / 8-9-20) — the break under a NullEngine: the wave ribbons are written in place
// (the same vertices a fresh CreateRibbon builds, no per-frame rebuild), the pocket and whitewater are painted into the face
// rather than stacked on it as alpha layers, the tube fades on the clock, a new ride is counted, and the buoys are handed out.
import { describe, expect, it } from 'vitest';
import { MeshBuilder, NullEngine, Scene, Vector3, VertexBuffer, type Mesh, type Material } from '@babylonjs/core';
import { buildSurfBreak, waveProfile, crestHeightAt, tubeFadeStep, TUBE_FADE_K, WAVE_FACE_LEN } from './rideWorlds';
import { SURF_VENUES } from '../nexus/boardVenues';

const POCKET = { min: 1, max: 9 };

describe.each(SURF_VENUES.map((v) => [v.id, v] as const))('the break at %s', (_id, venue) => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const built = buildSurfBreak(scene, POCKET, venue);
  const mesh = (n: string) => scene.getMeshByName(n) as Mesh | null;

  it('writes the face where a fresh ribbon would put it, in its own buffer (no rebuild)', () => {
    const face = mesh('waveFace')!;
    const before = face.getVerticesData(VertexBuffer.PositionKind)!;
    const count = before.length;
    for (const t of [0.4, 7.25, 31]) {
      built.waveLipAt(t);
      const got = face.getVerticesData(VertexBuffer.PositionKind)!;
      expect(got.length).toBe(count);
      // the reference: the ribbon this strip was rebuilt from every frame before — the same rows, the same columns
      const xs: number[] = []; for (let x = -(venue.bound + 12); x <= venue.bound + 12; x += 3) xs.push(x);
      const rows = [12, WAVE_FACE_LEN, 7.2, 5.5, 3.8, 2.4, 1.3, 0.5, 0, -0.8, -1.8, -3.2, -5, -7];
      const ref = MeshBuilder.CreateRibbon('ref', { pathArray: rows.map((u) => xs.map((x) => new Vector3(x, waveProfile(u, crestHeightAt(x, t)), u))) }, scene);
      const want = ref.getVerticesData(VertexBuffer.PositionKind)!;
      expect(want.length).toBe(count);
      let worst = 0; for (let i = 0; i < count; i++) worst = Math.max(worst, Math.abs(got[i] - want[i]));
      expect(worst).toBeLessThan(1e-4);
      const wn = ref.getVerticesData(VertexBuffer.NormalKind)!, gn = face.getVerticesData(VertexBuffer.NormalKind)!;
      let worstN = 0; for (let i = 0; i < count; i++) worstN = Math.max(worstN, Math.abs(gn[i] - wn[i]));
      expect(worstN).toBeLessThan(1e-4);
      ref.dispose();
    }
  });

  it('keeps the face\'s bounds over the tallest the wave stands, set once', () => {
    const face = mesh('waveFace')!;
    const box = face.getBoundingInfo().boundingBox;
    built.waveLipAt(12.3);
    const p = face.getVerticesData(VertexBuffer.PositionKind)!;
    for (let i = 0; i < p.length; i += 3) {
      expect(p[i + 1]).toBeLessThanOrEqual(box.maximum.y);
      expect(p[i + 1]).toBeGreaterThanOrEqual(box.minimum.y);
    }
  });

  it('paints the pocket and the whitewater into the face: no alpha ribbons stacked on it, only the tube and the lip fade', () => {
    expect(mesh('wavePocket')).toBeNull();
    expect(mesh('waveWhitewater')).toBeNull();
    const blended = ['waveFace', 'waveFoam', 'waveTube', 'waveLip']
      .filter((n) => ((mesh(n)?.material as Material | null)?.alpha ?? 1) < 1);
    expect(blended.sort()).toEqual(['waveLip', 'waveTube']);
  });

  it('counts a new ride, and hands out the buoys in obstacle order', () => {
    const from = built.swellSeq();
    let seq = from;
    built.barrelActive(0);   // (an earlier test ran the clock ahead: going back restarts the lineup — the count never goes back)
    for (let t = 0.05; t < 90; t += 0.05) { built.barrelActive(t); const s = built.swellSeq(); expect(s).toBeGreaterThanOrEqual(seq); seq = s; }
    expect(seq - from).toBeGreaterThan(2);
    expect(built.buoys.length).toBe(built.world.obstacles.length);
    built.buoys.forEach((b, i) => expect(b.position).toBe(built.world.obstacles[i].pos));
  });
});

describe('item 17 — the tube fades on the clock, not the frame', () => {
  it('is the tuned 0.06 a frame at 60 fps', () => {
    expect(tubeFadeStep(1 / 60)).toBeCloseTo(0.06, 6);
    expect(TUBE_FADE_K).toBeGreaterThan(3);
  });
  it('closes the same share of the gap in a second at 30, 60 and 144 fps', () => {
    const after = (fps: number) => { let a = 0.04; for (let i = 0; i < fps; i++) a += (0.3 - a) * tubeFadeStep(1 / fps); return a; };
    expect(after(144)).toBeCloseTo(after(60), 6);
    expect(after(30)).toBeCloseTo(after(60), 6);
  });
});
