// lib/binjgb/manifest.ts — BINJGB-SHELF-1: the shelf's titles. EMPTY in v1 (OQ-10 answered, Elijah 1:54 PM PT Nov 9 2026:
// "Shelf: build the binjgb player switched off, with no bundled games for now.").
//
// Any future title needs a NEW card from Elijah plus a Cyber review, which re-opens licence proof, hash pins and content
// checks (former G4). Until then: no entries, no game files, no licence folders, no cart hashes. T-SHELF-ZERO-TITLES and
// T-NO-GAME-FILES pin this.

export interface ShelfTitle {
  readonly slug: string;
  readonly title: string;
}

export const SHELF_TITLES: readonly ShelfTitle[] = [];

/** The shipped title with this slug, or null (always null in v1). */
export function shelfTitle(slug: string, titles: readonly ShelfTitle[] = SHELF_TITLES): ShelfTitle | null {
  return titles.find((t) => t.slug === slug) ?? null;
}
