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

import { mountPostureLayer } from '../anim/PostureLayer';
type PostureHandle = ReturnType<typeof mountPostureLayer>;
import { combatPose, combatApproach, COMBAT_INPUT_IDLE, type CombatPostureInput } from '../core/CombatPosture';
import { BodyMotion, dynamicPose, COMBAT_DYNAMIC } from '../core/DynamicPosture';
import { strafeAxis } from '../core/Biomech';
import { nerve, standingOf } from '../core/Nerve';
import { MeshBuilder, StandardMaterial, Color3, Vector3 } from '@babylonjs/core';
import type { AbstractMesh } from '@babylonjs/core';
import { CharacterLibrary, type SpawnedCharacter } from '../core/CharacterLibrary';
import { neverBindPose } from '../anim/importSanitizer';
import { installSafePlay, SPORT_CLIP } from '../anim/clipRegistry';
import { FighterState, KARATE_ATTACKS, STAFF_ATTACKS } from '../core/FightCore';
import {
  StrikeController, karateMoveset, staffMoveset, bladeMoveset, MIN_STARTUP_SEC, type CombatMove,
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
import { weaponById, readWeapon, equipWeapon } from '../combat/arsenal';
import type { Mesh } from '@babylonjs/core';
import { VenueKit } from '../visual/VenueKit';
import { mountVenue, type VenueHandle } from '../core/NexusVenue';
import { readBlend, blendTraits } from '../combat/schools';
import { styleMoveset } from '../combat/loadout';

export type DuelWeapon = 'fists' | 'staff' | 'blade';
const WEAPON_MOVESET: Record<DuelWeapon, () => Record<string, CombatMove>> = {
  fists: () => karateMoveset(KARATE_ATTACKS),
  staff: () => staffMoveset(STAFF_ATTACKS),
  blade: () => bladeMoveset(),
};
const WEAPON_TAG: Record<DuelWeapon, string> = { fists: 'FISTS', staff: 'STAFF', blade: 'BLADE' };

/**
 * The player's start-up screen picks, applied to whatever weapon this round is using.
 *
 * The in-round A/B/Y phase is untouched — the screen sets what you WALK IN with, and the phase still lets you
 * change your mind. The STYLE comes from the screen either way, because a school is how you fight rather than
 * what you fight with.
 */
const styled = (w: DuelWeapon): Record<string, CombatMove> =>
  styleMoveset(WEAPON_MOVESET[w](), blendTraits(readBlend()), MIN_STARTUP_SEC);
/**
 * Reach per weapon — the AI spaces off this, so it has to be the FURTHEST move, not the jab.
 *
 * It was the jab's: fists at 1.6 while their kick reaches 1.9, so the rival stood at 1.8 believing it was
 * safe and ate a kick there every round. Read from the arsenal now, which is the one place that knows.
 */
const WEAPON_RANGE: Record<DuelWeapon, number> = {
  fists: weaponById('fists').reach, staff: weaponById('staff').reach, blade: weaponById('blade').reach,
};

const DISC_RADIUS = 6.5;            // ring-out boundary
/** How far the platform stands proud of the venue floor. Non-zero or the two surfaces z-fight. */
const DISC_LIFT = 0.12;
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
  // THE BODY REACTS, NOT JUST THE CLIPS (2026-09-14).
  //
  // Duel and showdown were the two combat modes with no posture layer: karate, karate_vs and mixedcombat
  // all mount one, and these two -- their direct siblings, on the same CombatAnimTree and the same
  // FighterState -- did not. So a duellist's spine, chest and head never answered what his feet were doing.
  // Nothing here is new machinery; it is the karate_vs mount, on the mode that was missing it.
  let mePosture: PostureHandle | null = null, foePosture: PostureHandle | null = null;
  const meBio: CombatPostureInput = { ...COMBAT_INPUT_IDLE }, foeBio: CombatPostureInput = { ...COMBAT_INPUT_IDLE };
  const meMotion = new BodyMotion(), foeMotion = new BodyMotion();
  const chestOf = (c: SpawnedCharacter): Vector3 => c.root.position.add(new Vector3(0, 1.32, 0));
  const feedFor = (bio: CombatPostureInput, foeC: () => SpawnedCharacter, motion: BodyMotion, exertion: number) => {
    const { window, pose, legs } = combatPose(bio);
    const at = chestOf(foeC());
    const dyn = dynamicPose(pose, motion.signals(bio.speed01, exertion, false), window, COMBAT_DYNAMIC);
    return { pose: dyn, legs, aim: at, eyes: at, window };
  };
  // Set in load() from the start-up screen's pick, never here: this factory body runs when the registry is
  // built, which on Next is during SSR with no window and no URL. See MixedCombatMode for the measured
  // version of that bug.
  let myWeapon: DuelWeapon = 'fists';
  let myProp: Mesh | null = null, foeProp: Mesh | null = null;
  let modeVenue: VenueHandle | null = null;
  let foeWeapon: DuelWeapon = 'staff';
  let phase: Phase = 'intro';
  let phaseSec = 0;
  let stickX = 0, stickY = 0;
  let lookX = 0, lookY = 0;   // R stick → camera look (MODE-STICK-FACE family, 2026-09-07)
  /** MODE-STICK-FACE (2026-09-07): the L stick as a WORLD wish, camera-relative — up = the camera's flat forward (the
   *  rival on the disc), right = screen right. The 8-way basis read raw up-stick as RETREAT (−moveY·radial points away
   *  from the foe; measured Δscreen −3.4 m on push-forward). */
  const wish = (ctx: ModeContext): Vector3 => ctx.camDirector.forwardFlat().scale(-stickY).addInPlace(ctx.camDirector.rightFlat().scale(stickX));
  let round = 1, myWins = 0, foeWins = 0;
  // ── A+ P0 juice (PM brief COMBAT-A-PLUS-P0, 2026-09-06): ONE thud per connect (feel.impact plays its own — the SoundKit
  // impact that stacked on it is gone), a latched hit-stop + shake on heavy / special, a soft round-win beat and a latched
  // Street Fighter–class MATCH punch. No hang slowMo, no juice.impact({ slow }). The parry's scoped slow-mo is the mode's own.
  let heavyAt = 0, matchLatch = false;
  function heavyPunch(ctx: ModeContext, tag: string): void {
    const t = performance.now(); if (t - heavyAt < 120) return; heavyAt = t;   // once per connect
    ctx.juice.hitStop(45); ctx.juice.shake(0.10, 130);
    console.info(`[DUEL-JUICE] heavy punch (${tag})`);
  }
  function roundWinBeat(ctx: ModeContext): void { ctx.juice.shake(0.08, 140); ctx.juice.flash('#fff6dd', 90); console.info('[DUEL-JUICE] round win'); }
  function matchPunch(ctx: ModeContext): void {
    if (matchLatch) return; matchLatch = true;
    ctx.juice.hitStop(60); ctx.juice.shake(0.14, 160); ctx.juice.flash('#FFD700', 140);
    console.info('[DUEL-JUICE] match punch');
  }
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
        ctx.feel?.impact?.(0.55);   // ONE thud (the impact SFX that stacked on it is gone)
        // THE METER HEARS THE FIGHT. `mine` says who swung: one fighter's highlight is the other's blunder.
        ctx.momentum.report({ kind: mine ? 'clean_hit' : 'blunder', weight: mine ? 14 : -10 });
        ctx.juice.shake(0.08, 120);
        console.info('[DUEL-JUICE] guard break');
        banner(ctx, mine ? 'GUARD BREAK!' : 'GUARD SHATTERED!');
        break;
      case 'parried':
        SoundKit.play('impact', { pitch: 1.6, volume: 0.5 });
        // A PARRY IS THE NEAR MISS. Reach decides this fight, so reading a swing and answering it is the
        // skill the mode is about -- and it was worth nothing to the meter.
        ctx.momentum.report({ kind: mine ? 'near_miss' : 'blunder', weight: mine ? 12 : -6 });
        banner(ctx, mine ? 'PARRIED!' : 'PERFECT PARRY!');
        break;
      case 'guardImpacted':
        // THE Duel skill: unmistakable stinger + flash + camera beat
        SoundKit.play('impact', { pitch: 2.1, volume: 0.7 });   // the GI stinger is the one sound; the feel thud is replaced by the latched hit-stop + shake
        SoundKit.play('uiTick', { pitch: 1.8, volume: 0.5 });
        heavyPunch(ctx, 'guard impact');
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
        ctx.feel?.impact?.(w === 'heavy' ? 0.55 : 0.3);   // ONE thud per connect (the impact SFX that doubled it is gone)
        ctx.momentum.report(mine ? { kind: 'clean_hit', weight: w === 'heavy' || w === 'finisher' ? 16 : 9 } : { kind: 'blunder', weight: -8 });
        if (w === 'heavy' || w === 'finisher') heavyPunch(ctx, w); else console.info('[DUEL-JUICE] hit');
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
    if (playerWon) roundWinBeat(ctx);
    (playerWon ? rival : player).animator.play(SPORT_CLIP.karateKnockdown, {});
    ctx.setHud({ wins: myWins, foeWins, banner: `${label} — ROUND ${round}` });
    setTimeout(() => {
      ctx.setHud({ banner: '' });
      if (myWins >= ROUNDS_TO_WIN || foeWins >= ROUNDS_TO_WIN) {
        setPhase('matchOver');
        SoundKit.play('whistle');
        if (playerWon) matchPunch(ctx);
        ctx.end(playerWon ? 'DUEL_WON' : 'DUEL_LOST', myWins * 100 - foeWins * 40, { foeWins, weapon: myWeapon as string } as never);
        return;
      }
      round++;
      startRound(ctx);
    }, 2000);
  }

  function startRound(ctx: ModeContext): void {
    meState.resetRound(); foeState.resetRound();
    // SHARED-PLACE-FLOOR (feet on floor): the round reset put both fighters at y 0 — 12 cm INSIDE the raised disc they spawn on
    player.root.position.set(0, DISC_LIFT, 2.4); rival.root.position.set(0, DISC_LIFT, -2.4);
    player.root.rotation.y = Math.PI; rival.root.rotation.y = 0;
    meMove.vel.setAll(0); foeMove.vel.setAll(0);
    setPhase('fighting');
    ctx.setHud({
      hp: 100, foeHp: 100, wins: myWins, foeWins, round: `${round}`,
      hint: 'Stick orbits your foe · X block — tap+flick TOWARD them at impact for GUARD IMPACT · knock them OFF the disc',
    });
  }

  /**
   * Put the chosen weapons in both fighters' hands.
   *
   * Duel swapped the staff MOVESET — a metre of extra reach and a slower, punishable fight — while the
   * fighter's hands stayed empty, so the single most important read in a weapon duel (what is the other
   * person holding, and how far can it reach me) was invisible. Called on every weapon change, including the
   * in-round A/B/Y phase, so what you see is always what you are swinging.
   */
  function showWeapons(ctx: ModeContext): void {
    myProp?.dispose(); myProp = null;
    foeProp?.dispose(); foeProp = null;
    if (player) myProp = equipWeapon(ctx.scene, player.skeleton, weaponById(myWeapon), 'duel_weapon_me');
    if (rival) foeProp = equipWeapon(ctx.scene, rival.skeleton, weaponById(foeWeapon), 'duel_weapon_foe');
  }

  return {
    modeId: 'duel', mood: 'dojoWarm', camPreset: 'duel',  // Phase 9: side-on disc framing

    async load(ctx: ModeContext) {
      // A ROOM TO FIGHT IN (2026-09-13). Phase 0 measured this mode at SIXTEEN visible meshes — the sparsest
      // world in the roster against dunk's 174 — and the reason was simply that it mounted no venue at all:
      // a disc and a rim floating in front of a backdrop. Its two sibling combat modes (Showdown and Karate
      // VS) have always mounted the dojo with a kit fallback; Duel was the one that never got the line. Same
      // spec, same fallback, so the three combat modes are finally the same room.
      modeVenue = mountVenue(ctx, 'karate_h2h', { keepGameplayCamera: true });
      if (!modeVenue) VenueKit.buildDojo(ctx.scene);

      // raised disc arena (ring-out platform)
      discMesh = MeshBuilder.CreateCylinder('duel_disc', { diameter: DISC_RADIUS * 2, height: 0.4 }, ctx.scene);
      // THE DISC IS A RAISED PLATFORM, and it has to be raised for a reason beyond flavour: with the dojo
      // now under it, a disc whose top sat exactly at the venue floor's y = 0 was COPLANAR with it, and the
      // floor photographed covered in purple z-fighting blotches. It is a ring-out arena — standing it proud
      // of the floor fixes the artifact and makes the boundary the fight turns on visible at the same time.
      discMesh.position.y = -0.2 + DISC_LIFT;
      const dm = new StandardMaterial('discMat', ctx.scene);
      dm.diffuseColor = new Color3(0.16, 0.18, 0.24);
      discMesh.material = dm;
      const rim = MeshBuilder.CreateTorus('duel_rim', { diameter: DISC_RADIUS * 2, thickness: 0.08 }, ctx.scene);
      rim.position.y = DISC_LIFT + 0.02;

      // 'karate_idle_stance' is a deliberate CLIP_ALIASES entry (guard @ 0.8x
      // — a slower, more grounded ready-stance pace than plain SPORT_CLIP.
      // karateStance's 1.0x), not a typo — keep the raw alias key here.
      player = await CharacterLibrary.spawn(ctx.scene, CFG.heroUrl, {
        position: new Vector3(0, DISC_LIFT, 2.4), startClip: 'karate_idle_stance', modeId: 'duel-me',
      });
      neverBindPose(player.animator, 'karate_idle_stance');
      installSafePlay(player.animator, 'duel-me');
      rival = await CharacterLibrary.spawn(ctx.scene, CFG.heroUrl, {
        position: new Vector3(0, DISC_LIFT, -2.4), tint: '#8b1e2d', startClip: 'karate_idle_stance', modeId: 'duel-rival',
      });
      neverBindPose(rival.animator, 'karate_idle_stance');
      installSafePlay(rival.animator, 'duel-rival');

      meState = new FighterState(100); foeState = new FighterState(100);
      // what the start-up screen chose, if it is one this mode offers (the gauntlet is not a duel weapon)
      myWeapon = (['fists', 'staff', 'blade'] as const).find((w) => w === readWeapon().id) ?? 'fists';
      meStrike = new StrikeController(styled(myWeapon));
      showWeapons(ctx);
      foeStrike = new StrikeController(WEAPON_MOVESET[foeWeapon]());   // the rival fights unstyled
      meMove = new CombatMovement(); foeMove = new CombatMovement();
      meMove.moveMode = 'eightWay'; foeMove.moveMode = 'eightWay';
      meMove.lockTarget = rival.root.position; foeMove.lockTarget = player.root.position;
      meDef = new DefenseController(); foeDef = new DefenseController();
      meAnim = new CombatAnimTree(player.animator); foeAnim = new CombatAnimTree(rival.animator);
      // GUARD is the exertion signal here, the same reading karate_vs uses: a fighter whose guard is gone
      // is a fighter who has been working, and the dynamic layer leans the body accordingly.
      mePosture = mountPostureLayer(ctx.scene, player.skeleton, player.root, () => feedFor(meBio, () => rival, meMotion, 1 - meState.guard / 100), 'DUEL-PP');
      foePosture = mountPostureLayer(ctx.scene, rival.skeleton, rival.root, () => feedFor(foeBio, () => player, foeMotion, 1 - foeState.guard / 100), 'DUEL-PP-FOE');
      if (process.env.NODE_ENV === 'development') {
        // the same dev seam karate_vs carries: without it, "the posture layer is mounted" is a claim about
        // source rather than about a running game, and this pass has spent all day on that distinction.
        const dev = (window as unknown as { __FEL_DEV__?: { combatPosture?: unknown } }).__FEL_DEV__;
        if (dev) dev.combatPosture = { me: () => mePosture?.layer.get() ?? null, foe: () => foePosture?.layer.get() ?? null, bio: () => ({ me: { ...meBio }, foe: { ...foeBio } }) };
      }

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
      if (e.t === 'stick' && e.side === 'R') { lookX = e.x; lookY = e.y; }   // MODE-STICK-FACE: R stick → the director's look orbit
      if (e.t !== 'button' || !e.pressed) return;

      if (phase === 'weaponSelect') {
        if (e.btn === 'A') myWeapon = 'fists';
        else if (e.btn === 'B') myWeapon = 'blade';
        else if (e.btn === 'Y') myWeapon = 'staff';
        else return;
        meStrike.swapMoveset(styled(myWeapon));
        showWeapons(ctx);
        banner(ctx, `${WEAPON_TAG[myWeapon]} — ROUND 1`, 1200);
        round = 1; myWins = 0; foeWins = 0; matchLatch = false; heavyAt = 0;
        setTimeout(() => startRound(ctx), 900);
        return;
      }
      if (phase !== 'fighting' || !meState.controllable) return;

      const moveIds = Object.keys(styled(myWeapon));
      const whooshPitch = { fists: 1.2, blade: 1.5, staff: 0.8 }[myWeapon];
      const trySwing = (id: string) => {
        if (meStrike.request(id, now())) SoundKit.play('whoosh', { pitch: whooshPitch, volume: 0.4 });
      };
      if (e.btn === 'A') trySwing(moveIds[0]);
      if (e.btn === 'B') trySwing(moveIds[1]);
      if (e.btn === 'Y') trySwing(moveIds[2]);
      if (e.btn === 'X') {
        const to = rival.root.position.subtract(player.root.position);
        const w = wish(ctx);
        const flick = (w.x * to.x + w.z * to.z) > 0.3;
        meDef.pressBlock(now(), flick);
        meState.pressBlock(now());
      }
    },

    update(ctx: ModeContext, dt: number) {
      phaseSec += dt;
      if (phaseSec > BUDGET_SEC[phase]) {
        if (phase === 'fighting') endRound(ctx, meState.hp >= foeState.hp, 'TIME');
        else if (phase === 'weaponSelect') { meStrike.swapMoveset(styled(myWeapon)); startRound(ctx); }
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
        meMove.updateWithSelf(dt, stickX, stickY, false, player.root.position, wish(ctx));
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
        // AI RATES ARE PER SECOND NOW, NOT PER FRAME.
        //
        // These were `Math.random() < 0.02` evaluated once per rendered frame, which makes the rival's
        // aggression a function of the player's REFRESH RATE: at 144 fps it rolls 2.4x as often as at 60, so
        // the same opponent attacks more than twice as much on a better monitor. `1 - exp(-rate*dt)` is the
        // same chance per second of wall-clock time at any frame rate. The rates below are the old per-frame
        // numbers x 60, so a 60 fps game plays exactly as it did.
        //
        // NERVE rides the same line, on two DIFFERENT mechanisms as the module requires: `aggression` speeds
        // the swing rate up, `mistake` cuts the reactive block down. Behind on rounds it comes forward more
        // and guards less.
        const nrv = nerve(standingOf(foeWins, myWins, ROUNDS_TO_WIN, Math.min(1, Math.max(myWins, foeWins) / ROUNDS_TO_WIN)));
        const chance = (perSec: number) => Math.random() < 1 - Math.exp(-perSec * dt);
        if (dist <= WEAPON_RANGE[foeWeapon] && chance(1.2 * nrv.aggression)) {
          const ids = Object.keys(WEAPON_MOVESET[foeWeapon]());
          foeStrike.request(ids[Math.floor(Math.random() * ids.length)], now());
        }
        if (meStrike.busy && chance(2.1 / Math.max(0.5, nrv.mistake))) { foeDef.pressBlock(now(), Math.random() < 0.3); foeState.pressBlock(now()); }
        else if (foeState.blockHeld && chance(1.5)) { foeDef.releaseBlock(); foeState.releaseBlock(); }
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

      // the posture bios, resolved in each fighter's OWN frame so a backstep and a circle read differently
      // rather than being the same world-space number
      const meYaw = player.root.rotation.y, foeYaw = rival.root.rotation.y;
      meMotion.update(meMove.vel.x, meMove.vel.z, meYaw, dt);
      foeMotion.update(foeMove.vel.x, foeMove.vel.z, foeYaw, dt);
      const feedBio = (bio: CombatPostureInput, mv: typeof meMove, st: typeof meState, df: typeof meDef, str: typeof meStrike, hb: typeof meHitBy, yaw: number, foeC: SpawnedCharacter, selfC: SpawnedCharacter) => {
        const sp = Math.hypot(mv.vel.x, mv.vel.z);
        const toFoe = foeC.root.position.subtract(selfC.root.position); toFoe.y = 0;
        const closing = toFoe.lengthSquared() > 1e-6 ? Vector3.Dot(mv.vel, toFoe.normalize()) : 0;
        bio.speed01 = Math.min(1, sp / 6.4); bio.strafe = strafeAxis(mv.vel, yaw); bio.approach = combatApproach(closing);
        bio.striking = str.current?.move.weight ?? null; bio.windingUp = false;
        bio.blocking = df.blocking; bio.parrying = false; bio.guardImpact = false;
        bio.hitBy = hb; bio.down = st.staggerSec > 0.8; bio.out = st.hp <= 0;
        bio.rising = false; bio.dodging = false; bio.celebrating = false; bio.engaged = phase === 'fighting';
      };
      feedBio(meBio, meMove, meState, meDef, meStrike, meHitBy, meYaw, rival, player);
      feedBio(foeBio, foeMove, foeState, foeDef, foeStrike, foeHitBy, foeYaw, player, rival);

      ctx.setHud({ hp: meState.hp, foeHp: foeState.hp, guard: Math.round(meState.guard), foeGuard: Math.round(foeState.guard) });
      ctx.camDirector.look(lookX, lookY, dt);
      ctx.camDirector.update(player.root.position, meMove.vel, rival.root.position);
    },

    dispose() {
      modeVenue?.dispose?.(); modeVenue = null;
      discMesh?.dispose();
      // the props are parented to a hand bone, so disposing the character takes them — but they are also
      // rebuilt on every weapon change, and a stale one left behind would ride the next round's rig
      myProp?.dispose(); myProp = null;
      foeProp?.dispose(); foeProp = null;
      mePosture?.dispose(); foePosture?.dispose(); mePosture = null; foePosture = null;
      player?.dispose(); rival?.dispose(); SoundKit.stopAmbient();
    },
  };
})();
