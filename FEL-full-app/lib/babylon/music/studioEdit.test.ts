// MUSIC-SUITE P3 (2026-09-25), "Keep my work": the Academy's edit rules (studioEdit.ts), pure. Each block names the P1
// finding it closes (outbox musicsuite/BASELINE.md 2b and the map, understand-wf_3a55346f-032.json).
import { describe, expect, it } from 'vitest';
import {
  COALESCE_MS, EditHistory, UNDO_LIMIT, applyFoundation, cellFoundation, chainUses, changedFlipRows, chopSignature, cleanSectionName, clearGrid,
  deleteSection, foundationPreview, gridHitCount, historyAudioKeys, moveChainEntry, playbackSource, publishRender, publishTracks,
  publishedAudioKeys, publishedHasUpload, remixSeed, removedFlipRows, renameSection, sameSlice, sectionForBar, shownSection, sliceChanges,
  toggleStep, undoSlice, updateSectionFromGrid, type UndoSlice,
} from './studioEdit';
import { emptyFlip, emptyKitTracks, migrateProject, newProject, projectFromSeed, withFlipHit, withFlipRow, type ProjectFlipRow, type ProjectSection, type StudioProject } from './StudioProject';
import { padsFromSlices } from './Flip';
import { TIERS, heardTracks, shownRowIds } from './MusicTiers';
import { KIT_SLOTS } from './SynthKit';
import type { TrackState } from './AudioEngine';

const lit = (tracks: TrackState[], id: string, steps: number[]): TrackState[] => {
  let t = tracks;
  for (const s of steps) t = toggleStep(t, id, s);
  return t;
};
const flipRow = (pad: number, over: Partial<ProjectFlipRow> = {}): ProjectFlipRow => ({
  sampleId: `flip_${pad}`, pad, label: `FLIP ${pad + 1}`,
  source: { id: 'fel_808_bass', label: '808 bass', kind: 'fel', note: "FEL's own", url: '/audio/kits/808/bass.wav' },
  slice: { start: 100, end: 900 }, reverse: false, pitch: 0, gate: true, ...over,
});
const section = (id: string, name: string, tracks: TrackState[], swing = 0.15): ProjectSection => ({ id, name, tracks, swing });

