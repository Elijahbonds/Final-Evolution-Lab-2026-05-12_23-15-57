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

import { Color3, MeshBuilder, StandardMaterial, Vector3 } from '@babylonjs/core';
import type { Mesh, Scene } from '@babylonjs/core';
import { CharacterLibrary, type SpawnedCharacter } from '../core/CharacterLibrary';
import { mountPostureLayer } from '../anim/PostureLayer';
import { BOARD_POSTURE, BOARD_LEGS, type BoardWindow } from '../core/BoardPosture';
import { airTrickFor, heldTrickDir, scoreTrick, type BoardTrick } from '../core/BoardTricks';   // boards pass phase 3: the family's trick table on big air
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
import { makeBigAirSession, BIG_AIR_TUNING } from '../../feel/cores/big-air-skin';
import type { ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import { BoostKit } from '../core/BoostKit';          // FINISH-RELEASE: the shared boost (landings + pads fill it, RB/Shift burns it on the run-in)
import { BoostFx } from '../premium/BoostFx';
import { BoostPads } from '../visual/BoostPads';
import { stepSpeedFov } from '../core/SpeedFov';
import { locoPick } from '../anim/LocoBus';   // SHARED-ANIM-BUS: the run-up's loop + stride rate

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
}

const GRADE_LABEL: Record<TrickGrade, string> = {
  stuck: 'STUCK IT!', clean: 'CLEAN', sketchy: 'SKETCHY', crash: 'CRASH',
};
const GRADE_COLOR: Record<TrickGrade, string> = {
  stuck: '#ffd75e', clean: '#22d3ee', sketchy: '#ff9d5c', crash: '#ef4444',
};
const GRADE_RANK: Record<TrickGrade, number> = { crash: 0, sketchy: 1, clean: 2, stuck: 3 };

