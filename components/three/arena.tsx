'use client';

import { Suspense, useCallback, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import * as THREE from 'three';
import { MapMesh } from './map-loader';
import { SceneLighting } from './lighting';
import { FollowCamera } from './follow-camera';
import { PerfSampler } from './perf-hud';
import { useOrientation } from './orientation';
import { PERF_BUDGET, gradePerf, type PerfSample } from '@/lib/three-budget';
import type { MapConfig } from '@/lib/map-data';

/**
 * Reusable 3D Arena — renders a Meshy map GLB + premium lighting + follow-cam
 * + performance monitoring. Game modes drop their gameplay logic inside as children.
 *
 * Usage:
 * <Arena map={mapConfig} playerTarget={playerPosRef}>
 *   <Avatar ... />
 *   <YourGameplayLogic />
 * </Arena>
 */
export function Arena({
  map,
  playerTarget,
  children,
  hudOverlay,
  showPerf = false,
}: {
  map: MapConfig;
  playerTarget: React.MutableRefObject<THREE.Vector3>;
  children: React.ReactNode;
  hudOverlay?: React.ReactNode;
  showPerf?: boolean;
}) {
  const orient = useOrientation();
  const [dpr, setDpr] = useState(1.5);
  const [perf, setPerf] = useState<PerfSample | null>(null);

  const camOffset = useMemo(
    () => new THREE.Vector3(...map.camOffset),
    [map.camOffset]
  );

  const fogColor = useMemo(() => new THREE.Color(map.fogColor), [map.fogColor]);

  const onIncline = useCallback(() => setDpr((d) => Math.min(d + 0.25, PERF_BUDGET.dprMax)), []);
  const onDecline = useCallback(() => setDpr((d) => Math.max(d - 0.25, PERF_BUDGET.dprMin)), []);

  const grade = perf ? gradePerf(perf) : null;

  return (
    <div className="relative w-full h-full" style={{ background: map.fogColor }}>
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
          fov: orient === 'portrait' ? 65 : 55,
          near: 0.1,
          far: 200,
          position: [
            map.spawnPos[0] + map.camOffset[0],
            map.spawnPos[1] + map.camOffset[1],
            map.spawnPos[2] + map.camOffset[2],
          ],
        }}
        scene={{ fog: new THREE.Fog(fogColor, map.fogNear, map.fogFar) }}
      >
        <PerformanceMonitor onIncline={onIncline} onDecline={onDecline}>
          <SceneLighting />
          <Suspense fallback={null}>
            <MapMesh config={map} />
          </Suspense>
          {children}
          <FollowCamera
            target={playerTarget}
            offset={camOffset}
            lookHeight={1.4}
            stiffness={5}
            boundsMin={new THREE.Vector3(...map.boundsMin)}
            boundsMax={new THREE.Vector3(...map.boundsMax)}
            floorY={map.floorY}
            ceilingY={map.ceilingY}
          />
          <PerfSampler onSample={setPerf} />
        </PerformanceMonitor>
      </Canvas>

      {/* HUD overlay from game mode */}
      {hudOverlay}

      {/* Perf badge (toggle with 'p' key) */}
      {showPerf && perf && grade && (
        <div
          className="absolute bottom-2 left-2 px-2 py-1 rounded text-xs font-mono"
          style={{
            background: 'rgba(0,0,0,0.7)',
            color:
              grade.status === 'ok'
                ? '#00FF9D'
                : grade.status === 'warn'
                ? '#FFD700'
                : '#FF3366',
            backdropFilter: 'blur(4px)',
          }}
        >
          {perf.fps}fps · {perf.triangles.toLocaleString()} tris · {perf.calls} draws
          {grade.notes.length > 0 && (
            <span className="ml-1 opacity-70">⚠ {grade.notes[0]}</span>
          )}
        </div>
      )}
    </div>
  );
}
