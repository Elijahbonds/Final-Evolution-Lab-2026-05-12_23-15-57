import { describe, expect, it, vi } from 'vitest';
// the NullEngine has no canvas to paint the ground textures on: the materials take none here (the browser paints them)
vi.mock('../../visual/groundTextures', () => ({ groundTexture: () => null }));
import { Mesh, MeshBuilder, NullEngine, Scene, VertexBuffer } from '@babylonjs/core';
import { blockedBy, boxProjectUVs, CLEAR, DRESS_MODELS, dressPlan, lipsOf, mountWorldDress, railPostsOf, splitTopsAndSides, STORY_WORLD_DRESSED } from './dress';
import { buildWorld1, W1_GAPS } from './ch1/world1';
import { buildHub } from './hub/hub';
import { groundYOf } from './pieces';
import { buildStoryMap } from './story/storyMap';
import { buildStoryView } from './story/view';
import { HubGates } from '../story/gates';
import { FEEL_KNOB_BY_ID } from '@/lib/feel-panel/knobs';

const worlds = [buildHub(), buildWorld1()];

describe('Chapter 1 dressing (improve pass phase 7)', () => {
  it('the knob: its default is the shipped constant, 0 is the plain colours', () => {
    const k = FEEL_KNOB_BY_ID.get('story.worldDressed')!;
    expect(k.def).toBe(STORY_WORLD_DRESSED);
    expect(k.min).toBe(0);
  });

  it('places props in both worlds, the same every load', () => {
    for (const w of worlds) {
      const a = dressPlan(w), b = dressPlan(w);
      expect(a.length).toBeGreaterThan(8);
      expect(b).toEqual(a);
    }
  });

  it('every prop stands on a flat\'s own top, inside it, clear of what you play with', () => {
    for (const w of worlds) for (const p of dressPlan(w)) {
      expect(groundYOf(w.pieces, p.x, p.z)).toBeCloseTo(p.y, 6);
      expect(blockedBy(w, p.x, p.z, DRESS_MODELS[p.model].tall)).toBeNull();
      const f = w.pieces.find((q) => q.kind === 'flat' && p.x >= q.minX && p.x <= q.maxX && p.z >= q.minZ && p.z <= q.maxZ)!;
      const edge = Math.min(p.x - f.minX, f.maxX - p.x, p.z - f.minZ, f.maxZ - p.z);
      expect(edge).toBeGreaterThanOrEqual(CLEAR.edgeMin - 1e-9);
      // tall props only in the wide places, and never in the middle of a lane
      if (DRESS_MODELS[p.model].tall) expect(Math.min(f.maxX - f.minX, f.maxZ - f.minZ) / 2 - edge).toBeGreaterThanOrEqual(CLEAR.tallFromMiddle - 1e-9);
    }
  });

  it('nothing in the traversal voids, by the run-wall, on the rail line, or at a camp', () => {
    const w1 = buildWorld1();
    const plan = dressPlan(w1);
    for (const g of Object.values(W1_GAPS)) expect(plan.filter((p) => p.z > g.z0 && p.z < g.z1)).toHaveLength(0);
    expect(plan.filter((p) => Math.abs(p.x) < CLEAR.rail && p.z > -546 && p.z < -446)).toHaveLength(0);
    expect(blockedBy(w1, 5, -410, false)).not.toBeNull();     // beside the run-wall
    expect(blockedBy(w1, -5, -306, false)).toBe('monster');   // the first camp
    expect(blockedBy(w1, 0, -140, false)).toBe('boss');
  });

  it('lips on every flat edge; rail posts only over ground, never in the rail void', () => {
    const w1 = buildWorld1();
    expect(lipsOf(w1)).toHaveLength(4 * w1.pieces.filter((p) => p.kind === 'flat').length);
    const posts = railPostsOf(w1);
    expect(posts.length).toBeGreaterThan(0);
    for (const p of posts) { expect(p.z < W1_GAPS.rail.z0 || p.z > W1_GAPS.rail.z1).toBe(true); expect(p.top).toBeGreaterThan(p.bottom); }
    expect(railPostsOf(buildHub()).length).toBeGreaterThan(3);
  });

  it('world-metre UVs and a tops / sides split on a merged slab', () => {
    const scene = new Scene(new NullEngine());
    const box = MeshBuilder.CreateBox('b', { width: 20, height: 6, depth: 80 }, scene);
    box.position.set(0, -3, -560);
    const m = Mesh.MergeMeshes([box], true, true)!;
    boxProjectUVs(m, 4, 5);
    const uv = m.getVerticesData(VertexBuffer.UVKind)!, pos = m.getVerticesData(VertexBuffer.PositionKind)!, nor = m.getVerticesData(VertexBuffer.NormalKind)!;
    for (let i = 0, j = 0; i < pos.length; i += 3, j += 2) if (nor[i + 1] > 0.9) { expect(uv[j]).toBeCloseTo(pos[i] / 4); expect(uv[j + 1]).toBeCloseTo(pos[i + 2] / 4); }
    const tris = m.getIndices()!.length;
    splitTopsAndSides(m);
    expect(m.subMeshes).toHaveLength(2);
    expect(m.subMeshes[0].indexCount).toBe(6);   // the top face: two triangles
    expect(m.subMeshes[0].indexCount + m.subMeshes[1].indexCount).toBe(tris);
    scene.dispose();
  });

  it('dresses the real story view: the same meshes and collision, new materials, trims; dispose leaves the view as it was', () => {
    const scene = new Scene(new NullEngine());
    const map = buildStoryMap(worlds);
    const view = buildStoryView(scene, map, new HubGates(map));
    const before = scene.meshes.map((m) => m.name);
    const ground = scene.getMeshByName('story_w1_ground')!;
    const plainMat = ground.material;
    const d = mountWorldDress(scene, [...map.worlds.values()]);
    expect(ground.material).not.toBe(plainMat);
    for (const n of ['dress_w1_lip', 'dress_w1_cap', 'dress_w1_post', 'dress_hub_cap']) expect(scene.getMeshByName(n)).not.toBeNull();
    for (const n of before) expect(scene.getMeshByName(n)).not.toBeNull();
    d.dispose();
    expect(scene.getMeshByName('dress_w1_lip')).toBeNull();
    view.dispose();
    scene.dispose();
  });
});
