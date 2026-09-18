'use client';

// FEL Babylon timing-sports host (M22–M27 rollout wave 3). ONE thin host powers
// tennis, home-run derby, penalty shootout, and golf — exactly mirroring the
// single shared makeTimingSportMode core (never forked). makeTimingHost(modeKey)
// returns a GameShell-compatible component so each route stays a 1-line skin.
// All gameplay lives in lib/babylon/* — nothing is duplicated here.

import { useEffect, useRef, useState, useCallback } from 'react';
import type { GameProps, GameResult } from './game-shell';
import { BootSplash } from './boot-splash';
import { runMode, InputBus, type ModePhase, type SessionResult, type HudValue } from '@/lib/babylon';
import { MODES } from '@/lib/babylon/modes/registry';
import { TouchOverlay } from '@/lib/babylon/ui/TouchOverlay';
import { hnode } from './hud-format';

type Hud = Record<string, HudValue>;

export interface TimingHostOpts {
  /** Registry key: 'tennis' | 'derby' | 'penalty' | 'golf'. */
  modeKey: string;
  /** One-line control hint shown on the TAP TO START overlay. */
  hint: string;
  /** Label on the big swing button (e.g. SWING / STRIKE / KICK). */
  swingLabel: string;
  /** Log tag for boot errors. */
  tag: string;
}

/** Build a GameShell-compatible timing host bound to a specific registry mode. */
export function makeTimingHost(opts: TimingHostOpts) {
  const { modeKey, tag } = opts;

  function TimingBabylon({ onEnd }: GameProps) {
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
        const hits = Number(r.stats?.hits ?? 0);
        const rounds = Number(r.stats?.rounds ?? 0);
        const result: GameResult = {
          score: r.score,
          opponentScore: 0,
          won: r.outcome === 'GREAT', // GREAT = hit ≥60% of rounds cleanly
          duration: r.durationSec,
          headline: rounds ? `${hits}/${rounds} CLEAN · ${r.score} PTS` : `${r.score} PTS`,
          maxCombo: hits,
        };
        onEnd(result);
      };

      const def = MODES[modeKey];
      runMode(def, {
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
        .catch((e) => console.error(`[${tag}] boot failed`, e));

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

        {/* HUD bezel */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 px-4 py-3 font-mono text-xs">
          {/* M42 E20: render the mode's own round label as-is (RD/SHOT/KICK/PITCH) — no dup prefix */}
          <span className="fel-panel px-3 py-1 text-[var(--fel-cyan)]">{hnode(hud.round, '—')}</span>
          {/* M42 E20: numeric score gets " PTS"; string scores (e.g. "2 GOALS") render as-is */}
          <span className="rounded-md bg-black/50 px-3 py-1 text-white">{typeof hud.score === 'number' ? `${hud.score} PTS` : hnode(hud.score, '0 PTS')}</span>
        </div>

        {typeof hud.banner === 'string' && hud.banner && (
          <div className="pointer-events-none absolute inset-x-0 top-1/3 text-center">
            <span className="fel-heading fel-panel px-4 py-2 text-2xl font-bold text-[var(--fel-emerald)]">{hud.banner}</span>
          </div>
        )}

        <BootSplash
          modeId={modeKey}
          title={modeKey.replace(/_/g, ' ').toUpperCase()}
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

        {busRef.current && (
          <TouchOverlay bus={busRef.current} modeId={modeKey} visible={phase === 'playing' || phase === 'countdown'} />
        )}
      </div>
    );
  }

  TimingBabylon.displayName = `TimingBabylon(${modeKey})`;
  return TimingBabylon;
}


