'use client';

// Shared Babylon host for the air-session family (gymnastics vault, big air).
// makeSprintHost(modeKey) returns a GameProps component, mirroring the
// makeTimingHost / makeBoardHost convention — one host, never forked per mode.

import { useEffect, useRef, useState, useCallback } from 'react';
import type { GameProps, GameResult } from './game-shell';
import { BootSplash } from './boot-splash';
import { runMode, InputBus, type ModePhase, type SessionResult, type HudValue } from '@/lib/babylon';
import { MODES } from '@/lib/babylon/modes/registry';
import { TouchOverlay } from '@/lib/babylon/ui/TouchOverlay';

// Which harness currently owns a given canvas. React mounts effects twice in
// dev: effect A starts an async runMode(), its cleanup fires before A has even
// finished loading, then effect B starts on the SAME canvas. When A's promise
// finally resolves it tears itself down — and engine.dispose() releases the
// WebGL context of the shared canvas, killing B's render loop. The symptom is
// brutal to read: the HUD keeps streaming from B's React state while update()
// is never called again and the canvas stays black.
//
// The token lets a late teardown notice it has been superseded and leave the
// canvas alone. Leaking one dev-only engine is vastly better than a dead frame.
const canvasOwner = new WeakMap<HTMLCanvasElement, object>();


type Hud = Record<string, HudValue>;

export function makeSprintHost(modeKey: string, title: string) {
  function SprintBabylon({ onEnd }: GameProps) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const busRef = useRef<InputBus | null>(null);
    const endedRef = useRef(false);
    // The harness effect must NOT depend on onEnd's identity. A parent that
    // passes an inline arrow (very common) gives a new function every render,
    // the effect re-runs, and a SECOND Babylon engine is created on the same
    // canvas — they share one WebGL context and the frame goes black while the
    // HUD keeps updating from the other instance.
    const onEndRef = useRef(onEnd);
    onEndRef.current = onEnd;
    const [phase, setPhase] = useState<ModePhase>('loading');
    const [countdown, setCountdown] = useState<number | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [hud, setHud] = useState<Hud>({});

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const token = {};
      canvasOwner.set(canvas, token);
      const bus = new InputBus();
      busRef.current = bus;
      let stop: (() => void) | null = null;
      let disposed = false;

      runMode(MODES[modeKey], {
        canvas,
        input: bus,
        onPhase: (p, d) => {
          if (disposed) return;
          setPhase(p);
          setCountdown(typeof d === 'number' ? d : null);
          if (p === 'error') setLoadError(typeof d === 'string' ? d : 'load failed');
        },
        onHud: (h) => { if (!disposed) setHud((prev) => ({ ...prev, ...h })); },
        resultSink: async (r: SessionResult) => {
          if (endedRef.current) return;
          endedRef.current = true;
          onEndRef.current({
            score: r.score,
            opponentScore: 0,
            won: r.outcome === 'win',
            duration: r.durationSec,
            headline: r.outcome === 'win' ? 'BLAZING SPEED' : 'CHASE THAT SUB-13',
          } satisfies GameResult);
        },
      }).then((s) => {
        // If a newer mount already claimed this canvas, do NOT run our teardown —
        // it would dispose the engine holding the shared WebGL context.
        if (disposed) { if (canvasOwner.get(canvas) === token) s(); return; }
        stop = s;
      })
        .catch((e) => { if (!disposed) setLoadError(String(e?.message ?? e)); });

      return () => {
        disposed = true;
        if (canvasOwner.get(canvas) === token) stop?.();
      };
    }, []);   // mount once — see onEndRef above

    const tapStart = useCallback(() => {
      busRef.current?.emit({ t: 'button', btn: 'START', pressed: true });
    }, []);

    return (
      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-white/10 bg-black">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

        {phase === 'playing' && (
          <div className="pointer-events-none absolute left-4 top-4 z-20 font-mono text-xs text-white">
            <div className="text-2xl font-bold text-[#ffd75e]">{String(hud.clock ?? 0)}s</div>
            <div className="text-white/60">{String(hud.distance ?? '')} · {String(hud.phase ?? '')}</div>
            <div className="text-white/60">
              speed {String(hud.speed ?? 0)} m/s · top {String(hud.top ?? 0)} · rival {String(hud.rival ?? '')}
            </div>
            {typeof hud.banner === 'string' && hud.banner && (
              <div className="mt-2 text-[#00E5FF]">{hud.banner}</div>
            )}
          </div>
        )}

        <BootSplash
          modeId={modeKey}
          title={title}
          phase={phase}
          detail={phase === 'error' ? (loadError ?? undefined) : (countdown ?? undefined)}
          onStart={tapStart}
          onRetry={tapStart}
        />

        {(phase === 'playing' || phase === 'countdown') && busRef.current && (
          <TouchOverlay bus={busRef.current} modeId={modeKey} visible />
        )}
      </div>
    );
  }
  SprintBabylon.displayName = `SprintBabylon(${modeKey})`;
  return SprintBabylon;
}
