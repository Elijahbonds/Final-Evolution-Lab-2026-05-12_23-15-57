// lib/motion-lesson/format.ts — EDU-05 motion lessons, phase A (2026-11-03): the lesson FILE. Versioned, quantised,
// delta-coded, gzipped (docs/PLATFORM-ROADMAP.md §2.3 item 2; done-when: "under 150 KB a minute, measured").
//
// A lesson is the movement (pose keys, lib/babylon/anim/poseClip.ts PoseKey) plus what a teacher adds: a title, phrases
// (named stretches a student loops: "1–8", "the dip"), a beat grid for a count, short cues on the timeline, and the weak
// stretches the adapter marked. NUMBERS AND SHORT TEXT ONLY: never a frame, a landmark or a picture.
//
// The bytes: every key's numbers are flattened into named channels ("hands.Left.0", "bones.Spine.0", "hipsY", "hold"),
// each quantised (bone angles to 0.1°, everything else to 1 mm or 0.001) and coded as the change from its last value,
// then the JSON is gzipped with the platform's own CompressionStream (browsers and node 18+; no package). Decoding gives
// the keys back within half a step.
//
// lessonErrors is the one check, for a form and for whatever stores it later: the limits, ordered phrases inside the
// movement, and the words — the claims screen (lib/share/screen.ts) and the cue style's medical words (lib/cue-style).
//
// Pure (CompressionStream is the platform's).
import type { PoseKey } from '@/lib/babylon/anim/poseClip';
import { screenText } from '@/lib/share/screen';
import { isMedical } from '@/lib/cue-style/style';

export const LESSON_VERSION = 1 as const;

export interface Phrase { from: number; to: number; label: string }
export interface Cue { t: number; text: string }
export interface Beat { bpm: number; offset: number }

export interface MotionLesson {
  v: typeof LESSON_VERSION;
  title: string;
  /** Seconds. */
  duration: number;
  keys: PoseKey[];
  phrases: Phrase[];
  cues: Cue[];
  beat: Beat | null;
  /** [from, to] seconds the camera saw poorly (the adapter's `weak`). */
  weak: [number, number][];
}

/** (new) The limits. A cue is a live cue: short (docs/CUE-STYLE.md, live cues 2–5 words). */
export const LESSON_LIMITS = { title: 60, phrases: 32, phraseLabel: 24, cues: 120, cueChars: 40, cueWords: 5, seconds: 600, bpmMin: 40, bpmMax: 220 } as const;
/** (new, the roadmap's done-when) The most a minute of lesson may weigh, gzipped. */
export const MAX_KB_PER_MIN = 150;

// ── channels ─────────────────────────────────────────────────────────────────────────────────────────────────────

const GROUPS = ['bones', 'hands', 'handsRel', 'handsBody', 'poles', 'feet', 'kneePoles'] as const;
const FLAGS = ['hold', 'kneesFront'] as const;
/** Steps per unit: bone angles (degrees) to 0.1°, metres and directions to 0.001. */
const stepOf = (ch: string): number => (ch.startsWith('bones.') ? 10 : (FLAGS as readonly string[]).includes(ch) ? 1 : 1000);

function flatten(k: PoseKey): Map<string, number> {
  const m = new Map<string, number>();
  for (const g of GROUPS) {
    const rec = k[g] as Record<string, readonly number[] | undefined> | undefined;
    if (!rec) continue;
    for (const name of Object.keys(rec).sort()) {
      const v = rec[name];
      if (v) v.forEach((x, i) => m.set(`${g}.${name}.${i}`, x));
    }
  }
  if (typeof k.hipsY === 'number') m.set('hipsY', k.hipsY);
  for (const f of FLAGS) if (k[f]) m.set(f, 1);
  return m;
}

function unflatten(t: number, m: Map<string, number>): PoseKey {
  const k: PoseKey = { t };
  const any = k as unknown as Record<string, unknown>;
  for (const [ch, v] of m) {
    if (ch === 'hipsY') { k.hipsY = v; continue; }
    if ((FLAGS as readonly string[]).includes(ch)) { if (v) any[ch] = true; continue; }
    const [g, name, i] = ch.split('.');
    const rec = (any[g] ??= {}) as Record<string, number[]>;
    (rec[name] ??= [0, 0, 0])[Number(i)] = v;
  }
  return k;
}

// ── gzip, the platform's own ─────────────────────────────────────────────────────────────────────────────────────

