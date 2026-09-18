// RIM PLAY — the ball's time ON the iron (owner, 2026-09-18: "better ball physics for makes and misses and its
// interaction with the rim, different makes and misses").
//
// Until now every make was a swish and every miss was a single clank: the arc flew to the ring centre (or a random
// point on the front lip), the frame it arrived the scoreboard moved, and the loose-ball sim took over from a contact
// RimPhysics computed AFTER the flight had already ended somewhere else — a long miss flew to the FRONT lip and then
// popped to the back iron to leave. The ball never rattled, rolled, or came in and out. In 2K the rim is a character:
// the ball rattles in, rolls around and drops, kisses the back iron and falls through — or goes in and out, rolls
// off, kicks high off the back, or comes off the glass. Those seconds on the ring are where the shooter's heart is.
//
// So a RimPlay is planned at the RELEASE from the shot's own profile (RimPhysics.MissProfile): where the flight
// arrives (the first contact — the arc flies THERE, not to a random point), a short dwell on the iron as world-space
// keys with a lift per leg, the touches (for the rattle and the ring's spring), and — for a miss — the velocity the
// ball leaves with. The make / miss was decided at the release; the play only shows HOW it went in or stayed out.
// Pure: no scene, no mesh. ShotArc steps it; the modes read `label`, `touches`, `exitVel`.

import { Vector3 } from '@babylonjs/core';
import { RIM_RADIUS, BALL_RADIUS, SWISH_WINDOW, AIRBALL_DISTANCE, resolveRim, type MissProfile, type RimHitKind } from './RimPhysics';

export type RimPlayKind =
  | 'swish' | 'roll_in' | 'rattle_in' | 'back_iron_in' | 'roll_around_in'                                   // makes
  | 'front_iron' | 'back_iron' | 'side_iron' | 'in_and_out' | 'roll_off' | 'back_iron_high' | 'glass_out' | 'airball';   // misses

/** A world-space key on the dwell; `lift` bows the leg FROM this key to the next (a pop off the iron). */
export interface RimKey { t: number; p: Vector3; lift: number }
export interface RimTouch { t: number; on: 'iron' | 'glass'; strength01: number }

export interface RimPlay {
  kind: RimPlayKind;
  made: boolean;
  /** For the banner: "RATTLES IN", "IN AND OUT" — a swish is unlabelled (the make's own label carries it). */
  label: string;
  /** Where the FLIGHT arrives — the arc's target: the first contact, the ring centre for a swish, short of the ring for an airball. */
  arrive: Vector3;
  /** The dwell after arrival (empty: the ball leaves the iron the frame it meets it). Keys are in seconds from arrival. */
  keys: RimKey[];
  touches: RimTouch[];
  /** Seconds of dwell. */
  duration: number;
  /** A miss: the ball's velocity when the dwell ends (feed the loose-ball sim). A make: the mode's net exit applies. */
  exitVel: Vector3;
  /** The iron it met, for the mode's log / RimResult-shaped consumers. */
  hit: RimHitKind;
}

/** The ball's centre when it touches the INSIDE of the ring. */
const INNER = RIM_RADIUS - BALL_RADIUS;
/** The ball's centre when it sits ON the lip. */
const ON_LIP_Y = 0.07;
/** Where the ball's centre is when it kisses the glass behind the ring (a regulation ring stands ~0.15 m off the board). */
const GLASS_D = -(RIM_RADIUS + 0.15 - BALL_RADIUS * 0.4);
/** How far under the ring the dwell ends on a make — the net exit launches from there. */
const THROUGH_Y = -0.16;
/** A miss this bad may not reach the iron at all. */
export const AIRBALL_QUALITY = 0.22;
export const AIRBALL_ODDS = 0.35;

const RIM_PLAY_LABEL: Record<RimPlayKind, string> = {
  swish: '', roll_in: 'IN OFF THE IRON', rattle_in: 'RATTLES IN', back_iron_in: 'OFF THE BACK IRON — IN', roll_around_in: 'ROLLS AROUND — IN',
  front_iron: 'SHORT — FRONT RIM', back_iron: 'LONG — BACK IRON', side_iron: 'OFF THE SIDE IRON', in_and_out: 'IN AND OUT', roll_off: 'ROLLS OFF',
  back_iron_high: 'LONG — HIGH OFF THE BACK', glass_out: 'OFF THE GLASS — NO GOOD', airball: 'AIRBALL',
};

