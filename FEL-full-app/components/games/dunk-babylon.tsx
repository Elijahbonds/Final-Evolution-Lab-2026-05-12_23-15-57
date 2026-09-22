'use client';

// FEL Babylon Dunk stage — the M22–M27 proof gate. This component is a THIN
// host: it owns the <canvas>, boots the shared Babylon harness with the dunk
// ModeDefinition, and bridges phase/HUD/result back into the existing
// GameShell pipeline (GameProps.onEnd → /api/sessions recap). All gameplay
// lives in lib/babylon/* cores; nothing game-specific is duplicated here.

import { readCourtLocation } from '@/lib/babylon/nexus/courtLocations';
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import type { GameProps, GameResult } from './game-shell';
import { BootSplash } from './boot-splash';
import { runMode, InputBus, type ModePhase, type SessionResult, type HudValue, type HudScoreCard } from '@/lib/babylon';
import { MODES } from '@/lib/babylon/modes/registry';
import { TouchOverlay } from '@/lib/babylon/ui/TouchOverlay';
import { PadChips } from '@/lib/babylon/ui/PadChips';
import { HostLobby } from '@/components/controller-link/host-lobby';
import { controllerConfigFor } from '@/lib/controller-link/schemas/registry';
import { toInputBus } from '@/lib/controller-link/modeBridge';
import { hnode, hnum } from './hud-format';

type Hud = Record<string, HudValue>;

/** TRY-ONBOARD (G1/G3/G7): a continuous host wants the NIGHT CARD, not a session end.
 *  `continuous` puts the mode on its GO AGAIN loop; `onCard` receives each night's
 *  scoreboard so the host can bank the run / offer a claim WITHOUT the run stopping. */
export interface DunkBabylonProps extends GameProps {
  continuous?: boolean;
  onCard?: (result: GameResult) => void;
  /** G3: the host's optional claim / share offer, rendered UNDER the card's GO AGAIN.
   *  It lives inside the card on purpose — a claim that is a sibling of GO AGAIN can
   *  never be a wall in front of it, which is exactly what a modal was. */
  cardSlot?: React.ReactNode;
}

