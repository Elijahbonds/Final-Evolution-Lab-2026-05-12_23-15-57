// The on-device intake answers (fel.intake.v1). This file is the eraser only, so the Quick Screen can drop the
// key when a run's age band is not an adult without importing the health intake module.
//
// The blob itself is written by lib/health/intakeMemory.ts. Nothing here sends it.

export const INTAKE_MEMORY_KEY = 'fel.intake.v1';

function localStore(): Pick<Storage, 'getItem' | 'removeItem'> | null {
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; }
}

/** Erase saved intake answers. A missing store, or a key that is not there, is a no-op. */
export function forgetIntakeMemory(s?: Pick<Storage, 'getItem' | 'removeItem'> | null): void {
  const store = s === undefined ? localStore() : s;
  try { if (store && store.getItem(INTAKE_MEMORY_KEY) !== null) store.removeItem(INTAKE_MEMORY_KEY); } catch { /* none */ }
}
