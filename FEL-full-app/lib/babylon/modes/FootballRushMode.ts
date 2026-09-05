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
import { mountVenue, type VenueHandle } from '../core/NexusVenue';
import { Onlookers } from '../visual/Onlookers';
import type { ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import { FOOTBALL_CONFIG as CFG } from './modeConfigs';

let rushVenue: VenueHandle | null = null;   // ship pass 4: the mounted venue spec, disposed with the mode

// MAP-SIZE FIX: VenueKit.buildGridiron widened from 22m to 44m to match a
// real field's sideline-to-sideline width — this clamp has to widen with it
// or the runner stays boxed into the old narrow corridor on a visually wider
// field.
const FIELD_HALF_X = 20;
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
  // Owner decision (2026-09-05): a session is THREE drives. Each ends on a touchdown or a turnover on downs; the
  // session ends after the third. Before this, a runner who kept gaining reset to first down forever and never posted.
  const DRIVES = 3; let drive = 1;
  let driveEvades = 0, breakawaySec = 0;
  let iframeSec = 0, dodging = false, ended = false;
  let truckSec = 0, truckCooldown = 0, trucks = 0;
  let styleTypes = new Set<string>();          // evade types used this drive
  let lastDodgeType = '';                      // which move earned the current iframes
  let stickX = 0, stickY = 0;
  /** L4 — sideline banks. A drive is watched; 2 draws, instanced. */
  let gallery: Onlookers | null = null;
  // PRE-SNAP — every play begins SET: the defense holds its alignment and
  // the ball snaps on the PLAYER's call (first forward push), auto-snapping
  // at 3s so an idle phone never stalls. The benchmark's lock justification
  // opens with "pre-snap reads" and the mode had none: the defense was live
  // before you could see it. The read is the snap's timing choice.
  let preSnap = true, preSnapT = 0;
  const PRESNAP_AUTOSNAP_SEC = 3;
  // PRE-SNAP DISGUISE (sign-off carry-forward, 2026-09-03): one defender SHOWS
  // blitz — creeping toward the line while the defense is set — and at the
  // snap either comes (a real blitz, fast) or drops back into coverage. The
  // alignment you read is no longer always the coverage you get; the read is
  // whether to snap into the show or wait it out.
  let showBlitz: Mob | null = null, showBlitzComes = false;
  const SHOW_BLITZ_CHANCE = 0.55, SHOW_BLITZ_CREEP = 0.9, SHOW_BLITZ_DROP_SEC = 0.8;

  function snap(ctx: ModeContext): void {
    if (!preSnap) return;
    preSnap = false;
    for (const m of defenders) {
      if (m === showBlitz && !showBlitzComes) {
        // the show was a bluff: he drops, and starts late
        m.char.root.position.z += 3.5;
        setTimeout(() => { if (!ended) m.startPursuit(); }, SHOW_BLITZ_DROP_SEC * 1000);
        continue;
      }
      m.startPursuit();
    }
    if (showBlitz) {
      ctx.setHud({ banner: showBlitzComes ? 'BLITZ!' : 'HE DROPPED — coverage' });
      setTimeout(() => ctx.setHud({ banner: '' }), 700);
    }
    SoundKit.play('uiTick', { pitch: 1.3, volume: 0.4 });
    ctx.setHud({ hint: 'Juke, spin, hurdle — or HOLD TRUCK and run THROUGH them', banner: 'BALL!' });
    setTimeout(() => ctx.setHud({ banner: '' }), 500);
  }

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
        // MAP-SIZE FIX: was *3.4, tuned for the old 22m-wide field — spread
        // to *8 so defenders use the width of the new 44m field instead of
        // bunching into its center third.
        position: new Vector3(lane * 8, 0, runner.root.position.z + depth),
        yawRad: Math.PI,
        tint: i % 2 ? '#8b1e2d' : '#5a1220',
        startClip: SPORT_CLIP.idle,
      });
      neverBindPose(char.animator, SPORT_CLIP.idle);
      installSafePlay(char.animator, 'football-defender');
      ctx.groundLock?.track(char.root, char.skeleton);
      const archetype = i % 3 === 2 ? 'flanker' : 'defender';
      const mob = new Mob(char, STEERING_PRESETS[archetype]);
      // NO pursuit yet — defenders stand in their alignment until the snap
      // (D1: the pre-snap read). startPursuit moves to snap().
      pool.add(mob);
      defenders.push(mob);
    }
    // one shown blitz per alignment, once the defense has more than a pair
    showBlitz = defenders.length >= 3 && Math.random() < 0.6 ? defenders[0] : null;
    showBlitzComes = Math.random() < SHOW_BLITZ_CHANCE;
  }

  function newDrive(ctx: ModeContext, banner: string): void {
    down = 1; toGo = 10;
    lineOfScrimmage = 0; yards = 0; driveEvades = 0; breakawaySec = 0;
    styleTypes = new Set();
    truckSec = 0; truckCooldown = 0;
    preSnap = true; preSnapT = 0;
    runner.root.position.set(0, 0, 0);
    runner.root.rotation.y = 0;
    runner.animator.play(SPORT_CLIP.idle, { loop: true });
    ctx.camDirector.snapTo(runner.root.position, runner.root.position.add(new Vector3(0, 0, 12)));
    ctx.setHud({ down, toGo, banner, breakaway: false, truckReady: true, drive: `${drive}/${DRIVES}` });
    setTimeout(() => ctx.setHud({ banner: '' }), 1400);
    void spawnDefense(ctx).then(() => {
      ctx.setHud({ hint: 'READ THE FRONT — push ▲/W to SNAP' });
    });
    layCoins(ctx, 0);
  }

  return {
    modeId: 'football', mood: 'nightGame', camPreset: 'runner',

    async load(ctx: ModeContext) {
      rushVenue = mountVenue(ctx, 'football_rush', { keepGameplayCamera: true });
      VenueKit.buildGridiron(ctx.scene);   // the kit field keeps its yard lines and posts under the spec's sky
      if (rushVenue) for (const m of rushVenue.built.root.getChildMeshes()) if (m.name === 'venue_ground') m.visibility = 0;
      runner = await CharacterLibrary.spawn(ctx.scene, CFG.heroUrl, {
        position: new Vector3(0, 0, 0), yawRad: 0, startClip: SPORT_CLIP.idle,
      });
      neverBindPose(runner.animator, SPORT_CLIP.idle);
      installSafePlay(runner.animator, 'football');
      ctx.groundLock?.track(runner.root, runner.skeleton);
      ctx.heroRef.current = runner.root;
      defenders = []; pool = new MobPool();
      score = 0; evades = 0; trucks = 0; ended = false; iframeSec = 0; dodging = false; drive = 1;
      driveEvades = 0; breakawaySec = 0; truckSec = 0; truckCooldown = 0;
      ctx.camDirector.snapTo(runner.root.position, runner.root.position.add(new Vector3(0, 0, 12)));
      assertSpawned(ctx.scene, { hero: runner.root, minWorldMeshes: 6, modeId: 'football' });
      SoundKit.startAmbient('stadium');
      EffectsKit.ambient(ctx.scene, 'gridiron');
      // L4 — a drive is watched. Two sideline banks outside the playing
      // width (FIELD_HALF_X 20), in the runner-cam's frame edges.
      gallery = new Onlookers(ctx.scene, [
        ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => new Vector3(-21.5, 0, 4 + i * 4)),
        ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => new Vector3(21.5, 0, 6 + i * 4)),
      ]);
      newDrive(ctx, 'TAKE THE FIELD');
      ctx.setHud({ score: 0, yards: 0, evades: 0, hint: 'Juke, spin, hurdle — or HOLD TRUCK and run THROUGH them' });
    },

    onInput(ctx: ModeContext, e: FelInput) {
      SoundKit.unlock();
      if (e.t === 'stick' && e.side === 'L') { stickX = e.x; stickY = e.y; }

      // THE SNAP — the player snaps on their call: forward push (or any
      // evade button) with the defense set. Everything before it is the read.
      if (preSnap && !ended) {
        const snapCall = (e.t === 'stick' && e.side === 'L' && e.y < -0.4)
          || (e.t === 'button' && e.pressed && ['A', 'B', 'X', 'Y'].includes(e.btn ?? ''))
          || (e.t === 'trigger' && e.side === 'R' && e.value > 0.5);
        if (snapCall) snap(ctx);
      }

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
      // SET AT THE LINE — nobody moves until the snap (the player calls it,
      // or the auto-snap so an idle phone never stalls)
      if (preSnap) {
        preSnapT += dt;
        if (showBlitz) {
          // the show: he creeps toward the line while everyone else is set
          showBlitz.char.root.position.z -= SHOW_BLITZ_CREEP * dt;
          if (preSnapT < 0.1) ctx.setHud({ hint: 'SHOWING BLITZ — snap into it, or wait him out' });
        }
        if (preSnapT >= PRESNAP_AUTOSNAP_SEC) snap(ctx);
        ctx.camDirector.update(runner.root.position, Vector3.Zero(), null);
        return;
      }
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
          gallery?.cheer(0.6);
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
            if (drive >= DRIVES) {
              ended = true;
              SoundKit.play('whistle');
              return ctx.end('TURNOVER_ON_DOWNS', score, { yards, evades, trucks, coinsCollected: coins?.collected ?? 0, drives: DRIVES });
            }
            drive++;
            SoundKit.play('whistle');
            newDrive(ctx, `TURNOVER ON DOWNS · DRIVE ${drive}/${DRIVES}`);
            return;
          }
          ctx.setHud({ down, toGo, banner: `TACKLED — DOWN ${down}` });
        }
        mob.onContactResolved();
        setTimeout(() => {
          ctx.setHud({ banner: '' });
          runner.root.position.x = 0;
          // a stopped play is a new SET: the front respawns in its alignment
          // and the next snap is the player's call again
          preSnap = true; preSnapT = 0;
          void spawnDefense(ctx).then(() => {
            if (!ended && preSnap) ctx.setHud({ hint: 'READ THE FRONT — push ▲/W to SNAP' });
          });
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
        ctx.setHud({ score, banner: 'TOUCHDOWN!' });
        gallery?.cheer(1);
        if (drive >= DRIVES) {
          ended = true;
          SoundKit.play('whistle');
          return ctx.end('DRIVES_DONE', score, { yards, evades, trucks, coinsCollected: coins?.collected ?? 0, drives: DRIVES });
        }
        drive++;
        newDrive(ctx, `TOUCHDOWN! · DRIVE ${drive}/${DRIVES}`);
      }

      gallery?.update(dt);
      ctx.camDirector.update(runner.root.position, vel, null);
    },

    dispose() {

      rushVenue?.dispose?.(); rushVenue = null;
      gallery?.dispose(); gallery = null;
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
