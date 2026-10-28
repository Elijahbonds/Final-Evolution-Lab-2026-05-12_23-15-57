// lib/results/jump — the jump's results as a ResultView (PLAT-P03, 2026-10-28): the jump check, the jump tests (squat,
// arm swing, hands on hips, single leg, 10-5) and the side-on approach and drop jumps.
//
// BAND (read-only, never changed here): JUMP_SAME_BAND_IN, lib/profile-v2/tiles.ts (TUNED 1.4 in: the camera jump's
// measured smallest real change, lib/jump/session.ts realChange). The profile tile, the daily drill, the weekly draft, the
// signature facts and the vertical's own result (lane vertical-easy) all read "same" from it, so a jump that is "about
// the same" here is "the same" everywhere.
// assumption: the video-read tests (protocols, approach) use the same band. A slow-motion read is tighter than the live
// camera, so this band is the cautious one (it calls more changes "about the same", never fewer).
// The 10-5's bounce score (RSI) and the drop jump's RSI have no band of their own in the jump tool: no arrow.
//
// Pure.
import { JUMP_SAME_BAND_IN } from '@/lib/profile-v2/tiles';
import type { JumpHistoryEntry } from '@/lib/jump/historyStore';
import { HISTORY_TEST_NAMES, type HistoryTest } from '@/lib/jump/historyStore';
import { compareLast, vsLineOf, type ResultNextStep, type ResultView } from './view';
import { RESULT_COPY } from './copy';

const IN = 2.54;
const in1 = (cm: number) => Math.round((cm / IN) * 10) / 10;
/** The band in centimetres (the stores keep cm). */
export const JUMP_BAND_CM = JUMP_SAME_BAND_IN * IN;

export type JumpUnit = 'in' | 'cm';

const words = (unit: JumpUnit) => ({
  against: RESULT_COPY.lastTime, up: 'higher', down: 'lower',
  fmt: (abs: number) => (unit === 'cm' ? `${Math.round(abs)} cm` : `${(Math.round((abs / IN) * 10) / 10).toFixed(1)} in`),
});

/** A jump height in the unit shown: inches to one place, centimetres whole. */
export function jumpValue(cm: number, unit: JumpUnit): string {
  return unit === 'cm' ? String(Math.round(cm)) : in1(cm).toFixed(1);
}

/** Heights (cm) now and last time → the jump's comparison, in its own band. */
export function jumpCompare(nowCm: number | null, lastCm: number | null | undefined) {
  return compareLast(nowCm, lastCm, JUMP_BAND_CM);
}

/** The jump check (live, hands on hips) or any height test. */
export function jumpHeightView(o: {
  measure: string; bestCm: number | null; plusMinusCm: number | null; lastCm: number | null | undefined;
  unit?: JumpUnit; line: string; next: ResultNextStep;
}): ResultView {
  const unit = o.unit ?? 'in';
  const c = jumpCompare(o.bestCm, o.lastCm);
  const pm = o.bestCm === null || o.plusMinusCm === null || !Number.isFinite(o.plusMinusCm) ? null
    : unit === 'cm' ? String(Math.max(1, Math.round(o.plusMinusCm))) : Math.max(0.1, o.plusMinusCm / IN).toFixed(1);
  return {
    measure: o.measure, value: o.bestCm === null ? null : jumpValue(o.bestCm, unit), unit, estimate: true, pm,
    vsLast: c.vsLast, better: 'up', vsLine: vsLineOf(c, words(unit)), line: o.line, next: o.next,
  };
}

/** The last kept result of the same test, before `now` (newest first in the store), or null. */
export function lastOfTest(entries: readonly JumpHistoryEntry[], test: HistoryTest, beforeIso?: string): JumpHistoryEntry | null {
  return entries.find((e) => e.test === test && e.bestCm !== null && (beforeIso === undefined || e.at < beforeIso)) ?? null;
}

/** A jump test's result (lib/jump/protocols.ts), against the last one of the same test kept on this phone. */
export function jumpTestView(o: {
  test: HistoryTest; bestCm: number | null; plusMinusCm: number | null; rsi?: number | null;
  last: JumpHistoryEntry | null; line: string; next: ResultNextStep;
}): ResultView {
  const measure = HISTORY_TEST_NAMES[o.test];
  if (o.test === 'rj105') {
    // the bounce score has no noise band of its own: the number, no arrow
    return {
      measure, value: o.rsi == null ? null : o.rsi.toFixed(2), unit: 'RSI', estimate: true, pm: null,
      vsLast: null, better: 'up', vsLine: null, line: o.line, next: o.next,
    };
  }
  return jumpHeightView({ measure, bestCm: o.bestCm, plusMinusCm: o.plusMinusCm, lastCm: o.last?.bestCm ?? null, line: o.line, next: o.next });
}

/** The approach jump (side-on video): the jump height, its own band; the touch height stays in the detail. */
export function approachView(o: { heightCm: number | null; plusMinusCm: number | null; lastCm?: number | null; line: string; next: ResultNextStep }): ResultView {
  return jumpHeightView({ measure: 'Approach jump', bestCm: o.heightCm, plusMinusCm: o.plusMinusCm, lastCm: o.lastCm ?? null, line: o.line, next: o.next });
}

/** The drop jump: RSI. No band of its own in the tool, so no arrow (assumption: flagged in the report). */
export function dropView(o: { rsi: number | null; line: string; next: ResultNextStep }): ResultView {
  return {
    measure: 'Drop jump', value: o.rsi == null ? null : o.rsi.toFixed(2), unit: 'RSI', estimate: true, pm: null,
    vsLast: null, better: 'up', vsLine: null, line: o.line, next: o.next,
  };
}
