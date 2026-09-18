'use client';

/**
 * soccer-3d.tsx — M7b flagship hero mode.
 * =======================================
 * A TRUE free-locomotion 3D penalty shootout that reuses ALL SIX M7a libraries:
 *   • LocomotionController  — camera-relative analog run-up / walk-into-goal
 *   • AnimDirectorFSM       — idle ⇆ locomotion ⇆ action (no T-pose, no slide)
 *   • AvatarDriver          — blends the FSM decision onto the GLB mixer
 *   • BallStateMachine      — held → in_flight → dead/loose ball possession
 *   • camera rigs + CameraCut — follow rig on the run-up, broadcast cut on the strike
 *   • clip-registry         — soccer* logical clips aliased onto elijah-hero clips
 *
 * The EXACT tuned penalty-shootout scoring from the proven 2D scene is preserved
 * verbatim (best-of-5 + sudden death, aim/power windows, keeper read chances,
 * 0.85 save probability, headlines). Only the presentation layer is new — the
 * scoring math is RESERVED and untouched. // TUNE(elijah)
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
import { SceneBackdrop } from '@/components/three/scene-backdrop';
import { RimGlowPulse } from '@/components/three/effects';
import { useOrientation } from '@/components/three/orientation';
import { PERF_BUDGET, gradePerf, HUD_SNAPSHOT_INTERVAL, type PerfSample } from '@/lib/three-budget';
import { registerFelMode, unregisterFelMode } from '@/lib/playtest/harness';
import { MAPS } from '@/lib/map-data';
import { AnimDirectorFSM } from '@/lib/anim/state-machine';
import { AvatarDriver } from '@/lib/anim/avatar-driver';
import { LocomotionController } from '@/lib/loco/movement';
import { BallStateMachine } from '@/lib/ball/ball-state';
import { computeCamera, CameraCut, rigForMode, RIGS, type CameraFrame, type Subject } from '@/lib/camera/rigs';

const HERO_URL = '/models/elijah-hero.glb';
const MAP = MAPS['soccer-stadium'];

// Pitch geometry (world units). The goal mouth sits at -Z; the penalty spot and
// run-up are toward +Z. Five aim zones map left→right across the goal.
const GOAL_Z = -9;
const GOAL_HALF_WIDTH = 3.6;
const SPOT_Z = 0;
const ZONES = [-2, -1, 0, 1, 2]; // TUNE(elijah) — identical to 2D scoring
const zoneX = (z: number) => z * (GOAL_HALF_WIDTH / 2.2);
const ARENA = { minX: -8, maxX: 8, minZ: -8, maxZ: 8 };

interface HudState {
  round: number; pGoals: number; aiGoals: number; shotsP: number; shotsAI: number;
  role: 'shooter' | 'keeper'; phase: string; sudden: boolean;
  aim: number; power: number; msg: string; msgColor: string; msgT: number;
  prqLabel: string; prqColor: string; camRig: string;
}

type Phase =
  | 'approach'   // shooter free-locomotes toward the ball
  | 'aim'        // oscillating aim reticle
  | 'power'      // oscillating power meter
  | 'strike'     // ball in flight, broadcast cut
  | 'walkToGoal' // keeper free-locomotes into the goal
  | 'keeperPick' // keeper reads + dives
  | 'keeperBall' // rival shot in flight
  | 'between';   // 1.4s pause between turns

// Camera driver: follow rig on the ground game, broadcast rig on the strike,
// with a smooth CameraCut between the two framings.
function SoccerCamera({
  subjectRef, rigModeRef, cutRef,
}: {
  subjectRef: React.MutableRefObject<Subject>;
  rigModeRef: React.MutableRefObject<'follow' | 'broadcast'>;
  cutRef: React.MutableRefObject<CameraCut>;
}) {
  const camera = useThree((s) => s.camera);
  const live = useRef<CameraFrame>({ position: { x: 0, y: 3, z: 6 }, target: { x: 0, y: 1.2, z: 0 }, fov: 50 });
  const smoothed = useRef<CameraFrame>({ position: { x: 0, y: 3, z: 6 }, target: { x: 0, y: 1.2, z: 0 }, fov: 50 });
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const rig = rigModeRef.current === 'broadcast' ? RIGS.broadcast : RIGS.follow;
    const target = computeCamera(subjectRef.current, rig);
    const frame = cutRef.current.active ? cutRef.current.update(dt, target) : target;
    live.current = frame;
    // Extra per-frame smoothing on top of the rig stiffness for a filmic feel.
    const k = rig.stiffness + 0.04;
    const sm = smoothed.current;
    sm.position.x += (frame.position.x - sm.position.x) * k * 6 * dt * 10;
    sm.position.y += (frame.position.y - sm.position.y) * k * 6 * dt * 10;
    sm.position.z += (frame.position.z - sm.position.z) * k * 6 * dt * 10;
    sm.target.x += (frame.target.x - sm.target.x) * k * 6 * dt * 10;
    sm.target.y += (frame.target.y - sm.target.y) * k * 6 * dt * 10;
    sm.target.z += (frame.target.z - sm.target.z) * k * 6 * dt * 10;
    camera.position.set(sm.position.x, sm.position.y, sm.position.z);
    camera.lookAt(sm.target.x, sm.target.y, sm.target.z);
    const cam = camera as THREE.PerspectiveCamera;
    if (cam.isPerspectiveCamera) {
      cam.fov += (frame.fov - cam.fov) * 0.1;
      cam.updateProjectionMatrix();
    }
  });
  return null;
}

function SoccerScene({
  grade, prq, onEnd, gamepad, onHud, onPerf,
}: GameProps & { onHud: (h: HudState) => void; onPerf: (p: PerfSample) => void }) {
  const playerRef = useRef<AvatarHandle | null>(null);
  const keeperRef = useRef<AvatarHandle | null>(null);
  const ballMeshRef = useRef<THREE.Group | null>(null);
  const onEndRef = useRef(onEnd); onEndRef.current = onEnd;
  const gradeRef = useRef(grade); gradeRef.current = grade;
  const endedRef = useRef(false);

  // ── M7a libraries, one instance each ──
  const loco = useRef(new LocomotionController({ speedScale: grade?.speedMult ?? 1 }, { x: 0, z: 4 }));
  const dir = useRef(new AnimDirectorFSM());
  const drv = useRef(new AvatarDriver());
  const keeperDir = useRef(new AnimDirectorFSM());
  const keeperDrv = useRef(new AvatarDriver());
  const ball = useRef(new BallStateMachine());
  const cut = useRef(new CameraCut());
  const rigMode = useRef<'follow' | 'broadcast'>('follow');
  const camSubject = useRef<Subject>({ pos: { x: 0, y: 0, z: 4 }, facing: Math.PI, speed01: 0 });
  const action = useRef<string | undefined>(undefined);

  const st = useRef({
    t: 0, round: 1, pGoals: 0, aiGoals: 0, shotsP: 0, shotsAI: 0,
    role: 'shooter' as 'shooter' | 'keeper',
    phase: 'approach' as Phase,
    aimT: 0, aim: 0, power: 0, powerDir: 1,
    // ball flight
    flight: null as null | { fromX: number; fromZ: number; toX: number; toZ: number; t: number; speed: number; wild?: boolean; target?: number; aiPick?: number },
    keeperDive: 0, keeperDiveDir: 0, pDive: null as null | number, aiShotZone: 0,
    keeperX: 0,
    msg: '', msgColor: '#FFD700', msgT: 0, betweenT: 0, sudden: false,
    keys: {} as Record<string, boolean>,
    startTime: Date.now(),
    // one-shot latches
    strikeResolved: false,
  });

  const say = useCallback((m: string, c: string) => {
    const s = st.current; s.msg = m; s.msgColor = c; s.msgT = 1.5;
  }, []);

  // ── EXACT tuned end/turn logic (verbatim from the proven 2D scene) ──
  const checkEnd = useCallback((): boolean => {
    const s = st.current;
    const done5 = s.shotsP >= 5 && s.shotsAI >= 5;
    const pLeft = 5 - s.shotsP, aiLeft = 5 - s.shotsAI;
    const decided = !s.sudden && ((s.pGoals > s.aiGoals + aiLeft) || (s.aiGoals > s.pGoals + pLeft));
    if (decided || (done5 && s.pGoals !== s.aiGoals) || (s.sudden && s.shotsP === s.shotsAI && s.pGoals !== s.aiGoals)) {
      endedRef.current = true;
      const dur = Math.round((Date.now() - s.startTime) / 1000);
      const won = s.pGoals > s.aiGoals;
      onEndRef.current?.({ score: s.pGoals, opponentScore: s.aiGoals, won, duration: dur, headline: won ? 'SHOOTOUT WON' : 'SHOOTOUT LOST' });
      return true;
    }
    if (done5 && s.pGoals === s.aiGoals) s.sudden = true;
    return false;
  }, []);

  const nextTurn = useCallback(() => {
    const s = st.current;
    if (checkEnd()) return;
    s.flight = null; s.keeperDive = 0; s.keeperDiveDir = 0; s.pDive = null; s.strikeResolved = false;
    ball.current.reset();
    if (s.role === 'shooter') {
      s.role = 'keeper'; s.phase = 'walkToGoal';
      s.aiShotZone = ZONES[Math.floor(Math.random() * 5)];
      // reposition player toward the goal for the keeper walk-in
      loco.current.state.pos.x = 0; loco.current.state.pos.z = GOAL_Z + 3.4; loco.current.state.facing = 0;
    } else {
      s.role = 'shooter'; s.phase = 'approach'; s.aimT = 0; s.round++;
      loco.current.state.pos.x = 0; loco.current.state.pos.z = 4; loco.current.state.facing = Math.PI;
    }
    rigMode.current = 'follow';
  }, [checkEnd]);

  // Lock aim → power (shooter). EXACT tuned windows preserved.
  const lockAim = useCallback(() => {
    const s = st.current;
    if (s.phase !== 'aim' || s.role !== 'shooter') return;
    s.phase = 'power'; s.power = 0; s.powerDir = 1;
  }, []);

  const lockPower = useCallback(() => {
    const s = st.current;
    if (s.phase !== 'power') return;
    const zone = Math.round(s.aim * 2); // -2..2  // TUNE(elijah)
    const accurate = s.power > 0.6 && s.power < 0.92; // TUNE(elijah)
    const wild = s.power >= 0.97; // TUNE(elijah)
    let target = zone;
    // begin the strike: kick animation + broadcast camera cut
    action.current = 'shoot';
    ball.current.gain('player'); ball.current.release();
    const fromX = loco.current.state.pos.x, fromZ = loco.current.state.pos.z;
    rigMode.current = 'broadcast';
    cut.current.begin(computeCamera(camSubject.current, RIGS.follow), 0.6);
    if (wild) {
      s.phase = 'strike'; s.strikeResolved = false;
      s.flight = { fromX, fromZ, toX: zoneX(zone) + (Math.random() < 0.5 ? -3.2 : 3.2), toZ: GOAL_Z, t: 0, speed: 0.9, wild: true };
      return;
    }
    if (!accurate && Math.random() < 0.45) target = Math.max(-2, Math.min(2, target + (Math.random() < 0.5 ? -1 : 1))); // TUNE(elijah)
    const readChance = s.power > 0.85 ? 0.28 : 0.42; // TUNE(elijah)
    const aiPick = Math.random() < readChance ? target : ZONES[Math.floor(Math.random() * 5)];
    s.keeperDiveDir = aiPick;
    s.phase = 'strike'; s.strikeResolved = false;
    s.flight = { fromX, fromZ, toX: zoneX(target), toZ: GOAL_Z, t: 0, speed: 0.55 + s.power * 0.35, target, aiPick };
  }, []);

  const dive = useCallback((z: number) => {
    const s = st.current;
    if (s.phase !== 'keeperPick' || s.role !== 'keeper') return;
    s.pDive = z; s.keeperDiveDir = z;
    action.current = 'tackle'; // keeper dive reuses the tackle action clip
    s.phase = 'keeperBall'; s.strikeResolved = false;
    rigMode.current = 'broadcast';
    cut.current.begin(computeCamera(camSubject.current, RIGS.follow), 0.6);
    s.flight = { fromX: 0, fromZ: SPOT_Z + 1, toX: zoneX(s.aiShotZone), toZ: GOAL_Z, t: 0, speed: 0.7 };
  }, []);

  useEffect(() => {
    const setKey = (k: string, down: boolean) => { st.current.keys[k] = down; };
    const kd = (e: KeyboardEvent) => {
      const k = (e.key ?? '').toLowerCase();
      setKey(k, true);
      const s = st.current;
      if (k === ' ') {
        e.preventDefault?.();
        if (s.phase === 'approach' && s.role === 'shooter') s.phase = 'aim';
        else if (s.phase === 'aim') lockAim();
        else if (s.phase === 'power') lockPower();
        else if (s.phase === 'keeperPick') dive(0);
      }
      if (s.phase === 'keeperPick') {
        if (e.key === 'ArrowLeft') dive(-2);
        if (e.key === 'ArrowDown') dive(0);
        if (e.key === 'ArrowRight') dive(2);
      }
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright', ' '].includes(k)) e.preventDefault?.();
    };
    const ku = (e: KeyboardEvent) => setKey((e.key ?? '').toLowerCase(), false);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    (window as any).__felSoccer3D = {
      shoot: () => {
        const s = st.current;
        if (s.phase === 'approach' && s.role === 'shooter') s.phase = 'aim';
        else if (s.phase === 'aim') lockAim();
        else if (s.phase === 'power') lockPower();
      },
      dive,
    };
    registerFelMode('soccer', {
      getState: () => { const s = st.current; return { phase: s.phase, role: s.role, round: s.round, pGoals: s.pGoals, aiGoals: s.aiGoals, shotsP: s.shotsP, shotsAI: s.shotsAI }; },
      sendInput: (a, p) => { if (a === 'shoot') (window as any).__felSoccer3D?.shoot(); else if (a === 'dive') dive((p as number) ?? 0); },
    });
    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      delete (window as any).__felSoccer3D;
      unregisterFelMode('soccer');
    };
  }, [lockAim, lockPower, dive]);

  const hudAcc = useRef(0); // M-perf: throttle HUD setState to 30Hz

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const s = st.current;
    if (endedRef.current) return;
    s.t += dt;
    if (s.msgT > 0) s.msgT -= dt;
    ball.current.update(dt);

    // ── free locomotion (approach + walkToGoal only) ──
    let moveX = 0, moveY = 0;
    const canMove = s.phase === 'approach' || s.phase === 'walkToGoal';
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
    loco.current.clampPos(ARENA.minX, ARENA.maxX, ARENA.minZ, ARENA.maxZ);

    // Auto-advance approach → aim when the shooter reaches the ball on the spot.
    if (s.phase === 'approach' && s.role === 'shooter') {
      const distToSpot = Math.hypot(locoState.pos.x - 0, locoState.pos.z - (SPOT_Z + 1.2));
      if (distToSpot < 0.9) s.phase = 'aim';
    }
    // Auto-advance walkToGoal → keeperPick when keeper reaches the goal line.
    if (s.phase === 'walkToGoal' && s.role === 'keeper') {
      const distToGoal = Math.hypot(locoState.pos.x - 0, locoState.pos.z - (GOAL_Z + 1.4));
      if (distToGoal < 1.1) { s.phase = 'keeperPick'; rigMode.current = 'follow'; }
    }

    // ── aim / power oscillation (EXACT tuned rates) ──
    const speedMult = gradeRef.current?.speedMult ?? 1;
    if (s.phase === 'aim') { s.aimT += dt * 1.6 * speedMult; s.aim = Math.sin(s.aimT); } // TUNE(elijah)
    if (s.phase === 'power') { s.power += s.powerDir * dt * 1.3; if (s.power >= 1) { s.power = 1; s.powerDir = -1; } if (s.power <= 0) { s.power = 0; s.powerDir = 1; } } // TUNE(elijah)

    // ── ball flight resolution (EXACT tuned outcome math) ──
    if ((s.phase === 'strike' || s.phase === 'keeperBall') && s.flight) {
      const f = s.flight;
      f.t += dt * (f.speed ? f.speed * 2.4 : 1.5);
      s.keeperDive = Math.min(s.keeperDive + dt * 3, 1);
      if (f.t >= 1 && !s.strikeResolved) {
        s.strikeResolved = true;
        if (s.phase === 'strike') {
          s.shotsP++;
          if (f.wild) { say('OFF TARGET!', '#FF3366'); }
          else if (f.aiPick === f.target && Math.random() < 0.85) { say('SAVED BY KEEPER!', '#FF3366'); } // TUNE(elijah)
          else { s.pGoals++; say('GOOOAL!', '#00FF9D'); action.current = 'goal'; }
        } else {
          s.shotsAI++;
          const guessed = s.pDive !== null && Math.abs((s.pDive ?? 99) - s.aiShotZone) <= 1; // TUNE(elijah)
          if (guessed) { say('WHAT A SAVE!', '#00E5FF'); }
          else { s.aiGoals++; say('RIVAL SCORES', '#FF3366'); }
        }
        s.phase = 'between'; s.betweenT = 1.4; // TUNE(elijah)
      }
    }
    if (s.phase === 'between') { s.betweenT -= dt; if (s.betweenT <= 0) nextTurn(); }

    // ── drive the player avatar through the FSM (no T-pose, no slide) ──
    if (playerRef.current) {
      const g = playerRef.current.group;
      g.position.set(locoState.pos.x, MAP.floorY ?? 0, locoState.pos.z);
      g.rotation.y = locoState.facing;
      const modePhase = s.phase === 'strike' ? (s.msg === 'GOOOAL!' ? 'goal' : '') : '';
      const decision = dir.current.update(dt, {
        modeId: 'soccer',
        speed01: canMove ? locoState.speed01 : 0,
        phase: modePhase,
        actionEvent: action.current,
      });
      action.current = undefined;
      drv.current.apply(decision);
      // camera subject follows the player during ground phases, ball during flight
      camSubject.current.pos.x = locoState.pos.x;
      camSubject.current.pos.y = 1.1;
      camSubject.current.pos.z = locoState.pos.z;
      camSubject.current.facing = locoState.facing;
      camSubject.current.speed01 = locoState.speed01;
    }

    // Keeper (opponent) idle drive so it is never a T-pose.
    if (keeperRef.current) {
      const kg = keeperRef.current.group;
      const kx = s.role === 'keeper'
        ? 0 // player is keeping; the visible keeper avatar is the rival striker off to the side
        : (s.keeperDive > 0 ? zoneX(s.keeperDiveDir) * s.keeperDive : 0);
      kg.position.set(kx, MAP.floorY ?? 0, GOAL_Z + 0.6);
      kg.rotation.y = Math.PI;
      const kd = keeperDir.current.update(dt, { modeId: 'soccer', speed01: 0, phase: '', actionEvent: undefined });
      keeperDrv.current.apply(kd);
    }

    // Ball mesh follow.
    if (ballMeshRef.current) {
      const bm = ballMeshRef.current;
      if (s.flight) {
        const f = s.flight; const t = Math.min(f.t, 1);
        bm.visible = true;
        bm.position.set(
          f.fromX + (f.toX - f.fromX) * t,
          0.25 + Math.sin(t * Math.PI) * 1.6,
          f.fromZ + (f.toZ - f.fromZ) * t,
        );
      } else if (s.role === 'shooter' && (s.phase === 'approach' || s.phase === 'aim' || s.phase === 'power')) {
        bm.visible = true; bm.position.set(0, 0.25, SPOT_Z);
      } else {
        bm.visible = false;
      }
    }

    hudAcc.current += dt;
    if (hudAcc.current >= HUD_SNAPSHOT_INTERVAL) {
      hudAcc.current = 0;
      onHud({
        round: s.round, pGoals: s.pGoals, aiGoals: s.aiGoals, shotsP: s.shotsP, shotsAI: s.shotsAI,
        role: s.role, phase: s.phase, sudden: s.sudden,
        aim: s.aim, power: s.power, msg: s.msg, msgColor: s.msgColor, msgT: s.msgT,
        prqLabel: gradeRef.current?.label ?? '', prqColor: gradeRef.current?.color ?? '#00FF9D',
        camRig: rigMode.current,
      });
    }
  });

  return (
    <>
      {MAP.backdrop && (
        <Suspense fallback={null}><SceneBackdrop url={MAP.backdrop} /></Suspense>
      )}
      <Suspense fallback={null}>
        <MapMesh config={MAP} />
      </Suspense>
      <RimGlowPulse color="#00E5FF" position={[-4, 3, GOAL_Z]} baseIntensity={7} pulseAmp={3} pulseSpeed={0.8} />
      <RimGlowPulse color="#00FF9D" position={[4, 3, GOAL_Z]} baseIntensity={7} pulseAmp={3} pulseSpeed={0.9} />

      {/* Goal frame */}
      <group position={[0, 0, GOAL_Z]}>
        <mesh position={[-GOAL_HALF_WIDTH, 1.2, 0]}><boxGeometry args={[0.14, 2.4, 0.14]} /><meshStandardMaterial color="#EDEDF2" emissive="#334" /></mesh>
        <mesh position={[GOAL_HALF_WIDTH, 1.2, 0]}><boxGeometry args={[0.14, 2.4, 0.14]} /><meshStandardMaterial color="#EDEDF2" emissive="#334" /></mesh>
        <mesh position={[0, 2.4, 0]}><boxGeometry args={[GOAL_HALF_WIDTH * 2 + 0.14, 0.14, 0.14]} /><meshStandardMaterial color="#EDEDF2" emissive="#334" /></mesh>
      </group>

      {/* Ball */}
      <group ref={ballMeshRef} position={[0, 0.25, SPOT_Z]}>
        <mesh castShadow><sphereGeometry args={[0.25, 20, 20]} /><meshStandardMaterial color="#EDEDF2" roughness={0.5} /></mesh>
      </group>

      {/* Player (shooter / keeper) */}
      <Suspense fallback={null}>
        <Avatar
          url={HERO_URL}
          onReady={(h) => {
            playerRef.current = h;
            h.group.position.set(0, MAP.floorY ?? 0, 4);
            h.group.rotation.y = Math.PI;
            drv.current.attach(h);
            dir.current.reset();
            h.play('guard', { loop: true, timeScale: 1 });
          }}
        />
      </Suspense>

      {/* Rival striker / keeper silhouette near the goal */}
      <Suspense fallback={null}>
        <Avatar
          url={HERO_URL}
          tint="#FF3366"
          onReady={(h) => {
            keeperRef.current = h;
            h.group.position.set(0, MAP.floorY ?? 0, GOAL_Z + 0.6);
            h.group.rotation.y = Math.PI;
            keeperDrv.current.attach(h);
            keeperDir.current.reset();
            h.play('guard', { loop: true, timeScale: 0.9 });
          }}
        />
      </Suspense>

      <SoccerCamera subjectRef={camSubject} rigModeRef={rigMode} cutRef={cut} />
      <PerfSampler onSample={onPerf} />
    </>
  );
}

