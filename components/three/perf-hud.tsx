'use client';

import { useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { FRAME_BUDGET_MS, type PerfSample } from '@/lib/three-budget';

// Lives INSIDE the Canvas. Samples renderer stats + fps ~4x/sec and reports them
// out via callback so a plain DOM overlay (outside WebGL) can display the budget
// readout without costing draw calls.
//
// It also measures the CPU cost of the render submit by wrapping gl.render, and
// the true wall-clock frame period. Both are averaged over the sample window so
// the numbers are stable rather than per-frame noise.
export function PerfSampler({ onSample }: { onSample: (s: PerfSample) => void }) {
  const gl = useThree((s) => s.gl);
  const frames = useRef(0);
  const acc = useRef(0);
  const fps = useRef(60);
  const renderSum = useRef(0);
  const renderCount = useRef(0);

  // Wrap gl.render once to time the CPU cost of submitting draw calls. Restored
  // on unmount so we never leave a patched renderer behind.
  useEffect(() => {
    const anyGl = gl as any;
    if (anyGl.__felRenderWrapped) return;
    const orig = gl.render.bind(gl);
    anyGl.__felRenderWrapped = true;
    gl.render = ((scene: any, camera: any) => {
      const t0 = performance.now();
      orig(scene, camera);
      renderSum.current += performance.now() - t0;
      renderCount.current += 1;
    }) as typeof gl.render;
    return () => {
      gl.render = orig;
      anyGl.__felRenderWrapped = false;
    };
  }, [gl]);

  useFrame((_, dt) => {
    frames.current += 1;
    acc.current += dt;
    if (acc.current >= 0.25) {
      fps.current = Math.round(frames.current / acc.current);
      const frameMs = (acc.current / frames.current) * 1000;
      const renderMs = renderCount.current > 0 ? renderSum.current / renderCount.current : 0;
      const info = gl.info;
      onSample({
        fps: fps.current,
        calls: info.render.calls,
        triangles: info.render.triangles,
        textures: info.memory.textures,
        geometries: info.memory.geometries,
        programs: info.programs?.length ?? 0,
        frameMs,
        renderMs,
      });
      frames.current = 0;
      acc.current = 0;
      renderSum.current = 0;
      renderCount.current = 0;
    }
  });

  return null;
}

// Shared DOM perf readout. Rendered OUTSIDE the Canvas (plain HTML overlay).
// Colour follows the budget grade: green ok / gold warn / red over.
export function PerfOverlay({
  perf,
  grade,
  show,
}: {
  perf: PerfSample | null;
  grade: { status: 'ok' | 'warn' | 'over'; notes: string[] } | null;
  show: boolean;
}) {
  if (!show || !perf || !grade) return null;
  const color = grade.status === 'ok' ? '#00FF9D' : grade.status === 'warn' ? '#FFD700' : '#FF3366';
  const renderPct = Math.round((perf.renderMs / FRAME_BUDGET_MS) * 100);
  // "logic" here is everything in the frame that is not the render submit
  // (game logic + browser/vsync overhead). Shown as ms so it is honest about
  // what it includes rather than pretending to be a pure CPU-logic figure.
  const logicMs = Math.max(0, perf.frameMs - perf.renderMs);
  const logicPct = Math.round((logicMs / FRAME_BUDGET_MS) * 100);
  return (
    <div
      className="absolute bottom-2 left-2 px-2 py-1 rounded text-[11px] leading-tight font-mono pointer-events-none"
      style={{ background: 'rgba(0,0,0,0.72)', color }}
    >
      <div>
        {perf.fps}fps · {perf.frameMs.toFixed(1)}ms/frame
      </div>
      <div>
        render {perf.renderMs.toFixed(1)}ms ({renderPct}%) · logic {logicMs.toFixed(1)}ms ({logicPct}%)
      </div>
      <div>
        {perf.triangles.toLocaleString()} tris · {perf.calls} draws
      </div>
    </div>
  );
}

// P-key toggle for the perf overlay. Self-contained so any mode can opt in with
// a single hook call.
export function useShowPerf() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'p' || e.key === 'P') setShow((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return show;
}
