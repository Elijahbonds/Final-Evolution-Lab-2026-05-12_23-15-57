// HEAT HAZE (w3-atmos): the air over a fire pit shimmers. The pass itself needs a GPU (the rig proves it); everything that
// decides WHERE and WHETHER is pure and held here: the column's projection to the screen, the packing, the tier / motion gate,
// and the registry the sources use.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { FreeCamera, Matrix, NullEngine, PostProcess, Scene, Vector3 } from '@babylonjs/core';
import { HEAT_AMP, HEAT_MAX, addHeatSource, heatHazeWanted, heatRegistry, keepLast, mountHeatHaze, packColumns, projectColumn, type HeatSource } from './HeatHaze';

function cam(pos: [number, number, number], target: [number, number, number]) {
  const scene = new Scene(new NullEngine());
  const c = new FreeCamera('c', new Vector3(...pos), scene);
  c.setTarget(new Vector3(...target)); c.fov = 0.8; c.minZ = 0.1; c.maxZ = 500;
  scene.activeCamera = c;
  const vp = new Matrix();
  c.getViewMatrix().multiplyToRef(c.getProjectionMatrix(), vp);
  return { scene, c, vp };
}
const PIT: HeatSource = { x: 0, y: 0.2, z: 0, halfWidth: 1.6, height: 3.4, strength: 1 };

describe('projectColumn', () => {
  it('a pit in front of the camera stands near the middle of the frame, taller than wide on screen', () => {
    const { c, vp } = cam([0, 2, -10], [0, 1.5, 0]);
    const col = projectColumn(PIT, vp, c.globalPosition)!;
    expect(col).not.toBeNull();
    expect(col.cx).toBeGreaterThan(0.4); expect(col.cx).toBeLessThan(0.6);
    expect(col.cy).toBeGreaterThan(0.35); expect(col.cy).toBeLessThan(0.65);
    expect(col.ry).toBeGreaterThan(0.05);
    expect(col.rx).toBeGreaterThan(0.02);
    expect(col.k).toBeCloseTo(1, 1);
  });
  it('the column grows as the camera comes closer', () => {
    const near = cam([0, 2, -6], [0, 1.5, 0]), far = cam([0, 2, -20], [0, 1.5, 0]);
    expect(projectColumn(PIT, near.vp, near.c.globalPosition)!.ry).toBeGreaterThan(projectColumn(PIT, far.vp, far.c.globalPosition)!.ry);
  });
  it('a pit to the right of the middle projects to the right of it', () => {
    const { c, vp } = cam([0, 2, -10], [0, 1.5, 0]);
    expect(projectColumn({ ...PIT, x: 3 }, vp, c.globalPosition)!.cx).toBeGreaterThan(projectColumn(PIT, vp, c.globalPosition)!.cx);
    expect(projectColumn({ ...PIT, x: -3 }, vp, c.globalPosition)!.cx).toBeLessThan(0.5);
  });
  it('is null behind the camera, off the frame, and too far', () => {
    const { c, vp } = cam([0, 2, -10], [0, 1.5, 0]);
    expect(projectColumn({ ...PIT, z: -30 }, vp, c.globalPosition)).toBeNull();      // behind
    expect(projectColumn({ ...PIT, x: 60 }, vp, c.globalPosition)).toBeNull();       // far off to the side
    expect(projectColumn({ ...PIT, z: 400 }, vp, c.globalPosition)).toBeNull();      // beyond the reach
  });
  it('a camera inside the hot air gets none of it', () => {
    const { c, vp } = cam([0, 2, -1.0], [0, 1.5, 0]);
    const col = projectColumn(PIT, vp, c.globalPosition);
    expect(col === null || col.k === 0).toBe(true);
  });
  it('strength scales the weight, and none is none', () => {
    const { c, vp } = cam([0, 2, -10], [0, 1.5, 0]);
    const full = projectColumn(PIT, vp, c.globalPosition)!.k, half = projectColumn({ ...PIT, strength: 0.5 }, vp, c.globalPosition)!.k;
    expect(half).toBeCloseTo(full * 0.5, 4);
    expect(projectColumn({ ...PIT, strength: 0 }, vp, c.globalPosition)!.k).toBe(0);
    expect(projectColumn({ ...PIT, strength: 9 }, vp, c.globalPosition)!.k).toBeLessThanOrEqual(1);
  });
  it('eases out at the frame edge instead of cutting off', () => {
    const { c, vp } = cam([0, 2, -10], [0, 1.5, 0]);
    const mid = projectColumn(PIT, vp, c.globalPosition)!.k;
    let nearEdge: ReturnType<typeof projectColumn> = null;
    for (let x = 0; x < 30 && !nearEdge; x += 0.25) { const p = projectColumn({ ...PIT, x }, vp, c.globalPosition); if (p && p.cx > 0.94) nearEdge = p; }
    expect(nearEdge).not.toBeNull();
    expect(nearEdge!.k).toBeLessThan(mid);
    expect(nearEdge!.k).toBeGreaterThan(0);
  });
});

