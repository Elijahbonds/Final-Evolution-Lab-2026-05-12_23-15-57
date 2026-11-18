// THE COAST ZONE's dressing through its real loader (zoneView loadMasters) on a NullEngine: every model's masters come back alive,
// with geometry and their material. Regression (lane/coast-islands, 2026-11-18): a clone keeps its source's parent, so the baked
// masters were disposed with the import's root and the zone drew no palms on the phone rig (114 instances, nothing on screen).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { NullEngine, Scene } from '@babylonjs/core';
import { loadMasters } from './zoneView';
import { PROP_MODELS } from './zoneLayout';

describe('the zone\'s prop masters', () => {
  it('every Kenney model loads into live, parentless masters with geometry and a material, one per material', async () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    for (const m of PROP_MODELS) {
      const file = path.resolve(__dirname, '../../../public/models/props/nature', m.file);
      const masters = await loadMasters(scene, m, `data:;base64,${fs.readFileSync(file).toString('base64')}`);
      expect(masters.length, m.id).toBeGreaterThan(0);
      for (const x of masters) {
        expect(x.isDisposed(), `${m.id} ${x.name}`).toBe(false);
        expect(x.parent).toBeNull();
        expect(x.getTotalVertices()).toBeGreaterThan(0);
        expect(x.material).toBeTruthy();
      }
      expect(new Set(masters.map((x) => x.material!.uniqueId)).size).toBe(masters.length);
    }
    scene.dispose(); engine.dispose();
  });
});
