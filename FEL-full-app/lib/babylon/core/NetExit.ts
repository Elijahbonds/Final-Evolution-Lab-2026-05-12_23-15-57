// NetExit — how fast the ball leaves the NET on a make (owner, 2026-09-17): "add some velocity off the ball through the
// net in all modes in all makes relative to the shot or dunk; if it's a poster dunk have the ball fly through 80 mph; if
// it's a layup then normal gravity" — and "have the ball bounce and fly off". So no damping: the ball sim's own floor
// bounce takes it from there, and a poster's ball leaves the court.
//
// Pure: a kind, a speed and a forward drift. The modes own the launch.
import type { ShotStyle } from './BasketballCore';

export type NetExitKind = 'layup' | 'jumper' | 'dunk' | 'showtime' | 'poster';
export const MPH_TO_MPS = 0.44704;
/** Metres per second DOWN the net's axis when the ball clears it. A layup drops under gravity alone. */
export const NET_EXIT_MPS: Record<NetExitKind, number> = { layup: 0, jumper: 3.4, dunk: 11, showtime: 15, poster: 80 * MPH_TO_MPS };
/** …and the drift toward the court (the net hangs a little forward; a hard flush spits it out the front). */
export const NET_EXIT_DRIFT: Record<NetExitKind, number> = { layup: 0.6, jumper: 0.6, dunk: 0.9, showtime: 1.2, poster: 2.6 };
/** The gentle drop every make had before this pass — kept as the layup's, because that IS normal gravity with a nudge. */
export const NET_DROP_NUDGE = 0.5;

/** A finish at the rim drops; everything shot at the iron from further out swishes through with its own pace. */
export function netExitKindOf(style: ShotStyle): NetExitKind {
  return style === 'layup' || style === 'reverse' || style === 'mikan' || style === 'upAndUnder' || style === 'fingerRoll' || style === 'scoop' || style === 'spinLayup' || style === 'hangLayup' ? 'layup' : 'jumper';
}
/** The ball's velocity as it leaves the net. `forward` is the court's direction from the rim (default +z), planar. */
export function netExitVelocity(kind: NetExitKind, forward: { x: number; z: number } = { x: 0, z: 1 }): { x: number; y: number; z: number } {
  const l = Math.hypot(forward.x, forward.z) || 1;
  const d = NET_EXIT_DRIFT[kind];
  return { x: (forward.x / l) * d, y: -(NET_EXIT_MPS[kind] + NET_DROP_NUDGE), z: (forward.z / l) * d };
}
/** For the log: the exit in miles per hour. */
export function netExitMph(kind: NetExitKind): number { return Math.round((NET_EXIT_MPS[kind] + NET_DROP_NUDGE) / MPH_TO_MPS); }
