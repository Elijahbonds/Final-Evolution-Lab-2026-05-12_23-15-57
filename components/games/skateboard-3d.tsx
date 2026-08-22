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
import { DustMotes, RimGlowPulse, useTrailParticles, TrailMesh } from '@/components/three/effects';
import { PerfSampler, PerfOverlay, useShowPerf } from '@/components/three/perf-hud';
import { useOrientation } from '@/components/three/orientation';
import { PERF_BUDGET, gradePerf, type PerfSample } from '@/lib/three-budget';

const MODEL_URL = '/models/elijah.glb';
const MAP = MAPS['venice-skatepark'];
const SUB_START = 488, SUB_END = 582, CLIP_FPS = 30;
const MODEL_YAW = Math.PI;

const LANE_W = 3;
const LANES = [-LANE_W, 0, LANE_W];
const TRICK_NAMES = ['KICKFLIP', 'HEELFLIP', '360 FLIP', 'GRAB'];
const TRICK_COLORS = ['#00E5FF', '#00FF9D', '#A855F7', '#FFD700'];
const TRICK_PTS = [100, 100, 200, 120];
const RUN_TIME = 120;

interface Note { z: number; lane: number; hit: boolean; }
interface HudState {
  score: number; combo: number; time: number; msg: string; msgColor: string; bail: boolean;
}

