'use client';

// FEL Babylon timing-sports host (M22–M27 rollout wave 3). ONE thin host powers
// tennis, home-run derby, penalty shootout, and golf — exactly mirroring the
// single shared makeTimingSportMode core (never forked). makeTimingHost(modeKey)
// returns a GameShell-compatible component so each route stays a 1-line skin.
// All gameplay lives in lib/babylon/* — nothing is duplicated here.

import { useEffect, useRef, useState, useCallback } from 'react';
import type { GameProps, GameResult } from './game-shell';
import { useBabylonPlaytestBridge } from './use-babylon-playtest-bridge';
import { BootSplash } from './boot-splash';
import { TimingPrompt } from './timing-prompt';
import { LANE_PLATE_ALPHA, PASSED_CUE_OPACITY, hitRingStyle } from './cue-lane-style';
import { surfaceBootError } from './boot-error';
import { runMode, InputBus, type ModePhase, type SessionResult, type HudValue } from '@/lib/babylon';
import type { ModeDefinition } from '@/lib/babylon/core/ModeHarness';
import { MODES } from '@/lib/babylon/modes/registry';
import { baseballHeadline } from '@/lib/babylon/modes/baseballGame';   // BASEBALL-3INN: the card line read off the posted score
import { TouchOverlay } from '@/lib/babylon/ui/TouchOverlay';
import { hnode } from './hud-format';
import {
  HUD_TEXT_ALPHA, HudBanner, HudChip, HudFrame, HudMeter, HudPlate, HudText, ScoreCell, ScoreDivider, ScoreValue, Scorebug, hudColor, hudType, HudLowerThird } from './tv-hud';
import { timingMaxCombo } from './timing-combo';
import { timingGameResult } from '@/lib/sessions/gameResultFromSession';
import { CUE_LOOKAHEAD_SEC, CUE_LINGER_SEC, type HudCue } from '@/lib/babylon/core/danceTracks';
import { ACCURACY_CENTER as GOLF_ACC_CENTER, ACCURACY_HALF as GOLF_ACC_HALF } from '@/lib/babylon/core/golfHud';
import { breakawayLine } from '@/lib/babylon/core/penaltyHud';   // IMPROVE (2026-10-06, Penalty #12)
// MUSIC-SUITE P7 (2026-09-29), room-mix-ux: the Cypher's instrument chips (replacing the MIX bar) and its paused-
// screen MIX sliders. Dance-only — gated below on hud.instruments / modeKey==='dance', so every other timing sport
// this host also drives (tennis, derby, penalty, golf, volleyball) renders exactly as before.
import { decodeInstrumentChips } from '@/lib/babylon/dance/ui/InstrumentChips';
import { VolumeMixer } from '@/lib/audio/ui/VolumeMixer';
// MUSIC-SUITE P8 (2026-09-25): Stoop's caption — the same shared caption layer THE MIC's hoops modes already draw
// with (mic-caption.tsx's <MicCaption>, reading hud.mic/hud.micWho); DanceMode.ts is the only mode this host also
// drives that ever sets those two fields, so gating on modeKey === 'dance' is a formality (MicCaption already
// renders nothing for an empty `text`), kept for the same reason every other dance-only block here is gated.
import { MicCaption } from './mic-caption';
// IMPROVE (2026-10-06, the Cypher's #8): GO AGAIN in place for dance — the room runs `continuous` (its finish reports a
// card and the stage stays up) and the shell's REPLAY goes back to its pick screen (DanceMode.replayDance) instead of
// rebooting the engine. Dance only: every other timing sport this host drives ends and remounts exactly as before.
import { useReplayInPlace } from './replay-in-place';
import { replayDance } from '@/lib/babylon/modes/DanceMode';
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
  /** One-line control hint shown on the CONTROLS panel (READY and pause) when the mode writes none of its own. */
  hint: string;
  /** Label on the big swing button (e.g. SWING / STRIKE / KICK). */
  swingLabel: string;
  /** Log tag for boot errors. */
  tag: string;
  /** BASEBALL-3INN (2026-10-22): a definition mounted outside the registry (BaseballInningsMode at /play/baseball — see its
   *  header for why it is not a registry key yet). Omitted, the host mounts MODES[modeKey] as every other route does. */
  def?: ModeDefinition;
}

