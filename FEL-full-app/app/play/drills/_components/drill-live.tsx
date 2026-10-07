'use client';

// The drill on the camera (Mirror & coaching plan Phase 6, 2026-10-07): the games' space check, then the chart against
// the body, then what it read. The controller is lib/drills/liveDrill.ts (node-tested); this file draws it.
//
//   setup     body play's own SpaceCheckPanel (components/games/body-play.tsx, read-only): the self-view with the floor
//             line, one instruction at a time, the safety line, TAP TO START / hands-up, Camera off. An under-18 or an
//             unknown age meets the Mirror's grown-up step first (body play's rule, its GrownUpStep).
//   playing   the self-view with the drill's cue lane over it, the phase's line (the book's words, lib/drills/drills.ts),
//             the breath pacer where the phase has one, the hit flash, the Coach's caption. The drill's clock runs only
//             with a body in frame (DrillRunner): out of frame, the page says the drill waits.
//   paused    the tab was hidden: the camera is off (Phase 1, owner decision 7). A tap turns it back on, the space check
//             runs again, and hands-up or RESUME carries the drill on.
//   done      the result, as a camera estimate. Nothing is saved or sent, for any age.

import { useCallback, useEffect, useRef, useState } from 'react';
import { bodyPlay } from '@/lib/move/bodyPlay';
import { SelfView, SpaceCheckPanel, useBodyPlay } from '@/components/games/body-play';
import { GrownUpStep } from '@/app/play/mirror/assess/_components/gate-steps';
import { BreathPacer } from '@/components/breath/Pacer';
import { wakeLockLine, type WakeLockState } from '@/lib/mirror/liveCamera';
import { CUE_LOOKAHEAD_SEC, type HudCue } from '@/lib/babylon/core/danceTracks';
import type { Drill } from '@/lib/drills/chart';
import type { DrillResult } from '@/lib/drills/DrillRunner';
import type { LiveDrillView } from '@/lib/drills/liveDrill';
import { useLiveDrill } from './use-live-drill';

export const RESULT_ESTIMATE_LINE = 'A camera estimate of the moves it saw, not a measurement.';
export const NOTHING_SAVED_LINE = 'Nothing from this drill is saved or sent. The camera picture never leaves this device.';
export const PAUSED_LINE = 'Paused: the camera went off when you left the page.';
export const STEP_BACK_LINE = 'Step back into the picture: the drill waits for you.';
export const STEP_IN_LINE = 'Step into the picture to start the clock.';

/** The cue lane: the next targets sliding to the line, each named and coloured by its move (the dance lane's idea). */
function CueLane({ cues }: { cues: readonly HudCue[] }) {
  return (
    <div className="relative h-12 w-full overflow-hidden rounded-lg bg-black/55" aria-hidden data-drill-lane={cues.length}>
      <div className="absolute inset-y-0 left-[12%] w-[3px] bg-white/80" />
      {cues.map((c, i) => {
        const x = 12 + Math.max(-4, Math.min(88, (c.in / CUE_LOOKAHEAD_SEC) * 88));
        return (
          <div key={`${c.name}-${i}-${c.move}`} className="absolute top-1/2 -translate-y-1/2 rounded-md px-1.5 py-0.5 text-[11px] font-black text-black"
            style={{ left: `${x}%`, background: c.color }}>
            {c.name}
          </div>
        );
      })}
    </div>
  );
}

function pct(x: number | null): string {
  return x === null ? '—' : `${Math.round(x * 100)}%`;
}

function ResultCard({ result, drill, onAgain, onLeave }: { result: DrillResult; drill: Drill; onAgain: () => void; onLeave: () => void }) {
  const finished = result.phases.filter((p) => p.finished);
  return (
    <section className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5" data-drill-result={result.status}>
      <h2 className="text-xl font-black text-white">{result.status === 'complete' ? `${drill.name}: done` : `${drill.name}: stopped early`}</h2>
      {result.status !== 'complete' && <p className="text-sm text-white/60">The phases you finished are below; the one you stopped in is not scored.</p>}
      <ul className="space-y-2">
        {finished.map((p) => (
          <li key={p.id} className="rounded-xl bg-black/30 px-3 py-2 text-sm text-white/80">
            <span className="font-bold text-white">{p.name}</span>
            {p.targets > 0
              ? <> · {p.counts.PERFECT + p.counts.GREAT + p.counts.GOOD} of {p.targets} on the beat{p.holds.held + p.holds.broken > 0 ? ` · ${p.holds.held} held, ${p.holds.broken} broken` : ''}</>
              : <> · guided, nothing to score</>}
          </li>
        ))}
      </ul>
      {result.accuracy !== null && <p className="text-sm text-white/70">Timing overall: <span className="font-bold text-white">{pct(result.accuracy)}</span></p>}
      <p className="text-[12px] text-white/50">{RESULT_ESTIMATE_LINE}</p>
      <p className="text-[12px] text-white/50" data-drill-nothing-saved>{NOTHING_SAVED_LINE}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onAgain} className="rounded-2xl bg-white px-5 py-2.5 text-sm font-black text-black">Run it again</button>
        <button type="button" onClick={onLeave} className="rounded-2xl border border-white/20 px-4 py-2.5 text-sm font-bold text-white/75">Back to the drill</button>
      </div>
    </section>
  );
}

