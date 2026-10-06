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
//   DASH — X: a tap dashes (free, with i-frames), a double tap is the chakra dash at the rival.
//   CHAKRA CHARGE — hold L1: rooted, open to a punish, the bar fills (IMPROVE 2026-10-06: L1 was a paid copy of the free
//     X dash).
//   SUBSTITUTION — R1 with an enemy strike incoming: teleport behind them.
//   SUPPORT ASSIST — SELECT: an ally blinks in, extends your combo, leaves.
//   ULTIMATE — full chakra + Y: camera-CUT cinematic (fixed wide → push-in
//     beat → release), huge damage + wall-shatter if it launches the rival
//     into the north gate (destructible beat). The rival has one too
//     (IMPROVE 2026-10-06): its heavy carries it, and it plays only if that
//     opener lands clean.
// All naming/visuals original.

import { mountPostureLayer } from '../anim/PostureLayer';
type PostureHandle = ReturnType<typeof mountPostureLayer>;
import { combatPose, combatApproach, COMBAT_INPUT_IDLE, type CombatPostureInput } from '../core/CombatPosture';
import { BodyMotion, dynamicPose, COMBAT_DYNAMIC } from '../core/DynamicPosture';
import { strafeAxis, lockOnYaw, yawTo, wrapYaw } from '../core/Biomech';
import { COMBAT_TURN_RATE } from '../core/CombatPosture';
import { GameTimers, BannerSlot } from '../core/ModeClock';   // IMPROVE (2026-10-06): beats, banners and the assist's hit on the game clock
import { SHOWDOWN, attackerChakraGain, ultimateReaches, ultLungeStep, burnVerdict, roundCall, launchReachesGate, UltimateArm } from './showdownRules';
import { MeshBuilder, StandardMaterial, Color3, Vector3 } from '@babylonjs/core';
import type { AbstractMesh } from '@babylonjs/core';
import { CharacterLibrary, type SpawnedCharacter } from '../core/CharacterLibrary';
import { neverBindPose } from '../anim/importSanitizer';
import { installSafePlay } from '../anim/clipRegistry';
import { VenueKit } from '../visual/VenueKit';
import { mountVenue, type VenueHandle } from '../core/NexusVenue';
import { readCombatArena, arenasFor, arenaClamp, knockTo, hazardAt, describeArena, showdownGateDist, SHOWDOWN_GATE, type CombatArena } from '../combat/arenas';   // phase 7: the arena decides
import { buildArena, type ArenaHandle } from '../combat/arenaBuild';
import { readPlaceLook } from '../nexus/placeLooks';
import { FighterState, KARATE_ATTACKS, CHI_MAX, PARRY_WINDOW_MS, guardPressMs, rivalDifficulty, rivalPower, applyRivalPower, RIVAL_POWER_BASE, type RivalPower } from '../core/FightCore';
import { KnockSlides, makeChestOf } from '../core/FightKit';   // IMPROVE (2026-10-06): the shared knock slide + scratch chest points
import { readTier } from '../core/Difficulty';   // IMPROVE (2026-10-06): the OPPONENT pick
import { RivalCombatBrain, threatLandsIn } from '../core/RivalCombatBrain';
import { StrikeController, karateMoveset, bookMoveset, MIN_STARTUP_SEC, type CombatMove } from '../core/StrikeSystem';
import { StringBook, type StickDir, type StrikeBtn } from '../core/HordeDynamics';   // phase 4: the Storm strings on showdown
import { readBlend, blendTraits } from '../combat/schools';
import { styleMoveset } from '../combat/loadout';
import { DefenseController, applyDefenseOutcome, SUBSTITUTION_CHI_COST } from '../core/DefenseSystem';
import { CombatMovement } from '../core/CombatMovement';
import { XButtonReader, LAUNCH_AIR_SEC, launchHeight } from '../core/StormCombat';
import { FOCUS, FocusMeter } from '../core/MatrixFocus';   // phase 8: bullet time on R2, a clock per rig   // combat pass phase 3: X = tap dash / double = chakra dash / hold = guard, the same reader the Storm modes use
import { ResourceMeter, CHAKRA } from '../core/ResourceMeter';
import { CombatAnimTree } from '../anim/combatTree';
import { MomentumBus } from '../core/MomentumBus';
import { SoundKit } from '../audio/SoundKit';
import { EffectsKit } from '../visual/EffectsKit';
import { assertSpawned } from '../core/FrameGuard';
import type { ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import { KARATE_CONFIG as CFG } from './modeConfigs';
// MOVEMENT PLAY P7 (2026-09-25): the body's own strikes, guard, slips and steps (lib/babylon/combat/bodyFight)
import { MOVES as HORDE_MOVES } from '../core/HordeDynamics';
import type { DefenseAction } from '../core/DefenseSystem';
import type { AttackDef } from '../core/FightCore';
import {
  BodyFightDriver, DefenseLedger, DeferredHits, BodyDriveTracker, PadBlock, bodyDefenseAt, defenseActionOf, strongerDefense, contactMsOf, bodyLunge, stepSpace,
  FIGHT_CLAIMS, FIGHT_CARD_LINES,
} from '../combat/bodyFight';
import { BODY_FIGHT } from '../combat/bodyFightFlags';
import { readBodyKicks } from '@/lib/move/bodyPlayChoice';
import type { BodyEvent } from '@/lib/pose/BodyReader';
import type { BodyView } from '../core/ModeHarness';

let modeVenue: VenueHandle | null = null;   // ship pass 4: the mounted venue spec, disposed with the mode

const ARENA_HALF = 12;   // the floor fallback clamp when the venue has no navmesh (always, under an arena) — wider than every Showdown arena at ARENA_SCALE (arenas.test holds it); the gate no longer stands on it
const DASH_CHI_COST = 12;
const ULT_DMG = SHOWDOWN.ultDmg;
const ASSIST_COOLDOWN_SEC = 9;
const ASSIST_DMG = 8;
const ASSIST_HIT_SEC = 0.35;   // the assist lands its blow this long after blinking in
/** IMPROVE (2026-10-06): one static hint — L1 is the chakra charge now (it advertised a paid copy of the free X dash). */
export const SHOWDOWN_HINT = 'X tap dash · hold X guard · hold L1 charge chakra · R1 substitute their strike · SELECT assist · R2 focus · full chakra + Y = ULTIMATE';

// IMPROVE (2026-10-06): 'ready' — the round-start beat (ROUND n … FIGHT!); 'roundOver' — the KO pause. The fight used to
// carry on under the KO banner for 1.8 s (a second KO in it counted a second round) and the next round began with no call.
type Phase = 'intro' | 'ready' | 'fighting' | 'ultimate' | 'roundOver' | 'matchOver';
const BUDGET_SEC: Record<Phase, number> = { intro: 4, ready: 3, fighting: 150, ultimate: 6, roundOver: 5, matchOver: 999 };

export const ShowdownMode: ModeDefinition = (() => {
  let player: SpawnedCharacter, rival: SpawnedCharacter, support: SpawnedCharacter | null = null;
  let meState: FighterState, foeState: FighterState;
  let meStrike: StrikeController, foeStrike: StrikeController;
  let meMove: CombatMovement, foeMove: CombatMovement;
  let meDef: DefenseController, foeDef: DefenseController;
  let meAnim: CombatAnimTree, foeAnim: CombatAnimTree;
  // THE BODY REACTS, NOT JUST THE CLIPS (2026-09-14). Showdown and duel were the two combat modes with no
  // posture layer, while karate, karate_vs and mixedcombat -- their siblings on the same CombatAnimTree and
  // the same FighterState -- all mount one. Same mount, on the mode that was missing it.
  let mePosture: PostureHandle | null = null, foePosture: PostureHandle | null = null;
  const meBio: CombatPostureInput = { ...COMBAT_INPUT_IDLE }, foeBio: CombatPostureInput = { ...COMBAT_INPUT_IDLE };
  const meMotion = new BodyMotion(), foeMotion = new BodyMotion();
  const chestOf = makeChestOf();   // IMPROVE (2026-10-06): one scratch point per target, no per-frame Vector3s
  const feedFor = (bio: CombatPostureInput, foeC: () => SpawnedCharacter, motion: BodyMotion, exertion: number) => {
    const { window, pose, legs } = combatPose(bio);
    const at = chestOf(foeC());
    return { pose: dynamicPose(pose, motion.signals(bio.speed01, exertion, false), window, COMBAT_DYNAMIC), legs, aim: at, eyes: at, window };
  };
  let chakra: ResourceMeter, foeChakra: ResourceMeter;
  let mbus = new MomentumBus();
  let wallMesh: AbstractMesh | null = null;
  let gateZ = -12;   // where the gate stands; set from the picked arena at load
  let phase: Phase = 'intro';
  let phaseSec = 0;
  let stickX = 0, stickY = 0;
  let lookX = 0, lookY = 0;   // R stick → camera look (MODE-STICK-FACE family, 2026-09-07)
  /** MODE-STICK-FACE (2026-09-07): the L stick as a WORLD wish, camera-relative — up = the camera's flat forward (the
   *  rival: the fight camera looks at him from behind the player), right = screen right. The raw (x, −y) read walked
   *  up-stick AWAY from the rival (measured Δscreen −2.8 m) and mirrored X once the camera had swung. */
  // IMPROVE (2026-10-06): into one scratch vector (it built three per call, every frame). The director's forwardFlat /
  // rightFlat still allocate inside CameraDirector, which is not this mode's file.
  const wishV = new Vector3();
  const wish = (ctx: ModeContext): Vector3 => {
    const f = ctx.camDirector.forwardFlat(), r = ctx.camDirector.rightFlat();
    return wishV.set(f.x * -stickY + r.x * stickX, 0, f.z * -stickY + r.z * stickX);
  };
  let ultTimer = 0, assistTimer = 0, assistActive = 0;
  let myRounds = 0, foeRounds = 0;
  // IMPROVE (2026-10-06): the one-beat guard flashes, per fighter, SET when the defence lands (they were only ever counted
  // down, so the tree never played the parry or the guard impact)
  let parryFlash = 0, giFlash = 0, foeParryFlash = 0, foeGiFlash = 0;
  // IMPROVE (2026-10-06): who is in the ultimate's cut, and the rival's — armed on one heavy, played only if it lands
  let ultBy: 'me' | 'foe' = 'me';
  const foeUlt = new UltimateArm();
  let foeFullCalled = false;   // the "RIVAL CHAKRA FULL" call, once per fill
  let foeSubstituted = 0;      // IMPROVE (2026-10-06): a rival substitution's beat — my swing in flight finds nobody
  let charging = false;        // IMPROVE (2026-10-06): L1 held — the chakra charge
  let clock = 0;               // IMPROVE (2026-10-06): the mode's game clock (banners)
  const timers = new GameTimers(), bannerSlot = new BannerSlot();
  // ── A+ P0 juice (PM brief COMBAT-A-PLUS-P0, 2026-09-06): ONE thud per connect (feel.impact plays its own — the SoundKit
  // impact that stacked on it is gone), a latched hit-stop + shake on heavy / special, a soft round-win beat and a latched
  // Street Fighter–class MATCH punch. No hang slowMo, no juice.impact({ slow }). The parry's scoped slow-mo is the mode's own.
  let heavyAt = 0, matchLatch = false;
  function heavyPunch(ctx: ModeContext, tag: string): void {
    const t = performance.now(); if (t - heavyAt < 120) return; heavyAt = t;   // once per connect
    ctx.juice.hitStop(45); ctx.juice.shake(0.10, 130);
    console.info(`[SD-JUICE] heavy punch (${tag})`);
  }
  function roundWinBeat(ctx: ModeContext): void { ctx.juice.shake(0.08, 140); ctx.juice.flash('#fff6dd', 90); console.info('[SD-JUICE] round win'); }
  function matchPunch(ctx: ModeContext): void {
    if (matchLatch) return; matchLatch = true;
    ctx.juice.hitStop(60); ctx.juice.shake(0.14, 160); ctx.juice.flash('#FFD700', 140);
    console.info('[SD-JUICE] match punch');
  }
  let foeHitBy: 'light' | 'medium' | 'heavy' | 'finisher' | null = null;
  let meHitBy: 'light' | 'medium' | 'heavy' | 'finisher' | null = null;
  // IMPROVE (2026-10-06): a hit-react timer PER fighter — the one shared timer let a hit on one fighter cut the other's
  // reaction short (and a stale one ran on into the next hit)
  let meHitT = 0, foeHitT = 0;

  const MOVES = karateMoveset(KARATE_ATTACKS);
  const book = new StringBook();   // phase 4: A/B/Y × the stick × the string so far → the move (the horde's sixteen)
  const BTN_OF: Record<'jab' | 'kick' | 'heavy', StrikeBtn> = { jab: 'A', kick: 'B', heavy: 'Y' };
  let stringLabels: string[] = [];
  const WEIGHT_BY_MOVE: Record<string, CombatMove['weight']> =
    Object.fromEntries(Object.entries(MOVES).map(([id, m]) => [id, m.weight]));

  function setPhase(p: Phase): void { phase = p; phaseSec = 0; }
  function now(): number { return performance.now(); }
  /** Phase 5 — THE KNOCK SLIDE (VS's G3 rule): a hit carries the body out at a constant speed with an ease-out, the
   *  distance setting the duration, so a big hit reads bigger. It used to be a velocity impulse added to the movement's
   *  velocity, which the movement model then damped on its own terms — the distance a hit carried was whatever the damping
   *  left, not the attack's knockback. */
  // IMPROVE (2026-10-06): the slide itself is the shared KnockSlides (core/FightKit) — ticked on the ROOM clock in update(),
  // one per body, cleared at a round reset — instead of a real-clock render observer per hit.
  const knock = new KnockSlides();
  function knockSlide(_ctx: ModeContext, char: SpawnedCharacter, fromPos: Vector3, meters: number, clamp?: (q: Vector3) => void, speed?: number): void {
    const dir = char.root.position.subtract(fromPos); dir.y = 0;
    if (dir.lengthSquared() < 1e-4 || meters <= 0) return;
    dir.normalize();
    const to = char.root.position.add(dir.scale(meters)); if (clamp) clamp(to);
    knock.start(char.root.position, to.x, to.z, undefined, speed);
  }
  /** IMPROVE (2026-10-06): the rival at a round's start — the standing (NERVE, once per round now, not per frame), the
   *  OPPONENT pick (PRO = the tuned 0.72), and no slide left running from the last round. */
  function roundStartRival(): void {
    rivalBrain.setStanding(foeRounds, myRounds, 2);
    rivalBrain.setDifficulty(rivalDifficulty(0.72, readTier()));
    // COMBAT DIFFICULTY (2026-10-06): nothing here reads the line, so a read is a guard, never a sidestep; and the rival's
    // POWER for the pick (hp, damage, guard — FightCore.rivalPower). resetRound has run: the HP is filled here.
    rivalBrain.setStepping(false);
    foePower = rivalPower(RIVAL_POWER_BASE.showdown, readTier());
    applyRivalPower(foeState, foePower); foeState.hp = foeState.maxHp;
    knock.clear();
  }
  /** Phase 5 — SOUL CALIBUR WEIGHT (the horde's rule): the connect holds for a beat that grows with the weight. */
  const HIT_STOP_MS = { light: 28, medium: 45, heavy: 70, finisher: 70 } as const;
  let foeLaunchedSec = 0;   // phase 5: a launcher lifts him; the air string is open while it runs
  const xBtn = new XButtonReader();   // phase 3: the Storm X — showdown's X used to be the block alone; the dash was a chi buy on L1
  const focus = new FocusMeter(); let focusHeld = false, focusHud = -1, focusHudOn = false;   // phase 8
  let foeGuardUntil = 0;
  let rivalBrain = new RivalCombatBrain({ difficulty: 0.72 });
  /** COMBAT DIFFICULTY (2026-10-06): the rival's power for this round (rivalPower; set in roundStartRival). */
  let foePower: RivalPower = rivalPower(1, null);
  let arena: CombatArena = arenasFor('showdown')[0]; let arenaHandle: ArenaHandle | null = null;   // phase 7
  // MOVEMENT PLAY P7: the body's fight read (see KarateVSMode: the same seam) — the strikes through the book and the
  // StrikeController's elapsed start, the rival's hits on a body player resolved at impact against the ledger
  // the READY screen's spin / jump kick opt-in, read when a kick is told: the toggle is offered after load (READY, or the
  // check over a pause), so a value read in load() would miss the player's tick for this match
  const bodyDriver = new BodyFightDriver({ kicksOptIn: () => readBodyKicks('showdown') });
  const ledger = new DefenseLedger(), deferred = new DeferredHits(), drive = new BodyDriveTracker();
  const padGuard = new PadBlock();   // P7 (the review, 2026-09-26): the pad's X guard apart from the body's — a deferred hit meets both
  let bodyGuard = false;   // P7: the block is the body's (its guard up), to let go when the reader loses the guard
  let bodyShift: { v: Vector3; left: number } | null = null;
  let myMoves: Record<string, CombatMove> = {};
  let ctxRef: ModeContext | null = null;
  const bodyDriven = (): boolean => drive.driven(!!ctxRef?.body?.()?.read.tracking);
  let hazardTick = 0;
  let guardUp = false;                 // the hold has passed DASH.tapSec and the block is raised
  /** IMPROVE (2026-10-06): ONE banner slot with an expiry on the game clock (core/ModeClock). Each banner used to start its
   *  own setTimeout that cleared whatever was showing by then, so an older timer wiped a newer banner early. */
  function banner(ctx: ModeContext, text: string, ms = 900): void {
    ctx.setHud({ banner: bannerSlot.show(text, ms / 1000, clock) });
  }
  /** IMPROVE (2026-10-06): the lock-on TURNS (Karate VS's G1). Both fighters ease onto each other at a real pivot rate, and a
   *  body on the floor — knocked down, or out — is left where the clip put it. The per-frame `rotation.y = atan2(...)` kept
   *  re-aiming a downed fighter's hips at his opponent and snapped both bodies through a substitution's whole half-turn. */
  const isDown = (st: FighterState): boolean => st.hp <= 0 || st.staggerSec > 0.8;
  function faceEachOther(dt: number): void {
    const p = player.root.position, r = rival.root.position;
    if (!isDown(meState)) player.root.rotation.y = lockOnYaw(p, r, player.root.rotation.y, COMBAT_TURN_RATE, dt);
    if (!isDown(foeState)) rival.root.rotation.y = lockOnYaw(r, p, rival.root.rotation.y, COMBAT_TURN_RATE, dt);
  }
  /** A round start is a cut, not a turn: placed facing each other. */
  function squareUp(): void {
    player.root.rotation.y = yawTo(player.root.position, rival.root.position);
    rival.root.rotation.y = wrapYaw(player.root.rotation.y + Math.PI);
  }

  /** Resolve a strike whose ACTIVE window just opened. `mine` = player attacking. `body` (P7): the rival's strike on a BODY
   *  player, resolved late at its impact instant against the body's state then. */
  function resolveActiveStrike(ctx: ModeContext, mine: boolean, body?: { move: CombatMove; impactAt: number; ult: boolean }): void {
    const atkChar = mine ? player : rival;
    const defChar = mine ? rival : player;
    const atkState = mine ? meState : foeState;
    const defState = mine ? foeState : meState;
    const defCtrl = mine ? foeDef : meDef;
    const strikeC = mine ? meStrike : foeStrike;
    const move = body ? body.move : strikeC.current?.move;
    if (!move) return;
    // IMPROVE (2026-10-06): does this swing carry the rival's ultimate? Taken once, as the swing resolves (a body player's is
    // carried into the deferred resolve); a dodge, a whiff or any defence below spends it for nothing
    let ult = !!body?.ult;
    if (!body) {
      if (!strikeC.current!.hitLive) return;
      if (!mine) ult = foeUlt.take(strikeC.current);
      strikeC.current!.consumeHit();
      // P7: the rival's fist on a BODY player waits for the body's frames to cover the impact (DefenseLedger)
      if (!mine && bodyDriven()) { const imp = now(); deferred.push(imp, (at) => resolveActiveStrike(ctx, false, { move, impactAt: at, ult })); return; }
    } else if (phase !== 'fighting') return;

    const dist = Vector3.Distance(atkChar.root.position, defChar.root.position);
    const meter = mine ? chakra : foeChakra;

    // SUBSTITUTION check first (defender spent chi to not be here)
    if (!mine && meSubstituted > now()) { /* player already teleported */ }

    if (!mine && meMove.dashIFrames) { foeState.staggerSec = Math.max(foeState.staggerSec, 0.45); banner(ctx, 'PERFECT DODGE — PUNISH!', 700); ctx.feel?.impact?.(0.3); console.info('[SD-STORM] dash i-frames — whiff · perfect dodge'); return; }   // phase 6: the read opens him   // phase 3: the dash's first beat cannot be hit
    const bodyAct = body ? bodyAction(move.atk, dist, body.impactAt) : null;
    if (bodyAct === 'evaded') { foeState.staggerSec = Math.max(foeState.staggerSec, 0.45); banner(ctx, 'PERFECT DODGE — PUNISH!', 700); ctx.feel?.impact?.(0.3); console.info('[SD-STORM] body slip — whiff · perfect dodge'); return; }
    const action = bodyAct ?? defCtrl.resolve(move.atk, dist, defState.blockHeld, now());
    if (body) console.info(`[SD-DEF] body ${action} (${Math.round(now() - body.impactAt)} ms late)`);
    const outcome = applyDefenseOutcome(action, atkState, defState, move.atk);
    // IMPROVE (2026-10-06), TUNED: the attacker's chakra pays only for a blow that lands (a hit, a guard it breaks) — the
    // gain ran before the outcome was known, so a whiff, a block and a parried swing each paid as a clean hit
    const gain = attackerChakraGain(outcome); if (gain) meter.gain(gain);
    if (ult && outcome !== 'hit') { banner(ctx, outcome === 'whiff' ? 'RIVAL ULTIMATE MISSED!' : 'RIVAL ULTIMATE STOPPED!', 800); console.info(`[SD-STORM] rival ultimate answered (${outcome})`); }

    switch (outcome) {
      case 'whiff': break;
      case 'blocked':
        SoundKit.play('impact', { pitch: 0.7, volume: 0.3 });
        EffectsKit.burst(ctx.scene, defChar.root.position.add(new Vector3(0, 1.1, 0)), 'dust');
        break;
      case 'guardBreak':
        ctx.feel?.impact?.(0.55);   // ONE thud (the impact SFX that stacked on it is gone)
        ctx.juice.shake(0.08, 120);
        console.info('[SD-JUICE] guard break');
        EffectsKit.burst(ctx.scene, defChar.root.position.add(new Vector3(0, 1.2, 0)), 'glitch');
        banner(ctx, mine ? 'GUARD BREAK!' : 'YOUR GUARD SHATTERED!');
        break;
      case 'parried':
        beatParry(!mine);   // IMPROVE (2026-10-06): the defender's parry plays
        if (!mine) focus.gain(FOCUS.dodgeGain);   // phase 8: a read refills Focus
        SoundKit.play('impact', { pitch: 1.6, volume: 0.5 });   // the parry ping is the one sound; the feel thud is gone
        ctx.juice.shake(0.05, 80);
        (mine ? foeChakra : chakra).gain('parry');
        banner(ctx, mine ? 'PARRIED!' : 'PERFECT PARRY!');
        break;
      case 'guardImpacted':
        beatGuardImpact(!mine);   // IMPROVE (2026-10-06): the defender's guard impact plays
        if (!mine) focus.gain(FOCUS.dodgeGain);   // phase 8: a read refills Focus
        SoundKit.play('impact', { pitch: 1.9, volume: 0.6 });   // the GI stinger is the one sound; the feel thud is replaced by the latched hit-stop + shake
        heavyPunch(ctx, 'guard impact');
        (mine ? foeChakra : chakra).gain('guardImpact');
        EffectsKit.burst(ctx.scene, defChar.root.position.add(new Vector3(0, 1.4, 0)), 'sparks');
        ctx.camDirector.pulse(0.4, 0.4);
        banner(ctx, mine ? 'GUARD IMPACTED — PUNISH!' : 'GUARD IMPACT! PUNISH THEM!');
        break;
      case 'hit': {
        if (ult) { startUltimate(ctx, 'foe'); break; }   // IMPROVE (2026-10-06): the opener landed — the rival's cut plays
        const w = move.weight;
        const scale = Math.max(0.4, 1 - 0.12 * atkState.combo);
        const dealt = Math.round(move.atk.dmg * scale * (mine ? 1 : foePower.dmg) * (mine && focus.active ? FOCUS.damageMult : 1) * defCtrl.counterMult(now()));   // COMBAT DIFFICULTY (2026-10-06): the rival's power   // phase 8: a Focus strike lands harder; IMPROVE (2026-10-06): a read substitution eats COUNTER damage
        if (mine) focus.gain(FOCUS.hitGain);
        defState.hp = Math.max(0, defState.hp - dealt);
        defState.stunSec = Math.max(defState.stunSec, move.atk.stunSec);
        atkState.combo += 1; atkState.comboTimer = 1.1;
        hitReact(!mine, w, SHOWDOWN.reactSec);
        ctx.feel?.impact?.(w === 'heavy' ? 0.55 : 0.3);   // ONE thud per connect (the impact SFX that doubled it is gone)
        if (w === 'heavy' || w === 'finisher') { heavyPunch(ctx, w); console.info(mine ? '[SD-JUICE] heavy landed' : '[SD-JUICE] heavy taken'); } else { ctx.juice.hitStop(HIT_STOP_MS[w]); console.info(mine ? '[SD-JUICE] hit' : '[SD-JUICE] taken'); }   // phase 5: every connect holds for its weight
        EffectsKit.burst(ctx.scene, defChar.root.position.add(new Vector3(0, 1.2, 0)), w === 'heavy' ? 'glitch' : 'sparks');
        // phase 5: the knock slide (constant speed, ease-out) instead of a velocity impulse the movement damped in a frame
        knockSlide(ctx, defChar, atkChar.root.position, move.atk.knockback, ropeClamp(ctx, defChar, mine));
        if (mine && move.launch) { foeLaunchedSec = LAUNCH_AIR_SEC; console.info('[SD-STORM] LAUNCHED — air string open'); }
        else if (mine && move.air && !move.slam) foeLaunchedSec = Math.max(foeLaunchedSec, 0.5);
        else if (mine && move.slam) foeLaunchedSec = 0;
        ctx.setHud(mine
          ? { foeHp: defState.hp, combo: atkState.combo >= 2 ? atkState.combo : 0 }
          : { hp: defState.hp, foeCombo: atkState.combo >= 2 ? atkState.combo : 0 });
        if (defState.hp <= 0) endRound(ctx, mine);
        break;
      }
    }
  }

  /** P7: what the rival's hit meets on a BODY player at `impactAt` (page ms): the ledger's guard, raise, push and slip,
   *  on the body's widened windows (bodyDefenseAt: parry 200, guard impact 160 ms); a slip or a raise needs the fighter
   *  free, as a press would. */
  function bodyAction(atk: AttackDef, dist: number, impactAt: number): DefenseAction | 'evaded' {
    if (dist > atk.range) return 'outOfRange';   // IMPROVE (2026-10-06): out of reach is a whiff; 'none' (undefended) is a hit now
    const bd = bodyDefenseAt(ledger, impactAt);
    // (the pad's guard counts too, as it stood AT the impact: held then, or its press — a flick's guard impact, a parry —
    // inside the pad's own windows before it; the stronger answer wins — the review, 2026-09-26)
    const padHeld = padGuard.heldAt(impactAt);
    const pad: DefenseAction = padHeld || padGuard.pressWithin(impactAt, PARRY_WINDOW_MS) !== null ? meDef.resolve(atk, dist, padHeld, impactAt) : 'none';
    if (!meState.controllable) return ledger.at(impactAt).guardHeld || padHeld ? 'blocked' : 'none';   // a held guard stays up through a stagger
    return strongerDefense(defenseActionOf(bd.d), pad);
  }

  /** P7: the ledger follows the body's own guard, per packet and per frame: 'down' lets a body guard go (a pad's X held keeps
   *  its own); a guard the ledger holds that the fighter has not taken up — held through the round's start, through a
   *  stagger, or its up refused in the intro — is taken up as soon as the fighter can (the body is the one playing then:
   *  the review, 2026-09-26). What a waiting hit needs is kept (deferred.oldest). */
  function bodyLedgerFrame(view: BodyView, t: number): void {
    const g = ledger.frame(view, t, deferred.oldest);
    if (g === 'down' && bodyGuard) { bodyGuard = false; if (!padGuard.held) { meDef.releaseBlock(); meState.releaseBlock(); guardUp = false; } }
    else if (ledger.guardUp && !bodyGuard && phase === 'fighting' && meState.controllable) { drive.body(t); bodyGuard = true; meDef.pressBlock(-1e9, false); meState.pressBlock(-1e9); guardUp = true; }
  }

  /** P7: one fight-read event from the body — taken only in the fight (the intro, the ultimate's cut and the match's end
   *  take nothing), silently refused otherwise. */
  function onBodyEvent(ctx: ModeContext, ev: BodyEvent, view: BodyView): boolean {
    const t = now();
    ctxRef = ctx;
    bodyLedgerFrame(view, t);
    if (phase !== 'fighting') return false;
    if (ev.kind !== 'blow' && ev.kind !== 'legKick' && ev.kind !== 'guard' && ev.kind !== 'evade' && ev.kind !== 'fightStep') return false;
    const it = bodyDriver.intent(ev, view, t);
    if (!it) return false;
    if (it.kind === 'guard') ledger.guard(it);
    if (!meState.controllable) return false;
    drive.body(t);
    switch (it.kind) {
      case 'guard':
        // a RAISE is stamped at its onset (the parry / guard impact read); a guard reached any other way only blocks
        if (it.up) { const at = it.raise ? it.onsetPage : -1e9; meDef.pressBlock(at, it.raise && it.push); meState.pressBlock(at); guardUp = true; }
        else if (!padGuard.held) { meDef.releaseBlock(); meState.releaseBlock(); guardUp = false; }
        bodyGuard = it.up;
        console.info(`[SD-BODY] guard ${it.up ? (it.raise ? 'raise' : 'up') : 'down'}`);
        return true;
      case 'strike': {
        const mv = book.pressMove(HORDE_MOVES[it.move], it.token, it.onsetPage / 1000);
        const ok = meStrike.request(mv.id, t, { elapsedMs: t - it.onsetPage, contactMs: contactMsOf(mv) });
        SoundKit.play(ok ? 'whoosh' : 'uiTick', ok ? { pitch: 1.3, volume: 0.35 } : { pitch: 0.8, volume: 0.25 });
        const range = myMoves[mv.id]?.atk.range ?? 1.6;
        const d = Vector3.Distance(player.root.position, rival.root.position), lunge = bodyLunge(d, range);
        if (lunge > 0) { const v = rival.root.position.subtract(player.root.position); v.y = 0; bodyShift = { v: v.normalize().scale(lunge / 0.15), left: 0.15 }; }
        // a queued body strike is a link all the same (the StrikeController starts it at the cancel point, from its onset)
        if (book.history.length === 1) stringLabels = [];   // a body strike that starts a string starts its call
        stringLabels.push(mv.label); console.info(`[SD-STORM] link ${mv.id} string ${book.history.length} body ${it.body} age ${Math.round(t - it.onsetPage)}${ok ? '' : ' queued'}`);
        if (mv.ender || book.history.length === 0) { const call = stringLabels.join(' → '); stringLabels = []; if (call.includes('→')) banner(ctx, `COMBO: ${call}`, 900); }
        return true;
      }
      case 'evade': {
        const r = ctx.camDirector.rightFlat();
        const dir = it.side === null ? Vector3.Zero() : r.scale(it.side === 'L' ? -1 : 1);
        if (!meMove.slip(dir.x, dir.z)) return false;   // (the i-frames only with the slip itself: refused on its cooldown it whiffs nothing — the review, 2026-09-26)
        ledger.evade(it);
        console.info(`[SD-BODY] ${it.form}${it.side ?? ''}`);
        return true;
      }
      case 'step': {
        const sp = stepSpace(it.dir);
        const to = rival.root.position.subtract(player.root.position); to.y = 0;
        const along = to.lengthSquared() > 1e-4 ? to.normalize() : ctx.camDirector.forwardFlat();
        const v = along.scale(sp.along).addInPlace(ctx.camDirector.rightFlat().scale(-sp.across));
        bodyShift = { v: v.scale(1 / 0.25), left: 0.25 };
        console.info(`[SD-BODY] step ${it.dir}`);
        return true;
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
    arenaClamp(player.root.position, arena); if (!modeVenue?.constrain(player.root.position)) { player.root.position.x = Math.max(-ARENA_HALF, Math.min(ARENA_HALF, player.root.position.x)); player.root.position.z = Math.max(-ARENA_HALF, Math.min(ARENA_HALF, player.root.position.z)); }   // phase 3: the dojo floor, not a 24 m box
    mbus.report({ kind: 'steal', weight: 14 });
    SoundKit.play('whoosh', { pitch: 1.8, volume: 0.6 });
    EffectsKit.burst(ctx.scene, spot.add(new Vector3(0, 1.2, 0)), 'glitch');
    ctx.camDirector.pulse(0.5, 0.4);
    banner(ctx, 'SUBSTITUTION! BEHIND THEM!');
  }

  /** IMPROVE (2026-10-06): the defender's one-beat guard states, per fighter (re-armed so a second parry plays again). */
  function beatParry(me: boolean): void {
    if (me) { parryFlash = SHOWDOWN.parrySec; meAnim.clearBeat('parry_flash'); } else { foeParryFlash = SHOWDOWN.parrySec; foeAnim.clearBeat('parry_flash'); }
  }
  function beatGuardImpact(me: boolean): void {
    if (me) { giFlash = SHOWDOWN.impactSec; meAnim.clearBeat('guard_impact'); } else { foeGiFlash = SHOWDOWN.impactSec; foeAnim.clearBeat('guard_impact'); }
  }
  /** IMPROVE (2026-10-06): a hit reaction on ONE fighter's own timer. */
  function hitReact(me: boolean, w: CombatMove['weight'], sec: number): void {
    if (me) { meHitBy = w; meHitT = sec; } else { foeHitBy = w; foeHitT = sec; }
  }
  /** The knock slide's clamp: the arena's ropes rebound a body, and say so. */
  function ropeClamp(ctx: ModeContext, defChar: SpawnedCharacter, mine: boolean): (q: Vector3) => void {
    return (q) => { const kt = knockTo(defChar.root.position, q, arena); q.x = kt.x; q.z = kt.z; if (kt.rebound) { banner(ctx, mine ? 'OFF THE ROPES!' : 'YOU HIT THE ROPES!', 700); console.info('[ARENA] showdown off the ropes'); } };
  }

  /** The destructible beat: the north gate breaks. */
  function shatterGate(ctx: ModeContext): void {
    if (!wallMesh) return;
    const w = wallMesh; wallMesh = null;
    w.dispose(false, true);   // IMPROVE (2026-10-06): and its material (gateMat leaked)
    SoundKit.play('impact', { pitch: 0.4, volume: 0.9 });
    SoundKit.play('crowdCheer', { volume: 0.8 });
    ctx.feel?.impact?.(1);
    for (let i = 0; i < 3; i++) {
      EffectsKit.burst(ctx.scene, new Vector3(0, 1 + i * 0.5, gateZ), 'glitch');
    }
    ctx.camDirector.pulse(1, 0.7);
    banner(ctx, 'THE GATE SHATTERS!', 1200);
    mbus.report({ kind: 'highlight_dunk', weight: 22 });
  }

  /** The ultimate's camera cut, for either fighter (IMPROVE 2026-10-06: the rival has one). */
  function startUltimate(ctx: ModeContext, by: 'me' | 'foe'): void {
    ultBy = by;
    setPhase('ultimate');
    ultTimer = 0; charging = false;
    if (by === 'me') mbus.report({ kind: 'highlight_dunk', weight: 20 });
    SoundKit.play('powerUp', { pitch: by === 'me' ? 0.6 : 0.45 });
    // camera-CUT: leave the follow framing entirely — wide cinematic side shot
    const mid = player.root.position.add(rival.root.position).scale(0.5);
    ctx.camDirector.setFixed(mid.add(new Vector3(7, 2.2, 7)), 1.2);
    meAnim.clearBeat('ultimate'); foeAnim.clearBeat('ultimate');
    banner(ctx, by === 'me' ? 'ULTIMATE — RISING DRAGON FLASH' : 'RIVAL ULTIMATE — CRIMSON TIDE BREAKER', SHOWDOWN.ultCutSec * 1000 + 300);
    console.info(`[SD-STORM] ultimate (${by})`);
  }

  function tryUltimate(ctx: ModeContext): void {
    // IMPROVE (2026-10-06), TUNED: the reach is checked BEFORE the bar is spent — it was only checked after the 1.1 s cut,
    // so a full bar could be paid for "ULTIMATE WHIFFED!"
    if (!ultimateReaches(Vector3.Distance(player.root.position, rival.root.position))) { banner(ctx, 'GET CLOSE FOR THE ULTIMATE', 600); return; }
    if (!chakra.spendUltimate()) { banner(ctx, 'CHAKRA NOT FULL', 600); return; }
    startUltimate(ctx, 'me');
  }

  function resolveUltimate(ctx: ModeContext): void {
    const mine = ultBy === 'me';
    const atkC = mine ? player : rival, defC = mine ? rival : player;
    const defState = mine ? foeState : meState;
    const dist = Vector3.Distance(atkC.root.position, defC.root.position);
    ctx.camDirector.setPreset('fight');
    setPhase('fighting');   // (before endRound, which may close the round or the match — it used to be set after, over matchOver)
    if (ultimateReaches(dist)) {
      defState.hp = Math.max(0, defState.hp - Math.round(ULT_DMG * (mine ? 1 : foePower.dmg)));   // COMBAT DIFFICULTY (2026-10-06): the rival's ultimate carries its power
      defState.staggerSec = 1.6;
      hitReact(!mine, 'finisher', SHOWDOWN.ultReactSec);
      ctx.feel?.impact?.(0.9);   // ONE thud — the ultimate's own; the impact SFX that doubled it is gone
      heavyPunch(ctx, mine ? 'ultimate' : 'rival ultimate');
      EffectsKit.burst(ctx.scene, defC.root.position.add(new Vector3(0, 1.3, 0)), 'glitch');
      // IMPROVE (2026-10-06): the launch is a knock slide AWAY from the attacker (it was a 12 m/s velocity toward −Z that
      // nothing integrated while he lay staggered); driven into the north gate, it shatters it
      knockSlide(ctx, defC, atkC.root.position, SHOWDOWN.ultLaunchM, ropeClamp(ctx, defC, mine), SHOWDOWN.ultLaunchMps);
      // the launch meets the gate where its line crosses it — before the cage's ropes can bounce the body back short of it
      if (wallMesh && launchReachesGate(atkC.root.position, defC.root.position, gateZ, SHOWDOWN_GATE.breakM)) shatterGate(ctx);
      ctx.setHud(mine ? { foeHp: defState.hp } : { hp: defState.hp });
      if (defState.hp <= 0) endRound(ctx, mine);
    } else {
      banner(ctx, mine ? 'ULTIMATE WHIFFED!' : 'RIVAL ULTIMATE WHIFFED!', 800);
    }
  }

  /** IMPROVE (2026-10-06): the assist is ONE body, spawned at load and shown on a call. It used to load a full GLB rig on
   *  every call, dispose it 1.2 s later, and leak it when the mode was left mid-spawn. */
  function callAssist(ctx: ModeContext): void {
    if (assistTimer > 0 || assistActive > 0) return;
    const s = support;
    if (!s) { banner(ctx, 'NO ASSIST', 500); return; }
    assistTimer = ASSIST_COOLDOWN_SEC;
    assistActive = 1.2;
    s.root.position.set(rival.root.position.x + 2.5, 0, rival.root.position.z);
    arenaClamp(s.root.position, arena);
    s.root.rotation.y = yawTo(s.root.position, rival.root.position);
    s.root.setEnabled(true);
    s.animator.play('karate_punch_heavy', {});
    SoundKit.play('whoosh', { pitch: 1.3 });
    // the assist lands its hit shortly after blinking in (on the game clock: a pause holds it, a round reset drops it)
    timers.after(ASSIST_HIT_SEC, () => {
      if (assistActive <= 0 || phase !== 'fighting') return;
      const dist = Vector3.Distance(s.root.position, rival.root.position);
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
    });
  }
  function hideAssist(): void {
    assistActive = 0;
    if (support) { support.animator.park(); support.root.setEnabled(false); }   // parked: no clip advancing on a hidden rig
  }

  function endRound(ctx: ModeContext, playerWon: boolean, reason = 'K.O.'): void {   // phase 9: the round says why
    if (phase === 'matchOver' || phase === 'roundOver') return;   // IMPROVE (2026-10-06): one verdict per round
    if (playerWon) myRounds++; else foeRounds++;
    SoundKit.play(playerWon ? 'crowdCheer' : 'crowdGroan');
    if (playerWon) roundWinBeat(ctx);
    charging = false; meMove.vel.setAll(0); foeMove.vel.setAll(0);
    const done = myRounds >= SHOWDOWN.roundsToWin || foeRounds >= SHOWDOWN.roundsToWin;
    ctx.setHud({ wins: myRounds, foeWins: foeRounds });
    if (done) {
      setPhase('matchOver');
      SoundKit.play('whistle');
      if (playerWon) matchPunch(ctx);
      ctx.end(playerWon ? 'SHOWDOWN_WON' : 'SHOWDOWN_LOST', myRounds * 100 - foeRounds * 40, { foeRounds });
      return;
    }
    // IMPROVE (2026-10-06): the KO pause is a phase on the game clock (update() starts the next round after it); the fight
    // used to run on under this banner for 1.8 s of wall clock
    setPhase('roundOver');
    banner(ctx, `${reason} — ROUND ${myRounds + foeRounds} — ${playerWon ? 'YOU' : 'RIVAL'}`, SHOWDOWN.roundOverSec * 1000);   // phase 9: the same grammar the duel reads (K.O. — ROUND n — YOU)
  }

  /** IMPROVE (2026-10-06): a round's start — everything reset, the fighters on their marks, then the beat: "ROUND n" for
   *  READY, then FIGHT! (update()). */
  function startRound(ctx: ModeContext): void {
    meState.resetRound(); foeState.resetRound(); xBtn.reset(); padGuard.reset(); guardUp = false; book.reset(); stringLabels = []; deferred.clear(); ledger.reset(); bodyShift = null; foeLaunchedSec = 0; rival.root.position.y = 0; focus.stop(); focusHeld = false; rival.animator.setTimeScale(1); player.animator.setTimeScale(1); ctx.juice.tint(null);
    timers.clear(); foeUlt.clear(); hideAssist(); charging = false; meSubstituted = 0; foeSubstituted = 0;
    meHitT = 0; foeHitT = 0; meHitBy = null; foeHitBy = null; parryFlash = 0; giFlash = 0; foeParryFlash = 0; foeGiFlash = 0;
    meAnim.reset(); foeAnim.reset();
    player.root.position.set(0, 0, 4); rival.root.position.set(0, 0, -4);
    meMove.vel.setAll(0); foeMove.vel.setAll(0);
    squareUp(); roundStartRival();
    setPhase('ready');
    const round = myRounds + foeRounds + 1;
    ctx.setHud({ round: `${round}`, hp: meState.hp, foeHp: foeState.hp });
    banner(ctx, roundCall(round), Infinity);
    SoundKit.play('whoosh', { pitch: 0.7, volume: 0.35 });
  }
  function fight(ctx: ModeContext): void {
    setPhase('fighting');
    banner(ctx, 'FIGHT!', 600);
    SoundKit.play('whistle', { volume: 0.5 });
    ctx.feel?.impact?.(0.25);
  }

  // ── IMPROVE (2026-10-06): the fire pits end a round. The tick took HP and nothing else: no call, no effect, no KO — a
  // fighter burned to 0 fought on until the 150 s watchdog. Only while the fight is on (it burned through the KO pause too).
  let burnTickN = 0, meInFire = false, foeInFire = false;
  function burn(ctx: ModeContext, st: FighterState, c: SpawnedCharacter): boolean {
    const h = hazardAt(c.root.position, arena);
    if (!h) return false;
    st.hp = Math.max(0, st.hp - h.dps * 0.2);
    if (burnTickN % 3 === 0) EffectsKit.burst(ctx.scene, c.root.position.add(new Vector3(0, 0.4, 0)), 'sparks', 0.7, '#ff7a1a');   // embers, every 0.6 s
    return true;
  }
  function burnTick(ctx: ModeContext, dt: number): void {
    hazardTick += dt;
    if (hazardTick < 0.2) return;
    hazardTick = 0;
    const meIn = burn(ctx, meState, player), foeIn = burn(ctx, foeState, rival);
    if (meIn || foeIn) burnTickN++;
    if (meIn && !meInFire) { banner(ctx, 'IN THE FIRE — GET OUT!', 700); SoundKit.play('impact', { pitch: 0.5, volume: 0.35 }); console.info('[ARENA] showdown you in the fire'); }
    if (foeIn && !foeInFire) { banner(ctx, 'RIVAL IN THE FIRE!', 600); console.info('[ARENA] showdown rival in the fire'); }
    meInFire = meIn; foeInFire = foeIn;
    if (meIn || foeIn) { const v = burnVerdict(meState.hp, foeState.hp); if (v !== null) endRound(ctx, v, 'BURNED'); }
  }

  // ── IMPROVE (2026-10-06): the posture feed, built once (it was a closure recreated every frame), on plain numbers ──
  function feedBio(bio: CombatPostureInput, mv: CombatMovement, st: FighterState, df: DefenseController, striking: CombatPostureInput['striking'], hb: typeof meHitBy, yaw: number, foeC: SpawnedCharacter, selfC: SpawnedCharacter): void {
    const dx = foeC.root.position.x - selfC.root.position.x, dz = foeC.root.position.z - selfC.root.position.z, d = Math.hypot(dx, dz);
    const closing = d > 1e-3 ? (mv.vel.x * dx + mv.vel.z * dz) / d : 0;
    bio.speed01 = Math.min(1, Math.hypot(mv.vel.x, mv.vel.z) / 6.4);
    bio.strafe = strafeAxis(mv.vel, yaw); bio.approach = combatApproach(closing);
    bio.striking = striking; bio.windingUp = false;
    bio.blocking = df.blocking; bio.parrying = false; bio.guardImpact = false;
    bio.hitBy = hb; bio.down = st.staggerSec > 0.8; bio.out = st.hp <= 0;
    bio.rising = false; bio.dodging = false; bio.celebrating = false; bio.engaged = phase === 'fighting';
  }

  /** The animation trees and the posture bios, in every phase but the match's end. IMPROVE (2026-10-06): the ultimate runs
   *  through the tree (`ulting`) — it was an animator.play of a one-shot every frame, outside the tree — and each fighter's
   *  parry / guard impact flash reaches it. */
  function animate(dt: number): void {
    const meStriking = meStrike.current ? WEIGHT_BY_MOVE[meStrike.current.move.atk.id] ?? 'light' : null;
    const foeStriking = foeStrike.current ? WEIGHT_BY_MOVE[foeStrike.current.move.atk.id] ?? 'light' : null;
    const ult = phase === 'ultimate';
    meAnim.update({
      speed01: meMove.vel.length() / 6.4, dashing: meMove.dashing,
      hasWeapon: false,
      striking: meStriking,
      blocking: meDef.blocking, parryFlash: parryFlash > 0, guardImpactFlash: giFlash > 0,
      hitBy: meHitBy, down: meState.staggerSec > 0.8, out: meState.hp <= 0, ulting: ult && ultBy === 'me',
    });
    foeAnim.update({
      speed01: foeMove.vel.length() / 6.4, dashing: foeMove.dashing,
      hasWeapon: false,
      striking: foeStriking,
      blocking: foeDef.blocking, parryFlash: foeParryFlash > 0, guardImpactFlash: foeGiFlash > 0,
      hitBy: foeHitBy, down: foeState.staggerSec > 0.8, out: foeState.hp <= 0, ulting: ult && ultBy === 'foe',
    });
    // the posture bios, each resolved in that fighter's OWN frame
    const meYaw = player.root.rotation.y, foeYaw = rival.root.rotation.y;
    meMotion.update(meMove.vel.x, meMove.vel.z, meYaw, dt);
    foeMotion.update(foeMove.vel.x, foeMove.vel.z, foeYaw, dt);
    feedBio(meBio, meMove, meState, meDef, meStriking, meHitBy, meYaw, rival, player);
    feedBio(foeBio, foeMove, foeState, foeDef, foeStriking, foeHitBy, foeYaw, player, rival);
  }

  // ── IMPROVE (2026-10-06): the HUD is pushed only where a value changed (it sent seven fields every frame, momentum among
  // them — which this host never draws: the harness makes momentum heard) ──
  const hudSent: Record<string, string | number> = {};
  let hudPatch: Record<string, string | number> | null = null;
  function hudPut(k: string, v: string | number): void { if (hudSent[k] !== v) { hudSent[k] = v; (hudPatch ??= {})[k] = v; } }
  function pushHud(ctx: ModeContext): void {
    hudPut('chi', Math.round(chakra.value)); hudPut('foeChi', Math.round(foeChakra.value));
    hudPut('hp', Math.ceil(meState.hp)); hudPut('foeHp', Math.ceil(foeState.hp));
    hudPut('guard', Math.round(meState.guard)); hudPut('foeGuard', Math.round(foeState.guard));
    hudPut('wins', myRounds); hudPut('foeWins', foeRounds);
    hudPut('assist', !support ? '—' : assistTimer > 0 ? Math.ceil(assistTimer) : 'READY');
    if (hudPatch) { ctx.setHud(hudPatch); hudPatch = null; }
  }

  return {
    modeId: 'showdown', mood: 'dojoWarm', camPreset: 'fight',
    // MOVEMENT PLAY P7: the body's own strikes, guard, slips and steps (bodyFightFlags)
    ...(BODY_FIGHT.showdown ? { body: { claims: FIGHT_CLAIMS, lines: FIGHT_CARD_LINES }, onBody: onBodyEvent } : {}),

    async load(ctx: ModeContext) {
      // ONE BUS PER MOUNT, OWNED BY THE HARNESS. This mode built its own, which worked and was
      // INAUDIBLE: the crowd swell and the tier sting are bound to the harness's bus, and there was
      // exactly one onTierChange subscriber in the game. Same reports, same weights, now heard.
      mbus = ctx.momentum;
      // ship pass 4: the venue spec (with its baked map) first; the kit venue only if no spec
      arena = readCombatArena('showdown'); console.info(`[ARENA] showdown · ${describeArena(arena)}`);   // phase 7
      ctxRef = ctx;   // P7
      modeVenue = mountVenue(ctx, 'karate_h2h', { keepGameplayCamera: true, arena, look: readPlaceLook('showdown') });   // PLACE: the splash's pick
      arenaHandle?.dispose(); arenaHandle = buildArena(ctx.scene, arena);
      if (!modeVenue) VenueKit.buildDojo(ctx.scene);
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
      // IMPROVE (2026-10-06): the assist's ONE body, spawned here (the container is cached: an instance, not a second
      // download) and hidden until SELECT calls it. A failed spawn leaves the mode playable without the assist.
      try {
        support = await CharacterLibrary.spawn(ctx.scene, CFG.heroUrl, {
          position: new Vector3(2.5, 0, -4), tint: '#3ec6ff', scale: 0.98,
          startClip: 'karate_idle_stance', modeId: 'showdown-support',
        });
        hideAssist();
      } catch (e) { support = null; console.warn('[SD-STORM] assist body failed to spawn — SELECT does nothing this match', e); }

      // the destructible north gate (wall-break beat)
      // IMPROVE (2026-10-06): on the picked arena's −z edge (combat/arenas.ts showdownGateDist), not at z −12 behind it
      gateZ = -showdownGateDist(arena);
      wallMesh = MeshBuilder.CreateBox('shatter_gate', { width: 3, height: 2.6, depth: 0.3 }, ctx.scene);
      wallMesh.position.set(0, 1.3, gateZ);
      const wm = new StandardMaterial('gateMat', ctx.scene);
      wm.diffuseColor = new Color3(0.55, 0.4, 0.25);
      wallMesh.material = wm;   // IMPROVE (2026-10-06): disposed with the gate (shatter or dispose) — it leaked before

      meState = new FighterState(100); foeState = new FighterState(100);
      // ONE MOVESET OBJECT WAS HANDED TO BOTH FIGHTERS. StrikeController holds what it is given, so the two
      // shared their move table — the kind of bug that surfaces as "the rival's combo cancelled mine". Each
      // gets its own now, and the player's carries the school they picked on the start-up screen; the rival
      // fights the unstyled set, so a style is something YOU brought rather than a difficulty dial.
      myMoves = styleMoveset(bookMoveset(KARATE_ATTACKS), blendTraits(readBlend()), MIN_STARTUP_SEC);
      meStrike = new StrikeController(myMoves);   // phase 4: the book, styled (P7: kept for a body strike's range)
      foeStrike = new StrikeController(karateMoveset(KARATE_ATTACKS));
      rivalBrain = new RivalCombatBrain({
        difficulty: 0.72, canSpecial: false,   // IMPROVE (2026-10-06): the rival's ultimate is the CHAKRA meter's, never a FighterState-chi heavy
        moves: Object.entries(karateMoveset(KARATE_ATTACKS)).map(([id, m]) => ({
          id,
          kind: m.weight === 'light' ? 'jab' as const : m.weight === 'medium' ? 'kick' as const : 'heavy' as const,
          range: m.atk.range,
        })),
      });
      // seconds until the rival's swing lands (−1 = nothing in flight, or a swing that cannot reach)
      (ctx.scene.metadata ??= {}).fight = { landsIn: () => {
        const c = foeStrike.current;
        if (!c || c.phase !== 'startup') return -1;
        return threatLandsIn(Vector3.Distance(rival.root.position, player.root.position), c.move.atk.range, c.secToActive);
      } };
      meMove = new CombatMovement(); foeMove = new CombatMovement();
      meDef = new DefenseController(); foeDef = new DefenseController();
      meAnim = new CombatAnimTree(player.animator); foeAnim = new CombatAnimTree(rival.animator);
      // CHI is the exertion signal here rather than guard: in this mode the meter you spend IS the effort,
      // and a fighter who has emptied it should carry himself like someone who just spent it.
      mePosture = mountPostureLayer(ctx.scene, player.skeleton, player.root, () => feedFor(meBio, () => rival, meMotion, 1 - chakra.value / CHI_MAX), 'SHOW-PP');
      foePosture = mountPostureLayer(ctx.scene, rival.skeleton, rival.root, () => feedFor(foeBio, () => player, foeMotion, 0.5), 'SHOW-PP-FOE');
      if (process.env.NODE_ENV === 'development') {
        // the same dev seam karate_vs carries: without it, "the posture layer is mounted" is a claim about
        // source rather than about a running game, and this pass has spent all day on that distinction.
        const dev = (window as unknown as { __FEL_DEV__?: { combatPosture?: unknown } }).__FEL_DEV__;
        if (dev) dev.combatPosture = { me: () => mePosture?.layer.get() ?? null, foe: () => foePosture?.layer.get() ?? null, bio: () => ({ me: { ...meBio }, foe: { ...foeBio } }) };
      }
      chakra = new ResourceMeter(CHAKRA); foeChakra = new ResourceMeter(CHAKRA);
      myRounds = 0; foeRounds = 0; assistTimer = 0; mbus.reset(); matchLatch = false; heavyAt = 0;
      clock = 0; timers.clear(); bannerSlot.clear(); foeUlt.clear(); foeFullCalled = false; charging = false; knock.clear();
      for (const k of Object.keys(hudSent)) delete hudSent[k];

      SoundKit.startAmbient('dojo');
      EffectsKit.ambient(ctx.scene, 'dojo');
      ctx.heroRef.current = player.root;
      ctx.objectiveRef.current = rival.root.position;
      ctx.camDirector.snapTo(player.root.position, rival.root.position);
      assertSpawned(ctx.scene, { hero: player.root, minWorldMeshes: 5, modeId: 'showdown' });
      setPhase('intro');
      ctx.setHud({
        banner: 'SHOWDOWN — BEST OF 3', hp: 100, foeHp: 100, chi: 0, foeChi: 0, wins: 0, foeWins: 0, round: '1',
        hint: SHOWDOWN_HINT,
      });
      // IMPROVE (2026-10-06): round 1 starts on the first frame of play (update()), with the round-start beat — it was a
      // 1.8 s wall-clock timer from load that a pause did not hold and a dispose did not cancel
    },

    onInput(ctx: ModeContext, e: FelInput) {
      SoundKit.unlock();
      if (e.t === 'stick' && e.side === 'L') { stickX = e.x; stickY = e.y; }
      if (e.t === 'stick' && e.side === 'R') { lookX = e.x; lookY = e.y; }
      if (e.t === 'trigger' && e.side === 'R') focusHeld = e.value > 0.35;   // phase 8: MATRIX FOCUS   // MODE-STICK-FACE: R stick → the director's look orbit
      // P7: who is driving — a real press or push is the pad's
      if (e.src !== 'body' && ((e.t === 'button' && e.pressed) || (e.t === 'stick' && Math.hypot(e.x, e.y) > 0.35))) drive.pad(now());
      if (e.t === 'button' && !e.pressed && e.btn === 'L1') charging = false;   // IMPROVE (2026-10-06): the charge ends on release, in any phase
      if (phase !== 'fighting' || !meState.controllable) return;
      if (e.t !== 'button') return;

      // SCORECARD FEEL (2026-09-15): a thrown strike was a clip and nothing you heard until it landed (38 % of presses had a
      // sound or a beat) — the swing is heard as it leaves, and a press buffered behind a swing says so with a tick
      const swingSfx = (ok: boolean, pitch: number): void => { SoundKit.play(ok ? 'whoosh' : 'uiTick', ok ? { pitch, volume: 0.35 } : { pitch: 0.8, volume: 0.25 }); };
      // phase 4: the string decides the move — jab, jab, jab is JAB → CROSS → RISING DRAGON, a back-stick A the sweep, a press
      // during a swing is a link past the cancel point or a queued one before it (StrikeSystem's string rule)
      const stickDirToFoe = (): StickDir => { if (Math.hypot(stickX, stickY) < 0.35) return 'n'; const w = wish(ctx); const to = rival.root.position.subtract(player.root.position); to.y = 0; const d = (w.x * to.x + w.z * to.z) / Math.max(1e-3, Math.hypot(to.x, to.z) * Math.hypot(w.x, w.z)); return d > 0.4 ? 'f' : d < -0.4 ? 'b' : 'n'; };
      const pressBook = (key: 'jab' | 'kick' | 'heavy', pitch: number) => {
        charging = false;   // a strike breaks the charge
        const mv = book.press(BTN_OF[key], stickDirToFoe(), now() / 1000, { afterDash: meMove.dashing, air: foeLaunchedSec > 0 });
        const ok = meStrike.request(mv.id, now());
        swingSfx(ok, pitch);
        if (ok) { stringLabels.push(mv.label); console.info(`[SD-STORM] link ${mv.id} string ${book.history.length}`); if (mv.ender || book.history.length === 0) { const call = stringLabels.join(' → '); stringLabels = []; if (call.includes('→')) banner(ctx, `COMBO: ${call}`, 900); } }
      };
      if (e.pressed && e.btn === 'A') pressBook('jab', 1.5);
      if (e.pressed && e.btn === 'B') pressBook('kick', 1.1);
      if (e.pressed && e.btn === 'Y') {
        if (chakra.full) tryUltimate(ctx);
        else pressBook('heavy', 0.85);
      }
      // IMPROVE (2026-10-06), TUNED: L1 is the CHAKRA CHARGE (hold: rooted, open to a punish, the bar fills — update()). It
      // was a dash that cost 12 chakra, while a tap of X dashes for free with i-frames, and the hint still sold it.
      if (e.pressed && e.btn === 'L1' && !chakra.full) {
        charging = true;
        SoundKit.play('powerUp', { pitch: 0.8, volume: 0.35 });
        ctx.juice.callout('CHAKRA CHARGE…', '#9b7bff', 450);
        console.info('[SD-STORM] chakra charge');
      }
      if (e.pressed && e.btn === 'R1') { charging = false; trySubstitution(ctx); }
      if (e.pressed && e.btn === 'SELECT') callAssist(ctx);
      if (e.pressed && e.btn === 'X') {
        charging = false;
        // STORM X (phase 3): the press starts the read. A flick TOWARD the rival on the press is still the guard impact
        // (Soul Calibur's read lives on the press); otherwise the block waits for the HOLD (DASH.tapSec) and a release
        // inside it is the dash — free, with i-frames — or, doubled, the chakra dash at the rival.
        xBtn.press(now() / 1000);
        const to = rival.root.position.subtract(player.root.position);
        const w = wish(ctx);
        const flick = (w.x * to.x + w.z * to.z) > 0.3;
        if (flick) { meDef.pressBlock(now(), true); meState.pressBlock(now()); padGuard.press(now()); guardUp = true; SoundKit.play('impact', { pitch: 1.6, volume: 0.18 }); ctx.juice.callout('GUARD IMPACT…', '#ffd75e', 450); }
      }
      if (!e.pressed && e.btn === 'X') {
        const g = xBtn.release(now() / 1000);
        padGuard.release(now());
        if ((guardUp || g === 'held') && !bodyGuard) { meDef.releaseBlock(); meState.releaseBlock(); guardUp = false; }   // (P7: a body guard still up keeps the block)
        if (g === 'tap' || g === 'double') {
          const to = rival.root.position.subtract(player.root.position); to.y = 0;
          const w = wish(ctx);
          const useStick = g === 'tap' && Math.hypot(w.x, w.z) > 0.25;
          const dir = useStick ? w : (to.lengthSquared() > 1e-4 ? to.normalize() : w);
          if (meState.controllable && meMove.dash(dir.x, dir.z, g === 'double')) { SoundKit.play('whoosh', { pitch: g === 'double' ? 1.35 : 1.2, volume: 0.45 }); if (g === 'double') ctx.camDirector.pulse(0.25, 0.3); console.info(`[SD-STORM] ${g === 'double' ? 'chakra dash' : 'dash'}`); }
        }
      }
    },

    update(ctx: ModeContext, dt: number) {
      phaseSec += dt;
      clock += dt;   // IMPROVE (2026-10-06): the mode's game clock (banners, the assist's hit)
      ctxRef = ctx;
      { const b = bannerSlot.tick(clock); if (b !== null) ctx.setHud({ banner: b }); }
      timers.tick(dt);
      { const bv = ctx.body?.(); if (bv) bodyLedgerFrame(bv, now()); deferred.flush(ledger, now()); }   // P7: the body's deferred hits
      // IMPROVE (2026-10-06): the phase beats on the game clock — round 1 on the first frame of play, FIGHT! after the
      // round-start beat, the next round after the KO pause (setTimeouts before: a pause did not hold them, a dispose did
      // not cancel them)
      if (phase === 'intro') { startRound(ctx); return; }
      if (phase === 'ready' && phaseSec >= SHOWDOWN.readySec) fight(ctx);
      else if (phase === 'roundOver' && phaseSec >= SHOWDOWN.roundOverSec) { startRound(ctx); return; }
      // phase 8 — MATRIX FOCUS: the trigger holds bullet time — the rival on the room's clock (his animator, brain, swings,
      // movement), me on mine. `sdtRoom` / `sdtHero` below are the two clocks; nothing else in this update reads `dt` for a body.
      const wasFocus = focus.active;
      if (focusHeld && !focus.active && phase === 'fighting') { if (focus.start()) { ctx.juice.tint('rgba(16, 70, 34, 0.75)'); ctx.camDirector.pulse(0.45, 0.35); SoundKit.play('whoosh', { pitch: 0.7, volume: 0.5 }); console.info(`[MATRIX] sd focus on at ${Math.round(focus.value)}`); } }
      else if (!focusHeld && focus.active) focus.stop();
      if (focus.tick(dt) || (wasFocus && !focus.active)) { ctx.juice.tint(null); SoundKit.play('whoosh', { pitch: 0.6, volume: 0.4 }); console.info(`[MATRIX] sd focus off after ${focus.heldSec.toFixed(2)} s`); }
      if (wasFocus !== focus.active) { rival.animator.setTimeScale(focus.worldScale); player.animator.setTimeScale(focus.heroScale); }
      { const fv = Math.round(focus.value); if (fv !== focusHud || focus.active !== focusHudOn) { focusHud = fv; focusHudOn = focus.active; ctx.setHud({ focus: fv, focusOn: focus.active }); } }
      const sdtRoom = dt * focus.worldScale, sdtHero = dt * focus.heroScale;
      knock.tick(sdtRoom);   // IMPROVE (2026-10-06): knockback on the room clock, every phase (a KO's slide finishes)
      arenaHandle?.tick(dt);
      if (arena.hazards.length && phase === 'fighting') burnTick(ctx, dt);   // phase 7 (IMPROVE 2026-10-06: felt, and it ends a round)
      if (foeLaunchedSec > 0) { foeLaunchedSec = Math.max(0, foeLaunchedSec - dt); rival.root.position.y = launchHeight(1 - foeLaunchedSec / LAUNCH_AIR_SEC); if (foeLaunchedSec === 0) rival.root.position.y = 0; }   // phase 5
      if (!padGuard.held && xBtn.guardHeld(now() / 1000) && meState.controllable) { padGuard.press(now()); if (!guardUp) { guardUp = true; meDef.pressBlock(now(), false); meState.pressBlock(now()); SoundKit.play('impact', { pitch: 1.3, volume: 0.18 }); } }   // phase 3: the hold is the guard (P7: the pad's, apart from a body guard already up)
      if (phaseSec > BUDGET_SEC[phase]) {
        if (phase === 'fighting') { console.info('[SD] time — round decided on HP'); endRound(ctx, meState.hp >= foeState.hp, 'TIME'); return; }   // the long round's bell, not a fault
        console.warn(`[FEL-WATCHDOG] showdown stuck in "${phase}"`);
        if (phase === 'ultimate') { ctx.camDirector.setPreset('fight'); setPhase('fighting'); }
        else if (phase === 'ready') fight(ctx);
        else if (phase === 'roundOver') startRound(ctx);
        return;
      }
      if (phase === 'matchOver') return;

      assistTimer = Math.max(0, assistTimer - dt);
      // IMPROVE (2026-10-06): each fighter's reaction and guard flashes on its own timer
      meHitT = Math.max(0, meHitT - dt); if (meHitT === 0) meHitBy = null;
      foeHitT = Math.max(0, foeHitT - dt); if (foeHitT === 0) foeHitBy = null;
      parryFlash = Math.max(0, parryFlash - dt); giFlash = Math.max(0, giFlash - dt);
      foeParryFlash = Math.max(0, foeParryFlash - dt); foeGiFlash = Math.max(0, foeGiFlash - dt);
      chakra.update(dt); foeChakra.update(dt);
      meState.tick(sdtHero); foeState.tick(sdtRoom);   // phase 8: a clock per rig
      // the harness cools the shared meter on real time now -- a second update() here decayed it twice as fast

      // ── ultimate cinematic beat ──
      if (phase === 'ultimate') {
        ultTimer += dt;
        // IMPROVE (2026-10-06): the attacker closes to the stand-off during the cut (a slide still running at the spend
        // cannot carry the target out of the blow), and the tree plays the ultimate (animate: `ulting`)
        const a = (ultBy === 'me' ? player : rival).root.position, b = (ultBy === 'me' ? rival : player).root.position;
        const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), step = ultLungeStep(d, dt);
        if (step > 0) { a.x += (dx / d) * step; a.z += (dz / d) * step; }
        if (ultTimer > SHOWDOWN.ultCutSec) resolveUltimate(ctx);
        animate(dt); pushHud(ctx);
        return;
      }
      if (phase !== 'fighting') {
        // 'ready' / 'roundOver': nobody acts; the KO'd body holds the floor, the fighters square up, the camera follows
        faceEachOther(dt); animate(dt); pushHud(ctx);
        ctx.camDirector.look(lookX, lookY, dt);
        ctx.camDirector.update(player.root.position, meMove.vel, rival.root.position);
        return;
      }

      // ── wall shatter check (destructible beat) ──
      if (wallMesh && rival.root.position.z <= gateZ + SHOWDOWN_GATE.breakM) shatterGate(ctx);

      // ── IMPROVE (2026-10-06): the CHAKRA CHARGE (L1 held) — rooted; a hit, a swing or a full bar ends it ──
      if (charging && (!meState.controllable || meStrike.busy || chakra.full)) charging = false;
      if (charging) chakra.value = Math.min(CHAKRA.max, chakra.value + SHOWDOWN.chargePerSec * dt);

      // ── player movement (dash-cancel ready) ──
      if (meState.controllable && !meStrike.busy && !charging) {
        const w = wish(ctx);
        meMove.update(dt, w.x, -w.z, false);   // CourtMovement's stick space: +Y = −Z
      } else {
        meMove.update(dt, 0, 0, false);
      }
      player.root.position.addInPlaceFromFloats(meMove.vel.x * dt, meMove.vel.y * dt, meMove.vel.z * dt);   // (no Vector3 per frame)
      // P7 AUTO-SPACING: a body player has no stick — a strike out of range closes a little, a step in / out / across moves
      // the fighter; a stick past its dead zone always wins
      if (bodyShift) {
        if (Math.hypot(stickX, stickY) > 0.35 || !meState.controllable) bodyShift = null;
        else { const step = Math.min(dt, bodyShift.left); player.root.position.addInPlaceFromFloats(bodyShift.v.x * step, bodyShift.v.y * step, bodyShift.v.z * step); bodyShift.left -= step; if (bodyShift.left <= 0) bodyShift = null; }
      }
      arenaClamp(player.root.position, arena); if (!modeVenue?.constrain(player.root.position)) { player.root.position.x = Math.max(-ARENA_HALF, Math.min(ARENA_HALF, player.root.position.x)); player.root.position.z = Math.max(-ARENA_HALF, Math.min(ARENA_HALF, player.root.position.z)); }

      // ── strikes: advance, resolve at active-frame open ──
      const opened = meStrike.update(dt, now());
      if (opened.startedActive) {
        // IMPROVE (2026-10-06): the rival's substitution beat — my swing in flight finds nobody (the player's own rule)
        if (now() < foeSubstituted) { meStrike.current?.consumeHit(); banner(ctx, 'THEY SUBSTITUTED!', 500); }
        else resolveActiveStrike(ctx, true);
      }
      const foeOpened = foeStrike.update(sdtRoom, now());
      if (foeOpened.startedActive) {
        // substitution window: if the player substituted, this strike finds nothing
        if (now() < meSubstituted) {
          banner(ctx, 'SUBSTITUTED!', 500);
        } else {
          resolveActiveStrike(ctx, false);
        }
      }
      foeUlt.sync(foeStrike.current);   // an armed swing that ended unresolved carries nothing on
      if (phase !== 'fighting') { animate(dt); pushHud(ctx); return; }   // a KO, or the rival's ultimate, just began

      // ── rival AI: the shared brain approaches, uses the moveset, and spends chakra ──
      if (foeChakra.full) { if (!foeFullCalled) { foeFullCalled = true; ctx.juice.callout('RIVAL CHAKRA FULL', '#ff4d5e', 700); } }   // IMPROVE (2026-10-06): the tell before its ultimate
      else foeFullCalled = false;
      if (foeState.controllable) {
        // (NERVE: set once per round in roundStartRival — IMPROVE 2026-10-06)
        const meWinding = !!meStrike.current && meStrike.current.phase === 'startup';
        const incoming = meWinding && meStrike.current ? meStrike.current.secToActive : -1;
        const dist = Vector3.Distance(rival.root.position, player.root.position);
        const reach = meStrike.current?.move.atk.range ?? 1.8;
        // IMPROVE (2026-10-06): the rival reads my openings (a whiff's recovery, a dash, a roll, a chakra charge) and its own sub cooldown
        const meOpen = meStrike.current?.phase === 'recovery' || meMove.dashing || meMove.rolling || charging;
        const decision = rivalBrain.decide(
          sdtRoom, rival.root.position, player.root.position, foeState, meWinding,
          { value: foeChakra.value, max: CHAKRA.max, dashCost: DASH_CHI_COST, subCost: SUBSTITUTION_CHI_COST, subReady: foeDef.canSubstitute(foeChakra.value, now()) },
          threatLandsIn(dist, reach, incoming < 0 ? null : incoming), meOpen,
        );
        let thrown = false;
        if (!foeStrike.busy) {
          const sprint = dist > 6 && decision.spend !== 'dash';
          foeMove.update(sdtRoom, decision.moveX, decision.moveY, sprint);
          if (decision.attackId) thrown = foeStrike.request(decision.attackId, now());
        } else {
          foeMove.update(sdtRoom, 0, 0, false);
        }
        if (decision.spend === 'dash' && foeChakra.spend(DASH_CHI_COST)) {
          const tx = player.root.position.x - rival.root.position.x, tz = player.root.position.z - rival.root.position.z;
          if (Math.hypot(tx, tz) > 0.2) foeMove.dash(tx, tz);
        }
        // IMPROVE (2026-10-06): the rival's ULTIMATE is real. Its full bar rides the heavy the brain throws for it, and the
        // cut plays if that opener lands clean (resolveActiveStrike); blocked, parried, dodged or substituted, the bar is
        // gone for nothing. It used to drain the bar and throw a plain heavy — no attack of its own, no cinematic.
        if (decision.spend === 'ultimate' && thrown && foeStrike.current && foeChakra.spendUltimate()) {
          foeUlt.arm(foeStrike.current);
          ctx.juice.flash('#ff3344', 90); ctx.juice.callout('RIVAL ULTIMATE!', '#ff4d5e', 500);
          SoundKit.play('powerUp', { pitch: 0.45, volume: 0.6 });
          console.info('[SD-STORM] rival ultimate armed');
        }
        if (decision.spend === 'substitution' && foeChakra.spend(SUBSTITUTION_CHI_COST)) {
          foeDef.spendSubstitution(now());   // IMPROVE (2026-10-06): the rival's substitution has the player's cooldown and punish window
          const spot = DefenseController.substitutionSpot(player.root.position, player.root.rotation.y);
          rival.root.position.copyFrom(spot);
          // IMPROVE (2026-10-06): seen and heard, like the player's — it was a silent teleport — and the swing it read finds nobody
          foeSubstituted = now() + SHOWDOWN.subWhiffMs;
          SoundKit.play('whoosh', { pitch: 1.8, volume: 0.6 });
          EffectsKit.burst(ctx.scene, spot.addInPlaceFromFloats(0, 1.2, 0), 'glitch');
          ctx.camDirector.pulse(0.4, 0.35);
          banner(ctx, 'RIVAL SUBSTITUTED — BEHIND YOU!', 800);
          console.info('[SD-STORM] rival substitution');
        }
        if (decision.block && !foeState.blockHeld) {
          // IMPROVE (2026-10-06): the brain says block / parry / guard impact; the press is stamped for it (was always now − 200)
          const at = guardPressMs(now(), decision.guard, incoming >= 0 ? incoming * 1000 : null);
          foeDef.pressBlock(at, decision.guard === 'impact'); foeState.pressBlock(at); foeGuardUntil = now() + 600;
        }
        if (!decision.block && foeState.blockHeld && now() > foeGuardUntil) { foeDef.releaseBlock(); foeState.releaseBlock(); }
        rival.root.position.addInPlaceFromFloats(foeMove.vel.x * sdtRoom, foeMove.vel.y * sdtRoom, foeMove.vel.z * sdtRoom);
        arenaClamp(rival.root.position, arena); if (!modeVenue?.constrain(rival.root.position)) { rival.root.position.x = Math.max(-ARENA_HALF, Math.min(ARENA_HALF, rival.root.position.x)); rival.root.position.z = Math.max(-ARENA_HALF, Math.min(ARENA_HALF, rival.root.position.z)); }
      }

      // ── support assist lifecycle (one body, shown and hidden) ──
      if (assistActive > 0 && support) {
        assistActive -= dt;
        const sp = support.root.position, rp = rival.root.position;
        const dx = rp.x - sp.x, dz = rp.z - sp.z, d = Math.hypot(dx, dz);
        if (d > 1.4) { const k = Math.min(d - 1.4, 6 * dt) / d; sp.x += dx * k; sp.z += dz * k; }
        if (assistActive <= 0) hideAssist();
      }

      // ── animation trees ──
      faceEachOther(dt);
      animate(dt);
      pushHud(ctx);
      ctx.camDirector.look(lookX, lookY, dt);
      ctx.camDirector.update(player.root.position, meMove.vel, rival.root.position);
    },

    dispose() {
      // IMPROVE (2026-10-06): nothing waits on a disposed rig — the timers, the slides and the banner go with the mode
      timers.clear(); knock.clear(); bannerSlot.clear(); foeUlt.clear(); charging = false;
      modeVenue?.dispose?.(); modeVenue = null; arenaHandle?.dispose(); arenaHandle = null;
      support?.dispose(); support = null;
      wallMesh?.dispose(false, true); wallMesh = null;   // IMPROVE (2026-10-06): the gate's material with it
      mePosture?.dispose(); foePosture?.dispose(); mePosture = null; foePosture = null;
      player?.dispose(); rival?.dispose(); SoundKit.stopAmbient();
    },
  };
})();
