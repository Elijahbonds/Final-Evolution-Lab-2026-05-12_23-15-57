#!/usr/bin/env -S npx tsx
/**
 * scripts/physics-arena-tests.ts — the Physics Arena's physics, proven headless on the real Havok WASM (lane/physics-arena,
 * owner 2026-11-23: "a live physics play arena for the sport modes"; docs/PHYSICS-ARENA-PLAN.md §5).
 *
 *   A. The ball bounces like a basketball: dropped from 1.80 m (its bottom), its top comes back to 1.20–1.40 m (the rule book's
 *      inflation test).
 *   B. Same inputs, same world: ten shots in two fresh worlds end bit-for-bit the same (the fixed step; what online mirroring needs).
 *   C. The release decides, through the physics: a GOOD release (within 25 ms of the top of the jump) makes clearly more than a
 *      BAD one (100–160 ms early or late), over 20 spots (2.5–7 m, corner to corner), three seeds.
 *   D. The basket is the ball through the hoop: the scoreboard's sensor, read at 60 Hz as the mode reads it, agrees with an
 *      independent label taken from the whole path at the physics step.
 *   E. Nothing tunnels: fast balls at the glass, the iron, the floor and a body never pass through (the swept path is checked
 *      between steps, not just at them).
 *   F. The live mode's own loop (PhysicsArenaMode on a NullEngine scene, no characters): three minutes of the rival against a
 *      player who shoots at the top of his jump. The check passes go and come, both sides shoot, the score moves, the ball never
 *      leaves the world, nothing throws.
 *   H. Phase 4, dunks at the rim: a run at the ring that leaves from 1.75 m and jams the ball once it is over the ring goes through
 *      far more often than the same run let go 0.2 s after the press (the ball still under the ring: the push meets the iron).
 *   G. Phase 3, the three-point contest: from the five racks (7.05–7.15 m) a good release still makes clearly more than a bad one,
 *      and the contest mode's own loop runs a whole contest headless (25 balls, the clock, the final).
 *
 * Run: npx tsx scripts/physics-arena-tests.ts
 */

