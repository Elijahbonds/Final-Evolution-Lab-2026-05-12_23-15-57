// studioEdit — THE ACADEMY'S EDITS, PURE (MUSIC-SUITE P3, "Keep my work", 2026-09-25).
//
// Everything here is a rule the room used to break, measured in P1 (outbox musicsuite/BASELINE.md 2b) or read in the map
// (outbox musicsuite/understand-wf_3a55346f-032.json), and each is now stated once and tested (studioEdit.test.ts):
//
//   · UNDO / REDO. The Academy had none: one mis-tap on CELL's confirm, one stray click on a lit cell, and the pattern was
//     gone; there was not even a CLEAR. `EditHistory` keeps the last UNDO_LIMIT (100 ≥ the 50 asked) states of the grid,
//     the Flip rows, the sections and the chain; a burst of live pad taps (ARM REC) coalesces into one step.
//   · SECTIONS WERE WRITE-ONCE. saveSection only appended (SongPanel.tsx ~:63-69 then): no rename, no "update from grid",
//     no delete, no reorder of the chain. `renameSection`, `updateSectionFromGrid`, `deleteSection` and `moveChainEntry`.
//   · SONG MODE OVERWROTE THE GRID. Every bar line wrote the playing section into the working grid (SongPanel.tsx ~:52 then,
//     `setTracks(snapshotTracks(sec.tracks))`), so an edit made during song mode was lost at the next bar and the LAST
//     section was left in the grid when song mode went off. Song mode is a separate playback source now: `sectionForBar` is
//     what the engine plays, the grid is never written, and `shownSection` is what the grid SHOWS (read-only) meanwhile.
//   · CELL WROTE ROWS NOBODY COULD SEE, AND CHARGED FIRST. cellFoundation (StudioMode.tsx ~:68-85 then) filled all eight kit
//     rows on a 4-row grid (P1: lead 4 hits in 2 bars on rows never drawn). `foundationPreview` keeps only the drawn rows,
//     the confirm shows (and can play) exactly that, and `applyFoundation` lays exactly the previewed pattern after the yes.
//   · PUBLISH AND REMIX LOST THE FLIP CHOPS. A published record kept `flip_N` rows but no sound, so a remix's Flip rows were
//     silent. `publishTracks` carries each heard Flip row's chop (its source REF — a first-party /audio/ path or the
//     player's own bytes in the Academy store — plus slice / reverse / pitch / gate) inside the row; `remixSeed` reads it
//     back through the project's one door (migrateProject), and a row whose chop is unreadable is left out and named, never
//     written as a silent row. `publishedAudioKeys` is what the store must keep for them (studioStore sweep / delete).
//
// Pure: no audio, no DOM, no storage.
import type { TrackState } from './AudioEngine';
import { normalizeChain, sectionAtBar, snapshotTracks, type SongChain } from './Song';
import {
  PROJECT_STEPS, STUDIO_PROJECT_VERSION, migrateProject, projectAudioKeys, sectionChopsFor,
  type ProjectFlipRow, type ProjectFlipSource, type ProjectSection, type StudioProject,
} from './StudioProject';
import { isFlipRowId } from './MusicTiers';
import type { Slice } from './Flip';
import { tracksHaveUpload } from './uploadPrivacy';

// ── undo / redo ──────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * What an undo puts back: the grid (kit + Flip rows), the Flip rows' chops, the sections and the chain.
 * MUSIC-SUITE P3 FIX PASS (2026-09-25), owner decision #4 ("Studio depth: autosave, undo, …"): and the takes, the FLIP tab
 * (its source and 16 chops), the tempo, the swing, the kit and MASTER. The review found the player's own vocal take was
 * the one thing that could be neither confirmed nor recovered (one tap on its ×, no history entry — the slice did not
 * change — so UNDO undid an unrelated grid edit instead), and that a tap on a FEL stem replaced a mic take and 16 edited
 * chops for good. A removed recording's bytes stay in the store while the history can bring it back (the room adds
 * historyAudioKeys to the store's keep set).
 * MUSIC-SUITE P4 (2026-09-25), grid-ui: and the song's KEY. A key change moves every bass / lead note with it
 * (StudioProject.setProjectKey), so an undo that put the notes back but left the new key would leave them outside it —
 * and a key change on a grid with no lit notes changed nothing in the old slice, so it could not be undone at all.
 */
