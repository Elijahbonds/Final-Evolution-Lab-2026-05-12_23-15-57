// lungeReps — the live lunge's rep counter (MIRROR-FIXES, 2026-10-25).
//
// WHY THIS REPLACED RepCounter FOR THE LUNGE. The harness used to count a lunge by feeding LungeAudit's velocity phase
// (lungeStage.ts lungePhaseToMovement: descending/bottom → pull, ascending → press, standing → hold) to
// lib/babylon/nexus/neuro-mirror/rules/rep-counter.ts RepCounter. LungeAudit's phase is the hip's frame-to-frame
// velocity against a fixed line, and under lib/pose/synth.ts's default landmark jitter it flickers — standing,
// descending and bottom inside one descent — so RepCounter's MIN_PHASE_MS guard drops the transitions it needs and the
// cycle never closes. Measured by lane/coach-video-review (2026-10-24) and reproduced here
// (scripts/probes/_mirror-live-jitter.ts, tests/helpers/mirrorJitterSets.ts, 6 seeds): 24 of 76 jittered lunges
// counted, 4 of 4 noise-free. LungeAudit's depth01 (the front thigh's drop against the standing line) is smooth under
// the same jitter, so a rep here is the squat's shape on it (squatStage.ts REP_MIN_DROP / REP_END_DROP): it ARMS when
// depth01 reaches LUNGE_REP_ARM_DEPTH and CLOSES on the first frame back under LUNGE_REP_END_DEPTH, if it stayed armed
// MIN_REP_FRAMES camera frames (sideRepStage.ts's own "a blip across the line is not a rep"). 76 of 76, and still none
// on the owner's standing, running-in-place and shuffling takes.
//
// Pure apart from its own book: feed it each frame's LungeAudit read, get true on the frame a rep closes. A frame whose
// clock has not advanced (a 60 Hz display handing a 30 fps frame over twice) changes nothing; a frame with nobody in it,
// or while the audit is still calibrating its standing line, neither arms nor closes a rep.
import type { LungeFrameResult } from './lungeAudit';
import { MIN_REP_FRAMES } from './sideRepStage';

/** A lunge rep arms when the front thigh has dropped this share of the way to the knee line (LungeAudit depth01; the
 *  audit's own shallow line is 0.5 at the bottom, so a shallow rep still counts and is still called shallow).
 *  TUNE(elijah) (new) — the same value lane/coach-video-review's set reader counts by. */
export const LUNGE_REP_ARM_DEPTH = 0.3;
/** …and closes on the first frame back above this share (a hysteresis band: jitter around one line cannot both arm and
 *  close a rep). TUNE(elijah) (new) — the same value lane/coach-video-review's set reader counts by. */
export const LUNGE_REP_END_DEPTH = 0.1;

export class LungeRepCounter {
  private armed = false;
  private armedFrames = 0;
  private lastMs: number | null = null;
  private count = 0;

  /** Reps closed so far. */
  get reps(): number { return this.count; }

  reset(): void {
    this.armed = false; this.armedFrames = 0; this.lastMs = null; this.count = 0;
  }

  /** One LungeAudit read. True on the frame a rep closes. */
  feed(read: Pick<LungeFrameResult, 'present' | 'front' | 'depth01'>, nowMs: number): boolean {
    if (this.lastMs !== null && !(nowMs > this.lastMs)) return false;
    this.lastMs = nowMs;
    // nobody in frame, or the audit still calibrating its standing line (front === null): nothing to read
    if (!read.present || read.front === null) return false;
    if (!this.armed) {
      if (read.depth01 >= LUNGE_REP_ARM_DEPTH) { this.armed = true; this.armedFrames = 0; }
      return false;
    }
    this.armedFrames += 1;
    if (read.depth01 >= LUNGE_REP_END_DEPTH) return false;
    const counted = this.armedFrames >= MIN_REP_FRAMES;
    this.armed = false; this.armedFrames = 0;
    if (counted) this.count += 1;
    return counted;
  }
}
