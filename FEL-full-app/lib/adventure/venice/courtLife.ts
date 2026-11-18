/**
 * VENICE HUB V2, phase 2 (court life; owner 2026-11-18): people shooting around on the courts nobody is playing on.
 *
 *   a shooter     dribbles at a spot round the arc, rises into the shipped jump shot ('jumpshot'), holds the follow-through
 *                 ('bball_follow_through'), and the ball arcs to the rim — through it or off the iron — then back to the shooter;
 *   a rebounder   (desktop and up) waits under the hoop with a hand up ('bball_hand_up'), takes the ball off the floor and passes
 *                 it out; the shooter catches ('catch_pass') and moves to the next spot;
 *   a jogger      (desktop and up) runs the bike path end to end and back ('run'). No cycling or skating clip fits a figure on a
 *                 path (the board clips are the skate modes' tricks on their own deck), so the path gets a jogger, not a rider.
 * The bodies are the shipped NPC path (CharacterPipeline.spawnNpc: the body merge, the shared animator), tinted apart. A phone
 * has room in its row for ONE more skinned body (venice_hub: skinnedBodies budget 2, the player is 1): one shooter on Court 4, the
 * court nearest the gate. Every clip is one the hoops modes ship; the hub's clip scope borrows the four hoops clips by name
 * (clipScope venice_hub). The ball is one sphere with the basketball's colour. `venue.veniceCourtLife` 0 = no court life.
 *
 * The timing below is pure (CourtShootaround) so it is tested without Babylon; mountCourtLife puts it on bodies.
 */

import { Color3, MeshBuilder, PBRMaterial, Vector3, type AbstractMesh, type Mesh, type Scene, type TransformNode } from '@babylonjs/core';
import { CharacterPipeline } from '@/lib/babylon/core/characterPipeline';
import type { SpawnedCharacter } from '@/lib/babylon/core/CharacterLibrary';
import { DUNK_CONFIG } from '@/lib/babylon/modes/modeConfigs';
import { RIM_HEIGHT_M } from '@/lib/babylon/core/courtDims';
import type { Spot } from './layout';
import { courtsRect, v1Area, v1Spots } from './hubWorld';
import { COURT_HALF } from './courtsView';

export const VENICE_COURT_LIFE = 1;
/** Who plays where, per tier. A phone: one shooter (its skinned-body budget); a desktop: two courts of two and a jogger. */
export const COURT_LIFE = {
  phone: { courts: ['court.arc'], rebounders: false, joggers: 0 },
  desktop: { courts: ['court.arc', 'court.ones'], rebounders: true, joggers: 1 },
} as const;

/** The rim of a court's hoop (courtsView puts the pole 0.9 m inside the far baseline; meshyProps' rim is 0.72 m in front of it). */
export function rimOf(s: Spot): [number, number, number] { return [s.at[0], RIM_HEIGHT_M, s.at[1] - COURT_HALF.l + 0.9 + 0.72]; }

/** The spots a shooter works round, on the court in front of its hoop (m from the rim, toward the court). */
export function shotSpots(s: Spot): Array<[number, number]> {
  const [rx, , rz] = rimOf(s);
  return [[rx - 4.2, rz + 3.4], [rx, rz + 5.6], [rx + 4.2, rz + 3.4], [rx + 2.2, rz + 2.0], [rx - 2.2, rz + 2.0]];
}

/** The beats of one shot, seconds. [TUNE] */
export const BEAT = { dribble: 1.8, rise: 0.55, flight: 1.05, drop: 0.5, toRebounder: 0.7, pass: 0.75, settle: 0.8 } as const;

