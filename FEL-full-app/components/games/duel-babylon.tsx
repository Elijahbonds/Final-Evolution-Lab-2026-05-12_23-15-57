'use client';

// FEL Babylon Duel host — the Soul-Calibur-lane weapon duel (DuelMode.ts).
// This mode was fully built and registered but had no route anywhere in the
// app; this file (plus app/play/duel/*) is what actually makes it playable.

import { useEffect, useRef, useState, useCallback } from 'react';
import type { GameProps, GameResult } from './game-shell';
import { useBabylonPlaytestBridge } from './use-babylon-playtest-bridge';
import { BootSplash } from './boot-splash';
import { surfaceBootError } from './boot-error';
import { runMode, InputBus, type ModePhase, type SessionResult, type HudValue } from '@/lib/babylon';
import { MODES } from '@/lib/babylon/modes/registry';
import { mergeHud } from '@/lib/babylon/core/hudMerge';   // IMPROVE (2026-10-06): an unchanged HUD patch is not a render
import { TouchOverlay } from '@/lib/babylon/ui/TouchOverlay';
import { hnode, hnum } from './hud-format';
import { HudBanner, HudFrame, HudText } from './tv-hud';
import { CombatClock, CombatEdgeCall, CombatRound, CombatStat } from './combat-hud-band';
import { ReplayBug } from './fight-presentation';   // WAVE 3 (lane/w3-present)

type Hud = Record<string, HudValue>;

const canvasOwner = new WeakMap<HTMLCanvasElement, object>();

export default function DuelBabylon({ onEnd }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const busRef = useRef<InputBus | null>(null);
  const endedRef = useRef(false);
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;
  const [phase, setPhase] = useState<ModePhase>('loading');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hud, setHud] = useState<Hud>({});
  useBabylonPlaytestBridge('duel', () => ({ phase, countdown, loadError, hud }), busRef.current);

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
      const won = r.outcome === 'DUEL_WON';
      const result: GameResult = {
        // IMPROVE (2026-10-06): the mode's score (rounds + ring-outs + guard impacts — duelRules). This read `stats.wins`,
        // which the mode never sent, so every duel recorded 0; floored at 0 (a 0–2 loss is −80, and a negative score is refused)
        score: Math.max(0, Math.round(r.score ?? 0)),
        stats: r.stats, outcome: r.outcome,   // pass 5 phase 3: the proof line reads these
        opponentScore: Number(r.stats?.foeWins ?? 0),
        won,
        duration: r.durationSec,
        headline: won ? 'DUEL WON' : 'DUEL LOST',
      };
      onEndRef.current(result);
    };

    const startTimer = setTimeout(() => {
      if (disposed) return;
      runMode(MODES.duel, {
        canvas,
        input: bus,
        onPhase: (p, cd) => {
          if (disposed) return;
          setPhase(p);
          setCountdown(p === 'countdown' && typeof cd === 'number' ? cd : null);
          setLoadError(p === 'error' ? (typeof cd === 'string' ? cd : 'Failed to load this mode.') : null);
        },
        onHud: (u) => { if (!disposed) setHud((prev) => mergeHud(prev, u)); },
        resultSink,
      })
        .then((s) => {
          if (disposed) { if (canvasOwner.get(canvas) === token) s(); return; }
          stop = s;
        })
        .catch((e) => surfaceBootError(e, { disposed, label: '[FEL-DUEL] boot failed', setPhase, setLoadError }));
    }, 0);

    return () => {
      disposed = true;
      clearTimeout(startTimer);
      if (canvasOwner.get(canvas) === token) stop?.();
      busRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- G7: the stage is owned by the mount; callbacks are read through refs.
  }, []);

  const emit = useCallback((e: Parameters<InputBus['emit']>[0]) => {
    busRef.current?.emit(e);
  }, []);

  const tapStart = useCallback(() => {
    emit({ t: 'button', btn: 'START', pressed: true });
  }, [emit]);

  // WAVE 3: a KO replay (hud.replay) is the shot — the stat band steps aside and the REPLAY tag says how to skip it
  const replaying = Number(hud.replay) === 1;
  const showHud = phase === 'playing' && !replaying;

  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-white/10 bg-black">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

      {/* TV HUD (A9.13, lane/tv-hud): the fight readouts on the shared system — same keys, same corners and slots. */}
      <HudFrame>
      {showHud && (
        <div className="absolute inset-x-0 top-0 flex justify-between px-4 py-3">
          <div className="flex flex-col items-start gap-1">
            <CombatStat label="HP" value={hnum(hud.hp, 100)} tone="you" />
            <CombatStat label="GUARD" value={hnum(hud.guard, 100)} tone="them" />
          </div>
          <CombatRound round={hnode(hud.round, 1)} wins={hnode(hud.wins, 0)} foeWins={hnode(hud.foeWins, 0)}>
            {/* IMPROVE (2026-10-06): the round clock — a round that runs out is decided on HP at the bell (TIME); it was invisible */}
            {typeof hud.timeLeft === 'number' && <CombatClock seconds={hud.timeLeft} redAt={10} />}
            {typeof hud.hint === 'string' && hud.hint && <HudText size="label" alpha={0.75} className="mt-1">{hud.hint}</HudText>}
          </CombatRound>
          <div className="flex flex-col items-end gap-1">
            <CombatStat label="FOE HP" value={hnum(hud.foeHp, 100)} tone="danger" />
            <CombatStat label="FOE GUARD" value={hnum(hud.foeGuard, 100)} tone="them" />
            {/* IMPROVE (2026-10-06): the rival's chi fills now — a dash, a substitution, at 100 its CRITICAL EDGE */}
            <CombatStat label="FOE CHI" value={hnum(hud.foeChi, 0)} tone="power" />
          </div>
        </div>
      )}

      {/* IMPROVE (2026-10-06): the edge call has its own field — it used to overwrite the controls hint and never clear */}
      {typeof hud.edge === 'string' && hud.edge && phase === 'playing' && (
        <div className="absolute inset-x-0 top-[22%] text-center">
          <CombatEdgeCall tone={hud.edge === 'EDGE BEHIND YOU' ? 'danger' : 'good'}>
            {hud.edge === 'EDGE BEHIND YOU' ? '⚠ EDGE BEHIND YOU ⚠' : 'RIVAL ON THE EDGE — PRESS!'}
          </CombatEdgeCall>
        </div>
      )}

      {showHud && <HudBanner text={typeof hud.banner === 'string' ? hud.banner : ''} tone="you" size="hero" plate={false} />}
      <ReplayBug on={replaying} />
      </HudFrame>

      <BootSplash
        modeId="duel"
        title="DUEL"
        phase={phase}
        detail={phase === 'error' ? (loadError ?? undefined) : (countdown ?? undefined)}
        onStart={tapStart}
        onRetry={tapStart}
      />

      {(phase === 'playing' || phase === 'countdown') && busRef.current && (
        <TouchOverlay bus={busRef.current} modeId="duel" visible />
      )}
    </div>
  );
}
