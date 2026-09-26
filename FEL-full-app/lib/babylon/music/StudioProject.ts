// StudioProject — EVERYTHING A PLAYER MAKES IN THE ACADEMY, AS ONE THING (MUSIC-SUITE P3, "Keep my work", 2026-09-25).
//
// What was wrong (P1 baseline, outbox musicsuite/BASELINE.md 2b, p1/music-baseline.json): the Academy kept the player's
// work in four places and saved none of them. The grid, tempo, swing and kit were StudioMode useState (StudioMode.tsx
// ~:165-220 then); the sections, chain and takes were SongPanel useState (SongPanel.tsx:42-53 then); the Flip source and its
// chops were FlipPad useState (FlipPad.tsx:26-31 then). Measured: REPLAY and a page reload cleared the grid (14 lit cells →
// 0), and ANY tab switch cleared the song sections (1 → 0, chain bars 2 → 0) and the Flip sample, because SongPanel and
// FlipPad unmount when their tab is not shown. The dance export named every song 'My Track' and minted a fresh id per mount
// (SongPanel.tsx:47, :170 then), so its "deterministic" chart moved between sessions.
//
// This is the single source of truth: one pure, versioned record. StudioMode holds it in state, SongPanel and FlipPad
// edit their slices of it, studioStore.ts autosaves it (JSON beside the audio blobs, in IndexedDB), and a reload / REPLAY
// / tab switch restores it. Audio never lives here — a take or a Flip source is an AudioRef (a key into the store's audio
// table); the room decodes it when it needs it.
//
// migrateProject is the only door in: anything read back from the store goes through it. A record from a newer FEL, or one
// that is not a project at all, is REFUSED (the room opens a fresh project and says so, and the old record is left
// alone); a readable record with damaged parts is REPAIRED and every repair is named (issues[]) — nothing is dropped
// without a line saying so.
//
// Pure: no audio, no DOM, no storage.
import type { TrackState } from './AudioEngine';
import { MAX_SONG_BARS, normalizeChain, songBars, type Section, type SongChain, type Take } from './Song';
import { PAD_COUNT, isAllowedSource, padsFromSlices, type Pad, type Slice, type SourceKind } from './Flip';
import { KIT_SLOTS, type KitId } from './SynthKit';
import { DEFAULT_KIT, isKitId } from './purchases';

/** Bump when the shape changes, and teach migrateProject the step from the old one. */
export const STUDIO_PROJECT_VERSION = 1;
/** The grid's steps (performSet PERFORM_STEPS_PER_BAR — a test pins them equal). */
export const PROJECT_STEPS = 16;
/** The room's sliders (StudioMode: BPM 60–160, SWING 0–40 %). A stored value outside them is clamped, and said. */
export const BPM_RANGE = [60, 160] as const;
export const SWING_RANGE = [0, 0.4] as const;
export const DEFAULT_BPM = 92;
export const DEFAULT_SWING = 0.15;
export const MAX_TITLE = 48;
/** Caps that only a damaged record reaches (the room has no way to make this many); each cut is an issue, never silent. */
export const MAX_SECTIONS = 64;
export const MAX_TAKES = 64;
export const MAX_FLIP_ROWS = PAD_COUNT;

/** A saved sound: the key of its bytes in the store's audio table (studioStore.ts), plus what they are. */
export interface AudioRef { key: string; mime: string; bytes: number }

/**
 * MUSIC-SUITE P3 (P2 REPORT deferred item): a section CARRIES its swing. P2 made song mode play each section at the swing
 * it was saved at, but the swing lived in a SongPanel-local type (SwungSection, optional) and Song.ts Section had none, so
 * nothing could keep it. Here it is required; a v0 record's section without one takes the record's swing (migrate).
 */
export interface ProjectSection extends Section { swing: number }
/** A recorded take: where it starts and how loud (Song.Take), and its audio. */
export interface ProjectTake extends Take { audio: AudioRef }

