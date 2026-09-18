// DunkMode — what the dunk contest LOOKS LIKE.
//
// The other half of the M63 split. `DunkSim.ts` owns what the game IS; this
// file owns meshes, camera, HUD, audio and the two tells. It holds no rules:
// every number it draws was computed by the sim, and if this file were deleted
// the contest would still run, still score identically, and still verify.
//
// That is the property the split exists for. M63's 521 lines could not be
// tested at all, because reading a score required a `Scene`.
//
// THE LINE-COUNT GATE, ANSWERED HONESTLY
// M84 claimed a mode could adopt five subsystems in twenty lines. The claim is
// measured here, not in a README — `ADOPTION_LINES` below counts the lines in
// this file that exist solely because of `ModeKit`, and a test asserts the
// count. It is 18. Every one of them replaces work this mode was NOT doing:
// deterministic ticks, PRQ-scaled windows, captions, ghost recording, one exit
// path.
//
// TWO OF M84'S FIVE MARKERS DO NOT APPLY HERE, AND THAT IS THE FINDING.
// `kit.move` is locomotion, and a dunk contest has none — the approach phase
// selects a style, it does not walk. Forcing the call to make a checklist go
// green would be the `CameraStandoff` failure again: a marker present in the
// source and doing nothing. `MIGRATION_MARKERS` needs per-mode applicability,
// not a flat list of five. Recorded here rather than fixed, because pass 2
// forbids restructuring a subsystem mid-phase.
//
// WHAT THIS FILE IS NOT
// It has not been executed. Babylon does not run in the test harness, and the
// app source still is not in this repo. Everything below the sim boundary is
// tested by execution; everything above it is reviewed code. Saying so is the
// point of pass 2 — see `docs/GAP-AND-PASS-2.md`.

import { MeshBuilder, Vector3, Color3, StandardMaterial } from '@babylonjs/core';
import type { AbstractMesh } from '@babylonjs/core';
import { CharacterLibrary, type SpawnedCharacter } from '../../core/CharacterLibrary';
import type { ModeContext, ModeDefinition } from '../../core/ModeHarness';
import type { FelInput } from '../../core/InputBus';
import type { Intent } from '../../core/PlayerSlot';
import { ModeKit } from '../../core/ModeKit';
import { tell } from '../../core/Legibility';
import { rimClearanceCm } from '../../core/DunkTiers';
import { installSafePlay, SPORT_CLIP } from '../../anim/clipRegistry';
import { neverBindPose } from '../../anim/importSanitizer';
import { attachBallToHand, releaseBall, flushThroughRim, clankOffRim } from '../../anim/ballRig';
import { SoundKit } from '../../audio/SoundKit';
import { DUNK_CONFIG as CFG } from '../modeConfigs';
import {
  DunkSim, DEFAULT_CONFIG, TOTAL_ROUNDS, DUNKS_PER_ROUND, BUDGET_SEC,
  qteWindow, scoreNeeded, initialState, QTE_HALF_WIDTH,
  type DunkState, type DunkConfig, type DunkPhase,
} from './DunkSim';

const STYLE_LABEL = { power: 'POWER', flashy: 'FLASHY', sig: 'SIGNATURE' } as const;
const PROP_LABEL = { none: 'NO PROP', alleyoop: 'ALLEY-OOP', obstacle: 'OBSTACLE' } as const;
const STYLE_CLIP = { power: SPORT_CLIP.dunkPower, flashy: SPORT_CLIP.dunkFlashy, sig: SPORT_CLIP.dunkSignature };

/**
 * The QTE window in ms at zero style taps, for `kit.window()` to scale.
 *
 * The sim expresses the window as a fraction of the cinematic; `kit.window()`
 * speaks milliseconds. This is the conversion, and it is the only place the
 * two units meet.
 */
const QTE_BASE_MS = QTE_HALF_WIDTH * 2 * BUDGET_SEC.cinematic * 1000;

/**
 * Lines in this file that exist solely to adopt `ModeKit`.
 *
 * Asserted by a test rather than claimed in prose, because M84's whole
 * justification was a line count and an unverified line count is a slogan.
 */
export const ADOPTION_LINES = 18;

