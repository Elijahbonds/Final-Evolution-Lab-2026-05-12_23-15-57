import { describe, expect, it } from 'vitest';
import { ImageProcessingPostProcess, MeshBuilder, NullEngine, PBRMaterial, Scene, FreeCamera, Vector3 } from '@babylonjs/core';
import { setGradeExposure } from './gradeUniform';

describe('setGradeExposure (perf-lag): an exposure beat without a scene-wide define pass', () => {
  const setup = () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const cam = new FreeCamera('c', new Vector3(0, 1, -5), scene);
    const pp = new ImageProcessingPostProcess('ip', 1, cam, undefined, engine);
    const mat = new PBRMaterial('m', scene);
    MeshBuilder.CreateBox('b', {}, scene).material = mat;
    let notified = 0;
    scene.imageProcessingConfiguration.onUpdateParameters.add(() => { notified++; });
    return { scene, pp, count: () => notified };
  };

  it('the setter notifies every listener on each new value (what the helper avoids), and Babylon keeps it in `_exposure`', () => {
    const { scene, pp, count } = setup();
    pp.exposure = 1.1;
    pp.exposure = 1.2;
    expect(count()).toBe(2);
    expect((scene.imageProcessingConfiguration as unknown as { _exposure: number })._exposure).toBe(1.2);
  });

  it('60 frames of a beat: the value reads back through the getter, nobody is notified', () => {
    const { scene, pp, count } = setup();
    for (let i = 0; i < 60; i++) setGradeExposure(pp, 1 - 0.2 * Math.sin(i / 10));
    expect(count()).toBe(0);
    expect(pp.exposure).toBeCloseTo(1 - 0.2 * Math.sin(59 / 10), 12);
    expect(scene.imageProcessingConfiguration.exposure).toBeCloseTo(1 - 0.2 * Math.sin(59 / 10), 12);
  });
});
