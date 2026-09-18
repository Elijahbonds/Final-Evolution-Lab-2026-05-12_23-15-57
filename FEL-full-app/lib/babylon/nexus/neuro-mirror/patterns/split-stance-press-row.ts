// Neuro-Mechanic Mirror (v1) — THE single supported movement pattern.
//
// v1 is gated to exactly one pattern: the split-stance press/row (brief §2 &
// acceptance criteria). No other pattern is defined here or anywhere in the
// module — adding one is explicitly out of scope for v1 (brief §6).

import { DEFAULT_THRESHOLDS, type KinematicThresholds } from '../rules/config';

/** The highlight zones this pattern surfaces on the rig (brief §2.2). */
export type ZoneId =
  | 'posterior_chain'
  | 'lat_rhomboid'
  | 'upper_traps'
  | 'rib_thoracic'
  | 'lumbo_pelvic';

export const PATTERN_ZONES: ZoneId[] = [
  'posterior_chain',
  'lat_rhomboid',
  'upper_traps',
  'rib_thoracic',
  'lumbo_pelvic',
];

/** Short, "estimated" copy per zone for the overlay legend. No clinical claims. */
export const ZONE_LABEL: Record<ZoneId, string> = {
  posterior_chain: 'Posterior chain (estimated)',
  lat_rhomboid: 'Lat / rhomboid (estimated)',
  upper_traps: 'Upper traps (estimated)',
  rib_thoracic: 'Rib / thoracic (estimated)',
  lumbo_pelvic: 'Lumbo-pelvic (estimated)',
};

export interface PatternConfig {
  id: 'split-stance-press-row';
  displayName: string;
  zones: ZoneId[];
  thresholds: KinematicThresholds;
}

export const SPLIT_STANCE_PRESS_ROW: PatternConfig = {
  id: 'split-stance-press-row',
  displayName: 'Split-stance press / row',
  zones: PATTERN_ZONES,
  thresholds: DEFAULT_THRESHOLDS,
};
