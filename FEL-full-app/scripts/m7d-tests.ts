/**
 * scripts/m7d-tests.ts — M7c(part 2) full-library conversion contract tests.
 * ==========================================================================
 * Covers the four scenes upgraded from the old scrub/QTE approach to true
 * free-locomotion, fully FSM-driven scenes (same library the completed
 * basketball-3d / soccer-3d scenes use):
 *   • dunk-game-3d       (modeId basketball_dunk)
 *   • three-point-3d     (modeId basketball_h2h)
 *   • three-v-three-3d   (modeId basketball_3v3)
 *   • karate-versus-3d   (modeId karate_endless)
 *
 * The anim audit these assertions encode (per M7 acceptance):
 *   (a) zero T-poses            → isValidDecision on every decision
 *   (b) zero slide-walking      → locomotionInvariantHolds every frame
 *   (c) idle when stationary    → speed01≈0 yields a looping idle clip
 *   (d) actions are one-shot     → strikes/dunks latch then blend back to loco
 */
import { strict as assert } from 'node:assert';
import {
  resolve, AnimDirectorFSM, dunkStyleClip,
  isValidDecision, locomotionInvariantHolds, LOCO_BANDS,
} from '../lib/anim/state-machine';
import { CLIPS, isLoopClip } from '../lib/anim/clip-registry';

let pass = 0;
const t = (label: string, fn: () => void) => {
  fn();
  pass++;
  console.log('  \u2713 ' + label);
};

console.log('\n\u2500\u2500 M7c full-library conversion (dunk / 3pt / 3v3 / karate-vs) \u2500\u2500\n');

// ============================================================
// 1. DUNK — basketball_dunk resolve() phase machine
// ============================================================
t('dunk: charging → dunkCharge (loop)', () => {
  const c = resolve('basketball_dunk', 'charging', '');
  assert.equal(c.name, CLIPS.dunkCharge);
  assert.equal(c.loop, true);
});
t('dunk: launch → dunkLaunch (one-shot)', () => {
  const c = resolve('basketball_dunk', 'launch', '');
  assert.equal(c.name, CLIPS.dunkLaunch);
  assert.equal(c.loop, false);
});
t('dunk: airborne default → dunkAirborne (loop)', () => {
  const c = resolve('basketball_dunk', 'airborne', '');
  assert.equal(c.name, CLIPS.dunkAirborne);
  assert.equal(c.loop, true);
});
t('dunk: airborne + off_board_windmill → signature (one-shot)', () => {
  const c = resolve('basketball_dunk', 'airborne', 'off_board_windmill');
  assert.equal(c.name, CLIPS.dunkOffBoardWindmill);
  assert.equal(c.loop, false);
});
t('dunk: airborne + 360_eastbay → signature (one-shot)', () => {
  const c = resolve('basketball_dunk', 'airborne', '360_eastbay');
  assert.equal(c.name, CLIPS.dunk360Eastbay);
  assert.equal(c.loop, false);
});
t('dunk: scored → dunkScore (one-shot)', () => {
  const c = resolve('basketball_dunk', 'scored', '');
  assert.equal(c.name, CLIPS.dunkScore);
  assert.equal(c.loop, false);
});
t('dunk: default (no phase) → dunkApproach (loop, never T-pose)', () => {
  const c = resolve('basketball_dunk', '', '');
  assert.equal(c.name, CLIPS.dunkApproach);
  assert.equal(c.loop, true);
});
t('dunk: dunkStyleClip grounded → approach, airborne signature → one-shot', () => {
  assert.equal(dunkStyleClip(5, false).name, CLIPS.dunkApproach);
  assert.equal(dunkStyleClip(7, true).name, CLIPS.dunkOffBoardWindmill);
  assert.equal(dunkStyleClip(7, true).loop, false);
});

// ============================================================
// 2. THREE-POINT — basketball_h2h resolve()
// ============================================================
t('3pt: shoot → bballShoot (one-shot)', () => {
  const c = resolve('basketball_h2h', '', 'shoot');
  assert.equal(c.name, CLIPS.bballShoot);
  assert.equal(c.loop, false);
});
t('3pt: score → bballScore (one-shot)', () => {
  const c = resolve('basketball_h2h', '', 'score');
  assert.equal(c.name, CLIPS.bballScore);
  assert.equal(c.loop, false);
});
t('3pt: default → bballDribble (loop, moving between racks)', () => {
  const c = resolve('basketball_h2h', '', '');
  assert.equal(c.name, CLIPS.bballDribble);
  assert.equal(c.loop, true);
});

