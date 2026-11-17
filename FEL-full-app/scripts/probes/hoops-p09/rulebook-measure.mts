// hoops-p09 (one rulebook): BEFORE → AFTER on the real modules, headless. "Before" is every hoops-p09 knob at its OFF value (which is
// the old behaviour exactly — rulebook.test.ts pins that), "after" the defaults. No browser; every number is an expected value
// integrated over the shooter's timing (no draws), except where a section says otherwise.
//   npx tsx scripts/probes/hoops-p09/rulebook-measure.mts [--json out.json]
// Sections:
//   A. make rates by timing — the player (green, early, late) and the rival per difficulty, open and contested;
//   B. a masher against a competent player — the make per attempt and the points from the same 20 shots;
//   C. the pull-up three — points per shot at ROOKIE / PRO / ELITE, for a sharp, a decent and a random shooter: the real DefenderBrain
//      on the real AiMover through the tier's reaction lens (hoops/reaction), the meter, the one contest model at the release;
//   D. a dribble move against a set, a same-way, a wrong-way and a closing defender (HandleSystem.resolveHandleMove, 20 000 rolls);
//   E. the showtime flush and a trick dunk: what each press pays.
// assumption: the human hands are this probe's illustration (sharp 12 ms, decent 45 ms one standard deviation, a masher uniform over the
// whole bar); the AI's hand up at the gather is weighted at its rate (AI_HAND_UP_CHANCE 0.75) and its block jump left out (the audit's
// read did the same: "0.48 / 0.67 with a hand up").
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const F = await import(APP + '/lib/feel-panel/feel.ts');
const core = await import(APP + '/lib/babylon/core/BasketballCore.ts');
const { DefenderBrain, rivalShotPct, contestLevel, SHOT_QUALITY_PCT } = core;
const RB = await import(APP + '/lib/babylon/hoops/rulebook.ts');
const SS = await import(APP + '/lib/babylon/core/SharedShot.ts');
const { contestFrom, closingSpeed } = await import(APP + '/lib/babylon/hoops/contest.ts');
const { contestedPct, AI_HAND_UP_CHANCE } = await import(APP + '/lib/babylon/core/HoopsDefense.ts');
const { AiMover } = await import(APP + '/lib/babylon/core/AiMovement.ts');
const { ReactiveDefender } = await import(APP + '/lib/babylon/hoops/reaction.ts');
const HS = await import(APP + '/lib/babylon/core/HandleSystem.ts');
const { SHOWTIME_PCT } = await import(APP + '/lib/babylon/core/ShowtimeDunk.ts');
const { trickPctFor } = await import(APP + '/lib/babylon/core/GameDunks.ts');
const { STICK_TRICK } = await import(APP + '/lib/babylon/core/DunkTrickStick.ts');
const { Vector3 } = await import('@babylonjs/core');

const OFF: Record<string, number> = { 'hoops.skillShotOn': 0, 'hoops.jumpGreenScale': 1, 'hoops.aiSharedShotOn': 0, 'hoops.moveReadOn': 0, 'hoops.gatherCloseoutOn': 0, 'hoops.pressFloorOn': 0 };
F.setFeelUser(true); F.setFeelSession(null);
const before = () => { for (const [k, v] of Object.entries(OFF)) F.setFeelOverride(k, v); };
const after = () => { F.resetAllFeelOverrides(); if (process.env.FEEL) for (const [k, v] of Object.entries(JSON.parse(process.env.FEEL))) F.setFeelOverride(k, Number(v)); };
const both = <T,>(fn: () => T): { before: T; after: T } => { before(); const b = fn(); after(); const a = fn(); return { before: b, after: a }; };
const pc = (x: number) => `${(100 * x).toFixed(0)} %`;
const OUT: Record<string, unknown> = {};
const TIERS = ['rookie', 'pro', 'elite'] as const;
const PCTMOD: Record<string, number> = SS.STYLE_PCT_MOD as never;

