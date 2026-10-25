'use client';

// FEL Babylon Karate stage (M22–M27 rollout wave 1). THIN host: owns the
// <canvas>, boots the shared Babylon harness with the KarateEndlessMode
// ModeDefinition, and bridges phase/HUD/result back into the existing GameShell
// pipeline. All gameplay lives in lib/babylon/* cores — nothing is duplicated.

import { useEffect, useRef, useState, useCallback } from 'react';
import type { GameProps, GameResult } from './game-shell';
import { useBabylonPlaytestBridge } from './use-babylon-playtest-bridge';
import { BootSplash } from './boot-splash';
import { surfaceBootError } from './boot-error';
import { useBabylonBootRetry } from './use-babylon-boot-retry';
import { runMode, InputBus, type ModePhase, type SessionResult, type HudValue } from '@/lib/babylon';
import { MODES } from '@/lib/babylon/modes/lazyRegistry';   // PERF-LOAD PRF-05: this host's mode alone, imported at mount
import { mergeHud } from '@/lib/babylon/core/hudMerge';   // IMPROVE (2026-10-06): an unchanged HUD patch is not a render
import { clockText } from '@/lib/babylon/core/HundredPacing';   // IMPROVE (2026-10-06, #17): the run's clock to the 180 s cap
import { TouchOverlay } from '@/lib/babylon/ui/TouchOverlay';
import { hnode } from './hud-format';
import { HudBanner, HudChip, HudFrame, HudLine, HudMeter, HudText, ScoreValue, hudColor } from './tv-hud';
import { CombatEdgeCall } from './combat-hud-band';
import { gameResultFromSession } from '@/lib/sessions/gameResultFromSession';

type Hud = Record<string, HudValue>;

