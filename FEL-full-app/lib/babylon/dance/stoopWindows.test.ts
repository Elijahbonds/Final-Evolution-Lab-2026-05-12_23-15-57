// MUSIC-SUITE P10 (2026-09-29): Stoop's guard, replayed against a real DancePerformance — the P9 carry-over "Stoop talks
// over a scored window after a miss" (musicsuite/p9/REPORT.md). MUSIC-SUITE P10 FIX: split in two so the guard can land
// without P9 — this file needs only P8's DanceCore; the missed DOUBLE and the sweep over P9's six authored charts are in
// stoopWindows.charts.test.ts (they need P9's pressKind and charts/*.json). The old rule (the room's own code until this phase,
// `perf.upcoming(heardNow, 1)[0]` padded 0.12 s) is kept here as `oldWindows` so the bug is reproduced in node before
// the new rule is shown to close it.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DancePerformance, MISS_AFTER, type DanceStep } from '../core/DanceCore';
import { SpeechQueue, inJudgeWindow, type JudgeWindow } from '../audio/mic/hostVoice';
import { STOOP_LOOKAHEAD, STOOP_WINDOW_PAD_SEC, stoopJudgeWindows, stoopStepExpirySec } from './stoopWindows';

const PAD = STOOP_WINDOW_PAD_SEC;
/** MUSIC-SUITE P10 FIX: a press step's window stays open until the judge expires it (MISS_AFTER), not just the pad. */
const CLOSE = Math.max(PAD, MISS_AFTER);
const step = (beat: number, o: Partial<DanceStep> = {}): DanceStep => ({ clipId: 'dance_toprock', beat, holdBeats: 0.5, mirrored: false, ...o });
/** What DanceMode.stoopWindows returned before this phase. */
function oldWindows(perf: DancePerformance, now: number): JudgeWindow[] {
  const next = perf.upcoming(now, 1)[0];
  return next ? [{ from: next.time - 0.12, to: next.time + 0.12 }] : [];
}
/** SpeechQueue.poll's own hold test, for a line of `sec` starting at `now`. */
const holds = (w: readonly JudgeWindow[], now: number, sec: number): boolean => inJudgeWindow(now, w) || w.some((x) => x.from >= now && x.from < now + sec);

describe('stoopJudgeWindows (pure)', () => {
  it('opens each upcoming step PAD early, keeps it open until the judge expires it, and passes over closed ones', () => {
    expect(stoopJudgeWindows([{ time: 1 }, { time: 2 }], 0)).toEqual([{ from: 1 - PAD, to: 1 + CLOSE }, { from: 2 - PAD, to: 2 + CLOSE }]);
    // 1.25 s: step 1 expired at 1.20 (a MISS) — only step 2 is guarded
    expect(stoopJudgeWindows([{ time: 1 }, { time: 2 }], 1.25)).toEqual([{ from: 2 - PAD, to: 2 + CLOSE }]);
    // inside a window: it is kept (a line may not start inside it)
    expect(stoopJudgeWindows([{ time: 1 }], 1.05)).toEqual([{ from: 1 - PAD, to: 1 + CLOSE }]);
    expect(stoopJudgeWindows([], 3)).toEqual([]);
    expect(stoopJudgeWindows([{ time: Number.NaN }, { time: 4 }], 0)).toEqual([{ from: 4 - PAD, to: 4 + CLOSE }]);
  });
  it('P10 FIX: between time + PAD and time + MISS_AFTER a pending step is still guarded (the first cut dropped it at + PAD)', () => {
    // 1.15 s: past step 1's padded window (1.12) but inside the judge's MISS_AFTER (1.20) — it can still be hit
    expect(stoopJudgeWindows([{ time: 1 }, { time: 2 }], 1.15)).toEqual([{ from: 1 - PAD, to: 1 + CLOSE }, { from: 2 - PAD, to: 2 + CLOSE }]);
    expect(stoopStepExpirySec()).toBe(MISS_AFTER);
    expect(stoopStepExpirySec(step(0))).toBe(MISS_AFTER);
    // a body step waits out its wider window: never less than a press step's
    expect(stoopStepExpirySec(step(0, { move: 'jump', lateGraceSec: 0.1 }))).toBeGreaterThanOrEqual(MISS_AFTER + 0.1);
  });
  it('the lookahead leaves live steps behind a missed double and a hold head (at most 3 stale entries)', () => {
    expect(STOOP_LOOKAHEAD).toBeGreaterThanOrEqual(4);
    expect(MISS_AFTER).toBeGreaterThan(PAD);   // the gap the bug lived in: pending past its padded window
  });
});

describe('P10 FIX: a single missed step, 0.15 s after its time (past the pad, inside MISS_AFTER)', () => {
  // 120 BPM: a step at 0.5 s nobody pressed, the next at 1.5 s. At 0.65 s the step is pending and STILL SCORES.
  const mk = (): DancePerformance => {
    const perf = new DancePerformance(120);
    perf.setRoutine([step(1), step(3)]);
    perf.start(0);
    for (let t = 0; t <= 0.65; t += 1 / 60) perf.update(t);
    return perf;
  };
  const now = 0.65;
  it('the judge would still score a press now (the window a line must not start inside)', () => {
    expect(mk().hit(now)).not.toBe('MISS');
  });
  it('the first P10 guard (pad only) let a 0.3 s line start; the fixed guard holds it until the step expires', () => {
    const perf = mk();
    const up = perf.upcoming(now, STOOP_LOOKAHEAD);
    const padOnly = up.map((u) => ({ from: u.time - PAD, to: u.time + PAD })).filter((x) => x.to > now);
    expect(holds(padOnly, now, 0.3)).toBe(false);                               // the bug: 0.65 is past 0.62
    expect(holds(oldWindows(perf, now), now, 0.3)).toBe(false);                 // P9's guard: the same stale window
    const w = stoopJudgeWindows(up, now);
    expect(holds(w, now, 0.3)).toBe(true);
    const q = new SpeechQueue<string>();
    q.push('line', 0.3, now);
    expect(q.poll(now, w)).toBeNull();
  });
});

describe('the room wires the new guard', () => {
  it('DanceMode.stoopWindows reads every upcoming window through stoopJudgeWindows, not upcoming(…, 1)[0]', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../modes/DanceMode.ts'), 'utf8');
    expect(src).toContain('stoopJudgeWindows(perf.upcoming(heardNow, STOOP_LOOKAHEAD), heardNow)');
    expect(src).not.toContain('perf.upcoming(heardNow, 1)[0]');
  });
});
