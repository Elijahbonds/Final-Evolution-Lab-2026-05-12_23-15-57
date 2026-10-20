// bodySeam — what a running mode's body play is built from, decided in one place (movement play P3, 2026-09-24).
//
// The harness (runMode) and the gate's replay (lib/pose/seamReplay) both chain the same four things for a mode:
//   profile   its row in lib/input/bodyProfiles (by def.modeId, the four aliases included), minus what the mode claims
//             for its own onBody — what the floor may press there;
//   drives    whether the body plays this mode at all: the row binds a move, or the mode reads the body itself
//             (onBody). The ONLY thing that lets losing the body pause the game (P3 Z5);
//   floor     the profile's presses (lib/input/bodyFloor) — nothing ever, on a session-only row (Z3);
//   session   START / pause / release on the body (BodySession), armed for a lost pause only where `drives`.
//
// MOVEMENT PLAY P3 (2026-09-24, the step-3 review): runMode used to build these inline, and the gate's replay built its
// own from a profile it was handed — so nothing held the HARNESS to the table. Every mode on skateboard's row (the body
// pressing POP in a quiz), or `drives` always true (a dunk paused for a pad player's body walking off), passed every
// test. Built here, once, pure: bodySeam.test holds it to every row, runMode and seamReplay both call it, and the seam
// scan pins that runMode builds none of it by hand.
// Pure: no DOM, no Babylon.
import type { ModeDefinition } from './ModeHarness';
import { resolveBodyProfile, cardLines, type BodyClaim, type BodyProfile } from '@/lib/input/bodyProfiles';
import { BodyFloor } from '@/lib/input/bodyFloor';
import { BodySession } from './BodySession';
import { EvidenceCounter, type SessionView } from './sessionStore';
import { BODY_FIGHT } from '../combat/bodyFightFlags';
import { isAdult18, isVerifiedAdultStrict, parseBirthDate } from '@/lib/age/ageRules';
import { bodyPlayDob } from '@/lib/move/bodyPlayGrownUp';

export interface BodySeam {
  /** The mode's row, minus its claims. */
  profile: BodyProfile;
  /** The moves (event kinds and channels) the mode takes for its own onBody. */
  claimed: ReadonlySet<BodyClaim>;
  /** The body plays this mode: a binding, or an onBody. */
  drives: boolean;
  overheadIsPlay: boolean;
  floor: BodyFloor;
  session: BodySession;
  /** The run's "input the game received" (owner call 4): reset at every wake. */
  evidence: EvidenceCounter;
  /** What the Body card shows for this mode (sessionStore.mount). */
  card: Pick<SessionView, 'modeId' | 'key' | 'lines' | 'drives' | 'later'>;
}

/** The body drives a mode where the floor presses something, or the mode reads the body itself. */
export function bodyDrives(profile: BodyProfile, hasOnBody: boolean): boolean {
  return profile.bindings.length > 0 || hasOnBody;
}

/** A mode's body seam, fresh: one per mount (the floor, the session and the evidence all keep state). */
export function bodySeamFor(def: Pick<ModeDefinition, 'modeId' | 'body' | 'onBody'>): BodySeam {
  const profile = resolveBodyProfile(def);
  const claimed = new Set<BodyClaim>(def.body?.claims ?? []);
  const drives = bodyDrives(profile, !!def.onBody);
  const overheadIsPlay = def.body?.overheadIsPlay ?? (profile.overheadIsPlay || claimed.has('overhead'));
  return {
    profile, claimed, drives, overheadIsPlay,
    floor: new BodyFloor(profile),
    session: new BodySession({ drives, overheadIsPlay }),
    evidence: new EvidenceCounter(),
    // MOVEMENT PLAY P7: a mode that reads the body itself says its own lines (a combat mode's strikes, guard, slip, step)
    card: { modeId: def.modeId, key: profile.key, lines: def.body?.lines ? [...def.body.lines] : cardLines(profile), drives, later: profile.later },
  };
}

// FN-BOX-1 FIGHT-BODY-AGE-GATE (2026-10-19, PM queue: Karate VS is the boxing slot). The kid rule: under 18 plays with a
// controller or a phone, never the camera. A fight mode's body path (its onBody, its claims, its P3 row's presses) is
// offered only to a player whose birth year is certainly 18+, and never in couch mode (FN-0, not built: the host says
// so with `couch`). FN-BOX-1-STRICT (owner, 2026-10-19): the year rule is the strict one, isVerifiedAdultStrict —
// more than 18 years since the birth year, so anyone born in 2008 is refused for all of 2026 (they may still be 17)
// and first plays on 2027-01-01. No birth year on file is refused: the gate fails closed. Refused, the mode runs
// as a session-only row with no plan phase, so `drives` is false, the floor presses nothing, the card has no lines and
// READY offers neither body play nor "coming" (bodyPlayChoice.bodyPlayOffer → null). Pad play is untouched.
// FN-BOX-1b (2026-10-19): with a full date of birth on file the gate is exact — ageRules.isAdult18, allowed from the 18th
// birthday on — so born 2008 plays from their birthday in 2026, not from 2027-01-01. Without one it is the strict year
// rule above, unchanged. A full date that does not match the year on file is refused (fail closed: one of them is wrong).

/** What the host knows when a fight mode mounts. A missing year is unknown, and unknown is refused. */
export interface BodyAgeGate {
  dobYear: number | null | undefined;
  /** FN-BOX-1b: the full birth date, 'YYYY-MM-DD'. null is "none on file"; absent reads the page's held date
   *  (bodyPlayGrownUp.setBodyPlayDob) in gateBodyFight. */
  dob?: string | null;
  /** Couch mode (FN-0): several players on one screen. Always refused. */
  couch: boolean;
}

/** The combat modes the body could play (bodyFightFlags' keys), by their row key. */
const FIGHT_KEYS: ReadonlySet<string> = new Set(Object.keys(BODY_FIGHT));

/** True when this player may be offered a fight mode's body path. */
export function bodyFightAllowed(gate: BodyAgeGate, now: Date = new Date()): boolean {
  if (gate.couch) return false;
  if (gate.dob == null) return isVerifiedAdultStrict(gate.dobYear, now);
  if (gate.dobYear != null && parseBirthDate(gate.dob)?.year !== gate.dobYear) return false;
  return isAdult18(gate.dob, now);
}

/** The mode's row before its claims (its own profile, or the table's). */
const rowOf = (def: Pick<ModeDefinition, 'modeId' | 'body'>): BodyProfile =>
  resolveBodyProfile({ modeId: def.modeId, body: def.body?.profile ? { profile: def.body.profile } : undefined });

/** True when `def` is a combat mode the body-fight gate covers. */
export function isBodyFightMode(def: Pick<ModeDefinition, 'modeId' | 'body'>): boolean {
  return FIGHT_KEYS.has(rowOf(def).key);
}

/**
 * The definition the harness mounts: `def` itself when it is not a fight mode or the player may use the body, otherwise
 * the same mode with no body path (no onBody, no claims, no presses, no plan phase to promise).
 */
export function gateBodyFight<D extends Pick<ModeDefinition, 'modeId' | 'body' | 'onBody'>>(def: D, gate: BodyAgeGate, now: Date = new Date()): D {
  const withDob = gate.dob === undefined ? { ...gate, dob: bodyPlayDob() } : gate;
  if (!isBodyFightMode(def) || bodyFightAllowed(withDob, now)) return def;
  return { ...def, body: { profile: { ...rowOf(def), bindings: [], later: 'L' } }, onBody: undefined };
}
