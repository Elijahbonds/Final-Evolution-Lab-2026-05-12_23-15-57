// CHALLENGES-2: where a GUEST plays a challenge (owner, 2026-10-22: "play first; a guest plays, and signs up only to save").
//
// /play/* is signed-in only (lib/screen/config.ts SIGNED_IN_ONLY_ROUTES), so a guest plays on a public route:
//   · Flight Night: /try?c=<code>, the guest dunk that already settles a challenge (components/games/guest-dunk-shell.tsx).
//   · the modes in GUEST_HOST_MODES: /c/<code>/play, which asks the year first (the /try rule) and mounts the mode's own
//     Babylon host with no GameShell, the way /try mounts the dunk (components/challenges/guest-challenge-run.tsx).
//   · any other mode: no guest path yet (null): the invite offers sign-up to play. assumption: a mode joins the list once
//     its host is checked to run with no session on the phone rig; Downtown is the first.
// Pure and client-safe.

import { canonicalModeKey } from '@/lib/game-data';

/** Modes /c/<code>/play hosts for a guest (beyond Flight Night, which /try hosts). */
export const GUEST_HOST_MODES: readonly string[] = ['threePoint'];

export function guestPlayHref(modeKey: string, code: string): string | null {
  const key = canonicalModeKey(modeKey);
  const c = encodeURIComponent(code);
  if (key === 'dunkContest') return `/try?c=${c}`;
  if (GUEST_HOST_MODES.includes(key)) return `/c/${c}/play`;
  return null;
}
