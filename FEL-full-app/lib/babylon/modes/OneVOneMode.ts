// OneVOneMode v3 — REPLACES the M52 file. The comprehensive upgrade: 1v1
// becomes a full TWO-WAY game with a real ball. Everything from v2 is kept
// (momentum, make-it-take-it, ankle-breakers, body collision, shot variety,
// FIRST TO 11) and four systems land on top:
//   THE BALL FLIES — every jump shot arcs from the release hand to the rim
//     (ShotArc): makes drop through the net, misses clang off the iron and
//     bounce live for the rebound race. No more teleporting results.
//   DRIVE DUNKS — attack the rim at speed with turbo in the tank and the
//     shot button THROWS IT DOWN instead of raising a meter. Do it through
//     a defender parked in the lane and it's a POSTERIZE attempt: flush it
//     and they're on the floor ("POSTERIZED!"), big momentum; get stuffed
//     by the contest and it's a live-ball miss.
//   TURBO — sprint is a resource (drains/regens, re-arms at 25%). Gates
//     dunks so they're earned. HUD shows the tank.
//   REAL DEFENSE — lose the ball (miss + their rebound, or a strip) and
//     the possession doesn't resolve on dice: the rival DRIVES and YOU
//     defend. Poke STEAL in tight, or time a BLOCK jump (A) inside the
//     window around their release to erase the shot. Your positioning
//     drives their make% exactly like theirs drives yours.

