// MUSIC-SUITE P5 (2026-09-25), "The Flip, for real" — flip-content: FEL's own Flip pack, read at runtime.
//
// What was wrong: the Flip had nothing a producer would chop. Its built-in shelf was eight 808 one-shots, each of which
// the finder cut into 8 grid slivers of a single hit (Flip.ts FEL_SOURCES, before). Owner decision #15 asked for a
// FEL-made pack (melodic loops, chord stabs, horn hits, voiced vocal chops) and a "FEL theme" first lesson.
//
// The pack was produced and validated outside the repo (outbox musicsuite/flippack: CONTRACT.md / SPEC.md, now copied to
// scripts/music/flip-pack/ with the generators that made it) and installed at public/audio/flip by
// scripts/music/flip-pack/install-pack.mts: pack.json (the index), PROVENANCE.json (the record), audio/<id>.mp3 (69 files,
// 2.49 MB). This module is the app's typed view of pack.json:
//   · parseFlipPack — the index, validated item by item at runtime (a bad item is dropped with a named problem; a pack
//     whose header is not FEL's own — pack id, licence, sample rate — is refused whole);
//   · the pack's cuts ("FEL cuts", `suggestedPads`) as slices at the rate the browser decoded at (itemCuts);
//   · kits: one-shots loaded WHOLE, one file per pad, joined end to end (joinCuts) — never through the onset finder
//     (CONTRACT §12.3: a one-shot through the finder is 8 grid slivers of one hit);
//   · gapless decoding (gaplessWindow): every file carries a LAME gapless header; a decoder that ignores it hands back
//     encoderDelay + 529 extra samples at the head and the padding at the tail (pack.json `decoding`, CONTRACT §3.2).
//     The window cuts the decode back to exactly `samples`, so pad 1 is the downbeat and a kit's cut is the file's end
//     on every browser (assumption until the probe measures it: Chromium honours the header; the window is a no-op then);
//   · the FEL-theme lesson's timing (lessonInOrder / lessonFlip) and its per-player "seen" mark.
// The pure parts are tested in flipPack.test.ts, against the real public/audio/flip/pack.json as well.

import { FEL_808_KIT, FLIP_KIT_PATH, FLIP_PACK_AUDIO, FLIP_TEXTURE_KIT_ID, GATE_MAX_S, PAD_COUNT, type Pad, type Slice } from './Flip';

export const FLIP_PACK_URL = '/audio/flip/pack.json';
export const FLIP_PACK_LICENCE = 'FEL original, generated';
/** Every pack file is 44.1 kHz; `samples` counts at this rate. */
export const FLIP_PACK_RATE = 44100;
/** What a decoder that ignores the LAME header adds on top of encoderDelay (pack.json decoding.decoderDelayConvention). */
export const MP3_DECODER_DELAY = 529;
/** The tempos at which N bars of 4/4 are a whole number of samples at 44.1 kHz (CONTRACT §4.1). */
export const FLIP_PACK_BPMS: readonly number[] = [90, 96, 98, 100, 105, 108, 112, 120, 125];
export const FLIP_PACK_KINDS = ['theme', 'loop', 'stab', 'hit', 'chop', 'texture'] as const;
export type FlipPackKind = typeof FLIP_PACK_KINDS[number];
const PREFIX: Record<FlipPackKind, string> = { theme: 'theme_', loop: 'loop_', stab: 'stab_', hit: 'hit_', chop: 'chop_', texture: 'tex_' };

/** The FEL-theme lesson (CONTRACT §8.2): pads 1→N in order replay the phrase; `flipPattern` is one bar of 16 steps. */
export interface FlipLesson { playInOrder: number[]; flipPattern: (number | null)[]; tip: string }

