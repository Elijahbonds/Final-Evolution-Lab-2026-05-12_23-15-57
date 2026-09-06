// Onlookers — World-Population Protocol L4 for the solo score-run venues.
//
// A Venice skatepark, a lift-served slope, a surf break in sight of a boardwalk, a pit fight: all imply people. The first
// version was capsule silhouettes (two instanced masters, 2 draws) — the owner's read on 2026-09-05 was "fix the arms of
// the NPCs": armless pills on the rail. Ship Pass 6 phase 3: onlookers are now ROSTER BODIES (athleteRoster, tinted seeds
// so the same spots get the same people every session), idling on the spot, capped so a crowd never competes with the
// athletes for frame budget (MAX_BODIES × ~6 draws). The constructor keeps its shape — modes construct it synchronously
// and call update(dt) and cheer(strength); the bodies land a moment later.
import { Vector3 } from '@babylonjs/core';
import type { Scene, TransformNode } from '@babylonjs/core';
import { CharacterLibrary, type SpawnedCharacter } from '../core/CharacterLibrary';
import { DEFAULT_HERO_URL } from '../core/athleteRoster';

interface Figure { char: SpawnedCharacter; root: TransformNode; baseY: number; phase: number }

const BOB_HEIGHT = 0.02;
const CHEER_SEC = 1.6;
const CHEER_HOP = 0.3;
export const MAX_BODIES = 8;
/** Seed colours → deterministic roster picks; the roster's baked kit ignores the tint itself. */
const SEEDS = ['#3E5A70', '#F25F5C', '#2EC4B6', '#FFBF47', '#5B8DEF', '#B07CF5', '#7BD389', '#E27D60'];

export class Onlookers {
  private figures: Figure[] = [];
  private t = 0;
  private cheerT = 0;
  private disposed = false;
  private requested = 0;
  /** Bodies this crowd asked for (the headless checks count the crowd before the spawns land). */
  get count(): number { return Math.max(this.requested, this.figures.length); }

  constructor(scene: Scene, spots: Vector3[], tint = '#2b3550', lookAt: Vector3 = Vector3.Zero()) {
    if (spots.length === 0) return;
    // spread the cap over the spots so a long rail still reads populated end to end
    const step = Math.max(1, Math.ceil(spots.length / MAX_BODIES));
    const chosen = spots.filter((_, i) => i % step === 0).slice(0, MAX_BODIES);
    this.requested = chosen.length;
    chosen.forEach((p, i) => {
      const seed = SEEDS[(i + tint.length) % SEEDS.length];
      const yaw = Math.atan2(lookAt.x - p.x, lookAt.z - p.z);   // face the action
      void CharacterLibrary.spawn(scene, DEFAULT_HERO_URL, { position: p.clone(), yawRad: yaw, tint: seed, startClip: 'idle', identity: false })
        .then((char) => {
          if (this.disposed) { char.dispose(); return; }
          for (const m of char.root.getChildMeshes()) m.isPickable = false;
          this.figures.push({ char, root: char.root, baseY: p.y, phase: (i * 2.399) % (Math.PI * 2) });
        })
        .catch((e) => console.warn('[FEL-ONLOOKERS] body did not spawn', (e as Error)?.message ?? e));
    });
  }

  /** Call once a frame. A slow breathe, plus the tail of any cheer in progress. */
  update(dt: number): void {
    if (this.figures.length === 0) return;
    this.t += dt;
    if (this.cheerT > 0) this.cheerT = Math.max(0, this.cheerT - dt);
    const excite = this.cheerT / CHEER_SEC;
    for (const f of this.figures) {
      const sway = Math.sin(this.t * (1.4 + excite * 6) + f.phase);
      const lift = BOB_HEIGHT * sway + (excite > 0 ? Math.abs(Math.sin(this.t * 9 + f.phase)) * CHEER_HOP * excite : 0);
      f.root.position.y = f.baseY + lift;
    }
  }

  /** The big moment happened. 0..1 — a bigger moment cheers longer. */
  cheer(strength = 1): void {
    this.cheerT = Math.max(this.cheerT, CHEER_SEC * Math.max(0.2, Math.min(1, strength)));
    for (const f of this.figures) { try { f.char.animator?.play?.('cheer', { loop: false }); } catch { /* no cheer clip on this body — the hop carries it */ } }
  }

  dispose(): void {
    this.disposed = true;
    for (const f of this.figures) f.char.dispose();
    this.figures = [];
  }
}
