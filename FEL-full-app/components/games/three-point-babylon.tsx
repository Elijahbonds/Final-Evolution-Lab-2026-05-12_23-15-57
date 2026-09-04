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
        title="DOWNTOWN"
        phase={phase}
        detail={phase === 'error' ? (loadError ?? undefined) : (countdown ?? undefined)}
        onStart={tapStart}
        onRetry={tapStart}
      />
      {phase === 'paused' && (
        <button onClick={tapStart} className="absolute inset-0 flex items-center justify-center bg-black/60">
          <span className="fel-heading text-3xl font-bold text-white">PAUSED — TAP TO RESUME</span>
        </button>
      )}

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
          {/* The contest layer publishes round/money/need/board — all four
              used to be computed every frame and rendered NOWHERE (the classic
              "HUD state is not a bezel" trap; only the dev route's JSON dump
              ever showed them). This is the contest the player is in. */}
          <div className="mt-0.5 text-[10px] tracking-widest text-white/50">
            {String(hud.round ?? 'QUALIFYING')}
            {hud.money ? ' · MONEY BALL' : ''}
          </div>
          {typeof hud.meter === 'number' && <ReleaseBar t={hud.meter} />}
          {typeof hud.need === 'number' && (
            <div className="mt-1 inline-block rounded bg-[#ff2d78]/20 px-2 py-0.5 text-[#ff2d78]">
              NEED {hnum(hud.need)} TO WIN
            </div>
          )}
          {typeof hud.banner === 'string' && hud.banner && (
            <div className="mt-2 text-[#00E5FF]">{hud.banner}</div>
          )}
        </div>
      )}

      {phase === 'playing' && Array.isArray(hud.board) && (
        <div className="pointer-events-none absolute right-4 top-4 z-20 rounded-lg border border-white/15 bg-black/60 px-3 py-2 font-mono text-xs text-white backdrop-blur-sm">
          {(hud.board as { name: string; score: number | string; line: string }[]).map((r) => (
            <div key={r.name} className={`flex items-baseline gap-3 py-0.5 ${r.name === 'YOU' ? 'text-[#ffd75e]' : ''}`}>
              <span className="w-16 truncate">{r.name}</span>
              <span className="w-8 text-right text-base font-bold">{r.score}</span>
              <span className={`text-[10px] tracking-wider ${
                r.line === 'CHAMPION' ? 'text-[#ffd75e]' : r.line === 'ADVANCES' ? 'text-[#22d3ee]' : 'text-white/40'
              }`}>{r.line}</span>
            </div>
          ))}
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
