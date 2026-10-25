// lib/coach/live/reader.ts — COACH-LIVE (2026-10-25): the live set's rep counter and form flags, on the client's phone.
//
// INTERIM — REPLACED BY AN IMPORT. The per-movement set reader is lane/coach-video-review's
// lib/coach/formReview/reader.ts (PR #438, not merged when this was written). The brief: import from it once it lands,
// never edit its files. Until then this file runs the same Mirror audits by the same rules, with the same shape
// (LiveRep ≡ its RepWindow, createLiveReader ≡ its createSetReader), so the swap is one line:
//     export { createSetReader as createLiveReader, type RepWindow as LiveRep } from '@/lib/coach/formReview/reader';
// and this file's own test keeps passing against it. The numbers marked BORROWED are #438's (TUNE(elijah), measured
// there on jittered sets); they are not new tuning, and they leave with this file.
//
// What reads, and by whose rules (nothing graded here is new):
//   squat   squat-audit.ts SquatAudit per frame; a rep arms at squatStage.ts REP_MIN_DROP and closes on a standing
//           frame under REP_END_DROP; a held descent past SHALLOW_REP_DROP that never armed is a shallow rep. A rep
//           that never read square is counted and marked read: false (depth only).
//   lunge   lungeAudit.ts LungeAudit per frame + framing.ts's front-view test; faults that persisted
//           LUNGE_CUE_PERSIST_FRAMES front-on frames (the live coach's rule); the count on depth01 (BORROWED).
//   hinge,  sideRepStage.ts stepSideRep with hingeStage.ts HINGE_LIVE / pushupStage.ts PUSHUP_LIVE, every rep counted,
//   pushup  each graded by the pattern's own gradeRep on its own frames.
//
// Runs on the CLIENT's phone at the camera's full rate (the audits' frame-count rules assume ~30 fps; the coach's side
// gets frames at ~20 Hz, too thin for them). Pure: frames in, reps out; nothing stored or sent.

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
import type { FaultSide, LiveMovement } from './movements';

export interface LiveRep {
  /** 1-based, in the order done. */
  n: number;
  /** The pose clock (ms) where the rep left the top, and where it was back. */
  startMs: number;
  endMs: number;
  faults: string[];
  sides: Record<string, FaultSide>;
  /** The audit could read this rep in its view (false: counted, not graded). */
  read: boolean;
}

export interface LiveReader {
  /** One camera frame; the rep that closed on it, else null. A frame at or before the last one is ignored. */
  step(f: PoseFrame): LiveRep | null;
  reps(): LiveRep[];
}

/** The most reps one set may hold. BORROWED (#438 MAX_SET_REPS). */
export const MAX_SET_REPS = 60;
/** BORROWED (#438 LUNGE_REP_ARM_DEPTH / LUNGE_REP_END_DEPTH / KNEE_SIDE_SHARE / SIDE_REP_LEAD_MS). */
export const LUNGE_REP_ARM_DEPTH = 0.3;
export const LUNGE_REP_END_DEPTH = 0.1;
export const KNEE_SIDE_SHARE = 0.5;
export const SIDE_REP_LEAD_MS = 0;

const toAdapter = (f: PoseFrame): AdapterFrame => ({
  present: f.present, timestampMs: f.t, landmarks: f.image.map((l) => ({ x: l.x, y: l.y, z: l.z, visibility: l.v })),
});

export function kneeSide(left: number, right: number): FaultSide {
  const top = Math.max(left, right);
  const l = left > 0 && left >= top * KNEE_SIDE_SHARE, r = right > 0 && right >= top * KNEE_SIDE_SHARE;
  return l && r ? 'both' : l ? 'left' : 'right';
}

function squatReader(): LiveReader {
  const audit = new SquatAudit();
  const out: LiveRep[] = [];
  let lastT: number | null = null, armed = false, peak = 0, past = 0, topMs: number | null = null, square = false;
  let faults = new Set<SquatFault>();
  const knee = { left: 0, right: 0 };
  return {
    reps: () => [...out],
    step(f) {
      if (lastT !== null && !(f.t > lastT)) return null;
      lastT = f.t;
      const r = audit.evaluate(toAdapter(f));
      const drop = r.hipDrop;
      if (r.present && drop !== undefined) {
        if (drop >= REP_MIN_DROP) armed = true;
        peak = Math.max(peak, drop);
        if (drop >= SHALLOW_REP_DROP) past += 1;
      }
      const atTop = r.present && r.phase === 'standing' && (drop === undefined || drop < REP_END_DROP);
      if (!atTop && r.present) {
        for (const x of r.faults) faults.add(x);
        if (r.square === true) square = true;
        if (r.faults.includes('kneeValgus') && r.valgusBySide) {
          if (r.valgusBySide.left >= SQUAT_THRESHOLDS.valgusWarn) knee.left += 1;
          if (r.valgusBySide.right >= SQUAT_THRESHOLDS.valgusWarn) knee.right += 1;
        }
      }
      if (!atTop) return null;
      let closed: LiveRep | null = null;
      const shallowRep = !armed && drop !== undefined && peak >= SHALLOW_REP_DROP && past >= SHALLOW_MIN_FRAMES;
      if ((armed || shallowRep) && out.length < MAX_SET_REPS) {
        const fs = [...faults] as string[];
        if (shallowRep && !fs.includes('shallow')) fs.push('shallow');
        const sides: Record<string, FaultSide> = fs.includes('kneeValgus') ? { kneeValgus: kneeSide(knee.left, knee.right) } : {};
        closed = { n: out.length + 1, startMs: topMs ?? f.t, endMs: f.t, faults: square ? fs : fs.filter((x) => x === 'shallow'), sides: square ? sides : {}, read: square };
        out.push(closed);
      }
      armed = false; peak = 0; past = 0; topMs = f.t; faults = new Set(); knee.left = 0; knee.right = 0; square = false;
      return closed;
    },
  };
}

