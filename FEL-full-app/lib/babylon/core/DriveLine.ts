// DriveLine — a drive that knows you are standing there.
//
// Owner, 2026-09-16: "make the 3v3 drive react to the defender."
//
// WHAT IT WAS. 3v3's rival possession moved the driver along a straight line from where he started to the rim,
// parameterised by a 1100 ms clock:
//
//     shooter.pos.x = from.x + (RIM.x - from.x) * k;
//     shooter.pos.z = from.z + (RIM.z + 0.9 - from.z) * k;
//
// Nothing in there reads the defender, so where you stood changed nothing about where he went. Measured: a
// defender who planted and held it for 10.3 s across eight possessions never saw the driver come closer than
// 2.70 m — he was not avoiding anybody, he simply had a line and took it. Everything downstream that depends on
// the bodies meeting (the charge, the blocking foul, the bump) was therefore a coincidence of geometry.
//
// WHAT A DRIVE ACTUALLY DOES about a body in the way: it goes AROUND him, or it goes THROUGH him, and which one
// it picks is a read on whether he is SET. That read is the whole thing, because it is also the rulebook's:
//
//   · he is SET and you go through him      → CHARGE, and you have given the ball away (Ref: 'charge')
//   · he is MOVING and you go through him   → BLOCKING FOUL, and he has (Ref: 'blocking_foul')
//
// So a driver who reads the defender makes both of those rules reachable for the first time, and a defender who
// plants early is doing something that matters. This module is the read and the geometry; the modes own the
// consequence, as ever.
//
// Pure: no Babylon, no scene, no clock.

/** A planar point. The modes pass Vector3s, which satisfy this structurally. */
export interface Pt { x: number; z: number }

/** What the driver decided to do about the man in front of him. Chosen once, at the top of the drive. */
export type DriveIntent = 'around' | 'through';

/** How wide of the drive line a defender still counts as "in the way". */
export const CORRIDOR = 1.5;
/** How far the path bends to get round him, at its widest. */
export const AVOID_METRES = 1.6;
/** Past this much of the drive the bend is easing out, so the finish still arrives AT the rim. */
export const AVOID_EASE_FROM = 0.72;

/**
 * Go around him, or go through him?
 *
 * A SET body is one you do not run through on purpose — that is a charge and a turnover, and an AI that took it
 * every time would be handing you the ball for standing still. A MOVING body is one you can go through: the foul
 * is his. `aggression` is Nerve's (a rival who is behind presses), so a losing team drives at you more.
 */
export function driveIntent(read: { defenderSet: boolean; aggression: number; roll: () => number }): DriveIntent {
  // Base odds of taking the contact rather than the angle. A set defender is mostly respected; a moving one is
  // mostly attacked, which is what "he was late" looks like from the other side.
  const base = read.defenderSet ? 0.18 : 0.62;
  return read.roll() < base * Math.max(0.5, Math.min(1.6, read.aggression)) ? 'through' : 'around';
}

/**
 * How far to bend the path sideways this frame, in metres, perpendicular to the drive.
 *
 * Positive is toward the driver's right along `dir`. Zero when there is nobody in the corridor, when the driver
 * chose to go through him, or once the drive is far enough along that bending would miss the rim.
 */
export function driveLateral(read: {
  at: Pt; defender: Pt | null; dir: Pt; k: number; intent: DriveIntent;
}): number {
  if (!read.defender || read.intent === 'through') return 0;
  // the defender's offset across the drive line: right = (dir.z, -dir.x)
  const rx = read.dir.z, rz = -read.dir.x;
  const dx = read.defender.x - read.at.x, dz = read.defender.z - read.at.z;
  const across = dx * rx + dz * rz;
  const ahead = dx * read.dir.x + dz * read.dir.z;
  // behind you is not in the way, and neither is a body wide of the corridor
  if (ahead <= 0 || Math.abs(across) > CORRIDOR) return 0;
  // the closer he is to the line, the harder the bend; and it eases out so the drive still finishes at the rim
  const centred = 1 - Math.abs(across) / CORRIDOR;
  const ease = read.k <= AVOID_EASE_FROM ? 1 : Math.max(0, (1 - read.k) / (1 - AVOID_EASE_FROM));
  // …away from whichever side he is on. Dead centre, pick a side rather than driving straight through him.
  const side = across === 0 ? 1 : -Math.sign(across);
  const bend = side * AVOID_METRES * centred * ease;
  return bend === 0 ? 0 : bend;   // normalise -0: a consumer comparing against 0 should not have to know about it
}

/**
 * Did the bodies actually meet? `standoff` is BODY_STANDOFF — two bodies cannot be closer, so contact IS that
 * distance rather than an overlap. Kept here so both modes ask the same question.
 */
export function bodiesMet(a: Pt, b: Pt, standoff: number): boolean {
  return Math.hypot(a.x - b.x, a.z - b.z) <= standoff + 0.35;
}
