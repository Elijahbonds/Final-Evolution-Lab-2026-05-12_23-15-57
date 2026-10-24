// lib/coach/formReview/reader.ts — COACH-VIDEO-REVIEW (2026-10-24): one recorded set, rep by rep.
//
// A program set is not the Mirror's guided session: there is no breath first, no 3-rep check and 8-rep work split, no
// voice. It is "stand still, do your reps, stop". So this does not drive the guided stages (squatStage.ts,
// lungeStage.ts) — their stage machines end after 11 reps and hand over between sides — it runs the SAME per-frame
// audits and the SAME rep rules they run, and keeps each rep's window and faults:
//
//   squat    squat-audit.ts SquatAudit on every frame (its own knee/heel persistence and squareness gates), and
//            squatStage.ts's rep rule, by its own constants: the hips drop REP_MIN_DROP to arm a rep, and a standing frame
//            above REP_END_DROP ends it; a held descent past SHALLOW_REP_DROP that never armed is a shallow rep. A rep's
//            faults are every fault the audit reported on the rep's frames — what stepSquatSession keeps per work rep.
//            The knee's side comes off the audit's raw valgusBySide on the frames that faulted.
//   lunge    lungeAudit.ts LungeAudit on every frame, and framing.ts's front-view test per frame. A rep's faults are the
//            ones that PERSISTED LUNGE_CUE_PERSIST_FRAMES front-on frames running — the live coach's rule for what it may
//            say (the per-frame reads have no persistence of their own, and a coach must not be shown a one-frame
//            wobble). THE COUNT IS NOT THE HARNESS'S: the Mirror counts a lunge by feeding LungeAudit's velocity phase to
//            rep-counter.ts RepCounter, and under lib/pose/synth.ts's default landmark jitter that phase flickers
//            (standing/descending/bottom inside one descent) and RepCounter's MIN_PHASE_MS guard drops the transitions:
//            measured, it counted 24 of 76 jittered lunges (tests/helpers/formReviewSets.ts, 6 seeds; 4 of 4 noise-free).
//            The audit's depth01 is smooth under the same jitter, so a rep here is the squat's shape on it — armed at
//            LUNGE_REP_ARM_DEPTH, closed back above LUNGE_REP_END_DEPTH: 76 of 76. (A finding for the live lunge, routed
//            in docs/COACH-VIDEO-REVIEW.md, not changed here.)
//   hinge,   sideRepStage.ts stepSideRep with the pattern's own spec (hingeStage.ts HINGE_LIVE, pushupStage.ts
//   pushup   PUSHUP_LIVE) — setup side-on, then each closed rep graded by the pattern's tested batch audit
//            (sideRepStage.ts gradeRep). Two things differ from the live session: every rep of a program set counts
//            (none is held back as "the check"), and a rep is graded on ITS OWN frames (SIDE_REP_LEAD_MS) rather than
//            every frame since the rep before it. The rep line, the setup hold and the side vote are the live session's.
//
// A rep the camera could not read (the view, the light) still counts — the athlete did it — and is marked read: false,
// never "clean" (the side-on stage's own rule, kept for all four).
//
// Pure: frames in, rep windows out; no clock but the frames' own, nothing stored or sent.

import type { PoseFrame } from '@/lib/pose/landmarks';
import type { PoseFrame as AdapterFrame } from '@/lib/babylon/nexus/neuro-mirror/pose/mediapipe-adapter';
import { SquatAudit, SQUAT_THRESHOLDS, type SquatFault } from '@/lib/babylon/nexus/neuro-mirror/rules/squat-audit';
import { REP_END_DROP, REP_MIN_DROP, SHALLOW_MIN_FRAMES, SHALLOW_REP_DROP } from '@/lib/mirror/squatStage';
import { LungeAudit, type LungeFault } from '@/lib/mirror/lungeAudit';
import { LUNGE_CUE_PERSIST_FRAMES, LUNGE_FAULTS, LUNGE_UNREADABLE_MAX_OK_SHARE } from '@/lib/mirror/lungeStage';
import { checkFraming } from '@/lib/mirror/framing';
import { gradeRep, initialSideRep, MIN_REP_FRAMES, REP_BUFFER_MAX_FRAMES, stepSideRep, type SideRepSpec, type SideRepState } from '@/lib/mirror/sideRepStage';
import { HINGE_LIVE } from '@/lib/mirror/hingeStage';
import { PUSHUP_LIVE } from '@/lib/mirror/pushupStage';
import type { FaultSide, ReviewMovement } from './movements';

/** One counted rep of the set. */
export interface RepWindow {
  /** 1-based, in the order done. */
  n: number;
  /** The pose clock (ms) where the rep left the top, and where it was back. */
  startMs: number;
  endMs: number;
  /** The audit's faults on this rep, in no particular order (./score.ts orders them). */
  faults: string[];
  /** For a fault that names a side (a knee): which. */
  sides: Record<string, FaultSide>;
  /** The audit could read this rep in its view (false: counted, not graded). */
  read: boolean;
}

