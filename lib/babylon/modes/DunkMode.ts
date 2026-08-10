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
import { CharacterLibrary, type SpawnedCharacter } from '../core/CharacterLibrary';
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
const CHAIN_THRESHOLD = 24;                  // judge total that keeps a chain alive

// Three judges, three lenses — same persona trio the Cash Arena uses, tuned
// here for a live single-player reveal (deterministic, no network/LLM dep).
const JUDGES = [
  { id: 'silk', name: 'Silk', w: { difficulty: 0.2, execution: 0.3, style: 0.5 } },
  { id: 'doc', name: 'Doc', w: { difficulty: 0.3, execution: 0.5, style: 0.2 } },
  { id: 'prime', name: 'Prime', w: { difficulty: 0.5, execution: 0.3, style: 0.2 } },
] as const;

interface JudgeScore { name: string; score: number; line: string }
function cannedLine(name: string, score: number): string {
  if (score >= 10) return `${name}: THAT'S A TEN. Hand me the mic.`;
  if (score >= 9) return `${name}: about as good as it gets.`;
  if (score >= 7) return `${name}: real difficulty, clean finish.`;
  return `${name}: gets it done — I've seen bigger.`;
}
function judgeDunk(difficulty: number, execution: number, style: number): JudgeScore[] {
  return JUDGES.map((j) => {
    const raw = difficulty * j.w.difficulty + execution * j.w.execution + style * j.w.style; // 0..10
    const score = Math.max(6, Math.min(10, Math.round(6 + raw * 0.4)));
    return { name: j.name, score, line: cannedLine(j.name, score) };
  });
}

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
      teammate = await CharacterLibrary.spawn(ctx.scene, CFG.heroUrl, {
        position: new Vector3(-3.4, 0, CFG.rimZ + 1.6), tint: '#22d3ee', startClip: SPORT_CLIP.teammateIdle,
      });
      neverBindPose(teammate.animator, SPORT_CLIP.teammateIdle);
      installSafePlay(teammate.animator, 'dunk-teammate');
    }
  }

  const def: ModeDefinition = {
    modeId: 'dunk', mood: 'goldenHour', camPreset: 'court',

    async load(ctx: ModeContext) {
      // M74: try Nexus venue first; fallback to VenueKit if no spec
      dunkVenue = mountVenue(ctx, 'basketball_dunk', { keepGameplayCamera: true });
      if (!dunkVenue) { VenueKit.buildCourt(ctx.scene); applyOceanCourt(ctx.scene, 'venice'); }
      player = await CharacterLibrary.spawn(ctx.scene, CFG.heroUrl, {
        position: new Vector3(0, 0, CFG.startZ), yawRad: Math.PI, startClip: SPORT_CLIP.idle,
        // M110 skins — the hero: gold-trimmed royal kit, deep skin tone, black hair,
        // white sneakers. A designed look rather than the default flat jersey.
        tint: '#2F6BFF', accent: '#FFD700', skinTone: '#8D5524', hairColor: '#141414', shoeColor: '#F5F5F5',
      });
      neverBindPose(player.animator, SPORT_CLIP.idle);
      installSafePlay(player.animator, 'dunk-player');
      ctx.groundLock?.track(player.root, player.skeleton);
      rival = await CharacterLibrary.spawn(ctx.scene, CFG.heroUrl, {
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
      setPhase('approach');
      ctx.setHud({
        round: `${round}/${TOTAL_ROUNDS}`, dunkNum: `${dunkInRound + 1}/${DUNKS_PER_ROUND}`,
        score: playerTotal, rivalScore: rivalTotal, style: STYLE_LABEL[style], prop: PROP_LABEL[prop], hype: 0, chain: 0,
        hint: 'Pick your PROP (d-pad) · STYLE to cycle · HOLD CHARGE to load your jump',
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
      // TRICK GESTURES (Phase 6) — right-stick snaps mid-air throw real
      // dunk tricks (windmill ↓↑, 360 ←→, eastbay ↓←, tomahawk ↑↓,
      // between-the-legs →←→). Each plays its own clip, pumps difficulty,
      // and taxes the slam window. Two before the window = COMBO dunk.
      if (phase === 'cinematic' && !qteWindowOpen) {
        const trick = flight.feedInput(e);
        if (trick) {
          trickLabels.push(trick.label);
          player.animator.play(trick.clip, { speedRatio: 1.05 });
          hype = Math.min(100, hype + 6);
          SoundKit.play('whoosh', { pitch: 1.1 + trick.difficulty * 0.08, volume: 0.45 });
          SoundKit.play('crowdCheer', { volume: 0.3 + trick.difficulty * 0.05 });
          EffectsKit.burst(ctx.scene, player.root.position.add(new Vector3(0, 1.8, 0)), 'sparks');
          ctx.setHud({ banner: trickLabels.length > 1 ? `COMBO: ${trickLabels.join(' → ')}!` : `${trick.label}!` });
          setTimeout(() => ctx.setHud({ banner: '' }), 700);
        }
      }
      // STYLE TAPS — mid-air showboating before the SLAM window opens:
      // +1.2 difficulty each, SLAM window shrinks 25% per tap (max 2)
      if (e.t === 'button' && e.btn === 'B' && e.pressed && phase === 'cinematic'
          && !qteWindowOpen && styleTaps < 2) {
        styleTaps++;
        SoundKit.play('whoosh', { pitch: 1.6, volume: 0.35 });
        ctx.feel?.impact?.(0.1);
        EffectsKit.burst(ctx.scene, player.root.position.add(new Vector3(0, 1.4, 0)), 'sparks');
        ctx.setHud({ banner: `+STYLE TAP x${styleTaps}` });
        setTimeout(() => ctx.setHud({ banner: '' }), 450);
      }
      // d-pad now cycles PROP (repurposed — no new input plumbing needed):
      // up=none, right=alley-oop, down=obstacle
      if (e.t === 'dpad' && e.pressed && phase === 'approach') {
        prop = e.dir === 'up' ? 'none' : e.dir === 'right' ? 'alleyoop' : 'obstacle';
        ctx.setHud({ prop: PROP_LABEL[prop] });
        SoundKit.play('uiTick', { pitch: 1.3 });
        void setupProp(ctx);
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
        const moving = Math.hypot(vel.x, vel.z) > 2.5;
        player.animator.play(moving ? SPORT_CLIP.moveLoop : SPORT_CLIP.idle, { loop: true });
        if (player.root.position.z <= CFG.gatherZ + 0.2) {
          ctx.setHud({ hint: 'HOLD CHARGE — load your jump' });
        }
      }

      if (phase === 'cinematic') {
        clipTime += dt;
        if (style === 'sig') runEastbayPath(ball, player.skeleton, clipTime, ebState);
        const k = Math.min(1, clipTime / EASTBAY_TIMING.duration);
        player.root.position.y = Math.sin(k * Math.PI) * (1.05 + charge * 0.55);
        player.root.position.z += (rim.z + 0.6 - player.root.position.z) * 1.6 * dt;

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
        if (qteHit) {
          if (aHeld) hangSec += dt;               // rim hang builds while SLAM stays held
          if (flushThroughRim(ball, rim, releasePos, sinceRelease)) void finishAttempt(ctx, true);
        } else {
          ballSim.step(dt);
          if (sinceRelease > 1.2) void finishAttempt(ctx, false);
        }
      }

      if (phase === 'rivalTurn') {
        ctx.camDirector.update(rival.root.position, Vector3.Zero(), rim);
      } else if (phase === 'cinematic' && rimCamCut) {
        // hold the rim-cam angle through the flush — no per-frame follow
      } else if (phase !== 'judging' && phase !== 'contestOver') {
        ctx.camDirector.update(player.root.position, vel, phase === 'approach' ? rim : ball.position);
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
    return total >= 27 ? SPORT_CLIP.dunkCelebrateBig : SPORT_CLIP.dunkLandCrouch;
  }

  function launchDunk(ctx: ModeContext): void {
    if (phase === 'cinematic') return;
    setPhase('cinematic');
    clipTime = 0; qteHit = false; qteWindowOpen = false; qteAccuracy = 0; ebState.inLeftHand = false;
    rimCamCut = false; styleTaps = 0; hangSec = 0; trickLabels = [];
    flight.launch(Math.min(1, charge * 0.5 + Math.hypot(stickX, stickY) * 0.5), STYLE_TIER[style]);
    if (prop !== 'alleyoop') attachBallToHand(ball, player.skeleton, 'RightHand');
    else releaseBall(ball);   // ball waits at the teammate's hand until the toss beat
    SoundKit.play('whoosh', { pitch: 0.85 });
    player.animator.play(STYLE_CLIP[style], { speedRatio: 1, onEnd: () => {} });
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
      hype = Math.max(0, hype - 15);
      chain = 0;                                          // a miss breaks the chain
      lastScores = [];
      ctx.setHud({ banner: 'MISSED — 0 pts this attempt', judgeReveal: null, chain });
      player.animator.play(SPORT_CLIP.dunkLandCrouch, { onEnd: () => player.animator.play(SPORT_CLIP.idle, { loop: true }) });
      setPhase('judging');
      setTimeout(() => { ctx.setHud({ banner: '' }); void advanceAfterJudging(ctx); }, 1400);
      finishing = false;
      return;
    }

    // clear the obstacle? (checked once, at the flush moment — apex already happened)
    let clippedObstacle = false;
    if (prop === 'obstacle' && obstacle) {
      const clearedIt = player.root.position.y + 1.0 >= obstacleClearHeight;
      clippedObstacle = !clearedIt;
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
    const trickDifficulty = flight.attempt.difficulty - STYLE_TIER[style];
    const difficulty = Math.max(0, Math.min(10,
      (STYLE_TIER[style] + trickDifficulty + PROP_BONUS[prop] * (clippedObstacle ? 0.4 : 1) + charge * 2
        + styleTaps * 1.2 + varietyBonus) * varietyMod));
    const execution = Math.max(0, Math.min(10, qteAccuracy * 10));
    const styleScore = Math.max(0, Math.min(10, STYLE_TIER[style] * 0.6 + Math.min(2, hype / 50) + styleTaps * 0.8 + hangBonus));

    const scores = judgeDunk(difficulty, execution, styleScore);
    lastScores = scores;
    const dunkTotal = scores.reduce((s, j) => s + j.score, 0);   // 18..30

    // CHAIN: consecutive 24+ dunks build the multiplier; each link pumps
    // extra hype (which feeds the NEXT dunk's style score — real teeth)
    // Game-Breaker: a 27+ dunk is a highlight that shifts the building
    if (dunkTotal >= 27) {
      momentum.report({ kind: 'highlight_dunk', weight: dunkTotal >= 29 ? 30 : 18 });
    } else if (dunkTotal <= 19) {
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
    hype = Math.min(100, hype + dunkTotal * 2);

    ctx.feel?.impact?.(0.2 + execution / 15);
    SoundKit.play('score', { pitch: 1 + Math.min(1, hype / 100) });
    EffectsKit.burst(ctx.scene, rim, 'net');
    if (dunkTotal >= 27) { SoundKit.play('crowdCheer'); EffectsKit.burst(ctx.scene, player.root.position.add(new Vector3(0, 1.8, 0)), 'confetti'); }
    const landing = pickLanding(dunkTotal);
    if (clippedObstacle) ctx.setHud({ banner: 'CLIPPED THE PROP — flushed anyway' });

    ctx.setHud({ score: playerTotal, hype: Math.round(hype), chain, judgeReveal: scores });
    player.animator.play(landing, { onEnd: () => player.animator.play(SPORT_CLIP.idle, { loop: true }) });

    ctx.camDirector.suspended = true;
    await Promise.race([replay.play(rim), new Promise((r) => setTimeout(r, 3500))]);
    ctx.camDirector.suspended = false;

    setPhase('judging');
    setTimeout(() => void advanceAfterJudging(ctx), 2600);
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
    styleTaps = 0; hangSec = 0;
    void setupProp(ctx);
    ctx.camDirector.snapTo(player.root.position, rim);
    setPhase('approach');
    // THE NEED — final-round pressure number: what this dunk must average
    // to stay ahead of the rival's pace (they dunk after you)
    const isFinalRound = round === TOTAL_ROUNDS;
    const deficit = rivalTotal - playerTotal;
    const need = isFinalRound ? Math.max(0, deficit + 25) : 0;   // 25/dunk ≈ rival pace
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
      // simulated judged score — comparable range to a real player attempt
      const rDiff = 4 + Math.random() * 5, rExec = 5 + Math.random() * 5, rStyle = 3 + Math.random() * 4;
      const rScores = judgeDunk(rDiff, rExec, rStyle);
      const rTotal = rScores.reduce((s, j) => s + j.score, 0);
      rivalTotal += rTotal;
      SoundKit.play('crowdGroan', { volume: 0.35 });
      rival.animator.play(SPORT_CLIP.scoreCelebrate, { onEnd: () => rival.animator.play(SPORT_CLIP.idle, { loop: true }) });
      ctx.setHud({ rivalScore: rivalTotal, banner: `RIVAL SCORES ${rTotal}` });
      rival.root.position.set(3.2, 0, CFG.rimZ + 3);
      await new Promise((r) => setTimeout(r, 1200));
    }
    ctx.setHud({ banner: '' });
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
