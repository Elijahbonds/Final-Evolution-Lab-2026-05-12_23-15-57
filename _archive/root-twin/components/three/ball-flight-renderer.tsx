'use client';

/**
 * ball-flight-renderer.tsx — M8.1 shared ball-flight visibility module.
 *
 * THE fix from the July 2026 playtest: "the most important object in a
 * basketball game does not visibly travel from point A to point B."
 *
 * ONE module consumed by all four basketball modes (dunk-game-3d,
 * basketball-3d/one-v-one, three-point-3d, three-v-three-3d):
 *   1. GHOST TRAIL  — 7 trailing ghost frames from a ring buffer of recent
 *      positions (zero per-frame allocation), decreasing opacity + radius.
 *   2. ARC PATH     — faint dashed parabola from release to target while the
 *      ball is airborne, so the eye can anticipate.
 *   3. NET REACTION — animated net that deforms as a swish-ball passes
 *      THROUGH the rim on a made basket (never a hard despawn at the hoop).
 *
 * Rendering only — no gameplay-math changes. All feel constants are marked
 * // TUNE(elijah).
 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// ─────────────────────────── TUNE(elijah) ───────────────────────────
const GHOST_COUNT = 7;            // trailing ghost frames per airborne ball
const GHOST_BASE_OPACITY = 0.5;  // opacity of the closest ghost
const GHOST_FADE = 0.72;         // opacity multiplier per older ghost
const GHOST_SHRINK = 0.86;       // radius multiplier per older ghost
const ARC_SEGMENTS = 30;         // parabola resolution
const ARC_OPACITY = 0.3;         // anticipation-line opacity
const ARC_DASH = 0.16;           // dash length
const ARC_GAP = 0.12;            // gap length
const SWISH_DUR = 0.42;          // seconds for the through-rim drop
const NET_STRETCH = 1.9;         // net scaleY at peak deformation
// ─────────────────────────────────────────────────────────────────────

/**
 * Mutable state each mode holds in a ref. The mode updates these fields in
 * its own useFrame BEFORE the renderer's useFrame runs (renderer children
 * mount after, so their frame callbacks run later in the same tick).
 */
export interface BallFlightTracker {
  /** true on every frame the ball is airborne (shot flight OR pass). */
  airborne: boolean;
  /** release point of the current arc (for the anticipation line). */
  arcFrom: THREE.Vector3 | null;
  /** target point of the current arc. */
  arcTo: THREE.Vector3 | null;
  /** apex height added to the straight lerp (matches the mode's own arc). */
  arcApex: number;
  /** draw the dashed anticipation line (shots yes; short passes optional). */
  showArc: boolean;
}

export function createBallFlightTracker(): BallFlightTracker {
  return { airborne: false, arcFrom: null, arcTo: null, arcApex: 2.5, showArc: true };
}

/** Imperative handle for the animated net / through-rim swish ball. */
export interface NetHandle {
  _t: number;        // remaining swish time
  _active: boolean;
  swish(): void;     // call on a made basket
}

export function createNetHandle(): NetHandle {
  return {
    _t: 0,
    _active: false,
    swish() { this._t = SWISH_DUR; this._active = true; },
  };
}

