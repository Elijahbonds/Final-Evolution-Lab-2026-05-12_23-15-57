// tests/helpers/cueTiming.ts — CUE-REWRITE (2026-10-27): the Mirror's live coach driven the way the harness drives it
// (app/play/mirror/_components/mirror-harness.tsx), over synthetic pose feeds, with every spoken line logged on the pose
// clock — so the cue TIMING can be measured: how many lines a rep, the gap between them, and whether two lines contradict
// each other inside a window.
//
// Squat: SquatAudit → stepSquatSession → CueEngine({ clearByRep }) → endRep, the harness's squat branch line for line.
// Side-on patterns (hinge, push-up): applySideRepFrame, the harness's own wiring. Synthetic bodies only.
import { SquatAudit } from '@/lib/babylon/nexus/neuro-mirror/rules/squat-audit';
import { CueEngine, type CueEvent, type CueTable, type FaultId } from '@/lib/babylon/nexus/neuro-mirror/rules/cue-engine';
import { DEEPER_LINE, SQUARE_UP_LINE, initialSquatSession, stepSquatSession } from '@/lib/mirror/squatStage';
import { applySideRepFrame, initialSideRep, type SideRepSpec } from '@/lib/mirror/sideRepStage';
import { adapterFromPose } from '@/lib/mirror/fixtures';
import type { PoseFrame } from '@/lib/pose/landmarks';

export interface Said { t: number; text: string; fault: string | null; level: string; stage: string; rep: number }

/** Words a second a phone voice says (the harness's speakNatural at rate 0.96 reads about 2.5 words a second). */
export const WORDS_PER_SEC = 2.5;
export const sayMs = (text: string): number => (text.split(/\s+/).filter(Boolean).length / WORDS_PER_SEC) * 1000;

/** The squat, from the check stage (the breathing stage says nothing): 3 check reps, then the work set. */
export function squatCoach(frames: readonly PoseFrame[]): { said: Said[]; workReps: number } {
  const audit = new SquatAudit();
  const engine = new CueEngine({ clearByRep: true });
  let state = { ...initialSquatSession(), stage: 'check' as const } as ReturnType<typeof initialSquatSession>;
  const said: Said[] = [];
  for (const f of adapterFromPose(frames)) {
    const now = f.timestampMs;
    const r = audit.evaluate(f);
    const was = state.stage;
    const step = stepSquatSession(state, { nowMs: now, phase: r.phase, present: r.present, faults: r.faults, square: r.square, hipDrop: r.hipDrop });
    state = step.state;
    const rep = state.workReps.length;
    if (step.squareUp) said.push({ t: now, text: SQUARE_UP_LINE, fault: null, level: 'line', stage: state.stage, rep });
    if (step.deeperPrompt) said.push({ t: now, text: DEEPER_LINE, fault: null, level: 'line', stage: state.stage, rep });
    if (step.cueFaults) {
      const evt = engine.decide(now, step.cueFaults as FaultId[]);
      if (evt) said.push({ t: now, text: evt.text, fault: evt.fault, level: evt.level, stage: was, rep });
    }
    if (was === 'work' && step.repCounted) engine.endRep(state.workReps[state.workReps.length - 1] ?? []);
  }
  return { said, workReps: state.workReps.length };
}

/** A side-on pattern (the hinge, the push-up), through the harness's own applySideRepFrame. */
export function sideCoach<F extends string>(spec: SideRepSpec<F>, table: CueTable<F>, frames: readonly PoseFrame[]): { said: Said[]; workReps: number } {
  const ref = { current: initialSideRep<F>() };
  const engine = new CueEngine<F>({ clearByRep: true, table });
  const said: Said[] = [];
  let t = 0;
  for (const f of frames) {
    t = f.t;
    applySideRepFrame(spec, ref, engine, f, (x) => x, {
      state: () => {},
      cue: (evt: CueEvent<F>) => said.push({ t, text: evt.text, fault: evt.fault, level: evt.level, stage: ref.current.stage, rep: ref.current.workReps.length }),
      say: (line) => said.push({ t, text: line, fault: null, level: 'line', stage: ref.current.stage, rep: ref.current.workReps.length }),
      review: () => {},
    });
  }
  return { said, workReps: ref.current.workReps.length };
}

export interface TimingReport {
  /** Correction lines (cue / reply / escalate / regress) in the work set, per work rep. */
  correctionsPerRep: number;
  /** Every spoken line in the work set, per work rep (confirmations and stage lines too). */
  linesPerRep: number;
  /** Lines that start before the line before them has finished being said (the voice cuts itself off or stacks). */
  overlaps: number;
  /** Pairs inside `windowMs` that contradict: a praise ("That's it") and a correction for the same fault, either order. */
  contradictions: { a: string; b: string; ms: number }[];
  /** The shortest gap between the end of one line and the start of the next (ms). */
  minGapMs: number | null;
}

export function timing(run: { said: Said[]; workReps: number }, windowMs = 6000): TimingReport {
  const work = run.said.filter((s) => s.stage === 'work');
  const corrections = work.filter((s) => s.level === 'cue' || s.level === 'reply' || s.level === 'escalate' || s.level === 'regress');
  let overlaps = 0; let minGap: number | null = null;
  const contradictions: TimingReport['contradictions'] = [];
  for (let i = 1; i < run.said.length; i++) {
    const p = run.said[i - 1], s = run.said[i];
    const gap = s.t - (p.t + sayMs(p.text));
    if (gap < 0) overlaps++;
    minGap = minGap === null ? gap : Math.min(minGap, gap);
  }
  for (let i = 0; i < run.said.length; i++) for (let j = i + 1; j < run.said.length; j++) {
    const a = run.said[i], b = run.said[j];
    if (b.t - a.t > windowMs) break;
    const praise = (x: Said) => x.level === 'confirm';
    const corr = (x: Said) => x.level !== 'confirm' && x.level !== 'line';
    if (a.fault && a.fault === b.fault && ((praise(a) && corr(b)) || (corr(a) && praise(b)))) contradictions.push({ a: a.text, b: b.text, ms: b.t - a.t });
  }
  const reps = Math.max(1, run.workReps);
  return { correctionsPerRep: corrections.length / reps, linesPerRep: work.length / reps, overlaps, contradictions, minGapMs: minGap };
}
