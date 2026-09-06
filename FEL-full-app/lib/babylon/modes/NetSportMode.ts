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
import { ballKindFor, dressBall } from '../visual/meshyProps';
import type { AbstractMesh } from '@babylonjs/core';
import { CharacterLibrary, type SpawnedCharacter } from '../core/CharacterLibrary';
import { neverBindPose } from '../anim/importSanitizer';
import { installSafePlay, SPORT_CLIP } from '../anim/clipRegistry';
import { mountVenue, type VenueHandle } from '../core/NexusVenue';
import { SoundKit } from '../audio/SoundKit';
import { EffectsKit } from '../visual/EffectsKit';
import { Onlookers } from '../visual/Onlookers';

/** Seconds before the blocker can commit to the net again. */
const BLOCK_COOLDOWN_SEC = 7;

// ── The energy layer (Mario Tennis Aces) ────────────────────────────────────
// A gauge you fill by hitting the ball WELL and spend on a shot that can break
// the other player's racket. Aces also has Zone Speed and a trick-shot dash;
// both exist to help you REACH a ball, and this mode has no player positioning
// to reach with, so they are recorded as out of scope rather than faked.
export const ENERGY_MAX = 100;
export const ENERGY_PERFECT = 20;
export const ENERGY_GOOD = 9;
export const ENERGY_RALLY_WON = 10;
/** A Zone Shot costs the whole gauge — it is the payoff, not a rotation. */
export const ZONE_COST = 100;
/** Rackets each side can lose before the match is over. */
export const RACKETS = 3;
import { assertSpawned } from '../core/FrameGuard';
import type { ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import {
  gradeSwing, planShot, shotAt, judgeShot, TennisScore, VolleyScore, RallyState,
  volleyTouchFor, volleyCrosses, BLOCK_STUFF_WINDOW,
  type TennisShot,
  type RallyConfig, type Shot, type SwingQuality, type RallyFault, type VolleyTouch,
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
  /** L4 — line the court with spectators. Opt-in per mode so a mode that has
   *  not had a World-Population pass does not silently gain one. */
  crowd?: boolean;
  /** Aces' energy gauge, Zone Shot and racket break. Tennis only. */
  energy?: boolean;
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
  let crowd: Onlookers | null = null;
  let flightT = 0;                 // 0..1 across the current flight
  let contactArmed = false;        // the receiving side may swing
  let awaitingHuman = false;       // is the ball coming to us?
  /** What KIND of shot is in the air. A block only answers an attack, and an
   *  attack is harder to return than a dig — both need this. */
  let incomingTouch: VolleyTouch | undefined;
  /** One block attempt per incoming attack. */
  let blockSpent = false;
  /** The shot the player has selected for their NEXT contact (one-touch sports).
   *  Chosen by which button they swing with, so it is a decision made under the
   *  same time pressure as the timing itself. */
  let pendingShot: TennisShot = 'drive';
  /**
   * Seconds until the player can commit to the net again.
   *
   * A real block's cost is POSITIONAL: you commit to the net and leave the
   * court open behind you, so you cannot block every attack. This mode has no
   * player positioning at all — contact is pure timing — so that cost cannot be
   * expressed geometrically, and without it a well-timed block strictly
   * dominates the dig (measured: blocking every attack won 10-0 against 3-0 for
   * digging, at every timing window I tried). A cooldown is the honest
   * stand-in: the block is a resource you spend, not a default you hold.
   */
  let blockCooldown = 0;
  /** Aces' energy gauge, per side. [hero, opponent]. */
  let energy: [number, number] = [0, 0];
  /** Rackets left. Lose them all and the match ends there, mid-set. */
  let rackets: [number, number] = [RACKETS, RACKETS];
  /** Is the ball in flight a Zone Shot? It answers differently to everything. */
  let incomingZone = false;
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
    if (o.energy) {
      ctx.setHud({
        energy: Math.round(energy[0]),
        rackets: `${rackets[0]}/${RACKETS}`,
        foeRackets: `${rackets[1]}/${RACKETS}`,
      });
    }
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
    if (o.energy) {
      energy[side] = Math.min(ENERGY_MAX, energy[side] + ENERGY_RALLY_WON);
    }
    const result = tennisScore ? tennisScore.award(side) : volleyScore!.award(side);
    pushHud(ctx);
    SoundKit.play(side === 0 ? 'score' : 'miss');
    // L4: they react to the point, or they are set dressing. Louder for the
    // home side, which is what a crowd at a beach court actually does.
    crowd?.cheer(side === 1 ? 1 : 0.35);

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
  function launch(
    _ctx: ModeContext, from: Vector3, toSide: -1 | 1, aim: number, q: SwingQuality,
    // NOT named `shot`: the module already has `let shot: Shot | null` for the
    // ball in flight, and shadowing it here made `shot = planned` assign to the
    // parameter instead of the flight state.
    touch?: VolleyTouch, tennisShot?: TennisShot, zone = false,
  ): boolean {
    const planned = planShot(o.cfg, { x: from.x, y: from.y, z: from.z }, toSide, aim, q, touch, tennisShot);
    if (!planned) return false;

    const fault: RallyFault | null = judgeShot(o.cfg, planned);
    shot = planned;
    flightT = 0;
    contactArmed = false;
    incomingTouch = touch;
    incomingZone = zone;
    blockSpent = false;
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
    let q: SwingQuality = roll > o.aiSkill ? 'miss'
      : roll > o.aiSkill * 0.75 ? 'late'
      : roll > o.aiSkill * 0.45 ? 'good' : 'perfect';

    // A bump and a set are routine CONTROL touches. Errors in volleyball happen
    // on the attack and the serve-receive, not on the second ball -- and the
    // miss roll is per touch, so making the opponent play three of them
    // multiplied their error rate per rally by three. Measured: a competitive
    // 4-5 became 5-0 and 4-0 with the player barely touching the ball. The
    // attack keeps the full roll, because that is where the risk belongs.
    const aiTouchPeek = volleyTouchFor(rally.touches + 1, o.cfg.touchesPerSide);
    if (q === 'miss' && aiTouchPeek !== 'spike') q = 'good';

    // A ZONE SHOT is the hardest ball in the mode to answer, and failing to
    // answer it costs a RACKET rather than only a point. That is the stake the
    // gauge buys, and it is what makes banking energy meaningful.
    if (o.energy && incomingZone) {
      if (q !== 'perfect') {
        rackets[1] = Math.max(0, rackets[1] - 1);
        pushHud(ctx);
        ctx.juice.flash('#FFD700', 220);
        SoundKit.play('impact', { pitch: 0.8, volume: 0.7 });
        if (rackets[1] === 0) {
          ended = true;
          flash(ctx, 'RACKET BROKEN — YOU WIN', 2500);
          ctx.end('WIN', tennisScore ? tennisScore.games[0] : 0, { rackets: rackets[0] });
          return;
        }
        awardPoint(ctx, 0, 'RACKET DAMAGE');
        return;
      }
      flash(ctx, 'THEY HELD IT', 700);
    }

    // An ATTACK is harder to dig than a floated ball. Without this the spike is
    // only cosmetically the payoff shot: it would look different and win points
    // at exactly the same rate as a lob, which is not what the benchmark's
    // sequence is for. Receiving one degrades the return by a step.
    if (incomingTouch === 'spike') {
      if (q === 'perfect') q = 'good';
      else if (q === 'good') q = 'late';
      else if (q === 'late' && Math.random() < 0.45) q = 'miss';
      if (q === 'miss') { awardPoint(ctx, 0, 'KILL — THEY COULD NOT DIG IT'); return; }
    }

    if (q === 'miss') { awardPoint(ctx, 0, 'THEY MISSED'); return; }

    // The opponent plays the same sequence the player does. Leaving them on a
    // one-touch return while the player has to build three would not be a
    // difficulty setting, it would be a different sport on each side of the net
    // -- and the three-touch limit would still never fire over there.
    const aiIsVolley = o.cfg.touchesPerSide > 1;
    const aiTouchNo = rally.touches + 1;
    const aiTouch = volleyTouchFor(aiTouchNo, o.cfg.touchesPerSide);
    const aiCrosses = volleyCrosses(aiTouch);

    if (rally.touch() === 'fault') { awardPoint(ctx, 0, 'FOUR TOUCHES'); return; }
    if (aiCrosses) rally.cross();

    foe.animator.play(o.swingClip, { onEnd: () => foe.animator.play(SPORT_CLIP.idle, { loop: true }) });
    SoundKit.play('uiTick', { pitch: 0.9, volume: 0.35 });
    EffectsKit.burst(ctx.scene, ball.getAbsolutePosition(), 'sparks');

    // The opponent plays the same economy. A gauge only one side can spend is a
    // handicap, not a mechanic.
    let aiZone = false;
    if (o.energy) {
      energy[1] = Math.min(ENERGY_MAX, energy[1] + (q === 'perfect' ? ENERGY_PERFECT : q === 'good' ? ENERGY_GOOD : 0));
      if (energy[1] >= ZONE_COST && (q === 'perfect' || q === 'good')) {
        aiZone = true;
        energy[1] = 0;
        flash(ctx, 'THEIR ZONE SHOT', 900);
        SoundKit.play('powerUp', { pitch: 1.2, volume: 0.6 });
        ctx.juice.flash('#FF3366', 200);
      }
    }
    // A self-pass on their side must NOT hand the human a swing window, which
    // is what toSide decides (awaitingHuman = toSide > 0).
    launch(ctx, ball.getAbsolutePosition(), aiCrosses ? 1 : -1, (Math.random() - 0.5) * 1.6, q, aiIsVolley ? aiTouch : undefined, undefined, aiZone);
  }

  /**
   * THE BLOCK — the defensive answer to an attack, and the last piece of the
   * benchmark's rally loop. It was meaningless while every touch was the same
   * hit; now that the attack exists and wins points, this is its counter-play.
   *
   * Real volleyball's rule is what makes it worth having: a block is NOT one of
   * your three touches, so stuffing an attack leaves your side a full rally
   * afterwards. Timing is graded the same way a swing is, so it is a read on
   * the attack rather than a button you hold.
   */
  function humanBlock(ctx: ModeContext): void {
    if (o.cfg.touchesPerSide <= 1) return;          // tennis has no such thing
    if (!shot || !awaitingHuman || blockSpent) return;
    if (blockCooldown > 0) {
      ctx.setHud({ shotType: 'NOT SET AT THE NET' });
      setTimeout(() => ctx.setHud({ shotType: '' }), 450);
      return;
    }
    if (incomingTouch !== 'spike') return;          // you cannot block a dig
    blockSpent = true;
    blockCooldown = BLOCK_COOLDOWN_SEC;

    const dt = (flightT - 1) * shot.duration;
    const q = gradeSwing(dt);
    const at = ball.getAbsolutePosition();
    // A stuff demands a tighter read than a perfect swing does — see
    // BLOCK_STUFF_WINDOW. Anything less good touches the ball back into play.
    const stuffed = Math.abs(dt) <= BLOCK_STUFF_WINDOW;

    if (q === 'miss' || q === 'late') {
      // Jumped early or arrived under it — the attack goes through, and it goes
      // through BEHIND you. Committing to the block spends your contact: you do
      // not get to dig the same ball you just jumped at.
      //
      // Without that cost the block is free, and free is not a decision — the
      // driver simply blocked every incoming ball, because every ball that
      // crosses is the opponent's third touch and therefore an attack. The
      // choice the mode wants is dig (safe, builds your own attack) against
      // block (reads the spike, wins the point outright, loses it if you are
      // wrong).
      awaitingHuman = false;
      ctx.setHud({ shotType: 'BLOCK MISSED' });
      setTimeout(() => ctx.setHud({ shotType: '' }), 500);
      SoundKit.play('uiTick', { pitch: 0.7, volume: 0.3 });
      return;
    }
    if (q === 'early') {
      // NET TOUCH (Phase 6, 2026-09-03, the sign-off's carry-forward). An
      // early jump into the net is the real game's fault, and it was also a
      // bug: 'early' fell past the miss/late branch and landed in the STUFF
      // branch, so jumping too soon was rewarded with the point.
      awaitingHuman = false;
      shot = null;
      ctx.setHud({ shotType: 'NET TOUCH' });
      SoundKit.play('uiTick', { pitch: 0.6, volume: 0.35 });
      awardPoint(ctx, 1, 'NET TOUCH');
      return;
    }

    // A GOOD block is not a stuff. It touches the ball and puts it back over
    // as a free ball, so the rally continues from a position you have earned
    // rather than ending. Only a PERFECT read stuffs it for the point.
    //
    // Both halves are needed. With every successful block ending the rally the
    // play was dominant -- blocking every incoming attack won 10-0 -- and with
    // none of them ending it (the earlier inverted-award version) it looked
    // punishing for the wrong reason. This is the shape the benchmark has: a
    // read that is worth making and hard to make.
    if (!stuffed && (q === 'good' || q === 'perfect')) {
      me.animator.play(o.swingClip, { onEnd: () => me.animator.play(SPORT_CLIP.idle, { loop: true }) });
      EffectsKit.burst(ctx.scene, at, 'sparks');
      ctx.setHud({ shotType: 'BLOCK · TOUCH' });
      setTimeout(() => ctx.setHud({ shotType: '' }), 500);
      SoundKit.play('uiTick', { pitch: 1.2, volume: 0.45 });
      rally.cross();
      // A FREE BALL, not an attack. This launched a 'spike', which is the
      // hardest shot in the mode to dig -- so merely touching a block was
      // nearly as good as stuffing one, and blocking still beat digging 10-0.
      // A deflection off a block is a soft ball they get to build on.
      launch(ctx, at, -1, 0, 'late');
      return;
    }

    // A stuff: straight back down on their side, and the point.
    me.animator.play(o.swingClip, { onEnd: () => me.animator.play(SPORT_CLIP.idle, { loop: true }) });
    EffectsKit.burst(ctx.scene, at, 'sparks');
    ctx.juice.scorePop(at, 'STUFF!', '#00E5FF');
    ctx.feel.impact(0.5);
    ctx.juice.shake(0.16, 140);
    SoundKit.play('impact', { pitch: 1.35, volume: 0.6 });
    shot = null;
    // SIDE 0 IS THE HERO. This read `1` — so every successful stuff handed the
    // point to the opponent, which is the reverse of what a block is for. It
    // also corrupted the balance reading it was measured with: "blocking
    // everything loses 2-8" was partly this bug, not the risk model.
    awardPoint(ctx, 0, 'STUFF BLOCK');
  }

  /** The human's swing. Called on the action edge. */
  function humanSwing(ctx: ModeContext): void {
    if (!shot || !awaitingHuman) return;
    // dt vs the ideal contact moment, which is the end of the flight
    const dt = (flightT - 1) * shot.duration;
    const q = gradeSwing(dt);

    if (q === 'miss') return;                       // early flail; not a fault yet

    // WHICH touch this is decides what the swing DOES. Previously every human
    // swing called rally.cross(), and cross() zeroes the touch counter, so the
    // three-touch limit could never fire and all three touches were the same
    // shot sent over the net. Bump and set now stay on your own side and hand
    // you the next contact; only the spike crosses.
    // Only a MULTI-touch sport gets the bump/set/spike shaping. volleyTouchFor
    // returns 'spike' for touchesPerSide 1, which is correct for "this touch
    // crosses" and would be quietly wrong if it also reshaped the shot: tennis
    // would start every ball above the net on a flat arc. Tennis keeps the
    // original planShot behaviour by passing no touch at all.
    const isVolley = o.cfg.touchesPerSide > 1;
    const touchNo = rally.touches + 1;
    const touchKind = volleyTouchFor(touchNo, o.cfg.touchesPerSide);
    const crosses = volleyCrosses(touchKind);

    if (rally.touch() === 'fault') { awardPoint(ctx, 1, 'TOO MANY TOUCHES'); return; }
    if (crosses) rally.cross();

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
    // Name the touch. In a three-touch sport the player has to know which one
    // they are about to play, and the difference between a set and a spike is
    // the difference between building the point and winning it.
    const label = o.cfg.touchesPerSide > 1
      ? `${touchKind.toUpperCase()} · ${q.toUpperCase()}`
      : `${pendingShot.toUpperCase()} · ${q.toUpperCase()}`;
    ctx.setHud({ shotType: label, touch: o.cfg.touchesPerSide > 1 ? `${touchNo}/${o.cfg.touchesPerSide}` : '' });
    setTimeout(() => ctx.setHud({ shotType: '' }), 500);
    if (touchKind === 'spike' && q === 'perfect') {
      SoundKit.play('impact', { pitch: 1.2, volume: 0.6 });
      ctx.juice.shake(0.14, 130);
    }
    // Holding THEIR Zone Shot is the same test in reverse: anything short of a
    // perfect read costs you a racket, and the third one ends the match on the
    // spot rather than on the scoreboard.
    if (o.energy && incomingZone && q !== 'perfect') {
      rackets[0] = Math.max(0, rackets[0] - 1);
      pushHud(ctx);
      ctx.juice.flash('#FF3366', 240);
      SoundKit.play('impact', { pitch: 0.7, volume: 0.7 });
      if (rackets[0] === 0) {
        ended = true;
        flash(ctx, 'YOUR RACKET IS GONE', 2500);
        ctx.end('LOSS', tennisScore ? tennisScore.games[0] : 0, { rackets: 0 });
        return;
      }
      awardPoint(ctx, 1, 'RACKET DAMAGE');
      return;
    }

    // ENERGY. Earned by hitting the ball well — which is the same skill the
    // mode already grades, so the gauge rewards what it is teaching.
    let zone = false;
    if (o.energy) {
      energy[0] = Math.min(ENERGY_MAX, energy[0] + (q === 'perfect' ? ENERGY_PERFECT : q === 'good' ? ENERGY_GOOD : 0));
      // A ZONE SHOT is the DRIVE at a full gauge. Binding it to one shot rather
      // than firing automatically is what keeps it a decision: play a slice, a
      // drop or a lob at full energy and you are choosing to bank it.
      if (pendingShot === 'drive' && energy[0] >= ZONE_COST && (q === 'perfect' || q === 'good')) {
        zone = true;
        energy[0] = 0;
        flash(ctx, 'ZONE SHOT', 900);
        SoundKit.play('powerUp', { pitch: 1.5, volume: 0.6 });
        ctx.juice.shake(0.2, 160);
        ctx.feel.impact(0.6);
      }
      ctx.setHud({ energy: Math.round(energy[0]) });
    }

    launch(ctx, swingPos, crosses ? -1 : 1, aimX, q,
      isVolley ? touchKind : undefined,
      isVolley ? undefined : pendingShot, zone);
  }

  return {
    modeId: o.modeId,
    mood: 'goldenHour',
    camPreset: 'hoops',

    async load(ctx: ModeContext) {
      venue = mountVenue(ctx, o.venueId, { keepGameplayCamera: true });   // M104 gap: tennis and volleyball rendered through the venue orbit camera — the hero sat at 44 px, cut off at the frame's bottom

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
      void dressBall(ball, ballKindFor(o.ballDiameter));   // Meshy ball skin (visual only; volleyball keeps its sphere)
      EffectsKit.ballTrail(ctx.scene, ball);
      SoundKit.startAmbient(o.ambient);
      if (o.crowd) {
        // Down both sidelines, derived from THIS court rather than hardcoded:
        // volleyball and tennis are very different sizes, and a fixed offset
        // that clears one sits inside the other. Always outside halfWidth, so
        // nobody stands anywhere a ball can legally land.
        const sideX = o.cfg.halfWidth + 3;
        const spread = o.cfg.halfLength * 0.62;
        const spots: Vector3[] = [];
        for (let i = 0; i < 12; i++) {
          const t = (i % 6) / 5;                       // 0..1 along the sideline
          spots.push(new Vector3(i < 6 ? -sideX : sideX, 0, -spread + t * spread * 2 + (i % 2) * 0.6));
        }
        crowd = new Onlookers(ctx.scene, spots, '#3E5A70');
      }

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
      // In a ONE-touch sport the four face buttons are the four SHOTS: which
      // button you swing with is the shot you play, decided under the same time
      // pressure as the timing. In a multi-touch sport (volleyball) B is the
      // block instead, because there the vocabulary lives in the touch order.
      if (e.t === 'button' && e.pressed && o.cfg.touchesPerSide <= 1) {
        if (e.btn === 'A') { pendingShot = 'drive'; humanSwing(_ctx); }
        if (e.btn === 'B') { pendingShot = 'slice'; humanSwing(_ctx); }
        if (e.btn === 'X') { pendingShot = 'drop'; humanSwing(_ctx); }
        if (e.btn === 'Y') { pendingShot = 'lob'; humanSwing(_ctx); }
      } else if (e.t === 'button' && e.pressed) {
        if (e.btn === 'A') humanSwing(_ctx);
        if (e.btn === 'B') humanBlock(_ctx);
      }
    },

    update(ctx: ModeContext, dt: number) {
      if (ended) return;

      if (restSec > 0) {
        restSec -= dt;
        if (restSec <= 0) serve(ctx);
        return;
      }
      crowd?.update(dt);
      if (blockCooldown > 0) blockCooldown = Math.max(0, blockCooldown - dt);
      if (!shot) return;

      flightT += dt / shot.duration;
      const p = shotAt(shot, flightT);
      ball.position.set(p.x, p.y, p.z);

      // Arm the swing window once the ball is on its way in.
      if (!contactArmed && flightT > 0.55) contactArmed = true;

      // A REAL METER. This published `shotMeterT: 1` the moment the window
      // armed and 0 on landing -- a boolean wearing a meter's name. Nothing
      // rendered it (the basketball hosts publish a genuine ramp and draw a
      // bar; the timing host draws nothing), so a mode graded on contact
      // timing offered the player no timing cue at all, and no automated
      // driver could time a swing either: flights differ per touch, so a fixed
      // delay is wrong for all of them (bump 1.56s, set 1.88s, spike 0.88s).
      // Ramp it across the window, contact at 1.
      if (contactArmed && awaitingHuman) {
        ctx.setHud({
          shotMeterT: Math.max(0, Math.min(1, (flightT - 0.55) / 0.45)),
          // Tell the receiver an ATTACK is coming. You cannot decide to block
          // something you were not shown, and the block is a read on the spike
          // rather than a button you can hold down.
          incoming: o.cfg.touchesPerSide > 1 && incomingTouch === 'spike' ? 'SPIKE' : '',
        });
      }

      if (flightT < 1) return;

      // The flight has landed.
      ctx.setHud({ shotMeterT: 0, incoming: '' });
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
      crowd?.dispose(); crowd = null;
      venue?.dispose(); venue = null;
      me?.dispose(); foe?.dispose();
      SoundKit.stopAmbient();
      shot = null; ended = true;
    },
  };
}

// HUD fields used: score, foeScore, callout (game score text — "40-30",
// "DEUCE", or "12 – 9"), banner, shotType, shotMeterT.
