// SnowGhost — the rider you are racing on the slalom: you, on your best finished run (IMPROVE 2026-10-06, snow item 10).
//
// A slalom with a time par is built for racing yourself, and the mode had no memory of a run. The recording, the per-course
// storage and the lookup are the racing library's (racing/ghost: GhostRecorder, loadGhost, saveIfFaster, ghostAtTime); this is
// only the body that rides it — a see-through rider on a board, lit by nothing, casting nothing, picked by nothing.
//
// Minimal by design: a capsule body and a board, posed by position and heading. A fuller version would replay a skinned
// rider with the run's own carve, tricks and roll (record the root's roll and the trick ids, play them on a second rig).
import { Color3, MeshBuilder, StandardMaterial, TransformNode } from '@babylonjs/core';
import type { Mesh, Scene } from '@babylonjs/core';

export class SnowGhost {
  private readonly root: TransformNode;
  private readonly parts: Mesh[];
  private readonly mat: StandardMaterial;

  constructor(scene: Scene, hex = '#7dd3fc') {
    this.root = new TransformNode('snow_ghost', scene);
    const m = new StandardMaterial('snow_ghost_m', scene);
    m.disableLighting = true; m.emissiveColor = Color3.FromHexString(hex);
    m.diffuseColor = Color3.Black(); m.specularColor = Color3.Black();
    m.alpha = 0.32; m.backFaceCulling = true;
    this.mat = m;
    const body = MeshBuilder.CreateCapsule('snow_ghost_body', { height: 1.55, radius: 0.24, tessellation: 10 }, scene);
    body.position.y = 0.85;
    const head = MeshBuilder.CreateSphere('snow_ghost_head', { diameter: 0.3, segments: 8 }, scene);
    head.position.y = 1.78;
    const board = MeshBuilder.CreateBox('snow_ghost_board', { width: 0.3, height: 0.04, depth: 1.45 }, scene);
    board.position.y = 0.03;
    // the board rides across the body's line (a snowboarder stands sideways): the body faces across, the board down the heading
    body.rotation.y = Math.PI / 2;
    this.parts = [body, head, board];
    for (const p of this.parts) { p.parent = this.root; p.material = m; p.isPickable = false; p.receiveShadows = false; }
    this.root.setEnabled(false);
  }

  /** Put the ghost at a recorded sample; `null` hides it (no ghost, or the run is past its end). */
  place(at: { x: number; y: number; z: number; yaw?: number } | null): void {
    if (!at) { if (this.root.isEnabled()) this.root.setEnabled(false); return; }
    this.root.position.set(at.x, at.y, at.z);
    this.root.rotation.y = at.yaw ?? 0;
    if (!this.root.isEnabled()) this.root.setEnabled(true);
  }

  /** The meshes (the mode keeps them out of the shadow map with its other decor). */
  get meshes(): readonly Mesh[] { return this.parts; }

  dispose(): void { for (const p of this.parts) p.dispose(); this.mat.dispose(); this.root.dispose(); }
}
