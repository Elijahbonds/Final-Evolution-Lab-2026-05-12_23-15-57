// CREATE HUB: the guided flow's step logic, teen privacy, the rights tick, pending uploads and the publish links.
import { describe, expect, it } from 'vitest';
import {
  PENDING_MEDIA, STEPS, blockers, buildCreateBody, canLeave, clampStep, effectivePublic, newDraft, nextStep, pendingFields,
  pendingUrl, prevStep, publishHref, readEntry, resolvePending, visibilityNote, type FlowDraft,
} from './flow';
import { DISCIPLINES, RIGHTS_VERSIONS, validateArtPayload, type ArtPayloadBody } from '@/lib/creator/creative-card-types';

const ADULT = { publicCreator: true };
const TEEN = { publicCreator: false };
const writing: ArtPayloadBody = { kind: 'writing', text: 'The court at dawn, before anyone else.' };
const ready = (over: Partial<FlowDraft> = {}): FlowDraft => ({ ...newDraft('writing'), art: writing, title: 'Dawn', rightsTicked: true, ...over });

describe('steps', () => {
  it('three steps in order, with next/prev at the ends', () => {
    expect([...STEPS]).toEqual(['make', 'details', 'preview']);
    expect(nextStep('make')).toBe('details'); expect(nextStep('preview')).toBeNull();
    expect(prevStep('details')).toBe('make'); expect(prevStep('make')).toBeNull();
  });
  it('make needs a well-formed piece of the right kind', () => {
    expect(blockers('make', newDraft('writing'), ADULT)).toEqual(['Make something first, or bring it in.']);
    expect(blockers('make', { ...newDraft('music'), art: writing }, ADULT)[0]).toMatch(/writing piece; this is the music flow/);
    expect(blockers('make', { ...newDraft('writing'), art: { kind: 'writing', text: 'short' } }, ADULT)[0]).toMatch(/20–4000/);
    expect(canLeave('make', ready({ title: '', rightsTicked: false }), ADULT)).toBe(true);
  });
  it('details needs a title, the sport when sport is in, and the rights tick', () => {
    expect(blockers('details', ready({ title: '  ' }), ADULT)).toEqual(['Give it a title.']);
    expect(blockers('details', ready({ title: 'x'.repeat(61) }), ADULT)).toEqual(['Keep the title to 60 characters.']);
    expect(blockers('details', ready({ rightsTicked: false }), ADULT)).toEqual(['Tick the rights statement.']);
    expect(blockers('details', ready({ secondary: ['sport'] }), ADULT)).toEqual(['Pick the sport.']);
    expect(blockers('details', ready({ secondary: ['sport'], sport: 'skate' }), ADULT)).toEqual([]);
    expect(blockers('details', ready({ secondary: ['writing'] }), ADULT)).toContain('An extra discipline cannot be the main one.');
    expect(blockers('details', ready({ secondary: ['art', 'dance', 'music'] }), ADULT)).toContain('Pick up to 2 extra disciplines.');
  });
  it('details re-checks make, so a cleared piece cannot be submitted by jumping ahead', () => {
    expect(blockers('details', ready({ art: null }), ADULT)).toContain('Make something first, or bring it in.');
  });
  it('clampStep lands on the first unfinished step', () => {
    expect(clampStep('preview', newDraft('writing'), ADULT)).toBe('make');
    expect(clampStep('preview', ready({ title: '' }), ADULT)).toBe('details');
    expect(clampStep('preview', ready(), ADULT)).toBe('preview');
    expect(clampStep('make', ready(), ADULT)).toBe('make');
  });
});

describe('who can see it: teens are never public', () => {
  it('an adult who chose public asks for public; one who chose private does not', () => {
    expect(effectivePublic(ready(), ADULT)).toBe(true);
    expect(effectivePublic(ready({ wantsPublic: false }), ADULT)).toBe(false);
    expect(buildCreateBody(ready(), ADULT)!.isPublic).toBe(true);
  });
  it.each(DISCIPLINES)('a teen (or unknown age) %s card never asks for public, whatever they chose', (d) => {
    const draft = { ...ready(), discipline: d, art: { ...writing, kind: d } as ArtPayloadBody };
    expect(effectivePublic(draft, TEEN)).toBe(false);
    expect(effectivePublic({ ...draft, wantsPublic: true }, TEEN)).toBe(false);
  });
  it('the teen body says private', () => {
    expect(buildCreateBody(ready({ wantsPublic: true }), TEEN)!.isPublic).toBe(false);
    expect(visibilityNote(ready(), TEEN)).toMatch(/stay private until your account is a confirmed 18\+/);
    expect(visibilityNote(ready(), ADULT)).toMatch(/reviews every public card first/);
    expect(visibilityNote(ready({ wantsPublic: false }), ADULT)).toMatch(/only you/);
  });
});

