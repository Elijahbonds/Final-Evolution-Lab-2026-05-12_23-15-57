// Share codes: a look as a short text anyone can paste (IMPROVE (2026-10-06), CREATOR-PLAN phase 1; research item 11).
//
//   FEL1.<payload>.<check>
//
//   FEL1     the format version. A code from a newer format is refused with 'unsupported_version', never guessed at.
//   payload  base64url of the JSON { d: CreatorDoc, b: LookBase } with every default-valued field left out (the
//            sanitiser puts the defaults back on decode, which is what keeps the code short).
//   check    FNV-1a of the payload in base36: a typo or a truncated paste is 'corrupt' instead of a half-loaded look.
//
// WHAT A CODE CAN HOLD: the CreatorDoc and the categorical face presets (sanitizeLookBase). Never a name, an email,
// the jersey plate, the face-scan sliders or anything else: both halves are rebuilt field by field from allow-lists on
// the way in AND on the way out, so an extra field in a doc cannot ride along.
// WHAT A DECODE TRUSTS: nothing. Every decoded doc goes through sanitizeCreatorDoc, the same function the save route
// uses. The checksum is for typos, not security (anyone can recompute it). Pure; works in the browser and in node.
//
// V2 (IMPROVE (2026-10-06), CREATOR-PLAN phase 4a): a code can carry a WHOLE SLOT — the doc and the base as before, plus
// `k: { body, sliders?, frame?, presentation? }` — so a character made in one account loads as a new slot in another
// (phase 4b added the Studio size; an older decoder ignores it).
//
//   FEL2.<payload>.<check>   payload = base64url of the JSON DEFLATED (CompressionStream 'deflate-raw'): a worst-case
//                            slot is ~4× shorter than v1's plain base64, which is what lets it ride on a photo card.
//   FEL1.<payload>.<check>   where CompressionStream is missing, the same JSON undeflated. A phase-1 decoder reads only
//                            `d` and `b` and ignores `k`, so a v1-style code still loads its doc and face anywhere.
//
// WHAT A SLOT CODE NEVER HOLDS: the slot's label (it is a name the player typed), the worn items (ownership is per
// account), a name, an email, or anything of a scan — a `'scan'` body is exported as the male kit body. The face sliders
// (which a face scan writes) ride only when the player asks (`numbers: true`); the height and build always do.
// Decoding re-sanitises everything, and a deflated payload is inflated at most MAX_INFLATED_CHARS (no zip bombs).

import { CREATOR_DOC_VERSION, type CreatorDoc, type CreatorPart, type PaintLayer, type CreatorSlotV2, type SlotFrame, type SlotPresentation } from './doc';
import { sanitizeCreatorDoc, sanitizeLookBase, sanitizeSlotFrame, sanitizeSlotPresentation, type LookBase } from './sanitize';
import { sanitizeFaceSliders } from '../../closet/wearable-catalog';

export const SHARE_CODE_VERSION = 1;
/** The deflated slot format. */
export const SHARE_CODE_VERSION_DEFLATED = 2;
/** A deflated payload may inflate to at most this many characters of JSON (a slot is under MAX_SLOT_CHARS). */
export const MAX_INFLATED_CHARS = 64_000;
/** A sanitised doc is at most MAX_DOC_CHARS of JSON; base64 adds a third. Anything longer is not one of ours.
 *  Phase 4c (2026-10-06): 40 000 → 50 000 with the doc cap (a worst-case v1 code is ~45k; a v2 code is deflated). */
export const MAX_SHARE_CODE_CHARS = 50_000;

export type DecodeError = 'empty' | 'too_long' | 'not_a_code' | 'unsupported_version' | 'corrupt' | 'invalid';
/** What a slot code adds to a look (phase 4a). Absent on a phase-1 code. */
export interface SlotExtras { body: 'male' | 'female'; sliders?: CreatorSlotV2['sliders']; frame?: SlotFrame; presentation?: SlotPresentation }
export type DecodeResult = { ok: true; doc: CreatorDoc; base: LookBase; slot?: SlotExtras } | { ok: false; error: DecodeError };

// ── base64url over UTF-8 ─────────────────────────────────────────────────────────────────────────────────────────────
function toB64Url(text: string | Uint8Array): string {
  const bytes = typeof text === 'string' ? new TextEncoder().encode(text) : text;
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function bytesFromB64Url(s: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch { return null; }
}
function utf8(bytes: Uint8Array): string | null {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return null; }
}
function fromB64Url(s: string): string | null {
  const b = bytesFromB64Url(s);
  return b ? utf8(b) : null;
}
/** FNV-1a 32-bit, base36, fixed width. */
export function checksum(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36).padStart(7, '0');
}

