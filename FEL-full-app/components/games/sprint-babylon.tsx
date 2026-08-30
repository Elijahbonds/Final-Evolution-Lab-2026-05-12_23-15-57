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

type Hud = Record<string, HudValue>;

export function makeSprintHost(modeKey: string, title: string) {
  function SprintBabylon({ onEnd }: GameProps) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const busRef = useRef<InputBus | null>(null);
    const endedRef = useRef(false);
    const [phase, setPhase] = useState<ModePhase>('loading');
    const [countdown, setCountdown] = useState<number | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [hud, setHud] = useState<Hud>({});

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
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
          onEnd({
            score: r.score,
            opponentScore: 0,
            won: r.outcome === 'win',
            duration: r.durationSec,
            headline: r.outcome === 'win' ? 'BLAZING SPEED' : 'CHASE THAT SUB-13',
          } satisfies GameResult);
        },
      }).then((s) => { if (disposed) s(); else stop = s; })
        .catch((e) => { if (!disposed) setLoadError(String(e?.message ?? e)); });

      return () => { disposed = true; stop?.(); };
    }, [onEnd]);

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
