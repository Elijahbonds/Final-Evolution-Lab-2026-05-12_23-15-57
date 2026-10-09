'use client';
// The Dial-Up Breath on today's key set (MIRROR-COACH P7, 2026-09-29) — the adults-only up-regulating breath, before
// the first set, never during one (owner decision #11; lib/breath/rampGate.ts has the whole story and every rule).
//
// A THIN CLIENT OF app/api/breath/ramp. It decides nothing:
//   · on mount it asks GET whether to offer the breath for THIS set; anything but `eligible: true` (a no, a 401, a
//     network error, no endpoint at all in the dev harness) renders NOTHING — there is no "why not" line, because the
//     reasons are health answers and a key-set card is not the place to repeat them;
//   · "Dial up first" opens the one-screen explanation (FEL's words, rampExplainLines) with the stop line;
//   · Start POSTs; only a 200 runs the breath (the server re-checks every gate and logs the use), and the pacer it runs
//     is the one the server sent back. A refusal says so in one line and the set is untouched;
//   · the run is the phase's ONE pacer (components/breath/Pacer.tsx over lib/breath/pacer.ts) on this card's own
//     pausable clock, with the stop line on screen the whole time and a Stop button;
//   · when the last breath out ends it says "breathe normally, then set up" and hands off to the set (`onDone`).
// `started` (the card's own drafts: a set row with anything typed in it) hides the offer on this device the moment the
// athlete starts the set, before any save reaches the server's own set_started gate.
//
// MIRROR-COACH P7 FIX (2026-09-29, review): `started` was ONLY typed rows, and it closed only the offer and the
// explanation. The server's set_started gate sees only SAVED sets, and the card's timers write nothing it can read
// until later (a Work run writes its seconds when it stops; a Hold or Rest run writes nothing) — so after an untyped
// set 1 with the rest timer running, the offer was still there, and on a timed key set the Dial-Up could be started
// while the Work or Hold timer ran: mid-set. Today's card now also sets `started` the moment ANY of the key set's
// timers starts (app/coach/_components/today-view.tsx ExerciseCard), and here `started` closes everything before the
// breath (the offer, the explanation, a Start still in flight — whose answer then runs nothing) and CUTS a breath that
// is running (rampShown; 'interrupted'), because a sharp breath never runs once the set is under way. The card also
// hears whether the breath is running (`onRunningChange`) so the Settle chip beside it stays disabled meanwhile: one
// breath at a time on a card.
//
// Nothing is sent but one exercise id, and nothing is written until Start. Never scored, paid or streaked.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Square, Wind } from 'lucide-react';
import { BreathPacer } from '@/components/breath/Pacer';
import { isRunnablePacer, pacerClockSec, pacerEndSec, pacerView, startPacerClock, type PacerClock, type PacerSpec } from '@/lib/breath/pacer';
import {
  RAMP_DONE_LINE, RAMP_INTERRUPTED_LINE, RAMP_NAME, RAMP_OFFER, RAMP_OFFER_BUTTON, RAMP_PACER, RAMP_PHASE_LINES, RAMP_SKIP_BUTTON, RAMP_START_BUTTON,
  RAMP_STOP_LINE, rampExplainLines, rampRefusedText,
} from '@/lib/breath/rampGate';

export const RAMP_API = '/api/breath/ramp';

export type RampPhase = 'hidden' | 'offer' | 'explain' | 'starting' | 'running' | 'done' | 'stopped' | 'interrupted' | 'refused';

/**
 * What the card shows for `phase` once the set has `started` on this device (MIRROR-COACH P7 FIX): everything before
 * the breath goes (the offer, the explanation, a Start still in flight), a running breath is cut ('interrupted' — the
 * component's effect stops its clock too), and what is left after a breath stays (the done / stopped line keeps the
 * stop line on screen). Pure, so ramp-breath.test.tsx holds every phase without a DOM.
 */
export function rampShown(phase: RampPhase, started: boolean): RampPhase {
  if (!started) return phase;
  if (phase === 'offer' || phase === 'explain' || phase === 'starting') return 'hidden';
  if (phase === 'running') return 'interrupted';
  return phase;
}

/** Whether the breath owns the card's breathing right now (a Start in flight counts): the Settle chip waits. */
export const rampBusy = (phase: RampPhase): boolean => phase === 'starting' || phase === 'running';

