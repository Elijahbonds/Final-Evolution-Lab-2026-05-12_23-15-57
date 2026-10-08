// lib/party/playerName.ts — the name a guest types on a phone, as the TV may show it (MULTIPLAYER lane, 2026-10-06).
//
// A party name is typed by whoever picked the phone up — no account, no age, nothing checked. So it goes through the
// repo's existing name rule, the jersey name plate's (lib/closet/wearable-catalog.ts sanitizeJersey: A–Z, 0–9, space
// and hyphen, twelve characters, upper case). That rule already decides what a stranger's name may look like on a
// court, and a name on a TV in a living room should be no freer than a name on the back of a jersey.
// assumption: the jersey plate rule is "the existing name sanitiser" — the repo has no other general one.
//
// The HOST applies it too (HostSession), because the phone is not to be trusted: a modified phone page can send
// anything. The phone applies it first only so the player sees what the TV will show.

import { sanitizeJersey } from '@/lib/closet/wearable-catalog';

/** The longest name the TV draws (the jersey plate's limit). */
export const PLAYER_NAME_MAX = 12;

/** A raw typed name → what the TV shows. Empty when nothing survives (the caller picks a fallback such as "P2"). */
export function cleanPlayerName(raw: unknown): string {
  // trimmed first: the plate rule cuts to twelve before it trims, so leading spaces would cost a typed name letters
  return sanitizeJersey({ name: typeof raw === 'string' ? raw.trim() : '' }).name.replace(/\s{2,}/g, ' ');
}

const NAME_KEY = 'fel.party.name';

/** The name this phone used last time, so a returning friend joins with one tap. Never throws. */
export function recallPlayerName(): string {
  try { return cleanPlayerName(window.localStorage.getItem(NAME_KEY) ?? ''); } catch { return ''; }
}

/** Remember the (cleaned) name on this device only. Never throws. */
export function rememberPlayerName(name: string): void {
  try { window.localStorage.setItem(NAME_KEY, cleanPlayerName(name)); } catch { /* private mode: one tap more next time */ }
}