describe('the card body', () => {
  it("carries the rights record in the family's current words, and the tick as the licence", () => {
    const b = buildCreateBody(ready(), ADULT, new Date('2026-10-06T00:00:00Z'))!;
    expect(b.licenseAccepted).toBe(true);
    expect(b.art.rights).toEqual({ text: RIGHTS_VERSIONS['media-2026-10-06'].text, version: 'media-2026-10-06', at: '2026-10-06T00:00:00.000Z' });
    expect(validateArtPayload(b.art)).toEqual({ ok: true });
    expect(b).toMatchObject({ title: 'Dawn', primary: 'writing', secondary: [] });
    expect('sportDesignation' in b).toBe(false);
  });
  it('music gets the sound wording', () => {
    const music: ArtPayloadBody = { kind: 'music', trackId: 't', stemUrls: [], coverArtUrl: '', bpm: 96, keySignature: 'Am', mixUrl: 'https://s/x.wav', mime: 'audio/wav', durationSec: 30 };
    expect(buildCreateBody(ready({ discipline: 'music', art: music }), ADULT)!.art.rights!.version).toBe('music-2026-10-06');
  });
  it('a remix carries remixOf', () => {
    expect(buildCreateBody(ready({ remixOf: 'ccard_p' }), ADULT)!.remixOf).toBe('ccard_p');
    expect('remixOf' in buildCreateBody(ready(), ADULT)!).toBe(false);
  });
  it('null until details are done; the sport rides along only when sport is in', () => {
    expect(buildCreateBody(ready({ rightsTicked: false }), ADULT)).toBeNull();
    expect(buildCreateBody(ready({ secondary: ['sport'], sport: 'golf' }), ADULT)!.sportDesignation).toBe('golf');
  });
  it('null while a media field is still waiting to upload', () => {
    const music: ArtPayloadBody = { kind: 'music', trackId: 't', stemUrls: [], coverArtUrl: '', bpm: 96, keySignature: 'Am', mixUrl: pendingUrl('mixUrl'), mime: 'audio/wav', durationSec: 30 };
    const d = ready({ discipline: 'music', art: music });
    expect(canLeave('details', d, ADULT)).toBe(true);   // the placeholder passes the contract, so the steps work
    expect(buildCreateBody(d, ADULT)).toBeNull();
    const resolved = resolvePending(music, { mixUrl: 'https://storage.googleapis.com/b/pending/u/x.wav' })!;
    expect(buildCreateBody(ready({ discipline: 'music', art: resolved }), ADULT)!.art).toMatchObject({ mixUrl: 'https://storage.googleapis.com/b/pending/u/x.wav' });
  });
});

describe('pending uploads', () => {
  it('lists and resolves pending fields; a missing upload resolves to null', () => {
    const art = { kind: 'acting', sceneId: 's', performanceUrl: pendingUrl('performanceUrl'), voiceLineIds: [] };
    expect(PENDING_MEDIA.startsWith('https://')).toBe(true);
    expect(pendingFields(art)).toEqual(['performanceUrl']);
    expect(pendingFields({ kind: 'writing', text: PENDING_MEDIA.slice(0, 5) })).toEqual([]);
    expect(resolvePending(art, {})).toBeNull();
    expect(resolvePending(art, { performanceUrl: 'https://x/l.webm' })).toEqual({ ...art, performanceUrl: 'https://x/l.webm' });
  });
});

describe('publish-as-card links', () => {
  it('builds /create/<d> with only known params', () => {
    expect(publishHref('music')).toBe('/create/music');
    expect(publishHref('music', { from: 'academy', song: 'trk_123' })).toBe('/create/music?from=academy&song=trk_123');
    expect(publishHref('music', { from: 'dance-export', song: 'trk_1', chart: true })).toBe('/create/music?from=dance-export&song=trk_1&chart=1');
    expect(publishHref('cooking', { from: 'kitchens', title: '  Game-day oats  ' })).toBe('/create/cooking?from=kitchens&title=Game-day+oats');
    expect(publishHref('music', { from: 'academy', song: '../../etc' })).toBe('/create/music?from=academy');
    expect(publishHref('art', { from: 'hub', remix: 'ccard_u1_1700000000000' })).toBe('/create/art?from=hub&remix=ccard_u1_1700000000000');
    expect(readEntry({ remix: 'ccard_u1_1' })).toEqual({ from: null, remix: 'ccard_u1_1' });
    expect(readEntry({ remix: 'x y' })).toEqual({ from: null });
  });
  it('reads them back defensively', () => {
    expect(readEntry(new URLSearchParams('from=academy&song=trk_123'))).toEqual({ from: 'academy', song: 'trk_123' });
    expect(readEntry({ from: 'evil', song: '<script>', title: ' ', chart: '1' })).toEqual({ from: null, chart: true });
    expect(readEntry({ from: ['library', 'x'], title: 'x'.repeat(80) })).toEqual({ from: 'library', title: 'x'.repeat(60) });
    const round = readEntry(new URL(`https://fel${publishHref('music', { from: 'song-render', song: 'a_b-1', title: 'My Song', chart: true })}`).searchParams);
    expect(round).toEqual({ from: 'song-render', song: 'a_b-1', title: 'My Song', chart: true });
  });
});
