// hoops-gap (lane/hoops-gap, re-score 2026-11-24): CAN YOU JUST RUN PAST HIM? A human-style straight drive — no move, the stick held at
// the rim (or a step off it), walk / jog / sprint — against the real 1v1 AI defender: DefenderBrain (the mode's aggression for the tier)
// behind its reaction lens (hoops/reaction ReactiveDefender, the tier's delay), on the mode's foeMover (AiMover 3.6). The hero is the real
// DribbleController (core/BasketballCore). It starts 6.5–8.5 m out with the defender 1.25 m in front on his line (the check).
// What it prints per tier and drive: how often the defender is BEATEN (the hero reaches 2.0 m from the rim with the defender not in front:
// along his line ahead of him and within 0.8 m of it), the median gap between them there, and the contest a layup would meet there
// (hoops/contest contestFrom, no hand, no jump). 300 drives a cell (seeded start spots and angles).
//   npx tsx scripts/probes/hoops-close/drive-sim.mts [--n 300] [--seed 7] [--json out.json]
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const { setFeelUser, setFeelSession, setFeelOverride } = await import(APP + '/lib/feel-panel/feel.ts');
setFeelUser(true); setFeelSession(null);
if (process.env.FEEL) for (const [k, v] of Object.entries(JSON.parse(process.env.FEEL))) setFeelOverride(k, Number(v));
const { DefenderBrain, DribbleController } = await import(APP + '/lib/babylon/core/BasketballCore.ts');
const { AiMover } = await import(APP + '/lib/babylon/core/AiMovement.ts');
const { ReactiveDefender } = await import(APP + '/lib/babylon/hoops/reaction.ts');
const { contestFrom } = await import(APP + '/lib/babylon/hoops/contest.ts');
const { ONEVONE_TIER } = await import(APP + '/lib/babylon/modes/onevoneRules.ts').catch(() => ({ ONEVONE_TIER: null }));
const { Vector3 } = await import('@babylonjs/core');

const arg = (k: string, d: string) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const N = Number(arg('--n', '300')); const SEED = Number(arg('--seed', '7'));
const mkRng = (seed: number) => { let s = seed >>> 0; return () => { s += 0x6D2B79F5; let r = Math.imul(s ^ (s >>> 15), 1 | s); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; };
const DT = 1 / 60; const RIM = new Vector3(0, 0, -0.6);
const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : NaN; };
const AGGR: Record<string, number> = { rookie: 0.45, pro: 0.6, elite: 0.75 };   // assumption if the mode's table is not importable

type Drive = { name: string; speed: 'walk' | 'jog' | 'sprint'; offDeg: number };
const DRIVES: Drive[] = [
  { name: 'jog straight', speed: 'jog', offDeg: 0 }, { name: 'sprint straight', speed: 'sprint', offDeg: 0 },
  { name: 'sprint 25° off his line', speed: 'sprint', offDeg: 25 }, { name: 'sprint 45° off his line', speed: 'sprint', offDeg: 45 },
];
const out: Record<string, unknown> = {};
for (const tier of ['rookie', 'pro', 'elite']) {
  for (const d of DRIVES) {
    const rng = mkRng(SEED * 31 + tier.length * 7 + d.offDeg);
    let beaten = 0; const gaps: number[] = [], contests: number[] = [], times: number[] = [];
    for (let k = 0; k < N; k++) {
      const a = (rng() - 0.5) * 1.2, r = 6.5 + rng() * 2;
      const hero = new Vector3(Math.sin(a) * r, 0, RIM.z + Math.cos(a) * r);
      const toRim = RIM.subtract(hero); toRim.y = 0; toRim.normalize();
      const def = hero.add(toRim.scale(1.25));
      const ctl = new DribbleController(); ctl.setFacing(Math.atan2(toRim.x, toRim.z));
      const aggr = (ONEVONE_TIER as Record<string, { defenderAggression?: number }> | null)?.[tier]?.defenderAggression ?? AGGR[tier];
      const brain = new DefenderBrain(aggr, null, rng); const lens = new ReactiveDefender(brain); lens.setTier(tier as 'pro');
      const mover = new AiMover(3.6);
      const side = rng() < 0.5 ? -1 : 1; const off = d.offDeg * Math.PI / 180 * side;
      let t = 0, done = false;
      for (; t < 6 && !done; t += DT) {
        // the stick: at the rim, turned `off` the first 0.6 s (the angle of the attack), then straight at the rim
        const tr = RIM.subtract(hero); tr.y = 0; const L = tr.length(); tr.normalize();
        const ang = t < 0.6 ? off : 0; const c = Math.cos(ang), s = Math.sin(ang);
        const sx = tr.x * c - tr.z * s, sz = tr.x * s + tr.z * c;
        const mag = d.speed === 'walk' ? 0.35 : 1;
        ctl.update(DT, sx * mag, -sz * mag, d.speed === 'sprint');
        hero.addInPlace(ctl.vel.scale(DT));
        const it = lens.decide(DT, def, hero, RIM, [def], [hero]);
        const st = mover.stepIntent(DT, it); def.addInPlace(st.vel.scale(DT));
        // bodies touch, never pass (the 1v1 standoff)
        const bx = hero.x - def.x, bz = hero.z - def.z, bd = Math.hypot(bx, bz);
        if (bd < 1.0 && bd > 1e-4) { const p = (1.0 - bd) / 2; hero.x += bx / bd * p; hero.z += bz / bd * p; def.x -= bx / bd * p; def.z -= bz / bd * p; }
        if (L <= 2.0) {
          const ax = def.x - hero.x, az = def.z - hero.z; const along = ax * tr.x + az * tr.z, lat = Math.abs(ax * tr.z - az * tr.x);
          const inFront = along > 0 && lat < 0.8;
          if (!inFront) beaten++;
          gaps.push(Math.hypot(ax, az)); contests.push(contestFrom({ dist: Math.hypot(ax, az), facingCos: 1, handUp: false, jumpAge: Infinity, closeMps: 0 }).contest);
          times.push(t); done = true;
        }
      }
    }
    const row = { beatenPct: +(100 * beaten / N).toFixed(1), gapMed: +med(gaps).toFixed(2), layupContestMed: +med(contests).toFixed(2), secToRimMed: +med(times).toFixed(2), reached: gaps.length };
    out[`${tier} ${d.name}`] = row;
    console.log(`${tier.padEnd(6)} ${d.name.padEnd(24)} beaten ${row.beatenPct}% gap ${row.gapMed} m layup contest ${row.layupContestMed} to the rim ${row.secToRimMed} s (${row.reached}/${N})`);
  }
}
const j = arg('--json', ''); if (j) fs.writeFileSync(j, JSON.stringify({ seed: SEED, feel: process.env.FEEL ?? null, ...out }, null, 1));
