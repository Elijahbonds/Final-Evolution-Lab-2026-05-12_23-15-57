// PLAYER-DRAWN STAMPS ("marks") — IMPROVE (2026-10-06), CREATOR-PLAN phase 4c.
//
// WHY. The stamp library is generic shapes only (the game ships tools, never anyone's emblem). A player who wants a
// spider, a bat, a clan sign or their own initials-in-a-shield DRAWS it: a small one-colour pad, and what they draw is
// theirs. It is then a stamp like any other — placed, rotated, scaled, coloured, outlined and mirrored on any region.
//
// WHAT IS STORED. A mark is MARK_SIZE × MARK_SIZE (128²) one-bit cells (ink or not), row by row from the top, stored as
// a COMPACT TEXT: 'r' + base64url of the run lengths (alternating empty / ink, starting with empty, each an unsigned
// LEB128 varint). A drawn emblem is a few hundred runs, so a mark is typically 0.3–1.5k characters; the doc keeps at most
// MAX_MARKS of them, and only the ones a layer uses.
//
// WHAT IS REFUSED (sanitizeMark — the server, the share-code decoder and the identity layer all run it):
//   - anything that does not decode to exactly 128² cells, or a run that is not a whole number, or trailing bytes;
//   - an empty mark;
//   - a mark with more than MAX_MARK_RUNS runs. This is the size cap (≤ MAX_MARK_CHARS characters, whatever is drawn)
//     AND the privacy line: a dithered photograph is thousands of runs, a drawing a few hundred, so a picture of a face
//     cannot be smuggled in as a "stamp" (lookPrivacy refuses images; this keeps marks drawings).
// The text is re-encoded canonically, so a stored mark is a fixed point and two equal drawings are the same string.
// Its alphabet is base64url (A–Z a–z 0–9 - _): it can never look like a data URL or a link (lookPrivacy.IMAGE_TEXT).
//
// Pure: the Paint tab's pad, the sanitiser and the renderer (paint/marks.ts turns a mark into a distance field) share it.

export const MARK_SIZE = 128;
export const MARK_CELLS = MARK_SIZE * MARK_SIZE;
/** Marks one doc keeps (each used by at least one layer). */
export const MAX_MARKS = 2;
/** The most runs (empty/ink alternations, row-major) a mark may have: see "what is refused". */
export const MAX_MARK_RUNS = 1536;
/** The longest a sanitised mark's text can be: MAX_MARK_RUNS runs, ≤ 128 of them ≥ 128 cells long (2 varint bytes), one
 *  ≥ 16 384 (3 bytes), as base64url, plus the prefix — 2 223; the cap leaves a margin. */
export const MAX_MARK_CHARS = 2_400;