// ── compaction: leave defaults out (sanitize puts them back) ─────────────────────────────────────────────────────────
const zero = (v: number[]) => v.every((x) => x === 0);
const one = (v: number[]) => v.every((x) => x === 1);
function compactPart(p: CreatorPart): Record<string, unknown> {
  const o: Record<string, unknown> = { id: p.id, shape: p.shape, bone: p.bone, colour: p.colour };
  if (!zero(p.pos)) o.pos = p.pos;
  if (!zero(p.rot)) o.rot = p.rot;
  if (!one(p.scale)) o.scale = p.scale;
  if (p.finish !== 'matte') o.finish = p.finish;
  if (p.mirror) o.mirror = true;
  // phase 4c: the sanitiser already left the defaults out of these
  for (const k of ['colour2', 'tone', 'toneAxis', 'toneAt', 'toneWidth', 'swing', 'follow'] as const) if (p[k] !== undefined) o[k] = p[k];
  return o;
}
function compactLayer(l: PaintLayer): Record<string, unknown> {
  const { at, ...rest } = l;
  const o: Record<string, unknown> = { ...rest };
  if (l.surface === 'both') delete o.surface;
  if (l.opacity === 1) delete o.opacity;
  if (!l.mirror) delete o.mirror;
  const a: Record<string, number> = {};
  if (at.x !== 0.5) a.x = at.x;
  if (at.y !== 0.5) a.y = at.y;
  if (at.rot !== 0) a.rot = at.rot;
  if (at.scale !== 1) a.scale = at.scale;
  if (at.stretch !== 1) a.stretch = at.stretch;
  if (Object.keys(a).length) o.at = a;
  return o;
}
function compactDoc(d: CreatorDoc): Record<string, unknown> {
  const o: Record<string, unknown> = { v: d.v };
  if (d.parts.length) o.parts = d.parts.map(compactPart);
  if (d.paint.length) o.paint = d.paint.map(compactLayer);
  if (Object.keys(d.colours).length) o.colours = d.colours;
  if (Object.keys(d.shape.face).length || Object.keys(d.shape.body).length || Object.keys(d.shape.girth ?? {}).length) o.shape = d.shape;
  if (d.flags.suit || d.flags.hide) o.flags = { ...(d.flags.suit ? { suit: true } : {}), ...(d.flags.hide ? { hide: d.flags.hide } : {}) };
  if (d.eyes) o.eyes = d.eyes;
  if (d.marks?.length) o.marks = d.marks;   // phase 4c: drawn stamps ride along (each ≤ MAX_MARK_CHARS, at most MAX_MARKS)
  if (d.clothes?.length) o.clothes = d.clothes;   // phase 4e: code-built clothes (the sanitiser already left their defaults out)
  if (d.hair) o.hair = d.hair;   // 2026-10-07: hair extras (a second colour, accessories, a beard; defaults already left out)
  return o;
}

/** Encode a look. The doc and the base are sanitised first, so only allow-listed fields can reach the code. */
export function encodeShareCode(doc: CreatorDoc, base: unknown = {}): string {
  const clean = sanitizeCreatorDoc(doc) ?? sanitizeCreatorDoc({ v: CREATOR_DOC_VERSION })!;
  const b = sanitizeLookBase(base);
  const payload = toB64Url(JSON.stringify(Object.keys(b).length ? { d: compactDoc(clean), b } : { d: compactDoc(clean) }));
  return `FEL${SHARE_CODE_VERSION}.${payload}.${checksum(payload)}`;
}

/** Decode a pasted code. Whitespace (a code split across lines) is ignored. */
export function decodeShareCode(input: unknown): DecodeResult {
  if (typeof input !== 'string' || !input.trim()) return { ok: false, error: 'empty' };
  if (input.length > MAX_SHARE_CODE_CHARS * 2) return { ok: false, error: 'too_long' };
  const code = input.replace(/\s+/g, '');
  if (code.length > MAX_SHARE_CODE_CHARS) return { ok: false, error: 'too_long' };
  const m = /^FEL(\d{1,3})\.([A-Za-z0-9_-]+)\.([0-9a-z]{7})$/.exec(code);
  if (!m) return { ok: false, error: 'not_a_code' };
  if (Number(m[1]) !== SHARE_CODE_VERSION) return { ok: false, error: 'unsupported_version' };
  if (checksum(m[2]) !== m[3]) return { ok: false, error: 'corrupt' };
  const json = fromB64Url(m[2]);
  if (json == null) return { ok: false, error: 'corrupt' };
  let parsed: unknown;
  try { parsed = JSON.parse(json); } catch { return { ok: false, error: 'corrupt' }; }
  return fromParsed(parsed);
}

function fromParsed(parsed: unknown): DecodeResult {
  const p = parsed as { d?: unknown; b?: unknown; k?: unknown } | null;
  const doc = sanitizeCreatorDoc(p && typeof p === 'object' ? p.d : null);
  if (!doc) return { ok: false, error: 'invalid' };
  const out: DecodeResult = { ok: true, doc, base: sanitizeLookBase(p!.b) };
  const slot = sanitizeExtras(p!.k);
  if (slot) out.slot = slot;
  return out;
}

function sanitizeExtras(raw: unknown): SlotExtras | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const k = raw as Record<string, unknown>;
  // a scan never travels: anything but 'female' is the male kit body
  const out: SlotExtras = { body: k.body === 'female' ? 'female' : 'male' };
  const sliders = sanitizeFaceSliders(k.sliders);
  if (sliders) out.sliders = sliders;
  const frame = sanitizeSlotFrame(k.frame);
  if (frame) out.frame = frame;
  const presentation = sanitizeSlotPresentation(k.presentation);
  if (presentation) out.presentation = presentation;
  return out;
}

