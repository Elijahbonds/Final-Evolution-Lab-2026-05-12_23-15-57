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
//
// MUSIC-SUITE P4 (2026-09-25), "Pocket studio + melody" — v2 (PHASE-4 ENGINE CONTRACT (2) and (5)):
//   * A STEP HAS A NOTE AND A VELOCITY. A track keeps `pattern` (on/off — every existing reader counts it) and gains
//     `notes` (MIDI, the pitched rows: bass, lead, keys, flip_*) and `vels` (0..1, only once something sets one). The
//     contract's step, { on, note?, vel? }, is stepAt / stepsOf; an edit is withStep / withTrackStep, which LOCKS a note
//     row's note to the song's key (scales.ts lockNote). A v1 grid of booleans migrates on load: the bass and lead rows get
//     the note their kit always played (SynthKit VOICE_ROOTS — STREET A, NEON C, DUST G), so an old beat sounds the same.
//   * THE SONG HAS A KEY: { root, scale } (scales.ts; A natural minor when none was saved — the card's old 'Am', and the
//     key every kit's voices sit in). setProjectKey moves every note with the key (transposeNote).
//   * THE MIXER (P3 left `mixer.channels` as a placeholder of { solo?, room?, delay? }): per strip gain / pan / mute / solo
//     / sendA (room) / sendB (slap), full records, only for strips moved off their defaults, and a `master` fader. A P3
//     placeholder's room / delay migrate to sendA / sendB. mixerOf(p) is what AudioEngine.setMixer takes.
//
// MUSIC-SUITE P5 (2026-09-25), "The Flip, for real" — v3:
//   * FOUR BANKS. The FLIP tab held one source and its 16 chops. A bank (ProjectFlipBank) is that — a source, how it is
//     sliced, 16 chops — and there are four (A–D). Bank A is still the top-level fields of `flip` (the shape every P3/P4
//     reader and test knows); B, C and D are `flip.otherBanks`, written only once one of them holds something. A bank may
//     be sliced on the source's own cuts ('cuts' — the FEL pack's "FEL cuts" and its kits' file boundaries, flipPack.ts).
//   * CHOP KITS. A bank saved under a name in the project (`flip.kits`), loaded into any bank later.
//   * BAKED ROWS: WHAT YOU TUNE IS WHAT YOU SEQUENCE. A Flip row played the RAW slice at rate 1 (reversed when asked):
//     the pad's gate never reached the grid (P3/P4: "gate is pad only"), and its pitch reached it only as the steps' notes
//     (P4 padNote) — so REPLACE ROW with a new pitch kept the old notes and played the old pitch (p4/REPORT.md deferred:
//     "a Flip pad's own pitch is not applied"). A v3 row's chop is BAKED (chopEdit.bakeChop): pitch, gate, reverse and the
//     edge fades are in the buffer, so a step at FLIP_ROOT_MIDI plays exactly what the pad played, and a step's note is an
//     interval from the pad AS TUNED. A v2 record migrates so it sounds the same: each row's notes move down by its
//     pitch (none = every step at 60 − pitch, the raw chop), and its gate goes off (a v2 row played the full chop).
//   * A SECTION KEEPS ITS OWN CHOPS (P3 deferred: "a section snapshot keeps its Flip rows but not its own chop, so
//     re-sending a pad changes an older section's sound"): `section.chops` = the rows' chops when it was saved or updated.
//   * A ROW KNOWS WHICH PAD IT CAME FROM (`origin`, bank + pad): with four banks, pad 3 of bank B must not replace the row
//     pad 3 of bank A sent. Absent = bank A, the row's own number (every row before banks).
import type { TrackState } from './AudioEngine';
import { MAX_SONG_BARS, normalizeChain, songBars, type Section, type SongChain, type Take } from './Song';
import { PAD_COUNT, isAllowedSource, padsFromSlices, type Pad, type Slice, type SourceKind } from './Flip';
import { KIT_SLOTS, VOICE_ROOTS, isPitchedSlot, type KitId } from './SynthKit';
import { DEFAULT_KIT, isKitId } from './purchases';
import { pdAudioAllowed } from './pdShelf';
import {
  DEFAULT_KEY, FLIP_ROOT_MIDI, defaultRowNote, inScale, isNoteRow, isPitchedRow, lockNote, pitchClass, readKey, rowRange, sameKey, transposeNote,
  type SongKey,
} from './scales';
import { CHANNEL_GAIN_MAX, DEFAULT_CHANNEL, MASTER_FADER_MAX, TAKES_CHANNEL, type ChannelMix, type MixerState } from './mixGraph';

/**
 * Bump when the shape changes, and teach migrateProject the step from the old one. MUSIC-SUITE P4: 2 (notes, key, mixer,
 * takes). MUSIC-SUITE P5: 3 (banks, chop kits, baked rows, section chops, row origins) — an older FEL refuses a v3 record
 * instead of opening it and saving it back without banks B–D, the kits and the sections' chops, or playing a baked row's
 * notes on its raw chop.
 */
export const STUDIO_PROJECT_VERSION = 3;
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
export interface ProjectSection extends Section {
  swing: number;
  /**
   * MUSIC-SUITE P5: the chops this section's Flip rows played when it was saved or updated from the grid (absent = the
   * working rows' chops — every section before P5). Song mode plays them (StudioMode's section swap on the bar line).
   */
  chops?: ProjectFlipRow[];
}
/**
 * A recorded take: where it starts and how loud (Song.Take), and its audio.
 *
 * MUSIC-SUITE P4 (2026-09-25), the recording booth (takeCapture.ts, ui/RecordBooth.tsx): a take was {atBar, gain,
 * durationSec} and played ONCE at its absolute bar (a take armed on the 2nd pass sat past the song's end), with the gain
 * fixed at 0.9 and no trim, mute or choice between attempts. Now it is recorded over a REGION of a loop and keeps it:
 *   · `atBar` — its first bar INSIDE the loop (0-based; the booth stores bar % loop, never an absolute bar);
 *   · `bars` — the region's length (the bars it was recorded over); takes over the same atBar + bars are one best-of-N
 *     group (takeCapture.takeSlot);
 *   · `loopBars` — the loop it repeats on off song mode (the booth's LOOP); in song mode it follows the song;
 *   · `trimStart` / `trimEnd` — seconds gated off each end (the audio keeps its place on the grid); `muted`;
 *   · `pickedAt` — the group plays the take picked (or recorded) last (takeCapture.pickedTakeIds); the rest are kept.
 * A take from before P4 is read (readTakeRegion) with bars = its length in bars at the project's tempo, loopBars = the
 * next power of two that holds atBar + bars (it still starts where it did, then repeats), no trims, unmuted, and its list
 * order as its pick order. Filling these is a migration, not a repair: no issue line.
 */
export interface ProjectTake extends Take {
  audio: AudioRef;
  bars: number;
  loopBars: number;
  trimStart: number;
  trimEnd: number;
  muted: boolean;
  pickedAt: number;
}

