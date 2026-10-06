// CREATE HUB phase 1 (owner, 2026-10-06): the Creative Card payload v2 contract — music v2 fields and their bounds, the
// dance tempo, cooking allergens, and the rights record every media card carries.
import { describe, expect, it } from 'vitest';
import {
  CARD_ALLERGENS, CURRENT_RIGHTS, MUSIC_LIMITS, RIGHTS_VERSIONS, cardMediaOf, isDanceStep, isValidRights,
  rightsFamilyFor, rightsRecordFor, stampRights, validateArtPayload, type ArtPayload,
} from './creative-card-types';
import { MOODS } from './creative-card-review';

const OWNER_WORDS = "I made this, or I own all rights to every sound in it. No samples, beats, vocals or AI imitations of artists I don't have rights to. FEL may play it in menus, loading screens, games, replays and the end screen, credited to me.";
const sound = rightsRecordFor('music', new Date('2026-10-06T12:00:00Z'));
const v1 = { kind: 'music', trackId: 't', stemUrls: [] as string[], coverArtUrl: '', bpm: 96, keySignature: 'Am' };
const v2 = {
  ...v1, mixUrl: 'https://storage.googleapis.com/b/pending/u/x.m4a', mime: 'audio/mp4', bytes: 3_000_000, durationSec: 92.5,
  loudnessLufs: -15.2, loop: { startSec: 10, endSec: 30 }, origin: 'academy', bars: 36, moods: ['menu', 'hype'],
  chart: [{ clipId: 'dance_toprock_basic', beat: 0, holdBeats: 4, mirrored: false }], rights: sound,
};
const step = { clipId: 'dance_toprock_basic', beat: 0, holdBeats: 4, mirrored: true };

describe('rights record', () => {
  it("the music version is the owner's wording, verbatim, and the hub's record uses it", () => {
    expect(RIGHTS_VERSIONS['music-2026-10-06'].text).toBe(OWNER_WORDS);
    expect(sound).toEqual({ text: OWNER_WORDS, version: 'music-2026-10-06', at: '2026-10-06T12:00:00.000Z' });
    expect(CURRENT_RIGHTS.sound).toBe('music-2026-10-06');
  });
  it('music and voice are sound; every other discipline is media', () => {
    expect(rightsFamilyFor('music')).toBe('sound'); expect(rightsFamilyFor('acting')).toBe('sound');
    for (const d of ['art', 'dance', 'cooking', 'fashion', 'writing', 'sport', 'scene'] as const) expect(rightsFamilyFor(d)).toBe('media');
  });
  it('valid only with a known version, its exact words, the right family and a real time', () => {
    expect(isValidRights(sound)).toBe(true);
    expect(isValidRights(sound, 'sound')).toBe(true);
    expect(isValidRights(sound, 'media')).toBe(false);
    expect(isValidRights({ ...sound, text: sound.text + ' ' })).toBe(false);
    expect(isValidRights({ ...sound, version: 'music-2099-01-01' })).toBe(false);
    expect(isValidRights({ ...sound, at: 'yesterday' })).toBe(false);
    expect(isValidRights({ text: sound.text, version: sound.version })).toBe(false);
    expect(isValidRights(null)).toBe(false);
  });
  it('a media card without rights is refused; one with the wrong family is refused; no-media cards may omit it', () => {
    expect(validateArtPayload({ ...v2, rights: undefined }).ok).toBe(false);
    expect(validateArtPayload({ ...v2, rights: rightsRecordFor('art') }).ok).toBe(false);
    expect(validateArtPayload({ kind: 'acting', sceneId: 's', performanceUrl: 'https://x/l.webm', voiceLineIds: [] }).ok).toBe(false);
    expect(validateArtPayload({ kind: 'acting', sceneId: 's', performanceUrl: 'https://x/l.webm', voiceLineIds: [], rights: rightsRecordFor('acting') }).ok).toBe(true);
    const painted = { kind: 'art', canvasDataUrl: 'data:image/png;base64,AA', palette: [], brushSetId: 'b', appliedSurface: 'board' };
    expect(validateArtPayload(painted).ok).toBe(false);
    expect(validateArtPayload({ ...painted, rights: rightsRecordFor('art') }).ok).toBe(true);
    expect(validateArtPayload({ kind: 'cooking', steps: ['Boil'], ingredients: ['Eggs'], fuelTags: [], photoUrl: 'https://x/p.jpg' }).ok).toBe(false);
    expect(validateArtPayload({ kind: 'cooking', steps: ['Boil'], ingredients: ['Eggs'], fuelTags: [] }).ok).toBe(true);
    expect(validateArtPayload({ kind: 'scene', venueId: 'v', cameraPath: 'c', questions: [{ prompt: 'Which?', options: ['a', 'b', 'c', 'd'], answer: 0 }] }).ok).toBe(true);
    expect(validateArtPayload(v1).ok).toBe(true);   // a v1 card with no stems carries no media
  });
  it('cardMediaOf sees every media field, inline images included, and nothing else', () => {
    expect(cardMediaOf(v2)).toEqual([v2.mixUrl]);
    expect(cardMediaOf({ kind: 'music', stemUrls: ['https://a', ' '], coverArtUrl: 'https://c' })).toEqual(['https://c', 'https://a']);
    expect(cardMediaOf({ kind: 'dance', routineVideoUrl: 'https://v' })).toEqual(['https://v']);
    expect(cardMediaOf({ kind: 'sport', highlightReelUrl: 'https://h' })).toEqual(['https://h']);
    expect(cardMediaOf({ kind: 'writing', text: 'x', coverUrl: '' })).toEqual([]);
  });
  it("stampRights replaces the device's time with the server's and leaves a card without rights alone", () => {
    const now = new Date('2026-10-07T00:00:00Z');
    expect(stampRights({ ...v2 } as unknown as ArtPayload, now).rights).toEqual({ ...sound, at: now.toISOString() });
    const plain = { kind: 'sport' } as ArtPayload;
    expect(stampRights(plain, now)).toBe(plain);
  });
});

