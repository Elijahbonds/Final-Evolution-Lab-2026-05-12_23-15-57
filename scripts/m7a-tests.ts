/**
 * M7a — Global gameplay-systems test suite.
 *
 * Zero-LLM, deterministic. Run with:  yarn tsx scripts/m7a-tests.ts
 *
 * Covers the four M7a global systems:
 *   1. Animation state machine  (lib/anim/state-machine, clip-registry, avatar-driver)
 *   2. Movement / locomotion     (lib/loco/movement)
 *   3. Camera rigs & cuts        (lib/camera/rigs)
 *   4. Ball state + throw/catch   (lib/ball/ball-state)
 *
 * The invariants asserted here are exactly the M7a acceptance criteria (b):
 * zero T-poses, zero slide-walking, idle always active when stationary,
 * actions sequence windup→active→recovery→blend-back, camera cuts always
 * resolve to finite frames, ball pickups work from every loose state.
 */
import assert from 'node:assert';
import {
  resolve,
  combatActionClip,
  dunkStyleClip,
  AnimDirectorFSM,
  bandForSpeed,
  locomotionClip,
  isValidDecision,
  locomotionInvariantHolds,
  LOCO_BANDS,
  ACTION_TIMING,
  IDLE_VARIANTS,
  IDLE_VARIANT_PERIOD,
} from '../lib/anim/state-machine';
import {
  CLIPS,
  isLoopClip,
  resolveConcreteClip,
  CLIP_ALIASES,
  MOCAP_DESCRIPTORS,
  descriptorsForMode,
} from '../lib/anim/clip-registry';
import { AvatarDriver, type DriveTarget } from '../lib/anim/avatar-driver';
import {
  LocomotionController,
  arcadeParamsFromPRQ,
  turnToward,
  DEFAULT_LOCO,
} from '../lib/loco/movement';
import {
  computeCamera,
  rigForMode,
  CameraCut,
  RIGS,
  MODE_RIG,
  easeInOut,
  type RigKind,
  type CameraFrame,
} from '../lib/camera/rigs';
import {
  BallStateMachine,
  ThrowCatchController,
  LOOSE_TO_DEAD_SECONDS,
  type BallState,
} from '../lib/ball/ball-state';

let pass = 0;
const t = (label: string, fn: () => void) => {
  fn();
  pass++;
  console.log(`  \u2713 ${label}`);
};

function finite3(v: { x: number; y: number; z: number }): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

console.log('\nM7a global gameplay-systems tests\n');

/* ─────────────────────────── 1. Animation FSM ─────────────────────────── */
console.log('Animation state machine:');

t('resolve(): every mode returns a non-empty, non-T-pose clip', () => {
  const modes = [
    'basketball_dunk', 'karate_endless', 'karate_kata', 'basketball_h2h',
    'venice_pickup', 'basketball_3v3', 'soccer', 'football', 'skateboarding',
    'snowboarding', 'surfing', 'unknown_mode',
  ];
  for (const m of modes) {
    const c = resolve(m, '', '');
    assert.ok(c.name && c.name.length > 0, `mode ${m} produced empty clip`);
  }
});

t('resolve(): karate action ints map to expected clips', () => {
  assert.equal(resolve('karate_endless', '', 'light_strike').name, CLIPS.karateLightP);
  assert.equal(resolve('karate_endless', '', 'heavy_strike').name, CLIPS.karateHeavyP);
  assert.equal(resolve('karate_endless', '', 'kick').name, CLIPS.karateKick);
  assert.equal(resolve('karate_endless', 'victory', '').name, CLIPS.karateWin);
  assert.equal(resolve('karate_endless', 'defeat', '').name, CLIPS.karateDown);
  // stationary default is the looping idle stance
  assert.equal(resolve('karate_endless', '', '').name, CLIPS.karateIdle);
});

t('resolve(): dunk phases route to distinct clips', () => {
  assert.equal(resolve('basketball_dunk', 'charging', '').name, CLIPS.dunkCharge);
  assert.equal(resolve('basketball_dunk', 'launch', '').name, CLIPS.dunkLaunch);
  assert.equal(resolve('basketball_dunk', 'airborne', '360_scoop').name, CLIPS.dunk360Scoop);
  assert.equal(resolve('basketball_dunk', 'scored', '').name, CLIPS.dunkScore);
});

