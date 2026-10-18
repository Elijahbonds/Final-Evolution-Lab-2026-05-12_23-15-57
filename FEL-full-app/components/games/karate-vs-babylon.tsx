'use client';

// FEL Babylon Karate VS host (M53 Phase 3 rebuild). THIN host: boots the
// KarateVSMode ModeDefinition via the shared Babylon harness. Best-of-3
// duel with FightCore combat, guard/parry, chi special.

import { useEffect, useRef, useState, useCallback } from 'react';
import type { GameProps, GameResult } from './game-shell';
import { useBabylonPlaytestBridge } from './use-babylon-playtest-bridge';
import { BootSplash } from './boot-splash';
import { surfaceBootError } from './boot-error';
import { useBabylonBootRetry } from './use-babylon-boot-retry';
import { runMode, InputBus, type ModePhase, type SessionResult, type HudValue } from '@/lib/babylon';
import { MODES } from '@/lib/babylon/modes/registry';
import { mergeHud } from '@/lib/babylon/core/hudMerge';   // IMPROVE (2026-10-06): an unchanged HUD patch is not a render
import { TouchOverlay } from '@/lib/babylon/ui/TouchOverlay';
import { hnode, hnum } from './hud-format';
import { HudFrame } from './tv-hud';
import { CombatClock, CombatHudBand, CombatRound, CombatStat } from './combat-hud-band';   // QA P1-09: the banner line sits below the HUD, above the juice overlay
import { FightIntroPlates, FightSlam, ReplayBug } from './fight-presentation';   // WAVE 3 (lane/w3-present): the intro's name plates, ROUND / FIGHT / K.O. slam text, the replay tag

type Hud = Record<string, HudValue>;

export default function KarateVSBabylon({ onEnd }: GameProps) {
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
  useBabylonPlaytestBridge('karate_vs', () => ({ phase, countdown, loadError, hud }), busRef.current);

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
      // KarateVSMode ends with 'MATCH_WON' / 'MATCH_LOST' (KarateVSMode.ts:314). This compared
      // against 'WIN', which the mode never emits, so `won` was false for every match ever
      // played here — a won fight was recorded and displayed as DEFEATED. Its sibling
      // mixedcombat-babylon.tsx already carries the fix and the note; karate_vs was missed.
      // The score had the same shape of bug: the mode's stats are { rounds, foeWins } with no
      // `wins` key at all, so this read 0 every time. The score rides r.score, and is floored
      // at 0 because the mode's formula (myWins * 100 - foeWins * 40) goes negative on a sweep.
      const won = r.outcome === 'MATCH_WON';
      const result: GameResult = {
        score: Math.max(0, Math.round(r.score ?? 0)),
        stats: r.stats, outcome: r.outcome,   // pass 5 phase 3: the proof line reads these
        opponentScore: Number(r.stats?.foeWins ?? 0),
        won,
        duration: r.durationSec,
        headline: won ? 'VICTORY' : 'DEFEATED',
      };
      onEndRef.current(result);
    };
    // StrictMode runs effect -> cleanup -> effect. Starting immediately means the
    // PHANTOM mount also builds a Babylon engine its cleanup cannot cancel, and
    // two engines fight over one WebGL context — 3v3 rendered an empty void this
    // way and the Dunk guest path rendered black. This mode was already logging
    // "[FEL-SPAWN] karate-vs: OK" TWICE per load.
    const startTimer = setTimeout(() => {
      if (disposed) return;
      runMode(MODES.karate_vs, {
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
        .catch((e) => surfaceBootError(e, { disposed, label: '[FEL-KARATE-VS] boot failed', setPhase, setLoadError }));
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

  const showHud = phase === 'playing';
  // WAVE 3: during the intro walk-in (hud.intro) and a KO replay (hud.replay) the stat band steps aside — the shot is the picture
  const intro = typeof hud.intro === 'string' ? hud.intro : '';
  const replaying = Number(hud.replay) === 1;

  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-white/10 bg-black">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

      {/* TV HUD (A9.13, lane/tv-hud): the fight readouts on the shared system — same keys, same band, same corners. */}
      {showHud && (
        <HudFrame>
        {!intro && !replaying && (
        <CombatHudBand banner={typeof hud.banner === 'string' ? hud.banner : ''} slam={hud.slam}>
        <div className="flex justify-between px-4 py-3">
          <div className="flex flex-col items-start gap-1">
            <CombatStat label="HP" value={hnum(hud.hp, 100)} tone="you" />
            <CombatStat label="GUARD" value={hnum(hud.guard, 100)} tone="them" />
            <CombatStat label="CHI" value={hnum(hud.chi, 0)} tone="power" />
            {hud.focus != null && <CombatStat label="FOCUS" value={hnum(hud.focus, 0)} tone="good" glow={Boolean(hud.focusOn)} title="FOCUS — hold R2" />}
          </div>
          <CombatRound round={hnode(hud.round, 1)} wins={hnode(hud.wins, 0)} foeWins={hnode(hud.foeWins, 0)}>
            {/* IMPROVE (2026-10-06): the round clock — a round that runs out is decided on HP at the bell (TIME) */}
            {typeof hud.timeLeft === 'number' && <CombatClock seconds={hud.timeLeft} redAt={10} />}
          </CombatRound>
          <div className="flex flex-col items-end gap-1">
            <CombatStat label="FOE HP" value={hnum(hud.foeHp, 100)} tone="danger" />
            <CombatStat label="FOE GUARD" value={hnum(hud.foeGuard, 100)} tone="them" />
            <CombatStat label="FOE CHI" value={hnum(hud.foeChi, 0)} tone="power" />
          </div>
        </div>
        </CombatHudBand>
        )}
        <FightIntroPlates beat={hud.intro} foeName={hud.foeName} foeSub={hud.foeSub} meName={hud.meName} meSub={hud.meSub} />
        <FightSlam text={hud.slam} seq={hud.slamSeq} />
        <ReplayBug on={replaying} />
        </HudFrame>
      )}

      <BootSplash
        modeId="karate_vs"
        title="STORM DUEL"
        phase={phase}
        detail={phase === 'error' ? (loadError ?? undefined) : (countdown ?? undefined)}
        onStart={tapStart}
        onRetry={retryBoot}
      />

      {(phase === 'playing' || phase === 'countdown') && busRef.current && (
        <TouchOverlay bus={busRef.current} modeId="karate_vs" visible />
      )}
    </div>
  );
}
