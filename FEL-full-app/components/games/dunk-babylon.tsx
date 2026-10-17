'use client';

// FEL Babylon Dunk stage — the M22–M27 proof gate. This component is a THIN
// host: it owns the <canvas>, boots the shared Babylon harness with the dunk
// ModeDefinition, and bridges phase/HUD/result back into the existing
// GameShell pipeline (GameProps.onEnd → /api/sessions recap). All gameplay
// lives in lib/babylon/* cores; nothing game-specific is duplicated here.

import { readCourtLocation } from '@/lib/babylon/nexus/courtLocations';
import { courtArtSkin } from '@/lib/modes/art/apply-art-card';
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import type { GameProps, GameResult } from './game-shell';
import { BootSplash } from './boot-splash';
import { surfaceBootError } from './boot-error';
import { runMode, InputBus, type ModePhase, type SessionResult, type HudValue, type HudScoreCard } from '@/lib/babylon';
// FIRST-DUNK-BUDGET (2026-10-17): MODES.dunk from the registry's dunk entry alone (dunkRegistry.ts — the same definition object), not
// from registry.ts, which statically imports all 29 modes: the /try chunk carried every game's code (1,026 files against the dunk's
// own 505) and parsed it on the main thread before the first dunk.
import { MODES } from '@/lib/babylon/modes/dunkRegistry';
import { TouchOverlay } from '@/lib/babylon/ui/TouchOverlay';
import { PadChips } from '@/lib/babylon/ui/PadChips';
import { HostLobby } from '@/components/controller-link/host-lobby';
import { controllerConfigFor } from '@/lib/controller-link/schemas/registry';
import { toInputBus } from '@/lib/controller-link/modeBridge';
import { hnode, hnum } from './hud-format';
import { DunkPoster } from './dunk-poster';
import { DunkBeatStrip } from './dunk-beat-strip';
import { DunkFieldBoard } from './dunk-field-board';
import { decodeTakeoff, ZONE_HEX } from '@/lib/babylon/core/DunkTakeoffRead';
import { MicCaption, MicToggle } from './mic-caption';
import { HUD_PLATE, HUD_TEXT_ALPHA, HudBanner, HudChip, HudFrame, HudMeter, HudPlate, HudText, LINE_CLAMP_STYLE, ScoreValue, Scorebug, hudColor, hudType, type HudTone } from './tv-hud';
import { JudgeCards } from './judge-cards';
import type { HudPoster } from '@/lib/babylon/core/ModeHarness';

type Hud = Record<string, HudValue>;

/** Venice DualShock pad: on phones (< 640 px) the hint and the beat strip sit above the pad column (the diamond stacks over the LOOK
 *  stick, about 264 px); the clamp is a media switch in pure CSS — this project's Tailwind emits no max-* variants. */
const PAD_LIFT = 'clamp(2.5rem, calc((640px - 100vw) * 999), 17.5rem)';

/** A tappable chip (SKIP / RUN IT BACK / CHALLENGE): the plate, the label step and a tone, on a real button. */
const chipButtonStyle = (tone: HudTone) => ({
  ...hudType('label'), color: hudColor(tone), background: HUD_PLATE.background, border: HUD_PLATE.border,
  borderRadius: HUD_PLATE.radius, boxShadow: HUD_PLATE.shadow, letterSpacing: '0.12em', fontWeight: 800,
});

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
  /** FIRST-DUNK-BUDGET (2026-10-17): the host KNOWS the visitor is signed out (/try's guest shell), so the harness sends no
   *  read a guest is refused (HarnessOpts.guest). Absent everywhere else: not known, asked as before. */
  guest?: boolean;
}

