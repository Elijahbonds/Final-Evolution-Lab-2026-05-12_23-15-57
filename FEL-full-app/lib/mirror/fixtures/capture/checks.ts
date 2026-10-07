// Every grader the capture is replayed through, as checks (MIRROR PHASE 3, lane/capture, 2026-10-07).
//
// A CHECK is one threshold of one grader: the shipped code runs on a captured take and says whether that fault fired
// (and, where it reports one, the value it compared). The capture's label is the truth: a GOOD take that fires is a
// false alarm; a take done with the fault the check `catches` that fires is a catch. The report (report.ts) counts
// both at the PROPOSED value, then tries other values to suggest a TUNED one, and how it re-grades decides how far the
// suggestion can be trusted:
//
//   exact     the fault IS `value op threshold` on the value the grader reports (the Quick Screen's bands, the hinge,
//             the depth lines), so any other line re-grades exactly.
//   rerun     the grader is run again with the candidate swapped into its own thresholds object, in memory (the squat
//             audit, the press/row engine, the confidence floor). Exact, slower.
//   estimate  the grader keeps its line private or adds persistence on top: the take's worst value is compared with the
//             candidate (the lunge, the push-up body line). Marked ≈ in the report.
//   none      the fault is not one threshold on one number (a rep rejected for a heel lift, a jump refused for an arm
//             swing): counted, never suggested.
//
// Nothing here writes anything, and no threshold object is ever mutated: a candidate is a COPY handed to the grader.
// Node or browser; no fs.
import type { PoseFrame } from '@/lib/pose/landmarks';
import type { PoseFrame as AdapterFrame } from '@/lib/babylon/nexus/neuro-mirror/pose/mediapipe-adapter';
import type { CaptureMovement, CaptureView } from '@/lib/pose/captureProtocol';
import { ConfidenceFloor, CONFIDENCE_FLOOR } from '@/lib/pose/confidenceFloor';
import { calibrateFront, calibrateSide, type Calibration } from '@/lib/assess/calibration';
import { bandOf, type ThresholdId } from '@/lib/assess/thresholds';
import { gradeT1 } from '@/lib/assess/graders/t1-overhead-squat';
import { gradeT2 } from '@/lib/assess/graders/t2-dorsiflexion';
import { gradeT3 } from '@/lib/assess/graders/t3-single-leg-squat';
import { gradeT5 } from '@/lib/assess/graders/t5-cmj';
import type { MetricResult, TestResult } from '@/lib/assess/scoring';
import { SquatAudit, SQUAT_THRESHOLDS, type SquatFault, type SquatFrameResult, type SquatThresholds } from '@/lib/babylon/nexus/neuro-mirror/rules/squat-audit';
import { KinematicEngine } from '@/lib/babylon/nexus/neuro-mirror/rules/kinematic-engine';
import { DEFAULT_THRESHOLDS, type KinematicThresholds } from '@/lib/babylon/nexus/neuro-mirror/rules/config';
import { auditSquat } from '../../squatPattern';
import { auditLunge, LUNGE_THRESHOLDS } from '../../lungeAudit';
import { auditHinge, HINGE_THRESHOLDS } from '../../hingeAudit';
import { auditPushup, PUSHUP_THRESHOLDS } from '../../pushupAudit';
import { PRESS_ROW_PERSIST_FRAMES, pressRowFrameFaults, type PressRowFault } from '../../pressRowStage';
import type { PatternReading } from '../../patterns';
import { DunkTracker } from '@/lib/irl/dunkTracker';
import { mirrorFrames } from '../hingeSetupBuild';
import { takeAspect, takeFrames, type CaptureFixture, type CapturedTake } from './format';

export type Cmp = '<' | '<=' | '>' | '>=';
export type CheckMode = 'exact' | 'rerun' | 'estimate' | 'none';

export const cmp = (v: number, op: Cmp, at: number): boolean =>
  op === '<' ? v < at : op === '<=' ? v <= at : op === '>' ? v > at : v >= at;

