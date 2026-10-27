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
const { setFeelUser, setFeelSession, setFeelOverride } = await import(APP + '/lib/feel-panel/feel.ts');
const { meetsRelease, aiBlockJumpAtSec, JUMP_SEC } = await import(APP + '/lib/babylon/hoops/blocks.ts');
type Blocker = { x: number; z: number; jumpAge: number; handsUp: boolean };
const { aiBlockChance, aiShotRead } = await import(APP + '/lib/babylon/core/HoopsDefense.ts');
const { checkBlock } = await import(APP + '/lib/babylon/core/BasketballCore.ts');
const { Vector3 } = await import('@babylonjs/core');

if (process.env.FEEL) { setFeelUser(true); setFeelSession(null); for (const [k, v] of Object.entries(JSON.parse(process.env.FEEL))) setFeelOverride(k, Number(v)); }
const arg = (k: string, d: string) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const N = Number(arg('--n', '4000'));
let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const gauss = () => { let u = 0, v = 0; while (u === 0) u = rnd(); while (v === 0) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const RIM = { x: 0, y: 3.05, z: -0.6 };
const pct = (a: number, n: number) => `${(100 * a / Math.max(1, n)).toFixed(1)} %`;

// A — MY BLOCK on their release, the rig's scripted defender: 1.0 m in front of the driver toward the rim (the body standoff holds him
// ~1.1 m), jumps 220 ms + a frame after the gather shows; the gather lasts 0.32 s (1v1) / 0.35 s (3v3).
function myBlock(H: number, gatherSec: number, style: 'jumper' | 'layup', mode: '1v1' | '3v3') {
  let old = 0, geo = 0;
  for (let i = 0; i < N; i++) {
    const shooter = { x: (rnd() - 0.5) * 6, z: 2 + rnd() * 4.5 };
    const toRim = { x: RIM.x - shooter.x, z: RIM.z - shooter.z }; const L = Math.hypot(toRim.x, toRim.z); const u = { x: toRim.x / L, z: toRim.z / L };
    const d = Math.max(0.9, 1.15 + gauss() * 0.2), lat = gauss() * 0.3;
    const def = { x: shooter.x + u.x * d - u.z * lat, z: shooter.z + u.z * d + u.x * lat };
    const jumpAge = gatherSec - 0.22 - 1 / 60 + gauss() * 0.02;
    const ball = { x: shooter.x + u.x * 0.3, y: H + gauss() * 0.08, z: shooter.z + u.z * 0.3 };
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
    const d = 0.9 + rnd() * 2.0, ang = (rnd() - 0.5) * 1.2;   // where he stands at my release (from the rim side, ± 35°)
    const toRim = { x: RIM.x - me.x, z: RIM.z - me.z }; const L = Math.hypot(toRim.x, toRim.z); const u = { x: toRim.x / L, z: toRim.z / L };
    const c = Math.cos(ang), s = Math.sin(ang); const dir = { x: u.x * c - u.z * s, z: u.z * c + u.x * s };
    const foe = { x: me.x + dir.x * d, z: me.z + dir.z * d };
    const read = aiShotRead(d, 0.9, true, rnd);
    if (read !== 'none' && read !== 'pending') reads++;
    const green = 0.55, release = green + gauss() * 0.05;
    let jumpAge = Infinity;
    if (read === 'block') { const at = aiBlockJumpAtSec(green, 0.22); jumpAge = release - at; if (jumpAge >= JUMP_SEC) jumpAge = Infinity; }
    const handUp = read === 'handUp';
    const up = handUp || (jumpAge <= 0.7);
    old += aiBlockChance(style, d, up, rnd() < 0.6);
    const ball = { x: me.x + u.x * 0.3, y: H + gauss() * 0.08, z: me.z + u.z * 0.3 };
    if (meetsRelease({ x: foe.x, z: foe.z, jumpAge, handsUp: handUp }, ball, RIM, style).hit) geo++;
  }
  return { old: pct(old, N), geo: pct(geo, N), reads: pct(reads, N) };
}

if (process.argv.includes('--json')) {
  console.log('(rig-snapshot mode: see analyze-defense.mjs)');
} else {
  console.log(`N ${N} per cell${process.env.FEEL ? ' FEEL ' + process.env.FEEL : ''}`);
  for (const H of [2.2, 2.4, 2.6, 2.8, 3.0]) {
    console.log(`H ${H.toFixed(1)} | my block (scripted D) 1v1 jumper ${JSON.stringify(myBlock(H, 0.32, 'jumper', '1v1'))} layup ${JSON.stringify(myBlock(H, 0.32, 'layup', '1v1'))} 3v3 jumper ${JSON.stringify(myBlock(H, 0.35, 'jumper', '3v3'))}`
      + ` | AI block on me jumper ${JSON.stringify(aiBlock(H, 'jumper'))} layup ${JSON.stringify(aiBlock(H, 'layup'))}`);
  }
}
