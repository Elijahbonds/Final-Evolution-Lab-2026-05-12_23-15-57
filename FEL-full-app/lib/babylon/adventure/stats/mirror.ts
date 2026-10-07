/**
 * The Mirror hook (ADVENTURE PLAN A3, pillar 7, 2026-10-06): real moves in front of the camera charge the special
 * faster and give training XP. Optional, never required, off by default.
 *
 * THE SEAM. The camera, the pose model and the fight read already exist (lib/pose/BodyReader + lib/pose/fightReader;
 * ModeHarness hands a mode the events it claims through `onBody`). This file never opens a camera: it only turns an
 * event the harness delivered into a `mirror:move` on the Adventure's bus. `mirrorOnBody` is what AdventureMode.onBody
 * calls; it returns false when the Mirror setting is off or the event is not a move, so the harness does not count it
 * as input the game received (ModeHarness P7).
 *
 * THE CAPS (MirrorLedger, used by the stats system):
 *   - a counted move at most every MIRROR_MIN_GAP_SEC (a flail is not five punches);
 *   - its special charge comes out of a bucket that refills at SPECIAL_PLAY_REF_PER_SEC, so over any stretch the Mirror
 *     adds at most what play adds: play + Mirror is at most twice as fast as play alone;
 *   - per session, at most MIRROR_SPECIAL_SESSION_CAP specials and MIRROR_XP_SESSION_CAP training XP.
 *
 * OWNER RULES. Mirror output is estimated engagement, never a measurement, and it never writes PRQ: what it trains is
 * the Adventure's own `training` in the save. Everything it charges also charges from normal play (stats/regen.ts).
 *
 * Pure (a type-only import of the body events).
 */
import type { BodyEvent } from '@/lib/pose/BodyReader';
import type { PrqAttr } from '@/lib/prq';
import type { ActorId, AdventureBus, MirrorMove } from '../contracts';
import { SPECIAL_PLAY_REF_PER_SEC } from './regen';

// ── Tuning [TUNE] ────────────────────────────────────────────────────────────────────────────────────────────────

/** Special charge per counted move at quality 1. */
export const MIRROR_SPECIAL_PER_MOVE = 0.035;
/** The bucket the Mirror's special charge comes from: refills at the play reference rate, holds this much. */
export const MIRROR_SPECIAL_RATE_PER_SEC = SPECIAL_PLAY_REF_PER_SEC;
export const MIRROR_SPECIAL_BURST = 0.08;
/** Per session: at most this many full specials from the Mirror. */
export const MIRROR_SPECIAL_SESSION_CAP = 3;
/** Training XP per counted move at quality 1 (a counted move always gives at least 1). */
export const MIRROR_XP_PER_MOVE = 4;
/** Per session: at most this much training XP from the Mirror. */
export const MIRROR_XP_SESSION_CAP = 300;
/** Counted moves are at least this far apart (seconds of sim time). */
export const MIRROR_MIN_GAP_SEC = 0.2;
/** A move read below this quality is not counted. */
export const MIRROR_MIN_QUALITY = 0.1;

/** The body events the Adventure claims (AdventureMode's `body.claims`): the fight read, a squat and a jump. */
export const MIRROR_CLAIMS = ['blow', 'legKick', 'guard', 'evade', 'dip', 'land'] as const;

/** Which attributes a Mirror move trains. */
export const MIRROR_ATTRS: Readonly<Record<MirrorMove['kind'], readonly PrqAttr[]>> = {
  punch: ['strength', 'power'],
  kick: ['power', 'flexibility'],
  guard: ['mental', 'endurance'],
  slip: ['agility', 'mental'],
  squat: ['strength', 'endurance'],
  jump: ['power', 'agility'],
  pose: ['flexibility', 'mental'],
};

const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

/**
 * A body event as a Mirror move, or null when it is not one. Quality is a rough 0..1 from the read's own numbers
 * (speed, size, depth, height) — an estimate of effort, labelled as such, never a score of technique.
 */
