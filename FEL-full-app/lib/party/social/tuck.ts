// lib/party/social/tuck.ts — where the party bar may sit right now (PARTY-CHAT lane, 2026-10-13). Pure.
//
// Owner, 2026-10-09: "floating party bar (avatars, speaking, mute) on every page and over games; … tucks into the pause
// menu when it would cover the HUD (nothing on the play screen but the HUD)". So:
//   PLAYING / COUNTDOWN  hidden: the play screen is the HUD and nothing else. Voice carries on underneath.
//   PAUSED / ENDED       tucked: a compact strip at the top of the pause menu or the results, where nothing is in play.
//   anything else        the floating bar (menus, pages, a game's loading and READY card).
// The Quick Screen draws nothing of the party at all (it shows nothing before the age question; lib/screen/routes.ts).
import type { ModePhase } from '@/lib/babylon/core/ModeHarness';

export type DockPlace = 'hidden' | 'bar' | 'tucked';

export function dockPlace(phase: ModePhase | null, quickScreen: boolean, showing: boolean): DockPlace {
  if (quickScreen || !showing) return 'hidden';
  if (phase === 'playing' || phase === 'countdown') return 'hidden';
  if (phase === 'paused' || phase === 'ended') return 'tucked';
  return 'bar';
}
