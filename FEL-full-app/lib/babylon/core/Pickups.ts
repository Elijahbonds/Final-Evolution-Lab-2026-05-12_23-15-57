// Pickups — coin lines/arcs on courses. Collected coins report through
// SessionResult stats (coinsCollected) — the SERVER validates against the
// per-run cap and pays the wallet. Client never mints currency.
//
// THIN INSTANCED (2026-09-13). This used to build ONE MESH AND ONE MATERIAL PER COIN: a forty-coin
// skatepark line was forty draw calls and — worse — forty identical StandardMaterials, each its own shader
// binding. The skate mode flags its own budget at `draws 694 > 600`, and this was the single biggest group
// in the scene (coin ×40, ahead of every piece of park furniture).
//
// One master cylinder, one material, one matrix buffer rewritten per frame. The buffer has to be dynamic
// because coins are not static scenery: they spin, the magnet drags them toward the player, and a collected
// one has to vanish on its own. A taken coin is scaled to zero rather than removed, so the buffer keeps a
// stable layout and no index ever shifts under the collection logic.

import { Matrix, MeshBuilder, Quaternion, Vector3 } from '@babylonjs/core';
import { VenueKit } from '../visual/VenueKit';
import type { Mesh, Scene } from '@babylonjs/core';

export const COIN_RUN_CAP = 60;      // must match server-side validation

/** A coin the player can still take. Position is authoritative; the matrix is derived from it each frame. */
interface Coin { pos: Vector3; taken: boolean }

export class CoinField {
  private coins: Coin[] = [];
  public collected = 0;
  private spin = 0;
  private master: Mesh | null = null;
  private buf: Float32Array | null = null;
  /** Reused so the per-frame rebuild allocates nothing. */
  private scratch = { m: Matrix.Identity(), q: Quaternion.Identity(), s: new Vector3(1, 1, 1) };

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
    this.coins.push({ pos: pos.clone(), taken: false });
    this.buf = null;                    // the layout changed; rebuilt on the next update
  }

  /** Build (or rebuild) the master and its buffer. Idempotent. */
  private ensure(): void {
    if (!this.master) {
      const m = MeshBuilder.CreateCylinder('coin', { diameter: 0.34, height: 0.05, tessellation: 16 }, this.scene);
      // PBR, AND A COIN IS THE CASE THAT MAKES THE POINT. This was a StandardMaterial with a bright gold
      // diffuse (#f5b91a) — under a rig running hemispheric 0.85 plus a directional at 2.60 that clips to
      // white, so every coin in FIVE modes was a pale blob rather than gold. Fifth occurrence of this bug
      // in two days; VenueKit.paint exists for it.
      //
      // The upgrade is not only the clipping. A coin is METAL, and metalness is a thing StandardMaterial
      // cannot express at all: as PBR it catches the venue's own light and the environment, so a coin
      // reads as gold in sun and as dull brass in shade instead of being one flat colour everywhere.
      const mat = VenueKit.paint(this.scene, 'coinMat', '#f5b91a', 0.22, 0.34);
      mat.metallic = 0.9;
      mat.freeze();                     // one material, and it never changes
      m.material = mat;
      m.isPickable = false;
      // the master itself must not render at the origin on top of its instances
      m.setEnabled(this.coins.length > 0);
      this.master = m;
    }
    if (!this.buf || this.buf.length !== this.coins.length * 16) {
      this.buf = new Float32Array(this.coins.length * 16);
      this.writeAll();
      this.master.thinInstanceSetBuffer('matrix', this.buf, 16, false);   // false: updated per frame
      this.master.setEnabled(this.coins.length > 0);
    }
  }

  /** Rewrite every coin's matrix from its current position, spin and taken state. */
  private writeAll(): void {
    if (!this.buf) return;
    const { q, s, m } = this.scratch;
    for (let i = 0; i < this.coins.length; i++) {
      const c = this.coins[i];
      // a taken coin is scaled to nothing rather than removed: the index stays put, so nothing downstream
      // has to care that the set has holes in it
      const k = c.taken ? 0 : 1;
      s.set(k, k, k);
      // the coin lies face-up (rotation.x = π/2 in the original) and spins about its own axis
      Quaternion.RotationYawPitchRollToRef(this.spin, Math.PI / 2, 0, q);
      Matrix.ComposeToRef(s, q, c.pos, m);
      m.copyToArray(this.buf, i * 16);
    }
  }

  /** Call per frame with the player position. magnetRadius eases collection. */
  update(dt: number, playerPos: Vector3, magnetRadius = 1.1): number {
    this.ensure();
    this.spin += dt * 3;
    let gained = 0;
    for (const c of this.coins) {
      if (c.taken) continue;
      const d = Vector3.Distance(c.pos, playerPos);
      if (d < magnetRadius * 0.45) {
        c.taken = true;
        if (this.collected < COIN_RUN_CAP) { this.collected++; gained++; }
      } else if (d < magnetRadius) {
        Vector3.LerpToRef(c.pos, playerPos, 10 * dt, c.pos);      // magnet pull
      }
    }
    this.writeAll();
    if (this.master && this.buf) this.master.thinInstanceBufferUpdated('matrix');
    return gained;           // caller pops "+1◆" HUD float per gain
  }

  /** How many coins are still out there — for a HUD or a test. */
  get remaining(): number {
    return this.coins.reduce((n, c) => n + (c.taken ? 0 : 1), 0);
  }

  dispose(): void {
    this.master?.material?.dispose();
    this.master?.dispose();
    this.master = null;
    this.buf = null;
    this.coins = [];
  }
}
