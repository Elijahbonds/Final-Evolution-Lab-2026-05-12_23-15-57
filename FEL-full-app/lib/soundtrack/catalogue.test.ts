// CREATOR SOUNDTRACK piece B: every catalogue guard, one at a time, plus the house playlist and the payload adapter.
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildCatalogue, cardTrack, type CardTrackRow } from './catalogue';
import { houseTracks, HOUSE_MIXES, HOUSE_GAIN_DB } from './house';
import { readMusicV2 } from './musicPayload';
import { RIGHTS_TEXT, RIGHTS_VERSION, isValidRights, rightsRecord } from './rights';
import { normaliseGainDb, stageGain, crossfadeGains, dbToGain, STAGE_GAIN_DB, DEFAULT_LEVEL } from './gain';
import { parseTrackId } from './types';
import { resolveWalkOutSource } from './walkout';
import { FEL_SONGS } from '@/lib/babylon/dance/felSongs';

const NOW = new Date('2026-10-06T12:00:00Z');
const PENDING = 'https://storage.googleapis.com/fel-creator-pending/pending/u1/abc.mp3';
const PUBLIC = 'https://storage.googleapis.com/fel-creator-public/tracks/u1/abc.mp3';

function row(over: Partial<CardTrackRow> = {}, art: Record<string, unknown> = {}, stats: Record<string, unknown> = {}): CardTrackRow {
  return {
    id: 'c1', title: 'Sunset Run', primary: 'music', reviewState: 'approved', isPublic: true,
    art: { kind: 'music', trackId: 't', stemUrls: [], coverArtUrl: '', bpm: 96, keySignature: 'Am', mixUrl: PENDING, mime: 'audio/mpeg', durationSec: 150, loudnessLufs: -10, rights: rightsRecord(NOW), ...art },
    stats: { soundtrack: { rotation: 'on', by: 'a', at: 'x' }, publicMedia: { [PENDING]: PUBLIC }, plays: 12, ...stats },
    owner: { name: 'Ada L', dobYear: 1990, creatorCards: [{ slug: 'ada', displayName: 'ADA' }] },
    ...over,
  };
}

describe('cardTrack: every guard', () => {
  it('a fully eligible card becomes a slim, credited, normalised track that plays the PUBLIC copy', () => {
    const t = cardTrack(row(), NOW)!;
    expect(t).toMatchObject({
      id: 'card:c1', source: 'card', title: 'Sunset Run', url: PUBLIC, mime: 'audio/mpeg', durationSec: 150,
      gainDb: -6, bpm: 96, plays: 12, featured: false, creator: { name: 'ADA', href: '/card/ada' },
    });
    expect(Object.keys(t)).not.toContain('art');
  });
  it.each([
    ['not music', { primary: 'art' }],
    ['pending', { reviewState: 'pending_review' }],
    ['rejected', { reviewState: 'rejected' }],
    ['private', { isPublic: false }],
    ['a teen\'s', { owner: { name: 'Kid', dobYear: 2012, creatorCards: [{ slug: 'kid' }] } }],
    ['unknown age', { owner: { name: 'Who', dobYear: null } }],
    ['no owner', { owner: null }],
  ])('out when %s', (_why, over) => {
    expect(cardTrack(row(over as Partial<CardTrackRow>), NOW)).toBeNull();
  });
  it('out unless an approver put it in rotation (pulled and never-placed are out; featured is in)', () => {
    expect(cardTrack(row({}, {}, { soundtrack: { rotation: 'pulled' } }), NOW)).toBeNull();
    expect(cardTrack(row({}, {}, { soundtrack: undefined }), NOW)).toBeNull();
    expect(cardTrack(row({}, {}, { soundtrack: { rotation: 'featured' } }), NOW)!.featured).toBe(true);
  });
  it('out when it would play the private pending upload (no public copy recorded)', () => {
    expect(cardTrack(row({}, {}, { publicMedia: {} }), NOW)).toBeNull();
  });
  it('out without a valid rights record (missing, unknown version, altered words, no time)', () => {
    expect(cardTrack(row({}, { rights: undefined }), NOW)).toBeNull();
    expect(cardTrack(row({}, { rights: { text: RIGHTS_TEXT, version: 'v0', at: NOW.toISOString() } }), NOW)).toBeNull();
    expect(cardTrack(row({}, { rights: { text: 'I made it', version: RIGHTS_VERSION, at: NOW.toISOString() } }), NOW)).toBeNull();
    expect(cardTrack(row({}, { rights: { text: RIGHTS_TEXT, version: RIGHTS_VERSION } }), NOW)).toBeNull();
  });
  it('out for a v1 stems-only card, an unplayable type, or longer than 4 minutes', () => {
    expect(cardTrack(row({}, { mixUrl: undefined, stemUrls: ['https://x/s.wav'] }), NOW)).toBeNull();
    expect(cardTrack(row({}, { mime: 'audio/flac' }), NOW)).toBeNull();
    expect(cardTrack(row({}, { durationSec: 241 }), NOW)).toBeNull();
    expect(cardTrack(row({}, { mixUrl: 'http://insecure/x.mp3' }), NOW)).toBeNull();
  });
  it('the credit links nowhere without a published card, and falls back to the account name', () => {
    const t = cardTrack(row({ owner: { name: 'Ada L', dobYear: 1990, creatorCards: [] } }), NOW)!;
    expect(t.creator).toEqual({ name: 'Ada L', href: null });
  });
  it('approver moods win, then the creator\'s, then menu + bed', () => {
    expect(cardTrack(row({}, { moods: ['chill'] }, { soundtrack: { rotation: 'on', moods: ['hype'] } }), NOW)!.moods).toEqual(['hype']);
    expect(cardTrack(row({}, { moods: ['chill', 'bogus'] }), NOW)!.moods).toEqual(['chill']);
    expect(cardTrack(row(), NOW)!.moods).toEqual(['menu', 'bed']);
  });
});