export const DunkMode: ModeDefinition = (() => {
  let kit: ModeKit;                                       // [kit 1]
  let cfg: DunkConfig = DEFAULT_CONFIG;
  let state: DunkState = initialState(DEFAULT_CONFIG);
  let athlete: SpawnedCharacter | null = null;
  let ball: AbstractMesh | null = null;
  let reachArc: AbstractMesh | null = null;
  let prqGlyphShown = false;
  let lastPhase: DunkPhase = 'approach';
  let ended = false;

  // Input arrives as events and the sim consumes it per tick, so it is
  // latched here and drained by `intent()`. Anything else would drop a tap
  // that landed between ticks — the QTE is 4 frames wide at 2 style taps.
  const pressed = { action: false, pass: false, steal: false };
  let held = 0;
  /** The intent the current tick is being simulated from — see `update`. */
  let ticked: Intent = { moveX: 0, moveY: 0, sprint: false, action: false, actionHeld: 0, pass: false, steal: false };

  function intent(): Intent {                             // [kit 2]
    const i: Intent = {
      moveX: 0, moveY: 0, sprint: false,
      action: pressed.action, actionHeld: held,
      pass: pressed.pass, steal: pressed.steal,
    };
    pressed.action = pressed.pass = pressed.steal = false;
    return i;
  }

  // ── tells ──────────────────────────────────────────────────────────────

  /**
   * `dunk_tier_reach` — an arc at the height this athlete's vertical actually
   * reaches above the rim.
   *
   * The mechanic M85 built is invisible without it: a player told "one-hand
   * only" with no reason reads it as the game being arbitrary. The arc is the
   * reason, drawn in world space where the decision is made.
   */
  function drawReachTell(ctx: ModeContext): void {
    const t = tell('dunk_tier_reach');
    if (!t) return;
    const cm = rimClearanceCm(cfg.profile);
    reachArc?.dispose();
    reachArc = MeshBuilder.CreateTorus('reach_tell',
      { diameter: 0.55, thickness: 0.02, tessellation: 24 }, ctx.scene);
    reachArc.position = new Vector3(0, CFG.rimHeight + cm / 100, CFG.rimZ);
    reachArc.rotation.x = Math.PI / 2;
    const m = new StandardMaterial('reach_tell_m', ctx.scene);
    // Above the rim is reachable, below it is not. Two shapes would be better
    // than two colours; the height difference IS the second channel here.
    m.emissiveColor = cm > 0 ? Color3.FromHexString('#3fd67a') : Color3.FromHexString('#d6603f');
    m.alpha = 0.65;
    reachArc.material = m;
    kit.cue(`${t.caption}: ${cm > 0 ? `${Math.round(cm)}cm above the rim` : 'below the rim'}`, 'info');
  }

  /** `prq_effect` — once, on the first attempt, so the player knows why the
   *  judges are harder today. Silent after that; a permanent badge is noise. */
  function showPrqTell(ctx: ModeContext): void {
    if (prqGlyphShown) return;
    prqGlyphShown = true;
    const t = tell('prq_effect');
    if (!t || cfg.judgeStrictness === 1) return;
    ctx.setHud({ prqTell: `${t.visual.glyph} ${t.caption}` });
    kit.cue(t.caption, 'info');                           // [kit 3]
    setTimeout(() => ctx.setHud({ prqTell: '' }), t.visual.durationMs);
  }

  // ── presentation reacting to sim phase ─────────────────────────────────

  function onPhaseChange(ctx: ModeContext, to: DunkPhase): void {
    switch (to) {
      case 'charge':
        kit.sound(() => SoundKit.play('charge'), 'CHARGING', 'action');   // [kit 4]
        break;
      case 'cinematic': {
        ctx.camDirector.cut('dunk_air');
        const clip = STYLE_CLIP[state.style];
        athlete && installSafePlay(athlete, clip, { loop: false });
        ball && attachBallToHand(athlete, ball);
        // The window the player must hit, drawn where they can see it. It is
        // narrower than it was a second ago if they showboated, and that
        // narrowing is the decision the phase exists to offer.
        // Same scale the sim scores with. A drawn window that disagrees with
        // the judged one is worse than drawing nothing — it teaches a timing
        // that loses, and the assist players are the ones it misleads.
        const w = qteWindow(state.styleTaps, cfg.qteWindowScale);
        ctx.setHud({ qteFrom: w.from.toFixed(2), qteTo: w.to.toFixed(2) });
        break;
      }
      case 'resolve':
        ctx.camDirector.cut('rim');
        ball && releaseBall(ball);
        if (state.qteHit) { flushThroughRim(ball); kit.sound(() => SoundKit.play('flush'), 'FLUSH', 'action'); }
        else { clankOffRim(ball); kit.sound(() => SoundKit.play('clank'), 'OFF THE RIM', 'action'); }
        break;
      case 'judging': {
        const total = state.lastScores.reduce((n, j) => n + j.score, 0);
        ctx.setHud({ judges: state.lastScores.map((j) => j.score).join(' · '), lastTotal: total });
        state.lastScores.forEach((j) => kit.cue(j.line, 'info'));
        if (state.chain > 0) kit.sound(() => SoundKit.play('hype'), `CHAIN ×${state.chain}`, 'action');
        break;
      }
      case 'rivalTurn':
        ctx.camDirector.cut('wide');
        kit.cue('RIVAL UP', 'info');
        break;
      case 'contestOver':
        finish(ctx);
        break;
      default:
        ctx.camDirector.cut('follow');
    }
  }

  function finish(ctx: ModeContext): void {
    if (ended) return;
    ended = true;
    kit.finish(state.playerTotal, state.outcome);         // [kit 5]
    ctx.end(state.outcome, state.playerTotal, {
      rounds: TOTAL_ROUNDS,
      dunks: TOTAL_ROUNDS * DUNKS_PER_ROUND,
      rivalTotal: state.rivalTotal,
      hype: state.hype,
      maxChain: state.chain,
    });
  }

  function hud(ctx: ModeContext): void {
    const need = scoreNeeded(state);
    ctx.setHud({
      round: `${state.round}/${TOTAL_ROUNDS}`,
      style: STYLE_LABEL[state.style],
      prop: PROP_LABEL[state.prop],
      charge: Math.round(state.charge * 100),
      you: state.playerTotal,
      rival: state.rivalTotal,
      hype: Math.round(state.hype),
      // THE NEED, from M63 — the line that makes the last dunk tense.
      need: need === null ? '' : `NEED ${need}`,
      // Honest before the receipt returns, which is the point of the estimate.
      prq: kit.estimatedPrq(state.playerTotal, state.ended).toFixed(1),  // [kit 6]
    });
  }

  return {
    modeId: 'dunk',
    mood: 'arena_night',
    camPreset: 'sport',

    async load(ctx: ModeContext): Promise<void> {
      // `captureHashes` is NOT optional for a mode that wants to be verified.
      // Without it `SimLoop.finish()` returns a replay with no final hash, and
      // `verifyMatch` refuses it outright — every recorded dunk would be
      // unverifiable while looking perfectly well-formed. Found by M102
      // building the server side and running a real match through it.
      kit = await ModeKit.create({ modeId: 'dunk', record: true, captureHashes: true }); // [kit 7]
      if (ctx.cancelled()) { kit.dispose(); return; }

      // PRQ becomes two numbers the sim can use. Nothing else in the mode
      // reads DDA, so difficulty can never disagree with itself.
      cfg = {
        ...DEFAULT_CONFIG,
        judgeStrictness: 0.85 + kit.dda.playerPRQ / 200,                 // [kit 8]
        rivalSkill: 1 - kit.dda.aiReactionSpeed(0, 0),                   // [kit 9]
        // The QTE window, through PRQ catch-up AND the accessibility assist,
        // in one call so the two can never be applied in the wrong order.
        // Resolved once at load and carried as config, because a window that
        // varied mid-run would be invisible to the server re-simulating it.
        qteWindowScale: kit.window(QTE_BASE_MS) / QTE_BASE_MS,           // [kit 10]
      };
      state = initialState(cfg);

      athlete = await CharacterLibrary.spawn(ctx.scene, 'player');
      if (ctx.cancelled()) { kit.dispose(); return; }
      neverBindPose(athlete);

      ball = MeshBuilder.CreateSphere('ball', { diameter: 0.24 }, ctx.scene);
      MeshBuilder.CreateTorus('rim', { diameter: CFG.rimDiameter, thickness: 0.02 }, ctx.scene)
        .position = new Vector3(0, CFG.rimHeight, CFG.rimZ);

      drawReachTell(ctx);
      ctx.onDispose('dunk:kit', () => kit.dispose());                    // [kit 11]
      ctx.onDispose('dunk:meshes', () => { reachArc?.dispose(); ball?.dispose(); athlete?.dispose(); });
    },

    onInput(_ctx: ModeContext, e: FelInput): void {
      if (e.type === 'down') {
        if (e.action === 'primary') { pressed.action = true; held = 0.001; }
        if (e.action === 'pass') pressed.pass = true;
        if (e.action === 'steal') pressed.steal = true;
      }
      if (e.type === 'up' && e.action === 'primary') held = 0;
    },

    update(ctx: ModeContext, dt: number): void {
      if (ended) return;
      if (held > 0) held += dt;
      kit.tickCaptions();                                                // [kit 12]

      // One call: fixed ticks, latched intent, per-tick fingerprint. The mode
      // never sees a frame time, which is what makes the run replayable.
      //
      // `ticked` is not a convenience. `SimLoop.frame` calls `intentFn` once
      // per tick and records THAT object; stepping the sim from a second call
      // would simulate one input and record another — the exact shape of the
      // M91 bug where Cash Arena rejected every honest player. The simulated
      // intent and the recorded intent must be the same object.
      kit.frame(dt, (fixedDt) => {                                       // [kit 13]
        state = DunkSim.step(state, ticked, kit.sim.rng, fixedDt, cfg);  // [kit 14]
      }, () => (ticked = intent()), () => DunkSim.fingerprint(state));   // [kit 15]

      if (state.phase !== lastPhase) { lastPhase = state.phase; onPhaseChange(ctx, state.phase); }
      if (state.phase === 'charge') showPrqTell(ctx);

      // Interpolation is render-only. The sim never sees alpha.
      if (athlete && state.phase === 'cinematic') {
        const p = Math.min(1, (state.phaseSec + kit.alpha * (1 / 60)) / BUDGET_SEC.cinematic); // [kit 16]
        athlete.position.y = CFG.rimHeight * Math.sin(p * Math.PI) * 0.9;
      }
      // Shake is gated: zero under reduced motion, no branch at the call site.
      ctx.camDirector.shake(kit.shake(state.chain > 0 ? 0.4 : 0.15));    // [kit 17]
      hud(ctx);
    },

    dispose(): void {
      // Idempotent by construction — `finish` latches and `ModeKit.finish`
      // latches independently. A mode that ends on both a timer and a score
      // condition double-reported in this codebase before.
      kit?.dispose();                                                    // [kit 18]
      ended = true;
    },
  };
})();
