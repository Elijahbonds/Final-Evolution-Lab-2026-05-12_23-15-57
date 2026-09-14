// MixedCombatMode — NEW mode (`modeId: 'mixedcombat'`, route
// `/play/mixedcombat`) — the weapon-fighter duel (M53, Phase 3). Design
// reference is the spacing game of classic 3D weapon fighters (mechanics
// only — entirely original content): 8-way movement around a locked-on
// opponent, reach-vs-speed matchups, and RING-OUTS.
//
//   THE RING — a raised octagonal platform. Step (or get knocked) past the
//     edge and you FALL: instant round loss, no matter how much HP you had.
//     Every knockback attack is therefore also a positional weapon, and
//     fighting with your back to the edge is a real mistake.
//   LOADOUTS — before each round, d-pad picks your style:
//       FISTS — short reach, fast startup (the karate attack set)
//       STAFF — long reach, slow startup, bigger knockback (a procedural
//               bo-staff mesh in the fighter's hand — no new assets)
//     The rival always takes the OPPOSITE loadout, so every round is a
//     genuine reach-vs-speed matchup, not a mirror match.
//   Everything FightCore gives Karate VS is in force here too: hit-stun
//   combos, guard gauge with breaks, the 160ms parry, full-chi special
//   (whose huge knockback is THE ring-out tool).
// Best of 3. Reliability standard since M42: installSafePlay, watchdogs,
// groundLock (released on a ring-out fall), fight-cam framing.

import { EvadeMoves } from '../core/EvadeMoves';
import { dodgeReward, tickCounter, counterMult } from '../core/DodgeRead';
import { nerve, standingOf } from '../core/Nerve';
import { MeshBuilder, StandardMaterial, Color3, Vector3 } from '@babylonjs/core';
import type { AbstractMesh } from '@babylonjs/core';
import { CharacterLibrary, type SpawnedCharacter } from '../core/CharacterLibrary';
import { neverBindPose } from '../anim/importSanitizer';
import { installSafePlay } from '../anim/clipRegistry';
import { CombatAnimTree, type CombatAnimInput, type CombatAnimState, type StrikeWeight } from '../anim/combatTree';
// BIOMECH-WAVE2 (2026-09-09) — the game-wide bar on the weapon duel (SPEC-FEL-BIOMECH-GAMEWIDE G1–G6). Same four
// findings as Karate VS, plus the one this mode owns: a RING-OUT victim was still being re-aimed at his opponent every
// frame on the way down the pit (`faceEachOther` ran from the falling branch's `animate` path), so the body that had
// just been knocked off the platform spun to keep facing the winner while it fell.
import { mountPostureLayer, type PostureLayer } from '../anim/PostureLayer';
import { combatPose, COMBAT_INPUT_IDLE, COMBAT_TURN_RATE, combatApproach, type CombatPostureInput } from '../core/CombatPosture';
import { BodyMotion, dynamicPose, COMBAT_DYNAMIC } from '../core/DynamicPosture';   // footwork answers its MOTION
import { lockOnYaw, strafeAxis, wrapYaw } from '../core/Biomech';
import {
  FighterState, RivalFightBrain, resolveStrike, applyHit,
  KARATE_ATTACKS, STAFF_ATTACKS, SPECIAL_ATTACK, CHI_MAX, GUARD_MAX, PARRY_STAGGER_SEC,
  STEP_CHI_GAIN, type AttackDef,
} from '../core/FightCore';
import { SoundKit } from '../audio/SoundKit';
import {
  BASELINE_RATINGS, ratingsFrom, routeFor, routeHitStopMs, routeShake, damageScale, hasFightMove, cancelWindowSec,
  type FightRatings, type RouteStrike,
} from '../core/FighterStyle';   // the same routes and the same PRQ gate as Karate VS — one vocabulary
import { EffectsKit } from '../visual/EffectsKit';
import { Onlookers } from '../visual/Onlookers';
import { assertSpawned } from '../core/FrameGuard';
import type { ModeContext, ModeDefinition, HudValue } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import { KARATE_CONFIG as CFG } from './modeConfigs';
import { readWeapon } from '../combat/arsenal';
import { readBlend, blendTraits } from '../combat/schools';
import { styleAttacks } from '../combat/loadout';
import { MIN_STARTUP_SEC } from '../core/StrikeSystem';
import { boneNode } from '../anim/boneLookup';

type Phase = 'loadout' | 'fighting' | 'roundOver' | 'matchOver';
type Loadout = 'fists' | 'staff';
const ROUNDS_TO_WIN = 2;
/** What the rival fights at in a level match. Nerve moves it from here as the rounds go. */
const BASE_RIVAL_DIFFICULTY = 0.6;
const RING_RADIUS = 6.2;
const MOVE_SPEED = 3.3;
const SLOWMO_SEC = 0.5;
const SLOWMO_SCALE = 0.3;
// ANIM-READABILITY (combat, 2026-09-07): the CombatAnimTree is the ONE owner of each fighter's clips — the mode latches
// beats with a wall-clock window and feeds the tree once per frame; it never plays a clip itself. Same three-owner
// jumble as Karate VS before (per-frame stance play + the swing's onEnd chain + the hit branches): one-frame stance
// flashes with 0.5 m hand pops after every rival strike, guard steps on the spot, an invisible block. See combatTree.ts.
const IDLE_CLIP = 'karate_idle_stance';
const REACT_SEC = 0.32, LAUNCH_SEC = 1.0, PARRY_SEC = 0.3, IMPACT_SEC = 0.24, CELEBRATE_SEC = 1.2, GET_UP_SEC = 0.45, STRIKE_MAX_SEC = 1.5;
const REACT_STATES: CombatAnimState[] = ['react_light', 'react_medium', 'react_heavy', 'react_launch'];
interface FighterAnim {
  tree: CombatAnimTree;
  strike: { weight: StrikeWeight; clip: string; until: number } | null;
  hitBy: StrikeWeight | null; hitUntil: number;
  parryUntil: number; impactUntil: number; downUntil: number; celebrateUntil: number;
  out: boolean; falling: boolean;
}
const newFighterAnim = (tree: CombatAnimTree): FighterAnim => ({ tree, strike: null, hitBy: null, hitUntil: 0, parryUntil: 0, impactUntil: 0, downUntil: 0, celebrateUntil: 0, out: false, falling: false });
const WEIGHT_OF: Record<'jab' | 'kick' | 'heavy', StrikeWeight> = { jab: 'light', kick: 'medium', heavy: 'heavy' };
const LOADOUT_LABEL: Record<Loadout, string> = { fists: 'FISTS — fast & close', staff: 'STAFF — long & heavy' };