/** A check's reading of one take: the value it compared (null: none reported) and whether it fired (null: unread). */
export interface CheckRead { value: number | null; flagged: boolean | null }

/** One session (a person on a phone): its takes, and the Quick Screen calibration read from its own stands. */
export class Session {
  readonly key: string;
  readonly takes: CapturedTake[];
  readonly calibration: Calibration | null;
  readonly calibrationWhy: string | null;
  private readonly memo = new Map<string, unknown>();

  constructor(readonly fixture: CaptureFixture) {
    this.key = `${fixture.capture.person} · ${fixture.capture.device}`;
    this.takes = fixture.takes;
    const front = fixture.takes.find((x) => x.id === 'stand.front');
    const side = fixture.takes.find((x) => x.id === 'stand.side');
    if (!front || !side) {
      this.calibration = null;
      this.calibrationWhy = `no ${!front ? 'stand.front' : 'stand.side'} take`;
      return;
    }
    const aspect = takeAspect(front);
    // the stand is read from GO (the 3-2-1 before it is the athlete walking into place)
    const from = (t: CapturedTake) => takeFrames(t).filter((f) => f.t >= t.goT);
    const f = calibrateFront(from(front), aspect), s = calibrateSide(from(side), takeAspect(side));
    this.calibration = f.ok && s.ok ? { aspect, front: f.value, side: s.value } : null;
    this.calibrationWhy = !f.ok ? `front stand: ${f.why}` : !s.ok ? `side stand: ${s.why}` : null;
  }

  /** Grade once per take and grader. */
  once<T>(key: string, take: CapturedTake, run: () => T): T {
    const k = `${key}|${take.id}`;
    if (!this.memo.has(k)) this.memo.set(k, run());
    return this.memo.get(k) as T;
  }

  get device(): string { return this.fixture.capture.device; }
}

export interface Check {
  id: string;
  /** The grader, as the report groups it. */
  grader: string;
  /** Takes of this movement (and view) are read; '*' = every take (the confidence floor). */
  movement: CaptureMovement | '*';
  view?: CaptureView;
  /** Fault labels this check is meant to fire on. */
  catches: readonly string[];
  /** Which takes must stay silent: the GOOD ones (default), or every take it does not catch (the floor). */
  silentOn?: 'good' | 'all';
  threshold: { name: string; where: string; value: number; op: Cmp; unit: string; register?: ThresholdId };
  mode: CheckMode;
  read(take: CapturedTake, s: Session): CheckRead;
  /** mode 'rerun': grade the take again with this candidate in the grader's own thresholds (a copy). */
  rerun?(take: CapturedTake, s: Session, candidate: number): boolean | null;
}

const UNREAD: CheckRead = { value: null, flagged: null };

// ── the Quick Screen (lib/assess; graded per take, the session's own stands as its calibration) ───────────────────

function qs(take: CapturedTake, s: Session): TestResult | null {
  const cal = s.calibration;
  if (!cal) return null;
  return s.once('qs', take, () => {
    const frames = takeFrames(take);
    const ctx = { calibration: { ...cal, aspect: takeAspect(take) }, aspect: takeAspect(take) };
    switch (take.movement) {
      case 't1': return gradeT1(take.view === 'front' ? { front: frames, side: [] } : { front: [], side: frames }, ctx);
      case 't2': return gradeT2(bothSides(take, s, frames), ctx);
      case 't3': return gradeT3(bothSides(take, s, frames), ctx);
      case 'jump': return gradeT5(frames, { ...ctx, cameraFps: null });
      default: return null;
    }
  });
}

/**
 * T2 and T3 grade only with both legs (as the live screen films them). A take is graded on its own side beside the
 * session's GOOD take of the other leg (or, with none, its own mirror image), and only its own side is read.
 */
function bothSides(take: CapturedTake, s: Session, frames: PoseFrame[]): Record<'left' | 'right', PoseFrame[]> {
  const side = take.side ?? 'left', other = side === 'left' ? 'right' : 'left';
  const partner = s.takes.find((t) => t.movement === take.movement && t.side === other && t.label === 'good');
  return { [side]: frames, [other]: partner ? takeFrames(partner) : mirrorFrames(frames) } as Record<'left' | 'right', PoseFrame[]>;
}

