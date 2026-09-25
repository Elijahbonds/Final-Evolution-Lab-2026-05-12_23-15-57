// boardCore — everything the three board sports share: rider+character+board
// assembly, the trick state machine (air tricks, landings, bails, combos),
// scoring, and the per-frame update that keeps camera/guards/animation honest.
// Fixes E10 root cause pattern: a mode using this core CANNOT reach playing
// with no world — buildRig demands ground meshes up front.

import { MomentumBus } from '../core/MomentumBus';
import { REPEAT_DECAY, REPEAT_NO_MULT, moveKey } from '../core/ComboChain';   // boards pass phase 4: skate's anti-mash decay on the family's other boards
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
  onBeat?: (beat: 'land' | 'land_sketchy' | 'bail') => void;
  /** The shared Game-Breaker bus. Pass one and deep combos light the building, as they do on a skateboard. */
  momentum?: MomentumBus;
  /** HOTFIX (2026-09-24): THE SHORTEST GRAB A RELEASE CAN END, in seconds from the throw. A grab let go sooner is held
   *  until this runs out (or the board lands), so a quick tap of the grab button is a clean minimum grab instead of a
   *  0.05 s poke graded as a bail. Omitted / 0: the release ends the grab at once (surf, the carnival gauntlet). */
  minGrabSec?: number;
  /** A grab that a release asked to end has ended — at the release, or when the minimum hold runs out (the mode
   *  lets the trick pose's grab hand go here, so the hand and the score agree). */
  onGrabEnd?: () => void;
}

