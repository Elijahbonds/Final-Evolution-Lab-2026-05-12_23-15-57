// What the Mirror's REAL code says about a landmark fixture (MIRROR-COACH P1 baseline, 2026-09-25).
//
// The baseline later phases prove against: every fixture through the live squat audit (and the cue engine and stage
// step behind it), the unmounted lunge audit, the framing check in all three views, and the movement screen end to end
// (runner → score → stored row → reward → what the coach's panel is told). Nothing here re-implements a rule: each
// number is what the shipped module returned. The audit and cue-engine classes are injectable only so the baseline
// probe can put the pre-P1 versions (git HEAD) through the SAME measurement for a before/after.
//
// Pure: frames in, a plain JSON-able record out. No fs, no clock.
import { SquatAudit, type SquatFault, type SquatFrameResult } from '@/lib/babylon/nexus/neuro-mirror/rules/squat-audit';
import { CueEngine, cueableFaults, type FaultId } from '@/lib/babylon/nexus/neuro-mirror/rules/cue-engine';
import type { PoseFrame as AdapterFrame } from '@/lib/babylon/nexus/neuro-mirror/pose/mediapipe-adapter';
import { LungeAudit } from '../lungeAudit';
import { checkFraming, type FramingIssue, type FramingView } from '../framing';
import { ScreenRunner } from '../screenRunner';
import {
  NOT_GRADED_LINE, distinctChecks, resultsForScreen, scoreScreen, screenFor, screenVariantFor, type ScreenId, type ScreenResultSummary,
} from '../screen';
import { decideScreenReward, type ScreenRewardDecision } from '../screenReward';
import { isUngradedStoredScreen, readStoredScreen, storedScreen, type StoredScreen } from '../screenStore';
import { initialSquatSession, stepSquatSession, type SquatSessionState } from '../squatStage';

const r2 = (x: number) => Math.round(x * 100) / 100;
const count = <K extends string>(m: Partial<Record<K, number>>, k: K) => { m[k] = (m[k] ?? 0) + 1; };

// ── the squat audit ──────────────────────────────────────────────────────────────────────────────────────────────

/** Anything shaped like SquatAudit — the live one, or the pre-P1 one the probe loads from git. */
export interface SquatAuditLike { evaluate(frame: AdapterFrame): Pick<SquatFrameResult, 'present' | 'phase' | 'depth01' | 'faults' | 'valgusRatio' | 'lateralDrift' | 'note'> & { valgusBySide?: { left: number; right: number } } }
export interface CueEngineLike { decide(nowMs: number, faults: FaultId[]): { fault: string; text: string; level: string } | null }

export interface SquatRecord {
  frames: number;
  present: number;
  /** The first frame the audit had its standing line (it returns 'Calibrating' until then). */
  calibratedAtFrame: number | null;
  /** Frames in each phase. */
  phases: Record<string, number>;
  /** Reps by the harness's rule: the phase leaves 'standing' and comes back (mirror-harness.tsx, squatStage.ts). */
  reps: number;
  maxDepth01: number;
  /** Frames each fault was active. */
  faultFrames: Record<string, number>;
  firstFaultFrame: Record<string, number>;
  /** The per-leg knee read's worst (most inward) value over non-standing frames; null when the audit has no per-leg read. */
  worstInward: { left: number; right: number } | null;
  /** …and its least (most outward) value, so a knee pushed OUT shows as negative. */
  leastInward: { left: number; right: number } | null;
  maxValgusRatio: number;
  maxLateralDrift: number;
  /** Faults the checks row and the skeleton may show (cue-engine.ts cueableFaults) — the rest are recorded only. */
  shown: string[];
  /** The check stage's findings (squatStage.ts, run over this fixture as the check set), in the order seen. */
  checkFindings: string[];
  /** What the coach says if this rep is in the work set: the cue engine fed each faulting frame, as the harness does. */
  coach: { atFrame: number; fault: string; level: string; text: string }[];
}

