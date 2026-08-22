'use client';

/**
 * baseball-3d.tsx — M14-P10 Home Run Derby rebuilt in real 3D.
 * ===========================================================
 * The flat 2D canvas derby is re-skinned onto the shared 3D engine:
 *   • MAPS['baseball-park']  — Catalina Ballpark venue GLB
 *   • camera rigs + CameraCut — follow rig on the batter, broadcast rig that
 *                               rides the batted ball (the "ball-flight camera")
 *   • self-rigged pitcher / batter GLB mini-characters (their own swing clips)
 *   • lib/sports/swing-core — the DETERMINISTIC contact + scoring math, unit
 *                             tested in scripts/sports-tests.ts.
 *
 * The proven tuned derby rules are preserved verbatim: 6 homers to win, 10 outs
 * to end, score = homers*100 + totalCarry/10. Only the presentation is new; the
 * contact / distance / Movie-Event math is RESERVED in swing-core. // TUNE(elijah)
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
  PITCH_KINDS, PITCHES, PLATE_T, BB_PERFECT, BB_SOLID,
  resolveContact, battedBallEvent,
  type PitchKind, type ContactResult, type HitCategory,
} from '@/lib/sports/swing-core';

const BATTER_URL = '/models/clips/baseball_swing.glb';
const PITCHER_URL = '/models/clips/baseball_pitch.glb';
const MAP = MAPS['baseball-park'];

// World geometry (world units). Batter box at +Z, pitcher mound toward -Z,
// centre field further -Z. The batted ball flies out toward -Z and the fence
// sits at FENCE_Z; homers must clear it. // TUNE(elijah)
const PLATE = { x: 0, y: 0, z: 4 };
const MOUND = { x: 0, y: 0, z: -6 };
const FENCE_Z = -13;
const WORLD_PER_M = 0.09; // 120 m fence -> ~10.8 world units of carry  // TUNE(elijah)

const WIN_HOMERS = 6;
const MAX_OUTS = 10;

type Phase = 'ready' | 'windup' | 'pitch' | 'contact' | 'between';

interface HudState {
  homers: number; outs: number; score: number; pitch: PitchKind;
  phase: Phase; swingBar: number; barActive: boolean;
  msg: string; msgColor: string; msgT: number;
  lastDist: number; prqLabel: string; prqColor: string; camRig: string;
}

// The timing bar the player reads: a marker sweeps 0..1 as the pitch travels;
// the green sweet-spot band is centred on PLATE_T with the perfect/solid windows.
const BAR_CENTER = PLATE_T;

function BaseballCamera({
  subjectRef, rigModeRef, cutRef,
}: {
  subjectRef: React.MutableRefObject<Subject>;
  rigModeRef: React.MutableRefObject<'follow' | 'broadcast'>;
  cutRef: React.MutableRefObject<CameraCut>;
}) {
  const camera = useThree((s) => s.camera);
  const smoothed = useRef<CameraFrame>({ position: { x: -4, y: 3, z: 9 }, target: { x: 0, y: 1.2, z: 0 }, fov: 50 });
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

function BaseballScene({
  grade, onEnd, gamepad, onHud, onPerf,
}: GameProps & { onHud: (h: HudState) => void; onPerf: (p: PerfSample) => void }) {
  const batterRef = useRef<AvatarHandle | null>(null);
  const pitcherRef = useRef<AvatarHandle | null>(null);
  const ballMeshRef = useRef<THREE.Group | null>(null);
  const onEndRef = useRef(onEnd); onEndRef.current = onEnd;
  const gradeRef = useRef(grade); gradeRef.current = grade;
  const endedRef = useRef(false);

  const cut = useRef(new CameraCut());
  const rigMode = useRef<'follow' | 'broadcast'>('follow');
  const camSubject = useRef<Subject>({ pos: { x: -1.5, y: 1.1, z: PLATE.z }, facing: 0, speed01: 0 });

  const st = useRef({
    t: 0, homers: 0, outs: 0, score: 0, totalCarry: 0,
    phase: 'ready' as Phase,
    pitch: 'fastball' as PitchKind,
    windupT: 0, pitchT: 0, swung: false,
    // batted ball flight
    flight: null as null | { from: THREE.Vector3; dir: THREE.Vector3; peak: number; dist: number; t: number; homer: boolean; cat: HitCategory },
    result: null as ContactResult | null,
    msg: '', msgColor: '#FFD700', msgT: 0, betweenT: 0,
    keys: {} as Record<string, boolean>,
    startTime: Date.now(),
  });

  const say = useCallback((m: string, c: string) => { const s = st.current; s.msg = m; s.msgColor = c; s.msgT = 1.6; }, []);

  const pickPitch = useCallback(() => {
    st.current.pitch = PITCH_KINDS[Math.floor(Math.random() * PITCH_KINDS.length)];
  }, []);

  const endGame = useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;
    const s = st.current;
    const dur = Math.round((Date.now() - s.startTime) / 1000);
    const won = s.homers >= WIN_HOMERS;
    onEndRef.current?.({ score: s.score, won, duration: dur, headline: won ? 'DERBY CHAMPION' : 'DERBY OVER' });
  }, []);

  const nextPitch = useCallback(() => {
    const s = st.current;
    if (s.homers >= WIN_HOMERS || s.outs >= MAX_OUTS) { endGame(); return; }
    s.flight = null; s.result = null; s.swung = false; s.pitchT = 0; s.windupT = 0;
    s.phase = 'windup'; rigMode.current = 'follow';
    pickPitch();
    // Pitcher wind-up Movie Event: play the pitch clip.
    pitcherRef.current?.play(pitcherRef.current.clipNames[0] ?? 'ArmatureAction.001', { loop: false, timeScale: 1.1 });
  }, [endGame, pickPitch]);

  // Swing! Capture the pitch fraction as the timing input.
  const doSwing = useCallback(() => {
    const s = st.current;
    if (s.phase !== 'pitch' || s.swung) return;
    s.swung = true;
    batterRef.current?.play(batterRef.current.clipNames[0] ?? 'ArmatureAction.001', { loop: false, timeScale: 1.35 });
    const swingT = s.pitchT;
    const hangBonus = (gradeRef.current?.speedMult ?? 1) - 1; // better grade -> a touch more carry
    const r = resolveContact(swingT, s.pitch, Math.max(0, hangBonus));
    s.result = r;
    if (r.quality === 'whiff') {
      s.outs++; say('WHIFF!', '#FF3366');
      s.phase = 'between'; s.betweenT = 1.2;
      return;
    }
    // Launch the batted ball as a Movie Event with the broadcast ball-flight cam.
    battedBallEvent(r);
    const spray = (r.sprayDeg * Math.PI) / 180;
    const dir = new THREE.Vector3(Math.sin(spray), 0, -Math.cos(spray)).normalize();
    const worldDist = r.distanceM * WORLD_PER_M;
    s.flight = {
      from: new THREE.Vector3(PLATE.x, 0.9, PLATE.z),
      dir,
      peak: 1.2 + (r.launchDeg / 30) * 4.5,
      dist: worldDist,
      t: 0,
      homer: r.isHomeRun,
      cat: r.category,
    };
    s.phase = 'contact';
    rigMode.current = 'broadcast';
    cut.current.begin(computeCamera(camSubject.current, RIGS.follow), 0.5);
  }, [say]);

  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      const k = (e.key ?? '').toLowerCase();
      st.current.keys[k] = true;
      const s = st.current;
      if (k === ' ') {
        e.preventDefault?.();
        if (s.phase === 'ready') nextPitch();
        else if (s.phase === 'pitch') doSwing();
      }
    };
    const ku = (e: KeyboardEvent) => { st.current.keys[(e.key ?? '').toLowerCase()] = false; };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    (window as any).__felBaseball3D = {
      swing: () => { const s = st.current; if (s.phase === 'ready') nextPitch(); else if (s.phase === 'pitch') doSwing(); },
    };
    registerFelMode('baseball', {
      getState: () => { const s = st.current; return { phase: s.phase, homers: s.homers, outs: s.outs, score: s.score }; },
      sendInput: (a) => { if (a === 'swing' || a === 'shoot') (window as any).__felBaseball3D?.swing(); },
    });
    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      delete (window as any).__felBaseball3D;
      unregisterFelMode('baseball');
    };
  }, [nextPitch, doSwing]);

  const hudAcc = useRef(0);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const s = st.current;
    if (endedRef.current) return;
    s.t += dt;
    if (s.msgT > 0) s.msgT -= dt;
    const speedMult = gradeRef.current?.speedMult ?? 1;

    // ── wind-up → pitch ──
    if (s.phase === 'windup') {
      s.windupT += dt;
      if (s.windupT >= 0.9) { s.phase = 'pitch'; s.pitchT = 0; }
    }
    if (s.phase === 'pitch') {
      s.pitchT += dt * PITCHES[s.pitch].speed * 0.75 * speedMult; // TUNE(elijah)
      if (s.pitchT >= 1.05 && !s.swung) {
        // Took the pitch — counts as an out.
        s.outs++; say('TOOK IT — OUT', '#FF8888');
        s.phase = 'between'; s.betweenT = 1.0;
      }
    }

    // ── batted-ball flight resolution ──
    if (s.phase === 'contact' && s.flight) {
      const f = s.flight;
      f.t = Math.min(1, f.t + dt * 0.85);
      if (f.t >= 1) {
        const r = s.result!;
        s.totalCarry += r.distanceM;
        if (r.isHomeRun) { s.homers++; say(`HOME RUN! ${r.distanceM}m`, '#00FF9D'); }
        else if (r.category === 'drive') say(`DRIVE ${r.distanceM}m`, '#00E5FF');
        else if (r.category === 'liner') say(`LINER ${r.distanceM}m`, '#00E5FF');
        else say(`POP OUT ${r.distanceM}m`, '#FF8888');
        if (!r.isHomeRun) s.outs++;
        s.score = s.homers * 100 + Math.round(s.totalCarry / 10);
        s.phase = 'between'; s.betweenT = 1.4;
      }
    }
    if (s.phase === 'between') { s.betweenT -= dt; if (s.betweenT <= 0) nextPitch(); }

    // ── camera subject: batter on the ground game, ball during flight ──
    if (s.phase === 'contact' && s.flight && ballMeshRef.current) {
      const b = ballMeshRef.current.position;
      camSubject.current.pos.x = b.x; camSubject.current.pos.y = Math.max(1, b.y); camSubject.current.pos.z = b.z;
      camSubject.current.facing = 0; camSubject.current.speed01 = 1;
    } else {
      camSubject.current.pos.x = -1.5; camSubject.current.pos.y = 1.1; camSubject.current.pos.z = PLATE.z;
      camSubject.current.facing = 0; camSubject.current.speed01 = 0;
    }

    // ── ball mesh ──
    if (ballMeshRef.current) {
      const bm = ballMeshRef.current;
      if (s.phase === 'pitch') {
        bm.visible = true;
        const t = Math.min(s.pitchT, 1);
        const br = PITCHES[s.pitch].break;
        bm.position.set(
          MOUND.x + (PLATE.x - MOUND.x) * t + Math.sin(t * Math.PI) * br,
          1.7 + (0.95 - 1.7) * t,
          MOUND.z + (PLATE.z - MOUND.z) * t,
        );
      } else if (s.phase === 'contact' && s.flight) {
        const f = s.flight;
        bm.visible = true;
        const along = f.dist * f.t;
        bm.position.set(
          f.from.x + f.dir.x * along,
          f.from.y + Math.sin(f.t * Math.PI) * f.peak,
          f.from.z + f.dir.z * along,
        );
      } else {
        bm.visible = false;
      }
    }

    hudAcc.current += dt;
    if (hudAcc.current >= HUD_SNAPSHOT_INTERVAL) {
      hudAcc.current = 0;
      onHud({
        homers: s.homers, outs: s.outs, score: s.score, pitch: s.pitch,
        phase: s.phase, swingBar: s.phase === 'pitch' ? Math.min(s.pitchT, 1) : 0,
        barActive: s.phase === 'pitch',
        msg: s.msg, msgColor: s.msgColor, msgT: s.msgT, lastDist: s.result?.distanceM ?? 0,
        prqLabel: gradeRef.current?.label ?? '', prqColor: gradeRef.current?.color ?? '#00FF9D',
        camRig: rigMode.current,
      });
    }
  });

  return (
    <>
      {MAP.backdrop && (<Suspense fallback={null}><SceneBackdrop url={MAP.backdrop} /></Suspense>)}
      <Suspense fallback={null}><MapMesh config={MAP} /></Suspense>
      <RimGlowPulse color="#00E5FF" position={[-6, 4, FENCE_Z]} baseIntensity={6} pulseAmp={3} pulseSpeed={0.8} />
      <RimGlowPulse color="#FFD700" position={[6, 4, FENCE_Z]} baseIntensity={6} pulseAmp={3} pulseSpeed={0.9} />

      {/* Outfield fence line (homer marker) */}
      <mesh position={[0, 1, FENCE_Z]}>
        <boxGeometry args={[26, 2, 0.2]} />
        <meshStandardMaterial color="#12303a" emissive="#0a4a55" emissiveIntensity={0.6} />
      </mesh>
      {/* Home plate */}
      <mesh position={[PLATE.x, 0.02, PLATE.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.1, 1.1]} />
        <meshStandardMaterial color="#EDEDF2" />
      </mesh>

      {/* Ball */}
      <group ref={ballMeshRef} position={[MOUND.x, 1.7, MOUND.z]}>
        <mesh castShadow><sphereGeometry args={[0.16, 18, 18]} /><meshStandardMaterial color="#EDEDF2" roughness={0.5} /></mesh>
      </group>

      {/* Batter (self-rigged swing character) */}
      <Suspense fallback={null}>
        <Avatar
          url={BATTER_URL}
          onReady={(h) => {
            batterRef.current = h;
            h.group.position.set(-0.9, MAP.floorY ?? 0, PLATE.z);
            h.group.rotation.y = -Math.PI / 2;
            h.stopAll?.();
            h.scrub(0);
          }}
        />
      </Suspense>

      {/* Pitcher (self-rigged pitch character) */}
      <Suspense fallback={null}>
        <Avatar
          url={PITCHER_URL}
          tint="#FF3366"
          onReady={(h) => {
            pitcherRef.current = h;
            h.group.position.set(MOUND.x, MAP.floorY ?? 0, MOUND.z);
            h.group.rotation.y = 0;
            h.stopAll?.();
            h.scrub(0);
          }}
        />
      </Suspense>

      <BaseballCamera subjectRef={camSubject} rigModeRef={rigMode} cutRef={cut} />
      <PerfSampler onSample={onPerf} />
    </>
  );
}

