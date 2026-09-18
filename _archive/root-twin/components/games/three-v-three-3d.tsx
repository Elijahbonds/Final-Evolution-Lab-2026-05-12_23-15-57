'use client';

/**
 * three-v-three-3d.tsx — M7c full-library 3D 3v3 Streetball.
 * =========================================================
 * TRUE free-locomotion 3D: dribble the half-court, kick to the OPEN teammate,
 * then knock down the open shot on a timing bar. Uses ALL SIX M7a libs:
 *   • LocomotionController  — WASD/arrows camera-relative drive
 *   • AnimDirectorFSM       — idle ⇆ locomotion ⇆ pass/shoot/score actions
 *   • AvatarDriver          — blends FSM decisions onto every avatar (6 on court)
 *   • BallStateMachine      — held → in_flight → dead ball
 *   • camera rigs + CameraCut — follow rig on the drive, broadcast cut on the shot
 *   • clip-registry         — basketball_3v3 clips (dribble/shoot/score/defend)
 *
 * EXACT tuned constants from the proven 2D streetball scene are preserved.
 * // TUNE(elijah)
 */

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import * as THREE from 'three';
import type { GameProps } from '@/components/games/game-shell';
import { Avatar, type AvatarHandle } from '@/components/three/avatar';
import { SceneLighting } from '@/components/three/lighting';
import { PerfSampler, PerfOverlay } from '@/components/three/perf-hud';
import { MapMesh } from '@/components/three/map-loader';
import { VeniceSurround } from '@/components/three/venice-surround';
import { SceneBackdrop } from '@/components/three/scene-backdrop';
import { PremiumHoop, DustMotes, HoopGlow, Basketball } from '@/components/three/basketball-court';
import { BallFlightRenderer, createBallFlightTracker, createNetHandle } from '@/components/three/ball-flight-renderer';
import { RimGlowPulse } from '@/components/three/effects';
import { useOrientation } from '@/components/three/orientation';
import { PERF_BUDGET, gradePerf, HUD_SNAPSHOT_INTERVAL, type PerfSample } from '@/lib/three-budget';
import { registerFelMode, unregisterFelMode } from '@/lib/playtest/harness';
import { MAPS } from '@/lib/map-data';
import { detectDevice, MODE_BINDINGS } from '@/lib/scene/input-manager';
import { AnimDirectorFSM } from '@/lib/anim/state-machine';
import { AvatarDriver } from '@/lib/anim/avatar-driver';
import { LocomotionController } from '@/lib/loco/movement';
import { updateFacing, faceYaw } from '@/lib/anim/facing';
import { ObstacleProps } from '@/components/three/obstacle-props';
import { BallStateMachine } from '@/lib/ball/ball-state';
import { computeCamera, CameraCut, RIGS, type CameraFrame, type Subject } from '@/lib/camera/rigs';
import { createPrqEmitter, spawnPrq, updatePrq, PrqFloatLayer, type PrqPop } from '@/components/games/prq-float';
import { createDefenderBite, resolveFake, crossover, updateDefenderBite, isOpen, BITE, type DefenderBite } from '@/lib/feel/defender-bite';

const DEF_AGGRESSION = 0.6; // TUNE(elijah) — 3v3 help-defender bite eagerness

const HERO_URL = '/models/elijah-hero.glb';
const MAP = MAPS['venice-blue-court'];

const HOOP_POS = new THREE.Vector3(0, 3.05, 0);
// Shared hero mesh art faces -Z; add this offset when writing rotation.y so
// figures face their intended direction (matches football-3d hero convention).
const MODEL_YAW = Math.PI;
const COURT_BOUNDS = { minX: -7, maxX: 7, minZ: -1, maxZ: 9 };
// M8.4: named half-court sets — the called play name stays up until the possession resolves
const PLAYS = ['ISO — CLEAR OUT', 'PICK & ROLL', 'KICK-OUT 3', 'DRIVE & DISH', 'HORNS SET']; // TUNE(elijah)
// M8.4: hot/cold floor zones (distance from hoop → shot value read). x/z centre + radius + colour.
const HOT_ZONES: { x: number; z: number; r: number; color: string }[] = [
  { x: 0, z: 2.2, r: 2.2, color: '#FFD700' },  // hot — at the rim // TUNE(elijah)
  { x: 0, z: 5.0, r: 1.6, color: '#FF8A3D' },  // warm — mid-range // TUNE(elijah)
  { x: -4.4, z: 6.6, r: 1.4, color: '#00E5FF' }, // cold — deep left wing // TUNE(elijah)
  { x: 4.4, z: 6.6, r: 1.4, color: '#00E5FF' },  // cold — deep right wing // TUNE(elijah)
];

// ── EXACT tuned constants (verbatim from proven 2D 3v3) ── // TUNE(elijah)
const TARGET = 21;
const GAME_LEN = 90;
const PASS_WINDOW = 2.0;   // shot-clock / pass decision window
const AI_SCORE_EVERY = 8;  // AI auto-bucket cadence (s)
const SHOT_TARGET = 0.75;  // release-bar sweet centre

// Three teammate lanes in front of the hoop (left / center / right).
const LANES = [
  { x: -3.2, z: 2.4 },
  { x: 0.0, z: 1.8 },
  { x: 3.2, z: 2.4 },
];
const DEFENDERS = [
  { x: -1.8, z: 3.6 },
  { x: 1.8, z: 3.6 },
];