export function makeAirSessionMode(opts: AirSessionModeOpts): ModeDefinition {
  // Per-mode closure state. Deliberately NOT module-level: two air-session
  // modes exist, and module state would let gymnastics and big-air overwrite
  // each other's athlete the moment both had been mounted in one session.
  let athlete: SpawnedCharacter | null = null;
  let posture: { dispose(): void } | null = null;
  let props: VenuePropsHandle | null = null; let propsGone = false;
  let core: AirSessionCore | null = null;
  let launchPad: Mesh | null = null;
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
    bonus: 0,                    // points the named tricks earned across the session (the core scores rotation only)
    chain: new ComboChain(undefined, 'air'),   // phase 4: the run's combo — links across attempts, a crash burns the pot
  };

  const reset = (): void => {
    S.attempt = 0; S.score = 0; S.combo = 0; S.best = null;
    S.nextFoot = 'L'; S.banner = ''; S.bannerT = 0; S.done = false;
    crashAt = 0; finishLatch = false;
  };

  const pushHud = (ctx: ModeContext): void => {
    const st = core?.state;
    ctx.setHud({
      score: (st?.score ?? 0) + S.bonus,   // phase 3: the core's rotation points + the named line
      attempt: `${Math.min((st?.attempt ?? 0) + 1, opts.attempts)}/${opts.attempts}`,
      phase: st?.phase ?? 'Run',
      speed: st ? Number(st.speed.toFixed(1)) : 0,
      height: st ? Number((st.height ?? 0).toFixed(2)) : 0,
      spin: st ? Number((st.spinTurns ?? 0).toFixed(2)) : 0,
      combo: S.combo,
      best: S.best ? GRADE_LABEL[S.best] : null,
      nextFoot: S.nextFoot,
      banner: S.banner || null,
      ...boost.hud(),
      hint: 'D-PAD ←/→ alternate strides · HOLD RB/SHIFT boost the run-in (bigger pop) · in the air ←/→ picks backside/frontside · A starts the spin, A again plants it — land on a half turn · B stick the landing',
    });
  };

  const say = (text: string, sec = 1.2): void => { S.banner = text; S.bannerT = sec; };

  const finish = (ctx: ModeContext): void => {
    if (S.done) return;
    S.done = true;
    if (S.score >= opts.winScore) finishPunch(ctx);
    S.chain.bank(); S.bonus = S.chain.banked;   // phase 4: the run's open pot banks with the run
    ctx.end(S.score >= opts.winScore ? 'win' : 'complete', S.score, {
      points: S.score, bestGrade: S.best ? GRADE_RANK[S.best] : 0, attempts: S.attempt,
    });
  };

  return {
    modeId: opts.modeId,
    mood: opts.mood,
    camPreset: 'runner',

    async load(ctx: ModeContext): Promise<void> {
      loadCount += 1;
      reset();

      opts.buildVenue(ctx.scene);
      propsGone = false;
      if (opts.propSet) void mountVenueProps(ctx.scene, opts.propSet, undefined, { snapToGround: true }).then((h) => { if (propsGone) h?.dispose(); else props = h; });   // ship pass 4 · P9: on the ground under them

      // The launch object: vault table or kicker lip. Placed at the core's own
      // launchZ so the visual and the physics agree by construction.
      launchPad = MeshBuilder.CreateBox(`${opts.modeId}_launch`, { width: 1.6, height: 0.5, depth: 1.1 }, ctx.scene);
      const padMat = new StandardMaterial(`${opts.modeId}_launchMat`, ctx.scene);
      padMat.diffuseColor = Color3.FromHexString('#d8c9a8');
      launchPad.material = padMat;
      launchPad.position.set(0, 0.25, -12);

      athlete = await CharacterLibrary.spawn(ctx.scene, DEFAULT_HERO_URL, {
        position: new Vector3(0, 0, 0), startClip: 'idle_stand', modeId: opts.modeId,
      });
      neverBindPose(athlete.animator, 'idle_stand');
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
        const w: BoardWindow = phase === 'Air' ? (spinning ? 'spin' : 'air')
          : phase === 'Land' ? 'land'
          : phase === 'Run' ? 'cruise' : 'idle';
        const { pose, legs } = { pose: BOARD_POSTURE[w], legs: BOARD_LEGS[w] };
        // eyes on the LANDING, which is what an air is actually about — a rider looking at the sky is a
        // rider who does not know where the snow is
        // the pad is built before the athlete spawns, but the feed runs on its own observable and must not
        // assume the world still exists mid-teardown
        const at = launchPad ? launchPad.position.add(new Vector3(0, 0, 14)) : new Vector3(0, 1.5, 14);
        return { pose, legs, aim: at, eyes: at, window: w };
      }, 'AIR-PP');

      // Frame the athlete against the thing they are running at.
      ctx.objectiveRef.current = launchPad.position;

      core = opts.makeSession((grade, rotations) => {
        if (grade === 'stuck' || grade === 'clean') S.combo += 1; else S.combo = 0;
        if (grade === 'stuck' || grade === 'clean') { boost.earn('landingClean', grade === 'stuck' ? 1.5 : 1); if (Math.abs(rotations) >= 0.5) boost.earn(Math.abs(rotations) >= 1.5 ? 'trickBig' : 'trickSmall'); }
        if (S.best === null || GRADE_RANK[grade] > GRADE_RANK[S.best]) S.best = grade;
        const turns = Math.abs(rotations);
        // phase 3: the named line scores on the landing (THPS: a bail pays nothing; sketchy pays part) and is READ
        const landed01 = grade === 'crash' ? 0 : grade === 'sketchy' ? 0.5 : 1;
        const line = S.named.map((t) => t.label).join(' → ');
        const linePts = S.named.reduce((sum, t) => sum + scoreTrick(t, landed01), 0);
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

      ctx.camDirector.snapTo(athlete.root.position, launchPad.position);
      boost = new BoostKit(0.25); boostHeld = false; baseFov = null;
      boostFx?.dispose(); boostFx = new BoostFx(ctx.scene, ctx.camera, { trailFrom: athlete.root, trailWidth: 0.45 });
      boostPads?.dispose();
      boostPads = new BoostPads(ctx.scene, [   // on the run-in, before the slope has you at terminal speed
        { pos: new Vector3(0, 0, -18) }, { pos: new Vector3(0, 0, -36) },
      ].map((p) => ({ ...p, yaw: Math.PI, radius: 2.8 })));
      // L4 — a judged performance is watched. The gallery flanks the runway
      // (the athlete runs -z into the launch at z=-12): two banks at |x|=4,
      // outside the run line, in the runner cam's frame edges. Instanced,
      // 2 draws, shared by both skins — one factory, never forked.
      gallery = new Onlookers(ctx.scene, [
        ...[0, 1, 2, 3, 4, 5].map((i) => new Vector3(-4, 0, -3 - i * 2.2)),
        ...[0, 1, 2, 3, 4, 5].map((i) => new Vector3(4, 0, -4.5 - i * 2.2)),
      ]);
      pushHud(ctx);
    },

    onInput(ctx: ModeContext, e: FelInput): void {
      if (e.t === 'stick' && e.side === 'R') { S.lookX = e.x; S.lookY = e.y; return; }   // MODE-STICK-FACE: R stick → the director's look orbit
      if (e.t === 'stick' && e.side === 'L') { S.stickX = e.x; S.stickY = e.y; }          // phase 3: the held direction
      if (e.t === 'button' && e.btn === 'R1') { boostHeld = e.pressed; return; }   // BOOST: the shared held R1
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
        if (q === 'perfect') { say('PERFECT STRIDE', 0.5); SoundKit.play('uiTick', { pitch: 1.5, volume: 0.4 }); }
        else if (q === 'good' || q === 'first') { say('GOOD', 0.4); SoundKit.play('uiTick', { pitch: 1.15, volume: 0.3 }); }
        else if (q === 'fault') { say('STUMBLE!', 0.6); SoundKit.play('thud', { pitch: 0.8, volume: 0.4 }); }
        else { say('OFF-BEAT', 0.4); SoundKit.play('uiTick', { pitch: 0.7, volume: 0.3 }); }
        return;
      }

      if (e.t === 'button' && e.pressed) {
        // phase 3 — THE BOARD FAMILY'S GRAMMAR (BoardTricks, snow): the held direction + the button is a NAMED trick — A spins
        // (and names the spin: 540 right, 720 left, a straight air neutral), Y is a grab by direction (method up, stalefish
        // left, tail grab right, indy down), X the big spins (cork 720 right, rodeo left). Before: A spun, B stomped, and
        // the mode named nothing (the trick probe saw two prompts in 50 s of presses).
        const nameTrick = (btn: 'A' | 'B' | 'Y'): void => {
          const t = airTrickFor('snow', heldTrickDir(S.stickX, S.stickY), btn, 1.2);
          if (!t || t.kind !== 'air') return;
          if (S.named.some((n) => n.id === t.id)) { say(`${t.label} · REPEAT`, 0.5); return; }
          S.named.push(t); say(t.label, 0.7); console.info(`[AIR-TRICK] ${t.id} (${btn} ${heldTrickDir(S.stickX, S.stickY) ?? 'neutral'})`);
        };
        if (e.btn === 'A' && phase === 'Air') { core.trick(); nameTrick('A'); SoundKit.play('whoosh', { pitch: 1.2, volume: 0.35 }); }
        else if (e.btn === 'Y' && phase === 'Air') { nameTrick('B'); SoundKit.play('whoosh', { pitch: 1.0, volume: 0.35 }); }
        else if (e.btn === 'X' && phase === 'Air') { nameTrick('Y'); SoundKit.play('whoosh', { pitch: 0.9, volume: 0.4 }); }
        else if (e.btn === 'B' && phase === 'Air') { core.stick(); SoundKit.play('thud', { pitch: 1.1, volume: 0.35 }); }
        else if ((e.btn === 'A' || e.btn === 'B') && phase !== 'Run') refuse(ctx, 'WAIT FOR THE RUN-UP');
        // MECHANICS PASS (2026-09-15): SPIN and STOMP are air verbs, and on the run-up they did nothing and said nothing
        // (the probe: 67% of deliberate presses silent). A press out of its phase is answered with where it belongs.
        else if ((e.btn === 'A' || e.btn === 'B') && phase === 'Run') { say(e.btn === 'A' ? 'SPIN IN THE AIR' : 'STOMP THE LANDING', 0.6); SoundKit.play('uiTick', { pitch: 0.7, volume: 0.5 }); }
      }
    },

    update(ctx: ModeContext, dt: number): void {
      if (S.done || !core || !athlete || !launchPad) return;

      const bev = boost.update(dt, boostHeld, core.state.phase === 'Run');
      core.boostK = boost.k;
      const st = core.step(dt, dt);

      // Drive the athlete straight from the core's own 3D position.
      athlete.root.position.set(st.pos.x, Math.max(0, st.pos.y), st.pos.z);
      // Rotation in the air is the trick; on the ground face the run direction.
      athlete.root.rotation.set(
        st.phase === 'Air' ? (st.spinTurns ?? 0) * Math.PI * 2 : 0,
        Math.PI,   // running toward -z
        0,
      );

      const loco = st.phase === 'Run' ? locoPick({ speed: Math.max(st.speed, 0.61) }) : null;   // the run-up never idles mid-approach
      const clip = loco ? loco.clip
        : st.phase === 'Air' ? 'jump_up'
        : 'idle_stand';
      athlete.animator.play(clip, { loop: true });
      if (loco) athlete.animator.setPlaybackScale(clip, loco.rate);

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

      gallery?.update(dt);
      boostPads?.update(dt, athlete.root.position, boost);
      boostFx?.update(dt, boost, bev);
      if (bev.started) say('BOOST!', 0.5);
      ctx.camDirector.look(S.lookX, S.lookY, dt);
      ctx.camDirector.update(athlete.root.position, new Vector3(0, 0, -st.speed), launchPad.position);
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
      athlete?.dispose(); athlete = null;
      propsGone = true; props?.dispose(); props = null;
      posture?.dispose(); posture = null;
      launchPad?.dispose(); launchPad = null;
      gallery?.dispose(); gallery = null;
      boostFx?.dispose(); boostFx = null; boostPads?.dispose(); boostPads = null;
      baseFov = null;
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
    buildVenue: (scene) => VenueKit.buildSlope(scene),
    propSet: 'bigair-run',   // P9: pines down the −z run (the 'slope' set stood behind the athlete)
    makeSession: (onLanding) => makeBigAirSession(undefined, { onLanding }),
    attempts: BIG_AIR_TUNING.attemptsPerRound ?? 3,
    winScore: 900,                                    //TUNE(elijah)
    launchLabel: 'KICKER',
});
