// KarateVSMode — REPLACES whatever currently drives `/play/karate-vs`.
// SCOPE NOTE (same honest pattern as M48's basketball rebuilds): M46
// established this repo has never seen the existing Karate VS source — only
// its live behavior (best-of-3 vs "Rival Sensei", HP bars, a chi meter
// whose full state turns HEAVY into a "Dragon" attack, and the same E16
// T-pose signature). So this is a complete rebuild on infrastructure this
// project owns and trusts, matched to that observed contract, not a patch
// to unseen code.
//
// The duel (arena-anime-fighter feel, all-original implementation):
//   HIT-STUN CHAINS — clean hits stun; follow-ups inside the window chain
//     into combos with visible COMBO xN and per-link damage scaling, so
//     chains are strong but never a one-touch kill.
//   GUARD-BREAK RHYTHM — holding BLOCK drains a guard gauge on every
//     absorbed hit; emptied, it SHATTERS: 1.4s stagger, free punish. Guard
//     regenerates only while not blocking. Turtling is a choice with a
//     price, exactly the rhythm the genre runs on.
//   PARRY — tap BLOCK within 160ms of an incoming hit: attacker staggers,
//     you gain chi, and a brief local slow-mo beat sells it (same scoped
//     slow-mo pattern as M50's perfect dodge — never a global engine
//     hijack).
//   DRAGON — land hits to build chi; at full chi HEAVY becomes the DRAGON:
//     big damage, huge knockback, guard-shattering.
// Reliability: clipRegistry/installSafePlay, per-phase watchdogs, groundLock,
// fight-preset framing, SoundKit/EffectsKit — all standard since M42.

import { EvadeMoves } from '../core/EvadeMoves';
import { FOCUS, FocusMeter, WALL_RUN, wallRunAvailableOn, startWallRunOn, wallRunOnAt, wallRunOnSide, startWallKick, wallKickAt, kickHits, type WallRunOn, type WallKickState } from '../core/MatrixFocus';   // MATRIX FOCUS (2026-09-18): bullet time held on the right trigger
import { readCombatArena, arenasFor, arenaClamp, knockTo, hazardAt, describeArena, ROPES, type CombatArena, type ArenaWall } from '../combat/arenas';   // COMBAT ARENAS (2026-09-18)
import { buildArena, type ArenaHandle } from '../combat/arenaBuild';
import { dodgeReward, tickCounter, counterMult } from '../core/DodgeRead';
import { nerve, standingOf } from '../core/Nerve';
import { Vector3 } from '@babylonjs/core';
import { CharacterLibrary, type SpawnedCharacter } from '../core/CharacterLibrary';
import { neverBindPose } from '../anim/importSanitizer';
import { installSafePlay } from '../anim/clipRegistry';
import { CombatAnimTree, type CombatAnimInput, type CombatAnimState, type StrikeWeight } from '../anim/combatTree';
// BIOMECH-WAVE2 (2026-09-09): the game-wide body-control bar on the combat family (SPEC-FEL-BIOMECH-GAMEWIDE G1–G6).
//   G1  the lock-on TURNS onto the opponent instead of snapping (`faceEachOther` wrote atan2 straight onto both roots
//       every frame, so a 1.5 m knockback in 160 ms swung the yaw in one step) and a floored / KO'd body is left alone.
//   G2  the feet finally match the travel: an 8-way lock-on duel is mostly SIDEWAYS, and the only loco was the forward
//       guard step (`strafeAxis` → the authored shuffle; giving ground plays the step backwards).
//   G3  the knockback is a constant-SPEED slide (the distance sets the duration), so a big hit reads bigger.
//   G5  the Posture Poses layer holds the chest / shoulders / head per window — the guard on him, a react breaking away,
//       the floor handed back to the clip.
import { mountPostureLayer, type PostureLayer } from '../anim/PostureLayer';
import { combatPose, COMBAT_INPUT_IDLE, COMBAT_TURN_RATE, combatApproach, type CombatPostureInput } from '../core/CombatPosture';
import { BodyMotion, dynamicPose, COMBAT_DYNAMIC } from '../core/DynamicPosture';   // footwork answers its MOTION
import { lockOnYaw, slewYaw, strafeAxis, wrapYaw } from '../core/Biomech';
import { VenueKit } from '../visual/VenueKit';
import { mountVenue, type VenueHandle } from '../core/NexusVenue';
import { Onlookers } from '../visual/Onlookers';
import {
  FighterState, RivalFightBrain, resolveStrike, applyHit,
  KARATE_ATTACKS, SPECIAL_ATTACK, CHI_MAX, GUARD_MAX, PARRY_STAGGER_SEC, PARRY_WINDOW_MS, type AttackDef,
} from '../core/FightCore';
import { StringBook, attackFromMove, STRIKE_TIMING, DASH_ATTACK_SEC, type StickDir, type StrikeBtn } from '../core/HordeDynamics';   // STORM COMBOS (2026-09-17): the book of strings
import { XButtonReader, DASH, LAUNCH_AIR_SEC, launchHeight } from '../core/StormCombat';   // STORM: X = dash / double = chakra dash / hold = guard; launchers put him in the air
import { mountPlayerRing, type PlayerRingHandle } from '../visual/PlayerRing';   // PLAYER RING (owner): who you are, and the gauge at your feet
import { readPlayerIcon } from '../visual/playerIcon';
import { SoundKit } from '../audio/SoundKit';
import {
  BASELINE_RATINGS, ratingsFrom, routeFor, routeHitStopMs, routeShake, damageScale, hasFightMove, cancelWindowSec,
  type FightRatings, type RouteStrike,
} from '../core/FighterStyle';   // PRQ gates the vocabulary; a combo is a ROUTE, not a counter
import { EffectsKit } from '../visual/EffectsKit';
import { assertSpawned } from '../core/FrameGuard';
import type { ModeContext, ModeDefinition, HudValue } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import { KARATE_CONFIG as CFG } from './modeConfigs';
import { readBlend, blendTraits } from '../combat/schools';
import { styleAttacks } from '../combat/loadout';
import { MIN_STARTUP_SEC } from '../core/StrikeSystem';
// MOVEMENT PLAY P7 (2026-09-25): the body's own strikes, guard, slips and steps (lib/babylon/combat/bodyFight)
import { MOVES, type HordeMove } from '../core/HordeDynamics';
import {
  BodyFightDriver, DefenseLedger, DeferredHits, BodyDriveTracker, PadBlock, bodyDefenseAt, hitDelayMs, contactMsOf, bodyCancelAt, bodyLunge, stepSpace,
  BODY_PARRY_WINDOW_MS, FIGHT_CLAIMS, FIGHT_CARD_LINES, type BodyFightIntent,
} from '../combat/bodyFight';
import { BODY_FIGHT } from '../combat/bodyFightFlags';
import { readBodyKicks } from '@/lib/move/bodyPlayChoice';
import type { BodyEvent } from '@/lib/pose/BodyReader';
import type { BodyView } from '../core/ModeHarness';

let modeVenue: VenueHandle | null = null;   // ship pass 4: the mounted venue spec, disposed with the mode
let crowd: Onlookers | null = null;         // Pass 7 phase 6: a ring of onlookers on the gravel, as the endless gauntlet has

type Phase = 'intro' | 'fighting' | 'roundOver' | 'matchOver';
const ROUNDS_TO_WIN = 2;
/** What the rival fights at in a level match. Nerve moves it from here as the rounds go. */
const BASE_RIVAL_DIFFICULTY = 0.65;
const MOVE_SPEED = 3.4;
// THE FIGHT AREA MUST BE INSET FROM THE ROOM. The dojo floor is 18x18, so its
// half-extent is 9 — and this was 7.5, leaving 1.5m between a fighter at the
// edge and the wall. The fight camera pulls back about 5m, so a fighter backed
// into the boundary left it nowhere to go: it ended up 0.3m behind the hero,
// pinned against the wall, and the hero fell out of frame. Every [FEL-FRAME]
// line this mode produced was at exactly z = -7.5.
//
// 4.5 gives a 9m square to fight in — about the size of a Soul Calibur ring —
// and keeps a clear 4.5m of room behind either fighter for the camera.
const SLOWMO_SEC = 0.5;
const SLOWMO_SCALE = 0.3;
// ANIM-READABILITY (combat, 2026-09-07): the CombatAnimTree is the ONE owner of each fighter's clips. The mode never
// plays a clip itself — it latches beats (hit / parry / guard impact / down / out / celebrate) with a wall-clock window
// and feeds the tree once per frame. Before, the per-frame stance play, the swing's onEnd chain and the hit branches
// all played at once: a parried jab froze the hero for 3 s (its chained stance fired from inside the animator's fade
// handler and stranded the fade at weight 0), every rival strike ended in a one-frame stance flash (0.5 m hand pop),
// and the block was the stance clip. Measured on the fake pad; see the tree's header.
const IDLE_CLIP = 'karate_idle_stance';
const REACT_SEC = 0.32, LAUNCH_SEC = 1.0, PARRY_SEC = 0.3, IMPACT_SEC = 0.24, CELEBRATE_SEC = 1.2, GET_UP_SEC = 0.45, STRIKE_MAX_SEC = 1.5;
const REACT_STATES: CombatAnimState[] = ['react_light', 'react_medium', 'react_heavy', 'react_launch'];
interface FighterAnim {
  tree: CombatAnimTree;
  strike: { weight: StrikeWeight; clip: string; until: number; speed?: number; cancelFrom?: number } | null;
  hitBy: StrikeWeight | null; hitUntil: number;
  parryUntil: number; impactUntil: number; downUntil: number; celebrateUntil: number;
  out: boolean;
}
const newFighterAnim = (tree: CombatAnimTree): FighterAnim => ({ tree, strike: null, hitBy: null, hitUntil: 0, parryUntil: 0, impactUntil: 0, downUntil: 0, celebrateUntil: 0, out: false });
const WEIGHT_OF: Record<'jab' | 'kick' | 'heavy', StrikeWeight> = { jab: 'light', kick: 'medium', heavy: 'heavy' };

