// MUSIC-SUITE P5 (2026-09-25), "The Flip, for real": StudioProject v3 — four banks, chop kits, baked Flip rows (a v2
// record migrates so it sounds the same), a section's own chops, a row's origin. Pure.
import { describe, expect, it } from 'vitest';
import { PAD_COUNT, padsFromSlices } from './Flip';
import {
  BANK_COUNT, MAX_CHOP_KITS, STUDIO_PROJECT_VERSION, bankHasSound, bankOf, deleteChopKit, emptyBank, emptyFlip, flipBanks, loadChopKit, migrateProject,
  newProject, projectAudioKeys, projectSignature, projectSummary, rebaseLegacyFlip, rowOrigin, saveChopKit, sectionChopsFor, stampSectionChops, stepAt,
  withBank, withFlipRow, withTrackStep,
  type ProjectFlipBank, type ProjectFlipRow, type ProjectFlipSource, type ProjectSection, type StudioProject,
} from './StudioProject';
import { chopSignature, publishTracks, remixSeed } from './studioEdit';
import { NOW, ref, representativeProject, steps } from '@/tests/fixtures/music/studioProject';

const fel = (id: string): ProjectFlipSource => ({ id, label: id, kind: 'fel', note: 'FEL', url: `/audio/flip/audio/${id}.mp3` });
const own = (key: string): ProjectFlipSource => ({ id: `mic_${key}`, label: 'mic take', kind: 'own', note: 'mine', audio: ref(key) });
const bank = (source: ProjectFlipSource | null, n = 4, over: Partial<ProjectFlipBank> = {}): ProjectFlipBank => ({
  source, slicing: 'grid', gridN: n, chops: padsFromSlices(Array.from({ length: n }, (_, i) => ({ start: i * 100, end: (i + 1) * 100 }))), rate: 48000, ...over,
});
const row = (pad: number, over: Partial<ProjectFlipRow> = {}): ProjectFlipRow => ({
  sampleId: `flip_${pad}`, pad, label: `FLIP ${pad + 1}`, source: fel('loop_ep_soul'), slice: { start: 0, end: 100 }, reverse: false, pitch: 0, gate: true, rate: 48000, ...over,
});
const byId = (p: Pick<StudioProject, 'tracks'>, id: string) => p.tracks.find((t) => t.sampleId === id)!;
const roundTrip = (p: StudioProject) => migrateProject(JSON.parse(JSON.stringify(p)), { now: NOW });

describe('four banks (A–D)', () => {
  it('bank A is the FLIP tab\'s top-level fields (the P4 shape); B–D are written only once one holds something', () => {
    expect(BANK_COUNT).toBe(4);
    const f = emptyFlip();
    expect(flipBanks(f)).toHaveLength(4);
    expect(flipBanks(f).every((b) => !bankHasSound(b))).toBe(true);
    const a = withBank(f, 0, bank(fel('theme_a_sunday_tape')));
    expect(a.source?.id).toBe('theme_a_sunday_tape');
    expect('otherBanks' in a).toBe(false);
    const c = withBank(a, 2, bank(own('aud_c')));
    expect(c.otherBanks).toEqual([null, bank(own('aud_c'))]);
    expect(bankOf(c, 2).source?.id).toBe('mic_aud_c');
    expect(bankOf(c, 1)).toEqual(emptyBank());
    expect(bankOf(c, 0).source?.id).toBe('theme_a_sunday_tape');
    // clearing C gives back the P4 shape exactly (autosave sees no edit)
    const back = withBank(c, 2, emptyBank());
    expect(back).toEqual(a);
    expect(withBank(a, 0, emptyBank()).rate).toBeUndefined();
  });
  it('the whole FLIP tab round-trips through the store: every bank, its slicing (FEL cuts too), its rate', () => {
    let p = newProject({ now: NOW, id: 'prj_banks' });
    p = { ...p, flip: withBank(withBank(withBank(p.flip, 0, bank(fel('loop_bass_riff'), 8, { slicing: 'cuts' })), 1, bank(own('aud_b'), 3)), 3, bank(fel('bank_kit_fel'), 14, { slicing: 'cuts', rate: 44100 })) };
    const m = roundTrip(p);
    expect(m.ok && m.issues).toEqual([]);
    if (!m.ok) return;
    expect(m.project).toEqual(p);
    expect(flipBanks(m.project.flip).map((b) => b.source?.id ?? null)).toEqual(['loop_bass_riff', 'mic_aud_b', null, 'bank_kit_fel']);
    expect(bankOf(m.project.flip, 3).slicing).toBe('cuts');
    expect(projectSummary(m.project).flip).toBe(true);
    expect([...projectAudioKeys(m.project)]).toContain('aud_b');          // a parked bank's mic take is kept by the store
  });
  it('a damaged bank list is repaired and said', () => {
    const p = newProject({ now: NOW });
    const raw = JSON.parse(JSON.stringify({ ...p, flip: { ...p.flip, otherBanks: [7, { source: { id: 'x', label: 'x', kind: 'third-party', url: '/audio/x.wav' }, chops: [] }, null, bank(fel('x'))] } }));
    const m = migrateProject(raw, { now: NOW });
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    expect(m.issues).toEqual(expect.arrayContaining(['bank B unreadable (emptied)', 'bank C: the Flip source was unreadable (unloaded)', '1 bank(s) past D (dropped)']));
    expect(flipBanks(m.project.flip).every((b) => !bankHasSound(b))).toBe(true);
    expect('otherBanks' in m.project.flip).toBe(false);
  });
});

