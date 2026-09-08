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
import { VenueKit } from '../visual/VenueKit';
import { mountVenue, type VenueHandle } from '../core/NexusVenue';
import { Onlookers } from '../visual/Onlookers';
import {
  FighterState, RivalFightBrain, resolveStrike, applyHit,
  KARATE_ATTACKS, SPECIAL_ATTACK, CHI_MAX, PARRY_STAGGER_SEC, type AttackDef,
} from '../core/FightCore';
import { SoundKit } from '../audio/SoundKit';
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
  let striking = false, foeStriking = false;
  let slowmoSec = 0;
  let meAnim: FighterAnim, foeAnim: FighterAnim;
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

  function faceEachOther(): void {
    const to = rival.root.position.subtract(player.root.position);
    player.root.rotation.y = Math.atan2(to.x, to.z);
    rival.root.rotation.y = Math.atan2(-to.x, -to.z);
  }

  function knockback(ctx: ModeContext, char: SpawnedCharacter, fromPos: Vector3, meters: number): void {
    const dir = char.root.position.subtract(fromPos); dir.y = 0;
    if (dir.lengthSquared() < 1e-4) return;
    dir.normalize();
    const from = char.root.position.clone();
    const to = from.add(dir.scale(meters));
    modeVenue?.constrain(to); to.x = Math.max(-ARENA_HALF, Math.min(ARENA_HALF, to.x)); to.z = Math.max(-ARENA_HALF, Math.min(ARENA_HALF, to.z));   // phase 3: the floor (navmesh) AND the arena box — the alcoves past ±4.5 box the fight camera in
    const t0 = now();
    const obs = ctx.scene.onBeforeRenderObservable.add(() => {
      const k = Math.min(1, (now() - t0) / 160);
      char.root.position.x = from.x + (to.x - from.x) * k;
      char.root.position.z = from.z + (to.z - from.z) * k;
      if (k >= 1) ctx.scene.onBeforeRenderObservable.remove(obs);
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
  function treeInput(f: FighterAnim, s: FighterState, speed01: number): CombatAnimInput {
    const t = now();
    if (f.strike && t > f.strike.until) endStrike(f === meAnim);   // a strike the tree never settled (safety, never measured)
    return {
      speed01: s.controllable && !s.blockHeld ? speed01 : 0, dashing: false, hasWeapon: false,
      striking: f.strike?.weight ?? null, strikeClip: f.strike?.clip,
      blocking: s.blockHeld, parryFlash: t < f.parryUntil, guardImpactFlash: t < f.impactUntil,
      hitBy: t < f.hitUntil ? f.hitBy : null, down: t < f.downUntil, out: f.out, ulting: false, celebrating: t < f.celebrateUntil,
    };
  }
  /** Once per frame, both fighters, every phase (the KO holds the floor through the round-over beat). */
  function animate(mySpeed01: number, foeSpeed01: number): void {
    if (!meAnim || !foeAnim) return;
    meAnim.tree.update(treeInput(meAnim, meState, mySpeed01));
    foeAnim.tree.update(treeInput(foeAnim, foeState, foeSpeed01));
  }
  function resetAnim(f: FighterAnim): void { f.strike = null; f.hitBy = null; f.hitUntil = 0; f.parryUntil = 0; f.impactUntil = 0; f.downUntil = 0; f.celebrateUntil = 0; f.out = false; f.tree.reset(); }

  /** One swing, either direction. `mine` = the player is the attacker. */
  function swing(ctx: ModeContext, mine: boolean, key: 'jab' | 'kick' | 'heavy'): void {
    const atkState = mine ? meState : foeState;
    const defState = mine ? foeState : meState;
    const atkChar = mine ? player : rival;
    const defChar = mine ? rival : player;
    if (!atkState.controllable || (mine ? striking : foeStriking)) return;

    const special = key === 'heavy' && atkState.chi >= CHI_MAX;
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
          ctx.feel?.impact?.(special ? 0.6 : 0.3);   // ONE thud per connect (the impact SFX that doubled it is gone)
          if (special || key === 'heavy') heavyPunch(ctx, special ? 'dragon' : 'heavy'); else console.info('[KVS-JUICE] hit');
          EffectsKit.burst(ctx.scene, defChar.root.position.add(new Vector3(0, 1.2, 0)), special ? 'glitch' : 'sparks');
          beatHit(!mine, special ? 'finisher' : WEIGHT_OF[key]);   // the DRAGON launches (knockdown → floor → get up)
          knockback(ctx, defChar, atkChar.root.position, atk.knockback);
          const hud: Record<string, HudValue> = mine
            ? { foeHp: defState.hp, chi: Math.round(atkState.chi) }
            : { hp: defState.hp, foeChi: Math.round(atkState.chi) };
          if (atkState.combo >= 2) hud.banner = mine ? `COMBO x${atkState.combo} — ${dealt} DMG` : `RIVAL COMBO x${atkState.combo}`;
          ctx.setHud(hud);
          if (atkState.combo >= 2) setTimeout(() => ctx.setHud({ banner: '' }), 700);
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
    faceEachOther();
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
        position: new Vector3(0, 0, 2.2), startClip: IDLE_CLIP,
      });
      neverBindPose(player.animator, IDLE_CLIP);
      installSafePlay(player.animator, 'karate-vs-player');
      ctx.groundLock?.track(player.root, player.skeleton);

      rival = await CharacterLibrary.spawn(ctx.scene, CFG.heroUrl, {
        position: new Vector3(0, 0, -2.2), tint: '#8b1e2d', startClip: IDLE_CLIP,
      });
      neverBindPose(rival.animator, IDLE_CLIP);
      installSafePlay(rival.animator, 'karate-vs-rival');
      ctx.groundLock?.track(rival.root, rival.skeleton);
      meAnim = newFighterAnim(new CombatAnimTree(player.animator));
      foeAnim = newFighterAnim(new CombatAnimTree(rival.animator));
      meAnim.tree.onSettle = (st) => { if (st.startsWith('strike_')) endStrike(true); };
      foeAnim.tree.onSettle = (st) => { if (st.startsWith('strike_')) endStrike(false); };

      meState = new FighterState(100);
      foeState = new FighterState(100);
      brain = new RivalFightBrain(0.65, KARATE_ATTACKS);
      round = 1; myWins = 0; foeWins = 0; matchLatch = false; heavyAt = 0;

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
      if (phase !== 'fighting') { animate(0, 0); return; }   // the trees still run: the loser holds the floor, the winner celebrates

      // scoped slow-mo (parry payoff) — scales this mode's clock only
      slowmoSec = Math.max(0, slowmoSec - dt);
      const sdt = slowmoSec > 0 ? dt * SLOWMO_SCALE : dt;

      meState.tick(sdt); foeState.tick(sdt);

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
      if (foeState.controllable && !foeStriking && !foeState.blockHeld) {
        const vel = new Vector3(action.moveX, 0, -action.moveY).scale(MOVE_SPEED * 0.92);
        const before = rival.root.position.clone();
        rival.root.position.addInPlace(vel.scale(sdt));
        rival.root.position.x = Math.max(-ARENA_HALF, Math.min(ARENA_HALF, rival.root.position.x));
        rival.root.position.z = Math.max(-ARENA_HALF, Math.min(ARENA_HALF, rival.root.position.z));
        foeSpeed01 = sdt > 0 && Vector3.Distance(before, rival.root.position) / sdt < 0.3 ? 0 : vel.length() / MOVE_SPEED;   // the step only while the body moves
      }

      faceEachOther();
      // guard HUD trickle (regen is invisible otherwise)
      ctx.setHud({ guard: Math.round(meState.guard), foeGuard: Math.round(foeState.guard) });
      ctx.camDirector.look(lookX, lookY, dt);
      ctx.camDirector.update(player.root.position, moveVel, rival.root.position);
      animate(mySpeed01, foeSpeed01);
    },

    dispose() {

      crowd?.dispose(); crowd = null;
      modeVenue?.dispose?.(); modeVenue = null;
      player?.dispose(); rival?.dispose(); SoundKit.stopAmbient();
    },
  };
})();

// HUD CONTRACT (bare values — bezel decorates):
//   hp / foeHp (0-100), guard / foeGuard (0-100), chi / foeChi (0-100),
//   round (string), wins / foeWins (number), banner, hint.
