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

import { MeshBuilder, Vector3 } from '@babylonjs/core';
import type { AbstractMesh } from '@babylonjs/core';
import type { ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import type { SpawnedCharacter } from '../core/CharacterLibrary';
import { assertSpawned } from '../core/FrameGuard';
import {
  spawnAthlete, Reticle, PowerMeter, Flight, swingQuality,
  buildTennisNet, buildGolfGreen, buildPlateAndMound, buildGoal,
} from './aimSwingCore';
import { SPORT_CLIP } from '../anim/clipRegistry';
import { SoundKit } from '../audio/SoundKit';
import { VenueKit } from '../visual/VenueKit';
import { EffectsKit } from '../visual/EffectsKit';
import { PRECISION_CONFIG as CFG } from './modeConfigs';

const CLUTCH_MULT = 1.5;

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
      opponent = await spawnAthlete(ctx, CFG.heroUrl, new Vector3(0, 0, 11), Math.PI, SPORT_CLIP.tennisIdle);
      ctx.heroRef.current = me.root;                 // spawnAthlete sets heroRef on each call — reassert the player
      ball = MeshBuilder.CreateSphere('tball', { diameter: 0.14 }, ctx.scene);
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
  let furniture: AbstractMesh[] = [];
  let ball: AbstractMesh, flight: Flight, reticle: Reticle, meter: PowerMeter;
  let holePos = new Vector3(0, 0, 55);
  let round = 0, pts = 0, stickX = 0, stickY = 0;
  let phase: 'preview' | 'aim' | 'power' | 'accuracy' | 'flight' = 'aim';
  let previewSec = 0, power = 0;
  let club = 0;                       // which club is in hand
  let wind = new Vector3();           // per-hole wind, applied in flight
  let strokes = 0, overPar = 0;       // golf is scored in strokes against par
  /** Stick-swing state. Runs ALONGSIDE the 3-click swing, never replacing it:
   *  a stick swing does not express on a touch overlay and 3-click is the
   *  better mobile input, so the mode offers both. */
  let backswing = 0, pulling = false;
  let ended = false;
  const TOTAL = 3;
  const PREVIEW_SEC = 1.8;
  const ACCURACY_CENTER = 0.28;                  // wave value to hit on the way down
  const ACCURACY_HALF = 0.1;

  function nextShot(ctx: ModeContext): void {
    round++;
    holePos = new Vector3(((round * 53) % 21) - 10, 0, 42 + ((round * 31) % 28));
    furniture.forEach((f) => f.dispose());
    furniture = buildGolfGreen(ctx.scene, holePos);
    ball.position.set(0, 0.05, 0.6);
    me.animator.play(SPORT_CLIP.golfAddress, { loop: true });
    // HOLE PREVIEW — fly the camera to the green, look back at the tee.
    // Pure camDirector.snapTo, timer-bounded, cannot stall.
    strokes = 0;
    // COURSE READING — the third pillar, and none of its inputs existed. Wind
    // is the cheapest honest one: it is visible in the HUD before you commit,
    // it pushes the ball for the whole flight, and it makes the reticle a
    // starting point rather than an answer.
    const wa = (round * 2.399) % (Math.PI * 2);
    wind = new Vector3(Math.sin(wa) * (1.2 + (round % 3) * 0.9), 0, Math.cos(wa) * 0.6);
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
  function card(): string {
    return overPar === 0 ? 'E' : overPar > 0 ? `+${overPar}` : `${overPar}`;
  }

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
    SoundKit.play('whoosh', { pitch: 0.9 });
    me.animator.play(SPORT_CLIP.golfSwing, {});
    ctx.feel?.impact?.(0.25 + pwr * 0.35);
    const dir = reticle.pos.subtract(new Vector3(0, 0.4, 0)).normalize();
    // A forgiving club punishes a bad strike less. That is the trade for its
    // shorter reach, and it is the reason not to simply always take the driver.
    const spread = (sideErr * 6) / c.forgive;
    const hookSlice = new Vector3(spread * (Math.random() < 0.5 ? -1 : 1), 0, 0);
    flight.launch(
      ball.position,
      // Scaled to THIS course. The holes sit 42-70m out and a full driver was
      // carrying ~240m, so every shot sailed the green, the hole could never be
      // completed, and the ball ended up somewhere the camera could not hold.
      // A driver now reaches the far pin and a wedge does not — which is what
      // makes the club a decision instead of a label.
      dir.scale((10 + pwr * 15) * c.reach)
        .add(new Vector3(0, (5 + pwr * 5) * c.launch, 0))
        .add(hookSlice),
    );
    ctx.setHud({
      accuracy: sideErr === 0 ? 'PURE' : sideErr > 0.5 ? 'SHANKED' : 'DRIFTED',
      hint: '', strokes,
    });
  }

  function backToTee(ctx: ModeContext): void {
    phase = 'aim';
    ctx.camDirector.suspended = false;      // the cinematic is over
    pulling = false; backswing = 0;
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
    const pinVec = holePos.subtract(me.root.position);
    const faceYaw = Math.atan2(pinVec.x, pinVec.z);
    me.root.rotation.y = faceYaw;
    ctx.camDirector.snapTo(me.root.position, holePos);
    ctx.camDirector.setFixedBehind(me.root.position, faceYaw, 'swing');
    const toPin = Vector3.Distance(new Vector3(ball.position.x, 0, ball.position.z), holePos);
    ctx.setHud({
      club: onGreen() ? PUTTER.id : GOLF_CLUBS[club].id,
      wind: `${wind.length().toFixed(0)} m/s`,
      pin: `${toPin.toFixed(0)}m`,
      strokes, card: card(),
      hint: 'B cycles CLUB · SWING for the meter, or pull the stick back and drive through',
    });
  }

  return {
    modeId: 'golf', mood: 'alpine', camPreset: 'court',

    async load(ctx: ModeContext) {
      VenueKit.buildField(ctx.scene, 'golf');
      EffectsKit.ambient(ctx.scene, 'park');
      me = await spawnAthlete(ctx, CFG.heroUrl, new Vector3(-0.5, 0, 0), 0, SPORT_CLIP.golfAddress);
      ball = MeshBuilder.CreateSphere('gball', { diameter: 0.1 }, ctx.scene);
      flight = new Flight(ball, -9.8);
      reticle = new Reticle(ctx.scene, new Vector3(0, 1.3, 12), { x: 5, y: 1.1 });
      meter = new PowerMeter();
      ctx.objectiveRef.current = holePos;
      ctx.camDirector.setFixedBehind(me.root.position, 0, 'swing');
      assertSpawned(ctx.scene, { hero: me.root, minWorldMeshes: 6, modeId: 'golf' });
      round = 0; pts = 0; ended = false;
      // 'wind', not 'dojo' — a martial-arts room tone on an alpine golf course.
      // Same class of mistake as the skatepark's stadium crowd bed.
      SoundKit.startAmbient('wind');
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
      if (phase === 'power' || phase === 'accuracy') ctx.setHud({ power: Math.round(meter.value * 100) });
      if (phase === 'aim') reticle.update(dt, stickX, stickY);
      // Phase 3 wants update() EVERY frame; this mode drove its camera only
      // during flight, so between shots the camera never converged on its fixed
      // framing — it sat wherever the last snap left it, which after a long
      // drive was far enough away to project past the far plane and, twice in a
      // capture, to render black.
      if (phase !== 'flight') ctx.camDirector.update(me.root.position, Vector3.Zero(), holePos);
      if (phase === 'flight') {
        // Wind acts for the whole flight, so a long club spends longer in it.
        if (flight.active) flight.vel.addInPlace(wind.scale(dt));
        const flying = flight.step(dt);
        ctx.camDirector.update(ball.position, flight.vel, holePos);
        if (!flying) {
          const flat = new Vector3(ball.position.x, 0, ball.position.z);
          // OUT OF BOUNDS — a stroke penalty and a drop, which is the real
          // rule and also stops a shanked drive leaving the course entirely.
          if (Math.abs(ball.position.x) > 34 || ball.position.z > 92 || ball.position.z < -6) {
            strokes++;
            const back = holePos.subtract(new Vector3(0, 0, 14));
            ball.position.set(back.x, 0.05, Math.max(1, back.z));
            SoundKit.play('miss');
            ctx.setHud({ banner: `OUT OF BOUNDS — penalty stroke (${strokes})`, strokes });
            setTimeout(() => { ctx.setHud({ banner: '' }); backToTee(ctx); }, 1300);
            phase = 'aim';
            return;
          }
          const dist = Vector3.Distance(flat, holePos);

          // NOT HOLED — play it from where it lies. A hole used to be exactly
          // one shot, scored by proximity, which is why there were no strokes
          // to score against par and no reason to own a wedge.
          if (dist > HOLED_M) {
            SoundKit.play('uiTick');
            ctx.setHud({
              banner: dist <= PUTT_RANGE_M
                ? `ON THE GREEN — ${dist.toFixed(1)}m · stroke ${strokes}`
                : `${dist.toFixed(1)}m from the pin · stroke ${strokes}`,
            });
            setTimeout(() => { ctx.setHud({ banner: '' }); backToTee(ctx); }, 1100);
            phase = 'aim';
            return;
          }

          // HOLED. Golf is scored in strokes against par.
          const par = GOLF_PAR[Math.min(round, GOLF_PAR.length) - 1] ?? 3;
          const rel = strokes - par;
          overPar += rel;
          const clutch = round === TOTAL;
          const name = rel <= -2 ? 'EAGLE' : rel === -1 ? 'BIRDIE' : rel === 0 ? 'PAR'
            : rel === 1 ? 'BOGEY' : `+${rel}`;
          const gained = Math.round(Math.max(20, 120 - rel * 40) * (clutch ? CLUTCH_MULT : 1));
          pts += gained;
          SoundKit.play('score', { pitch: rel < 0 ? 1.35 : 1 });
          ctx.setHud({
            score: pts, strokes, card: card(),
            banner: `${name} — ${strokes} on a par ${par}${clutch ? ' · CLUTCH' : ''}`,
          });
          setTimeout(() => {
            ctx.setHud({ banner: '' });
            if (round >= TOTAL) {
              ended = true; SoundKit.play('whistle');
              ctx.end('CARD_IN', pts, { holes: TOTAL, overPar });
            } else nextShot(ctx);
          }, 1600);
          phase = 'aim';
        }
        return;
      }
      ctx.camDirector.update(me.root.position, Vector3.Zero(), reticle.pos);
    },

    dispose() { me?.dispose(); furniture.forEach((f) => f.dispose()); ball?.dispose(); reticle?.dispose(); SoundKit.stopAmbient(); },
  };
})();