export type UndoSlice = Pick<StudioProject, 'tracks' | 'flipRows' | 'sections' | 'chain' | 'takes' | 'flip' | 'bpm' | 'swing' | 'kit' | 'mixer' | 'key'>;
export const UNDO_KEYS = ['tracks', 'flipRows', 'sections', 'chain', 'takes', 'flip', 'bpm', 'swing', 'kit', 'mixer', 'key'] as const;
/** Steps kept (the brief asks for at least 50). */
export const UNDO_LIMIT = 100;
/** A grouped burst (live pad taps with REC armed) within this long of its last edit is ONE undo step. */
export const COALESCE_MS = 1500;

export function undoSlice(p: UndoSlice): UndoSlice {
  return { tracks: p.tracks, flipRows: p.flipRows, sections: p.sections, chain: p.chain, takes: p.takes, flip: p.flip, bpm: p.bpm, swing: p.swing, kit: p.kit, mixer: p.mixer, key: p.key };
}
export function sameSlice(a: UndoSlice, b: UndoSlice): boolean {
  return UNDO_KEYS.every((k) => a[k] === b[k] || JSON.stringify(a[k]) === JSON.stringify(b[k]));
}
/** Which parts of the project an undo step changes (the room reloads a kit, MASTER or chops only when they moved). */
export function sliceChanges(a: UndoSlice, b: UndoSlice): Set<(typeof UNDO_KEYS)[number]> {
  return new Set(UNDO_KEYS.filter((k) => !(a[k] === b[k] || JSON.stringify(a[k]) === JSON.stringify(b[k]))));
}
/** Audio every kept undo / redo state points at — the store keeps it (a removed take comes back WITH its sound). */
export function historyAudioKeys(states: readonly Pick<UndoSlice, 'takes' | 'flip' | 'flipRows'>[]): Set<string> {
  const keys = new Set<string>();
  for (const s of states) for (const k of projectAudioKeys(s)) keys.add(k);
  return keys;
}

/**
 * A bounded undo/redo stack of states. `record(before)` is called with the state an edit is about to replace; undo hands
 * that state back (and keeps the current one for redo). A new edit after an undo drops the redo branch, as every editor
 * does. Recording the same state twice in a row is one step.
 */
export class EditHistory<T> {
  private past: T[] = [];
  private future: T[] = [];
  private lastGroup: string | null = null;
  private lastAt = Number.NEGATIVE_INFINITY;

  constructor(private readonly opts: { limit?: number; coalesceMs?: number; same?: (a: T, b: T) => boolean } = {}) {}

  get limit(): number { return Math.max(1, Math.floor(this.opts.limit ?? UNDO_LIMIT)); }
  get canUndo(): boolean { return this.past.length > 0; }
  get canRedo(): boolean { return this.future.length > 0; }
  get depth(): { undo: number; redo: number } { return { undo: this.past.length, redo: this.future.length }; }

  record(before: T, opts: { group?: string; at?: number } = {}): void {
    const at = opts.at ?? 0;
    const window = this.opts.coalesceMs ?? COALESCE_MS;
    this.future = [];
    if (opts.group && opts.group === this.lastGroup && at - this.lastAt <= window) { this.lastAt = at; return; }
    const top = this.past[this.past.length - 1];
    const same = this.opts.same ?? ((a: T, b: T) => a === b);
    if (!(top !== undefined && same(top, before))) {
      this.past.push(before);
      if (this.past.length > this.limit) this.past.splice(0, this.past.length - this.limit);
    }
    this.lastGroup = opts.group ?? null;
    this.lastAt = at;
  }

  undo(current: T): T | null {
    const prev = this.past.pop();
    if (prev === undefined) return null;
    this.future.push(current);
    this.lastGroup = null;
    return prev;
  }