export interface SetReader {
  /** One camera frame. Returns the rep that closed on it, else null. A frame at or before the last one is ignored. */
  step(f: PoseFrame): RepWindow | null;
  /** Every rep counted so far (a rep under way when the set stops is not counted — the live sessions' rule). */
  reps(): RepWindow[];
}

/** The most reps one set may hold (a program set; a capture that counts more is not a set). */
export const MAX_SET_REPS = 60;
/** A lunge rep arms when the front thigh has dropped this share of the way to the knee line (LungeAudit depth01; the
 *  audit's own shallow line is 0.5 at the bottom). TUNE(elijah) (new) */
export const LUNGE_REP_ARM_DEPTH = 0.3;
/** …and ends on the first frame back above this share (a hysteresis band, the squat's REP_MIN_DROP / REP_END_DROP
 *  shape). TUNE(elijah) (new) */
export const LUNGE_REP_END_DEPTH = 0.1;
/**
 * A side-on rep is graded on its own frames: from this long before it left the top to the frame it closed. The live
 * stage grades a rep on every frame since the rep before it closed, which hands the end of a faulty rep (a head still
 * poked, a plank still sagging at the top) to the NEXT rep's grade: measured on the jittered sets
 * (tests/helpers/formReviewSets.ts, 6 seeds), that put a false flag on the rep after every faulty one — 6 of 18 hinge
 * flags and 6 of 18 push-up flags. 300 ms of lead-in still carried 1 and 2; 0 carried none, and the push-up's hand
 * set-up (read from the window's first frames) still reads. TUNE(elijah) (new)
 */
export const SIDE_REP_LEAD_MS = 0;

/** The frames a side-on reader keeps for its grade (sideRepStage.ts REP_BUFFER_MAX_FRAMES's ~8 s). */
const REP_FRAMES_KEPT = REP_BUFFER_MAX_FRAMES;

const toAdapter = (f: PoseFrame): AdapterFrame => ({
  present: f.present, timestampMs: f.t, landmarks: f.image.map((l) => ({ x: l.x, y: l.y, z: l.z, visibility: l.v })),
});

// ── the squat ─────────────────────────────────────────────────────────────────────────────────────────────────────

function squatReader(): SetReader {
  const audit = new SquatAudit();
  const out: RepWindow[] = [];
  let lastT: number | null = null;
  let armed = false, peak = 0, pastShallow = 0;
  let topMs: number | null = null;
  let faults = new Set<SquatFault>();
  const knee = { left: 0, right: 0 };
  let square = false;
  const reset = () => { faults = new Set(); knee.left = 0; knee.right = 0; square = false; };
  return {
    reps: () => [...out],
    step(f) {
      if (lastT !== null && !(f.t > lastT)) return null;
      lastT = f.t;
      const r = audit.evaluate(toAdapter(f));
      const drop = r.hipDrop;
      if (r.present && drop !== undefined && drop >= REP_MIN_DROP) armed = true;
      if (r.present && drop !== undefined) {
        peak = Math.max(peak, drop);
        if (drop >= SHALLOW_REP_DROP) pastShallow += 1;
      }
      const atTop = r.present && r.phase === 'standing' && (drop === undefined || drop < REP_END_DROP);
      let closed: RepWindow | null = null;
      if (!atTop && r.present) {
        // the rep under way: what the audit said on its frames
        for (const x of r.faults) faults.add(x);
        if (r.square === true) square = true;
        if (r.faults.includes('kneeValgus') && r.valgusBySide) {
          if (r.valgusBySide.left >= SQUAT_THRESHOLDS.valgusWarn) knee.left += 1;
          if (r.valgusBySide.right >= SQUAT_THRESHOLDS.valgusWarn) knee.right += 1;
        }
      }
      if (atTop) {
        const shallowRep = !armed && drop !== undefined && peak >= SHALLOW_REP_DROP && pastShallow >= SHALLOW_MIN_FRAMES;
        if ((armed || shallowRep) && out.length < MAX_SET_REPS) {
          const fs = [...faults] as string[];
          if (shallowRep && !fs.includes('shallow')) fs.push('shallow');
          const sides: Record<string, FaultSide> = {};
          if (fs.includes('kneeValgus')) sides.kneeValgus = knee.left && knee.right ? 'both' : knee.left ? 'left' : 'right';
          closed = {
            n: out.length + 1, startMs: topMs ?? f.t, endMs: f.t,
            // a never-square rep is read for depth only: its knee, heel and sideways checks were not taken
            faults: square ? fs : fs.filter((x) => x === 'shallow'), sides: square ? sides : {}, read: square,
          };
          out.push(closed);
        }
        armed = false; peak = 0; pastShallow = 0; topMs = f.t;
        reset();
      }
      return closed;
    },
  };
}

// ── the lunge ─────────────────────────────────────────────────────────────────────────────────────────────────────