describe('packColumns', () => {
  const col = (cx: number, k = 1) => ({ cx, cy: 0.5, rx: 0.1, ry: 0.2, k });
  it('keeps at most HEAT_MAX columns, the ones nearest the middle of the frame, amplitude in the first float', () => {
    const p = packColumns([col(0.95), col(0.5), col(0.1), col(0.6), col(0.3)]);
    expect(p.ellipse.length).toBe(HEAT_MAX * 4);
    expect(p.ellipse[0]).toBeCloseTo(0.5, 6);   // nearest first
    expect(p.amp[0]).toBeCloseTo(HEAT_AMP, 6);
    const kept = [0, 1, 2].map((i) => p.ellipse[i * 4]);
    expect(kept).not.toContain(0.95); expect(kept).not.toContain(0.1);
  });
  it('drops columns that carry no weight, and fills the empty slots with a column nothing falls in', () => {
    const p = packColumns([col(0.5, 0)]);
    expect(p.amp.every((v) => v === 0)).toBe(true);
    expect(p.ellipse[2]).toBeLessThan(0.001);
  });
  it('the amplitude is a few pixels, not a ripple across the frame', () => {
    expect(HEAT_AMP).toBeLessThan(0.006);   // < 6 px at 1080p
    expect(HEAT_AMP * 1080).toBeGreaterThan(2);
  });
});

describe('heatHazeWanted', () => {
  it('desktop and high only; never under reduced motion; never when ?lookoff=heat', () => {
    expect(heatHazeWanted('desktop', false)).toBe(true);
    expect(heatHazeWanted('high', false)).toBe(true);
    expect(heatHazeWanted('mobile', false)).toBe(false);
    expect(heatHazeWanted('desktop', true)).toBe(false);
    expect(heatHazeWanted('desktop', false, true)).toBe(false);
  });
});