export function measureSquat(
  frames: readonly AdapterFrame[],
  deps: { audit?: SquatAuditLike; cues?: CueEngineLike; shown?: (faults: string[]) => string[]; stage?: boolean } = {},
): SquatRecord {
  const audit = deps.audit ?? new SquatAudit();
  const cues = deps.cues ?? new CueEngine();
  const shownOf = deps.shown ?? ((f: string[]) => cueableFaults(f as FaultId[]));
  const phases: Record<string, number> = {};
  const faultFrames: Record<string, number> = {};
  const firstFaultFrame: Record<string, number> = {};
  const coach: SquatRecord['coach'] = [];
  const seen = new Set<string>();
  let present = 0, calibratedAtFrame: number | null = null, reps = 0, prev = 'standing';
  let maxDepth01 = 0, maxValgus = 0, maxDrift = 0, perSide = false;
  let wL = -Infinity, wR = -Infinity, lL = Infinity, lR = Infinity;
  let stage: SquatSessionState = { ...initialSquatSession(), stage: 'check' };
  frames.forEach((f, i) => {
    const r = audit.evaluate(f);
    if (r.present) present++;
    if (calibratedAtFrame == null && r.present && !/Calibrating/i.test(r.note) && r.note !== 'Landmarks not visible') calibratedAtFrame = i;
    count(phases, r.phase);
    if (prev !== 'standing' && r.phase === 'standing' && r.present) reps++;
    prev = r.phase;
    maxDepth01 = Math.max(maxDepth01, r.depth01);
    maxValgus = Math.max(maxValgus, r.valgusRatio);
    maxDrift = Math.max(maxDrift, r.lateralDrift);
    for (const fault of r.faults) { count(faultFrames, fault); if (!(fault in firstFaultFrame)) firstFaultFrame[fault] = i; seen.add(fault); }
    if (r.valgusBySide && r.present && r.phase !== 'standing') {
      perSide = true;
      wL = Math.max(wL, r.valgusBySide.left); wR = Math.max(wR, r.valgusBySide.right);
      lL = Math.min(lL, r.valgusBySide.left); lR = Math.min(lR, r.valgusBySide.right);
    }
    if (r.faults.length) {
      const evt = cues.decide(f.timestampMs, [...r.faults] as FaultId[]);
      if (evt) coach.push({ atFrame: i, fault: evt.fault, level: evt.level, text: evt.text });
    }
    if (deps.stage !== false) {
      stage = stepSquatSession(stage, { nowMs: f.timestampMs, phase: r.phase, present: r.present, faults: r.faults as SquatFault[] }).state;
    }
  });
  return {
    frames: frames.length, present, calibratedAtFrame, phases, reps, maxDepth01: r2(maxDepth01),
    faultFrames, firstFaultFrame,
    worstInward: perSide ? { left: r2(wL), right: r2(wR) } : null,
    leastInward: perSide ? { left: r2(lL), right: r2(lR) } : null,
    maxValgusRatio: r2(maxValgus), maxLateralDrift: r2(maxDrift),
    shown: shownOf([...seen]),
    checkFindings: deps.stage === false ? [...seen] : [...stage.findings],
    coach,
  };
}

// ── the lunge audit (unmounted — lib/mirror/lungeAudit.ts has no caller outside its test) ────────────────────────

export interface LungeRecord {
  present: number;
  calibratedAtFrame: number | null;
  phases: Record<string, number>;
  /** The leg the audit says is in front, by majority over non-standing frames. */
  frontLeg: string | null;
  maxDepth01: number;
  faultFrames: Record<string, number>;
  firstFaultFrame: Record<string, number>;
  maxKneeIn: number;
  maxHipDrop: number;
  maxTorsoDrift: number;
}

