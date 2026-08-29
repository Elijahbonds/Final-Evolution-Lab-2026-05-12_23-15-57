// All per-mode tuning in one place (M16 rule: no magic numbers in mode code).

import { Vector3 } from '@babylonjs/core';
import type { VenueMood } from '../scene/moods';
import type { GrindLine } from '../core/GroundRide';

const HERO_URL = '/models/elijah-hero.glb';

// ── M39 Board rides (procedural worlds via rideWorlds.ts) ────────────────────
export const RIDE_CONFIG = { heroUrl: HERO_URL };

// ── M40 Precision sports (tennis / golf / baseball / soccer) ─────────────────
export const PRECISION_CONFIG = { heroUrl: HERO_URL };

// ── Dunk Contest ────────────────────────────────────────────────────────────
export const DUNK_CONFIG = {
  heroUrl: HERO_URL,
  startZ: 8.5, gatherZ: 2.2, rimZ: -0.6, rimHeight: 3.05,
  qteWindowSec: 0.28,
  target: 21,
  rivalMakeChance: 0.55,
};

// ── Karate Endless ──────────────────────────────────────────────────────────
export const KARATE_CONFIG = {
  heroUrl: HERO_URL,
  baseEnemies: 3, maxEnemies: 6, enemyHp: 30,
  waveClearBeatMs: 2200,
  enemyTints: ['#8b1e2d', '#1e3a8b', '#1e8b4e', '#6b1e8b', '#8b6b1e'],
};

// ── Street Football ─────────────────────────────────────────────────────────
export const FOOTBALL_CONFIG = {
  heroUrl: HERO_URL, defenderTint: '#20303f',
  fieldYards: 80, yardsToGain: 20, downs: 4,
  graceYards: 15, lines: 6, lineSpacingYards: 11, defendersPerLine: 3,
  metersPerYard: 0.9144, halfWidth: 8,
  runSpeed: 6.5, iframeMs: 420,
};

// ── Board sports ────────────────────────────────────────────────────────────
export interface BoardConfig {
  modeId: string; mood: VenueMood; heroUrl: string;
  width: number; length: number; slopeDeg: number; runSeconds: number;
  rails: GrindLine[];
  liftCable?: GrindLine & { minApproachHeight: number };
  coinLines: { from: Vector3; to: Vector3; count: number }[];
  coinArcs: { from: Vector3; to: Vector3; apex: number; count: number }[];
  yeti?: { position: Vector3 };
}

export const SKATE_CONFIG: BoardConfig = {
  modeId: 'skateboard', mood: 'goldenHour', heroUrl: HERO_URL,
  width: 40, length: 160, slopeDeg: 0, runSeconds: 120,
  rails: [
    { a: new Vector3(-4, 0.6, -20), b: new Vector3(-4, 0.6, -34), bonus: 150 },
    { a: new Vector3(5, 0.8, -50), b: new Vector3(9, 0.8, -66), bonus: 180 },
    { a: new Vector3(0, 0.5, -90), b: new Vector3(0, 0.5, -104), bonus: 150 },
    { a: new Vector3(-7, 1.0, -118), b: new Vector3(-3, 1.0, -132), bonus: 220 },
  ],
  coinLines: [
    { from: new Vector3(0, 0.6, -8), to: new Vector3(0, 0.6, -28), count: 10 },
    { from: new Vector3(6, 0.6, -46), to: new Vector3(6, 0.6, -70), count: 10 },
  ],
  coinArcs: [
    { from: new Vector3(0, 0.6, -76), to: new Vector3(0, 0.6, -88), apex: 2.6, count: 7 },
  ],
};

export const SNOWBOARD_CONFIG: BoardConfig = {
  modeId: 'snowboard_slalom', mood: 'alpine', heroUrl: HERO_URL,
  width: 60, length: 400, slopeDeg: 8, runSeconds: 150,
  rails: [
    { a: new Vector3(-6, 0.6, -60), b: new Vector3(-6, 0.9, -84), bonus: 180 },
    { a: new Vector3(8, 0.7, -160), b: new Vector3(8, 1.0, -186), bonus: 180 },
  ],
  // THE OVERHEAD LIFT CABLE — needs real air off a kicker to catch (y ≥ 5.5)
  liftCable: {
    a: new Vector3(-2, 6.2, -190), b: new Vector3(4, 6.8, -260),
    minApproachHeight: 5.5, bonus: 500,
  },
  coinLines: [
    { from: new Vector3(0, 0.6, -30), to: new Vector3(-5, 0.6, -70), count: 12 },
    { from: new Vector3(5, 0.6, -110), to: new Vector3(0, 0.6, -150), count: 12 },
  ],
  coinArcs: [
    { from: new Vector3(0, 0.6, -180), to: new Vector3(0, 0.6, -200), apex: 4.5, count: 9 },
  ],
  yeti: { position: new Vector3(6, 0, -230) },
};