// ── v2: a whole slot, deflated ───────────────────────────────────────────────────────────────────────────────────────

type StreamCtor = new (format: string) => TransformStream<Uint8Array, Uint8Array>;
const streamCtor = (name: 'CompressionStream' | 'DecompressionStream'): StreamCtor | null =>
  (globalThis as unknown as Record<string, StreamCtor | undefined>)[name] ?? null;

async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array | null> {
  const CS = streamCtor('CompressionStream');
  if (!CS) return null;
  try {
    const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CS('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch { return null; }
}

/** Inflate, refusing past `limit` bytes. Null when it is not deflate data or no DecompressionStream exists; 'too_long'. */
async function inflateRaw(bytes: Uint8Array, limit: number): Promise<Uint8Array | null | 'too_long'> {
  const DS = streamCtor('DecompressionStream');
  if (!DS) return null;
  try {
    const reader = new Blob([bytes as BlobPart]).stream().pipeThrough(new DS('deflate-raw')).getReader();
    const parts: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) { void reader.cancel().catch(() => {}); return 'too_long'; }
      parts.push(value);
    }
    const out = new Uint8Array(total);
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.byteLength; }
    return out;
  } catch { return null; }
}

/** The JSON a slot code carries: never the label, the worn items, or a scan. */
function slotPayload(slot: Pick<CreatorSlotV2, 'body' | 'base' | 'sliders' | 'frame' | 'doc' | 'presentation'>, numbers: boolean): Record<string, unknown> {
  const clean = sanitizeCreatorDoc(slot.doc) ?? sanitizeCreatorDoc({ v: CREATOR_DOC_VERSION })!;
  const b = sanitizeLookBase(slot.base);
  const k: Record<string, unknown> = { body: slot.body === 'female' ? 'female' : 'male' };
  const sliders = numbers ? sanitizeFaceSliders(slot.sliders) : undefined;
  if (sliders) k.sliders = sliders;
  const frame = sanitizeSlotFrame(slot.frame);
  if (frame) k.frame = frame;
  // phase 4b: the Studio size rides like the height and build (a giant should arrive a giant in the importer's Studio)
  const presentation = sanitizeSlotPresentation(slot.presentation);
  if (presentation) k.presentation = presentation;
  return Object.keys(b).length ? { d: compactDoc(clean), b, k } : { d: compactDoc(clean), k };
}

/**
 * Encode a whole slot. Deflated (FEL2) where CompressionStream exists, else the v1-style FEL1 with the slot fields riding
 * in `k`. `numbers` puts the face sliders in (off by default: a face scan writes them).
 */
export async function encodeSlotCode(slot: Pick<CreatorSlotV2, 'body' | 'base' | 'sliders' | 'frame' | 'doc' | 'presentation'>, o: { numbers?: boolean } = {}): Promise<string> {
  const json = JSON.stringify(slotPayload(slot, o.numbers === true));
  const z = await deflateRaw(new TextEncoder().encode(json));
  if (!z) {
    const payload = toB64Url(json);
    return `FEL${SHARE_CODE_VERSION}.${payload}.${checksum(payload)}`;
  }
  const payload = toB64Url(z);
  return `FEL${SHARE_CODE_VERSION_DEFLATED}.${payload}.${checksum(payload)}`;
}

/** Decode any code, v1 or v2 (a v2 code needs DecompressionStream: without one it is 'unsupported_version'). */
export async function decodeSlotCode(input: unknown): Promise<DecodeResult> {
  if (typeof input !== 'string' || !input.trim()) return { ok: false, error: 'empty' };
  if (input.length > MAX_SHARE_CODE_CHARS * 2) return { ok: false, error: 'too_long' };
  const code = input.replace(/\s+/g, '');
  const m = /^FEL(\d{1,3})\.([A-Za-z0-9_-]+)\.([0-9a-z]{7})$/.exec(code);
  if (!m || Number(m[1]) !== SHARE_CODE_VERSION_DEFLATED) return decodeShareCode(input);
  if (code.length > MAX_SHARE_CODE_CHARS) return { ok: false, error: 'too_long' };
  if (checksum(m[2]) !== m[3]) return { ok: false, error: 'corrupt' };
  const bytes = bytesFromB64Url(m[2]);
  if (!bytes) return { ok: false, error: 'corrupt' };
  if (!streamCtor('DecompressionStream')) return { ok: false, error: 'unsupported_version' };
  const raw = await inflateRaw(bytes, MAX_INFLATED_CHARS);
  if (raw === 'too_long') return { ok: false, error: 'too_long' };
  const json = raw ? utf8(raw) : null;
  if (json == null) return { ok: false, error: 'corrupt' };
  let parsed: unknown;
  try { parsed = JSON.parse(json); } catch { return { ok: false, error: 'corrupt' }; }
  return fromParsed(parsed);
}
