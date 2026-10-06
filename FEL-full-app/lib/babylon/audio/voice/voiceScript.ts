// voiceScript: the production voice script and the provider-neutral import, the PURE half (IMPROVE 2026-10-06).
//
// Owner decision (2026-10-06): new voices come from a licensed AI voice service, any provider. The script the provider reads is
// tools/voice/script/*.csv, one row per line; the owner renders each row to a file named by the row's id; then
// tools/voice/import-voices.mts checks every expected file is there, converts and levels them, and writes them into the voice
// bank (public/audio/voice/v1/<voice>/<group>.<hash>.bin + <group>.json, the same layout tools/voice/render-mic.py writes).
//
// Everything here is a decision on text and bytes: the CSV, the id ↔ bank mapping, which files are missing, the bank rebuild,
// the script and loudness-table updates, the PCM trim / fade / gain and the WAV container. No fs, no child processes: the CLI
// does the I/O and the conversion, so this file runs the same under vitest as on the owner's Mac.

import { momentSpec } from '../mic/moments';
import type { ScriptFile, ScriptLine } from '../mic/scriptRules';

// ── the script (CSV) ──────────────────────────────────────────────────────────────────────────────────────────────────

/** The columns, in order. `match` is the page's own string when the spoken words differ from it (a digit spelled out); `source`
 *  is where a page line comes from (file), or blank for a voice's scripted moment. */
export const SCRIPT_COLUMNS = ['id', 'voice', 'persona', 'mode', 'moment', 'tier', 'tags', 'priority', 'text', 'match', 'delivery', 'max_sec', 'target', 'source'] as const;

/** P1: spoken by the browser today (the robotic half). P2: a pool of fewer than 3 lines the owner hears often. P3: a pool of
 *  fewer than 3 lines on a rarer moment (one event of the carnival, one celebration, one side's game point). */
export type Priority = 'P1' | 'P2' | 'P3';

export interface ScriptRow {
  /** `<voice>.<line id>`: the file the provider's take must be named (any audio extension), and the line's key in the bank. */
  id: string;
  voice: string;
  persona: string;
  mode: string;
  moment: string;
  tier?: 0 | 1 | 2;
  tags: string[];
  priority: Priority;
  text: string;
  match?: string;
  delivery: string;
  maxSec: number;
  /** `public/audio/voice/v1/<voice>/<group>.json#<line id>`: the bank index (the manifest) the line is written into. */
  target: string;
  source: string;
}

/** RFC 4180 CSV: quoted fields, "" inside quotes, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false, i = 0;
  const src = text.replace(/^﻿/, '');
  while (i < src.length) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i += 2; continue; }
      if (ch === '"') { quoted = false; i++; continue; }
      cell += ch; i++; continue;
    }
    if (ch === '"' && cell === '') { quoted = true; i++; continue; }
    if (ch === ',') { row.push(cell); cell = ''; i++; continue; }
    if (ch === '\r' && src[i + 1] === '\n') { i++; continue; }
    if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; continue; }
    cell += ch; i++;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const csvCell = (v: string): string => (/[",\r\n]/.test(v) || /^\s|\s$/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
export function toCsv(rows: readonly (readonly string[])[]): string {
  return rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
}

export function rowToCells(r: ScriptRow): string[] {
  return [r.id, r.voice, r.persona, r.mode, r.moment, r.tier === undefined ? '' : String(r.tier), r.tags.join(' '), r.priority, r.text,
    r.match ?? '', r.delivery, r.maxSec.toFixed(1), r.target, r.source];
}
export function scriptToCsv(rows: readonly ScriptRow[]): string {
  return toCsv([[...SCRIPT_COLUMNS], ...rows.map(rowToCells)]);
}

/** The rows of one script file. Throws on a wrong header or a malformed row (a script with a typo must not import half). */
export function rowsFromCsv(text: string, file = 'script'): ScriptRow[] {
  const [head, ...body] = parseCsv(text);
  if (!head || head.join(',') !== SCRIPT_COLUMNS.join(',')) throw new Error(`${file}: the header must be ${SCRIPT_COLUMNS.join(',')}`);
  return body.map((c, n) => {
    const where = `${file} row ${n + 2}`;
    if (c.length !== SCRIPT_COLUMNS.length) throw new Error(`${where}: ${c.length} cells, expected ${SCRIPT_COLUMNS.length}`);
    const [id, voice, persona, mode, moment, tier, tags, priority, text, match, delivery, maxSec, target, source] = c.map((x) => x.trim());
    if (!['P1', 'P2', 'P3'].includes(priority)) throw new Error(`${where}: priority ${priority}`);
    if (tier !== '' && !['0', '1', '2'].includes(tier)) throw new Error(`${where}: tier ${tier}`);
    const sec = Number(maxSec);
    if (!(sec > 0)) throw new Error(`${where}: max_sec ${maxSec}`);
    return {
      id, voice, persona, mode, moment, ...(tier !== '' ? { tier: Number(tier) as 0 | 1 | 2 } : {}), tags: tags ? tags.split(/\s+/) : [],
      priority: priority as Priority, text, ...(match ? { match } : {}), delivery, maxSec: sec, target, source,
    };
  });
}

