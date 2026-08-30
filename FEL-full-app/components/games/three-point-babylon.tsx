'use client';

// FEL Babylon Three-Point Shootout host — also the Controller Link reference
// implementation.
//
// The Controller Link wiring here is deliberately three lines: mount HostLobby,
// point its onInput at toInputBus(bus), done. Every phone input lands on the
// same InputBus the keyboard and touch overlay already feed, so ThreePointMode
// never learns that a phone exists. That is the property that makes the next
// mode cheap.

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import type { GameProps, GameResult } from './game-shell';
import { BootSplash } from './boot-splash';
import { runMode, InputBus, type ModePhase, type SessionResult, type HudValue } from '@/lib/babylon';
import { MODES } from '@/lib/babylon/modes/registry';
import { TouchOverlay } from '@/lib/babylon/ui/TouchOverlay';
import { HostLobby } from '@/components/controller-link/host-lobby';
import { controllerConfigFor } from '@/lib/controller-link/schemas/registry';
import { toInputBus } from '@/lib/controller-link/modeBridge';
import { hnum } from './hud-format';

type Hud = Record<string, HudValue>;

export default function ThreePointBabylon({ onEnd }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const busRef = useRef<InputBus | null>(null);
  const endedRef = useRef(false);
  const [phase, setPhase] = useState<ModePhase>('loading');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hud, setHud] = useState<Hud>({});
  const [busReady, setBusReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bus = new InputBus();
    busRef.current = bus;
    setBusReady(true);
    let stop: (() => void) | null = null;
    let disposed = false;

    const resultSink = async (r: SessionResult) => {
      if (endedRef.current) return;
      endedRef.current = true;
      onEnd({
        score: Number(r.stats?.points ?? r.score ?? 0),
        opponentScore: 0,
        won: r.outcome === 'win',
        duration: r.durationSec,
        headline: r.outcome === 'win' ? 'RANGE UNLOCKED' : 'SHOOTOUT COMPLETE',
      } satisfies GameResult);
    };

    runMode(MODES.threepoint, {
      canvas,
      input: bus,
      onPhase: (p, detail) => {
        if (disposed) return;
        setPhase(p);
        setCountdown(typeof detail === 'number' ? detail : null);
        if (p === 'error') setLoadError(typeof detail === 'string' ? detail : 'load failed');
      },
      onHud: (h) => { if (!disposed) setHud(h); },
      resultSink,
    }).then((s) => { if (disposed) s(); else stop = s; })
      .catch((e) => { if (!disposed) setLoadError(String(e?.message ?? e)); });

    return () => { disposed = true; stop?.(); };
  }, []);   // mount once — see onEndRef above

  const emit = useCallback((i: Parameters<InputBus['emit']>[0]) => {
    busRef.current?.emit(i);
  }, []);

  const tapStart = useCallback(() => {
    emit({ t: 'button', btn: 'START', pressed: true });
  }, [emit]);

  // A phone's input is fed to the same bus as every other input source.
  const onControllerInput = useCallback((ev: Parameters<ReturnType<typeof toInputBus>>[0]) => {
    const bus = busRef.current;
    if (bus) toInputBus(bus)(ev);
  }, []);

  const controllerConfig = useMemo(() => controllerConfigFor('threepoint'), []);

  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-white/10 bg-black">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

      <BootSplash
        modeId="threepoint"
        title="THREE-POINT SHOOTOUT"
        phase={phase}
        detail={phase === 'error' ? (loadError ?? undefined) : (countdown ?? undefined)}
        onStart={tapStart}
        onRetry={tapStart}
      />

      {/* Lobby is expanded until the whistle, then collapses to a status badge
          so it never sits on top of live play. */}
      {controllerConfig && busReady && (
        <HostLobby
          config={controllerConfig}
          onInput={onControllerInput}
          collapsed={phase === 'playing'}
        />
      )}

      {phase === 'playing' && (
        <div className="pointer-events-none absolute left-4 top-4 z-20 font-mono text-xs text-white">
          <div className="text-2xl font-bold text-[#ffd75e]">{hnum(hud.score)}</div>
          <div className="text-white/60">RACK {String(hud.rack ?? '—')} · BALL {String(hud.ball ?? '—')}</div>
          <div className="text-white/60">{hnum(hud.clock)}s · streak {hnum(hud.streak)}</div>
          {typeof hud.meter === 'number' && <ReleaseBar t={hud.meter} />}
          {typeof hud.banner === 'string' && hud.banner && (
            <div className="mt-2 text-[#00E5FF]">{hud.banner}</div>
          )}
        </div>
      )}

      {(phase === 'playing' || phase === 'countdown') && busRef.current && (
        <TouchOverlay bus={busRef.current} modeId="threepoint" visible />
      )}
    </div>
  );
}

/** The timing bar the whole mode hangs on — sweet spot marked at SHOT_TARGET. */
function ReleaseBar({ t }: { t: number }) {
  return (
    <div className="relative mt-2 h-3 w-44 overflow-hidden rounded bg-white/10">
      <div className="absolute inset-y-0 w-[12%] bg-[#22d3ee]/40" style={{ left: '66%' }} />
      <div className="absolute inset-y-0 w-[3px] bg-white" style={{ left: `${t * 100}%` }} />
    </div>
  );
}