/** The host line under the ring at `sec` into the run: what to do now (the ring's caption says which part). */
export function rampLineAt(spec: PacerSpec, sec: number): string {
  const v = pacerView(spec, sec);
  if (v.state === 'before') return RAMP_PHASE_LINES.before;
  if (v.state === 'after') return RAMP_PHASE_LINES.after;
  return v.point?.phase === 'in' ? RAMP_PHASE_LINES.in : RAMP_PHASE_LINES.out;
}

/** The stop line, always visible with the breath. */
export function RampStopLine() {
  return <div className="rounded-md border border-[#FFB020]/40 bg-[#FFB020]/10 px-2 py-1.5 text-xs font-medium text-[#FFB020]" role="note" data-ramp-stop-line>{RAMP_STOP_LINE}</div>;
}

/** The offer on the key set's card. Presentational. */
export function RampOffer({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#FFD700]/20 bg-[#FFD700]/5 px-2.5 py-1.5" data-ramp="offer">
      <div className="min-w-0 text-xs text-white/70"><span className="font-medium text-white/90">{RAMP_NAME}</span> · {RAMP_OFFER}</div>
      <button type="button" onClick={onOpen} data-ramp-open className="inline-flex items-center gap-1 rounded-md border border-[#FFD700]/40 px-2 py-1 text-xs font-medium text-[#FFD700]">
        <Wind className="h-3.5 w-3.5" aria-hidden="true" /> {RAMP_OFFER_BUTTON}
      </button>
    </div>
  );
}

/** The one-screen explanation, with the stop line and Start / Not today. Presentational. */
export function RampExplain({ usesLeft, busy = false, onStart, onSkip }: { usesLeft: number; busy?: boolean; onStart: () => void; onSkip: () => void }) {
  return (
    <div className="rounded-lg border border-[#FFD700]/30 bg-black/30 p-3 space-y-2" data-ramp="explain" role="group" aria-label={RAMP_NAME}>
      <div className="text-sm font-semibold text-white">{RAMP_NAME}</div>
      <ul className="space-y-1">
        {rampExplainLines(usesLeft).map((l) => <li key={l.id} data-ramp-line={l.id} className="text-xs text-white/75">{l.text}</li>)}
      </ul>
      <RampStopLine />
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onStart} disabled={busy} data-ramp-start
          className="rounded-lg bg-[#FFD700]/15 border border-[#FFD700]/40 px-3 py-1.5 text-sm font-medium text-[#FFD700] disabled:opacity-50">{RAMP_START_BUTTON}</button>
        <button type="button" onClick={onSkip} disabled={busy} data-ramp-skip className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-white/70">{RAMP_SKIP_BUTTON}</button>
      </div>
    </div>
  );
}

/** The breath running: the ring, what to do now, the stop line, Stop. Presentational (the host owns the clock). */
export function RampRun({ spec, sec, onStop }: { spec: PacerSpec; sec: number; onStop: () => void }) {
  return (
    <div className="rounded-lg border border-[#FFD700]/30 bg-black/30 p-3 space-y-2" data-ramp="running">
      <div className="flex items-center gap-3">
        {/* the ring shows which breath (its parts are 1 s: a seconds count would read 1 throughout); the host line below
            is the one live region */}
        <BreathPacer spec={spec} elapsedSec={sec} size="sm" id="ramp" count="breath" />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="text-[11px] uppercase tracking-wider text-white/40">{RAMP_NAME}</div>
          <div className="text-sm text-white" aria-live="polite" data-ramp-now>{rampLineAt(spec, sec)}</div>
          <button type="button" onClick={onStop} data-ramp-stop className="inline-flex items-center gap-1 rounded-md border border-white/15 px-2 py-1 text-xs text-white/80">
            <Square className="h-3 w-3" aria-hidden="true" /> Stop
          </button>
        </div>
      </div>
      <RampStopLine />
    </div>
  );
}

export interface RampBreathProps {
  /** Today's SessionExercise id: the key set. */
  sessionExerciseId: string;
  /** GET/POST /api/breath/ramp, or null (the dev harness): then nothing is offered. */
  endpoint: string | null;
  /** The set has started on this device: a set row has something typed in it, or one of the card's timers was started. */
  started?: boolean;
  /** The breath finished (not stopped): the card hands off to set 1. */
  onDone?: () => void;
  /** The breath is starting or running (true) or not (false): the card's Settle chip waits while it is. */
  onRunningChange?: (running: boolean) => void;
}

