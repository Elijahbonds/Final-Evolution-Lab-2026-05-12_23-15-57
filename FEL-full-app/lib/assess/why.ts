// why — every score traced to what the camera measured, on which rep, and what it tends to mean (spec §6).
//
// A reason is a TEMPLATE FILLED WITH MEASURED NUMBERS, never free text: the metric, the side, the value, the rep it
// happened on, the target and the fault line, what that did to the score, what it tends to mean in movement terms,
// and (when there is one) a drill hint. No condition is ever named and no cause inside the body is claimed: the
// vocabulary guard (why.test.ts, extending lib/mirror/program.test.ts and assessment.test.ts) sweeps every string
// this file can produce.
//
// OWNER DEFAULT Q7 (lane brief, 2026-09-28): a reason may end with a "Fix:" hint, but every drill named there is a
// PLACEHOLDER until Elijah approves the §7.2 library — written "[PLACEHOLDER DRILL] Knee-to-wall rocks" on screen and
// flagged `placeholder: true` in data — and no dose is ever shown.
//
// Cross-test links (spec §6) connect findings instead of listing them; only the rules whose tests the Quick Screen
// runs (T1, T2, T3, T5) are here. The T7 rule waits for T7.
//
// Pure.
import type { Side, TestId } from './protocol';
import { sideLabel } from './protocol';
import { bandOf, th } from './thresholds';
import { PLACEHOLDER_TAG, PR20_DRILLS, type DrillHint } from '@/lib/screen/PROPOSED-thresholds';
import type { MetricResult, TestResult } from './scoring';

export type { DrillHint };

export type ReasonKind = 'fault' | 'note' | 'clean' | 'link' | 'status';

export interface Reason {
  testId: TestId;
  kind: ReasonKind;
  text: string;
  /** Every measured number the sentence carries: a reason without one is not a reason. */
  numbers: number[];
  metricId?: string;
  side?: Side;
  rep?: number;
  fix?: DrillHint[];
  /** For ranking: the takeoff leg's own finding. */
  jumpingLeg?: boolean;
}

export interface WhyContext {
  /** The athlete's takeoff leg (profile, or asked once in the flow: owner default Q11). */
  takeoffLeg?: Side | null;
}

export { PLACEHOLDER_TAG };

/** The §7.2 draft library, by finding (lib/screen/PROPOSED-thresholds.ts PR20_DRILLS): names only, all placeholders. */
export const DRILLS = PR20_DRILLS;

/** Said when pain stops the screen. Nothing is scored or saved after it. */
export const PAIN_REFERRAL =
  'Stopping here. Pain during a movement is a reason to see a qualified professional before screening or training '
  + 'through it. Nothing from this screen was saved.';

// ── formatting ──

const r0 = (x: number) => Math.round(x);
const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;
const CM_PER_IN = 2.54;
export const inches = (cm: number) => r1(cm / CM_PER_IN);

interface Fmt { v: (x: number) => string; n: (x: number) => number }
const DEG: Fmt = { v: (x) => `${r0(x)}°`, n: r0 };
const RATIO: Fmt = { v: (x) => `${r2(x)}`, n: r2 };
const PCT: Fmt = { v: (x) => `${r0(x * 100)}%`, n: (x) => r0(x * 100) };
const MS: Fmt = { v: (x) => `${r0(x)} ms`, n: r0 };
const COUNT: Fmt = { v: (x) => `${r0(x)}`, n: r0 };

/** "(target ≥ 110°, fault under 80°)" from the metric's own band. */
function targetText(m: MetricResult, f: Fmt): string {
  const b = bandOf(m.thresholdId);
  const higher = b.good > b.poor;
  const target = `target ${higher ? '≥' : '≤'} ${f.v(b.good)}`;
  if (b.fault === null) return `(${target})`;
  const fault = higher ? `fault under ${f.v(b.fault)}` : `fault at ${f.v(b.fault)}`;
  return `(${target}, ${fault})`;
}

