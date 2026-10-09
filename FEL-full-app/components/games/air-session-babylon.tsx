'use client';

// Shared Babylon host for the air-session family (gymnastics vault, big air).
// makeAirHost(modeKey) returns a GameProps component, mirroring the
// makeTimingHost / makeBoardHost convention — one host, never forked per mode.

import { useEffect, useRef, useState, useCallback } from 'react';
import type { GameProps, GameResult } from './game-shell';
import { useBabylonPlaytestBridge } from './use-babylon-playtest-bridge';
import { BootSplash } from './boot-splash';
import { surfaceBootError } from './boot-error';
import { runMode, InputBus, type ModePhase, type SessionResult, type HudValue } from '@/lib/babylon';
import { MODES } from '@/lib/babylon/modes/registry';
import { TouchOverlay } from '@/lib/babylon/ui/TouchOverlay';
import { BoostGauge } from './boost-hud';
import { gameResultFromSession } from '@/lib/sessions/gameResultFromSession';

// Which harness currently owns a given canvas. React mounts effects twice in
// dev: effect A starts an async runMode(), its cleanup fires before A has even
// finished loading, then effect B starts on the SAME canvas. When A's promise
// finally resolves it tears itself down — and engine.dispose() releases the
// WebGL context of the shared canvas, killing B's render loop. The symptom is
// brutal to read: the HUD keeps streaming from B's React state while update()
// is never called again and the canvas stays black.
//
// The token lets a late teardown notice it has been superseded and leave the
// canvas alone. Leaking one dev-only engine is vastly better than a dead frame.
const canvasOwner = new WeakMap<HTMLCanvasElement, object>();


type Hud = Record<string, HudValue>;

// IMPROVE (2026-10-06, Big Air items 4 / 6 / 8 / 11 / 13): what the mode published and this bezel never drew. Each reads a
// purpose-built gauge field (RESULTS-TRUTH WA-6 keeps the raw speed / height / spin telemetry off the HUD).
const num = (v: HudValue | undefined): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** The spin dial: the turns so far round a clock face, with the clean-landing windows (± tol of each half turn) marked. */
function SpinDial({ turns, tol }: { turns: number; tol: number }) {
  const R = 26, C = 32;
  const a = Math.abs(turns);
  const clean = Math.abs(a - Math.round(a * 2) / 2) <= tol + 1e-9;
  const deg = (turns % 1) * 360;
  const pt = (d: number, r = R) => [C + r * Math.sin((d * Math.PI) / 180), C - r * Math.cos((d * Math.PI) / 180)] as const;
  const arc = (from: number, to: number) => { const [x0, y0] = pt(from), [x1, y1] = pt(to); return `M ${x0} ${y0} A ${R} ${R} 0 0 1 ${x1} ${y1}`; };
  const w = tol * 360;
  const [nx, ny] = pt(deg, R - 4);
  return (
    <div className="flex flex-col items-center">
      <svg width={64} height={64} viewBox="0 0 64 64" aria-label={`spin ${a.toFixed(2)} turns`}>
        <circle cx={C} cy={C} r={R} fill="rgba(0,0,0,0.45)" stroke="rgba(255,255,255,0.25)" strokeWidth={3} />
        {[0, 180].map((c) => <path key={c} d={arc(c - w, c + w)} stroke="#22d3ee" strokeWidth={5} fill="none" opacity={0.85} />)}
        <line x1={C} y1={C} x2={nx} y2={ny} stroke={clean ? '#22d3ee' : '#ff9d5c'} strokeWidth={3} strokeLinecap="round" />
        <circle cx={C} cy={C} r={3} fill="#fff" />
      </svg>
      <div className={`font-mono text-sm font-bold ${clean ? 'text-[#22d3ee]' : 'text-[#ff9d5c]'}`}>{(Math.round(a * 2) / 2) * 360}° · {a.toFixed(1)}</div>
    </div>
  );
}