describe('music payload v2', () => {
  it('a full v2 track validates, and v1 stays valid', () => {
    expect(validateArtPayload(v2)).toEqual({ ok: true });
    expect(validateArtPayload({ ...v1, stemUrls: ['https://x/s.wav'], rights: sound })).toEqual({ ok: true });
  });
  it.each([
    ['mixUrl over http', { mixUrl: 'http://x/a.mp3' }],
    ['mixUrl not a link', { mixUrl: 'javascript:alert(1)' }],
    ['a mix without its mime', { mime: undefined }],
    ['an unknown mime', { mime: 'audio/flac' }],
    ['a mime with codec params', { mime: 'audio/webm;codecs=opus' }],
    ['a mix without its length', { durationSec: undefined }],
    ['bytes over 8 MB', { bytes: MUSIC_LIMITS.bytes + 1 }],
    ['bytes not whole', { bytes: 10.5 }],
    ['bytes zero', { bytes: 0 }],
    ['longer than 4 minutes', { durationSec: 240.01 }],
    ['shorter than a second', { durationSec: 0.5 }],
    ['loudness above 0', { loudnessLufs: 1 }],
    ['loudness below -70', { loudnessLufs: -71 }],
    ['loudness NaN', { loudnessLufs: Number.NaN }],
    ['loop past the end', { loop: { startSec: 80, endSec: 93 } }],
    ['loop backwards', { loop: { startSec: 30, endSec: 10 } }],
    ['loop under a second', { loop: { startSec: 10, endSec: 10.5 } }],
    ['loop missing a side', { loop: { startSec: 10 } }],
    ['origin house (FEL only)', { origin: 'house' }],
    ['origin unknown', { origin: 'spotify' }],
    ['an empty chart', { chart: [] }],
    ['a chart over 512 steps', { chart: Array.from({ length: MUSIC_LIMITS.chartSteps + 1 }, (_, i) => ({ ...step, beat: i })) }],
    ['a malformed chart step', { chart: [{ clipId: '', beat: 0, holdBeats: 4, mirrored: false }] }],
    ['bars zero', { bars: 0 }],
    ['bars fractional', { bars: 2.5 }],
    ['bars over 512', { bars: 513 }],
    ['an unknown mood', { moods: ['sad'] }],
    ['a repeated mood', { moods: ['menu', 'menu'] }],
    ['moods not a list', { moods: 'menu' }],
    ['cover not an image link', { coverArtUrl: 'ftp://x' }],
  ])('refuses %s', (_name, patch) => {
    expect(validateArtPayload({ ...v2, ...patch }).ok).toBe(false);
  });
  it('accepts the edges: exactly 8 MB, exactly 4 minutes, a 512-step chart, every mood, the loop to the end', () => {
    expect(validateArtPayload({ ...v2, bytes: MUSIC_LIMITS.bytes, durationSec: 240, loop: { startSec: 0, endSec: 240 } }).ok).toBe(true);
    expect(validateArtPayload({ ...v2, chart: Array.from({ length: 512 }, (_, i) => ({ ...step, beat: i })) }).ok).toBe(true);
    expect(validateArtPayload({ ...v2, moods: [...MOODS] }).ok).toBe(true);
    for (const mime of ['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/webm', 'audio/wav']) expect(validateArtPayload({ ...v2, mime }).ok).toBe(true);
  });
});

