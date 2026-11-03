// hoops-p03 (1v1/3v3 phase 3 "rivals that play basketball"): HEADLESS read of the rival's offence over many seeded possessions. The
// rig plays ~1/60 of real time and yields a handful of possessions a run, so the gates (action variety per 10 possessions, possession
// length, make rate per shot type, AI root acceleration) are read here, on the REAL brains and modules:
//   1v1 — AttackerBrain (with the move kit, hoops/rivalOffense, or the release script: `--kit 0`) on the 1v1 rival's AiMover (3.6, the
//         mode's foeMover), against the rig's scripted defender (scripts/probes/hoops-gap/page.js: the hero's DribbleController steered
//         to 1.0 m in front of the driver on his line to the rim, a poke every 0.6–1.6 s inside 1.6 m at 50 %, a block jump 220 ms after
//         the gather) — or a HUMAN-like one (`--def human`: the same, seeing the rival REACT_MS late). The poke is the mode's read
//         (the decision's exposure ≥ STEAL_EXPOSURE_MIN in STEAL_RANGE, else a whiff: a stun and a blow-by), the block is phase 2's
//         geometry (hoops/blocks meetsRelease), the contest phase 2's one model (hoops/contest), the make chance rivalShotPct (untouched).
//   3v3 — see the 3v3 section below (hoops/teamOffense3v3 on AiMover bodies, or the release's lerped drive: `--team 0`).
//   npx tsx scripts/probes/hoops-gap/rival-sim.mts [--mode 1v1|3v3|both] [--n 200] [--tier pro|rookie|elite|all] [--kit 0|1] [--team 0|1]
//                                                  [--def bot|human] [--seed 7] [--json out.json]
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const { setFeelUser, setFeelSession, setFeelOverride } = await import(APP + '/lib/feel-panel/feel.ts');
const core = await import(APP + '/lib/babylon/core/BasketballCore.ts');
const { AttackerBrain, DribbleController, rivalShotPct, STEAL_EXPOSURE_MIN, LAYUP_RANGE } = core;
const { RivalKit, windowedVariety, actionVariety } = await import(APP + '/lib/babylon/hoops/rivalOffense.ts');
const { AiMover } = await import(APP + '/lib/babylon/core/AiMovement.ts');
const { meetsRelease, releaseFrom } = await import(APP + '/lib/babylon/hoops/blocks.ts');
const { contestFrom, closingSpeed } = await import(APP + '/lib/babylon/hoops/contest.ts');
const { Vector3 } = await import('@babylonjs/core');

setFeelUser(true); setFeelSession(null);
if (process.env.FEEL) { for (const [k, v] of Object.entries(JSON.parse(process.env.FEEL))) setFeelOverride(k, Number(v)); }
const arg = (k: string, d: string) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const N = Number(arg('--n', '200'));
const MODE = arg('--mode', 'both');
const TIERS = arg('--tier', 'all') === 'all' ? ['rookie', 'pro', 'elite'] : [arg('--tier', 'pro')];
const KIT = arg('--kit', '1') !== '0';
const TEAM = arg('--team', '1') !== '0';
const DEF = arg('--def', 'bot');
const SEED = Number(arg('--seed', '7'));
const REACT_MS = Number(process.env.REACT_MS ?? 220);
const OUT: Record<string, unknown> = {};

const mkRng = (seed: number) => { let s = seed >>> 0; return () => { s += 0x6D2B79F5; let r = Math.imul(s ^ (s >>> 15), 1 | s); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; };
const DT = 1 / 60;
const RIM = new Vector3(0, 3.05, -0.6), RIM_FLOOR = new Vector3(0, 0, -0.6);
const STEAL_RANGE = 1.6, REACH_WHIFF_STUN_SEC = 0.45, REACH_COOLDOWN_SEC = 0.4, STANDOFF = 1.0;
const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : NaN; };
const p99 = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * 0.99))] : NaN; };
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : '-');

