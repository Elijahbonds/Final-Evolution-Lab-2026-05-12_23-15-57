'use client';

// Render fidelity reference scene (development only).
//
// A metal/roughness sphere grid lit by the real mountLightRig, so a rendering
// change can be judged against something with a known correct answer instead of
// against a game scene where art, animation and camera all move at once.
//
// The IBL toggle is the point: with scene.environmentTexture off, the metallic
// row goes flat and dead — that is exactly how every PBR material in this app
// rendered before EnvironmentIBL.ts existed. Turning it on should light the
// metals with the venue's own sky/ground/sun.

import { useEffect, useRef, useState } from 'react';
import {
  Color3, MeshBuilder, PBRMaterial, Scene, Vector3, ArcRotateCamera,
} from '@babylonjs/core';
import { createEngine } from '@/lib/babylon/core/createEngine';
import { mountLightRig } from '@/lib/babylon/scene/LightRig';
import { MOODS, type VenueMood } from '@/lib/babylon/scene/moods';
import { CharacterLibrary } from '@/lib/babylon/core/CharacterLibrary';

const MOOD_KEYS = Object.keys(MOODS) as VenueMood[];
const ROWS = 4;   // roughness steps
const COLS = 6;   // metallic steps
/** Cycled on the live athlete so skinning is provably running, not frozen at
 *  bind pose — skeletal animation is the surface most likely to break across a
 *  Babylon major, and a still screenshot of a T-pose looks a lot like success. */
const CLIP_CYCLE = ['idle_stand', 'walk', 'run', 'jab', 'roundhouse'] as const;

export default function RenderCheck() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [mood, setMood] = useState<VenueMood>('goldenHour');
  const [ibl, setIbl] = useState(true);
  const [backend, setBackend] = useState('…');
  const [clip, setClip] = useState('idle_stand');

  // The engine is created ONCE and outlives every mood/IBL change. Recreating it
  // per toggle looked reasonable but tore the page down: both engines call
  // canvas.getContext() on the same canvas and therefore share one WebGL
  // context, so disposing the old engine killed the context the new one was
  // already drawing into — the grid vanished instead of re-rendering.
  const engineRef = useRef<Awaited<ReturnType<typeof createEngine>> | null>(null);
  const [engineReady, setEngineReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    (async () => {
      const engine = await createEngine(canvas);
      if (disposed) { engine.dispose(); return; }
      engineRef.current = engine;
      setBackend(engine.constructor.name);
      setEngineReady(true);
    })();
    return () => {
      disposed = true;
      engineRef.current?.dispose();
      engineRef.current = null;
      setEngineReady(false);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const engine = engineRef.current;
    if (!canvas || !engine || !engineReady) return;
    let cleanup: (() => void) | null = null;

    {
      const scene = new Scene(engine);
      const camera = new ArcRotateCamera('cam', -Math.PI / 2, Math.PI / 2.4, 16, new Vector3(0, 1.5, 0), scene);
      camera.attachControl(canvas, true);

      const rig = mountLightRig(scene, mood);

      // Grid: metallic across X, roughness up Y. The top-right corner is a
      // near-mirror — the single most sensitive cell to whether IBL is present.
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const s = MeshBuilder.CreateSphere(`s_${r}_${c}`, { diameter: 1.6, segments: 32 }, scene);
          s.position.set((c - (COLS - 1) / 2) * 2, 0.9 + r * 2, 0);
          const m = new PBRMaterial(`m_${r}_${c}`, scene);
          m.albedoColor = new Color3(0.85, 0.85, 0.88);
          m.metallic = c / (COLS - 1);
          m.roughness = Math.max(0.04, r / (ROWS - 1));
          s.material = m;
        }
      }

      // A real rigged athlete through the exact spawn path the game modes use,
      // so this page also answers "did skinning survive the Babylon upgrade?".
      let character: Awaited<ReturnType<typeof CharacterLibrary.spawn>> | null = null;
      let clipTimer: ReturnType<typeof setInterval> | null = null;
      CharacterLibrary.spawn(scene, '', {
        position: new Vector3(0, 0, 5), scale: 2.2, modeId: 'render-check',
      }).then((c) => {
        if (scene.isDisposed) { c.dispose(); return; }
        character = c;
        // Dev-only handle so skinning can be *measured* (bone matrices sampled
        // over time) instead of eyeballed — this page runs under a browser that
        // throttles rAF hard enough to make a live rig look frozen.
        (window as unknown as Record<string, unknown>).__renderCheck = { scene, character: c };
        let i = 0;
        clipTimer = setInterval(() => {
          i = (i + 1) % CLIP_CYCLE.length;
          const clip = CLIP_CYCLE[i];
          c.animator.play(clip, { loop: true });
          setClip(clip);
        }, 2000);
      }).catch((err) => console.error('[render-check] athlete spawn failed', err));

      // Toggling the scene environment is the whole experiment — keep a handle
      // to the generated cube so it can be restored without rebuilding it.
      const generated = scene.environmentTexture;
      if (!ibl) scene.environmentTexture = null;

      engine.runRenderLoop(() => scene.render());
      const onResize = () => engine.resize();
      window.addEventListener('resize', onResize);

      cleanup = () => {
        window.removeEventListener('resize', onResize);
        engine.stopRenderLoop();
        if (clipTimer) clearInterval(clipTimer);
        character?.dispose();
        scene.environmentTexture = generated;
        rig.dispose();
        scene.dispose();
        // NB: the engine deliberately survives — see the note on engineRef.
      };
    }

    return () => { cleanup?.(); };
  }, [mood, ibl, engineReady]);

  return (
    <div className="relative h-screen w-screen bg-black">
      <canvas ref={canvasRef} className="h-full w-full outline-none" />
      <div className="absolute left-4 top-4 flex flex-col gap-3 rounded-lg bg-black/70 p-4 font-mono text-xs text-white backdrop-blur">
        <div className="text-[#00E5FF]">RENDER CHECK · {backend}</div>
        <div className="text-[#ffd75e]">clip: {clip}</div>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={ibl} onChange={(e) => setIbl(e.target.checked)} />
          <span>IBL environment {ibl ? 'ON' : 'OFF'}</span>
        </label>
        <select
          value={mood}
          onChange={(e) => setMood(e.target.value as VenueMood)}
          className="rounded bg-black/60 p-1 text-white"
        >
          {MOOD_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <div className="max-w-[190px] text-[10px] leading-relaxed text-white/60">
          metallic → left to right · roughness → bottom to top. With IBL off the
          metallic (right) columns should go flat and lifeless.
        </div>
      </div>
    </div>
  );
}
