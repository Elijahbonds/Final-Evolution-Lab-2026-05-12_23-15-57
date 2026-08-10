// DunkDuelMode — NEW mode (`modeId: 'dunkduel'`, route `/play/dunkduel`).
// The head-to-head dunk contest: TWO HUMANS, one device, pass-and-play.
// Player 1 dunks, hands the device over, Player 2 answers, alternating two
// dunks each; the same three judges (Silk/Doc/Prime) score every attempt,
// and the higher total takes the duel.
//
// HONEST SCOPE: this is real local head-to-head — the strongest two-player
// experience shippable without networking infrastructure this repo can't
// see (same boundary as M48/M50). A remote/IRL-video variant would ride on
// the M36 cash-arena ghost/recording pipeline and is deliberately NOT
// faked here.
//
// The attempt flow is the proven M47/M52 single-player loop, trimmed for
// duel pacing (no props — both players get the identical clean-court test):
// approach → charge (trigger) → cinematic with SLAM QTE → judged reveal.
// Rim-cam broadcast cut and per-phase watchdogs carried over from M52.

import { MeshBuilder, Vector3 } from '@babylonjs/core';
import type { AbstractMesh } from '@babylonjs/core';
import { CharacterLibrary, type SpawnedCharacter } from '../core/CharacterLibrary';
import type { ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import { BallSim } from '../core/BallPhysics';
import { neverBindPose } from '../anim/importSanitizer';
import { installSafePlay, SPORT_CLIP } from '../anim/clipRegistry';
import { attachBallToHand, releaseBall, runEastbayPath, flushThroughRim, clankOffRim } from '../anim/ballRig';
import { EASTBAY_TIMING } from '../anim/authored/timing';
import { SoundKit } from '../audio/SoundKit';
import { EffectsKit } from '../visual/EffectsKit';
import { VenueKit } from '../visual/VenueKit';
import { applyOceanCourt } from '../visual/CourtSurface';
import { DUNK_CONFIG as CFG } from './modeConfigs';

type Phase = 'handoff' | 'approach' | 'charge' | 'cinematic' | 'resolve' | 'judging' | 'matchOver';
const STYLES = ['power', 'flashy', 'sig'] as const;
type Style = (typeof STYLES)[number];
const STYLE_CLIP: Record<Style, string> = {
  power: SPORT_CLIP.dunkLaunchPower, flashy: SPORT_CLIP.dunkLaunchFlashy, sig: SPORT_CLIP.dunkLaunchSig,
};
const STYLE_LABEL: Record<Style, string> = { power: 'POWER', flashy: 'FLASHY', sig: 'SIGNATURE' };
const STYLE_TIER: Record<Style, number> = { power: 3, flashy: 5.5, sig: 8 };

const DUNKS_EACH = 2;

const JUDGES = [
  { name: 'Silk', w: { difficulty: 0.2, execution: 0.3, style: 0.5 } },
  { name: 'Doc', w: { difficulty: 0.3, execution: 0.5, style: 0.2 } },
  { name: 'Prime', w: { difficulty: 0.5, execution: 0.3, style: 0.2 } },
] as const;
interface JudgeScore { name: string; score: number; line: string }
function judgeDunk(difficulty: number, execution: number, style: number): JudgeScore[] {
  return JUDGES.map((j) => {
    const raw = difficulty * j.w.difficulty + execution * j.w.execution + style * j.w.style;
    const score = Math.max(6, Math.min(10, Math.round(6 + raw * 0.4)));
    const line = score >= 10 ? `${j.name}: THAT'S A TEN.` : score >= 9 ? `${j.name}: about as good as it gets.`
      : score >= 7 ? `${j.name}: real difficulty, clean finish.` : `${j.name}: gets it done — I've seen bigger.`;
    return { name: j.name, score, line };
  });
}

const BUDGET_SEC: Record<Phase, number> = {
  handoff: 6, approach: 30, charge: 5, cinematic: 4, resolve: 3, judging: 6, matchOver: 999,
};

export const DunkDuelMode: ModeDefinition = (() => {
  let p1: SpawnedCharacter, p2: SpawnedCharacter;
  let ball: AbstractMesh, ballSim: BallSim;
  let phase: Phase = 'handoff';
  let phaseSec = 0;
  let activeIdx: 0 | 1 = 0;                       // whose turn
  let attemptNum = [0, 0];                        // dunks taken per player
  let totals = [0, 0];
  let style: Style = 'power';
  let charge = 0, clipTime = 0, qteHit = false, qteWindowOpen = false, qteAccuracy = 0;
  let sinceRelease = 0, releasePos = new Vector3();
  let finishing = false, rimCamCut = false, ended = false;
  const rim = new Vector3(0, CFG.rimHeight, CFG.rimZ);
  const ebState = { inLeftHand: false };
  let stickX = 0, stickY = 0;

  const active = (): SpawnedCharacter => (activeIdx === 0 ? p1 : p2);
  const bench = (): SpawnedCharacter => (activeIdx === 0 ? p2 : p1);
  const label = (): string => (activeIdx === 0 ? 'P1' : 'P2');
  function setPhase(p: Phase): void { phase = p; phaseSec = 0; }

  function enterHandoff(ctx: ModeContext): void {
    setPhase('handoff');
    style = 'power'; charge = 0; qteHit = false; qteWindowOpen = false; qteAccuracy = 0; rimCamCut = false;
    active().root.position.set(0, 0, CFG.startZ);
    active().root.rotation.y = Math.PI;
    active().animator.play(SPORT_CLIP.idle, { loop: true });
    bench().root.position.set(4.2, 0, CFG.rimZ + 4);
    bench().animator.play(SPORT_CLIP.idle, { loop: true });
    attachBallToHand(ball, active().skeleton, 'RightHand');
    ctx.camDirector.snapTo(active().root.position, rim);
    SoundKit.play('uiTick', { pitch: 0.9 });
    ctx.setHud({
      activePlayer: label(), p1Score: totals[0], p2Score: totals[1],
      dunkNum: `${attemptNum[activeIdx] + 1}/${DUNKS_EACH}`, style: STYLE_LABEL[style], charge: 0,
      banner: `PASS TO ${label()}`, hint: `${label()} — take the device`,
    });
    setTimeout(() => {
      if (phase !== 'handoff' || ended) return;
      ctx.setHud({ banner: '', hint: 'STYLE to cycle · HOLD CHARGE to load your jump' });
      setPhase('approach');
    }, 2200);
  }

  function launchDunk(ctx: ModeContext): void {
    if (phase === 'cinematic') return;
    setPhase('cinematic');
    clipTime = 0; qteHit = false; qteWindowOpen = false; qteAccuracy = 0; ebState.inLeftHand = false; rimCamCut = false;
    SoundKit.play('whoosh', { pitch: 0.85 });
    active().animator.play(STYLE_CLIP[style], { speedRatio: 1, onEnd: () => {} });
  }

  function resolveDunk(ctx: ModeContext): void {
    if (phase === 'resolve') return;
    setPhase('resolve');
    sinceRelease = 0; qteWindowOpen = false; rimCamCut = false;
    ctx.camDirector.snapTo(active().root.position, rim);
    ctx.setHud({ slamPulse: false });
    releasePos.copyFrom(ball.getAbsolutePosition());
    releaseBall(ball);
    if (!qteHit) ballSim.launch(releasePos, clankOffRim(ball, rim));
    active().animator.play(qteHit ? SPORT_CLIP.dunkScoreHang : SPORT_CLIP.jumpLand, {
      onEnd: () => active().animator.play(SPORT_CLIP.idle, { loop: true }),
    });
  }

  function finishAttempt(ctx: ModeContext, made: boolean): void {
    if (finishing) return;
    finishing = true;
    let dunkTotal = 0;
    let scores: JudgeScore[] = [];
    if (made) {
      const difficulty = Math.max(0, Math.min(10, STYLE_TIER[style] + charge * 2));
      const execution = Math.max(0, Math.min(10, qteAccuracy * 10));
      const styleScore = Math.max(0, Math.min(10, STYLE_TIER[style] * 0.8));
      scores = judgeDunk(difficulty, execution, styleScore);
      dunkTotal = scores.reduce((s, j) => s + j.score, 0);
      totals[activeIdx] += dunkTotal;
      SoundKit.play('score', { pitch: 1.1 });
      EffectsKit.burst(ctx.scene, rim, 'net');
      if (dunkTotal >= 27) { SoundKit.play('crowdCheer'); EffectsKit.burst(ctx.scene, active().root.position.add(new Vector3(0, 1.8, 0)), 'confetti'); }
    } else {
      SoundKit.play('miss');
    }
    active().animator.play(SPORT_CLIP.dunkLandCrouch, { onEnd: () => active().animator.play(SPORT_CLIP.idle, { loop: true }) });
    ctx.setHud({
      p1Score: totals[0], p2Score: totals[1],
      judgeReveal: made ? scores : null,
      banner: made ? `${label()} SCORES ${dunkTotal}` : `${label()} — MISSED, 0 pts`,
    });
    setPhase('judging');
    setTimeout(() => {
      ctx.setHud({ judgeReveal: null, banner: '' });
      advance(ctx);
      finishing = false;
    }, made ? 2600 : 1400);
  }

  function advance(ctx: ModeContext): void {
    if (phase !== 'judging' || ended) return;
    attemptNum[activeIdx]++;
    const p1Done = attemptNum[0] >= DUNKS_EACH, p2Done = attemptNum[1] >= DUNKS_EACH;
    if (p1Done && p2Done) {
      setPhase('matchOver');
      ended = true;
      SoundKit.play('whistle');
      const tie = totals[0] === totals[1];
      const winner = totals[0] >= totals[1] ? 'P1' : 'P2';
      if (!tie) { SoundKit.play('crowdCheer'); EffectsKit.burst(ctx.scene, rim, 'confetti'); }
      ctx.setHud({ banner: tie ? 'DEAD HEAT!' : `${winner} TAKES THE DUEL!` });
      ctx.end(tie ? 'DUEL_TIED' : `${winner}_WINS`, Math.max(totals[0], totals[1]), { p1: totals[0], p2: totals[1] });
      return;
    }
    // alternate: whoever has fewer attempts goes next
    activeIdx = attemptNum[0] <= attemptNum[1] ? 0 : 1;
    enterHandoff(ctx);
  }

  function watchdog(ctx: ModeContext): void {
    if (phaseSec <= BUDGET_SEC[phase] || finishing || ended) return;
    console.warn(`[FEL-DUNK] duel watchdog tripped in "${phase}" — auto-advancing`);
    switch (phase) {
      case 'handoff': ctx.setHud({ banner: '' }); setPhase('approach'); break;
      case 'approach': active().root.position.set(0, 0, CFG.gatherZ); phaseSec = 0; break;
      case 'charge': launchDunk(ctx); break;
      case 'cinematic': resolveDunk(ctx); break;
      case 'resolve': finishAttempt(ctx, qteHit); break;
      case 'judging': ctx.setHud({ judgeReveal: null, banner: '' }); advance(ctx); break;
    }
  }

  return {
    modeId: 'dunkduel', mood: 'goldenHour', camPreset: 'court',

    async load(ctx: ModeContext) {
      VenueKit.buildCourt(ctx.scene);
      applyOceanCourt(ctx.scene, 'venice');
      p1 = await CharacterLibrary.spawn(ctx.scene, CFG.heroUrl, {
        position: new Vector3(0, 0, CFG.startZ), yawRad: Math.PI, startClip: SPORT_CLIP.idle,
      });
      neverBindPose(p1.animator, SPORT_CLIP.idle);
      installSafePlay(p1.animator, 'dunkduel-p1');
      ctx.groundLock?.track(p1.root, p1.skeleton);
      p2 = await CharacterLibrary.spawn(ctx.scene, CFG.heroUrl, {
        position: new Vector3(4.2, 0, CFG.rimZ + 4), tint: '#22d3ee', startClip: SPORT_CLIP.idle,
      });
      neverBindPose(p2.animator, SPORT_CLIP.idle);
      installSafePlay(p2.animator, 'dunkduel-p2');
      ctx.groundLock?.track(p2.root, p2.skeleton);

      ball = MeshBuilder.CreateSphere('duel_ball', { diameter: 0.24 }, ctx.scene);
      ballSim = new BallSim(ball, 0.12);
      ctx.heroRef.current = active().root;
      ctx.objectiveRef.current = rim;
      SoundKit.startAmbient('stadium');
      EffectsKit.ambient(ctx.scene, 'venice');
      EffectsKit.ballTrail(ctx.scene, ball);

      activeIdx = 0; attemptNum = [0, 0]; totals = [0, 0]; ended = false; finishing = false;
      enterHandoff(ctx);
    },

    onInput(ctx: ModeContext, e: FelInput) {
      SoundKit.unlock();
      if (e.t === 'stick' && e.side === 'L') { stickX = e.x; stickY = e.y; }
      if (phase === 'handoff' && e.t === 'button' && e.pressed) {
        // any button skips the handoff card
        ctx.setHud({ banner: '', hint: 'STYLE to cycle · HOLD CHARGE to load your jump' });
        setPhase('approach');
        return;
      }
      if (e.t === 'button' && e.btn === 'B' && e.pressed && phase === 'approach') {
        style = STYLES[(STYLES.indexOf(style) + 1) % STYLES.length];
        ctx.setHud({ style: STYLE_LABEL[style] });
        SoundKit.play('uiTick');
      }
      if (e.t === 'trigger' && e.side === 'R') {
        if (phase === 'approach' && e.value > 0.02) {
          setPhase('charge');
          active().animator.play(SPORT_CLIP.dunkChargeGather, { loop: true });
        }
        if (phase === 'charge') {
          charge = Math.max(charge, e.value);
          ctx.setHud({ charge: Math.round(charge * 100) });
          if (e.value === 0) launchDunk(ctx);
        }
      }
      if (e.t === 'button' && e.btn === 'A' && e.pressed && qteWindowOpen) {
        qteHit = true;
        qteAccuracy = Math.max(0, 1 - Math.abs(clipTime - EASTBAY_TIMING.extend) / (CFG.qteWindowSec / 2));
      }
    },

    update(ctx: ModeContext, dt: number) {
      phaseSec += dt;
      watchdog(ctx);
      if (ended) return;

      const vel = new Vector3(stickX * 4, 0, -Math.max(0, -stickY) * 5 - 2);
      if (phase === 'approach') {
        const c = active();
        c.root.position.addInPlace(vel.scale(dt));
        c.root.position.z = Math.max(c.root.position.z, CFG.gatherZ);
        c.root.position.x = Math.max(-6, Math.min(6, c.root.position.x));
        c.animator.play(Math.hypot(vel.x, vel.z) > 2.5 ? SPORT_CLIP.moveLoop : SPORT_CLIP.idle, { loop: true });
        if (c.root.position.z <= CFG.gatherZ + 0.2) ctx.setHud({ hint: 'HOLD CHARGE — load your jump' });
      }

      if (phase === 'cinematic') {
        clipTime += dt;
        const c = active();
        if (style === 'sig') runEastbayPath(ball, c.skeleton, clipTime, ebState);
        const k = Math.min(1, clipTime / EASTBAY_TIMING.duration);
        c.root.position.y = Math.sin(k * Math.PI) * (1.05 + charge * 0.55);
        c.root.position.z += (rim.z + 0.6 - c.root.position.z) * 1.6 * dt;

        if (!rimCamCut && clipTime >= EASTBAY_TIMING.extend * 0.55) {
          rimCamCut = true;
          ctx.camDirector.snapTo(new Vector3(rim.x + 2.6, 0.4, rim.z - 1.2), c.root.position.add(new Vector3(0, 1.4, 0)));
        }

        const wasOpen = qteWindowOpen;
        qteWindowOpen = clipTime >= EASTBAY_TIMING.extend - CFG.qteWindowSec / 2
          && clipTime <= EASTBAY_TIMING.extend + CFG.qteWindowSec / 2;
        if (qteWindowOpen && !wasOpen) ctx.setHud({ hint: 'SLAM!', slamPulse: true });
        if (!qteWindowOpen && wasOpen) ctx.setHud({ slamPulse: false });
        if (clipTime >= EASTBAY_TIMING.extend + CFG.qteWindowSec / 2) resolveDunk(ctx);
      }

      if (phase === 'resolve') {
        sinceRelease += dt;
        if (qteHit) {
          if (flushThroughRim(ball, rim, releasePos, sinceRelease)) finishAttempt(ctx, true);
        } else {
          ballSim.step(dt);
          if (sinceRelease > 1.2) finishAttempt(ctx, false);
        }
      }

      if (phase === 'cinematic' && rimCamCut) {
        // hold the rim-cam angle through the flush
      } else if (phase !== 'judging' && phase !== 'matchOver' && phase !== 'handoff') {
        ctx.camDirector.update(active().root.position, vel, phase === 'approach' ? rim : ball.position);
      }
    },

    dispose() {
      p1?.dispose(); p2?.dispose(); ball?.dispose();
      SoundKit.stopAmbient();
    },
  };
})();

// HUD CONTRACT (bare values): activePlayer ('P1'/'P2'), p1Score/p2Score,
// dunkNum, style, charge, slamPulse, judgeReveal (same shape as Dunk
// Contest's), banner, hint.
