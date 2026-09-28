// MUSIC-SUITE P3 (2026-09-25): the StudioProject model — round-trip, migrate, and what a damaged record does.
import { describe, expect, it } from 'vitest';
import {
  BPM_RANGE, MAX_TITLE, PROJECT_STEPS, STUDIO_PROJECT_VERSION, cleanTitle, defaultProjectTitle, duplicateProject,
  emptyKitTracks, flipSampleId, migrateProject, newAudioKey, newProject, newProjectId, projectAudioKeys, projectSignature,
  projectSummary, refusalLine, renameProject, repairLine, withFlipHit, withFlipRow,
  type ProjectFlipRow, type StudioProject,
} from './StudioProject';
import { PERFORM_STEPS_PER_BAR } from './performSet';
import { KIT_SLOTS } from './SynthKit';
import { PAD_COUNT } from './Flip';
import { expandChainSwing } from './SongPanel';
import { expandChain } from './Song';
import { exportSongToDance } from './DanceExport';
import { NOW, representativeProject, steps } from '@/tests/fixtures/music/studioProject';

describe('a new project', () => {
  it('is the room as it opens: eight empty kit rows in KIT_SLOTS order, 92 BPM, 15 % swing, STREET, sixteen empty chops', () => {
    const p = newProject({ now: NOW });
    expect(p.v).toBe(STUDIO_PROJECT_VERSION);
    expect(PROJECT_STEPS).toBe(PERFORM_STEPS_PER_BAR);             // the grid's steps are PERFORM's
    expect(p.tracks.map((t) => t.sampleId)).toEqual(KIT_SLOTS.map((k) => k.id));
    expect(p.tracks.every((t) => t.pattern.length === 16 && t.pattern.every((s) => s === false))).toBe(true);
    expect([p.bpm, p.swing, p.kit]).toEqual([92, 0.15, 'street']);
    expect(p.flip.chops).toHaveLength(PAD_COUNT);
    expect(p.flip.source).toBeNull();
    expect([p.sections, p.chain, p.takes, p.flipRows]).toEqual([[], [], [], []]);
    expect(p.id).toMatch(/^prj_[0-9a-z]+$/);
    expect(p.title).toBe(defaultProjectTitle(NOW));
    expect(p.title).toMatch(/^Beat · [A-Z][a-z]{2} \d{1,2} \d\d:\d\d$/);
  });

  it('ids and audio keys are unique and carry the time they were made', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newProjectId(NOW)));
    expect(ids.size).toBe(200);
    expect(newAudioKey(NOW)).toMatch(new RegExp(`^aud_${NOW.toString(36)}[0-9a-z]{4}$`));
  });
});

describe('round-trip', () => {
  it('a representative project survives JSON (what the store writes) exactly, with no repairs', () => {
    const p = representativeProject();
    expect(projectSummary(p)).toEqual({ hits: 14 + 2, sections: 2, bars: 7, takes: 2, flip: true });
    const back = migrateProject(JSON.parse(JSON.stringify(p)), { now: NOW + 1 });
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.issues).toEqual([]);
    expect(back.from).toBe(STUDIO_PROJECT_VERSION);
    expect(back.project).toEqual(p);
    expect(projectSignature(back.project)).toBe(projectSignature(p));
  });

  it('structuredClone (what IndexedDB does) round-trips too', () => {
    const p = representativeProject();
    const back = migrateProject(structuredClone(p), { now: NOW });
    expect(back.ok && back.project).toEqual(p);
  });

  it('the signature ignores the save stamp, and nothing else', () => {
    const p = representativeProject();
    expect(projectSignature({ ...p, updatedAt: p.updatedAt + 9999 })).toBe(projectSignature(p));
    expect(projectSignature({ ...p, bpm: p.bpm + 1 })).not.toBe(projectSignature(p));
    expect(projectSignature(withFlipHit(p, 'kick', 1))).not.toBe(projectSignature(p));
    // field order is not content: a take written { audio, id, … } is the same take
    const reordered = { ...p, takes: p.takes.map(({ audio, ...rest }) => ({ audio, ...rest })) };
    expect(projectSignature(reordered)).toBe(projectSignature(p));
  });
});

