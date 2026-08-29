'use client';

// FEL Babylon Karate stage (M22–M27 rollout wave 1). THIN host: owns the
// <canvas>, boots the shared Babylon harness with the KarateEndlessMode
// ModeDefinition, and bridges phase/HUD/result back into the existing GameShell
// pipeline. All gameplay lives in lib/babylon/* cores — nothing is duplicated.

import { useEffect, useRef, useState, useCallback } from 'react';
import type { GameProps, GameResult } from './game-shell';
import { BootSplash } from './boot-splash';
import { runMode, InputBus, type ModePhase, type SessionResult, type HudValue } from '@/lib/babylon';
import { MODES } from '@/lib/babylon/modes/registry';
import { TouchOverlay } from '@/lib/babylon/ui/TouchOverlay';
import { hnode } from './hud-format';

type Hud = Record<string, HudValue>;

export default function KarateBabylon({ onEnd }: GameProps) {
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
      const kos = Number(r.stats?.kos ?? 0);
      const wave = Number(r.stats?.wave ?? 0);
      const result: GameResult = {
        score: r.score,
        opponentScore: 0,
        won: false, // endless survival — the run always ends on defeat
        duration: r.durationSec,
        headline: `WAVE ${wave} REACHED · ${kos} KO`,
      };
      onEnd(result);
    };

    runMode(MODES.karate, {
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
      .catch((e) => console.error('[FEL-KARATE] boot failed', e));

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

  const hp = Number(hud.hp ?? 100);
  const chi = Number(hud.chi ?? 0);

  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-white/10 bg-black">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

      {/* HUD bezel */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 px-4 py-3">
        <div className="min-w-[7rem] space-y-1">
          <div className="h-2 w-full overflow-hidden rounded-full bg-black/50">
            <div className="h-full rounded-full bg-[#FF3366] transition-all" style={{ width: `${Math.max(0, Math.min(100, hp))}%` }} />
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/50">
            <div className="h-full rounded-full bg-[#00E5FF] transition-all" style={{ width: `${Math.max(0, Math.min(100, chi))}%` }} />
          </div>
        </div>
        <span className="fel-panel px-3 py-1 font-mono text-xs text-[var(--fel-gold)]">
          WAVE {hnode(hud.wave, 1)} · {hnode(hud.kos, 0)} KO
        </span>
      </div>

      {typeof hud.banner === 'string' && hud.banner && (
        <div className="pointer-events-none absolute inset-x-0 top-1/3 text-center">
          <span className="fel-heading fel-panel px-4 py-2 text-2xl font-bold text-[var(--fel-emerald)]">{hud.banner}</span>
        </div>
      )}

      <BootSplash
        modeId="karate"
        title="KARATE"
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

      {/* M35: THE single touch control surface — one overlay per mode, ever. */}
      {(phase === 'playing' || phase === 'countdown') && busRef.current && (
        <TouchOverlay bus={busRef.current} modeId="karate" visible />
      )}
    </div>
  );
}