/** MUSIC-SUITE P4: a take's region + booth fields from a stored record (or their pre-P4 defaults). Pure. */
export function readTakeRegion(v: Record<string, unknown>, base: Take & { audio: AudioRef }, bpm: number, order: number): ProjectTake {
  const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
  const barLen = (16 * 60) / (4 * Math.max(1, bpm));
  const lenBars = Math.max(1, Math.min(MAX_SONG_BARS, Math.ceil(base.durationSec / barLen - 1e-6)));
  const bars = fin(v.bars) ? Math.max(1, Math.min(MAX_SONG_BARS, Math.floor(v.bars))) : lenBars;
  let pow = 1; while (pow < base.atBar + bars && pow < MAX_SONG_BARS) pow *= 2;
  // a stored loop that does not hold the take's first bar would never play it: the pre-P4 loop instead
  const stored = fin(v.loopBars) ? Math.max(1, Math.min(MAX_SONG_BARS, Math.floor(v.loopBars))) : null;
  const loopBars = stored !== null && stored > base.atBar ? stored : pow;
  const dur = base.durationSec;
  return {
    ...base, bars, loopBars,
    trimStart: fin(v.trimStart) ? Math.max(0, Math.min(dur, v.trimStart)) : 0,
    trimEnd: fin(v.trimEnd) ? Math.max(0, Math.min(dur, v.trimEnd)) : 0,
    muted: v.muted === true,
    pickedAt: fin(v.pickedAt) && v.pickedAt >= 0 ? v.pickedAt : order,
  };
}

/**
 * A Flip source: FEL's own stem (a first-party /audio/ path) or the player's own recording (saved audio).
 * MUSIC-SUITE P3 FIX PASS (2026-09-25), owner decision #15 ("uploads with an 'I made or own this' tick — songs containing
 * uploads stay device-private until online review exists"): a YOUR FILE upload and a MIC TAKE were both kind 'own', told
 * apart only by an id prefix (own_ / mic_). `upload: true` marks an uploaded file explicitly, it rides into every row,
 * published chop and remix made from it (the source is copied whole), and studioEdit.publishedHasUpload reads it — the
 * key the sharing pass keeps a song private on.
 */
export interface ProjectFlipSource {
  id: string; label: string; kind: SourceKind; note: string; url?: string; audio?: AudioRef; upload?: true;
  /**
   * MUSIC-SUITE P5 FIX PASS (2026-09-25; P4 deferred "a chop's own key" here): the key the source is in, as FEL's pack
   * says it — a theme's or loop's key ('Eb major', 'D dorian') or a pitched one-shot's root ('C4'). Absent = not known (the
   * player's own sound, a kit). A chop's key is this moved by the pad's pitch (chopEdit.chopKeyText); the FLIP tab shows it.
   */
  key?: string;
}
/**
 * The FLIP tab: the loaded source, how it is sliced, and the sixteen chops (slice points + pitch / gate / reverse).
 * MUSIC-SUITE P3 FIX PASS: `rate` = the sample rate the slice points count in (the rate the source was decoded at). Slices
 * are sample indices, and decodeAudioData resamples to the AudioContext's rate, which follows the output device
 * (assumption: 48 kHz speakers, 44.1 kHz on some headsets) — a chop saved at one rate cut ~8.8 % late and long at the
 * other. FlipPad.chopBuffer rescales by it. Absent (saved before this field) = the reader's rate.
 */
export interface ProjectFlip extends ProjectFlipBank {
  /**
   * MUSIC-SUITE P5: banks B, C and D (index 0 = B), null = empty; trailing empties are dropped and an all-empty list is
   * omitted, so a project that never used them is the P4 shape (and autosave sees no edit). Use bankOf / withBank.
   */
  otherBanks?: (ProjectFlipBank | null)[];
  /** MUSIC-SUITE P5: chop kits — banks saved under a name (absent = none). */
  kits?: ChopKit[];
}
/**
 * MUSIC-SUITE P5: one bank — a source, how it is sliced, and its 16 chops (the FLIP tab's whole state before banks).
 * `rate` = the sample rate the slice points count in (P3 FIX PASS; the rate the source was decoded at). `slicing` 'cuts'
 * = the source's own cut points (the decoded source carries them: FEL pack items and kits — FlipPad DecodedSource.cuts).
 */
export interface ProjectFlipBank { source: ProjectFlipSource | null; slicing: FlipSlicing; gridN: number; chops: Pad[]; rate?: number }
export type FlipSlicing = 'transient' | 'grid' | 'cuts';
/** MUSIC-SUITE P5: a bank kept under a name in the project, loaded into any bank (a deep copy each way). */
export interface ChopKit { id: string; name: string; savedAt: number; bank: ProjectFlipBank }
/**
 * A pad sent to the groovebox: the grid row `flip_<pad>` and the exact chop it plays, with its own copy of the source —
 * reslicing the FLIP tab or loading another source later must not change what an already-written row sounds like.
 * MUSIC-SUITE P5: the row's chop is BAKED — pitch, gate and reverse are in the buffer the row plays (chopEdit.bakeChop),
 * so a step at FLIP_ROOT_MIDI is the pad as tuned. `pad` is the ROW's number (sampleId = flip_<pad>); `origin` = the bank
 * and pad it was sent from, when that is not bank A's pad of the same number.
 */
export interface ProjectFlipRow {
  sampleId: string; pad: number; label: string; source: ProjectFlipSource; slice: Slice; reverse: boolean; pitch: number; gate: boolean; rate?: number;
  origin?: { bank: number; pad: number };
}

/**
 * The desk. MUSIC-SUITE P4: `channels` holds a FULL strip (mixGraph ChannelMix) for every row (or TAKES_CHANNEL) moved off
 * its defaults — a strip put back to the defaults is removed, so an untouched desk is `{}` and autosave sees no edit;
 * `master` is the master fader (1 = unity); `polish` is MASTER (P2).
 */
export interface ProjectMixer { polish: boolean; master: number; channels: Record<string, ChannelMix> }

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
  /** MUSIC-SUITE P4: the song's key — what the note rows are locked to and what the card says. */
  key: SongKey;
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
/**
 * MUSIC-SUITE P4 (2026-09-25), grid-ui — P3's open item: two projects made in the same minute got the same default name
 * ("Beat · Sep 25 17:40" twice in MY PROJECTS, told apart only by their order). A title already taken (case- and
 * space-blind) gets the first free " (2)", " (3)" … suffix, cut to fit MAX_TITLE; a free title comes back as it is.
 */
export function uniqueTitle(title: string, taken: Iterable<string>): string {
  const norm = (t: string): string => t.replace(/\s+/g, ' ').trim().toLowerCase();
  const used = new Set<string>();
  for (const t of taken) used.add(norm(t));
  const base = cleanTitle(title) ?? title;
  if (!used.has(norm(base))) return base;
  for (let n = 2; n < 1000; n++) {
    const tail = ` (${n})`;
    const candidate = `${base.slice(0, MAX_TITLE - tail.length).trimEnd()}${tail}`;
    if (!used.has(norm(candidate))) return candidate;
  }
  return base;
}

export function emptyPattern(): boolean[] { return new Array<boolean>(PROJECT_STEPS).fill(false); }
/**
 * The eight kit rows, empty — what StudioMode's grid starts from. MUSIC-SUITE P4: the note rows (bass, lead) carry a note
 * on every step, the key's tonic in their register (A1 / A4 in A minor), so the first step lit plays the key's home note.
 */
export function emptyKitTracks(key: SongKey = DEFAULT_KEY): TrackState[] {
  return KIT_SLOTS.map((k) => ({
    sampleId: k.id, pattern: emptyPattern(), volume: 0.8, muted: false, pan: 0,
    ...(isNoteRow(k.id) ? { notes: new Array<number>(PROJECT_STEPS).fill(defaultRowNote(key, k.id)) } : {}),
  }));
}
export function emptyFlip(): ProjectFlip { return { source: null, slicing: 'transient', gridN: 8, chops: padsFromSlices([]) }; }