async function pipe(bytes: Uint8Array, s: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(s);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

interface Wire {
  v: number; title: string; ms: number; phrases: Phrase[]; cues: Cue[]; beat: Beat | null; weak: [number, number][];
  ch: string[]; t: number[]; d: (number | null)[][];
}

/** A lesson → its file's bytes. */
export async function encodeLesson(l: MotionLesson): Promise<Uint8Array> {
  const flat = l.keys.map(flatten);
  const ch = [...new Set(flat.flatMap((m) => [...m.keys()]))].sort();
  const t: number[] = [];
  let lastT = 0;
  for (const k of l.keys) { const ms = Math.round(k.t * 1000); t.push(ms - lastT); lastT = ms; }
  const d = ch.map((c) => {
    const step = stepOf(c);
    let last = 0;
    return flat.map((m) => {
      const v = m.get(c);
      if (v === undefined) return null;
      const q = Math.round(v * step);
      const delta = q - last;
      last = q;
      return delta;
    });
  });
  const wire: Wire = { v: l.v, title: l.title, ms: Math.round(l.duration * 1000), phrases: l.phrases, cues: l.cues, beat: l.beat, weak: l.weak, ch, t, d };
  return pipe(new TextEncoder().encode(JSON.stringify(wire)), new CompressionStream('gzip'));
}

/** A file's bytes → the lesson, or null for anything that is not a v1 lesson. */
export async function decodeLesson(bytes: Uint8Array): Promise<MotionLesson | null> {
  let w: Wire;
  try { w = JSON.parse(new TextDecoder().decode(await pipe(bytes, new DecompressionStream('gzip')))) as Wire; } catch { return null; }
  if (!w || w.v !== LESSON_VERSION || !Array.isArray(w.ch) || !Array.isArray(w.t) || !Array.isArray(w.d) || w.d.length !== w.ch.length) return null;
  if (w.d.some((col) => !Array.isArray(col) || col.length !== w.t.length)) return null;
  const sums = w.ch.map(() => 0);
  let ms = 0;
  const keys = w.t.map((dt, i) => {
    ms += dt;
    const m = new Map<string, number>();
    w.ch.forEach((c, j) => {
      const delta = w.d[j][i];
      if (delta === null) return;
      sums[j] += delta;
      m.set(c, sums[j] / stepOf(c));
    });
    return unflatten(ms / 1000, m);
  });
  return { v: LESSON_VERSION, title: String(w.title ?? ''), duration: Number(w.ms) / 1000, keys, phrases: w.phrases ?? [], cues: w.cues ?? [], beat: w.beat ?? null, weak: w.weak ?? [] };
}

/** KB a minute of this encoded lesson. */
export const kbPerMinute = (bytes: Uint8Array, seconds: number): number => (bytes.byteLength / 1024) * (60 / Math.max(seconds, 1e-3));

// ── the one check ────────────────────────────────────────────────────────────────────────────────────────────────

function wordProblems(where: string, text: string): string[] {
  const flags = screenText(text);
  if (flags.length) return [`${where}: "${flags[0].found}" reads as a health claim. Say what the body does instead.`];
  if (isMedical(text)) return [`${where}: medical words stay out of lessons.`];
  return [];
}

/** What has to change before this lesson can be kept or shared ([] = fine). */
export function lessonErrors(l: MotionLesson): string[] {
  const L = LESSON_LIMITS;
  const out: string[] = [];
  if (!l.title.trim()) out.push('Give the lesson a title.');
  if (l.title.length > L.title) out.push(`The title is over ${L.title} characters.`);
  out.push(...wordProblems('The title', l.title));
  if (!(l.duration > 0) || l.duration > L.seconds) out.push(`A lesson runs up to ${L.seconds / 60} minutes.`);
  if (l.keys.length < 2) out.push('There is no movement in it yet.');
  if (l.phrases.length > L.phrases) out.push(`Up to ${L.phrases} phrases.`);
  let last = -1;
  l.phrases.forEach((p, i) => {
    if (!p.label.trim() || p.label.length > L.phraseLabel) out.push(`Phrase ${i + 1} needs a short name (up to ${L.phraseLabel} characters).`);
    if (!(p.from >= 0 && p.to > p.from && p.to <= l.duration + 1e-6)) out.push(`Phrase ${i + 1} has to sit inside the movement.`);
    if (p.from < last) out.push(`Phrase ${i + 1} starts before the one above it ends.`);
    last = Math.max(last, p.to);
    out.push(...wordProblems(`Phrase ${i + 1}`, p.label));
  });
  if (l.cues.length > L.cues) out.push(`Up to ${L.cues} cues.`);
  l.cues.forEach((c, i) => {
    const words = c.text.trim().split(/\s+/).filter(Boolean).length;
    if (!words || c.text.length > L.cueChars || words > L.cueWords) out.push(`Cue ${i + 1}: up to ${L.cueWords} words.`);
    if (!(c.t >= 0 && c.t <= l.duration + 1e-6)) out.push(`Cue ${i + 1} has to sit inside the movement.`);
    out.push(...wordProblems(`Cue ${i + 1}`, c.text));
  });
  if (l.beat && !(l.beat.bpm >= L.bpmMin && l.beat.bpm <= L.bpmMax && l.beat.offset >= 0)) out.push(`A count runs ${L.bpmMin}–${L.bpmMax} beats a minute.`);
  return out;
}