describe('dance keeps its tempo; steps are real steps', () => {
  const dance = { kind: 'dance', choreographyId: 'c', sequence: [step] };
  it('bpm 40–300 is kept and bounded', () => {
    expect(validateArtPayload({ ...dance, bpm: 96 }).ok).toBe(true);
    expect(validateArtPayload(dance).ok).toBe(true);
    expect(validateArtPayload({ ...dance, bpm: 39 }).ok).toBe(false);
    expect(validateArtPayload({ ...dance, bpm: 301 }).ok).toBe(false);
  });
  it('a step needs a clip, a beat, a hold and mirrored', () => {
    expect(isDanceStep(step)).toBe(true);
    expect(isDanceStep({ ...step, mirrored: 'yes' })).toBe(false);
    expect(isDanceStep({ ...step, holdBeats: 0 })).toBe(false);
    expect(isDanceStep({ ...step, beat: -1 })).toBe(false);
    expect(validateArtPayload({ ...dance, sequence: [{ clipId: 'x' }] }).ok).toBe(false);
  });
  it('a routine video must be an https link and needs rights', () => {
    expect(validateArtPayload({ ...dance, routineVideoUrl: 'http://v' }).ok).toBe(false);
    expect(validateArtPayload({ ...dance, routineVideoUrl: 'https://v', rights: rightsRecordFor('dance') }).ok).toBe(true);
  });
});

describe('cooking allergens', () => {
  const recipe = { kind: 'cooking', steps: ['Boil'], ingredients: ['Eggs'], fuelTags: [] };
  it('the nine, with the Fuel floor ids', () => {
    expect([...CARD_ALLERGENS]).toEqual(['milk', 'egg', 'fish', 'shellfish', 'tree-nuts', 'peanuts', 'wheat', 'soy', 'sesame']);
  });
  it('any subset of the nine, no repeats, nothing else', () => {
    expect(validateArtPayload({ ...recipe, allergens: [] }).ok).toBe(true);
    expect(validateArtPayload({ ...recipe, allergens: ['egg', 'tree-nuts'] }).ok).toBe(true);
    expect(validateArtPayload({ ...recipe, allergens: [...CARD_ALLERGENS] }).ok).toBe(true);
    expect(validateArtPayload({ ...recipe, allergens: ['gluten'] }).ok).toBe(false);
    expect(validateArtPayload({ ...recipe, allergens: ['egg', 'egg'] }).ok).toBe(false);
    expect(validateArtPayload({ ...recipe, allergens: 'egg' }).ok).toBe(false);
  });
});

describe('sport', () => {
  it('a highlight link must be https', () => {
    expect(validateArtPayload({ kind: 'sport', signatureMoveId: 'windmill' }).ok).toBe(true);
    expect(validateArtPayload({ kind: 'sport', highlightReelUrl: 'javascript:x', rights: rightsRecordFor('sport') }).ok).toBe(false);
  });
});
