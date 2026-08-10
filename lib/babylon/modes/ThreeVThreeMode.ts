// ThreeVThreeMode v3 — REPLACES the M52 file. The comprehensive upgrade
// (same systems as OneVOne v3, wired for the team game). Everything from
// v2 is kept — body collision on all 15 pairs, ankle-breakers, shot
// variety, TeammateBrain spacing/cuts, pass-to-open-man, assists — plus:
//   THE BALL FLIES — my attempts arc for real (ShotArc): makes drop, misses
//     clang and go live.
//   DRIVE DUNKS — attack the rim hot with turbo and the shot button throws
//     it down; through a parked defender = POSTERIZE (they hit the floor).
//   TURBO — sprint is fuel (drains/regens); HUD shows the tank.
//   BLOCK ON DEFENSE — opponent possessions are now contestable with a
//     timed jump (A) around their release, on top of the positional make%
//     your D already sets. Time it in range and the shot is REJECTED.

import { MeshBuilder, Vector3 } from '@babylonjs/core';
import type { AbstractMesh } from '@babylonjs/core';
import { CharacterLibrary, type SpawnedCharacter } from '../core/CharacterLibrary';
import { neverBindPose } from '../anim/importSanitizer';
import { installSafePlay, SPORT_CLIP } from '../anim/clipRegistry';
import { VenueKit } from '../visual/VenueKit';
import { applyOceanCourt } from '../visual/CourtSurface';
import { mountVenue, type VenueHandle } from '../core/NexusVenue';  // M74
import { BallSim } from '../core/BallPhysics';
import { attachBallToHand, releaseBall } from '../anim/ballRig';
import { PlayerSlot, LocalInputSource, AISource } from '../core/PlayerSlot';
import {
  DribbleController, ShotMeter, DefenderBrain, TeammateBrain, contestLevel, clampToHalfCourt,
  resolveBodyCollision, checkAnkleBreak, classifyShot, ANKLE_BREAK_STUN_SEC,
  TurboMeter, ShotArc, checkDriveDunk, checkBlock, DUNK_PCT,
  SHOT_QUALITY_PCT, type ShotQuality, type ShotContext,
} from '../core/BasketballCore';
import { lockTarget, choosePassType, PassFlight, type PassType } from '../core/BallHandling';
import { SoundKit } from '../audio/SoundKit';
import { EffectsKit } from '../visual/EffectsKit';
import { assertSpawned } from '../core/FrameGuard';
import type { ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import { DUNK_CONFIG as SHARED_CFG } from './modeConfigs';

const RIM = new Vector3(0, 3.05, -0.6);
const TARGET_SCORE = 21;
const PAINT_RADIUS = 4.5;
const POSSESSION_SEC = 90;

interface Body { char: SpawnedCharacter; slot: PlayerSlot; drib: DribbleController; stunSec: number }

export const ThreeVThreeMode: ModeDefinition = (() => {
  let threeVenue: VenueHandle | null = null;  // M74
  let me: Body;
  let mates: Body[] = [];
  let foes: Body[] = [];
  let ball: AbstractMesh, ballSim: BallSim;
  let localSource: LocalInputSource;
  let shotMeter: ShotMeter;
  let turbo: TurboMeter;
  let arc: ShotArc;
  let arcMade = false, arcPoints = 0, arcLabel = '', arcQuality: ShotQuality = 'good';
  let myScore = 0, foeScore = 0, assists = 0, timeLeft = POSSESSION_SEC;
  let carrierId: 'me' | 'mate0' | 'mate1' | 'foeTeam' = 'me';
  let shooting = false, dunking = false, ended = false, lastPasserWasMe = false;
  let currentShot: ShotContext | null = null;
  let myJumpAge = Infinity;                      // block-jump timer (defense)
  const passFlight = new PassFlight();
  let passTargetId: 'mate0' | 'mate1' = 'mate0';
  let passType: PassType = 'chest';
  let foeShotBlocked = false;

  const cfg = { heroUrl: SHARED_CFG.heroUrl };

  function allyPositions(): Vector3[] { return [me.char.root.position, ...mates.map((m) => m.char.root.position)]; }
  function foePositions(): Vector3[] { return foes.map((f) => f.char.root.position); }
  function everyBody(): Body[] { return [me, ...mates, ...foes]; }
  function carrierBody(): Body | null {
    if (carrierId === 'me') return me;
    if (carrierId === 'mate0') return mates[0];
    if (carrierId === 'mate1') return mates[1];
    return null;
  }

  function giveBallTo(id: typeof carrierId): void {
    carrierId = id;
    const body = carrierBody();
    if (body) attachBallToHand(ball, body.char.skeleton, 'RightHand');
  }

  function resetPossession(toMe = true): void {
    me.char.root.position.set(0, 0, 6);
    mates[0].char.root.position.set(-3.5, 0, 4);
    mates[1].char.root.position.set(3.5, 0, 4);
    foes.forEach((f, i) => f.char.root.position.set((i - 1) * 3, 0, 2));
    shooting = false; currentShot = null;
    if (toMe) giveBallTo('me');
  }

  return {
    modeId: 'threevthree', mood: 'goldenHour', camPreset: 'team',

    async load(ctx: ModeContext) {
      threeVenue = mountVenue(ctx, 'basketball_3v3', { keepGameplayCamera: true });
      if (!threeVenue) { VenueKit.buildCourt(ctx.scene, 'venice'); applyOceanCourt(ctx.scene, 'venice'); }
      const spawnBody = async (pos: Vector3, tint: string | undefined, ai: boolean, aiKind: 'teammate' | 'defender', slotAngle = 0): Promise<Body> => {
        const char = await CharacterLibrary.spawn(ctx.scene, cfg.heroUrl, { position: pos, tint, startClip: SPORT_CLIP.idle });
        neverBindPose(char.animator, SPORT_CLIP.idle);
        installSafePlay(char.animator, 'threevthree');
        ctx.groundLock?.track(char.root, char.skeleton);
        const slot = ai
          ? new PlayerSlot('ai', new AISource(char.root.position, {
              ball: () => ball.position, hoop: () => RIM, allies: allyPositions, foes: foePositions,
            }, aiKind === 'teammate' ? new TeammateBrain(slotAngle) : new DefenderBrain(0.55)), false)
          : new PlayerSlot('me', localSource, true);
        return { char, slot, drib: new DribbleController(), stunSec: 0 };
      };

      localSource = new LocalInputSource();
      me = await spawnBody(new Vector3(0, 0, 6), undefined, false, 'teammate');
      mates = [
        await spawnBody(new Vector3(-3.5, 0, 4), '#22d3ee', true, 'teammate', Math.PI * 0.25),
        await spawnBody(new Vector3(3.5, 0, 4), '#22d3ee', true, 'teammate', -Math.PI * 0.25),
      ];
      foes = [
        await spawnBody(new Vector3(-2, 0, 2), '#ff2d78', true, 'defender'),
        await spawnBody(new Vector3(0, 0, 1.5), '#ff2d78', true, 'defender'),
        await spawnBody(new Vector3(2, 0, 2), '#ff2d78', true, 'defender'),
      ];

      ball = MeshBuilder.CreateSphere('ball', { diameter: 0.24 }, ctx.scene);
      ballSim = new BallSim(ball, 0.12);
      shotMeter = new ShotMeter();
      turbo = new TurboMeter();
      arc = new ShotArc();
      EffectsKit.ambient(ctx.scene, 'venice');
      EffectsKit.ballTrail(ctx.scene, ball);
      SoundKit.startAmbient('stadium');

      myScore = 0; foeScore = 0; assists = 0; timeLeft = POSSESSION_SEC; ended = false;
      ctx.heroRef.current = me.char.root;
      ctx.objectiveRef.current = RIM;
      ctx.camDirector.snapTo(me.char.root.position, RIM);
      threeVenue?.hidePlaceholders();  // M74: drop stand-ins now that real chars are in
      assertSpawned(ctx.scene, { hero: me.char.root, minWorldMeshes: 6, modeId: 'threevthree' });
      resetPossession(true);
      ctx.setHud({
        score: myScore, foeScore, target: TARGET_SCORE, time: timeLeft, ast: assists,
        hint: 'Work the court · PASS to the open man · snap the stick to break ankles · HOLD SHOOT, release in the green',
      });
    },

    onInput(ctx: ModeContext, e: FelInput) {
      SoundKit.unlock();
      localSource.feed(e);
      // BLOCK jump while defending an opponent possession
      if (carrierId === 'foeTeam' && e.t === 'button' && e.btn === 'A' && e.pressed && myJumpAge === Infinity) {
        myJumpAge = 0;
        me.char.animator.play(SPORT_CLIP.jumpUp, { onEnd: () => me.char.animator.play(SPORT_CLIP.idle, { loop: true }) });
        SoundKit.play('whoosh', { pitch: 1.2, volume: 0.35 });
      }
    },

    update(ctx: ModeContext, dt: number) {
      if (ended) return;
      timeLeft -= dt;
      if (timeLeft <= 0) {
        ended = true; SoundKit.play('whistle');
        return ctx.end(myScore >= foeScore ? 'WIN' : 'LOSS', myScore, { foeScore, assists });
      }
      ctx.setHud({ time: Math.ceil(timeLeft) });

      // poll every body; tick stagger timers
      for (const b of everyBody()) { b.slot.poll(dt); b.stunSec = Math.max(0, b.stunSec - dt); }
      if (myJumpAge !== Infinity) myJumpAge += dt;

      // the ball in flight (my arced attempt)
      if (arc.active) {
        const res = arc.step(dt, ball.position);
        if (res === 'made') {
          myScore += arcPoints;
          SoundKit.play('score', { pitch: arcQuality === 'perfect' ? 1.2 : 1 });
          EffectsKit.burst(ctx.scene, RIM, 'net');
          if (arcQuality === 'perfect') SoundKit.play('crowdCheer');
          ctx.setHud({ score: myScore, banner: arcQuality === 'perfect' ? `${arcLabel} — SPLASH!` : `${arcLabel} — GOOD!` });
          setTimeout(() => ctx.setHud({ banner: '' }), 800);
          if (myScore >= TARGET_SCORE) { ended = true; SoundKit.play('whistle'); ctx.end('WIN', myScore, { foeScore, assists }); return; }
          setTimeout(() => { if (!ended) void opponentPossession(ctx); }, 300);
        } else if (res === 'missed') {
          SoundKit.play('miss');
          ballSim.launch(ball.position.clone(), new Vector3((Math.random() - 0.5) * 3, 2.5, 1.5));
          ctx.setHud({ banner: 'RIMS OUT' });
          setTimeout(() => ctx.setHud({ banner: '' }), 700);
          setTimeout(() => { if (!ended) void opponentPossession(ctx); }, 900);
        }
      }

      const iAmCarrier = carrierId === 'me';
      const meIntent = me.slot.intent;
      const moving = Math.hypot(meIntent.moveX, meIntent.moveY) > 0.1;
      const sprintOk = turbo.gate(dt, meIntent.sprint, moving);
      ctx.setHud({ turbo: Math.round(turbo.t01 * 100) });
      const drib = me.drib.update(dt, meIntent.moveX, meIntent.moveY, sprintOk);
      if (!shooting && !dunking) {
        me.char.root.position.addInPlace(me.drib.vel.scale(dt));
        clampToHalfCourt(me.char.root.position, 8, 15);
        me.char.root.rotation.y = drib.facingRad;
        me.char.animator.play(drib.speed01 > 0.15 ? SPORT_CLIP.moveLoop : SPORT_CLIP.idle, { loop: true });

        // ANKLE-BREAKER on the nearest set defender
        if (iAmCarrier && drib.crossover) {
          SoundKit.play('whoosh', { pitch: 1.4, volume: 0.4 });
          const near = foes.reduce<Body | null>((best, f) =>
            !best || Vector3.Distance(f.char.root.position, me.char.root.position)
              < Vector3.Distance(best.char.root.position, me.char.root.position) ? f : best, null);
          if (near && near.stunSec === 0 && checkAnkleBreak(true, me.char.root.position, near.char.root.position)) {
            near.stunSec = ANKLE_BREAK_STUN_SEC;
            SoundKit.play('impact', { pitch: 0.8, volume: 0.5 });
            SoundKit.play('crowdCheer', { volume: 0.5 });
            ctx.feel?.impact?.(0.35);
            EffectsKit.burst(ctx.scene, near.char.root.position.add(new Vector3(0, 0.2, 0)), 'dust');
            near.char.animator.play(SPORT_CLIP.karateHitReact, { onEnd: () => near.char.animator.play(SPORT_CLIP.idle, { loop: true }) });
            ctx.setHud({ banner: 'ANKLES!' });
            setTimeout(() => ctx.setHud({ banner: '' }), 800);
          }
        }
      }

      // teammates: move via their brain; if they're carrying, chase the hoop a little
      for (let i = 0; i < mates.length; i++) {
        const body = mates[i];
        const intent = body.slot.intent;
        const vel = new Vector3(intent.moveX, 0, -intent.moveY).scale(4.2);
        body.char.root.position.addInPlace(vel.scale(dt));
        clampToHalfCourt(body.char.root.position, 8, 15);
        if (vel.lengthSquared() > 0.1) body.char.root.rotation.y = Math.atan2(vel.x, vel.z);
        body.char.animator.play(vel.lengthSquared() > 0.3 ? SPORT_CLIP.moveLoop : SPORT_CLIP.idle, { loop: true });
        if (carrierId === (i === 0 ? 'mate0' : 'mate1') && Vector3.Distance(body.char.root.position, RIM) < 3.5 && Math.random() < 0.01) {
          void teammateShoots(ctx, body, i);
        }
      }

      // defenders (staggered defenders don't move)
      for (const f of foes) {
        if (f.stunSec > 0) continue;
        const intent = f.slot.intent;
        const vel = new Vector3(intent.moveX, 0, -intent.moveY).scale(3.8);
        f.char.root.position.addInPlace(vel.scale(dt));
        clampToHalfCourt(f.char.root.position, 8, 15);
        if (vel.lengthSquared() > 0.1) f.char.root.rotation.y = Math.atan2(vel.x, vel.z);
        f.char.animator.play(vel.lengthSquared() > 0.3 ? SPORT_CLIP.moveLoop : SPORT_CLIP.idle, { loop: true });
      }

      // BODY COLLISION — every pair, every frame (15 pairs; cheap XZ math)
      const bodies = everyBody();
      for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
          resolveBodyCollision(bodies[i].char.root.position, bodies[j].char.root.position);
        }
      }

      // pass — target-lock assist (stick aim snaps to the best teammate in
      // the cone, else most-open), defender-in-lane forces the bounce pass,
      // and the ball FLIES (PassFlight) instead of teleporting possession.
      if (iAmCarrier && !shooting && !dunking && meIntent.pass && !passFlight.active) {
        const targets = mates.map((m, i) => ({ id: i === 0 ? 'mate0' : 'mate1', pos: m.char.root.position }));
        const locked = lockTarget(me.char.root.position, meIntent.moveX, meIntent.moveY, targets, foePositions());
        if (locked) {
          const type = choosePassType(me.char.root.position, locked.pos, foePositions());
          passType = type;
          passTargetId = locked.id as 'mate0' | 'mate1';
          releaseBall(ball);
          passFlight.start(
            ball.getAbsolutePosition(),
            locked.pos.add(new Vector3(0, 1.2, 0)),
            type,
          );
          lastPasserWasMe = true;
          SoundKit.play('uiTick', { pitch: type === 'bounce' ? 1.0 : 1.3 });
          EffectsKit.burst(ctx.scene, me.char.root.position.add(new Vector3(0, 1.2, 0)), 'sparks');
        }
      }
      if (passFlight.active) {
        if (passFlight.step(dt, ball.position)) {
          giveBallTo(passTargetId);
          if (passType === 'bounce') {
            ctx.setHud({ banner: 'BOUNCE PASS!' });
            setTimeout(() => ctx.setHud({ banner: '' }), 600);
          }
        }
      }

      // shoot (only while I'm the carrier) — a hot drive DUNKS instead
      if (iAmCarrier && !shooting && !dunking && meIntent.actionHeld > 0.02) {
        const nearestFoePos = foes.reduce<Vector3 | null>((best, f) =>
          !best || Vector3.Distance(f.char.root.position, me.char.root.position) < Vector3.Distance(best, me.char.root.position)
            ? f.char.root.position : best, null);
        const kind = checkDriveDunk(me.char.root.position, me.drib.vel, RIM, turbo.t01, nearestFoePos);
        if (kind !== 'none') {
          startDunk(ctx, kind, nearestFoePos);
        } else {
          shooting = true;
          const contest = contestLevel(me.char.root.position, nearestFoePos);
          currentShot = classifyShot(me.char.root.position, me.drib.vel, RIM, contest);
          shotMeter.start(contest, currentShot.style);
          me.char.animator.play(SPORT_CLIP.dunkChargeGather, { loop: true });
          ctx.setHud({ shotType: currentShot.label });
        }
      }
      if (iAmCarrier && shooting) {
        const t = shotMeter.update(dt);
        ctx.setHud({ shotMeterT: t });
        if (meIntent.action || t >= 1) {
          const quality = shotMeter.release();
          void resolveMyShot(ctx, quality);
        }
      }

      // steal (defenders occasionally poke the carrier)
      const carrier = carrierBody();
      if (carrier && carrierId !== 'foeTeam' && !shooting) {
        for (const f of foes) {
          if (f.stunSec === 0 && f.slot.intent.steal && Vector3.Distance(f.char.root.position, carrier.char.root.position) < 1.2) {
            SoundKit.play('impact', { pitch: 1.2, volume: 0.3 });
            ctx.setHud({ banner: 'STOLEN!' });
            setTimeout(() => ctx.setHud({ banner: '' }), 700);
            void opponentPossession(ctx);
            break;
          }
        }
      }

      ctx.camDirector.update(me.char.root.position, me.drib.vel, RIM);
    },

    dispose() {
      threeVenue?.dispose(); threeVenue = null;  // M74
      me?.char.dispose(); mates.forEach((m) => m.char.dispose()); foes.forEach((f) => f.char.dispose());
      ball?.dispose(); SoundKit.stopAmbient();
    },
  };

  async function teammateShoots(ctx: ModeContext, body: Body, _i: number): Promise<void> {
    if (shooting) return;
    shooting = true;
    const dist = Vector3.Distance(body.char.root.position, RIM);
    const points = dist > PAINT_RADIUS ? 2 : 1;
    const made = Math.random() < 0.55;
    releaseBall(ball);
    body.char.animator.play(SPORT_CLIP.dunkLaunchPower, { onEnd: () => body.char.animator.play(SPORT_CLIP.idle, { loop: true }) });
    if (made) {
      myScore += points;
      if (lastPasserWasMe) { assists++; ctx.setHud({ ast: assists }); }
      SoundKit.play('score'); EffectsKit.burst(ctx.scene, RIM, 'net');
      ctx.setHud({ score: myScore, banner: 'ASSISTED BUCKET' });
    } else {
      SoundKit.play('miss');
      ctx.setHud({ banner: 'MISS' });
    }
    lastPasserWasMe = false;
    setTimeout(() => ctx.setHud({ banner: '' }), 800);
    if (myScore >= TARGET_SCORE) { ended = true; SoundKit.play('whistle'); ctx.end('WIN', myScore, { foeScore, assists }); return; }
    setTimeout(() => { if (!ended) { void opponentPossession(ctx); } }, made ? 200 : 900);
  }

  async function resolveMyShot(ctx: ModeContext, quality: ShotQuality): Promise<void> {
    shooting = false;
    const pctMod = currentShot?.pctMod ?? 1;
    const pct = SHOT_QUALITY_PCT[quality] * pctMod;
    const dist = Vector3.Distance(me.char.root.position, RIM);
    arcPoints = dist > PAINT_RADIUS ? 2 : 1;
    arcLabel = currentShot?.label ?? 'SHOT';
    arcQuality = quality;
    arcMade = Math.random() < Math.min(0.98, pct);
    releaseBall(ball);
    const releaseClip = currentShot?.style === 'layup' ? SPORT_CLIP.dunkLaunchPower : 'jumpshot';
    me.char.animator.play(releaseClip, { onEnd: () => me.char.animator.play(SPORT_CLIP.idle, { loop: true }) });
    ctx.setHud({ shotType: '' });
    // the ball flies — score/possession resolve when it lands (update loop)
    arc.start(ball.getAbsolutePosition(), RIM, arcMade, currentShot?.style ?? 'jumper');
  }

  function startDunk(ctx: ModeContext, kind: 'dunk' | 'poster', defenderPos: Vector3 | null): void {
    dunking = true;
    turbo.t01 = Math.max(0, turbo.t01 - 0.3);
    const made = Math.random() < DUNK_PCT[kind];
    SoundKit.play('whoosh', { pitch: 0.85 });
    me.char.animator.play(SPORT_CLIP.dunkLaunchPower, { onEnd: () => me.char.animator.play(SPORT_CLIP.idle, { loop: true }) });
    const from = me.char.root.position.clone();
    const t0 = performance.now();
    const obs = ctx.scene.onBeforeRenderObservable.add(() => {
      const k = Math.min(1, (performance.now() - t0) / 550);
      me.char.root.position.x = from.x + (RIM.x - from.x) * k;
      me.char.root.position.z = from.z + (RIM.z + 0.5 - from.z) * k;
      me.char.root.position.y = Math.sin(k * Math.PI) * 1.15;
      if (k < 1) return;
      ctx.scene.onBeforeRenderObservable.remove(obs);
      dunking = false;
      releaseBall(ball);
      if (made) {
        myScore += 1;
        const posterized = kind === 'poster' && defenderPos !== null;
        SoundKit.play('score', { pitch: 0.9 });
        SoundKit.play('crowdCheer', { volume: posterized ? 0.8 : 0.5 });
        ctx.feel?.impact?.(posterized ? 0.7 : 0.45);
        EffectsKit.burst(ctx.scene, RIM, 'net');
        if (posterized) {
          const victim = foes.reduce<Body | null>((best, f) =>
            !best || Vector3.Distance(f.char.root.position, me.char.root.position)
              < Vector3.Distance(best.char.root.position, me.char.root.position) ? f : best, null);
          if (victim) {
            victim.stunSec = 1.4;
            victim.char.animator.play(SPORT_CLIP.karateKnockdown, { onEnd: () => victim.char.animator.play(SPORT_CLIP.idle, { loop: true }) });
            EffectsKit.burst(ctx.scene, victim.char.root.position.add(new Vector3(0, 0.3, 0)), 'dust');
          }
        }
        ctx.setHud({ score: myScore, banner: posterized ? 'POSTERIZED!' : 'THROWN DOWN!' });
        setTimeout(() => ctx.setHud({ banner: '' }), 1000);
        if (myScore >= TARGET_SCORE) { ended = true; SoundKit.play('whistle'); ctx.end('WIN', myScore, { foeScore, assists }); return; }
        setTimeout(() => { if (!ended) void opponentPossession(ctx); }, 400);
      } else {
        SoundKit.play('miss');
        SoundKit.play('crowdGroan', { volume: 0.4 });
        ballSim.launch(ball.getAbsolutePosition(), new Vector3((Math.random() - 0.5) * 3, 3, 2));
        ctx.setHud({ banner: kind === 'poster' ? 'STUFFED AT THE RIM!' : 'RATTLED OUT' });
        setTimeout(() => ctx.setHud({ banner: '' }), 800);
        setTimeout(() => { if (!ended) void opponentPossession(ctx); }, 900);
      }
    });
  }

  async function opponentPossession(ctx: ModeContext): Promise<void> {
    if (ended) return;
    carrierId = 'foeTeam';
    myJumpAge = Infinity; foeShotBlocked = false;
    ctx.setHud({ hint: 'DEFEND — stay tight · time a jump (A) at the release to BLOCK' });
    // the drive beat is watchable AND contestable: your positioning sets
    // the make%, and a timed block jump at the release erases it outright
    const shooter = foes[Math.floor(Math.random() * foes.length)];
    const t0 = performance.now();
    const from = shooter.char.root.position.clone();
    shooter.char.animator.play(SPORT_CLIP.moveLoop, { loop: true });
    await new Promise<void>((res) => {
      const obs = ctx.scene.onBeforeRenderObservable.add(() => {
        const k = Math.min(1, (performance.now() - t0) / 1100);
        shooter.char.root.position.x = from.x + (RIM.x - from.x) * k * 0.6;
        shooter.char.root.position.z = from.z + (RIM.z + 2.2 - from.z) * k;
        if (k >= 1) { ctx.scene.onBeforeRenderObservable.remove(obs); res(); }
      });
    });
    // THE BLOCK — a timed jump in range at this exact release moment
    if (checkBlock(me.char.root.position, shooter.char.root.position, myJumpAge)) {
      foeShotBlocked = true;
      SoundKit.play('impact', { pitch: 0.7, volume: 0.6 });
      SoundKit.play('crowdCheer', { volume: 0.6 });
      ctx.feel?.impact?.(0.5);
      EffectsKit.burst(ctx.scene, shooter.char.root.position.add(new Vector3(0, 1.6, 0)), 'sparks');
      shooter.char.animator.play(SPORT_CLIP.karateHitReact, { onEnd: () => shooter.char.animator.play(SPORT_CLIP.idle, { loop: true }) });
      ctx.setHud({ banner: 'REJECTED!' });
      setTimeout(() => ctx.setHud({ banner: '', hint: 'Work the court · PASS to the open man · HOLD SHOOT, release in the green' }), 900);
      setTimeout(() => { if (!ended) resetPossession(true); }, 1000);
      return;
    }
    const nearestD = Math.min(...allyPositions().map((p) => Vector3.Distance(p, shooter.char.root.position)));
    const defenseFactor = Math.max(0, Math.min(1, 1 - nearestD / 3));
    const made = Math.random() < 0.5 - defenseFactor * 0.3;
    shooter.char.animator.play(SPORT_CLIP.dunkLaunchPower, { onEnd: () => shooter.char.animator.play(SPORT_CLIP.idle, { loop: true }) });
    if (made) {
      foeScore += 2;
      SoundKit.play('crowdGroan', { volume: 0.4 });
      ctx.setHud({ foeScore, banner: 'THEY SCORE' });
    } else {
      SoundKit.play('impact', { pitch: 0.9, volume: 0.3 });
      ctx.setHud({ banner: 'STOP!' });
      ctx.feel?.impact?.(0.2);
    }
    setTimeout(() => ctx.setHud({ banner: '', hint: 'Work the court · PASS to the open man · HOLD SHOOT, release in the green' }), 800);
    if (foeScore >= TARGET_SCORE) { ended = true; SoundKit.play('whistle'); ctx.end('LOSS', myScore, { foeScore, assists }); return; }
    setTimeout(() => { if (!ended) resetPossession(true); }, 900);
  }
})();

// HUD fields: foeScore, target, ast, shotMeterT, time, shotType, and NEW
// turbo (0-100 — small fuel bar, same treatment as 1v1's).
