// EDU-05 motion lessons, phase B: the preview's lessons are the owner's own takes, and the committed files are what the
// adapter builds from those takes TODAY.
//   · each sample's take is the owner's own (the fixture's source says so), never a borrowed movement;
//   · each committed file opens with decodeLesson, passes lessonErrors, weighs under the roadmap's line, and matches the
//     lesson buildSampleLesson makes from its take now, within the file's own rounding (0.05° / 0.5 mm) — so a change to
//     the adapter or the format that is not followed by the generator fails here, with the command to run;
//   · the phrases cover the movement in order with no gap, and every cue sits inside it;
//   · a wrong id or a broken file gives null, never a throw.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { SAMPLE_LESSONS, bytesOf, loadSample } from './samples';
import { SAMPLE_DATA } from './samples.data';
import { SAMPLE_TAKES, buildSampleLesson, type TakeFile } from './sampleSpecs';
import { LESSON_LIMITS, MAX_KB_PER_MIN, decodeLesson, kbPerMinute, lessonErrors } from './format';

const take = (id: string): TakeFile => JSON.parse(fs.readFileSync(path.join(__dirname, '../pose/__fixtures__', `${SAMPLE_TAKES[id].fixture}.json`), 'utf8'));
const RERUN = 'the data is stale: run `npx tsx scripts/motion-lesson/build-samples.mts`';

describe('the preview lessons', () => {
  it('every sample has a take and a file, and nothing else is in the data', () => {
    const ids = SAMPLE_LESSONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Object.keys(SAMPLE_TAKES).sort()).toEqual([...ids].sort());
    expect(Object.keys(SAMPLE_DATA).sort()).toEqual([...ids].sort());
  });

  it.each(SAMPLE_LESSONS.map((s) => s.id))('%s: the take is the owner\'s own', (id) => {
    expect(take(id).source.license).toMatch(/owner/i);
  });

  it('a chip is two words at most (the first screen\'s word budget)', () => {
    for (const s of SAMPLE_LESSONS) expect(s.chip.split(/\s+/).length, s.chip).toBeLessThanOrEqual(2);
  });

  it.each(SAMPLE_LESSONS.map((s) => s.id))('%s: the file opens, passes the check, and is under the line', async (id) => {
    const l = (await loadSample(id))!;
    expect(l).not.toBeNull();
    expect(l.title).toBe(SAMPLE_LESSONS.find((s) => s.id === id)!.title);
    expect(lessonErrors(l)).toEqual([]);
    expect(l.keys.length).toBeGreaterThan(40);
    expect(kbPerMinute(bytesOf(SAMPLE_DATA[id]), l.duration)).toBeLessThan(MAX_KB_PER_MIN);
  });

  it.each(SAMPLE_LESSONS.map((s) => s.id))('%s: the file is what the adapter builds from the take today', async (id) => {
    const now = buildSampleLesson(id, take(id));
    const kept = (await decodeLesson(bytesOf(SAMPLE_DATA[id])))!;
    expect({ ...kept, keys: [] }, RERUN).toEqual({ ...now, keys: [] });
    expect(kept.keys.length, RERUN).toBe(now.keys.length);
    now.keys.forEach((k, i) => {
      const b = kept.keys[i];
      expect(Math.abs(b.t - k.t), RERUN).toBeLessThanOrEqual(0.001);
      expect(Math.abs((b.hipsY ?? 0) - (k.hipsY ?? 0)), RERUN).toBeLessThanOrEqual(0.0006);
      for (const side of ['Left', 'Right'] as const) for (const g of ['hands', 'feet'] as const) {
        k[g]![side]!.forEach((x, j) => expect(Math.abs(b[g]![side]![j] - x), RERUN).toBeLessThanOrEqual(0.0006));
      }
      for (const bone of Object.keys(k.bones ?? {})) k.bones![bone].forEach((x, j) => expect(Math.abs(b.bones![bone][j] - x), RERUN).toBeLessThanOrEqual(0.051));
    });
  });

  it.each(SAMPLE_LESSONS.map((s) => s.id))('%s: the phrases cover the movement in order, and the cues sit inside it', async (id) => {
    const l = (await loadSample(id))!;
    expect(l.phrases.map((p) => p.label)).toEqual([...SAMPLE_TAKES[id].phrases]);
    expect(l.phrases[0].from).toBe(0);
    expect(l.phrases.at(-1)!.to).toBeCloseTo(l.duration, 2);
    l.phrases.forEach((p, i) => {
      expect(p.to - p.from).toBeGreaterThan(0.4);   // long enough to loop
      if (i) expect(p.from).toBeCloseTo(l.phrases[i - 1].to, 2);
    });
    expect(l.cues.length).toBeGreaterThan(0);
    for (const c of l.cues) {
      expect(c.t).toBeGreaterThanOrEqual(0);
      expect(c.t).toBeLessThanOrEqual(l.duration);
      expect(c.text.split(/\s+/).length).toBeLessThanOrEqual(LESSON_LIMITS.cueWords);
    }
  });

  it('the jumps leave the floor: the flight is in the keys (hipsY well over standing at each "Jump" phrase)', async () => {
    const l = (await loadSample('max-jump'))!;
    const top = (from: number, to: number) => Math.max(...l.keys.filter((k) => k.t >= from && k.t <= to).map((k) => k.hipsY ?? 0));
    const [low, max, again] = l.phrases.map((p) => top(p.from, p.to));
    expect(max).toBeGreaterThan(0.5);
    expect(low).toBeGreaterThan(0.15);
    expect(low).toBeLessThan(max - 0.2);
    expect(again).toBeLessThan(max - 0.2);
  });

  it('a wrong id or a broken file is null', async () => {
    expect(await loadSample('nope')).toBeNull();
    expect(await decodeLesson(bytesOf('AAAA'))).toBeNull();
  });
});
