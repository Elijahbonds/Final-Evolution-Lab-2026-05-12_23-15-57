// scripts/probes/_hoops-cam-bench.mts — PLAT-P09 / BBS (2026-11-03): the shot and dribble reads on every drawn fixture
// (lib/hoops-cam/scene.ts: gym, outdoors, dusk, phone low/high/portrait, an orange kit; three dribble rooms), against the
// fixture's own truth (lib/hoops-cam/bench.ts). RATES ON DRAWN FRAMES: not recorded video and not a claim about a real gym.
//   npx tsx scripts/probes/_hoops-cam-bench.mts [outFile.json]
import { writeFileSync } from 'node:fs';
import { FIXTURES, DRIBBLE_FIXTURES } from '../../lib/hoops-cam/scene';
import { benchShots, benchDribbles, shotRow, dribbleRow } from '../../lib/hoops-cam/bench';

const shots = FIXTURES.map((fx) => { const b = benchShots(fx); return { ...shotRow(b), name: fx.name, msPerFrame: Math.round((b.ms / b.frames) * 100) / 100 }; });
const dribbles = DRIBBLE_FIXTURES.map((fx) => {
  const b = benchDribbles(fx);
  const read = b.read.bounces.length;
  return { ...dribbleRow(b), name: fx.name, read, countErrPct: b.bounces ? Math.round(((read - b.bounces) / b.bounces) * 1000) / 10 : null, rateTrue: b.rateTrue, rateRead: b.rateRead };
});
const sum = (k: 'shots' | 'makes') => shots.reduce((s, r) => s + (r[k] as number), 0);
const total = {
  fixtures: shots.length, shots: sum('shots'),
  shotsFoundPct: Math.round(shots.reduce((s, r) => s + (r.shotsFoundPct ?? 0) * r.shots, 0) / sum('shots') * 10) / 10,
  makeMissAgreePctMean: Math.round(shots.reduce((s, r) => s + (r.makeMissAgreePct ?? 0), 0) / shots.length * 10) / 10,
  ghosts: shots.reduce((s, r) => s + r.ghosts, 0),
  dribbleCountErrPct: dribbles.map((d) => d.countErrPct),
};
const out = { when: new Date().toISOString(), note: 'drawn frames (lib/hoops-cam/scene.ts), not recorded video', total, shots, dribbles };
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
console.log(JSON.stringify(total));
for (const r of shots) console.log(r.id.padEnd(16), 'shots', r.shots, 'found', r.shotsFoundPct, 'agree', r.makeMissAgreePct, 'notSure', r.notSure, 'ghosts', r.ghosts, 'ball', r.ballFoundPct, 'flight', r.flightFoundPct, 'falseBall', r.falseBallPct, 'ms/f', r.msPerFrame);
for (const d of dribbles) console.log(d.id.padEnd(16), 'bounces', d.bounces, 'read', d.read, 'err%', d.countErrPct, 'found', d.foundPct, 'extra', d.extra, 'cross', d.crossovers, d.crossFoundPct, 'rate', d.rateTrue, d.rateRead);