// ── MUSIC-SUITE P5 (2026-09-25): four banks and chop kits ──────────────────────────────────────────────────────────────

/** Banks A–D. */
export const BANK_COUNT = 4;
export const BANK_LETTERS = ['A', 'B', 'C', 'D'] as const;
/** Kits a project keeps (a damaged record past it is cut, and said). */
export const MAX_CHOP_KITS = 24;
export const MAX_KIT_NAME = 32;

/** An empty bank (a fresh chop set, sliced on transients). */
export function emptyBank(): ProjectFlipBank { return { source: null, slicing: 'transient', gridN: 8, chops: padsFromSlices([]) }; }
/** Does this bank hold anything to play (a source)? */
export function bankHasSound(b: ProjectFlipBank | null | undefined): boolean { return !!b?.source; }
const clampBank = (b: number): number => (Number.isInteger(b) && b >= 0 && b < BANK_COUNT ? b : 0);
/** Bank `b` (0 = A) of the FLIP tab. */
export function bankOf(f: ProjectFlip, b: number): ProjectFlipBank {
  const i = clampBank(b);
  if (i === 0) {
    const { source, slicing, gridN, chops, rate } = f;
    return { source, slicing, gridN, chops, ...(rate !== undefined ? { rate } : {}) };
  }
  return f.otherBanks?.[i - 1] ?? emptyBank();
}
/** All four banks, A first. */
export function flipBanks(f: ProjectFlip): ProjectFlipBank[] { return Array.from({ length: BANK_COUNT }, (_, i) => bankOf(f, i)); }
/** The FLIP tab with bank `b` replaced. B–D stay normalized (an empty bank is null, trailing nulls dropped). */
export function withBank(f: ProjectFlip, b: number, bank: ProjectFlipBank): ProjectFlip {
  const i = clampBank(b);
  if (i === 0) {
    const { rate: _r, ...rest } = f;
    return { ...rest, source: bank.source, slicing: bank.slicing, gridN: bank.gridN, chops: bank.chops, ...(bank.rate !== undefined ? { rate: bank.rate } : {}) };
  }
  const others: (ProjectFlipBank | null)[] = Array.from({ length: BANK_COUNT - 1 }, (_, k) => f.otherBanks?.[k] ?? null);
  others[i - 1] = bankHasSound(bank) ? bank : null;
  while (others.length && others[others.length - 1] === null) others.pop();
  const { otherBanks: _o, ...rest } = f;
  return others.length ? { ...rest, otherBanks: others } : rest;
}

const copyOf = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
/** A kit name: one line, at most MAX_KIT_NAME characters, unique among the project's kits (" (2)"…); blank = none. */
function kitName(name: string, taken: readonly ChopKit[]): string | null {
  const t = name.replace(/\s+/g, ' ').trim().slice(0, MAX_KIT_NAME);
  if (!t) return null;
  const used = new Set(taken.map((k) => k.name.toLowerCase()));
  if (!used.has(t.toLowerCase())) return t;
  for (let n = 2; n < 1000; n++) {
    const c = `${t.slice(0, MAX_KIT_NAME - ` (${n})`.length).trimEnd()} (${n})`;
    if (!used.has(c.toLowerCase())) return c;
  }
  return null;
}
/**
 * Save bank `b` as a named kit (a deep copy — later edits to the bank never change the kit). Null when the bank holds
 * nothing to play, the name is blank, or the project already keeps MAX_CHOP_KITS.
 */
export function saveChopKit(f: ProjectFlip, b: number, name: string, opts: { now: number; id?: string }): { flip: ProjectFlip; kit: ChopKit } | null {
  const bank = bankOf(f, b);
  const kits = f.kits ?? [];
  const n = kitName(name, kits);
  if (!bankHasSound(bank) || !n || kits.length >= MAX_CHOP_KITS) return null;
  const kit: ChopKit = { id: opts.id ?? `kit_${opts.now.toString(36)}${Math.floor(Math.random() * 36 ** 3).toString(36)}`, name: n, savedAt: opts.now, bank: copyOf(bank) };
  return { flip: { ...f, kits: [...kits, kit] }, kit };
}
/** Load a kit into bank `b` (a deep copy); the FLIP tab unchanged when there is no such kit. */
export function loadChopKit(f: ProjectFlip, kitId: string, b: number): ProjectFlip {
  const kit = f.kits?.find((k) => k.id === kitId);
  return kit ? withBank(f, b, copyOf(kit.bank)) : f;
}
/** Forget a kit (its audio stays while anything else uses it — projectAudioKeys). */
export function deleteChopKit(f: ProjectFlip, kitId: string): ProjectFlip {
  if (!f.kits?.some((k) => k.id === kitId)) return f;
  const kits = f.kits.filter((k) => k.id !== kitId);
  const { kits: _k, ...rest } = f;
  return kits.length ? { ...rest, kits } : rest;
}
/** MUSIC-SUITE P5: the bank + pad a row was sent from (absent = bank A, the row's own number). */
export function rowOrigin(r: Pick<ProjectFlipRow, 'pad' | 'origin'>): { bank: number; pad: number } {
  return r.origin ?? { bank: 0, pad: r.pad };
}

export function newProject(opts: { now: number; id?: string; title?: string; kit?: KitId; bpm?: number; swing?: number; polish?: boolean; key?: SongKey } = { now: Date.now() }): StudioProject {
  const now = opts.now;
  const key = readKey(opts.key) ?? { ...DEFAULT_KEY };
  return {
    v: STUDIO_PROJECT_VERSION,
    id: opts.id ?? newProjectId(now),
    title: cleanTitle(opts.title) ?? defaultProjectTitle(now),
    createdAt: now, updatedAt: now,
    bpm: opts.bpm ?? DEFAULT_BPM, swing: opts.swing ?? DEFAULT_SWING, kit: opts.kit ?? DEFAULT_KIT, key,
    tracks: emptyKitTracks(key), flipRows: [], sections: [], chain: [], takes: [],
    flip: emptyFlip(), mixer: { polish: opts.polish === true, master: 1, channels: {} }, remixOf: null,
  };
}

/** What MY PROJECTS' NEW and a REMIX open with (useStudioProject ops.create). MUSIC-SUITE P4: + the key (a remix keeps it). */
export type ProjectSeed = Partial<Pick<StudioProject, 'title' | 'tracks' | 'flipRows' | 'bpm' | 'swing' | 'kit' | 'remixOf' | 'key'>> & {
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
    ...(readKey(seed?.key) ? { key: readKey(seed?.key)! } : {}),
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

/**
 * Every audio key the project references — what the store must keep.
 * MUSIC-SUITE P5: every bank's source, every chop kit's, every section's own chops' — a parked
 * bank or a kit made from a mic take must not lose its bytes to the store's sweep an hour later.
 */
export function projectAudioKeys(p: Pick<StudioProject, 'takes' | 'flip' | 'flipRows'> & { sections?: readonly ProjectSection[] }): Set<string> {
  const keys = new Set<string>();
  const addBank = (b: ProjectFlipBank): void => { if (b.source?.audio) keys.add(b.source.audio.key); };
  for (const t of p.takes) keys.add(t.audio.key);
  for (const b of flipBanks(p.flip)) addBank(b);
  for (const k of p.flip.kits ?? []) addBank(k.bank);
  for (const r of p.flipRows) if (r.source.audio) keys.add(r.source.audio.key);
  for (const s of p.sections ?? []) for (const r of s.chops ?? []) if (r.source.audio) keys.add(r.source.audio.key);
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
    sections: p.sections.length, bars: songBars(p.chain), takes: p.takes.length, flip: flipBanks(p.flip).some(bankHasSound),
  };
}

