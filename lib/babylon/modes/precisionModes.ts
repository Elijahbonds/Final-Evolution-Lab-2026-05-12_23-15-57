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
import { GolfRound, type RoundHole } from '@/lib/sports/match/golf-round';
import { SoccerShootout } from '@/lib/sports/match/soccer-shootout';
import { BaseballGame, type HitType } from '@/lib/sports/match/baseball-game';

const CLUTCH_MULT = 1.5;

// ════════════════════════════════════════════════════════════════ TENNIS ══
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
// Now plays a ROUND, not three proximity shots. The swing (3-click power +
// accuracy band), the hole preview flyover and the ball flight are unchanged —
// they were already proven. What changed is the structure around them:
// GolfRound (lib/sports/match/golf-round.ts) owns holes, strokes and the card,
// and crucially the ball is NO LONGER RESET TO THE TEE after every swing. A
// shot that finishes 30m short leaves you 30m short, and you play the next
// stroke from there. That is what makes a par mean something.
export const GolfMode: ModeDefinition = (() => {
  let me: SpawnedCharacter;
  let furniture: AbstractMesh[] = [];
  let ball: AbstractMesh, flight: Flight, reticle: Reticle, meter: PowerMeter;
  let holePos = new Vector3(0, 0, 55);
  let stickX = 0, stickY = 0;
  let phase: 'preview' | 'aim' | 'power' | 'accuracy' | 'flight' = 'aim';
  let previewSec = 0, power = 0;
  let ended = false;
  let card: GolfRound;
  const PREVIEW_SEC = 1.8;
  const ACCURACY_CENTER = 0.28;                  // wave value to hit on the way down
  const ACCURACY_HALF = 0.1;
  // Inside this radius the ball is holed. Putting is not a separate mechanic
  // here, so the green is generous on purpose — the skill being graded is
  // approach play, and a 1.2m gimme is honest about that rather than adding a
  // putting minigame this mode does not have.
  const HOLE_RADIUS = 1.2;

  /** A nine-hole card. Par sets both the yardage and the stroke budget. */
  const COURSE: RoundHole[] = [
    { id: 'g1', par: 4 }, { id: 'g2', par: 3 }, { id: 'g3', par: 5 },
    { id: 'g4', par: 4 }, { id: 'g5', par: 4 }, { id: 'g6', par: 3 },
    { id: 'g7', par: 5 }, { id: 'g8', par: 4 }, { id: 'g9', par: 4 },
  ];

  /** Pin distance from the tee, by par. A par 3 is one good swing away. */
  const PIN_DISTANCE: Record<number, number> = { 3: 30, 4: 46, 5: 62 };

  function hudLine(ctx: ModeContext, extra: Record<string, unknown> = {}): void {
    const p = card.progress();
    ctx.setHud({
      round: `H${Math.min(card.holeIndex + 1, COURSE.length)}/${COURSE.length}`,
      score: p.score,
      toPar: p.line,
      hole: p.detail,
      ...extra,
    });
  }

  function nextHole(ctx: ModeContext): void {
    const hole = card.hole;
    const holeNo = card.holeIndex + 1;
    // Lay the pin out from the tee: distance by par, offset seeded off the
    // hole number so the nine holes are distinct but deterministic.
    const lateral = ((holeNo * 53) % 21) - 10;
    holePos = new Vector3(lateral * 0.6, 0, PIN_DISTANCE[hole.par] ?? 46);
    furniture.forEach((f) => f.dispose());
    furniture = buildGolfGreen(ctx.scene, holePos);
    ball.position.set(0, 0.05, 0.6);
    me.animator.play(SPORT_CLIP.golfAddress, { loop: true });
    ctx.objectiveRef.current = holePos;
    // HOLE PREVIEW — fly the camera to the green, look back at the tee.
    // Pure camDirector.snapTo, timer-bounded, cannot stall.
    phase = 'preview'; previewSec = 0;
    ctx.camDirector.snapTo(holePos.add(new Vector3(0, 0, 3)), ball.position.add(new Vector3(0, 0.6, 0)));
    const finishing = holeNo === COURSE.length;
    hudLine(ctx, {
      power: 0, accuracy: '',
      hint: `HOLE ${holeNo} · PAR ${hole.par} · ${Math.round(Vector3.Distance(ball.position, holePos))}m${finishing ? ' — last hole' : ''}`,
    });
  }

  /** Address the ball where it actually lies and aim from there. */
  function addressBall(ctx: ModeContext): void {
    phase = 'aim';
    // Stand at the lie, facing the pin, so the swing camera frames the shot
    // the player is really about to play.
    const toPin = holePos.subtract(ball.position);
    me.root.position.set(ball.position.x - 0.5, 0, ball.position.z);
    me.root.rotation.y = Math.atan2(toPin.x, toPin.z);
    reticle.pos.copyFrom(ball.position.add(toPin.scale(0.6)).add(new Vector3(0, 1.3, 0)));
    ctx.camDirector.setFixedBehind(me.root.position, me.root.rotation.y, 'swing');
    const remaining = Math.round(Vector3.Distance(ball.position, holePos));
    hudLine(ctx, {
      hint: `${remaining}m to the pin · stroke ${card.strokes + 1} · SWING starts the meter`,
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
      ended = false;
      card = new GolfRound({ holes: COURSE });
      SoundKit.startAmbient('dojo');
      hudLine(ctx);
      nextHole(ctx);
    },

    onInput(ctx: ModeContext, e: FelInput) {
      SoundKit.unlock();
      if (e.t === 'stick' && e.side === 'L') { stickX = e.x; stickY = e.y; }
      if (e.t === 'button' && e.btn === 'A' && e.pressed) {
        if (phase === 'preview') { addressBall(ctx); return; }   // skip the flyover
        if (phase === 'aim') { phase = 'power'; meter.start(); ctx.setHud({ hint: 'SWING at the top for POWER' }); }
        else if (phase === 'power') {
          power = meter.value;                    // keep the wave running — accuracy rides it down
          phase = 'accuracy';
          SoundKit.play('uiTick', { pitch: 1.2 });
          ctx.setHud({ power: Math.round(power * 100), hint: 'NOW — strike in the accuracy band!' });
        } else if (phase === 'accuracy') {
          const err = Math.abs(meter.stop() - ACCURACY_CENTER);
          const clean = err <= ACCURACY_HALF;
          const sideErr = clean ? 0 : Math.min(1, (err - ACCURACY_HALF) * 3);
          phase = 'flight';
          SoundKit.play('whoosh', { pitch: 0.9 });
          me.animator.play(SPORT_CLIP.golfSwing, {});
          ctx.feel?.impact?.(0.25 + power * 0.35);
          const dir = reticle.pos.subtract(ball.position).normalize();
          // Scale the swing to what is left: a full-blooded drive from 4m past
          // the pin would make the round unplayable, so the shot is capped by
          // the distance remaining. Power still decides how much of it you get.
          const remaining = Vector3.Distance(ball.position, holePos);
          const reach = Math.min(14 + power * 21, remaining * (0.55 + power * 0.85) + 4);
          // a missed accuracy click hooks (early) or slices (late) the ball
          const hookSlice = new Vector3(sideErr * 6 * (Math.random() < 0.5 ? -1 : 1), 0, 0);
          flight.launch(ball.position, dir.scale(reach).add(new Vector3(0, 3 + power * 5, 0)).add(hookSlice));
          ctx.setHud({ accuracy: clean ? 'PURE' : sideErr > 0.5 ? 'SHANKED' : 'DRIFTED', hint: '' });
        }
      }
    },

    update(ctx: ModeContext, dt: number) {
      if (ended) return;
      meter.update(dt);
      if (phase === 'preview') {
        previewSec += dt;
        if (previewSec >= PREVIEW_SEC) addressBall(ctx);
        return;                                   // camera holds the green view
      }
      if (phase === 'power' || phase === 'accuracy') ctx.setHud({ power: Math.round(meter.value * 100) });
      if (phase === 'aim') reticle.update(dt, stickX, stickY);
      if (phase === 'flight') {
        const flying = flight.step(dt);
        ctx.camDirector.update(ball.position, flight.vel, holePos);
        if (!flying) {
          // The ball STAYS where it came to rest — the next stroke plays from
          // the lie. Only the vertical is settled onto the deck.
          ball.position.y = 0.05;
          const dist = Vector3.Distance(new Vector3(ball.position.x, 0, ball.position.z), holePos);
          const holed = dist <= HOLE_RADIUS;
          const par = card.hole.par;
          const result = card.stroke(holed);

          if (result === 'stroke') {
            SoundKit.play('uiTick');
            hudLine(ctx, { banner: `${dist.toFixed(1)}m to the pin` });
            setTimeout(() => { ctx.setHud({ banner: '' }); addressBall(ctx); }, 900);
            phase = 'aim';
            return;
          }

          // The hole is finished — card it and play the beat it earned.
          const holeScore = card.lastHole;
          const label = holeScore?.label ?? '';
          if (holed) {
            SoundKit.play('score');
            if (holeScore?.gameBreaker) {
              SoundKit.play('crowdCheer', { volume: 0.7 });
              ctx.feel?.impact?.(0.8);
            }
          } else {
            SoundKit.play('uiTick', { pitch: 0.7 });
          }
          const p = card.progress();
          hudLine(ctx, {
            banner: holed
              ? `${label} · ${holeScore?.strokes} on par ${par} · ${p.line}`
              : `PICKED UP · ${holeScore?.strokes} on par ${par}`,
          });

          setTimeout(() => {
            ctx.setHud({ banner: '' });
            if (result === 'round-complete') {
              ended = true;
              SoundKit.play('whistle');
              const done = card.progress();
              // `stats` is numbers only, so the human-readable card goes in the
              // outcome string — the same convention as TACKLED_17YD / WAVE_6.
              ctx.end(`CARD_IN_${card.totalStrokes}_${GolfRound.toParLabel(card.card.toPar)}`, done.score, {
                holes: COURSE.length,
                strokes: card.totalStrokes,
                toPar: card.card.toPar,
                frontNine: card.frontNine,
                backNine: card.backNine,
              });
              return;
            }
            nextHole(ctx);
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

// ═════════════════════════════════════════════════════════════ BALLGAME ══
// Was a home-run derby: swing at ten pitches, total the distance points. The
// swing, the pitch flight and the contact window are unchanged — they were
// already proven. What is new is the GAME: BaseballGame owns innings, outs and
// base runners, the opponent bats the top half, and the session ends on a
// final score that can be lost. Contact quality now decides what KIND of hit
// you got instead of how many points it was worth.
export const DerbyMode: ModeDefinition = (() => {
  let me: SpawnedCharacter, pitcher: SpawnedCharacter;
  let furniture: AbstractMesh[] = [];
  let ball: AbstractMesh, flight: Flight;
  let stickY = 0;
  let incoming = false, swung = false, ended = false;
  let game: BaseballGame;
  const INNINGS = 3;
  /** Contact quality needed for each hit. Anything under SINGLE is an out. */
  const HIT_TIERS: { q: number; type: HitType; call: string }[] = [
    { q: 0.92, type: 'homer', call: 'GONE!' },
    { q: 0.8, type: 'triple', call: 'TRIPLE — into the gap!' },
    { q: 0.66, type: 'double', call: 'DOUBLE off the wall' },
    { q: 0.45, type: 'single', call: 'BASE HIT' },
  ];
  /** Runs the opponent scores per half-inning at bat. TUNE(elijah). */
  const OPPONENT_RUN_CHANCE = 0.45;

  function hudLine(ctx: ModeContext, extra: Record<string, unknown> = {}): void {
    const p = game.progress();
    ctx.setHud({
      score: game.runs[0], foeScore: game.runs[1],
      round: p.detail, callout: p.line,
      bases: game.bases.map((b) => (b ? '●' : '○')).join(' '),
      ...extra,
    });
  }

  function pitch(ctx: ModeContext): void {
    swung = false; incoming = true;
    pitcher.animator.play(SPORT_CLIP.derbyPitch, { onEnd: () => pitcher.animator.play(SPORT_CLIP.idle, { loop: true }) });
    ball.position.set(0.2, 1.4, 17.5);
    // Pitches get quicker as the game goes on rather than as a counter climbs.
    flight.launch(ball.position, new Vector3(-0.1, 1.1, -14 - game.inning * 1.2));
    const closing = game.inning >= INNINGS && game.half === 'bottom';
    hudLine(ctx, {
      hint: closing ? 'LAST AT-BATS — STRIKE as it crosses the plate' : 'STRIKE as it crosses the plate',
    });
  }

  /**
   * The opponent's half. Their at-bats are a resolved beat rather than a
   * second minigame, but the runs are real and can lose the player the game.
   */
  function opponentHalf(ctx: ModeContext): void {
    ctx.setHud({ banner: 'THEY BAT…' });
    let closed: string = 'play';
    const swing = () => {
      if (ended) return;
      if (Math.random() < OPPONENT_RUN_CHANCE) {
        const r = game.hit(Math.random() < 0.25 ? 'homer' : 'single');
        closed = r.result;
        if (r.runs > 0) SoundKit.play('crowdGroan', { volume: 0.5 });
      } else {
        closed = game.out();
      }
      hudLine(ctx, { banner: closed === 'play' ? 'THEY BAT…' : '' });
      if (closed === 'game') { finish(ctx); return; }
      if (closed === 'play') { setTimeout(swing, 550); return; }
      // Their half is over — the player is up.
      setTimeout(() => { ctx.setHud({ banner: 'YOU BAT' }); setTimeout(() => { ctx.setHud({ banner: '' }); pitch(ctx); }, 700); }, 500);
    };
    setTimeout(swing, 800);
  }

  /**
   * One place decides what happens after any play resolves: keep batting, hand
   * the half over, or end the game. Every path through the at-bat funnels here
   * so a play can never leave the mode without a next step.
   */
  function afterPlay(ctx: ModeContext, closed: string): void {
    if (ended) return;
    ctx.setHud({ banner: '' });
    if (closed === 'game') { finish(ctx); return; }
    if (closed === 'play') { pitch(ctx); return; }
    // The player's half ended — the opponent bats the next top half.
    hudLine(ctx, { banner: closed === 'inning' ? `END ${game.inning - 1}` : 'SIDE RETIRED' });
    setTimeout(() => { if (!ended) opponentHalf(ctx); }, 900);
  }

  function finish(ctx: ModeContext): void {
    ended = true;
    SoundKit.play('whistle');
    const p = game.progress();
    SoundKit.play(p.winner === 0 ? 'crowdCheer' : 'crowdGroan');
    ctx.setHud({ banner: p.detail });
    // Numbers only in `stats`; the readable final rides the outcome string.
    ctx.end(`GAME_${p.winner === 0 ? 'WON' : p.winner === 1 ? 'LOST' : 'TIED'}_${game.runs[0]}_${game.runs[1]}`,
      p.score, {
        runs: game.runs[0],
        allowed: game.runs[1],
        innings: game.inning,
        walkOff: game.wonOnWalkOff ? 1 : 0,
      });
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
      ended = false;
      game = new BaseballGame({ innings: INNINGS });
      SoundKit.startAmbient('stadium');
      ctx.setHud({ score: 0, foeScore: 0 });
      // The player is the home side, so the opponent bats the top of the first.
      opponentHalf(ctx);
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
        const launch = 0.45 - stickY * 0.3;
        flight.launch(ball.position, new Vector3((Math.random() - 0.5) * 4, 18 * launch * q + 4, 16 + q * 18));

        // Contact quality now decides WHAT the hit was. Squaring one up is a
        // home run; a mishit is an out, which is what gives an at-bat stakes.
        const tier = HIT_TIERS.find((t) => q >= t.q);
        if (!tier) {
          SoundKit.play('miss', { pitch: 0.8 });
          const closed = game.out();
          hudLine(ctx, { banner: 'PUT OUT' });
          setTimeout(() => afterPlay(ctx, closed), 1000);
          return;
        }

        const { runs, result } = game.hit(tier.type);
        SoundKit.play('score', { pitch: tier.type === 'homer' ? 1.2 : 1 });
        if (runs > 0) SoundKit.play('crowdCheer', { volume: Math.min(0.8, 0.3 + runs * 0.2) });
        if (tier.type === 'homer') ctx.feel?.impact?.(0.8);
        hudLine(ctx, { banner: runs > 0 ? `${tier.call} ${runs} in` : tier.call });
        setTimeout(() => afterPlay(ctx, result), 1200);
      }
    },

    update(ctx: ModeContext, dt: number) {
      if (ended) return;
      flight.step(dt);
      // A pitch that crosses the plate unswung is a strikeout — an out, not a
      // free retry. This is the change that makes an at-bat cost something.
      if (incoming && ball.position.z <= -1.2) {
        incoming = false;
        SoundKit.play('miss');
        const closed = game.out();
        hudLine(ctx, { banner: swung ? 'SWING AND A MISS' : 'CALLED STRIKE' });
        setTimeout(() => afterPlay(ctx, closed), 1000);
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
  let stylePts = 0, stickX = 0, stickY = 0;
  let phase: 'aim' | 'power' | 'flight' = 'aim';
  let keeperTargetX = 0, ended = false;
  let feints = 0, lastFlickSign = 0, lastFlickMs = 0;
  // The shootout owns the structure: alternating kicks, an early clinch the
  // moment a side cannot be caught, and sudden death when the five are level.
  // The fixed five-kick counter this replaces could express none of that.
  let shootout: SoccerShootout;
  const TOTAL = 5;
  /** How often the opponent converts. TUNE(elijah) — a shade under a real
   *  shootout's ~75% so a clean player round is genuinely rewarded. */
  const OPPONENT_CONVERSION = 0.7;
  const MAX_FEINTS = 2;
  const FEINT_KEEPER_SHIFT = 0.12;               // each feint: keeper guesses wrong this much more
  const FEINT_WOBBLE = 0.25;                     // ...and the shot wobbles this much more
  const FEINT_STYLE_PTS = 8;                     // banked per feint, paid only on a goal

  function nextKick(ctx: ModeContext): void {
    phase = 'aim';
    feints = 0; lastFlickSign = 0;
    ball.position.set(0, 0.11, 0);
    keeper.root.position.set(0, 0, 10.4);
    keeper.animator.play(SPORT_CLIP.keeperIdle, { loop: true });
    me.animator.play(SPORT_CLIP.penaltyIdle, { loop: true });
    const p = shootout.progress();
    // "Must score" is now a real state, not a round number: it is true when a
    // miss hands the shootout to the opponent there and then.
    const mustScore = shootout.goals[1] > shootout.goals[0] + shootout.remaining(0) - 1;
    ctx.setHud({
      round: shootout.inSuddenDeath ? 'SUDDEN DEATH' : `${shootout.round}/${TOTAL}`,
      score: shootout.goals[0], foeScore: shootout.goals[1],
      callout: p.detail, feints: 0,
      hint: mustScore
        ? 'MUST SCORE — miss and it is over'
        : shootout.inSuddenDeath
          ? 'SUDDEN DEATH — score, or they win it'
          : 'Snap the stick side-to-side to FEINT (max 2) · aim · KICK twice',
    });
  }

  /**
   * The opponent's reply. The player's half of a shootout is the skill test;
   * the opponent's kick is a resolved beat, not a second minigame — but it is
   * a real kick that can win or lose the shootout.
   */
  function opponentKick(ctx: ModeContext): void {
    ctx.setHud({ banner: 'THEIR KICK…' });
    setTimeout(() => {
      if (ended) return;
      const scored = Math.random() < OPPONENT_CONVERSION;
      keeper.animator.play(SPORT_CLIP.keeperDive, {});
      SoundKit.play(scored ? 'crowdGroan' : 'score', { volume: 0.5 });
      const result = shootout.take(scored);
      const p = shootout.progress();
      ctx.setHud({
        score: shootout.goals[0], foeScore: shootout.goals[1],
        callout: p.detail,
        banner: scored ? 'THEY SCORE' : 'THEY MISS!',
      });
      setTimeout(() => {
        ctx.setHud({ banner: '' });
        if (result === 'shootout') { finish(ctx); return; }
        nextKick(ctx);
        ctx.camDirector.setFixedBehind(me.root.position, 0, 'flight');
      }, 1100);
    }, 900);
  }

  function finish(ctx: ModeContext): void {
    ended = true;
    SoundKit.play('whistle');
    const p = shootout.progress();
    SoundKit.play(p.winner === 0 ? 'crowdCheer' : 'crowdGroan');
    ctx.setHud({ banner: p.detail });
    // Numbers only in `stats`; the readable score line rides the outcome
    // string, the same convention as TACKLED_17YD / WAVE_6.
    ctx.end(`SHOOTOUT_${p.winner === 0 ? 'WON' : p.winner === 1 ? 'LOST' : 'LEVEL'}_${shootout.goals[0]}_${shootout.goals[1]}`,
      p.score + stylePts, {
        goals: shootout.goals[0],
        conceded: shootout.goals[1],
        stylePts,
        kicks: shootout.taken[0],
        suddenDeath: shootout.inSuddenDeath ? 1 : 0,
      });
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
      stylePts = 0; ended = false;
      shootout = new SoccerShootout({ rounds: TOTAL });
      SoundKit.startAmbient('stadium');
      ctx.setHud({ score: 0, foeScore: 0 });
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
          // A kick is "clutch" when the shootout turns on it, which the engine
          // knows and a round counter never did.
          const clutch = shootout.inSuddenDeath
            || shootout.goals[1] > shootout.goals[0] + shootout.remaining(0) - 1;
          if (scored) {
            stylePts += feints * FEINT_STYLE_PTS;
            ctx.feel?.impact?.(0.5);
            SoundKit.play('score');
            SoundKit.play('crowdCheer');
          } else {
            SoundKit.play(saved ? 'crowdGroan' : 'miss');
          }
          const result = shootout.take(scored);
          const p = shootout.progress();
          ctx.setHud({
            score: shootout.goals[0], foeScore: shootout.goals[1], callout: p.detail,
            banner: scored
              ? (feints > 0 ? `${clutch ? 'CLUTCH ' : ''}GOOOAL! +${feints * FEINT_STYLE_PTS} style` : clutch ? 'CLUTCH GOOOAL!' : 'GOOOAL!')
              : saved ? 'SAVED' : 'OFF TARGET',
          });
          setTimeout(() => {
            ctx.setHud({ banner: '' });
            if (result === 'shootout') { finish(ctx); return; }
            opponentKick(ctx);
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
