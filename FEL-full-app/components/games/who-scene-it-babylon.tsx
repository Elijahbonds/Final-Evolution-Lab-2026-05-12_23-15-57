'use client';
// Who Scene It — Babylon host (lane 3 W1). A thin host like dunk-babylon: it owns the canvas, boots the harness with the
// live venue quiz, and draws the question card over the sweep. The four answers are buttons here AND the four face
// buttons on any pad (the mode reads A/B/X/Y). Results flow back through GameShell's onEnd like every other mode.
//
// IMPROVE (2026-10-06): the reveal marks the right card and each seat's pick (#2); a tap on a card during the reveal moves on
// once it has had its beat (#5); the second seat may be the CPU (#7, `p2name`); P2's arrows sit on the grid's corners (#14);
// the match ends on a venue recap (#15); and the mode runs `continuous`, so REPLAY starts a new match in place (#16).
import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameProps, GameResult } from './game-shell';
import { useBabylonPlaytestBridge } from './use-babylon-playtest-bridge';
import { surfaceBootError } from './boot-error';
import { runMode, InputBus, type ModePhase, type SessionResult, type HudValue } from '@/lib/babylon';
import { MODES } from '@/lib/babylon/modes/registry';
import { hnode } from './hud-format';
import { HudBanner, HudChip, HudFrame, HudPlate, HudText, ScoreCell, ScoreValue, Scorebug, hudColor, hudType, type HudTone } from './tv-hud';
import { PausedLayer, BodyReadyLine } from './paused-layer';
import { ControlsPanel } from './controls-panel';
import { whoSceneItStageBox } from '@/lib/babylon/modes/whoSceneItFrame';
import { replayWhoSceneIt } from '@/lib/babylon/modes/WhoSceneItMode';
import { useReplayInPlace } from './replay-in-place';

type Hud = Record<string, HudValue>;
// IMPROVE (#14): P2's arrow is its card's corner turned 45° clockwise — ▲ top-left, ▶ top-right, ◀ bottom-left, ▼ bottom-right
// (WhoSceneItMode's DPAD). ◀ used to pick the bottom-RIGHT card.
const OPTS: { key: 'optA' | 'optB' | 'optX' | 'optY'; btn: 'A' | 'B' | 'X' | 'Y'; face: string; dpad: string; tone: HudTone }[] = [
  { key: 'optA', btn: 'A', face: 'A', dpad: '\u25b2', tone: 'you' }, { key: 'optB', btn: 'B', face: 'B', dpad: '\u25b6', tone: 'danger' },
  { key: 'optX', btn: 'X', face: 'C', dpad: '\u25c0', tone: 'power' }, { key: 'optY', btn: 'Y', face: 'D', dpad: '\u25bc', tone: 'them' },
];
/** The between-rounds scoreboard rows the mode publishes (HudScoreCard shape). */
const isBoard = (v: unknown): v is { name: string; score: number | string; line: string }[] =>
  Array.isArray(v) && v.every((r) => !!r && typeof r === 'object' && 'line' in (r as object));