/** The player's make for ONE release `off` seconds off the green's centre: the skill rule, or the grade's rate (the old model). */
function heroMake(style: string, contest: number, dist: number, off: number): number {
  const m = SS.meterFor(style as never, contest, dist, 0);
  (m as unknown as { t: number }).t = Math.max(0, Math.min(1, m.greenCenter01 + off / m.durationSec));
  const q = m.release();
  if (RB.skillShotOn()) return RB.skillVerdict({ quality: q, offsetSec: m.offsetSec, halfSec: m.greenHalfSec, finish: SS.isFinishStyle(style as never), contest }).made ? 1 : 0;
  return Math.min(0.98, contestedPct(SHOT_QUALITY_PCT[q] * PCTMOD[style], contest));
}
/** Mean make over releases spread evenly across [a, b] seconds off the centre. */
const meanOver = (style: string, c: number, d: number, a: number, b: number, n = 200) => { let s = 0; for (let i = 0; i < n; i++) s += heroMake(style, c, d, a + (b - a) * (i + 0.5) / n); return s / n; };
const half = (style: string, c: number, d: number) => SS.meterFor(style as never, c, d, 0).greenHalfSec;
const gaussMake = (style: string, c: number, d: number, sigma: number, n = 400) => { let s = 0; for (let i = 0; i < n; i++) s += heroMake(style, c, d, SS.normalQuantile((i + 0.5) / n) * sigma); return s / n; };
const mashMake = (style: string, c: number, d: number, n = 400) => { const m = SS.meterFor(style as never, c, d, 0); let s = 0; for (let i = 0; i < n; i++) s += heroMake(style, c, d, ((i + 0.5) / n - m.greenCenter01) * m.durationSec); return s / n; };
const rivalMake = (style: 'jumper' | 'layup', c: number, d: number, tier: string) => (RB.aiSharedShotOn() ? gaussMake(style, c, d, RB.aiTimingSigmaSec(tier as never)) : rivalShotPct(d, c, style));

// ── A ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const LOOKS = [
  { name: 'jumper 6.0 m (three), open', style: 'jumper', c: 0, d: 6.9 },
  { name: 'jumper 6.0 m (three), contest 0.5', style: 'jumper', c: 0.5, d: 6.9 },
  { name: 'jumper 6.0 m (three), contest 0.8', style: 'jumper', c: 0.8, d: 6.9 },
  { name: 'jumper 4.5 m, open', style: 'jumper', c: 0, d: 4.5 },
  { name: 'jumper 4.5 m, contest 0.5', style: 'jumper', c: 0.5, d: 4.5 },
  { name: 'layup 1.5 m, contest 0.6', style: 'layup', c: 0.6, d: 1.5 },
] as const;
const A = LOOKS.map((L) => {
  const r = both(() => {
    const h = half(L.style, L.c, L.d);
    const row: Record<string, number> = {
      greenMs: 2 * h * 1000,
      green: meanOver(L.style, L.c, L.d, -h * 0.999, h * 0.999),
      early: meanOver(L.style, L.c, L.d, -h - 0.1, -h - 0.01),
      late: meanOver(L.style, L.c, L.d, h + 0.01, h + 0.1),
    };
    for (const t of TIERS) row[`rival_${t}`] = rivalMake(L.style as never, L.c, L.d, t);
    return row;
  });
  return { look: L.name, ...r };
});
OUT.A = A;
console.log('\nA. MAKE RATES BY TIMING (player) and the RIVAL per difficulty — before → after');
console.log('look                                  | green ms   | green release | early (10-100 ms) | late (10-100 ms) | rival ROOKIE  | rival PRO     | rival ELITE');
for (const r of A) {
  const b = r.before, a = r.after; const f = (k: string) => `${pc(b[k])} → ${pc(a[k])}`.padEnd(13);
  console.log(`${r.look.padEnd(37)} | ${b.greenMs.toFixed(0)} → ${a.greenMs.toFixed(0)}`.padEnd(51) + ` | ${f('green')} | ${f('early')}     | ${f('late')}    | ${f('rival_rookie')} | ${f('rival_pro')} | ${f('rival_elite')}`);
}

// ── B ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const B = [
  { name: 'open three (6.9 m)', style: 'jumper', c: 0, d: 6.9, pts: 3 },
  { name: 'three, contest 0.5', style: 'jumper', c: 0.5, d: 6.9, pts: 3 },
  { name: 'mid-range 4.5 m, contest 0.3', style: 'jumper', c: 0.3, d: 4.5, pts: 2 },
  { name: 'layup, contest 0.6', style: 'layup', c: 0.6, d: 1.5, pts: 2 },
].map((L) => ({ look: L.name, pts: L.pts, ...both(() => ({ masher: mashMake(L.style, L.c, L.d), decent: gaussMake(L.style, L.c, L.d, 0.045), sharp: gaussMake(L.style, L.c, L.d, 0.012) })) }));
OUT.B = B;
console.log('\nB. A MASHER AGAINST A COMPETENT PLAYER — make per attempt, before → after (and the points from 20 shots of that look)');
for (const r of B) {
  const f = (k: 'masher' | 'decent' | 'sharp') => `${pc(r.before[k])} → ${pc(r.after[k])} (${(20 * r.pts * r.before[k]).toFixed(0)} → ${(20 * r.pts * r.after[k]).toFixed(0)} pts)`;
  console.log(`${r.look.padEnd(30)} masher ${f('masher').padEnd(28)} decent (45 ms) ${f('decent').padEnd(28)} sharp (12 ms) ${f('sharp')}`);
}
{ // the same 20 shots, a game's mix: 8 threes (4 open, 4 at 0.5), 6 mid-range at 0.3, 6 layups at 0.6
  const mix = (who: 'masher' | 'decent' | 'sharp', k: 'before' | 'after') => 4 * 3 * B[0][k][who] + 4 * 3 * B[1][k][who] + 6 * 2 * B[2][k][who] + 6 * 2 * B[3][k][who];
  const g = { before: { masher: mix('masher', 'before'), decent: mix('decent', 'before'), sharp: mix('sharp', 'before') }, after: { masher: mix('masher', 'after'), decent: mix('decent', 'after'), sharp: mix('sharp', 'after') } };
  OUT.B_game = g;
  console.log(`a game's 20 shots (8 threes, 6 mid-range, 6 layups): masher ${g.before.masher.toFixed(1)} → ${g.after.masher.toFixed(1)} pts · decent ${g.before.decent.toFixed(1)} → ${g.after.decent.toFixed(1)} · sharp ${g.before.sharp.toFixed(1)} → ${g.after.sharp.toFixed(1)}`);
}

