// SprintMode — Babylon 9 face of the shared SprintCore.
//
// Same deal as the air-session family: lib/feel/cores/sprint-core.ts is already
// render-free and owns the whole race (READY→SET→GO gate, real false starts,
// alternating-cadence impulses, same-side stumbles, drag). The 2D surface only
// drew it. So this is a renderer swap and every tuned constant in
// sprint-constants.ts carries over untouched — including raceDistanceM.
//
// The core is fixed-step: tick(dtMs) advances the clock, step(side) feeds a
// stride. Nothing here re-implements any of it.

import { Color3, Mesh, MeshBuilder, StandardMaterial, Vector3 } from '@babylonjs/core';
import type { PBRMaterial } from '@babylonjs/core';
import { CharacterLibrary, type SpawnedCharacter } from '../core/CharacterLibrary';
import { neverBindPose } from '../anim/importSanitizer';
import { installSafePlay, SPORT_CLIP } from '../anim/clipRegistry';
import { VenueKit } from '../visual/VenueKit';
import { readPlaceLook } from '../nexus/placeLooks';
import { MOOD_TO_FAMILY } from '../visual/Backdrops';
import { SoundKit } from '../audio/SoundKit';
import { refuse } from '../core/Refusal';   // racing pass phase 3: every press answered
import { makeSprintRace, randomSetHoldMs, SPRINT_TUNING, SPRINT_SENSORY } from '../../feel/cores/sprint-skin';
import type { SensoryEvent } from '../../feel';
import { stepSpeedFov } from '../core/SpeedFov';
import {
  pacerDistance, pacerSpeed, gapLabel, falseStartPenaltyS, FALSE_START_FREE, FALSE_START_PENALTY_S, cadenceCall,
  SPRINT_CALLED_SPLITS_M, SPRINT_MARK_M, loadSprintPb, saveSprintPbIfFaster, marksCrossed, splitDeltaMs, pbSplitWords,
  pbDistanceAt, hudDue, type SprintPb,
} from './sprintRules';
import { deltaLabel } from '../racing/ghost';
import type { SprintCore } from '../../feel/cores/sprint-core';
import type { ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import { locoPick } from '../anim/LocoBus';   // SHARED-ANIM-BUS: one loco pick + stride rate for every on-foot body
import { stepFinishGrace } from '../racing/RaceField';   // MECHANICS PASS: the race ends for everyone
// MOVEMENT PLAY P8 (2026-09-26): running in place IS the race — each told step graded on the camera's capture clock against a
// body's cadence (a thumb's 5 taps a second is not a jog's 3), the reaction timed on the same clock, a step captured before
// the gun a false start even when it arrives after it, and the chest dipped at the tape the DIP
import { RideIntents, BodyStride, rideLines, BODY_PERFECT_HZ } from '../core/rideBody';
import type { ModeContext as Ctx, BodyView } from '../core/ModeHarness';   // (Ctx: the helpers below the definition)
import type { BodyEvent } from '@/lib/pose/BodyReader';

const RACE_DIST = SPRINT_TUNING.raceDistanceM;   // core-owned (100m)
/** The dip at the tape (racing pass phase 8): how close to the line it must come, and what it is worth. */
const DIP_WINDOW_M = 2.5, DIP_BONUS_S = 0.04;
const WIN_TIME = 13.0;                            //TUNE(elijah) sub-13 is the bar
/** The rival's time, s — a credible club sprinter to race against. IMPROVE (2026-10-06): this was RIVAL_SPEED = 100 / 13.4
 *  = 7.46 m/s held from the gun; the rival now ACCELERATES on sprintRules' pacer curve and still breasts the tape at it. */
const RIVAL_TIME_S = 13.4;                        //TUNE(elijah)
/** IMPROVE (2026-10-06): after the tape the runners run out and the result waits this long (the race used to freeze on
 *  the line), and how hard they pull up, m/s². */
const RUNOUT_SEC = 2.0, RUNOUT_DECEL = 6;          //TUNE(elijah)
/** IMPROVE (2026-10-06): the lens at speed — SpeedFov's kick, a touch under its 1.18 default, across the core's maxSpeed. */
const SPRINT_FOV_GAIN = 1.12;                     //TUNE(elijah)
/** The runner's lane (x) — where the pace light and the PB marker run. */
const RUNNER_X = -0.7;

/**
 * Built as a factory so every harness instance closes over its OWN state.
 *
 * This mode previously kept runner/rival/finishLine/core at module scope with a
 * load/dispose counter guarding teardown. That guard was not reliable: React
 * mounts effects twice in dev, and depending on which async load resolved first,
 * an outgoing instance could still null the objects out from under the live one.
 * update() then early-returned forever — the harness reported "playing", the HUD
 * kept rendering, and the canvas stayed black with update() never once called.
 *
 * A ModeDefinition is a module singleton, so closure state is the only way to
 * make that structurally impossible. AirSessionMode is built the same way.
 */
export function makeSprintMode(): ModeDefinition {
let runner: SpawnedCharacter | null = null;
let rival: SpawnedCharacter | null = null;
let finishLine: Mesh | null = null;
let core: SprintCore | null = null;
// IMPROVE (2026-10-06): every mesh and material load() makes is kept, so dispose() releases them (the ticks, their
// materials and finishMat leaked); the ticks are one merged mesh on one material; the pace light and the PB marker.
let ticks: Mesh | null = null;
let tickMat: PBRMaterial | null = null;
let finishMat: StandardMaterial | null = null;
let paceLight: Mesh | null = null;
let pbMarker: Mesh | null = null;
const markerMats: PBRMaterial[] = [];
/** IMPROVE (2026-10-06): the camera's velocity, one scratch vector (was a new Vector3 every frame). */
const camVel = new Vector3();

const S = {
  done: false,
  stumbles: 0,
  rivalDist: 0,
  /** Seconds left to the tape once the rival has breasted it; null = not running. */
  graceLeft: null as number | null,
  banner: '',
  bannerT: 0,
  lastSide: null as 'L' | 'R' | null,
  /** Triggers held (a squeeze is answered once, not every frame the bus re-emits it). */
  trigL: false, trigR: false,
  /** THE GUN (racing pass phase 4): seconds from GO to the first clean stride — Track & Field's reaction read. */
  reactS: null as number | null,
  /** THE DIP (racing pass phase 8): the lean at the tape — d-pad UP inside the last metres takes a few hundredths off. */
  dipped: false,
  /** Clean alternating strides in a row (the rhythm streak). */
  streak: 0,
  lookX: 0, lookY: 0,   // R stick → camera look (MODE-STICK-FACE family, 2026-09-07)
  /** MOVEMENT PLAY P8: the gun's instant on the page clock (the capture clock is the same performance.now), and the body's strides. */
  goAt: null as number | null,
  body: { strides: 0, perfect: 0, good: 0, off: 0, fault: 0, falseStarts: 0, dips: 0 },
  // ── IMPROVE (2026-10-06) ──
  /** Seconds the rival has run since the gun (its pacer curve, the pace light and the PB marker read it). */
  rivalT: 0,
  /** Past the tape the rival runs on and pulls up: metres beyond the line, and its speed. */
  rivalOver: 0, rivalOverV: null as number | null,
  /** The run-out after the tape: seconds left (null = not running), the result it holds, the runner's speed and metres past. */
  runout: null as number | null,
  pendingEnd: null as (() => void) | null,
  runV: 0, runOver: 0, celebrated: false, won: false,
  /** The DIP NOW call, once a race. */
  dipCalled: false,
  /** The metronome: strides since the gun, the last stride's grade, the next foot, the beat it is judged against, the call. */
  beatSeq: 0, beatGrade: '', beatFoot: '' as '' | 'L' | 'R', beatMs: 0, beatCall: '',
  /** PB splits: the clock (ms) at every 10 m this race, the previous frame's distance and clock, the best run, the last split. */
  atM: [] as number[], prevM: 0, prevMs: 0, pb: null as SprintPb | null, split: '',
  /** The lens: the preset's resting fov (captured on the first frame) and the fov this mode holds. */
  baseFov: null as number | null, fov: null as number | null,
  /** The HUD gate: the last discrete key pushed and seconds since the last push. */
  hudKey: null as string | null, hudAge: 0,
};
const stride = new BodyStride();
const rideIntents = new RideIntents();

const reset = (): void => {
  S.done = false; S.stumbles = 0; S.rivalDist = 0; S.graceLeft = null;
  S.banner = ''; S.bannerT = 0; S.lastSide = null; S.streak = 0; S.trigL = false; S.trigR = false; S.reactS = null; S.dipped = false;
  finishLatch = false;
  S.goAt = null; S.body = { strides: 0, perfect: 0, good: 0, off: 0, fault: 0, falseStarts: 0, dips: 0 }; stride.reset(); rideIntents.reset();   // MOVEMENT PLAY P8
  S.rivalT = 0; S.rivalOver = 0; S.rivalOverV = null; S.runout = null; S.pendingEnd = null; S.runV = 0; S.runOver = 0;   // IMPROVE (2026-10-06)
  S.celebrated = false; S.won = false; S.dipCalled = false;
  S.beatSeq = 0; S.beatGrade = ''; S.beatFoot = ''; S.beatMs = 0; S.beatCall = '';
  S.atM = []; S.prevM = 0; S.prevMs = 0; S.pb = null; S.split = '';
  S.baseFov = null; S.fov = null; S.hudKey = null; S.hudAge = 0;
};

const say = (t: string, sec = 0.9): void => { S.banner = t; S.bannerT = sec; };

// A+ P0 juice (PM brief CARNIVAL-A-PLUS-P0, 2026-09-07): a false start / stumble is light feel only; the finish is one latched
// punch — hit-stop + shake + gold flash on a win, a soft shake on a loss. Pad verbs stay inert; no slowMo.
let finishLatch = false;
function finishBeat(ctx: ModeContext, won: boolean): void {
  if (finishLatch) return; finishLatch = true;
  if (won) { ctx.juice.hitStop(55); ctx.juice.shake(0.12, 150); ctx.juice.flash('#FFD700', 130); console.info('[SPRINT-JUICE] finish punch (win)'); }
  else { ctx.juice.shake(0.06, 120); console.info('[SPRINT-JUICE] finish soft (loss)'); }
}

/** IMPROVE (2026-10-06): the hint follows the race, so the controls are explained where they apply. */
function hintFor(phase: string, distM: number): string {
  if (phase === 'Ready' || phase === 'Set') return 'Do NOT tap before GO — then alternate D-PAD ←/→ in rhythm.';
  if (RACE_DIST - distM <= 20 && !S.dipped) return `Alternate ←/→ · D-PAD ▲ inside the last ${DIP_WINDOW_M} m dips at the tape.`;
  return 'Alternate D-PAD ←/→ — tap as the ring closes.';
}

/**
 * IMPROVE (2026-10-06): pushed on a change, not every frame. Every frame was a React setState in the host and a caption
 * scan in the harness; now a discrete change (phase, banner, a stride, a false start, a split) goes at once and the
 * running numbers (clock, distance, speed, gaps) at SPRINT_HUD_HZ. `force` sends it regardless (load, the end).
 */
function pushHud(ctx: ModeContext, dt = 0, force = false): void {
  const st = core?.state;
  S.hudAge += dt;
  const phase = st?.phase ?? 'Ready';
  const falseStarts = st?.falseStarts ?? 0;
  const key = `${phase}|${S.banner}|${falseStarts}|${S.beatSeq}|${S.split}|${S.dipped ? 1 : 0}|${S.runout === null ? 0 : 1}`;
  if (!force && !hudDue(S.hudKey, key, S.hudAge)) return;
  S.hudKey = key; S.hudAge = 0;
  const dist = st?.distanceM ?? 0;
  const raced = phase === 'Go' || phase === 'Run' || phase === 'Finish';
  const sub13 = pacerDistance(S.rivalT, WIN_TIME, RACE_DIST);
  ctx.setHud({
    phase,
    distance: st ? `${st.distanceM.toFixed(1)}m / ${RACE_DIST}m` : `0m / ${RACE_DIST}m`,
    clock: st ? Number(st.timeS.toFixed(2)) : 0,
    speed: st ? Number(st.speed.toFixed(1)) : 0,
    top: st ? Number(st.topSpeed.toFixed(1)) : 0,
    falseStarts,
    // the price of the next one: the first is the warning, every one after it costs FALSE_START_PENALTY_S
    falseStartRule: falseStarts >= FALSE_START_FREE ? `+${FALSE_START_PENALTY_S.toFixed(2)}s EACH` : 'NEXT ONE COSTS TIME',
    rival: `${S.rivalDist.toFixed(1)}m`,
    // the number the player actually races: the gap to the pacer, and to the sub-13 pace light
    gap: raced ? gapLabel(dist - S.rivalDist) : null,
    sub13: raced && S.runout === null ? gapLabel(dist - sub13) : null,
    split: S.split || null,
    banner: S.banner || null,
    hint: hintFor(phase, dist),
    // the metronome: a ring closes on the beat after every stride (the host restarts it when beat changes)
    beat: S.beatSeq, beatMs: S.beatMs, beatFoot: S.beatFoot || null, beatGrade: S.beatGrade || null, beatCall: S.beatCall || null,
  });
}

/** IMPROVE (2026-10-06): the core's own sounds (SPRINT_SENSORY) — they were never wired, so the gun, the perfect stride and
 *  the finish were silent and a perfect stride sounded like a good one. The false start's is left to the mode's 'miss'
 *  (one sound for one beat); the shakes and the hit-stop stay the mode's (finishBeat is the one latched punch). */
function playSensory(e: SensoryEvent): void {
  if (e === SPRINT_SENSORY.gun) SoundKit.play('impact', { pitch: 1.8, volume: e.volume });              // a crack, not a thud
  else if (e === SPRINT_SENSORY.perfectStep) SoundKit.play('whoosh', { pitch: 1.4, volume: e.volume });
  else if (e === SPRINT_SENSORY.finish) SoundKit.play('crowdCheer', { volume: e.volume });
  else if (e === SPRINT_SENSORY.stumble) SoundKit.play('thud', { volume: e.volume });
}

/** A 100 m race is short: the tape waits a few seconds, not a kart race's fifteen. */
const RIVAL_GRACE_SEC = 5;

function finish(ctx: ModeContext, timeS: number, rawS: number): void {
  if (S.done) return;
  S.done = true;
  // a penalised time can lose to a pacer the legs beat: the pacer's time is RIVAL_TIME_S
  const beat = S.rivalDist < RACE_DIST && timeS < RIVAL_TIME_S;
  const won = timeS <= WIN_TIME && beat;
  S.won = won;
  finishBeat(ctx, won);
  // PB SPLITS: the tape is the last mark (the core's clock at the line), then the run is kept if it is the best
  if (core) trackMarks(ctx, core.state.distanceM, rawS * 1000);
  const saved = saveSprintPbIfFaster(RACE_DIST, { totalMs: Math.round(timeS * 1000), atM: S.atM });
  const pbWords = saved.improved ? (saved.previous ? `NEW PB ${deltaLabel(Math.round(timeS * 1000) - saved.previous.totalMs)}` : 'FIRST PB')
    : saved.previous ? `PB ${deltaLabel(Math.round(timeS * 1000) - saved.previous.totalMs)}` : '';
  const pen = falseStartPenaltyS(core?.state.falseStarts ?? 0);
  say([`${timeS.toFixed(2)}s`, S.reactS !== null ? `REACTION ${S.reactS.toFixed(2)}s` : '', pen > 0 ? `FALSE STARTS +${pen.toFixed(2)}s` : '', pbWords].filter(Boolean).join(' · '), RUNOUT_SEC + 0.5);
  const outcome = won ? 'win' : 'complete';
  const score = Math.max(0, Math.round((20 - timeS) * 120) - S.stumbles * 40);
  const stats = {
    timeS: Number(timeS.toFixed(2)), stumbles: S.stumbles, topSpeed: core?.state.topSpeed ?? 0,
    ...(S.reactS !== null ? { reactionS: Number(S.reactS.toFixed(2)) } : {}),
    beatPacer: beat ? 1 : 0,   // racing pass phase 9: the headline says whether you beat the pacer
  };
  // IMPROVE (2026-10-06): RUN OUT before the result. update() returned the moment S.done was set, so the runner froze
  // mid-stride on the line, the pacer stopped and the camera stopped. The runners now run through and pull up, a winner
  // celebrates, and the result follows RUNOUT_SEC later on the mode clock (a pause holds it). Input is already closed.
  S.runV = core?.state.speed ?? 0; S.runOver = 0;
  S.pendingEnd = () => ctx.end(outcome, score, stats);
  S.runout = RUNOUT_SEC;
}

/** IMPROVE (2026-10-06): PB SPLITS — record the clock at every 10 m crossed since the last frame; call 30 m and 60 m out
 *  loud against the best run. */
function trackMarks(ctx: Ctx, distM: number, ms: number): void {
  for (const c of marksCrossed(S.prevM, distM, S.prevMs, ms)) {
    S.atM[Math.round(c.m / SPRINT_MARK_M) - 1] = Math.round(c.ms);
    if ((SPRINT_CALLED_SPLITS_M as readonly number[]).includes(c.m)) {
      const d = splitDeltaMs(S.pb, c.m, c.ms);
      S.split = [`${c.m} M ${(c.ms / 1000).toFixed(2)}s`, pbSplitWords(d)].filter(Boolean).join(' · ');
      ctx.juice.callout(S.split, d === null ? '#cbd5e1' : d <= 0 ? '#86efac' : '#fca5a5', 900);
    }
  }
  if (distM > S.prevM) { S.prevM = distM; S.prevMs = ms; }
}

return {
  modeId: 'sprint',
  // PLACE LOOKS (2026-09-18): the light and the sky are the place's — getters, because the harness reads both at mount
  get mood() { return readPlaceLook('sprint')?.world?.mood ?? 'daylight'; },
  get backdrop() { return readPlaceLook('sprint')?.world?.backdrop ?? MOOD_TO_FAMILY[readPlaceLook('sprint')?.world?.mood ?? 'daylight']; },
  camPreset: 'runner',

  async load(ctx: ModeContext): Promise<void> {
    reset();

    VenueKit.buildTrack(ctx.scene, RACE_DIST, readPlaceLook('sprint')?.world?.colors ?? {});   // SHARED-PLACE-FLOOR: a tartan straight, not the grey park slab; PLACE: the splash's pick recolours it

    // Lane markings down the straight so speed reads as motion rather than a
    // number changing in the corner.
    // IMPROVE (2026-10-06): one material and one mesh — the nine ticks each had their own PBR material and draw. Named
    // before the merge fills it (the light rig sorts casters from receivers by name as a mesh is added); nothing moves.
    tickMat = VenueKit.paint(ctx.scene, 'laneMat', '#f4f1de', 0.1);   // PBR: a StandardMaterial tick clipped to white
    const tickList: Mesh[] = [];
    for (let m = 10; m < RACE_DIST; m += 10) {
      const tick = MeshBuilder.CreateBox(`lane_${m}`, { width: 3.2, height: 0.02, depth: 0.12 }, ctx.scene);
      tick.position.set(0, 0.011, -m);
      tickList.push(tick);
    }
    ticks = Mesh.MergeMeshes(tickList, true, true, new Mesh('lane_ticks', ctx.scene));
    if (ticks) { ticks.material = tickMat; ticks.isPickable = false; ticks.freezeWorldMatrix(); }

    finishLine = MeshBuilder.CreateBox('finish', { width: 4, height: 0.04, depth: 0.35 }, ctx.scene);
    finishLine.position.set(0, 0.02, -RACE_DIST);
    const fm = new StandardMaterial('finishMat', ctx.scene);
    fm.diffuseColor = Color3.FromHexString('#ffd75e');
    fm.emissiveColor = Color3.FromHexString('#3a3320');
    finishLine.material = fm;
    finishMat = fm;

    // IMPROVE (2026-10-06): THE SUB-13 PACE LIGHT — a win needs ≤ WIN_TIME but the pacer runs RIVAL_TIME_S, so beating the
    // pacer could still end "complete". A green bar in your lane runs a WIN_TIME race on the pacer's curve: stay ahead of
    // it and it is sub-13. And THE PB MARKER — a blue bar where your best run was at this point of its race (hidden with no
    // best). Both flat strips in the runner's lane, never pickable.
    const strip = (name: string, hex: string): Mesh => {
      const m = MeshBuilder.CreateBox(name, { width: 1.4, height: 0.012, depth: 0.22 }, ctx.scene);
      const mat = VenueKit.paint(ctx.scene, `${name}Mat`, hex, 0.9);
      markerMats.push(mat);
      m.material = mat; m.isPickable = false; m.position.set(RUNNER_X, 0.016, 0); m.isVisible = false;
      return m;
    };
    paceLight = strip('sprint_pace_light', '#4ade80');
    pbMarker = strip('sprint_pb_marker', '#60a5fa');
    S.pb = loadSprintPb(RACE_DIST);

    // IMPROVE (2026-10-06): the two bodies spawn together (CharacterLibrary caches the container per URL).
    [runner, rival] = await Promise.all([
      CharacterLibrary.spawn(ctx.scene, '', {
        position: new Vector3(RUNNER_X, 0, 0), yawRad: Math.PI, startClip: 'idle_stand', modeId: 'sprint',
      }),
      CharacterLibrary.spawn(ctx.scene, '', {
        position: new Vector3(0.9, 0, 0), yawRad: Math.PI, tint: '#8b1e2d',
        startClip: 'idle_stand', modeId: 'sprint-rival',
      }),
    ]);
    for (const c of [runner, rival]) {
      neverBindPose(c.animator, 'idle_stand');
      installSafePlay(c.animator, 'sprint');
      ctx.groundLock.track(c.root, c.skeleton);
    }
    ctx.heroRef.current = runner.root;
    // Deliberately NULL. FrameGuard's auto-recenter calls
    // camDirector.snapTo(hero, objectiveRef), so pointing this at the finish
    // tape 100m away made every recenter re-frame the whole straight: the camera
    // parked at y=8.5, the 'runner' preset's 22-degree pitch cap meant it could
    // not tilt down to the runner, FrameGuard declared the hero off-screen, and
    // it recentred to the same wrong place forever. A follow-cam race has no
    // second subject to frame.
    ctx.objectiveRef.current = null;

    core = makeSprintRace(undefined, {
      // IMPROVE (2026-10-06): the SET hold is drawn each time (setMs to setMs + SPRINT_SET_JITTER_MS), so the gun is heard,
      // not counted; and the core's sounds are heard — its gun is the start now (it was the whistle), see playSensory
      setHoldMs: () => randomSetHoldMs(),
      onSensory: playSensory,
      onPhase: (phase) => {
        if (phase === 'Set') say('SET', 1.0);
        else if (phase === 'Go') { say('GO!', 0.8); S.goAt = performance.now(); }
        else if (phase === 'Ready') S.goAt = null;   // MOVEMENT PLAY P8: back to the blocks (a false start)
      },
      onFinish: (rawS) => {
        // the dip, if it came in time; IMPROVE (2026-10-06): every false start past the first adds FALSE_START_PENALTY_S
        const timeS = Math.max(0, rawS - (S.dipped ? DIP_BONUS_S : 0)) + falseStartPenaltyS(core?.state.falseStarts ?? 0);
        SoundKit.play('score');
        finish(ctx, timeS, rawS);   // the banner (time, reaction, penalty, PB) is finish()'s
      },
    });

    // Objective NULL here too, matching update(). Handing snapTo a target 12m
    // down-track drove the camera to y=8.5, and the 'runner' preset caps pitch
    // at 22 degrees, so it physically could not tilt down far enough to see the
    // runner — FrameGuard reported "hero off-screen" every frame.
    ctx.camDirector.snapTo(runner.root.position, null);
    say('ON YOUR MARKS', 1.2);
    // MOVEMENT PLAY P8: the probe's read-only seam
    (ctx.scene.metadata ??= {}).sprint = { state: () => ({ ...core!.state, reactS: S.reactS, dipped: S.dipped, stumbles: S.stumbles, rivalDist: +S.rivalDist.toFixed(1), body: { ...S.body }, cadence: core!.cadenceStats }) };
    pushHud(ctx, 0, true);
  },

  onInput(ctx: ModeContext, e: FelInput): void {
    if (e.t === 'stick' && e.side === 'R') { S.lookX = e.x; S.lookY = e.y; return; }   // MODE-STICK-FACE: R stick → the director's look orbit
    if (S.done || !core) return;
    // RACING PASS phase 3: the face buttons, the shoulders, the clicks and the triggers answered NOTHING — 13 % of the
    // masher's presses were silent, the only silent presses in the racing suite. The race is the d-pad; every other press
    // now says so (a trigger once per squeeze — the bus re-emits a held trigger every frame).
    if (e.t === 'button' && e.pressed) { refuse(ctx, 'THE D-PAD RUNS — ALTERNATE ← →'); return; }
    if (e.t === 'trigger') {
      const side = e.side === 'L' ? 'trigL' : 'trigR';
      const down = e.value >= 0.5;
      if (down && !S[side]) refuse(ctx, 'THE D-PAD RUNS — ALTERNATE ← →');
      S[side] = down; return;
    }
    if (e.t !== 'dpad' || !e.pressed) return;
    // THE DIP AT THE TAPE (racing pass phase 8): Track & Field's last press. d-pad UP inside the final DIP_WINDOW_M metres
    // leans the chest over the line (DIP_BONUS_S off the clock, once); earlier than that it is refused by name.
    if (e.dir === 'up' && (core.state.phase === 'Run' || core.state.phase === 'Go')) {
      const left = RACE_DIST - core.state.distanceM;
      if (S.dipped) return;
      if (left > DIP_WINDOW_M) { refuse(ctx, 'DIP AT THE TAPE — NOT YET'); return; }
      dipAtTape(ctx, left);
      return;
    }
    if (e.dir !== 'left' && e.dir !== 'right') return;
    takeStride(ctx, e.dir === 'left' ? 'L' : 'R');
  },

  // MOVEMENT PLAY P8: the steps are the mode's, graded here on the capture clock — the claim takes the P3 row's step → d-pad
  // off the floor (dropping it is the cut line); the card says the stride and the dip this mode reads itself
  body: { claims: ['step'], lines: rideLines('sprint', ['step']) },
  onBody(ctx: ModeContext, ev: BodyEvent, view: BodyView): boolean {
    if (ev.kind !== 'step' || S.done || !core || core.state.phase === 'Finish') return false;
    const q = stride.grade(ev, view);
    if (!q) return false;
    // captured before the gun: a false start whenever it arrives (the core's Ready / Set handle the rest)
    const early = S.goAt === null ? core.state.phase === 'Go' || core.state.phase === 'Run' : ev.t < S.goAt;
    const react = S.goAt !== null && !early ? Math.max(0, (ev.t - S.goAt) / 1000) : null;
    const before = core.state.falseStarts;
    takeStride(ctx, ev.foot, { quality: q, early }, react);
    if (core.state.falseStarts > before) { S.body.falseStarts++; stride.reset(); }
    else { S.body.strides++; if (q !== 'first') S.body[q]++; }
    return true;
  },

  update(ctx: ModeContext, dt: number): void {
    if (!core || !runner || !rival || !finishLine) return;
    if (S.done) { if (S.runout !== null) runOut(ctx, dt); return; }   // IMPROVE (2026-10-06): the run-out after the tape
    // MOVEMENT PLAY P8: the chest dipped at the tape (a body's dip earlier than the window is never refused out loud)
    for (const it of rideIntents.poll(ctx.body?.() ?? null, { airborne: false })) {
      if (it.kind === 'dip' && (core.state.phase === 'Run' || core.state.phase === 'Go')) {
        const left = RACE_DIST - core.state.distanceM;
        if (!S.dipped && left <= DIP_WINDOW_M) { dipAtTape(ctx, left); S.body.dips++; }
      }
    }
    updateRace(ctx, dt);
  },

  dispose(): void {
    runner?.dispose(); runner = null;
    rival?.dispose(); rival = null;
    finishLine?.dispose(); finishLine = null;
    // IMPROVE (2026-10-06): the ticks, their material, finishMat and the two lane markers were never released
    ticks?.dispose(); ticks = null;
    tickMat?.dispose(); tickMat = null;
    finishMat?.dispose(); finishMat = null;
    paceLight?.dispose(); paceLight = null;
    pbMarker?.dispose(); pbMarker = null;
    for (const m of markerMats) m.dispose();
    markerMats.length = 0;
    S.pendingEnd = null; S.runout = null;   // a result held by the run-out is not sent from a torn-down mode
    core = null;
  },
};

/** The dip at the tape (the d-pad's UP and a body's chest alike). */
function dipAtTape(ctx: Ctx, left: number): void {
  S.dipped = true; say('DIP!', 0.6); SoundKit.play('whoosh', { pitch: 1.3, volume: 0.45 }); ctx.juice.shake(0.03, 80);
  console.info(`[SPRINT-DIP] ${left.toFixed(2)} m out`);
}

/** One stride: the d-pad's (graded by the core on its own clock) or a body's (graded on the capture clock: `opts`, and the
 *  reaction `react` measured on that clock too). */
function takeStride(ctx: Ctx, side: 'L' | 'R', opts?: { quality: import('@/lib/feel').CadenceQuality; early: boolean }, react: number | null = null): void {
    if (!core) return;
    const beforeFalse = core.state.falseStarts;
    const beforeSpeed = core.state.speed;
    const offTheGun = core.state.phase === 'Go', gunClock = react ?? core.state.timeS;
    core.step(side, opts);
    // THE REACTION: the first clean stride after the gun is timed and called — the start is a skill you can see
    if (offTheGun && core.state.falseStarts === beforeFalse && S.reactS === null) {
      S.reactS = gunClock;
      const grade = gunClock < 0.2 ? 'LIGHTNING' : gunClock < 0.35 ? 'SHARP' : gunClock < 0.6 ? 'OK' : 'SLOW';
      ctx.juice.callout(`${grade} START — ${gunClock.toFixed(2)} s`, gunClock < 0.35 ? '#fde047' : '#cbd5e1', 900);
      console.info(`[SPRINT-START] reaction ${gunClock.toFixed(2)} ${grade}`);
    }

    if (core.state.falseStarts > beforeFalse) {
      S.stumbles += 1;
      // IMPROVE (2026-10-06): REPEAT FALSE STARTS COST TIME. They were unlimited and only counted; the first is still the
      // warning, and every one after it adds FALSE_START_PENALTY_S to the finish — said here, when it is earned.
      const fs = core.state.falseStarts;
      say(fs > FALSE_START_FREE ? `FALSE START! +${falseStartPenaltyS(fs).toFixed(2)}s` : 'FALSE START! — THE NEXT ONE COSTS TIME', 1.3);
      SoundKit.play('miss');
      ctx.feel.impact(0.2);   // A+ P0: light feel only (was 0.5)
      S.lastSide = null; S.streak = 0;
      return;
    }
    // IMPROVE (2026-10-06): THE METRONOME — every stride after the gun restarts the host's closing ring on the beat it is
    // judged against (the core's 200 ms for a thumb, a body's cadence for a body), coloured by this stride's grade; and an
    // off-beat stride is told WHICH WAY to correct (the core grades on |error|, so 'off' said nothing about the sign).
    const graded = core.state.lastStep;
    if (graded === 'PERFECT' || graded === 'GOOD' || graded === 'OFF' || graded === 'FIRST' || graded === 'STUMBLE') {
      S.beatSeq += 1;
      S.beatGrade = graded.toLowerCase();
      S.beatFoot = side === 'L' ? 'R' : 'L';
      S.beatMs = opts ? Math.round(1000 / BODY_PERFECT_HZ) : SPRINT_TUNING.targetIntervalMs;
      // a body's 'off' alternating stride is a slow one (BodyStride grades a rate floor, not a window)
      const call = graded !== 'OFF' ? null : opts ? (side !== S.lastSide ? 'FASTER' : null) : cadenceCall(core.lastErrorMs);
      S.beatCall = call ?? '';
      if (call) say(call, 0.45);
    }
    // A same-side tap is a stumble in the core; surface it so the rhythm is
    // learnable rather than mysterious.
    if (side === S.lastSide && core.state.speed < beforeSpeed) {
      S.stumbles += 1; S.streak = 0;
      say('STUMBLE', 0.7);
      ctx.feel.impact(0.15);   // A+ P0: light feel only
    } else if (S.lastSide !== null && side !== S.lastSide) {
      // SCORECARD FEEL (2026-09-15): a clean stride was answered only by a HUD number and the run cycle speeding up — 15 %
      // of presses had anything you could hear. Every clean stride is a spike on the track now, brighter as the speed
      // builds, and every tenth in a row is a beat of its own.
      const speed01 = Math.min(1, core.state.speed / 11);
      SoundKit.play('uiTick', { pitch: 0.8 + speed01 * 0.9, volume: 0.22 + speed01 * 0.18 });
      S.streak += 1;
      if (S.streak % 10 === 0) { ctx.juice.callout(`RHYTHM ×${S.streak}`, '#fde047', 600); ctx.juice.shake(0.03, 90); }
    }
    S.lastSide = side;
}

/** The race's frame (the pre-P8 update, unchanged). */
function updateRace(ctx: Ctx, dt: number): void {
    if (S.done || !core || !runner || !rival || !finishLine) return;

    core.tick(dt * 1000);
    const st = core.state;

    runner.root.position.z = -st.distanceM;
    // IMPROVE (2026-10-06): the tape this frame — finish() has started the run-out, which owns every frame from the next
    // (and the rival's grace clock must not call "RIVAL WINS" over a finished race)
    if (S.done) return;
    // SHARED-ANIM-BUS (2026-09-14): the loop off the bus, at the stride rate — the run cycle played at one cadence from a
    // jog to a 10 m/s finish, so the feet skated early and paddled late
    const loco = locoPick({ speed: st.speed });
    runner.animator.play(loco.clip, { loop: true });
    runner.animator.setPlaybackScale(loco.clip, loco.rate);

    // The rival runs once the gun has gone — from GO (racing pass phase 10). It waited for 'Run', which the core enters
    // on the PLAYER's first stride, so a runner who never pressed stood at GO for ever with the pacer frozen beside
    // them and the race's own end ("the race ends for everyone") unreachable: measured, an idle sprint never ended.
    if (st.phase === 'Go' || st.phase === 'Run' || st.phase === 'Finish') {
      stepRival(dt);
      // THE RACE ENDS FOR EVERYONE (MECHANICS PASS, 2026-09-15). The sprint only ended on the PLAYER's tape, so a runner
      // who never found the rhythm stood on a straight that could not finish. The rival breasting the tape now starts a
      // short visible clock; when it runs out the race is called and you did not finish.
      const g = stepFinishGrace(S.graceLeft, dt, S.rivalDist >= RACE_DIST, RIVAL_GRACE_SEC);
      S.graceLeft = g.left;
      if (g.started) { SoundKit.play('whistle'); say(`RIVAL WINS — ${RIVAL_GRACE_SEC}s TO THE TAPE`, 1.4); }
      else if (g.tick !== null && g.tick > 0) say(`FINISH IN ${g.tick}`, 0.9);
      if (g.expired) {
        S.done = true; finishBeat(ctx, false); SoundKit.play('miss');
        say('DID NOT FINISH', 2);
        pushHud(ctx, 0, true);
        ctx.end('dnf', 0, { timeS: Number(st.timeS.toFixed(2)), stumbles: S.stumbles, topSpeed: st.topSpeed, distanceM: Number(st.distanceM.toFixed(1)) });
        return;
      }
    }

    // IMPROVE (2026-10-06): PB splits at every 10 m (30 m and 60 m called), and DIP NOW the moment the window opens — the
    // dip was only ever refused when early, so most players never found it
    if (st.phase === 'Run' || st.phase === 'Go') {
      trackMarks(ctx, st.distanceM, st.timeS * 1000);
      if (!S.dipCalled && !S.dipped && RACE_DIST - st.distanceM <= DIP_WINDOW_M) {
        S.dipCalled = true;
        say('DIP NOW ▲', 0.6);
        ctx.juice.callout('DIP NOW ▲', '#fde047', 500);
        SoundKit.play('uiTick', { pitch: 2.0, volume: 0.35 });
      }
    }
    placeMarkers(st.phase === 'Go' || st.phase === 'Run');

    if (S.bannerT > 0) { S.bannerT -= dt; if (S.bannerT <= 0) S.banner = ''; }

    follow(ctx, dt, st.speed);
    pushHud(ctx, dt);
}

/** The rival's frame: its pacer curve from the gun to the tape, then a run-out past it. IMPROVE (2026-10-06): it ran a
 *  constant RACE_DIST / 13.4 m/s from the gun — it jumped ahead instantly — and stood still, legs cycling, at the tape. */
function stepRival(dt: number): void {
  if (!rival) return;
  S.rivalT += dt;
  S.rivalDist = pacerDistance(S.rivalT, RIVAL_TIME_S, RACE_DIST);
  let v = pacerSpeed(S.rivalT, RIVAL_TIME_S, RACE_DIST);
  if (S.rivalDist >= RACE_DIST) {
    S.rivalOverV = Math.max(0, (S.rivalOverV ?? v) - RUNOUT_DECEL * dt);
    S.rivalOver += S.rivalOverV * dt;
    v = S.rivalOverV;
  }
  rival.root.position.z = -(S.rivalDist + S.rivalOver);
  const rivalLoco = locoPick({ speed: v });
  rival.animator.play(rivalLoco.clip, { loop: true });
  rival.animator.setPlaybackScale(rivalLoco.clip, rivalLoco.rate);
}

/** The pace light and the PB marker, on the rival's clock (the gun's), shown only while the race is on. */
function placeMarkers(on: boolean): void {
  if (paceLight) {
    paceLight.isVisible = on;
    if (on) paceLight.position.z = -pacerDistance(S.rivalT, WIN_TIME, RACE_DIST);
  }
  if (pbMarker) {
    const d = on ? pbDistanceAt(S.pb, S.rivalT * 1000) : null;
    pbMarker.isVisible = d !== null && d < RACE_DIST;
    if (d !== null) pbMarker.position.z = -d;
  }
}

/** The camera, every frame of the race and the run-out. */
function follow(ctx: Ctx, dt: number, speed: number): void {
  if (!runner) return;
  // Pure follow-cam: objective NULL, exactly as FootballRushMode (the other
  // 'runner'-preset mode) does. Feeding it a target point pushed the camera to
  // y=8.5 trying to frame both, FrameGuard then reported the hero off-screen
  // and fought back with auto-recenters, and the shot ended up on nothing.
  ctx.camDirector.look(S.lookX, S.lookY, dt);
  ctx.camDirector.update(runner.root.position, camVel.set(0, 0, -speed), null);   // IMPROVE (2026-10-06): a scratch vector
  // IMPROVE (2026-10-06): A SPEED FOV KICK — the racers and Free Run open the lens with speed; sprint had none, so 10 m/s
  // looked like a jog. SpeedFov's eased kick across the core's maxSpeed. The 'runner' preset has no fovGain, so the
  // director eases the lens back to its base every update — this mode keeps its own lens (S.fov) and writes it after.
  const cam = ctx.camera;
  if (cam) {
    S.baseFov ??= cam.fov;
    S.fov = stepSpeedFov(S.fov ?? S.baseFov, S.baseFov, speed, SPRINT_TUNING.maxSpeed, dt, { gain: SPRINT_FOV_GAIN });
    cam.fov = S.fov;
  }
}

/** IMPROVE (2026-10-06): THE RUN-OUT. Past the tape the runner runs through and pulls up (a winner's arms go up once he
 *  is down to a jog), the rival runs his race out, the camera follows, and the result goes when RUNOUT_SEC is up. */
function runOut(ctx: Ctx, dt: number): void {
  if (!runner || S.runout === null) return;
  S.runout -= dt;
  S.runV = Math.max(0, S.runV - RUNOUT_DECEL * dt);
  S.runOver += S.runV * dt;
  runner.root.position.z = -(RACE_DIST + S.runOver);
  if (S.won && !S.celebrated && S.runV < 4) {
    S.celebrated = true;
    runner.animator.play(SPORT_CLIP.scoreCelebrate, { loop: false, fadeSec: 0.2 });
  } else if (!S.celebrated) {
    const loco = locoPick({ speed: S.runV });
    runner.animator.play(loco.clip, { loop: true });
    runner.animator.setPlaybackScale(loco.clip, loco.rate);
  }
  stepRival(dt);
  placeMarkers(false);
  if (S.bannerT > 0) { S.bannerT -= dt; if (S.bannerT <= 0) S.banner = ''; }
  follow(ctx, dt, S.runV);
  pushHud(ctx, dt);
  if (S.runout <= 0) {
    S.runout = null;
    const end = S.pendingEnd; S.pendingEnd = null;
    pushHud(ctx, 0, true);
    end?.();
  }
}
}

export const SprintMode: ModeDefinition = makeSprintMode();