export function measureLunge(frames: readonly AdapterFrame[]): LungeRecord {
  const audit = new LungeAudit();
  const phases: Record<string, number> = {}, faultFrames: Record<string, number> = {}, firstFaultFrame: Record<string, number> = {};
  const fronts: Record<string, number> = {};
  let present = 0, calibratedAtFrame: number | null = null, maxDepth01 = 0, maxKneeIn = 0, maxHipDrop = 0, maxTorsoDrift = 0;
  frames.forEach((f, i) => {
    const r = audit.evaluate({ landmarks: f.landmarks, timestampMs: f.timestampMs, present: f.present });
    if (r.present) present++;
    if (calibratedAtFrame == null && r.present && r.front) calibratedAtFrame = i;
    count(phases, r.phase);
    if (r.front && r.phase !== 'standing') count(fronts, r.front);
    maxDepth01 = Math.max(maxDepth01, r.depth01);
    maxKneeIn = Math.max(maxKneeIn, r.kneeIn); maxHipDrop = Math.max(maxHipDrop, r.hipDrop); maxTorsoDrift = Math.max(maxTorsoDrift, r.torsoDrift);
    for (const fault of r.faults) { count(faultFrames, fault); if (!(fault in firstFaultFrame)) firstFaultFrame[fault] = i; }
  });
  const frontLeg = Object.entries(fronts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return {
    present, calibratedAtFrame, phases, frontLeg, maxDepth01: r2(maxDepth01), faultFrames, firstFaultFrame,
    maxKneeIn: r2(maxKneeIn), maxHipDrop: r2(maxHipDrop), maxTorsoDrift: r2(maxTorsoDrift),
  };
}

// ── the framing check ────────────────────────────────────────────────────────────────────────────────────────────

export interface FramingRecord {
  /** Frames the shot passed for this view. */
  ok: number;
  frames: number;
  /** How often each issue was the one the athlete was told to fix (the `worst`). */
  worst: Partial<Record<FramingIssue, number>>;
  /** What the Mirror said on the first frame. */
  say: string;
  /** Median head-to-ankle fill of the frame. */
  bodyFill: number;
}

export function measureFraming(frames: readonly AdapterFrame[], view: FramingView): FramingRecord {
  const worst: Partial<Record<FramingIssue, number>> = {};
  const fills: number[] = [];
  let ok = 0, say = '';
  frames.forEach((f, i) => {
    const c = checkFraming({ landmarks: f.landmarks, present: f.present }, view);
    if (i === 0) say = c.instruction;
    if (c.ok) ok++;
    if (c.worst) count(worst, c.worst);
    fills.push(c.bodyFill);
  });
  fills.sort((a, b) => a - b);
  return { ok, frames: frames.length, worst, say, bodyFill: r2(fills[Math.floor(fills.length / 2)] ?? 0) };
}

// ── the movement screen, end to end ──────────────────────────────────────────────────────────────────────────────

export interface StationRecord {
  id: string;
  view: string;
  /** The fixture fed while this station was current (the athlete does what the cue says). */
  fixture: string;
  /** Pose-clock seconds from the station becoming current to it finishing; null if it never did. */
  seconds: number | null;
  positioningFrames: number;
  holdingFrames: number;
  /** The first thing said at this station. */
  firstSay: string;
  /** The framing issue that held it, when it never finished. */
  heldBy: FramingIssue | null;
}

export interface ScreenRunRecord {
  screen: ScreenId;
  completed: boolean;
  /** The station it could not get past (never finished within the stall limit), if any. */
  stalledAt: string | null;
  poseClockSec: number;
  stations: StationRecord[];
  /** How many results the runner held at the end — ScreenRunner.record has no caller in the app yet. */
  resultsRecorded: number;
  /** What the harness posts when a screen completes (mirror-harness.tsx submitScreen), computed here either way. */
  onComplete: {
    /** Whether the harness would post at all (only on 'complete'). */
    posted: boolean;
    summary: ScreenResultSummary;
    /** The metrics JSON app/api/mirror/screen/route.ts stores (WorkoutScan kind mirror_screen). */
    stored: StoredScreen;
    reward: ScreenRewardDecision;
    /** The reason GET /api/coach/prescribe gives the coach's panel for this stored row (null = it reads as graded). */
    prescribeReason: 'ungraded_screen' | 'unreadable_screen' | null;
    /** What the athlete's panel shows (mirror-harness.tsx "What the screen found"). */
    athletePanel: string;
  };
}

/** Which fixture an athlete obeying the cue is showing the camera at each station. */
export type StationFrames = (station: { id: string; view: string }) => { fixture: string; frames: readonly AdapterFrame[] };

/**
 * Walk a whole screen through the real ScreenRunner, one frame per tick at the frames' own spacing, looping each
 * station's fixture. A station that has not finished after `stallSec` of pose clock is where the run stops.
 */
export function runScreen(screen: ScreenId, frameFor: StationFrames, opts: { stallSec?: number; screenId?: string; athleteId?: string } = {}): ScreenRunRecord {
  const stallMs = (opts.stallSec ?? 120) * 1000;
  const runner = new ScreenRunner(screen);
  const stations: StationRecord[] = [];
  let now = 0, idx = -1, stationStart = 0, rec: StationRecord | null = null, pos = 0, stalledAt: string | null = null, completed = false;
  let lastIssue: FramingIssue | null = null;
  let feed: { fixture: string; frames: readonly AdapterFrame[] } | null = null;
  for (let guard = 0; guard < 200_000; guard++) {
    const st = runner.station;
    if (!st) break;
    if (runnerIndex(runner) !== idx) {
      idx = runnerIndex(runner);
      feed = frameFor(st);
      rec = { id: st.id, view: st.view, fixture: feed.fixture, seconds: null, positioningFrames: 0, holdingFrames: 0, firstSay: '', heldBy: null };
      stations.push(rec);
      stationStart = now; pos = 0;
    }
    const f = feed!.frames[pos % feed!.frames.length];
    const s = runner.tick({ landmarks: f.landmarks, present: f.present }, now);
    if (!rec!.firstSay) rec!.firstSay = s.say;
    if (s.phase === 'positioning') { rec!.positioningFrames++; lastIssue = s.framing.worst; } else if (s.phase === 'holding') rec!.holdingFrames++;
    if (s.phase === 'stationDone' || s.phase === 'complete') rec!.seconds = r2((now - stationStart) / 1000);
    if (s.phase === 'complete') { completed = true; break; }
    if (now - stationStart > stallMs && rec!.seconds == null) { rec!.heldBy = lastIssue; stalledAt = st.id; break; }
    // the next frame, at the fixture's own spacing (one frame interval across the loop's seam)
    const a = feed!.frames[pos % feed!.frames.length], b = feed!.frames[(pos + 1) % feed!.frames.length];
    const step = b.timestampMs > a.timestampMs ? b.timestampMs - a.timestampMs : 1000 / 30;
    now += step; pos++;
  }
  const raw = runner.tick({ landmarks: [], present: false }, now).results;
  // The route's steps, in the route's order (app/api/mirror/screen/route.ts). lib/mirror/screen-route.test.ts runs the
  // route itself; this keeps the baseline's record in step with it (it used to skip resultsForScreen and count the raw
  // array, which is what let duplicate and made-up results pay — found in the P1 review).
  const results = resultsForScreen(screen, raw);
  const variant = screenVariantFor(screen, results);
  const summary = scoreScreen(variant, results);
  const screenId = opts.screenId ?? `fixture-${screen}`;
  const stored = storedScreen(screenId, variant, results, summary);
  // the harness sends no `provisional` since P1 (mirror-harness.tsx submitScreen); the server counts the checks
  const reward = decideScreenReward({ screenId, athleteId: opts.athleteId ?? 'fixture-athlete', provisional: false, checksTaken: distinctChecks(results) });
  const readable = readStoredScreen(JSON.parse(JSON.stringify(stored)));
  const prescribeReason = readable ? null : isUngradedStoredScreen(stored) ? 'ungraded_screen' : 'unreadable_screen';
  const athletePanel = summary.graded
    ? `Score ${summary.score ?? '—'} · Movement flags ${summary.movementFlags} · One-sided ${summary.asymmetries} · Checks ${results.length}`
    : NOT_GRADED_LINE;
  return {
    screen, completed, stalledAt, poseClockSec: r2(now / 1000), stations, resultsRecorded: results.length,
    onComplete: { posted: completed, summary, stored, reward, prescribeReason, athletePanel },
  };
}

/** The runner's current station index (it has no public getter; the station object identifies it). */
function runnerIndex(r: ScreenRunner): number {
  const st = r.station;
  return st ? screenFor(r.screen).indexOf(st) : -1;
}

/** The screen's stations → the fixture an athlete obeying each cue shows (the clean set in lib/mirror/fixtures). */
export function stationFixture(station: { id: string; view: string }): string {
  if (station.id === 'wobbleL') return 'single_leg_left';
  if (station.id === 'wobbleR') return 'single_leg_right';
  if (station.id === 'rotation') return 'seated_rotation_front';
  return station.view === 'back' ? 'stand_back' : station.view === 'side' ? 'stand_side' : 'stand_front';
}

// ── the whole baseline ───────────────────────────────────────────────────────────────────────────────────────────

export interface FixtureBaseline {
  pattern: string;
  view: string;
  truth: Record<string, number | string | boolean>;
  squat: SquatRecord;
  lunge: LungeRecord;
  framing: Record<FramingView, FramingRecord>;
}
export interface MirrorBaseline {
  format: 'fel-mirror-baseline/1';
  fixtures: Record<string, FixtureBaseline>;
  screens: Record<ScreenId, ScreenRunRecord>;
}

/** A fixture file's shape, as far as the baseline needs it (index.ts MirrorFixture). */
interface FixtureLike { name: string; pattern: string; view: string; truth: Record<string, number | string | boolean>; frames: { t: number; present: boolean; lm: number[][] }[] }

const adapter = (fx: FixtureLike): AdapterFrame[] => fx.frames.map((f) => ({
  present: f.present, timestampMs: f.t, landmarks: f.lm.map(([x, y, z, visibility]) => ({ x, y, z, visibility })),
}));

/** Every fixture through every real reader, and both screens walked end to end on the clean set. */
export function recordBaseline(names: readonly string[], load: (name: string) => FixtureLike): MirrorBaseline {
  const fixtures: Record<string, FixtureBaseline> = {};
  for (const name of names) {
    const fx = load(name), frames = adapter(fx);
    fixtures[name] = {
      pattern: fx.pattern, view: fx.view, truth: fx.truth,
      squat: measureSquat(frames), lunge: measureLunge(frames),
      framing: { front: measureFraming(frames, 'front'), side: measureFraming(frames, 'side'), back: measureFraming(frames, 'back') },
    };
  }
  const frameFor: StationFrames = (st) => { const fixture = stationFixture(st); return { fixture, frames: adapter(load(fixture)) }; };
  return {
    format: 'fel-mirror-baseline/1', fixtures,
    screens: { modified: runScreen('modified', frameFor), full: runScreen('full', frameFor) },
  };
}
