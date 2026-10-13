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
import { useBabylonPlaytestBridge } from './use-babylon-playtest-bridge';
import { BootSplash } from './boot-splash';
import { surfaceBootError } from './boot-error';
import { BoostGauge } from './boost-hud';
import { runMode, InputBus, type ModePhase, type SessionResult, type HudValue } from '@/lib/babylon';
import { MODES } from '@/lib/babylon/modes/registry';
import { TouchOverlay } from '@/lib/babylon/ui/TouchOverlay';
import { gameResultFromSession } from '@/lib/sessions/gameResultFromSession';
import { hnode, hnum } from './hud-format';
import { RaceCourseMap, THREAT_POS, THREAT_ARROW } from './race-course-map';
import { HudBanner, HudChip, HudFrame, HudLine, HudMeter, HudPlate, HudText, ScoreValue, hudColor, type HudTone } from './tv-hud';

type Hud = Record<string, HudValue>;

/** The balloon colours (AeroItems.BALLOON_COLOR), for the item box, as palette tones (TV HUD: one palette). */
const ITEM_TONE: Record<string, HudTone> = { missile: 'danger', boost: 'you', shield: 'score', mine: 'good' };

/** IMPROVE (2026-10-06) #3 #6: the missile warning's placement and the course strip are shared with the kart's host
 *  (race-course-map.tsx) — one drawing of each for both racing modes. */
const CourseMap = RaceCourseMap;

