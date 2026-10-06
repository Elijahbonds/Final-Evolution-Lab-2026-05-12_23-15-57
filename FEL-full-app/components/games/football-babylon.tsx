'use client';

// FEL Babylon Street Football stage (M22–M27 rollout wave 1). THIN host: owns
// the <canvas>, boots the shared Babylon harness with the FootballMode
// ModeDefinition, and bridges phase/HUD/result into the existing GameShell
// pipeline. All gameplay lives in lib/babylon/* cores.

import { useEffect, useRef, useState, useCallback } from 'react';
import type { GameProps, GameResult } from './game-shell';
import { useBabylonPlaytestBridge } from './use-babylon-playtest-bridge';
import { BootSplash } from './boot-splash';
import { surfaceBootError } from './boot-error';
import { runMode, InputBus, type ModePhase, type SessionResult, type HudValue } from '@/lib/babylon';
import { MODES } from '@/lib/babylon/modes/registry';
import { TouchOverlay } from '@/lib/babylon/ui/TouchOverlay';
import { hnode } from './hud-format';
import { footballHeadline, footballSessionWon, gameResultFromSession } from '@/lib/sessions/gameResultFromSession';
import { medalName } from '@/lib/babylon/modes/footballRushRules';
/** FOOTBALL UPGRADE: the breakaway meter's lines arrive as '0.333,0.667'. */
const ticksOf = (v: unknown): number[] => (typeof v === 'string' && v ? v.split(',').map(Number) : []);
/** IMPROVE (2026-10-06) #11: the session's medal and a new best on the result line ("TOUCHDOWN! · 43 YD · GOLD · NEW BEST"). */
function medalSuffix(stats: Record<string, number>): string {
  const medal = medalName(Number(stats.medal ?? 0));
  return `${medal ? ` · ${medal}` : ''}${stats.newBest === 1 ? ' · NEW BEST' : ''}`;
}

type Hud = Record<string, HudValue>;

const canvasOwner = new WeakMap<HTMLCanvasElement, object>();

export default function FootballBabylon({ onEnd }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const busRef = useRef<InputBus | null>(null);
  const endedRef = useRef(false);
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;
  const [phase, setPhase] = useState<ModePhase>('loading');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hud, setHud] = useState<Hud>({});
  useBabylonPlaytestBridge('football', () => ({ phase, countdown, loadError, hud }), busRef.current);

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
      const won = footballSessionWon(r.outcome);
      onEndRef.current(gameResultFromSession(r, { won, headline: footballHeadline(r, won) + medalSuffix(r.stats) }));
    };

    const startTimer = setTimeout(() => {
      if (disposed) return;
      runMode(MODES.football, {
        canvas,
        input: bus,
        onPhase: (p, cd) => {
          if (disposed) return;
          setPhase(p);
          setCountdown(p === 'countdown' && typeof cd === 'number' ? cd : null);
          setLoadError(p === 'error' ? (typeof cd === 'string' ? cd : 'Failed to load this mode.') : null);
        },
        onHud: (u) => { if (!disposed) setHud((prev) => ({ ...prev, ...u })); },
        resultSink,
      })
        .then((s) => {
          if (disposed) { if (canvasOwner.get(canvas) === token) s(); return; }
          stop = s;
        })
        .catch((e) => surfaceBootError(e, { disposed, label: '[FEL-FOOTBALL] boot failed', setPhase, setLoadError }));
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
        {/* IMPROVE (2026-10-06) #7: the cooldown FILLS — a ring around the chip's dot, so a pull while it fills is not a dead button */}
        <span className={`flex items-center gap-1.5 rounded px-2 py-0.5 ${hud.truckReady === false ? 'bg-white/10 text-white/30' : 'bg-[#00E5FF]/15 text-[#00E5FF]'}`}>
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ background: `conic-gradient(#00E5FF ${Math.round(Math.max(0, Math.min(1, typeof hud.truckCool === 'number' ? hud.truckCool : 1)) * 360)}deg, rgba(255,255,255,0.15) 0deg)` }}
          />
          TRUCK {hud.truckReady === false ? '…' : 'READY'}
        </span>
        {/* KICKOFF RETURN (owner brief 2026-09-18): the lane you are in, and the SLINGSHOT gauge drafting behind a blocker fills */}
        {typeof hud.lane === 'string' && hud.lane && <span className="rounded bg-[#ffd75e]/20 px-2 py-0.5 text-[#ffd75e]">{hud.lane}</span>}
        {typeof hud.slingshot === 'number' && (
          <div className="mt-0.5 flex flex-col gap-0.5">
            <span className={`text-[9px] ${Number(hud.slingshot) >= 100 ? 'text-[#9ad7ff]' : 'text-white/50'}`}>{Number(hud.slingshot) >= 100 ? 'SLINGSHOT READY — L1' : 'DRAFT → SLINGSHOT (L1)'}</span>
            <div className="relative h-2.5 w-32 overflow-hidden rounded-sm border border-white/25 bg-black/50">
              <div className={`absolute inset-y-0 left-0 ${Number(hud.slingshot) >= 100 ? 'bg-[#9ad7ff]' : 'bg-[#9ad7ff]/60'}`} style={{ width: `${Math.max(0, Math.min(100, Number(hud.slingshot)))}%` }} />
            </div>
          </div>
        )}
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
        {/* IMPROVE (2026-10-06) #11: the session's target — the next medal and the points to it, and the viewer's best */}
        {typeof hud.par === 'string' && hud.par && <span className="rounded bg-black/50 px-2 py-0.5 text-[var(--fel-gold)]">{hud.par}</span>}
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
      {/* IMPROVE (2026-10-06) #10: the live reads as button chips — B VAULT, A CATAPULT, R1 ARM — when each one will act */}
      {typeof hud.prompts === 'string' && hud.prompts && (
        <div className="pointer-events-none absolute inset-x-0 bottom-36 flex justify-center gap-2 font-mono">
          {hud.prompts.split(' · ').map((p) => (
            <span key={p} className="rounded-md border border-[#9ad7ff]/50 bg-black/60 px-2 py-0.5 text-xs font-bold text-[#9ad7ff]">{p}</span>
          ))}
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

      {/* M35: THE single touch control surface — one overlay per mode, ever. */}
      {(phase === 'playing' || phase === 'countdown') && busRef.current && (
        <TouchOverlay bus={busRef.current} modeId="football" visible />
      )}
    </div>
  );
}
