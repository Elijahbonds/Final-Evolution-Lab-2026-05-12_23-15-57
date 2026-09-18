// RACE CONTACT — rivals with intent, and what happens when vehicles touch (2026-09-18).
//
// The field (RaceField.ts) is honest about what it is: pacers on the racing line. What a pacer cannot do is RACE you —
// it never moves across the road to block, never leans on you in a corner, never gets punted off its line, and you can
// drive straight through it. This file is the layer over the pacer that makes the field an opponent:
//
//   · INTENT. Every rival has a personality: CLEAN holds its lane and passes a slower rival rather than driving through
//     it; a BLOCKER slides across in front of you when you close on it; a BUMPER leans into you alongside. All of it is
//     a LANE target the rival eases toward — the pace stays the pacer's, so nothing here can spin a rival into a wall.
//   · CONTACT. Two vehicles that overlap on the road are resolved as a SIDE BUMP (both shoved apart, a little speed
//     lost) or, when one closes on the other from behind fast enough, a PUNT: the one in front is spun and the one
//     behind carries on. A punt with the boost lit is the arcade racer's cleanest moment and it is the player's to
//     earn, but a BUMPER can do it to you.
//   · NEAR MISS. A pass close enough to feel and clean enough to count pays the boost meter.
//
// Pure: distances along the line and lateral offsets, nothing else. Both racing modes consume it.

export type Personality = 'clean' | 'blocker' | 'bumper';

export const CONTACT = {
  /** How far a rival's lane may eat into the road (metres from the edge it must keep). */
  edgeKeep: 1.2,
  /** Lane easing, metres per second. */
  laneRate: 2.4,
  /** A blocker acts on a player closing inside this gap behind it (metres). */
  blockGap: 26,
  /** A bumper acts on a player alongside it, inside this along-track gap. */
  bumpGap: 7,
  /** How far a clean rival steps aside from a slower rival dead ahead. */
  passOffset: 2.6,
  /** Vehicle half-length / half-width the overlap test uses (metres). */
  halfLen: 2.1, halfWid: 1.35,
  /** Closing speed (m/s) from behind that turns a bump into a punt. */
  puntClosing: 5.5,
  /** The shove a side bump gives each vehicle, metres. */
  sideShove: 1.1,
  /** Speed kept after a side bump / by the vehicle punted / by the one that punted. */
  bumpKeep: 0.86, puntedKeep: 0.45, punterKeep: 0.97,
  /** How long a punted vehicle spins. */
  puntSpinSec: 1.3,
  /** Seconds before the same pair can bump again. */
  cooldownSec: 0.55,
  /** A near miss: alongside inside this lateral gap, outside the overlap, closing at this speed. */
  nearMissLat: 3.4, nearMissClosing: 2.5, nearMissAlong: 4,
} as const;

export const PERSONALITIES: readonly Personality[] = ['clean', 'blocker', 'clean', 'bumper', 'clean', 'blocker', 'bumper'];

/** The personality a rival at grid index `i` gets. */
export function personalityFor(i: number): Personality { return PERSONALITIES[i % PERSONALITIES.length]; }

export interface Racer {
  /** Distance along the line, metres (keeps counting past a lap). */
  dist: number;
  /** Metres right of the centre line. */
  lateral: number;
  speed: number;
}

/** Along-track gap b − a, wrapped so two racers a lap apart on the same spot read as close. */
export function alongGap(a: number, b: number, lapLength: number): number {
  const raw = b - a;
  if (!lapLength) return raw;
  const half = lapLength / 2;
  return ((raw + half) % lapLength + lapLength) % lapLength - half;
}

/**
 * The lane a rival wants this frame. `player` may be null (no player in the race). `others` are the OTHER rivals, so a
 * clean rival can step around one it is catching. Returns the eased lane.
 */