// ── edits the room makes (pure, so the rules are tested once) ─────────────────────────────────────────────────────────

const flipIndex = (sampleId: string): number => { const m = /^flip_(\d{1,2})$/.exec(sampleId); return m ? Number(m[1]) : -1; };
/** `flip_<pad>` — a Flip pad's grid row. */
export function flipSampleId(pad: number): string { return `flip_${pad}`; }

/**
 * The note a Flip row's step plays for the pad's pitch (FLIP_ROOT_MIDI = the chop as sliced), or null for pitch 0.
 * MUSIC-SUITE P4 FIX PASS (2026-09-25): a pad plays at rateForPitch(pitch) (FlipPad), but its hits went into the grid as
 * `pattern` only, and the row's chop loads as root 60 — so a +5 pad replayed at 0. Contract (2) names the Flip pads' pitch
 * as a note the row plays, so the pitch rides on the step's note now.
 * MUSIC-SUITE P5 (2026-09-25): v2 only. A v3 row's chop is baked (its pitch is in the buffer), so a new row writes no
 * notes and a recorded hit plays the pad as tuned; this is how a v2 record's notes are read (rebaseLegacyFlip).
 */
export function padNote(pitch: number): number | null {
  return Number.isFinite(pitch) && Math.round(pitch) !== 0 ? FLIP_ROOT_MIDI + Math.max(-24, Math.min(24, Math.round(pitch))) : null;
}

/**
 * A pad sent (or first recorded) to the grid: its row exists, and the row remembers the exact chop it plays.
 * MUSIC-SUITE P4 FIX PASS: a NEW row of a pitched pad has every step on the pad's pitch (padNote), so the steps lit in the
 * grid play what the pad played; an existing row keeps its notes (they are the player's).
 * MUSIC-SUITE P5 (2026-09-25): the chop is BAKED (pitch, gate, reverse in the buffer), so a new row needs no notes — its
 * steps play the pad as tuned — and REPLACE ROW with another pitch is heard (the old notes are intervals from the pad as
 * tuned, and still are). P4 wrote 60 + pitch on every step and loaded the raw chop, so a replaced row kept the old pitch.
 */
export function withFlipRow(p: StudioProject, row: ProjectFlipRow): StudioProject {
  const tracks = p.tracks.some((t) => t.sampleId === row.sampleId)
    ? p.tracks
    : [...p.tracks, { sampleId: row.sampleId, pattern: emptyPattern(), volume: 0.9, muted: false, pan: 0 }];
  const flipRows = [...p.flipRows.filter((r) => r.sampleId !== row.sampleId), row];
  return { ...p, tracks, flipRows };
}

/**
 * A live pad tap while REC is armed: the step (chopEdit.recordStep) lights on that pad's row.
 * MUSIC-SUITE P4 FIX PASS: at the pad's pitch (padNote) — when the pad is pitched, or the row already carries notes.
 * MUSIC-SUITE P5: at the pad AS TUNED (FLIP_ROOT_MIDI — the pitch is baked into the row's chop), and only when the row
 * already carries notes; a row without notes just lights (it plays the pad as tuned).
 */
export function withFlipHit(p: StudioProject, sampleId: string, step: number): StudioProject {
  if (step < 0 || step >= PROJECT_STEPS) return p;
  const row = p.flipRows.find((r) => r.sampleId === sampleId);
  return {
    ...p,
    tracks: p.tracks.map((t) => {
      if (t.sampleId !== sampleId) return t;
      const lit = { ...t, pattern: t.pattern.map((v, j) => (j === step ? true : v)) };
      if (!row || !t.notes) return lit;
      return withStep(lit, step, { note: FLIP_ROOT_MIDI }, p.key);
    }),
  };
}

// ── MUSIC-SUITE P5 (2026-09-25): a section keeps its own chops; a v2 row reads as a baked one ──────────────────────────

const flipIdsOf = (tracks: readonly TrackState[]): string[] => tracks.filter((t) => flipIndex(t.sampleId) >= 0).map((t) => t.sampleId);
/**
 * Sections after a song edit, with their chops: a section that is NEW, or whose snapshot was retaken (UPDATE FROM GRID —
 * its `tracks` are not the ones it had), keeps a copy of the rows' chops for the Flip rows it holds. Every other section
 * is handed back as it was (a rename, the chain, a take never restamp one).
 */
export function stampSectionChops(before: readonly ProjectSection[], after: ProjectSection[], rows: readonly ProjectFlipRow[]): ProjectSection[] {
  const was = new Map(before.map((s) => [s.id, s]));
  let changed = false;
  const out = after.map((s) => {
    const old = was.get(s.id);
    if (old && old.tracks === s.tracks) return s;
    const ids = new Set(flipIdsOf(s.tracks));
    const chops = rows.filter((r) => ids.has(r.sampleId)).map((r) => copyOf(r));
    const { chops: _c, ...rest } = s;
    changed = true;
    return chops.length ? { ...rest, chops } : rest;
  });
  return changed ? out : after;
}
/** The chop each of a section's Flip rows plays: its own (saved with it), else the working row's; none = silent. */
export function sectionChopsFor(section: Pick<ProjectSection, 'tracks' | 'chops'> | null, rows: readonly ProjectFlipRow[]): ProjectFlipRow[] {
  if (!section) return [...rows];
  const own = new Map((section.chops ?? []).map((r) => [r.sampleId, r]));
  const out: ProjectFlipRow[] = [];
  for (const id of flipIdsOf(section.tracks)) {
    const r = own.get(id) ?? rows.find((x) => x.sampleId === id);
    if (r) out.push(r);
  }
  return out;
}
/**
 * A v2 grid read as v3: a v2 row played its RAW chop at rate 1 with the pitch on the steps' notes (P4 padNote; none = the
 * raw chop at FLIP_ROOT_MIDI), for its full length. Its chop is baked now, so each Flip track's notes move down by its
 * row's pitch (so every step sounds as it did) — folded into the row's range by octaves when a note would leave it.
 */
export function rebaseLegacyFlip(tracks: TrackState[], rows: readonly ProjectFlipRow[]): TrackState[] {
  return tracks.map((t) => {
    const r = rows.find((x) => x.sampleId === t.sampleId);
    if (!r || !r.pitch) return t;
    const notes = Array.from({ length: PROJECT_STEPS }, (_, i) => foldNote(t.sampleId, (t.notes?.[i] ?? FLIP_ROOT_MIDI) - r.pitch));
    return { ...t, notes };
  });
}

/**
 * MUSIC-SUITE P5 FIX PASS (2026-09-25): the v2 → v3 migration turned every ROW's gate off (a v2 row played its whole
 * chop) but left bank A's PADS gated (gate: true, the default the player never touched). P5's recordFlipHit treats a gate
 * difference as another chop, so on an old project the first ARM REC hit on any row REPLACED it with the pad's gated
 * chop — every earlier hit on that row now cut at 1.2 s, the toast saying the row "now plays pad N's chop (it replaced the
 * row's old one…)" — and the pad showed REPLACE ROW for a row it made. A v2 row is bank A's pad of its own number (there
 * were no banks, no origin); when that pad still holds the row's chop (same source, slice, reverse, pitch and rate), the
 * pad's gate goes off with the row's, so pad and row stay one chop. A pad re-cut or retuned since keeps its gate.
 */