// ── C ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const DT = 1 / 60; const RIM_FLOOR = new Vector3(0, 0, -0.6), RIM = new Vector3(0, 3.05, -0.6);
/** One pull-up three: the handler runs the arc at 3 m/s for 1.6 s with the defender on him, stops and squeezes; the meter runs (the
 *  pull-up gather 0.27 s); the defender's track is recorded, and every release time is judged against where he was at that moment. */
function pullUp(tier: string, gatherSec: number) {
  const brain = new DefenderBrain(0.7, null, () => 0.99);   // no poke lands (the poke is not this read)
  const lens = new ReactiveDefender(brain); lens.setTier(tier as never);
  const mover = new AiMover(3.6); mover.stop();
  const shooter = new Vector3(-3.0, 0, 6.2); const self = new Vector3(-3.0, 0, 6.2 - 1.3);
  const lat = new Vector3(1, 0, 0);
  const react = (await_ms(tier)) / 1000;
  let t = 0; const track: { t: number; d: number; close: number }[] = []; let pressAt = -1;
  const sm = SS.meterFor('jumper', 0, 6.9, gatherSec);   // duration only (the start contest is read below)
  let meter = sm; let startContest = 0;
  for (let i = 0; i < 60 * 4; i++, t += DT) {
    const moving = t < 1.6;
    if (moving) shooter.addInPlace(lat.scale(3 * DT));
    if (!moving && pressAt < 0) { pressAt = t; startContest = contestLevel(shooter, self); meter = SS.meterFor('jumper', startContest, Math.hypot(shooter.x - RIM_FLOOR.x, shooter.z - RIM_FLOOR.z), gatherSec); }
    const since = pressAt < 0 ? -1 : t - pressAt;
    brain.closeOnGather = RB.gatherCloseoutOn() && since >= react && since <= meter.durationSec;
    const intent = lens.decide(DT, self, new Vector3(shooter.x, 1.0, shooter.z), RIM, [], [shooter]);   // the mode feeds the ball, the RIM, [me]
    mover.observe(self, DT);
    const st = mover.stepIntent(DT, intent);
    self.addInPlace(st.vel.scale(DT));
    if (pressAt >= 0) track.push({ t: since, d: Math.hypot(self.x - shooter.x, self.z - shooter.z), close: closingSpeed(self, st.vel, shooter) });
  }
  const dist = Math.hypot(shooter.x - RIM_FLOOR.x, shooter.z - RIM_FLOOR.z);
  const at = (s: number) => track[Math.max(0, Math.min(track.length - 1, Math.round(s / DT)))];
  /** Make for a release `off` s off the green centre (hand up weighted at its rate). */
  const make = (off: number): number => {
    const tRel = meter.greenCenter01 * meter.durationSec + off;
    const p = at(tRel);
    let sum = 0;
    for (const [handUp, w] of [[true, AI_HAND_UP_CHANCE], [false, 1 - AI_HAND_UP_CHANCE]] as const) {
      const c = contestFrom({ dist: p.d, facingCos: 1, handUp, jumpAge: Infinity, closeMps: p.close }).contest;
      const m = SS.meterFor('jumper', startContest, dist, gatherSec);
      (m as unknown as { t: number }).t = Math.max(0, Math.min(1, m.greenCenter01 + off / m.durationSec));
      const q = m.release();
      const v = RB.skillShotOn()
        ? (SS.heroSkillVerdict(q, m.offsetSec, { style: 'jumper', meterHalfSec: m.greenHalfSec, releaseContest: c, distM: dist, gatherSec }).made ? 1 : 0)
        : Math.min(0.98, contestedPct(SHOT_QUALITY_PCT[q] * 0.95, c));
      sum += w * v;
    }
    return sum;
  };
  const g = (sigma: number) => { let s = 0; const n = 300; for (let i = 0; i < n; i++) s += make(SS.normalQuantile((i + 0.5) / n) * sigma); return s / n; };
  const r = (() => { let s = 0; const n = 300; for (let i = 0; i < n; i++) s += make(((i + 0.5) / n - meter.greenCenter01) * meter.durationSec); return s / n; })();
  const rel = at(meter.greenCenter01 * meter.durationSec);
  const cRel = contestFrom({ dist: rel.d, facingCos: 1, handUp: true, jumpAge: Infinity, closeMps: rel.close }).contest;
  return { sharp: 3 * g(0.012), decent: 3 * g(0.045), random: 3 * r, defAtPress: track[0].d, defAtRelease: rel.d, contestAtRelease: cRel, startContest };
}
function await_ms(tier: string): number { return tier === 'rookie' ? 420 : tier === 'elite' ? 120 : 220; }
const C = TIERS.map((tier) => ({ tier, ...both(() => pullUp(tier, 0.27)) }));
OUT.C = C;
console.log('\nC. THE PULL-UP THREE — points per shot, before → after (defender metres off at the release; contest with his hand up)');
for (const r of C) {
  const f = (k: 'sharp' | 'decent' | 'random') => `${r.before[k].toFixed(2)} → ${r.after[k].toFixed(2)}`;
  console.log(`${r.tier.toUpperCase().padEnd(6)} sharp ${f('sharp')}  decent ${f('decent')}  random ${f('random')}  | def at release ${r.before.defAtRelease.toFixed(2)} → ${r.after.defAtRelease.toFixed(2)} m, contest ${r.before.contestAtRelease.toFixed(2)} → ${r.after.contestAtRelease.toFixed(2)}`);
}

