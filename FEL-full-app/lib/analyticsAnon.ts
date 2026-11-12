// Which analytics rows are stored with no user and no guest id (perf-lag lane, 2026-10-24).
//
// The owner approved anonymous perf stats (2026-10-20, feel brief): real phones send their frame rate and their time to first
// playable per mode to `game_diag` "with no personal data". The analytics route attaches the signed-in user's id (or the guest
// cookie) and the page's random sessionKey to every row; for these two diag kinds it attaches none of them (a sessionKey would
// join the row back to the same page's signed-in rows). The payload itself carries only the device CLASS (perfStats.ts).

/** game_diag kinds that are stored anonymously. */
export const ANONYMOUS_DIAG_KINDS: ReadonlySet<string> = new Set(['fps', 'ttfp']);

/**
 * BINJGB-SHELF-1 (Cyber G9, review 067e0dce): the Homebrew Shelf's events are stored anonymously too — a per-user game
 * history isn't needed. Their payloads are a shelf slug or { source: 'local' } only.
 */
export const ANONYMOUS_EVENT_NAMES: ReadonlySet<string> = new Set(['homebrew_shelf_play', 'homebrew_local_play']);

/** Pure: is this event stored with no user or guest id? */
export function isAnonymousEvent(name: string, props: unknown): boolean {
  if (ANONYMOUS_EVENT_NAMES.has(name)) return true;
  if (name !== 'game_diag' || !props || typeof props !== 'object') return false;
  const kind = (props as { kind?: unknown }).kind;
  return typeof kind === 'string' && ANONYMOUS_DIAG_KINDS.has(kind);
}