describe('the pass on a camera (NullEngine)', () => {
  const win = (reduced: boolean) => { (globalThis as unknown as { window: unknown }).window = { location: { search: '' }, matchMedia: (q: string) => ({ matches: reduced && /reduce/.test(q) }), localStorage: { getItem: () => null } }; };
  const mk = () => { const scene = new Scene(new NullEngine()); const cam = new FreeCamera('c', new Vector3(0, 2, -10), scene); scene.activeCamera = cam; return { scene, cam }; };
  const chain = (cam: FreeCamera) => ((cam as unknown as { _postProcesses: Array<PostProcess | null> })._postProcesses).filter((p): p is PostProcess => !!p);
  it('mounts only when a source exists (or is forced), on a tier and motion setting that get it', () => {
    win(false);
    const { scene, cam } = mk();
    expect(mountHeatHaze(scene, 'desktop', cam)).toBeNull();                       // no source: no extra pass at all
    addHeatSource(scene, { ...PIT });
    expect(mountHeatHaze(scene, 'mobile', cam)).toBeNull();
    const h = mountHeatHaze(scene, 'desktop', cam)!;
    expect(h).not.toBeNull(); expect(chain(cam).map((p) => p.name)).toEqual(['fel_heat_haze']);
    h.dispose(); expect(chain(cam).length).toBe(0);
    win(true);
    expect(mountHeatHaze(scene, 'desktop', cam)).toBeNull();                       // reduced motion: no shimmer
  });
  it('keeps itself the LAST pass: a pipeline rebuilt behind it is put back in front of it', () => {
    win(false);
    const { scene, cam } = mk(); addHeatSource(scene, { ...PIT });
    const h = mountHeatHaze(scene, 'desktop', cam)!;
    const later = new PostProcess('rebuilt_pipeline_pass', 'pass', null, null, 1, cam);   // what a rebuild attaches after it
    expect(chain(cam).map((p) => p.name)).toEqual(['fel_heat_haze', 'rebuilt_pipeline_pass']);
    scene.onBeforeRenderObservable.notifyObservers(scene);
    expect(chain(cam).map((p) => p.name)).toEqual(['rebuilt_pipeline_pass', 'fel_heat_haze']);
    expect(keepLast(cam, h.post)).toBe(false);   // already last: nothing to do
    later.dispose(cam); h.dispose();
  });
});

describe('the registry', () => {
  it('a source adds itself and takes itself away; the registry is the scene\'s, made on first use', () => {
    const scene = new Scene(new NullEngine());
    expect(heatRegistry(scene).sources.length).toBe(0);
    const off = addHeatSource(scene, { ...PIT });
    expect(heatRegistry(scene).sources.length).toBe(1);
    expect(heatRegistry(scene)).toBe(heatRegistry(scene));
    off(); off();
    expect(heatRegistry(scene).sources.length).toBe(0);
  });
});

describe('wired in, and presentation only', () => {
  const read = (p: string) => fs.readFileSync(path.resolve(__dirname, p), 'utf8');
  it('the rig mounts it after load (captureVenue), only off legacy, and disposes it', () => {
    const s = read('LightRig.ts');
    expect(s).toMatch(/heat\?\.dispose\(\); heat = mountHeatHaze\(scene, tier\);/);
    expect(s).toMatch(/\/\/ w3-atmos: the air over a fire pit[^\n]*\n\s*heat\?\.dispose\(\)/);
    expect(s).toMatch(/sky\?\.dispose\(\); atmosphere\?\.dispose\(\); glossyFloor\?\.dispose\(\); decals\?\.dispose\(\); heat\?\.dispose\(\);/);
    const cap = s.slice(s.indexOf('captureVenue(at) {'), s.indexOf('get venueProbe'));
    expect(cap.indexOf('if (!legacy) {')).toBeLessThan(cap.indexOf('mountHeatHaze'));
  });
  it('the Foundry\'s fire pits register a column and take it away with the arena', () => {
    const s = read('../combat/arenaBuild.ts');
    expect(s).toMatch(/heatOff\.push\(addHeatSource\(scene, \{ x: h\.x, y: lift \+ 0\.2, z: h\.z/);
    expect(s).toMatch(/for \(const off of heatOff\) off\(\);/);
  });
  it('the shader early-outs outside a column and is GLSL', () => {
    const s = read('HeatHaze.ts');
    expect(s).toContain('if (d < 1.0)');
    expect(s).toContain('gl_FragColor = texture2D(textureSampler, vUV + off);');
    expect(s).not.toMatch(/\bwgsl\b/i);
  });
  it('imports nothing that scores, judges, times or tunes', () => {
    const imports = [...read('HeatHaze.ts').matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    expect([...new Set(imports)].sort()).toEqual(['../../a11y/reducedMotion', './QualityTier', './graphicsSetting', '@babylonjs/core']);
  });
});
