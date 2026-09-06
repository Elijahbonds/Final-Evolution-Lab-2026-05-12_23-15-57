'use client';
// Who Scene It — Babylon host (lane 3 W1). A thin host like dunk-babylon: it owns the canvas, boots the harness with the
// live venue quiz, and draws the question card over the sweep. The four answers are buttons here AND the four face
// buttons on any pad (the mode reads A/B/X/Y). Results flow back through GameShell's onEnd like every other mode.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameProps, GameResult } from './game-shell';
import { runMode, InputBus, type ModePhase, type SessionResult, type HudValue } from '@/lib/babylon';
import { MODES } from '@/lib/babylon/modes/registry';
import { hnode } from './hud-format';

type Hud = Record<string, HudValue>;
const OPTS: { key: 'optA' | 'optB' | 'optX' | 'optY'; btn: 'A' | 'B' | 'X' | 'Y'; face: string; color: string }[] = [
  { key: 'optA', btn: 'A', face: 'A', color: '#22d3ee' }, { key: 'optB', btn: 'B', face: 'B', color: '#f43f5e' },
  { key: 'optX', btn: 'X', face: 'C', color: '#a855f7' }, { key: 'optY', btn: 'Y', face: 'D', color: '#facc15' },
];

export default function WhoSceneItBabylon({ onEnd }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const busRef = useRef<InputBus | null>(null);
  const endedRef = useRef(false);
  const [phase, setPhase] = useState<ModePhase>('loading');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hud, setHud] = useState<Hud>({});

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const bus = new InputBus(); busRef.current = bus;
    let stop: (() => void) | null = null; let disposed = false;
    const resultSink = async (r: SessionResult) => {
      if (endedRef.current) return; endedRef.current = true;
      const won = r.outcome === 'WIN' || r.outcome === 'win';
      const result: GameResult = {
        score: r.score, stats: r.stats, outcome: r.outcome, opponentScore: 0, won, duration: r.durationSec,
        headline: won ? 'SCENE MASTER' : 'ROUND OVER',
        tallies: { hits: r.stats?.correct ?? 0, misses: Math.max(0, (r.stats?.total ?? 0) - (r.stats?.correct ?? 0)), dodges: 0, combos: r.stats?.bestStreak ?? 0 },
      };
      onEnd(result);
    };
    const startTimer = setTimeout(() => {
      if (disposed) return;
      runMode(MODES.who_scene_it, {
        canvas, input: bus,
        onPhase: (p, cd) => { setPhase(p); setCountdown(p === 'countdown' && typeof cd === 'number' ? cd : null); setLoadError(p === 'error' ? (typeof cd === 'string' ? cd : 'Failed to load this mode.') : null); },
        onHud: (u) => setHud((prev) => ({ ...prev, ...u })),
        resultSink,
      }).then((s) => { if (disposed) { s(); return; } stop = s; }).catch((e) => console.error('[FEL-WSI] boot failed', e));
    }, 0);
    return () => { disposed = true; clearTimeout(startTimer); stop?.(); busRef.current = null; };
  }, [onEnd]);

  const emit = useCallback((e: Parameters<InputBus['emit']>[0]) => { busRef.current?.emit(e); }, []);
  const tapStart = useCallback(() => emit({ t: 'button', btn: 'START', pressed: true }), [emit]);
  const revealing = typeof hud.reveal === 'string' && hud.reveal.length > 0;

  return (
    <div className="relative h-[calc(100dvh-3.25rem)] w-full overflow-hidden bg-transparent">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

      {/* top bar: pack · question · clock · score */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 px-4 py-3 font-mono text-xs">
        <div className="flex items-center gap-2">
          <span className="fel-panel px-2 py-1 text-[var(--fel-cyan)]">{hnode(hud.pack, '')}</span>
          {hud.question != null && <span className="fel-panel px-2 py-1 text-white/70">{hnode(hud.question)}</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className={`fel-panel px-3 py-1 text-lg ${Number(hud.clock) <= 3 ? 'text-[var(--fel-red)]' : 'text-white'}`}>{hnode(hud.clock, 0)}s</span>
          <span className="fel-panel fel-stat px-3 py-1 text-lg">{hnode(hud.score, 0)}</span>
          {Number(hud.streak) > 1 && <span className="fel-panel px-2 py-1 text-[var(--fel-gold)]">x{hnode(hud.streak)}</span>}
        </div>
      </div>

      {/* the question card + four answers (also the pad's A B X Y) */}
      {phase === 'playing' && typeof hud.prompt === 'string' && hud.prompt && (
        <div className="absolute inset-x-0 bottom-3 flex flex-col items-center gap-2 px-3">
          <div className="fel-panel max-w-[560px] px-4 py-2 text-center text-sm font-semibold text-white">{hud.prompt}</div>
          <div className="grid w-full max-w-[560px] grid-cols-2 gap-2">
            {OPTS.map((o) => (
              <button key={o.key} disabled={revealing} onPointerDown={(e) => { e.preventDefault(); emit({ t: 'button', btn: o.btn, pressed: true }); }}
                className="fel-panel flex items-center gap-2 rounded-xl px-3 py-3 text-left text-sm text-white disabled:opacity-60" style={{ borderColor: `${o.color}66` }}>
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full font-mono text-[11px] font-bold text-black" style={{ background: o.color }}>{o.face}</span>
                <span className="truncate">{hnode(hud[o.key], '')}</span>
              </button>
            ))}
          </div>
          {typeof hud.banner === 'string' && hud.banner && <div className="fel-panel px-3 py-1 font-mono text-xs text-[var(--fel-gold)]">{hud.banner}</div>}
          {revealing && <div className="fel-panel max-w-[560px] px-3 py-1 text-center font-mono text-[11px] text-white/70">{hud.reveal as string}</div>}
        </div>
      )}

      {/* ready / countdown / error gates */}
      {phase === 'ready' && (
        <button onClick={tapStart} className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 text-center">
          <span className="fel-heading text-3xl font-black text-white">WHO SCENE IT</span>
          <span className="mt-2 font-mono text-xs text-white/70">name the place · A B C D answer · faster pays more</span>
          <span className="mt-6 rounded-xl bg-[var(--fel-cyan)] px-6 py-3 font-bold text-black">TAP TO START</span>
        </button>
      )}
      {phase === 'countdown' && countdown != null && <div className="pointer-events-none absolute inset-0 flex items-center justify-center"><span className="fel-heading text-7xl font-black text-white drop-shadow">{countdown}</span></div>}
      {phase === 'error' && <div className="absolute inset-0 flex items-center justify-center bg-black/60 p-6 text-center font-mono text-sm text-[var(--fel-red)]">{loadError}</div>}
    </div>
  );
}