// ============================================================
// 3. THREE-V-THREE — basketball_3v3 resolve()
// ============================================================
t('3v3: shoot → bballShoot (one-shot)', () => {
  const c = resolve('basketball_3v3', '', 'shoot');
  assert.equal(c.name, CLIPS.bballShoot);
  assert.equal(c.loop, false);
});
t('3v3: block → bballBlock (one-shot)', () => {
  const c = resolve('basketball_3v3', '', 'block');
  assert.equal(c.name, CLIPS.bballBlock);
  assert.equal(c.loop, false);
});
t('3v3: defend → bballDefend (loop)', () => {
  const c = resolve('basketball_3v3', '', 'defend');
  assert.equal(c.name, CLIPS.bballDefend);
  assert.equal(c.loop, true);
});
t('3v3: default → bballDribble (loop)', () => {
  const c = resolve('basketball_3v3', '', '');
  assert.equal(c.name, CLIPS.bballDribble);
  assert.equal(c.loop, true);
});

// ============================================================
// 4. KARATE-VERSUS — karate_endless resolve()
// ============================================================
t('karate-vs: light_strike → karateLightP (one-shot)', () => {
  const c = resolve('karate_endless', '', 'light_strike');
  assert.equal(c.name, CLIPS.karateLightP);
  assert.equal(c.loop, false);
});
t('karate-vs: kick → karateKick (one-shot)', () => {
  const c = resolve('karate_endless', '', 'kick');
  assert.equal(c.name, CLIPS.karateKick);
  assert.equal(c.loop, false);
});
t('karate-vs: heavy_strike (Dragon Palm) → karateHeavyP (one-shot)', () => {
  const c = resolve('karate_endless', '', 'heavy_strike');
  assert.equal(c.name, CLIPS.karateHeavyP);
  assert.equal(c.loop, false);
});
t('karate-vs: block → karateBlock (one-shot)', () => {
  const c = resolve('karate_endless', '', 'block');
  assert.equal(c.name, CLIPS.karateBlock);
  assert.equal(c.loop, false);
});
t('karate-vs: hit (took damage) → karateHit (one-shot)', () => {
  const c = resolve('karate_endless', '', 'hit');
  assert.equal(c.name, CLIPS.karateHit);
  assert.equal(c.loop, false);
});
t('karate-vs: default → karateIdle (loop, never T-pose)', () => {
  const c = resolve('karate_endless', '', '');
  assert.equal(c.name, CLIPS.karateIdle);
  assert.equal(c.loop, true);
});

// ============================================================
// 5. FSM anim audit — run each mode through a simulated frame stream.
//    Asserts: zero T-poses, idle-when-stationary, loco-when-moving,
//    actions are one-shot and blend back to locomotion.
// ============================================================
function auditMode(modeId: string, actionEvent: string, actionPhase = '') {
  const fsm = new AnimDirectorFSM();
  fsm.reset();
  const dt = 1 / 60;

  // (a) stationary for 30 frames → must be idle, looping, valid
  for (let i = 0; i < 30; i++) {
    const d = fsm.update(dt, { modeId, speed01: 0, phase: '', actionEvent: undefined });
    assert.ok(isValidDecision(d), `${modeId}: stationary produced a T-pose`);
    assert.ok(locomotionInvariantHolds(0, d), `${modeId}: stationary broke loco invariant`);
    assert.equal(d.kind, 'idle');
    assert.equal(d.clip.loop, true);
  }

  // (b) moving at sprint speed → must be a looping locomotion clip (no slide)
  for (let i = 0; i < 30; i++) {
    const speed01 = 0.9;
    const d = fsm.update(dt, { modeId, speed01, phase: '', actionEvent: undefined });
    assert.ok(isValidDecision(d), `${modeId}: moving produced a T-pose`);
    assert.ok(locomotionInvariantHolds(speed01, d), `${modeId}: moving broke loco invariant (slide-walk)`);
    assert.equal(d.kind, 'locomotion');
    assert.ok(isLoopClip(d.clip.name), `${modeId}: locomotion clip must loop`);
  }

  // (c) fire an action while moving → one-shot action latches, then blends back
  const d0 = fsm.update(dt, { modeId, speed01: 0.9, phase: actionPhase, actionEvent });
  assert.equal(d0.kind, 'action', `${modeId}: action event did not latch`);
  assert.equal(d0.clip.loop, false, `${modeId}: action clip must be one-shot`);
  // advance well past the action window → must return to locomotion, not stick
  let blendedBack = false;
  for (let i = 0; i < 120; i++) {
    const d = fsm.update(dt, { modeId, speed01: 0.9, phase: '', actionEvent: undefined });
    assert.ok(isValidDecision(d), `${modeId}: post-action produced a T-pose`);
    if (d.kind === 'locomotion') { blendedBack = true; break; }
  }
  assert.ok(blendedBack, `${modeId}: action never blended back to locomotion`);
}

