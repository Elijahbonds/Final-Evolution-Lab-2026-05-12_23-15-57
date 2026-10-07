/**
 * Rail grinding (lane A1; docs/ADVENTURE-PLAN.md "rails/grind.ts").
 *
 * THE FEEL (a feel reference only): you land on a rail and you are grinding — no button. Gravity runs you down a slope
 * and slows you up one. Lean INTO a curve and you gain (+3 m/s²); lean against it and you lose (−4 m/s²) and the balance
 * needle swings toward the edge. On a straight, tuck (stick forward along the rail) for speed. Lean and jump at a switch
 * point to hop to the parallel rail; jump anywhere else to leave (and the generous catch will take the next rail you
 * come down on). Press attack for a trick that pays points (and energy, through A3/A4: RAIL_TRICK_ENERGY).
 *
 * THE CATCH is core/RailMagnet's, ported so the sim stays Babylon-free: the same four refusals in the same order (far,
 * end, above, across, still), pinned to the original by grind.test.ts. Two Adventure changes: the end band is in METRES
 * (a fraction is wrong for a 60 m rail), and a rail that chains onto another at an end catches right up to it.
 */

import type { AdventureActor, MoveInput, RailSegment, RailSwitch, Vec3 } from '../contracts';
import { FLOW } from '@/lib/babylon/core/FreeRunFlow';
import type { BodyState, StepEnv } from '../movement/body';
import { enterState } from '../movement/state';
import { pushHint } from '../movement/hints';
import { forwardOf, leanOf, type Wish } from '../movement/input';
import { yawOf } from '../movement/math';
import type { RailParams } from '../movement/params';
import {
  nearBox, nearestOnPath, railNearest, sampleRail, turnPerMetre, type RailIndex, type RailNearest, type RailPath,
} from './railMath';

/** Energy a rail trick pays (plan: "a trick for points and 4 energy"), carried on 'rail:trick' (contracts v2 `energy`); A3's stats system grants it. */
export const RAIL_TRICK_ENERGY = 4;
/** Generic trick ids (the IP line: no move names from a feel reference). [PLACEHOLDER] display names are the owner's. */
export const RAIL_TRICKS = { light: 'rail-spin', heavy: 'rail-flip' } as const;

// ── RailMagnet, ported (pure Vec3) ─────────────────────────────────────────────────────────────────────────────────

/** core/RailMagnet.RailWindow. */
export interface RailWindow { reach: number; align: number; endBand?: number; heightSlack?: number }
export type RailVerdict =
  | { ok: true; t: number; d: number }
  | { ok: false; why: 'far' | 'end' | 'above' | 'across' | 'still'; t: number; d: number };

/** core/RailMagnet.qualifyRail, term for term, on plain vectors (grind.test.ts runs both side by side). */
export function qualifyRail(a: Vec3, b: Vec3, feet: Vec3, run: Vec3, w: RailWindow): RailVerdict {
  const endBand = w.endBand ?? 0.08;
  const slack = w.heightSlack ?? 0.35;
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const l2 = Math.max(abx * abx + aby * aby + abz * abz, 1e-9);
  const t = Math.max(0, Math.min(1, ((feet.x - a.x) * abx + (feet.y - a.y) * aby + (feet.z - a.z) * abz) / l2));
  const px = a.x + abx * t, py = a.y + aby * t, pz = a.z + abz * t;
  const d = Math.hypot(px - feet.x, py - feet.y, pz - feet.z);
  if (d > w.reach) return { ok: false, why: 'far', t, d };
  if (t < endBand || t > 1 - endBand) return { ok: false, why: 'end', t, d };
  if (py > feet.y + slack) return { ok: false, why: 'above', t, d };
  const al = Math.hypot(abx, abz), rl = Math.hypot(run.x, run.z);
  if (al * al < 1e-6 || rl * rl < 1e-6) return { ok: false, why: 'still', t, d };
  if (Math.abs((abx / al) * (run.x / rl) + (abz / al) * (run.z / rl)) < w.align) return { ok: false, why: 'across', t, d };
  return { ok: true, t, d };
}

// ── The catch on a baked rail ───────────────────────────────────────────────────────────────────────────────────────

export type CatchWhy = 'ok' | 'far' | 'end' | 'above' | 'across' | 'still' | 'rising';

export interface RailCatch { path: RailPath | null; s: number; d: number; dir: 1 | -1; speed: number; point: Vec3 }
export const railCatch = (): RailCatch => ({ path: null, s: 0, d: Infinity, dir: 1, speed: 0, point: { x: 0, y: 0, z: 0 } });

const nScratch: RailNearest = railNearest();
const tScratch: Vec3 = { x: 0, y: 0, z: 0 };
const pScratch: Vec3 = { x: 0, y: 0, z: 0 };

