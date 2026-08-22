// ShowdownMode — Mode 2 Phase 6: the Naruto-Storm-lane arena fighter.
//
// Built ENTIRELY on the shared Mode 2 core (no parallel combat logic):
//   CombatMovement  — dash-cancel bursts (chi cost) across a big arena
//   StrikeSystem    — frame-data strikes with cancel-window combos
//   DefenseSystem   — parry / guard impact / SUBSTITUTION (chi-cost teleport
//                     counter with a read-and-punish vulnerability window)
//   ResourceMeter   — CHAKRA tuning: fills on hits/parries, spent on dashes,
//                     substitution, and the ULTIMATE
//   CombatAnimTree  — state-driven animation
//   MomentumBus     — Game-Breaker swings (substitutions, ultimates)
//
// Storm signatures implemented:
//   DASH-CANCEL — L1: a chi-spending burst usable mid-combo-recovery.
//   SUBSTITUTION — R1 with an enemy strike incoming: teleport behind them.
//   SUPPORT ASSIST — SELECT: an ally blinks in, extends your combo, leaves.
//   ULTIMATE — full chakra + Y: camera-CUT cinematic (fixed wide → push-in
//     beat → release), huge damage + wall-shatter if it launches the rival
//     into the north gate (destructible beat).
// All naming/visuals original.