function repText(m: MetricResult, word = 'rep'): string {
  if (!m.rep) return '';
  return m.view ? ` on ${m.view}-view ${word} ${m.rep}` : ` on ${word} ${m.rep}`;
}

function sideText(side: Side | undefined, ctx: WhyContext): string {
  if (!side) return '';
  return ctx.takeoffLeg === side ? `${sideLabel(side)} (your jumping leg)` : sideLabel(side);
}

const TEST_NAME: Record<TestId, string> = {
  T1: 'Overhead squat', T2: 'Ankle range', T3: 'Single-leg squat', T4: 'Hip hinge', T5: 'Jump', T6: 'Drop landing', T7: 'Hop & stick',
};

// ── one metric → one reason ──

interface Template {
  f: Fmt;
  /** The number the sentence shows, when it is not the value itself (the hip crease says "0.02 below", not −0.02). */
  shown?: (v: number) => number;
  /** The target phrase, when the band's own numbers would read oddly. */
  target?: string;
  /** The measured phrase: "left knee moved 0.42 hip-widths inside its hip–ankle line at the bottom". */
  said: (m: MetricResult, side: string) => string;
  /** What it tends to mean, in movement terms, when the metric faulted or scored low. */
  meaning: string;
  /** The clean line, when it did not. */
  clean: string;
  fix?: readonly DrillHint[];
}

