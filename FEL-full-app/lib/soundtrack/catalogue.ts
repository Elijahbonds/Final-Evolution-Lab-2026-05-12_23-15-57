// lib/soundtrack/catalogue.ts — CREATOR SOUNDTRACK piece B: the catalogue, house songs plus approved music cards. Pure.
//
// A card plays in the soundtrack only when ALL of these hold — each one is a separate guard in catalogue.test.ts:
//  - a music card, approved, public (the creator asked; an approver passed it);
//  - its owner is a public creator (verified 18+; owner: "teens … nothing public, no profile link");
//  - an approver put it in rotation ('on' or 'featured'; 'pulled' or never-placed is out);
//  - it has a playable mix (payload v2: https mixUrl, a playable mime, 1–240 s) — v1's 2-bar stems are not a soundtrack;
//  - its audio resolves to the PUBLIC copy (stats.publicMedia), never the private pending upload;
//  - it carries a valid rights record (a known version, that version's exact words, a time).
// The credit links to the creator's published athlete card, or nowhere.

import { cardSharePath } from '@/lib/creator/share-link';
import { isPublicCreator, publicMediaUrl, readPlays, readRotation } from '@/lib/creator/creative-card-review';
import { readMusicV2 } from './musicPayload';
import { normaliseGainDb } from './gain';
import { trackKey, type SoundtrackCatalogue, type SoundtrackTrack } from './types';

export interface CardTrackRow {
  id: string; title: string; primary: string; reviewState: string; isPublic: boolean; art: unknown; stats: unknown;
  owner: { name?: string | null; dobYear?: number | null; creatorCards?: { slug: string; displayName?: string | null }[] | null } | null;
}

export const CREATOR_NAME_MAX = 40;

export function cardTrack(row: CardTrackRow, now: Date = new Date()): SoundtrackTrack | null {
  if (row.primary !== 'music' || row.reviewState !== 'approved' || row.isPublic !== true) return null;
  if (!isPublicCreator(row.owner?.dobYear, now)) return null;
  const rotation = readRotation(row.stats);
  if (rotation !== 'on' && rotation !== 'featured') return null;
  const m = readMusicV2(row.art);
  if (!m || !m.rights) return null;
  const url = publicMediaUrl(m.mixUrl, row.stats);
  if (!url || /\/pending\//.test(url)) return null;   // never the private upload: only an approval's public copy
  const pub = row.owner?.creatorCards?.[0];
  const slug = pub?.slug;
  // The credit uses the creator's public card name when they have one (a handle they chose to show), else their account name.
  const name = (pub?.displayName?.trim() || row.owner?.name?.trim() || 'FEL creator').slice(0, CREATOR_NAME_MAX);
  const stats = (row.stats ?? {}) as { soundtrack?: { moods?: unknown } };
  const approverMoods = Array.isArray(stats.soundtrack?.moods) ? stats.soundtrack!.moods as SoundtrackTrack['moods'] : [];
  return {
    id: trackKey.card(row.id),
    source: 'card',
    title: row.title.slice(0, 80),
    creator: { name, href: slug ? cardSharePath(slug) : null },
    url,
    mime: m.mime,
    durationSec: m.durationSec,
    gainDb: Math.round(normaliseGainDb(m.loudnessLufs) * 10) / 10,
    bpm: m.bpm,
    loop: m.loop,
    moods: approverMoods.length ? approverMoods : (m.moods.length ? m.moods : ['menu', 'bed']),
    plays: readPlays(row.stats),
    featured: rotation === 'featured',
    coverUrl: m.coverArtUrl ? publicMediaUrl(m.coverArtUrl, row.stats) : null,
  };
}

/** House first (always present: the soundtrack never depends on the database), then cards, featured first. */
export function buildCatalogue(house: SoundtrackTrack[], rows: CardTrackRow[], now: Date = new Date()): SoundtrackCatalogue {
  const cards = rows.map((r) => cardTrack(r, now)).filter((t): t is SoundtrackTrack => t !== null)
    .sort((a, b) => Number(b.featured) - Number(a.featured));
  return { tracks: [...house, ...cards], generatedAt: now.toISOString() };
}