export const SURF_CONFIG: BoardConfig = {
  modeId: 'surf', mood: 'goldenHour', heroUrl: HERO_URL,
  width: 60, length: 240, slopeDeg: 3, runSeconds: 120,
  rails: [],                    // surf grinds = the lip line
  coinLines: [
    { from: new Vector3(-4, 0.7, -30), to: new Vector3(4, 0.7, -80), count: 12 },
  ],
  coinArcs: [
    { from: new Vector3(0, 0.7, -110), to: new Vector3(0, 0.7, -130), apex: 3.5, count: 8 },
  ],
};

// ── Timing sports ───────────────────────────────────────────────────────────
export interface TimingSportConfig {
  modeId: string; mood: VenueMood; heroUrl: string;
  rounds: number;
  athletePos: Vector3; athleteYaw: number; cameraPos: Vector3;
  idleClip: string; swingClip: string;
  ballFrom: Vector3; ballApex: number; ballSpread: number; ballDiameter: number;
  contactPoint: Vector3; contactRadius: number;
  target: Vector3; aimRange: number; returnApex: number;
  restitution: number; flightSeconds: number; betweenSeconds: number;
  pointsPerHit: number; hint: string; hitBanner: string; missBanner: string;
}

export const TENNIS_CONFIG: TimingSportConfig = {
  modeId: 'tennis', mood: 'daylight', heroUrl: HERO_URL, rounds: 7,
  athletePos: new Vector3(0, 0, 10), athleteYaw: Math.PI,
  cameraPos: new Vector3(0, 4.5, 16),
  idleClip: 'bball_defend_stance', swingClip: 'baseball_swing_full',
  ballFrom: new Vector3(0, 1.2, -10), ballApex: 1.6, ballSpread: 5, ballDiameter: 0.11,
  contactPoint: new Vector3(0.5, 1.1, 9.4), contactRadius: 0.55,   // racket head zone
  target: new Vector3(0, 0.4, -8), aimRange: 4.5, returnApex: 1.8,
  restitution: 0.72, flightSeconds: 1.6, betweenSeconds: 1.2,
  pointsPerHit: 15, hint: 'A — swing as the ball arrives · stick aims',
  hitBanner: 'CLEAN RETURN!', missBanner: 'OUT!',
};

export const DERBY_CONFIG: TimingSportConfig = {
  modeId: 'derby', mood: 'daylight', heroUrl: HERO_URL, rounds: 10,
  athletePos: new Vector3(0, 0, 0), athleteYaw: Math.PI / 2,
  cameraPos: new Vector3(-4, 2.2, 3),
  idleClip: 'baseball_bat_stance', swingClip: 'baseball_swing_full',
  ballFrom: new Vector3(0, 1.4, -18), ballApex: 0.4, ballSpread: 0.8, ballDiameter: 0.075,
  contactPoint: new Vector3(0, 1.15, -0.4), contactRadius: 0.5,
  target: new Vector3(0, 0, -90), aimRange: 30, returnApex: 18,
  restitution: 0.5, flightSeconds: 3.2, betweenSeconds: 1.4,
  pointsPerHit: 50, hint: 'A — time the swing · stick up/down shapes launch',
  hitBanner: 'CRUSHED!', missBanner: 'STRIKE!',
};

export const PENALTY_CONFIG: TimingSportConfig = {
  modeId: 'penalty', mood: 'nightGame', heroUrl: HERO_URL, rounds: 5,
  athletePos: new Vector3(0, 0, 11), athleteYaw: Math.PI,
  cameraPos: new Vector3(0, 2.4, 16),
  idleClip: 'idle_stand', swingClip: 'soccer_kick_shoot',
  ballFrom: new Vector3(0, 0.11, 10), ballApex: 0.1, ballSpread: 0, ballDiameter: 0.22,
  contactPoint: new Vector3(0, 0.25, 9.6), contactRadius: 0.5,
  target: new Vector3(0, 1.2, -0.5), aimRange: 3.2, returnApex: 1.6,
  restitution: 0.4, flightSeconds: 1.2, betweenSeconds: 1.4,
  pointsPerHit: 20, hint: 'Aim with stick · A to strike',
  hitBanner: 'GOAL!', missBanner: 'SAVED!',
};

export const GOLF_CONFIG: TimingSportConfig = {
  modeId: 'golf', mood: 'daylight', heroUrl: HERO_URL, rounds: 3,
  athletePos: new Vector3(0, 0, 0), athleteYaw: Math.PI / 2,
  cameraPos: new Vector3(-3.5, 2, 2.5),
  idleClip: 'golf_address_idle', swingClip: 'golf_swing_full',
  ballFrom: new Vector3(0.4, 0.05, -0.4), ballApex: 0, ballSpread: 0, ballDiameter: 0.043,
  contactPoint: new Vector3(0.4, 0.08, -0.4), contactRadius: 0.3,
  target: new Vector3(0, 0, -180), aimRange: 40, returnApex: 22,
  restitution: 0.35, flightSeconds: 4.5, betweenSeconds: 1.6,
  pointsPerHit: 80, hint: 'A at address — pure the strike · stick aims',
  hitBanner: 'PURED!', missBanner: 'CHUNKED!',
};
