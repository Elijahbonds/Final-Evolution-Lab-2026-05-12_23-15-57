import {
  generateRoutine, judgeDelta, DancePerformance, beatDuration, DANCE_LIBRARY,
} from '../lib/babylon/core/DanceCore';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, x = '') => {
  if (c) { pass++; console.log(`  ok   ${n}`); } else { fail++; console.log(`  FAIL ${n} ${x}`); }
};

// timing windows — must match M28's ChoreographyEngine exactly
ok('0ms is PERFECT', judgeDelta(0).label === 'PERFECT');
ok('40ms is PERFECT (boundary)', judgeDelta(0.04).label === 'PERFECT');
ok('41ms drops to GREAT', judgeDelta(0.041).label === 'GREAT');
ok('90ms is GREAT (boundary)', judgeDelta(0.09).label === 'GREAT');
ok('200ms is GOOD (boundary)', judgeDelta(0.20).label === 'GOOD');
ok('201ms is MISS', judgeDelta(0.201).label === 'MISS');
ok('early and late judge the same', judgeDelta(-0.05).label === judgeDelta(0.05).label);
ok('points preserved from M28', judgeDelta(0).points === 300 && judgeDelta(0.05).points === 200 && judgeDelta(0.15).points === 100);

ok('bpm 120 → 0.5s beat', beatDuration(120) === 0.5);
ok('bpm guards against zero', Number.isFinite(beatDuration(0)));

// routine generation
const r1 = generateRoutine({ bars: 8, difficulty: 2, seed: 42 });
const r2 = generateRoutine({ bars: 8, difficulty: 2, seed: 42 });
ok('routine is non-empty', r1.length > 0);
ok('same seed → identical routine', JSON.stringify(r1) === JSON.stringify(r2));
ok('different seed → different routine',
   JSON.stringify(r1) !== JSON.stringify(generateRoutine({ bars: 8, difficulty: 2, seed: 7 })));
ok('difficulty 1 uses only easy clips',
   generateRoutine({ bars: 8, difficulty: 1, seed: 3 })
     .every(s => DANCE_LIBRARY.find(c => c.id === s.clipId)!.difficulty === 1));
ok('difficulty 3 can use hard clips',
   generateRoutine({ bars: 24, difficulty: 3, seed: 5 })
     .some(s => DANCE_LIBRARY.find(c => c.id === s.clipId)!.difficulty === 3));

// no overlaps — the constraint that makes routines danceable
const sorted = [...r1].sort((a, b) => a.beat - b.beat);
let overlap = false;
for (let i = 1; i < sorted.length; i++) {
  if (sorted[i].beat < sorted[i - 1].beat + sorted[i - 1].holdBeats) overlap = true;
}
ok('no step starts before the previous one ends', !overlap);
ok('routine stays inside the bar count', sorted.every(s => s.beat + s.holdBeats <= 8 * 4 + 0.001));
ok('difficulty 1 never syncopates', generateRoutine({ bars: 12, difficulty: 1, seed: 9 })
     .every(s => Number.isInteger(s.beat)));

// performance
const p = new DancePerformance(120);           // beat = 0.5s
p.setRoutine([
  { clipId: 'dance_toprock_basic', beat: 0, holdBeats: 4, mirrored: false },
  { clipId: 'dance_bounce_two_step', beat: 4, holdBeats: 4, mirrored: false },
]);
ok('totalBeats includes the last hold', p.totalBeats === 8);

const fired: string[] = [];
p.onStepFired = (s) => fired.push(s.clipId);
p.start(100);
p.update(100);                                  // beat 0 fires at t=100
ok('first step fires at start', fired.length === 1);
ok('perfect hit scores 300 + combo', p.hit(100) === 'PERFECT' && p.score === 305);
p.update(101.9);                                // beat 4 = t+2.0 not yet
ok('second step not yet fired', fired.length === 1);
p.update(102.0);
ok('second step fires on its beat', fired.length === 2);
ok('slightly late is GREAT', p.hit(102.06) === 'GREAT');
ok('combo climbed to 2', p.combo === 2 && p.maxCombo === 2);

// misses
const m = new DancePerformance(120);
m.setRoutine([{ clipId: 'dance_trans_spin', beat: 0, holdBeats: 2, mirrored: false }]);
m.start(0); m.update(0);
m.update(0.5);                                  // window expired
ok('un-hit step expires as MISS', m.counts.MISS === 1);
ok('miss resets combo', m.combo === 0);
ok('hit with nothing pending is a MISS', m.hit(9) === 'MISS' && m.counts.MISS === 2);

// stars are accuracy-based, not score-based
const short = new DancePerformance(120);
short.setRoutine([{ clipId: 'dance_trans_spin', beat: 0, holdBeats: 2, mirrored: false }]);
short.start(0); short.update(0); short.hit(0);
const longRun = new DancePerformance(120);
longRun.setRoutine(generateRoutine({ bars: 16, difficulty: 1, seed: 2 }));
longRun.start(0);
for (let t = 0; t <= 40; t += 0.25) longRun.update(t);   // never hit anything
ok('perfect short run out-stars a long miss run',
   short.result().stars > longRun.result().stars,
   `${short.result().stars} vs ${longRun.result().stars}`);
ok('all-perfect is 5 stars', short.result().stars === 5);
ok('all-miss is 0 stars', longRun.result().stars === 0);
ok('accuracy is 0..1', short.result().accuracy <= 1 && longRun.result().accuracy >= 0);

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
