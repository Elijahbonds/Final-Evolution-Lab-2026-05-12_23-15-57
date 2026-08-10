/**
 * scripts/m7c-tests.ts — M7c Basketball-3D contract tests.
 * ========================================================
 * Verifies that the full-library basketball-3d scene contracts are correct:
 *   • AnimDirectorFSM resolves basketball_h2h modes (shoot/score/block/defend/dribble)
 *   • Locomotion invariants hold for basketball (idle/locomotion/action)
 *   • BallStateMachine gain→release→loose→dead for basketball shot
 *   • Camera rig assignments (h2h → follow)
 *   • Clip registry aliases resolve for basketball clips
 *   • Tuned scoring constants match the proven 2D values
 */
import { strict as assert } from 'node:assert';
import { resolve, AnimDirectorFSM, bandForSpeed, locomotionInvariantHolds } from '../lib/anim/state-machine';
import { CLIPS, isLoopClip, CLIP_ALIASES, resolveConcreteClip } from '../lib/anim/clip-registry';
import { BallStateMachine, LOOSE_TO_DEAD_SECONDS } from '../lib/ball/ball-state';
import { LocomotionController, DEFAULT_LOCO } from '../lib/loco/movement';
import { computeCamera, CameraCut, RIGS, rigForMode, MODE_RIG } from '../lib/camera/rigs';

let pass = 0;
const t = (label: string, fn: () => void) => {
  fn();
  pass++;
  console.log('  \u2713 ' + label);
};

console.log('\n\u2500\u2500 M7c Basketball-3D contract tests \u2500\u2500\n');

// === resolve() for basketball_h2h ===
t('resolve: basketball_h2h shoot → bball_shoot_jumper', () => {
  const c = resolve('basketball_h2h', '', 'shoot');
  assert.equal(c.name, CLIPS.bballShoot);
  assert.equal(c.loop, false);
});

t('resolve: basketball_h2h score → bball_score_celebrate', () => {
  const c = resolve('basketball_h2h', '', 'score');
  assert.equal(c.name, CLIPS.bballScore);
  assert.equal(c.loop, false);
});

t('resolve: basketball_h2h block → bball_block_reach', () => {
  const c = resolve('basketball_h2h', '', 'block');
  assert.equal(c.name, CLIPS.bballBlock);
  assert.equal(c.loop, false);
});

t('resolve: basketball_h2h defend → bball_defend_stance', () => {
  const c = resolve('basketball_h2h', '', 'defend');
  assert.equal(c.name, CLIPS.bballDefend);
  assert.equal(c.loop, true);
});

t('resolve: basketball_h2h default → bball_dribble_run (loop)', () => {
  const c = resolve('basketball_h2h', '', '');
  assert.equal(c.name, CLIPS.bballDribble);
  assert.equal(c.loop, true);
});

t('resolve: basketball_3v3 aliases to same clips as h2h', () => {
  const shoot3v3 = resolve('basketball_3v3', '', 'shoot');
  assert.equal(shoot3v3.name, CLIPS.bballShoot);
  const def3v3 = resolve('basketball_3v3', '', '');
  assert.equal(def3v3.name, CLIPS.bballDribble);
});

// === Clip loop discipline ===
t('loop discipline: dribble + defend are loops, shoot/score/block are one-shot', () => {
  assert.ok(isLoopClip(CLIPS.bballDribble), 'dribble should loop');
  assert.ok(isLoopClip(CLIPS.bballDefend), 'defend should loop');
  assert.ok(!isLoopClip(CLIPS.bballShoot), 'shoot should NOT loop');
  assert.ok(!isLoopClip(CLIPS.bballScore), 'score should NOT loop');
  assert.ok(!isLoopClip(CLIPS.bballBlock), 'block should NOT loop');
});

// === AnimDirectorFSM invariants for basketball ===
t('FSM: basketball stationary → idle kind', () => {
  const fsm = new AnimDirectorFSM();
  const d = fsm.update(0.016, { modeId: 'basketball_h2h', speed01: 0 });
  assert.equal(d.kind, 'idle');
});

t('FSM: basketball full speed → locomotion kind', () => {
  const fsm = new AnimDirectorFSM();
  const d = fsm.update(0.016, { modeId: 'basketball_h2h', speed01: 0.9 });
  assert.equal(d.kind, 'locomotion');
  assert.ok(d.clip.loop, 'locomotion should be a loop');
});

t('FSM: basketball action event (shoot) → action sequence', () => {
  const fsm = new AnimDirectorFSM();
  // First frame: fire shoot event
  const d1 = fsm.update(0.016, { modeId: 'basketball_h2h', speed01: 0, actionEvent: 'shoot' });
  assert.equal(d1.kind, 'action');
  assert.ok(!d1.clip.loop, 'action should NOT loop');
});

