'use client';

// FEL Babylon FreeRun host (A+ mission #10 — replaces the gymnastics vault). THIN host: owns the <canvas>, boots the
// shared harness with FreeRunMode, bridges phase / HUD / result into GameShell. Skate 3 scoring read: pot, multiplier,
// banked; Mirror's Edge read: the speed and the verbs the speed unlocks.

import { useEffect, useRef, useState, useCallback } from 'react';
import type { GameProps, GameResult } from './game-shell';
import { BootSplash } from './boot-splash';
import { runMode, InputBus, type ModePhase, type SessionResult, type HudValue } from '@/lib/babylon';
import { MODES } from '@/lib/babylon/modes/registry';
import { TouchOverlay } from '@/lib/babylon/ui/TouchOverlay';
import { hnode } from './hud-format';

type Hud = Record<string, HudValue>;

export default function FreeRunBabylon({ onEnd }: GameProps) {
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
      const won = r.outcome === 'win';
      const t = Number(r.stats?.timeSec ?? 0);
      const result: GameResult = {
        score: r.score, stats: r.stats, outcome: r.outcome, opponentScore: 0, won, duration: r.durationSec,
        // RACING PASS phase 9: the place, the clock and the grade — the grade used to decide the win
        headline: (() => { const p = Number(r.stats?.place ?? 0), g = ' DCBAS'[Number(r.stats?.grade ?? 0)]?.trim() ?? ''; const ord = p === 1 ? '1ST' : p === 2 ? '2ND' : p === 3 ? '3RD' : `${p}TH`;
          return r.outcome === 'timeout' ? `OUT OF TIME · ${t}s` : `${p > 0 ? `${ord} · ` : ''}${t}s${g ? ` · GRADE ${g}` : ''}`; })(),
      };
      onEnd(result);
    };
    const startTimer = setTimeout(() => {
      if (disposed) return;
      runMode(MODES.freerun, {
        canvas, input: bus,
        onPhase: (p, cd) => { setPhase(p); setCountdown(p === 'countdown' && typeof cd === 'number' ? cd : null); setLoadError(p === 'error' ? (typeof cd === 'string' ? cd : 'Failed to load this mode.') : null); },
        onHud: (u) => setHud((prev) => ({ ...prev, ...u })),
        resultSink,
      }).then((s) => { if (disposed) { s(); return; } stop = s; }).catch((e) => console.error('[FEL-FREERUN] boot failed', e));
    }, 0);
    return () => { disposed = true; clearTimeout(startTimer); stop?.(); busRef.current = null; };
  }, [onEnd]);

  const emit = useCallback((e: Parameters<InputBus['emit']>[0]) => { busRef.current?.emit(e); }, []);
  const tapStart = useCallback(() => emit({ t: 'button', btn: 'START', pressed: true }), [emit]);
  const speed = Number(hud.speed ?? 0), speedMax = Number(hud.speedMax ?? 6.4);

  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-white/10 bg-black">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

      {/* top bar: banked + pot on the left, the clock + checkpoint centre, tier + route right */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between px-4 py-3 font-mono">
        {/* RIVALS (owner brief 2026-09-18): the rank and the gap to the leader, top-left */}
        {hud.place ? (
          <div className="fel-panel px-3 py-1.5">
            <div className="text-[10px] tracking-wider text-white/60">PLACE</div>
            <div className="fel-stat text-2xl text-[var(--fel-gold)]">{String(hud.place)}</div>
            <div className={`text-[10px] font-bold ${hud.delta === 'LEADING' ? 'text-[#86efac]' : 'text-white/70'}`}>{String(hud.delta ?? '')}{Number(hud.draft) >= 100 ? ' · SLINGSHOT READY' : Number(hud.draft) > 0 ? ` · DRAFT ${hnode(hud.draft, 0)}%` : ''}</div>
          </div>
        ) : null}
        <div className="fel-panel px-3 py-1.5">
          <div className="text-[10px] tracking-wider text-white/60">BANKED</div>
          <div className="fel-stat text-2xl text-[var(--fel-gold)]">{hnode(hud.banked, 0)}</div>
          {Number(hud.pot) > 0 && (
            <div className="mt-0.5 text-sm text-[#22d3ee]">+{hnode(hud.pot, 0)} <span className="text-white/60">{hnode(hud.combo, '')}</span></div>
          )}
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="fel-panel px-4 py-1.5 fel-stat text-2xl text-white">{Number(hud.time ?? 0).toFixed(1)}s</span>
          <span className="fel-panel px-2 py-0.5 text-[10px] tracking-wider text-white/70">CHECKPOINT {hnode(hud.checkpoint, '0/2')}</span>
        </div>
        <div className="fel-panel px-3 py-1.5 text-right">
          <div className="text-[10px] tracking-wider text-white/60">{hnode(hud.tier, 'ROOKIE')}{hud.track ? ` · ${String(hud.track).toUpperCase()}` : ''}</div>
          <div className={`text-sm font-bold ${hud.lane === 'HIGH' ? 'text-[#3FB8B0]' : hud.lane === 'LOW' ? 'text-[#f59e0b]' : 'text-white/80'}`}>{hud.lane ? `${String(hud.lane)} LANE` : hnode(hud.route, 'LOW LINE')}</div>
        </div>
      </div>

      {/* speed + the verbs the speed unlocks */}
      {phase === 'playing' && typeof hud.speed === 'number' && (
        <div className="pointer-events-none absolute left-4 top-24 flex flex-col gap-1 font-mono">
          <div className="text-[10px] tracking-wider text-white/60">SPEED {speed.toFixed(1)} m/s</div>
          <div className="h-2 w-40 overflow-hidden rounded-full bg-black/50">
            <div className="h-full rounded-full transition-[width] duration-100" style={{ width: `${Math.min(100, (speed / speedMax) * 100)}%`, background: speed >= 5.2 ? '#ff6a00' : speed >= 2.6 ? '#22d3ee' : '#ffffff80' }} />
          </div>
          {/* FLOW (owner brief 2026-09-18): the tier pips buy top speed and spend as a landing burst; KINETIC is the overdrive (Y) */}
          {typeof hud.flow === 'number' && (
            <div className="mt-1 flex items-center gap-1.5">
              <span className="text-[10px] tracking-wider text-white/60">FLOW</span>
              {[1, 2, 3].map((t) => <span key={t} className="inline-block h-2 w-5 rounded-sm" style={{ background: Number(hud.flow) >= t ? ['#22d3ee', '#22d3ee', '#a78bfa', '#fbbf24'][t] : 'rgba(255,255,255,0.15)' }} />)}
              <span className="h-1.5 w-16 overflow-hidden rounded-full bg-black/50"><span className="block h-full rounded-full bg-[#22d3ee]/70 transition-[width] duration-150" style={{ width: `${Math.max(0, Math.min(100, Number(hud.flowFrac ?? 0)))}%` }} /></span>
            </div>
          )}
          {typeof hud.kinetic === 'number' && (
            <div className="mt-0.5 flex items-center gap-1.5">
              <span className="text-[10px] tracking-wider text-white/60">KINETIC</span>
              <span className="h-2 w-28 overflow-hidden rounded-full bg-black/50"><span className={`block h-full rounded-full transition-[width] duration-150 ${Number(hud.kinetic) >= 100 ? 'bg-[#fbbf24]' : Number(hud.kinetic) >= 50 ? 'bg-[#fde68a]/80' : 'bg-white/40'}`} style={{ width: `${Math.max(0, Math.min(100, Number(hud.kinetic)))}%` }} /></span>
              {Number(hud.kinetic) >= 100 ? <span className="text-[10px] font-bold text-[#fbbf24]">SLAM READY</span> : Number(hud.kinetic) >= 50 ? <span className="text-[10px] font-bold text-[#fde68a]">BURST</span> : null}
            </div>
          )}
          {typeof hud.verbs === 'string' && hud.verbs && (
            <div className="flex flex-wrap gap-1">
              {hud.verbs.split(' · ').map((v) => (
                <span key={v} className={`rounded px-2 py-0.5 text-[10px] font-bold tracking-wider ${v === 'WALL RUN' || v === 'CAT LEAP' || v === 'WALL KICK' ? 'bg-[#ff6a00]/25 text-[#ff6a00]' : 'bg-black/50 text-white/85'}`}>{v}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {typeof hud.hint === 'string' && hud.hint && phase === 'playing' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-16 text-center">
          <span className="fel-panel px-3 py-1 font-mono text-[10px] text-white/70">{hud.hint}</span>
        </div>
      )}
      {typeof hud.banner === 'string' && hud.banner && (
        <div className="pointer-events-none absolute inset-x-0 top-1/3 text-center">
          <span className="fel-heading fel-panel px-4 py-2 text-2xl font-bold text-[var(--fel-gold)]">{hud.banner}</span>
        </div>
      )}

      <BootSplash modeId="freerun" title="FREE RUN" phase={phase} detail={phase === 'error' ? (loadError ?? undefined) : (countdown ?? undefined)} onStart={tapStart} onRetry={tapStart} />
      {(phase === 'playing' || phase === 'countdown') && busRef.current && <TouchOverlay bus={busRef.current} modeId="freerun" visible />}
    </div>
  );
}
