// WHAT A ROW CURRENTLY SHOWS, AND WHAT A STEP DOES TO IT (2026-09-14).
//
// The generic editor screen renders three kinds of row — a 0–99 rated attribute, a tiered trait, an
// animation slot — and the spec's whole point is that it must not know which. So the per-kind knowledge
// lives HERE, as pure functions, and the component asks two questions: what does this row read as, and
// what does ◀ / ▶ do to it.
//
// Pure and separate from the component on purpose: this is the part with the edge cases (a trait stepping
// down off tier 0 is UNEQUIPPED, not tier −1; a rated row cannot step past its PRQ ceiling), and a rule
// that lives inside a React component cannot be unit-tested without mounting one.

import type { AnyRow, RatedRow, TraitRow, SlotRow, PrqAxisId } from '../schema/types';
import { ceilingFor, clampToCeiling } from '../schema/ceilings';

export type RowValue = number | string | null;
export type Axes = Partial<Record<PrqAxisId, number>> | null | undefined;

/** The string the row's value control shows. */
export function displayValue(row: AnyRow, value: RowValue): string {
  if (row.kind === 'rated') return String(Number.isFinite(value as number) ? Math.round(value as number) : row.min);
  if (row.kind === 'trait') {
    const t = value as number | null;
    // UNEQUIPPED is the absence of a tier, not a tier called "none" — see the header.
    return t === null || t === undefined || t < 0 ? 'UNEQUIPPED' : (row.tiers[t] ?? 'UNEQUIPPED');
  }
  const v = value as string | null;
  return v === null || v === undefined ? 'NONE' : v;
}

/** The ceiling shown beside a rated row, or null when nothing caps it. */
export function rowCeiling(row: AnyRow, axes: Axes): number | null {
  return row.kind === 'rated' ? ceilingFor(row as RatedRow, axes) : null;
}

/** One press of ◀ or ▶. Returns the new value; never throws, never leaves the legal range. */
export function step(row: AnyRow, value: RowValue, dir: -1 | 1, axes: Axes): RowValue {
  if (row.kind === 'rated') {
    const r = row as RatedRow;
    const now = Number.isFinite(value as number) ? (value as number) : r.min;
    return clampToCeiling(r, now + dir, axes);
  }
  if (row.kind === 'trait') {
    const r = row as TraitRow;
    const now = value === null || value === undefined ? -1 : Math.round(value as number);
    const next = now + dir;
    if (next < 0) return null;                       // stepping down off the first tier unequips it
    if (next >= r.tiers.length) return now;          // and the top of the ladder is the top
    return next;
  }
  const r = row as SlotRow;
  const opts: (string | null)[] = r.allowNone ? [null, ...r.options] : [...r.options];
  const i = opts.indexOf((value as string | null) ?? null);
  const at = i < 0 ? 0 : i;
  const next = at + dir;
  if (next < 0 || next >= opts.length) return opts[at] ?? null;   // the ends hold rather than wrap
  return opts[next] ?? null;
}

/** Whether ◀ / ▶ would change anything — the component greys the stepper when it would not. */
export function canStep(row: AnyRow, value: RowValue, dir: -1 | 1, axes: Axes): boolean {
  const next = step(row, value, dir, axes);
  const a = value === undefined ? null : value;
  return next !== a;
}