/**
 * A Flip source: FEL's own stem (a first-party /audio/ path) or the player's own recording (saved audio).
 * MUSIC-SUITE P3 FIX PASS (2026-09-25), owner decision #15 ("uploads with an 'I made or own this' tick — songs containing
 * uploads stay device-private until online review exists"): a YOUR FILE upload and a MIC TAKE were both kind 'own', told
 * apart only by an id prefix (own_ / mic_). `upload: true` marks an uploaded file explicitly, it rides into every row,
 * published chop and remix made from it (the source is copied whole), and studioEdit.publishedHasUpload reads it — the
 * key the sharing pass keeps a song private on.
 */
export interface ProjectFlipSource { id: string; label: string; kind: SourceKind; note: string; url?: string; audio?: AudioRef; upload?: true }
/**
 * The FLIP tab: the loaded source, how it is sliced, and the sixteen chops (slice points + pitch / gate / reverse).
 * MUSIC-SUITE P3 FIX PASS: `rate` = the sample rate the slice points count in (the rate the source was decoded at). Slices
 * are sample indices, and decodeAudioData resamples to the AudioContext's rate, which follows the output device
 * (assumption: 48 kHz speakers, 44.1 kHz on some headsets) — a chop saved at one rate cut ~8.8 % late and long at the
 * other. FlipPad.chopBuffer rescales by it. Absent (saved before this field) = the reader's rate.
 */
export interface ProjectFlip { source: ProjectFlipSource | null; slicing: 'transient' | 'grid'; gridN: number; chops: Pad[]; rate?: number }
/**
 * A pad sent to the groovebox: the grid row `flip_<pad>` and the exact chop it plays, with its own copy of the source —
 * reslicing the FLIP tab or loading another source later must not change what an already-written row sounds like.
 * `pitch` and `gate` are kept for P5 (baked chops); today the row plays the slice (reversed when asked) at rate 1.
 */
export interface ProjectFlipRow { sampleId: string; pad: number; label: string; source: ProjectFlipSource; slice: Slice; reverse: boolean; pitch: number; gate: boolean; rate?: number }

/** MUSIC-SUITE P4 placeholder: channel strips (mute/solo/vol/pan/sends) land in `channels`. Today: MASTER polish only. */
export interface ProjectMixer { polish: boolean; channels: Record<string, { solo?: boolean; room?: number; delay?: number }> }

export interface StudioProject {
  v: typeof STUDIO_PROJECT_VERSION;
  /** Stable for the project's life: the dance export's id and seed come from it (DanceExport exportedTrackId / seedFrom). */
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  bpm: number;
  swing: number;
  kit: KitId;
  /**
   * The grid: the eight kit rows in KIT_SLOTS order, then any `flip_<n>` rows. All of them are kept — the tier decides how
   * many the grid SHOWS (MusicTiers caps.tracks), and a tier only ever grows, so a row hidden today is shown tomorrow.
   */
  tracks: TrackState[];
  flipRows: ProjectFlipRow[];
  sections: ProjectSection[];
  chain: SongChain;
  takes: ProjectTake[];
  flip: ProjectFlip;
  mixer: ProjectMixer;
  /** Credit for a remix (StudioLibrary TrackRecord.remixOf), kept so a later publish still credits the original. */
  remixOf: { id: string; title: string; authorName: string } | null;
}

/** SongPanel's slice of a project. */
export type SongSlice = Pick<StudioProject, 'sections' | 'chain' | 'takes'>;

const rand36 = (): string => Math.floor(Math.random() * 36 ** 4).toString(36).padStart(4, '0');
export function newProjectId(now = Date.now()): string { return `prj_${now.toString(36)}${rand36()}`; }
export function newAudioKey(now = Date.now()): string { return `aud_${now.toString(36)}${rand36()}`; }
export function newTakeId(now = Date.now()): string { return `t${now.toString(36)}${rand36()}`; }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Beat · Sep 25 17:40" — a name the player can tell apart in MY PROJECTS until they rename it. Local time. */
export function defaultProjectTitle(now: number): string {
  const d = new Date(now);
  const hh = String(d.getHours()).padStart(2, '0'), mm = String(d.getMinutes()).padStart(2, '0');
  return `Beat · ${MONTHS[d.getMonth()]} ${d.getDate()} ${hh}:${mm}`;
}

