/**
 * scripts/m7b-tests.ts — M7b HERO MODES contract tests.
 * =====================================================
 * Verifies the six hero modes (dunk, basketball, karate, soccer, golf, baseball)
 * against the M7a global libraries:
 *   • resolve() maps every hero action/phase to the correct NON-idle concrete clip
 *   • the AnimDirectorFSM enforces the locomotion invariant per hero mode
 *     (stationary ⇒ idle kind, moving ⇒ locomotion kind, event ⇒ action kind) —
 *     zero T-poses, zero slide-walking
 *   • the soccer BallStateMachine transitions held → in_flight → loose → dead
 *   • each hero mode resolves to its intended camera rig
 *
 * Pure logic — no THREE / DOM. Run: yarn tsx scripts/m7b-tests.ts
 */

import { strict as assert } from 'node:assert';
import {
  resolve,
  AnimDirectorFSM,
  isValidDecision,
  locomotionInvariantHolds,
  bandForSpeed,
} from '../lib/anim/state-machine';
import { CLIPS, isLoopClip } from '../lib/anim/clip-registry';
import { BallStateMachine, LOOSE_TO_DEAD_SECONDS } from '../lib/ball/ball-state';
import { rigForMode, MODE_RIG } from '../lib/camera/rigs';

let pass = 0;
const t = (label: string, fn: () => void) => { fn(); pass++; console.log('  \u2713 ' + label); };

// ─────────────────────────────────────────────────────────────────────────
// 1) resolve() — hero action/phase → correct non-idle clip
// ─────────────────────────────────────────────────────────────────────────

t('dunk: phases map to dunk clips (charge/launch/airborne/scored)', () => {
  assert.equal(resolve('basketball_dunk', 'charging', '').name, CLIPS.dunkCharge);
  assert.equal(resolve('basketball_dunk', 'launch', '').name, CLIPS.dunkLaunch);
  assert.equal(resolve('basketball_dunk', 'airborne', '360_eastbay').name, CLIPS.dunk360Eastbay);
  assert.equal(resolve('basketball_dunk', 'scored', '').name, CLIPS.dunkScore);
  // idle fallback is the approach run (a locomotion loop, never a T-pose)
  assert.equal(resolve('basketball_dunk', '', '').name, CLIPS.dunkApproach);
});

t('basketball: shoot/score/block/defend map to bball clips', () => {
  assert.equal(resolve('basketball_h2h', '', 'shoot').name, CLIPS.bballShoot);
  assert.equal(resolve('basketball_3v3', '', 'score').name, CLIPS.bballScore);
  assert.equal(resolve('venice_pickup', '', 'block').name, CLIPS.bballBlock);
  assert.equal(resolve('basketball_h2h', '', 'defend').name, CLIPS.bballDefend);
  assert.equal(resolve('basketball_h2h', '', '').name, CLIPS.bballDribble);
});

t('karate: strikes/blocks/win/down map to karate clips', () => {
  assert.equal(resolve('karate_endless', '', 'light_strike').name, CLIPS.karateLightP);
  assert.equal(resolve('karate_endless', '', 'heavy_strike').name, CLIPS.karateHeavyP);
  assert.equal(resolve('karate_endless', '', 'kick').name, CLIPS.karateKick);
  assert.equal(resolve('karate_endless', 'victory', '').name, CLIPS.karateWin);
  assert.equal(resolve('karate_endless', 'defeat', '').name, CLIPS.karateDown);
  assert.equal(resolve('karate_endless', '', '').name, CLIPS.karateIdle);
});

t('soccer: shoot/pass/tackle/goal/header map to soccer clips', () => {
  assert.equal(resolve('soccer', '', 'shoot').name, CLIPS.soccerShoot);
  assert.equal(resolve('soccer', '', 'pass').name, CLIPS.soccerPass);
  assert.equal(resolve('soccer', '', 'tackle').name, CLIPS.soccerTackle);
  assert.equal(resolve('soccer', 'goal', '').name, CLIPS.soccerCeleb);
  assert.equal(resolve('soccer', '', 'header').name, CLIPS.soccerHeader);
  assert.equal(resolve('soccer', '', '').name, CLIPS.soccerDribble);
});

