// Surf water morphs (Phase4 notes): the Surf clip carries no morph channel, so code drives wing_to_fin, tail_fin and water_spots.
// In Surf: fins 0→1 over 0.25 s (ease-out), spots 0→1 over 0.4 s. Leaving Surf (LaunchOff or Glide): fins 1→0 over 0.25 s; the
// spots hold 1.0 for 1.5 s, then fade over 1.0 s, so the dragon reads wet after it leaves the water. Seconds, never frames.
import { SURF_FIN_IN_SEC, SURF_FIN_OUT_SEC, SURF_SPOTS_HOLD_SEC, SURF_SPOTS_IN_SEC, SURF_SPOTS_OUT_SEC } from './dragonRideConsts';

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOut = (u: number) => 1 - (1 - u) * (1 - u);

export interface SurfMorphWeights { wing_to_fin: number; tail_fin: number; water_spots: number }

export class SurfMorphDriver {
  private fin = 0;          // linear progress 0..1 (eased on read)
  private spots = 0;
  private dryFor = 0;       // seconds since Surf ended (Infinity before any Surf)
  private inSurf = false;

  constructor() { this.dryFor = Number.POSITIVE_INFINITY; }

  /** Advance `dt` seconds; `surfing` is the code's Surf state this frame. */
  update(dt: number, surfing: boolean): SurfMorphWeights {
    const d = Number.isFinite(dt) && dt > 0 ? dt : 0;
    if (surfing) {
      this.inSurf = true; this.dryFor = 0;
      this.fin = clamp01(this.fin + d / SURF_FIN_IN_SEC);
      this.spots = clamp01(this.spots + d / SURF_SPOTS_IN_SEC);
    } else {
      if (this.inSurf) { this.inSurf = false; this.dryFor = 0; }
      this.fin = clamp01(this.fin - d / SURF_FIN_OUT_SEC);
      const before = this.dryFor;
      this.dryFor += d;
      const fadeFrom = Math.max(before, SURF_SPOTS_HOLD_SEC);
      const fadeSec = Math.max(0, this.dryFor - fadeFrom);
      if (this.dryFor > SURF_SPOTS_HOLD_SEC) this.spots = clamp01(this.spots - fadeSec / SURF_SPOTS_OUT_SEC);
    }
    return this.weights();
  }

  weights(): SurfMorphWeights {
    const f = clamp01(easeOut(this.fin));   // one curve both ways: leaving mid-ramp never pops
    return { wing_to_fin: f, tail_fin: f, water_spots: clamp01(this.spots) };
  }
}