describe('chop kits: a bank under a name, loaded into any bank', () => {
  const base = (): StudioProject => {
    const p = newProject({ now: NOW, id: 'prj_kits' });
    return { ...p, flip: withBank(p.flip, 0, bank(own('aud_kit'), 6)) };
  };
  it('save a bank as a kit (a copy — later edits to the bank leave it), load it into bank C, round-trip, delete', () => {
    let p = base();
    const s = saveChopKit(p.flip, 0, '  Dusty   chops ', { now: NOW, id: 'kit_1' })!;
    expect(s.kit.name).toBe('Dusty chops');
    p = { ...p, flip: s.flip };
    // edit bank A afterwards: the kit keeps what it was saved with
    p = { ...p, flip: withBank(p.flip, 0, { ...bankOf(p.flip, 0), chops: padsFromSlices([{ start: 0, end: 5 }]) }) };
    expect(p.flip.kits![0].bank.chops.filter((c) => c.slice)).toHaveLength(6);
    p = { ...p, flip: loadChopKit(p.flip, 'kit_1', 2) };
    expect(bankOf(p.flip, 2).chops.filter((c) => c.slice)).toHaveLength(6);
    expect(bankOf(p.flip, 2)).not.toBe(p.flip.kits![0].bank);             // a copy both ways
    const m = roundTrip(p);
    expect(m.ok && m.issues).toEqual([]);
    expect(m.ok && m.project).toEqual(p);
    expect([...projectAudioKeys(p)]).toContain('aud_kit');
    // a kit whose source is only in the kit still keeps its audio
    const onlyKit = { ...p, flip: withBank(withBank(p.flip, 0, emptyBank()), 2, emptyBank()) };
    expect([...projectAudioKeys(onlyKit)]).toContain('aud_kit');
    const gone = deleteChopKit(p.flip, 'kit_1');
    expect('kits' in gone).toBe(false);
    expect(deleteChopKit(gone, 'kit_1')).toBe(gone);
    expect(loadChopKit(gone, 'nope', 1)).toBe(gone);
  });
  it('names are unique; a bank with nothing in it, a blank name or a full shelf saves nothing', () => {
    let f = base().flip;
    f = saveChopKit(f, 0, 'Kit', { now: NOW, id: 'a' })!.flip;
    expect(saveChopKit(f, 0, 'kit', { now: NOW, id: 'b' })!.kit.name).toBe('kit (2)');
    expect(saveChopKit(f, 1, 'Empty bank', { now: NOW })).toBeNull();
    expect(saveChopKit(f, 0, '   ', { now: NOW })).toBeNull();
    for (let i = 1; i < MAX_CHOP_KITS; i++) f = saveChopKit(f, 0, `k${i}`, { now: NOW, id: `k${i}` })!.flip;
    expect(f.kits).toHaveLength(MAX_CHOP_KITS);
    expect(saveChopKit(f, 0, 'one more', { now: NOW })).toBeNull();
  });
  it('a damaged kit is dropped and said', () => {
    const p = base();
    const raw = JSON.parse(JSON.stringify({ ...p, flip: { ...p.flip, kits: [{ id: 'k', name: 'ok', savedAt: 1, bank: bank(fel('x')) }, { id: 'k', name: 'dup', bank: bank(fel('y')) }, { name: 'no id' }, 3] } }));
    const m = migrateProject(raw, { now: NOW });
    expect(m.ok && m.project.flip.kits?.map((k) => k.name)).toEqual(['ok']);
    expect(m.ok && m.issues).toContain('3 chop kits unreadable or past the 24 cap (dropped)');
  });
});

