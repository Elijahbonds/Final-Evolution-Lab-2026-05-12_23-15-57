'use client';

// FEL Babylon Dunk stage — the M22–M27 proof gate. This component is a THIN
// host: it owns the <canvas>, boots the shared Babylon harness with the dunk
// ModeDefinition, and bridges phase/HUD/result back into the existing
// GameShell pipeline (GameProps.onEnd → /api/sessions recap). All gameplay
// lives in lib/babylon/* cores; nothing game-specific is duplicated here.

import { useEffect, useRef, useState, useCallback } from 'react';
import type { GameProps, GameResult } from './game-shell';
import { BootSplash } from './boot-splash';
import { runMode, InputBus, type ModePhase, type SessionResult, type HudValue, type HudScoreCard } from '@/lib/babylon';
import { MODES } from '@/lib/babylon/modes/registry';
import { TouchOverlay } from '@/lib/babylon/ui/TouchOverlay';
import { hnode, hnum } from './hud-format';

type Hud = Record<string, HudValue>;

export default function DunkBabylon({ onEnd }: GameProps) {
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
        opponentScore: r.stats?.rivalScore ?? 0,
        won,
        duration: r.durationSec,
        headline: won ? 'CONTEST WON' : 'CONTEST OVER',
      };
      onEnd(result);
    };

    runMode(MODES.dunk, {
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
      .catch((e) => console.error('[FEL-DUNK] boot failed', e));

    return () => {
      disposed = true;
      stop?.();
      busRef.current = null;
    };
  }, [onEnd]);

  // ── touch bridge ──────────────────────────────────────────────────────────
  const emit = useCallback((e: Parameters<InputBus['emit']>[0]) => {
    busRef.current?.emit(e);
  }, []);

  const tapStart = useCallback(() => {
    // READY gate + pause both advance on any button press.
    emit({ t: 'button', btn: 'START', pressed: true });
  }, [emit]);

  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-white/10 bg-black">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

      {/* HUD bezel — judged contest scoreboard (M47) */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 px-4 py-3 font-mono text-xs">
        <div className="flex items-center gap-2">
          <span className="fel-panel fel-stat px-3 py-1 text-lg">
            {hnode(hud.score, 0)} <span className="text-white/50">vs</span> {hnode(hud.rivalScore, 0)}
          </span>
          {hud.round != null && (
            <span className="fel-panel px-2 py-1 text-[var(--fel-cyan)]">RD {hnode(hud.round)}</span>
          )}
          {hud.dunkNum != null && (
            <span className="fel-panel px-2 py-1 text-white/70">DUNK {hnode(hud.dunkNum)}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hud.prop != null && (
            <span className="fel-panel px-2 py-1 text-[var(--fel-purple)]">{hnode(hud.prop)}</span>
          )}
          {hud.style != null && (
            <span className="fel-panel px-2 py-1 text-[var(--fel-gold)]">{hnode(hud.style)}</span>
          )}
        </div>
      </div>

      {/* HYPE meter */}
      {phase === 'playing' && (
        <div className="pointer-events-none absolute right-4 top-14 flex flex-col items-end gap-1">
          <span className="font-mono text-[10px] text-[var(--fel-red)]">HYPE</span>
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/15">
            <div className="h-full bg-[var(--fel-red)] transition-[width] duration-300" style={{ width: `${Math.max(0, Math.min(100, hnum(hud.hype)))}%` }} />
          </div>
        </div>
      )}

      {/* CHARGE bar while loading the jump */}
      {phase === 'playing' && hnum(hud.charge) > 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-28 flex justify-center">
          <div className="h-2 w-40 overflow-hidden rounded-full bg-white/15">
            <div className={`h-full ${hud.slamPulse ? 'bg-[var(--fel-gold)]' : 'bg-[var(--fel-cyan)]'}`} style={{ width: `${Math.max(0, Math.min(100, hnum(hud.charge)))}%` }} />
          </div>
        </div>
      )}

      {/* SLAM! cue */}
      {hud.slamPulse === true && phase === 'playing' && (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 text-center">
          <span className="fel-heading text-4xl font-black text-[var(--fel-gold)] drop-shadow">SLAM!</span>
        </div>
      )}

      {/* Judge scorecard reveal */}
      {Array.isArray(hud.judgeReveal) && (
        <div className="pointer-events-none absolute inset-x-0 top-1/4 flex flex-col items-center gap-1">
          {(hud.judgeReveal as HudScoreCard[]).map((j) => (
            <div key={j.name} className="fel-panel flex items-center gap-3 px-3 py-1 font-mono text-xs">
              <span className="text-[var(--fel-cyan)]">{j.name}</span>
              <span className="text-lg font-bold text-[var(--fel-gold)]">{j.score}</span>
              <span className="max-w-[220px] truncate text-white/60">{j.line}</span>
            </div>
          ))}
        </div>
      )}

      {/* banner */}
      {typeof hud.banner === 'string' && hud.banner && (
        <div className="pointer-events-none absolute inset-x-0 top-[38%] text-center">
          <span className="fel-heading fel-panel px-4 py-2 text-2xl font-bold text-[var(--fel-cyan)]">{hud.banner}</span>
        </div>
      )}

      {typeof hud.hint === 'string' && hud.hint && phase === 'playing' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-10 text-center">
          <span className="fel-panel px-3 py-1.5 font-mono text-[11px] text-white/80">{hud.hint}</span>
        </div>
      )}

      {/* BootSplash: cartridge boot / venue art / progress / READY / 3-2-1 / error+retry */}
      <BootSplash
        modeId="dunk"
        title="DUNK"
        phase={phase}
        detail={phase === 'error' ? (loadError ?? undefined) : (countdown ?? undefined)}
        onStart={tapStart}
        onRetry={tapStart}
      />

      {/* pause */}
      {phase === 'paused' && (
        <button onClick={tapStart} className="absolute inset-0 flex items-center justify-center bg-black/60">
          <span className="fel-heading text-3xl font-bold text-white">PAUSED — TAP TO RESUME</span>
        </button>
      )}

      {/* M35: THE single touch control surface — one overlay per mode, ever. */}
      {(phase === 'playing' || phase === 'countdown') && busRef.current && (
        <TouchOverlay bus={busRef.current} modeId="dunk" visible />
      )}
    </div>
  );
}