// ── 1v1 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function sim1v1(tier: string) {
  const rng = mkRng(SEED * 7919 + tier.length);
  const brain = new AttackerBrain(rng);
  const kit = KIT ? new RivalKit(tier as never, rng) : null;
  brain.useKit(kit);
  const poss: string[][] = []; const lens: number[] = []; const accels: number[] = [];
  const shots: Record<string, { n: number; pct: number[] }> = {};
  let steals = 0, blocks = 0, capped = 0;
  const finishes: Record<string, number> = {};
  for (let p = 0; p < N; p++) {
    brain.reset();
    const self = new Vector3(0, 0, 9.2), me = new Vector3(0, 0, 7.2);
    const mover = new AiMover(3.6); mover.stop();
    const meCtl = new DribbleController(); meCtl.setFacing(0);
    const hist: { x: number; z: number }[] = [];
    let meStun = 0, jumpAge = Infinity, nextPoke = 0.5 + rng() * 0.9, gatherSeen = -1, blocked = false, reachCd = 0;
    const acts: string[] = []; let drove = 0, droveSaid = false; let crossLegacy = 0;
    let prevV = new Vector3(0, 0, 0); let t = 0; let end = '';
    let lastPhase = 'check';
    for (; t < 12; t += DT) {
      // the defender sees the rival (now, or REACT_MS late) and steers to 1.0 m in front of him on his line to the rim
      hist.push({ x: self.x, z: self.z });
      const lag = DEF === 'human' ? Math.round(REACT_MS / 1000 / DT) : 0;
      const seen = hist[Math.max(0, hist.length - 1 - lag)];
      const rx = RIM.x - seen.x, rz = RIM.z - seen.z, rl = Math.hypot(rx, rz) || 1;
      const gx = seen.x + rx / rl * 1.0, gz = seen.z + rz / rl * 1.0; const ex = gx - me.x, ez = gz - me.z, el = Math.hypot(ex, ez);
      const mag = meStun > 0 || jumpAge < 0.75 ? 0 : el < 0.15 ? 0 : Math.min(1, 0.3 + el);
      const mvx = el > 1e-4 ? ex / el * mag : 0, mvy = el > 1e-4 ? -ez / el * mag : 0;
      meCtl.update(DT, mvx, mvy, false);
      me.addInPlace(meCtl.vel.scale(DT));
      meStun = Math.max(0, meStun - DT); reachCd = Math.max(0, reachCd - DT); if (jumpAge !== Infinity) jumpAge += DT;
      // the rival decides, his mover takes it
      const dec = brain.decide(DT, self, me, RIM_FLOOR, { defenderAirborne: jumpAge !== Infinity && jumpAge < 0.6 });
      mover.observe(self, DT);
      const st = mover.track(DT, dec.wish);
      self.addInPlace(st.vel.scale(DT));
      // bodies touch, never overlap (the mode's capsules / separation)
      const sx = self.x - me.x, sz = self.z - me.z, sd = Math.hypot(sx, sz);
      if (sd < STANDOFF && sd > 1e-4) { const push = (STANDOFF - sd) / 2; self.x += sx / sd * push; self.z += sz / sd * push; me.x -= sx / sd * push; me.z -= sz / sd * push; }
      const v = new Vector3((self.x - (hist[hist.length - 1].x)) / DT, 0, (self.z - hist[hist.length - 1].z) / DT);
      if (t > 0.05) accels.push(Math.hypot(v.x - prevV.x, v.z - prevV.z) / DT);
      prevV = v;
      // the action list: the kit says its own; the script's are read off its decisions (the same rule for the drive in both)
      if (kit) { if (dec.action && dec.action !== 'drive') acts.push(dec.action); }
      else {
        if (dec.crossover) { acts.push('crossover'); crossLegacy++; }
        if (dec.phase === 'stepback' && lastPhase !== 'stepback') acts.push('stepback');
        if (dec.shot) acts.push(dec.shot === 'jumper' ? 'pull_up' : dec.shot);
      }
      if (dec.phase === 'drive' && !dec.contained) { drove += DT; if (!droveSaid && drove >= 0.5) { droveSaid = true; acts.push('drive'); } }
      lastPhase = dec.phase;
      // the poke (the bot: 50 % every 0.6–1.6 s inside 1.6 m) — the mode's read
      const dd = Math.hypot(self.x - me.x, self.z - me.z);
      if (dd < 1.6 && t >= nextPoke && meStun === 0 && reachCd === 0 && jumpAge === Infinity) {
        nextPoke = t + 0.6 + rng() * 1.0;
        if (rng() < 0.5) {
          reachCd = REACH_COOLDOWN_SEC;
          if (dd < STEAL_RANGE && dec.exposure >= STEAL_EXPOSURE_MIN && dec.phase !== 'gather' && dec.phase !== 'check') { brain.noteStolen(); steals++; end = 'steal'; break; }
          meStun = REACH_WHIFF_STUN_SEC; if (dd < 2.4) brain.blowBy();
        }
      }
      if (dec.phase === 'gather' && gatherSeen < 0) gatherSeen = t;
      if (!blocked && gatherSeen >= 0 && t - gatherSeen >= 0.22 && dd < 2.4 && jumpAge === Infinity) { blocked = true; jumpAge = 0; }
      if (dec.shot) {
        const style = dec.shot;
        finishes[dec.action ?? (style === 'jumper' ? 'pull_up' : style)] = (finishes[dec.action ?? (style === 'jumper' ? 'pull_up' : style)] ?? 0) + 1;
        if (style === 'dunk') { (shots.dunk ??= { n: 0, pct: [] }).n++; end = 'dunk'; break; }
        const toRim = RIM_FLOOR.subtract(self); toRim.y = 0; const L = toRim.length() || 1;
        const ball = releaseFrom({ x: self.x + toRim.x / L * 0.3, y: style === 'jumper' ? 1.75 : 1.7, z: self.z + toRim.z / L * 0.3 }, 0, style);
        const read = meetsRelease({ x: me.x, z: me.z, jumpAge, handsUp: false }, ball, RIM, style);
        if (read.hit) { blocks++; end = 'block'; break; }
        const one = contestFrom({ dist: dd, facingCos: 1, handUp: false, jumpAge, closeMps: closingSpeed(me, meCtl.vel, self) });
        const range = Math.hypot(self.x - RIM_FLOOR.x, self.z - RIM_FLOOR.z);
        const key = style === 'layup' ? 'layup' : 'jumper';
        (shots[key] ??= { n: 0, pct: [] }).n++; shots[key].pct.push(rivalShotPct(range, one.contest, style));
        end = 'shot'; break;
      }
    }
    if (!end) capped++;
    lens.push(t); poss.push(acts);
  }
  const v = windowedVariety(poss, 10);
  const all = actionVariety(poss.flat());
  const mix: Record<string, number> = {}; for (const a of poss.flat()) mix[a] = (mix[a] ?? 0) + 1;
  return {
    tier, kit: !!kit, def: DEF, n: N,
    variety10: { distinctMean: +v.distinctMean.toFixed(2), distinctMin: v.distinctMin, bitsMean: +v.bitsMean.toFixed(2), bitsMin: +v.bitsMin.toFixed(2) },
    allBits: +all.bits.toFixed(2), mix,
    possSec: { med: +med(lens).toFixed(2), mean: +mean(lens).toFixed(2) },
    makePct: Object.fromEntries(Object.entries(shots).map(([k, s]) => [k, { n: s.n, pct: s.pct.length ? +(100 * mean(s.pct)).toFixed(1) : null }])),
    steals, blocks, capped, finishes, accelP99: +p99(accels).toFixed(1),
  };
}