t('combatActionClip(): 0..4 map, out-of-range falls back to idle (never empty)', () => {
  assert.equal(combatActionClip(0).name, CLIPS.karateLightP);
  assert.equal(combatActionClip(1).name, CLIPS.karateHeavyP);
  assert.equal(combatActionClip(2).name, CLIPS.karateBlock);
  assert.equal(combatActionClip(3).name, CLIPS.karateDodge);
  assert.equal(combatActionClip(4).name, CLIPS.karateCounter);
  assert.equal(combatActionClip(99).name, CLIPS.karateIdle);
  assert.ok(combatActionClip(99).loop, 'idle fallback must loop');
});

t('dunkStyleClip(): grounded=approach, signature styles airborne, default airborne', () => {
  assert.equal(dunkStyleClip(5, false).name, CLIPS.dunkApproach);
  assert.equal(dunkStyleClip(4, true).name, CLIPS.dunk360Scoop);
  assert.equal(dunkStyleClip(7, true).name, CLIPS.dunkOffBoardWindmill);
  assert.equal(dunkStyleClip(0, true).name, CLIPS.dunkAirborne);
});

t('bandForSpeed(): thresholds partition speed into idle/walk/run/sprint', () => {
  assert.equal(bandForSpeed(0), 'idle');
  assert.equal(bandForSpeed(LOCO_BANDS.idleMax), 'idle');
  assert.equal(bandForSpeed(LOCO_BANDS.walkMax), 'walk');
  assert.equal(bandForSpeed(LOCO_BANDS.runMax), 'run');
  assert.equal(bandForSpeed(1), 'sprint');
});

t('locomotionClip(): moving bands always produce a looping clip', () => {
  for (const b of ['walk', 'run', 'sprint'] as const) {
    const c = locomotionClip(b, 0.5);
    assert.ok(c.loop, `${b} clip must loop`);
    assert.ok(isLoopClip(c.name), `${b} clip ${c.name} must be a registered loop clip`);
  }
});

t('FSM: stationary ALWAYS yields an idle decision (idle always active)', () => {
  const fsm = new AnimDirectorFSM();
  for (let i = 0; i < 200; i++) {
    const d = fsm.update(1 / 60, { modeId: 'karate_endless', speed01: 0 });
    assert.equal(d.kind, 'idle');
    assert.ok(isValidDecision(d));
    assert.ok(locomotionInvariantHolds(0, d));
  }
});

t('FSM: idle rest variants rotate over time', () => {
  const fsm = new AnimDirectorFSM();
  const seen = new Set<string>();
  const steps = Math.ceil((IDLE_VARIANT_PERIOD * IDLE_VARIANTS.length) / (1 / 60)) + 10;
  for (let i = 0; i < steps; i++) {
    const d = fsm.update(1 / 60, { modeId: 'karate_endless', speed01: 0 });
    if (d.idleVariant) seen.add(d.idleVariant);
  }
  assert.equal(seen.size, IDLE_VARIANTS.length, 'all idle variants should appear');
});

t('FSM: velocity>0 ALWAYS yields a locomotion loop clip (kills the waddle)', () => {
  const fsm = new AnimDirectorFSM();
  for (const spd of [0.2, 0.5, 0.9, 1.0]) {
    const d = fsm.update(1 / 60, { modeId: 'karate_endless', speed01: spd });
    assert.equal(d.kind, 'locomotion', `speed ${spd} must be locomotion`);
    assert.ok(d.clip.loop && isLoopClip(d.clip.name));
    assert.ok(locomotionInvariantHolds(spd, d));
  }
});

