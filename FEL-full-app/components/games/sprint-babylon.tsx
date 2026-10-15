'use client';

// Shared Babylon host for the air-session family (gymnastics vault, big air).
// makeSprintHost(modeKey) returns a GameProps component, mirroring the
// makeTimingHost / makeBoardHost convention — one host, never forked per mode.

import { useEffect, useRef, useState, useCallback } from 'react';
import type { GameProps, GameResult } from './game-shell';
import { useBabylonPlaytestBridge } from './use-babylon-playtest-bridge';
import { BootSplash } from './boot-splash';
import { surfaceBootError } from './boot-error';
import { runMode, InputBus, type ModePhase, type SessionResult, type HudValue } from '@/lib/babylon';
import { MODES } from '@/lib/babylon/modes/registry';
import { TouchOverlay } from '@/lib/babylon/ui/TouchOverlay';
import { HudBanner, HudChip, HudFrame, HudPlate, HudText, ScoreValue, hudColor, type HudTone } from './tv-hud';
import { PhotoFinishPrint } from './photo-finish';   // WAVE 3 (lane/w3-present): the photo-finish end image
import { PHOTO_HOLD_MS } from '@/lib/babylon/racing/photoFinish';

// Which harness currently owns a given canvas. React mounts effects twice in
// dev: effect A starts an async runMode(), its cleanup fires before A has even
// finished loading, then effect B starts on the SAME canvas. When A's promise
// finally resolves it tears itself down — and engine.dispose() releases the
// WebGL context of the shared canvas, killing B's render loop. The symptom is
// brutal to read: the HUD keeps streaming from B's React state while update()
// is never called again and the canvas stays black.
//
// The token lets a late teardown notice it has been superseded and leave the
// canvas alone. Leaking one dev-only engine is vastly better than a dead frame.
const canvasOwner = new WeakMap<HTMLCanvasElement, object>();


type Hud = Record<string, HudValue>;

/** IMPROVE (2026-10-06): the stride's grade, as a palette tone on the metronome's target ring (TV HUD: one palette). */
const BEAT_TONE: Record<string, HudTone> = { perfect: 'score', good: 'you', first: 'you', off: 'info', stumble: 'danger' };

/**
 * IMPROVE (2026-10-06): THE METRONOME. The target is one stride every targetIntervalMs (200 ms for a thumb), and nothing
 * on screen showed the beat. After every stride an outer ring closes onto the fixed target ring over exactly that beat:
 * tap the next foot (shown in the middle) as they meet. The target ring takes the last stride's grade colour. Driven by
 * the mode's `beat` counter (one HUD push a stride) and the Web Animations API, so it costs no React render per frame.
 */
function SprintMetronome({ seq, ms, foot, grade, call }: { seq: number; ms: number; foot: string; grade: string; call: string }) {
  const ringRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ringRef.current;
    if (!el || !(ms > 0) || typeof el.animate !== 'function') return;
    const a = el.animate([{ transform: 'scale(2.2)', opacity: 0.25 }, { transform: 'scale(1)', opacity: 1, offset: 1 / 1.4 }, { transform: 'scale(0.8)', opacity: 0 }],
      { duration: ms * 1.4, easing: 'linear', fill: 'forwards' });   // meets the target at ms (1 / 1.4 of the way), then fades through it
    return () => a.cancel();
  }, [seq, ms]);
  const tone = BEAT_TONE[grade] ?? 'text';
  const color = hudColor(tone);
  return (
    <div className="pointer-events-none absolute bottom-6 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-1">
      <div className="relative h-14 w-14">
        <div className="absolute inset-0 rounded-full border-2" style={{ borderColor: color }} />
        <div ref={ringRef} className="absolute inset-0 rounded-full border-2" style={{ opacity: 0, borderColor: hudColor('text') }} />
        <div className="absolute inset-0 flex items-center justify-center"><HudText size="value" style={{ fontWeight: 800 }}>{foot === 'L' ? '←' : foot === 'R' ? '→' : ''}</HudText></div>
      </div>
      <HudText as="div" size="caption" tone={tone} className="h-4" style={{ fontWeight: 800, letterSpacing: '0.1em' }}>{call || grade.toUpperCase()}</HudText>
    </div>
  );
}