export type Phase = 'dribble' | 'rise' | 'flight' | 'drop' | 'loose' | 'pass' | 'settle';
export interface ShotFrame {
  phase: Phase;
  /** Where the ball is (world), or null while a hand holds it (the body's own ball-less clip: the ball rides at the hands). */
  ball: [number, number, number];
  /** A clip to start on this frame (a phase began), for the shooter and the rebounder. */
  shooterClip: string | null;
  rebounderClip: string | null;
  /** A sound on this frame, and where. */
  cue: { name: 'bounce' | 'swish' | 'rattle' | 'clang'; at: [number, number] } | null;
  /** Where the shooter stands. */
  shooter: [number, number];
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** The shootaround's clock: pure, deterministic in its seed. One shot after another, moving round shotSpots. */
export class CourtShootaround {
  private phase: Phase = 'dribble';
  private t = 0;
  private spot = 0;
  private made = true;
  private bounceAt = 0;
  private seed: number;
  readonly rim: [number, number, number];
  readonly spots: Array<[number, number]>;
  readonly rebounder: [number, number];
  constructor(readonly court: Spot, readonly withRebounder: boolean, seed = 1) {
    this.rim = rimOf(court);
    this.spots = shotSpots(court);
    this.rebounder = [this.rim[0] + 0.8, this.rim[2] + 1.2];
    this.seed = seed >>> 0 || 1;
  }
  private rand(): number { this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0; return this.seed / 4294967296; }
  private hands(): [number, number, number] { const [x, z] = this.spots[this.spot]; return [x, 1.2, z]; }
  private floorUnderRim(): [number, number, number] { return [this.rim[0] + (this.made ? 0 : 0.9), 0.12, this.rim[2] + (this.made ? 0.4 : 1.4)]; }

