// PIPELINES (owner, 2026-10-06): every community consumer reads approved, public, adult cards only, never a private or
// pending upload, and always credits the creator. One guard per test; the control row passes every one of them.
import { describe, expect, it } from 'vitest';
import {
  COMMUNITY_KINDS, ENTRIES_MAX, buildCommunity, cleanSteps, creditOf, danceSongOf, isServable, mcLineOf, publicCopyOf,
  readOf, recipeOf, routineOf, scenePackOf, type CommunityRow,
} from './community';
import { rightsRecordFor } from '@/lib/creator/creative-card-types';

const NOW = new Date('2026-10-06T12:00:00Z');
const PEND = 'https://storage.googleapis.com/fel-pending/pending/ada/mix1.mp3';
const PUB = 'https://storage.googleapis.com/fel-public/tracks/ada/mix1.mp3';
const PRIV = 'https://storage.googleapis.com/fel-pending/private/kid/mix1.mp3';
const chart = Array.from({ length: 8 }, (_, i) => ({ clipId: 'dance_toprock_basic', beat: i * 4, holdBeats: 2, mirrored: i % 2 === 1 }));
const music = (over: Record<string, unknown> = {}) => ({
  kind: 'music', trackId: 't', stemUrls: [], coverArtUrl: '', bpm: 100, keySignature: '', mixUrl: PEND, mime: 'audio/mpeg', bytes: 1000,
  durationSec: 60, loudnessLufs: -14, origin: 'upload', rights: rightsRecordFor('music'), chart, ...over,
});
const row = (over: Partial<CommunityRow> = {}): CommunityRow => ({
  id: 'c1', title: 'Night Moves', primary: 'music', reviewState: 'approved', isPublic: true, art: music(),
  stats: { publicMedia: { [PEND]: PUB } }, createdAt: NOW,
  owner: { name: 'Ada Lovelace', dobYear: 1990, creatorCards: [{ slug: 'ada', displayName: 'ADA' }] }, ...over,
});

describe('the shared guard: approved, public, adult, no private upload', () => {
  it('the control row passes', () => { expect(isServable(row(), NOW)).toBe(true); });
  it.each([
    ['pending review', { reviewState: 'pending_review' }],
    ['rejected', { reviewState: 'rejected' }],
    ['approved but private', { isPublic: false }],
    ['a teen owner', { owner: { name: 'Kid', dobYear: 2011 } }],
    ['an unknown-age owner', { owner: { name: 'X', dobYear: null } }],
    ['no owner row', { owner: null }],
    ['a private upload anywhere', { art: music({ coverArtUrl: PRIV }) }],
  ] as const)('%s → refused, for every kind', (_n, over) => {
    expect(isServable(row(over as Partial<CommunityRow>), NOW)).toBe(false);
    expect(danceSongOf(row(over as Partial<CommunityRow>), NOW)).toBe(null);
  });
});

describe('media: only the approval\'s public copy', () => {
  it('maps pending → public copy; refuses an unmapped pending, a private, a non-https URL', () => {
    expect(publicCopyOf(PEND, { publicMedia: { [PEND]: PUB } })).toBe(PUB);
    expect(publicCopyOf(PEND, {})).toBe(null);
    expect(publicCopyOf(PRIV, {})).toBe(null);
    expect(publicCopyOf('http://x/y.mp3', {})).toBe(null);
    expect(publicCopyOf('data:audio/wav;base64,AAAA', {})).toBe(null);
  });
});

describe('credit', () => {
  it('the published card name and its link; else the account name, no link', () => {
    expect(creditOf(row())).toEqual({ name: 'ADA', href: '/card/ada' });
    expect(creditOf(row({ owner: { name: 'Ada', dobYear: 1990, creatorCards: [] } }))).toEqual({ name: 'Ada', href: null });
    expect(creditOf(row({ owner: { name: '', dobYear: 1990 } }))).toEqual({ name: 'FEL creator', href: null });
  });
});

