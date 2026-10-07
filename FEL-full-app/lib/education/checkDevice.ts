// checkDevice — a chapter check's result kept ON THIS DEVICE, for an account the server keeps nothing for.
//
// EDU-LINKS (2026-10-07). Under 18 or an unknown age, the chapter check is graded on the server and nothing is written
// there (lib/education/server/checkRoutes.ts). The owner's 2026-10-07 decision 1 keeps a teen's progress on the device,
// so the device remembers their best score per chapter: that is all, no answers. Every storage call is wrapped — a
// private window or blocked storage reads as "nothing kept" and never breaks the check.

export const DEVICE_KEY = 'fel.playbook.checks.v1';

export interface DeviceCheck { best: number; passed: boolean }
export type DeviceChecks = Record<string, DeviceCheck>;

/** Keep the better of the two results for a chapter. A pass stays a pass. */
export function recordDeviceCheck(prev: DeviceChecks, chapter: number, score: number, passed: boolean): DeviceChecks {
  const key = String(chapter);
  const was = prev[key];
  const s = Math.max(0, Math.min(100, Math.round(score)));
  return { ...prev, [key]: { best: Math.max(was?.best ?? 0, s), passed: !!was?.passed || passed } };
}

type Store = Pick<Storage, 'getItem' | 'setItem'>;

export function readDeviceChecks(storage: Store | null | undefined): DeviceChecks {
  try {
    const raw = storage?.getItem(DEVICE_KEY);
    const v = raw ? JSON.parse(raw) : null;
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    const out: DeviceChecks = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      const c = x as Partial<DeviceCheck> | null;
      if (/^\d{1,2}$/.test(k) && c && typeof c.best === 'number' && typeof c.passed === 'boolean') out[k] = { best: c.best, passed: c.passed };
    }
    return out;
  } catch {
    return {};
  }
}

export function writeDeviceChecks(storage: Store | null | undefined, checks: DeviceChecks): boolean {
  try {
    if (!storage) return false;
    storage.setItem(DEVICE_KEY, JSON.stringify(checks));
    return true;
  } catch {
    return false;
  }
}
