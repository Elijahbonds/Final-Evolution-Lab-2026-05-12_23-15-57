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
import { BoostGauge } from './boost-hud';
import { runMode, InputBus, type ModePhase, type SessionResult, type HudValue } from '@/lib/babylon';
import { MODES } from '@/lib/babylon/modes/registry';
import { TouchOverlay } from '@/lib/babylon/ui/TouchOverlay';
import { hnode } from './hud-format';
import { getActiveSkin } from '@/lib/modes/art/active-skin';
import { applyArtCardToSurface } from '@/lib/modes/art/apply-art-card';
import { boardGameResult, boardHeadline, boardSportWon } from '@/lib/sessions/gameResultFromSession';

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
  /** The splash title (GATE-CRASHER-MAJOR): the mode's NAME. It was the registry key upper-cased — "SNOWBOARD SLALOM" on a
   *  route whose shell says GATE CRASHER. */
  title?: string;
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

/**
 * IMPROVE (2026-10-06, skate item 9): the balance needle a grind or a manual rides, −100..100 (the side it is tipping to;
 * the stick held that way brings it back). A meter the player cannot see is a guess. Drawn while a mode publishes a number.
 */
function BalanceNeedle({ value, label }: { value: number; label: string }) {
  const v = Math.max(-100, Math.min(100, value));
  const danger = Math.abs(v) > 70;
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={`font-mono text-[10px] tracking-wider ${danger ? 'text-[var(--fel-red)]' : 'text-white/70'}`}>{label || 'BALANCE'}</span>
      <div className="relative h-2 w-40 rounded-full bg-white/15">
        <div className="absolute inset-y-0 left-1/2 w-px bg-white/50" />
        <div
          className="absolute top-1/2 h-3.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-sm"
          style={{ left: `${50 + v / 2}%`, background: danger ? 'var(--fel-red)' : 'var(--fel-gold)' }}
        />
      </div>
    </div>
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
    <div className="flex flex-col items-end gap-0.5">
      <span className={`font-mono text-[10px] tracking-wider ${inside ? 'text-[var(--fel-cyan)]' : 'text-white/60'}`}>LIP · POCKET · FLAT</span>
      <div className="relative h-1.5 w-24 rounded-full bg-white/15">
        <div className="absolute inset-y-0 rounded-full bg-[var(--fel-cyan)]/35" style={{ left: `${lo}%`, width: `${Math.max(0, hi - lo)}%` }} />
        <div className={`absolute top-1/2 h-3 w-1 -translate-x-1/2 -translate-y-1/2 rounded-sm ${inside ? 'bg-[var(--fel-cyan)]' : 'bg-white'}`} style={{ left: `${at}%` }} />
      </div>
    </div>
  );
}

/**
 * IMPROVE (2026-10-06, surf item 13): the tube timer — seconds inside against the hold `mark` (the barrel banks past it), gold
 * while the rider is working the tube enough to bank, grey (with the ask) while he is not. Drawn while a mode publishes `tube`.
 */