t('golf: swing/putt/celebrate map to golf clips, idle loops', () => {
  assert.equal(resolve('golf', '', 'swing').name, CLIPS.golfSwing);
  assert.equal(resolve('golf', '', 'putt').name, CLIPS.golfPutt);
  assert.equal(resolve('golf', 'holed', '').name, CLIPS.golfCeleb);
  assert.equal(resolve('golf', '', 'celebrate').name, CLIPS.golfCeleb);
  assert.equal(resolve('golf', '', '').name, CLIPS.golfIdle);
});

t('baseball: swing/contact/homer map to baseball clips, stance loops', () => {
  assert.equal(resolve('baseball', '', 'swing').name, CLIPS.baseballSwing);
  assert.equal(resolve('baseball', '', 'bat').name, CLIPS.baseballSwing);
  assert.equal(resolve('baseball', '', 'contact').name, CLIPS.baseballContact);
  assert.equal(resolve('baseball', 'homer', '').name, CLIPS.baseballCeleb);
  assert.equal(resolve('baseball', '', '').name, CLIPS.baseballStance);
});

// ─────────────────────────────────────────────────────────────────────────
// 2) loop discipline — idle/stance clips loop, action clips are one-shot
// ─────────────────────────────────────────────────────────────────────────

t('hero idle/stance clips loop; action clips are one-shot', () => {
  // Loops
  for (const c of [CLIPS.golfIdle, CLIPS.baseballStance, CLIPS.karateIdle, CLIPS.bballDribble, CLIPS.soccerDribble]) {
    assert.equal(isLoopClip(c), true, `${c} should loop`);
  }
  // One-shots
  for (const c of [CLIPS.golfSwing, CLIPS.baseballSwing, CLIPS.soccerShoot, CLIPS.bballShoot, CLIPS.karateKick, CLIPS.dunkLaunch]) {
    assert.equal(isLoopClip(c), false, `${c} should be one-shot`);
  }
});

// ─────────────────────────────────────────────────────────────────────────
// 3) FSM invariants — per hero mode: stationary→idle, moving→locomotion,
//    action event→action. Never a T-pose.
// ─────────────────────────────────────────────────────────────────────────

const HERO_MODES = ['basketball_dunk', 'basketball_h2h', 'karate_endless', 'soccer', 'golf', 'baseball'];

t('FSM: stationary yields idle kind for every hero mode', () => {
  for (const m of HERO_MODES) {
    const fsm = new AnimDirectorFSM();
    fsm.reset();
    const d = fsm.update(0.1, { modeId: m, speed01: 0, phase: '', actionEvent: undefined });
    assert.equal(d.kind, 'idle', `${m} stationary should be idle`);
    assert.ok(isValidDecision(d), `${m} idle decision must be valid (no T-pose)`);
    assert.ok(locomotionInvariantHolds(0, d), `${m} idle invariant`);
  }
});

t('FSM: full-speed yields locomotion kind for every hero mode', () => {
  for (const m of HERO_MODES) {
    const fsm = new AnimDirectorFSM();
    fsm.reset();
    const d = fsm.update(0.1, { modeId: m, speed01: 1, phase: '', actionEvent: undefined });
    assert.equal(d.kind, 'locomotion', `${m} moving should be locomotion`);
    assert.equal(d.band, bandForSpeed(1));
    assert.ok(isValidDecision(d));
    assert.ok(locomotionInvariantHolds(1, d), `${m} moving invariant`);
  }
});

