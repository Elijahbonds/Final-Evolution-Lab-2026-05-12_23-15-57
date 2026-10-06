'use client';

// FEL Babylon 1V1 Hoops stage (M48). THIN host: owns the <canvas>, boots the
// shared Babylon harness with the OneVOne ModeDefinition, and bridges
// phase/HUD/result into the existing GameShell pipeline. All gameplay lives in
// lib/babylon/* cores (BasketballCore + PlayerSlot + OneVOneMode).

import { readCourtLocation } from '@/lib/babylon/nexus/courtLocations';
import { useEffect, useRef, useState, useCallback } from 'react';
import type { GameProps, GameResult } from './game-shell';
import { BootSplash } from './boot-splash';
import { surfaceBootError } from './boot-error';
import { runMode, InputBus, type ModePhase, type SessionResult, type HudValue } from '@/lib/babylon';
import { MODES } from '@/lib/babylon/modes/registry';
import { TouchOverlay } from '@/lib/babylon/ui/TouchOverlay';
import { hnode } from './hud-format';
import { MicCaption, MicToggle } from './mic-caption';   // THE MIC (2026-09-24): what the court's MC just said, and the switch for the voice
import { CONTROLS_OFFENCE, CONTROLS_DEFENCE, pipBias } from '@/lib/babylon/modes/onevoneRules';   // IMPROVE (2026-10-06) #1 #10

/** IMPROVE (2026-10-06) #10: a release pip's colour — the world meter's verdict colours (ShotMeter3D VERDICT_HEX). */
const PIP_HEX: Record<string, string> = { p: '#39ff88', g: '#8cff5c', e: '#ffb340', l: '#ffb340', b: '#ff4b4b' };

type Hud = Record<string, HudValue>;

