'use client';

/**
 * anim-harness-client.tsx — Phase 1 diagnostic harness UI.
 *
 * - character dropdown (elijah-hero, elijah)
 * - clip list, click-to-play through CharacterAnimator (real crossfade)
 * - loop toggle, speed slider, blend-time slider
 * - SkeletonHelper overlay toggle
 * - bone-match report panel (bound / unbound counts vs the loaded skeleton)
 * - orbit camera
 */
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { useGLTFAsset } from '@/components/three/gltf-loader';
import { CharacterAnimator } from '@/lib/anim/character-animator';
import { buildBoneMap } from '@/lib/anim/rebinder';
import { bandForSpeed } from '@/lib/anim/state-machine';
import { CLIPS, resolveConcreteClip } from '@/lib/anim/clip-registry';
import {
  locomotionBlend,
  strideSyncTimeScale,
  type LocoBandName,
} from '@/lib/loco/locomotion';

/** Logical clip for a locomotion band (sprint falls back to run for this rig). */
function bandLogical(band: LocoBandName): string {
  switch (band) {
    case 'walk': return CLIPS.walk;
    case 'run': return CLIPS.run;
    case 'sprint': return CLIPS.sprint;
    case 'idle':
    default: return CLIPS.idle;
  }
}

const CHARACTERS = [
  { label: 'elijah-hero.glb', url: '/models/elijah-hero.glb', idle: 'guard' },
  { label: 'elijah.glb', url: '/models/elijah.glb', idle: '' },
];

interface RigState {
  clips: string[];
  bones: string[];
  boundCount: number;
  unboundCount: number;
  unbound: string[];
}

