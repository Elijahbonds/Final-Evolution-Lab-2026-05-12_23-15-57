'use client';

// Tiebreak Blitz — thin host. The rally is a 3D court (TiebreakMode). This file keeps the start card and
// posts the score the arena ceiling is built from. There is no photo backdrop and no 2D court overlay.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameProps, GameResult } from '@/components/games/game-shell';
import { useStartWake } from '@/components/games/use-start-wake';
import { BootSplash } from '@/components/games/boot-splash';
import { failBabylonBoot } from '@/components/games/boot-failure';
import { runMode, InputBus, type ModePhase, type SessionResult, type HudValue } from '@/lib/babylon';
import { gradeReactBase } from '@/lib/babylon/core/TiebreakBlitz';
import { makeTiebreakMode } from '@/lib/babylon/modes/TiebreakMode';

const TARGET = 7;

type Hud = Record<string, HudValue>;

const canvasOwner = new WeakMap<HTMLCanvasElement, object>();

export default function TiebreakGame({ grade, prq, onEnd }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const busRef = useRef<InputBus | null>(null);
  const [started, setStarted] = useState(false);
  const endedRef = useRef(false);
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;
  const gradeRef = useRef(grade);
  gradeRef.current = grade;
  // SHARED-START-UNSTICK: any key, pad button, stick or tap on the card serves — not only a click on the pill.
  const wake = useStartWake(!started, () => setStarted(true));
  const [phase, setPhase] = useState<ModePhase>('loading');
  const [hud, setHud] = useState<Hud>({});
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!started) return;
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
      const myPts = Number(r.stats?.myPts ?? 0);
      const aiPts = Number(r.stats?.aiPts ?? 0);
      const bestRally = Number(r.stats?.bestRally ?? 0);
      const won = r.outcome === 'WIN' || r.outcome === 'win';
      const result: GameResult = {
        // WA-22 (RESULTS-TRUTH): post the game score (7-0), not the points scale.
        score: myPts,
        opponentScore: aiPts,
        won,
        duration: r.durationSec,
        headline: won ? `${myPts}-${aiPts} — TIEBREAK` : `${myPts}-${aiPts} — NEXT BREAKER`,
        stats: r.stats,
        outcome: r.outcome,
        maxCombo: bestRally,
      };
      onEndRef.current(result);
    };

    runMode(makeTiebreakMode({
      reactBase: gradeReactBase(gradeRef.current.key),
      // Live miss check. The arena ceiling reads this exact rate off this file.
      aiNets: (rally) => Math.random() < 0.16 + rally * 0.05,
    }), {
      canvas,
      input: bus,
      onPhase: (p, cd) => {
        setPhase(p);
        setLoadError(p === 'error' ? (typeof cd === 'string' ? cd : 'Failed to load this mode.') : null);
        // The card already woke the player. The harness has its own ready gate; open it so play starts.
        if (p === 'ready') bus.emit({ t: 'button', btn: 'A', pressed: true });
      },
      onHud: (u) => setHud((prev) => ({ ...prev, ...u })),
      resultSink,
    }).then((s) => {
      if (disposed) { if (canvasOwner.get(canvas) === token) s(); return; }
      stop = s;
    }).catch((e) => { if (!disposed) failBabylonBoot('[FEL-TIEBREAK]', e, setPhase, setLoadError); });

    return () => {
      disposed = true;
      if (canvasOwner.get(canvas) === token) stop?.();
      busRef.current = null;
    };
  }, [started]);

  const emit = useCallback((e: Parameters<InputBus['emit']>[0]) => { busRef.current?.emit(e); }, []);
  const tapStart = useCallback(() => emit({ t: 'button', btn: 'START', pressed: true }), [emit]);

  const myPts = Number(hud.myPts ?? 0);
  const aiPts = Number(hud.aiPts ?? 0);
  const banner = typeof hud.banner === 'string' ? hud.banner : '';

  return (
    <div className="relative w-full">
      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-white/10 bg-black">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />
        {started && phase === 'playing' && (
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between px-4 py-3 font-mono">
            <span className="fel-panel px-3 py-1 text-lg text-white">YOU {myPts}</span>
            <span className="fel-panel px-3 py-1 text-sm text-white/80">TO {TARGET}</span>
            <span className="fel-panel px-3 py-1 text-lg text-white">AI {aiPts}</span>
          </div>
        )}
        {started && banner && (
          <div className="pointer-events-none absolute inset-x-0 top-[18%] flex justify-center px-4">
            <span className="fel-panel px-4 py-2 text-center text-xl font-black text-[#00FF9D]">{banner}</span>
          </div>
        )}
        {started && phase === 'playing' && (
          <div className="pointer-events-none absolute bottom-3 right-3 font-mono text-[11px] text-white/50">
            PRQ {prq.toFixed(0)} · {gradeRef.current.label}
          </div>
        )}
        <BootSplash
          modeId="tiebreak"
          title="TIEBREAK BLITZ"
          phase={phase}
          detail={phase === 'error' ? (loadError ?? undefined) : undefined}
          onStart={tapStart}
          onRetry={tapStart}
        />
        {!started && (
          <div onPointerDown={wake.onPointerDown} className="absolute inset-0 z-10 flex cursor-pointer flex-col items-center justify-center gap-4 bg-black/80 p-6 text-center">
            <h2 className="fel-heading text-4xl text-white">TIEBREAK BLITZ</h2>
            <p className="max-w-md text-sm text-gray-300">
              First to {TARGET}. The ball comes in on one side — swing <span className="text-[#00FF9D]">← / →</span> when the green ring closes on it. The window tightens as the rally and the lead grow.
            </p>
            <button onClick={() => setStarted(true)} className="rounded-lg bg-[#00FF9D] px-8 py-3 font-bold text-black transition hover:bg-[#00d986]">FIRST SERVE</button>
            <p className="font-mono text-[11px] tracking-widest text-white/50">ANY KEY · ANY BUTTON · TAP</p>
          </div>
        )}
      </div>
      {started && (
        <div className="mt-3 flex justify-center gap-3">
          <button className="rounded-lg bg-[#00FF9D]/20 px-12 py-4 font-bold text-[#00FF9D] active:bg-[#00FF9D]/40" onPointerDown={(e) => { e.preventDefault(); emit({ t: 'dpad', dir: 'left', pressed: true }); }}>← SWING</button>
          <button className="rounded-lg bg-[#00FF9D]/20 px-12 py-4 font-bold text-[#00FF9D] active:bg-[#00FF9D]/40" onPointerDown={(e) => { e.preventDefault(); emit({ t: 'dpad', dir: 'right', pressed: true }); }}>SWING →</button>
        </div>
      )}
    </div>
  );
}
