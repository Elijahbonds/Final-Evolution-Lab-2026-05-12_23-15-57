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
//   REAL DEFENSE — lose the ball (miss + their rebound, a strip, their make
//     under make-it-take-it) and the rival CHECKS UP at the top and DRIVES;
//     you defend. Stay in front and they have to sidestep (the ball crosses
//     over — poke STEAL on it); hold them in front and they pull up from
//     range; time a BLOCK jump (A) on their gather to erase the shot. Your
//     positioning drives their make% exactly like theirs drives yours.
//
// ONEVONE-DEFENSE-LOGIC (2026-09-07) — the owner's eye: "we can't play defense, the logic is kinda off, the animations
// need work". Measured on /dev/mode/onevone with a fake pad driving the deny point (scripts/probes/_onevone-defense-probe.mts):
//   (1) the rival's possession was a 2.2 s TIMER (x = sin(t) weave, z lerped to the rim) that ignored the defender — in
//       front of the drive 30–63 % of the frames, the rival still released 0.77–0.86 m from the rim every time; there was
//       no gather, so a block cue never existed (0 A presses on cue in 8 possessions); the poke was a timer read too
//       (exposure = |cos(2.1 t)|) and was 1.0 at t = 0 — a strip was answered by a counter-strip 0.10 s later, 4 of 4;
//   (2) after that steal the ball WARPED BACK TO THE RIVAL: the rival's live dribble (foeCarry) deactivated a frame after
//       the hand-off and, seeing the ball un-parented and un-released, re-attached it to the rival's palm — the
//       "PICKED THEIR POCKET!" banner was followed by "STRIPPED" 1.3 s later and the ball spent that second at
//       (3, 2.6, −2); their miss was ALWAYS "YOUR BOARD" (the race only ran on my possession); their make handed ME the
//       ball (loser's ball, not make-it-take-it); the defence watchdog of the previous possession fired into the next one
//       and forced a release 1.1 s in; the loose ball only stepped on my possession; every foul-speed contact on defence
//       was "FOUL ON YOU" because ContactEvent.a was always the first body added;
//   (3) three owners played the hero's rig (the tree, the A-press jump chain to idle_stand, the shot / dunk plays) and
//       two the rival's (the per-frame run / idle play cut every hit react to a frame; the jumpshot's onEnd chain);
//       the hero's steal had no reach, the block was jump_up → idle_stand, the defensive slide always went left.
// Now: AttackerBrain (BasketballCore) drives the rival — check, drive, sidestep when contained, gather telegraph, blow-by
// on a whiff / an early jump, pull-up when held in front; BasketballAnimTree is the ONE owner of both bodies (beats /
// holds, cut callbacks ignored); giveBall() hands the ball over with both carries off; possessionToken guards every
// timer; make-it-take-it both ways; the board is a race on both ends; the loose ball always steps.

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
  TurboMeter, ShotArc, checkDriveDunk, checkBlock, BLOCK_RANGE, DUNK_PCT,
  STEAL_EXPOSURE_MIN, AttackerBrain, RIVAL_DRIVE_SPEED, rivalShotPct, handUpContest, distXZ,
  SHOT_QUALITY_PCT, type ShotQuality, type ShotContext,
} from '../core/BasketballCore';
import { DribbleStateMachine, syncedShotSpeed } from '../core/BallHandling';
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
/** Metres of rebound advantage for holding BOX OUT — worth a body length. */
const BOX_OUT_EDGE = 1.6;
/** How much a board is decided by the bounce rather than by position. */
const REBOUND_JITTER = 2.6;
/** My possession: I take it back to the top, the rival sets 3 m in. */
const MY_SPAWN = new Vector3(0, 0, 5), FOE_SPAWN = new Vector3(0, 0, 2);
/** Their possession: the CHECK. The rival checks up beyond the arc (top 7.24 m → z 6.64); I set 2 m inside him. */
const CHECK_FOE = new Vector3(0, 0, 9.2), CHECK_ME = new Vector3(0, 0, 7.2);
/** A poke's reach. Body collision holds two players ~1.1 m apart; 1.2 sat ON the standoff and flickered. */
const STEAL_RANGE = 1.6;
const REACH_COOLDOWN_SEC = 0.4;          // a reach is a commitment, not a mash
const REACH_WHIFF_STUN_SEC = 0.45;       // a whiffed reach costs your feet
const JUMP_SEC = 0.75;                   // the contest jump's clock (physics lands the body)
const JUMP_VY = 3.0;                     // m/s — ~0.46 m apex, 0.6 s of air
const HINT_OFFENCE = 'Drive fast at the rim to DUNK · snap the stick for ankles · pull BACK for a HESI · lose the ball and you DEFEND';
const HINT_DEFENCE = 'STAY IN FRONT — they sidestep, you slide · X: STEAL as the ball crosses over · A: JUMP on the gather to BLOCK · hold L1/LT: BOX OUT';