const BUDGET_SEC: Record<Phase, number> = { intro: 4, fighting: 120, roundOver: 4, matchOver: 999 };
/** MOVEMENT PLAY P7: a body strike handed to swing(): its move, its onset on the page clock, what the body threw. */
interface BodyStrikeArg { move: HordeMove; onsetPage: number; body: string }

export const KarateVSMode: ModeDefinition = (() => {
  let player: SpawnedCharacter, rival: SpawnedCharacter;
  let meState: FighterState, foeState: FighterState;
  let brain: RivalFightBrain;
  /** The player's strikes with their chosen school applied. The rival keeps the unstyled table. */
  let myAttacks: Record<'jab' | 'kick' | 'heavy', AttackDef> = KARATE_ATTACKS;
  let phase: Phase = 'intro';
  let phaseSec = 0;
  let round = 1, myWins = 0, foeWins = 0;
  /** PRQ gates what this body can do (FighterStyle). No scan is plumbed into the modes yet, so both
   *  fighters start at the baseline; `?fight=` overrides MY ratings so the earned routes can be driven. */
  let myRatings: FightRatings = { ...BASELINE_RATINGS };
  const foeRatings: FightRatings = { ...BASELINE_RATINGS };
  /** The strikes each fighter has LANDED inside the current combo window — a route reads this tail. */
  let myLanded: RouteStrike[] = [], foeLanded: RouteStrike[] = [];
  let striking = false, foeStriking = false;
  let slowmoSec = 0;
  // MATRIX FOCUS (owner 2026-09-18): held on the right trigger — the rival runs at FOCUS.worldScale (his animator, his brain,
  // his swing's hit beat via foeTimers) while I keep FOCUS.heroScale; a read refills it, my hits inside it land harder.
  const focus = new FocusMeter();
  let focusHeld = false, focusHud = -1, focusHudOn = false;
  const foeTimers: { left: number; fn: () => void }[] = [];
  // THE ARENA (2026-09-18): picked on the splash (combat/arenas.ts), re-read at load (the factory runs at SSR). Its walls
  // take the wall run inside Focus; its edge stops, bounces (ropes) or — never here — drops. `ARENA_HALF` is history.
  let arena: CombatArena = arenasFor('karate_vs')[0];
  let arenaHandle: ArenaHandle | null = null;
  let wallRun: WallRunOn<ArenaWall> | null = null, wallKick: WallKickState | null = null, wallKickY0 = 0, hazardTickAt = 0;
  const matrixStats = { wallRuns: 0, wallKicks: 0, kickHits: 0 };
  /** L1 inside Focus, running INTO a wall: up onto it and along it. */
  function tryWallRun(ctx: ModeContext): boolean {
    const pos = player.root.position, v = lastMyVel ?? Vector3.Zero();
    const hd = v.length() >= 0.3 ? { x: v.x, z: v.z } : { x: -Math.sin(player.root.rotation.y), z: -Math.cos(player.root.rotation.y) };   // stopped on the wall with the rival in front: the wall is BEHIND (lock-on faces the rival)
    const hit = wallRunAvailableOn({ x: pos.x, z: pos.z }, hd, arena.walls);
    if (!hit) { if (process.env.NODE_ENV === 'development') console.info(`[MATRIX] wall run refused at (${pos.x.toFixed(2)}, ${pos.z.toFixed(2)}) heading (${hd.x.toFixed(2)}, ${hd.z.toFixed(2)}) vel ${v.length().toFixed(2)}`); return false; }
    wallRun = startWallRunOn(hit, hd); matrixStats.wallRuns++;
    endStrike(true); meState.releaseBlock();
    SoundKit.play('whoosh', { pitch: 1.1, volume: 0.45 });
    ctx.setHud({ banner: 'WALL RUN' }); setTimeout(() => ctx.setHud({ banner: '' }), 500);
    ctx.momentum.report({ kind: 'near_miss', weight: 10 });
    console.info(`[MATRIX] vs wall run on the ${wallRun.wall.label} dir ${wallRun.dir}`);
    return true;
  }
  /** Off the wall: a flying kick at the rival. */
  function wallKickOff(ctx: ModeContext): void {
    if (!wallRun) return;
    const pos = player.root.position;
    wallKick = startWallKick({ x: pos.x, z: pos.z }, { x: rival.root.position.x, z: rival.root.position.z });
    wallKickY0 = pos.y; wallRun = null; player.root.rotation.z = 0;
    player.root.rotation.y = Math.atan2(wallKick.dx, wallKick.dz);
    matrixStats.wallKicks++;
    meAnim.strike = { weight: 'heavy', clip: myAttacks.kick.clip, until: now() + 900 };   // the tree plays the kick; its settle ends the swing
    striking = true;
    SoundKit.play('whoosh', { pitch: 0.8, volume: 0.6 });
    ctx.setHud({ banner: 'WALL KICK' }); setTimeout(() => ctx.setHud({ banner: '' }), 600);
    console.info('[MATRIX] vs wall kick');
  }
  /** The wall run and the kick own the body while they last. Returns true when they do. */
  function tickMatrix(ctx: ModeContext, dt: number): boolean {
    if (wallRun) {
      wallRun.t += dt;
      const p = wallRunOnAt(wallRun, wallRun.t);
      player.root.position.set(p.x, p.y, p.z); player.root.rotation.y = p.yaw; player.root.rotation.z = wallRunOnSide(wallRun) * 0.42;
      if (p.done) wallKickOff(ctx);
      return true;
    }
    if (wallKick) {
      const prev = { x: player.root.position.x, z: player.root.position.z };
      wallKick.t += dt;
      const p = wallKickAt(wallKick, wallKick.t, wallKickY0);
      player.root.position.set(p.x, p.y, p.z);
      const rp = rival.root.position;
      if (kickHits(prev, { x: p.x, z: p.z }, [{ x: rp.x, z: rp.z }], WALL_RUN.kickHitM, wallKick.hit).length) {
        wallKick.hit.add(0); matrixStats.kickHits++;
        foeState.hp = Math.max(0, foeState.hp - WALL_RUN.kickDamage); focus.gain(FOCUS.hitGain);
        ctx.juice.hitStop(70); ctx.feel?.impact?.(0.6); ctx.juice.shake(0.08, 120);
        EffectsKit.burst(ctx.scene, rp.add(new Vector3(0, 1.1, 0)), 'sparks');
        beatDown(false, WALL_RUN.kickStunSec + GET_UP_SEC);
        knockback(ctx, rival, player.root.position, 1.8);
        ctx.setHud({ foeHp: foeState.hp, banner: 'WALL KICK!' }); setTimeout(() => ctx.setHud({ banner: '' }), 700);
        console.info('[MATRIX] vs wall kick hit');
        if (foeState.hp <= 0) endRound(ctx, true);
      }
      if (p.done) { wallKick = null; player.root.position.y = 0; arenaClamp(player.root.position, arena); }
      return true;
    }
    return false;
  }
  /** ARENA HAZARDS: whoever stands in a fire pit burns. Ticked at 5 Hz on the room clock. */
  function tickHazards(ctx: ModeContext, dtRoom: number): void {
    hazardTickAt += dtRoom; if (hazardTickAt < 0.2) return;
    const step = hazardTickAt; hazardTickAt = 0;
    for (const mine of [true, false]) {
      const c = mine ? player : rival, st = mine ? meState : foeState;
      if (mine && (wallRun || wallKick)) continue;
      const h = hazardAt(c.root.position, arena); if (!h) continue;
      st.hp = Math.max(0, st.hp - h.dps * step);
      EffectsKit.burst(ctx.scene, c.root.position.add(new Vector3(0, 0.6, 0)), 'sparks');
      ctx.setHud(mine ? { hp: st.hp } : { foeHp: st.hp });
      console.info(`[ARENA] ${mine ? 'you' : 'rival'} in the ${h.label}`);
      if (st.hp <= 0) { ctx.setHud({ banner: mine ? 'BURNED!' : 'RIVAL BURNED!' }); endRound(ctx, !mine); }
    }
  }
  function onFocusStart(ctx: ModeContext): void {
    ctx.juice.tint('rgba(16, 70, 34, 0.75)'); ctx.camDirector.pulse(0.45, 0.35);
    SoundKit.play('powerUp', { pitch: 0.55, volume: 0.5 });
    ctx.setHud({ banner: 'FOCUS' }); setTimeout(() => ctx.setHud({ banner: '' }), 500);
    console.info(`[MATRIX] vs focus on at ${Math.round(focus.value)}`);
  }
  function onFocusEnd(ctx: ModeContext, dry: boolean): void {
    ctx.juice.tint(null); SoundKit.play('whoosh', { pitch: 0.6, volume: 0.4 });
    if (dry) { ctx.setHud({ banner: 'FOCUS DRAINED' }); setTimeout(() => ctx.setHud({ banner: '' }), 600); }
    console.info(`[MATRIX] vs focus off (${dry ? 'dry' : 'released'}) after ${focus.heldSec.toFixed(2)} s`);
  }
  let meAnim: FighterAnim, foeAnim: FighterAnim;
  // BIOMECH-WAVE2 G5: the shared Posture Poses layer on both fighters. Every karate clip in the library keys the hips,
  // ONE spine bone and the arms, so the thoracic chain, the clavicles and the head sat wherever the last clip that
  // keyed them left — a fighter circling carried the previous jab's shoulder turn through the whole orbit and nobody
  // in the mode ever LOOKED at anybody (the head pointed down the root yaw, which is the lock-on, i.e. at the hips).
  let mePosture: { layer: PostureLayer; dispose(): void } | null = null, foePosture: { layer: PostureLayer; dispose(): void } | null = null;
  const meBio: CombatPostureInput = { ...COMBAT_INPUT_IDLE }, foeBio: CombatPostureInput = { ...COMBAT_INPUT_IDLE };
  /** The chest aims at his chest, not his feet: the eyes level instead of looking at the floor between you. */
  const chestOf = (c: SpawnedCharacter): Vector3 => c.root.position.add(new Vector3(0, 1.32, 0));
  // DYNAMIC POSTURE for the FOOTWORK. An 8-way duel is mostly sideways, and every authored combat stance is
  // [x, 0, 0] — pitch only — so a fighter circling hard stayed bolt upright. The allowlist is COMBAT_DYNAMIC:
  // strikes, blocks, parries, reactions and knockdowns are choreography and a strike's lean is the authored shape of
  // that strike. Exertion comes off the guard gauge, so a fighter whose guard is breaking carries himself like it.
  const meMotion = new BodyMotion();
  const foeMotion = new BodyMotion();
  const feedFor = (bio: CombatPostureInput, foe: () => SpawnedCharacter, motion: BodyMotion, exertion: number) => {
    const { window, pose, legs } = combatPose(bio);
    const at = chestOf(foe());
    const dyn = dynamicPose(pose, motion.signals(bio.speed01, exertion, false), window, COMBAT_DYNAMIC);
    return { pose: dyn, legs, aim: at, eyes: at, window };
  };
  // ── A+ P0 juice (PM brief COMBAT-A-PLUS-P0, 2026-09-06): ONE thud per connect (feel.impact plays its own — the SoundKit
  // impact that stacked on it is gone), a latched hit-stop + shake on heavy / special, a soft round-win beat and a latched
  // Street Fighter–class MATCH punch. No hang slowMo, no juice.impact({ slow }). The parry's scoped slow-mo is the mode's own.
  let heavyAt = 0, matchLatch = false;
  function heavyPunch(ctx: ModeContext, tag: string): void {
    const t = performance.now(); if (t - heavyAt < 120) return; heavyAt = t;   // once per connect
    ctx.juice.hitStop(45); ctx.juice.shake(0.10, 130);
    console.info(`[KVS-JUICE] heavy punch (${tag})`);
  }
  function roundWinBeat(ctx: ModeContext): void { ctx.juice.shake(0.08, 140); ctx.juice.flash('#fff6dd', 90); console.info('[KVS-JUICE] round win'); }
  function matchPunch(ctx: ModeContext): void {
    if (matchLatch) return; matchLatch = true;
    ctx.juice.hitStop(60); ctx.juice.shake(0.14, 160); ctx.juice.flash('#FFD700', 140);
    console.info('[KVS-JUICE] match punch');
  }
  let stickX = 0, stickY = 0;
  // ROLL, JUMP AND DODGE (2026-09-14). Before today this mode's entire movement verb set was a stick: no
  // roll, no jump, no dodge. EvadeMoves rather than CombatMovement on purpose -- this mode writes its own
  // camera-relative velocity (MODE-STICK-FACE) and migrating that to deliver a verb would risk a feel that
  // was tuned for a reason.
  const meEvade = new EvadeMoves();
  let ctx0!: ModeContext;   // STORM: the context the stick read needs (set every update)
  let lastMyVel: Vector3 | null = null, lastFoeVel: Vector3 | null = null;   // FREE RUN: last frame's travel, for the facing
  const FREE_RUN_M = 3.4;
  // STORM (2026-09-17): the string book (every press is its own link), the X reader, the dash and the launched body
  const book = new StringBook(); const xBtn = new XButtonReader();
  let ring: PlayerRingHandle | null = null; const stringLabels: string[] = [];   // PLAYER RING + the combo callout (the string's links, named on the finisher)
  let queuedKey: { key: 'jab' | 'kick' | 'heavy'; at: number; body?: BodyStrikeArg } | null = null;   // STORM: the press waiting for the cancel point (P7: or a body strike, its onset kept)
  // MOVEMENT PLAY P7: the body's fight read — the driver, the defensive ledger the rival's hits on a body player resolve
  // against (deferred until the body's frames cover the impact), who is driving, the kicks opt-in, and auto-spacing
  // the READY screen's spin / jump kick opt-in, read when a kick is told: the toggle is offered after load (READY, or the
  // check over a pause), so a value read in load() would miss the player's tick for this match
  const bodyDriver = new BodyFightDriver({ kicksOptIn: () => readBodyKicks('karate_vs') });
  const ledger = new DefenseLedger(), deferred = new DeferredHits(), drive = new BodyDriveTracker();
  const padBlock = new PadBlock();   // P7 (the review, 2026-09-26): the pad's X apart from the body's guard — a deferred hit meets both
  let bodyGuard = false;   // P7: the block is the body's (its guard up), to let go when the reader loses the guard
  let bodyShift: { v: Vector3; left: number } | null = null;
  const TOKEN_KEY: Record<StrikeBtn, 'jab' | 'kick' | 'heavy'> = { A: 'jab', B: 'kick', Y: 'heavy' };
  const bodyDriven = (): boolean => drive.driven(!!ctx0?.body?.()?.read.tracking);
  let lastDashSec = -1e9, meDash: { dir: Vector3; left: number; homing: boolean } | null = null, meDashIframeSec = 0, meDashUntil = 0, foeLaunchedSec = 0;
  const BTN_OF: Record<'jab' | 'kick' | 'heavy', StrikeBtn> = { jab: 'A', kick: 'B', heavy: 'Y' };
  const stickDirToFoe = (): StickDir => { if (Math.hypot(stickX, stickY) < 0.35) return 'n'; const w = ctx0.camDirector.forwardFlat().scale(-stickY).addInPlace(ctx0.camDirector.rightFlat().scale(stickX)).normalize(); const to = rival.root.position.subtract(player.root.position); to.y = 0; to.normalize(); const d = w.x * to.x + w.z * to.z; return d > 0.5 ? 'f' : d < -0.5 ? 'b' : 'n'; };
  /** Seconds of counter window open on the player from a perfect dodge (DodgeRead). */
  let meCounter = 0;
  /** When the rival's in-flight strike would connect, as a game-clock time; null when nothing is coming. */
  let foeImpactAt: number | null = null;
  let lookX = 0, lookY = 0;   // R stick → camera look (MODE-STICK-FACE family, 2026-09-07)

  function setPhase(p: Phase): void { phase = p; phaseSec = 0; }
  function now(): number { return performance.now(); }

  /** G1: the lock-on TURNS. Both fighters ease onto each other at a real pivot rate, and a body on the floor (KO'd, or
   *  inside a knockdown) is left where the clip put it — the old per-frame `rotation.y = atan2(...)` kept re-aiming a
   *  knocked-down fighter's hips at his opponent while he lay there, and snapped both bodies through the whole yaw of
   *  a 1.5 m knockback in the one frame it landed. */
  function faceEachOther(dt: number): void {
    const p = player.root.position, r = rival.root.position;
    // FREE RUN (owner, 2026-09-17: "they shouldn't be squared up all the time, they should run to the next spot"): apart and
    // moving, a fighter turns onto his travel and RUNS (the tree's run loop); the lock-on squares him up again inside FREE_RUN_M
    const apart = Math.hypot(p.x - r.x, p.z - r.z) > FREE_RUN_M;
    const meRuns = apart && !!lastMyVel && lastMyVel.length() > 1.2, foeRuns = apart && !!lastFoeVel && lastFoeVel.length() > 1.2;
    if (!meAnim?.out && !downNow(meAnim)) player.root.rotation.y = meRuns ? slewYaw(player.root.rotation.y, Math.atan2(lastMyVel!.x, lastMyVel!.z), COMBAT_TURN_RATE * 1.5, dt) : lockOnYaw(p, r, player.root.rotation.y, COMBAT_TURN_RATE, dt);
    if (!foeAnim?.out && !downNow(foeAnim)) rival.root.rotation.y = foeRuns ? slewYaw(rival.root.rotation.y, Math.atan2(lastFoeVel!.x, lastFoeVel!.z), COMBAT_TURN_RATE * 1.5, dt) : lockOnYaw(r, p, rival.root.rotation.y, COMBAT_TURN_RATE, dt);
  }
  const downNow = (f: FighterAnim | undefined): boolean => !!f && now() < f.downUntil;

  /** G3: knockback at a constant SPEED, so a heavier hit takes longer and travels further — it used to be a fixed
   *  160 ms lerp whatever the distance, which made a 0.4 m jab and a 2.2 m DRAGON the same shove played at two speeds. */
  const KNOCKBACK_SPEED = 9;   // m/s — 0.4 m in 44 ms, 2.2 m in 244 ms
  function knockback(ctx: ModeContext, char: SpawnedCharacter, fromPos: Vector3, meters: number): void {
    const dir = char.root.position.subtract(fromPos); dir.y = 0;
    if (dir.lengthSquared() < 1e-4) return;
    dir.normalize();
    const from = char.root.position.clone();
    const kt = knockTo(from, from.add(dir.scale(meters)), arena);   // COMBAT ARENAS: the edge stops it, or the ropes throw it back
    const to = new Vector3(kt.x, from.y, kt.z);
    if (kt.rebound) { const mine = char === player; beatDown(mine, ROPES.stunSec + GET_UP_SEC); SoundKit.play('impact', { pitch: 1.4, volume: 0.4 }); ctx.setHud({ banner: mine ? 'YOU HIT THE ROPES!' : 'OFF THE ROPES!' }); setTimeout(() => ctx.setHud({ banner: '' }), 500); console.info('[ARENA] vs off the ropes'); }
    const ms = Math.max(80, (Vector3.Distance(from, to) / KNOCKBACK_SPEED) * 1000);
    const t0 = now();
    const obs = ctx.scene.onBeforeRenderObservable.add(() => {
      const u = Math.min(1, (now() - t0) / ms);
      const k = 1 - (1 - u) * (1 - u);   // the body carries the blow out and settles: ease-out, not a linear drag
      char.root.position.x = from.x + (to.x - from.x) * k;
      char.root.position.z = from.z + (to.z - from.z) * k;
      if (u >= 1) ctx.scene.onBeforeRenderObservable.remove(obs);
    });
  }

  // ── the tree's inputs (ANIM-READABILITY) ──
  function animOf(mine: boolean): FighterAnim { return mine ? meAnim : foeAnim; }
  /** A fighter's swing is over — naturally (the tree's settle) or interrupted (hit / parried / broken / round end). */
  /** STORM: the DASH — a burst along the stick (or at the rival), i-frames for its first beat, a cancel of a string's recovery;
   *  the CHAKRA DASH (a double tap) homes on the rival and stops a reach short. */
  function tryDash(ctx: ModeContext, homing: boolean): void {
    if (!meState.controllable || !meEvade.canAct || phase !== 'fighting') return;
    if (meDash && !(homing && !meDash.homing)) return;   // a running dash refuses a second tap — unless the tap makes it the CHAKRA dash (the double tap lands mid-burst by definition)
    if (striking) { const st = animOf(true).strike; if (st && st.cancelFrom !== undefined && now() < st.cancelFrom) return; endStrike(true); }   // dash-cancel after the cancel point
    const toFoe = rival.root.position.subtract(player.root.position); toFoe.y = 0;
    const stick = Math.hypot(stickX, stickY) > 0.25 ? ctx.camDirector.forwardFlat().scale(-stickY).addInPlace(ctx.camDirector.rightFlat().scale(stickX)) : null;
    const dir = homing || !stick ? (toFoe.lengthSquared() > 1e-4 ? toFoe.normalize() : ctx.camDirector.forwardFlat()) : stick.normalize();
    meDash = { dir, left: homing ? DASH.homingMaxSec : DASH.sec, homing };
    meDashIframeSec = DASH.iframes; meDashUntil = now() + (homing ? DASH.homingMaxSec : DASH.sec) * 1000; lastDashSec = now() / 1000;
    SoundKit.play('whoosh', { pitch: homing ? 1.35 : 1.2, volume: 0.45 }); if (homing) ctx.camDirector.pulse(0.25, 0.3);
    console.info(`[KVS-STORM] ${homing ? 'chakra dash' : 'dash'}`);
  }
  function endStrike(mine: boolean): void { if (mine) striking = false; else foeStriking = false; animOf(mine).strike = null; }
  function beatHit(mine: boolean, weight: StrikeWeight): void {
    const f = animOf(mine); f.hitBy = weight; f.hitUntil = now() + (weight === 'finisher' ? LAUNCH_SEC : REACT_SEC) * 1000;
    f.tree.clearBeat(...REACT_STATES);   // a second hit inside the first react re-fires it
    endStrike(mine);
  }
  function beatDown(mine: boolean, staggerSec: number): void { const f = animOf(mine); f.downUntil = now() + (staggerSec - GET_UP_SEC) * 1000; f.tree.clearBeat('knockdown'); endStrike(mine); }
  function beatParry(mine: boolean): void { const f = animOf(mine); f.parryUntil = now() + PARRY_SEC * 1000; f.tree.clearBeat('parry_flash'); }
  function beatGuardImpact(mine: boolean): void { const f = animOf(mine); f.impactUntil = now() + IMPACT_SEC * 1000; f.tree.clearBeat('guard_impact'); }
  function treeInput(f: FighterAnim, s: FighterState, speed01: number, mine: boolean, vel: Vector3): CombatAnimInput {
    const t = now();
    if (f.strike && t > f.strike.until) endStrike(f === meAnim);   // a strike the tree never settled (safety, never measured)
    const me = mine ? player : rival, foe = mine ? rival : player;
    const yaw = me.root.rotation.y;
    // G2 — WHERE THE FEET ARE GOING against the FACING (the lock-on aims the root at the opponent every frame, so a
    // fighter circling him travels 90° off his own forward and the forward guard step was a moon-walk)
    const strafe = strafeAxis(vel, yaw);
    const toFoe = foe.root.position.subtract(me.root.position); toFoe.y = 0;
    const closing = toFoe.lengthSquared() > 1e-6 ? Vector3.Dot(vel, toFoe.normalize()) : 0;   // + = closing on him, − = giving ground
    const moving = s.controllable && !s.blockHeld ? speed01 : 0;
    const bio = mine ? meBio : foeBio;
    bio.speed01 = moving; bio.strafe = strafe; bio.approach = combatApproach(closing);
    bio.striking = f.strike?.weight ?? null; bio.windingUp = false;
    bio.blocking = s.blockHeld; bio.parrying = t < f.parryUntil; bio.guardImpact = t < f.impactUntil;
    bio.hitBy = t < f.hitUntil ? f.hitBy : null; bio.down = t < f.downUntil; bio.out = f.out;
    bio.rising = false; bio.dodging = mine ? meEvade.rolling : false; bio.celebrating = t < f.celebrateUntil; bio.engaged = phase === 'fighting';
    return {
      speed01: moving, strafe, backing: strafe === 0 && bio.approach < 0, dashing: mine && t < meDashUntil, hasWeapon: false,
      rolling: mine ? meEvade.rolling : false, airborne: mine ? meEvade.airborne : false,
      striking: f.strike?.weight ?? null, strikeClip: f.strike?.clip, strikeSpeed: f.strike?.speed,
      blocking: s.blockHeld, parryFlash: t < f.parryUntil, guardImpactFlash: t < f.impactUntil,
      hitBy: t < f.hitUntil ? f.hitBy : null, down: t < f.downUntil, out: f.out, ulting: false, celebrating: t < f.celebrateUntil,
      speedMps: Math.hypot(vel.x, vel.z),   // STRIDE MATCHING: real ground speed, not the normalised one
    };
  }
  /** Once per frame, both fighters, every phase (the KO holds the floor through the round-over beat). */
  function animate(mySpeed01: number, foeSpeed01: number, myVel = Vector3.Zero(), foeVel = Vector3.Zero()): void {
    if (!meAnim || !foeAnim) return;
    // the posture trackers: each fighter's acceleration resolved in HIS own frame, so a backstep and a circle read
    // differently instead of being the same world-space number
    const dt = 1 / 60;
    if (player) meMotion.update(myVel.x, myVel.z, player.root.rotation.y, dt);
    if (rival) foeMotion.update(foeVel.x, foeVel.z, rival.root.rotation.y, dt);
    meAnim.tree.update(treeInput(meAnim, meState, mySpeed01, true, myVel));
    foeAnim.tree.update(treeInput(foeAnim, foeState, foeSpeed01, false, foeVel));
  }
  function resetAnim(f: FighterAnim): void { f.strike = null; f.hitBy = null; f.hitUntil = 0; f.parryUntil = 0; f.impactUntil = 0; f.downUntil = 0; f.celebrateUntil = 0; f.out = false; f.tree.reset(); }

  /** One swing, either direction. `mine` = the player is the attacker. `body` (P7): the player's BODY strike — its own move and
   *  its onset on the page clock (the book reads the move, not the button; the hit beat comes from the onset). */
  function swing(ctx: ModeContext, mine: boolean, key: 'jab' | 'kick' | 'heavy', body?: BodyStrikeArg): void {
    const atkState = mine ? meState : foeState;
    const defState = mine ? foeState : meState;
    const atkChar = mine ? player : rival;
    const defChar = mine ? rival : player;
    if (!atkState.controllable || (!mine && foeStriking)) return;
    // STORM STRINGS: a press during MY swing is a LINK — past the cancel point it cancels into the next move now, before
    // it is queued for the cancel point (the Hundred's StrikeQueue rule; a dropped press was the reason a string never chained)
    if (mine && striking) {
      const st = animOf(true).strike;
      if (st && st.cancelFrom !== undefined && now() >= st.cancelFrom) endStrike(true);
      else { queuedKey = { key, at: now(), body }; return; }
    }

    // The DRAGON is EARNED as well as charged: full chi is the cost, FORCE is the licence. A baseline body
    // can fill the gauge and still not throw it, which is what makes upgrading the scan visible in a fight.
    const canDragon = hasFightMove('dragon', mine ? myRatings : foeRatings);
    const special = !body && key === 'heavy' && atkState.chi >= CHI_MAX && canDragon;
    // THE PLAYER'S SCHOOL applies to the player's strikes and to nobody else's (2026-09-13). The rival
    // fights the unstyled table, so a school is a thing YOU brought rather than a global difficulty dial —
    // picking ANCHORED must not also make the opponent hit harder. The finisher is deliberately unstyled
    // too: the dragon is earned through FORCE (FighterStyle), and letting a school scale it would let the
    // pre-game screen buy part of something the scan is supposed to be the only route to.
    const baseAtk = (mine ? myAttacks : KARATE_ATTACKS)[key];
    // STORM COMBOS: MY presses read the book — the sequence, the stick and the situation (a launched body: air links; a dash just thrown: the rush) pick the link
    const move = mine && body ? book.pressMove(body.move, BTN_OF[key], body.onsetPage / 1000)   // P7: the body's own move, timed onset to onset
      : mine && !special ? book.press(BTN_OF[key], stickDirToFoe(), now() / 1000, { air: foeLaunchedSec > 0, afterDash: now() / 1000 - lastDashSec < DASH_ATTACK_SEC, airborne: meEvade.airborne, close: Vector3.Distance(player.root.position, rival.root.position) < 1.35 }) : null;
    const atk: AttackDef = special ? SPECIAL_ATTACK : move ? attackFromMove(move, baseAtk) : baseAtk;
    if (mine) striking = true; else foeStriking = true;
    if (special) {
      atkState.chi = 0;
      ctx.setHud(mine ? { chi: 0 } : { foeChi: 0 });
      ctx.setHud({ banner: mine ? 'DRAGON!' : 'RIVAL DRAGON!' });
      SoundKit.play('powerUp', { pitch: 0.7 });
      setTimeout(() => ctx.setHud({ banner: '' }), 700);
    }
    SoundKit.play('whoosh', { pitch: special ? 0.8 : 1.1 });
    if (move) console.info(`[KVS-STORM] link ${move.id} (${move.clip}) weight ${move.weight}${move.air ? ' AIR' : ''}${move.launch ? ' LAUNCH' : ''}${move.slam ? ' SLAM' : ''} string ${book.history.length}${body ? ` body ${body.body} age ${Math.round(now() - body.onsetPage)}` : ''}`);
    if (move && body && book.history.length === 1) stringLabels.length = 0;   // P7: a body strike that starts a string starts its call (a lapsed string's links are not this one's)
    if (move) { stringLabels.push(move.label); if (move.ender || book.history.length === 0) { const call = stringLabels.join(' → '); stringLabels.length = 0; if (call.includes('→')) { ctx.setHud({ banner: `COMBO: ${call}` }); setTimeout(() => ctx.setHud({ banner: '' }), 900); } } }   // STORM: the string is CALLED when it ends — button presses in sequence are a combo you can read
    // P7: a body strike's hit beat is its contact frame (its startup is already spent in the camera's latency), never under
    // the wind-up floor; its cancel point runs from its onset, after that beat
    const hitDelay = body && move ? hitDelayMs(atk.startupMs, contactMsOf(move), now() - body.onsetPage) : atk.startupMs;
    if (body && move) { const d = Vector3.Distance(player.root.position, rival.root.position), lunge = bodyLunge(d, atk.range); if (lunge > 0) { const v = rival.root.position.subtract(player.root.position); v.y = 0; bodyShift = { v: v.normalize().scale(lunge / 0.15), left: 0.15 }; } }
    animOf(mine).strike = { weight: special ? 'finisher' : move ? move.weight : WEIGHT_OF[key], clip: atk.clip, speed: move?.speed, cancelFrom: move ? (body ? bodyCancelAt(now() + hitDelay, body.onsetPage, move) : now() + (STRIKE_TIMING[move.weight].cancelAt / move.speed) * 1000) : undefined, until: now() + STRIKE_MAX_SEC * 1000 };   // the tree plays it; its settle ends the swing

    // WHAT MAKES A DODGE "WELL TIMED" MEASURABLE. The window is read against the moment this strike would
    // CONNECT, so the player is rewarded for reacting to THIS attack rather than to a cooldown. Only the
    // rival's swing is announced: dodging your own strike is not a read.
    // MATRIX FOCUS: the rival's swing lands on the ROOM clock (inside Focus it takes 1/worldScale longer in real time, and the
    // dodge read is told so); mine stays on the wall clock
    if (!mine) foeImpactAt = now() + atk.startupMs / focus.worldScale;
    const onHitBeat = (impactAt?: number) => {
      if (phase !== 'fighting') { endStrike(mine); return; }
      // P7: the rival's fist on a BODY player waits for the body's frames to cover the impact (DefenseLedger), then resolves
      // against the body's guard and slips AT the impact — at most bodyFight.DEFER_CAP_MS late. A pad player: never.
      if (!mine && impactAt === undefined && bodyDriven()) { const imp = now(); deferred.push(imp, (at) => onHitBeat(at)); return; }
      const dist = Vector3.Distance(atkChar.root.position, defChar.root.position);
      if (!mine) foeImpactAt = null;   // it landed or it did not; either way nothing is incoming now
      let outcome = impactAt !== undefined ? bodyOutcome(atk, dist, impactAt) : resolveStrike(atk, dist, defState, now());
      if (!mine && (meDashIframeSec > 0 || meEvade.rollIFrames)) outcome = 'whiff';
      if (!mine && outcome === 'whiff' && meDashIframeSec > 0) {
        // phase 6 — THE DASH READ: his swing went through where I was. That is the same read the roll's perfect dodge is
        // (DodgeRead), so it pays the same: the counter window, Focus, the beat. Measured before: the whiff was silent.
        const r = dodgeReward(0);
        if (r.perfect) { meCounter = r.counterSec; focus.gain(FOCUS.dodgeGain); ctx.juice.slowMo(0.45, Math.round(r.slowMoSec * 1000)); ctx.feel?.impact?.(0.3); ctx.setHud({ banner: 'PERFECT DODGE' }); setTimeout(() => ctx.setHud({ banner: '' }), 600); console.info('[KVS-DEF] perfect dodge (dash)'); }
      }   // STORM: the dash's / the roll's i-frames — he swings through where I was

      switch (outcome) {
        case 'whiff': break;
        case 'parried': {
          atkState.staggerSec = PARRY_STAGGER_SEC;
          defState.chi = Math.min(CHI_MAX, defState.chi + 15);
          slowmoSec = SLOWMO_SEC;
          SoundKit.play('impact', { pitch: 1.6, volume: 0.5 });   // the parry ping is the one sound; the feel thud that doubled it is gone
          ctx.juice.shake(0.05, 80);
          EffectsKit.burst(ctx.scene, defChar.root.position.add(new Vector3(0, 1.3, 0)), 'sparks');
          beatHit(mine, 'light'); beatParry(!mine);   // the attacker flinches (staggered), the defender's guard flicks
          ctx.setHud({ banner: mine ? 'PARRIED!' : 'PERFECT PARRY!', ...(mine ? { foeChi: Math.round(defState.chi) } : { chi: Math.round(defState.chi) }) });
          setTimeout(() => ctx.setHud({ banner: '' }), 700);
          break;
        }
        case 'blocked': {
          SoundKit.play('impact', { pitch: 0.7, volume: 0.3 });
          EffectsKit.burst(ctx.scene, defChar.root.position.add(new Vector3(0, 1.1, 0)), 'dust');
          beatGuardImpact(!mine);
          ctx.setHud(mine ? { foeGuard: Math.round(defState.guard) } : { guard: Math.round(defState.guard) });
          break;
        }
        case 'guardBreak': {
          SoundKit.play('crowdGroan', { volume: 0.4 });
          ctx.feel?.impact?.(0.5);   // ONE thud (the 0.5-pitch impact SFX that stacked on it is gone)
          // THE METER HEARS THE FIGHT. `mine` already says who swung, so the same event is a highlight for
          // one fighter and a blunder for the other -- reported from the one branch that knows.
          ctx.momentum.report({ kind: mine ? 'clean_hit' : 'blunder', weight: mine ? 14 : -10 });
          ctx.juice.shake(0.08, 120);
          console.info('[KVS-JUICE] guard break');
          EffectsKit.burst(ctx.scene, defChar.root.position.add(new Vector3(0, 1.2, 0)), 'glitch');
          beatDown(!mine, defState.staggerSec);   // knock down → floor → get up inside the stagger
          ctx.setHud({ banner: mine ? 'GUARD BREAK!' : 'YOUR GUARD SHATTERED!', ...(mine ? { foeGuard: 0 } : { guard: 0 }) });
          setTimeout(() => ctx.setHud({ banner: '' }), 900);
          break;
        }
        case 'hit': {
          // A PERFECT DODGE IS AN OPENING, and this is where it is spent: the counter window multiplies the
          // punish and then closes. Bounded at 1.5x by DodgeRead -- an opening, never an execute.
          const counter = mine ? counterMult(meCounter) : 1;
          if (mine && counter > 1) { meCounter = 0; ctx.setHud({ banner: 'COUNTER!' }); setTimeout(() => ctx.setHud({ banner: '' }), 700); }
          const base = applyHit(atkState, defState, atk);
          const dealt = Math.round(base * counter * (mine && focus.active ? FOCUS.damageMult : 1));   // MATRIX: a Focus strike lands harder
          if (mine) focus.gain(FOCUS.hitGain);
          if (counter > 1) defState.hp = Math.max(0, defState.hp - (dealt - base));
          // A COMBO IS A ROUTE. `combo++` counted hits, so jab-jab-jab and jab-kick-heavy were worth exactly
          // the same and neither had a name. The landed strikes are recorded and their TAIL is matched against
          // the route list, so a route can complete inside a real exchange rather than only from a clean start.
          const landed = mine ? myLanded : foeLanded;
          const ratings = mine ? myRatings : foeRatings;
          // A QUICK BODY HOLDS THE ROUTE TOGETHER. FightCore's window is a fixed 1.1 s for everyone, so the
          // quickness rating bought nothing where it matters most — stringing strikes. Measured before this:
          // the landed tail was a single strike over and over and only the two-step CRUSHER ever completed.
          atkState.comboTimer = cancelWindowSec(ratings);
          landed.push(key as RouteStrike);
          if (landed.length > 6) landed.shift();
          const route = routeFor(landed, ratings);
          if (process.env.NODE_ENV === 'development' && mine) console.info(`[KVS-ROUTE] landed ${landed.join('>')}`);
          ctx.feel?.impact?.(special ? 0.6 : 0.3);   // ONE thud per connect (the impact SFX that doubled it is gone)
          ctx.momentum.report(mine ? { kind: 'clean_hit', weight: special ? 16 : 9 } : { kind: 'blunder', weight: -8 });
          if (special || key === 'heavy') { heavyPunch(ctx, special ? 'dragon' : 'heavy'); console.info(mine ? '[KVS-JUICE] heavy landed' : '[KVS-JUICE] heavy taken'); } else { ctx.juice.hitStop(key === 'kick' ? 45 : 28); console.info(mine ? '[KVS-JUICE] hit' : '[KVS-JUICE] taken'); }   // phase 5: every connect holds for its weight (the horde's rule)
          EffectsKit.burst(ctx.scene, defChar.root.position.add(new Vector3(0, 1.2, 0)), special ? 'glitch' : 'sparks');
          beatHit(!mine, mine && move?.slam ? 'finisher' : mine && move?.launch ? 'heavy' : special ? 'finisher' : WEIGHT_OF[key]);
          if (mine && move?.launch) { foeLaunchedSec = LAUNCH_AIR_SEC; console.info('[KVS-STORM] LAUNCHED — air string open'); } else if (mine && move?.air && !move.slam) foeLaunchedSec = Math.max(foeLaunchedSec, 0.5); else if (mine && move?.slam) foeLaunchedSec = 0;   // STORM: the launcher puts him up, air links keep him there, the spike brings him down   // the DRAGON launches (knockdown → floor → get up)
          knockback(ctx, defChar, atkChar.root.position, atk.knockback);
          const hud: Record<string, HudValue> = mine
            ? { foeHp: defState.hp, chi: Math.round(atkState.chi) }
            : { hp: defState.hp, foeChi: Math.round(atkState.chi) };
          if (route) {
            // the route's payoff lands on its LAST hit, on top of what applyHit already did
            const bonus = Math.max(1, Math.round(dealt * (route.payoff - 1) * damageScale(ratings)));
            defState.hp = Math.max(0, defState.hp - bonus);
            const shake = routeShake(route.fx);
            ctx.juice.hitStop(routeHitStopMs(route.fx));
            ctx.juice.shake(shake.amp, shake.ms);
            ctx.feel?.impact?.(route.fx === 3 ? 0.7 : 0.45);
            // a completed ROUTE is the mode's signature play -- it is what earns ON FIRE here
            if (mine) ctx.momentum.report({ kind: 'chain', weight: route.fx === 3 ? 26 : 14 });
            EffectsKit.burst(ctx.scene, defChar.root.position.add(new Vector3(0, 1.3, 0)), route.fx === 3 ? 'glitch' : 'sparks');
            SoundKit.play('impact', { pitch: route.fx === 3 ? 0.72 : 0.9, volume: 0.65 });
            if (route.fx === 3) SoundKit.play('crowdCheer', { volume: 0.6 });
            // the ender is what the route DOES beyond damage: a launch or a knockdown puts him on the floor
            if (route.ender !== 'stun') beatDown(!mine, route.ender === 'launch' ? 1.7 : 1.2);
            landed.length = 0;                     // a completed route is spent; start the next one
            if (mine) hud.foeHp = defState.hp; else hud.hp = defState.hp;
            hud.banner = mine ? `${route.label}! — ${dealt + bonus} DMG` : `RIVAL ${route.label}!`;
            console.info(`[KVS-ROUTE] ${route.label} fx${route.fx} payoff ${route.payoff} bonus ${bonus} mine ${mine}`);
          } else if (atkState.combo >= 2) {
            hud.banner = mine ? `COMBO x${atkState.combo} — ${dealt} DMG` : `RIVAL COMBO x${atkState.combo}`;
          }
          ctx.setHud(hud);
          if (route || atkState.combo >= 2) setTimeout(() => ctx.setHud({ banner: '' }), route ? 900 : 700);
          if (defState.hp <= 0) endRound(ctx, mine);
          break;
        }
      }
    };
    if (mine) setTimeout(onHitBeat, hitDelay); else foeTimers.push({ left: atk.startupMs / 1000, fn: onHitBeat });
  }

  /** P7: the rival's hit on a BODY player, resolved at its impact against the body's state then (DefenseLedger): a slip's
   *  i-frames whiff it (a read: the perfect dodge's pay), a raise inside the body's parry window parries it, a guard held
   *  blocks it (the guard gauge as ever), else it lands. The live guard is restored after (a break keeps it down). */
  function bodyOutcome(atk: AttackDef, dist: number, impactAt: number): ReturnType<typeof resolveStrike> {
    const bd = bodyDefenseAt(ledger, impactAt);
    if (bd.d === 'evaded' && dist <= atk.range && meState.controllable) {
      const r = dodgeReward(Math.max(0, (impactAt - bd.evadeOnset!) / 1000));
      if (r.perfect) { meCounter = r.counterSec; focus.gain(FOCUS.dodgeGain); ctx0.juice.slowMo(0.45, Math.round(r.slowMoSec * 1000)); ctx0.setHud({ banner: 'PERFECT DODGE' }); setTimeout(() => ctx0.setHud({ banner: '' }), 600); }
      console.info('[KVS-DEF] body slip — whiff');
      return 'whiff';
    }
    // (the pad's block counts too, as it stood AT the impact: held then, or pressed inside the pad's parry window before it —
    // a pad in hand while the body drives; the review, 2026-09-26)
    const held = meState.blockHeld, press = meState.lastBlockPressMs, padPress = padBlock.pressWithin(impactAt, PARRY_WINDOW_MS);
    meState.blockHeld = bd.d === 'blocked' || padBlock.heldAt(impactAt);
    meState.lastBlockPressMs = bd.d === 'parried' || bd.d === 'guardImpact' ? impactAt : padPress ?? -1e9;
    const out = resolveStrike(atk, dist, meState, impactAt, undefined, BODY_PARRY_WINDOW_MS);
    meState.blockHeld = out === 'guardBreak' ? false : held;
    meState.lastBlockPressMs = press;
    console.info(`[KVS-DEF] body ${bd.d} → ${out} (${Math.round(now() - impactAt)} ms late)`);
    return out;
  }

  /** P7: the ledger follows the body's own guard, per packet and per frame: 'down' lets a body block go (a pad's X held keeps
   *  its own); a guard the ledger holds that the fighter has not taken up — held through the round's start, through a
   *  stagger, or its up refused in the intro — is taken up as soon as the fighter can (the body is the one playing then:
   *  the review, 2026-09-26). What a waiting hit needs is kept (deferred.oldest). */
  function bodyLedgerFrame(view: BodyView, t: number): void {
    const g = ledger.frame(view, t, deferred.oldest);
    if (g === 'down' && bodyGuard) { bodyGuard = false; if (!padBlock.held) meState.releaseBlock(); }
    else if (ledger.guardUp && !bodyGuard && phase === 'fighting' && meState.controllable) { drive.body(t); bodyGuard = true; meState.blockHeld = true; }
  }

  /** P7: one fight-read event from the body. Taken (true) only in the fight, with the player free to act; everything else
   *  (the intro, a round's end, a stagger) is refused silently — false, so the harness counts no input (a shadow-boxer
   *  between rounds gets no banner storm). */

  function onBodyEvent(ctx: ModeContext, ev: BodyEvent, view: BodyView): boolean {
    const t = now();
    bodyLedgerFrame(view, t);
    if (phase !== 'fighting') return false;
    if (ev.kind !== 'blow' && ev.kind !== 'legKick' && ev.kind !== 'guard' && ev.kind !== 'evade' && ev.kind !== 'fightStep') return false;
    const it: BodyFightIntent | null = bodyDriver.intent(ev, view, t);
    if (!it) return false;
    if (it.kind === 'guard') ledger.guard(it);
    if (!meState.controllable) return false;
    drive.body(t);
    switch (it.kind) {
      case 'guard':
        if (it.up) { meState.blockHeld = true; if (it.raise) meState.lastBlockPressMs = it.onsetPage; } else if (!padBlock.held) meState.releaseBlock();
        bodyGuard = it.up;
        console.info(`[KVS-BODY] guard ${it.up ? (it.raise ? 'raise' : 'up') : 'down'}`);
        return true;
      case 'strike':
        swing(ctx, true, TOKEN_KEY[it.token], { move: MOVES[it.move], onsetPage: it.onsetPage, body: it.body });
        return true;
      case 'evade': {
        const r = ctx.camDirector.rightFlat();
        const d = it.side === null ? Vector3.Zero() : r.scale(it.side === 'L' ? -1 : 1);   // the player's own left is the screen's left (the camera is behind)
        // (the i-frames only with the slip itself: refused on its cooldown, the slip whiffs nothing — the review, 2026-09-26:
        // a bob every 250 ms was invulnerable ~75 % of the time)
        if (!meEvade.slip(d.x, d.z)) return false;
        ledger.evade(it);
        console.info(`[KVS-BODY] ${it.form}${it.side ?? ''}`);
        return true;
      }
      case 'step': {
        const sp = stepSpace(it.dir);
        const to = rival.root.position.subtract(player.root.position); to.y = 0;
        const along = to.lengthSquared() > 1e-4 ? to.normalize() : ctx.camDirector.forwardFlat();
        const v = along.scale(sp.along).addInPlace(ctx.camDirector.rightFlat().scale(-sp.across));
        bodyShift = { v: v.scale(1 / 0.25), left: 0.25 };
        console.info(`[KVS-BODY] step ${it.dir}`);
        return true;
      }
    }
  }

  function endRound(ctx: ModeContext, playerWon: boolean): void {
    if (phase !== 'fighting') return;
    setPhase('roundOver');
    if (playerWon) myWins++; else foeWins++;
    // THE RIVAL FEELS THE SCOREBOARD NOW. Its difficulty was fixed at construction, so it fought a decider
    // exactly the way it fought round one -- the constant-opponent problem RivalNerve solved for the dunk
    // contest and nowhere else in the game. Nerve keeps the invariant: pressing when behind is paid for in
    // errors, so losing a round is never strictly better than winning one.
    {
      const sit = standingOf(foeWins, myWins, ROUNDS_TO_WIN, Math.min(1, Math.max(myWins, foeWins) / ROUNDS_TO_WIN));
      const shift = nerve(sit);
      brain.setNerve(shift.aggression, shift.mistake);
      if (shift.label) console.info(`[KAR-NERVE] ${shift.label} (rounds ${foeWins}-${myWins})`);
    }
    SoundKit.play(playerWon ? 'crowdCheer' : 'crowdGroan');
    if (playerWon) roundWinBeat(ctx);
    endStrike(true); endStrike(false);
    animOf(!playerWon).out = true;                                   // KO: knockdown, then the floor until the next round
    animOf(playerWon).celebrateUntil = now() + CELEBRATE_SEC * 1000;
    ctx.setHud({
      wins: myWins, foeWins,
      banner: playerWon ? `ROUND ${round} — YOU` : `ROUND ${round} — RIVAL SENSEI`,
    });
    setTimeout(() => {
      ctx.setHud({ banner: '' });
      if (myWins >= ROUNDS_TO_WIN || foeWins >= ROUNDS_TO_WIN) {
        setPhase('matchOver');
        const won = myWins > foeWins;
        SoundKit.play('whistle');
        if (won) { matchPunch(ctx); EffectsKit.burst(ctx.scene, player.root.position.add(new Vector3(0, 2, 0)), 'confetti'); }
        ctx.end(won ? 'MATCH_WON' : 'MATCH_LOST', myWins * 100 - foeWins * 40, { rounds: round, foeWins });
        return;
      }
      round++;
      startRound(ctx);
    }, 2200);
  }

  function startRound(ctx: ModeContext): void {
    meState.resetRound(); foeState.resetRound(); book.reset(); xBtn.reset(); padBlock.reset(); queuedKey = null; meDash = null; meDashIframeSec = 0; meDashUntil = 0; foeLaunchedSec = 0; rival.root.position.y = 0;   // STORM
    deferred.clear(); ledger.reset(); bodyShift = null;   // P7
    player.root.position.set(0, 0, 2.2);
    rival.root.position.set(0, 0, -2.2);
    player.root.rotation.y = Math.atan2(rival.root.position.x - player.root.position.x, rival.root.position.z - player.root.position.z);
    rival.root.rotation.y = wrapYaw(player.root.rotation.y + Math.PI);   // a ROUND START is a cut, not a turn: they are placed facing each other
    resetAnim(meAnim); resetAnim(foeAnim);
    striking = false; foeStriking = false; slowmoSec = 0;
    setPhase('fighting');
    ctx.setHud({
      hp: meState.hp, foeHp: foeState.hp, guard: 100, foeGuard: 100,
      chi: 0, foeChi: 0, round: `${round}`, wins: myWins, foeWins,
      hint: 'Chain hits for combos · tap BLOCK at the last instant to parry · full chi turns HEAVY into the DRAGON',
    });
  }

  return {
    modeId: 'karate-vs', mood: 'dojoWarm', camPreset: 'fight',
    // MOVEMENT PLAY P7: the body's own strikes, guard, slips and steps (the cut line's switch: bodyFightFlags)
    ...(BODY_FIGHT.karate_vs ? { body: { claims: FIGHT_CLAIMS, lines: FIGHT_CARD_LINES }, onBody: onBodyEvent } : {}),

    async load(ctx: ModeContext) {
      // ship pass 4: the venue spec (with its baked map) first; the kit venue only if no spec
      arena = readCombatArena('karate_vs');
      console.info(`[ARENA] karate_vs · ${describeArena(arena)}`);
      modeVenue = mountVenue(ctx, 'karate_h2h', { keepGameplayCamera: true, arena });
      if (!modeVenue) VenueKit.buildDojo(ctx.scene);
      arenaHandle?.dispose(); arenaHandle = buildArena(ctx.scene, arena);
      const crowdR = (arena.shape.kind === 'disc' ? arena.shape.radius : Math.max(arena.shape.halfX, arena.shape.halfZ)) + 2.6;
      crowd = new Onlookers(ctx.scene, Array.from({ length: 14 }, (_, i) => {
        const a = (i / 14) * Math.PI * 2 + 0.22;
        return new Vector3(Math.sin(a) * crowdR, 0, Math.cos(a) * crowdR);   // outside the arena's walls
      }), '#3B2A52');
      player = await CharacterLibrary.spawn(ctx.scene, CFG.heroUrl, {
        position: new Vector3(0, 0, 2.2), yawRad: Math.PI, startClip: IDLE_CLIP,   // BIOMECH-WAVE2 G1/G3: they SPAWN facing each other — the round start used to be a 180° yaw snap on both bodies
      });
      ring?.dispose(); ring = mountPlayerRing(ctx.scene, player.root, { color: '#38bdf8', icon: readPlayerIcon() });   // PLAYER RING: the guard gauge at the feet, the creator glyph beside it
      neverBindPose(player.animator, IDLE_CLIP);
      installSafePlay(player.animator, 'karate-vs-player');
      ctx.groundLock?.track(player.root, player.skeleton);

      rival = await CharacterLibrary.spawn(ctx.scene, CFG.heroUrl, {
        position: new Vector3(0, 0, -2.2), yawRad: 0, tint: '#8b1e2d', startClip: IDLE_CLIP,
      });
      neverBindPose(rival.animator, IDLE_CLIP);
      installSafePlay(rival.animator, 'karate-vs-rival');
      ctx.groundLock?.track(rival.root, rival.skeleton);
      meAnim = newFighterAnim(new CombatAnimTree(player.animator));
      foeAnim = newFighterAnim(new CombatAnimTree(rival.animator));
      meAnim.tree.onSettle = (st) => { if (st.startsWith('strike_')) endStrike(true); };
      // phase 6 seam: when does the rival's swing land? (−1 = nothing in flight) — the probe's perfect-dodge / parry driver reads it
      (ctx.scene.metadata ??= {}).fight = { landsIn: () => (foeImpactAt === null ? -1 : Math.max(0, (foeImpactAt - now()) / 1000)) };
      foeAnim.tree.onSettle = (st) => { if (st.startsWith('strike_')) endStrike(false); };
      mePosture?.dispose(); foePosture?.dispose();
      mePosture = mountPostureLayer(ctx.scene, player.skeleton, player.root, () => feedFor(meBio, () => rival, meMotion, 1 - meState.guard / GUARD_MAX), 'KVS-PP');
      foePosture = mountPostureLayer(ctx.scene, rival.skeleton, rival.root, () => feedFor(foeBio, () => player, foeMotion, 1 - foeState.guard / GUARD_MAX), 'KVS-PP-FOE');
      if (process.env.NODE_ENV === 'development') {
        const dev = (window as unknown as { __FEL_DEV__?: { combatPosture?: unknown } }).__FEL_DEV__;
        if (dev) dev.combatPosture = { me: () => mePosture?.layer.get() ?? null, foe: () => foePosture?.layer.get() ?? null, bio: () => ({ me: { ...meBio }, foe: { ...foeBio } }), aim: () => { const a = chestOf(rival); return { x: a.x, y: a.y, z: a.z }; } };   // BIOMECH-WAVE2 probes
      }

      meState = new FighterState(100);
      foeState = new FighterState(100);
      brain = new RivalFightBrain(BASE_RIVAL_DIFFICULTY, KARATE_ATTACKS);
      // read once at mount — a style cannot change mid-fight, and re-deriving it per strike would be work
      // on the hot path for a value that never moves
      myAttacks = styleAttacks(KARATE_ATTACKS, blendTraits(readBlend()), MIN_STARTUP_SEC * 1000);
      round = 1; myWins = 0; foeWins = 0; matchLatch = false; heavyAt = 0;
      myLanded = []; foeLanded = [];
      // `?fight=` sets MY ratings so the earned routes and the DRAGON can actually be driven and measured;
      // without a PRQ scan plumbed into the modes both fighters are a baseline body.
      if (typeof window !== 'undefined') {
        const q = new URLSearchParams(window.location.search).get('fight');
        const v = Number(q);
        if (Number.isFinite(v) && v > 0) {
          myRatings = ratingsFrom({ agility: v, speed: v, flexibility: v, power: v, strength: v, mental: v });
          console.info(`[KVS-STYLE] ratings quickness ${myRatings.quickness.toFixed(0)} force ${myRatings.force.toFixed(0)} (override)`);
        }
      }

      SoundKit.startAmbient('dojo');
      EffectsKit.ambient(ctx.scene, 'dojo');
      ctx.heroRef.current = player.root;
      ctx.objectiveRef.current = rival.root.position;
      ctx.camDirector.snapTo(player.root.position, rival.root.position);
      assertSpawned(ctx.scene, { hero: player.root, minWorldMeshes: 5, modeId: 'karate-vs' });

      setPhase('intro');
      ctx.setHud({ banner: 'BEST OF 3 — RIVAL SENSEI', hp: 100, foeHp: 100, chi: 0, foeChi: 0, round: '1', wins: 0, foeWins: 0 });
      setTimeout(() => { ctx.setHud({ banner: '' }); startRound(ctx); }, 1800);
    },

    onInput(ctx: ModeContext, e: FelInput) {
      SoundKit.unlock();
      if (e.t === 'stick' && e.side === 'L') { stickX = e.x; stickY = e.y; }
      // P7: who is driving — a real press or push is the pad's (the body's own outputs carry src 'body')
      if (e.src !== 'body' && ((e.t === 'button' && e.pressed) || (e.t === 'stick' && Math.hypot(e.x, e.y) > 0.35))) drive.pad(now());
      if (e.t === 'trigger' && e.side === 'R') focusHeld = e.value > 0.35;   // MATRIX FOCUS
      if (e.t === 'stick' && e.side === 'R') { lookX = e.x; lookY = e.y; }   // MODE-STICK-FACE: R stick → the director's look orbit
      if (phase !== 'fighting' || !meState.controllable) return;

      if (e.t === 'button' && e.pressed) {
        if (e.btn === 'A') swing(ctx, true, 'jab');
        if (e.btn === 'B') swing(ctx, true, 'kick');
        if (e.btn === 'Y') swing(ctx, true, 'heavy');
        if (e.btn === 'X') { meState.pressBlock(now()); padBlock.press(now()); xBtn.press(now() / 1000); }   // STORM: the press arms the parry AND starts the tap clock   // the tree shows the block (blockHeld → block_hold)
        // L1 ROLLS and R1 JUMPS. The four face buttons are spoken for (A jab, B kick, Y heavy, X guard), so
        // the new verbs go on the shoulders rather than overloading a strike -- the same reasoning the dunk
        // contest's CALL went to L1 for. A neutral stick rolls BACKWARDS: the panic input should be the
        // defensive one.
        if (e.btn === 'L1' && wallRun) wallKickOff(ctx);   // MATRIX: the kick off the wall
        else if (e.btn === 'L1' && meState.controllable && focus.active && !wallKick && phase === 'fighting' && tryWallRun(ctx)) { /* MATRIX: up onto the wall */ }
        else if (e.btn === 'L1' && meState.controllable && !wallKick) {
          const dir = Math.hypot(stickX, stickY) > 0.2
            ? ctx.camDirector.forwardFlat().scale(-stickY).addInPlace(ctx.camDirector.rightFlat().scale(stickX))
            : ctx.camDirector.forwardFlat().scale(1);   // neutral: away from the rival the camera is looking at
          if (meEvade.roll(dir.x, dir.z)) {
            // THE REWARD IS A READ, NOT A PRESS (DodgeRead). The window is binary: dodging early pays
            // NOTHING, because any payout for a mistimed press makes mashing optimal again.
            const secTo = foeImpactAt === null ? null : (foeImpactAt - now()) / 1000;
            const r = dodgeReward(secTo);
            if (r.perfect) {
              focus.gain(FOCUS.dodgeGain);   // MATRIX: a read refills Focus
              meCounter = r.counterSec;
              ctx.juice.slowMo(0.45, Math.round(r.slowMoSec * 1000));
              ctx.feel?.impact?.(0.3);
              ctx.momentum.report({ kind: 'near_miss', weight: 14 });
              SoundKit.play('powerUp', { volume: 0.5, pitch: 1.3 });
              ctx.setHud({ banner: r.label ?? '' });
              setTimeout(() => ctx.setHud({ banner: '' }), 800);
            } else {
              SoundKit.play('whoosh', { pitch: 1.2, volume: 0.35 });
            }
          }
        }
        if (e.btn === 'R1' && meState.controllable) {
          if (meEvade.jump()) SoundKit.play('whoosh', { pitch: 0.9, volume: 0.3 });
        }
      }
      if (e.t === 'button' && !e.pressed && e.btn === 'X') { padBlock.release(now()); if (!bodyGuard) meState.releaseBlock(); const g = xBtn.release(now() / 1000); if (g === 'tap' || g === 'double') tryDash(ctx, g === 'double'); }   // STORM: a tap is the dash, a double the chakra dash, a hold was the guard (P7: a body guard still up keeps the block)
    },

    update(ctx: ModeContext, dt: number) {
      ctx0 = ctx;
      phaseSec += dt;
      { const bv = ctx.body?.(); if (bv) bodyLedgerFrame(bv, now()); deferred.flush(ledger, now()); }   // P7: the body's deferred hits
      crowd?.update(dt);
      if (phaseSec > BUDGET_SEC[phase]) {
        console.warn(`[FEL-WATCHDOG] karate-vs stuck in "${phase}" — auto-advancing`);
        if (phase === 'fighting') endRound(ctx, meState.hp >= foeState.hp);
        else if (phase === 'intro' || phase === 'roundOver') startRound(ctx);
        return;
      }
      if (phase !== 'fighting') { faceEachOther(dt); animate(0, 0); return; }   // the trees still run: the loser holds the floor, the winner celebrates

      // scoped slow-mo (parry payoff) — scales this mode's clock only
      slowmoSec = Math.max(0, slowmoSec - dt);
      const sdt = slowmoSec > 0 ? dt * SLOWMO_SCALE : dt;
      // MATRIX FOCUS: the trigger holds bullet time — the rival on the room's clock, me on mine (a clock per rig)
      const wasFocus = focus.active;
      if (focusHeld && !focus.active) { if (focus.start()) onFocusStart(ctx); } else if (!focusHeld && focus.active) focus.stop();
      if (focus.tick(dt)) onFocusEnd(ctx, true); else if (wasFocus && !focus.active) onFocusEnd(ctx, false);
      if (wasFocus !== focus.active) { rival.animator.setTimeScale(focus.worldScale); player.animator.setTimeScale(focus.heroScale); }
      { const fv = Math.round(focus.value); if (fv !== focusHud || focus.active !== focusHudOn) { focusHud = fv; focusHudOn = focus.active; ctx.setHud({ focus: fv, focusOn: focus.active }); } }
      const sdtRoom = sdt * focus.worldScale, sdtHero = sdt * focus.heroScale;
      for (let i = foeTimers.length - 1; i >= 0; i--) { foeTimers[i].left -= sdtRoom; if (foeTimers[i].left <= 0) { const t = foeTimers.splice(i, 1)[0]; t.fn(); } }

      meState.tick(sdtHero); foeState.tick(sdtRoom);
      // A route must not complete across two unrelated exchanges: when FightCore closes the combo window it
      // zeroes `combo`, so the landed sequence is dropped on the same beat.
      if (meState.combo === 0 && myLanded.length) myLanded = [];
      if (foeState.combo === 0 && foeLanded.length) foeLanded = [];

      // player movement — lock-on: always face the rival, stick strafes/closes.
      // MODE-STICK-FACE (2026-09-07): the stick is CAMERA-relative. The fight camera fits both fighters from behind the
      // player, so its flat forward IS the line to the rival — up closes, down retreats, right is SCREEN right. The old
      // world-axis read (x, 0, y) was right only while the camera looked exactly down −z; once it had swung round the
      // rival (it does, every exchange) stick-right ran screen-LEFT (measured Δscreen −2.5 m). No axis is flipped.
      const moveVel = ctx.camDirector.forwardFlat().scale(-stickY * MOVE_SPEED).addInPlace(ctx.camDirector.rightFlat().scale(stickX * MOVE_SPEED));
      lastMyVel = meDash ? meDash.dir.scale(DASH.speed) : moveVel;   // FREE RUN
      // the roll outranks the stick: while it owns the body the stick is ignored entirely, which is the
      // commitment that makes it a read rather than a better walk
      const rollVel = meEvade.update(sdtHero);
      meCounter = tickCounter(meCounter, sdtHero);
      let mySpeed01 = moveVel.length() / MOVE_SPEED;   // the INTENT, striking or not: a strike that runs out under a held stick settles straight into the guard step
      if (meDash) {   // STORM: the dash owns the body — a burst, or the chakra dash that homes on the rival and stops a reach short
        if (meDash.homing) { const toFoe = rival.root.position.subtract(player.root.position); toFoe.y = 0; if (toFoe.length() <= DASH.homingStopM) meDash.left = 0; else meDash.dir = toFoe.normalize(); }
        player.root.position.addInPlace(meDash.dir.scale((meDash.homing ? DASH.homingSpeed : DASH.speed) * sdtHero));
        arenaClamp(player.root.position, arena);
        meDash.left -= sdtHero; if (meDash.left <= 0) meDash = null;
        mySpeed01 = 1;
      } else if (rollVel) {
        player.root.position.addInPlace(rollVel.scale(sdtHero));
        modeVenue?.constrain(player.root.position);
        arenaClamp(player.root.position, arena);
        mySpeed01 = 0;
      } else if (meState.controllable && !striking && !meState.blockHeld) {
        const vel = moveVel;
        const before = player.root.position.clone();
        player.root.position.addInPlace(vel.scale(sdtHero));
        arenaClamp(player.root.position, arena);
        if (sdtHero > 0 && Vector3.Distance(before, player.root.position) / sdtHero < 0.3) mySpeed01 = 0;   // pinned on the boundary: no stepping on the spot
      }
      // P7 AUTO-SPACING: a body player has no stick — a strike out of range closes a little, a step in / out / across moves
      // the fighter; a stick past its dead zone always wins
      if (bodyShift) {
        if (Math.hypot(stickX, stickY) > 0.35 || !meState.controllable) bodyShift = null;
        else { const step = Math.min(sdtHero, bodyShift.left); player.root.position.addInPlace(bodyShift.v.scale(step)); arenaClamp(player.root.position, arena); bodyShift.left -= step; if (bodyShift.left <= 0) bodyShift = null; }
      }

      ring?.set(meState.guard / GUARD_MAX);   // PLAYER RING: the guard gauge
      meDashIframeSec = Math.max(0, meDashIframeSec - sdtHero);   // STORM ticks
      if (queuedKey) {   // STORM: the queued link fires at the cancel point (or the settle), and goes stale after 0.4 s
        const st = animOf(true).strike;
        if (now() - queuedKey.at > 400) queuedKey = null;
        else if (!striking || (st && st.cancelFrom !== undefined && now() >= st.cancelFrom)) { const k = queuedKey.key, b = queuedKey.body; queuedKey = null; swing(ctx, true, k, b); }
      }
      if (foeLaunchedSec > 0) { foeLaunchedSec = Math.max(0, foeLaunchedSec - sdtRoom); rival.root.position.y = launchHeight(1 - foeLaunchedSec / LAUNCH_AIR_SEC); if (foeLaunchedSec === 0) rival.root.position.y = 0; }
      // rival AI
      if (!tickMatrix(ctx, sdtHero)) player.root.position.y = meEvade.height;   // the arc is EvadeMoves'; nothing here integrates gravity — unless the wall run / kick owns the body (MATRIX)
      arenaHandle?.tick(dt); if (arena.hazards.length) tickHazards(ctx, sdtRoom);
      const action = brain.decide(sdtRoom, rival.root.position, player.root.position, foeState, striking);
      if (action.block && !foeState.blockHeld) foeState.pressBlock(now());
      if (!action.block && foeState.blockHeld) foeState.releaseBlock();
      if (action.attack) swing(ctx, false, action.attack);
      let foeSpeed01 = Math.min(1, Math.hypot(action.moveX, action.moveY));   // the brain's INTENT, striking or not — the strike's settle lands on the step, not a one-frame stance
      const foeVel = new Vector3(action.moveX, 0, -action.moveY).scale(MOVE_SPEED * 0.92);
      lastFoeVel = foeVel;   // FREE RUN
      if (foeState.controllable && !foeStriking && !foeState.blockHeld) {
        const vel = foeVel;
        const before = rival.root.position.clone();
        rival.root.position.addInPlace(vel.scale(sdtRoom));
        arenaClamp(rival.root.position, arena);
        foeSpeed01 = sdtRoom > 0 && Vector3.Distance(before, rival.root.position) / sdtRoom < 0.3 ? 0 : vel.length() / MOVE_SPEED;   // the step only while the body moves
      }

      faceEachOther(dt);
      // guard HUD trickle (regen is invisible otherwise)
      ctx.setHud({ guard: Math.round(meState.guard), foeGuard: Math.round(foeState.guard) });
      ctx.camDirector.look(lookX, lookY, dt);
      ctx.camDirector.update(player.root.position, moveVel, rival.root.position);
      animate(mySpeed01, foeSpeed01, moveVel, foeVel);
    },

    dispose() {
      mePosture?.dispose(); mePosture = null; foePosture?.dispose(); foePosture = null;
      crowd?.dispose(); crowd = null;
      modeVenue?.dispose?.(); modeVenue = null; arenaHandle?.dispose(); arenaHandle = null; wallRun = null; wallKick = null;
      ring?.dispose(); ring = null;
      player?.dispose(); rival?.dispose(); SoundKit.stopAmbient();
    },
  };
})();

// HUD CONTRACT (bare values — bezel decorates):
//   hp / foeHp (0-100), guard / foeGuard (0-100), chi / foeChi (0-100),
//   round (string), wins / foeWins (number), banner, hint.
