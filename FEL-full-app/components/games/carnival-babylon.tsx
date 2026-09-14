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
import { PadChips } from '@/lib/babylon/ui/PadChips';   // CONTROLLER-UNIVERSAL-MULTI: pass-the-pad nights name each controller
import { hnode } from './hud-format';
/** The between-events scoreboard rows the mode publishes (HudScoreCard shape). */
const isBoard = (v: unknown): v is { name: string; score: number | string; line: string }[] =>
  Array.isArray(v) && v.every((r) => !!r && typeof r === 'object' && 'line' in (r as object));

type Hud = Record<string, HudValue>;

// Which mount currently owns a given canvas. The in-run hub (?carnival=1)
// double-mounts this component (StrictMode + the hub's Suspense boundary):
// effect A starts an async runMode(), its cleanup fires before A has even
// finished loading, then effect B starts on the SAME canvas — and A's late
// teardown disposed the engine holding B's WebGL context. Measured on the
// mobile leg: "carnival → loading" twice, then a black frame forever and the
// RenderWatchdog's rescue could not fix a dead context. The token pattern is
// ported from air-session-babylon, which has the guard and never goes black.
const canvasOwner = new WeakMap<HTMLCanvasElement, object>();

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
  const token = {};
  canvasOwner.set(canvas, token);
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
        stats: r.stats, outcome: r.outcome,   // pass 5 phase 3: the proof line reads these
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
        // A newer mount owns the canvas: do NOT run our teardown — it would
        // dispose the engine holding the shared WebGL context.
        if (disposed) { if (canvasOwner.get(canvas) === token) s(); return; }
        stop = s;
      })
      .catch((e) => console.error('[FEL-CARNIVAL] boot failed', e));

    return () => {
      disposed = true;
      if (canvasOwner.get(canvas) === token) stop?.();
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
          <span className="mr-1 text-[10px] text-[#22d3ee]">{hnode(hud.p1name, 'YOU')}</span>{hnode(hud.score, 0)}
          <span className="mx-2 text-white/40">vs</span>
          <span className="mr-1 text-[10px] text-[#facc15]">{hnode(hud.p2name, 'RIVAL')}</span>{hnode(hud.rivalScore, 0)}
          {typeof hud.rivalLive === 'number' && hud.rivalLive > 0 && phase === 'playing' && (
            <span className="ml-1 text-xs text-[#facc15]/80">+{hud.rivalLive}</span>
          )}
        </span>
        <div className="flex items-center gap-2">
          {hud.eventNum != null && (
            <span className="fel-panel px-3 py-1 font-mono text-xs text-[var(--fel-purple)]">
              EVENT {hnode(hud.eventNum, '')}
            </span>
          )}
          {typeof hud.turnLabel === 'string' && hud.turnLabel && phase === 'playing' && (
            <span className="fel-panel px-3 py-1 font-mono text-xs font-bold text-white">{hud.turnLabel}</span>
          )}
          {typeof hud.time === 'number' && phase === 'playing' && (
            <span className="fel-panel px-3 py-1 font-mono text-sm font-bold text-[var(--fel-gold)]">
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

      {/* reveal / result / finale card — A+ mission #3: title, the verb line, and the scoreboard between events */}
      {typeof hud.banner === 'string' && hud.banner && (
        <div className="pointer-events-none absolute inset-x-0 top-[22%] flex flex-col items-center gap-2 px-4 text-center">
          <span className="fel-heading fel-panel px-6 py-2 text-3xl font-black text-[var(--fel-cyan)] drop-shadow md:text-4xl">{hud.banner}</span>
          {typeof hud.blurb === 'string' && hud.blurb && (
            <span className="fel-panel px-4 py-1.5 font-mono text-sm font-bold text-white/90">{hud.blurb}</span>
          )}
          {typeof hud.hint === 'string' && hud.hint && phase === 'playing' && !(typeof hud.eventNum === 'string' && hud.eventNum) && (
            <span className="fel-panel px-3 py-1 font-mono text-xs text-white/70">{hud.hint}</span>
          )}
          {isBoard(hud.board) && typeof hud.boardTitle === 'string' && hud.boardTitle && (
            <div className="fel-panel mt-2 w-full max-w-[460px] px-4 py-3 text-left">
              <div className="grid gap-1.5">
                {hud.board.map((r, i) => (
                  <div key={r.name} className="flex items-center justify-between gap-3 rounded-lg bg-black/40 px-3 py-1.5">
                    <span className="font-mono text-sm font-bold" style={{ color: i === 0 ? '#22d3ee' : '#facc15' }}>{r.name}</span>
                    <span className="truncate font-mono text-[11px] text-white/60">{r.line}</span>
                    <span className="fel-stat text-lg">{r.score}</span>
                  </div>
                ))}
              </div>
              <div className="mt-2 text-center font-mono text-[11px] text-[var(--fel-gold)]">{hud.boardTitle}</div>
            </div>
          )}
        </div>
      )}

      <BootSplash
        modeId="carnival"
        title="GAME NIGHT"
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

      {busRef.current && <PadChips bus={busRef.current} className="left-4 bottom-4" />}
      {(phase === 'playing' || phase === 'countdown') && busRef.current && (
        <TouchOverlay bus={busRef.current} modeId="carnival" visible />
      )}
    </div>
  );
}
