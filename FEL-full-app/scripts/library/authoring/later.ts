// The families batches 2 and 3 add (owner decision 2026-10-25: "write batches 2–4 to reach 5,000+", in the owner's
// priority areas: basketball skills, plyometric and jump progressions, speed and agility, mobility, prehab and
// conditioning). Each family says its batch; author.ts builds each batch's families before its modifiers.
import { LATER_BASKETBALL } from './later-basketball';
import { LATER_JUMPS } from './later-jumps';
import { LATER_SPEED } from './later-speed';
import { LATER_MOBILITY } from './later-mobility';
import { LATER_PREHAB } from './later-prehab';
import type { Family } from './types';

export const LATER_BLOCKS: readonly Family[] = [...LATER_BASKETBALL, ...LATER_JUMPS, ...LATER_SPEED, ...LATER_MOBILITY, ...LATER_PREHAB];
