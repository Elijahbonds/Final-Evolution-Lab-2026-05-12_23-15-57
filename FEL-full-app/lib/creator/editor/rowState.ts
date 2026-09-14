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
  if (row.kind === 'rated') {
    const n = Number.isFinite(value as number) ? Math.round(value as number) : (row.defaultValue ?? row.min);
    return `${n}${row.suffix ?? ''}`;
  }
  if (row.kind === 'trait') {
    const t = value as number | null;
    // UNEQUIPPED is the absence of a tier, not a tier called "none" — see the header.
    return t === null || t === undefined || t < 0 ? 'UNEQUIPPED' : (row.tiers[t] ?? 'UNEQUIPPED');
  }
  const v = value as string | null;
  // A SLOT THAT CANNOT BE EMPTY MUST NEVER READ "NONE", and until this was looked at on the running page,
  // every one of them did. An untouched Skin Tone, Build, Footwear or hot zone showed NONE — a state it
  // does not offer, that the resolver would call a violation, and that made a screen full of defaults look
  // like a screen full of holes. A row that must have a value shows its DEFAULT — which is the owning
  // module's (`ZONE_DEFAULT`, `defaultFace()`, `defaultEquipped()`) and only falls back to the head of the
  // list. Getting that second part wrong would have opened every court on FRIGID.
  if (v === null || v === undefined) return (defaultValueFor(row) as string | null) ?? 'NONE';
  return v;
}

/**
 * What a row is worth before anybody has touched it.
 *
 * The save path needs this: a build that never opened Appearance still has a face, and writing `null` into
 * a slot that cannot be empty would produce a profile the resolver refuses on its own next import.
 */
export function defaultValueFor(row: AnyRow): RowValue {
  if (row.kind === 'rated') return row.defaultValue ?? row.min;
  if (row.kind === 'trait') return null;                        // unequipped
  // The owning module's default wins over array order — see SlotRow.defaultOption.
  if (row.defaultOption && row.options.includes(row.defaultOption)) return row.defaultOption;
  return row.allowNone ? null : (row.options[0] ?? null);
}

/** The ceiling shown beside a rated row, or null when nothing caps it. */
export function rowCeiling(row: AnyRow, axes: Axes): number | null {
  return row.kind === 'rated' ? ceilingFor(row as RatedRow, axes) : null;
}

/** One press of ◀ or ▶. Returns the new value; never throws, never leaves the legal range. */
export function step(row: AnyRow, value: RowValue, dir: -1 | 1, axes: Axes): RowValue {
  if (row.kind === 'rated') {
    const r = row as RatedRow;
    const now = Number.isFinite(value as number) ? (value as number) : (r.defaultValue ?? r.min);
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
  // Stepping from nothing steps from what the row is SHOWING, which is its default and not necessarily
  // the head of the list.
  const from = (value as string | null) ?? (defaultValueFor(r) as string | null);
  const i = opts.indexOf(from ?? null);
  const at = i < 0 ? 0 : i;
  const next = at + dir;
  if (next < 0 || next >= opts.length) return opts[at] ?? null;   // the ends hold rather than wrap
  return opts[next] ?? null;
}

/**
 * Whether ◀ / ▶ would change anything — the component greys the stepper when it would not.
 *
 * Asked about the value the row is SHOWING, not the one stored. An untouched required slot stores nothing
 * and shows its first option, and comparing against the stored null left ◀ lit on a row where pressing it
 * could only produce the option already on screen: a live button whose entire effect is to look broken.
 */
export function canStep(row: AnyRow, value: RowValue, dir: -1 | 1, axes: Axes): boolean {
  const now = value === undefined || value === null ? defaultValueFor(row) : value;
  return step(row, now, dir, axes) !== now;
}
