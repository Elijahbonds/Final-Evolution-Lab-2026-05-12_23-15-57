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

import { MeshBuilder, StandardMaterial, Color3, Vector3 } from '@babylonjs/core';
import type { AbstractMesh } from '@babylonjs/core';
import { CharacterLibrary, type SpawnedCharacter } from '../core/CharacterLibrary';
import { neverBindPose } from '../anim/importSanitizer';
import { installSafePlay, SPORT_CLIP } from '../anim/clipRegistry';
import {
  FighterState, RivalFightBrain, resolveStrike, applyHit,
  KARATE_ATTACKS, STAFF_ATTACKS, SPECIAL_ATTACK, CHI_MAX, PARRY_STAGGER_SEC,
  STEP_CHI_GAIN, type AttackDef,
} from '../core/FightCore';
import { SoundKit } from '../audio/SoundKit';
import { EffectsKit } from '../visual/EffectsKit';
import { Onlookers } from '../visual/Onlookers';
import { assertSpawned } from '../core/FrameGuard';
import type { ModeContext, ModeDefinition, HudValue } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import { KARATE_CONFIG as CFG } from './modeConfigs';
import { boneNode } from '../anim/boneLookup';

type Phase = 'loadout' | 'fighting' | 'roundOver' | 'matchOver';
type Loadout = 'fists' | 'staff';
const ROUNDS_TO_WIN = 2;
const RING_RADIUS = 6.2;
const MOVE_SPEED = 3.3;
const SLOWMO_SEC = 0.5;
const SLOWMO_SCALE = 0.3;
const LOADOUT_LABEL: Record<Loadout, string> = { fists: 'FISTS — fast & close', staff: 'STAFF — long & heavy' };

const BUDGET_SEC: Record<Phase, number> = { loadout: 12, fighting: 120, roundOver: 5, matchOver: 999 };

