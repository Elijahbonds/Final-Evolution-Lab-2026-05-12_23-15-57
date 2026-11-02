// lib/coach/weeklyDraft/contacts.ts — YOUTH-CONTACT-CAP (2026-10-26): jump contacts per session, and max-effort isometrics.
//
// WHAT WAS WRONG (fel-specs/YOUTH-RULE-CHECK-26c1b4ab-2026-10-24.md, items 1 and 2). The draft engine counted sets, never
// contacts: a teen's Pogo hops went 3 → 4 sets with no count, and a coach edit to 4 × "25 contacts" (100 contacts) was
// classed "review". And there was no isometric concept at all, so a draft could add a set to a max-effort isometric a
// coach had already written for a teen.
//
// THE RULES (owner's youth rules):
//   · under youth rules a session holds at most MAX_TEEN_SESSION_CONTACTS jump/landing contacts. A contact is one rep of
//     protocol-gated work (plyometrics, depth drops: lib/coach/protocolGate.ts), counted as sets × the TOP of the rep
//     range ("8-10" → 10), doubled for "each side" / "each leg". A change that would take a session past the cap is
//     unsafe (held by the rules engine, refused on a coach's edit); a change that lowers the count is never blocked by it;
//   · under youth rules no set is ever added to a max-effort isometric (max-effort isometrics are for adults);
//   · PM ruling 2026-10-26: under youth rules ANY increase in sets or reps on jump work is held, whatever the count — more
//     jumps for a teen are the coach's own call, written by hand. The session cap stays on top of it.
//
// Pure, client-safe.

import { isProtocolGated } from '../protocolGate';
import { MAX_EFFORT_CUE } from '../taxonomy';
import { rpeOf } from './dose';
import { LIMIT_EFFORT, MAX_TEEN_SESSION_CONTACTS } from './thresholds';
import type { DraftCatalogueRow, DraftOp, OpFields } from './types';

const TIMED_OR_DISTANCE = /^(?:s|secs?|seconds?|min|mins|minutes?|m|meters?|metres?|yds?|yards?|ft|feet)\b/i;
const PER_SIDE = /\b(?:each|per)\s+(?:side|leg|foot|arm|way)\b|\/\s*(?:side|leg)\b|\beach\b/i;

/**
 * Contacts in one set, read from a prescription's reps: "8-10" → 10, "10 contacts" → 10, "3x10" → 10, "5 each leg" → 10.
 * A timed or distance prescription ("30 s", "20 m"), "AMRAP" or anything else that cannot be counted → null.
 */
export function contactsPerSet(reps: string): number | null {
  const t = reps.trim();
  const m = /^(?:\d+\s*[x×]\s*)?(\d+)(?:\s*[-–]\s*(\d+))?\s*(.*)$/i.exec(t);
  if (!m) return null;
  const hi = Number(m[2] ?? m[1]);
  if (!(hi > 0)) return null;
  const rest = m[3] ?? '';
  if (TIMED_OR_DISTANCE.test(rest)) return null;
  return PER_SIDE.test(rest) ? hi * 2 : hi;
}

/** The amount a reps field asks for and its unit words, for "more reps" ("8-10" → 10 ''; "30 s" → 30 's'). */
export function repsAmount(reps: string): { n: number; unit: string } | null {
  const m = /^(?:\d+\s*[x×]\s*)?(\d+)(?:\s*[-–]\s*(\d+))?\s*(.*)$/i.exec(reps.trim());
  if (!m) return null;
  const n = Number(m[2] ?? m[1]);
  return n > 0 ? { n, unit: (m[3] ?? '').trim().toLowerCase() } : null;
}

/** More reps (or a longer hold) than before, in the same unit. */
export function repsUp(before: string, after: string): boolean {
  const b = repsAmount(before), a = repsAmount(after);
  return !!a && !!b && a.unit === b.unit && a.n > b.n;
}

const gated = (exerciseId: string, cat: ReadonlyMap<string, DraftCatalogueRow>) => isProtocolGated(cat.get(exerciseId) ?? null);

