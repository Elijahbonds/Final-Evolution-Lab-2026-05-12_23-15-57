'use client';

// FEL Babylon Karate stage (M22–M27 rollout wave 1). THIN host: owns the
// <canvas>, boots the shared Babylon harness with the KarateEndlessMode
// ModeDefinition, and bridges phase/HUD/result back into the existing GameShell
// pipeline. All gameplay lives in lib/babylon/* cores — nothing is duplicated.

import { useEffect, useRef, useState, useCallback } from 'react';
import type { GameProps, GameResult } from './game-shell';
import { BootSplash } from './boot-splash';
import { runMode, InputBus, type ModePhase, type SessionResult, type HudValue } from '@/lib/babylon';
import { MODES } from '@/lib/babylon/modes/registry';
import { TouchOverlay } from '@/lib/babylon/ui/TouchOverlay';
import { hnode } from './hud-format';

type Hud = Record<string, HudValue>;

export default function KarateBabylon({ onEnd }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const busRef = useRef<InputBus | null>(null);
  const endedRef = useRef(false);
  const [phase, setPhase] = useState<ModePhase>('loading');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hud, setHud] = useState<Hud>({});

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
      const result: GameResult = {
        score: r.score,
        opponentScore: 0,
        won: false, // endless survival — the run always ends on defeat
        duration: r.durationSec,
        headline: `WAVE ${wave} REACHED · ${kos} KO`,
      };
      onEnd(result);
    };
    // StrictMode runs effect -> cleanup -> effect. Starting immediately lets the
    // PHANTOM mount build a Babylon engine its own cleanup cannot cancel, and two
    // engines fight over one WebGL context — 3v3 rendered an empty void this way.
    const startTimer = setTimeout(() => {
      if (disposed) return;
      runMode(MODES.karate, {
      canvas,
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
        .catch((e) => console.error('[FEL-KARATE] boot failed', e));
    }, 0);

    return () => {
      disposed = true;
      clearTimeout(startTimer);
      stop?.();
      busRef.current = null;
    };
  }, [onEnd]);

  const emit = useCallback((e: Parameters<InputBus['emit']>[0]) => {
    busRef.current?.emit(e);
  }, []);

  const tapStart = useCallback(() => {
    emit({ t: 'button', btn: 'START', pressed: true });
  }, [emit]);

  const hp = Number(hud.hp ?? 100);
  const chi = Number(hud.chi ?? 0);

  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-white/10 bg-black">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

      {/* HUD bezel */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 px-4 py-3">
        <div className="min-w-[7rem] space-y-1">
          <div className="h-2 w-full overflow-hidden rounded-full bg-black/50">
            <div className="h-full rounded-full bg-[#FF3366] transition-all" style={{ width: `${Math.max(0, Math.min(100, hp))}%` }} />
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/50">
            <div className="h-full rounded-full bg-[#00E5FF] transition-all" style={{ width: `${Math.max(0, Math.min(100, chi))}%` }} />
          </div>
        </div>
        <span className="fel-panel px-3 py-1 font-mono text-xs text-[var(--fel-gold)]">
          WAVE {hnode(hud.wave, 1)} · {hnode(hud.kos, 0)} KO
          {hud.coins != null && <> · <span className="text-white">{hnode(hud.coins, 0)}c</span></>}
        </span>
      </div>

      {/* ALLY. The mode publishes partnerHp every frame and this bezel rendered
          hp, chi, wave, kos and banner only — so in a down-and-revive co-op mode
          you could not see your partner failing. */}
      {hud.partnerHp != null && (
        <div className="pointer-events-none absolute left-4 top-14 min-w-[5rem]">
          <span className="font-mono text-[10px] text-white/60">ALLY</span>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/50">
            <div
              className="h-full rounded-full bg-[#7CFFB2] transition-all"
              style={{ width: `${Math.max(0, Math.min(100, Number(hud.partnerHp)))}%` }}
            />
          </div>
        </div>
      )}

      {/* REVIVE prompt — also published and never shown. */}
      {typeof hud.revive === 'string' && hud.revive && (
        <div className="pointer-events-none absolute inset-x-0 bottom-24 text-center">
          <span className="fel-panel px-4 py-2 font-mono text-sm font-bold text-[#7CFFB2]">{hud.revive}</span>
        </div>
      )}

      {/* THE PERK SHOP. This is the Zombies half of the benchmark and it was
          unusable: the mode publishes `coins` and a formatted `perks` list, the
          shop opened with the banner "PERKS — d-pad to browse, A to buy, B to
          fight", and the screen showed neither the perks nor the money. A points
          economy whose points are invisible is not an economy. */}
      {typeof hud.perks === 'string' && hud.perks && (
        <div className="pointer-events-none absolute inset-x-0 bottom-10 flex flex-col items-center gap-1 px-4">
          <div className="flex flex-wrap justify-center gap-1.5">
            {hud.perks.split(' · ').map((p) => (
              <span key={p} className="fel-panel px-2.5 py-1 font-mono text-[11px] text-white/85">{p}</span>
            ))}
          </div>
          <span className="font-mono text-[11px] text-[var(--fel-gold)]">
            BALANCE {hnode(hud.coins, 0)}c
          </span>
        </div>
      )}

      {typeof hud.banner === 'string' && hud.banner && (
        <div className="pointer-events-none absolute inset-x-0 top-1/3 text-center">
          <span className="fel-heading fel-panel px-4 py-2 text-2xl font-bold text-[var(--fel-emerald)]">{hud.banner}</span>
        </div>
      )}

      <BootSplash
        modeId="karate"
        title="KARATE"
        phase={phase}
        detail={phase === 'error' ? (loadError ?? undefined) : (countdown ?? undefined)}
        onStart={tapStart}
        onRetry={tapStart}
      />

      {phase === 'paused' && (
        <button onClick={tapStart} className="absolute inset-0 flex items-center justify-center bg-black/60">
          <span className="fel-heading text-3xl font-bold text-white">PAUSED — TAP TO RESUME</span>
        </button>
      )}

      {/* M35: THE single touch control surface — one overlay per mode, ever. */}
      {(phase === 'playing' || phase === 'countdown') && busRef.current && (
        <TouchOverlay bus={busRef.current} modeId="karate" visible />
      )}
    </div>
  );
}
