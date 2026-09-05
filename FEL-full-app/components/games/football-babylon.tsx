'use client';

// FEL Babylon Street Football stage (M22–M27 rollout wave 1). THIN host: owns
// the <canvas>, boots the shared Babylon harness with the FootballMode
// ModeDefinition, and bridges phase/HUD/result into the existing GameShell
// pipeline. All gameplay lives in lib/babylon/* cores.

import { useEffect, useRef, useState, useCallback } from 'react';
import type { GameProps, GameResult } from './game-shell';
import { BootSplash } from './boot-splash';
import { runMode, InputBus, type ModePhase, type SessionResult, type HudValue } from '@/lib/babylon';
import { MODES } from '@/lib/babylon/modes/registry';
import { TouchOverlay } from '@/lib/babylon/ui/TouchOverlay';
import { hnode } from './hud-format';

type Hud = Record<string, HudValue>;

export default function FootballBabylon({ onEnd }: GameProps) {
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
      const won = r.outcome === 'TOUCHDOWN';
      const yards = Number(r.stats?.yards ?? 0);
      const result: GameResult = {
        score: r.score,
        stats: r.stats, outcome: r.outcome,   // pass 5 phase 3: the proof line reads these
        opponentScore: 0,
        won,
        duration: r.durationSec,
        headline: won ? 'TOUCHDOWN!' : `TACKLED · ${yards} YD`,
      };
      onEnd(result);
    };

    runMode(MODES.football, {
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
      .catch((e) => console.error('[FEL-FOOTBALL] boot failed', e));

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

      {/* HUD bezel. It used to render a field the mode has never published
          (the mode's is `evades`), and nothing else: no score, no toGo, no
          breakaway, no truck state. Same family trap as the 3PT board and the
          energy gauge — published state is not a bezel. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between px-4 py-3">
        <span className="rounded-md bg-black/50 px-3 py-1 font-mono text-sm font-bold text-white">
          {hnode(hud.down, '1')} & {hnode(hud.toGo, 10)}
        </span>
        <span className="rounded-md bg-black/50 px-3 py-1 font-mono text-sm font-bold text-[var(--fel-gold)]">
          {hnode(hud.score, 0)} PTS
        </span>
        <span className="fel-panel px-3 py-1 font-mono text-xs text-[var(--fel-emerald)]">
          {hnode(hud.yards, 0)} YD · {hnode(hud.evades, 0)} EVA
        </span>
      </div>

      {/* drive state chips: breakaway gear + truck cooldown */}
      <div className="pointer-events-none absolute left-4 top-14 flex flex-col gap-1 font-mono text-[10px] tracking-wider">
        {hud.breakaway === true && (
          <span className="rounded bg-[#ff2d78]/25 px-2 py-0.5 text-[#ff2d78]">BREAKAWAY</span>
        )}
        <span className={`rounded px-2 py-0.5 ${hud.truckReady === false ? 'bg-white/10 text-white/30' : 'bg-[#00E5FF]/15 text-[#00E5FF]'}`}>
          TRUCK {hud.truckReady === false ? '…' : 'READY'}
        </span>
      </div>

      {typeof hud.hint === 'string' && hud.hint && (
        <div className="pointer-events-none absolute inset-x-0 bottom-16 text-center">
          <span className="fel-panel px-3 py-1 font-mono text-[10px] text-white/70">{hud.hint}</span>
        </div>
      )}

      {typeof hud.banner === 'string' && hud.banner && (
        <div className="pointer-events-none absolute inset-x-0 top-1/3 text-center">
          <span className="fel-heading fel-panel px-4 py-2 text-2xl font-bold text-[var(--fel-gold)]">{hud.banner}</span>
        </div>
      )}

      <BootSplash
        modeId="football"
        title="BREAKAWAY"
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
        <TouchOverlay bus={busRef.current} modeId="football" visible />
      )}
    </div>
  );
}
