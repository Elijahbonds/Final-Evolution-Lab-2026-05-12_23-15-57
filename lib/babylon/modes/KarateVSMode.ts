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
import { installSafePlay, SPORT_CLIP } from '../anim/clipRegistry';
import { VenueKit } from '../visual/VenueKit';
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

type Phase = 'intro' | 'fighting' | 'roundOver' | 'matchOver';
const ROUNDS_TO_WIN = 2;
const MOVE_SPEED = 3.4;
const ARENA_HALF = 7.5;
const SLOWMO_SEC = 0.5;
const SLOWMO_SCALE = 0.3;

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
  let stickX = 0, stickY = 0;

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
    to.x = Math.max(-ARENA_HALF, Math.min(ARENA_HALF, to.x));
    to.z = Math.max(-ARENA_HALF, Math.min(ARENA_HALF, to.z));
    const t0 = now();
    const obs = ctx.scene.onBeforeRenderObservable.add(() => {
      const k = Math.min(1, (now() - t0) / 160);
      char.root.position.x = from.x + (to.x - from.x) * k;
      char.root.position.z = from.z + (to.z - from.z) * k;
      if (k >= 1) ctx.scene.onBeforeRenderObservable.remove(obs);
    });
  }

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
    atkChar.animator.play(atk.clip, {
      onEnd: () => {
        if (mine) striking = false; else foeStriking = false;
        atkChar.animator.play(SPORT_CLIP.karateStance, { loop: true, fadeSec: 0.12 });
      },
    });

    setTimeout(() => {
      if (phase !== 'fighting') { if (mine) striking = false; else foeStriking = false; return; }
      const dist = Vector3.Distance(atkChar.root.position, defChar.root.position);
      const outcome = resolveStrike(atk, dist, defState, now());
      switch (outcome) {
        case 'whiff': break;
        case 'parried': {
          atkState.staggerSec = PARRY_STAGGER_SEC;
          defState.chi = Math.min(CHI_MAX, defState.chi + 15);
          slowmoSec = SLOWMO_SEC;
          SoundKit.play('impact', { pitch: 1.6, volume: 0.5 });
          ctx.feel?.impact?.(0.3);
          EffectsKit.burst(ctx.scene, defChar.root.position.add(new Vector3(0, 1.3, 0)), 'sparks');
          atkChar.animator.play(SPORT_CLIP.karateHitReact, { onEnd: () => atkChar.animator.play(SPORT_CLIP.karateStance, { loop: true }) });
          ctx.setHud({ banner: mine ? 'PARRIED!' : 'PERFECT PARRY!', ...(mine ? { foeChi: Math.round(defState.chi) } : { chi: Math.round(defState.chi) }) });
          setTimeout(() => ctx.setHud({ banner: '' }), 700);
          break;
        }
        case 'blocked': {
          SoundKit.play('impact', { pitch: 0.7, volume: 0.3 });
          EffectsKit.burst(ctx.scene, defChar.root.position.add(new Vector3(0, 1.1, 0)), 'dust');
          ctx.setHud(mine ? { foeGuard: Math.round(defState.guard) } : { guard: Math.round(defState.guard) });
          break;
        }
        case 'guardBreak': {
          SoundKit.play('impact', { pitch: 0.5, volume: 0.7 });
          SoundKit.play('crowdGroan', { volume: 0.4 });
          ctx.feel?.impact?.(0.5);
          EffectsKit.burst(ctx.scene, defChar.root.position.add(new Vector3(0, 1.2, 0)), 'glitch');
          defChar.animator.play(SPORT_CLIP.karateKnockdown, { onEnd: () => defChar.animator.play(SPORT_CLIP.karateStance, { loop: true }) });
          ctx.setHud({ banner: mine ? 'GUARD BREAK!' : 'YOUR GUARD SHATTERED!', ...(mine ? { foeGuard: 0 } : { guard: 0 }) });
          setTimeout(() => ctx.setHud({ banner: '' }), 900);
          break;
        }
        case 'hit': {
          const dealt = applyHit(atkState, defState, atk);
          SoundKit.play('impact', { pitch: special ? 0.6 : 1, volume: 0.5 });
          ctx.feel?.impact?.(special ? 0.6 : 0.3);
          EffectsKit.burst(ctx.scene, defChar.root.position.add(new Vector3(0, 1.2, 0)), special ? 'glitch' : 'sparks');
          defChar.animator.play(SPORT_CLIP.karateHitReact, { onEnd: () => defChar.animator.play(SPORT_CLIP.karateStance, { loop: true }) });
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
    const loser = playerWon ? rival : player;
    loser.animator.play(SPORT_CLIP.karateKnockdown, {});
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
        if (won) EffectsKit.burst(ctx.scene, player.root.position.add(new Vector3(0, 2, 0)), 'confetti');
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
    player.animator.play(SPORT_CLIP.karateStance, { loop: true });
    rival.animator.play(SPORT_CLIP.karateStance, { loop: true });
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
      VenueKit.buildDojo(ctx.scene);
      player = await CharacterLibrary.spawn(ctx.scene, CFG.heroUrl, {
        position: new Vector3(0, 0, 2.2), startClip: SPORT_CLIP.karateStance,
      });
      neverBindPose(player.animator, SPORT_CLIP.karateStance);
      installSafePlay(player.animator, 'karate-vs-player');
      ctx.groundLock?.track(player.root, player.skeleton);

      rival = await CharacterLibrary.spawn(ctx.scene, CFG.heroUrl, {
        position: new Vector3(0, 0, -2.2), tint: '#8b1e2d', startClip: SPORT_CLIP.karateStance,
      });
      neverBindPose(rival.animator, SPORT_CLIP.karateStance);
      installSafePlay(rival.animator, 'karate-vs-rival');
      ctx.groundLock?.track(rival.root, rival.skeleton);

      meState = new FighterState(100);
      foeState = new FighterState(100);
      brain = new RivalFightBrain(0.65, KARATE_ATTACKS);
      round = 1; myWins = 0; foeWins = 0;

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
      if (phase !== 'fighting' || !meState.controllable) return;

      if (e.t === 'button' && e.pressed) {
        if (e.btn === 'A') swing(ctx, true, 'jab');
        if (e.btn === 'B') swing(ctx, true, 'kick');
        if (e.btn === 'Y') swing(ctx, true, 'heavy');
        if (e.btn === 'X') { meState.pressBlock(now()); player.animator.play(SPORT_CLIP.karateBlock, { loop: true }); }
      }
      if (e.t === 'button' && !e.pressed && e.btn === 'X') {
        meState.releaseBlock();
        if (!striking) player.animator.play(SPORT_CLIP.karateStance, { loop: true });
      }
    },

    update(ctx: ModeContext, dt: number) {
      phaseSec += dt;
      if (phaseSec > BUDGET_SEC[phase]) {
        console.warn(`[FEL-WATCHDOG] karate-vs stuck in "${phase}" — auto-advancing`);
        if (phase === 'fighting') endRound(ctx, meState.hp >= foeState.hp);
        else if (phase === 'intro' || phase === 'roundOver') startRound(ctx);
        return;
      }
      if (phase !== 'fighting') return;

      // scoped slow-mo (parry payoff) — scales this mode's clock only
      slowmoSec = Math.max(0, slowmoSec - dt);
      const sdt = slowmoSec > 0 ? dt * SLOWMO_SCALE : dt;

      meState.tick(sdt); foeState.tick(sdt);

      // player movement — lock-on: always face the rival, stick strafes/closes
      if (meState.controllable && !striking && !meState.blockHeld) {
        const vel = new Vector3(stickX, 0, -stickY).scale(MOVE_SPEED);
        player.root.position.addInPlace(vel.scale(sdt));
        player.root.position.x = Math.max(-ARENA_HALF, Math.min(ARENA_HALF, player.root.position.x));
        player.root.position.z = Math.max(-ARENA_HALF, Math.min(ARENA_HALF, player.root.position.z));
        if (vel.lengthSquared() > 0.4 && !striking) {
          player.animator.play(SPORT_CLIP.moveLoop, { loop: true });
        } else if (!striking) {
          player.animator.play(SPORT_CLIP.karateStance, { loop: true });
        }
      }

      // rival AI
      const action = brain.decide(sdt, rival.root.position, player.root.position, foeState, striking);
      if (action.block && !foeState.blockHeld) { foeState.pressBlock(now()); rival.animator.play(SPORT_CLIP.karateBlock, { loop: true }); }
      if (!action.block && foeState.blockHeld) { foeState.releaseBlock(); if (!foeStriking) rival.animator.play(SPORT_CLIP.karateStance, { loop: true }); }
      if (action.attack) swing(ctx, false, action.attack);
      if (foeState.controllable && !foeStriking && !foeState.blockHeld) {
        const vel = new Vector3(action.moveX, 0, -action.moveY).scale(MOVE_SPEED * 0.92);
        rival.root.position.addInPlace(vel.scale(sdt));
        rival.root.position.x = Math.max(-ARENA_HALF, Math.min(ARENA_HALF, rival.root.position.x));
        rival.root.position.z = Math.max(-ARENA_HALF, Math.min(ARENA_HALF, rival.root.position.z));
        if (vel.lengthSquared() > 0.4) rival.animator.play(SPORT_CLIP.moveLoop, { loop: true });
      }

      faceEachOther();
      // guard HUD trickle (regen is invisible otherwise)
      ctx.setHud({ guard: Math.round(meState.guard), foeGuard: Math.round(foeState.guard) });
      ctx.camDirector.update(player.root.position, new Vector3(stickX, 0, -stickY).scale(MOVE_SPEED), rival.root.position);
    },

    dispose() {
      player?.dispose(); rival?.dispose(); SoundKit.stopAmbient();
    },
  };
})();

// HUD CONTRACT (bare values — bezel decorates):
//   hp / foeHp (0-100), guard / foeGuard (0-100), chi / foeChi (0-100),
//   round (string), wins / foeWins (number), banner, hint.