// ── D ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
let seed = 5; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const DEFS = {
  'set (still, square)': { closing: false, set: true, man: { closingMps: 0, lateralMps: 0, offBalance: false, moveSide: 'right' } },
  'moving WITH the move (0.9 m/s)': { closing: false, set: false, man: { closingMps: 0, lateralMps: 0.9, offBalance: false, moveSide: 'right' } },
  'leaning the WRONG way (0.9 m/s)': { closing: false, set: false, man: { closingMps: 0, lateralMps: -0.9, offBalance: false, moveSide: 'right' } },
  'closing at you (2 m/s)': { closing: true, set: false, man: { closingMps: 2, lateralMps: 0, offBalance: false, moveSide: 'right' } },
  'in the air / reaching': { closing: false, set: false, man: { closingMps: 0, lateralMps: 0, offBalance: true, moveSide: 'right' } },
} as const;
const D = Object.entries(DEFS).map(([name, d]) => ({ defender: name, ...both(() => {
  let br = 0; const N = 20000;
  for (let i = 0; i < N; i++) { const o = HS.resolveHandleMove('crossover', HS.CHAIN_IDLE, HS.BASELINE_HANDLE, { present: true, within: true, closing: d.closing, set: d.set, man: d.man as never }, rnd, HS.MOVES_UNLOCKED_GATE); if (o.broke !== 'none') br++; }
  return br / N;
}) }));
OUT.D = D;
console.log('\nD. A CROSSOVER (one move, handle 50) — how often it beats the man, before → after');
// (before, the old odds did not know which way he leaned: "set" 0.04, "moving" 0.10, "closing" 0.24 — the old read has no lean)
for (const r of D) console.log(`${r.defender.padEnd(34)} ${pc(r.before)} → ${pc(r.after)}`);

// ── E ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const E = both(() => ({
  showtime: Object.fromEntries((['perfect', 'good', 'early', 'late', 'none'] as const).map((j) => [j, j === 'none' ? SHOWTIME_PCT.none : RB.pressFloored(SHOWTIME_PCT[j], SHOWTIME_PCT.none)])),
  trick: Object.fromEntries((['green', 'early', 'late'] as const).map((j) => [j, RB.pressFloored(trickPctFor(0.85, STICK_TRICK.windmill, j), 0.85)])),
}));
OUT.E = E;
console.log('\nE. DUNKS — what each press pays, before → after');
for (const j of Object.keys(E.before.showtime)) console.log(`showtime ${j.padEnd(8)} ${pc(E.before.showtime[j])} → ${pc(E.after.showtime[j])}`);
for (const j of Object.keys(E.before.trick)) console.log(`trick (windmill, plain dunk 85 %) ${j.padEnd(6)} ${pc(E.before.trick[j])} → ${pc(E.after.trick[j])}`);

const j = process.argv.indexOf('--json'); if (j > 0) fs.writeFileSync(process.argv[j + 1], JSON.stringify(OUT, null, 1));
