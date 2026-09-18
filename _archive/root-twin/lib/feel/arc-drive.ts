/**
 * lib/feel/arc-drive.ts
 * =====================
 * M9 — hybrid animation↔physics blend (mode-agnostic).
 *
 * TypeScript port of the proven engineering-line ArcDrive
 * (FEEL_REFERENCE_SPEC §5). Drives a body along an idealized parametric arc
 * (dunk drive, grind lock-on, spike approach) and hands control back to
 * physics WITHOUT a jerk: position is continuous by construction (arc end =
 * sim position) and the caller receives the arc-end vertical velocity to
 * seed the physics handback.
 *
 * Zero-alloc: begin() copies into preallocated vectors; advance() writes
 * into a caller-provided out vector.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface ArcDriveOpts {
  start: Vec3;
  target: Vec3;
  /** Absolute peak height of the arc (must be ≥ max(start.y, target.y)). */
  apexY: number;
  durationMs: number;
}

export class ArcDrive {
  active = false;
  t = 0;
  private _durationSec = 0;
  private _start: Vec3 = { x: 0, y: 0, z: 0 };
  private _target: Vec3 = { x: 0, y: 0, z: 0 };
  private _apexY = 0;

  begin({ start, target, apexY, durationMs }: ArcDriveOpts): void {
    this._start.x = start.x;
    this._start.y = start.y;
    this._start.z = start.z;
    this._target.x = target.x;
    this._target.y = target.y;
    this._target.z = target.z;
    this._apexY = Math.max(apexY, start.y, target.y);
    this._durationSec = Math.max(0.05, durationMs / 1000);
    this.t = 0;
    this.active = true;
  }

  cancel(): void {
    this.active = false;
    this.t = 0;
  }

  /**
   * Advance by dt and write the arc position into `out`.
   * @returns true when the arc completed on this step.
   */
  advance(dt: number, out: Vec3): boolean {
    if (!this.active) return false;
    this.t = Math.min(1, this.t + dt / this._durationSec);
    const t = this.t;

    // Horizontal: smoothstep-eased lerp (committed, weighty approach).
    const e = t * t * (3 - 2 * t);
    out.x = this._start.x + (this._target.x - this._start.x) * e;
    out.z = this._start.z + (this._target.z - this._start.z) * e;

    // Vertical: piecewise parabola through the apex at t=0.5.
    out.y = this._verticalAt(t);

    if (t >= 1) {
      this.active = false;
      return true;
    }
    return false;
  }

  /** Vertical velocity (m/s) at the arc end — seeds the physics handback. */
  endVerticalVelocity(): number {
    const dt = 0.016;
    return (this._verticalAt(1) - this._verticalAt(1 - dt / this._durationSec)) / dt;
  }

  private _verticalAt(t: number): number {
    const s = this._start.y;
    const a = this._apexY;
    const g = this._target.y;
    if (t < 0.5) {
      const u = t / 0.5; // rise half: parabola s → apex
      return s + (a - s) * (1 - (1 - u) * (1 - u));
    }
    const u = (t - 0.5) / 0.5; // fall half: parabola apex → target
    return a - (a - g) * u * u;
  }
}

export default ArcDrive;