export class TrickMachine {
  score = 0; combo = 0; comboPts = 0;
  /** phase 9: what the run landed and its best chain — the result card reads these (it read coins and a chain that never existed) */
  landed = 0; bestCombo = 0;
  /** phase 4: how long a landed combo stays open on the ground — a new trick inside it is the next link (THPS: the manual
   *  / revert that keeps a line alive; here the board has no manual so the window is the link). Banks when it runs out. */
  static readonly LINK_GRACE_SEC = 1.6;
  /** phase 6 — THE LANDING READ: the fraction of the turn (or of a grab's hold) completed at touchdown. At or above CLEAN
   *  the trick pays in full; between SKETCHY and CLEAN it pays half, reads SKETCHY and plays the sketchy landing; below
   *  SKETCHY it is the bail. Before this there was one line at 0.8: land it or eat the full bail, and nothing said which. */
  static readonly LAND_CLEAN = 0.95;
  static readonly LAND_SKETCHY = 0.7;
  static readonly GRAB_SKETCHY = 0.4;
  /** HOTFIX (2026-09-24): one CLEAN grab's worth of hold. A grab scores 4 a second against a need of 1 (update()), so a
   *  grab held 0.25 s grades 1.0 — clean — and holding it longer pays no more. The snowboard's `minGrabSec`. */
  static readonly MIN_TAP_GRAB_SEC = 0.25;
  private graceT = 0;
  /** phase 4: the labels landed in the combo so far — the repeat decay's memory and the line the bank names */
  private links: { key: string; rep: number }[] = [];
  /** phase 4 (measured): the multiplier counts links whose move was not repeated to death — ComboChain's REPEAT_NO_MULT rule.
   *  Without it a masher rotating the whole table reached 16× in 50 s on snow; with it the 4th+ repeat pays its decayed
   *  points at the multiplier the fresh links earned. */
  private get multiplier(): number { return Math.max(1, this.links.filter((l) => l.rep < REPEAT_NO_MULT).length); }
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
  /** How long the grab in flight has been held, and whether its release came before the minimum hold (`minGrabSec`). */
  private grabT = 0;
  private grabReleaseAsked = false;

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
    if (t.clip) { this.grabbing = true; this.grabT = 0; this.grabReleaseAsked = false; this.playClip(t.clip, { loop: true }); }
  }
  /** The grab button was released. Ends the grab — or, inside the minimum hold (`minGrabSec`) of a trick still in the
   *  air, when that runs out. */
  endGrab(): void {
    if (!this.grabbing) return;
    // HOTFIX (2026-09-24): the minimum is an AIR rule. A grab thrown with little air left, held through the touchdown and let
    // go on the snow was deferred here — and only the air branch of update() ends a deferred grab, so it never ended:
    // grabHeld stayed true on the ground and the next plain jump showed a grab that scored nothing. Landed (or between
    // tricks), the release ends it now.
    if (this.active && !this.rig.rider.grounded && this.grabT < (this.opts.minGrabSec ?? 0)) { this.grabReleaseAsked = true; return; }
    this.finishGrab();
  }
  private finishGrab(): void {
    this.grabbing = false; this.grabReleaseAsked = false;
    this.playClip('board_ride_idle', { loop: true });
    this.opts.onGrabEnd?.();
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
      if (this.grabbing) {                               // grab scores with hold time
        this.spun += dt * 4;
        this.grabT += dt;
        if (this.grabReleaseAsked && this.grabT >= (this.opts.minGrabSec ?? 0)) this.finishGrab();   // a tap's minimum hold ran out
      }
      return null;
    }
    if (this.active && r.grounded) {                     // LANDING
      const t = this.active;
      this.active = null;
      if (this.grabReleaseAsked) this.finishGrab();      // let go before the minimum and landed inside it: the grab is what the air held
      // a spin is graded on the turn it completed; a grab on how long it was held (spun += 4/s: a 0.25 s hold = 1)
      const needed = t.turns === 0 ? 1 : Math.abs(t.turns) * 2 * Math.PI;
      const done01 = Math.min(1, this.spun / needed);
      // a grab's sketchy floor is lower (a 0.1 s poke): the surf air hangs ~0.4 s, and measured on the first cut every probe grab
      // (0.11 s held) went down as a bail — a short grab is a sketchy grab, not a fall
      const sketchyAt = t.turns === 0 ? TrickMachine.GRAB_SKETCHY : TrickMachine.LAND_SKETCHY;
      const grade: 'clean' | 'sketchy' | 'bail' = done01 >= TrickMachine.LAND_CLEAN ? 'clean' : done01 >= sketchyAt ? 'sketchy' : 'bail';
      console.info(`[BOARD-LAND] ${grade} ${t.name} ${done01.toFixed(2)}`);
      this.rig.char.root.rotation.z = 0;
      if (grade !== 'bail') {
        const sketchy = grade === 'sketchy';
        // phase 4 — REPEAT DECAY (ComboChain's table): the same trick again pays 75 %, then 50, 25, 10, then nothing and is
        // no link at all (skate's masher lesson: a mashed METHOD × 8 must not out-score a played line). A trick that pays
        // nothing is answered, not silently dropped.
        const rep = this.links.filter((l) => l.key === moveKey(t.name)).length;
        const paid = Math.round(t.pts * REPEAT_DECAY[Math.min(rep, REPEAT_DECAY.length - 1)] * (sketchy ? 0.5 : 1));
        this.graceT = TrickMachine.LINK_GRACE_SEC;
        if (paid <= 0) { this.playClip('jump_land'); this.opts.onBeat?.('land'); return `${t.name} · REPEAT — NOTHING`; }
        this.links.push({ key: moveKey(t.name), rep });
        this.combo = this.multiplier; this.landed++; this.bestCombo = Math.max(this.bestCombo, this.combo);
        this.comboPts += paid * this.combo;
        // the same thresholds ComboChain uses, so a 5-trick run means the same thing on either board
        if (this.combo === 5) this.momentum?.report({ kind: 'big_make' });
        else if (this.combo >= 8) this.momentum?.report({ kind: 'highlight_dunk', weight: Math.min(30, this.combo * 2) });
        this.playClip('jump_land');
        this.opts.onBeat?.(sketchy ? 'land_sketchy' : 'land');
        this.onHud({ combo: `${this.combo}x` });
        return `${sketchy ? 'SKETCHY ' : ''}${t.name}${rep > 0 ? ` · REPEAT ×${rep + 1}` : ''} +${paid * this.combo}${this.combo > 1 ? ` (${this.combo}×)` : ''}`;
      }
      this.bail();
      return 'BAILED';
    }
    if (!this.active && r.grounded && this.comboPts > 0) {  // bank the combo
      // phase 4: the combo stays OPEN for the grace window (it used to bank the very next frame, so 2× never happened);
      // when the window runs out the bank NAMES the line it paid (THPS: the combo reads out as it banks)
      this.graceT -= dt;
      if (this.graceT > 0) return null;
      const banked = this.comboPts, line = this.links.map((l) => l.key).join(' → ');
      this.score += banked;
      this.onHud({ score: this.score, combo: '' });
      this.comboPts = 0; this.combo = 0; this.links = [];
      return `BANKED +${banked}${line ? ` · ${line}` : ''}`;
    }
    return null;
  }

  bail(): void {
    this.active = null; this.grabbing = false; this.grabReleaseAsked = false;
    this.comboPts = 0; this.combo = 0; this.links = []; this.graceT = 0;
    this.rig.rider.vel.scaleInPlace(0.25);
    this.playClip('skate_bail');   // SHARED-ANIM-BUS: the board's own bail (this borrowed the football tackle fall)
    this.opts.onBeat?.('bail');
    this.onHud({ combo: '' });
  }

  bankGrind(line: GrindLine): void {
    this.links.push({ key: 'GRIND', rep: this.links.filter((l) => l.key === 'GRIND').length }); this.graceT = TrickMachine.LINK_GRACE_SEC;
    this.combo = this.multiplier;
    this.comboPts += line.bonus * this.combo;
  }
}