if (MODE === '1v1' || MODE === 'both') {
  for (const tier of TIERS) {
    const r = sim1v1(tier);
    OUT[`1v1-${tier}`] = r;
    console.log(`1v1 ${tier.padEnd(6)} kit ${r.kit ? 1 : 0} def ${r.def}: variety/10 ${r.variety10.distinctMean} (min ${r.variety10.distinctMin}) bits ${r.variety10.bitsMean} (min ${r.variety10.bitsMin}) | poss med ${r.possSec.med}s | make ${JSON.stringify(r.makePct)} | steals ${r.steals} blocks ${r.blocks} capped ${r.capped} | accel p99 ${r.accelP99}`);
    console.log(`           mix ${JSON.stringify(r.mix)}`);
  }
}

// ── 3v3 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// (added with hoops/teamOffense3v3)
if (MODE === '3v3' || MODE === 'both') {
  const m = await import('./rival-sim-3v3.mts').catch((e) => { console.log('3v3 sim not available: ' + String(e).slice(0, 200)); return null; });
  if (m) for (const tier of TIERS) { const r = await m.sim3v3(tier, { n: N, team: TEAM, seed: SEED, def: DEF }); OUT[`3v3-${tier}`] = r; m.print(r); }
}
const jsonOut = arg('--json', '');
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(OUT, null, 1));
void f2;