function legacyPadGates(flip: ProjectFlip, rows: readonly ProjectFlipRow[]): ProjectFlip {
  const a = bankOf(flip, 0);
  if (!a.source) return flip;
  const key = (s: ProjectFlipSource): string => s.audio?.key ?? s.url ?? s.id;
  let chops = a.chops;
  for (const r of rows) {
    const pad = chops[r.pad];
    if (!pad?.slice || !pad.gate || r.origin) continue;
    const same = key(a.source) === key(r.source) && pad.slice.start === r.slice.start && pad.slice.end === r.slice.end
      && pad.reverse === r.reverse && pad.pitch === r.pitch && (a.rate ?? null) === (r.rate ?? null);
    if (same) chops = chops.map((c, i) => (i === r.pad ? { ...c, gate: false } : c));
  }
  return chops === a.chops ? flip : withBank(flip, 0, { ...a, chops });
}

// ── MUSIC-SUITE P4: steps as the contract says them — { on, note?, vel? } ────────────────────────────────────────────

/** PHASE-4 ENGINE CONTRACT (2): one step. `note` only on a pitched row; `vel` only once one was set (absent = 1). */
export interface Step { on: boolean; note?: number; vel?: number }

/** Step `i` of a row, as the contract's object. */
export function stepAt(t: Pick<TrackState, 'sampleId' | 'pattern' | 'notes' | 'vels'>, i: number): Step {
  const s: Step = { on: t.pattern[i] === true };
  const n = isPitchedRow(t.sampleId) ? t.notes?.[i] : undefined;
  if (typeof n === 'number' && Number.isFinite(n)) s.note = n;
  const v = t.vels?.[i];
  if (typeof v === 'number' && Number.isFinite(v)) s.vel = v;
  return s;
}
/** Every step of a row, as objects. */
export function stepsOf(t: Pick<TrackState, 'sampleId' | 'pattern' | 'notes' | 'vels'>): Step[] {
  return Array.from({ length: PROJECT_STEPS }, (_, i) => stepAt(t, i));
}
/** The note a pitched row's step holds when nothing set one: the key's tonic (a note row) or the chop as sliced (Flip). */
export function fallbackNote(sampleId: string, key: SongKey): number {
  return isNoteRow(sampleId) ? defaultRowNote(key, sampleId) : FLIP_ROOT_MIDI;
}

/**
 * Change one step of a row. `on` lights or clears it; `note` (pitched rows only; a drum row ignores it) is LOCKED — snapped
 * into the key and folded into the row's register (scales.ts lockNote); `vel` is clamped to 0..1. The note and velocity
 * arrays are made when first needed (the other steps get the row's fallback note / velocity 1) and never shared with the
 * old row. Nothing changed → the same row back (so an edit that changes nothing is not an undo step).
 */
export function withStep(t: TrackState, i: number, patch: Partial<Step>, key: SongKey = DEFAULT_KEY): TrackState {
  if (!Number.isInteger(i) || i < 0 || i >= PROJECT_STEPS) return t;
  let next: TrackState = t;
  if (patch.on !== undefined && (t.pattern[i] === true) !== patch.on) {
    next = { ...next, pattern: t.pattern.map((v, j) => (j === i ? patch.on === true : v)) };
  }
  if (patch.note !== undefined && Number.isFinite(patch.note) && isPitchedRow(t.sampleId)) {
    const note = lockNote(t.sampleId, patch.note, key);
    const had = t.notes && t.notes.length === PROJECT_STEPS ? t.notes : null;
    if (!had || had[i] !== note) {
      const base = had ?? new Array<number>(PROJECT_STEPS).fill(fallbackNote(t.sampleId, key));
      next = { ...next, notes: base.map((n, j) => (j === i ? note : n)) };
    }
  }
  if (patch.vel !== undefined && Number.isFinite(patch.vel)) {
    const vel = Math.max(0, Math.min(1, patch.vel));
    const had = t.vels && t.vels.length === PROJECT_STEPS ? t.vels : null;
    if (had ? had[i] !== vel : vel !== 1) {   // no velocities yet = every step 1: a 1 changes nothing
      const base = had ?? new Array<number>(PROJECT_STEPS).fill(1);
      next = { ...next, vels: base.map((v, j) => (j === i ? vel : v)) };
    }
  }
  return next;
}
/** withStep on the row `sampleId` of a grid (the same array back when nothing changed). */
export function withTrackStep(tracks: TrackState[], sampleId: string, i: number, patch: Partial<Step>, key: SongKey = DEFAULT_KEY): TrackState[] {
  let changed = false;
  const out = tracks.map((t) => {
    if (t.sampleId !== sampleId) return t;
    const n = withStep(t, i, patch, key);
    if (n !== t) changed = true;
    return n;
  });
  return changed ? out : tracks;
}

/**
 * A note row's notes moved to another key AS A LINE. MUSIC-SUITE P4 FIX PASS (2026-09-25): each note was moved and then
 * folded into the register on its own (lockNote), so a line near the top of the bass broke apart — an A-minor bass A2 C3 E3
 * became Eb3 Gb2 Bb2 in D# minor: the first note above the rest, a rising line turned into a falling sixth (scales.ts says
 * "a bass line never jumps an octave"). Now the row's notes are moved together (transposeNote), then ONE octave shift is
 * chosen for the whole row — the one that keeps the most of its LIT notes in the register (ties: the smallest shift) — and
 * only a note still outside is folded (lockNote). A2 C3 E3 → Eb2 Gb2 Bb2.
 */
export function moveRowNotes(t: Pick<TrackState, 'sampleId' | 'pattern'> & { notes: readonly number[] }, from: SongKey, to: SongKey): number[] {
  const moved = t.notes.map((n) => transposeNote(n, from, to));
  const range = rowRange(t.sampleId);
  if (!range) return moved;
  const litNotes = moved.filter((_, i) => t.pattern[i] === true);
  const judge = litNotes.length ? litNotes : moved;
  let shift = 0, best = -1;
  for (const k of [0, -12, 12, -24, 24]) {
    const inside = judge.filter((n) => n + k >= range.lo && n + k <= range.hi).length;
    if (inside > best) { best = inside; shift = k; }
  }
  return moved.map((n) => lockNote(t.sampleId, n + shift, to));
}
/** A Flip row's key: the chop as the tonic (FLIP_ROOT_MIDI), the song's scale — what the Flip NoteRow offers (noteMath). */
function flipScaleKey(key: SongKey): SongKey { return { root: pitchClass(FLIP_ROOT_MIDI), scale: key.scale }; }

/**
 * A new key for the song: every note row's notes (grid and sections) move with it — scales.ts transposeNote (the same
 * scale shifts by the smallest move; a seven-note mode change keeps each note's degree; pentatonic / blues snap) — as a
 * line in their row's register (moveRowNotes). The ONE way to change the key: a key written without moving the notes
 * leaves notes outside it.
 * MUSIC-SUITE P4 FIX PASS (2026-09-25): FLIP ROWS FOLLOW A SCALE CHANGE. They were skipped, while the Flip NoteRow offers
 * the song's SCALE built on the chop — so A minor → A major left a +3 the new row no longer offered (the next ⌥↑/↓ snapped
 * it). A scale change now maps each Flip note that sat on the old scale by its degree (the chop is the tonic of both); a
 * root change leaves them (a chop is not in a key), and a pad's own off-scale pitch is never snapped.
 */