export function steerLane(
  r: { lane: number; dist: number; speed: number; personality: Personality; home: number },
  player: Racer | null, others: readonly Racer[], halfWidth: number, lapLength: number, dt: number,
): number {
  const lim = Math.max(0.5, halfWidth - CONTACT.edgeKeep);
  let target = r.home;
  if (player) {
    const gap = alongGap(player.dist, r.dist, lapLength);   // + = the rival is ahead of the player
    if (r.personality === 'blocker' && gap > 2 && gap < CONTACT.blockGap && player.speed > r.speed - 1) target = player.lateral;
    else if (r.personality === 'bumper' && Math.abs(gap) < CONTACT.bumpGap) target = player.lateral + Math.sign(r.lane - player.lateral || 1) * 0.6;
  }
  // a slower rival dead ahead: step aside rather than drive through it
  for (const o of others) {
    const g = alongGap(r.dist, o.dist, lapLength);
    if (g > 1 && g < 9 && o.speed < r.speed + 0.5 && Math.abs(o.lateral - target) < 2.2) target = o.lateral + (r.lane >= o.lateral ? 1 : -1) * CONTACT.passOffset;
  }
  target = Math.max(-lim, Math.min(lim, target));
  const step = CONTACT.laneRate * dt;
  return r.lane + Math.max(-step, Math.min(step, target - r.lane));
}

export type ContactKind = 'side' | 'punt' | 'punted';
export interface ContactEvent {
  /** Index into the `rivals` array. */
  i: number;
  kind: ContactKind;
  /** Lateral shove for the PLAYER (metres, signed) and the rival. */
  playerShove: number; rivalShove: number;
  /** Speed multipliers to apply. */
  playerKeep: number; rivalKeep: number;
}

/** Resolve the player against every rival. `cooldowns` (per rival, seconds left) is read and written. */
export function resolveContact(
  player: Racer & { boosting: boolean }, rivals: readonly Racer[], lapLength: number, cooldowns: number[], dt: number,
): ContactEvent[] {
  const out: ContactEvent[] = [];
  for (let i = 0; i < rivals.length; i++) {
    cooldowns[i] = Math.max(0, (cooldowns[i] ?? 0) - dt);
    if (cooldowns[i] > 0) continue;
    const r = rivals[i];
    const along = alongGap(player.dist, r.dist, lapLength);   // + = rival ahead
    const lat = r.lateral - player.lateral;
    if (Math.abs(along) >= CONTACT.halfLen * 2 || Math.abs(lat) >= CONTACT.halfWid * 2) continue;
    cooldowns[i] = CONTACT.cooldownSec;
    const side = lat >= 0 ? -1 : 1;   // the player is shoved away from the rival
    const closing = player.speed - r.speed;
    if (along > 0 && (closing > CONTACT.puntClosing || (player.boosting && closing > 1))) {
      out.push({ i, kind: 'punt', playerShove: side * 0.35, rivalShove: -side * 0.9, playerKeep: CONTACT.punterKeep, rivalKeep: CONTACT.puntedKeep });
    } else if (along < 0 && -closing > CONTACT.puntClosing) {
      out.push({ i, kind: 'punted', playerShove: side * 0.9, rivalShove: -side * 0.35, playerKeep: CONTACT.puntedKeep, rivalKeep: CONTACT.punterKeep });
    } else {
      out.push({ i, kind: 'side', playerShove: side * CONTACT.sideShove, rivalShove: -side * CONTACT.sideShove, playerKeep: CONTACT.bumpKeep, rivalKeep: CONTACT.bumpKeep });
    }
  }
  return out;
}

/** The rivals the player is passing close and clean this frame (for the boost meter). One pass per rival per crossing. */
export function nearMisses(player: Racer, rivals: readonly Racer[], lapLength: number, wasAlongside: boolean[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < rivals.length; i++) {
    const r = rivals[i];
    const along = alongGap(player.dist, r.dist, lapLength);
    const lat = Math.abs(r.lateral - player.lateral);
    const alongside = Math.abs(along) < CONTACT.nearMissAlong && lat > CONTACT.halfWid * 2 && lat < CONTACT.nearMissLat;
    if (alongside && !wasAlongside[i] && player.speed - r.speed > CONTACT.nearMissClosing) out.push(i);
    wasAlongside[i] = alongside;
  }
  return out;
}
