// chopEdit — THE CHOP EDITOR'S RULES (MUSIC-SUITE P5, "The Flip, for real", 2026-09-25). Pure: no AudioContext, no DOM,
// so every rule is tested in node (chopEdit.test.ts); FlipPad / ui/Waveform / StudioMode do the Web Audio and the pixels.
//
// What was wrong (read in the code and the P3 / P4 reports, 2026-09-25):
//   * NO EDITOR. A slice was wherever TRANSIENTS or GRID put it; the player could not see the sound, move a cut, add one
//     or take one away. Now: a waveform with draggable markers, + SLICE / − SLICE (moveEdge, splitPad, removePad).
//   * CLICKS. A pad buffer was the raw samples between two cuts (FlipPad chopBuffer), and a gated pad stopped with
//     node.stop — a hard cut at 1.2 s. A cut in the middle of a wave is a step, which is a click (flippack CONTRACT 12.4:
//     "slices are played with no fades"). Now every marker the player places snaps to the nearest zero crossing within
//     2 ms (zeroCrossingNear), and every chop edge gets a raised-cosine fade of 3 ms — 5 ms where the gate cuts a sound
//     off (applyEdgeFades).
//   * WHAT YOU TUNED WAS NOT WHAT YOU SEQUENCED. A pad played its slice at rateForPitch(pitch), gated at 1.2 s; the grid
//     row it was sent to loaded the RAW slice (FlipPad.tsx:84-88 chopBuffer, StudioMode chopFor) — no gate ("gate is pad
//     only"), and the pitch only as the steps' notes, so a REPLACE ROW at another pitch kept the old one. bakeChop makes
//     ONE buffer with pitch, gate, reverse and the fades in it; the pad plays it and the row plays it (live == grid).
//   * A TAP LANDED A STEP LATE. ARM REC wrote `quantizeTap(playhead)`, and the playhead is the last step that has already
//     sounded (AudioEngine onStep, after the step's time) — so a tap 20 ms before the beat landed on the step before it.
//     recordStep reads the audio clock: the step whose time is NEAREST the tap (QUANTIZE on), or the step the tap falls
//     in (QUANTIZE off), from the steps the engine has actually scheduled (swing included).
//   * DECODED SOURCES WERE KEPT FOR THE ROOM'S LIFE (P3 deferred): the room's cache only grew. liveSourceKeys says which
//     sources the open project still plays; the room drops the rest (pruneMap) when a bank is cleared or a project closes.
import { GATE_MAX_S, PAD_COUNT, rateForPitch, sliceSamples, type Pad, type Slice } from './Flip';
import {
  BANK_LETTERS, flipBanks, rowOrigin,
  type ProjectFlipBank, type ProjectFlipRow, type ProjectFlipSource, type ProjectSection, type StudioProject,
} from './StudioProject';

/** A marker the player places snaps to a zero crossing no further than this. */
export const SNAP_MS = 2;
/** The fade on every chop edge (raised cosine), and the longer one where the gate cuts a sound off. */
export const FADE_MS = 3;
export const GATE_FADE_MS = 5;
/** No slice is shorter than this (an edit that would make one stops at it). */
export const MIN_SLICE_MS = 10;
/** Bump when the bake changes, so a cached baked buffer is never reused across a change. */
export const BAKE_VERSION = 1;

// ── sources (moved here from FlipPad so the rules and the room share them; FlipPad re-exports them) ────────────────────

/**
 * A source ready to chop: its decoded buffer and a mono copy of it. MUSIC-SUITE P5: `cuts` = the source's own cut points
 * when it has them (a FEL pack item's "FEL cuts", a pack kit's file boundaries — flipPack.PackDecoded), which the FLIP
 * tab loads by default (slicing 'cuts') instead of running the finder.
 */
export interface DecodedSource { buffer: AudioBuffer; mono: Float32Array; cuts?: (Slice | null)[] }

/** The key a decoded source is cached under: its saved bytes, else its first-party path, else its id. */
export function sourceKey(src: Pick<ProjectFlipSource, 'id' | 'url' | 'audio'>): string { return src.audio?.key ?? src.url ?? src.id; }

