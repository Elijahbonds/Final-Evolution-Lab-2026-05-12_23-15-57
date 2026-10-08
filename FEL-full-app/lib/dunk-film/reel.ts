// reel — one card per jump, then the session line.
//
// The windows are clipWindow. The words are jumpLines and summaryLines, so the review and the burned-in
// export cannot drift into calling an estimate a measurement.

import { clipWindow, type ClipBounds } from './clips';
import { jumpLines, type JumpRead } from './jumpDetect';
import { summariseJumps, summaryLines, type SessionSummary } from './summary';

export interface ReelClip extends ClipBounds {
  index: number;
  lines: string[];
  jump: JumpRead;
}

export interface Reel {
  clips: ReelClip[];
  summary: SessionSummary;
  summaryLines: string[];
}

export function buildReel(jumps: readonly JumpRead[], durationMs: number): Reel {
  const summary = summariseJumps(jumps);
  const clips = jumps.map((jump, index) => {
    const bounds = clipWindow(jump.takeoffMs, jump.landingMs, durationMs);
    return { index: index + 1, ...bounds, lines: jumpLines(jump), jump };
  });
  return { clips, summary, summaryLines: summaryLines(summary) };
}
