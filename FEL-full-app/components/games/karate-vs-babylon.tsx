'use client';

// FEL Babylon Karate VS host (M53 Phase 3 rebuild). THIN host: boots the
// KarateVSMode ModeDefinition via the shared Babylon harness. Best-of-3
// duel with FightCore combat, guard/parry, chi special.

import { useEffect, useRef, useState, useCallback } from 'react';
import type { GameProps, GameResult } from './game-shell';
import { BootSplash } from './boot-splash';
import { runMode, InputBus, type ModePhase, type SessionResult, type HudValue } from '@/lib/babylon';
import { MODES } from '@/lib/babylon/modes/registry';
import { TouchOverlay } from '@/lib/babylon/ui/TouchOverlay';
import { hnode, hnum } from './hud-format';

type Hud = Record<string, HudValue>;

export default function KarateVSBabylon({ onEnd }: GameProps) {
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
        score: Number(r.stats?.wins ?? 0),
        opponentScore: Number(r.stats?.foeWins ?? 0),
        won,
        duration: r.durationSec,
        headline: won ? 'VICTORY' : 'DEFEATED',
      };
      onEnd(result);
    };

    runMode(MODES.karate_vs, {
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
      .catch((e) => console.error('[FEL-KARATE-VS] boot failed', e));

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

  const showHud = phase === 'playing';

  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-white/10 bg-black">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

      {showHud && (
        <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-between px-4 py-3 text-sm font-mono text-white">
          <div className="flex flex-col gap-1">
            <span className="fel-panel px-2 py-0.5 text-cyan-300">HP {hnum(hud.hp, 100)}</span>
            <span className="fel-panel px-2 py-0.5 text-yellow-400">GUARD {hnum(hud.guard, 100)}</span>
            <span className="fel-panel px-2 py-0.5 text-purple-400">CHI {hnum(hud.chi, 0)}</span>
          </div>
          <div className="text-center">
            <span className="fel-heading text-xl font-black">ROUND {hnode(hud.round, 1)}</span>
            <div className="text-xs mt-1">{hnode(hud.wins, 0)} – {hnode(hud.foeWins, 0)}</div>
          </div>
          <div className="flex flex-col gap-1 items-end">
            <span className="fel-panel px-2 py-0.5 text-red-400">FOE HP {hnum(hud.foeHp, 100)}</span>
            <span className="fel-panel px-2 py-0.5 text-yellow-400">FOE GUARD {hnum(hud.foeGuard, 100)}</span>
            <span className="fel-panel px-2 py-0.5 text-purple-400">FOE CHI {hnum(hud.foeChi, 0)}</span>
          </div>
        </div>
      )}

      {typeof hud.banner === 'string' && hud.banner && phase === 'playing' && (
        <div className="pointer-events-none absolute inset-x-0 top-1/3 text-center">
          <span className="fel-heading text-3xl font-bold text-[var(--fel-cyan)] drop-shadow">{hud.banner}</span>
        </div>
      )}

      <BootSplash
        modeId="karate_vs"
        title="KARATE VS"
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
        <TouchOverlay bus={busRef.current} modeId="karate_vs" visible />
      )}
    </div>
  );
}
