// FootballRushMode v5 — REPLACES the M45 file. The street-football feel
// pass (mechanics reference: NFL Street's truck/juke-string game — original
// implementation). Two additions on top of everything M45 shipped
// (breakaway, coins, flanker AI, map-size fixes — all kept):
//   TRUCK — hold the trigger to lower the shoulder (0.5s window, 2.5s
//     cooldown). Contact during the window doesn't tackle you — it knocks
//     the DEFENDER down: they take the fall clip, you barrel through with a
//     brief speed dip, +30 pts. High commitment (you steer worse while
//     trucking) but it beats a tackle head-on — the missing power answer to
//     the existing finesse answers (jukes/spin/hurdle).
//   STYLE CHAIN — stringing DIFFERENT evade types in one drive (juke →
//     spin → hurdle → truck) pays a stacking style bonus per new type.
//     Spamming one move pays base; variety pays double-plus — the same
//     "style over yardage" scoring philosophy street football ran on.
// Touch deck note: TRUCK takes SPIN's slot on the touch overlay (4-button
// budget); SPIN stays available on keyboard (B). See modeVerbs v4.

import { Vector3 } from '@babylonjs/core';
import { CharacterLibrary, type SpawnedCharacter } from '../core/CharacterLibrary';
import { Mob, MobPool, STEERING_PRESETS } from '../core/MobSteering';
import { CoinField } from '../core/Pickups';
import { neverBindPose } from '../anim/importSanitizer';
import { installSafePlay, SPORT_CLIP } from '../anim/clipRegistry';
import { assertSpawned } from '../core/FrameGuard';
import { SoundKit } from '../audio/SoundKit';
import { EffectsKit } from '../visual/EffectsKit';
import { VenueKit } from '../visual/VenueKit';
import type { ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import { FOOTBALL_CONFIG as CFG } from './modeConfigs';
import { FootballGame, type DriveOutcome } from '@/lib/sports/match/football-game';

const FIELD_HALF_X = 9;
// MAP-SIZE FIX (M44): FIELD_LENGTH matches the real 90-unit venue.
const FIELD_LENGTH = 40;
const DEFENDER_MAX_DEPTH = 22;
const BREAKAWAY_THRESHOLD = 3;
const BREAKAWAY_SPEED_MULT = 1.25;
const BREAKAWAY_SEC = 4;
const TRUCK_WINDOW_SEC = 0.5;
const TRUCK_COOLDOWN_SEC = 2.5;
const TRUCK_PTS = 30;
const STYLE_CHAIN_PTS = 25;                    // per NEW evade type in a drive
const DODGES = {
  X: { gesture: 'footballJukeLeft' as const,  dx: -3.2, iframes: 0.45, pts: 15 },
  Y: { gesture: 'footballJukeRight' as const, dx: 3.2,  iframes: 0.45, pts: 15 },
  B: { gesture: 'footballSpin' as const,      dx: 0,    iframes: 0.6,  pts: 25 },
  A: { gesture: 'footballHurdle' as const,    dx: 0,    iframes: 0.5,  pts: 20 },
} as const;

export const FootballRushMode: ModeDefinition = (() => {
  let runner: SpawnedCharacter;
  let pool = new MobPool();
  let defenders: Mob[] = [];
  let coins: CoinField | null = null;
  let down = 1, toGo = 10, lineOfScrimmage = 0, yards = 0, score = 0, evades = 0;
  // The game above the drive: both sides get the same number of possessions,
  // drives resolve into real points, and the scoreboard decides it. Before
  // this a touchdown just started another drive and the session only ended
  // when the player finally failed on downs — nothing to win or lose.
  let match: FootballGame;
  const POSSESSIONS = 3;
  /** Points the opponent's answering drive tends to produce. TUNE(elijah). */
  const OPPONENT_DRIVE: { outcome: DriveOutcome; weight: number }[] = [
    { outcome: 'touchdown', weight: 0.32 },
    { outcome: 'field-goal', weight: 0.28 },
    { outcome: 'punt', weight: 0.25 },
    { outcome: 'downs', weight: 0.15 },
  ];
  let driveEvades = 0, breakawaySec = 0;
  let iframeSec = 0, dodging = false, ended = false;
  let truckSec = 0, truckCooldown = 0, trucks = 0;
  let styleTypes = new Set<string>();          // evade types used this drive
  let lastDodgeType = '';                      // which move earned the current iframes
  let stickX = 0, stickY = 0;

  function layCoins(ctx: ModeContext, fromZ: number): void {
    coins?.dispose();
    coins = new CoinField(ctx.scene);
    const toZ = Math.min(FIELD_LENGTH - 2, fromZ + 24);
    coins.line(new Vector3(-3, 0.4, fromZ + 4), new Vector3(3, 0.4, toZ), 8);
  }

  /** Variety pay: first use of each evade TYPE in a drive stacks a bonus. */
  function styleCredit(ctx: ModeContext, type: string): void {
    if (styleTypes.has(type)) return;
    styleTypes.add(type);
    if (styleTypes.size >= 2) {
      const bonus = STYLE_CHAIN_PTS * (styleTypes.size - 1);
      score += bonus;
      SoundKit.play('uiTick', { pitch: 1 + styleTypes.size * 0.15 });
      ctx.setHud({ score, banner: `STYLE CHAIN x${styleTypes.size} +${bonus}` });
      setTimeout(() => ctx.setHud({ banner: '' }), 700);
    }
  }

  async function spawnDefense(ctx: ModeContext): Promise<void> {
    for (const mob of defenders) mob.char.dispose();
    defenders = [];
    pool = new MobPool();

    const progress = Math.max(0, runner.root.position.z);
    const count = Math.min(3 + Math.floor(progress / (FIELD_LENGTH / 3)), 6);
    const remaining = Math.max(6, FIELD_LENGTH - progress);
    for (let i = 0; i < count; i++) {
      const lane = ((i * 2 + down) % 5) - 2;
      const rawDepth = 6 + i * 5 + (i % 2) * 3;
      const depth = Math.min(rawDepth, DEFENDER_MAX_DEPTH, remaining * 0.85);
      const char = await CharacterLibrary.spawn(ctx.scene, CFG.heroUrl, {
        position: new Vector3(lane * 3.4, 0, runner.root.position.z + depth),
        yawRad: Math.PI,
        tint: i % 2 ? '#8b1e2d' : '#5a1220',
        startClip: SPORT_CLIP.idle,
      });
      neverBindPose(char.animator, SPORT_CLIP.idle);
      installSafePlay(char.animator, 'football-defender');
      ctx.groundLock?.track(char.root, char.skeleton);
      const archetype = i % 3 === 2 ? 'flanker' : 'defender';
      const mob = new Mob(char, STEERING_PRESETS[archetype]);
      mob.startPursuit();
      pool.add(mob);
      defenders.push(mob);
    }
  }

  function hudLine(ctx: ModeContext, extra: Record<string, unknown> = {}): void {
    const p = match.progress();
    ctx.setHud({ score: match.points[0], foeScore: match.points[1], callout: p.line, possession: p.detail, ...extra });
  }

  /**
   * The opponent's answering possession. Their drive is a resolved beat rather
   * than a second minigame, but the points are real and can lose the game.
   */
  function opponentDrive(ctx: ModeContext): void {
    hudLine(ctx, { banner: 'THEIR BALL…' });
    setTimeout(() => {
      if (ended) return;
      let roll = Math.random();
      let outcome: DriveOutcome = 'punt';
      for (const o of OPPONENT_DRIVE) {
        if (roll < o.weight) { outcome = o.outcome; break; }
        roll -= o.weight;
      }
      const result = match.resolveDrive(outcome);
      SoundKit.play(outcome === 'touchdown' ? 'crowdGroan' : outcome === 'field-goal' ? 'uiTick' : 'whistle');
      hudLine(ctx, {
        banner: outcome === 'touchdown' ? 'THEY SCORE — TD' : outcome === 'field-goal' ? 'THEY KICK A FIELD GOAL' : 'THEY GO NOWHERE',
      });
      setTimeout(() => {
        if (ended) return;
        if (result === 'game') { finishGame(ctx); return; }
        newDrive(ctx, match.inOvertime ? 'OVERTIME — YOUR BALL' : 'YOUR BALL');
      }, 1400);
    }, 1000);
  }

  /** Hand the drive that just ended to the game, then take the next step. */
  function endDrive(ctx: ModeContext, outcome: DriveOutcome): void {
    const result = match.resolveDrive(outcome);
    hudLine(ctx);
    if (result === 'game') { finishGame(ctx); return; }
    setTimeout(() => { if (!ended) opponentDrive(ctx); }, 1200);
  }

  function finishGame(ctx: ModeContext): void {
    ended = true;
    SoundKit.play('whistle');
    const p = match.progress();
    SoundKit.play(p.winner === 0 ? 'crowdCheer' : 'crowdGroan');
    hudLine(ctx, { banner: p.detail });
    // Numbers only in `stats`; the readable final rides the outcome string,
    // the same convention as the mode's old TURNOVER_ON_DOWNS.
    ctx.end(`GAME_${p.winner === 0 ? 'WON' : p.winner === 1 ? 'LOST' : 'TIED'}_${match.points[0]}_${match.points[1]}`,
      p.score + score, {
        points: match.points[0],
        allowed: match.points[1],
        yards, evades, trucks,
        coinsCollected: coins?.collected ?? 0,
        overtime: match.inOvertime ? 1 : 0,
      });
  }

  function newDrive(ctx: ModeContext, banner: string): void {
    down = 1; toGo = 10;
    lineOfScrimmage = 0; yards = 0; driveEvades = 0; breakawaySec = 0;
    styleTypes = new Set();
    truckSec = 0; truckCooldown = 0;
    runner.root.position.set(0, 0, 0);
    runner.root.rotation.y = 0;
    runner.animator.play(SPORT_CLIP.idle, { loop: true });
    ctx.camDirector.snapTo(runner.root.position, runner.root.position.add(new Vector3(0, 0, 12)));
    ctx.setHud({ down, toGo, banner, breakaway: false, truckReady: true });
    setTimeout(() => ctx.setHud({ banner: '' }), 1400);
    void spawnDefense(ctx);
    layCoins(ctx, 0);
  }

  return {
    modeId: 'football', mood: 'nightGame', camPreset: 'runner',

    async load(ctx: ModeContext) {
      VenueKit.buildGridiron(ctx.scene);
      runner = await CharacterLibrary.spawn(ctx.scene, CFG.heroUrl, {
        position: new Vector3(0, 0, 0), yawRad: 0, startClip: SPORT_CLIP.idle,
      });
      neverBindPose(runner.animator, SPORT_CLIP.idle);
      installSafePlay(runner.animator, 'football');
      ctx.groundLock?.track(runner.root, runner.skeleton);
      ctx.heroRef.current = runner.root;
      defenders = []; pool = new MobPool();
      score = 0; evades = 0; trucks = 0; ended = false; iframeSec = 0; dodging = false;
      match = new FootballGame({ possessions: POSSESSIONS });
      driveEvades = 0; breakawaySec = 0; truckSec = 0; truckCooldown = 0;
      ctx.camDirector.snapTo(runner.root.position, runner.root.position.add(new Vector3(0, 0, 12)));
      assertSpawned(ctx.scene, { hero: runner.root, minWorldMeshes: 6, modeId: 'football' });
      SoundKit.startAmbient('stadium');
      EffectsKit.ambient(ctx.scene, 'gridiron');
      newDrive(ctx, 'TAKE THE FIELD');
      ctx.setHud({ score: 0, yards: 0, evades: 0, hint: 'Juke, spin, hurdle — or HOLD TRUCK and run THROUGH them' });
    },

    onInput(ctx: ModeContext, e: FelInput) {
      SoundKit.unlock();
      if (e.t === 'stick' && e.side === 'L') { stickX = e.x; stickY = e.y; }

      // TRUCK — trigger hold, windowed + cooldown
      if (e.t === 'trigger' && e.side === 'R' && e.value > 0.5 && !ended
          && truckCooldown === 0 && truckSec === 0 && !dodging) {
        truckSec = TRUCK_WINDOW_SEC;
        truckCooldown = TRUCK_COOLDOWN_SEC;
        SoundKit.play('powerUp', { pitch: 0.8, volume: 0.4 });
        runner.animator.play(SPORT_CLIP.moveLoop, { loop: true });
        ctx.setHud({ truckReady: false, banner: 'TRUCK!' });
        setTimeout(() => ctx.setHud({ banner: '' }), 400);
      }

      if (e.t === 'button' && e.pressed && !dodging && !ended) {
        const d = DODGES[e.btn as keyof typeof DODGES];
        if (!d) return;
        dodging = true;
        iframeSec = d.iframes;
        lastDodgeType = e.btn === 'B' ? 'spin' : e.btn === 'A' ? 'hurdle' : 'juke';
        SoundKit.play('whoosh', { pitch: 1.15 });
        runner.animator.play(SPORT_CLIP[d.gesture], { onEnd: () => { dodging = false; } });
        if (d.dx) runner.root.position.x = Math.max(-FIELD_HALF_X, Math.min(FIELD_HALF_X, runner.root.position.x + d.dx));
        ctx.feel?.impact?.(0.12);
      }
    },

    update(ctx: ModeContext, dt: number) {
      if (ended) return;
      iframeSec = Math.max(0, iframeSec - dt);
      breakawaySec = Math.max(0, breakawaySec - dt);
      truckSec = Math.max(0, truckSec - dt);
      const cooldownWas = truckCooldown;
      truckCooldown = Math.max(0, truckCooldown - dt);
      if (cooldownWas > 0 && truckCooldown === 0) ctx.setHud({ truckReady: true });
      if (breakawaySec === 0) ctx.setHud({ breakaway: false });

      const boost = breakawaySec > 0 ? BREAKAWAY_SPEED_MULT : 1;
      const trucking = truckSec > 0;
      const speed = (5.5 + Math.max(0, -stickY) * 2.5) * boost * (trucking ? 1.08 : 1);
      // lowered shoulder = committed line: lateral control drops while trucking
      const vel = new Vector3(stickX * (trucking ? 2 : 5) * boost, 0, speed);
      runner.root.position.addInPlace(vel.scale(dt));
      runner.root.position.x = Math.max(-FIELD_HALF_X, Math.min(FIELD_HALF_X, runner.root.position.x));
      if (!dodging) {
        runner.root.rotation.y = Math.atan2(vel.x, vel.z) * 0.5;
        runner.animator.play(SPORT_CLIP.moveLoop, { loop: true });
      }

      yards = Math.max(yards, Math.floor((runner.root.position.z - lineOfScrimmage) / 0.9144));
      ctx.setHud({ yards, evades });

      const gained = coins?.update(dt, runner.root.position) ?? 0;
      if (gained > 0) {
        score += gained * 5;
        SoundKit.play('uiTick', { pitch: 1.4 });
        ctx.setHud({ score, coins: coins?.collected ?? 0 });
      }

      const contacts = pool.update(dt, runner.root.position, vel);
      for (const mob of contacts) {
        // TRUCK RESOLUTION — the defender goes down, not you
        if (truckSec > 0) {
          trucks++; evades++; driveEvades++;
          score += TRUCK_PTS * (breakawaySec > 0 ? 2 : 1);
          mob.onContactResolved();
          mob.char.animator.play(SPORT_CLIP.footballTackled, {});
          ctx.feel?.impact?.(0.55);
          SoundKit.play('impact', { pitch: 0.6, volume: 0.6 });
          EffectsKit.burst(ctx.scene, mob.char.root.position.add(new Vector3(0, 0.8, 0)), 'dust');
          ctx.setHud({ score, banner: 'TRUCKED!' });
          setTimeout(() => ctx.setHud({ banner: '' }), 600);
          styleCredit(ctx, 'truck');
          if (driveEvades >= BREAKAWAY_THRESHOLD && breakawaySec <= 0) {
            breakawaySec = BREAKAWAY_SEC;
            SoundKit.play('powerUp');
            ctx.setHud({ banner: 'BREAKAWAY!', breakaway: true });
            setTimeout(() => ctx.setHud({ banner: '' }), 900);
          }
          continue;
        }
        if (iframeSec > 0) {
          evades++; driveEvades++;
          const mult = breakawaySec > 0 ? 2 : 1;
          score += 20 * mult;
          mob.onContactResolved();
          ctx.feel?.impact?.(0.3);
          SoundKit.play('impact', { pitch: 1.3, volume: 0.35 });
          styleCredit(ctx, lastDodgeType || 'juke');   // credit the move that earned these iframes
          if (driveEvades >= BREAKAWAY_THRESHOLD && breakawaySec <= 0) {
            breakawaySec = BREAKAWAY_SEC;
            SoundKit.play('powerUp');
            ctx.setHud({ banner: 'BREAKAWAY!', breakaway: true });
            setTimeout(() => ctx.setHud({ banner: '' }), 900);
          } else {
            ctx.setHud({ banner: 'EVADED!', score });
            setTimeout(() => ctx.setHud({ banner: '' }), 500);
          }
          continue;
        }
        ctx.feel?.impact?.(0.7);
        SoundKit.play('impact', { pitch: 0.8 });
        EffectsKit.burst(ctx.scene, runner.root.position.add(new Vector3(0, 0.6, 0)), 'dust');
        runner.animator.play(SPORT_CLIP.footballTackled, {});
        driveEvades = 0; breakawaySec = 0;
        const gainedY = yards;
        if (gainedY >= toGo) {
          down = 1; toGo = 10;
          lineOfScrimmage = runner.root.position.z;
          ctx.setHud({ down, toGo, banner: 'FIRST DOWN!' });
        } else {
          down++;
          toGo -= gainedY;
          if (down > 4) {
            // Failing on downs now costs you the POSSESSION, not the session.
            SoundKit.play('whistle');
            ctx.setHud({ banner: 'TURNOVER ON DOWNS' });
            mob.onContactResolved();
            endDrive(ctx, 'downs');
            return;
          }
          ctx.setHud({ down, toGo, banner: `TACKLED — DOWN ${down}` });
        }
        mob.onContactResolved();
        setTimeout(() => {
          ctx.setHud({ banner: '' });
          runner.root.position.x = 0;
          void spawnDefense(ctx);
        }, 1000);
        yards = 0;
        lineOfScrimmage = runner.root.position.z;
      }

      if (runner.root.position.z >= FIELD_LENGTH) {
        const mult = breakawaySec > 0 ? 1.5 : 1;
        score += Math.round((100 + evades * 10) * mult);
        runner.animator.play(SPORT_CLIP.scoreCelebrate, {
          onEnd: () => runner.animator.play(SPORT_CLIP.idle, { loop: true }),
        });
        ctx.feel?.impact?.(0.6);
        SoundKit.play('score');
        SoundKit.play('crowdCheer');
        EffectsKit.burst(ctx.scene, runner.root.position.add(new Vector3(0, 1.8, 0)), 'confetti');
        ctx.setHud({ banner: 'TOUCHDOWN!' });
        endDrive(ctx, 'touchdown');
      }

      ctx.camDirector.update(runner.root.position, vel, null);
    },

    dispose() {
      runner?.dispose();
      for (const mob of defenders) mob.char.dispose();
      defenders = [];
      coins?.dispose();
      SoundKit.stopAmbient();
    },
  };
})();

// HUD fields: down, toGo, yards, evades, score, coins, breakaway (bool),
// banner, hint — unchanged from M45 — plus NEW truckReady (bool; dim the
// TRUCK chip while false) and trucks in the end-of-session stats.
