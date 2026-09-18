'use client';

import { Suspense, useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import * as THREE from 'three';
import { MapMesh } from '@/components/three/map-loader';
import { SceneLighting } from '@/components/three/lighting';
import { PerfSampler } from '@/components/three/perf-hud';
import { Avatar, type AvatarHandle } from '@/components/three/avatar';
import { FollowCamera } from '@/components/three/follow-camera';
import { PERF_BUDGET, gradePerf, type PerfSample } from '@/lib/three-budget';
import { MAPS, type MapConfig } from '@/lib/map-data';

const MODEL_URL = '/models/elijah.glb';
const MODEL_YAW = Math.PI;
const SUB_START = 488;
const SUB_END = 582;
const CLIP_FPS = 30;

function WalkingAvatar({
  config,
  posRef,
}: {
  config: MapConfig;
  posRef: React.MutableRefObject<THREE.Vector3>;
}) {
  const avatarRef = useRef<AvatarHandle | null>(null);

  useEffect(() => {
    posRef.current.set(...config.spawnPos);
  }, [config, posRef]);

  // Simple idle animation
  useFrame((_, dt) => {
    if (avatarRef.current?.action) {
      avatarRef.current.mixer.update(dt);
    }
  });

  return (
    <Avatar
      url={MODEL_URL}
      subStartFrame={SUB_START}
      subEndFrame={SUB_END}
      clipFps={CLIP_FPS}
      onReady={(h) => {
        avatarRef.current = h;
        h.group.rotation.y = config.spawnYaw;
        h.group.position.set(...config.spawnPos);
        if (h.action) {
          h.action.setLoop(THREE.LoopRepeat, Infinity);
          h.action.timeScale = 0.3;
          h.action.play();
        }
      }}
    />
  );
}

function MapScene({
  config,
  onPerf,
}: {
  config: MapConfig;
  onPerf: (s: PerfSample) => void;
}) {
  const [dpr, setDpr] = useState(1.5);
  const playerPos = useRef(new THREE.Vector3(...config.spawnPos));
  const fogColor = useMemo(() => new THREE.Color(config.fogColor), [config.fogColor]);
  const camOffset = useMemo(() => new THREE.Vector3(...config.camOffset), [config.camOffset]);

  const onIncline = useCallback(() => setDpr((d) => Math.min(d + 0.25, PERF_BUDGET.dprMax)), []);
  const onDecline = useCallback(() => setDpr((d) => Math.max(d - 0.25, PERF_BUDGET.dprMin)), []);

  return (
    <Canvas
      dpr={dpr}
      shadows
      gl={{
        antialias: true,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.1,
        powerPreference: 'high-performance',
      }}
      camera={{
        fov: 55,
        near: 0.1,
        far: 200,
        position: [
          config.spawnPos[0] + config.camOffset[0],
          config.spawnPos[1] + config.camOffset[1],
          config.spawnPos[2] + config.camOffset[2],
        ],
      }}
      scene={{ fog: new THREE.Fog(fogColor, config.fogNear, config.fogFar) }}
    >
      <PerformanceMonitor onIncline={onIncline} onDecline={onDecline}>
        <SceneLighting />
        <Suspense fallback={null}>
          <MapMesh config={config} />
          <WalkingAvatar config={config} posRef={playerPos} />
        </Suspense>
        <FollowCamera
          target={playerPos}
          offset={camOffset}
          lookHeight={1.4}
          stiffness={5}
          boundsMin={new THREE.Vector3(...config.boundsMin)}
          boundsMax={new THREE.Vector3(...config.boundsMax)}
          floorY={config.floorY}
          ceilingY={config.ceilingY}
        />
        <PerfSampler onSample={onPerf} />
      </PerformanceMonitor>
    </Canvas>
  );
}

export default function MapPreviewClient() {
  const mapKeys = Object.keys(MAPS);
  const [activeMap, setActiveMap] = useState(mapKeys[0]);
  const [perf, setPerf] = useState<PerfSample | null>(null);

  const config = MAPS[activeMap];
  const grade = perf ? gradePerf(perf) : null;

  return (
    <div className="fixed inset-0 flex flex-col" style={{ background: '#050505' }}>
      {/* Map selector */}
      <div className="flex items-center gap-2 p-3 bg-black/80 border-b border-white/10 z-10">
        <span className="text-xs text-white/50 font-mono uppercase tracking-wider">Map Preview</span>
        <div className="flex gap-1 ml-4">
          {mapKeys.map((k) => (
            <button
              key={k}
              onClick={() => { setActiveMap(k); setPerf(null); }}
              className={`px-3 py-1.5 text-xs font-mono rounded transition-all ${
                k === activeMap
                  ? 'bg-[#00E5FF]/20 text-[#00E5FF] ring-1 ring-[#00E5FF]/50'
                  : 'text-white/50 hover:text-white/80 hover:bg-white/5'
              }`}
            >
              {MAPS[k].label}
            </button>
          ))}
        </div>
      </div>

      {/* 3D viewport */}
      <div className="flex-1 relative">
        <MapScene key={activeMap} config={config} onPerf={setPerf} />

        {/* Perf overlay */}
        {perf && grade && (
          <div
            className="absolute bottom-3 left-3 px-3 py-2 rounded-lg text-xs font-mono"
            style={{
              background: 'rgba(0,0,0,0.8)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,0.1)',
              color:
                grade.status === 'ok'
                  ? '#00FF9D'
                  : grade.status === 'warn'
                  ? '#FFD700'
                  : '#FF3366',
            }}
          >
            <div className="text-white/70 mb-1">{config.label} — Performance Report</div>
            <div>
              {perf.fps} FPS · {perf.triangles.toLocaleString()} tris · {perf.calls} draw calls · {perf.textures} tex · {perf.geometries} geo
            </div>
            {grade.notes.length > 0 && (
              <div className="mt-1 text-yellow-400/80">
                {grade.notes.map((n, i) => (
                  <div key={i}>⚠ {n}</div>
                ))}
              </div>
            )}
            <div className="mt-1 text-white/40">
              Budget: {PERF_BUDGET.targetFps}fps target · {PERF_BUDGET.floorFps}fps floor · {PERF_BUDGET.maxTriangles.toLocaleString()} max tris · {PERF_BUDGET.maxDrawCalls} max draws
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
