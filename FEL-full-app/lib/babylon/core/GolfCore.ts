// GolfCore — Golf Mode Phase 1: the three-stage swing on the existing
// timing-window infrastructure (aimSwingCore's PowerMeter family — this
// EXTENDS it, doesn't fork it).
//
//   ThreeClickSwing — press 1 sets BACKSWING POWER (oscillating meter),
//     press 2 starts the DOWNSWING (a faster falling meter), press 3 is
//     IMPACT timing (tight window). Each stage's accuracy feeds the shot:
//     power accuracy → distance; downswing tempo → face control; impact
//     timing → dispersion + shape. All three matter; none is a reskin.
//   Clubs — a real bag: carry/loft/roll/dispersion differ per club. [TUNE]
//   Lies — fairway/rough/sand/green modify contact quality. [TUNE]
//
// Every number marked [TUNE] is a placeholder for the balance pass.

import { PowerMeter } from '../modes/aimSwingCore';

export interface Club {
  id: string;
  label: string;
  carryM: number;           // [TUNE] stock carry at full power
  loftDeg: number;          // [TUNE]
  rollM: number;            // [TUNE] expected roll-out
  dispersion01: number;     // [TUNE] baseline sideways error
  isPutter?: boolean;
}

export const BAG: Club[] = [
  { id: 'driver', label: 'DRIVER', carryM: 240, loftDeg: 10.5, rollM: 25, dispersion01: 0.5 },
  { id: 'wood3', label: '3-WOOD', carryM: 205, loftDeg: 15, rollM: 18, dispersion01: 0.42 },
  { id: 'iron7', label: '7-IRON', carryM: 150, loftDeg: 34, rollM: 6, dispersion01: 0.3 },
  { id: 'wedge', label: 'WEDGE', carryM: 95, loftDeg: 54, rollM: 2, dispersion01: 0.2 },
  { id: 'putter', label: 'PUTTER', carryM: 12, loftDeg: 3, rollM: 12, dispersion01: 0.08, isPutter: true },
];

export type Lie = 'fairway' | 'rough' | 'sand' | 'green' | 'tee';
export const LIE_CONTACT: Record<Lie, number> = {
  tee: 1.0, fairway: 1.0, rough: 0.82, sand: 0.68, green: 1.0,   // [TUNE]
};

export type SwingStage = 'idle' | 'backswing' | 'downswing' | 'impact' | 'done';

export interface SwingResult {
  power01: number;            // distance
  face01: number;             // 1 = square (downswing tempo)
  impact01: number;           // 1 = flushed (impact timing)
  shape: 'draw' | 'fade' | 'straight' | 'hook' | 'slice';
  distanceScale: number;      // power × face × lie
  dispersionRad: number;      // sideways launch error
}

export class ThreeClickSwing {
  stage: SwingStage = 'idle';
  private power = new PowerMeter();
  private downT = 0;
  private powerAt = 0;
  private tempoAt = 0;
  static readonly IMPACT_WINDOW_SEC = 0.14;   // [TUNE] putting tightens this

  begin(): void {
    this.stage = 'backswing';
    this.power.start();
  }

  /** Press 1: lock power, start the downswing. */
  clickPower(dt: number): void {
    if (this.stage !== 'backswing') return;
    this.power.update(dt);
    this.powerAt = this.power.stop();
    this.stage = 'downswing';
    this.downT = 0;
  }

  /** Press 2: impact timing (during the falling meter). */
  clickImpact(dt: number): SwingResult | null {
    if (this.stage !== 'downswing') return null;
    this.downT += dt;
    this.stage = 'done';
    // tempo: downswing should take ~0.5s [TUNE]; impact window around it
    const tempo01 = Math.max(0, 1 - Math.abs(this.downT - 0.5) / 0.5);
    return this.resolve(tempo01);
  }

  /** Timeout (never pressed impact): the flub. */
  update(dt: number): SwingResult | null {
    if (this.stage === 'backswing') this.power.update(dt);
    if (this.stage === 'downswing') {
      this.downT += dt;
      if (this.downT > 0.5 + ThreeClickSwing.IMPACT_WINDOW_SEC * 2.2) {
        this.stage = 'done';
        return this.resolve(0);
      }
    }
    return null;
  }

  private resolve(tempo01: number): SwingResult {
    const power01 = this.powerAt;
    const face01 = tempo01;
    const impact01 = tempo01;                    // one read for now; HUD shows both
    const err = 1 - face01;
    const shape: SwingResult['shape'] =
      err < 0.12 ? 'straight' : err < 0.3 ? (this.downT < 0.5 ? 'draw' : 'fade') : (this.downT < 0.5 ? 'hook' : 'slice');
    return {
      power01, face01, impact01, shape,
      distanceScale: power01 * (0.55 + face01 * 0.45),
      dispersionRad: err * 0.16,                 // [TUNE] max ~9° offline on a bad tempo
    };
  }

  reset(): void { this.stage = 'idle'; this.downT = 0; }
}

/** Full shot resolution: swing × club × lie → launch params. */
export function resolveShot(r: SwingResult, club: Club, lie: Lie): {
  carryM: number; rollM: number; launchDeg: number; offlineRad: number;
} {
  const contact = LIE_CONTACT[lie];
  return {
    carryM: club.carryM * r.distanceScale * contact,
    rollM: club.rollM * r.distanceScale * (lie === 'green' ? 1.4 : 1),
    launchDeg: club.loftDeg * (0.9 + r.face01 * 0.2),
    offlineRad: r.dispersionRad + club.dispersion01 * 0.06 * (1 - r.impact01),
  };
}