export function setProjectKey(p: StudioProject, key: SongKey): StudioProject {
  const k = readKey(key);
  if (!k || sameKey(k, p.key)) return p;
  const fromFlip = flipScaleKey(p.key), toFlip = flipScaleKey(k);
  const move = (tracks: TrackState[]): TrackState[] => tracks.map((t) => {
    if (!t.notes) return t;
    if (isNoteRow(t.sampleId)) return { ...t, notes: moveRowNotes({ ...t, notes: t.notes }, p.key, k) };
    if (isPitchedRow(t.sampleId) && p.key.scale !== k.scale) {
      return { ...t, notes: t.notes.map((n) => lockNote(t.sampleId, inScale(n, fromFlip) ? transposeNote(n, fromFlip, toFlip) : n, k)) };
    }
    return t;
  });
  return { ...p, key: k, tracks: move(p.tracks), sections: p.sections.map((s) => ({ ...s, tracks: move(s.tracks) })) };
}

// ── MUSIC-SUITE P4: the desk ─────────────────────────────────────────────────────────────────────────────────────────

/** Is this a strip the desk has: a kit row, a Flip row, or the takes? */
export function isChannelId(id: string): boolean {
  return KIT_SLOTS.some((k) => k.id === id) || (flipIndex(id) >= 0 && flipIndex(id) < PAD_COUNT) || id === TAKES_CHANNEL;
}
const sameStrip = (a: ChannelMix, b: ChannelMix): boolean =>
  a.gain === b.gain && a.pan === b.pan && a.mute === b.mute && a.solo === b.solo && a.sendA === b.sendA && a.sendB === b.sendB;
