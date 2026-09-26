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
  PROJECT_STEPS, STUDIO_PROJECT_VERSION, migrateProject, projectAudioKeys,
  type ProjectFlipRow, type ProjectFlipSource, type ProjectSection, type StudioProject,
} from './StudioProject';
import { isFlipRowId } from './MusicTiers';
import type { Slice } from './Flip';

// ── undo / redo ──────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * What an undo puts back: the grid (kit + Flip rows), the Flip rows' chops, the sections and the chain.
 * MUSIC-SUITE P3 FIX PASS (2026-09-25), owner decision #4 ("Studio depth: autosave, undo, …"): and the takes, the FLIP tab
 * (its source and 16 chops), the tempo, the swing, the kit and MASTER. The review found the player's own vocal take was
 * the one thing that could be neither confirmed nor recovered (one tap on its ×, no history entry — the slice did not
 * change — so UNDO undid an unrelated grid edit instead), and that a tap on a FEL stem replaced a mic take and 16 edited
 * chops for good. A removed recording's bytes stay in the store while the history can bring it back (the room adds
 * historyAudioKeys to the store's keep set).
 */
export type UndoSlice = Pick<StudioProject, 'tracks' | 'flipRows' | 'sections' | 'chain' | 'takes' | 'flip' | 'bpm' | 'swing' | 'kit' | 'mixer'>;
export const UNDO_KEYS = ['tracks', 'flipRows', 'sections', 'chain', 'takes', 'flip', 'bpm', 'swing', 'kit', 'mixer'] as const;
/** Steps kept (the brief asks for at least 50). */
export const UNDO_LIMIT = 100;
/** A grouped burst (live pad taps with REC armed) within this long of its last edit is ONE undo step. */
export const COALESCE_MS = 1500;

export function undoSlice(p: UndoSlice): UndoSlice {
  return { tracks: p.tracks, flipRows: p.flipRows, sections: p.sections, chain: p.chain, takes: p.takes, flip: p.flip, bpm: p.bpm, swing: p.swing, kit: p.kit, mixer: p.mixer };
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
    out.push({ ...row, chop: { pad: r.pad, label: r.label, source: JSON.parse(JSON.stringify(r.source)) as ProjectFlipSource, slice: { ...r.slice }, reverse: r.reverse, pitch: r.pitch, gate: r.gate, ...(r.rate ? { rate: r.rate } : {}) } });
  }
  return { tracks: out, silent };
}

/**
 * A remix's grid and Flip rows from a published record's rows, through the project's one door (migrateProject: a stored
 * record never makes the room fetch anything but a first-party /audio/ path or its own bytes). A Flip row whose chop is
 * missing (published before P3) or unreadable is LEFT OUT and named in `dropped` — never written as a row that plays nothing.
 */
export function remixSeed(rows: readonly unknown[]): { tracks: TrackState[]; flipRows: ProjectFlipRow[]; dropped: string[] } {
  const plain: unknown[] = [];
  const chops: unknown[] = [];
  for (const r of rows) {
    if (!r || typeof r !== 'object') { plain.push(r); continue; }
    const { chop, ...track } = r as PublishedTrack;
    plain.push(track);
    if (chop && typeof chop === 'object' && typeof track.sampleId === 'string') chops.push({ ...chop, sampleId: track.sampleId });
  }
  const m = migrateProject({ v: STUDIO_PROJECT_VERSION, id: 'remix', tracks: plain, flipRows: chops }, { now: 1 });
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

/** What a Flip row SOUNDS like (pitch and gate are not baked in until P5): its source, its cut, its direction. */
export function chopSignature(r: Pick<ProjectFlipRow, 'source' | 'slice' | 'reverse' | 'rate'>): string {
  return JSON.stringify([r.source.audio?.key ?? r.source.url ?? r.source.id, r.slice.start, r.slice.end, r.reverse, r.rate ?? null]);
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
  return tracks.some((t) => (t as PublishedTrack | null)?.chop?.source?.upload === true);
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
