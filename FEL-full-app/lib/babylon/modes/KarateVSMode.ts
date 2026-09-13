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
import { lockOnYaw, strafeAxis, wrapYaw } from '../core/Biomech';
import { VenueKit } from '../visual/VenueKit';
import { mountVenue, type VenueHandle } from '../core/NexusVenue';
import { Onlookers } from '../visual/Onlookers';
import {
  FighterState, RivalFightBrain, resolveStrike, applyHit,
  KARATE_ATTACKS, SPECIAL_ATTACK, CHI_MAX, GUARD_MAX, PARRY_STAGGER_SEC, type AttackDef,
} from '../core/FightCore';
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

let modeVenue: VenueHandle | null = null;   // ship pass 4: the mounted venue spec, disposed with the mode
let crowd: Onlookers | null = null;         // Pass 7 phase 6: a ring of onlookers on the gravel, as the endless gauntlet has

type Phase = 'intro' | 'fighting' | 'roundOver' | 'matchOver';
const ROUNDS_TO_WIN = 2;
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
const ARENA_HALF = 4.5;
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
  strike: { weight: StrikeWeight; clip: string; until: number } | null;
  hitBy: StrikeWeight | null; hitUntil: number;
  parryUntil: number; impactUntil: number; downUntil: number; celebrateUntil: number;
  out: boolean;
}
const newFighterAnim = (tree: CombatAnimTree): FighterAnim => ({ tree, strike: null, hitBy: null, hitUntil: 0, parryUntil: 0, impactUntil: 0, downUntil: 0, celebrateUntil: 0, out: false });
const WEIGHT_OF: Record<'jab' | 'kick' | 'heavy', StrikeWeight> = { jab: 'light', kick: 'medium', heavy: 'heavy' };

const BUDGET_SEC: Record<Phase, number> = { intro: 4, fighting: 120, roundOver: 4, matchOver: 999 };

