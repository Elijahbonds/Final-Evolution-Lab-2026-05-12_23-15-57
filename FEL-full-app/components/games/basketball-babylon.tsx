'use client';

// FEL Babylon 1V1 Hoops stage (M48). THIN host: owns the <canvas>, boots the
// shared Babylon harness with the OneVOne ModeDefinition, and bridges
// phase/HUD/result into the existing GameShell pipeline. All gameplay lives in
// lib/babylon/* cores (BasketballCore + PlayerSlot + OneVOneMode).

import { readCourtLocation } from '@/lib/babylon/nexus/courtLocations';
import { courtArtSkin } from '@/lib/modes/art/apply-art-card';
import { useEffect, useRef, useState, useCallback } from 'react';
import type { GameProps, GameResult } from './game-shell';
import { BootSplash } from './boot-splash';
import { surfaceBootError } from './boot-error';
import { runMode, InputBus, type ModePhase, type SessionResult, type HudValue } from '@/lib/babylon';
import { MODES } from '@/lib/babylon/modes/registry';
import { TouchOverlay } from '@/lib/babylon/ui/TouchOverlay';
import { hnode } from './hud-format';
import { HUD_TEXT_ALPHA, HudBanner, HudChip, HudFrame, HudLine, HudPlate, HudText, ScoreValue, Scorebug, hudColor, type HudTone } from './tv-hud';
import { HoopsShotMeter } from './hoops-shot-meter';
import { MicCaption, MicToggle } from './mic-caption';   // THE MIC (2026-09-24): what the court's MC just said, and the switch for the voice
import { pipBias } from '@/lib/babylon/modes/onevoneRules';   // IMPROVE (2026-10-06) #10

/** IMPROVE (2026-10-06) #10: a release pip's colour — the world meter's verdicts (ShotMeter3D) on the HUD palette: perfect and good
 *  green (perfect solid, good a step softer), early and late amber, way late red. */
const PIP_TONE: Record<string, [HudTone, number]> = { p: ['good', 1], g: ['good', 0.6], e: ['heat', 1], l: ['heat', 1], b: ['danger', 1] };
const pipColor = (c: string): string => { const [tone, alpha] = PIP_TONE[c] ?? ['text', 1]; return hudColor(tone, alpha); };

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
      applySkin: courtArtSkin,   // PIPELINES (2026-10-06): the player's court art card, a centre-court decal
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

      {/* TV HUD (A9.13, lane/hud-hoops): the 1v1's readouts on the shared system — same keys, same gates, same slots. */}
      <HudFrame>
      {/* HUD bezel */}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between px-4 py-3">
        <Scorebug>
          <ScoreValue value={hnode(hud.score, 0)} size="stat" />
          <HudText size="stat" alpha={HUD_TEXT_ALPHA.faint}>–</HudText>
          <ScoreValue value={hnode(hud.foeScore, 0)} size="stat" />
        </Scorebug>
        <span className="flex flex-col items-end gap-1">
          <HudChip tone="score" size="body">{hud.winBy2 === true ? 'TO 11 · WIN BY 2' : 'TO 11'}</HudChip>
          {/* IMPROVE (2026-10-06) #10: the last five releases, oldest first — green in the window, amber early / late, red way late —
              and the lean once there are three to read, so a player can see their timing bias */}
          {phase === 'playing' && typeof hud.shotPips === 'string' && hud.shotPips && (
            <HudPlate as="span" className="flex items-center gap-1 px-2 py-1" title={`last releases: ${hud.shotPips}`}>
              {hud.shotPips.split('').map((c, i) => (
                <span key={i} className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: pipColor(c) }} />
              ))}
              {pipBias(hud.shotPips) && <HudText size="caption" alpha={0.7} className="ml-1">{pipBias(hud.shotPips)}</HudText>}
            </HudPlate>
          )}
        </span>
      </div>

      {/* shot meter */}
      {meter !== null && phase === 'playing' && (
        <div className="absolute inset-x-0 bottom-24 flex justify-center">
          <HoopsShotMeter t={meter} green={hud.shotMeterGreen} perfect={hud.shotMeterPerfect} />
        </div>
      )}

      {phase === 'playing' && <HudBanner text={typeof hud.banner === 'string' ? hud.banner : ''} tone="you" plate={false} className="top-1/3" />}
      {/* IMPROVE (2026-10-06) #1: ONE line for the state you are in (the mode's hint — it used to be every control at once, and
          this host never drew it) */}
      {typeof hud.hint === 'string' && hud.hint && phase === 'playing' && (
        <HudLine text={hud.hint} size="caption" alpha={0.75} className="bottom-16" />
      )}
      </HudFrame>
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

      {/* HOOPS PAUSE (2026-10-06). Owner: "Hoops pause: Controls panel only" — the full OFFENSE / DEFENSE list that sat along the
          bottom here on pause (IMPROVE #1) is in the splash's CONTROLS panel now (lib/babylon/ui/panelLines.ts PANEL_GROUPS): one
          list on the pause, the same as every other mode. */}

      {(phase === 'playing' || phase === 'countdown') && busRef.current && (
        <TouchOverlay bus={busRef.current} modeId="onevone" visible />
      )}
    </div>
  );
}
