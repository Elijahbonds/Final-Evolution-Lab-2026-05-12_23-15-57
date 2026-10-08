/**
 * PROGRAM-LIBRARY-SEED — parses the checked-in, trimmed YouTube catalog fixtures into the shape
 * `programLibrarySeed.ts` exposes. This is the "parse the source, don't just hardcode the counts" half: the fixture
 * JSON under `lib/coach-store/fixtures/youtube-catalog/<videoId>.json` is a trimmed copy (id, title, chapters only)
 * of `yt-dlp --dump-json` metadata for 14 of Elijah's videos. Full metadata and the source catalog live outside the
 * repo at `~/Claude/inbox/program-library-seed/` (not readable in CI); only the fields needed here were copied in.
 *
 * Three videos have real timestamped chapters (drills): J037GG99GT0 (44), q1HLjLbhS2s (25), pqyxTY85x4U (16). The
 * other 11 are video-level entries with no timestamps — their fixture's `chapters` array is empty.
 *
 * Chapter timestamps came from yt-dlp parsing each video's description (verified against
 * ~/Claude/inbox/program-library-seed/YOUTUBE-CATALOG.md — no disagreements found; see
 * ~/Claude/_observe/PROGRAM-SEED-DISAGREEMENTS.txt). yt-dlp's first chapter is always an untitled 0-to-first-drill
 * placeholder; fixtures already drop it, so every remaining chapter is a real drill.
 */
import fixture00j3HPZsPmY from './fixtures/youtube-catalog/00j3HPZsPmY.json';
import fixture3GtJ134D9s from './fixtures/youtube-catalog/3GtJ-134D9s.json';
import fixtureJ037GG99GT0 from './fixtures/youtube-catalog/J037GG99GT0.json';
import fixtureV0yX1H1OtQ8 from './fixtures/youtube-catalog/V0yX1H1OtQ8.json';
import fixturecWYFVg6GsVU from './fixtures/youtube-catalog/cWYFVg6GsVU.json';
import fixturedAoLYThf1bc from './fixtures/youtube-catalog/dAoLYThf1bc.json';
import fixturehrlGbS0r0hM from './fixtures/youtube-catalog/hrlGbS0r-hM.json';
import fixtureisjAY8Oo58g from './fixtures/youtube-catalog/isjAY8Oo58g.json';
import fixturempRZl8VNWlo from './fixtures/youtube-catalog/mpRZl8VNWlo.json';
import fixturepqyxTY85x4U from './fixtures/youtube-catalog/pqyxTY85x4U.json';
import fixtureq1HLjLbhS2s from './fixtures/youtube-catalog/q1HLjLbhS2s.json';
import fixtures4U7IsjowuE from './fixtures/youtube-catalog/s4U7IsjowuE.json';
import fixturetiHUrigssOA from './fixtures/youtube-catalog/tiHUrigssOA.json';
import fixturexVE7Gegu27w from './fixtures/youtube-catalog/xVE7Gegu27w.json';

export interface ProgramLibrarySourceChapter {
  start_time: number;
  end_time: number | null;
  title: string;
}

export interface ProgramLibrarySourceVideo {
  id: string;
  title: string;
  chapters: ProgramLibrarySourceChapter[];
}

/** All 14 trimmed fixtures, in the catalog's order. */
export const PROGRAM_LIBRARY_SOURCE: ProgramLibrarySourceVideo[] = [
  fixturehrlGbS0r0hM,
  fixturedAoLYThf1bc,
  fixtureq1HLjLbhS2s,
  fixturepqyxTY85x4U,
  fixtureJ037GG99GT0,
  fixturempRZl8VNWlo,
  fixture00j3HPZsPmY,
  fixture3GtJ134D9s,
  fixturecWYFVg6GsVU,
  fixturexVE7Gegu27w,
  fixtureV0yX1H1OtQ8,
  fixturetiHUrigssOA,
  fixtureisjAY8Oo58g,
  fixtures4U7IsjowuE,
];

/** Formats seconds as the catalog writes them: minutes unpadded, seconds zero-padded to 2 digits (e.g. "0:01", "10:03"). */
export function formatTimestamp(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export interface ParsedDrill {
  name: string;
  videoId: string;
  videoTitle: string;
  startTimestamp: string;
  endTimestamp: string | null;
}

export interface ParsedVideoEntry {
  videoId: string;
  videoTitle: string;
  /** Empty for the 11 video-level (no-drill-timestamp) entries. */
  drills: ParsedDrill[];
}

/** Parses every fixture's chapters into drills. This is the source of truth the tests cross-check counts against. */
export function parseProgramLibrarySource(
  source: ProgramLibrarySourceVideo[] = PROGRAM_LIBRARY_SOURCE,
): ParsedVideoEntry[] {
  return source.map((video) => ({
    videoId: video.id,
    videoTitle: video.title,
    drills: video.chapters.map((chapter) => ({
      name: chapter.title.trim(),
      videoId: video.id,
      videoTitle: video.title,
      startTimestamp: formatTimestamp(chapter.start_time),
      endTimestamp: chapter.end_time === null || chapter.end_time === undefined ? null : formatTimestamp(chapter.end_time),
    })),
  }));
}