export const KarateVSMode: ModeDefinition = (() => {
  let player: SpawnedCharacter, rival: SpawnedCharacter;
  let meState: FighterState, foeState: FighterState;
  let brain: RivalFightBrain;
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
  let lookX = 0, lookY = 0;   // R stick → camera look (MODE-STICK-FACE family, 2026-09-07)

  function setPhase(p: Phase): void { phase = p; phaseSec = 0; }
  function now(): number { return performance.now(); }

  /** G1: the lock-on TURNS. Both fighters ease onto each other at a real pivot rate, and a body on the floor (KO'd, or
   *  inside a knockdown) is left where the clip put it — the old per-frame `rotation.y = atan2(...)` kept re-aiming a
   *  knocked-down fighter's hips at his opponent while he lay there, and snapped both bodies through the whole yaw of
   *  a 1.5 m knockback in the one frame it landed. */
  function faceEachOther(dt: number): void {
    const p = player.root.position, r = rival.root.position;
    if (!meAnim?.out && !downNow(meAnim)) player.root.rotation.y = lockOnYaw(p, r, player.root.rotation.y, COMBAT_TURN_RATE, dt);
    if (!foeAnim?.out && !downNow(foeAnim)) rival.root.rotation.y = lockOnYaw(r, p, rival.root.rotation.y, COMBAT_TURN_RATE, dt);
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
    const to = from.add(dir.scale(meters));
    modeVenue?.constrain(to); to.x = Math.max(-ARENA_HALF, Math.min(ARENA_HALF, to.x)); to.z = Math.max(-ARENA_HALF, Math.min(ARENA_HALF, to.z));   // phase 3: the floor (navmesh) AND the arena box — the alcoves past ±4.5 box the fight camera in
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
    bio.rising = false; bio.dodging = false; bio.celebrating = t < f.celebrateUntil; bio.engaged = phase === 'fighting';
    return {
      speed01: moving, strafe, backing: strafe === 0 && bio.approach < 0, dashing: false, hasWeapon: false,
      striking: f.strike?.weight ?? null, strikeClip: f.strike?.clip,
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

  /** One swing, either direction. `mine` = the player is the attacker. */
  function swing(ctx: ModeContext, mine: boolean, key: 'jab' | 'kick' | 'heavy'): void {
    const atkState = mine ? meState : foeState;
    const defState = mine ? foeState : meState;
    const atkChar = mine ? player : rival;
    const defChar = mine ? rival : player;
    if (!atkState.controllable || (mine ? striking : foeStriking)) return;

    // The DRAGON is EARNED as well as charged: full chi is the cost, FORCE is the licence. A baseline body
    // can fill the gauge and still not throw it, which is what makes upgrading the scan visible in a fight.
    const canDragon = hasFightMove('dragon', mine ? myRatings : foeRatings);
    const special = key === 'heavy' && atkState.chi >= CHI_MAX && canDragon;
    const atk: AttackDef = special ? SPECIAL_ATTACK : KARATE_ATTACKS[key];
    if (mine) striking = true; else foeStriking = true;
    if (special) {
      atkState.chi = 0;
      ctx.setHud(mine ? { chi: 0 } : { foeChi: 0 });
      ctx.setHud({ banner: mine ? 'DRAGON!' : 'RIVAL DRAGON!' });
      SoundKit.play('powerUp', { pitch: 0.7 });
      setTimeout(() => ctx.setHud({ banner: '' }), 700);
    }
    SoundKit.play('whoosh', { pitch: special ? 0.8 : 1.1 });
    animOf(mine).strike = { weight: special ? 'finisher' : WEIGHT_OF[key], clip: atk.clip, until: now() + STRIKE_MAX_SEC * 1000 };   // the tree plays it; its settle ends the swing

    setTimeout(() => {
      if (phase !== 'fighting') { endStrike(mine); return; }
      const dist = Vector3.Distance(atkChar.root.position, defChar.root.position);
      const outcome = resolveStrike(atk, dist, defState, now());

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
          ctx.juice.shake(0.08, 120);
          console.info('[KVS-JUICE] guard break');
          EffectsKit.burst(ctx.scene, defChar.root.position.add(new Vector3(0, 1.2, 0)), 'glitch');
          beatDown(!mine, defState.staggerSec);   // knock down → floor → get up inside the stagger
          ctx.setHud({ banner: mine ? 'GUARD BREAK!' : 'YOUR GUARD SHATTERED!', ...(mine ? { foeGuard: 0 } : { guard: 0 }) });
          setTimeout(() => ctx.setHud({ banner: '' }), 900);
          break;
        }
        case 'hit': {
          const dealt = applyHit(atkState, defState, atk);
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
          if (special || key === 'heavy') heavyPunch(ctx, special ? 'dragon' : 'heavy'); else console.info('[KVS-JUICE] hit');
          EffectsKit.burst(ctx.scene, defChar.root.position.add(new Vector3(0, 1.2, 0)), special ? 'glitch' : 'sparks');
          beatHit(!mine, special ? 'finisher' : WEIGHT_OF[key]);   // the DRAGON launches (knockdown → floor → get up)
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
    }, atk.startupMs);
  }

  function endRound(ctx: ModeContext, playerWon: boolean): void {
    if (phase !== 'fighting') return;
    setPhase('roundOver');
    if (playerWon) myWins++; else foeWins++;
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
    meState.resetRound(); foeState.resetRound();
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

    async load(ctx: ModeContext) {
      // ship pass 4: the venue spec (with its baked map) first; the kit venue only if no spec
      modeVenue = mountVenue(ctx, 'karate_h2h', { keepGameplayCamera: true });
      if (!modeVenue) VenueKit.buildDojo(ctx.scene);
      crowd = new Onlookers(ctx.scene, Array.from({ length: 14 }, (_, i) => {
        const a = (i / 14) * Math.PI * 2 + 0.22;
        return new Vector3(Math.sin(a) * 8.8, 0, Math.cos(a) * 8.8);   // off the 14 m mat, on the courtyard gravel
      }), '#3B2A52');
      player = await CharacterLibrary.spawn(ctx.scene, CFG.heroUrl, {
        position: new Vector3(0, 0, 2.2), yawRad: Math.PI, startClip: IDLE_CLIP,   // BIOMECH-WAVE2 G1/G3: they SPAWN facing each other — the round start used to be a 180° yaw snap on both bodies
      });
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
      brain = new RivalFightBrain(0.65, KARATE_ATTACKS);
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
      if (e.t === 'stick' && e.side === 'R') { lookX = e.x; lookY = e.y; }   // MODE-STICK-FACE: R stick → the director's look orbit
      if (phase !== 'fighting' || !meState.controllable) return;

      if (e.t === 'button' && e.pressed) {
        if (e.btn === 'A') swing(ctx, true, 'jab');
        if (e.btn === 'B') swing(ctx, true, 'kick');
        if (e.btn === 'Y') swing(ctx, true, 'heavy');
        if (e.btn === 'X') meState.pressBlock(now());   // the tree shows the block (blockHeld → block_hold)
      }
      if (e.t === 'button' && !e.pressed && e.btn === 'X') meState.releaseBlock();
    },

    update(ctx: ModeContext, dt: number) {
      phaseSec += dt;
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

      meState.tick(sdt); foeState.tick(sdt);
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
      let mySpeed01 = moveVel.length() / MOVE_SPEED;   // the INTENT, striking or not: a strike that runs out under a held stick settles straight into the guard step
      if (meState.controllable && !striking && !meState.blockHeld) {
        const vel = moveVel;
        const before = player.root.position.clone();
        player.root.position.addInPlace(vel.scale(sdt));
        modeVenue?.constrain(player.root.position); player.root.position.x = Math.max(-ARENA_HALF, Math.min(ARENA_HALF, player.root.position.x)); player.root.position.z = Math.max(-ARENA_HALF, Math.min(ARENA_HALF, player.root.position.z));
        if (sdt > 0 && Vector3.Distance(before, player.root.position) / sdt < 0.3) mySpeed01 = 0;   // pinned on the boundary: no stepping on the spot
      }

      // rival AI
      const action = brain.decide(sdt, rival.root.position, player.root.position, foeState, striking);
      if (action.block && !foeState.blockHeld) foeState.pressBlock(now());
      if (!action.block && foeState.blockHeld) foeState.releaseBlock();
      if (action.attack) swing(ctx, false, action.attack);
      let foeSpeed01 = Math.min(1, Math.hypot(action.moveX, action.moveY));   // the brain's INTENT, striking or not — the strike's settle lands on the step, not a one-frame stance
      const foeVel = new Vector3(action.moveX, 0, -action.moveY).scale(MOVE_SPEED * 0.92);
      if (foeState.controllable && !foeStriking && !foeState.blockHeld) {
        const vel = foeVel;
        const before = rival.root.position.clone();
        rival.root.position.addInPlace(vel.scale(sdt));
        rival.root.position.x = Math.max(-ARENA_HALF, Math.min(ARENA_HALF, rival.root.position.x));
        rival.root.position.z = Math.max(-ARENA_HALF, Math.min(ARENA_HALF, rival.root.position.z));
        foeSpeed01 = sdt > 0 && Vector3.Distance(before, rival.root.position) / sdt < 0.3 ? 0 : vel.length() / MOVE_SPEED;   // the step only while the body moves
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
      modeVenue?.dispose?.(); modeVenue = null;
      player?.dispose(); rival?.dispose(); SoundKit.stopAmbient();
    },
  };
})();

// HUD CONTRACT (bare values — bezel decorates):
//   hp / foeHp (0-100), guard / foeGuard (0-100), chi / foeChi (0-100),
//   round (string), wins / foeWins (number), banner, hint.
