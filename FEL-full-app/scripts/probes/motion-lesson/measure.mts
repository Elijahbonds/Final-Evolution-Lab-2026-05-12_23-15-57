// EDU-05 motion lessons (2026-11-03, 2026-11-10): the measure the roadmap's done-when asks for, over the committed takes
// (lib/pose/__fixtures__; each carries its ground truth: gt.perFrame = the feet's true height and contact, frame by frame).
// Pure node: no camera, no model, no browser. Prints tables; writes nothing.
//
//   npx tsx scripts/probes/motion-lesson/measure.mts
//
// 1. THE FILE, per owner take: seconds, keys, weak stretches, KB, KB a minute (the line is 150), then the five takes back
//    to back ONCE (movement that never repeats: the rate with gzip's header shared out).
// 2. PLANTED FEET, per take: how far each ankle target moves side to side / front to back (cm).
// 3. THE ADAPTER, before → after (raw BlazePose points → the leg fit, the pelvis lift and the flight):
//    the hips' height against full standing height, the body's scale, and the flight — the worst height read while both
//    feet are truly down, and each jump's top against the lower foot's true height.
import fs from 'node:fs';
import path from 'node:path';
import * as AdapterNs from '../../../lib/motion-lesson/adapter';
import * as FormatNs from '../../../lib/motion-lesson/format';

// tsx loads these TypeScript modules as CommonJS from an .mts script: the named exports sit on the default
const A = ((AdapterNs as unknown as { default?: typeof AdapterNs }).default ?? AdapterNs);
const F = ((FormatNs as unknown as { default?: typeof FormatNs }).default ?? FormatNs);

const FIX = path.join(import.meta.dirname, '../../../lib/pose/__fixtures__');
const OWNER = ['stand_still', 'jump_two_foot_low', 'jump_two_foot_high', 'dunk_elijah_two_foot', 'dunk_elijah_one_foot'];
const OTHERS = ['dunk_approach_two_foot', 'jump_one_foot_runup', 'jumpshot', 'run_in_place', 'shuffle_lateral', 'punch_kick'];

interface Take {
  frames: Parameters<typeof A.framesToRecording>[0];
  gt: { jumps: { apex: { t: number; frame: number } }[]; perFrame: { footH: [number, number][]; contact: [number, number][] } };
}
const load = (name: string): Take => JSON.parse(fs.readFileSync(path.join(FIX, `${name}.json`), 'utf8'));
type Key = ReturnType<typeof A.recordingToKeys>['keys'][number];
const spread = (a: number[]) => Math.round((Math.max(...a) - Math.min(...a)) * 1000) / 10;
const f2 = (x: number) => x.toFixed(2);

console.log('1 + 2. THE FILE AND THE FEET (the owner\'s takes)');
const all: Key[] = [];
let t = 0;
console.log('take'.padEnd(22), 'sec'.padStart(5), 'keys'.padStart(5), 'weak'.padStart(5), 'KB'.padStart(6), 'KB/min'.padStart(7), '  ankle L side/front cm', '  ankle R side/front cm');
for (const name of OWNER) {
  const rec = A.framesToRecording(load(name).frames);
  if (!rec) { console.log(name, 'no body'); continue; }
  const { keys, duration } = A.recordingToKeys(rec);
  const bytes = await F.encodeLesson({ v: F.LESSON_VERSION, title: name, duration, keys, phrases: [], cues: [], beat: null, weak: rec.weak });
  const foot = (s: 'Left' | 'Right') => `${spread(keys.map((k) => k.feet![s]![0]))} / ${spread(keys.map((k) => k.feet![s]![2]))}`;
  console.log(name.padEnd(22), duration.toFixed(1).padStart(5), String(keys.length).padStart(5), String(rec.weak.length).padStart(5), (bytes.byteLength / 1024).toFixed(1).padStart(6), F.kbPerMinute(bytes, duration).toFixed(1).padStart(7), `  ${foot('Left').padEnd(22)}`, `  ${foot('Right')}`);
  for (const k of keys) all.push({ ...k, t: t + k.t });
  t += duration;
}
// the five takes back to back, ONCE: movement that never repeats. (Looping the same 15 s up to a minute reads as 7 KB a
// minute, because gzip folds a repeat to almost nothing: that is not what a real minute weighs.)
const bytes = await F.encodeLesson({ v: F.LESSON_VERSION, title: 'all five', duration: t, keys: all, phrases: [], cues: [], beat: null, weak: [] });
console.log(`the five takes back to back: ${all.length} keys over ${t.toFixed(1)} s → ${(bytes.byteLength / 1024).toFixed(1)} KB, ${F.kbPerMinute(bytes, t).toFixed(1)} KB a minute (the line: ${F.MAX_KB_PER_MIN})`);

console.log('\n3. THE ADAPTER, raw BlazePose points → fitted (hips against full standing height, m; the body\'s scale; the flight, m)');
console.log('take'.padEnd(24), 'hipsY raw lo…hi'.padEnd(18), 'now lo…hi'.padEnd(16), 'scale raw→now'.padEnd(15), 'feet-down worst'.padEnd(16), 'each jump\'s top: read / true');
for (const name of [...OWNER, ...OTHERS]) {
  const fx = load(name);
  const raw = A.framesToRecording(fx.frames, { raw: true }), rec = A.framesToRecording(fx.frames);
  if (!raw || !rec) { console.log(name, 'no body'); continue; }
  const kr = A.recordingToKeys(raw), kn = A.recordingToKeys(rec, { noRise: true });
  const ys = (ks: Key[]) => ks.map((k) => k.hipsY ?? 0);
  const t0 = fx.frames.find((f) => f.present && f.world)!.t;
  const at = (ms: number) => rec.rise[Math.max(0, Math.min(rec.rise.length - 1, Math.round(((ms - t0) / 1000) * A.STREAM_FPS)))];
  let worst = 0, down = 0;
  fx.gt.perFrame.contact.forEach((c, i) => { if (c[0] && c[1] && fx.frames[i]?.present) { worst = Math.max(worst, at(fx.frames[i].t)); down++; } });
  const tops = fx.gt.jumps.map((j) => `${f2(at(j.apex.t))} / ${f2(Math.min(...fx.gt.perFrame.footH[j.apex.frame]))}`).join(', ');
  console.log(name.padEnd(24), `${f2(Math.min(...ys(kr.keys)))} … ${f2(Math.max(...ys(kr.keys)))}`.padEnd(18), `${f2(Math.min(...ys(kn.keys)))} … ${f2(Math.max(...ys(kn.keys)))}`.padEnd(16),
    `${kr.scale.toFixed(3)}→${kn.scale.toFixed(3)}`.padEnd(15), `${f2(worst)} (${down} fr)`.padEnd(16), tops || '(no jump)');
}
