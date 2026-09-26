// MUSIC-SUITE P5 (2026-09-25), flip-content: the FEL Flip pack as the app reads it — the real public/audio/flip/pack.json
// through parseFlipPack, the shelf (Flip.ts FEL_SOURCES) pinned to it, and the pure cut / kit / gapless / lesson parts.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FEL_808_KIT, FEL_SOURCES, FLIP_SHELF_GROUPS, FLIP_TEXTURE_KIT_ID, GATE_MAX_S, PAD_COUNT } from './Flip';
import {
  FLIP_PACK_RATE, MP3_DECODER_DELAY, decodeFlipPackSource, flipPatternCells, gaplessWindow, isChoppable, isOneShot, itemCuts,
  joinCuts, kitIdOf, kitPadFiles, lessonAutoLoaded, lessonDismissed, lessonFlip, lessonInOrder, lessonKey, packItemIdOf, padsFromCuts, rememberLessonAutoLoaded,
  parseFlipPack, rememberLessonDismissed, type FlipPackIndex, type PackDecodeContext,
} from './flipPack';
import { migrateProject, newProject } from './StudioProject';

const APP = path.resolve(__dirname, '../../..');
const RAW = JSON.parse(fs.readFileSync(path.join(APP, 'public/audio/flip/pack.json'), 'utf8')) as Record<string, unknown> & { items: Record<string, unknown>[] };
const parsed = parseFlipPack(RAW);
if (!parsed.ok) throw new Error(`pack.json refused: ${parsed.problems.join('; ')}`);
const PACK: FlipPackIndex = parsed.pack;
const clone = (): typeof RAW => JSON.parse(JSON.stringify(RAW)) as typeof RAW;

describe('the shipped pack, as the app reads it', () => {
  it('reads with no problem: 69 items, the kinds the contract counts, FEL original', () => {
    expect(parsed.ok && parsed.problems).toEqual([]);
    expect(PACK.items).toHaveLength(69);
    const kinds: Record<string, number> = {};
    for (const it of PACK.items) kinds[it.kind] = (kinds[it.kind] ?? 0) + 1;
    expect(kinds).toEqual({ theme: 3, loop: 10, stab: 5, hit: 9, chop: 39, texture: 3 });
    expect(PACK.items.filter((i) => i.sheet)).toHaveLength(3);
    expect(PACK.licence).toBe('FEL original, generated');
    for (const it of PACK.items) expect(fs.existsSync(path.join(APP, 'public', it.url)), it.url).toBe(true);
  });

  it('the FEL theme: three candidates with a lesson each, Sunday Tape the default (owner decision #25)', () => {
    expect(PACK.themes.map((t) => [t.id, t.candidate])).toEqual([['theme_a_sunday_tape', 'a'], ['theme_b_skyline', 'b'], ['theme_c_dust_strings', 'c']]);
    expect(PACK.themeDefault).toBe('theme_a_sunday_tape');
    expect(RAW.themeDefault).toBe('theme_a_sunday_tape');   // the one line the owner switches
    const a = PACK.byId.get('theme_a_sunday_tape')!;
    expect({ bpm: a.bpm, key: a.key, bars: a.bars, pads: a.suggestedPads.length, swing: a.swing }).toEqual({ bpm: 90, key: 'Eb major', bars: 4, pads: 16, swing: 0.54 });
    for (const t of PACK.themes) {
      expect(t.lesson!.playInOrder).toEqual(t.suggestedPads.map((_, i) => i));   // pads 1→N replay the whole theme
      expect(t.lesson!.flipPattern).toHaveLength(16);
      expect(t.lesson!.tip.length).toBeLessThanOrEqual(140);
    }
  });

  it('kits: the four pack banks hold only one-shots, every one-shot is on a kit, and the textures get their own', () => {
    expect(PACK.banks.map((b) => b.id)).toEqual(['bank_kit_fel', 'bank_vox_bright', 'bank_vox_deep', 'bank_vox_warm', FLIP_TEXTURE_KIT_ID]);
    const onKits = new Set(PACK.banks.flatMap((b) => b.pads.filter((p): p is string => !!p)));
    for (const it of PACK.items) {
      if (isOneShot(it) || it.kind === 'texture') expect(onKits.has(it.id), it.id).toBe(true);
      else expect(isChoppable(it), it.id).toBe(true);
    }
    for (const b of PACK.banks) expect(b.pads.length).toBeLessThanOrEqual(PAD_COUNT);
  });
});

