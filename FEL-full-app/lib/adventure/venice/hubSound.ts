/**
 * VENICE HUB, improvement pass phase 7 (sound): the park's soundscape through the game's one sound kit (SoundKit), no new files.
 *
 *   the bed       the beach: SoundKit's 'ocean' bed (started in load, so the harness's stadium bed for the golden-hour mood stays
 *                 off — AMBIENT FIX). One bed plays at a time in SoundKit, so the run's crowd is not a second bed (below).
 *   the games     pickup games down the beach, past the rim, out of sight: bursts of dribbles ('bounce'), then a shot — off the
 *                 iron ('rattle' / 'clang') or through ('swish') — quiet with distance and panned to where they are. With the
 *                 hoops sample bank loaded (the CC0 recordings in public/audio/hoops, credited in its CREDITS.md) these are the
 *                 recorded sounds; until then, SoundKit's own synths.
 *   the run       near Court 2 the watchers react to the run: a soft recorded cheer ('crowdCheer') now and then, scaled by distance.
 *   footsteps     the player's own steps, one per stride while moving on the ground: a short knock on concrete and asphalt, a
 *                 softer, lower one in the sand ('thud', the kit's body-on-floor synth, at a step's level).
 * Mute and the player's volume levels apply as to every other sound (SoundKit's buses). `venue.veniceSound` 0 plays none of it
 * (V1: the harness's crowd bed only). PURE: no Babylon, no audio — the mode passes in `play` and the clock.
 */

import { courtsRect, v1Area, v1Spots } from './hubWorld';

export const VENICE_SOUND = 1;

export type Surface = 'concrete' | 'sand';
export type HubCue = 'bounce' | 'rattle' | 'clang' | 'swish' | 'crowdCheer' | 'thud';
export interface CueOpts { volume: number; pan: number; pitch: number; tag: string }
export type PlayFn = (name: HubCue, opts: CueOpts) => void;

/** The park slab under the courts (courtsView's 'venice_park' plane, inset 4 m each side) and the bike path's asphalt are hard;
 *  everything else walkable is sand. */
export function surfaceUnder(x: number, z: number): Surface {
  const c = courtsRect();
  if (x >= c.minX + 4 && x <= c.maxX - 4 && z >= c.minZ + 4 && z <= c.maxZ - 4) return 'concrete';
  if (x >= c.maxX + 2 && x <= c.maxX + 10) return 'concrete';   // the bike path (8 m wide, centred 6 m past the courts)
  return 'sand';
}

/** A step's sound on each surface. [TUNE] */
export const STEP = {
  concrete: { pitch: 1.9, volume: 0.16 },
  sand: { pitch: 0.75, volume: 0.07 },
  /** Metres per step: walking and running both land a foot about every 0.8 m of ground covered (a stride is two steps). */
  every: 0.8,
  /** Below this speed (m/s) the player is standing: no steps. */
  minSpeed: 0.6,
} as const;

/** Loudness of a source `d` metres away: 1 within `near`, falling as near/d, silent past `far`. */
export function distanceGain(d: number, near = 8, far = 140): number {
  if (d >= far) return 0;
  return d <= near ? 1 : near / d;
}

/** Stereo pan (−1 left … 1 right) of a source for a listener facing `yaw` (0 = +z, π/2 = +x: the camera's flat forward). */
export function panFor(lx: number, lz: number, yaw: number, sx: number, sz: number): number {
  const a = Math.atan2(sx - lx, sz - lz) - yaw;
  return Math.max(-1, Math.min(1, Math.sin(a)));
}

/** Where the unseen pickup games are: past the rim, north and south of the courts district, down the beach. */
export function farGames(): Array<[number, number]> {
  const a = v1Area(), c = courtsRect(), mx = (c.minX + c.maxX) / 2;
  return [[mx - 20, a.minZ - 26], [mx + 10, a.maxZ + 22]];
}

/** Court 2 (the run): where the watchers stand. */
export function runAt(): [number, number] {
  const s = v1Spots().find((x) => x.id === 'court.run') ?? v1Spots()[0];
  return [s.at[0], s.at[1]];
}

interface Game { x: number; z: number; wait: number; bounces: number; beat: number }

/** The soundscape's clock: the mode calls update each frame with the player and the camera's yaw. */
export class HubSoundscape {
  private readonly games: Game[];
  private stepAcc = 0;
  private runWait: number;
  constructor(private readonly play: PlayFn, private readonly rand: () => number = Math.random) {
    this.games = farGames().map(([x, z]) => ({ x, z, wait: 1 + rand() * 4, bounces: 0, beat: 0 }));
    this.runWait = 6 + rand() * 8;
  }

  update(dt: number, p: { x: number; z: number; speed: number; grounded: boolean }, yaw: number): void {
    // footsteps
    if (p.grounded && p.speed >= STEP.minSpeed) {
      this.stepAcc += p.speed * dt;
      if (this.stepAcc >= STEP.every) {
        this.stepAcc -= STEP.every;
        const s = STEP[surfaceUnder(p.x, p.z)];
        this.play('thud', { volume: s.volume, pitch: s.pitch * (0.94 + this.rand() * 0.12), pan: 0, tag: 'venice.step' });
      }
    } else this.stepAcc = Math.min(this.stepAcc, STEP.every * 0.5);
    // the far games: a run of dribbles, then a shot, then a breather
    for (const g of this.games) {
      g.wait -= dt;
      if (g.wait > 0) continue;
      const d = Math.hypot(g.x - p.x, g.z - p.z), k = distanceGain(d), pan = panFor(p.x, p.z, yaw, g.x, g.z);
      if (g.bounces === 0) g.bounces = 3 + Math.floor(this.rand() * 6);
      if (g.bounces > 1) {
        if (k > 0) this.play('bounce', { volume: 0.55 * k, pan, pitch: 0.96 + this.rand() * 0.08, tag: 'venice.game' });
        g.bounces--; g.wait = 0.42 + this.rand() * 0.12;
      } else {
        const r = this.rand();
        const shot: HubCue = r < 0.4 ? 'swish' : r < 0.75 ? 'rattle' : 'clang';
        if (k > 0) this.play(shot, { volume: 0.5 * k, pan, pitch: 1, tag: 'venice.game' });
        g.bounces = 0; g.wait = 4 + this.rand() * 7;
      }
    }
    // the run's watchers react now and then (louder the nearer you are; nothing past 60 m)
    this.runWait -= dt;
    if (this.runWait <= 0) {
      const [rx, rz] = runAt();
      const d = Math.hypot(rx - p.x, rz - p.z), k = distanceGain(d, 10, 60);
      if (k > 0) this.play('crowdCheer', { volume: 0.18 * k, pan: panFor(p.x, p.z, yaw, rx, rz), pitch: 0.9 + this.rand() * 0.15, tag: 'venice.run' });
      this.runWait = 9 + this.rand() * 12;
    }
  }
}