describe('UNDO / REDO — the Academy had neither (one stray tap and the pattern was gone)', () => {
  it('undoes and redoes, in order, and a new edit drops the redo branch', () => {
    const h = new EditHistory<number>();
    h.record(0); h.record(1); h.record(2);            // states before edits 1, 2, 3; the current state is 3
    expect(h.undo(3)).toBe(2);
    expect(h.undo(2)).toBe(1);
    expect(h.redo(1)).toBe(2);
    h.record(2);                                       // a new edit from state 2
    expect(h.canRedo).toBe(false);
    expect(h.undo(9)).toBe(2);
  });

  it(`keeps at least 50 steps (${UNDO_LIMIT}), dropping the oldest past that`, () => {
    expect(UNDO_LIMIT).toBeGreaterThanOrEqual(50);
    const h = new EditHistory<number>();
    for (let i = 0; i < UNDO_LIMIT + 20; i++) h.record(i);
    let cur = UNDO_LIMIT + 20, n = 0;
    for (let v = h.undo(cur); v !== null; v = h.undo(cur)) { cur = v; n++; }
    expect(n).toBe(UNDO_LIMIT);
    expect(cur).toBe(20);                              // the 20 oldest fell off, nothing else did
  });

  it('a burst of live pad taps is ONE step; the same state twice is one step', () => {
    const h = new EditHistory<number>({ same: (a, b) => a === b });
    h.record(0, { group: 'flip-rec', at: 0 });
    h.record(1, { group: 'flip-rec', at: 400 });
    h.record(2, { group: 'flip-rec', at: 400 + COALESCE_MS });
    expect(h.depth.undo).toBe(1);
    expect(h.undo(3)).toBe(0);                         // the whole burst goes at once
    h.record(5); h.record(5);
    expect(h.depth.undo).toBe(1);
    h.record(6, { group: 'flip-rec', at: 10_000 });
    h.record(7, { group: 'flip-rec', at: 10_000 + COALESCE_MS + 1 });   // too late to join: a new step
    expect(h.depth.undo).toBe(3);
  });

  it('the project slice it keeps is the grid, the Flip rows, the sections, the chain — and (P3 FIX PASS) the takes, the FLIP tab, tempo, swing, kit and MASTER — compared by content', () => {
    const p = newProject({ now: 1 });
    const s: UndoSlice = undoSlice(p);
    expect(Object.keys(s).sort()).toEqual(['bpm', 'chain', 'flip', 'flipRows', 'kit', 'mixer', 'sections', 'swing', 'takes', 'tracks']);
    expect(sameSlice(s, undoSlice(JSON.parse(JSON.stringify(p))))).toBe(true);
    expect(sameSlice(s, { ...s, tracks: lit(p.tracks, 'kick', [0]) })).toBe(false);
  });

  it('50 real grid edits undo back to the empty grid and redo forward to the same pattern', () => {
    const h = new EditHistory<UndoSlice>({ same: sameSlice });
    let p = newProject({ now: 1 });
    for (let i = 0; i < 50; i++) {
      h.record(undoSlice(p));
      p = { ...p, tracks: toggleStep(p.tracks, KIT_SLOTS[i % 4].id, (i * 5) % 16) };
    }
    const end = p;
    for (let v = h.undo(undoSlice(p)); v; v = h.undo(undoSlice(p))) p = { ...p, ...v };
    expect(gridHitCount(p.tracks)).toBe(0);
    for (let v = h.redo(undoSlice(p)); v; v = h.redo(undoSlice(p))) p = { ...p, ...v };
    expect(sameSlice(undoSlice(p), undoSlice(end))).toBe(true);
  });
});

describe('CLEAR and the grid by row id', () => {
  it('CLEAR turns every step off and keeps every row (a Flip row keeps its chop)', () => {
    let p = withFlipRow(newProject({ now: 1 }), flipRow(2));
    p = { ...withFlipHit(p, 'flip_2', 5), tracks: lit(withFlipHit(p, 'flip_2', 5).tracks, 'kick', [0, 8]) };
    expect(gridHitCount(p.tracks)).toBe(3);
    const c = clearGrid(p.tracks);
    expect(gridHitCount(c)).toBe(0);
    expect(c.map((t) => t.sampleId)).toEqual(p.tracks.map((t) => t.sampleId));
    expect(p.flipRows).toHaveLength(1);
  });

  it('a cell is toggled by its row id — the drawn list is filtered, so an index into it is not an index into the project', () => {
    const t = toggleStep(emptyKitTracks(), 'bass', 3);
    expect(t.find((r) => r.sampleId === 'bass')!.pattern[3]).toBe(true);
    expect(gridHitCount(t)).toBe(1);
    expect(toggleStep(t, 'bass', 99)).toEqual(t);
  });
});

