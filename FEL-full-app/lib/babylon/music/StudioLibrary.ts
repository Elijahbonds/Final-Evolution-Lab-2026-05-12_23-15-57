// StudioLibrary v3 — MUSIC-SUITE P3 (2026-09-25): "Keep my work". The audio leaves localStorage.
//
// WHAT WAS WRONG (measured in P1, BASELINE.md §2e). Every publish stored its 2-bar stereo WAV INSIDE the library's
// localStorage JSON as a base64 data URL: 1,509,454 characters at 92 BPM, in an origin store of about 5 million. The
// 4th publish threw QuotaExceededError — `writeAll` had no try/catch and StudioMode's publishTrack was try/finally with
// no catch, so the error escaped as an unhandled rejection and the player saw NOTHING (frame music-publish-fail.png:
// the title still in the field, no toast, only Next's dev badge). There was no delete, so a full library stayed full,
// and `writeAll` kept "the newest 40" by silently slicing off the oldest songs.
//
// WHAT IT IS NOW.
//   · AUDIO lives in the device's file store (IndexedDB through the Academy's blob store — `LibraryBlobStore` below,
//     injected so a test can hand it a fake with a quota). One key per song: `library/<id>`.
//   · The INDEX stays in localStorage and stays SYNCHRONOUS: title, author, kit, tempo, swing, the pattern (a few KB —
//     REMIX needs it without a wait), plays/saves, links, and where the audio lives. DunkMode reads `get(id)` and
//     `list()` synchronously at DunkMode.ts:1067 and :4232 (it is held by hoops motion; it is not edited here), so
//     those two keep their exact shape.
//   · THE WALK-OUT KEEPS A SYNCHRONOUS SOURCE. DunkMode resolves the walk-out at the TOP of its async `load()`, before
//     its first await (DunkMode.ts:1066-1067: `resolveWalkOut(walkOut, StudioLibrary.get(walkOut.songId))`), and
//     `resolveWalkOut` returns null when `mixdownDataUrl` is empty (WalkOutCue.ts:73); `startWalkOut` then builds
//     `new Audio(walkCue.src)` from that string (DunkMode.ts:806). An IndexedDB read cannot land inside that tick, so
//     an async lookup at cue time would silently resolve every walk-out to null. The one song set as the walk-out
//     therefore keeps its mixdown in two dedicated localStorage keys (`fel_studio_walkout_src_v1` names it,
//     `fel_studio_walkout_audio_v1` holds the raw data URL), and `get(id)` fills `mixdownDataUrl` from them. One
//     song's audio (~1.5 MB) fits; four never did.
//   · EVERY WRITE IS CAUGHT and every failure comes back as a line the room shows ('Your library is full — delete a
//     song to publish'). Nothing is sliced off: a full library refuses the new song and says so.
//   · DELETE exists (the LIBRARY tab's LibraryDelete button asks first). Deleting the walk-out's song clears the
//     walk-out — WalkOutCue's rule that a card must not print a title nobody can hear.
//   · MIGRATION. The old key `fel_studio_tracks_v1` is read on the first read and every song in it keeps playing from
//     it while its audio is copied into the store; the old key is removed only after every copy landed AND the index
//     was written, and never when the store is the in-memory fallback (private mode), which would lose them on reload.
//
// SYNC SEAMs for the real backend are unchanged in meaning: POST/GET /api/studio/tracks, …/play, /api/studio/library.

import type { SequencerState } from './AudioEngine';
import type { KitId } from './SynthKit';
import type { StreamingLink } from './StreamingBridge';
import { WALKOUT_KEY, makeWalkOut, parseWalkOut, type WalkOut } from './WalkOut';
import { readKey, type SongKey } from './scales';

// ── shapes ───────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Where a song's rendered mixdown lives.
 *   'device' — in the device's file store (survives reload);
 *   'visit'  — the store was the in-memory fallback when it was published (private mode): gone after a reload;
 *   'none'   — nothing was ever rendered, or the old record's audio was unreadable.
 */
export type AudioHome = 'device' | 'visit' | 'none';

/** One row of the synchronous index (localStorage). No audio in here, ever. */
export interface TrackIndexEntry {
  id: string;
  title: string;
  authorId: string;
  authorName: string;
  kit: KitId;
  bpm: number;
  swing: number;
  polished: boolean;
  /** The full pattern — enough to REPLAY and to REMIX, synchronously. */
  sequencer: SequencerState;
  remixOf: { id: string; title: string; authorName: string } | null;
  /** The creator's own authorized Spotify/Apple versions of this song — played via the OFFICIAL embed players. */
  streamingLinks: StreamingLink[];
  createdAt: number;
  plays: number;
  saves: number;
  /** The file-store key of the mixdown (`library/<id>`), or null when there is none. */
  audioKey: string | null;
  audio: AudioHome;
  /** Size of the stored WAV. 0 when unknown or none. */
  audioBytes: number;
  /**
   * MUSIC-SUITE P4 (2026-09-25), grid-ui: the song's key (StudioProject.key) — the card shows it ('Am') and a remix opens
   * in it. Absent on songs published before P4 (their key was never known; the card says nothing rather than guess).
   */
  key?: SongKey;
}

/** What `list()` / `get()` hand out: the index row plus the two derived fields. */
export interface TrackRecord extends TrackIndexEntry {
  /**
   * A SYNCHRONOUS playable source, or '' when the audio has to be fetched with `audioSource(id)`.
   * MUSIC-SUITE P3: filled only for the walk-out's song (its dedicated key), a song still in the pre-P3 key, or a song
   * whose audio is still being copied into the store. Everything else plays through `audioSource`.
   */
  mixdownDataUrl: string;
  /** The walk-out record (WalkOut.ts, `fel-walkout`) points at this song. Derived on read, never stored twice. */
  isWalkOut: boolean;
}

/** What a publish carries in. The audio comes separately, as the rendered Blob. */
export type PublishDraft = Pick<TrackIndexEntry,
  'title' | 'authorId' | 'authorName' | 'kit' | 'bpm' | 'swing' | 'polished' | 'sequencer' | 'remixOf'>
  & { streamingLinks?: StreamingLink[]; key?: SongKey };