/**
 * Would this rail catch these feet, moving this way? Fills `out` when it would. A body falling almost straight down
 * (no planar run) is read along its facing, so a drop onto a rail catches; a body standing still does not.
 */
export function qualifyRailPath(
  path: RailPath, feet: Vec3, vel: Vec3, facingYaw: number, rp: RailParams, out: RailCatch,
): CatchWhy {
  if (!nearBox(path, feet, rp.catchReach + rp.catchHeightSlack)) return 'far';
  const n = nearestOnPath(path, feet, nScratch);
  if (n.d > rp.catchReach) return 'far';
  const L = path.length;
  if ((n.s < rp.catchEndM && !path.seg.prev) || (n.s > L - rp.catchEndM && !path.seg.next)) return 'end';
  if (n.point.y > feet.y + rp.catchHeightSlack) return 'above';
  if (vel.y > rp.catchMaxRiseSpeed) return 'rising';
  sampleRail(path, n.s, pScratch, tScratch);
  let rx = vel.x, rz = vel.z;
  if (Math.hypot(rx, rz) < 0.5) {
    if (vel.y > -2) return 'still';
    rx = Math.sin(facingYaw); rz = Math.cos(facingYaw);   // a drop: read along the facing
  }
  const al = Math.hypot(tScratch.x, tScratch.z), rl = Math.hypot(rx, rz);
  if (al < 1e-3) return 'across';   // a vertical piece is never caught from the air
  const cos = (tScratch.x * rx + tScratch.z * rz) / (al * rl);
  if (Math.abs(cos) < rp.catchAlign) return 'across';
  const along = tScratch.x * vel.x + tScratch.y * vel.y + tScratch.z * vel.z;
  out.path = path; out.s = n.s; out.d = n.d;
  out.dir = (Math.abs(along) > 1e-3 ? along : cos) >= 0 ? 1 : -1;
  out.speed = Math.max(Math.abs(along), rp.catchMinSpeed);
  out.point.x = n.point.x; out.point.y = n.point.y; out.point.z = n.point.z;
  return 'ok';
}

const tryScratch: RailCatch = railCatch();

/** The nearest qualifying rail in the network (RailMagnet.pickRail: the nearest, not the first). */
export function findRailCatch(
  rails: RailIndex, feet: Vec3, vel: Vec3, facingYaw: number, rp: RailParams, skipId: string | null, out: RailCatch,
): RailCatch | null {
  out.path = null; out.d = Infinity;
  for (const path of rails.paths) {
    if (path.id === skipId) continue;
    if (qualifyRailPath(path, feet, vel, facingYaw, rp, tryScratch) !== 'ok' || tryScratch.d >= out.d) continue;
    out.path = tryScratch.path; out.s = tryScratch.s; out.d = tryScratch.d; out.dir = tryScratch.dir;
    out.speed = tryScratch.speed;
    out.point.x = tryScratch.point.x; out.point.y = tryScratch.point.y; out.point.z = tryScratch.point.z;
  }
  return out.path ? out : null;
}

/** The switch a rider at `sM` leaning to `side` (in the SEGMENT's frame: + = right of increasing s) may take. */
export function switchAt(seg: RailSegment, sM: number, side: -1 | 1): RailSwitch | null {
  let best: RailSwitch | null = null, bestD = Infinity;
  for (const w of seg.switches) {
    const d = Math.abs(sM - w.atM);
    if (w.side === side && d <= w.windowM && d < bestD) { best = w; bestD = d; }
  }
  return best;
}

// ── Entering, riding and leaving a rail ─────────────────────────────────────────────────────────────────────────────

export function enterGrind(a: AdventureActor, b: BodyState, c: RailCatch, env: StepEnv): void {
  const path = c.path!;
  if (a.rail) { a.rail.segmentId = path.id; a.rail.sM = c.s; a.rail.dir = c.dir; a.rail.speed = c.speed; }
  else a.rail = { segmentId: path.id, sM: c.s, dir: c.dir, speed: c.speed };
  b.balance.start();
  b.trickT = 0; b.trickChain = 0; b.hopT = 0; b.lean = 0; b.turn = 0;
  b.spinning = false; b.homingId = null; b.airDashT = 0; b.rising = false; b.wall = null;
  a.grounded = false;
  sampleRail(path, c.s, a.pos, tScratch);
  a.vel.x = tScratch.x * c.dir * c.speed; a.vel.y = tScratch.y * c.dir * c.speed; a.vel.z = tScratch.z * c.dir * c.speed;
  enterState(a, 'grind', env.bus);
  env.bus.emit('rail:enter', { actorId: a.id, segmentId: path.id, speed: c.speed });
}