const BUDGET_SEC: Record<Phase, number> = { loadout: 12, fighting: 120, roundOver: 5, matchOver: 999 };

export const MixedCombatMode: ModeDefinition = (() => {
  let player: SpawnedCharacter, rival: SpawnedCharacter;
  let meState: FighterState, foeState: FighterState;
  let brain: RivalFightBrain;
  let phase: Phase = 'loadout';
  let phaseSec = 0;
  let round = 1, myWins = 0, foeWins = 0;
  /** PRQ gates the vocabulary (FighterStyle), shared with Karate VS so a route means the same thing in both. */
  let myRatings: FightRatings = { ...BASELINE_RATINGS };
  const foeRatings: FightRatings = { ...BASELINE_RATINGS };
  let myLanded: RouteStrike[] = [], foeLanded: RouteStrike[] = [];
  // Set from the start-up screen's pick in load(), NEVER here. This factory body runs when the mode registry
  // is BUILT, which on Next happens during SSR where there is no window and no URL — read here, every pick
  // resolved to the default and (measured, live) `?weapon=staff` gave the STAFF TO THE OPPONENT, because the
  // foe's loadout is derived as the opposite of the player's. Same class as the mood getter on the racing
  // modes: anything a player chose has to be read after the page exists.
  let myLoadout: Loadout = 'fists';
  /** The player's strikes with their chosen school applied. The rival fights the unstyled tables. */
  let myStyled: Record<'jab' | 'kick' | 'heavy', AttackDef> | null = null;
  let striking = false, foeStriking = false;
  let slowmoSec = 0, falling = false;
  let meAnim: FighterAnim, foeAnim: FighterAnim;
  // BIOMECH-WAVE2 G5: the Posture Poses layer on both fighters (see the header). The staff loadout makes it matter more
  // here than in Karate VS — a bo is held in front of the CHEST, and the chest was wherever the last clip left it.
  let mePosture: { layer: PostureLayer; dispose(): void } | null = null, foePosture: { layer: PostureLayer; dispose(): void } | null = null;
  const meBio: CombatPostureInput = { ...COMBAT_INPUT_IDLE }, foeBio: CombatPostureInput = { ...COMBAT_INPUT_IDLE };
  const chestOf = (c: SpawnedCharacter): Vector3 => c.root.position.add(new Vector3(0, 1.32, 0));
  // DYNAMIC POSTURE for the footwork — the same layer and the same allowlist as Karate VS, so a circling body leans
  // the same way in both. The ring-out matters here: a fighter backing toward the edge should LOOK like it.
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
    console.info(`[MC-JUICE] heavy punch (${tag})`);
  }
  function roundWinBeat(ctx: ModeContext): void { ctx.juice.shake(0.08, 140); ctx.juice.flash('#fff6dd', 90); console.info('[MC-JUICE] round win'); }
  function matchPunch(ctx: ModeContext): void {
    if (matchLatch) return; matchLatch = true;
    ctx.juice.hitStop(60); ctx.juice.shake(0.14, 160); ctx.juice.flash('#FFD700', 140);
    console.info('[MC-JUICE] match punch');
  }
  let fallVictim: 'me' | 'foe' | null = null;
  let myStaff: AbstractMesh | null = null, foeStaff: AbstractMesh | null = null;
  let stickX = 0, stickY = 0;
  // ROLL, JUMP AND THE DODGE READ (2026-09-14). EvadeMoves rather than CombatMovement: this mode writes
  // its own camera-relative velocity and owns a ring-out check, neither of which survives a migration.
  const meEvade = new EvadeMoves();
  let meCounter = 0;
  /** When the rival's in-flight strike would connect (game clock); null when nothing is incoming. */
  let foeImpactAt: number | null = null;
  let lookX = 0, lookY = 0;   // R stick → camera look (MODE-STICK-FACE family, 2026-09-07)
  let gallery: Onlookers | null = null;

  const foeLoadout = (): Loadout => (myLoadout === 'fists' ? 'staff' : 'fists');
  const myAttacks = (): Record<'jab' | 'kick' | 'heavy', AttackDef> =>
    myStyled ?? (myLoadout === 'staff' ? STAFF_ATTACKS : KARATE_ATTACKS);
  const foeAttacks = (): Record<'jab' | 'kick' | 'heavy', AttackDef> => (foeLoadout() === 'staff' ? STAFF_ATTACKS : KARATE_ATTACKS);

  function setPhase(p: Phase): void { phase = p; phaseSec = 0; }
  function now(): number { return performance.now(); }

  function buildArena(ctx: ModeContext): void {
    const scene = ctx.scene;
    // the octagon ring — top face exactly at y=0 so groundLock just works
    const ring = MeshBuilder.CreateCylinder('mc_ring', {
      diameter: RING_RADIUS * 2 + 0.6, height: 1.4, tessellation: 8,
    }, scene);
    ring.position.y = -0.7;
    const ringMat = new StandardMaterial('mc_ring_m', scene);
    ringMat.diffuseColor = Color3.FromHexString('#8a6d4a');
    ringMat.specularColor = Color3.Black();
    ring.material = ringMat;
    // edge marker — a thin bright rim so the danger zone reads at a glance
    const rim = MeshBuilder.CreateTorus('mc_rim', { diameter: RING_RADIUS * 2, thickness: 0.09, tessellation: 8 }, scene);
    rim.position.y = 0.02;
    const rimMat = new StandardMaterial('mc_rim_m', scene);
    rimMat.emissiveColor = Color3.FromHexString('#ffb347');
    rimMat.disableLighting = true;
    rim.material = rimMat;
    // the drop — a dark floor far below sells the fall
    const pit = MeshBuilder.CreateGround('mc_pit', { width: 60, height: 60 }, scene);
    pit.position.y = -6;
    const pitMat = new StandardMaterial('mc_pit_m', scene);
    pitMat.diffuseColor = Color3.FromHexString('#101418');
    pitMat.specularColor = Color3.Black();
    pit.material = pitMat;
    // corner braziers (emissive spheres, off the ring, never between cam and fighters)
    for (const a of [0.5, 1.5, 2.5, 3.5]) {
      const x = Math.cos(a * Math.PI / 2) * (RING_RADIUS + 2.5);
      const z = Math.sin(a * Math.PI / 2) * (RING_RADIUS + 2.5);
      const post = MeshBuilder.CreateCylinder(`mc_post_${a}`, { height: 2.4, diameter: 0.18 }, scene);
      post.position.set(x, -0.7, z);
      post.material = ringMat;
      const flame = MeshBuilder.CreateSphere(`mc_flame_${a}`, { diameter: 0.45 }, scene);
      flame.position.set(x, 0.75, z);
      const fm = new StandardMaterial(`mc_flame_m_${a}`, scene);
      fm.emissiveColor = Color3.FromHexString('#ff7b3d');
      fm.disableLighting = true;
      flame.material = fm;
    }
    // the pit-fighter's floor: a broad dark apron around the platform for the
    // crowd to stand on (the platform occludes its center; the visible ring
    // reads as the room)
    const floor = MeshBuilder.CreateCylinder('mc_floor', { diameter: 26, height: 0.2, tessellation: 24 }, scene);
    floor.position.y = -0.12;
    const floorMat = new StandardMaterial('mc_floor_m', scene);
    floorMat.diffuseColor = Color3.FromHexString('#1a1d24');
    floorMat.specularColor = Color3.Black();
    floor.material = floorMat;
  }

  function makeStaff(ctx: ModeContext, char: SpawnedCharacter, name: string): AbstractMesh | null {
    const hand = boneNode(char.skeleton, 'RightHand');
    if (!hand) return null;
    const staff = MeshBuilder.CreateCylinder(name, { height: 1.9, diameter: 0.05 }, ctx.scene);
    const m = new StandardMaterial(`${name}_m`, ctx.scene);
    m.diffuseColor = Color3.FromHexString('#5a3d22');
    m.specularColor = Color3.Black();
    staff.material = m;
    staff.parent = hand;
    staff.position.set(0, 0.1, 0);
    staff.rotation.set(Math.PI / 2, 0, 0);
    return staff;
  }

  function applyLoadouts(ctx: ModeContext): void {
    myStaff?.dispose(); myStaff = null;
    foeStaff?.dispose(); foeStaff = null;
    // THE START-UP SCREEN'S PICK. This mode fights with fists or a staff; the blade and the gauntlet are not
    // its weapons, so anything else falls back to fists rather than mismatching a prop with a moveset.
    myLoadout = readWeapon().id === 'staff' ? 'staff' : 'fists';
    // weapon first, then style — see combat/loadout.ts for why that order is the rule
    myStyled = styleAttacks(myLoadout === 'staff' ? STAFF_ATTACKS : KARATE_ATTACKS,
                            blendTraits(readBlend()), MIN_STARTUP_SEC * 1000);
    if (myLoadout === 'staff') myStaff = makeStaff(ctx, player, 'mc_staff_me');
    if (foeLoadout() === 'staff') foeStaff = makeStaff(ctx, rival, 'mc_staff_foe');
    brain = new RivalFightBrain(BASE_RIVAL_DIFFICULTY, foeAttacks());
  }

  const downNow = (f: FighterAnim | undefined): boolean => !!f && (f.out || f.falling || now() < f.downUntil);
  /** G1: a striker is COMMITTED to their line (no re-tracking mid-swing — without it the auto-face erases every sidestep
   *  and the step grammar can never fire: measured, 150 s of orbiting, zero steps), and outside a swing the lock-on now
   *  TURNS at a pivot rate instead of writing atan2 onto the root. A floored, KO'd or FALLING body is left alone. */
  function faceEachOther(dt: number): void {
    const p = player.root.position, r = rival.root.position;
    if (!striking && !downNow(meAnim)) player.root.rotation.y = lockOnYaw(p, r, player.root.rotation.y, COMBAT_TURN_RATE, dt);
    if (!foeStriking && !downNow(foeAnim)) rival.root.rotation.y = lockOnYaw(r, p, rival.root.rotation.y, COMBAT_TURN_RATE, dt);
  }

  // ── the tree's inputs (ANIM-READABILITY) ──
  function animOf(mine: boolean): FighterAnim { return mine ? meAnim : foeAnim; }
  /** A fighter's swing is over — naturally (the tree's settle) or interrupted (hit / parried / broken / ring-out / round end). */
  function endStrike(mine: boolean): void { if (mine) striking = false; else foeStriking = false; animOf(mine).strike = null; }
  function beatHit(mine: boolean, weight: StrikeWeight): void {
    const f = animOf(mine); f.hitBy = weight; f.hitUntil = now() + (weight === 'finisher' ? LAUNCH_SEC : REACT_SEC) * 1000;
    f.tree.clearBeat(...REACT_STATES);   // a second hit inside the first react re-fires it
    endStrike(mine);
  }
  function beatDown(mine: boolean, staggerSec: number): void { const f = animOf(mine); f.downUntil = now() + (staggerSec - GET_UP_SEC) * 1000; f.tree.clearBeat('knockdown'); endStrike(mine); }
  function beatParry(mine: boolean): void { const f = animOf(mine); f.parryUntil = now() + PARRY_SEC * 1000; f.tree.clearBeat('parry_flash'); }
  function beatGuardImpact(mine: boolean): void { const f = animOf(mine); f.impactUntil = now() + IMPACT_SEC * 1000; f.tree.clearBeat('guard_impact'); }
  function treeInput(f: FighterAnim, s: FighterState, speed01: number, weapon: boolean, mine: boolean, vel: Vector3): CombatAnimInput {
    const t = now();
    if (f.strike && t > f.strike.until) endStrike(f === meAnim);   // a strike the tree never settled (safety, never measured)
    const me = mine ? player : rival, foe = mine ? rival : player;
    // G2 — a ring fighter travels SIDEWAYS (the whole 8-way spacing game is lateral): the feet now match the travel
    const strafe = strafeAxis(vel, me.root.rotation.y);
    const toFoe = foe.root.position.subtract(me.root.position); toFoe.y = 0;
    const closing = toFoe.lengthSquared() > 1e-6 ? Vector3.Dot(vel, toFoe.normalize()) : 0;
    const moving = s.controllable && !s.blockHeld ? speed01 : 0;
    const bio = mine ? meBio : foeBio;
    bio.speed01 = moving; bio.strafe = strafe; bio.approach = combatApproach(closing);
    bio.striking = f.strike?.weight ?? null; bio.windingUp = false;
    bio.blocking = s.blockHeld; bio.parrying = t < f.parryUntil; bio.guardImpact = t < f.impactUntil;
    bio.hitBy = t < f.hitUntil ? f.hitBy : null; bio.down = t < f.downUntil; bio.out = f.out || f.falling;
    bio.rising = false; bio.dodging = mine ? meEvade.rolling : false; bio.celebrating = t < f.celebrateUntil; bio.engaged = phase === 'fighting';
    return {
      speed01: moving, strafe, backing: strafe === 0 && bio.approach < 0, dashing: false, hasWeapon: weapon,
      rolling: mine ? meEvade.rolling : false, airborne: mine ? meEvade.airborne : false,
      striking: f.strike?.weight ?? null, strikeClip: f.strike?.clip,
      blocking: s.blockHeld, parryFlash: t < f.parryUntil, guardImpactFlash: t < f.impactUntil,
      hitBy: t < f.hitUntil ? f.hitBy : null, down: t < f.downUntil, out: f.out, falling: f.falling, ulting: false, celebrating: t < f.celebrateUntil,
      speedMps: Math.hypot(vel.x, vel.z),   // STRIDE MATCHING: real ground speed, not the normalised one
    };
  }
  /** Once per frame, both fighters, every phase (a ring-out victim falls, the loser holds the floor, the winner celebrates). */
  function animate(mySpeed01: number, foeSpeed01: number, myVel = Vector3.Zero(), foeVel = Vector3.Zero()): void {
    if (!meAnim || !foeAnim) return;
    const dt = 1 / 60;
    if (player) meMotion.update(myVel.x, myVel.z, player.root.rotation.y, dt);
    if (rival) foeMotion.update(foeVel.x, foeVel.z, rival.root.rotation.y, dt);
    meAnim.tree.update(treeInput(meAnim, meState, mySpeed01, myLoadout === 'staff', true, myVel));
    foeAnim.tree.update(treeInput(foeAnim, foeState, foeSpeed01, foeLoadout() === 'staff', false, foeVel));
  }
  function resetAnim(f: FighterAnim): void { f.strike = null; f.hitBy = null; f.hitUntil = 0; f.parryUntil = 0; f.impactUntil = 0; f.downUntil = 0; f.celebrateUntil = 0; f.out = false; f.falling = false; f.tree.reset(); }

  function offRing(pos: Vector3): boolean {
    return Math.hypot(pos.x, pos.z) > RING_RADIUS;
  }

  /** G3: constant SPEED, so the distance sets the duration — a jab's 0.4 m shove and the special's ring-out shove used
   *  to take the same 180 ms, which is why the DRAGON read as a teleport rather than as the thing that ends rounds. */
  const KNOCKBACK_SPEED = 9;
  function knockback(ctx: ModeContext, char: SpawnedCharacter, fromPos: Vector3, meters: number, onDone: () => void): void {
    const dir = char.root.position.subtract(fromPos); dir.y = 0;
    if (dir.lengthSquared() < 1e-4) { onDone(); return; }
    dir.normalize();
    const from = char.root.position.clone();
    const to = from.add(dir.scale(meters));       // deliberately NOT clamped — the edge is live
    const ms = Math.max(80, (Vector3.Distance(from, to) / KNOCKBACK_SPEED) * 1000);
    const t0 = now();
    const obs = ctx.scene.onBeforeRenderObservable.add(() => {
      const u = Math.min(1, (now() - t0) / ms);
      const k = 1 - (1 - u) * (1 - u);
      char.root.position.x = from.x + (to.x - from.x) * k;
      char.root.position.z = from.z + (to.z - from.z) * k;
      if (u >= 1) { ctx.scene.onBeforeRenderObservable.remove(obs); onDone(); }
    });
  }

  function ringOut(ctx: ModeContext, victimIsMe: boolean): void {
    if (phase !== 'fighting' || falling) return;
    falling = true;
    fallVictim = victimIsMe ? 'me' : 'foe';
    const victim = victimIsMe ? player : rival;
    // The falling body leaves the world — it is no longer the camera's (or
    // FrameGuard's) subject. The survivor on the ring is.
    const survivor = victimIsMe ? rival : player;
    ctx.heroRef.current = survivor.root;
    ctx.groundLock?.release(victim.root);
    SoundKit.play('miss', { pitch: 0.6 });
    SoundKit.play('crowdGroan', { volume: 0.6 });
    endStrike(victimIsMe); animOf(victimIsMe).falling = true;   // the tree plays the fall, then holds the floor
    gallery?.cheer(1);
    const fall = ctx.scene.onBeforeRenderObservable.add(() => {
      victim.root.position.y -= 0.14;
      if (victim.root.position.y < -5.5) ctx.scene.onBeforeRenderObservable.remove(fall);
    });
    ctx.setHud({ banner: victimIsMe ? 'RING OUT — YOU FELL!' : 'RING OUT!' });
    endRound(ctx, !victimIsMe, true);
  }

  /** One swing, either direction. */
  function swing(ctx: ModeContext, mine: boolean, key: 'jab' | 'kick' | 'heavy'): void {
    const atkState = mine ? meState : foeState;
    const defState = mine ? foeState : meState;
    const atkChar = mine ? player : rival;
    const defChar = mine ? rival : player;
    if (!atkState.controllable || (mine ? striking : foeStriking) || falling) return;

    const set = mine ? myAttacks() : foeAttacks();
    // the finisher is EARNED as well as charged — full chi is the cost, force is the licence
    const special = key === 'heavy' && atkState.chi >= CHI_MAX && hasFightMove('dragon', mine ? myRatings : foeRatings);
    const atk: AttackDef = special ? SPECIAL_ATTACK : set[key];
    if (mine) striking = true; else foeStriking = true;
    // Commit to the line at swing start — the impact check measures the
    // defender's offset from THIS facing, not from wherever the mesh has
    // been rotated to by impact time.
    const committedYaw = atkChar.root.rotation.y;
    if (special) {
      atkState.chi = 0;
      ctx.setHud({ ...(mine ? { chi: 0 } : { foeChi: 0 }), banner: mine ? 'DRAGON!' : 'RIVAL DRAGON!' });
      SoundKit.play('powerUp', { pitch: 0.7 });
      setTimeout(() => ctx.setHud({ banner: '' }), 700);
    }
    SoundKit.play('whoosh', { pitch: special ? 0.8 : 1.05 });
    animOf(mine).strike = { weight: special ? 'finisher' : WEIGHT_OF[key], clip: atk.clip, until: now() + STRIKE_MAX_SEC * 1000 };   // the tree plays it; its settle ends the swing

    // the dodge window is read against when THIS strike would connect -- see DodgeRead
    if (!mine) foeImpactAt = now() + atk.startupMs;
    setTimeout(() => {
      if (phase !== 'fighting' || falling) { endStrike(mine); return; }
      const dist = Vector3.Distance(atkChar.root.position, defChar.root.position);
      // The Soul Calibur read: WHERE the defender stands relative to the
      // COMMITTED attack line, not just how far. Facing is atan2(dx, dz), so
      // the right axis is (-cos, 0, sin); the defender's offset along it is
      // what a sidestep changes.
      const toDef = defChar.root.position.subtract(atkChar.root.position);
      const lateral = Math.abs(toDef.x * -Math.cos(committedYaw) + toDef.z * Math.sin(committedYaw));
      const outcome = resolveStrike(atk, dist, defState, now(), lateral);
      switch (outcome) {
        case 'whiff': break;
        case 'stepped': {
          // A vertical whiffed past a moving defender — the grammar's core
          // defensive play. The stepper is PAID (chi) and both players are
          // told why the swing missed, so the lesson lands in one read.
          defState.chi = Math.min(CHI_MAX, defState.chi + STEP_CHI_GAIN);
          SoundKit.play('whoosh', { pitch: 1.5, volume: 0.35 });
          ctx.setHud({
            banner: mine ? 'STEPPED! — verticals lose to movement' : 'STEPPED IT! — press the advantage',
            ...(mine ? { foeChi: Math.round(defState.chi) } : { chi: Math.round(defState.chi) }),
          });
          setTimeout(() => ctx.setHud({ banner: '' }), 900);
          break;
        }
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
          ctx.feel?.impact?.(0.5);   // ONE thud (the 0.5-pitch impact SFX that stacked on it is gone)
          // THE METER HEARS THE FIGHT. `mine` already says who swung, so the same event is a highlight for
          // one fighter and a blunder for the other -- reported from the one branch that knows.
          ctx.momentum.report({ kind: mine ? 'clean_hit' : 'blunder', weight: mine ? 14 : -10 });
          ctx.juice.shake(0.08, 120);
          console.info('[MC-JUICE] guard break');
          EffectsKit.burst(ctx.scene, defChar.root.position.add(new Vector3(0, 1.2, 0)), 'glitch');
          beatDown(!mine, defState.staggerSec);   // knock down → floor → get up inside the stagger
          gallery?.cheer(0.6);
          ctx.setHud({ banner: mine ? 'GUARD BREAK!' : 'YOUR GUARD SHATTERED!', ...(mine ? { foeGuard: 0 } : { guard: 0 }) });
          setTimeout(() => ctx.setHud({ banner: '' }), 900);
          break;
        }
        case 'hit': {
          applyHit(atkState, defState, atk);
          ctx.feel?.impact?.(special ? 0.6 : 0.3);   // ONE thud per connect (the impact SFX that doubled it is gone)
          ctx.momentum.report(mine ? { kind: 'clean_hit', weight: special ? 16 : 9 } : { kind: 'blunder', weight: -8 });
          if (special || key === 'heavy') heavyPunch(ctx, special ? 'special' : 'heavy'); else console.info('[MC-JUICE] hit');
          EffectsKit.burst(ctx.scene, defChar.root.position.add(new Vector3(0, 1.2, 0)), special ? 'glitch' : 'sparks');
          beatHit(!mine, special ? 'finisher' : WEIGHT_OF[key]);   // the DRAGON launches (knockdown → floor → get up)
          // THE SAME ROUTES AS KARATE VS. A combo was a counter here too, so jab-jab-jab and jab-kick-heavy
          // were worth the same. Matched on the TAIL of the landed strikes; a quick body holds the window
          // open longer (cancelWindowSec), which is what the quickness rating buys.
          const landed = mine ? myLanded : foeLanded;
          const ratings = mine ? myRatings : foeRatings;
          atkState.comboTimer = cancelWindowSec(ratings);
          landed.push(key as RouteStrike);
          if (landed.length > 6) landed.shift();
          const route = routeFor(landed, ratings);
          const hud: Record<string, HudValue> = mine
            ? { foeHp: defState.hp, chi: Math.round(atkState.chi) }
            : { hp: defState.hp, foeChi: Math.round(atkState.chi) };
          if (route) {
            const bonus = Math.max(1, Math.round(atk.dmg * (route.payoff - 1) * damageScale(ratings)));
            defState.hp = Math.max(0, defState.hp - bonus);
            const shake = routeShake(route.fx);
            ctx.juice.hitStop(routeHitStopMs(route.fx));
            ctx.juice.shake(shake.amp, shake.ms);
            ctx.feel?.impact?.(route.fx === 3 ? 0.7 : 0.45);
            // a completed ROUTE is the mode's signature play -- it is what earns ON FIRE here
            if (mine) ctx.momentum.report({ kind: 'chain', weight: route.fx === 3 ? 26 : 14 });
            EffectsKit.burst(ctx.scene, defChar.root.position.add(new Vector3(0, 1.3, 0)), route.fx === 3 ? 'glitch' : 'sparks');
            SoundKit.play('impact', { pitch: route.fx === 3 ? 0.72 : 0.9, volume: 0.65 });
            if (route.ender !== 'stun') beatHit(!mine, 'finisher');
            landed.length = 0;
            if (mine) hud.foeHp = defState.hp; else hud.hp = defState.hp;
            hud.banner = mine ? `${route.label}!` : `RIVAL ${route.label}!`;
            console.info(`[MC-ROUTE] ${route.label} fx${route.fx} bonus ${bonus} mine ${mine}`);
          } else if (atkState.combo >= 2) {
            hud.banner = mine ? `COMBO x${atkState.combo}` : `RIVAL COMBO x${atkState.combo}`;
          }
          ctx.setHud(hud);
          if (route || atkState.combo >= 2) setTimeout(() => ctx.setHud({ banner: '' }), route ? 900 : 700);
          // knockback resolves BEFORE the KO check — the edge is always live
          knockback(ctx, defChar, atkChar.root.position, atk.knockback, () => {
            if (offRing(defChar.root.position)) { ringOut(ctx, defChar === player); return; }
            if (defState.hp <= 0) endRound(ctx, mine);
          });
          break;
        }
      }
    }, atk.startupMs);
  }

  function endRound(ctx: ModeContext, playerWon: boolean, wasRingOut = false): void {
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
      if (shift.label) console.info(`[MIX-NERVE] ${shift.label} (rounds ${foeWins}-${myWins})`);
    }
    SoundKit.play(playerWon ? 'crowdCheer' : 'crowdGroan');
    if (playerWon) roundWinBeat(ctx);
    endStrike(true); endStrike(false);
    if (!wasRingOut) animOf(!playerWon).out = true;                  // KO: knockdown, then the floor until the loadout (a ring-out victim is already falling)
    animOf(playerWon).celebrateUntil = now() + CELEBRATE_SEC * 1000;
    ctx.setHud({
      wins: myWins, foeWins,
      banner: playerWon ? `ROUND ${round} — YOU` : `ROUND ${round} — RIVAL`,
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
      enterLoadout(ctx);
    }, 2400);
  }

  function enterLoadout(ctx: ModeContext): void {
    // recover any fallen fighter before the next round (untrack first so
    // re-tracking never duplicates a groundLock entry)
    falling = false;
    fallVictim = null;
    ctx.heroRef.current = player.root;
    player.root.position.set(0, 0, 2.2);
    rival.root.position.set(0, 0, -2.2);
    ctx.groundLock?.untrack(player.root);
    ctx.groundLock?.untrack(rival.root);
    ctx.groundLock?.track(player.root, player.skeleton);
    ctx.groundLock?.track(rival.root, rival.skeleton);
    resetAnim(meAnim); resetAnim(foeAnim);
    setPhase('loadout');
    ctx.setHud({
      banner: '', loadout: LOADOUT_LABEL[myLoadout],
      hint: 'D-PAD or STICK up/down — pick FISTS or STAFF (rival takes the other) · any attack button to lock in',
    });
  }

  function startRound(ctx: ModeContext): void {
    meState.resetRound(); foeState.resetRound();
    applyLoadouts(ctx);
    player.root.rotation.y = Math.atan2(rival.root.position.x - player.root.position.x, rival.root.position.z - player.root.position.z);
    rival.root.rotation.y = wrapYaw(player.root.rotation.y + Math.PI);   // a ROUND START is a cut, not a turn
    striking = false; foeStriking = false; slowmoSec = 0; falling = false;
    setPhase('fighting');
    ctx.setHud({
      hp: meState.hp, foeHp: foeState.hp, guard: 100, foeGuard: 100,
      chi: Math.round(meState.chi), foeChi: Math.round(foeState.chi),
      round: `${round}`, wins: myWins, foeWins, loadout: LOADOUT_LABEL[myLoadout],
      hint: 'Knock them past the glowing edge for a RING OUT · side-step verticals (A/Y), punish steppers with the sweep (B) · tap GUARD at the last instant to parry',
    });
  }

  return {
    modeId: 'mixedcombat', mood: 'goldenHour', camPreset: 'fight',

    async load(ctx: ModeContext) {
      buildArena(ctx);
      player = await CharacterLibrary.spawn(ctx.scene, CFG.heroUrl, {
        position: new Vector3(0, 0, 2.2), yawRad: Math.PI, startClip: IDLE_CLIP,   // BIOMECH-WAVE2 G1/G3: spawned facing each other (the round start used to snap both bodies 180°)
      });
      neverBindPose(player.animator, IDLE_CLIP);
      installSafePlay(player.animator, 'mixedcombat-player');
      ctx.groundLock?.track(player.root, player.skeleton);

      rival = await CharacterLibrary.spawn(ctx.scene, CFG.heroUrl, {
        position: new Vector3(0, 0, -2.2), yawRad: 0, tint: '#1e3a8b', startClip: IDLE_CLIP,
      });
      neverBindPose(rival.animator, IDLE_CLIP);
      installSafePlay(rival.animator, 'mixedcombat-rival');
      ctx.groundLock?.track(rival.root, rival.skeleton);
      meAnim = newFighterAnim(new CombatAnimTree(player.animator));
      foeAnim = newFighterAnim(new CombatAnimTree(rival.animator));
      meAnim.tree.onSettle = (st) => { if (st.startsWith('strike_')) endStrike(true); };
      foeAnim.tree.onSettle = (st) => { if (st.startsWith('strike_')) endStrike(false); };
      mePosture?.dispose(); foePosture?.dispose();
      mePosture = mountPostureLayer(ctx.scene, player.skeleton, player.root, () => feedFor(meBio, () => rival, meMotion, 1 - meState.guard / GUARD_MAX), 'MC-PP');
      foePosture = mountPostureLayer(ctx.scene, rival.skeleton, rival.root, () => feedFor(foeBio, () => player, foeMotion, 1 - foeState.guard / GUARD_MAX), 'MC-PP-FOE');
      if (process.env.NODE_ENV === 'development') {
        const dev = (window as unknown as { __FEL_DEV__?: { combatPosture?: unknown } }).__FEL_DEV__;
        if (dev) dev.combatPosture = { me: () => mePosture?.layer.get() ?? null, foe: () => foePosture?.layer.get() ?? null, bio: () => ({ me: { ...meBio }, foe: { ...foeBio } }), aim: () => { const a = chestOf(rival); return { x: a.x, y: a.y, z: a.z }; } };   // BIOMECH-WAVE2 probes
      }

      meState = new FighterState(100);
      foeState = new FighterState(100);
      round = 1; myWins = 0; foeWins = 0; myLoadout = 'fists'; matchLatch = false; heavyAt = 0;
      myLanded = []; foeLanded = [];
      if (typeof window !== 'undefined') {
        const v = Number(new URLSearchParams(window.location.search).get('fight'));
        if (Number.isFinite(v) && v > 0) {
          myRatings = ratingsFrom({ agility: v, speed: v, flexibility: v, power: v, strength: v, mental: v });
          console.info(`[MC-STYLE] ratings quickness ${myRatings.quickness.toFixed(0)} force ${myRatings.force.toFixed(0)} (override)`);
        }
      }
      applyLoadouts(ctx);

      SoundKit.startAmbient('dojo');
      EffectsKit.ambient(ctx.scene, 'park');
      // L4 — a pit fight is WATCHED. A ring of onlookers on the apron,
      // outside the braziers, answering the big moments.
      gallery = new Onlookers(ctx.scene,
        Array.from({ length: 14 }, (_, i) => {
          const a = (i / 14) * Math.PI * 2;
          return new Vector3(Math.cos(a) * 10.6, 0, Math.sin(a) * 10.6);
        }));
      ctx.heroRef.current = player.root;
      ctx.objectiveRef.current = rival.root.position;
      ctx.camDirector.snapTo(player.root.position, rival.root.position);
      assertSpawned(ctx.scene, { hero: player.root, minWorldMeshes: 5, modeId: 'mixedcombat' });

      enterLoadout(ctx);
    },

    onInput(ctx: ModeContext, e: FelInput) {
      SoundKit.unlock();
      if (e.t === 'stick' && e.side === 'L') { stickX = e.x; stickY = e.y; }
      if (e.t === 'stick' && e.side === 'R') { lookX = e.x; lookY = e.y; }   // MODE-STICK-FACE: R stick → the director's look orbit

      if (phase === 'loadout') {
        if (e.t === 'dpad' && e.pressed) {
          myLoadout = e.dir === 'down' ? 'staff' : 'fists';
          SoundKit.play('uiTick');
          ctx.setHud({ loadout: LOADOUT_LABEL[myLoadout] });
        }
        // Controller Link phones send d-pad as left-stick ('move' idiom), so
        // the loadout pick has to live on the stick too or phone players are
        // locked into fists forever. Stick DOWN ≡ d-pad DOWN (staff): the
        // bus maps S to +1 and W to −1.
        if (e.t === 'stick' && e.side === 'L' && Math.abs(e.y) > 0.6) {
          const pick: Loadout = e.y > 0 ? 'staff' : 'fists';
          if (pick !== myLoadout) {
            myLoadout = pick;
            SoundKit.play('uiTick');
            ctx.setHud({ loadout: LOADOUT_LABEL[myLoadout] });
          }
        }
        if (e.t === 'button' && e.pressed && (e.btn === 'A' || e.btn === 'B' || e.btn === 'Y')) {
          SoundKit.play('powerUp', { pitch: 1.3, volume: 0.3 });
          startRound(ctx);
        }
        return;
      }

      if (phase !== 'fighting' || !meState.controllable || falling) return;
      if (e.t === 'button' && e.pressed) {
        if (e.btn === 'A') swing(ctx, true, 'jab');
        if (e.btn === 'B') swing(ctx, true, 'kick');
        if (e.btn === 'Y') swing(ctx, true, 'heavy');
        if (e.btn === 'X') meState.pressBlock(now());   // the tree shows the block (blockHeld → block_hold)
        // L1 ROLLS, R1 JUMPS -- the four faces are spoken for. A neutral stick rolls BACKWARDS: the panic
        // input should be the defensive one.
        //
        // AND A ROLL CAN RING YOU OUT. This mode's whole shape is a raised octagon, so the roll is checked
        // against the SAME `offRing` the walk is, not exempted from it. That is the point rather than a
        // hazard: 3.2 m of committed travel inside a 6.2 m ring means a panicked roll near the edge kills
        // you, which is exactly the tension a ring-out mode is for.
        if (e.btn === 'L1' && meState.controllable) {
          const dir = Math.hypot(stickX, stickY) > 0.2
            ? ctx.camDirector.forwardFlat().scale(-stickY).addInPlace(ctx.camDirector.rightFlat().scale(stickX))
            : ctx.camDirector.forwardFlat().scale(1);
          if (meEvade.roll(dir.x, dir.z)) {
            const secTo = foeImpactAt === null ? null : (foeImpactAt - now()) / 1000;
            const r = dodgeReward(secTo);
            if (r.perfect) {
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
      if (e.t === 'button' && !e.pressed && e.btn === 'X') meState.releaseBlock();
    },

    update(ctx: ModeContext, dt: number) {
      phaseSec += dt;
      gallery?.update(dt);
      if (phaseSec > BUDGET_SEC[phase]) {
        console.warn(`[FEL-WATCHDOG] mixedcombat stuck in "${phase}" — auto-advancing`);
        if (phase === 'fighting') endRound(ctx, meState.hp >= foeState.hp);
        else if (phase === 'loadout') startRound(ctx);
        else if (phase === 'roundOver') enterLoadout(ctx);
        return;
      }
      if (phase !== 'fighting' || falling) {
        // During a ring-out fall the camera must NOT chase the body into the
        // pit: below the platform the ring's own wall boxes in every probe
        // azimuth, and the falling hero slides off the bottom of the frame
        // (both measured as FEL-FRAME findings). Hold on the SURVIVOR at ring
        // level, looking at the edge the victim went over.
        const onTheRing = (fallVictim === 'me' ? rival : player).root.position;
        const wentOver = (fallVictim === 'me' ? player : rival).root.position.clone();
        wentOver.y = Math.max(0, wentOver.y);
        ctx.camDirector.update(onTheRing, Vector3.Zero(), wentOver);
        animate(0, 0);   // the trees still run: the victim falls / the loser holds the floor / the winner celebrates
        return;
      }

      slowmoSec = Math.max(0, slowmoSec - dt);
      const sdt = slowmoSec > 0 ? dt * SLOWMO_SCALE : dt;
      meState.tick(sdt); foeState.tick(sdt);
      // a route must not complete across two unrelated exchanges
      if (meState.combo === 0 && myLanded.length) myLanded = [];
      if (foeState.combo === 0 && foeLanded.length) foeLanded = [];

      // player 8-way movement — NO clamp: walking off the edge is a real
      // (terrible) option, which is what makes edge pressure meaningful.
      // MODE-STICK-FACE (2026-09-07): CAMERA-relative — up = the camera's flat forward (the rival, whom the fight camera
      // looks at from behind the player), right = screen right. The world-axis read walked up-stick AWAY from the rival
      // (Δscreen −3.4 m toward the camera) and mirrored X whenever the camera had swung. No axis is flipped.
      const moveVel = ctx.camDirector.forwardFlat().scale(-stickY * MOVE_SPEED).addInPlace(ctx.camDirector.rightFlat().scale(stickX * MOVE_SPEED));
      const rollVel = meEvade.update(sdt);
      meCounter = tickCounter(meCounter, sdt);
      const mySpeed01 = rollVel ? 0 : moveVel.length() / MOVE_SPEED;   // the INTENT, striking or not: a strike that runs out under a held stick settles straight into the guard step
      if (rollVel) {
        // the roll owns the body AND takes the same ring check the walk does -- see the input branch
        player.root.position.addInPlace(rollVel.scale(sdt));
        if (offRing(player.root.position)) { ringOut(ctx, true); animate(0, 0); return; }
      } else if (meState.controllable && !striking && !meState.blockHeld) {
        const vel = moveVel;
        player.root.position.addInPlace(vel.scale(sdt));
        if (offRing(player.root.position)) { ringOut(ctx, true); animate(0, 0); return; }
      }
      player.root.position.y = meEvade.height;   // the arc is EvadeMoves'; nothing here integrates gravity

      // rival AI (its brain uses its own loadout's ranges); it never
      // voluntarily steps off — clamp ITS walk to the ring, so only
      // knockback can send it over
      const action = brain.decide(sdt, rival.root.position, player.root.position, foeState, striking);
      if (action.block && !foeState.blockHeld) foeState.pressBlock(now());
      if (!action.block && foeState.blockHeld) foeState.releaseBlock();
      if (action.attack) swing(ctx, false, action.attack);
      let foeSpeed01 = Math.min(1, Math.hypot(action.moveX, action.moveY));   // the brain's INTENT, striking or not — the strike's settle lands on the step, not a one-frame stance
      const foeVel = new Vector3(action.moveX, 0, -action.moveY).scale(MOVE_SPEED * 0.9);
      if (foeState.controllable && !foeStriking && !foeState.blockHeld) {
        const vel = foeVel;
        const before = rival.root.position.clone();
        rival.root.position.addInPlace(vel.scale(sdt));
        const r = Math.hypot(rival.root.position.x, rival.root.position.z);
        if (r > RING_RADIUS - 0.3) {
          const s = (RING_RADIUS - 0.3) / r;
          rival.root.position.x *= s; rival.root.position.z *= s;
        }
        foeSpeed01 = sdt > 0 && Vector3.Distance(before, rival.root.position) / sdt < 0.3 ? 0 : vel.length() / MOVE_SPEED;   // the step only while the body moves
      }

      faceEachOther(dt);
      // Edge legibility — the ring-out is the signature, so the danger has
      // to be READABLE: warn when YOUR back is near the rim, and name the
      // opening when the RIVAL's is. Soul Calibur teaches this with stage
      // design and camera; the bezel is where we can afford it.
      const myR = Math.hypot(player.root.position.x, player.root.position.z);
      const foeR = Math.hypot(rival.root.position.x, rival.root.position.z);
      const edge = myR > RING_RADIUS - 1.6 ? 'EDGE BEHIND YOU' : foeR > RING_RADIUS - 1.6 ? 'RIVAL ON THE EDGE' : null;
      ctx.setHud({ guard: Math.round(meState.guard), foeGuard: Math.round(foeState.guard), edge });
      ctx.camDirector.look(lookX, lookY, dt);
      ctx.camDirector.update(player.root.position, moveVel, rival.root.position);
      animate(mySpeed01, foeSpeed01, moveVel, foeVel);
    },

    dispose() {
      mePosture?.dispose(); mePosture = null; foePosture?.dispose(); foePosture = null;
      myStaff?.dispose(); foeStaff?.dispose();
      gallery?.dispose(); gallery = null;
      player?.dispose(); rival?.dispose(); SoundKit.stopAmbient();
    },
  };
})();

// HUD CONTRACT (bare values — bezel decorates): hp/foeHp, guard/foeGuard,
// chi/foeChi, round, wins/foeWins, loadout (string), banner, hint,
// edge ('EDGE BEHIND YOU' | 'RIVAL ON THE EDGE' | null).