/** Every channel averaged into one (the Flip slices and plays mono). */
export function monoOf(buf: Pick<AudioBuffer, 'numberOfChannels' | 'length' | 'getChannelData'>): Float32Array {
  const m = new Float32Array(buf.length);
  for (let c = 0; c < buf.numberOfChannels; c++) { const ch = buf.getChannelData(c); for (let i = 0; i < m.length; i++) m[i] += ch[i] / buf.numberOfChannels; }
  return m;
}

/**
 * MUSIC-SUITE P3 FIX PASS: a slice counted at `from` Hz, in samples at `to` Hz (the source decoded at another rate).
 * Undefined / equal rates = the slice as it is.
 */
export function sliceAtRate(slice: Slice, from: number | undefined, to: number): Slice {
  if (!from || !to || from === to) return slice;
  const k = to / from;
  const start = Math.max(0, Math.round(slice.start * k));
  return { start, end: Math.max(start + 1, Math.round(slice.end * k)) };
}

export const msToSamples = (ms: number, rate: number): number => Math.round((ms * rate) / 1000);
export const minSliceSamples = (rate: number): number => Math.max(1, msToSamples(MIN_SLICE_MS, rate));
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

// ── samples: the zero-crossing snap, the fades, the bake ────────────────────────────────────────────────────────────

/**
 * The sample index nearest `at` (within `radius` samples, and inside [lo, hi]) where the wave crosses zero — of the two
 * samples either side of the crossing, the one nearer zero. The file's own edges (0 and its length) count as crossings.
 * None in reach = `at`, clamped to [lo, hi].
 */
export function zeroCrossingNear(mono: Float32Array, at: number, radius: number, lo = 0, hi = mono.length): number {
  const target = clamp(Math.round(at), lo, hi);
  const a = Math.max(lo, target - radius), b = Math.min(hi, target + radius);
  let best = -1, bestD = Infinity;
  const consider = (j: number): void => {
    if (j < a || j > b) return;
    const d = Math.abs(j - target);
    if (d < bestD) { bestD = d; best = j; }
  };
  if (a <= 0) consider(0);
  if (b >= mono.length) consider(mono.length);
  for (let i = Math.max(a, 1); i <= b && i < mono.length; i++) {
    const p = mono[i - 1], q = mono[i];
    if (p === 0 || q === 0 || (p < 0) !== (q < 0)) consider(Math.abs(p) < Math.abs(q) ? i - 1 : i);
  }
  return best >= 0 ? best : target;
}

/** The fade length for a chop of `len` samples: `ms` at `rate`, never more than a quarter of the chop. */
export function fadeLength(len: number, rate: number, ms = FADE_MS): number {
  return Math.max(0, Math.min(msToSamples(ms, rate), Math.floor(len / 4)));
}

/**
 * Raised-cosine fades on both edges of `buf`, in place (returned): the first and last samples are 0. `outMs` is the
 * fade-out (GATE_FADE_MS when the gate cut the sound off mid-note).
 */
export function applyEdgeFades(buf: Float32Array, rate: number, outMs = FADE_MS): Float32Array {
  const fin = fadeLength(buf.length, rate), fout = fadeLength(buf.length, rate, outMs);
  for (let k = 0; k < fin; k++) buf[k] *= 0.5 - 0.5 * Math.cos((Math.PI * k) / fin);
  for (let k = 0; k < fout; k++) buf[buf.length - 1 - k] *= 0.5 - 0.5 * Math.cos((Math.PI * k) / fout);
  return buf;
}

/**
 * `s` played at `ratio` × speed (what AudioBufferSourceNode.playbackRate does), linearly interpolated: ratio 2 = an octave
 * up, half as long. The output's length is what the pad played: ⌊(n − 1) / ratio⌋ + 1 samples.
 */
export function resample(s: Float32Array, ratio: number): Float32Array {
  if (!(ratio > 0) || ratio === 1 || s.length <= 1) return s.slice();
  const n = Math.max(1, Math.floor((s.length - 1) / ratio) + 1);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i * ratio, k = Math.floor(x), f = x - k;
    out[i] = k + 1 < s.length ? s[k] * (1 - f) + s[k + 1] * f : s[s.length - 1];
  }
  return out;
}

/** What a chop is, for baking: its slice (counted at `rate`), pitch, reverse and gate. */
export type BakeSpec = Pick<Pad, 'pitch' | 'reverse' | 'gate'> & { slice: Slice; rate?: number };

