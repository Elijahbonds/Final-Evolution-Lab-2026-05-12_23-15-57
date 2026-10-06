// precisionModes v5 — REPLACES the M43 file. The Phase 4 court-sports feel
// pass. Everything M43 shipped is kept (CLUTCH finals, SoundKit beds);
// three modes get their genre-standard mechanic (references are mechanics
// only — all-original implementations):
//   TENNIS — real RALLIES (motion-tennis feel): the far-side opponent now
//     actually returns the ball. Each exchange raises a rally multiplier;
//     your swing DIRECTION comes from the stick at contact, and stick
//     up/down at contact picks TOPSPIN (flat, fast, harder for the opponent
//     to reach) vs LOB (safe, slower, easier). Points bank when the
//     opponent finally can't get there — deep rallies pay multiplied.
//   GOLF — a broadcast HOLE PREVIEW (camera flies to the green and looks
//     back before every shot — you see what you're aiming at) + the classic
//     3-CLICK swing: click to start, click to set POWER on the rising wave,
//     click again in the ACCURACY band on the way down. Missing accuracy
//     hooks/slices the ball proportionally to the error.
//   PENALTY (soccer) — street-style FEINTS: snap the stick side-to-side
//     during aim (up to 2) to feint. Each feint makes the keeper guess
//     wrong more often and pays a style bonus on a goal, but each also adds
//     a little shot wobble. Commitment tradeoff, not a free win.
// Derby is unchanged from M43 apart from riding the same file.
// (IMPROVE 2026-10-06: the TENNIS described above was never the live one — the registry serves TennisMode.ts — and is
// deleted from this file; golf, derby and penalty are what it holds.)

