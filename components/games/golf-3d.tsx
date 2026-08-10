'use client';

/**
 * golf-3d.tsx — M14-P10 Links Challenge rebuilt in real 3D.
 * ========================================================
 * The flat 2D links game re-skinned onto the shared 3D engine:
 *   • MAPS['coastal-links']  — Coastal Links venue GLB
 *   • camera rigs + CameraCut — follow rig on the golfer, broadcast rig that
 *                               rides the ball (the "ball-follow camera")
 *   • self-rigged golfer GLB mini-character (its own swing clip)
 *   • lib/sports/swing-core — the DETERMINISTIC aim / power / scoring math,
 *                             unit tested in scripts/sports-tests.ts.
 *
 * The proven tuned scoring is preserved: 9 shots, 550 points to win, the exact
 * birdie/great/solid/rough thresholds (100/60/30/10) from the 2D scene. Drive,
 * chip and putt share the same window math scaled per club. // TUNE(elijah)
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
import { computeCamera, CameraCut, RIGS, type CameraFrame, type Subject } from '@/lib/camera/rigs';
import {
  GOLF_POWER_SWEET, GOLF_POWER_INNER, GOLF_POWER_OUTER, SHOT_CARRY_M,
  resolveShot, type ShotKind, type GolfShotResult,
} from '@/lib/sports/swing-core';

const GOLFER_URL = '/models/clips/golf_swing.glb';
const MAP = MAPS['coastal-links'];

const TEE = { x: 0, y: 0, z: 6 };
const PIN = { x: 0, y: 0, z: -12 };
const WORLD_PER_M = 0.085; // 210 m drive -> ~17.8 world units  // TUNE(elijah)

const TOTAL_SHOTS = 9;
const WIN_SCORE = 550;

const SHOT_ORDER: ShotKind[] = ['drive', 'chip', 'putt'];

type Phase = 'ready' | 'aim' | 'power' | 'flight' | 'between';

interface HudState {
  shot: number; score: number; wind: number; kind: ShotKind;
  phase: Phase; aim: number; power: number;
  msg: string; msgColor: string; msgT: number; lastDist: number;
  prqLabel: string; prqColor: string; camRig: string;
}

function GolfCamera({
  subjectRef, rigModeRef, cutRef,
}: {
  subjectRef: React.MutableRefObject<Subject>;
  rigModeRef: React.MutableRefObject<'follow' | 'broadcast'>;
  cutRef: React.MutableRefObject<CameraCut>;
}) {
  const camera = useThree((s) => s.camera);
  const smoothed = useRef<CameraFrame>({ position: { x: -4, y: 3, z: 11 }, target: { x: 0, y: 1.2, z: 0 }, fov: 50 });
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const rig = rigModeRef.current === 'broadcast' ? RIGS.broadcast : RIGS.follow;
    const target = computeCamera(subjectRef.current, rig);
    const frame = cutRef.current.active ? cutRef.current.update(dt, target) : target;
    const k = (rig.stiffness + 0.04) * 6 * dt * 10;
    const sm = smoothed.current;
    sm.position.x += (frame.position.x - sm.position.x) * k;
    sm.position.y += (frame.position.y - sm.position.y) * k;
    sm.position.z += (frame.position.z - sm.position.z) * k;
    sm.target.x += (frame.target.x - sm.target.x) * k;
    sm.target.y += (frame.target.y - sm.target.y) * k;
    sm.target.z += (frame.target.z - sm.target.z) * k;
    camera.position.set(sm.position.x, sm.position.y, sm.position.z);
    camera.lookAt(sm.target.x, sm.target.y, sm.target.z);
    const cam = camera as THREE.PerspectiveCamera;
    if (cam.isPerspectiveCamera) { cam.fov += (frame.fov - cam.fov) * 0.1; cam.updateProjectionMatrix(); }
  });
  return null;
}

function GolfScene({
  grade, onEnd, onHud, onPerf,
}: GameProps & { onHud: (h: HudState) => void; onPerf: (p: PerfSample) => void }) {
  const golferRef = useRef<AvatarHandle | null>(null);
  const ballMeshRef = useRef<THREE.Group | null>(null);
  const onEndRef = useRef(onEnd); onEndRef.current = onEnd;
  const gradeRef = useRef(grade); gradeRef.current = grade;
  const endedRef = useRef(false);

  const cut = useRef(new CameraCut());
  const rigMode = useRef<'follow' | 'broadcast'>('follow');
  const camSubject = useRef<Subject>({ pos: { x: -1.2, y: 1.1, z: TEE.z }, facing: 0, speed01: 0 });

  const st = useRef({
    t: 0, shot: 0, score: 0,
    phase: 'ready' as Phase,
    kind: 'drive' as ShotKind,
    wind: 0,
    aimT: 0, aim: 0, power: 0, powerDir: 1,
    lockedAim: 0,
    flight: null as null | { from: THREE.Vector3; toX: number; toZ: number; peak: number; t: number },
    result: null as GolfShotResult | null,
    msg: '', msgColor: '#FFD700', msgT: 0, betweenT: 0,
    keys: {} as Record<string, boolean>,
    startTime: Date.now(),
  });

  const say = useCallback((m: string, c: string) => { const s = st.current; s.msg = m; s.msgColor = c; s.msgT = 1.6; }, []);

  const endGame = useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;
    const s = st.current;
    const dur = Math.round((Date.now() - s.startTime) / 1000);
    const won = s.score >= WIN_SCORE;
    onEndRef.current?.({ score: s.score, won, duration: dur, headline: won ? 'LINKS CHAMPION' : 'ROUND COMPLETE' });
  }, []);

  const beginShot = useCallback(() => {
    const s = st.current;
    if (s.shot >= TOTAL_SHOTS) { endGame(); return; }
    s.phase = 'aim'; s.aimT = 0; s.aim = 0; s.power = 0; s.powerDir = 1; s.flight = null; s.result = null;
    s.wind = Math.round((Math.random() * 2 - 1) * 100) / 100; // -1..1  // TUNE(elijah)
    rigMode.current = 'follow';
  }, [endGame]);

  const setKind = useCallback((k: ShotKind) => {
    const s = st.current;
    if (s.phase === 'ready' || s.phase === 'aim') s.kind = k;
  }, []);

  const lockAim = useCallback(() => {
    const s = st.current;
    if (s.phase !== 'aim') return;
    s.lockedAim = s.aim; s.phase = 'power'; s.power = 0; s.powerDir = 1;
  }, []);

  const lockPower = useCallback(() => {
    const s = st.current;
    if (s.phase !== 'power') return;
    golferRef.current?.play(golferRef.current.clipNames[0] ?? 'ArmatureAction.001', { loop: false, timeScale: 1.2 });
    const r = resolveShot(s.kind, s.lockedAim, s.power, s.wind);
    s.result = r;
    const worldCarry = r.carryM * WORLD_PER_M;
    const spray = (r.offlineM / Math.max(1, SHOT_CARRY_M[s.kind])) * 6; // lateral world offset
    s.flight = {
      from: new THREE.Vector3(TEE.x, 0.3, TEE.z),
      toX: TEE.x + spray,
      toZ: TEE.z - worldCarry,
      peak: s.kind === 'putt' ? 0.15 : s.kind === 'chip' ? 1.6 : 3.4,
      t: 0,
    };
    s.phase = 'flight';
    rigMode.current = 'broadcast';
    cut.current.begin(computeCamera(camSubject.current, RIGS.follow), 0.5);
  }, []);

  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      const k = (e.key ?? '').toLowerCase();
      st.current.keys[k] = true;
      const s = st.current;
      if (k === '1') setKind('drive');
      if (k === '2') setKind('chip');
      if (k === '3') setKind('putt');
      if (k === ' ') {
        e.preventDefault?.();
        if (s.phase === 'ready') beginShot();
        else if (s.phase === 'aim') lockAim();
        else if (s.phase === 'power') lockPower();
      }
    };
    const ku = (e: KeyboardEvent) => { st.current.keys[(e.key ?? '').toLowerCase()] = false; };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    (window as any).__felGolf3D = {
      act: () => { const s = st.current; if (s.phase === 'ready') beginShot(); else if (s.phase === 'aim') lockAim(); else if (s.phase === 'power') lockPower(); },
      setKind,
    };
    registerFelMode('golf', {
      getState: () => { const s = st.current; return { phase: s.phase, shot: s.shot, score: s.score, kind: s.kind }; },
      sendInput: (a, p) => { if (a === 'act' || a === 'shoot' || a === 'swing') (window as any).__felGolf3D?.act(); else if (a === 'kind') setKind(p as ShotKind); },
    });
    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      delete (window as any).__felGolf3D;
      unregisterFelMode('golf');
    };
  }, [beginShot, lockAim, lockPower, setKind]);

  const hudAcc = useRef(0);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const s = st.current;
    if (endedRef.current) return;
    s.t += dt;
    if (s.msgT > 0) s.msgT -= dt;
    const speedMult = gradeRef.current?.speedMult ?? 1;

    if (s.phase === 'aim') { s.aimT += dt * 1.5 * speedMult; s.aim = Math.sin(s.aimT); } // TUNE(elijah)
    if (s.phase === 'power') { s.power += s.powerDir * dt * 1.25; if (s.power >= 1) { s.power = 1; s.powerDir = -1; } if (s.power <= 0) { s.power = 0; s.powerDir = 1; } } // TUNE(elijah)

    if (s.phase === 'flight' && s.flight) {
      const f = s.flight;
      f.t = Math.min(1, f.t + dt * 0.8);
      if (f.t >= 1) {
        const r = s.result!;
        s.shot++;
        s.score += r.points;
        const label = r.grade === 'birdie' ? `BIRDIE! +${r.points}` : r.grade === 'great' ? `GREAT +${r.points}` : r.grade === 'solid' ? `SOLID +${r.points}` : `ROUGH +${r.points}`;
        const color = r.grade === 'birdie' ? '#00FF9D' : r.grade === 'great' ? '#00E5FF' : r.grade === 'solid' ? '#FFD700' : '#FF8888';
        say(`${label} · ${r.distFromPinM}m from pin`, color);
        s.phase = 'between'; s.betweenT = 1.5;
      }
    }
    if (s.phase === 'between') { s.betweenT -= dt; if (s.betweenT <= 0) { if (s.shot >= TOTAL_SHOTS || s.score >= WIN_SCORE) endGame(); else s.phase = 'ready'; } }

    // camera subject
    if (s.phase === 'flight' && s.flight && ballMeshRef.current) {
      const b = ballMeshRef.current.position;
      camSubject.current.pos.x = b.x; camSubject.current.pos.y = Math.max(1, b.y); camSubject.current.pos.z = b.z;
      camSubject.current.facing = 0; camSubject.current.speed01 = 1;
    } else {
      camSubject.current.pos.x = -1.2; camSubject.current.pos.y = 1.1; camSubject.current.pos.z = TEE.z;
      camSubject.current.facing = 0; camSubject.current.speed01 = 0;
    }

    // ball mesh
    if (ballMeshRef.current) {
      const bm = ballMeshRef.current;
      if (s.phase === 'flight' && s.flight) {
        const f = s.flight; const t = f.t;
        bm.visible = true;
        bm.position.set(
          f.from.x + (f.toX - f.from.x) * t,
          0.15 + Math.sin(t * Math.PI) * f.peak,
          f.from.z + (f.toZ - f.from.z) * t,
        );
      } else if (s.phase === 'ready' || s.phase === 'aim' || s.phase === 'power') {
        bm.visible = true; bm.position.set(TEE.x, 0.15, TEE.z);
      } else {
        bm.visible = false;
      }
    }

    hudAcc.current += dt;
    if (hudAcc.current >= HUD_SNAPSHOT_INTERVAL) {
      hudAcc.current = 0;
      onHud({
        shot: s.shot, score: s.score, wind: s.wind, kind: s.kind,
        phase: s.phase, aim: s.aim, power: s.power,
        msg: s.msg, msgColor: s.msgColor, msgT: s.msgT, lastDist: s.result?.distFromPinM ?? 0,
        prqLabel: gradeRef.current?.label ?? '', prqColor: gradeRef.current?.color ?? '#00FF9D',
        camRig: rigMode.current,
      });
    }
  });

  return (
    <>
      {MAP.backdrop && (<Suspense fallback={null}><SceneBackdrop url={MAP.backdrop} /></Suspense>)}
      <Suspense fallback={null}><MapMesh config={MAP} /></Suspense>
      <RimGlowPulse color="#00FF9D" position={[0, 3, PIN.z]} baseIntensity={6} pulseAmp={3} pulseSpeed={0.8} />

      {/* Pin / flag at the green */}
      <group position={[PIN.x, 0, PIN.z]}>
        <mesh position={[0, 1.2, 0]}><cylinderGeometry args={[0.04, 0.04, 2.4, 8]} /><meshStandardMaterial color="#EDEDF2" /></mesh>
        <mesh position={[0.4, 2.1, 0]}><planeGeometry args={[0.8, 0.5]} /><meshStandardMaterial color="#FF3366" emissive="#FF3366" emissiveIntensity={0.5} side={THREE.DoubleSide} /></mesh>
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[2.2, 24]} /><meshStandardMaterial color="#0f5132" emissive="#093" emissiveIntensity={0.3} /></mesh>
      </group>

      {/* Ball */}
      <group ref={ballMeshRef} position={[TEE.x, 0.15, TEE.z]}>
        <mesh castShadow><sphereGeometry args={[0.13, 18, 18]} /><meshStandardMaterial color="#EDEDF2" roughness={0.4} /></mesh>
      </group>

      {/* Golfer (self-rigged swing character) */}
      <Suspense fallback={null}>
        <Avatar
          url={GOLFER_URL}
          onReady={(h) => {
            golferRef.current = h;
            h.group.position.set(-0.7, MAP.floorY ?? 0, TEE.z);
            h.group.rotation.y = -Math.PI / 2;
            h.stopAll?.();
            h.scrub(0);
          }}
        />
      </Suspense>

      <GolfCamera subjectRef={camSubject} rigModeRef={rigMode} cutRef={cut} />
      <PerfSampler onSample={onPerf} />
    </>
  );
}