/**
 * THE chop a pad plays and a grid row plays — one buffer (mono, at the decoded source's rate): the slice (reversed when
 * asked), at the pad's pitch, cut at GATE_MAX_S of what you hear when gated, with a fade on both edges (a longer one where
 * the gate cut it). A step at FLIP_ROOT_MIDI plays exactly this.
 */
export function bakeChop(mono: Float32Array, chop: BakeSpec, sourceRate: number): Float32Array {
  const raw = sliceSamples(mono, sliceAtRate(chop.slice, chop.rate, sourceRate), chop.reverse);
  let out = chop.pitch ? resample(raw, rateForPitch(chop.pitch)) : raw;
  let cut = false;
  if (chop.gate) {
    const cap = Math.max(1, Math.round(GATE_MAX_S * sourceRate));
    if (out.length > cap) { out = out.slice(0, cap); cut = true; }
  }
  if (!out.length) out = new Float32Array(1);
  return applyEdgeFades(out, sourceRate, cut ? GATE_FADE_MS : FADE_MS);
}

/** Everything that changes a baked chop's sound — the cache key for its buffer, and "is this the same chop?". */
export function bakeKey(c: BakeSpec & { source: Pick<ProjectFlipSource, 'id' | 'url' | 'audio'> }): string {
  return JSON.stringify([BAKE_VERSION, sourceKey(c.source), c.slice.start, c.slice.end, c.reverse, c.pitch, c.gate, c.rate ?? null]);
}

// MUSIC-SUITE P5 FIX PASS (2026-09-25): retunedRows is gone. It found rows whose pitch or gate an undo moved while
// studioEdit.chopSignature (source, slice, reverse, rate) stayed the same; the signature carries pitch and gate now, so
// changedFlipRows (reloadFlipRowSounds) reloads those rows itself.

/**
 * MUSIC-SUITE P5 FIX PASS (2026-09-25): what song mode does to the engine for a set of wanted rows (a section's chops, or
 * the grid's when song mode ends): LOAD each chop already baked, SILENCE a row whose chop could not be had (`failed`, by
 * bakeKey — never leave the chop that played before), and bake the PENDING rest (the room swaps again when each is ready,
 * with no bar line needed). `done` = nothing is pending, so the swap need not run again.
 */
export function planChopSwap<B>(want: readonly ProjectFlipRow[], baked: (key: string) => B | undefined, failed: ReadonlySet<string>):
  { load: { row: ProjectFlipRow; buffer: B }[]; silence: string[]; pending: ProjectFlipRow[]; done: boolean } {
  const load: { row: ProjectFlipRow; buffer: B }[] = [];
  const silence: string[] = [];
  const pending: ProjectFlipRow[] = [];
  for (const row of want) {
    const key = bakeKey(row);
    const buffer = baked(key);
    if (buffer !== undefined) load.push({ row, buffer });
    else if (failed.has(key)) silence.push(row.sampleId);
    else pending.push(row);
  }
  return { load, silence, pending, done: pending.length === 0 };
}

/**
 * MUSIC-SUITE P5 FIX PASS (2026-09-25; P4 deferred "a chop's own key"): the key a chop sounds in — its source's key
 * (ProjectFlipSource.key: 'Eb major', or a root note 'C4') moved by the pad's pitch, spelled with the source's own
 * accidentals (sharps if it used one, else flats). Null = the source's key is not known.
 */
