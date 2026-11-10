// lib/motion-lesson/sampleSpecs.ts — EDU-05 phase B (2026-11-10): how each preview lesson is BUILT from its take. The
// generator (scripts/motion-lesson/build-samples.mts) and samples.test.ts import this; the page does not.
//
// Nothing here is typed in by hand that the take can say itself: the phrases and the cues come from the take's own
// ground truth (gt.jumps: take-off and landing times). A phrase runs from halfway between the last landing and this
// take-off to halfway between this landing and the next take-off; a "Jump" cue sits on each take-off, a "Land" on each
// landing. One jump in the take: the phrases are the approach and the jump. A take cut in mid-air ends on the floor.
import type { PoseFrame } from '@/lib/pose/landmarks';
import { STREAM_FPS, framesToRecording, recordingToKeys } from './adapter';
import { LESSON_VERSION, type Cue, type MotionLesson, type Phrase } from './format';
import { SAMPLE_LESSONS } from './samples';

export interface TakeFile {
  frames: PoseFrame[];
  source: { license: string };
  gt: { jumps: { takeoff: { t: number }; landing: { t: number } }[] };
}

/** sample id → its take (lib/pose/__fixtures__/<name>.json) and its phrases' names, in order. */
export const SAMPLE_TAKES: Record<string, { fixture: string; phrases: readonly string[] }> = {
  'low-jumps': { fixture: 'jump_two_foot_low', phrases: ['Jump 1', 'Jump 2', 'Jump 3', 'Jump 4'] },
  'max-jump': { fixture: 'jump_two_foot_high', phrases: ['Low jump', 'Max jump', 'Low again'] },
  'two-foot': { fixture: 'dunk_elijah_two_foot', phrases: ['Approach', 'Jump'] },
  'one-foot': { fixture: 'dunk_elijah_one_foot', phrases: ['Approach', 'Jump'] },
};

const r2 = (x: number) => Math.round(x * 100) / 100;
/** (new) A take whose first or last frame is this far off the floor (m) was cut in the air; under ON_FLOOR_M is on it. */
export const IN_AIR_M = 0.1, ON_FLOOR_M = 0.02;

/** The lesson the adapter makes of a take today. Throws if the take has no body in it. */
export function buildSampleLesson(id: string, take: TakeFile): MotionLesson {
  const sample = SAMPLE_LESSONS.find((s) => s.id === id), spec = SAMPLE_TAKES[id];
  if (!sample || !spec) throw new Error(`[motion-lesson] no sample "${id}"`);
  const rec = framesToRecording(take.frames);
  if (!rec) throw new Error(`[motion-lesson] ${spec.fixture}: no body`);
  // A take that was cut while the body was in the air starts, or ends, as a lesson on the floor: a loop must not begin or
  // start its return in mid-air. (The low-jumps take opens on the way down from an earlier jump; the max-jump and the
  // two-foot takes end on the way up into another.) In the air = over IN_AIR_M at the cut; on the floor = under ON_FLOOR_M.
  const n = rec.rise.length;
  let first = 0, last = n - 1;
  if (rec.rise[0] > IN_AIR_M) while (first < n - 1 && rec.rise[first] > ON_FLOOR_M) first++;
  if (rec.rise[n - 1] > IN_AIR_M) while (last > first && rec.rise[last] > ON_FLOOR_M) last--;
  const from = first / STREAM_FPS;
  const { keys, duration } = recordingToKeys(rec, { from, to: last / STREAM_FPS });
  const t0 = take.frames.find((f) => f.present && f.world)!.t;
  const sec = (ms: number) => (ms - t0) / 1000 - from;
  // the jumps that are whole inside the lesson; of those, a single-jump lesson is about the last (the one-foot take hops first)
  const inside = take.gt.jumps.filter((j) => sec(j.takeoff.t) > 0 && sec(j.landing.t) < duration);
  const jumps = spec.phrases[0] === 'Approach' ? inside.slice(-1) : inside;
  const phrases: Phrase[] = [];
  const cues: Cue[] = [];
  if (spec.phrases[0] === 'Approach') {
    if (jumps.length !== 1) throw new Error(`[motion-lesson] ${spec.fixture}: no whole jump in the lesson`);
    const up = r2(sec(jumps[0].takeoff.t));
    phrases.push({ from: 0, to: up, label: spec.phrases[0] }, { from: up, to: r2(duration), label: spec.phrases[1] });
  } else {
    if (jumps.length !== spec.phrases.length) throw new Error(`[motion-lesson] ${spec.fixture}: ${jumps.length} jumps, ${spec.phrases.length} phrase names`);
    jumps.forEach((j, i) => {
      const start = i === 0 ? 0 : r2((sec(jumps[i - 1].landing.t) + sec(j.takeoff.t)) / 2);
      const end = i === jumps.length - 1 ? r2(duration) : r2((sec(j.landing.t) + sec(jumps[i + 1].takeoff.t)) / 2);
      phrases.push({ from: start, to: end, label: spec.phrases[i] });
    });
  }
  for (const j of jumps) cues.push({ t: r2(sec(j.takeoff.t)), text: 'Jump' }, { t: r2(sec(j.landing.t)), text: 'Land' });
  const weak = rec.weak.map(([a, b]): [number, number] => [r2(Math.max(0, a - from)), r2(Math.min(duration, b - from))]).filter(([a, b]) => b > a);
  return { v: LESSON_VERSION, title: sample.title, duration: r2(duration), keys, phrases, cues, beat: null, weak };
}
