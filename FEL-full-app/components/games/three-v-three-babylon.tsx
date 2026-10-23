'use client';

// FEL Babylon 3V3 Streetball stage (M48). THIN host: owns the <canvas>, boots
// the shared Babylon harness with the ThreeVThree ModeDefinition, and bridges
// phase/HUD/result into the existing GameShell pipeline. All gameplay lives in
// lib/babylon/* cores (BasketballCore + PlayerSlot + TeammateBrain).

import { readCourtLocation } from '@/lib/babylon/nexus/courtLocations';
import { courtArtSkin } from '@/lib/modes/art/apply-art-card';
import { useEffect, useRef, useState, useCallback } from 'react';
import type { GameProps, GameResult } from './game-shell';
import { BootSplash } from './boot-splash';
import { surfaceBootError } from './boot-error';
import { useBabylonBootRetry } from './use-babylon-boot-retry';
import { runMode, InputBus, type ModePhase, type SessionResult, type HudValue } from '@/lib/babylon';
import { MODES } from '@/lib/babylon/modes/registry';
import { TouchOverlay } from '@/lib/babylon/ui/TouchOverlay';
import { hnode } from './hud-format';
import { HUD_TEXT_ALPHA, HudBanner, HudChip, HudFrame, HudLine, HudMeter, HudPlate, HudText, ScoreValue, Scorebug } from './tv-hud';
import { HoopsShotMeter } from './hoops-shot-meter';
import { HoopsShotClock } from './hoops-shot-clock';   // lane/hoops-shot-core: ELITE's shot clock on the scorebug
import { MicCaption, MicToggle } from './mic-caption';   // THE MIC (2026-09-24): what the court's MC just said, and the voice switch

type Hud = Record<string, HudValue>;