export function chopKeyText(key: string | undefined, pitch: number): string | null {
  const m = key ? /^([A-G])([b#]?)(-?\d+)?(.*)$/.exec(key) : null;
  if (!m) return null;
  const BASE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const names = m[2] === '#' ? ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] : ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  const pc = BASE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  const shift = Math.round(Number.isFinite(pitch) ? pitch : 0);
  if (m[3] !== undefined) {                                  // a note: 'C4' + 13 = 'Db5'
    const midi = (Number(m[3]) + 1) * 12 + pc + shift;
    return `${names[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}${m[4]}`;
  }
  return `${names[(((pc + shift) % 12) + 12) % 12]}${m[4]}`;
}

// ── editing the slices ──────────────────────────────────────────────────────────────────────────────────────────────

export type Edge = 'start' | 'end';
/** A pad's region on the waveform (samples of the bank's source, at the rate it was decoded at). */
export interface Region { pad: number; start: number; end: number }

/** The pad whose slice ends where pad i's starts (edge 'start') or starts where it ends (edge 'end'); -1 = none. */
function linkedNeighbour(pads: readonly Pad[], i: number, edge: Edge): number {
  const p = pads[i];
  if (!p?.slice) return -1;
  const at = edge === 'start' ? p.slice.start : p.slice.end;
  return pads.findIndex((q, j) => j !== i && !!q.slice && (edge === 'start' ? q.slice.end === at : q.slice.start === at));
}

/**
 * Drag pad i's `edge` to sample `to` (of `mono`, at `rate`): snapped to the nearest zero crossing within SNAP_MS, never
 * making this pad (or the neighbour that shares the marker, which moves with it) shorter than MIN_SLICE_MS, never past
 * the file. Hands back `pads` itself when nothing moved (no empty undo step).
 */
export function moveEdge(pads: readonly Pad[], i: number, edge: Edge, to: number, mono: Float32Array, rate: number): Pad[] {
  const p = pads[i];
  if (!p?.slice || !Number.isFinite(to)) return pads as Pad[];
  const min = minSliceSamples(rate), r = msToSamples(SNAP_MS, rate);
  const { start, end } = p.slice;
  const nb = linkedNeighbour(pads, i, edge);
  const nbs = nb >= 0 ? pads[nb].slice! : null;
  const lo = edge === 'start' ? (nbs ? nbs.start + min : 0) : start + min;
  const hi = edge === 'start' ? end - min : (nbs ? nbs.end - min : mono.length);
  if (hi < lo) return pads as Pad[];
  const at = zeroCrossingNear(mono, clamp(to, lo, hi), r, lo, hi);
  if (at === (edge === 'start' ? start : end)) return pads as Pad[];
  const out = pads.slice();
  out[i] = { ...p, slice: edge === 'start' ? { start: at, end } : { start, end: at } };
  if (nb >= 0 && nbs) out[nb] = { ...pads[nb], slice: edge === 'start' ? { start: nbs.start, end: at } : { start: at, end: nbs.end } };
  return out;
}

/**
 * + SLICE: cut pad i's slice in two at `at` (snapped, each half at least MIN_SLICE_MS). The first half stays on pad i;
 * the second goes to the first EMPTY pad, with pad i's pitch / reverse / gate (it is the rest of the same chop). Pads are
 * never renumbered — a pad's key and its grid row stay where they are. Null when no pad is free or the slice is too short.
 */
export function splitPad(pads: readonly Pad[], i: number, at: number, mono: Float32Array, rate: number): { pads: Pad[]; added: number } | null {
  const p = pads[i];
  if (!p?.slice) return null;
  const added = pads.findIndex((q) => !q.slice);
  if (added < 0) return null;
  const min = minSliceSamples(rate);
  const lo = p.slice.start + min, hi = p.slice.end - min;
  if (hi < lo) return null;
  const cut = zeroCrossingNear(mono, clamp(Number.isFinite(at) ? at : (p.slice.start + p.slice.end) / 2, lo, hi), msToSamples(SNAP_MS, rate), lo, hi);
  const out = pads.slice();
  out[i] = { ...p, slice: { start: p.slice.start, end: cut } };
  out[added] = { ...p, slice: { start: cut, end: p.slice.end } };
  return { pads: out, added };
}

/**
 * − SLICE: pad i is emptied, and its stretch of sound goes to the pad that shared its left marker (the earlier chop grows
 * to cover it), else the one that shared its right marker — taking a marker away, as on an MPC. `merged` = that pad.
 */
export function removePad(pads: readonly Pad[], i: number): { pads: Pad[]; merged: number | null } {
  const p = pads[i];
  if (!p?.slice) return { pads: pads as Pad[], merged: null };
  const out = pads.slice();
  out[i] = { slice: null, pitch: 0, reverse: false, gate: true };
  const prev = linkedNeighbour(pads, i, 'start');
  if (prev >= 0) { out[prev] = { ...pads[prev], slice: { start: pads[prev].slice!.start, end: p.slice.end } }; return { pads: out, merged: prev }; }
  const next = linkedNeighbour(pads, i, 'end');
  if (next >= 0) { out[next] = { ...pads[next], slice: { start: p.slice.start, end: pads[next].slice!.end } }; return { pads: out, merged: next }; }
  return { pads: out, merged: null };
}

/**
 * Fresh slices (TRANSIENTS / GRID) with every inner cut snapped to a zero crossing within SNAP_MS — a shared cut moves for
 * both slices, and no slice is made shorter than MIN_SLICE_MS by it. The file's own start and end stay.
 */
export function snapSlices(slices: readonly Slice[], mono: Float32Array, rate: number): Slice[] {
  const min = minSliceSamples(rate), r = msToSamples(SNAP_MS, rate);
  const out = slices.map((s) => ({ ...s }));
  for (let i = 0; i < out.length; i++) {
    const s = out[i];
    if (s.start === 0) continue;
    const lo = i > 0 ? out[i - 1].start + min : 0, hi = s.end - min;
    if (hi < lo) continue;
    const b = zeroCrossingNear(mono, clamp(s.start, lo, hi), r, lo, hi);
    if (i > 0 && out[i - 1].end === s.start) out[i - 1].end = b;
    s.start = b;
  }
  return out;
}

/**
 * The marker under the pointer at sample `x` (within `tol` samples): the selected pad's own markers first, then the
 * nearest; at a marker two pads share, the pad on the pointer's side of it.
 */
export function edgeAt(regions: readonly Region[], x: number, tol: number, selected: number | null): { pad: number; edge: Edge } | null {
  let best: { pad: number; edge: Edge; d: number; sel: boolean; side: boolean } | null = null;
  for (const g of regions) {
    for (const edge of ['start', 'end'] as const) {
      const pos = edge === 'start' ? g.start : g.end;
      const d = Math.abs(x - pos);
      if (d > tol) continue;
      const cand = { pad: g.pad, edge, d, sel: g.pad === selected, side: edge === 'start' ? x >= pos : x < pos };
      const better = !best
        || (cand.sel !== best.sel ? cand.sel : cand.d !== best.d ? cand.d < best.d : cand.side && !best.side);
      if (better) best = cand;
    }
  }
  return best ? { pad: best.pad, edge: best.edge } : null;
}

/** The pad whose region holds sample `x`: the selected one if it does, else the shortest that does; -1 = none. */
export function padAt(regions: readonly Region[], x: number, selected: number | null): number {
  const inside = regions.filter((g) => x >= g.start && x < g.end);
  if (!inside.length) return -1;
  const sel = inside.find((g) => g.pad === selected);
  if (sel) return sel.pad;
  return inside.reduce((a, b) => (b.end - b.start < a.end - a.start ? b : a)).pad;
}

// ── MUSIC-SUITE P5 FIX PASS (2026-09-25): the waveform's pointer rules ─────────────────────────────────────────────
//
// What was wrong (the review ran the real edgeAt / moveEdge on Sunday Tape's own 16 FEL cuts, 48 kHz): ui/Waveform
// started a drag on pointerdown whenever ANY pad's marker was within the grab distance (touch 18 px), and on pointerup
// moved the marker to the ABSOLUTE pointer position — never checking that the pointer moved. On a 343 px phone canvas
// 325 of 343 pixel columns grabbed a marker (900 px desktop, 8 px mouse grab: 256 of 900), so a tap in the middle of
// slice 5 — meant to select and hear it — moved pad 5's start 335 ms (and pad 4's end with it), and a vertical page
// scroll that began on the canvas (touch-action pan-y → pointercancel) moved the grabbed marker to the touch-down point.
// Each was an undo step. Now (pure, tested in chopEdit.test.ts):
//   · a press only GRABS a marker; nothing moves until the pointer has travelled DRAG_SLOP_PX (touch 6, pen 3, mouse 2).
//     Below that a release is a TAP (select the slice and set the + SLICE point), and a cancel is nothing at all;
//   · a drag moves the marker by how far the pointer moved (grab offset kept): marker + (x − downX) × samples per px;
//   · the grab distance is at most a third of the narrowest slice under the pointer, so a tap inside a slice selects it;
//   · on TOUCH only the selected pad's two markers can be grabbed (tap a slice first, then drag its markers — as on an
//     MPC's touch screen); a mouse or pen may grab any marker;
//   · ZOOM: the view can be the selected slice ± a margin (zoomView) — one phone pixel was ~31 ms of the whole theme.

/** What the waveform shows: samples [from, to) across `width` CSS px (the whole source, or ZOOM's window). */
export interface WaveView { from: number; to: number; width: number }
export type PointerKind = 'touch' | 'pen' | 'mouse';
/** How near (CSS px) a pointer must be to grab a marker, before the slice cap: a finger needs more room than a mouse. */
export const GRAB_PX: Readonly<Record<PointerKind, number>> = { touch: 18, pen: 10, mouse: 8 };
/** How far (CSS px) a grabbed marker's pointer must travel before it is a drag; less is a tap. */
export const DRAG_SLOP_PX: Readonly<Record<PointerKind, number>> = { touch: 6, pen: 3, mouse: 2 };
/** ZOOM shows the selected slice with this much of its own length either side (at least 50 ms). */
export const ZOOM_MARGIN = 0.25;

export const pointerKind = (t: string | undefined): PointerKind => (t === 'touch' || t === 'pen' ? t : 'mouse');
/** The whole source across the canvas. */
export const fullView = (len: number, width: number): WaveView => ({ from: 0, to: Math.max(1, len), width: Math.max(1, width) });
/** Samples per CSS pixel. */
export const samplesPerPx = (v: WaveView): number => (v.to - v.from) / Math.max(1, v.width);
/** The sample under CSS x (clamped to the canvas). */
export const sampleAtPx = (v: WaveView, x: number): number => Math.round(v.from + clamp(x, 0, v.width) * samplesPerPx(v));
/** Where sample `s` is drawn (CSS px; outside [0, width] when it is off a zoomed view). */
export const pxOfSample = (v: WaveView, s: number): number => (s - v.from) / Math.max(1e-9, samplesPerPx(v));

/** ZOOM: the region ± ZOOM_MARGIN of its length (at least 50 ms of `rate` either side), inside the file; null = all of it. */
export function zoomView(len: number, width: number, region: Pick<Region, 'start' | 'end'> | null, rate: number): WaveView {
  if (!region || len <= 0) return fullView(len, width);
  const pad = Math.max((region.end - region.start) * ZOOM_MARGIN, msToSamples(50, rate));
  const from = Math.max(0, Math.floor(region.start - pad)), to = Math.min(len, Math.ceil(region.end + pad));
  return to > from ? { from, to, width: Math.max(1, width) } : fullView(len, width);
}

/** A marker a press took hold of: which pad's edge, and where the marker was. */
export interface Grab { pad: number; edge: Edge; marker: number }

/**
 * The marker a press at CSS x takes hold of, or null (the press is a tap). Touch: only the selected pad's markers. The
 * distance is GRAB_PX, never more than a third of the narrowest slice under the pointer.
 */
export function grabAt(regions: readonly Region[], v: WaveView, x: number, pointer: PointerKind, selected: number | null): Grab | null {
  const pool = pointer === 'touch' ? regions.filter((g) => g.pad === selected) : regions;
  if (!pool.length) return null;
  const at = sampleAtPx(v, x);
  const inside = regions.filter((g) => at >= g.start && at < g.end);
  const narrowest = inside.length ? Math.min(...inside.map((g) => g.end - g.start)) : Infinity;
  const tol = Math.min(GRAB_PX[pointer] * samplesPerPx(v), narrowest / 3);
  const hit = edgeAt(pool, at, tol, selected);
  if (!hit) return null;
  const g = pool.find((r) => r.pad === hit.pad)!;
  return { ...hit, marker: hit.edge === 'start' ? g.start : g.end };
}

/** One press on the waveform, from down to up (or cancel). `last` = the marker position last emitted. */
export interface WaveGesture { downX: number; pointer: PointerKind; grab: Grab | null; dragging: boolean; last: number | null }

export function gestureStart(regions: readonly Region[], v: WaveView, x: number, pointer: PointerKind, selected: number | null): WaveGesture {
  return { downX: x, pointer, grab: grabAt(regions, v, x, pointer, selected), dragging: false, last: null };
}

/** The marker's position for the pointer at x: where it was plus how far the pointer moved (the grab offset kept). */
const dragTo = (g: WaveGesture, v: WaveView, x: number): number => Math.round(g.grab!.marker + (x - g.downX) * samplesPerPx(v));

/** The pointer moved: a grabbed marker past the slop moves by the pointer's travel; anything else emits nothing. */
export function gestureMove(g: WaveGesture, v: WaveView, x: number): { g: WaveGesture; move: (Grab & { at: number }) | null } {
  if (!g.grab) return { g, move: null };
  const dragging = g.dragging || Math.abs(x - g.downX) >= DRAG_SLOP_PX[g.pointer];
  if (!dragging) return { g, move: null };
  const at = dragTo(g, v, x);
  if (at === g.last) return { g: { ...g, dragging }, move: null };
  return { g: { ...g, dragging, last: at }, move: { ...g.grab, at } };
}

/**
 * The press ended. A drag: the marker's last position ('end'; a cancel keeps where it got to). Not a drag: a release is a
 * TAP at the touch-down sample (select that slice, set the + SLICE point); a cancel (the page scrolled) is nothing.
 */
export function gestureEnd(g: WaveGesture, v: WaveView, x: number, cancelled: boolean): { end: (Grab & { at: number }) | null; tap: number | null } {
  if (g.grab && g.dragging) return { end: { ...g.grab, at: cancelled ? g.last ?? g.grab.marker : dragTo(g, v, x) }, tap: null };
  if (cancelled) return { end: null, tap: null };
  return { end: null, tap: sampleAtPx(v, g.downX) };
}

/** Min / max of `mono[from, to)` per column — what the waveform draws. */
export function peaks(mono: Float32Array, columns: number, from = 0, to = mono.length): { min: Float32Array; max: Float32Array } {
  const n = Math.max(1, Math.floor(columns));
  const min = new Float32Array(n), max = new Float32Array(n);
  const span = Math.max(0, to - from);
  for (let c = 0; c < n; c++) {
    const a = from + Math.floor((c * span) / n), b = Math.max(a + 1, from + Math.floor(((c + 1) * span) / n));
    let lo = 0, hi = 0;
    for (let i = a; i < b && i < mono.length; i++) { const v = mono[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
    min[c] = lo; max[c] = hi;
  }
  return { min, max };
}

/**
 * A bank's slice points counted at `to` Hz (the rate the room decoded at), so an edit works in the samples it shows. A
 * bank saved at another rate (P3 FIX PASS: 48 kHz speakers, 44.1 kHz on some headsets) is rescaled once, on its first
 * edit here; unknown or equal rates hand the bank back as it is.
 */
export function bankAtRate(bank: ProjectFlipBank, to: number): ProjectFlipBank {
  if (!bank.source || !(to > 0)) return bank;
  if (bank.rate === to) return bank;
  if (!bank.rate) return { ...bank, rate: to };
  return { ...bank, rate: to, chops: bank.chops.map((c) => (c.slice ? { ...c, slice: sliceAtRate(c.slice, bank.rate, to) } : c)) };
}

// ── pads → grid rows (four banks, sixteen rows) ─────────────────────────────────────────────────────────────────────

/**
 * Which grid row pad `pad` of bank `bank` goes to. The row it was sent to before (its origin) — REPLACE; else the row
 * with its own number when that is free (bank A behaves exactly as before banks); else the first free row. A row is
 * taken when a chop is on it or the grid holds it (`trackIds`: a row whose chop failed to load waits for its own pad).
 * Null when all sixteen rows are taken.
 */
export function rowSlotFor(rows: readonly ProjectFlipRow[], trackIds: Iterable<string>, bank: number, pad: number): { slot: number; replaces: boolean } | null {
  const mine = rows.find((r) => { const o = rowOrigin(r); return o.bank === bank && o.pad === pad; });
  if (mine) return { slot: mine.pad, replaces: true };
  const onGrid = new Set(trackIds);
  // bank A's pad may take back its own row whose chop was lost (the room's line says "send a pad to it again")
  const free = (s: number): boolean => !rows.some((r) => r.pad === s) && (!onGrid.has(`flip_${s}`) || (bank === 0 && s === pad));
  if (free(pad)) return { slot: pad, replaces: false };
  for (let s = 0; s < PAD_COUNT; s++) if (free(s)) return { slot: s, replaces: false };
  return null;
}
/** A row's name: "FLIP 4" for bank A's pad 4 on row 4 (as before banks), else "FLIP 7 · B4". */
export function rowLabel(slot: number, bank: number, pad: number): string {
  return bank === 0 && pad === slot ? `FLIP ${slot + 1}` : `FLIP ${slot + 1} · ${BANK_LETTERS[bank] ?? '?'}${pad + 1}`;
}
/** The pads of bank `bank` that have a grid row (each marked on its pad). */
export function padsWithRows(rows: readonly ProjectFlipRow[], bank: number): Set<number> {
  return new Set(rows.map(rowOrigin).filter((o) => o.bank === bank).map((o) => o.pad));
}

// ── ARM REC: which step a tap lands on ──────────────────────────────────────────────────────────────────────────────

/** A step the engine scheduled: its index in the bar and when it sounds on the audio clock (onStepScheduled). */
export interface StepMark { step: number; time: number }

/**
 * The step a pad tap at `tap` (audio-clock seconds, the player's delay already taken off) is written to, from the steps
 * the engine scheduled (`marks`, swing included) — one step further either way by `stepSec` when the tap is past them.
 * QUANTIZE on: the NEAREST step (a tap 20 ms early is the coming step; up to half a step late is the step just gone; a
 * dead tie goes to the later one). Off: the step the tap falls in (the last one at or before it). Null when there is no
 * clock yet, or the tap is in the count-in (more than half a step before `startSec`, bar 0's first step).
 */
export function recordStep(tap: number, marks: readonly StepMark[], o: { stepSec: number; steps: number; quantize: boolean; startSec?: number }): number | null {
  if (!(o.stepSec > 0) || !Number.isFinite(tap) || !(o.steps > 0)) return null;
  const start = o.startSec ?? -Infinity;
  if (tap < start - o.stepSec / 2) return null;
  const known = marks.filter((m) => Number.isFinite(m.time) && m.time >= start - 1e-6).sort((a, b) => a.time - b.time);
  if (!known.length) return null;
  const wrap = (s: number): number => ((s % o.steps) + o.steps) % o.steps;
  const cands = [...known];
  const first = known[0], last = known[known.length - 1];
  if (tap > last.time) {
    const k = Math.floor((tap - last.time) / o.stepSec);
    cands.push({ step: wrap(last.step + k), time: last.time + k * o.stepSec }, { step: wrap(last.step + k + 1), time: last.time + (k + 1) * o.stepSec });
  }
  if (tap < first.time && !Number.isFinite(start)) {
    const k = Math.ceil((first.time - tap) / o.stepSec);
    cands.push({ step: wrap(first.step - k), time: first.time - k * o.stepSec });
  }
  cands.sort((a, b) => a.time - b.time);
  if (o.quantize) {
    let best = cands[0], d = Math.abs(cands[0].time - tap);
    for (const c of cands) { const e = Math.abs(c.time - tap); if (e <= d) { d = e; best = c; } }
    return wrap(best.step);
  }
  let under: StepMark | null = null;
  for (const c of cands) if (c.time <= tap + 1e-9) under = c;
  return under ? wrap(under.step) : null;
}

// ── memory: what the open project still plays ──────────────────────────────────────────────────────────────────────

/**
 * The sources (sourceKey) the open project can play right now: every bank's, every grid row's, every section's own
 * chops'. A chop kit is not here — its source is decoded again when it is loaded into a bank.
 */
export function liveSourceKeys(p: Pick<StudioProject, 'flip' | 'flipRows'> & { sections?: readonly Pick<ProjectSection, 'chops'>[] }): Set<string> {
  const keys = new Set<string>();
  for (const b of flipBanks(p.flip)) if (b.source) keys.add(sourceKey(b.source));
  for (const r of p.flipRows) keys.add(sourceKey(r.source));
  for (const s of p.sections ?? []) for (const r of s.chops ?? []) keys.add(sourceKey(r.source));
  return keys;
}

/** Drop every entry whose key is not in `keep`; returns the keys dropped. */
export function pruneMap<V>(map: Map<string, V>, keep: ReadonlySet<string>): string[] {
  const gone = [...map.keys()].filter((k) => !keep.has(k));
  for (const k of gone) map.delete(k);
  return gone;
}