import { kickPips, type KickResult } from '../core/penaltyHud';
import { freshDerby, bankSwing, distanceLine, OUTS_CAP, type DerbyTally } from '../core/derbyHud';
// IMPROVE (2026-10-06, docs/IMPROVEMENTS-2026-10-05.md § Derby): the derby's pure reads (seeded pitches, the rival's line
// and verdict, the timing window's cue and miss, the homer's real feet, the stick's aim, the bat-flip's window).
import { pitchShape, derbySeed, derbyProgress, rivalVerdict, rivalLine, timingMiss, timingMissLine, contactCue, homerFeet, hitLateral, batFlipRead } from '../core/DerbyLoop';
import { rivalProgress } from '../core/CarnivalNight';
import { holeName, cardString, windBearingDeg, windWord, holeBoard, ACCURACY_CENTER as GH_ACC_CENTER, ACCURACY_HALF as GH_ACC_HALF, type HoleResult } from '../core/golfHud';
import { Color3, DynamicTexture, Matrix, Mesh, MeshBuilder, PBRMaterial, Quaternion, StandardMaterial, Vector3 } from '@babylonjs/core';
import { dressBall } from '../visual/meshyProps';
import { boneNode } from '../anim/boneLookup';
import { planRivalKick, gradeDive, resolveSaveRead, type DiveSign, type KeeperCall, type RivalKickPlan } from '../core/KeeperCore';
// IMPROVE (2026-10-06, docs/IMPROVEMENTS-2026-10-05.md § Penalty): the shootout loop's pure reads — the classic-pens pick,
// the habit read said in the breakaway, the honest hint, the skippable result beat.
import { readPensStyle, writePensStyle, PENS_SWITCH_SEC, habitRead, breakawayReadProb, breakawayHint, CLASSIC_HINT, ResultBeat, type PensStyle } from '../core/PenaltyLoop';
import type { AbstractMesh, Material, Observer, ParticleSystem, Scene } from '@babylonjs/core';
import type { ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import type { SpawnedCharacter } from '../core/CharacterLibrary';
import { assertSpawned } from '../core/FrameGuard';
import {
  spawnAthlete, Reticle, PowerMeter, POWER_METER_RATE, Flight, swingQuality, swingSide,
  buildGolfGreen, buildPlateAndMound, buildGoal, buildBallparkOutfield, spawnFoe } from './aimSwingCore';
import { SPORT_CLIP } from '../anim/clipRegistry';
import { BeatOwner } from '../anim/beatOwner';
import { registerMirroredClips } from '../anim/mirrored-clips';
import { GOLF_CONTACT_SEC } from '../anim/authored/golf';
import { batLineAt, batRightSign, BAT_SWING_SEC, BAT_RECOVER_SEC } from '../anim/authored/baseball';
import { SoundKit } from '../audio/SoundKit';
import { refuse } from '../core/Refusal';   // MECHANICS PASS: a press that cannot act is answered
import { VenueKit } from '../visual/VenueKit';
import { mountVenue, type VenueHandle } from '../core/NexusVenue';
import { readPlaceLook } from '../nexus/placeLooks';
import { EffectsKit } from '../visual/EffectsKit';
import { Onlookers } from '../visual/Onlookers';
import { mountPostureLayer } from '../anim/PostureLayer';
import { fieldPose, batWindow, keeperWindow, strikerWindow } from '../core/FieldPosture';
import { keeperReadProb, rivalConverts, shootoutState, REGULATION_KICKS } from '../core/ShootoutCore';
import { PRECISION_CONFIG as CFG } from './modeConfigs';
// GOLF UPGRADE (owner, 2026-09-17: "the aim system need to be like wii sports. i need a directional arrow, a meter with
// lines to gauge power. upgrade physics, weather") — the arrow + landing ring (AimArrow), the meter's carry lines and the
// shot's launch (GolfAim), the flight itself (GolfBallSim: drag, Magnus, bounce, roll, wind through the air, wet turf),
// and the weather (WeatherKit read from the start screen's chip, WeatherFx for what it looks like).
import { GolfBallSim, greenBreakSlope, type Surface as GolfSurface } from '../core/GolfBall';
import { WII_CLUBS, WII_PUTTER, turnAim, launchVelocity, simulateShot, simulatePutt, puttLaunch, MeterTickJob, carryAt, type WiiClub, type AirLike } from '../core/GolfAim';
// IMPROVE (2026-10-06, docs/IMPROVEMENTS-2026-10-05.md § Golf): the loop's pure reads — the seeded course, the stick path,
// the rhythm decay, the OB drop, the timers / banner channel the mode clears on dispose, the meter HUD's change gate.
import { loopHole, loopSeed, loopWindAngle, LOOP_TEE, stickPathErr, rhythmAfter, obDrop, inBounds, rotateAbout, TimerBag, BannerChannel, MeterHudGate } from '../core/GolfLoop';
import { mountAimArrow, type AimArrowHandle } from '../visual/AimArrow';
import { WeatherKit } from '../core/WeatherKit';
import { readWeather } from '../nexus/weather';
import { mountWeatherFx, type WeatherFxHandle } from '../premium/WeatherFx';
// SOCCER UPGRADE (owner, 2026-09-18: "football, tennis and soccer upgrades next"): the penalty flies the real ball
// (SoccerBall: drag, Magnus, bounce) from a PES read — aim on the goal mouth, a power bar with ZONES (over the last one
// the ball clears the bar), a curled finesse shot and the chip on the stick, the frame as a thing the ball can hit.
import { SoccerBall, GRASS } from '../core/SoccerBall';
import { launchKick, frameHit, judgeKick, kickZone, METER_ZONES, GOAL as PEN_GOAL } from '../core/PenaltyKick';
import { WIND_GAIN } from '../core/GolfBall';
import { BREAK, FLOW, flowAdd, shotProfile, glassRead, bankTarget, rainbowRead, slideCancelRead, rainbowArc, KEEPER, keeperTargetZ, keeperSlideRead, reachFor, crossesKeeper, parryRead, strikeAim, keeperDiveX, type ShotKind } from '../core/Breakaway';   // BREAKAWAY (owner brief, 2026-09-18: "Soccer Shootout")
import { stepRun } from '../core/RushRun';
import { PAD, padMult, type PadKind, FLICK, flickRead, flickVel, type Ring, RINGS, ringsFor, ringPass, turbineFor, gustAt, BANK, bankReflect } from '../core/ParkourGolf';   // PARKOUR GOLF (owner brief, 2026-09-18)
import { PARK, TARGETS, predictWallCross, targetHit, robRead, verdictFor, flowTrick, kineticSwing, FLOW as PARK_FLOW, TOKEN, multiplierScramble, type Rob, type Verdict, type WallTarget, type WallCross } from '../core/ParkourDerby';   // PARKOUR DERBY (owner brief, 2026-09-18)

// ship pass 4: the mounted venue specs (golf_loop / derby / penalty), disposed with their modes
let golfVenue: VenueHandle | null = null, derbyVenue: VenueHandle | null = null, penaltyVenue: VenueHandle | null = null;

const CLUTCH_MULT = 1.5;

// ANIM-READABILITY (net / precision, 2026-09-07). Golf, derby and penalty each played clips from their event handlers with
// neverBindPose's chain settling them, and the ball left on the PRESS: the golf swing's held finish (hips turned 80°,
// hands high left) was crossfaded back into the address in 0.12 s the moment the clip ran out (0.28–0.38 m of hand travel
// per frame, 28 pops in four swings), the keeper's dive ran out 0.6 s after the press and the chain stood the keeper
// straight up while the ball was still in the air, the pitcher's ball was 8 m down the line before the arm came over,
// and the golfer's club came down on a ball already gone. Now each body has ONE owner (BeatOwner: a loop + beats, own
// onEnd, cut callbacks ignored), the swing settles into a held finish, the dive into a held stretch that rises through
// keeper_rise, the putt is a putt, the left dive is the registered mirror — and the ball leaves on each clip's CONTACT key.
/** Seconds into soccer_kick_shoot where the boot meets the ball (the strike-through key). */
const KICK_CONTACT_SEC = 0.45;
/** Seconds into baseball_pitch_over / _side where the ball leaves the hand (between the over-the-top key and the release). */
const PITCH_RELEASE_SEC = 0.52;

// ── GOLF: the three pillars the benchmark's own lock names ──────────────────
// "Club selection + shot timing + course reading". Shot timing was here and
// good; the other two did not exist, so every shot was the same shot at a
// different power percentage and there was nothing on the course to read.

/** Clubs set the DISTANCE BAND and the trajectory — the primary decision. */
export const GOLF_CLUBS: readonly WiiClub[] = WII_CLUBS;   // GOLF UPGRADE: the Wii-scaled bag (speed / loft / spin), with the legacy reach / launch / forgive readouts kept

/** Inside this, you are on the green and putting — a different act entirely. */
export const PUTT_RANGE_M = 9;

// ── BASEBALL: the PCI ───────────────────────────────────────────────────────
// The benchmark's own locked justification reads "contact-based bat mechanics
// with dynamic PCI". The PCI — Plate Coverage Indicator — is the reticle you
// move to where you think the pitch will be, and contact quality is how well it
// overlaps the ball. Derby had no PCI and every pitch arrived at the same spot,
// so the only skill was timing and the stick merely set launch angle.
/** Half-extents of the strike zone the PCI moves inside, in metres. */
export const ZONE_HALF = { x: 0.62, y: 0.42 } as const;
/** Perfect overlap within this; degrades to nothing by ZONE_MISS. */
export const PCI_PURE_M = 0.16;
export const PCI_MISS_M = 0.78;
/** The putter: along the ground, short, and unforgiving of a bad line. */
export const PUTTER: WiiClub = WII_PUTTER;

/** Strokes each hole is expected to take. Golf is scored against this. */
export const GOLF_PAR = [3, 4, 4, 3, 5] as const;   // FIELD-DEPTH W4: five-hole loop
/** Within this many metres the ball is holed — a tap-in gimme; the cup itself is GolfBallSim.tryHole (CUP_RADIUS_M).
 *  IMPROVE (2026-10-06, Golf #3): was 1.6 m, so most putting was trivial — and it hid that a short putt could not reach
 *  the cup at all (a 2 m putt at full power rolled 0.8 m; see GolfAim.puttSpeedFor). With the putt rolling its pace,
 *  the cup does the holing and this is only the gimme. */
export const HOLED_M = 0.75;
/** IMPROVE (2026-10-06, Golf #7): the swing meter's wave on the green (rad/s; every other swing runs POWER_METER_RATE
 *  3.4). Pace is the whole putt, and the full-swing wave made it a coarse grab. */
export const GOLF_PUTT_METER_RATE = 2.6;
/** Stick pulled past this is a backswing; pushed past it is the strike. */
export const SWING_STICK = 0.6;

// ════════════════════════════════════════════════════════════════ TENNIS ══
// IMPROVE (2026-10-06, Golf #20): the dead precision TennisMode that sat here is deleted (owner-picked). The registry
// has taken tennis from `./TennisMode` (the M74 net-sport core) since M74; this one was unreachable, type-checked and
// read as live code. `git log -S "precision TennisMode"` finds it if its rally feel is ever wanted as a reference.

// ══════════════════════════════════════════════════════════════════ GOLF ══
export const GolfMode: ModeDefinition = (() => {
  let me: SpawnedCharacter;
  let meAnim: BeatOwner;
  /** The strike is a beat: the ball leaves on the clip's contact key, not on the press. */
  let strikeIn = 0; let pendingStrike: (() => void) | null = null; let pendingVel: Vector3 | null = null;
  let furniture: AbstractMesh[] = [];
  let ball: AbstractMesh, sim: GolfBallSim, meter: PowerMeter;
  /** IMPROVE (2026-10-06, Golf #2 / #18): ONE vector, moved in place per hole. It was reassigned per hole, so the
   *  objectiveRef the load handed FrameGuard kept the first value (0, 0, 55) — off the field — for the whole round. */
  const holePos = new Vector3(0, 0, 55);
  /** IMPROVE (2026-10-06, Golf #2): the round's course seed — the holes and the wind's heading are new each play. */
  let seed = 0;
  /** WII AIM: the arrow's yaw (the stick turns it inside ±60° of the pin line), what it draws, the meter's carry lines. */
  let aimYaw = 0; let arrow: AimArrowHandle | null = null; let ticks: number[] = []; let flightSec = 0;
  let weather: WeatherKit = new WeatherKit(); let weatherFx: WeatherFxHandle | null = null;
  let round = 0, pts = 0, stickX = 0, stickY = 0;
  let phase: 'preview' | 'aim' | 'power' | 'accuracy' | 'flight' = 'aim';
  let previewSec = 0, power = 0;
  let club = 0;                       // which club is in hand
  const wind = new Vector3();         // per-hole wind, applied in flight (written in place)
  let strokes = 0, overPar = 0;       // golf is scored in strokes against par
  let holeLatch = false;              // A+ P0 juice: one holed punch per hole
  let pickUps = 0;   // triple-par pick-ups this round (owner decision 2026-09-05)
  /** Stick-swing state. Runs ALONGSIDE the 3-click swing, never replacing it:
   *  a stick swing does not express on a touch overlay and 3-click is the
   *  better mobile input, so the mode offers both. */
  let backswing = 0, pulling = false;
  /** IMPROVE (2026-10-06, Golf #1): the stick's peak sideways deflection from the pull-back to the push-through — the path. */
  let pathPeakX = 0;
  /** IMPROVE (2026-10-06, Golf #4): where this shot was struck from (the OB drop goes on the line from here). */
  const lie = new Vector3();
  /**
   * The beat between a ball coming to rest and the player walking to it.
   *
   * The landing handler set `phase = 'aim'` immediately and scheduled
   * backToTee() on a 1.1s timer. For that whole window the mode ran the AIM
   * camera against `me.root`, still standing at the PREVIOUS lie, while
   * heroRef still pointed at the ball where it had just landed — so the camera
   * framed one place and the guard measured another, metres apart, and reported
   * the hero behind the camera. It was right: the camera was looking at the old
   * lie. Staying in 'flight' across the beat keeps the camera on the ball, which
   * is the thing worth looking at anyway.
   */
  let settling = false;
  /** L4 — a gallery at the green, and the pin flag that shows the wind. */
  let gallery: Onlookers | null = null;
  let flag: AbstractMesh | null = null;
  let ended = false;
  /** IMPROVE (2026-10-06, Golf #10 / #11): every timeout goes through `timers` (cleared on dispose; each callback also
   *  checks `ended`), and every flash banner through one channel, so a FLICK's clear can no longer wipe a RING mid-flight. */
  const timers = new TimerBag();
  let banners: BannerChannel | null = null;
  const later = (fn: () => void, ms: number) => timers.later(() => { if (!ended) fn(); }, ms);
  /** IMPROVE (2026-10-06, Golf #8): the ball's tracer (a shot's flight and roll-out, stopped at rest) and its own white. */
  let trail: ParticleSystem | null = null;
  /** IMPROVE (2026-10-06, Golf #6 / #8 / #15): the mode's own materials, made once per load and disposed with the mode —
   *  the park's four and the wind flag's were made again every hole and never disposed. */
  let mats: { pad: PBRMaterial; ring: PBRMaterial; fan: PBRMaterial; bank: PBRMaterial; flag: PBRMaterial; ball: PBRMaterial } | null = null;
  /** IMPROVE (2026-10-06, Golf #13 / #14 / #17 / #18): the aim's last exact prediction (turned with the arrow between
   *  refreshes), the meter lines being built a flight per frame, the meter HUD's change gate, the frame's scratch. */
  let aimDirty = false, aimRefreshT = 0, predYaw = 0, predLen = 0;
  const predCarry = { x: 0, z: 0 }, predRest = { x: 0, z: 0 }, drawCarry = { x: 0, z: 0 }, drawRest = { x: 0, z: 0 };
  const AIM_REFRESH_SEC = 0.1;
  let tickJob: MeterTickJob | null = null;
  const meterHud = new MeterHudGate();
  const aimDir = new Vector3(); const STILL = Vector3.Zero();   // STILL is read, never written
  const TOTAL = 5;   // FIELD-DEPTH W4: matches GOLF_PAR length
  /** phase 8: the golfer's RHYTHM gauge (the shared FLOW chip): clean strikes build it, at 70+ the strike is steadier (path error halved) */
  let golfFlow = 0;
  const GOLF_FLOW_RHYTHM = 70, GOLF_FLOW_FORGIVE = 0.5;   // the gain and the miss decay: GolfLoop.rhythmAfter
  const PREVIEW_SEC = 1.8;
  const ACCURACY_CENTER = GH_ACC_CENTER;         // wave value to hit on the way down (one source with the drawn band: core/golfHud)
  const ACCURACY_HALF = GH_ACC_HALF;
  /** A+ mission #5: the card, hole by hole, for the scoreboard between holes. */
  let holeResults: HoleResult[] = [];
  // ── PARKOUR GOLF (owner brief, 2026-09-18: "Parkour Golf — target drop + trick-putt arena"): a springboard behind the ball
  // that augments the strike, two mid-air FLICKS that bend the ball, score RINGS on the line, a TURBINE that gusts it, and
  // the banked half-pipe around the green a putt rides back into the cup (harder on a SLIDE PUTT). Pure reads in
  // core/ParkourGolf; the hole itself (Wii swing, strokes, the card) is untouched.
  const golfPark = { pads: 0, flicks: 0, ringsTotal: 0, gusts: 0, bankRides: 0, slidePutts: 0 };
  let pad: PadKind | null = null, hopT = -1, flicksLeft = 0, prevFlickX = 0, rings: Ring[] = [], ringChain = 0, gusting = false, slidePutt = false, bankRode = false, bankCool = 0;
  const ringsTaken = new Set<string>(); const ringMeshes = new Map<string, AbstractMesh>();
  let fan: { x: number; z: number } | null = null, fanBlades: AbstractMesh | null = null;
  const teePos = new Vector3(), prevBallPos = new Vector3(); let lastCarryM = 0, apexY = 0;
  /** The hole's park: the springboard at the tee, the rings and the fan on the line, the bank around the green (all in `furniture`, rebuilt per hole). */
  function buildHolePark(ctx: ModeContext): void {
    teePos.copyFrom(ball.position); ringsTaken.clear(); ringMeshes.clear(); ringChain = 0; pad = null; slidePutt = false; bankRode = false; gusting = false;
    const tee = { x: teePos.x, z: teePos.z }, hole = { x: holePos.x, z: holePos.z };
    const { pad: padMat, ring: ringMat, fan: fanMat, bank: bankMat } = golfMats(ctx);   // IMPROVE #15: made once, not per hole
    const yaw = Math.atan2(hole.x - tee.x, hole.z - tee.z);
    const board = MeshBuilder.CreateBox('gp_springboard', { width: 1.2, height: 0.12, depth: 0.9 }, ctx.scene);
    board.position.set(tee.x - Math.sin(yaw) * 1.1, 0.06, tee.z - Math.cos(yaw) * 1.1); board.rotation.y = yaw; board.material = padMat; board.isPickable = false; furniture.push(board);
    rings = ringsFor(tee, hole);
    for (const rg of rings) {
      const t = MeshBuilder.CreateTorus(`gp_${rg.id}`, { diameter: rg.r * 2, thickness: 0.18, tessellation: 28 }, ctx.scene);
      t.position.set(rg.x, rg.y, rg.z); t.rotation.x = Math.PI / 2; t.rotation.y = yaw; t.rotation.x = Math.PI / 2; t.material = ringMat; t.isPickable = false;
      // a torus lies flat (XZ); stood up across the line: rotate about the line's perpendicular
      t.rotation.set(0, yaw, 0); t.addRotation(Math.PI / 2, 0, 0);
      furniture.push(t); ringMeshes.set(rg.id, t);
    }
    fan = turbineFor(tee, hole);
    const post = MeshBuilder.CreateCylinder('gp_fan_post', { diameter: 0.3, height: 2.2 }, ctx.scene); post.position.set(fan.x, 1.1, fan.z); post.material = fanMat; post.isPickable = false; furniture.push(post);
    fanBlades = MeshBuilder.CreateBox('gp_fan_blades', { width: 2.6, height: 2.6, depth: 0.08 }, ctx.scene); fanBlades.position.set(fan.x, 2.6, fan.z); fanBlades.rotation.y = yaw + Math.PI / 2; fanBlades.material = fanMat; fanBlades.isPickable = false; furniture.push(fanBlades);
    const bank = MeshBuilder.CreateTorus('gp_bank', { diameter: (BANK.innerR + BANK.outerR), thickness: BANK.outerR - BANK.innerR, tessellation: 40 }, ctx.scene);
    bank.position.set(hole.x, -0.25, hole.z); bank.scaling.y = 0.75; bank.material = bankMat; bank.isPickable = false; furniture.push(bank);
  }

  /** IMPROVE (2026-10-06, Golf #6 / #8 / #15): the mode's materials, once per load. */
  function golfMats(ctx: ModeContext): NonNullable<typeof mats> {
    if (mats) return mats;
    const flagMat = VenueKit.paint(ctx.scene, 'golf_wind_flag_m', '#ffcf3a', 0.18, 0.7);
    flagMat.albedoColor = flagMat.albedoColor.scale(0.42);   // the green's LIT divisor (aimSwingCore): under this rig an unscaled pick clips pale
    mats = {
      pad: VenueKit.paint(ctx.scene, 'gp_pad_mat', '#22d3ee', 0.3, 0.5), ring: VenueKit.paint(ctx.scene, 'gp_ring_mat', '#9ad7ff', 0.45, 0.4),
      fan: VenueKit.paint(ctx.scene, 'gp_fan_mat', '#d9d2c2', 0.08, 0.6), bank: VenueKit.paint(ctx.scene, 'gp_bank_mat', '#2f7a42', 0.06, 0.9),
      flag: flagMat,
      ball: VenueKit.paint(ctx.scene, 'golf_ball_m', '#f7f7f2', 0.35, 0.35),   // a white ball that holds its white on the grass
    };
    return mats;
  }
  /**
   * IMPROVE (2026-10-06, Golf #15): the hole's furniture goes WITH its per-hole materials. `f.dispose()` leaves a mesh's
   * material behind, and buildGolfGreen paints four new ones each hole; the mode's own (golfMats) are kept for the next.
   */
  function clearFurniture(): void {
    const keep = new Set<Material>(mats ? Object.values(mats) : []);
    const drop = new Set<Material>();
    for (const f of furniture) { const m = f.material; if (m && !keep.has(m)) drop.add(m); f.dispose(); }
    for (const m of drop) m.dispose();
    furniture = [];
  }
  const parOf = (r: number): number => GOLF_PAR[Math.min(r, GOLF_PAR.length) - 1] ?? 3;
  /** Flat distance from the ball to the pin (no Vector3 made: onGreen() runs every frame). */
  function distToPin(): number { return Math.hypot(ball.position.x - holePos.x, ball.position.z - holePos.z); }

  function nextShot(ctx: ModeContext): void {
    round++;
    // ON THE COURSE. VenueKit.buildField(scene, 'golf') builds 60 x 90, so the
    // grass runs z -45..45 — and this put the pin at 42 + (round*31)%28, i.e.
    // up to z 69. Holes 2 and 3 sat off the end of the world, the preview camera
    // flew out over the void behind them, and the watchdog reported a black
    // frame. Kept well inside the field now.
    // IMPROVE (2026-10-06, Golf #2): the pin was `((round * 53) % 21) - 10, 26 + ((round * 31) % 13)` — the same five holes
    // every session, at lengths that ignored the card (hole 1, a par 3, was 30 m; hole 4, a par 3, 33 m). The hole's
    // LENGTH now comes from its par (GolfLoop.PAR_BANDS: par 3 22–26 m, par 4 28–32 m, par 5 34–37.4 m) and its line from
    // the round's seed, inside the same x ±10, z ≤ 38 box. GOLF_PAR itself is unchanged (the score ceiling reads it).
    const h = loopHole(parOf(round), seed, round);
    holePos.set(h.x, 0, h.z);
    clearFurniture();
    furniture = buildGolfGreen(ctx.scene, holePos);
    // L2 — THE WIND, READABLE FROM THE COURSE. It was a number in the HUD only,
    // and "course reading" is one of the three pillars the benchmark names: a
    // player should be able to look at the hole and see which way it blows.
    // The flag leans with it, harder in a stronger wind.
    // IMPROVE (2026-10-06, Golf #6): it wore `furniture[0].material` — the GREEN's paint — so the wind flag vanished
    // against the green it stood on, while the kit's static red flag (which reads no wind) stood over it at the same
    // spot. One flag now, the wind's, in a yellow of its own; and it hangs from the POLE and streams DOWNWIND (it turned
    // about its own middle and lay across the wind, so even when seen it pointed the wrong way).
    for (const f of furniture) if (f.name === 'flag') f.setEnabled(false);
    flag?.dispose();
    const flagBox = MeshBuilder.CreateBox('pinFlag', { width: 0.7, height: 0.34, depth: 0.03 }, ctx.scene);
    flagBox.bakeTransformIntoVertices(Matrix.Translation(0.35, 0, 0));   // the box's origin at its pole edge: it turns on the pole
    flag = flagBox;
    flag.position.set(holePos.x, 1.85, holePos.z);
    flag.material = golfMats(ctx).flag; flag.isPickable = false;
    ball.position.set(LOOP_TEE.x, 0.05, LOOP_TEE.z);
    meAnim.loop(SPORT_CLIP.golfAddress, { fadeSec: 0.3 });
    strikeIn = 0; pendingStrike = null;
    // HOLE PREVIEW — fly the camera to the green, look back at the tee.
    // Pure camDirector.snapTo, timer-bounded, cannot stall.
    strokes = 0;
    holeLatch = false;                // A+ P0: a new hole gets its own punch
    settling = false;
    trail?.stop();
    // COURSE READING — the third pillar, and none of its inputs existed. Wind
    // is the cheapest honest one: it is visible in the HUD before you commit,
    // it pushes the ball for the whole flight, and it makes the reticle a
    // starting point rather than an answer.
    const wa = loopWindAngle(round, seed);   // IMPROVE #2: the old golden-angle walk from a seeded heading
    wind.set(Math.sin(wa) * (1.2 + (round % 3) * 0.9), 0, Math.cos(wa) * 0.6);
    // WEATHER: a pick that carries wind (a windy day, a storm, rain) sets the hole's wind — one value, not a second one
    { const w = weather.flightWind(); if (Math.hypot(w.x, w.z) >= 0.5) wind.set(w.x, 0, w.z); }
    if (flag) {
      // Point the flag downwind and lean it by strength — the reading a golfer
      // actually takes before choosing a club.
      // IMPROVE #6: the box's long side is its local +x, so DOWNWIND is the wind's bearing less a quarter turn; a still
      // flag hangs (1.2 rad below level) and a 3 m/s wind flies it out flat — more wind, less droop.
      flag.rotation.y = Math.atan2(wind.x, wind.z) - Math.PI / 2;
      flag.rotation.z = -Math.max(0.1, 1.2 - wind.length() * 0.35);
    }
    phase = 'preview'; previewSec = 0;
    // The hole preview is an AUTHORED SHOT: the camera flies to the green and
    // looks back, and the player is deliberately not in it. CameraDirector has
    // `suspended` for exactly this — its own comment reads "a replay, a rim
    // cut, a cinematic... the hero being out of frame is then the authored shot,
    // not a fault" — and nothing in the project had ever set it. FrameGuard
    // honours the flag, so the preview stops being reported as a framing
    // failure, which is what it was.
    ctx.camDirector.suspended = true;
    ctx.camDirector.snapTo(holePos.add(new Vector3(0, 0, 3)), ball.position.add(new Vector3(0, 0.6, 0)));
    const clutch = round === TOTAL;
    ctx.setHud({
      round: `${round}/${TOTAL}`, power: 0, accuracy: '',
      hint: clutch ? 'FINAL SHOT — study the green' : `HOLE ${round} · PAR ${parOf(round)} — ${Math.round(distToPin())}m out`,
    });
    buildHolePark(ctx);   // PARKOUR GOLF
  }

  /** The golf frame: strokes against par, which is how the sport is scored. */
  function card(): string { return cardString(overPar); }

  /** Strike the ball. BOTH swings end here, so the 3-click and the stick
   *  produce the same shot from the same two inputs — power and side error —
   *  instead of two implementations that drift apart. */
  /** On the green the club is taken out of your hands — you putt. */
  function onGreen(): boolean {
    return distToPin() <= PUTT_RANGE_M;   // IMPROVE #18: it built a Vector3 on every call, and it is called every frame
  }

  /** The course under the ball: the green is the hole's disc, the fairway the mown strip, the rest is rough. */
  function surfaceAt(p: Vector3): GolfSurface {
    const dx = p.x - holePos.x, dz = p.z - holePos.z;
    if (dx * dx + dz * dz <= 36) return 'green';
    if (Math.abs(p.x) <= 14 && p.z >= -6 && p.z <= 43) return 'fairway';
    return 'rough';
  }
  function air(): AirLike { return { wind: { x: wind.x, z: wind.z }, wet01: weather.wet01(), density: weather.airDensityMult() }; }
  function pinYaw(): number { const v = holePos.subtract(ball.position); return Math.atan2(v.x, v.z); }
  /** Redraw the arrow (this club, full power, this wind) and, when asked, the meter's carry lines. */
  function refreshAim(ctx: ModeContext, withTicks: boolean): void {
    // IMPROVE (2026-10-06, Golf #5): on the green the ring is the PUTT — resolvePutt's pace and the green's break, rolled
    // ahead and dropping if it would (GolfAim.simulatePutt) — and the arrow runs to where it STOPS. It was the putter flown
    // as a club (another speed, no break), so the preview said one thing and the putt did another.
    const green = onGreen();
    const from = { x: ball.position.x, y: ball.position.y, z: ball.position.z };
    const pred = green ? simulatePutt(1, aimYaw, from, holePos, air(), surfaceAt) : simulateShot(GOLF_CLUBS[club], 1, aimYaw, from, air(), surfaceAt);
    predYaw = aimYaw; predLen = green ? pred.totalM : pred.carryM; lastCarryM = predLen;
    const land = green ? pred.rest : pred.carry; predCarry.x = land.x; predCarry.z = land.z; predRest.x = pred.rest.x; predRest.z = pred.rest.z;
    aimDirty = false; aimRefreshT = 0;
    drawAim();
    const aimDeg = Math.round(((aimYaw - pinYaw() + Math.PI * 3) % (Math.PI * 2) - Math.PI) * 180 / Math.PI);   // the arrow's offset from the pin line, for the HUD
    if (withTicks) startTicks(green, from);
    ctx.setHud({ aimCarry: Math.round(predLen), aimDeg });
  }
  /**
   * IMPROVE (2026-10-06, Golf #13): the arrow at THIS yaw from the last exact prediction, turned about the ball. Turning the
   * aim ran a full flight (up to 1680 sim steps) every frame; the flight is re-run at most every AIM_REFRESH_SEC now, and
   * between runs the ring turns with the arrow (exact in still air; within a frame or two of exact in a wind).
   */
  function drawAim(): void {
    const d = aimYaw - predYaw;
    rotateAbout(predCarry, ball.position.x, ball.position.z, d, drawCarry); rotateAbout(predRest, ball.position.x, ball.position.z, d, drawRest);
    arrow?.set(ball.position, aimYaw, predLen, drawCarry, drawRest);
    me.root.rotation.y = aimYaw;   // the golfer faces the arrow
  }
  /** IMPROVE (2026-10-06, Golf #14): the meter's eleven lines are built a flight per frame (update) instead of eleven in the
   *  press's frame — the hitch on every B. A swing started before they are in finishes them then (stepTicks(ctx, true)). */
  function startTicks(green: boolean, from: { x: number; y: number; z: number }): void {
    const yaw = aimYaw, a = air(), c = GOLF_CLUBS[club], cup = { x: holePos.x, z: holePos.z };
    // a putt's lines read how far each power ROLLS (no cup); a shot's, where it lands
    tickJob = new MeterTickJob(green ? (p) => simulatePutt(p, yaw, from, cup, a, surfaceAt, 14, false).totalM : (p) => simulateShot(c, p, yaw, from, a, surfaceAt).carryM);
    ticks = [];
  }
  function stepTicks(ctx: ModeContext, finish: boolean): void {
    if (!tickJob) return;
    if (finish) tickJob.finish(); else tickJob.step(1);
    if (!tickJob.done) return;
    ticks = tickJob.ticks; tickJob = null;
    ctx.setHud({ meterTicks: ticks.join(',') });
  }
  /** A refresh the stick asked for and the throttle has not run yet: run it now (the swing starts on the true ring). */
  function flushAim(ctx: ModeContext): void { if (aimDirty) refreshAim(ctx, false); }

  function strike(ctx: ModeContext, pwr: number, sideErr: number): void {
    // PUTTING. Half of golf, and the mode had none of it: every shot was a full
    // swing, so a ball 2m from the pin was struck with a driver. Inside
    // PUTT_RANGE the putter is automatic — you do not choose a club on the
    // green — and it rolls the ball along the ground rather than flying it,
    // which is why its launch is near zero and its forgiveness is the lowest in
    // the bag: on the green the LINE is the whole shot.
    const green = onGreen();
    const c = green ? PUTTER : GOLF_CLUBS[club];
    phase = 'flight';
    lie.copyFrom(ball.position);   // IMPROVE #4: the OB drop goes on the line from here
    console.info(`[GOLF-STRIKE] ${c.id} power ${pwr.toFixed(2)} side ${sideErr.toFixed(2)} ${green ? 'putt' : pad ? 'pad' : 'swing'}`);   // phase 4: the ledger
    // phase 8: RHYTHM — a clean strike (the path inside 0.2) builds the gauge, a hook / slice drains it; at 70+ the strike is IN RHYTHM
    // IMPROVE (2026-10-06, Golf #12): a hook / slice HALVES the gauge (GolfLoop.rhythmAfter) — it emptied it, so one drift
    // took a 70+ gauge to 0 and the rhythm a round had built was gone on a single swing.
    const inRhythm = golfFlow >= GOLF_FLOW_RHYTHM;
    golfFlow = rhythmAfter(golfFlow, sideErr);
    ctx.setHud({ flow: golfFlow, kinetic: golfFlow >= GOLF_FLOW_RHYTHM ? 'IN RHYTHM' : '' });
    // measured on the first cut: rhythm as EXTRA CARRY (x1.08) sent a club chosen for the distance out of bounds four times on
    // the par 4 — a steadier golfer is not a longer one. In rhythm = a steadier strike: the path error is halved (forgiveness).
    if (inRhythm) sideErr *= GOLF_FLOW_FORGIVE;
    console.info(`[GOLF-FLOW] ${golfFlow}${inRhythm ? ' (struck in rhythm: path error halved)' : ''}`);
    // ARENA-10PHASE P4: the swing meter is over — the accuracy band used to stay on the HUD through the whole flight
    // (playtest d3d4a93's golf frame shows it mid-flight) because only backToTee cleared it
    ctx.setHud({ meterT: null, swingPhase: null, powerLock: null, hint: '' });
    // FrameGuard checks that you can see the thing the mode is about, and once
    // the ball is struck that thing is the BALL — the camera follows it down
    // the fairway by design, leaving the player behind. Golf never set heroRef
    // at all, so it inherited the player from spawnAthlete and the guard spent
    // every shot reporting a hero it was never meant to be framing.
    ctx.heroRef.current = ball;
    // BACK TO FOLLOW for the flight. setFixedBehind puts the director in FIXED
    // mode for the address, and golf never took it out again — so
    // camDirector.update(ball.position, …) during the flight ignored the ball
    // completely and held the tee framing while the ball flew away. The shot
    // was never actually followed; the camera only looked like it was because
    // the target lerps toward the pin.
    ctx.camDirector.mode = 'follow';
    strokes++;
    // The swing is a BEAT that settles into the HELD finish (a golfer watches the ball; the address comes back when they
    // walk to the lie); on the green it is the putt, which settles into the address. The ball leaves on the contact key.
    const clip = c === PUTTER ? SPORT_CLIP.golfPutt : SPORT_CLIP.golfSwing;
    meAnim.beat(clip, { fadeSec: 0.1 });   // the beat first, then where it settles (a loop asked for during a beat is where the beat lands)
    meAnim.loop(c === PUTTER ? SPORT_CLIP.golfAddress : SPORT_CLIP.golfFinish, { fadeSec: 0.25 });
    strikeIn = GOLF_CONTACT_SEC[clip as keyof typeof GOLF_CONTACT_SEC] ?? 0;
    // WII AIM: the shot leaves along the ARROW at the club's loft with its backspin; a bad strike is a HOOK or a SLICE
    // (sidespin the flight curves on — early on the meter hooks, late slices; the stick swing's lateral drift likewise),
    // divided by the club's forgiveness. Not a random lateral kick.
    const sideSign: -1 | 1 = sideErr >= 0 ? 1 : -1; const errMag = Math.min(1, Math.abs(sideErr));
    let vel: Vector3;
    let spin: Vector3;
    if (green) {
      // IMPROVE (2026-10-06, Golf #3 / #5): one putt launch for the putt and its preview (GolfAim.puttLaunch) — resolvePutt's
      // pace and break as before, but the speed is now the one that ROLLS that pace (it was pace / 1.15, which left a 2 m
      // putt 1.2 m short at full power).
      vel = puttLaunch(pwr, Math.max(0, 1 - errMag), aimYaw, distToPin(), greenBreakSlope(ball.position.x, holePos.x), weather.wet01()).vel;
      spin = Vector3.Zero();
    } else {
      const launched = launchVelocity(c, pwr, aimYaw, errMag, sideSign);
      vel = launched.vel;
      spin = launched.spin;
    }
    // PARKOUR GOLF: the launch pad augments the strike; a SLIDE PUTT is a little hotter and rides the bank harder; two flicks in the air
    if (pad) { vel.scaleInPlace(padMult(pad)); golfPark.pads++; console.info(`[GOLF-PARK] ${PAD[pad].label} ×${padMult(pad)}`); }
    if (c === PUTTER && slidePutt) { vel.scaleInPlace(1.12); golfPark.slidePutts++; console.info('[GOLF-PARK] slide putt'); }
    flicksLeft = c === PUTTER ? 0 : FLICK.perShot; ringChain = 0; bankRode = false; gusting = false; prevFlickX = 0;
    ctx.setHud({ flicks: flicksLeft, pad: pad ? PAD[pad].label : '' }); pad = null;
    pendingVel = vel;   // the follow camera sets up behind the line of the coming shot while the club comes down
    arrow?.show(false);
    pendingStrike = () => {
      SoundKit.play('whoosh', { pitch: 0.9 });
      ctx.feel?.impact?.(0.25 + pwr * 0.35);   // the contact feel, ON the contact (A+ P0 weight unchanged)
      sim.wind.copyFrom(wind); sim.wet01 = weather.wet01(); sim.airDensity = weather.airDensityMult();
      prevBallPos.copyFrom(ball.position); apexY = 0; sim.launch(ball.position.clone(), vel, spin); flightSec = 0;
      if (c !== PUTTER) trail?.start();   // IMPROVE #8: the tracer runs from the strike to the rest (a putt rolls at your feet)
    };
    if (strikeIn <= 0) { pendingStrike(); pendingStrike = null; }
    ctx.setHud({
      accuracy: sideErr === 0 ? 'PURE' : Math.abs(sideErr) > 0.5 ? (sideErr > 0 ? 'SLICED' : 'HOOKED') : 'DRIFTED',
      hint: '', strokes,
    });
  }

  function backToTee(ctx: ModeContext): void {
    phase = 'aim';
    settling = false;
    ctx.camDirector.suspended = false;      // the cinematic is over
    pulling = false; backswing = 0; pathPeakX = 0;
    trail?.stop();
    meAnim.loop(SPORT_CLIP.golfAddress, { fadeSec: 0.3 });   // at the lie: the held finish gives way to the address
    strikeIn = 0; pendingStrike = null;
    ctx.heroRef.current = me.root;      // addressing the ball: frame the player
    // Behind the BALL, not the tee. Golf is played from where it lies; this
    // mode gave every shot from the tee because a hole WAS one shot.
    me.root.position.set(ball.position.x - 0.5, 0, ball.position.z - 0.6);
    // The player TELEPORTS to the lie, which is a cut, not motion. Snap the
    // camera with them or it lerps across the fairway with nobody in frame.
    // FACE THE PIN. This passed a hard-coded yaw of 0, i.e. "the player always
    // faces +Z" — true only on the tee shot. The moment a drive overshoots the
    // hole the player is beyond it and must play BACK, and the camera was still
    // setting up as though they faced away: it ended up in front of them,
    // looking the wrong way, with the player projecting outside the frustum.
    // That is where golf's [FEL-FRAME] lines came from.
    // FOLLOW, not FIXED.
    //
    // The address camera was `snapTo` + `setFixedBehind`, and the handoff
    // between them is where golf's remaining framing failures lived: the fixed
    // branch lerps position toward its own fixedPos while the flyover, the
    // A-press preview skip and the shot itself all move the camera by other
    // means, so the pose the guard sampled was frequently one nobody had
    // authored — camera at the green's framing, looking back down the fairway,
    // with the player behind it.
    //
    // Follow mode is the path every signed-off mode uses and the one FrameGuard
    // is built around, and it expresses this shot exactly: pass a unit vector
    // toward the pin as the "velocity" and the director puts the camera behind
    // the player looking down the line. Karate Endless uses the same convention
    // for its facing-derived camera.
    const pinVec = holePos.subtract(me.root.position);
    pinVec.y = 0;
    if (pinVec.lengthSquared() > 1e-4) pinVec.normalize(); else pinVec.set(0, 0, 1);
    me.root.rotation.y = Math.atan2(pinVec.x, pinVec.z);
    aimYaw = me.root.rotation.y;   // WII AIM: the arrow starts on the pin line; the stick turns it from here
    arrow?.show(true); refreshAim(ctx, true);
    ctx.camDirector.mode = 'follow';
    ctx.camDirector.snapTo(me.root.position, holePos);
    const toPin = distToPin();
    const windDeg = windBearingDeg(wind, pinVec);
    ctx.setHud({
      club: onGreen() ? PUTTER.id : GOLF_CLUBS[club].id,
      wind: `${wind.length().toFixed(0)} m/s`,
      // A+ mission #5 (Everybody's Golf read): bearing + word for the lie panel, the hole for the chip; the meter keys
      // below are published while the three-press swing runs
      windDeg, windWord: windWord(windDeg, wind.length()), hole: round, holes: TOTAL, par: parOf(round),
      meterT: null, swingPhase: null, powerLock: null, board: null, boardTitle: '',
      pin: `${toPin.toFixed(0)}m`, weather: weather.describe(),
      strokes, card: card(), pad: '', flicks: onGreen() ? 0 : FLICK.perShot, rings: ringsTaken.size,
      hint: 'L-STICK turns the ARROW (the ring is a full swing) · A starts the swing · A at the top for POWER · A in the band · B cycles CLUB · or pull the stick back and drive it STRAIGHT through (drift off line hooks / slices)',
    });
  }

  return {
    modeId: 'golf', mood: 'alpine', camPreset: 'links',

    async load(ctx: ModeContext) {
      golfVenue = mountVenue(ctx, 'golf_loop', { keepGameplayCamera: true, look: readPlaceLook('golf') });   // PLACE: the splash's pick
      VenueKit.buildField(ctx.scene, 'golf');   // the kit green and pines stay under the spec's sky and props; the spec's pale ground hides
      // Same stacking as football, same rename, same reason: two coplanar meshes under one name made the
      // physics floor the hidden one (see FootballRushMode).
      if (golfVenue) for (const m of golfVenue.built.root.getChildMeshes()) if (m.name === 'venue_ground') { m.visibility = 0; m.name = 'venue_ground_under'; m.isPickable = false; }
      EffectsKit.ambient(ctx.scene, 'park');
      me = await spawnAthlete(ctx, CFG.heroUrl, new Vector3(-0.5, 0, 0), 0, SPORT_CLIP.golfAddress);
      meAnim = new BeatOwner(me.animator); meAnim.loop(SPORT_CLIP.golfAddress);
      ball = MeshBuilder.CreateSphere('gball', { diameter: 0.1 }, ctx.scene);
      // IMPROVE (2026-10-06, Golf #8): the ball was an untextured default sphere with no tracer — a 10 cm grey dot against
      // the sky. It is a lit white now, and a shot draws its line (EffectsKit.ballTrail, as the court sports do; started on
      // the strike, stopped at rest, so it is not 120 particles on a ball lying still)
      timers.clear(); mats = null; ended = false;
      ball.material = golfMats(ctx).ball; ball.isPickable = false;
      trail = EffectsKit.ballTrail(ctx.scene, ball, '#fff4cf'); trail.stop();
      banners = new BannerChannel(timers, (text) => ctx.setHud({ banner: text }));
      seed = loopSeed();   // IMPROVE #2: a new course each play (the weather's seed is the same clock)
      sim = new GolfBallSim(ball);
      // WEATHER: the start screen's pick (natural / random / a condition / a time of day) — read here, after the page exists
      weather = WeatherKit.fromPick(readWeather('golf'), 'links', Math.floor(Date.now() / 1000) % 100000);
      weatherFx?.dispose(); weatherFx = mountWeatherFx(ctx.scene, ctx.lights, weather, { tier: ctx.lights.tier, keepSky: !!readPlaceLook('golf')?.sky });   // a place with its own sky keeps it
      arrow?.dispose(); arrow = mountAimArrow(ctx.scene);
      meter = new PowerMeter();
      ctx.objectiveRef.current = holePos;
      ctx.camDirector.setFixedBehind(me.root.position, 0, 'swing');
      assertSpawned(ctx.scene, { hero: me.root, minWorldMeshes: 6, modeId: 'golf' });
      round = 0; pts = 0; ended = false;
      overPar = 0; pickUps = 0; holeResults = [];   // the round's tallies start clean (overPar used to carry across plays on one page)
      // 'wind', not 'dojo' — a martial-arts room tone on an alpine golf course.
      // Same class of mistake as the skatepark's stadium crowd bed.
      SoundKit.startAmbient('wind');
      // L4 — a gallery behind the tee. A links hole is watched.
      // two rows flanking the tee box (x ±8.5, z −1…+5): the old rows behind the tee at z −4 / −6 sat on the swing camera's
      // plane (offset z −4.2) and two bodies stood beside the lens, over the phone pad (measured 2026-09-06)
      // IMPROVE (2026-10-06, Golf #16): these are full skinned roster bodies now (Onlookers, Ship Pass 6), not the instanced
      // silhouettes "two draws" described: ten spots under MAX_BODIES spawned five, three on one side and two on the other.
      // Four, two each side of the tee box, and paused while the camera is off them (Onlookers' pauseOffscreen) — which
      // is every shot after the drive, the whole hole preview and every flight down the fairway.
      gallery = new Onlookers(ctx.scene, [new Vector3(-8.5, 0, 0.5), new Vector3(-8.5, 0, 3.5), new Vector3(8.5, 0, 0.5), new Vector3(8.5, 0, 3.5)],
        '#3d4a3a', Vector3.Zero(), { pauseOffscreen: true });
      ctx.setHud({ score: 0, weather: weather.describe() });
      if (process.env.NODE_ENV === 'development') {
        (ctx.scene.metadata ??= {}).golf = {   // PARKOUR GOLF probes
          state: () => ({ phase, hole: round, strokes, ended, onGreen: onGreen(), ballX: ball.position.x, ballY: ball.position.y, ballZ: ball.position.z, holeX: holePos.x, holeZ: holePos.z, par: parOf(round), seed, pad, flicksLeft, rings: ringsTaken.size, ringChain, slidePutt, pts, ...golfPark, flying: sim.ball.active, rolling: sim.ball.rolling, carryM: lastCarryM, apexY, distToPin: distToPin() }),
        };
      }
      nextShot(ctx);
    },

    onInput(ctx: ModeContext, e: FelInput) {
      SoundKit.unlock();
      if (e.t === 'stick' && e.side === 'L') {
        stickX = e.x; stickY = e.y;
        // PARKOUR GOLF: a FLICK in the air bends the ball (an edge on the stick, two a shot)
        if (phase === 'flight' && strikeIn <= 0 && sim.ball.active && !sim.ball.rolling) {
          const f = flickRead(prevFlickX, e.x, flicksLeft);
          if (f !== 0) {
            const d = flickVel({ x: sim.ball.vel.x, z: sim.ball.vel.z }, f); sim.ball.vel.x += d.x; sim.ball.vel.z += d.z;
            flicksLeft--; golfPark.flicks++; SoundKit.play('whoosh', { pitch: 1.5, volume: 0.35 }); ctx.feel?.impact?.(0.12);
            ctx.setHud({ flicks: flicksLeft }); banners?.flash(`FLICK ${f > 0 ? '▶' : '◀'}`, 400); console.info(`[GOLF-PARK] flick ${f > 0 ? 'right' : 'left'} (${flicksLeft} left)`);
          }
        }
        prevFlickX = e.x;
        // THE ANALOG STICK SWING — PGA Tour 2K's signature, added ALONGSIDE the
        // 3-click rather than replacing it. Pull back to load, drive through to
        // strike: how far you pulled is the power, and where the stick sits
        // laterally as you come through is the path, so a swing that drifts off
        // line hooks or slices exactly as a real one does.
        // IMPROVE (2026-10-06, Golf #1): it struck with a side error of 0 — "the stick turns the aim; it no longer also hooks
        // the swing" — so a full pull-and-push was full power AND pure, every time, and the three-press swing was the worse
        // choice. The aim still never turns during a swing (update() turns it only while not pulling); what the stick does
        // sideways BETWEEN the pull-back and the push-through is the path now: its peak past a dead zone is the side error
        // (GolfLoop.stickPathErr), right slices and left hooks, as the three-press swing's late / early do.
        if (phase === 'aim') {
          if (e.y <= -SWING_STICK) {
            if (!pulling) pathPeakX = 0;
            pulling = true;
            backswing = Math.max(backswing, Math.min(1, -e.y));
          }
          if (pulling && Math.abs(e.x) > Math.abs(pathPeakX)) pathPeakX = e.x;
          if (pulling && e.y >= SWING_STICK) {
            pulling = false;
            flushAim(ctx);
            strike(ctx, backswing, stickPathErr(pathPeakX));   // the arrow is the direction; the path is the curve
            backswing = 0; pathPeakX = 0;
          }
        }
      }
      if (e.t === 'button' && e.btn === 'A' && e.pressed) {
        if (phase === 'preview') { backToTee(ctx); return; }   // skip the flyover
        if (phase === 'aim') {
          flushAim(ctx); stepTicks(ctx, true);   // IMPROVE #13 / #14: the swing starts on the true ring and the full meter lines
          meter.rate = onGreen() ? GOLF_PUTT_METER_RATE : POWER_METER_RATE;   // IMPROVE #7: a slower wave on the green
          phase = 'power'; meter.start(); meterHud.reset(); ctx.setHud({ hint: 'SWING at the top for POWER' });
        }
        else if (phase === 'power') {
          power = meter.value;                    // keep the wave running — accuracy rides it down
          phase = 'accuracy';
          SoundKit.play('uiTick', { pitch: 1.2 });
          ctx.setHud({ power: Math.round(power * 100), hint: 'NOW — strike in the accuracy band!' });
        } else if (phase === 'accuracy') {
          const raw = meter.stop(); const err = Math.abs(raw - ACCURACY_CENTER);
          const clean = err <= ACCURACY_HALF;
          strike(ctx, power, clean ? 0 : Math.sign(raw - ACCURACY_CENTER) * Math.min(1, (err - ACCURACY_HALF) * 3));   // early hooks, late slices
        } else if (phase === 'flight') refuse(ctx, sim.ball.rolling ? 'ROLLING OUT' : 'BALL IN THE AIR — flick the stick');   // net/precision phase 3: the one silent press on the mode (7 %)
      }
      // PARKOUR GOLF: Y before the swing is the SPRINGBOARD hop (power off the launch position); LT on the green is the SLIDE PUTT
      if (e.t === 'button' && e.btn === 'Y' && e.pressed) {
        if (phase === 'aim' && !onGreen() && !pad) { pad = 'springboard'; hopT = 0; SoundKit.play('whoosh', { pitch: 1.2, volume: 0.4 }); ctx.setHud({ pad: PAD.springboard.label }); banners?.flash(`SPRINGBOARD — +${Math.round((PAD.springboard.mult - 1) * 100)}% off the pad`, 600); console.info('[GOLF-PARK] springboard'); }
        else refuse(ctx, onGreen() ? 'NO PAD ON THE GREEN' : pad ? 'ON THE PAD ALREADY' : 'HOP BEFORE THE SWING');
        return;
      }
      if (e.t === 'trigger' && e.side === 'L' && phase === 'aim' && onGreen()) { const on = e.value > 0.5; if (on !== slidePutt) { slidePutt = on; ctx.setHud({ pad: on ? 'SLIDE PUTT' : '' }); } }
      // CLUB SELECTION — the first pillar the lock names, and it did not exist.
      if (e.t === 'button' && e.btn === 'B' && e.pressed && phase === 'aim' && !onGreen()) {
        club = (club + 1) % GOLF_CLUBS.length;
        SoundKit.play('uiTick', { pitch: 1.1 });
        const toPin = distToPin();
        ctx.setHud({ club: GOLF_CLUBS[club].id, pin: `${toPin.toFixed(0)}m` });
        refreshAim(ctx, true);   // a new club is a new arrow and new meter lines
        ctx.juice.callout(`${GOLF_CLUBS[club].id.toUpperCase()} · PIN ${toPin.toFixed(0)} m`, '#8fe0a0');   // the change is SAID, not only a HUD field
      } else if (e.t === 'button' && e.btn === 'B' && e.pressed) {
        // MECHANICS PASS (2026-09-15): CLUB was silent 13 of 14 presses — it only works while aiming off the green
        refuse(ctx, onGreen() ? 'PUTTER ON THE GREEN' : phase === 'aim' ? 'CLUB' : 'CHOOSE A CLUB WHILE AIMING');
      }
    },

    update(ctx: ModeContext, dt: number) {
      if (ended) return;
      meter.update(dt);
      weather.update(dt); weatherFx?.update(dt);
      if (phase === 'preview') {
        previewSec += dt;
        if (previewSec >= PREVIEW_SEC) backToTee(ctx);
        return;                                   // camera holds the green view
      }
      // IMPROVE (2026-10-06, Golf #17): the meter's five keys went out as a new object every frame (with a toFixed string),
      // the unchanged ones included; only the keys whose published (rounded) value moved are pushed now (GolfLoop.MeterHudGate)
      if (phase === 'power' || phase === 'accuracy') {
        const v = meter.value, acc = phase === 'accuracy';
        const patch = meterHud.next(Math.round(v * 100), Math.round(v * 1000) / 1000, phase, acc ? Math.round(power * 100) : null, ticks.length ? Math.round(carryAt(ticks, acc ? power : v)) : null);
        if (patch) ctx.setHud(patch);
      }
      // PARKOUR GOLF: the springboard hop, the fan turning
      if (hopT >= 0) { hopT += dt; const u = Math.min(1, hopT / 0.45); me.root.position.y = Math.sin(u * Math.PI) * 0.6; if (u >= 1) { hopT = -1; me.root.position.y = 0; } }
      if (fanBlades) fanBlades.rotation.z += dt * 6;
      if (phase === 'aim' && !pulling) {
        // IMPROVE (2026-10-06, Golf #13): the arrow turns every frame from the last prediction; the flight is re-run at most
        // every AIM_REFRESH_SEC while the stick turns it, and once more when it stops (the ring settles on the exact read)
        const y0 = aimYaw; aimYaw = turnAim(aimYaw, pinYaw(), stickX, dt);
        if (aimYaw !== y0) { aimDirty = true; drawAim(); }
        aimRefreshT += dt;
        if (aimDirty && aimRefreshT >= AIM_REFRESH_SEC) refreshAim(ctx, false);
      }
      if (phase === 'aim') stepTicks(ctx, false);   // IMPROVE #14: one meter line a frame
      // Phase 3 wants update() EVERY frame; this mode drove its camera only
      // during flight, so between shots the camera never converged on its fixed
      // framing — it sat wherever the last snap left it, which after a long
      // drive was far enough away to project past the far plane and, twice in a
      // capture, to render black.
      gallery?.update(dt);
      if (phase !== 'flight') {
        // A unit vector toward the pin stands in for velocity, which is how the
        // director is told which way "behind" is for a stationary subject.
        // WII AIM: the camera looks down the ARROW, so turning the aim turns the view
        // IMPROVE (2026-10-06, Golf #9 / #18): the ONE camera update of an aiming frame, from a scratch vector. A second
        // update(…, Vector3.Zero(), …) used to follow at the end of update() — zero velocity tells the director "keep
        // whatever side you are on", so it undid "behind the arrow" and stepped the follow lerp twice a frame.
        aimDir.set(Math.sin(aimYaw), 0, Math.cos(aimYaw));
        ctx.camDirector.update(me.root.position, aimDir, holePos);
      }
      if (phase === 'flight') {
        if (strikeIn > 0) {
          // the club is still coming down: the ball waits on the contact key
          strikeIn -= dt;
          if (strikeIn <= 0 && pendingStrike) { pendingStrike(); pendingStrike = null; }
          ctx.camDirector.update(ball.position, pendingVel ?? STILL, holePos);
          return;
        }
        // THE FLIGHT IS PHYSICS: drag, backspin lift, the wind through the air, a bounce that takes a pitch mark, the
        // roll on whatever it landed on (green / fairway / rough, wet or dry), and the cup that takes a slow ball.
        flightSec += dt;
        sim.wind.copyFrom(wind);
        sim.step(dt, surfaceAt);
        // PARKOUR GOLF: the rings on the line, the turbine's gust, the bank around the green
        if (sim.ball.active) {
          const line = { x: holePos.x - teePos.x, z: holePos.z - teePos.z };
          for (const rg of rings) if (!ringsTaken.has(rg.id) && ringPass(prevBallPos, ball.position, rg, line)) {
            ringsTaken.add(rg.id); ringChain++; golfPark.ringsTotal++; const gained = RINGS.pts * (ringChain >= 2 ? RINGS.chainMult : 1); pts += gained;
            ringMeshes.get(rg.id)?.setEnabled(false); SoundKit.play('score', { pitch: 1.4 }); EffectsKit.burst(ctx.scene, ball.position, 'sparks');   // burst clones its emitter point
            ctx.setHud({ score: pts, rings: ringsTaken.size }); banners?.flash(ringChain >= 2 ? `RING CHAIN! +${gained}` : `RING! +${gained}`, 700); console.info(`[GOLF-PARK] ring ${rg.id} +${gained}`);
          }
          if (fan && !sim.ball.rolling) {
            const g = gustAt(ball.position, fan);
            if (g) { sim.ball.vel.x += g.x * dt; sim.ball.vel.z += g.z * dt; if (!gusting) { gusting = true; golfPark.gusts++; banners?.flash('TURBINE — flick against it', 500); console.info('[GOLF-PARK] gust'); } }
            else gusting = false;
          }
          if (sim.ball.rolling && onGreen()) {
            bankCool = Math.max(0, bankCool - dt);
            if (bankCool === 0) { const r = bankReflect(ball.position, sim.ball.vel, holePos, slidePutt); if (r) { sim.ball.vel.x = r.x; sim.ball.vel.z = r.z; bankCool = 0.4; if (!bankRode) { bankRode = true; golfPark.bankRides++; banners?.flash(slidePutt ? 'SLIDE PUTT — riding the bank' : 'OFF THE BANK', 600); } SoundKit.play('clang', { pitch: 1.6, volume: 0.35 }); console.info('[GOLF-PARK] bank ride'); } }
          }
        }
        prevBallPos.copyFrom(ball.position); apexY = Math.max(apexY, ball.position.y);
        sim.tryHole(holePos.x, holePos.z);
        if (sim.ball.active && flightSec > 25) sim.ball.stop();   // a ball that never settles is settled (a guard, not a rule)
        const flying = sim.ball.active;
        ctx.camDirector.update(ball.position, sim.ball.vel, holePos);
        if (!flying && !settling) {
          trail?.stop();   // IMPROVE #8: the ball is at rest
          banners?.cancel();   // IMPROVE #10: the rest's own banner is next; no flash clear may wipe it
          // Owner decision (2026-09-05): TRIPLE-PAR PICK-UP. At three times par the hole is scored as triple par and the
          // round moves on — a hole that is never holed used to never end (traced: the ball wandered and re-dropped for
          // 330 s on hole 1). A real player rarely reaches it; a stuck one always finishes the card.
          const parNow = parOf(round);
          const pickUp = (why: string) => {
            const rel = strokes - parNow;
            overPar += rel; pickUps++;
            pts += Math.round(Math.max(20, 120 - rel * 40));
            SoundKit.play('miss'); gallery?.cheer(0.2);
            ctx.feel?.impact?.(0.15);   // A+ P0: a pick-up is a light feel only — never the make punch
            console.info('[GOLF-JUICE] pick-up (light feel)');
            holeResults.push({ hole: round, par: parNow, strokes, pickedUp: true });
            ctx.setHud({ score: pts, strokes, card: card(), meterT: null, swingPhase: null, powerLock: null, banner: `PICKED UP — ${why} · ${strokes} on a par ${parNow}`, board: holeBoard(holeResults, TOTAL), boardTitle: round >= TOTAL ? 'CARD IN' : `NEXT — HOLE ${round + 1}` });
            settling = true;
            later(() => {
              ctx.setHud({ banner: '', board: null, boardTitle: '' });
              if (round >= TOTAL) { ended = true; SoundKit.play('whistle'); console.info(`[GOLF-END] card in ${overPar > 0 ? '+' : ''}${overPar} pickUps ${pickUps} pts ${pts}`); ctx.end('CARD_IN', pts, { holes: TOTAL, overPar, pickUps }); }
              else nextShot(ctx);
            }, 1600);
          };
          // OUT OF BOUNDS — a stroke penalty and a drop, which is the real
          // rule and also stops a shanked drive leaving the course entirely.
          // Out of bounds is the EDGE OF THE FIELD (60 x 90 → ±30, ±45), not an
          // arbitrary number larger than it.
          if (!inBounds(ball.position)) {   // GolfLoop.LOOP_BOUNDS: |x| > 28, z > 43 or z < −6, as it was
            strokes++;
            if (strokes >= parNow * 3) { pickUp('triple par, out of bounds'); return; }
            // IMPROVE (2026-10-06, Golf #4): the drop was always 14 m straight in front of the pin — often a better lie than
            // a decent drive, so going out of bounds could pay. It is on the shot's own line now, 2 m inside where that line
            // left the field (GolfLoop.obDrop): the penalty stroke and no lie the shot did not earn.
            const drop = obDrop(lie, ball.position);
            ball.position.set(drop.x, 0.05, drop.z);
            SoundKit.play('miss');
            ctx.feel?.impact?.(0.15);   // A+ P0: OB is a light feel only
            console.info('[GOLF-JUICE] out of bounds (light feel)');
            ctx.setHud({ banner: `OUT OF BOUNDS — penalty stroke (${strokes})`, strokes });
            settling = true;
            later(() => { ctx.setHud({ banner: '' }); backToTee(ctx); }, 1300);
            return;
          }
          const dist = distToPin();

          // NOT HOLED — play it from where it lies. A hole used to be exactly
          // one shot, scored by proximity, which is why there were no strokes
          // to score against par and no reason to own a wedge.
          if (dist > HOLED_M) {
            if (strokes >= parNow * 3) { pickUp('triple par'); return; }
            SoundKit.play('uiTick');
            ctx.setHud({
              banner: dist <= PUTT_RANGE_M
                ? `ON THE GREEN — ${dist.toFixed(1)}m · stroke ${strokes}`
                : `${dist.toFixed(1)}m from the pin · stroke ${strokes}`,
            });
            settling = true;
            later(() => { ctx.setHud({ banner: '' }); backToTee(ctx); }, 1100);
            return;
          }

          // HOLED. Golf is scored in strokes against par.
          const par = parOf(round);
          const rel = strokes - par;
          overPar += rel;
          const clutch = round === TOTAL;
          const name = holeName(strokes, par);
          holeResults.push({ hole: round, par, strokes });
          const gained = Math.round(Math.max(20, 120 - rel * 40) * (clutch ? CLUTCH_MULT : 1));
          pts += gained;
          if (bankRode) { pts += BANK.pts; console.info('[GOLF-PARK] banked in'); }   // PARKOUR GOLF: a putt that rode the bank into the cup
          SoundKit.play('score', { pitch: rel < 0 ? 1.35 : 1 });
          gallery?.cheer(rel <= 0 ? 1 : 0.4);      // louder for a birdie than a bogey
          // A+ P0 juice (PM brief NET-PRECISION-A-PLUS-P0): the hole drops — under par gets hit-stop + shake + a short gold
          // flash; par a softer shake; over par the lightest. Latched once per hole. No thud added (the score SFX is the sound).
          if (!holeLatch) {
            holeLatch = true;
            if (rel < 0) { ctx.juice.hitStop(50); ctx.juice.shake(0.12, 150); ctx.juice.flash('#FFD700', 120); }
            else ctx.juice.shake(rel === 0 ? 0.08 : 0.05, 120);
            console.info(`[GOLF-JUICE] holed ${rel < 0 ? 'under par (flash)' : rel === 0 ? 'par' : 'over par'}`);
          }
          ctx.setHud({
            score: pts, strokes, card: card(), meterT: null, swingPhase: null, powerLock: null,
            banner: `${bankRode ? 'BANKED IN! ' : ''}${name} — ${strokes} on a par ${par}${clutch ? ' · CLUTCH' : ''}`,
            board: holeBoard(holeResults, TOTAL), boardTitle: round >= TOTAL ? 'CARD IN' : `NEXT — HOLE ${round + 1} · PAR ${parOf(round + 1)}`,
          });
          settling = true;
          later(() => {
            ctx.setHud({ banner: '', board: null, boardTitle: '' });
            if (round >= TOTAL) {
              ended = true; SoundKit.play('whistle');
              console.info(`[GOLF-END] card in ${overPar > 0 ? '+' : ''}${overPar} pickUps ${pickUps} pts ${pts}`); ctx.end('CARD_IN', pts, { holes: TOTAL, overPar, pickUps });
            } else nextShot(ctx);
          }, 2600);   // long enough to read the card
        }
        return;
      }
    },

    dispose() {
      // IMPROVE (2026-10-06, Golf #11): the hole's timers (next hole, back to the lie, the card) could fire on a disposed
      // scene; the mode is ended and every pending one cleared first (each also checks `ended` when it runs)
      ended = true; timers.clear(); banners = null; tickJob = null;
      golfVenue?.dispose?.(); golfVenue = null; gallery?.dispose(); gallery = null; flag?.dispose(); flag = null; me?.dispose();
      clearFurniture(); trail?.dispose(); trail = null; ball?.dispose(); arrow?.dispose(); arrow = null; weatherFx?.dispose(); weatherFx = null;
      if (mats) for (const m of Object.values(mats)) m.dispose();   // IMPROVE #15: the mode's own materials go with it
      mats = null;
      SoundKit.stopAmbient();
    },
  };
})();

// ══════════════════════════════════════════════════════════ HOME RUN DERBY ══
// ── Derby pitch specs (D2 — the movement read) ───────────────────────────
// MLB The Show's hitting is TWO reads: where the PCI goes (location) and what
// the pitch DOES on the way (movement + speed). The derby had one pitch —
// "a positioning read without a movement read" (the lock's own words). Now:
//   fastball — straight, speeds up with the round (the baseline);
//   slider   — aims at one spot, breaks LATE (last 45% of flight) to another:
//              the PCI has to track it, which is the whole point of the pitch;
//   changeup — same look, ~0.78x speed: the timing read. No banner tells you;
//              the ball flight is the tell, as it is at the plate.
// Deterministic by round and the session's seed (IMPROVE 2026-10-06, Derby #5: by round alone the sequence repeated every
// derby), and EXPORTED so the PCI driver and the headless suite read the mode's own
// numbers instead of mirroring them — the driver's header demands exactly
// that ("reads the pitch location from the mode's OWN formula … so the two
// cannot drift"), and it was mirroring anyway.
export type PitchType = 'fastball' | 'slider' | 'changeup';
export interface PitchSpec {
  type: PitchType;
  label: string;
  /** Plate crossing BEFORE any break (what the pitch first reads as). */
  aim: Vector3;
  /** Plate crossing AFTER the break (where the PCI must actually be). */
  arrive: Vector3;
  speed: number;           // m/s toward the plate
  breakShift: number;      // slider: lateral arrival shift (m), 0 otherwise
}

/** IMPROVE (2026-10-06, Derby #5): the mix and the location walk are DerbyLoop.pitchShape's — `seed` omitted is the old
 *  fixed sequence (the depth suite reads it); the mode passes its session seed, so a derby can no longer be memorised. */
export function pitchSpec(round: number, seed?: number): PitchSpec {
  const { type, ux, uy, breakSign } = pitchShape(round, seed);
  const ax = (ux * 0.8) * ZONE_HALF.x;
  const ay = 1.05 + uy * ZONE_HALF.y;
  const speed = (14 + round * 0.5) * (type === 'changeup' ? 0.78 : 1);
  // sliders break to alternating sides; hard enough that covering the aim
  // point means the edge of the bat, not the barrel
  const breakShift = type === 'slider' ? breakSign * 0.45 : 0;
  const aim = new Vector3(ax, ay, 0);
  return {
    type,
    label: type === 'fastball' ? 'FB' : type === 'slider' ? 'SLD' : 'CHG',
    aim,
    arrive: new Vector3(ax + breakShift, ay, 0),
    speed,
    breakShift,
  };
}

/** The derby bat: length, the knob's overhang past the fists, and wrist → fist along the forearm (ANIM-SURGICAL). */
const BAT_LEN = 0.86, BAT_KNOB_M = 0.08, BAT_PALM_M = 0.07;
/** Fists closer than this are one grip (the line between them is noise); further apart, they set the handle's line. */
const BAT_SPLIT_M = 0.05;
/** At most this share of the barrel's line comes from the fists; the rest is the swing's authored line. */
const BAT_HANDS_PULL = 0.7;

export const DerbyMode: ModeDefinition = (() => {
  let me: SpawnedCharacter, pitcher: SpawnedCharacter;
  let meAnim: BeatOwner, pitcherAnim: BeatOwner;
  /** The pitch is a beat: the ball leaves the hand on the release key, not at the wind-up. */
  let throwIn = 0; let pendingThrow: (() => void) | null = null;
  let bat: AbstractMesh | null = null;
  /** ANIM-SURGICAL: seconds since the swing started (null = loaded), and the per-frame bat placement. */
  let batSwingSec: number | null = null;
  let batObs: Observer<Scene> | null = null;
  let furniture: AbstractMesh[] = [];
  let ball: AbstractMesh, flight: Flight;
  let round = 0, pts = 0, stickX = 0, stickY = 0;
  /** The PCI, and where THIS pitch will cross the plate. */
  let pci: Reticle;
  let pitchAt = new Vector3(0, 1.1, 0);
  /** Slider break: lateral accel (m/s²) armed in the last 45% of flight. */
  let pitchBreakA = 0, pitchBreakV = 0, pitchT = 0, pitchTotalSec = 1;
  let pitchLabel = 'FB';
  let pitchSpeed = 14;
  let incoming = false, swung = false, ended = false;
  /** L4 — the crowd down the baselines. A derby is watched. */
  let gallery: Onlookers | null = null;
  let batPosture: { dispose(): void } | null = null, pitchPosture: { dispose(): void } | null = null;
  /** A pitch is on the way from the timer but has not been thrown yet. This is
   *  the re-entry guard; using `incoming` for it meant the whiff test — which
   *  now fires on a ball at rest — retriggered during the gap between pitches. */
  let pending = false;
  /** A+ mission #7 (MLB Home Run Derby presentation): the round is OUTS_CAP outs or TOTAL pitches, whichever first —
   *  a swing that is not a homer is an out. Ten pitches used to be the whole round; twenty is the cap now that outs end it. */
  const TOTAL = 30;   // FIELD-DEPTH W4: twenty pitches with ten outs ended in ~34 s
  let tally: DerbyTally = freshDerby();
  let rivalTarget = 0;                 // the rival's homers for the round, ticking in through it
  let homerLatch = false;              // A+ P0 juice: the homer's ONE punch per pitch
  const lastOut = (): boolean => tally.outs === OUTS_CAP - 1;
  // ── PARKOUR DERBY (owner brief, 2026-09-18: "Parkour Baseball"): wall targets and multiplier glass, the bat-flip vault
  // that fills the flow for a KINETIC swing, two fielders who run the wall and hang off the rail to rob hits. Pure reads in
  // core/ParkourDerby; the wall DECIDES a hit now (the swing used to decide it at contact and the flight was a picture).
  let flow = 0, flowAtSwing = 0, trickDone = false, hopT = -1, multiplier = 1;
  const targetsHit = new Set<string>(); const targetMeshes = new Map<string, AbstractMesh>();
  let hit: { q: number; launch: number; cover: number; clutch: boolean; distPts: number; cross: WallCross | null; rob: Rob; settled: boolean } | null = null;
  // A fielder gets a BeatOwner like every other body in this file: the derby's first cut drove their run/idle loops
  // with two raw `animator.play` calls, which is the exact discipline net-anim-tests guards (one owner per body, so a
  // beat can never be cut by a locomotion frame). `loop()` is per-frame safe and dedupes, so it is a drop-in.
  let fielders: { char: SpawnedCharacter; own: BeatOwner; bearing: number; home: Vector3; run: { bearing: number; t: number; total: number; mode: Rob; boost: number; h: number; to: Vector3 } | null; y: number; moving: boolean }[] = [];
  let token: { mesh: AbstractMesh; t: number; bearing: number; who: 'yours' | 'theirs' } | null = null;
  const park = { batFlips: 0, targetsHit: 0, robbed: 0, tokensYours: 0, tokensTheirs: 0 };
  let lastVerdict: Verdict | '' = '', lastDetail = '', settledRound = 0;
  // IMPROVE (2026-10-06, Derby #9 / #10): every delayed call goes through one bag dispose() clears, and every banner
  // through one channel — the token's, the settle's, the bat-flip's and the whiff's clears used to wipe each other.
  const timers = new TimerBag();
  let bannerCh: BannerChannel | null = null;
  /** #5: this derby's pitch sequence. */
  let seed = 0;
  /** #3: the last swing's miss, for the whiff's banner ('' when the pitch was taken or the swing connected). */
  let missLine = '';
  /** #17: the token's one material per load (dropToken made a PBR material per drop and mesh.dispose() left it). */
  let tokenMat: Material | null = null;
  /** #1: the target paint (two textures, two materials), disposed with the mode. */
  let targetMats: Material[] = [];
  /** #8: the approach ring that closes on the PCI as the ball comes into the window. */
  let cueRing: Mesh | null = null, cueMat: PBRMaterial | null = null, cueWasIn: boolean | null = null;
  /** #11: the hit's tracer. */
  let trail: ParticleSystem | null = null;
  // #13 / #14 / #16: scratch for the per-frame bat, fielder, posture and camera feeds (nothing allocated a frame).
  const ZERO_V = Vector3.Zero(), UP_V = Vector3.Up();
  const pitchAimAt = new Vector3();
  const bearingOf = (x: number, z: number) => (Math.atan2(x, z) * 180) / Math.PI;
  const onWall = (deg: number, r: number, y = 0, out = new Vector3()) => { const rad = (deg * Math.PI) / 180; return out.set(Math.sin(rad) * r, y, Math.cos(rad) * r); };
  /** The upper tier, the rail-bar, the pillars and the targets on the outfield wall. */
  function buildPark(ctx: ModeContext): void {
    const tierMat = VenueKit.paint(ctx.scene, 'park_tier_mat', '#2d5b45', 0.05, 0.85), railMat = VenueKit.paint(ctx.scene, 'park_rail_mat', '#d9d2c2', 0.08, 0.5), pillarMat = VenueKit.paint(ctx.scene, 'park_pillar_mat', '#4b5563', 0.05, 0.8);
    const tiers: Mesh[] = [], rails: Mesh[] = [], pillars: Mesh[] = [];
    for (const deg of [-40, -20, 0, 20, 40]) {
      const rad = (deg * Math.PI) / 180;
      const tier = MeshBuilder.CreateBox(`park_tier_${deg}`, { width: 13.4, height: PARK.wallTop - 3, depth: 0.5 }, ctx.scene);
      onWall(deg, PARK.wallR, 3 + (PARK.wallTop - 3) / 2, tier.position); tier.rotation.y = rad; tier.material = tierMat; tier.isPickable = false; tiers.push(tier);
      const rail = MeshBuilder.CreateCylinder(`park_rail_${deg}`, { diameter: 0.12, height: 13.2 }, ctx.scene);
      onWall(deg, PARK.wallR - 0.45, PARK.railY, rail.position); rail.rotation.z = Math.PI / 2; rail.rotation.y = rad; rail.material = railMat; rail.isPickable = false; rails.push(rail);
    }
    for (const deg of PARK.pillarBearings) {
      const pil = MeshBuilder.CreateCylinder(`park_pillar_${deg}`, { diameter: 0.6, height: PARK.wallTop }, ctx.scene);
      onWall(deg, PARK.wallR - 0.7, PARK.wallTop / 2, pil.position); pil.material = pillarMat; pil.isPickable = false; pillars.push(pil);
    }
    // IMPROVE (2026-10-06, Derby #18): the stadium is static — the outfield wall's five segments and the five tiers are one
    // mesh (two materials), the rails, the pillars and the foul poles another (three); both frozen. ~19 meshes → 2, the
    // same five material draws, no per-frame world matrices. The distance band keeps its own texture and stays apart.
    const isMesh = (m: AbstractMesh): m is Mesh => m instanceof Mesh;
    const wallSegs = furniture.filter((m): m is Mesh => isMesh(m) && m.name.startsWith('ofwall_') && m.name !== 'ofwall_band');
    const poles = furniture.filter((m): m is Mesh => isMesh(m) && m.name.startsWith('foulpole_'));
    const merge = (name: string, parts: Mesh[]): Mesh | null => {
      if (parts.length === 0) return null;
      const one = parts.length > 1 ? Mesh.MergeMeshes(parts, true, true, undefined, false, true) : parts[0];
      if (!one) { furniture.push(...parts); return null; }
      one.name = name; one.isPickable = false; one.freezeWorldMatrix();
      return one;
    };
    furniture = furniture.filter((m) => !wallSegs.includes(m as Mesh) && !poles.includes(m as Mesh));
    const wall = merge('park_wall', [...wallSegs, ...tiers]);
    const trim = merge('park_trim', [...rails, ...pillars, ...poles]);
    for (const m of [wall, trim]) if (m) furniture.push(m);
    // IMPROVE (2026-10-06, Derby #1): the targets are PAINTED on the wall — a decal projected onto the wall's own face, so
    // it sits flush and stops at the wall's top (WA-17 took out discs that floated in front of it and over the top, and
    // with them the only way to see a 100-point zone). One per target; a taken zone's paint goes (settleHit).
    targetMeshes.clear(); targetMats = [];
    if (wall) {
      const paintFor = (kind: WallTarget['kind']): PBRMaterial => {
        const tex = new DynamicTexture(`park_target_tex_${kind}`, { width: 256, height: 256 }, ctx.scene, true);
        const g = tex.getContext() as unknown as CanvasRenderingContext2D;
        g.clearRect(0, 0, 256, 256);
        const ring = (r: number, fill: string) => { g.beginPath(); g.arc(128, 128, r, 0, Math.PI * 2); g.fillStyle = fill; g.fill(); };
        if (kind === 'bullseye') { ring(126, '#ff2d78'); ring(96, '#fff7ed'); ring(66, '#ff2d78'); ring(36, '#fff7ed'); ring(14, '#ff2d78'); }
        else {
          // the multiplier glass: a gold rim (the token's gold), a pale-blue pane, a few cracks off the middle — no lettering,
          // which a projected decal can mirror
          ring(126, '#ffd75e'); ring(112, 'rgba(154,215,255,0.75)');
          g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 4;
          for (const a of [0.3, 1.5, 2.6, 3.9, 5.1]) { g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.cos(a) * 108, 128 + Math.sin(a) * 108); g.stroke(); }
        }
        tex.hasAlpha = true; tex.update();
        // unlit PBR: paint reads as its own colour under the 2.6 directional (a StandardMaterial clips it — the ratchet's rule)
        const m = new PBRMaterial(`park_target_mat_${kind}`, ctx.scene);
        m.unlit = true; m.albedoTexture = tex; m.useAlphaFromAlbedoTexture = true; m.zOffset = -2; m.backFaceCulling = false;
        targetMats.push(m);
        return m;
      };
      const mats = { bullseye: paintFor('bullseye'), glass: paintFor('glass') };
      for (const tg of TARGETS) {
        const rad = (tg.bearingDeg * Math.PI) / 180;
        const decal = MeshBuilder.CreateDecal(`park_target_${tg.id}`, wall, {
          position: onWall(tg.bearingDeg, PARK.wallR - 0.25, tg.y),
          normal: new Vector3(-Math.sin(rad), 0, -Math.cos(rad)),   // the face looks back at the plate
          size: new Vector3(tg.r * 2, tg.r * 2, 1.2), cullBackFaces: true,
        });
        decal.material = mats[tg.kind]; decal.isPickable = false; decal.freezeWorldMatrix();
        furniture.push(decal); targetMeshes.set(tg.id, decal);
      }
    }
  }
  function tickFielders(dt: number): void {
    for (const f of fielders) {
      const root = f.char.root; let target = f.home; let speed: number = PARK.fielderSpeed;
      if (f.run) {
        // IMPROVE (2026-10-06, Derby #14): the run's wall spot is worked out once, when the run is set (runTo), and every
        // distance below is scalars — this ran onWall + four Vector3s per fielder per frame.
        f.run.t += dt; target = f.run.to; speed *= f.run.boost;
        const d0 = Math.hypot(root.position.x - target.x, root.position.z - target.z);
        if (d0 < 1.6 && f.run.mode) { const want = f.run.mode === 'hang' ? PARK.railY - 0.6 : Math.min(4.6, Math.max(0.6, f.run.h - 0.4)); f.y += (want - f.y) * Math.min(1, dt * 7); }
        if (f.run.t > f.run.total + 1.3) f.run = null;
      } else f.y += (0 - f.y) * Math.min(1, dt * 4);
      const dx = target.x - root.position.x, dz = target.z - root.position.z; const dist = Math.hypot(dx, dz);
      if (dist > 0.3) { const k = Math.min(dist, speed * dt) / dist; root.position.x += dx * k; root.position.z += dz * k; root.rotation.y = Math.atan2(dx, dz); if (!f.moving) { f.moving = true; f.own.loop(SPORT_CLIP.moveLoop, { fadeSec: 0.15 }); } }
      else if (f.moving) { f.moving = false; f.own.loop(SPORT_CLIP.idle, { fadeSec: 0.2 }); root.rotation.y = Math.PI + (f.bearing * Math.PI) / 180; }
      root.position.y = f.y;
    }
  }
  /** A fielder's run to the wall at `bearing` (#14: the spot is computed here, once). */
  const runTo = (bearing: number, total: number, mode: Rob, boost: number, h: number): NonNullable<typeof fielders[number]['run']> =>
    ({ bearing, t: 0, total, mode, boost, h, to: onWall(bearing, PARK.wallR - 1.4) });
  /** The multiplier glass shattered: the token drops at the wall's base and the nearest fielder goes for it. */
  function dropToken(ctx: ModeContext, tg: WallTarget): void {
    if (token) token.mesh.dispose();
    const mesh = MeshBuilder.CreateBox(`park_token_${tg.id}`, { size: 0.5 }, ctx.scene); onWall(tg.bearingDeg, PARK.wallR - 1.6, 0.35, mesh.position); mesh.rotation.y = Math.PI / 4;
    mesh.material = tokenMat ??= VenueKit.paint(ctx.scene, 'park_token_mat', '#ffd75e', 0.6, 0.3); mesh.isPickable = false;
    const who = multiplierScramble(tg.bearingDeg, fielders.map((f) => f.bearing));
    token = { mesh, t: 0, bearing: tg.bearingDeg, who };
    const nearest = fielders.reduce<typeof fielders[number] | null>((b, f) => !b || Math.abs(f.bearing - tg.bearingDeg) < Math.abs(b.bearing - tg.bearingDeg) ? f : b, null);
    if (nearest) nearest.run = runTo(tg.bearingDeg, TOKEN.graceSec, null, 1, 0);
    bannerCh?.flash('GLASS SHATTERED — the x2 is on the ground!', 900);
    console.info(`[PARK] token dropped at ${tg.bearingDeg}° → ${who}`);
  }
  function tickToken(ctx: ModeContext, dt: number): void {
    if (!token) return;
    token.t += dt; token.mesh.rotation.y += dt * 3;
    if (token.t < TOKEN.graceSec) return;
    if (token.who === 'theirs') { park.tokensTheirs++; bannerCh?.flash('THEY GOT THE x2 — hit the far glass', 900); }
    else { park.tokensYours++; multiplier = TOKEN.mult; ctx.setHud({ mult: `x${multiplier} NEXT` }); bannerCh?.flash('x2 IS YOURS — the next hit pays double', 900); SoundKit.play('powerUp', { pitch: 1.2 }); }
    token.mesh.dispose(); token = null;
  }
  /** #2: the rival's homers so far — by pitches OR outs, whichever is further through the round. */
  const rivalSoFar = (): number => Math.round(rivalTarget * rivalProgress(derbyProgress(round, tally.outs, TOTAL, OUTS_CAP)));
  /** #2: the round is over — the rival's full round goes up, the verdict against it is called (after the last play's own
   *  banner has had `verdictAfterMs` to read), then the end card. The outcome stays DERBY_END (the Story's and the
   *  results' reads of it are unchanged); `beatRival` carries the verdict to the card. */
  function endDerby(ctx: ModeContext, pitchCount: number, verdictAfterMs: number): void {
    ended = true; SoundKit.play('whistle');
    const verdict = rivalVerdict(tally.homers, rivalTarget);
    ctx.setHud({ rivalHomers: rivalTarget });
    const call = () => bannerCh?.flash(rivalLine(tally.homers, rivalTarget), 2000);
    if (verdictAfterMs > 0) timers.later(call, verdictAfterMs); else call();
    console.info(`[DERBY-END] homers ${tally.homers} outs ${tally.outs} pts ${pts} rival ${rivalTarget} ${verdict}`);
    timers.later(() => ctx.end('DERBY_END', pts, { pitches: pitchCount, homers: tally.homers, outs: tally.outs, longestFt: tally.longestFt, rivalHomers: rivalTarget, beatRival: verdict === 'WIN' ? 1 : 0 }), verdictAfterMs + 1200);
  }
  /** #8: the cue's colours (waiting, in the window), its lead before the window opens, and how wide it starts. */
  const CUE_WAIT = '#ffb020', CUE_LEAD_SEC = 0.6, CUE_GROW = 1.4;
  const cueWaitC = Color3.FromHexString(CUE_WAIT), cueInC = Color3.FromHexString('#34e89e');
  /** #8: the approach ring rides the PCI while a released pitch comes in unswung; nothing allocated a frame. */
  function tickCue(): void {
    if (!cueRing || !cueMat) return;
    const c = incoming && !swung && throwIn <= 0 && flight.active ? contactCue(ball.position.z, 0.3, pitchSpeed, 0.15, CUE_LEAD_SEC) : null;
    if (!c || !c.show) { if (cueRing.isEnabled()) cueRing.setEnabled(false); return; }
    if (!cueRing.isEnabled()) cueRing.setEnabled(true);
    cueRing.position.copyFrom(pci.pos);
    cueRing.scaling.setAll(1 + CUE_GROW * (1 - c.fill));
    if (cueWasIn !== c.inWindow) { cueWasIn = c.inWindow; cueMat.albedoColor.copyFrom(c.inWindow ? cueInC : cueWaitC); }
  }
  /** The wall decided: the zone, the glove, the top of the wall, or the track (was the swing's own verdict at contact). */
  function settleHit(ctx: ModeContext, verdict: Verdict): void {
    const h = hit; if (!h || h.settled) return; h.settled = true; hit = null;
    const { q, launch, cover, clutch, distPts } = h;
    const homer = verdict === 'homer';
    const actual = { bearingDeg: bearingOf(ball.position.x, ball.position.z), h: ball.position.y };
    const tg = verdict === 'target' ? targetHit(actual, TARGETS, targetsHit) : null;
    const mult = multiplier; if (homer || tg) multiplier = 1;
    lastVerdict = verdict; lastDetail = `h ${actual.h.toFixed(1)} m at ${actual.bearingDeg.toFixed(0)}°${h.rob ? ' rob:' + h.rob : ''}${tg ? ' ' + tg.id : ''}`; settledRound = round;
    ctx.feel?.impact?.(homer ? 0.3 + q * 0.5 : tg ? 0.5 : 0.4);
    if (homer && !homerLatch) { homerLatch = true; ctx.juice.hitStop(60); ctx.juice.shake(0.14, 160); ctx.juice.flash('#FFD700', 130); console.info('[DERBY-JUICE] homer punch'); }
    else if (!homer) console.info(`[DERBY-JUICE] ${verdict} (clank weight)`);
    // IMPROVE (2026-10-06, Derby #4): the feet are the flight's — where this ball, at the wall, comes down (the arc Flight
    // is flying it on, projected to the grass). `300 + q × (80 + launch × 60) × 1.6` was not tied to it, and read 300+ FT
    // over a wall that says 124 FT on it. Points are untouched (distPts): this is the distance line and longestFt only.
    const distFt = homer ? homerFeet(ball.position, flight.vel, PARK.g) : 0;
    let gained = 0; let roundOver = false;
    if (tg) {
      gained = tg.pts * mult; pts += gained; park.targetsHit++; targetsHit.add(tg.id);
      const m = targetMeshes.get(tg.id); if (m) m.setEnabled(false);   // #1: the zone's paint goes with it
      EffectsKit.burst(ctx.scene, ball.position.clone(), tg.kind === 'glass' ? 'sparks' : 'confetti');
      SoundKit.play('score', { pitch: 1.3 }); if (tg.kind === 'glass') SoundKit.play('clang', { pitch: 1.5, volume: 0.6 });
      if (tg.kind === 'glass') dropToken(ctx, tg);
    } else {
      gained = homer ? distPts * mult : 0; pts += gained;
      roundOver = bankSwing(tally, homer, distFt);
      if (verdict === 'robbed') { park.robbed++; SoundKit.play('crowdGroan', { volume: 0.5 }); }
    }
    if (homer) SoundKit.play('score', { pitch: q > 0.85 ? 1.2 : 1 }); else if (!tg) SoundKit.play('impact', { pitch: 1.35, volume: 0.4 });
    gallery?.cheer(homer || tg ? q : 0.2);
    const x = mult > 1 ? ` (x${mult})` : '';
    const banner = tg ? `${tg.kind === 'glass' ? 'GLASS SHATTERED' : 'BULLSEYE'}! +${gained}${x}`
      : homer ? (clutch ? `CLUTCH DINGER! +${gained}` : q > 0.85 ? `DINGER! +${gained}` : `HOMER +${gained}`) + x
      : verdict === 'robbed' ? (h.rob === 'hang' ? 'ROBBED — HANGING OFF THE RAIL!' : 'ROBBED AT THE WALL!')
      : verdict === 'wall' ? 'OFF THE WALL — caught' : `OUT — ${cover >= 0.5 ? 'caught on the track' : 'weak contact'}`;
    // #2: the rival's line moves on an out as well as a pitch
    ctx.setHud({ score: pts, homers: tally.homers, outs: tally.outs, longest: tally.longestFt, rivalHomers: rivalSoFar(), distance: homer ? distanceLine(distFt, tally.longestFt) : '', targets: `${park.targetsHit}/${TARGETS.length}`, mult: multiplier > 1 ? `x${multiplier} NEXT` : '' });
    bannerCh?.flash(banner, 900);
    console.info(`[PARK] ${verdict} ${lastDetail} +${gained}${homer ? ` ${distFt} ft` : ''}`);
    if (roundOver) endDerby(ctx, round, 700);
  }

  // THE BATTING CAMERA LOOKS OUT TO THE OUTFIELD (owner, 2026-09-15: "face outfield so we can see the pitcher and our
  // player from over the shoulder so we can time the pitch"). setFixedBehind(batter, π) parked the lens at z +4.2 —
  // BETWEEN the batter and the mound, looking back at the plate — so the pitcher was behind the camera and the pitch
  // arrived from off-screen: the one thing a hitter times off was the one thing you could not see. The lens now sits
  // behind the plate, off the batter's back shoulder (the batter stands at x −0.7 facing +x, so his back is −x), low
  // enough to read the release point, and aims down the pitch line: the batter frames the left of the shot, the
  // pitcher and the whole flight of the ball sit in the middle. The aim point is steady (PITCHER_VIEW) rather than the
  // moving ball — the 0.4 lerp onto a 17 m/s pitch is what used to drag the batter out of frame.
  const BATTING_CAM = new Vector3(-1.75, 1.85, -3.4);
  /** IMPROVE (2026-10-06, Derby #15): the PCI readout is a driver's seam — two toFixed and a HUD push every frame of every
   *  pitch, for nobody in production. */
  const DEV_PCI = process.env.NODE_ENV === 'development';
  const PITCHER_VIEW = new Vector3(0, 1.45, 18);
  function battingCam(ctx: ModeContext, snap: boolean): void {
    ctx.camDirector.setFixed(BATTING_CAM, 1.25, snap);
    if (snap) ctx.camera.setTarget(Vector3.Lerp(me.root.position.add(new Vector3(0, 1.25, 0)), PITCHER_VIEW, 0.4));   // once a pitch: a fresh vector, which a camera may keep
  }

  function pitch(ctx: ModeContext): void {
    round++;
    swung = false; incoming = true;
    homerLatch = false;                // A+ P0: one homer punch per pitch
    hit = null;                        // PARKOUR DERBY: the wall has nothing pending
    // (#12: the warm-up's one-a-pitch latch resets when the last pitch is over — the set — not here, so a flip in the set
    // carries into this pitch's wind-up as its one trick)
    missLine = ''; trail?.stop();      // #3 / #11: the last swing's miss and tracer are over
    ctx.setHud({ flow, targets: `${park.targetsHit}/${TARGETS.length}`, mult: multiplier > 1 ? `x${multiplier} NEXT` : '' });
    ctx.heroRef.current = me.root;   // back to the batter (see contact branch)
    // CUT, don't ease — the follow cam ends a dinger forty metres downfield,
    // and easing back spent ~2s with the batter off-frame (the residual
    // FEL-FRAME). snap=true is a hard cut to the swing camera's fixed spot;
    // snapTo() can't reproduce it (it computes its own behind-vector).
    battingCam(ctx, true);
    // EVERY PITCH USED TO ARRIVE AT THE SAME SPOT — same origin, same velocity —
    // so there was nothing to read and nothing for a PCI to cover. Location now
    // varies across the zone, and the pitch is aimed AT that location so the
    // ball genuinely arrives where the hitter has to have guessed.
    // (D2, this pass: pitchSpec adds the movement read — sliders break late,
    // changeups take speed off. The pitch aims at the PRE-break spot; the
    // break lands it at `arrive`, which is where the PCI must actually be.)
    const spec = pitchSpec(round, seed);   // #5: this session's sequence
    // The slider comes from a three-quarter slot; the changeup deliberately
    // shares the fastball's look (the ball flight is the tell, not the arm).
    pitcherAnim.beat(spec.type === 'slider' ? SPORT_CLIP.derbyPitchSide : SPORT_CLIP.derbyPitch, { fadeSec: 0.1 });
    pitchAt = spec.arrive.clone();
    pitchBreakA = spec.breakShift === 0 ? 0
      : (2 * spec.breakShift) / Math.pow(0.45 * (17.5 / spec.speed), 2);
    pitchT = 0; pitchBreakV = 0;
    pitchTotalSec = 17.5 / spec.speed;
    pitchLabel = spec.label;
    pitchSpeed = spec.speed;
    const aim = spec.aim;
    ball.position.set(aim.x * 0.4, 1.5, 17.5);
    const travel = aim.subtract(ball.position);
    const t = pitchTotalSec;
    const vel = new Vector3(travel.x / t, travel.y / t + 3.0, -spec.speed);
    throwIn = PITCH_RELEASE_SEC;   // the ball waits in the hand through the leg lift; update() releases it
    pendingThrow = () => flight.launch(ball.position, vel);
    const clutch = round === TOTAL || lastOut();
    ctx.setHud({
      round: `PITCH ${round}`,
      // IMPROVE (2026-10-06, Derby #7): the pitch's name is NOT on the board while it is coming — the design says no banner
      // tells you a change-up, and this chip did. It goes up when the pitch resolves (the swing's contact line, the whiff).
      pitch: '',
      homers: tally.homers, outs: tally.outs, outsCap: OUTS_CAP, longest: tally.longestFt, rivalHomers: rivalSoFar(), distance: '',
      contact: '',                              // last pitch's grade is over
      hint: clutch ? `FINAL PITCH — STRIKE as it crosses the plate` : 'STRIKE as it crosses the plate · read the break',
    });
    // the dev HUD dump carries the real PCI position so drivers can CLOSE
    // THE LOOP instead of integrating their own (the open-loop model
    // drifted enough that the covering bot once lost to the blind control)
    if (DEV_PCI) ctx.setHud({ pci: `${pci.pos.x.toFixed(2)},${pci.pos.y.toFixed(2)}` });
  }

  return {
    modeId: 'baseball', mood: 'goldenHour', camPreset: 'court',

    async load(ctx: ModeContext) {
      derbyVenue = mountVenue(ctx, 'derby', { keepGameplayCamera: true, look: readPlaceLook('derby') });   // PLACE
      if (!derbyVenue) VenueKit.buildField(ctx.scene, 'ballpark');   // spec first, kit fallback
      EffectsKit.ambient(ctx.scene, 'park');
      furniture = buildPlateAndMound(ctx.scene);
      // Phase 6 — the ballpark was a green plain with a mound: nothing for a
      // dinger to clear, nobody watching. The outfield wall (constant 38m
      // from the plate, foul poles, distance band) is what a home run clears;
      // the baseline crowds are who it clears it in front of.
      furniture.push(...buildBallparkOutfield(ctx.scene));
      buildPark(ctx);   // PARKOUR DERBY: the upper tier, the rail, the pillars, the targets
      gallery = new Onlookers(ctx.scene, [
        // first-base line (in-frame right of the pitch line) and third-base
        // line — flanking the infield view, outside the widest pitch (|x|<1)
        ...[0, 1, 2, 3, 4, 5].map((i) => new Vector3(6.5 + i * 0.9, 0, 3 + i * 1.4)),
        ...[0, 1, 2, 3, 4, 5].map((i) => new Vector3(-6.5 - i * 0.9, 0, 3 + i * 1.4)),
        // IMPROVE (2026-10-06, Derby #19): six bodies (twelve spots, every other one), parked while off-screen — the follow
        // cam on a hit and the outfield leave them all out of frame (Tennis's opt-in, Onlookers.pauseOffscreen).
      ], undefined, undefined, { pauseOffscreen: true });
      me = await spawnAthlete(ctx, CFG.heroUrl, new Vector3(-0.7, 0, 0), Math.PI / 2, SPORT_CLIP.derbyStance);
      meAnim = new BeatOwner(me.animator); meAnim.loop(SPORT_CLIP.derbyStance);
      // The bat (Phase 6, 2026-09-03): the stance and swing are real now; the
      // hands were empty.
      // ANIM-SURGICAL (2026-09-14): NOT a hand prop any more. It was a RightHand child with one grip solved after 8 stance
      // frames from that bone's world rotation — which on the x-mirrored runtime rig is not the rotation to solve in (the
      // barrel hung DOWN through the fists on the kit body, dev :3061), and a grip fixed to one wrist left the lead hand off
      // the handle on the scan body and swung the barrel along the wrist bone's own axes (the eye's "bat detach / mis-grip").
      // A two-handed bat is placed every frame instead: the handle through BOTH fists, the barrel along the swing's authored
      // line (anim/authored/baseball BAT_LINE) in the batter's root frame. After the clips and the posture layer have run.
      {
        const lh = boneNode(me.skeleton, 'LeftHand'), rh = boneNode(me.skeleton, 'RightHand');
        const lf = boneNode(me.skeleton, 'LeftForeArm'), rf = boneNode(me.skeleton, 'RightForeArm');
        const lsh = boneNode(me.skeleton, 'LeftArm'), rsh = boneNode(me.skeleton, 'RightArm');
        /** ANIM-RESIDUAL (2026-09-14): which way the batter's RIGHT really lies along the root's +x — +1 or −1, latched from
         *  the shoulders on the stance before any swing turns them; 0 until it reads. See the root → world line below. */
        let rightSign = 0;
        if (lh && rh) {
          bat = MeshBuilder.CreateCylinder('derby_bat', { height: BAT_LEN, diameterTop: 0.065, diameterBottom: 0.03, tessellation: 12 }, ctx.scene);
          const bm = new StandardMaterial('derby_bat_m', ctx.scene);
          bm.diffuseColor = Color3.FromHexString('#c9a06a'); bm.specularColor = Color3.Black();
          bat.material = bm;
          bat.rotationQuaternion = new Quaternion();
          const batRef = bat, meRef = me;
          // IMPROVE (2026-10-06, Derby #13): the placement runs every frame, so it writes into these — it allocated ~8
          // Vector3s a frame (clone, subtract, add, new Vector3, toEulerAngles, Vector3.Up()).
          const sL = new Vector3(), sR = new Vector3(), sAlong = new Vector3(), sGrip = new Vector3(), sDir = new Vector3(), sSpan = new Vector3(), sEuler = new Vector3();
          /** The fist, not the wrist: a hand bone's origin is the wrist, the handle sits a palm further along the forearm line. */
          const fist = (hand: typeof lh, fore: typeof lf, out: Vector3): Vector3 => {
            hand.computeWorldMatrix(true);
            out.copyFrom(hand.getAbsolutePosition());
            if (!fore) return out;
            fore.computeWorldMatrix(true);
            const along = out.subtractToRef(fore.getAbsolutePosition(), sAlong);
            return along.lengthSquared() > 1e-8 ? out.addInPlace(along.normalize().scaleInPlace(BAT_PALM_M)) : out;
          };
          batObs = ctx.scene.onBeforeRenderObservable.add(() => {
            if (batRef.isDisposed()) return;
            const fL = fist(lh, lf, sL), fR = fist(rh, rf, sR);
            const grip = fL.addToRef(fR, sGrip).scaleInPlace(0.5);
            const d = batLineAt(batSwingSec);
            const yaw = meRef.root.rotationQuaternion ? meRef.root.rotationQuaternion.toEulerAnglesToRef(sEuler).y : meRef.root.rotation.y;
            // root → world: +x = (cos, 0, -sin), +z forward = (sin, 0, cos) — the axes the hand targets are authored in.
            // ANIM-RESIDUAL: +x is NOT the batter's right on the runtime rig. Measured on dev :3061 (/dev/mode/derby, kit body):
            // RightArm at −0.20 and LeftArm at +0.13 along this +x, both fists at −0.23 by the right shoulder (the clip's
            // mirroring put them there), and the barrel laid off toward +x — up from the right-shoulder hands, ACROSS the
            // face: 2 cm from the head's centre on the median stance frame, inside 9 cm of the spine on 874 of 918 (the eye's
            // "batBleed, bat through the torso/shoulder"). The side is read off the body, not assumed.
            if (rightSign === 0 && lsh && rsh && batSwingSec == null) {
              const across = rsh.getAbsolutePosition().subtract(lsh.getAbsolutePosition());
              rightSign = batRightSign(across.x, across.z, yaw);
              if (rightSign !== 0) console.info(`[DERBY-BAT] batter's right is ${rightSign > 0 ? '+' : '−'}x on this rig`);
            }
            const dx = d[0] * (rightSign || 1);
            const dir = sDir.set(dx * Math.cos(yaw) + d[2] * Math.sin(yaw), d[1], -dx * Math.sin(yaw) + d[2] * Math.cos(yaw));
            // Hands that come apart through the swing lie ON the handle, so the line between the fists pulls the handle
            // onto it (signed along the authored line). Measured on the first cut: fists 6 cm off the axis at the swing
            // median, 29 of 66 swing frames past 8 cm. A full pull fixed the grip but let a stacked pair of fists tip the
            // barrel into the dirt (14 swing frames below −0.3); at 0.7 the fists stay on the handle (2.9 cm median, none past
            // 8 cm) and the barrel only dips ≤ 27° at the launch and through the zone, the way a real swing's does.
            const span = fR.subtractToRef(fL, sSpan); const sep = span.length();
            if (sep > BAT_SPLIT_M) {
              span.scaleInPlace((Vector3.Dot(span, dir) < 0 ? -1 : 1) / sep);
              const k = BAT_HANDS_PULL * Math.min(1, (sep - BAT_SPLIT_M) / 0.08);
              dir.scaleInPlace(1 - k).addInPlace(span.scaleInPlace(k)).normalize();
            }
            Quaternion.FromUnitVectorsToRef(UP_V, dir, batRef.rotationQuaternion!);
            // the cylinder is centred on its origin: the knob just past the fists, the barrel out along the line
            batRef.position.copyFrom(grip.addInPlace(dir.scaleInPlace(BAT_LEN / 2 - BAT_KNOB_M)));
          });
        }
      }
      pitcher = await spawnFoe(ctx, CFG.heroUrl, new Vector3(0, 0.35, 18), Math.PI, SPORT_CLIP.idle);
      pitcherAnim = new BeatOwner(pitcher.animator); pitcherAnim.loop(SPORT_CLIP.idle);
      // PARKOUR DERBY: two fielders on the track, and the dev seam
      for (const f of fielders) f.char.dispose(); fielders = []; targetsHit.clear(); flow = 0; multiplier = 1; token = null; hit = null; Object.assign(park, { batFlips: 0, targetsHit: 0, robbed: 0, tokensYours: 0, tokensTheirs: 0 }); lastVerdict = ''; lastDetail = ''; settledRound = 0;
      for (const bearing of PARK.fielderBearings) {
        const home = onWall(bearing, PARK.fielderR);
        const char = await spawnFoe(ctx, CFG.heroUrl, home.clone(), Math.PI + (bearing * Math.PI) / 180, SPORT_CLIP.idle);
        fielders.push({ char, own: new BeatOwner(char.animator), bearing, home, run: null, y: 0, moving: false });
      }
      seed = derbySeed();   // #5: a new pitch sequence each derby (one value: the dev state carries it, pitchSpec(r, seed) re-reads it)
      if (process.env.NODE_ENV === 'development') {
        (ctx.scene.metadata ??= {}).baseball = {
          state: () => ({ round, seed, incoming, throwIn, swung, ended, ballZ: ball.position.z, ballY: ball.position.y, pciX: pci.pos.x, pciY: pci.pos.y, pitchAtX: pitchAt.x, pitchAtY: pitchAt.y, flow, flowAtSwing, multiplier, ...park, homers: tally.homers, outs: tally.outs, pts, lastVerdict, lastDetail, settledRound, hitPending: !!hit && !hit.settled, fielders: fielders.map((f) => ({ x: f.char.root.position.x, z: f.char.root.position.z, y: f.y, run: f.run ? f.run.mode : null })) }),
        };
      }
      throwIn = 0; pendingThrow = null;
      pci = new Reticle(ctx.scene, new Vector3(0, 1.1, 0.2), { x: ZONE_HALF.x, y: ZONE_HALF.y });
      // HOTFIX (2026-09-24): the PCI ring used to draw edge-on, a glowing cyan stick beside the fists, a second 'bat' (the eye's
      // bat-detach frames, ANIM-SURGICAL). The shared Reticle stands its ring up itself now (aimSwingCore); a second bake here would lay it flat again.
      ctx.heroRef.current = me.root;
      ball = MeshBuilder.CreateSphere('bball', { diameter: 0.12 }, ctx.scene);
      // IMPROVE (2026-10-06, Derby #11): a 12 cm default-grey sphere was hard to pick up off the bat and lost down the line.
      // A lit white that holds its white on the grass (golf's ball paint), and a tracer from the bat to where it lands.
      ball.material = VenueKit.paint(ctx.scene, 'derby_ball_m', '#f7f7f2', 0.45, 0.35); ball.isPickable = false;
      trail = EffectsKit.ballTrail(ctx.scene, ball, '#fff4cf'); trail.stop();
      // #8: the contact cue — a ring around the PCI that closes onto it as the ball comes into the ±0.15 s window and
      // turns green while a swing would connect (the window was invisible; tennis and volleyball draw their bands).
      cueRing = MeshBuilder.CreateTorus('derby_cue', { diameter: 0.62, thickness: 0.035, tessellation: 32 }, ctx.scene);
      cueRing.bakeTransformIntoVertices(Matrix.RotationX(Math.PI / 2));   // stood up once, like the Reticle's own ring
      cueRing.billboardMode = 7; cueRing.isPickable = false; cueRing.setEnabled(false);
      cueMat = new PBRMaterial('derby_cue_m', ctx.scene);
      cueMat.unlit = true; cueMat.albedoColor = Color3.FromHexString(CUE_WAIT); cueMat.alpha = 0.9;
      cueRing.material = cueMat; cueWasIn = null;
      flight = new Flight(ball, -6);
      ctx.objectiveRef.current = ball.position;
      battingCam(ctx, true);
      assertSpawned(ctx.scene, { hero: me.root, minWorldMeshes: 5, modeId: 'baseball' });

      // THE BODY (2026-09-13). Derby mounted no posture layer at all, so a batter waited on a 14 m/s pitch
      // with his chest wherever the idle left it and his eyes on nothing. FieldPosture's batting chain is
      // wait → load → fire, and the thing it is really for is the HEAD: the clips key hips, legs and arms and
      // never the neck, so nobody in this mode was watching the ball.
      batPosture?.dispose();
      batPosture = mountPostureLayer(ctx.scene, me.skeleton, me.root, () => {
        const w = batWindow({
          incoming, swinging: swung && incoming, checked: false,
          // the load runs through the back half of the pitch's flight: you start your hands as it comes
          load01: incoming && pitchTotalSec > 0 ? Math.max(0, (pitchT / pitchTotalSec - 0.45) / 0.55) : 0,
        });
        const { pose, legs } = fieldPose(w);
        const at = ball ? ball.getAbsolutePosition() : new Vector3(0, 1.1, 6);
        return { pose, legs, aim: at, eyes: at, window: w };
      }, 'BAT-PP');
      pitchPosture?.dispose();
      pitchPosture = mountPostureLayer(ctx.scene, pitcher.skeleton, pitcher.root, () => {
        const w = throwIn > 0 ? 'pitch_set' : 'pitch_throw';
        const { pose, legs } = fieldPose(w);
        // #16: the batter's chest, in a scratch vector (this allocated two Vector3s every frame)
        const at = me ? pitchAimAt.copyFrom(me.root.position) : pitchAimAt.setAll(0); at.y += 1.1;
        return { pose, legs, aim: at, eyes: at, window: w };
      }, 'PITCH-PP');

      round = 0; pts = 0; ended = false; pending = false; trickDone = false; missLine = '';
      timers.clear(); bannerCh = new BannerChannel(timers, (text) => ctx.setHud({ banner: text }));
      SoundKit.startAmbient('stadium');
      tally = freshDerby(); rivalTarget = 3 + Math.floor(Math.random() * 6);   // a rival round of 3–8 homers
      ctx.setHud({ score: 0 });
      pitch(ctx);
    },

    onInput(ctx: ModeContext, e: FelInput) {
      SoundKit.unlock();
      if (e.t === 'stick' && e.side === 'L') { stickX = e.x; stickY = e.y; }
      // PARKOUR DERBY: B before the pitch is the BAT-FLIP VAULT — the warm-up trick that fills the flow for a KINETIC swing.
      // IMPROVE (2026-10-06, Derby #12): it opens in the SET (the gap between pitches) as well as the 0.52 s wind-up; the
      // wind-up alone was easy to miss and answered "WARM UP IN THE WIND-UP". Still one a pitch (DerbyLoop.batFlipRead).
      if (e.t === 'button' && e.btn === 'B' && e.pressed) {
        const flip = batFlipRead({ incoming, throwIn, pending, trickDone, ended });
        if (flip === 'ok') {
          trickDone = true; flow = flowTrick(flow, 'batflip'); park.batFlips++; hopT = 0;
          meAnim.beat(SPORT_CLIP.derbySwing, { fadeSec: 0.05, speedRatio: 1.7 });
          SoundKit.play('whoosh', { pitch: 1.4, volume: 0.4 }); ctx.setHud({ flow }); bannerCh?.flash(`BAT-FLIP VAULT — flow ${flow}`, 500);
          console.info(`[PARK] bat-flip vault → flow ${flow}`);
        } else refuse(ctx, flip === 'spent' ? 'ONE TRICK A PITCH' : 'WARM UP BEFORE THE PITCH');
        return;
      }
      // SCORECARD CONTROLS (2026-09-15): a swing between pitches was 28 % of the derby's presses and got nothing back
      if (e.t === 'button' && e.btn === 'A' && e.pressed && (!incoming || swung)) refuse(ctx, swung && incoming ? 'ONE SWING A PITCH' : 'WAIT FOR THE PITCH');
      if (e.t === 'button' && e.btn === 'A' && e.pressed && incoming && !swung) {
        swung = true;
        SoundKit.play('whoosh');
        meAnim.beat(SPORT_CLIP.derbySwing, { fadeSec: 0.06 });
        batSwingSec = 0;   // ANIM-SURGICAL: the bat's line runs on the swing's own clock
        // time against THIS pitch's speed — the window conversion divides by
        // speed, and a hardcoded 14 mistimed every fastball and change-up
        const timing = swingQuality(ball.position.z, 0.3, pitchSpeed, 0.3);
        if (timing <= 0) {
          // IMPROVE (2026-10-06, Derby #3): the swing is spent — say how it missed, now, and again on the whiff.
          missLine = timingMissLine(timingMiss(ball.position.z, 0.3, pitchSpeed, 0.15), throwIn <= 0);
          bannerCh?.flash(missLine, 900);
          console.info(`[DERBY] mistimed: ${missLine}`);
          return;
        }
        incoming = false;
        cueRing?.setEnabled(false);
        // CONTACT = TIMING x COVERAGE. Timing alone was the whole game; now
        // where you put the PCI matters as much as when you swing, which is the
        // mechanic the benchmark is named for.
        const off = Math.hypot(pci.pos.x - ball.position.x, pci.pos.y - ball.position.y);
        const cover = off <= PCI_PURE_M ? 1
          : Math.max(0, 1 - (off - PCI_PURE_M) / (PCI_MISS_M - PCI_PURE_M));
        const q = timing * (0.25 + 0.75 * cover);
        const clutch = round === TOTAL || lastOut();
        // Where you met the ball decides the launch: under it lifts, on top of
        // it drives the ball into the dirt. That is the PCI doing the job the
        // stick used to do by fiat.
        const meet = pci.pos.y - ball.position.y;
        const launch = Math.max(0.1, Math.min(0.9, 0.45 - meet * 1.1));
        // PARKOUR DERBY: the KINETIC swing — the flow the warm-up filled grows the exit speed; the WALL decides the hit
        // (settleHit), not the contact.
        // IMPROVE (2026-10-06, Derby #6): the bearing is timing (early pulls, late goes the other way) plus the STICK at the
        // swing, which nudges it toward a wall target (DerbyLoop.hitLateral, ±3 m/s ≈ ±5°). The comment always said the
        // stick aimed; the code rolled ±1 m/s of Math.random() instead, so the same swing went to different places.
        const ks = kineticSwing(flow / PARK_FLOW.full); flowAtSwing = flow; flow = 0;
        const side = swingSide(ball.position.z, 0.3, pitchSpeed, 0.3);
        const vx = hitLateral(side, stickX);
        flight.launch(ball.position, new Vector3(vx, (18 * launch * q + 4) * ks.exitMult, (16 + q * 18) * ks.exitMult));
        const distPts = Math.round(q * (80 + launch * 60) * (clutch ? CLUTCH_MULT : 1));
        const cross = predictWallCross({ x: flight.vel.x, y: flight.vel.y, z: flight.vel.z }, { x: ball.position.x, y: ball.position.y, z: ball.position.z });
        let rob: Rob = null;
        if (cross && !targetHit(cross, TARGETS, targetsHit)) for (const f of fielders) { const r = robRead(f.bearing, cross); const lo = Math.min(f.bearing, cross.bearingDeg), hi = Math.max(f.bearing, cross.bearingDeg); const boost = PARK.pillarBearings.some((b2) => b2 > lo && b2 < hi) ? PARK.pillarBoost : 1; f.run = runTo(cross.bearingDeg, cross.t, r, boost, cross.h); if (r && !rob) rob = r; }
        hit = { q, launch, cover, clutch, distPts, cross, rob, settled: false };
        console.info(`[PARK] swing q ${q.toFixed(2)} ${ks.label || 'plain'} x${ks.exitMult.toFixed(2)} → ${cross ? `wall in ${cross.t.toFixed(2)} s at ${cross.bearingDeg.toFixed(0)}° h ${cross.h.toFixed(1)}` : 'short'}${rob ? ' · ' + rob + ' coming' : ''}`);
        ctx.heroRef.current = ball;
        ctx.camDirector.mode = 'follow';
        trail?.start();   // #11: the tracer from the bat
        // #7: the pitch's name goes up now that it has resolved
        ctx.setHud({ contact: `${cover >= 0.9 ? 'PURE' : cover >= 0.5 ? 'OFF-CENTRE' : 'EDGE OF THE BAT'} · ${pitchLabel}${ks.label ? ' · ' + ks.label : ''}`, flow: 0, pitch: pitchLabel });
      }
    },

    update(ctx: ModeContext, dt: number) {
      if (batSwingSec != null) { batSwingSec += dt; if (batSwingSec > BAT_SWING_SEC + BAT_RECOVER_SEC) batSwingSec = null; }
      if (ended) return;
      if (throwIn > 0) {
        // the wind-up: the ball leaves the hand on the release key
        throwIn -= dt;
        if (throwIn <= 0 && pendingThrow) { pendingThrow(); pendingThrow = null; }
      }
      // The PCI is only yours to move while a pitch is on the way.
      if (incoming) {
        pci.update(dt, stickX, stickY);
        // stream the real reticle position (see the pitch() note: drivers
        // close the loop on this instead of integrating their own model) — #15: in development only
        if (DEV_PCI) ctx.setHud({ pci: `${pci.pos.x.toFixed(2)},${pci.pos.y.toFixed(2)}` });
      }
      tickCue();
      // the slider's LATE break — armed in the last 45% of the flight,
      // integrated as velocity so it bends rather than teleports
      if (incoming && flight.active && pitchBreakA !== 0) {
        pitchT += dt;
        if (pitchT > pitchTotalSec * 0.55) {
          pitchBreakV += pitchBreakA * dt;
          ball.position.x += pitchBreakV * dt;
        }
      }
      // PARKOUR DERBY: the bat-flip's hop, the fielders on the track, the token on the ground
      if (hopT >= 0) { hopT += dt; const u = Math.min(1, hopT / 0.45); me.root.position.y = Math.sin(u * Math.PI) * 0.5; if (u >= 1) { hopT = -1; me.root.position.y = 0; } }
      tickFielders(dt); tickToken(ctx, dt);
      const flying = flight.step(dt);
      if (hit && !hit.settled) {   // the wall decides
        const r = Math.hypot(ball.position.x, ball.position.z);
        if (r >= PARK.wallR) { const actual = { bearingDeg: bearingOf(ball.position.x, ball.position.z), h: ball.position.y }; settleHit(ctx, verdictFor(actual, targetHit(actual, TARGETS, targetsHit), hit.rob)); }
        else if (!flying) settleHit(ctx, 'short');
      }
      // A PITCH IS OVER WHEN IT IS OVER — past the plate OR come to rest.
      //
      // This waited for the ball to reach z <= -1.2, and the ball never gets
      // there: Flight stops it the moment it touches the ground, and with the
      // derby's gravity it lands at roughly z -0.6, just past the plate. So a
      // mistimed swing (or none at all) left `incoming` true forever with the
      // ball at rest, `flying` false, and the "next pitch" branch — which needs
      // !flying && !incoming — unreachable. THE MODE SOFT-LOCKED on the first
      // pitch you did not connect with.
      //
      // It survived play-testing because the generic capture bot swings on a
      // cadence and its first swing happened to connect. A driver that aims the
      // PCI and swings ONCE per pitch found it immediately.
      if (incoming && throwIn <= 0 && (ball.position.z <= -1.2 || !flight.active)) {
        incoming = false;
        SoundKit.play('miss');
        ctx.feel?.impact?.(0.35);   // A+ P0: a whiff is an out — clank-weight feel, no make punch
        console.info('[DERBY-JUICE] whiff (clank weight)');
        const whiffOut = bankSwing(tally, false);        // a whiff is an out
        // the whiff names the pitch — The Show tells you what beat you; #3: a swing that missed the window says by how much
        // first (it was the pitch type alone); #7: the pitch's name goes up on the board now; #2: the rival moves on the out
        const what = pitchLabel === 'SLD' ? 'the slider broke late' : pitchLabel === 'CHG' ? 'the change-up pulled the string' : 'beat you with heat';
        ctx.setHud({ outs: tally.outs, pitch: pitchLabel, rivalHomers: rivalSoFar() });
        bannerCh?.flash(`WHIFF — ${missLine ? `${missLine} · ` : ''}${what}`, 900);
        if (whiffOut) { endDerby(ctx, round, 700); return; }
      }
      if (!flying && !incoming && !pending) {
        if (round >= TOTAL) { endDerby(ctx, TOTAL, 0); return; }
        pending = true; trickDone = false;   // #12: the set — the next pitch's warm-up is open from here
        timers.later(() => { pending = false; if (!ended) pitch(ctx); }, 800);
      }
      // During the PITCH the fixed swing camera aims at where the pitch is
      // GOING (the strike zone), never at the moving ball: a 0.4 lerp onto a
      // 17 m/s pitch drags the aim point past the camera's own shoulder and
      // the batter leaves the frame on inside lines (measured: off RIGHT,
      // rounds 4–6, always mid-flight of the pitch). The broadcast read is
      // the zone; the ball comes to it. After contact the follow cam owns
      // the ball (see the contact branch) and this objective is moot.
      gallery?.update(dt);
      ctx.camDirector.update(me.root.position, ZERO_V, flying && !incoming ? ball.position : PITCHER_VIEW);   // a hit ball is followed; a pitch is watched from the plate (#16: a shared zero, not Vector3.Zero() a frame)
    },

    // IMPROVE (2026-10-06, Derby #9): ended = true and every pending timer cleared — the next pitch's setTimeout checked
    // only `!ended`, which dispose never set, so a pitch could be thrown into a torn-down scene.
    dispose() { ended = true; pending = false; timers.clear(); bannerCh = null; trail?.dispose(); trail = null; cueRing?.dispose(); cueRing = null; cueMat?.dispose(); cueMat = null; tokenMat?.dispose(); tokenMat = null; for (const m of targetMats) m.dispose(true, true); targetMats = []; pci?.dispose(); for (const f of fielders) f.char.dispose(); fielders = []; token?.mesh.dispose(); token = null; targetMeshes.clear(); batPosture?.dispose(); batPosture = null; pitchPosture?.dispose(); pitchPosture = null; derbyVenue?.dispose?.(); derbyVenue = null; gallery?.dispose(); gallery = null; if (batObs) { bat?.getScene().onBeforeRenderObservable.remove(batObs); batObs = null; } batSwingSec = null; bat?.dispose(); bat = null; me?.dispose(); pitcher?.dispose(); furniture.forEach((f) => f.dispose()); ball?.dispose(); SoundKit.stopAmbient(); },
  };
})();