/** The metrics a Quick Screen test reported for this take (its side's, or both's). */
function metricsOf(r: TestResult | null, take: CapturedTake): MetricResult[] {
  if (!r || r.status !== 'scored') return [];
  const side = take.side && r.sides[take.side] ? r.sides[take.side] : r.sides.both;
  return side?.metrics ?? [];
}

/** A register band check: the fault is `value faultOp fault` on the metric (exact). Sided metrics: the worse one. */
function qsBand(o: { id: ThresholdId; grader: string; movement: CaptureMovement; view?: CaptureView; metrics: readonly string[]; catches: string[]; unit: string }): Check {
  const b = bandOf(o.id);
  const op = b.faultOp as Cmp;
  const worse = (vs: number[]) => (op === '<' || op === '<=' ? Math.min(...vs) : Math.max(...vs));
  return {
    id: o.id, grader: o.grader, movement: o.movement, ...(o.view ? { view: o.view } : {}), catches: o.catches,
    threshold: { name: o.id, where: 'lib/screen/PROPOSED-thresholds.ts', value: b.fault!, op, unit: o.unit, register: o.id },
    mode: 'exact',
    read(take, s) {
      const ms = metricsOf(qs(take, s), take).filter((m) => o.metrics.includes(m.id) && m.value !== null);
      if (!ms.length) return UNREAD;
      return { value: worse(ms.map((m) => m.value!)), flagged: ms.some((m) => m.fault) };
    },
  };
}

const QS_CHECKS: Check[] = [
  qsBand({ id: 't1.valgus', grader: 'Quick Screen T1 overhead squat (front)', movement: 't1', view: 'front', metrics: ['valgusLeft', 'valgusRight'], catches: ['kneesCaveIn'], unit: 'hip half-widths' }),
  qsBand({ id: 't1.lateralShift', grader: 'Quick Screen T1 overhead squat (front)', movement: 't1', view: 'front', metrics: ['lateralShift'], catches: [], unit: 'hip widths' }),
  qsBand({ id: 't1.trunkTibia', grader: 'Quick Screen T1 overhead squat (side)', movement: 't1', view: 'side', metrics: ['trunkTibia'], catches: ['forwardLean'], unit: 'deg' }),
  qsBand({ id: 't1.shoulderFlex', grader: 'Quick Screen T1 overhead squat (side)', movement: 't1', view: 'side', metrics: ['shoulderFlex'], catches: ['armsForward'], unit: 'deg' }),
  qsBand({ id: 't1.heelRiseReps', grader: 'Quick Screen T1 overhead squat (side)', movement: 't1', view: 'side', metrics: ['heelRise'], catches: ['heelsLift'], unit: 'reps' }),
  qsBand({ id: 't1.depthKneeFlex', grader: 'Quick Screen T1 overhead squat (side)', movement: 't1', view: 'side', metrics: ['depthKneeFlex'], catches: [], unit: 'deg' }),
  qsBand({ id: 't2.tibia', grader: 'Quick Screen T2 knee to wall', movement: 't2', metrics: ['tibia'], catches: ['shortRange'], unit: 'deg' }),
  {
    id: 't2.heelLiftRejected', grader: 'Quick Screen T2 knee to wall', movement: 't2', catches: ['heelLift'],
    threshold: { name: 'geom.heelRise', where: 'lib/screen/PROPOSED-thresholds.ts (a rep with the heel up is not counted)', value: 0.015, op: '>', unit: 'body-height fraction', register: 'geom.heelRise' },
    mode: 'none',
    read(take, s) {
      const r = qs(take, s) as (TestResult & { t2?: { rejected: unknown[] } }) | null;
      if (!r || !r.t2) return UNREAD;
      return { value: r.t2.rejected.length, flagged: r.t2.rejected.length > 0 };
    },
  },
  qsBand({ id: 't3.fppa', grader: 'Quick Screen T3 single-leg squat', movement: 't3', metrics: ['fppa'], catches: ['kneesCaveIn'], unit: 'deg' }),
  qsBand({ id: 't3.pelvicDrop', grader: 'Quick Screen T3 single-leg squat', movement: 't3', metrics: ['pelvicDrop'], catches: ['hipDrop'], unit: 'deg' }),
  qsBand({ id: 't3.trunkLean', grader: 'Quick Screen T3 single-leg squat', movement: 't3', metrics: ['trunkLean'], catches: ['trunkLean'], unit: 'deg' }),
  qsBand({ id: 't5.landingFlex', grader: 'Quick Screen T5 jump', movement: 'jump', metrics: ['landingFlex'], catches: ['stiffLanding'], unit: 'hip drop / standing hip height' }),
  qsBand({ id: 't5.landingValgus', grader: 'Quick Screen T5 jump', movement: 'jump', metrics: ['landingValgusLeft', 'landingValgusRight'], catches: ['kneesCaveInLanding'], unit: 'deg' }),
  {
    id: 't5.armSwing', grader: 'Quick Screen T5 jump', movement: 'jump', catches: ['armSwing'],
    threshold: { name: 't5.armSwingWrist', where: 'lib/screen/PROPOSED-thresholds.ts (a jump with the hands off the hips is not the standard)', value: 0, op: '>', unit: 'image height above the shoulders', register: 't5.armSwingWrist' },
    mode: 'none',
    read(take, s) {
      const r = qs(take, s);
      if (!r?.t5) return UNREAD;
      const n = r.t5.jumps.filter((j) => /hands left your hips/.test(j.invalidWhy ?? '')).length;
      return { value: n, flagged: n > 0 };
    },
  },
];

