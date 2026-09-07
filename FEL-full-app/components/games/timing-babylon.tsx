'use client';

// FEL Babylon timing-sports host (M22–M27 rollout wave 3). ONE thin host powers
// tennis, home-run derby, penalty shootout, and golf — exactly mirroring the
// single shared makeTimingSportMode core (never forked). makeTimingHost(modeKey)
// returns a GameShell-compatible component so each route stays a 1-line skin.
// All gameplay lives in lib/babylon/* — nothing is duplicated here.

import { useEffect, useRef, useState, useCallback } from 'react';
import type { GameProps, GameResult } from './game-shell';
import { BootSplash } from './boot-splash';
import { runMode, InputBus, type ModePhase, type SessionResult, type HudValue } from '@/lib/babylon';
import { MODES } from '@/lib/babylon/modes/registry';
import { TouchOverlay } from '@/lib/babylon/ui/TouchOverlay';
import { hnode } from './hud-format';
import { CUE_LOOKAHEAD_SEC, CUE_LINGER_SEC, type HudCue } from '@/lib/babylon/core/danceTracks';

/** The rhythm lane: an array of cue markers (dance publishes it every frame). */
const isCueLane = (v: unknown): v is HudCue[] =>
  Array.isArray(v) && v.every((c) => !!c && typeof c === 'object' && 'glyph' in (c as object));
/** Where the hit ring sits on the lane (% from the left) and how much lane the lookahead spans. */
const LANE_HIT_PCT = 24;
const LANE_SPAN_PCT = 66;

type Hud = Record<string, HudValue>;

export interface TimingHostOpts {
  /** Registry key: 'tennis' | 'derby' | 'penalty' | 'golf'. */
  modeKey: string;
  /** One-line control hint shown on the TAP TO START overlay. */
  hint: string;
  /** Label on the big swing button (e.g. SWING / STRIKE / KICK). */
  swingLabel: string;
  /** Log tag for boot errors. */
  tag: string;
}