type Phase = 'play' | 'pass' | 'shot' | 'flight' | 'msg';

interface HudState {
  prqPops: PrqPop[]; // M8.4 floating +PRQ reward text
  myScore: number; aiScore: number; assists: number;
  phase: Phase; bar: number; passTimer: number; timeLeft: number;
  openLane: number; shotIsOpen: boolean; playName: string;
  msg: string; msgColor: string; msgT: number;
  prqLabel: string; prqColor: string; camRig: string;
}

function CourtCamera({
  subjectRef, rigModeRef, cutRef,
}: {
  subjectRef: React.MutableRefObject<Subject>;
  rigModeRef: React.MutableRefObject<'follow' | 'broadcast'>;
  cutRef: React.MutableRefObject<CameraCut>;
}) {
  const camera = useThree((s) => s.camera);
  const smoothed = useRef<CameraFrame>({ position: { x: 4, y: 2.8, z: 10 }, target: { x: 0, y: 1.2, z: 4 }, fov: 50 });
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const rig = rigModeRef.current === 'broadcast' ? RIGS.broadcast : RIGS.follow;
    const target = computeCamera(subjectRef.current, rig);
    const frame = cutRef.current.active ? cutRef.current.update(dt, target) : target;
    const sm = smoothed.current;
    const rate = (rig.stiffness + 0.04) * 6 * dt * 10;
    sm.position.x += (frame.position.x - sm.position.x) * rate;
    sm.position.y += (frame.position.y - sm.position.y) * rate;
    sm.position.z += (frame.position.z - sm.position.z) * rate;
    sm.target.x += (frame.target.x - sm.target.x) * rate;
    sm.target.y += (frame.target.y - sm.target.y) * rate;
    sm.target.z += (frame.target.z - sm.target.z) * rate;
    camera.position.set(sm.position.x, sm.position.y, sm.position.z);
    camera.lookAt(sm.target.x, sm.target.y, sm.target.z);
    const cam = camera as THREE.PerspectiveCamera;
    if (cam.isPerspectiveCamera) { cam.fov += (frame.fov - cam.fov) * 0.1; cam.updateProjectionMatrix(); }
  });
  return null;
}

