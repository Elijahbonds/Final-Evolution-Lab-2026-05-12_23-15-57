import { afterEach, describe, expect, it } from 'vitest';
import {
  getProgramLibraryDrills,
  getProgramLibrarySeed,
  PROGRAM_LIBRARY_SEED,
  type ProgramLibraryVideoEntry,
} from './programLibrarySeed';
import { PROGRAM_LIBRARY_SOURCE, parseProgramLibrarySource } from './parseProgramLibrarySource';

const ORIGINAL = process.env.COACH_STORE_ENABLED;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.COACH_STORE_ENABLED;
  else process.env.COACH_STORE_ENABLED = ORIGINAL;
});

const ALL_VIDEO_IDS = [
  '00j3HPZsPmY', '3GtJ-134D9s', 'J037GG99GT0', 'V0yX1H1OtQ8', 'cWYFVg6GsVU', 'dAoLYThf1bc', 'hrlGbS0r-hM',
  'isjAY8Oo58g', 'mpRZl8VNWlo', 'pqyxTY85x4U', 'q1HLjLbhS2s', 's4U7IsjowuE', 'tiHUrigssOA', 'xVE7Gegu27w',
];

const UNTIMESTAMPED_VIDEO_IDS = [
  'hrlGbS0r-hM', 'dAoLYThf1bc', 'mpRZl8VNWlo', '00j3HPZsPmY', '3GtJ-134D9s', 'cWYFVg6GsVU', 'xVE7Gegu27w',
  'V0yX1H1OtQ8', 'tiHUrigssOA', 'isjAY8Oo58g', 's4U7IsjowuE',
];

const EXPECTED_PER_VIDEO_COUNTS: Record<string, number> = {
  J037GG99GT0: 44,
  q1HLjLbhS2s: 25,
  pqyxTY85x4U: 16,
};

function timestampToSeconds(ts: string): number {
  const parts = ts.split(':').map(Number);
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

function allDrills(seed: ProgramLibraryVideoEntry[]) {
  return seed.flatMap((entry) => entry.drills);
}

describe('program library seed: source cross-check (fixtures, not hardcoded)', () => {
  it('fixtures cover exactly the 14 known video ids', () => {
    expect(PROGRAM_LIBRARY_SOURCE.map((v) => v.id).sort()).toEqual([...ALL_VIDEO_IDS].sort());
  });

  it('parsing the checked-in fixtures yields exactly 85 timestamped drills total', () => {
    const parsed = parseProgramLibrarySource();
    const total = parsed.reduce((n, v) => n + v.drills.length, 0);
    expect(total).toBe(85);
  });

  it('parsing the fixtures yields the expected per-video counts: 44 / 25 / 16', () => {
    const parsed = parseProgramLibrarySource();
    for (const [videoId, count] of Object.entries(EXPECTED_PER_VIDEO_COUNTS)) {
      const entry = parsed.find((v) => v.videoId === videoId);
      expect(entry?.drills.length).toBe(count);
    }
  });

  it('the other 11 videos parse with zero drills (video-level entries)', () => {
    const parsed = parseProgramLibrarySource();
    for (const videoId of UNTIMESTAMPED_VIDEO_IDS) {
      const entry = parsed.find((v) => v.videoId === videoId);
      expect(entry?.drills.length).toBe(0);
    }
  });
});

describe('program library seed: shape and invariants (PROGRAM_LIBRARY_SEED, flag-independent)', () => {
  it('has exactly 85 timestamped drills total', () => {
    expect(allDrills(PROGRAM_LIBRARY_SEED).length).toBe(85);
  });

  it('matches the expected per-video counts', () => {
    for (const [videoId, count] of Object.entries(EXPECTED_PER_VIDEO_COUNTS)) {
      const entry = PROGRAM_LIBRARY_SEED.find((v) => v.videoId === videoId);
      expect(entry?.drills.length).toBe(count);
    }
  });

  it('every drill belongs to one of the 14 known video ids', () => {
    for (const drill of allDrills(PROGRAM_LIBRARY_SEED)) {
      expect(ALL_VIDEO_IDS).toContain(drill.videoId);
    }
  });

  it('timestamps are well-formed (M:SS or H:MM:SS) and strictly increasing within each video', () => {
    const tsPattern = /^\d{1,}:\d{2}(:\d{2})?$/;
    for (const entry of PROGRAM_LIBRARY_SEED) {
      let lastStart = -1;
      for (const drill of entry.drills) {
        expect(drill.startTimestamp).toMatch(tsPattern);
        if (drill.endTimestamp !== null) expect(drill.endTimestamp).toMatch(tsPattern);
        const startSec = timestampToSeconds(drill.startTimestamp);
        expect(startSec).toBeGreaterThan(lastStart);
        lastStart = startSec;
        if (drill.endTimestamp !== null) {
          expect(timestampToSeconds(drill.endTimestamp)).toBeGreaterThan(startSec);
        }
      }
    }
  });

  it('the 11 untimestamped videos have empty drill lists (empty timestamps)', () => {
    for (const videoId of UNTIMESTAMPED_VIDEO_IDS) {
      const entry = PROGRAM_LIBRARY_SEED.find((v) => v.videoId === videoId);
      expect(entry?.drills).toEqual([]);
    }
  });

  it('all prices are null (blank) — nothing in this seed has been priced', () => {
    for (const entry of PROGRAM_LIBRARY_SEED) {
      expect(entry.priceCents).toBeNull();
    }
  });

  it('no drill name, videoId, or video title is empty', () => {
    for (const drill of allDrills(PROGRAM_LIBRARY_SEED)) {
      expect(drill.name.length).toBeGreaterThan(0);
      expect(drill.videoId.length).toBeGreaterThan(0);
      expect(drill.videoTitle.length).toBeGreaterThan(0);
    }
  });
});

describe('program library seed: flag-gated read path', () => {
  it('flag off (unset): getProgramLibrarySeed returns nothing', () => {
    delete process.env.COACH_STORE_ENABLED;
    expect(getProgramLibrarySeed()).toEqual([]);
    expect(getProgramLibraryDrills()).toEqual([]);
  });

  it.each(['0', 'false', '', 'nope'])('flag off (%j): still returns nothing', (v) => {
    process.env.COACH_STORE_ENABLED = v;
    expect(getProgramLibrarySeed()).toEqual([]);
  });

  it('flag on: getProgramLibrarySeed returns all 14 entries with 85 drills', () => {
    process.env.COACH_STORE_ENABLED = '1';
    const seed = getProgramLibrarySeed();
    expect(seed.length).toBe(14);
    expect(allDrills(seed).length).toBe(85);
    expect(getProgramLibraryDrills().length).toBe(85);
  });

  it('reads the flag at call time: flipping the env between calls flips the result', () => {
    delete process.env.COACH_STORE_ENABLED;
    expect(getProgramLibrarySeed()).toEqual([]);
    process.env.COACH_STORE_ENABLED = '1';
    expect(getProgramLibrarySeed().length).toBe(14);
    delete process.env.COACH_STORE_ENABLED;
    expect(getProgramLibrarySeed()).toEqual([]);
  });
});