// ---------------------------------------------------------------- Scene
function SkateScene({
  input, orientation, onHud, onPerf,
}: {
  input: React.RefObject<{ lane: number; trickIdx: number }>;
  orientation: string;
  onHud: (h: HudState) => void;
  onPerf: (s: PerfSample) => void;
}) {
  const avatar = useRef<AvatarHandle | null>(null);
  const camTarget = useRef(new THREE.Vector3(0, 0, 0));
  const { ref: trailRef, emit: emitTrail } = useTrailParticles(20);

  // Game state
  const st = useRef({
    time: RUN_TIME, score: 0, combo: 0, bestCombo: 0,
    notes: [] as Note[], spawnT: 1.2, noteSpeed: 8,
    playerX: 0, targetX: 0, playerZ: 0,
    msg: '', msgT: 0, msgColor: '#FFD700',
    bail: false, bailT: 0, misses: 0,
    grindHold: false, grindScore: 0,
    elapsed: 0, lastTrick: -1,
  });
  const hudAcc = useRef(0);

  // Note markers
  const noteRefs = useRef<THREE.Mesh[]>([]);
  const notePool = useMemo(() => {
    const arr: THREE.Mesh[] = [];
    for (let i = 0; i < 12; i++) {
      const g = new THREE.BoxGeometry(0.8, 0.15, 0.8);
      const m = new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.7 });
      const mesh = new THREE.Mesh(g, m);
      mesh.visible = false;
      arr.push(mesh);
    }
    noteRefs.current = arr;
    return arr;
  }, []);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const s = st.current;
    const a = avatar.current;
    if (!a || s.bail) return;

    s.elapsed += dt;
    s.time = Math.max(0, RUN_TIME - s.elapsed);

    // Spawn notes
    s.spawnT -= dt;
    if (s.spawnT <= 0) {
      const lane = Math.floor(Math.random() * 4);
      s.notes.push({ z: s.playerZ - 30, lane, hit: false });
      s.spawnT = 1.0 + Math.random() * 0.8;
    }

    // Move player forward
    s.playerZ -= s.noteSpeed * dt;

    // Steer to lane
    const inp = input.current;
    if (!inp) return;
    s.targetX = LANES[Math.min(2, Math.max(0, inp.lane))] ?? 0;
    s.playerX += (s.targetX - s.playerX) * Math.min(1, 12 * dt);

    // Check trick input
    if (inp.trickIdx >= 0) {
      const ti = inp.trickIdx;
      inp.trickIdx = -1;
      // Find closest unhit note in range
      const hitZ = s.playerZ;
      let best: Note | null = null;
      let bestDist = 3;
      for (const n of s.notes) {
        if (n.hit) continue;
        const dz = Math.abs(n.z - hitZ);
        if (dz < bestDist && n.lane === ti) {
          best = n;
          bestDist = dz;
        }
      }
      if (best) {
        best.hit = true;
        const pts = TRICK_PTS[ti] * (1 + s.combo * 0.1);
        s.score += Math.round(pts);
        s.combo++;
        if (s.combo > s.bestCombo) s.bestCombo = s.combo;
        s.msg = TRICK_NAMES[ti];
        s.msgColor = TRICK_COLORS[ti];
        s.msgT = 0.8;
        emitTrail(new THREE.Vector3(s.playerX, 0.5, s.playerZ));
      } else {
        s.misses++;
        s.combo = 0;
        if (s.misses >= 3) { s.bail = true; s.bailT = 2; }
      }
    }

    // Clean old notes
    s.notes = s.notes.filter(n => n.z > s.playerZ - 2);

    // Update note visuals
    for (let i = 0; i < notePool.length; i++) {
      const mesh = notePool[i];
      if (i < s.notes.length && !s.notes[i].hit) {
        const n = s.notes[i];
        mesh.visible = true;
        mesh.position.set(LANES[Math.min(2, n.lane)] ?? 0, 0.1, n.z);
        (mesh.material as THREE.MeshBasicMaterial).color.set(TRICK_COLORS[n.lane] ?? '#ffffff');
      } else {
        mesh.visible = false;
      }
    }

    // Message timer
    if (s.msgT > 0) s.msgT -= dt;

    // Avatar position
    a.group.position.set(s.playerX, 0, s.playerZ);
    a.group.rotation.y = MODEL_YAW;
    const clipT = (s.elapsed * 0.8) % a.clipDuration;
    a.scrub(clipT);

    camTarget.current.set(s.playerX, 0, s.playerZ);

    // End condition
    if (s.time <= 0) {
      s.bail = true;
      s.bailT = 0;
    }

    // HUD
    hudAcc.current += dt;
    if (hudAcc.current > 0.05) {
      hudAcc.current = 0;
      onHud({
        score: s.score, combo: s.combo, time: Math.ceil(s.time),
        msg: s.msgT > 0 ? s.msg : '', msgColor: s.msgColor, bail: s.bail,
      });
    }
  });

  return (
    <>
      <color attach="background" args={['#0a0812']} />
      <fog attach="fog" args={['#0a0812', 24, 72]} />
      <SceneLighting shadows variant="skatepark" />
      <FollowCamera
        target={camTarget}
        offset={orientation === 'portrait' ? new THREE.Vector3(2.5, 3.6, 9.5) : new THREE.Vector3(3.5, 3.2, 8.5)}
        lookHeight={1.1}
        stiffness={5}
        enableLook
      />
      {MAP && <MapMesh config={MAP} />}
      <DustMotes count={40} radius={12} speed={0.3} />
      <RimGlowPulse color="#A855F7" position={[-8, 3.5, -3]} baseIntensity={12} pulseAmp={6} />
      <RimGlowPulse color="#00e5ff" position={[8, 3, 2]} baseIntensity={10} pulseAmp={5} />
      {notePool.map((m, i) => <primitive key={i} object={m} />)}
      <TrailMesh meshRef={trailRef} color="#00e5ff" />
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
export default function Skateboard3D(props: GameProps) {
  const [started] = useState(true);
  const orientation = useOrientation();
  const input = useRef({ lane: 1, trickIdx: -1 });
  const [hud, setHud] = useState<HudState>({ score: 0, combo: 0, time: RUN_TIME, msg: '', msgColor: '#FFD700', bail: false });
  const [perf, setPerf] = useState<PerfSample | null>(null);
  const showPerf = useShowPerf();
  const grade = perf ? gradePerf(perf) : null;
  const endedRef = useRef(false);

  // End game
  useEffect(() => {
    if (hud.bail && !endedRef.current) {
      endedRef.current = true;
      const won = hud.score >= 2000;
      setTimeout(() => {
        props.onEnd({ won, score: hud.score, duration: 120, headline: won ? 'LEGENDARY RUN' : 'BAILED' });
      }, 1200);
    }
  }, [hud.bail, hud.score, props]);

  // Keyboard
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') input.current.lane = Math.max(0, input.current.lane - 1);
      else if (e.key === 'ArrowRight') input.current.lane = Math.min(2, input.current.lane + 1);
      else if (e.key === 'ArrowUp') input.current.trickIdx = 1;
      else if (e.key === 'ArrowDown') input.current.trickIdx = 3;
      else if (e.key === ' ') { e.preventDefault(); input.current.trickIdx = 0; }
      else if (e.key.toLowerCase() === 'z') input.current.trickIdx = 2;
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
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
        {started && (
          <Canvas
            shadows
            dpr={[PERF_BUDGET.dprMin, PERF_BUDGET.dprMax]}
            gl={{ antialias: true, powerPreference: 'high-performance', alpha: false, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1 }}
            camera={{ fov: orientation === 'portrait' ? 56 : 48, near: 0.1, far: 60, position: [3, 2.5, 7] }}
          >
            <PerformanceMonitor onDecline={() => {}}>
              <SkateScene input={input} orientation={orientation} onHud={setHud} onPerf={setPerf} />
            </PerformanceMonitor>
          </Canvas>
        )}

        <PerfOverlay perf={perf} grade={grade} show={showPerf} />

        {/* HUD */}
        {started && (
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded-lg border border-white/8 bg-black/70 px-5 py-2 text-center backdrop-blur-md">
              <div className="fel-heading text-[10px] tracking-[0.2em] text-white/50">SKATE RUN</div>
              <div className="flex items-center justify-center gap-6 font-mono text-2xl font-bold">
                <span className="text-[#00E5FF]">{hud.score}</span>
                <span className="text-[10px] font-normal tracking-widest text-white/30">TIME {hud.time}s</span>
              </div>
            </div>
            {hud.combo > 1 && (
              <div className="absolute right-3 top-14 font-mono text-lg font-bold text-[#FFD700]">
                {hud.combo}x COMBO
              </div>
            )}
            {hud.msg && (
              <div className="absolute left-1/2 top-1/3 -translate-x-1/2 fel-heading text-3xl font-bold drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]" style={{ color: hud.msgColor }}>
                {hud.msg}
              </div>
            )}
            {hud.bail && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <div className="text-center">
                  <div className="fel-heading text-4xl font-bold text-[#FF3366]">BAILED!</div>
                  <div className="mt-2 font-mono text-white/60">Final Score: {hud.score}</div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Mobile controls */}
      {started && (
        <div className="mx-auto mt-4 flex max-w-[960px] items-center justify-between gap-3 px-3 !hidden">
          <div className="flex gap-2">
            <button onClick={() => { input.current.lane = Math.max(0, input.current.lane - 1); }} className="rounded-lg border border-[#00E5FF]/40 bg-[#00E5FF]/8 px-3.5 py-2.5 text-xs font-bold text-[#00E5FF]">◀ LANE</button>
            <button onClick={() => { input.current.lane = Math.min(2, input.current.lane + 1); }} className="rounded-lg border border-[#00E5FF]/40 bg-[#00E5FF]/8 px-3.5 py-2.5 text-xs font-bold text-[#00E5FF]">LANE ▶</button>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { input.current.trickIdx = 0; }} className="rounded-lg border border-[#00E5FF]/40 bg-[#00E5FF]/8 px-3 py-2.5 text-xs font-bold text-[#00E5FF]">KICK</button>
            <button onClick={() => { input.current.trickIdx = 1; }} className="rounded-lg border border-[#00FF9D]/40 bg-[#00FF9D]/8 px-3 py-2.5 text-xs font-bold text-[#00FF9D]">HEEL</button>
            <button onClick={() => { input.current.trickIdx = 2; }} className="rounded-lg border border-[#A855F7]/40 bg-[#A855F7]/8 px-3 py-2.5 text-xs font-bold text-[#A855F7]">360</button>
            <button onClick={() => { input.current.trickIdx = 3; }} className="rounded-lg border border-[#FFD700]/40 bg-[#FFD700]/8 px-3 py-2.5 text-xs font-bold text-[#FFD700]">GRAB</button>
          </div>
        </div>
      )}
    </div>
  );
}