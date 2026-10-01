import { PATTERN_ZONES, type ZoneId } from '../patterns/split-stance-press-row';
import type { ZoneState } from '../rules/config';

/**
 * MIRROR-COACH P9 fix (2026-09-30): the press/row set's per-zone accounting — stable time and fault entries — read from
 * the RULES' zones (KinematicEngine's result.zones, every PATTERN_ZONES id, every frame), never from the rig's highlight
 * meshes.
 *
 * The compositor used to count inside its loop over the bound highlight capsules. When the rig does not spawn
 * (/models/candidate.glb is not in public/, so CharacterLibrary.spawn throws unless the procedural fallback is on) or a
 * zone's bone is missing, that list is empty or short, and the set's summary read 0 faults in every zone however often
 * the coach had just cued one. P9's per-set correctives block then said "every zone held" after two elbow cues, and a
 * saved press/row row carried the same zeros into the cross-session program. The meshes are paint only; the numbers
 * come from here.
 */
export interface ZoneAccounting {
  /** Stable milliseconds per zone this set. */
  readonly timeInStableMs: Record<ZoneId, number>;
  /** Entries into 'fault' per zone this set (a fault held across frames counts once). */
  readonly faultCounts: Record<ZoneId, number>;
  /** Feed one evaluated camera frame; returns every zone's state (for the HUD). */
  step(zones: Record<ZoneId, { state: ZoneState }>, dtMs: number): Record<ZoneId, ZoneState>;
}

const perZone = <T,>(v: T): Record<ZoneId, T> =>
  Object.fromEntries(PATTERN_ZONES.map((id) => [id, v])) as Record<ZoneId, T>;

export function createZoneAccounting(): ZoneAccounting {
  const timeInStableMs = perZone(0);
  const faultCounts = perZone(0);
  const prev = perZone<ZoneState>('unavailable');
  return {
    timeInStableMs,
    faultCounts,
    step(zones, dtMs) {
      const states = {} as Record<ZoneId, ZoneState>;
      for (const id of PATTERN_ZONES) {
        const state = zones[id]?.state ?? 'unavailable';
        states[id] = state;
        if (state === 'stable') timeInStableMs[id] += dtMs;
        if (state === 'fault' && prev[id] !== 'fault') faultCounts[id] += 1;
        prev[id] = state;
      }
      return states;
    },
  };
}
