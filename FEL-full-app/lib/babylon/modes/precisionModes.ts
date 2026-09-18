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

import { kickPips, type KickResult } from '../core/penaltyHud';
import { freshDerby, bankSwing, distanceLine, OUTS_CAP, type DerbyTally } from '../core/derbyHud';
import { rivalProgress } from '../core/CarnivalNight';
import { holeName, cardString, windBearingDeg, windWord, holeBoard, ACCURACY_CENTER as GH_ACC_CENTER, ACCURACY_HALF as GH_ACC_HALF, type HoleResult } from '../core/golfHud';
import { Color3, Matrix, MeshBuilder, Quaternion, StandardMaterial, Vector3 } from '@babylonjs/core';
import { dressBall } from '../visual/meshyProps';
import { boneNode } from '../anim/boneLookup';
import { planRivalKick, gradeDive, resolveSave, type DiveSign, type RivalKickPlan } from '../core/KeeperCore';
import type { AbstractMesh, Mesh, Observer, Scene } from '@babylonjs/core';
import type { ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import type { SpawnedCharacter } from '../core/CharacterLibrary';
import { assertSpawned } from '../core/FrameGuard';
import {
  spawnAthlete, Reticle, PowerMeter, Flight, swingQuality,
  buildTennisNet, buildGolfGreen, buildPlateAndMound, buildGoal, buildBallparkOutfield, spawnFoe } from './aimSwingCore';
import { SPORT_CLIP } from '../anim/clipRegistry';
import { BeatOwner } from '../anim/beatOwner';
import { registerMirroredClips } from '../anim/mirrored-clips';
import { GOLF_CONTACT_SEC } from '../anim/authored/golf';
import { batLineAt, batRightSign, BAT_SWING_SEC, BAT_RECOVER_SEC } from '../anim/authored/baseball';
import { SoundKit } from '../audio/SoundKit';
import { refuse } from '../core/Refusal';   // MECHANICS PASS: a press that cannot act is answered
import { VenueKit } from '../visual/VenueKit';
import { mountVenue, type VenueHandle } from '../core/NexusVenue';
import { EffectsKit } from '../visual/EffectsKit';
import { Onlookers } from '../visual/Onlookers';
import { mountPostureLayer } from '../anim/PostureLayer';
import { fieldPose, batWindow, keeperWindow, strikerWindow } from '../core/FieldPosture';
import { keeperReadProb, rivalConverts, shootoutState, REGULATION_KICKS } from '../core/ShootoutCore';
import { PRECISION_CONFIG as CFG } from './modeConfigs';

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
export const GOLF_CLUBS = [
  { id: 'DRIVER', reach: 1.0, launch: 0.85, forgive: 0.8 },
  { id: 'IRON', reach: 0.68, launch: 1.15, forgive: 1.0 },
  { id: 'WEDGE', reach: 0.38, launch: 1.75, forgive: 1.25 },
] as const;

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
export const PUTTER = { id: 'PUTTER', reach: 0.16, launch: 0.06, forgive: 0.55 } as const;

/** Strokes each hole is expected to take. Golf is scored against this. */
export const GOLF_PAR = [3, 4, 3] as const;
/** Within this many metres the ball is holed. */
export const HOLED_M = 1.6;
/** Stick pulled past this is a backswing; pushed past it is the strike. */
export const SWING_STICK = 0.6;

// ════════════════════════════════════════════════════════════════ TENNIS ══
// ⚠️ DEAD CODE — NOT THE TENNIS THE GAME RUNS.
//
// The registry imports Tennis from `./TennisMode` (the M74 net-sport core) and
// takes only Golf, Derby and Penalty from this file; its own import line says
// "M74 net-sport replaces precision tennis". This implementation is unreachable.
//
// Unlike the dead `GolfMode.ts`, it is NOT excluded in tsconfig, so it
// type-checks and reads as live code. Editing it changes nothing in the game.
// Kept rather than deleted because it is a working reference for the rally feel
// described at the top of this file; git has it either way if it should go.
export const TennisMode: ModeDefinition = (() => {
  let me: SpawnedCharacter, opponent: SpawnedCharacter;
  let furniture: AbstractMesh[] = [];
  let ball: AbstractMesh, flight: Flight;
  let round = 0, pts = 0, stickX = 0, stickY = 0;
  let incoming = false, swung = false, ended = false;
  let rally = 0;                                 // exchanges in the current point
  let awaitingOpponent = false;                  // ball is on its way to them
  const TOTAL = 7;

  function serve(ctx: ModeContext): void {
    round++;
    swung = false; incoming = true; awaitingOpponent = false; rally = 0;
    const clutch = round === TOTAL;
    const targetX = ((round * 37) % 7) - 3;
    ball.position.set(targetX * 0.4, 1.2, 11);
    flight.launch(ball.position, new Vector3((targetX - ball.position.x) * 0.12, 2.2, -10.5 - round * 0.4));
    opponent.root.position.set(targetX * 0.4, 0, 11);
    ctx.setHud({ round: `${round}/${TOTAL}`, rally: 0, hint: clutch ? 'MATCH POINT — build the rally, then put it away' : 'SWING as the ball reaches you · stick UP = topspin · stick DOWN = lob' });
  }

  /** The opponent tries to return what you just hit. Better swings from you
   *  (and deeper rallies) make their get harder — that's how points END. */
  function opponentReturn(ctx: ModeContext, myQuality: number, topspin: boolean): void {
    awaitingOpponent = true;
    const reach = Math.max(0.1, 0.85 - myQuality * 0.35 - rally * 0.06 - (topspin ? 0.12 : 0));
    setTimeout(() => {
      if (ended) return;
      awaitingOpponent = false;
      if (Math.random() < reach) {
        // they got it back — the rally continues
        rally++;
        SoundKit.play('impact', { pitch: 1.4, volume: 0.25 });
        opponent.animator.play(SPORT_CLIP.tennisForehand, { onEnd: () => opponent.animator.play(SPORT_CLIP.tennisIdle, { loop: true }) });
        const targetX = (Math.random() * 8) - 4;
        ball.position.set(opponent.root.position.x, 1.2, 11);
        flight.launch(ball.position, new Vector3((targetX - ball.position.x) * 0.14, 2.1 + rally * 0.05, -10.5 - rally * 0.6));
        incoming = true; swung = false;
        ctx.setHud({ rally, banner: rally >= 3 ? `RALLY x${rally}` : '' });
        if (rally >= 3) setTimeout(() => ctx.setHud({ banner: '' }), 500);
      } else {
        // winner! bank the point at the rally multiplier
        const clutch = round === TOTAL;
        const mult = Math.max(1, rally) * (clutch ? CLUTCH_MULT : 1);
        const gained = Math.round((10 + myQuality * 15) * mult);
        pts += gained;
        SoundKit.play('score', { pitch: 1.1 });
        SoundKit.play('crowdCheer', { volume: Math.min(0.7, 0.25 + rally * 0.1) });
        ctx.setHud({ score: pts, banner: rally >= 2 ? `WINNER — RALLY x${rally}! +${gained}` : `WINNER! +${gained}` });
        setTimeout(() => {
          ctx.setHud({ banner: '' });
          if (round >= TOTAL) { ended = true; SoundKit.play('whistle'); ctx.end('MATCH_END', pts, { rounds: TOTAL }); return; }
          serve(ctx);
        }, 1100);
      }
    }, 650 + Math.random() * 300);
  }

  return {
    modeId: 'tennis', mood: 'goldenHour', camPreset: 'court',

    async load(ctx: ModeContext) {
      VenueKit.buildField(ctx.scene, 'tennis');
      EffectsKit.ambient(ctx.scene, 'park');
      furniture = buildTennisNet(ctx.scene);
      me = await spawnAthlete(ctx, CFG.heroUrl, new Vector3(0, 0, -10.5), 0, SPORT_CLIP.tennisIdle);
      opponent = await spawnFoe(ctx, CFG.heroUrl, new Vector3(0, 0, 11), Math.PI, SPORT_CLIP.tennisIdle);
      ctx.heroRef.current = me.root;                 // spawnAthlete sets heroRef on each call — reassert the player
      ball = MeshBuilder.CreateSphere('tball', { diameter: 0.14 }, ctx.scene);
      void dressBall(ball, 'tennis');   // Meshy ball skin rides the sphere (visual only)
      flight = new Flight(ball, -8.5);
      ctx.objectiveRef.current = ball.position;
      ctx.camDirector.setFixedBehind(me.root.position, 0, 'swing');
      assertSpawned(ctx.scene, { hero: me.root, minWorldMeshes: 5, modeId: 'tennis' });
      round = 0; pts = 0; ended = false;
      SoundKit.startAmbient('stadium');
      ctx.setHud({ score: 0 });
      serve(ctx);
    },

    onInput(ctx: ModeContext, e: FelInput) {
      SoundKit.unlock();
      if (e.t === 'stick' && e.side === 'L') { stickX = e.x; stickY = e.y; }
      if (e.t === 'button' && e.btn === 'A' && e.pressed && incoming && !swung) {
        swung = true;
        SoundKit.play('whoosh');
        me.animator.play(SPORT_CLIP.tennisForehand, {});
        const q = swingQuality(ball.position.z, me.root.position.z + 0.8, 10.5, 0.34);
        if (q <= 0) return;                        // early whiff — ball still incoming
        incoming = false;
        ctx.feel?.impact?.(0.2 + q * 0.3);
        // Wii-style: the stick AT CONTACT is the swing — X steers the shot,
        // Y picks the shot shape (up = topspin, down = lob)
        const topspin = stickY < -0.35;
        const lob = stickY > 0.35;
        SoundKit.play('impact', { pitch: topspin ? 1.5 : lob ? 0.9 : 1.2, volume: 0.3 });
        flight.launch(ball.position, new Vector3(
          stickX * 4.5,
          lob ? 6.5 : topspin ? 3 : 4 + q * 2,
          (topspin ? 16 : lob ? 10 : 13) + q * 4,
        ));
        ctx.setHud({ shotShape: topspin ? 'TOPSPIN' : lob ? 'LOB' : 'DRIVE' });
        opponentReturn(ctx, q * (lob ? 0.75 : 1), topspin);
      }
    },

    update(ctx: ModeContext, dt: number) {
      if (ended) return;
      flight.step(dt);
      // opponent shuffles toward the ball's x while it's coming to them
      if (awaitingOpponent) {
        opponent.root.position.x += (ball.position.x - opponent.root.position.x) * 2.5 * dt;
        opponent.root.position.x = Math.max(-5, Math.min(5, opponent.root.position.x));
      }
      me.root.position.x += (ball.position.x - me.root.position.x) * (incoming ? 2.2 : 0) * dt + stickX * 3 * dt;
      me.root.position.x = Math.max(-5, Math.min(5, me.root.position.x));
      if (incoming && ball.position.z <= me.root.position.z - 0.6) {
        // the ball got past you — the point is over, no bank
        incoming = false;
        SoundKit.play('miss');
        ctx.setHud({ banner: rally >= 2 ? `RALLY LOST — x${rally} gone` : 'MISS', rally: 0 });
        setTimeout(() => {
          ctx.setHud({ banner: '' });
          if (round >= TOTAL) { ended = true; SoundKit.play('whistle'); ctx.end('MATCH_END', pts, { rounds: TOTAL }); return; }
          serve(ctx);
        }, 900);
      }
      ctx.camDirector.update(me.root.position, Vector3.Zero(), ball.position);
    },

    dispose() { me?.dispose(); opponent?.dispose(); furniture.forEach((f) => f.dispose()); ball?.dispose(); SoundKit.stopAmbient(); },
  };
})();

// ══════════════════════════════════════════════════════════════════ GOLF ══
export const GolfMode: ModeDefinition = (() => {
  let me: SpawnedCharacter;
  let meAnim: BeatOwner;
  /** The strike is a beat: the ball leaves on the clip's contact key, not on the press. */
  let strikeIn = 0; let pendingStrike: (() => void) | null = null; let pendingVel: Vector3 | null = null;
  let furniture: AbstractMesh[] = [];
  let ball: AbstractMesh, flight: Flight, reticle: Reticle, meter: PowerMeter;
  let holePos = new Vector3(0, 0, 55);
  let round = 0, pts = 0, stickX = 0, stickY = 0;
  let phase: 'preview' | 'aim' | 'power' | 'accuracy' | 'flight' = 'aim';
  let previewSec = 0, power = 0;
  let club = 0;                       // which club is in hand
  let wind = new Vector3();           // per-hole wind, applied in flight
  let strokes = 0, overPar = 0;       // golf is scored in strokes against par
  let holeLatch = false;              // A+ P0 juice: one holed punch per hole
  let pickUps = 0;   // triple-par pick-ups this round (owner decision 2026-09-05)
  /** Stick-swing state. Runs ALONGSIDE the 3-click swing, never replacing it:
   *  a stick swing does not express on a touch overlay and 3-click is the
   *  better mobile input, so the mode offers both. */
  let backswing = 0, pulling = false;
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
  const TOTAL = 3;
  const PREVIEW_SEC = 1.8;
  const ACCURACY_CENTER = GH_ACC_CENTER;         // wave value to hit on the way down (one source with the drawn band: core/golfHud)
  const ACCURACY_HALF = GH_ACC_HALF;
  /** A+ mission #5: the card, hole by hole, for the scoreboard between holes. */
  let holeResults: HoleResult[] = [];

  function nextShot(ctx: ModeContext): void {
    round++;
    // ON THE COURSE. VenueKit.buildField(scene, 'golf') builds 60 x 90, so the
    // grass runs z -45..45 — and this put the pin at 42 + (round*31)%28, i.e.
    // up to z 69. Holes 2 and 3 sat off the end of the world, the preview camera
    // flew out over the void behind them, and the watchdog reported a black
    // frame. Kept well inside the field now.
    holePos = new Vector3(((round * 53) % 21) - 10, 0, 26 + ((round * 31) % 13));
    furniture.forEach((f) => f.dispose());
    furniture = buildGolfGreen(ctx.scene, holePos);
    // L2 — THE WIND, READABLE FROM THE COURSE. It was a number in the HUD only,
    // and "course reading" is one of the three pillars the benchmark names: a
    // player should be able to look at the hole and see which way it blows.
    // The flag leans with it, harder in a stronger wind.
    flag?.dispose();
    flag = MeshBuilder.CreateBox('pinFlag', { width: 0.7, height: 0.34, depth: 0.03 }, ctx.scene);
    flag.position = holePos.add(new Vector3(0.35, 1.85, 0));
    flag.material = furniture[0]?.material ?? null;
    ball.position.set(0, 0.05, 0.6);
    meAnim.loop(SPORT_CLIP.golfAddress, { fadeSec: 0.3 });
    strikeIn = 0; pendingStrike = null;
    // HOLE PREVIEW — fly the camera to the green, look back at the tee.
    // Pure camDirector.snapTo, timer-bounded, cannot stall.
    strokes = 0;
    holeLatch = false;                // A+ P0: a new hole gets its own punch
    settling = false;
    // COURSE READING — the third pillar, and none of its inputs existed. Wind
    // is the cheapest honest one: it is visible in the HUD before you commit,
    // it pushes the ball for the whole flight, and it makes the reticle a
    // starting point rather than an answer.
    const wa = (round * 2.399) % (Math.PI * 2);
    wind = new Vector3(Math.sin(wa) * (1.2 + (round % 3) * 0.9), 0, Math.cos(wa) * 0.6);
    if (flag) {
      // Point the flag downwind and lean it by strength — the reading a golfer
      // actually takes before choosing a club.
      flag.rotation.y = Math.atan2(wind.x, wind.z);
      flag.rotation.z = -Math.min(0.9, wind.length() * 0.35);
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
      hint: clutch ? 'FINAL SHOT — study the green' : `HOLE ${round} — ${Math.round(Vector3.Distance(ball.position, holePos))}m out`,
    });
  }

  /** The golf frame: strokes against par, which is how the sport is scored. */
  function card(): string { return cardString(overPar); }

  /** Strike the ball. BOTH swings end here, so the 3-click and the stick
   *  produce the same shot from the same two inputs — power and side error —
   *  instead of two implementations that drift apart. */
  /** On the green the club is taken out of your hands — you putt. */
  function onGreen(): boolean {
    return Vector3.Distance(new Vector3(ball.position.x, 0, ball.position.z), holePos) <= PUTT_RANGE_M;
  }

  function strike(ctx: ModeContext, pwr: number, sideErr: number): void {
    // PUTTING. Half of golf, and the mode had none of it: every shot was a full
    // swing, so a ball 2m from the pin was struck with a driver. Inside
    // PUTT_RANGE the putter is automatic — you do not choose a club on the
    // green — and it rolls the ball along the ground rather than flying it,
    // which is why its launch is near zero and its forgiveness is the lowest in
    // the bag: on the green the LINE is the whole shot.
    const c = onGreen() ? PUTTER : GOLF_CLUBS[club];
    phase = 'flight';
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
    const dir = reticle.pos.subtract(new Vector3(0, 0.4, 0)).normalize();
    // A forgiving club punishes a bad strike less. That is the trade for its
    // shorter reach, and it is the reason not to simply always take the driver.
    const spread = (sideErr * 6) / c.forgive;
    const hookSlice = new Vector3(spread * (Math.random() < 0.5 ? -1 : 1), 0, 0);
    // Scaled to THIS course. The holes sit 42-70m out and a full driver was
    // carrying ~240m, so every shot sailed the green, the hole could never be
    // completed, and the ball ended up somewhere the camera could not hold.
    // A driver now reaches the far pin and a wedge does not — which is what
    // makes the club a decision instead of a label.
    const vel = dir.scale((10 + pwr * 15) * c.reach)
      .add(new Vector3(0, (5 + pwr * 5) * c.launch, 0))
      .add(hookSlice);
    pendingVel = vel;   // the follow camera sets up behind the line of the coming shot while the club comes down
    pendingStrike = () => {
      SoundKit.play('whoosh', { pitch: 0.9 });
      ctx.feel?.impact?.(0.25 + pwr * 0.35);   // the contact feel, ON the contact (A+ P0 weight unchanged)
      flight.launch(ball.position, vel);
    };
    if (strikeIn <= 0) { pendingStrike(); pendingStrike = null; }
    ctx.setHud({
      accuracy: sideErr === 0 ? 'PURE' : sideErr > 0.5 ? 'SHANKED' : 'DRIFTED',
      hint: '', strokes,
    });
  }

  function backToTee(ctx: ModeContext): void {
    phase = 'aim';
    settling = false;
    ctx.camDirector.suspended = false;      // the cinematic is over
    pulling = false; backswing = 0;
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
    ctx.camDirector.mode = 'follow';
    ctx.camDirector.snapTo(me.root.position, holePos);
    const toPin = Vector3.Distance(new Vector3(ball.position.x, 0, ball.position.z), holePos);
    const windDeg = windBearingDeg(wind, pinVec);
    ctx.setHud({
      club: onGreen() ? PUTTER.id : GOLF_CLUBS[club].id,
      wind: `${wind.length().toFixed(0)} m/s`,
      // A+ mission #5 (Everybody's Golf read): bearing + word for the lie panel, the hole for the chip; the meter keys
      // below are published while the three-press swing runs
      windDeg, windWord: windWord(windDeg, wind.length()), hole: round, holes: TOTAL, par: GOLF_PAR[Math.min(round, GOLF_PAR.length) - 1] ?? 3,
      meterT: null, swingPhase: null, powerLock: null, board: null, boardTitle: '',
      pin: `${toPin.toFixed(0)}m`,
      strokes, card: card(),
      hint: 'A to start the swing · A at the top for POWER · A in the accuracy band · B cycles CLUB · or pull the stick back and drive through',
    });
  }

  return {
    modeId: 'golf', mood: 'alpine', camPreset: 'links',

    async load(ctx: ModeContext) {
      golfVenue = mountVenue(ctx, 'golf_loop', { keepGameplayCamera: true });
      VenueKit.buildField(ctx.scene, 'golf');   // the kit green and pines stay under the spec's sky and props; the spec's pale ground hides
      // Same stacking as football, same rename, same reason: two coplanar meshes under one name made the
      // physics floor the hidden one (see FootballRushMode).
      if (golfVenue) for (const m of golfVenue.built.root.getChildMeshes()) if (m.name === 'venue_ground') { m.visibility = 0; m.name = 'venue_ground_under'; m.isPickable = false; }
      EffectsKit.ambient(ctx.scene, 'park');
      me = await spawnAthlete(ctx, CFG.heroUrl, new Vector3(-0.5, 0, 0), 0, SPORT_CLIP.golfAddress);
      meAnim = new BeatOwner(me.animator); meAnim.loop(SPORT_CLIP.golfAddress);
      ball = MeshBuilder.CreateSphere('gball', { diameter: 0.1 }, ctx.scene);
      flight = new Flight(ball, -9.8);
      reticle = new Reticle(ctx.scene, new Vector3(0, 1.3, 12), { x: 5, y: 1.1 });
      meter = new PowerMeter();
      ctx.objectiveRef.current = holePos;
      ctx.camDirector.setFixedBehind(me.root.position, 0, 'swing');
      assertSpawned(ctx.scene, { hero: me.root, minWorldMeshes: 6, modeId: 'golf' });
      round = 0; pts = 0; ended = false;
      overPar = 0; pickUps = 0; holeResults = [];   // the round's tallies start clean (overPar used to carry across plays on one page)
      // 'wind', not 'dojo' — a martial-arts room tone on an alpine golf course.
      // Same class of mistake as the skatepark's stadium crowd bed.
      SoundKit.startAmbient('wind');
      // L4 — a gallery behind the tee. A links hole is watched; and they are
      // instanced silhouettes, so the whole gallery costs two draws.
      // two rows flanking the tee box (x ±8.5, z −1…+5): the old rows behind the tee at z −4 / −6 sat on the swing camera's
      // plane (offset z −4.2) and two bodies stood beside the lens, over the phone pad (measured 2026-09-06)
      gallery = new Onlookers(ctx.scene, Array.from({ length: 10 }, (_, i) => new Vector3(
        (i < 5 ? -8.5 : 8.5) + (i % 2) * (i < 5 ? -0.8 : 0.8),
        0,
        -1 + (i % 5) * 1.5,
      )), '#3d4a3a');
      ctx.setHud({ score: 0 });
      nextShot(ctx);
    },

    onInput(ctx: ModeContext, e: FelInput) {
      SoundKit.unlock();
      if (e.t === 'stick' && e.side === 'L') {
        stickX = e.x; stickY = e.y;
        // THE ANALOG STICK SWING — PGA Tour 2K's signature, added ALONGSIDE the
        // 3-click rather than replacing it. Pull back to load, drive through to
        // strike: how far you pulled is the power, and where the stick sits
        // laterally as you come through is the path, so a swing that drifts off
        // line hooks or slices exactly as a real one does.
        if (phase === 'aim') {
          if (e.y <= -SWING_STICK) {
            pulling = true;
            backswing = Math.max(backswing, Math.min(1, -e.y));
          } else if (pulling && e.y >= SWING_STICK) {
            pulling = false;
            strike(ctx, backswing, Math.min(1, Math.abs(e.x)));
            backswing = 0;
          }
        }
      }
      if (e.t === 'button' && e.btn === 'A' && e.pressed) {
        if (phase === 'preview') { backToTee(ctx); return; }   // skip the flyover
        if (phase === 'aim') { phase = 'power'; meter.start(); ctx.setHud({ hint: 'SWING at the top for POWER' }); }
        else if (phase === 'power') {
          power = meter.value;                    // keep the wave running — accuracy rides it down
          phase = 'accuracy';
          SoundKit.play('uiTick', { pitch: 1.2 });
          ctx.setHud({ power: Math.round(power * 100), hint: 'NOW — strike in the accuracy band!' });
        } else if (phase === 'accuracy') {
          const err = Math.abs(meter.stop() - ACCURACY_CENTER);
          const clean = err <= ACCURACY_HALF;
          strike(ctx, power, clean ? 0 : Math.min(1, (err - ACCURACY_HALF) * 3));
        }
      }
      // CLUB SELECTION — the first pillar the lock names, and it did not exist.
      if (e.t === 'button' && e.btn === 'B' && e.pressed && phase === 'aim' && !onGreen()) {
        club = (club + 1) % GOLF_CLUBS.length;
        SoundKit.play('uiTick', { pitch: 1.1 });
        const toPin = Vector3.Distance(new Vector3(ball.position.x, 0, ball.position.z), holePos);
        ctx.setHud({ club: GOLF_CLUBS[club].id, pin: `${toPin.toFixed(0)}m` });
        ctx.juice.callout(`${GOLF_CLUBS[club].id.toUpperCase()} · PIN ${toPin.toFixed(0)} m`, '#8fe0a0');   // the change is SAID, not only a HUD field
      } else if (e.t === 'button' && e.btn === 'B' && e.pressed) {
        // MECHANICS PASS (2026-09-15): CLUB was silent 13 of 14 presses — it only works while aiming off the green
        refuse(ctx, onGreen() ? 'PUTTER ON THE GREEN' : phase === 'aim' ? 'CLUB' : 'CHOOSE A CLUB WHILE AIMING');
      }
    },

    update(ctx: ModeContext, dt: number) {
      if (ended) return;
      meter.update(dt);
      if (phase === 'preview') {
        previewSec += dt;
        if (previewSec >= PREVIEW_SEC) backToTee(ctx);
        return;                                   // camera holds the green view
      }
      if (phase === 'power' || phase === 'accuracy') ctx.setHud({ power: Math.round(meter.value * 100), meterT: Number(meter.value.toFixed(3)), swingPhase: phase, powerLock: phase === 'accuracy' ? Math.round(power * 100) : null });
      if (phase === 'aim') reticle.update(dt, stickX, stickY);
      // Phase 3 wants update() EVERY frame; this mode drove its camera only
      // during flight, so between shots the camera never converged on its fixed
      // framing — it sat wherever the last snap left it, which after a long
      // drive was far enough away to project past the far plane and, twice in a
      // capture, to render black.
      gallery?.update(dt);
      if (phase !== 'flight') {
        // A unit vector toward the pin stands in for velocity, which is how the
        // director is told which way "behind" is for a stationary subject.
        const aimDir = holePos.subtract(me.root.position);
        aimDir.y = 0;
        if (aimDir.lengthSquared() > 1e-4) aimDir.normalize(); else aimDir.set(0, 0, 1);
        ctx.camDirector.update(me.root.position, aimDir, holePos);
      }
      if (phase === 'flight') {
        if (strikeIn > 0) {
          // the club is still coming down: the ball waits on the contact key
          strikeIn -= dt;
          if (strikeIn <= 0 && pendingStrike) { pendingStrike(); pendingStrike = null; }
          ctx.camDirector.update(ball.position, pendingVel ?? Vector3.Zero(), holePos);
          return;
        }
        // Wind acts for the whole flight, so a long club spends longer in it.
        if (flight.active) flight.vel.addInPlace(wind.scale(dt));
        const flying = flight.step(dt);
        ctx.camDirector.update(ball.position, flight.vel, holePos);
        if (!flying && !settling) {
          const flat = new Vector3(ball.position.x, 0, ball.position.z);
          // Owner decision (2026-09-05): TRIPLE-PAR PICK-UP. At three times par the hole is scored as triple par and the
          // round moves on — a hole that is never holed used to never end (traced: the ball wandered and re-dropped for
          // 330 s on hole 1). A real player rarely reaches it; a stuck one always finishes the card.
          const parNow = GOLF_PAR[Math.min(round, GOLF_PAR.length) - 1] ?? 3;
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
            setTimeout(() => {
              ctx.setHud({ banner: '', board: null, boardTitle: '' });
              if (round >= TOTAL) { ended = true; SoundKit.play('whistle'); ctx.end('CARD_IN', pts, { holes: TOTAL, overPar, pickUps }); }
              else nextShot(ctx);
            }, 1600);
          };
          // OUT OF BOUNDS — a stroke penalty and a drop, which is the real
          // rule and also stops a shanked drive leaving the course entirely.
          // Out of bounds is the EDGE OF THE FIELD (60 x 90 → ±30, ±45), not an
          // arbitrary number larger than it.
          if (Math.abs(ball.position.x) > 28 || ball.position.z > 43 || ball.position.z < -6) {
            strokes++;
            if (strokes >= parNow * 3) { pickUp('triple par, out of bounds'); return; }
            const back = holePos.subtract(new Vector3(0, 0, 14));
            ball.position.set(back.x, 0.05, Math.max(1, back.z));
            SoundKit.play('miss');
            ctx.feel?.impact?.(0.15);   // A+ P0: OB is a light feel only
            console.info('[GOLF-JUICE] out of bounds (light feel)');
            ctx.setHud({ banner: `OUT OF BOUNDS — penalty stroke (${strokes})`, strokes });
            settling = true;
            setTimeout(() => { ctx.setHud({ banner: '' }); backToTee(ctx); }, 1300);
            return;
          }
          const dist = Vector3.Distance(flat, holePos);

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
            setTimeout(() => { ctx.setHud({ banner: '' }); backToTee(ctx); }, 1100);
            return;
          }

          // HOLED. Golf is scored in strokes against par.
          const par = GOLF_PAR[Math.min(round, GOLF_PAR.length) - 1] ?? 3;
          const rel = strokes - par;
          overPar += rel;
          const clutch = round === TOTAL;
          const name = holeName(strokes, par);
          holeResults.push({ hole: round, par, strokes });
          const gained = Math.round(Math.max(20, 120 - rel * 40) * (clutch ? CLUTCH_MULT : 1));
          pts += gained;
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
            banner: `${name} — ${strokes} on a par ${par}${clutch ? ' · CLUTCH' : ''}`,
            board: holeBoard(holeResults, TOTAL), boardTitle: round >= TOTAL ? 'CARD IN' : `NEXT — HOLE ${round + 1} · PAR ${GOLF_PAR[Math.min(round + 1, GOLF_PAR.length) - 1] ?? 3}`,
          });
          settling = true;
          setTimeout(() => {
            ctx.setHud({ banner: '', board: null, boardTitle: '' });
            if (round >= TOTAL) {
              ended = true; SoundKit.play('whistle');
              ctx.end('CARD_IN', pts, { holes: TOTAL, overPar, pickUps });
            } else nextShot(ctx);
          }, 2600);   // long enough to read the card
        }
        return;
      }
      ctx.camDirector.update(me.root.position, Vector3.Zero(), reticle.pos);
    },

    dispose() { golfVenue?.dispose?.(); golfVenue = null; gallery?.dispose(); gallery = null; flag?.dispose(); flag = null; me?.dispose(); furniture.forEach((f) => f.dispose()); ball?.dispose(); reticle?.dispose(); SoundKit.stopAmbient(); },
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
// Deterministic by round (the whole mode's pitch formula already is), and
// EXPORTED so the PCI driver and the headless suite read the mode's own
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