function lungeReader(): SetReader {
  const audit = new LungeAudit();
  const out: RepWindow[] = [];
  let lastT: number | null = null;
  const runs: Record<LungeFault, number> = { kneeIn: 0, hipDrop: 0, torsoDrift: 0, wobble: 0, shallow: 0 };
  let persisted = new Set<LungeFault>();
  let ok = 0, wrong = 0;
  const front = { left: 0, right: 0 };
  let armed = false, armedFrames = 0;
  let topMs: number | null = null;
  return {
    reps: () => [...out],
    step(f) {
      if (lastT !== null && !(f.t > lastT)) return null;
      lastT = f.t;
      const r = audit.evaluate(toAdapter(f));
      const framed = checkFraming({ present: f.present, landmarks: f.image.map((l) => ({ x: l.x, y: l.y, visibility: l.v })) }, 'front').ok;
      const readable = r.present && framed;
      // the audit is still calibrating its standing line: nothing to count yet
      if (!r.present || r.front === null) { if (r.present) topMs = f.t; return null; }
      if (framed) ok += 1; else wrong += 1;
      for (const x of LUNGE_FAULTS) runs[x] = readable && r.faults.includes(x) ? runs[x] + 1 : 0;
      for (const x of LUNGE_FAULTS) if (runs[x] >= LUNGE_CUE_PERSIST_FRAMES) persisted.add(x);
      if (r.phase !== 'standing') front[r.front] += 1;
      if (r.depth01 >= LUNGE_REP_ARM_DEPTH) armed = true;
      if (armed) armedFrames += 1;
      const atTop = r.depth01 < LUNGE_REP_END_DEPTH;
      let closed: RepWindow | null = null;
      if (atTop) {
        if (armed && armedFrames >= MIN_REP_FRAMES && out.length < MAX_SET_REPS) {
          const n = ok + wrong;
          const read = n > 0 && ok / n > LUNGE_UNREADABLE_MAX_OK_SHARE;
          const fs = read ? LUNGE_FAULTS.filter((x) => persisted.has(x)) : [];
          const leg: FaultSide = front.left >= front.right ? 'left' : 'right';
          const sides: Record<string, FaultSide> = {};
          for (const x of fs) if (x === 'kneeIn' || x === 'wobble') sides[x] = leg;
          closed = { n: out.length + 1, startMs: topMs ?? f.t, endMs: f.t, faults: [...fs], sides, read };
          out.push(closed);
        }
        armed = false; armedFrames = 0; topMs = f.t;
        persisted = new Set(); ok = 0; wrong = 0; front.left = 0; front.right = 0;
        for (const x of LUNGE_FAULTS) runs[x] = 0;
      }
      return closed;
    },
  };
}

// ── the side-on movements ─────────────────────────────────────────────────────────────────────────────────────────

function sideReader<F extends string>(live: SideRepSpec<F>): SetReader {
  // every rep of a program set counts as a rep: none is held back as the guided session's 3-rep check
  const spec: SideRepSpec<F> = { ...live, checkReps: MAX_SET_REPS, workReps: MAX_SET_REPS };
  let s: SideRepState<F> = initialSideRep<F>();
  const out: RepWindow[] = [];
  let lastUpMs: number | null = null;
  let startMs: number | null = null;
  const recent: PoseFrame[] = [];
  return {
    reps: () => [...out],
    step(f) {
      if (s.lastMs !== null && !(f.t > s.lastMs)) return null;
      const wasArmed = s.armed;
      const step = stepSideRep(spec, s, { nowMs: f.t, frame: f });
      s = step.state;
      if (f.present && f.image.length) recent.push(f);
      if (recent.length > REP_FRAMES_KEPT) recent.shift();
      // where the rep left the top: the last frame the signal read "up" before the rep armed
      if (s.side && f.present && f.image.length) {
        const sig = spec.signal(f.image, s.side);
        if (sig !== null && spec.up(sig) && !s.armed) lastUpMs = f.t;
      }
      if (!wasArmed && s.armed) startMs = lastUpMs ?? f.t;
      if (!step.repClosed || out.length >= MAX_SET_REPS || !s.side) return null;
      const from = (startMs ?? f.t) - SIDE_REP_LEAD_MS;
      // the pattern's own tested grade (sideRepStage.ts gradeRep), over THIS rep's frames only
      const graded = gradeRep(spec, recent.filter((x) => x.t >= from), s.side);
      const closed: RepWindow = { n: out.length + 1, startMs: startMs ?? f.t, endMs: f.t, faults: [...graded.faults], sides: {}, read: graded.read };
      out.push(closed);
      startMs = null;
      return closed;
    },
  };
}

export function createSetReader(movement: ReviewMovement): SetReader {
  switch (movement) {
    case 'squat': return squatReader();
    case 'lunge': return lungeReader();
    case 'hinge': return sideReader(HINGE_LIVE);
    case 'pushup': return sideReader(PUSHUP_LIVE);
  }
}

/** A whole recorded set at once (the same reader, frame by frame). */
export function readSet(movement: ReviewMovement, frames: readonly PoseFrame[]): RepWindow[] {
  const r = createSetReader(movement);
  for (const f of frames) r.step(f);
  return r.reps();
}
