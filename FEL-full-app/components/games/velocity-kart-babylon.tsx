'use client';

// FEL Babylon Velocity Kart host — THIN: owns the <canvas>, boots the shared harness with VelocityKartMode, and
// bridges phase / HUD / result into GameShell. Every constant lives in the mode and the flight model.
//
// WHY THIS EXISTS (2026-09-13): same story as Aero Aces — a registered, ENABLED mode with no player-facing
// route, and an MP challenge whose session mode (`velocityKart`) nobody posted, so a staked run could never
// settle.
//
// The HUD is a kart's: speed in km/h (m/s reads wrong on a vehicle), the boost you are holding, the drift
// you are banking, the lap and the clock — and (IMPROVE 2026-10-06) the PB delta, the cup, the way back to the road,
// the shield, the slipstream, the shell coming for you and the course map.

import { BoostGauge } from '@/components/games/boost-hud';
import { useEffect, useRef, useState, useCallback } from 'react';
import type { GameProps, GameResult } from './game-shell';
import { useBabylonPlaytestBridge } from './use-babylon-playtest-bridge';
import { BootSplash } from './boot-splash';
import { surfaceBootError } from './boot-error';
import { runMode, InputBus, type ModePhase, type SessionResult, type HudValue } from '@/lib/babylon';
import { MODES } from '@/lib/babylon/modes/registry';
import { TouchOverlay } from '@/lib/babylon/ui/TouchOverlay';
import { hnode, hnum } from './hud-format';
import { RaceCourseMap, THREAT_POS, THREAT_ARROW } from './race-course-map';
import { HudBanner, HudChip, HudFrame, HudLine, HudMeter, HudPlate, HudText, ScoreValue, type HudTone } from './tv-hud';
import { gameResultFromSession } from '@/lib/sessions/gameResultFromSession';

type Hud = Record<string, HudValue>;

/** The item's balloon colour, as a palette tone (TV HUD: one palette). */
const KART_ITEM_TONE: Record<string, HudTone> = { missile: 'danger', boost: 'you', shield: 'score', mine: 'good' };
/** The mini-turbo tiers' spark colours (racing pass phase 8): blue, sky, orange, purple — as palette tones. */
const MINI_TONE: HudTone[] = ['you', 'info', 'heat', 'power'];

