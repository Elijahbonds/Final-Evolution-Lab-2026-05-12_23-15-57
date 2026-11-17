// hoops-p08 (2026-11-12): one master per material per prop model (the far pier: eleven parts in two materials).
import { describe, expect, it } from 'vitest';
import { Matrix } from '@babylonjs/core';
import { PROP_MERGE_ON, mergePlan } from './VenueProps';

const at = (x: number) => Matrix.Translation(x, 0, 0);
describe('VenueProps mergePlan', () => {
  it('parts that stand at the same placements merge: their own transforms, and the placements', () => {
    expect(PROP_MERGE_ON).toBe(1);
    const g = new Map([['a', [{ local: Matrix.Translation(0, 1, 0), world: at(5) }, { local: Matrix.Translation(0, 1, 0), world: at(9) }]],
      ['b', [{ local: Matrix.Translation(0, 2, 0), world: at(5) }, { local: Matrix.Translation(0, 2, 0), world: at(9) }]]]);
    const p = mergePlan(g)!;
    expect(p.locals.map((m) => m.m[13])).toEqual([1, 2]);
    expect(p.worlds.map((m) => m.m[12])).toEqual([5, 9]);
  });
  it('one part, or parts at different placements, are left alone', () => {
    expect(mergePlan(new Map([['a', [{ local: Matrix.Identity(), world: at(1) }]]]))).toBeNull();
    expect(mergePlan(new Map([['a', [{ local: Matrix.Identity(), world: at(1) }]], ['b', [{ local: Matrix.Identity(), world: at(2) }]]]))).toBeNull();
    expect(mergePlan(new Map([['a', [{ local: Matrix.Identity(), world: at(1) }]], ['b', []]]))).toBeNull();
  });
});

// the real set, headless: the far pier's fifteen parts come down to its two materials, and the picture's geometry is the same
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { afterEach, vi } from 'vitest';
import { DracoDecoder, FreeCamera, NullEngine, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import type { Mesh } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { mountVenueProps } from './VenueProps';
import { DRACO_DECODER_URLS } from './meshyProps';
import { setFeelOverride, setFeelSession, setFeelUser } from '@/lib/feel-panel/feel';

afterEach(() => { vi.restoreAllMocks(); setFeelUser(false); });
const realI = SceneLoader.ImportMeshAsync.bind(SceneLoader);   // the loader itself, taken once (a second spy would call the first)
function stage() {
  const require = createRequire(import.meta.url);
  DracoDecoder.DefaultConfiguration = { ...DRACO_DECODER_URLS, numWorkers: 0,
    jsModule: require(path.resolve('public', DRACO_DECODER_URLS.wasmUrl.replace(/^\//, ''))), wasmBinary: readFileSync(path.resolve('public', DRACO_DECODER_URLS.wasmBinaryUrl.replace(/^\//, ''))) };
  const scene = new Scene(new NullEngine());
  new FreeCamera('cam', new Vector3(0, 5, -12), scene);
  vi.spyOn(SceneLoader, 'ImportMeshAsync').mockImplementation(((names: string, root: string, file: string, sc: Scene) => {
    const f = path.resolve('public', `${root}${file}`.replace(/^\//, ''));
    return existsSync(f) ? realI(names, '', 'data:model/gltf-binary;base64,' + readFileSync(f).toString('base64'), sc, undefined, '.glb') : Promise.reject(new Error(`missing ${f}`));
  }) as never);
  return scene;
}
const drawn = (scene: Scene) => scene.meshes.filter((m) => m.isEnabled() && (m as Mesh).thinInstanceCount > 0) as Mesh[];
describe('VenueProps on the Venice dunk set (headless)', () => {
  it('merged: fewer drawn masters, the pier in two, the same vertices and placements as the parts', async () => {
    const off = stage();
    setFeelUser(true); setFeelSession(null); setFeelOverride('perf.propMergeOn', 0);
    await mountVenueProps(off, 'venice-dunk');
    const before = drawn(off);
    setFeelUser(false);
    const on = stage();
    await mountVenueProps(on, 'venice-dunk');
    const after = drawn(on);
    expect(after.length).toBeLessThan(before.length);
    const pier = (l: Mesh[]) => l.filter((m) => /^pier_/.test(m.name));
    expect(pier(before).length).toBe(15);   // a deck, twelve posts, two rails
    expect(pier(after).length).toBe(2);
    const verts = (l: Mesh[]) => l.reduce((s, m) => s + m.getTotalVertices() * m.thinInstanceCount, 0);
    expect(verts(after)).toBe(verts(before));
    off.dispose(); on.dispose();
  }, 60000);
});
