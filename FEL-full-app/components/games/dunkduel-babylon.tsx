'use client';

// FEL Babylon Dunk Duel host (M56 Phase 6). Pass-and-play head-to-head
// judged dunk contest for 2 local players.

import { readCourtLocation } from '@/lib/babylon/nexus/courtLocations';
import { courtArtSkin } from '@/lib/modes/art/apply-art-card';
import { useEffect, useRef, useState, useCallback } from 'react';
import type { GameProps, GameResult } from './game-shell';
import { BootSplash } from './boot-splash';
import { surfaceBootError } from './boot-error';
import { useBabylonBootRetry } from './use-babylon-boot-retry';
import { runMode, InputBus, type ModePhase, type SessionResult, type HudValue, type HudScoreCard } from '@/lib/babylon';
import { MODES } from '@/lib/babylon/modes/lazyRegistry';   // PERF-LOAD PRF-05: this host's mode alone, imported at mount
import { TouchOverlay } from '@/lib/babylon/ui/TouchOverlay';
import { hnode, hnum } from './hud-format';
import { HUD_TEXT_ALPHA, HudBanner, HudChip, HudFrame, HudMeter, HudPlate, HudText, HudLowerThird } from './tv-hud';
import { JudgeCards } from './judge-cards';
import { MicCaption, MicToggle } from './mic-caption';

type Hud = Record<string, HudValue>;

// Which mount currently owns a given canvas — StrictMode double-mounts this
// host, and an unguarded late teardown kills the live engine's WebGL context
// (the measured black-frame disease; same guard as carnival/air-session).
const canvasOwner = new WeakMap<HTMLCanvasElement, object>();

