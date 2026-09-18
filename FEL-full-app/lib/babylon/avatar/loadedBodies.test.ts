// Gate 0 on LOADED bodies (ship pass 5, phase 6 — owner decision 2026-09-04: the 22-bone unprefixed FEL rig is the shipping
// spec; the 65-bone Mixamo tests cover the import path). Every shipped body file loads through Babylon, carries exactly the
// FEL skeleton, no `mixamorig` prefix, and passes the same rig audit the spawn path runs at import.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { NullEngine, Scene, SceneLoader } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { auditRig } from './RigValidator';

const FEL_JOINTS = 22;
const files = ['public/models/fel-hero.glb', 'public/models/fel-hero.mobile.glb', 'public/models/candidates/fel-kit-male.glb', 'public/models/candidates/fel-kit-female.glb',
  ...(existsSync('public/models/athletes') ? readdirSync('public/models/athletes').filter((f) => f.endsWith('.glb')).map((f) => `public/models/athletes/${f}`) : [])]
  .filter((f) => existsSync(f));

async function load(file: string) {
  const engine = new NullEngine(); const scene = new Scene(engine);
  const b64 = readFileSync(file).toString('base64');
  const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + b64, scene, undefined, '.glb');
  return { scene, engine, skeleton: r.skeletons[0], meshes: r.meshes };
}

describe('Gate 0 — loaded bodies', () => {
  it('ships at least the hero and the two kit bodies', () => { expect(files.length).toBeGreaterThanOrEqual(3); });
  for (const file of files) {
    it(`${file}: ${FEL_JOINTS} unprefixed joints, rig audit conforms`, async () => {
      const { scene, engine, skeleton, meshes } = await load(file);
      try {
        expect(skeleton, 'a skeleton').toBeTruthy();
        expect(skeleton.bones.length).toBe(FEL_JOINTS);
        expect(skeleton.bones.filter((b) => /^mixamorig/i.test(b.name)).map((b) => b.name)).toEqual([]);
        const report = auditRig(skeleton, meshes);
        expect(report.conforms, report.notes.join(' | ')).toBe(true);
      } finally { scene.dispose(); engine.dispose(); }
    }, 60_000);
  }
});