/** Contacts one row asks for: 0 when it is not jump work, null when it is but cannot be counted. */
export function rowContacts(row: Pick<OpFields, 'exerciseId' | 'sets' | 'reps'>, cat: ReadonlyMap<string, DraftCatalogueRow>): number | null {
  if (!gated(row.exerciseId, cat)) return 0;
  const per = contactsPerSet(row.reps);
  return per == null ? null : row.sets * per;
}

/** A session's contacts as written (rows that cannot be counted count 0; a change to one is judged by classify). */
export function sessionContacts(rows: readonly Pick<OpFields, 'exerciseId' | 'sets' | 'reps'>[], cat: ReadonlyMap<string, DraftCatalogueRow>): number {
  return rows.reduce((sum, r) => sum + (rowContacts(r, cat) ?? 0), 0);
}

export interface SessionContactDelta { sessionId: string; sessionLabel: string; before: number; delta: number; uncountable: boolean }

/** What a change's update ops do to each session's contacts. */
export function contactDeltas(ops: readonly DraftOp[], cat: ReadonlyMap<string, DraftCatalogueRow>): SessionContactDelta[] {
  const by = new Map<string, SessionContactDelta>();
  for (const op of ops) {
    if (op.action !== 'update') continue;
    const d = by.get(op.sessionId) ?? { sessionId: op.sessionId, sessionLabel: op.sessionLabel, before: 0, delta: 0, uncountable: false };
    const b = rowContacts(op.before, cat) ?? 0;
    const a = rowContacts(op.after, cat);
    const changed = op.after.sets !== op.before.sets || op.after.reps !== op.before.reps || op.after.exerciseId !== op.before.exerciseId;
    if (a == null && changed) d.uncountable = true;
    d.before += b;
    d.delta += (a ?? b) - b;
    by.set(op.sessionId, d);
  }
  return [...by.values()];
}

/** A change raises sets or reps on protocol-gated (jump/drop) work. */
export function jumpVolumeUp(ops: readonly DraftOp[], cat: ReadonlyMap<string, DraftCatalogueRow>): boolean {
  return ops.some((op) => op.action === 'update' && (gated(op.before.exerciseId, cat) || gated(op.after.exerciseId, cat))
    && (op.after.sets > op.before.sets || repsUp(op.before.reps, op.after.reps)));
}

/** The youth contact problem for a change, or null. `current` = each session's contacts as written now (by session id). */
export function contactProblem(ops: readonly DraftOp[], cat: ReadonlyMap<string, DraftCatalogueRow>, current?: Readonly<Record<string, number>>): string | null {
  for (const d of contactDeltas(ops, cat)) {
    if (d.uncountable) return `Under 18: FEL can't count the jump contacts in ${d.sessionLabel} as written. Write the reps as a number (like "8-10") so the session stays at ${MAX_TEEN_SESSION_CONTACTS} or fewer.`;
    if (d.delta <= 0) continue;
    const total = (current?.[d.sessionId] ?? d.before) + d.delta;
    if (total > MAX_TEEN_SESSION_CONTACTS) return `Under 18: ${d.sessionLabel} would come to ${total} jump contacts. FEL keeps a session at ${MAX_TEEN_SESSION_CONTACTS} or fewer for athletes under 18.`;
  }
  return null;
}

const ISOMETRIC = /\b(?:isometrics?|iso|overcoming)\b/i;
const MAX_WORD = /\bmax\b/i;

/** An isometric (any case): the catalogue row's name or category says so ("Overcoming isometric", "Iso split-squat push"). */
export function isIsometric(row: Pick<DraftCatalogueRow, 'name' | 'category'> | null | undefined, name = ''): boolean {
  return ISOMETRIC.test(`${row?.name ?? ''} ${name}`) || ISOMETRIC.test(row?.category ?? '');
}

/** A max-effort isometric: an isometric written at Full throttle, at RPE 10, or with max-effort words in its name or load. */
export function isMaxEffortIsometric(f: OpFields, row: DraftCatalogueRow | null | undefined): boolean {
  if (!isIsometric(row, f.exerciseName)) return false;
  const text = `${row?.name ?? ''} ${f.exerciseName} ${f.load} ${f.reps}`;
  const rpe = rpeOf(f.load);
  return f.effortBand === 'full' || (rpe != null && rpe >= LIMIT_EFFORT) || MAX_EFFORT_CUE.test(text) || MAX_WORD.test(text);
}
