// hoops-p06 (1v1 / 3v3 phase 6 "flow and pace"): the BOARD RACE, headless — the offensive-board share before (the release's dice:
// 1v1 REBOUND_JITTER 2.6, 3v3 BOARD_JITTER 2.6, read as an expectation over the die) and after (hoops/rebound boardPick: the bounce spot,
// the seal, the jump), on the SAME sampled situations, with and without a box-out.
//   npx tsx scripts/probes/hoops-p06/board-sim.mts [--n 4000] [--seed 7]
// The situations (assumption: the rig does not reach enough of them to read this off play):
//   swat   — a block at the release / a swat at the rim: the shooter 1–6.5 m out (±70° of the lane), the blocker 0.9–1.5 m from him on
//            his line to the rim, jumped 0–0.3 s ago; the ball off the blocker's hand (hoops/blocks deflect) from 2.3–3.0 m, flown 0.9 s
//            (the modes' `later(900, boardRace)`), bodies standing where they were (they drift toward it in play: not modelled)
//   stall  — the live board's stall guard: the ball settled 1–5 m from the rim, every body 0.8–4 m from it
//   3v3    — the same two, six bodies: the shooter's two mates and the other team's three placed round the rim 1.5–5 m out
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const { boardPick, bounceSpot } = await import(APP + '/lib/babylon/hoops/rebound.ts');
const { deflect } = await import(APP + '/lib/babylon/hoops/blocks.ts');
const { HAND_UP_SEC } = await import(APP + '/lib/babylon/core/BasketballCore.ts');
const arg = (k: string, d: string) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const N = Number(arg('--n', '4000')); const SEED = Number(arg('--seed', '7'));
const mkRng = (seed: number) => { let s = seed >>> 0; return () => { s += 0x6D2B79F5; let r = Math.imul(s ^ (s >>> 15), 1 | s); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; };
const rng = mkRng(SEED);
const RIM = { x: 0, z: -0.6 }; const EDGE = 1.6; const JIT = 2.6;
type XZ = { x: number; z: number };
const around = (c: XZ, r0: number, r1: number, a0 = -Math.PI, a1 = Math.PI): XZ => { const r = r0 + (r1 - r0) * rng(), a = a0 + (a1 - a0) * rng(); return { x: c.x + Math.sin(a) * r, z: c.z + Math.cos(a) * r }; };
const fly = (p: { x: number; y: number; z: number }, v: { x: number; y: number; z: number }, sec: number) => {
  let { x, y, z } = p; let vx = v.x, vy = v.y, vz = v.z; const dt = 1 / 60;
  for (let t = 0; t < sec; t += dt) { vy -= 9.81 * dt; x += vx * dt; y += vy * dt; z += vz * dt; if (y < 0.12 && vy < 0) { y = 0.12; vy = -vy * 0.62; vx *= 0.85; vz *= 0.85; if (Math.abs(vy) < 0.4) vy = 0; } }
  return { pos: { x, y, z }, vel: { x: vx, y: vy, z: vz } };
};
interface Sit { bodies: { team: 'me' | 'foe'; pos: XZ; boxing: boolean; jumpAge: number }[]; ball: { x: number; y: number; z: number }; vel: { x: number; y: number; z: number }; shooter: 'me' | 'foe' }
function swat(three: boolean, shooter: 'me' | 'foe', box: boolean): Sit {
  const s = around(RIM, 1, 6.5, -1.2, 1.2);
  const dx = RIM.x - s.x, dz = RIM.z - s.z, L = Math.hypot(dx, dz) || 1;
  const bd = 0.9 + 0.6 * rng(); const b = { x: s.x + dx / L * bd + (rng() - 0.5) * 0.4, z: s.z + dz / L * bd + (rng() - 0.5) * 0.4 };
  const jump = 0.3 * rng();
  const at = { x: s.x + dx / L * 0.4, y: 2.3 + 0.7 * rng(), z: s.z + dz / L * 0.4 };
  const v = deflect({ x: b.x, z: b.z, jumpAge: jump, handsUp: true } as never, at);
  const f = fly(at, v, 0.9);
  const other = shooter === 'me' ? 'foe' : 'me';
  const bodies: Sit['bodies'] = [{ team: shooter, pos: s, boxing: false, jumpAge: Infinity }, { team: other, pos: b, boxing: false, jumpAge: jump + 0.9 }];
  if (three) for (let i = 0; i < 2; i++) { bodies.push({ team: shooter, pos: around(RIM, 1.5, 5, -1.4, 1.4), boxing: false, jumpAge: Infinity }); bodies.push({ team: other, pos: around(RIM, 1.5, 5, -1.4, 1.4), boxing: false, jumpAge: Infinity }); }
  for (const x of bodies) if (x.team === 'me') x.boxing = box && x === bodies.find((y) => y.team === 'me');   // the box-out is the hero's (BRACE)
  return { bodies, ball: f.pos, vel: f.vel, shooter };
}
function stall(three: boolean, shooter: 'me' | 'foe', box: boolean): Sit {
  const ball = around(RIM, 1, 5, -1.4, 1.4);
  const bodies: Sit['bodies'] = [];
  for (const t of ['me', 'foe'] as const) for (let i = 0; i < (three ? 3 : 1); i++) bodies.push({ team: t, pos: around(ball, 0.8, 4), boxing: false, jumpAge: Infinity });
  bodies[0].boxing = box;
  return { bodies, ball: { x: ball.x, y: 0.12, z: ball.z }, vel: { x: 0, y: 0, z: 0 }, shooter };
}
// before: 1v1 = edge (foeD − meD) + box + U·2.6 (3D distance to the ball's spot NOW) — P(me) is exact; 3v3 = every body's planar distance −
// seal + U·2.6, min wins — P read over 400 draws of the die
function before(s: Sit, three: boolean): number {
  if (!three) {
    const d3 = (p: XZ) => Math.hypot(p.x - s.ball.x, s.ball.y, p.z - s.ball.z);
    const me = s.bodies.find((b) => b.team === 'me')!, foe = s.bodies.find((b) => b.team === 'foe')!;
    const x = d3(foe.pos) - d3(me.pos) + (me.boxing ? EDGE : 0);
    const pMe = Math.max(0, Math.min(1, (x + JIT / 2) / JIT));
    return s.shooter === 'me' ? pMe : 1 - pMe;
  }
  let off = 0; const K = 400;
  for (let k = 0; k < K; k++) { let best: { t: string; v: number } | null = null; for (const b of s.bodies) { const v = Math.hypot(b.pos.x - s.ball.x, b.pos.z - s.ball.z) - (b.boxing ? EDGE : 0) + (rng() - 0.5) * JIT; if (!best || v < best.v) best = { t: b.team, v }; } if (best!.t === s.shooter) off++; }
  return off / K;
}
function after(s: Sit): number {
  const p = boardPick(s.bodies, s.ball, s.vel, { boxEdge: EDGE, jumpWindowSec: HAND_UP_SEC, shooter: s.shooter });
  return p.team === s.shooter ? 1 : 0;
}
const rows: string[] = [];
for (const three of [false, true]) for (const kind of ['swat', 'stall'] as const) for (const shooter of ['me', 'foe'] as const) for (const box of [false, true]) {
  let b = 0, a = 0;
  for (let i = 0; i < N; i++) { const s = kind === 'swat' ? swat(three, shooter, box) : stall(three, shooter, box); b += before(s, three); a += after(s); }
  const pb = 100 * b / N, pa = 100 * a / N;
  rows.push(`${three ? '3v3' : '1v1'} ${kind.padEnd(5)} shooter ${shooter.padEnd(3)} box-out ${box ? 'on ' : 'off'} | offensive board ${pb.toFixed(1)} % → ${pa.toFixed(1)} % (Δ ${(pa - pb >= 0 ? '+' : '') + (pa - pb).toFixed(1)})`);
}
console.log(rows.join('\n'));
void bounceSpot;
