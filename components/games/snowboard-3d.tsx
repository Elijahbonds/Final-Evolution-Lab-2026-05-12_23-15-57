'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import * as THREE from 'three';
import type { GameProps } from '@/components/games/game-shell';
import { Avatar, type AvatarHandle } from '@/components/three/avatar';
import { SceneLighting } from '@/components/three/lighting';
import { FollowCamera } from '@/components/three/follow-camera';
import { MapMesh } from '@/components/three/map-loader';
import { MAPS } from '@/lib/map-data';
import { DustMotes, RimGlowPulse, useTrailParticles, TrailMesh } from '@/components/three/effects';
import { PerfSampler, PerfOverlay, useShowPerf } from '@/components/three/perf-hud';
import { useOrientation } from '@/components/three/orientation';
import { PERF_BUDGET, gradePerf, type PerfSample } from '@/lib/three-budget';

const MODEL_URL = '/models/elijah.glb';
const MAP = MAPS['mountain-slope'];
const SUB_START = 488, SUB_END = 582, CLIP_FPS = 30;
const MODEL_YAW = Math.PI;
const RIDE_TIME = 90;
const COURT_HALF = 10;

interface Gate { z: number; x: number; w: number; passed: boolean; missed: boolean; }
interface HudState {
  score: number; gates: number; misses: number; time: number; combo: number;
  msg: string; msgColor: string; done: boolean;
}

