// MUSIC-SUITE P5 (2026-09-25), "The Flip, for real" — the PUBLIC-DOMAIN SHELF: the mechanism.
//
// Owner decisions #15 and #28: the Flip may offer public-domain recordings, each one signed off by the owner, and phase 5
// writes the candidate list (outbox musicsuite/p5/PD-CANDIDATES.md) — nothing is downloaded before the owner ticks it.
// This shelf shipped EMPTY through P5 and P6; MUSIC-SUITE P7 (2026-09-29) fills PD_SHELF with owner decision #37's six
// (below). An entry appears in the FLIP tab only when:
//   · it is complete — who performed it, the year it was published, where the recording is archived (an https URL), and
//     WHY it is free in plain words (whyFree: the rationale a player or a rights holder can read);
//   · it is old enough: a US sound recording published before 1925 (PD_LAST_YEAR = 1924). The Music Modernization Act
//     (2018) put pre-1972 recordings on a schedule — published before 1923: public domain since 2022-01-01; 1923 to
//     1946: 100 years after publication, to the end of that year (1923 on 2024-01-01, 1924 on 2025-01-01). 1925 joined on
//     2026-01-01 too; the line stays at 1924 as the task set it (assumption: the owner widens it deliberately, not us);
//   · the owner has signed it: `ownerSignedAt` is the ISO time the owner approved THIS entry. null = listed, not shown.
// Its audio then lives at /audio/pd/<id>.mp3 — outside public/audio/flip, whose record says "FEL original, generated"
// (provenance.test.ts), which a public-domain recording is not; the entry itself is its record.
//
// The sound recording being public domain is not the whole of it: the song it plays must be too. Every candidate in
// PD-CANDIDATES.md is a traditional tune or a composition published before 1931 (US: 95 years, so 1930 works joined on
// 2026-01-01). The rule here checks the recording's year; the composition is part of `whyFree`, read by the owner.

import type { FlipSource } from './Flip';

export interface PdEntry {
  /** a-z0-9_ (the audio file is /audio/pd/<id>.mp3) */
  id: string;
  title: string;
  performer: string;
  /** the year the recording was first published */
  year: number;
  /** where the recording is archived (https): the archive's page, never a mirror */
  sourceUrl: string;
  /** why it is free, in plain words — the recording AND the composition */
  whyFree: string;
  /** when the owner signed this entry off (ISO 8601); null = not signed, never shown */
  ownerSignedAt: string | null;
}

/** The last publication year of a US sound recording this shelf takes (published before 1925). */
export const PD_LAST_YEAR = 1924;
export const PD_AUDIO_BASE = '/audio/pd/';

/**
 * THE SHELF. MUSIC-SUITE P7 (2026-09-29): the six entries of owner decision #37 (musicsuite/DECISIONS-2.md, signed
 * 2026-09-26T00:00:00Z) — "THE 6 WITH CONFIRMED SOURCES" from the candidate table (outbox musicsuite/p5/PD-CANDIDATES.md).
 * Each file was downloaded from the exact page decision #37 names, the three checks (transfer from the original disc,
 * the archive's terms, the matrix/take) were confirmed, and the full record — including where each check was read and,
 * for the three Library of Congress items, exactly how the file was reached — is public/audio/pd/PROVENANCE.json.
 * (Only these six: the other four PD-CANDIDATES.md rows were never ticked and stay undownloaded.)
 */