  redo(current: T): T | null {
    const next = this.future.pop();
    if (next === undefined) return null;
    this.past.push(current);
    this.lastGroup = null;
    return next;
  }

  clear(): void { this.past = []; this.future = []; this.lastGroup = null; this.lastAt = Number.NEGATIVE_INFINITY; }
  /** Every state an undo or redo could bring back (the room keeps their audio in the store). */
  states(): readonly T[] { return [...this.past, ...this.future]; }
}

// ── the grid ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export function gridHitCount(tracks: readonly { pattern: readonly boolean[] }[]): number {
  return tracks.reduce((n, t) => n + t.pattern.filter(Boolean).length, 0);
}

/** CLEAR: every step off. The rows stay (a Flip row keeps its chop — send a pad again only to change the sound). */
export function clearGrid(tracks: readonly TrackState[]): TrackState[] {
  return tracks.map((t) => ({ ...t, pattern: t.pattern.map(() => false) }));
}

/** One cell, by row id (the grid draws a filtered list, so an index into it is not an index into the project). */
export function toggleStep(tracks: readonly TrackState[], sampleId: string, step: number): TrackState[] {
  if (step < 0 || step >= PROJECT_STEPS) return [...tracks];
  return tracks.map((t) => (t.sampleId !== sampleId ? t : { ...t, pattern: t.pattern.map((v, j) => (j === step ? !v : v)) }));
}

// ── sections ─────────────────────────────────────────────────────────────────────────────────────────────────────────

type SongPart = Pick<StudioProject, 'sections' | 'chain'>;
/** migrateProject reads a section name of at most 24 characters; the room never writes a longer one. */
export const SECTION_NAME_MAX = 24;

export function cleanSectionName(n: unknown): string | null {
  if (typeof n !== 'string') return null;
  const s = n.replace(/\s+/g, ' ').trim().slice(0, SECTION_NAME_MAX);
  return s || null;
}

/** Rename; a blank name keeps the old one (a section always has a name). Unchanged input → the same object back. */
export function renameSection<T extends SongPart>(x: T, id: string, name: string): T {
  const n = cleanSectionName(name);
  const s = x.sections.find((v) => v.id === id);
  if (!n || !s || s.name === n) return x;
  return { ...x, sections: x.sections.map((v) => (v.id === id ? { ...v, name: n } : v)) };
}

/** UPDATE FROM GRID: the section takes the working grid's pattern and swing (its name and chain places are kept). */
export function updateSectionFromGrid<T extends SongPart>(x: T, id: string, tracks: readonly TrackState[], swing: number): T {
  if (!x.sections.some((v) => v.id === id)) return x;
  return { ...x, sections: x.sections.map((v) => (v.id === id ? { ...v, tracks: snapshotTracks([...tracks]), swing } : v)) };
}

/** How many places in the chain a section has (the delete confirm says it). */
export function chainUses(chain: SongChain, id: string): number { return chain.filter((e) => e.sectionId === id).length; }

/** DELETE: the section and every chain place it had (an undo brings both back). */
export function deleteSection<T extends SongPart>(x: T, id: string): T {
  if (!x.sections.some((v) => v.id === id)) return x;
  const sections = x.sections.filter((v) => v.id !== id);
  return { ...x, sections, chain: normalizeChain(x.chain.filter((e) => e.sectionId !== id), sections) };
}

/** Reorder the chain: the entry at `from` moves to `to` (clamped). Out of range → unchanged. */
export function moveChainEntry(chain: SongChain, from: number, to: number): SongChain {
  if (from < 0 || from >= chain.length) return chain;
  const t = Math.max(0, Math.min(chain.length - 1, to));
  if (t === from) return chain;
  const out = [...chain];
  const [e] = out.splice(from, 1);
  out.splice(t, 0, e);
  return out;
}

// ── song mode: a separate playback source ────────────────────────────────────────────────────────────────────────────

