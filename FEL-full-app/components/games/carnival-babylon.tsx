'use client';

// FEL Babylon Court Carnival hub (M49). THIN host: owns the <canvas>, boots the
// shared Babylon harness with the CourtCarnival ModeDefinition, and bridges
// phase/HUD/result into the existing GameShell pipeline. All gameplay lives in
// lib/babylon/* cores (CourtCarnivalMode + carnivalEvents, which themselves
// reuse boardCore / aimSwingCore / VenueKit / CharacterLibrary).

import { useEffect, useRef, useState, useCallback } from 'react';
import type { GameProps, GameResult } from './game-shell';
import { BootSplash } from './boot-splash';
import { runMode, InputBus, type ModePhase, type SessionResult, type HudValue } from '@/lib/babylon';
import { MODES } from '@/lib/babylon/modes/registry';
import { TouchOverlay } from '@/lib/babylon/ui/TouchOverlay';
import { hnode } from './hud-format';

type Hud = Record<string, HudValue>;

export default function CarnivalBabylon({ onEnd }: GameProps) {
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

    const resultSink = async (r: SessionResult) => {
      if (endedRef.current) return;
      endedRef.current = true;
      const won = r.outcome === 'CHAMPION';
      const result: GameResult = {
        score: r.score,
        opponentScore: r.stats?.rivalPoints ?? 0,
        won,
        duration: r.durationSec,
        headline: won ? 'CARNIVAL CHAMPION' : 'RUNNER-UP',
      };
      onEnd(result);
    };

    runMode(MODES.carnival, {
      canvas,
      input: bus,
      onPhase: (p, cd) => {
        setPhase(p);
        setCountdown(p === 'countdown' && typeof cd === 'number' ? cd : null);
        setLoadError(p === 'error' ? (typeof cd === 'string' ? cd : 'Failed to load this mode.') : null);
      },
      onHud: (u) => setHud((prev) => ({ ...prev, ...u })),
      resultSink,
    })
      .then((s) => {
        if (disposed) { s(); return; }
        stop = s;
      })
      .catch((e) => console.error('[FEL-CARNIVAL] boot failed', e));

    return () => {
      disposed = true;
      stop?.();
      busRef.current = null;
    };
  }, [onEnd]);

  const emit = useCallback((e: Parameters<InputBus['emit']>[0]) => {
    busRef.current?.emit(e);
  }, []);

  const tapStart = useCallback(() => {
    emit({ t: 'button', btn: 'START', pressed: true });
  }, [emit]);

  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-white/10 bg-black">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

      {/* HUD bezel — Carnival Points vs rival + event counter + clock */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between px-4 py-3">
        <span className="fel-panel fel-stat px-3 py-1 text-lg">
          {hnode(hud.score, 0)} <span className="text-white/40">vs</span> {hnode(hud.rivalScore, 0)}
        </span>
        <div className="flex items-center gap-2">
          {hud.eventNum != null && (
            <span className="fel-panel px-3 py-1 font-mono text-xs text-[var(--fel-purple)]">
              EVENT {hnode(hud.eventNum, '')}
            </span>
          )}
          {typeof hud.time === 'number' && phase === 'playing' && (
            <span className="fel-panel px-3 py-1 font-mono text-xs text-[var(--fel-gold)]">
              {hnode(hud.time, 0)}s
            </span>
          )}
        </div>
      </div>

      {/* per-event hint line */}
      {typeof hud.hint === 'string' && hud.hint && phase === 'playing' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-24 flex justify-center">
          <span className="fel-panel px-3 py-1 text-center text-xs text-white/80">{hud.hint}</span>
        </div>
      )}

      {/* reveal / result banner */}
      {typeof hud.banner === 'string' && hud.banner && (
        <div className="pointer-events-none absolute inset-x-0 top-1/3 text-center">
          <span className="fel-heading text-3xl font-bold text-[var(--fel-cyan)] drop-shadow">{hud.banner}</span>
        </div>
      )}

      <BootSplash
        modeId="carnival"
        title="COURT CARNIVAL"
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

      {(phase === 'playing' || phase === 'countdown') && busRef.current && (
        <TouchOverlay bus={busRef.current} modeId="carnival" visible />
      )}
    </div>
  );
}
