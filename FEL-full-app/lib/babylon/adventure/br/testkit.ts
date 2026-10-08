/**
 * Test helpers for the BR (headless scenarios on the real match). Pure; used by the br tests only. The writes here are
 * a test's god-hand — a SPAWN's writes in the ownership table's terms (placing a body, steering the zone's plan).
 */

import type { ActorId } from '../contracts';
import { BRMatch, type BRMatchOptions } from './match';
import type { ZoneCircle } from './zone';

/** A match stepped until every fighter has landed (the drop is over). */
export function landedMatch(o: BRMatchOptions): BRMatch {
  const m = new BRMatch(o);
  for (let i = 0; i < 60 * 30 && m.phase === 'drop'; i++) m.step();
  if (m.phase === 'drop') throw new Error('the drop never ended');
  m.step();   // the drop's fusion ends on the bond's next step
  return m;
}

/** Stand a body at (x, z) on the ground, still (and forget A1's working record so it rebuilds from the actor). */
export function put(m: BRMatch, id: ActorId, x: number, z: number, yaw?: number): void {
  const a = m.world.actors.get(id);
  if (!a) throw new Error(`no body ${id}`);
  a.pos.x = x; a.pos.z = z; a.pos.y = m.world.groundY(x, z) ?? 0;
  a.vel.x = 0; a.vel.y = 0; a.vel.z = 0;
  if (yaw !== undefined) a.facingYaw = yaw;
  m.movement.reset(id);
}

/** Steer the zone: the NEXT circle becomes `next`, closing in `secondsLeft` (the current circle stays). */
export function nextCircleIs(m: BRMatch, next: ZoneCircle, secondsLeft: number): void {
  const z = m.zone;
  z.circles[z.index + 1] = { ...next };
  z.stageSec = Math.max(0, z.stageLen - secondsLeft);
}

/** Step `sec` of sim time; `until` stops early when it returns true. Returns the seconds run. */
export function run(m: BRMatch, sec: number, until?: () => boolean): number {
  const n = Math.round(sec * 60);
  for (let i = 0; i < n; i++) {
    m.step();
    if (until?.()) return (i + 1) / 60;
  }
  return sec;
}