export function mirrorMoveOf(ev: BodyEvent): MirrorMove | null {
  switch (ev.kind) {
    // a fist confirmed at ~2 m/s (fightReader CONFIRM_V); a sharp punch is 5–6
    case 'blow': return { kind: 'punch', quality01: clamp01(0.2 + (ev.speed - 2) / 4) };
    case 'legKick': return { kind: 'kick', quality01: clamp01(0.3 + (ev.speed - 2) / 5 + (ev.heightM > 1 ? 0.15 : 0)) };
    // raising the guard (or a push off it) is a move; lowering it is not
    case 'guard': return ev.up && (ev.raise || ev.push) ? { kind: 'guard', quality01: ev.push ? 0.8 : 0.6 } : null;
    case 'evade': return { kind: 'slip', quality01: clamp01(0.3 + ev.sizeM / 0.2) };
    case 'dip': return { kind: 'squat', quality01: clamp01(ev.depthM / 0.35) };
    case 'land': return { kind: 'jump', quality01: clamp01(ev.heightM / 0.4) };
    default: return null;
  }
}

export interface MirrorHookOptions {
  bus: AdventureBus;
  /** The local player's actor id. */
  actorId: ActorId;
  /** The save's `settings.mirror`, read live. Off = no effect at all. */
  enabled: () => boolean;
}

/**
 * AdventureMode.onBody's body: a claimed body event becomes a `mirror:move` for the stats system. Returns false (not
 * counted as input) when the Mirror is off or the event is not a move.
 */
export function mirrorOnBody(ev: BodyEvent, o: MirrorHookOptions): boolean {
  if (!o.enabled()) return false;
  const move = mirrorMoveOf(ev);
  if (!move || move.quality01 < MIRROR_MIN_QUALITY) return false;
  o.bus.emit('mirror:move', { ...move, actorId: o.actorId });
  return true;
}

/** What one counted Mirror move earns. */
export interface MirrorCredit { special: number; xp: number; attrs: readonly PrqAttr[] }

/**
 * One Mirror session's books: the rate bucket and the session caps. The stats system holds one per player and asks it
 * what each `mirror:move` is worth. Allocation: one small object per counted move (an event, not a frame).
 */
export class MirrorLedger {
  specialGiven = 0;
  xpGiven = 0;
  counted = 0;
  private bucket = MIRROR_SPECIAL_BURST;
  private lastT = Number.NaN;
  private lastMoveT = -Infinity;

  /** The move's credit at sim time `tSec`, or null when it does not count (too soon, too weak). */
  credit(move: Pick<MirrorMove, 'kind' | 'quality01'>, tSec: number): MirrorCredit | null {
    const q = clamp01(move.quality01);
    if (q < MIRROR_MIN_QUALITY || !MIRROR_ATTRS[move.kind]) return null;
    if (tSec - this.lastMoveT < MIRROR_MIN_GAP_SEC) return null;
    if (Number.isFinite(this.lastT) && tSec > this.lastT) {
      this.bucket = Math.min(MIRROR_SPECIAL_BURST, this.bucket + (tSec - this.lastT) * MIRROR_SPECIAL_RATE_PER_SEC);
    }
    this.lastT = tSec;
    this.lastMoveT = tSec;
    const special = Math.max(0, Math.min(q * MIRROR_SPECIAL_PER_MOVE, this.bucket, MIRROR_SPECIAL_SESSION_CAP - this.specialGiven));
    this.bucket -= special;
    this.specialGiven += special;
    const xp = Math.max(0, Math.min(Math.max(1, Math.round(q * MIRROR_XP_PER_MOVE)), MIRROR_XP_SESSION_CAP - this.xpGiven));
    this.xpGiven += xp;
    this.counted++;
    return { special, xp, attrs: MIRROR_ATTRS[move.kind] };
  }

  /** A new session (a new mount of the mode). */
  reset(): void {
    this.specialGiven = 0; this.xpGiven = 0; this.counted = 0;
    this.bucket = MIRROR_SPECIAL_BURST; this.lastT = Number.NaN; this.lastMoveT = -Infinity;
  }
}
