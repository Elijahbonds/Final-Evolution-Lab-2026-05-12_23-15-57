'use client';

// FEL Babylon FreeRun host (A+ mission #10 — replaces the gymnastics vault). THIN host: owns the <canvas>, boots the
// shared harness with FreeRunMode, bridges phase / HUD / result into GameShell. Skate 3 scoring read: pot, multiplier,
// banked; Mirror's Edge read: the speed and the verbs the speed unlocks.

import { useEffect, useRef, useState, useCallback } from 'react';
import type { GameProps, GameResult } from './game-shell';
import { useBabylonPlaytestBridge } from './use-babylon-playtest-bridge';
import { BootSplash } from './boot-splash';
import { surfaceBootError } from './boot-error';
import { useBabylonBootRetry } from './use-babylon-boot-retry';
import { runMode, InputBus, type ModePhase, type SessionResult, type HudValue } from '@/lib/babylon';
import { MODES } from '@/lib/babylon/modes/lazyRegistry';   // PERF-LOAD PRF-05: this host's mode alone, imported at mount
import { TouchOverlay } from '@/lib/babylon/ui/TouchOverlay';
import { hnode } from './hud-format';
import { HudBanner, HudChip, HudFrame, HudLine, HudMeter, HudPips, HudPlate, HudText, ScoreValue, Scorebug } from './tv-hud';
import { gameResultFromSession } from '@/lib/sessions/gameResultFromSession';

type Hud = Record<string, HudValue>;

