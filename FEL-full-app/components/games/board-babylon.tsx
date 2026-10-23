'use client';

// FEL Babylon board-sports host (M22–M27 rollout wave 2). ONE thin host powers
// skateboard, snowboard slalom, and surf — exactly mirroring the single shared
// BoardRunMode core (never forked). makeBoardHost(modeKey) returns a
// GameShell-compatible component so each route stays a 1-line skin. All gameplay
// lives in lib/babylon/* — nothing is duplicated here.

import { useEffect, useRef, useState, useCallback } from 'react';
import type { GameProps, GameResult } from './game-shell';
import { useBabylonPlaytestBridge } from './use-babylon-playtest-bridge';
import { BootSplash } from './boot-splash';
import { surfaceBootError } from './boot-error';
import { useBabylonBootRetry } from './use-babylon-boot-retry';
import { BoostGauge } from './boost-hud';
import { runMode, InputBus, type ModePhase, type SessionResult, type HudValue } from '@/lib/babylon';
import { MODES } from '@/lib/babylon/modes/registry';
import { TouchOverlay } from '@/lib/babylon/ui/TouchOverlay';
import { hnode } from './hud-format';
import { HUD_TEXT_ALPHA, HudBanner, HudChip, HudFrame, HudLine, HudMeter, HudText, ScoreValue, Scorebug, type HudTone } from './tv-hud';
import { getActiveSkin } from '@/lib/modes/art/active-skin';
import { applyArtCardToSurface } from '@/lib/modes/art/apply-art-card';
import { boardGameResult, boardHeadline, boardSportWon } from '@/lib/sessions/gameResultFromSession';

type Hud = Record<string, HudValue>;

export interface BoardHostOpts {
  /** Registry key: 'skateboard' | 'snowboard_slalom' | 'surf'. */
  modeKey: string;
  /** One-line control hint shown on the CONTROLS panel (READY and pause) when the mode writes none of its own. */
  hint: string;
  /** Trick button labels for B / X / Y (air-only). */
  tricks: [string, string, string];
  /** Log tag for boot errors. */
  tag: string;
  /** The splash title (GATE-CRASHER-MAJOR): the mode's NAME. It was the registry key upper-cased — "SNOWBOARD SLALOM" on a
   *  route whose shell says GATE CRASHER. */
  title?: string;
}

/** A labelled 0..max bar. Board sports live on their meters. (TV HUD: the shared HudMeter, label in the bar's tone.) */
function Meter({ label, value, max, tone }: { label: string; value: number; max: number; tone: HudTone }) {
  return <HudMeter className="items-end" label={label} labelTone={tone} value={value} max={max} tone={tone} height="thin" width="6rem" />;
}

/**
 * IMPROVE (2026-10-06, skate item 9): the balance needle a grind or a manual rides, −100..100 (the side it is tipping to;
 * the stick held that way brings it back). A meter the player cannot see is a guess. Drawn while a mode publishes a number.
 */
function BalanceNeedle({ value, label }: { value: number; label: string }) {
  const v = Math.max(-100, Math.min(100, value));
  const danger = Math.abs(v) > 70;
  return (
    <HudMeter
      className="items-center"
      label={label || 'BALANCE'}
      labelTone={danger ? 'danger' : undefined}
      labelAlpha={danger ? 1 : 0.7}
      height="bar" width="10rem"
      ticks={[{ at: 0.5, major: true }]}
      markers={[{ at: (50 + v / 2) / 100, tone: danger ? 'danger' : 'score', width: 6 }]}
    />
  );
}

/**
 * IMPROVE (2026-10-06, surf item 12): where the rider sits between the lip (left) and the bottom of the face (right), the scored
 * pocket band drawn on the track. `pos`, `lo`, `hi` are 0..100 along the face. Drawn while a mode publishes `pocket`.
 */
function PocketBar({ pos, lo, hi }: { pos: number; lo: number; hi: number }) {
  const at = Math.max(0, Math.min(100, pos));
  const inside = at >= lo && at <= hi;
  return (
    <HudMeter
      className="items-end"
      label="LIP · POCKET · FLAT"
      labelTone={inside ? 'you' : undefined}
      labelAlpha={inside ? 1 : 0.6}
      height="thin" width="6rem"
      segments={[{ from: lo / 100, to: Math.max(lo, hi) / 100, tone: 'you', alpha: 0.35 }]}
      markers={[{ at: at / 100, tone: inside ? 'you' : 'text', width: 4 }]}
    />
  );
}

/**
 * IMPROVE (2026-10-06, surf item 13): the tube timer — seconds inside against the hold `mark` (the barrel banks past it), gold
 * while the rider is working the tube enough to bank, grey (with the ask) while he is not. Drawn while a mode publishes `tube`.
 */
function TubeMeter({ sec, mark, ok }: { sec: number; mark: number; ok: boolean }) {
  return (
    <HudMeter
      className="items-end"
      label={ok ? `TUBE ${sec.toFixed(1)}s` : `TUBE ${sec.toFixed(1)}s · TRIM OR DRIVE`}
      labelTone={ok ? 'score' : undefined}
      labelAlpha={ok ? 1 : 0.55}
      value={sec} max={mark * 2} tone={ok ? 'score' : 'text'} fillAlpha={ok ? 1 : 0.55}
      height="thin" width="6rem"
      ticks={[{ at: 0.5, major: true }]}
    />
  );
}

