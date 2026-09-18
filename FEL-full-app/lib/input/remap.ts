// REMAP — rebind any action, per controller (2026-09-13).
//
// Mission Phase A.7. Two reasons this exists beyond preference:
//   · a pad we do NOT recognise falls back to the published standard layout, which is the best available
//     guess and is sometimes wrong. Without a remap, that player's only option is a different controller.
//   · left-handed players, players using one hand, and players with a controller whose face buttons are
//     worn out all have a real reason to move a binding, and none of them should have to be anticipated by
//     a profile.
//
// Stored PER PROFILE, not globally: a remap made for an unrecognised arcade stick must not follow the
// player onto their DualSense, because those are different physical objects with different problems.
//
// Pure except for the two storage calls at the bottom.

import type { CanonicalPad, PadButton } from './profiles';

/** A remap is canonical → canonical: "when the pad says X, tell the game Y". */
export type Remap = Partial<Record<PadButton, PadButton>>;

export const REMAP_KEY_PREFIX = 'fel-remap-';

/** Buttons a player may rebind. Deliberately excludes nothing — START included, because a broken START
 *  button on a borrowed pad is exactly the case this feature is for. */
export const REMAPPABLE: readonly PadButton[] = ['A', 'B', 'X', 'Y', 'L1', 'R1', 'SELECT', 'START', 'LS', 'RS'];

/**
 * Apply a remap to a canonical read.
 *
 * Built as a fresh record rather than mutated, and every target is resolved from the ORIGINAL state — so
 * swapping A and B works (a sequential rewrite would set A from B, then B from the already-overwritten A,
 * and both would end up the same). That is the classic remap bug and it is why this reads from a snapshot.
 */
export function applyRemap(pad: CanonicalPad, remap: Remap | null): CanonicalPad {
  if (!remap || Object.keys(remap).length === 0) return pad;
  const src = pad.buttons;
  const out: Record<PadButton, boolean> = { ...src };
  for (const from of REMAPPABLE) {
    const to = remap[from];
    if (!to) continue;
    out[to] = src[from];
  }
  // any canonical button that nothing maps ONTO and that was itself remapped away is now unpressed
  for (const from of REMAPPABLE) {
    if (remap[from] && !REMAPPABLE.some((k) => remap[k] === from)) out[from] = false;
  }
  return { ...pad, buttons: out };
}

/** Is this a sane remap? A binding onto a button nobody can press is a soft lock. */
export function validRemap(remap: Remap): boolean {
  const targets = Object.values(remap).filter(Boolean) as PadButton[];
  if (targets.some((t) => !REMAPPABLE.includes(t))) return false;
  return new Set(targets).size === targets.length;     // two physical buttons onto one action is confusing, not clever
}

export function readRemap(profileId: string): Remap | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(REMAP_KEY_PREFIX + profileId);
    if (!raw) return null;
    const v = JSON.parse(raw) as Remap;
    const clean: Remap = {};
    for (const k of REMAPPABLE) {
      const t = v?.[k];
      if (t && REMAPPABLE.includes(t)) clean[k] = t;
    }
    return validRemap(clean) && Object.keys(clean).length ? clean : null;
  } catch { return null; }
}

export function writeRemap(profileId: string, remap: Remap): void {
  try { window.localStorage.setItem(REMAP_KEY_PREFIX + profileId, JSON.stringify(remap)); } catch { /* convenience only */ }
}

export function clearRemap(profileId: string): void {
  try { window.localStorage.removeItem(REMAP_KEY_PREFIX + profileId); } catch { /* already default */ }
}

// ── Rumble ─────────────────────────────────────────────────────────────────
/**
 * Rumble, behind a capability check, and NEVER load-bearing.
 *
 * Chrome supports vibrationActuator; Safari does not. The mission's word is "optional" and the rule that
 * follows from it is that nothing may ever depend on this having happened — so it returns a boolean nobody
 * has to read and swallows every failure.
 */
export function canRumble(pad: unknown): boolean {
  return !!(pad as { vibrationActuator?: unknown } | null)?.vibrationActuator;
}

export function rumble(pad: unknown, strength = 0.5, ms = 120): boolean {
  const act = (pad as { vibrationActuator?: { playEffect(t: string, o: object): Promise<unknown> } } | null)?.vibrationActuator;
  if (!act) return false;
  try {
    void act.playEffect('dual-rumble', {
      duration: Math.max(0, Math.min(1000, ms)),
      strongMagnitude: Math.max(0, Math.min(1, strength)),
      weakMagnitude: Math.max(0, Math.min(1, strength * 0.6)),
    })?.catch?.(() => {});
    return true;
  } catch { return false; }
}