export default function DunkBabylon({ onEnd, onCard, cardSlot, continuous = false }: DunkBabylonProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const busRef = useRef<InputBus | null>(null);
  const endedRef = useRef(false);
  // TRY-ONBOARD G7: the boot effect must never re-run because a PARENT re-rendered.
  // It used to list `onEnd` as a dependency, so any host that handed down a fresh
  // callback identity — a shell that holds state of its own, which the guest shell now
  // does — would dispose the Babylon engine and cold-boot the whole venue underneath a
  // live run. The callbacks live in refs; the effect owns the stage for the mount.
  const onEndRef = useRef(onEnd);
  const onCardRef = useRef(onCard);
  onEndRef.current = onEnd;
  onCardRef.current = onCard;
  const continuousRef = useRef(continuous);
  const [phase, setPhase] = useState<ModePhase>('loading');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hud, setHud] = useState<Hud>({});
  // CONTROLLER-UNIVERSAL-MULTI: the chips and the phone link need the bus in RENDER, and busRef alone never re-renders
  const [bus, setBus] = useState<InputBus | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bus = new InputBus();
    busRef.current = bus;
    setBus(bus);
    let stop: (() => void) | null = null;
    let disposed = false;

    const resultSink = async (r: SessionResult) => {
      if (endedRef.current) return;
      endedRef.current = true;
      // PACK #3: the mode emits CONTEST_WON, not WIN — dunk sessions had always posted as losses.
      // The `|| 'WIN'` half of that fix was dead on arrival: DunkMode only ever emits
      // CONTEST_WON / CONTEST_LOST. Dropped, because a comparison against a string the mode
      // cannot produce reads like a second supported outcome and is how this drifts again.
      const won = r.outcome === 'CONTEST_WON';
      const result: GameResult = {
        score: r.score,
        stats: r.stats, outcome: r.outcome,   // pass 5 phase 3: the proof line reads these
        opponentScore: r.stats?.rivalScore ?? r.stats?.rivalTotal ?? 0,   // the mode reports `rivalTotal`; the session had posted the rival as 0
        won,
        duration: r.durationSec,
        headline: won ? 'CONTEST WON' : 'CONTEST OVER',
        tallies: { hits: r.stats?.makes ?? 0, misses: r.stats?.misses ?? 0, dodges: 0, combos: r.stats?.bestChain ?? 0 },   // PACK #3: make/miss proof
      };
      onEndRef.current(result);
    };

    // TRY-ONBOARD G1: a night's card. Same shape the session end reports, but the mode
    // is still running behind it — the host must not treat this as a teardown.
    const cardSink = async (r: SessionResult) => {
      onCardRef.current?.({
        score: r.score,
        stats: r.stats, outcome: r.outcome,
        opponentScore: r.stats?.rivalTotal ?? 0,
        won: r.outcome === 'CONTEST_WON',
        duration: r.durationSec,
        headline: r.outcome === 'CONTEST_WON' ? 'NIGHT WON' : 'THAT WAS THE CARD',
        tallies: { hits: r.stats?.makes ?? 0, misses: r.stats?.misses ?? 0, dodges: 0, combos: r.stats?.bestChain ?? 0 },
      });
    };

    // StrictMode runs effect -> cleanup -> effect. Starting the harness
    // immediately means the PHANTOM mount also builds a Babylon engine, and its
    // cleanup cannot cancel it — `stop` is not assigned until the async load
    // resolves. Two engines then sit on the SAME canvas sharing one WebGL
    // context and fight: the watchdog logs "confirmed black output" while the
    // HUD streams happily from the other instance. This is the guest onboarding
    // path (/try), so that black frame was the first thing a new player saw.
    // Deferring by a tick lets the phantom mount be cancelled before it builds.
    const startTimer = setTimeout(() => {
      if (disposed) return;
      runMode(MODES.dunk, {
        canvas,
        location: readCourtLocation(),   // court location pick (docs/SPEC-COURT-LOCATIONS.md)
        input: bus,
        continuous: continuousRef.current,
        cardSink,
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
        .catch((e) => console.error('[FEL-DUNK] boot failed', e));
    }, 0);

    return () => {
      disposed = true;
      clearTimeout(startTimer);
      stop?.();
      busRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- G7: the stage is owned by the mount; callbacks are read through refs.
  }, []);

  // The mode is deaf for a beat when the card lands, so that a SLAM already in flight
  // cannot skip the one screen that says how the night went (DunkMode CARD_SETTLE_SEC).
  // The button follows the same clock — a live-looking button that eats a click is
  // worse than one that is visibly not ready yet.
  const card = typeof hud.nightCard === 'string' && hud.nightCard ? hud.nightCard : null;
  const [cardArmed, setCardArmed] = useState(false);
  useEffect(() => {
    if (!card) { setCardArmed(false); return; }
    const t = setTimeout(() => setCardArmed(true), 800);
    return () => clearTimeout(t);
  }, [card]);

  // ── touch bridge ──────────────────────────────────────────────────────────
  const emit = useCallback((e: Parameters<InputBus['emit']>[0]) => {
    busRef.current?.emit(e);
  }, []);

  // TRY-ONBOARD G1: the card's GO AGAIN is the same event a pad button sends — the mode
  // owns the reset, this is only a finger on it. Press AND release, or a held 'A' latch
  // in the mode would still be down when the next runway starts.
  const tapGoAgain = useCallback(() => {
    emit({ t: 'button', btn: 'A', pressed: true });
    emit({ t: 'button', btn: 'A', pressed: false });
  }, [emit]);

  const tapStart = useCallback(() => {
    // READY gate + pause both advance on any button press.
    emit({ t: 'button', btn: 'START', pressed: true });
  }, [emit]);

  // ── Controller Link (CONTROLLER-UNIVERSAL-MULTI) ──────────────────────────
  // A phone joins by QR as this contest's pad while the host is on the TV. ONE adapter per bus: toInputBus keeps the
  // held RUN ramp and the held d-pad between events, so a fresh adapter per event could never stop a charge it started.
  const controllerConfig = useMemo(() => controllerConfigFor('dunk'), []);
  const linkSink = useMemo(() => (bus ? toInputBus(bus) : null), [bus]);
  const onControllerInput = useCallback((ev: Parameters<ReturnType<typeof toInputBus>>[0]) => { linkSink?.(ev); }, [linkSink]);
  // a controller paired to the PHONE arrives already canonical — straight onto the hero stream, like a local pad
  const onPhonePad = useCallback((e: Parameters<InputBus['emit']>[0]) => { bus?.emit(e); }, [bus]);

  return (
    <div className="relative h-[calc(100dvh-3.25rem)] w-full overflow-hidden rounded-none border-0 bg-transparent" data-fel-slam={typeof hud.slamBeat === 'string' && hud.slamBeat ? hud.slamBeat : 'off'}>
      {/* data-fel-slam (above): where the flight is against the SLAM window ('cue' | 'open' | 'beat' | 'catch' | 'off'), mirrored
          from DunkMode's `slamBeat` so a harness can press ON the beat instead of on a stopwatch (CLOTHING-SOFT-RESIDUAL R2). */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

      {/* HUD bezel — judged contest scoreboard (M47) */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 px-4 py-3 font-mono text-xs">
        <div className="flex items-center gap-2">
          <span className="fel-panel fel-stat px-3 py-1 text-lg">
            {hnode(hud.score, 0)} <span className="text-white/50">vs</span> {hnode(hud.rivalScore, 0)}
          </span>
          {hud.round != null && (
            <span className="fel-panel px-2 py-1 text-[var(--fel-cyan)]">RD {hnode(hud.round)}</span>
          )}
          {hud.dunkNum != null && (
            <span className="fel-panel px-2 py-1 text-white/70">DUNK {hnode(hud.dunkNum)}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hud.prop != null && (
            <span className="fel-panel px-2 py-1 text-[var(--fel-purple)]">{hnode(hud.prop)}</span>
          )}
          {/* SEASON SPECIALS: the kangaroo, the sky tap, the board-top flip and the backboard run are the PRO lane's — named and locked, never missing */}
          {hud.specials === 'LOCKED' && (
            <span className="fel-panel px-2 py-1 font-mono text-[9px] tracking-wider text-amber-300/80">SPECIALS · SEASON PASS</span>
          )}
          {hud.style != null && (
            <span className="fel-panel px-2 py-1 text-[var(--fel-gold)]">{hnode(hud.style)}</span>
          )}
        </div>
      </div>

      {/* HYPE meter */}
      {phase === 'playing' && (
        <div className="pointer-events-none absolute right-4 top-14 flex flex-col items-end gap-1">
          <span className="font-mono text-[10px] text-[var(--fel-red)]">HYPE</span>
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/15">
            <div className="h-full bg-[var(--fel-red)] transition-[width] duration-300" style={{ width: `${Math.max(0, Math.min(100, hnum(hud.hype)))}%` }} />
          </div>
        </div>
      )}

      {/* Venice DualShock pad (2026-09-05): the charge METER is gone — the Benchmark feel bar calls a meter a hard
          fail ("meter slideshow"), and HOLD = RUN carries its own cue: the hold ring fills on the pad's RUN button. */}

      {/* SLAM! cue */}
      {hud.slamPulse === true && phase === 'playing' && (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 text-center">
          <span className="fel-heading text-4xl font-black text-[var(--fel-gold)] drop-shadow">SLAM!</span>
        </div>
      )}

      {/* Judge scorecard reveal — five cards held up in a row, as the panel
          actually does it. This was a vertical stack of name+score+voice-line
          rows, which worked for three judges and does not for five: the column
          grew straight down through the banner at top-[38%], which is exactly
          where a FIFTY! lands. Cards across, one voice line at a time, and a
          running total that climbs as they flip — the number everyone watches. */}
      {/* THE JUDGES' COLUMN — the cards, then how the dunk was actually landed.
          The timing verdict (review F1, 2026-09-14) and the judge cards were two separate absolutely-positioned
          blocks at top-[22%] and top-[20%], which is to say two things two percent apart on the same spot: caught on
          the verdict frame with "105 ms EARLY - EXECUTION 75%" showing through the gaps BETWEEN the judge chips,
          stray letters and all. Percent offsets cannot express "under" — a column can, so they share one now and the
          order is the order they are read in. */}
      {(Array.isArray(hud.judgeReveal) && (hud.judgeReveal as HudScoreCard[]).length > 0) ||
      (typeof hud.slamTiming === 'string' && hud.slamTiming && phase === 'playing') ? (
        <div className="pointer-events-none absolute inset-x-0 top-[20%] flex flex-col items-center gap-2">
          {Array.isArray(hud.judgeReveal) && (hud.judgeReveal as HudScoreCard[]).length > 0 && (
            <>
              <div className="flex items-end justify-center gap-1.5">
                {(hud.judgeReveal as HudScoreCard[]).map((j) => (
                  <div key={j.name} className="fel-panel flex flex-col items-center px-2.5 py-1">
                    <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--fel-cyan)]">{j.name}</span>
                    <span className="text-2xl font-black leading-none text-[var(--fel-gold)]">{j.score}</span>
                  </div>
                ))}
                <div className="fel-panel ml-1 flex flex-col items-center border-[var(--fel-gold)]/40 px-3 py-1">
                  <span className="font-mono text-[9px] uppercase tracking-wider text-white/50">total</span>
                  <span className="text-2xl font-black leading-none text-white">
                    {(hud.judgeReveal as HudScoreCard[]).reduce((s, j) => s + Number(j.score), 0)}
                  </span>
                </div>
              </div>
              {/* the card that just flipped gets to speak */}
              <span className="fel-panel max-w-[85%] truncate px-3 py-1 font-mono text-[11px] text-white/70">
                {(hud.judgeReveal as HudScoreCard[])[(hud.judgeReveal as HudScoreCard[]).length - 1].line}
              </span>
            </>
          )}
          {typeof hud.slamTiming === 'string' && hud.slamTiming && phase === 'playing' && (
            <div className="flex flex-col items-center gap-1">
              <span className="fel-panel px-3 py-1 font-mono text-[12px] tracking-wide text-[var(--fel-cyan)]">
                {hud.slamTiming}
              </span>
              {typeof hud.breakdown === 'string' && hud.breakdown ? (
                <span className="fel-panel px-2.5 py-0.5 font-mono text-[10px] text-white/60">{hud.breakdown}</span>
              ) : null}
              {/* JUDGE TRANSPARENCY (owner's pillars brief): the four reads behind the card, in words */}
              {typeof hud.judgeWhy === 'string' && hud.judgeWhy ? (
                <span className="fel-panel max-w-[92%] px-2.5 py-0.5 text-center font-mono text-[9px] leading-snug text-white/55">{hud.judgeWhy}</span>
              ) : null}
            </div>
          )}
        </div>
      ) : null}  {/* banner — DUNK-CAR-CLIP R2: while the dunker is in the air (hud.bannerHigh) it rides at the top of the frame. At 38% it
          sat exactly where both flight cameras put the rim, so "OVER THE CAR!" / "WINDMILL!" covered the ball going through the
          ring on every flush the eye filmed. It comes back down for the replay and the judges. */}
      {typeof hud.banner === 'string' && hud.banner && (
        <div className={`pointer-events-none absolute inset-x-0 ${hud.bannerHigh === true ? 'top-[13%]' : 'top-[38%]'} text-center`}>
          <span className="fel-heading fel-panel px-4 py-2 text-2xl font-bold text-[var(--fel-cyan)]">{hud.banner}</span>
        </div>
      )}

      {/* Venice DualShock pad: on phones (< 640 px) the hint plate sits above the pad column (the diamond stacks over the
          LOOK stick, ≈ 264 px); the clamp is a media switch in pure CSS — this project's Tailwind emits no max-* variants. */}
      {/* WHOSE TRACK IS PLAYING. The walk-out is audio first -- it plays whether or not this draws -- but a
          player should be able to see that the thing they authored in the Music Room is the thing coming
          out of the speakers. Phrased by walkOutLine so the wording lives in one place. */}
      {typeof hud.walkOutNow === 'string' && hud.walkOutNow && phase === 'playing' && (
        <div className="pointer-events-none absolute left-3 top-3">
          <span className="fel-panel px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-[var(--fel-cyan)]/80">
            {hud.walkOutNow}
          </span>
        </div>
      )}

      {typeof hud.hint === 'string' && hud.hint && phase === 'playing' && (
        <div className="pointer-events-none absolute inset-x-0 px-3 text-center" style={{ bottom: 'clamp(2.5rem, calc((640px - 100vw) * 999), 17.5rem)' }}>
          <span className="fel-panel px-3 py-1.5 font-mono text-[11px] text-white/80">{hud.hint}</span>
        </div>
      )}

      {/* NIGHT CARD (TRY-ONBOARD G1) — the end of a contest, held on the live court. This is
          deliberately NOT a modal over a dead canvas: the game is still running behind it, the
          camera is still on the dunker, and one button puts him back on the runway. It covers
          nothing at the bottom of the screen, where the touch pad lives. */}
      {card && (
        <div className="pointer-events-none absolute inset-x-0 top-[18%] flex flex-col items-center px-4 text-center">
          <div className="fel-panel pointer-events-auto w-full max-w-sm rounded-2xl px-6 py-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/45">
              Night {hnum(hud.nightNum) || 1} · Flight Night
            </p>
            <h2 className={`fel-heading mt-1 text-3xl font-black ${card === 'WON' ? 'text-[var(--fel-gold)]' : 'text-white'}`}>
              {card === 'WON' ? 'YOU TOOK THE CARD' : 'RIVAL TOOK THE CARD'}
            </h2>
            <p className="mt-2 font-mono text-sm text-white/70">
              YOU {hnode(hud.score, 0)} <span className="text-white/35">·</span> RIVAL {hnode(hud.rivalScore, 0)}
            </p>
            <p className="mt-1 font-mono text-[11px] text-white/45">
              {hnum(hud.nightMakes)} dunked · {hnum(hud.nightMisses)} missed
              {hnum(hud.nightBest) > 1 ? ` · best run ${hnum(hud.nightBest)}` : ''}
            </p>
            {/* WHO YOU WERE UP AGAINST. A roster means coming back is a different night; the card is where
                that becomes visible, because it is the screen a player actually reads. */}
            {typeof hud.rivalName === 'string' && hud.rivalName ? (
              <p className="mt-1 font-mono text-[10px] uppercase tracking-wide text-white/45">
                vs {hud.rivalName}
              </p>
            ) : null}
            {/* THE PASSION PIPELINE CREDENTIAL. Engagement, stated as engagement -- the label is phrased by
                musicCredential so no surface here can turn a play count into a rating or a gate. Absent
                when the athlete has no walk-out, rather than shown as a zero. */}
            {typeof hud.walkOut === 'string' && hud.walkOut ? (
              <p className="mt-2 font-mono text-[10px] uppercase tracking-wide text-[var(--fel-cyan)]/70">
                {hud.walkOut}
              </p>
            ) : null}
            <button
              onClick={tapGoAgain}
              disabled={!cardArmed}
              className={`mt-4 w-full rounded-xl bg-[var(--fel-cyan)] px-6 py-3 fel-heading text-lg font-bold text-black transition-all ${cardArmed ? 'opacity-100 hover:scale-[1.02]' : 'opacity-40'}`}
            >
              GO AGAIN
            </button>
            <p className="mt-2 font-mono text-[10px] text-white/35">or press any button</p>
            {cardSlot}
          </div>
        </div>
      )}

      {/* BootSplash: cartridge boot / venue art / progress / READY / 3-2-1 / error+retry */}
      <BootSplash
        modeId="dunk"
        title="FLIGHT NIGHT"
        phase={phase}
        detail={phase === 'error' ? (loadError ?? undefined) : (countdown ?? undefined)}
        onStart={tapStart}
        onRetry={tapStart}
      />

      {/* pause */}
      {phase === 'paused' && (
        <button onClick={tapStart} className="absolute inset-0 flex items-center justify-center bg-black/60">
          <span className="fel-heading text-3xl font-bold text-white">PAUSED — TAP TO RESUME</span>
        </button>
      )}

      {/* CONTROLLER-UNIVERSAL-MULTI: phones join as pads (lazy — no room until the badge is tapped), TV MODE lives in its
          panel, and every local controller gets a named chip (bottom-left: a connected pad hides the touch deck that lives there). */}
      {controllerConfig && bus && (
        <HostLobby config={controllerConfig} onInput={onControllerInput} onPadInput={onPhonePad} collapsed={phase === 'playing'} lazy anchor="left-4 top-14" bus={bus} />
      )}
      {bus && <PadChips bus={bus} className="left-4 bottom-4" />}

      {/* M35: THE single touch control surface — one overlay per mode, ever. */}
      {(phase === 'playing' || phase === 'countdown') && busRef.current && (
        <TouchOverlay bus={busRef.current} modeId="dunk" visible />
      )}
    </div>
  );
}


