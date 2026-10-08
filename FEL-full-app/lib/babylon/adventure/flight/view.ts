/**
 * The speed and flight view binder (lane A1; Babylon): speed streaks and the boom ring.
 *
 * STREAKS. racing/speedFx.SpeedLines (one stretched-billboard system riding the camera, ≤ ~70 live particles, one
 * draw), driven by movement/look.streakFracFor: a cruise is always streaking, a rail at speed and a FLOW-top run start
 * to. The camera's FOV punch is the camera hint's `fovBoost` (A4), not this file's.
 *
 * THE BOOM. One thin torus, built once and hidden. When the body crosses into cruise top speed (telemetry
 * `flight.boomAtSec`), the ring appears at the body, square to its heading, and grows and fades over BOOM_SEC.
 */

import { Color3, MeshBuilder, StandardMaterial } from '@babylonjs/core';
import type { Camera, Mesh, Scene } from '@babylonjs/core';
import { SpeedLines } from '@/lib/babylon/racing/speedFx';
import type { AdventureActor } from '../contracts';
import type { MovementTelemetry } from '../movement/index';
import { boomProgress, streakFracFor } from '../movement/look';

/** The ring's size at the start and the end of its life (m). [TUNE] */
export const BOOM_RING = { fromM: 1.2, toM: 14, alpha: 0.75, color: '#dff6ff' } as const;

export class SpeedFlightView {
  private lines: SpeedLines | null = null;
  private ring: Mesh | null = null;
  private ringMat: StandardMaterial | null = null;

  constructor(scene: Scene, camera: Camera, name: string) {
    try { this.lines = new SpeedLines(scene, camera); } catch { this.lines = null; }
    try {
      const ring = MeshBuilder.CreateTorus(`boomRing_${name}`, { diameter: 1, thickness: 0.04, tessellation: 40 }, scene);
      const mat = new StandardMaterial(`boomRingMat_${name}`, scene);
      mat.emissiveColor = Color3.FromHexString(BOOM_RING.color);
      mat.disableLighting = true;
      mat.alpha = 0;
      ring.material = mat;
      ring.isPickable = false;
      ring.setEnabled(false);
      this.ring = ring; this.ringMat = mat;
    } catch { this.ring = null; this.ringMat = null; }
  }

  /** Per rendered frame. */
  sync(a: AdventureActor | null | undefined, t: Readonly<MovementTelemetry> | null | undefined, tSec: number): void {
    if (!a || !t) { this.lines?.update(0); this.ring?.setEnabled(false); return; }
    const tm = t as MovementTelemetry;
    this.lines?.update(streakFracFor(a.state, tm));
    const ring = this.ring, mat = this.ringMat;
    if (!ring || !mat) return;
    const u = boomProgress(tm, tSec);
    if (u === null) { if (ring.isEnabled()) ring.setEnabled(false); return; }
    if (!ring.isEnabled()) ring.setEnabled(true);
    const d = BOOM_RING.fromM + (BOOM_RING.toM - BOOM_RING.fromM) * u;
    ring.position.set(a.pos.x, a.pos.y + a.height * 0.5, a.pos.z);
    ring.rotation.set(Math.PI / 2 - tm.flight.pitch, a.facingYaw, 0);   // the torus's plane square to the flight
    ring.scaling.set(d, d, d);
    mat.alpha = BOOM_RING.alpha * (1 - u);
  }

  dispose(): void {
    this.lines?.dispose(); this.lines = null;
    this.ring?.dispose(); this.ring = null;
    this.ringMat?.dispose(); this.ringMat = null;
  }
}
