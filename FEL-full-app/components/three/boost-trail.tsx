'use client';

/**
 * components/three/boost-trail.tsx
 *
 * SSX "Tricky" golden trail: a vertical ribbon streaming off the board while
 * boost burns. Fixed 48-segment ring history in preallocated Float32Arrays —
 * geometry is mutated in place, never rebuilt. One additive draw call.
 */

import React, { useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface BoostTrailProps {
  /** object the trail streams from (board/player group) */
  targetRef: MutableRefObject<THREE.Object3D | null>;
  /** 0..1 trail strength; 0 hides it (scene sets from BoostMeter) */
  intensityRef: MutableRefObject<number>;
  /** trail color — gold by default, hotter white-gold in TRICKY */
  color?: string;
  segments?: number;
  height?: number;
}

const _pos = new THREE.Vector3();

export function BoostTrail({
  targetRef,
  intensityRef,
  color = '#ffce54',
  segments = 48,
  height = 0.55,
}: BoostTrailProps) {
  const matRef = useRef<THREE.MeshBasicMaterial>(null);

  const { geometry, history } = useMemo(() => {
    // Two vertices per history point (bottom + top of the ribbon).
    const vertCount = segments * 2;
    const positions = new Float32Array(vertCount * 3);
    const colors = new Float32Array(vertCount * 3);
    const index: number[] = [];
    for (let i = 0; i < segments - 1; i++) {
      const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
      index.push(a, b, c, b, d, c);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setIndex(index);

    // Head-to-tail brightness gradient baked into vertex colors.
    const col = new THREE.Color(color);
    for (let i = 0; i < segments; i++) {
      const fade = Math.pow(1 - i / (segments - 1), 1.6);
      for (const v of [i * 2, i * 2 + 1]) {
        colors[v * 3] = col.r * fade;
        colors[v * 3 + 1] = col.g * fade;
        colors[v * 3 + 2] = col.b * fade;
      }
    }

    return {
      geometry: geo,
      history: new Float32Array(segments * 3), // world anchor per segment
    };
  }, [segments, color]);

  const initialized = useRef(false);

  useFrame(() => {
    const target = targetRef.current;
    const mat = matRef.current;
    if (!target || !mat) return;

    const intensity = Math.min(1, Math.max(0, intensityRef.current));
    mat.opacity = intensity * 0.85;
    mat.visible = intensity > 0.02;
    if (!mat.visible) { initialized.current = false; return; }

    target.getWorldPosition(_pos);

    if (!initialized.current) {
      for (let i = 0; i < segments; i++) {
        history[i * 3] = _pos.x;
        history[i * 3 + 1] = _pos.y;
        history[i * 3 + 2] = _pos.z;
      }
      initialized.current = true;
    }

    // Shift history back one slot (in place), write new head.
    history.copyWithin(3, 0, (segments - 1) * 3);
    history[0] = _pos.x;
    history[1] = _pos.y + 0.12;
    history[2] = _pos.z;

    const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    for (let i = 0; i < segments; i++) {
      const hx = history[i * 3], hy = history[i * 3 + 1], hz = history[i * 3 + 2];
      const taper = height * (1 - i / (segments - 1)) * (0.5 + intensity * 0.5);
      const b = i * 2 * 3, t = (i * 2 + 1) * 3;
      arr[b] = hx; arr[b + 1] = hy; arr[b + 2] = hz;
      arr[t] = hx; arr[t + 1] = hy + taper; arr[t + 2] = hz;
    }
    posAttr.needsUpdate = true;
  });

  return (
    <mesh geometry={geometry} frustumCulled={false} renderOrder={20}>
      <meshBasicMaterial
        ref={matRef}
        vertexColors
        transparent
        opacity={0}
        depthWrite={false}
        side={THREE.DoubleSide}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </mesh>
  );
}

export default BoostTrail;