/** The section the song plays at bar `bar` (the chain loops), or null for an empty chain. */
export function sectionForBar(chain: SongChain, sections: readonly ProjectSection[], bar: number): ProjectSection | null {
  const at = sectionAtBar(chain, bar);
  return at ? sections.find((s) => s.id === at.sectionId) ?? null : null;
}

/** What the grid shows in song mode: the section playing, else the chain's first — never the working grid, never edited. */
export function shownSection(chain: SongChain, sections: readonly ProjectSection[], playingId: string | null): ProjectSection | null {
  return sections.find((s) => s.id === playingId) ?? sectionForBar(chain, sections, 0);
}

// ── CELL: preview first, lay exactly the preview ─────────────────────────────────────────────────────────────────────

/** CELL SEAM — the local generator (moved from StudioMode, unchanged): a foundation for all eight kit rows. */
export function cellFoundation(seed: number, steps = PROJECT_STEPS): Record<string, boolean[]> {
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const P = (): boolean[] => new Array<boolean>(steps).fill(false);
  const kick = P(), snare = P(), hat = P(), open = P(), clap = P(), bass = P(), lead = P(), fx = P();
  for (const i of [0, 4, 8, 12]) kick[i] = true;
  if (rnd() < 0.5) kick[10] = true; else kick[14] = true;             // one syncopated push
  snare[4] = true; snare[12] = true;
  if (rnd() < 0.35) clap[12] = true;                                  // layered backbeat sometimes
  for (let i = 0; i < steps; i += 2) hat[i] = true;
  hat[Math.floor(rnd() * 8) * 2] = false;                             // one gap breathes
  if (rnd() < 0.5) open[14] = true;
  for (const i of [0, 3, 8, 11]) if (rnd() < 0.85) bass[i] = true;    // follows the kick's pocket
  const leadHits = 2 + Math.floor(rnd() * 2);
  for (let n = 0; n < leadHits; n++) lead[(2 + Math.floor(rnd() * 6) * 2 + 1) % steps] = true;
  if (rnd() < 0.4) fx[15] = true;
  return { kick, snare, hat, open, clap, bass, lead, fx };
}

/** The foundation for the rows the player can see and hear — nothing is written to a hidden row. */
export function foundationPreview(gen: Record<string, boolean[]>, shown: ReadonlySet<string>): Record<string, boolean[]> {
  const out: Record<string, boolean[]> = {};
  for (const [id, p] of Object.entries(gen)) if (shown.has(id)) out[id] = [...p];
  return out;
}

/** Lay a (previewed) foundation: the rows it names take its pattern; every other row is untouched. */
export function applyFoundation(tracks: readonly TrackState[], preview: Record<string, boolean[]>): TrackState[] {
  return tracks.map((t) => (preview[t.sampleId] ? { ...t, pattern: [...preview[t.sampleId]] } : t));
}

/** The preview as rows the engine can play (and the confirm can draw): the grid with the foundation laid. */
export function previewTracks(tracks: readonly TrackState[], preview: Record<string, boolean[]>): TrackState[] {
  return applyFoundation(tracks, preview);
}

// ── publish and remix carry the Flip chops ───────────────────────────────────────────────────────────────────────────

/** A Flip row's chop, as a published row carries it: where its sound is (a ref, never bytes) and how it is cut. */
export interface PublishedChop {
  pad: number; label: string; source: ProjectFlipSource; slice: Slice; reverse: boolean; pitch: number; gate: boolean;
  /** MUSIC-SUITE P3 FIX PASS: the sample rate the slice counts in (StudioProject ProjectFlip.rate). */
  rate?: number;
  /**
   * MUSIC-SUITE P5 FIX PASS (2026-09-25): this chop was published BAKED (v3: pitch and gate are in the row's buffer, and
   * the steps' notes are intervals from the pad as tuned). Absent = published by P3 / P4 (the deployed builds), whose row
   * played the RAW chop with the pitch on the notes and no gate — remixSeed reads those as v2 (see there).
   */
  baked?: true;
}
/** A published grid row. A Flip row carries its chop; StudioLibrary keeps `sequencer.tracks` verbatim (normalizeEntry). */
export type PublishedTrack = TrackState & { chop?: PublishedChop };

