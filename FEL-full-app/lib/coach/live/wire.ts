// lib/coach/live/wire.ts — COACH-LIVE (2026-10-25): what travels between the client's phone and the coach.
//
// Two kinds of message, on two data channels of the one peer connection (lib/coach/live/link.ts):
//
//   POSE (unreliable, unordered: a late frame is worth nothing, so it is never resent). A compact binary frame,
//   POSE_BYTES long: a 10-byte header and the POSE_POINTS landmarks the overlay and a later re-read need — the nose,
//   the ears, the arms, the hips and the legs (the face's other ten points and the hands' six are left out). x and y
//   are quantised to 16 bits over [XY_MIN, XY_MAX] (a landmark may sit off the picture), visibility to 8 bits; depth is
//   not sent. No picture, ever: numbers only.
//
//   CONTROL (reliable, ordered): small JSON messages — the set's start and stop, each closed rep with its flags, a cue
//   by its key, the clock's ping, the end. Every message from the other side is UNTRUSTED: parseCtl takes only the
//   shapes below, with bounded numbers and strings, and drops the rest.
//
// Pure: no DOM, no network.

import type { Lm, PoseFrame } from '@/lib/pose/landmarks';
import { LANDMARK_COUNT } from '@/lib/pose/landmarks';
import { isLiveFault, isLiveMovement, type FaultSide, type LiveMovement } from './movements';
import type { LiveRep } from './reader';

// ── pose frames ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** The landmarks sent: nose, ears, shoulders, elbows, wrists, hips, knees, ankles, heels, toes (MediaPipe indices). */
export const POSE_POINTS: readonly number[] = [0, 7, 8, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32];
export const POSE_KIND = 1;
const HEADER = 10;
const PER_POINT = 5;
export const POSE_BYTES = HEADER + POSE_POINTS.length * PER_POINT;
export const XY_MIN = -0.5;
export const XY_MAX = 1.5;
const U16 = 65535;

export interface WirePose {
  seq: number;
  /** The capture time on the SENDER's clock (ms, mod 2^32). */
  t: number;
  /** ms from capture to send on the sender's side (the pose model's time and the thinning wait), capped at 65535. */
  lag: number;
  present: boolean;
  /** 33 landmarks (LANDMARK_NAMES order); the ones not sent are { 0, 0, 0, v: 0 }. Empty when not present. */
  image: Lm[];
}

const q = (x: number) => Math.max(0, Math.min(U16, Math.round(((x - XY_MIN) / (XY_MAX - XY_MIN)) * U16)));
const dq = (n: number) => XY_MIN + (n / U16) * (XY_MAX - XY_MIN);

/** One frame → POSE_BYTES bytes. `seq` wraps at 16 bits; `sentAt` is the send time on the same clock as f.t. */
export function encodePose(f: PoseFrame, seq: number, sentAt: number): ArrayBuffer {
  const buf = new ArrayBuffer(POSE_BYTES);
  const dv = new DataView(buf);
  const present = f.present && f.image.length >= LANDMARK_COUNT;
  dv.setUint8(0, POSE_KIND);
  dv.setUint8(1, present ? 1 : 0);
  dv.setUint16(2, seq & 0xffff);
  dv.setUint32(4, Math.max(0, Math.round(f.t)) >>> 0);
  dv.setUint16(8, Math.max(0, Math.min(U16, Math.round(sentAt - f.t))));
  if (present) {
    POSE_POINTS.forEach((idx, i) => {
      const l = f.image[idx];
      const o = HEADER + i * PER_POINT;
      dv.setUint16(o, q(l.x));
      dv.setUint16(o + 2, q(l.y));
      dv.setUint8(o + 4, Math.max(0, Math.min(255, Math.round(l.v * 255))));
    });
  }
  return buf;
}

/** POSE_BYTES bytes → a frame, or null for anything else (wrong length or kind). */
export function decodePose(buf: ArrayBuffer | ArrayBufferView): WirePose | null {
  const ab = buf instanceof ArrayBuffer ? buf : buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  if (!(ab instanceof ArrayBuffer) || ab.byteLength !== POSE_BYTES) return null;
  const dv = new DataView(ab);
  if (dv.getUint8(0) !== POSE_KIND) return null;
  const present = (dv.getUint8(1) & 1) === 1;
  const image: Lm[] = [];
  if (present) {
    for (let i = 0; i < LANDMARK_COUNT; i++) image.push({ x: 0, y: 0, z: 0, v: 0 });
    POSE_POINTS.forEach((idx, i) => {
      const o = HEADER + i * PER_POINT;
      image[idx] = { x: dq(dv.getUint16(o)), y: dq(dv.getUint16(o + 2)), z: 0, v: dv.getUint8(o + 4) / 255 };
    });
  }
  return { seq: dv.getUint16(2), t: dv.getUint32(4), lag: dv.getUint16(8), present, image };
}