// ───────────────────────── Ghost trail + arc ─────────────────────────
export function BallFlightRenderer({
  ballRef,
  tracker,
  radius = 0.12,
  color = 0xff6b35,
}: {
  ballRef: React.RefObject<THREE.Mesh>;
  tracker: React.MutableRefObject<BallFlightTracker>;
  radius?: number;
  color?: number;
}) {
  const ghostRefs = useRef<(THREE.Mesh | null)[]>([]);
  const ring = useMemo(
    () => Array.from({ length: GHOST_COUNT }, () => new THREE.Vector3()),
    [],
  );
  const head = useRef(0);
  const filled = useRef(0);

  // Dashed anticipation arc — built once, positions rewritten each frame.
  const arcLine = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(new Float32Array((ARC_SEGMENTS + 1) * 3), 3),
    );
    const m = new THREE.LineDashedMaterial({
      color,
      transparent: true,
      opacity: ARC_OPACITY,
      dashSize: ARC_DASH,
      gapSize: ARC_GAP,
      depthWrite: false,
    });
    const line = new THREE.Line(g, m);
    line.frustumCulled = false;
    line.visible = false;
    return line;
  }, [color]);

  useFrame(() => {
    const ball = ballRef.current;
    const t = tracker.current;
    if (!ball) return;
    const active = t.airborne && ball.visible;

    // ── Ghost trail ring buffer ──
    if (active) {
      if (filled.current === 0) {
        // seed all slots with the current pos so ghosts don't streak from origin
        for (let i = 0; i < GHOST_COUNT; i++) ring[i].copy(ball.position);
      }
      ring[head.current].copy(ball.position);
      head.current = (head.current + 1) % GHOST_COUNT;
      filled.current = Math.min(filled.current + 1, GHOST_COUNT);
    } else {
      filled.current = 0;
    }

    for (let i = 0; i < GHOST_COUNT; i++) {
      const m = ghostRefs.current[i];
      if (!m) continue;
      if (active && filled.current > i + 1) {
        const idx = (head.current - 2 - i + GHOST_COUNT * 2) % GHOST_COUNT;
        m.position.copy(ring[idx]);
        m.scale.setScalar(Math.pow(GHOST_SHRINK, i + 1));
        m.visible = true;
      } else {
        m.visible = false;
      }
    }

    // ── Anticipation arc ──
    if (active && t.showArc && t.arcFrom && t.arcTo) {
      const pos = arcLine.geometry.getAttribute('position') as THREE.BufferAttribute;
      const from = t.arcFrom, to = t.arcTo, apex = t.arcApex;
      for (let s = 0; s <= ARC_SEGMENTS; s++) {
        const u = s / ARC_SEGMENTS;
        pos.setXYZ(
          s,
          from.x + (to.x - from.x) * u,
          from.y + (to.y - from.y) * u + Math.sin(u * Math.PI) * apex,
          from.z + (to.z - from.z) * u,
        );
      }
      pos.needsUpdate = true;
      arcLine.computeLineDistances();
      arcLine.visible = true;
    } else {
      arcLine.visible = false;
    }
  });

  return (
    <group>
      {Array.from({ length: GHOST_COUNT }).map((_, i) => (
        <mesh key={i} ref={(el) => { ghostRefs.current[i] = el; }} visible={false} frustumCulled={false}>
          <sphereGeometry args={[radius, 16, 16]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={GHOST_BASE_OPACITY * Math.pow(GHOST_FADE, i + 1)}
            depthWrite={false}
          />
        </mesh>
      ))}
      <primitive object={arcLine} />
    </group>
  );
}

// ─────────────── Animated net + through-rim swish ball ───────────────
/**
 * Renders the hoop net at `position` (rim center) and, on swish(), deforms
 * the net downward while a small ball visibly drops THROUGH the rim.
 * Reused by all four modes via PremiumHoop's netHandle prop.
 */
export function AnimatedNet({
  handle,
  position = [0, 2.83, 0],
  color = 0xffffff,
  ballColor = 0xff6b35,
  ballRadius = 0.11,
}: {
  handle: React.MutableRefObject<NetHandle>;
  position?: [number, number, number];
  color?: number;
  ballColor?: number;
  ballRadius?: number;
}) {
  const netRef = useRef<THREE.Mesh>(null);
  const ballRef = useRef<THREE.Mesh>(null);

  useFrame((_, dtRaw) => {
    const h = handle.current;
    const net = netRef.current;
    const ball = ballRef.current;
    if (!net || !ball) return;
    const dt = Math.min(dtRaw, 0.05);

    if (h._active) {
      h._t -= dt;
      const prog = 1 - Math.max(0, h._t) / SWISH_DUR; // 0 → 1
      // Net deformation: quick stretch then settle (sine bell weighted early).
      const bell = Math.sin(Math.min(prog, 1) * Math.PI);
      net.scale.y = 1 + (NET_STRETCH - 1) * bell;
      net.position.y = position[1] - ((NET_STRETCH - 1) * 0.22) * bell;
      // Swish ball drops from rim top through the net bottom.
      ball.visible = true;
      ball.position.set(
        position[0],
        position[1] + 0.26 - prog * 0.62,
        position[2],
      );
      if (h._t <= 0) {
        h._active = false;
        net.scale.y = 1;
        net.position.y = position[1];
        ball.visible = false;
      }
    } else {
      ball.visible = false;
    }
  });

  return (
    <group>
      <mesh ref={netRef} position={position}>
        <cylinderGeometry args={[0.22, 0.1, 0.44, 20, 4, true]} />
        <meshBasicMaterial color={color} wireframe transparent opacity={0.5} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={ballRef} visible={false} frustumCulled={false}>
        <sphereGeometry args={[ballRadius, 16, 16]} />
        <meshStandardMaterial color={ballColor} roughness={0.65} metalness={0.1} />
      </mesh>
    </group>
  );
}