export default function BasketballBabylon({ onEnd }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const busRef = useRef<InputBus | null>(null);
  const endedRef = useRef(false);
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;
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
      const won = r.outcome === 'WIN';
      const result: GameResult = {
        score: r.score,
        stats: r.stats, outcome: r.outcome,   // pass 5 phase 3: the proof line reads these
        opponentScore: r.stats?.foeScore ?? 0,
        won,
        duration: r.durationSec,
        headline: won ? 'GAME WON' : 'GAME OVER',
      };
      onEndRef.current(result);
    };

    // StrictMode runs effect -> cleanup -> effect. Starting immediately means the
    // PHANTOM mount also builds a Babylon engine its cleanup cannot cancel —
    // `stop` is not assigned until the async load resolves — so two engines end
    // up on one canvas fighting over a single WebGL context and the loser draws
    // nothing. Measured on 3v3: mountVenue ran twice and the scene came out at
    // 5 meshes while the HUD streamed happily. Same fix as Dunk and 3v3.
    const startTimer = setTimeout(() => {
      if (disposed) return;
      runMode(MODES.onevone, {
      canvas,
      location: readCourtLocation(),   // court location pick (docs/SPEC-COURT-LOCATIONS.md)
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
        .catch((e) => surfaceBootError(e, { disposed, label: '[FEL-HOOPS] boot failed', setPhase, setLoadError }));
    }, 0);

    return () => {
      disposed = true;
      clearTimeout(startTimer);
      stop?.();
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

  const meter = typeof hud.shotMeterT === 'number' ? Math.max(0, Math.min(1, hud.shotMeterT)) : null;

  return (
    <div className="relative h-[calc(100dvh-3.25rem)] w-full overflow-hidden rounded-none border-0 bg-transparent">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

      {/* HUD bezel */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between px-4 py-3">
        <span className="fel-panel fel-stat px-3 py-1 text-lg">
          {hnode(hud.score, 0)} – {hnode(hud.foeScore, 0)}
        </span>
        <span className="flex flex-col items-end gap-1">
          <span className="fel-panel px-3 py-1 font-mono text-xs text-[var(--fel-gold)]">{hud.winBy2 === true ? 'TO 11 · WIN BY 2' : 'TO 11'}</span>
          {/* IMPROVE (2026-10-06) #10: the last five releases, oldest first — green in the window, amber early / late, red way late —
              and the lean once there are three to read, so a player can see their timing bias */}
          {phase === 'playing' && typeof hud.shotPips === 'string' && hud.shotPips && (
            <span className="fel-panel flex items-center gap-1 px-2 py-1" aria-label={`last releases: ${hud.shotPips}`}>
              {hud.shotPips.split('').map((c, i) => (
                <span key={i} className="inline-block h-2 w-2 rounded-full" style={{ background: PIP_HEX[c] ?? '#ffffff' }} />
              ))}
              {pipBias(hud.shotPips) && <span className="ml-1 font-mono text-[9px] text-white/70">{pipBias(hud.shotPips)}</span>}
            </span>
          )}
        </span>
      </div>

      {/* shot meter */}
      {meter !== null && phase === 'playing' && (() => {
        // THE SHOT METER (owner, 2026-09-18): the bar carries the GREEN release window the mode publishes
        // (`shotMeterGreen` = "center,half" in 0..1) and a marker on the fill — the 3D bar beside the shooter's head
        // (visual/ShotMeter3D) shows the same numbers in the world
        const g = typeof hud.shotMeterGreen === 'string' ? hud.shotMeterGreen.split(',').map(Number) : null;
        const green = g && g.length === 2 && g.every((v) => Number.isFinite(v)) ? { left: (g[0] - g[1]) * 100, width: g[1] * 200 } : null;
        return (
          <div className="pointer-events-none absolute inset-x-0 bottom-24 flex justify-center">
            <div className="relative h-3 w-64 overflow-hidden rounded-full bg-black/55 ring-1 ring-white/30">
              {green && <div className="absolute inset-y-0 bg-[#39ff88]/70" style={{ left: `${green.left}%`, width: `${green.width}%` }} />}
              <div className="h-full bg-[var(--fel-cyan)]/90" style={{ width: `${meter * 100}%` }} />
              <div className="absolute inset-y-0 w-[3px] -translate-x-1/2 bg-white shadow-[0_0_6px_#fff]" style={{ left: `${meter * 100}%` }} />
            </div>
          </div>
        );
      })()}

      {typeof hud.banner === 'string' && hud.banner && phase === 'playing' && (
        <div className="pointer-events-none absolute inset-x-0 top-1/3 text-center">
          <span className="fel-heading text-3xl font-bold text-[var(--fel-cyan)] drop-shadow">{hud.banner}</span>
        </div>
      )}
      {/* IMPROVE (2026-10-06) #1: ONE line for the state you are in (the mode's hint — it used to be every control at once, and
          this host never drew it) */}
      {typeof hud.hint === 'string' && hud.hint && phase === 'playing' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-16 px-3 text-center">
          <span className="fel-panel px-3 py-1 font-mono text-[10px] text-white/75">{hud.hint}</span>
        </div>
      )}
      {phase === 'playing' && <MicCaption text={hud.mic} who={hud.micWho} />}
      {phase === 'playing' && <MicToggle />}

      <BootSplash
        modeId="onevone"
        title="ONES"
        phase={phase}
        detail={phase === 'error' ? (loadError ?? undefined) : (countdown ?? undefined)}
        onStart={tapStart}
        onRetry={tapStart}
      />

      {/* IMPROVE (2026-10-06) #1: the full control list lives on the pause screen — over the splash's pause layer, never catching a tap
          (the layer's tap is the resume) */}
      {phase === 'paused' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 mx-auto max-w-3xl space-y-2 px-4 text-[10px] leading-snug text-white/75">
          <p><span className="font-black tracking-widest text-[var(--fel-cyan)]">OFFENSE</span> · {CONTROLS_OFFENCE}</p>
          <p><span className="font-black tracking-widest text-[var(--fel-gold)]">DEFENSE</span> · {CONTROLS_DEFENCE}</p>
        </div>
      )}

      {(phase === 'playing' || phase === 'countdown') && busRef.current && (
        <TouchOverlay bus={busRef.current} modeId="onevone" visible />
      )}
    </div>
  );
}
