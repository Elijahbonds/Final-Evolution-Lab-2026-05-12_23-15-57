// PHYSICS ARENA — where a body's two hands are, by what it is doing (pure; owner 2026-11-24: physics hands, hands first, OFF until
// measured). The arena's kinematic hand bodies (arenaPhysics.ArenaHands) are driven to these points each step; whatever they meet
// on the way (the ball) is moved by contact. Without the knob nothing reads this.

import type { P3 } from './hoopGeometry';
import { chestPoint, dribbleHand, setPoint } from './dribble';

export type HandRole = 'rest' | 'dribble' | 'hold' | 'shoot' | 'guard' | 'contest' | 'reach';

export interface HandInput { feet: P3; yaw: number; ball: P3; role: HandRole; dribbleSide: 1 | -1 }

/** The two hands' targets (world, metres). */
export function handTargets(h: HandInput): { left: P3; right: P3 } {
  const { feet, yaw } = h;
  const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = fz, rz = -fx;
  const at = (side: number, fwd: number, up: number): P3 => ({ x: feet.x + rx * side + fx * fwd, y: feet.y + up, z: feet.z + rz * side + fz * fwd });
  switch (h.role) {
    case 'dribble': {
      // the dribbling hand rides above the ball (it meets it at the top of the bounce); the other guards
      const d = dribbleHand(feet, yaw, h.dribbleSide);
      const over = { x: d.x, y: Math.max(feet.y + 0.75, Math.min(d.y + 0.1, h.ball.y + 0.18)), z: d.z };
      const guard = at(-0.35 * h.dribbleSide, 0.35, 1.2);
      return h.dribbleSide === 1 ? { left: guard, right: over } : { left: over, right: guard };
    }
    case 'hold': { const c = chestPoint(feet, yaw); return { left: { ...c, x: c.x - rx * 0.13, z: c.z - rz * 0.13 }, right: { ...c, x: c.x + rx * 0.13, z: c.z + rz * 0.13 } }; }
    case 'shoot': { const s = setPoint(feet, yaw); return { left: { x: s.x - rx * 0.12, y: s.y - 0.08, z: s.z - rz * 0.12 }, right: { x: s.x + rx * 0.05, y: s.y - 0.14, z: s.z + rz * 0.05 } }; }
    case 'contest': return { left: at(-0.2, 0.3, 2.45), right: at(0.2, 0.35, 2.5) };   // both up, a little forward: a hand in the shot's way
    case 'reach': {
      // the reaching hand goes at the ball (fast, kinematic: the contact is a poke), the other stays home
      const right = { x: h.ball.x, y: Math.min(h.ball.y + 0.05, feet.y + 1.5), z: h.ball.z };
      return { left: at(-0.35, 0.3, 1.1), right };
    }
    case 'guard': return { left: at(-0.3, 0.25, 1.2), right: at(0.3, 0.25, 1.2) };   // active hands, in his own space
    default: return { left: at(-0.3, 0.05, 0.85), right: at(0.3, 0.05, 0.85) };
  }
}
