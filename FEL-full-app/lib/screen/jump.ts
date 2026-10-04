// jump — the jump-only result's number (SCREEN-JUMP-ONLY).
//
// Inches by default, from the same 2.54 cm conversion the rest of the screen uses (lib/assess/why.ts inches).
// Centimetres are one decimal. The choice is this tab's sessionStorage (fel.screen.unit), so "Done, clear my
// results" removes it with the other screen keys. It is never sent.
//
// Pure aside from the injected store.
import { inches } from '@/lib/assess/why';
import { SCREEN_PREFIX, type StorageLike } from './store';

export const JUMP_UNIT_KEY = `${SCREEN_PREFIX}unit`;
export type JumpUnit = 'in' | 'cm';

const CM_PER_IN = 2.54;

/** Inches to centimetres, one decimal. 10 in → 25.4 cm. */
export function cmFromInches(n: number): number {
  return Math.round(n * CM_PER_IN * 10) / 10;
}

/** The big number. Inches use why.ts inches(); centimetres are one decimal. */
export function formatJumpCm(heightCm: number, unit: JumpUnit): string {
  if (unit === 'cm') return `${(Math.round(heightCm * 10) / 10).toFixed(1)} cm`;
  return `${inches(heightCm).toFixed(1)} in`;
}

export function readJumpUnit(s: StorageLike | null): JumpUnit {
  try {
    return s?.getItem(JUMP_UNIT_KEY) === 'cm' ? 'cm' : 'in';
  } catch { return 'in'; }
}

export function writeJumpUnit(s: StorageLike | null, unit: JumpUnit): void {
  try { s?.setItem(JUMP_UNIT_KEY, unit); } catch { /* the toggle's own state still shows it */ }
}