// ── the Mirror's patterns (lib/mirror; the batch audits the Movement Screen and the live tabs share) ──────────────

const adapter = (fs: readonly PoseFrame[]): AdapterFrame[] =>
  fs.map((f) => ({ present: f.present, timestampMs: f.t, landmarks: f.image.map((l) => ({ x: l.x, y: l.y, z: l.z, visibility: l.v })) }));

function reading(take: CapturedTake, s: Session, key: string, run: (fs: PoseFrame[]) => PatternReading): PatternReading {
  return s.once(key, take, () => run(takeFrames(take)));
}
function fromReading(r: PatternReading, id: string, abs = false): CheckRead {
  const f = r.faults.find((x) => x.id === id);
  if (!f || f.status === 'unreadable') return UNREAD;
  return { value: abs ? Math.abs(f.value) : f.value, flagged: f.status === 'fault' };
}

/** squatPattern.ts's own rule, with the audit's thresholds handed in (a copy): square at some point, then any frame. */
function squatFlag(frames: readonly PoseFrame[], t: SquatThresholds, id: SquatFault): boolean | null {
  const audit = new SquatAudit(t);
  const reads: SquatFrameResult[] = adapter(frames).map((f) => audit.evaluate(f));
  const present = reads.filter((r) => r.present && !/Calibrating/i.test(r.note));
  const everSquare = present.some((r) => r.phase !== 'standing' && r.square === true);
  if (!present.length || !everSquare) return null;
  return present.some((r) => r.faults.includes(id));
}

function squatRerun(id: SquatFault, key: keyof SquatThresholds, readingId: string, catches: string[], op: Cmp, unit: string): Check {
  return {
    id: `mirror.squat.${id}`, grader: 'Mirror squat', movement: 'squat', catches,
    threshold: { name: `SQUAT_THRESHOLDS.${key}`, where: 'lib/babylon/nexus/neuro-mirror/rules/squat-audit.ts', value: SQUAT_THRESHOLDS[key] as number, op, unit },
    mode: 'rerun',
    read(take, s) {
      const r = fromReading(reading(take, s, 'squat', (fs) => auditSquat(fs)), readingId);
      return id === 'heelRise' ? { value: null, flagged: r.flagged } : r;
    },
    rerun(take, _s, c) { return squatFlag(takeFrames(take), { ...SQUAT_THRESHOLDS, [key]: c }, id); },
  };
}