describe('a Flip row remembers the pad it came from', () => {
  it('bank B\'s pad 3 on row 1: its origin round-trips; bank A\'s own-number row stores none; a bad origin is dropped', () => {
    const b = row(1, { origin: { bank: 1, pad: 3 }, label: 'FLIP 2 · B4' });
    let p = withFlipRow(withFlipRow(newProject({ now: NOW, id: 'prj_o' }), row(3)), b);
    const m = roundTrip(p);
    expect(m.ok && m.project.flipRows).toEqual(p.flipRows);
    expect(rowOrigin(p.flipRows[0])).toEqual({ bank: 0, pad: 3 });
    expect(rowOrigin(b)).toEqual({ bank: 1, pad: 3 });
    p = { ...p, flipRows: [row(2, { origin: { bank: 9, pad: 3 } }), row(4, { origin: { bank: 0, pad: 4 } })] };
    const n = roundTrip(p);
    expect(n.ok && n.project.flipRows.map((r) => 'origin' in r)).toEqual([false, false]);
  });
});

describe('a section keeps its own chops', () => {
  const grid = (): StudioProject => {
    let p = withFlipRow(newProject({ now: NOW, id: 'prj_sec' }), row(0, { source: own('aud_v1') }));
    p = { ...p, tracks: withTrackStep(p.tracks, 'flip_0', 0, { on: true }) };
    return p;
  };
  it('a new section is stamped with the rows\' chops; a rename or a chain edit is not restamped; UPDATE FROM GRID is', () => {
    const p = grid();
    const verse: ProjectSection = { id: 'verse_1', name: 'verse', swing: 0.1, tracks: p.tracks.map((t) => ({ ...t, pattern: [...t.pattern] })) };
    const s1 = stampSectionChops([], [verse], p.flipRows);
    expect(s1[0].chops?.map((r) => r.source.id)).toEqual(['mic_aud_v1']);
    expect(s1[0].chops![0]).not.toBe(p.flipRows[0]);                      // its own copy
    // the pad is re-sent with another chop: the verse keeps the one it was saved with
    const rows2 = [row(0, { source: fel('loop_ep_soul'), pitch: 4 })];
    const renamed = [{ ...s1[0], name: 'hook' }];
    expect(stampSectionChops(s1, renamed, rows2)[0].chops![0].source.id).toBe('mic_aud_v1');
    expect(stampSectionChops(s1, s1, rows2)).toBe(s1);                      // nothing new: the same list
    const retaken = [{ ...s1[0], tracks: s1[0].tracks.map((t) => ({ ...t })) }];
    expect(stampSectionChops(s1, retaken, rows2)[0].chops![0]).toEqual(rows2[0]);
    const noFlip = { ...verse, id: 'intro_1', tracks: verse.tracks.filter((t) => !t.sampleId.startsWith('flip_')) };
    expect('chops' in stampSectionChops([], [noFlip], p.flipRows)[0]).toBe(false);
  });
  it('song mode plays the section\'s own chop, else the grid\'s; round-trips; its audio is kept', () => {
    const p = grid();
    const [verse] = stampSectionChops([], [{ id: 'v', name: 'verse', swing: 0, tracks: p.tracks }], p.flipRows);
    const q: StudioProject = { ...withFlipRow(p, row(0, { source: fel('loop_ep_soul') })), sections: [verse], chain: [{ sectionId: 'v', bars: 2 }] };
    expect(sectionChopsFor(verse, q.flipRows).map((r) => r.source.id)).toEqual(['mic_aud_v1']);
    expect(sectionChopsFor({ tracks: verse.tracks }, q.flipRows).map((r) => r.source.id)).toEqual(['loop_ep_soul']);
    expect(sectionChopsFor(null, q.flipRows)).toEqual(q.flipRows);
    expect([...projectAudioKeys(q)]).toContain('aud_v1');                  // only the verse still plays the mic take
    const m = roundTrip(q);
    expect(m.ok && m.issues).toEqual([]);
    expect(m.ok && m.project.sections[0].chops).toEqual(verse.chops);
  });
});