describe('SECTIONS ARE EDITABLE (saveSection only ever appended)', () => {
  const grid = lit(emptyKitTracks(), 'kick', [0, 4]);
  const x = {
    sections: [section('a', 'verse', grid), section('b', 'hook', emptyKitTracks(), 0.3)],
    chain: [{ sectionId: 'a', bars: 2 }, { sectionId: 'b', bars: 1 }, { sectionId: 'a', bars: 4 }],
    takes: [],
  };

  it('rename: cleaned, capped at 24, a blank name keeps the old one', () => {
    expect(renameSection(x, 'a', '  big   drop ').sections[0].name).toBe('big drop');
    expect(renameSection(x, 'a', 'x'.repeat(40)).sections[0].name).toHaveLength(24);
    expect(renameSection(x, 'a', '   ')).toBe(x);
    expect(renameSection(x, 'nope', 'y')).toBe(x);
    expect(cleanSectionName(7)).toBeNull();
  });

  it('update from grid: the section takes the grid\'s pattern and swing, keeps its name and chain places, and is a copy', () => {
    const now = lit(emptyKitTracks(), 'snare', [4, 12]);
    const y = updateSectionFromGrid(x, 'b', now, 0.05);
    expect(y.sections[1]).toMatchObject({ id: 'b', name: 'hook', swing: 0.05 });
    expect(gridHitCount(y.sections[1].tracks)).toBe(2);
    expect(y.chain).toEqual(x.chain);
    now[1].pattern[0] = true;                          // editing the grid later never drifts the section
    expect(gridHitCount(y.sections[1].tracks)).toBe(2);
  });

  it('delete: the section and every chain place it had (the confirm says how many)', () => {
    expect(chainUses(x.chain, 'a')).toBe(2);
    const y = deleteSection(x, 'a');
    expect(y.sections.map((s) => s.id)).toEqual(['b']);
    expect(y.chain).toEqual([{ sectionId: 'b', bars: 1 }]);
    expect(y.takes).toBe(x.takes);                     // the rest of the song slice rides through
    expect(deleteSection(x, 'nope')).toBe(x);
  });

  it('reorder: an entry moves, the rest keep their order; out of range changes nothing', () => {
    expect(moveChainEntry(x.chain, 2, 0).map((e) => `${e.sectionId}${e.bars}`)).toEqual(['a4', 'a2', 'b1']);
    expect(moveChainEntry(x.chain, 0, 1).map((e) => `${e.sectionId}${e.bars}`)).toEqual(['b1', 'a2', 'a4']);
    expect(moveChainEntry(x.chain, 0, 99).map((e) => `${e.sectionId}${e.bars}`)).toEqual(['b1', 'a4', 'a2']);
    expect(moveChainEntry(x.chain, 5, 0)).toBe(x.chain);
  });

  it('every edit survives the project\'s own door (migrateProject) unchanged', () => {
    const p = { ...newProject({ now: 1 }), ...deleteSection(renameSection(x, 'b', 'drop'), 'a') };
    const m = migrateProject(JSON.parse(JSON.stringify(p)), { now: 2 });
    expect(m.ok && m.issues).toEqual([]);
    expect(m.ok && m.project.sections.map((s) => s.name)).toEqual(['drop']);
  });
});

describe('SONG MODE IS A SEPARATE PLAYBACK SOURCE (it wrote every bar\'s section into the working grid)', () => {
  const secs = [section('a', 'verse', lit(emptyKitTracks(), 'kick', [0])), section('b', 'hook', lit(emptyKitTracks(), 'snare', [4]), 0.3)];
  const chain = [{ sectionId: 'a', bars: 2 }, { sectionId: 'b', bars: 1 }];

  it('each bar plays its section, looping the chain, with the section\'s own swing', () => {
    expect([0, 1, 2, 3, 5].map((b) => sectionForBar(chain, secs, b)?.id)).toEqual(['a', 'a', 'b', 'a', 'b']);
    expect(sectionForBar(chain, secs, 2)?.swing).toBe(0.3);
    expect(sectionForBar([], secs, 0)).toBeNull();
  });

  it('the grid shows the section playing (else the chain\'s first) and nothing here writes the working grid', () => {
    expect(shownSection(chain, secs, 'b')?.name).toBe('hook');
    expect(shownSection(chain, secs, null)?.name).toBe('verse');
    const before = JSON.stringify(secs);
    sectionForBar(chain, secs, 7); shownSection(chain, secs, 'a');
    expect(JSON.stringify(secs)).toBe(before);
  });
});