/** The press/row engine re-run with its thresholds (a copy): a fault that holds PRESS_ROW_PERSIST_FRAMES frames fired. */
function pressRowFlags(frames: readonly PoseFrame[], t: KinematicThresholds): Set<PressRowFault> {
  const eng = new KinematicEngine(t);
  const runs: Record<PressRowFault, number> = { elbowFlare: 0, shrug: 0, trunkOffset: 0 };
  const fired = new Set<PressRowFault>();
  for (const f of adapter(frames)) {
    const res = eng.evaluate(f);
    if (!res.present) continue;
    const zones = Object.fromEntries(Object.entries(res.zones).map(([k, z]) => [k, z.state])) as Parameters<typeof pressRowFrameFaults>[0];
    const now = new Set(pressRowFrameFaults(zones));
    for (const k of Object.keys(runs) as PressRowFault[]) {
      runs[k] = now.has(k) ? runs[k] + 1 : 0;
      if (runs[k] >= PRESS_ROW_PERSIST_FRAMES) fired.add(k);
    }
  }
  return fired;
}

function pressRow(fault: PressRowFault, key: keyof KinematicThresholds, catches: string[], unit: string): Check {
  return {
    id: `mirror.pressRow.${fault}`, grader: 'Mirror press / row', movement: 'pressRow', catches,
    threshold: { name: `DEFAULT_THRESHOLDS.${key}`, where: 'lib/babylon/nexus/neuro-mirror/rules/config.ts', value: DEFAULT_THRESHOLDS[key], op: '>=', unit },
    mode: 'rerun',
    read(take, s) {
      const fired = s.once('pressRow', take, () => pressRowFlags(takeFrames(take), DEFAULT_THRESHOLDS));
      return { value: null, flagged: fired.has(fault) };
    },
    rerun(take, _s, c) { return pressRowFlags(takeFrames(take), { ...DEFAULT_THRESHOLDS, [key]: c }).has(fault); },
  };
}

