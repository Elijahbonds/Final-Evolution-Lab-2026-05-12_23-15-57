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
/** FOOTBALL UPGRADE: the breakaway meter's lines arrive as '0.333,0.667'. */
const ticksOf = (v: unknown): number[] => (typeof v === 'string' && v ? v.split(',').map(Number) : []);

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
        {/* FOOTBALL UPGRADE: the BREAKAWAY meter — a line per evade toward it, then its own clock draining */}
        {typeof hud.breakawayFill === 'number' && (
          <div className="mt-0.5 flex flex-col gap-0.5">
            <span className={`text-[9px] ${hud.breakaway === true ? 'text-[#ff2d78]' : 'text-white/50'}`}>{hud.breakaway === true ? 'BREAKAWAY — gone' : 'EVADES → BREAKAWAY'}</span>
            <div className="relative h-2.5 w-32 overflow-hidden rounded-sm border border-white/25 bg-black/50">
              <div className={`absolute inset-y-0 left-0 ${hud.breakaway === true ? 'bg-[#ff2d78]' : 'bg-[#00E5FF]/70'}`} style={{ width: `${Math.max(0, Math.min(1, hud.breakawayFill)) * 100}%` }} />
              {ticksOf(hud.breakawayTicks).map((t, i) => <div key={i} className="absolute inset-y-0 w-px bg-white/70" style={{ left: `${t * 100}%` }} />)}
            </div>
          </div>
        )}
        {typeof hud.weather === 'string' && hud.weather && <span className="rounded bg-white/10 px-2 py-0.5 text-white/70">{hud.weather}</span>}
      </div>

      {/* A+ mission #9 (Tecmo Bowl feel + Madden readability): the field strip — ball, line of scrimmage, first-down line
          in yards — the TARGET read on the nearest defender, and the drive card between drives. All key-gated. */}
      {typeof hud.ballOn === 'number' && typeof hud.fieldLen === 'number' && (
        <div className="pointer-events-none absolute inset-x-0 top-12 flex flex-col items-center gap-1 font-mono">
          <div className="relative h-4 w-[min(560px,72vw)] overflow-hidden rounded-sm border border-white/25 bg-[#1f6b2f]/70">
            {Array.from({ length: Math.floor(hud.fieldLen / 10) + 1 }, (_, i) => (
              <div key={i} className="absolute inset-y-0 w-px bg-white/40" style={{ left: `${(i * 10 / Number(hud.fieldLen)) * 100}%` }} />
            ))}
            {typeof hud.los === 'number' && <div className="absolute inset-y-0 w-[2px] bg-[#22d3ee]" style={{ left: `${(hud.los / hud.fieldLen) * 100}%` }} />}
            {typeof hud.firstDown === 'number' && <div className="absolute inset-y-0 w-[2px] bg-[var(--fel-gold)]" style={{ left: `${Math.min(100, (hud.firstDown / hud.fieldLen) * 100)}%` }} />}
            <div className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_8px_#fff]" style={{ left: `${Math.min(100, (hud.ballOn / hud.fieldLen) * 100)}%` }} />
          </div>
          <div className="flex items-center gap-3 text-[10px] tracking-wider text-white/70">
            <span>BALL ON {hud.ballOn}</span>
            <span className="text-[var(--fel-gold)]">1ST AT {hnode(hud.firstDown, '—')}</span>
            <span>GOAL {hud.fieldLen}</span>
            {typeof hud.drive === 'string' && hud.drive && <span className="text-white/50">DRIVE {hud.drive}</span>}
          </div>
        </div>
      )}
      {typeof hud.target === 'string' && hud.target && (
        <div className="pointer-events-none absolute inset-x-0 bottom-28 text-center font-mono">
          <span className="fel-panel px-3 py-1 text-sm font-bold text-[#ff2d78]">TARGET {hud.target}</span>
        </div>
      )}
      {Array.isArray(hud.board) && typeof hud.boardTitle === 'string' && hud.boardTitle && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-4 font-mono">
          <div className="fel-panel w-full max-w-[440px] px-5 py-4">
            <div className="fel-heading text-2xl font-black text-white">DRIVE CARD</div>
            <div className="mt-3 grid gap-1.5">
              {(hud.board as { name: string; score: number | string; line: string }[]).map((r) => (
                <div key={r.name} className="flex items-center justify-between gap-3 rounded-lg bg-black/40 px-3 py-1.5">
                  <span className="text-sm font-bold text-white/90">{r.name}</span>
                  <span className="truncate text-[11px] text-white/60">{r.line}</span>
                  <span className="fel-stat text-lg">{r.score} YD</span>
                </div>
              ))}
            </div>
            <div className="mt-3 text-[11px] text-[var(--fel-gold)]">{hud.boardTitle}</div>
          </div>
        </div>
      )}

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
