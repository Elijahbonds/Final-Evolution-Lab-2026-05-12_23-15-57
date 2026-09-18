'use client';

// FEL Babylon Dunk Duel host (M56 Phase 6). Pass-and-play head-to-head
// judged dunk contest for 2 local players.

import { readCourtLocation } from '@/lib/babylon/nexus/courtLocations';
import { useEffect, useRef, useState, useCallback } from 'react';
import type { GameProps, GameResult } from './game-shell';
import { BootSplash } from './boot-splash';
import { runMode, InputBus, type ModePhase, type SessionResult, type HudValue, type HudScoreCard } from '@/lib/babylon';
import { MODES } from '@/lib/babylon/modes/registry';
import { TouchOverlay } from '@/lib/babylon/ui/TouchOverlay';
import { hnode, hnum } from './hud-format';

type Hud = Record<string, HudValue>;

// Which mount currently owns a given canvas — StrictMode double-mounts this
// host, and an unguarded late teardown kills the live engine's WebGL context
// (the measured black-frame disease; same guard as carnival/air-session).
const canvasOwner = new WeakMap<HTMLCanvasElement, object>();

export default function DunkDuelBabylon({ onEnd }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const busRef = useRef<InputBus | null>(null);
  const endedRef = useRef(false);
  const [phase, setPhase] = useState<ModePhase>('loading');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hud, setHud] = useState<Hud>({});
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const token = {};
    canvasOwner.set(canvas, token);
    const bus = new InputBus();
    busRef.current = bus;
    let stop: (() => void) | null = null;
    let disposed = false;

    const resultSink = async (r: SessionResult) => {
      if (endedRef.current) return;
      endedRef.current = true;
      // The mode ends 'P1_WINS' / 'P2_WINS' / 'DUEL_TIED' with stats {p1,p2}
      // — the old 'WIN'/'LOSS' check + stats.p1Score reads made every recap
      // a 0–0 "DEAD HEAT!".
      const won = r.outcome === 'P1_WINS';
      const result: GameResult = {
        score: Number(r.stats?.p1 ?? r.score ?? 0),
        stats: r.stats, outcome: r.outcome,   // pass 5 phase 3: the proof line reads these
        opponentScore: Number(r.stats?.p2 ?? 0),
        won,
        duration: r.durationSec,
        headline: r.outcome === 'DUEL_TIED' ? 'DEAD HEAT!' : won ? 'P1 WINS!' : 'P2 WINS!',
      };
      onEndRef.current(result);
    };

    runMode(MODES.dunkduel, {
      canvas,
      location: readCourtLocation(),   // court location pick (docs/SPEC-COURT-LOCATIONS.md)
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
        // A newer mount owns the canvas: do NOT run our teardown.
        if (disposed) { if (canvasOwner.get(canvas) === token) s(); return; }
        stop = s;
      })
      .catch((e) => console.error('[FEL-DUNKDUEL] boot failed', e));

    return () => {
      disposed = true;
      if (canvasOwner.get(canvas) === token) stop?.();
      busRef.current = null;
    };
    // onEnd is read through a ref; this stage owns one mount lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
            <span className="fel-panel px-2 py-0.5 text-cyan-300">P1: {hnum(hud.p1Score, 0)}</span>
          </div>
          <div className="text-center">
            <span className="fel-heading text-xl font-black">{hnode(hud.activePlayer, 'P1')}</span>
            <div className="text-[11px] text-white/60">
              DUNK {hnode(hud.dunkNum, '1/2')} · {hnode(hud.style, 'POWER')} · {hnode(hud.prop, 'NO PROP')}
            </div>
            {typeof hud.hint === 'string' && hud.hint && <div className="text-xs text-gray-300 mt-1 max-w-xs">{hud.hint}</div>}
            {/* charge meter — the loaded jump, while it loads */}
            {typeof hud.charge === 'number' && hud.charge > 0 && (
              <div className="mx-auto mt-1 h-1.5 w-36 overflow-hidden rounded bg-white/10">
                <div
                  className="h-full bg-[var(--fel-cyan)] transition-none"
                  style={{ width: `${Math.min(100, hud.charge)}%` }}
                />
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1 items-end">
            <span className="fel-panel px-2 py-0.5 text-pink-400">P2: {hnum(hud.p2Score, 0)}</span>
          </div>
        </div>
      )}

      {/* SLAM pulse — the QTE window, impossible to miss */}
      {hud.slamPulse === true && phase === 'playing' && (
        <div className="pointer-events-none absolute inset-x-0 top-[30%] text-center">
          <span className="fel-heading animate-ping text-4xl font-black text-[var(--fel-gold)] drop-shadow">SLAM!</span>
        </div>
      )}

      {/* the judges' cards — the contest's moment of truth (same staged
          reveal as Dunk Contest's bezel) */}
      {Array.isArray(hud.judgeReveal) && (hud.judgeReveal as HudScoreCard[]).length > 0 && (
        <div className="pointer-events-none absolute inset-x-0 top-[20%] flex flex-col items-center gap-2">
          <div className="flex items-end justify-center gap-1.5">
            {(hud.judgeReveal as HudScoreCard[]).map((j) => (
              <div key={j.name} className="fel-panel flex flex-col items-center px-2.5 py-1">
                <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--fel-cyan)]">{j.name}</span>
                <span className="text-2xl font-black leading-none text-[var(--fel-gold)]">{j.score}</span>
              </div>
            ))}
            <div className="fel-panel ml-1 flex flex-col items-center border-[var(--fel-gold)]/40 px-3 py-1">
              <span className="font-mono text-[9px] uppercase tracking-wider text-white/50">total</span>
              <span className="text-2xl font-black leading-none text-white">
                {(hud.judgeReveal as HudScoreCard[]).reduce((s, j) => s + Number(j.score), 0)}
              </span>
            </div>
          </div>
          <span className="fel-panel max-w-[85%] truncate px-3 py-1 font-mono text-[11px] text-white/70">
            {(hud.judgeReveal as HudScoreCard[])[(hud.judgeReveal as HudScoreCard[]).length - 1].line}
          </span>
        </div>
      )}

      {typeof hud.banner === 'string' && hud.banner && phase === 'playing' && (
        <div className="pointer-events-none absolute inset-x-0 top-1/3 text-center">
          <span className="fel-heading text-3xl font-bold text-[var(--fel-cyan)] drop-shadow">{hud.banner}</span>
        </div>
      )}

      <BootSplash
        modeId="dunkduel"
        title="PROVE IT"
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
        <TouchOverlay bus={busRef.current} modeId="dunkduel" visible />
      )}
    </div>
  );
}