t('anim audit: basketball_dunk (approach/idle/action stream)', () => auditMode('basketball_dunk', 'off_board_windmill', 'airborne'));
t('anim audit: basketball_h2h / three-point (shoot stream)', () => auditMode('basketball_h2h', 'shoot'));
t('anim audit: basketball_3v3 (block stream)', () => auditMode('basketball_3v3', 'block'));
t('anim audit: karate_endless / karate-vs (strike stream)', () => auditMode('karate_endless', 'light_strike'));

// idleMax sanity: a speed just above idleMax must NOT be treated as idle
t('loco band: speed just above idleMax is locomotion, not idle', () => {
  const fsm = new AnimDirectorFSM();
  const s = LOCO_BANDS.idleMax + 0.05;
  const d = fsm.update(1 / 60, { modeId: 'karate_endless', speed01: s, phase: '', actionEvent: undefined });
  assert.equal(d.kind, 'locomotion');
  assert.ok(locomotionInvariantHolds(s, d));
});

// ═══════════════════════════════════════════════════════════════════════
// M7-QA1 additions — scene integrity, match-gate, idle speed
// ═══════════════════════════════════════════════════════════════════════
import { checkSceneIntegrity, SCENE_MANIFESTS, checkVenueIdentity, VENUE_VENICE_SUNSET } from '../lib/scene/integrity';
import { MatchGate } from '../lib/scene/match-gate';
import { MODE_BINDINGS, detectDevice } from '../lib/scene/input-manager';

console.log('\n── M7-QA1 assertions ──');

// 1. Scene integrity manifests exist for all 4 target modeIds
t('scene manifests defined for all 4 modes', () => {
  for (const id of ['basketball_dunk', 'basketball_h2h', 'basketball_3v3', 'karate_versus']) {
    assert.ok(SCENE_MANIFESTS[id], `missing manifest for ${id}`);
    assert.ok(SCENE_MANIFESTS[id].requiredNodes.length > 0, `${id} has no required nodes`);
  }
});

// 2. checkSceneIntegrity passes with valid mesh names
t('scene integrity: court mode validates rim+backboard+floor', () => {
  const meshNames = ['Rim_mesh', 'Backboard_glass', 'Court_floor_plane', 'extra_geo'];
  const r = checkSceneIntegrity('basketball_dunk', meshNames);
  assert.ok(r.ok, `expected ok, got missing: ${r.missing.join(',')}`);
  assert.equal(r.missing.length, 0);
});

t('scene integrity: karate validates dojo floor', () => {
  const meshNames = ['Dojo_floor_mat', 'pillar_left', 'incense_holder'];
  const r = checkSceneIntegrity('karate_versus', meshNames);
  assert.ok(r.ok, `expected ok, got missing: ${r.missing.join(',')}`);
});

t('scene integrity: missing nodes flagged', () => {
  const r = checkSceneIntegrity('basketball_h2h', ['random_mesh']);
  assert.ok(!r.ok, 'should fail when required meshes missing');
  assert.ok(r.missing.length > 0);
});