export function emptyPattern(): boolean[] { return new Array<boolean>(PROJECT_STEPS).fill(false); }
/** The eight kit rows, empty — what StudioMode's grid starts from. */
export function emptyKitTracks(): TrackState[] {
  return KIT_SLOTS.map((k) => ({ sampleId: k.id, pattern: emptyPattern(), volume: 0.8, muted: false, pan: 0 }));
}
export function emptyFlip(): ProjectFlip { return { source: null, slicing: 'transient', gridN: 8, chops: padsFromSlices([]) }; }

export function newProject(opts: { now: number; id?: string; title?: string; kit?: KitId; bpm?: number; swing?: number; polish?: boolean } = { now: Date.now() }): StudioProject {
  const now = opts.now;
  return {
    v: STUDIO_PROJECT_VERSION,
    id: opts.id ?? newProjectId(now),
    title: cleanTitle(opts.title) ?? defaultProjectTitle(now),
    createdAt: now, updatedAt: now,
    bpm: opts.bpm ?? DEFAULT_BPM, swing: opts.swing ?? DEFAULT_SWING, kit: opts.kit ?? DEFAULT_KIT,
    tracks: emptyKitTracks(), flipRows: [], sections: [], chain: [], takes: [],
    flip: emptyFlip(), mixer: { polish: opts.polish === true, channels: {} }, remixOf: null,
  };
}

/** What MY PROJECTS' NEW and a REMIX open with (useStudioProject ops.create). */
export type ProjectSeed = Partial<Pick<StudioProject, 'title' | 'tracks' | 'flipRows' | 'bpm' | 'swing' | 'kit' | 'remixOf'>> & {
  /** MUSIC-SUITE P3 FIX PASS: MASTER. A remix of a mastered song opens mastered (it opened with MASTER off, unlike its source). */
  polish?: boolean;
};

/**
 * A new project from a seed (MUSIC-SUITE P3 FIX PASS: moved out of the hook so the remix round trip is tested whole). A
 * seed with a pattern (a remix from the library) goes through the one door in, migrateProject, like anything read from
 * storage; `issues` are the repairs that made (repairLine says them).
 */
export function projectFromSeed(seed: ProjectSeed | undefined, ctx: { now: number; kit: KitId }): { project: StudioProject; issues: string[] } {
  const p = newProject({
    now: ctx.now, kit: seed?.kit ?? ctx.kit, ...(seed?.title ? { title: seed.title } : {}), ...(seed?.bpm ? { bpm: seed.bpm } : {}),
    ...(seed?.swing !== undefined ? { swing: seed.swing } : {}), ...(seed?.polish !== undefined ? { polish: seed.polish } : {}),
  });
  if (!seed?.tracks) return { project: p, issues: [] };
  const m = migrateProject(JSON.parse(JSON.stringify({ ...p, tracks: seed.tracks, flipRows: seed.flipRows ?? [], remixOf: seed.remixOf ?? null })), { now: p.createdAt });
  return m.ok ? { project: m.project, issues: m.issues } : { project: p, issues: [] };
}

/** A title as the room shows it: trimmed, one line, at most MAX_TITLE characters; blank = none. */
export function cleanTitle(t: unknown): string | null {
  if (typeof t !== 'string') return null;
  const s = t.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE);
  return s ? s : null;
}

/** Rename; a blank name keeps the old one (a project always has a name). */
export function renameProject(p: StudioProject, title: string): StudioProject {
  const t = cleanTitle(title);
  return t && t !== p.title ? { ...p, title: t } : p;
}

/** A deep copy under a new id and name. Audio refs are SHARED (the bytes are not copied); the store deletes an audio
 *  record only when no project references it any more (studioStore deleteProject / sweepAudio). */
