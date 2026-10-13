// FOOTBALL FX (vis-court, wave 2, 2026-10-13) — the gridiron as a broadcast shows it.
//
// The audit (football): "Real floodlight towers", "Turf: … divot and scuff decals", "A broadcast first-down line (yellow overlay
// decal)", "A TD moment: pyro jets", "Pylons", "Tackle/truck impact: a turf-chunk spray plus a dust ring". One object the mode mounts
// in load() and feeds: the line of scrimmage and the line to gain each frame, a cut / a tackle / a truck / a touchdown when they happen.
//
//   towers   four floodlight towers outside the stands (court/FloodTowers: FixtureLights plants a clustered spot under each bank, so
//            the turf and the players are lit from the corners, and the foundation's glow gives the banks a halo)
//   lines    a blue line at the scrimmage and a yellow line at the first down, laid on the turf across the field (the broadcast's
//            virtual line), the yellow hidden once the line to gain is the goal line
//   pylons   four, at the corners of the end zone
//   pyro     four gold jets at the pylons on a touchdown, for two seconds
//   turf     a scuff where a cut plants, a wider one where a tackle lands, chunks of turf thrown up and a ring of dust along the ground
//
// Visual only: the line of scrimmage, the distance and every rule are the mode's; this reads them.

import { Color3, Color4, MeshBuilder, ParticleSystem, PBRMaterial, StandardMaterial, Vector3 } from '@babylonjs/core';
import type { Mesh, Scene } from '@babylonjs/core';
import { EffectsKit } from '../visual/EffectsKit';
import { buildFloodTowers, type TowersHandle } from './FloodTowers';
import { mountShockRings, type ShockRingHandle } from './ShockRing';
import { stampDecal } from './decals';
import { makeTexture } from './texture';

export interface FootballFxOpts { phone: boolean; fieldHalfW: number; goalZ: number; endZ: number }

/** Pure: where the four towers stand for a gridiron `fieldHalfW` wide: just past the stands' shoulder, near each end and the middle. */
export function footballTowers(fieldHalfW: number, goalZ: number, phone: boolean): { x: number; z: number; yaw: number }[] {
  const x = fieldHalfW + 5.5, zs = phone ? [goalZ * 0.5] : [goalZ * 0.12, goalZ * 0.88];
  const spots: { x: number; z: number; yaw: number }[] = [];
  for (const z of zs) for (const sx of [-1, 1]) spots.push({ x: sx * x, z, yaw: Math.atan2(-sx * x, -(z - goalZ / 2)) });
  return spots;
}

/** Pure: the four pylons — the goal line's corners and the end line's. */
export function pylonSpots(halfW: number, goalZ: number, endZ: number): { x: number; z: number }[] {
  const x = halfW + 0.8;
  return [{ x: -x, z: goalZ }, { x, z: goalZ }, { x: -x, z: endZ }, { x, z: endZ }];
}

/** Pure: the yellow line is drawn only while the line to gain is still on the field (short of the goal line). */
export function firstDownVisible(firstDownZ: number, goalZ: number): boolean { return firstDownZ < goalZ - 0.5; }

/** Pure: a pyro jet's strength 0..1 at `age`: it kicks in at once, burns, dies in the last third. */
export const PYRO_SEC = 2.2;
export function pyroBurn(age: number): number {
  if (age < 0 || age >= PYRO_SEC) return 0;
  return Math.min(1, age / 0.12) * Math.min(1, (PYRO_SEC - age) / 0.7);
}

export interface FootballFxHandle {
  /** Every frame: the scrimmage and the line to gain, in metres down the field. */
  update(dt: number, s: { los: number; firstDown: number }): void;
  cut(at: { x: number; z: number }, yaw: number): void;
  tackle(at: { x: number; z: number }): void;
  truck(at: { x: number; z: number }): void;
  touchdown(): void;
  readonly meshes: readonly Mesh[];
  dispose(): void;
}