  step(dt: number): ShotFrame {
    this.t += dt;
    let shooterClip: string | null = null, rebounderClip: string | null = null, cue: ShotFrame['cue'] = null;
    const go = (p: Phase) => { this.phase = p; this.t = 0; };
    // phase changes
    if (this.phase === 'dribble') {
      if (this.t >= BEAT.dribble) { go('rise'); shooterClip = 'jumpshot'; }
      else if (this.t - this.bounceAt >= 0.45) { this.bounceAt = this.t; const [x, , z] = this.hands(); cue = { name: 'bounce', at: [x, z] }; }
    } else if (this.phase === 'rise' && this.t >= BEAT.rise) {
      go('flight'); this.made = this.rand() < 0.55;
    } else if (this.phase === 'flight' && this.t >= BEAT.flight) {
      go('drop'); shooterClip = 'bball_follow_through';
      cue = { name: this.made ? 'swish' : this.rand() < 0.5 ? 'rattle' : 'clang', at: [this.rim[0], this.rim[2]] };
      if (this.withRebounder) rebounderClip = 'bball_hand_up';
    } else if (this.phase === 'drop' && this.t >= BEAT.drop) {
      go('loose'); const f = this.floorUnderRim(); cue = { name: 'bounce', at: [f[0], f[2]] };
    } else if (this.phase === 'loose' && this.t >= BEAT.toRebounder) {
      // the next spot; the ball goes back out (a rebounder passes it, or it rolls back to the shooter's new spot)
      go('pass'); this.spot = (this.spot + 1) % this.spots.length;
      if (this.withRebounder) rebounderClip = 'bball_idle_stand';
      shooterClip = 'catch_pass';
    } else if (this.phase === 'pass' && this.t >= BEAT.pass) {
      go('settle');
    } else if (this.phase === 'settle' && this.t >= BEAT.settle) {
      go('dribble'); this.bounceAt = 0; shooterClip = 'bball_dribble_idle';
    }
    // where the ball is
    const u = this.t;
    let ball: [number, number, number];
    const h = this.hands();
    switch (this.phase) {
      case 'dribble': { const k = Math.abs(Math.sin((u / 0.45) * Math.PI)); ball = [h[0] + 0.3, 0.12 + k * 0.85, h[2]]; break; }
      case 'rise': ball = [h[0], lerp(1.2, 2.5, Math.min(1, u / BEAT.rise)), h[2]]; break;
      case 'flight': {
        const k = Math.min(1, u / BEAT.flight), top = Math.max(this.rim[1], 2.5) + 1.6;
        const y = (1 - k) * (1 - k) * 2.5 + 2 * (1 - k) * k * (top + 0.8) + k * k * (this.rim[1] + 0.2);
        ball = [lerp(h[0], this.rim[0], k), y, lerp(h[2], this.rim[2], k)]; break;
      }
      case 'drop': { const k = Math.min(1, u / BEAT.drop), f = this.floorUnderRim(); ball = [lerp(this.rim[0], f[0], k), lerp(this.rim[1], f[1], k * k), lerp(this.rim[2], f[2], k)]; break; }
      case 'loose': {
        const k = Math.min(1, u / BEAT.toRebounder), f = this.floorUnderRim();
        const to: [number, number] = this.withRebounder ? this.rebounder : [f[0], f[2] + 0.8];
        ball = [lerp(f[0], to[0], k), (this.withRebounder ? lerp(0.12, 1.1, k) : 0.12) + Math.abs(Math.sin(k * Math.PI)) * 0.5, lerp(f[2], to[1], k)]; break;
      }
      case 'pass': {
        const k = Math.min(1, u / BEAT.pass), f = this.floorUnderRim();
        const from: [number, number, number] = this.withRebounder ? [this.rebounder[0], 1.1, this.rebounder[1]] : [f[0], 0.12, f[2] + 0.8];
        ball = [lerp(from[0], h[0], k), lerp(from[1], 1.2, k) + Math.sin(k * Math.PI) * 0.6, lerp(from[2], h[2], k)]; break;
      }
      default: ball = [h[0], 1.2, h[2]];
    }
    // the shooter walks to the next spot while the ball comes back
    const prev = this.spots[(this.spot + this.spots.length - 1) % this.spots.length], next = this.spots[this.spot];
    const walking = this.phase === 'pass' ? Math.min(1, u / BEAT.pass) : 1;
    const shooter: [number, number] = this.phase === 'pass' ? [lerp(prev[0], next[0], walking), lerp(prev[1], next[1], walking)] : next;
    return { phase: this.phase, ball, shooterClip, rebounderClip, cue, shooter };
  }
}

/** The jogger's path: the bike path's centre line, end to end inside the park and back. */
export function joggerPath(): { x: number; z0: number; z1: number } {
  const c = courtsRect(), a = v1Area();
  return { x: c.maxX + 6, z0: a.minZ + 6, z1: a.maxZ - 6 };
}

/** A phone's shooter in one draw a part (measured: the full body, ink outline and shadow, cost 19 draws and took the hub's
 *  phone frame to 65 of its 56): no outline, no shadow. The player keeps both. */
export function phoneTrim(scene: Scene, c: SpawnedCharacter): void {
  const gens = scene.lights.map((l) => l.getShadowGenerator?.()).filter(Boolean) as unknown as Array<{ removeShadowCaster?(m: AbstractMesh, d?: boolean): unknown }>;
  for (const m of c.root.getChildMeshes(false)) {
    m.renderOutline = false;
    for (const g of gens) g.removeShadowCaster?.(m, false);
  }
}

export interface CourtLife { update(dt: number): void; dispose(): void; bodies: Promise<number> }

export function mountCourtLife(scene: Scene, parent: TransformNode, tier: string, onCue?: (name: 'bounce' | 'swish' | 'rattle' | 'clang', x: number, z: number) => void): CourtLife {
  const plan = tier === 'mobile' ? COURT_LIFE.phone : COURT_LIFE.desktop;
  const spots = v1Spots();
  const ballMat = new PBRMaterial('venice_life_ball_mat', scene);
  ballMat.albedoColor = Color3.FromHexString('#D9622B'); ballMat.metallic = 0; ballMat.roughness = 0.7;
  type Court = { run: CourtShootaround; ball: Mesh; shooter: SpawnedCharacter | null; rebounder: SpawnedCharacter | null };
  const courts: Court[] = [];
  const all: SpawnedCharacter[] = [];
  let disposed = false;
  const tints = ['#3B82F6', '#F59E0B', '#10B981', '#EF4444', '#A855F7'];
  let ti = 0;
  const phone = tier === 'mobile';
  const spawn = (at: [number, number], yaw: number, clip: string) =>
    CharacterPipeline.spawnNpc(scene, DUNK_CONFIG.heroUrl, { position: new Vector3(at[0], 0, at[1]), yawRad: yaw, tint: tints[ti++ % tints.length], startClip: clip, modeId: 'venice_hub' })
      .then((c) => { if (disposed) { c.dispose(); return null; } if (phone) phoneTrim(scene, c); all.push(c); return c; })
      .catch((e) => { console.warn('[VENICE] court life body', (e as Error)?.message ?? e); return null; });
  const jobs: Promise<unknown>[] = [];
  plan.courts.forEach((id, i) => {
    const s = spots.find((x) => x.id === id);
    if (!s) return;
    const run = new CourtShootaround(s, plan.rebounders, 7 + i * 13);
    const ball = MeshBuilder.CreateSphere(`venice_life_ball_${id}`, { diameter: 0.24, segments: 10 }, scene);
    ball.material = ballMat; ball.parent = parent; ball.isPickable = false;
    const c: Court = { run, ball, shooter: null, rebounder: null };
    courts.push(c);
    const [sx, sz] = run.spots[0];
    jobs.push(spawn([sx, sz], Math.atan2(run.rim[0] - sx, run.rim[2] - sz), 'bball_dribble_idle').then((b) => { c.shooter = b; }));
    if (plan.rebounders) jobs.push(spawn(run.rebounder, Math.atan2(sx - run.rebounder[0], sz - run.rebounder[1]), 'bball_idle_stand').then((b) => { c.rebounder = b; }));
  });
  const jog = { body: null as SpawnedCharacter | null, z: 0, dir: 1 };
  const path = joggerPath();
  jog.z = path.z0;
  for (let j = 0; j < plan.joggers; j++) jobs.push(spawn([path.x, path.z0], 0, 'run').then((b) => { jog.body = b; }));
  const JOG_SPEED = 3.2;   // m/s, an easy jog [TUNE]
  return {
    bodies: Promise.all(jobs).then(() => all.length),
    update(dt) {
      for (const c of courts) {
        const f = c.run.step(dt);
        c.ball.position.set(f.ball[0], f.ball[1], f.ball[2]);
        if (c.shooter) {
          c.shooter.root.position.set(f.shooter[0], 0, f.shooter[1]);
          c.shooter.root.rotation.y = Math.atan2(c.run.rim[0] - f.shooter[0], c.run.rim[2] - f.shooter[1]);
          if (f.shooterClip) c.shooter.animator.play(f.shooterClip, { loop: f.shooterClip === 'bball_dribble_idle', fadeSec: 0.2 });
        }
        if (c.rebounder && f.rebounderClip) c.rebounder.animator.play(f.rebounderClip, { loop: f.rebounderClip === 'bball_idle_stand', fadeSec: 0.2 });
        if (f.cue && onCue) onCue(f.cue.name, f.cue.at[0], f.cue.at[1]);
      }
      if (jog.body) {
        jog.z += jog.dir * JOG_SPEED * dt;
        if (jog.z > path.z1) { jog.z = path.z1; jog.dir = -1; } else if (jog.z < path.z0) { jog.z = path.z0; jog.dir = 1; }
        jog.body.root.position.set(path.x, 0, jog.z);
        jog.body.root.rotation.y = jog.dir > 0 ? 0 : Math.PI;
      }
    },
    dispose() {
      disposed = true;
      for (const b of all) b.dispose();
      all.length = 0;
      for (const c of courts) c.ball.dispose();
      ballMat.dispose();
    },
  };
}
