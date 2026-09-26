// MUSIC-SUITE P4 (2026-09-25): StudioProject v2 — a step's note and velocity, the song's key, the mixer — and how a P3
// (v1) record migrates into it. Pure.
import { describe, expect, it } from 'vitest';
import {
  STUDIO_PROJECT_VERSION, channelOf, emptyKitTracks, migrateProject, mixerOf, moveRowNotes, newProject, padNote, projectFromSeed, projectSignature,
  setProjectKey, stepAt, stepsOf, withChannel, withFlipHit, withFlipRow, withMaster, withStep, withTrackStep, type ProjectFlipRow, type StudioProject,
} from './StudioProject';
import { remixSeed } from './studioEdit';
import { DEFAULT_KEY, inScale, type SongKey } from './scales';
import { DEFAULT_CHANNEL, TAKES_CHANNEL } from './mixGraph';
import { VOICE_ROOTS } from './SynthKit';
import { NOW, representativeProject, steps } from '@/tests/fixtures/music/studioProject';

const byId = (p: Pick<StudioProject, 'tracks'>, id: string) => p.tracks.find((t) => t.sampleId === id)!;

/** A P3 (v1) record as the store holds it: boolean grids, no key, the mixer placeholder, no master fader. */
function v1Record(kit: 'street' | 'neon' | 'dust' = 'neon'): Record<string, unknown> {
  const p = JSON.parse(JSON.stringify(newProject({ now: NOW, id: 'prj_v1', kit }))) as Record<string, unknown> & { tracks: Record<string, unknown>[] };
  p.v = 1;
  delete p.key;
  p.tracks = p.tracks.map((t) => { const { notes: _n, ...rest } = t; return { ...rest, pattern: steps(t.sampleId === 'bass' ? [0, 8] : t.sampleId === 'kick' ? [0, 4, 8, 12] : []) }; });
  p.sections = [{ id: 'verse_1', name: 'verse', swing: 0.1, tracks: (p.tracks as Record<string, unknown>[]).map((t) => ({ ...t })) }];
  p.mixer = { polish: true, channels: { snare: { solo: false, room: 0.4, delay: 0.2 }, kick: {} } };
  return p;
}

describe('a new project (v2)', () => {
  it('is in A minor, its note rows hold the key\'s tonic in their register, the drums hold no notes, the desk is untouched', () => {
    const p = newProject({ now: NOW });
    expect(p.v).toBe(STUDIO_PROJECT_VERSION);
    expect(STUDIO_PROJECT_VERSION).toBe(3);   // MUSIC-SUITE P5: v3 (banks, chop kits, baked rows, section chops)
    expect(p.key).toEqual(DEFAULT_KEY);
    expect(byId(p, 'bass').notes).toEqual(new Array(16).fill(33));   // A1
    expect(byId(p, 'lead').notes).toEqual(new Array(16).fill(69));   // A4
    expect(p.tracks.filter((t) => t.notes).map((t) => t.sampleId)).toEqual(['bass', 'lead']);
    expect(p.tracks.some((t) => t.vels)).toBe(false);
    expect(p.mixer).toEqual({ polish: false, master: 1, channels: {} });
    const c = newProject({ now: NOW, key: { root: 0, scale: 'major' } });
    expect(byId(c, 'bass').notes![0]).toBe(36);                       // C2
    expect(emptyKitTracks({ root: 7, scale: 'dorian' }).find((t) => t.sampleId === 'lead')!.notes![0]).toBe(67);
  });
});