type Possession = 'mine' | 'defense';
/** Their possession: the check, the drive (incl. sidestep / blow-by / gather), the shot in the air, over. */
type DefensePhase = 'check' | 'drive' | 'shot' | 'over';

export const OneVOneMode: ModeDefinition = (() => {
  let me: SpawnedCharacter, foe: SpawnedCharacter, ball: AbstractMesh, ballSim: BallSim;
  let onevoneVenue: VenueHandle | null = null;  // M74
  let meSlot: PlayerSlot, foeSlot: PlayerSlot, localSource: LocalInputSource;
  let meDribble: DribbleController;
  let meDribbleSM: DribbleStateMachine;
  let meAnimTree: BasketballAnimTree, foeAnimTree: BasketballAnimTree;
  let meFootPlant: FootPlant;
  let meCarry: BallCarry | null = null, foeCarry: BallCarry | null = null;   // live dribble (ball off the palm)
  let wasPlanting = false;
  let shotMeter: ShotMeter;
  let turbo: TurboMeter;
  let arc: ShotArc;
  let arcPoints = 0, arcLabel = '';
  let myScore = 0, foeScore = 0, momentum = 0;
  const mbus = new MomentumBus();               // Phase 6: shared Game-Breaker
  /** Report a highlight and mirror the bus into the HUD momentum meter. */
  function swing(kind: Parameters<MomentumBus['report']>[0]['kind']): void {
    mbus.report({ kind });
    momentum = Math.round(mbus.score01 * 100);
  }
  let possession: Possession = 'mine';
  /** Bumped on every possession change — every timer that changes possession checks it (a stale watchdog used to force
   *  the NEXT possession's release 1.1 s in). */
  let possessionToken = 0;
  let carrying = true, shooting = false, dunking = false;
  /** The ball is live on the floor (a miss, a block) — BallSim owns it, whoever's possession it is. */
  let loose = false;
  let ended = false;
  let foeStunSec = 0;
  /** The rival is on the floor (posterized) — held there by the tree until the stun ends. */
  let foeFloored = false;
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
  let defPhase: DefensePhase = 'over';
  const attacker = new AttackerBrain();
  let gatherShown = false, stepbackShown = false;
  let myJumpAge = Infinity;                 // seconds since my contest jump left the floor
  let meStunSec = 0;                        // whiffed reach costs you your feet
  let reachCooldown = 0;
  let contact: ContactSystem | null = null;      // Phase 4: Havok bodies when ready
  let hoopJuice: HoopJuice | null = null;        // A+ P0 CONTACT-lite: rim spring / net squash / hoop flash on a make
  let contactLatch = false;                      // A+ P0: the dunk's ONE punch per attempt — never re-fired by the banner or the stun
  let hud: ModeContext['setHud'] = () => {};

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
  /** Body-right for a yaw (measured, MODE-STICK-FACE): which way a slide goes in the body frame. */
  function slideDirFor(yaw: number, vel: Vector3): 'left' | 'right' {
    return vel.x * Math.cos(yaw) - vel.z * Math.sin(yaw) > 0.3 ? 'right' : 'left';
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
  function place(id: 'me' | 'foe', root: TransformNode, pos: Vector3, yaw: number): void {
    if (contact?.isReady) contact.teleport(id, pos); else root.position.copyFrom(pos);
    face(root, yaw);
  }
  /** The ONE hand-off. Both live dribbles go off FIRST with the ball marked released, so neither hands it back to its
   *  own palm on the way out (the warp-back bug above); then the ball rides the new owner's hand. */
  function giveBall(to: 'me' | 'foe'): void {
    (ball.metadata ??= {}).felReleased = true;
    meCarry?.update(0, 0, false); foeCarry?.update(0, 0, false);
    attachBallToHand(ball, (to === 'me' ? me : foe).skeleton, 'RightHand');
    loose = false;
  }
  /** The ball leaves a hand for the floor: BallSim owns it until someone picks it up. */
  function launchLoose(from: Vector3, vel: Vector3): void {
    ballSim.launch(from, vel);
    loose = true;
  }

  const cfg = { heroUrl: SHARED_CFG.heroUrl };

  /** MY possession: I take it back to the top. (Also the reset after my make: make-it-take-it.) */
  function resetPositions(): void {
    possessionToken++;
    possession = 'mine'; carrying = true; shooting = false; dunking = false; defPhase = 'over';
    currentShot = null; myJumpAge = Infinity; meStunSec = 0; reachCooldown = 0;
    arc.active = false;
    place('me', me.root, MY_SPAWN, Math.PI);
    place('foe', foe.root, FOE_SPAWN, 0);
    if (!contact?.isReady) me.root.position.y = 0;
    meDribble.setFacing(Math.PI);           // reset means facing the rim again
    giveBall('me');
    meAnimTree.releaseHold();                // a reach / a layup finish in flight plays out; only a held shot is lifted
    if (!foeFloored) foeAnimTree.releaseHold();
    hud({ hint: HINT_OFFENCE, shotType: '', shotMeterT: 0 });
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

  /** A possession-changing timer: only fires if the possession it was scheduled in is still the live one. */
  function later(ms: number, fn: () => void): void {
    const tok = possessionToken;
    setTimeout(() => { if (!ended && possessionToken === tok) fn(); }, ms);
  }

  return {
    modeId: 'onevone', mood: 'goldenHour', camPreset: 'hoops',

    async load(ctx: ModeContext) {
      hud = (u) => ctx.setHud(u);
      onevoneVenue = mountVenue(ctx, 'basketball_h2h', { keepGameplayCamera: true, location: ctx.location });
      if (!onevoneVenue) { VenueKit.buildCourt(ctx.scene, 'venice'); applyOceanCourt(ctx.scene, 'venice'); }
      me = await CharacterLibrary.spawn(ctx.scene, cfg.heroUrl, { position: MY_SPAWN.clone(), yawRad: Math.PI, startClip: SPORT_CLIP.idle });
      me.secondary?.setLookTarget(() => ball?.position ?? null);    // Phase 2: eyes on the ball
      neverBindPose(me.animator, SPORT_CLIP.idle); installSafePlay(me.animator, 'onevone-me');
      ctx.groundLock?.track(me.root, me.skeleton);
      foe = await CharacterLibrary.spawn(ctx.scene, cfg.heroUrl, { position: FOE_SPAWN.clone(), tint: '#ff2d78', startClip: SPORT_CLIP.idle });
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
      void meDribbleSM;
      meAnimTree = new BasketballAnimTree(me.animator);
      foeAnimTree = new BasketballAnimTree(foe.animator);
      meFootPlant = new FootPlant(me.skeleton, me.meshes[0] as never);
      meCarry?.dispose(); foeCarry?.dispose();
      meCarry = mountBallCarry({ scene: ctx.scene, ball, root: me.root, skeleton: me.skeleton });
      foeCarry = mountBallCarry({ scene: ctx.scene, ball, root: foe.root, skeleton: foe.skeleton });
      shotMeter = new ShotMeter();
      turbo = new TurboMeter();
      arc = new ShotArc();
      myScore = 0; foeScore = 0; momentum = 0; ended = false; foeStunSec = 0; foeFloored = false; loose = false;
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
      ctx.setHud({ score: myScore, foeScore, target: TARGET_SCORE, momentum: 0, turbo: 100, hint: HINT_OFFENCE });
      // dev probes (ONEVONE-DEFENSE-LOGIC): the possession machine, readable without the HUD
      if (process.env.NODE_ENV === 'development') {
        (ctx.scene.metadata ??= {}).onevone = { possession: () => possession, defPhase: () => defPhase, attackPhase: () => attacker.phase, foeRoot: foe.root, myJumpAge: () => myJumpAge };
      }
    },

    onInput(ctx: ModeContext, e: FelInput) {
      SoundKit.unlock();
      localSource.feed(e);
      if (e.t === 'stick' && e.side === 'R') { lookX = e.x; lookY = e.y; }   // MODE-STICK-FACE: R stick → the director's look orbit
      // BLOCK / contest jump on defense: A leaves the floor. Time it on their GATHER and it erases the shot; jump at
      // nothing and they drive past you while you land.
      if (possession === 'defense' && e.t === 'button' && e.btn === 'A' && e.pressed && myJumpAge === Infinity && meStunSec === 0 && defPhase !== 'over') {
        myJumpAge = 0;
        meAnimTree.beat('bball_block_reach');
        if (contact?.isReady) contact.hop('me', JUMP_VY);
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
      reachCooldown = Math.max(0, reachCooldown - dt);
      // the contest jump's clock; the kinematic fallback flies the root itself (physics lands the Havok body)
      if (myJumpAge !== Infinity) {
        myJumpAge += dt;
        if (!contact?.isReady) me.root.position.y = Math.max(0, Math.sin(Math.min(1, myJumpAge / JUMP_SEC) * Math.PI) * 0.46);
        if (myJumpAge >= JUMP_SEC) { myJumpAge = Infinity; if (!contact?.isReady) me.root.position.y = 0; }
      }
      // a posterized rival gets up when the stun ends (the tree held the floor)
      if (foeFloored && foeStunSec === 0) { foeFloored = false; foeAnimTree.beat('karate_get_up'); }

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
            later(700, () => { ctx.setHud({ banner: '' }); resetPositions(); });   // make it, take it
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
            // MAKE IT, TAKE IT — both ways. This handed ME the ball after their make (loser's ball).
            later(900, () => { ctx.setHud({ banner: '' }); startDefense(ctx, 'MAKE IT, TAKE IT — DEFEND!'); });
          }
        } else if (res === 'missed') {
          SoundKit.play('miss');
          launchLoose(ball.position.clone(), new Vector3((Math.random() - 0.5) * 3, 2.5, 1.5 + Math.random()));
          // THE BOARD IS A CONTEST, and BOX OUT is how you win it — on BOTH ends.
          //
          // This was a bare distance comparison, which made it deterministic —
          // and since you shoot after driving, you are essentially always the
          // closer body. Measured: with EVERY shot deliberately missed, the
          // banner read "YOUR BOARD" every single time and the opponent never
          // got a possession at all. And on THEIR miss it was "YOUR BOARD"
          // unconditionally: the race only ran on my possession.
          //
          // Distance still names the favourite. Boxing out is worth a real body
          // length on top of it — which is the whole point of a verb the mode
          // tells you to hold — and a little randomness keeps a board from being
          // decided before the ball leaves the rim.
          later(900, () => {
            const meD = Vector3.Distance(me.root.position, ball.position);
            const foeD = Vector3.Distance(foe.root.position, ball.position);
            const boxing = meSlot.intent.brace ?? false;
            const edge = (foeD - meD)
              + (boxing ? BOX_OUT_EDGE : 0)
              + (Math.random() - 0.5) * REBOUND_JITTER;
            if (edge <= 0) startDefense(ctx, possession === 'mine' ? 'THEIR BOARD — DEFEND!' : 'THEIR BOARD — DEFEND AGAIN!');
            else {
              bannerFlash(ctx, boxing ? 'BOXED OUT — YOUR BOARD' : 'YOUR BOARD');
              resetPositions();
            }
          });
        }
      } else if (loose && !dunking) {
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
              foeAnimTree.beat(SPORT_CLIP.karateHitReact);
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
              foeAnimTree.beat(SPORT_CLIP.karateHitReact);
              bannerFlash(ctx, 'BIT ON THE HESI!');
            } else {
              bannerFlash(ctx, 'HESI…', 500);
            }
          }
        }

        // the rival defends: the DefenderBrain's deny point, the press, the strip roll
        const foeIntent = foeSlot.intent;
        const foeVel = foeStunSec > 0 ? new Vector3(0, 0, 0) : new Vector3(foeIntent.moveX, 0, -foeIntent.moveY).scale(3.6);
        if (foeStunSec === 0) {
          // closing speed toward the handler feeds the hesi bite read
          const toMe = me.root.position.subtract(foe.root.position); toMe.y = 0;
          foeClosingSpeed = toMe.lengthSquared() > 1e-4
            ? Math.max(0, Vector3.Dot(foeVel, toMe.normalize()))
            : 0;
          foeCloseMemory = Math.max(foeClosingSpeed, foeCloseMemory - dt * 2.5);
          driveBody('foe', foe.root, foeVel, dt);
          if (foeVel.lengthSquared() > 0.05) face(foe.root, Math.atan2(foeVel.x, foeVel.z));
        }
        foeAnimTree.update({
          speed01: Math.min(1, foeVel.length() / 3.6), crossover: false, nearestDefender: Infinity,
          hasBall: false, shooting: false, dunking: false, driving: false,
          defending: true, bracing: false, staggered: false, slideDir: slideDirFor(foe.root.rotation.y, foeVel),
        });
        // same standoff fix as the defensive poke: bodies rest ~1.1m apart
        if (foeStunSec === 0 && carrying && !shooting && !dunking && foeIntent.steal && Vector3.Distance(me.root.position, foe.root.position) < 1.6) {
          SoundKit.play('impact', { pitch: 1.2, volume: 0.3 });
          swing('turnover');
          ctx.setHud({ momentum });
          foeAnimTree.beat('bball_steal_reach');
          startDefense(ctx, 'STRIPPED — CHECK UP, DEFEND!');
          return;
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
            meAnimTree.hold('jumpshot', { speedRatio: speed, fadeSec: 0.08 });
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
            if (possession === 'mine' && (shooting || dunking) && c.victim === 'me') {
              SoundKit.play('whistle');
              mbus.report({ kind: 'big_make', weight: 8 }); momentum = Math.round(mbus.score01 * 100);
              ctx.setHud({ momentum });
              bannerFlash(ctx, 'FOUL! — BALL BACK', 1000);
              resetPositions();
            } else if (possession === 'defense' && defPhase !== 'over' && c.attacker === 'me') {
              // I ran through them: their ball again, checked up
              SoundKit.play('whistle');
              mbus.report({ kind: 'turnover', weight: -10 }); momentum = Math.round(mbus.score01 * 100);
              ctx.setHud({ momentum });
              bannerFlash(ctx, 'FOUL ON YOU — THEIR BALL', 900);
              defPhase = 'over';
              later(900, () => startDefense(ctx, 'CHECK UP — DEFEND!'));
            } else if (possession === 'defense' && defPhase !== 'over' && c.attacker === 'foe' && meDribble.vel.length() < 1.0) {
              // they ran through a SET defender: the charge (a moving defender who gets hit is just beaten)
              SoundKit.play('whistle');
              swing('turnover');
              ctx.setHud({ momentum });
              bannerFlash(ctx, 'CHARGE — YOUR BALL', 1000);
              defPhase = 'over';
              later(900, () => resetPositions());
            }
          } else if (c.severity === 'hard') {
            SoundKit.play('impact', { pitch: 1.0, volume: 0.3 });
            ctx.feel?.impact?.(0.25);
          }
        }
      }

      // ══ THEIR POSSESSION — you defend ══
      if (possession === 'defense') {
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
        meAnimTree.update({
          speed01: drib.speed01, crossover: false, nearestDefender: Infinity,
          hasBall: false, shooting: false, dunking: false, driving: false,
          defending: true, bracing: intent.brace ?? false, staggered: false, slideDir: slideDirFor(drib.facingRad, meDribble.vel),
        });
        const dist = Vector3.Distance(me.root.position, foe.root.position);

        if (defPhase === 'check' || defPhase === 'drive') {
          // the rival attacks — reading ME: contained → sidestep, open → drive, held → pull-up, a jump at nothing → blow-by
          const dec = attacker.decide(dt, foe.root.position, me.root.position, RIM_FLOOR, { defenderAirborne: myJumpAge !== Infinity && myJumpAge < 0.6 });
          if (defPhase === 'check' && dec.phase !== 'check') defPhase = 'drive';
          const sp = dec.wish.length();
          driveBody('foe', foe.root, dec.wish, dt);
          // a driver faces the rim through a sidestep (a crossover, not a run sideways); a blow-by runs its line
          face(foe.root, dec.phase === 'blowby' && sp > 0.5 ? Math.atan2(dec.wish.x, dec.wish.z) : Math.atan2(RIM.x - foe.root.position.x, RIM.z - foe.root.position.z));
          // the gather / step-back are mode-owned beats — the tree's loop choice must not race them (a 'protect'
          // stance played on the gather's first frame popped the hand 0.45 m)
          if (dec.phase !== 'gather' && dec.phase !== 'stepback') foeAnimTree.update({
            speed01: Math.min(1, sp / RIVAL_DRIVE_SPEED), crossover: false, nearestDefender: dist,
            hasBall: true, shooting: false, dunking: false, driving: dec.phase === 'blowby',
            defending: false, bracing: false, staggered: false,
          });
          if (dec.phase === 'stepback' && !stepbackShown) { stepbackShown = true; foeAnimTree.beat('bball_hesi', { fadeSec: 0.1 }); }   // the step-back reads as a check: the body loads
          if (dec.crossover) {
            // the ball SWITCHES hands — the read. A same-hand shuffle (dec.step without a crossover) keeps the dribble loop.
            foeAnimTree.beat(dec.crossover === 'left' ? 'bball_crossover_left' : 'bball_crossover_right', { fadeSec: 0.12 });
            foeCarry?.switchHand();
            SoundKit.play('whoosh', { pitch: 1.3, volume: 0.3 });
          }
          if (dec.phase === 'gather') {
            // THE TELEGRAPH: the ball comes back to the palm and the body loads for GATHER_SEC — the block cue
            if (!gatherShown) {
              gatherShown = true;
              foeCarry?.update(0, 0, false);
              if (distXZ(foe.root.position, RIM_FLOOR) < 2.2) foeAnimTree.beat('bball_layup_gather');
              else foeAnimTree.hold(SPORT_CLIP.dunkChargeGather, { fadeSec: 0.08 });
              SoundKit.play('whoosh', { pitch: 0.9, volume: 0.25 });
            }
          } else {
            foeCarry?.update(dt, Math.max(0.3, Math.min(1, sp / RIVAL_DRIVE_SPEED)), true);   // the live dribble (the check is an idle dribble)
          }

          // STEAL poke: a read, not a dice roll. The rival's crossover / weave EXPOSES the ball — poke while it crosses
          // over and it's yours; reach while they're protecting it (or gathering) and you're off your feet while they go by.
          if (intent.steal && reachCooldown === 0 && meStunSec === 0) {
            reachCooldown = REACH_COOLDOWN_SEC;
            meAnimTree.beat('bball_steal_reach');
            if (dist < STEAL_RANGE && dec.exposure >= STEAL_EXPOSURE_MIN && dec.phase !== 'gather' && dec.phase !== 'check') {
              SoundKit.play('impact', { pitch: 1.3, volume: 0.4 });
              swing('steal');
              attacker.noteStolen();   // the rival learns: fewer crossovers in front of this defender
              ctx.setHud({ momentum });
              bannerFlash(ctx, 'PICKED THEIR POCKET!');
              resetPositions();
              return;
            }
            meStunSec = REACH_WHIFF_STUN_SEC;
            if (dist < 2.4) attacker.blowBy();
            SoundKit.play('whoosh', { pitch: 0.7, volume: 0.3 });
            bannerFlash(ctx, 'REACH — THEY GO BY', 700);
          }

          if (dec.shot) releaseRival(ctx, dec.shot);
        } else if (defPhase === 'shot') {
          // the shot is up: the rival crashes the board when the ball is loose, else holds the follow-through / a stance
          const wish = new Vector3(0, 0, 0);
          if (loose) {
            const toBall = ball.position.subtract(foe.root.position); toBall.y = 0;
            if (toBall.length() > 0.7) wish.copyFrom(toBall.normalize().scale(3.0));
          }
          driveBody('foe', foe.root, wish, dt);
          if (wish.lengthSquared() > 0.05) face(foe.root, Math.atan2(wish.x, wish.z));
          foeAnimTree.update({
            speed01: Math.min(1, wish.length() / 3.6), crossover: false, nearestDefender: Infinity,
            hasBall: false, shooting: false, dunking: false, driving: false,
            defending: false, bracing: false, staggered: false,
          });
        }

        if (!contact?.isReady) resolveBodyCollision(me.root.position, foe.root.position);

        // Ship Pass 6: a two-point fit on a foe within arm's reach put the camera inside a body (sweep frame 2026-09-05);
        // frame a point 1.5 m past the rival toward the rim — never inside a body, and the check at the top is on screen
        // (a rim frame put the rival behind the camera at the check).
        const past = RIM_FLOOR.subtract(foe.root.position); past.y = 0;
        const look = past.lengthSquared() > 1e-4 ? foe.root.position.add(past.normalize().scale(1.5)) : foe.root.position;
        ctx.camDirector.look(lookX, lookY, dt);
        ctx.camDirector.update(me.root.position, meDribble.vel, look);
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

  /** THEIR possession: the check. The rival checks up beyond the arc, I set inside him, the drive starts after
   *  CHECK_HOLD_SEC. No timer decides the release — the AttackerBrain reads my body. */
  function startDefense(ctx: ModeContext, banner: string): void {
    possessionToken++;
    possession = 'defense'; carrying = false; shooting = false; dunking = false; currentShot = null;
    defPhase = 'check'; attacker.reset(); gatherShown = false; stepbackShown = false;
    myJumpAge = Infinity; meStunSec = 0; reachCooldown = 0; defContest = 0;
    arc.active = false;
    place('foe', foe.root, CHECK_FOE, Math.PI);
    place('me', me.root, CHECK_ME, 0);
    if (!contact?.isReady) me.root.position.y = 0;
    meDribble.setFacing(0);                  // set facing the rival
    foeStunSec = 0;
    if (foeFloored) { foeFloored = false; foeAnimTree.beat('karate_get_up'); }
    else foeAnimTree.releaseHold();
    meAnimTree.releaseHold();
    giveBall('foe');
    bannerFlash(ctx, banner, 1000);
    ctx.setHud({ hint: HINT_DEFENCE, shotType: '', shotMeterT: 0 });
  }

  /** The rival's release: block check, contest (+ a hand up), the make roll, the arc. */
  function releaseRival(ctx: ModeContext, style: 'layup' | 'jumper'): void {
    defPhase = 'shot'; gatherShown = false;
    foeCarry?.update(0, 0, false);
    releaseBall(ball);
    // a jumper rises out of the gather hold; a layup leaves the hand at the top of the layup gather beat, which plays out
    // (a jumpshot cut in over it popped the hand 0.37 m)
    if (style === 'jumper') foeAnimTree.beat('jumpshot', { fadeSec: 0.1 });
    // BLOCK check — a timed jump in range erases it. A jumper needs the blocker INSIDE the step-back (1.2 m — from further
    // out a hand up is a contest, below); a layup at the rim can be chased down from BLOCK_RANGE.
    const blockRange = style === 'jumper' ? 1.2 : BLOCK_RANGE;
    if (checkBlock(me.root.position, foe.root.position, myJumpAge) && Vector3.Distance(me.root.position, foe.root.position) <= blockRange) {
      SoundKit.play('impact', { pitch: 0.7, volume: 0.6 });
      SoundKit.play('crowdCheer', { volume: 0.6 });
      ctx.feel?.impact?.(0.5);
      EffectsKit.burst(ctx.scene, ball.position.clone(), 'sparks');
      swing('block');
      launchLoose(ball.getAbsolutePosition(), new Vector3((Math.random() - 0.5) * 4, 2, 3));
      ctx.setHud({ momentum });
      bannerFlash(ctx, 'REJECTED!', 900);
      defPhase = 'over';
      later(1000, () => resetPositions());
      return;
    }
    // no block — my contest (distance + a hand up) and their range set the make%
    const contest = handUpContest(contestLevel(foe.root.position, me.root.position), myJumpAge);
    defContest = contest;
    const range = distXZ(foe.root.position, RIM_FLOOR);
    const made = Math.random() < rivalShotPct(range, contest, style);
    arcPoints = style === 'layup' ? 2 : isThree(foe.root.position, RIM) ? 3 : 2;
    arc.start(ball.getAbsolutePosition(), RIM, made, style);
    // the read at the release, before the arc lands — same as the hero's GREEN / CONTESTED tags
    if (contest >= 0.5) bannerFlash(ctx, 'CONTESTED!', 500);
    else if (contest <= 0.15) bannerFlash(ctx, 'WIDE OPEN…', 500);
  }

  function startDunk(ctx: ModeContext, kind: 'dunk' | 'poster'): void {
    dunking = true; shooting = false; contactLatch = false;   // A+ P0: a fresh attempt gets one punch
    turbo.t01 = Math.max(0, turbo.t01 - 0.3);           // dunks spend fuel
    const made = Math.random() < DUNK_PCT[kind];
    SoundKit.play('whoosh', { pitch: 0.85 });
    meAnimTree.beat(SPORT_CLIP.dunkLaunchPower);
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
          foeStunSec = 1.4; foeFloored = true;
          foeAnimTree.beat(SPORT_CLIP.karateKnockdown, { settleTo: { clip: 'karate_floor_hold' } });
          EffectsKit.burst(ctx.scene, foe.root.position.add(new Vector3(0, 0.3, 0)), 'dust');
        }
        ctx.setHud({ score: myScore, momentum });
        bannerFlash(ctx, posterized ? 'POSTERIZED!' : 'THROWN DOWN!', 1000);
        carrying = true;
        if (checkGameOver(ctx)) return;
        later(posterized ? 1500 : 900, () => resetPositions());   // a posterized body gets up before it is moved
      } else {
        SoundKit.play('miss');
        SoundKit.play('crowdGroan', { volume: 0.4 });
        missClank(ctx);   // A+ P0: the miss has weight too — a clank, never the make's punch
        launchLoose(ball.getAbsolutePosition(), new Vector3((Math.random() - 0.5) * 3, 3, 2));
        bannerFlash(ctx, kind === 'poster' ? 'STUFFED AT THE RIM!' : 'RATTLED OUT');
        later(900, () => startDefense(ctx, 'THEIR BALL — CHECK UP, DEFEND!'));
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
    const made = Math.random() < Math.min(0.98, pct);
    releaseBall(ball);
    // The jumpshot is HELD by the tree (meter-paced from shot start) — do NOT restart it here or the release frame pops.
    // Let it ride out the follow-through, then release the hold (the tree settles into the stance while the arc flies).
    // Layups keep their own finish clip.
    if (currentShot?.style === 'layup') meAnimTree.beat(SPORT_CLIP.dunkLaunchPower);
    else later(420, () => meAnimTree.release());
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
    if (!made) swing('miss');
    carrying = false;
    arc.start(ball.getAbsolutePosition(), RIM, made, currentShot?.style ?? 'jumper');
  }
})();

// HUD fields: foeScore, target, momentum, shotMeterT, shotType, camFollowM
// (dropped — was debug), and NEW turbo (0-100 — render as a small fuel bar
// under the momentum meter).
