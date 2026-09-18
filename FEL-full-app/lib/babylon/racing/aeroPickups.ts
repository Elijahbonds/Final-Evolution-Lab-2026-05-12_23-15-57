// AERO PICKUPS — what the balloons, bananas, missiles, mines and shield LOOK like (2026-09-15, Aero Aces like Diddy Kong
// Racing). The rules live in AeroItems.ts; this draws them. Everything is a primitive in the house PBR paint with a
// strong emissive, so a balloon's colour reads at 150 m against a red canyon, a blue lagoon or white snow alike.

import { Color3, Mesh, MeshBuilder, TransformNode, Vector3 } from '@babylonjs/core';
import type { PBRMaterial, Scene } from '@babylonjs/core';
import { VenueKit } from '../visual/VenueKit';
import { BALLOON_COLOR, ITEM_KINDS, type Balloon, type Banana, type ItemKind, type Missile, type Mine } from './AeroItems';

const glow = (scene: Scene, name: string, hex: string, e: number, r = 0.35): PBRMaterial => {
  const m = VenueKit.paint(scene, name, hex, e, r);
  m.emissiveColor = Color3.FromHexString(hex).scale(e);
  m.environmentIntensity = 0.6;
  return m;
};

/** Masters are parked far under the world rather than disabled: an instance of a DISABLED source is not drawn. */
const PARK_Y = -10000;

/** One master per look; copies are instances. */
export class AeroPickups {
  private root: TransformNode;
  private balloonMasters = new Map<ItemKind, Mesh>();
  private balloonNodes: TransformNode[] = [];
  private bananaMaster: Mesh;
  private bananaNodes: TransformNode[] = [];
  private missileMaster: Mesh;
  private mineMaster: Mesh;
  private missileNodes = new Map<Missile, TransformNode>();
  private mineNodes = new Map<Mine, TransformNode>();
  private shields = new Map<number, Mesh>();
  private t = 0;

  /** `scale` shrinks every item (the kart's balloons are 0.42 of the flyers'). */
  constructor(private scene: Scene, private scale = 1) {
    this.root = new TransformNode('aero_pickups', scene);
    for (const kind of ITEM_KINDS) {
      const m = MeshBuilder.CreateSphere(`balloon_${kind}`, { diameterX: 3.4, diameterY: 4.0, diameterZ: 3.4, segments: 14 }, scene);
      const knot = MeshBuilder.CreateCylinder(`balloon_knot_${kind}`, { height: 0.5, diameterTop: 0.5, diameterBottom: 0.1, tessellation: 8 }, scene);
      knot.position.y = -2.15;
      const string = MeshBuilder.CreateCylinder(`balloon_string_${kind}`, { height: 3, diameter: 0.06, tessellation: 4 }, scene);
      string.position.y = -3.8;
      const merged = Mesh.MergeMeshes([m, knot, string], true, true)!;
      merged.name = `balloon_${kind}`;
      merged.material = glow(scene, `balloon_mat_${kind}`, BALLOON_COLOR[kind], 0.55, 0.25);
      merged.isPickable = false; merged.position.y = PARK_Y; merged.parent = this.root;
      this.balloonMasters.set(kind, merged);
    }
    // a banana: a fat curved tube, yellow with brown tips
    const path = Array.from({ length: 9 }, (_, i) => { const a = -0.9 + (i / 8) * 1.8; return new Vector3(Math.sin(a) * 1.1, Math.cos(a) * 1.1 - 1.1, 0); });
    this.bananaMaster = MeshBuilder.CreateTube('banana', { path, radiusFunction: (i) => 0.12 + 0.2 * Math.sin(Math.PI * (i / 8)), tessellation: 10, cap: Mesh.CAP_ALL }, scene);
    this.bananaMaster.material = glow(scene, 'banana_mat', '#ffd83a', 0.4, 0.5);
    this.bananaMaster.isPickable = false; this.bananaMaster.position.y = PARK_Y; this.bananaMaster.parent = this.root;
    // a missile: body, nose, fins
    const mb = MeshBuilder.CreateCylinder('missile_body', { height: 1.6, diameter: 0.45, tessellation: 10 }, scene);
    const mn = MeshBuilder.CreateCylinder('missile_nose', { height: 0.6, diameterTop: 0, diameterBottom: 0.45, tessellation: 10 }, scene); mn.position.y = 1.1;
    const mf = MeshBuilder.CreateBox('missile_fins', { width: 1.0, height: 0.4, depth: 0.06 }, scene); mf.position.y = -0.7;
    this.missileMaster = Mesh.MergeMeshes([mb, mn, mf], true, true)!;
    this.missileMaster.rotation.x = Math.PI / 2; this.missileMaster.bakeCurrentTransformIntoVertices();
    this.missileMaster.material = glow(scene, 'missile_mat', '#ff5a4b', 0.5, 0.4);
    this.missileMaster.isPickable = false; this.missileMaster.position.y = PARK_Y; this.missileMaster.parent = this.root;
    // a mine: a green ball with spikes
    const core = MeshBuilder.CreateSphere('mine_core', { diameter: 2.2, segments: 10 }, scene);
    const spikes: Mesh[] = [core];
    for (const d of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      const s = MeshBuilder.CreateCylinder('mine_spike', { height: 0.9, diameterTop: 0, diameterBottom: 0.45, tessellation: 6 }, scene);
      const dir = new Vector3(d[0], d[1], d[2]);
      s.position.copyFrom(dir.scale(1.3));
      if (d[0]) s.rotation.z = -d[0] * Math.PI / 2; else if (d[2]) s.rotation.x = d[2] * Math.PI / 2; else if (d[1] < 0) s.rotation.x = Math.PI;
      spikes.push(s);
    }
    this.mineMaster = Mesh.MergeMeshes(spikes, true, true)!;
    this.mineMaster.material = glow(scene, 'mine_mat', '#4fdc6a', 0.45, 0.5);
    this.mineMaster.isPickable = false; this.mineMaster.position.y = PARK_Y; this.mineMaster.parent = this.root;
  }

