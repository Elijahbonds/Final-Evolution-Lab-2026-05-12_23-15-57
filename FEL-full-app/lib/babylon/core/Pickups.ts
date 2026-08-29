// Pickups — coin lines/arcs on courses. Collected coins report through
// SessionResult stats (coinsCollected) — the SERVER validates against the
// per-run cap and pays the wallet. Client never mints currency.

import { Color3, MeshBuilder, StandardMaterial, Vector3 } from '@babylonjs/core';
import type { AbstractMesh, Scene } from '@babylonjs/core';

export const COIN_RUN_CAP = 60;      // must match server-side validation

export class CoinField {
  private coins: { mesh: AbstractMesh; taken: boolean }[] = [];
  public collected = 0;
  private spin = 0;

  constructor(private scene: Scene) {}

  /** Straight line of coins between two points. */
  line(from: Vector3, to: Vector3, count: number): void {
    for (let i = 0; i < count; i++) {
      this.place(Vector3.Lerp(from, to, count === 1 ? 0 : i / (count - 1)));
    }
  }

  /** Air arc (rewards the risk line off a kicker). */
  arc(from: Vector3, to: Vector3, apexAbove: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : i / (count - 1);
      const p = Vector3.Lerp(from, to, t);
      p.y += Math.sin(t * Math.PI) * apexAbove;
      this.place(p);
    }
  }

  private place(pos: Vector3): void {
    const mesh = MeshBuilder.CreateCylinder(`coin_${this.coins.length}`,
      { diameter: 0.34, height: 0.05, tessellation: 16 }, this.scene);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.copyFrom(pos);
    const mat = new StandardMaterial('coinMat', this.scene);
    mat.diffuseColor = Color3.FromHexString('#f5b91a');
    mat.emissiveColor = Color3.FromHexString('#8a6200');
    mesh.material = mat;
    mesh.isPickable = false;
    this.coins.push({ mesh, taken: false });
  }

  /** Call per frame with the player position. magnetRadius eases collection. */
  update(dt: number, playerPos: Vector3, magnetRadius = 1.1): number {
    this.spin += dt * 3;
    let gained = 0;
    for (const c of this.coins) {
      if (c.taken) continue;
      c.mesh.rotation.y = this.spin;
      const d = Vector3.Distance(c.mesh.position, playerPos);
      if (d < magnetRadius * 0.45) {
        c.taken = true;
        c.mesh.setEnabled(false);
        if (this.collected < COIN_RUN_CAP) { this.collected++; gained++; }
      } else if (d < magnetRadius) {
        // magnet pull
        c.mesh.position = Vector3.Lerp(c.mesh.position, playerPos, 10 * dt);
      }
    }
    return gained;           // caller pops "+1◆" HUD float per gain
  }

  dispose(): void {
    this.coins.forEach((c) => c.mesh.dispose());
    this.coins = [];
  }
}