import { MeshBuilder, StandardMaterial, Color3, Vector3 } from '@babylonjs/core';
import type { AbstractMesh } from '@babylonjs/core';
import { CharacterLibrary, type SpawnedCharacter } from '../core/CharacterLibrary';
import { neverBindPose } from '../anim/importSanitizer';
import { installSafePlay } from '../anim/clipRegistry';
import { VenueKit } from '../visual/VenueKit';
import { FighterState, KARATE_ATTACKS, CHI_MAX } from '../core/FightCore';
import { StrikeController, karateMoveset, type CombatMove } from '../core/StrikeSystem';
import { DefenseController, applyDefenseOutcome, SUBSTITUTION_CHI_COST } from '../core/DefenseSystem';
import { CombatMovement } from '../core/CombatMovement';
import { ResourceMeter, CHAKRA } from '../core/ResourceMeter';
import { CombatAnimTree } from '../anim/combatTree';
import { MomentumBus } from '../core/MomentumBus';
import { SoundKit } from '../audio/SoundKit';
import { EffectsKit } from '../visual/EffectsKit';
import { assertSpawned } from '../core/FrameGuard';
import type { ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import { KARATE_CONFIG as CFG } from './modeConfigs';

const ARENA_HALF = 12;
const DASH_CHI_COST = 12;
const ULT_DMG = 38;
const ULT_RANGE = 2.6;
const ASSIST_COOLDOWN_SEC = 9;
const ASSIST_DMG = 8;

type Phase = 'intro' | 'fighting' | 'ultimate' | 'matchOver';
const BUDGET_SEC: Record<Phase, number> = { intro: 4, fighting: 150, ultimate: 6, matchOver: 999 };

export const ShowdownMode: ModeDefinition = (() => {
  let player: SpawnedCharacter, rival: SpawnedCharacter, support: SpawnedCharacter | null = null;
  let meState: FighterState, foeState: FighterState;
  let meStrike: StrikeController, foeStrike: StrikeController;
  let meMove: CombatMovement, foeMove: CombatMovement;
  let meDef: DefenseController, foeDef: DefenseController;
  let meAnim: CombatAnimTree, foeAnim: CombatAnimTree;
  let chakra: ResourceMeter, foeChakra: ResourceMeter;
  const mbus = new MomentumBus();
  let wallMesh: AbstractMesh | null = null;
  let phase: Phase = 'intro';
  let phaseSec = 0;
  let stickX = 0, stickY = 0;
  let ultTimer = 0, assistTimer = 0, assistActive = 0;
  let myRounds = 0, foeRounds = 0;
  let parryFlash = 0, giFlash = 0;
  let foeHitBy: 'light' | 'medium' | 'heavy' | 'finisher' | null = null;
  let meHitBy: 'light' | 'medium' | 'heavy' | 'finisher' | null = null;
  let hitFlashT = 0;

  const MOVES = karateMoveset(KARATE_ATTACKS);
  const WEIGHT_BY_MOVE: Record<string, CombatMove['weight']> =
    Object.fromEntries(Object.entries(MOVES).map(([id, m]) => [id, m.weight]));

  function setPhase(p: Phase): void { phase = p; phaseSec = 0; }
  function now(): number { return performance.now(); }
  function banner(ctx: ModeContext, text: string, ms = 900): void {
    ctx.setHud({ banner: text });
    setTimeout(() => ctx.setHud({ banner: '' }), ms);
  }
  function faceEachOther(): void {
    const to = rival.root.position.subtract(player.root.position);
    player.root.rotation.y = Math.atan2(to.x, to.z);
    rival.root.rotation.y = Math.atan2(-to.x, -to.z);
  }

  /** Resolve a strike whose ACTIVE window just opened. `mine` = player attacking. */
  function resolveActiveStrike(ctx: ModeContext, mine: boolean): void {
    const atkChar = mine ? player : rival;
    const defChar = mine ? rival : player;
    const atkState = mine ? meState : foeState;
    const defState = mine ? foeState : meState;
    const defCtrl = mine ? foeDef : meDef;
    const strikeC = mine ? meStrike : foeStrike;
    const move = strikeC.current?.move;
    if (!move) return;
    if (!strikeC.current!.hitLive) return;
    strikeC.current!.consumeHit();

    const dist = Vector3.Distance(atkChar.root.position, defChar.root.position);
    const meter = mine ? chakra : foeChakra;

    // SUBSTITUTION check first (defender spent chi to not be here)
    if (!mine && meSubstituted > now()) { /* player already teleported */ }

    const action = defCtrl.resolve(move.atk, dist, defState.blockHeld, now());
    const outcome = applyDefenseOutcome(action, atkState, defState, move.atk);
    meter.gain('hitLanded');

    switch (outcome) {
      case 'whiff': break;
      case 'blocked':
        SoundKit.play('impact', { pitch: 0.7, volume: 0.3 });
        EffectsKit.burst(ctx.scene, defChar.root.position.add(new Vector3(0, 1.1, 0)), 'dust');
        break;
      case 'guardBreak':
        SoundKit.play('impact', { pitch: 0.5, volume: 0.7 });
        ctx.feel?.impact?.(0.55);
        EffectsKit.burst(ctx.scene, defChar.root.position.add(new Vector3(0, 1.2, 0)), 'glitch');
        banner(ctx, mine ? 'GUARD BREAK!' : 'YOUR GUARD SHATTERED!');
        break;
      case 'parried':
        SoundKit.play('impact', { pitch: 1.6, volume: 0.5 });
        ctx.feel?.impact?.(0.3);
        (mine ? foeChakra : chakra).gain('parry');
        banner(ctx, mine ? 'PARRIED!' : 'PERFECT PARRY!');
        break;
      case 'guardImpacted':
        SoundKit.play('impact', { pitch: 1.9, volume: 0.6 });
        ctx.feel?.impact?.(0.45);
        (mine ? foeChakra : chakra).gain('guardImpact');
        EffectsKit.burst(ctx.scene, defChar.root.position.add(new Vector3(0, 1.4, 0)), 'sparks');
        ctx.camDirector.pulse(0.4, 0.4);
        banner(ctx, mine ? 'GUARD IMPACTED — PUNISH!' : 'GUARD IMPACT! PUNISH THEM!');
        break;
      case 'hit': {
        const w = move.weight;
        const scale = Math.max(0.4, 1 - 0.12 * atkState.combo);
        const dealt = Math.round(move.atk.dmg * scale);
        defState.hp = Math.max(0, defState.hp - dealt);
        defState.stunSec = Math.max(defState.stunSec, move.atk.stunSec);
        atkState.combo += 1; atkState.comboTimer = 1.1;
        if (mine) foeHitBy = w === 'finisher' ? 'finisher' : w; else meHitBy = w === 'finisher' ? 'finisher' : w;
        hitFlashT = 0.3;
        SoundKit.play('impact', { pitch: w === 'heavy' ? 0.6 : 1, volume: 0.5 });
        ctx.feel?.impact?.(w === 'heavy' ? 0.55 : 0.3);
        EffectsKit.burst(ctx.scene, defChar.root.position.add(new Vector3(0, 1.2, 0)), w === 'heavy' ? 'glitch' : 'sparks');
        // knockback via movement velocity impulse
        const dir = defChar.root.position.subtract(atkChar.root.position); dir.y = 0;
        if (dir.lengthSquared() > 1e-4) {
          (mine ? foeMove : meMove).vel.addInPlace(dir.normalize().scale(move.atk.knockback * 3));
        }
        ctx.setHud(mine
          ? { foeHp: defState.hp, combo: atkState.combo >= 2 ? atkState.combo : 0 }
          : { hp: defState.hp, foeCombo: atkState.combo >= 2 ? atkState.combo : 0 });
        if (defState.hp <= 0) endRound(ctx, mine);
        break;
      }
    }
  }

  let meSubstituted = 0;

  function trySubstitution(ctx: ModeContext): void {
    // legal only when a rival strike is live or imminent and in range
    const foeSwing = foeStrike.current && foeStrike.current.phase !== 'done';
    const dist = Vector3.Distance(player.root.position, rival.root.position);
    if (!foeSwing || dist > 3) { banner(ctx, 'NOTHING TO SUBSTITUTE', 500); return; }
    if (!meDef.canSubstitute(chakra.value, now())) { banner(ctx, 'NO CHAKRA', 500); return; }
    chakra.spend(SUBSTITUTION_CHI_COST);
    meDef.spendSubstitution(now());
    meSubstituted = now() + 400;
    const spot = DefenseController.substitutionSpot(rival.root.position, rival.root.rotation.y);
    player.root.position.copyFrom(spot);
    player.root.position.x = Math.max(-ARENA_HALF, Math.min(ARENA_HALF, player.root.position.x));
    player.root.position.z = Math.max(-ARENA_HALF, Math.min(ARENA_HALF, player.root.position.z));
    mbus.report({ kind: 'steal', weight: 14 });
    SoundKit.play('whoosh', { pitch: 1.8, volume: 0.6 });
    EffectsKit.burst(ctx.scene, spot.add(new Vector3(0, 1.2, 0)), 'glitch');
    ctx.camDirector.pulse(0.5, 0.4);
    banner(ctx, 'SUBSTITUTION! BEHIND THEM!');
  }

  function tryUltimate(ctx: ModeContext): void {
    if (!chakra.spendUltimate()) { banner(ctx, 'CHAKRA NOT FULL', 600); return; }
    setPhase('ultimate');
    ultTimer = 0;
    mbus.report({ kind: 'highlight_dunk', weight: 20 });
    SoundKit.play('powerUp', { pitch: 0.6 });
    // camera-CUT: leave the follow framing entirely — wide cinematic side shot
    const mid = player.root.position.add(rival.root.position).scale(0.5);
    ctx.camDirector.setFixed(mid.add(new Vector3(7, 2.2, 7)), 1.2);
    ctx.setHud({ banner: 'ULTIMATE — RISING DRAGON FLASH' });
  }

  function resolveUltimate(ctx: ModeContext): void {
    const dist = Vector3.Distance(player.root.position, rival.root.position);
    if (dist <= ULT_RANGE + 1.2) {
      foeState.hp = Math.max(0, foeState.hp - ULT_DMG);
      foeState.staggerSec = 1.6;
      foeHitBy = 'finisher'; hitFlashT = 0.6;
      SoundKit.play('impact', { pitch: 0.5, volume: 0.9 });
      ctx.feel?.impact?.(0.9);
      EffectsKit.burst(ctx.scene, rival.root.position.add(new Vector3(0, 1.3, 0)), 'glitch');
      // launch toward the north gate — shatter it on contact (destructible beat)
      const launchDir = new Vector3(0, 0, -1);
      foeMove.vel.copyFrom(launchDir.scale(12));
      ctx.setHud({ foeHp: foeState.hp });
      if (foeState.hp <= 0) endRound(ctx, true);
    } else {
      banner(ctx, 'ULTIMATE WHIFFED!', 800);
    }
    ctx.camDirector.setPreset('fight');
    setPhase('fighting');
  }

  function callAssist(ctx: ModeContext): void {
    if (assistTimer > 0 || support) return;
    assistTimer = ASSIST_COOLDOWN_SEC;
    assistActive = 1.2;
    void (async () => {
      support = await CharacterLibrary.spawn(ctx.scene, CFG.heroUrl, {
        position: rival.root.position.add(new Vector3(2.5, 0, 0)), tint: '#3ec6ff', scale: 0.98,
        startClip: 'karate_idle_stance', modeId: 'showdown-support',
      });
      support.animator.play('karate_punch_heavy', {});
      SoundKit.play('whoosh', { pitch: 1.3 });
      // the assist lands its hit shortly after blinking in
      setTimeout(() => {
        if (!support || phase !== 'fighting') return;
        const dist = Vector3.Distance(support.root.position, rival.root.position);
        if (dist < 2.2 && foeState.controllable) {
          foeState.hp = Math.max(0, foeState.hp - ASSIST_DMG);
          foeState.stunSec = Math.max(foeState.stunSec, 0.5);
          meState.combo += 1; meState.comboTimer = 1.1;   // assist EXTENDS your combo
          chakra.gain('hitLanded');
          SoundKit.play('impact', { pitch: 1.2, volume: 0.4 });
          EffectsKit.burst(ctx.scene, rival.root.position.add(new Vector3(0, 1.2, 0)), 'sparks');
          ctx.setHud({ foeHp: foeState.hp, combo: meState.combo });
          banner(ctx, 'ASSIST!', 600);
          if (foeState.hp <= 0) endRound(ctx, true);
        }
      }, 350);
    })();
  }

  function endRound(ctx: ModeContext, playerWon: boolean): void {
    if (phase === 'matchOver') return;
    if (playerWon) myRounds++; else foeRounds++;
    SoundKit.play(playerWon ? 'crowdCheer' : 'crowdGroan');
    const done = myRounds >= 2 || foeRounds >= 2;
    if (done) {
      setPhase('matchOver');
      SoundKit.play('whistle');
      ctx.end(playerWon ? 'SHOWDOWN_WON' : 'SHOWDOWN_LOST', myRounds * 100 - foeRounds * 40, { foeRounds });
      return;
    }
    banner(ctx, playerWon ? 'ROUND — YOU' : 'ROUND — RIVAL', 1600);
    setTimeout(() => {
      meState.resetRound(); foeState.resetRound();
      player.root.position.set(0, 0, 4); rival.root.position.set(0, 0, -4);
      faceEachOther();
      setPhase('fighting');
    }, 1800);
  }

  return {
    modeId: 'showdown', mood: 'dojoWarm', camPreset: 'fight',

    async load(ctx: ModeContext) {
      VenueKit.buildDojo(ctx.scene);
      player = await CharacterLibrary.spawn(ctx.scene, CFG.heroUrl, {
        position: new Vector3(0, 0, 4), startClip: 'karate_idle_stance', modeId: 'showdown-me',
      });
      neverBindPose(player.animator, 'karate_idle_stance');
      installSafePlay(player.animator, 'showdown-me');
      rival = await CharacterLibrary.spawn(ctx.scene, CFG.heroUrl, {
        position: new Vector3(0, 0, -4), tint: '#8b1e2d', startClip: 'karate_idle_stance', modeId: 'showdown-rival',
      });
      neverBindPose(rival.animator, 'karate_idle_stance');
      installSafePlay(rival.animator, 'showdown-rival');

      // the destructible north gate (wall-break beat)
      wallMesh = MeshBuilder.CreateBox('shatter_gate', { width: 3, height: 2.6, depth: 0.3 }, ctx.scene);
      wallMesh.position.set(0, 1.3, -ARENA_HALF);
      const wm = new StandardMaterial('gateMat', ctx.scene);
      wm.diffuseColor = new Color3(0.55, 0.4, 0.25);
      wallMesh.material = wm;

      meState = new FighterState(100); foeState = new FighterState(100);
      meStrike = new StrikeController(MOVES); foeStrike = new StrikeController(MOVES);
      meMove = new CombatMovement(); foeMove = new CombatMovement();
      meDef = new DefenseController(); foeDef = new DefenseController();
      meAnim = new CombatAnimTree(player.animator); foeAnim = new CombatAnimTree(rival.animator);
      chakra = new ResourceMeter(CHAKRA); foeChakra = new ResourceMeter(CHAKRA);
      myRounds = 0; foeRounds = 0; assistTimer = 0; mbus.reset();

      SoundKit.startAmbient('dojo');
      EffectsKit.ambient(ctx.scene, 'dojo');
      ctx.heroRef.current = player.root;
      ctx.objectiveRef.current = rival.root.position;
      ctx.camDirector.snapTo(player.root.position, rival.root.position);
      assertSpawned(ctx.scene, { hero: player.root, minWorldMeshes: 5, modeId: 'showdown' });
      setPhase('intro');
      ctx.setHud({
        banner: 'SHOWDOWN — BEST OF 3', hp: 100, foeHp: 100, chi: 0, wins: 0, foeWins: 0,
        hint: 'L1 dash-cancel (chi) · R1 substitute their strike · SELECT assist · full chi + Y = ULTIMATE',
      });
      setTimeout(() => { ctx.setHud({ banner: '' }); setPhase('fighting'); }, 1800);
    },

    onInput(ctx: ModeContext, e: FelInput) {
      SoundKit.unlock();
      if (e.t === 'stick' && e.side === 'L') { stickX = e.x; stickY = e.y; }
      if (phase !== 'fighting' || !meState.controllable) return;
      if (e.t !== 'button') return;

      if (e.pressed && e.btn === 'A') meStrike.request('jab', now());
      if (e.pressed && e.btn === 'B') meStrike.request('kick', now());
      if (e.pressed && e.btn === 'Y') {
        if (chakra.full) tryUltimate(ctx);
        else meStrike.request('heavy', now());
      }
      if (e.pressed && e.btn === 'L1') {
        if (meMove.dash(stickX, -stickY) && chakra.spend(DASH_CHI_COST)) {
          SoundKit.play('whoosh', { pitch: 1.5, volume: 0.5 });
        } else if (meMove.dashReady) {
          banner(ctx, 'NO CHAKRA', 400);
        }
      }
      if (e.pressed && e.btn === 'R1') trySubstitution(ctx);
      if (e.pressed && e.btn === 'SELECT') callAssist(ctx);
      if (e.pressed && e.btn === 'X') {
        // block press — with stick flicked TOWARD the rival = guard impact attempt
        const to = rival.root.position.subtract(player.root.position);
        const flick = (stickX * to.x + -stickY * to.z) > 0.3;
        meDef.pressBlock(now(), flick);
        meState.pressBlock(now());
      }
      if (!e.pressed && e.btn === 'X') { meDef.releaseBlock(); meState.releaseBlock(); }
    },

    update(ctx: ModeContext, dt: number) {
      phaseSec += dt;
      if (phaseSec > BUDGET_SEC[phase]) {
        console.warn(`[FEL-WATCHDOG] showdown stuck in "${phase}"`);
        if (phase === 'ultimate') { ctx.camDirector.setPreset('fight'); setPhase('fighting'); }
        else if (phase === 'fighting') endRound(ctx, meState.hp >= foeState.hp);
        else if (phase === 'intro') setPhase('fighting');
        return;
      }
      if (phase === 'matchOver') return;

      assistTimer = Math.max(0, assistTimer - dt);
      hitFlashT = Math.max(0, hitFlashT - dt);
      if (hitFlashT === 0) { foeHitBy = null; meHitBy = null; }
      if (parryFlash > 0) { parryFlash -= dt; if (parryFlash <= 0) { meAnim.clearBeat('parry_flash', 'guard_impact'); } }
      if (giFlash > 0) { giFlash -= dt; if (giFlash <= 0) { meAnim.clearBeat('parry_flash', 'guard_impact'); } }
      chakra.update(dt); foeChakra.update(dt);
      meState.tick(dt); foeState.tick(dt);
      mbus.update(dt);

      // ── ultimate cinematic beat ──
      if (phase === 'ultimate') {
        ultTimer += dt;
        player.animator.play('karate_counter_throw', {});
        if (ultTimer > 1.1) resolveUltimate(ctx);
        return;
      }
      if (phase !== 'fighting') return;

      // ── wall shatter check (destructible beat) ──
      if (wallMesh && rival.root.position.z <= -ARENA_HALF + 0.8) {
        const w = wallMesh; wallMesh = null;
        w.dispose();
        SoundKit.play('impact', { pitch: 0.4, volume: 0.9 });
        SoundKit.play('crowdCheer', { volume: 0.8 });
        ctx.feel?.impact?.(1);
        for (let i = 0; i < 3; i++) {
          EffectsKit.burst(ctx.scene, new Vector3(0, 1 + i * 0.5, -ARENA_HALF), 'glitch');
        }
        ctx.camDirector.pulse(1, 0.7);
        banner(ctx, 'THE GATE SHATTERS!', 1200);
        mbus.report({ kind: 'highlight_dunk', weight: 22 });
      }

      // ── player movement (dash-cancel ready) ──
      if (meState.controllable && !meStrike.busy) {
        meMove.update(dt, stickX, stickY, false);
      } else {
        meMove.update(dt, 0, 0, false);
      }
      player.root.position.addInPlace(meMove.vel.scale(dt));
      player.root.position.x = Math.max(-ARENA_HALF, Math.min(ARENA_HALF, player.root.position.x));
      player.root.position.z = Math.max(-ARENA_HALF, Math.min(ARENA_HALF, player.root.position.z));

      // ── strikes: advance, resolve at active-frame open ──
      const opened = meStrike.update(dt, now());
      if (opened.startedActive) resolveActiveStrike(ctx, true);
      const foeOpened = foeStrike.update(dt, now());
      if (foeOpened.startedActive) {
        // substitution window: if the player substituted, this strike finds nothing
        if (now() < meSubstituted) {
          banner(ctx, 'SUBSTITUTED!', 500);
        } else {
          resolveActiveStrike(ctx, false);
        }
      }

      // ── rival AI (simple: approach, swing on cooldown, reactive block) ──
      if (foeState.controllable && phase === 'fighting') {
        const to = player.root.position.subtract(rival.root.position); to.y = 0;
        const dist = to.length();
        if (!foeStrike.busy && dist > 2) {
          const dir = to.normalize();
          foeMove.update(dt, dir.x, -dir.z, dist > 6);
        } else {
          foeMove.update(dt, 0, 0, false);
          if (!foeStrike.busy && dist <= 2 && Math.random() < 0.02) {
            foeStrike.request(['jab', 'kick', 'heavy'][Math.floor(Math.random() * 3)], now());
          }
          // reactive block
          if (meStrike.busy && Math.random() < 0.03) { foeDef.pressBlock(now(), false); foeState.pressBlock(now()); }
          else if (foeState.blockHeld && Math.random() < 0.02) { foeDef.releaseBlock(); foeState.releaseBlock(); }
        }
        rival.root.position.addInPlace(foeMove.vel.scale(dt));
        rival.root.position.x = Math.max(-ARENA_HALF, Math.min(ARENA_HALF, rival.root.position.x));
        rival.root.position.z = Math.max(-ARENA_HALF, Math.min(ARENA_HALF, rival.root.position.z));
      }

      // ── support assist lifecycle ──
      if (support) {
        assistActive -= dt;
        const to = rival.root.position.subtract(support.root.position); to.y = 0;
        if (to.length() > 1.4) support.root.position.addInPlace(to.normalize().scale(6 * dt));
        if (assistActive <= 0) {
          support.dispose(); support = null;
        }
      }

      // ── animation trees ──
      faceEachOther();
      meAnim.update({
        speed01: meMove.vel.length() / 6.4, dashing: meMove.dashing,
        hasWeapon: false,
        striking: meStrike.current ? WEIGHT_BY_MOVE[meStrike.current.move.atk.id] ?? 'light' : null,
        blocking: meDef.blocking, parryFlash: parryFlash > 0, guardImpactFlash: giFlash > 0,
        hitBy: meHitBy, down: meState.staggerSec > 0.8, out: meState.hp <= 0, ulting: false,
      });
      foeAnim.update({
        speed01: foeMove.vel.length() / 6.4, dashing: foeMove.dashing,
        hasWeapon: false,
        striking: foeStrike.current ? WEIGHT_BY_MOVE[foeStrike.current.move.atk.id] ?? 'light' : null,
        blocking: foeDef.blocking, parryFlash: false, guardImpactFlash: false,
        hitBy: foeHitBy, down: foeState.staggerSec > 0.8, out: foeState.hp <= 0, ulting: false,
      });

      ctx.setHud({
        chi: Math.round(chakra.value), hp: meState.hp, foeHp: foeState.hp,
        wins: myRounds, foeWins: foeRounds, momentum: Math.round(mbus.score01 * 100),
        assist: assistTimer > 0 ? Math.ceil(assistTimer) : 'READY',
      });
      ctx.camDirector.update(player.root.position, meMove.vel, rival.root.position);
    },

    dispose() {
      support?.dispose(); wallMesh?.dispose();
      player?.dispose(); rival?.dispose(); SoundKit.stopAmbient();
    },
  };
})();