export type LibraryFailure = 'full' | 'device-full' | 'unavailable' | 'newer' | 'missing' | 'no-audio' | 'storage';

export type PublishResult =
  | { ok: true; rec: TrackRecord; /** said to the player when not null (e.g. kept for this visit only) */ line: string | null }
  | { ok: false; reason: LibraryFailure; line: string };

export type RemoveResult =
  | { ok: true; line: string; walkOutCleared: boolean }
  | { ok: false; reason: LibraryFailure; line: string };

export type AudioSourceResult = { ok: true; src: string } | { ok: false; reason: LibraryFailure; line: string };

export type WalkOutResult = { ok: true; walkOut: WalkOut; line: string } | { ok: false; reason: LibraryFailure; line: string };

/** What `ready()` reports once the first-read work (migration, walk-out repair, leftover deletes) is done. */
export interface LibraryReport {
  /** Songs whose audio moved from the pre-P3 localStorage key into the store this time. */
  migrated: number;
  /** False when there is no store or it is the in-memory fallback: nothing published now outlives the page. */
  persistent: boolean;
  /** Lines the room should show — empty when everything is fine. */
  lines: string[];
}

/** The blob store's contract (lib/babylon/music/studioStore.ts). Async; keys are plain strings. */
export interface LibraryBlobStore {
  get(key: string): Promise<Blob | null>;
  put(key: string, blob: Blob): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
  /**
   * False when the store fell back to memory (IndexedDB unavailable, e.g. private mode): what it holds is gone on
   * reload. Absent = assumed persistent. Read through `storeIsPersistent`, which accepts a flag or a (sync/async) fn.
   */
  persistent?: boolean | (() => boolean | Promise<boolean>);
}

/** The slice of `Storage` this needs — so a test can hand in a FakeStorage with a quota. */
export interface LibraryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

// ── keys, limits, lines ──────────────────────────────────────────────────────────────────────────────────────────

/** Pre-P3: every record WITH its data URL. Read for migration only; removed once its audio is safely in the store. */
export const KEY_LEGACY_TRACKS = 'fel_studio_tracks_v1';
/** The synchronous index. */
export const KEY_INDEX = 'fel_studio_library_v2';
export const KEY_SAVED = 'fel_studio_saved_v1';
/** Which song the walk-out audio below belongs to: { v, id, chars, at }. Written AFTER the audio, read first. */
export const KEY_WALKOUT_SRC = 'fel_studio_walkout_src_v1';
/** The walk-out song's mixdown as a raw data URL (no JSON wrapper, so a read is one getItem, not a 1.5 MB parse). */
export const KEY_WALKOUT_AUDIO = 'fel_studio_walkout_audio_v1';
/** Store keys whose delete failed; retried by `ready()`. */
export const KEY_ORPHANS = 'fel_studio_library_orphans_v1';
/** An index that could not be parsed is kept here rather than overwritten. */
export const KEY_INDEX_UNREADABLE = 'fel_studio_library_v2_unreadable';

export const INDEX_VERSION = 2;
/** The room renders two bars for a publish (StudioMode publishTrack → renderMixdown(2)). */
export const MIXDOWN_BARS = 2;
/**
 * Songs the index will hold. The old cap (40) was silent — `slice(0, 40)` dropped the oldest song with no word; this
 * one refuses the new song and says so. Measured on /dev/music (p3/library/library-p3.json): 22 rows + the room's other
 * keys = 34,158 chars, ~1.5 K per row at the first tier's 4 rows; assumption: ≤ 2.5 K with all 8 rows, so 200 ≈ 500 K.
 */
export const LIBRARY_MAX = 200;

export const LIBRARY_FULL_LINE = 'Your library is full — delete a song to publish';
export const DEVICE_FULL_LINE = "This device's storage is full — delete a song to publish";
export const NO_STORE_LINE = 'This browser is not letting FEL keep files (private mode?) — nothing was published';
export const VISIT_ONLY_LINE = 'Published for this visit only — this browser is not keeping files (private mode?)';
export const NEWER_LIBRARY_LINE = 'Your library was saved by a newer FEL — reload the page before publishing';
export const NO_AUDIO_LINE = "This song's audio is not on this device — REMIX it to render it again";
export const VISIT_AUDIO_GONE_LINE = "This song's audio was kept for one visit only — REMIX it to render it again";
export const MISSING_LINE = 'That song is not in the library any more';
export const WALKOUT_NO_ROOM_LINE = 'No room on this device to keep your walk-out ready (it needs about 1.5 MB) — nothing was changed';
export const WALKOUT_LOST_ROOM_LINE = 'No room on this device to keep your walk-out ready (it needs about 1.5 MB) — set it again from the LIBRARY';

const KITS = ['street', 'neon', 'dust'] as const satisfies readonly KitId[];
// compile-time: every KitId is listed (a new kit fails this line until it is added to KITS)
const _everyKit: Record<KitId, (typeof KITS)[number]> = { street: 'street', neon: 'neon', dust: 'dust' };
void _everyKit;

/** True for every browser's spelling of "the storage is full". */
export function isQuotaError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const x = e as { name?: unknown; code?: unknown; message?: unknown };
  return x.name === 'QuotaExceededError' || x.name === 'NS_ERROR_DOM_QUOTA_REACHED'
    || x.code === 22 || x.code === 1014 || /quota/i.test(String(x.message ?? ''));
}

function errName(e: unknown): string {
  if (e && typeof e === 'object' && 'name' in e && typeof (e as { name: unknown }).name === 'string') return (e as { name: string }).name;
  return 'error';
}

const NEWER = 'NewerIndex';
const isNewer = (e: unknown): boolean => errName(e) === NEWER;

/** The line a failed save shows: quota gets the spec'd sentence, anything else names the error. */
export function saveFailureLine(e: unknown, where: 'store' | 'index'): { reason: LibraryFailure; line: string } {
  if (isNewer(e)) return { reason: 'newer', line: NEWER_LIBRARY_LINE };
  if (isQuotaError(e)) return where === 'store' ? { reason: 'full', line: LIBRARY_FULL_LINE } : { reason: 'device-full', line: DEVICE_FULL_LINE };
  return { reason: 'storage', line: `Could not save on this device (${errName(e)}) — nothing was published` };
}

