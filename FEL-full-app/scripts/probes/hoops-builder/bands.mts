// hoops-builder phase B: THE BAND EDGES, MEASURED — headless, on the real modules the modes call (no scene, no browser).
// For a rating of 40 / 50 / 90 (and a playing height of 6'0" / 6'4" / 6'8") it drives the same reads the modes make through
// lib/babylon/hoops/ratedPlay.ts and prints what a player gets:
//   speed      DribbleController at full stick: top speed, speed after 0.3 s, ground covered in 1 s (sprint); the defensive slide (jog, sideways)
//   handle     the chain window (HandleSystem.chainWindowSec), how deep a chain gets at a press every 0.5 s, the lean a move needs (readTheMan)
//   shooting   the open jumper's green in ms at 4.5 m and 6.75 m, and the make % of a decent thumb (σ 45 ms) and a sharp one (σ 12 ms)
//   finishing  the contest below which a layup goes in untimed, and a decent thumb's layup make % into a 0.6 contest
//   defense    the poke range; the share of a ±0.5 s spread of jump times that blocks a jumper released 0.7 m away; the same for the
//              rival's block on MY jumper by playing height
// and checks that rating 50 at 6'4" gives exactly the numbers of the code with no ratings in it (TODAY_TUNING), to the last digit.
//   npx tsx scripts/probes/hoops-builder/bands.mts [--json out.json]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const R = await import(APP + '/lib/babylon/hoops/ratings.ts');
const P = await import(APP + '/lib/babylon/hoops/ratedPlay.ts');
const { DribbleController } = await import(APP + '/lib/babylon/core/BasketballCore.ts');
const H = await import(APP + '/lib/babylon/core/HandleSystem.ts');
const RB = await import(APP + '/lib/babylon/hoops/rulebook.ts');
const SS = await import(APP + '/lib/babylon/core/SharedShot.ts');
const B = await import(APP + '/lib/babylon/hoops/blocks.ts');