describe('CELL fills only the rows you can see, and lays exactly what it previewed', () => {
  it('the preview drops the hidden rows (P1: lead 4 hits in 2 bars on the 4-row grid)', () => {
    const gen = cellFoundation(42);
    expect(Object.keys(gen).sort()).toEqual(KIT_SLOTS.map((k) => k.id).sort());
    const prev = foundationPreview(gen, shownRowIds(TIERS.grid));
    expect(Object.keys(prev).sort()).toEqual(['hat', 'kick', 'open', 'snare']);
    const laid = applyFoundation(emptyKitTracks(), prev);
    expect(gridHitCount(laid.filter((t) => ['clap', 'bass', 'lead', 'fx'].includes(t.sampleId)))).toBe(0);
    expect(gridHitCount(laid)).toBe(gridHitCount(heardTracks(laid, TIERS.grid)));
  });

  it('laying is deterministic from the previewed pattern (the yes never rolls a new one)', () => {
    const prev = foundationPreview(cellFoundation(7), shownRowIds(TIERS.studio));
    expect(applyFoundation(emptyKitTracks(), prev)).toEqual(applyFoundation(emptyKitTracks(), prev));
    expect(cellFoundation(7)).toEqual(cellFoundation(7));
  });

  it('rows the preview does not name are untouched — a Flip row keeps its hits', () => {
    let p = withFlipRow(newProject({ now: 1 }), flipRow(0));
    p = withFlipHit(p, 'flip_0', 3);
    const laid = applyFoundation(p.tracks, foundationPreview(cellFoundation(1), shownRowIds(TIERS.grid)));
    expect(laid.find((t) => t.sampleId === 'flip_0')!.pattern[3]).toBe(true);
  });
});

describe('PUBLISH AND REMIX CARRY THE FLIP CHOPS (a remix\'s Flip rows were silent)', () => {
  const own = { id: 'mic_1', label: 'mic take', kind: 'own' as const, note: 'the player', audio: { key: 'aud_mfx1abcd', mime: 'audio/webm', bytes: 900 } };
  const project = () => {
    let p = withFlipRow(newProject({ now: 1 }), flipRow(0));
    p = withFlipRow(p, flipRow(5, { source: own, reverse: true, pitch: -3, gate: false, slice: { start: 10, end: 20 } }));
    p = withFlipHit(withFlipHit(p, 'flip_0', 0), 'flip_5', 8);
    return { ...p, tracks: lit(lit(p.tracks, 'kick', [0, 8]), 'lead', [3]) };
  };

  it('publishes exactly the heard rows, each Flip row with its chop (source ref, slice, reverse, pitch, gate)', () => {
    const p = project();
    const out = publishTracks(p.tracks, p.flipRows, shownRowIds(TIERS.grid));
    expect(out.tracks.map((t) => t.sampleId)).toEqual(['kick', 'snare', 'hat', 'open', 'flip_0', 'flip_5']);
    expect(out.tracks.find((t) => t.sampleId === 'lead')).toBeUndefined();   // hidden at the grid: not in the mixdown
    expect(out.tracks.find((t) => t.sampleId === 'flip_5')!.chop).toEqual({
      pad: 5, label: 'FLIP 6', source: own, slice: { start: 10, end: 20 }, reverse: true, pitch: -3, gate: false,
    });
    expect(out.silent).toEqual([]);
  });

  it('a Flip row with no chop in the project is not published as a silent row', () => {
    const p = project();
    const out = publishTracks(p.tracks, p.flipRows.filter((r) => r.sampleId !== 'flip_0'), shownRowIds(TIERS.studio));
    expect(out.tracks.some((t) => t.sampleId === 'flip_0')).toBe(false);
    expect(out.silent).toEqual(['flip_0']);
  });

  it('ROUND TRIP: the library\'s JSON → remixSeed → a project whose Flip rows play the same chops on the same steps', () => {
    const p = project();
    const stored = JSON.parse(JSON.stringify({ sequencer: { tracks: publishTracks(p.tracks, p.flipRows, shownRowIds(TIERS.studio)).tracks } }));
    const seed = remixSeed(stored.sequencer.tracks);
    expect(seed.dropped).toEqual([]);
    expect(seed.flipRows).toEqual(p.flipRows.slice().sort((a, b) => a.pad - b.pad));
    expect(seed.tracks.find((t) => t.sampleId === 'flip_5')!.pattern[8]).toBe(true);
    expect(seed.tracks.slice(0, 8).map((t) => t.sampleId)).toEqual(KIT_SLOTS.map((k) => k.id));   // the grid's row order
    // and it opens: the seed goes through the same door the room's create() uses, with no repairs
    const m = migrateProject(JSON.parse(JSON.stringify({ ...newProject({ now: 2 }), tracks: seed.tracks, flipRows: seed.flipRows })), { now: 3 });
    expect(m.ok && m.issues).toEqual([]);
    expect(m.ok && m.project.flipRows).toHaveLength(2);
  });

  it('a pre-P3 record (flip_N rows, no chop) and a tampered chop are LEFT OUT and named, never kept silent', () => {
    const rows = [
      { sampleId: 'kick', pattern: Array.from({ length: 16 }, (_, i) => i === 0), volume: 0.8, muted: false, pan: 0 },
      { sampleId: 'flip_1', pattern: Array(16).fill(true), volume: 0.9, muted: false, pan: 0 },
      { sampleId: 'flip_2', pattern: Array(16).fill(true), volume: 0.9, muted: false, pan: 0, chop: { ...flipRow(2), source: { ...flipRow(2).source, url: 'https://elsewhere.example/x.wav' } } },
    ];
    const seed = remixSeed(rows);
    expect(seed.dropped).toEqual(['flip_1', 'flip_2']);
    expect(seed.flipRows).toEqual([]);
    expect(seed.tracks.some((t) => t.sampleId.startsWith('flip_'))).toBe(false);
    expect(seed.tracks.find((t) => t.sampleId === 'kick')!.pattern[0]).toBe(true);
  });

  it('the store keeps the audio a published chop points at (the player\'s own recording)', () => {
    const p = project();
    const rec = { sequencer: { tracks: publishTracks(p.tracks, p.flipRows, shownRowIds(TIERS.studio)).tracks } };
    expect([...publishedAudioKeys([rec, { sequencer: { tracks: [] } }, {}])]).toEqual(['aud_mfx1abcd']);
  });
});