export function duplicateProject(p: StudioProject, opts: { now: number; id?: string }): StudioProject {
  const copy = JSON.parse(JSON.stringify(p)) as StudioProject;
  const title = `${p.title.slice(0, MAX_TITLE - 7)} (copy)`;
  return { ...copy, id: opts.id ?? newProjectId(opts.now), title, createdAt: opts.now, updatedAt: opts.now };
}

/** Every audio key the project references — what the store must keep. */
export function projectAudioKeys(p: Pick<StudioProject, 'takes' | 'flip' | 'flipRows'>): Set<string> {
  const keys = new Set<string>();
  for (const t of p.takes) keys.add(t.audio.key);
  if (p.flip.source?.audio) keys.add(p.flip.source.audio.key);
  for (const r of p.flipRows) if (r.source.audio) keys.add(r.source.audio.key);
  return keys;
}

/** Keys sorted at every level, so two equal projects compare equal whatever order their fields were written in. */
function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(v as object).sort()) o[k] = canonical((v as Record<string, unknown>)[k]);
    return o;
  }
  return v;
}

/** What autosave compares: the content, not the save stamp (a save must not look like an edit), in canonical key order. */
export function projectSignature(p: StudioProject): string {
  return JSON.stringify(canonical({ ...p, updatedAt: 0 }));
}

/** The line MY PROJECTS shows under a title. */
export function projectSummary(p: StudioProject): { hits: number; sections: number; bars: number; takes: number; flip: boolean } {
  return {
    hits: p.tracks.reduce((n, t) => n + t.pattern.filter(Boolean).length, 0),
    sections: p.sections.length, bars: songBars(p.chain), takes: p.takes.length, flip: !!p.flip.source,
  };
}

// ── edits the room makes (pure, so the rules are tested once) ─────────────────────────────────────────────────────────

const flipIndex = (sampleId: string): number => { const m = /^flip_(\d{1,2})$/.exec(sampleId); return m ? Number(m[1]) : -1; };
/** `flip_<pad>` — a Flip pad's grid row. */
export function flipSampleId(pad: number): string { return `flip_${pad}`; }

/** A pad sent (or first recorded) to the grid: its row exists, and the row remembers the exact chop it plays. */
export function withFlipRow(p: StudioProject, row: ProjectFlipRow): StudioProject {
  const tracks = p.tracks.some((t) => t.sampleId === row.sampleId)
    ? p.tracks
    : [...p.tracks, { sampleId: row.sampleId, pattern: emptyPattern(), volume: 0.9, muted: false, pan: 0 }];
  const flipRows = [...p.flipRows.filter((r) => r.sampleId !== row.sampleId), row];
  return { ...p, tracks, flipRows };
}

/** A live pad tap while REC is armed: the step under the playhead lights on that pad's row. */
export function withFlipHit(p: StudioProject, sampleId: string, step: number): StudioProject {
  if (step < 0 || step >= PROJECT_STEPS) return p;
  return { ...p, tracks: p.tracks.map((t) => (t.sampleId === sampleId ? { ...t, pattern: t.pattern.map((v, j) => (j === step ? true : v)) } : t)) };
}

// ── migrate: the only door in ─────────────────────────────────────────────────────────────────────────────────────────

export type MigrateResult =
  | { ok: true; project: StudioProject; from: number; issues: string[] }
  | { ok: false; reason: 'not-a-project' | 'newer-version' | 'bad-version'; detail: string };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const str = (v: unknown, max: number): string | null => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null);
const AUDIO_KEY = /^[A-Za-z0-9_-]{1,64}$/;

function readAudioRef(v: unknown): AudioRef | null {
  if (!isObj(v)) return null;
  const key = typeof v.key === 'string' && AUDIO_KEY.test(v.key) ? v.key : null;
  if (!key) return null;
  return { key, mime: str(v.mime, 96) ?? 'application/octet-stream', bytes: finite(v.bytes) && v.bytes >= 0 ? Math.floor(v.bytes) : 0 };
}

