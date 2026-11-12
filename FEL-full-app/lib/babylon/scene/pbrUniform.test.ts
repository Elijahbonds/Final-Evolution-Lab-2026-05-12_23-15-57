import { describe, expect, it, vi } from 'vitest';
import { MeshBuilder, NullEngine, PBRMaterial, Scene } from '@babylonjs/core';
import { setPbrRoughnessUniform } from './pbrUniform';

describe('setPbrRoughnessUniform (perf-lag): an animated roughness without a define pass a frame', () => {
  const setup = () => {
    const scene = new Scene(new NullEngine());
    const mat = new PBRMaterial('sea', scene);
    const mesh = MeshBuilder.CreateGround('g', { width: 1, height: 1 }, scene);
    mesh.material = mat;
    return { scene, mat };
  };

  it('Babylon still keeps roughness in `_roughness` behind the setter (if this fails after an upgrade, the helper is wrong)', () => {
    const { mat } = setup();
    mat.roughness = 0.4;
    expect((mat as unknown as { _roughness: number })._roughness).toBe(0.4);
    const dirty = vi.spyOn(mat as unknown as { _markAllSubMeshesAsTexturesDirty(): void }, '_markAllSubMeshesAsTexturesDirty');
    mat.roughness = 0.41;
    expect(dirty).toHaveBeenCalledTimes(1);   // the setter's define pass, every new value: what the helper avoids
  });

  it('a number-to-number write reads back through the getter and marks nothing dirty', () => {
    const { mat } = setup();
    mat.roughness = 0.35;
    const dirty = vi.spyOn(mat as unknown as { _markAllSubMeshesAsTexturesDirty(): void }, '_markAllSubMeshesAsTexturesDirty');
    for (let i = 0; i < 60; i++) setPbrRoughnessUniform(mat, 0.35 + Math.sin(i * 0.1) * 0.06);
    expect(dirty).not.toHaveBeenCalled();
    expect(mat.roughness).toBeCloseTo(0.35 + Math.sin(59 * 0.1) * 0.06, 12);
  });

  it('the first write (null roughness: no metallic workflow yet) still goes through the setter', () => {
    const { mat } = setup();
    expect(mat.roughness ?? null).toBeNull();
    const dirty = vi.spyOn(mat as unknown as { _markAllSubMeshesAsTexturesDirty(): void }, '_markAllSubMeshesAsTexturesDirty');
    setPbrRoughnessUniform(mat, 0.3);
    expect(dirty).toHaveBeenCalledTimes(1);
    expect(mat.roughness).toBe(0.3);
  });
});
