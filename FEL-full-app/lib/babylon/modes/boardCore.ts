// boardCore — everything the three board sports share: rider+character+board
// assembly, the trick state machine (air tricks, landings, bails, combos),
// scoring, and the per-frame update that keeps camera/guards/animation honest.
// Fixes E10 root cause pattern: a mode using this core CANNOT reach playing
// with no world — buildRig demands ground meshes up front.

import { MomentumBus } from '../core/MomentumBus';
import { Color3, MeshBuilder, StandardMaterial, Vector3 } from '@babylonjs/core';
import { dressBoard, type BoardKind } from '../visual/meshyProps';
import { buildSkateDeck } from '../visual/deckMesh';
import type { AbstractMesh } from '@babylonjs/core';
import { CharacterLibrary, type SpawnedCharacter } from '../core/CharacterLibrary';
import { Rider, type RiderCfgOverrides, type GrindLine } from '../core/GroundRide';
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
  ground: AbstractMesh[], boardColor: string, boardKind?: BoardKind, riderCfg?: RiderCfgOverrides,
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
  // the deck's DISCIPLINE decides which skin list the pick comes from — a skate graphic on a surfboard is not a feature
  const deckDisc = boardKind === 'snowboard' ? 'snow' : boardKind === 'surfboard' ? 'surf' : 'skate';
  // THE SKATE DECK IS BUILT, NOT SCANNED (owner, 2026-09-15: "fix the glitched out legs … in skateboarding"). The baked
  // skateboard scan measures 0.31 m tall — a deck on a display stand — and dressBoard seats a scan by its BOTTOM, so
  // the game stood that stand up between the rider's shins and he straddled it. deckMesh.ts carries the measurements.
  // Snow and surf keep the scan: a snowboard plate with bindings on top is shaped like what its box wants.
  if (boardKind === 'snowboard' || boardKind === 'surfboard') void dressBoard(board, boardKind, deckDisc);
  else buildSkateDeck(board, boardColor);
  const rider = new Rider(ctx.scene, char.root, ground, riderCfg);
  ctx.heroRef.current = char.root;
  ctx.camDirector.setPreset('board');
  ctx.camDirector.snapTo(start, start.add(new Vector3(Math.sin(yaw) * 8, 0, Math.cos(yaw) * 8)));
  return { char, rider, board, dispose: () => { board.dispose(); char.dispose(); } };
}

// ── Trick machine ──────────────────────────────────────────────────────────
/** `sec`: how long the trick's motion takes (TrickPose.trickSeconds) — the spin is graded against the same clock the rider is
 *  shown turning on. Omitted, the historic 2.2 turns a second. */
export interface TrickDef { name: string; pts: number; spinAxis: 'y' | 'z' | 'x'; turns: number; clip?: string; sec?: number }

export const TRICKS: Record<string, TrickDef> = {
  pop:   { name: 'OLLIE',     pts: 50,  spinAxis: 'y', turns: 0 },
  flipA: { name: 'KICKFLIP',  pts: 120, spinAxis: 'z', turns: 1 },
  flipB: { name: 'HEELFLIP',  pts: 120, spinAxis: 'z', turns: -1 },
  spin:  { name: '360',       pts: 140, spinAxis: 'y', turns: 1 },
  grab:  { name: 'GRAB',      pts: 90,  spinAxis: 'x', turns: 0, clip: 'board_grab' },
};

/**
 * Did this air land the rider SWITCH?
 *
 * Counts half-turns between leaving the ground and touching down: an odd count
 * means the board is pointed the other way, which is what riding switch IS. A
 * clean 360 is even and returns you to the stance you left with. This is the
 * real rule from the benchmark -- in Skate 3 nobody presses a "ride switch"
 * button, you land a 180 and discover you are in it.
 *
 * Rounding puts the boundary at 90 degrees, so an undercooked 180 still counts.
 * That is deliberate arcade generosity, not an accident of Math.round.
 */
export function landsSwitch(entryYaw: number, exitYaw: number): boolean {
  return Math.abs(Math.round((exitYaw - entryYaw) / Math.PI)) % 2 === 1;
}

