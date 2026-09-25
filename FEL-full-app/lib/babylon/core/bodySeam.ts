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
    card: { modeId: def.modeId, key: profile.key, lines: cardLines(profile), drives, later: profile.later },
  };
}