/**
 * The rows a publish records: exactly the heard rows (the drawn ones — what the rendered mixdown plays), each Flip row with
 * its chop. A Flip row with no chop in the project plays nothing, so it is not published (`silent` names it).
 */
export function publishTracks(tracks: readonly TrackState[], flipRows: readonly ProjectFlipRow[], shown: ReadonlySet<string>): { tracks: PublishedTrack[]; silent: string[] } {
  const out: PublishedTrack[] = [];
  const silent: string[] = [];
  for (const t of tracks) {
    if (!shown.has(t.sampleId)) continue;
    const row = { ...t, pattern: [...t.pattern] };
    if (!isFlipRowId(t.sampleId)) { out.push(row); continue; }
    const r = flipRows.find((x) => x.sampleId === t.sampleId);
    if (!r) { silent.push(t.sampleId); continue; }
    out.push({ ...row, chop: { pad: r.pad, label: r.label, source: JSON.parse(JSON.stringify(r.source)) as ProjectFlipSource, slice: { ...r.slice }, reverse: r.reverse, pitch: r.pitch, gate: r.gate, ...(r.rate ? { rate: r.rate } : {}), baked: true } });
  }
  return { tracks: out, silent };
}

/**
 * A remix's grid and Flip rows from a published record's rows, through the project's one door (migrateProject: a stored
 * record never makes the room fetch anything but a first-party /audio/ path or its own bytes). A Flip row whose chop is
 * missing (published before P3) or unreadable is LEFT OUT and named in `dropped` — never written as a row that plays nothing.
 *
 * MUSIC-SUITE P4 FIX PASS (2026-09-25): `kit` — the SOURCE record's kit (the voice its published audio played). A row
 * published before P4 has no notes, and migrateProject gives a note row its kit voice's note (VOICE_ROOTS) — but this
 * called it with no kit, so every pre-P4 bass / lead got STREET's A1 / A4 (33 / 69), and a remix of a NEON song (C2 / C5,
 * 36 / 72) or a DUST one (G1 / G4, 31 / 67) opened in another key than its source (the review reproduced it: bass 33, lead
 * 69 on a NEON remix, no issue said). P3's promise is that a remix plays the same sounds as its source.
 */
export function remixSeed(rows: readonly unknown[], kit?: unknown): { tracks: TrackState[]; flipRows: ProjectFlipRow[]; dropped: string[] } {
  const plain: unknown[] = [];
  const chops: unknown[] = [];
  let legacy = false;
  for (const r of rows) {
    if (!r || typeof r !== 'object') { plain.push(r); continue; }
    const { chop, ...track } = r as PublishedTrack;
    plain.push(track);
    if (chop && typeof chop === 'object' && typeof track.sampleId === 'string') {
      const { baked, ...rest } = chop;
      if (baked !== true) legacy = true;
      chops.push({ ...rest, sampleId: track.sampleId });
    }
  }
  // MUSIC-SUITE P5 FIX PASS (2026-09-25): A SONG PUBLISHED BEFORE P5 REMIXED AT TWICE ITS PITCH, CUT AT 1.2 s. This always
  // read the record as the CURRENT version (v3, baked chops), so migrateProject's v2 → v3 step (rebaseLegacyFlip: the
  // notes move down by the row's pitch, the gate goes off) never ran for a published record — and a P3 / P4 record looks
  // exactly like a v3 one. The review reproduced it: a P4 row (pitch +5, every note 65 — P4 padNote — gate true, the pad
  // default, a 2 s slice) remixed as pitch 5, notes 65, gate true: +5 baked + 5 on the note = +10 semitones, gated at 1.2 s,
  // where the published mixdown played it at +5 for the full 2 s. A P3 record (pitch 5, no notes) remixed at +5 where its
  // source played the raw chop. Decision #20 deploys every green phase, so those songs are in players' libraries now.
  // publishTracks marks a P5 chop `baked`; a record with a chop that lacks the mark is read as v2, and the migration makes
  // it sound as it was published: each row's notes move down by its pitch (a P4 row's 65s become 60; a P3 row, which has
  // no notes, gets 60 − pitch on every step) and its gate goes off.
  const m = migrateProject({ v: legacy ? 2 : STUDIO_PROJECT_VERSION, id: 'remix', tracks: plain, flipRows: chops, ...(kit !== undefined ? { kit } : {}) }, { now: 1 });
  if (!m.ok) return { tracks: [], flipRows: [], dropped: [] };
  const kept = new Set(m.project.flipRows.map((r) => r.sampleId));
  const dropped = m.project.tracks.filter((t) => isFlipRowId(t.sampleId) && !kept.has(t.sampleId)).map((t) => t.sampleId);
  return { tracks: m.project.tracks.filter((t) => !dropped.includes(t.sampleId)), flipRows: m.project.flipRows, dropped };
}