describe('an undo that changes a Flip row\'s chop reloads that row\'s sound', () => {
  it('names only the rows that are new or cut differently', () => {
    const a = [flipRow(0), flipRow(1)];
    expect(changedFlipRows(a, a)).toEqual([]);
    const b = [flipRow(0, { slice: { start: 0, end: 50 } }), flipRow(1, { pitch: 5 }), flipRow(2)];
    expect(changedFlipRows(a, b).map((r) => r.sampleId)).toEqual(['flip_0', 'flip_2']);   // pitch is not baked in yet (P5)
  });
});

describe('the Academy store keeps a published chop\'s audio after its project is deleted', () => {
  it('deleteProject and sweepAudio free unreferenced audio — but never audio a published song points at', async () => {
    const { MemoryKv, StudioStore, AUDIO_SWEEP_MIN_AGE_MS } = await import('./studioStore');
    const store = new StudioStore(new MemoryKv());
    const key = 'aud_mfx1abcd';                        // minted like newAudioKey: swept once old and unreferenced
    const keyTime = parseInt('mfx1', 36);
    const own = { id: 'mic_1', label: 'mic take', kind: 'own' as const, note: 'the player', audio: { key, mime: 'audio/webm', bytes: 3 } };
    const p = withFlipRow(newProject({ now: 1, id: 'prj_a' }), flipRow(0, { source: own }));
    await store.saveProject(p);
    await store.putAudio(key, new ArrayBuffer(3), 'audio/webm');
    const published = publishedAudioKeys([{ sequencer: { tracks: publishTracks(p.tracks, p.flipRows, shownRowIds(TIERS.grid)).tracks } }]);
    expect(await store.deleteProject('prj_a', published)).toEqual({ audioFreed: 0 });
    expect(await store.sweepAudio(keyTime + AUDIO_SWEEP_MIN_AGE_MS + 1, undefined, published)).toBe(0);
    expect(await store.getAudio(key)).not.toBeNull();
    // once the song is gone from the library too, the next sweep frees it
    expect(await store.sweepAudio(keyTime + AUDIO_SWEEP_MIN_AGE_MS + 1)).toBe(1);
    expect(await store.getAudio(key)).toBeNull();
  });
});