// ══════════════════════════════════════════════════════════ HOME RUN DERBY ══
export const DerbyMode: ModeDefinition = (() => {
  let me: SpawnedCharacter, pitcher: SpawnedCharacter;
  let furniture: AbstractMesh[] = [];
  let ball: AbstractMesh, flight: Flight;
  let round = 0, pts = 0, stickY = 0;
  let incoming = false, swung = false, ended = false;
  const TOTAL = 10;

  function pitch(ctx: ModeContext): void {
    round++;
    swung = false; incoming = true;
    pitcher.animator.play(SPORT_CLIP.derbyPitch, { onEnd: () => pitcher.animator.play(SPORT_CLIP.idle, { loop: true }) });
    ball.position.set(0.2, 1.4, 17.5);
    flight.launch(ball.position, new Vector3(-0.1, 1.1, -14 - round * 0.5));
    const clutch = round === TOTAL;
    ctx.setHud({ round: `${round}/${TOTAL}`, hint: clutch ? 'FINAL PITCH — STRIKE as it crosses the plate' : 'STRIKE as it crosses the plate' });
  }

  return {
    modeId: 'baseball', mood: 'goldenHour', camPreset: 'court',

    async load(ctx: ModeContext) {
      VenueKit.buildField(ctx.scene, 'ballpark');
      EffectsKit.ambient(ctx.scene, 'park');
      furniture = buildPlateAndMound(ctx.scene);
      me = await spawnAthlete(ctx, CFG.heroUrl, new Vector3(-0.7, 0, 0), Math.PI / 2, SPORT_CLIP.derbyStance);
      pitcher = await spawnAthlete(ctx, CFG.heroUrl, new Vector3(0, 0.35, 18), Math.PI, SPORT_CLIP.idle);
      ctx.heroRef.current = me.root;
      ball = MeshBuilder.CreateSphere('bball', { diameter: 0.12 }, ctx.scene);
      flight = new Flight(ball, -6);
      ctx.objectiveRef.current = ball.position;
      ctx.camDirector.setFixedBehind(me.root.position, Math.PI, 'swing');
      assertSpawned(ctx.scene, { hero: me.root, minWorldMeshes: 5, modeId: 'baseball' });
      round = 0; pts = 0; ended = false;
      SoundKit.startAmbient('stadium');
      ctx.setHud({ score: 0 });
      pitch(ctx);
    },

    onInput(ctx: ModeContext, e: FelInput) {
      SoundKit.unlock();
      if (e.t === 'stick' && e.side === 'L') stickY = e.y;
      if (e.t === 'button' && e.btn === 'A' && e.pressed && incoming && !swung) {
        swung = true;
        SoundKit.play('whoosh');
        me.animator.play(SPORT_CLIP.derbySwing, { onEnd: () => me.animator.play(SPORT_CLIP.derbyStance, { loop: true }) });
        const q = swingQuality(ball.position.z, 0.3, 14, 0.3);
        if (q <= 0) return;
        incoming = false;
        ctx.feel?.impact?.(0.3 + q * 0.5);
        const clutch = round === TOTAL;
        const launch = 0.45 - stickY * 0.3;
        flight.launch(ball.position, new Vector3((Math.random() - 0.5) * 4, 18 * launch * q + 4, 16 + q * 18));
        const distPts = Math.round(q * (80 + launch * 60) * (clutch ? CLUTCH_MULT : 1));
        pts += distPts;
        SoundKit.play('score', { pitch: q > 0.85 ? 1.2 : 1 });
        ctx.setHud({ score: pts, banner: clutch ? `CLUTCH DINGER! +${distPts}` : q > 0.85 ? `DINGER! +${distPts}` : `+${distPts}` });
        setTimeout(() => ctx.setHud({ banner: '' }), 900);
      }
    },

    update(ctx: ModeContext, dt: number) {
      if (ended) return;
      const flying = flight.step(dt);
      if (incoming && ball.position.z <= -1.2) {
        incoming = false;
        SoundKit.play('miss');
        ctx.setHud({ banner: 'WHIFF' });
        setTimeout(() => ctx.setHud({ banner: '' }), 700);
      }
      if (!flying && !incoming) {
        if (round >= TOTAL) { ended = true; SoundKit.play('whistle'); return ctx.end('DERBY_END', pts, { pitches: TOTAL }); }
        incoming = true;
        setTimeout(() => { if (!ended) pitch(ctx); }, 800);
      }
      ctx.camDirector.update(me.root.position, Vector3.Zero(), ball.position);
    },

    dispose() { me?.dispose(); pitcher?.dispose(); furniture.forEach((f) => f.dispose()); ball?.dispose(); SoundKit.stopAmbient(); },
  };
})();