export interface FlipPackItem {
  id: string;
  kind: FlipPackKind;
  /** player-facing, ≤ 24 characters */
  title: string;
  /** '/audio/flip/audio/<id>.mp3' */
  url: string;
  durationSec: number;
  /** the decoded length at 44.1 kHz, exactly (the gapless length) */
  samples: number;
  channels: 1 | 2;
  /** FEL's cut points in seconds, sorted, the first 0 — a one-shot's is [0] (the whole file is one pad) */
  suggestedPads: number[];
  tags: string[];
  lame: { encoderDelay: number; padding: number };
  bpm?: number;
  bars?: number;
  /** MPC-style: the off 16th lands at this fraction of the 8th (0.54 = 54 %); absent = straight */
  swing?: number;
  loop?: boolean;
  /** 'Eb major', 'D dorian' … (themes and loops) */
  key?: string;
  /** a pitched one-shot's note ('C4') */
  root?: string;
  chord?: string;
  /** a vocal chop's words and voice */
  text?: string;
  voice?: string;
  /** a chop sheet: a 4-bar loop of syllables, chopped like a loop */
  sheet?: boolean;
  candidate?: 'a' | 'b' | 'c';
  character?: string;
  lesson?: FlipLesson;
  /** the file's sha256 (its provenance record's) */
  sha256: string;
}

export interface FlipPackBank { id: string; title: string; pads: (string | null)[] }

export interface FlipPackIndex {
  version: string;
  date: string;
  licence: string;
  statement: string;
  items: FlipPackItem[];
  byId: ReadonlyMap<string, FlipPackItem>;
  /** the pack's kits (one-shots, one per pad), then the Textures kit made from the pack's textures */
  banks: FlipPackBank[];
  /** the FEL-theme candidates, in pack order */
  themes: FlipPackItem[];
  /** pack.json `themeDefault` (owner decision #25: theme_a_sunday_tape), else the first candidate; null = no themes */
  themeDefault: string | null;
}