  setBalloons(balloons: Balloon[]): void {
    for (const n of this.balloonNodes) n.dispose();
    this.balloonNodes = balloons.map((b) => {
      const inst = this.balloonMasters.get(b.kind)!.createInstance(`balloon_${b.id}`);
      inst.position.copyFrom(b.pos); inst.parent = this.root; inst.isPickable = false; inst.scaling.setAll(this.scale);
      return inst;
    });
  }

  setBananas(bananas: Banana[]): void {
    for (const n of this.bananaNodes) n.dispose();
    this.bananaNodes = bananas.map((b, i) => {
      const inst = this.bananaMaster.createInstance(`banana_${i}`);
      inst.position.copyFrom(b.pos); inst.parent = this.root; inst.isPickable = false; inst.scaling.setAll(this.scale);
      return inst;
    });
  }

  /** Every frame: bob the balloons, spin the bananas, hide what is popped / taken, follow missiles and mines. */
  update(dt: number, balloons: Balloon[], bananas: Banana[], missiles: Missile[], mines: Mine[]): void {
    this.t += dt;
    balloons.forEach((b, i) => {
      const n = this.balloonNodes[i]; if (!n) return;
      const up = b.respawn <= 0;
      n.setEnabled(up);
      if (up) { n.position.y = b.pos.y + Math.sin(this.t * 1.6 + i) * 0.6; n.rotation.y = this.t * 0.4 + i; }
    });
    bananas.forEach((b, i) => {
      const n = this.bananaNodes[i]; if (!n) return;
      n.setEnabled(!b.taken);
      if (!b.taken) { n.rotation.y = this.t * 3 + i; n.position.y = b.pos.y + Math.sin(this.t * 2.2 + i) * 0.3; }
    });
    // missiles
    for (const [m, node] of this.missileNodes) if (!missiles.includes(m)) { node.dispose(); this.missileNodes.delete(m); }
    for (const m of missiles) {
      let node = this.missileNodes.get(m);
      if (!node) { node = this.missileMaster.createInstance('missile'); node.parent = this.root; node.scaling.setAll(this.scale); this.missileNodes.set(m, node); }
      node.position.copyFrom(m.pos);
      node.rotation.set(-Math.asin(Math.max(-1, Math.min(1, m.dir.y))), Math.atan2(m.dir.x, m.dir.z), this.t * 12);
    }
    for (const [m, node] of this.mineNodes) if (!mines.includes(m)) { node.dispose(); this.mineNodes.delete(m); }
    for (const m of mines) {
      let node = this.mineNodes.get(m);
      if (!node) { node = this.mineMaster.createInstance('mine'); node.parent = this.root; this.mineNodes.set(m, node); }
      node.position.copyFrom(m.pos);
      node.rotation.y = this.t * 1.5;
      const pulse = 1 + Math.sin(this.t * 8) * (m.armT > 0 ? 0 : 0.08);
      node.scaling.setAll(pulse * this.scale);
    }
  }

  /** A shield bubble around a racer (parented to its root), shown while `on`. */
  shield(id: number, parent: TransformNode, on: boolean): void {
    let s = this.shields.get(id);
    if (!s && on) {
      s = MeshBuilder.CreateSphere(`shield_${id}`, { diameterX: 8 * this.scale, diameterY: 5 * this.scale, diameterZ: 9 * this.scale, segments: 16 }, this.scene);
      const m = glow(this.scene, `shield_mat_${id}`, '#ffd75e', 0.6, 0.2);
      m.alpha = 0.22; m.backFaceCulling = false;
      s.material = m; s.isPickable = false; s.parent = parent;
      this.shields.set(id, s);
    }
    if (s) { s.setEnabled(on); if (on) s.rotation.y = this.t * 2; }
  }

  dispose(): void {
    for (const s of this.shields.values()) s.dispose();
    this.root.dispose(false, true);
  }
}
