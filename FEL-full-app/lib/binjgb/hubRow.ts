// lib/binjgb/hubRow.ts — BINJGB-SHELF-1: should /play show the quiet "Homebrew Shelf" row (OQ-8)? Server-side only.
// Flag on AND at least one shipped title AND 13+. v1 ships zero titles, so this answers false before any read
// (T-SHELF-EMPTY-ROW, T-NAV-ROW-OFF, T-U13). Not a mode, not a family, not the mode menu (T-NAV-NOT-MODE).
import { isBinjgbShelfEnabled } from '@/lib/flags';
import { prisma } from '@/lib/db';
import { readDobYear } from '@/lib/privacy/scanSaveGate';
import { SHELF_TITLES } from './manifest';
import { homebrewRowVisible } from './gate';

export interface HubRowDeps {
  shelfOn: () => boolean;
  titleCount: number;
  readDob: (userId: string) => Promise<number | null>;
}

const DEFAULT_DEPS: HubRowDeps = {
  shelfOn: isBinjgbShelfEnabled,
  titleCount: SHELF_TITLES.length,
  readDob: (userId) => readDobYear(prisma, userId, 'gb_shelf_row'),
};

export async function homebrewRowFor(userId: string | null | undefined, deps: HubRowDeps = DEFAULT_DEPS): Promise<boolean> {
  if (!deps.shelfOn() || deps.titleCount <= 0 || !userId) return false;
  return homebrewRowVisible(true, deps.titleCount, await deps.readDob(userId));
}
