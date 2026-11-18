// IMPROVE (2026-10-06, 1v1 #19) — the world shot meter is ONE quad with one material (it was six planes and six materials), its
// public API is what 1v1 / 3v3 / 3PT / Dunk / Dunk Duel call, and set() hangs it beside the head without building vectors.
import { describe, it, expect, afterEach } from 'vitest';
import { NullEngine, Scene, TargetCamera, Vector3, ShaderMaterial } from '@babylonjs/core';
import { mountShotMeter3D, meterShaderFor, VERT, FRAG, VERT_WGSL, FRAG_WGSL, METER_WGSL_ON } from './ShotMeter3D';
import { ShaderLanguage } from '@babylonjs/core';
import { createHash } from 'node:crypto';

const engines: NullEngine[] = [];
afterEach(() => { while (engines.length) engines.pop()!.dispose(); });
function scene(): Scene {
  const engine = new NullEngine({ renderWidth: 320, renderHeight: 240, textureSize: 64, deterministicLockstep: false, lockstepMaxSteps: 1 });
  engines.push(engine);
  const s = new Scene(engine);
  const cam = new TargetCamera('cam', new Vector3(0, 2, -6), s);
  cam.setTarget(Vector3.Zero());
  s.activeCamera = cam;
  return s;
}

describe('ShotMeter3D — one quad (#19)', () => {
  it('mounts one mesh and one shader material, hidden until begin()', () => {
    const s = scene();
    const meshes0 = s.meshes.length, mats0 = s.materials.length;
    const m = mountShotMeter3D(s);
    expect(s.meshes.length - meshes0).toBe(1);
    expect(s.materials.length - mats0).toBe(1);
    expect(s.materials.at(-1)).toBeInstanceOf(ShaderMaterial);
    expect(m.visible()).toBe(false);
    expect(s.getMeshByName('shot_meter')!.isVisible).toBe(false);
  });

  it('begin → set → end → update fades it out, and dispose takes all of it', () => {
    const s = scene();
    const meshes0 = s.meshes.length, mats0 = s.materials.length;
    const m = mountShotMeter3D(s);
    m.begin({ center: 0.6, half: 0.1 });
    expect(m.visible()).toBe(true);
    const head = new Vector3(1, 1.72, 2);
    m.set(0.5, head);
    const root = s.getTransformNodeByName('shot_meter_3d')!;
    // beside the head (SIDE 0.56 along the camera's flat right) and UP 0.2 above it; the head itself untouched
    expect(Vector3.Distance(new Vector3(root.position.x, 0, root.position.z), new Vector3(head.x, 0, head.z))).toBeCloseTo(0.56, 5);
    expect(root.position.y).toBeCloseTo(1.92, 5);
    expect(head.equals(new Vector3(1, 1.72, 2))).toBe(true);
    m.green({ center: 0.5, half: 0.08 });
    m.end('perfect');
    m.end('brick');   // idempotent
    for (let i = 0; i < 40; i++) m.update(1 / 60);
    expect(m.visible()).toBe(false);
    m.dispose();
    expect(s.meshes.length).toBe(meshes0);
    expect(s.materials.length).toBe(mats0);
  });

  it('set() before begin() and after end() leaves it where it was', () => {
    const s = scene();
    const m = mountShotMeter3D(s);
    const root = s.getTransformNodeByName('shot_meter_3d')!;
    m.set(0.4, new Vector3(5, 5, 5));
    expect(root.position.equals(Vector3.Zero())).toBe(true);
  });
});

