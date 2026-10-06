// AirSessionMode — the Babylon face of the shared AirSessionCore.
//
// Gymnastics (vault) and Big Air (snowboard) are the SAME mechanic wearing
// different skins: cadence run-up → launch → mid-air rotation → stick the
// landing. lib/feel/cores/air-session-core.ts already owns all of it, and the
// react-three-fiber / 2D surfaces that shipped before "owned NO physics" — they
// just drew the core's state. This is the same deal in Babylon, so both modes
// port by swapping the renderer and keeping every tuned constant untouched.
//
// One factory, two modes, never forked — the convention makeTimingHost and
// makeBoardHost already established in this codebase.
//
// The core even reports a genuine 3D position (pos.x/y/z). The old surfaces
// flattened that to 2D; here it drives the athlete directly.

import { Axis, MeshBuilder, Vector3 } from '@babylonjs/core';
import type { Mesh, Scene } from '@babylonjs/core';
import { CharacterLibrary, type SpawnedCharacter } from '../core/CharacterLibrary';
import { mountPostureLayer } from '../anim/PostureLayer';
import { BOARD_POSTURE, BOARD_LEGS, type BoardWindow } from '../core/BoardPosture';
import { airTrickFor, airPressFor, heldTrickDir, scoreTrick, type BoardTrick } from '../core/BoardTricks';   // boards pass phase 3: the family's trick table on big air
import { ComboChain } from '../core/ComboChain';   // phase 4: the THPS loop — a landed line is a link, a crash burns the pot
import { DEFAULT_HERO_URL } from '../core/athleteRoster';
import { neverBindPose } from '../anim/importSanitizer';
import { installSafePlay } from '../anim/clipRegistry';
import { VenueKit } from '../visual/VenueKit';
import { mountVenueProps, type VenuePropsHandle } from '../visual/VenueProps';
import { Onlookers } from '../visual/Onlookers';
import { refuse } from '../core/Refusal';
import { SoundKit } from '../audio/SoundKit';
import type { AirSessionCore } from '../../feel/cores/air-session-core';
import type { TrickGrade, CadenceSide } from '../../feel';
import type { VenueMood } from '../scene/moods';
import { makeBigAirSession, BIG_AIR_TUNING, BIG_AIR_HILL } from '../../feel/cores/big-air-skin';
import { hillSurface, sweetBand, type AirHill } from '../../feel/cores/air-hill';
import { buildAirHill } from './bigAirHill';
import { BoardTrickLayer } from '../anim/BoardTrickLayer';   // IMPROVE (2026-10-06, item 7): the grab's hand, the cork's tilt
import { EffectsKit } from '../visual/EffectsKit';            // IMPROVE (2026-10-06, item 14): the snowfall
import { AIR_HINT, coachLine, barK, stompState, stompCall, LATE_STOMP_SEC, zoneCall, HANG, apexHang, judgeRead, repeatShare, sheetLine } from './bigAirPlay';
import type { ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import { BoostKit } from '../core/BoostKit';          // FINISH-RELEASE: the shared boost (landings + pads fill it, RB/Shift burns it on the run-in)
import { BoostFx } from '../premium/BoostFx';
import { BoostPads } from '../visual/BoostPads';
import { stepSpeedFov } from '../core/SpeedFov';
import { BoardAnimTree } from '../anim/boardTree';   // boards pass phase 5: the family's one clip owner on big air too
import { airBoardFeed, AIR_LAND_BEAT_SEC, AIR_BAIL_BEAT_SEC } from './airBoardFeed';
import { dressBoard } from '../visual/meshyProps';   // phase 5: a snowboard under the rider (there was none)
// MOVEMENT PLAY P8 (2026-09-26): the run-up from running in place (the steps graded on the camera's clock against a body's
// cadence), a real quarter-turn in the air (the game plants the spin), a hand at the edge (the grab); steps in the Air
// phase are IGNORED (P3's row flipped the spin's direction on every stride a player still jogging took there)
import { RideIntents, BodyStride, rideLines, type RideIntent } from '../core/rideBody';
import { grabTrickFor } from '../core/rideTricks';
import type { BodyView } from '../core/ModeHarness';
import type { BodyEvent } from '@/lib/pose/BodyReader';
import { HudDelta } from './rideHud';   // IMPROVE (2026-10-06, big air item 16): publish only what changed

export interface AirSessionModeOpts {
  modeId: string;
  mood: VenueMood;
  /** Builds the venue. Called once in load(). */
  buildVenue: (scene: Scene) => void;
  propSet?: string;   // ship pass 4: key into visual/venuePropSets.ts
  /** Constructs the skinned core; onLanding is supplied by the factory. */
  makeSession: (onLanding: (g: TrickGrade, rot: number, pts: number) => void) => AirSessionCore;
  /** Attempts before the session ends. */
  attempts: number;
  /** Score that reads as a win at the end. */
  winScore: number;
  /** Cosmetic label for the launch object (vault table / kicker lip). */
  launchLabel: string;
  /** IMPROVE (2026-10-06, Big Air items 1 / 2): the jump the skin's core lands on (its own `hill`) and that core's launchZ —
   *  built as the kicker and the landing from the same table. Unset = the old 0.5 m launch box. */
  hill?: AirHill;
  launchZ?: number;
}

const GRADE_LABEL: Record<TrickGrade, string> = {
  stuck: 'STUCK IT!', clean: 'CLEAN', sketchy: 'SKETCHY', crash: 'CRASH',
};
const GRADE_COLOR: Record<TrickGrade, string> = {
  stuck: '#ffd75e', clean: '#22d3ee', sketchy: '#ff9d5c', crash: '#ef4444',
};
const GRADE_RANK: Record<TrickGrade, number> = { crash: 0, sketchy: 1, clean: 2, stuck: 3 };

/** IMPROVE (2026-10-06, Big Air item 9): a session is won on the total the card posts (rotation points + the banked line). */
export const sessionWon = (postedTotal: number, winScore: number): boolean => postedTotal >= winScore;

export function makeAirSessionMode(opts: AirSessionModeOpts): ModeDefinition {
  // Per-mode closure state. Deliberately NOT module-level: two air-session
  // modes exist, and module state would let gymnastics and big-air overwrite
  // each other's athlete the moment both had been mounted in one session.
  let athlete: SpawnedCharacter | null = null;
  let posture: { dispose(): void } | null = null;
  // phase 5: the tree is the one owner of the rider's clips (the mode used to play sprint / jump_up / idle_stand itself)
  let animTree: BoardAnimTree | null = null;
  let board: import('@babylonjs/core').Mesh | null = null;
  let landBeatT = 0, bailBeatT = 0, lastLanding: 'clean' | 'sketchy' = 'clean', grabThisAir = false, lastCrash = false;
  let props: VenuePropsHandle | null = null; let propsGone = false;
  let core: AirSessionCore | null = null;
  let launchPad: Mesh | null = null;
  let hillMeshes: Mesh[] = [];
  /** What the camera frames the run-up against (the lip), and where the rider's eyes go (the landing). */
  const objective = new Vector3();
  const landingAt = new Vector3(0, 1.5, 14);
  let gallery: Onlookers | null = null;          // L4 — a judged event is watched
  let loadCount = 0;
  let disposeCount = 0;
  /** A+ P0 juice (PM brief CARNIVAL-A-PLUS-P0, 2026-09-07): one crash punch per landing, one finish punch per session. */
  let crashAt = 0;
  let finishLatch = false;
  let boost = new BoostKit();
  let boostFx: BoostFx | null = null;
  let boostPads: BoostPads | null = null;
  let boostHeld = false;
  let baseFov: number | null = null;
  // MOVEMENT PLAY P8: the body's run-up grader, its air verbs, and the spin the game will plant (turns; null = none running)
  const stride = new BodyStride();
  const rideIntents = new RideIntents();
  let plantAt: number | null = null;
  let bodyPhase: string | null = null;   // the core's phase last frame: a new run-up starts the body's stride clean
  let bodySynced = false;   // the body's quarters count from the first frame of play (rideIntents.sync)
  const bodyStats = { strides: 0, perfect: 0, good: 0, off: 0, fault: 0, ignoredInAir: 0, spins: 0, plants: 0, grabs: 0, last: '' };
  // IMPROVE (2026-10-06, big air items 15–18): the per-frame costs. The camera preset is set when the phase CHANGES (each
  // setPreset clears the director's bounds, so calling it every frame re-walked every scene mesh every frame); the HUD
  // publishes only the fields that moved; the camera's velocity and the posture's eye target are scratch vectors; and the
  // gallery behind the lens is put away (Onlookers.cullBehind) on a quarter-second clock.
  const hudOut = new HudDelta();
  let camPhase: string | null = null;
  const camVel = new Vector3();
  const eyeAt = new Vector3();
  const camFwd = new Vector3();
  let galleryCullT = 0;
  // IMPROVE (2026-10-06, Big Air items 4 / 7 / 8 / 11 / 12 / 14): the play layer — the trick layer (hands and tilt), the stomp
  // ring on the predicted touchdown, the B press's distance from it, the apex hang, the wind bed, the speed bar's window
  let trickLayer: BoardTrickLayer | null = null;
  let stompRing: Mesh | null = null;
  let ringMats: { wait: import('@babylonjs/core').Material; now: import('@babylonjs/core').Material } | null = null;
  let ringState: 'wait' | 'now' | null = null;
  let stickLeft: number | null = null;       // B pressed this many seconds before the forecast touchdown (null = not this air)
  let landedAtMs = -1;                       // the last touchdown (performance clock) — a B just after it is LATE
  let lastStomp: 'wait' | 'now' | null = null;
  let prevVy = 0, hangFired = false, slowT = 0;
  let ambientOn = false;
  let band: { lo: number; hi: number; max: number } | null = null;

  /** A clean / stuck landing: a soft shake on top of the scorePop + light feel hit that stay. */
  const landBeat = (ctx: ModeContext, grade: TrickGrade): void => { ctx.juice.shake(0.06, 120); console.info(`[AIR-JUICE] clean land (${grade})`); };
  /** A crash: latched hit-stop + shake + ONE low thud (replaces feel.impact(0.7), whose own thud stacked on the miss cue). */
  const crashPunch = (ctx: ModeContext): void => {
    const t = performance.now(); if (t - crashAt < 300) return; crashAt = t;
    ctx.juice.hitStop(45); ctx.juice.shake(0.10, 140);
    SoundKit.play('impact', { pitch: 0.6, volume: 0.65 });
    console.info('[AIR-JUICE] crash punch');
  };
  /** The session ends on a win (score >= winScore): one gold finish punch. No slowMo. */
  const finishPunch = (ctx: ModeContext): void => {
    if (finishLatch) return; finishLatch = true;
    ctx.juice.hitStop(60); ctx.juice.shake(0.14, 160); ctx.juice.flash('#FFD700', 140);
    console.info('[AIR-JUICE] finish punch');
  };

  const S = {
    attempt: 0,
    score: 0,
    combo: 0,
    best: null as TrickGrade | null,
    nextFoot: 'L' as CadenceSide,
    banner: '',
    bannerT: 0,
    done: false,
    lookX: 0, lookY: 0,   // R stick → camera look (MODE-STICK-FACE family, 2026-09-07)
    stickX: 0, stickY: 0,    // phase 3: the held direction picks the named trick (the board family's grammar)
    named: [] as BoardTrick[],   // the tricks thrown this air, scored on the landing
    note: '', noteT: 0,          // IMPROVE (2026-10-06, items 2 / 11): the landing's word — the hill's, the stomp's
    bonus: 0,                    // points the named tricks earned across the session (the core scores rotation only)
    judgeBest: 0,                // phase 9: the best JUDGES read of the session (0–10)
    chain: new ComboChain(undefined, 'air'),   // phase 4: the run's combo — links across attempts, a crash burns the pot
  };

  const reset = (): void => {
    S.attempt = 0; S.score = 0; S.combo = 0; S.best = null;
    S.nextFoot = 'L'; S.banner = ''; S.bannerT = 0; S.done = false;
    crashAt = 0; finishLatch = false;
    hudOut.reset(); camPhase = null; galleryCullT = 0;   // IMPROVE (2026-10-06): a remount publishes and frames afresh
    S.note = ''; S.noteT = 0; stickLeft = null; landedAtMs = -1; lastStomp = null; prevVy = 0; hangFired = false; slowT = 0; ambientOn = false; ringState = null;
    stride.reset(); rideIntents.reset(); plantAt = null; bodyPhase = null; bodySynced = false;   // MOVEMENT PLAY P8
    Object.assign(bodyStats, { strides: 0, perfect: 0, good: 0, off: 0, fault: 0, ignoredInAir: 0, spins: 0, plants: 0, grabs: 0, last: '' });
  };
  /** The stride's feedback: the d-pad's and a body's step share it. */
  const strideSay = (q: ReturnType<AirSessionCore['runTap']>): void => {
    if (q === 'perfect') { say('PERFECT STRIDE', 0.5); SoundKit.play('uiTick', { pitch: 1.5, volume: 0.4 }); }
    else if (q === 'good' || q === 'first') { say('GOOD', 0.4); SoundKit.play('uiTick', { pitch: 1.15, volume: 0.3 }); }
    else if (q === 'fault') { say('STUMBLE!', 0.6); SoundKit.play('thud', { pitch: 0.8, volume: 0.4 }); }
    else { say('OFF-BEAT', 0.4); SoundKit.play('uiTick', { pitch: 0.7, volume: 0.3 }); }
  };
  /**
   * MOVEMENT PLAY P8: how many turns a spin started now can reach before touchdown — the core's own flight (its variable
   * gravity) simulated forward from here at the spin's rate. The game plants the spin at the biggest half turn inside it
   * (owner call 5's default: "the game finishes them").
   */
  const reachableTurns = (): number => {
    if (!core) return 0;
    // IMPROVE (2026-10-06): the core's own forecast — onto the hill's landing, not down to y 0 (which overstated the air
    // left by the landing slope's height and planted spins the rider could not finish)
    const t = core.predictTouchdown()?.sec ?? 0;
    return Math.abs(core.airTrick.rotation) + (core.airTrick.spinRatePerSec || 0) * t;
  };
  /** MOVEMENT PLAY P8: the body's verbs in the core's Air phase. */
  const bodyVerb = (it: RideIntent): void => {
    if (!core || core.state.phase !== 'Air') return;
    if (it.kind === 'spin') {
      if (core.airTrick.taps > 0 || plantAt !== null) return;   // one body spin an air (a pad's A may still run it)
      // the planted half turn the air can finish (a margin of one frame's spin before touchdown); none fits → no spin
      const target = Math.floor(reachableTurns() * 2 - 0.1) / 2;
      if (target < 0.5) { console.info('[AIR-BODY] quarter-turn, no half turn fits the air left'); return; }
      core.setSpinDir(it.side === 'R' ? 1 : -1);   // turned to the right = frontside (the d-pad's ▶)
      core.trick();
      plantAt = target;
      const t = airTrickFor('snow', it.side === 'R' ? 'right' : 'left', 'A', 1.2);
      if (t && t.kind === 'air' && !S.named.some((n) => n.id === t.id)) { S.named.push(t); if (t.grab !== 'none') grabThisAir = true; }
      say(t?.label ?? 'SPIN', 0.7); SoundKit.play('whoosh', { pitch: 1.2, volume: 0.35 });
      bodyStats.spins++; bodyStats.last = `${it.dir} → ${target} turns`;
      console.info(`[AIR-TRICK] body ${it.dir} quarter (${it.side}) → spin to ${target} turns`);
    } else if (it.kind === 'grab') {
      const t = grabTrickFor('snow', it.hand, it.edge, 1.2);
      if (!t || S.named.some((n) => n.id === t.id)) return;
      S.named.push(t); grabThisAir = true; say(t.label, 0.7);
      trickLayer?.start(t);   // IMPROVE (2026-10-06, item 7): the body's grab gets the hand too
      bodyStats.grabs++; bodyStats.last = t.label;
      console.info(`[AIR-TRICK] body grab ${it.hand}/${it.edge ?? '-'} → ${t.id}`);
    }
  };

  const pushHud = (ctx: ModeContext): void => {
    const st = core?.state;
    const patch = hudOut.diff({
      judge: S.judgeBest > 0 ? S.judgeBest.toFixed(1) : null,   // phase 9: the session's best judge read
      score: (st?.score ?? 0) + S.bonus,   // phase 3: the core's rotation points + the named line
      attempt: `${Math.min((st?.attempt ?? 0) + 1, opts.attempts)}/${opts.attempts}`,
      phase: st?.phase ?? 'Run',
      speed: st ? Number(st.speed.toFixed(1)) : 0,
      height: st ? Number((st.height ?? 0).toFixed(1)) : 0,   // (a decimetre: a centimetre re-rendered the HUD every frame of an air)
      spin: st ? Number((st.spinTurns ?? 0).toFixed(2)) : 0,
      combo: S.combo,
      best: S.best ? GRADE_LABEL[S.best] : null,
      nextFoot: S.nextFoot,
      banner: S.banner || null,
      ...boost.hud(),
      // IMPROVE (2026-10-06, items 5 / 6): the control card the host now draws — X grabs and Y throws the big spins, as the
      // board family maps them (it said nothing of grabs, and Y named a B trick, X a Y trick)
      hint: AIR_HINT,
      ...playHud(),
    });
    if (patch) ctx.setHud(patch);
  };
  /**
   * IMPROVE (2026-10-06, items 4 / 6 / 8 / 11 / 13): the play layer's HUD. The dial and the speed bar read purpose-built
   * gauge fields (RESULTS-TRUTH WA-6 keeps the raw speed / height / spin numbers off the HUD; they stay probe telemetry).
   */
  const playHud = (): Record<string, string | number | null> => {
    const st = core?.state;
    if (!core || !st) return {};
    const air = st.phase === 'Air', land = st.phase === 'Land';
    return {
      coach: coachLine(st.attempt, st.phase, { spinning: core.airTrick.spinning, taps: core.airTrick.taps }, lastStomp === 'now'),
      dialTurns: air ? Number((st.spinTurns ?? 0).toFixed(2)) : land ? Number(st.lastRotations.toFixed(2)) : null,
      dialTol: core.airTrick.cleanTolerance,
      speedK: st.phase === 'Run' && band ? Number(barK(st.speed, band.max).toFixed(2)) : null,
      bandLoK: band ? Number(barK(band.lo, band.max).toFixed(3)) : null,
      bandHiK: band ? Number(barK(band.hi, band.max).toFixed(3)) : null,
      stomp: air ? lastStomp : null,
      note: S.note || null,
      sheet: sheetLine(st.attempts) || null,
    };
  };

  const say = (text: string, sec = 1.2): void => { S.banner = text; S.bannerT = sec; };

  const finish = (ctx: ModeContext): void => {
    if (S.done) return;
    S.done = true;
    S.chain.bank(); S.bonus = S.chain.banked;   // phase 4: the run's open pot banks with the run
    const total = S.score + S.bonus;   // RESULTS-TRUTH WA-5: the HUD total (rotation + banked line) is the one number posted
    // IMPROVE (2026-10-06, Big Air item 9): the win is decided on that SAME number. It checked the rotation points alone
    // (S.score), so a session the card posted at 1,100 could read FINAL OVER against a 900 bar.
    const won = sessionWon(total, opts.winScore);
    if (won) finishPunch(ctx);
    ctx.end(won ? 'win' : 'complete', total, {
      points: total, bestGrade: S.best ? GRADE_RANK[S.best] : 0, attempts: S.attempt, judgeBest: Math.round(S.judgeBest * 10) / 10,
    });
  };

  return {
    modeId: opts.modeId,
    mood: opts.mood,
    camPreset: 'runner',
    // MOVEMENT PLAY P8: the steps are the mode's — the run-up in 'Run', ignored anywhere else (never the spin's direction).
    // The claim takes the P3 row's step → d-pad off the floor (dropping it is the cut line); the card says the run-up, the
    // spin and the grab this mode reads itself
    body: { claims: ['step'], lines: rideLines(opts.modeId, ['step']) },
    onBody(_ctx: ModeContext, ev: BodyEvent, view: BodyView): boolean {
      if (ev.kind !== 'step' || S.done || !core) return false;
      if (core.state.phase !== 'Run') { if (core.state.phase === 'Air') bodyStats.ignoredInAir++; return false; }
      const q = stride.grade(ev, view);
      if (!q) return false;
      const got = core.runTap(ev.foot, q);
      if (got === null) return false;
      S.nextFoot = ev.foot === 'L' ? 'R' : 'L';
      strideSay(got);
      bodyStats.strides++; if (got !== 'first') bodyStats[got]++;
      return true;
    },

    async load(ctx: ModeContext): Promise<void> {
      loadCount += 1;
      reset();

      opts.buildVenue(ctx.scene);
      propsGone = false;
      if (opts.propSet) void mountVenueProps(ctx.scene, opts.propSet, undefined, { snapToGround: true }).then((h) => { if (propsGone) h?.dispose(); else props = h; });   // ship pass 4 · P9: on the ground under them

      // The launch object. IMPROVE (2026-10-06, Big Air items 1 / 2): the comment here said it sat "at the core's own launchZ
      // so the visual and the physics agree by construction" — it was a 0.5 m box at z −12 and the core launched at −60,
      // 48 m later, off bare snow. With a hill the kicker and the landing are built from the core's own table (bigAirHill),
      // so they DO agree by construction; the camera frames the lip and the rider's eyes go to the landing.
      const padMat = VenueKit.paint(ctx.scene, `${opts.modeId}_launchMat`, '#d8c9a8');   // (PBR: the StandardMaterial ratchet)
      hillMeshes.forEach((m) => m.dispose()); hillMeshes = [];
      if (opts.hill && opts.launchZ !== undefined) {
        const snow = VenueKit.paint(ctx.scene, `${opts.modeId}_hillSnow`, '#e3ebf4', 0.08, 0.8);
        const line = VenueKit.paint(ctx.scene, `${opts.modeId}_hillLine`, '#1f6feb', 0.35);
        const built = buildAirHill(ctx.scene, opts.hill, opts.launchZ, snow, line);
        hillMeshes = built.all; launchPad = built.kicker;
        const surf = hillSurface(opts.hill, opts.launchZ);
        objective.set(0, opts.hill.lipY, opts.launchZ);
        const mid = (surf.sweetFromZ + surf.bottomZ) / 2;
        landingAt.set(0, surf.y(mid), mid);
      } else {
        launchPad = MeshBuilder.CreateBox(`${opts.modeId}_launch`, { width: 1.6, height: 0.5, depth: 1.1 }, ctx.scene);
        launchPad.material = padMat;
        launchPad.position.set(0, 0.25, -12);
        objective.copyFrom(launchPad.position);
        landingAt.copyFrom(launchPad.position).addInPlaceFromFloats(0, 0, 14);
      }

      athlete = await CharacterLibrary.spawn(ctx.scene, DEFAULT_HERO_URL, {
        position: new Vector3(0, 0, 0), startClip: 'board_ride_idle', modeId: opts.modeId,   // phase 5: on the board from frame one
      });
      neverBindPose(athlete.animator, 'board_ride_idle');
      animTree = new BoardAnimTree(athlete.animator);
      // phase 5: THE BOARD. The rider had nothing under the feet — the family's rig builder (boardCore.buildRig) puts a
      // 0.84 m plate under the root and dresses it with the baked snowboard scan; the same here, by hand, since this mode
      // has no Rider (the core owns its vertical motion).
      board = MeshBuilder.CreateBox(`${opts.modeId}_board`, { width: 0.26, height: 0.06, depth: 0.84 }, ctx.scene);
      board.parent = athlete.root; board.position.y = 0.03;
      board.material = padMat;   // the dressed scan covers the plate; the plate shares the kicker's material rather than adding one (the StandardMaterial ratchet)
      void dressBoard(board, 'snowboard', 'snow');
      installSafePlay(athlete.animator, opts.modeId);
      ctx.groundLock.track(athlete.root, athlete.skeleton);
      ctx.heroRef.current = athlete.root;

      // THE BODY (2026-09-13). Big Air was the ONE board mode with no posture layer — skate, surf and the
      // slalom all got one; this shares their clips and their problem, and a posture audit across every
      // enabled mode is what turned it up. The board table already has exactly the windows this mechanic
      // needs, because it is the same mechanic: a run-up, an air, a spin, a landing that absorbs.
      //
      // Mapping the core's four phases onto them:
      //   Run  → cruise (tall over the board, eyes up the run — the run-up is not a sprint, it is a set-up)
      //   Air  → spin while the core reports rotation, else air (the spin window deliberately STAYS OUT of
      //          the chest aim: squaring the chest mid-rotation would cancel the rotation, the same rule the
      //          hoops and board spins already carry)
      //   Land → land (chest down over loaded knees, heels DOWN — never a landing on the toes)
      //   Done → idle
      posture?.dispose();
      posture = mountPostureLayer(ctx.scene, athlete.skeleton, athlete.root, () => {
        const st = core?.state ?? null;
        const phase = st?.phase ?? 'Run';
        const spinning = phase === 'Air' && Math.abs(st?.spinTurns ?? 0) > 0.05;
        const w: BoardWindow = phase === 'Air' ? (grabThisAir ? 'grab' : spinning ? 'spin' : 'air')
          : phase === 'Land' ? 'land'
          : phase === 'Run' ? 'cruise' : 'idle';
        const { pose, legs } = { pose: BOARD_POSTURE[w], legs: BOARD_LEGS[w] };
        // eyes on the LANDING, which is what an air is actually about — a rider looking at the sky is a
        // rider who does not know where the snow is
        // the pad is built before the athlete spawns, but the feed runs on its own observable and must not
        // assume the world still exists mid-teardown
        const at = eyeAt.copyFrom(landingAt);
        return { pose, legs, aim: at, eyes: at, window: w };
      }, 'AIR-PP');
      // IMPROVE (2026-10-06, item 7): the board family's trick layer — the grabbing hand on the right edge, the cork's and the
      // rodeo's off-axis tilt — mounted after the posture layer (the hand is the last word). The core owns the spin (yaw).
      trickLayer?.dispose();
      trickLayer = new BoardTrickLayer(ctx.scene, athlete.skeleton, athlete.root, board, { bodySpin: false });

      // Frame the athlete against the thing they are running at.
      ctx.objectiveRef.current = objective;
      // IMPROVE (2026-10-06, item 11): the stomp ring — on the snow where this air will set down, cyan while it falls, gold
      // inside the stick window. IMPROVE (item 14): the snowfall (the wind bed starts on the first played frame: the harness
      // sets the alpine mood's bed to none on the first input, which would stop one started here)
      stompRing?.dispose();
      stompRing = MeshBuilder.CreateTorus(`${opts.modeId}_stompRing`, { diameter: 2.2, thickness: 0.14, tessellation: 40 }, ctx.scene);
      ringMats = { wait: VenueKit.paint(ctx.scene, `${opts.modeId}_ringWait`, '#22d3ee', 1), now: VenueKit.paint(ctx.scene, `${opts.modeId}_ringNow`, '#ffd75e', 1) };
      stompRing.material = ringMats.wait; stompRing.isPickable = false; stompRing.setEnabled(false);
      EffectsKit.ambient(ctx.scene, 'slope');

      core = opts.makeSession((grade, rotations) => {
        trickLayer?.clear();
        if (grade === 'stuck' || grade === 'clean') S.combo += 1; else S.combo = 0;
        // phase 5: the landing on the BODY — the tree's land / sketchy / bail beat, cleared by the clock below
        grabThisAir = false; lastCrash = grade === 'crash';
        if (grade === 'crash') { bailBeatT = AIR_BAIL_BEAT_SEC; landBeatT = 0; } else { lastLanding = grade === 'sketchy' ? 'sketchy' : 'clean'; landBeatT = AIR_LAND_BEAT_SEC; }
        if (grade === 'stuck' || grade === 'clean') { boost.earn('landingClean', grade === 'stuck' ? 1.5 : 1); if (Math.abs(rotations) >= 0.5) boost.earn(Math.abs(rotations) >= 1.5 ? 'trickBig' : 'trickSmall'); }
        if (S.best === null || GRADE_RANK[grade] > GRADE_RANK[S.best]) S.best = grade;
        const turns = Math.abs(rotations);
        // phase 3: the named line scores on the landing (THPS: a bail pays nothing; sketchy pays part) and is READ
        const landed01 = grade === 'crash' ? 0 : grade === 'sketchy' ? 0.5 : 1;
        const line = S.named.map((t) => t.label).join(' → ');
        const linePts = S.named.reduce((sum, t) => sum + scoreTrick(t, landed01), 0);
        // phase 9 — THE JUDGE: one 0–10 read per landing (SSX / a judged big-air final). A crash is a 0.0 whatever was
        // thrown. On the banner beside the grade, and the session keeps its best.
        const lineDiff = S.named.reduce((m, t) => Math.max(m, t.difficulty), 0);
        // weights (measured on the first cut: a SKETCHY 720 + rodeo read 7.5 — the landing counted too little): the landing is
        // half the score (stuck 5 / clean 4.2 / sketchy 1.5), the rotation up to 2.5, the line up to 2.5
        // IMPROVE (2026-10-06, item 10): the rotation's part reads at the repeat's share — the same spin again reads lower
        const lastAtt = core?.state.attempts[core.state.attempts.length - 1];
        const judge = judgeRead(grade, rotations, lineDiff, repeatShare(lastAtt?.repeat, core?.t.repeatDecay));
        S.judgeBest = Math.max(S.judgeBest, judge);
        console.info(`[AIR-JUDGE] ${judge.toFixed(1)} (${grade}, ${Math.abs(rotations).toFixed(1)} rot, line ${lineDiff.toFixed(1)})`);
        S.named = [];
        // phase 4 — THE COMBO LOOP: a landed line is a link (the Nth pays N×, repeats decay), a crash burns the open pot,
        // the pot banks when the run ends. `bonus` = what has banked + the open pot; the banner reads the multiplier.
        let lost = 0;
        if (grade === 'crash') { lost = S.chain.bail(); if (lost > 0) console.info(`[AIR-COMBO] crash — pot lost ${lost}`); }
        else if (linePts > 0) { S.chain.add(line, linePts, 'air'); console.info(`[AIR-COMBO] link ${S.chain.multiplier}× pot ${S.chain.pot}`); }
        S.bonus = S.chain.banked + S.chain.pot;
        if (line) console.info(`[AIR-TRICK] landed ${grade}: ${line} +${linePts}`);
        // a landing with no spin scores nothing now (pointsNeedTrick) — so it says so, rather than a CLEAN over a zero
        say(line ? `${line} — ${GRADE_LABEL[grade]}${grade === 'crash' ? (lost > 0 ? ` — POT LOST ${lost}` : '') : S.chain.multiplier > 1 ? ` ${S.chain.multiplier}× · POT ${S.chain.pot}` : linePts > 0 ? ` +${linePts}` : ''}` : turns < 0.5 && grade !== 'crash' ? `${GRADE_LABEL[grade]} — NO TRICK, NO POINTS` : `${GRADE_LABEL[grade]}${turns >= 1 ? `  ${turns.toFixed(1)} ROT ${rotations < 0 ? 'BS' : 'FS'}` : ''}`, 1.6);
        S.banner += ` · JUDGES ${judge.toFixed(1)}`;   // phase 9: the read rides the landing banner
        // IMPROVE (2026-10-06, items 2 / 8 / 11): the landing's word — where on the hill it set down, and the stomp's timing
        const notes = [zoneCall(core?.state.lastZone), stompCall(core?.state.lastJudged === 'stuck', stickLeft, core?.airTrick.stickWindowMs ?? 0)].filter(Boolean);
        S.note = notes.join(' · '); S.noteT = S.note ? 2.2 : 0;
        stickLeft = null; landedAtMs = performance.now(); lastStomp = null;
        if (S.note) console.info(`[AIR-CALL] ${S.note}`);
        gallery?.cheer(grade === 'stuck' ? 1 : grade === 'clean' ? 0.6 : grade === 'sketchy' ? 0.3 : 0.15);
        SoundKit.play(grade === 'crash' ? 'miss' : 'score');
        ctx.juice.scorePop(
          athlete ? athlete.root.position.add(new Vector3(0, 2.2, 0)) : Vector3.Zero(),
          GRADE_LABEL[grade], GRADE_COLOR[grade],
        );
        // A+ P0: a crash is the latched bail punch (hit-stop + shake + one low thud); the others keep the light feel hit,
        // and a clean / stuck landing adds a soft shake.
        if (grade === 'crash') crashPunch(ctx);
        else { ctx.feel.impact(0.35); if (grade === 'stuck' || grade === 'clean') landBeat(ctx, grade); }
      });

      ctx.camDirector.snapTo(athlete.root.position, objective);
      // IMPROVE (2026-10-06, item 8): the landing's launch-speed window, measured on this core — the run-up's speed bar shows it
      const sw = opts.hill ? sweetBand(core.t, core.feel.gravity, opts.hill) : null;
      band = sw ? { lo: sw[0], hi: sw[1], max: core.t.maxRunSpeed * 1.4 } : null;
      boost = new BoostKit(0.25); boostHeld = false; baseFov = null;
      boostFx?.dispose(); boostFx = new BoostFx(ctx.scene, ctx.camera, { trailFrom: athlete.root, trailWidth: 0.45 });
      boostPads?.dispose();
      boostPads = new BoostPads(ctx.scene, [   // on the run-in, before the slope has you at terminal speed
        { pos: new Vector3(0, 0, -18) }, { pos: new Vector3(0, 0, -36) },
      ].map((p) => ({ ...p, yaw: Math.PI, radius: 2.8 })));
      // L4 — a judged performance is watched. The gallery flanks the start of the run-in: two banks at |x|=4, outside the
      // run line, in the runner cam's frame edges. IMPROVE (2026-10-06, big air item 18): the "instanced, 2 draws" note was
      // the capsule crowd's — these 12 spots are up to Onlookers.MAX_BODIES (8) skinned roster bodies, and the run-in
      // leaves them behind the camera within seconds, so update() puts away the ones behind the lens (cullBehind).
      gallery = new Onlookers(ctx.scene, [
        ...[0, 1, 2, 3, 4, 5].map((i) => new Vector3(-4, 0, -3 - i * 2.2)),
        ...[0, 1, 2, 3, 4, 5].map((i) => new Vector3(4, 0, -4.5 - i * 2.2)),
      ]);
      // MOVEMENT PLAY P8: the probe's read-only seam
      (ctx.scene.metadata ??= {}).bigair = { state: () => ({
        phase: core?.state.phase ?? null, speed: core ? +core.state.speed.toFixed(2) : 0, spinTurns: core ? +core.airTrick.rotation.toFixed(2) : 0,
        spinDir: core?.airTrick.dir ?? null, spinning: core?.airTrick.spinning ?? false, attempt: core?.state.attempt ?? 0,
        lastGrade: core?.state.lastGrade ?? null, lastRotations: core?.state.lastRotations ?? 0, named: S.named.map((t) => t.id), body: { ...bodyStats },
      }) };
      pushHud(ctx);
    },

    onInput(ctx: ModeContext, e: FelInput): void {
      if (e.t === 'stick' && e.side === 'R') { S.lookX = e.x; S.lookY = e.y; return; }   // MODE-STICK-FACE: R stick → the director's look orbit
      if (e.t === 'stick' && e.side === 'L') { S.stickX = e.x; S.stickY = e.y; }          // phase 3: the held direction
      if (e.t === 'button' && e.btn === 'R1') { boostHeld = e.pressed; return; }   // BOOST: the shared held R1
      if (e.t === 'button' && !e.pressed && e.btn === 'X') { trickLayer?.release(); return; }   // IMPROVE (item 7): the grab let go
      if (S.done || !core) return;
      const phase = core.state.phase;

      // Alternating strides build run speed — the cadence IS the mechanic.
      if (e.t === 'dpad' && e.pressed && (e.dir === 'left' || e.dir === 'right')) {
        // In the air the same keys pick the spin direction (big air D4):
        // left = backside, right = frontside. Before the first trick tap only.
        // SCORECARD CONTROLS (2026-09-15): the answers were banner text, and the same word twice (GOOD, GOOD) is no change a
        // player sees — half the stride and spin presses read as dead. Every press now has its own sound.
        if (phase === 'Air') { core.setSpinDir(e.dir === 'left' ? -1 : 1); SoundKit.play('swish', { pitch: e.dir === 'left' ? 0.9 : 1.1, volume: 0.3 }); return; }
        if (phase !== 'Run') { refuse(ctx, 'WAIT FOR THE RUN-UP'); return; }
        const side: CadenceSide = e.dir === 'left' ? 'L' : 'R';
        const q = core.runTap(side);
        S.nextFoot = side === 'L' ? 'R' : 'L';
        strideSay(q);   // (MOVEMENT PLAY P8: the same feedback a body's graded step gets)
        return;
      }

      if (e.t === 'button' && e.pressed) {
        // phase 3 — THE BOARD FAMILY'S GRAMMAR (BoardTricks, snow): the held direction + the button is a NAMED trick — A spins
        // (and names the spin: 540 right, 720 left, a straight air neutral), Y is a grab by direction (method up, stalefish
        // left, tail grab right, indy down), X the big spins (cork 720 right, rodeo left). Before: A spun, B stomped, and
        // the mode named nothing (the trick probe saw two prompts in 50 s of presses).
        // IMPROVE (2026-10-06, item 5): Y → the Y tricks and X → the X grab, as skate, the slalom and surf map them (Y named a 'B'
        // grab here and X a 'Y' spin). X is the family's grab hold: airPressFor gives the held direction's straight grab.
        const nameTrick = (btn: 'A' | 'X' | 'Y'): void => {
          // the air LEFT names what fits (skate's fitToAir idea: the core's own forecast of the touchdown)
          const left = Math.max(0.3, core?.predictTouchdown()?.sec ?? 1.2);
          const t = btn === 'X' ? airPressFor('snow', heldTrickDir(S.stickX, S.stickY), 'X', left) : airTrickFor('snow', heldTrickDir(S.stickX, S.stickY), btn, left);
          if (!t || t.kind !== 'air') return;
          if (S.named.some((n) => n.id === t.id)) { say(`${t.label} · REPEAT`, 0.5); return; }
          S.named.push(t); if (t.grab !== 'none') grabThisAir = true; say(t.label, 0.7); console.info(`[AIR-TRICK] ${t.id} (${btn} ${heldTrickDir(S.stickX, S.stickY) ?? 'neutral'})`);
          trickLayer?.start(t);   // IMPROVE (item 7): its shape on the body — the hand to the edge, the cork's tilt
        };
        if (e.btn === 'A' && phase === 'Air') { core.trick(); nameTrick('A'); SoundKit.play('whoosh', { pitch: 1.2, volume: 0.35 }); }
        else if (e.btn === 'Y' && phase === 'Air') { nameTrick('Y'); SoundKit.play('whoosh', { pitch: 0.9, volume: 0.4 }); }
        else if (e.btn === 'X' && phase === 'Air') { nameTrick('X'); SoundKit.play('whoosh', { pitch: 1.0, volume: 0.35 }); }
        else if (e.btn === 'B' && phase === 'Air') {
          core.stick(); SoundKit.play('thud', { pitch: 1.1, volume: 0.35 });
          stickLeft = core.predictTouchdown()?.sec ?? null;   // IMPROVE (item 11): how far out it was pressed
        }
        else if (e.btn === 'B' && phase === 'Land' && landedAtMs >= 0 && (performance.now() - landedAtMs) / 1000 <= LATE_STOMP_SEC) {
          // IMPROVE (item 11): a stomp just after the touchdown is LATE, and says by how much (it used to be refused as off-phase)
          const ms = Math.round(performance.now() - landedAtMs);
          S.note = `STOMP LATE · ${ms} MS`; S.noteT = 1.6; landedAtMs = -1;
          SoundKit.play('uiTick', { pitch: 0.7, volume: 0.45 });
        }
        else if ((e.btn === 'A' || e.btn === 'B') && phase !== 'Run') refuse(ctx, 'WAIT FOR THE RUN-UP');
        // MECHANICS PASS (2026-09-15): SPIN and STOMP are air verbs, and on the run-up they did nothing and said nothing
        // (the probe: 67% of deliberate presses silent). A press out of its phase is answered with where it belongs.
        else if ((e.btn === 'A' || e.btn === 'B') && phase === 'Run') { say(e.btn === 'A' ? 'SPIN IN THE AIR' : 'STOMP THE LANDING', 0.6); SoundKit.play('uiTick', { pitch: 0.7, volume: 0.5 }); }
      }
    },

    update(ctx: ModeContext, dtRaw: number): void {
      if (S.done || !core || !athlete || !launchPad) return;
      if (!ambientOn) { ambientOn = true; SoundKit.startAmbient('wind'); }   // IMPROVE (2026-10-06, item 14): the wind bed
      // IMPROVE (2026-10-06, item 12): the apex hang slows the WHOLE beat — the core's flight and spin with the clips (skate's
      // spectacle pattern: juice.slowMo only moves the animation clock)
      if (slowT > 0) slowT = Math.max(0, slowT - dtRaw);
      const dt = slowT > 0 ? dtRaw * HANG.scale : dtRaw;
      trickLayer?.begin();   // IMPROVE (item 7): take back last frame's trick offsets before this frame's writes
      prevVy = core.state.vy;

      const bev = boost.update(dt, boostHeld, core.state.phase === 'Run');
      core.boostK = boost.k;
      const st = core.step(dt, dt);
      // MOVEMENT PLAY P8: the body's air verbs, and the planted spin — the game plants it at the half turn it aimed for; a new
      // attempt's run-up grades its first stride as a first (not against the last attempt's last step)
      if (st.phase === 'Run' && bodyPhase !== null && bodyPhase !== 'Run') stride.reset();
      bodyPhase = st.phase;
      // (a quarter read before the first frame of play — a turn at READY — is never a spin: review fix)
      if (!bodySynced) { rideIntents.sync(ctx.body?.() ?? null); bodySynced = true; }
      if (st.phase === 'Air') for (const it of rideIntents.poll(ctx.body?.() ?? null, { airborne: true })) bodyVerb(it);
      else rideIntents.poll(ctx.body?.() ?? null, { airborne: false });
      if (plantAt !== null) {
        if (st.phase !== 'Air') plantAt = null;
        else if (core.airTrick.spinning && Math.abs(core.airTrick.rotation) >= plantAt) {
          core.trick(); bodyStats.plants++;
          console.info(`[AIR-TRICK] planted at ${Math.abs(core.airTrick.rotation).toFixed(2)} turns (aimed ${plantAt})`);
          plantAt = null;
        } else if (!core.airTrick.spinning) plantAt = null;   // a pad's A planted it first
      }

      // Drive the athlete straight from the core's own 3D position (on the hill: up the kicker, down onto the landing).
      athlete.root.position.set(st.pos.x, Math.max(0, st.pos.y), st.pos.z);
      // Rotation in the air is the trick; on the ground face the run direction — pitched with the snow under the board on the
      // kicker's ramp and the landing slope (IMPROVE 2026-10-06: nose up the lip, nose down the landing).
      // IMPROVE (2026-10-06, item 3): a SPIN turns about the vertical (rotation.y). It turned the body about X, so every 540
      // and 720 read as a front flip; the off-axis tilt of a cork or a rodeo is the trick layer's, on X, below.
      athlete.root.rotation.set(
        st.phase === 'Air' ? 0 : -core.surface.pitch(st.pos.z),
        Math.PI + (st.phase === 'Air' ? (st.spinTurns ?? 0) * Math.PI * 2 : 0),   // running toward -z
        0,
      );
      trickLayer?.apply(dt, st.phase === 'Air');
      // IMPROVE (2026-10-06, items 11 / 12): the forecast touchdown — the ring on the snow, the stomp cue, the apex hang (before the
      // finish hold below, so the ring is put away the moment the last air lands)
      const td = st.phase === 'Air' ? core.predictTouchdown() : null;
      lastStomp = stompState(td ? td.sec : null, core.airTrick.stickWindowMs);
      if (stompRing && ringMats) {
        stompRing.setEnabled(!!td);
        if (td) {
          stompRing.position.set(0, td.y + 0.06, td.z);
          stompRing.rotation.x = core.surface.pitch(td.z);
          if (lastStomp !== ringState) { ringState = lastStomp; stompRing.material = lastStomp === 'now' ? ringMats.now : ringMats.wait; }
        }
      }
      if (st.phase === 'Run') hangFired = false;
      if (td && apexHang(prevVy, st.vy, core.airTrick.spinning, Math.abs(core.airTrick.rotation) + (core.airTrick.spinRatePerSec || 0) * td.sec, hangFired)) {
        hangFired = true; slowT = HANG.sec;
        ctx.juice.slowMo(HANG.scale, HANG.sec * 1000, { gameplay: true });   // (the mode slows its own dt for the same span)
        console.info('[AIR-HANG] apex beat');
      }

      // phase 5: the board tree is the one owner of the clips (was: the sprint loop on the run-in, `jump_up` held through
      // the whole air — 391/729 T-arm frames — and the stand idle on the landing)
      if (landBeatT > 0) { landBeatT -= dt; if (landBeatT <= 0) animTree?.clearBeat('land_clean', 'land_sketchy'); }
      if (bailBeatT > 0) { bailBeatT -= dt; if (bailBeatT <= 0) animTree?.clearBeat('bail'); }
      animTree?.update(airBoardFeed({
        phase: st.phase, speed: st.speed, maxRunSpeed: BIG_AIR_TUNING.maxRunSpeed, spinTurns: st.spinTurns ?? 0,
        boostHeld, grabHeld: grabThisAir, landBeat: landBeatT > 0 ? lastLanding : 'none', bailing: bailBeatT > 0,
        finished: (st.finished || st.phase === 'Done') && !lastCrash,
      }));

      // The core owns score/attempt/finished — mirroring them here rather than
      // re-deriving them keeps the HUD honest and the end condition single-sourced.
      S.score = st.score;
      S.attempt = st.attempt;
      if (st.finished || st.phase === 'Done') {
        // The final attempt's grade gets its own beat (gymnastics carry-forward
        // #1): the last landing's banner used to be cut off by the end screen
        // on the same frame it appeared. Hold the finish until it has shown.
        if (S.bannerT > 0) { S.bannerT -= dt; pushHud(ctx); return; }
        finish(ctx); return;
      }

      if (S.bannerT > 0) { S.bannerT -= dt; if (S.bannerT <= 0) S.banner = ''; }
      if (S.noteT > 0) { S.noteT -= dt; if (S.noteT <= 0) S.note = ''; }
      gallery?.update(dt);
      if (gallery && (galleryCullT -= dt) <= 0) { galleryCullT = 0.25; ctx.camera.getDirectionToRef(Axis.Z, camFwd); gallery.cullBehind(ctx.camera.position, camFwd); }
      boostPads?.update(dt, athlete.root.position, boost);
      boostFx?.update(dt, boost, bev);
      if (bev.started) say('BOOST!', 0.5);
      ctx.camDirector.look(S.lookX, S.lookY, dt);
      // WA-7: runner preset looked straight down in the air; board + setAir gives a three-quarter read.
      const wantPreset = st.phase === 'Air' || st.phase === 'Land' ? 'board' : 'runner';
      if (wantPreset !== camPhase) {   // IMPROVE (item 15): on a change only
        camPhase = wantPreset;
        if (wantPreset === 'board') ctx.camDirector.setPreset('board'); else ctx.camDirector.setPreset('runner');
      }
      if (st.phase === 'Air') {
        ctx.camDirector.setAir(Math.min(1, Math.max(0.35, st.pos.y / 7)));
      } else if (st.phase === 'Land') {
        // IMPROVE (2026-10-06, item 2): on the 20° landing the chase cam sits uphill of the rider — lift it (measured: at 0.25
        // its eye is ~0.15 m over the slope 7 m back); on the flat, as before
        ctx.camDirector.setAir(core.surface.pitch(st.pos.z) < 0 ? 0.6 : 0.25);
      } else {
        ctx.camDirector.setAir(0);
      }
      ctx.camDirector.update(athlete.root.position, camVel.set(0, 0, -st.speed), objective);
      baseFov ??= ctx.camera.fov;
      ctx.camera.fov = stepSpeedFov(ctx.camera.fov, baseFov * (boostFx?.fovMult(boost) ?? 1), st.phase === 'Run' ? st.speed : 0, BIG_AIR_TUNING.maxRunSpeed, dt);
      pushHud(ctx);
    },

    dispose(): void {
      disposeCount += 1;
      // A stale teardown from a dev double-mount must not null the live
      // instance's objects out from under it (see ThreePointMode for the bug
      // this prevents: the scene renders, and nothing ever moves).
      if (disposeCount < loadCount) return;
      board?.dispose(); board = null; animTree = null;
      athlete?.dispose(); athlete = null;
      propsGone = true; props?.dispose(); props = null;
      posture?.dispose(); posture = null;
      if (!hillMeshes.includes(launchPad!)) launchPad?.dispose();
      launchPad = null; hillMeshes.forEach((m) => m.dispose()); hillMeshes = [];
      gallery?.dispose(); gallery = null;
      boostFx?.dispose(); boostFx = null; boostPads?.dispose(); boostPads = null;
      baseFov = null;
      trickLayer?.dispose(); trickLayer = null;
      stompRing?.dispose(); stompRing = null; ringMats = null;
      SoundKit.stopAmbient();   // IMPROVE (2026-10-06, item 14)
      core = null;
    },
  };
}

// The gymnastics vault skin left this file with A+ mission #10 (FreeRunMode.ts took the roster slot). The vault session
// core (makeVaultSession / VAULT_TUNING) stays available in the feel cores for a future skin.

/** Snowboard Big Air — same core, alpine skin. */
export const BigAirMode: ModeDefinition = makeAirSessionMode({
    modeId: 'bigair',
    mood: 'alpine',
    buildVenue: (scene) => VenueKit.buildBigAirSlope(scene),   // WA-7: no venueBox tree walls
    propSet: 'bigair-run',   // P9: pines down the −z run (the 'slope' set stood behind the athlete)
    makeSession: (onLanding) => makeBigAirSession(undefined, { onLanding }),
    attempts: BIG_AIR_TUNING.attemptsPerRound ?? 3,
    winScore: 900,                                    //TUNE(elijah)
    launchLabel: 'KICKER',
    hill: BIG_AIR_HILL, launchZ: BIG_AIR_TUNING.launchZ,   // IMPROVE (2026-10-06, items 1 / 2): the core's own jump, built
});