const MIRROR_CHECKS: Check[] = [
  squatRerun('kneeValgus', 'valgusWarn', 'kneeValgus', ['kneesCaveIn'], '>=', 'hip half-widths'),
  squatRerun('heelRise', 'heelRiseWarnPx', 'heelRise', ['heelsLift'], '>', 'image height'),
  squatRerun('lateralShift', 'lateralWarn', 'lateralShift', ['shiftToOneSide'], '>=', 'hip widths'),
  {
    id: 'mirror.squat.shallow', grader: 'Mirror squat', movement: 'squat', catches: ['shallow'],
    threshold: { name: 'SHALLOW_DEPTH01_MIN', where: 'lib/mirror/squatPattern.ts (module constant)', value: 0.5, op: '<', unit: 'depth 0–1' },
    mode: 'exact',
    read(take, s) { return fromReading(reading(take, s, 'squat', (fs) => auditSquat(fs)), 'shallow'); },
  },
  {
    id: 'mirror.lunge.kneeIn', grader: 'Mirror lunge', movement: 'lunge', catches: ['frontKneeCavesIn'],
    threshold: { name: 'LUNGE_THRESHOLDS.kneeInWarn', where: 'lib/mirror/lungeAudit.ts', value: LUNGE_THRESHOLDS.kneeInWarn, op: '>=', unit: 'hip half-widths' },
    mode: 'estimate',
    read(take, s) { return fromReading(reading(take, s, 'lunge', (fs) => auditLunge(fs, { side: take.side })), 'kneeIn'); },
  },
  {
    id: 'mirror.lunge.torsoDrift', grader: 'Mirror lunge', movement: 'lunge', catches: ['trunkLean'],
    threshold: { name: 'LUNGE_THRESHOLDS.torsoDriftWarn', where: 'lib/mirror/lungeAudit.ts', value: LUNGE_THRESHOLDS.torsoDriftWarn, op: '>=', unit: 'torso lengths' },
    mode: 'estimate',
    read(take, s) { return fromReading(reading(take, s, 'lunge', (fs) => auditLunge(fs, { side: take.side })), 'torsoDrift'); },
  },
  {
    id: 'mirror.lunge.shallow', grader: 'Mirror lunge', movement: 'lunge', catches: ['shallow'],
    threshold: { name: 'shallow line', where: 'lib/mirror/lungeAudit.ts auditLunge (inline 0.5)', value: 0.5, op: '<', unit: 'depth 0–1' },
    mode: 'exact',
    read(take, s) { return fromReading(reading(take, s, 'lunge', (fs) => auditLunge(fs, { side: take.side })), 'shallow'); },
  },
  pressRow('elbowFlare', 'elbowFlareFaultRatio', ['elbowFlare'], 'torso lengths'),
  pressRow('shrug', 'shoulderElevationFaultDeg', ['shrug'], 'deg'),
  pressRow('trunkOffset', 'trunkLateralOffsetFaultRatio', ['trunkLean'], 'torso lengths'),
  {
    id: 'mirror.hinge.hingeRatio', grader: 'Mirror hip hinge', movement: 'hinge', catches: ['kneeDominant'],
    threshold: { name: 'HINGE_THRESHOLDS.hingeRatioMin', where: 'lib/mirror/hingeAudit.ts', value: HINGE_THRESHOLDS.hingeRatioMin, op: '<', unit: 'hip ÷ knee range' },
    mode: 'exact',
    read(take, s) { return fromReading(reading(take, s, 'hinge', (fs) => auditHinge(fs, { side: take.side })), 'hingeRatio'); },
  },
  {
    id: 'mirror.hinge.dowelLine', grader: 'Mirror hip hinge', movement: 'hinge', catches: ['roundedBack'],
    threshold: { name: 'HINGE_THRESHOLDS.dowelLineWarnDeg', where: 'lib/mirror/hingeAudit.ts', value: HINGE_THRESHOLDS.dowelLineWarnDeg, op: '>', unit: 'deg' },
    mode: 'exact',
    read(take, s) { return fromReading(reading(take, s, 'hinge', (fs) => auditHinge(fs, { side: take.side })), 'dowelLine'); },
  },
  {
    id: 'mirror.pushup.bodyLine', grader: 'Mirror push-up', movement: 'pushup', catches: ['hipsSag', 'hipsPike'],
    threshold: { name: 'PUSHUP_THRESHOLDS.bodyLineWarn', where: 'lib/mirror/pushupAudit.ts', value: PUSHUP_THRESHOLDS.bodyLineWarn, op: '>=', unit: '|offset| ÷ line length' },
    mode: 'estimate',
    read(take, s) { return fromReading(reading(take, s, 'pushup', (fs) => auditPushup(fs, { side: take.side })), 'bodyLine', true); },
  },
  {
    id: 'mirror.pushup.depth', grader: 'Mirror push-up', movement: 'pushup', catches: ['partial'],
    threshold: { name: 'PUSHUP_THRESHOLDS.partialElbowDeg', where: 'lib/mirror/pushupAudit.ts', value: PUSHUP_THRESHOLDS.partialElbowDeg, op: '>', unit: 'deg at the bottom' },
    mode: 'exact',
    read(take, s) { return fromReading(reading(take, s, 'pushup', (fs) => auditPushup(fs, { side: take.side })), 'depth'); },
  },
];

// ── the lite model's confidence floor (lib/pose/confidenceFloor.ts): every take, the light ones should fire ──────

function floorRun(take: CapturedTake, floor: number): { fired: boolean; min: number | null } {
  const f = new ConfidenceFloor({ model: 'lite', floor });
  let fired = false, min: number | null = null;
  for (const fr of takeFrames(take)) {
    if (f.step(fr, fr.t)) fired = true;
    const c = f.confidence;
    if (c !== null) min = min === null ? c : Math.min(min, c);
  }
  return { fired, min };
}

