// lib/binjgb/analyticsProps.ts — BINJGB-SHELF-1 F5 (Cyber build review dcbbec16): server-side normalisation of the two
// Homebrew Shelf events before /api/analytics stores them. Both are stored with no user id (lib/analyticsAnon.ts), so a
// hand-crafted POST must not be able to park arbitrary data under their names — a file name, a content hash, anything.
// The props are REBUILT from an allowlist, never copied:
//   homebrew_local_play → exactly { source: 'local' }, whatever was posted;
//   homebrew_shelf_play → { slug } only when the slug is a shipped title (shelfTitle), else the event is dropped.
// Every other event passes through unchanged.
import { SHELF_TITLES, shelfTitle, type ShelfTitle } from './manifest';

export const HOMEBREW_EVENT_NAMES = ['homebrew_shelf_play', 'homebrew_local_play'] as const;

export type NormalisedEvent = { keep: true; props: Record<string, unknown> | null } | { keep: false };

export function normaliseHomebrewEvent(
  name: string,
  props: Record<string, unknown> | null | undefined,
  titles: readonly ShelfTitle[] = SHELF_TITLES,
): NormalisedEvent {
  if (name === 'homebrew_local_play') return { keep: true, props: { source: 'local' } };
  if (name === 'homebrew_shelf_play') {
    const slug = props && typeof props === 'object' ? (props as { slug?: unknown }).slug : undefined;
    const title = typeof slug === 'string' ? shelfTitle(slug, titles) : null;
    return title ? { keep: true, props: { slug: title.slug } } : { keep: false };
  }
  return { keep: true, props: props ?? null };
}