/** Audio keys published rows point at (the player's own Flip sources) — the Academy store keeps them while listed. */
export function publishedAudioKeys(records: readonly { sequencer?: { tracks?: readonly unknown[] } }[]): Set<string> {
  const keys = new Set<string>();
  for (const rec of records) {
    for (const t of rec.sequencer?.tracks ?? []) {
      const key = (t as PublishedTrack | null)?.chop?.source?.audio?.key;
      if (typeof key === 'string' && key) keys.add(key);
    }
  }
  return keys;
}

/**
 * What a Flip row SOUNDS like: its source, its cut, its direction — and (MUSIC-SUITE P5 FIX PASS, 2026-09-25) its pitch
 * and gate, which P5 bakes into the row's buffer. Without them an undo or a recorded hit that changed only a pitch or a
 * gate kept the old buffer, and the room patched it with chopEdit.retunedRows; the one signature covers it now.
 */
export function chopSignature(r: Pick<ProjectFlipRow, 'source' | 'slice' | 'reverse' | 'rate' | 'pitch' | 'gate'>): string {
  return JSON.stringify([r.source.audio?.key ?? r.source.url ?? r.source.id, r.slice.start, r.slice.end, r.reverse, r.rate ?? null, r.pitch, r.gate]);
}

/** Flip rows in `after` whose sound differs from `before` (new, or another chop): the engine must load them again. */
export function changedFlipRows(before: readonly ProjectFlipRow[], after: readonly ProjectFlipRow[]): ProjectFlipRow[] {
  const was = new Map(before.map((r) => [r.sampleId, chopSignature(r)]));
  return after.filter((r) => was.get(r.sampleId) !== chopSignature(r));
}

/** MUSIC-SUITE P3 FIX PASS: Flip rows in `before` that `after` no longer has — their sound leaves the engine. */
export function removedFlipRows(before: readonly ProjectFlipRow[], after: readonly ProjectFlipRow[]): string[] {
  const now = new Set(after.map((r) => r.sampleId));
  return before.filter((r) => !now.has(r.sampleId)).map((r) => r.sampleId);
}

/**
 * MUSIC-SUITE P3 FIX PASS, owner decision #15: does a published song contain a YOUR FILE upload (ProjectFlipSource.upload)?
 * Songs that do stay device-private until online review exists — this is what the sharing pass keys that rule on.
 */
export function publishedHasUpload(tracks: readonly unknown[]): boolean {
  return tracksHaveUpload(tracks);   // MUSIC-SUITE P5: the one reader lives in uploadPrivacy.ts (the library guards on it too)
}

// ── what plays, and what a publish renders (MUSIC-SUITE P3 FIX PASS: pure, so they are tested by behaviour) ─────────

/**
 * The room's playback source: CELL's preview while it is being heard, else the song's sections in song mode (SongPanel
 * hands them to the engine on each bar line, so the room stands down: `tracks` null), else the player's own grid —
 * at the PROJECT's swing. The review found the what-you-hear rules were pinned only by source strings.
 */