/** IMPROVE (2026-10-06, item 18): how long the mode's control hint stays up once play starts (or the hint changes), ms. */
const HINT_SHOW_MS = 8000;

/** A mode's NAME on the splash when the route does not pass one (GATE-CRASHER-MAJOR: every host of the slalom says what it is). */
const HOST_TITLE: Record<string, string> = { snowboard_slalom: 'GATE CRASHER' };

/** Build a GameShell-compatible board host bound to a specific registry mode. */
export function makeBoardHost(opts: BoardHostOpts) {
  const { modeKey, tag } = opts;

  function BoardBabylon({ onEnd }: GameProps) {
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
    // IMPROVE (2026-10-06, item 18): skate, snow and surf all publish `hint` and this host never drew it. It is shown at
    // the start of play (and again when it changes — a body's words replace a pad's), then gets out of the way.
    const [hintUp, setHintUp] = useState(false);
    const hintText = typeof hud.hint === 'string' ? hud.hint : '';
    const live = phase === 'playing' || phase === 'countdown';
    useEffect(() => {
      if (!live || !hintText) { setHintUp(false); return; }
      setHintUp(true);
      const t = setTimeout(() => setHintUp(false), HINT_SHOW_MS);
      return () => clearTimeout(t);
    }, [live, hintText]);
    useBabylonPlaytestBridge(modeKey, () => ({ phase, countdown, loadError, hud }), busRef.current);

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
        // boards pass phase 10: the card reads the MODE's line. It used to say `0 COINS · x1 CHAIN` for every board (snow has no
        // coins; `combo` was never a stat) and `won: false` for every run — the modes end 'win' / 'complete' now.
        const won = boardSportWon(r.outcome);
        onEndRef.current(boardGameResult(r, { modeKey, headline: boardHeadline(modeKey, r, won) }));
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
        // IMPROVE (2026-10-06): an update that changes nothing keeps the same state object, so React skips the re-render
        // (a mode repeating its values every frame cost a render a call — skate pushed about three a frame)
        onHud: (u) => setHud((prev) => (Object.keys(u).some((k) => prev[k] !== u[k]) ? { ...prev, ...u } : prev)),
        resultSink,
      })
        .then((s) => {
          if (disposed) { s(); return; }
          stop = s;
        })
          .catch((e) => surfaceBootError(e, { disposed, label: `[${tag}] boot failed`, setPhase, setLoadError }));
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

    return (
      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-white/10 bg-black">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

        {/* TV HUD (A9.13, lane/tv-hud): the shared system (components/games/tv-hud) draws every readout — same keys,
            same gates, same slots. */}
        <HudFrame>
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
        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <HudChip tone="you" size="value">
              {Math.max(0, Number(hud.time ?? 0))}s
              {/* GATE-CRASHER-POLISH-2 (GC-F1): the par the time bonus counts from, beside the clock (a mode that publishes one) */}
              {hud.par != null && <HudText size="label" tone={Number(hud.time ?? 0) > Number(hud.par) ? 'score' : 'text'} alpha={Number(hud.time ?? 0) > Number(hud.par) ? 1 : 0.7}> · PAR {hnode(hud.par)}</HudText>}
            </HudChip>
            {hud.coins != null && (
              <HudChip tone="score" size="value">◈ {hnode(hud.coins, 0)}</HudChip>
            )}
            {hud.gates != null && (
              <HudChip label="GATES" alpha={0.85} size="value">{hnode(hud.gates)}</HudChip>
            )}
            {/* GATE-CRASHER-MAJOR: the win, in the bezel — the target before it is reached, the verdict after */}
            {typeof hud.target === 'string' && hud.target && (
              <HudChip tone={hud.target.includes('✓') ? 'good' : 'score'} size="value">{hud.target}</HudChip>
            )}
            {hud.goals != null && (
              <HudChip label="GOALS" alpha={0.85} size="value">{hnode(hud.goals)}</HudChip>
            )}
            {/* IMPROVE (2026-10-06, snow item 12): the pace — the speed, and the split at the last gate against par (and the best run) */}
            {typeof hud.speed === 'number' && (
              <HudChip alpha={0.85} size="value">{hud.speed} KM/H</HudChip>
            )}
            {typeof hud.split === 'string' && hud.split && (
              <HudChip tone={hud.split.includes('+') ? 'score' : 'good'} size="value">{hud.split}</HudChip>
            )}
            {/* IMPROVE (2026-10-06, surf items 9 / 20): the judged heat (best three waves) and the swell being ridden */}
            {typeof hud.heat === 'number' && (
              <HudChip alpha={0.85} size="value">HEAT {hud.heat.toFixed(1)} · {hnode(hud.waves, 0)} WAVES</HudChip>
            )}
            {typeof hud.swell === 'string' && hud.swell && (
              <HudChip tone="you" size="value">{hud.swell}</HudChip>
            )}
          </div>
          <Scorebug><ScoreValue value={hnode(hud.score, 0)} size="stat" pop={false} /></Scorebug>
        </div>

        {/* THE COMBO TICKER — the pot you stand to lose. Only while one is open. */}
        {typeof hud.combo === 'string' && hud.combo && (
          <div className="absolute inset-x-0 top-14 flex flex-col items-center">
            <ScoreValue value={hnode(hud.pot, 0)} size="hero" tone="score" />
            <HudText size="value" tone="score">{hnode(hud.combo)}</HudText>
            {/* IMPROVE (2026-10-06, item 10): the THPS line — the links by name, and what the pot is waiting on */}
            {typeof hud.comboLine === 'string' && hud.comboLine && (
              <HudText size="body" alpha={0.9} className="max-w-[80%] truncate" style={{ fontWeight: 700 }}>{hud.comboLine}</HudText>
            )}
            {typeof hud.chainLink === 'string' && hud.chainLink && (
              <HudText size="caption" alpha={0.6}>{hud.chainLink}</HudText>
            )}
          </div>
        )}

        {/* IMPROVE (2026-10-06, item 9): the balance needle while a grind or a manual rides one */}
        {typeof hud.balance === 'number' && (
          <div className="absolute inset-x-0 bottom-[32%] flex justify-center">
            <BalanceNeedle value={hud.balance} label={typeof hud.balanceKind === 'string' ? hud.balanceKind : ''} />
          </div>
        )}

        {/* BOOST (FINISH-RELEASE): the shared gauge, bottom centre — the same one the kart and the plane show. */}
        <BoostGauge hud={hud} className="absolute inset-x-0 bottom-24" />

        {/* Meters. Each appears only if its mode publishes it. */}
        <div className="absolute right-4 top-24 flex flex-col items-end gap-1.5">
          {hud.flow != null && <Meter label="FLOW" value={Number(hud.flow)} max={200} tone="you" />}
          {hud.momentum != null && <Meter label="MOMENTUM" value={Number(hud.momentum)} max={100} tone="danger" />}
          {/* IMPROVE (2026-10-06, snow item 9): the air left, while the rider is in it */}
          {typeof hud.airLeft === 'number' && (
            <Meter label={`AIR ${hud.airLeft.toFixed(1)}s`} value={hud.airLeft} max={Number(hud.airMax ?? 1.2) || 1.2} tone="you" />
          )}
          {/* IMPROVE (2026-10-06, surf items 12 / 13): where the rider is on the face, and the tube while one is ridden */}
          {typeof hud.pocket === 'number' && (
            <PocketBar pos={hud.pocket} lo={Number(hud.pocketLo ?? 0)} hi={Number(hud.pocketHi ?? 0)} />
          )}
          {typeof hud.tube === 'number' && <TubeMeter sec={hud.tube} mark={Number(hud.tubeMark ?? 1.5) || 1.5} ok={hud.tubeOk === true} />}
        </div>

        {/* The objectives, NAMED. The bezel showed "GOALS 0/4" and nothing else,
            so the player was chasing four targets they had never been told. */}
        {typeof hud.goalList === 'string' && hud.goalList && (
          <div className="absolute bottom-4 left-4 flex flex-col items-start gap-0.5">
            {hud.goalList.split(' · ').map((g) => (
              <HudText key={g} size="caption" tone={g.startsWith('✓') ? 'score' : 'text'} alpha={g.startsWith('✓') ? 1 : HUD_TEXT_ALPHA.faint}>
                {g}
              </HudText>
            ))}
          </div>
        )}

        <HudBanner text={typeof hud.banner === 'string' ? hud.banner : ''} tone="good" />

        {/* ASSET-POLISH (2026-10-05): what the wall in reach takes (skate's kick plant and wall ride), said while it can */}
        <HudLine text={typeof hud.wallCue === 'string' ? hud.wallCue : ''} className="bottom-[22%]" size="value" tone="you" alpha={1} strong />

        {/* IMPROVE (2026-10-06, surf item 19): a lesson the mode is giving right now (surf's first wave: climb, drop, pump) */}
        {phase === 'playing' && (
          <HudLine text={typeof hud.coach === 'string' ? hud.coach : ''} className="bottom-[30%]" size="value" tone="you" alpha={1} strong />
        )}

        {/* IMPROVE (2026-10-06, item 18): the mode's control hint, for the first seconds of play */}
        {hintUp && hintText && (
          <HudLine text={hintText} className="bottom-14" size="label" alpha={0.8} maxWidthClass="max-w-[70%]" />
        )}
        </HudFrame>

        <BootSplash
          modeId={modeKey}
          controls={opts.hint}   // CONTROLS SCREEN (2026-10-06): the host's control line, on the READY card and the pause
          title={opts.title ?? HOST_TITLE[modeKey] ?? modeKey.replace(/_/g, ' ').toUpperCase()}
          goal={typeof hud.goal === 'string' && hud.goal ? hud.goal : undefined}
          phase={phase}
          detail={phase === 'error' ? (loadError ?? undefined) : (countdown ?? undefined)}
          onStart={tapStart}
          onRetry={retryBoot}
        />

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
