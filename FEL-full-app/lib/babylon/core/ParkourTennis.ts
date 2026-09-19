// PARKOUR TENNIS — the glass-cage rally (owner brief, 2026-09-18: "Parkour Tennis — glass-cage rally").
//
// Pure reads on the rally the net-sport factory already plays (a parametric flight from → to, judged at the landing):
//   · THE CAGE. Side and back glass around the court: a ball that would be WIDE or LONG is live off the glass instead —
//     the flight is mirrored across the pane it hits and comes back into play.
//   · THE WALL RUN. A return taken AT the glass is a wall-run return: a wider angle, a faster ball.
//   · THE AERIALS. A deep lob is a run up the back glass for an OVERHEAD SMASH; a short ball is a NET VAULT into the
//     METEOR SMASH (the energy gauge pays for it). Both are fast and hard to answer.
//   · THE MULTIPLIER. Every glass return and every aerial raises the rally's multiplier: the ball speeds up with it and a
//     point won pays style by it.

import type { RallyConfig, RallyFault, TennisShot } from './RallyCore';

export interface P2 { x: number; z: number }

export const CAGE = { sideM: 1.2, backM: 1.6, height: 3.2 } as const;
export function glassX(cfg: RallyConfig): number { return cfg.halfWidth + CAGE.sideM; }
export function backZ(cfg: RallyConfig): number { return cfg.halfLength + CAGE.backM; }
export type CageHit = 'side' | 'back' | null;
/** Has the ball reached a pane this frame (each pane once a flight)? */
export function cageCross(pos: P2, cfg: RallyConfig, bouncedSide: boolean, bouncedBack: boolean): CageHit {
  if (!bouncedSide && Math.abs(pos.x) >= glassX(cfg)) return 'side';
  if (!bouncedBack && Math.abs(pos.z) >= backZ(cfg)) return 'back';
  return null;
}
/** Reflect a flight across a pane: both endpoints mirrored, so the point ON the pane stays and the rest of the path comes back. */
export function mirrorShot(shot: { from: P2; to: P2 }, axis: 'x' | 'z', lineAt: number): void {
  if (axis === 'x') { shot.from.x = 2 * lineAt - shot.from.x; shot.to.x = 2 * lineAt - shot.to.x; }
  else { shot.from.z = 2 * lineAt - shot.from.z; shot.to.z = 2 * lineAt - shot.to.z; }
}
/** Which faults the cage turns into live balls (the net is still the net). */
export function liveOffGlass(fault: RallyFault | null): boolean { return fault === 'wide' || fault === 'long'; }

export const WALLRUN = { atGlassM: 0.7, paceMult: 1.15, multAdd: 1 } as const;
/** A return taken with the body at the glass. */
export function wallRunRead(footX: number, halfWidth: number): boolean { return Math.abs(footX) >= halfWidth - WALLRUN.atGlassM; }

export const SMASH = { deepShare: 0.8, shortM: 5, paceMult: 1.3, meteorMult: 1.5, meteorEnergy: 60, multAdd: 2, aiMissAdd: 0.3 } as const;
export type AerialKind = 'backwall' | 'meteor' | null;
/** What R1 does on this incoming ball: up the back glass for a deep lob, over the net for a short one (with the energy). */
export function aerialRead(toZ: number, cfg: RallyConfig, incoming: TennisShot | undefined, energy: number, energyOn: boolean): AerialKind {
  const depth = Math.abs(toZ);
  if (incoming === 'lob' && depth >= cfg.halfLength * SMASH.deepShare) return 'backwall';
  if (depth <= SMASH.shortM && (!energyOn || energy >= SMASH.meteorEnergy)) return 'meteor';
  return null;
}

export const MULT = { max: 5, pacePer: 0.08, ptsPer: 10 } as const;
export function multStep(mult: number, add: number): number { return Math.min(MULT.max, mult + add); }
/** The flight's duration factor at this multiplier (faster as it climbs). */
export function paceFor(mult: number): number { return 1 / (1 + MULT.pacePer * (Math.max(1, mult) - 1)); }
export function stylePts(mult: number): number { return MULT.ptsPer * Math.max(1, mult); }
