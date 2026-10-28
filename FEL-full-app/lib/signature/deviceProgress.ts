// lib/signature/deviceProgress.ts — SIGNATURE-PROGRAMS (2026-10-25): an under-18's progress, kept ON THIS PHONE.
//
// Under youth rules (under 18, or no birth year) the server writes nothing about a signature program: the free week's
// done sessions live here, one localStorage key, the way the readiness check's and the Mirror's under-18 history do
// (lib/coach/readiness/deviceHistory.ts, lib/mirror/deviceProgress.ts). What is kept: the program id, when it was
// started on this phone, and which session instances ("w1:A") are done — no number, no health answer. Never sent.
// Every storage access is in try/catch (private browsing and blocked site data throw or come back empty); a corrupt
// value reads as nothing started.
import type { SignatureId } from './types';

export const DEVICE_KEY = 'fel.signature.v1';

export interface StorageLike { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

export interface DeviceProgram { startedAt: string; done: Record<string, string> }
type Store = Partial<Record<SignatureId, DeviceProgram>>;

const SESSION = /^w\d{1,2}:[A-Z]$/;

function readAll(s: StorageLike | null): Store {
  if (!s) return {};
  try {
    const v = JSON.parse(s.getItem(DEVICE_KEY) ?? '{}') as unknown;
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    const out: Store = {};
    for (const [k, p] of Object.entries(v as Record<string, unknown>)) {
      const o = p as { startedAt?: unknown; done?: unknown } | null;
      if (!o || typeof o.startedAt !== 'string' || !o.done || typeof o.done !== 'object') continue;
      const done: Record<string, string> = {};
      for (const [sid, at] of Object.entries(o.done as Record<string, unknown>)) if (SESSION.test(sid) && typeof at === 'string') done[sid] = at;
      out[k as SignatureId] = { startedAt: o.startedAt, done };
    }
    return out;
  } catch {
    return {};
  }
}

function writeAll(s: StorageLike | null, v: Store): boolean {
  if (!s) return false;
  try { s.setItem(DEVICE_KEY, JSON.stringify(v)); return true; } catch { return false; }
}

export const readDeviceProgram = (s: StorageLike | null, id: SignatureId): DeviceProgram | null => readAll(s)[id] ?? null;

export function startDeviceProgram(s: StorageLike | null, id: SignatureId, now: Date = new Date()): DeviceProgram | null {
  const all = readAll(s);
  if (!all[id]) all[id] = { startedAt: now.toISOString(), done: {} };
  return writeAll(s, all) ? all[id]! : null;
}

export function markDeviceDone(s: StorageLike | null, id: SignatureId, sessionId: string, now: Date = new Date()): DeviceProgram | null {
  if (!SESSION.test(sessionId)) return null;
  const all = readAll(s);
  const p = all[id] ?? { startedAt: now.toISOString(), done: {} };
  if (!p.done[sessionId]) p.done[sessionId] = now.toISOString();
  all[id] = p;
  return writeAll(s, all) ? p : null;
}

export function forgetDeviceProgram(s: StorageLike | null, id: SignatureId): void {
  const all = readAll(s);
  delete all[id];
  writeAll(s, all);
}

/** The page's localStorage, or null when there is none or touching it throws. */
export function deviceStorage(): StorageLike | null {
  try {
    const w = (globalThis as { window?: { localStorage?: StorageLike } }).window;
    const st = w?.localStorage;
    return st && typeof st.getItem === 'function' ? st : null;
  } catch {
    return null;
  }
}