// ---------------------------------------------------------------- Scene
function SlalomScene({
  input, orientation, onHud, onPerf,
}: {
  input: React.RefObject<{ steer: number; trick: boolean }>;
  orientation: string;
  onHud: (h: HudState) => void;
  onPerf: (s: PerfSample) => void;
}) {
  const avatar = useRef<AvatarHandle | null>(null);
  const camTarget = useRef(new THREE.Vector3(0, 0, 0));
  const { ref: trailRef, emit: emitTrail } = useTrailParticles(16);

  const st = useRef({
    time: RIDE_TIME, score: 0, gates: 0, misses: 0, combo: 0,
    x: 0, z: 0, vx: 0, speed: 8,
    gateList: [] as Gate[], spawnT: 0.6, elapsed: 0,
    air: false, airT: 0, trickDone: false,
    msg: '', msgT: 0, msgColor: '#FFD700', done: false,
  });
  const hudAcc = useRef(0);

  // Gate markers
  const gatePool = useMemo(() => {
    const arr: THREE.Mesh[] = [];
    for (let i = 0; i < 10; i++) {
      const g = new THREE.BoxGeometry(0.3, 2, 0.3);
      const m = new THREE.MeshBasicMaterial({ color: 0x00ff9d, transparent: true, opacity: 0.7 });
      arr.push(new THREE.Mesh(g, m));
      const g2 = new THREE.BoxGeometry(0.3, 2, 0.3);
      const m2 = new THREE.MeshBasicMaterial({ color: 0x00ff9d, transparent: true, opacity: 0.7 });
      arr.push(new THREE.Mesh(g2, m2));
    }
    return arr;
  }, []);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const s = st.current;
    const a = avatar.current;
    if (!a || s.done) return;

    s.elapsed += dt;
    s.time = Math.max(0, RIDE_TIME - s.elapsed);
    s.z -= s.speed * dt;

    // Steer
    const inp = input.current;
    if (!inp) return;
    s.vx += inp.steer * 20 * dt;
    s.vx *= 0.92; // friction
    s.x += s.vx * dt;
    s.x = THREE.MathUtils.clamp(s.x, -COURT_HALF, COURT_HALF);

    // Spawn gates
    s.spawnT -= dt;
    if (s.spawnT <= 0) {
      const gx = (Math.random() - 0.5) * 14;
      const gw = 2.5 + Math.random() * 2;
      s.gateList.push({ z: s.z - 40, x: gx, w: gw, passed: false, missed: false });
      s.spawnT = 0.8 + Math.random() * 0.6;
    }

    // Trick (tap space while moving)
    if (inp.trick && !s.air) {
      inp.trick = false;
      s.air = true;
      s.airT = 0;
      s.trickDone = false;
    }
    if (s.air) {
      s.airT += dt;
      if (s.airT > 0.8) {
        s.air = false;
        if (s.trickDone) {
          const pts = 200 * (1 + s.combo * 0.1);
          s.score += Math.round(pts);
          s.msg = `TRICK +${Math.round(pts)}`;
          s.msgColor = '#A855F7';
          s.msgT = 0.7;
          emitTrail(new THREE.Vector3(s.x, 1.5, s.z));
        }
      } else if (s.airT > 0.2 && !s.trickDone) {
        s.trickDone = true;
      }
    }
    if (inp.trick) inp.trick = false;

    // Gate checks
    for (const g of s.gateList) {
      if (g.passed || g.missed) continue;
      if (g.z > s.z - 1 && g.z < s.z + 1) {
        if (Math.abs(s.x - g.x) < g.w) {
          g.passed = true;
          s.gates++;
          s.combo++;
          const pts = 100 * (1 + s.combo * 0.05);
          s.score += Math.round(pts);
          s.msg = `GATE +${Math.round(pts)}`;
          s.msgColor = '#00FF9D';
          s.msgT = 0.5;
        } else {
          g.missed = true;
          s.misses++;
          s.combo = 0;
          if (s.misses >= 5) s.done = true;
        }
      }
    }

    // Clean old gates
    s.gateList = s.gateList.filter(g => g.z > s.z - 5);

    // Update gate visuals
    for (let i = 0; i < 10; i++) {
      const gate = s.gateList[i];
      const leftPost = gatePool[i * 2];
      const rightPost = gatePool[i * 2 + 1];
      if (gate && !gate.passed && !gate.missed) {
        leftPost.visible = true;
        rightPost.visible = true;
        leftPost.position.set(gate.x - gate.w, 1, gate.z);
        rightPost.position.set(gate.x + gate.w, 1, gate.z);
      } else {
        leftPost.visible = false;
        rightPost.visible = false;
      }
    }

    if (s.msgT > 0) s.msgT -= dt;
    if (s.time <= 0) s.done = true;

    // Avatar
    const airLift = s.air ? Math.sin(s.airT / 0.8 * Math.PI) * 2 : 0;
    a.group.position.set(s.x, airLift, s.z);
    a.group.rotation.y = MODEL_YAW + s.vx * 0.05;
    const clipT = (s.elapsed * 0.7) % a.clipDuration;
    a.scrub(clipT);
    camTarget.current.set(s.x, airLift * 0.5, s.z);

    hudAcc.current += dt;
    if (hudAcc.current > 0.05) {
      hudAcc.current = 0;
      onHud({
        score: s.score, gates: s.gates, misses: s.misses, time: Math.ceil(s.time),
        combo: s.combo, msg: s.msgT > 0 ? s.msg : '', msgColor: s.msgColor, done: s.done,
      });
    }
  });

  return (
    <>
      <color attach="background" args={['#0a0a14']} />
      <fog attach="fog" args={['#0a0a14', 18, 50]} />
      <SceneLighting shadows variant="venice" />
      <FollowCamera
        target={camTarget}
        offset={orientation === 'portrait' ? new THREE.Vector3(2, 4, 10) : new THREE.Vector3(3, 3, 9)}
        lookHeight={1.2}
        stiffness={5}
        enableLook
      />
      {MAP && <MapMesh config={MAP} />}
      {gatePool.map((m, i) => <primitive key={i} object={m} />)}
      <DustMotes count={40} radius={12} color="#ccddff" speed={0.4} />
      <RimGlowPulse color="#00FF9D" position={[-5, 3, 0]} baseIntensity={12} pulseAmp={6} />
      <RimGlowPulse color="#00e5ff" position={[5, 2.5, 0]} baseIntensity={10} pulseAmp={5} />
      <TrailMesh meshRef={trailRef} color="#00FF9D" />
      <PerfSampler onSample={onPerf} />
      <Avatar
        url={MODEL_URL}
        subStartFrame={SUB_START}
        subEndFrame={SUB_END}
        clipFps={CLIP_FPS}
        onReady={(h) => { avatar.current = h; h.group.position.set(0, 0, 0); h.group.rotation.y = MODEL_YAW; h.scrub(0); }}
      />
    </>
  );
}

