// MUSIC-SUITE P5 (2026-09-25): the public-domain shelf ships empty, and only an owner-signed, complete, pre-1925 entry
// ever reaches the FLIP tab (owner decisions #15 and #28).
//
// MUSIC-SUITE P7 (2026-09-29): owner decision #37 signed six real entries (musicsuite/DECISIONS-2.md, 2026-09-26); the
// mechanism tests below still use a synthetic `entry()` fixture with its own fake id, so they hold regardless of what
// is really on the shelf. The tests in this file that DID assert "the shelf is empty" now assert the real, signed six
// instead (public/audio/pd/PROVENANCE.json has the download record for each).
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

const REAL_SIGNED_IDS = [
  'odjb_livery_stable_1917', 'europe_castle_house_rag_1914', 'fisk_swing_low_1909',
  'mamie_smith_crazy_blues_1920', 'bessie_smith_downhearted_1923', 'whiteman_rhapsody_1924',
];

describe('the public-domain shelf', () => {
  it('ships owner decision #37\'s six, all signed, complete and old enough — nothing else (decision #28)', () => {
    expect(PD_SHELF).toHaveLength(6);
    expect(PD_SHELF.map((e) => e.id).sort()).toEqual([...REAL_SIGNED_IDS].sort());
    for (const e of PD_SHELF) expect(pdEntryProblems(e), e.id).toEqual([]);
    expect(signedPdEntries().map((e) => e.id).sort()).toEqual([...REAL_SIGNED_IDS].sort());
    expect(pdSources()).toHaveLength(6);
    for (const s of pdSources()) expect(s.kind).toBe('public-domain');
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

  it('every file under public/audio/pd has exactly one signed entry, and every signed entry has its file', () => {
    const signed = signedPdEntries();
    const mp3s = files.filter((f) => f.endsWith('.mp3'));
    for (const f of mp3s) expect(signed.filter((e) => `${e.id}.mp3` === f), `${f} has no signed entry`).toHaveLength(1);
    for (const e of signed) expect(mp3s, `${e.id}.mp3 is missing`).toContain(`${e.id}.mp3`);
    expect(mp3s.length).toBe(signed.length);
    expect(mp3s.length).toBe(6);
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

  it('each signed recording is credited by performer, year and why it is free, plus one credit for their shared record', () => {
    const all = CREDITS.filter((c) => c.id.startsWith('pd-'));
    const provenance = all.find((c) => c.id === 'pd-shelf-provenance')!;
    const real = all.filter((c) => c.id !== 'pd-shelf-provenance');
    expect(real.map((c) => c.id).sort()).toEqual(REAL_SIGNED_IDS.map((id) => `pd-${id}`).sort());
    for (const c of real) {
      expect(c.status).toBe('open');
      expect(c.licence).toBe('Public domain (US)');
      expect(c.covers).toEqual([`audio/pd/${c.id.slice(3)}.mp3`]);
      expect(c.link).toMatch(/^https:\/\//);
    }
    // public/audio/pd/PROVENANCE.json needs its own credit (every file under public/ must resolve to one), and its
    // manifestLicences must claim the exact per-entry `licence` string the record carries for each signed year
    expect(provenance).toMatchObject({ status: 'first-party', covers: ['audio/pd/PROVENANCE.json'] });
    expect(provenance.manifestLicences.sort()).toEqual(
      [...new Set(PD_SHELF.map((e) => `Public domain (US), sound recording published ${e.year}`))].sort(),
    );
    const odjb = real.find((c) => c.id === 'pd-odjb_livery_stable_1917')!;
    expect(odjb).toMatchObject({ title: 'Livery Stable Blues', by: 'Original Dixieland Jass Band (1917)', link: 'https://www.loc.gov/item/jukebox-186254/' });
    expect(odjb.used).toContain('public domain since 2022');

    // the synthetic fixture still exercises pdCredits() on its own, unrelated to what is really signed
    const [c] = pdCredits([entry()]);
    expect(c).toMatchObject({ id: 'pd-odjb_livery_1917', title: 'Livery Stable Blues', by: 'Original Dixieland Jass Band (1917)', covers: ['audio/pd/odjb_livery_1917.mp3'], status: 'open', link: 'https://www.loc.gov/item/jukebox-example/' });
    expect(c.used).toContain('public domain since 2022');
  });
});
