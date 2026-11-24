// FEL NETPLAY — a remote human's offence in 3v3 (lane/improve-hoops-2, phase 10 of docs/IMPROVE-10-PHASE-AUDIT.md, 2026-11-22). Pure.
//
// ONLINE-FINISH-PLAN §8: a remote human drove his body's feet and its defence, but the AI brain still chose when that body passed and
// shot. The whole Intent already crosses netd (protocol.ts packIntent: the pass, the shot press and its hold), so nothing on the wire
// changes; the runner's page now reads that human's own buttons for his body's passes and shots. This is the read: the PRESS EDGES of
// a remote intent stream. The stream repeats its last input when a packet is lost (NetSession.intentFor / InputQueue), so a held or
// repeated `pass` must be one pass, not one a frame — edges, never levels.
import type { Intent } from '../babylon/core/PlayerSlot';

/** The shot is "pressed" past this much of the trigger (the hero's own threshold, OneVOneMode / ThreeVThreeMode actionHeld > 0.02). */
export const REMOTE_SHOT_HELD = 0.02;

export interface RemotePress { pass: boolean; shot: boolean; shotHeld: boolean }

/** One remote body's buttons, frame by frame: which presses STARTED this frame. */
export class RemoteButtons {
  private passWas = false;
  private shotWas = false;
  /** Feed this frame's intent (null: nobody on the seat — everything released). */
  read(i: Intent | null): RemotePress {
    const pass = !!i?.pass, shotHeld = !!i && (i.action || i.actionHeld > REMOTE_SHOT_HELD);
    const out = { pass: pass && !this.passWas, shot: shotHeld && !this.shotWas, shotHeld };
    this.passWas = pass; this.shotWas = shotHeld;
    return out;
  }
  reset(): void { this.passWas = false; this.shotWas = false; }
}

interface Planar { x: number; z: number }
/** Who a remote passer throws to: the team-mate his stick points at (within 60° of it), else the one nearest the rim — never nobody
 *  while one is free. Returns the index into `mates`, or -1 when there is no one to throw to. */
export function remotePassTarget(from: Planar, stick: Planar, mates: readonly Planar[], rim: Planar): number {
  if (!mates.length) return -1;
  const sl = Math.hypot(stick.x, stick.z);
  if (sl > 0.3) {
    let best = -1, bestCos = Math.cos(Math.PI / 3);
    mates.forEach((m, i) => { const dx = m.x - from.x, dz = m.z - from.z, l = Math.hypot(dx, dz) || 1; const c = (dx * stick.x + dz * stick.z) / (l * sl); if (c > bestCos) { bestCos = c; best = i; } });
    if (best >= 0) return best;
  }
  let near = 0;
  mates.forEach((m, i) => { if (Math.hypot(m.x - rim.x, m.z - rim.z) < Math.hypot(mates[near].x - rim.x, mates[near].z - rim.z)) near = i; });
  return near;
}