import { makeWorld, runShot, spots } from './probes/physics-arena/harness';
import { seeded } from '../lib/babylon/arena/shotModel';
import { BALL_R, RIM_TUBE_R, ARENA_RIM, ARENA_RIM_RADIUS, boardBox, type P3 } from '../lib/babylon/arena/hoopGeometry';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, extra = '') => {
  c ? pass++ : fail++;
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}${c ? '' : ' ' + extra}`);
};

async function main() {
  const { B, world, dispose } = await makeWorld();
  const h = 1 / 120;

  console.log('\nA. the bounce');
  world.ball.teleport({ x: 3, y: 1.8 + BALL_R, z: 6 });
  let peak = 0, bounced = false, lastY = world.ball.pos.y;
  for (let i = 0; i < 240; i++) {
    world.step(h);
    const y = world.ball.pos.y;
    if (!bounced && y > lastY && y < 0.5) bounced = true;
    if (bounced) { if (y > peak) peak = y; if (y < peak - 0.05) break; }
    lastY = y;
  }
  const top = peak + BALL_R;
  ok(`a 1.80 m drop comes back to ${top.toFixed(2)} m (rule book 1.20–1.40)`, top >= 1.2 && top <= 1.4);

  console.log('\nB. determinism');
  const runTen = async () => {
    const w2 = await makeWorld();
    const rng = seeded(77);
    const out: string[] = [];
    for (const feet of spots().slice(0, 10)) {
      const r = runShot(w2.world, { feet, offsetSec: (rng.next() - 0.5) * 0.2 }, rng.normal, 2);
      const p = r.path[r.path.length - 1];
      out.push(`${r.made}:${p.x}:${p.y}:${p.z}`);
    }
    w2.dispose();
    return out.join('|');
  };
  const d1 = await runTen(), d2 = await runTen();
  ok('ten shots in two fresh worlds end bit-for-bit the same', d1 === d2);

  console.log('\nC. the release decides (through the physics)');
  let gAll = 0, bAll = 0, nAll = 0, agree = 0, agreeStep = 0, total = 0;
  const perSeed: string[] = [];
  for (const seed of [1, 2, 3]) {
    const rng = seeded(1000 + seed);
    let g = 0, b = 0, n = 0;
    for (const feet of spots()) {
      const good = (rng.next() * 2 - 1) * 0.025;
      const bad = (rng.next() < 0.5 ? -1 : 1) * (0.1 + rng.next() * 0.06);
      const rg = runShot(world, { feet, offsetSec: good }, rng.normal, 2.2);
      const rb = runShot(world, { feet, offsetSec: bad }, rng.normal, 2.2);
      g += +rg.made; b += +rb.made; n++;
      for (const r of [rg, rb]) { total++; if (r.frameSensorMade === r.label) agree++; if (r.made === r.label) agreeStep++; }
    }
    perSeed.push(`seed ${seed}: good ${g}/${n}, bad ${b}/${n}`);
    gAll += g; bAll += b; nAll += n;
  }
  for (const l of perSeed) console.log(`     ${l}`);
  const gp = (100 * gAll) / nAll, bp = (100 * bAll) / nAll;
  ok(`a good release makes ${gp.toFixed(0)}% (≥ 55%)`, gp >= 55);
  ok(`a bad release makes ${bp.toFixed(0)}% (≤ 25%)`, bp <= 25);
  ok(`the gap is ${(gp - bp).toFixed(0)} points (≥ 40)`, gp - bp >= 40);

  console.log('\nD. the basket is the ball through the hoop');
  ok(`the 60 Hz sensor agrees with the path label on ${agree}/${total} shots (≥ 98%)`, agree / total >= 0.98);
  ok(`the per-step sensor agrees on ${agreeStep}/${total} (≥ 98%)`, agreeStep / total >= 0.98);

  console.log('\nE. nothing tunnels');
  const rng = seeded(4242);
  const seg = (a: P3, b: P3, k: number): P3 => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k });
  const fly = (from: P3, vel: P3, steps: number, each: (a: P3, b: P3) => void) => {
    world.ball.teleport(from);
    world.ball.launch(vel);
    let prev = { ...from };
    for (let i = 0; i < steps; i++) {
      world.step(h);
      const now = { x: world.ball.pos.x, y: world.ball.pos.y, z: world.ball.pos.z };
      each(prev, now);
      prev = now;
    }
  };
  // the glass: thrown at it from in front, never found behind its back face inside its outline
  const bb = boardBox();
  const back = bb.centre.z - bb.half.z;
  let behind = 0, glassMax = 0;
  for (let i = 0; i < 60; i++) {
    const speed = 6 + rng.next() * 24;
    glassMax = Math.max(glassMax, speed);
    const target = { x: (rng.next() - 0.5) * bb.half.x * 1.6, y: bb.centre.y + (rng.next() - 0.5) * bb.half.y * 1.6, z: bb.centre.z };
    const from = { x: target.x + (rng.next() - 0.5) * 3, y: target.y + (rng.next() - 0.5) * 1.5, z: target.z + 2.5 };
    const d = Math.hypot(target.x - from.x, target.y - from.y, target.z - from.z);
    const vel = { x: ((target.x - from.x) / d) * speed, y: ((target.y - from.y) / d) * speed, z: ((target.z - from.z) / d) * speed };
    let hit = false;
    fly(from, vel, 60, (a, b) => {
      for (let k = 0; k <= 8; k++) {
        const p = seg(a, b, k / 8);
        if (p.z < back - 0.001 && Math.abs(p.x - bb.centre.x) < bb.half.x - BALL_R && Math.abs(p.y - bb.centre.y) < bb.half.y - BALL_R) hit = true;
      }
    });
    if (hit) behind++;
  }
  ok(`60 throws at the glass up to ${glassMax.toFixed(0)} m/s: ${behind} went through`, behind === 0);
  // the iron: thrown at points on the ring, the swept centre never comes inside the iron's reach by more than 3 cm
  const ringR = ARENA_RIM_RADIUS + RIM_TUBE_R;
  const toIron = (p: P3) => {
    const rx = p.x - ARENA_RIM.x, rz = p.z - ARENA_RIM.z, rr = Math.hypot(rx, rz);
    return Math.hypot(rr - ringR, p.y - ARENA_RIM.y);
  };
  let worstPen = 0, ironMax = 0;
  for (let i = 0; i < 80; i++) {
    const speed = 6 + rng.next() * 19;
    ironMax = Math.max(ironMax, speed);
    const a = rng.next() * Math.PI * 2;
    const target = { x: ARENA_RIM.x + Math.cos(a) * ringR, y: ARENA_RIM.y, z: ARENA_RIM.z + Math.sin(a) * ringR };
    const dir = { x: rng.next() - 0.5, y: rng.next() * 0.8 + 0.1, z: rng.next() - 0.5 };
    const dl = Math.hypot(dir.x, dir.y, dir.z);
    const from = { x: target.x + (dir.x / dl) * 1.5, y: target.y + (dir.y / dl) * 1.5, z: target.z + (dir.z / dl) * 1.5 };
    const vel = { x: (-dir.x / dl) * speed, y: (-dir.y / dl) * speed, z: (-dir.z / dl) * speed };
    fly(from, vel, 50, (p0, p1) => {
      for (let k = 0; k <= 8; k++) worstPen = Math.max(worstPen, BALL_R + RIM_TUBE_R - toIron(seg(p0, p1, k / 8)));
    });
  }
  ok(`80 throws at the iron up to ${ironMax.toFixed(0)} m/s: deepest overlap ${(worstPen * 100).toFixed(1)} cm (≤ 3 cm)`, worstPen <= 0.03);
  // the floor: slammed down at 30 m/s
  let lowest = Infinity;
  fly({ x: 2, y: 3, z: 5 }, { x: 1, y: -30, z: 0.5 }, 60, (_a, b) => { lowest = Math.min(lowest, b.y); });
  ok(`a 30 m/s slam never sinks into the floor (lowest centre ${lowest.toFixed(3)} m, radius ${BALL_R})`, lowest >= BALL_R - 0.02);
  // a body: a capsule stood at (4, 0, 8), the ball fired at its chest at 25 m/s from 2 m away
  const node = new B.TransformNode('test_body', world.scene);
  node.position.set(4, 0, 8);
  const pl = world.addPlayer('test', node);
  for (let i = 0; i < 4; i++) world.step(h);
  let bodyWorst = 0;
  fly({ x: 4, y: 1.3, z: 10 }, { x: 0, y: 0, z: -25 }, 40, (a, b) => {
    for (let k = 0; k <= 8; k++) {
      const p = seg(a, b, k / 8);
      const ax = pl.pos.x, az = pl.pos.z;
      const yClamp = Math.min(pl.pos.y + pl.height - pl.radius, Math.max(pl.pos.y + pl.radius, p.y));
      const dist = Math.hypot(p.x - ax, p.y - yClamp, p.z - az);
      bodyWorst = Math.max(bodyWorst, pl.radius + BALL_R - dist);
    }
  });
  ok(`a 25 m/s ball at a body's chest: deepest overlap ${(bodyWorst * 100).toFixed(1)} cm (≤ 3 cm)`, bodyWorst <= 0.03);
  ok(`…and it came back off the body (ball z ${world.ball.pos.z.toFixed(2)} > body z ${pl.pos.z.toFixed(2)})`, world.ball.pos.z > pl.pos.z);

  dispose();

  console.log('\nF. the live mode, headless');
  await liveLoop(B);

  console.log('\nG. the three-point contest');
  await threePoint(B);

  console.log('\nH. dunks: the iron decides');
  await dunks(B);

  console.log(`\nphysics-arena: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

/** The mode's own load / onInput / update on a NullEngine scene, with a camera director stub (the follow camera is not under test). */
async function liveLoop(B: typeof import('@babylonjs/core')) {
  process.on('unhandledRejection', () => { /* the character and ball-skin loads fail in node (no fetch): the mode plays without them */ });
  // the court's painted floor is a DynamicTexture: node has no canvas, so a 2-D context that accepts every call and draws nothing
  const g = globalThis as unknown as { OffscreenCanvas?: unknown };
  if (!g.OffscreenCanvas) {
    const ctx2d = () => new Proxy({} as Record<string | symbol, unknown>, { get: (t, k) => (k in t ? t[k] : () => ({})), set: (t, k, v) => { t[k] = v; return true; } });
    g.OffscreenCanvas = class { width: number; height: number; constructor(w: number, h: number) { this.width = w; this.height = h; } getContext() { return ctx2d(); } };
  }
  const { PhysicsArenaMode, arenaStats } = await import('../lib/babylon/modes/PhysicsArenaMode');
  const engine = new B.NullEngine();
  engine.getDeltaTime = () => 1000 / 60;
  const scene = new B.Scene(engine);
  const camera = new B.UniversalCamera('cam', new B.Vector3(0, 3, 12), scene);
  const hud: Record<string, unknown> = {};
  const phases = new Set<string>(); const scores = new Set<string>(); const banners = new Set<string>();
  const dir = {
    mode: 'follow', suspended: false,
    stickWorldLatched: (x: number, y: number) => new B.Vector3(x, 0, -y),
    look: () => {}, update: () => {}, snapTo: () => {}, forwardFlatToRef: (o: InstanceType<typeof B.Vector3>) => o.set(0, 0, -1),
  };
  const ctx = {
    scene, camera, camDirector: dir, heroRef: { current: null }, objectiveRef: { current: null },
    setHud: (u: Record<string, unknown>) => { Object.assign(hud, u); if (u.arenaPhase) phases.add(String(u.arenaPhase)); if (u.arenaScore) scores.add(String(u.arenaScore)); if (u.arenaBanner) banners.add(String(u.arenaBanner)); },
  } as never;
  let threw: unknown = null;
  let worstY = Infinity, nan = false;
  try {
    await PhysicsArenaMode.load(ctx);
    PhysicsArenaMode.onPlay?.(ctx);
    const ball = scene.getMeshByName('ball')!;
    let xDownAt = -1;
    for (let f = 0; f < 60 * 180; f++) {
      const t = f / 60;
      // me: with the ball and live, shoot about 1 s after the catch, letting go about at the top of the jump (0.47 s after the press)
      const meAt = scene.getTransformNodeByName('arena_me_body')!.position;
      const fromRim = Math.hypot(meAt.x, meAt.z + 0.6);
      if (hud.arenaPoss === 'me' && hud.arenaPhase === 'live' && xDownAt < 0 && f % 90 === 0 && fromRim > 2.5) { PhysicsArenaMode.onInput(ctx, { t: 'button', btn: 'X', pressed: true }); xDownAt = t; }
      if (xDownAt >= 0 && t - xDownAt > 0.46) { PhysicsArenaMode.onInput(ctx, { t: 'button', btn: 'X', pressed: false }); xDownAt = -1; }
      // off the ball: go to it (a loose ball, his dribble), reach for it now and then
      const meNode = scene.getTransformNodeByName('arena_me_body')!;
      if (hud.arenaPhase === 'live' && xDownAt < 0 && f % 6 === 0) {
        // on his ball: sag 1.5 m off him toward the ring (a fair defender, no reaching); otherwise go to the ball
        const foeAt = scene.getTransformNodeByName('arena_foe_body')!.position;
        const fr = Math.hypot(foeAt.x, foeAt.z + 0.6) || 1;
        const goal = hud.arenaPoss === 'foe' ? { x: foeAt.x - (foeAt.x / fr) * 1.5, z: foeAt.z - ((foeAt.z + 0.6) / fr) * 1.5 } : { x: ball.position.x, z: ball.position.z };
        const dx = goal.x - meNode.position.x, dz = goal.z - meNode.position.z, d = Math.hypot(dx, dz);
        const mine = hud.arenaPoss === 'me' && d < 0.9;
        // with it under the ring: dribble out to the elbow first (nobody shoots from under the iron)
        const out = mine && fromRim < 3.2 ? { x: meAt.x / (fromRim || 1), z: (meAt.z + 0.6) / (fromRim || 1) } : null;
        const sx = out ? out.x : mine || d < 0.3 ? 0 : dx / d, sz = out ? out.z : mine || d < 0.3 ? 0 : dz / d;
        PhysicsArenaMode.onInput(ctx, { t: 'stick', side: 'L', x: sx, y: -sz });

      }
      // on his ball: B passes the check
      if (hud.arenaPoss === 'foe' && hud.arenaPhase === 'check' && f % 60 === 0) PhysicsArenaMode.onInput(ctx, { t: 'button', btn: 'B', pressed: true });
      PhysicsArenaMode.update(ctx, 1 / 60);
      const p = ball.position;
      if (!Number.isFinite(p.x + p.y + p.z)) nan = true;
      worstY = Math.min(worstY, p.y);
    }
  } catch (e) { threw = e; console.error(e); }
  ok(`three minutes ran without a throw`, threw === null);
  ok(`the ball stayed a number and above the floor (lowest centre ${worstY.toFixed(3)} m)`, !nan && worstY >= BALL_R - 0.03);
  ok(`the game went check → live → scored (${[...phases].join(', ')})`, phases.has('check') && phases.has('live') && phases.has('scored'));
  const finals = [...scores];
  console.log(`     scores seen: ${finals.join(' ')}`);
  const both = finals.some((x) => /^[1-9]/.test(x)) && finals.some((x) => /–[1-9]/.test(x));
  ok(`both sides scored through the hoop`, both);
  console.log(`     calls: ${[...banners].slice(0, 14).join(' | ')}`);
  const st = arenaStats(scene);
  if (st) console.log(`     shots me ${st.makes.me}/${st.shots.me}, rival ${st.makes.foe}/${st.shots.foe}; lost handles ${st.lostHandles}; steals ${st.steals}; physics ${(st.physMsSum / Math.max(1, st.frames)).toFixed(2)} ms a frame (node, max ${st.physMsMax.toFixed(1)})`);
  ok('the rival shoots and makes some, and misses some (the physics decides, not a script)', !!st && st.shots.foe > 4 && st.makes.foe > 0 && st.makes.foe < st.shots.foe);
  scene.dispose(); engine.dispose();
}

async function dunks(B: typeof import('@babylonjs/core')) {
  const { PhysicsArenaMode, arenaSeam, arenaStats } = await import('../lib/babylon/modes/PhysicsArenaMode');
  const engine = new B.NullEngine();
  engine.getDeltaTime = () => 1000 / 60;
  const scene = new B.Scene(engine);
  const camera = new B.UniversalCamera('camd', new B.Vector3(0, 3, 12), scene);
  const dir = { mode: 'follow', suspended: false, stickWorldLatched: (x: number, y: number) => new B.Vector3(x, 0, -y), look: () => {}, update: () => {}, snapTo: () => {} };
  const ctx = { scene, camera, camDirector: dir, heroRef: { current: null }, objectiveRef: { current: null }, setHud: () => {} } as never;
  await PhysicsArenaMode.load(ctx);
  const seam = arenaSeam(scene) as unknown as { place: (x: number, z: number) => void; quiet: (on: boolean) => void };
  seam.quiet(true);
  const me = scene.getTransformNodeByName('arena_me_body')!;
  const run = (deg: number, leaveAt: number, letGoAfter = -1): boolean => {
    const a = (deg * Math.PI) / 180, start = 5.5;
    seam.place(Math.sin(a) * start, -0.6 + Math.cos(a) * start);
    const before = arenaStats(scene)!.makes.me;
    for (let f = 0; f < 30; f++) PhysicsArenaMode.update(ctx, 1 / 60);   // the catch and the first push
    PhysicsArenaMode.onInput(ctx, { t: 'button', btn: 'R1', pressed: true });
    let pressed = false, pressedAt = 0;
    for (let f = 0; f < 60 * 4; f++) {
      const dx = -me.position.x, dz = -0.6 - me.position.z, d = Math.hypot(dx, dz);
      if (d > 0.25) PhysicsArenaMode.onInput(ctx, { t: 'stick', side: 'L', x: dx / d, y: -dz / d });   // the stick stays on the ring (a player runs through the dunk)
      else PhysicsArenaMode.onInput(ctx, { t: 'stick', side: 'L', x: 0, y: 0 });
      if (!pressed && d < leaveAt) { PhysicsArenaMode.onInput(ctx, { t: 'button', btn: 'X', pressed: true }); pressed = true; }
      if (pressed && letGoAfter >= 0 && (pressedAt += 1 / 60) > letGoAfter) { PhysicsArenaMode.onInput(ctx, { t: 'button', btn: 'X', pressed: false }); letGoAfter = -1; }
      PhysicsArenaMode.update(ctx, 1 / 60);
    }
    PhysicsArenaMode.onInput(ctx, { t: 'button', btn: 'X', pressed: false });
    PhysicsArenaMode.onInput(ctx, { t: 'button', btn: 'R1', pressed: false });
    for (let f = 0; f < 60; f++) PhysicsArenaMode.update(ctx, 1 / 60);
    return arenaStats(scene)!.makes.me > before;
  };
  let good = 0, bad = 0, n = 0; const row: string[] = [];
  for (const deg of [-50, -25, -10, 0, 10, 25, 50]) {
    const gd = run(deg, 1.75), bd = run(deg, 1.75, 0.2);
    good += +gd; bad += +bd; n++; row.push(`${deg}°:${gd ? 'Y' : 'n'}${bd ? 'Y' : 'n'}`);
  }
  console.log(`     jammed at the top: ${good}/${n}; let go 0.2 s after the press (ball still under the ring): ${bad}/${n}  [${row.join(' ')}]`);
  ok(`a dunk jammed over the ring goes through (${good}/${n} ≥ 5) and one let go under it mostly does not (${bad}/${n} ≤ 2)`, good >= 5 && bad <= 2);
  scene.dispose(); engine.dispose();
}

async function threePoint(B: typeof import('@babylonjs/core')) {
  const { rackSpot, RACKS, PhysicsArena3ptMode, arena3Stats } = await import('../lib/babylon/modes/PhysicsArena3ptMode');
  const w = await makeWorld();
  let g = 0, b = 0, n = 0;
  for (const seed of [11, 12, 13]) {
    const rng = seeded(seed);
    for (let i = 0; i < RACKS.length; i++) for (let k = 0; k < 4; k++) {
      const feet = rackSpot(i);
      g += +runShot(w.world, { feet, offsetSec: (rng.next() * 2 - 1) * 0.025 }, rng.normal, 2.2).made;
      b += +runShot(w.world, { feet, offsetSec: (rng.next() < 0.5 ? -1 : 1) * (0.1 + rng.next() * 0.06) }, rng.normal, 2.2).made;
      n++;
    }
  }
  w.dispose();
  const gp = (100 * g) / n, bp = (100 * b) / n;
  ok(`from the racks a good release makes ${g}/${n} = ${gp.toFixed(0)}% (≥ 50%), a bad one ${b}/${n} = ${bp.toFixed(0)}% (≤ 20%)`, gp >= 50 && bp <= 20);
  // the mode's own loop: a whole contest, each ball let go at the top of the jump
  const engine = new B.NullEngine();
  engine.getDeltaTime = () => 1000 / 60;
  const scene = new B.Scene(engine);
  const camera = new B.UniversalCamera('cam3', new B.Vector3(0, 3, 12), scene);
  const hud: Record<string, unknown> = {};
  const dir = { mode: 'follow', suspended: false, look: () => {}, update: () => {}, snapTo: () => {} };
  const ctx = { scene, camera, camDirector: dir, heroRef: { current: null }, objectiveRef: { current: null }, setHud: (u: Record<string, unknown>) => Object.assign(hud, u) } as never;
  let threw: unknown = null, finished = false, downAt = -1;
  try {
    await PhysicsArena3ptMode.load(ctx);
    for (let f = 0; f < 60 * 75 && !finished; f++) {
      const t = f / 60;
      if (downAt < 0 && f % 45 === 0) { PhysicsArena3ptMode.onInput(ctx, { t: 'button', btn: 'X', pressed: true }); downAt = t; }
      if (downAt >= 0 && t - downAt > 0.46) { PhysicsArena3ptMode.onInput(ctx, { t: 'button', btn: 'X', pressed: false }); downAt = -1; }
      PhysicsArena3ptMode.update(ctx, 1 / 60);
      if (arena3Stats(scene)?.done) finished = true;
    }
  } catch (e) { threw = e; console.error(e); }
  const st = arena3Stats(scene);
  console.log(`     contest: ${st?.score} points, ${st?.makes} of ${st?.shots}`);
  ok('a whole contest ran without a throw and finished', threw === null && finished);
  ok('all 25 balls were shot, and some went in (scored by the ball through the hoop)', !!st && st.shots === 25 && st.makes > 0 && st.makes < 25);
  scene.dispose(); engine.dispose();
}

main().catch((e) => { console.error(e); process.exit(1); });