// hoops-items (2026-11-18): the meter under ?engine=webgpu. WebGL must stay byte-identical: the GLSL is pinned to the hash it had before
// this change (sha256 of VERT + '\n----\n' + FRAG, taken from the file at release 86084097), and the WebGL material is built with exactly the
// options it always had — no shaderLanguage key.
describe('ShotMeter3D — the WGSL twin for WebGPU (hoops-items)', () => {
  it('the GLSL is byte-for-byte what it was', () => {
    expect(createHash('sha256').update(VERT + '\n----\n' + FRAG).digest('hex')).toBe('27683a74fe0aa4164b4b18ad9228f74d5c3f81c8d444088ce43bd502cf8bae4f');
  });
  it('WebGL: the GLSL with the old options; WebGPU: the WGSL; WebGPU with the knob off: the GLSL, as before', () => {
    const old = { attributes: ['position'], uniforms: ['worldViewProjection', 'uBox', 'uGreen', 'uFillColor', 'uMarkColor'], needAlphaBlending: true };
    expect(meterShaderFor(false)).toEqual({ source: { vertexSource: VERT, fragmentSource: FRAG }, options: old });
    expect(meterShaderFor(false, false)).toEqual({ source: { vertexSource: VERT, fragmentSource: FRAG }, options: old });
    expect(meterShaderFor(true, false)).toEqual({ source: { vertexSource: VERT, fragmentSource: FRAG }, options: old });
    const g = meterShaderFor(true);
    expect(METER_WGSL_ON).toBe(1);
    expect(g.source).toEqual({ vertexSource: VERT_WGSL, fragmentSource: FRAG_WGSL });
    expect(g.options).toEqual({ ...old, shaderLanguage: ShaderLanguage.WGSL });
  });
  it('the mounted material on a WebGL-family engine is the GLSL one', () => {
    const s = scene();
    mountShotMeter3D(s);
    const mat = s.materials.at(-1) as ShaderMaterial & { _shaderPath: { vertexSource: string; fragmentSource: string }; options: { shaderLanguage?: number } };
    expect(mat._shaderPath).toEqual({ vertexSource: VERT, fragmentSource: FRAG });
    expect(mat.options.shaderLanguage ?? ShaderLanguage.GLSL).toBe(ShaderLanguage.GLSL);
  });
  it('the WGSL draws the same six layers as the GLSL: every constant colour, alpha and band test is in both', () => {
    const consts = (src: string) => (src.match(/\d+\.\d+/g) ?? []).sort();
    expect(consts(FRAG_WGSL.replace(/vec4<f32>\(0\.0, 0\.0, 0\.0, 0\.0\)|vec3<f32>\(1\.0, 1\.0, 1\.0\)/g, ''))).toEqual(consts(FRAG.replace(/vec4\(0\.0\)|vec3\(1\.0\)/g, '')));
    expect(FRAG_WGSL.match(/acc = layer\(/g)).toHaveLength(6);
    expect(FRAG_WGSL).toContain('discard;');
    for (const u of ['uBox', 'uGreen', 'uFillColor', 'uMarkColor']) expect(FRAG_WGSL).toContain(`uniform ${u} :`);
    expect(VERT_WGSL).toContain('uniform worldViewProjection : mat4x4<f32>;');
  });
});

describe('ShotMeter3D — the WebGPU fallback (hoops-items)', () => {
  it('a WGSL compile error swaps in a plain bar in the fill colour, and dispose takes it too; WebGL has no such hook', () => {
    const s = scene();
    const mats0 = s.materials.length;
    mountShotMeter3D(s);
    expect((s.materials.at(-1) as ShaderMaterial).onError).toBeFalsy();   // WebGL: nothing changed
    const s2 = scene();
    Object.defineProperty(s2.getEngine(), 'isWebGPU', { value: true, configurable: true });
    const m = mountShotMeter3D(s2);
    const mat = s2.materials.at(-1) as ShaderMaterial;
    expect(mat.options.shaderLanguage).toBe(ShaderLanguage.WGSL);
    m.begin({ center: 0.6, half: 0.1 });
    mat.onError!(mat.getEffect()!, 'compile failed');
    const quad = s2.getMeshByName('shot_meter')!;
    expect(quad.material!.name).toBe('shot_meter_plain');
    expect((quad.material as unknown as { emissiveColor: { toHexString(): string } }).emissiveColor.toHexString()).toBe('#22D3EE');
    const n = s2.materials.length;
    m.dispose();
    expect(s2.materials.length).toBe(n - 2);
    void mats0;
  });
});