describe('the shelf (Flip.ts FEL_SOURCES) is the pack, grouped by kind — pinned so the two can never drift', () => {
  const shelf = new Map(FEL_SOURCES.map((s) => [s.id, s]));
  it('every chop source in the pack is on the shelf with its title; every kit too; the 808 kit stays', () => {
    expect(shelf.size).toBe(FEL_SOURCES.length);   // ids unique
    for (const it of PACK.items.filter(isChoppable)) {
      expect(shelf.get(it.id), it.id).toMatchObject({ label: it.title, url: it.url, kind: 'fel' });
    }
    for (const b of PACK.banks) expect(shelf.get(b.id), b.id).toMatchObject({ label: b.title, url: `/audio/flip/banks/${b.id}`, kind: 'fel' });
    expect(shelf.get(FEL_808_KIT.id)).toMatchObject({ label: '808 Kit', group: 'kits' });
    for (const u of FEL_808_KIT.pads) expect(fs.existsSync(path.join(APP, 'public', u)), u).toBe(true);
    // and nothing on the shelf that the pack doesn't have
    for (const s of FEL_SOURCES) expect(s.id === FEL_808_KIT.id || PACK.byId.has(s.id) || PACK.banks.some((b) => b.id === s.id), s.id).toBe(true);
  });

  it('grouped by kind: THEMES, LOOPS, VOX (sheets + vox kits), KITS, TEXTURES — no 808 one-shot left as a chop source', () => {
    const group = (g: string) => FEL_SOURCES.filter((s) => s.group === g).map((s) => s.id);
    expect(group('themes')).toEqual(PACK.themes.map((t) => t.id));
    expect(group('loops')).toEqual(PACK.items.filter((i) => i.kind === 'loop').map((i) => i.id));
    expect(group('vox')).toEqual([...PACK.items.filter((i) => i.sheet).map((i) => i.id), 'bank_vox_bright', 'bank_vox_deep', 'bank_vox_warm']);
    expect(group('kits')).toEqual(['bank_kit_fel', 'bank_808']);
    expect(group('textures')).toEqual([FLIP_TEXTURE_KIT_ID]);
    expect(FLIP_SHELF_GROUPS.map((g) => g.id)).toEqual(['themes', 'loops', 'vox', 'kits', 'textures', 'public-domain']);
    expect(FEL_SOURCES.some((s) => s.url?.startsWith('/audio/kits/808/'))).toBe(false);
  });

  it('every shelf source survives the project\'s door (a saved project reopens on it)', () => {
    for (const s of FEL_SOURCES) {
      const p = newProject({ now: 1 });
      const m = migrateProject(JSON.parse(JSON.stringify({ ...p, flip: { ...p.flip, source: { id: s.id, label: s.label, kind: s.kind, note: s.note, url: s.url } } })), { now: 2 });
      expect(m.ok && m.project.flip.source?.url, s.id).toBe(s.url);
    }
  });
});

