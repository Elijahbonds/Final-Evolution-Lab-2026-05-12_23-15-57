// lib/library/vocab.ts — EXERCISE-LIBRARY (2026-10-25): the fixed id lists every library entry is written in.
//
// Owner decisions (2026-10-25): one shared library of 5,000+ exercises — strength, plyometrics, speed and agility,
// mobility, basketball and sport skills, prehab-style work — seeded from an open public-domain list and then written in
// FEL's own words. Every list here is defined ONCE so that:
//   · the validator (scripts/library/validate.ts) can refuse an id that is not on a list;
//   · the anatomy view (a follow-up lane) can map MUSCLES[].anatomyKey onto the 3D body without guessing;
//   · search facets, the Ask parser and the coach UI all speak the same words.
// Adding an id is a one-line change here; renaming one is a data migration (every entry that uses it), so don't.
//
// Pure data. No Prisma client value, no DOM. Client-safe.

import { PATTERNS } from '@/lib/coach/catalogue';
import type { MovementPattern } from '@/lib/generated/prisma';

export { PATTERNS };
export type { MovementPattern };

// ── muscles: the fixed list the anatomy view maps ─────────────────────────────────────────────────────────────────

export interface MuscleInfo {
  id: string;
  label: string;
  region: 'upper' | 'trunk' | 'hip' | 'lower';
  /** Which side of the body model shows it best. */
  view: 'front' | 'back' | 'both';
  /** The anatomy view's mesh-region key (follow-up lane). Equal to the id today; kept separate so a mesh rename is local. */
  anatomyKey: string;
}

export const MUSCLES = [
  { id: 'neck', label: 'Neck', region: 'upper', view: 'both', anatomyKey: 'neck' },
  { id: 'traps', label: 'Upper back (traps)', region: 'upper', view: 'back', anatomyKey: 'traps' },
  { id: 'delts', label: 'Shoulders', region: 'upper', view: 'both', anatomyKey: 'delts' },
  { id: 'rear-delts', label: 'Rear shoulders', region: 'upper', view: 'back', anatomyKey: 'rear-delts' },
  { id: 'rotator-cuff', label: 'Rotator cuff', region: 'upper', view: 'back', anatomyKey: 'rotator-cuff' },
  { id: 'chest', label: 'Chest', region: 'upper', view: 'front', anatomyKey: 'chest' },
  { id: 'serratus', label: 'Serratus', region: 'upper', view: 'front', anatomyKey: 'serratus' },
  { id: 'biceps', label: 'Biceps', region: 'upper', view: 'front', anatomyKey: 'biceps' },
  { id: 'triceps', label: 'Triceps', region: 'upper', view: 'back', anatomyKey: 'triceps' },
  { id: 'forearms', label: 'Forearms and grip', region: 'upper', view: 'both', anatomyKey: 'forearms' },
  { id: 'lats', label: 'Lats', region: 'upper', view: 'back', anatomyKey: 'lats' },
  { id: 'mid-back', label: 'Mid back', region: 'upper', view: 'back', anatomyKey: 'mid-back' },
  { id: 'lower-back', label: 'Lower back', region: 'trunk', view: 'back', anatomyKey: 'lower-back' },
  { id: 'abs', label: 'Abs', region: 'trunk', view: 'front', anatomyKey: 'abs' },
  { id: 'obliques', label: 'Obliques', region: 'trunk', view: 'front', anatomyKey: 'obliques' },
  { id: 'deep-core', label: 'Deep trunk', region: 'trunk', view: 'front', anatomyKey: 'deep-core' },
  { id: 'diaphragm', label: 'Breathing muscles', region: 'trunk', view: 'front', anatomyKey: 'diaphragm' },
  { id: 'hip-flexors', label: 'Hip flexors', region: 'hip', view: 'front', anatomyKey: 'hip-flexors' },
  { id: 'glutes', label: 'Glutes', region: 'hip', view: 'back', anatomyKey: 'glutes' },
  { id: 'glute-med', label: 'Side glutes', region: 'hip', view: 'back', anatomyKey: 'glute-med' },
  { id: 'adductors', label: 'Inner thigh', region: 'hip', view: 'front', anatomyKey: 'adductors' },
  { id: 'abductors', label: 'Outer hip', region: 'hip', view: 'both', anatomyKey: 'abductors' },
  { id: 'quads', label: 'Quads', region: 'lower', view: 'front', anatomyKey: 'quads' },
  { id: 'hamstrings', label: 'Hamstrings', region: 'lower', view: 'back', anatomyKey: 'hamstrings' },
  { id: 'calves', label: 'Calves', region: 'lower', view: 'back', anatomyKey: 'calves' },
  { id: 'soleus', label: 'Lower calf (soleus)', region: 'lower', view: 'back', anatomyKey: 'soleus' },
  { id: 'tibialis', label: 'Front of the shin', region: 'lower', view: 'front', anatomyKey: 'tibialis' },
  { id: 'foot', label: 'Foot', region: 'lower', view: 'both', anatomyKey: 'foot' },
] as const satisfies readonly MuscleInfo[];