export function mountFootballFx(scene: Scene, o: FootballFxOpts): FootballFxHandle {
  const made: Mesh[] = [];
  const mats: (StandardMaterial | PBRMaterial)[] = [];
  const towers: TowersHandle = buildFloodTowers(scene, footballTowers(o.fieldHalfW, o.goalZ, o.phone), { height: 15, bank: { w: 4.6, h: 2.2 } });
  const rings: ShockRingHandle = mountShockRings(scene);
  // the lines
  const lineMat = (name: string, hex: string): StandardMaterial => {
    const m = new StandardMaterial(name, scene);
    m.disableLighting = true; m.diffuseColor = Color3.Black(); m.specularColor = Color3.Black(); m.emissiveColor = Color3.FromHexString(hex); m.alpha = 0.78; m.zOffset = -3;
    mats.push(m); return m;
  };
  const losMesh = MeshBuilder.CreateGround('fel_decal_downline_los', { width: o.fieldHalfW * 2 - 1.2, height: 0.3 }, scene);
  const fdMesh = MeshBuilder.CreateGround('fel_decal_downline_first', { width: o.fieldHalfW * 2 - 1.2, height: 0.34 }, scene);
  losMesh.material = lineMat('fel_decal_downline_los_m', '#2f7bff'); fdMesh.material = lineMat('fel_decal_downline_first_m', '#ffd60a');
  for (const m of [losMesh, fdMesh]) { m.position.y = 0.075; m.isPickable = false; m.receiveShadows = false; m.alwaysSelectAsActiveMesh = true; made.push(m); }
  fdMesh.isVisible = false;
  // the pylons
  const pyM = new PBRMaterial('court_pylon_m', scene); pyM.albedoColor = Color3.FromHexString('#ff6a00'); pyM.emissiveColor = Color3.FromHexString('#ff6a00').scale(0.2); pyM.metallic = 0; pyM.roughness = 0.6; mats.push(pyM);
  for (const [i, p] of pylonSpots(o.fieldHalfW, o.goalZ, o.endZ).entries()) {
    const m = MeshBuilder.CreateBox(`court_pylon_${i}`, { width: 0.26, height: 0.46, depth: 0.26 }, scene);
    m.position.set(p.x, 0.28, p.z); m.material = pyM; m.isPickable = false; m.freezeWorldMatrix(); made.push(m);
  }
  // the pyro: four vertical jets of gold sparks at the pylons
  const dotTex = makeTexture(scene, 'fx_pyro_dot', 32, 32, (g) => {
    g.clearRect(0, 0, 32, 32); const gr = g.createRadialGradient(16, 16, 1, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,220,140,0.7)'); gr.addColorStop(1, 'rgba(255,200,100,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  });
  if (dotTex) dotTex.hasAlpha = true;
  const jets = (o.phone ? pylonSpots(o.fieldHalfW, o.goalZ, o.endZ).slice(0, 2) : pylonSpots(o.fieldHalfW, o.goalZ, o.endZ)).map((p, i) => {
    const ps = new ParticleSystem(`fx_pyro_${i}`, 90, scene);
    ps.particleTexture = dotTex; ps.emitter = new Vector3(p.x, 0.4, p.z); ps.blendMode = ParticleSystem.BLENDMODE_ADD;
    ps.billboardMode = ParticleSystem.BILLBOARDMODE_STRETCHED; ps.minScaleX = 0.35; ps.maxScaleX = 0.5; ps.minScaleY = 2.2; ps.maxScaleY = 3.4;
    ps.color1 = new Color4(1, 0.85, 0.45, 1); ps.color2 = new Color4(1, 0.6, 0.25, 1); ps.colorDead = new Color4(1, 0.4, 0.1, 0);
    ps.minSize = 0.18; ps.maxSize = 0.34; ps.minLifeTime = 0.6; ps.maxLifeTime = 1.15; ps.emitRate = 0;
    ps.direction1 = new Vector3(-0.12, 1, -0.12); ps.direction2 = new Vector3(0.12, 1, 0.12); ps.minEmitPower = 9; ps.maxEmitPower = 14;
    ps.gravity = new Vector3(0, -8, 0); ps.updateSpeed = 0.02;
    return ps;
  });
  let pyroAge = Infinity;
  const tmp = new Vector3();
  return {
    update(dt, s) {
      losMesh.position.z = s.los; losMesh.isVisible = true;
      if (firstDownVisible(s.firstDown, o.goalZ)) { fdMesh.position.z = s.firstDown; fdMesh.isVisible = true; } else fdMesh.isVisible = false;
      if (pyroAge !== Infinity) {
        pyroAge += Math.min(0.1, dt);
        const k = pyroBurn(pyroAge);
        if (k <= 0) { pyroAge = Infinity; for (const j of jets) { j.emitRate = 0; j.stop(); } }
        else for (const j of jets) j.emitRate = 90 * k;
      }
    },
    cut(at, yaw) { stampDecal(scene, 'scuff', at.x, at.z, yaw, 0.7); },
    tackle(at) {
      stampDecal(scene, 'scuff', at.x, at.z, Math.PI * 0.5, 1.5);
      tmp.set(at.x, 0.1, at.z); EffectsKit.burst(scene, tmp, 'confetti', 0.7, '#46622c');   // chunks of turf
      rings.fire({ x: at.x, z: at.z }, { radius: 1.6, color: '#d9c9a0', life: 0.55 });
    },
    truck(at) {
      stampDecal(scene, 'scuff', at.x, at.z, 0, 1.2);
      tmp.set(at.x, 0.1, at.z); EffectsKit.burst(scene, tmp, 'confetti', 0.9, '#46622c');
      rings.fire({ x: at.x, z: at.z }, { radius: 2.1, color: '#e6d7ae', life: 0.6 });
    },
    touchdown() { pyroAge = 0; for (const j of jets) j.start(); },
    get meshes() { return [...made, ...towers.meshes]; },
    dispose() { for (const j of jets) j.dispose(); dotTex?.dispose(); towers.dispose(); rings.dispose(); for (const m of made) m.dispose(); for (const m of mats) m.dispose(); },
  };
}