describe('migrate v2 → v3: a v2 grid sounds the same with its chops baked', () => {
  /** A P4 (v2) record: a +5 pad's row with P4's padNote notes (65) and one step the player moved to 67; a −3 row with no notes. */
  const v2 = (): Record<string, unknown> => {
    const p = newProject({ now: NOW, id: 'prj_v2' });
    const up = row(1, { pitch: 5 }), down = row(2, { pitch: -3, gate: true }), flat = row(3);
    let tracks = [...p.tracks,
      { sampleId: 'flip_1', pattern: steps([0, 4]), volume: 0.9, muted: false, pan: 0, notes: new Array(16).fill(65).map((n, i) => (i === 4 ? 67 : n)) },
      { sampleId: 'flip_2', pattern: steps([8]), volume: 0.9, muted: false, pan: 0 },
      { sampleId: 'flip_3', pattern: steps([12]), volume: 0.9, muted: false, pan: 0 }];
    tracks = JSON.parse(JSON.stringify(tracks));
    const raw = JSON.parse(JSON.stringify({ ...p, v: 2, tracks, flipRows: [up, down, flat], sections: [{ id: 's', name: 'verse', swing: 0, tracks }] }));
    return raw;
  };
  it('each row\'s notes move down by its pitch (none = 60 − pitch on every step), sections too; every row\'s gate goes off', () => {
    const m = migrateProject(v2(), { now: NOW });
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    expect(m.from).toBe(2);
    expect(m.project.v).toBe(STUDIO_PROJECT_VERSION);
    expect(m.issues).toEqual([]);                                           // a migration, not a repair
    expect(stepAt(byId(m.project, 'flip_1'), 0)).toEqual({ on: true, note: 60 });   // was 65 on the raw chop = the +5 pad as tuned
    expect(stepAt(byId(m.project, 'flip_1'), 4)).toEqual({ on: true, note: 62 });   // the player's +2 above the pad, kept
    expect(byId(m.project, 'flip_2').notes).toEqual(new Array(16).fill(63));        // raw chop (60) on a −3 baked chop
    expect(byId(m.project, 'flip_3').notes).toBeUndefined();                          // pitch 0: nothing to move
    expect(byId(m.project.sections[0], 'flip_1').notes![0]).toBe(60);
    expect(byId(m.project.sections[0], 'flip_2').notes![8]).toBe(63);
    expect(m.project.flipRows.map((r) => r.gate)).toEqual([false, false, false]);     // a v2 row played its whole chop
    expect(m.project.flipRows.map((r) => r.pitch)).toEqual([5, -3, 0]);              // the pitch is the chop's now
    // …and a v3 record is never moved again
    const again = roundTrip(m.project);
    expect(again.ok && again.project).toEqual(m.project);
  });
  it('rebaseLegacyFlip folds a note that would leave the row\'s ±2 octaves back in by octaves', () => {
    const t = [{ sampleId: 'flip_0', pattern: steps([0]), volume: 1, muted: false, pan: 0, notes: new Array(16).fill(36) }];
    expect(rebaseLegacyFlip(t, [row(0, { pitch: 5 })])[0].notes![0]).toBe(43);       // 36 − 5 = 31 < 36: up an octave
  });
  it('the representative project (built as v3) round-trips unchanged', () => {
    const p = representativeProject();
    const m = roundTrip(p);
    expect(m.ok && m.project).toEqual(p);
    expect(projectSignature(p)).toBe(m.ok ? projectSignature(m.project) : '');
  });
});

describe('publish → remix carries a baked row and its melody', () => {
  it('a +4 gated-off row\'s chop and its notes / velocities come back exactly (v3 reads the chop as baked)', () => {
    let p = withFlipRow(newProject({ now: NOW }), row(0, { pitch: 4, gate: false, reverse: true }));
    p = { ...p, tracks: withTrackStep(withTrackStep(p.tracks, 'flip_0', 2, { on: true, note: 63, vel: 0.5 }), 'bass', 0, { on: true, note: 40, vel: 0.8 }) };
    const pub = publishTracks(p.tracks, p.flipRows, new Set(p.tracks.map((t) => t.sampleId)));
    expect(pub.silent).toEqual([]);
    const seed = remixSeed(JSON.parse(JSON.stringify(pub.tracks)), p.kit);
    expect(seed.dropped).toEqual([]);
    expect(seed.flipRows[0]).toMatchObject({ pitch: 4, gate: false, reverse: true, slice: { start: 0, end: 100 } });
    expect(stepAt(byId(seed, 'flip_0'), 2)).toEqual({ on: true, note: 63, vel: 0.5 });
    expect(stepAt(byId(seed, 'bass'), 0)).toEqual({ on: true, note: 40, vel: 0.8 });
    expect(PAD_COUNT).toBe(16);
  });
});