describe('dance songs', () => {
  it('a music card with a public mix, rights, BPM and a chart becomes a credited track', () => {
    const e = danceSongOf(row(), NOW)!;
    expect(e).toMatchObject({ id: 'card:c1', cardId: 'c1', url: PUB, bpm: 100, bars: 25, creator: { name: 'ADA' } });
    expect(e.chart).toHaveLength(8);
    expect(e.gainDb).toBe(-2);
  });
  it('no chart (or under four steps), no rights, no public copy → not a Dance song', () => {
    expect(danceSongOf(row({ art: music({ chart: chart.slice(0, 3) }) }), NOW)).toBe(null);
    expect(danceSongOf(row({ art: music({ chart: undefined }) }), NOW)).toBe(null);
    expect(danceSongOf(row({ art: music({ rights: undefined }) }), NOW)).toBe(null);
    expect(danceSongOf(row({ stats: {} }), NOW)).toBe(null);
  });
  it('cleanSteps drops malformed steps and sorts by beat', () => {
    expect(cleanSteps([{ clipId: 'x', beat: 0, holdBeats: 1 }, { clipId: 'dance_wave_arm', beat: 4, holdBeats: 1 }, { clipId: 'dance_trans_spin', beat: 1, holdBeats: 0 }, { clipId: 'dance_trans_spin', beat: 2, holdBeats: 1, mirrored: true }], 10))
      .toEqual([{ clipId: 'dance_trans_spin', beat: 2, holdBeats: 1, mirrored: true }, { clipId: 'dance_wave_arm', beat: 4, holdBeats: 1, mirrored: false }]);
  });
});

describe('the other kinds', () => {
  it('routines', () => {
    const r = routineOf(row({ primary: 'dance', art: { kind: 'dance', choreographyId: 'x', sequence: chart.slice(0, 3), bpm: 96 } }), NOW)!;
    expect(r).toMatchObject({ cardId: 'c1', bpm: 96, creator: { name: 'ADA' } });
    expect(r.steps).toHaveLength(3);
    expect(routineOf(row({ primary: 'dance', isPublic: false, art: { kind: 'dance', sequence: chart } }), NOW)).toBe(null);
  });
  it('scene packs carry a question count and plays', () => {
    const q = [{ prompt: 'p', options: ['a', 'b', 'c', 'd'], answer: 0 }];
    expect(scenePackOf(row({ primary: 'scene', art: { kind: 'scene', venueId: 'venice', questions: q }, stats: { plays: 7 } }), NOW))
      .toMatchObject({ venueId: 'venice', questions: 1, plays: 7, creator: { href: '/card/ada' } });
  });
  it('recipes: the chef\'s allergens (known ids only), no macros, the photo only as a public copy', () => {
    const r = recipeOf(row({ primary: 'cooking', art: { kind: 'cooking', ingredients: ['oats'], steps: ['stir'], fuelTags: ['fuel'], allergens: ['milk', 'gluten', 'milk'], photoUrl: PRIV } }), NOW);
    expect(r).toBe(null);   // a private photo = a private card
    const ok = recipeOf(row({ primary: 'cooking', art: { kind: 'cooking', ingredients: ['oats'], steps: ['stir'], fuelTags: ['fuel'], allergens: ['milk', 'gluten', 'milk'], photoUrl: 'https://x.test/p.png' } }), NOW)!;
    expect(ok.allergens).toEqual(['milk']);
    expect(ok.photoUrl).toBe('https://x.test/p.png');
    expect(Object.keys(ok)).not.toContain('macros');
  });
  it('reads: excerpt and credit', () => {
    const r = readOf(row({ primary: 'writing', art: { kind: 'writing', text: 'w '.repeat(400) } }), NOW)!;
    expect(r.more).toBe(true);
    expect(r.creator.name).toBe('ADA');
  });
  it('MC lines: adults only, the public copy, known slot ids', () => {
    const art = { kind: 'acting', sceneId: 's', performanceUrl: PEND, voiceLineIds: ['commentary_dunk', 'BAD ID'] };
    expect(mcLineOf(row({ primary: 'acting', art }), NOW)).toMatchObject({ url: PUB, slots: ['commentary_dunk'] });
    expect(mcLineOf(row({ primary: 'acting', art, owner: { name: 'Kid', dobYear: 2010 } }), NOW)).toBe(null);
    expect(mcLineOf(row({ primary: 'acting', art, stats: {} }), NOW)).toBe(null);
  });
});

describe('buildCommunity', () => {
  it('newest first, capped, only its own kind, and every kind has a builder', () => {
    const rows = Array.from({ length: 40 }, (_, i) => row({ id: `c${i}`, createdAt: new Date(NOW.getTime() - i * 1000) }));
    const out = buildCommunity('dance-songs', rows, NOW);
    expect(out).toHaveLength(ENTRIES_MAX);
    expect((out[0] as { cardId: string }).cardId).toBe('c0');
    expect(buildCommunity('recipes', rows, NOW)).toEqual([]);
    for (const k of COMMUNITY_KINDS) expect(Array.isArray(buildCommunity(k, [], NOW))).toBe(true);
  });
});
