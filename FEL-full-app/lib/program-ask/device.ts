// lib/program-ask/device.ts — PROGRAM-ASK (2026-11-02): the program, saved ON THIS PHONE first.
//
// One localStorage key. What is kept: the ask (its words and the chips' edits, so the server can build the same program
// again: the build is deterministic), the program itself while it fits (so the week view opens with no request), when it
// was started, which sessions are done ("w1:d1" → ISO time) and the checkpoint decisions. No number about a body, no
// health answer. Never sent anywhere by this file. An under-18's program lives only here (the signature programs' youth
// rule, lib/signature/deviceProgress.ts). Every storage access is in try/catch; a corrupt value reads as nothing saved.
//
// PROGRAM-ASK-2: an adult's plan is ALSO kept on the account once prisma/pending/2026-11-03-program-ask.sql is applied
// (./accountStore.ts, ./accountServer.ts, /api/program-ask/saved); mergeAccount lays that copy over this one. Until then,
// and always under youth rules, this key is the only copy.
import type { StorageLike } from '@/lib/signature/deviceProgress';
import type { Decision } from './checkpoint';
import type { RequestEdits } from './request';
import type { BuiltProgram } from './types';

export const PROGRAM_DEVICE_KEY = 'fel.program-ask.v1';
/** A saved program bigger than this is kept as its ask only (rebuilt by the server on open). */
export const MAX_SAVED_CHARS = 1_500_000;

export interface SavedProgram {
  question: string;
  edits: RequestEdits;
  /** The program as built, or null when it was too big to keep (the page asks the server again). */
  program: BuiltProgram | null;
  programId: string;
  savedAt: string;
  startedAt: string | null;
  done: Record<string, string>;
  decisions: Decision[];
}

const SESSION = /^w\d{1,2}:d\d$/;
const KINDS = new Set(['advance', 'repeat', 'repeat-lighter']);

export function readSaved(s: StorageLike | null): SavedProgram | null {
  if (!s) return null;
  try {
    const v = JSON.parse(s.getItem(PROGRAM_DEVICE_KEY) ?? 'null') as Partial<SavedProgram> | null;
    if (!v || typeof v !== 'object' || typeof v.question !== 'string' || typeof v.programId !== 'string') return null;
    const done: Record<string, string> = {};
    for (const [k, at] of Object.entries(v.done ?? {})) if (SESSION.test(k) && typeof at === 'string') done[k] = at;
    const decisions = (Array.isArray(v.decisions) ? v.decisions : []).filter((d): d is Decision => !!d && typeof d.afterWeek === 'number' && KINDS.has(d.kind as string));
    const program = v.program && typeof v.program === 'object' && Array.isArray((v.program as BuiltProgram).weeks) ? v.program as BuiltProgram : null;
    return {
      question: v.question, edits: v.edits && typeof v.edits === 'object' ? v.edits : {}, program, programId: v.programId,
      savedAt: typeof v.savedAt === 'string' ? v.savedAt : new Date(0).toISOString(), startedAt: typeof v.startedAt === 'string' ? v.startedAt : null,
      done, decisions,
    };
  } catch {
    return null;
  }
}

function write(s: StorageLike | null, v: SavedProgram): boolean {
  if (!s) return false;
  try {
    let text = JSON.stringify(v);
    if (text.length > MAX_SAVED_CHARS) text = JSON.stringify({ ...v, program: null });
    s.setItem(PROGRAM_DEVICE_KEY, text);
    return true;
  } catch {
    try { s.setItem(PROGRAM_DEVICE_KEY, JSON.stringify({ ...v, program: null })); return true; } catch { return false; }
  }
}

/** Save a newly built program. A different program replaces the old one (its done marks go with it). */
export function saveProgram(s: StorageLike | null, question: string, edits: RequestEdits, p: BuiltProgram, now: Date = new Date()): SavedProgram | null {
  const prev = readSaved(s);
  const same = prev?.programId === p.id;
  const v: SavedProgram = {
    question, edits, program: p, programId: p.id, savedAt: now.toISOString(),
    startedAt: same ? prev!.startedAt : null, done: same ? prev!.done : {}, decisions: same ? prev!.decisions : [],
  };
  return write(s, v) ? v : null;
}

export function markDone(s: StorageLike | null, sessionId: string, now: Date = new Date()): SavedProgram | null {
  const v = readSaved(s);
  if (!v || !SESSION.test(sessionId)) return null;
  if (!v.done[sessionId]) v.done[sessionId] = now.toISOString();
  if (!v.startedAt) v.startedAt = now.toISOString();
  return write(s, v) ? v : null;
}

export function addDecision(s: StorageLike | null, d: Decision): SavedProgram | null {
  const v = readSaved(s);
  if (!v || !KINDS.has(d.kind) || v.decisions.some((x) => x.afterWeek === d.afterWeek)) return v;
  v.decisions.push({ afterWeek: d.afterWeek, kind: d.kind });
  return write(s, v) ? v : null;
}

export function forgetProgram(s: StorageLike | null): void {
  try { s?.removeItem(PROGRAM_DEVICE_KEY); } catch { /* nothing to do */ }
}

/**
 * PROGRAM-ASK-2: the account's copy laid over the phone's (a new phone, or a second one). Same program: the done marks
 * join and the longer list of checkpoint decisions wins. A different program on the account is not merged.
 */
export function mergeAccount(s: StorageLike | null, account: { programId: string; done: Record<string, string>; decisions: Decision[] } | null): SavedProgram | null {
  const v = readSaved(s);
  if (!v || !account || account.programId !== v.programId) return v;
  const done = { ...account.done, ...v.done };
  for (const k of Object.keys(done)) if (!SESSION.test(k)) delete done[k];
  const decisions = account.decisions.length > v.decisions.length ? account.decisions.filter((d) => KINDS.has(d.kind)) : v.decisions;
  const next = { ...v, done, decisions };
  return write(s, next) ? next : v;
}

/** What the account keeps of a saved plan (never the program: the ask rebuilds it). */
export const accountBody = (v: SavedProgram) => ({ question: v.question, edits: v.edits, programId: v.programId, done: v.done, decisions: v.decisions });
