'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import * as THREE from 'three';
import type { GameProps } from '@/components/games/game-shell';
import { Avatar, type AvatarHandle } from '@/components/three/avatar';
import { SceneLighting } from '@/components/three/lighting';
import { FollowCamera } from '@/components/three/follow-camera';
import { MapMesh } from '@/components/three/map-loader';
import { MAPS } from '@/lib/map-data';
import { DustMotes, RimGlowPulse } from '@/components/three/effects';
import { PerfSampler, PerfOverlay, useShowPerf } from '@/components/three/perf-hud';
import { useOrientation } from '@/components/three/orientation';
import { PERF_BUDGET, gradePerf, type PerfSample } from '@/lib/three-budget';

const MODEL_URL = '/models/elijah.glb';
const MAP = MAPS['surf-break'];
const SUB_START = 488, SUB_END = 582, CLIP_FPS = 30;
const MODEL_YAW = Math.PI;
const RIDE_TIME = 90;
const COURT_HALF = 10;

interface HudState {
  score: number; flow: number; balance: number; time: number; combo: number;
  msg: string; msgColor: string; wipeout: boolean;
}

// ---------------------------------------------------------------- Scene
function SurfScene({
  input, orientation, onHud, onPerf,
}: {
  input: React.RefObject<{ steer: number; cutback: boolean }>;
  orientation: string;
  onHud: (h: HudState) => void;
  onPerf: (s: PerfSample) => void;
}) {
  const avatar = useRef<AvatarHandle | null>(null);
  const camTarget = useRef(new THREE.Vector3(0, 0, 0));

  const st = useRef({
    time: RIDE_TIME, score: 0, flow: 0, balance: 100, combo: 0,
    x: 0, z: 0, steer: 0,
    pocketX: 0, pocketT: 0, pocketW: 5,
    cutbackReady: false, cutbackT: 3 + Math.random() * 3,
    msg: '', msgT: 0, msgColor: '#FFD700',
    wipeout: false, elapsed: 0,
  });
  const hudAcc = useRef(0);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const s = st.current;
    const a = avatar.current;
    if (!a || s.wipeout) return;

    s.elapsed += dt;
    s.time = Math.max(0, RIDE_TIME - s.elapsed);
    s.z -= 6 * dt; // forward movement

    // Pocket sway
    s.pocketT += dt;
    s.pocketX = Math.sin(s.pocketT * 0.8) * 6;

    // Steer
    const inp = input.current;
    if (!inp) return;
    s.steer = inp.steer;
    s.x += s.steer * 8 * dt;
    s.x = THREE.MathUtils.clamp(s.x, -COURT_HALF, COURT_HALF);

    // Flow / balance
    const inPocket = Math.abs(s.x - s.pocketX) < s.pocketW;
    if (inPocket) {
      s.flow = Math.min(100, s.flow + 30 * dt);
      s.score += Math.round(20 * dt * (1 + s.combo * 0.05));
    } else {
      s.balance -= 25 * dt;
      s.flow = Math.max(0, s.flow - 15 * dt);
    }

    // Cutback prompt
    s.cutbackT -= dt;
    if (s.cutbackT <= 0 && !s.cutbackReady) {
      s.cutbackReady = true;
    }
    if (s.cutbackReady && inp.cutback) {
      inp.cutback = false;
      s.cutbackReady = false;
      s.cutbackT = 3 + Math.random() * 3;
      s.combo++;
      const pts = 150 * (1 + s.combo * 0.1);
      s.score += Math.round(pts);
      s.balance = Math.min(100, s.balance + 20);
      s.msg = `CUTBACK +${Math.round(pts)}`;
      s.msgColor = '#00FF9D';
      s.msgT = 0.8;
    } else if (inp.cutback) {
      inp.cutback = false;
    }

    // Wipeout
    if (s.balance <= 0 || s.time <= 0) {
      s.wipeout = true;
    }

    // Message timer
    if (s.msgT > 0) s.msgT -= dt;

    // Avatar
    a.group.position.set(s.x, 0, s.z);
    a.group.rotation.y = MODEL_YAW + s.steer * 0.3;
    const clipT = (s.elapsed * 0.6) % a.clipDuration;
    a.scrub(clipT);
    camTarget.current.set(s.x, 0, s.z);

    // HUD
    hudAcc.current += dt;
    if (hudAcc.current > 0.05) {
      hudAcc.current = 0;
      onHud({
        score: s.score, flow: Math.round(s.flow), balance: Math.round(s.balance),
        time: Math.ceil(s.time), combo: s.combo,
        msg: s.msgT > 0 ? s.msg : '', msgColor: s.msgColor, wipeout: s.wipeout,
      });
    }
  });

  // Pocket indicator
  const pocketRef = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const s = st.current;
    if (pocketRef.current) {
      pocketRef.current.position.set(s.pocketX, 0.02, s.z - 3);
    }
  });

  return (
    <>
      <color attach="background" args={['#0a0a14']} />
      <fog attach="fog" args={['#0a0a14', 18, 50]} />
      <SceneLighting shadows variant="venice" />
      <FollowCamera
        target={camTarget}
        offset={orientation === 'portrait' ? new THREE.Vector3(2, 3.5, 9) : new THREE.Vector3(3, 3, 8)}
        lookHeight={1.0}
        stiffness={4}
        enableLook
      />
      {MAP && <MapMesh config={MAP} />}
      {/* Pocket zone indicator */}
      <mesh ref={pocketRef} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[10, 3]} />
        <meshBasicMaterial color="#00FF9D" transparent opacity={0.08} />
      </mesh>
      <DustMotes count={40} radius={12} color="#aaddff" speed={0.3} />
      <RimGlowPulse color="#00e5ff" position={[-5, 3, 0]} baseIntensity={12} pulseAmp={6} />
      <RimGlowPulse color="#00FF9D" position={[5, 2.5, 0]} baseIntensity={10} pulseAmp={5} />
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
export default function Surf3D(props: GameProps) {
  const orientation = useOrientation();
  const input = useRef({ steer: 0, cutback: false });
  const [hud, setHud] = useState<HudState>({ score: 0, flow: 0, balance: 100, time: RIDE_TIME, combo: 0, msg: '', msgColor: '#FFD700', wipeout: false });
  const [perf, setPerf] = useState<PerfSample | null>(null);
  const showPerf = useShowPerf();
  const grade = perf ? gradePerf(perf) : null;
  const endedRef = useRef(false);

  useEffect(() => {
    if (hud.wipeout && !endedRef.current) {
      endedRef.current = true;
      const won = hud.score >= 800;
      setTimeout(() => {
        props.onEnd({ won, score: hud.score, duration: 90, headline: won ? 'EPIC RIDE' : 'WIPEOUT' });
      }, 1200);
    }
  }, [hud.wipeout, hud.score, props]);

  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') input.current.steer = -1;
      else if (e.key === 'ArrowRight') input.current.steer = 1;
      else if (e.key === ' ') { e.preventDefault(); input.current.cutback = true; }
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
          camera={{ fov: orientation === 'portrait' ? 56 : 48, near: 0.1, far: 60, position: [3, 3, 8] }}
        >
          <PerformanceMonitor onDecline={() => {}}>
            <SurfScene input={input} orientation={orientation} onHud={setHud} onPerf={setPerf} />
          </PerformanceMonitor>
        </Canvas>

        <PerfOverlay perf={perf} grade={grade} show={showPerf} />

        {/* HUD */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded-lg border border-white/8 bg-black/70 px-5 py-2 text-center backdrop-blur-md">
            <div className="fel-heading text-[10px] tracking-[0.2em] text-white/50">SURF BREAK</div>
            <div className="flex items-center justify-center gap-6 font-mono text-2xl font-bold">
              <span className="text-[#00E5FF]">{hud.score}</span>
              <span className="text-[10px] font-normal tracking-widest text-white/30">TIME {hud.time}s</span>
            </div>
          </div>
          {/* Balance bar */}
          <div className="absolute left-3 top-14 w-28">
            <div className="text-[9px] font-mono text-white/40 mb-0.5">BALANCE</div>
            <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${hud.balance}%`, background: hud.balance > 30 ? '#00FF9D' : '#FF3366' }} />
            </div>
          </div>
          {/* Flow */}
          <div className="absolute right-3 top-14 font-mono text-sm text-[#00FF9D]">
            FLOW {hud.flow}%{hud.combo > 1 && ` · ${hud.combo}x`}
          </div>
          {hud.msg && (
            <div className="absolute left-1/2 top-1/3 -translate-x-1/2 fel-heading text-3xl font-bold drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]" style={{ color: hud.msgColor }}>
              {hud.msg}
            </div>
          )}
          {hud.wipeout && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <div className="text-center">
                <div className="fel-heading text-4xl font-bold text-[#FF3366]">WIPEOUT!</div>
                <div className="mt-2 font-mono text-white/60">Final Score: {hud.score}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mobile controls */}
      <div className="mx-auto mt-4 flex max-w-[960px] items-center justify-between gap-3 px-3 !hidden">
        <div className="flex gap-2">
          <button onTouchStart={() => { input.current.steer = -1; }} onTouchEnd={() => { input.current.steer = 0; }} onClick={() => {}} className="rounded-lg border border-[#00E5FF]/40 bg-[#00E5FF]/8 px-4 py-3 text-xs font-bold text-[#00E5FF]">◀</button>
          <button onTouchStart={() => { input.current.steer = 1; }} onTouchEnd={() => { input.current.steer = 0; }} onClick={() => {}} className="rounded-lg border border-[#00E5FF]/40 bg-[#00E5FF]/8 px-4 py-3 text-xs font-bold text-[#00E5FF]">▶</button>
        </div>
        <button onClick={() => { input.current.cutback = true; }} className="rounded-lg border border-[#00FF9D]/40 bg-[#00FF9D]/8 px-6 py-3 text-xs font-bold text-[#00FF9D]">CUTBACK</button>
      </div>
    </div>
  );
}