describe('P2 deferred item: each section carries its own swing', () => {
  it('the project keeps it, and song mode / the song render get each bar at its section\'s swing', () => {
    const p = representativeProject();
    const back = migrateProject(JSON.parse(JSON.stringify(p)), { now: NOW });
    if (!back.ok) throw new Error('refused');
    expect(back.project.sections.map((s) => s.swing)).toEqual([0, 0.4]);
    const perBar = expandChainSwing(back.project.chain, back.project.sections, back.project.swing);
    expect(perBar).toEqual([0, 0, 0.4, 0.4, 0.4, 0.4, 0]);
    expect(perBar).toHaveLength(expandChain(back.project.chain, back.project.sections).length);
  });

  it('a section saved before P3 (no swing) takes the record\'s swing when migrated — a migration, not a repair', () => {
    const v0 = { bpm: 96, swing: 0.3, tracks: emptyKitTracks(), sections: [{ id: 'old', name: 'verse', tracks: emptyKitTracks() }], chain: [{ sectionId: 'old', bars: 2 }] };
    const m = migrateProject(v0, { now: NOW });
    expect(m.ok && m.project.sections[0].swing).toBe(0.3);
    expect(m.ok && m.issues).toEqual([]);
  });
});

describe('the dance export keeps the project\'s title and id (was \'My Track\' and a fresh id per mount)', () => {
  it('the same project exports the same chart, before and after a reload', () => {
    const p = representativeProject();
    const song = (q: StudioProject) => ({ id: q.id, name: q.title, bpm: q.bpm, steps: PROJECT_STEPS, chain: q.chain, sections: q.sections });
    const a = exportSongToDance(song(p));
    const reloaded = migrateProject(JSON.parse(JSON.stringify(p)), { now: NOW + 86_400_000 });
    if (!reloaded.ok) throw new Error('refused');
    const b = exportSongToDance(song(reloaded.project));
    expect(a).not.toBeNull();
    expect(a!.track.name).toBe('LATE NIGHT LOOP');
    expect(a!.track.id).toBe('song_prj_test0001');
    expect(b).toEqual(a);                                          // same id → same seed → same routine
  });
});

describe('migrate: versions', () => {
  it('v0 (the unversioned room state) becomes the current version with an id, a title, empty takes / Flip / mixer', () => {
    const v0 = { bpm: 100, swing: 0.1, kit: 'dust', polished: true, tracks: emptyKitTracks().map((t, i) => (i === 0 ? { ...t, pattern: steps([0]) } : t)), sections: [], chain: [] };
    const m = migrateProject(v0, { now: NOW, newId: () => 'prj_fromv0' });
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    expect(m.from).toBe(0);
    expect(m.issues).toEqual([]);
    expect(m.project).toMatchObject({ v: STUDIO_PROJECT_VERSION, id: 'prj_fromv0', bpm: 100, swing: 0.1, kit: 'dust', takes: [], flipRows: [], remixOf: null, createdAt: NOW, updatedAt: NOW });
    expect(m.project.mixer.polish).toBe(true);
    expect(m.project.title).toBe(defaultProjectTitle(NOW));
    expect(m.project.tracks[0].pattern[0]).toBe(true);
  });

  it('a record from a newer FEL is refused, not rewritten — the room opens a fresh project and says why', () => {
    const p = { ...representativeProject(), v: STUDIO_PROJECT_VERSION + 1 };
    const m = migrateProject(p, { now: NOW });
    expect(m).toMatchObject({ ok: false, reason: 'newer-version' });
    if (m.ok) return;
    expect(m.detail).toContain(`v${STUDIO_PROJECT_VERSION + 1}`);
    const line = refusalLine(m, 'Late Night Loop');
    expect(line).toContain('"Late Night Loop" couldn\'t be opened');
    expect(line).toContain('newer version of FEL');
    expect(line).toContain('kept in MY PROJECTS');
  });

  it('a damaged version mark is refused', () => {
    for (const v of ['1', -1, 1.5, null, {}]) {
      const m = migrateProject({ ...representativeProject(), v }, { now: NOW });
      expect(m.ok, JSON.stringify(v)).toBe(false);
    }
  });
});

