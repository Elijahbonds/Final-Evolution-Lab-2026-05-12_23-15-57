// NetSportMode — the factory both net sports are built from.
//
// Tennis and volleyball share a loop: a ball crosses a net, the receiving side
// gets a timing window, and the rally ends on a miss, a net, or an out. Only
// scoring and touches-per-side differ. So this is written once as a factory
// and each mode is a config object — the same call BasketballCore made for
// 1v1 / 3v3 / dunk, and the reason volleyball cost a file rather than a week.
//
// All rally arithmetic lives in RallyCore (Babylon-free, 37 executed tests).
// This file owns meshes, input, animation and HUD, and nothing else.

import { MeshBuilder, Vector3 } from '@babylonjs/core';
import type { AbstractMesh } from '@babylonjs/core';
import { CharacterLibrary, type SpawnedCharacter } from '../core/CharacterLibrary';
import { neverBindPose } from '../anim/importSanitizer';
import { installSafePlay, SPORT_CLIP } from '../anim/clipRegistry';
import { mountVenue, type VenueHandle } from '../core/NexusVenue';
import { SoundKit } from '../audio/SoundKit';
import { EffectsKit } from '../visual/EffectsKit';
import { assertSpawned } from '../core/FrameGuard';
import type { ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import {
  gradeSwing, planShot, shotAt, judgeShot, TennisScore, VolleyScore, RallyState,
  type RallyConfig, type Shot, type SwingQuality, type RallyFault,
} from '../core/RallyCore';

export interface NetSportOptions {
  modeId: string;
  venueId: string;
  heroUrl: string;
  cfg: RallyConfig;
  /** 'tennis' uses games/deuce; 'volley' uses rally scoring to a target. */
  scoring: 'tennis' | 'volley';
  ballDiameter: number;
  ballTint: string;
  ambient: Parameters<typeof SoundKit.startAmbient>[0];
  swingClip: string;
  /** 0–1. How reliably the AI returns; higher misses less. */
  aiSkill: number;
  hudLabels: { you: string; them: string };
}

export function createNetSportMode(o: NetSportOptions): ModeDefinition {
  let me: SpawnedCharacter, foe: SpawnedCharacter;
  let ball: AbstractMesh;
  let venue: VenueHandle | null = null;

  let rally: RallyState;
  let tennisScore: TennisScore | null = null;
  let volleyScore: VolleyScore | null = null;

  // flight state
  let shot: Shot | null = null;
  let flightT = 0;                 // 0..1 across the current flight
  let contactArmed = false;        // the receiving side may swing
  let awaitingHuman = false;       // is the ball coming to us?
  let aimX = 0;
  let ended = false;
  let restSec = 0;                 // pause between points
  let heroStreak = 0;              // M107: consecutive points won → tension/hype

  const HERO_SIDE = 1;             // hero defends +Z, opponent defends −Z

  function label(): string {
    if (tennisScore) return tennisScore.callFor(0);
    if (volleyScore) return `${volleyScore.points[0]} – ${volleyScore.points[1]}`;
    return '';
  }

  function pushHud(ctx: ModeContext): void {
    ctx.setHud({
      score: tennisScore ? tennisScore.games[0] : volleyScore!.points[0],
      foeScore: tennisScore ? tennisScore.games[1] : volleyScore!.points[1],
      callout: label(),
    });
  }

  function flash(ctx: ModeContext, text: string, ms = 900): void {
    ctx.setHud({ banner: text });
    setTimeout(() => ctx.setHud({ banner: '' }), ms);
  }

  /** Award a point to `side` (0 = hero) and set up the next serve. */
  function awardPoint(ctx: ModeContext, side: 0 | 1, why: string): void {
    rally.end();
    shot = null;
    contactArmed = false;
    const result = tennisScore ? tennisScore.award(side) : volleyScore!.award(side);
    pushHud(ctx);
    SoundKit.play(side === 0 ? 'score' : 'miss');

    // M107 point feedback: a world-space pop at the net so a won/lost point
    // reads instantly, plus a streak that builds tension across a game.
    const netPop = new Vector3(0, o.cfg.netHeight + 0.5, 0);
    if (side === 0) {
      heroStreak++;
      ctx.juice.scorePop(netPop, `+1 ${o.hudLabels.you}`, '#00FF9D');
      ctx.feel.impact(0.22);
    } else {
      heroStreak = 0;
      ctx.juice.scorePop(netPop, o.hudLabels.them, '#FF3366');
    }

    if (result === 'match' || result === 'set') {
      ended = true;
      if (side === 0) ctx.juice.impact(netPop, 'GAME!', { color: '#FFD700', slow: true });
      else ctx.juice.flash('#FF3366', 260);
      flash(ctx, side === 0 ? 'YOU WIN' : 'YOU LOSE', 2500);
      ctx.end(
        side === 0 ? 'WIN' : 'LOSS',
        tennisScore ? tennisScore.games[0] : volleyScore!.points[0],
        { streak: heroStreak },
      );
      return;
    }
    if (side === 0 && heroStreak >= 3) {
      flash(ctx, `STREAK ×${heroStreak} — ${why}`, 1100);
    } else {
      flash(ctx, `${why} — ${side === 0 ? o.hudLabels.you : o.hudLabels.them}`, 1100);
    }
    restSec = 1.4;
  }

  /** Begin a flight from `from` toward `toSide`, with a quality already graded. */
  function launch(_ctx: ModeContext, from: Vector3, toSide: -1 | 1, aim: number, q: SwingQuality): boolean {
    const planned = planShot(o.cfg, { x: from.x, y: from.y, z: from.z }, toSide, aim, q);
    if (!planned) return false;

    const fault: RallyFault | null = judgeShot(o.cfg, planned);
    shot = planned;
    flightT = 0;
    contactArmed = false;
    // Who is receiving decides whether WE get a swing window this flight.
    awaitingHuman = toSide > 0;

    if (fault) {
      // The ball still flies — it just ends in a fault when it lands. Playing
      // the flight out is what makes a net-cord read as a near miss instead of
      // the ball vanishing.
      shot.duration *= 0.8;
      pendingFault = fault;
    } else {
      pendingFault = null;
    }
    return true;
  }

  let pendingFault: RallyFault | null = null;

  function serve(ctx: ModeContext): void {
    rally.serve(0);
    const from = new Vector3(me.root.position.x, 1.5, o.cfg.halfLength * 0.92);
    ball.position.copyFrom(from);
    me.animator.play(o.swingClip, { onEnd: () => me.animator.play(SPORT_CLIP.idle, { loop: true }) });
    SoundKit.play('uiTick', { pitch: 1.2, volume: 0.4 });
    launch(ctx, from, -1, (Math.random() - 0.5) * 0.5, 'good');
    flash(ctx, 'SERVE', 600);
  }

  /** The opponent's return. Skill decides how often they find a good one. */
  function aiReturn(ctx: ModeContext): void {
    const roll = Math.random();
    const q: SwingQuality = roll > o.aiSkill ? 'miss'
      : roll > o.aiSkill * 0.75 ? 'late'
      : roll > o.aiSkill * 0.45 ? 'good' : 'perfect';

    if (q === 'miss') { awardPoint(ctx, 0, 'THEY MISSED'); return; }
    if (rally.touch() === 'fault') { awardPoint(ctx, 0, 'FOUR TOUCHES'); return; }
    rally.cross();

    foe.animator.play(o.swingClip, { onEnd: () => foe.animator.play(SPORT_CLIP.idle, { loop: true }) });
    SoundKit.play('uiTick', { pitch: 0.9, volume: 0.35 });
    EffectsKit.burst(ctx.scene, ball.getAbsolutePosition(), 'sparks');
    launch(ctx, ball.getAbsolutePosition(), 1, (Math.random() - 0.5) * 1.6, q);
  }

  /** The human's swing. Called on the action edge. */
  function humanSwing(ctx: ModeContext): void {
    if (!shot || !awaitingHuman) return;
    // dt vs the ideal contact moment, which is the end of the flight
    const dt = (flightT - 1) * shot.duration;
    const q = gradeSwing(dt);

    if (q === 'miss') return;                       // early flail; not a fault yet
    if (rally.touch() === 'fault') { awardPoint(ctx, 1, 'TOO MANY TOUCHES'); return; }
    rally.cross();

    me.animator.play(o.swingClip, { onEnd: () => me.animator.play(SPORT_CLIP.idle, { loop: true }) });
    SoundKit.play('uiTick', { pitch: q === 'perfect' ? 1.6 : 1.1, volume: 0.5 });
    const swingPos = ball.getAbsolutePosition();
    // M107 swing juice: a crisp pop + hit-impact on a perfectly-timed contact so
    // good timing FEELS rewarded, not just scored.
    if (q === 'perfect') {
      EffectsKit.burst(ctx.scene, swingPos, 'sparks');
      ctx.juice.scorePop(swingPos, 'PERFECT!', '#00E5FF');
      ctx.feel.impact(0.4);
      ctx.juice.shake(0.08, 90);
    } else if (q === 'good') {
      ctx.juice.scorePop(swingPos, 'NICE', '#00FF9D');
    }
    ctx.setHud({ shotType: q.toUpperCase() });
    setTimeout(() => ctx.setHud({ shotType: '' }), 500);
    launch(ctx, swingPos, -1, aimX, q);
  }

  return {
    modeId: o.modeId,
    mood: 'goldenHour',
    camPreset: 'hoops',

    async load(ctx: ModeContext) {
      venue = mountVenue(ctx, o.venueId);

      me = await CharacterLibrary.spawn(ctx.scene, o.heroUrl, {
        position: new Vector3(0, 0, o.cfg.halfLength * 0.85), yawRad: Math.PI, startClip: SPORT_CLIP.idle });
      neverBindPose(me.animator, SPORT_CLIP.idle); installSafePlay(me.animator, `${o.modeId}-me`);
      ctx.groundLock?.track(me.root, me.skeleton);

      foe = await CharacterLibrary.spawn(ctx.scene, o.heroUrl, {
        position: new Vector3(0, 0, -o.cfg.halfLength * 0.85), tint: '#ff2d78', startClip: SPORT_CLIP.idle });
      neverBindPose(foe.animator, SPORT_CLIP.idle); installSafePlay(foe.animator, `${o.modeId}-foe`);
      ctx.groundLock?.track(foe.root, foe.skeleton);

      // Real characters are in — drop the venue's placeholder bodies, or every
      // player is on the court twice.
      venue?.hidePlaceholders();

      ball = MeshBuilder.CreateSphere('ball', { diameter: o.ballDiameter }, ctx.scene);
      EffectsKit.ballTrail(ctx.scene, ball);
      SoundKit.startAmbient(o.ambient);

      rally = new RallyState(o.cfg);
      tennisScore = o.scoring === 'tennis' ? new TennisScore(4) : null;
      volleyScore = o.scoring === 'volley' ? new VolleyScore(25) : null;
      ended = false; restSec = 0.8; shot = null; aimX = 0; heroStreak = 0;

      ctx.heroRef.current = me.root;
      ctx.objectiveRef.current = new Vector3(0, o.cfg.netHeight, 0);
      ctx.camDirector.snapTo(me.root.position, new Vector3(0, 1, 0));
      pushHud(ctx);
      assertSpawned(ctx.scene, { hero: me.root, minWorldMeshes: 6, modeId: o.modeId });
    },

    onInput(_ctx: ModeContext, e: FelInput) {
      if (e.t === 'stick' && e.side === 'L') {
        aimX = e.x;
        // Move laterally along the baseline; depth is fixed so the player is
        // always in a plausible receiving position rather than wandering.
        if (me) {
          const limit = o.cfg.halfWidth * 0.9;
          me.root.position.x = Math.max(-limit, Math.min(limit, me.root.position.x + e.x * 0.12));
        }
      }
      if (e.t === 'trigger' && e.side === 'R' && e.value > 0.5) humanSwing(_ctx);
      if (e.t === 'button' && e.pressed && e.btn === 'A') humanSwing(_ctx);
    },

    update(ctx: ModeContext, dt: number) {
      if (ended) return;

      if (restSec > 0) {
        restSec -= dt;
        if (restSec <= 0) serve(ctx);
        return;
      }
      if (!shot) return;

      flightT += dt / shot.duration;
      const p = shotAt(shot, flightT);
      ball.position.set(p.x, p.y, p.z);

      // Arm the swing window once the ball is on its way in.
      if (!contactArmed && flightT > 0.55) {
        contactArmed = true;
        if (awaitingHuman) ctx.setHud({ shotMeterT: 1 });
      }

      if (flightT < 1) return;

      // The flight has landed.
      ctx.setHud({ shotMeterT: 0 });
      if (pendingFault) {
        // Whoever last hit it committed the fault.
        const offender: 0 | 1 = awaitingHuman ? 1 : 0;
        const why = pendingFault === 'net' ? 'INTO THE NET'
          : pendingFault === 'long' ? 'LONG' : 'WIDE';
        awardPoint(ctx, (1 - offender) as 0 | 1, why);
        pendingFault = null;
        return;
      }

      if (awaitingHuman) {
        // It reached us and we never swung.
        awardPoint(ctx, 1, 'NO SWING');
      } else {
        aiReturn(ctx);
      }
    },

    dispose() {
      venue?.dispose(); venue = null;
      me?.dispose(); foe?.dispose();
      SoundKit.stopAmbient();
      shot = null; ended = true;
    },
  };
}

// HUD fields used: score, foeScore, callout (game score text — "40-30",
// "DEUCE", or "12 – 9"), banner, shotType, shotMeterT.
