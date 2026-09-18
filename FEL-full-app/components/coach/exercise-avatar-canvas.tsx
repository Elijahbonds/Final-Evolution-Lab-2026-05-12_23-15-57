'use client';

// ExerciseAvatarCanvas (M34) — the "YOUR AVATAR" demo tab. Reuses the real R3F
// hero rig (components/three/avatar) so the learner sees their own athlete move,
// not a stock clip. There is no per-exercise gym mocap in the shipped rig, so we
// loop a representative athletic clip chosen from the exercise's target stat
// (honest: a motion cue, not a claim of exact rep-by-rep capture). Loaded via
// next/dynamic ssr:false from exercise-demo, so three.js never touches SSR.

import { Suspense, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { Avatar, type AvatarHandle } from '@/components/three/avatar';
import { SceneLighting } from '@/components/three/lighting';

const MODEL_URL = '/models/elijah.glb';

/** Map a PRQ target stat to a loopable athletic clip that reads as that quality. */
export function clipForStat(stat: string): string {
  const s = (stat || '').toLowerCase();
  if (s.includes('power') || s.includes('strength')) return 'jump_up';       // plyometric hop loop
  if (s.includes('speed') || s.includes('endurance') || s.includes('agility')) return 'run_forward';
  return 'idle_stand';
}

export default function ExerciseAvatarCanvas({ stat }: { stat: string }) {
  const avatar = useRef<AvatarHandle | null>(null);
  const clip = clipForStat(stat);

  return (
    <div className="aspect-video w-full bg-gradient-to-b from-[#0b0b12] to-[#05050a]">
      <Canvas
        dpr={[1, 1.5]}
        camera={{ position: [0, 1.4, 3.4], fov: 42 }}
        gl={{ antialias: true, alpha: false }}
        onCreated={({ scene }) => { scene.background = new THREE.Color('#07070d'); }}
      >
        <SceneLighting shadows={false} variant="venice" />
        <Suspense fallback={null}>
          <Avatar
            url={MODEL_URL}
            onReady={(h) => {
              avatar.current = h;
              h.group.position.set(0, 0, 0);
              h.group.rotation.y = Math.PI * 0.08;
              const chosen = h.clipNames.includes(clip) ? clip : (h.clipNames[0] ?? '');
              if (chosen) h.play(chosen, { loop: true, timeScale: 1 });
            }}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