let seed = 11; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const gauss = () => { let u = 0, v = 0; while (u === 0) u = rnd(); while (v === 0) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const r3 = (x: number) => Math.round(x * 1000) / 1000;
type T = ReturnType<typeof R.tuningFor>;
const tune = (r: Partial<Record<string, number>>, heightIn = 76): T => R.tuningFor({ ratings: { ...R.NEUTRAL_RATINGS, ...r }, position: 'wing', heightIn }, { ratingFree: false });

function speed(t: T, defense: boolean) {
  const d = new DribbleController(); d.setFacing(0);
  d.speedScale = P.ratedSpeedScale(t, defense);
  const dt = 1 / 60; let s03 = 0, dist1 = 0, top = 0;
  for (let i = 1; i <= 120; i++) {
    d.update(dt, defense ? 1 : 0, defense ? 0 : -1, !defense);   // stick +Y is −Z: forward along yaw 0 (+Z) is −1
    const v = d.vel.length(); top = Math.max(top, v);
    if (i <= 60) dist1 += v * dt;
    if (i === 18) s03 = v;
  }
  return { topMps: r3(top), after03sMps: r3(s03), in1sM: r3(dist1) };
}
function handle(t: T) {
  const win = H.chainWindowSec(t.handle);
  let chain = { ...H.CHAIN_IDLE }, depth = 0;
  const moves = ['crossover', 'hesi', 'crossover', 'hesi'] as const;
  for (const m of moves) { chain = H.tickChain(chain, 0.5, t.handle); chain = H.pushChain(m, chain, t.handle); depth = Math.max(depth, chain.length); }
  return { handle: r3(t.handle), chainWindowS: r3(win), chainAtPressEvery050s: depth, leanLineMps: r3(RB.MOVE_LEAN_MPS * t.moveLeanScale) };
}
function shooting(t: T) {
  const out: Record<string, number> = {};
  for (const dist of [4.5, 6.75]) {
    const m = SS.meterFor('jumper', 0, dist, 0); P.ratedGreenStart(m, 'jumper', t);
    const w = { style: 'jumper' as const, meterHalfSec: m.greenHalfSec, releaseContest: 0, distM: dist, ratingGreen: P.ratedGreenRelease('jumper', t) };
    const half = SS.releaseHalfSec(w);
    out[`greenMs@${dist}`] = Math.round(2 * half * 1000);
    for (const [name, sigma] of [['decent', 0.045], ['sharp', 0.012]] as const) {
      seed = 11; let made = 0; const n = 40000;
      for (let i = 0; i < n; i++) if (Math.abs(gauss() * sigma) <= half) made++;
      out[`${name}Make%@${dist}`] = Math.round((made / n) * 1000) / 10;
    }
  }
  return out;
}
function finishing(t: T) {
  const free = RB.freeFinishContest();
  const c = P.ratedFinishContest(0.6, 'layup', t);
  const m = SS.meterFor('layup', c, 1.5, 0);
  const half = SS.releaseHalfSec({ style: 'layup', meterHalfSec: m.greenHalfSec, releaseContest: c, distM: 1.5 });
  seed = 11; let made = 0; const n = 40000;
  for (let i = 0; i < n; i++) if (c < free || Math.abs(gauss() * 0.045) <= half) made++;
  return { untimedBelowContest: r3(Math.min(1, free / t.finishContestScale)), contestOf06: r3(c), decentMake06: Math.round((made / n) * 1000) / 10 };
}
/** Share of jump times (a ±0.5 s spread around the release, 1 ms steps) at which `blocker`, standing 0.7 m from the shooter on his line to
 *  the rim, meets the jumper. */
function blockWindow(blocker: (jumpAge: number) => { x: number; z: number; jumpAge: number; handsUp: boolean; reachAddM?: number }, releaseAdd = 0): number {
  const from = { x: 0, y: B.RELEASE_JUMPER_M + releaseAdd, z: -0.7 }, rim = { x: 0, y: 3.05, z: 6 };
  let hits = 0, n = 0;
  for (let ms = -500; ms <= 500; ms++, n++) if (B.meetsRelease(blocker(ms / 1000), from, rim, 'jumper', 0).hit) hits++;
  return Math.round((hits / n) * 1000) / 10;
}
function defense(t: T) {
  return {
    pokeRangeM: r3(P.ratedStealRange(1.6, t)),
    myBlockWindowPct: blockWindow((age) => P.ratedBlocker({ x: 0, z: 0, jumpAge: age, handsUp: true }, t)),
    rivalBlocksMyJumperPct: blockWindow((age) => ({ x: 0, z: 0, jumpAge: age, handsUp: true }), P.ratedRelease({ x: 0, y: 0, z: 0 }, t).y),
  };
}
const measure = (t: T) => ({ speed: speed(t, false), slide: speed(t, true), handle: handle(t), shooting: shooting(t), finishing: finishing(t), defense: defense(t) });

const rows: Record<string, unknown> = {};
const today = measure(R.TODAY_TUNING);
const at50 = measure(tune({}));
const identical = JSON.stringify(today) === JSON.stringify(at50);
rows['today (no ratings)'] = today;
for (const r of [40, 90]) rows[`all ${r}`] = measure(tune({ speed: r, handle: r, shooting: r, finishing: r, defense: r }));
for (const h of [72, 80]) rows[`height ${R.heightLabel(h)} (ratings 50)`] = { defense: defense(tune({}, h)), drawnScale: R.heightLookScale(h) };
console.log(JSON.stringify({ rating50IdenticalToToday: identical, ...rows }, null, 1));
const j = process.argv.indexOf('--json');
if (j > 0) fs.writeFileSync(process.argv[j + 1], JSON.stringify({ rating50IdenticalToToday: identical, ...rows }, null, 2));
if (!identical) { console.error('RATING 50 IS NOT TODAY'); process.exit(1); }
