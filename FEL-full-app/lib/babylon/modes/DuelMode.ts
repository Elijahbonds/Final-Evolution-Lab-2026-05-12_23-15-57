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
//
// IMPROVE (2026-10-06), the owner's twenty (docs/IMPROVEMENTS-2026-10-05.md, duel): the rival's chi fills on a blow that
// lands and buys a real dash, a substitution that cannot ring itself out and a CRITICAL EDGE; the rival never walks off
// a drop; its weapon is a counter-pick that changes when it loses; both fighters' parries and guard impacts play; a round
// ends through the animation tree (the loser holds the floor, the winner celebrates); the start-up screen's weapon is
// not picked twice; the round clock and the edge call have their own HUD fields; the score pays ring-outs and guard
// impacts; and the per-frame and per-press garbage is gone. Pure rules: ./duelRules.ts.

import { mountPostureLayer } from '../anim/PostureLayer';
type PostureHandle = ReturnType<typeof mountPostureLayer>;
import { combatPose, combatApproach, COMBAT_INPUT_IDLE, type CombatPostureInput } from '../core/CombatPosture';
import { BodyMotion, dynamicPose, COMBAT_DYNAMIC } from '../core/DynamicPosture';
import { strafeAxis } from '../core/Biomech';
import { Vector3 } from '@babylonjs/core';
import { CharacterLibrary, type SpawnedCharacter } from '../core/CharacterLibrary';
import { neverBindPose } from '../anim/importSanitizer';
import { installSafePlay } from '../anim/clipRegistry';
import { FighterState, KARATE_ATTACKS, STAFF_ATTACKS, PARRY_WINDOW_MS, CHI_MAX, guardPressMs, rivalDifficulty, rivalPower, applyRivalPower, RIVAL_POWER_BASE, type RivalPower } from '../core/FightCore';
import { KnockSlides, makeChestOf } from '../core/FightKit';   // IMPROVE (2026-10-06): the shared knock slide + scratch chest points
import { readTier } from '../core/Difficulty';   // IMPROVE (2026-10-06): the OPPONENT pick
import { BannerSlot } from '../core/ModeClock';   // IMPROVE (2026-10-06): one banner, expiring on the game clock
import { RivalCombatBrain, threatLandsIn, type RivalResource } from '../core/RivalCombatBrain';
import {
  StrikeController, karateMoveset, staffMoveset, bladeMoveset, MIN_STARTUP_SEC, type CombatMove, bookMoveset, stringRule } from '../core/StrikeSystem';