const T: Record<string, Template> = {
  // T1
  valgusLeft: {
    f: RATIO, shown: (v) => RATIO.n(Math.abs(v)),
    said: (m, s) => `${s} knee sat ${RATIO.v(Math.abs(m.value!))} hip half-widths ${m.value! >= 0 ? 'inside' : 'outside'} its hip–ankle line at the bottom`,
    meaning: 'The knee is taking rotation the hip should control, which is where landing forces go wrong.',
    clean: 'The knee tracked over the foot.', fix: DRILLS.knee,
  },
  lateralShift: {
    f: RATIO, said: (m) => `Weight moved ${RATIO.v(m.value!)} hip widths to one side`,
    meaning: 'More of the load went through one leg than the other.', clean: 'The weight stayed centred.', fix: DRILLS.shift,
  },
  depthKneeFlex: {
    f: DEG, said: (m) => `Knee bend at the bottom reached ${DEG.v(m.value!)}`,
    meaning: 'The hips did not get down between the feet: the ankles, hips or upper back ran out of range first.',
    clean: 'Full depth.', fix: DRILLS.squatPattern,
  },
  hipCrease: {
    f: RATIO, shown: (v) => RATIO.n(Math.abs(v)), target: '(target: at or below the knee line; fault: above it)', said: (m) => (m.value! > 0 ? `The hip crease stayed ${RATIO.v(m.value!)} thigh lengths above the knee line` : `The hip crease reached ${RATIO.v(-m.value!)} thigh lengths below the knee line`),
    meaning: 'The hips stayed above parallel.', clean: 'The hips got below the knees.', fix: DRILLS.squatPattern,
  },
  trunkTibia: {
    f: DEG, said: (m) => `The trunk leaned ${DEG.v(Math.abs(m.value!))} ${m.value! >= 0 ? 'further forward than' : 'more upright than'} the shins`,
    meaning: 'The chest folded forward past the shins, which moves the load off the legs and onto the back.',
    clean: 'Trunk and shins stayed close to parallel.', fix: DRILLS.squatPattern,
  },
  shoulderFlex: {
    f: DEG, said: (m) => `The arms held ${DEG.v(m.value!)} from the trunk overhead`,
    meaning: 'The arms drifted forward from overhead: the upper back and shoulders ran out of range before the legs did.',
    clean: 'The arms stayed overhead.', fix: DRILLS.arms,
  },
  heelRise: {
    f: COUNT, target: '(target: heels down on every rep; any rep is a fault)', said: (m, s) => `${m.value! > 0 ? `${s ? `The ${s.toLowerCase()} heel` : 'The heels'} came up on ${COUNT.v(m.value!)} rep${m.value! === 1 ? '' : 's'}, first` : 'The heels stayed down on every rep'}`,
    meaning: 'The weight moved onto the toes: ankle range or balance ran out before the depth did.',
    clean: 'The heels stayed down.', fix: DRILLS.ankle,
  },
  // T2
  tibia: {
    f: DEG, said: (m, s) => `${s} shin reached ${DEG.v(m.value!)} from vertical with the heel down`,
    meaning: 'That is how far the ankle bends under load; deep squats and soft landings both need it.',
    clean: 'Plenty of ankle range.', fix: DRILLS.ankle,
  },
  // T3
  fppa: {
    f: DEG, shown: (v) => DEG.n(Math.abs(v)),
    said: (m, s) => `${s} knee moved ${DEG.v(Math.abs(m.value!))} ${m.value! >= 0 ? 'toward' : 'away from'} the midline at the bottom (against your standing line)`,
    meaning: 'The knee drifted in as you went down on one leg, the same pattern a one-foot landing shows under load.',
    clean: 'The knee stayed over the foot.', fix: DRILLS.knee,
  },
  pelvicDrop: {
    f: DEG, said: (m, s) => `Standing on the ${s.toLowerCase()} leg, the opposite hip dropped ${DEG.v(m.value!)}`,
    meaning: 'The standing hip let the pelvis tip instead of holding it level.', clean: 'The pelvis stayed level.', fix: DRILLS.pelvis,
  },
  trunkLean: {
    f: DEG, said: (m) => `The trunk leaned ${DEG.v(m.value!)} sideways at the bottom`,
    meaning: 'The trunk leaned to stay balanced over the standing leg.', clean: 'The trunk stayed upright.', fix: DRILLS.pelvis,
  },
  depth: {
    f: DEG, said: (m) => `The knee bent ${DEG.v(m.value!)}`,
    meaning: 'The single-leg squat stayed shallow.', clean: 'Good depth.', fix: DRILLS.knee,
  },
  balance: {
    f: COUNT, target: '(target: none; any caps the test at 1/3)', said: (m) => `The free foot touched down or you hopped on ${COUNT.v(m.value!)} rep${m.value! === 1 ? '' : 's'}`,
    meaning: 'The pattern was not held on one leg, which caps this test at 1/3.', clean: 'Balance held on every rep.', fix: DRILLS.balance,
  },
  // T5
  landingFlex: {
    f: PCT, said: (m) => `On landing your hips dropped ${PCT.v(m.value!)} of standing hip height`,
    meaning: 'The landing was stiff: the force went up through the legs instead of being absorbed.', clean: 'Soft landings.', fix: DRILLS.landing,
  },
  landingValgusLeft: {
    f: DEG, shown: (v) => DEG.n(Math.abs(v)),
    said: (m, s) => `${s} knee moved ${DEG.v(Math.abs(m.value!))} ${m.value! >= 0 ? 'toward' : 'away from'} the midline on landing`,
    meaning: 'The knee drifted in as you absorbed the landing.', clean: 'The knee stayed over the foot on landing.', fix: DRILLS.knee,
  },
  landingSym: {
    f: MS, said: (m) => `Your feet touched down ${MS.v(m.value!)} apart`,
    meaning: 'One leg took the landing before the other.', clean: 'Both feet landed together.', fix: DRILLS.landingSides,
  },
};
T.valgusRight = T.valgusLeft;
T.landingValgusRight = T.landingValgusLeft;