// ═══════════════════════════════════════════════════════ PENALTY SHOOTOUT ══
export const PenaltyMode: ModeDefinition = (() => {
  let me: SpawnedCharacter, keeper: SpawnedCharacter;
  let meAnim: BeatOwner, keeperAnim: BeatOwner;
  let meDove = false, keeperDove = false;
  /** Your kick and their kick are beats: the ball leaves on the boot's contact key, not on the press / the run-up's end. */
  let kickIn = 0; let pendingKick: (() => void) | null = null;
  let keepKickIn = 0; let pendingKeepKick: (() => void) | null = null;
  /** Both keepers face −z, so world +x is their LEFT: the authored dive / hold / rise stretch to the keeper's right; a dive
   *  to +x plays the registered mirrors ('<clip>.M') — hold and rise on the SAME side as the dive, or the body flips over
   *  at the hold (measured 0.35–0.77 m). */
  const sided = (clip: string, sign: DiveSign): string => (sign > 0 ? `${clip}.M` : clip);
  const MIRRORED = [SPORT_CLIP.keeperDive, SPORT_CLIP.keeperDiveHold, SPORT_CLIP.keeperRise];
  /** The dive: stretch, then HOLD the stretch on the ground until the kick is decided. */
  const dive = (owner: BeatOwner, sign: DiveSign): void => { owner.beat(sided(SPORT_CLIP.keeperDive, sign), { fadeSec: 0.1 }); owner.loop(sided(SPORT_CLIP.keeperDiveHold, sign), { fadeSec: 0.2 }); };
  /** Off the ground through keeper_rise, settling into `then`. Called a beat AFTER the decision (RISE_DELAY_MS): the ball
   *  crosses the line 0.4 s after the boot, and a rise on the decision cut the dive before it stretched. */
  const rise = (owner: BeatOwner, sign: DiveSign, then: string): void => { owner.beat(sided(SPORT_CLIP.keeperRise, sign), { fadeSec: 0.12 }); owner.loop(then, { fadeSec: 0.25 }); };
  const RISE_DELAY_MS = 650;
  let meDiveSign: DiveSign = 0, keeperDiveSign: DiveSign = 0;
  let furniture: AbstractMesh[] = [];
  let ball: AbstractMesh, pball: SoccerBall, reticle: Reticle, meter: PowerMeter;
  let round = 0, goals = 0, stylePts = 0, stickX = 0, stickY = 0;
  /** The kick's SHAPE, read off the stick at the strike: across = curl, up = the chip. And what the frame said. */
  let frameKind: 'post' | 'bar' | null = null; let flightSec = 0;
  const prevBall = new Vector3();
  let weather: WeatherKit = new WeatherKit(); let weatherFx: WeatherFxHandle | null = null;
  const KEEPER_REACH = 0.9;
  // IMPROVE (2026-10-06, Penalty #10 / #11 / #9): every timeout in one bag dispose() clears; one banner channel, so the
  // strike label's clear no longer wipes the result banner that lands 0.4 s later (nor a wall run's, a slide's, a feint's);
  // the result beats after each kick held where A can skip them.
  const timers = new TimerBag();
  let bannerCh: BannerChannel | null = null;
  const resultBeat = new ResultBeat(timers);
  /** IMPROVE (2026-10-06, Penalty #20): game time (s), the sum of update()'s dt — the dive, the strike and the kinetic
   *  window are graded on it, so a hit-stop or a hitch between them cannot mis-grade a dive (performance.now() could). */
  let gameT = 0;
  /** IMPROVE (2026-10-06, Penalty #3): the kick's style — the breakaway, or the classic place kick from the spot. */
  let pensStyle: PensStyle = 'breakaway';
  /** This kick's pressure line (sudden death, score-or-out), kept so a Y switch keeps saying it. */
  let kickPressure: string | null = null;
  /** IMPROVE (2026-10-06, Penalty #14 / #15 / #17): scratch, so the ball's substeps and the run allocate nothing a frame. */
  const ZERO_V = Vector3.Zero(), RUN_V = new Vector3(), GLASS_N = new Vector3();
  // ── BREAKAWAY (owner brief, 2026-09-18): your kick is a RUN at the keeper from midfield on a shot clock — kinetic shot
  // stacking off a flow gauge, the bank off the glass, the rainbow flick, the slide-cancel curler; the keeper comes off
  // his line, slide-tackles, vaults for the top corners and parry-kicks a save back at you (an overdrive if you hit it
  // again). Pure reads in core/Breakaway; the shootout format around it (their kick, sudden death) is untouched.
  const brk = { lastAimX: 0, on: false, clock: 0, flow: 0, kineticAt: -1e9, run: { vx: 0, vz: 0 }, wall: 0 as 1 | -1 | 0, wallSec: 0, slideSec: -1, slideCool: 0, vaultT: -1, vault: null as { from: Vector3; dir: Vector3 } | null, counterLive: false, struck: false, shotKind: 'strike' as ShotKind, lastHigh: false, lastAimSign: 1, stylePts: 0, keeperSlide: null as { t: number; dir: Vector3 } | null, keeperCool: 0, hudClock: -1, hudFlow: -1, hudKin: '' };
  const brkStats = { shots: 0, wallRuns: 0, banks: 0, rainbows: 0, curlers: 0, overdrives: 0, kinetic: 0, slides: 0, tackled: 0, clocks: 0, parries: 0, rebounds: 0 };
  const me2 = () => ({ x: me.root.position.x, z: me.root.position.z });
  const vel2 = () => ({ x: brk.run.vx, z: brk.run.vz });
  /** The physics step every kick shares: wind through the air (the golf gain), the frame, the mesh. */
  function stepBall(dt: number): void {
    if (!pball.active) return;
    // IMPROVE (2026-10-06, Penalty #14): the same wind pull in components — it was a new Vector3 a frame plus a scale and a
    // subtract on every 240 Hz substep
    const w = weather.flightWind(); const windy = w.x * w.x + w.z * w.z > 0;
    const n = Math.max(1, Math.ceil(dt / (1 / 240))); const h = dt / n;
    for (let i = 0; i < n && pball.active; i++) {
      prevBall.copyFrom(pball.pos);
      if (!pball.rolling && windy) {
        const v = pball.vel; const k = WIND_GAIN * GRASS.dragK * Math.hypot(v.x - w.x, v.y, v.z - w.z) * h;
        v.x += w.x * k; v.z += w.z * k;
      }
      pball.step(h);
      if (brk.on && Math.abs(pball.pos.x) >= BREAK.glassX - 0.05) {   // BREAKAWAY: the side glass keeps the ball live (the bank rides this)
        const sx = Math.sign(pball.pos.x) || 1; pball.deflect(GLASS_N.set(-sx, 0, 0), 0.85); pball.pos.x = sx * (BREAK.glassX - 0.08); ball.position.x = pball.pos.x;
        brk.flow = flowAdd(brk.flow, FLOW.bank); SoundKit.play('clang', { pitch: 1.4, volume: 0.45 });
      }
      const hit = frameHit(prevBall, pball.pos);
      if (hit && !frameKind) { frameKind = hit.kind; pball.deflect(hit.normal, 0.62); SoundKit.play('clang', { pitch: hit.kind === 'bar' ? 0.9 : 1.1, volume: 0.8 }); }
    }
    flightSec += dt;
    if (flightSec > 5) pball.stop();
  }
  let goalLatch = false;               // A+ P0 juice: the goal's ONE punch per kick
  let phase: 'aim' | 'power' | 'flight' | 'keep' | 'break' = 'aim';
  let keeperTargetX = 0, ended = false;
  // THE KEEPER ROUND (owner decision 2026-09-03): on their kick you are the
  // keeper. The rival's body runs up with a tell, you dive, KeeperCore judges.
  let keepPlan: RivalKickPlan | null = null;
  let keepT = 0;                               // seconds into the rival's run-up
  /** IMPROVE (2026-10-06, Penalty #7 / #20): the call is ◀ / ▶ or ▼ stay / ▲ spring (KeeperCall); the instants are game time. */
  let keepStruck = false, keepStrikeAt = 0, keepCall: KeeperCall = 0, keepDiveAt: number | null = null;
  /** HOTFIX (2026-09-24): your kick is decided and their kick has not started (resolveKick → startKeeperRound, 1.2 s).
   *  resolveKick leaves phase 'aim' for that beat, and the old PLACE kick below read 'aim' as a fresh kick. */
  let betweenKicks = false;
  const SPOT = new Vector3(0, 0, 0), GOAL_LINE = new Vector3(0, 0, 10.4);
  let feints = 0, lastFlickSign = 0, lastFlickMs = 0;
  /** A+ mission #8 (FIFA read): every kick as a pip, both sides. */
  let myKicks: KickResult[] = [], theirKicks: KickResult[] = [];
  const kicksHud = () => ({ kicksYou: kickPips(myKicks, REGULATION_KICKS), kicksThem: kickPips(theirKicks, REGULATION_KICKS), goals, themGoals });
  /** L4 — the bank behind the goal. A shootout is watched. */
  let gallery: Onlookers | null = null;
  let strikerPosture: { dispose(): void } | null = null, keeperPosture: { dispose(): void } | null = null;
  // ── the shootout (D1/D2 built in the depth pass) ──
  /** The rival's goals — a shootout is against SOMEONE. Their kicks are
   *  simulated and revealed between yours (the numbers-only rival
   *  presentation 3PT's lock ruled acceptable — and here it is the format). */
  let themGoals = 0, themKicks = 0;
  // Owner decision (2026-09-05): sudden death caps at SD_CAP rounds. Still level after that, STYLE decides (the rival has
  // no style mechanic, so any banked style wins it); no style → the side with the LATER save; no saves at all → nerve:
  // the kicker who kept converting under the cap. Before this, two sides that kept converting never finished (52–52).
  const SD_CAP = 5; let lastSaveBy: 'you' | 'them' | null = null;
  /** Your placement history (sign of reticle x per kick) — the keeper READS it. */
  let shotHistory: number[] = [];
  const hintFlags = { read: false };           // don't re-fire the warning every frame
  const MAX_FEINTS = 2;
  const FEINT_KEEPER_SHIFT = 0.12;               // each feint: keeper guesses wrong this much more
  const FEINT_WOBBLE = 0.25;                     // ...and the shot wobbles this much more
  const FEINT_STYLE_PTS = 8;                     // banked per feint, paid only on a goal
  /** Kicks you've taken === round. Regulation is REGULATION_KICKS each, then
   *  sudden death until a round splits. */

  // ── BREAKAWAY helpers ────────────────────────────────────────────────────────────────────────────────────────────
  function startBreakaway(ctx: ModeContext, pressure: string | null = null): void {
    phase = 'break'; Object.assign(brk, { on: true, clock: BREAK.clockSec, flow: 0, kineticAt: -1e9, run: { vx: 0, vz: 0 }, wall: 0, wallSec: 0, slideSec: -1, slideCool: 0, vaultT: -1, vault: null, counterLive: false, struck: false, shotKind: 'strike', lastHigh: false, lastAimSign: 1, stylePts: 0, keeperSlide: null, keeperCool: 1.0, hudClock: -1, hudFlow: -1, hudKin: '' });
    me.root.position.set(0, 0, BREAK.startZ); me.root.rotation.set(0, 0, 0);
    keeper.root.position.set(0, 0, BREAK.keeperZ); keeper.root.rotation.set(0, Math.PI, 0);
    keeperAnim.loop(SPORT_CLIP.keeperIdle, { fadeSec: 0.25 }); meAnim.loop(SPORT_CLIP.moveLoop, { fadeSec: 0.2 });
    pball.stop(); ball.position.set(0, 0.11, BREAK.startZ + BREAK.dribbleAhead); frameKind = null; flightSec = 0;
    ctx.camDirector.setPreset('court'); ctx.camDirector.snapTo(me.root.position, new Vector3(0, 1, PEN_GOAL.z));
    // IMPROVE (2026-10-06, Penalty #2 / #4): the hint names the real clock (BREAK.clockSec; it said 9 s of 11) and what
    // really picks the corner (the stick held at the strike — owner decision 2026-10-06), carries the pressure line
    // nextKick used to write and this overwrote, and says when the keeper is reading your habit — keeperReadProb drives
    // his dive here, and the warning lived only in the unreachable place-kick aim.
    ctx.setHud({ hint: breakawayHint({ clockSec: BREAK.clockSec, pressure, readSide: round > 1 ? habitRead(shotHistory) : 0 }), clock: BREAK.clockSec, flow: 0, kinetic: '', kickPower: null });
  }
  /** IMPROVE (2026-10-06, Penalty #3): CLASSIC PENS — the place kick from the spot: the feints, the aim ring, the power wave
   *  and the keeper's read of your aim (the PLACE path in onInput / update, which every kick used to skip for the run). */
  function startClassic(ctx: ModeContext, pressure: string | null = null): void {
    phase = 'aim'; brk.on = false; brk.counterLive = false; brk.struck = false; brk.keeperSlide = null; brk.wall = 0; brk.vaultT = -1; stickX = 0; stickY = 0;
    me.root.position.set(-0.4, 0, -1.6); me.root.rotation.set(0, 0, 0);
    keeper.root.position.set(0, 0, 10.4); keeper.root.rotation.set(0, Math.PI, 0);
    keeperAnim.loop(SPORT_CLIP.keeperIdle, { fadeSec: 0.25 }); meAnim.loop(SPORT_CLIP.penaltyIdle, { fadeSec: 0.25 });
    pball.stop(); ball.position.set(0, 0.11, 0); frameKind = null; flightSec = 0;
    reticle.pos.set(0, 1.2, 11);
    ctx.camDirector.setFixedBehind(me.root.position, 0, 'flight', true);
    ctx.setHud({ hint: pressure ? `${pressure} · ${CLASSIC_HINT}` : CLASSIC_HINT, clock: 0, flow: -1, kinetic: '', kickPower: null });
  }
  /** IMPROVE (2026-10-06, Penalty #3): Y at the top of a kick switches its style (and remembers the pick). The same kick,
   *  started fresh — the breakaway only inside its first PENS_SWITCH_SEC, before the run has gone anywhere. */
  function switchPens(ctx: ModeContext): boolean {
    const canBreak = phase === 'break' && brk.on && !brk.struck && !brk.counterLive && brk.clock >= BREAK.clockSec - PENS_SWITCH_SEC;
    const canClassic = phase === 'aim' && !brk.on && !betweenKicks;
    if (!canBreak && !canClassic) return false;
    pensStyle = canBreak ? 'classic' : 'breakaway'; writePensStyle(pensStyle);
    feints = 0; lastFlickSign = 0; kickIn = 0; pendingKick = null;
    SoundKit.play('uiTick', { pitch: 1.2 });
    bannerCh?.flash(pensStyle === 'classic' ? 'CLASSIC PENS' : 'BREAKAWAY', 700);
    if (pensStyle === 'classic') startClassic(ctx, kickPressure); else startBreakaway(ctx, kickPressure);
    return true;
  }
  /** The shot, any of its kinds: the ball leaves on the boot's contact key; the keeper reads the side and commits. */
  function strikeNow(ctx: ModeContext, kind: ShotKind): void {
    if (phase !== 'break' || brk.struck) return;
    const kinetic = gameT - brk.kineticAt <= FLOW.kineticSec;   // IMPROVE (2026-10-06, Penalty #20): game time
    const prof = shotProfile(brk.flow / FLOW.full, kinetic, kind);
    // IMPROVE (2026-10-06, owner decision "Stick aims"): the stick held at the strike picks the corner (◀ / ▶ / neither =
    // the middle; up = the chip, as before). The corner was read off the ball's distance ahead of you, and off the
    // dribble that is always 0.9 m — every plain strike went low, just left of centre. The distance is now the strike's
    // accuracy: struck off the dribble's sweet spot (jammed, or stretched for) it wobbles off its line (Breakaway.strikeAim).
    const aim = strikeAim({ x: stickX, y: stickY }, Vector3.Distance(ball.position, me.root.position));
    const high = aim.high || kind === 'rainbow';
    let curl = 0; let target = aim.target; let side = aim.side;
    // the curler always bends into a corner: the middle stick takes the side the slide went (its clip, below, reads the same)
    if (kind === 'curler') { const sgn = side !== 0 ? side : stickX >= 0 ? 1 : -1; side = sgn; curl = 1.6 * sgn; target = { x: sgn * 2.6, y: 0.9 }; }
    if (kind === 'rainbow') target = { x: side * 2.2, y: 2.05 };
    // the keeper reads where the ball ARRIVES — for the bank that is the stick's corner, not its mirror image off the glass
    // (Math.sign of the mirrored x always read the wall's side, whatever the aim)
    const aimX = target.x;
    if (kind === 'bank') target = bankTarget(brk.wall === 0 ? 1 : brk.wall, target);
    const from = { x: ball.position.x, y: ball.position.y, z: ball.position.z };
    const { vel, spin } = launchKick(from, target, prof.power01, { curl, chip: kind === 'rainbow' || (high && kind !== 'bank'), wobble: kind === 'strike' || kind === 'overdrive' ? aim.wobble : 0, rand: Math.random() });
    vel.scaleInPlace(prof.speedMult);
    brk.struck = true; brk.shotKind = kind; brk.lastHigh = high; brk.lastAimSign = side; brk.lastAimX = aimX; brk.counterLive = false; brk.slideSec = -1;
    if (brk.wall !== 0) { brk.wall = 0; me.root.position.y = 0; }
    brk.stylePts += kind === 'strike' ? 0 : kind === 'rainbow' ? 15 : kind === 'overdrive' ? 15 : 10; if (kinetic) brk.stylePts += 5;
    brkStats.shots++; if (kind === 'bank') brkStats.banks++; if (kind === 'rainbow') brkStats.rainbows++; if (kind === 'curler') brkStats.curlers++; if (kind === 'overdrive') brkStats.overdrives++; if (kinetic) brkStats.kinetic++;
    goalLatch = false; frameKind = null; flightSec = 0;
    meAnim.beat(SPORT_CLIP.penaltyStrike, { fadeSec: 0.08 });
    if (kind === 'rainbow') { const dir = keeper.root.position.subtract(me.root.position); dir.y = 0; dir.normalize(); brk.vault = { from: me.root.position.clone(), dir }; brk.vaultT = 0; }
    // IMPROVE (2026-10-06, "Stick aims"): the read is breakawayReadProb — keeperReadProb on a corner, its own streak on
    // the middle the stick can now pick — and a misread middle shot sends him to a side (keeperDiveX), not nowhere.
    const correct = Math.random() < breakawayReadProb(side, shotHistory);
    // net/precision phase 6 — A READ THAT IS RIGHT REACHES THE BALL. The dive went 2.0 m toward the read side from wherever he
    // stood; a corner sits at 3.0, past his reach even when he read it, so a random corner beat him as surely as a read one
    // (the masher's shootout: 5 of 5). Right = he goes to the shot's line (inside the post); wrong = the other way.
    keeperTargetX = keeperDiveX(correct, side, brk.lastAimX, keeper.root.position.x, Math.random());
    console.info(`[BREAK] keeper read ${correct ? 'RIGHT' : 'WRONG'} aim ${brk.lastAimX.toFixed(1)} dive to ${keeperTargetX.toFixed(1)}`);
    kickIn = kind === 'rainbow' ? 0.2 : KICK_CONTACT_SEC * 0.6;
    pendingKick = () => {
      SoundKit.play('whoosh'); ctx.feel?.impact?.(0.3 + prof.power01 * 0.3);
      keeperDiveSign = keeperTargetX > keeper.root.position.x ? 1 : -1; if (kind !== 'rainbow') { dive(keeperAnim, keeperDiveSign); keeperDove = true; }
      pball.launch(new Vector3(from.x, from.y, from.z), vel, spin);
    };
    phase = 'flight';
    ctx.setHud({ kickShape: prof.label, kinetic: kinetic ? 'KINETIC' : '', hint: '' }); bannerCh?.flash(prof.label, 700);
    console.info(`[BREAK] ${kind} power ${prof.power01.toFixed(2)} x${prof.speedMult.toFixed(2)} flow ${brk.flow.toFixed(0)} kinetic ${kinetic} clock ${brk.clock.toFixed(1)}`);
  }
  /** The run: the clock, the body with momentum, the glass, the slide, the rainbow's arc, the ball at the feet, the keeper. */
  function tickBreak(ctx: ModeContext, dt: number): void {
    brk.clock -= dt; brk.slideCool = Math.max(0, brk.slideCool - dt); brk.keeperCool = Math.max(0, brk.keeperCool - dt);
    if (brk.clock <= 0) { pball.stop(); brkStats.clocks++; console.info('[BREAK] clock'); resolveKick(ctx, 'wide', 'CLOCK — NO SHOT'); return; }
    const held = brk.vaultT >= 0;
    if (brk.slideSec >= 0) { brk.slideSec += dt; if (brk.slideSec >= BREAK.slideSec) { brk.slideSec = -1; brk.slideCool = BREAK.slideCool; meAnim.loop(SPORT_CLIP.moveLoop, { fadeSec: 0.2 }); } }
    const boost = (brk.wall !== 0 ? BREAK.wallRunMult : 1) * (brk.slideSec >= 0 ? BREAK.slideMult : 1);
    brk.run = stepRun(brk.run, { x: stickX, y: stickY }, dt, { boost, trucking: false, held, grip: 1, drag: 1 });
    const vel = RUN_V.set(brk.run.vx, 0, brk.run.vz);   // IMPROVE (2026-10-06, Penalty #15): scratch, not a new Vector3 a frame
    const p = me.root.position;
    if (!held) { p.x += vel.x * dt; p.z += vel.z * dt; }
    if (brk.wall === 0 && !held) {
      const g = glassRead(p.x, vel.x, vel.z);
      if (g !== 0) { brk.wall = g; brk.wallSec = 0; brk.flow = flowAdd(brk.flow, FLOW.wallRun); brk.kineticAt = gameT; brk.stylePts += 5; brkStats.wallRuns++; SoundKit.play('whoosh', { pitch: 0.9 }); bannerCh?.flash('WALL RUN — R1 banks it off the glass', 600); console.info('[BREAK] wall run'); }
    }
    if (brk.wall !== 0) {
      brk.wallSec += dt; p.x = brk.wall * (BREAK.glassX - 0.35); p.y = BREAK.wallRunY;
      const off = Math.sign(stickX) === -brk.wall && Math.abs(stickX) > 0.5;
      if (brk.wallSec >= BREAK.wallRunSec || off) { const w = brk.wall; brk.wall = 0; p.y = 0; brk.run.vx = -w * 2; }
    }
    p.x = Math.max(-(BREAK.glassX - 0.3), Math.min(BREAK.glassX - 0.3, p.x)); p.z = Math.min(p.z, GOAL_LINE.z - 1.2);
    if (brk.vaultT >= 0 && brk.vault) { brk.vaultT += dt; const u = Math.min(1, brk.vaultT / BREAK.rainbowSec); const q = rainbowArc(brk.vault.from, brk.vault.dir, u); p.set(q.x, q.y, q.z); if (u >= 1) { brk.vaultT = -1; p.y = 0; } }
    const sp = Math.hypot(vel.x, vel.z);
    if (sp > 0.5 && !held) { const want = Math.atan2(vel.x, vel.z); let d = want - me.root.rotation.y; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; me.root.rotation.y += Math.max(-10 * dt, Math.min(10 * dt, d)); }
    if (sp >= 6) brk.flow = flowAdd(brk.flow, FLOW.dribblePerSec * dt);
    if (!brk.counterLive) ball.position.set(p.x + Math.sin(me.root.rotation.y) * BREAK.dribbleAhead, 0.11, p.z + Math.cos(me.root.rotation.y) * BREAK.dribbleAhead);
    else { stepBall(dt); if (!pball.active && Vector3.Distance(ball.position, p) > BREAK.strikeReach + 2.5) { resolveKick(ctx, 'saved', 'PARRIED CLEAR — SAVED'); return; } }
    // the keeper: off his line, tracking the ball, the slide-tackle on a striker who dawdles inside his range
    const kp = keeper.root.position;
    if (brk.keeperSlide) {
      brk.keeperSlide.t += dt; const sd = brk.keeperSlide.dir; kp.x += sd.x * KEEPER.slideSpeed * dt; kp.z += sd.z * KEEPER.slideSpeed * dt;   // #15: no scale() a frame
      if (!brk.counterLive && brk.vaultT < 0 && Math.hypot(ball.position.x - kp.x, ball.position.z - kp.z) <= KEEPER.slideHitM) {
        brk.keeperSlide = null; brkStats.tackled++; pball.stop(); SoundKit.play('impact', { pitch: 0.7, volume: 0.5 }); ctx.feel?.impact?.(0.4); console.info('[BREAK] slide-tackled');
        resolveKick(ctx, 'saved', 'SLIDE-TACKLED — NO SHOT'); return;
      }
      if (brk.keeperSlide.t >= KEEPER.slideSec) { brk.keeperSlide = null; brk.keeperCool = KEEPER.slideCool; const sgn = keeperDiveSign; timers.later(() => { if (!ended && phase === 'break') rise(keeperAnim, sgn, SPORT_CLIP.keeperIdle); }, 300); }
    } else {
      const tz = keeperTargetZ(p.z); kp.z += Math.max(-KEEPER.closeRate * dt, Math.min(KEEPER.closeRate * dt, tz - kp.z));
      kp.x += (ball.position.x * KEEPER.trackX - kp.x) * Math.min(1, 3 * dt);
      if (!brk.counterLive && keeperSlideRead({ x: kp.x, z: kp.z }, { x: ball.position.x, z: ball.position.z }, brk.keeperCool, brk.struck)) {
        const dir = ball.position.subtract(kp); dir.y = 0; dir.normalize(); brk.keeperSlide = { t: 0, dir }; keeperDiveSign = dir.x > 0 ? 1 : -1;
        keeperAnim.beat(sided(SPORT_CLIP.keeperDive, keeperDiveSign), { fadeSec: 0.08 });
        bannerCh?.flash("HE'S COMING OUT — flick it over him (A) or beat him", 500); console.info('[BREAK] keeper slide');
      }
    }
    const c = Math.ceil(brk.clock), f = Math.round(brk.flow), kin = gameT - brk.kineticAt <= FLOW.kineticSec ? 'KINETIC' : '';
    if (c !== brk.hudClock || f !== brk.hudFlow || kin !== brk.hudKin) { brk.hudClock = c; brk.hudFlow = f; brk.hudKin = kin; ctx.setHud({ clock: c, flow: f, kinetic: kin }); }
    // IMPROVE (2026-10-06, Penalty #16): the gallery is updated once a frame, in update() — this second call swayed it at
    // double speed through every breakaway
    ctx.camDirector.update(p, vel, ball.position);
  }
  /** The curved glass down each side of the breakaway. */
  function buildGlass(ctx: ModeContext): void {
    const mat = VenueKit.paint(ctx.scene, 'brk_glass_mat', '#9ad7ff', 0.12, 0.2); mat.alpha = 0.28;
    // IMPROVE (2026-10-06, Penalty #19): the two 22 m panes are one mesh (one alpha-blended draw, not two), with its world
    // matrix and its material frozen — the glass never moves and its paint never changes.
    const panes = ([1, -1] as const).map((side) => {
      const g = MeshBuilder.CreateBox(`brk_glass_${side}`, { width: 0.16, height: 2.4, depth: 22 }, ctx.scene);
      g.position.set(side * (BREAK.glassX + 0.2), 1.2, 0.5); return g;
    });
    const merged = Mesh.MergeMeshes(panes, true);
    if (merged) merged.name = 'brk_glass';
    for (const g of merged ? [merged] : panes) { g.material = mat; g.isPickable = false; g.freezeWorldMatrix(); furniture.push(g); }
    mat.freeze();
  }

  /** The kick decided (was inline in the flight branch): the score, the pips, the juice, the banner, their kick next. */
  function resolveKick(ctx: ModeContext, outcome: ReturnType<typeof judgeKick>, bannerOverride?: string): void {
    const saved = outcome === 'saved';
    console.info(`[BREAK] judge ${outcome} ball x ${ball.position.x.toFixed(1)} keeper x ${keeper.root.position.x.toFixed(1)}`);   // phase 6: the ledger
    if (saved) lastSaveBy = 'them';
    const scored = outcome === 'goal';
    shotHistory.push(brk.on ? brk.lastAimSign : Math.sign(reticle.pos.x || 0.01));   // the keeper remembers
    if (keeperDove) { keeperDove = false; timers.later(() => { if (!ended) rise(keeperAnim, keeperDiveSign, SPORT_CLIP.keeperIdle); }, RISE_DELAY_MS); }   // decided: off the ground, a beat later
    myKicks.push(scored ? 'goal' : 'miss');
    if (scored) {
      goals++;
      stylePts += feints * FEINT_STYLE_PTS + (brk.on ? brk.stylePts : 0);
      // A+ P0 juice: TD-class goal punch — hit-stop + shake + gold flash + ONE thud, latched per kick (replaces the bare feel.impact)
      if (!goalLatch) {
        goalLatch = true;
        ctx.juice.hitStop(60); ctx.juice.shake(0.14, 160); ctx.juice.flash('#FFD700', 130);
        SoundKit.play('impact', { pitch: 0.7, volume: 0.8 });
        console.info('[PEN-JUICE] goal punch');
      }
      SoundKit.play('score');
      SoundKit.play('crowdCheer');
      gallery?.cheer(1);
    } else {
      SoundKit.play(saved ? 'crowdGroan' : 'miss');
      if (!saved) SoundKit.play('crowdGroan', { volume: 0.3 });   // A+ P0: the miss groans too, quieter
      ctx.feel?.impact?.(0.45);           // A+ P0: heavier feel on a save / miss — never the goal punch
      console.info(`[PEN-JUICE] ${saved ? 'saved' : 'miss'} (heavy feel + groan)`);
      gallery?.cheer(0.25);               // a save is THEIR moment
    }
    bannerCh?.cancel();   // IMPROVE (2026-10-06, Penalty #11): the strike label's pending clear must not wipe the result
    ctx.setHud({
      score: goals * 20 + stylePts, ...kicksHud(),   // phase 3: the number the result reports (goals x20 + style); the board is kicksYou / goals / themGoals
      banner: bannerOverride ?? (scored
        ? `${frameKind ? `OFF THE ${frameKind.toUpperCase()} — IN! ` : ''}GOOOAL!${feints > 0 ? ` +${feints * FEINT_STYLE_PTS} style` : ''}`
      : frameKind ? `OFF THE ${frameKind.toUpperCase()}!` : outcome === 'short' ? 'SCUFFED IT — SHORT' : saved ? 'SAVED' : outcome === 'over' ? 'OVER THE BAR' : 'WIDE'),
    });
    // YOUR kick, then THEIR answer — the shootout breathes in
    // alternating beats, and a tied fifth round goes to SUDDEN DEATH.
    // YOUR kick, then THEIR kick — and their kick is yours to keep.
    // IMPROVE (2026-10-06, Penalty #9 / #10): a held beat A can skip (ResultBeat), on the bag dispose() clears
    resultBeat.hold(gameT, 1200, () => { if (!ended) startKeeperRound(ctx); });
    phase = 'aim'; brk.on = false; brk.counterLive = false; ctx.setHud({ clock: 0, flow: -1, kinetic: '' }); me.root.position.y = 0;
    betweenKicks = true;   // HOTFIX (2026-09-24): the result beat takes no kick input (onInput)
  }

  function kickLabel(): string {
    return round <= REGULATION_KICKS ? `KICK ${round}/${REGULATION_KICKS}` : 'SUDDEN DEATH';
  }

  /** HOTFIX (2026-09-24): the aim ring is shown only while it aims the kick, which is the PLACE kick's aim and power
   *  phases. The BREAKAWAY shot aims off the stick (strikeNow) and never reads the ring, and every kick is a breakaway
   *  now, so in play the ring stays hidden. Stood up by the shared Reticle fix, it sat face-on in the middle of the goal
   *  mouth all breakaway ('aim here', and it did not follow the shot) and behind you all through their kick. */
  function syncReticle(): void {
    const aiming = (phase === 'aim' || phase === 'power') && !brk.on && !betweenKicks;
    if (reticle.mesh.isEnabled(false) !== aiming) reticle.mesh.setEnabled(aiming);
  }

  function nextKick(ctx: ModeContext): void {
    round++;
    phase = 'aim';
    feints = 0; lastFlickSign = 0;
    ball.position.set(0, 0.11, 0);
    keeper.root.position.set(0, 0, 10.4);
    keeperAnim.loop(SPORT_CLIP.keeperIdle, { fadeSec: 0.25 });
    meAnim.loop(SPORT_CLIP.penaltyIdle, { fadeSec: 0.25 });
    kickIn = 0; pendingKick = null;
    hintFlags.read = false;
    // the pressure line: a must-score kick SAYS so (sudden death or last kick down)
    const s = shootoutState(goals, themGoals, round - 1, themKicks);
    const mustScore = s.phase === 'suddenDeath' && themGoals > goals;
    // IMPROVE (2026-10-06, Penalty #2): the line rides the kick's own hint — written here, it was overwritten by
    // startBreakaway's in the same frame and never seen
    const pressure = kickPressure = mustScore ? 'SCORE OR YOU ARE OUT' : s.phase === 'suddenDeath' ? 'SUDDEN DEATH — score and the keeper must answer' : null;
    ctx.setHud({
      round: kickLabel(), feints: 0, ...kicksHud(), dive: '', weather: weather.describe(), kickShape: '',
      score: goals * 20 + stylePts,   // HOTFIX (2026-09-24): one type. This was the string '2–1', so the chip flipped to '40 PTS' after every kick; the kicks panel draws goals–themGoals
    });
    if (pensStyle === 'classic') startClassic(ctx, pressure);   // IMPROVE (2026-10-06, Penalty #3): the place kick
    else startBreakaway(ctx, pressure);   // BREAKAWAY: your kick is the run
  }

  /** Street-style feint: a hard left↔right stick snap during aim. */
  /** THEIR kick, kept by you. The AI keeper's body becomes the kicker at the
   *  spot; you stand on the line; the camera sits behind the goal. */
  function startKeeperRound(ctx: ModeContext): void {
    const sd = round > REGULATION_KICKS;
    keepPlan = planRivalKick(Math.random, sd);
    keepT = 0; keepStruck = false; keepCall = 0; keepDiveAt = null;
    betweenKicks = false;
    ctx.setHud({ ...kicksHud(), dive: 'THEIR KICK — read the run-up · DIVE ◀ ▶ · STAY ▼ · SPRING ▲ as he strikes', kickPower: null });
    phase = 'keep';
    keeper.root.position.set(SPOT.x, 0, SPOT.z - 2.2); keeper.root.rotation.set(0, 0, 0);
    keeperAnim.loop(SPORT_CLIP.moveLoop, { fadeSec: 0.2 });
    me.root.position.copyFrom(GOAL_LINE); me.root.rotation.set(0, Math.PI, 0);
    meAnim.loop(SPORT_CLIP.keeperIdle, { fadeSec: 0.25 });
    keepKickIn = 0; pendingKeepKick = null;
    ball.position.set(SPOT.x, 0.11, SPOT.z + 0.3);
    ctx.camDirector.setFixedBehind(SPOT, 0, 'keeper', true);   // high behind the spot, the keeper faces the camera at the goal
    bannerCh?.cancel();
    // IMPROVE (2026-10-06, Penalty #7): the run-up's lean is the side; a run-up that barely leans is going down the middle
    ctx.setHud({ hint: `THEIR KICK — read the run-up · dive ◀ / ▶ as he strikes · a straight run-up goes down the middle: ▼ stay big, ▲ spring for the chip${sd ? ' · sudden death: he lies more' : ''}`, banner: '' });
  }
  /** IMPROVE (2026-10-06, Penalty #12): the breakaway's tricks go to the results card (they were tracked, then dropped). */
  const endStats = () => ({ shots: brkStats.shots, wallRuns: brkStats.wallRuns, banks: brkStats.banks, rainbows: brkStats.rainbows, curlers: brkStats.curlers, overdrives: brkStats.overdrives, parries: brkStats.parries });
  function afterTheirKick(ctx: ModeContext): void {
    if (ended) return;
    bannerCh?.cancel(); ctx.setHud({ banner: '' });
    const s = shootoutState(goals, themGoals, round, themKicks);
    const sdRounds = Math.max(0, Math.min(round, themKicks) - REGULATION_KICKS);
    if (s.phase === 'suddenDeath' && round === themKicks && sdRounds >= SD_CAP) {
      const decidedBy = stylePts > 0 ? 'style' : lastSaveBy ? 'later-save' : 'nerve';
      const winner: 'you' | 'them' = stylePts > 0 ? 'you' : lastSaveBy ?? 'you';
      ended = true;
      SoundKit.play('whistle');
      const won = winner === 'you';
      if (won) SoundKit.play('crowdCheer');
      ctx.setHud({ banner: won ? `LEVEL AFTER ${SD_CAP} — YOURS ON ${decidedBy === 'style' ? 'STYLE' : decidedBy === 'later-save' ? 'THE LATER SAVE' : 'NERVE'}` : `LEVEL AFTER ${SD_CAP} — THEIRS ON THE LATER SAVE` });
      // stats are numbers: decidedBy 1 = style, 2 = the later save, 3 = nerve
      console.info(`[PEN-END] ${won ? 'WIN' : 'LOSS'} ${goals}-${themGoals} style ${stylePts} sd ${sdRounds}`);
      ctx.end(won ? 'SHOOTOUT_WIN' : 'SHOOTOUT_LOSS', goals * 20 + stylePts, { goals, stylePts, themGoals, sdRounds, decidedBy: decidedBy === 'style' ? 1 : decidedBy === 'later-save' ? 2 : 3, ...endStats() });
      return;
    }
    if (s.phase === 'decided' && s.winner) {
      ended = true;
      SoundKit.play('whistle');
      const won = s.winner === 'you';
      if (won) SoundKit.play('crowdCheer');
      console.info(`[PEN-END] ${won ? 'WIN' : 'LOSS'} ${goals}-${themGoals} style ${stylePts}`);
      ctx.end(won ? 'SHOOTOUT_WIN' : 'SHOOTOUT_LOSS', goals * 20 + stylePts,
        { goals, stylePts, themGoals, sdRounds: Math.max(0, round - REGULATION_KICKS), ...endStats() });
      return;
    }
    me.root.position.set(-0.4, 0, -1.6); me.root.rotation.set(0, 0, 0);
    meAnim.loop(SPORT_CLIP.penaltyIdle, { fadeSec: 0.25 });
    nextKick(ctx);   // BREAKAWAY: startBreakaway sets the follow camera
  }

  function detectFeint(ctx: ModeContext, x: number): void {
    if (phase !== 'aim' || feints >= MAX_FEINTS) return;
    const sign = x > 0.6 ? 1 : x < -0.6 ? -1 : 0;
    if (sign === 0) return;
    const nowMs = performance.now();
    if (lastFlickSign !== 0 && sign !== lastFlickSign && nowMs - lastFlickMs < 450) {
      feints++;
      SoundKit.play('whoosh', { pitch: 1.6, volume: 0.35 });
      meAnim.beat(SPORT_CLIP.footballJukeLeft, { fadeSec: 0.08 });
      ctx.setHud({ feints }); bannerCh?.flash(`FEINT${feints > 1 ? ` x${feints}` : '!'}`, 500);
    }
    lastFlickSign = sign; lastFlickMs = nowMs;
  }

  return {
    modeId: 'soccer', mood: 'nightGame', camPreset: 'court',

    async load(ctx: ModeContext) {
      penaltyVenue = mountVenue(ctx, 'penalty', { keepGameplayCamera: true, look: readPlaceLook('penalty') });   // PLACE
      if (!penaltyVenue) VenueKit.buildField(ctx.scene, 'pitch');   // spec first, kit fallback
      EffectsKit.ambient(ctx.scene, 'park');
      furniture = buildGoal(ctx.scene);
      buildGlass(ctx);   // BREAKAWAY: the side glass
      // Phase 6: the penalty spot is a real mark under the ball, and the
      // shootout is played in front of a bank of crowd behind the goal —
      // in frame the whole time, because the camera sits behind the kicker.
      const spot = MeshBuilder.CreateDisc('penalty_spot', { radius: 0.14, tessellation: 24 }, ctx.scene);
      spot.rotation.x = Math.PI / 2;
      spot.position.set(0, 0.02, 0);
      const spotMat = new StandardMaterial('penalty_spotMat', ctx.scene);
      spotMat.diffuseColor = Color3.FromHexString('#f2f2f2');
      spotMat.specularColor = Color3.Black();
      spot.material = spotMat;
      furniture.push(spot);
      // IMPROVE (2026-10-06, Penalty #18): five bodies, not the seven the 14 spots got from MAX_BODIES' spread (each a
      // skinned, animated roster body in frame the whole shootout), the bank kept as wide (x ±8, 4 m apart) — and parked
      // while the camera is off them (Onlookers.pauseOffscreen: the breakaway's follow cam turns away on a wall run).
      gallery = new Onlookers(ctx.scene, Array.from({ length: 5 }, (_, i) => {
        const k = i - 2;
        // a shallow bank behind the goal — 2 m behind the keeper camera (fixed at z 13.4 on THEIR kick): at 13.2 the camera
        // stood inside a spectator and the whole frame was the inside of a body (measured 2026-09-06)
        return new Vector3(k * 4, 0, 15.4 + Math.abs(k * 4 / 1.5) * 0.22);
      }), undefined, undefined, { pauseOffscreen: true });
      me = await spawnAthlete(ctx, CFG.heroUrl, new Vector3(-0.4, 0, -1.6), 0, SPORT_CLIP.penaltyIdle);
      keeper = await spawnFoe(ctx, CFG.heroUrl, new Vector3(0, 0, 10.4), Math.PI, SPORT_CLIP.keeperIdle);
      // the left dive is the authored right dive reflected across the sagittal plane, registered as 'keeper_dive.M'
      registerMirroredClips(me.animator, ctx.scene, me.skeleton, MIRRORED);
      registerMirroredClips(keeper.animator, ctx.scene, keeper.skeleton, MIRRORED);
      meAnim = new BeatOwner(me.animator); meAnim.loop(SPORT_CLIP.penaltyIdle);
      keeperAnim = new BeatOwner(keeper.animator); keeperAnim.loop(SPORT_CLIP.keeperIdle);
      meDove = keeperDove = false; kickIn = keepKickIn = 0; pendingKick = pendingKeepKick = null;
      ctx.heroRef.current = me.root;
      ball = MeshBuilder.CreateSphere('sball', { diameter: 0.22 }, ctx.scene);
      void dressBall(ball, 'soccer');   // Meshy ball skin rides the sphere (visual only)
      pball = new SoccerBall(ball, GRASS);
      // WEATHER: the start screen's pick — wind bends the flight, rain and fog dress the night
      weather = WeatherKit.fromPick(readWeather('soccer'), 'course', Math.floor(Date.now() / 1000) % 100000);
      weatherFx?.dispose(); weatherFx = mountWeatherFx(ctx.scene, ctx.lights, weather, { tier: ctx.lights.tier, keepSky: !!readPlaceLook('penalty')?.sky });   // a place with its own sky keeps it
      reticle = new Reticle(ctx.scene, new Vector3(0, 1.2, 11), { x: 3.3, y: 1.05 });
      reticle.mesh.setEnabled(false);   // HOTFIX (2026-09-24): hidden until it aims a kick (syncReticle), so no first-frame flash
      meter = new PowerMeter();
      ctx.objectiveRef.current = new Vector3(0, 1.2, 11);
      ctx.camDirector.setFixedBehind(me.root.position, 0, 'flight');
      assertSpawned(ctx.scene, { hero: me.root, minWorldMeshes: 6, modeId: 'soccer' });

      // THE BODIES (2026-09-13). Penalty mounted no posture layer either, and the two it needs are the two
      // the sport is about: a KEEPER who sets low and wide with his eyes on the ball instead of standing to
      // attention, and a STRIKER whose eyes stay DOWN on the ball through the run-up. A striker whose head
      // comes up to find the keeper is telling the keeper where the ball is going — a real tell, and the
      // reason kick_runup pins the eyes rather than aiming them at the goal.
      strikerPosture?.dispose();
      strikerPosture = mountPostureLayer(ctx.scene, me.skeleton, me.root, () => {
        const w = strikerWindow({
          runup01: phase === 'flight' || phase === 'power' ? 1 : 0,
          planted: phase === 'flight',
          struck: phase === 'flight' && pball.active,   // the ball is away and travelling
        });
        const { pose, legs } = fieldPose(w);
        const at = ball ? ball.getAbsolutePosition() : new Vector3(0, 0.3, 0);
        return { pose, legs, aim: at, eyes: at, window: w };
      }, 'KICK-PP');
      keeperPosture?.dispose();
      keeperPosture = mountPostureLayer(ctx.scene, keeper.skeleton, keeper.root, () => {
        const w = keeperWindow({ diving: keeperDove, rising: false, reading: phase !== 'keep' });
        const { pose, legs } = fieldPose(w);
        const at = ball ? ball.getAbsolutePosition() : new Vector3(0, 0.3, 0);
        return { pose, legs, aim: at, eyes: at, window: w };
      }, 'KEEP-PP');

      round = 0; goals = 0; stylePts = 0; ended = false; betweenKicks = false;
      themGoals = 0; themKicks = 0; shotHistory = []; hintFlags.read = false; myKicks = []; theirKicks = [];
      // IMPROVE (2026-10-06, Penalty #3 / #11 / #12 / #20): a fresh bag and banner channel, the game clock from zero, the
      // breakaway's counters from zero (they carried over from the last shootout), the remembered kick style
      timers.clear(); resultBeat.cancel(); bannerCh = new BannerChannel(timers, (text) => ctx.setHud({ banner: text })); gameT = 0;
      for (const k of Object.keys(brkStats) as (keyof typeof brkStats)[]) brkStats[k] = 0;
      pensStyle = readPensStyle();
      SoundKit.startAmbient('stadium');
      ctx.setHud({ score: 0 });   // net/precision phase 3: the score is the NUMBER the result reports; the kicks panel draws the board
      if (process.env.NODE_ENV === 'development') {
        (ctx.scene.metadata ??= {}).soccer = {   // BREAKAWAY probes
          state: () => ({ phase, clock: brk.clock, flow: brk.flow, wall: brk.wall, counterLive: brk.counterLive, struck: brk.struck, x: me.root.position.x, y: me.root.position.y, z: me.root.position.z, vx: brk.run.vx, vz: brk.run.vz, keeperX: keeper.root.position.x, keeperZ: keeper.root.position.z, keeperSliding: !!brk.keeperSlide, rainbowReady: phase === 'break' && brk.vaultT < 0 && rainbowRead(me2(), vel2(), { x: keeper.root.position.x, z: keeper.root.position.z }), slideSec: brk.slideSec, ...brkStats, goals, themGoals, round, ended, ballActive: pball.active, ballZ: ball.position.z }),
          diveNow: (side: -1 | 1) => { if (phase === 'keep' && keepPlan && keepDiveAt == null) { keepCall = side; keepDiveAt = gameT; dive(meAnim, side); meDove = true; meDiveSign = side; } },
        };
      }
      nextKick(ctx);
    },

    onInput(ctx: ModeContext, e: FelInput) {
      SoundKit.unlock();
      if (phase === 'keep') {
        // HOTFIX (2026-09-24): their kick is decided (keepPlan cleared) and the 1.3 s result beat runs in 'keep'. A press
        // there played a dive after the ball was already in or saved, so the beat takes no input.
        // IMPROVE (2026-10-06, Penalty #9): …except A, which skips the rest of the beat (ResultBeat, once it has been read)
        if (!keepPlan) { if (e.t === 'button' && e.pressed && e.btn === 'A') resultBeat.skip(gameT); return; }
        // one call per kick: d-pad or a decisive stick flick picks the side — IMPROVE (2026-10-06, Penalty #7): or ▼ stays
        // big in the middle, ▲ springs for the top of it (stick down / up the same; up is the stick's negative y)
        const call: KeeperCall = e.t === 'dpad' && e.pressed ? (e.dir === 'left' ? -1 : e.dir === 'right' ? 1 : e.dir === 'down' ? 'stay' : 'high')
          : e.t === 'stick' && e.side === 'L' ? (Math.abs(e.x) > 0.6 ? (e.x < 0 ? -1 : 1) : e.y > 0.7 ? 'stay' : e.y < -0.7 ? 'high' : 0) : 0;
        if (e.t === 'button' && e.pressed && e.btn === 'A') refuse(ctx, 'DIVE WITH ◀ ▶ · STAY ▼ · SPRING ▲');   // PHONE CONTROLS: STRIKE in the keeper round
        if (call !== 0 && keepDiveAt == null) {
          keepCall = call; keepDiveAt = gameT;   // #20: game time
          if (call === 'high') { meAnim.beat(SPORT_CLIP.jumpUp, { fadeSec: 0.08 }); meAnim.loop(SPORT_CLIP.keeperIdle, { fadeSec: 0.2 }); }
          else if (call !== 'stay') { dive(meAnim, call); meDove = true; meDiveSign = call; }   // ▼ is the set he is already in
          ctx.setHud({ hint: '', ...(call === 'stay' ? { dive: 'STAYING BIG ▼' } : call === 'high' ? { dive: 'SPRING ▲' } : {}) });
        }
        return;
      }
      if (phase === 'break') {   // BREAKAWAY
        // IMPROVE (2026-10-06, Penalty #3): Y at the top of the kick takes it as a classic pen instead
        if (e.t === 'button' && e.pressed && e.btn === 'Y') { if (!switchPens(ctx)) refuse(ctx, 'Y SWITCHES AT THE START OF A KICK'); return; }
        if (e.t === 'stick' && e.side === 'L') { stickX = e.x; stickY = e.y; }
        if (e.t === 'trigger' && e.side === 'L' && e.value > 0.5 && brk.slideSec < 0 && brk.slideCool === 0 && brk.vaultT < 0 && brk.wall === 0 && !brk.struck) {
          brk.slideSec = 0; brk.flow = flowAdd(brk.flow, FLOW.slide); brk.kineticAt = gameT; brkStats.slides++;
          meAnim.beat(sided(SPORT_CLIP.keeperDive, stickX >= 0 ? 1 : -1), { fadeSec: 0.08 }); SoundKit.play('whoosh', { pitch: 0.8, volume: 0.4 }); console.info('[BREAK] slide');   // the dive's stretch, in the soccer clip scope (a football clip here trips clipScope.test)
        }
        if (e.t === 'button' && e.pressed && e.btn === 'R1') { if (brk.wall !== 0) strikeNow(ctx, 'bank'); else refuse(ctx, 'BANK IT OFF THE GLASS — wall run first'); }
        if (e.t === 'button' && e.pressed && e.btn === 'A') {
          const near = Vector3.Distance(ball.position, me.root.position) <= BREAK.strikeReach;
          if (!near) refuse(ctx, 'GET TO THE BALL');
          else if (brk.vaultT >= 0) refuse(ctx, 'IN THE AIR');
          else if (rainbowRead(me2(), vel2(), { x: keeper.root.position.x, z: keeper.root.position.z })) strikeNow(ctx, 'rainbow');
          else if (slideCancelRead(brk.slideSec)) strikeNow(ctx, 'curler');
          else if (brk.counterLive) strikeNow(ctx, 'overdrive');
          else strikeNow(ctx, 'strike');
        }
        return;
      }
      // HOTFIX (2026-09-24): the result beat after your kick takes no kick input. Its phase is 'aim', and the PLACE path
      // below took that as a new kick: A, A ran the meter and fired a second kick for the same round from wherever the
      // ball lay, often the net. That meant a second pip, a possible second goal and a second keeper round.
      // IMPROVE (2026-10-06, Penalty #9): A skips the rest of the beat once it has been up RESULT_SKIP_MIN_SEC — the presses
      // above (0 and 0.1 s into it) are still nothing
      if (betweenKicks) { if (e.t === 'stick' && e.side === 'L') { stickX = e.x; stickY = e.y; } if (e.t === 'button' && e.pressed && e.btn === 'A') resultBeat.skip(gameT); return; }
      if (e.t === 'button' && e.pressed && e.btn === 'Y') { if (!switchPens(ctx)) refuse(ctx, 'Y SWITCHES AT THE START OF A KICK'); return; }   // #3: back to the breakaway
      if (e.t === 'stick' && e.side === 'L') { stickX = e.x; stickY = e.y; detectFeint(ctx, e.x); }
      if (e.t === 'button' && e.btn === 'A' && e.pressed) {
        if (phase === 'aim') { phase = 'power'; meter.start(); ctx.setHud({ hint: 'KICK at the top of the wave' }); SoundKit.play('uiTick', { pitch: 1.1 }); ctx.juice.callout('POWER — KICK AT THE TOP', '#8fe0a0', 800); }   // PHONE CONTROLS: the run-up is SAID
        else if (phase !== 'power') refuse(ctx, 'BALL IN PLAY');
        else if (phase === 'power') {
          const p = meter.stop();
          phase = 'flight';
          goalLatch = false;              // A+ P0: a fresh kick gets one goal punch
          frameKind = null; flightSec = 0;
          meAnim.beat(SPORT_CLIP.penaltyStrike, { fadeSec: 0.08 });
          kickIn = KICK_CONTACT_SEC;      // the boot meets the ball on the strike-through key; update() launches it
          // feints send the keeper the wrong way more often — and the keeper
          // READS your history: repeat a side and he is waiting for it, break
          // the habit and he leans the wrong way (keeperReadProb, D2)
          const aimSign = Math.sign(reticle.pos.x || 0.01);
          const correctGuess = keeperReadProb(aimSign, shotHistory, feints);
          keeperTargetX = Math.random() < correctGuess ? aimSign * 2.2 : -aimSign * 2.2;
          // A penalty is DRIVEN: 22–30 m/s with real loft. The old numbers
          // (13–20 m/s, aimed flat at the reticle) died 3–6m short of the
          // goal under gravity — measured: ZERO goals were physically
          // possible, in every game this mode has ever played; the keeper
          // danced over kicks that never arrived. The +1.2 aim lift puts a
          // top-corner aim on the bar and a centre aim chest-high.
          // THE PES READ: the aim on the goal mouth, the power bar's zone (over the top one the ball clears the bar),
          // and the SHAPE off the stick at the strike — held across = a curled finesse shot, pushed up = the chip
          const wobble = (1 - p) * 0.5 + feints * FEINT_WOBBLE;
          // FLAG: the meter is the swing. Early curls one way, late the other, a late top chips. The stick still runs and aims the reticle.
          const signed = (p - 0.5) * 2;
          const curl = Math.abs(signed) > 0.2 ? signed : 0; const chip = signed > 0.75;
          const { vel, spin } = launchKick({ x: ball.position.x, y: ball.position.y, z: ball.position.z }, { x: reticle.pos.x, y: reticle.pos.y - 0.1 }, p, { curl, chip, wobble, rand: Math.random() });
          pendingKick = () => {
            SoundKit.play('whoosh');
            ctx.feel?.impact?.(0.3 + p * 0.3);   // the contact feel, ON the contact (A+ P0 weight unchanged)
            keeperDiveSign = keeperTargetX > 0 ? 1 : -1;
            dive(keeperAnim, keeperDiveSign); keeperDove = true;   // the keeper commits as the boot lands
            pball.launch(ball.position.clone(), vel, spin);
          };
          ctx.setHud({ power: Math.round(p * 100), kickPower: null, hint: '', kickShape: chip ? 'CHIP' : curl ? `CURL ${curl < 0 ? '◀' : '▶'}` : kickZone(p) });
        }
      }
    },

    update(ctx: ModeContext, dt: number) {
      if (ended) return;
      gameT += dt;   // IMPROVE (2026-10-06, Penalty #20)
      // IMPROVE (2026-10-06, Penalty #1): the weather runs, as golf's does — the rain follows the camera, a storm flashes and
      // thunders, wet turf soaks, the gusts breathe. (The ball's wind is still WeatherKit.flightWind, the capped base.)
      weather.update(dt); weatherFx?.update(dt);
      meter.update(dt);
      syncReticle();
      if (phase === 'power') ctx.setHud({ power: Math.round(meter.value * 100), kickPower: Math.round(meter.value * 100), kickZones: METER_ZONES.map((z) => `${z.to}:${z.label}`).join(','), kickShape: stickY < -0.5 ? 'CHIP' : Math.abs(stickX) > 0.3 ? `CURL ${stickX < 0 ? '◀' : '▶'}` : kickZone(meter.value) });
      if (phase === 'aim') {
        reticle.update(dt, stickX, stickY);
        // the keeper's read is VISIBLE pressure: aim where you keep going and
        // the mode tells you he's onto it — the reason to vary is legible
        if (round > 1) {
          const aimSign = Math.sign(reticle.pos.x || 0.01);
          const p = keeperReadProb(aimSign, shotHistory, feints);
          if (p >= 0.75 && !hintFlags.read) {
            hintFlags.read = true;
            ctx.setHud({ hint: "HE'S READING THAT SIDE — vary it" });
          } else if (p < 0.7 && hintFlags.read) {
            hintFlags.read = false;
            ctx.setHud({ hint: 'Snap the stick side-to-side to FEINT (max 2) · aim · KICK twice' });
          }
        }
      }
      gallery?.update(dt);
      if (phase === 'break') { tickBreak(ctx, dt); return; }   // BREAKAWAY
      if (phase === 'flight') {
        // BREAKAWAY: the follow camera rides the shot; IMPROVE (2026-10-06, Penalty #3): the classic pen's fixed camera
        // watches it too (it only re-aims inside update()). #17: a shared zero, not Vector3.Zero() a frame.
        ctx.camDirector.update(me.root.position, ZERO_V, ball.position);
        if (kickIn > 0) {
          // the run-up / wind-up: the ball waits for the boot
          kickIn -= dt;
          if (kickIn <= 0 && pendingKick) { pendingKick(); pendingKick = null; }
          return;
        }
        keeper.root.position.x += (keeperTargetX - keeper.root.position.x) * 5 * dt;
        stepBall(dt);
        if (brk.on && pball.active) {   // BREAKAWAY: the keeper OFF his line, and the ball that comes back
          const kz = keeper.root.position.z;
          if (kz < GOAL_LINE.z - 0.3 && crossesKeeper(prevBall.z, ball.position.z, kz)) {
            const nearPost = Math.abs(Math.abs(keeper.root.position.x) - PEN_GOAL.halfW) <= KEEPER.vaultNearPost;
            const reach = reachFor(KEEPER_REACH + 0.35, { high: brk.lastHigh, kind: brk.shotKind }, nearPost);
            if (Math.abs(ball.position.x - keeper.root.position.x) <= reach && ball.position.y <= (brk.lastHigh && nearPost ? 2.6 : 2.0)) {
              // IMPROVE (2026-10-06, Penalty #8): the parry is where you put it — at his body it comes back at you; at his
              // stretch he holds it (parryRead). It was a 45% roll on every save.
              if (parryRead(ball.position.x, keeper.root.position.x, brk.clock, brk.shotKind)) {
                const to = me.root.position.subtract(ball.position); to.y = 0; to.normalize();
                pball.launch(ball.position.clone(), to.scale(KEEPER.counterSpeed).add(new Vector3(0, 2.2, 0)));
                brkStats.parries++; brk.counterLive = true; brk.struck = false; phase = 'break';
                keeperAnim.beat(SPORT_CLIP.penaltyStrike, { fadeSec: 0.08 }); if (keeperDove) { keeperDove = false; rise(keeperAnim, keeperDiveSign, SPORT_CLIP.keeperIdle); }
                SoundKit.play('impact', { pitch: 1.2, volume: 0.5 }); bannerCh?.cancel(); ctx.setHud({ banner: 'PARRIED — BACK AT YOU! hit it again', hint: 'OVERDRIVE — A on the loose ball' });
                console.info('[BREAK] parry-kick'); return;
              }
              pball.stop(); resolveKick(ctx, 'saved', 'SAVED — off his line'); return;
            }
          }
          if (frameKind && brk.clock > 0.8 && Vector3.Distance(ball.position, me.root.position) <= BREAK.strikeReach + 0.6 && pball.vel.z < 2) {
            brk.counterLive = true; brk.struck = false; brk.flow = flowAdd(brk.flow, FLOW.rebound); brk.kineticAt = gameT; brkStats.rebounds++; phase = 'break';
            bannerCh?.cancel(); ctx.setHud({ banner: 'OFF THE FRAME — OVERDRIVE!', hint: 'A — hit it again' }); console.info('[BREAK] rebound live'); return;
          }
        }
        // A scuffed pen can DIE SHORT of the line (weak meter + gravity) —
        // and before the shootout pass that never resolved: the only exit
        // from 'flight' was crossing z 10.9, so an under-hit kick soft-locked
        // the mode with the ball at rest in no man's land. (The depth driver
        // found it in four minutes; the cadence bot never had.)
        // …and now a ball off the frame can come back OUT: it is judged where it stops.
        const diedShort = !pball.active && ball.position.z < PEN_GOAL.z - 0.1;
        if (ball.position.z >= PEN_GOAL.z - 0.1 || diedShort) {
          pball.stop();
          const outcome = judgeKick(ball.position, keeper.root.position.x, KEEPER_REACH, diedShort && !frameKind);
          resolveKick(ctx, outcome);
        }
        return;
      }
      // IMPROVE (2026-10-06, Penalty #7): ▲ is a spring — up and down in 0.55 s, finished even after the kick is decided
      if (phase === 'keep' && keepCall === 'high' && keepDiveAt != null) { const u = (gameT - keepDiveAt) / 0.55; me.root.position.y = u < 1 ? 0.5 * Math.sin(Math.PI * u) : 0; }
      if (phase === 'keep' && keepPlan) {
        keepT += dt;
        // the run-up: the kicker's body drifts toward the tell side and leans — IMPROVE (2026-10-06, Penalty #5 / #6): by
        // the plan's lean (a centre kick barely leans) over the plan's run-up (1.0–1.3 s; it was always 1.15)
        if (!keepStruck) {
          const lean = Math.min(1, keepT / keepPlan.runupSec);
          keeper.root.position.x = SPOT.x + keepPlan.tellSign * keepPlan.lean * lean;
          keeper.root.position.z = SPOT.z - 2.2 * (1 - lean);
          keeper.root.rotation.y = keepPlan.tellSign * keepPlan.lean * 0.33 * lean;   // 0.18 rad on a corner's 0.55 m, as it was
          if (keepT >= keepPlan.runupSec) {
            keepStruck = true;
            keeperAnim.beat(SPORT_CLIP.penaltyStrike, { fadeSec: 0.08 });
            keeperAnim.loop(SPORT_CLIP.penaltyIdle, { fadeSec: 0.2 });   // a kicker stands after the strike (was the keeper's crouch)
            keepKickIn = KICK_CONTACT_SEC;
            const plan = keepPlan;
            pendingKeepKick = () => {
              keepStrikeAt = gameT;   // the strike instant the dive is graded against = the boot on the ball (#20: game time)
              SoundKit.play('whoosh');
              ball.position.set(SPOT.x, 0.11, SPOT.z + 0.3);
              frameKind = null; flightSec = 0;
              // IMPROVE (2026-10-06, Penalty #5 / #6): the plan's pace (was 0.72 every kick), and the Panenka chipped
              const k = launchKick({ x: SPOT.x, y: 0.11, z: SPOT.z + 0.3 }, { x: plan.aimX, y: Math.max(0.3, plan.aimY) }, plan.power01, { curl: plan.aimX > 1.5 ? 0.4 : plan.aimX < -1.5 ? -0.4 : 0, chip: plan.chip });
              pball.launch(ball.position.clone(), k.vel, k.spin);
            };
          }
        } else if (keepKickIn > 0) {
          // the boot is on its way to the ball; a dive already committed keeps carrying you
          keepKickIn -= dt;
          if (typeof keepCall === 'number' && keepCall !== 0) me.root.position.x += (keepCall * 2.4 - me.root.position.x) * 6 * dt;
          if (keepKickIn <= 0 && pendingKeepKick) { pendingKeepKick(); pendingKeepKick = null; }
        } else {
          stepBall(dt);
          // your dive carries you toward the side you chose
          if (typeof keepCall === 'number' && keepCall !== 0) me.root.position.x += (keepCall * 2.4 - me.root.position.x) * 6 * dt;
          const diedShort = !pball.active && ball.position.z < PEN_GOAL.z - 0.1;
          if (ball.position.z >= PEN_GOAL.z - 0.1 || diedShort) {
            pball.stop();
            const timing = gradeDive(keepDiveAt == null ? null : keepDiveAt - keepStrikeAt);   // #20: both already seconds of game time
            const r = diedShort ? { saved: false, why: 'off_target' as const } : resolveSaveRead(keepCall, timing, ball.position.x, ball.position.y);   // #7: resolveSave plus the centre calls
            const theyScore = !r.saved && r.why !== 'off_target';
            if (theyScore) themGoals++;
            themKicks++;
            if (meDove) { meDove = false; timers.later(() => { if (!ended) rise(meAnim, meDiveSign, SPORT_CLIP.keeperIdle); }, RISE_DELAY_MS); }   // decided: off the ground, a beat later
            theirKicks.push(theyScore ? 'goal' : 'miss');
            if (r.saved) { lastSaveBy = 'you'; ctx.juice.scorePop(ball.position, 'SAVED!', '#7CFFB2'); ctx.feel?.impact?.(0.5); }
            SoundKit.play(theyScore ? 'crowdGroan' : 'crowdCheer', { volume: 0.4 });
            bannerCh?.cancel();
            ctx.setHud({
              score: goals * 20 + stylePts, ...kicksHud(),   // phase 3: the number the result reports (goals x20 + style); the board is kicksYou / goals / themGoals
              // HOTFIX (2026-09-24): `dive: ''` sat inside the comment above, so the DIVE ◀ ▶ prompt stayed up under the
              // SAVED! / THEM: banner through the whole result beat, asking for a dive after the kick was decided.
              dive: '',
              banner: r.saved ? (timing === 'perfect' ? 'SAVED! — read it perfectly' : 'SAVED!')
                : r.why === 'wrong_way' ? (keepPlan.feint ? 'THEM: SOLD YOU — the run-up was a feint' : 'THEM: WRONG WAY')
                : r.why === 'middle' ? 'THEM: DOWN THE MIDDLE — you went'
                : r.why === 'over' ? (keepPlan.chip ? 'THEM: THE PANENKA — chipped over your set' : 'THEM: OVER YOUR SET')
                : r.why === 'under' ? 'THEM: UNDER YOUR SPRING — it stayed low'
                : r.why === 'too_slow' ? 'THEM: BURIES IT — dive as he strikes'
                : r.why === 'stayed' ? 'THEM: BURIES IT — you stayed home'
                : 'THEM: OFF TARGET',
            });
            keepPlan = null;
            resultBeat.hold(gameT, 1300, () => afterTheirKick(ctx));   // IMPROVE (2026-10-06, Penalty #9 / #10): A skips it; dispose clears it
          }
        }
        // the fixed camera only re-aims inside update(): without this it sat
        // behind the goal still facing the way it had been (measured: hero
        // BEHIND camera on every keeper round)
        ctx.camDirector.update(me.root.position, ZERO_V, ball.position);   // #17
        return;
      }
      ctx.camDirector.update(me.root.position, ZERO_V, reticle.pos);   // #17
    },

    // IMPROVE (2026-10-06, Penalty #10 / #13): ended, and every pending timer cleared — startKeeperRound / afterTheirKick /
    // the rise checked only `!ended`, which dispose never set; and the weather's particles and light restorers go with it.
    dispose() { ended = true; timers.clear(); resultBeat.cancel(); bannerCh = null; weatherFx?.dispose(); weatherFx = null; strikerPosture?.dispose(); strikerPosture = null; keeperPosture?.dispose(); keeperPosture = null; penaltyVenue?.dispose?.(); penaltyVenue = null; gallery?.dispose(); gallery = null; me?.dispose(); keeper?.dispose(); furniture.forEach((f) => f.dispose()); ball?.dispose(); reticle?.dispose(); SoundKit.stopAmbient(); },
  };
})();
