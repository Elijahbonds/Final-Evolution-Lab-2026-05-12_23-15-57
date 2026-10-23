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
import { useBabylonBootRetry } from './use-babylon-boot-retry';
import { runMode, InputBus, type ModePhase, type SessionResult, type HudValue } from '@/lib/babylon';
import { MODES } from '@/lib/babylon/modes/registry';
import { TouchOverlay } from '@/lib/babylon/ui/TouchOverlay';
import { hnode } from './hud-format';
import { HUD_TEXT_ALPHA, HudBanner, HudChip, HudFrame, HudLine, HudMeter, HudPlate, HudText, ScoreValue, Scorebug, hudColor } from './tv-hud';
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
  const { bootAttempt, retryBoot } = useBabylonBootRetry({ busRef, endedRef, setPhase, setCountdown, setLoadError, reset: () => setHud({}) });
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
  }, [bootAttempt]);

  const emit = useCallback((e: Parameters<InputBus['emit']>[0]) => {
    busRef.current?.emit(e);
  }, []);

  const tapStart = useCallback(() => {
    emit({ t: 'button', btn: 'START', pressed: true });
  }, [emit]);

  const slingFull = typeof hud.slingshot === 'number' && Number(hud.slingshot) >= 100;
  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-white/10 bg-black">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

      {/* TV HUD (A9.13, lane/tv-hud): the shared system (components/games/tv-hud) draws every readout — same keys,
          same gates, same slots. */}
      <HudFrame>
      {/* HUD bezel. It used to render a field the mode has never published
          (the mode's is `evades`), and nothing else: no score, no toGo, no
          breakaway, no truck state. Same family trap as the 3PT board and the
          energy gauge — published state is not a bezel. */}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between px-4 py-3">
        <HudChip size="value">{hnode(hud.down, '1')} & {hnode(hud.toGo, 10)}</HudChip>
        <Scorebug>
          <ScoreValue value={hnode(hud.score, 0)} size="stat" tone="score" />
          <HudText size="caption" tone="score">PTS</HudText>
        </Scorebug>
        <HudChip tone="good" size="label">{hnode(hud.yards, 0)} YD · {hnode(hud.evades, 0)} EVA</HudChip>
      </div>

      {/* drive state chips: breakaway gear + truck cooldown */}
      <div className="absolute left-4 top-14 flex flex-col items-start gap-1">
        {hud.breakaway === true && (
          <HudChip plate={false} fill={0.25} tone="danger" className="rounded">BREAKAWAY</HudChip>
        )}
        {/* IMPROVE (2026-10-06) #7: the cooldown FILLS — a ring around the chip's dot, so a pull while it fills is not a dead button */}
        <HudChip plate={false} fill={hud.truckReady === false ? undefined : 0.15} tone="you" alpha={hud.truckReady === false ? 0.3 : 1} className="items-center rounded"
          style={hud.truckReady === false ? { background: 'rgba(255, 255, 255, 0.1)', color: hudColor('text', 0.3) } : undefined}>
          <span
            className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle"
            style={{ background: `conic-gradient(${hudColor('you')} ${Math.round(Math.max(0, Math.min(1, typeof hud.truckCool === 'number' ? hud.truckCool : 1)) * 360)}deg, rgba(255,255,255,0.15) 0deg)` }}
          />
          <HudText size="label" tone={hud.truckReady === false ? 'text' : 'you'} alpha={hud.truckReady === false ? 0.3 : 1}>TRUCK {hud.truckReady === false ? '…' : 'READY'}</HudText>
        </HudChip>
        {/* KICKOFF RETURN (owner brief 2026-09-18): the lane you are in, and the SLINGSHOT gauge drafting behind a blocker fills */}
        {typeof hud.lane === 'string' && hud.lane && <HudChip plate={false} fill={0.2} tone="score" className="rounded">{hud.lane}</HudChip>}
        {typeof hud.slingshot === 'number' && (
          <HudMeter
            className="mt-0.5"
            /* controls-screen-2 (2026-10-06): the meter's name while it fills, not how to fill it (the CONTROLS panel says
               that); the full meter's call to press is a live prompt and stays */
            label={Number(hud.slingshot) >= 100 ? 'SLINGSHOT READY — L1' : 'SLINGSHOT'}
            labelTone={slingFull ? 'info' : undefined}
            labelAlpha={slingFull ? 1 : HUD_TEXT_ALPHA.faint}
            value={Number(hud.slingshot)} max={100} tone="info" fillAlpha={slingFull ? 1 : 0.6} glow={slingFull}
            height="thick" width="8rem" framed round={false}
          />
        )}
        {/* FOOTBALL UPGRADE: the BREAKAWAY meter — a line per evade toward it, then its own clock draining */}
        {typeof hud.breakawayFill === 'number' && (
          <HudMeter
            className="mt-0.5"
            label={hud.breakaway === true ? 'BREAKAWAY — gone' : 'EVADES → BREAKAWAY'}
            labelTone={hud.breakaway === true ? 'danger' : undefined}
            labelAlpha={hud.breakaway === true ? 1 : HUD_TEXT_ALPHA.faint}
            value={hud.breakawayFill} max={1} tone={hud.breakaway === true ? 'danger' : 'you'} fillAlpha={hud.breakaway === true ? 1 : 0.7}
            height="thick" width="8rem" framed round={false}
            ticks={ticksOf(hud.breakawayTicks).map((t) => ({ at: t }))}
          />
        )}
        {typeof hud.weather === 'string' && hud.weather && <HudChip plate={false} alpha={0.7} className="rounded" style={{ background: 'rgba(255, 255, 255, 0.1)' }}>{hud.weather}</HudChip>}
        {/* IMPROVE (2026-10-06) #11: the session's target — the next medal and the points to it, and the viewer's best */}
        {typeof hud.par === 'string' && hud.par && <HudChip tone="score">{hud.par}</HudChip>}
      </div>

      {/* A+ mission #9 (Tecmo Bowl feel + Madden readability): the field strip — ball, line of scrimmage, first-down line
          in yards — the TARGET read on the nearest defender, and the drive card between drives. All key-gated. */}
      {typeof hud.ballOn === 'number' && typeof hud.fieldLen === 'number' && (
        <div className="absolute inset-x-0 top-12 flex flex-col items-center gap-1">
          <HudMeter
            height="strip" width="min(560px, 72vw)" framed round={false}
            segments={[{ from: 0, to: 1, tone: 'good', alpha: 0.32 }]}
            ticks={Array.from({ length: Math.floor(hud.fieldLen / 10) + 1 }, (_, i) => ({ at: (i * 10) / Number(hud.fieldLen), major: true }))}
            markers={[
              ...(typeof hud.los === 'number' ? [{ at: hud.los / hud.fieldLen, tone: 'you' as const, width: 2 }] : []),
              ...(typeof hud.firstDown === 'number' ? [{ at: Math.min(1, hud.firstDown / hud.fieldLen), tone: 'score' as const, width: 2 }] : []),
            ]}
          >
            <div className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${Math.min(100, (hud.ballOn / hud.fieldLen) * 100)}%`, background: hudColor('text'), boxShadow: `0 0 8px ${hudColor('text')}` }} />
          </HudMeter>
          <div className="flex items-center gap-3">
            <HudText size="caption" alpha={HUD_TEXT_ALPHA.muted}>BALL ON {hud.ballOn}</HudText>
            <HudText size="caption" tone="score">1ST AT {hnode(hud.firstDown, '—')}</HudText>
            <HudText size="caption" alpha={HUD_TEXT_ALPHA.muted}>GOAL {hud.fieldLen}</HudText>
            {typeof hud.drive === 'string' && hud.drive && <HudText size="caption" alpha={HUD_TEXT_ALPHA.faint}>DRIVE {hud.drive}</HudText>}
          </div>
        </div>
      )}
      {/* IMPROVE (2026-10-06) #10: the live reads as button chips — B VAULT, A CATAPULT, R1 ARM — when each one will act */}
      {typeof hud.prompts === 'string' && hud.prompts && (
        <div className="absolute inset-x-0 bottom-36 flex justify-center gap-2">
          {hud.prompts.split(' · ').map((p) => (
            <HudChip key={p} tone="info" size="body" style={{ border: `1px solid ${hudColor('info', 0.5)}` }}>{p}</HudChip>
          ))}
        </div>
      )}
      {typeof hud.target === 'string' && hud.target && (
        <div className="absolute inset-x-0 bottom-28 flex justify-center">
          <HudChip tone="danger" size="value">TARGET {hud.target}</HudChip>
        </div>
      )}
      {Array.isArray(hud.board) && typeof hud.boardTitle === 'string' && hud.boardTitle && (
        <div className="absolute inset-0 flex items-center justify-center px-4">
          <HudPlate className="w-full max-w-[440px] px-5 py-4">
            <HudText as="div" size="score">DRIVE CARD</HudText>
            <div className="mt-3 grid gap-1.5">
              {(hud.board as { name: string; score: number | string; line: string }[]).map((r) => (
                <div key={r.name} className="flex items-center justify-between gap-3 rounded-lg px-3 py-1.5" style={{ background: 'rgba(0, 0, 0, 0.4)' }}>
                  <HudText size="value" alpha={0.9}>{r.name}</HudText>
                  <HudText size="label" alpha={HUD_TEXT_ALPHA.faint} className="truncate">{r.line}</HudText>
                  <ScoreValue value={`${r.score} YD`} size="stat" pop={false} tone="score" />
                </div>
              ))}
            </div>
            <HudText as="div" size="label" tone="score" className="mt-3">{hud.boardTitle}</HudText>
          </HudPlate>
        </div>
      )}

      <HudLine text={typeof hud.hint === 'string' ? hud.hint : ''} size="caption" alpha={0.7} className="bottom-16" />

      <HudBanner text={typeof hud.banner === 'string' ? hud.banner : ''} tone="score" />
      </HudFrame>

      <BootSplash
        modeId="football"
        title="BREAKAWAY"
        phase={phase}
        detail={phase === 'error' ? (loadError ?? undefined) : (countdown ?? undefined)}
        onStart={tapStart}
        onRetry={retryBoot}
      />

      {/* M35: THE single touch control surface — one overlay per mode, ever. */}
      {(phase === 'playing' || phase === 'countdown') && busRef.current && (
        <TouchOverlay bus={busRef.current} modeId="football" visible />
      )}
    </div>
  );
}