export default function DunkDuelBabylon({ onEnd }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const busRef = useRef<InputBus | null>(null);
  const endedRef = useRef(false);
  const [phase, setPhase] = useState<ModePhase>('loading');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hud, setHud] = useState<Hud>({});
  const { bootAttempt, retryBoot } = useBabylonBootRetry({ busRef, endedRef, setPhase, setCountdown, setLoadError, reset: () => setHud({}) });
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;

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
      // The mode ends 'P1_WINS' / 'P2_WINS' / 'DUEL_TIED' with stats {p1,p2}
      // — the old 'WIN'/'LOSS' check + stats.p1Score reads made every recap
      // a 0–0 "DEAD HEAT!".
      const won = r.outcome === 'P1_WINS';
      const result: GameResult = {
        score: Number(r.stats?.p1 ?? r.score ?? 0),
        stats: r.stats, outcome: r.outcome,   // pass 5 phase 3: the proof line reads these
        opponentScore: Number(r.stats?.p2 ?? 0),
        won,
        duration: r.durationSec,
        headline: r.outcome === 'DUEL_TIED' ? 'DEAD HEAT!' : won ? 'P1 WINS!' : 'P2 WINS!',
      };
      onEndRef.current(result);
    };

    const startTimer = setTimeout(() => {
      if (disposed) return;
      runMode(MODES.dunkduel, {
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
          // A newer mount owns the canvas: do NOT run our teardown.
          if (disposed) { if (canvasOwner.get(canvas) === token) s(); return; }
          stop = s;
        })
        .catch((e) => surfaceBootError(e, { disposed, label: '[FEL-DUNKDUEL] boot failed', setPhase, setLoadError }));
    }, 0);

    return () => {
      disposed = true;
      clearTimeout(startTimer);
      if (canvasOwner.get(canvas) === token) stop?.();
      busRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- callbacks are refs; bootAttempt remounts after a rejected runMode().
  }, [bootAttempt]);

  const emit = useCallback((e: Parameters<InputBus['emit']>[0]) => {
    busRef.current?.emit(e);
  }, []);

  const tapStart = useCallback(() => {
    emit({ t: 'button', btn: 'START', pressed: true });
  }, [emit]);

  const showHud = phase === 'playing';

  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-white/10 bg-black">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

      {/* TV HUD (A9.13, lane/hud-hoops): the duel's readouts on the shared system — same keys, same gates, same slots. */}
      <HudFrame>
      {showHud && (
        <div className="absolute inset-x-0 top-0 flex justify-between px-4 py-3">
          <div className="flex flex-col gap-1">
            <HudChip tone="you" size="value" className="self-start">P1: {hnum(hud.p1Score, 0)}</HudChip>
          </div>
          <div className="text-center">
            <HudText size="stat" className="uppercase">{hnode(hud.activePlayer, 'P1')}</HudText>
            <div>
              <HudText size="label" alpha={HUD_TEXT_ALPHA.faint}>
                DUNK {hnode(hud.dunkNum, '1/2')} · {hnode(hud.style, 'POWER')} · {hnode(hud.prop, 'NO PROP')}
              </HudText>
            </div>
            {typeof hud.hint === 'string' && hud.hint && (
              <HudPlate className="mx-auto mt-1 max-w-xs px-2 py-0.5">
                <HudText size="body" alpha={0.85}>{hud.hint}</HudText>
              </HudPlate>
            )}
            {/* charge meter — the loaded jump, while it loads */}
            {typeof hud.charge === 'number' && hud.charge > 0 && (
              <HudMeter className="mx-auto mt-1 items-center" height="thin" width="9rem" value={hud.charge} max={100} tone="you" fillStyle={{ transition: 'none' }} />
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            <HudChip tone="them" size="value">P2: {hnum(hud.p2Score, 0)}</HudChip>
          </div>
        </div>
      )}

      {/* SLAM pulse — the QTE window, impossible to miss (the ping stills under reduced motion) */}
      {hud.slamPulse === true && phase === 'playing' && (
        <div className="absolute inset-x-0 top-[30%] text-center">
          <HudText size="hero" tone="score" className="inline-block animate-ping motion-reduce:animate-none">SLAM!</HudText>
        </div>
      )}

      {/* the judges' cards — the contest's moment of truth (same staged
          reveal as Dunk Contest's bezel) */}
      {Array.isArray(hud.judgeReveal) && (hud.judgeReveal as HudScoreCard[]).length > 0 && (
        <div className="absolute inset-x-0 top-[20%] flex flex-col items-center gap-2">
          <JudgeCards cards={hud.judgeReveal as HudScoreCard[]} />
        </div>
      )}

      {phase === 'playing' && <HudBanner text={typeof hud.banner === 'string' ? hud.banner : ''} tone="you" plate={false} className="top-1/3" />}

      {/* WAVE 3 (lane/w3-present): the player-turn name card — a lower third that slides in when the floor changes hands (the active
          player and the dunk's number are the key), from the keys the duel already sends. It sits above the hint and clear of the MC's caption. */}
      {(() => {
        const who = typeof hud.activePlayer === 'string' ? hud.activePlayer : '';
        const count = typeof hud.dunkNum === 'string' ? hud.dunkNum : '';
        const [num, ...rest] = count.split(' · ');
        return (
          <HudLowerThird
            enabled={showHud}
            cardKey={who ? `${who}|${count}` : ''}
            tone={who === 'P2' ? 'them' : 'you'}
            kicker="NOW UP"
            title={who ? `PLAYER ${who.replace(/\D/g, '') || '1'}` : ''}
            sub={`DUNK ${num || '1/2'}${rest.length ? ` · ${rest.join(' · ')}` : ''} · ${hnode(hud.style, 'POWER')} · ${hnode(hud.prop, 'NO PROP')}`}
            aside={<span>{hnum(hud.p1Score, 0)}–{hnum(hud.p2Score, 0)}</span>}
          />
        );
      })()}
      </HudFrame>

      {/* THE MIC (2026-09-24): what the court's MC just said, and the switch for the voice */}
      {phase === 'playing' && <MicCaption text={hud.mic} who={hud.micWho} />}
      {phase === 'playing' && <MicToggle />}

      <BootSplash
        modeId="dunkduel"
        title="PROVE IT"
        phase={phase}
        detail={phase === 'error' ? (loadError ?? undefined) : (countdown ?? undefined)}
        onStart={tapStart}
        onRetry={retryBoot}
      />

      {(phase === 'playing' || phase === 'countdown') && busRef.current && (
        <TouchOverlay bus={busRef.current} modeId="dunkduel" visible />
      )}
    </div>
  );
}