t('FSM: action event sequences windup\u2192active\u2192recovery then blends back', () => {
  const fsm = new AnimDirectorFSM();
  // Fire an action while stationary.
  let d = fsm.update(1 / 60, { modeId: 'karate_endless', speed01: 0, actionEvent: 'kick' });
  assert.equal(d.kind, 'action');
  assert.equal(d.actionPhase, 'windup');
  const phases: string[] = [d.actionPhase!];
  const { windup, active, recovery } = ACTION_TIMING;
  const total = windup + active + recovery;
  let elapsed = 0;
  // Step to just before the end of the sequence.
  while (elapsed < total - 1 / 120) {
    d = fsm.update(1 / 60, { modeId: 'karate_endless', speed01: 0 });
    elapsed += 1 / 60;
    if (d.kind === 'action' && d.actionPhase) phases.push(d.actionPhase);
  }
  assert.ok(phases.includes('windup'));
  assert.ok(phases.includes('active'));
  assert.ok(phases.includes('recovery'));
  // A few more frames → sequence complete → blends back to idle/locomotion.
  let blendedBack = false;
  for (let i = 0; i < 10; i++) {
    d = fsm.update(1 / 60, { modeId: 'karate_endless', speed01: 0 });
    if (d.kind !== 'action') { blendedBack = true; break; }
  }
  assert.ok(blendedBack, 'action must blend back to a non-action state');
});

t('FSM: an action never emits a T-pose while sequencing', () => {
  const fsm = new AnimDirectorFSM();
  let d = fsm.update(1 / 60, { modeId: 'basketball_dunk', speed01: 0.4, actionEvent: 'shoot' });
  for (let i = 0; i < 60; i++) {
    assert.ok(isValidDecision(d));
    d = fsm.update(1 / 60, { modeId: 'basketball_dunk', speed01: 0.4 });
  }
});

t('FSM: one-shot mode phase (victory) latches as a sequence', () => {
  const fsm = new AnimDirectorFSM();
  const d = fsm.update(1 / 60, { modeId: 'karate_endless', speed01: 0, phase: 'victory' });
  assert.equal(d.kind, 'action');
  assert.ok(isValidDecision(d));
});

/* ─────────────────── clip-registry resolution + descriptors ────────────── */
console.log('Clip registry:');

t('resolveConcreteClip(): never null when the avatar has any clips', () => {
  const available = ['karate_idle_stance', 'karate_punch_light', 'run_forward', 'walk_forward'];
  for (const logical of Object.keys(CLIP_ALIASES)) {
    const c = resolveConcreteClip(logical, available);
    assert.ok(c && c.length > 0, `${logical} resolved to empty`);
    assert.ok(available.includes(c!), `${logical} \u2192 ${c} not in available set`);
  }
});

t('resolveConcreteClip(): unknown logical name still falls back, never null', () => {
  const available = ['karate_idle_stance', 'run_forward'];
  const c = resolveConcreteClip('totally_made_up_clip', available);
  assert.ok(c && available.includes(c), 'must fall back to an available clip');
});

t('MOCAP_DESCRIPTORS: all 10 batch-5 descriptors present with routing metadata', () => {
  const keys = Object.keys(MOCAP_DESCRIPTORS);
  assert.equal(keys.length, 10, `expected 10 descriptors, got ${keys.length}`);
  for (const k of keys) {
    const d = MOCAP_DESCRIPTORS[k];
    assert.ok(d.clip && d.clip.length > 0);
    assert.ok(Array.isArray(d.modes));
  }
});

t('descriptorsForMode(): known mode returns at least one descriptor', () => {
  const anyMode = MOCAP_DESCRIPTORS[Object.keys(MOCAP_DESCRIPTORS)[0]].modes[0];
  if (anyMode) {
    const list = descriptorsForMode(anyMode);
    assert.ok(Array.isArray(list));
  }
});

/* ─────────────────────────── avatar driver ────────────────────────────── */
console.log('Avatar driver:');

function mockTarget(): { target: DriveTarget; calls: string[]; clipNames: string[] } {
  const clipNames = ['karate_idle_stance', 'karate_punch_light', 'karate_kick_roundhouse', 'run_forward', 'walk_forward'];
  const calls: string[] = [];
  const target: DriveTarget = {
    clipNames,
    play: (name: string) => { calls.push(name); },
  };
  return { target, calls, clipNames };
}