/** What the LIBRARY tab asks before a delete. Pure, so the wording is tested rather than eyeballed. */
export function deleteConfirmText(t: Pick<TrackRecord, 'title' | 'isWalkOut'>): string {
  return `Delete "${t.title}"?${t.isWalkOut ? ' It is your walk-out — the Dunk Contest goes quiet.' : ''} This cannot be undone.`;
}

export async function storeIsPersistent(store: LibraryBlobStore): Promise<boolean> {
  const p = store.persistent;
  if (p === undefined) return true;
  if (typeof p === 'boolean') return p;
  try { return !!(await p()); } catch { return false; }
}

// ── data URL ⇄ Blob (no FileReader, so node tests and the migration share one path) ────────────────────────────────

/** Blob → `data:<type>;base64,…`, the same string FileReader.readAsDataURL makes for a typed blob. */
export async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(bin)}`;
}

/** `data:` URL → Blob, or null when it is not one (a corrupt pre-P3 record). */
export function dataUrlToBlob(url: string): Blob | null {
  if (typeof url !== 'string' || !url.startsWith('data:')) return null;
  const comma = url.indexOf(',');
  if (comma < 0) return null;
  const head = url.slice(5, comma);
  const body = url.slice(comma + 1);
  const isB64 = /;base64$/i.test(head);
  const type = (isB64 ? head.slice(0, -7) : head).split(';')[0] || 'application/octet-stream';
  try {
    if (!isB64) return new Blob([decodeURIComponent(body)], { type });
    const bin = atob(body);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return new Blob([out], { type });
  } catch { return null; }
}

// ── normalising stored rows (a corrupt row never crashes the room) ─────────────────────────────────────────────────

const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v: unknown, d: string): string => (typeof v === 'string' ? v : d);

export function audioKeyFor(id: string): string { return `library/${id}`; }

/**
 * One stored row (a v2 index row or a pre-P3 record) → an index entry, or null when it has no id. Unknown kits become
 * STREET — StudioMode prints KIT_META[t.kit].label, and an unknown kit there was a render crash, not a label.
 * `legacyDataUrl` is the pre-P3 record's inline audio, '' when it has none.
 */
export function normalizeEntry(raw: unknown): { entry: TrackIndexEntry; legacyDataUrl: string } | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || !r.id) return null;
  const legacyDataUrl = typeof r.mixdownDataUrl === 'string' ? r.mixdownDataUrl : '';
  const bpm = num(r.bpm, 92);
  const swing = num(r.swing, 0);
  const seq = r.sequencer as Partial<SequencerState> | undefined;
  const sequencer: SequencerState = seq && typeof seq === 'object' && Array.isArray(seq.tracks)
    ? { bpm: num(seq.bpm, bpm), steps: num(seq.steps, 16), tracks: seq.tracks, swing: num(seq.swing, swing) }
    : { bpm, steps: 16, tracks: [], swing };
  const rem = r.remixOf as TrackIndexEntry['remixOf'] | undefined;
  const audioKey = typeof r.audioKey === 'string' && r.audioKey ? r.audioKey : legacyDataUrl ? audioKeyFor(r.id) : null;
  const declared = r.audio === 'device' || r.audio === 'visit' || r.audio === 'none' ? r.audio : null;
  const audio: AudioHome = !audioKey ? 'none' : declared ?? 'device';
  return {
    legacyDataUrl,
    entry: {
      id: r.id,
      title: str(r.title, '').trim() || 'Untitled',
      authorId: str(r.authorId, 'me'),
      authorName: str(r.authorName, 'You'),
      kit: (KITS as readonly string[]).includes(r.kit as string) ? (r.kit as KitId) : 'street',
      bpm, swing,
      polished: r.polished === true,
      sequencer,
      remixOf: rem && typeof rem === 'object' && typeof rem.id === 'string'
        ? { id: rem.id, title: str(rem.title, 'Untitled'), authorName: str(rem.authorName, '') } : null,
      streamingLinks: Array.isArray(r.streamingLinks) ? (r.streamingLinks as StreamingLink[]) : [],
      createdAt: num(r.createdAt, 0),
      plays: Math.max(0, Math.floor(num(r.plays, 0))),
      saves: Math.max(0, Math.floor(num(r.saves, 0))),
      audioKey: audio === 'none' ? null : audioKey,
      audio,
      audioBytes: Math.max(0, Math.floor(num(r.audioBytes, 0))),
      ...(readKey(r.key) ? { key: readKey(r.key)! } : {}),   // MUSIC-SUITE P4: only a real key is kept
    },
  };
}

// ── the library ──────────────────────────────────────────────────────────────────────────────────────────────────

export interface StudioLibraryDeps {
  /** localStorage, or null where there is none (SSR, blocked). Called per operation, never cached. */
  storage: () => LibraryStorage | null;
  /** The blob store, or null where there is none. */
  store: () => LibraryBlobStore | null;
  /** Start the migration on the first read that finds the pre-P3 key (default true). */
  autoMigrate?: boolean;
  now?: () => number;
  random?: () => number;
  createObjectUrl?: (b: Blob) => string;
  revokeObjectUrl?: (u: string) => void;
}

interface IndexState { raw: string | null; entries: TrackIndexEntry[]; newer: boolean }
interface Legacy { entries: TrackIndexEntry[]; audio: Map<string, string> }
type Wrote = { ok: true } | { ok: false; error: unknown };

export function createStudioLibrary(deps: StudioLibraryDeps) {
  const now = deps.now ?? Date.now;
  const random = deps.random ?? Math.random;
  const mkUrl = deps.createObjectUrl ?? ((b: Blob) => URL.createObjectURL(b));
  const rmUrl = deps.revokeObjectUrl ?? ((u: string) => { try { URL.revokeObjectURL(u); } catch { /* not a blob URL */ } });

  let indexCache: IndexState | null = null;
  /** undefined = not read yet this page; null = there is no pre-P3 key. Parsed ONCE: it can be ~4.5 MB. */
  let legacy: Legacy | null | undefined;
  /** Songs whose audio the compat `publish` is still copying into the store — their data URL plays meanwhile. */
  const pendingAudio = new Map<string, string>();
  const objectUrls = new Map<string, string>();
  /** Deleted this page: a migration already in flight must not bring them back. */
  const deleted = new Set<string>();
  /** Lines from sync reads (an unreadable index, a background copy that failed) for `ready()` / `problems()`. */
  const problems: string[] = [];
  let walkCache: { at: number; id: string; dataUrl: string } | null = null;
  let migration: Promise<{ migrated: number; lines: string[] }> | null = null;
  let readyP: Promise<LibraryReport> | null = null;

  const note = (line: string): void => { if (!problems.includes(line)) problems.push(line); };

  function sget(key: string): string | null {
    const s = deps.storage();
    if (!s) return null;
    try { return s.getItem(key); } catch { return null; }
  }
  function sset(key: string, value: string): Wrote {
    const s = deps.storage();
    if (!s) return { ok: false, error: Object.assign(new Error('no storage'), { name: 'NoStorage' }) };
    try { s.setItem(key, value); return { ok: true }; } catch (error) { return { ok: false, error }; }
  }
  function sdel(key: string): void {
    const s = deps.storage();
    if (!s) return;
    try { s.removeItem(key); } catch { /* nothing to remove */ }
  }

  // ── the index ──

  function indexState(): IndexState {
    const raw = sget(KEY_INDEX);
    if (indexCache && indexCache.raw === raw) return indexCache;
    if (raw === null) { indexCache = { raw, entries: [], newer: false }; return indexCache; }
    try {
      const o = JSON.parse(raw) as { v?: unknown; tracks?: unknown };
      if (typeof o?.v === 'number' && o.v > INDEX_VERSION) {
        // A FUTURE index is refused rather than half-read, and never overwritten by this build.
        note(NEWER_LIBRARY_LINE);
        indexCache = { raw, entries: [], newer: true };
        return indexCache;
      }
      if (!Array.isArray(o?.tracks)) throw new Error('no tracks');
      const entries: TrackIndexEntry[] = [];
      let skipped = 0;
      for (const t of o.tracks) {
        const n = normalizeEntry(t);
        if (n) entries.push(n.entry); else skipped++;
      }
      if (skipped) note(`${skipped} library ${skipped === 1 ? 'entry' : 'entries'} could not be read and ${skipped === 1 ? 'was' : 'were'} skipped`);
      indexCache = { raw, entries, newer: false };
    } catch {
      // Unreadable: copied aside under its own key (never silently overwritten), then the list starts fresh.
      const kept = sset(KEY_INDEX_UNREADABLE, raw).ok;
      if (kept) sdel(KEY_INDEX);
      note(kept
        ? 'Your library list could not be read — it was kept aside and the list starts fresh (song audio is still on this device)'
        : 'Your library list could not be read — the list starts fresh');
      indexCache = { raw: kept ? null : raw, entries: [], newer: false };
    }
    return indexCache;
  }

  function writeIndex(entries: TrackIndexEntry[]): Wrote {
    if (indexState().newer) return { ok: false, error: Object.assign(new Error('newer index'), { name: NEWER }) };
    const raw = JSON.stringify({ v: INDEX_VERSION, tracks: entries });
    const w = sset(KEY_INDEX, raw);
    if (w.ok) indexCache = { raw, entries, newer: false };
    return w;
  }

  function readLegacy(): Legacy | null {
    if (legacy !== undefined) return legacy;
    const raw = sget(KEY_LEGACY_TRACKS);
    if (raw === null) { legacy = null; return legacy; }
    try {
      const arr = JSON.parse(raw) as unknown;
      if (!Array.isArray(arr)) throw new Error('not a list');
      const entries: TrackIndexEntry[] = [];
      const audio = new Map<string, string>();
      for (const t of arr) {
        const n = normalizeEntry(t);
        if (!n) continue;
        entries.push(n.entry);
        if (n.legacyDataUrl) audio.set(n.entry.id, n.legacyDataUrl);
      }
      legacy = { entries, audio };
    } catch {
      // Left exactly where it is: an old library FEL cannot read is still the player's, and a later build may.
      note('Your older library could not be read — it was left untouched');
      legacy = null;
    }
    return legacy;
  }

  /** The index plus any pre-P3 songs not yet in it, newest first, minus anything deleted this page. */
  function view(): TrackIndexEntry[] {
    const idx = indexState().entries;
    const lg = readLegacy();
    // "on first read": the first read that finds the old key starts moving it (fire-and-forget; ready() awaits it)
    if (lg && deps.autoMigrate !== false && !migration && deps.store()) void ready();
    const live = (e: TrackIndexEntry): boolean => !deleted.has(e.id);
    if (!lg) return idx.filter(live);
    const have = new Set(idx.map((e) => e.id));
    return [...idx, ...lg.entries.filter((e) => !have.has(e.id))].filter(live).sort((a, b) => b.createdAt - a.createdAt);
  }

  // ── the walk-out's synchronous source ──

  function walkPointer(): WalkOut | null { return parseWalkOut(sget(WALKOUT_KEY)); }

  function walkSrcMeta(): { id: string; chars: number; at: number } | null {
    const raw = sget(KEY_WALKOUT_SRC);
    if (!raw) return null;
    try {
      const o = JSON.parse(raw) as { v?: unknown; id?: unknown; chars?: unknown; at?: unknown };
      if (o.v !== 1 || typeof o.id !== 'string' || typeof o.chars !== 'number' || typeof o.at !== 'number') return null;
      return { id: o.id, chars: o.chars, at: o.at };
    } catch { return null; }
  }

  /** The walk-out song's data URL, when `id` is that song and its copy is whole. '' otherwise. */
  function walkAudioFor(id: string): string {
    const meta = walkSrcMeta();
    if (!meta || meta.id !== id) return '';
    if (walkCache && walkCache.id === id && walkCache.at === meta.at) return walkCache.dataUrl;
    const raw = sget(KEY_WALKOUT_AUDIO);
    // the length check catches a half-written pair (audio replaced, name not yet): play nothing, never the wrong song
    if (!raw || raw.length !== meta.chars) return '';
    walkCache = { at: meta.at, id, dataUrl: raw };
    return raw;
  }

  function writeWalkAudio(id: string, dataUrl: string): Wrote {
    const a = sset(KEY_WALKOUT_AUDIO, dataUrl);
    if (!a.ok) return a;
    const at = now();
    const m = sset(KEY_WALKOUT_SRC, JSON.stringify({ v: 1, id, chars: dataUrl.length, at }));
    if (!m.ok) return m;
    walkCache = { at, id, dataUrl };
    return { ok: true };
  }

  function dropWalkAudio(): void {
    sdel(KEY_WALKOUT_SRC);
    sdel(KEY_WALKOUT_AUDIO);
    walkCache = null;
  }

  /** Any data URL this page can hand out without a wait. */
  function syncSource(id: string): string {
    return walkAudioFor(id) || legacy?.audio.get(id) || pendingAudio.get(id) || '';
  }

  function toRecord(e: TrackIndexEntry, walkId: string | null): TrackRecord {
    return { ...e, streamingLinks: [...e.streamingLinks], mixdownDataUrl: syncSource(e.id), isWalkOut: walkId === e.id };
  }

  /** A data URL for the song from wherever it lives — sync sources first, then the store. '' when nowhere. */
  async function dataUrlOf(e: TrackIndexEntry): Promise<string> {
    const sync = syncSource(e.id);
    if (sync) return sync;
    const store = deps.store();
    if (!store || !e.audioKey) return '';
    try {
      const b = await store.get(e.audioKey);
      return b ? await blobToDataUrl(b) : '';
    } catch { return ''; }
  }

  function mutate(id: string, fn: (e: TrackIndexEntry) => void): boolean {
    const all = view().map((e) => ({ ...e }));
    const e = all.find((x) => x.id === id);
    if (!e) return false;
    fn(e);
    return writeIndex(all).ok;
  }

  function readIds(key: string): string[] {
    try {
      const v = JSON.parse(sget(key) ?? '[]') as unknown;
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
    } catch { return []; }
  }

  // ── migration (first read) ──

  async function migrate(): Promise<{ migrated: number; lines: string[] }> {
    const lines: string[] = [];
    const lg = readLegacy();
    if (!lg) return { migrated: 0, lines };
    const store = deps.store();
    // No store, or only the in-memory fallback: the old key stays these songs' home. Moving them into memory and
    // removing the key would lose every one of them on the next reload.
    if (!store || !(await storeIsPersistent(store))) return { migrated: 0, lines };

    // 1. every song's audio into the store (idempotent: a reload part-way just puts them again)
    let migrated = 0;
    let unreadable = 0;
    const moved = new Map<string, TrackIndexEntry>();
    for (const e of lg.entries) {
      if (deleted.has(e.id)) continue;
      const url = lg.audio.get(e.id);
      if (!url) { moved.set(e.id, e); continue; }
      const blob = dataUrlToBlob(url);
      if (!blob) { unreadable++; moved.set(e.id, { ...e, audio: 'none', audioKey: null }); continue; }
      const key = e.audioKey ?? audioKeyFor(e.id);
      try {
        await store.put(key, blob);
      } catch (err) {
        const why = isQuotaError(err) ? 'the device is full' : errName(err);
        lines.push(`Moving your library into this device's file store stopped (${why}) — your songs are still where they were, and FEL tries again next visit`);
        return { migrated: 0, lines };
      }
      moved.set(e.id, { ...e, audioKey: key, audio: 'device', audioBytes: blob.size });
      migrated++;
    }

    // 2. the walk-out's own copy, while the old key can still supply it
    const wp = walkPointer();
    const walkUrl = wp && !deleted.has(wp.songId) ? lg.audio.get(wp.songId) : undefined;
    let walkPending = false;
    if (wp && walkUrl && !walkAudioFor(wp.songId)) walkPending = !writeWalkAudio(wp.songId, walkUrl).ok;

    // 3. the index, computed NOW (a publish or a play count during step 1's awaits is already in it)
    const merged = (): TrackIndexEntry[] => {
      const idx = indexState().entries;
      const have = new Set(idx.map((e) => e.id));
      const out = idx.map((e) => {
        const m = moved.get(e.id);
        return m ? { ...e, audioKey: m.audioKey, audio: m.audio, audioBytes: m.audioBytes || e.audioBytes } : e;
      });
      for (const m of moved.values()) if (!have.has(m.id)) out.push(m);
      return out.filter((e) => !deleted.has(e.id)).sort((a, b) => b.createdAt - a.createdAt);
    };
    let w = writeIndex(merged());
    if (!w.ok && isQuotaError(w.error)) {
      // The old key can hold ~4.5 MB and leave no room for the index. Its audio is safely in the store now, so the old
      // key is rewritten WITHOUT it (a smaller value always fits) and the index tried again. A reload between the two
      // finds the stripped rows, whose audioKey says where the audio went.
      sset(KEY_LEGACY_TRACKS, JSON.stringify(lg.entries.filter((e) => !deleted.has(e.id)).map((e) => moved.get(e.id) ?? e)));
      w = writeIndex(merged());
    }
    if (!w.ok) {
      lines.push(`Your library list could not be written (${isQuotaError(w.error) ? 'the device is full' : errName(w.error)}) — your songs are still where they were, and FEL tries again next visit`);
      return { migrated: 0, lines };
    }

    // 4. only now is the old key redundant
    sdel(KEY_LEGACY_TRACKS);
    // a song deleted while its copy was in flight: its copy goes too (remove() may have run before the put landed)
    for (const m of moved.values()) if (deleted.has(m.id) && m.audioKey) { try { await store.delete(m.audioKey); } catch { /* the orphan list is for remove()'s own failures */ } }

    // 5. the walk-out, if there was no room for its copy while the old key was still there
    if (walkPending && wp && walkUrl && !writeWalkAudio(wp.songId, walkUrl).ok) lines.push(WALKOUT_LOST_ROOM_LINE);

    legacy = null;   // the data URLs leave memory; the walk-out's copy lives in its own key
    if (unreadable) {
      lines.push(`${unreadable} older ${unreadable === 1 ? 'song' : 'songs'} had audio FEL could not read — the pattern is kept; REMIX renders it again`);
    }
    return { migrated, lines };
  }

  /** The walk-out pointer and its synchronous copy agree, or are made to (another writer may set only the pointer). */
  async function healWalkOut(lines: string[]): Promise<void> {
    const wp = walkPointer();
    if (!wp) { if (walkSrcMeta()) dropWalkAudio(); return; }       // no walk-out: give the 1.5 MB back
    if (walkAudioFor(wp.songId)) return;
    // still in the pre-P3 key (a move that has not finished): that key IS its synchronous source, on every page, and a
    // 1.5 MB copy beside ~4.5 MB of old library would only fail and say so for nothing. The move makes the copy.
    if (legacy?.audio.has(wp.songId)) return;
    const e = view().find((x) => x.id === wp.songId);
    if (!e) return;                                                  // resolveWalkOut's honest null: the song is gone
    const url = await dataUrlOf(e);
    if (!url) return;
    if (!writeWalkAudio(e.id, url).ok) lines.push(WALKOUT_LOST_ROOM_LINE);
  }

  async function retryOrphans(): Promise<void> {
    const orphans = readIds(KEY_ORPHANS);
    const store = deps.store();
    if (!orphans.length || !store) return;
    const left: string[] = [];
    for (const k of orphans) { try { await store.delete(k); } catch { left.push(k); } }
    if (left.length) sset(KEY_ORPHANS, JSON.stringify(left)); else sdel(KEY_ORPHANS);
  }

  /** First-read work, awaited by the room on mount: migration, walk-out repair, leftover deletes. Memoised per page. */
  function ready(): Promise<LibraryReport> {
    if (readyP) return readyP;
    readyP = (async () => {
      migration ??= migrate();
      const m = await migration;
      const lines = [...m.lines];
      await healWalkOut(lines);
      await retryOrphans();
      const store = deps.store();
      const persistent = store ? await storeIsPersistent(store) : false;
      return { migrated: m.migrated, persistent, lines: [...problems.filter((p) => !lines.includes(p)), ...lines] };
    })();
    return readyP;
  }

  function newId(): string { return `trk_${now()}_${Math.floor(random() * 1e5)}`; }

  function entryFromDraft(d: PublishDraft, id: string, audio: AudioHome, audioBytes: number): TrackIndexEntry {
    return {
      id, title: d.title, authorId: d.authorId, authorName: d.authorName, kit: d.kit, bpm: d.bpm, swing: d.swing,
      polished: d.polished, sequencer: d.sequencer, remixOf: d.remixOf, streamingLinks: d.streamingLinks ?? [],
      createdAt: now(), plays: 0, saves: 0,
      audioKey: audio === 'none' ? null : audioKeyFor(id), audio, audioBytes,
      ...(readKey(d.key) ? { key: readKey(d.key)! } : {}),   // MUSIC-SUITE P4: the song's key
    };
  }

  const walkId = (): string | null => walkPointer()?.songId ?? null;

  const api = {
    /**
     * Publish a finished track: its rendered mixdown goes into the device's file store, its row into the index.
     * Never throws; a failure comes back as the line to show ('Your library is full — delete a song to publish').
     */
    async publishWithAudio(draft: PublishDraft, audio: Blob): Promise<PublishResult> {
      if (indexState().newer) return { ok: false, reason: 'newer', line: NEWER_LIBRARY_LINE };
      if (view().length >= LIBRARY_MAX) return { ok: false, reason: 'full', line: LIBRARY_FULL_LINE };
      const store = deps.store();
      if (!store) return { ok: false, reason: 'unavailable', line: NO_STORE_LINE };
      const id = newId();
      const key = audioKeyFor(id);
      try {
        await store.put(key, audio);
      } catch (e) {
        return { ok: false, ...saveFailureLine(e, 'store') };
      }
      const persistent = await storeIsPersistent(store);
      const entry = entryFromDraft(draft, id, persistent ? 'device' : 'visit', audio.size);
      const w = writeIndex([entry, ...view()]);           // view() AFTER the awaits: another write may have landed
      if (!w.ok) {
        try { await store.delete(key); } catch { sset(KEY_ORPHANS, JSON.stringify([...readIds(KEY_ORPHANS), key])); }
        return { ok: false, ...saveFailureLine(w.error, 'index') };
      }
      // SYNC SEAM: POST /api/studio/tracks { entry } + the audio to object storage — the server assigns the id.
      return { ok: true, rec: toRecord(entry, walkId()), line: persistent ? null : VISIT_ONLY_LINE };
    },

    /**
     * COMPAT — the pre-P3 synchronous publish, kept for the P1 baseline sim (scripts/music/baseline-sim.ts:715), which
     * counts publishes until one throws. The room uses `publishWithAudio`. The row is written synchronously (it throws
     * on failure, as before); the data URL plays from memory while its audio is copied into the store in the
     * background, and a failed copy is reported through `problems()`.
     */
    publish(rec: PublishDraft & { mixdownDataUrl: string }): TrackRecord {
      if (view().length >= LIBRARY_MAX) throw Object.assign(new Error(LIBRARY_FULL_LINE), { name: 'LibraryFull' });
      const id = newId();
      const store = deps.store();
      const blob = rec.mixdownDataUrl ? dataUrlToBlob(rec.mixdownDataUrl) : null;
      const entry = entryFromDraft(rec, id, blob ? (store ? 'device' : 'visit') : 'none', blob?.size ?? 0);
      const w = writeIndex([entry, ...view()]);
      if (!w.ok) throw w.error;
      if (blob) {
        pendingAudio.set(id, rec.mixdownDataUrl);
        if (store) {
          void store.put(audioKeyFor(id), blob).then(
            async () => {
              pendingAudio.delete(id);
              // 'device' was written before the store answered; the in-memory fallback makes it a one-visit song
              if (!(await storeIsPersistent(store))) mutate(id, (e) => { e.audio = 'visit'; });
            },
            (e) => note(`"${rec.title}" is playable this visit only — its audio could not be saved (${isQuotaError(e) ? 'the device is full' : errName(e)})`),
          );
        }
      }
      return toRecord(entry, walkId());
    },

    /** Every track on this device, newest first. Synchronous (DunkMode.ts:4232 counts it). */
    list(): TrackRecord[] {
      // SYNC SEAM: GET /api/studio/tracks?limit=… replaces the local read.
      const w = walkId();
      return view().map((e) => toRecord(e, w));
    },

    /** All of one creator's songs — the "see everything they've made" view. */
    byAuthor(authorId: string): TrackRecord[] {
      return api.list().filter((t) => t.authorId === authorId);
    },

    /**
     * One track, synchronously. DunkMode.ts:1067 passes this straight to resolveWalkOut, so for the walk-out's song
     * `mixdownDataUrl` is filled from its dedicated key — that is the whole reason the key exists.
     */
    get(id: string): TrackRecord | null {
      const e = view().find((t) => t.id === id);
      return e ? toRecord(e, walkId()) : null;
    },

    /** A playable src for the LIBRARY's ▶ PLAY: a sync data URL when there is one, else an object URL of the stored WAV. */
    async audioSource(id: string): Promise<AudioSourceResult> {
      const e = view().find((t) => t.id === id);
      if (!e) return { ok: false, reason: 'missing', line: MISSING_LINE };
      const sync = syncSource(id);
      if (sync) return { ok: true, src: sync };
      const cached = objectUrls.get(id);
      if (cached) return { ok: true, src: cached };
      const store = deps.store();
      if (e.audio === 'none' || !e.audioKey || !store) return { ok: false, reason: 'no-audio', line: NO_AUDIO_LINE };
      let blob: Blob | null = null;
      try { blob = await store.get(e.audioKey); } catch { blob = null; }
      if (!blob) return { ok: false, reason: 'no-audio', line: e.audio === 'visit' ? VISIT_AUDIO_GONE_LINE : NO_AUDIO_LINE };
      const url = mkUrl(blob);
      objectUrls.set(id, url);
      return { ok: true, src: url };
    },

    /** Count a play (when audio actually starts). An engagement counter: a failed write loses no work, so no line. */
    countPlay(id: string): boolean {
      // SYNC SEAM: POST /api/studio/tracks/:id/play
      return mutate(id, (e) => { e.plays++; });
    },

    /** Save someone's track to MY library. False when the write failed (the room says so). */
    saveToMyLibrary(id: string): boolean {
      const saved = readIds(KEY_SAVED);
      if (saved.includes(id)) return true;
      if (!sset(KEY_SAVED, JSON.stringify([...saved, id])).ok) return false;
      mutate(id, (e) => { e.saves++; });
      // SYNC SEAM: POST /api/studio/library { trackId } per user.
      return true;
    },

    mySavedIds(): string[] { return readIds(KEY_SAVED); },
    mySaved(): TrackRecord[] {
      const ids = new Set(readIds(KEY_SAVED));
      return api.list().filter((t) => ids.has(t.id));
    },

    /**
     * Delete a song: its row, its audio, its place in MY library, and — when it was the walk-out — the walk-out
     * (WalkOutCue: a card must not print a title nobody can hear). The LIBRARY tab asks first (deleteConfirmText).
     */
    async remove(id: string): Promise<RemoveResult> {
      const all = view();
      const e = all.find((x) => x.id === id);
      if (!e) return { ok: false, reason: 'missing', line: MISSING_LINE };
      const w = writeIndex(all.filter((x) => x.id !== id));
      if (!w.ok) {
        if (isNewer(w.error)) return { ok: false, reason: 'newer', line: NEWER_LIBRARY_LINE };
        return { ok: false, reason: 'storage', line: `Could not delete "${e.title}" (${errName(w.error)}) — it is still in the library` };
      }
      deleted.add(id);
      // a pre-P3 song still in the old key: the old key is rewritten without it, or the next visit's migration brings it back
      const lg = readLegacy();
      if (lg && lg.entries.some((x) => x.id === id)) {
        try {
          const arr = JSON.parse(sget(KEY_LEGACY_TRACKS) ?? '[]') as Array<{ id?: unknown }>;
          if (Array.isArray(arr)) sset(KEY_LEGACY_TRACKS, JSON.stringify(arr.filter((t) => t?.id !== id)));
        } catch { /* unreadable old key: `deleted` covers this page, and it could not be read to begin with */ }
        lg.entries = lg.entries.filter((x) => x.id !== id);
        lg.audio.delete(id);
      }
      pendingAudio.delete(id);
      const saved = readIds(KEY_SAVED);
      if (saved.includes(id)) sset(KEY_SAVED, JSON.stringify(saved.filter((x) => x !== id)));
      const u = objectUrls.get(id);
      if (u) { rmUrl(u); objectUrls.delete(id); }
      let walkOutCleared = false;
      if (walkId() === id) { sdel(WALKOUT_KEY); walkOutCleared = true; }
      if (walkSrcMeta()?.id === id) dropWalkAudio();
      let tail = '';
      const store = deps.store();
      if (e.audioKey && store) {
        try { await store.delete(e.audioKey); } catch {
          sset(KEY_ORPHANS, JSON.stringify([...readIds(KEY_ORPHANS).filter((k) => k !== e.audioKey), e.audioKey]));
          tail = ' (its audio is cleared from this device next visit)';
        }
      }
      return { ok: true, walkOutCleared, line: `Deleted "${e.title}"${walkOutCleared ? ' — you have no walk-out now' : ''}${tail}` };
    },

    /** Attach (or replace) an authorized streaming link on my own track. False when the write failed. */
    attachStreamingLink(id: string, link: StreamingLink): boolean {
      // SYNC SEAM: PATCH /api/studio/tracks/:id { streamingLinks }
      return mutate(id, (t) => { t.streamingLinks = [...(t.streamingLinks ?? []).filter((l) => l.provider !== link.provider), link]; });
    },

    /**
     * Start a remix: returns the state to load into the editor + attribution. MUSIC-SUITE P3 FIX PASS (2026-09-25): and
     * `polished` — a remix of a mastered song opened with MASTER off (the project's mixer defaulted), so it did not sound
     * like its source and nothing said why.
     */
    beginRemix(id: string): { sequencer: SequencerState; kit: KitId; bpm: number; swing: number; polished: boolean; remixOf: TrackRecord['remixOf']; key: SongKey | null } | null {
      const t = api.get(id);
      if (!t) return null;
      return {
        sequencer: JSON.parse(JSON.stringify(t.sequencer)) as SequencerState,
        kit: t.kit, bpm: t.bpm, swing: t.swing, polished: t.polished === true,
        remixOf: { id: t.id, title: t.title, authorName: t.authorName },
        key: t.key ?? null,   // MUSIC-SUITE P4: a remix opens in the song's key (null: published before P4 — the default key)
      };
    },

    /**
     * Make a song the walk-out. Its mixdown is copied into the walk-out's own localStorage keys FIRST (DunkMode reads
     * them synchronously through `get`), then the WalkOut record is written. Re-choosing the same song keeps its plays.
     */
    async setWalkOut(id: string, opts: { bars?: number } = {}): Promise<WalkOutResult> {
      const e = view().find((x) => x.id === id);
      if (!e) return { ok: false, reason: 'missing', line: MISSING_LINE };
      const url = await dataUrlOf(e);
      if (!url) return { ok: false, reason: 'no-audio', line: e.audio === 'visit' ? VISIT_AUDIO_GONE_LINE : NO_AUDIO_LINE };
      let wo: WalkOut;
      try {
        wo = makeWalkOut({ songId: e.id, title: e.title, bpm: e.bpm, bars: opts.bars ?? MIXDOWN_BARS, now: now() });
      } catch (err) {
        return { ok: false, reason: 'storage', line: (err as Error).message };
      }
      const prev = walkPointer();
      if (prev?.songId === id) wo = { ...wo, plays: prev.plays };
      const a = writeWalkAudio(id, url);
      if (!a.ok) {
        return isQuotaError(a.error)
          ? { ok: false, reason: 'device-full', line: WALKOUT_NO_ROOM_LINE }
          : { ok: false, reason: 'storage', line: `Could not set the walk-out (${errName(a.error)}) — nothing was changed` };
      }
      const p = sset(WALKOUT_KEY, JSON.stringify(wo));
      if (!p.ok) {
        dropWalkAudio();
        return { ok: false, reason: 'storage', line: `Could not set the walk-out (${errName(p.error)}) — choose it again` };
      }
      return { ok: true, walkOut: wo, line: `"${e.title}" is your walk-out` };
    },

    /** No walk-out: the record and its audio copy both go (1.5 MB back). */
    clearWalkOut(): void {
      sdel(WALKOUT_KEY);
      dropWalkAudio();
    },

    ready,

    /** Lines from reads so far (an unreadable index, a background copy that failed). */
    problems(): string[] { return [...problems]; },
  };
  return api;
}

