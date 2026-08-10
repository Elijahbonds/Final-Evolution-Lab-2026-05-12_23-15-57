'use client';

/**
 * three-point-3d.tsx — M7c full-library 3D Three-Point Shootout.
 * ==============================================================
 * TRUE free-locomotion 3D: run the arc between five rack stations, then
 * catch-and-shoot on an oscillating release bar. Uses ALL SIX M7a libs:
 *   • LocomotionController  — WASD/arrows camera-relative drive to each rack
 *   • AnimDirectorFSM       — idle ⇆ locomotion ⇆ shoot/score actions
 *   • AvatarDriver          — blends FSM decisions onto the GLB mixer
 *   • BallStateMachine      — held → in_flight → dead ball per shot
 *   • camera rigs + CameraCut — follow rig on the move, broadcast cut on release
 *   • clip-registry         — basketball_h2h clips (dribble/shoot/score)
 *
 * EXACT tuned constants from the proven 2D shootout are preserved verbatim.
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
import { AnimDirectorFSM } from '@/lib/anim/state-machine';
import { AvatarDriver } from '@/lib/anim/avatar-driver';
import { LocomotionController } from '@/lib/loco/movement';
import { updateFacing, faceYaw } from '@/lib/anim/facing';
import { BallStateMachine } from '@/lib/ball/ball-state';
import { computeCamera, CameraCut, RIGS, type CameraFrame, type Subject } from '@/lib/camera/rigs';
import { detectDevice, MODE_BINDINGS } from '@/lib/scene/input-manager';

const HERO_URL = '/models/elijah-hero.glb';
const MAP = MAPS['venice-blue-court'];

const HOOP_POS = new THREE.Vector3(0, 3.05, 0);
// Shared hero mesh art faces -Z; add this offset when writing rotation.y so the
// shooter faces the rim/travel correctly (matches football-3d hero convention).
const MODEL_YAW = Math.PI;
const COURT_BOUNDS = { minX: -7, maxX: 7, minZ: -1, maxZ: 9 };

// ── EXACT tuned constants (verbatim from proven 2D shootout) ── // TUNE(elijah)
const RACKS = 5;
const BALLS_PER_RACK = 5;
const GAME_LEN = 60;
const WIN_PTS = 18;
const SHOT_TARGET = 0.72; // release-bar sweet centre // TUNE(elijah)

// Five rack stations spread along the 3-point arc (radius 6.75 from hoop).
const RACK_R = 6.75;
const RACK_ANGLES = [30, 60, 90, 120, 150].map((d) => (d * Math.PI) / 180);
const RACK_POS = RACK_ANGLES.map((a) => ({ x: RACK_R * Math.cos(a), z: RACK_R * Math.sin(a) }));

type Phase = 'move' | 'shoot' | 'flight' | 'msg' | 'done';

interface HudState {
  pts: number; rack: number; ball: number; streak: number;
  phase: Phase; bar: number; timeLeft: number;
  isMoney: boolean; atRack: boolean;
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

function ThreePointScene({
  grade, prq, onEnd, gamepad, onHud, onPerf, startedRef,
}: GameProps & { onHud: (h: HudState) => void; onPerf: (p: PerfSample) => void; startedRef: React.MutableRefObject<boolean> }) {
  const playerRef = useRef<AvatarHandle | null>(null);
  const ballMeshRef = useRef<THREE.Mesh>(null);
  const onEndRef = useRef(onEnd); onEndRef.current = onEnd;
  const gradeRef = useRef(grade); gradeRef.current = grade;
  const endedRef = useRef(false);

  // EXACT tuned sweet spot (verbatim from 2D) // TUNE(elijah)
  const sweet = grade.key === 'ELITE' ? 0.16 : grade.key === 'PRIMED' ? 0.13 : grade.key === 'READY' ? 0.11 : 0.09;

  const loco = useRef(new LocomotionController({ speedScale: grade?.speedMult ?? 1 }, { x: RACK_POS[0].x, z: RACK_POS[0].z }));
  const dir = useRef(new AnimDirectorFSM());
  const drv = useRef(new AvatarDriver());
  const ballSM = useRef(new BallStateMachine());
  const flightTracker = useRef(createBallFlightTracker());
  const netHandle = useRef(createNetHandle());
  const cut = useRef(new CameraCut());
  const rigMode = useRef<'follow' | 'broadcast'>('follow');
  const camSubject = useRef<Subject>({ pos: { x: RACK_POS[0].x, y: 1.1, z: RACK_POS[0].z }, facing: Math.PI, speed01: 0 });
  const actionEvt = useRef<string | undefined>(undefined);

  const st = useRef({
    t: 0, phase: 'move' as Phase,
    pts: 0, rack: 0, ball: 0, streak: 0,
    barT: Math.random() * Math.PI, bar: 0,
    timeLeft: GAME_LEN,
    flight: null as null | { from: THREE.Vector3; to: THREE.Vector3; t: number; made: boolean; value: number },
    msg: '', msgColor: '#FFD700', msgT: 0,
    startTime: Date.now(),
    keys: {} as Record<string, boolean>,
    fired: false,
  });

  const say = useCallback((m: string, c: string) => {
    const s = st.current; s.msg = m; s.msgColor = c; s.msgT = 1.2;
  }, []);

  const finish = useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;
    const s = st.current;
    const won = s.pts >= WIN_PTS;
    const dur = Math.round((Date.now() - s.startTime) / 1000);
    // EXACT scoring formula (verbatim from 2D) // TUNE(elijah)
    onEndRef.current?.({
      score: s.pts * 40 + s.streak * 10,
      won,
      duration: dur,
      headline: won ? `${s.pts} PTS — RANGE UNLOCKED` : `${s.pts} PTS — KEEP SHOOTING`,
    });
  }, []);

  // Fire the ball currently loaded, sampling the live release bar.
  const fire = useCallback(() => {
    const s = st.current;
    if (s.phase !== 'shoot' || s.fired) return;
    s.fired = true;
    const p = Math.abs(Math.sin(s.barT));
    const err = Math.abs(p - SHOT_TARGET);
    const made = err < sweet;
    const perfect = err < sweet * 0.4;
    const isMoney = s.ball === BALLS_PER_RACK - 1;
    const value = made ? (isMoney ? 2 : 1) : 0;
    actionEvt.current = 'shoot';
    ballSM.current.release();
    rigMode.current = 'broadcast';
    cut.current.begin(computeCamera(camSubject.current, RIGS.follow), 0.5);
    const from = new THREE.Vector3(loco.current.state.pos.x, 1.9, loco.current.state.pos.z);
    s.flight = { from, to: HOOP_POS.clone(), t: 0, made, value };
    s.phase = 'flight';
    if (made) {
      s.pts += value; s.streak += 1;
      say(perfect ? `SWISH +${value}` : `GOOD +${value}`, perfect ? '#FFD700' : '#00FF9D');
    } else {
      s.streak = 0;
      say('OFF THE IRON', '#FF3366');
    }
  }, [sweet, say]);

  useEffect(() => {
    const setKey = (k: string, down: boolean) => { st.current.keys[k] = down; };
    const kd = (e: KeyboardEvent) => {
      const k = (e.key ?? '').toLowerCase();
      setKey(k, true);
      if (k === ' ') { e.preventDefault?.(); fire(); }
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright', ' '].includes(k)) e.preventDefault?.();
    };
    const ku = (e: KeyboardEvent) => setKey((e.key ?? '').toLowerCase(), false);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    (window as any).__felThreePoint3D = { shoot: fire };
    registerFelMode('threePoint', {
      getState: () => { const s = st.current; return { phase: s.phase, pts: s.pts, rack: s.rack, ball: s.ball, streak: s.streak, timeLeft: s.timeLeft }; },
      sendInput: (a) => { if (a === 'shoot') fire(); },
    });
    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      delete (window as any).__felThreePoint3D;
      unregisterFelMode('threePoint');
    };
  }, [fire]);

  const hudAcc = useRef(0); // M-perf: throttle HUD setState to 30Hz

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const s = st.current;
    if (endedRef.current) return;
    s.t += dt;
    if (s.msgT > 0) s.msgT -= dt;
    ballSM.current.update(dt);

    // Clock — only drains once the player has dismissed the controls card and
    // actually begun (M12.4: no clock drain on a screen you can't play yet).
    if (startedRef.current) {
      s.timeLeft -= dt;
      if (s.timeLeft <= 0) { s.timeLeft = 0; finish(); return; }
    }

    // ── Free locomotion (only while moving to a rack) ──
    let moveX = 0, moveY = 0;
    const canMove = s.phase === 'move';
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

    // Distance to the active rack marker.
    const rackPos = RACK_POS[Math.min(s.rack, RACKS - 1)];
    const distRack = Math.hypot(locoState.pos.x - rackPos.x, locoState.pos.z - rackPos.z);
    const atRack = distRack < 1.3;

    // ── Phase: move → arrive at rack → shoot ──
    if (s.phase === 'move' && atRack) {
      s.phase = 'shoot'; s.fired = false; s.barT = Math.random() * Math.PI;
    }

    // ── Release bar oscillation (rate ramps per rack, verbatim) // TUNE(elijah) ──
    if (s.phase === 'shoot') {
      s.barT += dt * (3.0 + s.rack * 0.25) * (gradeRef.current?.speedMult ?? 1);
      s.bar = Math.abs(Math.sin(s.barT));
    }

    // ── Ball flight resolution ──
    if (s.phase === 'flight' && s.flight) {
      const f = s.flight;
      f.t += dt * 1.6; // flight anim rate // TUNE(elijah)
      if (f.t >= 1) {
        if (f.made) { actionEvt.current = 'score'; netHandle.current.swish(); }
        s.flight = null;
        flightTracker.current.airborne = false;
        s.ball += 1;
        rigMode.current = 'follow';
        if (s.pts >= WIN_PTS) { /* keep shooting to clock, range unlocked flagged at finish */ }
        if (s.ball >= BALLS_PER_RACK) {
          s.ball = 0; s.rack += 1;
          if (s.rack >= RACKS) { finish(); return; }
          s.phase = 'move';
        } else {
          s.phase = 'shoot'; s.fired = false;
        }
      }
    }

    // ── Drive player avatar through the FSM ──
    if (playerRef.current) {
      const g = playerRef.current.group;
      g.position.set(locoState.pos.x, MAP.floorY ?? 0, locoState.pos.z);
      // While shooting/flight, face the hoop; otherwise face travel direction.
      // Shared facing core (+MODEL_YAW for the -Z mesh) keeps orientation correct.
      g.rotation.y = updateFacing({
        current: g.rotation.y - MODEL_YAW,
        velX: locoState.vel.x,
        velZ: locoState.vel.z,
        targetX: HOOP_POS.x,
        targetZ: HOOP_POS.z,
        selfX: locoState.pos.x,
        selfZ: locoState.pos.z,
        engaged: s.phase !== 'move',
        dt,
      }) + MODEL_YAW;
      const decision = dir.current.update(dt, {
        modeId: 'basketball_h2h',
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
      } else {
        bm.visible = true;
        flightTracker.current.airborne = false;
        const hand = playerRef.current?.bone?.('RightHand');
        if (hand) {
          const wp = new THREE.Vector3(); hand.getWorldPosition(wp);
          const bounce = s.phase === 'move' && locoState.speed01 > 0.1 ? Math.abs(Math.sin(s.t * 8)) * 0.3 : 0;
          bm.position.set(wp.x + 0.2, Math.max(0.12, wp.y - 0.4 - bounce), wp.z);
        } else {
          bm.position.set(locoState.pos.x + 0.3, 0.9, locoState.pos.z);
        }
      }
    }

    const isMoney = s.ball === BALLS_PER_RACK - 1;
    hudAcc.current += dt;
    if (hudAcc.current >= HUD_SNAPSHOT_INTERVAL) {
      hudAcc.current = 0;
      onHud({
        pts: s.pts, rack: s.rack, ball: s.ball, streak: s.streak,
        phase: s.phase, bar: s.bar, timeLeft: s.timeLeft,
        isMoney, atRack,
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
      <PremiumHoop netHandle={netHandle} />
      <HoopGlow />
      <DustMotes count={50} />
      <RimGlowPulse color="#FFD700" position={[-5, 3, -2]} baseIntensity={12} pulseAmp={6} />
      <RimGlowPulse color="#00E5FF" position={[5, 2.5, 0]} baseIntensity={10} pulseAmp={5} />
      <Basketball ballRef={ballMeshRef} />
      <BallFlightRenderer ballRef={ballMeshRef} tracker={flightTracker} />

      <Suspense fallback={null}>
        <Avatar
          url={HERO_URL}
          onReady={(h) => {
            playerRef.current = h;
            h.group.position.set(RACK_POS[0].x, MAP.floorY ?? 0, RACK_POS[0].z);
            h.group.rotation.y = faceYaw(HOOP_POS.x - RACK_POS[0].x, HOOP_POS.z - RACK_POS[0].z) + MODEL_YAW;
            drv.current.attach(h);
            dir.current.reset();
            ballSM.current.gain('player');
            h.play('guard', { loop: true, timeScale: 0.18 });
          }}
        />
      </Suspense>

      <CourtCamera subjectRef={camSubject} rigModeRef={rigMode} cutRef={cut} />
      <PerfSampler onSample={onPerf} />
    </>
  );
}

export default function ThreePoint3D(props: GameProps) {
  const orient = useOrientation();
  const [dpr, setDpr] = useState(1.5);
  const [hud, setHud] = useState<HudState | null>(null);
  const [perf, setPerf] = useState<PerfSample | null>(null);
  const [showPerf, setShowPerf] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const startedRef = useRef(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const device = useRef(detectDevice());
  const bindings = MODE_BINDINGS['basketball_h2h'];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'p') setShowPerf((v) => !v); };
    window.addEventListener('keydown', onKey);
    // M7-QA1 §4: canvas focus for keyboard.
    const el = canvasRef.current;
    if (el) { el.tabIndex = 0; el.style.outline = 'none'; el.focus(); }
    const hide = () => { setShowControls(false); startedRef.current = true; window.removeEventListener('keydown', hide); window.removeEventListener('touchstart', hide); };
    window.addEventListener('keydown', hide); window.addEventListener('touchstart', hide);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keydown', hide); window.removeEventListener('touchstart', hide); };
  }, []);

  const grade = perf ? gradePerf(perf) : null;
  const sweet = props.grade.key === 'ELITE' ? 0.16 : props.grade.key === 'PRIMED' ? 0.13 : props.grade.key === 'READY' ? 0.11 : 0.09;
  const shoot = () => (window as any).__felThreePoint3D?.shoot();

  const prompt = hud
    ? hud.phase === 'move'
      ? (hud.atRack ? 'Loading rack…' : 'WASD — run to the glowing rack')
      : hud.phase === 'shoot'
      ? 'SPACE — release at the top of the bar'
      : ''
    : '';

  return (
    <div
      ref={canvasRef}
      className="relative mx-auto w-full overflow-hidden rounded-xl border border-white/5 shadow-[0_0_60px_rgba(255,215,0,0.06)]"
      style={{ aspectRatio: orient === 'portrait' ? '3 / 4' : '16 / 9', maxWidth: orient === 'portrait' ? 560 : 960, background: MAP.fogColor }}
      onClick={() => canvasRef.current?.focus()}
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
          <ThreePointScene {...props} onHud={setHud} onPerf={setPerf} startedRef={startedRef} />
        </PerformanceMonitor>
      </Canvas>

      {hud && (
        <div className="absolute inset-0 pointer-events-none" style={{ fontFamily: 'var(--font-display), sans-serif' }}>
          {/* Scoreboard */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1">
            <div className="flex items-center gap-5 px-5 py-1.5 rounded-xl" style={{ background: 'rgba(5,5,8,0.75)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,215,0,0.25)' }}>
              <span className="text-2xl font-bold text-[#FFD700]">{hud.pts}</span>
              <span className="text-[11px] text-white/60 font-mono">PTS · RACK {Math.min(hud.rack + 1, RACKS)}/{RACKS}</span>
              <span className="text-sm font-mono text-[#00E5FF]">{Math.ceil(hud.timeLeft)}s</span>
            </div>
            <div className="flex gap-3 items-center px-3 py-0.5 rounded-lg font-mono text-[10px] text-white/70" style={{ background: 'rgba(5,5,8,0.8)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <span style={{ color: hud.prqColor }}>{hud.prqLabel}</span>
              <span style={{ color: '#C99BF7' }}>CAM {hud.camRig.toUpperCase()}</span>
              {hud.streak > 1 && <span style={{ color: '#00FF9D' }}>{hud.streak} STREAK</span>}
              {hud.phase === 'shoot' && hud.isMoney && <span style={{ color: '#FFD700' }}>MONEY BALL ×2</span>}
            </div>
          </div>

          {/* rack ball dots */}
          <div className="absolute top-16 left-1/2 -translate-x-1/2 flex gap-1.5">
            {Array.from({ length: BALLS_PER_RACK }).map((_, i) => (
              <div key={i} className="h-2 w-2 rounded-full" style={{ background: i < hud.ball ? '#FFD700' : i === BALLS_PER_RACK - 1 ? 'rgba(255,215,0,0.35)' : 'rgba(255,255,255,0.2)' }} />
            ))}
          </div>

          {/* Release bar */}
          {hud.phase === 'shoot' && (
            <div className="absolute left-1/2 bottom-20 -translate-x-1/2 w-64">
              <div className="mx-auto mb-2 w-fit rounded px-3 py-1 text-center text-xs font-mono text-white" style={{ background: '#0a0a14', border: '1px solid rgba(255,255,255,0.18)' }}>RELEASE AT THE TOP</div>
              <div className="relative h-3 rounded bg-black/60 overflow-hidden">
                <div className="absolute inset-y-0 bg-[#00FF9D]/30" style={{ left: `${(SHOT_TARGET - sweet) * 100}%`, width: `${sweet * 200}%` }} />
                <div className="absolute inset-y-0 w-0.5 bg-[#FFD700]" style={{ left: `${SHOT_TARGET * 100}%` }} />
                <div className="h-full rounded" style={{ width: `${hud.bar * 100}%`, background: Math.abs(hud.bar - SHOT_TARGET) < sweet ? '#00FF9D' : '#00E5FF' }} />
              </div>
            </div>
          )}

          {prompt && (
            <div className="absolute bottom-5 left-1/2 -translate-x-1/2 text-xs font-mono text-white/90 px-4 py-1.5 rounded-lg" style={{ background: 'rgba(5,5,8,0.85)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.1)' }}>
              {prompt}
            </div>
          )}

          {hud.msg && hud.msgT > 0 && (
            <div className="absolute top-[40%] left-1/2 -translate-x-1/2">
              <div className="text-4xl font-bold" style={{ color: hud.msgColor, textShadow: `0 0 20px ${hud.msgColor}55` }}>{hud.msg}</div>
            </div>
          )}

          {/* Touch control */}
          <div className="absolute bottom-3 right-3 flex gap-2 pointer-events-auto !hidden">
            <button onClick={() => shoot()} className="h-11 w-16 rounded-full border border-[#FFD700]/60 bg-black/50 text-xs font-bold text-[#FFD700]">SHOOT</button>
          </div>
        </div>
      )}

      {/* M7-QA1 §4: Controls overlay */}
      {showControls && bindings && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 rounded-xl px-6 py-4 text-center pointer-events-none" style={{ background: 'rgba(5,5,5,0.92)', border: '1px solid rgba(255,255,255,0.15)' }}>
          <div className="text-sm font-bold text-white/80 mb-3">CONTROLS</div>
          {(device.current === 'touch' ? bindings.touch : bindings.desktop).map((b) => (
            <div key={b.key} className="flex justify-between gap-6 text-xs mb-1">
              <span className="text-[#00E5FF] font-mono">{b.key}</span>
              <span className="text-white/70">{b.label}</span>
            </div>
          ))}
          <div className="text-[10px] text-white/40 mt-2">Press any key to dismiss</div>
        </div>
      )}

      <PerfOverlay perf={perf} grade={grade} show={showPerf} />
    </div>
  );
}