function Rig({
  url,
  idle,
  playToken,
  requestedClip,
  loop,
  speed,
  blend,
  showSkeleton,
  locoActive,
  locoSpeed01,
  onState,
  onResolved,
  onLocoInfo,
}: {
  url: string;
  idle: string;
  playToken: number;
  requestedClip: string | null;
  loop: boolean;
  speed: number;
  blend: number;
  showSkeleton: boolean;
  locoActive: boolean;
  locoSpeed01: number;
  onState: (s: RigState) => void;
  onResolved: (msg: string) => void;
  onLocoInfo: (msg: string) => void;
}) {
  const gltf = useGLTFAsset(url);
  const gl = useThree((s) => s.gl);
  const animatorRef = useRef<CharacterAnimator | null>(null);
  const helperRef = useRef<THREE.SkeletonHelper | null>(null);
  const locoConcreteRef = useRef<string | null>(null);
  const clipNamesRef = useRef<string[]>([]);

  const built = useMemo(() => {
    const root = skeletonClone(gltf.scene) as THREE.Object3D;
    root.traverse((o: any) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.frustumCulled = false;
        if (o.material?.map) o.material.map.anisotropy = Math.min(4, gl.capabilities.getMaxAnisotropy());
      }
    });
    const box = new THREE.Box3().setFromObject(root);
    root.position.y -= box.min.y;

    // collect skeleton bones
    const bones: string[] = [];
    let skinnedRoot: THREE.Object3D | null = null;
    root.traverse((o: any) => {
      if (o.isBone) bones.push(o.name);
      if (o.isSkinnedMesh && !skinnedRoot) skinnedRoot = o;
    });

    const clips = (gltf.animations ?? []) as THREE.AnimationClip[];
    const idleClip = idle || clips[0]?.name || '';
    const animator = new CharacterAnimator(root, clips, idleClip);

    // bone-match report: clip track bones vs skeleton bones
    const trackBones = new Set<string>();
    for (const c of clips) {
      for (const t of c.tracks) {
        const dot = t.name.lastIndexOf('.');
        trackBones.add(dot > 0 ? t.name.slice(0, dot) : t.name);
      }
    }
    const map = buildBoneMap(Array.from(trackBones), bones);

    return { root, animator, bones, clipNames: clips.map((c) => c.name), map, idleClip };
  }, [gltf, gl, idle]);

  useEffect(() => {
    clipNamesRef.current = built.clipNames;
    locoConcreteRef.current = null;
  }, [built]);

  useEffect(() => {
    animatorRef.current = built.animator;
    const helper = new THREE.SkeletonHelper(built.root);
    (helper.material as THREE.LineBasicMaterial).linewidth = 2;
    helper.visible = showSkeleton;
    helperRef.current = helper;
    built.root.add(helper);
    onState({
      clips: built.clipNames,
      bones: built.bones,
      boundCount: built.map.matchedCount,
      unboundCount: built.map.unmatchedCount,
      unbound: built.map.unmatched.map((u) => u.source),
    });
    // settle onto idle on load (never bind pose)
    built.animator.play(built.idleClip, { loop: true });
    return () => {
      built.animator.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [built]);

  useEffect(() => {
    if (helperRef.current) helperRef.current.visible = showSkeleton;
  }, [showSkeleton]);

  useEffect(() => {
    if (!requestedClip || !animatorRef.current) return;
    const choice = animatorRef.current.play(requestedClip, { loop, speed, blendSeconds: blend });
    onResolved(
      choice.didFallback
        ? `⚠ "${requestedClip}" → fell back to "${choice.clip}" (${choice.reason})`
        : `▶ playing "${choice.clip}"`,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playToken]);

  useFrame((_, dt) => {
    const animator = animatorRef.current;
    if (animator && locoActive) {
      // Blend-tree + stride-sync locomotion driven by the speed slider. This is
      // the exact math the in-game AnimDirectorFSM uses, so what you see here is
      // what ships: idle→walk→run crossfade with foot cadence matched to speed.
      const band = bandForSpeed(locoSpeed01);
      const w = locomotionBlend(locoSpeed01);
      const ts = strideSyncTimeScale(locoSpeed01, band);
      const logical = bandLogical(band);
      const concrete = resolveConcreteClip(logical, clipNamesRef.current) ?? clipNamesRef.current[0] ?? '';
      if (concrete && concrete !== locoConcreteRef.current) {
        animator.play(concrete, { loop: true, speed: band === 'idle' ? 1 : ts, blendSeconds: 0.2 });
        locoConcreteRef.current = concrete;
      } else if (band !== 'idle') {
        animator.setSpeed(ts);
      }
      onLocoInfo(
        `band=${band} • timeScale=${ts.toFixed(2)}x • idle ${w.idle.toFixed(2)} / walk ${w.walk.toFixed(2)} / run ${w.run.toFixed(2)} / sprint ${w.sprint.toFixed(2)}`,
      );
    }
    animator?.update(dt);
  });

  return <primitive object={built.root} />;
}

export default function AnimHarnessClient() {
  const [charIdx, setCharIdx] = useState(0);
  const [state, setState] = useState<RigState | null>(null);
  const [requestedClip, setRequestedClip] = useState<string | null>(null);
  const [playToken, setPlayToken] = useState(0);
  const [loop, setLoop] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [blend, setBlend] = useState(0.15);
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [resolved, setResolved] = useState('');
  const [locoActive, setLocoActive] = useState(false);
  const [locoSpeed01, setLocoSpeed01] = useState(0);
  const [locoInfo, setLocoInfo] = useState('');

  const char = CHARACTERS[charIdx];

  function playClip(name: string) {
    setRequestedClip(name);
    setPlayToken((t) => t + 1);
  }

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', background: '#050505', color: '#e8e8e8', fontFamily: 'ui-monospace, monospace' }}>
      {/* Controls panel */}
      <div style={{ width: 340, padding: 16, overflowY: 'auto', borderRight: '1px solid #1a1a1a' }}>
        <h1 style={{ fontSize: 16, color: '#00E5FF', margin: '0 0 4px' }}>Animation Diagnostic Harness</h1>
        <p style={{ fontSize: 11, color: '#888', margin: '0 0 16px' }}>
          /dev/anim — if a clip plays correctly here, it plays correctly in-game.
        </p>

        <label style={{ fontSize: 12, color: '#00FF9D' }}>Character</label>
        <select
          value={charIdx}
          onChange={(e) => {
            setCharIdx(Number(e.target.value));
            setState(null);
            setResolved('');
          }}
          style={{ width: '100%', margin: '4px 0 16px', padding: 6, background: '#111', color: '#fff', border: '1px solid #333' }}
        >
          {CHARACTERS.map((c, i) => (
            <option key={c.url} value={i}>{c.label}</option>
          ))}
        </select>

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: '#00FF9D' }}>Loop</label>{' '}
          <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} />
          {'   '}
          <label style={{ fontSize: 12, color: '#00FF9D' }}>Skeleton</label>{' '}
          <input type="checkbox" checked={showSkeleton} onChange={(e) => setShowSkeleton(e.target.checked)} />
        </div>

        <div style={{ marginBottom: 8 }}>
          <label style={{ fontSize: 12, color: '#00FF9D' }}>Speed: {speed.toFixed(2)}x</label>
          <input type="range" min={0.1} max={3} step={0.05} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} style={{ width: '100%' }} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: '#00FF9D' }}>Blend: {blend.toFixed(2)}s</label>
          <input type="range" min={0} max={1} step={0.05} value={blend} onChange={(e) => setBlend(Number(e.target.value))} style={{ width: '100%' }} />
        </div>

        {/* Locomotion blend-tree + stride-sync lane */}
        <div style={{ border: '1px solid #223', borderRadius: 6, padding: 10, margin: '4px 0 16px', background: '#0b0b12' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <label style={{ fontSize: 12, color: '#A855F7' }}>Locomotion (blend + stride-sync)</label>
            <input type="checkbox" checked={locoActive} onChange={(e) => setLocoActive(e.target.checked)} />
          </div>
          <label style={{ fontSize: 12, color: '#00FF9D' }}>Speed01: {locoSpeed01.toFixed(2)}</label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={locoSpeed01}
            onChange={(e) => setLocoSpeed01(Number(e.target.value))}
            disabled={!locoActive}
            style={{ width: '100%' }}
          />
          <div style={{ fontSize: 10, color: locoActive ? '#FFD700' : '#555', minHeight: 26, marginTop: 4, lineHeight: 1.4 }}>
            {locoActive ? (locoInfo || 'drag speed → idle→walk→run, feet should NOT slide') : 'toggle on, then drag speed to watch the walk cycle'}
          </div>
        </div>

        <label style={{ fontSize: 12, color: '#00FF9D' }}>Clips</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '6px 0 16px' }}>
          {state?.clips.map((c) => (
            <button
              key={c}
              onClick={() => playClip(c)}
              style={{
                padding: '6px 10px',
                fontSize: 12,
                background: requestedClip === c ? '#00E5FF' : '#141414',
                color: requestedClip === c ? '#000' : '#e8e8e8',
                border: '1px solid #333',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              {c}
            </button>
          ))}
          {!state && <span style={{ fontSize: 12, color: '#666' }}>loading rig…</span>}
        </div>

        {/* missing-clip fallback probe */}
        <button
          onClick={() => playClip('__does_not_exist__')}
          style={{ padding: '6px 10px', fontSize: 11, background: '#2a1414', color: '#FF3366', border: '1px solid #55232f', borderRadius: 4, cursor: 'pointer', marginBottom: 16 }}
        >
          Test missing-clip → idle fallback
        </button>

        <div style={{ fontSize: 12, color: '#FFD700', minHeight: 18, marginBottom: 12 }}>{resolved}</div>

        {state && (
          <div style={{ fontSize: 11, lineHeight: 1.5, borderTop: '1px solid #1a1a1a', paddingTop: 12 }}>
            <div style={{ color: '#A855F7', fontSize: 12, marginBottom: 4 }}>Bone-match report</div>
            <div>skeleton bones: <b>{state.bones.length}</b></div>
            <div style={{ color: '#00FF9D' }}>bound track-bones: <b>{state.boundCount}</b></div>
            <div style={{ color: state.unboundCount ? '#FF3366' : '#00FF9D' }}>
              unbound track-bones: <b>{state.unboundCount}</b>
            </div>
            {state.unboundCount > 0 && (
              <div style={{ color: '#FF3366', marginTop: 4 }}>{state.unbound.join(', ')}</div>
            )}
          </div>
        )}
      </div>

      {/* Viewport */}
      <div style={{ flex: 1, position: 'relative' }}>
        <Canvas shadows camera={{ position: [2.4, 1.8, 3.2], fov: 45 }}>
          <color attach="background" args={['#0a0a0f']} />
          <ambientLight intensity={0.8} />
          <directionalLight position={[4, 8, 5]} intensity={1.4} castShadow />
          <directionalLight position={[-4, 3, -3]} intensity={0.5} color="#00E5FF" />
          <Grid args={[20, 20]} cellColor="#1a1a1a" sectionColor="#2a2a3a" fadeDistance={22} infiniteGrid position={[0, 0, 0]} />
          <Suspense fallback={null}>
            <Rig
              key={char.url}
              url={char.url}
              idle={char.idle}
              playToken={playToken}
              requestedClip={requestedClip}
              loop={loop}
              speed={speed}
              blend={blend}
              showSkeleton={showSkeleton}
              locoActive={locoActive}
              locoSpeed01={locoSpeed01}
              onState={setState}
              onResolved={setResolved}
              onLocoInfo={setLocoInfo}
            />
          </Suspense>
          <OrbitControls target={[0, 1, 0]} enablePan />
        </Canvas>
      </div>
    </div>
  );
}