/** The shot's frame at the ring: `back` toward the shooter (planar unit), `side` to the shooter's right. */
export function rimFrame(toShooter: Vector3): { back: Vector3; side: Vector3 } {
  const back = new Vector3(toShooter.x, 0, toShooter.z);
  if (back.lengthSquared() < 1e-6) back.set(0, 0, 1); else back.normalize();
  return { back, side: new Vector3(-back.z, 0, back.x) };
}

/**
 * A MAKE's profile: the same error the meter earned, pulled INTO the ring. Quality 1 is dead centre (a swish); a
 * GOOD-window make touches iron on the way in (a rattle, a roll); no make is ever outside the soft window.
 */
export function forcedMakeProfile(quality: number, bias: { short?: number; lateral?: number } = {}, rand = Math.random): MissProfile {
  const q = Math.max(0, Math.min(1, quality));
  const error = (1 - q) * 0.3;
  const depth = -(bias.short ?? 0) * error * 0.6 + (rand() - 0.5) * error;
  const lateral = (bias.lateral ?? 0) * error * 0.6 + (rand() - 0.5) * error * 0.45;   // a make sprays less sideways than it misses deep (measured: every early make rolled around the ring)
  const p: MissProfile = { depthError: depth, lateralError: lateral, descentSpeed: 5 + (1 - q) * 3 };
  const radial = Math.hypot(p.depthError, p.lateralError);
  const ceiling = SWISH_WINDOW * 1.15;
  if (radial <= ceiling) return p;
  const k = ceiling / radial;
  return { ...p, depthError: p.depthError * k, lateralError: p.lateralError * k };
}

/** A brick can miss everything: at or under AIRBALL_QUALITY the profile is pushed short of the iron with AIRBALL_ODDS. */
export function maybeAirball(p: MissProfile, quality: number, rand = Math.random): MissProfile {
  if (quality > AIRBALL_QUALITY || rand() >= AIRBALL_ODDS) return p;
  return { ...p, depthError: -(AIRBALL_DISTANCE + 0.15), lateralError: p.lateralError * 1.6 };
}

/**
 * Plan the ball's time on the ring from the shot's profile. `made` was decided at the release; the profile says
 * where the ball meets the iron (a make's from forcedMakeProfile, a miss's from forcedMissProfile) and the play
 * shows how it went. `rand` only picks between the plays a profile allows — the direction is never rolled.
 */
