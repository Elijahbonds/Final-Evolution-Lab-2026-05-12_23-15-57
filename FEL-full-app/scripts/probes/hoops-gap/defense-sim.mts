// hoops-p02 (1v1/3v3 phase 2): HEADLESS read of the block and strip geometry over many seeded situations — the rig plays ~1/60 of real
// time, so a block rate to ±3 points cannot be read off it; this runs the REAL pure modules (hoops/blocks, hoops/steals, HoopsDefense)
// over the situations the rig's scripted players produce, and prints old (dice: the expected value of the roll) vs new (geometry).
//   npx tsx scripts/probes/hoops-gap/defense-sim.mts [--n 4000] [--json <rig game json>...]
// With --json, the situations are the rig run's own releases (its defence snapshots: bodies, ball, logged jump ages) instead of the
// synthetic draw. FEEL='{"hoops.blkArmM":0.8}' runs on those knob values.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
// dynamic imports of the app's TS (the CJS interop the rig's headless harnesses use)
const { setFeelUser, setFeelSession, setFeelOverride, resetAllFeelOverrides } = await import(APP + '/lib/feel-panel/feel.ts');
const { meetsRelease, aiBlockJumpAtSec, releaseFrom, JUMP_SEC } = await import(APP + '/lib/babylon/hoops/blocks.ts');
type Blocker = { x: number; z: number; jumpAge: number; handsUp: boolean };
const { aiBlockChance, aiShotRead } = await import(APP + '/lib/babylon/core/HoopsDefense.ts');
const { checkBlock } = await import(APP + '/lib/babylon/core/BasketballCore.ts');
const { aiStripLands } = await import(APP + '/lib/babylon/hoops/steals.ts');
const { aiReachGate } = await import(APP + '/lib/babylon/core/ReachTell.ts');
const { Vector3 } = await import('@babylonjs/core');

