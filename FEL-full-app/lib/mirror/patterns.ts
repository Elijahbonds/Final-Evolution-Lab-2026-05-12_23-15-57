// patterns — the Movement Screen's per-pattern audit contract (MIRROR-COACH P4, 2026-09-29).
//
// WHY THIS FILE EXISTS, AND WHY IT ONLY HOLDS TWO PATTERNS. Phase 4's brief hands every lane this exact contract
// (MirrorPattern / PatternReading / CueRule below) and says "lane 1 step 1 writes it first; lanes 2-4 add entries to
// it". This lane (push-and-overhead) reached lib/mirror/patterns.ts before that first lane had — nothing here yet
// on disk, no lib/mirror/patterns.ts, no wrapped squat entry, when this lane started — so rather than leave two
// finished audits with no contract to register into, this lane writes the contract itself, from the brief's own
// wording, and registers ONLY its own two patterns (pushup, overhead).
//
// THE SQUAT IS NOT HERE YET. The brief says "the existing squat is registered as the first entry, behaviour
// unchanged" — wrapping lib/babylon/nexus/neuro-mirror/rules/squat-audit.ts's stateful, per-frame SquatAudit class
// behind this file's pure, whole-capture `audit(frames, ctx)` shape without changing what it reports is real work,
// and it belongs to whichever lane owns the squat/lunge/hinge line, not to this one. The lunge (lib/mirror/lungeAudit.ts)
// and the hip hinge are in the same position: built, not yet wrapped for this contract.
//
// WHAT THE NEXT LANE SHOULD DO: ADD entries to MIRROR_PATTERNS (squat first, per the brief), and if this file's
// exact shape disagrees with what lane 1 independently planned, reconcile it as a merge, not a silent overwrite —
// pushupPattern and overheadPattern below are shipped, tested audits and should not need to move. See this lane's
// own report: /Users/elijahbonds/Claude/outbox/finish-release/painfree/p4/push-and-overhead/REPORT.md.
//
// The harness (app/play/mirror/_components/mirror-harness.tsx) wiring this array into its pattern picker is also not
// this lane's change — "No harness edits" is this task's own instruction — so MIRROR_PATTERNS exists and is tested
// (pushupAudit.test.ts, overheadAudit.test.ts) but nothing reads it live yet. That is expected at this point in the
// phase, not a bug.
//
// UPDATE (carry-and-baselines lane, same day): the carry station (lib/mirror/carryAudit.ts) is now a third entry.
// It did not need to wait for the squat, since the brief only asks that the SQUAT specifically land first — squat,
// lunge and the hip hinge are still owed to this file by whichever lane owns them. This lane also gave
// PersonalBaseline a real body (see that type's own comment below).
//
// UPDATE (hinge-and-setup lane, same day): the hip hinge (lib/mirror/hingeAudit.ts) and the lift set-up check
// (lib/mirror/setupLine.ts) are now a fourth and fifth entry — the same "only the squat was asked to wait for"
// reasoning the carry station used. Both were built against this file's contract as read at the time (
// PatternFaultReading, the three-level CueRule, MirrorPatternContext, the baselines.ts-backed PersonalBaseline), so
// no reconciliation was needed. Neither reads ctx.baseline yet, the same reservation every other pattern here makes.
// The squat and the lunge are still owed.
//
// UPDATE (lane 1, registry-and-lunge, 2026-09-25): the squat lands, FIRST per the brief's own words ("the existing
// squat is registered as the first entry, behaviour unchanged") — lib/mirror/squatPattern.ts wraps the SAME live
// squat-audit.ts / squatStage.ts / cue-engine.ts the harness's corrective session already ran; nothing about that
// session's behaviour changes. The lunge lands second and, unlike every pattern above, is MOUNTED live this phase
// (owner decision #9: "lunge (mount)") — lib/mirror/lungeAudit.ts's auditLunge for this contract, and
// lib/mirror/lungeStage.ts driving the harness's own per-side session (front view, left leg forward then right).
// This file's shape needed no changes for either: both were built against the contract exactly as the carry and
// hinge lanes read it. app/play/mirror/_components/mirror-harness.tsx now reads MIRROR_PATTERNS for the squat and
// lunge tabs' labels and order (pushup/overhead/carry/hinge/setupLine stay registered-but-not-live, unchanged).
import type { PoseFrame } from '@/lib/pose/landmarks';
import type { PersonalBaseline } from './baselines';
export type { PersonalBaseline };

export type PatternView = 'front' | 'side' | 'back';

