// LOD forcing (Phase4 notes). DR-H15: while DR_Swoop_Dunk plays the active LOD is never LOD2 (its tucked D 1.222 breaks the 1.30
// contact seat's 0.10 floor margin). v5 LOD2 foot hover (up to 0.062 m on grounded clips): option (a) accept at distance, plus
// (b) force LOD0/1 while a grounded clip plays inside the hero range (PM recommendation; TUNE).
import { GROUNDED_CLIPS, type DragonClip } from './dragonRideConsts';

/** TUNE, no source yet: LOD0 under lodDistM[0], LOD1 under lodDistM[1], LOD2 beyond; grounded clips force LOD0/1 inside heroGroundedRangeM. */
export interface LodRanges { readonly lodDistM: readonly [number, number]; readonly heroGroundedRangeM: number }

export type DragonLod = 0 | 1 | 2;

export function naturalLod(distM: number, r: LodRanges): DragonLod {
  if (!(distM >= 0)) return 0;
  return distM < r.lodDistM[0] ? 0 : distM < r.lodDistM[1] ? 1 : 2;
}

/** The LOD to show for `clip` at camera distance `distM`. */
export function pickDragonLod(distM: number, clip: DragonClip, r: LodRanges): DragonLod {
  const n = naturalLod(distM, r);
  if (n !== 2) return n;
  if (clip === 'DR_Swoop_Dunk') return 1;
  if (GROUNDED_CLIPS.includes(clip) && distM <= r.heroGroundedRangeM) return 1;
  return 2;
}
