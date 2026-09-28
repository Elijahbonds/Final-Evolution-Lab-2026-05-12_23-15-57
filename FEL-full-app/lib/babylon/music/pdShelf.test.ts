// MUSIC-SUITE P5 (2026-09-25): the public-domain shelf ships empty, and only an owner-signed, complete, pre-1925 entry
// ever reaches the FLIP tab (owner decisions #15 and #28).
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PD_AUDIO_BASE, PD_LAST_YEAR, PD_SHELF, pdAudioAllowed, pdEntryProblems, pdSources, signedPdEntries, type PdEntry } from './pdShelf';
import { CREDITS, pdCredits } from '@/lib/credits/credits';
import { migrateProject, newProject } from './StudioProject';

const entry = (o: Partial<PdEntry> = {}): PdEntry => ({
  id: 'odjb_livery_1917', title: 'Livery Stable Blues', performer: 'Original Dixieland Jass Band', year: 1917,
  sourceUrl: 'https://www.loc.gov/item/jukebox-example/',
  whyFree: 'A US recording published in 1917 (public domain since 2022 under the Music Modernization Act) of a 1917 composition (public domain since 1993).',
  ownerSignedAt: '2026-09-27T10:00:00Z', ...o,
});

describe('the public-domain shelf', () => {
  it('ships with zero entries: nothing is shown and nothing is downloaded before the owner signs (decision #28)', () => {
    expect(PD_SHELF).toEqual([]);
    expect(signedPdEntries()).toEqual([]);
    expect(pdSources()).toEqual([]);
  });

  it('an entry the owner has not signed is listed, never shown', () => {
    expect(pdEntryProblems(entry({ ownerSignedAt: null }))).toEqual([]);
    expect(signedPdEntries([entry({ ownerSignedAt: null })])).toEqual([]);
  });

  it('a signed, complete entry becomes a public-domain source with its rationale, at /audio/pd/<id>.mp3', () => {
    const [s] = pdSources([entry()]);
    expect(s).toMatchObject({ id: 'pd_odjb_livery_1917', kind: 'public-domain', group: 'public-domain', url: `${PD_AUDIO_BASE}odjb_livery_1917.mp3` });
    expect(s.note).toContain('Original Dixieland Jass Band (1917), public domain in the US: A US recording published in 1917');
    expect(s.note.length).toBeLessThanOrEqual(240);
    // a saved project keeps it only while the REAL shelf's signed entry names it (MUSIC-SUITE P5 FIX PASS: the project's
    // door — pdAudioAllowed); this fixture is not on the shipped shelf, so the door refuses it
    const p = newProject({ now: 1 });
    const m = migrateProject(JSON.parse(JSON.stringify({ ...p, flip: { ...p.flip, source: { id: s.id, label: s.label, kind: s.kind, note: s.note, url: s.url } } })), { now: 2 });
    expect(m.ok && m.project.flip.source).toBeNull();
    expect(pdAudioAllowed(s.url!, [entry()])).toBe(true);
  });

  it('refuses what is not clearly free: 1925 or later, no https archive, no plain-words reason, a bad sign-off time', () => {
    expect(PD_LAST_YEAR).toBe(1924);
    expect(pdEntryProblems(entry({ year: 1925 })).join()).toMatch(/published before 1925/);
    expect(pdEntryProblems(entry({ sourceUrl: 'http://archive.org/details/x' })).join()).toMatch(/https/);
    expect(pdEntryProblems(entry({ whyFree: 'old' })).join()).toMatch(/why/);
    expect(pdEntryProblems(entry({ ownerSignedAt: 'yesterday' })).join()).toMatch(/ISO/);
    expect(pdEntryProblems(entry({ id: 'Bad Id' }))).toContain('id');
    for (const bad of [entry({ year: 1930 }), entry({ sourceUrl: 'nope' }), entry({ whyFree: '' }), entry({ ownerSignedAt: '2026-13-45' })]) {
      expect(signedPdEntries([bad])).toEqual([]);
    }
  });

  it('a duplicate id is shown once', () => {
    expect(signedPdEntries([entry(), entry({ title: 'again' })]).map((e) => e.title)).toEqual(['Livery Stable Blues']);
  });
});

// MUSIC-SUITE P5 FIX PASS (2026-09-25): the owner's signature, held at the files and at the project's door. PD-CANDIDATES.md
// orders the next session's steps as download → place at public/audio/pd/<id>.mp3 → paste the signed entry → add the
// test; between those steps (or after an entry is unsigned) a stored project or remix naming the file still played it.
describe('public/audio/pd and the signed entries are one list', () => {
  const APP = path.resolve(__dirname, '../../..');
  const dir = path.join(APP, 'public/audio/pd');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => !f.startsWith('.')) : [];

  it('every file under public/audio/pd has exactly one signed entry, and every signed entry has its file (none of either today)', () => {
    const signed = signedPdEntries();
    for (const f of files) expect(signed.filter((e) => `${e.id}.mp3` === f), `${f} has no signed entry`).toHaveLength(1);
    for (const e of signed) expect(files, `${e.id}.mp3 is missing`).toContain(`${e.id}.mp3`);
    expect(files.length).toBe(signed.length);
  });

  it('the door: a stored /audio/pd/ path plays only while its signed entry names it; every other /audio/ path is FEL\'s', () => {
    expect(pdAudioAllowed('/audio/pd/odjb_livery_1917.mp3')).toBe(false);                        // nothing signed today
    expect(pdAudioAllowed('/audio/pd/odjb_livery_1917.mp3', [entry()])).toBe(true);
    expect(pdAudioAllowed('/audio/pd/odjb_livery_1917.mp3', [entry({ ownerSignedAt: null })])).toBe(false);
    expect(pdAudioAllowed('/audio/pd/other.mp3', [entry()])).toBe(false);
    expect(pdAudioAllowed('/audio/flip/audio/theme_a_sunday_tape.mp3')).toBe(true);
    // through the project's one door: the source is refused (unloaded, and said)
    const p = newProject({ now: 1 });
    const raw = JSON.parse(JSON.stringify({ ...p, flip: { ...p.flip, source: { id: 'pd_x', label: 'x', kind: 'public-domain', note: 'n', url: '/audio/pd/odjb_livery_1917.mp3' } } }));
    const m = migrateProject(raw, { now: 2 });
    expect(m.ok && m.project.flip.source).toBeNull();
    expect(m.ok && m.issues).toEqual(['the Flip source was unreadable (unloaded)']);
  });

  it('each signed recording is credited by performer, year and why it is free (none today)', () => {
    expect(CREDITS.filter((c) => c.id.startsWith('pd-'))).toEqual([]);
    const [c] = pdCredits([entry()]);
    expect(c).toMatchObject({ id: 'pd-odjb_livery_1917', title: 'Livery Stable Blues', by: 'Original Dixieland Jass Band (1917)', covers: ['audio/pd/odjb_livery_1917.mp3'], status: 'open', link: 'https://www.loc.gov/item/jukebox-example/' });
    expect(c.used).toContain('public domain since 2022');
  });
});