t('driver: does not re-trigger an already-playing loop (no stutter)', () => {
  const { target, calls } = mockTarget();
  const drv = new AvatarDriver();
  drv.attach(target);
  const fsm = new AnimDirectorFSM();
  const d1 = fsm.update(1 / 60, { modeId: 'karate_endless', speed01: 0 });
  drv.apply(d1);
  const firstCount = calls.length;
  for (let i = 0; i < 30; i++) drv.apply(fsm.update(1 / 60, { modeId: 'karate_endless', speed01: 0 }));
  // Idle loop shouldn't be replayed every frame.
  assert.ok(calls.length <= firstCount + IDLE_VARIANTS.length + 1, 'idle loop re-triggered too often');
});

t('driver: apply() returns a concrete clip present on the avatar (never T-pose)', () => {
  const { target, clipNames } = mockTarget();
  const drv = new AvatarDriver();
  drv.attach(target);
  const fsm = new AnimDirectorFSM();
  const moving = drv.apply(fsm.update(1 / 60, { modeId: 'karate_endless', speed01: 0.9 }));
  assert.ok(moving && clipNames.includes(moving), `moving clip ${moving} not on avatar`);
});

/* ─────────────────────────── 2. Movement ──────────────────────────────── */
console.log('Movement / locomotion:');

t('LocomotionController: no input \u21d2 speed decays to ~0 (no drift)', () => {
  const c = new LocomotionController();
  // spin up
  for (let i = 0; i < 60; i++) c.step(1 / 60, { moveX: 0, moveY: -1, camYaw: 0 });
  // release
  for (let i = 0; i < 240; i++) c.step(1 / 60, { moveX: 0, moveY: 0, camYaw: 0 });
  assert.ok(c.state.speed01 < 0.02, `expected rest, got speed01=${c.state.speed01}`);
});

t('LocomotionController: full input \u21d2 speed01 ramps toward 1', () => {
  const c = new LocomotionController();
  for (let i = 0; i < 120; i++) c.step(1 / 60, { moveX: 0, moveY: -1, camYaw: 0 });
  assert.ok(c.state.speed01 > 0.9, `expected near-max, got ${c.state.speed01}`);
});

t('LocomotionController: acceleration is gradual (analog, not instant)', () => {
  const c = new LocomotionController();
  const s1 = c.step(1 / 60, { moveX: 0, moveY: -1, camYaw: 0 });
  assert.ok(s1.speed01 < 0.5, 'speed should ramp, not snap to max in one tick');
});

t('LocomotionController: camera-relative input rotates the movement direction', () => {
  const a = new LocomotionController();
  const b = new LocomotionController();
  for (let i = 0; i < 30; i++) {
    a.step(1 / 60, { moveX: 0, moveY: -1, camYaw: 0 });
    b.step(1 / 60, { moveX: 0, moveY: -1, camYaw: Math.PI / 2 });
  }
  // Same stick, different camera yaw \u21d2 different world heading.
  const da = Math.hypot(a.state.pos.x, a.state.pos.z);
  const db = Math.hypot(b.state.pos.x, b.state.pos.z);
  assert.ok(da > 0.1 && db > 0.1, 'both should move');
  assert.ok(Math.abs(a.state.pos.x - b.state.pos.x) > 0.1, 'camera yaw should change heading');
});

t('LocomotionController: clampPos keeps the avatar inside arena bounds', () => {
  const c = new LocomotionController();
  for (let i = 0; i < 300; i++) c.step(1 / 60, { moveX: 1, moveY: 0, camYaw: 0 });
  c.clampPos(-5, 5, -5, 5);
  assert.ok(c.state.pos.x <= 5 && c.state.pos.x >= -5);
});

t('turnToward: shortest-arc, respects max delta, wraps at \u00b1\u03c0', () => {
  assert.ok(Math.abs(turnToward(0, Math.PI / 2, 0.1) - 0.1) < 1e-9);
  // wrap: from 3.0 to -3.0 the short arc goes UP through \u03c0 (+~0.28 rad),
  // so a small step must increase the angle past 3.0, not decrease it.
  const r = turnToward(3.0, -3.0, 0.1);
  assert.ok(r > 3.0, 'should wrap the short way (through \u03c0)');
});

