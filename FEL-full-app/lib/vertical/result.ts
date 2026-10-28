// result — "what it means" for the vertical's number (VERTICAL-EASY, 2026-10-27): the change since the last one, said as
// "about the same" inside the camera's own noise. The band is profile v2's JUMP_SAME_BAND_IN (1.4 in, derived from the
// jump check's measured noise: lib/profile-v2/tiles.ts), so this line and the profile tile agree on what "better" is.
//
// Pure.
import { JUMP_SAME_BAND_IN } from '@/lib/profile-v2/tiles';
import type { JumpUnit } from '@/lib/screen/jump';
import { loadJumps } from '@/lib/jump/historyStore';

export interface VerticalChange { kind: 'up' | 'down' | 'same'; text: string }

/** Today against the last one (both cm), in the unit shown; null when there is no last one. */
export function changeOf(nowCm: number, lastCm: number | null | undefined, unit: JumpUnit): VerticalChange | null {
  if (lastCm == null || !Number.isFinite(lastCm) || !Number.isFinite(nowCm)) return null;
  const dCm = nowCm - lastCm;
  const sameCm = JUMP_SAME_BAND_IN * 2.54;
  const kind: VerticalChange['kind'] = Math.abs(dCm) < sameCm ? 'same' : dCm > 0 ? 'up' : 'down';
  const mag = unit === 'cm' ? Math.round(Math.abs(dCm)) : Math.round((Math.abs(dCm) / 2.54) * 10) / 10;
  const text = kind === 'same' ? `${unit === 'cm' ? Math.round(lastCm) : Math.round(lastCm / 2.54)} ${unit}` : `${mag} ${unit}`;
  return { kind, text };
}

/**
 * An ADULT's last live check they chose to keep on this phone (lib/jump/historyStore.ts: kept only with their own tap,
 * numbers only), for "what it means". Read only — this file writes nothing. Null with no history or closed storage.
 */
export function lastKeptCheckCm(storage: Pick<Storage, 'getItem'> | null): number | null {
  try {
    return loadJumps(storage as never).find((e) => e.test === 'check' && e.bestCm !== null)?.bestCm ?? null;   // newest first
  } catch { return null; }
}