// ── ids and the bank layout ────────────────────────────────────────────────────────────────────────────────────────────

export const VOICE_ROOT = 'public/audio/voice/v1';

/** A voice id: lower case and underscores (crowd_a, bb_host): never a dot, so the first dot in a row id ends the voice. */
const VOICE_ID = /^[a-z][a-z0-9_]*$/;
export const fileIdOf = (voice: string, lineId: string): string => `${voice}.${lineId}`;
export function splitFileId(id: string): { voice: string; lineId: string } | null {
  const dot = id.indexOf('.');
  if (dot < 1) return null;
  const voice = id.slice(0, dot), lineId = id.slice(dot + 1);
  return VOICE_ID.test(voice) && /^[A-Za-z0-9_.+-]+$/.test(lineId) ? { voice, lineId } : null;
}
export const targetOf = (voice: string, group: string, lineId: string): string => `${VOICE_ROOT}/${voice}/${group}.json#${lineId}`;
export function parseTarget(t: string): { voice: string; group: string; lineId: string } | null {
  const m = /^public\/audio\/voice\/v1\/([a-z][a-z0-9_]*)\/([a-z]+)\.json#([A-Za-z0-9_.+-]+)$/.exec(t);
  return m ? { voice: m[1], group: m[2], lineId: m[3] } : null;
}

/** The voices whose lines are NOT in a script JSON (lib/babylon/audio/mic/script/<voice>.json): their text lives in TypeScript
 *  and is picked from there, so a new line must also be added to that table by hand (the importer prints it). */
export const TS_SOURCED: Readonly<Record<string, { group: string; path: string }>> = Object.freeze({
  bb_host: { group: 'quiz', path: 'lib/babylon/party/brainBrawlLines.ts (HOST_LINES)' },
  stoop: { group: 'dance', path: 'lib/babylon/audio/mic/script/stoop.ts' },
  okta: { group: 'academy', path: 'lib/babylon/audio/mic/script/okta.ts' },
});

/** The bank a line lives in: scripts/mic/build-mic.mts's groupOf, plus the TypeScript-sourced hosts. */
export function groupFor(voice: string, role: string | undefined, moment: string): string {
  if (TS_SOURCED[voice]) return TS_SOURCED[voice].group;
  if (moment === 'name') return 'names';
  if (role === 'crowd') return 'crowd';
  if (role === 'player') return 'chatter';
  if (role === 'coach') return 'coach';
  return momentSpec(moment)?.group ?? 'shared';
}

/** The stem of a line id for a slot (scriptRules.lineId without the number): 'dunk.make.t2', 'carnival.event.slam_rush'. */
export function idStem(moment: string, tier?: number, tags: readonly string[] = []): string {
  return `${moment}${tier !== undefined ? `.t${tier}` : ''}${tags.length ? `.${tags.map((t) => t.split(':')[1] ?? t).join('+')}` : ''}`;
}
/** The next free id for a slot, after every id already taken (in the bank or earlier in the script). */
export function nextLineId(taken: ReadonlySet<string>, stem: string): string {
  let n = 1;
  for (const id of taken) {
    if (!id.startsWith(`${stem}.`)) continue;
    const tail = id.slice(stem.length + 1);
    if (/^\d+$/.test(tail)) n = Math.max(n, Number(tail) + 1);
  }
  let id = `${stem}.${String(n).padStart(2, '0')}`;
  while (taken.has(id)) id = `${stem}.${String(++n).padStart(2, '0')}`;
  return id;
}