/**
 * A source the room may fetch or decode. A FEL source must be a first-party /audio/ path — a stored record never makes the
 * room fetch somebody else's URL (the IP rule: FEL-made, public-domain with a note, or the player's own).
 */
function readSource(v: unknown): ProjectFlipSource | null {
  if (!isObj(v)) return null;
  const id = str(v.id, 96), label = str(v.label, 96);
  if (!id || !label || !isAllowedSource(v.kind)) return null;
  const url = typeof v.url === 'string' && /^\/audio\/[A-Za-z0-9/_.-]{1,200}$/.test(v.url) && !v.url.includes('..') ? v.url : undefined;
  const audio = readAudioRef(v.audio) ?? undefined;
  if (!url && !audio) return null;                       // nothing to play it from
  return {
    id, label, kind: v.kind, note: typeof v.note === 'string' ? v.note.slice(0, 240) : '', ...(url ? { url } : {}), ...(audio ? { audio } : {}),
    ...(v.upload === true ? { upload: true as const } : {}),   // MUSIC-SUITE P3 FIX PASS: decision #15's mark, never dropped
  };
}

/** A sample rate the slice points count in (8–384 kHz), or undefined. */
const readRate = (v: unknown): number | undefined => (finite(v) && v >= 8000 && v <= 384000 ? Math.round(v) : undefined);

function readSlice(v: unknown): Slice | null {
  if (!isObj(v) || !finite(v.start) || !finite(v.end)) return null;
  const start = Math.max(0, Math.floor(v.start)), end = Math.floor(v.end);
  return end > start ? { start, end } : null;
}

function readPad(v: unknown): Pad {
  if (!isObj(v)) return { slice: null, pitch: 0, reverse: false, gate: true };
  return {
    slice: readSlice(v.slice),
    pitch: finite(v.pitch) ? clamp(Math.round(v.pitch), -12, 12) : 0,
    reverse: v.reverse === true,
    gate: v.gate !== false,
  };
}

/** One grid row, repaired: a 16-step boolean pattern, volume 0–1.5, pan −1–1. `where` names it in an issue. */
function readTrack(v: unknown, where: string, issues: string[]): TrackState | null {
  if (!isObj(v)) { issues.push(`${where}: not a track (dropped)`); return null; }
  const sampleId = str(v.sampleId, 32);
  if (!sampleId) { issues.push(`${where}: no sound id (dropped)`); return null; }
  let pattern: boolean[];
  const steps = v.pattern;
  if (Array.isArray(steps)) {
    pattern = Array.from({ length: PROJECT_STEPS }, (_, i) => steps[i] === true);
    if (steps.length !== PROJECT_STEPS) issues.push(`${where} (${sampleId}): ${steps.length} steps read as ${PROJECT_STEPS}`);
  } else { pattern = emptyPattern(); issues.push(`${where} (${sampleId}): steps unreadable, row kept empty`); }
  return {
    sampleId, pattern,
    volume: finite(v.volume) ? clamp(v.volume, 0, 1.5) : 0.8,
    muted: v.muted === true,
    pan: finite(v.pan) ? clamp(v.pan, -1, 1) : 0,
  };
}

/** A track list: known rows only (a kit slot or flip_0..15), no duplicates; with `kitRows`, all eight kit rows first. */
function readTracks(v: unknown, where: string, issues: string[], kitRows: boolean): TrackState[] {
  const raw = Array.isArray(v) ? v : [];
  const seen = new Set<string>();
  const out: TrackState[] = [];
  raw.forEach((t, i) => {
    const tr = readTrack(t, `${where} row ${i + 1}`, issues);
    if (!tr) return;
    const known = KIT_SLOTS.some((k) => k.id === tr.sampleId) || (flipIndex(tr.sampleId) >= 0 && flipIndex(tr.sampleId) < PAD_COUNT);
    if (!known) { issues.push(`${where}: unknown row "${tr.sampleId}" (dropped)`); return; }
    if (seen.has(tr.sampleId)) { issues.push(`${where}: second "${tr.sampleId}" row (dropped)`); return; }
    seen.add(tr.sampleId); out.push(tr);
  });
  if (!kitRows) return out;
  // The grid's row order is the kit's (the tier shows the first N): kit rows in KIT_SLOTS order, then the Flip rows.
  const kit = KIT_SLOTS.map((k) => {
    const found = out.find((t) => t.sampleId === k.id);
    if (!found && raw.length) issues.push(`${where}: the ${k.name} row was missing (added empty)`);
    return found ?? { sampleId: k.id, pattern: emptyPattern(), volume: 0.8, muted: false, pan: 0 };
  });
  const flips = out.filter((t) => flipIndex(t.sampleId) >= 0).sort((a, b) => flipIndex(a.sampleId) - flipIndex(b.sampleId));
  return [...kit, ...flips];
}

