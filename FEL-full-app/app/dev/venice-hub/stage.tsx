'use client';
// lane/venice-hub (2026-11-12): the prototype's canvas and a small overlay — where you are, the spot you stand in (with
// its route), the frame's cost, and the three views. Dev only (page.tsx 404s outside `next dev`).
import { useEffect, useRef, useState } from 'react';
import { Engine } from '@babylonjs/core';
import { buildVeniceProto, type ProtoHandle, type ProtoStats } from '@/lib/adventure/venice/protoScene';
import type { Spot } from '@/lib/adventure/venice/layout';

export function VeniceHubStage() {
  const ref = useRef<HTMLCanvasElement>(null);
  const handle = useRef<ProtoHandle | null>(null);
  const [where, setWhere] = useState<{ district: string | null; spot: Spot | null }>({ district: null, spot: null });
  const [stats, setStats] = useState<ProtoStats | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const engine = new Engine(canvas, true, { stencil: true });
    const tier = new URLSearchParams(window.location.search).get('tier') === 'mobile' ? 'mobile' : 'desktop';
    const h = buildVeniceProto(engine, { tier });
    handle.current = h;
    engine.runRenderLoop(() => h.scene.render());
    const onResize = () => engine.resize();
    window.addEventListener('resize', onResize);
    const t = setInterval(() => { setWhere(h.where()); setStats(h.stats()); }, 250);
    return () => { clearInterval(t); window.removeEventListener('resize', onResize); h.dispose(); engine.dispose(); };
  }, []);
  const spot = where.spot;
  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black text-white">
      <canvas ref={ref} className="h-full w-full touch-none outline-none" aria-label="Venice hub prototype" tabIndex={0} />
      <div className="absolute left-3 top-3 max-w-xs space-y-1 rounded-lg bg-black/70 p-3 text-sm">
        <p className="font-bold">Venice hub prototype (placeholders)</p>
        <p>District: {where.district ?? 'outside the hub'}</p>
        {spot ? (
          <p>
            {spot.label.replace('[PLACEHOLDER] ', '')}:{' '}
            {spot.route ? <a className="text-[#ffd166] underline" href={spot.route}>{spot.modes.join(', ') || 'open'} → {spot.route}</a> : spot.zone ? `door to ${spot.zone}` : 'home'}
          </p>
        ) : <p className="text-white/60">Walk into a ring to see its game.</p>}
        {stats ? <p className="font-mono text-xs text-white/70">{stats.drawCalls} draws · {stats.activeMeshes} active · {stats.textureMb} MB tex · {stats.fps} fps</p> : null}
        <div className="flex gap-2 pt-1">
          {(['walk', 'courts', 'map'] as const).map((v) => (
            <button key={v} type="button" className="rounded bg-white/15 px-2 py-1" onClick={() => handle.current?.view(v)}>{v}</button>
          ))}
        </div>
        <p className="text-xs text-white/50">WASD or arrows to walk, drag to look.</p>
      </div>
    </div>
  );
}
