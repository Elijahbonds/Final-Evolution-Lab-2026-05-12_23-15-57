'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/* ================================================================
   Shared VFX library for all FEL 3D modes.
   Each component is lightweight (no external deps) and designed
   for the premium-dark aesthetic.
   ================================================================ */

// ------- Floating Dust / Ambient Motes -------
export function DustMotes({ count = 60, radius = 12, color = '#ffffff', speed = 0.3, opacity = 0.25 }: {
  count?: number; radius?: number; color?: string; speed?: number; opacity?: number;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const data = useMemo(() => {
    const arr = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      arr[i * 4] = (Math.random() - 0.5) * radius;
      arr[i * 4 + 1] = Math.random() * 6;
      arr[i * 4 + 2] = (Math.random() - 0.5) * radius;
      arr[i * 4 + 3] = Math.random() * Math.PI * 2; // phase
    }
    return arr;
  }, [count, radius]);

  useFrame(({ clock }) => {
    const m = ref.current;
    if (!m) return;
    const t = clock.elapsedTime * speed;
    for (let i = 0; i < count; i++) {
      const px = data[i * 4], py = data[i * 4 + 1], pz = data[i * 4 + 2], ph = data[i * 4 + 3];
      dummy.position.set(
        px + Math.sin(t + ph) * 0.4,
        (py + t * 0.3) % 7,
        pz + Math.cos(t * 0.7 + ph) * 0.3
      );
      dummy.scale.setScalar(0.015 + Math.sin(t * 2 + ph) * 0.008);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={ref} args={[undefined as any, undefined as any, count]}>
      <sphereGeometry args={[1, 4, 4]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} toneMapped={false} />
    </instancedMesh>
  );
}

// ------- Impact Flash (point burst) -------
export function useImpactFlash() {
  const ref = useRef<THREE.PointLight>(null);
  const state = useRef({ active: false, t: 0, dur: 0.15, intensity: 0, color: new THREE.Color() });

  const trigger = (pos: THREE.Vector3, color = '#ffd700', intensity = 60, duration = 0.15) => {
    const s = state.current;
    s.active = true;
    s.t = 0;
    s.dur = duration;
    s.intensity = intensity;
    s.color.set(color);
    if (ref.current) {
      ref.current.position.copy(pos);
      ref.current.color.copy(s.color);
    }
  };

  useFrame((_, dt) => {
    const s = state.current;
    const l = ref.current;
    if (!l) return;
    if (!s.active) { l.intensity = 0; return; }
    s.t += dt;
    const p = Math.min(s.t / s.dur, 1);
    l.intensity = s.intensity * (1 - p * p); // quadratic falloff
    if (p >= 1) s.active = false;
  });

  return { ref, trigger };
}

// Flash light element (add to scene)
export function ImpactFlashLight({ lightRef }: { lightRef: React.RefObject<THREE.PointLight> }) {
  return <pointLight ref={lightRef} intensity={0} distance={8} decay={2} />;
}

// ------- Rim Glow Pulse (ambient neon throb) -------
export function RimGlowPulse({ color = '#00e5ff', position, baseIntensity = 15, pulseAmp = 8, pulseSpeed = 1.5, distance = 18 }: {
  color?: string; position: [number, number, number]; baseIntensity?: number; pulseAmp?: number; pulseSpeed?: number; distance?: number;
}) {
  const ref = useRef<THREE.PointLight>(null);
  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.intensity = baseIntensity + Math.sin(clock.elapsedTime * pulseSpeed) * pulseAmp;
    }
  });
  return <pointLight ref={ref} position={position} color={color} intensity={baseIntensity} distance={distance} decay={2} />;
}

// ------- Trail Particles (follow a moving object) -------
export function useTrailParticles(count = 16) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const particles = useRef<{ pos: THREE.Vector3; vel: THREE.Vector3; life: number; maxLife: number }[]>([]);

  const emit = (pos: THREE.Vector3, vel?: THREE.Vector3, color?: string) => {
    const p = {
      pos: pos.clone(),
      vel: vel?.clone() ?? new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 2 + 1, (Math.random() - 0.5) * 2),
      life: 0,
      maxLife: 0.3 + Math.random() * 0.3,
    };
    if (particles.current.length >= count) particles.current.shift();
    particles.current.push(p);
  };

  useFrame((_, dt) => {
    const m = ref.current;
    if (!m) return;
    const arr = particles.current;
    for (let i = arr.length - 1; i >= 0; i--) {
      const p = arr[i];
      p.life += dt;
      if (p.life >= p.maxLife) { arr.splice(i, 1); continue; }
      p.pos.addScaledVector(p.vel, dt);
      p.vel.y -= 6 * dt; // gravity
    }
    for (let i = 0; i < count; i++) {
      if (i < arr.length) {
        const p = arr[i];
        const t = p.life / p.maxLife;
        dummy.position.copy(p.pos);
        dummy.scale.setScalar(0.04 * (1 - t));
        dummy.updateMatrix();
        m.setMatrixAt(i, dummy.matrix);
      } else {
        dummy.position.set(0, -100, 0);
        dummy.scale.setScalar(0);
        dummy.updateMatrix();
        m.setMatrixAt(i, dummy.matrix);
      }
    }
    m.instanceMatrix.needsUpdate = true;
  });

  return { ref, emit };
}

export function TrailMesh({ meshRef, color = '#ffd700' }: { meshRef: React.RefObject<THREE.InstancedMesh>; color?: string }) {
  return (
    <instancedMesh ref={meshRef} args={[undefined as any, undefined as any, 16]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial color={color} transparent opacity={0.8} toneMapped={false} />
    </instancedMesh>
  );
}

// ------- Screen Shake (camera jitter) -------
export function useScreenShake() {
  const state = useRef({ active: false, t: 0, dur: 0.2, magnitude: 0.05 });
  const trigger = (magnitude = 0.05, duration = 0.2) => {
    state.current = { active: true, t: 0, dur: duration, magnitude };
  };
  // Apply in useFrame by calling getOffset()
  const getOffset = (dt: number): [number, number] => {
    const s = state.current;
    if (!s.active) return [0, 0];
    s.t += dt;
    if (s.t >= s.dur) { s.active = false; return [0, 0]; }
    const decay = 1 - s.t / s.dur;
    return [
      (Math.random() - 0.5) * s.magnitude * decay,
      (Math.random() - 0.5) * s.magnitude * decay,
    ];
  };
  return { trigger, getOffset };
}