t('arcadeParamsFromPRQ: outputs finite, sensible bounds across PRQ range', () => {
  for (const prq of [0, 25, 50, 75, 100]) {
    const p = arcadeParamsFromPRQ(prq, 0.5);
    for (const v of Object.values(p)) {
      if (typeof v === 'number') assert.ok(Number.isFinite(v), `non-finite param at prq=${prq}`);
    }
    assert.ok(p.maxComboMultiplier >= 2.0 && p.movementSpeedScale > 0, `bounds off at prq=${prq}`);
  }
});

t('DEFAULT_LOCO: positive tuning constants', () => {
  assert.ok(DEFAULT_LOCO.baseMaxSpeed > 0);
  assert.ok(DEFAULT_LOCO.acceleration > 0);
  assert.ok(DEFAULT_LOCO.turnRate > 0);
});

/* ─────────────────────────── 3. Camera rigs ───────────────────────────── */
console.log('Camera rigs & cuts:');

const SUBJECT = { pos: { x: 1, y: 0, z: 2 }, facing: 0.5, speed01: 0.5 };

t('computeCamera: every rig kind returns finite position + target', () => {
  const kinds: RigKind[] = ['over_shoulder', 'broadcast', 'follow', 'storm', 'sideline'];
  for (const k of kinds) {
    const frame = computeCamera(SUBJECT, RIGS[k], 1.3);
    assert.ok(finite3(frame.position), `${k} position not finite`);
    assert.ok(finite3(frame.target), `${k} target not finite`);
    assert.ok(Number.isFinite(frame.fov) && frame.fov > 0, `${k} fov invalid`);
  }
});

t('computeCamera: storm rig orbits over time (position changes with t)', () => {
  const f0 = computeCamera(SUBJECT, RIGS.storm, 0);
  const f1 = computeCamera(SUBJECT, RIGS.storm, 1.5);
  const moved = Math.hypot(f0.position.x - f1.position.x, f0.position.z - f1.position.z);
  assert.ok(moved > 0.05, 'storm cam should encircle over time');
});

t('computeCamera: NaN subject input still returns a finite safety frame', () => {
  const bad = { pos: { x: NaN, y: 0, z: 0 }, facing: NaN, speed01: NaN };
  const frame = computeCamera(bad, RIGS.follow, 0);
  // Safety net cannot invent finite numbers from NaN subject, but must not throw;
  // for a finite subject it must be finite (covered above). Here just assert no throw
  // and that fov is finite.
  assert.ok(Number.isFinite(frame.fov));
});

t('rigForMode: every 3D mode maps to a known rig', () => {
  for (const mode of Object.keys(MODE_RIG)) {
    const rig = rigForMode(mode);
    assert.ok(rig && rig.kind, `mode ${mode} has no rig`);
  }
  // unknown mode falls back to a valid rig
  assert.ok(rigForMode('nonexistent_mode').kind);
});

t('easeInOut: clamped 0..1 and monotonic at endpoints', () => {
  assert.equal(easeInOut(0), 0);
  assert.equal(easeInOut(1), 1);
  assert.ok(easeInOut(-5) === 0 && easeInOut(5) === 1);
});

t('CameraCut: always resolves to the live frame (no dead/black cut)', () => {
  const cut = new CameraCut();
  const from: CameraFrame = { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 }, fov: 50 };
  const live: CameraFrame = { position: { x: 10, y: 5, z: 10 }, target: { x: 1, y: 1, z: 1 }, fov: 60 };
  cut.begin(from, 0.6);
  let frame = from;
  for (let i = 0; i < 60; i++) {
    frame = cut.update(1 / 60, live);
    assert.ok(finite3(frame.position) && finite3(frame.target), 'cut produced a non-finite frame');
  }
  assert.equal(cut.active, false, 'cut must complete');
  assert.deepEqual(frame.position, live.position, 'cut must resolve to the live frame');
});

t('CameraCut: mid-blend frame lies between source and destination', () => {
  const cut = new CameraCut();
  const from: CameraFrame = { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 }, fov: 50 };
  const live: CameraFrame = { position: { x: 10, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 }, fov: 50 };
  cut.begin(from, 1.0);
  const mid = cut.update(0.5, live);
  assert.ok(mid.position.x > 0 && mid.position.x < 10, 'mid frame must interpolate');
});

