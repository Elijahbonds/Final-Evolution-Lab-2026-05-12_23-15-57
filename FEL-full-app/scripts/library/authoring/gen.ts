// Helpers for the matrix-built families of batches 2 and 3: a variant in one line, levels by number, and the cross
// product of two axes with a rule for which cells make sense. The words still come from the family files, one axis at
// a time, so every generated name, cue and dose is something a coach would read and recognise.
import type { LevelId } from '../../../lib/library/vocab';
import type { Variant } from './types';

export const LV: readonly LevelId[] = ['beginner', 'intermediate', 'advanced'];
export const lv = (n: number): LevelId => LV[Math.max(0, Math.min(2, n))];

export const va = (name: string, v: string, level: LevelId | number, over: Partial<Variant> = {}): Variant =>
  ({ name, v, level: typeof level === 'number' ? lv(level) : level, ...over });

/** A short key for a variant from its parts. */
export const key = (...parts: string[]): string => parts.join('-').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