export default function Baseball3D(props: GameProps) {
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
  const swing = () => (window as any).__felBaseball3D?.swing();

  // Readability bar geometry: sweet-spot band centred on PLATE_T.
  const perfPct = BB_PERFECT * 100;
  const solidPct = BB_SOLID * 100;

  const prompt = hud
    ? hud.phase === 'ready' ? 'SPACE — call for the pitch'
      : hud.phase === 'pitch' ? 'SPACE — SWING when the marker hits the green'
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
        camera={{ fov: 50, near: 0.1, far: 300, position: [-4, 3, 9] }}
        scene={{ fog: new THREE.Fog(new THREE.Color(MAP.fogColor), MAP.fogNear, MAP.fogFar) }}
      >
        <PerformanceMonitor
          onIncline={() => setDpr((d) => Math.min(d + 0.25, PERF_BUDGET.dprMax))}
          onDecline={() => setDpr((d) => Math.max(d - 0.25, PERF_BUDGET.dprMin))}
        >
          <SceneLighting variant="venice" />
          <BaseballScene {...props} onHud={setHud} onPerf={setPerf} />
        </PerformanceMonitor>
      </Canvas>

      {hud && (
        <div className="absolute inset-0 pointer-events-none" style={{ fontFamily: 'var(--font-display), sans-serif' }}>
          {/* scoreboard */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1">
            <div className="flex items-center gap-5 px-5 py-1.5 rounded-xl" style={{ background: 'rgba(5,5,8,0.75)', backdropFilter: 'blur(12px)', border: '1px solid rgba(0,229,255,0.2)' }}>
              <span className="text-2xl font-bold text-[#00FF9D]">{hud.homers}<span className="text-[11px] text-white/50"> HR</span></span>
              <span className="text-[11px] text-white/60 font-mono">SCORE {hud.score}</span>
              <span className="text-2xl font-bold text-[#FF3366]">{hud.outs}<span className="text-[11px] text-white/50"> OUT</span></span>
            </div>
            <div className="flex gap-3 items-center px-3 py-0.5 rounded-lg font-mono text-[10px] text-white/70" style={{ background: 'rgba(5,5,8,0.8)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <span>PITCH {hud.pitch.toUpperCase()}</span>
              <span>{WIN_HOMERS} HR TO WIN · {MAX_OUTS} OUTS</span>
              <span style={{ color: '#C99BF7' }}>CAM {hud.camRig.toUpperCase()}</span>
            </div>
          </div>

          {/* PRQ */}
          <div className="absolute top-3 right-3 text-right font-mono text-[11px]" style={{ color: hud.prqColor }}>DERBY · {hud.prqLabel}</div>

          {/* Wii-Sports style timing readability bar */}
          {hud.barActive && (
            <div className="absolute left-1/2 bottom-16 -translate-x-1/2 w-72">
              <div className="relative h-4 rounded bg-black/70 overflow-hidden border border-white/10">
                {/* solid band */}
                <div className="absolute inset-y-0 bg-[#00E5FF]/30" style={{ left: `${(BAR_CENTER - BB_SOLID) * 100}%`, width: `${solidPct * 2}%` }} />
                {/* perfect band */}
                <div className="absolute inset-y-0 bg-[#00FF9D]/60" style={{ left: `${(BAR_CENTER - BB_PERFECT) * 100}%`, width: `${perfPct * 2}%` }} />
                {/* moving marker */}
                <div className="absolute inset-y-0 w-1 bg-[#FFD700]" style={{ left: `${hud.swingBar * 100}%`, transition: 'none' }} />
              </div>
              <p className="mt-1 text-center text-[10px] font-mono text-white/60">SWING IN THE GREEN FOR A BARREL</p>
            </div>
          )}

          {prompt && <div className="absolute bottom-5 left-1/2 -translate-x-1/2 text-xs font-mono text-white/70">{prompt}</div>}

          {hud.msg && hud.msgT > 0 && (
            <div className="absolute top-[38%] left-1/2 -translate-x-1/2">
              <div className="text-4xl font-bold" style={{ color: hud.msgColor, textShadow: `0 0 20px ${hud.msgColor}55` }}>{hud.msg}</div>
            </div>
          )}

          {/* touch swing button */}
          <div className="absolute bottom-3 right-3 flex gap-2 pointer-events-auto">
            <button onClick={swing} className="h-12 w-20 rounded-full border border-[#00FF9D]/60 bg-black/50 text-xs font-bold text-[#00FF9D]">SWING</button>
          </div>
        </div>
      )}

      <PerfOverlay perf={perf} grade={grade} show={showPerf} />
    </div>
  );
}
