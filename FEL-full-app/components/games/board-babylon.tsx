'use client';

// FEL Babylon board-sports host (M22–M27 rollout wave 2). ONE thin host powers
// skateboard, snowboard slalom, and surf — exactly mirroring the single shared
// BoardRunMode core (never forked). makeBoardHost(modeKey) returns a
// GameShell-compatible component so each route stays a 1-line skin. All gameplay
// lives in lib/babylon/* — nothing is duplicated here.

import { useEffect, useRef, useState, useCallback } from 'react';
import type { GameProps, GameResult } from './game-shell';
import { BootSplash } from './boot-splash';
import { runMode, InputBus, type ModePhase, type SessionResult, type HudValue } from '@/lib/babylon';
import { MODES } from '@/lib/babylon/modes/registry';
import { TouchOverlay } from '@/lib/babylon/ui/TouchOverlay';
import { hnode } from './hud-format';
import { getActiveSkin } from '@/lib/modes/art/active-skin';
import { applyArtCardToSurface } from '@/lib/modes/art/apply-art-card';

type Hud = Record<string, HudValue>;

export interface BoardHostOpts {
  /** Registry key: 'skateboard' | 'snowboard_slalom' | 'surf'. */
  modeKey: string;
  /** One-line control hint shown on the TAP TO START overlay. */
  hint: string;
  /** Trick button labels for B / X / Y (air-only). */
  tricks: [string, string, string];
  /** Log tag for boot errors. */
  tag: string;
}

/** A labelled 0..max bar. Board sports live on their meters. */
function Meter({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="font-mono text-[10px] tracking-wider" style={{ color }}>{label}</span>
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/15">
        <div className="h-full transition-[width] duration-200" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

/** Build a GameShell-compatible board host bound to a specific registry mode. */
export function makeBoardHost(opts: BoardHostOpts) {
  const { modeKey, tag } = opts;

  function BoardBabylon({ onEnd }: GameProps) {
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
        const coins = Number(r.stats?.coinsCollected ?? 0);
        const combo = Number(r.stats?.combo ?? 1);
        const result: GameResult = {
          score: r.score,
          opponentScore: 0,
          won: false, // score run — the clock always runs out, no win/lose gate
          duration: r.durationSec,
          headline: `${coins} COINS · x${combo} CHAIN`,
          maxCombo: Math.round(combo),
        };
        onEnd(result);
      };

      const def = MODES[modeKey];
      // StrictMode runs effect -> cleanup -> effect. Starting immediately lets the
      // PHANTOM mount build a Babylon engine its own cleanup cannot cancel —
      // `stop` is not assigned until the async load resolves — so two engines end
      // up on one canvas fighting over a single WebGL context and the loser draws
      // nothing. 3v3 rendered an empty void this way and the Dunk guest path
      // rendered black. This host is SHARED by skateboard, surf and snowboard, so
      // all three carried it.
      const startTimer = setTimeout(() => {
        if (disposed) return;
        runMode(def, {
        canvas,
        input: bus,
        // M28 art round-trip: paint the venue with the player's saved art card.
        applySkin: (scene) => {
          for (const surface of ['court', 'board', 'kit'] as const) {
            const dataUrl = getActiveSkin(surface);
            if (dataUrl) {
              const mesh = applyArtCardToSurface(scene, dataUrl, surface);
              if (mesh) console.info(`[FEL-ART] applied ${surface} skin -> mesh "${mesh}"`);
            }
          }
        },
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
          .catch((e) => console.error(`[${tag}] boot failed`, e));
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

    return (
      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-white/10 bg-black">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

        {/* HUD bezel.
            This rendered exactly four things -- time, coins, score, banner --
            while the three modes publish combo, pot, momentum, goals, flow,
            gates and boost between them. Every one of those was computed each
            frame, pushed through setHud, and thrown away here. That is not a
            cosmetic gap against the benchmarks: the live combo string and the
            POT AT RISK *are* the Skate/THPS HUD (the whole tension is watching
            a number you have not banked yet), a slalom whose gate count is
            invisible is not a slalom, and SSX's boost meter without a meter is
            just a hidden variable. It also hard-rendered a coins counter for
            all three, but only skate has a CoinField, so surf and snowboard
            carried a permanent 0.

            Driven by what the mode actually publishes rather than by modeKey,
            so a mode gets its readout by setting a HUD key and nothing here
            needs to know which sport it is. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 px-4 py-3 font-mono text-xs">
          <div className="flex items-center gap-2">
            <span className="fel-panel px-3 py-1 text-[var(--fel-cyan)]">{Math.max(0, Number(hud.time ?? 0))}s</span>
            {hud.coins != null && (
              <span className="fel-panel px-3 py-1 text-[var(--fel-gold)]">◈ {hnode(hud.coins, 0)}</span>
            )}
            {hud.gates != null && (
              <span className="fel-panel px-3 py-1 text-white/80">GATES {hnode(hud.gates)}</span>
            )}
            {hud.goals != null && (
              <span className="fel-panel px-3 py-1 text-white/80">GOALS {hnode(hud.goals)}</span>
            )}
          </div>
          <span className="rounded-md bg-black/50 px-3 py-1 text-lg font-bold text-white">{hnode(hud.score, 0)}</span>
        </div>

        {/* THE COMBO TICKER — the pot you stand to lose. Only while one is open. */}
        {typeof hud.combo === 'string' && hud.combo && (
          <div className="pointer-events-none absolute inset-x-0 top-14 flex flex-col items-center">
            <span className="fel-heading text-3xl font-black text-[var(--fel-gold)] drop-shadow">
              {hnode(hud.pot, 0)}
            </span>
            <span className="font-mono text-sm font-bold text-[var(--fel-gold)]">{hnode(hud.combo)}</span>
          </div>
        )}

        {/* Meters. Each appears only if its mode publishes it. */}
        <div className="pointer-events-none absolute right-4 top-24 flex flex-col items-end gap-1.5">
          {hud.flow != null && <Meter label="FLOW" value={Number(hud.flow)} max={200} color="var(--fel-cyan)" />}
          {hud.boost != null && <Meter label="BOOST" value={Number(hud.boost)} max={100} color="var(--fel-gold)" />}
          {hud.momentum != null && <Meter label="MOMENTUM" value={Number(hud.momentum)} max={100} color="var(--fel-red)" />}
        </div>

        {typeof hud.banner === 'string' && hud.banner && (
          <div className="pointer-events-none absolute inset-x-0 top-1/3 text-center">
            <span className="fel-heading fel-panel px-4 py-2 text-2xl font-bold text-[var(--fel-emerald)]">{hud.banner}</span>
          </div>
        )}

        <BootSplash
          modeId={modeKey}
          title={modeKey.replace(/_/g, ' ').toUpperCase()}
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
          <TouchOverlay bus={busRef.current} modeId={modeKey} visible />
        )}
      </div>
    );
  }

  BoardBabylon.displayName = `BoardBabylon(${modeKey})`;
  return BoardBabylon;
}