/** Leave the rail into the air. `vel` is already set by the caller. */
export function exitGrind(a: AdventureActor, b: BodyState, reason: 'end' | 'jump' | 'fall' | 'hit', env: StepEnv): void {
  const seg = a.rail?.segmentId ?? '';
  a.rail = null;
  b.balance.stop();
  b.hopT = 0; b.trickT = 0;
  b.recatchId = seg; b.recatchT = env.p.rail.recatchSec;
  b.coyote = Infinity; b.airDashes = 1; b.airDashT = 0;
  a.grounded = false;
  enterState(a, 'air', env.bus);
  env.bus.emit('rail:exit', { actorId: a.id, segmentId: seg, reason });
}

/** Which end of `to` meets the point (x, y, z): its start (s = 0, run forward) or its end (s = L, run back). */
function joinEnd(to: RailPath, x: number, y: number, z: number): { s: number; dir: 1 | -1 } {
  const n = to.xs.length - 1;
  const d0 = Math.hypot(to.xs[0] - x, to.ys[0] - y, to.zs[0] - z);
  const d1 = Math.hypot(to.xs[n] - x, to.ys[n] - y, to.zs[n] - z);
  return d0 <= d1 ? { s: 0, dir: 1 } : { s: to.length, dir: -1 };
}

const posScratch: Vec3 = { x: 0, y: 0, z: 0 };

/** One fixed step on a rail. Leaves the rail itself (exitGrind) when the ride ends. */
export function stepGrind(a: AdventureActor, b: BodyState, inp: MoveInput, w: Wish, env: StepEnv, dt: number): void {
  const rp = env.p.rail;
  const cur = a.rail;
  const found = cur ? env.rails.byId.get(cur.segmentId) : undefined;
  if (!cur || !found) { exitGrind(a, b, 'fall', env); return; }
  let path: RailPath = found;
  const top = rp.topSpeed * b.feel.grind;

  // A switch hop: the body arcs from where it left to the target rail, which it already rides (the cursor moved).
  if (b.hopT > 0) {
    b.hopT = Math.max(0, b.hopT - dt);
    cur.sM = Math.max(0, Math.min(path.length, cur.sM + cur.dir * cur.speed * dt));
    sampleRail(path, cur.sM, posScratch, tScratch);
    const u = 1 - b.hopT / rp.switchSec;
    a.pos.x = b.hopFrom.x + (posScratch.x - b.hopFrom.x) * u;
    a.pos.z = b.hopFrom.z + (posScratch.z - b.hopFrom.z) * u;
    a.pos.y = b.hopFrom.y + (posScratch.y - b.hopFrom.y) * u + 4 * rp.switchArcM * u * (1 - u);
    a.vel.x = tScratch.x * cur.dir * cur.speed; a.vel.y = tScratch.y * cur.dir * cur.speed; a.vel.z = tScratch.z * cur.dir * cur.speed;
    return;
  }

  sampleRail(path, cur.sM, posScratch, tScratch);
  const travelYaw = yawOf(tScratch.x * cur.dir, tScratch.z * cur.dir);
  const lean = leanOf(inp, w, travelYaw);
  const turn = turnPerMetre(path, cur.sM, cur.dir);
  const seg = path.seg;

  // Speed: the slope, the authored bias, friction, then the lean (curves) or the tuck (straights).
  let accel = -rp.gravity * tScratch.y * cur.dir + seg.speedBias - rp.friction;
  if (Math.abs(turn) >= rp.straightTurn) {
    if (lean * turn > 0) accel += rp.leanWith * Math.abs(lean) * b.feel.grind;
    else if (lean * turn < 0) accel -= rp.leanAgainst * Math.abs(lean);
  } else {
    const fwd = forwardOf(w, travelYaw);
    if (fwd > 0.5) accel += rp.tuckAccel * fwd * b.feel.grind;
    else if (fwd < -0.5) accel -= rp.brakeDecel * -fwd;
  }
  let speed = cur.speed + accel * dt;
  let dir = cur.dir;
  if (speed < 0) { dir = (dir === 1 ? -1 : 1); speed = -speed; }   // over-climbed: slide back down
  if (seg.minSpeed) speed = Math.max(speed, seg.minSpeed);
  speed = Math.min(speed, top);

  // Advance, chaining onto the next rail at an end.
  let s = cur.sM + dir * speed * dt;
  for (let guard = 0; guard < 4 && (s > path.length || s < 0); guard++) {
    const past = s > path.length ? s - path.length : -s;
    const linkId: string | null | undefined = s > path.length ? path.seg.next : path.seg.prev;
    const link: RailPath | undefined = linkId ? env.rails.byId.get(linkId) : undefined;
    if (!link) {
      // The end of the line: leave along the rail with a small pop.
      const endS = s > path.length ? path.length : 0;
      sampleRail(path, endS, a.pos, tScratch);
      a.vel.x = tScratch.x * dir * speed; a.vel.y = tScratch.y * dir * speed + 2; a.vel.z = tScratch.z * dir * speed;
      b.rising = false; b.spinning = false;
      exitGrind(a, b, 'end', env);
      return;
    }
    sampleRail(path, s > path.length ? path.length : 0, posScratch);
    const j = joinEnd(link, posScratch.x, posScratch.y, posScratch.z);
    path = link;
    dir = j.dir;
    s = j.s + dir * past;
    cur.segmentId = link.id;
  }
  cur.sM = Math.max(0, Math.min(path.length, s));
  cur.dir = dir;
  cur.speed = speed;
  sampleRail(path, cur.sM, a.pos, tScratch);
  a.vel.x = tScratch.x * dir * speed; a.vel.y = tScratch.y * dir * speed; a.vel.z = tScratch.z * dir * speed;
  if (Math.hypot(tScratch.x, tScratch.z) > 1e-3) a.facingYaw = yawOf(tScratch.x * dir, tScratch.z * dir);
  b.lean = lean; b.turn = turn;
  b.flow.add(FLOW.grindPerSec * dt);

  // Balance: the curve pushes the needle toward the side to lean; the lean holds it (BalanceChannel's integrator).
  const push = rp.curvePush * speed * speed * turn;
  if (b.balance.update(dt, lean, Math.min(1, speed / top), rp.balanceWander, push)) {
    const side = b.balance.needle >= 0 ? 1 : -1;
    const rx = Math.cos(a.facingYaw), rz = -Math.sin(a.facingYaw);
    a.vel.x += rx * side * 3; a.vel.z += rz * side * 3;
    b.rising = false; b.spinning = false;
    exitGrind(a, b, 'fall', env);
    return;
  }

  // A trick: points scale with speed and with tricks chained on this ride.
  if (b.trickT > 0) b.trickT = Math.max(0, b.trickT - dt);
  if ((inp.attackLight || inp.attackHeavy) && b.trickT <= 0) {
    b.trickT = rp.trickSec;
    b.trickChain++;
    const points = Math.round(rp.trickPoints * (1 + speed / top) * (1 + 0.25 * (b.trickChain - 1)));
    b.flow.add(FLOW.trick);
    env.bus.emit('rail:trick', { actorId: a.id, trick: inp.attackHeavy ? RAIL_TRICKS.heavy : RAIL_TRICKS.light, points, energy: RAIL_TRICK_ENERGY });
  }

  if (inp.jump) {
    if (Math.abs(lean) >= rp.switchLean) {
      const side = ((lean > 0 ? 1 : -1) * dir) as -1 | 1;
      const sw = switchAt(path.seg, cur.sM, side);
      const to = sw ? env.rails.byId.get(sw.toSegment) : undefined;
      if (sw && to) { startSwitch(a, b, cur.segmentId, to, sw, env); return; }
    }
    if (!path.seg.tags?.includes('noExitJump')) { jumpOff(a, b, lean, env); return; }
  }

  pushHint(env, 'grind', a.id, 10 * Math.min(1, speed / top));
}

