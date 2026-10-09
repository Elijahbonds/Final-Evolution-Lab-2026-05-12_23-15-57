/**
 * Flight tuning (lane A1; docs/ADVENTURE-PLAN.md pillar 2 "Flight (fused only, or on a flying partner)").
 *
 * Two feels, both feel references only (the plan's IP line): FREE flight — hover, move in 3D, ascend and descend, a
 * dash burst, fight in the air — and CRUISE — hold the dash past a speed and you go fast, turning by banking, with a
 * boom as you cross into top speed. Every number is a starting value, [TUNE]; the plan fixed most of them.
 */

import type { FlightParams } from '../contracts';

export const DEFAULT_FLIGHT: Readonly<FlightParams> = Object.freeze({
  freeSpeed: 14,              // [TUNE] plan
  freeAccel: 26,              // [TUNE] m/s²: a hover that answers the stick inside ~0.5 s
  ascendSpeed: 8,             // [TUNE] plan
  descendSpeed: 10,           // [TUNE] plan
  dashSpeed: 30,              // [TUNE] plan: a 30 m/s burst
  dashSec: 0.35,              // [TUNE] plan
  cruiseEnterSpeed: 18,       // [TUNE] plan: cruise from 18 m/s
  cruiseSpeed: 40,            // [TUNE] plan: to 40 m/s
  cruiseAccel: 9,             // [TUNE] m/s²: 18 → 40 in about 2.5 s
  cruiseTurnRate: 1.5,        // [TUNE] rad/s at full bank (a 180° turn in ~2 s at full chat)
  cruiseBankMaxRad: Math.PI / 3,   // [TUNE] plan: a 60° bank
  drainPerSec: Object.freeze({ free: 4, cruise: 8 }) as FlightParams['drainPerSec'],   // [TUNE] plan: energy 4/s free, 8/s cruise
  dashCost: 10,               // [TUNE] plan
  ceilingY: 120,              // [TUNE] the default world ceiling; the BR zone lowers its own
  landClearanceM: 0.6,        // [TUNE] descending this close to the ground lands you
}) as Readonly<FlightParams>;

/** Extra flight tuning the contract's FlightParams does not carry (A1-internal). */
export interface FlightExtra {
  /** How quickly the bank follows the stick in cruise (1/s). [TUNE] */
  bankEase: number;
  /** The most the nose climbs or dives in cruise (rad) and how quickly it follows (1/s). [TUNE] */
  maxPitch: number;
  pitchEase: number;
  /** A dive may push cruise past its top by this share. [TUNE] */
  diveOverspeed: number;
  /** m/s² of gravity along the nose in cruise (diving gains, climbing costs). [TUNE] */
  noseGravity: number;
  /** The glide at zero energy / stamina: sink speed and the share of free speed kept. [TUNE] */
  glideSink: number;
  glideSpeedShare: number;
  /** Energy (or mount stamina) needed to climb back out of a forced glide. [TUNE] */
  glideResume: number;
  /** The boom: crossing this share of cruise speed fires it once per cruise. [TUNE] */
  boomShare: number;
  /** Cruise keeps this far off a world bound, steering back in when it gets closer (m). [TUNE] */
  boundMargin: number;
  /** Cruise keeps this much air under it (m). [TUNE] */
  cruiseFloorM: number;
  /** Flight speed per fusion tier (×(1 + this × tier)). [TUNE] */
  tierSpeed: number;
  /** A mount's flight stamina regenerates this fast on the ground (EvolutionGarden.FlightController's +6/s). */
  mountRegenPerSec: number;
}

export const DEFAULT_FLIGHT_EXTRA: Readonly<FlightExtra> = Object.freeze({
  bankEase: 5, maxPitch: 0.6, pitchEase: 3, diveOverspeed: 0.15, noseGravity: 9.81, glideSink: 3, glideSpeedShare: 0.6,
  glideResume: 10, boomShare: 0.92, boundMargin: 24, cruiseFloorM: 1.5, tierSpeed: 0.06, mountRegenPerSec: 6,
});

/** The world's flight box: a ceiling comes from FlightParams, the sides from here (contract request: AdventureWorld.bounds). */
export interface WorldBounds { minX: number; maxX: number; minZ: number; maxZ: number }