import { DefenseController, applyDefenseOutcome, SUBSTITUTION_CHI_COST } from '../core/DefenseSystem';
import { ComboBreaker, COMBO_BREAK } from '../core/ComboBreaker';
import { CHI } from '../core/ResourceMeter';
import { CombatMovement } from '../core/CombatMovement';
import { XButtonReader, LAUNCH_AIR_SEC, launchHeight } from '../core/StormCombat';
import { FOCUS, FocusMeter } from '../core/MatrixFocus';   // phase 8: bullet time on R2, a clock per rig
import { StringBook, type StickDir, type StrikeBtn } from '../core/HordeDynamics';   // phase 4   // combat pass phase 3: X = tap dash / double = chakra dash / hold = guard, the same reader the Storm modes use
import { CombatAnimTree } from '../anim/combatTree';
import { SoundKit } from '../audio/SoundKit';
import { refuse } from '../core/Refusal';   // MECHANICS PASS: a press that cannot act is answered
import { EffectsKit } from '../visual/EffectsKit';
import { assertSpawned } from '../core/FrameGuard';
import type { ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import { KARATE_CONFIG as CFG } from './modeConfigs';
import { weaponById, readWeapon, equipWeapon, weaponPicked } from '../combat/arsenal';
import type { Mesh } from '@babylonjs/core';
import { VenueKit } from '../visual/VenueKit';
import { mountVenue, type VenueHandle } from '../core/NexusVenue';
import { readCombatArena, arenasFor, arenaClamp, offEdge, insideBy, describeArena, type CombatArena, knockTo } from '../combat/arenas';   // COMBAT ARENAS (2026-09-18)
import { buildArena, type ArenaHandle } from '../combat/arenaBuild';
import { readBlend, blendTraits } from '../combat/schools';
import { styleMoveset } from '../combat/loadout';
import { roundCall, UltimateArm } from './showdownRules';   // IMPROVE (2026-10-06): Showdown's round call and its one-swing ultimate arm
import {
  DUEL, DUEL_HINT, DUEL_WEAPONS, chiForOutcome, rivalWeaponFor, edgeCall, holdFromEdge, safeSubstitutionSpot, duelScore,
  type DuelWeapon,
} from './duelRules';
// MOVEMENT PLAY P7 (2026-09-25): the body's own strikes, guard, slips and steps — behind its flag until the live probe
// measures 0 misfires (bodyFightFlags; READY says "coming" meanwhile)
import { MOVES as HORDE_MOVES } from '../core/HordeDynamics';
import type { DefenseAction } from '../core/DefenseSystem';
import type { AttackDef } from '../core/FightCore';
import {
  BodyFightDriver, DefenseLedger, DeferredHits, BodyDriveTracker, PadBlock, bodyDefenseAt, defenseActionOf, strongerDefense, contactMsOf, bodyLunge, stepSpace, planeMove,
  FIGHT_CLAIMS, FIGHT_CARD_LINES,
} from '../combat/bodyFight';
import { bodyFightOn } from '../combat/bodyFightFlags';
import { readBodyKicks } from '@/lib/move/bodyPlayChoice';
import type { BodyEvent } from '@/lib/pose/BodyReader';
import type { BodyView } from '../core/ModeHarness';

export type { DuelWeapon } from './duelRules';
const WEAPON_MOVESET: Record<DuelWeapon, () => Record<string, CombatMove>> = {
  fists: () => bookMoveset(KARATE_ATTACKS),        // phase 4: empty hands read the Storm book
  // COMBAT DIFFICULTY (2026-10-06): the staff swings its OWN authored chain (poke → sweep → overhead inside each move's
  // cancel window), not the string rule. Under the string rule a poke cancelled at half its active frames, so a mashed
  // staff chained 2.6 m pokes faster than their stun wore off: measured, a masher won 100 % of matches at every tier
  // with the rival unable to touch it, while a player who spaced and read won fewer than with fists. "Long and slow —
  // win by keeping distance and punishing approaches" (FightCore's STAFF table) is the weapon again.
  staff: () => staffMoveset(STAFF_ATTACKS),
  blade: () => stringRule(bladeMoveset()),
};
/** Phase 4: the RIVAL keeps the plain movesets. Measured with the string rule on him: his brain requests a random id
 *  every tick, so every swing chained into the next and the hero was knocked down twice and never got a press in (4 swings
 *  of 37). The rival's chaining is phase 10's call, made deliberately, not a side effect of the hero's upgrade. */
const RIVAL_MOVESET: Record<DuelWeapon, () => Record<string, CombatMove>> = {
  fists: () => karateMoveset(KARATE_ATTACKS),
  staff: () => staffMoveset(STAFF_ATTACKS),
  blade: () => bladeMoveset(),
};
const WEAPON_TAG: Record<DuelWeapon, string> = { fists: 'FISTS', staff: 'STAFF', blade: 'BLADE' };
const WHOOSH_PITCH: Record<DuelWeapon, number> = { fists: 1.2, blade: 1.5, staff: 0.8 };
/** Phase 4: the book's ids beyond these three are reached through the string, not a button. */
const FIST_IDS = ['jab', 'kick', 'heavy'] as const;

/**
 * The player's start-up screen picks, applied to whatever weapon this round is using.
 *
 * The STYLE comes from the screen either way, because a school is how you fight rather than what you fight with.
 * IMPROVE (2026-10-06): built ONCE per weapon change (setMyWeapon), not on every press — it rebuilt the moveset and
 * re-read the stored blend one to three times per input.
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

// The ring-out boundary is the picked arena's shape now (combat/arenas.ts): the Pit's octagon, the Rooftop's slab, the
// Cliffside Shrine's half-walled disc. All three DROP; Duel is a ring-out game.
/** How far the platform stands proud of the venue floor. Non-zero or the two surfaces z-fight. */
const DISC_LIFT = 0.12;
const ROUNDS_TO_WIN = DUEL.roundsToWin;

// IMPROVE (2026-10-06): 'ready' — the round-start beat (ROUND n … FIGHT!); the KO pause ('roundOver') and the gap after the
// weapon pick run on the game clock now (they were setTimeouts a pause did not hold and a dispose did not cancel).
type Phase = 'intro' | 'weaponSelect' | 'ready' | 'fighting' | 'roundOver' | 'matchOver';
const BUDGET_SEC: Record<Phase, number> = { intro: 3, weaponSelect: 20, ready: 3, fighting: DUEL.roundSec, roundOver: 5, matchOver: 999 };

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
  const chestOf = makeChestOf();   // IMPROVE (2026-10-06): one scratch point per target, no per-frame Vector3s
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
  /** IMPROVE (2026-10-06): the styled moveset and its ids, built on a weapon change (setMyWeapon). */
  let myMoves: Record<string, CombatMove> = {};
  let myMoveIds: string[] = [];
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
  // IMPROVE (2026-10-06): into one scratch vector (it built three per call, every frame). The director's forwardFlat /
  // rightFlat still allocate inside CameraDirector, which is not this mode's file.
  const wishV = new Vector3();
  const wish = (ctx: ModeContext): Vector3 => {
    const f = ctx.camDirector.forwardFlat(), r = ctx.camDirector.rightFlat();
    return wishV.set(f.x * -stickY + r.x * stickX, 0, f.z * -stickY + r.z * stickX);
  };
  let round = 1, myWins = 0, foeWins = 0;
  // IMPROVE (2026-10-06): what the result pays beyond the rounds (duelRules.duelScore), and what the rival's weapon pick reads
  let ringOutWins = 0, guardImpacts = 0;
  let lastFoeWeapon: DuelWeapon | null = null, rivalWonLast = false;
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
  // IMPROVE (2026-10-06): a hit-react timer PER fighter — the one shared `hitT` let a hit on one fighter cut the other's
  // reaction short (and a stale one ran on into the next hit)
  let meHitT = 0, foeHitT = 0;
  // IMPROVE (2026-10-06): the one-beat guard flashes, per fighter, SET when the defence lands (they were hard-coded false,
  // so the mode's signature guard impact had no body reaction at all)
  let parryFlash = 0, giFlash = 0, foeParryFlash = 0, foeGiFlash = 0;
  // IMPROVE (2026-10-06): the round's verdict on the bodies — the loser holds the floor, the winner celebrates (the tree's
  // ko / celebrate states). It was a direct animator.play of the knockdown while both trees stopped.
  let meOut = false, foeOut = false;
  // IMPROVE (2026-10-06): the rival's spends — its substitution's beat (my swing in flight finds nobody) and its
  // CRITICAL EDGE, armed on one heavy and played only if that heavy lands clean
  let foeSubstituted = 0;
  const foeUlt = new UltimateArm();
  let foeFullCalled = false;
  /** IMPROVE (2026-10-06): the rival's chi as the brain reads it — one object rewritten per frame (chiResource built one). */
  const foeRes: RivalResource = { value: 0, max: CHI_MAX, dashCost: DUEL.rivalDashChi, subCost: SUBSTITUTION_CHI_COST, subReady: true };
  let clock = 0;   // IMPROVE (2026-10-06): the mode's game clock (banners)
  const bannerSlot = new BannerSlot();
  let arena: CombatArena = arenasFor('duel')[0];
  let arenaHandle: ArenaHandle | null = null;
  /** IMPROVE (2026-10-06): metres inside the picked arena's edge at (x, z), through one scratch point (the brain probes it
   *  every frame; a `{ x, z }` per call was garbage). */
  const edgeP = { x: 0, z: 0 };
  const edgeIn = (x: number, z: number): number => { edgeP.x = x; edgeP.z = z; return insideBy(edgeP, arena.shape); };

  const setPhase = (p: Phase): void => { phase = p; phaseSec = 0; };
  const now = (): number => performance.now();
  /** Phase 5 — THE KNOCK SLIDE (VS's G3 rule): a hit carries the body out at a constant speed with an ease-out, the
   *  distance setting the duration, so a big hit reads bigger. It used to be a velocity impulse added to the movement's
   *  velocity, which the movement model then damped on its own terms — the distance a hit carried was whatever the damping
   *  left, not the attack's knockback. */
  // IMPROVE (2026-10-06): the slide itself is the shared KnockSlides (core/FightKit) — ticked on the ROOM clock in update(),
  // one per body, cleared at a round reset and on dispose — instead of a real-clock render observer per hit. checkRingOut
  // still reads the position every frame, so a slide past a drop edge rings out exactly as before.
  const knock = new KnockSlides();
  function knockSlide(_ctx: ModeContext, char: SpawnedCharacter, fromPos: Vector3, meters: number, clamp?: (q: Vector3) => void): void {
    const dir = char.root.position.subtract(fromPos); dir.y = 0;
    if (dir.lengthSquared() < 1e-4 || meters <= 0) return;
    dir.normalize();
    const to = char.root.position.add(dir.scale(meters)); if (clamp) clamp(to);
    knock.start(char.root.position, to.x, to.z);
  }
  let rivalBrain = new RivalCombatBrain({ difficulty: 0.72 });
  /** COMBAT DIFFICULTY (2026-10-06): the rival's power for this round (rivalPower; set in roundStartRival). */
  let foePower: RivalPower = rivalPower(1, null);
  /** IMPROVE (2026-10-06): the rival's brain for a weapon (its moves are the brain's moves). Built when its weapon changes. */
  function brainFor(w: DuelWeapon): RivalCombatBrain {
    return new RivalCombatBrain({
      difficulty: 0.72, canSpecial: false,   // IMPROVE (2026-10-06): this mode never upgrades a full-chi heavy to a special
      moves: Object.entries(RIVAL_MOVESET[w]()).map(([id, m]) => ({
        id,
        kind: m.weight === 'light' ? 'jab' as const : m.weight === 'medium' ? 'kick' as const : 'heavy' as const,
        range: m.atk.range,
      })),
    });
  }
  /** IMPROVE (2026-10-06): the rival at a round's start — the standing (NERVE, once per round now, not per frame), the
   *  OPPONENT pick (PRO = the tuned 0.72), the disc's edge (it circles away from the drop), no slide left running. */
  /** COMBAT DIFFICULTY (2026-10-06): the rival escapes a long mashed string (core/ComboBreaker). */
  const breaker = new ComboBreaker();
  function roundStartRival(): void {
    breaker.reset();
    rivalBrain.setStanding(foeWins, myWins, ROUNDS_TO_WIN);
    rivalBrain.setDifficulty(rivalDifficulty(0.72, readTier()));
    // COMBAT DIFFICULTY (2026-10-06): nothing here reads the line, so a read is a guard, never a sidestep; and the rival's
    // POWER for the pick (hp, damage, guard — FightCore.rivalPower). resetRound has run: the HP is filled here.
    rivalBrain.setStepping(false);
    rivalBrain.setFoeReach(WEAPON_RANGE[myWeapon]);   // the read covers what I hold — a staff poke lands from 2.6 m
    foePower = rivalPower(RIVAL_POWER_BASE.duel * DUEL.rivalPowerByWeapon[myWeapon], readTier());   // the pick's matchup (duelRules)
    applyRivalPower(foeState, foePower); foeState.hp = foeState.maxHp;
    rivalBrain.setEdge(edgeIn);
    knock.clear();
  }
  /** Phase 5 — SOUL CALIBUR WEIGHT (the horde's rule): the connect holds for a beat that grows with the weight. */
  const HIT_STOP_MS = { light: 28, medium: 45, heavy: 70, finisher: 70 } as const;
  let foeLaunchedSec = 0;   // phase 5
  const book = new StringBook(); const BTN_OF: Record<'jab' | 'kick' | 'heavy', StrikeBtn> = { jab: 'A', kick: 'B', heavy: 'Y' };   // phase 4
  let stringLabels: string[] = [];   // phase 9: the names of the links so far, for the COMBO banner
  const xBtn = new XButtonReader();   // phase 3: the Storm X on the duel too — a step (tap), a closing step at the rival (double), the guard (hold)
  const focus = new FocusMeter(); let focusHeld = false, focusHud = -1, focusHudOn = false;   // phase 8
  let foeGuardUntil = 0;
  let guardUp = false;
  // MOVEMENT PLAY P7: the body's fight read (the Showdown seam; a weapon swings on the plane rule)
  // the READY screen's spin / jump kick opt-in, read when a kick is told: the toggle is offered after load (READY, or the
  // check over a pause), so a value read in load() would miss the player's tick for this match
  const bodyDriver = new BodyFightDriver({ kicksOptIn: () => readBodyKicks('duel') });
  const ledger = new DefenseLedger(), deferred = new DeferredHits(), drive = new BodyDriveTracker();
  const padGuard = new PadBlock();   // P7 (the review, 2026-09-26): the pad's X guard apart from the body's — a deferred hit meets both
  let bodyGuard = false;   // P7: the block is the body's (its guard up), to let go when the reader loses the guard
  let bodyShift: { v: Vector3; left: number } | null = null;
  let ctxRef: ModeContext | null = null;
  const bodyDriven = (): boolean => drive.driven(!!ctxRef?.body?.()?.read.tracking);
  /** IMPROVE (2026-10-06): ONE banner slot with an expiry on the game clock (core/ModeClock). Each banner used to start its
   *  own setTimeout that cleared whatever was showing by then, so an older timer wiped a newer banner early. */
  function banner(ctx: ModeContext, text: string, ms = 900): void {
    ctx.setHud({ banner: bannerSlot.show(text, ms / 1000, clock) });
  }

  /** P7: what the rival's blow meets on a BODY player at `impactAt` (page ms) — Showdown's rule (bodyDefenseAt's windows). */
  function bodyAction(atk: AttackDef, dist: number, impactAt: number): DefenseAction | 'evaded' {
    if (dist > atk.range) return 'outOfRange';   // IMPROVE (2026-10-06): out of reach is a whiff; 'none' (undefended) is a hit now
    const bd = bodyDefenseAt(ledger, impactAt);
    // (the pad's guard counts too, as it stood AT the impact — see ShowdownMode)
    const padHeld = padGuard.heldAt(impactAt);
    const pad: DefenseAction = padHeld || padGuard.pressWithin(impactAt, PARRY_WINDOW_MS) !== null ? meDef.resolve(atk, dist, padHeld, impactAt) : 'none';
    if (!meState.controllable) return ledger.at(impactAt).guardHeld || padHeld ? 'blocked' : 'none';   // a held guard stays up through a stagger
    return strongerDefense(defenseActionOf(bd.d), pad);
  }

  /** P7: the ledger follows the body's own guard, per packet and per frame (see ShowdownMode). */
  function bodyLedgerFrame(view: BodyView, t: number): void {
    const g = ledger.frame(view, t, deferred.oldest);
    if (g === 'down' && bodyGuard) { bodyGuard = false; if (!padGuard.held) { meDef.releaseBlock(); meState.releaseBlock(); guardUp = false; } }
    else if (ledger.guardUp && !bodyGuard && phase === 'fighting' && meState.controllable) { drive.body(t); bodyGuard = true; meDef.pressBlock(-1e9, false); meState.pressBlock(-1e9); guardUp = true; }
  }

  /** P7: one fight-read event from the body — taken only in the fight: the weapon pick, the intro and the break between
   *  rounds take nothing (A / B / Y there are the pad's), and nothing is refused out loud. Empty hands read the book; a
   *  weapon swings on the plane rule (straight → its first move, hook → its second, uppercut → its third) and has no kick. */
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
    switch (it.kind) {
      case 'guard':
        drive.body(t);
        if (it.up) { const at = it.raise ? it.onsetPage : -1e9; meDef.pressBlock(at, it.raise && it.push); meState.pressBlock(at); guardUp = true; }
        else if (!padGuard.held) { meDef.releaseBlock(); meState.releaseBlock(); guardUp = false; }
        bodyGuard = it.up;
        console.info(`[DL-BODY] guard ${it.up ? (it.raise ? 'raise' : 'up') : 'down'}`);
        return true;
      case 'strike': {
        const whooshPitch = WHOOSH_PITCH[myWeapon];
        const opts = { elapsedMs: t - it.onsetPage, contactMs: 0 };
        // auto-spacing: a blow thrown with the rival a little out of its reach closes on him (bodyLunge)
        const lungeFor = (id: string): void => {
          const range = myMoves[id]?.atk.range ?? 1.6, d = Vector3.Distance(player.root.position, rival.root.position), L = bodyLunge(d, range);
          if (L > 0) { const v = rival.root.position.subtract(player.root.position); v.y = 0; bodyShift = { v: v.normalize().scale(L / 0.15), left: 0.15 }; }
        };
        if (myWeapon === 'fists') {
          const mv = book.pressMove(HORDE_MOVES[it.move], it.token, it.onsetPage / 1000);
          opts.contactMs = contactMsOf(mv);
          drive.body(t);
          const ok = meStrike.request(mv.id, t, opts);
          if (ok) SoundKit.play('whoosh', { pitch: whooshPitch, volume: 0.4 });
          lungeFor(mv.id);
          if (book.history.length === 1) stringLabels = [];   // a body strike that starts a string starts its call
          stringLabels.push(mv.label); console.info(`[DL-STORM] link ${mv.id} string ${book.history.length} body ${it.body} age ${Math.round(t - it.onsetPage)}${ok ? '' : ' queued'}`);
          if (mv.ender || book.history.length === 0) { const call = stringLabels.join(' → '); stringLabels = []; if (call.includes('→')) banner(ctx, `COMBO: ${call}`, 900); }
          return true;
        }
        const id = planeMove(myMoveIds, it.body);
        if (!id) return false;   // a kick with a weapon in hand: nothing to swing
        // a weapon's swing has no capture contact frame to hold to: its whole startup is its wind-up (the hit is never
        // brought forward past the swing the rival sees)
        opts.contactMs = (myMoves[id]?.startupSec ?? 0) * 1000;
        drive.body(t);
        const ok = meStrike.request(id, t, opts);
        if (ok) SoundKit.play('whoosh', { pitch: whooshPitch, volume: 0.4 });
        lungeFor(id);
        console.info(`[DL-STORM] body ${it.body} → ${id}${ok ? '' : ' queued'} age ${Math.round(t - it.onsetPage)}`);
        return true;
      }
      case 'evade': {
        drive.body(t);
        const r = ctx.camDirector.rightFlat();
        const dir = it.side === null ? Vector3.Zero() : r.scale(it.side === 'L' ? -1 : 1);
        if (!meMove.slip(dir.x, dir.z)) return false;   // (the i-frames only with the slip itself: see ShowdownMode)
        ledger.evade(it);
        console.info(`[DL-BODY] ${it.form}${it.side ?? ''}`);
        return true;
      }
      case 'step': {
        drive.body(t);
        const sp = stepSpace(it.dir);
        const to = rival.root.position.subtract(player.root.position); to.y = 0;
        const along = to.lengthSquared() > 1e-4 ? to.normalize() : ctx.camDirector.forwardFlat();
        const v = along.scale(sp.along).addInPlace(ctx.camDirector.rightFlat().scale(-sp.across));
        bodyShift = { v: v.scale(1 / 0.25), left: 0.25 };
        console.info(`[DL-BODY] step ${it.dir}`);
        return true;
      }
    }
  }

  /** Ring-out check — leaving the disc ends the round immediately. */
  function checkRingOut(ctx: ModeContext): boolean {
    arenaClamp(player.root.position, arena); arenaClamp(rival.root.position, arena);   // the walls and the AC units hold; the drop does not
    if (offEdge(rival.root.position, arena)) { endRound(ctx, true, 'RING OUT!', 'ringout'); return true; }
    if (offEdge(player.root.position, arena)) { endRound(ctx, false, 'RING OUT — YOU FELL', 'ringout'); return true; }
    return false;
  }

  /** `body` (P7): the rival's strike on a BODY player, resolved late at its impact instant (and whether it carried the
   *  rival's CRITICAL EDGE — taken when the swing opened, carried into the deferred resolve). */
  function resolveActive(ctx: ModeContext, mine: boolean, body?: { move: CombatMove; impactAt: number; ult: boolean }): void {
    const atkChar = mine ? player : rival;
    const defChar = mine ? rival : player;
    const atkState = mine ? meState : foeState;
    const defState = mine ? foeState : meState;
    const defCtrl = mine ? foeDef : meDef;
    const sc = mine ? meStrike : foeStrike;
    const move = body ? body.move : sc.current?.move;
    if (!move) return;
    // IMPROVE (2026-10-06): does this swing carry the rival's CRITICAL EDGE? Taken once, as the swing resolves; a dodge, a
    // whiff or any defence below spends it for nothing
    let ult = !!body?.ult;
    if (!body) {
      if (!sc.current!.hitLive) return;
      if (!mine) ult = foeUlt.take(sc.current);
      sc.current!.consumeHit();
      // P7: the rival's blow on a BODY player waits for the body's frames to cover the impact (DefenseLedger)
      if (!mine && bodyDriven()) { const imp = now(); deferred.push(imp, (at) => resolveActive(ctx, false, { move, impactAt: at, ult })); return; }
    } else if (phase !== 'fighting') return;

    const dist = Vector3.Distance(atkChar.root.position, defChar.root.position);
    if (!mine && meMove.dashIFrames) { foeState.staggerSec = Math.max(foeState.staggerSec, 0.45); banner(ctx, ult ? 'CRITICAL EDGE DODGED — PUNISH!' : 'PERFECT DODGE — PUNISH!', 700); ctx.feel?.impact?.(0.3); console.info('[DL-STORM] step i-frames — whiff · perfect dodge'); return; }   // phase 6: the read opens him   // phase 3
    const bodyAct = body ? bodyAction(move.atk, dist, body.impactAt) : null;
    if (bodyAct === 'evaded') { foeState.staggerSec = Math.max(foeState.staggerSec, 0.45); banner(ctx, 'PERFECT DODGE — PUNISH!', 700); ctx.feel?.impact?.(0.3); console.info('[DL-STORM] body slip — whiff · perfect dodge'); return; }
    const action = bodyAct ?? defCtrl.resolve(move.atk, dist, defState.blockHeld, now());
    if (body) console.info(`[DL-DEF] body ${action} (${Math.round(now() - body.impactAt)} ms late)`);
    const outcome = applyDefenseOutcome(action, atkState, defState, move.atk);
    // IMPROVE (2026-10-06), TUNED: the ATTACKER's chi fills by the move's own chiGain when the blow lands (a hit, a guard it
    // breaks). Duel never paid chi, so the rival could never afford a dash, a substitution or its CRITICAL EDGE.
    const gain = chiForOutcome(outcome, move.atk.chiGain);
    if (gain) atkState.chi = Math.min(CHI_MAX, atkState.chi + gain);
    // COMBAT DIFFICULTY (2026-10-06), TUNED: a blow TAKEN builds the defender's chi too (ResourceMeter CHI.gains.hitTaken,
    // which nothing paid) — the stun-locked rival's way to afford the substitution out of a mashed string (ComboBreaker)
    if (outcome === 'hit') defState.chi = Math.min(CHI_MAX, defState.chi + (CHI.gains.hitTaken ?? 0));
    if (ult && outcome !== 'hit') { banner(ctx, outcome === 'whiff' ? 'CRITICAL EDGE MISSED!' : 'CRITICAL EDGE STOPPED!', 800); console.info(`[DL-STORM] rival critical edge answered (${outcome})`); }

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
        beatParry(!mine);   // IMPROVE (2026-10-06): the defender's parry plays
        if (!mine) focus.gain(FOCUS.dodgeGain);   // phase 8: a read refills Focus
        SoundKit.play('impact', { pitch: 1.6, volume: 0.5 });
        // A PARRY IS THE NEAR MISS. Reach decides this fight, so reading a swing and answering it is the
        // skill the mode is about -- and it was worth nothing to the meter.
        ctx.momentum.report({ kind: mine ? 'near_miss' : 'blunder', weight: mine ? 12 : -6 });
        banner(ctx, mine ? 'PARRIED!' : 'PERFECT PARRY!');
        break;
      case 'guardImpacted':
        beatGuardImpact(!mine);   // IMPROVE (2026-10-06): the defender's guard impact plays
        if (!mine) { focus.gain(FOCUS.dodgeGain); guardImpacts++; }   // phase 8: a read refills Focus; IMPROVE (2026-10-06): and the score pays it
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
        // IMPROVE (2026-10-06), TUNED: the rival's CRITICAL EDGE lands DUEL.critMult harder and carries the body that much further
        const crit = ult ? DUEL.critMult : 1;
        const dealt = Math.round(move.atk.dmg * scale * crit * (mine ? 1 : foePower.dmg) * (mine && focus.active ? FOCUS.damageMult : 1) * defCtrl.counterMult(now()));   // COMBAT DIFFICULTY (2026-10-06): the rival's power   // phase 8: a Focus strike lands harder; IMPROVE (2026-10-06): a read substitution eats COUNTER damage
        if (mine) focus.gain(FOCUS.hitGain);
        defState.hp = Math.max(0, defState.hp - dealt);
        defState.stunSec = Math.max(defState.stunSec, move.atk.stunSec);
        atkState.combo += 1; atkState.comboTimer = 1.1;
        hitReact(!mine, w);
        ctx.feel?.impact?.(w === 'heavy' ? 0.55 : 0.3);   // ONE thud per connect (the impact SFX that doubled it is gone)
        ctx.momentum.report(mine ? { kind: 'clean_hit', weight: w === 'heavy' || w === 'finisher' ? 16 : 9 } : { kind: 'blunder', weight: -8 });
        if (w === 'heavy' || w === 'finisher' || ult) { heavyPunch(ctx, ult ? 'critical edge' : w); console.info(mine ? '[DUEL-JUICE] heavy landed' : '[DUEL-JUICE] heavy taken'); } else { ctx.juice.hitStop(HIT_STOP_MS[w]); console.info(mine ? '[DUEL-JUICE] hit' : '[DUEL-JUICE] taken'); }   // phase 5
        if (ult) { ctx.juice.flash('#ff3344', 120); ctx.camDirector.pulse(0.5, 0.45); banner(ctx, 'CRITICAL EDGE!', 900); console.info('[DL-STORM] rival critical edge landed'); }
        // phase 5: the knock slide drives the ring-out game — a drop edge lets the slide run past the rim (knockTo only clamps
        // to walls / pillars there), and checkRingOut reads the position every frame
        knockSlide(ctx, defChar, atkChar.root.position, move.atk.knockback * crit, (q) => { const kt = knockTo(defChar.root.position, q, arena); q.x = kt.x; q.z = kt.z; });
        if (mine && move.launch) { foeLaunchedSec = LAUNCH_AIR_SEC; console.info('[DL-STORM] LAUNCHED — air string open'); }
        else if (mine && move.air && !move.slam) foeLaunchedSec = Math.max(foeLaunchedSec, 0.5);
        else if (mine && move.slam) foeLaunchedSec = 0;
        // (the HP reaches the HUD at the end of the frame — pushHud — IMPROVE 2026-10-06)
        if (checkRingOut(ctx)) return;
        if (defState.hp <= 0) endRound(ctx, mine, mine ? 'K.O.' : 'K.O. — YOU', 'ko');
        else if (mine) {
          // COMBAT DIFFICULTY (2026-10-06): a rival stun-locked by a long mashed chain substitutes out of it (ComboBreaker) —
          // when it has the chi and a spot with footing (never off the drop)
          const spot = foeState.chi >= SUBSTITUTION_CHI_COST ? safeSubstitutionSpot(player.root.position.x, player.root.position.z, player.root.rotation.y, edgeIn) : null;
          if (breaker.hit(now() / 1000, readTier(), !!spot) && spot) comboBreak(ctx, spot);
        }
        break;
      }
    }
  }

  /** COMBAT DIFFICULTY (2026-10-06): THE BREAK — the rival's substitution out of a combo (see ShowdownMode.comboBreak). */
  function comboBreak(ctx: ModeContext, spot: { x: number; z: number }): void {
    foeState.chi -= SUBSTITUTION_CHI_COST;
    foeDef.spendSubstitution(now());
    foeState.stunSec = 0; foeState.staggerSec = 0;
    knock.cancel(rival.root.position);
    rival.root.position.set(spot.x, rival.root.position.y, spot.z);
    foeSubstituted = now() + DUEL.subWhiffMs;
    SoundKit.play('whoosh', { pitch: 1.8, volume: 0.6 });
    EffectsKit.burst(ctx.scene, new Vector3(spot.x, rival.root.position.y + 1.2, spot.z), 'glitch');
    ctx.juice.flash('#ff3344', 110);
    ctx.camDirector.pulse(0.45, 0.35);
    banner(ctx, 'BREAK! — THE RIVAL ESCAPED YOUR STRING', 900);
    rivalBrain.openCounter(COMBO_BREAK.counterSec);   // it escapes AND strikes back
    console.info('[DL-STORM] rival combo break');
  }

  /** IMPROVE (2026-10-06): the defender's one-beat guard states, per fighter (re-armed so a second parry plays again). */
  function beatParry(me: boolean): void {
    if (me) { parryFlash = DUEL.parrySec; meAnim.clearBeat('parry_flash'); } else { foeParryFlash = DUEL.parrySec; foeAnim.clearBeat('parry_flash'); }
  }
  function beatGuardImpact(me: boolean): void {
    if (me) { giFlash = DUEL.impactSec; meAnim.clearBeat('guard_impact'); } else { foeGiFlash = DUEL.impactSec; foeAnim.clearBeat('guard_impact'); }
  }
  /** IMPROVE (2026-10-06): a hit reaction on ONE fighter's own timer. */
  function hitReact(me: boolean, w: CombatMove['weight']): void {
    if (me) { meHitBy = w; meHitT = DUEL.reactSec; } else { foeHitBy = w; foeHitT = DUEL.reactSec; }
  }
  function tickBeats(dt: number): void {
    meHitT = Math.max(0, meHitT - dt); if (meHitT === 0) meHitBy = null;
    foeHitT = Math.max(0, foeHitT - dt); if (foeHitT === 0) foeHitBy = null;
    parryFlash = Math.max(0, parryFlash - dt); giFlash = Math.max(0, giFlash - dt);
    foeParryFlash = Math.max(0, foeParryFlash - dt); foeGiFlash = Math.max(0, foeGiFlash - dt);
  }

  /** The round's verdict. IMPROVE (2026-10-06): the KO pause is a phase on the GAME clock (update() moves on after it — it
   *  was a 2000 ms setTimeout that a pause did not hold and a dispose did not cancel), and the bodies show it through
   *  their trees: the loser `out` (ko → the floor hold), the winner `celebrating`. */
  function endRound(ctx: ModeContext, playerWon: boolean, label: string, how: 'ko' | 'ringout' | 'time'): void {
    if (phase !== 'fighting') return;
    setPhase('roundOver');
    if (playerWon) { myWins++; if (how === 'ringout') ringOutWins++; } else foeWins++;
    rivalWonLast = !playerWon;
    SoundKit.play(playerWon ? 'crowdCheer' : 'crowdGroan');
    if (playerWon) roundWinBeat(ctx);
    meOut = !playerWon; foeOut = playerWon;
    meMove.vel.setAll(0); foeMove.vel.setAll(0); foeUlt.clear();
    banner(ctx, `${label} — ROUND ${round}`, DUEL.roundOverSec * 1000);
  }

  /** After the KO pause: the match's end, or the next round. */
  function afterRound(ctx: ModeContext): void {
    if (myWins >= ROUNDS_TO_WIN || foeWins >= ROUNDS_TO_WIN) {
      setPhase('matchOver');
      SoundKit.play('whistle');
      const won = myWins >= ROUNDS_TO_WIN;
      if (won) matchPunch(ctx);
      // IMPROVE (2026-10-06): the result pays a ring-out round and each guard impact on top of the rounds (duelRules)
      const score = duelScore({ myWins, foeWins, ringOutWins, guardImpacts });
      ctx.end(won ? 'DUEL_WON' : 'DUEL_LOST', score, { foeWins, wins: myWins, ringOuts: ringOutWins, guardImpacts, weapon: myWeapon as string } as never);
      return;
    }
    round++;
    startRound(ctx);
  }

  /** IMPROVE (2026-10-06): the player's weapon, its styled moveset and its ids built ONCE here (not per press). */
  function setMyWeapon(ctx: ModeContext, w: DuelWeapon): void {
    myWeapon = w; myMoves = styled(w); myMoveIds = Object.keys(myMoves);
    meStrike.swapMoveset(myMoves);
    showWeapons(ctx);
  }
  /** IMPROVE (2026-10-06): the rival's weapon for a round — its moveset, its brain, the prop in its hand. */
  function setFoeWeapon(ctx: ModeContext, w: DuelWeapon): void {
    if (w === foeWeapon) return;
    foeWeapon = w;
    foeStrike.swapMoveset(RIVAL_MOVESET[w]());
    rivalBrain = brainFor(w);
    showWeapons(ctx);
  }

  /** IMPROVE (2026-10-06): the first frame of play — the start-up screen's weapon, read NOW (its picker is still offered on
   *  READY, after load), and the in-round pick only when the screen did not make one. It used to read the screen's pick
   *  and then force a 20 s weapon phase anyway. */
  function beginPlay(ctx: ModeContext): void {
    const picked = DUEL_WEAPONS.find((w) => w === weaponPicked()) ?? null;
    setMyWeapon(ctx, picked ?? myWeapon);
    if (picked) { console.info(`[DUEL] weapon from the start-up screen: ${picked}`); startMatch(ctx); return; }
    setPhase('weaponSelect');
    banner(ctx, 'CHOOSE YOUR WEAPON — A FISTS · B BLADE · Y STAFF', Infinity);
  }

  function startMatch(ctx: ModeContext): void {
    round = 1; myWins = 0; foeWins = 0; matchLatch = false; heavyAt = 0;
    ringOutWins = 0; guardImpacts = 0; lastFoeWeapon = null; rivalWonLast = false;
    startRound(ctx);
  }

  /** A round's start — everything reset, the fighters on their marks, the rival's weapon for this round, then the beat:
   *  "ROUND n" for READY, then FIGHT! (update()). */
  function startRound(ctx: ModeContext): void {
    meState.resetRound(); foeState.resetRound(); xBtn.reset(); padGuard.reset(); guardUp = false; book.reset(); stringLabels = []; deferred.clear(); ledger.reset(); bodyShift = null; focus.stop(); focusHeld = false; rival.animator.setTimeScale(1); player.animator.setTimeScale(1); ctx.juice.tint(null);
    // IMPROVE (2026-10-06): nothing of the last round carries in — the beats, the verdict, the rival's armed edge, its guard
    meDef.releaseBlock(); foeDef.releaseBlock(); foeLaunchedSec = 0; foeUlt.clear(); foeSubstituted = 0; foeFullCalled = false;
    meHitT = 0; foeHitT = 0; meHitBy = null; foeHitBy = null; parryFlash = 0; giFlash = 0; foeParryFlash = 0; foeGiFlash = 0;
    meOut = false; foeOut = false; meAnim.reset(); foeAnim.reset();
    // SHARED-PLACE-FLOOR (feet on floor): the round reset put both fighters at y 0 — 12 cm INSIDE the raised disc they spawn on
    player.root.position.set(0, DISC_LIFT, 2.4); rival.root.position.set(0, DISC_LIFT, -2.4);
    player.root.rotation.y = Math.PI; rival.root.rotation.y = 0;
    meMove.vel.setAll(0); foeMove.vel.setAll(0);
    // IMPROVE (2026-10-06): the rival counter-picks your weapon, and changes it when it loses a round (duelRules) — it held
    // the staff every round, whatever you brought
    const fw = rivalWeaponFor(round, myWeapon, lastFoeWeapon, rivalWonLast);
    setFoeWeapon(ctx, fw); lastFoeWeapon = fw;
    roundStartRival();
    setPhase('ready');
    banner(ctx, `${roundCall(round, ROUNDS_TO_WIN)} — ${WEAPON_TAG[myWeapon]} vs ${WEAPON_TAG[fw]}`, Infinity);
    SoundKit.play('whoosh', { pitch: 0.7, volume: 0.35 });
  }
  function fight(ctx: ModeContext): void {
    setPhase('fighting');
    banner(ctx, 'FIGHT!', 600);
    SoundKit.play('whistle', { volume: 0.5 });
    ctx.feel?.impact?.(0.25);
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

  // ── IMPROVE (2026-10-06): the posture feed, built once (it was a closure recreated every frame), on plain numbers ──
  function feedBio(bio: CombatPostureInput, mv: CombatMovement, st: FighterState, df: DefenseController, str: StrikeController, hb: typeof meHitBy, yaw: number, foeC: SpawnedCharacter, selfC: SpawnedCharacter, parrying: boolean, impact: boolean, celebrating: boolean): void {
    const dx = foeC.root.position.x - selfC.root.position.x, dz = foeC.root.position.z - selfC.root.position.z, d = Math.hypot(dx, dz);
    const closing = d > 1e-3 ? (mv.vel.x * dx + mv.vel.z * dz) / d : 0;
    bio.speed01 = Math.min(1, Math.hypot(mv.vel.x, mv.vel.z) / 6.4); bio.strafe = strafeAxis(mv.vel, yaw); bio.approach = combatApproach(closing);
    bio.striking = str.current?.move.weight ?? null; bio.windingUp = false;
    bio.blocking = df.blocking; bio.parrying = parrying; bio.guardImpact = impact;
    bio.hitBy = hb; bio.down = st.staggerSec > 0.8; bio.out = st.hp <= 0;
    bio.rising = false; bio.dodging = false; bio.celebrating = celebrating; bio.engaged = phase === 'fighting';
  }

  /** The animation trees and the posture bios, in EVERY phase (IMPROVE 2026-10-06): the round's end goes through the trees
   *  — the loser's ko holds the floor, the winner celebrates — and each fighter's parry / guard impact flash reaches them. */
  function animate(dt: number): void {
    const verdict = phase === 'roundOver' || phase === 'matchOver';
    meAnim.update({
      speed01: meMove.vel.length() / 6.4, dashing: false, hasWeapon: myWeapon !== 'fists',
      striking: meStrike.current?.move.weight ?? null,
      blocking: meDef.blocking, parryFlash: parryFlash > 0, guardImpactFlash: giFlash > 0,
      hitBy: meHitBy, down: meState.staggerSec > 0.8, out: meState.hp <= 0 || meOut, ulting: false,
      celebrating: verdict && foeOut,
    });
    foeAnim.update({
      speed01: foeMove.vel.length() / 6.4, dashing: false, hasWeapon: foeWeapon !== 'fists',
      striking: foeStrike.current?.move.weight ?? null,
      blocking: foeDef.blocking, parryFlash: foeParryFlash > 0, guardImpactFlash: foeGiFlash > 0,
      hitBy: foeHitBy, down: foeState.staggerSec > 0.8, out: foeState.hp <= 0 || foeOut, ulting: false,
      celebrating: verdict && meOut,
    });
    // the posture bios, resolved in each fighter's OWN frame so a backstep and a circle read differently
    // rather than being the same world-space number
    const meYaw = player.root.rotation.y, foeYaw = rival.root.rotation.y;
    meMotion.update(meMove.vel.x, meMove.vel.z, meYaw, dt);
    foeMotion.update(foeMove.vel.x, foeMove.vel.z, foeYaw, dt);
    feedBio(meBio, meMove, meState, meDef, meStrike, meHitBy, meYaw, rival, player, parryFlash > 0, giFlash > 0, verdict && foeOut);
    feedBio(foeBio, foeMove, foeState, foeDef, foeStrike, foeHitBy, foeYaw, player, rival, foeParryFlash > 0, foeGiFlash > 0, verdict && meOut);
  }

  // ── IMPROVE (2026-10-06): the HUD is pushed only where a value changed (four fields went out every frame). The round
  // clock and the edge call are fields of their own: the edge warning used to overwrite the controls hint and never clear.
  const hudSent: Record<string, string | number> = {};
  let hudPatch: Record<string, string | number> | null = null;
  function hudPut(k: string, v: string | number): void { if (hudSent[k] !== v) { hudSent[k] = v; (hudPatch ??= {})[k] = v; } }
  function pushHud(ctx: ModeContext): void {
    hudPut('hp', Math.ceil(meState.hp)); hudPut('foeHp', Math.ceil(foeState.hp));
    hudPut('guard', Math.round(meState.guard)); hudPut('foeGuard', Math.round(foeState.guard));
    hudPut('foeChi', Math.round(foeState.chi));
    hudPut('wins', myWins); hudPut('foeWins', foeWins); hudPut('round', `${round}`);
    const live = phase === 'fighting';
    hudPut('timeLeft', live ? Math.max(0, Math.ceil(DUEL.roundSec - phaseSec)) : phase === 'ready' ? DUEL.roundSec : (hudSent.timeLeft ?? DUEL.roundSec));
    hudPut('edge', live && arena.edge === 'drop' ? edgeCall(insideBy(player.root.position, arena.shape), insideBy(rival.root.position, arena.shape)) : '');
    if (hudPatch) { ctx.setHud(hudPatch); hudPatch = null; }
  }
  function camera(ctx: ModeContext, dt: number): void {
    ctx.camDirector.look(lookX, lookY, dt);
    ctx.camDirector.update(player.root.position, meMove.vel, rival.root.position);
  }

  /** The fists' string direction: the stick toward (f), away from (b) or neither (n), read against the rival. */
  function stickDirToFoe(ctx: ModeContext): StickDir {
    if (Math.hypot(stickX, stickY) < 0.35) return 'n';
    const w = wish(ctx);
    const tx = rival.root.position.x - player.root.position.x, tz = rival.root.position.z - player.root.position.z;
    const d = (w.x * tx + w.z * tz) / Math.max(1e-3, Math.hypot(tx, tz) * Math.hypot(w.x, w.z));
    return d > 0.4 ? 'f' : d < -0.4 ? 'b' : 'n';
  }

  /** The rival's turn: the shared brain approaches, picks from the whole moveset, and spends chi (IMPROVE 2026-10-06: a
   *  real dash, an edge-safe substitution with its effect and whiff beat, and the CRITICAL EDGE). */
  function rivalTurn(ctx: ModeContext, sdtRoom: number): void {
    if (!(foeState.controllable && !foeStrike.busy)) { foeMove.updateWithSelf(sdtRoom, 0, 0, false, rival.root.position); return; }
    // (NERVE: set once per round in roundStartRival — IMPROVE 2026-10-06)
    const meWinding = !!meStrike.current && meStrike.current.phase === 'startup';
    const incoming = meWinding && meStrike.current ? meStrike.current.secToActive : -1;
    const dist = Vector3.Distance(rival.root.position, player.root.position);
    const reach = meStrike.current?.move.atk.range ?? WEAPON_RANGE[foeWeapon];
    // IMPROVE (2026-10-06): the rival reads my openings (a whiff's recovery, a step, a roll) and its own sub cooldown
    const meOpen = meStrike.current?.phase === 'recovery' || meMove.dashing || meMove.rolling;
    foeRes.value = foeState.chi; foeRes.subReady = foeDef.canSubstitute(foeState.chi, now());
    const decision = rivalBrain.decide(
      sdtRoom, rival.root.position, player.root.position, foeState, meWinding,
      foeRes, threatLandsIn(dist, reach, incoming < 0 ? null : incoming), meOpen,
    );
    // the brain's wish as orbit / radial around me — plain numbers (IMPROVE 2026-10-06: it was four Vector3s a frame)
    const tx = player.root.position.x - rival.root.position.x, tz = player.root.position.z - rival.root.position.z, td = Math.hypot(tx, tz);
    const dx = td > 0.05 ? tx / td : 0, dz = td > 0.05 ? tz / td : 1;
    const wx = decision.moveX, wz = -decision.moveY;
    const radial = wx * dx + wz * dz, orbit = wx * -dz + wz * dx;
    foeMove.updateWithSelf(sdtRoom, orbit, radial, false, rival.root.position);
    // IMPROVE (2026-10-06): the dash is CombatMovement's own burst at me (it was a 2.2 m position jump); chi only if it goes
    if (decision.spend === 'dash' && foeState.chi >= DUEL.rivalDashChi && foeMove.dash(dx, dz)) {
      foeState.chi -= DUEL.rivalDashChi;
      SoundKit.play('whoosh', { pitch: 1.3, volume: 0.4 });
      console.info('[DL-STORM] rival dash');
    }
    const thrown = decision.attackId ? foeStrike.request(decision.attackId, now()) : false;
    // IMPROVE (2026-10-06): the full bar rides the heavy the brain throws for it — the CRITICAL EDGE (resolveActive). It
    // used to zero the bar and nothing else.
    if (decision.spend === 'ultimate' && thrown && foeStrike.current && foeState.chi >= CHI_MAX) {
      foeState.chi = 0;
      foeUlt.arm(foeStrike.current);
      ctx.juice.flash('#ff3344', 90); ctx.juice.callout('RIVAL CRITICAL EDGE!', '#ff4d5e', 500);
      SoundKit.play('powerUp', { pitch: 0.45, volume: 0.6 });
      console.info('[DL-STORM] rival critical edge armed');
    }
    if (decision.spend === 'substitution' && foeState.chi >= SUBSTITUTION_CHI_COST) {
      // IMPROVE (2026-10-06): never onto a spot past the drop (behind me, else beside me, else not at all)
      const spot = safeSubstitutionSpot(player.root.position.x, player.root.position.z, player.root.rotation.y, edgeIn);
      if (spot) {
        foeState.chi -= SUBSTITUTION_CHI_COST;
        foeDef.spendSubstitution(now());   // IMPROVE (2026-10-06): the rival's substitution has a cooldown and a punish window
        knock.cancel(rival.root.position);
        rival.root.position.set(spot.x, rival.root.position.y, spot.z);
        // seen and heard, like Showdown's — it was a silent teleport — and the swing it read finds nobody
        foeSubstituted = now() + DUEL.subWhiffMs;
        SoundKit.play('whoosh', { pitch: 1.8, volume: 0.6 });
        EffectsKit.burst(ctx.scene, new Vector3(spot.x, rival.root.position.y + 1.2, spot.z), 'glitch');
        ctx.camDirector.pulse(0.4, 0.35);
        banner(ctx, 'RIVAL SUBSTITUTED — BEHIND YOU!', 800);
        console.info('[DL-STORM] rival substitution');
      } else console.info('[DL-STORM] rival substitution refused — no footing behind or beside you');
    }
    if (decision.block && !foeState.blockHeld) {
      // IMPROVE (2026-10-06): the brain says block / parry / guard impact; the press is stamped for it (was always now − 200)
      const at = guardPressMs(now(), decision.guard, incoming >= 0 ? incoming * 1000 : null);
      foeDef.pressBlock(at, decision.guard === 'impact'); foeState.pressBlock(at); foeGuardUntil = now() + 600;
    }
    if (!decision.block && foeState.blockHeld && now() > foeGuardUntil) { foeDef.releaseBlock(); foeState.releaseBlock(); }
  }

  return {
    modeId: 'duel', mood: 'dojoWarm', camPreset: 'duel',  // Phase 9: side-on disc framing
    // MOVEMENT PLAY P7: the body plays the duel only behind its flag (read at mount — the dev probe's ?bodyfight=duel)
    get body() { return bodyFightOn('duel') ? { claims: FIGHT_CLAIMS, lines: FIGHT_CARD_LINES } : undefined; },
    get onBody() { return bodyFightOn('duel') ? onBodyEvent : undefined; },

    async load(ctx: ModeContext) {
      // A ROOM TO FIGHT IN (2026-09-13). Phase 0 measured this mode at SIXTEEN visible meshes — the sparsest
      // world in the roster against dunk's 174 — and the reason was simply that it mounted no venue at all:
      // a disc and a rim floating in front of a backdrop. Its two sibling combat modes (Showdown and Karate
      // VS) have always mounted the dojo with a kit fallback; Duel was the one that never got the line. Same
      // spec, same fallback, so the three combat modes are finally the same room.
      arena = readCombatArena('duel');
      console.info(`[ARENA] duel · ${describeArena(arena)}`);
      modeVenue = mountVenue(ctx, 'karate_h2h', { keepGameplayCamera: true, arena });
      if (!modeVenue) VenueKit.buildDojo(ctx.scene);
      // the platform, its rim, the pit under it, and any walls: the shared arena builder's (combat/arenaBuild.ts). It is
      // raised DISC_LIFT proud of the venue floor — a platform coplanar with the floor photographed as z-fighting blotches.
      // IMPROVE (2026-10-06): the hidden `duel_disc` cylinder this used to keep under it "for the probes" is gone — nothing
      // read it, it was never shown, and its material was never disposed.
      arenaHandle?.dispose(); arenaHandle = buildArena(ctx.scene, arena, { lift: DISC_LIFT });

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
      // what the start-up screen chose, if it is one this mode offers (the gauntlet is not a duel weapon) — read again on the
      // first frame of play (beginPlay), because the screen's picker is still offered on READY
      myWeapon = DUEL_WEAPONS.find((w) => w === readWeapon().id) ?? 'fists';
      ctxRef = ctx;   // P7
      myMoves = styled(myWeapon); myMoveIds = Object.keys(myMoves);
      meStrike = new StrikeController(myMoves);
      foeStrike = new StrikeController(RIVAL_MOVESET[foeWeapon]());   // the rival fights unstyled
      rivalBrain = brainFor(foeWeapon);
      showWeapons(ctx);
      // phase 6 seam: seconds until the rival's swing lands (−1 = nothing in flight) — the probe's perfect driver reads it
      (ctx.scene.metadata ??= {}).fight = { landsIn: () => { const c = foeStrike.current; return c && c.phase === 'startup' ? c.secToActive : -1; } };
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
      setPhase('intro');
      // IMPROVE (2026-10-06): ONE static controls line (DUEL_HINT); the weapon pick, when it is needed, is a banner
      ctx.setHud({ hint: DUEL_HINT });
      pushHud(ctx);
    },

    onInput(ctx: ModeContext, e: FelInput) {
      SoundKit.unlock();
      if (e.t === 'stick' && e.side === 'L') { stickX = e.x; stickY = e.y; }
      if (e.t === 'stick' && e.side === 'R') { lookX = e.x; lookY = e.y; }
      if (e.t === 'trigger' && e.side === 'R') focusHeld = e.value > 0.35;   // phase 8: MATRIX FOCUS   // MODE-STICK-FACE: R stick → the director's look orbit
      // P7: who is driving — a real press or push is the pad's
      if (e.src !== 'body' && ((e.t === 'button' && e.pressed) || (e.t === 'stick' && Math.hypot(e.x, e.y) > 0.35))) drive.pad(now());
      if (e.t !== 'button') return;
      // phase 3: the X RELEASE is the dash / the guard coming down — it has to be read before the pressed-only gate below
      if (e.btn === 'X' && !e.pressed) {
        const g = xBtn.release(now() / 1000);
        padGuard.release(now());
        if ((guardUp || g === 'held') && !bodyGuard) { meDef.releaseBlock(); meState.releaseBlock(); guardUp = false; }   // (P7: a body guard still up keeps the block)
        if (g === 'tap' || g === 'double') {
          const tx = rival.root.position.x - player.root.position.x, tz = rival.root.position.z - player.root.position.z;
          const w = wish(ctx);
          const useStick = g === 'tap' && Math.hypot(w.x, w.z) > 0.25;
          const toward = tx * tx + tz * tz > 1e-4;
          const dx = useStick || !toward ? w.x : tx, dz = useStick || !toward ? w.z : tz;
          if (meState.controllable && meMove.dash(dx, dz, g === 'double')) { SoundKit.play('whoosh', { pitch: g === 'double' ? 1.35 : 1.2, volume: 0.45 }); console.info(`[DL-STORM] ${g === 'double' ? 'closing step' : 'step'}`); }
        }
      }
      if (!e.pressed) return;

      if (phase === 'weaponSelect') {
        if (e.btn === 'A') setMyWeapon(ctx, 'fists');
        else if (e.btn === 'B') setMyWeapon(ctx, 'blade');
        else if (e.btn === 'Y') setMyWeapon(ctx, 'staff');
        else { refuse(ctx, 'PICK A WEAPON — A FISTS · B BLADE · Y STAFF'); return; }
        startMatch(ctx);   // IMPROVE (2026-10-06): the round's READY beat is the gap now (it was a 900 ms setTimeout)
        return;
      }
      // SCORECARD CONTROLS (2026-09-15): 5 of 40 presses were swallowed here — a swing or a guard thrown between rounds,
      // through the verdict, or while the body is still not yours. The recovery case below already says RECOVERING;
      // these two are the same rule at a bigger scale, so they say it too.
      if (phase !== 'fighting' || !meState.controllable) {
        refuse(ctx, phase !== 'fighting' ? 'BETWEEN ROUNDS' : 'NOT YOUR BODY YET');
        return;
      }

      const whooshPitch = WHOOSH_PITCH[myWeapon];
      const trySwing = (id: string) => {
        if (meStrike.request(id, now())) SoundKit.play('whoosh', { pitch: whooshPitch, volume: 0.4 });
        else refuse(ctx, 'RECOVERING');   // MECHANICS PASS: a swing refused mid-recovery is said, not swallowed
      };
      if (myWeapon === 'fists') {
        // phase 4: empty hands read the Storm book — the string picks the link (jab → cross → rising dragon…)
        const key = e.btn === 'A' ? 'jab' : e.btn === 'B' ? 'kick' : e.btn === 'Y' ? 'heavy' : null;
        if (key) {
          const mv = book.press(BTN_OF[key], stickDirToFoe(ctx), now() / 1000, { afterDash: meMove.dashing, air: foeLaunchedSec > 0 }); const ok = meStrike.request(mv.id, now()); if (ok) { SoundKit.play('whoosh', { pitch: whooshPitch, volume: 0.4 }); console.info(`[DL-STORM] link ${mv.id} string ${book.history.length}`); stringLabels.push(mv.label); if (mv.ender || book.history.length === 0) { const call = stringLabels.join(' → '); stringLabels = []; if (call.includes('→')) banner(ctx, `COMBO: ${call}`, 900); } } else refuse(ctx, 'RECOVERING'); return;   // phase 9: the string is named
        }
      }
      const moveIds = myWeapon === 'fists' ? FIST_IDS : myMoveIds;
      if (e.btn === 'A') trySwing(moveIds[0]);
      if (e.btn === 'B') trySwing(moveIds[1]);
      if (e.btn === 'Y') trySwing(moveIds[2]);
      if (e.btn === 'X' && e.pressed) {
        // STORM X (phase 3): a flick TOWARD the rival on the press is the guard impact (the read lives on the press); else the
        // block waits for the HOLD and a release inside DASH.tapSec is the step — doubled, the closing step at the rival
        xBtn.press(now() / 1000);
        const w = wish(ctx);
        const flick = (w.x * (rival.root.position.x - player.root.position.x) + w.z * (rival.root.position.z - player.root.position.z)) > 0.3;
        if (flick) { meDef.pressBlock(now(), true); meState.pressBlock(now()); padGuard.press(now()); guardUp = true; SoundKit.play('impact', { pitch: 1.6, volume: 0.18 }); ctx.juice.callout('GUARD IMPACT…', '#ffd75e', 450); }
      }
    },

    update(ctx: ModeContext, dt: number) {
      phaseSec += dt;
      clock += dt;   // IMPROVE (2026-10-06): the mode's game clock (banners)
      ctxRef = ctx;
      { const b = bannerSlot.tick(clock); if (b !== null) ctx.setHud({ banner: b }); }
      { const bv = ctx.body?.(); if (bv) bodyLedgerFrame(bv, now()); deferred.flush(ledger, now()); }   // P7: the body's deferred hits
      // IMPROVE (2026-10-06): the phase beats on the game clock — the weapon on the first frame of play, FIGHT! after the
      // round-start beat, the next round (or the result) after the KO pause
      if (phase === 'intro') { beginPlay(ctx); return; }
      if (phase === 'ready' && phaseSec >= DUEL.readySec) fight(ctx);
      else if (phase === 'roundOver' && phaseSec >= DUEL.roundOverSec) { afterRound(ctx); return; }
      // phase 8 — MATRIX FOCUS: the trigger holds bullet time — the rival on the room's clock (his animator, brain, swings,
      // movement), me on mine. `sdtRoom` / `sdtHero` below are the two clocks; nothing else in this update reads `dt` for a body.
      const wasFocus = focus.active;
      if (focusHeld && !focus.active && phase === 'fighting') { if (focus.start()) { ctx.juice.tint('rgba(16, 70, 34, 0.75)'); ctx.camDirector.pulse(0.45, 0.35); SoundKit.play('whoosh', { pitch: 0.7, volume: 0.5 }); console.info(`[MATRIX] dl focus on at ${Math.round(focus.value)}`); } }
      else if (!focusHeld && focus.active) focus.stop();
      if (focus.tick(dt) || (wasFocus && !focus.active)) { ctx.juice.tint(null); SoundKit.play('whoosh', { pitch: 0.6, volume: 0.4 }); console.info(`[MATRIX] dl focus off after ${focus.heldSec.toFixed(2)} s`); }
      if (wasFocus !== focus.active) { rival.animator.setTimeScale(focus.worldScale); player.animator.setTimeScale(focus.heroScale); }
      { const fv = Math.round(focus.value); if (fv !== focusHud || focus.active !== focusHudOn) { focusHud = fv; focusHudOn = focus.active; ctx.setHud({ focus: fv, focusOn: focus.active }); } }
      const sdtRoom = dt * focus.worldScale, sdtHero = dt * focus.heroScale;
      knock.tick(sdtRoom);   // IMPROVE (2026-10-06): knockback on the room clock, every phase (a KO's slide finishes)
      // phase 5 (IMPROVE 2026-10-06: the landing is ON the raised platform, DISC_LIFT — it was y 0, 12 cm inside it)
      if (foeLaunchedSec > 0) { foeLaunchedSec = Math.max(0, foeLaunchedSec - dt); rival.root.position.y = DISC_LIFT + launchHeight(1 - foeLaunchedSec / LAUNCH_AIR_SEC); if (foeLaunchedSec === 0) rival.root.position.y = DISC_LIFT; }
      if (!padGuard.held && xBtn.guardHeld(now() / 1000) && meState.controllable) { padGuard.press(now()); if (!guardUp) { guardUp = true; meDef.pressBlock(now(), false); meState.pressBlock(now()); SoundKit.play('impact', { pitch: 1.3, volume: 0.18 }); } }   // phase 3: the hold is the guard (P7: the pad's, apart from a body guard already up)
      if (phaseSec > BUDGET_SEC[phase]) {
        if (phase === 'fighting') endRound(ctx, meState.hp >= foeState.hp, 'TIME', 'time');   // the round clock's bell (the HUD shows it now)
        else if (phase === 'weaponSelect') startMatch(ctx);   // nothing pressed: the weapon in hand
        else if (phase === 'ready') fight(ctx);
        else if (phase === 'roundOver') afterRound(ctx);
        return;
      }
      tickBeats(dt);   // IMPROVE (2026-10-06): each fighter's reaction and guard flashes on its own timer
      if (phase !== 'fighting') {
        // the weapon pick, READY and the verdict: nobody acts; the trees still run — the KO'd body holds the floor and the
        // winner celebrates (IMPROVE 2026-10-06)
        animate(dt); pushHud(ctx); camera(ctx, dt);
        return;
      }

      meState.tick(sdtHero); foeState.tick(sdtRoom);   // phase 8: a clock per rig

      // 8-way movement (both fighters orbit the disc)
      if (meState.controllable && !meStrike.busy && !meDef.blocking) {
        meMove.updateWithSelf(dt, stickX, stickY, false, player.root.position, wish(ctx));
      } else {
        meMove.updateWithSelf(dt, 0, 0, false, player.root.position);
      }
      player.root.position.addInPlaceFromFloats(meMove.vel.x * dt, meMove.vel.y * dt, meMove.vel.z * dt);   // (no Vector3 per frame)
      // P7 AUTO-SPACING: a body player has no stick — a step in / out / across moves the fighter (the disc's edge is still
      // the edge: checkRingOut below); a stick past its dead zone always wins
      if (bodyShift) {
        if (Math.hypot(stickX, stickY) > 0.35 || !meState.controllable) bodyShift = null;
        else { const step = Math.min(dt, bodyShift.left); player.root.position.addInPlaceFromFloats(bodyShift.v.x * step, bodyShift.v.y * step, bodyShift.v.z * step); bodyShift.left -= step; if (bodyShift.left <= 0) bodyShift = null; }
      }

      // rival AI
      if (foeState.chi >= CHI_MAX) { if (!foeFullCalled) { foeFullCalled = true; ctx.juice.callout('RIVAL CHI FULL', '#ff4d5e', 700); } }   // IMPROVE (2026-10-06): the tell before its critical edge
      else foeFullCalled = false;
      rivalTurn(ctx, sdtRoom);
      // IMPROVE (2026-10-06): the rival's OWN step never takes it over a drop (Mixed's "never step off" rule) — only a
      // blow sends it over; the knock slide is not this step, so a ring-out still lands
      const foeInBefore = arena.edge === 'drop' ? insideBy(rival.root.position, arena.shape) : Infinity;
      rival.root.position.addInPlaceFromFloats(foeMove.vel.x * sdtRoom, foeMove.vel.y * sdtRoom, foeMove.vel.z * sdtRoom);
      if (arena.edge === 'drop' && holdFromEdge(rival.root.position, foeInBefore, arena.shape)) foeMove.vel.setAll(0);

      // strike resolution at active-frame open
      breaker.track(dt, meStrike.current);   // COMBAT DIFFICULTY (2026-10-06): the links of my string (ComboBreaker)
      if (meStrike.update(dt, now()).startedActive) {
        // IMPROVE (2026-10-06): the rival's substitution beat — my swing in flight finds nobody (Showdown's rule)
        if (now() < foeSubstituted) { meStrike.current?.consumeHit(); banner(ctx, 'THEY SUBSTITUTED!', 500); }
        else resolveActive(ctx, true);
      }
      if (foeStrike.update(sdtRoom, now()).startedActive) resolveActive(ctx, false);
      foeUlt.sync(foeStrike.current);   // an armed swing that ended unresolved carries nothing on
      if (phase === 'fighting') checkRingOut(ctx);

      animate(dt);
      pushHud(ctx);
      camera(ctx, dt);
    },

    dispose() {
      // IMPROVE (2026-10-06): nothing waits on a disposed rig — the slides, the banner and the armed edge go with the mode
      knock.clear(); bannerSlot.clear(); foeUlt.clear();
      modeVenue?.dispose?.(); modeVenue = null;
      arenaHandle?.dispose(); arenaHandle = null;
      // the props are parented to a hand bone, so disposing the character takes them — but they are also
      // rebuilt on every weapon change, and a stale one left behind would ride the next round's rig
      myProp?.dispose(); myProp = null;
      foeProp?.dispose(); foeProp = null;
      mePosture?.dispose(); foePosture?.dispose(); mePosture = null; foePosture = null;
      player?.dispose(); rival?.dispose(); SoundKit.stopAmbient();
    },
  };
})();