setFeelUser(true); setFeelSession(null);
if (process.env.FEEL) { for (const [k, v] of Object.entries(JSON.parse(process.env.FEEL))) setFeelOverride(k, Number(v)); }
const arg = (k: string, d: string) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const N = Number(arg('--n', '4000'));
let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const gauss = () => { let u = 0, v = 0; while (u === 0) u = rnd(); while (v === 0) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const RIM = { x: 0, y: 3.05, z: -0.6 };
const pct = (a: number, n: number) => `${(100 * a / Math.max(1, n)).toFixed(1)} %`;

// A — MY BLOCK on their release, the rig's scripted defender: 1.0 m in front of the driver toward the rim (the body standoff holds him
// ~1.1 m), jumps 220 ms + a frame after the gather shows; the gather lasts 0.32 s (1v1) / 0.35 s (3v3).
function myBlock(H: number, gatherSec: number, style: 'jumper' | 'layup', mode: '1v1' | '3v3', jumpAfterGather = 0.22 + 1 / 60) {
  let old = 0, geo = 0;
  for (let i = 0; i < N; i++) {
    const shooter = { x: (rnd() - 0.5) * 6, z: 2 + rnd() * 4.5 };
    const toRim = { x: RIM.x - shooter.x, z: RIM.z - shooter.z }; const L = Math.hypot(toRim.x, toRim.z); const u = { x: toRim.x / L, z: toRim.z / L };
    const d = Math.max(0.9, 1.15 + gauss() * 0.2), lat = gauss() * 0.3;
    const def = { x: shooter.x + u.x * d - u.z * lat, z: shooter.z + u.z * d + u.x * lat };
    const jumpAge = gatherSec - jumpAfterGather + gauss() * 0.02;
    const ball = releaseFrom({ x: shooter.x + u.x * 0.3, y: H + gauss() * 0.08, z: shooter.z + u.z * 0.3 }, 0, style);
    const dist = Math.hypot(def.x - shooter.x, def.z - shooter.z);
    const oldHit = checkBlock(new Vector3(def.x, 0, def.z), new Vector3(shooter.x, 0, shooter.z), jumpAge) && (mode === '3v3' || dist <= (style === 'jumper' ? 1.2 : 1.5));
    if (oldHit) old++;
    const b: Blocker = { x: def.x, z: def.z, jumpAge, handsUp: false };
    if (meetsRelease(b, ball, RIM, style).hit) geo++;
  }
  return { old: pct(old, N), geo: pct(geo, N) };
}

// B — THE AI's BLOCK on my release: the read at my gather (a jump 30 %, else a hand up 75 %, inside range and facing), the jump timed to
// the green; my release lands off the green by the bot's timing error. Old = the expected value of the roll (aiBlockChance).
function aiBlock(H: number, style: 'jumper' | 'layup') {
  let old = 0, geo = 0; let reads = 0;
  for (let i = 0; i < N; i++) {
    const me = { x: (rnd() - 0.5) * 6, z: 1.5 + rnd() * 5 };
    const d = Math.min(2.6, Math.max(0.95, 1.35 + gauss() * 0.35)), ang = (rnd() - 0.5) * 1.2;   // the rig logged 1.10–2.03 m at my releases   // where he stands at my release (from the rim side, ± 35°)
    const toRim = { x: RIM.x - me.x, z: RIM.z - me.z }; const L = Math.hypot(toRim.x, toRim.z); const u = { x: toRim.x / L, z: toRim.z / L };
    const c = Math.cos(ang), s = Math.sin(ang); const dir = { x: u.x * c - u.z * s, z: u.z * c + u.x * s };
    const foe = { x: me.x + dir.x * d, z: me.z + dir.z * d };
    const read = aiShotRead(d, 0.9, true, rnd);
    if (read !== 'none' && read !== 'pending') reads++;
    const green = Number(process.env.GREEN ?? 0.55), release = green + gauss() * 0.05;
    let jumpAge = Infinity;
    if (read === 'block') { const at = aiBlockJumpAtSec(green, 0.22); jumpAge = release - at; if (jumpAge >= JUMP_SEC) jumpAge = Infinity; }
    const handUp = read === 'handUp';
    const up = handUp || (jumpAge <= 0.7);
    old += aiBlockChance(style, d, up, rnd() < 0.6);
    const ball = releaseFrom({ x: me.x + u.x * 0.3, y: H + gauss() * 0.08, z: me.z + u.z * 0.3 }, Number(process.env.HERO_FEET ?? 0), style);
    if (meetsRelease({ x: foe.x, z: foe.z, jumpAge, handsUp: handUp }, ball, RIM, style).hit) geo++;
  }
  return { old: pct(old, N), geo: pct(geo, N), reads: pct(reads, N) };
}

// C — STOPS PER 10 OF MY POSSESSIONS (the possession model, coordinator 2026-10-28). The rig plays too few possessions to read a rate, so
// this composes one possession from the rig's measured rates and the real modules:
//   · possession length: the rig's offensive possessions (after: 32.4 s over 8 in 1v1, 27.0 s over 9 in 3v3 → mean 3.47 s), exponential;
//   · AI reaches: a Poisson rate, the rig's measured tells per offensive second at the gate it ran with (before 2 in 63.3 s at gate 0.5;
//     after 4 in 59.4 s at gate 0.5 with the cushion), scaled by the live gate (aiReachGate) — the gate is downstream of the intent;
//   · a reach resolves after its 0.25 s tell: beaten if I move the ball in it (the bot's moves every 0.9–2.3 s → 1 − e^(−0.25/1.6)) or
//     the shot leaves first; otherwise the strip is aiStripLands (geometry) on a sampled frame — reacher 1.1–1.5 m off, ±45° of my
//     front; the ball in the hand away from him (outside hand when guarded), 0.35 m out, 0.15 m ahead, at a dribble-cycle height
//     (0.12–0.95 m) — or the old roll (0.22) for the dice;
//   · a shot ends the possession (rig after: 16 shots in 17 possessions → 0.94); the AI blocks it at aiBlock()'s rate on a mix of
//     70 % finishes at the rim / 30 % jumpers (the rig's mix) — the geometry, or the dice's expected value for "before";
//   · other forced turnovers (an interception, a charge drawn): the rig's pooled rate, 1 in 31 possessions.
// assumption: every rate above is the rig's small-sample measure; the dribble geometry is a model, not the drawn ball.
function stops(N: number, dice: boolean, tellsPerSec05: number) {
  const L0 = 3.47, PSHOT = 0.94, POTHER = 1 / 31, PMOVE = 1 - Math.exp(-0.25 / 1.6);
  const lambda = tellsPerSec05 * aiReachGate() / 0.5;
  const blkJ = aiBlock(Number(process.env.MY_H ?? 2.1), 'jumper'), blkL = aiBlock(Number(process.env.MY_H ?? 2.1), 'layup');
  const pBlock = (dice ? 0.3 * parseFloat(blkJ.old) + 0.7 * parseFloat(blkL.old) : 0.3 * parseFloat(blkJ.geo) + 0.7 * parseFloat(blkL.geo)) / 100;
  let st = 0, strips = 0, blocks = 0, others = 0, reaches = 0, stripReads = 0, stripLands = 0;
  for (let i = 0; i < N; i++) {
    const L = -Math.log(1 - rnd()) * L0;
    let t = -Math.log(1 - rnd()) / lambda, stopped = false;
    while (t < L && !stopped) {
      reaches++;
      if (t + 0.25 < L && rnd() >= PMOVE) {
        let lands: boolean;
        if (dice) lands = rnd() < 0.22;
        else {
          const th = (rnd() - 0.5) * Math.PI / 2, d = 1.1 + rnd() * 0.4;
          const reacher = { x: Math.sin(th) * d, z: Math.cos(th) * d };
          const side = Math.abs(th) > 0.26 ? -Math.sign(th) : (rnd() < 0.5 ? -1 : 1);
          const ball = { x: side * 0.35, y: 0.12 + 0.83 * Math.abs(Math.cos(Math.PI * rnd())), z: 0.15 };
          lands = aiStripLands(reacher, { x: 0, z: 0 }, ball).lands; stripReads++; if (lands) stripLands++;
        }
        if (lands) { stopped = true; strips++; }
      }
      t += 1.2 + -Math.log(1 - rnd()) / lambda;   // the reach cooldown, then the next
    }
    if (!stopped && rnd() < POTHER) { stopped = true; others++; }
    if (!stopped && rnd() < PSHOT && rnd() < pBlock) { stopped = true; blocks++; }
    if (stopped) st++;
  }
  return { per10: +(10 * st / N).toFixed(2), strips: +(10 * strips / N).toFixed(2), blocks: +(10 * blocks / N).toFixed(2), other: +(10 * others / N).toFixed(2), reachesPerPoss: +(reaches / N).toFixed(2), stripLandsGivenRead: stripReads ? +(stripLands / stripReads).toFixed(3) : null, pBlockPerShot: +pBlock.toFixed(3) };
}
if (process.argv.includes('--stops')) {
  const N = Number(arg('--n', '4000'));
  resetAllFeelOverrides(); seed = 7;
  console.log('STOPS before (dice, gate 0.5, jump 0.3, rig tell rate 2/63.3 s):', JSON.stringify((() => { setFeelOverride('hoops.aiReachGate', 0.5); setFeelOverride('hoops.aiBlockJumpChance', 0.3); return stops(N, true, 2 / 63.3); })()));
  for (const cfg of JSON.parse(process.env.CONFIGS ?? '[{}]') as Record<string, number>[]) {
    resetAllFeelOverrides(); seed = 7; for (const [k, v] of Object.entries(cfg)) { if (setFeelOverride(k, Number(v)) === null) throw new Error('not a knob: ' + k); }
    console.log('STOPS after', JSON.stringify(cfg), '(geometry, rig tell rate 4/59.4 s at gate 0.5):', JSON.stringify(stops(N, false, 4 / 59.4)));
  }
  process.exit(0);
}
const CONFIGS: Record<string, number>[] = JSON.parse(process.env.CONFIGS ?? '[{}]');
for (const cfg of CONFIGS) {
  resetAllFeelOverrides(); for (const [k, v] of Object.entries(cfg)) { if (setFeelOverride(k, Number(v)) === null) throw new Error('not a knob: ' + k); }
  seed = 7;
  const H = Number(process.env.RAW_H ?? 1.75);   // the drawn ball's height at the release (the rig: 1.65–2.25 m)
  const late = { j1: myBlock(H, 0.32, 'jumper', '1v1'), l1: myBlock(H, 0.32, 'layup', '1v1'), j3: myBlock(H, 0.35, 'jumper', '3v3'), l3: myBlock(H, 0.35, 'layup', '3v3') };
  const onGather = { j3: myBlock(H, 0.35, 'jumper', '3v3', 0.02), l3: myBlock(H, 0.35, 'layup', '3v3', 0.02) };
  const early = { l3: myBlock(H, 0.35, 'layup', '3v3', -0.45) };
  console.log(JSON.stringify(cfg), '\n  my block, bot 220 ms late:', JSON.stringify(late), '\n  my block, jump ON the gather:', JSON.stringify(onGather), ' 0.8 s early:', JSON.stringify(early),
    '\n  AI block on me: jumper', JSON.stringify(aiBlock(Number(process.env.MY_H ?? 2.1), 'jumper')), 'layup', JSON.stringify(aiBlock(Number(process.env.MY_H ?? 2.1), 'layup')));
}