describe('migrate: corrupt records never throw', () => {
  it('not a project at all → refused with a reason', () => {
    for (const raw of [null, undefined, 'garbage', 42, [], [1, 2], { v: 1 }, { v: 1, tracks: 'x' }, { hello: 'world' }]) {
      const m = migrateProject(raw, { now: NOW });
      expect(m.ok, JSON.stringify(raw)).toBe(false);
      if (!m.ok) expect(['not-a-project', 'bad-version']).toContain(m.reason);
    }
  });

  it('junk in every field is repaired or refused, never thrown on', () => {
    const junk: unknown[] = [null, undefined, 'x', -1, 1e12, NaN, Infinity, true, [], {}, [null], [{}], { a: 1 }];
    const base = JSON.parse(JSON.stringify(representativeProject())) as Record<string, unknown>;
    for (const field of Object.keys(base)) {
      for (const j of junk) {
        const raw = { ...base, [field]: j };
        expect(() => migrateProject(raw, { now: NOW }), `${field} = ${String(j)}`).not.toThrow();
        const m = migrateProject(raw, { now: NOW });
        if (m.ok) {
          expect(m.project.tracks.slice(0, 8).map((t) => t.sampleId)).toEqual(KIT_SLOTS.map((k) => k.id));
          expect(m.project.flip.chops).toHaveLength(PAD_COUNT);
          expect(m.project.bpm).toBeGreaterThanOrEqual(BPM_RANGE[0]);
          expect(m.project.bpm).toBeLessThanOrEqual(BPM_RANGE[1]);
        }
      }
    }
  });

  it('damaged parts are repaired and EVERY repair is named (nothing dropped without a line)', () => {
    const p = JSON.parse(JSON.stringify(representativeProject()));
    p.bpm = 999;                                                                     // 1: tempo clamped
    p.tracks[0].pattern = p.tracks[0].pattern.slice(0, 12);                          // 2: 12 steps read as 16
    p.tracks.push({ sampleId: 'cowbell', pattern: steps([1]), volume: 1, muted: false, pan: 0 });   // 3: unknown row
    p.tracks = p.tracks.filter((t: { sampleId: string }) => t.sampleId !== 'fx');   // 4: a kit row missing
    p.chain.push({ sectionId: 'ghost', bars: 2 });                                   // 5: chain to nowhere
    p.takes.push({ id: 't3', atBar: 1, gain: 1, durationSec: 1 });                   // 6: take without audio
    p.flipRows[0].sampleId = 'flip_9';                                               // 7: row id ≠ its pad
    const m = migrateProject(p, { now: NOW });
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    expect(m.issues).toHaveLength(7);
    expect(m.issues.join(' | ')).toMatch(/tempo 999 read as 160 BPM/);
    expect(m.issues.join(' | ')).toMatch(/12 steps read as 16/);
    expect(m.issues.join(' | ')).toMatch(/unknown row "cowbell"/);
    expect(m.issues.join(' | ')).toMatch(/FX row was missing/);
    expect(m.issues.join(' | ')).toMatch(/1 entry pointed at nothing/);
    expect(m.issues.join(' | ')).toMatch(/take 3 unreadable/);
    expect(m.issues.join(' | ')).toMatch(/Flip row 1/);
    expect(m.project.bpm).toBe(160);
    expect(m.project.tracks.map((t) => t.sampleId)).toEqual([...KIT_SLOTS.map((k) => k.id), 'flip_1']);
    expect(m.project.takes).toHaveLength(2);
    const line = repairLine(m.project.title, m.issues);
    expect(line).toContain('with 7 repairs');
    expect(line).toContain('(+5 more)');
    expect(repairLine('x', [])).toBeNull();
  });

  it('a stored record never makes the room fetch somebody else\'s URL (first-party /audio/ paths only)', () => {
    const p = JSON.parse(JSON.stringify(representativeProject()));
    p.flip.source = { id: 'x', label: 'someone else', kind: 'fel', note: '', url: 'https://example.com/hit-song.mp3' };
    const m = migrateProject(p, { now: NOW });
    expect(m.ok && m.project.flip.source).toBeNull();
    expect(m.ok && m.issues.some((i) => /Flip source was unreadable/.test(i))).toBe(true);
    const bad = ['/audio/../secret', '/api/sessions', '//evil.test/a.wav'];
    for (const url of bad) {
      p.flip.source = { id: 'x', label: 'x', kind: 'fel', note: '', url };
      const r = migrateProject(p, { now: NOW });
      expect(r.ok && r.project.flip.source, url).toBeNull();
    }
    p.flip.source = { id: 'fel_808_kick', label: '808 kick', kind: 'fel', note: '', url: '/audio/kits/808/kick.wav' };
    const ok = migrateProject(p, { now: NOW });
    expect(ok.ok && ok.project.flip.source?.url).toBe('/audio/kits/808/kick.wav');
    p.flip.source = { id: 'x', label: 'x', kind: 'third-party', note: '', url: '/audio/kits/808/kick.wav' };
    const kind = migrateProject(p, { now: NOW });
    expect(kind.ok && kind.project.flip.source).toBeNull();          // only fel / own / public-domain (Flip.ts)
  });
});