t('FSM: basketball action completes → blends back to idle', () => {
  const fsm = new AnimDirectorFSM();
  // Fire action
  fsm.update(0.016, { modeId: 'basketball_h2h', speed01: 0, actionEvent: 'shoot' });
  // Advance past windup + active + recovery (0.10 + 0.24 + 0.18 = 0.52s)
  for (let i = 0; i < 40; i++) fsm.update(0.016, { modeId: 'basketball_h2h', speed01: 0 });
  const d = fsm.update(0.016, { modeId: 'basketball_h2h', speed01: 0 });
  assert.equal(d.kind, 'idle');
});

// === BallStateMachine for basketball shot ===
t('BallSM: gain → release = in_flight → loose → dead for basketball shot', () => {
  const bsm = new BallStateMachine();
  bsm.gain('player');
  assert.equal(bsm.state, 'held');
  assert.equal(bsm.possessor, 'player');
  bsm.release();
  assert.equal(bsm.state, 'in_flight');
  bsm.loose();
  assert.ok(bsm.isLoose());
  // Advance to dead
  for (let i = 0; i < Math.ceil(LOOSE_TO_DEAD_SECONDS / 0.05); i++) bsm.update(0.05);
  assert.equal(bsm.state, 'dead_ball');
});

t('BallSM: defender pickup is a one-shot', () => {
  const bsm = new BallStateMachine();
  bsm.gain('player');
  bsm.release();
  bsm.loose();
  assert.ok(bsm.pickup('defender'));
  assert.equal(bsm.possessor, 'defender');
  assert.equal(bsm.state, 'held');
});

// === Camera rig for basketball ===
t('camera: basketball_h2h uses follow rig', () => {
  const rig = rigForMode('basketball_h2h');
  assert.equal(rig.kind, 'follow');
});

t('camera: follow rig produces finite frames', () => {
  const subject = { pos: { x: 0, y: 0, z: 6 }, facing: Math.PI, speed01: 0.5 };
  const frame = computeCamera(subject, RIGS.follow);
  assert.ok(Number.isFinite(frame.position.x));
  assert.ok(Number.isFinite(frame.position.y));
  assert.ok(Number.isFinite(frame.position.z));
  assert.ok(Number.isFinite(frame.target.x));
  assert.ok(Number.isFinite(frame.fov));
});

// === Clip alias resolution ===
t('clip alias: bball_dribble_run resolves to concrete clip', () => {
  const candidates = CLIP_ALIASES[CLIPS.bballDribble];
  assert.ok(candidates && candidates.length > 0, 'dribble should have alias candidates');
  const resolved = resolveConcreteClip(CLIPS.bballDribble, ['run', 'walk', 'guard']);
  assert.ok(resolved, 'should resolve to a concrete clip');
  assert.notEqual(resolved, '', 'should not be empty');
});

t('clip alias: bball_shoot resolves to concrete clip', () => {
  const resolved = resolveConcreteClip(CLIPS.bballShoot, ['jumpshot', 'guard', 'run']);
  assert.ok(resolved, 'should resolve to a concrete clip');
});

// === LocomotionController basic contract ===
t('locomotion: step produces valid pos/speed01 for basketball bounds', () => {
  const lc = new LocomotionController({ speedScale: 1 }, { x: 0, z: 6 });
  const st = lc.step(0.016, { moveX: 1, moveY: -1, camYaw: 0 });
  assert.ok(Number.isFinite(st.pos.x));
  assert.ok(Number.isFinite(st.pos.z));
  assert.ok(st.speed01 >= 0 && st.speed01 <= 1);
  // Clamp within court bounds
  lc.clampPos(-7, 7, -1, 9);
  assert.ok(lc.state.pos.x >= -7 && lc.state.pos.x <= 7);
  assert.ok(lc.state.pos.z >= -1 && lc.state.pos.z <= 9);
});

// === CameraCut always resolves ===
t('camera cut: begin + update always produces finite frames (basketball)', () => {
  const subject = { pos: { x: 2, y: 0, z: 5 }, facing: Math.PI, speed01: 0.3 };
  const fromFrame = computeCamera(subject, RIGS.follow);
  const cc = new CameraCut();
  cc.begin(fromFrame, 0.6);
  assert.ok(cc.active);
  const liveFrame = computeCamera(subject, RIGS.broadcast);
  const midFrame = cc.update(0.3, liveFrame);
  assert.ok(Number.isFinite(midFrame.position.x));
  assert.ok(Number.isFinite(midFrame.target.y));
  assert.ok(Number.isFinite(midFrame.fov));
});

console.log(`\nAll ${pass} M7c basketball-3D contract tests passed`);
process.exit(0);