export function makeSprintHost(modeKey: string, title: string) {
  function SprintBabylon({ onEnd }: GameProps) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const busRef = useRef<InputBus | null>(null);
    const endedRef = useRef(false);
    // The harness effect must NOT depend on onEnd's identity. A parent that
    // passes an inline arrow (very common) gives a new function every render,
    // the effect re-runs, and a SECOND Babylon engine is created on the same
    // canvas — they share one WebGL context and the frame goes black while the
    // HUD keeps updating from the other instance.
    const onEndRef = useRef(onEnd);
    onEndRef.current = onEnd;
    const [phase, setPhase] = useState<ModePhase>('loading');
    const [countdown, setCountdown] = useState<number | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [hud, setHud] = useState<Hud>({});
    // WAVE 3: the photo finish holds the result for a couple of seconds (the print on screen); any press or tap hands it over at once
    const hudRef = useRef<Hud>({});
    hudRef.current = hud;
    const holdRef = useRef<{ go: () => void; timer: ReturnType<typeof setTimeout> } | null>(null);
    const [holding, setHolding] = useState(false);
    useBabylonPlaytestBridge(modeKey, () => ({ phase, countdown, loadError, hud }), busRef.current);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const token = {};
      canvasOwner.set(canvas, token);
      const bus = new InputBus();
      busRef.current = bus;
      let stop: (() => void) | null = null;
      let disposed = false;
      const offSkip = bus.on((e) => { if (holdRef.current && 'pressed' in e && e.pressed) holdRef.current.go(); });   // WAVE 3: a press (a button, the d-pad) hands the result over

      // DEFERRED like every other host (racing pass phase 5, 2026-09-23). Booted straight from the effect, React's
      // development double-mount left the FIRST harness running: its cleanup ran before runMode resolved (no stop to
      // call yet), and once it resolved the owner check saw the second mount's token and skipped the teardown. Two
      // harnesses then fed the one module-level SprintMode — every d-pad stride stepped the core twice, the second
      // step read as the same side, and every stride was a STUMBLE (measured through /dev/race/sprint: 51 stumbles,
      // 0.6 m). The phantom mount's timer is cleared before it ever boots.
      const startTimer = setTimeout(() => { if (disposed) return; runMode(MODES[modeKey], {
        canvas,
        input: bus,
        onPhase: (p, d) => {
          if (disposed) return;
          setPhase(p);
          setCountdown(typeof d === 'number' ? d : null);
          if (p === 'error') setLoadError(typeof d === 'string' ? d : 'load failed');
        },
        onHud: (u) => { if (!disposed) setHud((prev) => ({ ...prev, ...u })); },
        resultSink: async (r: SessionResult) => {
          if (endedRef.current) return;
          endedRef.current = true;
          const result = ({
            score: r.score,
            stats: r.stats, outcome: r.outcome,   // pass 5 phase 3: the proof line reads these
            opponentScore: 0,
            won: r.outcome === 'win',
            duration: r.durationSec,
            // RACING PASS phase 9: the race and the clock — beating the pacer outside the sub-13 bar was "CHASE THAT SUB-13",
            // the same line as losing to it
            headline: (() => { const t = Number(r.stats?.timeS ?? 0).toFixed(2);
              return r.outcome === 'win' ? `SUB-13 · ${t}s` : r.outcome === 'dnf' ? 'DID NOT FINISH'
                : Number(r.stats?.beatPacer) ? `BEAT THE PACER · ${t}s — NOW SUB-13` : `THE PACER TAKES IT · ${t}s`; })(),
          } satisfies GameResult);
          // WAVE 3: the photo finish — when the mode sent a still of the tape, the print holds the result for PHOTO_HOLD_MS (skippable)
          const still = hudRef.current.photoSrc;
          if (disposed || typeof still !== 'string' || !still) { onEndRef.current(result); return; }
          let done = false;
          const go = (): void => { if (done) return; done = true; clearTimeout(timer); holdRef.current = null; setHolding(false); onEndRef.current(result); };
          const timer = setTimeout(go, PHOTO_HOLD_MS);
          holdRef.current = { go, timer };
          setHolding(true);
        },
      }).then((s) => {
        // If a newer mount already claimed this canvas, do NOT run our teardown —
        // it would dispose the engine holding the shared WebGL context.
        if (disposed) { if (canvasOwner.get(canvas) === token) s(); return; }
        stop = s;
      })
        .catch((e) => surfaceBootError(e, { disposed, setPhase, setLoadError }));
      }, 0);

      return () => {
        disposed = true;
        clearTimeout(startTimer);
        offSkip();
        if (holdRef.current) { clearTimeout(holdRef.current.timer); holdRef.current = null; }   // a result held for the print is not sent from a host that has gone
        if (canvasOwner.get(canvas) === token) stop?.();
      };
    }, []);   // mount once — see onEndRef above

    const tapStart = useCallback(() => {
      busRef.current?.emit({ t: 'button', btn: 'START', pressed: true });
    }, []);

    return (
      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-white/10 bg-black">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

        {/* TV HUD (A9.13, lane/vis-race phase 2): every readout on the shared system — same keys, same gates, same slots. */}
        <HudFrame>
          {phase === 'playing' && (
            <div className="absolute left-4 top-4 z-20 flex flex-col items-start gap-1">
              <HudPlate className="px-3 py-1.5">
                <ScoreValue value={`${String(hud.clock ?? 0)}s`} tone="score" pop={false} />
                <HudText as="div" size="caption" alpha={0.6}>{String(hud.distance ?? '')} · {String(hud.phase ?? '')}</HudText>
                <HudText as="div" size="caption" alpha={0.6}>
                  speed {String(hud.speed ?? 0)} m/s · top {String(hud.top ?? 0)} · rival {String(hud.rival ?? '')}
                </HudText>
              </HudPlate>
              {/* IMPROVE (2026-10-06): the gap to the pacer and to the sub-13 pace light (the green bar) — the numbers you race */}
              {typeof hud.gap === 'string' && hud.gap && (
                <div className="flex items-center gap-3">
                  <HudChip tone={hud.gap.startsWith('+') ? 'good' : 'danger'} size="value" style={{ fontWeight: 800 }}>PACER {hud.gap}</HudChip>
                  {typeof hud.sub13 === 'string' && hud.sub13 && (
                    <HudChip tone={hud.sub13.startsWith('+') ? 'good' : 'text'} alpha={hud.sub13.startsWith('+') ? 1 : 0.5} size="value" style={{ fontWeight: 800 }}>SUB-13 {hud.sub13}</HudChip>
                  )}
                </div>
              )}
              {/* IMPROVE (2026-10-06): the last called split (30 / 60 m) against the personal best (− is ahead) */}
              {typeof hud.split === 'string' && hud.split && <HudChip tone="info" size="body">{hud.split}</HudChip>}
              {/* IMPROVE (2026-10-06): false starts were counted and never shown; the rule beside the count */}
              {Number(hud.falseStarts) > 0 && (
                <HudChip tone="danger" size="body">false starts {String(hud.falseStarts)} · {String(hud.falseStartRule ?? '')}</HudChip>
              )}
            </div>
          )}
          {/* WAVE 3: with the photo finish up the result line rides above the print (it was at a third of the stage, where the print stands) */}
          <HudBanner text={typeof hud.banner === 'string' ? hud.banner : ''} tone="you" className={hud.photoSrc ? 'top-[24%]' : undefined} />

          {/* IMPROVE (2026-10-06): the hint the mode always sent — the controls, explained on screen */}
          {phase === 'playing' && typeof hud.hint === 'string' && hud.hint && !hud.photoSrc && (
            <HudPlate className="absolute right-4 top-4 z-20 max-w-[45%] px-2 py-1 text-right">
              <HudText size="caption" alpha={0.8}>{hud.hint}</HudText>
            </HudPlate>
          )}
          {/* WAVE 3: the photo finish — the still the mode took at the tape, with the line and the ruler */}
          <PhotoFinishPrint src={hud.photoSrc} line={hud.photoLine} you={hud.photoYou} pacer={hud.photoPacer} />
          {phase === 'playing' && Number(hud.beat) > 0 && !hud.photoSrc && (
            <SprintMetronome seq={Number(hud.beat)} ms={Number(hud.beatMs) || 200} foot={String(hud.beatFoot ?? '')}
              grade={String(hud.beatGrade ?? '')} call={String(hud.beatCall ?? '')} />
          )}
        </HudFrame>

        {holding && <div data-photo-skip className="absolute inset-0 z-30 cursor-pointer" onPointerDown={() => holdRef.current?.go()} aria-hidden="true" />}

        <BootSplash
          modeId={modeKey}
          title={title}
          phase={phase}
          detail={phase === 'error' ? (loadError ?? undefined) : (countdown ?? undefined)}
          onStart={tapStart}
          onRetry={tapStart}
        />

        {(phase === 'playing' || phase === 'countdown') && busRef.current && (
          <TouchOverlay bus={busRef.current} modeId={modeKey} visible />
        )}
      </div>
    );
  }
  SprintBabylon.displayName = `SprintBabylon(${modeKey})`;
  return SprintBabylon;
}