export default function AeroAcesBabylon({ onEnd }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const busRef = useRef<InputBus | null>(null);
  const endedRef = useRef(false);
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;
  const [phase, setPhase] = useState<ModePhase>('loading');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hud, setHud] = useState<Hud>({});
  useBabylonPlaytestBridge('aeroaces', () => ({ phase, countdown, loadError, hud }), busRef.current);

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
      onEndRef.current(gameResultFromSession(r, {
        won: r.outcome === 'WIN',
        headline: place > 0 ? `${place === 1 ? '1ST' : place === 2 ? '2ND' : place === 3 ? '3RD' : `${place}TH`} PLACE${t > 0 ? ` · ${t.toFixed(1)}s` : ''}` : 'FLIGHT COMPLETE',
      }));
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
        .catch((e) => surfaceBootError(e, { disposed, label: '[FEL-AERO] boot failed', setPhase, setLoadError }));
    }, 0);

    return () => { disposed = true; clearTimeout(startTimer); stop?.(); busRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- G7: the stage is owned by the mount; callbacks are read through refs.
  }, []);

  const emit = useCallback((e: Parameters<InputBus['emit']>[0]) => { busRef.current?.emit(e); }, []);
  const tapStart = useCallback(() => emit({ t: 'button', btn: 'START', pressed: true }), [emit]);

  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-white/10 bg-black">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

      {/* TV HUD (A9.13, lane/vis-race phase 2): every readout on the shared system — same keys, same gates, same slots. */}
      <HudFrame>
      {/* AERO ACES like Diddy Kong Racing (2026-09-15): PLACE and LAP are the race; the ITEM slot and BANANAS are what you
          carry into it. The item box takes the balloon's colour so a glance says what FIRE will do. */}
      <div className="absolute inset-x-0 top-0 flex items-start justify-between px-4 py-3">
        <HudPlate className="px-3 py-1.5">
          <HudText as="div" size="caption" alpha={0.6}>PLACE</HudText>
          <ScoreValue value={hnode(hud.pos, '—')} size="hero" tone="score" />
          {/* RACING PASS phase 5: the gap — seconds to the plane ahead, or the lead */}
          {hud.gap ? <HudText as="div" size="caption" tone={String(hud.gap).startsWith('LEAD') ? 'good' : 'text'} alpha={String(hud.gap).startsWith('LEAD') ? 1 : 0.8} style={{ fontWeight: 800 }}>{String(hud.gap)}</HudText> : null}
        </HudPlate>
        <div className="flex flex-col items-center gap-1">
          <HudPlate className="px-4 py-1.5"><ScoreValue value={`${Number(hud.time ?? 0).toFixed(1)}s`} size="stat" pop={false} /></HudPlate>
          <HudChip size="label" style={{ fontWeight: 800 }} alpha={0.85}>LAP {hnode(hud.lap, '—')}</HudChip>
          {/* IMPROVE (2026-10-06) #1: the delta to your best race on this circuit — green ahead, red behind */}
          {typeof hud.pb === 'string' && hud.pb
            ? <HudChip size="caption" tone={hud.pb.includes('−') ? 'good' : 'danger'} style={{ fontWeight: 800 }}>{hud.pb}</HudChip>
            : null}
        </div>
        <div className="flex items-start gap-2">
          <HudPlate className="px-3 py-1.5 text-center">
            <HudText as="div" size="caption" alpha={0.6}>BANANAS</HudText>
            <ScoreValue value={Number(hud.bananas ?? 0)} size="score" tone="score" /><HudText size="value" alpha={0.5}>/10</HudText>
          </HudPlate>
          <HudPlate
            className="flex min-h-[60px] min-w-[88px] flex-col items-center justify-center px-2 text-center"
            style={{ borderRadius: 10, border: `2px solid ${hud.itemKind && ITEM_TONE[String(hud.itemKind)] ? hudColor(ITEM_TONE[String(hud.itemKind)], 1) : hudColor('text', 0.15)}` }}
          >
            <HudText as="div" size="caption" alpha={0.6}>ITEM</HudText>
            <HudText as="div" size="value" tone={ITEM_TONE[String(hud.itemKind ?? '')] ?? 'text'} alpha={ITEM_TONE[String(hud.itemKind ?? '')] ? 1 : 0.35} style={{ fontWeight: 800 }}>
              {hud.item ? String(hud.item) : 'NONE'}
            </HudText>
          </HudPlate>
        </div>
      </div>

      {/* IMPROVE (2026-10-06) #5: the numbers the mode always sent and nothing drew — speed, the next ring, the shield's
          seconds and the slipstream's charge */}
      <div className="absolute right-3 top-[5.5rem] flex flex-col items-end gap-1">
        {hnum(hud.shield) > 0 ? <HudChip tone="score" size="label" style={{ fontWeight: 800 }}>SHIELD {hnum(hud.shield)}s</HudChip> : null}
        {hnum(hud.draft) > 0 ? (
          <HudPlate className="w-28 px-2 py-1">
            <HudMeter label="SLIPSTREAM" labelTone="info" value={Math.min(100, hnum(hud.draft))} max={100} tone="you" width="100%" height="thin" />
          </HudPlate>
        ) : null}
        <HudPlate className="px-3 py-1 text-right">
          <ScoreValue value={hnum(hud.speed)} size="stat" pop={false} /><HudText size="caption" alpha={0.5}> KM/H</HudText>
          {hnum(hud.toGate) > 0 ? <HudText as="div" size="caption" tone="info">RING {hnum(hud.toGate)} m</HudText> : null}
        </HudPlate>
      </div>
      <CourseMap hud={hud} />
      {typeof hud.threat === 'string' && hud.threat && (
        <div className={`absolute flex ${THREAT_POS[String(hud.threatSide)] ?? THREAT_POS.BEHIND}`}>
          <HudChip className={hud.threatRoll ? 'animate-pulse' : ''} tone={hud.threatRoll ? 'good' : 'danger'} size="value" style={{ fontWeight: 800 }}>
            {THREAT_ARROW[String(hud.threatSide)] ?? '▼'} {hud.threat}{hud.threatRoll ? ' — B' : ''}
          </HudChip>
        </div>
      )}

      <BoostGauge hud={hud} className="absolute inset-x-0 bottom-28" />
      {phase === 'playing' && <HudLine text={typeof hud.hint === 'string' ? hud.hint : ''} className="bottom-16" size="caption" alpha={0.7} />}
      <HudBanner text={typeof hud.banner === 'string' ? hud.banner : ''} tone="score" />
      </HudFrame>

      <BootSplash
        modeId="aeroaces" title="AERO ACES" phase={phase}
        detail={phase === 'error' ? (loadError ?? undefined) : (countdown ?? undefined)}
        onStart={tapStart} onRetry={tapStart}
      />
      {(phase === 'playing' || phase === 'countdown') && busRef.current && (
        <TouchOverlay bus={busRef.current} modeId="aeroaces" visible />
      )}
    </div>
  );
}
