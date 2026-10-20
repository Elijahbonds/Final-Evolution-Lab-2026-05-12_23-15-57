// DrawnFacing — NO ONE-FRAME FACING SNAPS ON A HOOPS BODY (hoops-dip movement pass, owner 2026-10-20: "turn smoothing everywhere in hoops,
// including the momentum cross's 55° snap, smoothed over about 0.12 s").
//
// The movement writes the facing in one frame on a cut — DribbleController.cutTo (the momentum cross −55°, the drift, the drop step, the
// step-back), the left-stick reversal's flip (−118° to −129°) — and the modes draw the root at that facing the same frame. The cut's
// DIRECTION and SPEED are the movement's (CourtMovement.vel) and stay exactly as they are; only the root's drawn yaw is filtered here:
//   · a turn the movement already slews (its own turn rate: a few degrees a frame) is followed EXACTLY — no lag on an ordinary turn;
//   · a jump bigger than SNAP_MIN_RAD in one frame is spread over TURN_SMOOTH_SEC at a constant rate (the jump's size / the time), and any
//     further turn while it runs is folded into the same slew;
//   · a teleport (the body moved more than TELEPORT_M in a frame: a reset, a new possession) takes the new facing at once.
// Pure state + one step; the modes keep one per steered body and draw the root at step(...)'s yaw.

/** The smoothing time of a facing snap (s). TUNED (new): the owner's "about 0.12 s". */
export const TURN_SMOOTH_SEC = 0.12;
/** A one-frame change of the facing bigger than this is a snap (rad; 15°). The movement's own slewed turns stay under it at any frame rate
 *  the game runs (CourtMovement's turn rate at a sprint is ~5°/frame at 60 fps). */
export const SNAP_MIN_RAD = (15 * Math.PI) / 180;
/** A body that moved further than this in one frame was placed, not run: its facing is taken at once (m). */
export const TELEPORT_M = 0.8;

export interface DrawnFacingState { yaw: number; rate: number; x: number; z: number; seeded: boolean }
export const drawnFacingIdle = (): DrawnFacingState => ({ yaw: 0, rate: 0, x: 0, z: 0, seeded: false });

const wrap = (a: number): number => { let d = a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

/** One frame: the movement's facing `target`, the body's position (x, z), dt. Mutates and returns the state; draw the root at `.yaw`. */
export function stepDrawnFacing(s: DrawnFacingState, target: number, x: number, z: number, dt: number): DrawnFacingState {
  if (s.seeded && !(dt > 0)) return s;   // a frame with no time in it (a pause): nothing turns
  const placed = !s.seeded || Math.hypot(x - s.x, z - s.z) > TELEPORT_M;
  s.x = x; s.z = z;
  if (placed) { s.yaw = target; s.rate = 0; s.seeded = true; return s; }
  const d = wrap(target - s.yaw);
  if (s.rate === 0 && Math.abs(d) <= SNAP_MIN_RAD) { s.yaw = target; return s; }   // an ordinary turn: exactly the movement's
  s.rate = Math.max(s.rate, Math.abs(d) / TURN_SMOOTH_SEC);   // a snap: its size over TURN_SMOOTH_SEC; a further turn mid-slew speeds it so
                                                               // it still ends TURN_SMOOTH_SEC after the last jump
  const step = s.rate * dt;
  if (Math.abs(d) <= step) { s.yaw = target; s.rate = 0; } else s.yaw = wrap(s.yaw + Math.sign(d) * step);
  return s;
}

/** The modes' one-line hook: the drawn yaw for this body's root this frame, its state kept per node. `target` is the movement's facing.
 *  It starts from the yaw the root is DRAWN at now — other code turns the root too (the spin's path and its exit, the pivots, a reset) and
 *  the slew must go on from there, never from a stale yaw of its own. */
const PER_NODE = new WeakMap<object, DrawnFacingState>();
export function drawnYaw(node: { position: { x: number; z: number }; rotation: { y: number } }, target: number, dt: number): number {
  let s = PER_NODE.get(node); if (!s) { s = drawnFacingIdle(); PER_NODE.set(node, s); }
  if (s.seeded) { if (Math.abs(wrap(node.rotation.y - s.yaw)) > 1e-6) s.rate = 0; s.yaw = node.rotation.y; }   // turned by someone else: start over from there
  return stepDrawnFacing(s, target, node.position.x, node.position.z, dt).yaw;
}