describe('migrate v1 → v2: old boolean grids get their notes (the sound they always had), a key, and a real mixer', () => {
  it('NEON\'s bass and lead get C2 / C5 on every step — the note the NEON voices always played — as a migration, not a repair', () => {
    const m = migrateProject(v1Record('neon'), { now: NOW });
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    expect(m.from).toBe(1);
    expect(m.issues).toEqual([]);
    expect(m.project.v).toBe(STUDIO_PROJECT_VERSION);   // MUSIC-SUITE P5: read up to the current version (v3)
    expect(m.project.key).toEqual(DEFAULT_KEY);
    expect(byId(m.project, 'bass').notes).toEqual(new Array(16).fill(VOICE_ROOTS.neon.bass));
    expect(byId(m.project, 'lead').notes).toEqual(new Array(16).fill(VOICE_ROOTS.neon.lead));
    expect(byId(m.project.sections[0], 'bass').notes).toEqual(new Array(16).fill(36));   // sections too
    expect(byId(m.project, 'kick').notes).toBeUndefined();
    expect(byId(m.project, 'bass').pattern).toEqual(steps([0, 8]));                        // the on/off grid is untouched
    for (const kit of ['street', 'dust'] as const) {
      const k = migrateProject(v1Record(kit), { now: NOW });
      expect(k.ok && byId(k.project, 'bass').notes![0]).toBe(VOICE_ROOTS[kit].bass);
      expect(k.ok && inScale(byId(k.project, 'lead').notes![0], DEFAULT_KEY)).toBe(true);  // every kit's voices are in A minor
    }
  });

  it('the P3 strip placeholder becomes a full strip (room → send A, delay → send B); an all-default strip is not kept; master = unity', () => {
    const m = migrateProject(v1Record(), { now: NOW });
    if (!m.ok) throw new Error('refused');
    expect(m.project.mixer).toEqual({
      polish: true, master: 1,
      channels: { snare: { gain: 1, pan: 0, mute: false, solo: false, sendA: 0.4, sendB: 0.2 } },
    });
    expect(mixerOf(m.project)).toEqual({ master: 1, channels: m.project.mixer.channels });
  });

  it('a v2 record round-trips exactly (the representative project, with notes, velocities, a key, a desk)', () => {
    let p = representativeProject();
    p = setProjectKey(p, { root: 2, scale: 'dorian' });
    p = { ...p, tracks: withTrackStep(p.tracks, 'hat', 3, { vel: 0.35 }, p.key) };
    p = withChannel(withChannel(p, 'kick', { gain: 1.2, sendA: 0.3 }), TAKES_CHANNEL, { mute: true });
    p = withMaster(p, 0.9);
    const back = migrateProject(JSON.parse(JSON.stringify(p)), { now: NOW + 1 });
    expect(back.ok && back.issues).toEqual([]);
    expect(back.ok && back.project).toEqual(p);
    expect(back.ok && projectSignature(back.project)).toBe(projectSignature(p));
  });

  it('damage in the new fields is repaired and named; junk never throws', () => {
    const p = JSON.parse(JSON.stringify(representativeProject()));
    p.key = { root: 14, scale: 'phrygian' };                                       // 1
    const bass = p.tracks.find((t: { sampleId: string }) => t.sampleId === 'bass');
    bass.notes = [...new Array(15).fill(33), 99];                                  // 2: 99 is out of the bass register
    const kick = p.tracks.find((t: { sampleId: string }) => t.sampleId === 'kick');
    kick.notes = new Array(16).fill(40);                                           // 3: notes on a drum row
    kick.vels = new Array(16).fill(3);                                             // 4: velocities past 1
    p.mixer.master = 7;                                                            // 5
    p.mixer.channels = { cowbell: { gain: 1 }, snare: { gain: 4 } };               // 6 + 7
    const m = migrateProject(p, { now: NOW });
    if (!m.ok) throw new Error('refused');
    const all = m.issues.join(' | ');
    expect(m.issues).toHaveLength(7);
    expect(all).toMatch(/key unreadable/);
    expect(all).toMatch(/1 note read into the row's range/);
    expect(all).toMatch(/notes on a drum row/);
    expect(all).toMatch(/velocities read as 0–1/);
    expect(all).toMatch(/master fader 7 read as 1.5/);
    expect(all).toMatch(/strip "cowbell" unreadable/);
    expect(all).toMatch(/1 setting out of range/);
    expect(byId(m.project, 'bass').notes![15]).toBe(51);                           // D#7 folded down by octaves into E1–E3
    expect(byId(m.project, 'kick').notes).toBeUndefined();
    expect(m.project.mixer.channels.snare.gain).toBe(1.5);
    for (const junk of [null, 'x', 5, [], {}, { root: 'A' }]) {
      const r = { ...JSON.parse(JSON.stringify(representativeProject())), key: junk };
      expect(() => migrateProject(r, { now: NOW })).not.toThrow();
    }
  });

  it('a remix seed from the library (no notes) opens with its kit\'s voices, in its own key when it has one', () => {
    const tracks = emptyKitTracks().map(({ notes: _n, ...t }) => (t.sampleId === 'bass' ? { ...t, pattern: steps([0]) } : t));
    const dust = projectFromSeed({ tracks, kit: 'dust' }, { now: NOW, kit: 'street' });
    expect(dust.issues).toEqual([]);
    expect(byId(dust.project, 'bass').notes![0]).toBe(31);                        // G1: DUST's bass
    const inE = projectFromSeed({ tracks, key: { root: 4, scale: 'minor' } }, { now: NOW, kit: 'street' });
    expect(inE.project.key).toEqual({ root: 4, scale: 'minor' });
  });
});

describe('steps as the contract says them: { on, note?, vel? }', () => {
  const key: SongKey = DEFAULT_KEY;
  it('stepAt / stepsOf read a row\'s step as an object (a drum never shows a note)', () => {
    const p = newProject({ now: NOW });
    const bass = withStep(withStep(byId(p, 'bass'), 2, { on: true, note: 40 }), 2, { vel: 0.5 });
    expect(stepAt(bass, 2)).toEqual({ on: true, note: 40, vel: 0.5 });
    expect(stepAt(bass, 3)).toEqual({ on: false, note: 33, vel: 1 });
    expect(stepAt({ ...byId(p, 'kick'), notes: new Array(16).fill(50) }, 0)).toEqual({ on: false });
    expect(stepsOf(bass)).toHaveLength(16);
  });

  it('withStep locks a note row\'s note to the key and its register; a drum row ignores a note; no change = the same row', () => {
    const p = newProject({ now: NOW });
    const bass = byId(p, 'bass');
    expect(withStep(bass, 0, { note: 34 }, key).notes![0]).toBe(33);          // A#1 → A1 (a tie goes down)
    expect(withStep(bass, 0, { note: 71 }, key).notes![0]).toBe(47);          // B4 → folded into E1–E3: B2
    expect(withStep(bass, 0, { note: 33 }, key)).toBe(bass);                   // already A1: unchanged
    expect(withStep(bass, 0, { on: false }, key)).toBe(bass);
    const kick = byId(p, 'kick');
    expect(withStep(kick, 0, { note: 50 }, key)).toBe(kick);
    expect(withStep(kick, 1, { on: true, vel: 2 }, key)).toEqual({ ...kick, pattern: steps([1]) });   // 2 → 1 = the default: no array
    expect(withStep(kick, 1, { vel: 0.25 }, key).vels).toEqual([1, 0.25, ...new Array(14).fill(1)]);
    const flip = withStep({ sampleId: 'flip_2', pattern: steps([]), volume: 0.9, muted: false, pan: 0 }, 5, { note: 63 }, key);
    expect(flip.notes![5]).toBe(63);                                           // a chop is not in a key: kept (in range)
    expect(flip.notes![0]).toBe(60);                                           // the rest: as sliced
    expect(withStep(bass, 16, { on: true }, key)).toBe(bass);
  });

  it('withTrackStep hands back the same grid when nothing changed (no empty undo step)', () => {
    const p = newProject({ now: NOW });
    expect(withTrackStep(p.tracks, 'bass', 0, { note: 33 })).toBe(p.tracks);
    expect(withTrackStep(p.tracks, 'bass', 0, { on: true })).not.toBe(p.tracks);
  });
});

describe('the key moves the notes with it', () => {
  it('A minor → C minor: every bass and lead note (grid and sections) moves up a minor third and stays in key; Flip rows keep their pitch', () => {
    let p = newProject({ now: NOW });
    p = { ...p, tracks: withTrackStep(withTrackStep(p.tracks, 'bass', 0, { on: true, note: 33 }), 'bass', 1, { on: true, note: 40 }) };
    const row: ProjectFlipRow = { sampleId: 'flip_0', pad: 0, label: 'FLIP 1', source: { id: 'f', label: 'f', kind: 'fel', note: '', url: '/audio/x.wav' }, slice: { start: 0, end: 10 }, reverse: false, pitch: 0, gate: true };
    p = withFlipRow(p, row);
    p = { ...p, tracks: withTrackStep(p.tracks, 'flip_0', 0, { note: 62 }) };
    p = { ...p, sections: [{ id: 's', name: 'verse', swing: 0, tracks: p.tracks.map((t) => ({ ...t })) }] };
    const cm: SongKey = { root: 0, scale: 'minor' };
    const q = setProjectKey(p, cm);
    expect(q.key).toEqual(cm);
    expect(byId(q, 'bass').notes!.slice(0, 2)).toEqual([36, 43]);            // A1 E2 → C2 G2
    expect(byId(q.sections[0], 'bass').notes!.slice(0, 2)).toEqual([36, 43]);
    expect(byId(q, 'lead').notes![0]).toBe(72);                               // A4 → C5
    expect(byId(q, 'flip_0').notes![0]).toBe(62);
    expect(byId(q, 'bass').notes!.every((n) => inScale(n, cm))).toBe(true);
    expect(setProjectKey(q, cm)).toBe(q);                                      // same key: nothing to do
    expect(setProjectKey(setProjectKey(q, DEFAULT_KEY), cm)).toEqual(q);        // there and back is exact
  });
});

describe('the desk', () => {
  it('withChannel keeps a strip only while it differs from the defaults; unknown strips are refused', () => {
    const p = newProject({ now: NOW });
    const a = withChannel(p, 'snare', { solo: true });
    expect(channelOf(a, 'snare')).toEqual({ ...DEFAULT_CHANNEL, solo: true });
    expect(channelOf(a, 'kick')).toEqual(DEFAULT_CHANNEL);
    const b = withChannel(a, 'snare', { solo: false });
    expect(b.mixer.channels).toEqual({});                                       // back to defaults: removed
    expect(projectSignature(b)).toBe(projectSignature(p));                      // …so autosave sees no edit
    expect(withChannel(p, 'cowbell', { gain: 0.5 })).toBe(p);
    expect(withChannel(p, 'flip_15', { pan: -2 }).mixer.channels.flip_15.pan).toBe(-1);
    expect(withChannel(p, TAKES_CHANNEL, { sendB: 0.5 }).mixer.channels.takes.sendB).toBe(0.5);
    expect(withChannel(p, 'kick', {})).toBe(p);
    expect(withMaster(p, 3).mixer.master).toBe(1.5);
    expect(withMaster(p, 1)).toBe(p);
  });
});

// ── MUSIC-SUITE P4 FIX PASS (2026-09-25) ────────────────────────────────────────────────────────────────────────────
describe('P4 FIX PASS: a remix of a song published before P4 plays in its SOURCE kit\'s notes (remixSeed → projectFromSeed)', () => {
  // a pre-P4 published row: patterns only, no notes (StudioLibrary keeps `sequencer.tracks` verbatim)
  const published = emptyKitTracks().map(({ notes: _n, ...t }) => (t.sampleId === 'bass' || t.sampleId === 'lead' ? { ...t, pattern: steps([0, 8]) } : t));
  const open = (sourceKit: 'street' | 'neon' | 'dust', playKit: 'street' | 'neon' | 'dust') => {
    const seed = remixSeed(JSON.parse(JSON.stringify(published)), sourceKit);        // StudioMode: remixSeed(r.sequencer.tracks, r.kit)
    return projectFromSeed({ tracks: seed.tracks, flipRows: seed.flipRows, kit: playKit }, { now: NOW, kit: 'street' }).project;
  };
  it('NEON: C2 / C5 (36 / 72) — the path the room uses, which gave STREET\'s A1 / A4 (33 / 69)', () => {
    const p = open('neon', 'neon');
    expect(byId(p, 'bass').notes![0]).toBe(VOICE_ROOTS.neon.bass);
    expect([byId(p, 'bass').notes![0], byId(p, 'lead').notes![0]]).toEqual([36, 72]);
    // …and the old call (no kit) is what went wrong
    const old = projectFromSeed({ tracks: remixSeed(JSON.parse(JSON.stringify(published))).tracks, kit: 'neon' }, { now: NOW, kit: 'street' }).project;
    expect([byId(old, 'bass').notes![0], byId(old, 'lead').notes![0]]).toEqual([33, 69]);
  });
  it('DUST: G1 / G4 (31 / 67); a locked kit that opens the remix on STREET still plays the source\'s pitches', () => {
    expect([byId(open('dust', 'dust'), 'bass').notes![0], byId(open('dust', 'dust'), 'lead').notes![0]]).toEqual([31, 67]);
    const onStreet = open('neon', 'street');
    expect(onStreet.kit).toBe('street');
    expect([byId(onStreet, 'bass').notes![0], byId(onStreet, 'lead').notes![0]]).toEqual([36, 72]);
  });
});

describe('P4 FIX PASS: a key change moves a row as a LINE (moveRowNotes)', () => {
  it('the review\'s bass: A2 C3 E3 in A minor → D# minor is Eb2 Gb2 Bb2 (was Eb3 Gb2 Bb2 — the line broke)', () => {
    let p = newProject({ now: NOW });
    p = { ...p, tracks: [0, 1, 2].reduce((t, i) => withTrackStep(t, 'bass', i, { on: true, note: [45, 48, 52][i] }), p.tracks) };
    const dsm: SongKey = { root: 3, scale: 'minor' };
    const q = setProjectKey(p, dsm);
    expect(byId(q, 'bass').notes!.slice(0, 3)).toEqual([39, 42, 46]);
    const n = byId(q, 'bass').notes!.slice(0, 3);
    expect(n[1] - n[0]).toBe(48 - 45);                                          // every interval of the line kept
    expect(n[2] - n[1]).toBe(52 - 48);
    expect(byId(q, 'bass').notes!.every((x) => inScale(x, dsm) && x >= 28 && x <= 52)).toBe(true);
  });
  it('the shift is chosen on the LIT notes (ties: no shift), and a note that still cannot fit is folded alone', () => {
    const t = { sampleId: 'bass', pattern: steps([0, 1]), notes: [45, 52, ...new Array(14).fill(33)] };
    expect(moveRowNotes(t, DEFAULT_KEY, { root: 11, scale: 'minor' }).slice(0, 2)).toEqual([35, 42]);   // B: down 12 keeps both
    expect(moveRowNotes({ ...t, notes: [33, 40, ...new Array(14).fill(33)] }, DEFAULT_KEY, { root: 0, scale: 'minor' }).slice(0, 2)).toEqual([36, 43]);
  });
});

describe('P4 FIX PASS: Flip rows follow a SCALE change by degree; a root change leaves a chop alone', () => {
  const row = (pitch = 0): ProjectFlipRow => ({ sampleId: 'flip_1', pad: 1, label: 'FLIP 2', source: { id: 'f', label: 'f', kind: 'fel', note: '', url: '/audio/x.wav' }, slice: { start: 0, end: 10 }, reverse: false, pitch, gate: true });
  it('A minor → A major: the chop\'s minor third (+3) becomes the major third (+4); an off-scale pad pitch (+1) is kept', () => {
    let p = withFlipRow(newProject({ now: NOW }), row());
    p = { ...p, tracks: withTrackStep(withTrackStep(p.tracks, 'flip_1', 0, { on: true, note: 63 }), 'flip_1', 1, { on: true, note: 61 }) };
    const q = setProjectKey(p, { root: 9, scale: 'major' });
    expect(byId(q, 'flip_1').notes!.slice(0, 2)).toEqual([64, 61]);
    const r = setProjectKey(p, { root: 2, scale: 'minor' });                   // D minor: the root moved, the scale did not
    expect(byId(r, 'flip_1').notes!.slice(0, 2)).toEqual([63, 61]);
  });
});

// MUSIC-SUITE P5 (2026-09-25): P4 put a pad's pitch on the steps' notes (60 + pitch) and loaded the RAW chop, so REPLACE
// ROW with another pitch kept the old notes — the old pitch. v3 bakes pitch / gate / reverse into the chop (chopEdit
// bakeChop), so a step at FLIP_ROOT_MIDI is the pad as tuned and a note is an interval from it. padNote stays for reading
// v2 records (StudioProject.p5.test.ts: the migration).
describe('P4 FIX PASS → P5: a pitched pad\'s pitch is baked into its row\'s chop, not written on the steps', () => {
  const row = (pitch: number): ProjectFlipRow => ({ sampleId: 'flip_3', pad: 3, label: 'FLIP 4', source: { id: 'f', label: 'f', kind: 'fel', note: '', url: '/audio/x.wav' }, slice: { start: 0, end: 10 }, reverse: false, pitch, gate: true });
  it('a +5 pad: its new row writes no notes (the chop plays +5), and a recorded hit just lights its step', () => {
    expect(padNote(5)).toBe(65);                                                // the v2 reading, kept for the migration
    expect(padNote(0)).toBeNull();
    const p = withFlipRow(newProject({ now: NOW }), row(5));
    expect(byId(p, 'flip_3').notes).toBeUndefined();
    expect(p.flipRows[0].pitch).toBe(5);                                        // the pitch rides on the row's chop
    const hit = withFlipHit(p, 'flip_3', 6);
    expect(stepAt(byId(hit, 'flip_3'), 6)).toEqual({ on: true });
  });
  it('REPLACE ROW at another pitch is heard: the row\'s notes stay intervals from the pad as tuned (a hit is FLIP_ROOT_MIDI)', () => {
    const p = withFlipRow(newProject({ now: NOW }), row(0));
    expect(byId(p, 'flip_3').notes).toBeUndefined();
    expect(byId(withFlipHit(p, 'flip_3', 2), 'flip_3').notes).toBeUndefined();
    const noted = { ...p, tracks: withTrackStep(p.tracks, 'flip_3', 0, { on: true, note: 62 }) };
    const q = withFlipHit(withFlipRow(noted, row(-3)), 'flip_3', 4);
    expect(q.flipRows[0].pitch).toBe(-3);                                       // the new chop (baked −3) replaced the old
    expect(stepAt(byId(q, 'flip_3'), 0)).toEqual({ on: true, note: 62 });     // the player's +2 above the pad, kept
    expect(stepAt(byId(q, 'flip_3'), 4)).toEqual({ on: true, note: 60 });     // the hit: the pad as tuned
    expect(withFlipHit(p, 'kick', 1).tracks.find((t) => t.sampleId === 'kick')!.notes).toBeUndefined();
  });
});