function startSwitch(a: AdventureActor, b: BodyState, fromId: string, to: RailPath, sw: RailSwitch, env: StepEnv): void {
  const cur = a.rail!;
  const travelX = a.vel.x, travelZ = a.vel.z;
  b.hopFrom.x = a.pos.x; b.hopFrom.y = a.pos.y; b.hopFrom.z = a.pos.z;
  const toS = Math.max(0, Math.min(to.length, sw.toAtM));
  sampleRail(to, toS, posScratch, tScratch);
  const along = tScratch.x * travelX + tScratch.z * travelZ;
  cur.segmentId = to.id;
  cur.sM = toS;
  cur.dir = along >= 0 ? 1 : -1;
  b.hopT = env.p.rail.switchSec;
  b.balance.start();
  b.flow.add(FLOW.rebound * 0.5);
  env.bus.emit('rail:switch', { actorId: a.id, from: fromId, to: to.id });
}

function jumpOff(a: AdventureActor, b: BodyState, lean: number, env: StepEnv): void {
  const rp = env.p.rail;
  const rx = Math.cos(a.facingYaw), rz = -Math.sin(a.facingYaw);
  a.vel.x += rx * lean * rp.jumpSide;
  a.vel.z += rz * lean * rp.jumpSide;
  a.vel.y = Math.max(a.vel.y, 0) + rp.jumpSpeed;
  b.rising = true; b.spinning = true;
  b.jumpedAt = env.tSec;
  exitGrind(a, b, 'jump', env);
}
