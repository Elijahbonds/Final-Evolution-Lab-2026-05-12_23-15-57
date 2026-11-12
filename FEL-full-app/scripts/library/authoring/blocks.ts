// The authored blocks, in review order. Each block is one review batch per authoring round.
import { ATHLETIC_EXTRA } from './athletic-extra';
import { BASKETBALL } from './basketball';
import { BASKETBALL_EXTRA } from './basketball-extra';
import { CONDITIONING } from './conditioning';
import { DUMBBELL_AND_SKILL } from './dumbbell-and-skill';
import { MOBILITY } from './mobility';
import { PLYO } from './plyo';
import { PREHAB } from './prehab';
import { SPEED_AGILITY } from './speed-agility';
import { STRENGTH_EXTRA } from './strength-extra';
import { STRENGTH_LOWER } from './strength-lower';
import { STRENGTH_UPPER } from './strength-upper';
import { TRUNK } from './trunk';
import { VARIETY } from './variety';
import type { Family } from './types';

export const BLOCKS: readonly (readonly Family[])[] = [
  STRENGTH_LOWER, STRENGTH_UPPER, STRENGTH_EXTRA, TRUNK, PLYO, SPEED_AGILITY, BASKETBALL, BASKETBALL_EXTRA, MOBILITY, PREHAB,
  CONDITIONING, ATHLETIC_EXTRA, VARIETY, DUMBBELL_AND_SKILL,
];
