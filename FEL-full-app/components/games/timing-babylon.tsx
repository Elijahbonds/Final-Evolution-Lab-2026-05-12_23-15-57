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
import { ACCURACY_CENTER as GOLF_ACC_CENTER, ACCURACY_HALF as GOLF_ACC_HALF } from '@/lib/babylon/core/golfHud';
/** GOLF UPGRADE: the meter's carry lines arrive as '0,6,12,…' (eleven tenths). */
const ticksOf = (v: unknown): number[] => (typeof v === 'string' && v ? v.split(',').map(Number) : []);

/** The rhythm lane: an array of cue markers (dance publishes it every frame). */
const isCueLane = (v: unknown): v is HudCue[] =>
  Array.isArray(v) && v.every((c) => !!c && typeof c === 'object' && 'glyph' in (c as object));
/** A between-rounds / between-holes scoreboard (HudScoreCard rows), rendered only when a mode publishes it. */
const isBoard = (v: unknown): v is { name: string; score: number | string; line: string }[] =>
  Array.isArray(v) && v.every((r) => !!r && typeof r === 'object' && 'line' in (r as object));
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

        {/* GOLF (A+ mission #5, Everybody's Golf read + Wii size) — every block is key-gated, so the other timing sports
            are unchanged: the lie panel (club · pin · wind with a bearing arrow), the hole chip, the drawn three-press
            swing meter (the band from the mode's own constants), and the scorecard between holes. */}
        {typeof hud.club === 'string' && hud.club && (
          <div className="pointer-events-none absolute right-4 top-14 flex flex-col items-end gap-1 font-mono">
            <div className="fel-panel px-3 py-1.5 text-right">
              <div className="text-lg font-black text-white">{hud.club}</div>
              <div className="text-[11px] text-white/70">PIN {hnode(hud.pin, '—')}{typeof hud.aimCarry === 'number' ? <span> · FULL SWING {hud.aimCarry}m</span> : null}</div>
            </div>
            {typeof hud.weather === 'string' && hud.weather && (
              <div className="fel-panel px-3 py-1 text-[11px] font-bold tracking-wider text-white/85">{hud.weather}</div>
            )}
            <div className="fel-panel flex items-center gap-2 px-3 py-1.5">
              <span
                className="inline-block text-xl leading-none text-[var(--fel-cyan)]"
                style={{ transform: `rotate(${typeof hud.windDeg === 'number' ? hud.windDeg : 0}deg)` }}
              >↑</span>
              <span className="text-[11px] text-white/85">WIND {hnode(hud.wind, '—')}{typeof hud.windWord === 'string' && hud.windWord ? ` · ${hud.windWord}` : ''}</span>
            </div>
          </div>
        )}
        {typeof hud.hole === 'number' && (
          <div className="pointer-events-none absolute inset-x-0 top-12 flex justify-center font-mono text-[12px] tracking-wider">
            <span className="fel-panel px-3 py-1 text-white/85">
              HOLE {hud.hole}{typeof hud.holes === 'number' ? ` / ${hud.holes}` : ''} · PAR {hnode(hud.par, '—')} · STROKE {hnode(hud.strokes, 0)} · <span className="font-bold text-[var(--fel-gold)]">{hnode(hud.card, 'E')}</span>
            </span>
          </div>
        )}
        {typeof hud.meterT === 'number' && (
          <div className="pointer-events-none absolute inset-x-0 bottom-28 flex flex-col items-center gap-1 font-mono">
            <span className={`fel-panel px-3 py-0.5 text-[11px] font-bold tracking-widest ${hud.swingPhase === 'accuracy' ? 'text-[var(--fel-gold)]' : 'text-[var(--fel-cyan)]'}`}>
              {hud.swingPhase === 'accuracy' ? 'ACCURACY — strike in the band' : 'POWER — press at the top'}
            </span>
            {/* GOLF UPGRADE (Wii Sports meter): LINES every tenth, taller at the quarters, with the CARRY each tenth buys
                written above them, and the carry at the marker under it — the player gauges "70 %" as "43 m". */}
            <div className="relative mt-4 h-7 w-[min(520px,70vw)] rounded-md border border-white/20 bg-black/55">
              <div className="absolute inset-y-0 bg-[var(--fel-gold)]/70" style={{ left: `${(GOLF_ACC_CENTER - GOLF_ACC_HALF) * 100}%`, width: `${GOLF_ACC_HALF * 200}%` }} />
              {Array.from({ length: 11 }, (_, i) => (
                <div key={i} className={`absolute bottom-0 w-px ${i % 5 === 0 ? 'h-full bg-white/70' : 'h-1/2 bg-white/35'}`} style={{ left: `${i * 10}%` }} />
              ))}
              {ticksOf(hud.meterTicks).map((c, i) => (i === 2 || i === 5 || i === 8 || i === 10)
                ? <span key={`t${i}`} className="absolute -top-4 -translate-x-1/2 text-[9px] font-bold text-white/65" style={{ left: `${i * 10}%` }}>{c}m</span>
                : null)}
              {typeof hud.powerLock === 'number' && (
                <div className="absolute inset-y-0 w-[3px] bg-[var(--fel-cyan)]" style={{ left: `${hud.powerLock}%` }} />
              )}
              <div className="absolute inset-y-0 w-[4px] -translate-x-1/2 bg-white shadow-[0_0_8px_#fff]" style={{ left: `${hud.meterT * 100}%` }} />
              {typeof hud.meterCarry === 'number' && (
                <span className="absolute -bottom-5 -translate-x-1/2 text-[11px] font-black text-[var(--fel-cyan)]" style={{ left: `${(hud.swingPhase === 'accuracy' && typeof hud.powerLock === 'number' ? hud.powerLock / 100 : hud.meterT) * 100}%` }}>{hud.meterCarry} m</span>
              )}
            </div>
          </div>
        )}
        {isBoard(hud.board) && typeof hud.boardTitle === 'string' && hud.boardTitle && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-4">
            <div className="fel-panel w-full max-w-[440px] px-5 py-4 font-mono">
              <div className="fel-heading text-2xl font-black text-white">SCORECARD</div>
              <div className="mt-3 grid gap-1.5">
                {hud.board.map((r) => (
                  <div key={r.name} className={`flex items-center justify-between gap-3 rounded-lg px-3 py-1.5 ${r.name === 'CARD' ? 'bg-[var(--fel-gold)]/15' : 'bg-black/40'}`}>
                    <span className="text-sm font-bold text-white/90">{r.name}</span>
                    <span className="truncate text-[11px] text-white/60">{r.line}</span>
                    <span className="fel-stat text-lg">{r.score}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 text-[11px] text-[var(--fel-gold)]">{hud.boardTitle}</div>
            </div>
          </div>
        )}

        {/* DERBY (A+ mission #7, MLB Home Run Derby presentation): homers · outs · longest, the rival's total ticking, the
            pitch label, and the distance flash on a homer. Key-gated on `outs`. */}
        {typeof hud.outs === 'number' && (
          <div className="pointer-events-none absolute inset-x-0 top-12 flex flex-col items-center gap-1.5 font-mono">
            <div className="fel-panel flex items-center gap-3 px-4 py-1.5">
              <span className="text-[11px] tracking-wider text-[#22d3ee]">HR</span>
              <span className="fel-stat text-2xl">{hnode(hud.homers, 0)}</span>
              <span className="text-white/40">·</span>
              <span className="text-[11px] tracking-wider text-white/70">OUTS</span>
              <span className={`fel-stat text-2xl ${Number(hud.outs) >= Number(hud.outsCap ?? 10) - 1 ? 'text-[#ff2d78]' : ''}`}>{hnode(hud.outs, 0)}<span className="text-sm text-white/40">/{hnode(hud.outsCap, 10)}</span></span>
              {Number(hud.longest) > 0 && <span className="ml-2 rounded bg-black/40 px-2 py-0.5 text-[11px] text-[var(--fel-gold)]">LONGEST {hnode(hud.longest, 0)} FT</span>}
              <span className="ml-2 text-[11px] tracking-wider text-[#facc15]">RIVAL <span className="fel-stat text-lg">{hnode(hud.rivalHomers, 0)}</span></span>
              {typeof hud.pitch === 'string' && hud.pitch && <span className="ml-2 rounded bg-black/40 px-2 py-0.5 text-[11px] text-white/80">{hud.pitch}</span>}
            </div>
            {typeof hud.distance === 'string' && hud.distance && (
              <span className="fel-heading fel-panel px-4 py-1 text-2xl font-black text-[var(--fel-gold)]">{hud.distance}</span>
            )}
          </div>
        )}

        {/* PENALTY (A+ mission #8, FIFA shootout read): the kicks board both sides, the feint counter, the two-press power
            bar and the DIVE prompt on their kick. Key-gated on `kicksYou`. */}
        {typeof hud.kicksYou === 'string' && (
          <div className="pointer-events-none absolute inset-x-0 top-12 flex flex-col items-center gap-1.5 font-mono">
            <div className="fel-panel grid grid-cols-[auto_auto_auto] items-center gap-x-3 gap-y-1 px-4 py-1.5">
              <span className="text-[11px] tracking-wider text-[#22d3ee]">YOU</span><span className="fel-stat text-xl">{hnode(hud.goals, 0)}</span><span className="text-lg tracking-[0.3em] text-white">{hud.kicksYou}</span>
              <span className="text-[11px] tracking-wider text-[#facc15]">THEM</span><span className="fel-stat text-xl">{hnode(hud.themGoals, 0)}</span><span className="text-lg tracking-[0.3em] text-white">{hnode(hud.kicksThem, '')}</span>
            </div>
            {Number(hud.feints) > 0 && <span className="fel-panel px-3 py-0.5 text-[11px] font-bold text-[var(--fel-gold)]">FEINTS {hnode(hud.feints, 0)} / 2 · style banked on a goal</span>}
          </div>
        )}
        {typeof hud.kickPower === 'number' && (
          <div className="pointer-events-none absolute inset-x-0 bottom-28 flex flex-col items-center gap-1 font-mono">
            <span className="fel-panel px-3 py-0.5 text-[11px] font-bold tracking-widest text-[var(--fel-cyan)]">POWER — KICK again to strike{typeof hud.kickShape === 'string' && hud.kickShape ? ` · ${hud.kickShape}` : ''}</span>
            {/* SOCCER UPGRADE (PES bar): ZONES with lines — soft, driven, top bins, and OVER (the ball clears the bar) */}
            <div className="relative mt-4 h-7 w-[min(520px,70vw)] rounded-md border border-white/20 bg-black/55">
              {(() => { const zones = typeof hud.kickZones === 'string' && hud.kickZones ? hud.kickZones.split(',').map((z) => { const [to, label] = z.split(':'); return { to: Number(to), label }; }) : [{ to: 0.55, label: '' }, { to: 0.85, label: 'DRIVEN' }, { to: 1, label: '' }];
                let from = 0; return zones.map((z, i) => { const el = (
                  <div key={i} className={`absolute inset-y-0 ${z.label === 'OVER' ? 'bg-[#ff2d78]/45' : z.label === 'TOP BINS' ? 'bg-[var(--fel-gold)]/60' : z.label === 'DRIVEN' ? 'bg-[var(--fel-cyan)]/25' : 'bg-white/5'}`} style={{ left: `${from * 100}%`, width: `${(z.to - from) * 100}%` }}>
                    <span className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] font-bold text-white/65">{z.label}</span>
                    <div className="absolute inset-y-0 right-0 w-px bg-white/70" />
                  </div>); from = z.to; return el; }); })()}
              <div className="absolute inset-y-0 w-[4px] -translate-x-1/2 bg-white shadow-[0_0_8px_#fff]" style={{ left: `${Math.max(0, Math.min(100, hud.kickPower))}%` }} />
            </div>
          </div>
        )}
        {/* TENNIS UPGRADE (Wii timing): the swing window as a meter with its bands — the mode publishes the ramp (contact at
            the right edge) and where OK / GOOD / PERFECT begin for this flight. Key-gated on the bands. */}
        {typeof hud.shotMeterT === 'number' && hud.shotMeterT > 0 && typeof hud.shotMeterBands === 'string' && hud.shotMeterBands && (() => {
          const [ok, good, perfect] = hud.shotMeterBands.split(',').map(Number); const pc = (v: number) => `${Math.max(0, Math.min(1, v)) * 100}%`;
          return (
            <div className="pointer-events-none absolute inset-x-0 bottom-28 flex flex-col items-center gap-1 font-mono">
              <span className="fel-panel px-3 py-0.5 text-[11px] font-bold tracking-widest text-[var(--fel-cyan)]">SWING — in the gold at the edge</span>
              <div className="relative h-6 w-[min(520px,70vw)] rounded-md border border-white/20 bg-black/55">
                <div className="absolute inset-y-0 bg-white/15" style={{ left: pc(ok), right: 0 }} />
                <div className="absolute inset-y-0 bg-[var(--fel-cyan)]/30" style={{ left: pc(good), right: 0 }} />
                <div className="absolute inset-y-0 bg-[var(--fel-gold)]/70" style={{ left: pc(perfect), right: 0 }} />
                {[ok, good, perfect].map((v, i) => <div key={i} className="absolute inset-y-0 w-px bg-white/70" style={{ left: pc(v) }} />)}
                <span className="absolute -top-4 -translate-x-1/2 text-[9px] font-bold text-white/60" style={{ left: pc(ok) }}>EARLY</span>
                <span className="absolute -top-4 -translate-x-1/2 text-[9px] font-bold text-[var(--fel-gold)]" style={{ left: pc(perfect) }}>PERFECT</span>
                <div className="absolute inset-y-0 w-[4px] -translate-x-1/2 bg-white shadow-[0_0_8px_#fff]" style={{ left: pc(hud.shotMeterT) }} />
              </div>
            </div>
          );
        })()}
        {/* WEATHER chip for the modes without the golf lie panel (which carries its own) */}
        {typeof hud.weather === 'string' && hud.weather && !(typeof hud.club === 'string' && hud.club) && (
          <div className="pointer-events-none absolute right-4 top-14 font-mono">
            <span className="fel-panel px-3 py-1 text-[11px] font-bold tracking-wider text-white/85">{hud.weather}</span>
          </div>
        )}
        {typeof hud.dive === 'string' && hud.dive && (
          <div className="pointer-events-none absolute inset-x-0 top-1/4 flex justify-center font-mono">
            <span className="fel-heading fel-panel px-5 py-2 text-2xl font-black text-[#7CFFB2]">{hud.dive}</span>
          </div>
        )}

        {/* TENNIS (A+ mission #6, Mario Tennis feel + Wii size): the scoreboard chip — games both sides, the umpire's
            call, the streak — and the TELL on the incoming ball with the answer that beats it. Key-gated. */}
        {typeof hud.call === 'string' && hud.call && (
          <div className="pointer-events-none absolute inset-x-0 top-12 flex justify-center font-mono">
            <div className="fel-panel flex items-center gap-3 px-4 py-1.5">
              <span className="text-[11px] tracking-wider text-[#22d3ee]">{hnode(hud.you, 'YOU')}</span>
              <span className="fel-stat text-2xl">{hnode(hud.score, 0)}</span>
              <span className="text-white/40">–</span>
              <span className="fel-stat text-2xl">{hnode(hud.foeScore, 0)}</span>
              <span className="text-[11px] tracking-wider text-[#facc15]">{hnode(hud.them, 'THEM')}</span>
              <span className="ml-2 rounded bg-black/40 px-2 py-0.5 text-sm font-bold text-[var(--fel-gold)]">{hud.call}</span>
              {Number(hud.streak) >= 2 && <span className="text-[11px] font-bold text-[#ff6a00]">{hnode(hud.streak, 0)} STRAIGHT</span>}
            </div>
          </div>
        )}
        {typeof hud.incomingTell === 'string' && hud.incomingTell && (
          <div className="pointer-events-none absolute inset-x-0 bottom-36 flex justify-center font-mono">
            <span className="fel-panel px-4 py-1.5 text-sm font-bold text-white">
              INCOMING · {hud.incomingTell}
              {typeof hud.answer === 'string' && hud.answer ? <span className="ml-2 text-[var(--fel-cyan)]">answer {hud.answer}</span> : null}
            </span>
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