export const PD_SHELF: readonly PdEntry[] = [
  {
    id: 'odjb_livery_stable_1917',
    title: 'Livery Stable Blues',
    performer: 'Original Dixieland Jass Band',
    year: 1917,
    sourceUrl: 'https://www.loc.gov/item/jukebox-186254/',
    whyFree:
      "A US recording published in 1917, public domain since 2022 under the Music Modernization Act; the tune has " +
      "been public domain for decades. Confirmed on the item page: a transfer of the original Victor 18255 disc " +
      "(Matrix/Take B-19331/1), free to reuse per the National Jukebox's own notice.",
    ownerSignedAt: '2026-09-26T00:00:00Z',
  },
  {
    id: 'europe_castle_house_rag_1914',
    title: 'The Castles in Europe (Castle House Rag)',
    performer: "Europe's Society Orchestra (James Reese Europe)",
    year: 1914,
    sourceUrl: 'https://www.loc.gov/item/jukebox-134538/',
    whyFree:
      "A US recording published in 1914, public domain since 2022 under the Music Modernization Act; James Reese " +
      "Europe's 1914 composition is long out of copyright. Confirmed on the item page: a transfer of the original " +
      "Victor 35372 disc (Matrix/Take C-14433/3), free to reuse per the National Jukebox's own notice.",
    ownerSignedAt: '2026-09-26T00:00:00Z',
  },
  {
    id: 'fisk_swing_low_1909',
    title: 'Swing Low, Sweet Chariot',
    performer: 'Fisk University Jubilee Quartet',
    year: 1909,
    sourceUrl: 'https://www.loc.gov/item/jukebox-128141/',
    whyFree:
      "A US recording published in 1909, public domain since 2022 under the Music Modernization Act; the song is a " +
      "traditional spiritual with no composer's copyright. Confirmed on the item page: a transfer of the original " +
      "Victor 16453 disc (Matrix/Take B-8420/3), free to reuse per the National Jukebox's own notice.",
    ownerSignedAt: '2026-09-26T00:00:00Z',
  },
  {
    id: 'mamie_smith_crazy_blues_1920',
    title: 'Crazy Blues',
    performer: 'Mamie Smith & Her Jazz Hounds',
    year: 1920,
    sourceUrl: 'https://archive.org/details/MamieSmithHerJazzHounds',
    whyFree:
      "A US recording published in 1920, public domain since 2022 under the Music Modernization Act; Perry " +
      "Bradford's 1920 song is long out of copyright. Confirmed on the item: an archive.org 78rpm-disc transfer " +
      "(OKeh 4169, take C), no restrictive terms recorded.",
    ownerSignedAt: '2026-09-26T00:00:00Z',
  },
  {
    id: 'bessie_smith_downhearted_1923',
    title: 'Down Hearted Blues',
    performer: 'Bessie Smith',
    year: 1923,
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Bessie_Smith_-_Downhearted_Blues_(1923).ogg',
    whyFree:
      "A US recording published in 1923, public domain since 2024 under the Music Modernization Act; the 1922 " +
      "Hunter/Austin song has been public domain since 2018. Confirmed on the file page: Wikimedia Commons' own " +
      "public-domain licence tags on its 78rpm-disc transfer (Columbia, recorded 1923-02-16).",
    ownerSignedAt: '2026-09-26T00:00:00Z',
  },
  {
    id: 'whiteman_rhapsody_1924',
    title: 'Rhapsody in Blue, Part 1',
    performer: 'Paul Whiteman and His Concert Orchestra, George Gershwin (piano)',
    year: 1924,
    sourceUrl: 'https://publicdomainreview.org/collection/rhapsody-in-blue-paul-whiteman-and-george-gershwin-original-1924-recording/',
    whyFree:
      "A US recording published in 1924, public domain since 2025 under the Music Modernization Act; Gershwin's " +
      "1924 composition has been public domain since 2020. Confirmed via the Public Domain Review's own download " +
      "link to an archive.org transfer of the acoustic Victor 78rpm disc, Part 1 (loc.gov streams the same " +
      "recording but offers no download).",
    ownerSignedAt: '2026-09-26T00:00:00Z',
  },
];

const ID = /^[a-z0-9_]{3,48}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

/** Why an entry can't be shown (empty = it can). An unsigned entry is not a problem, only not shown. */
export function pdEntryProblems(e: PdEntry): string[] {
  const out: string[] = [];
  if (!ID.test(e.id)) out.push('id');
  if (!e.title.trim()) out.push('title');
  if (!e.performer.trim()) out.push('performer');
  if (!Number.isInteger(e.year) || e.year < 1877 || e.year > PD_LAST_YEAR) out.push(`year ${e.year} is not a US recording published before ${PD_LAST_YEAR + 1}`);
  let url: URL | null = null;
  try { url = new URL(e.sourceUrl); } catch { url = null; }
  if (!url || url.protocol !== 'https:') out.push('sourceUrl is not an https address');
  if (e.whyFree.trim().length < 40) out.push('whyFree must say why, in plain words');
  if (e.ownerSignedAt !== null && (!ISO.test(e.ownerSignedAt) || Number.isNaN(Date.parse(e.ownerSignedAt)))) out.push('ownerSignedAt is not an ISO time');
  return out;
}

/** The entries the app may show: complete, old enough, and signed by the owner. */
export function signedPdEntries(shelf: readonly PdEntry[] = PD_SHELF): PdEntry[] {
  const seen = new Set<string>();
  return shelf.filter((e) => {
    if (e.ownerSignedAt === null || pdEntryProblems(e).length || seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });
}

/** The signed entries as Flip sources (kind 'public-domain', the PUBLIC DOMAIN group), each carrying its rationale. */
export function pdSources(shelf: readonly PdEntry[] = PD_SHELF): FlipSource[] {
  return signedPdEntries(shelf).map((e) => ({
    id: `pd_${e.id}`,
    label: e.title.slice(0, 32),
    url: `${PD_AUDIO_BASE}${e.id}.mp3`,
    kind: 'public-domain',
    group: 'public-domain',
    note: `${e.performer} (${e.year}), public domain in the US: ${e.whyFree}`.slice(0, 240),
  }));
}

/**
 * MUSIC-SUITE P5 FIX PASS (2026-09-25): may a STORED source fetch this /audio/ path? Anything under /audio/pd/ only when it
 * is a signed entry's own file. The project's door (StudioProject readSource) took any /audio/ path, so between placing a
 * file and signing its entry (PD-CANDIDATES.md steps 3 → 5), or after an entry is unsigned or removed, a stored project,
 * library record or remix naming /audio/pd/<id>.mp3 still fetched and played it — the owner's signature was not held at
 * the door. Every other /audio/ path is FEL's (its own records hold it).
 */
export function pdAudioAllowed(url: string, shelf: readonly PdEntry[] = PD_SHELF): boolean {
  if (!url.startsWith(PD_AUDIO_BASE)) return true;
  const m = /^\/audio\/pd\/([a-z0-9_]{3,48})\.mp3$/.exec(url);
  return !!m && signedPdEntries(shelf).some((e) => e.id === m[1]);
}