describe('the library keeps a published row\'s chop (StudioLibrary stores sequencer.tracks verbatim)', () => {
  it('a record read back through StudioLibrary.normalizeEntry still remixes to the same Flip rows', async () => {
    const { normalizeEntry } = await import('./StudioLibrary');
    let p = withFlipRow(newProject({ now: 1 }), flipRow(3, { reverse: true }));
    p = withFlipHit(p, 'flip_3', 4);
    const pub = publishTracks(p.tracks, p.flipRows, shownRowIds(TIERS.grid));
    const stored = JSON.parse(JSON.stringify({ id: 'trk_1', title: 'x', sequencer: { bpm: 92, steps: 16, tracks: pub.tracks, swing: 0.15 } }));
    const n = normalizeEntry(stored)!;
    const seed = remixSeed(n.entry.sequencer.tracks);
    expect(seed.flipRows).toEqual(p.flipRows);
    expect(seed.tracks.find((t) => t.sampleId === 'flip_3')!.pattern[4]).toBe(true);
  });
});

// ── MUSIC-SUITE P3 FIX PASS (2026-09-25) ───────────────────────────────────────────────────────────────────────────────

describe('undo covers what the review found could not be taken back (owner decision #4)', () => {
  const take = (id: string, key: string) => ({ id, atBar: 1, gain: 0.9, durationSec: 4.2, audio: { key, mime: 'audio/webm', bytes: 9 } });
  /** What the room's `edit` does: record the state it replaces when the slice changes, then apply. */
  const editWith = (h: EditHistory<UndoSlice>, p: StudioProject, fn: (p: StudioProject) => StudioProject, group?: string, at = 0): StudioProject => {
    const next = fn(p);
    if (!sameSlice(undoSlice(p), undoSlice(next))) h.record(undoSlice(p), { group, at });
    return next;
  };

  it('a take removed by its × comes back with UNDO, AudioRef and all (it recorded no step: UNDO undid an older grid edit)', () => {
    const h = new EditHistory<UndoSlice>({ same: sameSlice });
    let p = newProject({ now: 1 });
    p = editWith(h, p, (x) => ({ ...x, tracks: toggleStep(x.tracks, 'kick', 0) }));
    p = editWith(h, p, (x) => ({ ...x, takes: [take('t1', 'aud_mfz1take0001')] }));
    const withTake = p;
    p = editWith(h, p, (x) => ({ ...x, takes: x.takes.filter((t) => t.id !== 't1') }));
    expect(p.takes).toEqual([]);
    p = { ...p, ...h.undo(undoSlice(p))! };
    expect(p.takes).toEqual(withTake.takes);                         // the take, not the grid, came back
    expect(p.tracks[0].pattern[0]).toBe(true);
  });

  it('the audio a kept undo / redo state points at is named, so the store keeps it (historyAudioKeys + states())', () => {
    const h = new EditHistory<UndoSlice>({ same: sameSlice });
    let p = { ...newProject({ now: 1 }), takes: [take('t1', 'aud_mfz1take0001')] };
    p = editWith(h, p, (x) => ({ ...x, takes: [] }));
    expect([...historyAudioKeys(h.states())]).toEqual(['aud_mfz1take0001']);
    h.undo(undoSlice(p));
    expect([...historyAudioKeys(h.states())]).toEqual([]);           // the redo state has no take; the current one is the project's
  });

  it('a new Flip source (a tap on a FEL stem) is ONE undo step that brings back the mic take and its 16 edited chops', () => {
    const h = new EditHistory<UndoSlice>({ same: sameSlice });
    const own = { id: 'mic_1', label: 'mic take', kind: 'own' as const, note: 'the player', audio: { key: 'aud_mfz1mic00001', mime: 'audio/webm', bytes: 3 } };
    let p: StudioProject = { ...newProject({ now: 1 }), flip: { ...emptyFlip(), source: own, rate: 48000, chops: padsFromSlices([{ start: 0, end: 10 }, { start: 10, end: 20 }]).map((c, i) => (i === 1 ? { ...c, pitch: 5, reverse: true } : c)) } };
    const before = p.flip;
    const fel = { id: 'fel_808_bass', label: '808 bass', kind: 'fel' as const, note: "FEL's own", url: '/audio/kits/808/bass.wav' };
    p = editWith(h, p, (x) => ({ ...x, flip: { ...x.flip, source: fel, chops: padsFromSlices([{ start: 0, end: 99 }]) } }));
    expect(p.flip.source?.id).toBe('fel_808_bass');
    p = { ...p, ...h.undo(undoSlice(p))! };
    expect(p.flip).toEqual(before);
    expect([...historyAudioKeys(h.states())]).toEqual([]);
    expect([...historyAudioKeys([undoSlice(p)])]).toEqual(['aud_mfz1mic00001']);
  });

  it('tempo and swing drags are one step each; the kit and MASTER undo too', () => {
    const h = new EditHistory<UndoSlice>({ same: sameSlice });
    let p = newProject({ now: 1 });
    for (let i = 0; i < 20; i++) p = editWith(h, p, (x) => ({ ...x, bpm: 92 + i + 1 }), 'bpm', i * 16);   // a slider drag
    expect(h.depth.undo).toBe(1);
    p = editWith(h, p, (x) => ({ ...x, kit: 'neon' }));
    p = editWith(h, p, (x) => ({ ...x, mixer: { ...x.mixer, polish: true } }));
    expect([...sliceChanges(undoSlice(p), h.undo(undoSlice(p))!)]).toEqual(['mixer']);
    p = { ...p, mixer: { ...p.mixer, polish: false } };
    const k = h.undo(undoSlice(p))!;
    expect(k.kit).toBe('street');
    const t = h.undo(undoSlice({ ...p, ...k }))!;
    expect(t.bpm).toBe(92);
  });
});