/** The run-up's speed bar, with the landing's launch-speed window in green: short of it knuckles, past it overshoots. */
function SpeedBar({ k, lo, hi }: { k: number; lo: number; hi: number }) {
  const inBand = k >= lo && k <= hi;
  return (
    <div className="w-40">
      <div className="relative h-2.5 w-full overflow-hidden rounded bg-white/15">
        <div className="absolute inset-y-0 bg-[#22c55e]/60" style={{ left: `${lo * 100}%`, width: `${(hi - lo) * 100}%` }} />
        <div className="absolute inset-y-0 w-1 -translate-x-1/2 rounded bg-white" style={{ left: `${k * 100}%` }} />
      </div>
      <div className={`mt-0.5 font-mono text-[10px] ${inBand ? 'text-[#22c55e]' : k < lo ? 'text-white/60' : 'text-[#ff9d5c]'}`}>
        {inBand ? 'LANDING SPEED' : k < lo ? 'MORE SPEED — STRIDE' : 'TOO FAST — OVERSHOOT'}
      </div>
    </div>
  );
}

/** The session's attempts so far: grade, rotation, points, and the hill's or the repeat's note. */
function ScoreSheet({ sheet }: { sheet: string }) {
  const rows = sheet.split(';').filter(Boolean).map((r) => r.split('|'));
  return (
    <div className="rounded bg-black/40 px-2 py-1 font-mono text-[10px] text-white/80">
      {rows.map(([g, rot, pts, note], i) => (
        <div key={i} className="flex gap-2">
          <span className="text-white/40">#{i + 1}</span>
          <span className="w-14">{g}</span>
          <span className="w-16">{rot}</span>
          <span className="w-10 text-right text-[#ffd75e]">{pts}</span>
          <span className="text-[#ff9d5c]">{note}</span>
        </div>
      ))}
    </div>
  );
}