import { MeshBuilder, Quaternion, TransformNode as BABYLON_TransformNode, Vector3 } from '@babylonjs/core';
import { dressBall } from '../visual/meshyProps';
import type { AbstractMesh, TransformNode } from '@babylonjs/core';
import { CharacterLibrary, type SpawnedCharacter } from '../core/CharacterLibrary';
import { neverBindPose } from '../anim/importSanitizer';
import { installSafePlay, SPORT_CLIP } from '../anim/clipRegistry';
import { VenueKit } from '../visual/VenueKit';
import { applyOceanCourt } from '../visual/CourtSurface';
import { mountVenue, type VenueHandle } from '../core/NexusVenue';  // M74
import { BallSim } from '../core/BallPhysics';
import { attachBallToHand, releaseBall } from '../anim/ballRig';
import { PlayerSlot, LocalInputSource, AISource } from '../core/PlayerSlot';
import { AgentControlSource } from '../core/AgentControlSource';  // M69: intent play under ?agent=1
import { agentBridge } from '../core/AgentBridge';
import {
  DribbleController, ShotMeter, DefenderBrain, contestLevel, clampToHalfCourt, isThree,
  resolveBodyCollision, checkAnkleBreak, classifyShot, ANKLE_BREAK_STUN_SEC,
  TurboMeter, ShotArc, checkDriveDunk, checkBlock, DUNK_PCT,
  driveBallExposure, STEAL_EXPOSURE_MIN,
  SHOT_QUALITY_PCT, type ShotQuality, type ShotContext,
} from '../core/BasketballCore';
import { DribbleStateMachine, DRIBBLE_CLIP, syncedShotSpeed } from '../core/BallHandling';
import { ContactSystem } from '../core/ContactSystem';
import { MomentumBus } from '../core/MomentumBus';
import { BasketballAnimTree, FootPlant } from '../anim/basketballTree';
import { mountBallCarry, type BallCarry } from '../anim/ballCarry';
import { SoundKit } from '../audio/SoundKit';
import { EffectsKit } from '../visual/EffectsKit';
import { HoopJuice } from '../visual/HoopJuice';   // A+ P0: the hoop answers the make (shared with Dunk; Meshy never scaled)
import { assertSpawned } from '../core/FrameGuard';
import type { ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import { DUNK_CONFIG as SHARED_CFG } from './modeConfigs';

/** Exported so hoop-alignment-tests can check it against the venue's hoop. */
export const RIM = new Vector3(0, 3.05, -0.6);
/** The rim's point on the floor — what a drive's range is measured against (see the checkDriveDunk call). */
const RIM_FLOOR = new Vector3(RIM.x, 0, RIM.z);
const TARGET_SCORE = 11;
// FORMAT FIX: scoring used to be "1pt inside a 4.2-unit paint radius, 2pts
// anywhere past it, no matter how far" — a made shot was never worth 3, and
// a layup was worth LESS than a jumper, which is backwards from every real
// basketball convention (NBA 2K's stated benchmark included). Paint and
// mid-range shots are both a normal 2, and only shots beyond a real
// 3-point arc distance score 3 — reachable inside the mode's half-court
// movement bounds (clampToHalfCourt goes out to depth 14.5, width 7.2).
// The arc is NOT a circle. This was a flat 6.7m radius — the same mistake 3PT
// shipped as its D1 and 3v3 repeated, all three independently, because the real
// line lived inside ThreePointMode instead of the shared basketball core. It is
// 6.71m in the corners and 7.24m at the top, and that gap is the shot selection.
// isThree() answers it per angle.
const DEFENSE_DRIVE_SEC = 2.2;                     // rival's drive length on their possession
/** Metres of rebound advantage for holding BOX OUT — worth a body length. */
const BOX_OUT_EDGE = 1.6;
/** How much a board is decided by the bounce rather than by position. */
const REBOUND_JITTER = 2.6;

type Possession = 'mine' | 'defense';

export const OneVOneMode: ModeDefinition = (() => {
  let me: SpawnedCharacter, foe: SpawnedCharacter, ball: AbstractMesh, ballSim: BallSim;
  let onevoneVenue: VenueHandle | null = null;  // M74
  let meSlot: PlayerSlot, foeSlot: PlayerSlot, localSource: LocalInputSource;
  let meDribble: DribbleController;
  let meDribbleSM: DribbleStateMachine;
  let meAnimTree: BasketballAnimTree;
  let meFootPlant: FootPlant;
  let meCarry: BallCarry | null = null, foeCarry: BallCarry | null = null;   // live dribble (ball off the palm)
  let wasPlanting = false;
  let shotMeter: ShotMeter;
  let turbo: TurboMeter;
  let arc: ShotArc;
  let arcResultMade = false, arcPoints = 0, arcLabel = '';
  let myScore = 0, foeScore = 0, momentum = 0;
  const mbus = new MomentumBus();               // Phase 6: shared Game-Breaker
  /** Report a highlight and mirror the bus into the HUD momentum meter. */
  function swing(kind: Parameters<MomentumBus['report']>[0]['kind']): void {
    mbus.report({ kind });
    momentum = Math.round(mbus.score01 * 100);
  }
  let possession: Possession = 'mine';
  let carrying = true, shooting = false, dunking = false;
  let ended = false;
  let foeStunSec = 0;
  let lookX = 0, lookY = 0;   // R stick → camera look (MODE-STICK-FACE family, 2026-09-07)
  let currentShot: ShotContext | null = null;
  /** Contest level at shot start — kept so the RESULT banner can say why. */
  let shotContest = 0;
  /** Contest level on the RIVAL's release — so their makes grade your D. */
  let defContest = 0;
  /** Defender's closing speed toward the handler (m/s) — a SET defender
   *  doesn't bite on a hesi; only one running at you does. */
  let foeClosingSpeed = 0;
  /** Decaying memory of that closing speed — a defender who JUST sprinted at
   *  you is on their heels for about a second after they arrive. That's the
   *  real 2K bite window: measured live, a press closes in ~0.35s and a pure
   *  "currently closing" test expired before a human (or driver) could pull
   *  the stick. */
  let foeCloseMemory = 0;
  // defense phase state
  let defSec = 0, defReleased = false, defResolved = false, myJumpAge = Infinity;
  let meStunSec = 0;                        // whiffed reach costs you your feet
  let contact: ContactSystem | null = null;      // Phase 4: Havok bodies when ready
  let hoopJuice: HoopJuice | null = null;        // A+ P0 CONTACT-lite: rim spring / net squash / hoop flash on a make
  let contactLatch = false;                      // A+ P0: the dunk's ONE punch per attempt — never re-fired by the banner or the stun

  /** Move a physics-bound character, or fall back to kinematic writes. */
  /** MODE-STICK-FACE (2026-09-07): the stick is CAMERA-relative. The hoops camera sits behind the offence looking at the
   *  rim (−z) and Babylon is left-handed, so a raw +x intent ran to SCREEN-LEFT (the dunk runway's bug, measured here
   *  too: stick-right Δscreen −2.4 m). Up = the camera's flat forward, right = screen right, handed back to the
   *  dribble in its own stick space (+Y = −Z). AI intents never pass through here. */
  function camRel(ctx: ModeContext, mx: number, my: number): [number, number] {
    const w = ctx.camDirector.forwardFlat().scale(my).addInPlace(ctx.camDirector.rightFlat().scale(mx));
    return [w.x, -w.z];
  }
  /** Face a root by yaw. The Havok contact body writes root.rotationQuaternion every step, so an Euler yaw alone was
   *  IGNORED — the hero faced his spawn direction for the whole game (measured: facing·travel 0.2 on a strafe). With
   *  the body's pre-step enabled (ContactSystem), the quaternion written here is what the body — and the eye — keeps. */
  function face(root: TransformNode, yaw: number): void {
    root.rotation.y = yaw;
    if (root.rotationQuaternion) Quaternion.RotationYawPitchRollToRef(yaw, 0, 0, root.rotationQuaternion);
  }
  function driveBody(id: string, root: TransformNode, vel: Vector3, dt: number): void {
    if (contact?.isReady) {
      // soft court bounds: kill the outward velocity component at the edge
      const p = root.position;
      const v = vel.clone();
      if ((p.x > 7.2 && v.x > 0) || (p.x < -7.2 && v.x < 0)) v.x = 0;
      if ((p.z > 14.5 && v.z > 0) || (p.z < 0.5 && v.z < 0)) v.z = 0;
      contact.drive(id, v, dt);
      // The velocity kill is soft on purpose, but an impulse (dunk flight,
      // steal knock-back, body contact) can still carry a body past the
      // baseline — measured 2026-09-02: hero at z −1.4 behind the rim, camera
      // clamped into the corner on top of him. Beyond a hand's width out,
      // put the body back on the line. Inside the box physics is untouched.
      // The dunk flight lands at RIM.z + 0.5 (z −0.1), legitimately behind the
      // z 0.5 line, and the flight itself writes the root directly — so the
      // near line is the RIM PLANE, not the play line, and nothing fires
      // mid-dunk.
      const OUT = 0.15, BEHIND_RIM = 0.5 - RIM.z;   // fires only past z −0.6
      if (!dunking && (p.x > 7.2 + OUT || p.x < -7.2 - OUT || p.z > 14.5 + OUT || p.z < 0.5 - BEHIND_RIM)) {
        const back = p.clone();
        if (!onevoneVenue?.constrain(back)) clampToHalfCourt(back, 7.2, 14.5);   // phase 3: navmesh first, box when no map
        contact.teleport(id, back);
      }
    } else {
      root.position.addInPlace(vel.scale(dt));
      if (!onevoneVenue?.constrain(root.position)) clampToHalfCourt(root.position, 7.2, 14.5);
    }
  }

  const cfg = { heroUrl: SHARED_CFG.heroUrl };

  function resetPositions(): void {
    if (contact?.isReady) {
      contact.teleport('me', new Vector3(0, 0, 5));
      contact.teleport('foe', new Vector3(0, 0, 2));
    } else {
      me.root.position.set(0, 0, 5);
      foe.root.position.set(0, 0, 2);
    }
    attachBallToHand(ball, me.skeleton, 'RightHand');
    possession = 'mine'; carrying = true; shooting = false; dunking = false;
    currentShot = null; myJumpAge = Infinity; meStunSec = 0;
    meDribble.setFacing(Math.PI);           // reset means facing the rim again
    arc.active = false;
  }

  function bannerFlash(ctx: ModeContext, text: string, ms = 800): void {
    ctx.setHud({ banner: text });
    setTimeout(() => ctx.setHud({ banner: '' }), ms);
  }

  function checkGameOver(ctx: ModeContext): boolean {
    if (myScore >= TARGET_SCORE) { ended = true; SoundKit.play('whistle'); ctx.end('WIN', myScore, { foeScore, momentum }); return true; }
    if (foeScore >= TARGET_SCORE) { ended = true; SoundKit.play('whistle'); ctx.end('LOSS', myScore, { foeScore }); return true; }
    return false;
  }

  return {
    modeId: 'onevone', mood: 'goldenHour', camPreset: 'hoops',

    async load(ctx: ModeContext) {
      onevoneVenue = mountVenue(ctx, 'basketball_h2h', { keepGameplayCamera: true, location: ctx.location });
      if (!onevoneVenue) { VenueKit.buildCourt(ctx.scene, 'venice'); applyOceanCourt(ctx.scene, 'venice'); }
      me = await CharacterLibrary.spawn(ctx.scene, cfg.heroUrl, { position: new Vector3(0, 0, 5), yawRad: Math.PI, startClip: SPORT_CLIP.idle });
      me.secondary?.setLookTarget(() => ball?.position ?? null);    // Phase 2: eyes on the ball
      neverBindPose(me.animator, SPORT_CLIP.idle); installSafePlay(me.animator, 'onevone-me');
      ctx.groundLock?.track(me.root, me.skeleton);
      foe = await CharacterLibrary.spawn(ctx.scene, cfg.heroUrl, { position: new Vector3(0, 0, 2), tint: '#ff2d78', startClip: SPORT_CLIP.idle });
      foe.secondary?.setLookTarget(() => ball?.position ?? null);
      neverBindPose(foe.animator, SPORT_CLIP.idle); installSafePlay(foe.animator, 'onevone-foe');
      ctx.groundLock?.track(foe.root, foe.skeleton);
      onevoneVenue?.hidePlaceholders();  // M74

      ball = MeshBuilder.CreateSphere('ball', { diameter: 0.24 }, ctx.scene);
      void dressBall(ball, 'basketball');   // Meshy ball skin rides the physics sphere (visual only)
      ballSim = new BallSim(ball, 0.12);
      attachBallToHand(ball, me.skeleton, 'RightHand');
      EffectsKit.ambient(ctx.scene, 'venice');
      EffectsKit.ballTrail(ctx.scene, ball);
      hoopJuice?.dispose(); hoopJuice = new HoopJuice(ctx.scene, RIM);   // A+ P0: juice-only ring + net, material clones — no meshy_hoop_* transform is touched
      if (process.env.NODE_ENV === 'development') { const dev = (window as unknown as { __FEL_DEV__?: { hoopJuiceUsed?: unknown } }).__FEL_DEV__; if (dev) dev.hoopJuiceUsed = hoopJuice.used; }
      SoundKit.startAmbient('stadium');

      localSource = new LocalInputSource();
      // M69: when driven by an agent (?agent=1), the hero slot reads from the
      // AgentControlSource instead of local input. Human play is untouched.
      const agentCtl = agentBridge() ? new AgentControlSource() : null;
      if (agentCtl) {
        ctx.agent.control = agentCtl;
        ctx.agent.getScore = () => myScore;
      }
      meSlot = new PlayerSlot('me', agentCtl ?? localSource, true);
      foeSlot = new PlayerSlot('foe', new AISource(foe.root.position, {
        // getAbsolutePosition, NOT .position: while the ball rides a hand it
        // is PARENTED to the hand bone and .position is a palm-local offset
        // (~origin). Fed that, the defender's deny point collapsed onto the
        // rim — measured live: the "defender" parked at (0, 0.3) and never
        // marked anyone, in every game this mode has ever played.
        ball: () => ball.getAbsolutePosition(), hoop: () => RIM, allies: () => [], foes: () => [me.root.position],
      }, new DefenderBrain(0.7)), false);

      // Phase 4: Havok contact bodies. If the physics wasm is unavailable
      // the mode falls back to the kinematic path unchanged.
      try {
        contact = new ContactSystem();
        await contact.init(ctx.scene);
        contact.addBody('me', me.root);
        contact.addBody('foe', foe.root);
      } catch (e) {
        console.warn('[1v1] physics unavailable, kinematic fallback:', e);
        contact = null;
      }

      meDribble = new DribbleController();
      meDribble.setFacing(Math.PI);           // spawned facing the rim (yaw π)
      meDribbleSM = new DribbleStateMachine();
      meAnimTree = new BasketballAnimTree(me.animator);
      meFootPlant = new FootPlant(me.skeleton, me.meshes[0] as never);
      meCarry?.dispose(); foeCarry?.dispose();
      meCarry = mountBallCarry({ scene: ctx.scene, ball, root: me.root, skeleton: me.skeleton });
      foeCarry = mountBallCarry({ scene: ctx.scene, ball, root: foe.root, skeleton: foe.skeleton });
      shotMeter = new ShotMeter();
      turbo = new TurboMeter();
      arc = new ShotArc();
      myScore = 0; foeScore = 0; momentum = 0; ended = false; foeStunSec = 0;
      ctx.heroRef.current = me.root;
      ctx.objectiveRef.current = RIM;
      mbus.reset();
      mbus.onTierChange((tier) => {
        if (tier === 'on_fire') { bannerFlash(ctx, "YOU'RE ON FIRE!", 1100); SoundKit.play('crowdCheer', { volume: 0.7 }); }
        else if (tier === 'hot') bannerFlash(ctx, 'HEATING UP…', 800);
        else if (tier === 'cold') bannerFlash(ctx, 'GONE COLD', 700);
      });
      ctx.camDirector.snapTo(me.root.position, RIM);
      assertSpawned(ctx.scene, { hero: me.root, minWorldMeshes: 6, modeId: 'onevone' });
      resetPositions();
      ctx.setHud({
        score: myScore, foeScore, target: TARGET_SCORE, momentum: 0, turbo: 100,
        hint: 'Drive fast at the rim to DUNK · snap the stick for ankles · pull BACK for a HESI · on D: hold L1/LT to BOX OUT, X to STEAL (mid-weave!), A to BLOCK',
      });
    },

    onInput(ctx: ModeContext, e: FelInput) {
      SoundKit.unlock();
      localSource.feed(e);
      if (e.t === 'stick' && e.side === 'R') { lookX = e.x; lookY = e.y; }   // MODE-STICK-FACE: R stick → the director's look orbit
      // BLOCK jump on defense: A press starts a contest jump
      if (possession === 'defense' && e.t === 'button' && e.btn === 'A' && e.pressed && myJumpAge === Infinity) {
        myJumpAge = 0;
        me.animator.play(SPORT_CLIP.jumpUp, { onEnd: () => me.animator.play(SPORT_CLIP.idle, { loop: true }) });
        SoundKit.play('whoosh', { pitch: 1.2, volume: 0.35 });
      }
    },

    update(ctx: ModeContext, dt: number) {
      if (ended) return;
      mbus.update(dt);
      SoundKit.setAmbientLevel(0.3 + mbus.score01 * 0.7);
      meSlot.poll(dt);
      foeSlot.poll(dt);
      foeStunSec = Math.max(0, foeStunSec - dt);
      if (myJumpAge !== Infinity) myJumpAge += dt;

      // ── the ball in flight (either end's shot) ──
      if (arc.active) {
        const res = arc.step(dt, ball.position);
        if (res === 'made') {
          SoundKit.play('score', { pitch: 1 });
          EffectsKit.burst(ctx.scene, RIM, 'net');
          if (possession === 'mine') {
            myScore += arcPoints;
            swing('big_make');
            // A+ P0 CONTACT-lite, the soft sibling: a jumper drops through with a small feel hit and a short shake —
            // no hit-stop latch, no flash, no slam thud (that is the dunk's). The hoop still answers the make.
            ctx.feel.impact(0.4);
            ctx.juice.shake(0.06, 100);
            hoopJuice?.punch();
            console.info('[1V1-JUICE] jumper make');
            // the WHY was named at release (GREEN/EARLY/LATE + contest); the
            // resolution just confirms the result and the points
            ctx.setHud({ score: myScore, momentum, banner: `${arcLabel} +${arcPoints}` });
            carrying = true;
            if (checkGameOver(ctx)) return;
            setTimeout(() => { ctx.setHud({ banner: '' }); resetPositions(); }, 700);
          } else {
            foeScore += arcPoints;
            SoundKit.play('crowdGroan', { volume: 0.4 });
            // your defence is graded on their makes too — a wide-open look
            // you gave them should READ as your mistake
            ctx.setHud({
              foeScore,
              banner: defContest >= 0.5 ? 'THEY SCORE — THROUGH YOUR CONTEST'
                : defContest <= 0.15 ? 'THEY SCORE — LEFT WIDE OPEN' : 'THEY SCORE',
            });
            if (checkGameOver(ctx)) return;
            setTimeout(() => { ctx.setHud({ banner: '' }); resetPositions(); }, 800);
          }
        } else if (res === 'missed') {
          SoundKit.play('miss');
          ballSim.launch(ball.position.clone(), new Vector3((Math.random() - 0.5) * 3, 2.5, 1.5 + Math.random()));
          // THE BOARD IS A CONTEST, and BOX OUT is how you win it.
          //
          // This was a bare distance comparison, which made it deterministic —
          // and since you shoot after driving, you are essentially always the
          // closer body. Measured: with EVERY shot deliberately missed, the
          // banner read "YOUR BOARD" every single time and the opponent never
          // got a possession at all. An opponent who cannot get the ball cannot
          // score, which is exactly what the scoreline showed: foeScore 0, every
          // run, for as long as this mode has existed.
          //
          // Distance still names the favourite. Boxing out is worth a real body
          // length on top of it — which is the whole point of a verb the mode
          // tells you to hold — and a little randomness keeps a board from being
          // decided before the ball leaves the rim.
          setTimeout(() => {
            if (ended) return;
            const meD = Vector3.Distance(me.root.position, ball.position);
            const foeD = Vector3.Distance(foe.root.position, ball.position);
            const boxing = meSlot.intent.brace ?? false;
            const edge = (foeD - meD)
              + (boxing ? BOX_OUT_EDGE : 0)
              + (Math.random() - 0.5) * REBOUND_JITTER;
            if (possession === 'mine' && edge <= 0) { startDefense(ctx, 'THEIR BOARD — DEFEND!'); }
            else {
              bannerFlash(ctx, boxing ? 'BOXED OUT — YOUR BOARD' : 'YOUR BOARD');
              resetPositions();
            }
          }, 900);
        }
        if (res !== 'flying') { arcResultMade = false; }
      } else if (!carrying && !dunking && possession === 'mine') {
        ballSim.step(dt);
      }

      // ══ MY POSSESSION ══
      if (possession === 'mine') {
        const intent = meSlot.intent;
        const moving = Math.hypot(intent.moveX, intent.moveY) > 0.1;
        const sprintOk = turbo.gate(dt, intent.sprint, moving);
        ctx.setHud({ turbo: Math.round(turbo.t01 * 100) });
        // Stick-space is normalised in LocalInputSource — see PlayerSlot.
        const [mx, my] = camRel(ctx, intent.moveX, intent.moveY);
        const drib = meDribble.update(dt, mx, my, sprintOk);
        if (!shooting && !dunking) {
          driveBody('me', me.root, meDribble.vel, dt);
          face(me.root, drib.facingRad);
          const nearestDef = foeStunSec > 0 ? Infinity : Vector3.Distance(me.root.position, foe.root.position);
          meAnimTree.update({
            speed01: drib.speed01, crossover: drib.crossover, nearestDefender: nearestDef,
            hasBall: carrying, shooting, dunking,
            driving: sprintOk && drib.speed01 > 0.6
              && Vector3.Dot(meDribble.vel, RIM.subtract(me.root.position)) > 0,
            defending: false, bracing: false, staggered: false,
          });
          // plant-and-cut contact lock: pin the plant foot with IK
          if (drib.planting && !wasPlanting) {
            meFootPlant.plant((n) => new BABYLON_TransformNode(n, ctx.scene));
          }
          wasPlanting = drib.planting;
          meFootPlant.update(dt);
          // the ball leaves the palm while I carry; a crossover swaps hands
          meCarry?.update(dt, drib.speed01, carrying && !shooting && !dunking);
          if (drib.crossover) meCarry?.switchHand();
          if (drib.crossover) {
            SoundKit.play('whoosh', { pitch: 1.4, volume: 0.4 });
            ctx.feel?.impact?.(0.1);
            if (foeStunSec === 0 && checkAnkleBreak(true, me.root.position, foe.root.position)) {
              foeStunSec = ANKLE_BREAK_STUN_SEC;
              swing('ankle_break');
              SoundKit.play('impact', { pitch: 0.8, volume: 0.5 });
              SoundKit.play('crowdCheer', { volume: 0.5 });
              ctx.feel?.impact?.(0.35);
              EffectsKit.burst(ctx.scene, foe.root.position.add(new Vector3(0, 0.2, 0)), 'dust');
              foe.animator.play(SPORT_CLIP.karateHitReact, { onEnd: () => foe.animator.play(SPORT_CLIP.idle, { loop: true }) });
              ctx.setHud({ momentum });
              bannerFlash(ctx, 'ANKLES!');
            }
          }
          // HESITATION — the pullback plant. You spent your momentum; if the
          // defender was CLOSING on you, they bite and you own the next beat
          // (the controller's explode-out window is already armed). A set
          // defender standing off does NOT bite — that's the read.
          if (drib.hesitation) {
            turbo.t01 = Math.max(0, turbo.t01 - 0.05);
            SoundKit.play('whoosh', { pitch: 0.8, volume: 0.3 });
            ctx.setHud({ turbo: Math.round(turbo.t01 * 100) });
            // 2.4m: the defender's settle point on a stationary handler is
            // ~2m out (deny lever 0.35), so 1.9m put the bite permanently
            // one step out of reach — measured live, it could never trigger.
            const inRange = Vector3.Distance(me.root.position, foe.root.position) < 2.4;
            if (foeStunSec === 0 && inRange && foeCloseMemory > 0.8) {
              foeStunSec = 0.45;
              SoundKit.play('impact', { pitch: 1.1, volume: 0.35 });
              ctx.feel?.impact?.(0.2);
              foe.animator.play(SPORT_CLIP.karateHitReact, { onEnd: () => foe.animator.play(SPORT_CLIP.idle, { loop: true }) });
              bannerFlash(ctx, 'BIT ON THE HESI!');
            } else {
              bannerFlash(ctx, 'HESI…', 500);
            }
          }
        }

        if (foeStunSec === 0) {
          const foeIntent = foeSlot.intent;
          const foeVel = new Vector3(foeIntent.moveX, 0, -foeIntent.moveY).scale(3.6);
          // closing speed toward the handler feeds the hesi bite read
          const toMe = me.root.position.subtract(foe.root.position); toMe.y = 0;
          foeClosingSpeed = toMe.lengthSquared() > 1e-4
            ? Math.max(0, Vector3.Dot(foeVel, toMe.normalize()))
            : 0;
          foeCloseMemory = Math.max(foeClosingSpeed, foeCloseMemory - dt * 2.5);
          driveBody('foe', foe.root, foeVel, dt);
          if (foeVel.lengthSquared() > 0.05) face(foe.root, Math.atan2(foeVel.x, foeVel.z));
          foe.animator.play(foeVel.lengthSquared() > 0.3 ? SPORT_CLIP.moveLoop : SPORT_CLIP.idle, { loop: true });
          // same standoff fix as the defensive poke: bodies rest ~1.1m apart
          if (carrying && !shooting && !dunking && foeIntent.steal && Vector3.Distance(me.root.position, foe.root.position) < 1.6) {
            SoundKit.play('impact', { pitch: 1.2, volume: 0.3 });
            swing('turnover'); momentum = Math.round(mbus.score01*100);
            ctx.setHud({ momentum });
            startDefense(ctx, 'STRIPPED — DEFEND!');
            return;
          }
        }

        if (!contact?.isReady && resolveBodyCollision(me.root.position, foe.root.position) && meDribble.vel.lengthSquared() > 9) {
          SoundKit.play('impact', { pitch: 1.1, volume: 0.15 });
        }

        // shot start — drive context first: a hot drive DUNKS instead of metering
        if (!shooting && !dunking && carrying && meSlot.intent.actionHeld > 0.02) {
          const defenderPos = foeStunSec > 0 ? null : foe.root.position;
          // A+ P0: the gate measures a 3-D distance and the rim sits 3.05 m up — against RIM itself a floor-bound body can
          // NEVER be inside DUNK_RANGE (2.8 m), so the drive dunk had never fired in play (measured: every squeeze at speed
          // inside 2.6 m of the rim metered a jumper). The range is a floor distance; judge it against the rim's floor point.
          const kind = checkDriveDunk(me.root.position, meDribble.vel, RIM_FLOOR, turbo.t01, defenderPos);
          if (kind !== 'none') { startDunk(ctx, kind); }
          else {
            shooting = true;
            const contest = contestLevel(me.root.position, defenderPos);
            shotContest = contest;
            currentShot = classifyShot(me.root.position, meDribble.vel, RIM, contest);
            shotMeter.start(contest, currentShot.style);
            // ShotReleaseSync: pace the jumpshot so its contact frame lands
            // exactly on the meter's green center — what you see is what you time.
            const clipSec = me.animator.durationOf('jumpshot') ?? 1.0;
            const speed = syncedShotSpeed(clipSec, shotMeter.durationSec, shotMeter.greenCenter01);
            me.animator.play('jumpshot', { loop: true, speedRatio: speed });
            ctx.setHud({ shotType: currentShot.label });
          }
        }
        if (shooting) {
          const t = shotMeter.update(dt);
          ctx.setHud({ shotMeterT: t });
          if (meSlot.intent.action || t >= 1) releaseJumper(ctx, shotMeter.release());
        }

        ctx.camDirector.look(lookX, lookY, dt);
        ctx.camDirector.update(me.root.position, meDribble.vel, RIM);
      }

      // ── Phase 4: contact events (fouls/hard contact) from Havok ──
      if (contact?.isReady) {
        for (const c of contact.drainContacts()) {
          if (c.severity === 'foul') {
            const onMe = c.b === 'me' || c.a === 'me';
            const iAmVictim = c.b === 'me';
            if (onMe && (shooting || dunking) && iAmVictim) {
              SoundKit.play('whistle');
              mbus.report({ kind: 'big_make', weight: 8 }); momentum = Math.round(mbus.score01 * 100);
              ctx.setHud({ momentum });
              bannerFlash(ctx, 'FOUL! — BALL BACK', 1000);
              resetPositions();
            } else if (onMe && possession === 'defense' && !iAmVictim) {
              SoundKit.play('whistle');
              mbus.report({ kind: 'turnover', weight: -10 }); momentum = Math.round(mbus.score01 * 100);
              ctx.setHud({ momentum });
              bannerFlash(ctx, 'FOUL ON YOU', 900);
              setTimeout(() => { if (!ended) resetPositions(); }, 900);
            }
          } else if (c.severity === 'hard') {
            SoundKit.play('impact', { pitch: 1.0, volume: 0.3 });
            ctx.feel?.impact?.(0.25);
          }
        }
      }

      // ══ THEIR POSSESSION — you defend ══
      if (possession !== 'mine') meCarry?.update(dt, 0, false);
      if (possession !== 'defense' || defReleased) foeCarry?.update(dt, 0, false);
      if (possession === 'defense') {
        defSec += dt;
        meStunSec = Math.max(0, meStunSec - dt);
        // I move freely on D (turbo still gates sprint) — unless a whiffed
        // reach took my feet. That's the price of a bad gamble.
        const intent = meSlot.intent;
        const moving = Math.hypot(intent.moveX, intent.moveY) > 0.1;
        const sprintOk = turbo.gate(dt, intent.sprint, moving);
        ctx.setHud({ turbo: Math.round(turbo.t01 * 100) });
        // Stick-space is normalised in LocalInputSource — see PlayerSlot.
        const [mx, my] = camRel(ctx, intent.moveX, intent.moveY);
        const drib = meStunSec > 0
          ? meDribble.update(dt, 0, 0, false)
          : meDribble.update(dt, mx, my, sprintOk);
        driveBody('me', me.root, meDribble.vel, dt);
        face(me.root, drib.facingRad);
        contact?.brace('me', intent.brace ?? false);
        if (myJumpAge === Infinity) {
          meAnimTree.update({
            speed01: drib.speed01, crossover: drib.crossover, nearestDefender: Infinity,
            hasBall: false, shooting: false, dunking: false, driving: false,
            defending: true, bracing: intent.brace ?? false, staggered: false,
          });
        }

        // the rival drives the lane — AT the rim, not five metres short of
        // it. This targeted z = RIM.z + 2 (y ≈ 1.4): their jumpshot released
        // from the same spot every time, and the steal/block dance the mode
        // teaches ("in tight", BLOCK_RANGE 1.5) was a walk into their path.
        // A driver who gets to the basket is also just recognisably 2K.
        if (!defReleased) {
          const k = Math.min(1, defSec / DEFENSE_DRIVE_SEC);
          const targetX = Math.sin(defSec * 2.1) * 2.2 * (1 - k);
          if (contact?.isReady) {
            const vx = (targetX - foe.root.position.x) * 3;
            const vz = (RIM.z + 0.8 - foe.root.position.z) * (0.9 + k);
            contact.drive('foe', new Vector3(vx, 0, vz), dt);
          } else {
            foe.root.position.x += (targetX - foe.root.position.x) * 3 * dt;
            foe.root.position.z += ((RIM.z + 0.8 - foe.root.position.z)) * (0.9 + k) * dt;
          }
          face(foe.root, Math.PI);
          foe.animator.play(SPORT_CLIP.moveLoop, { loop: true });
          foeCarry?.update(dt, 0.75, true);   // the rival dribbles the lane

          // STEAL poke: a read, not a dice roll. The rival's weave EXPOSES
          // the ball — poke while they're mid-crossover and it's yours; reach
          // while they're protecting it (or gathering) and you're off your
          // feet while they go by. Was `Math.random() < 0.5` — 2K's defenders
          // are beaten by timing, not entropy.
          // 1.6m, not an arm's-length 1.2: body collision holds two players
          // ~1.1m apart, so a 1.2m poke range sat exactly ON the standoff
          // distance and flickered across it — the press arrived, the poke
          // roll fired, and the mode measured "not in range" (seen live:
          // 15s of standing in the press, zero strips).
          if (intent.steal && Vector3.Distance(me.root.position, foe.root.position) < 1.6 && meStunSec === 0) {
            const exposure = driveBallExposure(defSec, DEFENSE_DRIVE_SEC);
            if (exposure >= STEAL_EXPOSURE_MIN) {
              SoundKit.play('impact', { pitch: 1.3, volume: 0.4 });
              swing('steal');
              ctx.setHud({ momentum });
              bannerFlash(ctx, 'PICKED THEIR POCKET!');
              resetPositions();
              return;
            }
            meStunSec = 0.45;
            SoundKit.play('whoosh', { pitch: 0.7, volume: 0.3 });
            bannerFlash(ctx, 'REACH — THEY GO BY', 700);
          }

          if (!contact?.isReady) resolveBodyCollision(me.root.position, foe.root.position);

          // release moment
          if (defSec >= DEFENSE_DRIVE_SEC && !defResolved) {
            defReleased = true;
            foeCarry?.update(0, 0, false);   // gather: back in the palm, then the release
            releaseBall(ball);
            foe.animator.play('jumpshot', { onEnd: () => foe.animator.play(SPORT_CLIP.idle, { loop: true }) });
            // BLOCK check — a timed jump in range erases it
            if (checkBlock(me.root.position, foe.root.position, myJumpAge)) {
              defResolved = true;
              SoundKit.play('impact', { pitch: 0.7, volume: 0.6 });
              SoundKit.play('crowdCheer', { volume: 0.6 });
              ctx.feel?.impact?.(0.5);
              EffectsKit.burst(ctx.scene, ball.position.clone(), 'sparks');
              swing('block');
              ballSim.launch(ball.getAbsolutePosition(), new Vector3((Math.random() - 0.5) * 4, 2, 3));
              ctx.setHud({ momentum });
              bannerFlash(ctx, 'REJECTED!', 900);
              setTimeout(() => { if (!ended) resetPositions(); }, 1000);
              return;
            }
            // no block — contest distance sets their make%
            const contest = contestLevel(foe.root.position, me.root.position);
            defContest = contest;
            const made = Math.random() < 0.62 - contest * 0.35;
            arcPoints = isThree(foe.root.position, RIM) ? 3 : 2;
            arcResultMade = made;
            arc.start(ball.getAbsolutePosition(), RIM, made, 'jumper');
            defResolved = true;
          }
        }

        // Ship Pass 6: a two-point fit on a foe within arm's reach put the camera inside a body (sweep frame 2026-09-05); frame the rim instead
        ctx.camDirector.look(lookX, lookY, dt);
        ctx.camDirector.update(me.root.position, meDribble.vel, Vector3.Distance(me.root.position, foe.root.position) < 2.2 ? RIM : foe.root.position);
      }
    },

    dispose() {
      meFootPlant?.dispose();
      meCarry?.dispose(); foeCarry?.dispose(); meCarry = null; foeCarry = null;
      contact?.dispose(); contact = null;
      me?.dispose(); foe?.dispose(); ball?.dispose();
      meSlot?.dispose(); foeSlot?.dispose();
      SoundKit.stopAmbient();
      hoopJuice?.dispose(); hoopJuice = null;        // A+ P0: restores any hoop material the punch swapped
      onevoneVenue?.dispose(); onevoneVenue = null;  // M74
    },
  };

  function startDefense(ctx: ModeContext, banner: string): void {
    possession = 'defense'; carrying = false; shooting = false; dunking = false;
    defSec = 0; defReleased = false; defResolved = false; myJumpAge = Infinity; meStunSec = 0;
    arc.active = false;
    attachBallToHand(ball, foe.skeleton, 'RightHand');
    bannerFlash(ctx, banner, 900);
    ctx.setHud({ hint: 'BLOCK: jump (A) as they release · STEAL (X) in tight · hold BOX OUT (B) for the board' });
    // watchdog: a defense phase can never hang
    setTimeout(() => {
      if (!ended && possession === 'defense' && !defReleased && defSec < DEFENSE_DRIVE_SEC * 0.5) {
        console.warn('[FEL-1V1] defense watchdog — forcing release');
        defSec = DEFENSE_DRIVE_SEC;
      }
    }, (DEFENSE_DRIVE_SEC + 2.5) * 1000);
  }

  function startDunk(ctx: ModeContext, kind: 'dunk' | 'poster'): void {
    dunking = true; shooting = false; contactLatch = false;   // A+ P0: a fresh attempt gets one punch
    turbo.t01 = Math.max(0, turbo.t01 - 0.3);           // dunks spend fuel
    const made = Math.random() < DUNK_PCT[kind];
    SoundKit.play('whoosh', { pitch: 0.85 });
    me.animator.play(SPORT_CLIP.dunkLaunchPower, { onEnd: () => me.animator.play(SPORT_CLIP.idle, { loop: true }) });
    const from = me.root.position.clone();
    const t0 = performance.now();
    const obs = ctx.scene.onBeforeRenderObservable.add(() => {
      const k = Math.min(1, (performance.now() - t0) / 550);
      me.root.position.x = from.x + (RIM.x - from.x) * k;
      me.root.position.z = from.z + (RIM.z + 0.5 - from.z) * k;
      me.root.position.y = Math.sin(k * Math.PI) * 1.15;
      if (k < 1) return;
      ctx.scene.onBeforeRenderObservable.remove(obs);
      dunking = false;
      releaseBall(ball);
      if (made) {
        // A DUNK IS WORTH TWO. The comment above TARGET_SCORE records the
        // scoring scale being fixed from "1 inside the paint, 2 outside" to real
        // 2s and 3s — but only the JUMP SHOT path was updated. The dunk kept
        // awarding 1, so the best shot in basketball stayed worth half a jumper,
        // the exact bug that fix was written to remove. 3v3 had it too.
        myScore += 2;
        const posterized = kind === 'poster';
        swing(posterized ? 'posterize' : 'highlight_dunk');
        ctx.camDirector.pulse(posterized ? 0.85 : 0.6, 0.5);
        SoundKit.play('score', { pitch: 0.9 });
        SoundKit.play('crowdCheer', { volume: posterized ? 0.8 : 0.5 });
        contactPunch(ctx);   // A+ P0: hit-stop + shake + flash + the ONE slam thud + HoopJuice (replaces the bare feel.impact, which was a second thud)
        EffectsKit.burst(ctx.scene, RIM, 'net');
        if (posterized) {
          foeStunSec = 1.4;
          foe.animator.play(SPORT_CLIP.karateKnockdown, { onEnd: () => foe.animator.play(SPORT_CLIP.idle, { loop: true }) });
          EffectsKit.burst(ctx.scene, foe.root.position.add(new Vector3(0, 0.3, 0)), 'dust');
        }
        ctx.setHud({ score: myScore, momentum });
        bannerFlash(ctx, posterized ? 'POSTERIZED!' : 'THROWN DOWN!', 1000);
        carrying = true;
        if (checkGameOver(ctx)) return;
        setTimeout(() => { if (!ended) resetPositions(); }, 900);
      } else {
        SoundKit.play('miss');
        SoundKit.play('crowdGroan', { volume: 0.4 });
        missClank(ctx);   // A+ P0: the miss has weight too — a clank, never the make's punch
        ballSim.launch(ball.getAbsolutePosition(), new Vector3((Math.random() - 0.5) * 3, 3, 2));
        bannerFlash(ctx, kind === 'poster' ? 'STUFFED AT THE RIM!' : 'RATTLED OUT');
        setTimeout(() => { if (!ended) startDefense(ctx, 'THEIR BALL'); }, 900);
      }
    });
  }

  // ── A+ P0 CONTACT-lite (PM brief ONEVONE-A-PLUS-P0, 2026-09-06) ─────────────────────────────────────────────────
  // The dunk contest's CONTACT orchestra is the ceiling; 1v1 takes the lite cut: one make punch, one miss clank.
  // No hang slowMo (1v1 has no hang latch), no FOV gather, no land settle, no trail phases.
  /** The dunk make's flush frame: hit-stop, shake, white-gold flash, ONE slam thud, and the hoop answers. Latched once per attempt. */
  function contactPunch(ctx: ModeContext): void {
    if (contactLatch) return;
    contactLatch = true;
    ctx.juice.hitStop(70);
    ctx.juice.shake(0.12, 140);
    ctx.juice.flash('#fff6dd', 120);
    SoundKit.play('impact', { pitch: 0.7, volume: 0.8 });
    hoopJuice?.punch();
    console.info('[1V1-JUICE] dunk contact punch');
  }
  /** The dunk miss / stuff: a light metallic clank with a small feel hit — never the make's punch, never HoopJuice. */
  function missClank(ctx: ModeContext): void {
    ctx.feel.impact(0.4);
    SoundKit.play('impact', { pitch: 1.35, volume: 0.45 });
    console.info('[1V1-JUICE] dunk miss clank');
  }

  function releaseJumper(ctx: ModeContext, quality: ShotQuality): void {
    shooting = false;
    const pctMod = currentShot?.pctMod ?? 1;
    const pct = SHOT_QUALITY_PCT[quality] * pctMod * mbus.multiplier();
    arcPoints = isThree(me.root.position, RIM) ? 3 : 2;
    arcLabel = currentShot?.label ?? 'SHOT';
    arcResultMade = Math.random() < Math.min(0.98, pct);
    releaseBall(ball);
    // The jumpshot clip is already playing (meter-paced from shot start) —
    // do NOT restart it here or the release frame pops. Let it ride out the
    // follow-through, then settle to idle. Layups keep their own finish clip.
    if (currentShot?.style === 'layup') {
      me.animator.play(SPORT_CLIP.dunkLaunchPower, { onEnd: () => me.animator.play(SPORT_CLIP.idle, { loop: true }) });
    } else {
      setTimeout(() => { if (!ended) me.animator.play(SPORT_CLIP.idle, { loop: true }); }, 420);
    }
    ctx.setHud({ shotType: '', shotMeterT: 0 });
    // SHOT FEEDBACK — 2K tells you WHY at the moment of release, not after
    // the arc resolves. Quality word + contest tag: an early contested
    // fadeaway that rims out was legible as a bad shot before it landed.
    // Before this, only a perfect release said anything at all.
    const tag = shotContest >= 0.5 ? ' — CONTESTED' : shotContest <= 0.15 ? ' — WIDE OPEN' : '';
    if (quality === 'perfect') {
      SoundKit.play('uiTick', { pitch: 1.5, volume: 0.4 });
      SoundKit.play('crowdCheer', { volume: 0.35 });
      ctx.feel?.impact?.(0.2);
      bannerFlash(ctx, `GREEN!${tag}`, 700);
      ctx.camDirector.pulse(0.3, 0.35);
    } else if (quality === 'early') {
      bannerFlash(ctx, `EARLY${tag}`, 700);
    } else if (quality === 'late') {
      bannerFlash(ctx, `LATE${tag}`, 700);
    } else if (quality === 'brick') {
      bannerFlash(ctx, `WAY LATE${tag}`, 800);
    }
    if (!arcResultMade) swing('miss');
    carrying = false;
    arc.start(ball.getAbsolutePosition(), RIM, arcResultMade, currentShot?.style ?? 'jumper');
  }
})();

// HUD fields: foeScore, target, momentum, shotMeterT, shotType, camFollowM
// (dropped — was debug), and NEW turbo (0-100 — render as a small fuel bar
// under the momentum meter).