export interface TrickMachineOpts {
  /** 'self' (default): the machine plays its own grab / land / fall clips (the Carnival trick gauntlet). 'external': a
   *  BoardAnimTree owns the rig's clips and reads `grabHeld` / `spinning` / `flipping` plus `onBeat` instead — the
   *  direct plays used to be cut a frame later by the mode's per-frame play (ANIM-READABILITY, 2026-09-07). */
  anim?: 'self' | 'external';
  /** A clean landing or a bail happened this frame (external anim drives its beat window from this). */
  onBeat?: (beat: 'land' | 'bail') => void;
  /** The shared Game-Breaker bus. Pass one and deep combos light the building, as they do on a skateboard. */
  momentum?: MomentumBus;
}

export class TrickMachine {
  score = 0; combo = 0; comboPts = 0;
  /**
   * The shared Game-Breaker layer (2026-09-13).
   *
   * THERE ARE TWO COMBO IMPLEMENTATIONS IN THIS PROJECT. Skate runs `ComboChain`, which reports to
   * `MomentumBus` at 5x and again at 8x; snow and surf run this class, which counted an identical combo and
   * told the momentum system NOTHING. So a deep run on a snowboard — the thing the mode is for — never
   * moved the tier, never lit the crowd and never applied the multiplier, while the same feat on a
   * skateboard did. Exactly the gap 3v3 had against 1v1, in a different corner.
   *
   * Optional, so every existing construction site keeps working untouched.
   */
  private momentum?: MomentumBus;
  private active: TrickDef | null = null;
  private spun = 0;
  private grabbing = false;

  constructor(private rig: BoardRig, private onHud: (h: Record<string, string | number>) => void, private opts: TrickMachineOpts = {}) {
    this.momentum = opts.momentum;
  }

  /** The grab is being held in the air. */
  get grabHeld(): boolean { return this.grabbing; }
  /** A yaw spin trick is in progress in the air. */
  get spinning(): boolean { return !!this.active && this.active.spinAxis === 'y' && this.active.turns !== 0 && !this.rig.rider.grounded; }
  /** A flip trick is in progress in the air. */
  get flipping(): boolean { return !!this.active && this.active.spinAxis === 'z' && !this.rig.rider.grounded; }
  private playClip(name: string, o: { loop?: boolean } = {}): void {
    if (this.opts.anim !== 'external') this.rig.char.animator.play(name, o);
  }

  start(t: TrickDef): void {
    if (this.rig.rider.grounded && t.turns === 0 && t.name === 'OLLIE') this.rig.rider.jump(0.6);
    if (this.rig.rider.grounded) return;                 // air tricks need air
    this.active = t;
    this.spun = 0;
    if (t.clip) { this.grabbing = true; this.playClip(t.clip, { loop: true }); }
  }
  endGrab(): void {
    if (this.grabbing) {
      this.grabbing = false;
      this.playClip('board_ride_idle', { loop: true });
    }
  }

  /** call every frame; returns banner text when something lands/bails */
  update(dt: number): string | null {
    const r = this.rig.rider;
    if (this.active && !r.grounded) {
      const t = this.active;
      const turnsPerSec = t.sec ? Math.abs(t.turns) / t.sec : 2.2;
      const rate = 2 * Math.PI * turnsPerSec * dt * (t.turns >= 0 ? 1 : -1);
      if (t.turns !== 0) {
        // TRICK POSE (2026-09-15): this used to add the spin to the root here, and the modes overwrite (snow) or ease
        // (surf) the root's yaw every frame — a 720 showed as a one-frame twitch. The rider is turned by BoardTrickLayer
        // now; this only grades how much of the turn the air held, on the same clock.
        this.spun = Math.min(this.spun + Math.abs(rate), Math.abs(t.turns) * 2 * Math.PI);
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
        // the same thresholds ComboChain uses, so a 5-trick run means the same thing on either board
        if (this.combo === 5) this.momentum?.report({ kind: 'big_make' });
        else if (this.combo >= 8) this.momentum?.report({ kind: 'highlight_dunk', weight: Math.min(30, this.combo * 2) });
        this.playClip('jump_land');
        this.opts.onBeat?.('land');
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
    this.playClip('skate_bail');   // SHARED-ANIM-BUS: the board's own bail (this borrowed the football tackle fall)
    this.opts.onBeat?.('bail');
    this.onHud({ combo: '' });
  }

  bankGrind(line: GrindLine): void {
    this.combo++;
    this.comboPts += line.bonus * this.combo;
  }
}
