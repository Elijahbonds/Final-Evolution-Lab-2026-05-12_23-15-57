'use client';

/**
 * components/three/speed-lines.tsx
 *
 * SSX-style speed-line post effect: a clip-space fullscreen quad drawn last
 * (no postprocessing stack, no extra render target — mobile-Safari friendly).
 * Radial anime streaks fade in from the screen edges as `intensityRef`
 * approaches 1; `colorRef` lets boost turn them golden.
 *
 * Cost: one draw call, trivially cheap fragment shader, zero allocations.
 */

import React, { useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface SpeedLinesProps {
  /** 0..1 — scene writes this each frame from speed/boost state */
  intensityRef: MutableRefObject<number>;
  /** optional tint (defaults white; set gold on boost) */
  colorRef?: MutableRefObject<THREE.Color>;
}

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    // clip-space passthrough: geometry is already a fullscreen quad
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision mediump float;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uIntensity;
  uniform float uAspect;
  uniform vec3 uColor;

  float hash(float n) { return fract(sin(n) * 43758.5453123); }

  void main() {
    vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
    float r = length(p);
    float ang = atan(p.y, p.x);

    // 56 radial cells, each streak flickers on its own clock
    float cell = floor(ang / 6.28318 * 56.0);
    float seed = hash(cell * 7.13);
    float flicker = step(0.55, hash(cell + floor(uTime * (8.0 + seed * 10.0))));
    float streak = smoothstep(0.35, 0.98, fract(ang / 6.28318 * 56.0)) *
                   smoothstep(1.0, 0.42, fract(ang / 6.28318 * 56.0) + 0.4);

    // only near screen edges; racing inward with time
    float radial = smoothstep(0.34, 0.85, r + 0.08 * sin(uTime * 9.0 + seed * 6.28));
    float a = streak * flicker * radial * uIntensity * 0.55;
    if (a < 0.004) discard;
    gl_FragColor = vec4(uColor, a);
  }
`;

export function SpeedLines({ intensityRef, colorRef }: SpeedLinesProps) {
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uIntensity: { value: 0 },
      uAspect: { value: 16 / 9 },
      uColor: { value: new THREE.Color('#eaf6ff') },
    }),
    []
  );

  useFrame((state, dt) => {
    const mat = matRef.current;
    if (!mat) return;
    uniforms.uTime.value += dt;
    // damped follow so lines swell in rather than pop
    const target = Math.min(1, Math.max(0, intensityRef.current));
    uniforms.uIntensity.value += (target - uniforms.uIntensity.value) * Math.min(1, dt * 8);
    uniforms.uAspect.value = state.size.width / Math.max(1, state.size.height);
    if (colorRef?.current) uniforms.uColor.value.copy(colorRef.current);
  });

  return (
    <mesh frustumCulled={false} renderOrder={999}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={VERT}
        fragmentShader={FRAG}
        uniforms={uniforms}
        transparent
        depthTest={false}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </mesh>
  );
}

export default SpeedLines;