// ── the rendered folder against the script ─────────────────────────────────────────────────────────────────────────────

/** What a provider exports. Anything else in the folder is reported, never imported. */
export const AUDIO_EXTS = ['.wav', '.aif', '.aiff', '.m4a', '.mp3', '.flac', '.ogg', '.caf'] as const;
const extOf = (f: string): string => { const d = f.lastIndexOf('.'); return d < 0 ? '' : f.slice(d).toLowerCase(); };
const stemOf = (f: string): string => { const d = f.lastIndexOf('.'); return d < 0 ? f : f.slice(0, d); };

export interface ImportPlan {
  found: { row: ScriptRow; file: string }[];
  /** Script rows with no file (the import stops unless told to go ahead without them). */
  missing: ScriptRow[];
  /** Audio files whose name is no row's id (a typo, or a line from another script). */
  unexpected: string[];
  /** Ids with more than one file (take.wav and take.mp3): ambiguous, so neither is imported. */
  duplicates: { id: string; files: string[] }[];
  /** Non-audio files, ignored. */
  ignored: string[];
}

/** Match a folder's file names to the script's rows. Names are compared case-insensitively ("Coach.Page…" from a provider that
 *  capitalises is still found), the extension ignored. */
export function planImport(rows: readonly ScriptRow[], fileNames: readonly string[]): ImportPlan {
  const byId = new Map<string, string[]>(), ignored: string[] = [];
  for (const f of fileNames) {
    if (f.startsWith('.')) continue;
    if (!(AUDIO_EXTS as readonly string[]).includes(extOf(f))) { ignored.push(f); continue; }
    const k = stemOf(f).toLowerCase();
    byId.set(k, [...(byId.get(k) ?? []), f]);
  }
  const plan: ImportPlan = { found: [], missing: [], unexpected: [], duplicates: [], ignored };
  const wanted = new Set<string>();
  for (const row of rows) {
    const k = row.id.toLowerCase();
    wanted.add(k);
    const files = byId.get(k) ?? [];
    if (files.length === 1) plan.found.push({ row, file: files[0] });
    else if (files.length > 1) plan.duplicates.push({ id: row.id, files: [...files].sort() });
    else plan.missing.push(row);
  }
  for (const [k, files] of byId) if (!wanted.has(k)) plan.unexpected.push(...files);
  plan.unexpected.sort();
  return plan;
}

// ── the bank and its index (the manifest) ──────────────────────────────────────────────────────────────────────────────

export interface IndexLine {
  id: string; moment: string; text: string; tier?: 0 | 1 | 2; tags?: string[]; match?: string;
  off: number; len: number; sec: number; lufs?: number; peak?: number;
}
export interface BankIndexFile { cast: string; group: string; bank: string; lines: IndexLine[] }

/** One imported take: the line's script fields, its encoded bytes and what was measured on them. */
export interface Take {
  id: string; moment: string; text: string; tier?: 0 | 1 | 2; tags?: string[]; match?: string;
  bytes: Uint8Array; sec: number; lufs?: number; peak?: number;
}

/**
 * Rebuild one bank with `takes` in it: a take whose id is already in the bank REPLACES that line in place (a re-voice keeps the
 * order and the id), a new id is appended. Every other line keeps its bytes (sliced from the old blob) and its fields. The bank
 * file name is `<group>.<hash10>.bin`, the hash of the new blob (render-mic.py's naming), so a changed bank is a new URL.
 */