describe('buildCatalogue', () => {
  it('house first (never depends on the database), then cards with featured first', () => {
    const c = buildCatalogue(houseTracks(), [row({ id: 'a' }), row({ id: 'b' }, {}, { soundtrack: { rotation: 'featured' } }), row({ id: 'x', isPublic: false })], NOW);
    expect(c.tracks.slice(0, 6).every((t) => t.source === 'house')).toBe(true);
    expect(c.tracks.slice(6).map((t) => t.id)).toEqual(['card:b', 'card:a']);
    expect(buildCatalogue(houseTracks(), [], NOW).tracks).toHaveLength(FEL_SONGS.length);
  });
});

describe('house playlist', () => {
  it('six songs, each pointing at a file that is in the repo, credited to FEL, normalised from −14 LUFS', () => {
    const h = houseTracks();
    expect(h).toHaveLength(6);
    for (const t of h) {
      expect(existsSync(`public${t.url}`), t.url).toBe(true);
      expect(t.creator).toEqual({ name: 'FEL House', href: null });
      expect(t.gainDb).toBe(HOUSE_GAIN_DB);
      expect(t.durationSec).toBeGreaterThan(25);
    }
  });
  it('every song listed as having a full mix has its mix.mp3 committed', () => {
    for (const id of HOUSE_MIXES) expect(existsSync(`public/audio/songs/${id}/mix.mp3`), id).toBe(true);
  });
});

describe('payload adapter and rights', () => {
  it('reads the plan\'s piece A shape and bounds every field', () => {
    const m = readMusicV2({ kind: 'music', mixUrl: PUBLIC, mime: 'audio/mp4', durationSec: 90, loudnessLufs: -80, loop: { startSec: 10, endSec: 10.5 }, bpm: 500, origin: 'evil' })!;
    expect(m).toMatchObject({ mixUrl: PUBLIC, mime: 'audio/mp4', durationSec: 90, loudnessLufs: null, loop: null, bpm: null, origin: null, rights: null });
    expect(readMusicV2({ kind: 'music', mixUrl: PUBLIC, mime: 'audio/mpeg', durationSec: 60, loop: { startSec: 4, endSec: 36 } })!.loop).toEqual({ startSec: 4, endSec: 36 });
    expect(readMusicV2({ kind: 'art' })).toBeNull();
  });
  it('the rights record is the owner\'s proposed wording, versioned and timestamped', () => {
    expect(RIGHTS_TEXT).toContain('FEL may play it in menus, loading screens, games, replays and the end screen, credited to me.');
    expect(isValidRights(rightsRecord(NOW))).toBe(true);
  });
});

describe('levels', () => {
  it('normalisation to −16 LUFS, clamped, with a cautious default', () => {
    expect(normaliseGainDb(-16)).toBe(0);
    expect(normaliseGainDb(-8)).toBe(-8);
    expect(normaliseGainDb(-2)).toBe(-12);
    expect(normaliseGainDb(-30)).toBe(6);
    expect(normaliseGainDb(null)).toBe(-6);
  });
  it('stages: bed 14 dB under the menu, end 3 dB under, off silent; the level multiplies', () => {
    expect(STAGE_GAIN_DB).toEqual({ menu: 0, loading: 0, bed: -14, end: -3, off: -Infinity });
    expect(stageGain('menu', 1)).toBe(1);
    expect(stageGain('bed', 1)).toBeCloseTo(dbToGain(-14));
    expect(stageGain('off', 1)).toBe(0);
    expect(stageGain('menu', DEFAULT_LEVEL)).toBe(0.5);
  });
  it('equal-power crossfade', () => {
    const mid = crossfadeGains(0.5);
    expect(mid.in ** 2 + mid.out ** 2).toBeCloseTo(1);
    expect(crossfadeGains(0)).toEqual({ out: 1, in: 0 });
  });
});

describe('ids and walk-outs', () => {
  it('parseTrackId', () => {
    expect(parseTrackId('card:ccard_u_1')).toEqual({ source: 'card', ref: 'ccard_u_1' });
    expect(parseTrackId('house:warmup')).toEqual({ source: 'house', ref: 'warmup' });
    expect(parseTrackId('card:../x')).toBeNull();
    expect(parseTrackId('song:x')).toBeNull();
  });
  it('the walk-out prefers the player\'s pick, then featured hype, then any hype, else null', () => {
    const h = houseTracks();
    const card = cardTrack(row({}, {}, { soundtrack: { rotation: 'featured', moods: ['hype'] } }), NOW)!;
    expect(resolveWalkOutSource([...h, card], { preferId: 'house:warmup' })!.trackId).toBe('house:warmup');
    expect(resolveWalkOutSource([...h, card], { rng: () => 0.99 })!.trackId).toBe('card:c1');
    expect(resolveWalkOutSource(h, { rng: () => 0 })!.trackId).toBe('house:battle');
    expect(resolveWalkOutSource(h.filter((t) => !t.moods.includes('hype')))).toBeNull();
  });
});