/** Base64 for the server relay (lib/coach/live/link.ts uses it only when the direct path failed). */
export function toBase64(buf: ArrayBuffer): string {
  const b = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
}
export function fromBase64(s: string): ArrayBuffer | null {
  if (typeof s !== 'string' || s.length > 4 * POSE_BYTES) return null;
  try {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
  } catch {
    return null;
  }
}

// ── control messages ─────────────────────────────────────────────────────────────────────────────────────────────────

/** A rep as the wire carries it: the reader's rep without its clock (the coach has no use for the client's ms). */
export interface WireRep { n: number; faults: string[]; sides: Record<string, FaultSide>; read: boolean }

export type Ctl =
  | { t: 'hello'; role: 'coach' | 'client'; video: boolean }
  | { t: 'ping'; a: number }
  | { t: 'pong'; a: number; b: number }
  | { t: 'exercise'; movement: LiveMovement }
  | { t: 'set_start'; set: number; movement: LiveMovement }
  | { t: 'set_stop'; set: number }
  | { t: 'rep'; set: number; movement: LiveMovement; rep: WireRep }
  | { t: 'set_done'; set: number; movement: LiveMovement; reps: WireRep[] }
  | { t: 'cue'; id: number; key: string }
  | { t: 'cue_ack'; id: number }
  | { t: 'end' };

export const CTL_MAX_CHARS = 16_000;
const MAX_ID = 1_000_000;
const MAX_REPS = 60;

const int = (v: unknown, max = MAX_ID): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max;
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 1e13;
const SIDES = new Set(['left', 'right', 'both']);

export function wireRep(r: Pick<LiveRep, 'n' | 'faults' | 'sides' | 'read'>): WireRep {
  return { n: r.n, faults: [...r.faults], sides: { ...r.sides }, read: r.read };
}

function parseRep(v: unknown, movement: LiveMovement): WireRep | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  if (!int(r.n, MAX_REPS) || r.n < 1 || typeof r.read !== 'boolean' || !Array.isArray(r.faults) || r.faults.length > 8) return null;
  const faults = r.faults.filter((f): f is string => isLiveFault(movement, f));
  if (faults.length !== r.faults.length) return null;
  const sides: Record<string, FaultSide> = {};
  if (r.sides && typeof r.sides === 'object') {
    for (const [k, s] of Object.entries(r.sides as Record<string, unknown>)) {
      if (!faults.includes(k) || typeof s !== 'string' || !SIDES.has(s)) return null;
      sides[k] = s as FaultSide;
    }
  }
  return { n: r.n, faults, sides, read: r.read };
}

/** The other side's control message, or null. Never throws. */
export function parseCtl(raw: unknown): Ctl | null {
  let v: unknown = raw;
  if (typeof raw === 'string') {
    if (raw.length > CTL_MAX_CHARS) return null;
    try { v = JSON.parse(raw); } catch { return null; }
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const m = v as Record<string, unknown>;
  switch (m.t) {
    case 'hello':
      return (m.role === 'coach' || m.role === 'client') && typeof m.video === 'boolean' ? { t: 'hello', role: m.role, video: m.video } : null;
    case 'ping': return num(m.a) ? { t: 'ping', a: m.a } : null;
    case 'pong': return num(m.a) && num(m.b) ? { t: 'pong', a: m.a, b: m.b } : null;
    case 'exercise': return isLiveMovement(m.movement) ? { t: 'exercise', movement: m.movement } : null;
    case 'set_start': return int(m.set) && isLiveMovement(m.movement) ? { t: 'set_start', set: m.set, movement: m.movement } : null;
    case 'set_stop': return int(m.set) ? { t: 'set_stop', set: m.set } : null;
    case 'rep': {
      if (!int(m.set) || !isLiveMovement(m.movement)) return null;
      const rep = parseRep(m.rep, m.movement);
      return rep ? { t: 'rep', set: m.set, movement: m.movement, rep } : null;
    }
    case 'set_done': {
      if (!int(m.set) || !isLiveMovement(m.movement) || !Array.isArray(m.reps) || m.reps.length > MAX_REPS) return null;
      const movement = m.movement;
      const reps = m.reps.map((r) => parseRep(r, movement));
      return reps.every((r): r is WireRep => r !== null) ? { t: 'set_done', set: m.set, movement, reps } : null;
    }
    case 'cue': return int(m.id) && typeof m.key === 'string' && m.key.length <= 64 ? { t: 'cue', id: m.id, key: m.key } : null;
    case 'cue_ack': return int(m.id) ? { t: 'cue_ack', id: m.id } : null;
    case 'end': return { t: 'end' };
    default: return null;
  }
}