export const FLOOR_CHECK: Check = {
  id: 'pose.confidenceFloor', grader: 'Lite confidence floor ("move closer, or add more light")', movement: '*',
  catches: ['dim', 'far'], silentOn: 'all',
  threshold: { name: 'CONFIDENCE_FLOOR', where: 'lib/pose/confidenceFloor.ts', value: CONFIDENCE_FLOOR, op: '<', unit: 'visibility 0–1 (1 s median)' },
  mode: 'rerun',
  read(take, s) {
    const r = s.once('floor', take, () => floorRun(take, CONFIDENCE_FLOOR));
    return { value: r.min, flagged: r.fired };
  },
  rerun(take, _s, c) { return floorRun(take, c).fired; },
};

/** Every check, in report order. */
export const CHECKS: readonly Check[] = [...QS_CHECKS, ...MIRROR_CHECKS, FLOOR_CHECK];

/** Does this check read this take, and as what: 'good' (must stay silent), 'fault' (should fire), or not at all. */
export function roleOf(check: Check, take: CapturedTake): 'good' | 'fault' | null {
  if (check.movement !== '*' && take.movement !== check.movement) return null;
  if (check.view && take.view !== check.view) return null;
  if (take.movement === 'stand') return check.movement === '*' ? 'good' : null;
  if (check.catches.includes(take.label)) return 'fault';
  if (take.label === 'good' || check.silentOn === 'all') return 'good';
  return null;
}

// ── reps counted on GOOD takes (the "hit rate"), per grader that counts them ─────────────────────────────────────

export interface RepCount { grader: string; counted: number; asked: number }

export function repsCounted(take: CapturedTake, s: Session): RepCount[] {
  if (take.label !== 'good' || !take.reps) return [];
  const out: RepCount[] = [];
  const r = qs(take, s);
  if (r && r.status === 'scored') {
    if (take.movement === 't1') {
      const v = r.sides.both?.views?.[take.view];
      if (v) out.push({ grader: `Quick Screen T1 (${take.view})`, counted: v.valid, asked: take.reps });
    }
    if (take.movement === 't2' || take.movement === 't3') {
      const sr = r.sides[take.side ?? 'left'];
      if (sr) out.push({ grader: take.movement === 't2' ? 'Quick Screen T2' : 'Quick Screen T3', counted: sr.repsValid, asked: take.reps });
    }
  } else if (r && (take.movement === 't1' || take.movement === 't2' || take.movement === 't3')) {
    out.push({ grader: take.movement === 't1' ? `Quick Screen T1 (${take.view})` : take.movement === 't2' ? 'Quick Screen T2' : 'Quick Screen T3', counted: 0, asked: take.reps });
  }
  if (take.movement === 'jump') {
    if (r?.t5) out.push({ grader: 'Quick Screen T5', counted: r.t5.jumps.filter((j) => j.valid).length, asked: take.reps });
    out.push({ grader: 'Mirror jump (DunkTracker)', counted: s.once('dunk', take, () => dunkJumps(takeFrames(take))), asked: take.reps });
  }
  if (take.movement === 'pushup') {
    const rd = reading(take, s, 'pushup', (fs) => auditPushup(fs, { side: take.side }));
    const reps = rd.faults.find((f) => f.id === 'reps');
    out.push({ grader: 'Mirror push-up', counted: reps ? reps.value : 0, asked: take.reps });
  }
  return out;
}

/** The Mirror's jump tab: jumps the tracker counts (it resets after each, as the harness does). */
export function dunkJumps(frames: readonly PoseFrame[]): number {
  const tr = new DunkTracker();
  let n = 0;
  for (const f of adapter(frames)) {
    const got = tr.feed({ present: f.present, timestampMs: f.timestampMs, landmarks: f.landmarks.map((l) => ({ x: l.x, y: l.y, visibility: l.visibility ?? 0 })) });
    if (got) { n++; tr.reset(); }
  }
  return n;
}
