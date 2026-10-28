// MIRROR-FIXES (2026-10-25): the LIVE Mirror's lunge count, side-on rep grades and push-up setup hold, under the synth's
// default landmark jitter — the three findings lane/coach-video-review measured (docs/COACH-VIDEO-REVIEW.md §8).
//   npx tsx scripts/probes/_mirror-live-jitter.ts [seeds=1,2,3,4,5,6]
// Drives the same code the harness drives (LungeAudit + the lunge rep counter; sideRepStage.ts stepSideRep).
import { readdirSync, readFileSync } from 'node:fs';
import { LungeAudit } from '@/lib/mirror/lungeAudit';
import { LungeRepCounter } from '@/lib/mirror/lungeReps';
import { initialSideRep, stepSideRep, type SideRepSpec } from '@/lib/mirror/sideRepStage';
import { HINGE_LIVE } from '@/lib/mirror/hingeStage';
import { PUSHUP_LIVE } from '@/lib/mirror/pushupStage';
import type { PoseFrame } from '@/lib/pose/landmarks';
import { hingeSets, lungeSets, pushupSets, realNegatives, type JitterSet } from '@/tests/helpers/mirrorJitterSets';

const seeds = (process.argv[2] ?? '1,2,3,4,5,6').split(',').map(Number);

function liveLungeReps(frames: readonly PoseFrame[]): number {
  const audit = new LungeAudit();
  const counter = new LungeRepCounter();
  let n = 0;
  for (const f of frames) {
    const r = audit.evaluate({ present: f.present, timestampMs: f.t, landmarks: f.image.map((l) => ({ x: l.x, y: l.y, visibility: l.v })) });
    if (counter.feed(r, f.t)) n++;
  }
  return n;
}

function liveSide<F extends string>(spec: SideRepSpec<F>, frames: readonly PoseFrame[]) {
  const big = { ...spec, checkReps: 60, workReps: 60 };
  let s = initialSideRep<F>();
  for (const f of frames) s = stepSideRep(big, s, { nowMs: f.t, frame: f }).state;
  return [...s.checkReps, ...s.workReps];
}

// 1. the lunge count
let want = 0, got = 0;
for (const s of lungeSets(seeds)) { const n = liveLungeReps(s.frames); want += s.reps; got += Math.min(n, s.reps); if (n !== s.reps) console.log(`  lunge ${s.name}: ${n}/${s.reps}`); }
console.log(`LUNGE live count: ${got} of ${want}`);
for (const n of realNegatives()) console.log(`  real negative ${n.name}: ${liveLungeReps(n.frames)} lunge reps`);

// 2. side-on grades (setup 75 frames, the jittered convention)
for (const [name, spec, sets] of [['hinge', HINGE_LIVE, hingeSets(seeds, 75)], ['push-up', PUSHUP_LIVE, pushupSets(seeds, 75)]] as [string, SideRepSpec<string>, JitterSet[]][]) {
  let flags = 0, falseFlags = 0, injected = 0, caught = 0, reps = 0, wantReps = 0;
  for (const s of sets) {
    const rs = liveSide(spec, s.frames);
    reps += rs.length; wantReps += s.reps;
    rs.forEach((r, i) => {
      const truth = s.faulty[i + 1] ?? [];
      if (r.faults.length) { flags++; if (!r.faults.some((f) => truth.includes(f))) falseFlags++; }
      else if (truth.length) { /* missed */ }
      if (truth.length) { injected++; if (r.faults.some((f) => truth.includes(f))) caught++; }
    });
    const bad = rs.map((r, i) => `${i + 1}:${r.faults.join('+') || '-'}`).join(' ');
    if (rs.some((r, i) => r.faults.length && !r.faults.some((f) => (s.faulty[i + 1] ?? []).includes(f)))) console.log(`  ${s.name}: ${bad}`);
  }
  console.log(`${name.toUpperCase()} live grades: reps ${reps}/${wantReps}; flagged reps ${flags}, false ${falseFlags}; injected reps caught ${caught}/${injected}`);
  for (const n of realNegatives()) console.log(`  real negative ${n.name}: ${liveSide(spec, n.frames).length} ${name} reps`);
}

// 3. the first push-up rep with the builder's 1.5 s setup hold
for (const [name, spec, sets] of [['push-up', PUSHUP_LIVE, pushupSets(seeds)], ['hinge', HINGE_LIVE, hingeSets(seeds)]] as [string, SideRepSpec<string>, JitterSet[]][]) {
  const clean = sets.filter((s) => !Object.keys(s.faulty).length);
  let missed = 0, total = 0;
  for (const s of sets) { const n = liveSide(spec, s.frames).length; total += n; if (n < s.reps) missed++; }
  console.log(`${name.toUpperCase()} 1.5 s setup: sets short of their reps ${missed}/${sets.length} (clean sets ${clean.length}); reps ${total}/${sets.reduce((a, s) => a + s.reps, 0)}`);
}

// 4. every owner take in lib/pose/__fixtures__ (none is a lunge, hinge or push-up set): what each live counter reads.
// Before this lane: lunge 1 on dunk_approach_two_foot, 1 on jump_two_foot_high, 0 elsewhere; hinge and push-up 0 on all.
// After: the two-foot jumps read 3 lunges each (a countermovement dip to depth01 0.3–0.49 is squat-shaped: the depth
// counter now counts it, as the old one did whenever the phase stream was clean) — an owner call, see the lane report.
for (const n of readdirSync('lib/pose/__fixtures__').filter((x) => x.endsWith('.json') && x !== 'index.json')) {
  const fx = JSON.parse(readFileSync(`lib/pose/__fixtures__/${n}`, 'utf8')) as { frames?: PoseFrame[] };
  if (!fx.frames?.[0]?.image) continue;
  const frames = fx.frames.map((f) => ({ t: f.t, present: f.present, image: f.image }));
  console.log(`owner take ${n}: lunge ${liveLungeReps(frames)}, hinge ${liveSide(HINGE_LIVE, frames).length}, push-up ${liveSide(PUSHUP_LIVE, frames).length}`);
}