describe('parseFlipPack refuses what is not FEL\'s own, item by item', () => {
  it('a pack that is not FEL\'s, not "FEL original, generated", or not 44.1 kHz is refused whole', () => {
    expect(parseFlipPack({ ...clone(), pack: 'someone_else' }).ok).toBe(false);
    expect(parseFlipPack({ ...clone(), licence: 'CC-BY' }).ok).toBe(false);
    expect(parseFlipPack({ ...clone(), sampleRate: 48000 }).ok).toBe(false);
    expect(parseFlipPack(null).ok).toBe(false);
  });

  it('a bad item is left out and named; the rest still load', () => {
    const raw = clone();
    const loop = raw.items.find((i) => i.id === 'loop_arp_pluck')!;
    (loop.provenance as Record<string, unknown>).licence = 'unknown';
    const hit = raw.items.find((i) => i.id === 'hit_kick_dusty')!;
    hit.suggestedPads = [0.05];
    const r = parseFlipPack(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.pack.byId.has('loop_arp_pluck')).toBe(false);
    expect(r.pack.byId.has('hit_kick_dusty')).toBe(false);
    expect(r.problems.join('\n')).toMatch(/loop_arp_pluck: licence/);
    expect(r.problems.join('\n')).toMatch(/hit_kick_dusty: suggestedPads/);
    expect(r.pack.banks.find((b) => b.id === 'bank_kit_fel')!.pads[0]).toBeNull();   // its kit pad goes empty, in place
    expect(r.pack.items).toHaveLength(67);
  });

  it('a lesson that names a pad the theme lacks drops the theme; a themeDefault that is no candidate falls back', () => {
    const raw = clone();
    const b = raw.items.find((i) => i.id === 'theme_b_skyline')!;
    (b.lesson as { flipPattern: (number | null)[] }).flipPattern[0] = 15;   // skyline has 15 pads (0..14)
    raw.themeDefault = 'theme_z';
    const r = parseFlipPack(raw);
    if (!r.ok) throw new Error('refused');
    expect(r.pack.themes.map((t) => t.id)).toEqual(['theme_a_sunday_tape', 'theme_c_dust_strings']);
    expect(r.pack.themeDefault).toBe('theme_a_sunday_tape');
    expect(r.problems.join('\n')).toMatch(/theme_b_skyline: lesson\.flipPattern names a pad/);
    expect(r.problems.join('\n')).toMatch(/themeDefault theme_z/);
  });

  it('a kit pad that names a loop is emptied (a kit holds one-shots only)', () => {
    const raw = clone();
    const banks = raw.banks as { id: string; pads: (string | null)[] }[];
    banks[0].pads[14] = 'loop_ep_soul';
    const r = parseFlipPack(raw);
    if (!r.ok) throw new Error('refused');
    expect(r.pack.banks[0].pads[14]).toBeNull();
    expect(r.problems.join()).toMatch(/not a one-shot/);
  });
});