export type StudioLibraryApi = ReturnType<typeof createStudioLibrary>;

// ── the Academy's store, as the library sees it ─────────────────────────────────────────────────────────────────

/**
 * The slice of studioStore.ts's StudioStore the library uses. Structural, so a test can run the library on the REAL
 * StudioStore over its MemoryKv without IndexedDB.
 */
export interface AcademyAudioStore {
  readonly persistent: boolean;
  getAudio(key: string): Promise<{ data: ArrayBuffer; mime: string } | null>;
  putAudio(key: string, data: ArrayBuffer, mime: string): Promise<void>;
  readonly kv: { delete(table: 'audio', key: string): Promise<void>; keys(table: 'audio'): Promise<string[]> };
}

/**
 * The library on the Academy's one IndexedDB database ('fel-studio', table `audio`) — the same store that keeps takes
 * and chops (studioStore.ts), opened once per page, falling back to this tab's memory where IndexedDB is refused (and
 * then `persistent` is false, which the library turns into VISIT_ONLY_LINE and a migration that waits).
 *   · Blobs go in as ArrayBuffer + mime: studioStore's own rule ("Safari has refused Blobs in IndexedDB before").
 *   · Keys are `library/<id>`. studioStore.sweepAudio deletes only keys it minted (`aud_<time><rand>`, audioKeyTime),
 *     so the sweep never takes a published song's audio.
 *   · Delete goes through `kv.delete('audio', key)`: StudioStore has no single-audio delete (its deleteProject frees a
 *     project's audio). Assumption: fine outside its write queue, because nothing else writes `library/` keys.
 */
