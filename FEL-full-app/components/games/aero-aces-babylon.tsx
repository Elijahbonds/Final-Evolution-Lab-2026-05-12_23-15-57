'use client';

// FEL Babylon Aero Aces host — THIN: owns the <canvas>, boots the shared harness with AeroAcesMode, and
// bridges phase / HUD / result into GameShell. Every constant lives in the mode and the flight model.
//
// WHY THIS EXISTS (2026-09-13): Aero Aces shipped as a registered, ENABLED mode with no player-facing route
// at all — reachable only from /dev/mode. Worse, it is listed in MP_MODES as a challenge you can stake a run
// against, and the session mode it maps to (`aeroAces`) was posted by NOBODY, so a challenge on it could
// never settle. That is the exact bug match-core's own comment records from 2026-09-04, on a new mode.
//
// The HUD reads the three numbers a time-attack course is about: which gate you are chasing, which lap you
// are on, and the clock.

import { useEffect, useRef, useState, useCallback } from 'react';
import type { GameProps, GameResult } from './game-shell';
import { BootSplash } from './boot-splash';
import { BoostGauge } from './boost-hud';
import { runMode, InputBus, type ModePhase, type SessionResult, type HudValue } from '@/lib/babylon';
import { MODES } from '@/lib/babylon/modes/registry';
import { TouchOverlay } from '@/lib/babylon/ui/TouchOverlay';
import { hnode } from './hud-format';

type Hud = Record<string, HudValue>;

/** The balloon colours (AeroItems.BALLOON_COLOR), for the item box. */
const ITEM_COLOR: Record<string, string> = { missile: '#ff4b4b', boost: '#3aa0ff', shield: '#ffd75e', mine: '#4fdc6a' };

export default function AeroAcesBabylon({ onEnd }: GameProps) {
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
      const t = Number(r.stats?.seconds ?? r.stats?.timeSec ?? 0);
      const place = Number(r.stats?.place ?? 0);
      onEnd({
        score: r.score, stats: r.stats, outcome: r.outcome, opponentScore: 0,
        won: r.outcome === 'WIN', duration: r.durationSec,
        headline: place > 0 ? `${place === 1 ? '1ST' : place === 2 ? '2ND' : place === 3 ? '3RD' : `${place}TH`} PLACE${t > 0 ? ` · ${t.toFixed(1)}s` : ''}` : 'FLIGHT COMPLETE',
      } satisfies GameResult);
    };

    const startTimer = setTimeout(() => {
      if (disposed) return;
      runMode(MODES.aeroaces, {
        canvas, input: bus,
        onPhase: (p, cd) => {
          setPhase(p);
          setCountdown(p === 'countdown' && typeof cd === 'number' ? cd : null);
          setLoadError(p === 'error' ? (typeof cd === 'string' ? cd : 'Failed to load this mode.') : null);
        },
        onHud: (u) => setHud((prev) => ({ ...prev, ...u })),
        resultSink,
      }).then((s) => { if (disposed) { s(); return; } stop = s; })
        .catch((e) => console.error('[FEL-AERO] boot failed', e));
    }, 0);

    return () => { disposed = true; clearTimeout(startTimer); stop?.(); busRef.current = null; };
  }, [onEnd]);

  const emit = useCallback((e: Parameters<InputBus['emit']>[0]) => { busRef.current?.emit(e); }, []);
  const tapStart = useCallback(() => emit({ t: 'button', btn: 'START', pressed: true }), [emit]);

  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-white/10 bg-black">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

      {/* AERO ACES like Diddy Kong Racing (2026-09-15): PLACE and LAP are the race; the ITEM slot and BANANAS are what you
          carry into it. The item box takes the balloon's colour so a glance says what FIRE will do. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between px-4 py-3 font-mono">
        <div className="fel-panel px-3 py-1.5">
          <div className="text-[10px] tracking-wider text-white/60">PLACE</div>
          <div className="fel-stat text-3xl text-[var(--fel-gold)]">{hnode(hud.pos, '—')}</div>
          {/* RACING PASS phase 5: the gap — seconds to the plane ahead, or the lead */}
          {hud.gap ? <div className={`text-[10px] font-bold ${String(hud.gap).startsWith('LEAD') ? 'text-[#86efac]' : 'text-white/80'}`}>{String(hud.gap)}</div> : null}
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="fel-panel px-4 py-1.5 fel-stat text-xl text-white">{Number(hud.time ?? 0).toFixed(1)}s</span>
          <span className="fel-panel px-3 py-0.5 text-xs font-bold text-white/85">LAP {hnode(hud.lap, '—')}</span>
        </div>
        <div className="flex items-start gap-2">
          <div className="fel-panel px-3 py-1.5 text-center">
            <div className="text-[10px] tracking-wider text-white/60">BANANAS</div>
            <div className="fel-stat text-2xl text-[#ffd83a]">{Number(hud.bananas ?? 0)}<span className="text-sm text-white/50">/10</span></div>
          </div>
          <div
            className="fel-panel flex h-[60px] w-[88px] flex-col items-center justify-center rounded-lg border-2 px-2 text-center"
            style={{ borderColor: ITEM_COLOR[String(hud.itemKind ?? '')] ?? 'rgba(255,255,255,0.15)' }}
          >
            <div className="text-[10px] tracking-wider text-white/60">ITEM</div>
            <div className="text-sm font-bold" style={{ color: ITEM_COLOR[String(hud.itemKind ?? '')] ?? 'rgba(255,255,255,0.35)' }}>
              {hud.item ? String(hud.item) : 'NONE'}
            </div>
          </div>
        </div>
      </div>

      <BoostGauge hud={hud} className="absolute inset-x-0 bottom-28" />
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

      <BootSplash
        modeId="aeroaces" title="AERO ACES" phase={phase}
        detail={phase === 'error' ? (loadError ?? undefined) : (countdown ?? undefined)}
        onStart={tapStart} onRetry={tapStart}
      />
      {phase === 'paused' && (
        <button onClick={tapStart} className="absolute inset-0 flex items-center justify-center bg-black/60">
          <span className="fel-heading text-3xl font-bold text-white">PAUSED — TAP TO RESUME</span>
        </button>
      )}
      {(phase === 'playing' || phase === 'countdown') && busRef.current && (
        <TouchOverlay bus={busRef.current} modeId="aeroaces" visible />
      )}
    </div>
  );
}
