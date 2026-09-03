// DunkMode v5 — REPLACES the M52 file. The comprehensive contest upgrade.
// Everything from v3/v4 is kept unchanged (props, 3-judge scorecard, hype,
// rim-cam cut, chain meter, watchdogs, replay) and four contest-craft
// systems land on top:
//   STYLE TAPS — mid-air, before the SLAM window opens, tap STYLE (B) up
//     to twice: each tap pumps DIFFICULTY (+1.2) but SHRINKS the SLAM
//     window 25% — showboating is real risk for real reward.
//   VARIETY MEMORY — the judges remember. Repeating a style+prop combo
//     you've already thrown scores 20% lower difficulty ("seen it");
//     every FRESH combo gets a +0.5 difficulty nod. Four dunks now demand
//     four ideas, exactly like a real contest.
//   THE NEED — on your final-round dunks the HUD shows the score you NEED
//     to pass the rival's projected pace — the walk-off pressure number
//     every televised final round runs on.
//   RIM HANG — after a flush, HOLD SLAM (A) to hang on the rim: held long
//     enough it pays +1 style ("HANG TIME!") before the judges reveal.
// All additions are animation-independent on purpose (E25/M51-safe).

import { MeshBuilder, Vector3 } from '@babylonjs/core';
import type { AbstractMesh } from '@babylonjs/core';
import { type SpawnedCharacter } from '../core/CharacterLibrary';
import { CharacterPipeline } from '../core/characterPipeline';
import type { ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import { BallSim } from '../core/BallPhysics';
import { neverBindPose } from '../anim/importSanitizer';
import { installSafePlay, SPORT_CLIP } from '../anim/clipRegistry';
import { MOCAP_DUNK, DUNK_FINISH_VARIETY } from '../nexus/dressingFlags';
import { attachBallToHand, releaseBall, runEastbayPath, flushThroughRim, clankOffRim } from '../anim/ballRig';
import { EASTBAY_TIMING } from '../anim/authored/timing';
import { DunkReplayRecorder } from '../scene/DunkReplayCam';
import { SoundKit } from '../audio/SoundKit';
import { VenueKit } from '../visual/VenueKit';
import { mountVenue, type VenueHandle } from '../core/NexusVenue';  // M74
import { EffectsKit } from '../visual/EffectsKit';
import { applyOceanCourt } from '../visual/CourtSurface';
import { DUNK_CONFIG as CFG } from './modeConfigs';
import { DunkFlight } from '../core/DunkSystem';
import { approachAngle, approachBonus, takeoffFor } from '../core/DunkApproach';
import {
  judgeDunk, ScoreReveal, CrowdEnergy, REVEAL_DURATION_SEC, BAND_TOTAL, JUDGE_COUNT,
  PERFECT_TOTAL, perJudgeAvg, type JudgeScore,
} from '../core/JudgePanel';
import { MomentumBus } from '../core/MomentumBus';

type Phase = 'approach' | 'charge' | 'cinematic' | 'resolve' | 'judging' | 'rivalTurn' | 'contestOver';
const STYLES = ['power', 'flashy', 'sig'] as const;
type Style = (typeof STYLES)[number];
const PROPS = ['none', 'alleyoop', 'obstacle'] as const;
type Prop = (typeof PROPS)[number];

const STYLE_CLIP: Record<Style, string> = {
  // POWER launch plays the user's real motion capture when MOCAP_DUNK is on
  // (feature-retargeted 'dunk_mocap'); flips back to the authored launch clip
  // instantly via NEXT_PUBLIC_MOCAP_DUNK=false. Flashy/sig are untouched.
  power: MOCAP_DUNK ? 'dunk_mocap' : SPORT_CLIP.dunkLaunchPower,
  flashy: SPORT_CLIP.dunkLaunchFlashy, sig: SPORT_CLIP.dunkLaunchSig,
};
const STYLE_LABEL: Record<Style, string> = { power: 'POWER', flashy: 'FLASHY', sig: 'SIGNATURE' };
const PROP_LABEL: Record<Prop, string> = { none: 'NO PROP', alleyoop: 'ALLEY-OOP', obstacle: 'OBSTACLE' };
const STYLE_TIER: Record<Style, number> = { power: 3, flashy: 5.5, sig: 8 };
const PROP_BONUS: Record<Prop, number> = { none: 0, alleyoop: 2, obstacle: 2 };

const DUNKS_PER_ROUND = 2;
const TOTAL_ROUNDS = 2;
// Every threshold below is derived from the panel, never a bare number. The D1
// bug was exactly this: the judge total was written as a literal tuned to a
// 3-judge ceiling, so moving to five judges would have silently made an
// eruption routine. Derived, they follow the panel wherever it goes.
const CHAIN_THRESHOLD = BAND_TOTAL.approval;   // 40/50 — an "approval" dunk keeps a chain alive
const MONSTER_AVG = 9.6;                       // per-judge avg for the heaviest momentum weight
const FLAT_AVG = 6.35;                         // per-judge avg that reads as a dud to the panel
// Rival pace per dunk, measured from the simulated rival's score distribution
// (~8.5 a card). The player's NEED is quoted against it in the final round.
const RIVAL_PACE = Math.round(7.6 * JUDGE_COUNT);
/** How often the rival blows a dunk. Real contests are full of missed attempts. */
const RIVAL_BLOWN_CHANCE = 0.18;

// Judges + staged reveal + crowd energy now live in the SHARED JudgePanel
// (lib/babylon/core/JudgePanel.ts) — DunkDuelMode drinks from the same well.

const BUDGET_SEC: Record<Phase, number> = {
  approach: 30, charge: 5, cinematic: 4, resolve: 3, judging: 6, rivalTurn: 8, contestOver: 999,
};

export const DunkMode: ModeDefinition = (() => {
  let player: SpawnedCharacter, rival: SpawnedCharacter, teammate: SpawnedCharacter | null = null;
  let dunkVenue: VenueHandle | null = null;  // M74
  let obstacle: AbstractMesh | null = null;
  let ball: AbstractMesh, ballSim: BallSim, replay: DunkReplayRecorder;
  let phase: Phase = 'approach';
  let phaseSec = 0;
  let style: Style = 'power';
  let prop: Prop = 'none';
  let charge = 0, clipTime = 0, qteHit = false, qteWindowOpen = false, qteAccuracy = 0;
  let sinceRelease = 0, releasePos = new Vector3();
  let styleTaps = 0;                          // mid-air showboat taps (max 2)
  let aHeld = false, hangSec = 0;             // rim-hang tracking
  let runUpPeak = 0;                          // fastest approach speed (m/s) this attempt
  let launchSpeed01 = 0;                      // run-up speed as a 0..1 budget input
  let obstacleClipped = false;                // caught the prop mid-flight — the dunk is dead
  let toppling = false;                       // the prop goes over with you
  const usedCombos = new Set<string>();       // variety memory: "style_prop" combos thrown
  let round = 1, dunkInRound = 0;
  let playerTotal = 0, rivalTotal = 0, hype = 0, chain = 0;
  let lastScores: JudgeScore[] = [];
  let finishing = false;
  let rimCamCut = false;                     // broadcast cut latch (per attempt)
  const rim = new Vector3(0, CFG.rimHeight, CFG.rimZ);
  const ebState = { inLeftHand: false };
  let stickX = 0, stickY = 0;
  const flight = new DunkFlight();               // Phase 6: trick-input flight
  const reveal = new ScoreReveal();              // Phase 7: staged judge reveal
  const crowd = new CrowdEnergy();               // Phase 7: building voice
  let revealed: JudgeScore[] = [];               // cards shown so far
  const momentum = new MomentumBus();            // Phase 6: shared Game-Breaker
  let trickLabels: string[] = [];                // this attempt's thrown tricks

  function setPhase(p: Phase): void { phase = p; phaseSec = 0; }
  const obstacleClearHeight = 1.35;

  function clearProps(): void {
    obstacle?.dispose(); obstacle = null;
    teammate?.dispose(); teammate = null;
  }

  async function setupProp(ctx: ModeContext): Promise<void> {
    clearProps();
    if (prop === 'obstacle') {
      obstacle = MeshBuilder.CreateBox('dunk_obstacle', { width: 1.1, height: obstacleClearHeight, depth: 0.5 }, ctx.scene);
      obstacle.position.set(0, obstacleClearHeight / 2, CFG.rimZ + 1.4);
    }
    if (prop === 'alleyoop') {
      teammate = await CharacterPipeline.spawnNpc(ctx.scene, CFG.heroUrl, {
        position: new Vector3(-3.4, 0, CFG.rimZ + 1.6), tint: '#22d3ee', startClip: SPORT_CLIP.teammateIdle,
      });
      neverBindPose(teammate.animator, SPORT_CLIP.teammateIdle);
      installSafePlay(teammate.animator, 'dunk-teammate');
    }
  }

  const def: ModeDefinition = {
    modeId: 'dunk', mood: 'goldenHour', camPreset: 'contest',  // Phase 8: cinematic, not broadcast

    async load(ctx: ModeContext) {
      // M74: try Nexus venue first; fallback to VenueKit if no spec
      dunkVenue = mountVenue(ctx, 'basketball_dunk', { keepGameplayCamera: true });
      if (!dunkVenue) { VenueKit.buildCourt(ctx.scene); applyOceanCourt(ctx.scene, 'venice'); }
      // spawnPlayer, not CharacterLibrary.spawn — this is the route that applies
      // the player's own identity: closet wardrobe colours, skin tone, and body
      // proportions from a body scan. Football, BoardRun and TimingSport all used
      // it; the dunk contest did not, so nothing a player picked in the Closet
      // ever showed up in the mode that IS the guest onboarding path. The kit
      // colours below stay as the designed fallback for anyone with no identity
      // saved (every guest on /try), and identity overrides them when there is
      // one. Now that the body is skinned, the scan's buildScale/reachScale
      // actually reshape the mesh instead of scaling rigid parts.
      player = await CharacterPipeline.spawnPlayer(ctx.scene, CFG.heroUrl, {
        position: new Vector3(0, 0, CFG.startZ), yawRad: Math.PI, startClip: SPORT_CLIP.idle,
        // The hero wears the player's SAVED look (appearanceBridge via the
        // shared spawn layer) — the hardcoded M110 kit is gone: 'use my skin'
        // means the Closet's skin plays.
      });
      neverBindPose(player.animator, SPORT_CLIP.idle);
      installSafePlay(player.animator, 'dunk-player');
      ctx.groundLock?.track(player.root, player.skeleton);
      // spawnNpc is explicit: the rival must NEVER wear the player's identity,
      // or you end up dunking against yourself.
      rival = await CharacterPipeline.spawnNpc(ctx.scene, CFG.heroUrl, {
        position: new Vector3(3.2, 0, CFG.rimZ + 3), startClip: SPORT_CLIP.idle,
        // M110 skins — the rival: hot-pink kit with cyan accent, lighter skin,
        // sandy hair, black sneakers, so the two never read as the same person.
        tint: '#ff2d78', accent: '#00E5FF', skinTone: '#E0AC69', hairColor: '#6B4423', shoeColor: '#141414',
      });
      neverBindPose(rival.animator, SPORT_CLIP.idle);
      installSafePlay(rival.animator, 'dunk-rival');
      ctx.groundLock?.track(rival.root, rival.skeleton);
      dunkVenue?.hidePlaceholders();  // M74: drop stand-ins now that real chars are in

      ball = MeshBuilder.CreateSphere('ball', { diameter: 0.24 }, ctx.scene);
      ballSim = new BallSim(ball, 0.12);
      attachBallToHand(ball, player.skeleton, 'RightHand');
      replay = new DunkReplayRecorder(ctx.scene, player.root, ball, ctx.camera as never);

      ctx.camDirector.snapTo(player.root.position, rim);
      ctx.heroRef.current = player.root;
      ctx.objectiveRef.current = rim;
      SoundKit.startAmbient('stadium');
      EffectsKit.ambient(ctx.scene, 'venice');
      EffectsKit.ballTrail(ctx.scene, ball);

      round = 1; dunkInRound = 0; playerTotal = 0; rivalTotal = 0; hype = 0; chain = 0; finishing = false;
      style = 'power'; prop = 'none'; rimCamCut = false;
      styleTaps = 0; hangSec = 0; aHeld = false; usedCombos.clear(); momentum.reset(); flight.reset();
      runUpPeak = 0; launchSpeed01 = 0; obstacleClipped = false; toppling = false;
      setPhase('approach');
      ctx.setHud({
        round: `${round}/${TOTAL_ROUNDS}`, dunkNum: `${dunkInRound + 1}/${DUNKS_PER_ROUND}`,
        score: playerTotal, rivalScore: rivalTotal, style: STYLE_LABEL[style], prop: PROP_LABEL[prop], hype: 0, chain: 0,
        hint: 'Pick your PROP (d-pad) · STYLE to cycle · RUN-UP SPEED buys your air · HOLD CHARGE to load your jump',
      });
    },

    onInput(ctx: ModeContext, e: FelInput) {
      SoundKit.unlock();
      if (e.t === 'stick' && e.side === 'L') { stickX = e.x; stickY = e.y; }

      if (e.t === 'button' && e.btn === 'B' && e.pressed && phase === 'approach') {
        style = STYLES[(STYLES.indexOf(style) + 1) % STYLES.length];
        ctx.setHud({ style: STYLE_LABEL[style] });
        SoundKit.play('uiTick');
      }
      // d-pad cycles PROP during approach (up=none, right=alley-oop,
      // down=obstacle); the SAME d-pad, held during the mid-air cinematic
      // phase, arms a TRICK COMBO instead — two different jobs on two
      // different phases, never both at once.
      if (e.t === 'dpad' && e.pressed && phase === 'approach') {
        prop = e.dir === 'up' ? 'none' : e.dir === 'right' ? 'alleyoop' : 'obstacle';
        ctx.setHud({ prop: PROP_LABEL[prop] });
        SoundKit.play('uiTick', { pitch: 1.3 });
        void setupProp(ctx);
      }
      // TRICK COMBOS (THPS2-style) — mid-air, hold a d-pad direction and tap
      // A/B/Y to throw a named trick (windmill, 360, eastbay, tomahawk,
      // between-the-legs). Each plays its own clip, pumps difficulty, and
      // taxes the slam window. Two before the window = COMBO dunk. Any B
      // press that ISN'T a recognized combo (no direction held, or a
      // direction that has no B trick) falls through to the plain STYLE TAP
      // showboat below instead — one press always does exactly one thing.
      // A trick needs AIR under it. The gate used to be "in the cinematic
      // phase and the slam window isn't open", which includes frame zero — so a
      // trick armed the instant the jump released played out while the dunker
      // was still leaving the floor, nowhere near the rim. An eastbay is a
      // thing you do at the basket; thrown at ankle height it reads as a
      // glitch. EASTBAY_TIMING.rise is when the rig is actually off the ground.
      if (phase === 'cinematic' && !qteWindowOpen && clipTime >= EASTBAY_TIMING.rise) {
        const trick = flight.feedInput(e);
        if (!trick && flight.rejectedForAir) {
          // the run-up didn't buy the air that trick needs — SAY so, or it
          // reads as a dropped input
          flight.rejectedForAir = false;
          SoundKit.play('uiTick', { pitch: 0.6, volume: 0.35 });
          ctx.setHud({ banner: 'NOT ENOUGH AIR — come in faster' });
          setTimeout(() => ctx.setHud({ banner: '' }), 900);
        }
        if (trick) {
          trickLabels.push(trick.label);
          player.animator.play(trick.clip, { speedRatio: 1.05 });
          hype = Math.min(100, hype + 6);
          SoundKit.play('whoosh', { pitch: 1.1 + trick.difficulty * 0.08, volume: 0.45 });
          SoundKit.play('crowdCheer', { volume: 0.3 + trick.difficulty * 0.05 });
          EffectsKit.burst(ctx.scene, player.root.position.add(new Vector3(0, 1.8, 0)), 'sparks');
          ctx.setHud({ banner: trickLabels.length > 1 ? `COMBO: ${trickLabels.join(' → ')}!` : `${trick.label}!` });
          ctx.camDirector.pulse(trickLabels.length > 1 ? 0.7 : 0.45, 0.5);
          setTimeout(() => ctx.setHud({ banner: '' }), 700);
        } else if (e.t === 'button' && e.btn === 'B' && e.pressed && styleTaps < 2) {
          // STYLE TAPS — mid-air showboating before the SLAM window opens:
          // +1.2 difficulty each, SLAM window shrinks 25% per tap (max 2)
          styleTaps++;
          SoundKit.play('whoosh', { pitch: 1.6, volume: 0.35 });
          ctx.feel?.impact?.(0.1);
          EffectsKit.burst(ctx.scene, player.root.position.add(new Vector3(0, 1.4, 0)), 'sparks');
          ctx.setHud({ banner: `+STYLE TAP x${styleTaps}` });
          setTimeout(() => ctx.setHud({ banner: '' }), 450);
        }
      }

      if (e.t === 'trigger' && e.side === 'R') {
        if (phase === 'approach' && e.value > 0.02) {
          setPhase('charge');
          player.animator.play(SPORT_CLIP.dunkChargeGather, { loop: true });
        }
        if (phase === 'charge') {
          charge = Math.max(charge, e.value);
          ctx.setHud({ charge: Math.round(charge * 100) });
          if (e.value === 0) launchDunk(ctx);
        }
      }

      if (e.t === 'button' && e.btn === 'A' && e.pressed && qteWindowOpen) {
        qteHit = true;
        const center = EASTBAY_TIMING.extend;
        const window = CFG.qteWindowSec * (1 - styleTaps * 0.25) * flight.slamWindowScale;
        qteAccuracy = Math.max(0, 1 - Math.abs(clipTime - center) / (window / 2));
      }
      // RIM HANG — hold SLAM through the flush to hang on the iron
      if (e.t === 'button' && e.btn === 'A') aHeld = e.pressed;
    },

    update(ctx: ModeContext, dt: number) {
      phaseSec += dt;
      watchdog(ctx);
      hype = Math.max(0, hype - dt * 1.5);       // slow decay between dunks

      const vel = new Vector3(stickX * 4, 0, -Math.max(0, -stickY) * 5 - 2);
      if (phase === 'approach') {
        player.root.position.addInPlace(vel.scale(dt));
        player.root.position.z = Math.max(player.root.position.z, CFG.gatherZ);
        player.root.position.x = Math.max(-6, Math.min(6, player.root.position.x));
        // THE RUN-UP IS PART OF THE DUNK. Peak approach speed feeds the air
        // budget at launch — a walk-up has less air, and less air means fewer
        // tricks fit before the slam window. Live 08's whole ramp, in one number.
        runUpPeak = Math.max(runUpPeak, Math.hypot(vel.x, vel.z));
        const moving = Math.hypot(vel.x, vel.z) > 2.5;
        player.animator.play(moving ? SPORT_CLIP.moveLoop : SPORT_CLIP.idle, { loop: true });
        if (player.root.position.z <= CFG.gatherZ + 0.2) {
          ctx.setHud({
            hint: runUpPeak < 3.5
              ? 'HOLD CHARGE — and come in FASTER: the run-up buys your air'
              : 'HOLD CHARGE — load your jump',
          });
        }
      }

      if (phase === 'cinematic') {
        clipTime += dt;
        if (style === 'sig') runEastbayPath(ball, player.skeleton, clipTime, ebState);
        const k = Math.min(1, clipTime / EASTBAY_TIMING.duration);
        player.root.position.y = Math.sin(k * Math.PI) * (1.05 + charge * 0.55);
        // the flight curves in to the rim on BOTH axes: an angled approach
        // used to fly straight and flush a metre wide of the iron
        player.root.position.z += (rim.z + 0.6 - player.root.position.z) * 1.6 * dt;
        player.root.position.x += (rim.x - player.root.position.x) * 1.6 * dt;

        // THE PROP IS PHYSICAL. Crossing the obstacle with your feet below
        // its top is not a scoring penalty — the dunk DIES at the chair,
        // mid-flight, whatever the slam timing was going to be. The jump
        // peaks at 1.05 + charge*0.55, so the chair (1.35m) demands a real
        // charge; the old check (y + 1.0 at the flush, deep past the prop)
        // could never clip anything — measured: "CLIPPED THE PROP" had never
        // displayed, the prop was wallpaper.
        if (prop === 'obstacle' && obstacle && !obstacleClipped) {
          const overProp = Math.abs(player.root.position.z - obstacle.position.z) < 0.45;
          // feet must genuinely clear the chair: 1.30m demands ~55% charge
          // (crossing happens near apex, y ≈ 0.975 × (1.05 + 0.55·charge))
          if (overProp && player.root.position.y < obstacleClearHeight - 0.05) {
            obstacleClipped = true;
            clipBlown(ctx);
          }
        }

        // BROADCAST RIM-CAM CUT: one hard cut to a baseline angle as the
        // rise crests, exactly like the wide→under-basket cut on TV. One
        // snapTo, latched; the normal follow resumes on resolve.
        if (!rimCamCut && clipTime >= EASTBAY_TIMING.extend * 0.55) {
          rimCamCut = true;
          const baseline = new Vector3(rim.x + 2.6, 0.4, rim.z - 1.2);
          ctx.camDirector.snapTo(baseline, player.root.position.add(new Vector3(0, 1.4, 0)));
        }

        // alley-oop: teammate releases the toss partway through the rise;
        // ball arcs from their hand to the player's, deterministic timing —
        // cannot desync, cannot stall.
        if (prop === 'alleyoop' && teammate) {
          const tossAt = EASTBAY_TIMING.extend * 0.45;
          const catchAt = EASTBAY_TIMING.extend * 0.85;
          if (clipTime >= tossAt && clipTime < catchAt) {
            teammate.animator.play(SPORT_CLIP.teammateToss, {});
            const tt = Math.min(1, (clipTime - tossAt) / (catchAt - tossAt));
            ball.position = Vector3.Lerp(
              teammate.root.position.add(new Vector3(0, 1.6, 0)),
              player.root.position.add(new Vector3(0, 1.9, 0)), tt,
            );
          } else if (clipTime >= catchAt) {
            attachBallToHand(ball, player.skeleton, 'RightHand');
          }
        }

        const wasOpen = qteWindowOpen;
        flight.update(dt);
        const window = CFG.qteWindowSec * (1 - styleTaps * 0.25) * flight.slamWindowScale;
        qteWindowOpen = clipTime >= EASTBAY_TIMING.extend - window / 2
          && clipTime <= EASTBAY_TIMING.extend + window / 2;
        if (qteWindowOpen && !wasOpen) ctx.setHud({ hint: 'SLAM!', slamPulse: true });
        if (!qteWindowOpen && wasOpen) ctx.setHud({ slamPulse: false });
        if (clipTime >= EASTBAY_TIMING.extend + window / 2) resolveDunk(ctx);
      }

      if (phase === 'resolve') {
        sinceRelease += dt;
        // a clipped dunk drops the dunker where the prop caught him, and the
        // prop goes over — the failure has to READ as contact, not a teleport
        if (obstacleClipped) {
          player.root.position.y = Math.max(0, player.root.position.y - 6 * dt);
          if (toppling && obstacle) {
            obstacle.rotation.x = Math.min(1.45, obstacle.rotation.x + dt * 4);
            if (obstacle.rotation.x >= 1.45) toppling = false;
          }
        }
        if (qteHit) {
          if (aHeld) hangSec += dt;               // rim hang builds while SLAM stays held
          if (flushThroughRim(ball, rim, releasePos, sinceRelease)) void finishAttempt(ctx, true);
        } else {
          ballSim.step(dt);
          if (sinceRelease > 1.2) void finishAttempt(ctx, false);
        }
      }

      // the building breathes with the contest every frame
      crowd.update(dt, Math.min(1, hype / 100), chain, momentum.tier === 'on_fire');
      SoundKit.setAmbientLevel(crowd.level);

      if (phase === 'judging') {
        for (const beat of reveal.update(dt)) {
          if (beat.kind === 'confer') {
            ctx.setHud({ hint: 'THE JUDGES CONFER…' });
            SoundKit.play('uiTick', { pitch: 0.7, volume: 0.3 });
          } else if (beat.kind === 'card' && beat.judge) {
            revealed = [...revealed, beat.judge];
            ctx.setHud({ judgeReveal: revealed });
            SoundKit.play('uiTick', { pitch: 1 + beat.judge.score * 0.06, volume: 0.5 });
            ctx.feel?.impact?.(0.12);
          } else if (beat.kind === 'drum') {
            ctx.setHud({ hint: "PRIME'S CARD…" });
            SoundKit.play('uiTick', { pitch: 0.9, volume: 0.4 });
            SoundKit.play('uiTick', { pitch: 0.95, volume: 0.35 });
          } else if (beat.kind === 'total') {
            // THE 50. Raising the ceiling to 50 only means something if the game
            // KNOWS what a 50 is — it is the most recognisable call in the whole
            // event, and a perfect card sweep that scrolled by as an ordinary
            // eruption would waste the entire point of this change.
            const perfect = beat.total === PERFECT_TOTAL;
            ctx.setHud({ hint: '', judgeReveal: revealed, banner: perfect ? 'FIFTY!' : '' });
            ctx.camDirector.pulse(perfect ? 1.4 : beat.band === 'eruption' ? 1 : beat.band === 'hush' ? 0.15 : 0.4, 0.6);
            if (perfect) {
              // A 50 has to SOUND like a 50. An eruption already plays a cheer
              // at full volume, so pitch alone would not separate the rarest
              // call in the event from a merely great dunk. Layer it: the cheer
              // stacks, the building keeps going, and the whistle cuts through.
              SoundKit.play('crowdCheer', { volume: 1 });
              SoundKit.play('crowdCheer', { volume: 0.9, pitch: 1.15 });
              SoundKit.play('score', { pitch: 1.5 });
              SoundKit.play('whistle', { volume: 0.5 });
              setTimeout(() => SoundKit.play('crowdCheer', { volume: 0.85, pitch: 0.95 }), 420);
              crowd.level = 1;
              SoundKit.setAmbientLevel(1);
              ctx.feel?.impact?.(0.8);
              for (const dy of [1.6, 2.2, 2.8]) {
                EffectsKit.burst(ctx.scene, player.root.position.add(new Vector3(0, dy, 0)), 'confetti');
              }
              setTimeout(() => ctx.setHud({ banner: '' }), 2000);
            } else if (beat.band === 'eruption') {
              SoundKit.play('crowdCheer', { volume: 1 });
              SoundKit.play('score', { pitch: 1.3 });
              ctx.feel?.impact?.(0.5);
              EffectsKit.burst(ctx.scene, player.root.position.add(new Vector3(0, 2, 0)), 'confetti');
            } else if (beat.band === 'hush') {
              SoundKit.play('crowdGroan', { volume: 0.6 * crowd.level + 0.2 });
            } else {
              SoundKit.play('crowdCheer', { volume: 0.4 * crowd.level + 0.2 });
            }
          }
        }
      }

      if (phase === 'rivalTurn') {
        ctx.camDirector.update(rival.root.position, Vector3.Zero(), rim);
      } else if (phase === 'cinematic' && rimCamCut) {
        // hold the rim-cam angle through the flush — no per-frame follow
      } else if (phase === 'judging') {
        // THE VERDICT. The camera used to be left entirely undriven here, so it
        // froze on whatever angle the replay cam happened to end on — for the
        // full 5.1s of the reveal, which is the mode's dramatic peak. A NULL
        // objective gives a clean hero framing with nothing else pulling on it:
        // the dunker, waiting on his card, which is the shot the broadcast cuts
        // to. Anything else in frame (the ball is the obvious candidate, and it
        // is wherever it bounced) drags the composition somewhere arbitrary.
        ctx.camDirector.update(player.root.position, Vector3.Zero(), null);
      } else if (phase !== 'contestOver') {
        // ALWAYS frame against the RIM, never the ball.
        //
        // This used the ball as the objective for every phase except the
        // approach — but through the launch and most of the flight the ball is
        // IN THE DUNKER'S OWN HAND, so subject and objective are the same point.
        // fitTwo then degenerates: the separation is ~0, the back-vector falls
        // through to a fixed world +z, and the camera whips in behind the hero
        // instead of holding a shot of the attack. Measured as 1-2
        // [FEL-FRAME] hero-off-screen lines per contest, every run, always
        // mid-flight.
        //
        // This is the same failure the convergence protocol records against 3PT
        // — "objective was the ball in the shooter's own hands" — which is
        // exactly why the protocol names it. The rim is what the player is
        // attacking and what the shot should be composed against.
        ctx.camDirector.update(player.root.position, vel, rim);
      }
    },

    dispose() {
      player?.dispose(); rival?.dispose(); replay?.dispose(); ball?.dispose();
      clearProps(); SoundKit.stopAmbient();
      dunkVenue?.dispose(); dunkVenue = null;  // M74
    },
  };

  function watchdog(ctx: ModeContext): void {
    if (phaseSec <= BUDGET_SEC[phase] || finishing) return;
    console.warn(`[FEL-DUNK] watchdog tripped in phase "${phase}" after ${phaseSec.toFixed(1)}s — auto-resolving`);
    switch (phase) {
      case 'approach':
        player.root.position.set(0, 0, CFG.gatherZ);
        ctx.setHud({ hint: 'HOLD CHARGE — load your jump' });
        phaseSec = 0;
        break;
      case 'charge': launchDunk(ctx); break;
      case 'cinematic': resolveDunk(ctx); break;
      case 'resolve': void finishAttempt(ctx, qteHit); break;
      case 'judging': void advanceAfterJudging(ctx); break;
      case 'rivalTurn': void advanceAfterRivalTurn(ctx); break;
    }
  }

  // --- M111: performance/timing-driven dunk finish selection -----------------
  // Aerial finish is chosen by QTE TIMING (how well the slam was timed); landing
  // is chosen by PERFORMANCE (the 3-judge total). Gated by DUNK_FINISH_VARIETY —
  // set NEXT_PUBLIC_DUNK_FINISH_VARIETY=false to instantly restore prior behavior.
  function pickAerialFinish(hit: boolean, acc: number): string {
    if (!DUNK_FINISH_VARIETY) return hit ? SPORT_CLIP.dunkScoreHang : SPORT_CLIP.jumpLand;
    if (!hit) return SPORT_CLIP.dunkFinishBlown;      // mistimed / whiffed slam
    if (acc >= 0.85) return SPORT_CLIP.dunkFinishWindmill;  // perfect timing
    if (acc >= 0.55) return SPORT_CLIP.dunkFinishTomahawk;  // good timing
    return SPORT_CLIP.dunkScoreHang;                        // clean but late/early
  }
  function finishBanner(hit: boolean, acc: number): string {
    if (!DUNK_FINISH_VARIETY || !hit) return '';
    if (acc >= 0.85) return 'WINDMILL!';
    if (acc >= 0.55) return 'TOMAHAWK!';
    return '';
  }
  function pickLanding(total: number): string {
    if (!DUNK_FINISH_VARIETY) return SPORT_CLIP.dunkLandCrouch;
    return total >= BAND_TOTAL.eruption ? SPORT_CLIP.dunkCelebrateBig : SPORT_CLIP.dunkLandCrouch;
  }

  function launchDunk(ctx: ModeContext): void {
    if (phase === 'cinematic') return;
    setPhase('cinematic');
    clipTime = 0; qteHit = false; qteWindowOpen = false; qteAccuracy = 0; ebState.inLeftHand = false;
    rimCamCut = false; styleTaps = 0; hangSec = 0; trickLabels = []; obstacleClipped = false;
    // The run-up, not the stick at the release instant: during the charge the
    // stick is usually neutral, so the old `hypot(stickX, stickY)` read ~0 and
    // EVERY dunk launched as a walk-up. Peak measured approach speed is the
    // approach. (Max run is ~7 m/s; the mode auto-drifts at 2.)
    launchSpeed01 = Math.min(1, runUpPeak / 7);
    // FREE APPROACH (owner decision 2026-09-03): where you came from and how
    // you left the floor are judged, as in the real contest. The angle is read
    // from where you actually are; one-foot needs a real run.
    const approach = approachBonus(approachAngle(player.root.position.x, player.root.position.z, rim.x, rim.z), takeoffFor(runUpPeak));
    flight.launch(Math.min(1, charge * 0.5 + launchSpeed01 * 0.5), STYLE_TIER[style], approach.difficulty);
    if (launchSpeed01 < 0.3 && charge > 0.4) {
      ctx.setHud({ banner: 'WALK-UP — short air' });
      setTimeout(() => ctx.setHud({ banner: '' }), 900);
    } else if (approach.difficulty > 0) {
      ctx.setHud({ banner: `${approach.label}${approach.angleDeg >= 10 ? ` · ${approach.angleDeg}°` : ''}` });
      setTimeout(() => ctx.setHud({ banner: '' }), 900);
    }
    if (prop !== 'alleyoop') attachBallToHand(ball, player.skeleton, 'RightHand');
    else releaseBall(ball);   // ball waits at the teammate's hand until the toss beat
    SoundKit.play('whoosh', { pitch: 0.85 });
    player.animator.play(STYLE_CLIP[style], { speedRatio: 1, onEnd: () => {} });
  }

  /** The dunk dies at the prop: clip it mid-flight and the attempt is blown
   *  on contact — clank, stumble, the chair goes over, judges score what they
   *  saw (the miss path), crowd drops. This is the contest's signature risk. */
  function clipBlown(ctx: ModeContext): void {
    toppling = true;
    SoundKit.play('impact', { pitch: 0.6, volume: 0.6 });
    SoundKit.play('crowdGroan', { volume: 0.7 });
    ctx.feel?.impact?.(0.6);
    ctx.setHud({ banner: 'CAUGHT THE PROP — BLOWN' });
    setTimeout(() => ctx.setHud({ banner: '' }), 1200);
    resolveDunk(ctx);   // qteHit is false → the clank path; judging follows
  }

  function resolveDunk(ctx: ModeContext): void {
    if (phase === 'resolve') return;
    setPhase('resolve');
    sinceRelease = 0;
    qteWindowOpen = false;
    rimCamCut = false;
    ctx.camDirector.snapTo(player.root.position, rim);   // back to the follow after the cut
    ctx.setHud({ slamPulse: false });
    releasePos.copyFrom(ball.getAbsolutePosition());
    releaseBall(ball);
    if (!qteHit) ballSim.launch(releasePos, clankOffRim(ball, rim));
    const aerial = pickAerialFinish(qteHit, qteAccuracy);
    const banner = finishBanner(qteHit, qteAccuracy);
    if (banner) ctx.setHud({ banner });
    player.animator.play(aerial, {
      onEnd: () => player.animator.play(SPORT_CLIP.idle, { loop: true }),
    });
  }

  async function finishAttempt(ctx: ModeContext, made: boolean): Promise<void> {
    if (finishing) return;
    finishing = true;

    if (!made) {
      SoundKit.play('miss');
      SoundKit.play('crowdGroan', { volume: 0.5 });
      crowd.level = 0.15;                                 // the building hushes
      SoundKit.setAmbientLevel(crowd.level);
      hype = Math.max(0, hype - 15);
      chain = 0;                                          // a miss breaks the chain
      lastScores = [];
      // A BLOWN DUNK IS STILL JUDGED. This awarded a flat ZERO, which is not
      // how the event works and is not survivable: the rival paces ~40 a dunk,
      // so one miss put the player unrecoverably behind — measured at "FINAL
      // ROUND — you need big numbers (down 48)" after a single round.
      //
      // In the real contest the judges score what they saw. The panel's floor is
      // five sixes, so a blown attempt lands around 30 while a good one lands in
      // the low 40s and a great one at 50. That IS the benchmark's scale — the
      // 6-10 card is what compresses it — and it keeps a miss expensive without
      // ending the contest.
      const missScores = judgeDunk(
        Math.max(0, (STYLE_TIER[style] + PROP_BONUS[prop]) * 0.30),   // they saw the attempt
        0,                                                            // and they saw it fail
        Math.max(0, STYLE_TIER[style] * 0.22 + styleTaps * 0.4),
      );
      const missTotal = missScores.reduce((a, j) => a + j.score, 0);
      playerTotal += missTotal;
      lastScores = missScores;
      crowd.onScore(missTotal);
      revealed = [];
      reveal.start(missScores);
      ctx.setHud({
        banner: 'MISSED — the judges saw it', judgeReveal: [],
        score: playerTotal, chain, hype: Math.round(hype),
      });
      player.animator.play(SPORT_CLIP.dunkLandCrouch, { onEnd: () => player.animator.play(SPORT_CLIP.idle, { loop: true }) });
      setPhase('judging');
      setTimeout(() => { ctx.setHud({ banner: '' }); void advanceAfterJudging(ctx); }, REVEAL_DURATION_SEC * 1000 + 400);
      finishing = false;
      return;
    }

    // VARIETY MEMORY — the judges remember what they've seen this contest
    const combo = `${style}_${prop}_${trickLabels.join('+') || 'plain'}`;
    const isRepeat = usedCombos.has(combo);
    usedCombos.add(combo);
    const varietyMod = isRepeat ? 0.8 : 1;
    const varietyBonus = isRepeat ? 0 : 0.5;
    if (isRepeat) {
      ctx.setHud({ banner: 'THE JUDGES HAVE SEEN THAT ONE…' });
      setTimeout(() => ctx.setHud({ banner: '' }), 900);
    }

    // RIM HANG — held through the flush pays style before the reveal
    const hangBonus = hangSec >= 0.5 ? 1 : 0;
    if (hangBonus > 0) {
      SoundKit.play('crowdCheer', { volume: 0.4 });
      ctx.setHud({ banner: 'HANG TIME!' });
      setTimeout(() => ctx.setHud({ banner: '' }), 700);
    }

    // Phase 6: trick gestures carry the difficulty (style tier is the base
    // inside flight.attempt.difficulty; combo chains get their 1.35x there).
    // The run-up is judged too: a full-speed runway attack reads harder than
    // a walk-up, exactly as the real panel reads it.
    const trickDifficulty = flight.attempt.difficulty - STYLE_TIER[style];
    const difficulty = Math.max(0, Math.min(10,
      (STYLE_TIER[style] + trickDifficulty + PROP_BONUS[prop] + charge * 2 + launchSpeed01 * 1.0
        + styleTaps * 1.2 + varietyBonus) * varietyMod));
    const execution = Math.max(0, Math.min(10, qteAccuracy * 10));
    const styleScore = Math.max(0, Math.min(10, STYLE_TIER[style] * 0.6 + Math.min(2, hype / 50) + styleTaps * 0.8 + hangBonus));

    const scores = judgeDunk(difficulty, execution, styleScore);
    lastScores = scores;
    const dunkTotal = scores.reduce((s, j) => s + j.score, 0);   // MIN_TOTAL..PERFECT_TOTAL (30..50)

    // CHAIN: consecutive approval-band dunks build the multiplier; each link
    // pumps extra hype (which feeds the NEXT dunk's style score — real teeth)
    // Game-Breaker: an eruption-band dunk is a highlight that shifts the building
    if (dunkTotal >= BAND_TOTAL.eruption) {
      momentum.report({ kind: 'highlight_dunk', weight: perJudgeAvg(dunkTotal) >= MONSTER_AVG ? 30 : 18 });
    } else if (perJudgeAvg(dunkTotal) <= FLAT_AVG) {
      momentum.report({ kind: 'contest_low' });
    }
    momentum.update(0); // settle tier for this beat
    const tier = momentum.tier;
    if (tier === 'on_fire' || tier === 'hot') {
      hype = Math.min(100, hype + (tier === 'on_fire' ? 14 : 7));
      ctx.setHud({ banner: tier === 'on_fire' ? 'THE BUILDING IS ON FIRE' : 'HEATING UP…' });
    }

    if (dunkTotal >= CHAIN_THRESHOLD) {
      chain++;
      if (chain >= 2) {
        hype = Math.min(100, hype + chain * 5);
        ctx.setHud({ banner: `CHAIN x${chain}!` });
        SoundKit.play('uiTick', { pitch: 1 + chain * 0.15 });
      }
    } else {
      chain = 0;
    }

    playerTotal += dunkTotal;
    // Hype is fed by the QUALITY of the dunk, not the raw total — the total's
    // range moved with the ceiling and `dunkTotal * 2` would now fill the meter
    // almost instantly, quietly wrecking the momentum curve. Per-judge average
    // is scale-free: this yields the same 36..60 it always did.
    hype = Math.min(100, hype + perJudgeAvg(dunkTotal) * 6);

    ctx.feel?.impact?.(0.2 + execution / 15);
    SoundKit.play('score', { pitch: 1 + Math.min(1, hype / 100) });
    EffectsKit.burst(ctx.scene, rim, 'net');
    if (dunkTotal >= BAND_TOTAL.eruption) { SoundKit.play('crowdCheer'); EffectsKit.burst(ctx.scene, player.root.position.add(new Vector3(0, 1.8, 0)), 'confetti'); }
    const landing = pickLanding(dunkTotal);

    player.animator.play(landing, { onEnd: () => player.animator.play(SPORT_CLIP.idle, { loop: true }) });

    ctx.camDirector.suspended = true;
    await Promise.race([replay.play(rim), new Promise((r) => setTimeout(r, 3500))]);
    ctx.camDirector.suspended = false;

    // Phase 7: STAGED REVEAL — confer, Silk, Doc, the long Prime beat,
    // then the total + eruption/hush. Not a number flash.
    crowd.onScore(dunkTotal);
    revealed = [];
    reveal.start(scores);
    ctx.setHud({ score: playerTotal, hype: Math.round(hype), chain, judgeReveal: [] });
    setPhase('judging');
    setTimeout(() => void advanceAfterJudging(ctx), REVEAL_DURATION_SEC * 1000 + 400);
    finishing = false;
  }

  async function advanceAfterJudging(ctx: ModeContext): Promise<void> {
    if (phase !== 'judging') return;   // already advanced (watchdog vs normal path race)
    ctx.setHud({ judgeReveal: null, banner: '' });
    dunkInRound++;
    if (dunkInRound < DUNKS_PER_ROUND) {
      resetForNextAttempt(ctx);
      return;
    }
    dunkInRound = 0;
    await rivalRound(ctx);
  }

  function resetForNextAttempt(ctx: ModeContext): void {
    player.root.position.set(0, 0, CFG.startZ);
    player.root.rotation.y = Math.PI;
    player.animator.play(SPORT_CLIP.idle, { loop: true });
    charge = 0; qteHit = false; qteWindowOpen = false; qteAccuracy = 0; rimCamCut = false;
    styleTaps = 0; hangSec = 0; revealed = [];
    runUpPeak = 0; obstacleClipped = false; toppling = false;
    void setupProp(ctx);
    ctx.camDirector.snapTo(player.root.position, rim);
    setPhase('approach');
    // THE NEED — final-round pressure number: what this dunk must average
    // to stay ahead of the rival's pace (they dunk after you)
    const isFinalRound = round === TOTAL_ROUNDS;
    const deficit = rivalTotal - playerTotal;
    const need = isFinalRound ? Math.max(0, deficit + RIVAL_PACE) : 0;
    ctx.setHud({
      dunkNum: `${dunkInRound + 1}/${DUNKS_PER_ROUND}`,
      need: need > 0 ? need : 0,
      hint: need > 0
        ? `FINAL ROUND — you need big numbers (${deficit > 0 ? `down ${deficit}` : `up ${-deficit}`})`
        : 'Pick your PROP (d-pad) · STYLE to cycle · mid-air STYLE taps for difficulty · HOLD SLAM to hang',
      charge: 0, slamPulse: false,
    });
  }

  async function rivalRound(ctx: ModeContext): Promise<void> {
    setPhase('rivalTurn');
    // The camera follows the rival for this stretch, so the rival IS the hero
    // on screen. FrameGuard watches heroRef and would otherwise spend the whole
    // rival round reporting the player — who is standing off-camera by design —
    // as lost, and after two strikes would recenter the camera off the rival
    // mid-dunk. Point the guard at whoever the camera is actually following.
    ctx.heroRef.current = rival.root;
    ctx.setHud({ hint: 'RIVAL ROUND', judgeReveal: null });
    for (let i = 0; i < DUNKS_PER_ROUND; i++) {
      ctx.camDirector.snapTo(rival.root.position, rim);
      rival.animator.play(SPORT_CLIP.dunkLaunchPower, { onEnd: () => rival.animator.play(SPORT_CLIP.idle, { loop: true }) });
      const t0 = performance.now();
      const from = rival.root.position.clone();
      await new Promise<void>((res) => {
        const obs = ctx.scene.onBeforeRenderObservable.add(() => {
          const k = Math.min(1, (performance.now() - t0) / 1300);
          rival.root.position.x = from.x + (rim.x - from.x) * k;
          rival.root.position.z = from.z + (rim.z + 0.7 - from.z) * k;
          rival.root.position.y = Math.sin(k * Math.PI) * 1.2;
          if (k >= 1) { ctx.scene.onBeforeRenderObservable.remove(obs); res(); }
        });
      });
      // The rival is a CONTENDER, not a wall. These inputs used to average a
      // ~43 card, which is near the top of what a good player can produce, on
      // every single attempt — so the contest was effectively decided before the
      // player took their second dunk. A real field is beatable and streaky:
      // this averages high-30s, swings, and BLOWS one now and then, which is
      // also what real dunk contests look like.
      const rivalBlew = Math.random() < RIVAL_BLOWN_CHANCE;
      const rDiff = rivalBlew ? 0.4 : 2.6 + Math.random() * 3.4;
      const rExec = rivalBlew ? 0 : 3.4 + Math.random() * 3.4;
      const rStyle = rivalBlew ? 0.5 : 2.2 + Math.random() * 3.2;
      const rScores = judgeDunk(rDiff, rExec, rStyle);
      const rTotal = rScores.reduce((s, j) => s + j.score, 0);
      rivalTotal += rTotal;
      SoundKit.play(rivalBlew ? 'miss' : 'crowdGroan', { volume: 0.35 });
      rival.animator.play(rivalBlew ? SPORT_CLIP.dunkLandCrouch : SPORT_CLIP.scoreCelebrate,
        { onEnd: () => rival.animator.play(SPORT_CLIP.idle, { loop: true }) });
      ctx.setHud({ rivalScore: rivalTotal, banner: rivalBlew ? `RIVAL BLOWS IT — ${rTotal}` : `RIVAL SCORES ${rTotal}` });
      rival.root.position.set(3.2, 0, CFG.rimZ + 3);
      await new Promise((r) => setTimeout(r, 1200));
    }
    ctx.setHud({ banner: '' });
    ctx.heroRef.current = player.root;          // the player is the hero again
    await advanceAfterRivalTurn(ctx);
  }

  async function advanceAfterRivalTurn(ctx: ModeContext): Promise<void> {
    if (round < TOTAL_ROUNDS) {
      round++;
      ctx.setHud({ round: `${round}/${TOTAL_ROUNDS}`, banner: `ROUND ${round}` });
      setTimeout(() => ctx.setHud({ banner: '' }), 1400);
      resetForNextAttempt(ctx);
      return;
    }
    setPhase('contestOver');
    SoundKit.play('whistle');
    const won = playerTotal >= rivalTotal;
    if (won) { SoundKit.play('crowdCheer'); EffectsKit.burst(ctx.scene, player.root.position.add(new Vector3(0, 2, 0)), 'confetti'); }
    ctx.end(won ? 'CONTEST_WON' : 'CONTEST_LOST', playerTotal, { rivalTotal, rounds: TOTAL_ROUNDS });
  }

  return def;
})();

// HUD CONTRACT — same as M52 (round, dunkNum, score, rivalScore, style, prop,
// hype, charge, slamPulse, hint, banner, judgeReveal, chain) plus NEW:
//   need: number — 0 normally; on final-round attempts, the judge total this
//     dunk should hit to hold off the rival's pace (bezel: "NEED N" chip)
