// FIRST-DUNK-BUDGET (2026-10-17): each kit file comes down once per scene, and the Meshy props from ONE path.
//
// AM's /try network log: hoopbus.glb twice (/models/meshy/ for the dunk's corner bus, /models/props/meshy/ for the venue's parked
// bus — the same 4.7 MB file behind a symlink) and tent.glb twice (the venue's tents and the dunk's corner tent, two imports).
// The venue's set and a mode's own copy now share one import per file; the copy is cloned from it as it lands.
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FreeCamera, NullEngine, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import type { Mesh } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { copyKitModel, mountVenueProps } from './VenueProps';
import { VENUE_PROP_SETS } from './venuePropSets';

const glb = (url: string): string | null => {
  const f = path.resolve('public', url.replace(/^\//, ''));
  return existsSync(f) ? 'data:model/gltf-binary;base64,' + readFileSync(f).toString('base64') : null;
};

afterEach(() => { vi.restoreAllMocks(); });

function stage() {
  const scene = new Scene(new NullEngine());
  new FreeCamera('cam', new Vector3(0, 5, -12), scene);
  const asked: string[] = [];
  const realI = SceneLoader.ImportMeshAsync.bind(SceneLoader);
  vi.spyOn(SceneLoader, 'ImportMeshAsync').mockImplementation(((names: string, root: string, file: string, sc: Scene) => {
    asked.push(`${root}${file}`);
    const d = glb(`${root}${file}`);
    return d ? realI(names, '', d, sc, undefined, '.glb') : Promise.reject(new Error(`missing ${root}${file}`));
  }) as never);
  return { scene, asked };
}

describe("the venue's set and a mode's own copy share one download per file", () => {
  it('the Venice dunk set holds the parked bus and the tents the dunk also stands at its corners', () => {
    const set = VENUE_PROP_SETS['venice-dunk'];
    expect(set.some((p) => p.kit === 'meshy' && p.model === 'hoopbus')).toBe(true);
    expect(set.filter((p) => p.kit === 'racing' && p.model === 'tent').length).toBeGreaterThan(1);
  });

  it('the set and the corner tent and bus, asked in one breath: tent.glb once, hoopbus.glb once — from /models/meshy/ only', async () => {
    const { scene, asked } = stage();
    const set = mountVenueProps(scene, 'venice-dunk');
    const tent = copyKitModel(scene, 'racing', 'tent', 'dunk_tent');
    const bus = copyKitModel(scene, 'meshy', 'hoopbus', 'dunk_hoopbus');
    const [h, tentRoot, busRoot] = await Promise.all([set, tent, bus]);
    expect(asked.filter((u) => u.endsWith('/tent.glb'))).toEqual(['/models/props/racing/tent.glb']);
    expect(asked.filter((u) => u.endsWith('/hoopbus.glb'))).toEqual(['/models/meshy/hoopbus.glb']);
    expect(asked.some((u) => u.includes('/props/meshy/'))).toBe(false);
    expect(new Set(asked).size).toBe(asked.length);   // every file of the set, once
    // the venue's set still stands: its masters are drawn as thin instances
    expect(h?.count).toBeGreaterThan(10);
    const masters = (scene.meshes as Mesh[]).filter((m) => m.hasThinInstances && m.isEnabled());
    expect(masters.length).toBeGreaterThan(3);
    // the copies are their own meshes, shown, at the import's own pose — never one of the venue's masters
    for (const root of [tentRoot, busRoot]) {
      const parts = root.getChildMeshes().filter((m) => m.getTotalVertices() > 0);
      expect(parts.length).toBeGreaterThan(0);
      for (const m of parts) { expect(masters).not.toContain(m); expect(m.isEnabled()).toBe(true); expect((m as Mesh).hasThinInstances).toBe(false); }
    }
    scene.getEngine().dispose();
  });

  it('a copy asked after the shared import landed is an import of its own (it cannot be cloned from the masters)', async () => {
    const { scene, asked } = stage();
    await mountVenueProps(scene, 'venice-dunk');
    const before = scene.meshes.length;
    const late = await copyKitModel(scene, 'racing', 'tent', 'dunk_tent');
    expect(asked.filter((u) => u.endsWith('/tent.glb'))).toHaveLength(2);
    expect(late.getChildMeshes().some((m) => m.getTotalVertices() > 0)).toBe(true);
    expect(scene.meshes.slice(before).filter((m) => !m.isDescendantOf(late))).toEqual([]);   // its import is all under its root
    scene.getEngine().dispose();
  });

  it('a copy of a file no venue set wants takes the import itself: one download, nothing left standing at the origin', async () => {
    const { scene, asked } = stage();
    const before = scene.meshes.length;
    const bus = await copyKitModel(scene, 'meshy', 'hoopbus', 'dunk_hoopbus');
    expect(asked).toEqual(['/models/meshy/hoopbus.glb']);
    const made = scene.meshes.slice(before);
    expect(made.length).toBeGreaterThan(0);
    expect(made.filter((m) => !m.isDescendantOf(bus))).toEqual([]);
    // and a venue set mounted after it imports its own copy rather than re-parking the bus's meshes as masters
    await mountVenueProps(scene, 'venice-dunk');
    expect(asked.filter((u) => u.endsWith('/hoopbus.glb'))).toHaveLength(2);
    expect(bus.getChildMeshes().every((m) => m.isDescendantOf(bus) && !(m as Mesh).hasThinInstances)).toBe(true);
    scene.getEngine().dispose();
  });
});
