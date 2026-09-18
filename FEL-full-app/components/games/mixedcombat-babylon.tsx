'use client';

// FEL Babylon Mixed Combat host (M53 Phase 3). Ring-out octagon duel
// with FISTS/STAFF loadouts on FightCore.

import { useEffect, useRef, useState, useCallback } from 'react';
import type { GameProps, GameResult } from './game-shell';
import { BootSplash } from './boot-splash';
import { runMode, InputBus, type ModePhase, type SessionResult, type HudValue } from '@/lib/babylon';
import { MODES } from '@/lib/babylon/modes/registry';
import { TouchOverlay } from '@/lib/babylon/ui/TouchOverlay';
import { hnode, hnum } from './hud-format';

type Hud = Record<string, HudValue>;

// Which mount currently owns a given canvas. StrictMode double-mounts this
// host: effect A starts an async runMode(), its cleanup fires before A has
// finished loading, then effect B starts on the SAME canvas — and A's late
// teardown disposed the engine holding B's WebGL context. Measured on the
// /play route: black frame, RenderWatchdog rescue fails on a dead context.
// Same guard as carnival-babylon / air-session-babylon.
const canvasOwner = new WeakMap<HTMLCanvasElement, object>();

export default function MixedCombatBabylon({ onEnd }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const busRef = useRef<InputBus | null>(null);
  const endedRef = useRef(false);
  const [phase, setPhase] = useState<ModePhase>('loading');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hud, setHud] = useState<Hud>({});
  // A parent passing an inline arrow gives a new onEnd every render — the
  // effect must NOT depend on its identity (see air-session-babylon).
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
      // The mode ends 'MATCH_WON'/'MATCH_LOST' — the old 'WIN' check here
      // made every recap read DEFEATED, and stats.wins never existed, so the
      // score was always 0 (the mode's score rides r.score).
      const won = r.outcome === 'MATCH_WON';
      const result: GameResult = {
        score: Math.max(0, Math.round(r.score ?? 0)),
        stats: r.stats, outcome: r.outcome,   // pass 5 phase 3: the proof line reads these
        opponentScore: Number(r.stats?.foeWins ?? 0),
        won,
        duration: r.durationSec,
        headline: won ? 'CHAMPION' : 'DEFEATED',
      };
      onEndRef.current(result);
    };

    runMode(MODES.mixedcombat, {
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
      .catch((e) => console.error('[FEL-COMBAT] boot failed', e));

    return () => {
      disposed = true;
      if (canvasOwner.get(canvas) === token) stop?.();
      busRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps — onEnd via ref, mount once
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
            <span className="fel-panel px-2 py-0.5 text-purple-400">CHI {hnum(hud.chi, 0)}</span>
          </div>
          <div className="text-center">
            <span className="fel-heading text-xl font-black">ROUND {hnode(hud.round, 1)}</span>
            <div className="text-xs mt-1">{hnode(hud.wins, 0)} – {hnode(hud.foeWins, 0)}</div>
            {typeof hud.loadout === 'string' && hud.loadout && <div className="text-xs text-cyan-300">{hud.loadout}</div>}
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

      {/* Edge danger — the ring-out is the signature, so the warning must be
          on the bezel, pulsing, the moment a back nears the rim. */}
      {typeof hud.edge === 'string' && hud.edge && phase === 'playing' && (
        <div className="pointer-events-none absolute inset-x-0 top-[22%] text-center">
          <span
            className={`fel-heading animate-pulse text-xl font-black drop-shadow ${
              hud.edge === 'EDGE BEHIND YOU' ? 'text-[#FF3366]' : 'text-[#00FF9D]'
            }`}
          >
            {hud.edge === 'EDGE BEHIND YOU' ? '⚠ EDGE BEHIND YOU ⚠' : 'RIVAL ON THE EDGE — PRESS!'}
          </span>
        </div>
      )}

      {/* The mode's own instructions (loadout pick, fight grammar). The mode
          published these every phase and no bezel ever drew them — trap:
          "published is not rendered". */}
      {typeof hud.hint === 'string' && hud.hint && (phase === 'playing' || phase === 'countdown') && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[13%] flex justify-center">
          <span className="fel-panel max-w-lg px-3 py-1 text-center text-[11px] text-white/80">{hud.hint}</span>
        </div>
      )}

      <BootSplash
        modeId="mixedcombat"
        title="RING'S EDGE"
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
        <TouchOverlay bus={busRef.current} modeId="mixedcombat" visible />
      )}
    </div>
  );
}