export default function Golf3D(props: GameProps) {
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
  const act = () => (window as any).__felGolf3D?.act();
  const pick = (k: ShotKind) => (window as any).__felGolf3D?.setKind(k);

  const sweetLeft = (GOLF_POWER_SWEET - GOLF_POWER_OUTER) * 100;
  const sweetW = GOLF_POWER_OUTER * 2 * 100;
  const perfLeft = (GOLF_POWER_SWEET - GOLF_POWER_INNER) * 100;
  const perfW = GOLF_POWER_INNER * 2 * 100;

  const prompt = hud
    ? hud.phase === 'ready' ? 'SPACE — start the shot · 1 Drive / 2 Chip / 3 Putt'
      : hud.phase === 'aim' ? 'SPACE — lock aim (compensate for wind)'
      : hud.phase === 'power' ? 'SPACE — lock power in the green'
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
        camera={{ fov: 50, near: 0.1, far: 300, position: [-4, 3, 11] }}
        scene={{ fog: new THREE.Fog(new THREE.Color(MAP.fogColor), MAP.fogNear, MAP.fogFar) }}
      >
        <PerformanceMonitor
          onIncline={() => setDpr((d) => Math.min(d + 0.25, PERF_BUDGET.dprMax))}
          onDecline={() => setDpr((d) => Math.max(d - 0.25, PERF_BUDGET.dprMin))}
        >
          <SceneLighting variant="venice" />
          <GolfScene {...props} onHud={setHud} onPerf={setPerf} />
        </PerformanceMonitor>
      </Canvas>

      {hud && (
        <div className="absolute inset-0 pointer-events-none" style={{ fontFamily: 'var(--font-display), sans-serif' }}>
          {/* scoreboard */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1">
            <div className="flex items-center gap-5 px-5 py-1.5 rounded-xl" style={{ background: 'rgba(5,5,8,0.75)', backdropFilter: 'blur(12px)', border: '1px solid rgba(0,255,157,0.2)' }}>
              <span className="text-2xl font-bold text-[#00FF9D]">{hud.score}<span className="text-[11px] text-white/50"> PTS</span></span>
              <span className="text-[11px] text-white/60 font-mono">SHOT {Math.min(hud.shot + 1, TOTAL_SHOTS)}/{TOTAL_SHOTS}</span>
              <span className="text-[11px] font-mono" style={{ color: hud.wind < 0 ? '#00E5FF' : '#FFD700' }}>WIND {hud.wind > 0 ? '→' : hud.wind < 0 ? '←' : '•'} {Math.abs(hud.wind).toFixed(2)}</span>
            </div>
            <div className="flex gap-3 items-center px-3 py-0.5 rounded-lg font-mono text-[10px] text-white/70" style={{ background: 'rgba(5,5,8,0.8)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <span>CLUB {hud.kind.toUpperCase()}</span>
              <span>{WIN_SCORE} TO WIN</span>
              <span style={{ color: '#C99BF7' }}>CAM {hud.camRig.toUpperCase()}</span>
            </div>
          </div>

          <div className="absolute top-3 right-3 text-right font-mono text-[11px]" style={{ color: hud.prqColor }}>LINKS · {hud.prqLabel}</div>

          {/* aim bar */}
          {hud.phase === 'aim' && (
            <div className="absolute left-1/2 bottom-16 -translate-x-1/2 w-72">
              <div className="relative h-3 rounded bg-black/70 overflow-hidden border border-white/10">
                <div className="absolute inset-y-0 left-1/2 w-0.5 bg-white/40" />
                <div className="absolute inset-y-0 w-2 rounded bg-[#FFD700]" style={{ left: `${((hud.aim + 1) / 2) * 100}%`, transition: 'none' }} />
              </div>
              <p className="mt-1 text-center text-[10px] font-mono text-white/60">AIM — the wind pushes the ball {hud.wind > 0 ? 'right' : 'left'}</p>
            </div>
          )}
          {/* power bar (Wii-Sports readability) */}
          {hud.phase === 'power' && (
            <div className="absolute left-1/2 bottom-16 -translate-x-1/2 w-72">
              <div className="relative h-4 rounded bg-black/70 overflow-hidden border border-white/10">
                <div className="absolute inset-y-0 bg-[#00E5FF]/30" style={{ left: `${sweetLeft}%`, width: `${sweetW}%` }} />
                <div className="absolute inset-y-0 bg-[#00FF9D]/60" style={{ left: `${perfLeft}%`, width: `${perfW}%` }} />
                <div className="h-full rounded" style={{ width: `${hud.power * 100}%`, background: 'rgba(255,215,0,0.55)', transition: 'none' }} />
              </div>
              <p className="mt-1 text-center text-[10px] font-mono text-white/60">STOP IN THE GREEN FOR FULL CARRY</p>
            </div>
          )}

          {prompt && <div className="absolute bottom-5 left-1/2 -translate-x-1/2 text-xs font-mono text-white/70">{prompt}</div>}

          {hud.msg && hud.msgT > 0 && (
            <div className="absolute top-[38%] left-1/2 -translate-x-1/2">
              <div className="text-3xl font-bold text-center" style={{ color: hud.msgColor, textShadow: `0 0 20px ${hud.msgColor}55` }}>{hud.msg}</div>
            </div>
          )}

          {/* touch controls */}
          <div className="absolute bottom-3 right-3 flex gap-2 pointer-events-auto">
            <button onClick={() => pick('drive')} className="h-9 w-12 rounded-lg border border-[#00E5FF]/50 bg-black/50 text-[10px] font-bold text-[#00E5FF]">DRV</button>
            <button onClick={() => pick('chip')} className="h-9 w-12 rounded-lg border border-[#FFD700]/50 bg-black/50 text-[10px] font-bold text-[#FFD700]">CHIP</button>
            <button onClick={() => pick('putt')} className="h-9 w-12 rounded-lg border border-white/40 bg-black/50 text-[10px] font-bold text-white/80">PUTT</button>
            <button onClick={act} className="h-9 w-16 rounded-lg border border-[#00FF9D]/60 bg-black/50 text-[10px] font-bold text-[#00FF9D]">SWING</button>
          </div>
        </div>
      )}

      <PerfOverlay perf={perf} grade={grade} show={showPerf} />
    </div>
  );
}