describe('what plays and what a publish renders — by behaviour, not source strings', () => {
  const grid = toggleStep(emptyKitTracks(), 'hat', 1);
  const preview = toggleStep(emptyKitTracks(), 'kick', 0);
  it('CELL\'s preview, else song mode (the room stands down), else the grid — at the project\'s swing', () => {
    expect(playbackSource({ preview, songMode: true, tracks: grid, swing: 0.1 })).toEqual({ kind: 'preview', tracks: preview, swing: 0.1 });
    expect(playbackSource({ preview: null, songMode: true, tracks: grid, swing: 0.1 })).toEqual({ kind: 'song', tracks: null, swing: 0.1 });
    expect(playbackSource({ preview: null, songMode: false, tracks: grid, swing: 0.1 })).toEqual({ kind: 'grid', tracks: grid, swing: 0.1 });
  });
  it('PUBLISH renders the working grid at the project\'s swing (a copy — never the section song mode plays)', () => {
    const p = { ...newProject({ now: 1 }), tracks: grid, swing: 0 };
    const r = publishRender(p);
    expect(r).toEqual({ tracks: grid, swing: 0 });
    expect(r.tracks[0]).not.toBe(grid[0]);
  });
});

describe('a remix of a mastered song opens mastered (it opened with MASTER off)', () => {
  it('ROUND TRIP: publish (polished) → the library → beginRemix → the new project: mixer.polish survives', async () => {
    const { normalizeEntry } = await import('./StudioLibrary');
    let p = withFlipRow(newProject({ now: 1, polish: true }), flipRow(2));
    p = withFlipHit(p, 'flip_2', 6);
    const pub = publishTracks(p.tracks, p.flipRows, shownRowIds(TIERS.studio));
    const stored = JSON.parse(JSON.stringify({ id: 'trk_m', title: 'Mastered', authorId: 'me', authorName: 'You', kit: 'street', bpm: 100, swing: 0.2, polished: true, sequencer: { bpm: 100, steps: 16, tracks: pub.tracks, swing: 0.2 } }));
    const n = normalizeEntry(stored)!;
    expect(n.entry.polished).toBe(true);
    const seed = remixSeed(n.entry.sequencer.tracks);
    const made = projectFromSeed({ title: 'Remix · Mastered', tracks: seed.tracks, flipRows: seed.flipRows, bpm: n.entry.bpm, swing: n.entry.swing, kit: 'street', polish: n.entry.polished }, { now: 5, kit: 'street' });
    expect(made.project.mixer.polish).toBe(true);
    expect(made.project.flipRows).toEqual(p.flipRows);
    expect(made.issues).toEqual([]);
    expect(projectFromSeed({ tracks: seed.tracks }, { now: 5, kit: 'street' }).project.mixer.polish).toBe(false);   // not said = off
    expect(projectFromSeed(undefined, { now: 5, kit: 'neon' }).project.kit).toBe('neon');                            // NEW keeps the kit
  });
});