describe('cuts, kits and gapless decoding (pure)', () => {
  it('a theme cuts on FEL\'s cuts at the decode\'s rate: pad 1 at sample 0, contiguous, the last to the end', () => {
    const a = PACK.byId.get('theme_a_sunday_tape')!;
    for (const rate of [44100, 48000]) {
      const len = Math.round((a.samples * rate) / FLIP_PACK_RATE);
      const cuts = itemCuts(a, rate, len);
      expect(cuts).toHaveLength(16);
      expect(cuts[0].start).toBe(0);
      for (let i = 1; i < cuts.length; i++) expect(cuts[i].start).toBe(cuts[i - 1].end);
      expect(cuts[15].end).toBe(len);
      expect(cuts[4].start).toBe(Math.round(a.suggestedPads[4] * rate));
    }
    // a one-shot is one pad, the whole file
    expect(itemCuts(PACK.byId.get('stab_ep_cm9')!, 48000, 1000)).toEqual([{ start: 0, end: 1000 }]);
    expect(itemCuts(PACK.byId.get('stab_ep_cm9')!, 48000, 0)).toEqual([]);
  });

  it('kits join their files end to end: each pad is exactly one file; an empty pad stays empty, in place', () => {
    expect(joinCuts([10, null, 5])).toEqual({ cuts: [{ start: 0, end: 10 }, null, { start: 10, end: 15 }], total: 15 });
    const pads = padsFromCuts([{ start: 0, end: 10 }, null, { start: 10, end: 15 }]);
    expect(pads).toHaveLength(PAD_COUNT);
    expect(pads.map((p) => p.slice)).toEqual([{ start: 0, end: 10 }, null, { start: 10, end: 15 }, ...Array(13).fill(null)]);
    expect(pads[0]).toMatchObject({ pitch: 0, reverse: false, gate: true });
  });

  // MUSIC-SUITE P5 FIX PASS (2026-09-25): every pack pad was gated at 1.2 s — and P5 bakes the gate into the row too — so a
  // 4.8 s riser played 1.2 s, and one of Sunday Tape's own pads (1.67 s, the default theme) was cut in its lesson
  it('a cut longer than the gate (GATE_MAX_S) starts with the gate off; the textures and the theme\'s long pad play whole', () => {
    const r = 44100;
    const pads = padsFromCuts([{ start: 0, end: Math.round(1.1 * r) }, { start: 0, end: Math.round(4.8 * r) }, null], r);
    expect(pads.slice(0, 3).map((p) => p.gate)).toEqual([true, false, true]);
    expect(padsFromCuts([{ start: 0, end: 10 * r }]).map((p) => p.gate)[0]).toBe(true);   // no rate given: as before
    const tape = PACK.byId.get('theme_a_sunday_tape')!;
    const tapePads = padsFromCuts(itemCuts(tape, r, tape.samples), r);
    const long = tapePads.filter((p) => p.slice && p.slice.end - p.slice.start > GATE_MAX_S * r);
    expect(long.length).toBeGreaterThan(0);
    expect(long.every((p) => !p.gate)).toBe(true);
    const riser = PACK.byId.get('tex_riser')!;
    expect(padsFromCuts(itemCuts(riser, r, riser.samples), r)[0].gate).toBe(false);
  });

  // MUSIC-SUITE P5 FIX PASS (2026-09-25): a pack source is stored as {id, url} and every saved bank, kit, row, section chop
  // and published chop holds SAMPLE POSITIONS into its decode (a kit's: its files end to end, in bank order). A re-render
  // that changes an item's length or cuts, or a bank whose pads move, would silently re-cut the player's saved work — so
  // pack 1.0.0's lengths, FEL cuts and bank orders are pinned. Changing them needs new ids / paths (a pack 2) or a migration.
  it('PINNED (pack 1.0.0): every item\'s length and FEL cuts, every bank\'s pad order', () => {
    const items = RAW.items.map((i) => [i.id, i.samples, i.suggestedPads]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    const banks = (RAW.banks as { id: string; pads: unknown[] }[]).map((b) => [b.id, b.pads]);
    expect(RAW.version).toBe('1.0.0');
    expect(items).toHaveLength(69);
    expect(createHash('sha256').update(JSON.stringify({ items, banks })).digest('hex')).toBe('d0bc329679d344d33f3e5a1d28c3b7c641020ed88053fc3dab8792fd8800729f');
  });

  it('the gapless window: an honest decode is kept whole; one that ignored the LAME header is trimmed to the file', () => {
    const it = { samples: 470400, lame: { encoderDelay: 1728, padding: 2496 } };
    expect(gaplessWindow(470400, 44100, it)).toEqual({ start: 0, length: 470400, trimmed: false });
    expect(gaplessWindow(470401, 44100, it)).toEqual({ start: 0, length: 470400, trimmed: false });   // resampler rounding
    const sloppy = 470400 + 1728 + MP3_DECODER_DELAY + 2496;
    expect(gaplessWindow(sloppy, 44100, it)).toEqual({ start: 1728 + 529, length: 470400, trimmed: true });
    const at48 = Math.round((sloppy * 48000) / 44100);
    expect(gaplessWindow(at48, 48000, it)).toEqual({ start: Math.round((2257 * 48000) / 44100), length: 512000, trimmed: true });
    expect(gaplessWindow(1000, 44100, it)).toEqual({ start: 0, length: 1000, trimmed: false });      // short: as it is
  });

  it('source URLs: a pack item, a kit, or neither', () => {
    expect(packItemIdOf('/audio/flip/audio/theme_a_sunday_tape.mp3')).toBe('theme_a_sunday_tape');
    expect(packItemIdOf('/audio/kits/808/kick.wav')).toBeNull();
    expect(kitIdOf('/audio/flip/banks/bank_kit_fel')).toBe('bank_kit_fel');
    expect(kitIdOf('/audio/flip/banks/../x')).toBeNull();
    expect(kitPadFiles(null, 'bank_808')!.map((f) => f!.url)).toEqual([...FEL_808_KIT.pads]);
    expect(kitPadFiles(null, 'bank_kit_fel')).toBeNull();                  // a pack kit needs the pack
    expect(kitPadFiles(PACK, 'bank_kit_fel')!.filter((f) => f === null)).toHaveLength(2);
    expect(kitPadFiles(PACK, 'bank_nope')).toBeNull();
  });
});

// ── the async shell, on a fake context ───────────────────────────────────────────────────────────────────────────

class Buf {
  data: Float32Array[];
  constructor(public numberOfChannels: number, public length: number, public sampleRate: number) { this.data = Array.from({ length: numberOfChannels }, () => new Float32Array(length)); }
  getChannelData(c: number): Float32Array { return this.data[c]; }
  copyToChannel(src: Float32Array, c: number): void { this.data[c].set(src.subarray(0, this.length)); }
  get duration(): number { return this.length / this.sampleRate; }
}
/** A context whose decoder returns, per URL, a buffer `extra` samples longer at the head than the file (a sloppy decoder when > 0). */
function fakeCtx(rate: number, lengths: Record<string, { samples: number; extra: number; channels?: number }>): PackDecodeContext & { decoded: string[] } {
  const decoded: string[] = [];
  return {
    decoded,
    async decodeAudioData(bytes: ArrayBuffer) {
      const url = new TextDecoder().decode(bytes);
      decoded.push(url);
      const L = lengths[url];
      const n = Math.round((L.samples * rate) / FLIP_PACK_RATE) + L.extra;
      const b = new Buf(L.channels ?? 1, n, rate);
      b.getChannelData(0)[L.extra] = 1;            // the file's first sample, after any priming
      b.getChannelData(0).fill(0.5, L.extra + 1);  // the rest of the file
      return b as unknown as AudioBuffer;
    },
    createBuffer: (ch: number, len: number, r: number) => new Buf(ch, len, r) as unknown as AudioBuffer,
  };
}
const fakeFetch = (fail = new Set<string>()): typeof fetch => (async (u: RequestInfo | URL) => {
  const url = String(u);
  if (fail.has(url)) return { ok: false, status: 404 } as Response;
  return { ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode(url).buffer } as unknown as Response;
}) as typeof fetch;

describe('decodeFlipPackSource', () => {
  const a = PACK.byId.get('theme_a_sunday_tape')!;
  it('a theme: its gapless file, mono, cut on FEL\'s cuts — and a sloppy decoder is trimmed back to the downbeat', async () => {
    for (const extra of [0, Math.round(((a.lame.encoderDelay + MP3_DECODER_DELAY) * 48000) / 44100)]) {
      const ctx = fakeCtx(48000, { [a.url]: { samples: a.samples, extra, channels: 2 } });
      const d = await decodeFlipPackSource(ctx, a.url, { fetch: fakeFetch(), pack: async () => PACK });
      expect(d).not.toBeNull();
      expect(d!.mono.length).toBe(512000);                   // 470,400 at 44.1 kHz = 512,000 at 48 kHz
      expect(d!.mono[0]).toBeCloseTo(0.5);                   // the file's first sample (mono of 1 and 0) is pad 1's
      expect(d!.buffer.numberOfChannels).toBe(1);
      expect(d!.cuts).toHaveLength(16);
      expect(d!.cuts[0]).toEqual({ start: 0, end: Math.round(a.suggestedPads[1] * 48000) });
    }
  });

  it('a kit: its pads\' files joined, one per pad, in the kit\'s order', async () => {
    const kit = PACK.banks.find((b) => b.id === 'bank_kit_fel')!;
    const lengths = Object.fromEntries(kit.pads.filter((p): p is string => !!p).map((id) => [PACK.byId.get(id)!.url, { samples: PACK.byId.get(id)!.samples, extra: 0 }]));
    const d = await decodeFlipPackSource(fakeCtx(44100, lengths), '/audio/flip/banks/bank_kit_fel', { fetch: fakeFetch(), pack: async () => PACK });
    expect(d!.cuts.slice(14)).toEqual([null, null]);
    expect(d!.cuts[0]).toEqual({ start: 0, end: PACK.byId.get('hit_kick_dusty')!.samples });
    expect(d!.cuts[1]!.end - d!.cuts[1]!.start).toBe(PACK.byId.get('hit_snare_crack')!.samples);
    expect(d!.mono.length).toBe(kit.pads.reduce((n, id) => n + (id ? PACK.byId.get(id)!.samples : 0), 0));
    expect(d!.mono[d!.cuts[1]!.start]).toBe(1);             // pad 2 starts on its file's first sample
  });

  // MUSIC-SUITE P5 FIX PASS (2026-09-25): a pack item without pack.json was null → the room decoded it untrimmed and
  // cached that for the room's life (every saved FEL-cut chop 51 ms off on a decoder that ignores the LAME header)
  it('the 808 kit needs no pack; a pack item without the pack REJECTS (never an untrimmed decode); a missing kit file fails', async () => {
    const lengths = Object.fromEntries(FEL_808_KIT.pads.map((u) => [u, { samples: 4410, extra: 0 }]));
    const d = await decodeFlipPackSource(fakeCtx(44100, lengths), '/audio/flip/banks/bank_808', { fetch: fakeFetch(), pack: async () => { throw new Error('offline'); } });
    expect(d!.cuts.filter(Boolean)).toHaveLength(8);
    await expect(decodeFlipPackSource(fakeCtx(44100, {}), a.url, { fetch: fakeFetch(), pack: async () => { throw new Error('offline'); } })).rejects.toThrow(/index could not be read \(offline\)/);
    const without = { ...PACK, byId: new Map([...PACK.byId].filter(([id]) => id !== a.id)) };
    await expect(decodeFlipPackSource(fakeCtx(44100, {}), a.url, { fetch: fakeFetch(), pack: async () => without })).rejects.toThrow(/not in the FEL pack/);
    expect(await decodeFlipPackSource(fakeCtx(44100, {}), '/audio/kits/808/kick.wav', { fetch: fakeFetch(), pack: async () => PACK })).toBeNull();
    await expect(decodeFlipPackSource(fakeCtx(44100, lengths), '/audio/flip/banks/bank_808', { fetch: fakeFetch(new Set([FEL_808_KIT.pads[3]])) })).rejects.toThrow(/404/);
    await expect(decodeFlipPackSource(fakeCtx(44100, {}), '/audio/flip/banks/bank_nope', { fetch: fakeFetch(), pack: async () => PACK })).rejects.toThrow(/not in the FEL pack/);
  });
});

describe('the FEL-theme lesson', () => {
  const a = PACK.byId.get('theme_a_sunday_tape')!;
  it('pads 1→16 in order, each at its own cut: the theme played back from its pads', () => {
    const hits = lessonInOrder(a);
    expect(hits.map((h) => h.pad)).toEqual(Array.from({ length: 16 }, (_, i) => i));
    expect(hits.map((h) => h.at)).toEqual(a.suggestedPads);
  });

  it('the re-flip at the theme\'s tempo and swing, as the card writes it', () => {
    expect(flipPatternCells(a.lesson!)).toEqual(['1', '·', '·', '12', '·', '·', '8', '·', '·', '·', '4', '·', '5', '·', '·', '·']);
    const step = 60 / 90 / 4;
    const hits = lessonFlip(a, 2);
    expect(hits).toHaveLength(10);                                     // 5 hits a bar, 2 bars
    expect(hits[0]).toEqual({ at: 0, pad: 0 });
    expect(hits[1].pad).toBe(11);
    expect(hits[1].at).toBeCloseTo(2 * step + 2 * 0.54 * step, 9);     // step 3 is an off 16th: swung 54 %
    expect(hits[2].at).toBeCloseTo(6 * step, 9);                       // step 6 is on the beat
    expect(hits[5].at).toBeCloseTo(16 * step, 9);                      // bar 2 starts one bar later
  });

  it('is remembered per player: closed for one player stays open for another; a storage that throws never blocks', () => {
    const kv = new Map<string, string>();
    const store = { getItem: (k: string) => kv.get(k) ?? null, setItem: (k: string, v: string) => { kv.set(k, v); } };
    expect(lessonDismissed(store, 'u_ana')).toBe(false);
    expect(rememberLessonDismissed(store, 'u_ana', Date.UTC(2026, 8, 26))).toBe(true);
    expect(lessonDismissed(store, 'u_ana')).toBe(true);
    expect(lessonDismissed(store, 'u_ben')).toBe(false);
    expect(kv.get(lessonKey('u_ana'))).toBe('2026-09-26T00:00:00.000Z');
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(lessonDismissed(broken, 'u_ana')).toBe(false);
    expect(rememberLessonDismissed(broken, 'u_ana')).toBe(false);
    expect(lessonDismissed(null, null)).toBe(false);
  });

  // MUSIC-SUITE P5 FIX PASS (2026-09-25): the theme went back on the pads on EVERY FLIP visit until GOT IT (a per-mount
  // ref) — after the player cleared it too, and in every new project
  it('the theme auto-loads once per player (its own mark, apart from the lesson\'s close)', () => {
    const kv = new Map<string, string>();
    const store = { getItem: (k: string) => kv.get(k) ?? null, setItem: (k: string, v: string) => { kv.set(k, v); } };
    expect(lessonAutoLoaded(store, 'u_ana')).toBe(false);
    expect(rememberLessonAutoLoaded(store, 'u_ana', Date.UTC(2026, 8, 26))).toBe(true);
    expect(lessonAutoLoaded(store, 'u_ana')).toBe(true);
    expect(lessonAutoLoaded(store, 'u_ben')).toBe(false);
    expect(lessonDismissed(store, 'u_ana')).toBe(false);                 // the card stays open until GOT IT
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(lessonAutoLoaded(broken, 'u_ana')).toBe(false);
    expect(rememberLessonAutoLoaded(broken, 'u_ana')).toBe(false);
  });
});
