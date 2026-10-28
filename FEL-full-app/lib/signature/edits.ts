// lib/signature/edits.ts — SIGNATURE-PROGRAMS (2026-10-25): the owner's edits to a draft program.
//
// The review page (/coach/admin/programs) lets the owner change any item's exercise (another library entry) and its dose
// (sets, reps or seconds, rest) before approving. An edit is kept on the program's review row (./store.ts, `edits`
// JSON keyed by the item's stable key "<phase>/<session>/<index>") and laid over the program's file on every read, so
// the file stays the draft FEL wrote and the review row is what the owner changed. An edit that leaves the program with
// any problem (./check.ts: an exercise not in the library, a dose the builder would refuse, a jump without its
// contacts …) is refused, never stored.
//
// Pure.
import type { ProgramItem, SignatureProgram } from './types';
import { itemKey } from './plan';

export interface ItemEdit { ex?: string; sets?: number; reps?: string; secs?: number | null; rest?: number }
export type ProgramEdits = Record<string, ItemEdit>;

const int = (v: unknown, lo: number, hi: number): number | undefined =>
  (typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : undefined);

/** An edit as sent, cleaned: unknown fields dropped, numbers in range, text trimmed. null when nothing is left. */
export function cleanEdit(raw: unknown): ItemEdit | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const out: ItemEdit = {};
  if (typeof o.ex === 'string' && /^[a-z0-9-]{2,120}$/.test(o.ex)) out.ex = o.ex;
  const sets = int(o.sets, 1, 10); if (sets !== undefined) out.sets = sets;
  if (typeof o.reps === 'string' && o.reps.trim() && o.reps.trim().length <= 24) out.reps = o.reps.trim();
  if (o.secs === null) out.secs = null;
  else { const secs = int(o.secs, 1, 1800); if (secs !== undefined) out.secs = secs; }
  const rest = int(o.rest, 0, 600); if (rest !== undefined) out.rest = rest;
  return Object.keys(out).length ? out : null;
}

/** Every edit keyed to an item that exists, cleaned. */
export function cleanEdits(p: SignatureProgram, raw: unknown): ProgramEdits {
  const keys = new Set(p.phases.flatMap((ph) => ph.sessions.flatMap((s) => s.items.map((_, i) => itemKey(ph.id, s.key, i)))));
  const out: ProgramEdits = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!keys.has(k)) continue;
    const e = cleanEdit(v);
    if (e) out[k] = e;
  }
  return out;
}

function edited(it: ProgramItem, e: ItemEdit | undefined): ProgramItem {
  if (!e) return it;
  const out: ProgramItem = { ...it };
  if (e.ex) out.ex = e.ex;
  if (e.sets) out.sets = e.sets;
  if (e.secs === null) delete out.secs;
  else if (e.secs) { out.secs = e.secs; if (e.reps === undefined && it.reps && !/each side/.test(it.reps)) delete out.reps; }
  if (e.reps !== undefined) out.reps = e.reps;
  if (e.rest !== undefined) out.rest = e.rest;
  return out;
}

/** The program with the owner's edits laid over it. */
export function applyEdits(p: SignatureProgram, edits: ProgramEdits): SignatureProgram {
  if (!Object.keys(edits).length) return p;
  return {
    ...p,
    phases: p.phases.map((ph) => ({
      ...ph,
      sessions: ph.sessions.map((s) => ({ ...s, items: s.items.map((it, i) => edited(it, edits[itemKey(ph.id, s.key, i)])) })),
    })),
  };
}