/** One metric as a reason, or null when it was not read. */
export function metricReason(m: MetricResult, testId: TestId, ctx: WhyContext = {}): Reason | null {
  const tpl = T[m.id];
  if (!tpl) return null;
  if (m.value === null) {
    if (!m.note) return null;
    return { testId, kind: 'note', text: `${m.label}: ${m.note}.`, numbers: [], metricId: m.id, ...(m.side ? { side: m.side } : {}) };
  }
  const side = sideText(m.side, ctx);
  const measured = `${tpl.said(m, side)}${repText(m, testId === 'T5' ? 'jump' : 'rep')} ${tpl.target ?? targetText(m, tpl.f)}.`;
  const low = m.fault || (m.score !== null && m.score < th('score.bands03').three);
  const effect = m.fault
    ? ` A fault here caps ${TEST_NAME[testId]} at 2/3.`
    : m.score !== null && m.weight > 0 ? ` ${m.score}/100 on this check.` : '';
  const tail = low ? ` ${tpl.meaning}` : ` ${tpl.clean}`;
  const fix = low && tpl.fix ? [...tpl.fix] : undefined;
  const fixText = fix ? ` Fix: ${fix.map((d) => d.label).join(', ')}.` : '';
  return {
    testId, kind: m.fault ? 'fault' : low ? 'note' : 'clean',
    text: `${measured}${effect}${tail}${fixText}`,
    numbers: [tpl.shown ? tpl.shown(m.value) : tpl.f.n(m.value)],
    metricId: m.id, ...(m.side ? { side: m.side } : {}), ...(m.rep ? { rep: m.rep } : {}), ...(fix ? { fix } : {}),
    ...(m.side && ctx.takeoffLeg === m.side ? { jumpingLeg: true } : {}),
  };
}

/** Every reason a test carries: a status line when it was not scored, else one per metric read, plus its own extras. */
export function reasonsFor(test: TestResult & { t2?: { rejected: { side: Side; rep: number; heelLiftPct: number }[]; lrDiffDeg: number | null } }, ctx: WhyContext = {}): Reason[] {
  const id = test.id;
  if (test.status === 'painStop') return [{ testId: id, kind: 'status', text: `${TEST_NAME[id]}: 0/3, pain reported. ${PAIN_REFERRAL}`, numbers: [0] }];
  if (test.status === 'notBuilt') return [{ testId: id, kind: 'status', text: `${TEST_NAME[id]}: Full screen: coming later.`, numbers: [] }];
  if (test.status === 'skipped') return [{ testId: id, kind: 'status', text: `${TEST_NAME[id]}: skipped.`, numbers: [] }];
  if (test.status === 'notScored') {
    const pct = Math.round(test.confidence * 100);
    return [{
      testId: id, kind: 'status', numbers: [pct],
      text: `${TEST_NAME[id]}: not scored. The camera read ${pct}% of it clearly and needs ${Math.round(th('gate.minConfidence') * 100)}%. Step back so your whole body stays in the shot, and try it again.`,
    }];
  }
  const out: Reason[] = [];
  // the jump's height first: the number the test is for
  if (id === 'T5' && test.t5) {
    const x = test.t5;
    if (x.bestHeightCm !== null && x.bestFlightMs !== null) {
      const pm = x.heightPlusMinusCm !== null ? `, ±${inches(x.heightPlusMinusCm)} in` : '';
      out.push({
        testId: id, kind: 'note', rep: x.bestJump ?? undefined,
        numbers: [inches(x.bestHeightCm), r1(x.bestHeightCm), r2(x.bestFlightMs / 1000), r0(x.poseFps)],
        text: `Jump ${inches(x.bestHeightCm)} in (${r1(x.bestHeightCm)} cm), best of ${x.jumps.filter((j) => j.valid).length}: estimated from a ${r2(x.bestFlightMs / 1000)} s flight at ${r0(x.poseFps)} fps${pm}.${x.fpsLow ? ` Under ${th('gate.jumpFps')} fps each end of the flight can be a frame out, so read it as a range.` : ''}`,
      });
    }
    for (const j of x.jumps.filter((q) => !q.valid)) {
      out.push({ testId: id, kind: 'note', rep: j.index, numbers: [j.index], text: `Jump ${j.index} was not counted: ${j.invalidWhy}.` });
    }
    if (x.cvPct !== null && x.inconsistent) {
      out.push({ testId: id, kind: 'note', numbers: [x.cvPct], text: `Your jump heights varied by ${x.cvPct}% between jumps, so effort or technique changed from one to the next.` });
    }
  }
  for (const key of ['both', 'left', 'right'] as const) {
    const s = test.sides[key];
    if (!s) continue;
    for (const m of s.metrics) {
      const r = metricReason(m, id, ctx);
      if (r) out.push(r);
    }
    if (!s.complete) {
      const views = s.views ? ` (front ${s.views.front.valid}, side ${s.views.side.valid})` : '';
      out.push({
        testId: id, kind: 'note', numbers: [s.repsValid],
        ...(key !== 'both' ? { side: key } : {}),
        text: `${key !== 'both' ? `${sideText(key, ctx)}: ` : ''}${s.repsValid} valid rep${s.repsValid === 1 ? '' : 's'}${views}, fewer than the ${th('gate.minValidReps')} the score needs, so it is capped at 1/3.`,
      });
    }
  }
  if (test.t2) {
    for (const rj of test.t2.rejected) {
      out.push({ testId: id, kind: 'note', side: rj.side, rep: rj.rep, numbers: [rj.heelLiftPct], text: `${sideText(rj.side, ctx)} rock ${rj.rep} was not counted: the heel lifted ${rj.heelLiftPct}% of your height.` });
    }
  }
  if (test.asymmetry?.flagged) {
    const a = test.asymmetry;
    const nums: number[] = [];
    const parts: string[] = [];
    if (a.pointsDiff !== null) { nums.push(a.pointsDiff); parts.push(`the sides scored ${a.pointsDiff} points apart`); }
    if (a.metric) { nums.push(r0(a.metric.value)); parts.push(`${a.metric.label.toLowerCase()} ${r0(a.metric.value)}${a.metric.unit} (flag at ${a.metric.limit}${a.metric.unit})`); }
    out.push({
      testId: id, kind: 'fault', numbers: nums, ...(a.weaker ? { side: a.weaker, jumpingLeg: ctx.takeoffLeg === a.weaker } : {}),
      text: `Asymmetry: ${parts.join(', ')}.${a.weaker ? ` The ${sideText(a.weaker, ctx).toLowerCase()} side scored lower.` : ''} One side clearly off matters more than both sides mildly off.`,
    });
  }
  return out;
}

