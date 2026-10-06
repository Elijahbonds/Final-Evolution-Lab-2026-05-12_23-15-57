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

import { CREATOR_DOC_VERSION, type CreatorDoc, type CreatorPart, type PaintLayer } from './doc';
import { sanitizeCreatorDoc, sanitizeLookBase, type LookBase } from './sanitize';

export const SHARE_CODE_VERSION = 1;
/** A sanitised doc is at most MAX_DOC_CHARS of JSON; base64 adds a third. Anything longer is not one of ours. */
export const MAX_SHARE_CODE_CHARS = 40_000;

export type DecodeError = 'empty' | 'too_long' | 'not_a_code' | 'unsupported_version' | 'corrupt' | 'invalid';
export type DecodeResult = { ok: true; doc: CreatorDoc; base: LookBase } | { ok: false; error: DecodeError };

// ── base64url over UTF-8 ─────────────────────────────────────────────────────────────────────────────────────────────
function toB64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64Url(s: string): string | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch { return null; }
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
  if (Object.keys(d.shape.face).length || Object.keys(d.shape.body).length) o.shape = d.shape;
  if (d.flags.suit) o.flags = { suit: true };
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
  const p = parsed as { d?: unknown; b?: unknown } | null;
  const doc = sanitizeCreatorDoc(p && typeof p === 'object' ? p.d : null);
  if (!doc) return { ok: false, error: 'invalid' };
  return { ok: true, doc, base: sanitizeLookBase(p!.b) };
}