// MUSIC-SUITE P5 FIX PASS (2026-09-25): songs published by the DEPLOYED P3 / P4 builds (decision #20) sit in players'
// libraries. remixSeed read every record as v3 (baked chops), so the v2 → v3 migration never ran for them: a P4 row
// (pitch +5, notes 65, gate true, a 2 s slice) remixed at +10 semitones gated at 1.2 s. publishTracks marks a P5 chop
// `baked`; a record without the mark is read as v2.
describe('remix of a song published before P5 sounds as it was published', () => {
  /** A published row as the P3 / P4 builds wrote it: the chop with no `baked` mark. */
  const legacyRow = (notes?: number[], extra: Record<string, unknown> = {}) => ({
    sampleId: 'flip_0', pattern: steps([0, 8]), volume: 0.9, muted: false, pan: 0, ...(notes ? { notes } : {}), ...extra,
    chop: { pad: 0, label: 'FLIP 1', source: fel('loop_ep_soul'), slice: { start: 0, end: 96000 }, reverse: false, pitch: 5, gate: true, rate: 48000 },
  });

  it('a P5 publish marks every chop baked', () => {
    const p = withFlipRow(newProject({ now: NOW }), row(0, { pitch: 5 }));
    const pub = publishTracks(p.tracks, p.flipRows, new Set(p.tracks.map((t) => t.sampleId))).tracks;
    expect(pub.filter((t) => t.chop).map((t) => t.chop!.baked)).toEqual([true]);
  });

  it('a P4 record (pitch +5, every note 65 — P4 padNote — gate true) remixes to notes 60, pitch 5, gate OFF', () => {
    const seed = remixSeed(JSON.parse(JSON.stringify([legacyRow(new Array(16).fill(65))])), 'street');
    expect(seed.dropped).toEqual([]);
    expect(seed.flipRows[0]).toMatchObject({ pitch: 5, gate: false });
    expect(byId(seed, 'flip_0').notes).toEqual(new Array(16).fill(60));   // +5 baked, at 60: +5 — as the mixdown played it
    expect('baked' in seed.flipRows[0]).toBe(false);                       // the mark is the record's, never the project's
  });

  it('a P3 record (pitch +5, no notes — P3 played the raw chop) remixes to notes 55 on every step: the raw chop again', () => {
    const seed = remixSeed(JSON.parse(JSON.stringify([legacyRow()])), 'street');
    expect(byId(seed, 'flip_0').notes).toEqual(new Array(16).fill(55));
    expect(seed.flipRows[0].gate).toBe(false);
  });

  it('a P5 record is read as it was published (v3): nothing moves', () => {
    const baked = { ...legacyRow(new Array(16).fill(62)), chop: { ...legacyRow().chop, baked: true } };
    const seed = remixSeed(JSON.parse(JSON.stringify([baked])), 'street');
    expect(byId(seed, 'flip_0').notes).toEqual(new Array(16).fill(62));
    expect(seed.flipRows[0]).toMatchObject({ pitch: 5, gate: true });
  });

  it('FROM P4: a P4 melody (a bass line\'s notes and velocities, a lead) survives publish → remix through the legacy door', () => {
    const bass = { sampleId: 'bass', pattern: steps([0, 3, 8]), volume: 0.8, muted: false, pan: 0, notes: [40, 40, 40, 43, 40, 40, 40, 40, 45, 40, 40, 40, 40, 40, 40, 40], vels: new Array(16).fill(1).map((v, i) => (i === 3 ? 0.4 : v)) };
    const lead = { sampleId: 'lead', pattern: steps([2]), volume: 0.8, muted: false, pan: 0, notes: new Array(16).fill(69).map((n, i) => (i === 2 ? 72 : n)) };
    const seed = remixSeed(JSON.parse(JSON.stringify([bass, lead, legacyRow(new Array(16).fill(65))])), 'street');
    expect(stepAt(byId(seed, 'bass'), 3)).toEqual({ on: true, note: 43, vel: 0.4 });
    expect(stepAt(byId(seed, 'bass'), 8)).toEqual({ on: true, note: 45, vel: 1 });
    expect(stepAt(byId(seed, 'lead'), 2)).toEqual({ on: true, note: 72 });
  });
});

