'use client';

// FEL Babylon 3V3 Streetball stage (M48). THIN host: owns the <canvas>, boots
// the shared Babylon harness with the ThreeVThree ModeDefinition, and bridges
// phase/HUD/result into the existing GameShell pipeline. All gameplay lives in
// lib/babylon/* cores (BasketballCore + PlayerSlot + TeammateBrain).

import { readCourtLocation } from '@/lib/babylon/nexus/courtLocations';
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
      // 'DRAW' is a real outcome at the buzzer now, and it is neither a win nor a defeat.
      // Reporting a level game as GAME OVER would be as dishonest as the WIN it replaced.
      const drew = r.outcome === 'DRAW';
      const won = r.outcome === 'WIN';
      const result: GameResult = {
        score: r.score,
        stats: r.stats, outcome: r.outcome,   // pass 5 phase 3: the proof line reads these
        opponentScore: r.stats?.foeScore ?? 0,
        won,
        duration: r.durationSec,
        headline: won ? 'GAME WON' : drew ? 'DEAD EVEN' : 'GAME OVER',
      };
      onEnd(result);
    };

    // StrictMode runs effect -> cleanup -> effect. Starting the harness
    // immediately means the PHANTOM mount also builds a Babylon engine, and its
    // cleanup cannot cancel it — `stop` is not assigned until the async load
    // resolves. Two engines then sit on the SAME canvas sharing one WebGL
    // context and fight, and the loser renders nothing: the HUD streams happily
    // from one instance while the canvas shows an empty void. Measured on this
    // mode: mountVenue ran TWICE and the scene came out at 5 meshes.
    // Deferring by a tick lets the phantom mount be cancelled before it builds.
    // Identical fix to the one the Dunk host needed.
    const startTimer = setTimeout(() => {
      if (disposed) return;
      runMode(MODES.threevthree, {
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
          if (disposed) { s(); return; }
          stop = s;
        })
        .catch((e) => console.error('[FEL-HOOPS3] boot failed', e));
    }, 0);

    return () => {
      disposed = true;
      clearTimeout(startTimer);
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
        {/* SYNERGY (owner brief 2026-09-18): the team's shared gauge — assists, steals, drifts, blocks, dunks and the slipstream fill it; full, it OVERDRIVES for 15 s */}
        {typeof hud.synergy === 'number' && (() => {
          const syn = Math.max(0, Math.min(100, Number(hud.synergy))); const od = Number(hud.overdrive ?? 0);
          return (
            <span className="fel-panel flex items-center gap-2 px-3 py-1 font-mono text-xs">
              <span className="text-[10px] tracking-wider text-white/60">SYN</span>
              <span className="h-2 w-20 overflow-hidden rounded-full bg-black/50"><span className={`block h-full rounded-full transition-[width] duration-150 ${od > 0 ? 'bg-[#fbbf24]' : syn >= 70 ? 'bg-[#fde68a]/85' : 'bg-[var(--fel-cyan)]/80'}`} style={{ width: `${od > 0 ? 100 : syn}%` }} /></span>
              {od > 0 ? <span className="text-[10px] font-bold text-[#fbbf24]">OVERDRIVE {od}s</span> : null}
            </span>
          );
        })()}
        <span className="fel-panel px-3 py-1 font-mono text-xs text-[var(--fel-gold)]">
          {typeof hud.time === 'number' ? `${hud.time}s` : 'TO 21'}
        </span>
      </div>

      {/* shot meter */}
      {meter !== null && phase === 'playing' && (() => {
        // THE SHOT METER (owner, 2026-09-18): the bar carries the GREEN release window the mode publishes
        // (`shotMeterGreen` = "center,half" in 0..1) and a marker on the fill — the 3D bar beside the shooter's head
        // (visual/ShotMeter3D) shows the same numbers in the world
        const g = typeof hud.shotMeterGreen === 'string' ? hud.shotMeterGreen.split(',').map(Number) : null;
        const green = g && g.length === 2 && g.every((v) => Number.isFinite(v)) ? { left: (g[0] - g[1]) * 100, width: g[1] * 200 } : null;
        return (
          <div className="pointer-events-none absolute inset-x-0 bottom-24 flex justify-center">
            <div className="relative h-3 w-64 overflow-hidden rounded-full bg-black/55 ring-1 ring-white/30">
              {green && <div className="absolute inset-y-0 bg-[#39ff88]/70" style={{ left: `${green.left}%`, width: `${green.width}%` }} />}
              <div className="h-full bg-[var(--fel-cyan)]/90" style={{ width: `${meter * 100}%` }} />
              <div className="absolute inset-y-0 w-[3px] -translate-x-1/2 bg-white shadow-[0_0_6px_#fff]" style={{ left: `${meter * 100}%` }} />
            </div>
          </div>
        );
      })()}

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
        title="THREES"
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