export type MuscleId = (typeof MUSCLES)[number]['id'];
export const MUSCLE_IDS: readonly MuscleId[] = MUSCLES.map((m) => m.id);
export const isMuscleId = (v: unknown): v is MuscleId => typeof v === 'string' && (MUSCLE_IDS as readonly string[]).includes(v);
export const muscleLabel = (id: string): string => MUSCLES.find((m) => m.id === id)?.label ?? id;

// ── equipment ─────────────────────────────────────────────────────────────────────────────────────────────────────

export interface EquipmentInfo { id: string; label: string; aliases: readonly string[] }

/** An entry with `equipment: []` needs nothing (bodyweight). 'other' exists only for seed rows the importer could not place. */
export const EQUIPMENT = [
  { id: 'dumbbell', label: 'Dumbbell', aliases: ['db', 'dumbbells', 'dbs'] },
  { id: 'kettlebell', label: 'Kettlebell', aliases: ['kb', 'kettlebells', 'kbs', 'bell'] },
  { id: 'barbell', label: 'Barbell', aliases: ['bb', 'bar', 'olympic bar'] },
  { id: 'trap-bar', label: 'Trap bar', aliases: ['hex bar', 'trapbar'] },
  { id: 'ez-bar', label: 'EZ bar', aliases: ['e-z curl bar', 'curl bar'] },
  { id: 'landmine', label: 'Landmine', aliases: ['landmine attachment'] },
  { id: 'cable', label: 'Cable', aliases: ['cable machine', 'pulley'] },
  { id: 'machine', label: 'Machine', aliases: ['selectorized', 'smith machine', 'leg press'] },
  { id: 'band', label: 'Long band', aliases: ['bands', 'resistance band', 'loop band', 'superband'] },
  { id: 'mini-band', label: 'Mini band', aliases: ['miniband', 'hip band', 'booty band'] },
  { id: 'medicine-ball', label: 'Medicine ball', aliases: ['med ball', 'mb', 'medball'] },
  { id: 'slam-ball', label: 'Slam ball', aliases: ['slamball'] },
  { id: 'stability-ball', label: 'Stability ball', aliases: ['swiss ball', 'exercise ball', 'physio ball'] },
  { id: 'foam-roller', label: 'Foam roller', aliases: ['foam roll', 'roller'] },
  { id: 'bench', label: 'Bench', aliases: ['flat bench', 'incline bench'] },
  { id: 'box', label: 'Box', aliases: ['plyo box', 'jump box'] },
  { id: 'step', label: 'Step', aliases: ['stair', 'stairs', 'aerobic step'] },
  { id: 'pull-up-bar', label: 'Pull-up bar', aliases: ['chin-up bar', 'chinup bar', 'pullup bar'] },
  { id: 'dip-bars', label: 'Dip bars', aliases: ['parallel bars', 'dip station'] },
  { id: 'suspension-trainer', label: 'Suspension trainer', aliases: ['straps', 'trx'] },
  { id: 'rings', label: 'Rings', aliases: ['gymnastic rings'] },
  { id: 'sled', label: 'Sled', aliases: ['prowler'] },
  { id: 'sandbag', label: 'Sandbag', aliases: ['bag'] },
  { id: 'weight-vest', label: 'Weight vest', aliases: ['vest', 'weighted vest'] },
  { id: 'plate', label: 'Weight plate', aliases: ['plates', 'bumper plate'] },
  { id: 'dowel', label: 'Dowel or stick', aliases: ['pvc pipe', 'broomstick', 'stick'] },
  { id: 'wall', label: 'Wall', aliases: [] },
  { id: 'cone', label: 'Cones', aliases: ['cones', 'markers', 'disc cones'] },
  { id: 'mini-hurdle', label: 'Mini hurdles', aliases: ['hurdles', 'hurdle'] },
  { id: 'agility-ladder', label: 'Agility ladder', aliases: ['speed ladder', 'ladder'] },
  { id: 'basketball', label: 'Basketball', aliases: ['ball', 'hoops ball'] },
  { id: 'hoop', label: 'Hoop', aliases: ['rim', 'basket', 'court'] },
  { id: 'jump-rope', label: 'Jump rope', aliases: ['skipping rope', 'rope'] },
  { id: 'bike', label: 'Bike', aliases: ['air bike', 'stationary bike', 'assault bike'] },
  { id: 'rower', label: 'Rower', aliases: ['rowing machine', 'erg'] },
  { id: 'treadmill', label: 'Treadmill', aliases: [] },
  { id: 'reaction-ball', label: 'Reaction ball', aliases: [] },
  { id: 'towel', label: 'Towel', aliases: [] },
  { id: 'slider', label: 'Sliders', aliases: ['sliders', 'gliding discs', 'valslides'] },
  { id: 'ab-wheel', label: 'Ab wheel', aliases: ['roller wheel'] },
  { id: 'mat', label: 'Mat', aliases: ['yoga mat'] },
  { id: 'strongman', label: 'Strongman implement', aliases: ['log', 'yoke', 'atlas stone', 'tire', 'keg'] },
  { id: 'other', label: 'Other', aliases: [] },
] as const satisfies readonly EquipmentInfo[];