function ThreeVThreeScene({
  grade, prq, onEnd, gamepad, onHud, onPerf, startedRef,
}: GameProps & { onHud: (h: HudState) => void; onPerf: (p: PerfSample) => void; startedRef: React.MutableRefObject<boolean> }) {
  const playerRef = useRef<AvatarHandle | null>(null);
  const mateRefs = useRef<(AvatarHandle | null)[]>([null, null, null]);
  const defRefs = useRef<(AvatarHandle | null)[]>([null, null]);
  const ballMeshRef = useRef<THREE.Mesh>(null);
  const onEndRef = useRef(onEnd); onEndRef.current = onEnd;
  const gradeRef = useRef(grade); gradeRef.current = grade;
  const endedRef = useRef(false);

  // EXACT tuned sweet spot (verbatim from 2D) // TUNE(elijah)
  const sweet = grade.key === 'ELITE' ? 0.2 : grade.key === 'PRIMED' ? 0.17 : grade.key === 'READY' ? 0.14 : 0.12;

  const loco = useRef(new LocomotionController({ speedScale: grade?.speedMult ?? 1 }, { x: 0, z: 7 }));
  const dir = useRef(new AnimDirectorFSM());
  const drv = useRef(new AvatarDriver());
  const mateDirs = useRef([new AnimDirectorFSM(), new AnimDirectorFSM(), new AnimDirectorFSM()]);
  const mateDrvs = useRef([new AvatarDriver(), new AvatarDriver(), new AvatarDriver()]);
  const mateActs = useRef<(string | undefined)[]>([undefined, undefined, undefined]);
  const defDirs = useRef([new AnimDirectorFSM(), new AnimDirectorFSM()]);
  const defDrvs = useRef([new AvatarDriver(), new AvatarDriver()]);
  const ballSM = useRef(new BallStateMachine());
  const bite = useRef<DefenderBite>(createDefenderBite()); // Phase4: shared fake-then-commit model (same lib as 1v1)
  const flightTracker = useRef(createBallFlightTracker());
  const netHandle = useRef(createNetHandle());
  const cut = useRef(new CameraCut());
  const rigMode = useRef<'follow' | 'broadcast'>('follow');
  const camSubject = useRef<Subject>({ pos: { x: 0, y: 1.1, z: 7 }, facing: Math.PI, speed01: 0 });
  const actionEvt = useRef<string | undefined>(undefined);
  const ringRef = useRef<THREE.Mesh>(null);          // M8.4 controlled-player indicator
  const hotZonesRef = useRef<THREE.Group>(null);     // M8.4 hot/cold floor zones

  const st = useRef({
    t: 0, phase: 'play' as Phase,
    prq: createPrqEmitter(), // M8.4 PRQ surfacing
    myScore: 0, aiScore: 0, assists: 0,
    barT: Math.random() * Math.PI, bar: 0,
    openLane: 0, passTimer: PASS_WINDOW, shotIsOpen: false, playName: '',
    aiClock: AI_SCORE_EVERY, timeLeft: GAME_LEN,
    flight: null as null | { from: THREE.Vector3; to: THREE.Vector3; t: number; made: boolean; value: number },
    passBall: null as null | { from: THREE.Vector3; to: THREE.Vector3; t: number },
    msg: '', msgColor: '#FFD700', msgT: 0,
    startTime: Date.now(),
    keys: {} as Record<string, boolean>,
    fired: false,
  });

  const say = useCallback((m: string, c: string) => {
    const s = st.current; s.msg = m; s.msgColor = c; s.msgT = 1.3;
  }, []);

  const finish = useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;
    const s = st.current;
    const won = s.myScore > s.aiScore;
    const dur = Math.round((Date.now() - s.startTime) / 1000);
    // EXACT scoring formula (verbatim from 2D) // TUNE(elijah)
    onEndRef.current?.({
      score: s.myScore * 100 + s.assists * 30,
      opponentScore: s.aiScore * 100,
      won,
      duration: dur,
      headline: won ? `${s.myScore}-${s.aiScore} — STREETBALL LEGENDS` : `${s.myScore}-${s.aiScore} — NEXT GAME, SAME COURT`,
    });
  }, []);

  // Begin the pass decision: pick a random open lane, start the shot-clock.
  const beginPass = useCallback(() => {
    const s = st.current;
    if (s.phase !== 'play') return;
    s.openLane = Math.floor(Math.random() * 3);
    s.passTimer = PASS_WINDOW;
    s.playName = PLAYS[Math.floor(Math.random() * PLAYS.length)]; // M8.4 called play persists
    s.phase = 'pass';
  }, []);

  // Player chose a lane to pass to.
  const choosePass = useCallback((lane: number) => {
    const s = st.current;
    if (s.phase !== 'pass') return;
    const mate = mateActs.current;
    if (lane >= 0 && lane < 3) mate[lane] = 'shoot';
    actionEvt.current = 'defend'; // pass gesture routes through action layer
    const from = new THREE.Vector3(loco.current.state.pos.x, 1.6, loco.current.state.pos.z);
    const to = new THREE.Vector3(LANES[lane].x, 1.6, LANES[lane].z);
    s.passBall = { from, to, t: 0 };
    if (lane === s.openLane) {
      s.assists += 1; s.shotIsOpen = true;
      s.phase = 'shot'; s.fired = false; s.barT = Math.random() * Math.PI;
    } else {
      s.aiScore += 2; // turnover punished
      if (s.myScore >= TARGET || s.aiScore >= TARGET) { finish(); return; }
      say('PICKED OFF! TURNOVER', '#FF3366');
      s.phase = 'msg'; s.msgT = 1.2; s.shotIsOpen = false;
    }
  }, [say, finish]);

  // Fire the shot, sampling the live release bar.
  const fire = useCallback(() => {
    const s = st.current;
    if (s.phase !== 'shot' || s.fired) return;
    s.fired = true;
    const p = Math.abs(Math.sin(s.barT));
    const err = Math.abs(p - SHOT_TARGET);
    // Phase4: open look comes from either the correct lane pick OR beating the defender with a fake
    const open = s.shotIsOpen || isOpen(bite.current);
    const windowSize = open ? sweet * BITE.OPEN_SWEET_MULT : sweet; // TUNE(elijah) shared 1v1/3v3 multiplier
    const splash = err < windowSize * 0.45;
    const made = err < windowSize;
    const value = splash ? 3 : made ? 2 : 0;
    actionEvt.current = 'shoot';
    ballSM.current.release();
    rigMode.current = 'broadcast';
    cut.current.begin(computeCamera(camSubject.current, RIGS.follow), 0.5);
    const from = new THREE.Vector3(LANES[s.openLane].x, 1.9, LANES[s.openLane].z);
    s.flight = { from, to: HOOP_POS.clone(), t: 0, made: made || splash, value };
    s.phase = 'flight';
    if (splash) { s.myScore += 3; spawnPrq(s.prq, 15, '#FFD700'); say('SPLASH! +3', '#FFD700'); } // M8.4
    else if (made) { s.myScore += 2; spawnPrq(s.prq, 10, '#00FF9D'); say('AND ONE! +2', '#00FF9D'); } // M8.4
    else { s.aiScore += 1; say('RIMMED OUT', '#FF3366'); }
  }, [sweet, say]);

  // Phase4: shot-fake — try to make the help defender bite (shared model with 1v1).
  const doFake = useCallback(() => {
    const s = st.current;
    if (s.phase !== 'play' && s.phase !== 'pass' && s.phase !== 'shot') return;
    const bit = resolveFake(bite.current, DEF_AGGRESSION, Math.random());
    if (bit) { actionEvt.current = 'block'; say('SHAKE — HELP BITES!', '#FFD700'); }
    else { actionEvt.current = 'defend'; say('D STAYS HOME', '#8899AA'); }
  }, [say]);

  // Phase4: crossover — shift defender weight so the next fake bites easier.
  const doCross = useCallback((d: number) => {
    crossover(bite.current, d < 0 ? -1 : 1);
  }, []);

  useEffect(() => {
    const setKey = (k: string, down: boolean) => { st.current.keys[k] = down; };
    const kd = (e: KeyboardEvent) => {
      const k = (e.key ?? '').toLowerCase();
      setKey(k, true);
      const s = st.current;
      if (k === ' ') {
        e.preventDefault?.();
        if (s.phase === 'play') beginPass();
        else if (s.phase === 'shot') fire();
      }
      if (s.phase === 'pass') {
        if (e.key === 'ArrowLeft') { e.preventDefault?.(); choosePass(0); }
        if (e.key === 'ArrowUp') { e.preventDefault?.(); choosePass(1); }
        if (e.key === 'ArrowRight') { e.preventDefault?.(); choosePass(2); }
      }
      if (k === 'f') { e.preventDefault?.(); doFake(); }
      if (k === 'q') { e.preventDefault?.(); doCross(-1); }
      if (k === 'e') { e.preventDefault?.(); doCross(1); }
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright', ' '].includes(k)) e.preventDefault?.();
    };
    const ku = (e: KeyboardEvent) => setKey((e.key ?? '').toLowerCase(), false);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    (window as any).__felThreeVThree3D = { pass: beginPass, choose: choosePass, shoot: fire, fake: doFake, cross: doCross };
    registerFelMode('threeVThree', {
      getState: () => { const s = st.current; return { phase: s.phase, myScore: s.myScore, aiScore: s.aiScore, assists: s.assists, timeLeft: s.timeLeft, playName: s.playName, defenderOpen: isOpen(bite.current) }; },
      sendInput: (a, p) => { if (a === 'pass') beginPass(); else if (a === 'choose') choosePass((p as any)); else if (a === 'shoot') fire(); else if (a === 'fake') doFake(); else if (a === 'cross') doCross((p as number) ?? 1); },
    });
    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      delete (window as any).__felThreeVThree3D;
      unregisterFelMode('threeVThree');
    };
  }, [beginPass, choosePass, fire, doFake, doCross]);

  const hudAcc = useRef(0); // M-perf: throttle HUD setState to 30Hz

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const s = st.current;
    if (endedRef.current) return;
    s.t += dt;
    if (s.msgT > 0) s.msgT -= dt;
    ballSM.current.update(dt);
    updateDefenderBite(bite.current, dt); // Phase4: lean eases back, open window decays

    // Game clock — only drains once the controls card is dismissed and play has
    // begun (M12.4: no clock drain on a screen you can't play yet).
    if (startedRef.current) {
      s.timeLeft -= dt;
      if (s.timeLeft <= 0) { s.timeLeft = 0; finish(); return; }
    }

    // AI auto-bucket on its cadence // TUNE(elijah)
    s.aiClock -= dt;
    if (s.aiClock <= 0) {
      s.aiClock = AI_SCORE_EVERY;
      s.aiScore += Math.random() > 0.5 ? 2 : 1;
      if (s.aiScore >= TARGET) { finish(); return; }
    }

    // ── Free locomotion (only during play) ──
    let moveX = 0, moveY = 0;
    const canMove = s.phase === 'play';
    if (canMove) {
      if (s.keys['a'] || s.keys['arrowleft']) moveX -= 1;
      if (s.keys['d'] || s.keys['arrowright']) moveX += 1;
      if (s.keys['w'] || s.keys['arrowup']) moveY -= 1;
      if (s.keys['s'] || s.keys['arrowdown']) moveY += 1;
      if (gamepad) {
        if (gamepad.left) moveX -= 1; if (gamepad.right) moveX += 1;
        if (gamepad.up) moveY -= 1; if (gamepad.down) moveY += 1;
      }
    }
    const locoState = loco.current.step(dt, { moveX, moveY, camYaw: 0 });
    loco.current.clampPos(COURT_BOUNDS.minX, COURT_BOUNDS.maxX, COURT_BOUNDS.minZ, COURT_BOUNDS.maxZ);

    // ── Pass window (shot-clock) ──
    if (s.phase === 'pass') {
      s.passTimer -= dt;
      if (s.passTimer <= 0) {
        s.aiScore += 1; // shot-clock violation
        if (s.aiScore >= TARGET) { finish(); return; }
        say('SHOT CLOCK! TURNOVER', '#FF3366');
        s.phase = 'msg'; s.msgT = 1.2;
      }
    }

    // ── Release bar oscillation (rate verbatim) // TUNE(elijah) ──
    if (s.phase === 'shot') {
      s.barT += dt * 3.2 * (gradeRef.current?.speedMult ?? 1);
      s.bar = Math.abs(Math.sin(s.barT));
    }

    // ── Pass-ball travel (visual) ──
    if (s.passBall) { s.passBall.t += dt * 3.0; if (s.passBall.t >= 1) s.passBall = null; }

    // ── Shot flight resolution ──
    if (s.phase === 'flight' && s.flight) {
      const f = s.flight; f.t += dt * 1.8;
      if (f.t >= 1) {
        if (f.made) { actionEvt.current = 'score'; netHandle.current.swish(); }
        s.flight = null;
        flightTracker.current.airborne = false;
        rigMode.current = 'follow';
        s.shotIsOpen = false;
        if (s.myScore >= TARGET || s.aiScore >= TARGET) { finish(); return; }
        s.phase = 'msg'; s.msgT = 0.8;
      }
    }

    // ── Message phase → reset to play ──
    if (s.phase === 'msg' && s.msgT <= 0) {
      s.phase = 'play';
      s.playName = ''; // M8.4 possession resolved — clear called play
      bite.current = createDefenderBite(); // Phase4: reset defender balance each new possession
      loco.current.state.pos.x = 0; loco.current.state.pos.z = 7; loco.current.state.facing = Math.PI;
    }

    // ── Drive player avatar ──
    if (playerRef.current) {
      const g = playerRef.current.group;
      g.position.set(locoState.pos.x, MAP.floorY ?? 0, locoState.pos.z);
      // Face travel direction while playing; aim the rim when set. Uses the
      // shared facing core (+MODEL_YAW for the -Z mesh) for correct orientation.
      g.rotation.y = updateFacing({
        current: g.rotation.y - MODEL_YAW,
        velX: locoState.vel.x,
        velZ: locoState.vel.z,
        targetX: HOOP_POS.x,
        targetZ: HOOP_POS.z,
        selfX: locoState.pos.x,
        selfZ: locoState.pos.z,
        engaged: !canMove,
        dt,
      }) + MODEL_YAW;
      const decision = dir.current.update(dt, {
        modeId: 'basketball_3v3',
        speed01: canMove ? locoState.speed01 : 0,
        phase: '',
        actionEvent: actionEvt.current,
      });
      actionEvt.current = undefined;
      drv.current.apply(decision);
      camSubject.current.pos.x = locoState.pos.x;
      camSubject.current.pos.y = 1.1;
      camSubject.current.pos.z = locoState.pos.z;
      camSubject.current.facing = g.rotation.y;
      camSubject.current.speed01 = locoState.speed01;
    }

    // ── Drive teammates (idle in lanes; the open one gently bobs) ──
    for (let i = 0; i < 3; i++) {
      const ref = mateRefs.current[i]; if (!ref) continue;
      const bob = (s.phase === 'pass' && i === s.openLane) ? Math.sin(s.t * 6) * 0.15 : 0;
      ref.group.position.set(LANES[i].x, MAP.floorY ?? 0, LANES[i].z + bob);
      ref.group.rotation.y = faceYaw(HOOP_POS.x - LANES[i].x, HOOP_POS.z - LANES[i].z) + MODEL_YAW;
      const dec = mateDirs.current[i].update(dt, { modeId: 'basketball_3v3', speed01: 0, phase: '', actionEvent: mateActs.current[i] });
      mateActs.current[i] = undefined;
      mateDrvs.current[i].apply(dec);
    }

    // ── Drive defenders (slide toward player) ──
    for (let i = 0; i < 2; i++) {
      const ref = defRefs.current[i]; if (!ref) continue;
      const base = DEFENDERS[i];
      const tx = base.x + (locoState.pos.x - base.x) * 0.25;
      const tz = base.z + Math.sin(s.t * 0.8 + i) * 0.4;
      ref.group.position.set(tx, MAP.floorY ?? 0, tz);
      const dx = locoState.pos.x - tx, dz = locoState.pos.z - tz;
      if (Math.abs(dx) + Math.abs(dz) > 0.1) ref.group.rotation.y = faceYaw(dx, dz) + MODEL_YAW;
      const spd = Math.min(Math.hypot(dx, dz) * 0.15, 0.5);
      const dec = defDirs.current[i].update(dt, { modeId: 'basketball_3v3', speed01: spd, phase: '', actionEvent: undefined });
      defDrvs.current[i].apply(dec);
    }

    // ── Ball mesh follow ──
    if (ballMeshRef.current) {
      const bm = ballMeshRef.current;
      if (s.phase === 'flight' && s.flight) {
        const f = s.flight; const t = Math.min(f.t, 1);
        bm.visible = true;
        bm.position.set(
          f.from.x + (f.to.x - f.from.x) * t,
          f.from.y + (f.to.y - f.from.y) * t + Math.sin(t * Math.PI) * 2.6,
          f.from.z + (f.to.z - f.from.z) * t,
        );
        const ft = flightTracker.current;
        ft.airborne = true; ft.arcFrom = f.from; ft.arcTo = f.to; ft.arcApex = 2.6; ft.showArc = true;
      } else if (s.passBall) {
        const pb = s.passBall; const t = Math.min(pb.t, 1);
        bm.visible = true;
        bm.position.set(
          pb.from.x + (pb.to.x - pb.from.x) * t,
          pb.from.y + (pb.to.y - pb.from.y) * t + Math.sin(t * Math.PI) * 0.8,
          pb.from.z + (pb.to.z - pb.from.z) * t,
        );
        const ft = flightTracker.current;
        ft.airborne = true; ft.arcFrom = pb.from; ft.arcTo = pb.to; ft.arcApex = 0.8; ft.showArc = true;
      } else {
        bm.visible = true;
        flightTracker.current.airborne = false;
        const hand = playerRef.current?.bone?.('RightHand');
        if (hand) {
          const wp = new THREE.Vector3(); hand.getWorldPosition(wp);
          const bounce = canMove && locoState.speed01 > 0.1 ? Math.abs(Math.sin(s.t * 8)) * 0.3 : 0;
          bm.position.set(wp.x + 0.2, Math.max(0.12, wp.y - 0.4 - bounce), wp.z);
        } else {
          bm.position.set(locoState.pos.x + 0.3, 0.9, locoState.pos.z);
        }
      }
    }

    // M8.4: controlled-player ring follows you every frame; hot zones show only in possession
    if (ringRef.current) {
      ringRef.current.position.set(locoState.pos.x, (MAP.floorY ?? 0) + 0.03, locoState.pos.z);
      const pulse = 1 + Math.sin(s.t * 5) * 0.12; // TUNE(elijah)
      ringRef.current.scale.set(pulse, pulse, pulse);
    }
    if (hotZonesRef.current) {
      hotZonesRef.current.visible = s.phase === 'play' || s.phase === 'pass' || s.phase === 'shot';
    }

    const prqPops = updatePrq(s.prq, dt); // M8.4 — particle life must decay every frame
    hudAcc.current += dt;
    if (hudAcc.current >= HUD_SNAPSHOT_INTERVAL) {
      hudAcc.current = 0;
      onHud({
        prqPops,
        myScore: s.myScore, aiScore: s.aiScore, assists: s.assists,
        phase: s.phase, bar: s.bar, passTimer: s.passTimer, timeLeft: s.timeLeft,
        openLane: s.openLane, shotIsOpen: s.shotIsOpen, playName: s.playName,
        msg: s.msg, msgColor: s.msgColor, msgT: s.msgT,
        prqLabel: gradeRef.current?.label ?? '', prqColor: gradeRef.current?.color ?? '#00FF9D',
        camRig: rigMode.current,
      });
    }
  });

  return (
    <>
      {MAP.backdrop && (<Suspense fallback={null}><SceneBackdrop url={MAP.backdrop} /></Suspense>)}
      <Suspense fallback={null}><MapMesh config={MAP} /></Suspense>
      <VeniceSurround boundsMin={MAP.boundsMin} boundsMax={MAP.boundsMax} />

      {/* M8.4: hot/cold floor zones for the ball-handler (visibility toggled in useFrame) */}
      <group ref={hotZonesRef}>
        {HOT_ZONES.map((z, i) => (
          <mesh key={`hz${i}`} position={[z.x, (MAP.floorY ?? 0) + 0.015, z.z]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[z.r * 0.62, z.r, 40]} />
            <meshBasicMaterial color={z.color} transparent opacity={0.32} depthWrite={false} />
          </mesh>
        ))}
        {HOT_ZONES.map((z, i) => (
          <mesh key={`hzf${i}`} position={[z.x, (MAP.floorY ?? 0) + 0.012, z.z]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[z.r * 0.62, 40]} />
            <meshBasicMaterial color={z.color} transparent opacity={0.1} depthWrite={false} />
          </mesh>
        ))}
      </group>

      {/* M8.4: permanent controlled-player indicator ring (position updated every frame) */}
      <mesh ref={ringRef} position={[0, (MAP.floorY ?? 0) + 0.03, 7]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.5, 0.72, 48]} />
        <meshBasicMaterial color="#00FF9D" transparent opacity={0.92} depthWrite={false} />
      </mesh>

      {/* Ambient sideline obstacles + slow-patrolling figures so the court no
          longer reads as empty. Decorative only (deterministic from a seed);
          excludes the rim, player spawn and passing lanes. */}
      <ObstacleProps
        config={{
          bounds: { minX: -6.5, maxX: 6.5, minZ: 0.5, maxZ: 8 },
          obstacleCount: 5,
          mobCount: 3,
          exclude: [
            { pos: { x: 0, z: 0 }, radius: 3 },
            { pos: { x: 0, z: 7 }, radius: 2 },
            { pos: LANES[0], radius: 1.5 },
            { pos: LANES[1], radius: 1.5 },
            { pos: LANES[2], radius: 1.5 },
          ],
        }}
        seed={343}
        floorY={MAP.floorY ?? 0}
      />

      <PremiumHoop netHandle={netHandle} />
      <HoopGlow />
      <DustMotes count={50} />
      <RimGlowPulse color="#00E5FF" position={[-5, 3, -2]} baseIntensity={12} pulseAmp={6} />
      <RimGlowPulse color="#FF3366" position={[5, 2.5, 0]} baseIntensity={10} pulseAmp={5} />
      <Basketball ballRef={ballMeshRef} />
      <BallFlightRenderer ballRef={ballMeshRef} tracker={flightTracker} />

      <Suspense fallback={null}>
        <Avatar
          url={HERO_URL}
          onReady={(h) => {
            playerRef.current = h;
            h.group.position.set(0, MAP.floorY ?? 0, 7);
            h.group.rotation.y = faceYaw(HOOP_POS.x - 0, HOOP_POS.z - 7) + MODEL_YAW;
            drv.current.attach(h);
            dir.current.reset();
            ballSM.current.gain('player');
            h.play('guard', { loop: true, timeScale: 0.18 }); // M7-QA1: calm idle
          }}
        />
      </Suspense>

      {[0, 1, 2].map((i) => (
        <Suspense key={`mate${i}`} fallback={null}>
          <Avatar
            url={HERO_URL}
            tint="#00E5FF"
            onReady={(h) => {
              mateRefs.current[i] = h;
              h.group.position.set(LANES[i].x, MAP.floorY ?? 0, LANES[i].z);
              h.group.rotation.y = faceYaw(HOOP_POS.x - LANES[i].x, HOOP_POS.z - LANES[i].z) + MODEL_YAW;
              mateDrvs.current[i].attach(h);
              mateDirs.current[i].reset();
              h.play('guard', { loop: true, timeScale: 0.18 }); // M7-QA1: calm idle (teammates)
            }}
          />
        </Suspense>
      ))}

      {[0, 1].map((i) => (
        <Suspense key={`def${i}`} fallback={null}>
          <Avatar
            url={HERO_URL}
            tint="#FF3366"
            onReady={(h) => {
              defRefs.current[i] = h;
              h.group.position.set(DEFENDERS[i].x, MAP.floorY ?? 0, DEFENDERS[i].z);
              h.group.rotation.y = faceYaw(0 - DEFENDERS[i].x, 7 - DEFENDERS[i].z) + MODEL_YAW;
              defDrvs.current[i].attach(h);
              defDirs.current[i].reset();
              h.play('guard', { loop: true, timeScale: 0.18 }); // M7-QA1: calm idle (defenders)
            }}
          />
        </Suspense>
      ))}

      <CourtCamera subjectRef={camSubject} rigModeRef={rigMode} cutRef={cut} />
      <PerfSampler onSample={onPerf} />
    </>
  );
}