export function planRimPlay(rim: Vector3, toShooter: Vector3, miss: MissProfile, made: boolean, rand = Math.random): RimPlay {
  const { back, side } = rimFrame(toShooter);
  const P = (d: number, s: number, h: number): Vector3 => rim.add(back.scale(d)).add(side.scale(s)).add(new Vector3(0, h, 0));
  const K = (t: number, p: Vector3, lift = 0): RimKey => ({ t, p, lift });
  const T = (t: number, on: 'iron' | 'glass', strength01: number): RimTouch => ({ t, on, strength01 });
  const depth = miss.depthError, lat = miss.lateralError;
  const radial = Math.hypot(depth, lat);
  const speed = Math.max(1.5, Math.abs(miss.descentSpeed));
  const lateralDominant = Math.abs(lat) > Math.abs(depth);
  const sgnS = lat >= 0 ? 1 : -1;
  const sgnD = depth < 0 ? 1 : -1;   // short → the FRONT lip (+back), long → the back iron
  const s = Math.max(-1, Math.min(1, lat / SWISH_WINDOW)) * INNER * 0.5;   // the lateral error, as a place on the ring
  const mk = (kind: RimPlayKind, arrive: Vector3, keys: RimKey[], touches: RimTouch[], exitVel: Vector3, hit: RimHitKind): RimPlay =>
    ({ kind, made, label: RIM_PLAY_LABEL[kind], arrive, keys, touches, duration: keys.length ? keys[keys.length - 1].t : 0, exitVel, hit });
  const still = new Vector3(0, -speed * 0.6, 0);

  if (made) {
    if (radial <= SWISH_WINDOW * 0.55) return mk('swish', rim.clone(), [], [], still, 'swish');
    const flat = speed >= 7.5;
    let kind: RimPlayKind;
    if (lateralDominant) kind = rand() < 0.45 ? 'roll_around_in' : 'roll_in';
    else if (depth > 0) kind = rand() < (flat ? 0.7 : 0.5) ? 'rattle_in' : 'back_iron_in';
    else kind = rand() < (flat ? 0.55 : 0.3) ? 'rattle_in' : 'roll_in';
    switch (kind) {
      case 'roll_in':
        return mk('roll_in', P(sgnD * RIM_RADIUS * 0.95, s * 0.6, ON_LIP_Y),
          [K(0, P(sgnD * RIM_RADIUS * 0.95, s * 0.6, ON_LIP_Y), 0.02), K(0.11, P(sgnD * INNER * 0.5, s * 0.3, -0.02)), K(0.24, P(0, 0, THROUGH_Y))],
          [T(0, 'iron', 0.35)], still, 'in_and_out');
      case 'rattle_in':
        return mk('rattle_in', P(-INNER * 0.95, s * 0.5, 0.02),
          [K(0, P(-INNER * 0.95, s * 0.5, 0.02), 0.12), K(0.14, P(INNER * 0.85, -s * 0.3, 0.05), 0.07), K(0.27, P(-INNER * 0.5, s * 0.4, 0.02), 0.03), K(0.38, P(INNER * 0.2, 0, -0.02)), K(0.5, P(0, 0, THROUGH_Y))],
          [T(0, 'iron', 0.6), T(0.14, 'iron', 0.45), T(0.27, 'iron', 0.3)], still, 'back');
      case 'back_iron_in':
        return mk('back_iron_in', P(-RIM_RADIUS * 0.9, s * 0.5, ON_LIP_Y),
          [K(0, P(-RIM_RADIUS * 0.9, s * 0.5, ON_LIP_Y), 0.1), K(0.2, P(-INNER * 0.3, s * 0.25, 0.24)), K(0.36, P(0, 0, 0.02)), K(0.46, P(0, 0, THROUGH_Y))],
          [T(0, 'iron', 0.55)], still, 'back');
      default: {   // roll_around_in: in at the side lip, 270° around the ring, drops
        const keys: RimKey[] = []; const a0 = Math.atan2(sgnS, 0);   // start at the side it hit
        const steps = 6, sweep = Math.PI * 1.5, dur = 0.66;
        for (let i = 0; i <= steps; i++) {
          const u = i / steps, a = a0 + sweep * u * (depth < 0 ? -1 : 1);   // roll toward the back when short, toward the front when long
          keys.push(K(dur * u, P(Math.cos(a) * INNER * 0.9, Math.sin(a) * INNER * 0.9, 0.06 - 0.09 * u)));
        }
        keys.push(K(dur + 0.14, P(0, 0, THROUGH_Y)));
        return mk('roll_around_in', P(0, sgnS * RIM_RADIUS * 0.92, ON_LIP_Y), keys, [T(0, 'iron', 0.4), T(0.3, 'iron', 0.2)], still, sgnS > 0 ? 'right' : 'left');
      }
    }
  }

  // ── the misses ──
  if (radial >= AIRBALL_DISTANCE) {
    // never reaches the iron: the flight ends short of the ring and the ball falls on past it
    const arrive = P(Math.max(0.55, -depth), Math.max(-1.6, Math.min(1.6, lat * 1.4)), -0.12);
    return mk('airball', arrive, [], [], back.scale(-2.2).add(new Vector3(0, -4.2, 0)), 'front');
  }
  const off = resolveRim(rim, toShooter, miss);   // the readable deflection (short comes back, long runs away)
  if (depth > 0.3 && Math.abs(lat) < 0.25 && rand() < 0.7) {
    // way long: off the glass, down onto the front lip, and out toward the shooter
    const glass = P(GLASS_D, s * 1.2, 0.3);
    const exit = back.scale(speed * 0.4).add(side.scale(sgnS * 0.8)).add(new Vector3(0, speed * 0.45, 0));
    return mk('glass_out', glass, [K(0, glass, 0), K(0.13, P(RIM_RADIUS * 0.5, s * 0.8, ON_LIP_Y))], [T(0, 'glass', 0.6), T(0.13, 'iron', 0.5)], exit, 'backboard');
  }
  if (depth > 0.12 && speed >= 7 && rand() < 0.6) {
    // long and flat: the back iron kicks it HIGH
    const arrive = P(-RIM_RADIUS, s, ON_LIP_Y);
    const exit = back.scale(-speed * 0.3).add(side.scale(sgnS * 0.3)).add(new Vector3(0, speed * 0.95, 0));
    return mk('back_iron_high', arrive, [], [T(0, 'iron', 0.8)], exit, 'back');
  }
  if (radial <= SWISH_WINDOW + 0.1) {
    // the near miss: it LOOKED in
    if (lateralDominant && rand() < 0.55) {
      // rolls around the ring and off the far side
      const keys: RimKey[] = []; const a0 = Math.atan2(sgnS, 0);
      const steps = 5, sweep = Math.PI * 1.15, dur = 0.5, dir = depth < 0 ? -1 : 1;
      for (let i = 0; i <= steps; i++) {
        const u = i / steps, a = a0 + sweep * u * dir;
        keys.push(K(dur * u, P(Math.cos(a) * INNER * 1.05, Math.sin(a) * INNER * 1.05, 0.06 + 0.06 * u)));
      }
      const aEnd = a0 + sweep * dir;
      const radialOut = back.scale(Math.cos(aEnd)).add(side.scale(Math.sin(aEnd)));
      const tangent = back.scale(-Math.sin(aEnd) * dir).add(side.scale(Math.cos(aEnd) * dir));
      const exit = radialOut.scale(1.1).add(tangent.scale(1.2)).add(new Vector3(0, 0.25, 0));
      return mk('roll_off', P(0, sgnS * RIM_RADIUS * 0.92, ON_LIP_Y), keys, [T(0, 'iron', 0.4), T(0.25, 'iron', 0.2)], exit, sgnS > 0 ? 'right' : 'left');
    }
    if (rand() < 0.55) {
      // in… and out: off the inside of the back iron, up, and back out over the front lip toward the shooter
      const arrive = P(-INNER * 0.8, s * 0.8, 0);
      const exit = back.scale(1.7).add(side.scale(sgnS * 1.2)).add(new Vector3(0, 1.6, 0));
      return mk('in_and_out', arrive, [K(0, arrive, 0.06), K(0.12, P(INNER * 0.2, s * 0.5, 0.16), 0.02), K(0.24, P(RIM_RADIUS * 1.05, s * 0.4, 0.12))], [T(0, 'iron', 0.5), T(0.24, 'iron', 0.4)], exit, off.kind);
    }
  }
  // the plain iron: the flight ends ON the contact RimPhysics named and the ball leaves with its deflection
  const kind: RimPlayKind = off.kind === 'front' ? 'front_iron' : off.kind === 'back' ? 'back_iron' : 'side_iron';
  const arrive = off.contact.add(new Vector3(0, ON_LIP_Y, 0));
  const play = mk(kind, arrive, [], [T(0, 'iron', Math.min(1, speed / 9))], off.outVel, off.kind);
  if (kind === 'side_iron') play.label = off.label;
  return play;
}

/** Sample the dwell at `t` seconds from arrival into `out` (keys are absolute; a leg bows by its start key's lift). */
export function sampleRimPlay(play: RimPlay, t: number, out: Vector3): void {
  const keys = play.keys;
  if (!keys.length) { out.copyFrom(play.arrive); return; }
  if (t <= keys[0].t) { out.copyFrom(keys[0].p); return; }
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (t > b.t) continue;
    const u = (t - a.t) / Math.max(1e-4, b.t - a.t);
    out.set(a.p.x + (b.p.x - a.p.x) * u, a.p.y + (b.p.y - a.p.y) * u + Math.sin(u * Math.PI) * a.lift, a.p.z + (b.p.z - a.p.z) * u);
    return;
  }
  out.copyFrom(keys[keys.length - 1].p);
}

/** The banner suffix for a make: " — RATTLES IN" or nothing for a swish. */
export function rimPlaySuffix(play: RimPlay | null | undefined): string {
  return play && play.label ? ` — ${play.label}` : '';
}