/** The pitch mix: fastballs to learn on, then a real mix. Deterministic. */
const PITCH_MIX: PitchType[] = ['fastball', 'fastball', 'slider', 'fastball', 'changeup', 'slider', 'fastball', 'changeup', 'slider', 'fastball'];

export function pitchSpec(round: number): PitchSpec {
  const type = PITCH_MIX[(round - 1) % PITCH_MIX.length];
  const ax = (Math.sin(round * 2.7) * 0.8) * ZONE_HALF.x;
  const ay = 1.05 + Math.cos(round * 1.9) * ZONE_HALF.y;
  const speed = (14 + round * 0.5) * (type === 'changeup' ? 0.78 : 1);
  // sliders break to alternating sides; hard enough that covering the aim
  // point means the edge of the bat, not the barrel
  const breakShift = type === 'slider' ? (round % 2 === 0 ? 0.45 : -0.45) : 0;
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
  const TOTAL = 20;
  let tally: DerbyTally = freshDerby();
  let rivalTarget = 0;                 // the rival's homers for the round, ticking in through it
  let homerLatch = false;              // A+ P0 juice: the homer's ONE punch per pitch
  const lastOut = (): boolean => tally.outs === OUTS_CAP - 1;

  // THE BATTING CAMERA LOOKS OUT TO THE OUTFIELD (owner, 2026-09-15: "face outfield so we can see the pitcher and our
  // player from over the shoulder so we can time the pitch"). setFixedBehind(batter, π) parked the lens at z +4.2 —
  // BETWEEN the batter and the mound, looking back at the plate — so the pitcher was behind the camera and the pitch
  // arrived from off-screen: the one thing a hitter times off was the one thing you could not see. The lens now sits
  // behind the plate, off the batter's back shoulder (the batter stands at x −0.7 facing +x, so his back is −x), low
  // enough to read the release point, and aims down the pitch line: the batter frames the left of the shot, the
  // pitcher and the whole flight of the ball sit in the middle. The aim point is steady (PITCHER_VIEW) rather than the
  // moving ball — the 0.4 lerp onto a 17 m/s pitch is what used to drag the batter out of frame.
  const BATTING_CAM = new Vector3(-1.75, 1.85, -3.4);
  const PITCHER_VIEW = new Vector3(0, 1.45, 18);
  function battingCam(ctx: ModeContext, snap: boolean): void {
    ctx.camDirector.setFixed(BATTING_CAM, 1.25, snap);
    if (snap) ctx.camera.setTarget(Vector3.Lerp(me.root.position.add(new Vector3(0, 1.25, 0)), PITCHER_VIEW, 0.4));
  }

  function pitch(ctx: ModeContext): void {
    round++;
    swung = false; incoming = true;
    homerLatch = false;                // A+ P0: one homer punch per pitch
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
    const spec = pitchSpec(round);
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
    const rivalLive = Math.round(rivalTarget * rivalProgress(round / TOTAL));
    ctx.setHud({
      round: `PITCH ${round}`,
      pitch: spec.label,
      homers: tally.homers, outs: tally.outs, outsCap: OUTS_CAP, longest: tally.longestFt, rivalHomers: rivalLive, distance: '',
      contact: '',                              // last pitch's grade is over
      hint: clutch ? `FINAL PITCH — STRIKE as it crosses the plate` : 'STRIKE as it crosses the plate · read the break',
    });
    // the dev HUD dump carries the real PCI position so drivers can CLOSE
    // THE LOOP instead of integrating their own (the open-loop model
    // drifted enough that the covering bot once lost to the blind control)
    ctx.setHud({ pci: `${pci.pos.x.toFixed(2)},${pci.pos.y.toFixed(2)}` });
  }

  return {
    modeId: 'baseball', mood: 'goldenHour', camPreset: 'court',

    async load(ctx: ModeContext) {
      derbyVenue = mountVenue(ctx, 'derby', { keepGameplayCamera: true });
      if (!derbyVenue) VenueKit.buildField(ctx.scene, 'ballpark');   // spec first, kit fallback
      EffectsKit.ambient(ctx.scene, 'park');
      furniture = buildPlateAndMound(ctx.scene);
      // Phase 6 — the ballpark was a green plain with a mound: nothing for a
      // dinger to clear, nobody watching. The outfield wall (constant 38m
      // from the plate, foul poles, distance band) is what a home run clears;
      // the baseline crowds are who it clears it in front of.
      furniture.push(...buildBallparkOutfield(ctx.scene));
      gallery = new Onlookers(ctx.scene, [
        // first-base line (in-frame right of the pitch line) and third-base
        // line — flanking the infield view, outside the widest pitch (|x|<1)
        ...[0, 1, 2, 3, 4, 5].map((i) => new Vector3(6.5 + i * 0.9, 0, 3 + i * 1.4)),
        ...[0, 1, 2, 3, 4, 5].map((i) => new Vector3(-6.5 - i * 0.9, 0, 3 + i * 1.4)),
      ]);
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
          /** The fist, not the wrist: a hand bone's origin is the wrist, the handle sits a palm further along the forearm line. */
          const fist = (hand: typeof lh, fore: typeof lf): Vector3 => {
            hand.computeWorldMatrix(true);
            const h = hand.getAbsolutePosition().clone();
            if (!fore) return h;
            fore.computeWorldMatrix(true);
            const along = h.subtract(fore.getAbsolutePosition());
            return along.lengthSquared() > 1e-8 ? h.addInPlace(along.normalize().scaleInPlace(BAT_PALM_M)) : h;
          };
          batObs = ctx.scene.onBeforeRenderObservable.add(() => {
            if (batRef.isDisposed()) return;
            const fL = fist(lh, lf), fR = fist(rh, rf);
            const grip = fL.add(fR).scaleInPlace(0.5);
            const d = batLineAt(batSwingSec);
            const yaw = meRef.root.rotationQuaternion ? meRef.root.rotationQuaternion.toEulerAngles().y : meRef.root.rotation.y;
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
            const dir = new Vector3(dx * Math.cos(yaw) + d[2] * Math.sin(yaw), d[1], -dx * Math.sin(yaw) + d[2] * Math.cos(yaw));
            // Hands that come apart through the swing lie ON the handle, so the line between the fists pulls the handle
            // onto it (signed along the authored line). Measured on the first cut: fists 6 cm off the axis at the swing
            // median, 29 of 66 swing frames past 8 cm. A full pull fixed the grip but let a stacked pair of fists tip the
            // barrel into the dirt (14 swing frames below −0.3); at 0.7 the fists stay on the handle (2.9 cm median, none past
            // 8 cm) and the barrel only dips ≤ 27° at the launch and through the zone, the way a real swing's does.
            const span = fR.subtract(fL); const sep = span.length();
            if (sep > BAT_SPLIT_M) {
              span.scaleInPlace((Vector3.Dot(span, dir) < 0 ? -1 : 1) / sep);
              const k = BAT_HANDS_PULL * Math.min(1, (sep - BAT_SPLIT_M) / 0.08);
              dir.scaleInPlace(1 - k).addInPlace(span.scaleInPlace(k)).normalize();
            }
            Quaternion.FromUnitVectorsToRef(Vector3.Up(), dir, batRef.rotationQuaternion!);
            // the cylinder is centred on its origin: the knob just past the fists, the barrel out along the line
            batRef.position.copyFrom(grip.addInPlace(dir.scaleInPlace(BAT_LEN / 2 - BAT_KNOB_M)));
          });
        }
      }
      pitcher = await spawnFoe(ctx, CFG.heroUrl, new Vector3(0, 0.35, 18), Math.PI, SPORT_CLIP.idle);
      pitcherAnim = new BeatOwner(pitcher.animator); pitcherAnim.loop(SPORT_CLIP.idle);
      throwIn = 0; pendingThrow = null;
      pci = new Reticle(ctx.scene, new Vector3(0, 1.1, 0.2), { x: ZONE_HALF.x, y: ZONE_HALF.y });
      // ANIM-SURGICAL: the PCI ring is a torus built flat (XZ) under a billboard, which turns its PLANE edge-on to the camera —
      // behind the batter it drew as a glowing cyan stick beside the fists, a second 'bat' (the eye's bat-detach frames).
      // Stood up once in its own vertices, the billboard shows the ring it was meant to be. (Shared Reticle: follow-up.)
      (pci.mesh as Mesh).bakeTransformIntoVertices(Matrix.RotationX(Math.PI / 2));
      ctx.heroRef.current = me.root;
      ball = MeshBuilder.CreateSphere('bball', { diameter: 0.12 }, ctx.scene);
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
        const at = me ? me.root.position.add(new Vector3(0, 1.1, 0)) : new Vector3(0, 1.1, 0);
        return { pose, legs, aim: at, eyes: at, window: w };
      }, 'PITCH-PP');

      round = 0; pts = 0; ended = false;
      SoundKit.startAmbient('stadium');
      tally = freshDerby(); rivalTarget = 3 + Math.floor(Math.random() * 6);   // a rival round of 3–8 homers
      ctx.setHud({ score: 0 });
      pitch(ctx);
    },

    onInput(ctx: ModeContext, e: FelInput) {
      SoundKit.unlock();
      if (e.t === 'stick' && e.side === 'L') { stickX = e.x; stickY = e.y; }
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
        if (timing <= 0) return;
        incoming = false;
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
        flight.launch(ball.position, new Vector3((Math.random() - 0.5) * 4, 18 * launch * q + 4, 16 + q * 18));
        const distPts = Math.round(q * (80 + launch * 60) * (clutch ? CLUTCH_MULT : 1));
        pts += distPts;
        // A+ mission #7: a homer clears the band (q > 0.7); anything less is an OUT. Distance in feet is the derby's
        // presentation number — read off the launch (estimated: 300 ft floor, ~470 ft for a pure full-launch strike).
        const homer = q > 0.7;
        // A+ P0 juice: the contact feel is ONE thud either way (feel.impact plays its own). A homer then gets the latched punch —
        // hit-stop + shake + gold flash; an out gets clank weight (0.4) and no make punch. The score cheer stays a homer's.
        ctx.feel?.impact?.(homer ? 0.3 + q * 0.5 : 0.4);
        if (homer && !homerLatch) {
          homerLatch = true;
          ctx.juice.hitStop(60); ctx.juice.shake(0.14, 160); ctx.juice.flash('#FFD700', 130);
          console.info('[DERBY-JUICE] homer punch');
        } else if (!homer) console.info('[DERBY-JUICE] out (clank weight)');
        const distFt = homer ? Math.round(300 + q * (80 + launch * 60) * 1.6) : 0;
        const roundOver = bankSwing(tally, homer, distFt);
        // The subject of a hit is the BALL — the same subject-switch golf
        // makes for its ball flight. And the parked swing camera PANS too
        // slowly for a pulled fly ball (measured: one off-LEFT warning as
        // the ball beat the pan), so the flight gets the follow camera —
        // again, exactly golf's fix. Both restore on the next pitch.
        ctx.heroRef.current = ball;
        ctx.camDirector.mode = 'follow';
        if (homer) SoundKit.play('score', { pitch: q > 0.85 ? 1.2 : 1 });   // A+ P0: the score cheer is the homer's; an out clanks
        else SoundKit.play('impact', { pitch: 1.35, volume: 0.4 });
        gallery?.cheer(q);                       // louder for a dinger than a dribbler
        ctx.setHud({
          score: pts,
          contact: `${cover >= 0.9 ? 'PURE' : cover >= 0.5 ? 'OFF-CENTRE' : 'EDGE OF THE BAT'} · ${pitchLabel}`,
          banner: homer ? (clutch ? `CLUTCH DINGER! +${distPts}` : q > 0.85 ? `DINGER! +${distPts}` : `HOMER +${distPts}`) : `OUT — ${cover >= 0.5 ? 'caught on the track' : 'weak contact'}`,
          homers: tally.homers, outs: tally.outs, longest: tally.longestFt,
          distance: homer ? distanceLine(distFt, tally.longestFt) : '',
        });
        setTimeout(() => ctx.setHud({ banner: '' }), 900);
        if (roundOver) { ended = true; SoundKit.play('whistle'); setTimeout(() => ctx.end('DERBY_END', pts, { pitches: round, homers: tally.homers, outs: tally.outs, longestFt: tally.longestFt, rivalHomers: rivalTarget }), 1000); }
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
        // close the loop on this instead of integrating their own model)
        ctx.setHud({ pci: `${pci.pos.x.toFixed(2)},${pci.pos.y.toFixed(2)}` });
      }
      // the slider's LATE break — armed in the last 45% of the flight,
      // integrated as velocity so it bends rather than teleports
      if (incoming && flight.active && pitchBreakA !== 0) {
        pitchT += dt;
        if (pitchT > pitchTotalSec * 0.55) {
          pitchBreakV += pitchBreakA * dt;
          ball.position.x += pitchBreakV * dt;
        }
      }
      const flying = flight.step(dt);
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
        // the whiff names the pitch — The Show tells you what beat you
        ctx.setHud({ banner: `WHIFF — ${pitchLabel === 'SLD' ? 'the slider broke late' : pitchLabel === 'CHG' ? 'the change-up pulled the string' : 'beat you with heat'}`, outs: tally.outs });
        setTimeout(() => ctx.setHud({ banner: '' }), 900);
        if (whiffOut) { ended = true; SoundKit.play('whistle'); setTimeout(() => ctx.end('DERBY_END', pts, { pitches: round, homers: tally.homers, outs: tally.outs, longestFt: tally.longestFt, rivalHomers: rivalTarget }), 1000); return; }
      }
      if (!flying && !incoming && !pending) {
        if (round >= TOTAL) { ended = true; SoundKit.play('whistle'); return ctx.end('DERBY_END', pts, { pitches: TOTAL, homers: tally.homers, outs: tally.outs, longestFt: tally.longestFt, rivalHomers: rivalTarget }); }
        pending = true;
        setTimeout(() => { pending = false; if (!ended) pitch(ctx); }, 800);
      }
      // During the PITCH the fixed swing camera aims at where the pitch is
      // GOING (the strike zone), never at the moving ball: a 0.4 lerp onto a
      // 17 m/s pitch drags the aim point past the camera's own shoulder and
      // the batter leaves the frame on inside lines (measured: off RIGHT,
      // rounds 4–6, always mid-flight of the pitch). The broadcast read is
      // the zone; the ball comes to it. After contact the follow cam owns
      // the ball (see the contact branch) and this objective is moot.
      gallery?.update(dt);
      ctx.camDirector.update(me.root.position, Vector3.Zero(), flying && !incoming ? ball.position : PITCHER_VIEW);   // a hit ball is followed; a pitch is watched from the plate
    },

    dispose() { batPosture?.dispose(); batPosture = null; pitchPosture?.dispose(); pitchPosture = null; derbyVenue?.dispose?.(); derbyVenue = null; gallery?.dispose(); gallery = null; if (batObs) { bat?.getScene().onBeforeRenderObservable.remove(batObs); batObs = null; } batSwingSec = null; bat?.dispose(); bat = null; me?.dispose(); pitcher?.dispose(); furniture.forEach((f) => f.dispose()); ball?.dispose(); SoundKit.stopAmbient(); },
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
  let ball: AbstractMesh, flight: Flight, reticle: Reticle, meter: PowerMeter;
  let round = 0, goals = 0, stylePts = 0, stickX = 0, stickY = 0;
  let goalLatch = false;               // A+ P0 juice: the goal's ONE punch per kick
  let phase: 'aim' | 'power' | 'flight' | 'keep' = 'aim';
  let keeperTargetX = 0, ended = false;
  // THE KEEPER ROUND (owner decision 2026-09-03): on their kick you are the
  // keeper. The rival's body runs up with a tell, you dive, KeeperCore judges.
  let keepPlan: RivalKickPlan | null = null;
  let keepT = 0;                               // seconds into the rival's run-up
  let keepStruck = false, keepStrikeAt = 0, keepDive: DiveSign = 0, keepDiveAt: number | null = null;
  const KEEP_RUNUP_SEC = 1.15;
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

  function kickLabel(): string {
    return round <= REGULATION_KICKS ? `KICK ${round}/${REGULATION_KICKS}` : 'SUDDEN DEATH';
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
    const hint = mustScore
      ? 'SCORE OR YOU ARE OUT — feint, aim, bury it'
      : s.phase === 'suddenDeath'
        ? 'SUDDEN DEATH — score and the keeper must answer'
        : 'Snap the stick side-to-side to FEINT (max 2) · aim · KICK twice';
    ctx.setHud({
      round: kickLabel(), feints: 0, ...kicksHud(), dive: '',
      score: `${goals}–${themGoals}`,
      hint,
    });
  }

  /** Street-style feint: a hard left↔right stick snap during aim. */
  /** THEIR kick, kept by you. The AI keeper's body becomes the kicker at the
   *  spot; you stand on the line; the camera sits behind the goal. */
  function startKeeperRound(ctx: ModeContext): void {
    const sd = round > REGULATION_KICKS;
    keepPlan = planRivalKick(Math.random, sd);
    keepT = 0; keepStruck = false; keepDive = 0; keepDiveAt = null;
    ctx.setHud({ ...kicksHud(), dive: 'THEIR KICK — read the run-up · DIVE ◀ ▶ as he strikes', kickPower: null });
    phase = 'keep';
    keeper.root.position.set(SPOT.x, 0, SPOT.z - 2.2); keeper.root.rotation.set(0, 0, 0);
    keeperAnim.loop(SPORT_CLIP.moveLoop, { fadeSec: 0.2 });
    me.root.position.copyFrom(GOAL_LINE); me.root.rotation.set(0, Math.PI, 0);
    meAnim.loop(SPORT_CLIP.keeperIdle, { fadeSec: 0.25 });
    keepKickIn = 0; pendingKeepKick = null;
    ball.position.set(SPOT.x, 0.11, SPOT.z + 0.3);
    ctx.camDirector.setFixedBehind(SPOT, 0, 'keeper', true);   // high behind the spot, the keeper faces the camera at the goal
    ctx.setHud({ hint: `THEIR KICK — read the run-up · dive ◀ / ▶ as he strikes${sd ? ' · sudden death: he lies more' : ''}`, banner: '' });
  }
  function afterTheirKick(ctx: ModeContext): void {
    if (ended) return;
    ctx.setHud({ banner: '' });
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
      ctx.end(won ? 'SHOOTOUT_WIN' : 'SHOOTOUT_LOSS', goals * 20 + stylePts, { goals, stylePts, themGoals, sdRounds, decidedBy: decidedBy === 'style' ? 1 : decidedBy === 'later-save' ? 2 : 3 });
      return;
    }
    if (s.phase === 'decided' && s.winner) {
      ended = true;
      SoundKit.play('whistle');
      const won = s.winner === 'you';
      if (won) SoundKit.play('crowdCheer');
      ctx.end(won ? 'SHOOTOUT_WIN' : 'SHOOTOUT_LOSS', goals * 20 + stylePts,
        { goals, stylePts, themGoals, sdRounds: Math.max(0, round - REGULATION_KICKS) });
      return;
    }
    me.root.position.set(-0.4, 0, -1.6); me.root.rotation.set(0, 0, 0);
    meAnim.loop(SPORT_CLIP.penaltyIdle, { fadeSec: 0.25 });
    nextKick(ctx);
    ctx.camDirector.setFixedBehind(me.root.position, 0, 'flight', true);
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
      ctx.setHud({ feints, banner: `FEINT${feints > 1 ? ` x${feints}` : '!'}` });
      setTimeout(() => ctx.setHud({ banner: '' }), 500);
    }
    lastFlickSign = sign; lastFlickMs = nowMs;
  }

  return {
    modeId: 'soccer', mood: 'nightGame', camPreset: 'court',

    async load(ctx: ModeContext) {
      penaltyVenue = mountVenue(ctx, 'penalty', { keepGameplayCamera: true });
      if (!penaltyVenue) VenueKit.buildField(ctx.scene, 'pitch');   // spec first, kit fallback
      EffectsKit.ambient(ctx.scene, 'park');
      furniture = buildGoal(ctx.scene);
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
      gallery = new Onlookers(ctx.scene, Array.from({ length: 14 }, (_, i) => {
        const k = i - 6.5;
        // a shallow bank behind the goal — 2 m behind the keeper camera (fixed at z 13.4 on THEIR kick): at 13.2 the camera
        // stood inside a spectator and the whole frame was the inside of a body (measured 2026-09-06)
        return new Vector3(k * 1.5, 0, 15.4 + Math.abs(k) * 0.22);
      }));
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
      flight = new Flight(ball, -9.8);
      reticle = new Reticle(ctx.scene, new Vector3(0, 1.2, 11), { x: 3.3, y: 1.05 });
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
          struck: phase === 'flight' && flight.active,   // the ball is away and travelling
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

      round = 0; goals = 0; stylePts = 0; ended = false;
      themGoals = 0; themKicks = 0; shotHistory = []; hintFlags.read = false; myKicks = []; theirKicks = [];
      SoundKit.startAmbient('stadium');
      ctx.setHud({ score: '0–0' });
      nextKick(ctx);
    },

    onInput(ctx: ModeContext, e: FelInput) {
      SoundKit.unlock();
      if (phase === 'keep') {
        // one dive per kick: d-pad or a decisive stick flick picks the side
        const side: DiveSign = e.t === 'dpad' && e.pressed ? (e.dir === 'left' ? -1 : e.dir === 'right' ? 1 : 0)
          : e.t === 'stick' && e.side === 'L' && Math.abs(e.x) > 0.6 ? (e.x < 0 ? -1 : 1) : 0;
        if (e.t === 'button' && e.pressed && e.btn === 'A') refuse(ctx, 'DIVE WITH ◀ ▶');   // PHONE CONTROLS: STRIKE in the keeper round
        if (side !== 0 && keepDiveAt == null) {
          keepDive = side; keepDiveAt = performance.now();
          dive(meAnim, side); meDove = true; meDiveSign = side;
          ctx.setHud({ hint: '' });
        }
        return;
      }
      if (e.t === 'stick' && e.side === 'L') { stickX = e.x; stickY = e.y; detectFeint(ctx, e.x); }
      if (e.t === 'button' && e.btn === 'A' && e.pressed) {
        if (phase === 'aim') { phase = 'power'; meter.start(); ctx.setHud({ hint: 'KICK at the top of the wave' }); SoundKit.play('uiTick', { pitch: 1.1 }); ctx.juice.callout('POWER — KICK AT THE TOP', '#8fe0a0', 800); }   // PHONE CONTROLS: the run-up is SAID
        else if (phase !== 'power') refuse(ctx, 'BALL IN PLAY');
        else if (phase === 'power') {
          const p = meter.stop();
          phase = 'flight';
          goalLatch = false;              // A+ P0: a fresh kick gets one goal punch
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
          const to = reticle.pos.subtract(ball.position);
          to.y += 1.2;
          const dir = to.normalize();
          const wobble = (1 - p) * 0.5 + feints * FEINT_WOBBLE;
          const vel = dir.scale(22 + p * 8).add(new Vector3((Math.random() - 0.5) * wobble * 4, 0, 0));
          pendingKick = () => {
            SoundKit.play('whoosh');
            ctx.feel?.impact?.(0.3 + p * 0.3);   // the contact feel, ON the contact (A+ P0 weight unchanged)
            keeperDiveSign = keeperTargetX > 0 ? 1 : -1;
            dive(keeperAnim, keeperDiveSign); keeperDove = true;   // the keeper commits as the boot lands
            flight.launch(ball.position, vel);
          };
          ctx.setHud({ power: Math.round(p * 100), kickPower: null, hint: '' });
        }
      }
    },

    update(ctx: ModeContext, dt: number) {
      if (ended) return;
      meter.update(dt);
      if (phase === 'power') ctx.setHud({ power: Math.round(meter.value * 100), kickPower: Math.round(meter.value * 100) });
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
      if (phase === 'flight') {
        if (kickIn > 0) {
          // the run-up / wind-up: the ball waits for the boot
          kickIn -= dt;
          if (kickIn <= 0 && pendingKick) { pendingKick(); pendingKick = null; }
          return;
        }
        keeper.root.position.x += (keeperTargetX - keeper.root.position.x) * 5 * dt;
        flight.step(dt);
        // A scuffed pen can DIE SHORT of the line (weak meter + gravity) —
        // and before the shootout pass that never resolved: the only exit
        // from 'flight' was crossing z 10.9, so an under-hit kick soft-locked
        // the mode with the ball at rest in no man's land. (The depth driver
        // found it in four minutes; the cadence bot never had.)
        const diedShort = !flight.active && ball.position.z < 10.9;
        if (ball.position.z >= 10.9 || diedShort) {
          flight.active = false;
          const inFrame = !diedShort && Math.abs(ball.position.x) < 3.6 && ball.position.y < 2.4 && ball.position.y > 0;
          const saved = !diedShort && Math.abs(ball.position.x - keeper.root.position.x) < 0.9 && ball.position.y < 1.9;
          if (saved) lastSaveBy = 'them';
          const scored = inFrame && !saved;
          shotHistory.push(Math.sign(reticle.pos.x || 0.01));   // the keeper remembers
          if (keeperDove) { keeperDove = false; setTimeout(() => { if (!ended) rise(keeperAnim, keeperDiveSign, SPORT_CLIP.keeperIdle); }, RISE_DELAY_MS); }   // decided: off the ground, a beat later
          myKicks.push(scored ? 'goal' : 'miss');
          if (scored) {
            goals++;
            stylePts += feints * FEINT_STYLE_PTS;
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
          ctx.setHud({
            score: `${goals}–${themGoals}`, ...kicksHud(),
            banner: scored
              ? (feints > 0 ? `GOOOAL! +${feints * FEINT_STYLE_PTS} style` : 'GOOOAL!')
            : diedShort ? 'SCUFFED IT — SHORT' : saved ? 'SAVED' : 'OFF TARGET',
          });
          // YOUR kick, then THEIR answer — the shootout breathes in
          // alternating beats, and a tied fifth round goes to SUDDEN DEATH.
          // YOUR kick, then THEIR kick — and their kick is yours to keep.
          setTimeout(() => { if (!ended) startKeeperRound(ctx); }, 1200);
          phase = 'aim';
        }
        return;
      }
      if (phase === 'keep' && keepPlan) {
        keepT += dt;
        // the run-up: the kicker's body drifts toward the tell side and leans
        if (!keepStruck) {
          const lean = Math.min(1, keepT / KEEP_RUNUP_SEC);
          keeper.root.position.x = SPOT.x + keepPlan.tellSign * 0.55 * lean;
          keeper.root.position.z = SPOT.z - 2.2 * (1 - lean);
          keeper.root.rotation.y = keepPlan.tellSign * 0.18 * lean;
          if (keepT >= KEEP_RUNUP_SEC) {
            keepStruck = true;
            keeperAnim.beat(SPORT_CLIP.penaltyStrike, { fadeSec: 0.08 });
            keeperAnim.loop(SPORT_CLIP.penaltyIdle, { fadeSec: 0.2 });   // a kicker stands after the strike (was the keeper's crouch)
            keepKickIn = KICK_CONTACT_SEC;
            const plan = keepPlan;
            pendingKeepKick = () => {
              keepStrikeAt = performance.now();   // the strike instant the dive is graded against = the boot on the ball
              SoundKit.play('whoosh');
              ball.position.set(SPOT.x, 0.11, SPOT.z + 0.3);
              const to = new Vector3(plan.aimX, plan.aimY + 1.0, 10.9).subtract(ball.position).normalize();
              flight.launch(ball.position, to.scale(25));
            };
          }
        } else if (keepKickIn > 0) {
          // the boot is on its way to the ball; a dive already committed keeps carrying you
          keepKickIn -= dt;
          if (keepDive !== 0) me.root.position.x += (keepDive * 2.4 - me.root.position.x) * 6 * dt;
          if (keepKickIn <= 0 && pendingKeepKick) { pendingKeepKick(); pendingKeepKick = null; }
        } else {
          flight.step(dt);
          // your dive carries you toward the side you chose
          if (keepDive !== 0) me.root.position.x += (keepDive * 2.4 - me.root.position.x) * 6 * dt;
          const diedShort = !flight.active && ball.position.z < 10.9;
          if (ball.position.z >= 10.9 || diedShort) {
            flight.active = false;
            const timing = gradeDive(keepDiveAt == null ? null : (keepDiveAt - keepStrikeAt) / 1000);
            const r = diedShort ? { saved: false, why: 'off_target' as const } : resolveSave(keepDive, timing, ball.position.x, ball.position.y);
            const theyScore = !r.saved && r.why !== 'off_target';
            if (theyScore) themGoals++;
            themKicks++;
            if (meDove) { meDove = false; setTimeout(() => { if (!ended) rise(meAnim, meDiveSign, SPORT_CLIP.keeperIdle); }, RISE_DELAY_MS); }   // decided: off the ground, a beat later
            theirKicks.push(theyScore ? 'goal' : 'miss');
            if (r.saved) { lastSaveBy = 'you'; ctx.juice.scorePop(ball.position, 'SAVED!', '#7CFFB2'); ctx.feel?.impact?.(0.5); }
            SoundKit.play(theyScore ? 'crowdGroan' : 'crowdCheer', { volume: 0.4 });
            ctx.setHud({
              score: `${goals}–${themGoals}`, ...kicksHud(), dive: '',
              banner: r.saved ? (timing === 'perfect' ? 'SAVED! — read it perfectly' : 'SAVED!')
                : r.why === 'wrong_way' ? (keepPlan.feint ? 'THEM: SOLD YOU — the run-up was a feint' : 'THEM: WRONG WAY')
                : r.why === 'too_slow' ? 'THEM: BURIES IT — dive as he strikes'
                : r.why === 'stayed' ? 'THEM: BURIES IT — you stayed home'
                : 'THEM: OFF TARGET',
            });
            keepPlan = null;
            setTimeout(() => afterTheirKick(ctx), 1300);
          }
        }
        // the fixed camera only re-aims inside update(): without this it sat
        // behind the goal still facing the way it had been (measured: hero
        // BEHIND camera on every keeper round)
        ctx.camDirector.update(me.root.position, Vector3.Zero(), ball.position);
        return;
      }
      ctx.camDirector.update(me.root.position, Vector3.Zero(), reticle.pos);
    },

    dispose() { strikerPosture?.dispose(); strikerPosture = null; keeperPosture?.dispose(); keeperPosture = null; penaltyVenue?.dispose?.(); penaltyVenue = null; gallery?.dispose(); gallery = null; me?.dispose(); keeper?.dispose(); furniture.forEach((f) => f.dispose()); ball?.dispose(); reticle?.dispose(); SoundKit.stopAmbient(); },
  };
})();