export function RampBreath({ sessionExerciseId, endpoint, started = false, onDone, onRunningChange }: RampBreathProps) {
  const [phase, setPhase] = useState<RampPhase>('hidden');
  const [usesLeft, setUsesLeft] = useState(0);
  const [spec, setSpec] = useState<PacerSpec>(RAMP_PACER);
  const [clock, setClock] = useState<PacerClock | null>(null);
  const [now, setNow] = useState(0);
  const [refused, setRefused] = useState<string | null>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const startedRef = useRef(started);
  startedRef.current = started;
  const runningRef = useRef(onRunningChange);
  runningRef.current = onRunningChange;

  // tell the card whether this breath owns its breathing (the Settle chip waits while it does)
  const busy = rampBusy(phase);
  useEffect(() => { runningRef.current?.(busy); }, [busy]);
  // the set started while the breath ran: cut it (no sharp breath once the set is under way)
  useEffect(() => {
    if (started && phase === 'running') { setClock(null); setPhase('interrupted'); }
  }, [started, phase]);

  // ask the server once per set; anything but a clear yes stays hidden
  useEffect(() => {
    if (!endpoint || !sessionExerciseId) return;
    let cancelled = false;
    const q = new URLSearchParams({ sessionExerciseId });
    fetch(`${endpoint}?${q}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { eligible?: boolean; usesLeft?: number } | null) => {
        if (cancelled) return;
        if (j?.eligible === true) { setUsesLeft(typeof j.usesLeft === 'number' ? j.usesLeft : 0); setPhase('offer'); }
      })
      .catch(() => { /* no answer is a no: the set is there as it is */ });
    return () => { cancelled = true; };
  }, [endpoint, sessionExerciseId]);

  const sec = clock ? pacerClockSec(clock, now) : 0;
  const end = pacerEndSec(spec);

  // the run's frame loop, stopping itself at the last breath out (no side effect inside a state updater)
  useEffect(() => {
    if (phase !== 'running' || !clock) return;
    let raf = 0;
    const frame = () => {
      const t = performance.now();
      setNow(t);
      if (pacerClockSec(clock, t) >= end) { setPhase('done'); doneRef.current?.(); return; }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [phase, clock, end]);

  const start = useCallback(async () => {
    if (!endpoint) return;
    setPhase('starting');
    try {
      const r = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionExerciseId }) });
      const j = await r.json().catch(() => ({})) as { pacer?: PacerSpec; reasons?: string[] };
      if (!r.ok || !isRunnablePacer(j.pacer)) { setRefused(rampRefusedText(j.reasons?.[0])); setPhase('refused'); return; }
      // the set started while Start was in flight: the use is logged (the careful direction), but nothing runs now
      if (startedRef.current) { setPhase('hidden'); return; }
      const t = performance.now();
      setSpec(j.pacer!); setNow(t); setClock(startPacerClock(t)); setPhase('running');
    } catch {
      setRefused(rampRefusedText(null)); setPhase('refused');
    }
  }, [endpoint, sessionExerciseId]);

  // the set has started on this device: nothing before the breath, and no breath (rampShown)
  switch (rampShown(phase, started)) {
    case 'hidden': return null;
    case 'offer': return <RampOffer onOpen={() => setPhase('explain')} />;
    case 'explain':
    case 'starting': return <RampExplain usesLeft={usesLeft} busy={phase === 'starting'} onStart={() => void start()} onSkip={() => setPhase('hidden')} />;
    case 'running': return <RampRun spec={spec} sec={sec} onStop={() => { setClock(null); setPhase('stopped'); }} />;
    case 'done':
    case 'stopped':
    case 'interrupted': {
      const shown = rampShown(phase, started);
      return (
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5 space-y-1.5" data-ramp={shown}>
          <div className="text-sm text-white/85" data-ramp-after>{shown === 'done' ? RAMP_DONE_LINE : shown === 'interrupted' ? RAMP_INTERRUPTED_LINE : RAMP_PHASE_LINES.after}</div>
          <RampStopLine />
        </div>
      );
    }
    case 'refused': return <div className="text-xs text-white/60" role="status" data-ramp="refused">{refused}</div>;
    default: return null;
  }
}