export function libraryStoreOver(open: () => Promise<AcademyAudioStore>): LibraryBlobStore {
  return {
    async get(key) {
      const rec = await (await open()).getAudio(key);
      return rec ? new Blob([rec.data], { type: rec.mime || 'audio/wav' }) : null;
    },
    async put(key, blob) { await (await open()).putAudio(key, await blob.arrayBuffer(), blob.type || 'audio/wav'); },
    async delete(key) { await (await open()).kv.delete('audio', key); },
    async list(prefix = '') { return (await (await open()).kv.keys('audio')).filter((k) => k.startsWith(prefix)); },
    persistent: async () => (await open()).persistent,
  };
}

// ── the app's instance ───────────────────────────────────────────────────────────────────────────────────────────

function browserStorage(): LibraryStorage | null {
  if (typeof window === 'undefined') return null;
  try { return window.localStorage ?? null; } catch { return null; }
}

// Imported on first use, not at module load: DunkMode imports this file for its synchronous get/list, and should not
// carry the Academy's project model (StudioProject.ts) in its chunk for a walk-out that reads localStorage only.
let academyStore: Promise<AcademyAudioStore> | null = null;
const defaultStore = libraryStoreOver(() => (academyStore ??= import('./studioStore').then((m) => m.openStudioStore())));

let libraryStore: LibraryBlobStore | null = null;
/** Replace the library's blob store (a probe's fake). null = back to the Academy's store. */
export function setLibraryStore(store: LibraryBlobStore | null): void { libraryStore = store; }

export const StudioLibrary = createStudioLibrary({
  storage: browserStorage,
  store: () => libraryStore ?? (typeof window === 'undefined' ? null : defaultStore),
  autoMigrate: true,
});
