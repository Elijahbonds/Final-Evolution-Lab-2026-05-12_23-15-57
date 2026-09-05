'use client';

// FEL Babylon Dunk stage — the M22–M27 proof gate. This component is a THIN
// host: it owns the <canvas>, boots the shared Babylon harness with the dunk
// ModeDefinition, and bridges phase/HUD/result back into the existing
// GameShell pipeline (GameProps.onEnd → /api/sessions recap). All gameplay
// lives in lib/babylon/* cores; nothing game-specific is duplicated here.

import { useEffect, useRef, useState, useCallback } from 'react';
import type { GameProps, GameResult } from './game-shell';
import { BootSplash } from './boot-splash';
import { runMode, InputBus, type ModePhase, type SessionResult, type HudValue, type HudScoreCard } from '@/lib/babylon';
import { MODES } from '@/lib/babylon/modes/registry';
import { TouchOverlay } from '@/lib/babylon/ui/TouchOverlay';
import { hnode, hnum } from './hud-format';

type Hud = Record<string, HudValue>;

export default function DunkBabylon({ onEnd }: GameProps) {
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
      const won = r.outcome === 'WIN' || r.outcome === 'CONTEST_WON';   // PACK #3: the mode emits CONTEST_WON, not WIN — dunk sessions had always posted as losses
      const result: GameResult = {
        score: r.score,
        stats: r.stats, outcome: r.outcome,   // pass 5 phase 3: the proof line reads these
        opponentScore: r.stats?.rivalScore ?? r.stats?.rivalTotal ?? 0,   // the mode reports `rivalTotal`; the session had posted the rival as 0
        won,
        duration: r.durationSec,
        headline: won ? 'CONTEST WON' : 'CONTEST OVER',
        tallies: { hits: r.stats?.makes ?? 0, misses: r.stats?.misses ?? 0, dodges: 0, combos: r.stats?.bestChain ?? 0 },   // PACK #3: make/miss proof
      };
      onEnd(result);
    };

    // StrictMode runs effect -> cleanup -> effect. Starting the harness
    // immediately means the PHANTOM mount also builds a Babylon engine, and its
    // cleanup cannot cancel it — `stop` is not assigned until the async load
    // resolves. Two engines then sit on the SAME canvas sharing one WebGL
    // context and fight: the watchdog logs "confirmed black output" while the
    // HUD streams happily from the other instance. This is the guest onboarding
    // path (/try), so that black frame was the first thing a new player saw.
    // Deferring by a tick lets the phantom mount be cancelled before it builds.
    const startTimer = setTimeout(() => {
      if (disposed) return;
      runMode(MODES.dunk, {
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
        .catch((e) => console.error('[FEL-DUNK] boot failed', e));
    }, 0);

    return () => {
      disposed = true;
      clearTimeout(startTimer);
      stop?.();
      busRef.current = null;
    };
  }, [onEnd]);

  // ── touch bridge ──────────────────────────────────────────────────────────
  const emit = useCallback((e: Parameters<InputBus['emit']>[0]) => {
    busRef.current?.emit(e);
  }, []);

  const tapStart = useCallback(() => {
    // READY gate + pause both advance on any button press.
    emit({ t: 'button', btn: 'START', pressed: true });
  }, [emit]);

  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-white/10 bg-black">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

      {/* HUD bezel — judged contest scoreboard (M47) */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 px-4 py-3 font-mono text-xs">
        <div className="flex items-center gap-2">
          <span className="fel-panel fel-stat px-3 py-1 text-lg">
            {hnode(hud.score, 0)} <span className="text-white/50">vs</span> {hnode(hud.rivalScore, 0)}
          </span>
          {hud.round != null && (
            <span className="fel-panel px-2 py-1 text-[var(--fel-cyan)]">RD {hnode(hud.round)}</span>
          )}
          {hud.dunkNum != null && (
            <span className="fel-panel px-2 py-1 text-white/70">DUNK {hnode(hud.dunkNum)}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hud.prop != null && (
            <span className="fel-panel px-2 py-1 text-[var(--fel-purple)]">{hnode(hud.prop)}</span>
          )}
          {hud.style != null && (
            <span className="fel-panel px-2 py-1 text-[var(--fel-gold)]">{hnode(hud.style)}</span>
          )}
        </div>
      </div>

      {/* HYPE meter */}
      {phase === 'playing' && (
        <div className="pointer-events-none absolute right-4 top-14 flex flex-col items-end gap-1">
          <span className="font-mono text-[10px] text-[var(--fel-red)]">HYPE</span>
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/15">
            <div className="h-full bg-[var(--fel-red)] transition-[width] duration-300" style={{ width: `${Math.max(0, Math.min(100, hnum(hud.hype)))}%` }} />
          </div>
        </div>
      )}

      {/* Venice DualShock pad (2026-09-05): the charge METER is gone — the Benchmark feel bar calls a meter a hard
          fail ("meter slideshow"), and HOLD = RUN carries its own cue: the hold ring fills on the pad's CHARGE button. */}

      {/* SLAM! cue */}
      {hud.slamPulse === true && phase === 'playing' && (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 text-center">
          <span className="fel-heading text-4xl font-black text-[var(--fel-gold)] drop-shadow">SLAM!</span>
        </div>
      )}

      {/* Judge scorecard reveal — five cards held up in a row, as the panel
          actually does it. This was a vertical stack of name+score+voice-line
          rows, which worked for three judges and does not for five: the column
          grew straight down through the banner at top-[38%], which is exactly
          where a FIFTY! lands. Cards across, one voice line at a time, and a
          running total that climbs as they flip — the number everyone watches. */}
      {Array.isArray(hud.judgeReveal) && (hud.judgeReveal as HudScoreCard[]).length > 0 && (
        <div className="pointer-events-none absolute inset-x-0 top-[20%] flex flex-col items-center gap-2">
          <div className="flex items-end justify-center gap-1.5">
            {(hud.judgeReveal as HudScoreCard[]).map((j) => (
              <div key={j.name} className="fel-panel flex flex-col items-center px-2.5 py-1">
                <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--fel-cyan)]">{j.name}</span>
                <span className="text-2xl font-black leading-none text-[var(--fel-gold)]">{j.score}</span>
              </div>
            ))}
            <div className="fel-panel ml-1 flex flex-col items-center border-[var(--fel-gold)]/40 px-3 py-1">
              <span className="font-mono text-[9px] uppercase tracking-wider text-white/50">total</span>
              <span className="text-2xl font-black leading-none text-white">
                {(hud.judgeReveal as HudScoreCard[]).reduce((s, j) => s + Number(j.score), 0)}
              </span>
            </div>
          </div>
          {/* the card that just flipped gets to speak */}
          <span className="fel-panel max-w-[85%] truncate px-3 py-1 font-mono text-[11px] text-white/70">
            {(hud.judgeReveal as HudScoreCard[])[(hud.judgeReveal as HudScoreCard[]).length - 1].line}
          </span>
        </div>
      )}

      {/* banner */}
      {typeof hud.banner === 'string' && hud.banner && (
        <div className="pointer-events-none absolute inset-x-0 top-[38%] text-center">
          <span className="fel-heading fel-panel px-4 py-2 text-2xl font-bold text-[var(--fel-cyan)]">{hud.banner}</span>
        </div>
      )}

      {/* Venice DualShock pad: on phones (< 640 px) the hint plate sits above the pad column (the diamond stacks over the
          LOOK stick, ≈ 264 px); the clamp is a media switch in pure CSS — this project's Tailwind emits no max-* variants. */}
      {typeof hud.hint === 'string' && hud.hint && phase === 'playing' && (
        <div className="pointer-events-none absolute inset-x-0 px-3 text-center" style={{ bottom: 'clamp(2.5rem, calc((640px - 100vw) * 999), 17.5rem)' }}>
          <span className="fel-panel px-3 py-1.5 font-mono text-[11px] text-white/80">{hud.hint}</span>
        </div>
      )}

      {/* BootSplash: cartridge boot / venue art / progress / READY / 3-2-1 / error+retry */}
      <BootSplash
        modeId="dunk"
        title="FLIGHT NIGHT"
        phase={phase}
        detail={phase === 'error' ? (loadError ?? undefined) : (countdown ?? undefined)}
        onStart={tapStart}
        onRetry={tapStart}
      />

      {/* pause */}
      {phase === 'paused' && (
        <button onClick={tapStart} className="absolute inset-0 flex items-center justify-center bg-black/60">
          <span className="fel-heading text-3xl font-bold text-white">PAUSED — TAP TO RESUME</span>
        </button>
      )}

      {/* M35: THE single touch control surface — one overlay per mode, ever. */}
      {(phase === 'playing' || phase === 'countdown') && busRef.current && (
        <TouchOverlay bus={busRef.current} modeId="dunk" visible />
      )}
    </div>
  );
}


