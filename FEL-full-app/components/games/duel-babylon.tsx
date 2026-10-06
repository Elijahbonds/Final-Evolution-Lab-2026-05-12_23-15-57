'use client';

// FEL Babylon Duel host — the Soul-Calibur-lane weapon duel (DuelMode.ts).
// This mode was fully built and registered but had no route anywhere in the
// app; this file (plus app/play/duel/*) is what actually makes it playable.

import { useEffect, useRef, useState, useCallback } from 'react';
import type { GameProps, GameResult } from './game-shell';
import { useBabylonPlaytestBridge } from './use-babylon-playtest-bridge';
import { BootSplash } from './boot-splash';
import { surfaceBootError } from './boot-error';
import { runMode, InputBus, type ModePhase, type SessionResult, type HudValue } from '@/lib/babylon';
import { MODES } from '@/lib/babylon/modes/registry';
import { mergeHud } from '@/lib/babylon/core/hudMerge';   // IMPROVE (2026-10-06): an unchanged HUD patch is not a render
import { TouchOverlay } from '@/lib/babylon/ui/TouchOverlay';
import { hnode, hnum } from './hud-format';

type Hud = Record<string, HudValue>;

const canvasOwner = new WeakMap<HTMLCanvasElement, object>();

export default function DuelBabylon({ onEnd }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const busRef = useRef<InputBus | null>(null);
  const endedRef = useRef(false);
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;
  const [phase, setPhase] = useState<ModePhase>('loading');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hud, setHud] = useState<Hud>({});
  useBabylonPlaytestBridge('duel', () => ({ phase, countdown, loadError, hud }), busRef.current);

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
      const won = r.outcome === 'DUEL_WON';
      const result: GameResult = {
        // IMPROVE (2026-10-06): the mode's score (rounds + ring-outs + guard impacts — duelRules). This read `stats.wins`,
        // which the mode never sent, so every duel recorded 0; floored at 0 (a 0–2 loss is −80, and a negative score is refused)
        score: Math.max(0, Math.round(r.score ?? 0)),
        stats: r.stats, outcome: r.outcome,   // pass 5 phase 3: the proof line reads these
        opponentScore: Number(r.stats?.foeWins ?? 0),
        won,
        duration: r.durationSec,
        headline: won ? 'DUEL WON' : 'DUEL LOST',
      };
      onEndRef.current(result);
    };

    const startTimer = setTimeout(() => {
      if (disposed) return;
      runMode(MODES.duel, {
        canvas,
        input: bus,
        onPhase: (p, cd) => {
          if (disposed) return;
          setPhase(p);
          setCountdown(p === 'countdown' && typeof cd === 'number' ? cd : null);
          setLoadError(p === 'error' ? (typeof cd === 'string' ? cd : 'Failed to load this mode.') : null);
        },
        onHud: (u) => { if (!disposed) setHud((prev) => mergeHud(prev, u)); },
        resultSink,
      })
        .then((s) => {
          if (disposed) { if (canvasOwner.get(canvas) === token) s(); return; }
          stop = s;
        })
        .catch((e) => surfaceBootError(e, { disposed, label: '[FEL-DUEL] boot failed', setPhase, setLoadError }));
    }, 0);

    return () => {
      disposed = true;
      clearTimeout(startTimer);
      if (canvasOwner.get(canvas) === token) stop?.();
      busRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- G7: the stage is owned by the mount; callbacks are read through refs.
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
            <span className="fel-panel px-2 py-0.5 text-cyan-300">HP {hnum(hud.hp, 100)}</span>
            <span className="fel-panel px-2 py-0.5 text-yellow-400">GUARD {hnum(hud.guard, 100)}</span>
          </div>
          <div className="text-center">
            <span className="fel-heading text-xl font-black">ROUND {hnode(hud.round, 1)}</span>
            <div className="text-xs mt-1">{hnode(hud.wins, 0)} – {hnode(hud.foeWins, 0)}</div>
            {/* IMPROVE (2026-10-06): the round clock — a round that runs out is decided on HP at the bell (TIME); it was invisible */}
            {typeof hud.timeLeft === 'number' && (
              <div className={`text-xs mt-0.5 tabular-nums ${hud.timeLeft <= 10 ? 'text-red-400' : 'text-white/70'}`} title="Round clock">
                {Math.floor(hud.timeLeft / 60)}:{String(hud.timeLeft % 60).padStart(2, '0')}
              </div>
            )}
            {typeof hud.hint === 'string' && hud.hint && <div className="text-xs text-gray-300 mt-1">{hud.hint}</div>}
          </div>
          <div className="flex flex-col gap-1 items-end">
            <span className="fel-panel px-2 py-0.5 text-red-400">FOE HP {hnum(hud.foeHp, 100)}</span>
            <span className="fel-panel px-2 py-0.5 text-yellow-400">FOE GUARD {hnum(hud.foeGuard, 100)}</span>
            {/* IMPROVE (2026-10-06): the rival's chi fills now — a dash, a substitution, at 100 its CRITICAL EDGE */}
            <span className="fel-panel px-2 py-0.5 text-purple-400">FOE CHI {hnum(hud.foeChi, 0)}</span>
          </div>
        </div>
      )}

      {/* IMPROVE (2026-10-06): the edge call has its own field — it used to overwrite the controls hint and never clear */}
      {typeof hud.edge === 'string' && hud.edge && phase === 'playing' && (
        <div className="pointer-events-none absolute inset-x-0 top-[22%] text-center">
          <span className={`fel-heading animate-pulse text-xl font-black drop-shadow ${hud.edge === 'EDGE BEHIND YOU' ? 'text-[#FF3366]' : 'text-[#00FF9D]'}`}>
            {hud.edge === 'EDGE BEHIND YOU' ? '⚠ EDGE BEHIND YOU ⚠' : 'RIVAL ON THE EDGE — PRESS!'}
          </span>
        </div>
      )}

      {typeof hud.banner === 'string' && hud.banner && phase === 'playing' && (
        <div className="pointer-events-none absolute inset-x-0 top-1/3 text-center">
          <span className="fel-heading text-3xl font-bold text-[var(--fel-cyan)] drop-shadow">{hud.banner}</span>
        </div>
      )}

      <BootSplash
        modeId="duel"
        title="DUEL"
        phase={phase}
        detail={phase === 'error' ? (loadError ?? undefined) : (countdown ?? undefined)}
        onStart={tapStart}
        onRetry={tapStart}
      />

      {(phase === 'playing' || phase === 'countdown') && busRef.current && (
        <TouchOverlay bus={busRef.current} modeId="duel" visible />
      )}
    </div>
  );
}