export default function ThreeVThree3D(props: GameProps) {
  const orient = useOrientation();
  const [dpr, setDpr] = useState(1.5);
  const [hud, setHud] = useState<HudState | null>(null);
  const [perf, setPerf] = useState<PerfSample | null>(null);
  const [showPerf, setShowPerf] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [showControls, setShowControls] = useState(true);
  const [device] = useState(() => detectDevice());
  const startedRef = useRef(false);

  useEffect(() => {
    // M7-QA1: ensure canvas focus for keyboard input
    const el = canvasRef.current;
    if (el) { el.tabIndex = 0; el.style.outline = 'none'; el.focus(); }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'p') setShowPerf((v) => !v);
      setShowControls(false); startedRef.current = true;
    };
    const onTouch = () => { setShowControls(false); startedRef.current = true; };
    window.addEventListener('keydown', onKey);
    window.addEventListener('touchstart', onTouch, { once: true });
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('touchstart', onTouch); };
  }, []);

  const grade = perf ? gradePerf(perf) : null;
  const sweet = props.grade.key === 'ELITE' ? 0.2 : props.grade.key === 'PRIMED' ? 0.17 : props.grade.key === 'READY' ? 0.14 : 0.12;
  const bridge = () => (window as any).__felThreeVThree3D;

  const prompt = hud
    ? hud.phase === 'play'
      ? 'WASD — work the court · SPACE — kick it out to the open man'
      : hud.phase === 'pass'
      ? '← LEFT · ↑ CENTER · → RIGHT — hit the OPEN teammate'
      : hud.phase === 'shot'
      ? 'SPACE — knock down the open look'
      : ''
    : '';

  return (
    <div
      ref={canvasRef}
      onClick={() => canvasRef.current?.focus()}
      className="relative mx-auto w-full overflow-hidden rounded-xl border border-white/5 shadow-[0_0_60px_rgba(0,229,255,0.06)]"
      style={{ aspectRatio: orient === 'portrait' ? '3 / 4' : '16 / 9', maxWidth: orient === 'portrait' ? 560 : 960, background: MAP.fogColor }}
    >
      <Canvas
        dpr={dpr}
        shadows
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1, powerPreference: 'high-performance' }}
        camera={{ fov: orient === 'portrait' ? 60 : 50, near: 0.1, far: 200, position: [4, 3, 12] }}
        scene={{ fog: new THREE.Fog(new THREE.Color(MAP.fogColor), MAP.fogNear, MAP.fogFar) }}
      >
        <PerformanceMonitor
          onIncline={() => setDpr((d) => Math.min(d + 0.25, PERF_BUDGET.dprMax))}
          onDecline={() => setDpr((d) => Math.max(d - 0.25, PERF_BUDGET.dprMin))}
        >
          <SceneLighting />
          <ThreeVThreeScene {...props} onHud={setHud} onPerf={setPerf} startedRef={startedRef} />
        </PerformanceMonitor>
      </Canvas>

      {hud && (
        <div className="absolute inset-0 pointer-events-none" style={{ fontFamily: 'var(--font-display), sans-serif' }}>
          {/* M8.4 — floating PRQ reward text */}
          <PrqFloatLayer pops={hud.prqPops} />
          <div className="absolute top-3 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1">
            <div className="flex items-center gap-5 px-5 py-1.5 rounded-xl" style={{ background: 'rgba(5,5,8,0.75)', backdropFilter: 'blur(12px)', border: '1px solid rgba(0,229,255,0.2)' }}>
              <span className="text-2xl font-bold text-[#00E5FF]">{hud.myScore}</span>
              <span className="text-[11px] text-white/60 font-mono">3V3 · TO {TARGET} · {Math.ceil(hud.timeLeft)}s</span>
              <span className="text-2xl font-bold text-[#FF3366]">{hud.aiScore}</span>
            </div>
            <div className="flex gap-3 items-center px-3 py-0.5 rounded-lg font-mono text-[10px] text-white/70" style={{ background: 'rgba(5,5,8,0.8)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <span style={{ color: hud.prqColor }}>{hud.prqLabel}</span>
              <span style={{ color: '#C99BF7' }}>CAM {hud.camRig.toUpperCase()}</span>
              <span style={{ color: '#00FF9D' }}>{hud.assists} AST</span>
            </div>
          </div>

          {/* M8.4: called-play banner — stays up until the possession resolves */}
          {hud.playName && (hud.phase === 'pass' || hud.phase === 'shot' || hud.phase === 'flight') && (
            <div className="absolute top-[68px] left-1/2 -translate-x-1/2">
              <div className="px-4 py-1 rounded-full text-sm font-bold tracking-wide text-[#FFD700]" style={{ background: 'rgba(5,5,8,0.82)', border: '1px solid rgba(255,215,0,0.4)', boxShadow: '0 0 18px rgba(255,215,0,0.25)' }}>
                ▶ {hud.playName}
              </div>
            </div>
          )}

          {/* Pass phase lane picker */}
          {hud.phase === 'pass' && (
            <div className="absolute bottom-20 left-1/2 -translate-x-1/2 text-center pointer-events-auto">
              <div className="mx-auto mb-2 w-fit rounded px-3 py-1 text-lg font-bold text-[#00E5FF]" style={{ background: '#0a0a14', border: '1px solid rgba(0,229,255,0.3)' }}>FIND THE OPEN MAN</div>
              <div className="flex gap-3 mb-2">
                {[0, 1, 2].map((lane) => (
                  <button
                    key={lane}
                    onClick={() => bridge()?.choose(lane)}
                    className={`px-5 py-3 rounded-lg font-bold text-sm transition ${lane === hud.openLane && Math.floor(hud.passTimer * 6) % 2 === 0 ? 'bg-[#00FF9D]/40 text-[#00FF9D] ring-1 ring-[#00FF9D]/50 animate-pulse' : 'bg-black/60 text-white border border-white/20'}`}
                  >
                    {lane === 0 ? '←' : lane === 1 ? '↑' : '→'}
                  </button>
                ))}
              </div>
              <div className="h-1.5 w-48 mx-auto rounded-full bg-black/60 overflow-hidden">
                <div className="h-full rounded-full bg-[#FFD700]" style={{ width: `${Math.max(0, hud.passTimer / PASS_WINDOW) * 100}%` }} />
              </div>
            </div>
          )}

          {/* Release bar */}
          {hud.phase === 'shot' && (
            <div className="absolute left-1/2 bottom-20 -translate-x-1/2 w-64">
              <div className="mx-auto mb-2 w-fit rounded px-3 py-1 text-center text-xs font-mono text-white" style={{ background: '#0a0a14', border: '1px solid rgba(255,255,255,0.18)' }}>{hud.shotIsOpen ? 'OPEN LOOK — KNOCK IT DOWN' : 'CONTESTED'}</div>
              <div className="relative h-3 rounded bg-black/60 overflow-hidden">
                <div className="absolute inset-y-0 bg-[#00FF9D]/30" style={{ left: `${(SHOT_TARGET - (hud.shotIsOpen ? sweet * 1.4 : sweet)) * 100}%`, width: `${(hud.shotIsOpen ? sweet * 1.4 : sweet) * 200}%` }} />
                <div className="absolute inset-y-0 w-0.5 bg-[#FFD700]" style={{ left: `${SHOT_TARGET * 100}%` }} />
                <div className="h-full rounded" style={{ width: `${hud.bar * 100}%`, background: Math.abs(hud.bar - SHOT_TARGET) < (hud.shotIsOpen ? sweet * 1.4 : sweet) ? '#00FF9D' : '#00E5FF' }} />
              </div>
            </div>
          )}

          {prompt && hud.phase !== 'pass' && (
            <div className="absolute bottom-5 left-1/2 -translate-x-1/2 text-xs font-mono text-white/90 px-4 py-1.5 rounded-lg" style={{ background: 'rgba(5,5,8,0.85)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.1)' }}>
              {prompt}
            </div>
          )}

          {hud.msg && hud.msgT > 0 && (
            <div className="absolute top-[40%] left-1/2 -translate-x-1/2">
              <div className="text-4xl font-bold" style={{ color: hud.msgColor, textShadow: `0 0 20px ${hud.msgColor}55` }}>{hud.msg}</div>
            </div>
          )}

          <div className="absolute bottom-3 right-3 flex gap-2 pointer-events-auto !hidden">
            <button onClick={() => bridge()?.pass()} className="h-11 w-14 rounded-full border border-[#00E5FF]/60 bg-black/50 text-xs font-bold text-[#00E5FF]">PASS</button>
            <button onClick={() => bridge()?.shoot()} className="h-11 w-16 rounded-full border border-[#FFD700]/60 bg-black/50 text-xs font-bold text-[#FFD700]">SHOOT</button>
          </div>
        </div>
      )}

      <PerfOverlay perf={perf} grade={grade} show={showPerf} />

      {/* M7-QA1: Controls overlay — shows on load, dismisses on first input */}
      {showControls && (
        <div className="absolute inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(5,5,8,0.82)', backdropFilter: 'blur(6px)' }}>
          <div className="rounded-xl px-6 py-5 text-center" style={{ background: 'rgba(10,10,20,0.95)', border: '1px solid rgba(0,229,255,0.25)' }}>
            <div className="text-sm font-bold text-[#00E5FF] mb-3">CONTROLS — 3V3 STREETBALL</div>
            <div className="text-xs text-white/70 space-y-1 font-mono">
              {(device === 'touch' ? MODE_BINDINGS['basketball_3v3'].touch : MODE_BINDINGS['basketball_3v3'].desktop).map((b, i) => (
                <div key={i}><span className="text-white">{b.key}</span> — {b.label}</div>
              ))}
            </div>
            <div className="mt-3 text-[10px] text-white/40">{device === 'touch' ? 'TAP TO START' : 'PRESS ANY KEY TO START'}</div>
          </div>
        </div>
      )}
    </div>
  );
}