export function makeAirHost(modeKey: string, title: string) {
  function AirBabylon({ onEnd }: GameProps) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const busRef = useRef<InputBus | null>(null);
    const endedRef = useRef(false);
    // The harness effect must NOT depend on onEnd's identity. A parent that
    // passes an inline arrow (very common) gives a new function every render,
    // the effect re-runs, and a SECOND Babylon engine is created on the same
    // canvas — they share one WebGL context and the frame goes black while the
    // HUD keeps updating from the other instance.
    const onEndRef = useRef(onEnd);
    onEndRef.current = onEnd;
    const [phase, setPhase] = useState<ModePhase>('loading');
    const [countdown, setCountdown] = useState<number | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [hud, setHud] = useState<Hud>({});
    useBabylonPlaytestBridge(modeKey, () => ({ phase, countdown, loadError, hud }), busRef.current);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const token = {};
      canvasOwner.set(canvas, token);
      const bus = new InputBus();
      busRef.current = bus;
      let stop: (() => void) | null = null;
      let disposed = false;

      const startTimer = setTimeout(() => {
        if (disposed) return;
        runMode(MODES[modeKey], {
        canvas,
        input: bus,
        onPhase: (p, d) => {
          if (disposed) return;
          setPhase(p);
          setCountdown(typeof d === 'number' ? d : null);
          if (p === 'error') setLoadError(typeof d === 'string' ? d : 'load failed');
        },
        onHud: (u) => { if (!disposed) setHud((prev) => ({ ...prev, ...u })); },
        resultSink: async (r: SessionResult) => {
          if (endedRef.current) return;
          endedRef.current = true;
          onEndRef.current(gameResultFromSession(r, {
            won: r.outcome === 'win',
            headline: r.stats?.judgeBest !== undefined
              ? `${r.outcome === 'win' ? 'STOMPED THE FINAL' : 'FINAL OVER'} · JUDGES BEST ${Number(r.stats.judgeBest).toFixed(1)}`
              : r.outcome === 'win' ? 'ROUTINE LANDED' : 'SESSION COMPLETE',
          }));
        },
      }).then((s) => {
        // If a newer mount already claimed this canvas, do NOT run our teardown —
        // it would dispose the engine holding the shared WebGL context.
        if (disposed) { if (canvasOwner.get(canvas) === token) s(); return; }
        stop = s;
      })
        .catch((e) => surfaceBootError(e, { disposed, setPhase, setLoadError }));
      }, 0);

      return () => {
        disposed = true;
        clearTimeout(startTimer);
        if (canvasOwner.get(canvas) === token) stop?.();
      };
    }, []);   // mount once — see onEndRef above

    const tapStart = useCallback(() => {
      busRef.current?.emit({ t: 'button', btn: 'START', pressed: true });
    }, []);

    return (
      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-white/10 bg-black">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />
        {phase === 'playing' && <BoostGauge hud={hud} className="absolute inset-x-0 bottom-24 z-20" />}

        {phase === 'playing' && (
          <div className="pointer-events-none absolute left-4 top-4 z-20 font-mono text-xs text-white">
            <div className="text-2xl font-bold text-[#ffd75e]">{String(hud.score ?? 0)}</div>
            <div className="text-white/60">ATTEMPT {String(hud.attempt ?? '—')} · {String(hud.phase ?? '')}</div>
            {/* nextFoot is the cadence mechanic's core readout — which stride
                comes next — and the bezel dropped it (same trap as the 3PT
                board and football's drive state: published is not rendered).
                combo/best are the scoring accelerators. */}
            <div className="mt-1 flex items-center gap-2">
              {typeof hud.nextFoot === 'string' && hud.nextFoot && String(hud.phase) === 'Run' && (
                <span className="rounded bg-[#22d3ee]/15 px-2 py-0.5 text-[#22d3ee]">
                  NEXT {hud.nextFoot === 'L' ? '◀ LEFT' : 'RIGHT ▶'}
                </span>
              )}
              {typeof hud.combo === 'number' && hud.combo >= 2 && (
                <span className="rounded bg-[#ffd75e]/15 px-2 py-0.5 text-[#ffd75e]">COMBO x{hud.combo}</span>
              )}
              {typeof hud.best === 'string' && hud.best && (
                <span className="rounded bg-white/10 px-2 py-0.5 text-white/60">BEST {hud.best}</span>
              )}
            </div>
            {typeof hud.banner === 'string' && hud.banner && (
              <div className="mt-2 text-[#00E5FF]">{hud.banner}</div>
            )}
            {typeof hud.note === 'string' && hud.note && (
              <div className="mt-1 text-[#ff9d5c]">{hud.note}</div>
            )}
            {typeof hud.judge === 'string' && hud.judge && (
              <div className="mt-1 text-white/50">JUDGES BEST {hud.judge}</div>
            )}
          </div>
        )}

        {phase === 'playing' && (
          <div className="pointer-events-none absolute right-4 top-4 z-20 flex flex-col items-end gap-2">
            {typeof hud.sheet === 'string' && hud.sheet && <ScoreSheet sheet={hud.sheet} />}
            {num(hud.dialTurns) !== null && <SpinDial turns={num(hud.dialTurns)!} tol={num(hud.dialTol) ?? 0.15} />}
            {num(hud.speedK) !== null && num(hud.bandLoK) !== null && num(hud.bandHiK) !== null && (
              <SpeedBar k={num(hud.speedK)!} lo={num(hud.bandLoK)!} hi={num(hud.bandHiK)!} />
            )}
          </div>
        )}

        {phase === 'playing' && (hud.stomp === 'now' || (typeof hud.coach === 'string' && hud.coach)) && (
          <div className="pointer-events-none absolute inset-x-0 top-[28%] z-20 text-center font-mono">
            {hud.stomp === 'now'
              ? <span className="rounded bg-[#ffd75e]/20 px-3 py-1 text-2xl font-black text-[#ffd75e]">B · STOMP</span>
              : <span className="rounded bg-black/40 px-3 py-1 text-sm font-bold text-white">{String(hud.coach)}</span>}
          </div>
        )}

        {phase === 'playing' && typeof hud.hint === 'string' && hud.hint && (
          <div className="pointer-events-none absolute inset-x-0 bottom-2 z-10 px-3 text-center font-mono text-[10px] text-white/45">{hud.hint}</div>
        )}

        <BootSplash
          modeId={modeKey}
          title={title}
          phase={phase}
          detail={phase === 'error' ? (loadError ?? undefined) : (countdown ?? undefined)}
          onStart={tapStart}
          onRetry={tapStart}
        />

        {(phase === 'playing' || phase === 'countdown') && busRef.current && (
          <TouchOverlay bus={busRef.current} modeId={modeKey} visible />
        )}
      </div>
    );
  }
  AirBabylon.displayName = `AirBabylon(${modeKey})`;
  return AirBabylon;
}