/** Build a GameShell-compatible timing host bound to a specific registry mode. */
export function makeTimingHost(opts: TimingHostOpts) {
  const { modeKey, tag } = opts;

  function TimingBabylon({ onEnd }: GameProps) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const busRef = useRef<InputBus | null>(null);
    const endedRef = useRef(false);
    const onEndRef = useRef(onEnd);
    onEndRef.current = onEnd;
    const [phase, setPhase] = useState<ModePhase>('loading');
    const [countdown, setCountdown] = useState<number | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [hud, setHud] = useState<Hud>({});
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
        // net/precision pass phase 10: the card reads the MODE's line. `won` used to be `outcome === 'GREAT'` and the headline
        // `hits/rounds CLEAN` — an outcome and stats none of these five modes send — so no run here was ever a win.
        const st = r.stats ?? {};
        const n = (k: string, d = 0) => Number(st[k] ?? d);
        const base = timingGameResult(r, { headline: '', modeKey });
        const won = base.won;
        const headline = modeKey === 'tennis' ? `${won ? 'MATCH WON' : 'MATCH LOST'} · ${r.score} GAMES · ${n('style')} STYLE${st.rackets !== undefined ? ` · ${n('rackets')} RACKETS LEFT` : ''}`
          // TENNIS-TIEBREAK-FOLD: the Tennis tiebreak variant — points, both sides
          : modeKey === 'tiebreak' ? `${won ? 'TIEBREAK WON' : 'TIEBREAK LOST'} · ${r.score}–${n('theirs')} · ${n('style')} STYLE`
          : modeKey === 'volleyball' ? `${won ? 'SET WON' : 'SET LOST'} · ${r.score} PTS · ${n('style')} STYLE`
          : modeKey === 'golf' ? `${won ? 'CARD IN — UNDER PAR' : 'CARD IN'} · ${n('overPar') > 0 ? '+' : ''}${n('overPar')} · ${n('holes')} HOLES · ${n('pickUps')} PICK-UPS`
          // IMPROVE (2026-10-06, Derby #2): the derby ends WIN / LOSS against the rival's round (the mode's `beatRival`); the
          // posted `won` (timingWon: three homers, the Story's Diamond goal) is unchanged
          // BASEBALL-3INN: three innings, the runs ARE the posted score (baseballGame.baseballHeadline reads r.score)
          : modeKey === 'baseball' ? baseballHeadline(r)
          : modeKey === 'derby' ? `${st.beatRival !== undefined ? (n('beatRival') ? 'BEAT THE RIVAL' : 'RIVAL TAKES IT') : won ? 'DERBY CHAMPION' : 'DERBY OVER'} · ${n('homers')}–${n('rivalHomers')} HR · ${n('outs')} OUTS · ${Math.round(n('longestFt'))} FT`
          // IMPROVE (2026-10-06, Penalty #12): and the breakaway's tricks, when there were any (penaltyHud.breakawayLine)
          : modeKey === 'penalty' ? `${won ? 'SHOOTOUT WON' : 'SHOOTOUT LOST'} · ${n('goals')}–${n('themGoals')} · ${n('stylePts')} STYLE${breakawayLine(st) ? ` · ${breakawayLine(st)}` : ''}`
          // IMPROVE (2026-10-06): the Cypher's card names a full combo (#6) and the run's STYLE (#10 / #13)
          : modeKey === 'dance' && n('rounds') ? `${n('fullCombo') ? 'FULL COMBO · ' : ''}${n('hits')}/${n('rounds')} CLEAN · ${r.score} PTS${n('style') ? ` · ${n('style')} STYLE` : ''}`
          : (n('rounds') ? `${n('hits')}/${n('rounds')} CLEAN · ${r.score} PTS` : `${r.score} PTS`);
        onEndRef.current({ ...base, headline, maxCombo: timingMaxCombo(st) });
      };

      const def = opts.def ?? MODES[modeKey];
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
          // IMPROVE (#8): dance reports through card() and keeps its stage for REPLAY; the same sink takes either
          ...(modeKey === 'dance' ? { continuous: true, cardSink: resultSink } : {}),
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

    // IMPROVE (#8): REPLAY on the shell's end card goes back to the Cypher's pick screen on this stage. Any other mode's
    // restart answers false, which is the shell's "remount as before".
    const restart = useCallback((): boolean => {
      const ok = modeKey === 'dance' && replayDance();
      if (ok) endedRef.current = false;
      return ok;
    }, []);
    useReplayInPlace(restart);

    const tapStart = useCallback(() => {
      emit({ t: 'button', btn: 'START', pressed: true });
    }, [emit]);

    const flow = typeof hud.flow === 'number' ? Number(hud.flow) : -1;
    const clock = typeof hud.clock === 'number' ? Number(hud.clock) : 0;
    return (
      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-white/10 bg-black">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

        {/* TV HUD (A9.13, lane/tv-hud): every readout below is drawn with the shared system (components/games/tv-hud) —
            one palette, the 10-foot type scale, the display face for numbers, framer-motion calls — in the same slots,
            from the same keys, gated exactly as before. */}
        <HudFrame>
        {/* HUD bezel */}
        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 px-4 py-3">
          {/* M42 E20: render the mode's own round label as-is (RD/SHOT/KICK/PITCH) — no dup prefix */}
          <HudChip tone="you" size="value">{hnode(hud.round, '—')}</HudChip>
          {/* BREAKAWAY (owner brief 2026-09-18): the shot clock and the FLOW gauge (wall runs, rebounds, slides, a fast dribble) that sets the shot's power */}
          {typeof hud.clock === 'number' && clock > 0 && <HudChip tone={clock <= 3 ? 'danger' : 'text'} size="value">⏱ {hud.clock}s</HudChip>}
          {typeof hud.flow === 'number' && flow >= 0 && (
            <HudPlate as="span" className="flex items-center px-[0.75em] py-[0.3em]">
              <HudMeter layout="inline" label="FLOW" value={flow} max={100} tone={flow >= 70 ? 'score' : 'you'} fillAlpha={flow >= 70 ? 1 : 0.8} width="5rem"
                status={typeof hud.kinetic === 'string' && hud.kinetic ? hud.kinetic : undefined} statusTone="score" />
            </HudPlate>
          )}
          {/* IMPROVE (2026-10-06): volleyball's block cooldown as a ready chip — it only showed as a refusal after the press. Key-gated. */}
          {typeof hud.blockReady === 'string' && hud.blockReady && (
            <HudChip tone={hud.blockReady === 'READY' ? 'good' : 'text'} alpha={hud.blockReady === 'READY' ? 1 : HUD_TEXT_ALPHA.faint} glow={hud.blockReady === 'READY'}>B BLOCK {hud.blockReady}</HudChip>
          )}
          {/* M42 E20: numeric score gets " PTS"; string scores (e.g. "2 GOALS") render as-is */}
          <Scorebug>
            {typeof hud.score === 'number'
              ? <ScoreCell inline value={hud.score} size="stat" label={null} />
              : <ScoreValue value={hnode(hud.score, '0 PTS')} size="value" pop={false} />}
            {typeof hud.score === 'number' && <HudText size="caption" alpha={HUD_TEXT_ALPHA.muted}>PTS</HudText>}
          </Scorebug>
          {/* combo — the rhythm family's core readout (The Cypher publishes it
              every judgement; the bezel never drew it) */}
          {typeof hud.combo === 'number' && hud.combo >= 2 && (
            <HudChip tone="score" size="value"><ScoreValue value={`×${hud.combo}`} size="value" tone="score" /></HudChip>
          )}
          {/* the beat, visible: pops at each step, fades through the bar */}
          {typeof hud.beatPulse === 'number' && (
            <span
              className="mt-1.5 inline-block h-3 w-3 rounded-full"
              style={{ background: hudColor('score'), opacity: 0.25 + hud.beatPulse * 0.75, transform: `scale(${0.7 + hud.beatPulse * 0.45})` }}
            />
          )}
        </div>

        {/* THE ENERGY LAYER. A gauge you cannot see is not a gauge, and rackets
            you cannot count are not a threat — this is the second time in this
            family that a mode published state the bezel dropped on the floor.
            Rendered only when the mode publishes it, so the modes without an
            energy economy are unchanged. */}
        {hud.energy != null && (
          <div className="absolute left-4 top-14 flex flex-col gap-1">
            <HudMeter label={typeof hud.energyLabel === 'string' ? hud.energyLabel : 'ENERGY'} labelTone="score" value={Number(hud.energy)} max={100}
              tone={Number(hud.energy) >= 100 ? 'score' : 'you'} glow={Number(hud.energy) >= 100} width="7rem" />
            {typeof hud.rackets === 'string' && (
              <HudText size="caption" alpha={HUD_TEXT_ALPHA.muted}>
                RACKETS {hud.rackets}
                {typeof hud.foeRackets === 'string' && (
                  <HudText size="caption" alpha={HUD_TEXT_ALPHA.faint}> · THEM {hud.foeRackets}</HudText>
                )}
              </HudText>
            )}
          </div>
        )}

        {/* MUSIC-SUITE P7 (2026-09-29), room-mix-ux: THE INSTRUMENT CHIPS — replaces the one MIX bar above for the
            Cypher only (DanceMode.ts stopped publishing hud.energy/energyLabel; every other timing sport is
            untouched by this block). One chip per instrument the CURRENT SONG calls for: gold + filled once earned,
            dim while ducked, and marked FEL when the chart has no move in that category this run (contract (a)'s
            "FEL's band filling missing parts" — the fill itself is a separate, bigger task; this only has to be able
            to SHOW that state the day it lands). Sits where the MIX bar sat (left-4 top-14), well clear of the cue
            lane below at bottom-[34%] — the HUD area movement play's P9 body cue lane needs stays free. */}
        {typeof hud.instruments === 'string' && hud.instruments && (
          <div className="absolute left-4 top-14 flex max-w-[220px] flex-wrap gap-1.5">
            {decodeInstrumentChips(hud.instruments).map((c) => (
              <HudChip
                key={c.id}
                plate={c.state !== 'earned'}
                fill={c.state === 'earned' ? 1 : undefined}
                tone={c.state === 'earned' ? 'score' : 'text'}
                className="rounded-full transition-colors duration-200"
                style={c.state === 'fel' ? { background: 'transparent', boxShadow: 'none', border: `1px solid ${hudColor('text', 0.2)}` } : undefined}
              >
                <HudText size="caption" tone={c.state === 'earned' ? 'ink' : 'text'} alpha={c.state === 'earned' ? 1 : c.state === 'fel' ? 0.5 : HUD_TEXT_ALPHA.faint} style={{ fontWeight: 800, textShadow: 'none' }}>
                  {c.label}{c.state === 'fel' ? ' · FEL' : ''}
                </HudText>
              </HudChip>
            ))}
          </div>
        )}

        {/* GOLF (A+ mission #5, Everybody's Golf read + Wii size) — every block is key-gated, so the other timing sports
            are unchanged: the lie panel (club · pin · wind with a bearing arrow), the hole chip, the drawn three-press
            swing meter (the band from the mode's own constants), and the scorecard between holes. */}
        {typeof hud.club === 'string' && hud.club && (
          <div className="absolute right-4 top-14 flex flex-col items-end gap-1">
            <HudPlate className="px-3 py-1.5 text-right">
              <HudText as="div" size="stat">{hud.club}</HudText>
              <HudText as="div" size="label" alpha={HUD_TEXT_ALPHA.muted}>PIN {hnode(hud.pin, '—')}{typeof hud.aimCarry === 'number' ? <span> · FULL SWING {hud.aimCarry}m</span> : null}</HudText>
            </HudPlate>
            {typeof hud.weather === 'string' && hud.weather && (
              <HudChip alpha={0.85}>{hud.weather}</HudChip>
            )}
            <HudPlate className="flex items-center gap-2 px-3 py-1.5">
              <span
                className="inline-block leading-none"
                style={{ ...hudType('stat'), color: hudColor('you'), transform: `rotate(${typeof hud.windDeg === 'number' ? hud.windDeg : 0}deg)` }}
              >↑</span>
              <HudText size="label" alpha={0.85}>WIND {hnode(hud.wind, '—')}{typeof hud.windWord === 'string' && hud.windWord ? ` · ${hud.windWord}` : ''}</HudText>
            </HudPlate>
            {/* PARKOUR GOLF (owner brief 2026-09-18): the launch pad, the flicks left in the air, the rings taken this hole */}
            {(typeof hud.flicks === 'number' || (typeof hud.pad === 'string' && hud.pad) || typeof hud.rings === 'number') && (
              <HudPlate className="flex items-center gap-2 px-3 py-1">
                {typeof hud.pad === 'string' && hud.pad ? <HudChip plate={false} fill={0.25} tone="score" className="rounded">{hud.pad}</HudChip> : null}
                {typeof hud.flicks === 'number' ? <HudText size="label" alpha={0.85}>FLICKS {'◆'.repeat(Math.max(0, Number(hud.flicks)))}{'◇'.repeat(Math.max(0, 2 - Number(hud.flicks)))}</HudText> : null}
                {typeof hud.rings === 'number' ? <HudText size="label" tone="info">RINGS {hud.rings}/2</HudText> : null}
              </HudPlate>
            )}
          </div>
        )}
        {typeof hud.hole === 'number' && (
          <div className="absolute inset-x-0 top-12 flex justify-center">
            <Scorebug>
              <HudText size="body" alpha={0.85}>HOLE {hud.hole}{typeof hud.holes === 'number' ? ` / ${hud.holes}` : ''}</HudText>
              <ScoreDivider />
              <HudText size="body" alpha={0.85}>PAR {hnode(hud.par, '—')}</HudText>
              <ScoreDivider />
              <HudText size="body" alpha={0.85}>STROKE {hnode(hud.strokes, 0)}</HudText>
              <ScoreDivider />
              <ScoreValue value={hnode(hud.card, 'E')} size="value" tone="score" />
            </Scorebug>
          </div>
        )}
        {typeof hud.meterT === 'number' && (
          <div className="absolute inset-x-0 bottom-28 flex flex-col items-center gap-1">
            <HudChip tone={hud.swingPhase === 'accuracy' ? 'score' : 'you'}>
              {hud.swingPhase === 'accuracy' ? 'ACCURACY — strike in the band' : 'POWER — press at the top'}
            </HudChip>
            {/* GOLF UPGRADE (Wii Sports meter): LINES every tenth, taller at the quarters, with the CARRY each tenth buys
                written above them, and the carry at the marker under it — the player gauges "70 %" as "43 m". */}
            <HudMeter
              className="mt-4"
              height="swing"
              width="min(520px, 70vw)"
              framed
              round
              segments={[{ from: GOLF_ACC_CENTER - GOLF_ACC_HALF, to: GOLF_ACC_CENTER + GOLF_ACC_HALF, tone: 'score', alpha: 0.7 }]}
              ticks={Array.from({ length: 11 }, (_, i) => {
                const c = ticksOf(hud.meterTicks)[i];
                return { at: i / 10, major: i % 5 === 0, label: (i === 2 || i === 5 || i === 8 || i === 10) && c !== undefined ? `${c}m` : undefined };
              })}
              markers={[
                ...(typeof hud.powerLock === 'number' ? [{ at: hud.powerLock / 100, tone: 'you' as const, width: 3 }] : []),
                { at: hud.meterT, tone: 'text' as const, width: 4, glow: true },
                ...(typeof hud.meterCarry === 'number' ? [{
                  at: hud.swingPhase === 'accuracy' && typeof hud.powerLock === 'number' ? hud.powerLock / 100 : hud.meterT,
                  width: 0, label: `${hud.meterCarry} m`, labelTone: 'you' as const,
                }] : []),
              ]}
            />
          </div>
        )}
        {isBoard(hud.board) && typeof hud.boardTitle === 'string' && hud.boardTitle && (
          <div className="absolute inset-0 flex items-center justify-center px-4">
            <HudPlate className="w-full max-w-[440px] px-5 py-4">
              <HudText as="div" size="score">SCORECARD</HudText>
              <div className="mt-3 grid gap-1.5">
                {hud.board.map((r) => (
                  <div key={r.name} className="flex items-center justify-between gap-3 rounded-lg px-3 py-1.5" style={{ background: r.name === 'CARD' ? hudColor('score', 0.15) : 'rgba(0, 0, 0, 0.4)' }}>
                    <HudText size="value" alpha={0.9}>{r.name}</HudText>
                    <HudText size="label" alpha={HUD_TEXT_ALPHA.faint} className="truncate">{r.line}</HudText>
                    <ScoreValue value={r.score} size="stat" pop={false} />
                  </div>
                ))}
              </div>
              <HudText as="div" size="label" tone="score" className="mt-3">{hud.boardTitle}</HudText>
            </HudPlate>
          </div>
        )}

        {/* DERBY (A+ mission #7, MLB Home Run Derby presentation): homers · outs · longest, the rival's total ticking, the
            pitch label, and the distance flash on a homer. Key-gated on `outs`. */}
        {typeof hud.outs === 'number' && (
          <div className="absolute inset-x-0 top-12 flex flex-col items-center gap-1.5">
            <Scorebug>
              <ScoreCell inline label="HR" labelTone="you" value={hnode(hud.homers, 0)} />
              <ScoreDivider />
              <span className="inline-flex items-baseline gap-[0.35em]">
                <HudText size="caption" alpha={HUD_TEXT_ALPHA.muted}>OUTS</HudText>
                <ScoreValue value={hnode(hud.outs, 0)} tone={Number(hud.outs) >= Number(hud.outsCap ?? 10) - 1 ? 'danger' : 'text'} />
                <HudText size="value" alpha={HUD_TEXT_ALPHA.faint}>/{hnode(hud.outsCap, 10)}</HudText>
              </span>
              {Number(hud.longest) > 0 && <HudChip plate={false} tone="score" className="ml-2 rounded" style={{ background: 'rgba(0, 0, 0, 0.4)' }}>LONGEST {hnode(hud.longest, 0)} FT</HudChip>}
              <span className="ml-2 inline-flex items-baseline gap-[0.35em]">
                <HudText size="caption" tone="them">RIVAL</HudText>
                <ScoreValue value={hnode(hud.rivalHomers, 0)} size="stat" />
              </span>
              {typeof hud.pitch === 'string' && hud.pitch && <HudChip plate={false} alpha={0.8} className="ml-2 rounded" style={{ background: 'rgba(0, 0, 0, 0.4)' }}>{hud.pitch}</HudChip>}
              {/* PARKOUR DERBY (owner brief 2026-09-18): the wall targets taken, and a multiplier waiting on the next hit */}
              {typeof hud.targets === 'string' && hud.targets && <HudChip plate={false} fill={0.2} tone="danger" className="ml-2 rounded">TARGETS {hud.targets}</HudChip>}
              {typeof hud.mult === 'string' && hud.mult && <HudChip plate={false} fill={0.25} tone="score" className="ml-2 rounded">{hud.mult}</HudChip>}
            </Scorebug>
            <HudBanner flow text={typeof hud.distance === 'string' ? hud.distance : ''} tone="score" />
          </div>
        )}

        {/* PENALTY (A+ mission #8, FIFA shootout read): the kicks board both sides, the feint counter, the two-press power
            bar and the DIVE prompt on their kick. Key-gated on `kicksYou`. */}
        {typeof hud.kicksYou === 'string' && (
          <div className="absolute inset-x-0 top-12 flex flex-col items-center gap-1.5">
            <HudPlate className="grid grid-cols-[auto_auto_auto] items-center gap-x-3 gap-y-1 px-4 py-1.5">
              <HudText size="label" tone="you">YOU</HudText><ScoreValue value={hnode(hud.goals, 0)} size="stat" /><HudText size="stat" style={{ letterSpacing: '0.3em' }}>{hud.kicksYou}</HudText>
              <HudText size="label" tone="them">THEM</HudText><ScoreValue value={hnode(hud.themGoals, 0)} size="stat" /><HudText size="stat" style={{ letterSpacing: '0.3em' }}>{hnode(hud.kicksThem, '')}</HudText>
            </HudPlate>
            {Number(hud.feints) > 0 && <HudChip tone="score">FEINTS {hnode(hud.feints, 0)} / 2 · style banked on a goal</HudChip>}
          </div>
        )}
        {typeof hud.kickPower === 'number' && (() => {
          const zones = typeof hud.kickZones === 'string' && hud.kickZones
            ? hud.kickZones.split(',').map((z) => { const [to, label] = z.split(':'); return { to: Number(to), label }; })
            : [{ to: 0.55, label: '' }, { to: 0.85, label: 'DRIVEN' }, { to: 1, label: '' }];
          let from = 0;
          const segs = zones.map((z) => {
            const s = {
              from, to: z.to, label: z.label, edge: true,
              ...(z.label === 'OVER' ? { tone: 'danger' as const, alpha: 0.45 } : z.label === 'TOP BINS' ? { tone: 'score' as const, alpha: 0.6 } : z.label === 'DRIVEN' ? { tone: 'you' as const, alpha: 0.25 } : { alpha: 0.05 }),
            };
            from = z.to;
            return s;
          });
          return (
            <div className="absolute inset-x-0 bottom-28 flex flex-col items-center gap-1">
              <HudChip tone="you">POWER — KICK again to strike{typeof hud.kickShape === 'string' && hud.kickShape ? ` · ${hud.kickShape}` : ''}</HudChip>
              {/* SOCCER UPGRADE (PES bar): ZONES with lines — soft, driven, top bins, and OVER (the ball clears the bar) */}
              <HudMeter className="mt-4" height="swing" width="min(520px, 70vw)" framed segments={segs}
                markers={[{ at: Math.max(0, Math.min(100, hud.kickPower)) / 100, tone: 'text', width: 4, glow: true }]} />
            </div>
          );
        })()}
        {/* TENNIS UPGRADE (Wii timing): the swing window as a meter with its bands — the mode publishes the ramp (contact at
            the right edge) and where OK / GOOD / PERFECT begin for this flight. Key-gated on the bands. */}
        {typeof hud.shotMeterT === 'number' && hud.shotMeterT > 0 && typeof hud.shotMeterBands === 'string' && hud.shotMeterBands && (() => {
          const [ok, good, perfect] = hud.shotMeterBands.split(',').map(Number);
          return (
            <div className="absolute inset-x-0 bottom-28 flex flex-col items-center gap-1">
              <HudChip tone="you">SWING — in the gold at the edge</HudChip>
              <HudMeter
                className="mt-4"
                height="tall"
                width="min(520px, 70vw)"
                framed
                segments={[{ from: ok, to: 1, alpha: 0.15 }, { from: good, to: 1, tone: 'you', alpha: 0.3 }, { from: perfect, to: 1, tone: 'score', alpha: 0.7 }]}
                ticks={[
                  { at: ok, label: 'EARLY', labelAlpha: 0.6 },
                  { at: good },
                  { at: perfect, label: 'PERFECT', labelTone: 'score' },
                ]}
                markers={[{ at: hud.shotMeterT, tone: 'text', width: 4, glow: true }]}
              />
            </div>
          );
        })()}
        {/* WEATHER chip for the modes without the golf lie panel (which carries its own) */}
        {typeof hud.weather === 'string' && hud.weather && !(typeof hud.club === 'string' && hud.club) && (
          <div className="absolute right-4 top-14">
            <HudChip alpha={0.85}>{hud.weather}</HudChip>
          </div>
        )}
        <HudBanner text={typeof hud.dive === 'string' ? hud.dive : ''} tone="good" className="top-1/4" />

        {/* TENNIS (A+ mission #6, Mario Tennis feel + Wii size): the scoreboard chip — games both sides, the umpire's
            call, the streak — and the TELL on the incoming ball with the answer that beats it. Key-gated. */}
        {typeof hud.call === 'string' && hud.call && (
          <div className="absolute inset-x-0 top-12 flex justify-center">
            <Scorebug>
              <HudText size="label" tone="you">{hnode(hud.you, 'YOU')}</HudText>
              <ScoreValue value={hnode(hud.score, 0)} />
              <ScoreDivider>–</ScoreDivider>
              <ScoreValue value={hnode(hud.foeScore, 0)} />
              <HudText size="label" tone="them">{hnode(hud.them, 'THEM')}</HudText>
              <HudChip plate={false} tone="score" size="value" className="ml-2 rounded" style={{ background: 'rgba(0, 0, 0, 0.4)' }}>{hud.call}</HudChip>
              {Number(hud.streak) >= 2 && <HudText size="label" tone="heat">{hnode(hud.streak, 0)} STRAIGHT</HudText>}
              {/* PARKOUR TENNIS (owner brief 2026-09-18): the rally's multiplier (the glass, the wall run, the aerials) and the style it has paid */}
              {Number(hud.mult) >= 2 && <HudChip plate={false} fill={0.2} tone="info" className="rounded">x{Number(hud.mult)} RALLY</HudChip>}
              {Number(hud.style) > 0 && <HudText size="label" alpha={HUD_TEXT_ALPHA.muted}>STYLE {Number(hud.style)}</HudText>}
              {typeof hud.aerial === 'string' && hud.aerial && <HudChip plate={false} fill={0.25} tone="score" className="rounded">{hud.aerial}</HudChip>}
            </Scorebug>
          </div>
        )}

        {/* THE CUE LANE (dance, A+ mission #1): the next moves slide toward the
            hit ring, coloured by move family (= the band's instrument), glyph
            + name readable from a couch. Rendered only when a mode publishes
            `cues`, so every other timing sport is unchanged. */}
        {isCueLane(hud.cues) && hud.cues.length > 0 && (
          <div className="absolute inset-x-6 bottom-[34%] h-16">
            {/* QA P2-03: a plate under the lane (≥ 3:1 for every family colour on any stage), the hit ring lit on the beat */}
            <div data-lane-plate className="absolute -inset-x-3 -inset-y-2 rounded-2xl" style={{ background: `rgba(0,0,0,${LANE_PLATE_ALPHA})` }} />
            <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/30" />
            <div
              data-hit-ring
              className="absolute top-1/2 h-14 w-14 rounded-full border-4 border-[var(--fel-gold)]"
              style={{ left: `${LANE_HIT_PCT}%`, transform: 'translate(-50%, -50%)', ...hitRingStyle(typeof hud.beatPulse === 'number' ? hud.beatPulse : null) }}
            />
            {hud.cues.map((c, i) => {
              const t = Math.max(-CUE_LINGER_SEC, Math.min(CUE_LOOKAHEAD_SEC, c.in));
              const x = LANE_HIT_PCT + (t / CUE_LOOKAHEAD_SEC) * LANE_SPAN_PCT;
              const hot = c.in <= 0.35 && c.in >= -CUE_LINGER_SEC;
              return (
                <div
                  key={i}
                  className="absolute top-1/2 flex h-12 w-12 items-center justify-center rounded-full"
                  style={{
                    ...hudType('value'),
                    color: hudColor('ink'),
                    textShadow: 'none',
                    left: `${x}%`,
                    background: c.color,
                    opacity: c.in < -0.05 ? PASSED_CUE_OPACITY : 1,
                    transform: `translate(-50%, -50%) scale(${hot ? 1.18 : 1})`,
                    boxShadow: hot ? `0 0 0 2px ${hudColor('text')}, 0 0 18px ${c.color}` : '0 0 0 2px rgba(255,255,255,0.9), 0 2px 6px rgba(0,0,0,0.5)',
                  }}
                >
                  {c.glyph}
                  <HudText size="caption" className="absolute top-full mt-1.5 whitespace-nowrap rounded px-1.5 py-0.5" style={{ fontWeight: 700, background: 'rgba(0, 0, 0, 0.65)' }}>
                    {c.mirrored ? '◁ ' : ''}{c.name.toUpperCase()}
                  </HudText>
                </div>
              );
            })}
          </div>
        )}


        {/* THE PROMPT LINE (QA P1-12): the incoming tell, the contact grade (PURE / OFF-CENTRE / EDGE OF THE BAT — the
            benchmark's named mechanic, it cannot be invisible), the graded shot and the rhythm cue (gold inside its last
            0.35 s) share ONE slot under the meters — they used to sit at their own offsets and stack in a rally. */}
        <TimingPrompt hud={hud} />

        <HudBanner text={typeof hud.banner === 'string' ? hud.banner : ''} tone="good" />

        {/* WAVE 3 (lane/w3-present): the shootout's lower third — "PENALTY 3 OF 5" (or SUDDEN DEATH) slides in as each kick's round starts, with the
            tally, from the round label and the goals the mode already sends (penalty only: the key is the round label). */}
        {modeKey === 'penalty' && (() => {
          const label = typeof hud.round === 'string' ? hud.round : '';
          const m = /^KICK (\d+)\/(\d+)$/.exec(label);
          return (
            <HudLowerThird
              enabled={phase === 'playing'}
              cardKey={label}
              tone="you"
              kicker="SHOOTOUT"
              title={m ? `PENALTY ${m[1]} OF ${m[2]}` : label}
              sub={`YOU ${hnode(hud.goals, 0)} – ${hnode(hud.themGoals, 0)} THEM`}
            />
          );
        })()}
        </HudFrame>

        <BootSplash
          modeId={modeKey}
          controls={opts.hint}   // CONTROLS SCREEN (2026-10-06): the host's control line, on the READY card and the pause
          title={modeKey.replace(/_/g, ' ').toUpperCase()}
          phase={phase}
          detail={phase === 'error' ? (loadError ?? undefined) : (countdown ?? undefined)}
          onStart={tapStart}
          onRetry={tapStart}
        />

        {/* MUSIC-SUITE P7 (2026-09-29), room-mix-ux: "reachable from the dance room's pause menu" — boot-splash.tsx
            is a held file (movement play owns it) and draws the PAUSED screen with no slot for extra content, so this
            sits ON TOP of it instead: rendered after BootSplash, it paints over the paused backdrop rather than under
            it, and its own controls (the sliders) capture the click before PausedLayer's full-screen "any click
            resumes" button ever sees it. Dance only — every other timing sport pauses exactly as it did before. */}
        {modeKey === 'dance' && phase === 'paused' && (
          <div className="pointer-events-none absolute inset-x-0 bottom-8 flex justify-center px-4">
            <div className="fel-panel pointer-events-auto w-full max-w-xs rounded-xl p-3">
              <VolumeMixer heading="MIX — this device" />
            </div>
          </div>
        )}

        {busRef.current && (
          <TouchOverlay bus={busRef.current} modeId={modeKey} visible={phase === 'playing' || phase === 'countdown'} />
        )}

        {modeKey === 'dance' && <MicCaption text={hud.mic} who={hud.micWho} className="bottom-[10%]" />}
      </div>
    );
  }

  TimingBabylon.displayName = `TimingBabylon(${modeKey})`;
  return TimingBabylon;
}


