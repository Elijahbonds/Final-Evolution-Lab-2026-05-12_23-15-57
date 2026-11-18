// lane/kit-tight: the one-piece short's darker inseam panel (inseamShade.ts, kit.inseamShade). The coordinator's option (a),
// 2026-11-18: a texture made from the short's own UVs and weights — no geometry, UV, bone or vertex-data change.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { NullEngine, PBRMaterial, Scene, SceneLoader, VertexBuffer } from '@babylonjs/core';
import type { Mesh } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { INSEAM_SHADE, inseamTexels, joiningShare } from './inseamShade';
import { KIT_GARMENT_SETS, applyGarmentSet, parseGarmentSet } from './kitGarmentSet';
import { FEEL_KNOB_BY_ID } from '../../feel-panel/knobs';
import { cloneForTint } from './playerIdentity';
import { resetFeelForTests, setFeelOverride, setFeelSession, setFeelUser } from '../../feel-panel/feel';

afterEach(() => resetFeelForTests());
const pub = (u: string) => `public${u}`;
const set = () => { const b = readFileSync(pub(KIT_GARMENT_SETS.shorts.male)); return parseGarmentSet(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };

async function shortAfterSwap(): Promise<{ mesh: Mesh; kindsBefore: string[]; kindsAfter: string[] }> {
  const scene = new Scene(new NullEngine());
  const c = await SceneLoader.LoadAssetContainerAsync('', `data:model/gltf-binary;base64,${readFileSync('public/models/candidates/fel-kit-male.glb').toString('base64')}`, scene, undefined, '.glb');
  const kindsBefore = (c.meshes.find((m) => m.name === 'Kit_shorts_shorts_court') as Mesh).getVerticesDataKinds().filter((k) => k !== VertexBuffer.UVKind).sort();
  applyGarmentSet(c, set());
  const mesh = c.meshes.find((m) => m.name === 'Kit_shorts_shorts_court') as Mesh;
  return { mesh, kindsBefore, kindsAfter: mesh.getVerticesDataKinds().filter((k) => k !== VertexBuffer.UVKind).sort() };
}

describe('the one-piece short\'s inseam panel (kit.inseamShade)', () => {
  it('ships at 0.55 (the coordinator\'s reversible default), and 0 on its row is off', () => {
    expect(INSEAM_SHADE).toBe(0.55);
    const k = FEEL_KNOB_BY_ID.get('kit.inseamShade')!;
    expect([k.def, k.min, k.max]).toEqual([0.55, 0, 1]);
  });
  it('marks the inseam (the inner side of each leg) and leaves most of the short plain', () => {
    const g = set().find((x) => x.slot === 'shorts')!;
    const s = joiningShare(g.joints, g.weights, g.jointNames, g.positions);
    const panel = [...s].filter((x) => x > 0.5).length;
    expect(panel).toBeGreaterThan(s.length * 0.03);
    expect(panel).toBeLessThan(s.length * 0.35);
  });
  it('the texels: white where nothing joins, darker by the knob where it does', () => {
    const px = inseamTexels([0, 0, 1, 0, 0, 1], [0, 1, 2], [1, 1, 1], 0.5, 8);
    expect(px[(2 * 8 + 2) * 4]).toBe(128);   // inside the triangle: 1 − 0.5 × 1
    const white = inseamTexels([0, 0, 1, 0, 0, 1], [0, 1, 2], [0, 0, 0], 0.5, 8);
    expect(white[(2 * 8 + 2) * 4]).toBe(255);
  });
  it('on: the short wears the panel texture, and its vertex data keeps the same kinds (the body merge sees the same part)', async () => {
    const r = await shortAfterSwap();
    expect((r.mesh.material as PBRMaterial).lightmapTexture?.name).toBe('fel_inseam_shade');
    expect((r.mesh.material as PBRMaterial).useLightmapAsShadowmap).toBe(true);
    expect(r.kindsAfter).toEqual(r.kindsBefore);
  }, 60_000);
  it('off (0): no texture at all — the short as before', async () => {
    setFeelUser(true); setFeelSession(null); setFeelOverride('kit.inseamShade', 0);
    const r = await shortAfterSwap();
    expect((r.mesh.material as PBRMaterial).lightmapTexture ?? null).toBeNull();
  }, 60_000);
  it('a tinted player\'s clone of the short\'s material keeps the panel (shared, not a blank deep copy)', async () => {
    const r = await shortAfterSwap();
    const src = r.mesh.material as PBRMaterial, clone = cloneForTint(src as never, 'tinted') as unknown as PBRMaterial;
    expect(clone.lightmapTexture).toBe(src.lightmapTexture);
  }, 60_000);
});
