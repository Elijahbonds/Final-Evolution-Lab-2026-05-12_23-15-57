// DuelMode — Mode 2 Phase 7: the Soul-Calibur-lane weapon duel.
//
//   8-WAY RUN — movement is locked to the disc around the opponent
//     (CombatMovement 'eightWay': stick X orbits, stick Y closes/retreats,
//     facing hard-locked). Spacing on a disc is the whole game.
//   THREE WEAPONS — fists / staff / blade: real range-speed-power
//     tradeoffs through the SAME StrikeController (weapon = moveset swap,
//     never new logic). Picked at match start.
//   GUARD IMPACT — the skill expression: block-tap + flick TOWARD the
//     attacker inside 90ms no-sells the hit and opens a long punish.
//     Distinct stinger + flash from a normal parry (DefenseSystem).
//   RING-OUT — the arena is a raised disc; knockback physics are real,
//     and leaving the radius ENDS THE ROUND on the spot. Edge pressure
//     is its own win condition, exactly like Soul Calibur.
//   ROUNDS — best-of-3 scored through the shared JudgePanel's pacing
//     (staged round markers), not a number flash.

import { MeshBuilder, StandardMaterial, Color3, Vector3 } from '@babylonjs/core';
import type { AbstractMesh } from '@babylonjs/core';
import { CharacterLibrary, type SpawnedCharacter } from '../core/CharacterLibrary';
import { neverBindPose } from '../anim/importSanitizer';
import { installSafePlay } from '../anim/clipRegistry';
import { FighterState, KARATE_ATTACKS, STAFF_ATTACKS } from '../core/FightCore';
import {
  StrikeController, karateMoveset, staffMoveset, bladeMoveset, type CombatMove,
} from '../core/StrikeSystem';
import { DefenseController, applyDefenseOutcome } from '../core/DefenseSystem';
import { CombatMovement } from '../core/CombatMovement';
import { CombatAnimTree } from '../anim/combatTree';
import { SoundKit } from '../audio/SoundKit';
import { EffectsKit } from '../visual/EffectsKit';
import { assertSpawned } from '../core/FrameGuard';
import type { ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import { KARATE_CONFIG as CFG } from './modeConfigs';

export type DuelWeapon = 'fists' | 'staff' | 'blade';
const WEAPON_MOVESET: Record<DuelWeapon, () => Record<string, CombatMove>> = {
  fists: () => karateMoveset(KARATE_ATTACKS),
  staff: () => staffMoveset(STAFF_ATTACKS),
  blade: () => bladeMoveset(),
};
const WEAPON_TAG: Record<DuelWeapon, string> = { fists: 'FISTS', staff: 'STAFF', blade: 'BLADE' };
const WEAPON_RANGE: Record<DuelWeapon, number> = { fists: 1.6, staff: 2.6, blade: 1.9 };

const DISC_RADIUS = 6.5;            // ring-out boundary
const EDGE_WARN = 5.4;
const ROUNDS_TO_WIN = 2;

type Phase = 'intro' | 'weaponSelect' | 'fighting' | 'roundOver' | 'matchOver';
const BUDGET_SEC: Record<Phase, number> = { intro: 3, weaponSelect: 20, fighting: 120, roundOver: 5, matchOver: 999 };

export const DuelMode: ModeDefinition = (() => {
  let player: SpawnedCharacter, rival: SpawnedCharacter;
  let meState: FighterState, foeState: FighterState;
  let meStrike: StrikeController, foeStrike: StrikeController;
  let meMove: CombatMovement, foeMove: CombatMovement;
  let meDef: DefenseController, foeDef: DefenseController;
  let meAnim: CombatAnimTree, foeAnim: CombatAnimTree;
  let myWeapon: DuelWeapon = 'fists';
  let foeWeapon: DuelWeapon = 'staff';
  let phase: Phase = 'intro';
  let phaseSec = 0;
  let stickX = 0, stickY = 0;
  let round = 1, myWins = 0, foeWins = 0;
  let meHitBy: 'light' | 'medium' | 'heavy' | 'finisher' | null = null;
  let foeHitBy: 'light' | 'medium' | 'heavy' | 'finisher' | null = null;
  let hitT = 0;
  let discMesh: AbstractMesh | null = null;

  const setPhase = (p: Phase): void => { phase = p; phaseSec = 0; };
  const now = (): number => performance.now();
  function banner(ctx: ModeContext, text: string, ms = 900): void {
    ctx.setHud({ banner: text });
    setTimeout(() => ctx.setHud({ banner: '' }), ms);
  }

  /** Ring-out check — leaving the disc ends the round immediately. */
  function checkRingOut(ctx: ModeContext): boolean {
    const meR = Math.hypot(player.root.position.x, player.root.position.z);
    const foeR = Math.hypot(rival.root.position.x, rival.root.position.z);
    if (foeR > DISC_RADIUS) { endRound(ctx, true, 'RING OUT!'); return true; }
    if (meR > DISC_RADIUS) { endRound(ctx, false, 'RING OUT — YOU FELL'); return true; }
    return false;
  }

  function resolveActive(ctx: ModeContext, mine: boolean): void {
    const atkChar = mine ? player : rival;
    const defChar = mine ? rival : player;
    const atkState = mine ? meState : foeState;
    const defState = mine ? foeState : meState;
    const defCtrl = mine ? foeDef : meDef;
    const sc = mine ? meStrike : foeStrike;
    const move = sc.current?.move;
    if (!move || !sc.current!.hitLive) return;
    sc.current!.consumeHit();

    const dist = Vector3.Distance(atkChar.root.position, defChar.root.position);
    const action = defCtrl.resolve(move.atk, dist, defState.blockHeld, now());
    const outcome = applyDefenseOutcome(action, atkState, defState, move.atk);

    switch (outcome) {
      case 'whiff': break;
      case 'blocked':
        SoundKit.play('impact', { pitch: 0.7, volume: 0.3 });
        EffectsKit.burst(ctx.scene, defChar.root.position.add(new Vector3(0, 1.1, 0)), 'dust');
        break;
      case 'guardBreak':
        SoundKit.play('impact', { pitch: 0.5, volume: 0.7 });
        ctx.feel?.impact?.(0.55);
        banner(ctx, mine ? 'GUARD BREAK!' : 'GUARD SHATTERED!');
        break;
      case 'parried':
        SoundKit.play('impact', { pitch: 1.6, volume: 0.5 });
        banner(ctx, mine ? 'PARRIED!' : 'PERFECT PARRY!');
        break;
      case 'guardImpacted':
        // THE Duel skill: unmistakable stinger + flash + camera beat
        SoundKit.play('impact', { pitch: 2.1, volume: 0.7 });
        SoundKit.play('uiTick', { pitch: 1.8, volume: 0.5 });
        ctx.feel?.impact?.(0.5);
        EffectsKit.burst(ctx.scene, defChar.root.position.add(new Vector3(0, 1.4, 0)), 'glitch');
        ctx.camDirector.pulse(0.5, 0.45);
        banner(ctx, mine ? 'GUARD IMPACTED — PUNISH THEM!' : 'GUARD IMPACT! FREE HIT!');
        break;
      case 'hit': {
        const w = move.weight;
        const scale = Math.max(0.4, 1 - 0.12 * atkState.combo);
        const dealt = Math.round(move.atk.dmg * scale);
        defState.hp = Math.max(0, defState.hp - dealt);
        defState.stunSec = Math.max(defState.stunSec, move.atk.stunSec);
        atkState.combo += 1; atkState.comboTimer = 1.1;
        if (mine) foeHitBy = w; else meHitBy = w;
        hitT = 0.3;
        SoundKit.play('impact', { pitch: w === 'heavy' ? 0.6 : 1, volume: 0.5 });
        ctx.feel?.impact?.(w === 'heavy' ? 0.55 : 0.3);
        // knockback drives the ring-out game
        const dir = defChar.root.position.subtract(atkChar.root.position); dir.y = 0;
        if (dir.lengthSquared() > 1e-4) {
          (mine ? foeMove : meMove).vel.addInPlace(dir.normalize().scale(move.atk.knockback * 3.2));
        }
        ctx.setHud(mine ? { foeHp: defState.hp } : { hp: defState.hp });
        if (checkRingOut(ctx)) return;
        if (defState.hp <= 0) endRound(ctx, mine, mine ? 'K.O.' : 'K.O. — YOU');
        break;
      }
    }
  }

  function endRound(ctx: ModeContext, playerWon: boolean, label: string): void {
    if (phase !== 'fighting') return;
    setPhase('roundOver');
    if (playerWon) myWins++; else foeWins++;
    SoundKit.play(playerWon ? 'crowdCheer' : 'crowdGroan');
    (playerWon ? rival : player).animator.play('karate_knockdown', {});
    ctx.setHud({ wins: myWins, foeWins, banner: `${label} — ROUND ${round}` });
    setTimeout(() => {
      ctx.setHud({ banner: '' });
      if (myWins >= ROUNDS_TO_WIN || foeWins >= ROUNDS_TO_WIN) {
        setPhase('matchOver');
        SoundKit.play('whistle');
        ctx.end(playerWon ? 'DUEL_WON' : 'DUEL_LOST', myWins * 100 - foeWins * 40, { foeWins, weapon: myWeapon as string } as never);
        return;
      }
      round++;
      startRound(ctx);
    }, 2000);
  }

  function startRound(ctx: ModeContext): void {
    meState.resetRound(); foeState.resetRound();
    player.root.position.set(0, 0, 2.4); rival.root.position.set(0, 0, -2.4);
    player.root.rotation.y = Math.PI; rival.root.rotation.y = 0;
    meMove.vel.setAll(0); foeMove.vel.setAll(0);
    setPhase('fighting');
    ctx.setHud({
      hp: 100, foeHp: 100, wins: myWins, foeWins, round: `${round}`,
      hint: 'Stick orbits your foe · X block — tap+flick TOWARD them at impact for GUARD IMPACT · knock them OFF the disc',
    });
  }

  return {
    modeId: 'duel', mood: 'dojoWarm', camPreset: 'duel',  // Phase 9: side-on disc framing

    async load(ctx: ModeContext) {
      // raised disc arena (ring-out platform)
      discMesh = MeshBuilder.CreateCylinder('duel_disc', { diameter: DISC_RADIUS * 2, height: 0.4 }, ctx.scene);
      discMesh.position.y = -0.2;
      const dm = new StandardMaterial('discMat', ctx.scene);
      dm.diffuseColor = new Color3(0.16, 0.18, 0.24);
      discMesh.material = dm;
      const rim = MeshBuilder.CreateTorus('duel_rim', { diameter: DISC_RADIUS * 2, thickness: 0.08 }, ctx.scene);
      rim.position.y = 0.02;

      player = await CharacterLibrary.spawn(ctx.scene, CFG.heroUrl, {
        position: new Vector3(0, 0, 2.4), startClip: 'karate_idle_stance', modeId: 'duel-me',
      });
      neverBindPose(player.animator, 'karate_idle_stance');
      installSafePlay(player.animator, 'duel-me');
      rival = await CharacterLibrary.spawn(ctx.scene, CFG.heroUrl, {
        position: new Vector3(0, 0, -2.4), tint: '#8b1e2d', startClip: 'karate_idle_stance', modeId: 'duel-rival',
      });
      neverBindPose(rival.animator, 'karate_idle_stance');
      installSafePlay(rival.animator, 'duel-rival');

      meState = new FighterState(100); foeState = new FighterState(100);
      meStrike = new StrikeController(WEAPON_MOVESET.fists());
      foeStrike = new StrikeController(WEAPON_MOVESET[foeWeapon]());
      meMove = new CombatMovement(); foeMove = new CombatMovement();
      meMove.moveMode = 'eightWay'; foeMove.moveMode = 'eightWay';
      meMove.lockTarget = rival.root.position; foeMove.lockTarget = player.root.position;
      meDef = new DefenseController(); foeDef = new DefenseController();
      meAnim = new CombatAnimTree(player.animator); foeAnim = new CombatAnimTree(rival.animator);

      SoundKit.startAmbient('dojo');
      EffectsKit.ambient(ctx.scene, 'dojo');
      ctx.heroRef.current = player.root;
      ctx.objectiveRef.current = rival.root.position;
      ctx.camDirector.snapTo(player.root.position, rival.root.position);
      assertSpawned(ctx.scene, { hero: player.root, minWorldMeshes: 4, modeId: 'duel' });
      setPhase('weaponSelect');
      ctx.setHud({
        banner: 'CHOOSE YOUR WEAPON', hp: 100, foeHp: 100,
        hint: 'A = FISTS (fast, short) · B = BLADE (balanced, combos) · Y = STAFF (long, slow, huge knockback)',
      });
    },

    onInput(ctx: ModeContext, e: FelInput) {
      SoundKit.unlock();
      if (e.t === 'stick' && e.side === 'L') { stickX = e.x; stickY = e.y; }
      if (e.t !== 'button' || !e.pressed) return;

      if (phase === 'weaponSelect') {
        if (e.btn === 'A') myWeapon = 'fists';
        else if (e.btn === 'B') myWeapon = 'blade';
        else if (e.btn === 'Y') myWeapon = 'staff';
        else return;
        meStrike.swapMoveset(WEAPON_MOVESET[myWeapon]());
        banner(ctx, `${WEAPON_TAG[myWeapon]} — ROUND 1`, 1200);
        round = 1; myWins = 0; foeWins = 0;
        setTimeout(() => startRound(ctx), 900);
        return;
      }
      if (phase !== 'fighting' || !meState.controllable) return;

      const moveIds = Object.keys(WEAPON_MOVESET[myWeapon]());
      const whooshPitch = { fists: 1.2, blade: 1.5, staff: 0.8 }[myWeapon];
      const trySwing = (id: string) => {
        if (meStrike.request(id, now())) SoundKit.play('whoosh', { pitch: whooshPitch, volume: 0.4 });
      };
      if (e.btn === 'A') trySwing(moveIds[0]);
      if (e.btn === 'B') trySwing(moveIds[1]);
      if (e.btn === 'Y') trySwing(moveIds[2]);
      if (e.btn === 'X') {
        const to = rival.root.position.subtract(player.root.position);
        const flick = (stickX * to.x + -stickY * to.z) > 0.3;
        meDef.pressBlock(now(), flick);
        meState.pressBlock(now());
      }
    },

    update(ctx: ModeContext, dt: number) {
      phaseSec += dt;
      if (phaseSec > BUDGET_SEC[phase]) {
        if (phase === 'fighting') endRound(ctx, meState.hp >= foeState.hp, 'TIME');
        else if (phase === 'weaponSelect') { meStrike.swapMoveset(WEAPON_MOVESET[myWeapon]()); startRound(ctx); }
        return;
      }
      if (phase !== 'fighting') return;

      hitT = Math.max(0, hitT - dt);
      if (hitT === 0) { meHitBy = null; foeHitBy = null; }
      meState.tick(dt); foeState.tick(dt);
      if (meState.blockHeld && meDef.blocking) { /* guard held */ }
      if (meState.blockHeld && !(stickX || true)) { /* noop */ }

      // 8-way movement (both fighters orbit the disc)
      if (meState.controllable && !meStrike.busy && !meDef.blocking) {
        meMove.updateWithSelf(dt, stickX, stickY, false, player.root.position);
      } else {
        meMove.updateWithSelf(dt, 0, 0, false, player.root.position);
      }
      player.root.position.addInPlace(meMove.vel.scale(dt));

      // rival AI: orbit + approach to weapon range, swing on cooldown
      if (foeState.controllable && !foeStrike.busy) {
        const dist = Vector3.Distance(rival.root.position, player.root.position);
        const want = WEAPON_RANGE[foeWeapon] * 0.85;
        const radial = dist > want + 0.3 ? 1 : dist < want - 0.5 ? -1 : 0;
        const orbit = Math.sin(phaseSec * 0.7) > 0 ? 0.6 : -0.6;
        foeMove.updateWithSelf(dt, orbit, radial, false, rival.root.position);
        if (dist <= WEAPON_RANGE[foeWeapon] && Math.random() < 0.02) {
          const ids = Object.keys(WEAPON_MOVESET[foeWeapon]());
          foeStrike.request(ids[Math.floor(Math.random() * ids.length)], now());
        }
        if (meStrike.busy && Math.random() < 0.035) { foeDef.pressBlock(now(), Math.random() < 0.3); foeState.pressBlock(now()); }
        else if (foeState.blockHeld && Math.random() < 0.025) { foeDef.releaseBlock(); foeState.releaseBlock(); }
      } else {
        foeMove.updateWithSelf(dt, 0, 0, false, rival.root.position);
      }
      rival.root.position.addInPlace(foeMove.vel.scale(dt));

      // strike resolution at active-frame open
      if (meStrike.update(dt, now()).startedActive) resolveActive(ctx, true);
      if (foeStrike.update(dt, now()).startedActive) resolveActive(ctx, false);
      if (checkRingOut(ctx)) return;

      // edge warning
      const meR = Math.hypot(player.root.position.x, player.root.position.z);
      if (meR > EDGE_WARN) ctx.setHud({ hint: 'EDGE! WATCH YOUR FOOTING' });

      // animation
      const w8 = (w: DuelWeapon) => w !== 'fists';
      meAnim.update({
        speed01: meMove.vel.length() / 6.4, dashing: false, hasWeapon: w8(myWeapon),
        striking: meStrike.current?.move.weight ?? null,
        blocking: meDef.blocking, parryFlash: false, guardImpactFlash: false,
        hitBy: meHitBy, down: meState.staggerSec > 0.8, out: meState.hp <= 0, ulting: false,
      });
      foeAnim.update({
        speed01: foeMove.vel.length() / 6.4, dashing: false, hasWeapon: w8(foeWeapon),
        striking: foeStrike.current?.move.weight ?? null,
        blocking: foeDef.blocking, parryFlash: false, guardImpactFlash: false,
        hitBy: foeHitBy, down: foeState.staggerSec > 0.8, out: foeState.hp <= 0, ulting: false,
      });

      ctx.setHud({ hp: meState.hp, foeHp: foeState.hp, guard: Math.round(meState.guard), foeGuard: Math.round(foeState.guard) });
      ctx.camDirector.update(player.root.position, meMove.vel, rival.root.position);
    },

    dispose() {
      discMesh?.dispose();
      player?.dispose(); rival?.dispose(); SoundKit.stopAmbient();
    },
  };
})();
