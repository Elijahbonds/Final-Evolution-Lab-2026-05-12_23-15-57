'use client';

/**
 * components/three/board-particles.tsx
 *
 * Instanced surface-particle system for the board lane: snow spray, water
 * wake, kickflip dust. ONE InstancedMesh, fixed capacity, Float32Array pools,
 * zero per-frame allocation (module-scope temps only).
 *
 * Replaces copilot VFXSystem's Canvas-2D DOM particle overlay: in-scene 3D
 * particles react to camera + lighting and cost one draw call.
 *
 * Budget: <= 160 instances, additive-free standard blending with alpha
 * fade baked into instance color; no lights touched.
 */

import React, {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export interface ParticleEmitHandle {
  /**
   * Emit a burst.
   * @param dirY vertical kick; horizontal spread is randomized around (dirX,dirZ)
   */
  emit(
    x: number, y: number, z: number,
    dirX: number, dirY: number, dirZ: number,
    count: number, spread: number, speed: number
  ): void;
}

interface BoardParticlesProps {
  capacity?: number;
  colorA?: string;
  colorB?: string;
  size?: number;
  gravity?: number;
  drag?: number;
  lifeSec?: number;
}

const _obj = new THREE.Object3D();
const _colA = new THREE.Color();
const _colB = new THREE.Color();
const _col = new THREE.Color();
const _camQuat = new THREE.Quaternion();

export const BoardParticles = forwardRef<ParticleEmitHandle, BoardParticlesProps>(
  function BoardParticles(
    {
      capacity = 160,
      colorA = '#ffffff',
      colorB = '#bae6fd',
      size = 0.09,
      gravity = 9,
      drag = 0.9,
      lifeSec = 0.7,
    },
    ref
  ) {
    const meshRef = useRef<THREE.InstancedMesh>(null);

    const pool = useMemo(() => {
      return {
        pos: new Float32Array(capacity * 3),
        vel: new Float32Array(capacity * 3),
        life: new Float32Array(capacity),      // seconds remaining; <=0 dead
        maxLife: new Float32Array(capacity),
        mix: new Float32Array(capacity),       // colorA<->colorB blend
        scale: new Float32Array(capacity),
        head: { i: 0 },
      };
    }, [capacity]);

    useImperativeHandle(
      ref,
      () => ({
        emit(x, y, z, dirX, dirY, dirZ, count, spread, speed) {
          for (let n = 0; n < count; n++) {
            const i = pool.head.i;
            pool.head.i = (i + 1) % capacity; // ring buffer: oldest recycled
            const i3 = i * 3;
            pool.pos[i3] = x;
            pool.pos[i3 + 1] = y;
            pool.pos[i3 + 2] = z;
            const rx = (Math.random() * 2 - 1) * spread;
            const rz = (Math.random() * 2 - 1) * spread;
            const s = speed * (0.6 + Math.random() * 0.7);
            pool.vel[i3] = (dirX + rx) * s;
            pool.vel[i3 + 1] = (dirY + Math.random() * 0.5) * s;
            pool.vel[i3 + 2] = (dirZ + rz) * s;
            const life = lifeSec * (0.65 + Math.random() * 0.7);
            pool.life[i] = life;
            pool.maxLife[i] = life;
            pool.mix[i] = Math.random();
            pool.scale[i] = 0.7 + Math.random() * 0.8;
          }
        },
      }),
      [pool, capacity, lifeSec]
    );

    useFrame((state, dt) => {
      const mesh = meshRef.current;
      if (!mesh) return;
      const step = Math.min(dt, 1 / 30);
      const dragK = Math.pow(drag, step * 60);
      state.camera.getWorldQuaternion(_camQuat);
      _colA.set(colorA);
      _colB.set(colorB);

      let alive = 0;
      for (let i = 0; i < capacity; i++) {
        if (pool.life[i] <= 0) continue;
        pool.life[i] -= step;
        if (pool.life[i] <= 0) continue;
        const i3 = i * 3;
        pool.vel[i3] *= dragK;
        pool.vel[i3 + 1] = pool.vel[i3 + 1] * dragK - gravity * step;
        pool.vel[i3 + 2] *= dragK;
        pool.pos[i3] += pool.vel[i3] * step;
        pool.pos[i3 + 1] += pool.vel[i3 + 1] * step;
        pool.pos[i3 + 2] += pool.vel[i3 + 2] * step;

        const a = pool.life[i] / pool.maxLife[i];
        _obj.position.set(pool.pos[i3], pool.pos[i3 + 1], pool.pos[i3 + 2]);
        _obj.quaternion.copy(_camQuat); // billboard
        const sc = size * pool.scale[i] * (0.5 + a * 0.8);
        _obj.scale.set(sc, sc, sc);
        _obj.updateMatrix();
        mesh.setMatrixAt(alive, _obj.matrix);
        // alpha baked into color against a dark scene (cheap fade, no sort)
        _col.copy(_colA).lerp(_colB, pool.mix[i]).multiplyScalar(a);
        mesh.setColorAt(alive, _col);
        alive++;
      }
      mesh.count = alive;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });

    return (
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, capacity]}
        frustumCulled={false}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          transparent
          opacity={0.85}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </instancedMesh>
    );
  }
);

export default BoardParticles;
