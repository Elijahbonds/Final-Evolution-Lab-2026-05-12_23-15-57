// MUSIC-SUITE P5 (2026-09-25): owner decision #15 — a song containing an upload stays on the device until online review
// exists. The rule (uploadPrivacy.ts), the library's own guards (publish, walk-out), and the mark it reads.
import { describe, expect, it } from 'vitest';
import { FakeStorage } from './fakeWebAudio';
import { KEY_INDEX, createStudioLibrary, type LibraryBlobStore, type PublishDraft } from './StudioLibrary';
import { newProject, withFlipRow, type ProjectFlipRow, type ProjectFlipSource } from './StudioProject';
import { publishTracks, publishedHasUpload } from './studioEdit';
import {
  LIBRARY_UPLOAD_LINE, OWN_RIGHTS_TICK, UPLOAD_DOORS, WALKOUT_UPLOAD_LINE, isUpload, projectUploadPrivacy, projectUploads, tickedUploadNote, tracksHaveUpload,
  uploadDoorOpen, uploadNeedsTick, uploadPrivateLine, type UploadDoor, type UploadDoors,
} from './uploadPrivacy';
import { WALKOUT_KEY } from './WalkOut';

const upload: ProjectFlipSource = { id: 'own_1', label: 'my loop.wav', kind: 'own', note: 'Uploaded by the player', audio: { key: 'aud_mfz1upl00001', mime: 'audio/wav', bytes: 9 }, upload: true };
const micTake: ProjectFlipSource = { id: 'mic_1', label: 'mic take', kind: 'own', note: 'Recorded in the room', audio: { key: 'aud_mfz1mic00001', mime: 'audio/webm', bytes: 9 } };
const felTheme: ProjectFlipSource = { id: 'theme_a_sunday_tape', label: 'Sunday Tape', kind: 'fel', note: 'FEL original', url: '/audio/flip/audio/theme_a_sunday_tape.mp3' };
const row = (pad: number, source: ProjectFlipSource): ProjectFlipRow => ({ sampleId: `flip_${pad}`, pad, label: `FLIP ${pad + 1}`, source, slice: { start: 0, end: 100 }, reverse: false, pitch: 0, gate: true });

// MUSIC-SUITE P5 FIX PASS (2026-09-25): "device-private" read as NEVER SHARED OFF THE DEVICE (the library, the dance floor
// and the walk-out are all on it), and "songs containing uploads" as what the SONG plays — not an idle bank or kit. The
// stricter P5 reading is one switch away (UPLOAD_DOORS); both are held here.
const STRICT: UploadDoors = { library: false, danceFloor: false, walkOut: false, offDevice: false };

