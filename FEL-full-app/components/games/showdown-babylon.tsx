'use client';

// FEL Babylon Showdown host — the Naruto-Storm-lane arena fighter
// (ShowdownMode.ts). The mode was fully built and registered but was the ONE
// entry in the Babylon registry with no host and no route anywhere in the app,
// so it had never been playable. This file plus app/play/showdown/* is what
// makes it reachable.

import { useEffect, useRef, useState, useCallback } from 'react';
import type { GameProps, GameResult } from './game-shell';
import { BootSplash } from './boot-splash';
import { surfaceBootError } from './boot-error';
import { useBabylonBootRetry } from './use-babylon-boot-retry';
import { runMode, InputBus, type ModePhase, type SessionResult, type HudValue } from '@/lib/babylon';
import { MODES } from '@/lib/babylon/modes/lazyRegistry';   // PERF-LOAD PRF-05: this host's mode alone, imported at mount
import { mergeHud } from '@/lib/babylon/core/hudMerge';   // IMPROVE (2026-10-06): an unchanged HUD patch is not a render
import { TouchOverlay } from '@/lib/babylon/ui/TouchOverlay';
import { hnode, hnum } from './hud-format';
import { HudFrame, HudText } from './tv-hud';
import { CombatHudBand, CombatRound, CombatStat } from './combat-hud-band';   // QA P1-09: the banner line sits below the HUD, above the juice overlay
import { ReplayBug } from './fight-presentation';   // WAVE 3 (lane/w3-present)

type Hud = Record<string, HudValue>;

export default function ShowdownBabylon({ onEnd }: GameProps) {
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
      // ShowdownMode ends with SHOWDOWN_WON/SHOWDOWN_LOST and reports
      // { foeRounds } — NOT the WIN / {wins,foeWins} shape the combat host this
      // was derived from uses. Matching the wrong contract here reads every
      // outcome as a loss with a zero score.
      const won = r.outcome === 'SHOWDOWN_WON';
      const result: GameResult = {
        score: r.score,
        stats: r.stats, outcome: r.outcome,   // pass 5 phase 3: the proof line reads these
        opponentScore: Number(r.stats?.foeRounds ?? 0),
        won,
        duration: r.durationSec,
        headline: won ? 'SHOWDOWN WON' : 'SHOWDOWN LOST',
      };
      onEndRef.current(result);
    };

    const startTimer = setTimeout(() => {
      if (disposed) return;
      runMode(MODES.showdown, {
        canvas,
        input: bus,
        onPhase: (p, cd) => {
          setPhase(p);
          setCountdown(p === 'countdown' && typeof cd === 'number' ? cd : null);
          setLoadError(p === 'error' ? (typeof cd === 'string' ? cd : 'Failed to load this mode.') : null);
        },
        onHud: (u) => setHud((prev) => mergeHud(prev, u)),
        resultSink,
      })
        .then((s) => {
          if (disposed) { s(); return; }
          stop = s;
        })
        .catch((e) => surfaceBootError(e, { disposed, label: '[FEL-COMBAT] boot failed', setPhase, setLoadError }));
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

  // WAVE 3: a KO replay (hud.replay) is the shot — the stat band steps aside and the REPLAY tag says how to skip it
  const replaying = Number(hud.replay) === 1;
  const showHud = phase === 'playing';

  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-white/10 bg-black">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

      {/* TV HUD (A9.13, lane/tv-hud): the fight readouts on the shared system — same keys, same band, same corners. */}
      {showHud && (
        <HudFrame>
        {!replaying && (
        <CombatHudBand banner={typeof hud.banner === 'string' ? hud.banner : ''}>
        <div className="flex justify-between px-4 py-3">
          <div className="flex flex-col items-start gap-1">
            <CombatStat label="HP" value={hnum(hud.hp, 100)} tone="you" />
            <CombatStat label="GUARD" value={hnum(hud.guard, 100)} tone="them" />
            <CombatStat label="CHI" value={hnum(hud.chi, 0)} tone="power" />
            {/* IMPROVE (2026-10-06): the assist's cooldown — the mode sent it every frame and nothing drew it */}
            <CombatStat label="ASSIST" value={hnode(hud.assist, 'READY')} tone="info" />
          </div>
          <CombatRound round={hnode(hud.round, 1)} wins={hnode(hud.wins, 0)} foeWins={hnode(hud.foeWins, 0)}>
            {typeof hud.loadout === 'string' && hud.loadout && <HudText size="label" tone="you">{hud.loadout}</HudText>}
          </CombatRound>
          <div className="flex flex-col items-end gap-1">
            <CombatStat label="FOE HP" value={hnum(hud.foeHp, 100)} tone="danger" />
            <CombatStat label="FOE GUARD" value={hnum(hud.foeGuard, 100)} tone="them" />
            <CombatStat label="FOE CHI" value={hnum(hud.foeChi, 0)} tone="power" />
          </div>
        </div>
        </CombatHudBand>
        )}
        <ReplayBug on={replaying} />
        </HudFrame>
      )}

      <BootSplash
        modeId="showdown"
        title="SHOWDOWN"
        phase={phase}
        detail={phase === 'error' ? (loadError ?? undefined) : (countdown ?? undefined)}
        onStart={tapStart}
        onRetry={retryBoot}
      />

      {(phase === 'playing' || phase === 'countdown') && busRef.current && (
        <TouchOverlay bus={busRef.current} modeId="showdown" visible />
      )}
    </div>
  );
}
