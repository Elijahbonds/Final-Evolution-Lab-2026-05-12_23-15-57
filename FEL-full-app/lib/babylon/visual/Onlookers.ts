// Onlookers — World-Population Protocol L4 for the solo score-run venues.
//
// The three board sports all failed L4 with the same shape: nobody else was in
// the world. A Venice skatepark, a lift-served slope and a surf break in sight
// of a boardwalk all imply people, and the protocol's rule is that a venue
// records N-A only when it genuinely implies none ("a dawn beach may not").
//
// Two constraints shape this file:
//
//  - "Crowd REACTS to the big moment — a static crowd is set dressing." So this
//    is not scenery with a bob on it; cheer() exists and the modes call it on
//    the moment that matters (a banked run, a cleared threat, a barrel).
//  - "Crowd cost is bounded; it must never compete with characters for frame
//    budget." So it is two master meshes and hardware instances of them — a
//    figure costs a transform, not a draw call — and it never spawns a rig, a
//    skeleton or an animation group. Twelve onlookers add 2 draws.
//
// Deliberately silhouettes, not characters. At gameplay camera distance in a
// score-run mode these read as people at the edge of the park; modelling them
// any further would spend budget on something the player never looks at, and
// L5's rule is that nothing may compete with L1-L2 for attention.

import { Color3, MeshBuilder, StandardMaterial, Vector3 } from '@babylonjs/core';
import type { AbstractMesh, InstancedMesh, Scene } from '@babylonjs/core';

interface Figure {
  body: InstancedMesh;
  head: InstancedMesh;
  /** Ground height, so the bob and the cheer hop are relative to it. */
  baseY: number;
  /** Phase offset so a crowd does not breathe in unison. */
  phase: number;
}

const BOB_HEIGHT = 0.035;
const CHEER_SEC = 1.6;
const CHEER_HOP = 0.42;

export class Onlookers {
  private figures: Figure[] = [];
  private masters: AbstractMesh[] = [];
  private t = 0;
  private cheerT = 0;

  constructor(scene: Scene, spots: Vector3[], tint = '#2b3550') {
    if (spots.length === 0) return;

    const bodyM = new StandardMaterial('onlookerM', scene);
    bodyM.diffuseColor = Color3.FromHexString(tint);
    bodyM.specularColor = Color3.Black();          // matte: never draws the eye

    const body = MeshBuilder.CreateCapsule('onlooker_body', { radius: 0.19, height: 1.25 }, scene);
    const head = MeshBuilder.CreateSphere('onlooker_head', { diameter: 0.34, segments: 6 }, scene);
    body.material = bodyM; head.material = bodyM;
    body.isPickable = false; head.isPickable = false;
    // The masters themselves are parked out of sight; only instances are placed.
    // Hiding them instead would hide every instance with them.
    body.position.set(0, -500, 0); head.position.set(0, -500, 0);
    this.masters = [body, head];

    spots.forEach((p, i) => {
      const b = body.createInstance(`onlooker_b${i}`);
      const h = head.createInstance(`onlooker_h${i}`);
      b.isPickable = false; h.isPickable = false;
      b.position.set(p.x, p.y + 0.72, p.z);
      h.position.set(p.x, p.y + 1.52, p.z);
      this.figures.push({ body: b, head: h, baseY: p.y, phase: (i * 2.399) % (Math.PI * 2) });
    });
  }

  /** Call once a frame. Idle sway, plus the tail of any cheer in progress. */
  update(dt: number): void {
    if (this.figures.length === 0) return;
    this.t += dt;
    if (this.cheerT > 0) this.cheerT = Math.max(0, this.cheerT - dt);
    const excite = this.cheerT / CHEER_SEC;             // 1 -> 0 over the cheer

    for (const f of this.figures) {
      const sway = Math.sin(this.t * (1.4 + excite * 6) + f.phase);
      // A cheer is a hop that decays, on top of the idle bob.
      const lift = BOB_HEIGHT * sway + (excite > 0 ? Math.abs(Math.sin(this.t * 9 + f.phase)) * CHEER_HOP * excite : 0);
      f.body.position.y = f.baseY + 0.72 + lift;
      f.head.position.y = f.baseY + 1.52 + lift;
    }
  }

  /** The big moment happened. 0..1 — a bigger moment cheers longer. */
  cheer(strength = 1): void {
    this.cheerT = Math.max(this.cheerT, CHEER_SEC * Math.max(0.2, Math.min(1, strength)));
  }

  get count(): number { return this.figures.length; }

  dispose(): void {
    for (const f of this.figures) { f.body.dispose(); f.head.dispose(); }
    for (const m of this.masters) m.dispose();
    this.figures = []; this.masters = [];
  }
}