export function rebuildBank(index: BankIndexFile, oldBlob: Uint8Array, takes: readonly Take[], hash10: (b: Uint8Array) => string): {
  index: BankIndexFile; blob: Uint8Array; added: string[]; replaced: string[];
} {
  const byId = new Map(takes.map((t) => [t.id, t]));
  const parts: Uint8Array[] = [];
  const lines: IndexLine[] = [];
  const added: string[] = [], replaced: string[] = [];
  let off = 0;
  const push = (fields: Omit<IndexLine, 'off' | 'len'>, bytes: Uint8Array): void => {
    const { id, moment, text, tier, tags, match, sec, lufs, peak } = fields;
    lines.push({
      id, moment, text, ...(tier !== undefined ? { tier } : {}), ...(tags?.length ? { tags: [...tags] } : {}), ...(match ? { match } : {}),
      off, len: bytes.length, sec, ...(lufs !== undefined ? { lufs } : {}), ...(peak !== undefined ? { peak } : {}),
    });
    parts.push(bytes);
    off += bytes.length;
  };
  for (const l of index.lines) {
    const t = byId.get(l.id);
    if (t) { push(t, t.bytes); replaced.push(t.id); byId.delete(t.id); continue; }
    if (l.off + l.len > oldBlob.length) throw new Error(`${index.cast}/${index.group}: line ${l.id} runs past the end of its bank`);
    push(l, oldBlob.subarray(l.off, l.off + l.len));
  }
  for (const t of takes) if (byId.has(t.id)) { push(t, t.bytes); added.push(t.id); byId.delete(t.id); }
  const blob = new Uint8Array(off);
  let at = 0;
  for (const p of parts) { blob.set(p, at); at += p.length; }
  const bank = lines.length ? `${index.group}.${hash10(blob)}.bin` : '';
  return { index: { cast: index.cast, group: index.group, bank, lines }, blob, added, replaced };
}

/** The index JSON exactly as render-mic.py writes it (compact), so a diff shows only what changed. */
export const indexJson = (i: BankIndexFile): string => JSON.stringify(i);

/** Add a line to a voice's script JSON (or update its text in place), so scripts/mic/build-mic.mts re-renders keep it. */
export function upsertScriptLine(file: ScriptFile, line: ScriptLine & { id: string }): { file: ScriptFile; change: 'added' | 'updated' | 'same' } {
  const clean: ScriptLine = {
    id: line.id, moment: line.moment, text: line.text,
    ...(line.tier !== undefined ? { tier: line.tier } : {}), ...(line.tags?.length ? { tags: [...line.tags] } : {}), ...(line.match ? { match: line.match } : {}),
  };
  const i = file.lines.findIndex((l) => l.id === line.id);
  if (i < 0) return { file: { ...file, lines: [...file.lines, clean] }, change: 'added' };
  if (JSON.stringify(file.lines[i]) === JSON.stringify(clean)) return { file, change: 'same' };
  const lines = [...file.lines]; lines[i] = clean;
  return { file: { ...file, lines }, change: 'updated' };
}
/** The script JSON as scripts/mic/merge-drafts.mts writes it. */
export const scriptJson = (f: ScriptFile): string => JSON.stringify(f, null, 1) + '\n';

// ── loudness ───────────────────────────────────────────────────────────────────────────────────────────────────────────

