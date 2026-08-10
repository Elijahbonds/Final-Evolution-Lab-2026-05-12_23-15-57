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

import { MeshBuilder, TransformNode as BABYLON_TransformNode, Vector3 } from '@babylonjs/core';
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
  DribbleController, ShotMeter, DefenderBrain, contestLevel, clampToHalfCourt,
  resolveBodyCollision, checkAnkleBreak, classifyShot, ANKLE_BREAK_STUN_SEC,
  TurboMeter, ShotArc, checkDriveDunk, checkBlock, DUNK_PCT,
  SHOT_QUALITY_PCT, type ShotQuality, type ShotContext,
} from '../core/BasketballCore';
import { DribbleStateMachine, DRIBBLE_CLIP, syncedShotSpeed } from '../core/BallHandling';
import { ContactSystem } from '../core/ContactSystem';
import { MomentumBus } from '../core/MomentumBus';
import { BasketballAnimTree, FootPlant } from '../anim/basketballTree';
import { SoundKit } from '../audio/SoundKit';
import { EffectsKit } from '../visual/EffectsKit';
import { assertSpawned } from '../core/FrameGuard';
import type { ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import { DUNK_CONFIG as SHARED_CFG } from './modeConfigs';

const RIM = new Vector3(0, 3.05, -0.6);
const TARGET_SCORE = 11;
const PAINT_RADIUS = 4.2;
const DEFENSE_DRIVE_SEC = 2.2;                     // rival's drive length on their possession

type Possession = 'mine' | 'defense';

export const OneVOneMode: ModeDefinition = (() => {
  let me: SpawnedCharacter, foe: SpawnedCharacter, ball: AbstractMesh, ballSim: BallSim;
  let onevoneVenue: VenueHandle | null = null;  // M74
  let meSlot: PlayerSlot, foeSlot: PlayerSlot, localSource: LocalInputSource;
  let meDribble: DribbleController;
  let meDribbleSM: DribbleStateMachine;
  let meAnimTree: BasketballAnimTree;
  let meFootPlant: FootPlant;
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
  let currentShot: ShotContext | null = null;
  // defense phase state
  let defSec = 0, defReleased = false, defResolved = false, myJumpAge = Infinity;
  let contact: ContactSystem | null = null;      // Phase 4: Havok bodies when ready

  /** Move a physics-bound character, or fall back to kinematic writes. */
  function driveBody(id: string, root: TransformNode, vel: Vector3, dt: number): void {
    if (contact?.isReady) {
      // soft court bounds: kill the outward velocity component at the edge
      const p = root.position;
      const v = vel.clone();
      if ((p.x > 7.2 && v.x > 0) || (p.x < -7.2 && v.x < 0)) v.x = 0;
      if ((p.z > 14.5 && v.z > 0) || (p.z < 0.5 && v.z < 0)) v.z = 0;
      contact.drive(id, v, dt);
    } else {
      root.position.addInPlace(vel.scale(dt));
      clampToHalfCourt(root.position, 7.2, 14.5);
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
    currentShot = null; myJumpAge = Infinity;
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
      onevoneVenue = mountVenue(ctx, 'basketball_h2h', { keepGameplayCamera: true });
      if (!onevoneVenue) { VenueKit.buildCourt(ctx.scene, 'venice'); applyOceanCourt(ctx.scene, 'venice'); }
      me = await CharacterLibrary.spawn(ctx.scene, cfg.heroUrl, { position: new Vector3(0, 0, 5), yawRad: Math.PI, startClip: SPORT_CLIP.idle });
      neverBindPose(me.animator, SPORT_CLIP.idle); installSafePlay(me.animator, 'onevone-me');
      ctx.groundLock?.track(me.root, me.skeleton);
      foe = await CharacterLibrary.spawn(ctx.scene, cfg.heroUrl, { position: new Vector3(0, 0, 2), tint: '#ff2d78', startClip: SPORT_CLIP.idle });
      neverBindPose(foe.animator, SPORT_CLIP.idle); installSafePlay(foe.animator, 'onevone-foe');
      ctx.groundLock?.track(foe.root, foe.skeleton);
      onevoneVenue?.hidePlaceholders();  // M74

      ball = MeshBuilder.CreateSphere('ball', { diameter: 0.24 }, ctx.scene);
      ballSim = new BallSim(ball, 0.12);
      attachBallToHand(ball, me.skeleton, 'RightHand');
      EffectsKit.ambient(ctx.scene, 'venice');
      EffectsKit.ballTrail(ctx.scene, ball);
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
        ball: () => ball.position, hoop: () => RIM, allies: () => [], foes: () => [me.root.position],
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
      meDribbleSM = new DribbleStateMachine();
      meAnimTree = new BasketballAnimTree(me.animator);
      meFootPlant = new FootPlant(me.skeleton, me.meshes[0] as never);
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
        hint: 'Drive fast at the rim to DUNK · snap the stick for ankles · on D: hold L1/LT to BOX OUT, X to STEAL, A to BLOCK',
      });
    },

    onInput(ctx: ModeContext, e: FelInput) {
      SoundKit.unlock();
      localSource.feed(e);
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
            ctx.setHud({ score: myScore, momentum, banner: `${arcLabel} — GOOD!` });
            carrying = true;
            if (checkGameOver(ctx)) return;
            setTimeout(() => { ctx.setHud({ banner: '' }); resetPositions(); }, 700);
          } else {
            foeScore += arcPoints;
            SoundKit.play('crowdGroan', { volume: 0.4 });
            ctx.setHud({ foeScore, banner: 'THEY SCORE' });
            if (checkGameOver(ctx)) return;
            setTimeout(() => { ctx.setHud({ banner: '' }); resetPositions(); }, 800);
          }
        } else if (res === 'missed') {
          SoundKit.play('miss');
          ballSim.launch(ball.position.clone(), new Vector3((Math.random() - 0.5) * 3, 2.5, 1.5 + Math.random()));
          // rebound race: closer body takes it
          setTimeout(() => {
            if (ended) return;
            const meD = Vector3.Distance(me.root.position, ball.position);
            const foeD = Vector3.Distance(foe.root.position, ball.position);
            if (possession === 'mine' && foeD < meD) { startDefense(ctx, 'THEIR BOARD — DEFEND!'); }
            else { bannerFlash(ctx, meD <= foeD ? 'YOUR BOARD' : 'LOOSE BALL — YOURS'); resetPositions(); }
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
        const drib = meDribble.update(dt, intent.moveX, intent.moveY, sprintOk);
        if (!shooting && !dunking) {
          driveBody('me', me.root, meDribble.vel, dt);
          me.root.rotation.y = drib.facingRad;
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
        }

        if (foeStunSec === 0) {
          const foeIntent = foeSlot.intent;
          const foeVel = new Vector3(foeIntent.moveX, 0, -foeIntent.moveY).scale(3.6);
          driveBody('foe', foe.root, foeVel, dt);
          if (foeVel.lengthSquared() > 0.05) foe.root.rotation.y = Math.atan2(foeVel.x, foeVel.z);
          foe.animator.play(foeVel.lengthSquared() > 0.3 ? SPORT_CLIP.moveLoop : SPORT_CLIP.idle, { loop: true });
          if (carrying && !shooting && !dunking && foeIntent.steal && Vector3.Distance(me.root.position, foe.root.position) < 1.2) {
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
          const kind = checkDriveDunk(me.root.position, meDribble.vel, RIM, turbo.t01, defenderPos);
          if (kind !== 'none') { startDunk(ctx, kind); }
          else {
            shooting = true;
            const contest = contestLevel(me.root.position, defenderPos);
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
      if (possession === 'defense') {
        defSec += dt;
        // I move freely on D (turbo still gates sprint)
        const intent = meSlot.intent;
        const moving = Math.hypot(intent.moveX, intent.moveY) > 0.1;
        const sprintOk = turbo.gate(dt, intent.sprint, moving);
        ctx.setHud({ turbo: Math.round(turbo.t01 * 100) });
        const drib = meDribble.update(dt, intent.moveX, intent.moveY, sprintOk);
        driveBody('me', me.root, meDribble.vel, dt);
        me.root.rotation.y = drib.facingRad;
        contact?.brace('me', intent.brace ?? false);
        if (myJumpAge === Infinity) {
          meAnimTree.update({
            speed01: drib.speed01, crossover: drib.crossover, nearestDefender: Infinity,
            hasBall: false, shooting: false, dunking: false, driving: false,
            defending: true, bracing: intent.brace ?? false, staggered: false,
          });
        }

        // the rival drives the lane
        if (!defReleased) {
          const k = Math.min(1, defSec / DEFENSE_DRIVE_SEC);
          const targetX = Math.sin(defSec * 2.1) * 2.2 * (1 - k);
          if (contact?.isReady) {
            const vx = (targetX - foe.root.position.x) * 3;
            const vz = (RIM.z + 2 - foe.root.position.z) * (0.9 + k);
            contact.drive('foe', new Vector3(vx, 0, vz), dt);
          } else {
            foe.root.position.x += (targetX - foe.root.position.x) * 3 * dt;
            foe.root.position.z += ((RIM.z + 2 - foe.root.position.z)) * (0.9 + k) * dt;
          }
          foe.root.rotation.y = Math.PI;
          foe.animator.play(SPORT_CLIP.moveLoop, { loop: true });
          attachBallToHand(ball, foe.skeleton, 'RightHand');

          // STEAL poke: my steal edge in tight range
          if (intent.steal && Vector3.Distance(me.root.position, foe.root.position) < 1.2 && Math.random() < 0.5) {
            SoundKit.play('impact', { pitch: 1.3, volume: 0.4 });
            swing('steal');
            ctx.setHud({ momentum });
            bannerFlash(ctx, 'PICKED THEIR POCKET!');
            resetPositions();
            return;
          }

          if (!contact?.isReady) resolveBodyCollision(me.root.position, foe.root.position);

          // release moment
          if (defSec >= DEFENSE_DRIVE_SEC && !defResolved) {
            defReleased = true;
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
            const made = Math.random() < 0.62 - contest * 0.35;
            arcPoints = Vector3.Distance(foe.root.position, RIM) > PAINT_RADIUS ? 2 : 1;
            arcResultMade = made;
            arc.start(ball.getAbsolutePosition(), RIM, made, 'jumper');
            defResolved = true;
          }
        }

        ctx.camDirector.update(me.root.position, meDribble.vel, foe.root.position);
      }
    },

    dispose() {
      meFootPlant?.dispose();
      contact?.dispose(); contact = null;
      me?.dispose(); foe?.dispose(); ball?.dispose();
      meSlot?.dispose(); foeSlot?.dispose();
      SoundKit.stopAmbient();
      onevoneVenue?.dispose(); onevoneVenue = null;  // M74
    },
  };

  function startDefense(ctx: ModeContext, banner: string): void {
    possession = 'defense'; carrying = false; shooting = false; dunking = false;
    defSec = 0; defReleased = false; defResolved = false; myJumpAge = Infinity;
    arc.active = false;
    attachBallToHand(ball, foe.skeleton, 'RightHand');
    bannerFlash(ctx, banner, 900);
    ctx.setHud({ hint: 'STEAL in tight · time a jump (A) at their release to BLOCK' });
    // watchdog: a defense phase can never hang
    setTimeout(() => {
      if (!ended && possession === 'defense' && !defReleased && defSec < DEFENSE_DRIVE_SEC * 0.5) {
        console.warn('[FEL-1V1] defense watchdog — forcing release');
        defSec = DEFENSE_DRIVE_SEC;
      }
    }, (DEFENSE_DRIVE_SEC + 2.5) * 1000);
  }

  function startDunk(ctx: ModeContext, kind: 'dunk' | 'poster'): void {
    dunking = true; shooting = false;
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
        myScore += 1;
        const posterized = kind === 'poster';
        swing(posterized ? 'posterize' : 'highlight_dunk');
        ctx.camDirector.pulse(posterized ? 0.85 : 0.6, 0.5);
        SoundKit.play('score', { pitch: 0.9 });
        SoundKit.play('crowdCheer', { volume: posterized ? 0.8 : 0.5 });
        ctx.feel?.impact?.(posterized ? 0.7 : 0.45);
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
        ballSim.launch(ball.getAbsolutePosition(), new Vector3((Math.random() - 0.5) * 3, 3, 2));
        bannerFlash(ctx, kind === 'poster' ? 'STUFFED AT THE RIM!' : 'RATTLED OUT');
        setTimeout(() => { if (!ended) startDefense(ctx, 'THEIR BALL'); }, 900);
      }
    });
  }

  function releaseJumper(ctx: ModeContext, quality: ShotQuality): void {
    shooting = false;
    const pctMod = currentShot?.pctMod ?? 1;
    const pct = SHOT_QUALITY_PCT[quality] * pctMod * mbus.multiplier();
    const dist = Vector3.Distance(me.root.position, RIM);
    arcPoints = dist > PAINT_RADIUS ? 2 : 1;
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
    if (quality === 'perfect') {
      SoundKit.play('uiTick', { pitch: 1.5, volume: 0.4 });
      SoundKit.play('crowdCheer', { volume: 0.35 });
      ctx.feel?.impact?.(0.2);
      bannerFlash(ctx, 'GREEN!', 600);
      ctx.camDirector.pulse(0.3, 0.35);
    }
    if (!arcResultMade) swing('miss');
    carrying = false;
    arc.start(ball.getAbsolutePosition(), RIM, arcResultMade, currentShot?.style ?? 'jumper');
  }
})();

// HUD fields: foeScore, target, momentum, shotMeterT, shotType, camFollowM
// (dropped — was debug), and NEW turbo (0-100 — render as a small fuel bar
// under the momentum meter).