export interface CreatorMark {
  /** [a-z0-9]{1,8}, unique in the doc; a `mark` layer names it */
  id: string;
  /** the compact text above */
  data: string;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const B64_INDEX = new Int16Array(128).fill(-1);
for (let i = 0; i < B64.length; i++) B64_INDEX[B64.charCodeAt(i)] = i;

function toB64Url(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1] ?? 0, c = bytes[i + 2] ?? 0;
    const n = (a << 16) | (b << 8) | c;
    s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    if (i + 1 < bytes.length) s += B64[(n >> 6) & 63];
    if (i + 2 < bytes.length) s += B64[n & 63];
  }
  return s;
}
function fromB64Url(s: string): Uint8Array | null {
  if (s.length % 4 === 1) return null;
  const out = new Uint8Array(Math.floor((s.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < s.length; i += 4) {
    const v = [0, 1, 2, 3].map((k) => (i + k < s.length ? (s.charCodeAt(i + k) < 128 ? B64_INDEX[s.charCodeAt(i + k)] : -1) : 0));
    if (v.some((x, k) => i + k < s.length && x < 0)) return null;
    const n = (v[0] << 18) | (v[1] << 12) | (v[2] << 6) | v[3];
    out[o++] = (n >> 16) & 255;
    if (i + 2 < s.length) out[o++] = (n >> 8) & 255;
    if (i + 3 < s.length) out[o++] = n & 255;
  }
  return out.subarray(0, o);
}

/** The runs of a mark (row-major, alternating empty / ink, starting with empty — the first may be 0). */
export function markRuns(cells: Uint8Array): number[] {
  const runs: number[] = [];
  let cur = 0, len = 0;
  for (let i = 0; i < MARK_CELLS; i++) {
    const v = cells[i] ? 1 : 0;
    if (v === cur) { len++; continue; }
    runs.push(len); cur = v; len = 1;
  }
  runs.push(len);
  return runs;
}

/** How many runs a mark has (what MAX_MARK_RUNS caps). */
export const markComplexity = (cells: Uint8Array): number => markRuns(cells).length;

/** A mark's compact text, or null when it is empty or too detailed (over MAX_MARK_RUNS runs). */
export function encodeMark(cells: Uint8Array): string | null {
  if (cells.length !== MARK_CELLS) return null;
  const runs = markRuns(cells);
  if (runs.length > MAX_MARK_RUNS || runs.length === 1) return null;   // one run is an empty pad (all ink is [0, 16384])
  const bytes: number[] = [];
  for (const r of runs) {
    let v = r;
    while (v >= 128) { bytes.push((v & 127) | 128); v >>>= 7; }
    bytes.push(v);
  }
  return `r${toB64Url(Uint8Array.from(bytes))}`;
}

/** The cells of a mark's text, or null for anything that is not exactly a valid mark. */
export function decodeMark(text: unknown): Uint8Array | null {
  if (typeof text !== 'string' || text.length < 2 || text.length > MAX_MARK_CHARS || text[0] !== 'r') return null;
  const bytes = fromB64Url(text.slice(1));
  if (!bytes) return null;
  const cells = new Uint8Array(MARK_CELLS);
  let at = 0, ink = 0, runs = 0, i = 0;
  while (i < bytes.length) {
    let v = 0, shift = 0, b: number;
    do {
      if (i >= bytes.length || shift > 14) return null;   // a run never needs more than 3 bytes (≤ 16 384)
      b = bytes[i++];
      v |= (b & 127) << shift; shift += 7;
    } while (b & 128);
    if (runs > 0 && v === 0) return null;                 // only the first run may be empty
    if (at + v > MARK_CELLS) return null;
    if (ink) cells.fill(1, at, at + v);
    at += v; ink ^= 1; runs++;
    if (runs > MAX_MARK_RUNS) return null;
  }
  return at === MARK_CELLS ? cells : null;
}

const ID_RE = /^[a-z0-9]{1,8}$/;

/** A mark as the doc stores it: a valid id and the canonical text of a non-empty, not-too-detailed drawing; else null. */
export function sanitizeMark(raw: unknown): CreatorMark | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || !ID_RE.test(r.id)) return null;
  const cells = decodeMark(r.data);
  const data = cells ? encodeMark(cells) : null;
  return data ? { id: r.id, data } : null;
}

// ── the draw pad's tools (pure: the Paint tab calls them, the tests pin them) ───────────────────────────────────────

export const emptyMark = (): Uint8Array => new Uint8Array(MARK_CELLS);

/** Ink (or erase) a round brush of radius `r` cells at (x, y); `mirror` also does it at the mirror image across the
 *  pad's vertical middle. Returns the same array (changed in place). */
export function brushMark(cells: Uint8Array, x: number, y: number, r: number, ink: boolean, mirror = false): Uint8Array {
  const dab = (cx: number) => {
    const rr = Math.max(0.5, r);
    for (let yy = Math.max(0, Math.floor(y - rr)); yy <= Math.min(MARK_SIZE - 1, Math.ceil(y + rr)); yy++) {
      for (let xx = Math.max(0, Math.floor(cx - rr)); xx <= Math.min(MARK_SIZE - 1, Math.ceil(cx + rr)); xx++) {
        if ((xx + 0.5 - cx) ** 2 + (yy + 0.5 - y) ** 2 <= rr * rr) cells[yy * MARK_SIZE + xx] = ink ? 1 : 0;
      }
    }
  };
  dab(x);
  if (mirror) dab(MARK_SIZE - x);
  return cells;
}

/** A brush stroke from (x0, y0) to (x1, y1): dabs every half radius along it. */
export function strokeMark(cells: Uint8Array, x0: number, y0: number, x1: number, y1: number, r: number, ink: boolean, mirror = false): Uint8Array {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / Math.max(0.5, r / 2)));
  for (let i = 0; i <= n; i++) brushMark(cells, x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, r, ink, mirror);
  return cells;
}

/** Fill the whole pad with a filled disc (a new mark starts as something visible to draw on or erase from). */
export function discMark(r = MARK_SIZE * 0.35): Uint8Array {
  return brushMark(emptyMark(), MARK_SIZE / 2, MARK_SIZE / 2, r, true);
}

/** The first free id in `m1, m2, …`. */
export function nextMarkId(marks: readonly Pick<CreatorMark, 'id'>[]): string {
  const taken = new Set(marks.map((m) => m.id));
  for (let i = 1; ; i++) { const id = `m${i}`; if (!taken.has(id)) return id; }
}
