// The app's material plugins on a WebGPU (WGSL) material (device-perf, owner 2026-11-12: the WebGPU trial).
//
// Babylon refuses to attach a plugin whose isCompatible(shaderLanguage) is false, by THROWING from the plugin's constructor, and
// MaterialPluginBase's default is GLSL only. Each plugin here already handles WGSL itself (the zone tint has WGSL code; the sky,
// the wet surface, the snow glint and the ocean add nothing under WGSL and leave the plain PBR look), so each says it is
// compatible with both. Measured before the fix: every one of them threw "not compatible with the shader language of the
// material" on a WGSL material — a mode that mounts one could not load under ?engine=webgpu at all.
// No GPU needed: a NullEngine flagged as WebGPU makes every new material WGSL (Material._createUniformBuffer), which is all the
// attach check reads. Under WebGL (GLSL) nothing changes: the same check passed before and passes now.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MeshBuilder, NullEngine, PBRMaterial, Scene, ShaderLanguage, StandardMaterial, type Material } from '@babylonjs/core';
import { wetSurface } from '@/lib/babylon/visual/WetSurface';
import { applySnowSparkle } from '@/lib/babylon/visual/SnowSparkle';
import { oceanShade } from '@/lib/babylon/visual/OceanSurface';
import { registerZoneTint, tintOf } from '@/lib/babylon/avatar/TintMaterialPlugin';
import { mountSkyDome } from '@/lib/babylon/scene/SkyDome';

function stage(webgpu: boolean) {
  const engine = new NullEngine();
  if (webgpu) (engine as unknown as { _isWebGPU: boolean })._isWebGPU = true;
  const scene = new Scene(engine);
  return { engine, scene };
}
let open: Array<{ engine: NullEngine; scene: Scene }> = [];
afterEach(() => { for (const s of open) { s.scene.dispose(); s.engine.dispose(); } open = []; vi.restoreAllMocks(); });

const pluginOn = (m: Material | null, name: string) =>
  !!(m as unknown as { pluginManager?: { getPlugin(n: string): unknown } } | null)?.pluginManager?.getPlugin(name);

describe.each([['WebGPU (WGSL)', true, ShaderLanguage.WGSL], ['WebGL (GLSL)', false, ShaderLanguage.GLSL]])('%s', (_n, gpu, lang) => {
  const s = () => { const x = stage(gpu); open.push(x); return x; };

  it('a new PBR material speaks the backend language', () => {
    const { scene } = s();
    expect(new PBRMaterial('m', scene).shaderLanguage).toBe(lang);
  });
  it('the wet surface attaches', () => {
    const { scene } = s();
    const m = new PBRMaterial('court', scene);
    expect(() => wetSurface(m)).not.toThrow();
    expect(pluginOn(m, 'FELWetSurface')).toBe(true);
  });
  it('the snow glint attaches (it swallows a refusal, so the plugin itself is checked)', () => {
    const { scene } = s();
    const m = new PBRMaterial('snow', scene);
    applySnowSparkle(scene, [m], 'alpine', 'desktop');
    expect(pluginOn(m, 'FELSnowGlint')).toBe(true);
  });
  it('the ocean shade attaches', () => {
    const { scene } = s();
    const m = new PBRMaterial('sea', scene);
    expect(() => oceanShade(m, { foam: '#ffffff', horizon: '#9fc4e0', shoreZ: 0 })).not.toThrow();
    expect(pluginOn(m, 'FELOcean')).toBe(true);
  });
  it('the sky dome mounts on the venue dome', () => {
    const { scene } = s();
    scene.metadata = { felModeId: 'onevone' };
    const dome = MeshBuilder.CreateSphere('nexus_sky', { diameter: 10 }, scene);
    dome.material = new StandardMaterial('dome', scene);
    let h: unknown = null;
    expect(() => { h = mountSkyDome(scene, 'goldenHour', 'desktop'); }).not.toThrow();
    expect(h).not.toBeNull();
    expect(pluginOn(dome.material, 'FELSky')).toBe(true);
  });
  it('the zone tint rides every new PBR material', () => {
    const { scene } = s();
    registerZoneTint();
    let m: Material | null = null;
    expect(() => { m = new PBRMaterial('kit', scene); }).not.toThrow();
    expect(tintOf(m)).not.toBeNull();
  });
});