export function playbackSource(o: { preview: readonly TrackState[] | null; songMode: boolean; tracks: readonly TrackState[]; swing: number }):
  { kind: 'preview' | 'song' | 'grid'; tracks: TrackState[] | null; swing: number } {
  if (o.preview) return { kind: 'preview', tracks: [...o.preview], swing: o.swing };
  if (o.songMode) return { kind: 'song', tracks: null, swing: o.swing };
  return { kind: 'grid', tracks: [...o.tracks], swing: o.swing };
}

/**
 * What PUBLISH renders: the WORKING grid at the PROJECT's swing — never the section song mode is playing, nor its swing.
 * The review measured it: in song mode renderMixdown placed the grid at the playing section's swing (a hat on step 1 at
 * 120 BPM: 0.1250 s → 0.1500 s under a 40 % section) while the record said the project's swing.
 */
export function publishRender(p: Pick<StudioProject, 'tracks' | 'swing'>): { tracks: TrackState[]; swing: number } {
  return { tracks: p.tracks.map((t) => ({ ...t, pattern: [...t.pattern] })), swing: p.swing };
}

// ── MUSIC-SUITE P5 FIX PASS (2026-09-25): what a render's Flip rows play ──────────────────────────────────────────────
//
// What was wrong: P5 gave a song section its own chops, and song mode swaps them into the ENGINE's sounds on the bar line
// (StudioMode swapSectionChops → engine.loadBuffer under the working rows' ids). Every render read the engine's sounds
// (AudioEngine placeBar → this.samples), so:
//   · PUBLISH rendered the working grid with whatever section's chops song mode swapped in last (turning SONG MODE on
//     swaps section 0's in even while stopped) — the library audio played the section's old chop while the record, a
//     remix and the card named the grid's (the P3 FIX PASS promise "PUBLISH renders the working grid" broken again, the
//     same bug class P3 fixed for swing);
//   · RENDER SONG and STEMS rendered every bar with the last-swapped section's chops, while live song mode plays each
//     section's own (P4's "live == exported" broken).
// A render now takes the Flip sounds explicitly: flipSoundMap for the working grid (publish), songBarSounds for each bar
// of the song. A row with no chop, or one not on this device, is null — SILENT in that render, never the engine's.

/** Each Flip row id `tracks` hold → the buffer `sound` gives its chop in `rows` (null = silent: no chop, or not decoded). */
export function flipSoundMap<B>(tracks: readonly Pick<TrackState, 'sampleId'>[], rows: readonly ProjectFlipRow[], sound: (r: ProjectFlipRow) => B | null): Map<string, B | null> {
  const out = new Map<string, B | null>();
  for (const t of tracks) {
    if (!isFlipRowId(t.sampleId) || out.has(t.sampleId)) continue;
    const r = rows.find((x) => x.sampleId === t.sampleId);
    out.set(t.sampleId, r ? sound(r) : null);
  }
  return out;
}

/** Bar b of the song (the chain looped): its section's Flip sounds — the chops it was saved with, else the grid's. */
export function songBarSounds<B>(chain: SongChain, sections: readonly ProjectSection[], flipRows: readonly ProjectFlipRow[], bars: number, sound: (r: ProjectFlipRow) => B | null): Map<string, B | null>[] {
  return Array.from({ length: Math.max(0, bars) }, (_, b) => {
    const sec = sectionForBar(chain, sections, b);
    return sec ? flipSoundMap(sec.tracks, sectionChopsFor(sec, flipRows), sound) : new Map<string, B | null>();
  });
}

/** Every chop the song's render can play (the grid's rows and each section's own), once each by `key`. */
export function songChops(flipRows: readonly ProjectFlipRow[], sections: readonly Pick<ProjectSection, 'chops'>[], key: (r: ProjectFlipRow) => string): ProjectFlipRow[] {
  const seen = new Set<string>();
  const out: ProjectFlipRow[] = [];
  for (const r of [...flipRows, ...sections.flatMap((s) => s.chops ?? [])]) { const k = key(r); if (!seen.has(k)) { seen.add(k); out.push(r); } }
  return out;
}
