'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

// Warm temple-lit rig for the Shimogamo Dojo. Deep shadows, paper-lantern amber
// key light, cool moonlight fill through the shoji screens, and red shrine
// accents to match the baked-in map lighting.
export function DojoLighting({ shadows = true }: { shadows?: boolean }) {
  return (
    <>
      <hemisphereLight args={[0x554433, 0x0a0805, 0.4]} />
      {/* amber key — lantern glow from above-front */}
      <directionalLight
        position={[2, 9, 5]}
        intensity={2.1}
        color={0xffd9a0}
        castShadow={shadows}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={1}
        shadow-camera-far={25}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
        shadow-bias={-0.0003}
        shadow-normalBias={0.02}
      />
      {/* cool moon fill through screens */}
      <directionalLight position={[-6, 5, 3]} intensity={0.5} color={0x88aaff} />
      {/* red shrine accents */}
      <pointLight position={[-4, 3, -3]} intensity={18} distance={16} color={0xff3344} decay={2} />
      <pointLight position={[4, 3, -3]} intensity={18} distance={16} color={0xff5522} decay={2} />
      {/* warm floor uplight */}
      <pointLight position={[0, 0.3, 3]} intensity={7} distance={12} color={0xaa6633} decay={2} />
      <ambientLight intensity={0.09} color={0x332222} />
    </>
  );
}

// Fixed 2.5D fighting camera. Frames both combatants along the X axis while
// keeping a subtle parallax bob for life. Looks at the arena centre.
export function FightCamera({
  position = [0.6, 2.35, 7.6],
  target = [0, 1.3, 0.6],
}: {
  position?: [number, number, number];
  target?: [number, number, number];
}) {
  const camera = useThree((s) => s.camera);
  const tgt = useMemo(() => new THREE.Vector3(...target), [target]);
  const basePos = useMemo(() => new THREE.Vector3(...position), [position]);
  const t = useRef(0);

  useEffect(() => {
    camera.position.copy(basePos);
    camera.lookAt(tgt);
  }, [camera, basePos, tgt]);

  useFrame((_, dt) => {
    t.current += dt;
    camera.position.x = basePos.x + Math.sin(t.current * 0.4) * 0.15;
    camera.position.y = basePos.y + Math.sin(t.current * 0.6) * 0.06;
    camera.lookAt(tgt);
  });
  return null;
}

// Drifting incense embers — subtle warm particulate for atmosphere.
export function IncenseEmbers({ count = 40 }: { count?: number }) {
  const ref = useRef<THREE.Points>(null);
  const { positions, speeds } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 12;
      positions[i * 3 + 1] = Math.random() * 6;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 8 - 1;
      speeds[i] = 0.15 + Math.random() * 0.3;
    }
    return { positions, speeds };
  }, [count]);

  useFrame((_, dt) => {
    const pts = ref.current;
    if (!pts) return;
    const arr = pts.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < count; i++) {
      arr[i * 3 + 1] += speeds[i] * dt;
      if (arr[i * 3 + 1] > 6) arr[i * 3 + 1] = 0;
    }
    pts.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} count={count} />
      </bufferGeometry>
      <pointsMaterial size={0.05} color={0xffaa55} transparent opacity={0.5} sizeAttenuation depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}