describe('the device-private rule (decision #15)', () => {
  it('a song with no upload: every door open', () => {
    const p = withFlipRow({ ...newProject({ now: 1 }), flip: { ...newProject({ now: 1 }).flip, source: felTheme } }, row(0, felTheme));
    expect(projectUploadPrivacy(p)).toEqual({ private: false, uploads: [], closed: [], line: null });
    for (const d of ['library', 'danceFloor', 'walkOut', 'offDevice'] as const) expect(uploadDoorOpen(d, projectUploadPrivacy(p), STRICT)).toBe(true);
  });

  it('an upload on a grid row or in a section\'s own chops is in the SONG — a mic take is not an upload', () => {
    const base = newProject({ now: 1 });
    expect(projectUploadPrivacy(withFlipRow(base, row(3, upload))).private).toBe(true);
    const section = { id: 's1', name: 'A' as const, tracks: [], swing: 0, chops: [row(2, upload)] };
    expect(projectUploadPrivacy({ ...base, sections: [section] }).private).toBe(true);
    expect(projectUploadPrivacy({ ...withFlipRow(base, row(3, micTake)), flip: { ...base.flip, source: micTake } }).private).toBe(false);
    expect(isUpload(micTake)).toBe(false);
    expect(isUpload({ upload: 'yes' as unknown as true })).toBe(false);   // only `true`, as the project's door keeps it
  });

  it('an upload that only sits in a bank (A–D) or a saved chop kit is NOT in the song (the old rule fired on an idle bank D)', () => {
    const base = newProject({ now: 1 });
    const bank = { source: upload, slicing: 'transient' as const, gridN: 8, chops: base.flip.chops };
    const idle = { ...base, flip: { ...base.flip, source: upload, otherBanks: [null, null, bank], kits: [{ id: 'kit_1', name: 'mine', savedAt: 1, bank }] } };
    expect(projectUploadPrivacy(idle).private).toBe(false);
    expect(projectUploads(idle)).toEqual(['my loop.wav']);                // …though the project holds it
  });

  it('THE SWITCH: on-device doors open, off-device shut (default); the stricter reading shuts all four', () => {
    expect(UPLOAD_DOORS).toEqual({ library: true, danceFloor: true, walkOut: true, offDevice: false });
    const u = projectUploadPrivacy(withFlipRow(newProject({ now: 1 }), row(0, upload)));
    expect(u.closed).toEqual(['offDevice']);
    expect(['library', 'danceFloor', 'walkOut', 'offDevice'].map((d) => uploadDoorOpen(d as UploadDoor, u))).toEqual([true, true, true, false]);
    const strict = projectUploadPrivacy(withFlipRow(newProject({ now: 1 }), row(0, upload)), STRICT);
    expect(strict.closed).toEqual(['library', 'danceFloor', 'walkOut', 'offDevice']);
    expect(['library', 'danceFloor', 'walkOut'].map((d) => uploadDoorOpen(d as UploadDoor, strict, STRICT))).toEqual([false, false, false]);
  });

  it('the room says why in one line, naming the file (once, however many rows use it) — in the words of the doors shut', () => {
    const base = newProject({ now: 1 });
    const u = projectUploadPrivacy(withFlipRow(withFlipRow({ ...base, flip: { ...base.flip, source: upload } }, row(0, upload)), row(1, upload)));
    expect(u.uploads).toEqual(['my loop.wav']);
    expect(u.line).toBe('Device-only: this song uses your upload "my loop.wav" — your library, the dance floor and your walk-out work on this device; sharing it online opens once FEL can review uploads.');
    expect(u.line!.includes('\n')).toBe(false);
    expect(uploadPrivateLine(['a.wav', 'b.wav'])).toMatch(/^Device-only: this song uses 2 of your uploads/);
    expect(uploadPrivateLine(['a.wav'], STRICT)).toBe('Device-only: this song uses your upload "a.wav" — publishing, the dance floor, walk-outs open once FEL can review uploads online.');
  });

  it('the published rows carry the mark, and studioEdit.publishedHasUpload reads it through the same rule', () => {
    const p = withFlipRow(withFlipRow(newProject({ now: 1 }), row(0, upload)), row(1, felTheme));
    const shown = new Set(['kick', 'flip_0', 'flip_1']);
    const all = publishTracks(p.tracks, p.flipRows, shown).tracks;
    expect(tracksHaveUpload(all)).toBe(true);
    expect(publishedHasUpload(all)).toBe(true);
    const clean = publishTracks(p.tracks, p.flipRows.filter((r) => r.pad === 1), new Set(['kick', 'flip_1'])).tracks;
    expect(tracksHaveUpload(clean)).toBe(false);
    expect(tracksHaveUpload([null, 3, { chop: null }])).toBe(false);
  });
});

// MUSIC-SUITE P5 FIX PASS (2026-09-25): decision #15's tick for an upload made before the tick existed (P3 / P4 took YOUR
// FILE without one, note 'Uploaded by the player — their own recording.').
describe('the ownership tick', () => {
  it('a P3 / P4 upload needs the tick; one made through the tick (or any non-upload) does not', () => {
    expect(uploadNeedsTick({ upload: true, note: 'Uploaded by the player — their own recording.' })).toBe(true);
    expect(uploadNeedsTick({ upload: true, note: tickedUploadNote(Date.UTC(2026, 8, 26)) })).toBe(false);
    expect(tickedUploadNote(Date.UTC(2026, 8, 26))).toBe(`Uploaded by the player, who ticked "${OWN_RIGHTS_TICK}" (2026-09-26).`);
    expect(uploadNeedsTick(micTake)).toBe(false);
    expect(uploadNeedsTick(felTheme)).toBe(false);
    expect(uploadNeedsTick(null)).toBe(false);
  });
});

// ── the library's own guards ─────────────────────────────────────────────────────────────────────────────────────

