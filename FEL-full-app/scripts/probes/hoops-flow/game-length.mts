// hoops-flow (owner 2026-11-12, "3v3 is first to 21 on a 4-minute clock"): how many possessions a side a 3v3 game lasts, at the old 90 s
// clock and the new 240 s one. HEADLESS: their possessions are the real team offence over the real brains (rival-sim-3v3's sim3v3: the
// lengths it measures, check to release, and the expected points a possession at the tier), played as whole games by the mode's own rules:
// the game clock runs through every possession and the dead ball after it (the replay and the intro hold the clock: the harness holds
// update()), first to 21 ends it, the horn decides it otherwise (hornCall: the leader; level is the 30 s sudden-death overtime).
//
// Assumptions (said, not measured here): MY possessions are drawn from the same lengths and score at the same rate as theirs (the play
// audit: "mine of similar length"; an even game); a made bucket is a three one time in five (2.2 points a make); the dead ball between two
// possessions (the shot in the air, the board or the make banner and the check) is DEAD_SEC on the clock — the run prints 1.0 / 1.8 / 2.6.
//
//   npx tsx scripts/probes/hoops-flow/game-length.mts [--n 200] [--games 4000] [--tier pro|all] [--seed 7]
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const { setFeelUser, setFeelSession } = await import(APP + '/lib/feel-panel/feel.ts');
setFeelUser(true); setFeelSession(null);
const { hornCall, overtimeSec, THREE_GAME_SEC } = await import(APP + '/lib/babylon/modes/threevthreeOvertime.ts');
const m = await import('../hoops-gap/rival-sim-3v3.mts');

const arg = (k: string, d: string) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const N = Number(arg('--n', '200')), GAMES = Number(arg('--games', '4000')), SEED = Number(arg('--seed', '7'));
const TIERS = arg('--tier', 'pro') === 'all' ? ['rookie', 'pro', 'elite'] : [arg('--tier', 'pro')];
const TARGET = 21, THREE_SHARE = 0.2, MAKE_PTS = 2 + THREE_SHARE;

const mkRng = (seed: number) => { let s = seed >>> 0; return () => { s += 0x6D2B79F5; let r = Math.imul(s ^ (s >>> 15), 1 | s); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; };
const q = (a: number[], k: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(k * (s.length - 1)))]; };
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;

function games(lens: number[], ppp: number, clock: number, dead: number, rng: () => number) {
  const pMake = Math.min(1, ppp / MAKE_PTS);
  const per: number[] = [], len: number[] = []; let at21 = 0, ot = 0;
  for (let g = 0; g < GAMES; g++) {
    let t = clock, my = 0, foe = 0, side = 0, poss = [0, 0], overtimes = 0, elapsed = 0;
    for (let guard = 0; guard < 500; guard++) {
      // one possession: its length off the sim, then the dead ball; a bucket counts where it is scored (21 ends it at once)
      const sec = lens[Math.floor(rng() * lens.length)] + dead;
      poss[side]++;
      const made = rng() < pMake, pts = made ? (rng() < THREE_SHARE ? 3 : 2) : 0;
      const live = Math.min(sec, Math.max(0, t));   // a shot released before the horn counts (the horn waits for a ball in the air)
      t -= sec; elapsed += live;
      if (side === 0) my += pts; else foe += pts;
      if (my >= TARGET || foe >= TARGET) { at21++; break; }
      const call = hornCall({ buzzer: t <= 0, overtime: overtimes > 0, live: false, my, foe });
      if (call === 'overtime') { overtimes++; ot += overtimes === 1 ? 1 : 0; t = overtimeSec(); }
      else if (call !== 'play') break;
      side = 1 - side;
    }
    per.push((poss[0] + poss[1]) / 2); len.push(elapsed);
  }
  return { possPerSide: { mean: +mean(per).toFixed(1), p10: q(per, 0.1), med: q(per, 0.5), p90: q(per, 0.9) }, at21Pct: +(100 * at21 / GAMES).toFixed(1), otPct: +(100 * ot / GAMES).toFixed(1), clockSecMean: +mean(len).toFixed(0) };
}

for (const tier of TIERS) {
  const r = await m.sim3v3(tier, { n: N, team: true, seed: SEED, def: 'bot' });
  const lens = r.lensRaw as number[];
  console.log(`3v3 ${tier}: their possession (sim, n ${N}) median ${q(lens, 0.5).toFixed(2)} s [${q(lens, 0.25).toFixed(2)}–${q(lens, 0.75).toFixed(2)}], mean ${mean(lens).toFixed(2)} s; ${r.ptsPerPoss.toFixed(2)} points a possession`);
  for (const dead of [1.0, 1.8, 2.6]) for (const clock of [90, THREE_GAME_SEC]) {
    const out = games(lens, r.ptsPerPoss, clock, dead, mkRng(SEED * 31 + clock + Math.round(dead * 10)));
    console.log(`  clock ${String(clock).padStart(3)} s, dead ball ${dead.toFixed(1)} s: possessions a side ${out.possPerSide.mean} (p10 ${out.possPerSide.p10}, median ${out.possPerSide.med}, p90 ${out.possPerSide.p90}); ended at 21 ${out.at21Pct} %, to overtime ${out.otPct} %; game clock used ${out.clockSecMean} s`);
  }
}