// M8.5 — every playable mode declares an environment/venue identity
t('venue identity: all 4 modes declare a venue backdrop + mood', () => {
  for (const id of ['basketball_dunk', 'basketball_h2h', 'basketball_3v3', 'karate_versus']) {
    const v = SCENE_MANIFESTS[id].venue;
    assert.ok(v, `${id} missing venue identity`);
    assert.ok(v!.backdrop.startsWith('/backdrops/'), `${id} venue backdrop path invalid`);
    assert.ok(v!.mood.length > 10, `${id} venue mood description too short`);
  }
});

// M8.5 — dunk actually renders the sunset Venice backdrop it declares
t('venue identity: dunk backdrop stays in sync with sunset venue', () => {
  const r = checkVenueIdentity('basketball_dunk', VENUE_VENICE_SUNSET.backdrop);
  assert.ok(r.ok, `expected dunk venue to match, got: ${r.missing.join(',')}`);
  const bad = checkVenueIdentity('basketball_dunk', '/backdrops/void.jpg');
  assert.ok(!bad.ok, 'mismatched backdrop should be flagged');
});

// 3. MatchGate blocks action before FIGHT
t('match-gate: canAct false during READY+COUNTDOWN', () => {
  const g = new MatchGate();
  assert.equal(g.canAct, false, 'must not act during READY');
  assert.equal(g.state.phase, 'ready');
  // advance through READY (default 0.8s)
  g.update(1.0);
  assert.equal(g.state.phase, 'countdown', 'should be in countdown');
  assert.equal(g.canAct, false, 'must not act during COUNTDOWN');
});

t('match-gate: canAct true after full countdown', () => {
  const g = new MatchGate();
  g.update(0.9); // past READY
  g.update(2.5); // past COUNTDOWN
  assert.equal(g.state.phase, 'fight', 'should reach fight');
  assert.equal(g.canAct, true);
});

t('match-gate: reset returns to ready', () => {
  const g = new MatchGate();
  g.update(1.0); // past READY
  g.update(3.0); // past COUNTDOWN
  assert.equal(g.state.phase, 'fight');
  g.reset();
  assert.equal(g.state.phase, 'ready');
  assert.equal(g.canAct, false);
});

// 4. Input bindings exist for all 4 scene modes
t('input-manager: MODE_BINDINGS has all 4 scene modes', () => {
  for (const k of ['basketball_dunk', 'basketball_h2h', 'basketball_3v3', 'karate_versus']) {
    const b = MODE_BINDINGS[k];
    assert.ok(b, `missing MODE_BINDINGS for ${k}`);
    assert.ok(b.desktop.length > 0, `${k} has no desktop bindings`);
    assert.ok(b.touch.length > 0, `${k} has no touch bindings`);
  }
});

// 5. Idle speed scale applied in FSM (IDLE_SPEED_SCALE = 0.18)
t('idle animation uses IDLE_SPEED_SCALE (0.18) — not full speed', () => {
  const fsm = new AnimDirectorFSM();
  const d = fsm.update(1 / 60, { modeId: 'karate_endless', speed01: 0, phase: '', actionEvent: undefined });
  assert.equal(d.kind, 'idle', 'stationary should produce idle');
  // The FSM sets d.clip.speedScale = IDLE_SPEED_SCALE (0.18) on idle decisions
  assert.ok(d.clip.speedScale !== undefined && d.clip.speedScale < 0.5,
    `idle speedScale expected <0.5, got ${d.clip.speedScale}`);
});

// 6. No T-pose in idle decisions for all modeIds
t('no T-pose: idle decision valid across all 4 modes', () => {
  for (const modeId of ['basketball_dunk', 'basketball_h2h', 'basketball_3v3', 'karate_endless']) {
    const fsm = new AnimDirectorFSM();
    const d = fsm.update(1 / 60, { modeId, speed01: 0, phase: '', actionEvent: undefined });
    assert.ok(isValidDecision(d), `${modeId}: idle decision is invalid (T-pose risk)`);
    assert.ok(d.clip.name.length > 0, `${modeId}: idle clip name is empty`);
  }
});

console.log('\nAll ' + pass + ' M7c full-lib + M7-QA1 tests passed\n');
process.exit(0);
