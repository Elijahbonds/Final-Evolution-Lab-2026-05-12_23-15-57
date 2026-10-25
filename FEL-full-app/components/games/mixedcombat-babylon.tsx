'use client';

// FEL Babylon Mixed Combat host (M53 Phase 3). Ring-out octagon duel
// with FISTS/STAFF loadouts on FightCore.

import { useEffect, useRef, useState, useCallback } from 'react';
import type { GameProps, GameResult } from './game-shell';
import { useBabylonPlaytestBridge } from './use-babylon-playtest-bridge';
import { BootSplash } from './boot-splash';
import { surfaceBootError } from './boot-error';
import { useBabylonBootRetry } from './use-babylon-boot-retry';
import { runMode, InputBus, type ModePhase, type SessionResult, type HudValue } from '@/lib/babylon';
import { MODES } from '@/lib/babylon/modes/lazyRegistry';   // PERF-LOAD PRF-05: this host's mode alone, imported at mount
import { mergeHud } from '@/lib/babylon/core/hudMerge';   // IMPROVE (2026-10-06): an unchanged HUD patch is not a render
import { TouchOverlay } from '@/lib/babylon/ui/TouchOverlay';
import { hnode, hnum } from './hud-format';
import { HudFrame, HudLine, HudText } from './tv-hud';
import { CombatEdgeCall, CombatHudBand, CombatRound, CombatStat } from './combat-hud-band';   // QA P1-09: the banner line sits below the HUD, above the juice overlay
import { ReplayBug } from './fight-presentation';   // WAVE 3 (lane/w3-present)

type Hud = Record<string, HudValue>;

// Which mount currently owns a given canvas. StrictMode double-mounts this
// host: effect A starts an async runMode(), its cleanup fires before A has
// finished loading, then effect B starts on the SAME canvas — and A's late
// teardown disposed the engine holding B's WebGL context. Measured on the
// /play route: black frame, RenderWatchdog rescue fails on a dead context.
// Same guard as carnival-babylon / air-session-babylon.
const canvasOwner = new WeakMap<HTMLCanvasElement, object>();

export default function MixedCombatBabylon({ onEnd }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const busRef = useRef<InputBus | null>(null);
  const endedRef = useRef(false);
  const [phase, setPhase] = useState<ModePhase>('loading');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hud, setHud] = useState<Hud>({});
  const { bootAttempt, retryBoot } = useBabylonBootRetry({ busRef, endedRef, setPhase, setCountdown, setLoadError, reset: () => setHud({}) });
  useBabylonPlaytestBridge('mixedcombat', () => ({ phase, countdown, loadError, hud }), busRef.current);
  // A parent passing an inline arrow gives a new onEnd every render — the
  // effect must NOT depend on its identity (see air-session-babylon).
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
      // The mode ends 'MATCH_WON'/'MATCH_LOST' — the old 'WIN' check here
      // made every recap read DEFEATED, and stats.wins never existed, so the
      // score was always 0 (the mode's score rides r.score).
      const won = r.outcome === 'MATCH_WON';
      const result: GameResult = {
        score: Math.max(0, Math.round(r.score ?? 0)),
        stats: r.stats, outcome: r.outcome,   // pass 5 phase 3: the proof line reads these
        opponentScore: Number(r.stats?.foeWins ?? 0),
        won,
        duration: r.durationSec,
        headline: won ? 'CHAMPION' : 'DEFEATED',
      };
      onEndRef.current(result);
    };

    const startTimer = setTimeout(() => {
      if (disposed) return;
      runMode(MODES.mixedcombat, {
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
          // A newer mount owns the canvas: do NOT run our teardown — it would
          // dispose the engine holding the shared WebGL context.
          if (disposed) { if (canvasOwner.get(canvas) === token) s(); return; }
          stop = s;
        })
        .catch((e) => surfaceBootError(e, { disposed, label: '[FEL-COMBAT] boot failed', setPhase, setLoadError }));
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

  // WAVE 3: a KO replay (hud.replay) is the shot — the stat band steps aside and the REPLAY tag says how to skip it
  const replaying = Number(hud.replay) === 1;
  const showHud = phase === 'playing' && !replaying;
  // Edge danger — the ring-out is the signature, so the warning must be on the bezel, pulsing, the moment a back nears
  // the rim. In the HUD band's banner line (QA P1-09): at top-22% it sat on the stacked HP / GUARD chips of a short stage.
  const edgeAlert = typeof hud.edge === 'string' && hud.edge ? (
    <CombatEdgeCall tone={hud.edge === 'EDGE BEHIND YOU' ? 'danger' : 'good'}>
      {hud.edge === 'EDGE BEHIND YOU' ? '⚠ EDGE BEHIND YOU ⚠' : 'RIVAL ON THE EDGE — PRESS!'}
    </CombatEdgeCall>
  ) : null;

  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-white/10 bg-black">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

      {/* TV HUD (A9.13, lane/tv-hud): the fight readouts on the shared system — same keys, same band, same corners. */}
      <HudFrame>
      {showHud && (
        <CombatHudBand banner={typeof hud.banner === 'string' ? hud.banner : ''} alert={edgeAlert}>
        <div className="flex justify-between px-4 py-3">
          <div className="flex flex-col items-start gap-1">
            <CombatStat label="HP" value={hnum(hud.hp, 100)} tone="you" />
            <CombatStat label="GUARD" value={hnum(hud.guard, 100)} tone="them" />
            {/* IMPROVE (2026-10-06): a full bar is the DRAGON in this mode (mixedRules.dragonLicensed) — the line says so */}
            <CombatStat label="CHI" value={`${hnum(hud.chi, 0)}${hud.dragonReady ? ' · DRAGON' : ''}`} tone={hud.dragonReady ? 'score' : 'power'} glow={Boolean(hud.dragonReady)} />
            {hud.focus != null && <CombatStat label="FOCUS" value={hnum(hud.focus, 0)} tone="good" glow={Boolean(hud.focusOn)} title="FOCUS — hold R2" />}
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



      {/* The mode's own instructions (loadout pick, fight grammar). The mode
          published these every phase and no bezel ever drew them — trap:
          "published is not rendered". */}
      {(phase === 'playing' || phase === 'countdown') && (
        <HudLine text={typeof hud.hint === 'string' ? hud.hint : ''} className="bottom-[13%]" size="label" alpha={0.8} maxWidthClass="max-w-lg" />
      )}
      <ReplayBug on={replaying} />
      </HudFrame>

      <BootSplash
        modeId="mixedcombat"
        title="RING'S EDGE"
        phase={phase}
        detail={phase === 'error' ? (loadError ?? undefined) : (countdown ?? undefined)}
        onStart={tapStart}
        onRetry={retryBoot}
      />

      {(phase === 'playing' || phase === 'countdown') && busRef.current && (
        <TouchOverlay bus={busRef.current} modeId="mixedcombat" visible />
      )}
    </div>
  );
}
