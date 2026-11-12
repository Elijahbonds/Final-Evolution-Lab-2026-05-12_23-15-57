// The movement words on the rig (CUE-REWRITE, 2026-10-27): the Mirror's and the Quick Screen's result cards and what the
// live coach says, rendered by their real components from real synthetic sets — no server, no camera. Bundled by
// scripts/probes/_cue-rewrite-probe.mts. Written against APIs the base tree has too, so the same entry shoots the
// before (lane base 36593d3a) and the after. Scene = location.hash.
//   screen-results  : the Quick Screen's results for an adult with a caving left knee and a stiff right ankle
//   mirror-steps    : the Movement Screen's "what to work on" card, a hip-level flag
//   hinge-review    : the hip hinge after a knee-dominant set: what the coach said (transcript) and the review card
//   squat-coach     : the squat with a caving knee: every line the coach says, on the pose clock
//   hinge-framing   : the hinge's card before Start
import { createElement as h, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { ResultsView } from '@/app/play/mirror/assess/_components/results-view';
import { gradeSession } from '@/lib/assess/runner';
import { cmj, kneeWall, ohsFront, ohsSide, singleLegSquat, syntheticCalibration } from '@/lib/assess/replay';
import { summarize } from '@/lib/screen/checks';
import { ScreenNextSteps } from '@/components/mirror/screen-next-steps';
import { regradeFromSummary, type StationGrade } from '@/lib/mirror/stationGraders';
import { SideRepFraming, SideRepReviewCard } from '@/app/play/mirror/_components/side-rep-panels';
import { HINGE_CUE_TABLE, HINGE_FAULT_LABEL, HINGE_FRAMING, HINGE_LIVE } from '@/lib/mirror/hingeStage';
import { applySideRepFrame, initialSideRep } from '@/lib/mirror/sideRepStage';
import { hingeSet } from '@/lib/mirror/fixtures/sideRepBuild';
import { CueEngine, type CueEvent, type FaultId } from '@/lib/babylon/nexus/neuro-mirror/rules/cue-engine';
import { SquatAudit } from '@/lib/babylon/nexus/neuro-mirror/rules/squat-audit';
import { DEEPER_LINE, SQUARE_UP_LINE, SQUAT_FAULT_LABEL, initialSquatSession, squatReviewVerdict, stepSquatSession } from '@/lib/mirror/squatStage';
import { adapterFromPose, filmFixture } from '@/lib/mirror/fixtures';
import type { PoseFrame } from '@/lib/pose/landmarks';

const scene = location.hash.slice(1) || 'screen-results';
const page = (title: string, ...kids: ReactNode[]) => h('main', { className: 'mx-auto max-w-[430px] space-y-4 p-4 text-white' },
  h('p', { className: 'font-mono text-[11px] uppercase tracking-[0.18em] text-white/40' }, `rig · ${title}`), ...kids);
const said = (lines: { t: number; level: string; text: string }[]) => h('section', { 'data-said': true, className: 'rounded-2xl border border-white/10 bg-white/[0.03] p-4' },
  h('h2', { className: 'text-[15px] font-bold text-white/80' }, 'What the athlete hears (the live coach, on the pose clock)'),
  h('ol', { className: 'mt-2 space-y-1.5' }, ...lines.map((l, i) => h('li', { key: i, 'data-line': l.level, className: 'text-[14px] text-white/85' },
    h('span', { className: 'mr-2 font-mono text-[11px] text-white/40' }, `${(l.t / 1000).toFixed(1)} s · ${l.level}`), l.text))));

function squatRun() {
  const frames: PoseFrame[] = [];
  let base = 0;
  for (let i = 0; i < 11; i++) {
    const take = filmFixture(i < 7 ? 'squat_knee_in_left' : 'squat_clean');
    const t0 = take[0].t;
    for (const f of take) frames.push({ ...f, t: base + (f.t - t0) });
    base = frames[frames.length - 1].t + 1000 / 30;
  }
  const audit = new SquatAudit();
  const engine = new CueEngine({ clearByRep: true });
  let st = { ...initialSquatSession(), stage: 'check' } as ReturnType<typeof initialSquatSession>;
  const lines: { t: number; level: string; text: string }[] = [];
  const log: CueEvent<string>[] = [];
  for (const f of adapterFromPose(frames)) {
    const r = audit.evaluate(f);
    const was = st.stage;
    const step = stepSquatSession(st, { nowMs: f.timestampMs, phase: r.phase, present: r.present, faults: r.faults, square: r.square, hipDrop: r.hipDrop });
    st = step.state;
    if (step.squareUp) lines.push({ t: f.timestampMs, level: 'line', text: SQUARE_UP_LINE });
    if (step.deeperPrompt) lines.push({ t: f.timestampMs, level: 'line', text: DEEPER_LINE });
    if (step.cueFaults) { const e = engine.decide(f.timestampMs, step.cueFaults as FaultId[]); if (e) { lines.push({ t: f.timestampMs, level: e.level, text: e.text }); log.push(e); } }
    if (was === 'work' && step.repCounted) engine.endRep(st.workReps[st.workReps.length - 1] ?? []);
  }
  const verdict = squatReviewVerdict(st.workReps, log, { cueable: (x) => [...x], kneeJudged: true });
  return { lines, verdict: verdict.line, labels: SQUAT_FAULT_LABEL };
}

function hingeRun() {
  const ref = { current: initialSideRep<string>() };
  const engine = new CueEngine<string>({ clearByRep: true, table: HINGE_CUE_TABLE as never });
  const lines: { t: number; level: string; text: string }[] = [];
  const log: CueEvent<string>[] = [];
  let fade: string[] = [];
  for (const f of hingeSet({ reps: 11, setup: 75, rep: () => ({ backM: 0.05, dropM: 0.30, trunkDeg: 30 }) })) {
    applySideRepFrame(HINGE_LIVE as never, ref as never, engine as never, f, (x: string) => (HINGE_FAULT_LABEL as Record<string, string>)[x] ?? x, {
      state: () => {}, cue: (e: CueEvent<string>) => { lines.push({ t: f.t, level: e.level, text: e.text }); log.push(e); },
      say: (line: string) => { lines.push({ t: f.t, level: 'line', text: line }); }, review: (l: string[]) => { fade = l; },
    } as never);
  }
  return { lines, state: ref.current, log, fade };
}

const S = {
  heelLine: { checkId: 'heelLine', value: 2, bySide: { left: 2, right: 1 }, unit: 'deg', frames: 360, readableFrames: 360, uncertainty: 0.5, spread: 4 },
  kneeWindow: { checkId: 'kneeWindow', value: 0.05, bySide: { left: 0.05, right: 0.02 }, unit: 'ratio', frames: 420, readableFrames: 420, uncertainty: 0.01, spread: 0.1 },
  hipLevel: { checkId: 'hipLevel', value: -0.12, unit: 'ratio', frames: 420, readableFrames: 420, uncertainty: 0.005, spread: 0.02 },
  shoulderLevel: { checkId: 'shoulderLevel', value: -0.01, unit: 'ratio', frames: 420, readableFrames: 420, uncertainty: 0.005, spread: 0.02 },
  headFloat: { checkId: 'headFloat', value: 0.02, unit: 'ratio', frames: 300, readableFrames: 300, uncertainty: 0.005, spread: 0.02 },
  singleLegL: { checkId: 'singleLeg', value: 0.03, unit: 'px-norm', frames: 900, readableFrames: 900, uncertainty: 0.01, spread: null, touchDowns: 0, stanceSec: 28, side: 'left' },
  singleLegR: { checkId: 'singleLeg', value: 0.04, unit: 'px-norm', frames: 900, readableFrames: 900, uncertainty: 0.01, spread: null, touchDowns: 2, stanceSec: 28, side: 'right' },
};

let view: ReactNode;
if (scene === 'screen-results') {
  const cal = syntheticCalibration();
  const r = gradeSession({
    calibration: cal, T1: { front: ohsFront({ kneeInL: 0.06 }).frames, side: ohsSide().frames },
    T2: { left: kneeWall('left').frames, right: kneeWall('right', { tibiaMax: 38.5 }).frames },
    T3: { left: singleLegSquat('left').frames, right: singleLegSquat('right').frames },
    T5: cmj([0, 1, 2].map(() => ({ heightM: 0.42 }))).frames,
  });
  view = page('Quick Screen · results', h(ResultsView, { summary: summarize(r)!, age: '18+', onClear: () => {}, onRunAgain: () => {} }));
} else if (scene === 'mirror-steps') {
  const grades = Object.values(S).map((x) => regradeFromSummary(x as never)!) as StationGrade[];
  view = page('Mirror · Movement Screen · what to work on', h(ScreenNextSteps, { screen: 'modified', grades, youth: null }));
} else if (scene === 'hinge-review') {
  const run = hingeRun();
  view = page('Mirror · hip hinge · a knee-dominant set', said(run.lines),
    h(SideRepReviewCard, { spec: HINGE_LIVE as never, state: run.state as never, label: (x: string) => (HINGE_FAULT_LABEL as Record<string, string>)[x] ?? x, cueLog: run.log, fadeLines: run.fade }));
} else if (scene === 'squat-coach') {
  const run = squatRun();
  view = page('Mirror · squat · the knee caves on 4 work reps, then holds', said(run.lines),
    h('p', { 'data-verdict': true, className: 'rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-[14px] leading-relaxed text-white/80' }, run.verdict));
} else {
  view = page('Mirror · hip hinge · before Start', h(SideRepFraming, { lines: HINGE_FRAMING }));
}
createRoot(document.getElementById('root')!).render(view);