/**
 * Read a stored record into a project of the current version, or refuse it.
 *
 * Versions: v0 is the unversioned shape (no `v`): the room's P2-era state — bpm / swing / tracks / sections (whose swing
 * may be missing) / chain / kit, with no id, title, takes, Flip or mixer. v1 is this file. A `v` above
 * STUDIO_PROJECT_VERSION is a record from a newer FEL: refused, never rewritten (the room opens a fresh project).
 * A record with no grid at all (`tracks` not an array) is not a project: refused.
 */
export function migrateProject(raw: unknown, ctx: { now: number; newId?: () => string }): MigrateResult {
  if (!isObj(raw)) return { ok: false, reason: 'not-a-project', detail: raw === null ? 'empty record' : `a ${Array.isArray(raw) ? 'list' : typeof raw}, not a project` };
  const from = raw.v === undefined ? 0 : raw.v;
  if (typeof from !== 'number' || !Number.isInteger(from) || from < 0) return { ok: false, reason: 'bad-version', detail: `version ${JSON.stringify(raw.v)}` };
  if (from > STUDIO_PROJECT_VERSION) return { ok: false, reason: 'newer-version', detail: `saved by a newer FEL (v${from}; this one reads up to v${STUDIO_PROJECT_VERSION})` };
  if (!Array.isArray(raw.tracks)) return { ok: false, reason: 'not-a-project', detail: 'no grid in the record' };

  const issues: string[] = [];
  const now = ctx.now;
  const id = typeof raw.id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(raw.id) ? raw.id : null;
  if (!id && from >= 1) issues.push('the project id was unreadable (given a new one)');
  const createdAt = finite(raw.createdAt) && raw.createdAt > 0 ? raw.createdAt : now;
  const updatedAt = finite(raw.updatedAt) && raw.updatedAt > 0 ? raw.updatedAt : createdAt;

  let bpm = DEFAULT_BPM;
  if (finite(raw.bpm)) { bpm = clamp(Math.round(raw.bpm), BPM_RANGE[0], BPM_RANGE[1]); if (bpm !== raw.bpm) issues.push(`tempo ${raw.bpm} read as ${bpm} BPM`); }
  else if (raw.bpm !== undefined) issues.push(`tempo unreadable (${DEFAULT_BPM} BPM)`);
  let swing = DEFAULT_SWING;
  if (finite(raw.swing)) { swing = clamp(raw.swing, SWING_RANGE[0], SWING_RANGE[1]); if (swing !== raw.swing) issues.push(`swing ${raw.swing} read as ${Math.round(swing * 100)} %`); }
  else if (raw.swing !== undefined) issues.push(`swing unreadable (${DEFAULT_SWING * 100} %)`);
  const kit: KitId = isKitId(raw.kit) ? raw.kit : DEFAULT_KIT;
  if (raw.kit !== undefined && !isKitId(raw.kit)) issues.push(`kit "${String(raw.kit)}" unknown (${DEFAULT_KIT})`);

  const tracks = readTracks(raw.tracks, 'grid', issues, true);

  // sections: each a named snapshot with its OWN swing (v0 / pre-P3: missing → the record's swing, a migration not a fault)
  const sections: ProjectSection[] = [];
  const rawSections = Array.isArray(raw.sections) ? raw.sections : [];
  if (raw.sections !== undefined && !Array.isArray(raw.sections)) issues.push('sections unreadable (none kept)');
  const sectionIds = new Set<string>();
  let sectionsCut = 0;
  rawSections.forEach((s, i) => {
    if (sections.length >= MAX_SECTIONS) { sectionsCut++; return; }
    if (!isObj(s) || !str(s.id, 96) || !Array.isArray(s.tracks)) { issues.push(`section ${i + 1} unreadable (dropped)`); return; }
    const sid = s.id as string;
    if (sectionIds.has(sid)) { issues.push(`section ${i + 1}: a second "${sid}" (dropped)`); return; }
    sectionIds.add(sid);
    let sw = swing;
    if (finite(s.swing)) sw = clamp(s.swing, SWING_RANGE[0], SWING_RANGE[1]);
    else if (s.swing !== undefined) issues.push(`section ${i + 1}: swing unreadable (the project's)`);
    sections.push({ id: sid, name: str(s.name, 24) ?? 'section', tracks: readTracks(s.tracks, `section ${i + 1}`, issues, false), swing: sw });
  });
  if (sectionsCut) issues.push(`${sectionsCut} section${sectionsCut === 1 ? '' : 's'} past the ${MAX_SECTIONS} cap (dropped)`);

  const chainIn = Array.isArray(raw.chain) ? raw.chain : [];
  const chain = normalizeChain(chainIn, sections);
  if (raw.chain !== undefined && !Array.isArray(raw.chain)) issues.push('song chain unreadable (empty)');
  else if (chain.length !== chainIn.length) issues.push(`song chain: ${chainIn.length - chain.length} entr${chainIn.length - chain.length === 1 ? 'y' : 'ies'} pointed at nothing (dropped)`);
  else if (chainIn.some((e, i) => !isObj(e) || e.bars !== chain[i].bars)) issues.push('song chain: bar counts read as 1–8');

  const takes: ProjectTake[] = [];
  const takeIds = new Set<string>();
  let takesCut = 0;
  (Array.isArray(raw.takes) ? raw.takes : []).forEach((t, i) => {
    if (takes.length >= MAX_TAKES) { takesCut++; return; }
    const audio = isObj(t) ? readAudioRef(t.audio) : null;
    const tid = isObj(t) ? str(t.id, 32) : null;
    if (!isObj(t) || !audio || !tid || takeIds.has(tid)) { issues.push(`take ${i + 1} unreadable (dropped)`); return; }
    takeIds.add(tid);
    takes.push({
      id: tid,
      atBar: finite(t.atBar) ? clamp(Math.floor(t.atBar), 0, MAX_SONG_BARS - 1) : 0,
      gain: finite(t.gain) ? clamp(t.gain, 0, 2) : 0.9,
      durationSec: finite(t.durationSec) && t.durationSec >= 0 ? Math.min(t.durationSec, 600) : 0,
      audio,
    });
  });
  if (takesCut) issues.push(`${takesCut} take${takesCut === 1 ? '' : 's'} past the ${MAX_TAKES} cap (dropped)`);
  if (raw.takes !== undefined && !Array.isArray(raw.takes)) issues.push('takes unreadable (none kept)');

  // the FLIP tab: source + slicing + 16 chops
  let flip = emptyFlip();
  if (isObj(raw.flip)) {
    const source = raw.flip.source == null ? null : readSource(raw.flip.source);
    if (raw.flip.source != null && !source) issues.push('the Flip source was unreadable (unloaded)');
    const chopsIn = Array.isArray(raw.flip.chops) ? raw.flip.chops : [];
    const rate = source ? readRate(raw.flip.rate) : undefined;
    flip = {
      source,
      slicing: raw.flip.slicing === 'grid' ? 'grid' : 'transient',
      gridN: finite(raw.flip.gridN) ? clamp(Math.round(raw.flip.gridN), 2, PAD_COUNT) : 8,
      chops: Array.from({ length: PAD_COUNT }, (_, i) => readPad(source ? chopsIn[i] : null)),
      ...(rate ? { rate } : {}),
    };
  } else if (raw.flip !== undefined) issues.push('the Flip tab was unreadable (emptied)');

  const flipRows: ProjectFlipRow[] = [];
  (Array.isArray(raw.flipRows) ? raw.flipRows : []).forEach((r, i) => {
    if (flipRows.length >= MAX_FLIP_ROWS) { issues.push(`Flip row ${i + 1}: past the ${MAX_FLIP_ROWS} pads (dropped)`); return; }
    const source = isObj(r) ? readSource(r.source) : null;
    const slice = isObj(r) ? readSlice(r.slice) : null;
    const pad = isObj(r) && finite(r.pad) ? Math.floor(r.pad) : -1;
    const sampleId = flipSampleId(pad);
    if (!isObj(r) || !source || !slice || pad < 0 || pad >= PAD_COUNT || r.sampleId !== sampleId || flipRows.some((x) => x.sampleId === sampleId)) {
      issues.push(`Flip row ${i + 1}: its chop was unreadable (the row plays nothing until a pad is sent again)`);
      return;
    }
    const rate = readRate(r.rate);
    flipRows.push({ sampleId, pad, label: str(r.label, 32) ?? `FLIP ${pad + 1}`, source, slice, reverse: r.reverse === true, pitch: finite(r.pitch) ? clamp(Math.round(r.pitch), -12, 12) : 0, gate: r.gate !== false, ...(rate ? { rate } : {}) });
  });

  const mixer: ProjectMixer = { polish: isObj(raw.mixer) ? raw.mixer.polish === true : raw.polished === true, channels: {} };
  if (isObj(raw.mixer) && isObj(raw.mixer.channels)) {
    for (const [k, c] of Object.entries(raw.mixer.channels)) {
      if (!isObj(c) || !str(k, 32)) continue;
      mixer.channels[k] = {
        ...(typeof c.solo === 'boolean' ? { solo: c.solo } : {}),
        ...(finite(c.room) ? { room: clamp(c.room, 0, 1) } : {}),
        ...(finite(c.delay) ? { delay: clamp(c.delay, 0, 1) } : {}),
      };
    }
  }

  const remixOf = isObj(raw.remixOf) && str(raw.remixOf.id, 96) && str(raw.remixOf.title, 200)
    ? { id: raw.remixOf.id as string, title: raw.remixOf.title as string, authorName: typeof raw.remixOf.authorName === 'string' ? raw.remixOf.authorName.slice(0, 96) : '' }
    : null;

  const project: StudioProject = {
    v: STUDIO_PROJECT_VERSION,
    id: id ?? (ctx.newId ? ctx.newId() : newProjectId(now)),
    title: cleanTitle(raw.title) ?? defaultProjectTitle(createdAt),
    createdAt, updatedAt, bpm, swing, kit, tracks, flipRows, sections, chain, takes, flip, mixer, remixOf,
  };
  return { ok: true, project, from, issues };
}

/** A migrate refusal in the room's words. */
export function refusalLine(r: Extract<MigrateResult, { ok: false }>, title: string | null): string {
  const what = title ? `"${title}"` : 'Your last project';
  const why = r.reason === 'newer-version' ? 'it was saved by a newer version of FEL' : r.reason === 'bad-version' ? 'its version mark is damaged' : 'it is damaged';
  return `${what} couldn't be opened — ${why}. It is kept in MY PROJECTS; this is a new project.`;
}

/** A repaired open in the room's words: every repair counted, the first two named. */
export function repairLine(title: string, issues: string[]): string | null {
  if (!issues.length) return null;
  const shown = issues.slice(0, 2).join('; ');
  return `Opened "${title}" with ${issues.length} repair${issues.length === 1 ? '' : 's'}: ${shown}${issues.length > 2 ? ` (+${issues.length - 2} more)` : ''}.`;
}