export function median(xs: readonly number[]): number | null {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** The gain (dB) that brings a take to `target` LUFS without its peak going over `ceiling` dBFS, at most `maxBoost` up. */
export function gainToTarget(lufs: number, peakDb: number, target = -19, ceiling = -1, maxBoost = 20): number {
  if (!Number.isFinite(lufs) || lufs <= -69) return 0;   // silence (the gate found nothing): leave it, the report flags it
  const want = Math.min(target - lufs, maxBoost);
  const room = Number.isFinite(peakDb) ? ceiling - peakDb : want;
  return Math.round(Math.min(want, room) * 100) / 100;
}

const MARK_OPEN = '// <measured-cast-lufs>', MARK_CLOSE = '// </measured-cast-lufs>';
/** loudness.ts with its MEASURED_CAST_LUFS block rewritten to `table` (sorted, one decimal), everything else untouched. */
export function writeMeasuredTable(src: string, table: Readonly<Record<string, number>>): string {
  const a = src.indexOf(MARK_OPEN), b = src.indexOf(MARK_CLOSE);
  if (a < 0 || b < a) throw new Error('loudness.ts: the measured-cast-lufs markers are missing');
  const rows = Object.keys(table).sort().map((k) => `  ${/^[a-z_][a-z0-9_]*$/.test(k) ? k : JSON.stringify(k)}: ${(Math.round(table[k] * 10) / 10).toFixed(1)},`);
  const block = [MARK_OPEN, 'export const MEASURED_CAST_LUFS: Readonly<Record<string, number>> = Object.freeze({', ...rows, '});'].join('\n') + '\n';
  return src.slice(0, a) + block + src.slice(b);
}
/** The MEASURED_CAST_LUFS block's current values. */
export function readMeasuredTable(src: string): Record<string, number> {
  const a = src.indexOf(MARK_OPEN), b = src.indexOf(MARK_CLOSE);
  if (a < 0 || b < a) throw new Error('loudness.ts: the measured-cast-lufs markers are missing');
  const out: Record<string, number> = {};
  for (const m of src.slice(a, b).matchAll(/^\s+"?([a-z_][a-z0-9_]*)"?:\s*(-?[\d.]+),/gm)) out[m[1]] = Number(m[2]);
  return out;
}

// ── PCM (a take on its way into the bank) ──────────────────────────────────────────────────────────────────────────────

/** render-mic.py's level(), without the gain: cut the silence a provider leaves at the head and tail (keeping 30 ms before
 *  the first sound and 80 ms after the last; "sound" is 2% of the peak) and fade 8 ms each end. A line's length is its
 *  timing in the voice lane (voiceQueue.ts): half a second of leading silence makes a line late. */
export function trimAndFade(x: Float32Array, rate: number): Float32Array {
  let peak = 0;
  for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]));
  if (peak < 1e-4) return x.slice();
  const thr = peak * 0.02;
  let first = 0, last = x.length - 1;
  while (first < x.length && Math.abs(x[first]) <= thr) first++;
  while (last > first && Math.abs(x[last]) <= thr) last--;
  const head = Math.max(0, first - Math.round(0.03 * rate)), tail = Math.min(x.length, last + Math.round(0.08 * rate));
  const y = x.slice(head, tail);
  const f = Math.round(0.008 * rate);
  if (y.length > 2 * f) for (let i = 0; i < f; i++) { const g = i / (f - 1 || 1); y[i] *= g; y[y.length - 1 - i] *= g; }
  return y;
}
export function applyGainDb(x: Float32Array, db: number): Float32Array {
  const g = Math.pow(10, db / 20);
  const y = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) y[i] = Math.max(-1, Math.min(1, x[i] * g));
  return y;
}

/** A WAV file's samples as mono float (channels averaged). PCM 16/24/32-bit and float 32-bit; anything else throws. */
export function parseWav(buf: Uint8Array): { rate: number; samples: Float32Array } {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const tag = (o: number): string => String.fromCharCode(buf[o], buf[o + 1], buf[o + 2], buf[o + 3]);
  if (buf.length < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('not a WAV file');
  let fmt: { format: number; channels: number; rate: number; bits: number } | null = null;
  let o = 12;
  while (o + 8 <= buf.length) {
    const id = tag(o), size = dv.getUint32(o + 4, true), body = o + 8;
    if (id === 'fmt ') {
      let format = dv.getUint16(body, true);
      if (format === 0xfffe && size >= 26) format = dv.getUint16(body + 24, true);   // WAVE_FORMAT_EXTENSIBLE: the sub-format
      fmt = { format, channels: dv.getUint16(body + 2, true), rate: dv.getUint32(body + 4, true), bits: dv.getUint16(body + 14, true) };
    } else if (id === 'data') {
      if (!fmt) throw new Error('WAV data before its format');
      const { format, channels, bits } = fmt;
      const bytes = bits / 8, frames = Math.floor(Math.min(size, buf.length - body) / (bytes * channels));
      const out = new Float32Array(frames);
      for (let i = 0; i < frames; i++) {
        let s = 0;
        for (let c = 0; c < channels; c++) {
          const p = body + (i * channels + c) * bytes;
          if (format === 3 && bits === 32) s += dv.getFloat32(p, true);
          else if (format === 1 && bits === 16) s += dv.getInt16(p, true) / 32768;
          else if (format === 1 && bits === 24) s += (((buf[p] | (buf[p + 1] << 8) | (buf[p + 2] << 16)) << 8) >> 8) / 8388608;
          else if (format === 1 && bits === 32) s += dv.getInt32(p, true) / 2147483648;
          else throw new Error(`unsupported WAV format ${format}/${bits}-bit`);
        }
        out[i] = s / channels;
      }
      return { rate: fmt.rate, samples: out };
    }
    o = body + size + (size & 1);
  }
  throw new Error('WAV without data');
}
/** Mono 16-bit PCM WAV. */
export function encodeWav16(x: Float32Array, rate: number): Uint8Array {
  const buf = new Uint8Array(44 + x.length * 2);
  const dv = new DataView(buf.buffer);
  const put = (o: number, s: string): void => { for (let i = 0; i < 4; i++) buf[o + i] = s.charCodeAt(i); };
  put(0, 'RIFF'); dv.setUint32(4, 36 + x.length * 2, true); put(8, 'WAVE');
  put(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, rate, true); dv.setUint32(28, rate * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  put(36, 'data'); dv.setUint32(40, x.length * 2, true);
  for (let i = 0; i < x.length; i++) dv.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, x[i])) * 32767), true);
  return buf;
}