export const MixedCombatMode: ModeDefinition = (() => {
  let player: SpawnedCharacter, rival: SpawnedCharacter;
  let meState: FighterState, foeState: FighterState;
  let brain: RivalFightBrain;
  let phase: Phase = 'loadout';
  let phaseSec = 0;
  let round = 1, myWins = 0, foeWins = 0;
  let myLoadout: Loadout = 'fists';
  let striking = false, foeStriking = false;
  let slowmoSec = 0, falling = false;
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
  let lookX = 0, lookY = 0;   // R stick → camera look (MODE-STICK-FACE family, 2026-09-07)
  let gallery: Onlookers | null = null;

  const foeLoadout = (): Loadout => (myLoadout === 'fists' ? 'staff' : 'fists');
  const myAttacks = (): Record<'jab' | 'kick' | 'heavy', AttackDef> => (myLoadout === 'staff' ? STAFF_ATTACKS : KARATE_ATTACKS);
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
    if (myLoadout === 'staff') myStaff = makeStaff(ctx, player, 'mc_staff_me');
    if (foeLoadout() === 'staff') foeStaff = makeStaff(ctx, rival, 'mc_staff_foe');
    brain = new RivalFightBrain(0.6, foeAttacks());
  }

  function faceEachOther(): void {
    // A striker is COMMITTED to their line: no re-tracking mid-swing. Without
    // this the per-frame auto-face erases every sidestep — the attack line
    // follows the defender and the step grammar can never fire (measured:
    // 150s of orbiting, zero steps).
    const to = rival.root.position.subtract(player.root.position);
    if (!striking) player.root.rotation.y = Math.atan2(to.x, to.z);
    if (!foeStriking) rival.root.rotation.y = Math.atan2(-to.x, -to.z);
  }

  function offRing(pos: Vector3): boolean {
    return Math.hypot(pos.x, pos.z) > RING_RADIUS;
  }

  function knockback(ctx: ModeContext, char: SpawnedCharacter, fromPos: Vector3, meters: number, onDone: () => void): void {
    const dir = char.root.position.subtract(fromPos); dir.y = 0;
    if (dir.lengthSquared() < 1e-4) { onDone(); return; }
    dir.normalize();
    const from = char.root.position.clone();
    const to = from.add(dir.scale(meters));       // deliberately NOT clamped — the edge is live
    const t0 = now();
    const obs = ctx.scene.onBeforeRenderObservable.add(() => {
      const k = Math.min(1, (now() - t0) / 180);
      char.root.position.x = from.x + (to.x - from.x) * k;
      char.root.position.z = from.z + (to.z - from.z) * k;
      if (k >= 1) { ctx.scene.onBeforeRenderObservable.remove(obs); onDone(); }
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
    victim.animator.play(SPORT_CLIP.fallReact, {});
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
    const special = key === 'heavy' && atkState.chi >= CHI_MAX;
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
    atkChar.animator.play(atk.clip, {
      onEnd: () => {
        if (mine) striking = false; else foeStriking = false;
        atkChar.animator.play(SPORT_CLIP.karateStance, { loop: true, fadeSec: 0.12 });
      },
    });

    setTimeout(() => {
      if (phase !== 'fighting' || falling) { if (mine) striking = false; else foeStriking = false; return; }
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
          ctx.feel?.impact?.(0.5);   // ONE thud (the 0.5-pitch impact SFX that stacked on it is gone)
          ctx.juice.shake(0.08, 120);
          console.info('[MC-JUICE] guard break');
          EffectsKit.burst(ctx.scene, defChar.root.position.add(new Vector3(0, 1.2, 0)), 'glitch');
          defChar.animator.play(SPORT_CLIP.karateKnockdown, { onEnd: () => defChar.animator.play(SPORT_CLIP.karateStance, { loop: true }) });
          gallery?.cheer(0.6);
          ctx.setHud({ banner: mine ? 'GUARD BREAK!' : 'YOUR GUARD SHATTERED!', ...(mine ? { foeGuard: 0 } : { guard: 0 }) });
          setTimeout(() => ctx.setHud({ banner: '' }), 900);
          break;
        }
        case 'hit': {
          applyHit(atkState, defState, atk);
          ctx.feel?.impact?.(special ? 0.6 : 0.3);   // ONE thud per connect (the impact SFX that doubled it is gone)
          if (special || key === 'heavy') heavyPunch(ctx, special ? 'special' : 'heavy'); else console.info('[MC-JUICE] hit');
          EffectsKit.burst(ctx.scene, defChar.root.position.add(new Vector3(0, 1.2, 0)), special ? 'glitch' : 'sparks');
          defChar.animator.play(SPORT_CLIP.karateHitReact, { onEnd: () => defChar.animator.play(SPORT_CLIP.karateStance, { loop: true }) });
          const hud: Record<string, HudValue> = mine
            ? { foeHp: defState.hp, chi: Math.round(atkState.chi) }
            : { hp: defState.hp, foeChi: Math.round(atkState.chi) };
          if (atkState.combo >= 2) hud.banner = mine ? `COMBO x${atkState.combo}` : `RIVAL COMBO x${atkState.combo}`;
          ctx.setHud(hud);
          if (atkState.combo >= 2) setTimeout(() => ctx.setHud({ banner: '' }), 700);
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
    SoundKit.play(playerWon ? 'crowdCheer' : 'crowdGroan');
    if (playerWon) roundWinBeat(ctx);
    if (!wasRingOut) {
      const loser = playerWon ? rival : player;
      loser.animator.play(SPORT_CLIP.karateKnockdown, {});
    }
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
    player.animator.play(SPORT_CLIP.karateStance, { loop: true });
    rival.animator.play(SPORT_CLIP.karateStance, { loop: true });
    setPhase('loadout');
    ctx.setHud({
      banner: '', loadout: LOADOUT_LABEL[myLoadout],
      hint: 'D-PAD or STICK up/down — pick FISTS or STAFF (rival takes the other) · any attack button to lock in',
    });
  }

  function startRound(ctx: ModeContext): void {
    meState.resetRound(); foeState.resetRound();
    applyLoadouts(ctx);
    faceEachOther();
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
        position: new Vector3(0, 0, 2.2), startClip: SPORT_CLIP.karateStance,
      });
      neverBindPose(player.animator, SPORT_CLIP.karateStance);
      installSafePlay(player.animator, 'mixedcombat-player');
      ctx.groundLock?.track(player.root, player.skeleton);

      rival = await CharacterLibrary.spawn(ctx.scene, CFG.heroUrl, {
        position: new Vector3(0, 0, -2.2), tint: '#1e3a8b', startClip: SPORT_CLIP.karateStance,
      });
      neverBindPose(rival.animator, SPORT_CLIP.karateStance);
      installSafePlay(rival.animator, 'mixedcombat-rival');
      ctx.groundLock?.track(rival.root, rival.skeleton);

      meState = new FighterState(100);
      foeState = new FighterState(100);
      round = 1; myWins = 0; foeWins = 0; myLoadout = 'fists'; matchLatch = false; heavyAt = 0;
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
        if (e.btn === 'X') { meState.pressBlock(now()); player.animator.play(SPORT_CLIP.karateBlock, { loop: true }); }
      }
      if (e.t === 'button' && !e.pressed && e.btn === 'X') {
        meState.releaseBlock();
        if (!striking) player.animator.play(SPORT_CLIP.karateStance, { loop: true });
      }
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
        return;
      }

      slowmoSec = Math.max(0, slowmoSec - dt);
      const sdt = slowmoSec > 0 ? dt * SLOWMO_SCALE : dt;
      meState.tick(sdt); foeState.tick(sdt);

      // player 8-way movement — NO clamp: walking off the edge is a real
      // (terrible) option, which is what makes edge pressure meaningful.
      // MODE-STICK-FACE (2026-09-07): CAMERA-relative — up = the camera's flat forward (the rival, whom the fight camera
      // looks at from behind the player), right = screen right. The world-axis read walked up-stick AWAY from the rival
      // (Δscreen −3.4 m toward the camera) and mirrored X whenever the camera had swung. No axis is flipped.
      const moveVel = ctx.camDirector.forwardFlat().scale(-stickY * MOVE_SPEED).addInPlace(ctx.camDirector.rightFlat().scale(stickX * MOVE_SPEED));
      if (meState.controllable && !striking && !meState.blockHeld) {
        const vel = moveVel;
        player.root.position.addInPlace(vel.scale(sdt));
        player.animator.play(vel.lengthSquared() > 0.4 ? SPORT_CLIP.combatStep : SPORT_CLIP.karateStance, { loop: true });   // guard up on the move
        if (offRing(player.root.position)) { ringOut(ctx, true); return; }
      }

      // rival AI (its brain uses its own loadout's ranges); it never
      // voluntarily steps off — clamp ITS walk to the ring, so only
      // knockback can send it over
      const action = brain.decide(sdt, rival.root.position, player.root.position, foeState, striking);
      if (action.block && !foeState.blockHeld) { foeState.pressBlock(now()); rival.animator.play(SPORT_CLIP.karateBlock, { loop: true }); }
      if (!action.block && foeState.blockHeld) { foeState.releaseBlock(); if (!foeStriking) rival.animator.play(SPORT_CLIP.karateStance, { loop: true }); }
      if (action.attack) swing(ctx, false, action.attack);
      if (foeState.controllable && !foeStriking && !foeState.blockHeld) {
        const vel = new Vector3(action.moveX, 0, -action.moveY).scale(MOVE_SPEED * 0.9);
        rival.root.position.addInPlace(vel.scale(sdt));
        const r = Math.hypot(rival.root.position.x, rival.root.position.z);
        if (r > RING_RADIUS - 0.3) {
          const s = (RING_RADIUS - 0.3) / r;
          rival.root.position.x *= s; rival.root.position.z *= s;
        }
        if (vel.lengthSquared() > 0.4) rival.animator.play(SPORT_CLIP.combatStep, { loop: true });
      }

      faceEachOther();
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
    },

    dispose() {
      myStaff?.dispose(); foeStaff?.dispose();
      gallery?.dispose(); gallery = null;
      player?.dispose(); rival?.dispose(); SoundKit.stopAmbient();
    },
  };
})();

// HUD CONTRACT (bare values — bezel decorates): hp/foeHp, guard/foeGuard,
// chi/foeChi, round, wins/foeWins, loadout (string), banner, hint,
// edge ('EDGE BEHIND YOU' | 'RIVAL ON THE EDGE' | null).