/**
 * One athlete's own numbers, carried between sessions (the Plan's "personal baselines per athlete", phase 4 item 4).
 * RECONCILED (MIRROR-COACH P4, carry-and-baselines lane, 2026-09-29): this file's own first draft had this as a
 * bare `Record<string, number>` placeholder, unread by either audit landed here so far (see this file's header —
 * push-and-overhead reserved it for "whichever phase-4/5 lane adds the per-athlete store"). That lane is this one
 * (lib/mirror/baselines.ts): a flat value-per-key map cannot tell "no baseline yet" from "baseline is zero", and
 * cannot carry how many sessions it is built from — both needed for the brief's own "building your baseline (n/3)"
 * — so the real type lives in baselines.ts and is re-exported here, per this file's own instruction to reconcile
 * a disagreement as a merge, not a silent overwrite. Nothing about MirrorPatternContext's shape changes: a pattern
 * still just gets `ctx.baseline?: PersonalBaseline`, now with a real value behind it.
 */

/** One measured check, camera-estimated. 'unreadable' is never 'ok' — a check the view or the light would not let the
 *  camera take is reported as unreadable, never silently passed. */
export interface PatternFaultReading {
  id: string;
  side?: 'left' | 'right';
  value: number;
  unit: string;
  status: 'ok' | 'fault' | 'unreadable';
}

export interface PatternReading {
  faults: PatternFaultReading[];
  /** How many of the capture's frames actually had a readable body in the pattern's own view. */
  readableFrames: number;
  /** One line, athlete-facing: what the camera saw, or why it could not look (screen.ts's copy rules apply here too). */
  note: string;
}

/** The coach's voice for one fault, at three levels of insistence (cue-engine.ts's own CueCard shape, reused here so
 *  a pattern's cue table can be handed straight to that engine once a phase wires the coach into these patterns). */
export interface CueRule {
  faultId: string;
  cue: string;
  escalate: string;
  regress: string;
  /** MIRROR-MOVES P2 (2026-10-07): the reply to a repeated fault — a different, simpler wording of `cue`, said in its slot
   *  once the fault keeps coming back in a set (cue-engine.ts REPEAT_REPLY_FIRES). Linted like `cue` (lib/coach/cueLint.ts). */
  reply?: string;
}

export interface MirrorPatternContext {
  /** Which side the athlete is working, when the pattern is inherently one-sided (a lunge's front leg, a hinge's
   *  weak side a coach flags). Absent for a pattern that reads both sides or auto-detects the one it can see. */
  side?: 'left' | 'right';
  baseline?: PersonalBaseline;
}

export interface MirrorPattern {
  id: string;
  label: string;
  view: PatternView;
  /** Set for a held-position pattern (a plank, a carry) instead of counted reps. */
  timed?: { seconds: number };
  /** Set for a counted pattern: how many reps the check set and the work set ask for. */
  reps?: { checkReps: number; workReps: number };
  /**
   * PURE, BATCH: the whole capture goes in at once and one reading comes out — not the older audits' stateful,
   * fed-one-camera-frame-at-a-time shape (squat-audit.ts, lungeAudit.ts). Everything a pattern needs to calibrate,
   * count reps and gate its own view is internal to this one call.
   */
  audit: (frames: PoseFrame[], ctx: MirrorPatternContext) => PatternReading;
  cues: readonly CueRule[];
  /** False hides any max-effort or bracing cue for a minor (lib/mirror/youth.ts isMinorForMirror) — owner decision #6. */
  youthSafe: boolean;
}

import { squatPattern } from './squatPattern';
import { lungePattern } from './lungeAudit';
import { overheadPattern } from './overheadAudit';
import { pushupPattern } from './pushupAudit';
import { CARRY_PATTERN } from './carryAudit';
import { hingePattern } from './hingeAudit';
import { setupLinePattern } from './setupLine';

export const MIRROR_PATTERNS: readonly MirrorPattern[] = [
  squatPattern,
  lungePattern,
  pushupPattern,
  overheadPattern,
  CARRY_PATTERN,
  hingePattern,
  setupLinePattern,
];

// MIRROR-COACH P9 (2026-09-30), PLAN item 9 rule (e): the written correctives are registered BESIDE the audits — the band
// drills, the release and the cross-session program (lib/mirror/correctives.ts). They are not MirrorPattern entries: a
// pattern is an audit (frames in, a reading out) and a corrective reads no frames, so forcing one in would need a fake
// `audit`. The Mirror's picker lists both (mirror-harness.tsx: the pattern tabs, then CorrectivesPicker). Every
// corrective is adults-only (youthSafe: false — owner decision #6).
export { MIRROR_CORRECTIVE_SESSIONS, type MirrorCorrectiveSession } from './correctives';
