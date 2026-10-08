/**
 * PROGRAM-LIBRARY-SEED — flag-off seed data for the coach-store program library.
 *
 * Source: 14 of Elijah's YouTube videos (3 timestamped drill lists, 11 video-level entries with no timestamps).
 * Full source: `~/Claude/inbox/program-library-seed/YOUTUBE-CATALOG.md` and `youtube-meta/<videoId>.json` (outside
 * the repo, not readable in CI). This module's counts are parsed from the checked-in trimmed fixtures in
 * `lib/coach-store/fixtures/youtube-catalog/` via `parseProgramLibrarySource.ts`, not hardcoded.
 *
 * Gated behind `isCoachStoreEnabled()` (lib/flags.ts, `COACH_STORE_ENABLED`, default off) — the same flag the rest
 * of the coach store ships behind. With the flag unset, `getProgramLibrarySeed()` returns an empty array: nothing
 * new is visible or returned anywhere. No parallel flag was added.
 *
 * Reuses the coach-store conventions already in this directory rather than inventing new ones: price fields are
 * `null` (manifest.ts's `priceOk`/money.ts price handling is untouched — this seed sells nothing yet), and
 * `videoTitle`/`videoId` are plain strings as `lib/coach/catalogue.ts`'s `videoUrl` field is for its own
 * (Prisma-backed, unrelated) ProgramExercise catalogue. There is no existing type for "a drill timestamped inside a
 * source video" anywhere in the coach/coach-store code (searched `lib/coach-store`, `lib/coach`,
 * `lib/store/coachListing.ts`, `lib/assess/program.ts`, `lib/stream/program-guide.ts`) — `dunkProgram.ts`'s
 * `DunkDrill`/`DunkWeek` are a hand-authored 8-week program shape (id/name/cue/adultOnly), not a video+timestamp
 * catalog, so new types are declared here rather than forced into that shape. See
 * ~/Claude/_observe/PROGRAM-SEED-STRUCTURE.txt for the full search notes.
 */
import { isCoachStoreEnabled } from '@/lib/flags';
import { parseProgramLibrarySource, type ParsedDrill, type ParsedVideoEntry } from './parseProgramLibrarySource';

export interface ProgramLibraryDrill {
  name: string;
  videoId: string;
  videoTitle: string;
  startTimestamp: string;
  /** null when no end timestamp is known. Never guessed. */
  endTimestamp: string | null;
}

export interface ProgramLibraryVideoEntry {
  videoId: string;
  videoTitle: string;
  /** Timestamped drills found in this video's description/chapters. Empty for video-level entries. */
  drills: ProgramLibraryDrill[];
  /** Always null in this seed. No pricing has been set for any of these yet. */
  priceCents: null;
}

function toEntry(parsed: ParsedVideoEntry): ProgramLibraryVideoEntry {
  const toDrill = (d: ParsedDrill): ProgramLibraryDrill => ({
    name: d.name,
    videoId: d.videoId,
    videoTitle: d.videoTitle,
    startTimestamp: d.startTimestamp,
    endTimestamp: d.endTimestamp,
  });
  return {
    videoId: parsed.videoId,
    videoTitle: parsed.videoTitle,
    drills: parsed.drills.map(toDrill),
    priceCents: null,
  };
}

/** The full 14-video seed, independent of the flag. Use `getProgramLibrarySeed()` for the flag-gated read path. */
export const PROGRAM_LIBRARY_SEED: ProgramLibraryVideoEntry[] = parseProgramLibrarySource().map(toEntry);

/**
 * Flag-gated read path. Returns `[]` when `COACH_STORE_ENABLED` is off (default), so nothing new is visible or
 * returned anywhere until the coach store itself is turned on.
 */
export function getProgramLibrarySeed(): ProgramLibraryVideoEntry[] {
  return isCoachStoreEnabled() ? PROGRAM_LIBRARY_SEED : [];
}

/** Flattened list of every timestamped drill across all videos, flag-gated the same way. */
export function getProgramLibraryDrills(): ProgramLibraryDrill[] {
  return getProgramLibrarySeed().flatMap((entry) => entry.drills);
}