export default function FreeRunBabylon({ onEnd }: GameProps) {
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
  useBabylonPlaytestBridge('freerun', () => ({ phase, countdown, loadError, hud }), busRef.current);

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
      const t = Number(r.stats?.timeSec ?? 0);
      const p = Number(r.stats?.place ?? 0);
      const g = ' DCBAS'[Number(r.stats?.grade ?? 0)]?.trim() ?? '';
      const ord = p === 1 ? '1ST' : p === 2 ? '2ND' : p === 3 ? '3RD' : `${p}TH`;
      onEndRef.current(gameResultFromSession(r, {
        won: r.outcome === 'win',
        headline: r.outcome === 'timeout' ? `OUT OF TIME · ${t}s` : `${p > 0 ? `${ord} · ` : ''}${t}s${g ? ` · GRADE ${g}` : ''}`,
      }));
    };
    const startTimer = setTimeout(() => {
      if (disposed) return;
      runMode(MODES.freerun, {
        canvas, input: bus,
        onPhase: (p, cd) => { setPhase(p); setCountdown(p === 'countdown' && typeof cd === 'number' ? cd : null); setLoadError(p === 'error' ? (typeof cd === 'string' ? cd : 'Failed to load this mode.') : null); },
        onHud: (u) => setHud((prev) => ({ ...prev, ...u })),
        resultSink,
      }).then((s) => { if (disposed) { s(); return; } stop = s; }).catch((e) => surfaceBootError(e, { disposed, label: '[FEL-FREERUN] boot failed', setPhase, setLoadError }));
    }, 0);
    return () => { disposed = true; clearTimeout(startTimer); stop?.(); busRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- G7: the stage is owned by the mount; callbacks are read through refs.
  }, [bootAttempt]);

  const emit = useCallback((e: Parameters<InputBus['emit']>[0]) => { busRef.current?.emit(e); }, []);
  const tapStart = useCallback(() => emit({ t: 'button', btn: 'START', pressed: true }), [emit]);
  const speed = Number(hud.speed ?? 0), speedMax = Number(hud.speedMax ?? 6.4);

  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-white/10 bg-black">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

      {/* TV HUD (A9.13, lane/tv-hud): every readout on the shared system — same keys, same gates, same slots. */}
      <HudFrame>
      {/* top bar: banked + pot on the left, the clock + checkpoint centre, tier + route right */}
      <div className="absolute inset-x-0 top-0 flex items-start justify-between px-4 py-3">
        {/* RIVALS (owner brief 2026-09-18): the rank and the gap to the leader, top-left */}
        {hud.place ? (
          <HudPlate className="px-3 py-1.5">
            <HudText as="div" size="caption" alpha={0.6}>PLACE</HudText>
            <ScoreValue value={String(hud.place)} tone="score" />
            <HudText as="div" size="caption" tone={hud.delta === 'LEADING' ? 'good' : 'text'} alpha={hud.delta === 'LEADING' ? 1 : 0.7} style={{ fontWeight: 800 }}>{String(hud.delta ?? '')}{Number(hud.draft) >= 100 ? ' · SLINGSHOT READY' : Number(hud.draft) > 0 ? ` · DRAFT ${hnode(hud.draft, 0)}%` : ''}</HudText>
          </HudPlate>
        ) : null}
        <HudPlate className="px-3 py-1.5">
          <HudText as="div" size="caption" alpha={0.6}>BANKED</HudText>
          <ScoreValue value={hnode(hud.banked, 0)} tone="score" />
          {Number(hud.pot) > 0 && (
            <HudText as="div" size="value" tone="you" className="mt-0.5">+{hnode(hud.pot, 0)} <HudText size="value" alpha={0.6}>{hnode(hud.combo, '')}</HudText></HudText>
          )}
        </HudPlate>
        <div className="flex flex-col items-center gap-1">
          <Scorebug><ScoreValue value={`${Number(hud.time ?? 0).toFixed(1)}s`} pop={false} /></Scorebug>
          <HudChip alpha={0.7} size="caption">CHECKPOINT {hnode(hud.checkpoint, '0/2')}</HudChip>
          {/* IMPROVE (2026-10-06): the last checkpoint's split against the personal best (− is ahead) */}
          {typeof hud.pbSplit === 'string' && hud.pbSplit && phase === 'playing' ? (
            <HudChip tone={hud.pbSplit.includes('−') ? 'good' : 'danger'} size="caption" style={{ fontWeight: 800 }}>{hud.pbSplit}</HudChip>
          ) : null}
        </div>
        <HudPlate className="px-3 py-1.5 text-right">
          <HudText as="div" size="caption" alpha={0.6}>{hnode(hud.tier, 'ROOKIE')}{hud.track ? ` · ${String(hud.track).toUpperCase()}` : ''}</HudText>
          <HudText as="div" size="value" tone={hud.lane === 'HIGH' ? 'info' : hud.lane === 'LOW' ? 'heat' : 'text'} alpha={hud.lane === 'HIGH' || hud.lane === 'LOW' ? 1 : 0.8}>{hud.lane ? `${String(hud.lane)} LANE` : hnode(hud.route, 'LOW LINE')}</HudText>
        </HudPlate>
      </div>

      {/* speed + the verbs the speed unlocks */}
      {phase === 'playing' && typeof hud.speed === 'number' && (
        <div className="absolute left-4 top-24 flex flex-col items-start gap-1">
          <HudMeter label={`SPEED ${speed.toFixed(1)} m/s`} labelAlpha={0.6} value={speed} max={speedMax} width="10rem" height="bar"
            tone={speed >= 5.2 ? 'heat' : speed >= 2.6 ? 'you' : 'text'} fillAlpha={speed >= 2.6 ? 1 : 0.5} />
          {/* FLOW (owner brief 2026-09-18): the tier pips buy top speed and spend as a landing burst; KINETIC is the overdrive (Y) */}
          {typeof hud.flow === 'number' && (
            <div className="mt-1 flex items-center gap-1.5">
              <HudText size="caption" alpha={0.6}>FLOW</HudText>
              <HudPips count={Math.floor(Number(hud.flow))} of={3} tones={['you', 'power', 'score']} />
              <HudMeter value={Number(hud.flowFrac ?? 0)} max={100} tone="you" fillAlpha={0.7} height="thin" width="4rem" />
            </div>
          )}
          {typeof hud.kinetic === 'number' && (
            <HudMeter className="mt-0.5" layout="inline" label="KINETIC" labelAlpha={0.6} value={Number(hud.kinetic)} max={100} width="7rem"
              tone={Number(hud.kinetic) >= 50 ? 'score' : 'text'} fillAlpha={Number(hud.kinetic) >= 100 ? 1 : Number(hud.kinetic) >= 50 ? 0.6 : 0.4}
              status={Number(hud.kinetic) >= 100 ? 'SLAM READY' : Number(hud.kinetic) >= 50 ? 'BURST' : undefined} statusTone="score" />
          )}
          {/* IMPROVE (2026-10-06): the trick's rotation — green once it is round far enough to land */}
          {Number(hud.trickPct) > 0 && (
            <HudMeter className="mt-0.5" layout="inline" label="TRICK" labelAlpha={0.6} value={Number(hud.trickPct)} max={100} width="7rem"
              tone={Number(hud.trickAround) ? 'good' : 'danger'} status={Number(hud.trickAround) ? 'LAND IT' : undefined} statusTone="good" />
          )}
          {/* IMPROVE (2026-10-06): a speed gate ahead — what it needs against your speed, from 15 m out */}
          {typeof hud.gateReq === 'string' && hud.gateReq && (
            <HudChip plate={false} fill={0.25} tone={Number(hud.gateReady) ? 'good' : 'danger'} size="caption" className="rounded" style={{ fontWeight: 800 }}>{hud.gateReq}</HudChip>
          )}
          {typeof hud.verbs === 'string' && hud.verbs && (
            <div className="flex flex-wrap gap-1">
              {hud.verbs.split(' · ').map((v) => (v === 'WALL RUN' || v === 'CAT LEAP' || v === 'WALL KICK'
                ? <HudChip key={v} plate={false} fill={0.25} tone="heat" size="caption" className="rounded" style={{ fontWeight: 800 }}>{v}</HudChip>
                : <HudChip key={v} plate={false} alpha={0.85} size="caption" className="rounded" style={{ fontWeight: 800, background: 'rgba(0, 0, 0, 0.5)' }}>{v}</HudChip>))}
            </div>
          )}
        </div>
      )}

      {phase === 'playing' && <HudLine text={typeof hud.hint === 'string' ? hud.hint : ''} className="bottom-16" size="caption" alpha={0.7} />}
      <HudBanner text={typeof hud.banner === 'string' ? hud.banner : ''} tone="score" />
      </HudFrame>

      <BootSplash modeId="freerun" title="FREE RUN" phase={phase} detail={phase === 'error' ? (loadError ?? undefined) : (countdown ?? undefined)} onStart={tapStart} onRetry={retryBoot} />
      {(phase === 'playing' || phase === 'countdown') && busRef.current && <TouchOverlay bus={busRef.current} modeId="freerun" visible />}
    </div>
  );
}
