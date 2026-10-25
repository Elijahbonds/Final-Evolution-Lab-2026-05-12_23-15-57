'use client';

// FEL Babylon Court Carnival hub (M49). THIN host: owns the <canvas>, boots the
// shared Babylon harness with the CourtCarnival ModeDefinition, and bridges
// phase/HUD/result into the existing GameShell pipeline. All gameplay lives in
// lib/babylon/* cores (CourtCarnivalMode + carnivalEvents, which themselves
// reuse boardCore / aimSwingCore / VenueKit / CharacterLibrary).

import { useEffect, useRef, useState, useCallback } from 'react';
import type { GameProps, GameResult } from './game-shell';
import { BootSplash } from './boot-splash';
import { surfaceBootError } from './boot-error';
import { useBabylonBootRetry } from './use-babylon-boot-retry';
import { runMode, InputBus, type ModePhase, type SessionResult, type HudValue } from '@/lib/babylon';
import { MODES } from '@/lib/babylon/modes/lazyRegistry';   // PERF-LOAD PRF-05: this host's mode alone, imported at mount
import { TouchOverlay } from '@/lib/babylon/ui/TouchOverlay';
import { PadChips } from '@/lib/babylon/ui/PadChips';   // CONTROLLER-UNIVERSAL-MULTI: pass-the-pad nights name each controller
import { hnode } from './hud-format';
import { HUD_TEXT_ALPHA, HudBanner, HudChip, HudFrame, HudLine, HudMeter, HudPlate, HudText, ScoreCell, ScoreValue, Scorebug } from './tv-hud';
import { gameResultFromSession, opponentScoreFromStats } from '@/lib/sessions/gameResultFromSession';
import { MicCaption, MicToggle } from './mic-caption';   // THE MIC (2026-09-24): the MC's words and the voice switch
/** The between-events scoreboard rows the mode publishes (HudScoreCard shape). */
const isBoard = (v: unknown): v is { name: string; score: number | string; line: string }[] =>
  Array.isArray(v) && v.every((r) => !!r && typeof r === 'object' && 'line' in (r as object));

type Hud = Record<string, HudValue>;

// Which mount currently owns a given canvas. The in-run hub (?carnival=1)
// double-mounts this component (StrictMode + the hub's Suspense boundary):
// effect A starts an async runMode(), its cleanup fires before A has even
// finished loading, then effect B starts on the SAME canvas — and A's late
// teardown disposed the engine holding B's WebGL context. Measured on the
// mobile leg: "carnival → loading" twice, then a black frame forever and the
// RenderWatchdog's rescue could not fix a dead context. The token pattern is
// ported from air-session-babylon, which has the guard and never goes black.
const canvasOwner = new WeakMap<HTMLCanvasElement, object>();

