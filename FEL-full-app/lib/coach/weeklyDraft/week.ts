// lib/coach/weeklyDraft/week.ts — COACH-AI-DRAFT (2026-10-24): which week a draft is for, and stable change ids.
//
// IDEMPOTENT BY CONSTRUCTION. A week is named by its Monday (UTC, 'YYYY-MM-DD'), so every request in the same week asks
// for the same draft; the store keeps one per coach × client × program × week (a unique key), and a change's id is a hash
// of what it does and to which rows, so the same data drafts the same ids. Approving a change twice writes once
// (./approve.ts reads the decision first; the store's unique key is the backstop).

const DAY = 86_400_000;

/** The Monday (UTC) of the week `nowMs` falls in, as 'YYYY-MM-DD'. assumption: UTC weeks; the server has no account zone. */
export function weekKeyOf(nowMs: number): string {
  const d = new Date(nowMs);
  const dow = (d.getUTCDay() + 6) % 7; // Monday 0 … Sunday 6
  const monday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - dow * DAY;
  return new Date(monday).toISOString().slice(0, 10);
}

export const isWeekKey = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** FNV-1a, 32-bit: a short, stable, dependency-free hash (not for security: ids only). */
export function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** A change's id: its kind and the hash of what it writes. Same rows, same values → same id. */
export function changeId(kind: string, signature: unknown): string {
  return `${kind}-${fnv1a32(JSON.stringify(signature)).toString(36)}`;
}
