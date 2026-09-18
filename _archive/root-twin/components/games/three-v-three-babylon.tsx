'use client';

// FEL Babylon 3V3 Streetball stage (M48). THIN host: owns the <canvas>, boots
// the shared Babylon harness with the ThreeVThree ModeDefinition, and bridges
// phase/HUD/result into the existing GameShell pipeline. All gameplay lives in
// lib/babylon/* cores (BasketballCore + PlayerSlot + TeammateBrain).

import { useEffect, useRef, useState, useCallback } from 'react';
import type { GameProps, GameResult } from './game-shell';
import { BootSplash } from './boot-splash';
import { runMode, InputBus, type ModePhase, type SessionResult, type HudValue } from '@/lib/babylon';
import { MODES } from '@/lib/babylon/modes/registry';
import { TouchOverlay } from '@/lib/babylon/ui/TouchOverlay';
import { hnode } from './hud-format';

type Hud = Record<string, HudValue>;

export default function ThreeVThreeBabylon({ onEnd }: GameProps) {
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
      const won = r.outcome === 'WIN';
      const result: GameResult = {
        score: r.score,
        opponentScore: r.stats?.foeScore ?? 0,
        won,
        duration: r.durationSec,
        headline: won ? 'GAME WON' : 'GAME OVER',
      };
      onEnd(result);
    };

    runMode(MODES.threevthree, {
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
      .catch((e) => console.error('[FEL-HOOPS3] boot failed', e));

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

  const meter = typeof hud.shotMeterT === 'number' ? Math.max(0, Math.min(1, hud.shotMeterT)) : null;

  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-white/10 bg-black">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

      {/* HUD bezel */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between px-4 py-3">
        <span className="fel-panel fel-stat px-3 py-1 text-lg">
          {hnode(hud.score, 0)} – {hnode(hud.foeScore, 0)}
        </span>
        <span className="fel-panel px-3 py-1 font-mono text-xs text-[var(--fel-cyan)]">
          AST {hnode(hud.ast, 0)}
        </span>
        <span className="fel-panel px-3 py-1 font-mono text-xs text-[var(--fel-gold)]">
          {typeof hud.time === 'number' ? `${hud.time}s` : 'TO 21'}
        </span>
      </div>

      {/* shot meter */}
      {meter !== null && phase === 'playing' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-24 flex justify-center">
          <div className="h-2 w-40 overflow-hidden rounded-full bg-white/15">
            <div className="h-full bg-[var(--fel-cyan)]" style={{ width: `${meter * 100}%` }} />
          </div>
        </div>
      )}

      {typeof hud.banner === 'string' && hud.banner && phase === 'playing' && (
        <div className="pointer-events-none absolute inset-x-0 top-1/3 text-center">
          <span className="fel-heading text-3xl font-bold text-[var(--fel-cyan)] drop-shadow">{hud.banner}</span>
        </div>
      )}

      {typeof hud.hint === 'string' && hud.hint && phase === 'playing' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-10 text-center">
          <span className="fel-panel px-3 py-1.5 font-mono text-[11px] text-white/80">{hud.hint}</span>
        </div>
      )}

      <BootSplash
        modeId="threevthree"
        title="3V3 STREETBALL"
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
        <TouchOverlay bus={busRef.current} modeId="threevthree" visible />
      )}
    </div>
  );
}