function TubeMeter({ sec, mark, ok }: { sec: number; mark: number; ok: boolean }) {
  const max = mark * 2;
  const pct = Math.max(0, Math.min(100, (sec / max) * 100));
  const color = ok ? 'var(--fel-gold)' : 'rgba(255,255,255,0.55)';
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="font-mono text-[10px] tracking-wider" style={{ color }}>{ok ? `TUBE ${sec.toFixed(1)}s` : `TUBE ${sec.toFixed(1)}s · TRIM OR DRIVE`}</span>
      <div className="relative h-1.5 w-24 rounded-full bg-white/15">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
        <div className="absolute -top-0.5 h-2.5 w-px bg-white" style={{ left: '50%' }} />
      </div>
    </div>
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
    }, []);

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
            <span className="fel-panel px-3 py-1 text-[var(--fel-cyan)]">
              {Math.max(0, Number(hud.time ?? 0))}s
              {/* GATE-CRASHER-POLISH-2 (GC-F1): the par the time bonus counts from, beside the clock (a mode that publishes one) */}
              {hud.par != null && <span className={Number(hud.time ?? 0) > Number(hud.par) ? 'text-[var(--fel-gold)]' : 'text-white/70'}> · PAR {hnode(hud.par)}</span>}
            </span>
            {hud.coins != null && (
              <span className="fel-panel px-3 py-1 text-[var(--fel-gold)]">◈ {hnode(hud.coins, 0)}</span>
            )}
            {hud.gates != null && (
              <span className="fel-panel px-3 py-1 text-white/80">GATES {hnode(hud.gates)}</span>
            )}
            {/* GATE-CRASHER-MAJOR: the win, in the bezel — the target before it is reached, the verdict after */}
            {typeof hud.target === 'string' && hud.target && (
              <span className={`fel-panel px-3 py-1 font-bold ${hud.target.includes('✓') ? 'text-[var(--fel-emerald)]' : 'text-[var(--fel-gold)]'}`}>{hud.target}</span>
            )}
            {hud.goals != null && (
              <span className="fel-panel px-3 py-1 text-white/80">GOALS {hnode(hud.goals)}</span>
            )}
            {/* IMPROVE (2026-10-06, snow item 12): the pace — the speed, and the split at the last gate against par (and the best run) */}
            {typeof hud.speed === 'number' && (
              <span className="fel-panel px-3 py-1 text-white/80">{hud.speed} KM/H</span>
            )}
            {typeof hud.split === 'string' && hud.split && (
              <span className={`fel-panel px-3 py-1 font-bold ${hud.split.includes('+') ? 'text-[var(--fel-gold)]' : 'text-[var(--fel-emerald)]'}`}>{hud.split}</span>
            )}
            {/* IMPROVE (2026-10-06, surf items 9 / 20): the judged heat (best three waves) and the swell being ridden */}
            {typeof hud.heat === 'number' && (
              <span className="fel-panel px-3 py-1 text-white/80">HEAT {hud.heat.toFixed(1)} · {hnode(hud.waves, 0)} WAVES</span>
            )}
            {typeof hud.swell === 'string' && hud.swell && (
              <span className="fel-panel px-3 py-1 font-bold text-[var(--fel-cyan)]">{hud.swell}</span>
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
            {/* IMPROVE (2026-10-06, item 10): the THPS line — the links by name, and what the pot is waiting on */}
            {typeof hud.comboLine === 'string' && hud.comboLine && (
              <span className="max-w-[80%] truncate font-mono text-xs font-bold text-white/90 drop-shadow">{hud.comboLine}</span>
            )}
            {typeof hud.chainLink === 'string' && hud.chainLink && (
              <span className="font-mono text-[10px] tracking-wider text-white/60">{hud.chainLink}</span>
            )}
          </div>
        )}

        {/* IMPROVE (2026-10-06, item 9): the balance needle while a grind or a manual rides one */}
        {typeof hud.balance === 'number' && (
          <div className="pointer-events-none absolute inset-x-0 bottom-[32%] flex justify-center">
            <BalanceNeedle value={hud.balance} label={typeof hud.balanceKind === 'string' ? hud.balanceKind : ''} />
          </div>
        )}

        {/* BOOST (FINISH-RELEASE): the shared gauge, bottom centre — the same one the kart and the plane show. */}
        <BoostGauge hud={hud} className="absolute inset-x-0 bottom-24" />

        {/* Meters. Each appears only if its mode publishes it. */}
        <div className="pointer-events-none absolute right-4 top-24 flex flex-col items-end gap-1.5">
          {hud.flow != null && <Meter label="FLOW" value={Number(hud.flow)} max={200} color="var(--fel-cyan)" />}
          {hud.momentum != null && <Meter label="MOMENTUM" value={Number(hud.momentum)} max={100} color="var(--fel-red)" />}
          {/* IMPROVE (2026-10-06, snow item 9): the air left, while the rider is in it */}
          {typeof hud.airLeft === 'number' && (
            <Meter label={`AIR ${hud.airLeft.toFixed(1)}s`} value={hud.airLeft} max={Number(hud.airMax ?? 1.2) || 1.2} color="var(--fel-cyan)" />
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
          <div className="pointer-events-none absolute bottom-4 left-4 flex flex-col items-start gap-0.5">
            {hud.goalList.split(' · ').map((g) => (
              <span
                key={g}
                className={`font-mono text-[10px] ${g.startsWith('✓') ? 'text-[var(--fel-gold)]' : 'text-white/55'}`}
              >
                {g}
              </span>
            ))}
          </div>
        )}

        {typeof hud.banner === 'string' && hud.banner && (
          <div className="pointer-events-none absolute inset-x-0 top-1/3 text-center">
            <span className="fel-heading fel-panel px-4 py-2 text-2xl font-bold text-[var(--fel-emerald)]">{hud.banner}</span>
          </div>
        )}

        {/* ASSET-POLISH (2026-10-05): what the wall in reach takes (skate's kick plant and wall ride), said while it can */}
        {typeof hud.wallCue === 'string' && hud.wallCue && (
          <div className="pointer-events-none absolute inset-x-0 bottom-[22%] text-center">
            <span className="fel-panel px-3 py-1 font-mono text-sm font-bold text-[var(--fel-cyan)]">{hud.wallCue}</span>
          </div>
        )}

        {/* IMPROVE (2026-10-06, surf item 19): a lesson the mode is giving right now (surf's first wave: climb, drop, pump) */}
        {phase === 'playing' && typeof hud.coach === 'string' && hud.coach && (
          <div className="pointer-events-none absolute inset-x-0 bottom-[30%] text-center">
            <span className="fel-panel px-3 py-1 font-mono text-sm font-bold text-[var(--fel-cyan)]">{hud.coach}</span>
          </div>
        )}

        {/* IMPROVE (2026-10-06, item 18): the mode's control hint, for the first seconds of play */}
        {hintUp && hintText && (
          <div className="pointer-events-none absolute inset-x-0 bottom-14 flex justify-center px-4">
            <span className="fel-panel max-w-[70%] px-3 py-1 text-center font-mono text-[11px] text-white/80">{hintText}</span>
          </div>
        )}

        <BootSplash
          modeId={modeKey}
          title={opts.title ?? HOST_TITLE[modeKey] ?? modeKey.replace(/_/g, ' ').toUpperCase()}
          goal={typeof hud.goal === 'string' && hud.goal ? hud.goal : undefined}
          phase={phase}
          detail={phase === 'error' ? (loadError ?? undefined) : (countdown ?? undefined)}
          onStart={tapStart}
          onRetry={tapStart}
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