export default function CarnivalBabylon({ onEnd }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const busRef = useRef<InputBus | null>(null);
  const endedRef = useRef(false);
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;
  const [phase, setPhase] = useState<ModePhase>('loading');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hud, setHud] = useState<Hud>({});
  const { bootAttempt, retryBoot } = useBabylonBootRetry({ busRef, endedRef, setPhase, setCountdown, setLoadError, reset: () => setHud({}) });

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
      onEndRef.current(gameResultFromSession(r, {
        won: r.outcome === 'CHAMPION',
        opponentScore: opponentScoreFromStats(r.stats),
        headline: r.outcome === 'CHAMPION' ? 'CARNIVAL CHAMPION' : 'RUNNER-UP',
      }));
    };

    const startTimer = setTimeout(() => {
      if (disposed) return;
      runMode(MODES.carnival, {
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
          // A newer mount owns the canvas: do NOT run our teardown — it would
          // dispose the engine holding the shared WebGL context.
          if (disposed) { if (canvasOwner.get(canvas) === token) s(); return; }
          stop = s;
        })
        .catch((e) => surfaceBootError(e, { disposed, label: '[FEL-CARNIVAL] boot failed', setPhase, setLoadError }));
    }, 0);

    return () => {
      disposed = true;
      clearTimeout(startTimer);
      if (canvasOwner.get(canvas) === token) stop?.();
      busRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- G7: the stage is owned by the mount; callbacks are read through refs.
  }, [bootAttempt]);

  const emit = useCallback((e: Parameters<InputBus['emit']>[0]) => {
    busRef.current?.emit(e);
  }, []);

  const tapStart = useCallback(() => {
    emit({ t: 'button', btn: 'START', pressed: true });
  }, [emit]);

  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-white/10 bg-black">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

      {/* TV HUD (A9.13, lane/hud-hoops): the carnival's readouts on the shared system — same keys, same gates, same slots. */}
      <HudFrame>
      {/* HUD bezel — Carnival Points vs rival + event counter + clock */}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between px-4 py-3">
        <Scorebug>
          <ScoreCell inline label={hnode(hud.p1name, 'YOU')} labelTone="you" value={hnode(hud.score, 0)} size="stat" />
          <HudText size="label" alpha={HUD_TEXT_ALPHA.faint}>vs</HudText>
          <ScoreCell inline label={hnode(hud.p2name, 'RIVAL')} labelTone="them" value={hnode(hud.rivalScore, 0)} size="stat" />
          {typeof hud.rivalLive === 'number' && hud.rivalLive > 0 && phase === 'playing' && (
            <HudText size="body" tone="them" alpha={0.8}>+{hud.rivalLive}</HudText>
          )}
        </Scorebug>
        <div className="flex items-center gap-2">
          {hud.eventNum != null && (
            <HudChip tone="power" size="body">EVENT {hnode(hud.eventNum, '')}</HudChip>
          )}
          {typeof hud.turnLabel === 'string' && hud.turnLabel && phase === 'playing' && (
            <HudChip size="body">{hud.turnLabel}</HudChip>
          )}
          {typeof hud.time === 'number' && phase === 'playing' && (
            <HudChip tone="score" size="value">{hnode(hud.time, 0)}s</HudChip>
          )}
        </div>
      </div>

      {/* per-event hint line */}
      {typeof hud.hint === 'string' && hud.hint && phase === 'playing' && (
        <HudLine text={hud.hint} size="body" alpha={0.8} className="bottom-24" />
      )}

      {/* IMPROVE (2026-10-06): Slam Rush's CHARGE meter — the fill is the held charge, the gold band is where a release goes
          down (chargeLo..chargeHi). The make used to hang on a value nobody could see. */}
      {typeof hud.charge === 'number' && phase === 'playing' && (
        <div className="absolute inset-x-0 bottom-36 flex justify-center">
          <HudMeter
            height="strip" width="220px" framed
            value={Math.max(0, Math.min(1, hud.charge))} max={1} tone="you" fillAlpha={0.8} fillStyle={{ transition: 'none' }}
            segments={typeof hud.chargeLo === 'number' && typeof hud.chargeHi === 'number'
              ? [{ from: Math.max(0, hud.chargeLo), to: Math.max(0, Math.min(1, hud.chargeHi)), tone: 'score', alpha: 0.45 }]
              : undefined}
          />
        </div>
      )}

      {/* reveal / result / finale card — A+ mission #3: title, the verb line, and the scoreboard between events */}
      {typeof hud.banner === 'string' && hud.banner && (
        <div className="absolute inset-x-0 top-[22%] flex flex-col items-center gap-2 px-4 text-center">
          <HudBanner flow text={hud.banner} tone="you" />
          {typeof hud.blurb === 'string' && hud.blurb && (
            <HudPlate className="px-4 py-1.5"><HudText size="value" alpha={0.9}>{hud.blurb}</HudText></HudPlate>
          )}
          {typeof hud.hint === 'string' && hud.hint && phase === 'playing' && !(typeof hud.eventNum === 'string' && hud.eventNum) && (
            <HudPlate className="px-3 py-1"><HudText size="body" alpha={0.7}>{hud.hint}</HudText></HudPlate>
          )}
          {isBoard(hud.board) && typeof hud.boardTitle === 'string' && hud.boardTitle && (
            <HudPlate className="mt-2 w-full max-w-[460px] px-4 py-3 text-left">
              <div className="grid gap-1.5">
                {hud.board.map((r, i) => (
                  <div key={r.name} className="flex items-center justify-between gap-3 rounded-lg px-3 py-1.5" style={{ background: 'rgba(0, 0, 0, 0.4)' }}>
                    <HudText size="value" tone={i === 0 ? 'you' : 'them'}>{r.name}</HudText>
                    <HudText size="label" alpha={HUD_TEXT_ALPHA.faint} className="truncate">{r.line}</HudText>
                    <ScoreValue value={r.score} size="stat" pop={false} />
                  </div>
                ))}
              </div>
              <HudText as="div" size="label" tone="score" className="mt-2 text-center">{hud.boardTitle}</HudText>
            </HudPlate>
          )}
        </div>
      )}
      </HudFrame>

      {/* THE MIC: under the reveal / hand-off card, and at the bottom while the scoreboard is up (it would cover the scores) */}
      {phase === 'playing' && (
        <MicCaption text={hud.mic} who={hud.micWho}
          className={isBoard(hud.board) && typeof hud.boardTitle === 'string' && hud.boardTitle ? 'bottom-3' : 'top-[62%]'} />
      )}
      {phase === 'playing' && <MicToggle />}

      <BootSplash
        modeId="carnival"
        title="GAME NIGHT"
        phase={phase}
        detail={phase === 'error' ? (loadError ?? undefined) : (countdown ?? undefined)}
        onStart={tapStart}
        onRetry={retryBoot}
      />

      {busRef.current && <PadChips bus={busRef.current} className="left-4 bottom-4" />}
      {(phase === 'playing' || phase === 'countdown') && busRef.current && (
        <TouchOverlay bus={busRef.current} modeId="carnival" visible />
      )}
    </div>
  );
}