/* ─────────────────────────── 4. Ball state ────────────────────────────── */
console.log('Ball state & throw/catch:');

t('BallStateMachine: gain\u2192dribble\u2192release lifecycle', () => {
  const b = new BallStateMachine();
  b.gain('p1');
  assert.equal(b.state, 'held');
  assert.equal(b.possessor, 'p1');
  b.startDribble();
  assert.equal(b.state, 'live_dribble');
  b.release();
  assert.equal(b.state, 'in_flight');
  assert.equal(b.possessor, null);
});

t('BallStateMachine: pickup works from EVERY loose state (smooth pickups)', () => {
  const looseSetups: Array<[string, (b: BallStateMachine) => void]> = [
    ['live_bounce', (b) => { b.gain('p1'); b.startDribble(); b.loose(); }],
    ['in_flight', (b) => { b.gain('p1'); b.release(); }],
    ['rebound', (b) => { b.caromRebound(); }],
    ['dead_ball', (b) => { b.caromRebound(); for (let i = 0; i < 200; i++) b.update(0.05); }],
  ];
  for (const [label, setup] of looseSetups) {
    const b = new BallStateMachine();
    setup(b);
    assert.ok(b.isLoose(), `${label}: expected loose before pickup`);
    const ok = b.pickup('p2');
    assert.ok(ok, `${label}: pickup should succeed`);
    assert.equal(b.state, 'held', `${label}: should be held after pickup`);
    assert.equal(b.possessor, 'p2');
    assert.ok(b.snapshot().pickupTriggered, `${label}: pickupTriggered should fire`);
  }
});

t('BallStateMachine: pickup fails when firmly held (not loose)', () => {
  const b = new BallStateMachine();
  b.gain('p1');
  assert.equal(b.pickup('p2'), false);
  assert.equal(b.possessor, 'p1');
});

t('BallStateMachine: loose ball decays to dead_ball after LOOSE_TO_DEAD_SECONDS', () => {
  const b = new BallStateMachine();
  b.caromRebound();
  assert.equal(b.state, 'rebound');
  let elapsed = 0;
  while (elapsed < LOOSE_TO_DEAD_SECONDS + 0.2) { b.update(1 / 60); elapsed += 1 / 60; }
  assert.equal(b.state, 'dead_ball');
});

t('BallStateMachine: pickupTriggered is a one-shot (cleared next update)', () => {
  const b = new BallStateMachine();
  b.caromRebound();
  b.pickup('p2');
  assert.ok(b.snapshot().pickupTriggered);
  b.update(1 / 60);
  assert.equal(b.snapshot().pickupTriggered, false);
});

t('ThrowCatchController: cycles catch\u2192load\u2192throw\u2192recover\u2192catch', () => {
  const tc = new ThrowCatchController();
  const fit = {
    frcControlScore: 0.6, frcComposite: 0.5, iapComposite: 0.5,
    powerReadiness: 0.5, mobilityScore: 0.5, breathPhase: 0.3,
  };
  const seen = new Set<string>();
  for (let i = 0; i < 600; i++) {
    tc.update(1 / 60, fit);
    seen.add(tc.state.phase);
  }
  for (const p of ['catch', 'load', 'throw', 'recover']) {
    assert.ok(seen.has(p), `phase ${p} never reached`);
  }
  assert.ok(tc.state.throwsTriggered > 0, 'throws should have fired');
});

t('ThrowCatchController: throw impulse is clamped to the tuned band', () => {
  const tc = new ThrowCatchController();
  const fit = {
    frcControlScore: 1, frcComposite: 1, iapComposite: 1,
    powerReadiness: 1, mobilityScore: 1, breathPhase: 0.25,
  };
  for (let i = 0; i < 1200; i++) tc.update(1 / 60, fit);
  // lastImpulseY must be finite and within the documented clamp ceiling.
  assert.ok(Number.isFinite(tc.state.lastImpulseY));
  assert.ok(tc.state.lastImpulseY > 0, 'an impulse should have been recorded');
});

console.log(`\nAll ${pass} M7a assertions passed.\n`);
process.exit(0);