/** Build a GameShell-compatible timing host bound to a specific registry mode. */
export function makeTimingHost(opts: TimingHostOpts) {
  const { modeKey, tag } = opts;

  function TimingBabylon({ onEnd }: GameProps) {
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
        const hits = Number(r.stats?.hits ?? 0);
        const rounds = Number(r.stats?.rounds ?? 0);
        const result: GameResult = {
          score: r.score,
          stats: r.stats, outcome: r.outcome,   // pass 5 phase 3: the proof line reads these
          opponentScore: 0,
          won: r.outcome === 'GREAT', // GREAT = hit ≥60% of rounds cleanly
          duration: r.durationSec,
          headline: rounds ? `${hits}/${rounds} CLEAN · ${r.score} PTS` : `${r.score} PTS`,
          maxCombo: hits,
        };
        onEnd(result);
      };

      const def = MODES[modeKey];
      // DEFER THE START. React StrictMode runs effect -> cleanup -> effect, and
      // calling runMode synchronously means the PHANTOM mount also builds a
      // Babylon engine that its own cleanup cannot cancel: `stop` is not
      // assigned until the async load resolves. Two engines then sit on the SAME
      // canvas sharing one WebGL context and fight, and the watchdog reports
      // "still black after rescue" — which is exactly what /play/volleyball,
      // /play/tennis and /play/golf all did on a phone viewport. Every other
      // host in this project already defers by a tick; this one never got the
      // fix, so it took all five timing modes down with it.
      const startTimer = setTimeout(() => {
        if (disposed) return;
        runMode(def, {
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

        {/* HUD bezel */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 px-4 py-3 font-mono text-xs">
          {/* M42 E20: render the mode's own round label as-is (RD/SHOT/KICK/PITCH) — no dup prefix */}
          <span className="fel-panel px-3 py-1 text-[var(--fel-cyan)]">{hnode(hud.round, '—')}</span>
          {/* M42 E20: numeric score gets " PTS"; string scores (e.g. "2 GOALS") render as-is */}
          <span className="rounded-md bg-black/50 px-3 py-1 text-white">{typeof hud.score === 'number' ? `${hud.score} PTS` : hnode(hud.score, '0 PTS')}</span>
          {/* combo — the rhythm family's core readout (The Cypher publishes it
              every judgement; the bezel never drew it) */}
          {typeof hud.combo === 'number' && hud.combo >= 2 && (
            <span className="fel-panel px-3 py-1 font-bold text-[var(--fel-gold)]">×{hud.combo}</span>
          )}
          {/* the beat, visible: pops at each step, fades through the bar */}
          {typeof hud.beatPulse === 'number' && (
            <span
              className="mt-1.5 inline-block h-3 w-3 rounded-full bg-[var(--fel-gold)]"
              style={{ opacity: 0.25 + hud.beatPulse * 0.75, transform: `scale(${0.7 + hud.beatPulse * 0.45})` }}
            />
          )}
        </div>

        {/* THE ENERGY LAYER. A gauge you cannot see is not a gauge, and rackets
            you cannot count are not a threat — this is the second time in this
            family that a mode published state the bezel dropped on the floor.
            Rendered only when the mode publishes it, so the modes without an
            energy economy are unchanged. */}
        {hud.energy != null && (
          <div className="pointer-events-none absolute left-4 top-14 flex flex-col gap-1">
            <span className="font-mono text-[10px] tracking-wider text-[var(--fel-gold)]">{typeof hud.energyLabel === 'string' ? hud.energyLabel : 'ENERGY'}</span>
            <div className="h-2 w-28 overflow-hidden rounded-full bg-black/50">
              <div
                className="h-full rounded-full transition-[width] duration-200"
                style={{
                  width: `${Math.max(0, Math.min(100, Number(hud.energy)))}%`,
                  background: Number(hud.energy) >= 100 ? 'var(--fel-gold)' : 'var(--fel-cyan)',
                }}
              />
            </div>
            {typeof hud.rackets === 'string' && (
              <span className="font-mono text-[10px] text-white/70">
                RACKETS {hud.rackets}
                {typeof hud.foeRackets === 'string' && (
                  <span className="text-white/40"> · THEM {hud.foeRackets}</span>
                )}
              </span>
            )}
          </div>
        )}

        {/* The shot the mode graded, and the incoming-attack warning. */}
        {typeof hud.shotType === 'string' && hud.shotType && (
          <div className="pointer-events-none absolute inset-x-0 bottom-24 text-center">
            <span className="fel-panel px-3 py-1 font-mono text-[11px] text-white/85">{hud.shotType}</span>
          </div>
        )}

        {/* THE CUE LANE (dance, A+ mission #1): the next moves slide toward the
            hit ring, coloured by move family (= the band's instrument), glyph
            + name readable from a couch. Rendered only when a mode publishes
            `cues`, so every other timing sport is unchanged. */}
        {isCueLane(hud.cues) && hud.cues.length > 0 && (
          <div className="pointer-events-none absolute inset-x-6 bottom-[34%] h-16">
            <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/15" />
            <div
              className="absolute top-1/2 h-14 w-14 rounded-full border-4 border-[var(--fel-gold)]/80"
              style={{ left: `${LANE_HIT_PCT}%`, transform: 'translate(-50%, -50%)' }}
            />
            {hud.cues.map((c, i) => {
              const t = Math.max(-CUE_LINGER_SEC, Math.min(CUE_LOOKAHEAD_SEC, c.in));
              const x = LANE_HIT_PCT + (t / CUE_LOOKAHEAD_SEC) * LANE_SPAN_PCT;
              const hot = c.in <= 0.35 && c.in >= -CUE_LINGER_SEC;
              return (
                <div
                  key={i}
                  className="absolute top-1/2 flex h-12 w-12 items-center justify-center rounded-full font-mono text-sm font-bold text-black"
                  style={{
                    left: `${x}%`,
                    background: c.color,
                    opacity: c.in < -0.05 ? 0.45 : 1,
                    transform: `translate(-50%, -50%) scale(${hot ? 1.18 : 1})`,
                    boxShadow: hot ? `0 0 18px ${c.color}` : '0 2px 6px rgba(0,0,0,0.5)',
                  }}
                >
                  {c.glyph}
                  <span className="absolute top-full mt-1.5 whitespace-nowrap rounded bg-black/65 px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wider text-white">
                    {c.mirrored ? '\u25c1 ' : ''}{c.name.toUpperCase()}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* the cue — rhythm modes publish the incoming move; it goes gold
            inside the last 0.35s so the tap is about reading, not guessing */}
        {typeof hud.nextStep === 'string' && hud.nextStep && (
          <div className="pointer-events-none absolute inset-x-0 bottom-24 text-center">
            <span
              className={`fel-panel px-4 py-1.5 font-mono text-sm font-bold transition-colors ${
                typeof hud.nextStepIn === 'number' && hud.nextStepIn <= 0.35
                  ? 'border-[var(--fel-gold)]/60 text-[var(--fel-gold)]'
                  : 'text-white/85'
              }`}
            >
              {typeof hud.nextStepIn === 'number' && hud.nextStepIn <= 0.35 ? 'NOW — ' : ''}
              {hud.nextStep}
              {typeof hud.nextStepIn === 'number' && hud.nextStepIn > 0.35 && (
                <span className="text-white/40"> · {hud.nextStepIn.toFixed(1)}</span>
              )}
            </span>
          </div>
        )}

        {/* The contact grade — PURE / OFF-CENTRE / EDGE OF THE BAT, plus the
            pitch that threw it. Derby publishes it on every swing and the
            bezel dropped it (same family trap as the energy gauge above,
            whose comment names this exact failure). This is the benchmark's
            named mechanic; it cannot be invisible. */}
        {typeof hud.contact === 'string' && hud.contact && (
          <div className="pointer-events-none absolute inset-x-0 bottom-36 text-center">
            <span className="fel-panel px-3 py-1 font-mono text-[11px] font-bold text-[var(--fel-gold)]">{hud.contact}</span>
          </div>
        )}

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

        {busRef.current && (
          <TouchOverlay bus={busRef.current} modeId={modeKey} visible={phase === 'playing' || phase === 'countdown'} />
        )}
      </div>
    );
  }

  TimingBabylon.displayName = `TimingBabylon(${modeKey})`;
  return TimingBabylon;
}


