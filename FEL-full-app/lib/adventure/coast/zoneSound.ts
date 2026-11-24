/**
 * THE COAST'S SOUND (improve pass phase 5, lane/improve-world, 2026-11-22; docs/IMPROVE-10-PHASE-AUDIT.md §2.5, finding #9).
 *
 * Measured before: the Coast zone built the STADIUM bed (the 900 Hz crowd filter) in 3 of 3 audit runs — a crowd murmur over an
 * empty sea — because CoastZoneMode asked for no bed in its load, so the harness's first-input fallback (ModeHarness firstInput)
 * started the 'daylight' mood's crowd. Venice asks for its 'ocean' bed in load (lib/adventure/venice/hubSound.ts) and plays the sea.
 *
 * With `coast.oceanBed` 1 the zone does the same, and adds the shore round the bed, Venice's soundscape pattern, no new files:
 *   the bed       SoundKit's 'ocean' bed, asked for in load (so the harness's crowd bed stays off: AMBIENT FIX)
 *   the waves     a wave washing up the nearest shore every few seconds (the mainland's beach or an island's), louder the nearer
 *                 you stand, panned to where it breaks (natureSfx 'wave', made in code)
 *   the gulls     a gull's call now and then, somewhere round you (natureSfx 'gull')
 *   footsteps     one per 0.8 m on the ground: soft and low on sand (Venice's sand step), a hollow knock on the dock's and the
 *                 bridge's boards, a splash in the shallows ('thud' / 'swish', SoundKit's synths)
 * Mute and the player's levels apply as to every sound (SoundKit's buses). `coast.oceanBed` 0 plays none of it (today: the harness's
 * crowd bed). PURE: no Babylon, no audio — the mode passes in `play`.
 */

import { deckAt, islandShoreR, mainlandShoreX, SEA_Y, terrainY, zoneIslands } from './zoneLayout';

/** coast.oceanBed: 1 = the sea bed and the shore; 0 = no bed asked for (the harness's stadium crowd, before this pass). */
export const COAST_OCEAN_BED = 1;

export type CoastSurface = 'sand' | 'boards' | 'shallows';
export type CoastCue = 'thud' | 'swish' | 'wave' | 'gull';
export interface CoastCueOpts { volume: number; pitch: number; pan: number; tag: string }
export type CoastPlayFn = (name: CoastCue, opts: CoastCueOpts) => void;

/** A step's sound on each surface; metres per step; the standing speed. [TUNE] new numbers, this pass (sand = Venice's sand step) */
export const COAST_STEP = {
  sand: { cue: 'thud', pitch: 0.75, volume: 0.07 },
  boards: { cue: 'thud', pitch: 1.45, volume: 0.15 },
  shallows: { cue: 'swish', pitch: 0.5, volume: 0.14 },
  every: 0.8,
  minSpeed: 0.6,
} as const;
/** A wave every 3.5–6.5 s, heard full within 10 m of its shore, nothing past 90 m; a gull every 6–14 s. [TUNE] */
export const SHORE = { waveMin: 3.5, waveSpan: 3, near: 10, far: 90, gullMin: 6, gullSpan: 8 } as const;

/** What the player stands on at (x, z): a deck's boards, water above the sand, or sand (and grass: the beach's sound). */
export function coastSurface(x: number, z: number): CoastSurface {
  if (deckAt(x, z)) return 'boards';
  return terrainY(x, z) < SEA_Y - 0.05 ? 'shallows' : 'sand';
}

/** The nearest point of any waterline to (x, z): the mainland's beach at this z, or an island's shore toward the player. */
export function nearestShore(x: number, z: number): [number, number] {
  let bx = mainlandShoreX(z), bz = z, bd = Math.abs(x - bx);
  for (const isl of zoneIslands()) {
    const dx = x - isl.at[0], dz = z - isl.at[1], r = Math.hypot(dx, dz) || 1;
    const R = islandShoreR(isl, dx, dz);
    const sx = isl.at[0] + (dx / r) * R, sz = isl.at[1] + (dz / r) * R;
    const d = Math.hypot(x - sx, z - sz);
    if (d < bd) { bd = d; bx = sx; bz = sz; }
  }
  return [bx, bz];
}

/** Loudness of a source `d` metres away: 1 within `near`, near/d beyond, silent past `far`. */
export function shoreGain(d: number, near: number = SHORE.near, far: number = SHORE.far): number {
  if (!(d < far)) return 0;
  return d <= near ? 1 : near / d;
}

/** Stereo pan of a source for a listener at (lx, lz) facing `yaw` (0 = +z, π/2 = +x). */
export function shorePan(lx: number, lz: number, yaw: number, sx: number, sz: number): number {
  if (Math.abs(sx - lx) + Math.abs(sz - lz) < 1e-6) return 0;
  return Math.max(-1, Math.min(1, Math.sin(Math.atan2(sx - lx, sz - lz) - yaw)));
}

/** The zone's soundscape clock: the mode calls update each frame with the player and the camera's yaw. */
export class CoastSoundscape {
  private stepAcc = 0;
  private waveWait: number;
  private gullWait: number;
  readonly counts: Record<string, number> = {};
  constructor(private readonly play: CoastPlayFn, private readonly rand: () => number = Math.random) {
    this.waveWait = 0.8 + rand() * 1.5;
    this.gullWait = 2 + rand() * SHORE.gullSpan;
  }

  update(dt: number, p: { x: number; z: number; speed: number; grounded: boolean }, yaw: number): void {
    if (!(dt > 0)) return;
    if (p.grounded && p.speed >= COAST_STEP.minSpeed) {
      this.stepAcc += p.speed * dt;
      if (this.stepAcc >= COAST_STEP.every) {
        this.stepAcc -= COAST_STEP.every;
        const where = coastSurface(p.x, p.z), s = COAST_STEP[where];
        this.cue(s.cue, s.volume, s.pitch * (0.94 + this.rand() * 0.12), 0, `coast.step.${where}`);
      }
    } else this.stepAcc = Math.min(this.stepAcc, COAST_STEP.every * 0.5);
    this.waveWait -= dt;
    if (this.waveWait <= 0) {
      this.waveWait = SHORE.waveMin + this.rand() * SHORE.waveSpan;
      const [sx, sz] = nearestShore(p.x, p.z), k = shoreGain(Math.hypot(sx - p.x, sz - p.z));
      if (k > 0) this.cue('wave', 0.9 * k, 0.85 + this.rand() * 0.3, shorePan(p.x, p.z, yaw, sx, sz), 'coast.wave');
    }
    this.gullWait -= dt;
    if (this.gullWait <= 0) {
      this.gullWait = SHORE.gullMin + this.rand() * SHORE.gullSpan;
      this.cue('gull', 0.5 + 0.4 * this.rand(), 0.9 + 0.25 * this.rand(), this.rand() * 1.6 - 0.8, 'coast.gull');
    }
  }

  private cue(name: CoastCue, volume: number, pitch: number, pan: number, tag: string): void {
    if (!(volume > 0)) return;
    this.play(name, { volume, pitch, pan, tag });
    this.counts[tag] = (this.counts[tag] ?? 0) + 1;
  }
}