// ── the report ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The lines a plan cannot go ahead with, for the report (empty when every expected file is there, once). */
export function planProblems(plan: ImportPlan): string[] {
  const out: string[] = [];
  if (plan.missing.length) {
    out.push(`MISSING ${plan.missing.length} file(s): render these ids (any of ${AUDIO_EXTS.join(' ')}):`);
    for (const r of plan.missing) out.push(`  ${r.id}  (${r.voice}, ${r.moment}): ${r.text}`);
  }
  for (const d of plan.duplicates) out.push(`DUPLICATE ${d.id}: ${d.files.join(', ')} (keep one)`);
  if (plan.unexpected.length) out.push(`UNEXPECTED ${plan.unexpected.length} file(s), no script row has their id: ${plan.unexpected.join(', ')}`);
  return out;
}

/** Warnings for one imported take: too long for its moment, quiet or loud after levelling, clipped. */
export function takeWarnings(row: Pick<ScriptRow, 'id' | 'maxSec'>, m: { sec: number; lufs?: number; peak?: number }, target = -19, maxTrim = 6): string[] {
  const out: string[] = [];
  if (m.sec > row.maxSec) out.push(`${row.id}: ${m.sec.toFixed(2)} s, over its ${row.maxSec.toFixed(1)} s (a long line waits or is dropped in the voice lane: re-render it faster or shorter)`);
  if (m.lufs !== undefined && Math.abs(m.lufs - target) > maxTrim) out.push(`${row.id}: ${m.lufs.toFixed(1)} LUFS after levelling, more than ${maxTrim} dB from ${target} (the game will not trim it all the way: check the take)`);
  if (m.peak !== undefined && m.peak > -0.5) out.push(`${row.id}: peak ${m.peak.toFixed(1)} dBFS (clipping risk)`);
  return out;
}

/** A re-voice script for a voice's EXISTING lines (every moment, every line), so a provider voice can replace a whole persona
 *  instead of adding new lines in a different voice beside the old ones. Name stingers are included (they are lines too). */
export function exportRows(voice: string, persona: string, mode: (moment: string) => string, indexes: readonly BankIndexFile[]): ScriptRow[] {
  const rows: ScriptRow[] = [];
  for (const idx of indexes) for (const l of idx.lines) {
    rows.push({
      id: fileIdOf(voice, l.id), voice, persona, mode: mode(l.moment), moment: l.moment, ...(l.tier !== undefined ? { tier: l.tier } : {}),
      tags: l.tags ?? [], priority: 'P2', text: l.text, ...(l.match ? { match: l.match } : {}), delivery: 're-voice: same words, same length',
      maxSec: Math.max(1, Math.ceil(l.sec * 1.15 * 10 - 1e-6) / 10), target: targetOf(voice, idx.group, l.id), source: '',
    });
  }
  return rows;
}