// ── cross-test links (spec §6) ──

const metricOf = (t: TestResult | undefined, side: 'both' | Side, id: string) => t?.sides[side]?.metrics.find((m) => m.id === id);

export function crossLinks(tests: readonly TestResult[], ctx: WhyContext = {}): Reason[] {
  const by = (id: TestId) => tests.find((t) => t.id === id && t.status === 'scored');
  const t1 = by('T1'), t2 = by('T2'), t3 = by('T3'), t5 = by('T5');
  const out: Reason[] = [];
  const restricted = bandOf('t2.tibia').fault!;
  const heel = metricOf(t1, 'both', 'heelRise');
  if (heel?.fault && t2) {
    const sides: Side[] = heel.side ? [heel.side] : ['left', 'right'];
    const tight = sides.map((s) => ({ s, v: metricOf(t2, s, 'tibia')?.value })).filter((x): x is { s: Side; v: number } => x.v != null && x.v < restricted);
    if (tight.length) {
      const w = tight.reduce((a, b) => (b.v < a.v ? b : a));
      out.push({ testId: 'T1', kind: 'link', side: w.s, numbers: [r0(w.v)], jumpingLeg: ctx.takeoffLeg === w.s,
        text: `Heel rise in the overhead squat is most likely an ankle-range limit: your ${sideText(w.s, ctx).toLowerCase()} shin reached only ${r0(w.v)}° with the heel down (the line is ${restricted}°).` });
    } else {
      const l = metricOf(t2, 'left', 'tibia')?.value, r = metricOf(t2, 'right', 'tibia')?.value;
      if (l != null && r != null) {
        out.push({ testId: 'T1', kind: 'link', numbers: [r0(l), r0(r)],
          text: `Your heels rose in the overhead squat with normal ankle range (${r0(l)}° left, ${r0(r)}° right), so it is more likely the weight shifting forward, or balance.` });
      }
    }
  }
  for (const s of ['left', 'right'] as const) {
    const fp = metricOf(t3, s, 'fppa');
    if (!fp?.fault) continue;
    const drop = metricOf(t3, s, 'pelvicDrop');
    if (drop?.fault) {
      out.push({ testId: 'T3', kind: 'link', side: s, numbers: [r0(fp.value!), r0(drop.value!)], jumpingLeg: ctx.takeoffLeg === s,
        text: `Hip control on the ${sideText(s, ctx).toLowerCase()} leg is the lead finding: the knee moved ${r0(fp.value!)}° toward the midline and the opposite hip dropped ${r0(drop.value!)}° in the same single-leg squat.` });
    }
    const tib = metricOf(t2, s, 'tibia');
    if (tib?.value != null && tib.value < restricted) {
      out.push({ testId: 'T3', kind: 'link', side: s, numbers: [r0(tib.value), r0(fp.value!)], jumpingLeg: ctx.takeoffLeg === s,
        text: `Ankle range may be forcing the ${sideText(s, ctx).toLowerCase()} knee inward: that shin reached only ${r0(tib.value)}° with the heel down, and the knee moved ${r0(fp.value!)}° in on the single-leg squat.` });
    }
    const land = metricOf(t5, 'both', s === 'left' ? 'landingValgusLeft' : 'landingValgusRight');
    if (land?.fault) {
      out.push({ testId: 'T5', kind: 'link', side: s, numbers: [r0(fp.value!), r0(land.value!)], jumpingLeg: ctx.takeoffLeg === s,
        text: `The ${sideText(s, ctx).toLowerCase()} knee pattern shows up in slow and fast movement (${r0(fp.value!)}° on the single-leg squat, ${r0(land.value!)}° on landing), so it is a priority.` });
    }
  }
  return out;
}

