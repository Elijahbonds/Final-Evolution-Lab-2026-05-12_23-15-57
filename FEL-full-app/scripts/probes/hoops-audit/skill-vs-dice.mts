// hoops-audit-play (2026-11-12): HOW MUCH OF A HOOPS SHOT IS SKILL, AND HOW MUCH IS THE ROLL — headless, on the REAL modules.
//
// The hero's jump shot in 1v1 / 3v3 is: the meter (core/BasketballCore ShotMeter: the rise, the green, the perfect band, all narrowed
// by distance in core/ShotWindow) grades the release; the grade's rate (SHOT_QUALITY_PCT) times the style's pctMod, bitten by the
// contest (core/HoopsDefense contestedPct) and fatigue, is the make RATE; then core/RimDecides draws ONE error whose Weibull scale puts
// that rate exactly at the ring, and the ring says yes or no. So a release's timing sets the odds and a draw decides the shot.
// This prints, per situation:
//   · the green and the perfect band in MILLISECONDS (what a thumb has to hit);
//   · the make rate per grade (hero) beside the rival's rate for the same look (rivalShotPct, the 1v1 / 3v3 rivals' table);
//   · the expected make % of three shooters — a near-perfect timer (sigma 12 ms), a decent human (sigma 45 ms), and a random presser
//     (a uniform release across the meter) — and how many shots it takes for the decent human's skill to show over luck
//     (the number of attempts where the 95 % intervals of "decent" and "random" stop overlapping);
//   · a Monte-Carlo check that rimDecides' ring really makes at the rate it was handed (so the table is the game's, not a model).
//   npx tsx scripts/probes/hoops-audit/skill-vs-dice.mts [--json out.json]
// assumption: the human timing sigmas (12 / 45 ms) are this probe's illustration, not measured players; the grades, rates, windows and
// the ring are the shipped code with the shipped knob defaults (feel() reads the defaults: no overrides are set).
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const core = await import(APP + '/lib/babylon/core/BasketballCore.ts');
const { ShotMeter, SHOT_QUALITY_PCT, rivalShotPct } = core;
const { contestedPct } = await import(APP + '/lib/babylon/core/HoopsDefense.ts');
const { distanceGreenFactor } = await import(APP + '/lib/babylon/core/ShotWindow.ts');
const { rimDecides } = await import(APP + '/lib/babylon/core/RimDecides.ts');
const { Vector3 } = await import('@babylonjs/core');

let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const gauss = () => { let u = 0, v = 0; while (u === 0) u = rnd(); while (v === 0) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const PCT_MOD: Record<string, number> = { jumper: 0.95, fadeaway: 0.84, floater: 1.0, layup: 1.18 };   // BasketballCore classifyShot's pctMod for these styles

type Row = Record<string, unknown>;
const rows: Row[] = [];
const grade = (m: InstanceType<typeof ShotMeter>, t01: number): string => { (m as unknown as { t: number }).t = t01; (m as unknown as { active: boolean }).active = true; return m.release(); };
const heroPct = (q: string, style: string, contest: number) => Math.min(0.98, contestedPct(SHOT_QUALITY_PCT[q as keyof typeof SHOT_QUALITY_PCT] * PCT_MOD[style], contest));

for (const style of ['jumper', 'fadeaway', 'floater', 'layup']) {
  for (const dist of style === 'layup' ? [1.5] : style === 'floater' ? [3.5] : [4.5, 6.75]) {
    for (const contest of (style === 'jumper' && dist > 6 ? [0, 0.48, 0.5, 0.67, 1] : [0, 0.5, 1])) {   // 0.48 / 0.67: the 1v1 AI's standing cushion (1.35 m) without / with a hand up (hoops/contest)
      const m = new ShotMeter();
      m.start(contest, style as never, 0);
      m.narrowBy(distanceGreenFactor(dist, style as never));
      const dur = m.durationSec, c = m.greenCenter01, half = m.greenHalfWidth01;
      const greenMs = 2 * half * dur * 1000;
      const perfMs = 2 * half * 0.35 * dur * 1000;
      // three shooters: offsets in seconds around the green centre (sigma), or uniform over the meter
      const shooter = (draw: () => number, n = 20000) => { let made = 0, sum = 0; for (let i = 0; i < n; i++) { const t01 = Math.max(0, Math.min(1, draw())); const q = grade(m, t01); const p = heroPct(q, style, contest); sum += p; } return sum / n; };
      const sharp = shooter(() => c + gauss() * 0.012 / dur);
      const human = shooter(() => c + gauss() * 0.045 / dur);
      const random = shooter(() => rnd());
      // shots until the decent human separates from the random presser (95 % binomial intervals apart)
      let nSep: number | null = null;
      for (let n = 1; n <= 2000; n++) { const se = (p: number) => 1.96 * Math.sqrt(p * (1 - p) / n); if (human - se(human) > random + se(random)) { nSep = n; break; } }
      const rival = style === 'layup' ? rivalShotPct(dist, contest, 'layup') : style === 'floater' ? null : rivalShotPct(dist, contest, 'jumper');
      rows.push({ style, distM: dist, contest, meterMs: Math.round(dur * 1000), greenMs: Math.round(greenMs), perfectMs: Math.round(perfMs),
        pct: Object.fromEntries(['perfect', 'good', 'early', 'late'].map((q) => [q, +heroPct(q, style, contest).toFixed(2)])),
        expected: { sharp: +sharp.toFixed(3), human: +human.toFixed(3), random: +random.toFixed(3) }, shotsForSkillToShow: nSep, rival: rival === null ? null : +rival.toFixed(2) });
    }
  }
}
// the ring makes at the rate it is handed (the verdict is a draw at that rate: timing changes the odds, never decides alone)
const RIM = new Vector3(0, 3.05, 0), toShooter = new Vector3(0, 0, 6);
const ringCheck = [0.97, 0.8, 0.35].map((p) => { let made = 0; const N = 20000; for (let i = 0; i < N; i++) if (rimDecides(RIM, toShooter, p, p > 0.9 ? 0.95 : 0.55, {}, rnd).made) made++; return { askedPct: p, ringMadePct: +(made / N).toFixed(3) }; });

console.log('style      dist  contest | meter  green  perfect (ms) | hero pct perfect/good/early/late | expected sharp/human/random | shots for skill to show | rival');
for (const r of rows) {
  const p = r.pct as Record<string, number>, e = r.expected as Record<string, number>;
  console.log(`${String(r.style).padEnd(9)} ${String(r.distM).padStart(5)}  ${String(r.contest).padStart(5)}   | ${String(r.meterMs).padStart(5)} ${String(r.greenMs).padStart(6)} ${String(r.perfectMs).padStart(7)}      | ${p.perfect} / ${p.good} / ${p.early} / ${p.late}              | ${e.sharp} / ${e.human} / ${e.random}        | ${r.shotsForSkillToShow ?? '>2000'}                     | ${r.rival ?? '-'}`);
}
console.log('ring check (asked → made over 20 000 draws):', JSON.stringify(ringCheck));
const j = process.argv.indexOf('--json'); if (j > 0) fs.writeFileSync(process.argv[j + 1], JSON.stringify({ rows, ringCheck }, null, 1));