// MUSIC-SUITE P5 FIX PASS (2026-09-25): the migration left bank A's pads gated while their rows went gate-off, so the first
// ARM REC hit on an old project REPLACED the row with the pad's 1.2 s-gated chop (recordFlipHit: a gate difference is
// another chop) and toasted "now plays pad N's chop (it replaced the row's old one…)".
describe('migrate v2 → v3: a pad and the row it made stay one chop', () => {
  const v2WithPads = (): Record<string, unknown> => {
    const p = newProject({ now: NOW, id: 'prj_pads' });
    const src = fel('loop_ep_soul');
    const chops = padsFromSlices([{ start: 0, end: 100 }, { start: 0, end: 100 }, { start: 100, end: 200 }]).map((c, i) => (i === 1 ? { ...c, pitch: 5 } : c));
    const rows = [row(0), row(1, { pitch: 5 }), row(2, { slice: { start: 100, end: 190 } })];   // row 2: its pad was re-cut since
    const tracks = [...p.tracks, ...rows.map((r) => ({ sampleId: r.sampleId, pattern: steps([0]), volume: 0.9, muted: false, pan: 0 }))];
    return JSON.parse(JSON.stringify({ ...p, v: 2, tracks, flipRows: rows, flip: { source: src, slicing: 'grid', gridN: 3, chops, rate: 48000 } }));
  };
  it('each bank A pad that still holds its row\'s chop loses its gate with the row; a pad re-cut since keeps it', () => {
    const m = migrateProject(v2WithPads(), { now: NOW });
    expect(m.ok && m.issues).toEqual([]);
    if (!m.ok) return;
    expect(m.project.flipRows.map((r) => r.gate)).toEqual([false, false, false]);
    expect(m.project.flip.chops.slice(0, 3).map((c) => c.gate)).toEqual([false, false, true]);
    // the pad's chop and its row's are one sound again — the first recorded hit only lights the step
    for (const i of [0, 1]) {
      const pad = m.project.flip.chops[i], r = m.project.flipRows[i];
      expect(chopSignature({ source: m.project.flip.source!, slice: pad.slice!, reverse: pad.reverse, pitch: pad.pitch, gate: pad.gate, rate: m.project.flip.rate })).toBe(chopSignature(r));
    }
  });
  it('a v3 record\'s pads are never touched', () => {
    const m = migrateProject(v2WithPads(), { now: NOW });
    if (!m.ok) throw new Error('migrate');
    const gated = { ...m.project, flip: { ...m.project.flip, chops: m.project.flip.chops.map((c) => ({ ...c, gate: true })) } };
    const again = roundTrip(gated);
    expect(again.ok && again.project.flip.chops.slice(0, 3).map((c) => c.gate)).toEqual([true, true, true]);
  });
});

// MUSIC-SUITE P5 FIX PASS (2026-09-25; P4 deferred "a chop's own key"): the source keeps the pack's key through the door
describe('a source keeps its key', () => {
  it('a bank\'s and a row\'s source round-trip their key; a damaged one is dropped (the source kept)', () => {
    const keyed = { ...fel('theme_a_sunday_tape'), key: 'Eb major' };
    let p = { ...newProject({ now: NOW }), flip: withBank(emptyFlip(), 0, bank(keyed)) };
    p = withFlipRow(p, row(0, { source: { ...fel('stab_ep_cm9'), key: 'C4' } }));
    const m = roundTrip(p);
    expect(m.ok && m.issues).toEqual([]);
    expect(m.ok && m.project.flip.source?.key).toBe('Eb major');
    expect(m.ok && m.project.flipRows[0].source.key).toBe('C4');
    const bad = migrateProject(JSON.parse(JSON.stringify({ ...p, flip: withBank(emptyFlip(), 0, bank({ ...keyed, key: '<script>' })) })), { now: NOW });
    expect(bad.ok && bad.project.flip.source).toMatchObject({ id: 'theme_a_sunday_tape' });
    expect(bad.ok && 'key' in bad.project.flip.source!).toBe(false);
  });
});
