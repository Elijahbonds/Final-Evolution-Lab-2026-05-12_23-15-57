// boardCore — everything the three board sports share: rider+character+board
// assembly, the trick state machine (air tricks, landings, bails, combos),
// scoring, and the per-frame update that keeps camera/guards/animation honest.
// Fixes E10 root cause pattern: a mode using this core CANNOT reach playing
// with no world — buildRig demands ground meshes up front.

import { Color3, MeshBuilder, StandardMaterial, Vector3 } from '@babylonjs/core';
import type { AbstractMesh } from '@babylonjs/core';
import { CharacterLibrary, type SpawnedCharacter } from '../core/CharacterLibrary';
import { Rider, type GrindLine } from '../core/GroundRide';
import { neverBindPose } from '../anim/importSanitizer';
import type { ModeContext } from '../core/ModeHarness';

export interface BoardRig {
  char: SpawnedCharacter;
  rider: Rider;
  board: AbstractMesh;
  dispose(): void;
}

export async function buildRig(
  ctx: ModeContext, heroUrl: string, start: Vector3, yaw: number,
  ground: AbstractMesh[], boardColor: string,
): Promise<BoardRig> {
  if (!ground.length) throw new Error('[FEL-SPAWN] buildRig: no ground meshes — world must be built first');
  const char = await CharacterLibrary.spawn(ctx.scene, heroUrl, {
    position: start, yawRad: yaw, startClip: 'board_ride_idle',
  });
  neverBindPose(char.animator, 'board_ride_idle');
  // NOTE: no GroundLock here — Rider owns vertical motion (snap + air).
  const board = MeshBuilder.CreateBox('board', { width: 0.26, height: 0.06, depth: 0.84 }, ctx.scene);
  board.parent = char.root;
  board.position.y = 0.03;
  const mat = new StandardMaterial('boardMat', ctx.scene);
  mat.diffuseColor = Color3.FromHexString(boardColor);
  mat.specularColor = Color3.Black();
  board.material = mat;
  const rider = new Rider(ctx.scene, char.root, ground);
  ctx.heroRef.current = char.root;
  ctx.camDirector.setPreset('board');
  ctx.camDirector.snapTo(start, start.add(new Vector3(Math.sin(yaw) * 8, 0, Math.cos(yaw) * 8)));
  return { char, rider, board, dispose: () => { board.dispose(); char.dispose(); } };
}

// ── Trick machine ──────────────────────────────────────────────────────────
export interface TrickDef { name: string; pts: number; spinAxis: 'y' | 'z' | 'x'; turns: number; clip?: string }

export const TRICKS: Record<string, TrickDef> = {
  pop:   { name: 'OLLIE',     pts: 50,  spinAxis: 'y', turns: 0 },
  flipA: { name: 'KICKFLIP',  pts: 120, spinAxis: 'z', turns: 1 },
  flipB: { name: 'HEELFLIP',  pts: 120, spinAxis: 'z', turns: -1 },
  spin:  { name: '360',       pts: 140, spinAxis: 'y', turns: 1 },
  grab:  { name: 'GRAB',      pts: 90,  spinAxis: 'x', turns: 0, clip: 'board_grab' },
};

export class TrickMachine {
  score = 0; combo = 0; comboPts = 0;
  private active: TrickDef | null = null;
  private spun = 0;
  private grabbing = false;

  constructor(private rig: BoardRig, private onHud: (h: Record<string, string | number>) => void) {}

  start(t: TrickDef): void {
    if (this.rig.rider.grounded && t.turns === 0 && t.name === 'OLLIE') this.rig.rider.jump(0.6);
    if (this.rig.rider.grounded) return;                 // air tricks need air
    this.active = t;
    this.spun = 0;
    if (t.clip) { this.grabbing = true; this.rig.char.animator.play(t.clip, { loop: true }); }
  }
  endGrab(): void {
    if (this.grabbing) {
      this.grabbing = false;
      this.rig.char.animator.play('board_ride_idle', { loop: true });
    }
  }

  /** call every frame; returns banner text when something lands/bails */
  update(dt: number): string | null {
    const r = this.rig.rider;
    if (this.active && !r.grounded) {
      const t = this.active;
      const rate = 2 * Math.PI * 2.2 * dt * (t.turns >= 0 ? 1 : -1);
      if (t.turns !== 0) {
        this.spun += Math.abs(rate);
        if (t.spinAxis === 'y') this.rig.char.root.rotation.y += rate;
        if (t.spinAxis === 'z') this.rig.char.root.rotation.z += rate;
      }
      if (this.grabbing) { this.spun += dt * 4; }        // grab scores with hold time
      return null;
    }
    if (this.active && r.grounded) {                     // LANDING
      const t = this.active;
      this.active = null;
      const needed = Math.abs(t.turns) * 2 * Math.PI * 0.8;
      const clean = t.turns === 0 || this.spun >= needed;
      this.rig.char.root.rotation.z = 0;
      if (clean) {
        this.combo++;
        this.comboPts += t.pts * this.combo;
        this.rig.char.animator.play('jump_land', {});
        this.onHud({ combo: `${this.combo}x` });
        return `${t.name} +${t.pts * this.combo}`;
      }
      this.bail();
      return 'BAILED';
    }
    if (!this.active && r.grounded && this.comboPts > 0) {  // bank the combo
      this.score += this.comboPts;
      this.onHud({ score: this.score, combo: '' });
      this.comboPts = 0; this.combo = 0;
    }
    return null;
  }

  bail(): void {
    this.active = null; this.grabbing = false;
    this.comboPts = 0; this.combo = 0;
    this.rig.rider.vel.scaleInPlace(0.25);
    this.rig.char.animator.play('football_tackled_fall', {});   // reuse the fall
    this.onHud({ combo: '' });
  }

  bankGrind(line: GrindLine): void {
    this.combo++;
    this.comboPts += line.bonus * this.combo;
  }
}
