// CLOUD DECK (10-phase pass, phase 6, 2026-10-03): the racing sky was a painted dome and nothing else.
//
// Both racing modes fly/drive under the harness's painted dome (bk_dome, grown and camera-ridden by
// aeroWorlds / trackside). A flat wash reads as a ceiling, not a sky — the one thing a course at speed
// always has over it is weather. The repo holds no cloud sprite or texture (checked public/** before
// writing this), so the deck is GEOMETRY, the same flat-shaded low-poly language as everything else
// here: two merged-lobe puffs, thin-instanced (two draws, however many clouds), unlit so they read
// against the dome at any exposure, riding the camera like the dome does and drifting slowly so the
// sky moves even when you are parked on the grid.
//
// Pure placement in cloudDeckFor so the test can hold the deck deterministic and inside its band.

import { Color3, Matrix, Mesh, MeshBuilder, Quaternion, TransformNode, Vector3 } from '@babylonjs/core';
import type { Camera, Scene } from '@babylonjs/core';
import { VenueKit } from './VenueKit';

export interface CloudSpec {
  x: number; y: number; z: number;
  /** Metres across the whole puff. */
  scale: number;
  yaw: number;
  /** Which of the two puff masters. */
  lobe: number;
}

/** The deck's layout: `count` puffs across a `span`-metre square, between yLo and yHi. Deterministic for a seed. */
export function cloudDeckFor(seed = 5, count = 26, span = 1600, yLo = 120, yHi = 220): CloudSpec[] {
  let s = seed >>> 0 || 5;
  const rnd = (): number => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const out: CloudSpec[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      x: -span / 2 + rnd() * span,
      y: yLo + rnd() * (yHi - yLo),
      z: -span / 2 + rnd() * span,
      scale: 16 + rnd() * 24,
      yaw: rnd() * Math.PI * 2,
      lobe: i % 2,
    });
  }
  return out;
}

export interface CloudDeckOptions {
  seed?: number; count?: number; span?: number; yLo?: number; yHi?: number;
  /** The puff colour — the mood's sky tint, lightened. */
  tint?: string;
  /** Drift speed, m/s. The deck slides sideways this fast while it rides the camera. */
  drift?: number;
}

export interface CloudDeckHandle {
  root: TransformNode;
  update(dt: number, camera: Camera | null): void;
  dispose(): void;
}

/** A low-poly puff: two or three flattened spheres merged into one mesh (the merge bakes the offsets). */
function puff(scene: Scene, name: string, three: boolean): Mesh {
  const ball = (n: string, d: number, x: number, y: number, z: number): Mesh => {
    const m = MeshBuilder.CreateSphere(n, { diameter: d, segments: 7 }, scene);
    m.scaling.y = 0.42;
    m.position.set(x, y, z);
    m.computeWorldMatrix(true);
    return m;
  };
  const parts = [ball(`${name}_a`, 2, 0, 0, 0), ball(`${name}_b`, 1.4, -1.1, -0.12, 0.15)];
  if (three) parts.push(ball(`${name}_c`, 1.2, 1.15, 0.06, -0.2));
  const merged = Mesh.MergeMeshes(parts, true, true, undefined, false, false) ?? parts[0]!;
  merged.name = name;
  return merged;
}

export function buildCloudDeck(scene: Scene, opts: CloudDeckOptions = {}): CloudDeckHandle {
  const { seed = 5, count = 26, span = 1600, yLo = 120, yHi = 220, tint = '#f4f8ff', drift = 1.6 } = opts;
  const root = new TransformNode('cloud_deck', scene);
  const mat = VenueKit.paint(scene, `cloud_deck_${tint}`, tint, 0, 1);
  mat.unlit = true;
  mat.emissiveColor = Color3.FromHexString(tint);

  const specs = cloudDeckFor(seed, count, span, yLo, yHi);
  const masters = [puff(scene, 'cloud_puff_pair', false), puff(scene, 'cloud_puff_trio', true)];
  const bufs = [new Float32Array(specs.length * 16), new Float32Array(specs.length * 16)];
  const n = [0, 0];
  for (const c of specs) {
    Matrix.Compose(
      new Vector3(c.scale, c.scale, c.scale),
      Quaternion.FromEulerAngles(0, c.yaw, 0),
      new Vector3(c.x, c.y, c.z),
    ).copyToArray(bufs[c.lobe]!, (n[c.lobe]!) * 16);
    n[c.lobe]!++;
  }
  masters.forEach((m, i) => {
    m.material = mat;
    m.isPickable = false;
    m.alwaysSelectAsActiveMesh = true;   // the deck rides the camera; frustum-culling it would pop clouds at the frame's edge
    m.thinInstanceSetBuffer('matrix', bufs[i]!.slice(0, n[i]! * 16), 16, true);
    m.parent = root;
  });

  let t = 0;
  return {
    root,
    update(dt, camera) {
      t += dt;
      if (!camera) return;
      // ride the camera like the dome does, plus the slow drift (wrapped so the offset never grows past the span)
      const slide = (t * drift) % span;
      root.position.set(camera.position.x + slide, 0, camera.position.z + slide * 0.6);
    },
    dispose() { root.dispose(false, true); },
  };
}
