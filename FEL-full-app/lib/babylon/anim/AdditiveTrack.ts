// AdditiveTrack — apply a per-frame additive delta on top of whatever the
// animation wrote, WITHOUT compounding when the animation left the value alone.
//
// The bug this fixes (2026-09-03): SecondaryMotion multiplied its breath and
// sway deltas onto a bone's current rotation every frame. On bones the running
// clip rewrites each frame that is right; on bones it leaves alone (the Closet
// idle keys neither Spine2 nor Hips) the deltas compounded and the body drifted
// apart into scattered blocks. The rule: if the value we see is exactly the
// value we wrote last frame, the animation did not touch it — reuse the base;
// otherwise the animation wrote a fresh value — that is the new base.

export class AdditiveScalar {
  private lastWritten: number | null = null;
  private base = 0;
  /** Given the current value, return the base to add the delta to. */
  baseFor(current: number): number {
    if (this.lastWritten !== null && Math.abs(current - this.lastWritten) <= 1e-7) return this.base;
    this.base = current;
    return current;
  }
  /** Record what we wrote. */
  wrote(value: number): void { this.lastWritten = value; }
  reset(): void { this.lastWritten = null; }
}

/** Same rule for quaternions (x,y,z,w) — compared component-wise. */
export class AdditiveQuat {
  private lastWritten: [number, number, number, number] | null = null;
  private base: [number, number, number, number] = [0, 0, 0, 1];
  baseFor(x: number, y: number, z: number, w: number): [number, number, number, number] {
    const l = this.lastWritten;
    if (l && Math.abs(x - l[0]) <= 1e-7 && Math.abs(y - l[1]) <= 1e-7 && Math.abs(z - l[2]) <= 1e-7 && Math.abs(w - l[3]) <= 1e-7) return this.base;
    this.base = [x, y, z, w];
    return this.base;
  }
  wrote(x: number, y: number, z: number, w: number): void { this.lastWritten = [x, y, z, w]; }
  reset(): void { this.lastWritten = null; }
}