export type FlipPackParse = { ok: true; pack: FlipPackIndex; problems: string[] } | { ok: false; problems: string[] };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const nat = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;
const ID = /^[a-z0-9_]{3,48}$/;
const BANK_ID = /^bank_[a-z0-9_]{1,40}$/;
const ROOT = /^[A-G][b#]?-?\d$/;
const SHA = /^[0-9a-f]{64}$/;
const TAG = /^[a-z0-9-]{1,24}$/;

/** Themes, loops and chop sheets are chopped on FEL's cuts; everything else loads whole. */
export function isChoppable(it: Pick<FlipPackItem, 'kind' | 'sheet'>): boolean {
  return it.kind === 'theme' || it.kind === 'loop' || (it.kind === 'chop' && it.sheet === true);
}
/** A stab, a hit or a single vocal chop — what a kit's pad holds. */
export function isOneShot(it: Pick<FlipPackItem, 'kind' | 'sheet'>): boolean {
  return it.kind === 'stab' || it.kind === 'hit' || (it.kind === 'chop' && it.sheet !== true);
}

function readLesson(v: unknown, pads: number): FlipLesson | string {
  if (!isObj(v)) return 'no lesson';
  const order = v.playInOrder, pattern = v.flipPattern;
  if (!Array.isArray(order) || order.length < 1 || order.length > pads || order.some((p, i) => p !== i)) return 'lesson.playInOrder is not pads 0..n-1 inside the cuts';
  if (!Array.isArray(pattern) || pattern.length !== 16) return 'lesson.flipPattern is not 16 steps';
  if (pattern.some((p) => p !== null && !(nat(p) && p < pads))) return 'lesson.flipPattern names a pad the theme does not have';
  if (pattern.filter((p) => p !== null).length < 4) return 'lesson.flipPattern has fewer than 4 hits';
  if (!text(v.tip, 140)) return 'lesson.tip is missing or longer than 140';
  return { playInOrder: [...order] as number[], flipPattern: [...pattern] as (number | null)[], tip: v.tip };
}

/** One pack.json item, checked; a string names why it is refused. */
function readItem(v: unknown): FlipPackItem | string {
  if (!isObj(v)) return 'not an object';
  const id = v.id, kind = v.kind;
  if (typeof id !== 'string' || !ID.test(id)) return `bad id ${JSON.stringify(id)}`;
  if (typeof kind !== 'string' || !(FLIP_PACK_KINDS as readonly string[]).includes(kind)) return `${id}: bad kind`;
  const k = kind as FlipPackKind;
  if (!id.startsWith(PREFIX[k])) return `${id}: a ${k} id starts with ${PREFIX[k]}`;
  if (v.file !== `audio/${id}.mp3`) return `${id}: file is not audio/${id}.mp3`;
  if (!text(v.title, 24)) return `${id}: title missing or over 24 characters`;
  if (!Number.isInteger(v.samples) || (v.samples as number) <= 0) return `${id}: samples`;
  const samples = v.samples as number;
  if (!fin(v.durationSec) || Math.abs(v.durationSec - samples / FLIP_PACK_RATE) > 1e-5) return `${id}: durationSec is not samples / 44100`;
  if (v.channels !== 1 && v.channels !== 2) return `${id}: channels`;
  const sp = v.suggestedPads;
  if (!Array.isArray(sp) || sp.length < 1 || sp.length > PAD_COUNT || !sp.every(fin)) return `${id}: suggestedPads`;
  if (sp[0] !== 0 || sp.some((t, i) => (i > 0 && t <= sp[i - 1]) || t >= (v.durationSec as number))) return `${id}: suggestedPads are not sorted from 0 inside the file`;
  const tags = Array.isArray(v.tags) ? v.tags.filter((t): t is string => typeof t === 'string' && TAG.test(t)) : [];
  const lame = isObj(v.lame) && nat(v.lame.encoderDelay) && nat(v.lame.padding) ? { encoderDelay: v.lame.encoderDelay, padding: v.lame.padding } : null;
  if (!lame) return `${id}: lame`;
  const prov = isObj(v.provenance) ? v.provenance : null;
  if (!prov || typeof prov.sha256 !== 'string' || !SHA.test(prov.sha256)) return `${id}: no provenance sha256`;
  if (prov.licence !== FLIP_PACK_LICENCE) return `${id}: licence is not "${FLIP_PACK_LICENCE}"`;
  const item: FlipPackItem = {
    id, kind: k, title: v.title as string, url: `${FLIP_PACK_AUDIO}${id}.mp3`, durationSec: v.durationSec, samples,
    channels: v.channels, suggestedPads: [...sp] as number[], tags, lame, sha256: prov.sha256,
  };
  if (v.bpm !== undefined) {
    if (!FLIP_PACK_BPMS.includes(v.bpm as number)) return `${id}: bpm ${String(v.bpm)} is not a whole-sample tempo`;
    item.bpm = v.bpm as number;
  }
  if (v.bars !== undefined) {
    if (v.bars !== 2 && v.bars !== 4) return `${id}: bars`;
    item.bars = v.bars;
  }
  if (isChoppable({ kind: k, sheet: v.sheet === true })) {
    if (item.bpm === undefined || item.bars === undefined) return `${id}: a chop source needs bpm and bars`;
    if (samples !== (item.bars * 240 * FLIP_PACK_RATE) / item.bpm) return `${id}: samples is not ${item.bars} bars at ${item.bpm} BPM`;
  }
  if (v.swing !== undefined) { if (!fin(v.swing) || v.swing <= 0.5 || v.swing > 0.75) return `${id}: swing`; item.swing = v.swing; }
  if (v.loop !== undefined) item.loop = v.loop === true;
  if (v.key !== undefined) { if (!text(v.key, 24)) return `${id}: key`; item.key = v.key; }
  if ((k === 'theme' || k === 'loop') && !item.key) return `${id}: a ${k} needs a key`;
  if (v.root !== undefined) { if (typeof v.root !== 'string' || !ROOT.test(v.root)) return `${id}: root`; item.root = v.root; }
  if (k === 'stab' && !item.root) return `${id}: a stab needs a root`;
  if (v.chord !== undefined) { if (!text(v.chord, 12)) return `${id}: chord`; item.chord = v.chord; }
  if (v.text !== undefined) { if (!text(v.text, 96)) return `${id}: text`; item.text = v.text; }
  if (v.voice !== undefined) { if (!text(v.voice, 24)) return `${id}: voice`; item.voice = v.voice; }
  if (v.sheet === true) {
    if (k !== 'chop') return `${id}: only a chop is a sheet`;
    item.sheet = true;
  }
  if (k === 'theme') {
    if (v.candidate !== 'a' && v.candidate !== 'b' && v.candidate !== 'c') return `${id}: candidate`;
    if (!text(v.character, 120)) return `${id}: character`;
    const lesson = readLesson(v.lesson, sp.length);
    if (typeof lesson === 'string') return `${id}: ${lesson}`;
    item.candidate = v.candidate; item.character = v.character; item.lesson = lesson;
  }
  return item;
}

/**
 * pack.json → the typed index. Items are checked one by one (CONTRACT §2–§8, the rules the app relies on) and a refused
 * item is left out and named in `problems`; a bank's pad that names no one-shot becomes an empty pad. Refused whole
 * (ok: false): not FEL's pack (`pack`, `licence`, `sampleRate`), or no usable item. Pure.
 */
export function parseFlipPack(raw: unknown): FlipPackParse {
  const problems: string[] = [];
  if (!isObj(raw)) return { ok: false, problems: ['pack.json is not an object'] };
  if (raw.pack !== 'fel_flip') return { ok: false, problems: [`not the FEL Flip pack (pack: ${JSON.stringify(raw.pack)})`] };
  if (raw.licence !== FLIP_PACK_LICENCE) return { ok: false, problems: [`the pack's licence is not "${FLIP_PACK_LICENCE}"`] };
  if (raw.sampleRate !== FLIP_PACK_RATE) return { ok: false, problems: ['the pack is not 44.1 kHz'] };
  if (!Array.isArray(raw.items)) return { ok: false, problems: ['pack.json has no items'] };
  const items: FlipPackItem[] = [];
  const byId = new Map<string, FlipPackItem>();
  for (const v of raw.items) {
    const it = readItem(v);
    if (typeof it === 'string') { problems.push(it); continue; }
    if (byId.has(it.id)) { problems.push(`${it.id}: listed twice`); continue; }
    items.push(it); byId.set(it.id, it);
  }
  if (!items.length) return { ok: false, problems: [...problems, 'no usable item'] };

  const banks: FlipPackBank[] = [];
  for (const b of Array.isArray(raw.banks) ? raw.banks : []) {
    if (!isObj(b) || typeof b.id !== 'string' || !BANK_ID.test(b.id) || !text(b.title, 24) || !Array.isArray(b.pads) || b.pads.length > PAD_COUNT) {
      problems.push(`bank ${isObj(b) ? String(b.id) : '?'}: unreadable`); continue;
    }
    if (b.id === FEL_808_KIT.id || b.id === FLIP_TEXTURE_KIT_ID || banks.some((x) => x.id === b.id)) { problems.push(`bank ${b.id}: id taken`); continue; }
    const pads = b.pads.map((p): string | null => {
      if (p === null) return null;
      const it = typeof p === 'string' ? byId.get(p) : undefined;
      if (it && isOneShot(it)) return it.id;
      problems.push(`bank ${b.id}: pad ${JSON.stringify(p)} is not a one-shot in the pack`);
      return null;
    });
    banks.push({ id: b.id, title: b.title, pads });
  }
  const textures = items.filter((it) => it.kind === 'texture').slice(0, PAD_COUNT);
  if (textures.length) banks.push({ id: FLIP_TEXTURE_KIT_ID, title: 'Textures', pads: textures.map((t) => t.id) });

  const named = Array.isArray(raw.themeCandidates) ? raw.themeCandidates.map((id) => (typeof id === 'string' ? byId.get(id) : undefined)) : [];
  const themes = (named.length ? named : items).filter((it): it is FlipPackItem => !!it && it.kind === 'theme');
  const wanted = typeof raw.themeDefault === 'string' ? raw.themeDefault : null;
  if (wanted !== null && !themes.some((t) => t.id === wanted)) problems.push(`themeDefault ${wanted} is not a theme candidate`);
  const themeDefault = themes.find((t) => t.id === wanted)?.id ?? themes[0]?.id ?? null;
  return {
    ok: true, problems,
    pack: {
      version: typeof raw.version === 'string' ? raw.version : '?', date: typeof raw.date === 'string' ? raw.date : '?',
      licence: FLIP_PACK_LICENCE, statement: typeof raw.statement === 'string' ? raw.statement : '',
      items, byId, banks, themes, themeDefault,
    },
  };
}

// ── cuts, kits and gapless decoding (pure) ────────────────────────────────────────────────────────────────────────

/**
 * FEL's cuts for an item as slices of a decode `length` samples long at `rate`: a chop source's `suggestedPads`, each
 * slice running to the next cut (the last to the end); anything else one slice, the whole file.
 */
export function itemCuts(item: Pick<FlipPackItem, 'kind' | 'sheet' | 'suggestedPads'>, rate: number, length: number): Slice[] {
  if (length <= 0 || rate <= 0) return [];
  const points = isChoppable(item) ? item.suggestedPads : [0];
  const starts = [...new Set(points.map((t) => Math.min(length - 1, Math.max(0, Math.round(t * rate)))))].sort((a, b) => a - b);
  return starts.map((s, i) => ({ start: s, end: i + 1 < starts.length ? starts[i + 1] : length }));
}

/**
 * Sixteen pads from cuts that may leave pads empty (a kit's null pad stays empty, in place).
 * MUSIC-SUITE P5 FIX PASS (2026-09-25): with `rate` (the decode's), a cut longer than GATE_MAX_S starts with its gate OFF.
 * Every pack pad was gate: true, and P5 bakes the gate into the grid row too (chopEdit.bakeChop), so a 4.8 s riser or
 * vinyl crackle from TEXTURES played its first 1.2 s, the 1.56 s orchestra hit and 1.27 s string stab were cut, and one of
 * the default theme's own pads (Sunday Tape, 1.67 s — decision #25) was cut in its lesson. A short cut keeps the gate on.
 */
export function padsFromCuts(cuts: readonly (Slice | null)[], rate?: number): Pad[] {
  const cap = rate && rate > 0 ? GATE_MAX_S * rate : Infinity;
  return Array.from({ length: PAD_COUNT }, (_, i) => {
    const c = cuts[i];
    return { slice: c ? { start: c.start, end: c.end } : null, pitch: 0, reverse: false, gate: !c || c.end - c.start <= cap };
  });
}

/** Files laid end to end: pad i = [offset, offset + length_i); a null (an empty pad) takes no room. */
export function joinCuts(lengths: readonly (number | null)[]): { cuts: (Slice | null)[]; total: number } {
  let at = 0;
  const cuts = lengths.slice(0, PAD_COUNT).map((n) => {
    if (n === null || n <= 0) return null;
    const c = { start: at, end: at + n };
    at += n;
    return c;
  });
  return { cuts, total: at };
}

/**
 * The part of a decode that is the file (CONTRACT §3.2): `samples` long at 44.1 kHz, scaled to the decode's rate. A
 * decoder that honours the LAME header returns exactly that (±1 sample of resampler rounding) — the window is the whole
 * decode. One that ignores it returns encoderDelay + 529 extra samples at the head (trimmed) and the padding at the tail
 * (cut). A short decode is kept as it is.
 */
export function gaplessWindow(decoded: number, rate: number, item: Pick<FlipPackItem, 'samples' | 'lame'>): { start: number; length: number; trimmed: boolean } {
  const want = Math.round((item.samples * rate) / FLIP_PACK_RATE);
  if (decoded <= want + 1) return { start: 0, length: Math.min(decoded, want), trimmed: false };
  const lead = Math.round(((item.lame.encoderDelay + MP3_DECODER_DELAY) * rate) / FLIP_PACK_RATE);
  return { start: Math.min(lead, decoded - want), length: want, trimmed: true };
}

const ITEM_URL = /^\/audio\/flip\/audio\/([a-z0-9_]{3,48})\.mp3$/;
const KIT_URL = /^\/audio\/flip\/banks\/(bank_[a-z0-9_]{1,40})$/;
/** The pack item a source URL plays, or null. */
export function packItemIdOf(url: string): string | null { return ITEM_URL.exec(url)?.[1] ?? null; }
/** The kit a source URL names (FLIP_KIT_PATH + id), or null. */
export function kitIdOf(url: string): string | null { return url.startsWith(FLIP_KIT_PATH) ? KIT_URL.exec(url)?.[1] ?? null : null; }

/** One pad of a kit: its file, and the pack item that says how long it is (null for an 808 stem, a plain WAV). */
export interface KitPadFile { url: string; item: FlipPackItem | null }
/** A kit's pads in order (null = an empty pad), or null when there is no such kit. The 808 kit needs no pack. */
export function kitPadFiles(pack: FlipPackIndex | null, kitId: string): (KitPadFile | null)[] | null {
  if (kitId === FEL_808_KIT.id) return FEL_808_KIT.pads.map((url) => ({ url, item: null }));
  const bank = pack?.banks.find((b) => b.id === kitId);
  if (!bank || !pack) return null;
  return bank.pads.map((id) => {
    const it = id ? pack.byId.get(id) : undefined;
    return it ? { url: it.url, item: it } : null;
  });
}

// ── loading and decoding (the async shell around the pure parts) ─────────────────────────────────────────────────

let packPromise: Promise<FlipPackIndex> | null = null;

/** pack.json, fetched and checked once per page (a failure can be tried again). */
export function loadFlipPack(fetchFn: typeof fetch = (...a) => fetch(...a)): Promise<FlipPackIndex> {
  if (packPromise) return packPromise;
  const p = (async (): Promise<FlipPackIndex> => {
    const r = await fetchFn(FLIP_PACK_URL);
    if (!r.ok) throw new Error(`the FEL pack answered ${r.status}`);
    const parsed = parseFlipPack(await r.json());
    if (!parsed.ok) throw new Error(parsed.problems[0] ?? 'the FEL pack is unreadable');
    return parsed.pack;
  })();
  packPromise = p;
  p.catch(() => { if (packPromise === p) packPromise = null; });
  return p;
}
/** Tests: forget the page's pack. */
export function resetFlipPackCache(): void { packPromise = null; }

/** The slice of a BaseAudioContext decoding needs (a test hands in its own). */
export interface PackDecodeContext {
  decodeAudioData(bytes: ArrayBuffer): Promise<AudioBuffer>;
  createBuffer(channels: number, length: number, sampleRate: number): AudioBuffer;
}
/** A pack source ready for the pads: one mono buffer and FEL's cuts on it (FlipPad DecodedSource + cuts). */
export interface PackDecoded { buffer: AudioBuffer; mono: Float32Array; cuts: (Slice | null)[] }

function mixDown(b: Pick<AudioBuffer, 'numberOfChannels' | 'length' | 'getChannelData'>): Float32Array {
  const m = new Float32Array(b.length);
  for (let c = 0; c < b.numberOfChannels; c++) { const ch = b.getChannelData(c); for (let i = 0; i < m.length; i++) m[i] += ch[i] / b.numberOfChannels; }
  return m;
}

async function fetchDecode(ctx: PackDecodeContext, url: string, fetchFn: typeof fetch): Promise<AudioBuffer> {
  const r = await fetchFn(url);
  if (!r.ok) throw new Error(`${url.split('/').pop()} answered ${r.status}`);
  return ctx.decodeAudioData(await r.arrayBuffer());
}

/** A decode as the file (gapless window for a pack item; a plain WAV as it is), mono. */
async function padAudio(ctx: PackDecodeContext, f: KitPadFile, fetchFn: typeof fetch): Promise<{ mono: Float32Array; rate: number }> {
  const b = await fetchDecode(ctx, f.url, fetchFn);
  const mono = mixDown(b);
  if (!f.item) return { mono, rate: b.sampleRate };
  const w = gaplessWindow(mono.length, b.sampleRate, f.item);
  return { mono: mono.slice(w.start, w.start + w.length), rate: b.sampleRate };
}

/**
 * MUSIC-SUITE P5: decode a Flip source the pack owns — a pack item (its gapless file, cut on FEL's cuts) or a kit (its
 * pads' files joined end to end, one per pad). Null = not a pack URL. A kit that can't be built rejects with the reason.
 * MUSIC-SUITE P5 FIX PASS (2026-09-25): so does a pack ITEM when pack.json can't be had (or no longer lists it). It was
 * null, and the room decoded the MP3 the plain way and CACHED that for the room's life (only failures are evicted) — a
 * decoder that ignores the LAME header then shifts every saved FEL-cut chop by encoderDelay + 529 samples (Sunday Tape:
 * 1728 + 529 = 2257 ≈ 51 ms at 44.1 kHz: the previous chop's tail in, the chop's own end lost), under the same bakeKey.
 * Rejecting keeps it out of the cache; the room says it couldn't open and a retry fetches pack.json again (loadFlipPack
 * forgets a failed fetch).
 */
export async function decodeFlipPackSource(ctx: PackDecodeContext, url: string, deps: { fetch?: typeof fetch; pack?: () => Promise<FlipPackIndex> } = {}): Promise<PackDecoded | null> {
  const fetchFn = deps.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const getPack = deps.pack ?? (() => loadFlipPack(fetchFn));
  const itemId = packItemIdOf(url);
  if (itemId) {
    const pack = await getPack().catch((e: unknown) => { throw new Error(`the FEL pack's index could not be read (${(e as Error)?.message ?? 'offline'}) — try again`); });
    const item = pack.byId.get(itemId);
    if (!item) throw new Error('that sound is not in the FEL pack any more');
    const { mono, rate } = await padAudio(ctx, { url: item.url, item }, fetchFn);
    const buffer = ctx.createBuffer(1, Math.max(1, mono.length), rate);
    buffer.copyToChannel(mono, 0);
    return { buffer, mono, cuts: itemCuts(item, rate, mono.length) };
  }
  const kitId = kitIdOf(url);
  if (!kitId) return null;
  const pack = kitId === FEL_808_KIT.id ? null : await getPack();
  const files = kitPadFiles(pack, kitId);
  if (!files) throw new Error('that kit is not in the FEL pack');
  const decoded = await Promise.all(files.map((f) => (f ? padAudio(ctx, f, fetchFn) : Promise.resolve(null))));
  const rate = decoded.find((d) => d)?.rate;
  if (!rate) throw new Error('the kit has no sounds');
  if (decoded.some((d) => d && d.rate !== rate)) throw new Error('the kit decoded at two rates');
  const { cuts, total } = joinCuts(decoded.map((d) => (d ? d.mono.length : null)));
  const mono = new Float32Array(Math.max(1, total));
  decoded.forEach((d, i) => { const c = cuts[i]; if (d && c) mono.set(d.mono, c.start); });
  const buffer = ctx.createBuffer(1, mono.length, rate);
  buffer.copyToChannel(mono, 0);
  return { buffer, mono, cuts };
}

// ── the FEL-theme lesson ─────────────────────────────────────────────────────────────────────────────────────────

/** A pad to play `at` seconds after the lesson's PLAY. */
export interface LessonHit { at: number; pad: number }

/** Pads 1→N in order, each at its own cut: the theme played back from its pads (4 bars, the tempo it was written at). */
export function lessonInOrder(item: Pick<FlipPackItem, 'suggestedPads' | 'lesson'>): LessonHit[] {
  return (item.lesson?.playInOrder ?? []).filter((p) => p < item.suggestedPads.length).map((pad) => ({ at: item.suggestedPads[pad], pad }));
}

/**
 * The lesson's re-flip: its 16 steps at the theme's tempo and swing, `bars` times. A 16th is 60 / bpm / 4 s; with MPC
 * swing s, every off 16th lands at s of its 8th (0.54 → 8 % of a 16th late), the way the theme itself was written.
 */
export function lessonFlip(item: Pick<FlipPackItem, 'bpm' | 'swing' | 'lesson'>, bars = 2): LessonHit[] {
  const pattern = item.lesson?.flipPattern ?? [];
  const step = 60 / (item.bpm ?? 90) / 4;
  const swing = item.swing ?? 0.5;
  const out: LessonHit[] = [];
  for (let b = 0; b < bars; b++) {
    pattern.forEach((pad, s) => {
      if (pad === null) return;
      const inBar = s % 2 === 0 ? s * step : (s - 1) * step + 2 * swing * step;
      out.push({ at: b * 16 * step + inBar, pad });
    });
  }
  return out;
}

/** The re-flip as the card writes it: pad numbers counted from 1, '·' for a rest. */
export function flipPatternCells(lesson: Pick<FlipLesson, 'flipPattern'>): string[] {
  return lesson.flipPattern.map((p) => (p === null ? '·' : String(p + 1)));
}

/** The lesson card is remembered per player: dismissed once, it stays closed for that player on this device. */
export const FLIP_LESSON_KEY = 'fel_flip_lesson_v1';
export interface LessonStore { getItem(key: string): string | null; setItem(key: string, value: string): void }
export function lessonKey(playerId: string | null | undefined): string { return `${FLIP_LESSON_KEY}:${playerId || 'guest'}`; }
/** Has this player closed the lesson? Unreadable storage = no (the card shows; a close then lasts the visit). */
export function lessonDismissed(store: LessonStore | null, playerId: string | null | undefined): boolean {
  try { return !!store?.getItem(lessonKey(playerId)); } catch { return false; }
}
/**
 * MUSIC-SUITE P5 FIX PASS (2026-09-25): the lesson puts the default theme on the pads ONCE per player. It was once per
 * FlipPad MOUNT, and FlipPad remounts on every FLIP visit — so until GOT IT every visit with the banks empty loaded the
 * theme again (an autosaved edit and an undo step: CLEAR BANK A, go to STUDIO, come back, the theme was back), and every
 * new project got it too. The brief said "on a player's first visit".
 */
export function lessonAutoKey(playerId: string | null | undefined): string { return `${FLIP_LESSON_KEY}:auto:${playerId || 'guest'}`; }
export function lessonAutoLoaded(store: LessonStore | null, playerId: string | null | undefined): boolean {
  try { return !!store?.getItem(lessonAutoKey(playerId)); } catch { return false; }
}
export function rememberLessonAutoLoaded(store: LessonStore | null, playerId: string | null | undefined, now = Date.now()): boolean {
  try { if (!store) return false; store.setItem(lessonAutoKey(playerId), new Date(now).toISOString()); return true; } catch { return false; }
}

/** Remember the close. False when the device would not keep it. */
export function rememberLessonDismissed(store: LessonStore | null, playerId: string | null | undefined, now = Date.now()): boolean {
  try { if (!store) return false; store.setItem(lessonKey(playerId), new Date(now).toISOString()); return true; } catch { return false; }
}