function Running({ view, drill, onEnd }: { view: LiveDrillView; drill: Drill; onEnd: () => void }) {
  const run = view.run;
  const phase = run?.phase ?? null;
  const waitLine = run?.status === 'positioning' ? STEP_IN_LINE : run?.status === 'paused' ? STEP_BACK_LINE : null;
  const left = run ? Math.ceil(run.remainingSec) : null;
  return (
    <section className="space-y-3" data-drill-running={run?.status ?? 'starting'}>
      <div className="flex items-baseline justify-between gap-3 text-white">
        <h2 className="text-lg font-black">{phase?.name ?? drill.name}</h2>
        {left !== null && <span className="font-mono text-sm tabular-nums text-white/60">{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')} left</span>}
      </div>
      <div className="relative">
        <SelfView className="w-full" />
        {view.flash && (
          <div className="pointer-events-none absolute right-3 top-3 rounded-lg bg-black/70 px-3 py-1 text-lg font-black"
            style={{ color: view.flash.label === 'MISS' ? '#FF6B6B' : view.flash.label === 'GOOD' ? '#FFD700' : '#00FF9D' }}
            data-drill-flash={view.flash.label}>
            {view.flash.label}
          </div>
        )}
        {waitLine && (
          <div className="absolute inset-x-3 bottom-3 rounded-xl bg-black/75 px-3 py-2 text-center text-lg font-black text-white" aria-live="polite">{waitLine}</div>
        )}
      </div>
      {run && run.cues.length > 0 && <CueLane cues={run.cues} />}
      {run?.line && <p className="text-xl font-black leading-snug text-white sm:text-2xl" aria-live="polite" data-drill-line>{run.line}</p>}
      {phase?.pacer && run && (
        <BreathPacer spec={{ ...phase.pacer, restSec: 0 }} elapsedSec={run.phaseSec} size="md" id="drill" />
      )}
      {view.caption && <p className="text-sm text-[#00E5FF]" data-drill-caption>Coach: {view.caption}</p>}
      <button type="button" onClick={onEnd} className="rounded-2xl border border-white/20 px-4 py-2.5 text-sm font-bold text-white/75">End the drill</button>
    </section>
  );
}

export function DrillLive({ drill, onLeave }: { drill: Drill; onLeave: () => void }) {
  const [wake, setWake] = useState<WakeLockState>('off');
  const { handle, view } = useLiveDrill(setWake);
  const body = useBodyPlay();

  // the drill as it was when the tap mounted this: a parent re-render never reopens it (and never restarts the camera)
  const drillRef = useRef(drill);
  const start = useCallback(() => { void handle?.live.open(drillRef.current); }, [handle]);
  // the drill opens once the controller exists (the tap that mounted this is the camera's tap)
  useEffect(() => { start(); }, [start]);

  const leave = () => { handle?.live.close(); onLeave(); };
  const wakeLine = view.phase === 'setup' || view.phase === 'playing' ? wakeLockLine(wake) : null;

  let stage: JSX.Element;
  if (view.phase === 'done' && view.result) {
    stage = <ResultCard result={view.result} drill={drill} onAgain={start} onLeave={leave} />;
  } else if (body.grownUp === 'ask') {
    stage = (
      <div data-drill-grown-up="" className="max-w-md">
        <GrownUpStep onContinue={() => { void bodyPlay.confirmGrownUp(); }} />
      </div>
    );
  } else if (view.phase === 'playing') {
    stage = <Running view={view} drill={drill} onEnd={() => handle?.live.finish()} />;
  } else if ((view.phase === 'setup' || view.phase === 'paused') && body.stage !== 'off') {
    stage = body.collapsed ? (
      <button type="button" onClick={() => bodyPlay.collapse(false)}
        className="rounded-full border border-[#00FF9D]/50 px-3 py-1 text-[12px] font-bold text-[#00FF9D]">Space check on · Show</button>
    ) : (
      <div className="relative min-h-[78vh] overflow-hidden rounded-2xl">
        <SpaceCheckPanel onStart={() => handle?.live.go()} variant={view.phase === 'paused' ? 'paused' : 'ready'} />
      </div>
    );
  } else {
    // the camera is off: hidden mid-drill (paused), or switched off at the space check
    stage = (
      <section className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5" data-drill-camera-off={view.phase}>
        <p className="text-lg font-black text-white">{view.phase === 'paused' ? PAUSED_LINE : 'The camera is off.'}</p>
        {view.phase === 'paused' && view.run && <p className="text-sm text-white/60">Your place is kept: {view.run.phase?.name ?? drill.name}.</p>}
        <button type="button" onClick={() => { void handle?.live.cameraBack(); }}
          className="rounded-2xl bg-white px-5 py-2.5 text-sm font-black text-black">Turn the camera on</button>
      </section>
    );
  }

  return (
    <div className="space-y-3" data-drill-live={view.phase}>
      {view.waiting && <p className="text-sm text-white/70">Starting as soon as the space check says all set.</p>}
      {stage}
      {wakeLine && <p className="text-[12px] text-amber-200/80">{wakeLine}</p>}
      {view.phase !== 'done' && (
        <button type="button" onClick={leave} className="text-sm text-white/55 underline">Leave the drill</button>
      )}
    </div>
  );
}