// ═══════════════════════════════════════════════════════ PENALTY SHOOTOUT ══
export const PenaltyMode: ModeDefinition = (() => {
  let me: SpawnedCharacter, keeper: SpawnedCharacter;
  let furniture: AbstractMesh[] = [];
  let ball: AbstractMesh, flight: Flight, reticle: Reticle, meter: PowerMeter;
  let round = 0, goals = 0, stylePts = 0, stickX = 0, stickY = 0;
  let phase: 'aim' | 'power' | 'flight' = 'aim';
  let keeperTargetX = 0, ended = false;
  let feints = 0, lastFlickSign = 0, lastFlickMs = 0;
  const TOTAL = 5;
  const MAX_FEINTS = 2;
  const FEINT_KEEPER_SHIFT = 0.12;               // each feint: keeper guesses wrong this much more
  const FEINT_WOBBLE = 0.25;                     // ...and the shot wobbles this much more
  const FEINT_STYLE_PTS = 8;                     // banked per feint, paid only on a goal

  function nextKick(ctx: ModeContext): void {
    round++;
    phase = 'aim';
    feints = 0; lastFlickSign = 0;
    ball.position.set(0, 0.11, 0);
    keeper.root.position.set(0, 0, 10.4);
    keeper.animator.play(SPORT_CLIP.keeperIdle, { loop: true });
    me.animator.play(SPORT_CLIP.penaltyIdle, { loop: true });
    const clutch = round === TOTAL;
    ctx.setHud({ round: `${round}/${TOTAL}`, feints: 0, hint: clutch ? 'FINAL KICK — feint, aim, bury it' : 'Snap the stick side-to-side to FEINT (max 2) · aim · KICK twice' });
  }

  /** Street-style feint: a hard left↔right stick snap during aim. */
  function detectFeint(ctx: ModeContext, x: number): void {
    if (phase !== 'aim' || feints >= MAX_FEINTS) return;
    const sign = x > 0.6 ? 1 : x < -0.6 ? -1 : 0;
    if (sign === 0) return;
    const nowMs = performance.now();
    if (lastFlickSign !== 0 && sign !== lastFlickSign && nowMs - lastFlickMs < 450) {
      feints++;
      SoundKit.play('whoosh', { pitch: 1.6, volume: 0.35 });
      me.animator.play(SPORT_CLIP.footballJukeLeft, { onEnd: () => me.animator.play(SPORT_CLIP.penaltyIdle, { loop: true }) });
      ctx.setHud({ feints, banner: `FEINT${feints > 1 ? ` x${feints}` : '!'}` });
      setTimeout(() => ctx.setHud({ banner: '' }), 500);
    }
    lastFlickSign = sign; lastFlickMs = nowMs;
  }

  return {
    modeId: 'soccer', mood: 'nightGame', camPreset: 'court',

    async load(ctx: ModeContext) {
      VenueKit.buildField(ctx.scene, 'pitch');
      EffectsKit.ambient(ctx.scene, 'park');
      furniture = buildGoal(ctx.scene);
      me = await spawnAthlete(ctx, CFG.heroUrl, new Vector3(-0.4, 0, -1.6), 0, SPORT_CLIP.penaltyIdle);
      keeper = await spawnAthlete(ctx, CFG.heroUrl, new Vector3(0, 0, 10.4), Math.PI, SPORT_CLIP.keeperIdle);
      ctx.heroRef.current = me.root;
      ball = MeshBuilder.CreateSphere('sball', { diameter: 0.22 }, ctx.scene);
      flight = new Flight(ball, -9.8);
      reticle = new Reticle(ctx.scene, new Vector3(0, 1.2, 11), { x: 3.3, y: 1.05 });
      meter = new PowerMeter();
      ctx.objectiveRef.current = new Vector3(0, 1.2, 11);
      ctx.camDirector.setFixedBehind(me.root.position, 0, 'flight');
      assertSpawned(ctx.scene, { hero: me.root, minWorldMeshes: 6, modeId: 'soccer' });
      round = 0; goals = 0; stylePts = 0; ended = false;
      SoundKit.startAmbient('stadium');
      ctx.setHud({ score: 0 });
      nextKick(ctx);
    },

    onInput(ctx: ModeContext, e: FelInput) {
      SoundKit.unlock();
      if (e.t === 'stick' && e.side === 'L') { stickX = e.x; stickY = e.y; detectFeint(ctx, e.x); }
      if (e.t === 'button' && e.btn === 'A' && e.pressed) {
        if (phase === 'aim') { phase = 'power'; meter.start(); ctx.setHud({ hint: 'KICK at the top of the wave' }); }
        else if (phase === 'power') {
          const p = meter.stop();
          phase = 'flight';
          SoundKit.play('whoosh');
          me.animator.play(SPORT_CLIP.penaltyStrike, { onEnd: () => me.animator.play(SPORT_CLIP.penaltyIdle, { loop: true }) });
          ctx.feel?.impact?.(0.3 + p * 0.3);
          // feints send the keeper the wrong way more often
          const correctGuess = Math.max(0.2, 0.62 - feints * FEINT_KEEPER_SHIFT);
          keeperTargetX = Math.random() < correctGuess ? Math.sign(reticle.pos.x || 0.01) * 2.2 : -Math.sign(reticle.pos.x || 0.01) * 2.2;
          keeper.animator.play(SPORT_CLIP.keeperDive, {});
          const to = reticle.pos.subtract(ball.position).normalize();
          const wobble = (1 - p) * 0.5 + feints * FEINT_WOBBLE;
          flight.launch(ball.position, to.scale(13 + p * 7).add(new Vector3((Math.random() - 0.5) * wobble * 4, 0, 0)));
          ctx.setHud({ power: Math.round(p * 100), hint: '' });
        }
      }
    },

    update(ctx: ModeContext, dt: number) {
      if (ended) return;
      meter.update(dt);
      if (phase === 'power') ctx.setHud({ power: Math.round(meter.value * 100) });
      if (phase === 'aim') reticle.update(dt, stickX, stickY);
      if (phase === 'flight') {
        keeper.root.position.x += (keeperTargetX - keeper.root.position.x) * 5 * dt;
        flight.step(dt);
        if (ball.position.z >= 10.9) {
          flight.active = false;
          const inFrame = Math.abs(ball.position.x) < 3.6 && ball.position.y < 2.4 && ball.position.y > 0;
          const saved = Math.abs(ball.position.x - keeper.root.position.x) < 0.9 && ball.position.y < 1.9;
          const scored = inFrame && !saved;
          const clutch = round === TOTAL;
          if (scored) {
            goals++;
            stylePts += feints * FEINT_STYLE_PTS;
            ctx.feel?.impact?.(0.5);
            SoundKit.play('score');
            SoundKit.play('crowdCheer');
          } else {
            SoundKit.play(saved ? 'crowdGroan' : 'miss');
          }
          ctx.setHud({
            score: goals,
            banner: scored
              ? (feints > 0 ? `${clutch ? 'CLUTCH ' : ''}GOOOAL! +${feints * FEINT_STYLE_PTS} style` : clutch ? 'CLUTCH GOOOAL!' : 'GOOOAL!')
              : saved ? 'SAVED' : 'OFF TARGET',
          });
          setTimeout(() => {
            ctx.setHud({ banner: '' });
            if (round >= TOTAL) { ended = true; SoundKit.play('whistle'); ctx.end('SHOOTOUT_END', goals * 20 + stylePts, { goals, stylePts }); }
            else { nextKick(ctx); ctx.camDirector.setFixedBehind(me.root.position, 0, 'flight'); }
          }, 1300);
          phase = 'aim';
        }
        return;
      }
      ctx.camDirector.update(me.root.position, Vector3.Zero(), reticle.pos);
    },

    dispose() { me?.dispose(); keeper?.dispose(); furniture.forEach((f) => f.dispose()); ball?.dispose(); reticle?.dispose(); SoundKit.stopAmbient(); },
  };
})();
