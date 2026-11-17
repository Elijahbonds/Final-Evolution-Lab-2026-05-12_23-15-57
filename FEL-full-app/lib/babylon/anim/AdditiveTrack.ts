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

// hoops-perf (2026-11-12): allocation-free. Every hoops body runs these per bone per frame; the old form made a fresh array for each
// base and each write, and a `number | null` field boxes every number written to it (V8 stores a double in a field that once held
// null as a new heap number per write). Same comparisons, same values: `has` stands for "lastWritten !== null".
export class AdditiveScalar {
  private has = false;
  private lastWritten = 0;
  private base = 0;
  /** Given the current value, return the base to add the delta to. */
  baseFor(current: number): number {
    if (this.has && Math.abs(current - this.lastWritten) <= 1e-7) return this.base;
    this.base = current;
    return current;
  }
  /** Record what we wrote. */
  wrote(value: number): void { this.lastWritten = value; this.has = true; }
  reset(): void { this.has = false; }
}

/** Same rule for quaternions (x,y,z,w) — compared component-wise. The returned base is this track's own array: read it before the
 *  next baseFor. */
export class AdditiveQuat {
  private has = false;
  private readonly lastWritten: [number, number, number, number] = [0, 0, 0, 0];
  private readonly base: [number, number, number, number] = [0, 0, 0, 1];
  baseFor(x: number, y: number, z: number, w: number): [number, number, number, number] {
    const l = this.lastWritten;
    if (this.has && Math.abs(x - l[0]) <= 1e-7 && Math.abs(y - l[1]) <= 1e-7 && Math.abs(z - l[2]) <= 1e-7 && Math.abs(w - l[3]) <= 1e-7) return this.base;
    const b = this.base; b[0] = x; b[1] = y; b[2] = z; b[3] = w;
    return b;
  }
  wrote(x: number, y: number, z: number, w: number): void { const l = this.lastWritten; l[0] = x; l[1] = y; l[2] = z; l[3] = w; this.has = true; }
  reset(): void { this.has = false; }
}
