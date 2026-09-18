// SkateRunMode v5 — REPLACES the M45 file. Rides the expanded park
// (rideWorlds v3 ships alongside — bowl, downhill straight, five rails,
// quarter-pipes). Mode-side changes:
//   - bounds widened to the new 70-unit park (was clamping at the old 46)
//   - coin lines routed along the NEW features: down the downhill straight
//     and an arc over the bowl rim — the risk lines pay
//   - grind credit goes to the rail you actually locked (nearest line),
//     so the kinked-transfer rails and downhill rail pay their own bonuses
//     (the old code always credited rail #1's 180)
// Everything else from M45 kept: pump/pop/flips, manual window via
// boardCore, park ambient, coin audio.

import { Coyote } from '../core/gameFeel';
import { stepSpeedFov } from '../core/SpeedFov';
import { BoostKit } from '../core/BoostKit';          // FINISH-RELEASE: the shared boost (landings and grinds fill it, RB/Shift burns it)
import { BoostFx } from '../premium/BoostFx';
import { BoostPads } from '../visual/BoostPads';
import { Vector3, type TransformNode } from '@babylonjs/core';
import type { ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import { CharacterLibrary } from '../core/CharacterLibrary';
import { buildRig, landsSwitch, TRICKS, type BoardRig } from './boardCore';
import { airTrickFor, basePts as trickPts, heldTrickDir, SKATE_TRICKS, type BoardTrick } from '../core/BoardTricks';   // the named vocabulary
import { buildSkatepark, PARK_BOUND, type RideWorld } from './rideWorlds';
import { readBoardVenue, tuneForVenue } from '../nexus/boardVenues';   // different places to ride
import { assertSpawned } from '../core/FrameGuard';
import { SPORT_CLIP } from '../anim/clipRegistry';
import { FlickStick } from '../core/FlickStick';
import { BoardMovement, SKATE_TUNING } from '../core/BoardMovement';
import { AirControl } from '../core/AirControl';
import { resolveLanding, BalanceSave, SKETCHY_SCORE_MULT } from '../core/LandingSystem';
import { BalanceChannel, tryRevert, type BalanceChannelKind } from '../core/GrindManual';
import { pickRail, nearestOnSegment } from '../core/RailMagnet';   // VENICE-SKATE-THPS: the catch window, testable on its own
import { ComboChain } from '../core/ComboChain';
import { WALL_RIDE, canWallRide, startWallRide, stepWallRide, wallSide, wallRideExitVel, wallplantVel, canLipStall, startLipStall, stepLipStall, dropInVel, lipStallPts, type Wall, type Lip, type WallRideState, type LipStallState } from '../core/WallRide';   // WALL RIDES + LIP TRICKS (2026-09-18)
import { plazaWalls, plazaLips } from './skatePlaza';
import { BoardAnimTree } from '../anim/boardTree';
// BIOMECH-WAVE2 (2026-09-09) — the game-wide bar on the board family (SPEC-FEL-BIOMECH-GAMEWIDE G1–G6). Measured on
// 2942860, per rendered frame:
//   G1/G5  boardSuite's clips key the hips, the legs and the arms and never the thoracic chain or the head, so the
//          rider's chest sat wherever the last carve left it and his eyes pointed down the ROOT yaw for a whole run —
//          on a board sport there is no objective to look at, so nobody had ever given him one. The Posture Poses
//          layer now carries the chest / shoulders / head per ride window, with the eyes on a point 7 m DOWN THE LINE.
//   G6     the lean was real (GroundRide rolls the root toward −steer·0.28; the before run peaks at 14.4°) but it is
//          SPEED-BLIND and it reads the RAW STICK, while the carve CLIP is chosen from `move.balance.lean` — two
//          independent signals for one move. The roll now comes off the same lean the tree reads, scaled by speed
//          (BoardPosture.boardBank). On skate the two signals already agreed closely and the measured roll barely
//          moves (11/220 carve-clip frames upright before, 11/212 after, peak 14.4° → 12.8°); the gain here is that
//          the body and the clip can no longer disagree. Surf, whose cutback had no stick under it at all, is where
//          the number moves (25/146 → 7/145) — see SurfBreakMode.
import { mountPostureLayer, type PostureLayer } from '../anim/PostureLayer';
import { BoardTrickLayer } from '../anim/BoardTrickLayer';   // TRICK POSE (2026-09-15): tricks recognisable on sight
import { trickSeconds, BOARD_ONLY_SPINS } from '../core/TrickPose';
import { boardPose, boardBank, lookAhead, BOARD_INPUT_IDLE, type BoardPostureInput } from '../core/BoardPosture';
import { angulate } from '../core/DynamicPosture';   // a rider ANGULATES: the board banks, the spine comes back out of it
import { MomentumBus } from '../core/MomentumBus';
import { BoardSync, deckUnderFeet, type V3Like } from '../core/BoardPhysics';
import { boneNode } from '../anim/boneLookup';
import { GoalTracker, MovingRail, SKATE_GOALS, VENICE_PATROL_RAIL } from '../core/ParkGoals';
import { Onlookers } from '../visual/Onlookers';
import { SoundKit } from '../audio/SoundKit';
import { refuse } from '../core/Refusal';
import { EffectsKit } from '../visual/EffectsKit';
import { CoinField } from '../core/Pickups';
import { RIDE_CONFIG as CFG } from './modeConfigs';
import { mountVenueProps, type VenuePropsHandle } from '../visual/VenueProps';

const RUN_SEC = 90;
/** Skate 3 banks the moment you roll away clean; the delay is the revert window. */
const BANK_SETTLE_SEC = 0.45;
/** A bank at or above this is the run's big moment and is cued as one. */
const BIG_BANK_PTS = 500;
// Imported from the world builder so the invisible clamp and the visible fence
// are the SAME number by construction -- they were 33 and 35 (the ground's own
// half-width), so the rider stopped two metres short of a fence that was not
// there anyway.

/** The camera preset's resting fov, captured on the first frame after load and restored to by SpeedFov. */
let baseFov: number | null = null;

export const SkateRunMode: ModeDefinition = (() => {
  let world: RideWorld, rig: BoardRig;
  // WALL RIDES, WALLPLANTS, LIP TRICKS (owner 2026-09-18): the plaza's rideable faces and lips, and the moment on one
  let walls: Wall[] = [], lips: Lip[] = [];
  let wallRide: WallRideState | null = null, lipStall: LipStallState | null = null, xHeld = false;
  /** The grind button asked for a wall / a lip: the ask is REMEMBERED (the wall's catch window at 7 m/s is ~90 ms — a press
   *  lands before it; THPS holds the button and the wall catches when reached). */
  let wallAskedAt = -1;
  const WALL_ASK_MS = 450;
  let props: VenuePropsHandle | null = null, propsGone = false;   // ship pass 4: CC0 prop dressing (visual/venuePropSets.ts)
  /** Seconds rolling clean on the ground before the pot banks (revert window). */
  let settleT = 0;
  /** Latched while the rider is against the fence, so the cue fires once per contact rather than every frame. */
  let fenceHit = false;
  /** Heading when the wheels left the ground — decides switch stance on landing. */
  let airEntryYaw = 0;
  /** Has the camera been snapped since play actually began? */
  let snappedForPlay = false;
  /** A point 8 m ahead along the rider's facing — the snap's objective, so "behind" means behind the rider. */
  const aheadOfRider = (): Vector3 => rig.char.root.position.add(new Vector3(Math.sin(rig.char.root.rotation.y), 0, Math.cos(rig.char.root.rotation.y)).scale(8));
  let coins: CoinField;
  let boost = new BoostKit();
  let boostFx: BoostFx | null = null;
  let boostPads: BoostPads | null = null;
  let boostHeld = false;
  let timeLeft = RUN_SEC;
  /** How long a full-pop air lasts, for judging which trick the rider can finish. Measured against the ollie's own
   *  hang rather than guessed: a kerb ollie is a quarter-second, a ramp air most of a second. */
  const AIR_BUDGET_SEC = 0.95;
  let stickX = 0, stickY = 0, pump = 0;
  // SKATE-MOVE (2026-09-08): the pump released just before POP still charges the ollie (space on the keyboard emits the
  // trigger's release BEFORE the A press, so a keyboard ollie always saw pump 0).
  let pumpReleased = 0, pumpReleasedAt = -1;
  const ollieCharge = (): number => Math.max(pump, performance.now() - pumpReleasedAt < 250 ? pumpReleased : 0);
  /**
   * Ollie pop. GroundRide's gravity is −14 m/s² and `jump(p)` sets `vel.y = 5 + p·5.5`, so height is v²/28:
   *
   *   charge    launch        height    hang
   *   none      6.49 m/s      1.50 m    0.93 s
   *   half      7.84 m/s      2.20 m    1.12 s
   *   full      9.18 m/s      3.01 m    1.31 s
   *
   * RAISED from 1.10–2.63 m on the owner's call (2026-09-17): the pop read short. Worth knowing what it trades —
   * hang is what BoardTricks' `airSec` is judged against, and at a 0.93 s floor every skate trick in the table
   * (the longest is the 360 FLIP at 0.58 s) already fits off a flat-ground ollie, so `fitsAir` no longer gates
   * anything for skate. That was already true at the old numbers; this widens it. If the trick hierarchy should
   * mean something again, the hard tricks' `airSec` has to come up with the ollie — that is a separate call.
   */
  const olliePower = (): number => 0.27 + ollieCharge() * 0.49;
  let ended = false;

  const flick = new FlickStick();
  function bannerFlash(ctx: ModeContext, text: string, ms: number): void {
    ctx.setHud({ banner: text });
    setTimeout(() => ctx.setHud({ banner: '' }), ms);
  }
  // ── Mode 3 shared stack (P2-P9) ──
  const move = new BoardMovement(tuneForVenue(SKATE_TUNING, readBoardVenue('skate')));
  const air = new AirControl();
  /** Grace window on the ollie: the wheels have left, the press still counts (gameFeel.Coyote). */
  const coyote = new Coyote();
  const combo = new ComboChain(undefined, 'air');   // MECHANICS PASS: the same air again in one combo pays less (THPS repeat decay)
  let mbus = new MomentumBus();
  let animTree: InstanceType<typeof BoardAnimTree>;
  let posture: { layer: PostureLayer; dispose(): void } | null = null;
  let trickLayer: BoardTrickLayer | null = null;
  const bio: BoardPostureInput = { ...BOARD_INPUT_IDLE };
  let boardSync: BoardSync;
  let grindCh: BalanceChannel | null = null;
  let manualCh: BalanceChannel | null = null;
  let save: BalanceSave | null = null;
  let pushing = false;
  let lastLanding: 'none' | 'clean' | 'sketchy' = 'none';
  // A+ P0 juice (PM brief BOARD-A-PLUS-P0, 2026-09-06): one punch per beat — a clean land answers softly, a bail hits.
  let bailLatch = false;                      // one bail punch per touchdown (landing bail OR the failed save, never both)
  const FLASH_CHAIN = 3;                      // a chain this long earns the short flash on a clean land
  let landingBeatT = 0;
  // ANIM-READABILITY (2026-09-07): the bail is a TREE beat, not a direct play. The direct `play('skate_bail')` was cut by
  // the tree's own play the same frame (the touchdown moved the state air → cruise), so the fall read as a 0.1 s blend.
  const BAIL_BEAT_SEC = 1.0;                  // skate_bail is 0.75 s; the tree settles it into the idle when it runs out, and the 0.25 s left is the get-up — the next push fades from the idle, not the floor (0.3 m/frame hand pops measured at 0.8)
  let bailBeatT = 0;
  /** The side the sketchy-save wobble is pulling to, while one is live (null = no save). */
  let saveLean: 'LEFT' | 'RIGHT' | null = null;
  let goals: GoalTracker;
  let patrolRail: MovingRail;
  let crowd: Onlookers;
  // ── VENICE-SKATE-THPS (2026-09-09) ────────────────────────────────────────────────────────────────────────────────
  /** Seconds of spectacle slow-mo left (H4). 0 = real time. */
  let slowT = 0;
  /** Seconds until another spectacle beat may fire — a slow-mo on every ollie is a slow game, not a THPS one. */
  let slowCool = 0;
  let slowCount = 0;
  const SLOW_SCALE = 0.42;          // gameplay AND clip time; the whole beat, not a clip effect
  const SLOW_SEC = 0.34;            // short: the spectacle, not the flight
  const SLOW_COOLDOWN = 2.2;
  /** The pop beat: skate_ollie's plant -> pop -> hang, held while the tree owns it. */
  let popBeatT = 0;
  const POP_BEAT_SEC = 0.4;         // = skate_ollie's own length
  /** The keyboard's crouch is a HOLD (space emits a 0.01 sentinel down, 0 up); a pad's trigger carries its own value. */
  let crouchAt = -1;
  /** The manual link: a stick flick pair (back->forward = manual, forward->back = nose manual) within this window. */
  let flickSign = 0, flickAt = -1;
  const FLICK_WINDOW_MS = 620;   // 420 ms asked for a flick pair faster than most players actually flick
  /** Entering a manual costs a moment of the foot drag; do not let the tap brake the line it is linking. */
  let brakeMuteUntil = -1;
  /** A manual request raised by onInput and consumed by update (the channel needs move.balance, which lives there). */
  let manualWanted: BalanceChannelKind | null = null;
  /** The rail magnet: the catch sphere around the FEET, and how aligned with the rail the run has to be. */
  const GRIND_MAGNET = 2.0;         // auto-lock, no button — the THPS rule
  const GRIND_REACH = 3.0;          // with POP pressed: the player asked for it
  const GRIND_ALIGN = 0.34;         // |cos| between the run and the rail
  const GRIND_ASK_MS = 260;         // how long a POP press keeps asking for a rail
  const RELOCK_MS = 350;            // after a dismount, before the same rail may catch again
  /** When the player last pressed POP in the air (the ASK), and when the rail is allowed to catch again. */
  let grindAskedAt = -1, relockUntil = -1;
  /** Airtime + height of the current air, for the big-air spectacle beat. The floor is the last y the wheels were on —
   *  a raycast per frame for one number the park already told us when it landed. */
  let apexDone = false, lastVy = 0, lastGroundY = 0;
  const groundUnder = (): number => lastGroundY;
  /** Eased deck pitch (radians): a manual rides the tail with the nose up, everything else is flat. */
  let boardPitch = 0;
  /** ANIM-RESIDUAL: the deck's eased root-local offset (under the feet in the air), the feet midpoint the stance holds on
   *  the ground, and the two ankle nodes it is read from. */
  const deckLift = { x: 0, y: 0, z: 0 };
  let feetGround: V3Like | null = null;
  let feet: [TransformNode, TransformNode] | null = null;
  const feetMidLocal = (): V3Like | null => {
    if (!feet) return null;
    const inv = rig.char.root.getWorldMatrix().clone().invert();
    const a = Vector3.TransformCoordinates(feet[0].getAbsolutePosition(), inv);
    const b = Vector3.TransformCoordinates(feet[1].getAbsolutePosition(), inv);
    const m = { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y), z: (a.z + b.z) / 2 };   // the LOWER ankle: the deck meets the first foot
    return Number.isFinite(m.x) && Number.isFinite(m.y) && Number.isFinite(m.z) ? m : null;
  };
  /** THE NaN TRAP (VENICE-SKATE-THPS). The last frame whose position and heading were real numbers, and how many times
   *  the run has had to be put back there. */
  let lastGoodPos: Vector3 | null = null, lastGoodYaw = 0, nanReports = 0;
  /** Distance to the nearest grind line (metres); Infinity before the world exists. */
  const railDistance = (): number => {
    if (!world?.grindLines?.length) return Infinity;
    let best = Infinity;
    for (const l of world.grindLines) best = Math.min(best, nearestOnSegment(l.a, l.b, rig.char.root.position).d);
    return best;
  };
  // ── WALL RIDES, WALLPLANTS, LIP TRICKS ────────────────────────────────────────────────────────────────────────────
  function tryWallRide(ctx: ModeContext): boolean {
    const pos = rig.char.root.position, v = rig.rider.vel;
    const w = canWallRide({ x: pos.x, y: pos.y, z: pos.z }, { x: v.x, y: v.y, z: v.z }, walls, !rig.rider.grounded && air.state.airborne && !rig.rider.grinding);
    if (!w) return false;
    wallRide = startWallRide(w, { x: pos.x, y: pos.y, z: pos.z }, { x: v.x, y: v.y, z: v.z });
    trickLayer?.clear();
    combo.add('WALL RIDE', WALL_RIDE.pts, 'grind');
    bannerFlash(ctx, 'WALL RIDE', 700);
    SoundKit.play('powerUp', { volume: 0.4, pitch: 1.15 }); ctx.feel?.impact?.(0.25);
    console.info(`[SKATE-WALL] ride ${w.label} at y ${pos.y.toFixed(2)} speed ${wallRide.speed.toFixed(1)}`);
    return true;
  }
  function wallplant(ctx: ModeContext): void {
    if (!wallRide) return;
    const v = wallplantVel(wallRide);
    endWallRide();
    move.yaw = v.yaw; airEntryYaw = v.yaw;
    move.vel.set(v.x, 0, v.z); rig.rider.vel.set(v.x, v.y, v.z);
    rig.rider.grounded = false;
    combo.add('WALLPLANT', WALL_RIDE.plantPts, 'air');
    bannerFlash(ctx, 'WALLPLANT', 700);
    SoundKit.play('impact', { pitch: 1.3, volume: 0.45 }); ctx.feel?.impact?.(0.35); spectacle(ctx, 'wallplant');
    console.info('[SKATE-WALL] wallplant');
  }
  function endWallRide(): void {
    if (!wallRide) return;
    const ridden = wallRide.t;
    if (ridden > 0.2) combo.accrue('WALL RIDE', Math.round(WALL_RIDE.ptsPerSec * ridden), 'grind');
    wallRide = null;
    if (trickLayer) trickLayer.overridePose = null;
    rig.char.root.rotation.z = 0;
  }
  function tryLipStall(ctx: ModeContext): boolean {
    const pos = rig.char.root.position, v = rig.rider.vel;
    const hit = canLipStall({ x: pos.x, y: pos.y, z: pos.z }, { x: v.x, z: v.z }, lips);
    if (!hit) return false;
    lipStall = startLipStall(hit, heldTrickDir(stickX, stickY));
    trickLayer?.clear();
    if (trickLayer) trickLayer.overridePose = { boardPitch: lipStall.trick.boardPitch, boardRoll: lipStall.trick.boardRoll };
    bannerFlash(ctx, lipStall.trick.label, 700);
    SoundKit.play('impact', { pitch: 1.1, volume: 0.3 }); ctx.feel?.impact?.(0.2);
    console.info(`[SKATE-LIP] ${lipStall.trick.id} on ${hit.lip.label}`);
    return true;
  }
  function dropIn(ctx: ModeContext): void {
    if (!lipStall) return;
    const st = lipStall; lipStall = null;
    if (trickLayer) trickLayer.overridePose = null;
    const pts = lipStallPts(st);
    combo.add(st.trick.label, pts, 'grind');
    const v = dropInVel(st);
    move.yaw = v.yaw; move.vel.set(v.x, 0, v.z); rig.rider.vel.set(v.x, v.y, v.z);
    if (st.trick.fakie) move.switchStance();
    rig.char.root.rotation.y = move.yaw + (move.stance === 'switch' ? Math.PI : 0);
    bannerFlash(ctx, `${st.trick.label} +${pts}`, 700);
    SoundKit.play('whoosh', { pitch: 0.95, volume: 0.35 });
    console.info(`[SKATE-LIP] drop in after ${st.t.toFixed(2)} s +${pts}`);
  }
  function tickWalls(ctx: ModeContext, dt: number): void {
    // the remembered ask: the wall (or the lip) catches the frame it comes into reach while the button is held or was just pressed
    if (!wallRide && !lipStall && !grindCh && !manualCh && (xHeld || performance.now() - wallAskedAt < WALL_ASK_MS)) {
      if (tryWallRide(ctx) || tryLipStall(ctx)) wallAskedAt = -1;
    }
    if (wallRide && rig.rider.grinding) endWallRide();   // a rail that caught anyway owns the body
    if (wallRide) {
      const p = stepWallRide(wallRide, dt);
      const side = wallSide(wallRide);
      rig.char.root.position.set(p.x, p.y, p.z);
      rig.char.root.rotation.y = p.yaw; rig.char.root.rotation.z = -side * 0.3;
      move.yaw = p.yaw; move.vel.set(Math.sin(p.yaw) * wallRide.speed, 0, Math.cos(p.yaw) * wallRide.speed);
      rig.rider.vel.set(move.vel.x, wallRide.vy, move.vel.z); rig.rider.grounded = false;
      if (trickLayer) trickLayer.overridePose = { boardRoll: side * WALL_RIDE.boardRoll };
      if (p.done) {
        const v = wallRideExitVel(wallRide);
        endWallRide();
        move.vel.set(v.x, 0, v.z); rig.rider.vel.set(v.x, v.y, v.z);
        console.info('[SKATE-WALL] off the wall');
      }
      return;
    }
    if (lipStall) {
      rig.char.root.position.x = lipStall.x; rig.char.root.position.z = lipStall.z; rig.char.root.position.y = lipStall.lip.y + 0.04;
      rig.rider.vel.setAll(0); move.vel.setAll(0);
      const yaw = Math.atan2(lipStall.lip.ux, lipStall.lip.uz);
      rig.char.root.rotation.y = yaw + (move.stance === 'switch' ? Math.PI : 0); move.yaw = yaw;
      if (stepLipStall(lipStall, dt, xHeld).done) dropIn(ctx);
    }
  }

  /** Apply a trick to the air chain and flash it -- shared by flick and buttons. */
  /** ANTI-MASH (2026-09-15): a trick needs a beat to LEAVE THE BOARD. Two flips 60 ms apart is not a line, it is a masher
   *  — and it was the whole of the remaining gap (a random 8-a-second driver out-scored a played line 4:1). A player who
   *  throws a trick, lets it turn and throws another is inside this window; nothing a human does is refused by it. */
  const TRICK_CADENCE_SEC = 0.18;
  let lastTrickAt = 1e9;
  const airTrick = (
    ctx: ModeContext, id: string, label: string,
    family: 'flip' | 'grab' | 'spin', basePts: number, difficulty: number,
  ): void => {
    if (lastTrickAt - timeLeft < TRICK_CADENCE_SEC) { refuse(ctx, 'LET IT TURN'); return; }   // timeLeft counts DOWN
    lastTrickAt = timeLeft;
    // TRICK POSE: the named trick's shape goes on the rig (the deck flips, a shuv turns the deck not the rider, a grab puts
    // the right hand on the right edge), and a flip is caught at the table's roll so the grade and the picture agree
    const named = SKATE_TRICKS.find((t) => t.id === id) ?? (family === 'grab' ? SKATE_TRICKS.find((t) => t.id === 'indy') : null);
    const boardOnly = named ? BOARD_ONLY_SPINS.has(named.id) : false;
    air.applyTrick({
      id, label, family: boardOnly ? 'flip' : family, basePts, difficulty,
      ...(named && (named.flipDeg !== 0 || boardOnly) ? { flipTarget: named.flipDeg * Math.PI / 180, flipSec: trickSeconds(named) } : {}),
      // a body spin (fs 360, bs 180, the 540 indy) is caught at the table's angle — frontside one way, backside the other
      ...(named && named.spinDeg !== 0 && !boardOnly ? { spinTarget: (named.id.startsWith('bs') ? -1 : 1) * named.spinDeg * Math.PI / 180, spinSec: trickSeconds(named) } : {}),
    });
    if (named) trickLayer?.start(named);
    ctx.setHud({ banner: label });
    setTimeout(() => ctx.setHud({ banner: '' }), 500);
    SoundKit.play('whoosh', { pitch: 1 + difficulty * 0.15, volume: 0.4 });
  };

  // ── A+ P0 juice — Skate attention. No hang slowMo, no juice.impact({slow}), no HoopJuice. ────────────────────────
  /** A clean landing: a soft shake (the light feel hit stays), a short white-gold flash only when the chain was long. */
  function landPunch(ctx: ModeContext, chainLen: number): void {
    const big = chainLen >= FLASH_CHAIN;
    ctx.juice.shake(big ? 0.08 : 0.06, 120);
    if (big) ctx.juice.flash('#fff6dd', 80);
    console.info(`[SKATE-JUICE] clean land (${chainLen} trick${chainLen === 1 ? '' : 's'}${big ? ', flash' : ''})`);
  }
  /**
   * THE SPECTACLE BEAT (H4, VENICE-SKATE-THPS). THPS2's air hangs for a moment when something is actually happening —
   * the gap you are clearing, the rail you just caught, the chain you just landed. Skate had NO slow-mo at all: the
   * A+ pass had ruled out the dunk's hang slowMo (a permanent, every-attempt hold, and rightly forbidden) and left the
   * mode with a land punch and nothing else.
   *
   * This one is scoped the way the parry's is: short (0.34 s), earned (three named beats, never a plain ollie), rate
   * limited (2.2 s between them) and it slows the WHOLE beat — `ctx.juice.slowMo` only moves `animationTimeScale`, so
   * on its own it slows the clips while the board keeps flying, which reads as a stutter. The mode scales its own dt
   * with it; the run clock stays honest and keeps counting real seconds.
   */
  function spectacle(ctx: ModeContext, why: string): void {
    if (slowT > 0 || slowCool > 0) return;
    slowT = SLOW_SEC; slowCool = SLOW_COOLDOWN; slowCount++;
    ctx.juice.slowMo(SLOW_SCALE, SLOW_SEC * 1000);
    console.info(`[SKATE-SLOWMO] ${why} (${slowCount})`);
  }
  /** A bail: hit-stop + shake + ONE low thud + dust. Heavier than a clean land. Latched once per touchdown. */
  function bailPunch(ctx: ModeContext): void {
    if (bailLatch) return;
    bailLatch = true;
    ctx.juice.hitStop(45);
    ctx.juice.shake(0.10, 140);
    SoundKit.play('impact', { pitch: 0.6, volume: 0.65 });
    EffectsKit.burst(ctx.scene, rig.char.root.position.clone(), 'dust');
    console.info('[SKATE-JUICE] bail punch');
  }

  return {
    modeId: 'skateboard', camPreset: 'board',
    // The LIGHT and the SKY are the venue's, not the module's. Getters, because the harness reads both at mount —
    // after the splash has written the pick, before load() runs. THE WAREHOUSE rendered under Venice's sunset sky
    // until this existed: the palette was per-venue and the lighting was a literal declared here at module scope.
    get mood() { return readBoardVenue('skate').mood; },
    get backdrop() { return readBoardVenue('skate').sky; },

    async load(ctx: ModeContext) {
      // ONE BUS PER MOUNT, OWNED BY THE HARNESS. This mode built its own, which worked and was
      // INAUDIBLE: the crowd swell and the tier sting are bound to the harness's bus, and there was
      // exactly one onTierChange subscriber in the game. Same reports, same weights, now heard.
      mbus = ctx.momentum;
      // module-scope state outlives a mount: a remount must re-read the preset's fov, not the last run's.
      baseFov = null;
      // the player's venue: a different palette, a different size, a different place
      const venue = readBoardVenue('skate');
      world = buildSkatepark(ctx.scene, venue);
      console.info(`[SKATE-VENUE] ${venue.name} · bound ${venue.bound} · ${venue.mood}`);
      propsGone = false; void mountVenueProps(ctx.scene, 'skatepark', undefined, { spread: world.bound / 36 }).then((h) => { if (propsGone) h?.dispose(); else props = h; });
      // Gate 0: Validate skeletal rig by spawning placeholder to check skeleton
      const _validateChar = await CharacterLibrary.spawn(ctx.scene, CFG.heroUrl, { position: new Vector3(0, -1000, 0) });
      if (_validateChar.skeleton?.bones.length === 65) {
        // Confirmed: 65-bone Mixamo rig with proper structure
      }
      _validateChar.dispose(); // Clean up validation placeholder
      // carveAccel 0: the momentum model below owns the velocity; the Rider's own 4.95 m/s² forward creep was the only
      // thing that moved a stick-held rider (0.33 m in 4 s on the baseline probe) and it scaled with frame time
      rig = await buildRig(ctx, CFG.heroUrl, VENICE_PATROL_RAIL.spawn.clone(), 0, world.ground, '#22d3ee', 'skateboard', { carveAccel: 0, grindSpeed: 6.5 });
      rig.char.animator.play(SPORT_CLIP.boardIdle, { loop: true });
      animTree = new BoardAnimTree(rig.char.animator);
      posture?.dispose();
      posture = mountPostureLayer(ctx.scene, rig.char.skeleton, rig.char.root, () => {
        const { window, pose, legs } = boardPose(bio);
        // ANGULATION. The ROOT already banks (boardBank, applied to root.rotation.z) but every authored board stance is
        // [x, 0, 0] — pitch only — so today the whole body rolls as ONE RIGID PIECE. A real rider banks the board and
        // keeps their upper body out of it; the spine counter-angles against the edge. Deliberately the OPPOSITE sign
        // to the hoops bank: a basketball player rolls INTO the turn because nothing else is tilted, a rider's board
        // is already over. Reads the root's own eased roll, so the counter-angle can never disagree with the bank.
        const angled = angulate(pose, rig.char.root.rotation.z, window);
        // G1 on a board sport: the "objective" is where the board is TAKING you. 7 m down the current heading at head
        // height — the chest squares to it and the eyes go with it.
        const la = lookAhead(rig.char.root.position, rig.char.root.rotation.y, 7, 1.5);
        const at = new Vector3(la.x, la.y, la.z);
        return { pose: angled, legs, aim: at, eyes: at, window };
      }, 'SKATE-PP');
      trickLayer?.dispose();
      trickLayer = new BoardTrickLayer(ctx.scene, rig.char.skeleton, rig.char.root, rig.board, { bodySpin: false });   // after the posture layer: the grab hand is the last word
      {
        const dev = (window as unknown as { __FEL_DEV__?: { boardPosture?: unknown; skate?: unknown } }).__FEL_DEV__;
        if (dev && process.env.NODE_ENV === 'development') dev.boardPosture = { me: () => posture?.layer.get() ?? null, bio: () => ({ ...bio }), aim: () => { const la = lookAhead(rig.char.root.position, rig.char.root.rotation.y, 7, 1.5); return la; } };   // BIOMECH-WAVE2 probes
        // VENICE-SKATE-THPS (2026-09-09): the ride state the probe grades — speed, the push cadence, the air, the rail
        // latch, the manual channel and the two roll writers. Nothing here changes what the mode does.
        // ANIM-SURGICAL (2026-09-14): published on `next start` too, beside the harness's anim() readout. The eye grades
        // skate H3 on production and its grind hunt pops only when `skate().railD` says a rail is near — dev-only, so on
        // prod it read null, never popped, and graded "grindHeld 0". Read-only; ModeHarness drops the handle on dispose.
        if (dev) dev.skate = () => ({
          pos: { x: rig.char.root.position.x, y: rig.char.root.position.y, z: rig.char.root.position.z },
          rot: { x: rig.char.root.rotation.x, y: rig.char.root.rotation.y, z: rig.char.root.rotation.z },
          speed: move.speed, speed01: move.speed01, stroking: move.stroking, pushing,
          drive: -stickY, steer: stickX, grounded: rig.rider.grounded, airtime: air.state.airtime,
          grinding: rig.rider.grinding !== null, grindNeedle: grindCh?.needle ?? null, grindHeld: grindCh?.heldSec ?? null,
          manual: manualCh?.active ?? false, manualNeedle: manualCh?.needle ?? null, manualHeld: manualCh?.heldSec ?? null,
          railD: railDistance(), slow: slowT, slows: slowCount, pop: popBeatT > 0, boardPitch, deck: { ...deckLift }, grab: air.state.grabHeld ?? null,
          // the golden goal rail, live: a probe has to be able to LINE UP with it, and a rail that patrols is
          // somewhere different every second
          patrol: { a: { ...patrolRail.line.a }, b: { ...patrolRail.line.b } },
          onPatrol: rig.rider.grinding?.gapId === patrolRail.gapId,
          chain: air.state.chain.map((t) => t.label), pot: combo.pot, banked: combo.banked,
          goals: goals.doneCount, height: rig.char.root.position.y - lastGroundY,
        });
      }
      boardSync = new BoardSync(rig.board, rig.char.root);
      walls = plazaWalls(world.bound); lips = plazaLips(world.bound); wallRide = null; lipStall = null;   // WALL RIDES + LIP TRICKS
      {
        const lf = boneNode(rig.char.skeleton, 'LeftFoot'), rf = boneNode(rig.char.skeleton, 'RightFoot');
        feet = lf && rf ? [lf, rf] : null;
        feetGround = null; deckLift.x = 0; deckLift.y = 0; deckLift.z = 0;
      }
      mbus.reset();
      goals = new GoalTracker(SKATE_GOALS);
      // the gimmick: a rail that patrols the plaza — grind it in motion. ANIM-SURGICAL: down the opening line, patrolling
      // across it (it lay across the line and could not catch a skater riding at it — see VENICE_PATROL_RAIL)
      const PR = VENICE_PATROL_RAIL;
      patrolRail = new MovingRail(PR.a.clone(), PR.b.clone(), PR.from.clone(), PR.to.clone(), PR.speed);
      patrolRail.mount(ctx.scene);      // L2: the goal object has to be visible
      // L4: a Venice plaza is not empty. The venue owns where people stand.
      crowd = new Onlookers(ctx.scene, world.crowdSpots);
      // BOOST (FINISH-RELEASE): three pads on the park's two diagonal lines and the centre — the lines the coins already
      // teach — so a pad is a line you choose, not a scatter
      boost = new BoostKit(0.2); boostHeld = false;
      boostFx?.dispose(); boostFx = new BoostFx(ctx.scene, ctx.camera, { trailFrom: rig.char.root, trailWidth: 0.4 });
      boostPads?.dispose();
      boostPads = new BoostPads(ctx.scene, [
        { pos: new Vector3(-9, 0, -9), yaw: Math.PI / 4 }, { pos: new Vector3(9, 0, 9), yaw: Math.PI / 4 + Math.PI }, { pos: new Vector3(9, 0, -9), yaw: -Math.PI / 4 },
      ]);
      world.grindLines.push(patrolRail.line);
      assertSpawned(ctx.scene, { hero: rig.char.root, minWorldMeshes: 4, modeId: 'skateboard' });
      // Phase 3 requires snapTo() at load and update() every frame. All three
      // board modes had only the update: the camera therefore STARTED at its
      // default position and had to lerp in at lag 0.08-0.12, with the rider
      // off-screen the whole way. That is where this mode's [FEL-FRAME] lines
      // came from — a fast board sport outruns a camera that begins behind.
      // snap BEHIND THE RIDER'S FACING, not behind a fixed +z: with no objective
      // the director assumes +z, which on this run put the camera ahead and to
      // the side for the first frames and, on a portrait phone (aspect 0.46),
      // lost the rider until the follow swung round (mobile capture, ~1 run in 2)
      ctx.camDirector.snapTo(rig.char.root.position, aheadOfRider());
      timeLeft = RUN_SEC; ended = false; fenceHit = false; wallRide = null; lipStall = null; xHeld = false; stickX = 0; stickY = 0; pump = 0; pumpReleased = 0; pumpReleasedAt = -1; pushing = false; settleT = 0; airEntryYaw = 0; snappedForPlay = false;
      landingBeatT = 0; bailBeatT = 0; bailLatch = false; lastLanding = 'none';
      slowT = 0; slowCool = 0; slowCount = 0; popBeatT = 0; crouchAt = -1; boardPitch = 0; lastGroundY = 0;
      grindAskedAt = -1; relockUntil = -1; lastGoodPos = null; lastGoodYaw = 0; nanReports = 0;
      flickSign = 0; flickAt = -1; brakeMuteUntil = -1; manualWanted = null; apexDone = false; lastVy = 0;
      grindCh = null; manualCh = null; save = null;
      // 'stadium' is a crowd bed with a breathing LFO -- wrong for a solo run
      // in an outdoor plaza. 'wind' is the open-air option in SoundKit's set.
      SoundKit.startAmbient('wind');
      EffectsKit.ambient(ctx.scene, 'park');
      coins = new CoinField(ctx.scene);
      coins.line(new Vector3(-16, 0.4, -16), new Vector3(16, 0.4, 16), 10);
      coins.line(new Vector3(16, 0.4, -16), new Vector3(-16, 0.4, 16), 10);
      coins.arc(new Vector3(-3, 1.2, -2), new Vector3(3, 1.2, -2), 2.4, 6);
      // NEW LINES — the risk routes pay: down the downhill straight...
      coins.line(new Vector3(20, 2.6, -19), new Vector3(20, 0.6, 8), 8);
      // ...and an air arc over the bowl rim
      coins.arc(new Vector3(-22, 1.6, 14), new Vector3(-10, 1.6, 14), 2.6, 6);
      ctx.setHud({ score: 0, combo: '', coins: 0, time: RUN_SEC, goals: `0/${SKATE_GOALS.length}`, hint: 'HOLD FORWARD to push · POP to ollie · B to MANUAL · GRIND the rails · hold RB / Shift to BOOST' });
    },

    onInput(ctx: ModeContext, e: FelInput) {
      SoundKit.unlock();
      if (e.t === 'button' && e.btn === 'X') xHeld = e.pressed;   // the grind button held: a lip stall lasts while it is
      if (e.t === 'button' && e.btn === 'R1') { boostHeld = e.pressed; return; }   // BOOST: the shared held R1
      // MANUAL, DIRECTLY. The flick pair stays (it is the THPS link and it chains beautifully), but it was the ONLY
      // door in, and a pair of opposite flicks inside one window is a test of the input rather than of the trick.
      // B is a plain manual, B with the stick forward is a nose manual, and B again is the revert out.
      if (e.t === 'button' && e.pressed && e.btn === 'B') {
        manualWanted = stickY < -0.4 ? 'nosemanual' : 'manual';
        return;
      }
      if (e.t === 'stick' && e.side === 'L') {
        // THE MANUAL LINK (VENICE-SKATE-THPS). There was no manual input at all: the only door into the channel was
        // tryRevert, which needs a transition landing AND |stickX| > 0.8 AND a low pump in the same frame — measured
        // 0 manual frames in a 40 s run, and the mode's own goal list asks for an 800-point combo you cannot link.
        // THPS2's door is the one every player already knows: tap the stick back then forward (or forward then back)
        // and the board rides its trucks. The two taps also brake for a moment, so the brake is muted through the link.
        if (Math.abs(e.y) > 0.7 && rig?.rider.grounded) {
          const sign = Math.sign(e.y), now = performance.now();
          if (flickSign !== 0 && sign !== flickSign && now - flickAt < FLICK_WINDOW_MS) {
            manualWanted = sign < 0 ? 'manual' : 'nosemanual';   // back then FORWARD = the back trucks
            brakeMuteUntil = now + 260;
            flickSign = 0; flickAt = -1;
          } else { flickSign = sign; flickAt = now; }
        } else if (Math.abs(e.y) < 0.3 && flickAt > 0 && performance.now() - flickAt > FLICK_WINDOW_MS) { flickSign = 0; flickAt = -1; }
        // a stick that arrives as NaN (a driver hiccup, a probe, a mis-scaled axis) used to be multiplied straight into
        // the yaw, and one NaN frame poisons the whole run: position, heading and camera all go NaN together and the
        // screen turns to void (VENICE-SKATE-THPS)
        stickX = Number.isFinite(e.x) ? e.x : 0; stickY = Number.isFinite(e.y) ? e.y : 0;
      }
      // Phase 4: flick-stick is THE trick input (Skate 3 vocabulary).
      if (e.t === 'stick' && e.side === 'R') {
        const g = flick.feed(e);
        // COYOTE TIME, finally used. `gameFeel` has exported a `Coyote` class since the juice toolkit was
        // written and NOTHING in the game referenced it — audited 2026-09-14, the only file naming it was
        // gameFeel itself.
        //
        // It belongs here more than anywhere, because rolling off a lip does not just lose you the pop: the
        // branch order below means a late ollie press falls into the MID-AIR branch and is spent as a
        // trick you did not ask for, off a board with no height under it. So the ollie test runs first now,
        // and it accepts the press for 110 ms after the wheels leave.
        //
        // `!air.state.airborne` is load-bearing: the window is still open on the frame after a real pop
        // (the rider WAS grounded a moment ago), so without it every ollie would immediately re-pop itself.
        const canPop = (rig.rider.grounded || coyote.ok) && !air.state.airborne;
        if (g && g.id === 'ollie' && canPop) {
          rig.rider.jump(olliePower());
          airEntryYaw = rig.char.root.rotation.y;
          air.launch();
          SoundKit.play('whoosh', { pitch: 1.2, volume: 0.35 });
        } else if (g && !rig.rider.grounded) {
          // mid-air: real rotation physics + combo chain entry
          airTrick(ctx, g.id, g.label, g.family, TRICKS[g.trickKey].pts, g.difficulty);
        } else if (g && rig.rider.grounded) {
          // SCORECARD FEEL (2026-09-15): a flip asked for with the wheels down answered with nothing but whatever clip
          // happened to be playing — 47 % of skate's answered presses carried no sound or pop, the thinnest FEEL row on
          // the card. A flip is an AIR trick, and that rule is worth one line and a tick.
          refuse(ctx, `${g.label} — POP FIRST`);
        }
        if (!flick.heldGrab && air.state.grabHeld) {
          trickLayer?.release();
          const pts = air.releaseGrab();
          if (pts > 0) combo.add('GRAB', pts, 'air');
        }
      }
      if (e.t === 'trigger' && e.side === 'R') {
        // the crouch is a real action with a real payoff (it scales the pop), and it used to be heard as nothing at all
        if (e.value > 0 && pump <= 0) { crouchAt = performance.now(); SoundKit.play('uiTick', { pitch: 0.65, volume: 0.3 }); ctx.feel?.impact?.(0.06); }
        if (e.value < pump) {
          // VENICE-SKATE-THPS: CROUCH SCALES POP on a keyboard too. Space emits `trigger 0.01` down and `trigger 0` up
          // (InputBus), so every keyboard ollie charged 0.01 and popped at the floor of the curve — the pop was the
          // same height however long you held it. A sentinel-sized value means the crouch was a HOLD: read its length.
          const held = crouchAt > 0 ? Math.min(1, (performance.now() - crouchAt) / 520) : 0;
          pumpReleased = pump <= 0.02 ? Math.max(pump, held) : pump;
          pumpReleasedAt = performance.now();
        }
        pump = e.value;
      }
      if (e.t === 'button' && e.pressed) {
        // ANIM-RESIDUAL (2026-09-14): the press that POPS is spent on the pop. `rider.jump()` clears `grounded` inside this
        // handler, so the air-trick branch below used to read the SAME press as a mid-air trick — with the stick held
        // forward to push, that was NOSE MANUAL (a ground link), a nose grab held for the whole flight, and the body frozen
        // in board_grab around a deck parked at the root: the eye's "midair melt/detach" and "false NOSE MANUAL" frames.
        let popped = false;
        // WALL RIDES + LIP TRICKS: the grind button at a lip is a stall, in the air against a wall a ride; POP on the wall is the plant
        if (e.btn === 'X' && !wallRide && !lipStall && !grindCh && !manualCh && tryLipStall(ctx)) return;
        if (e.btn === 'X' && !wallRide && !lipStall && !grindCh) { if (tryWallRide(ctx)) return; wallAskedAt = performance.now(); }
        if (e.btn === 'A' && wallRide) { wallplant(ctx); return; }
        if (e.btn === 'A' && lipStall) { dropIn(ctx); return; }
        if (e.btn === 'X' && rig.rider.grounded && !grindCh && !manualCh) {
          if (move.push()) SoundKit.play('whoosh', { pitch: 0.9, volume: 0.3 });   // the push beat is move.stroking (below)
        }
        if (e.btn === 'A') {
          if (rig.rider.grounded) {
            rig.rider.jump(olliePower());
            airEntryYaw = rig.char.root.rotation.y;
            air.launch();
            popBeatT = POP_BEAT_SEC;   // VENICE-SKATE-THPS: the pop is a BODY beat now (plant -> pop -> hang)
            apexDone = false; lastVy = rig.rider.vel.y;
            popped = true;
            SoundKit.play('whoosh', { pitch: 1.3, volume: 0.4 });
          }
          // VENICE-SKATE-THPS: the press only ASKS for the rail — it never catches one itself. A raw `tryGrind` here
          // skipped every qualification the magnet applies, so a press over a rail's last centimetre locked and
          // dismounted on the same frame (measured: two 0.00 s "GRIND!" beats in one run, each paying a full bonus).
          // The ask widens the magnet's own window for a moment instead, and one handler pays the lock.
          else grindAskedAt = performance.now();
        }
        // The face buttons are not a SECOND trick system -- they are the same
        // one. These called TrickMachine, whose points accumulate in a score
        // this mode never reads (finalScore is combo.banked + combo.pot +
        // coins) and whose update() is never even called here, so its state
        // machine never advanced. A right-stick flick was therefore the only
        // way to score anything, and neither the keyboard nor the touch
        // overlay has a right stick -- skate was unscoreable for every player
        // not holding a gamepad. Route them through the same air chain the
        // flick path uses, so the landing grades and banks them.
        if (!rig.rider.grounded && !popped) {
          // THE NAMED VOCABULARY. Three buttons used to mean three fixed tricks; now the HELD DIRECTION picks which
          // trick a button throws — the dunk's own grammar (DunkSystem.runwayTrickFor reads dir+btn the same way) — so
          // fifteen skate tricks are reachable from the same three buttons instead of three.
          //
          // And the AIR BUDGET decides what is legal: a 360 flip off a kerb used to be thrown, fail to rotate and get
          // graded as a bail the player did not cause. airTrickFor() asks for the hardest version this air can hold,
          // so the budget is the skill rather than a trap.
          const held = heldTrickDir(stickX, stickY);   // shared, so every board discipline reads a held stick alike
          // AirControl tracks the airtime ALREADY SPENT, so what is left is the pop's budget minus that. No Rider API
          // exposes a remaining-air figure, and inventing one would have been a silent `undefined`.
          const air01 = Math.max(0.25, AIR_BUDGET_SEC - air.state.airtime);
          // air tricks only (ANIM-RESIDUAL): the whole-list search handed a mid-air press the NOSE MANUAL and the slides
          const fits = airTrickFor('skate', held, e.btn as BoardTrick['btn'], air01);
          if (fits) {
            airTrick(ctx, fits.id, fits.label, fits.grab !== 'none' ? 'grab' : fits.flipDeg !== 0 ? 'flip' : 'spin',
              trickPts(fits), Math.max(1, Math.round(fits.difficulty)));
          } else if (e.btn === 'X') {
            // X is the GRAB hold in the air (its release banks it, below). Skate has no named X air, and the whole-list
            // search used to label the hold with a rail slide — "BOARDSLIDE" over open air. Name it what it is.
            airTrick(ctx, 'grab', TRICKS.grab.name, 'grab', TRICKS.grab.pts, 1);
          }
        }
      }
      // releasing GRAB banks the hold, exactly as the flick path does
      if (e.t === 'button' && !e.pressed && e.btn === 'X' && air.state.grabHeld) {
        trickLayer?.release();
        const pts = air.releaseGrab();
        if (pts > 0) combo.add('GRAB', pts, 'air');
      }
    },

    update(ctx: ModeContext, dtRaw: number) {
      if (ended) return;
      // H4: the spectacle beat slows the WHOLE mode — the board, the air, the clips, the camera — for a third of a
      // second. The run clock is not part of the beat: a slow-mo must never buy the player time.
      slowCool = Math.max(0, slowCool - dtRaw);
      if (slowT > 0) slowT = Math.max(0, slowT - dtRaw);
      const dt = slowT > 0 ? dtRaw * SLOW_SCALE : dtRaw;
      trickLayer?.begin();   // TRICK POSE: take back last frame's trick offsets before this frame's writes
      timeLeft -= dtRaw;
      if (timeLeft <= 0) {
        ended = true;
        SoundKit.play('whistle');
        // THE BUZZER DOES NOT PAY FOR A COMBO YOU NEVER LANDED (2026-09-12 mechanic pass).
        // This totalled `combo.banked + combo.pot`, and pot is the LIVE chain — so a run that
        // ended mid-air paid out in full, and the optimal play was to throw the biggest
        // possible chain as the clock died and simply never land it. That directly contradicts
        // this mode's own rule, stated at the banking block below: you bank by landing and
        // rolling away clean.
        // The generous half is kept: a rider who IS down and clean at the buzzer is in the
        // settle window and would have banked a moment later, so bank them now. Anyone still
        // in the air, on a rail or in a manual loses the pot, exactly as a bail would.
        if (combo.active && rig.rider.grounded && !grindCh && !manualCh && !air.state.airborne) combo.bank();
        const finalScore = combo.banked + coins.collected * 5;
        return ctx.end('RUN_COMPLETE', finalScore, { runSec: RUN_SEC, coinsCollected: coins.collected, bestCombo: combo.bestCombo });
      }
      const gained = coins.update(dt, rig.char.root.position);
      if (gained > 0) {
        SoundKit.play('uiTick', { pitch: 1.4 });
        ctx.setHud({ coins: coins.collected });
        for (const g of goals.report({ type: 'collect', collectibleId: `c${coins.collected}` })) {
          bannerFlash(ctx, `GOAL: ${g.label}`, 1200);
          SoundKit.play('powerUp', { pitch: 1.3 });
        }
      }
      // gimmick: rail patrols; its grind line follows
      patrolRail.update(dt);
      crowd.update(dt);
      world.grindLines[world.grindLines.length - 1] = patrolRail.line;
      // ── balance channels (grind/manual) feed the combo ──
      if (grindCh?.active) {
        const r = grindCh.update(dt, stickX, move.speed01);
        // the fail-out: a slipped grind drops you off the rail AND holds the magnet off, so a rail you just fell from
        // does not immediately catch you again on the way down (VENICE-SKATE-THPS)
        if (r.slipped) { grindCh = null; rig.rider.dismount(); relockUntil = performance.now() + RELOCK_MS; console.info('[SKATE-GRIND] slipped off'); bannerFlash(ctx, 'SLIPPED OFF', 600); }
        else if (r.pts > 0) combo.accrue('GRIND', Math.round(r.pts), 'grind');   // ANTI-MASH: a held grind is ONE link that pays while it is held
      }
      // ── the manual link (VENICE-SKATE-THPS) ──
      // THE INPUT IS READ BEFORE THE BALANCE IS STEPPED. With the channel updated first, a revert flick that lands on
      // the same frame the needle finally tips is scored as a SLIP: the player sees "LOST THE MANUAL", the combo bails,
      // and the trick they actually performed is the one thing that does not happen (measured once in a 45 s run).
      // A flick pair while already in one is the way OUT: the rider sets the nose down and the link banks with the
      // combo. Rolling too slowly to balance on two wheels ends it too — a manual is a moving trick.
      if (manualWanted) {
        const kind = manualWanted; manualWanted = null;
        if (manualCh?.active) {
          manualCh.stop(); manualCh = null;
          bannerFlash(ctx, 'REVERT', 450);
          console.info('[SKATE-MANUAL] out');
        } else if (rig.rider.grounded && !grindCh && move.speed01 > 0.08) {
          manualCh = new BalanceChannel(kind, move.balance);
          manualCh.start(move.speed01);
          bannerFlash(ctx, kind === 'manual' ? 'MANUAL' : 'NOSE MANUAL', 600);
          SoundKit.play('uiTick', { pitch: 1.2, volume: 0.35 });
          console.info(`[SKATE-MANUAL] ${kind}`);
        } else {
          // WHY IT DID NOT START, every time. This branch used to fall through in silence, so a manual that was
          // refused for being too slow, in the air, or already grinding was indistinguishable from an input the
          // mode never received — which is exactly what "the manual doesn't trigger reliably" feels like from
          // the deck. Three gates, three answers.
          refuse(ctx, !rig.rider.grounded ? 'NOT ON THE GROUND'
            : grindCh ? 'ALREADY GRINDING'
            : 'TOO SLOW TO MANUAL');
          console.info('[SKATE-MANUAL] refused', {
            grounded: rig.rider.grounded, grinding: !!grindCh, speed01: Number(move.speed01.toFixed(3)),
          });
        }
      }
      if (manualCh?.active) {
        const r = manualCh.update(dt, stickX, move.speed01);
        ctx.setHud({ balance: Math.round(manualCh.needle * 100) });   // the needle a manual rides — drawn as a meter, read by a player
        if (r.slipped) { manualCh = null; console.info('[SKATE-MANUAL] lost it'); combo.bail(); bannerFlash(ctx, 'LOST THE MANUAL', 600); }
        else if (r.pts > 0) combo.accrue('MANUAL', Math.round(r.pts), 'manual');   // ANTI-MASH: one link, not one per frame
      }
      if (manualCh?.active && (!rig.rider.grounded || move.speed01 < 0.05)) {
        manualCh.stop(); manualCh = null; console.info('[SKATE-MANUAL] out (rolled out)');
      }

      // ── revert: stick snap on transition landing flows into a manual ──
      if (rig.rider.grounded && !grindCh && !manualCh && air.state.airtime > 0.25) {
        const rev = tryRevert(Math.abs(stickX) > 0.8, move.balance.instability > 0.2 || rig.char.root.position.y > 0.4, pump - 0.5);
        if (rev) {
          // this door is the LANDING one — a stick snapped on a transition rolls the landing into a manual. It used to
          // open silently under a banner that only said "REVERT!", so a run that entered a manual this way showed no
          // manual anywhere: no label, no console line, and (before this tip) the ride idle under it (VENICE-SKATE-THPS).
          manualCh = new BalanceChannel(rev, move.balance);
          manualCh.start(move.speed01);
          bannerFlash(ctx, rev === 'manual' ? 'REVERT → MANUAL' : 'REVERT → NOSE MANUAL', 600);
          console.info(`[SKATE-MANUAL] revert into ${rev}`);
        }
      }

      // ── air physics + landing truth ──
      // SKATE-MOVE: the spin the judge integrates (air.state.rotation.y) IS the spin the body shows — the old 0.3× nudge
      // here was overwritten by the yaw write below every frame, so no spin ever showed. The pump is no longer fed in as
      // a pitch nudge: holding the throttle through an ollie was tilting the flip axis into a sketchy landing.
      coyote.update(rig.rider.grounded);   // one feed per frame, from the flag the ollie test reads
      if (!rig.rider.grounded && air.state.airborne) air.update(dt, stickX, 0);
      if (rig.rider.grounded && air.state.airborne && air.state.airtime > 0.15) {
        // touchdown: grade the landing
        const res = resolveLanding(air, move.balance, {
          error01: air.landingError01(), slopeMismatch01: 0, speed01: move.speed01,
        });
        const chainPts = res.chain.reduce((sum, t) => sum + t.basePts, 0);
        bailLatch = false;                       // A+ P0: a fresh touchdown gets one bail punch at most
        console.info(`[SKATE-LAND] touchdown ${res.grade} (${res.chain.length} tricks)`);   // A+ P0 probe: the punch counts are checked against this
        if (res.grade === 'clean') {
          if (chainPts > 0) combo.add(res.chain.map((t) => t.label).join(' → '), chainPts, 'air');
          boost.earn('landingClean'); if (res.chain.length) boost.earn(res.chain.length >= 2 ? 'trickBig' : 'trickSmall');
          lastLanding = 'clean'; landingBeatT = 0.35;
          SoundKit.play('uiTick', { pitch: 1.4, volume: 0.4 });
          ctx.feel?.impact?.(0.25);
          landPunch(ctx, res.chain.length);   // A+ P0: soft shake (+ a short flash on a long chain); no hit-stop on every ollie
          if (res.chain.length >= 2) spectacle(ctx, `landed ${res.chain.length}-trick chain`);   // H4: the beat is the CHAIN, not the ollie
        } else if (res.grade === 'sketchy') {
          if (chainPts > 0) combo.add('SKETCHY ' + res.chain.map((t) => t.label).join('+'), Math.round(chainPts * SKETCHY_SCORE_MULT), 'air');
          save = res.save; lastLanding = 'sketchy'; landingBeatT = 0.5;
          bannerFlash(ctx, 'SKETCHY — SAVE IT!', 800);
        } else {
          combo.bail();
          mbus.report({ kind: 'miss' });
          lastLanding = 'none';
          bannerFlash(ctx, 'BAILED', 900);
          SoundKit.play('miss');
          bailBeatT = BAIL_BEAT_SEC;   // the tree plays skate_bail and holds it
          move.vel.scaleInPlace(0.15);   // SKATE-MOVE: a fallen rider does not keep sliding at speed
          bailPunch(ctx);   // A+ P0: hit-stop + shake + ONE low thud + dust (replaces feel.impact(0.7), whose thud would double)
        }
        // SWITCH STANCE. BoardMovement.switchStance() existed, applied its 0.92
        // carve tax and its 180-degree flip at the bottom of this update -- and
        // NOTHING in the game ever called it, so switch riding was built and
        // unreachable. The concept lock filed that as a Phase 5 control-schema
        // slot; it does not need one. In Skate 3 you do not press a button to
        // ride switch, you land a half-rotation and find yourself in it. Count
        // the half-turns taken in the air: an odd number puts you switch, an
        // even one (a clean 360) returns you to the stance you left with.
        if (landsSwitch(airEntryYaw, rig.char.root.rotation.y)) {
          move.switchStance();
          bannerFlash(ctx, move.stance === 'switch' ? 'SWITCH' : 'REGULAR', 700);
        }
        // SKATE-MOVE: land where the spin left you. The half turns became the stance above; the residual off the nearest
        // half turn folds into the heading and the board rolls on the way it points (the THPS rule) — the facing is
        // continuous through touchdown instead of snapping back to the take-off heading (a 73° one-frame snap measured).
        const spin = air.state.rotation.y;
        const residual = spin - Math.round(spin / Math.PI) * Math.PI;
        move.yaw += residual;
        const sp = move.speed; move.vel.set(Math.sin(move.yaw) * sp, 0, Math.cos(move.yaw) * sp);
        air.land();
      }

      // sketchy save window input
      if (save?.active) {
        save.update(dt, stickX);
        // A MECHANIC YOU CAN READ (2026-09-15). The save asks you to counter a wobble that was drawn NOWHERE: no meter, no
        // arrow, nothing but the word SKETCHY — so the only way to pass it was to guess, and a random stick passed it as
        // often as a read did. The side to lean is SAID, and it updates as the wobble crosses over.
        const lean: 'LEFT' | 'RIGHT' = save.wobble > 0 ? 'LEFT' : 'RIGHT';
        if (lean !== saveLean) { saveLean = lean; ctx.setHud({ saveDir: lean }); ctx.juice.callout(lean === 'LEFT' ? 'LEAN ◀' : 'LEAN ▶', '#fde047', 320); }
        if (save.saved) { bannerFlash(ctx, 'SAVED IT!', 700); mbus.report({ kind: 'big_make' }); save = null; saveLean = null; ctx.setHud({ saveDir: '' }); }
        else if (save.failed) { console.info('[SKATE-LAND] save failed'); combo.bail(); bannerFlash(ctx, 'BAILED', 900); bailBeatT = BAIL_BEAT_SEC; move.vel.scaleInPlace(0.15); bailPunch(ctx); save = null; saveLean = null; ctx.setHud({ saveDir: '' }); }   // A+ P0: the failed save is a bail too
      }

      // grind catch: airborne near a rail
      if (!rig.rider.grounded && !air.state.airborne) { /* falling without air state (rolled off an edge) */ airEntryYaw = rig.char.root.rotation.y; air.launch(); }
      // ── THE RAIL MAGNET (H3, VENICE-SKATE-THPS) ──
      // The rail never locked. `tryGrind`'s 1.1 m sphere is measured from the ROOT — the rider's FEET — so a bar 0.5 m
      // off the deck spends half of it on height before the run even starts, and what is left is a sub-metre horizontal
      // window to thread at 8 m/s, on the ONE frame a button is pressed. The eye's verdict, "Y / i toward the golden
      // patrol rail, no lock, no console line, goal 0/4", is exactly what that geometry produces.
      // THPS does not ask for the button: ride over a rail and the board finds it. So does this — a 2 m magnet, but
      // only while FALLING onto the rail and only when the run actually points down it (|cos| > 0.34), so crossing a
      // rail sideways still crosses it. The press keeps its longer reach for the player who asks early.
      const asked = performance.now() - grindAskedAt < GRIND_ASK_MS;   // POP held toward a rail: reach further, forgive the line
      if (!rig.rider.grounded && !rig.rider.grinding && !wallRide && !lipStall && rig.rider.vel.y <= 0.6 && performance.now() >= relockUntil) {   // WALL RIDES: no rail while on a wall or a lip
        const reach = asked ? GRIND_REACH : GRIND_MAGNET;
        const caught = pickRail(world.grindLines, rig.char.root.position, move.vel,
          { reach, align: asked ? GRIND_ALIGN * 0.6 : GRIND_ALIGN });
        if (caught) rig.rider.tryGrind([caught], reach);
      }
      if (rig.rider.grinding && !grindCh) {
        // ONE lock handler: the magnet and the button pay the same rail the same way, and the goal ticks HERE — it used
        // to wait on a per-frame proximity test that a 0.6 s lock could miss entirely.
        const line = rig.rider.grinding;
        const patrol = line.gapId === patrolRail.gapId;
        grindAskedAt = -1;
        grindCh = new BalanceChannel('grind', move.balance);
        grindCh.start(move.speed01);
        combo.add(line.bonus >= 260 ? 'TRANSFER GRIND' : 'GRIND', line.bonus, 'grind');
        bannerFlash(ctx, line.bonus >= 260 ? `TRANSFER GRIND +${line.bonus}` : 'GRIND!', 700);
        SoundKit.play('powerUp', { volume: 0.4, pitch: line.bonus >= 260 ? 1.3 : 1 });
        ctx.feel?.impact?.(0.3);
        console.info(`[SKATE-GRIND] locked +${line.bonus}${patrol ? ' (patrol rail)' : ''}`);
        if (line.bonus >= 260) spectacle(ctx, 'grind lock');
        // P8: report whatever rail was caught, not only the patrol one. Every GrindLine already carried a gapId
        // field and only the moving rail's was ever read, so the plaza's hubba, flat bar and wallride lip were
        // ungoalable by omission rather than by design.
        if (line.gapId) {
          for (const g of goals.report({ type: 'gap', gapId: line.gapId })) {
            bannerFlash(ctx, `GAP: ${g.label}`, 1200);
            SoundKit.play('crowdCheer', { volume: 0.6 });
            crowd.cheer(1);
          }
        }
      }
      if (!rig.rider.grinding && grindCh) { console.info(`[SKATE-GRIND] off after ${grindCh.heldSec.toFixed(2)}s`); grindCh = null; relockUntil = performance.now() + RELOCK_MS; }

      // ── movement: shared momentum economy drives the rider ──
      // SKATE-MOVE: the L stick's forward axis is the push (hold → cooldown-paced strokes up to cruise, then roll), back
      // is the foot drag; both only with wheels down. In the air the board is ballistic — no steer bends the velocity,
      // the judged spin turns the body. A bail holds every input for its beat.
      const grounded = rig.rider.grounded, bailing = bailBeatT > 0;
      let drive = grounded && !bailing && !rig.rider.grinding && !manualCh?.active ? -stickY : 0;   // no kick from inside a manual
      if (drive < 0 && performance.now() < brakeMuteUntil) drive = 0;   // the manual link's own back-tap must not drag the line to a stop
      const steer = grounded && !bailing ? stickX : 0;
      const bev = boost.update(dt, boostHeld, grounded && !bailing);
      ctx.stamina?.(boost.meter);   // PLAYER RING: the ring's arc is the boost tank
      move.boostK = boost.k;
      if (rig.rider.grinding) boost.earnOver('grindPerSec', dt);
      boostPads?.update(dt, rig.char.root.position, boost);
      boostFx?.update(dt, boost, bev);
      if (bev.started) { SoundKit.play('whoosh', { pitch: 1.1, volume: 0.4 }); }
      if (bev.full) bannerFlash(ctx, 'BOOST READY', 700);
      const v = move.update(dt, steer, pump, ctx.scene, rig.char.root.position, world.ground, drive);
      // ── THE NaN TRAP (VENICE-SKATE-THPS, 2026-09-09) ──
      // A run that goes non-finite never comes back on its own: every frame after it multiplies NaN into the position,
      // the heading, the camera target and the rig's bones, so the park vanishes and the rider is gone — which is what
      // the arena eye photographed as a hero "detached, floating, upside down". Measured on the baseline probe: 646 of
      // 1887 recorded frames had a NaN position, i.e. the last third of the run was already dead.
      // One frame of NaN is now survivable: the run is put back where it was last real, the trap says what the frame
      // looked like, and the player keeps skating.
      const pos = rig.char.root.position;
      if (!Number.isFinite(v.x) || !Number.isFinite(v.z) || !Number.isFinite(move.yaw)
        || !Number.isFinite(pos.x) || !Number.isFinite(pos.y) || !Number.isFinite(pos.z)) {
        if (nanReports < 3) {
          nanReports++;
          console.error('[SKATE-NAN] ' + JSON.stringify({
            dt: +dt.toFixed(4), stickX, stickY, pump, drive, steer, vx: v.x, vz: v.z,
            yaw: move.yaw, speed: move.speed, px: pos.x, py: pos.y, pz: pos.z,
            grounded, grinding: rig.rider.grinding !== null, airtime: +air.state.airtime.toFixed(2),
            spin: air.state.rotation.y, angVel: air.state.angularVel.y, slow: +slowT.toFixed(2),
          }));
        }
        move.vel.setAll(0);
        if (!Number.isFinite(move.yaw)) move.yaw = lastGoodYaw;
        rig.rider.vel.setAll(0);
        if (lastGoodPos) pos.copyFrom(lastGoodPos); else pos.set(0, 0, -16);
      } else if (grounded) { lastGoodPos = (lastGoodPos ?? new Vector3()).copyFrom(pos); lastGoodYaw = move.yaw; }
      rig.rider.vel.x = v.x; rig.rider.vel.z = v.z;
      rig.rider.update(dt, steer, 0);              // GroundRide owns snap/air/grind-line
      if (rig.rider.grinding) {
        // the rail owns the yaw; the momentum model follows it so the dismount rolls away DOWN the rail, not back
        // toward the pre-grind heading (a 1-frame yaw snap on every rail exit)
        move.yaw = rig.char.root.rotation.y;
        const sp = move.speed; move.vel.set(Math.sin(move.yaw) * sp, 0, Math.cos(move.yaw) * sp);
      } else {
        // air.state alone (not rider.grounded): the frame the wheels touch, the landing block above has not run yet —
        // reading grounded here dropped the spin one frame before the fold put it back (a −65° / +67° two-frame flip)
        const rawSpin = air.state.airborne ? air.state.rotation.y : 0;
        const airSpin = Number.isFinite(rawSpin) ? rawSpin : 0;   // a NaN spin used to be written onto the root's yaw
        rig.char.root.rotation.y = move.yaw + airSpin + (move.stance === 'switch' ? Math.PI : 0);
      }
      pushing = move.stroking;
      tickWalls(ctx, dt);   // WALL RIDES + LIP TRICKS: a wall or a lip owns the body while the moment lasts
      if (rig.rider.grounded) lastGroundY = rig.char.root.position.y;
      // the deck rides its back trucks through a manual — nose up, and it eases in and out so the link reads as a beat
      const wantPitch = manualCh?.active ? (manualCh.kind === 'nosemanual' ? 0.30 : -0.30) : 0;
      boardPitch += (wantPitch - boardPitch) * Math.min(1, 9 * dt);
      // ANIM-RESIDUAL: the deck under the feet. Read off the last rendered frame (the root's and the feet's world matrices
      // are from the same frame, so the root-local midpoint is consistent); the ground reading is the stance's own.
      {
        const feetNow = feetMidLocal();
        const airborneBody = !rig.rider.grounded && bailBeatT <= 0;
        if (feetNow && rig.rider.grounded && bailBeatT <= 0 && !rig.rider.grinding && !manualCh?.active) {
          if (!feetGround) feetGround = { ...feetNow };
          else { const k = Math.min(1, 4 * dt); feetGround.x += (feetNow.x - feetGround.x) * k; feetGround.y += (feetNow.y - feetGround.y) * k; feetGround.z += (feetNow.z - feetGround.z) * k; }
        }
        const want = feetNow && feetGround ? deckUnderFeet(feetNow, feetGround, airborneBody) : { x: 0, y: 0, z: 0 };
        const k = Math.min(1, 14 * dt);
        deckLift.x += (want.x - deckLift.x) * k; deckLift.y += (want.y - deckLift.y) * k; deckLift.z += (want.z - deckLift.z) * k;
      }
      boardSync.update(move.balance.lean, !rig.rider.grounded, boardPitch, deckLift);
      trickLayer?.apply(dt, air.state.airborne && !rig.rider.grounded);   // TRICK POSE: the deck's flip / shuv / grab tweak
      // the AIR CAM: up, back and round to three-quarters while a real air is on (not a kerb flicker), so the trick under
      // the rider is in the picture
      ctx.camDirector.setAir(air.state.airborne && air.state.airtime > 0.12 ? 1 : 0);
      // the harness cools the shared meter on real time now -- a second update() here decayed it twice as fast

      // ── the spectacle beats (H4) ──
      // The APEX of a real air: rising turns to falling, more than a third of a second up, and high enough off the deck
      // that it is a gap or a lip rather than a kerb hop. One per air, and never inside the cooldown.
      if (!rig.rider.grounded && air.state.airborne) {
        const height = rig.char.root.position.y - groundUnder();
        if (!apexDone && lastVy > 0 && rig.rider.vel.y <= 0 && air.state.airtime > 0.32 && height > 1.15) {
          apexDone = true;
          spectacle(ctx, `big air ${height.toFixed(1)}m`);
        }
        lastVy = rig.rider.vel.y;
      } else { apexDone = false; lastVy = 0; }
      if (popBeatT > 0) { popBeatT -= dt; if (popBeatT <= 0) animTree.clearBeat('ollie'); }

      // ── animation tree ──
      // BIOMECH-WAVE2: one object, two consumers — the tree picks the clip, the posture layer picks the body under it,
      // so the clip and the chest can never disagree about which window the rider is in.
      bio.speed01 = move.speed01; bio.pushing = pushing; bio.lean = move.balance.lean;
      bio.airborne = !rig.rider.grounded || (air.state.airborne && air.state.airtime > 0.15);
      bio.grabHeld = !!air.state.grabHeld;
      bio.flipping = Math.abs(air.state.angularVel.z) > 1; bio.spinning = Math.abs(air.state.angularVel.y) > 1;
      bio.grinding = rig.rider.grinding !== null; bio.manual = manualCh?.active ?? false;
      bio.landing = landingBeatT > 0 && lastLanding !== 'none'; bio.bailing = bailBeatT > 0; bio.tucking = false;
      // G6: the roll comes off the SAME lean the clip does, scaled by speed — the stick-fed 16° that banked a parked
      // rider (and left a carving one upright) is layered over here, the way the yaw already is
      if (!bio.airborne && !bio.bailing) {
        const want = boardBank(move.balance.lean, move.speed01);
        rig.char.root.rotation.z += (want - rig.char.root.rotation.z) * Math.min(1, 10 * dt);
      }
      animTree.update({
        speed01: move.speed01, pushing, lean: move.balance.lean,
        // the touchdown is graded one frame AFTER the rider re-grounds (rider.update runs after the grading block), so
        // the tree stays in the air pose through that frame instead of flashing the ride idle between tuck and land
        airborne: !rig.rider.grounded || (air.state.airborne && air.state.airtime > 0.15), grabHeld: !!air.state.grabHeld,
        flipping: Math.abs(air.state.angularVel.z) > 1, spinning: Math.abs(air.state.angularVel.y) > 1,
        grinding: rig.rider.grinding !== null, manual: manualCh?.active ?? false,
        landing: landingBeatT > 0 ? lastLanding : 'none', bailing: bailBeatT > 0,
        popping: popBeatT > 0,
      });
      if (landingBeatT > 0) { landingBeatT -= dt; if (landingBeatT <= 0) animTree.clearBeat('land_clean', 'land_sketchy'); }
      if (bailBeatT > 0) { bailBeatT -= dt; if (bailBeatT <= 0) animTree.clearBeat('bail'); }

      // goals: combo completion + banking feed the tracker
      if (!combo.active && combo.banked > 0) {
        for (const g of goals.report({ type: 'bank', value: combo.banked })) {
          bannerFlash(ctx, `GOAL: ${g.label}`, 1200);
          SoundKit.play('powerUp', { pitch: 1.3 });
          crowd.cheer(1);
          mbus.report({ kind: 'big_make' });
        }
      }
      // Name the goals, do not just count them. The tracker banners a goal as
      // it falls and the bezel showed "GOALS 0/4", so a player was chasing four
      // objectives nobody had told them about. THPS puts the list on screen;
      // this publishes it with each one's done state so the host can too.
      ctx.setHud({
        goals: `${goals.doneCount}/${SKATE_GOALS.length}`,
        goalList: goals.goals.map((g) => `${g.done ? '✓' : '○'} ${g.label}`).join(' · '),
      });

      // ── banking: the rule this mode never had ──
      // combo.bank() was called NOWHERE in this file -- only bail(). The pot
      // therefore grew for the entire run and nothing but a bail could clear
      // it, so `score` (which publishes combo.banked) sat at 0 from start to
      // finish, and the goal tracker, which waits on
      // (!combo.active && combo.banked > 0), could never fire either. That is
      // the whole reason a 90-second run ended 0 / 0 goals / 0 momentum.
      // Skate 3's rule: you bank by landing and rolling away clean. The short
      // settle window first gives the revert a chance to link the combo into a
      // manual, which is the entire point of having a revert.
      if (combo.active && rig.rider.grounded && !grindCh && !manualCh && !air.state.airborne) {
        settleT += dt;
        if (settleT >= BANK_SETTLE_SEC) {
          const banked = combo.bank();
          if (banked > 0) {
            // Phase 7: the big moment has to SOUND different from a routine one.
            // A pitch-shifted copy of the routine cue is still the routine cue,
            // so the big line gets its own sample, its own banner, a camera
            // pulse and a heavier haptic -- landing a run-defining combo should
            // not be a slightly higher beep than landing a kickflip.
            const big = banked >= BIG_BANK_PTS;
            bannerFlash(ctx, big ? `HUGE! +${banked}` : `BANKED +${banked}`, big ? 1000 : 700);
            SoundKit.play('powerUp', { volume: 0.5, pitch: big ? 1.3 : 1 });
            if (big) {
              SoundKit.play('score', { volume: 0.55, pitch: 1.1 });
              crowd.cheer(Math.min(1, banked / 1200));   // L4: they REACT, or they are set dressing
              ctx.camDirector.pulse(0.5, 0.5);
              ctx.feel?.impact?.(0.5);
            }
            // Every bank feeds the momentum bus, weighted by what it was
            // worth. Reporting only the 500+ banks left the meter reading a
            // flat 0 through a whole scoring run, which tells the player
            // nothing about how their line is going.
            mbus.report({ kind: 'big_make', weight: Math.max(3, Math.min(25, banked / 40)) });
            // THE GOAL SAYS "LAND", SO IT IS SCORED ON THE LANDING (2026-09-12 mechanic pass).
            // It used to be tested every frame against combo.pot — the LIVE, unlanded pot — so
            // it credited the instant an in-progress chain crossed 800, mid-air, and a bail on
            // the very next frame kept the goal anyway. That deletes the only tension skating
            // has: a pot is worth nothing until you roll away from it. Scored off `banked`, the
            // value bank() actually returns, so the label and the rule finally agree.
            for (const g of goals.report({ type: 'comboLanded', value: banked })) {
              bannerFlash(ctx, `GOAL: ${g.label}`, 1200);
              SoundKit.play('crowdCheer', { volume: 0.6 });
            }
          }
          settleT = 0;
        }
      } else settleT = 0;

      // combo HUD
      const hud = combo.hud;
      ctx.setHud({ combo: hud.combo, pot: hud.pot, score: hud.banked, momentum: Math.round(mbus.score01 * 100), ...boost.hud() });
      // THE FENCE HAS TO TAKE YOUR SPEED. This clamped the POSITION and left the velocity alone, so a rider who rode
      // into the boundary was pinned there while the movement model still reported 6-8 m/s — measured: position frozen
      // at z 33 from t8s to the end of a 60 s run, speed never below 6.1. The board kept rolling, the push kept
      // working, the world stopped moving, and nothing told the player why. A wall you cannot feel is worse than a
      // wall you can see.
      const beforeX = rig.char.root.position.x, beforeZ = rig.char.root.position.z;
      rig.char.root.position.x = Math.max(-world.bound, Math.min(world.bound, rig.char.root.position.x));
      rig.char.root.position.z = Math.max(-world.bound, Math.min(world.bound, rig.char.root.position.z));
      const hitX = rig.char.root.position.x !== beforeX, hitZ = rig.char.root.position.z !== beforeZ;
      if (hitX || hitZ) {
        // THE FENCE TURNS THE BOARD (WALLS + SPEED, 2026-09-15). Zeroing only the speed into the fence still pinned the
        // rider: the board stayed pointed at it, the momentum model re-aimed the speed into it every frame and the rider
        // bled to a stop against the edge (measured: 0.03 m in 1.5 s, holding forward). BoardMovement.wall swings the
        // nose along the fence on a glancing hit and bounces it back off on a head-on one; the root follows the heading.
        const nx = hitX ? -Math.sign(rig.char.root.position.x) : 0, nz = hitZ ? -Math.sign(rig.char.root.position.z) : 0;
        const kind = move.wall(nx, nz);
        if (!rig.rider.grinding && rig.rider.grounded) rig.char.root.rotation.y = move.yaw + (move.stance === 'switch' ? Math.PI : 0);
        rig.rider.vel.x = move.vel.x; rig.rider.vel.z = move.vel.z;
        if (!fenceHit && kind) {
          fenceHit = true;
          SoundKit.play('impact', { pitch: kind === 'bounce' ? 0.8 : 1.1, volume: kind === 'bounce' ? 0.4 : 0.22 });
          ctx.feel?.impact?.(kind === 'bounce' ? 0.3 : 0.12);
          if (kind === 'bounce') bannerFlash(ctx, 'EDGE OF THE PARK', 700);
        }
      } else fenceHit = false;
      ctx.setHud({ time: Math.ceil(timeLeft) });
      // Snap once more on the first PLAYED frame. The load-time snapTo is
      // correct when it runs and stale by the time it matters: between load and
      // play the rider drops onto the park and starts rolling down it, so the
      // camera resumes several metres out of position and spends ~half a second
      // lerping in. A desktop FOV is wide enough to hold the rider through that;
      // a phone in portrait is not, which is why this only ever appeared in the
      // mobile playtest and never in any desktop capture.
      if (!snappedForPlay) { ctx.camDirector.snapTo(rig.char.root.position, aheadOfRider()); snappedForPlay = true; }
      ctx.camDirector.update(rig.char.root.position, rig.rider.vel, null);
      // SPEED YOU CANNOT SEE IS NOT SPEED. The lens widens toward top speed and eases back, normalised
      // against THIS mode's ceiling so flat-out feels the same in every discipline. Frame-independent:
      // see SpeedFov (a per-frame lerp settles 2.4x faster at 144 fps than at 60).
      baseFov ??= ctx.camera.fov;
      ctx.camera.fov = stepSpeedFov(ctx.camera.fov, baseFov * (boostFx?.fovMult(boost) ?? 1), Math.hypot(rig.rider.vel.x, rig.rider.vel.z), rig.rider.topSpeed, dt);
    },

    dispose() { trickLayer?.dispose(); trickLayer = null; boostFx?.dispose(); boostFx = null; boostPads?.dispose(); boostPads = null; posture?.dispose(); posture = null; propsGone = true; props?.dispose(); props = null; rig?.dispose(); world?.dispose(); coins?.dispose(); patrolRail?.dispose(); crowd?.dispose(); SoundKit.stopAmbient(); },
  };
})();