function lungeReader(): LiveReader {
  const audit = new LungeAudit();
  const out: LiveRep[] = [];
  let lastT: number | null = null, armed = false, armedFrames = 0, topMs: number | null = null, ok = 0, wrong = 0;
  const runs: Record<LungeFault, number> = { kneeIn: 0, hipDrop: 0, torsoDrift: 0, wobble: 0, shallow: 0 };
  let persisted = new Set<LungeFault>();
  const front = { left: 0, right: 0 };
  return {
    reps: () => [...out],
    step(f) {
      if (lastT !== null && !(f.t > lastT)) return null;
      lastT = f.t;
      const r = audit.evaluate(toAdapter(f));
      const framed = checkFraming({ present: f.present, landmarks: f.image.map((l) => ({ x: l.x, y: l.y, visibility: l.v })) }, 'front').ok;
      if (!r.present || r.front === null) { if (r.present) topMs = f.t; return null; }
      if (framed) ok += 1; else wrong += 1;
      for (const x of LUNGE_FAULTS) runs[x] = framed && r.faults.includes(x) ? runs[x] + 1 : 0;
      for (const x of LUNGE_FAULTS) if (runs[x] >= LUNGE_CUE_PERSIST_FRAMES) persisted.add(x);
      if (r.phase !== 'standing') front[r.front] += 1;
      if (r.depth01 >= LUNGE_REP_ARM_DEPTH) armed = true;
      if (armed) armedFrames += 1;
      if (r.depth01 >= LUNGE_REP_END_DEPTH) return null;
      let closed: LiveRep | null = null;
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
      armed = false; armedFrames = 0; topMs = f.t; persisted = new Set(); ok = 0; wrong = 0; front.left = 0; front.right = 0;
      for (const x of LUNGE_FAULTS) runs[x] = 0;
      return closed;
    },
  };
}

function sideReader<F extends string>(live: SideRepSpec<F>): LiveReader {
  const spec: SideRepSpec<F> = { ...live, checkReps: MAX_SET_REPS, workReps: MAX_SET_REPS };
  let s: SideRepState<F> = initialSideRep<F>();
  const out: LiveRep[] = [];
  let lastUpMs: number | null = null, startMs: number | null = null;
  const recent: PoseFrame[] = [];
  return {
    reps: () => [...out],
    step(f) {
      if (s.lastMs !== null && !(f.t > s.lastMs)) return null;
      const wasArmed = s.armed;
      const step = stepSideRep(spec, s, { nowMs: f.t, frame: f });
      s = step.state;
      if (f.present && f.image.length) recent.push(f);
      if (recent.length > REP_BUFFER_MAX_FRAMES) recent.shift();
      if (s.side && f.present && f.image.length) {
        const sig = spec.signal(f.image, s.side);
        if (sig !== null && spec.up(sig) && !s.armed) lastUpMs = f.t;
      }
      if (!wasArmed && s.armed) startMs = lastUpMs ?? f.t;
      if (!step.repClosed || out.length >= MAX_SET_REPS || !s.side) return null;
      const from = (startMs ?? f.t) - SIDE_REP_LEAD_MS;
      const graded = gradeRep(spec, recent.filter((x) => x.t >= from), s.side);
      const closed: LiveRep = { n: out.length + 1, startMs: startMs ?? f.t, endMs: f.t, faults: [...graded.faults], sides: {}, read: graded.read };
      out.push(closed);
      startMs = null;
      return closed;
    },
  };
}

export function createLiveReader(movement: LiveMovement): LiveReader {
  switch (movement) {
    case 'squat': return squatReader();
    case 'lunge': return lungeReader();
    case 'hinge': return sideReader(HINGE_LIVE);
    case 'pushup': return sideReader(PUSHUP_LIVE);
  }
}