describe('edits', () => {
  it('rename trims, caps and never blanks the name', () => {
    const p = newProject({ now: NOW, title: 'A' });
    expect(renameProject(p, '  Night   Drive  ').title).toBe('Night Drive');
    expect(renameProject(p, '   ')).toBe(p);
    expect(renameProject(p, 'x'.repeat(200)).title).toHaveLength(MAX_TITLE);
    expect(cleanTitle(42)).toBeNull();
  });

  it('duplicate is a deep copy under a new id and name; the audio is shared, not copied', () => {
    const p = representativeProject();
    const d = duplicateProject(p, { now: NOW + 5, id: 'prj_dup' });
    expect(d.id).toBe('prj_dup');
    expect(d.title).toBe('Late Night Loop (copy)');
    expect([d.createdAt, d.updatedAt]).toEqual([NOW + 5, NOW + 5]);
    d.tracks[0].pattern[1] = true;
    d.sections[0].tracks[0].pattern[1] = true;
    expect(p.tracks[0].pattern[1]).toBe(false);
    expect(p.sections[0].tracks[0].pattern[1]).toBe(false);
    expect([...projectAudioKeys(d)].sort()).toEqual([...projectAudioKeys(p)].sort());
    expect(duplicateProject({ ...p, title: 'y'.repeat(MAX_TITLE) }, { now: NOW }).title.length).toBeLessThanOrEqual(MAX_TITLE);
  });

  it('knows every audio key it holds (takes, the Flip source, each row\'s source)', () => {
    expect([...projectAudioKeys(representativeProject())].sort()).toEqual(['aud_mfz1abcd1234', 'aud_mfz1abcd5678', 'aud_mfz1abcd9999']);
    expect(projectAudioKeys(newProject({ now: NOW })).size).toBe(0);
  });

  it('a pad sent to the grid gets its row and remembers its chop; sending it again replaces the chop, not the steps', () => {
    const p = newProject({ now: NOW });
    const src = { id: 'fel_808_bass', label: '808 bass', kind: 'fel' as const, note: '', url: '/audio/kits/808/bass.wav' };
    const row = (start: number): ProjectFlipRow => ({ sampleId: flipSampleId(3), pad: 3, label: 'FLIP 4', source: src, slice: { start, end: start + 500 }, reverse: false, pitch: 0, gate: true });
    const a = withFlipHit(withFlipRow(p, row(0)), 'flip_3', 5);
    expect(a.tracks.map((t) => t.sampleId).slice(-1)).toEqual(['flip_3']);
    expect(a.tracks.at(-1)!.pattern[5]).toBe(true);
    const b = withFlipRow(a, row(700));
    expect(b.flipRows).toHaveLength(1);
    expect(b.flipRows[0].slice.start).toBe(700);
    expect(b.tracks.at(-1)!.pattern[5]).toBe(true);
    expect(withFlipHit(b, 'flip_3', 16)).toBe(b);                   // off the grid: no change
  });
});

// MUSIC-SUITE P3 FIX PASS (2026-09-25): the sample rate slice points count in, and the upload mark (owner decision #15)
describe('the Flip tab keeps its slices\' sample rate and its upload mark', () => {
  it('rate: kept on the tab and on a row when sane; dropped (the reader\'s rate) when not; absent stays absent', () => {
    const p = representativeProject();
    const raw = JSON.parse(JSON.stringify({ ...p, flip: { ...p.flip, rate: 48000 }, flipRows: p.flipRows.map((r) => ({ ...r, rate: 44100 })) }));
    const m = migrateProject(raw, { now: NOW });
    expect(m.ok && m.project.flip.rate).toBe(48000);
    expect(m.ok && m.project.flipRows[0].rate).toBe(44100);
    const bad = migrateProject({ ...raw, flip: { ...raw.flip, rate: 7 }, flipRows: raw.flipRows.map((r: object) => ({ ...r, rate: 'fast' })) }, { now: NOW });
    expect(bad.ok && bad.project.flip.rate).toBeUndefined();
    expect(bad.ok && bad.project.flipRows[0].rate).toBeUndefined();
    const none = migrateProject(JSON.parse(JSON.stringify(p)), { now: NOW });
    expect(none.ok && 'rate' in none.project.flip).toBe(false);
    expect(none.ok && none.project).toEqual(p);                      // a v1 record without it reads back unchanged
  });

  it('upload: only `true` is kept', () => {
    const p = representativeProject();
    const src = { ...p.flip.source!, upload: true };
    const m = migrateProject(JSON.parse(JSON.stringify({ ...p, flip: { ...p.flip, source: src } })), { now: NOW });
    expect(m.ok && m.project.flip.source?.upload).toBe(true);
    const n = migrateProject(JSON.parse(JSON.stringify({ ...p, flip: { ...p.flip, source: { ...src, upload: 'yes' } } })), { now: NOW });
    expect(n.ok && n.project.flip.source && 'upload' in n.project.flip.source).toBe(false);
  });
});