/** A strip as the project keeps it: every field present and clamped. */
export function cleanStrip(c: Partial<ChannelMix>): ChannelMix {
  const n = (v: unknown, d: number, lo: number, hi: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
  return {
    gain: n(c.gain, DEFAULT_CHANNEL.gain, 0, CHANNEL_GAIN_MAX), pan: n(c.pan, 0, -1, 1), mute: c.mute === true, solo: c.solo === true,
    sendA: n(c.sendA, 0, 0, 1), sendB: n(c.sendB, 0, 0, 1),
  };
}
/** The strip `id` of a project (the defaults when it has none). */
export function channelOf(p: Pick<StudioProject, 'mixer'>, id: string): ChannelMix {
  return cleanStrip(p.mixer.channels[id] ?? {});
}
/** Move one strip. A strip put back to the defaults is removed (an untouched desk stays `{}`); an unknown id is refused. */
export function withChannel(p: StudioProject, id: string, patch: Partial<ChannelMix>): StudioProject {
  if (!isChannelId(id)) return p;
  const next = cleanStrip({ ...channelOf(p, id), ...patch });
  const had = p.mixer.channels[id];
  if (had && sameStrip(had, next)) return p;
  const channels = { ...p.mixer.channels };
  if (sameStrip(next, DEFAULT_CHANNEL)) { if (!had) return p; delete channels[id]; } else channels[id] = next;
  return { ...p, mixer: { ...p.mixer, channels } };
}
/** The master fader, 0..MASTER_FADER_MAX. */
export function withMaster(p: StudioProject, master: number): StudioProject {
  if (!Number.isFinite(master)) return p;
  const m = Math.max(0, Math.min(MASTER_FADER_MAX, master));
  return m === p.mixer.master ? p : { ...p, mixer: { ...p.mixer, master: m } };
}
/** What AudioEngine.setMixer takes. */
export function mixerOf(p: Pick<StudioProject, 'mixer'>): MixerState {
  return { master: p.mixer.master, channels: p.mixer.channels };
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
  // MUSIC-SUITE P5 FIX PASS (2026-09-25): …and a public-domain file only while the owner's signed entry names it (pdShelf)
  const url = typeof v.url === 'string' && /^\/audio\/[A-Za-z0-9/_.-]{1,200}$/.test(v.url) && !v.url.includes('..') && pdAudioAllowed(v.url) ? v.url : undefined;
  const audio = readAudioRef(v.audio) ?? undefined;
  if (!url && !audio) return null;                       // nothing to play it from
  return {
    id, label, kind: v.kind, note: typeof v.note === 'string' ? v.note.slice(0, 240) : '', ...(url ? { url } : {}), ...(audio ? { audio } : {}),
    ...(v.upload === true ? { upload: true as const } : {}),   // MUSIC-SUITE P3 FIX PASS: decision #15's mark, never dropped
    ...(typeof v.key === 'string' && SOURCE_KEY.test(v.key) ? { key: v.key } : {}),   // MUSIC-SUITE P5 FIX PASS: the source's key
  };
}

/** MUSIC-SUITE P5 FIX PASS: a source's key as the pack writes it — 'Eb major', 'G mixolydian', or a root note 'C4'. */
const SOURCE_KEY = /^[A-G][b#]?(-?\d| [a-z]{3,12})$/;

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

/** MUSIC-SUITE P5: one bank as stored (bank A is the FLIP tab's top-level fields; `where` names B–D and kits in an issue). */
function readBank(v: Obj, where: string, issues: string[]): ProjectFlipBank {
  const source = v.source == null ? null : readSource(v.source);
  if (v.source != null && !source) issues.push(`${where ? `${where}: ` : ''}the Flip source was unreadable (unloaded)`);
  const chopsIn = Array.isArray(v.chops) ? v.chops : [];
  const rate = source ? readRate(v.rate) : undefined;
  const chops = Array.from({ length: PAD_COUNT }, (_, i) => readPad(source ? chopsIn[i] : null));
  return {
    source,
    slicing: v.slicing === 'grid' ? 'grid' : v.slicing === 'cuts' ? 'cuts' : 'transient',
    gridN: finite(v.gridN) ? clamp(Math.round(v.gridN), 2, PAD_COUNT) : 8,
    chops,
    ...(rate ? { rate } : {}),
  };
}

/** MUSIC-SUITE P5: one Flip row as stored (the grid's, or a section's own chop); null = unreadable. */
function readFlipRow(r: unknown): ProjectFlipRow | null {
  const source = isObj(r) ? readSource(r.source) : null;
  const slice = isObj(r) ? readSlice(r.slice) : null;
  const pad = isObj(r) && finite(r.pad) ? Math.floor(r.pad) : -1;
  if (!isObj(r) || !source || !slice || pad < 0 || pad >= PAD_COUNT || r.sampleId !== flipSampleId(pad)) return null;
  const rate = readRate(r.rate);
  const o = isObj(r.origin) && finite(r.origin.bank) && finite(r.origin.pad) ? { bank: Math.floor(r.origin.bank), pad: Math.floor(r.origin.pad) } : null;
  const origin = o && o.bank >= 0 && o.bank < BANK_COUNT && o.pad >= 0 && o.pad < PAD_COUNT && !(o.bank === 0 && o.pad === pad) ? o : null;
  return {
    sampleId: flipSampleId(pad), pad, label: str(r.label, 32) ?? `FLIP ${pad + 1}`, source, slice, reverse: r.reverse === true,
    pitch: finite(r.pitch) ? clamp(Math.round(r.pitch), -12, 12) : 0, gate: r.gate !== false, ...(rate ? { rate } : {}), ...(origin ? { origin } : {}),
  };
}

/** MUSIC-SUITE P4: what a row needs to be read — the project's kit (its voices' notes), key and the record's version. */
interface RowCtx { kit: KitId; key: SongKey; from: number }

/**
 * The note a note row's step gets when the record has none: the note its kit's voice has always played (SynthKit
 * VOICE_ROOTS — a pre-P4 bass or lead sounds exactly as it did), or, for a row with no kit voice (keys), the key's tonic.
 */
function voiceNote(sampleId: string, rc: RowCtx): number {
  return isPitchedSlot(sampleId) ? VOICE_ROOTS[rc.kit][sampleId] : fallbackNote(sampleId, rc.key);
}
/** A note folded into its row's register by octaves (the pitch class kept), rounded. */
function foldNote(sampleId: string, n: number): number {
  const range = rowRange(sampleId);
  let m = Math.round(n);
  if (!range) return m;
  while (m < range.lo) m += 12;
  while (m > range.hi) m -= 12;
  return Math.max(range.lo, m);
}

/**
 * MUSIC-SUITE P4: a row's notes. A drum row has none (a v2 record's are dropped, and said). A note row without notes — any
 * record before v2 — gets its kit voice's note on every step (a migration, not a repair); a damaged one is repaired and
 * said. A Flip row keeps notes only when the record has them (none = the chop as sliced). Scale-locking is the EDITOR's rule
 * (withStep / setProjectKey): a note in range is never rewritten here.
 */
function readNotes(sampleId: string, raw: unknown, where: string, issues: string[], rc: RowCtx): number[] | undefined {
  if (!isPitchedRow(sampleId)) {
    if (raw !== undefined && rc.from >= 2) issues.push(`${where} (${sampleId}): notes on a drum row (dropped)`);
    return undefined;
  }
  const noteRow = isNoteRow(sampleId);
  if (!Array.isArray(raw)) {
    if (raw !== undefined) issues.push(`${where} (${sampleId}): notes unreadable (${noteRow ? 'its voice\'s note' : 'as sliced'})`);
    return noteRow ? new Array<number>(PROJECT_STEPS).fill(voiceNote(sampleId, rc)) : undefined;
  }
  let fixed = 0;
  const fill = noteRow ? voiceNote(sampleId, rc) : FLIP_ROOT_MIDI;
  const notes = Array.from({ length: PROJECT_STEPS }, (_, i) => {
    const n = raw[i];
    if (!finite(n)) { fixed++; return fill; }
    const m = foldNote(sampleId, n);
    if (m !== n) fixed++;
    return m;
  });
  if (raw.length !== PROJECT_STEPS) issues.push(`${where} (${sampleId}): ${raw.length} notes read as ${PROJECT_STEPS}`);
  else if (fixed) issues.push(`${where} (${sampleId}): ${fixed} note${fixed === 1 ? '' : 's'} read into the row's range`);
  return notes;
}
/** MUSIC-SUITE P4: a row's velocities (absent = every step 1, kept absent). */
function readVels(sampleId: string, raw: unknown, where: string, issues: string[]): number[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) { issues.push(`${where} (${sampleId}): velocities unreadable (full)`); return undefined; }
  let fixed = 0;
  const vels = Array.from({ length: PROJECT_STEPS }, (_, i) => {
    const v = raw[i];
    if (!finite(v)) { fixed++; return 1; }
    const c = clamp(v, 0, 1);
    if (c !== v) fixed++;
    return c;
  });
  if (raw.length !== PROJECT_STEPS || fixed) issues.push(`${where} (${sampleId}): velocities read as 0–1 on ${PROJECT_STEPS} steps`);
  return vels;
}
/** A kit row the record lacked, empty (a note row with its voice's note). */
function blankRow(sampleId: string, rc: RowCtx): TrackState {
  return { sampleId, pattern: emptyPattern(), volume: 0.8, muted: false, pan: 0, ...(isNoteRow(sampleId) ? { notes: new Array<number>(PROJECT_STEPS).fill(voiceNote(sampleId, rc)) } : {}) };
}

/** One grid row, repaired: a 16-step boolean pattern, volume 0–1.5, pan −1–1. `where` names it in an issue. */
function readTrack(v: unknown, where: string, issues: string[], rc: RowCtx): TrackState | null {
  if (!isObj(v)) { issues.push(`${where}: not a track (dropped)`); return null; }
  const sampleId = str(v.sampleId, 32);
  if (!sampleId) { issues.push(`${where}: no sound id (dropped)`); return null; }
  let pattern: boolean[];
  const steps = v.pattern;
  if (Array.isArray(steps)) {
    pattern = Array.from({ length: PROJECT_STEPS }, (_, i) => steps[i] === true);
    if (steps.length !== PROJECT_STEPS) issues.push(`${where} (${sampleId}): ${steps.length} steps read as ${PROJECT_STEPS}`);
  } else { pattern = emptyPattern(); issues.push(`${where} (${sampleId}): steps unreadable, row kept empty`); }
  const notes = readNotes(sampleId, v.notes, where, issues, rc);   // MUSIC-SUITE P4
  const vels = readVels(sampleId, v.vels, where, issues);
  return {
    sampleId, pattern,
    volume: finite(v.volume) ? clamp(v.volume, 0, 1.5) : 0.8,
    muted: v.muted === true,
    pan: finite(v.pan) ? clamp(v.pan, -1, 1) : 0,
    ...(notes ? { notes } : {}),
    ...(vels ? { vels } : {}),
  };
}

/** A track list: known rows only (a kit slot or flip_0..15), no duplicates; with `kitRows`, all eight kit rows first. */
function readTracks(v: unknown, where: string, issues: string[], kitRows: boolean, rc: RowCtx): TrackState[] {
  const raw = Array.isArray(v) ? v : [];
  const seen = new Set<string>();
  const out: TrackState[] = [];
  raw.forEach((t, i) => {
    const tr = readTrack(t, `${where} row ${i + 1}`, issues, rc);
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
    return found ?? blankRow(k.id, rc);
  });
  const flips = out.filter((t) => flipIndex(t.sampleId) >= 0).sort((a, b) => flipIndex(a.sampleId) - flipIndex(b.sampleId));
  return [...kit, ...flips];
}

/**
 * Read a stored record into a project of the current version, or refuse it.
 *
 * Versions: v0 is the unversioned shape (no `v`): the room's P2-era state — bpm / swing / tracks / sections (whose swing
 * may be missing) / chain / kit, with no id, title, takes, Flip or mixer. v1 is P3's. v2 (MUSIC-SUITE P4) adds a step's
 * note and velocity, the key, the full mixer and the booth's take fields; a v0 / v1 record gains them as a migration (the
 * note rows get their kit voice's note, the key is A minor, the P3 strip placeholder's room / delay become sendA / sendB),
 * never as a repair. A `v` above
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
  // MUSIC-SUITE P4: the key (none saved = A minor, the key every kit's voices sit in: a migration)
  const keyRead = readKey(raw.key);
  const key: SongKey = keyRead ?? { ...DEFAULT_KEY };
  if (raw.key !== undefined && !keyRead) issues.push('key unreadable (A minor)');
  const rc: RowCtx = { kit, key, from };

  const tracks = readTracks(raw.tracks, 'grid', issues, true, rc);

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
    // MUSIC-SUITE P5: the section's own chops (v3), one per Flip row it holds
    const chops: ProjectFlipRow[] = [];
    if (Array.isArray(s.chops)) {
      let bad = 0;
      for (const c of s.chops) {
        const row = readFlipRow(c);
        if (!row || chops.some((x) => x.sampleId === row.sampleId) || chops.length >= MAX_FLIP_ROWS) { bad++; continue; }
        chops.push(row);
      }
      if (bad) issues.push(`section ${i + 1}: ${bad} of its own chop${bad === 1 ? '' : 's'} unreadable (it plays the grid's)`);
    } else if (s.chops !== undefined) issues.push(`section ${i + 1}: its own chops were unreadable (it plays the grid's)`);
    sections.push({ id: sid, name: str(s.name, 24) ?? 'section', tracks: readTracks(s.tracks, `section ${i + 1}`, issues, false, rc), swing: sw, ...(chops.length ? { chops } : {}) });
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
    // MUSIC-SUITE P4: + the booth's region, trims, mute and pick (readTakeRegion; a pre-P4 take gets its defaults)
    takes.push(readTakeRegion(t, {
      id: tid,
      atBar: finite(t.atBar) ? clamp(Math.floor(t.atBar), 0, MAX_SONG_BARS - 1) : 0,
      gain: finite(t.gain) ? clamp(t.gain, 0, 2) : 0.9,
      durationSec: finite(t.durationSec) && t.durationSec >= 0 ? Math.min(t.durationSec, 600) : 0,
      audio,
    }, bpm, i));
  });
  if (takesCut) issues.push(`${takesCut} take${takesCut === 1 ? '' : 's'} past the ${MAX_TAKES} cap (dropped)`);
  if (raw.takes !== undefined && !Array.isArray(raw.takes)) issues.push('takes unreadable (none kept)');

  // the FLIP tab: source + slicing + 16 chops (bank A). MUSIC-SUITE P5: + banks B–D and the chop kits (v3)
  let flip = emptyFlip();
  if (isObj(raw.flip)) {
    const a = readBank(raw.flip, '', issues);
    flip = withBank(flip, 0, a);
    if (Array.isArray(raw.flip.otherBanks)) {
      raw.flip.otherBanks.slice(0, BANK_COUNT - 1).forEach((b, k) => {
        if (b === null) return;
        if (!isObj(b)) { issues.push(`bank ${BANK_LETTERS[k + 1]} unreadable (emptied)`); return; }
        flip = withBank(flip, k + 1, readBank(b, `bank ${BANK_LETTERS[k + 1]}`, issues));
      });
      if (raw.flip.otherBanks.length > BANK_COUNT - 1) issues.push(`${raw.flip.otherBanks.length - (BANK_COUNT - 1)} bank(s) past D (dropped)`);
    } else if (raw.flip.otherBanks !== undefined) issues.push('banks B–D unreadable (emptied)');
    if (Array.isArray(raw.flip.kits)) {
      const kits: ChopKit[] = [];
      let bad = 0;
      for (const k of raw.flip.kits) {
        const name = isObj(k) ? str(k.name, MAX_KIT_NAME) : null;
        const id = isObj(k) ? str(k.id, 64) : null;
        const bank = isObj(k) && isObj(k.bank) ? readBank(k.bank, `kit "${name ?? '?'}"`, issues) : null;
        if (!name || !id || !bank || !bankHasSound(bank) || kits.some((x) => x.id === id) || kits.length >= MAX_CHOP_KITS) { bad++; continue; }
        kits.push({ id, name, savedAt: finite(k.savedAt) && k.savedAt > 0 ? k.savedAt : createdAt, bank });
      }
      if (bad) issues.push(`${bad} chop kit${bad === 1 ? '' : 's'} unreadable or past the ${MAX_CHOP_KITS} cap (dropped)`);
      if (kits.length) flip = { ...flip, kits };
    } else if (raw.flip.kits !== undefined) issues.push('chop kits unreadable (none kept)');
  } else if (raw.flip !== undefined) issues.push('the Flip tab was unreadable (emptied)');

  let flipRows: ProjectFlipRow[] = [];
  (Array.isArray(raw.flipRows) ? raw.flipRows : []).forEach((r, i) => {
    if (flipRows.length >= MAX_FLIP_ROWS) { issues.push(`Flip row ${i + 1}: past the ${MAX_FLIP_ROWS} pads (dropped)`); return; }
    const row = readFlipRow(r);
    if (!row || flipRows.some((x) => x.sampleId === row.sampleId)) {
      issues.push(`Flip row ${i + 1}: its chop was unreadable (the row plays nothing until a pad is sent again)`);
      return;
    }
    flipRows.push(row);
  });

  // MUSIC-SUITE P5: a v2 (or older) grid sounds as it did with its chops baked — the notes move down by each row's pitch
  // (grid and sections), and a row's gate goes off (a v2 row played its whole chop). A migration, not a repair.
  let grid = tracks;
  if (from < 3 && flipRows.length) {
    grid = rebaseLegacyFlip(tracks, flipRows);
    for (let i = 0; i < sections.length; i++) sections[i] = { ...sections[i], tracks: rebaseLegacyFlip(sections[i].tracks, flipRows) };
    flipRows = flipRows.map((r) => ({ ...r, gate: false }));
    flip = legacyPadGates(flip, flipRows);
  }

  // MUSIC-SUITE P4: the desk — the master fader and full strips (a P3 placeholder's room / delay are sendA / sendB)
  const rawMixer = isObj(raw.mixer) ? raw.mixer : null;
  const mixer: ProjectMixer = { polish: rawMixer ? rawMixer.polish === true : raw.polished === true, master: 1, channels: {} };
  if (rawMixer) {
    if (finite(rawMixer.master)) {
      mixer.master = clamp(rawMixer.master, 0, MASTER_FADER_MAX);
      if (mixer.master !== rawMixer.master) issues.push(`master fader ${rawMixer.master} read as ${mixer.master}`);
    } else if (rawMixer.master !== undefined) issues.push('master fader unreadable (unity)');
    if (isObj(rawMixer.channels)) {
      let clamped = 0;
      for (const [k, c] of Object.entries(rawMixer.channels)) {
        if (!isObj(c) || !isChannelId(k)) { issues.push(`mixer: strip "${k.slice(0, 32)}" unreadable (dropped)`); continue; }
        const given = { gain: c.gain, pan: c.pan, sendA: finite(c.sendA) ? c.sendA : c.room, sendB: finite(c.sendB) ? c.sendB : c.delay };
        const strip = cleanStrip({ ...given, mute: c.mute === true, solo: c.solo === true } as Partial<ChannelMix>);
        for (const f of ['gain', 'pan', 'sendA', 'sendB'] as const) if (finite(given[f]) && given[f] !== strip[f]) clamped++;
        if (!sameStrip(strip, DEFAULT_CHANNEL)) mixer.channels[k] = strip;
      }
      if (clamped) issues.push(`mixer: ${clamped} setting${clamped === 1 ? '' : 's'} out of range (clamped)`);
    } else if (rawMixer.channels !== undefined) issues.push('mixer strips unreadable (reset)');
  }

  const remixOf = isObj(raw.remixOf) && str(raw.remixOf.id, 96) && str(raw.remixOf.title, 200)
    ? { id: raw.remixOf.id as string, title: raw.remixOf.title as string, authorName: typeof raw.remixOf.authorName === 'string' ? raw.remixOf.authorName.slice(0, 96) : '' }
    : null;

  const project: StudioProject = {
    v: STUDIO_PROJECT_VERSION,
    id: id ?? (ctx.newId ? ctx.newId() : newProjectId(now)),
    title: cleanTitle(raw.title) ?? defaultProjectTitle(createdAt),
    createdAt, updatedAt, bpm, swing, kit, key, tracks: grid, flipRows, sections, chain, takes, flip, mixer, remixOf,
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