export default function DunkBabylon({ onEnd, onCard, cardSlot, continuous = false, guest = false }: DunkBabylonProps) {
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
  const guestRef = useRef(guest);
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
        // HOTFIX (2026-09-24): the night's dunk card (SessionResult.detail) was dropped right here, so the arena submit never
        // had one to send — the other player never saw a card and the server never checked one against the score.
        ...(r.detail === undefined ? {} : { detail: r.detail }),
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
        applySkin: courtArtSkin,   // PIPELINES (2026-10-06): the player's court art card, a centre-court decal
        input: bus,
        continuous: continuousRef.current,
        guest: guestRef.current,
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
        .catch((e) => surfaceBootError(e, { disposed, label: '[FEL-DUNK] boot failed', setPhase, setLoadError }));
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

  // dunk-next phase 4: the SKIP chip on the rival's turn is a finger on B — the mode owns the skip (DunkMode.skipRivalDunk)
  const tapSkip = useCallback(() => {
    emit({ t: 'button', btn: 'B', pressed: true });
    emit({ t: 'button', btn: 'B', pressed: false });
  }, [emit]);

  // dunk-next phase 6: the CHALLENGE chip on the practice runway is a finger on L1 — the mode picks the next set piece (cycleChallenge)
  const tapChallenge = useCallback(() => {
    emit({ t: 'button', btn: 'L1', pressed: true });
    emit({ t: 'button', btn: 'L1', pressed: false });
  }, [emit]);

  // dunk-next phase 8: the RUN IT BACK chip on a retryable miss is a finger on A — the mode owns the retry and its rules (DunkMode.runItBack)
  const tapRunBack = useCallback(() => {
    emit({ t: 'button', btn: 'A', pressed: true });
    emit({ t: 'button', btn: 'A', pressed: false });
  }, [emit]);

  const tapStart = useCallback(() => {
    // READY gate + pause both advance on any button press.
    emit({ t: 'button', btn: 'START', pressed: true });
  }, [emit]);

  const judging = Array.isArray(hud.judgeReveal) && (hud.judgeReveal as HudScoreCard[]).length > 0;
  // the banner's text (none while the judges hold the screen), and whether it rides high (the dunker is in the air)
  const bannerText = !judging && typeof hud.banner === 'string' ? hud.banner : '';
  const bannerUp = bannerText !== '' && hud.bannerHigh === true;
  // the timing verdict: how the dunk was actually landed, under the judges' cards' slot
  const timing = !judging && typeof hud.slamTiming === 'string' && hud.slamTiming !== '' && phase === 'playing';

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

      {/* TV HUD (A9.13, lane/hud-hoops): the contest's readouts on the shared system — same keys, same gates, same handlers.
          The two corner columns flow (the scoreboard, then what hangs under it) instead of sitting at top-[9%] / top-[15%]:
          those offsets were a phone's proportions, and at the TV's zoom the scoreboard row is taller than 9 % of the screen,
          so the walk-out line, the SKIP / RUN IT BACK / CHALLENGE chip and the cut bug landed on top of it (measured). */}
      <HudFrame>
      {/* HUD bezel — judged contest scoreboard (M47) */}
      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 px-4 py-3">
        <div className="flex min-w-0 flex-col items-start gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Scorebug>
              <ScoreValue value={hnode(hud.score, 0)} size="stat" />
              <HudText size="label" alpha={HUD_TEXT_ALPHA.faint}>vs</HudText>
              <ScoreValue value={hnode(hud.rivalScore, 0)} size="stat" />
            </Scorebug>
            {hud.round != null && (
              <HudChip tone="you" size="body">{/^\d/.test(String(hud.round)) ? 'RD ' : ''}{hnode(hud.round)}</HudChip>
            )}
            {/* dunk-next phase 3: the dunk-off's own two cards — never added to the night's totals beside them */}
            {typeof hud.dunkOff === 'string' && hud.dunkOff && (
              <HudChip tone="score" size="body" style={{ fontWeight: 800 }}>{hud.dunkOff}</HudChip>
            )}
            {hud.dunkNum != null && (
              <HudChip alpha={0.7} size="body">DUNK {hnode(hud.dunkNum)}</HudChip>
            )}
          </div>
          {/* WHOSE TRACK IS PLAYING. The walk-out is audio first -- it plays whether or not this draws -- but a
              player should be able to see that the thing they authored in the Music Room is the thing coming
              out of the speakers. Phrased by walkOutLine so the wording lives in one place. */}
          {typeof hud.walkOutNow === 'string' && hud.walkOutNow && phase === 'playing' && (
            <HudChip tone="you" alpha={0.85} size="caption" className="uppercase">{hud.walkOutNow}</HudChip>
          )}
          {/* DUNK MOTION phase 12 — THE SHOW: the broadcast bug while the triple cut plays (a tap skips it), the announcer's lower third,
              and the poster of a big make, kept until the next attempt. */}
          {typeof hud.cut === 'string' && hud.cut && (
            <HudPlate as="span" className="inline-flex items-center gap-2 px-2.5 py-1">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full motion-reduce:animate-none" style={{ background: hudColor('danger') }} />
              <HudText size="caption" className="uppercase tracking-[0.16em]">{hud.cut}</HudText>
              <HudText size="caption" alpha={0.4}>· tap to skip</HudText>
            </HudPlate>
          )}
          {/* dunk-next phase 5: THE FIELD — four dunkers, the cut line, the final (core/DunkField); the night card shows the full board */}
          {typeof hud.field === 'string' && hud.field && phase === 'playing' && !card && !judging && (
            <div>
              <DunkFieldBoard value={hud.field} compact />
            </div>
          )}
        </div>
        <div className="flex max-w-[55%] flex-none flex-col items-end gap-1.5">
          <div className="flex flex-wrap items-center justify-end gap-2">
            {hud.prop != null && (
              <HudChip tone="power" size="body">{hnode(hud.prop)}</HudChip>
            )}
            {/* SEASON SPECIALS: the kangaroo, the sky tap, the board-top flip and the backboard run are the PRO lane's — named and locked, never missing */}
            {hud.specials === 'LOCKED' && (
              <HudChip tone="score" alpha={0.8} size="caption" style={{ fontWeight: 700 }}>SPECIALS · SEASON PASS</HudChip>
            )}
            {hud.style != null && (
              <HudChip tone="score" size="body">{hnode(hud.style)}</HudChip>
            )}
          </div>

          {/* dunk-next phase 4: SKIP the rival's dunk straight to his card (B on a pad, K on a keyboard, this chip on a phone) */}
          {hud.rivalSkip === true && phase === 'playing' && !card && (
            <button type="button" onClick={tapSkip} data-fel-dunk-skip
              className="pointer-events-auto inline-flex items-center gap-2 px-3 py-1.5 uppercase" style={chipButtonStyle('text')}>
              SKIP TO HIS CARD <span style={{ opacity: 0.45 }}>B ▸▸</span>
            </button>
          )}

          {/* dunk-next phase 8: RUN IT BACK on a retryable miss (A or RUN on a pad / keyboard, this chip on a phone) — the attempt is already spent */}
          {hud.runBack === true && phase === 'playing' && !card && (
            <button type="button" onClick={tapRunBack} data-fel-dunk-runback
              className="pointer-events-auto inline-flex items-center gap-2 px-3 py-1.5 uppercase" style={chipButtonStyle('you')}>
              RUN IT BACK <span style={{ opacity: 0.45 }}>A ▸</span>
            </button>
          )}

          {/* dunk-next phase 6: the practice runway's CHALLENGE — the set piece, its target and your best (L1 on a pad, Q on a keyboard, a tap here) */}
          {typeof hud.challenge === 'string' && hud.challenge && phase === 'playing' && !card && (
            <button type="button" onClick={tapChallenge} data-fel-dunk-challenge
              className="pointer-events-auto inline-flex items-center gap-2 px-3 py-1.5 uppercase" style={chipButtonStyle('score')}>
              {hud.challenge} <span style={{ opacity: 0.45 }}>L1 ▸</span>
            </button>
          )}

          {/* HYPE meter */}
          {phase === 'playing' && (
            <HudMeter className="items-end" label="HYPE" labelTone="danger" height="thin" width="6rem" value={Math.max(0, Math.min(100, hnum(hud.hype)))} max={100} tone="danger" />
          )}
          {/* THE MIC's switch hangs under the HYPE meter: at its own top-[18%] corner it sat on top of it at the TV's zoom (measured) */}
          {phase === 'playing' && <MicToggle flow />}
        </div>
      </div>

      {/* Venice DualShock pad (2026-09-05): the charge METER is gone — the Benchmark feel bar calls a meter a hard
          fail ("meter slideshow"), and HOLD = RUN carries its own cue: the hold ring fills on the pad's RUN button. */}

      {/* SLAM! cue (WAVE 3: 43 % of the stage, up from 50 %: the bottom column's top now stands where the MC caption and the call did) */}
      {hud.slamPulse === true && phase === 'playing' && (
        <div className="absolute inset-x-0 top-[43%] text-center">
          <HudText size="hero" tone="score">SLAM!</HudText>
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
      {(judging || timing || bannerUp) ? (
        <div className={`absolute inset-x-0 ${bannerUp ? 'top-[13%]' : 'top-[20%]'} flex flex-col items-center gap-2`}>
          {/* banner — DUNK-CAR-CLIP R2: while the dunker is in the air (hud.bannerHigh) it rides at the top of the frame. At 38% it
              sat exactly where both flight cameras put the rim, so "OVER THE CAR!" / "WINDMILL!" covered the ball going through the
              ring on every flush the eye filmed. It comes back down for the replay and the judges. It heads this column while it is
              up, so the timing verdict under it can never sit on top of it. */}
          {bannerUp && <HudBanner flow text={bannerText} tone="you" size="score" />}
          {judging && <JudgeCards cards={hud.judgeReveal as HudScoreCard[]} />}
          {timing && (
            <div className="flex flex-col items-center gap-1">
              <HudChip tone="you" size="body">{String(hud.slamTiming)}</HudChip>
              {typeof hud.breakdown === 'string' && hud.breakdown ? (
                <HudChip size="caption" alpha={0.6}>{hud.breakdown}</HudChip>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
      {!judging && !bannerUp && <HudBanner text={bannerText} tone="you" size="score" className="top-[38%]" />}

      {hud.poster && typeof hud.poster === 'object' && !Array.isArray(hud.poster) && phase === 'playing' && (
        <DunkPoster poster={hud.poster as HudPoster} onClose={() => setHud((h) => ({ ...h, poster: null }))} />
      )}

      {/* Venice DualShock pad: on phones (< 640 px) the hint plate sits above the pad column (the diamond stacks over the
          LOOK stick, ≈ 264 px); the clamp is a media switch in pure CSS — this project's Tailwind emits no max-* variants. */}

      {/* WAVE 3 (lane/w3-present): THE BOTTOM STACK. The hint, the take-off read, the beat strip and the MC's lower third were four absolutely
          placed layers (the hint at PAD_LIFT, the take-off chip and the strip 2.6 rem above it, the caption at 14 % of the stage), and at the
          TV's zoom the caption sat across the chip, the strip and the hint (measured at 1080p: 12-18 kpx of overlap each). They are ONE
          column now, in the order they are read, so no size or zoom can make one cross another: it grows UP from the hint's slot, and the
          caption is its top.
            hint        (lowest: the controls line)
            take-off    on the run: the foot and where he would leave the floor going up NOW, in the judges' own words and the floor mark's
                        colour (the stripe gold, the elbow cyan, the paint white); the beat strip takes this spot in the air
            beat strip  RISE · HANG · PRE · SLAM, the tricks under their beats, PERFECT FLIGHT; stands aside for the triple cut and the judges
            MC          what the court's MC just said
            call        the judges' call on the dunk ("FROM THE STRIPE!"), the top of the column */}
      {(() => {
        const t = decodeTakeoff(hud.takeoff);
        const beats = typeof hud.beats === 'string' && hud.beats ? hud.beats : '';
        const cutting = typeof hud.cut === 'string' && hud.cut;
        const hint = typeof hud.hint === 'string' && hud.hint && phase === 'playing' ? hud.hint : '';
        const takeoff = t && phase === 'playing' && !judging && !beats ? t : null;
        const strip = beats && phase === 'playing' && !judging && !cutting ? beats : '';
        const mic = phase === 'playing' && !judging && typeof hud.mic === 'string' && hud.mic ? hud.mic : '';
        const call = !judging && hud.slamPulse !== true && typeof hud.call === 'string' && hud.call && phase === 'playing' ? hud.call : '';   // (the call yields to the SLAM! cue: the QTE window is the one thing on screen then)
        if (!hint && !takeoff && !strip && !mic && !call) return null;
        return (
          <div data-dunk-bottom className="pointer-events-none absolute inset-x-0 flex flex-col-reverse items-center gap-[0.35rem] px-3" style={{ bottom: PAD_LIFT }}>
            {hint && (
              <div className="w-full text-center">
                <HudPlate as="span" className="inline-block max-w-[min(92%,980px)] px-3 py-1.5">
                  <HudText as="div" size="body" alpha={0.8} style={LINE_CLAMP_STYLE}>{hint}</HudText>
                </HudPlate>
              </div>
            )}
            {takeoff && (
              <HudPlate as="span" className="inline-flex items-center px-3 py-1">
                <HudText size="label" className="inline-flex items-baseline gap-2 uppercase" style={{ fontWeight: 800 }}>
                  <span style={{ opacity: 0.45 }}>TAKE-OFF</span><span style={{ color: ZONE_HEX[takeoff.zone] }} data-fel-takeoff={takeoff.zone}>{takeoff.chip}</span>
                </HudText>
              </HudPlate>
            )}
            {strip && <DunkBeatStrip value={strip} />}
            {mic && <MicCaption flow text={hud.mic} who={hud.micWho} />}
            {/* the call ("FROM THE STRIPE!") was a layer of its own at 58 % of the stage, and the caption now stands where it was */}
            {call && (
              <div className="w-full px-4 text-center">
                <HudPlate as="span" className="inline-block px-3 py-1"><HudText size="value" tone="score" className="uppercase italic">{call}</HudText></HudPlate>
              </div>
            )}
          </div>
        );
      })()}

      {/* NIGHT CARD (TRY-ONBOARD G1) — the end of a contest, held on the live court. This is
          deliberately NOT a modal over a dead canvas: the game is still running behind it, the
          camera is still on the dunker, and one button puts him back on the runway. It covers
          nothing at the bottom of the screen, where the touch pad lives. */}
      {card && (
        <div className="absolute inset-x-0 top-[18%] flex flex-col items-center px-4 text-center landscape:top-[15%]">
          {/* upright it is one column, as it was; on a sideways screen (a TV, a phone on its side) the same card is two columns, because
              the one-column card ran off the bottom of the screen and took GO AGAIN with it (measured at 1920x1080 and 844x390) */}
          <HudPlate className="pointer-events-auto w-full max-w-sm px-6 py-5 landscape:max-w-[34rem] landscape:py-4" style={{ borderRadius: 16 }}>
          <div className="landscape:grid landscape:grid-cols-2 landscape:items-center landscape:gap-x-6">
          <div>
            <HudText as="div" size="caption" alpha={0.45} className="uppercase tracking-[0.2em]">
              Night {hnum(hud.nightNum) || 1} · Flight Night
            </HudText>
            <HudText as="div" size="banner" tone={card === 'WON' ? 'score' : 'text'} className="mt-1 uppercase" style={{ fontWeight: 800 }}>
              {card === 'WON' ? 'YOU TOOK THE CARD' : typeof hud.nightField === 'string' && hud.nightField.startsWith('CUT') ? 'CUT AT THE LINE' : 'RIVAL TOOK THE CARD'}
            </HudText>
            {/* dunk-next phase 5: how the field went — the champion, the final, or where the cut fell */}
            {typeof hud.nightField === 'string' && hud.nightField ? (
              <HudText as="div" size="label" tone="score" className="mt-1 uppercase">{hud.nightField}</HudText>
            ) : null}
            <HudText as="div" size="value" alpha={0.7} className="mt-2">
              YOU {hnode(hud.score, 0)} <span style={{ opacity: 0.5 }}>·</span> RIVAL {hnode(hud.rivalScore, 0)}
            </HudText>
            {typeof hud.nightDunkOff === 'string' && hud.nightDunkOff ? (
              <HudText as="div" size="label" tone="score" className="mt-1 uppercase">{hud.nightDunkOff}</HudText>
            ) : null}
            {typeof hud.field === 'string' && hud.field ? <div className="mt-2 text-left"><DunkFieldBoard value={hud.field} /></div> : null}
          </div>
          <div>
            {/* dunk-next phase 6: what a won night just opened on this device, or the next thing to chase */}
            {typeof hud.nightUnlock === 'string' && hud.nightUnlock ? (
              <HudText as="div" size="caption" tone={hud.nightUnlock.startsWith('UNLOCKED') ? 'score' : 'text'} alpha={hud.nightUnlock.startsWith('UNLOCKED') ? 1 : 0.55} className="mt-2 uppercase" style={{ fontWeight: 800 }}>{hud.nightUnlock}</HudText>
            ) : null}
            <HudText as="div" size="label" alpha={0.55} className="mt-1">
              {hnum(hud.nightMakes)} dunked · {hnum(hud.nightMisses)} missed
              {hnum(hud.nightBest) > 1 ? ` · best run ${hnum(hud.nightBest)}` : ''}
            </HudText>
            {/* WHO YOU WERE UP AGAINST. A roster means coming back is a different night; the card is where
                that becomes visible, because it is the screen a player actually reads. */}
            {typeof hud.rivalName === 'string' && hud.rivalName ? (
              <HudText as="div" size="caption" alpha={0.55} className="mt-1 uppercase">
                vs {hud.rivalName}
              </HudText>
            ) : null}
            {/* THE PASSION PIPELINE CREDENTIAL. Engagement, stated as engagement -- the label is phrased by
                musicCredential so no surface here can turn a play count into a rating or a gate. Absent
                when the athlete has no walk-out, rather than shown as a zero. */}
            {typeof hud.walkOut === 'string' && hud.walkOut ? (
              <HudText as="div" size="caption" tone="you" alpha={0.7} className="mt-2 uppercase">
                {hud.walkOut}
              </HudText>
            ) : null}
            <button
              onClick={tapGoAgain}
              disabled={!cardArmed}
              className={`mt-4 w-full px-6 py-3 transition-all ${cardArmed ? 'opacity-100 hover:scale-[1.02]' : 'opacity-40'}`}
              style={{ ...hudType('stat'), background: hudColor('you'), color: hudColor('ink'), borderRadius: 12, fontWeight: 800 }}
            >
              GO AGAIN
            </button>
            <HudText as="div" size="caption" alpha={0.5} className="mt-2">or press any button</HudText>
            {cardSlot}
          </div>
          </div>
          </HudPlate>
        </div>
      )}
      </HudFrame>

      {/* BootSplash: cartridge boot / venue art / progress / READY / 3-2-1 / error+retry / PAUSED */}
      <BootSplash
        modeId="dunk"
        title="FLIGHT NIGHT"
        phase={phase}
        detail={phase === 'error' ? (loadError ?? undefined) : (countdown ?? undefined)}
        onStart={tapStart}
        onRetry={tapStart}
      />

      {/* CONTROLLER-UNIVERSAL-MULTI: phones join as pads (lazy — no room until the badge is tapped), TV MODE lives in its
          panel, and every local controller gets a named chip (bottom-left: a connected pad hides the touch deck that lives there). */}
      {controllerConfig && bus && (
        <HostLobby config={controllerConfig} onInput={onControllerInput} onPadInput={onPhonePad} collapsed={phase === 'playing'} lazy={process.env.NODE_ENV === 'production'} anchor="left-4 top-14" bus={bus} />
      )}
      {bus && <PadChips bus={bus} className="left-4 bottom-4" />}

      {/* M35: THE single touch control surface — one overlay per mode, ever. */}
      {(phase === 'playing' || phase === 'countdown') && busRef.current && (
        <TouchOverlay bus={busRef.current} modeId="dunk" visible />
      )}
    </div>
  );
}