export default function WhoSceneItBabylon({ onEnd }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const busRef = useRef<InputBus | null>(null);
  const endedRef = useRef(false);
  /** When the current match began, if it began on a REPLAY (the harness's clock started with the first one). */
  const replayAtRef = useRef<number | null>(null);
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;
  const [phase, setPhase] = useState<ModePhase>('loading');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hud, setHud] = useState<Hud>({});
  useBabylonPlaytestBridge('who_scene_it', () => ({ phase, countdown, loadError, hud }), busRef.current);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const bus = new InputBus(); busRef.current = bus;
    let stop: (() => void) | null = null; let disposed = false;
    const resultSink = async (r: SessionResult) => {
      if (endedRef.current) return; endedRef.current = true;
      const won = r.outcome === 'WIN' || r.outcome === 'win';
      const duration = replayAtRef.current !== null ? Math.round((performance.now() - replayAtRef.current) / 100) / 10 : r.durationSec;
      const result: GameResult = {
        score: r.score, stats: r.stats, outcome: r.outcome, opponentScore: 0, won, duration,
        headline: won ? 'SCENE MASTER' : 'ROUND OVER',
        tallies: { hits: r.stats?.correct ?? 0, misses: Math.max(0, (r.stats?.total ?? 0) - (r.stats?.correct ?? 0)), dodges: 0, combos: r.stats?.bestStreak ?? 0 },
      };
      onEndRef.current(result);
    };
    const startTimer = setTimeout(() => {
      if (disposed) return;
      runMode(MODES.who_scene_it, {
        canvas, input: bus,
        onPhase: (p, cd) => { setPhase(p); setCountdown(p === 'countdown' && typeof cd === 'number' ? cd : null); setLoadError(p === 'error' ? (typeof cd === 'string' ? cd : 'Failed to load this mode.') : null); },
        onHud: (u) => setHud((prev) => ({ ...prev, ...u })),
        resultSink,
        // IMPROVE (#16): the finish reports its card and the stage stays up for REPLAY (replayWhoSceneIt); one sink takes either
        continuous: true, cardSink: resultSink,
      }).then((s) => { if (disposed) { s(); return; } stop = s; }).catch((e) => surfaceBootError(e, { disposed, label: '[FEL-WSI] boot failed', setPhase, setLoadError }));
    }, 0);
    return () => { disposed = true; clearTimeout(startTimer); stop?.(); busRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- G7: the stage is owned by the mount; callbacks are read through refs.
  }, []);

  // IMPROVE (#16): REPLAY on the shell's end card — a new set of rounds on this stage, same players, no reboot
  const restart = useCallback((): boolean => {
    const ok = replayWhoSceneIt();
    if (ok) { endedRef.current = false; replayAtRef.current = performance.now(); }
    return ok;
  }, []);
  useReplayInPlace(restart);

  const emit = useCallback((e: Parameters<InputBus['emit']>[0]) => { busRef.current?.emit(e); }, []);
  const tapStart = useCallback(() => emit({ t: 'button', btn: 'START', pressed: true }), [emit]);
  const revealing = typeof hud.reveal === 'string' && hud.reveal.length > 0;
  // #2: once the question resolves, the right card and each seat's pick (-1 = none)
  const answerIdx = typeof hud.answerIdx === 'number' ? hud.answerIdx : -1;
  const picks = [typeof hud.pickP1 === 'number' ? hud.pickP1 : -1, typeof hud.pickP2 === 'number' ? hud.pickP2 : -1];
  const marked = answerIdx >= 0;
  const p2name = typeof hud.p2name === 'string' && hud.p2name ? hud.p2name : 'P2';
  const twoHumans = Number(hud.humans ?? hud.players) === 2;
  const recap = isBoard(hud.recap) ? hud.recap : null;
  const [box, setBox] = useState(() => whoSceneItStageBox(1200, 800));
  useEffect(() => {
    const measure = () => setBox(whoSceneItStageBox(window.innerWidth, window.innerHeight));
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  return (
    <div className="relative mx-auto w-full overflow-hidden rounded-xl border border-white/10 bg-black" style={{ width: box.width, height: box.height, maxWidth: '100%' }}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

      {/* TV HUD (A9.13, lane/tv-hud): the readouts in the shared frame; the question card and the between-rounds screens
          keep their own layers (they carry the tap targets) and draw with the same palette and 10-foot scale. */}
      <HudFrame>
      {/* top bar: pack · question · clock · score */}
      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 px-4 py-3">
        <div className="flex items-center gap-2">
          <HudChip tone="you">{hnode(hud.pack, '')}</HudChip>
          {hud.question != null && <HudChip alpha={0.7}>{hnode(hud.question)}</HudChip>}
          {/* A+ mission #2: the round's category, in its colour, and the round count — Mario Party reads the category first */}
          {typeof hud.category === 'string' && hud.category && (
            <HudChip size="value" style={{ color: typeof hud.categoryColor === 'string' && hud.categoryColor ? hud.categoryColor : hudColor('text') }}>
              <span style={{ color: typeof hud.categoryColor === 'string' && hud.categoryColor ? hud.categoryColor : hudColor('text'), fontWeight: 800 }}>{hud.category}</span>
            </HudChip>
          )}
          {typeof hud.roundLabel === 'string' && hud.roundLabel && <HudChip alpha={0.6}>{hud.roundLabel}</HudChip>}
        </div>
        <div className="flex items-center gap-2">
          {typeof hud.clock === 'number' && (
            <Scorebug><ScoreValue value={`${hud.clock}s`} size="stat" tone={hud.clock <= 3 ? 'danger' : 'text'} pop={false} /></Scorebug>
          )}
          {Number(hud.players) === 2 ? (
            <>
              <Scorebug accent="you"><ScoreCell inline label="P1" labelTone="you" value={hnode(hud.score, 0)} size="stat" /></Scorebug>
              <Scorebug accent="them"><ScoreCell inline label={p2name} labelTone="them" value={hnode(hud.p2score, 0)} size="stat" /></Scorebug>
            </>
          ) : (
            <Scorebug><ScoreValue value={hnode(hud.score, 0)} size="stat" /></Scorebug>
          )}
          {Number(hud.streak) > 1 && <HudChip tone="score" size="value">x{hnode(hud.streak)}</HudChip>}
        </div>
      </div>
      </HudFrame>

      {/* the question card + four answers (also the pad's A B X Y) */}
      {phase === 'playing' && typeof hud.prompt === 'string' && hud.prompt && (
        <div className="absolute inset-x-0 bottom-3 flex flex-col items-center gap-2 px-3 font-display">
          <HudPlate className="max-w-[720px] px-5 py-2.5 text-center"><HudText size="stat">{hud.prompt}</HudText></HudPlate>
          <div className="grid w-full max-w-[720px] grid-cols-2 gap-2">
            {OPTS.map((o, i) => {
              // #2: green for the right card, red for a wrong pick, each pick tagged with its seat; the rest dim
              const right = marked && i === answerIdx;
              const pickedBy = [0, 1].filter((seat) => picks[seat] === i);
              const wrongPick = marked && !right && pickedBy.length > 0;
              const border = right ? hudColor('good') : wrongPick ? hudColor('danger') : hudColor(o.tone, 0.4);
              return (
                // #5: the cards stay live during the reveal — a tap moves on once the answer has had its beat (the mode decides)
                <button key={o.key} onPointerDown={(e) => { e.preventDefault(); emit({ t: 'button', btn: o.btn, pressed: true }); }}
                  className={`fel-panel flex items-center gap-2 rounded-xl px-4 py-4 text-left text-white ${revealing && !right && !wrongPick ? 'opacity-50' : ''}`}
                  style={{ ...hudType('stat'), fontWeight: 700, borderColor: border, borderWidth: right || wrongPick ? 2 : undefined, background: right ? hudColor('good', 0.22) : wrongPick ? hudColor('danger', 0.18) : undefined }}>
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ ...hudType('value'), background: hudColor(o.tone), color: hudColor('ink') }}>{o.face}</span>
                  <span className="truncate">{hnode(hud[o.key], '')}</span>
                  {marked && pickedBy.map((seat) => (
                    <span key={seat} className="shrink-0 rounded px-1.5" style={{ ...hudType('label'), background: hudColor(seat === 0 ? 'you' : 'them'), color: hudColor('ink') }}>{seat === 0 ? 'P1' : p2name}</span>
                  ))}
                  {twoHumans && <HudText size="value" alpha={0.55} className="ml-auto shrink-0">{o.dpad}</HudText>}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            {hud.lockedP1 === true && <HudChip tone="you">P1 OUT</HudChip>}
            {typeof hud.banner === 'string' && hud.banner && <HudChip tone="score" size="value">{hud.banner}</HudChip>}
            {hud.lockedP2 === true && <HudChip tone="them">{p2name} OUT</HudChip>}
          </div>
          {revealing && <HudPlate className="max-w-[560px] px-3 py-1 text-center"><HudText size="label" alpha={0.7}>{hud.reveal as string}</HudText></HudPlate>}
        </div>
      )}

      {/* A+ mission #2: the player-count screen and the between-rounds scoreboard — both live where the card is not */}
      {phase === 'playing' && !(typeof hud.prompt === 'string' && hud.prompt) && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 px-4 text-center font-display">
          {recap ? (
            // IMPROVE (#15): the places the match asked — who took each and how fast — before the result card
            <HudPlate className="pointer-events-auto w-full max-w-[560px] px-5 py-4">
              <HudText as="div" size="score">THE VENUES</HudText>
              {typeof hud.recapTitle === 'string' && hud.recapTitle && <HudText as="div" size="label" tone="score" className="mt-1">{hud.recapTitle}</HudText>}
              <div className="mt-3 grid gap-1.5">
                {recap.map((r, i) => (
                  <div key={`${r.name}-${i}`} className="flex items-center justify-between gap-3 rounded-lg bg-black/40 px-3 py-1.5">
                    <HudText size="value" className="truncate text-left">{r.name}</HudText>
                    <HudText size="label" alpha={0.6} className="shrink-0">{r.line}</HudText>
                    <ScoreValue value={r.score} size="value" pop={false} className="w-12 shrink-0 text-right" />
                  </div>
                ))}
              </div>
              <button type="button" onPointerDown={(e) => { e.preventDefault(); emit({ t: 'button', btn: 'A', pressed: true }); }} onPointerUp={() => emit({ t: 'button', btn: 'A', pressed: false })}
                className="mt-3 rounded-xl bg-[var(--fel-cyan)] px-6 py-2 font-bold text-black">CONTINUE</button>
            </HudPlate>
          ) : isBoard(hud.board) && typeof hud.boardTitle === 'string' && hud.boardTitle ? (
            <HudPlate className="w-full max-w-[520px] px-5 py-4">
              <HudText as="div" size="score">SCOREBOARD</HudText>
              <div className="mt-3 grid gap-2">
                {hud.board.map((r, i) => (
                  <div key={r.name} className="flex items-center justify-between gap-3 rounded-lg bg-black/40 px-3 py-2">
                    <HudText size="value" tone={i === 0 ? 'you' : 'them'}>{r.name}</HudText>
                    <HudText size="label" alpha={0.6} className="truncate">{r.line}</HudText>
                    <ScoreValue value={r.score} size="stat" />
                  </div>
                ))}
              </div>
              <HudText as="div" size="label" tone="score" className="mt-3">{hud.boardTitle}</HudText>
            </HudPlate>
          ) : typeof hud.banner === 'string' && hud.banner ? (
            <>
              <HudBanner flow text={hud.banner} tone="text" size="hero" />
              {typeof hud.hint === 'string' && hud.hint && <HudChip alpha={0.7} size="body">{hud.hint}</HudChip>}
              {/* PHONE CONTROLS (FINISH-RELEASE, 2026-09-15): the player-count screen said "any face button starts" and a phone
                  has no face buttons — the only way in was waiting out the pick timer, and a second player could never be added.
                  The pad's own verbs, as taps: ◀ ▶ change the count (the d-pad), PLAY is the A button. */}
              {hud.banner.startsWith('PLAYERS') && (
                <div className="pointer-events-auto mt-1 flex items-center gap-3">
                  <button type="button" aria-label="fewer players" onPointerDown={(e) => { e.preventDefault(); emit({ t: 'dpad', dir: 'left', pressed: true }); }} onPointerUp={() => emit({ t: 'dpad', dir: 'left', pressed: false })}
                    className="fel-panel h-12 w-12 rounded-full text-xl font-black text-white">◀</button>
                  <button type="button" onPointerDown={(e) => { e.preventDefault(); emit({ t: 'button', btn: 'A', pressed: true }); }} onPointerUp={() => emit({ t: 'button', btn: 'A', pressed: false })}
                    className="rounded-2xl bg-[var(--fel-cyan)] px-8 py-3 text-lg font-black text-black">PLAY</button>
                  <button type="button" aria-label="more players" onPointerDown={(e) => { e.preventDefault(); emit({ t: 'dpad', dir: 'right', pressed: true }); }} onPointerUp={() => emit({ t: 'dpad', dir: 'right', pressed: false })}
                    className="fel-panel h-12 w-12 rounded-full text-xl font-black text-white">▶</button>
                </div>
              )}
            </>
          ) : null}
        </div>
      )}

      {/* ready / countdown / error gates */}
      {phase === 'ready' && (
        <button onClick={tapStart} className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 text-center">
          <span className="fel-heading text-3xl font-black text-white">SPOT THE SCENE</span>
          <span className="mt-2 font-mono text-xs text-white/70">name the place · A B C D answer · faster pays more · ◀ ▶ on the first screen adds a second player (arrows)</span>
          {/* CONTROLS SCREEN (2026-10-06): the same panel as every BootSplash card — spans only, inside this button */}
          <ControlsPanel modeId="who_scene_it" chooser={false} className="mt-4" />
          <span className="mt-6 rounded-xl bg-[var(--fel-cyan)] px-6 py-3 font-bold text-black">TAP TO START</span>
          {/* MOVEMENT PLAY P3 (2026-09-24, the step-4a review): the hands-up START works here too — say so, as BootSplash does */}
          <BodyReadyLine className="mt-3" />
        </button>
      )}
      {/* MOVEMENT PLAY P3 (2026-09-24, step 4a): this host has no BootSplash, so it draws the shared pause itself. It had no
          pause screen at all: a pad's START froze the quiz with no word, and nothing said both hands up bring it back. */}
      {phase === 'paused' && <PausedLayer onResume={tapStart} modeId="who_scene_it" />}
      {phase === 'countdown' && countdown != null && <div className="pointer-events-none absolute inset-0 flex items-center justify-center"><span className="fel-heading text-7xl font-black text-white drop-shadow">{countdown}</span></div>}
      {phase === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 p-6 text-center">
          <div className="fel-panel max-w-md rounded-2xl [border-color:color-mix(in_srgb,var(--fel-red)_50%,transparent)] px-6 py-5">
            <div className="font-mono text-sm text-[var(--fel-red)]">{loadError}</div>
            <button
              type="button"
              onClick={tapStart}
              className="mt-4 rounded-xl bg-[var(--fel-cyan)] px-5 py-2 font-bold text-black"
            >
              RETRY
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
