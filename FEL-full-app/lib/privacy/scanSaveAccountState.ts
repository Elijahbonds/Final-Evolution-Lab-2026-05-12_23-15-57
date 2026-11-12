// ACCOUNT-SHIFT (2026-11-12): what /account's "Jump numbers" panel shows, read once on the server.
//
// Before this, the panel (components/privacy/scan-save-account.tsx) rendered nothing until its two requests
// (/api/account/scan-save and /api/account/scan-history) answered, then appeared at the top of /account for a verified
// adult and pushed every section below it down: a layout shift of 0.112 on a phone (budget 0.02; PR #588). The page now
// reads the same state while it renders, so the panel is in the first paint for exactly the people who see it.
//
// WHO SEES WHAT DOES NOT CHANGE. The age and opt-in half is readScanSaveStatus, the one the scan-save route answers
// with; the saved list is readSavedHistory, which the scan-history route now calls too, so the page and the routes
// cannot drift apart.

import { SAVED_NUMBER_KINDS } from './scanSaveConsent';
import { projectSavedNumber } from './numberScan';
import { readScanSaveStatus } from './scanSaveRecord';

export type SavedNumberItem = { id: string; kind: string; at: string; numbers: Record<string, string | number | null> };

export interface SavedHistory {
  /** the list is shown: a verified adult who has opted in */
  visible: boolean;
  /** rows exist, so "Delete my saved history" can be offered even when the list is hidden */
  hasSaved: boolean;
  items: SavedNumberItem[];
}

export interface ScanSaveAccountState extends SavedHistory {
  verifiedAdult: boolean;
  optedIn: boolean;
}

type HistoryDb = {
  workoutScan: {
    findMany: (args: {
      where: { userId: string; kind: { in: string[] } };
      orderBy: { createdAt: 'desc' };
      take: number;
      select: { id: true; kind: true; metrics: true; createdAt: true };
    }) => Promise<{ id: string; kind: string; metrics: unknown; createdAt: Date }[]>;
  };
};

/**
 * This person's saved numbers (dunk, Prove It, re-screen). Hidden when the opt-in is off or revoked; hasSaved stays
 * true so /account can still offer the delete. A failed read answers nothing saved and nothing shown.
 */
export async function readSavedHistory(db: unknown, userId: string, status: { verifiedAdult: boolean; optedIn: boolean }): Promise<SavedHistory> {
  try {
    const rows = await (db as HistoryDb).workoutScan.findMany({
      where: { userId, kind: { in: [...SAVED_NUMBER_KINDS] } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, kind: true, metrics: true, createdAt: true },
    });
    const items = rows.map(projectSavedNumber).filter((x): x is NonNullable<typeof x> => x != null);
    const shown = status.verifiedAdult && status.optedIn;
    return { visible: shown, hasSaved: items.length > 0, items: shown ? items : [] };
  } catch {
    return { visible: false, hasSaved: false, items: [] };
  }
}

/** Everything the panel needs, as the two routes would answer it. Never throws (both halves fail closed). */
export async function readScanSaveAccountState(db: unknown, userId: string): Promise<ScanSaveAccountState> {
  const status = await readScanSaveStatus(db, userId);
  // nobody but a verified adult sees the panel, so the list is not read for anyone else
  if (!status.verifiedAdult) return { verifiedAdult: false, optedIn: false, visible: false, hasSaved: false, items: [] };
  const history = await readSavedHistory(db, userId, status);
  return { verifiedAdult: true, optedIn: status.optedIn, ...history };
}