// ── the top findings (spec §8 results page, ranked as §7.3: jumping leg > asymmetry > mobility > control > landing) ──

const CATEGORY: Record<string, number> = {
  tibia: 2, heelRise: 2, depthKneeFlex: 2, hipCrease: 2, shoulderFlex: 2, trunkTibia: 2,
  valgusLeft: 3, valgusRight: 3, lateralShift: 3, fppa: 3, pelvicDrop: 3, trunkLean: 3, depth: 3, balance: 3,
  landingFlex: 4, landingValgusLeft: 4, landingValgusRight: 4, landingSym: 4,
};

export function topFindings(tests: readonly TestResult[], ctx: WhyContext = {}, n = 3): Reason[] {
  const links = crossLinks(tests, ctx);
  const faults = tests.flatMap((t) => reasonsFor(t, ctx)).filter((r) => r.kind === 'fault');
  const rank = (r: Reason) => (r.kind === 'link' ? 0 : r.jumpingLeg ? 1 : r.metricId ? (CATEGORY[r.metricId] ?? 5) + 1 : 2);
  const all = [...links, ...faults].map((r, i) => ({ r, i })).sort((a, b) => (rank(a.r) - rank(b.r)) || (a.i - b.i)).map((x) => x.r);
  // one finding per test-and-side-and-metric: a link already covers the faults it names
  const seen = new Set<string>();
  const out: Reason[] = [];
  for (const r of all) {
    const key = `${r.testId}|${r.side ?? ''}|${r.metricId ?? r.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
    if (out.length >= n) break;
  }
  return out;
}

/** Every fixed string this file can say (templates' meanings and clean lines, drill labels, the referral): for the guard. */
export function fixedStrings(): string[] {
  return [
    PAIN_REFERRAL,
    ...Object.values(T).flatMap((t) => [t.meaning, t.clean]),
    ...Object.values(DRILLS).flatMap((ds) => ds.map((d) => d.label)),
  ];
}