describe('uploads are marked (owner decision #15: songs containing uploads stay device-private until online review)', () => {
  const upload = { id: 'own_1', label: 'my loop.wav', kind: 'own' as const, note: 'Uploaded by the player', audio: { key: 'aud_mfz1upl00001', mime: 'audio/wav', bytes: 9 }, upload: true as const };
  const mic = { id: 'mic_1', label: 'mic take', kind: 'own' as const, note: 'Recorded in the room', audio: { key: 'aud_mfz1mic00001', mime: 'audio/webm', bytes: 9 } };
  it('the mark survives the project\'s door, a published chop and a remix; a mic take is not an upload', () => {
    let p = withFlipRow(newProject({ now: 1 }), flipRow(0, { source: upload }));
    p = withFlipRow(p, flipRow(1, { source: mic }));
    const m = migrateProject(JSON.parse(JSON.stringify(p)), { now: 2 });
    expect(m.ok && m.project.flipRows[0].source.upload).toBe(true);
    expect(m.ok && m.project.flipRows[1].source.upload).toBeUndefined();
    const pub = publishTracks(p.tracks, p.flipRows, shownRowIds(TIERS.studio)).tracks;
    expect(publishedHasUpload(pub)).toBe(true);
    expect(publishedHasUpload(publishTracks(p.tracks, p.flipRows.filter((r) => r.pad === 1), shownRowIds(TIERS.studio)).tracks)).toBe(false);
    expect(remixSeed(JSON.parse(JSON.stringify(pub))).flipRows.find((r) => r.pad === 0)!.source.upload).toBe(true);
  });
});

describe('a Flip row\'s sound: what changes it, and what an undo removes', () => {
  it('the rate is part of the cut; pitch and gate are not (not baked in until P5)', () => {
    expect(chopSignature(flipRow(0))).toBe(chopSignature(flipRow(0, { pitch: 7, gate: false })));
    expect(chopSignature(flipRow(0))).not.toBe(chopSignature(flipRow(0, { rate: 44100 })));
  });
  it('removedFlipRows names the rows an undo took away (their sound leaves the engine)', () => {
    expect(removedFlipRows([flipRow(0), flipRow(3)], [flipRow(3)])).toEqual(['flip_0']);
    expect(removedFlipRows([flipRow(0)], [flipRow(0)])).toEqual([]);
  });
});