export default function VelocityKartBabylon({ onEnd }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const busRef = useRef<InputBus | null>(null);
  const endedRef = useRef(false);
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;
  const [phase, setPhase] = useState<ModePhase>('loading');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hud, setHud] = useState<Hud>({});
  useBabylonPlaytestBridge('velocitykart', () => ({ phase, countdown, loadError, hud }), busRef.current);

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
      // RACING PASS phase 9: the headline is the race — the place first, then the clock and its medal. It read `timeSec`,
      // which the kart never sent (its clock is `seconds`), so every result was "RACE COMPLETE", a DNF included.
      const t = Number(r.stats?.seconds ?? r.stats?.timeSec ?? 0);
      const place = Number(r.stats?.place ?? 0), field = Number(r.stats?.field ?? 0), medal = ['none', 'bronze', 'silver', 'gold'][Number(r.stats?.medal ?? 0)] ?? 'none';
      const ord = place === 1 ? '1ST' : place === 2 ? '2ND' : place === 3 ? '3RD' : `${place}TH`;
      onEndRef.current(gameResultFromSession(r, {
        won: r.outcome === 'win',
        headline: r.outcome === 'dnf' ? `DNF · ${ord} OF ${field}`
          : place > 0 ? `${ord} OF ${field} · ${t.toFixed(1)}s${medal !== 'none' ? ` · ${medal.toUpperCase()}` : ''}` : `RACE COMPLETE · ${t.toFixed(1)}s`,
      }));
    };

    const startTimer = setTimeout(() => {
      if (disposed) return;
      runMode(MODES.velocitykart, {
        canvas, input: bus,
        onPhase: (p, cd) => {
          setPhase(p);
          setCountdown(p === 'countdown' && typeof cd === 'number' ? cd : null);
          setLoadError(p === 'error' ? (typeof cd === 'string' ? cd : 'Failed to load this mode.') : null);
        },
        onHud: (u) => setHud((prev) => ({ ...prev, ...u })),
        resultSink,
      }).then((s) => { if (disposed) { s(); return; } stop = s; })
        .catch((e) => surfaceBootError(e, { disposed, label: '[FEL-KART] boot failed', setPhase, setLoadError }));
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
      <div className="absolute inset-x-0 top-0 flex items-start justify-between px-4 py-3">
        <HudPlate className="px-3 py-1.5">
          <HudText as="div" size="caption" alpha={0.6}>KM/H</HudText>
          <ScoreValue value={hnode(hud.speed, 0)} tone="score" pop={false} />
          {Number(hud.drift) > 0 && (
            // RACING PASS phase 8: the drift reads its MINI-TURBO tier — the spark colour the release will pay
            <HudText as="div" size="value" tone={MINI_TONE[Number(hud.mini) || 0]} className="mt-0.5" style={{ fontWeight: 800 }}>
              {['DRIFT', 'MINI', 'SUPER', 'ULTRA'][Number(hud.mini) || 0]} {hnode(hud.drift, 0)}%
            </HudText>
          )}
        </HudPlate>
        <div className="flex flex-col items-center gap-1">
          <HudPlate className="px-4 py-1.5"><ScoreValue value={`${Number(hud.time ?? 0).toFixed(1)}s`} pop={false} /></HudPlate>
          {hud.pos ? <HudChip tone="score" size="label" style={{ fontWeight: 800 }}>{String(hud.pos)}</HudChip> : null}
          {/* RACING PASS phase 5: the gap — seconds to the kart ahead, or the lead */}
          {hud.gap ? <HudChip size="caption" tone={String(hud.gap).startsWith('LEAD') ? 'good' : 'text'} alpha={String(hud.gap).startsWith('LEAD') ? 1 : 0.8} style={{ fontWeight: 800 }}>{String(hud.gap)}</HudChip> : null}
          {/* IMPROVE (2026-10-06) #2: the ghost's delta (green ahead, red behind), the PB being chased and the cup — the mode
              computed all three every frame and nothing drew them */}
          {typeof hud.delta === 'string' && hud.delta && hud.delta !== '—'
            ? <HudChip size="caption" tone={hud.delta.startsWith('−') ? 'good' : 'danger'} style={{ fontWeight: 800 }}>PB {hud.delta}</HudChip>
            : null}
          {typeof hud.chasing === 'string' && hud.chasing ? <HudChip size="caption" alpha={0.8} className="max-w-[14rem] truncate" style={{ fontWeight: 800, letterSpacing: '0.1em' }}>{hud.chasing}</HudChip> : null}
          {typeof hud.cup === 'string' && hud.cup ? <HudChip size="caption" tone="score" alpha={0.9} className="max-w-[14rem] truncate">{hud.cup}</HudChip> : null}
        </div>
        <HudPlate className="px-3 py-1.5 text-right">
          <HudText as="div" size="caption" alpha={0.6}>LAP {hnode(hud.lap, '—')}</HudText>
          {/* ITEMS (2026-09-18): what the last balloon gave you; A fires it */}
          <HudText as="div" size="value" className="mt-1" tone={KART_ITEM_TONE[String(hud.itemKind ?? '')] ?? 'text'} alpha={KART_ITEM_TONE[String(hud.itemKind ?? '')] ? 1 : 0.35} style={{ fontWeight: 800 }}>{hud.item ? String(hud.item) : 'NO ITEM'}</HudText>
        </HudPlate>
      </div>

      {/* IMPROVE (2026-10-06) #2: the shield's seconds and the slipstream's charge, under the item box */}
      <div className="absolute right-3 top-[5.5rem] flex flex-col items-end gap-1">
        {hnum(hud.shield) > 0 ? <HudChip tone="score" size="label" style={{ fontWeight: 800 }}>SHIELD {hnum(hud.shield)}s</HudChip> : null}
        {hnum(hud.draft) > 0 ? (
          <HudPlate className="w-28 px-2 py-1">
            <HudMeter label="SLIPSTREAM" labelTone="info" value={Math.min(100, hnum(hud.draft))} max={100} tone="you" width="100%" height="thin" />
          </HudPlate>
        ) : null}
      </div>
      {/* IMPROVE (2026-10-06) #9: the minimap — the lap's outline, the shortcut, the field, the next gate and you */}
      <RaceCourseMap hud={hud} className="left-3 top-[6.5rem]" />
      {/* IMPROVE (2026-10-06) #6: the shell coming for you, on the edge it comes from; HOP NOW — X when the hop clears it */}
      {typeof hud.threat === 'string' && hud.threat && (
        <div className={`absolute flex ${THREAT_POS[String(hud.threatSide)] ?? THREAT_POS.BEHIND}`}>
          <HudChip className={hud.threatHop ? 'animate-pulse' : ''} tone={hud.threatHop ? 'good' : 'danger'} size="value" style={{ fontWeight: 800 }}>
            {THREAT_ARROW[String(hud.threatSide)] ?? '▼'} {hud.threat}{hud.threatHop ? ' — X' : ''}
          </HudChip>
        </div>
      )}
      {/* IMPROVE (2026-10-06) #2: off the road, the way back (the mode sent it and nothing drew it) */}
      {typeof hud.trackCue === 'string' && hud.trackCue && phase === 'playing' && (
        <div className="absolute inset-x-0 top-[44%] text-center">
          <HudChip tone="danger" size="body" style={{ fontWeight: 800 }}>{hud.trackCue}</HudChip>
        </div>
      )}

      <BoostGauge hud={hud} className="absolute inset-x-0 bottom-28" />
      {phase === 'playing' && <HudLine text={typeof hud.hint === 'string' ? hud.hint : ''} className="bottom-16" size="caption" alpha={0.7} />}
      <HudBanner text={typeof hud.banner === 'string' ? hud.banner : ''} tone="score" />
      </HudFrame>

      <BootSplash
        modeId="velocitykart" title="VELOCITY KART" phase={phase}
        detail={phase === 'error' ? (loadError ?? undefined) : (countdown ?? undefined)}
        onStart={tapStart} onRetry={tapStart}
      />
      {(phase === 'playing' || phase === 'countdown') && busRef.current && (
        <TouchOverlay bus={busRef.current} modeId="velocitykart" visible />
      )}
    </div>
  );
}
