'use client';

// Generic dev runner: mounts ANY registered Babylon mode through the real
// ModeHarness. Built during the all-modes-to-Babylon pass so each ported mode
// can actually be run and looked at — every /play route is auth-gated and the
// local database is down, so the shipped routes cannot be opened here.

import { useEffect, useRef, useState } from 'react';
import { runMode, InputBus, type ModePhase, type HudValue } from '@/lib/babylon';
import { MODES } from '@/lib/babylon/modes/registry';
import { TouchOverlay } from '@/lib/babylon/ui/TouchOverlay';

export function DevModeRunner({ modeKey }: { modeKey: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const busRef = useRef<InputBus | null>(null);
  const [phase, setPhase] = useState<ModePhase>('loading');
  const [hud, setHud] = useState<Record<string, HudValue>>({});
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const def = MODES[modeKey];
    if (!canvas) return;
    if (!def) { setErr(`no registry mode "${modeKey}"`); return; }
    const bus = new InputBus();
    busRef.current = bus;
    let stop: (() => void) | null = null;
    let disposed = false;

    runMode(def, {
      canvas,
      input: bus,
      onPhase: (p, d) => { if (!disposed) { setPhase(p); if (p === 'error') setErr(String(d)); } },
      onHud: (h) => { if (!disposed) setHud((prev) => ({ ...prev, ...h })); },
      resultSink: async (r) => console.log('[dev] result', r),
    }).then((s) => { if (disposed) s(); else stop = s; })
      .catch((e) => { if (!disposed) setErr(String(e?.message ?? e)); });

    return () => { disposed = true; stop?.(); };
  }, [modeKey]);

  return (
    // Fixed full-viewport canvas. An aspect-ratio box inside a scrolling page
    // let the engine size the canvas while it was partly offscreen, and every
    // mode — including the shipped Dunk — rendered a black frame.
    <div className="relative h-screen w-screen overflow-hidden bg-black font-mono text-xs text-white">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none outline-none" />

      <div className="pointer-events-none absolute left-3 top-3 z-20 max-w-[46%] rounded bg-black/70 p-2">
        <p className="text-white/50">
          DEV · <span className="text-[#00E5FF]">{modeKey}</span> · {phase}
          {err ? <span className="text-red-400"> · {err}</span> : null}
        </p>
        <pre className="mt-1 whitespace-pre-wrap text-[10px] text-white/45">{JSON.stringify(hud, null, 1)}</pre>
      </div>

      <button
        onClick={() => busRef.current?.emit({ t: 'button', btn: 'START', pressed: true })}
        className="absolute left-3 bottom-3 z-20 rounded bg-[#00E5FF] px-4 py-2 font-bold text-black"
      >START</button>

      {busRef.current && (phase === 'playing' || phase === 'countdown') && (
        <TouchOverlay bus={busRef.current} modeId={modeKey} visible />
      )}
    </div>
  );
}