export type EquipmentId = (typeof EQUIPMENT)[number]['id'];
export const EQUIPMENT_IDS: readonly EquipmentId[] = EQUIPMENT.map((e) => e.id);
export const isEquipmentId = (v: unknown): v is EquipmentId => typeof v === 'string' && (EQUIPMENT_IDS as readonly string[]).includes(v);
export const equipmentLabel = (id: string): string => (id === 'none' ? 'No equipment' : EQUIPMENT.find((e) => e.id === id)?.label ?? id);
/** The facet value an entry with no equipment is filed under. */
export const NO_EQUIPMENT = 'none';

// ── the other tags ────────────────────────────────────────────────────────────────────────────────────────────────

export const CATEGORIES = [
  { id: 'strength', label: 'Strength' },
  { id: 'power', label: 'Power' },
  { id: 'plyometric', label: 'Plyometrics' },
  { id: 'speed-agility', label: 'Speed and agility' },
  { id: 'sport-skill', label: 'Sport skills' },
  { id: 'core', label: 'Trunk' },
  { id: 'mobility', label: 'Mobility' },
  { id: 'prehab', label: 'Prehab' },
  { id: 'conditioning', label: 'Conditioning' },
  { id: 'recovery', label: 'Breath and recovery' },
] as const;
export type CategoryId = (typeof CATEGORIES)[number]['id'];
export const CATEGORY_IDS: readonly CategoryId[] = CATEGORIES.map((c) => c.id);

export const LEVELS = [
  { id: 'beginner', label: 'Beginner' },
  { id: 'intermediate', label: 'Intermediate' },
  { id: 'advanced', label: 'Advanced' },
] as const;
export type LevelId = (typeof LEVELS)[number]['id'];
export const LEVEL_IDS: readonly LevelId[] = LEVELS.map((l) => l.id);
export const levelRank = (l: string): number => Math.max(0, (LEVEL_IDS as readonly string[]).indexOf(l));

export const PLANES = ['sagittal', 'frontal', 'transverse', 'multi'] as const;
export type Plane = (typeof PLANES)[number];

export const LATERALITY = ['bilateral', 'unilateral', 'alternating'] as const;
export type Laterality = (typeof LATERALITY)[number];

export const SPORT_TAGS = [
  { id: 'general', label: 'General' },
  { id: 'basketball', label: 'Basketball' },
  { id: 'volleyball', label: 'Volleyball' },
  { id: 'soccer', label: 'Soccer' },
  { id: 'football', label: 'Football' },
  { id: 'track', label: 'Track' },
  { id: 'tennis', label: 'Tennis and racket' },
] as const;
export type SportTag = (typeof SPORT_TAGS)[number]['id'];
export const SPORT_TAG_IDS: readonly SportTag[] = SPORT_TAGS.map((s) => s.id);

/** What an exercise is FOR, in the words a coach or athlete searches with. The Ask parser maps questions onto these. */
export const GOALS = [
  { id: 'vertical', label: 'Vertical jump' },
  { id: 'speed', label: 'Speed' },
  { id: 'agility', label: 'Change of direction' },
  { id: 'strength', label: 'Strength' },
  { id: 'power', label: 'Power' },
  { id: 'mobility', label: 'Mobility' },
  { id: 'landing', label: 'Landing' },
  { id: 'balance', label: 'Balance' },
  { id: 'trunk', label: 'Trunk control' },
  { id: 'grip', label: 'Grip' },
  { id: 'conditioning', label: 'Conditioning' },
  { id: 'warmup', label: 'Warm-up' },
  { id: 'cooldown', label: 'Cool-down' },
  { id: 'footwork', label: 'Footwork' },
  { id: 'handles', label: 'Ball handling' },
  { id: 'finishing', label: 'Finishing' },
  { id: 'shooting', label: 'Shooting' },
  { id: 'defense', label: 'Defense' },
  { id: 'ankle', label: 'Ankles' },
  { id: 'knee', label: 'Knees' },
  { id: 'hip', label: 'Hips' },
  { id: 'shoulder', label: 'Shoulders' },
  { id: 'posture', label: 'Posture' },
  { id: 'hypertrophy', label: 'Muscle size' },
] as const;
export type GoalId = (typeof GOALS)[number]['id'];
export const GOAL_IDS: readonly GoalId[] = GOALS.map((g) => g.id);

/** Joints an exercise keeps the load LOW on — what "knee-friendly" or "easy on the back" searches mean, in movement words. */
export const JOINTS = ['knee', 'ankle', 'hip', 'back', 'shoulder', 'wrist', 'elbow'] as const;
export type Joint = (typeof JOINTS)[number];

export const SOURCES = ['seed', 'authored', 'coach-submitted'] as const;
export type SourceKind = (typeof SOURCES)[number];

export const REVIEW_STATUSES = ['draft', 'approved', 'rejected'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/** The exact words the prehab field carries (owner brief, 2026-10-25): a fact about the entry, not legal copy. */
export const PREHAB_NOTE = 'General prehab, not treatment.';

export const labelOf = (list: readonly { id: string; label: string }[], id: string): string => list.find((x) => x.id === id)?.label ?? id;