export default function Soccer3D(props: GameProps) {
  const orient = useOrientation();
  const [dpr, setDpr] = useState(1.5);
  const [hud, setHud] = useState<HudState | null>(null);
  const [perf, setPerf] = useState<PerfSample | null>(null);
  const [showPerf, setShowPerf] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'p') setShowPerf((v) => !v); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const grade = perf ? gradePerf(perf) : null;
  const shoot = () => (window as any).__felSoccer3D?.shoot();
  const doDive = (z: number) => (window as any).__felSoccer3D?.dive(z);

  const prompt = hud
    ? hud.role === 'shooter'
      ? hud.phase === 'approach' ? 'RUN UP — WASD to move, SPACE at the ball'
        : hud.phase === 'aim' ? 'SPACE — lock aim'
        : hud.phase === 'power' ? 'SPACE — lock power (green zone)'
        : ''
      : hud.phase === 'walkToGoal' ? 'GET IN GOAL — WASD to move'
        : hud.phase === 'keeperPick' ? '← DIVE LEFT · ↓ CENTER · → DIVE RIGHT'
        : ''
    : '';

  return (
    <div
      className="relative mx-auto w-full overflow-hidden rounded-xl border border-white/5 shadow-[0_0_60px_rgba(0,229,255,0.06)]"
      style={{ aspectRatio: orient === 'portrait' ? '3 / 4' : '16 / 9', maxWidth: orient === 'portrait' ? 560 : 960, background: MAP.fogColor }}
    >
      <Canvas
        dpr={dpr}
        shadows
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05, powerPreference: 'high-performance' }}
        camera={{ fov: 50, near: 0.1, far: 300, position: [0, 3, 8] }}
        scene={{ fog: new THREE.Fog(new THREE.Color(MAP.fogColor), MAP.fogNear, MAP.fogFar) }}
      >
        <PerformanceMonitor
          onIncline={() => setDpr((d) => Math.min(d + 0.25, PERF_BUDGET.dprMax))}
          onDecline={() => setDpr((d) => Math.max(d - 0.25, PERF_BUDGET.dprMin))}
        >
          <SceneLighting variant="venice" />
          <SoccerScene {...props} onHud={setHud} onPerf={setPerf} />
        </PerformanceMonitor>
      </Canvas>

      {hud && (
        <div className="absolute inset-0 pointer-events-none" style={{ fontFamily: 'var(--font-display), sans-serif' }}>
          {/* scoreboard */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1">
            <div className="flex items-center gap-5 px-5 py-1.5 rounded-xl" style={{ background: 'rgba(5,5,8,0.75)', backdropFilter: 'blur(12px)', border: '1px solid rgba(0,229,255,0.2)' }}>
              <span className="text-2xl font-bold text-[#00E5FF]">{hud.pGoals}</span>
              <span className="text-[11px] text-white/60 font-mono">{hud.sudden ? 'SUDDEN DEATH' : 'BEST OF 5'}</span>
              <span className="text-2xl font-bold text-[#FF3366]">{hud.aiGoals}</span>
            </div>
            <div className="flex gap-3 items-center px-3 py-0.5 rounded-lg font-mono text-[10px] text-white/70" style={{ background: 'rgba(5,5,8,0.8)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <span>YOU {hud.shotsP}/5</span><span>RIVAL {hud.shotsAI}/5</span>
              <span style={{ color: '#C99BF7' }}>CAM {hud.camRig.toUpperCase()}</span>
            </div>
          </div>

          {/* PRQ */}
          <div className="absolute top-3 right-3 text-right font-mono text-[11px]" style={{ color: hud.prqColor }}>
            {hud.role === 'shooter' ? 'SHOOTER' : 'KEEPER'} · {hud.prqLabel}
          </div>

          {/* aim bar */}
          {hud.phase === 'aim' && (
            <div className="absolute left-1/2 bottom-16 -translate-x-1/2 w-64 h-2 rounded bg-black/60 overflow-hidden">
              <div className="h-full w-3 rounded bg-[#FFD700]" style={{ marginLeft: `${((hud.aim + 1) / 2) * 100}%`, transition: 'none' }} />
            </div>
          )}
          {/* power bar */}
          {hud.phase === 'power' && (
            <div className="absolute left-1/2 bottom-16 -translate-x-1/2 w-64">
              <div className="relative h-3 rounded bg-black/60 overflow-hidden">
                <div className="absolute inset-y-0 left-[60%] w-[32%] bg-[#00FF9D]/30" />
                <div className="h-full rounded" style={{ width: `${hud.power * 100}%`, background: hud.power > 0.6 && hud.power < 0.92 ? '#00FF9D' : hud.power >= 0.97 ? '#FF3366' : '#00E5FF' }} />
              </div>
              <p className="mt-1 text-center text-[10px] font-mono text-white/60">TAP IN THE GREEN ZONE</p>
            </div>
          )}

          {/* prompt */}
          {prompt && <div className="absolute bottom-5 left-1/2 -translate-x-1/2 text-xs font-mono text-white/70">{prompt}</div>}

          {/* message */}
          {hud.msg && hud.msgT > 0 && (
            <div className="absolute top-[40%] left-1/2 -translate-x-1/2">
              <div className="text-4xl font-bold" style={{ color: hud.msgColor, textShadow: `0 0 20px ${hud.msgColor}55` }}>{hud.msg}</div>
            </div>
          )}

          {/* touch controls */}
          <div className="absolute bottom-3 right-3 flex gap-2 pointer-events-auto !hidden">
            <button onClick={() => doDive(-2)} className="h-11 w-11 rounded-full border border-[#00E5FF]/50 bg-black/50 text-sm font-bold text-[#00E5FF]">◀</button>
            <button onClick={() => shoot()} className="h-11 w-16 rounded-full border border-[#00FF9D]/60 bg-black/50 text-xs font-bold text-[#00FF9D]">SHOOT</button>
            <button onClick={() => doDive(2)} className="h-11 w-11 rounded-full border border-[#FF3366]/50 bg-black/50 text-sm font-bold text-[#FF3366]">▶</button>
          </div>
        </div>
      )}

      <PerfOverlay perf={perf} grade={grade} show={showPerf} />
    </div>
  );
}
