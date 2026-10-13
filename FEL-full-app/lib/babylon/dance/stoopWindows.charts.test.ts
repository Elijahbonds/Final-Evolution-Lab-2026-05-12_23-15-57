// MUSIC-SUITE P10 (2026-09-29, re-landed 2026-10-13 with the authored charts, closed PR #46): Stoop's guard over every
// shipped authored chart (charts/*.json). Split out of stoopWindows.test.ts so the guard and its own tests could land
// before the charts did; this file is the sweep that needed them. (#46's missed-DOUBLE case is not here: a double is a
// STYLE tap now, not a step the judge can miss — dance/chart.ts.)
import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { DancePerformance, MISS_AFTER, beatDuration } from '../core/DanceCore';
import { inJudgeWindow, type JudgeWindow } from '../audio/mic/hostVoice';
import { chartStepsFor } from './chart';
import { FEL_SONGS } from './felSongs';
import { STOOP_LOOKAHEAD, STOOP_WINDOW_PAD_SEC, stoopJudgeWindows } from './stoopWindows';

const PAD = STOOP_WINDOW_PAD_SEC;
const CLOSE = Math.max(PAD, MISS_AFTER);
/** What DanceMode.stoopWindows returned before the P10 guard. */
function oldWindows(perf: DancePerformance, now: number): JudgeWindow[] {
  const next = perf.upcoming(now, 1)[0];
  return next ? [{ from: next.time - 0.12, to: next.time + 0.12 }] : [];
}
/** SpeechQueue.poll's own hold test, for a line of `sec` starting at `now`. */
const holds = (w: readonly JudgeWindow[], now: number, sec: number): boolean => inJudgeWindow(now, w) || w.some((x) => x.from >= now && x.from < now + sec);

describe('every shipped chart, every step missed, 60 fps: a line never starts over a window the judge can still score', () => {
  // The worst case for the guard: nobody presses, so every step sits pending for MISS_AFTER. At every frame, a line of
  // `sec` may start only if no step that can still be judged lies in [now, now + sec) — ground truth from the chart
  // itself: a step's window runs from time − PAD until the judge expires it (time + MISS_AFTER). The old rule (P9's) and
  // the first P10 cut (pad only) are counted too, to show both bugs are real on the shipped charts.
  // The sweep runs once, in beforeAll, into a local table (run alone with -t, shuffled or retried it still has its data).
  const files = fs.readdirSync(path.resolve(__dirname, 'charts')).filter((f) => f.endsWith('.json'));
  const SEC = 1.333;
  const sweep = new Map<string, { frames: number; newMiss: number; oldMiss: number; padOnlyMiss: number }>();
  beforeAll(() => {
    for (const song of FEL_SONGS) {
      const steps = chartStepsFor(song) ?? [];
      const bd = beatDuration(song.bpm);
      const times = steps.map((s) => s.beat * bd);
      const perf = new DancePerformance(song.bpm);
      perf.setRoutine(steps);
      perf.start(0);
      const end = (times[times.length - 1] ?? 0) + 1;
      let newMiss = 0, oldMiss = 0, padOnlyMiss = 0, frames = 0;
      for (let t = 0; t <= end; t += 1 / 60) {
        perf.update(t);
        frames++;
        const truth = times.some((x) => x + CLOSE > t && x - PAD < t + SEC);
        if (!truth) continue;
        const up = perf.upcoming(t, STOOP_LOOKAHEAD);
        if (!holds(stoopJudgeWindows(up, t), t, SEC)) newMiss++;
        if (!holds(oldWindows(perf, t), t, SEC)) oldMiss++;
        if (!holds(up.map((u) => ({ from: u.time - PAD, to: u.time + PAD })).filter((w) => w.to > t), t, SEC)) padOnlyMiss++;
      }
      sweep.set(song.id, { frames, newMiss, oldMiss, padOnlyMiss });
    }
  });
  it('the six charts are all here', () => { expect(files.length).toBe(FEL_SONGS.length); });
  for (const song of FEL_SONGS) {
    it(`${song.id}: 0 frames where a 1.333 s line starts over a window the judge can still score`, () => {
      expect(chartStepsFor(song)?.length ?? 0).toBeGreaterThan(0);
      const r = sweep.get(song.id)!;
      expect(r.frames).toBeGreaterThan(60);
      expect(r.newMiss).toBe(0);
      // (the old guards' counts are not asserted per song: a sparse chart may give them no chance to fail)
    });
  }
  it('…and across the six, the old guard (and the first P10 cut, pad only) both let lines start over judgeable steps', () => {
    const all = [...sweep.values()];
    expect(all.length).toBe(FEL_SONGS.length);
    expect(all.reduce((a, r) => a + r.oldMiss, 0)).toBeGreaterThan(0);
    expect(all.reduce((a, r) => a + r.padOnlyMiss, 0)).toBeGreaterThan(0);
  });
});
