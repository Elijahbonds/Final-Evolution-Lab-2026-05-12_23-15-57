// MUSIC-SUITE P10 (2026-09-29): Stoop's guard over P9's content — a missed DOUBLE (pressKind, P9) and every shipped
// authored chart (charts/*.json, P9). Split out of stoopWindows.test.ts (MUSIC-SUITE P10 FIX) so the guard and its own
// tests can land without P9; this file lands with P9 (#46).
import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { DancePerformance, MISS_AFTER, beatDuration, type DanceStep } from '../core/DanceCore';
import { SpeechQueue, inJudgeWindow, type JudgeWindow } from '../audio/mic/hostVoice';
import { chartStepsFor } from './chart';
import { FEL_SONGS } from './felSongs';
import { STOOP_LOOKAHEAD, STOOP_WINDOW_PAD_SEC, stoopJudgeWindows } from './stoopWindows';

const PAD = STOOP_WINDOW_PAD_SEC;
const CLOSE = Math.max(PAD, MISS_AFTER);
const step = (beat: number, o: Partial<DanceStep> = {}): DanceStep => ({ clipId: 'dance_toprock', beat, holdBeats: 0.5, mirrored: false, ...o });
/** What DanceMode.stoopWindows returned before this phase. */
function oldWindows(perf: DancePerformance, now: number): JudgeWindow[] {
  const next = perf.upcoming(now, 1)[0];
  return next ? [{ from: next.time - 0.12, to: next.time + 0.12 }] : [];
}
/** SpeechQueue.poll's own hold test, for a line of `sec` starting at `now`. */
const holds = (w: readonly JudgeWindow[], now: number, sec: number): boolean => inJudgeWindow(now, w) || w.some((x) => x.from >= now && x.from < now + sec);

describe('a missed double, on a real DancePerformance', () => {
  // 120 BPM (0.5 s a beat): a single on beat 0, a DOUBLE on beats 1 and 1.125 (0.5 s, 0.5625 s — 62.5 ms apart), the
  // next scored step on beat 3 (1.5 s). Nobody presses the double.
  const perf = new DancePerformance(120);
  perf.setRoutine([step(0), step(1), step(1.125, { pressKind: 'double' }), step(3), step(4)]);
  perf.start(0);
  perf.hit(0.0);                       // the single, on time
  for (let t = 0; t <= 0.69; t += 1 / 60) perf.update(t);
  const now = 0.69;                    // both double taps pending (expire at 0.70 / 0.7625), both padded windows over

  it('reproduces P9: the old guard saw only a stale window, and a 1.333 s line would start over the step at 1.5 s', () => {
    const up = perf.upcoming(now, STOOP_LOOKAHEAD);
    expect(up.slice(0, 2).map((u) => u.time)).toEqual([0.5, 0.5625]);          // the pending double, first in line
    expect(up[2].time).toBeCloseTo(1.5, 9);
    const old = oldWindows(perf, now);
    expect(old[0].to).toBeLessThan(now);                                        // already over
    expect(holds(old, now, 1.333)).toBe(false);                                 // → the line started (the bug)
    const q = new SpeechQueue<string>();
    q.push('line', 1.333, now);
    expect(q.poll(now, old)).toBe('line');
  });

  it('the new guard holds the line: the double is still judgeable, and the live window behind it is guarded too', () => {
    const w = stoopJudgeWindows(perf.upcoming(now, STOOP_LOOKAHEAD), now);
    // P10 FIX: both double taps can still be hit (until 0.70 / 0.7625) — their windows are open; 1.5 s is guarded behind them
    expect(w.slice(0, 2)).toEqual([{ from: 0.5 - PAD, to: 0.5 + CLOSE }, { from: 0.5625 - PAD, to: 0.5625 + CLOSE }]);
    expect(w[2]).toEqual({ from: 1.5 - PAD, to: 1.5 + CLOSE });
    const q = new SpeechQueue<string>();
    q.push('line', 1.333, now);
    expect(q.poll(now, w)).toBeNull();
    // once the double has expired, a short line that ends before the next window still goes (not a blanket mute)
    const later = 0.78;
    const p2 = new DancePerformance(120);   // its own performance: the shared one above stays at `now` for the other test
    p2.setRoutine([step(0), step(1), step(1.125, { pressKind: 'double' }), step(3), step(4)]);
    p2.start(0);
    p2.hit(0.0);
    for (let t = 0; t <= later; t += 1 / 60) p2.update(t);
    const w2 = stoopJudgeWindows(p2.upcoming(later, STOOP_LOOKAHEAD), later);
    expect(w2[0]).toEqual({ from: 1.5 - PAD, to: 1.5 + CLOSE });
    const q2 = new SpeechQueue<string>();
    q2.push('short', 0.55, later);
    expect(q2.poll(later, w2)).toBe('short');
  });
});

describe('every shipped chart, every step missed, 60 fps: a line never starts over a window the judge can still score', () => {
  // The worst case for the guard: nobody presses, so every step sits pending for MISS_AFTER. At every frame, a line of
  // `sec` may start only if no step that can still be judged lies in [now, now + sec) — ground truth from the chart
  // itself: a step's window runs from time − PAD until the judge expires it (time + MISS_AFTER). P10 FIX: the first
  // cut's truth used time + PAD for the close, the same number as its guard, so the 80 ms gap the live capture caught
  // could never show up here. The old rule (P9's) and the first P10 cut (pad only) are counted too, to show both bugs
  // are real on the shipped charts, not only the toys above.
  // The sweep runs once, in beforeAll, into a local table (P10 FIX: it was written to globalThis by each song's `it`
  // and summed by a last `it` — run alone (-t, shuffle, a retry) that last test failed with nothing wrong).
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
  it('…and across the six, P9\'s guard and the first P10 cut (pad only) both let lines start over judgeable steps', () => {
    const all = [...sweep.values()];
    expect(all.length).toBe(FEL_SONGS.length);
    expect(all.reduce((a, r) => a + r.oldMiss, 0)).toBeGreaterThan(0);
    expect(all.reduce((a, r) => a + r.padOnlyMiss, 0)).toBeGreaterThan(0);
  });
});