export default function KarateBabylon({ onEnd }: GameProps) {
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
  useBabylonPlaytestBridge('karate', () => ({ phase, countdown, loadError, hud }), busRef.current);

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
      const kos = Number(r.stats?.kos ?? 0);
      const wave = Number(r.stats?.wave ?? 0);
      const capped = r.outcome === 'WAVE_CAP';
      onEndRef.current(gameResultFromSession(r, {
        won: false,
        headline: capped ? `TIME! · WAVE ${wave} · ${kos} KO` : `WAVE ${wave} REACHED · ${kos} KO`,
      }));
    };
    // StrictMode runs effect -> cleanup -> effect. Starting immediately lets the
    // PHANTOM mount build a Babylon engine its own cleanup cannot cancel, and two
    // engines fight over one WebGL context — 3v3 rendered an empty void this way.
    // THE ATHLETE'S BAND, resolved before the mode starts (2026-09-14).
    //
    // /api/profile already returns { prq, grade }; nothing in the game read it. The fetch is fire-and-forget
    // and the mode starts either way: a guest, an offline load or a failed request all resolve to no band,
    // and core/PrqVitals treats that as READY rather than as a penalty. Nobody waits on a network call to
    // start a fight, and nobody is handed a worse fighter for not having done a body scan.
    let band: 'RECOVERING' | 'READY' | 'PRIMED' | 'ELITE' | null = null;
    const bandReady = fetch('/api/profile')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { const k = j?.grade?.key; if (k === 'RECOVERING' || k === 'READY' || k === 'PRIMED' || k === 'ELITE') band = k; })
      .catch(() => { /* guest, offline, or signed out — READY it is */ });

    const startTimer = setTimeout(() => {
      if (disposed) return;
      void bandReady.finally(() => {
      if (disposed) return;
      runMode(MODES.karate, {
      canvas,
      prqBand: band,
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
        .catch((e) => surfaceBootError(e, { disposed, label: '[FEL-KARATE] boot failed', setPhase, setLoadError }));
      });
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

  // A+ identity P0: the endless mode publishes NO hp — one clean contact puts you down — so the bar draws only when a
  // mode does publish one (the 1v1 modes still do).
  const hp = hud.hp == null ? null : Number(hud.hp);
  const chi = Number(hud.chi ?? 0);
  const focus = hud.focus == null ? null : Number(hud.focus);   // MATRIX FOCUS: the bullet-time meter (the horde publishes it)
  const focusOn = !!hud.focusOn;

  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-white/10 bg-black">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

      {/* TV HUD (A9.13, lane/tv-hud): every readout on the shared system — same keys, same gates, same slots. */}
      <HudFrame>
      {/* HUD bezel */}
      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 px-4 py-3">
        <div className="min-w-[7rem] space-y-1">
          {hp !== null && <HudMeter value={hp} max={100} tone="danger" height="bar" width="100%" />}
          <HudMeter value={chi} max={100} tone="you" height="thin" width="100%" />
          {focus !== null && (
            <HudMeter value={focus} max={100} tone="good" fillAlpha={focusOn ? 1 : 0.6} glow={focusOn} height="thin" width="100%" title="FOCUS — hold R2" />
          )}
        </div>
        <HudChip tone="score" size="label">
          WAVE {hnode(hud.wave, 1)} · {hnode(hud.kos, 0)} KO
          {hud.coins != null && <> · <span style={{ color: hudColor('text') }}>{hnode(hud.coins, 0)}c</span></>}
          {/* IMPROVE (2026-10-06, #17): the time left on the run's 180 s cap — red in the last 30 s, which the mode also calls */}
          {hud.timeLeft != null && <> · <span style={{ color: hudColor(Number(hud.timeLeft) <= 30 ? 'danger' : 'text'), fontVariantNumeric: 'tabular-nums' }} data-testid="hundred-clock">{clockText(Number(hud.timeLeft))}</span></>}
        </HudChip>
      </div>

      {/* FREEFLOW (THE HUNDRED, 2026-09-15): the flow count, its multiplier, the drop clock draining under it, the meter a
          takedown spends, and the call when one is ready. A number that breaks on a miss has to be seen to be played. */}
      {Number(hud.hits) > 1 && (
        <div className="absolute right-4 top-14 flex flex-col items-end gap-1" data-testid="freeflow">
          <div className="flex items-baseline gap-2">
            <ScoreValue value={hnode(hud.hits, 0)} size="hero" tone="you" />
            <HudText size="label" alpha={0.8} style={{ fontWeight: 800, letterSpacing: '0.15em' }}>FLOW</HudText>
            {Number(hud.flowMult) > 1 && <HudChip plate={false} fill={1} tone="score" className="rounded"><HudText size="label" tone="ink" style={{ fontWeight: 800, textShadow: 'none' }}>×{String(hud.flowMult)}</HudText></HudChip>}
          </div>
          <HudMeter value={Number(hud.flowDrop ?? 100)} max={100} tone="text" fillAlpha={0.8} height="thin" width="7rem" round={false} />
          <HudMeter value={Number(hud.flowMeter ?? 0)} max={100} tone="power" height="thin" width="7rem" round={false} />
          {hud.flowReady === true && <CombatEdgeCall tone="power" size="label">TAKEDOWN · L1</CombatEdgeCall>}
        </div>
      )}

      {/* ALLY. The mode publishes partnerHp every frame and this bezel rendered
          hp, chi, wave, kos and banner only — so in a down-and-revive co-op mode
          you could not see your partner failing. */}
      {hud.partnerHp != null && (
        <div className="absolute left-4 top-14 min-w-[5rem]">
          <HudMeter label="ALLY" labelAlpha={0.6} value={Number(hud.partnerHp)} max={100} tone="good" height="thin" width="100%" />
        </div>
      )}

      {/* REVIVE prompt — also published and never shown. */}
      <HudLine text={typeof hud.revive === 'string' ? hud.revive : ''} className="bottom-24" size="value" tone="good" alpha={1} strong />

      {/* THE PERK SHOP. This is the Zombies half of the benchmark and it was
          unusable: the mode publishes `coins` and a formatted `perks` list, the
          shop opened with the banner "PERKS — d-pad to browse, A to buy, B to
          fight", and the screen showed neither the perks nor the money. A points
          economy whose points are invisible is not an economy. */}
      {typeof hud.perks === 'string' && hud.perks && (
        <div className="absolute inset-x-0 bottom-10 flex flex-col items-center gap-1 px-4">
          <div className="flex flex-wrap justify-center gap-1.5">
            {hud.perks.split(' · ').map((p) => (
              <HudChip key={p} alpha={0.85}>{p}</HudChip>
            ))}
          </div>
          <HudText size="label" tone="score">
            BALANCE {hnode(hud.coins, 0)}c
          </HudText>
        </div>
      )}

      <HudBanner text={typeof hud.banner === 'string' ? hud.banner : ''} tone="good" />
      </HudFrame>

      <BootSplash
        modeId="karate"
        title="THE HUNDRED"
        phase={phase}
        detail={phase === 'error' ? (loadError ?? undefined) : (countdown ?? undefined)}
        onStart={tapStart}
        onRetry={retryBoot}
      />

      {/* M35: THE single touch control surface — one overlay per mode, ever. */}
      {(phase === 'playing' || phase === 'countdown') && busRef.current && (
        <TouchOverlay bus={busRef.current} modeId="karate" visible />
      )}
    </div>
  );
}