// ---------------------------------------------------------------- Main
export default function Snowboard3D(props: GameProps) {
  const orientation = useOrientation();
  const input = useRef({ steer: 0, trick: false });
  const [hud, setHud] = useState<HudState>({ score: 0, gates: 0, misses: 0, time: RIDE_TIME, combo: 0, msg: '', msgColor: '#FFD700', done: false });
  const [perf, setPerf] = useState<PerfSample | null>(null);
  const showPerf = useShowPerf();
  const grade = perf ? gradePerf(perf) : null;
  const endedRef = useRef(false);

  useEffect(() => {
    if (hud.done && !endedRef.current) {
      endedRef.current = true;
      const won = hud.score >= 1500;
      setTimeout(() => {
        props.onEnd({ won, score: hud.score, duration: 90, headline: won ? 'GOLD RUN' : hud.misses >= 5 ? 'CRASHED OUT' : 'TIME UP' });
      }, 1200);
    }
  }, [hud.done, hud.score, hud.misses, props]);

  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') input.current.steer = -1;
      else if (e.key === 'ArrowRight') input.current.steer = 1;
      else if (e.key === ' ') { e.preventDefault(); input.current.trick = true; }
    };
    const ku = (e: KeyboardEvent) => {
      if ((e.key === 'ArrowLeft' && input.current.steer === -1) || (e.key === 'ArrowRight' && input.current.steer === 1)) input.current.steer = 0;
    };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
  }, []);

  return (
    <div className="select-none">
      <div
        className="relative mx-auto w-full overflow-hidden rounded-xl border border-white/5 shadow-[0_0_60px_rgba(0,229,255,0.06)]"
        style={{
          aspectRatio: orientation === 'portrait' ? '3 / 4' : '16 / 9',
          maxWidth: orientation === 'portrait' ? 560 : 960,
          background: 'linear-gradient(180deg, #07070c 0%, #0a0a14 100%)',
        }}
      >
        <Canvas
          shadows
          dpr={[PERF_BUDGET.dprMin, PERF_BUDGET.dprMax]}
          gl={{ antialias: true, powerPreference: 'high-performance', alpha: false, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1 }}
          camera={{ fov: orientation === 'portrait' ? 56 : 48, near: 0.1, far: 60, position: [3, 3, 9] }}
        >
          <PerformanceMonitor onDecline={() => {}}>
            <SlalomScene input={input} orientation={orientation} onHud={setHud} onPerf={setPerf} />
          </PerformanceMonitor>
        </Canvas>

        <PerfOverlay perf={perf} grade={grade} show={showPerf} />

        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded-lg border border-white/8 bg-black/70 px-5 py-2 text-center backdrop-blur-md">
            <div className="fel-heading text-[10px] tracking-[0.2em] text-white/50">SLALOM DESCENT</div>
            <div className="flex items-center justify-center gap-6 font-mono text-2xl font-bold">
              <span className="text-[#00E5FF]">{hud.score}</span>
              <span className="text-[10px] font-normal tracking-widest text-white/30">GATES {hud.gates} · MISS {hud.misses}/5 · {hud.time}s</span>
            </div>
          </div>
          {hud.combo > 1 && (
            <div className="absolute right-3 top-14 font-mono text-lg font-bold text-[#FFD700]">{hud.combo}x COMBO</div>
          )}
          {hud.msg && (
            <div className="absolute left-1/2 top-1/3 -translate-x-1/2 fel-heading text-3xl font-bold drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]" style={{ color: hud.msgColor }}>{hud.msg}</div>
          )}
          {hud.done && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <div className="text-center">
                <div className="fel-heading text-4xl font-bold" style={{ color: hud.misses >= 5 ? '#FF3366' : '#00FF9D' }}>
                  {hud.misses >= 5 ? 'CRASHED!' : 'FINISH!'}
                </div>
                <div className="mt-2 font-mono text-white/60">Score: {hud.score} · Gates: {hud.gates}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto mt-4 flex max-w-[960px] items-center justify-between gap-3 px-3 !hidden">
        <div className="flex gap-2">
          <button onTouchStart={() => { input.current.steer = -1; }} onTouchEnd={() => { input.current.steer = 0; }} onClick={() => {}} className="rounded-lg border border-[#00E5FF]/40 bg-[#00E5FF]/8 px-4 py-3 text-xs font-bold text-[#00E5FF]">◀</button>
          <button onTouchStart={() => { input.current.steer = 1; }} onTouchEnd={() => { input.current.steer = 0; }} onClick={() => {}} className="rounded-lg border border-[#00E5FF]/40 bg-[#00E5FF]/8 px-4 py-3 text-xs font-bold text-[#00E5FF]">▶</button>
        </div>
        <button onClick={() => { input.current.trick = true; }} className="rounded-lg border border-[#A855F7]/40 bg-[#A855F7]/8 px-6 py-3 text-xs font-bold text-[#A855F7]">TRICK</button>
      </div>
    </div>
  );
}