class Blobs implements LibraryBlobStore {
  map = new Map<string, Blob>();
  async get(k: string) { return this.map.get(k) ?? null; }
  async put(k: string, b: Blob) { this.map.set(k, b); }
  async delete(k: string) { this.map.delete(k); }
  async list(prefix = '') { return [...this.map.keys()].filter((k) => k.startsWith(prefix)); }
}
const library = (storage: FakeStorage, uploadDoors?: UploadDoors) => {
  let t = 1_700_000_000_000, n = 0;
  const blobs = new Blobs();
  return createStudioLibrary({ storage: () => storage, store: () => blobs, now: () => ++t, random: () => 0.5, createObjectUrl: () => `blob:x/${++n}`, revokeObjectUrl: () => {}, ...(uploadDoors ? { uploadDoors } : {}) });
};
const uploadRows = () => {
  const p = withFlipRow(newProject({ now: 1 }), row(0, upload));
  return publishTracks(p.tracks, p.flipRows, new Set(['kick', 'flip_0'])).tracks;
};
const draft = (tracks: PublishDraft['sequencer']['tracks']): PublishDraft => ({
  title: 'Mine', authorId: 'me', authorName: 'You', kit: 'street', bpm: 92, swing: 0.15, polished: false,
  sequencer: { bpm: 92, steps: 16, swing: 0.15, tracks }, remixOf: null,
});
const wav = (): Blob => new Blob([new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4])], { type: 'audio/wav' });

describe('StudioLibrary and uploads: on-device doors open, the stricter reading refuses (for any caller that skipped the room)', () => {
  it('publishWithAudio: an upload song publishes to the device library, the record keeping the mark for the sharing pass', async () => {
    const l = library(new FakeStorage());
    const r = await l.publishWithAudio(draft(uploadRows()), wav());
    expect(r.ok).toBe(true);
    expect(r.ok && publishedHasUpload(r.rec.sequencer.tracks)).toBe(true);
  });

  it('STRICT: publishWithAudio refused with the line, nothing written; the compat publish throws it', async () => {
    const storage = new FakeStorage();
    const l = library(storage, STRICT);
    expect(await l.publishWithAudio(draft(uploadRows()), wav())).toEqual({ ok: false, reason: 'upload-private', line: LIBRARY_UPLOAD_LINE });
    expect(l.list()).toEqual([]);
    expect(storage.getItem(KEY_INDEX)).toBeNull();
    expect(() => l.publish({ ...draft(uploadRows()), mixdownDataUrl: '' })).toThrow(LIBRARY_UPLOAD_LINE);
  });

  it('a song without an upload publishes under either reading', async () => {
    const p = withFlipRow(newProject({ now: 1 }), row(0, felTheme));
    for (const doors of [undefined, STRICT]) {
      const l = library(new FakeStorage(), doors);
      expect((await l.publishWithAudio(draft(publishTracks(p.tracks, p.flipRows, new Set(['kick', 'flip_0'])).tracks), wav())).ok).toBe(true);
    }
  });

  it('setWalkOut: an upload song can be the walk-out (it plays on this device only)', async () => {
    const storage = new FakeStorage();
    const l = library(storage);
    const r = await l.publishWithAudio(draft(uploadRows()), wav());
    if (!r.ok) throw new Error('publish');
    expect((await l.setWalkOut(r.rec.id)).ok).toBe(true);
    expect(l.get(r.rec.id)).not.toBeNull();
    expect(storage.getItem(WALKOUT_KEY)).not.toBeNull();            // the open door never lets it go
  });

  it('STRICT: a walk-out chosen before the rule (a P3 upload song) is let go the first time DunkMode resolves it', async () => {
    const storage = new FakeStorage();
    const open = library(storage);
    const r = await open.publishWithAudio(draft(uploadRows()), wav());
    if (!r.ok) throw new Error('publish');
    expect((await open.setWalkOut(r.rec.id)).ok).toBe(true);
    expect(storage.getItem(WALKOUT_KEY)).not.toBeNull();
    const strict = library(storage, STRICT);
    expect(await strict.setWalkOut(r.rec.id)).toEqual({ ok: false, reason: 'upload-private', line: WALKOUT_UPLOAD_LINE });
    expect(strict.get(r.rec.id)).not.toBeNull();                   // the song stays; only the walk-out goes
    expect(storage.getItem(WALKOUT_KEY)).toBeNull();
    expect(strict.problems()).toContain(WALKOUT_UPLOAD_LINE);
  });
});