t('FSM: an action event latches an action sequence (no snap to idle)', () => {
  const events: Record<string, string> = {
    basketball_dunk: '360_eastbay', basketball_h2h: 'shoot', karate_endless: 'kick',
    soccer: 'shoot', golf: 'swing', baseball: 'swing',
  };
  for (const m of HERO_MODES) {
    const fsm = new AnimDirectorFSM();
    fsm.reset();
    // dunk airborne subclips need the airborne phase; feed it for dunk
    const phase = m === 'basketball_dunk' ? 'airborne' : '';
    const d = fsm.update(0.016, { modeId: m, speed01: 0, phase, actionEvent: events[m] });
    assert.equal(d.kind, 'action', `${m} event should start an action`);
    assert.equal(d.actionPhase, 'windup', `${m} action begins in windup`);
    assert.ok(fsm.inAction, `${m} FSM should report inAction`);
    assert.ok(isValidDecision(d));
  }
});

t('FSM: action sequence completes then blends back to locomotion/idle', () => {
  const fsm = new AnimDirectorFSM();
  fsm.reset();
  fsm.update(0.016, { modeId: 'soccer', speed01: 0, phase: '', actionEvent: 'shoot' });
  // advance well past windup+active+recovery
  let last = fsm.update(0.5, { modeId: 'soccer', speed01: 0, phase: '', actionEvent: undefined });
  for (let i = 0; i < 5 && fsm.inAction; i++) {
    last = fsm.update(0.2, { modeId: 'soccer', speed01: 0, phase: '', actionEvent: undefined });
  }
  assert.equal(fsm.inAction, false, 'action should have completed');
  assert.equal(last.kind, 'idle', 'blends back to idle when stationary');
});

// ─────────────────────────────────────────────────────────────────────────
// 4) Soccer ball state machine — held → in_flight → loose → dead
// ─────────────────────────────────────────────────────────────────────────

t('soccer ball: gain → release (in_flight) → loose → dead', () => {
  const b = new BallStateMachine();
  b.gain('player');
  assert.equal(b.state, 'held');
  assert.equal(b.possessor, 'player');
  b.release();
  assert.equal(b.state, 'in_flight');
  assert.equal(b.isLoose(), true);
  b.loose();
  assert.equal(b.isLoose(), true);
  // decays to dead after the loose window
  b.update(LOOSE_TO_DEAD_SECONDS + 0.1);
  assert.equal(b.state, 'dead_ball');
});

t('soccer ball: a keeper can pick up a loose ball (one-shot trigger)', () => {
  const b = new BallStateMachine();
  b.gain('player'); b.release();
  const picked = b.pickup('keeper');
  assert.equal(picked, true);
  assert.equal(b.possessor, 'keeper');
  assert.equal(b.state, 'held');
  // a subsequent pickup on a held ball does nothing
  assert.equal(b.pickup('other'), false);
});

// ─────────────────────────────────────────────────────────────────────────
// 5) Camera rigs — each hero mode resolves to its intended rig
// ─────────────────────────────────────────────────────────────────────────

t('camera: hero modes resolve to intended rigs', () => {
  assert.equal(MODE_RIG['soccer'], 'follow');
  assert.equal(MODE_RIG['golf'], 'broadcast');
  assert.equal(MODE_RIG['baseball'], 'broadcast');
  assert.equal(MODE_RIG['basketball_dunk'], 'broadcast');
  assert.equal(MODE_RIG['basketball_h2h'], 'follow');
  assert.equal(MODE_RIG['karate_endless'], 'over_shoulder');
  // rigForMode returns a finite, well-formed config
  const rig = rigForMode('soccer');
  assert.equal(rig.kind, 'follow');
  assert.ok(rig.distance > 0 && rig.fov > 0);
});

t('camera: unknown mode falls back to follow rig (no dead cut)', () => {
  const rig = rigForMode('totally_unknown_mode');
  assert.equal(rig.kind, 'follow');
});

console.log('\nAll ' + pass + ' M7b hero-mode contract tests passed');
process.exit(0);