export default function ThreeVThreeBabylon({ onEnd }: GameProps) {
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
    const bus = new InputBus();
    busRef.current = bus;
    let stop: (() => void) | null = null;
    let disposed = false;

    const resultSink = async (r: SessionResult) => {
      if (endedRef.current) return;
      endedRef.current = true;
      // 'DRAW' is a real outcome at the buzzer now, and it is neither a win nor a defeat.
      // Reporting a level game as GAME OVER would be as dishonest as the WIN it replaced.
      const drew = r.outcome === 'DRAW';
      const won = r.outcome === 'WIN';
      const result: GameResult = {
        score: r.score,
        stats: r.stats, outcome: r.outcome,   // pass 5 phase 3: the proof line reads these
        opponentScore: r.stats?.foeScore ?? 0,
        won,
        duration: r.durationSec,
        headline: won ? 'GAME WON' : drew ? 'DEAD EVEN' : 'GAME OVER',
      };
      onEndRef.current(result);
    };

    // StrictMode runs effect -> cleanup -> effect. Starting the harness
    // immediately means the PHANTOM mount also builds a Babylon engine, and its
    // cleanup cannot cancel it — `stop` is not assigned until the async load
    // resolves. Two engines then sit on the SAME canvas sharing one WebGL
    // context and fight, and the loser renders nothing: the HUD streams happily
    // from one instance while the canvas shows an empty void. Measured on this
    // mode: mountVenue ran TWICE and the scene came out at 5 meshes.
    // Deferring by a tick lets the phantom mount be cancelled before it builds.
    // Identical fix to the one the Dunk host needed.
    const startTimer = setTimeout(() => {
      if (disposed) return;
      runMode(MODES.threevthree, {
        canvas,
        location: readCourtLocation(),   // court location pick (docs/SPEC-COURT-LOCATIONS.md)
        applySkin: courtArtSkin,   // PIPELINES (2026-10-06): the player's court art card, a centre-court decal
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
        .catch((e) => surfaceBootError(e, { disposed, label: '[FEL-HOOPS3] boot failed', setPhase, setLoadError }));
    }, 0);

    return () => {
      disposed = true;
      clearTimeout(startTimer);
      stop?.();
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

  const meter = typeof hud.shotMeterT === 'number' ? Math.max(0, Math.min(1, hud.shotMeterT)) : null;

  return (
    <div className="relative h-[calc(100dvh-3.25rem)] w-full overflow-hidden rounded-none border-0 bg-transparent">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

      {/* TV HUD (A9.13, lane/hud-hoops): the 3v3's readouts on the shared system — same keys, same gates, same slots. */}
      <HudFrame>
      {/* HUD bezel */}
      <div className="absolute inset-x-0 top-0 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-4 py-3">
        <Scorebug>
          <ScoreValue value={hnode(hud.score, 0)} size="stat" />
          <HudText size="stat" alpha={HUD_TEXT_ALPHA.faint}>–</HudText>
          <ScoreValue value={hnode(hud.foeScore, 0)} size="stat" />
          {phase === 'playing' && <HoopsShotClock value={hud.shotClock} />}
        </Scorebug>
        <HudChip tone="you" size="body">AST {hnode(hud.ast, 0)}</HudChip>
        {/* CHOKEPOINT COURT (?choke=1): the rails are on */}
        {typeof hud.court === 'string' && hud.court && <HudChip tone="score" size="caption">{hud.court}</HudChip>}
        {/* SYNERGY (owner brief 2026-09-18): the team's shared gauge — assists, steals, drifts, blocks, dunks and the slipstream fill it; full, it OVERDRIVES for 15 s */}
        {typeof hud.synergy === 'number' && (() => {
          const syn = Math.max(0, Math.min(100, Number(hud.synergy))); const od = Number(hud.overdrive ?? 0);
          return (
            <HudPlate as="span" className="flex items-center px-3 py-1">
              <HudMeter
                layout="inline" label="SYN" height="bar" width="5rem"
                value={od > 0 ? 100 : syn} max={100}
                tone={od > 0 || syn >= 70 ? 'score' : 'you'} fillAlpha={od > 0 ? 1 : syn >= 70 ? 0.85 : 0.8}
                status={od > 0 ? `OVERDRIVE ${od}s` : undefined} statusTone="score"
              />
            </HudPlate>
          );
        })()}
        <HudChip tone="score" size="body">{typeof hud.time === 'number' ? `${hud.time}s` : 'TO 21'}</HudChip>
      </div>

      {/* shot meter */}
      {meter !== null && phase === 'playing' && (
        <div className="absolute inset-x-0 bottom-24 flex justify-center">
          <HoopsShotMeter t={meter} green={hud.shotMeterGreen} perfect={hud.shotMeterPerfect} />
        </div>
      )}

      {phase === 'playing' && <HudBanner text={typeof hud.banner === 'string' ? hud.banner : ''} tone="you" plate={false} className="top-1/3" />}

      {/* IMPROVE (2026-10-06) #5: what the PASS button would throw right now — the ring under the mate is its colour */}
      {typeof hud.passPreview === 'string' && hud.passPreview && phase === 'playing' && (
        <div className="absolute inset-x-0 bottom-[4.25rem] flex justify-center">
          <HudChip size="caption" tone={hud.passPreview === 'NO LANE' ? 'text' : 'you'} alpha={hud.passPreview === 'NO LANE' ? 0.5 : 1}>J · {hud.passPreview}</HudChip>
        </div>
      )}
      {/* IMPROVE (2026-10-06) #7: ONE line for the state you are in (it used to be every control at once) */}
      {typeof hud.hint === 'string' && hud.hint && phase === 'playing' && (
        <HudLine text={hud.hint} size="caption" alpha={0.8} className="bottom-10" />
      )}
      </HudFrame>

      {phase === 'playing' && <MicCaption text={hud.mic} who={hud.micWho} />}
      {phase === 'playing' && <MicToggle />}

      <BootSplash
        modeId="threevthree"
        title="THREES"
        phase={phase}
        detail={phase === 'error' ? (loadError ?? undefined) : (countdown ?? undefined)}
        onStart={tapStart}
        onRetry={retryBoot}
      />

      {/* HOOPS PAUSE (2026-10-06). Owner: "Hoops pause: Controls panel only" — the full OFFENSE / DEFENSE list that sat along the
          bottom here on pause (IMPROVE #7) is in the splash's CONTROLS panel now (lib/babylon/ui/panelLines.ts PANEL_GROUPS): one
          list on the pause, the same as every other mode. */}

      {(phase === 'playing' || phase === 'countdown') && busRef.current && (
        <TouchOverlay
          bus={busRef.current}
          modeId="threevthree"
          visible
          // CALL FOR THE BALL (Elijah item 2): the pad's PASS slot is BALL! whenever `onBall` reads false — shown
          // only while off-ball, same press (button A), same wire LocalInputSource already reads as intent.pass.
          overrides={hud.onBall === false ? { A: { label: 'BALL!', color: '#fbbf24' } } : undefined}
        />
      )}
    </div>
  );
}
